// Market-data client, shared with our other desks. Do not change this file:
// the trading desks and QA depend on its exact behavior.
//
// It stands in for the production WebSocket. The market moves at about
// 20,000 quote changes a second across the board, whether or not the page
// keeps up. Every change arrives as its own message; when the page falls
// behind, messages queue like a socket buffer and drain as fast as the page
// lets them, oldest first.

export const ROWS = 5000;
export const NUMERIC_FIELDS = [
    'bid',
    'ask',
    'last',
    'open',
    'high',
    'low',
    'vwap',
    'mid',
    'spread',
    'change',
    'changePct',
    'volume',
    'bidSize',
    'askSize',
    'trades',
    'iv',
    'delta',
    'beta',
] as const;
export type NumericField = (typeof NUMERIC_FIELDS)[number];

export interface Instrument {
    symbol: string;
    name: string;
}

export interface QuoteMessage {
    /** Row index, 0 to ROWS - 1. */
    row: number;
    field: NumericField;
    value: number;
    /** Monotonic message sequence number. */
    seq: number;
}

const RATE_PER_SECOND = 20_000;
const TICK_MS = 5;
const MAX_PER_TICK = 10_000;
const FIELD_COUNT = NUMERIC_FIELDS.length;

function mulberry32(seed: number) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const SYLLABLES = ['ar', 'bo', 'cen', 'dra', 'el', 'fin', 'gor', 'hal', 'ix', 'jun', 'kor', 'lum', 'mar', 'nov', 'or', 'pax', 'quin', 'ros', 'sol', 'tur'];

export const instruments: Instrument[] = (() => {
    const rand = mulberry32(7);
    const list: Instrument[] = [];
    for (let i = 0; i < ROWS; i++) {
        const a = SYLLABLES[Math.floor(rand() * SYLLABLES.length)];
        const b = SYLLABLES[Math.floor(rand() * SYLLABLES.length)];
        const name = `${a[0].toUpperCase()}${a.slice(1)}${b} ${rand() < 0.5 ? 'Holdings' : 'Systems'}`;
        list.push({ symbol: `SYM${String(i).padStart(4, '0')}`, name });
    }
    return list;
})();

// Ground truth lives here, in the client, so QA can compare the screen to it.
const values = new Float64Array(ROWS * FIELD_COUNT);
const previous = new Float64Array(ROWS * FIELD_COUNT);
const changedAt = new Float64Array(ROWS * FIELD_COUNT);
{
    const rand = mulberry32(11);
    for (let i = 0; i < values.length; i++) {
        values[i] = Math.round((10 + rand() * 990) * 100) / 100;
        previous[i] = values[i];
    }
}

/** A copy of every current value, for the first paint. */
export function snapshot(): Record<NumericField, number>[] {
    const out: Record<NumericField, number>[] = [];
    for (let r = 0; r < ROWS; r++) {
        const row = {} as Record<NumericField, number>;
        for (let f = 0; f < FIELD_COUNT; f++) row[NUMERIC_FIELDS[f]] = values[r * FIELD_COUNT + f];
        out.push(row);
    }
    return out;
}

type Listener = (message: QuoteMessage) => void;
const listeners = new Set<Listener>();
const stream = mulberry32(42);
let seq = 0;
let delivered = 0;
let paused = false;
let started = 0;
let owed = 0;
const queue: QuoteMessage[] = [];
let timer: ReturnType<typeof setInterval> | undefined;

function next(): QuoteMessage {
    const row = Math.floor(stream() * ROWS);
    const f = Math.floor(stream() * FIELD_COUNT);
    const i = row * FIELD_COUNT + f;
    const step = 1 + (stream() - 0.5) * 0.02;
    const value = Math.max(0.01, Math.round(values[i] * step * 100) / 100);
    previous[i] = values[i];
    values[i] = value;
    changedAt[i] = performance.now();
    return { row, field: NUMERIC_FIELDS[f], value, seq: ++seq };
}

// The market moves with the clock, not with the page: every read and every
// tick first generates the changes owed since the last one.
function advance() {
    if (paused || !timer) return;
    const now = performance.now();
    owed += ((now - started) * RATE_PER_SECOND) / 1000;
    started = now;
    const n = Math.floor(owed);
    owed -= n;
    for (let k = 0; k < n; k++) queue.push(next());
}

function tick() {
    advance();
    // Delivery drains the buffer, oldest first, even while paused.
    const n = Math.min(queue.length, MAX_PER_TICK);
    for (let k = 0; k < n; k++) {
        const message = queue[k];
        for (const l of listeners) l(message);
        delivered++;
    }
    queue.splice(0, n);
}

/** Subscribe to every quote message. Returns an unsubscribe function. */
export function subscribe(listener: Listener): () => void {
    listeners.add(listener);
    if (!timer) {
        started = performance.now();
        timer = setInterval(tick, TICK_MS);
    }
    return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && timer) {
            clearInterval(timer);
            timer = undefined;
        }
    };
}

// QA hook. Read-only view of the client's truth plus pause and resume, used by
// automated checks. Not for application code.
declare global {
    interface Window {
        __marketQA?: unknown;
    }
}
window.__marketQA = {
    version: 1,
    fields: NUMERIC_FIELDS,
    get seq() {
        advance();
        return seq;
    },
    get delivered() {
        return delivered;
    },
    get backlog() {
        return queue.length;
    },
    pause() {
        advance();
        paused = true;
    },
    resume() {
        started = performance.now();
        paused = false;
    },
    truth(row: number, field: string) {
        advance();
        return values[row * FIELD_COUNT + NUMERIC_FIELDS.indexOf(field as NumericField)];
    },
    recent(row: number, field: string) {
        advance();
        const i = row * FIELD_COUNT + NUMERIC_FIELDS.indexOf(field as NumericField);
        return { value: values[i], previous: previous[i], changedAt: changedAt[i] };
    },
};
