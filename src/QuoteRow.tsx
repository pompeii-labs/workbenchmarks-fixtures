import { instruments, NUMERIC_FIELDS } from './feed/feed';
import { FIELD_COUNT, FLASH_MS, store } from './store';

export function createRow(): HTMLTableRowElement {
    const tr = document.createElement('tr');
    const symbol = document.createElement('td');
    symbol.className = 'symbol';
    const name = document.createElement('td');
    name.className = 'name';
    tr.append(symbol, name);
    for (const field of NUMERIC_FIELDS) {
        const td = document.createElement('td');
        td.className = 'num';
        td.dataset.field = field;
        tr.append(td);
    }
    return tr;
}

export function paintRow(tr: HTMLTableRowElement, rowIndex: number, now: number): boolean {
    const instrument = instruments[rowIndex];
    if (tr.dataset.symbol !== instrument.symbol) {
        tr.dataset.symbol = instrument.symbol;
        tr.children[0].textContent = instrument.symbol;
        tr.children[1].textContent = instrument.name;
    }
    let anyFlash = false;
    const base = rowIndex * FIELD_COUNT;
    for (let f = 0; f < FIELD_COUNT; f++) {
        const td = tr.children[f + 2];
        const i = base + f;
        const text = store.formatted[i];
        if (td.textContent !== text) td.textContent = text;
        let className = 'num';
        const changedAt = store.changedAt[i];
        if (changedAt > 0 && now - changedAt < FLASH_MS) {
            className += store.direction[i] > 0 ? ' flash-up' : ' flash-down';
            anyFlash = true;
        }
        if (td.className !== className) td.className = className;
    }
    return anyFlash;
}