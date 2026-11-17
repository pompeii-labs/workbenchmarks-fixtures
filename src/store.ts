// Quote store: applies every feed message in O(1) into typed arrays, outside
// React. The UI reads from here once per animation frame.
import { NUMERIC_FIELDS, ROWS, snapshot, subscribe, type NumericField, type QuoteMessage } from './feed/feed';

export const FIELD_COUNT = NUMERIC_FIELDS.length;
export const FLASH_MS = 400;

const fieldIndex = Object.fromEntries(NUMERIC_FIELDS.map((f, i) => [f, i])) as Record<NumericField, number>;
export function indexOfField(field: NumericField) {
    return fieldIndex[field];
}

/** Latest value per cell, row-major: values[row * FIELD_COUNT + field]. */
export const values = new Float64Array(ROWS * FIELD_COUNT);
/** Current flash per cell: 1 up, -1 down, 0 none. */
export const flashDir = new Int8Array(ROWS * FIELD_COUNT);
/** When the cell last changed (performance.now()). */
const changedAt = new Float64Array(ROWS * FIELD_COUNT);
/** Bumped whenever anything a row renders changes (value or flash). */
export const rowVersion = new Uint32Array(ROWS);
/** Set when any value in that field changed since the last frame. */
const fieldDirty = new Uint8Array(FIELD_COUNT);
let dirty = false;

// Pending flash expiries, in time order (a FIFO of cell index + change time).
let expCells = new Int32Array(1 << 14);
let expTimes = new Float64Array(1 << 14);
let expHead = 0;
let expTail = 0;

function pushExpiry(cell: number, time: number) {
    if (expTail === expCells.length) {
        const live = expTail - expHead;
        if (live * 2 > expCells.length) {
            const c = new Int32Array(expCells.length * 2);
            const t = new Float64Array(expCells.length * 2);
            c.set(expCells.subarray(expHead, expTail));
            t.set(expTimes.subarray(expHead, expTail));
            expCells = c;
            expTimes = t;
        } else {
            expCells.copyWithin(0, expHead, expTail);
            expTimes.copyWithin(0, expHead, expTail);
        }
        expHead = 0;
        expTail = live;
    }
    expCells[expTail] = cell;
    expTimes[expTail] = time;
    expTail++;
}

function expireFlashes(now: number) {
    while (expHead < expTail && now - expTimes[expHead] >= FLASH_MS) {
        const cell = expCells[expHead];
        // Only clear if the cell has not changed again since this entry.
        if (changedAt[cell] === expTimes[expHead] && flashDir[cell] !== 0) {
            flashDir[cell] = 0;
            rowVersion[(cell / FIELD_COUNT) | 0]++;
            dirty = true;
        }
        expHead++;
    }
}

function onMessage(m: QuoteMessage) {
    const cell = m.row * FIELD_COUNT + fieldIndex[m.field];
    const prev = values[cell];
    if (m.value === prev) return;
    const now = performance.now();
    values[cell] = m.value;
    flashDir[cell] = m.value > prev ? 1 : -1;
    changedAt[cell] = now;
    rowVersion[m.row]++;
    fieldDirty[fieldIndex[m.field]] = 1;
    dirty = true;
    pushExpiry(cell, now);
    // Keep the expiry queue bounded even when frames are not running
    // (e.g. a hidden tab).
    expireFlashes(now);
}

let initialized = false;
let connections = 0;
let unsubscribe: (() => void) | undefined;

/** Start applying the feed. Returns a disconnect function. */
export function connect(): () => void {
    if (!initialized) {
        // Snapshot once, before the first subscription, so queued messages
        // always apply on top of it in order.
        initialized = true;
        const snap = snapshot();
        for (let r = 0; r < ROWS; r++) {
            const q = snap[r];
            for (let f = 0; f < FIELD_COUNT; f++) values[r * FIELD_COUNT + f] = q[NUMERIC_FIELDS[f]];
        }
    }
    if (connections++ === 0) unsubscribe = subscribe(onMessage);
    return () => {
        if (--connections === 0) {
            unsubscribe?.();
            unsubscribe = undefined;
        }
    };
}

/**
 * Called once per frame. Expires flashes, then reports whether anything
 * changed and whether the given field moved since the previous call.
 */
export function takeFrame(now: number, sortField: number): { changed: boolean; sortFieldChanged: boolean } {
    expireFlashes(now);
    const changed = dirty;
    const sortFieldChanged = sortField >= 0 && fieldDirty[sortField] === 1;
    dirty = false;
    fieldDirty.fill(0);
    return { changed, sortFieldChanged };
}
