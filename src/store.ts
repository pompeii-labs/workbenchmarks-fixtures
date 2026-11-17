import { NUMERIC_FIELDS, ROWS, snapshot, subscribe, type NumericField } from './feed/feed';

export const FIELD_COUNT = NUMERIC_FIELDS.length;
export const FLASH_MS = 400;

export const FIELD_INDEX = Object.fromEntries(
    NUMERIC_FIELDS.map((field, i) => [field, i])
) as Record<NumericField, number>;

const CELLS = ROWS * FIELD_COUNT;

class QuoteStore {
    readonly values = new Float64Array(CELLS);
    readonly formatted: string[] = new Array(CELLS);
    readonly changedAt = new Float64Array(CELLS);
    readonly direction = new Int8Array(CELLS);
    seq = 0;

    private kick: (() => void) | null = null;

    constructor() {
        const first = snapshot();
        for (let r = 0; r < ROWS; r++) {
            const quote = first[r];
            for (let f = 0; f < FIELD_COUNT; f++) {
                const i = r * FIELD_COUNT + f;
                const value = quote[NUMERIC_FIELDS[f]];
                this.values[i] = value;
                this.formatted[i] = value.toFixed(2);
            }
        }
        subscribe((message) => {
            const i = message.row * FIELD_COUNT + FIELD_INDEX[message.field];
            const old = this.values[i];
            this.values[i] = message.value;
            this.formatted[i] = message.value.toFixed(2);
            if (message.value !== old) {
                this.direction[i] = message.value > old ? 1 : -1;
                this.changedAt[i] = performance.now();
            }
            this.seq++;
            if (this.kick) this.kick();
        });
    }

    onActivity(kick: (() => void) | null) {
        this.kick = kick;
    }
}

export const store = new QuoteStore();