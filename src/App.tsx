import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { instruments, NUMERIC_FIELDS, ROWS, type NumericField } from './feed/feed';
import { QuoteRow } from './QuoteRow';
import { connect, FIELD_COUNT, fieldDirty, fieldIndex, flashClass, takeDirtyRows, values } from './quoteStore';

export type { Quote } from './QuoteRow';
type SortDir = 'asc' | 'desc';

const lowerSymbols = instruments.map((i) => i.symbol.toLowerCase());
const ALL_ROWS = instruments.map((_, i) => i);

export function App() {
    const [filter, setFilter] = useState('');
    const [sortField, setSortField] = useState<NumericField | null>(null);
    const [sortDir, setSortDir] = useState<SortDir>('desc');

    function toggleSort(field: NumericField) {
        if (sortField === field) {
            setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
        } else {
            setSortField(field);
            setSortDir('desc');
        }
    }

    const needle = filter.trim().toLowerCase();
    const filtered = useMemo(
        () => (needle ? ALL_ROWS.filter((i) => lowerSymbols[i].includes(needle)) : ALL_ROWS),
        [needle]
    );

    return (
        <div className="app">
            <header className="toolbar">
                <h1>Tickerboard</h1>
                <input
                    name="filter"
                    placeholder="Filter symbols"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                />
                <span className="count">{filtered.length} instruments</span>
            </header>
            <Board rows={filtered} sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
        </div>
    );
}

/** Rows rendered above and below the viewport. */
const OVERSCAN = 8;

function sortRows(order: number[], field: NumericField, dir: SortDir) {
    const f = fieldIndex(field);
    const sign = dir === 'desc' ? -1 : 1;
    // Ties keep instrument order, as the stable sort of the original list did.
    // Re-sorting the previous order each frame is cheap: it is nearly sorted.
    order.sort((a, b) => {
        const d = values[a * FIELD_COUNT + f] - values[b * FIELD_COUNT + f];
        return d !== 0 ? sign * d : a - b;
    });
}

/** Bitmask of a row's flashing cells: low 18 bits up, next 18 bits down. */
function flashMask(row: number, now: number) {
    let up = 0;
    let down = 0;
    const base = row * FIELD_COUNT;
    for (let f = 0; f < FIELD_COUNT; f++) {
        const c = flashClass(base + f, now);
        if (c === 'flash-up') up |= 1 << f;
        else if (c === 'flash-down') down |= 1 << f;
    }
    return up + down * 2 ** FIELD_COUNT;
}

/**
 * The quote grid. All instruments are in the scrollable table, but only the
 * rows in (and near) the viewport are mounted; spacer rows stand in for the
 * rest so the scrollbar covers the full board. Once per animation frame it
 * folds in the feed's changes, keeps a live sort current, and re-renders the
 * visible rows whose values or flash state changed.
 */
function Board({
    rows,
    sortField,
    sortDir,
    onSort,
}: {
    rows: number[];
    sortField: NumericField | null;
    sortDir: SortDir;
    onSort: (field: NumericField) => void;
}) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [, setFrame] = useState(0);

    const st = useRef({
        order: [] as number[],
        orderFor: null as null | { rows: number[]; sortField: NumericField | null; sortDir: SortDir },
        rowH: 27,
        headH: 30,
        measured: false,
        scrollTop: 0,
        viewH: 900,
        now: performance.now(),
        rev: new Uint32Array(ROWS),
        renderedRev: new Uint32Array(ROWS),
        mask: new Float64Array(ROWS),
        start: 0,
        end: 0,
    }).current;

    // Recompute the order synchronously when filter or sort changes, so a
    // header click repaints in the same frame.
    const key = st.orderFor;
    if (!key || key.rows !== rows || key.sortField !== sortField || key.sortDir !== sortDir) {
        st.order = rows.slice();
        if (sortField) sortRows(st.order, sortField, sortDir);
        st.orderFor = { rows, sortField, sortDir };
    }
    const sortRef = useRef({ sortField, sortDir });
    sortRef.current = { sortField, sortDir };

    const windowFor = useCallback(() => {
        const n = st.order.length;
        const top = st.scrollTop - st.headH;
        const start = Math.max(0, Math.min(n, Math.floor(top / st.rowH) - OVERSCAN));
        const end = Math.max(start, Math.min(n, Math.ceil((top + st.viewH) / st.rowH) + OVERSCAN));
        return [start, end] as const;
    }, [st]);

    st.now = performance.now();
    const [start, end] = windowFor();
    st.start = start;
    st.end = end;
    const visible = st.order.slice(start, end);

    useLayoutEffect(() => {
        for (const row of visible) st.renderedRev[row] = st.rev[row];
    });

    useEffect(() => connect(), []);

    useEffect(() => {
        let raf = 0;
        const frame = () => {
            raf = requestAnimationFrame(frame);
            const el = scrollRef.current;
            if (!el) return;
            const now = performance.now();
            st.now = now;

            if (!st.measured) {
                const tr = el.querySelector<HTMLElement>('tbody tr[data-symbol]');
                const head = el.querySelector<HTMLElement>('thead');
                if (tr && head && tr.offsetHeight > 0) {
                    st.rowH = tr.getBoundingClientRect().height;
                    st.headH = head.getBoundingClientRect().height;
                    st.measured = true;
                }
            }

            const dirty = takeDirtyRows();
            for (let k = 0; k < dirty.length; k++) st.rev[dirty[k]]++;

            let changed = false;
            const { sortField: sf, sortDir: sd } = sortRef.current;
            if (sf && fieldDirty[fieldIndex(sf)]) {
                sortRows(st.order, sf, sd);
                changed = true;
            }
            fieldDirty.fill(0);

            st.scrollTop = el.scrollTop;
            st.viewH = el.clientHeight;
            const [s, e] = windowFor();
            if (s !== st.start || e !== st.end) changed = true;

            for (let i = s; i < e; i++) {
                const row = st.order[i];
                const m = flashMask(row, now);
                if (m !== st.mask[row]) {
                    st.mask[row] = m;
                    st.rev[row]++;
                }
                if (st.rev[row] !== st.renderedRev[row]) changed = true;
            }

            if (changed) flushSync(() => setFrame((x) => x + 1));
        };
        raf = requestAnimationFrame(frame);
        return () => cancelAnimationFrame(raf);
    }, [st, windowFor]);

    const n = st.order.length;
    const cols = 2 + NUMERIC_FIELDS.length;
    return (
        <div className="grid-scroll" ref={scrollRef}>
            <table className="grid">
                <thead>
                    <tr>
                        <th>Symbol</th>
                        <th>Name</th>
                        {NUMERIC_FIELDS.map((field) => (
                            <th
                                key={field}
                                data-field={field}
                                aria-sort={sortField === field ? (sortDir === 'desc' ? 'descending' : 'ascending') : 'none'}
                                onClick={() => onSort(field)}
                            >
                                {field}
                                {sortField === field ? (sortDir === 'desc' ? ' ▼' : ' ▲') : ''}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {start > 0 && (
                        <tr className="spacer" aria-hidden="true">
                            <td colSpan={cols} style={{ height: start * st.rowH }} />
                        </tr>
                    )}
                    {visible.map((row) => (
                        <QuoteRow
                            key={row}
                            instrument={instruments[row]}
                            row={row}
                            rev={st.rev[row]}
                            now={st.now}
                        />
                    ))}
                    {end < n && (
                        <tr className="spacer" aria-hidden="true">
                            <td colSpan={cols} style={{ height: (n - end) * st.rowH }} />
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}
