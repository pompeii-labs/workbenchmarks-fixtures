// Quote state held outside React so the feed can write at full rate.
//
// The feed delivers ~20,000 single-cell messages a second. Pushing each one
// through React state (copying 5,000 rows per message) is what froze the
// board. Here a message is a couple of typed-array writes; the board reads
// these arrays once per animation frame and repaints only what is on screen.

import { NUMERIC_FIELDS, ROWS, snapshot, subscribe, type NumericField } from './feed/feed';

export const FIELD_COUNT = NUMERIC_FIELDS.length;
export const FLASH_MS = 400;

const FIELD_INDEX = Object.fromEntries(NUMERIC_FIELDS.map((f, i) => [f, i])) as Record<NumericField, number>;

export function fieldIndex(field: NumericField): number {
    return FIELD_INDEX[field];
}

/** Latest value per cell, row-major: values[row * FIELD_COUNT + field]. */
export const values = new Float64Array(ROWS * FIELD_COUNT);
/** performance.now() of the cell's last change in value, 0 if never. */
export const changedAt = new Float64Array(ROWS * FIELD_COUNT);
/** Direction of the cell's last change: 1 up, 2 down. */
export const direction = new Uint8Array(ROWS * FIELD_COUNT);

/** Rows touched since the board last consumed them. */
const rowDirty = new Uint8Array(ROWS);
let dirtyRows: number[] = [];
/** Fields touched since the board last consumed them (drives live re-sort). */
export const fieldDirty = new Uint8Array(FIELD_COUNT);

{
    const snap = snapshot();
    for (let r = 0; r < ROWS; r++) {
        const q = snap[r];
        for (let f = 0; f < FIELD_COUNT; f++) values[r * FIELD_COUNT + f] = q[NUMERIC_FIELDS[f]];
    }
}

/** Returns the rows changed since the last call and clears the dirty marks. */
export function takeDirtyRows(): number[] {
    const out = dirtyRows;
    dirtyRows = [];
    for (let k = 0; k < out.length; k++) rowDirty[out[k]] = 0;
    return out;
}

/** '' | 'flash-up' | 'flash-down' for a cell at time `now`. */
export function flashClass(cell: number, now: number): '' | 'flash-up' | 'flash-down' {
    const t = changedAt[cell];
    if (t === 0 || now - t >= FLASH_MS) return '';
    return direction[cell] === 1 ? 'flash-up' : 'flash-down';
}

/** Starts applying feed messages to the store. Returns an unsubscribe function. */
export function connect(): () => void {
    return subscribe((m) => {
        const f = FIELD_INDEX[m.field];
        const cell = m.row * FIELD_COUNT + f;
        const old = values[cell];
        values[cell] = m.value;
        if (m.value !== old) {
            direction[cell] = m.value > old ? 1 : 2;
            changedAt[cell] = performance.now();
        }
        if (rowDirty[m.row] === 0) {
            rowDirty[m.row] = 1;
            dirtyRows.push(m.row);
        }
        fieldDirty[f] = 1;
    });
}
