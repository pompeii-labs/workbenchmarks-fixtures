import { useEffect, useMemo, useRef, useState } from 'react';
import { Board } from './board';
import { instruments, NUMERIC_FIELDS, ROWS, type NumericField } from './feed/feed';

type SortDir = 'asc' | 'desc';

export function App() {
    const [filter, setFilter] = useState('');
    const [sortField, setSortField] = useState<NumericField | null>(null);
    const [sortDir, setSortDir] = useState<SortDir>('desc');
    const scrollRef = useRef<HTMLDivElement>(null);
    const theadRef = useRef<HTMLTableSectionElement>(null);
    const tbodyRef = useRef<HTMLTableSectionElement>(null);
    const boardRef = useRef<Board | null>(null);

    useEffect(() => {
        const board = new Board(scrollRef.current!, theadRef.current!, tbodyRef.current!);
        boardRef.current = board;
        return () => {
            board.destroy();
            boardRef.current = null;
        };
    }, []);

    useEffect(() => {
        boardRef.current?.setView(sortField, sortDir, filter);
    }, [sortField, sortDir, filter]);

    function toggleSort(field: NumericField) {
        if (sortField === field) {
            setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
        } else {
            setSortField(field);
            setSortDir('desc');
        }
    }

    const needle = filter.trim().toLowerCase();
    const count = useMemo(() => {
        if (!needle) return ROWS;
        let n = 0;
        for (const instrument of instruments) {
            if (instrument.symbol.toLowerCase().includes(needle)) n++;
        }
        return n;
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
                <span className="count">{count} instruments</span>
            </header>
            <div className="grid-scroll" ref={scrollRef}>
                <table className="grid">
                    <colgroup>
                        <col style={{ width: 88 }} />
                        <col style={{ width: 170 }} />
                        {NUMERIC_FIELDS.map((field) => (
                            <col key={field} style={{ width: 84 }} />
                        ))}
                    </colgroup>
                    <thead ref={theadRef}>
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
                    <tbody ref={tbodyRef} />
                </table>
            </div>
        </div>
    );
}