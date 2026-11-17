import { instruments, NUMERIC_FIELDS } from './feed/feed';
import { cellClass, FIELD_COUNT, values } from './store';

export function QuoteRow({ row }: { row: number }) {
    const instrument = instruments[row];
    const base = row * FIELD_COUNT;
    const now = performance.now();
    return (
        <tr data-symbol={instrument.symbol}>
            <td className="symbol">{instrument.symbol}</td>
            <td className="name">{instrument.name}</td>
            {NUMERIC_FIELDS.map((field, f) => {
                const i = base + f;
                return (
                    <td key={field} data-field={field} className={cellClass(i, now)}>
                        {values[i].toFixed(2)}
                    </td>
                );
            })}
        </tr>
    );
}