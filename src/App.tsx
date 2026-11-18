import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type UIEvent } from 'react';
import { instruments, NUMERIC_FIELDS, type NumericField } from './feed/feed';
import { fieldIndexOf, getBoardVersion, getValue, retainFeed, subscribeBoard } from './store';
import { QuoteRow } from './QuoteRow';

type SortDir = 'asc' | 'desc';

const LOWER_SYMBOLS = instruments.map((i) => i.symbol.toLowerCase());
const ALL_INDICES = instruments.map((_, i) => i);
const ROW_HEIGHT = 27;
const OVERSCAN = 8;
const COL_SPAN = 2 + NUMERIC_FIELDS.length;
const COL_SYMBOL = 82;
const COL_NAME = 130;
const COL_NUM = 74;
const TABLE_WIDTH = COL_SYMBOL + COL_NAME + NUMERIC_FIELDS.length * COL_NUM;

export function App() {
    const [filter, setFilter] = useState('');
    const [sortField, setSortField] = useState<NumericField | null>(null);
    const [sortDir, setSortDir] = useState<SortDir>('desc');
    const [scrollTop, setScrollTop] = useState(0);
    const [viewportH, setViewportH] = useState(0);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => retainFeed(), []);

    useLayoutEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const measure = () => setViewportH(el.clientHeight);
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const onScroll = useCallback((e: UIEvent<HTMLDivElement>) => setScrollTop(e.currentTarget.scrollTop), []);

    function toggleSort(field: NumericField) {
        if (sortField === field) {
            setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
        } else {
            setSortField(field);
            setSortDir('desc');
        }
    }

    const needle = filter.trim().toLowerCase();
    const filteredIndices = useMemo(() => {
        if (!needle) return ALL_INDICES;
        const out: number[] = [];
        for (let i = 0; i < LOWER_SYMBOLS.length; i++) if (LOWER_SYMBOLS[i].includes(needle)) out.push(i);
        return out;
    }, [needle]);

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
                <span className="count">{filteredIndices.length} instruments</span>
            </header>
            <div className="grid-scroll" ref={scrollRef} onScroll={onScroll}>
                <table className="grid" style={{ width: TABLE_WIDTH }}>
                    <colgroup>
                        <col style={{ width: COL_SYMBOL }} />
                        <col style={{ width: COL_NAME }} />
                        {NUMERIC_FIELDS.map((field) => (
                            <col key={field} style={{ width: COL_NUM }} />
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
                    <Board
                        filteredIndices={filteredIndices}
                        sortField={sortField}
                        sortDir={sortDir}
                        scrollTop={scrollTop}
                        viewportH={viewportH}
                    />
                </table>
            </div>
        </div>
    );
}

function Board({ filteredIndices, sortField, sortDir, scrollTop, viewportH }: { filteredIndices: number[]; sortField: NumericField | null; sortDir: SortDir; scrollTop: number; viewportH: number }) {
    const version = useSyncExternalStore(subscribeBoard, getBoardVersion);

    const order = useMemo(() => {
        if (!sortField) return filteredIndices;
        const fi = fieldIndexOf(sortField);
        const sign = sortDir === 'desc' ? -1 : 1;
        return [...filteredIndices].sort((a, b) => sign * (getValue(a, fi) - getValue(b, fi)));
    }, [filteredIndices, sortField, sortDir, version]);

    const n = order.length;
    const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
    const end = Math.min(n, Math.ceil((scrollTop + viewportH) / ROW_HEIGHT) + OVERSCAN);
    const topPad = start * ROW_HEIGHT;
    const bottomPad = Math.max(0, (n - end) * ROW_HEIGHT);

    const slice = useMemo(() => order.slice(start, end), [order, start, end]);
    const rows = useMemo(
        () => slice.map((i) => <QuoteRow key={instruments[i].symbol} instrument={instruments[i]} rowIndex={i} />),
        [slice],
    );

    return (
        <tbody>
            {topPad > 0 && (
                <tr aria-hidden="true" style={{ height: topPad }}>
                    <td colSpan={COL_SPAN} style={{ height: topPad, padding: 0, border: 0 }} />
                </tr>
            )}
            {rows}
            {bottomPad > 0 && (
                <tr aria-hidden="true" style={{ height: bottomPad }}>
                    <td colSpan={COL_SPAN} style={{ height: bottomPad, padding: 0, border: 0 }} />
                </tr>
            )}
        </tbody>
    );
}
