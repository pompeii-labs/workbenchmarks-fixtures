import { memo } from 'react';
import { NUMERIC_FIELDS, type Instrument } from './feed/feed';
import { FIELD_COUNT, flashClass, values } from './quoteStore';

export type Quote = Record<(typeof NUMERIC_FIELDS)[number], number>;

/**
 * One board row. It reads the latest values straight from the quote store;
 * `rev` changes whenever the row's values or flash state change, so unchanged
 * rows skip rendering entirely.
 */
export const QuoteRow = memo(function QuoteRow({
    instrument,
    row,
    now,
}: {
    instrument: Instrument;
    row: number;
    rev: number;
    now: number;
}) {
    const base = row * FIELD_COUNT;
    return (
        <tr data-symbol={instrument.symbol}>
            <td className="symbol">{instrument.symbol}</td>
            <td className="name">{instrument.name}</td>
            {NUMERIC_FIELDS.map((field, f) => (
                <td key={field} data-field={field} className={`num ${flashClass(base + f, now)}`}>
                    {values[base + f].toFixed(2)}
                </td>
            ))}
        </tr>
    );
}, (a, b) => a.row === b.row && a.rev === b.rev && a.instrument === b.instrument);
