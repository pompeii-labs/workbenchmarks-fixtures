import { instruments, NUMERIC_FIELDS, ROWS, type NumericField } from './feed/feed';
import { createRow, paintRow } from './QuoteRow';
import { FIELD_COUNT, FIELD_INDEX, store } from './store';

export const ROW_HEIGHT = 26;
const OVERSCAN = 4;
const COLUMN_COUNT = NUMERIC_FIELDS.length + 2;

type SortDir = 'asc' | 'desc';

function allIndices(): Int32Array {
    const out = new Int32Array(ROWS);
    for (let i = 0; i < ROWS; i++) out[i] = i;
    return out;
}

function filterIndices(needle: string): Int32Array {
    if (!needle) return allIndices();
    const matches: number[] = [];
    for (let i = 0; i < ROWS; i++) {
        if (instruments[i].symbol.toLowerCase().includes(needle)) matches.push(i);
    }
    return Int32Array.from(matches);
}

function makeSpacer(): HTMLTableRowElement {
    const tr = document.createElement('tr');
    tr.className = 'spacer';
    tr.setAttribute('aria-hidden', 'true');
    const td = document.createElement('td');
    td.colSpan = COLUMN_COUNT;
    tr.append(td);
    return tr;
}

export class Board {
    private readonly scrollEl: HTMLElement;
    private readonly tbody: HTMLTableSectionElement;
    private readonly topSpacer: HTMLTableRowElement;
    private readonly bottomSpacer: HTMLTableRowElement;
    private readonly headerH: number;
    private readonly resizeObserver: ResizeObserver;
    private readonly pool: HTMLTableRowElement[] = [];

    private sortField: NumericField | null = null;
    private sortDir: SortDir = 'desc';
    private needle = '';
    private filtered: Int32Array = allIndices();
    private order: Int32Array = this.filtered;
    private orderSeq = -1;
    private viewDirty = true;
    private raf = 0;
    private topHeight = -1;
    private bottomHeight = -1;

    constructor(scrollEl: HTMLElement, thead: HTMLTableSectionElement, tbody: HTMLTableSectionElement) {
        this.scrollEl = scrollEl;
        this.tbody = tbody;
        this.headerH = thead.getBoundingClientRect().height;
        this.topSpacer = makeSpacer();
        this.bottomSpacer = makeSpacer();
        tbody.append(this.topSpacer, this.bottomSpacer);
        scrollEl.addEventListener('scroll', this.kick, { passive: true });
        this.resizeObserver = new ResizeObserver(this.kick);
        this.resizeObserver.observe(scrollEl);
        store.onActivity(this.kick);
        this.kick();
    }

    setView(sortField: NumericField | null, sortDir: SortDir, filter: string) {
        const needle = filter.trim().toLowerCase();
        if (needle !== this.needle) {
            this.needle = needle;
            this.filtered = filterIndices(needle);
        }
        this.sortField = sortField;
        this.sortDir = sortDir;
        this.viewDirty = true;
        this.kick();
    }

    destroy() {
        cancelAnimationFrame(this.raf);
        this.raf = 0;
        this.scrollEl.removeEventListener('scroll', this.kick);
        this.resizeObserver.disconnect();
        store.onActivity(null);
        this.tbody.replaceChildren();
        this.pool.length = 0;
    }

    private kick = () => {
        if (!this.raf) this.raf = requestAnimationFrame(this.frame);
    };

    private recomputeOrder() {
        if (this.sortField !== null) {
            const fi = FIELD_INDEX[this.sortField];
            const sign = this.sortDir === 'desc' ? -1 : 1;
            const values = store.values;
            const order = this.filtered.slice();
            order.sort((a, b) => sign * (values[a * FIELD_COUNT + fi] - values[b * FIELD_COUNT + fi]));
            this.order = order;
        } else {
            this.order = this.filtered;
        }
        this.orderSeq = store.seq;
        this.viewDirty = false;
    }

    private setSpacerHeight(spacer: HTMLTableRowElement, height: number, which: 'top' | 'bottom') {
        const cached = which === 'top' ? this.topHeight : this.bottomHeight;
        if (cached === height) return;
        (spacer.children[0] as HTMLElement).style.height = `${height}px`;
        if (which === 'top') this.topHeight = height;
        else this.bottomHeight = height;
    }

    private frame = () => {
        this.raf = 0;
        const now = performance.now();
        const scrollTop = this.scrollEl.scrollTop;
        const clientHeight = this.scrollEl.clientHeight;

        if (this.viewDirty || (this.sortField !== null && this.orderSeq !== store.seq)) {
            this.recomputeOrder();
        }

        const total = this.order.length;
        let first = Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN;
        let last = Math.ceil((scrollTop + clientHeight - this.headerH) / ROW_HEIGHT) + OVERSCAN;
        if (first < 0) first = 0;
        if (first > total) first = total;
        if (last > total) last = total;
        if (last < first) last = first;

        this.setSpacerHeight(this.topSpacer, first * ROW_HEIGHT, 'top');
        this.setSpacerHeight(this.bottomSpacer, (total - last) * ROW_HEIGHT, 'bottom');

        const windowSize = last - first;
        while (this.pool.length < windowSize) {
            const tr = createRow();
            this.pool.push(tr);
            this.tbody.insertBefore(tr, this.bottomSpacer);
        }
        while (this.pool.length > windowSize) {
            this.pool.pop()!.remove();
        }

        let anyFlash = false;
        for (let k = 0; k < windowSize; k++) {
            if (paintRow(this.pool[k], this.order[first + k], now)) anyFlash = true;
        }

        if (anyFlash) this.kick();
    };
}