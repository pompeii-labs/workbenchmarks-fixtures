import { useEffect, useRef, useState } from 'react';
import { NUMERIC_FIELDS, type Instrument } from './feed/feed';
import type { Quote } from './App';

export function QuoteRow({ instrument, quote }: { instrument: Instrument; quote: Quote }) {
    return (
        <tr data-symbol={instrument.symbol}>
            <td className="symbol">{instrument.symbol}</td>
            <td className="name">{instrument.name}</td>
            {NUMERIC_FIELDS.map((field) => (
                <PriceCell key={field} field={field} value={quote[field]} />
            ))}
        </tr>
    );
}

function PriceCell({ field, value }: { field: string; value: number }) {
    const previous = useRef(value);
    const [flash, setFlash] = useState<'' | 'flash-up' | 'flash-down'>('');

    useEffect(() => {
        if (value === previous.current) return;
        setFlash(value > previous.current ? 'flash-up' : 'flash-down');
        previous.current = value;
        const t = setTimeout(() => setFlash(''), 400);
        return () => clearTimeout(t);
    }, [value]);

    return (
        <td data-field={field} className={`num ${flash}`}>
            {value.toFixed(2)}
        </td>
    );
}
