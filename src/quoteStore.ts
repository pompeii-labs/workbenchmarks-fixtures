import { NUMERIC_FIELDS, ROWS, snapshot, subscribe, type NumericField, type QuoteMessage } from './feed/feed';

const FIELD_COUNT = NUMERIC_FIELDS.length;
const FLASH_MS = 400;
const ROW_HEIGHT = 27;
const FIELD_INDEX = Object.fromEntries(NUMERIC_FIELDS.map((f, i) => [f, i])) as Record<NumericField, number>;

interface PendingChange {
    value: number;
    dir: -1 | 0 | 1;
}

interface ActiveFlash {
    el: HTMLTableCellElement;
    expiry: number;
}

export interface QuoteStore {
    readonly values: Float64Array;
    start(): void;
    stop(): void;
    registerCell(index: number, el: HTMLTableCellElement): void;
    unregisterCell(index: number): void;
    registerRow(index: number, el: HTMLTableRowElement): void;
    unregisterRow(index: number): void;
    setBody(el: HTMLTableSectionElement | null): void;
    setViewport(el: HTMLElement | null): void;
    refresh(): void;
    reorder(target: number[]): void;
    onFrame(listener: () => void): () => void;
}

export function createQuoteStore(): QuoteStore {
    const values = new Float64Array(ROWS * FIELD_COUNT);
    const initial = snapshot();
    for (let r = 0; r < ROWS; r++) {
        for (let f = 0; f < FIELD_COUNT; f++) {
            values[r * FIELD_COUNT + f] = initial[r][NUMERIC_FIELDS[f]];
        }
    }

    const cells = new Map<number, HTMLTableCellElement>();
    const rowEls = new Map<number, HTMLTableRowElement>();
    const pending = new Map<number, PendingChange>();
    const flashes = new Map<number, ActiveFlash>();
    const frameListeners = new Set<() => void>();
    const windowEls = new Set<HTMLTableRowElement>();
    let body: HTMLTableSectionElement | null = null;
    let viewport: HTMLElement | null = null;
    let viewportHeight = 0;
    let resizeObserver: ResizeObserver | undefined;
    let raf = 0;
    let unsubscribe: (() => void) | undefined;

    function onMessage(message: QuoteMessage) {
        const i = message.row * FIELD_COUNT + FIELD_INDEX[message.field];
        const cur = pending.get(i);
        const prev = cur ? cur.value : values[i];
        const dir = message.value > prev ? 1 : message.value < prev ? -1 : (cur?.dir ?? 0);
        pending.set(i, { value: message.value, dir });
    }

    function updateWindow() {
        if (!body || !viewport) return;
        const vh = viewportHeight || viewport.clientHeight;
        const top = viewport.scrollTop;
        const first = Math.max(0, Math.floor((top - vh) / ROW_HEIGHT));
        const last = Math.min(body.children.length - 1, Math.ceil((top + vh * 2) / ROW_HEIGHT));
        const kids = body.children;
        const want = new Set<HTMLTableRowElement>();
        for (let i = first; i <= last; i++) want.add(kids[i] as HTMLTableRowElement);
        for (const el of windowEls) {
            if (!want.has(el)) {
                el.style.contentVisibility = 'hidden';
                windowEls.delete(el);
            }
        }
        for (const el of want) {
            if (!windowEls.has(el)) {
                el.style.contentVisibility = '';
                windowEls.add(el);
            }
        }
    }

    function frame(now: number) {
        raf = requestAnimationFrame(frame);
        if (pending.size > 0) {
            for (const [i, change] of pending) {
                if (change.value === values[i]) continue;
                values[i] = change.value;
                const el = cells.get(i);
                if (!el) continue;
                const text = change.value.toFixed(2);
                const node = el.firstChild;
                if (node && node.nodeValue !== text) node.nodeValue = text;
                if (change.dir !== 0) {
                    const cls = change.dir > 0 ? 'num flash-up' : 'num flash-down';
                    if (el.className !== cls) el.className = cls;
                    flashes.set(i, { el, expiry: now + FLASH_MS });
                }
            }
            pending.clear();
            for (const listener of frameListeners) listener();
        }
        for (const [i, flash] of flashes) {
            if (flash.expiry <= now) {
                flash.el.className = 'num';
                flashes.delete(i);
            }
        }
        updateWindow();
    }

    return {
        values,
        start() {
            if (unsubscribe) return;
            unsubscribe = subscribe(onMessage);
            raf = requestAnimationFrame(frame);
        },
        stop() {
            if (!unsubscribe) return;
            unsubscribe();
            unsubscribe = undefined;
            cancelAnimationFrame(raf);
        },
        registerCell(index, el) {
            cells.set(index, el);
            const node = el.firstChild;
            if (node) node.nodeValue = values[index].toFixed(2);
        },
        unregisterCell(index) {
            cells.delete(index);
            flashes.delete(index);
        },
        registerRow(index, el) {
            rowEls.set(index, el);
            el.style.contentVisibility = 'hidden';
        },
        unregisterRow(index) {
            const el = rowEls.get(index);
            if (el) windowEls.delete(el);
            rowEls.delete(index);
        },
        setBody(el) {
            body = el;
        },
        setViewport(el) {
            viewport = el;
            resizeObserver?.disconnect();
            resizeObserver = undefined;
            if (el) {
                viewportHeight = el.clientHeight;
                resizeObserver = new ResizeObserver(() => {
                    viewportHeight = el.clientHeight;
                    updateWindow();
                });
                resizeObserver.observe(el);
            }
        },
        refresh() {
            updateWindow();
        },
        reorder(target) {
            if (!body) return;
            let child = body.firstChild;
            for (const index of target) {
                const node = rowEls.get(index);
                if (!node) continue;
                if (child === node) {
                    child = child.nextSibling;
                } else {
                    body.insertBefore(node, child);
                }
            }
        },
        onFrame(listener) {
            frameListeners.add(listener);
            return () => {
                frameListeners.delete(listener);
            };
        },
    };
}