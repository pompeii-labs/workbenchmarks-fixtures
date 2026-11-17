import { useEffect, useState } from 'react';
import { instruments, NUMERIC_FIELDS, snapshot, subscribe, type NumericField } from './feed/feed';
import { QuoteRow } from './QuoteRow';

export type Quote = Record<NumericField, number>;
type SortDir = 'asc' | 'desc';

export function App() {
    const [quotes, setQuotes] = useState<Quote[]>(() => snapshot());
    const [filter, setFilter] = useState('');
    const [sortField, setSortField] = useState<NumericField | null>(null);
    const [sortDir, setSortDir] = useState<SortDir>('desc');

    useEffect(() => {
        return subscribe((message) => {
            setQuotes((prev) =>
                prev.map((q, i) => (i === message.row ? { ...q, [message.field]: message.value } : q))
            );
        });
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
    let rows = instruments.map((instrument, index) => ({ instrument, index, quote: quotes[index] }));
    if (needle) rows = rows.filter((r) => r.instrument.symbol.toLowerCase().includes(needle));
    if (sortField) {
        const sign = sortDir === 'desc' ? -1 : 1;
        rows = [...rows].sort((a, b) => sign * (a.quote[sortField] - b.quote[sortField]));
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
            <div className="grid-scroll">
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
                        {rows.map((r) => (
                            <QuoteRow key={r.instrument.symbol} instrument={r.instrument} quote={r.quote} />
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
