import { NUMERIC_FIELDS, ROWS, snapshot, subscribe, type NumericField, type QuoteMessage } from './feed/feed';

export const FIELD_COUNT = NUMERIC_FIELDS.length;
export const fieldIndex = Object.fromEntries(NUMERIC_FIELDS.map((f, i) => [f, i])) as Record<NumericField, number>;

export const values = new Float64Array(ROWS * FIELD_COUNT);
const dir = new Int8Array(ROWS * FIELD_COUNT);
const changedAt = new Float64Array(ROWS * FIELD_COUNT);

const FLASH_MS = 400;
let dirty = true;
let lastChange = 0;
let unsub: (() => void) | null = null;

{
    const snap = snapshot();
    for (let r = 0; r < ROWS; r++) {
        for (let f = 0; f < FIELD_COUNT; f++) values[r * FIELD_COUNT + f] = snap[r][NUMERIC_FIELDS[f]];
    }
}

export function start() {
    if (unsub) return;
    unsub = subscribe((m: QuoteMessage) => {
        const i = m.row * FIELD_COUNT + fieldIndex[m.field];
        const p = values[i];
        if (m.value === p) return;
        values[i] = m.value;
        dir[i] = m.value > p ? 1 : -1;
        const now = performance.now();
        changedAt[i] = now;
        if (now > lastChange) lastChange = now;
        dirty = true;
    });
}

export function stop() {
    if (unsub) {
        unsub();
        unsub = null;
    }
}

export function takeDirty() {
    const d = dirty;
    dirty = false;
    return d;
}

export function flashActive(now: number) {
    return lastChange !== 0 && now - lastChange < FLASH_MS;
}

export function cellClass(i: number, now: number) {
    const c = changedAt[i];
    if (c === 0 || now - c >= FLASH_MS) return 'num';
    return dir[i] > 0 ? 'num flash-up' : 'num flash-down';
}