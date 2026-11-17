import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { instruments, NUMERIC_FIELDS, type NumericField } from './feed/feed';
import { QuoteRow } from './QuoteRow';
import { connect, FIELD_COUNT, indexOfField, takeDirty, values } from './quoteStore';

type SortDir = 'asc' | 'desc';

/** Rows rendered above and below the viewport. */
const OVERSCAN = 8;
const DEFAULT_ROW_HEIGHT = 27;

const allRows = instruments.map((_, i) => i);
const lowerSymbols = instruments.map((ins) => ins.symbol.toLowerCase());

export function App() {
    const [filter, setFilter] = useState('');
    const [sortField, setSortField] = useState<NumericField | null>(null);
    const [sortDir, setSortDir] = useState<SortDir>('desc');
    const [scrollTop, setScrollTop] = useState(0);
    const [viewportHeight, setViewportHeight] = useState(800);
    const [rowHeight, setRowHeight] = useState(DEFAULT_ROW_HEIGHT);
    // Bumped once per animation frame while the feed is moving.
    const [frame, nextFrame] = useReducer((n: number) => n + 1, 0);
    const scrollRef = useRef<HTMLDivElement>(null);
    const tbodyRef = useRef<HTMLTableSectionElement>(null);

    useEffect(() => connect(), []);

    useEffect(() => {
        let raf = requestAnimationFrame(function loop(now) {
            if (takeDirty(now)) nextFrame();
            raf = requestAnimationFrame(loop);
        });
        return () => cancelAnimationFrame(raf);
    }, []);

    useLayoutEffect(() => {
        const el = scrollRef.current!;
        const ro = new ResizeObserver(() => setViewportHeight(el.clientHeight));
        ro.observe(el);
        setViewportHeight(el.clientHeight);
        return () => ro.disconnect();
    }, []);

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
        () => (needle ? allRows.filter((i) => lowerSymbols[i].includes(needle)) : allRows),
        [needle]
    );

    // The sort is recomputed every frame so the order follows live values.
    // `frame` is the signal that values moved.
    const rows = useMemo(() => {
        if (!sortField) return filtered;
        const f = indexOfField(sortField);
        const sign = sortDir === 'desc' ? -1 : 1;
        // Stable sort from instrument order, so ties keep instrument order.
        return [...filtered].sort((a, b) => sign * (values[a * FIELD_COUNT + f] - values[b * FIELD_COUNT + f]));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filtered, sortField, sortDir, frame]);

    const total = rows.length;
    const first = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN);
    const last = Math.min(total, Math.ceil((scrollTop + viewportHeight) / rowHeight) + OVERSCAN);
    const topPad = first * rowHeight;
    const bottomPad = (total - last) * rowHeight;
    const now = performance.now();

    // Use the real rendered row height so the scroll extent is exact. Measured
    // only when the viewport changes size, not every frame: reading layout
    // forces a synchronous reflow.
    const firstRowPresent = total > 0;
    useLayoutEffect(() => {
        const tr = tbodyRef.current?.querySelector<HTMLTableRowElement>('tr[data-symbol]');
        if (!tr) return;
        const h = tr.getBoundingClientRect().height;
        if (h > 0 && Math.abs(h - rowHeight) > 0.01) setRowHeight(h);
    }, [viewportHeight, firstRowPresent, rowHeight]);

    const visible = [];
    for (let k = first; k < last; k++) {
        const index = rows[k];
        visible.push(<QuoteRow key={instruments[index].symbol} instrument={instruments[index]} index={index} now={now} />);
    }

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
                <span className="count">{rows.length} instruments</span>
            </header>
            <div className="grid-scroll" ref={scrollRef} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}>
                <table className="grid">
                    <colgroup>
                        <col className="col-symbol" />
                        <col className="col-name" />
                        {NUMERIC_FIELDS.map((field) => (
                            <col key={field} className="col-num" />
                        ))}
                    </colgroup>
                    <thead>
                        <tr>
                            <th>Symbol</th>
                            <th>Name</th>
                            {NUMERIC_FIELDS.map((field) => (
                                <th
                                    key={field}
                                    data-field={field}
                                    aria-sort={sortField === field ? (sortDir === 'desc' ? 'descending' : 'ascending') : 'none'}
                                    onClick={() => toggleSort(field)}
                                >
                                    {field}
                                    {sortField === field ? (sortDir === 'desc' ? ' ▼' : ' ▲') : ''}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody ref={tbodyRef}>
                        {topPad > 0 && (
                            <tr className="spacer" aria-hidden="true" style={{ height: topPad }}>
                                <td colSpan={NUMERIC_FIELDS.length + 2} />
                            </tr>
                        )}
                        {visible}
                        {bottomPad > 0 && (
                            <tr className="spacer" aria-hidden="true" style={{ height: bottomPad }}>
                                <td colSpan={NUMERIC_FIELDS.length + 2} />
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
