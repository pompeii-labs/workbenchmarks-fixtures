import { useEffect, useRef, useSyncExternalStore } from 'react';
import { NUMERIC_FIELDS } from './feed/feed';
import { QuoteRow } from './QuoteRow';
import {
    attach,
    getFilter,
    getOrder,
    getPaintNow,
    getSortDir,
    getSortField,
    getVersion,
    getWindow,
    setFilter,
    subscribeFrame,
    toggleSort,
} from './store';

export function App() {
    useSyncExternalStore(subscribeFrame, getVersion);
    const scrollRef = useRef<HTMLDivElement>(null);
    useEffect(() => attach(scrollRef.current), []);

    const filter = getFilter();
    const sortField = getSortField();
    const sortDir = getSortDir();
    const { start, end, total, rowH } = getWindow();
    const order = getOrder();
    const now = getPaintNow();
    const visible = order.slice(start, end);
    const colSpan = NUMERIC_FIELDS.length + 2;

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
                        {start > 0 && (
                            <tr key="spacer-top" className="spacer" aria-hidden="true">
                                <td colSpan={colSpan} style={{ height: start * rowH }} />
                            </tr>
                        )}
                        {visible.map((index, slot) => (
                            <QuoteRow key={slot} index={index} now={now} />
                        ))}
                        {end < total && (
                            <tr key="spacer-bottom" className="spacer" aria-hidden="true">
                                <td colSpan={colSpan} style={{ height: (total - end) * rowH }} />
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}