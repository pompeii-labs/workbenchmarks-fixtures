import { instruments, NUMERIC_FIELDS } from './feed/feed';
import { FIELD_COUNT, flashDir, flashUntil, values } from './store';

export function QuoteRow({ row, now }: { row: number; now: number }) {
    const instrument = instruments[row];
    const base = row * FIELD_COUNT;
    return (
        <tr data-symbol={instrument.symbol}>
            <td className="symbol">{instrument.symbol}</td>
            <td className="name">{instrument.name}</td>
            {NUMERIC_FIELDS.map((field, f) => {
                const i = base + f;
                const className = now < flashUntil[i] ? (flashDir[i] > 0 ? 'num flash-up' : 'num flash-down') : 'num';
                return (
                    <td key={field} data-field={field} className={className}>
                        {values[i].toFixed(2)}
                    </td>
                );
            })}
        </tr>
    );
}