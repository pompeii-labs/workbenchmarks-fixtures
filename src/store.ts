import { NUMERIC_FIELDS, ROWS, snapshot, subscribe, type NumericField } from './feed/feed';

export const FIELD_COUNT = NUMERIC_FIELDS.length;
export const FLASH_MS = 400;

const FIELD_INDEX = new Map<NumericField, number>(NUMERIC_FIELDS.map((f, i) => [f, i]));

const values = new Float64Array(ROWS * FIELD_COUNT);
const changedAt = new Float64Array(ROWS * FIELD_COUNT).fill(-1e9);
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
let dirty = false;
let lastChange = -1e9;
let pendingFinalPaint = false;
let rafId = 0;
const listeners = new Set<() => void>();

function emit() {
    version++;
    for (const listener of listeners) listener();
}

function frame() {
    rafId = 0;
    const now = performance.now();
    if (dirty || now - lastChange < FLASH_MS) {
        dirty = false;
        pendingFinalPaint = true;
        emit();
        rafId = requestAnimationFrame(frame);
    } else if (pendingFinalPaint) {
        pendingFinalPaint = false;
        emit();
    }
}

function ensureLoop() {
    if (!rafId) rafId = requestAnimationFrame(frame);
}

subscribe((message) => {
    const i = message.row * FIELD_COUNT + FIELD_INDEX.get(message.field)!;
    const old = values[i];
    values[i] = message.value;
    direction[i] = message.value > old ? 1 : message.value < old ? -1 : 0;
    changedAt[i] = performance.now();
    lastChange = changedAt[i];
    dirty = true;
    ensureLoop();
});

export function subscribeToStore(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function getVersion(): number {
    return version;
}

export function getValue(row: number, field: number): number {
    return values[row * FIELD_COUNT + field];
}

export function flashClass(row: number, field: number, now: number): '' | 'flash-up' | 'flash-down' {
    const i = row * FIELD_COUNT + field;
    if (now - changedAt[i] >= FLASH_MS) return '';
    return direction[i] > 0 ? 'flash-up' : direction[i] < 0 ? 'flash-down' : '';
}