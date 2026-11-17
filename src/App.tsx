import { useEffect, useRef, useState } from 'react';
import { instruments, NUMERIC_FIELDS, ROWS, type NumericField } from './feed/feed';
import { QuoteRow } from './QuoteRow';
import { FIELD_COUNT, fieldIndex, flashActive, start, stop, takeDirty, values } from './store';

type SortDir = 'asc' | 'desc';
const OVERSCAN = 6;
const DEFAULT_ROW_H = 26;
const SPAN = 2 + NUMERIC_FIELDS.length;

export function App() {
    const [filter, setFilter] = useState('');
    const [sortField, setSortField] = useState<NumericField | null>(null);
    const [sortDir, setSortDir] = useState<SortDir>('desc');
    const [, setVersion] = useState(0);

    const scrollRef = useRef<HTMLDivElement | null>(null);
    const initRef = useRef(false);
    const filteredRef = useRef<number[]>([]);
    const orderRef = useRef<number[]>([]);
    const winRef = useRef({ first: 0, last: 0 });
    const rowHRef = useRef(DEFAULT_ROW_H);
    const measuredRef = useRef(false);
    const forceRef = useRef(true);
    const stateRef = useRef({ needle: '', sortField: null as NumericField | null, sortDir: 'desc' as SortDir });
    const lastRef = useRef({ needle: '', sortField: null as NumericField | null, sortDir: 'desc' as SortDir, scrollTop: -1, orderLen: -1 });

    const needle = filter.trim().toLowerCase();
    stateRef.current = { needle, sortField, sortDir };

    if (!initRef.current) {
        const all: number[] = [];
        for (let i = 0; i < ROWS; i++) all.push(i);
        filteredRef.current = all;
        orderRef.current = all;
        initRef.current = true;
    }

    function toggleSort(field: NumericField) {
        if (sortField === field) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
        else {
            setSortField(field);
            setSortDir('desc');
        }
        forceRef.current = true;
    }

    useEffect(() => {
        start();
        let raf = 0;
        const loop = () => {
            raf = requestAnimationFrame(loop);
            const el = scrollRef.current;
            if (!el) return;
            const now = performance.now();
            const st = stateRef.current;
            const last = lastRef.current;
            const valuesChanged = takeDirty();

            if (!measuredRef.current) {
                const tr = el.querySelector('tr[data-symbol]');
                if (tr) {
                    const h = tr.getBoundingClientRect().height;
                    if (h > 0) {
                        rowHRef.current = h;
                        measuredRef.current = true;
                    }
                }
            }

            let orderChanged = false;
            if (st.needle !== last.needle) {
                const n = st.needle;
                const arr: number[] = [];
                for (let i = 0; i < ROWS; i++) {
                    if (!n || instruments[i].symbol.toLowerCase().includes(n)) arr.push(i);
                }
                filteredRef.current = arr;
                orderChanged = true;
            }
            const sortChanged = st.sortField !== last.sortField || st.sortDir !== last.sortDir;
            if (st.sortField) {
                if (valuesChanged || sortChanged || orderChanged || forceRef.current) {
                    const f = fieldIndex[st.sortField];
                    const sign = st.sortDir === 'desc' ? -1 : 1;
                    const arr = filteredRef.current.slice();
                    arr.sort((a, b) => sign * (values[a * FIELD_COUNT + f] - values[b * FIELD_COUNT + f]) || a - b);
                    orderRef.current = arr;
                    orderChanged = true;
                }
            } else if (orderChanged || sortChanged || forceRef.current) {
                orderRef.current = filteredRef.current;
                orderChanged = true;
            }

            const order = orderRef.current;
            const total = order.length;
            const rowH = rowHRef.current;
            const scrollTop = el.scrollTop;
            const clientH = el.clientHeight;
            let first = Math.floor(scrollTop / rowH) - OVERSCAN;
            let lastIdx = Math.ceil((scrollTop + clientH) / rowH) + OVERSCAN;
            first = Math.max(0, Math.min(first, total));
            lastIdx = Math.max(first, Math.min(lastIdx, total));
            const win = winRef.current;
            const windowChanged = first !== win.first || lastIdx !== win.last;
            const scrollChanged = scrollTop !== last.scrollTop;

            if (valuesChanged || orderChanged || windowChanged || scrollChanged || flashActive(now) || forceRef.current || total !== last.orderLen) {
                winRef.current = { first, last: lastIdx };
                lastRef.current = { needle: st.needle, sortField: st.sortField, sortDir: st.sortDir, scrollTop, orderLen: total };
                forceRef.current = false;
                setVersion((v) => v + 1);
            } else {
                lastRef.current = { needle: st.needle, sortField: st.sortField, sortDir: st.sortDir, scrollTop, orderLen: total };
            }
        };
        raf = requestAnimationFrame(loop);
        return () => {
            cancelAnimationFrame(raf);
            stop();
        };
    }, []);

    const order = orderRef.current;
    const { first, last } = winRef.current;
    const total = order.length;
    const rowH = rowHRef.current;
    const topH = first * rowH;
    const botH = Math.max(0, (total - last) * rowH);
    const rows = [];
    for (let k = first; k < last; k++) {
        const row = order[k];
        if (row === undefined) continue;
        rows.push(<QuoteRow key={instruments[row].symbol} row={row} />);
    }

    return (
        <div className="app">
            <header className="toolbar">
                <h1>Tickerboard</h1>
                <input
                    name="filter"
                    placeholder="Filter symbols"
                    value={filter}
                    onChange={(e) => {
                        setFilter(e.target.value);
                        forceRef.current = true;
                    }}
                />
                <span className="count">{total} instruments</span>
            </header>
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
                                    onClick={() => toggleSort(field)}
                                >
                                    {field}
                                    {sortField === field ? (sortDir === 'desc' ? ' ▼' : ' ▲') : ''}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {topH > 0 && (
                            <tr className="spacer" aria-hidden="true">
                                <td colSpan={SPAN} style={{ height: topH, padding: 0, borderBottom: 'none' }} />
                            </tr>
                        )}
                        {rows}
                        {botH > 0 && (
                            <tr className="spacer" aria-hidden="true">
                                <td colSpan={SPAN} style={{ height: botH, padding: 0, borderBottom: 'none' }} />
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}