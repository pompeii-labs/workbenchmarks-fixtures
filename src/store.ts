import { instruments, NUMERIC_FIELDS, ROWS, snapshot, subscribe, type NumericField, type QuoteMessage } from './feed/feed';

const FIELD_COUNT = NUMERIC_FIELDS.length;
const FLASH_MS = 400;
const OVERSCAN = 6;
const DEFAULT_ROW_H = 26;
const DEFAULT_HEAD_H = 31;

const fieldOffset = Object.fromEntries(NUMERIC_FIELDS.map((f, i) => [f, i])) as Record<NumericField, number>;

const values = new Float64Array(ROWS * FIELD_COUNT);
const flashDir = new Uint8Array(ROWS * FIELD_COUNT);
const flashAt = new Float64Array(ROWS * FIELD_COUNT);

{
    const initial = snapshot();
    for (let r = 0; r < ROWS; r++) {
        for (let f = 0; f < FIELD_COUNT; f++) {
            values[r * FIELD_COUNT + f] = initial[r][NUMERIC_FIELDS[f]];
        }
    }
}

const allIndices: number[] = [];
for (let i = 0; i < ROWS; i++) allIndices.push(i);

let filterText = '';
let sortField: NumericField | null = null;
let sortOffset = 0;
let sortSign = -1;
let filtered: number[] = allIndices.slice();
let order: number[] = filtered.slice();

let version = 0;
const listeners = new Set<() => void>();

let scroller: HTMLElement | null = null;
let rowH = 0;
let headH = 0;
let winStart = 0;
let winEnd = Math.min(ROWS, 60);
let paintNow = 0;
let lastMessageAt = -Infinity;
let rafId = 0;

function compare(a: number, b: number): number {
    return sortSign * (values[a * FIELD_COUNT + sortOffset] - values[b * FIELD_COUNT + sortOffset]);
}

function measure() {
    if (!scroller) return;
    if (!rowH) {
        const tr = scroller.querySelector('tbody tr[data-symbol]');
        if (tr) rowH = tr.getBoundingClientRect().height;
    }
    if (!headH) {
        const thead = scroller.querySelector('thead');
        if (thead) headH = thead.getBoundingClientRect().height;
    }
}

function computeWindow() {
    const total = order.length;
    if (!scroller || total === 0) {
        winStart = 0;
        winEnd = Math.min(total, 60);
        return;
    }
    const h = rowH || DEFAULT_ROW_H;
    const head = headH || DEFAULT_HEAD_H;
    const top = scroller.scrollTop;
    const first = Math.floor(top / h);
    const visible = Math.ceil((scroller.clientHeight - head) / h) + 1;
    winStart = Math.max(0, Math.min(first - OVERSCAN, total - 1));
    winEnd = Math.min(total, Math.max(winStart, first + visible + OVERSCAN));
}

function frame() {
    rafId = 0;
    const now = performance.now();
    paintNow = now;
    if (sortField) order.sort(compare);
    measure();
    computeWindow();
    version++;
    for (const l of listeners) l();
    if (now - lastMessageAt < FLASH_MS) schedule();
}

function schedule() {
    if (!rafId) rafId = requestAnimationFrame(frame);
}

function onMessage(message: QuoteMessage) {
    const i = message.row * FIELD_COUNT + fieldOffset[message.field];
    const old = values[i];
    values[i] = message.value;
    const now = performance.now();
    if (message.value !== old) {
        flashDir[i] = message.value > old ? 1 : 2;
        flashAt[i] = now;
    }
    lastMessageAt = now;
    schedule();
}

subscribe(onMessage);

export function attach(el: HTMLElement | null): () => void {
    scroller = el;
    if (!el) return () => {};
    const onScroll = () => schedule();
    el.addEventListener('scroll', onScroll, { passive: true });
    schedule();
    return () => {
        el.removeEventListener('scroll', onScroll);
        if (scroller === el) scroller = null;
    };
}

export function subscribeFrame(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function getVersion(): number {
    return version;
}

export function getFilter(): string {
    return filterText;
}

export function setFilter(text: string) {
    if (text === filterText) return;
    filterText = text;
    const needle = text.trim().toLowerCase();
    filtered = needle ? allIndices.filter((i) => instruments[i].symbol.toLowerCase().includes(needle)) : allIndices.slice();
    order = filtered.slice();
    schedule();
}

export function getSortField(): NumericField | null {
    return sortField;
}

export function getSortDir(): 'asc' | 'desc' {
    return sortSign === -1 ? 'desc' : 'asc';
}

export function toggleSort(field: NumericField) {
    if (sortField === field) {
        sortSign = -sortSign;
    } else {
        sortField = field;
        sortOffset = fieldOffset[field];
        sortSign = -1;
    }
    schedule();
}

export function getWindow(): { start: number; end: number; total: number; rowH: number } {
    return { start: winStart, end: winEnd, total: order.length, rowH: rowH || DEFAULT_ROW_H };
}

export function getOrder(): number[] {
    return order;
}

export function getPaintNow(): number {
    return paintNow;
}

export function valueAt(row: number, f: number): number {
    return values[row * FIELD_COUNT + f];
}

export function flashClassAt(row: number, f: number, now: number): string {
    const i = row * FIELD_COUNT + f;
    const d = flashDir[i];
    if (!d || now - flashAt[i] >= FLASH_MS) return '';
    return d === 1 ? 'flash-up' : 'flash-down';
}