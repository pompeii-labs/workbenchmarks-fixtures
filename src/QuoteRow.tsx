import { memo, useEffect, useRef, useState } from 'react';
import { NUMERIC_FIELDS, type Instrument } from './feed/feed';
import type { Quote, QuoteStore } from './App';

const FIELD_COUNT = NUMERIC_FIELDS.length;

interface QuoteRowProps {
    instrument: Instrument;
    quote: Quote;
    version: number;
    index: number;
    store: QuoteStore;
}

export const QuoteRow = memo(function QuoteRow({ instrument, quote, index, store }: QuoteRowProps) {
    return (
        <tr data-symbol={instrument.symbol}>
            <td className="symbol">{instrument.symbol}</td>
            <td className="name">{instrument.name}</td>
            {NUMERIC_FIELDS.map((field, f) => (
                <PriceCell
                    key={field}
                    field={field}
                    value={quote[field]}
                    cellIndex={index * FIELD_COUNT + f}
                    store={store}
                />
            ))}
        </tr>
    );
});

function PriceCell({
    field,
    value,
    cellIndex,
    store,
}: {
    field: string;
    value: number;
    cellIndex: number;
    store: QuoteStore;
}) {
    const previous = useRef(value);
    const mounted = useRef(false);
    const [flash, setFlash] = useState<'' | 'flash-up' | 'flash-down'>('');

    useEffect(() => {
        const dir = store.flash[cellIndex];
        store.flash[cellIndex] = 0;
        if (!mounted.current) {
            mounted.current = true;
            previous.current = value;
            return;
        }
        if (dir === 0 && value === previous.current) {
            setFlash('');
            return;
        }
        const up = dir !== 0 ? dir > 0 : value > previous.current;
        previous.current = value;
        setFlash(up ? 'flash-up' : 'flash-down');
        const t = setTimeout(() => setFlash(''), 400);
        return () => clearTimeout(t);
    }, [value, cellIndex, store]);

    return (
        <td data-field={field} className={`num ${flash}`}>
            {value.toFixed(2)}
        </td>
    );
}