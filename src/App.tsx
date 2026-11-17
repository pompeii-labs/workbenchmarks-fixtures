import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { instruments, NUMERIC_FIELDS, type NumericField } from './feed/feed';
import { connect, FIELD_COUNT, indexOfField, rowVersion, takeFrame, values } from './store';
import { QuoteRow } from './QuoteRow';

type SortDir = 'asc' | 'desc';

// Rows rendered beyond the visible window on each side.
const OVERSCAN = 12;
const DEFAULT_ROW_HEIGHT = 27;

const lowerSymbols = instruments.map((i) => i.symbol.toLowerCase());

function sortRows(rows: number[], field: NumericField, dir: SortDir): number[] {
    const f = indexOfField(field);
    const sign = dir === 'desc' ? -1 : 1;
    // Ties keep instrument order, as the old stable sort did.
    return [...rows].sort((a, b) => sign * (values[a * FIELD_COUNT + f] - values[b * FIELD_COUNT + f]) || a - b);
}

export function App() {
    const [filter, setFilter] = useState('');
    const [sortField, setSortField] = useState<NumericField | null>(null);
    const [sortDir, setSortDir] = useState<SortDir>('desc');
    // Bumped once per frame when the feed changed something on screen.
    const [, setFrame] = useState(0);
    // Bumped when the sort field's values moved, to re-sort.
    const [sortVersion, setSortVersion] = useState(0);
    const [scrollTop, setScrollTop] = useState(0);
    const [viewport, setViewport] = useState(1000);
    const [rowHeight, setRowHeight] = useState(DEFAULT_ROW_HEIGHT);

    const scrollRef = useRef<HTMLDivElement>(null);
    const sortFieldRef = useRef(-1);
    sortFieldRef.current = sortField ? indexOfField(sortField) : -1;

    useEffect(() => connect(), []);

    useEffect(() => {
        let raf = 0;
        const loop = (now: number) => {
            const { changed, sortFieldChanged } = takeFrame(now, sortFieldRef.current);
            if (changed) setFrame((n) => n + 1);
            if (sortFieldChanged) setSortVersion((n) => n + 1);
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, []);

    useLayoutEffect(() => {
        const el = scrollRef.current!;
        const ro = new ResizeObserver(() => setViewport(el.clientHeight));
        ro.observe(el);
        setViewport(el.clientHeight);
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
    const filtered = useMemo(() => {
        const out: number[] = [];
        for (let i = 0; i < lowerSymbols.length; i++) if (!needle || lowerSymbols[i].includes(needle)) out.push(i);
        return out;
    }, [needle]);

    const rows = useMemo(
        () => (sortField ? sortRows(filtered, sortField, sortDir) : filtered),
        // sortVersion re-sorts as the sorted field's values move.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [filtered, sortField, sortDir, sortVersion]
    );

    // Virtual window: only rows near the viewport are in the DOM; spacer rows
    // keep the full board's height so every instrument is reachable by scrolling.
    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN);
    const end = Math.min(rows.length, Math.ceil((scrollTop + viewport) / rowHeight) + OVERSCAN);
    const topPad = start * rowHeight;
    const bottomPad = (rows.length - end) * rowHeight;

    const measureRow = useCallback((el: HTMLTableRowElement | null) => {
        if (!el) return;
        const h = el.getBoundingClientRect().height;
        if (h > 0) setRowHeight((prev) => (Math.abs(prev - h) > 0.01 ? h : prev));
    }, []);

    const visible = [];
    for (let k = start; k < end; k++) {
        const index = rows[k];
        visible.push(
            <QuoteRow
                key={instruments[index].symbol}
                ref={k === start ? measureRow : undefined}
                instrument={instruments[index]}
                row={index}
                version={rowVersion[index]}
            />
        );
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
                    <tbody>
                        {topPad > 0 && <tr className="spacer" aria-hidden="true" style={{ height: topPad }} />}
                        {visible}
                        {bottomPad > 0 && <tr className="spacer" aria-hidden="true" style={{ height: bottomPad }} />}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
