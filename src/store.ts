import { NUMERIC_FIELDS, ROWS, snapshot, subscribe, type NumericField } from './feed/feed';

export const FIELD_COUNT = NUMERIC_FIELDS.length;
const FIELD_INDEX = Object.fromEntries(NUMERIC_FIELDS.map((f, i) => [f, i])) as Record<NumericField, number>;
const FLASH_MS = 400;

export const values = new Float64Array(ROWS * FIELD_COUNT);
export const changedAt = new Float64Array(ROWS * FIELD_COUNT);
const direction = new Int8Array(ROWS * FIELD_COUNT);

{
    const initial = snapshot();
    for (let r = 0; r < ROWS; r++) {
        for (let f = 0; f < FIELD_COUNT; f++) {
            values[r * FIELD_COUNT + f] = initial[r][NUMERIC_FIELDS[f]];
        }
    }
}

let version = 0;
let pending = false;
let flashEnd = 0;
const listeners = new Set<() => void>();

subscribe((message) => {
    const i = message.row * FIELD_COUNT + FIELD_INDEX[message.field];
    const old = values[i];
    values[i] = message.value;
    if (message.value !== old) {
        const now = performance.now();
        direction[i] = message.value > old ? 1 : -1;
        changedAt[i] = now;
        if (now + FLASH_MS > flashEnd) flashEnd = now + FLASH_MS;
    }
    pending = true;
});

function frame() {
    const now = performance.now();
    if (pending || now < flashEnd) {
        pending = false;
        version++;
        for (const listener of listeners) listener();
    }
    requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

export function subscribeFrame(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function getVersion() {
    return version;
}

export function cellFlash(i: number, now: number): '' | 'flash-up' | 'flash-down' {
    if (now - changedAt[i] >= FLASH_MS) return '';
    return direction[i] > 0 ? 'flash-up' : 'flash-down';
}