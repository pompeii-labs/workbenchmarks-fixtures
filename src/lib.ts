// Small DOM / drawing helpers shared by the figures.

type Attrs = Record<string, string | number | boolean | null | undefined>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K, attrs: Attrs = {}, ...children: (Node | string | null | undefined)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = String(v);
    else if (k === 'html') e.innerHTML = String(v);
    else e.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c != null) e.append(c);
  return e;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
export function s<K extends keyof SVGElementTagNameMap>(
  tag: K, attrs: Attrs = {}, ...children: (Node | string | null | undefined)[]
): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    e.setAttribute(k, String(v));
  }
  for (const c of children) if (c != null) e.append(c);
  return e;
}

export const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export interface Scale { (x: number): number; invert(y: number): number }
export function linear(d0: number, d1: number, r0: number, r1: number): Scale {
  const f = ((x: number) => r0 + ((x - d0) / (d1 - d0)) * (r1 - r0)) as Scale;
  f.invert = (y: number) => d0 + ((y - r0) / (r1 - r0)) * (d1 - d0);
  return f;
}

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Calls `fn` once the element is within `margin` of the viewport. */
export function whenNear(el: Element, fn: () => void, margin = '600px') {
  if (!('IntersectionObserver' in window)) { fn(); return; }
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) { io.disconnect(); fn(); }
  }, { rootMargin: margin });
  io.observe(el);
}

/**
 * Runs an animation loop only while the element is on screen and the tab is
 * visible. `fn` receives the elapsed seconds since the previous frame (capped).
 */
export function loop(el: Element, fn: (dt: number, t: number) => void): { kick(): void } {
  let visible = false, raf = 0, last = 0, t = 0;
  const frame = (now: number) => {
    raf = 0;
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
    last = now; t += dt;
    fn(dt, t);
    schedule();
  };
  const schedule = () => {
    if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame);
  };
  const io = new IntersectionObserver((entries) => {
    visible = entries[entries.length - 1].isIntersecting;
    if (visible) { last = 0; schedule(); }
  }, { rootMargin: '80px' });
  io.observe(el);
  document.addEventListener('visibilitychange', () => { last = 0; schedule(); });
  return { kick: schedule };
}

/** Re-runs `fn(width)` whenever the element's width changes. */
export function onWidth(el: HTMLElement, fn: (w: number) => void) {
  let prev = -1;
  const run = () => {
    const w = Math.round(el.clientWidth);
    if (w > 0 && w !== prev) { prev = w; fn(w); }
  };
  new ResizeObserver(run).observe(el);
  run();
}

/** A canvas that keeps its backing store matched to its CSS size and DPR. */
export function fitCanvas(canvas: HTMLCanvasElement, aspect: (w: number) => number, onResize?: (w: number, h: number) => void) {
  const state = { w: 0, h: 0, dpr: 1 };
  onWidth(canvas.parentElement as HTMLElement, () => {
    const w = canvas.clientWidth || (canvas.parentElement as HTMLElement).clientWidth;
    const hgt = Math.round(w * aspect(w));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.style.height = hgt + 'px';
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(hgt * dpr);
    state.w = w; state.h = hgt; state.dpr = dpr;
    onResize?.(w, hgt);
  });
  return state;
}

export interface SliderOpts {
  label: string; min: number; max: number; step: number; value: number;
  format: (v: number) => string; onInput: (v: number) => void; className?: string; thumb?: string;
}
let uid = 0;
export function slider(o: SliderOpts) {
  const id = `sl-${++uid}`;
  const out = h('output', { for: id }, o.format(o.value));
  const input = h('input', { type: 'range', id, min: o.min, max: o.max, step: o.step, value: o.value, class: o.className });
  if (o.thumb) input.style.setProperty('--thumb', o.thumb);
  const sync = () => { out.textContent = o.format(+input.value); input.setAttribute('aria-valuetext', o.format(+input.value)); };
  input.addEventListener('input', () => { sync(); o.onInput(+input.value); });
  sync();
  const root = h('div', { class: 'slider' }, h('label', { for: id }, o.label), out, input);
  return {
    root, input,
    set(v: number, fire = false) { input.value = String(v); sync(); if (fire) o.onInput(+input.value); },
  };
}

export function segmented<T extends string>(
  options: { id: T; label: string; html?: string }[], value: T, onChange: (v: T) => void, label: string,
) {
  const root = h('div', { class: 'seg', role: 'group', 'aria-label': label });
  const buttons = new Map<T, HTMLButtonElement>();
  const set = (v: T, fire = true) => {
    buttons.forEach((b, id) => b.setAttribute('aria-pressed', String(id === v)));
    if (fire) onChange(v);
  };
  for (const o of options) {
    const b = h('button', { type: 'button', html: o.html ?? o.label });
    b.addEventListener('click', () => set(o.id));
    buttons.set(o.id, b);
    root.append(b);
  }
  set(value, false);
  return { root, set };
}

/** Pointer position within an SVG whose viewBox matches its pixel size. */
export function pointerX(svg: SVGSVGElement, ev: PointerEvent, vbWidth: number) {
  const r = svg.getBoundingClientRect();
  return ((ev.clientX - r.left) / r.width) * vbWidth;
}
export function pointerXY(svg: SVGSVGElement, ev: PointerEvent, vbW: number, vbH: number): [number, number] {
  const r = svg.getBoundingClientRect();
  return [((ev.clientX - r.left) / r.width) * vbW, ((ev.clientY - r.top) / r.height) * vbH];
}

/**
 * Drag handling for charts: follows the pointer on hover (mouse) and on
 * horizontal drags (touch), leaving vertical swipes to scroll the page.
 */
export function scrub(el: SVGElement | HTMLElement, onMove: (ev: PointerEvent) => void, hover = true) {
  const target = el as HTMLElement;
  let down = false;
  target.addEventListener('pointerdown', (ev) => {
    down = true;
    try { target.setPointerCapture(ev.pointerId); } catch { /* ignore */ }
    onMove(ev);
  });
  target.addEventListener('pointermove', (ev) => {
    if (down || (hover && ev.pointerType === 'mouse')) onMove(ev);
  });
  const up = () => { down = false; };
  target.addEventListener('pointerup', up);
  target.addEventListener('pointercancel', up);
}

export const fmt = (x: number, digits = 0) =>
  x.toLocaleString('en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const pct = (x: number, digits = 0) => `${fmt(x * 100, digits)}%`;

/** Draws a photon as a short wave packet travelling along (dx, dy). */
export function drawPhoton(
  ctx: CanvasRenderingContext2D, x: number, y: number, dirX: number, dirY: number,
  color: string, phase: number, length = 34, amp = 4, waves = 3,
) {
  const n = 24;
  const px = -dirY, py = dirX;
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const u = i / n; // 0 = head, 1 = tail
    const env = Math.sin(Math.PI * u) ** 1.2;
    const off = Math.sin(u * waves * 2 * Math.PI + phase) * amp * env;
    const cx = x - dirX * length * u + px * off;
    const cy = y - dirY * length * u + py * off;
    if (i === 0) ctx.moveTo(cx, cy); else ctx.lineTo(cx, cy);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}
