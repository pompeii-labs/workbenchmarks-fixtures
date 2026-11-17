import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { instruments, NUMERIC_FIELDS, type NumericField } from './feed/feed';
import { createQuoteStore } from './quoteStore';
import { QuoteRow } from './QuoteRow';

type SortDir = 'asc' | 'desc';

const FIELD_COUNT = NUMERIC_FIELDS.length;
const LOWER_SYMBOLS = instruments.map((instrument) => instrument.symbol.toLowerCase());

export function App() {
    const [store] = useState(createQuoteStore);
    const [filter, setFilter] = useState('');
    const [sortField, setSortField] = useState<NumericField | null>(null);
    const [sortDir, setSortDir] = useState<SortDir>('desc');

    const committedOrder = useRef<number[]>([]);
    const visible = useRef<number[]>([]);

    useEffect(() => {
        store.start();
        return () => store.stop();
    }, [store]);

    const needle = filter.trim().toLowerCase();
    const baseRows = useMemo(() => {
        const rows: { instrument: (typeof instruments)[number]; index: number }[] = [];
        for (let index = 0; index < instruments.length; index++) {
            if (!needle || LOWER_SYMBOLS[index].includes(needle)) {
                rows.push({ instrument: instruments[index], index });
            }
        }
        return rows;
    }, [needle]);

    useLayoutEffect(() => {
        const order = baseRows.map((r) => r.index);
        committedOrder.current = order;
        visible.current = order;
        store.refresh();
    }, [baseRows, store]);

    useEffect(() => {
        if (!sortField) return;
        const fieldIndex = NUMERIC_FIELDS.indexOf(sortField);
        const sign = sortDir === 'desc' ? -1 : 1;
        const sortNow = () => {
            const target = [...visible.current].sort((a, b) => {
                const d = sign * (store.values[a * FIELD_COUNT + fieldIndex] - store.values[b * FIELD_COUNT + fieldIndex]);
                return d !== 0 ? d : a - b;
            });
            store.reorder(target);
        };
        sortNow();
        return store.onFrame(sortNow);
    }, [store, sortField, sortDir, baseRows]);

    function toggleSort(field: NumericField) {
        if (sortField === field) {
            setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
        } else {
            setSortField(field);
            setSortDir('desc');
        }
    }

    function onFilterChange(value: string) {
        store.reorder(committedOrder.current);
        setFilter(value);
    }

    const bodyRef = useCallback(
        (el: HTMLTableSectionElement | null) => {
            store.setBody(el);
        },
        [store]
    );

    const scrollRef = useCallback(
        (el: HTMLDivElement | null) => {
            store.setViewport(el);
        },
        [store]
    );

    return (
        <div className="app">
            <header className="toolbar">
                <h1>Tickerboard</h1>
                <input
                    name="filter"
                    placeholder="Filter symbols"
                    value={filter}
                    onChange={(e) => onFilterChange(e.target.value)}
                />
                <span className="count">{baseRows.length} instruments</span>
            </header>
            <div className="grid-scroll" ref={scrollRef}>
                <table className="grid" role="table">
                    <thead role="rowgroup">
                        <tr role="row">
                            <th role="columnheader">Symbol</th>
                            <th role="columnheader">Name</th>
                            {NUMERIC_FIELDS.map((field) => (
                                <th
                                    key={field}
                                    role="columnheader"
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
                    <tbody role="rowgroup" ref={bodyRef}>
                        {baseRows.map((r) => (
                            <QuoteRow key={r.instrument.symbol} instrument={r.instrument} index={r.index} store={store} />
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}