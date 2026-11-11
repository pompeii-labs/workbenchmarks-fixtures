// Small DOM / SVG / scale helpers shared by the figures.

const SVGNS = 'http://www.w3.org/2000/svg';
type Attrs = Record<string, string | number | undefined | null>;

export function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}, parent?: Element): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) { const v = attrs[k]; if (v !== undefined && v !== null) e.setAttribute(k, String(v)); }
  if (parent) parent.appendChild(e);
  return e;
}

export function html<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, parent?: Element, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const k in attrs) { const v = attrs[k]; if (v !== undefined && v !== null) e.setAttribute(k, String(v)); }
  if (text !== undefined) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

export function attr(e: Element, attrs: Attrs) {
  for (const k in attrs) { const v = attrs[k]; if (v !== undefined && v !== null) e.setAttribute(k, String(v)); }
}

export const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export interface Scale { (v: number): number; inv(p: number): number; d: [number, number]; r: [number, number] }
export function linear(d0: number, d1: number, r0: number, r1: number): Scale {
  const f = ((v: number) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0)) as Scale;
  f.inv = (p) => d0 + ((p - r0) / (r1 - r0)) * (d1 - d0);
  f.d = [d0, d1]; f.r = [r0, r1];
  return f;
}
export function log10(d0: number, d1: number, r0: number, r1: number): Scale {
  const l0 = Math.log10(d0), l1 = Math.log10(d1);
  const f = ((v: number) => r0 + ((Math.log10(v) - l0) / (l1 - l0)) * (r1 - r0)) as Scale;
  f.inv = (p) => 10 ** (l0 + ((p - r0) / (r1 - r0)) * (l1 - l0));
  f.d = [d0, d1]; f.r = [r0, r1];
  return f;
}

/** Calls `cb(width)` now and whenever the element's width changes. */
export function onWidth(el: Element, cb: (w: number) => void) {
  let last = -1;
  const run = () => {
    const w = Math.round(el.getBoundingClientRect().width);
    if (w > 0 && w !== last) { last = w; cb(w); }
  };
  const ro = new ResizeObserver(() => requestAnimationFrame(run));
  ro.observe(el);
  queueMicrotask(run); // let the caller finish setting up first
}

/** Calls `cb(visible)` when the element enters or leaves the viewport (with a margin). */
export function onVisible(el: Element, cb: (visible: boolean) => void, margin = '0px') {
  const io = new IntersectionObserver((entries) => { for (const e of entries) cb(e.isIntersecting); }, { rootMargin: margin });
  io.observe(el);
  return io;
}

/**
 * Hover (mouse) and horizontal scrubbing (touch/pen) over an element. Vertical touch
 * movement is left to the browser for page scrolling (the element should have touch-action: pan-y).
 */
export function scrub(el: Element, cb: (x: number, y: number, type: 'move' | 'down', e: PointerEvent) => void, onLeave?: () => void) {
  const local = (e: PointerEvent) => {
    const r = el.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };
  let dragging = false;
  el.addEventListener('pointerdown', (ev) => {
    const e = ev as PointerEvent; dragging = true;
    const [x, y] = local(e); cb(x, y, 'down', e);
  });
  el.addEventListener('pointermove', (ev) => {
    const e = ev as PointerEvent;
    if (e.pointerType === 'mouse' || dragging) { const [x, y] = local(e); cb(x, y, 'move', e); }
  });
  const end = () => { dragging = false; };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('pointerleave', (ev) => { end(); if ((ev as PointerEvent).pointerType === 'mouse' && onLeave) onLeave(); });
}

/** Approximate sRGB colour of a monochromatic wavelength (after Bruton), with a dim tint outside the visible band. */
export function wavelengthRGB(nm: number): [number, number, number] {
  let r = 0, g = 0, b = 0;
  if (nm < 380) return [150, 128, 190];
  if (nm > 780) return [170, 96, 106];
  if (nm < 440) { r = -(nm - 440) / 60; b = 1; }
  else if (nm < 490) { g = (nm - 440) / 50; b = 1; }
  else if (nm < 510) { g = 1; b = -(nm - 510) / 20; }
  else if (nm < 580) { r = (nm - 510) / 70; g = 1; }
  else if (nm < 645) { r = 1; g = -(nm - 645) / 65; }
  else { r = 1; }
  const base: [number, number, number] = [Math.round(255 * r ** 0.8), Math.round(255 * g ** 0.8), Math.round(255 * b ** 0.8)];
  // fade smoothly into the muted tints used for the invisible ends
  const mix = (a: [number, number, number], t: number): [number, number, number] => [0, 1, 2].map((i) => Math.round(base[i] + (a[i] - base[i]) * t)) as [number, number, number];
  if (nm < 420) return mix([150, 128, 190], (420 - nm) / 40);
  if (nm > 700) return mix([170, 96, 106], (nm - 700) / 80);
  return base;
}
export const rgb = (c: [number, number, number], a = 1) => (a === 1 ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${a})`);
export const wlColor = (nm: number, a = 1) => rgb(wavelengthRGB(nm), a);

export function colourName(nm: number): string {
  if (nm < 280) return 'far ultraviolet';
  if (nm < 380) return 'ultraviolet';
  if (nm < 450) return 'violet';
  if (nm < 490) return 'blue';
  if (nm < 520) return 'cyan';
  if (nm < 565) return 'green';
  if (nm < 590) return 'yellow';
  if (nm < 625) return 'orange';
  if (nm < 750) return 'red';
  if (nm < 1400) return 'near infrared';
  return 'infrared';
}

export const fmt = (v: number, d = 0) => v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Simple observable value. */
export function store<T>(v: T) {
  const subs = new Set<(v: T, src?: unknown) => void>();
  return {
    get: () => v,
    set(nv: T, src?: unknown) { v = nv; subs.forEach((f) => f(v, src)); },
    sub(f: (v: T, src?: unknown) => void) { subs.add(f); f(v); return () => subs.delete(f); },
  };
}

/** requestAnimationFrame loop that only runs while `el` is on screen. */
export function animate(el: Element, frame: (t: number, dt: number) => void) {
  let on = false, raf = 0, last = 0;
  const tick = (t: number) => {
    const dt = Math.min(0.05, last ? (t - last) / 1000 : 0.016);
    last = t; frame(t / 1000, dt);
    if (on) raf = requestAnimationFrame(tick);
  };
  onVisible(el, (v) => {
    if (v && !on) { on = true; last = 0; raf = requestAnimationFrame(tick); }
    else if (!v && on) { on = false; cancelAnimationFrame(raf); }
  }, '100px');
}

export function niceTicks(a: number, b: number, n = 5): number[] {
  const span = b - a, step0 = span / n, mag = 10 ** Math.floor(Math.log10(step0));
  const err = step0 / mag;
  const step = (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(a / step) * step; v <= b + step * 1e-6; v += step) out.push(+v.toFixed(10));
  return out;
}
