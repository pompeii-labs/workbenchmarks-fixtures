import { useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { instruments, NUMERIC_FIELDS, ROWS, type NumericField } from './feed/feed';
import { QuoteRow } from './QuoteRow';
import { getValue, getVersion, subscribeToStore } from './store';

type SortDir = 'asc' | 'desc';

const ROW_HEIGHT = 27;
const HEADER_HEIGHT = 31;
const OVERSCAN = 6;
const COLUMN_COUNT = 2 + NUMERIC_FIELDS.length;

export function App() {
    const version = useSyncExternalStore(subscribeToStore, getVersion);
    const [filter, setFilter] = useState('');
    const [sortField, setSortField] = useState<NumericField | null>(null);
    const [sortDir, setSortDir] = useState<SortDir>('desc');
    const [scrollTop, setScrollTop] = useState(0);
    const [viewportHeight, setViewportHeight] = useState(600);
    const scrollRef = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const observer = new ResizeObserver(() => setViewportHeight(el.clientHeight));
        observer.observe(el);
        setViewportHeight(el.clientHeight);
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

    const filtered = useMemo(() => {
        const needle = filter.trim().toLowerCase();
        const out: number[] = [];
        for (let i = 0; i < ROWS; i++) {
            if (!needle || instruments[i].symbol.toLowerCase().includes(needle)) out.push(i);
        }
        return out;
    }, [filter]);

    const sorted = useMemo(() => {
        if (!sortField) return filtered;
        const f = NUMERIC_FIELDS.indexOf(sortField);
        const sign = sortDir === 'desc' ? -1 : 1;
        const out = filtered.slice();
        out.sort((a, b) => sign * (getValue(a, f) - getValue(b, f)));
        return out;
    }, [filtered, sortField, sortDir, version]);

    const total = sorted.length;
    const bodyTop = scrollTop - HEADER_HEIGHT;
    const start = Math.max(0, Math.floor(bodyTop / ROW_HEIGHT) - OVERSCAN);
    const end = Math.min(total, Math.ceil((bodyTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN);
    const visible = sorted.slice(start, end);

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
                        {start > 0 && (
                            <tr className="spacer" aria-hidden="true" style={{ height: start * ROW_HEIGHT }}>
                                <td colSpan={COLUMN_COUNT} style={{ height: start * ROW_HEIGHT }} />
                            </tr>
                        )}
                        {visible.map((rowIndex) => (
                            <QuoteRow key={instruments[rowIndex].symbol} rowIndex={rowIndex} />
                        ))}
                        {end < total && (
                            <tr className="spacer" aria-hidden="true" style={{ height: (total - end) * ROW_HEIGHT }}>
                                <td colSpan={COLUMN_COUNT} style={{ height: (total - end) * ROW_HEIGHT }} />
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}