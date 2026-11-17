import { instruments, NUMERIC_FIELDS } from './feed/feed';
import { FIELD_COUNT, cellFlash, values } from './store';

export function QuoteRow({ index, now }: { index: number; now: number }) {
    const instrument = instruments[index];
    const base = index * FIELD_COUNT;
    return (
        <tr data-symbol={instrument.symbol}>
            <td className="symbol">{instrument.symbol}</td>
            <td className="name">{instrument.name}</td>
            {NUMERIC_FIELDS.map((field, f) => {
                const i = base + f;
                const flash = cellFlash(i, now);
                return (
                    <td key={field} data-field={field} className={flash ? `num ${flash}` : 'num'}>
                        {values[i].toFixed(2)}
                    </td>
                );
            })}
        </tr>
    );
}