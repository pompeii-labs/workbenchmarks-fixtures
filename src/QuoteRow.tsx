import { instruments, NUMERIC_FIELDS } from './feed/feed';
import { flashClass, getValue } from './store';

export function QuoteRow({ rowIndex }: { rowIndex: number }) {
    const instrument = instruments[rowIndex];
    const now = performance.now();
    return (
        <tr data-symbol={instrument.symbol}>
            <td className="symbol">{instrument.symbol}</td>
            <td className="name">{instrument.name}</td>
            {NUMERIC_FIELDS.map((field, f) => {
                const flash = flashClass(rowIndex, f, now);
                return (
                    <td key={field} data-field={field} className={flash ? `num ${flash}` : 'num'}>
                        {getValue(rowIndex, f).toFixed(2)}
                    </td>
                );
            })}
        </tr>
    );
}