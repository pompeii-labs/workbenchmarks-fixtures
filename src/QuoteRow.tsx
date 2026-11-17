import { memo, type Ref } from 'react';
import { NUMERIC_FIELDS, type Instrument } from './feed/feed';
import { FIELD_COUNT, flashDir, values } from './store';

const FLASH_CLASS = { 1: 'num flash-up', [-1]: 'num flash-down', 0: 'num ' } as Record<number, string>;

/**
 * Renders a row from the quote store. `version` changes whenever any of the
 * row's values or flashes change, so unchanged rows skip rendering.
 */
export const QuoteRow = memo(function QuoteRow({
    instrument,
    row,
    ref,
}: {
    instrument: Instrument;
    row: number;
    version: number;
    ref?: Ref<HTMLTableRowElement>;
}) {
    const base = row * FIELD_COUNT;
    return (
        <tr data-symbol={instrument.symbol} ref={ref}>
            <td className="symbol">{instrument.symbol}</td>
            <td className="name">{instrument.name}</td>
            {NUMERIC_FIELDS.map((field, f) => (
                <td key={field} data-field={field} className={FLASH_CLASS[flashDir[base + f]]}>
                    {values[base + f].toFixed(2)}
                </td>
            ))}
        </tr>
    );
});
