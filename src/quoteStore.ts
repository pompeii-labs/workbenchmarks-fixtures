// Board-side copy of the quotes, kept outside React.
//
// The feed delivers ~20,000 single-cell messages a second. Applying each one
// to React state (copying a 5,000-row array per message) was what made the
// page fall behind the socket. Here a message is one typed-array write plus
// flash bookkeeping; React reads the arrays once per animation frame.

import { NUMERIC_FIELDS, ROWS, snapshot, subscribe, type NumericField, type QuoteMessage } from './feed/feed';

export const FIELD_COUNT = NUMERIC_FIELDS.length;
export const FLASH_MS = 400;

const fieldIndex = new Map<NumericField, number>(NUMERIC_FIELDS.map((f, i) => [f, i]));
export function indexOfField(field: NumericField): number {
    return fieldIndex.get(field)!;
}

/** Latest value per cell, row-major: values[row * FIELD_COUNT + field]. */
export const values = new Float64Array(ROWS * FIELD_COUNT);
/** Direction of the cell's latest change: 1 up, -1 down. */
export const flashDir = new Int8Array(ROWS * FIELD_COUNT);
/** performance.now() until which the cell flashes. */
export const flashUntil = new Float64Array(ROWS * FIELD_COUNT);

{
    const initial = snapshot();
    for (let r = 0; r < ROWS; r++) {
        const q = initial[r];
        for (let f = 0; f < FIELD_COUNT; f++) values[r * FIELD_COUNT + f] = q[NUMERIC_FIELDS[f]];
    }
}

let dirty = true;
let lastFlashEnd = 0;

function apply(message: QuoteMessage) {
    const i = message.row * FIELD_COUNT + fieldIndex.get(message.field)!;
    const old = values[i];
    dirty = true;
    if (message.value === old) return;
    values[i] = message.value;
    flashDir[i] = message.value > old ? 1 : -1;
    const until = performance.now() + FLASH_MS;
    flashUntil[i] = until;
    lastFlashEnd = until;
}

/** Starts consuming the feed. Returns an unsubscribe function. */
export function connect(): () => void {
    return subscribe(apply);
}

/**
 * True if the board needs repainting: values arrived since the last call, or
 * a flash is still running (so it can be cleared when it expires).
 */
export function takeDirty(now: number): boolean {
    const result = dirty || now <= lastFlashEnd + 16;
    dirty = false;
    return result;
}

export function flashClass(i: number, now: number): '' | 'flash-up' | 'flash-down' {
    if (flashUntil[i] <= now) return '';
    return flashDir[i] > 0 ? 'flash-up' : 'flash-down';
}
