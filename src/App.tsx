import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { instruments, NUMERIC_FIELDS, ROWS, snapshot, subscribe, type NumericField } from './feed/feed';
import { QuoteRow } from './QuoteRow';

export type Quote = Record<NumericField, number>;
type SortDir = 'asc' | 'desc';

const FIELD_COUNT = NUMERIC_FIELDS.length;
const FIELD_INDEX = Object.fromEntries(NUMERIC_FIELDS.map((f, i) => [f, i])) as Record<NumericField, number>;
const OVERSCAN = 8;
const FALLBACK_FLUSH_MS = 100;

export interface QuoteStore {
    quotes: Quote[];
    versions: number[];
    flash: Int8Array;
}

function createStore(): QuoteStore {
    return {
        quotes: snapshot(),
        versions: new Array<number>(ROWS).fill(0),
        flash: new Int8Array(ROWS * FIELD_COUNT),
    };
}

export function App() {
    const storeRef = useRef<QuoteStore | null>(null);
    if (!storeRef.current) storeRef.current = createStore();
    const store = storeRef.current;

    const [, setFrame] = useState(0);
    const [filter, setFilter] = useState('');
    const [sortField, setSortField] = useState<NumericField | null>(null);
    const [sortDir, setSortDir] = useState<SortDir>('desc');
    const [scrollTop, setScrollTop] = useState(0);
    const [viewportH, setViewportH] = useState(600);
    const [rowH, setRowH] = useState(26);
    const scrollRef = useRef<HTMLDivElement>(null);
    const bodyRef = useRef<HTMLTableSectionElement>(null);

    useEffect(() => {
        let raf = 0;
        let fallback: ReturnType<typeof setTimeout> | undefined;
        const flush = () => {
            if (raf) {
                cancelAnimationFrame(raf);
                raf = 0;
            }
            if (fallback) {
                clearTimeout(fallback);
                fallback = undefined;
            }
            setFrame((f) => f + 1);
        };
        const schedule = () => {
            if (!raf) raf = requestAnimationFrame(flush);
            if (!fallback) fallback = setTimeout(flush, FALLBACK_FLUSH_MS);
        };
        const unsubscribe = subscribe((message) => {
            const quote = store.quotes[message.row];
            const old = quote[message.field];
            if (message.value === old) return;
            quote[message.field] = message.value;
            store.versions[message.row]++;
            store.flash[message.row * FIELD_COUNT + FIELD_INDEX[message.field]] = message.value > old ? 1 : -1;
            schedule();
        });
        return () => {
            unsubscribe();
            if (raf) cancelAnimationFrame(raf);
            if (fallback) clearTimeout(fallback);
        };
    }, [store]);

    useLayoutEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        setViewportH(el.clientHeight);
        const observer = new ResizeObserver(() => setViewportH(el.clientHeight));
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    useLayoutEffect(() => {
        const body = bodyRef.current;
        if (!body) return;
        const rows = body.querySelectorAll<HTMLTableRowElement>('tr[data-symbol]');
        if (rows.length === 0) return;
        const measured = rows.length > 1 ? rows[1].offsetTop - rows[0].offsetTop : rows[0].offsetHeight;
        if (measured > 0) setRowH((prev) => (prev === measured ? prev : measured));
    });

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
        for (let i = 0; i < ROWS; i++) {
            if (!needle || instruments[i].symbol.toLowerCase().includes(needle)) out.push(i);
        }
        return out;
    }, [needle]);

    const order = sortField
        ? [...filtered].sort((a, b) => {
              const sign = sortDir === 'desc' ? -1 : 1;
              return sign * (store.quotes[a][sortField] - store.quotes[b][sortField]);
          })
        : filtered;

    const total = order.length;
    const start = Math.max(0, Math.min(Math.floor(scrollTop / rowH) - OVERSCAN, total));
    const end = Math.max(start, Math.min(total, Math.ceil((scrollTop + viewportH) / rowH) + OVERSCAN));
    const topPad = start * rowH;
    const bottomPad = (total - end) * rowH;
    const visible = order.slice(start, end);

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
                    <colgroup>
                        <col style={{ width: 90 }} />
                        <col style={{ width: 180 }} />
                        {NUMERIC_FIELDS.map((field) => (
                            <col key={field} style={{ width: 88 }} />
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
                    <tbody ref={bodyRef}>
                        {topPad > 0 && (
                            <tr aria-hidden="true" className="spacer">
                                <td colSpan={FIELD_COUNT + 2} style={{ height: topPad }} />
                            </tr>
                        )}
                        {visible.map((index) => (
                            <QuoteRow
                                key={instruments[index].symbol}
                                instrument={instruments[index]}
                                quote={store.quotes[index]}
                                version={store.versions[index]}
                                index={index}
                                store={store}
                            />
                        ))}
                        {bottomPad > 0 && (
                            <tr aria-hidden="true" className="spacer">
                                <td colSpan={FIELD_COUNT + 2} style={{ height: bottomPad }} />
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}