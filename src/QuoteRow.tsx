import { memo, useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { NUMERIC_FIELDS, type Instrument } from './feed/feed';
import { FIELD_COUNT, getFlashDir, getFlashUntil, getRowVersion, getValue, subscribeRow } from './store';

export const QuoteRow = memo(function QuoteRow({ instrument, rowIndex }: { instrument: Instrument; rowIndex: number }) {
    const subscribe = useCallback((listener: () => void) => subscribeRow(rowIndex, listener), [rowIndex]);
    useSyncExternalStore(subscribe, () => getRowVersion(rowIndex));
    const [, setTick] = useState(0);

    useEffect(() => {
        const now = performance.now();
        const base = rowIndex * FIELD_COUNT;
        let next = Infinity;
        for (let f = 0; f < FIELD_COUNT; f++) {
            const u = getFlashUntil(base + f);
            if (u > now && u < next) next = u;
        }
        if (next === Infinity) return;
        const t = setTimeout(() => setTick((x) => x + 1), next - now);
        return () => clearTimeout(t);
    });

    const now = performance.now();
    const base = rowIndex * FIELD_COUNT;

    return (
        <tr data-symbol={instrument.symbol}>
            <td className="symbol">{instrument.symbol}</td>
            <td className="name">{instrument.name}</td>
            {NUMERIC_FIELDS.map((field, fieldIndex) => {
                const cellIndex = base + fieldIndex;
                const flash = getFlashUntil(cellIndex) > now ? (getFlashDir(cellIndex) === 1 ? 'flash-up' : 'flash-down') : '';
                return <PriceCell key={field} field={field} value={getValue(rowIndex, fieldIndex)} flash={flash} />;
            })}
        </tr>
    );
});

const PriceCell = memo(function PriceCell({ field, value, flash }: { field: string; value: number; flash: string }) {
    return (
        <td data-field={field} className={`num ${flash}`}>
            {value.toFixed(2)}
        </td>
    );
});
