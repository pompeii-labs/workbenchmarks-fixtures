import { NUMERIC_FIELDS, ROWS, snapshot, subscribe, type NumericField, type QuoteMessage } from './feed/feed';

const FIELD_COUNT = NUMERIC_FIELDS.length;
const FIELD_INDEX = Object.fromEntries(NUMERIC_FIELDS.map((f, i) => [f, i])) as Record<NumericField, number>;

const values = new Float64Array(ROWS * FIELD_COUNT);
{
    const initial = snapshot();
    for (let r = 0; r < ROWS; r++) {
        for (let f = 0; f < FIELD_COUNT; f++) values[r * FIELD_COUNT + f] = initial[r][NUMERIC_FIELDS[f]];
    }
}

const rowVersion = new Uint32Array(ROWS);
let globalVersion = 0;

const flashDir = new Int8Array(ROWS * FIELD_COUNT);
const flashUntil = new Float64Array(ROWS * FIELD_COUNT);

const rowListeners = new Array<Set<() => void> | undefined>(ROWS);
const globalListeners = new Set<() => void>();
const dirtyRows = new Set<number>();
let rafId = 0;

function flush() {
    rafId = 0;
    if (dirtyRows.size === 0) return;
    globalVersion++;
    for (const r of dirtyRows) {
        const ls = rowListeners[r];
        if (ls) for (const l of ls) l();
    }
    dirtyRows.clear();
    for (const l of globalListeners) l();
}

function scheduleFlush() {
    if (!rafId) rafId = requestAnimationFrame(flush);
}

function onMessage(message: QuoteMessage) {
    const i = message.row * FIELD_COUNT + FIELD_INDEX[message.field];
    const old = values[i];
    if (old === message.value) return;
    values[i] = message.value;
    flashDir[i] = message.value > old ? 1 : 2;
    flashUntil[i] = performance.now() + 400;
    rowVersion[message.row]++;
    dirtyRows.add(message.row);
    scheduleFlush();
}

export function subscribeRow(row: number, listener: () => void): () => void {
    let set = rowListeners[row];
    if (!set) rowListeners[row] = set = new Set();
    set.add(listener);
    return () => {
        set.delete(listener);
    };
}

export function subscribeBoard(listener: () => void): () => void {
    globalListeners.add(listener);
    return () => {
        globalListeners.delete(listener);
    };
}

export const getRowVersion = (row: number) => rowVersion[row];
export const getBoardVersion = () => globalVersion;
export const getValue = (row: number, fieldIndex: number) => values[row * FIELD_COUNT + fieldIndex];
export const fieldIndexOf = (field: NumericField) => FIELD_INDEX[field];
export const getFlashDir = (cell: number) => flashDir[cell];
export const getFlashUntil = (cell: number) => flashUntil[cell];
export { FIELD_COUNT };

let refs = 0;
let unsubscribeFeed: (() => void) | null = null;
export function retainFeed(): () => void {
    refs++;
    if (refs === 1) unsubscribeFeed = subscribe(onMessage);
    return () => {
        refs--;
        if (refs === 0 && unsubscribeFeed) {
            unsubscribeFeed();
            unsubscribeFeed = null;
        }
    };
}