import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { instruments, NUMERIC_FIELDS, ROWS, type NumericField } from './feed/feed';
import { QuoteRow } from './QuoteRow';
import { FIELD_COUNT, getVersion, subscribeFrame, values } from './store';

type SortDir = 'asc' | 'desc';

const ROW_HEIGHT = 26;
const OVERSCAN = 6;
const COLUMN_COUNT = NUMERIC_FIELDS.length + 2;
const LOWER_SYMBOLS = instruments.map((instrument) => instrument.symbol.toLowerCase());
const ALL_INDICES = Array.from({ length: ROWS }, (_, i) => i);

export function App() {
    useSyncExternalStore(subscribeFrame, getVersion);
    const [filter, setFilter] = useState('');
    const [sortField, setSortField] = useState<NumericField | null>(null);
    const [sortDir, setSortDir] = useState<SortDir>('desc');
    const [scrollTop, setScrollTop] = useState(0);
    const [viewportHeight, setViewportHeight] = useState(600);
    const scrollRef = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const measure = () => setViewportHeight(el.clientHeight);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    function toggleSort(field: NumericField) {
        if (sortField === field) {
            setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
        } else {
            setSortField(field);
            setSortDir('desc');
        }
    }

    const now = performance.now();
    const needle = filter.trim().toLowerCase();
    let indices: number[];
    if (needle) {
        indices = [];
        for (let i = 0; i < ROWS; i++) {
            if (LOWER_SYMBOLS[i].includes(needle)) indices.push(i);
        }
    } else {
        indices = ALL_INDICES;
    }
    if (sortField) {
        const fieldIndex = NUMERIC_FIELDS.indexOf(sortField);
        const sign = sortDir === 'desc' ? -1 : 1;
        if (indices === ALL_INDICES) indices = ALL_INDICES.slice();
        indices.sort((a, b) => sign * (values[a * FIELD_COUNT + fieldIndex] - values[b * FIELD_COUNT + fieldIndex]));
    }

    const total = indices.length;
    const start = Math.min(Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN), Math.max(0, total - 1));
    const end = Math.min(total, Math.max(start, Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN));
    const topSpace = start * ROW_HEIGHT;
    const bottomSpace = (total - end) * ROW_HEIGHT;

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
                <span className="count">{total} instruments</span>
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
                        {topSpace > 0 && (
                            <tr aria-hidden="true" style={{ height: topSpace }}>
                                <td colSpan={COLUMN_COUNT} style={{ height: topSpace, padding: 0, border: 0 }} />
                            </tr>
                        )}
                        {indices.slice(start, end).map((index) => (
                            <QuoteRow key={instruments[index].symbol} index={index} now={now} />
                        ))}
                        {bottomSpace > 0 && (
                            <tr aria-hidden="true" style={{ height: bottomSpace }}>
                                <td colSpan={COLUMN_COUNT} style={{ height: bottomSpace, padding: 0, border: 0 }} />
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}