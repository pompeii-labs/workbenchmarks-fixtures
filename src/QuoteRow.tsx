import { memo } from 'react';
import { NUMERIC_FIELDS, type Instrument } from './feed/feed';
import { FIELD_COUNT, flashClass, values } from './quoteStore';

/**
 * One board row. Reads the latest values straight from the quote store; `now`
 * changes every frame, so rows re-render each frame and PriceCell's memo keeps
 * unchanged cells from touching the DOM.
 */
export function QuoteRow({ instrument, index, now }: { instrument: Instrument; index: number; now: number }) {
    const base = index * FIELD_COUNT;
    return (
        <tr data-symbol={instrument.symbol}>
            <td className="symbol">{instrument.symbol}</td>
            <td className="name">{instrument.name}</td>
            {NUMERIC_FIELDS.map((field, f) => (
                <PriceCell key={field} field={field} value={values[base + f]} flash={flashClass(base + f, now)} />
            ))}
        </tr>
    );
}

const PriceCell = memo(function PriceCell({
    field,
    value,
    flash,
}: {
    field: string;
    value: number;
    flash: '' | 'flash-up' | 'flash-down';
}) {
    return (
        <td data-field={field} className={`num ${flash}`}>
            {value.toFixed(2)}
        </td>
    );
});
