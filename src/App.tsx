import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { instruments, NUMERIC_FIELDS, ROWS, type NumericField } from './feed/feed';
import { FIELD_COUNT, FIELD_INDEX, startFeed, values } from './store';
import { QuoteRow } from './QuoteRow';

type SortDir = 'asc' | 'desc';

const ROW_H = 28;
const OVERSCAN = 5;
const COL_COUNT = NUMERIC_FIELDS.length + 2;

interface View {
    indices: number[];
    total: number;
    padTop: number;
    padBottom: number;
}

export function App() {
    const [filter, setFilter] = useState('');
    const [sortField, setSortField] = useState<NumericField | null>(null);
    const [sortDir, setSortDir] = useState<SortDir>('desc');
    const [, setFrame] = useState(0);

    const scrollRef = useRef<HTMLDivElement>(null);
    const controls = useRef({ needle: '', sortField: null as NumericField | null, sortDir: 'desc' as SortDir });
    const filtered = useRef<{ needle: string; list: number[] }>({
        needle: '',
        list: Array.from({ length: ROWS }, (_, i) => i),
    });
    const order = useRef<number[]>([]);
    const view = useRef<View>({ indices: [], total: ROWS, padTop: 0, padBottom: ROWS * ROW_H });

    useEffect(() => {
        const stopFeed = startFeed();
        let raf = 0;
        const paint = () => {
            raf = requestAnimationFrame(paint);
            const el = scrollRef.current;
            if (!el) return;
            const c = controls.current;
            if (filtered.current.needle !== c.needle) {
                const list: number[] = [];
                for (let i = 0; i < ROWS; i++) {
                    if (!c.needle || instruments[i].symbol.toLowerCase().includes(c.needle)) list.push(i);
                }
                filtered.current = { needle: c.needle, list };
            }
            let list = filtered.current.list;
            if (c.sortField) {
                const off = FIELD_INDEX[c.sortField];
                const sign = c.sortDir === 'desc' ? -1 : 1;
                const sorted = order.current;
                sorted.length = 0;
                for (let k = 0; k < list.length; k++) sorted.push(list[k]);
                sorted.sort((a, b) => sign * (values[a * FIELD_COUNT + off] - values[b * FIELD_COUNT + off]));
                list = sorted;
            }
            const total = list.length;
            const visible = Math.ceil(el.clientHeight / ROW_H);
            const windowSize = visible + OVERSCAN * 2;
            let first = Math.floor(el.scrollTop / ROW_H) - OVERSCAN;
            const maxFirst = Math.max(0, total - windowSize);
            if (first > maxFirst) first = maxFirst;
            if (first < 0) first = 0;
            const last = Math.min(total, first + windowSize);
            view.current = {
                indices: list.slice(first, last),
                total,
                padTop: first * ROW_H,
                padBottom: (total - last) * ROW_H,
            };
            flushSync(() => setFrame((f) => f + 1));
        };
        raf = requestAnimationFrame(paint);
        return () => {
            cancelAnimationFrame(raf);
            stopFeed();
        };
    }, []);

    function toggleSort(field: NumericField) {
        const c = controls.current;
        if (c.sortField === field) {
            c.sortDir = c.sortDir === 'desc' ? 'asc' : 'desc';
        } else {
            c.sortField = field;
            c.sortDir = 'desc';
        }
        setSortField(c.sortField);
        setSortDir(c.sortDir);
    }

    function onFilter(value: string) {
        controls.current.needle = value.trim().toLowerCase();
        setFilter(value);
    }

    const v = view.current;
    const now = performance.now();

    return (
        <div className="app">
            <header className="toolbar">
                <h1>Tickerboard</h1>
                <input
                    name="filter"
                    placeholder="Filter symbols"
                    value={filter}
                    onChange={(e) => onFilter(e.target.value)}
                />
                <span className="count">{v.total} instruments</span>
            </header>
            <div className="grid-scroll" ref={scrollRef}>
                <table className="grid">
                    <colgroup>
                        <col style={{ width: 90 }} />
                        <col style={{ width: 170 }} />
                        {NUMERIC_FIELDS.map((field) => (
                            <col key={field} style={{ width: 92 }} />
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
                    <tbody>
                        <tr aria-hidden="true" style={{ height: v.padTop }}>
                            <td colSpan={COL_COUNT} style={{ height: v.padTop, padding: 0, border: 0 }} />
                        </tr>
                        {v.indices.map((row) => (
                            <QuoteRow key={instruments[row].symbol} row={row} now={now} />
                        ))}
                        <tr aria-hidden="true" style={{ height: v.padBottom }}>
                            <td colSpan={COL_COUNT} style={{ height: v.padBottom, padding: 0, border: 0 }} />
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
}