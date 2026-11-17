import { memo, useCallback } from 'react';
import { NUMERIC_FIELDS, type Instrument } from './feed/feed';
import type { QuoteStore } from './quoteStore';

const FIELD_COUNT = NUMERIC_FIELDS.length;

export const QuoteRow = memo(function QuoteRow({
    instrument,
    index,
    store,
}: {
    instrument: Instrument;
    index: number;
    store: QuoteStore;
}) {
    const ref = useCallback(
        (el: HTMLTableRowElement | null) => {
            if (!el) return;
            store.registerRow(index, el);
            return () => store.unregisterRow(index);
        },
        [store, index]
    );

    return (
        <tr data-symbol={instrument.symbol} role="row" ref={ref}>
            <td className="symbol" role="cell">{instrument.symbol}</td>
            <td className="name" role="cell">{instrument.name}</td>
            {NUMERIC_FIELDS.map((field, f) => (
                <PriceCell key={field} field={field} index={index * FIELD_COUNT + f} store={store} />
            ))}
        </tr>
    );
});

const PriceCell = memo(function PriceCell({ field, index, store }: { field: string; index: number; store: QuoteStore }) {
    const ref = useCallback(
        (el: HTMLTableCellElement | null) => {
            if (!el) return;
            store.registerCell(index, el);
            return () => store.unregisterCell(index);
        },
        [store, index]
    );

    return (
        <td data-field={field} className="num" role="cell" ref={ref}>
            {store.values[index].toFixed(2)}
        </td>
    );
});