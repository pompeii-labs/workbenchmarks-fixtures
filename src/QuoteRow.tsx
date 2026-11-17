import { instruments, NUMERIC_FIELDS } from './feed/feed';
import { flashClassAt, valueAt } from './store';

export function QuoteRow({ index, now }: { index: number; now: number }) {
    const instrument = instruments[index];
    return (
        <tr data-symbol={instrument.symbol}>
            <td className="symbol">{instrument.symbol}</td>
            <td className="name">{instrument.name}</td>
            {NUMERIC_FIELDS.map((field, f) => (
                <td key={field} data-field={field} className={`num ${flashClassAt(index, f, now)}`}>
                    {valueAt(index, f).toFixed(2)}
                </td>
            ))}
        </tr>
    );
}