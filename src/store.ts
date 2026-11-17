import { NUMERIC_FIELDS, ROWS, snapshot, subscribe, type NumericField } from './feed/feed';

export const FIELD_COUNT = NUMERIC_FIELDS.length;
export const FIELD_INDEX = Object.fromEntries(NUMERIC_FIELDS.map((f, i) => [f, i])) as Record<NumericField, number>;
export const FLASH_MS = 400;

export const values = new Float64Array(ROWS * FIELD_COUNT);
export const flashUntil = new Float64Array(ROWS * FIELD_COUNT);
export const flashDir = new Int8Array(ROWS * FIELD_COUNT);

{
    const snap = snapshot();
    for (let r = 0; r < ROWS; r++) {
        for (let f = 0; f < FIELD_COUNT; f++) {
            values[r * FIELD_COUNT + f] = snap[r][NUMERIC_FIELDS[f]];
        }
    }
}

export function startFeed(): () => void {
    return subscribe((message) => {
        const i = message.row * FIELD_COUNT + FIELD_INDEX[message.field];
        const old = values[i];
        values[i] = message.value;
        if (message.value !== old) {
            flashDir[i] = message.value > old ? 1 : -1;
            flashUntil[i] = performance.now() + FLASH_MS;
        }
    });
}