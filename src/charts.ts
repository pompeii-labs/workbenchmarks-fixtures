// SVG charts: solar spectrum, energy budget, Shockley–Queisser limit, absorption depth.
import * as P from './physics';
import { svg, attr, linear, log10, onWidth, scrub, wlColor, colourName, fmt, clamp, niceTicks, store, type Scale } from './util';

export const gapStore = store(P.SI_GAP);

interface Frame { root: SVGSVGElement; W: number; H: number; m: { l: number; r: number; t: number; b: number } }

function frame(host: HTMLElement, W: number, H: number, m: Frame['m']): Frame {
  host.innerHTML = '';
  const label = host.closest('figure')?.querySelector('h3')?.textContent ?? 'Chart';
  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': `${label}. Interactive chart; values are shown in the text readout.` }, host);
  return { root, W, H, m };
}

function xAxis(f: Frame, x: Scale, ticks: number[], label: string, tf: (v: number) => string = (v) => fmt(v)) {
  const g = svg('g', { class: 'tick' }, f.root);
  const y0 = f.H - f.m.b;
  svg('line', { x1: f.m.l, x2: f.W - f.m.r, y1: y0, y2: y0, stroke: '#9d958a' }, g);
  for (const t of ticks) {
    const px = x(t);
    if (px < f.m.l - 1 || px > f.W - f.m.r + 1) continue;
    svg('line', { x1: px, x2: px, y1: y0, y2: y0 + 4 }, g);
    svg('text', { x: px, y: y0 + 16, 'text-anchor': 'middle' }, g).textContent = tf(t);
  }
  svg('text', { x: (f.m.l + f.W - f.m.r) / 2, y: f.H - 4, 'text-anchor': 'middle', class: 'axis-title' }, f.root).textContent = label;
}

function yAxis(f: Frame, y: Scale, ticks: number[], label: string, tf: (v: number) => string = (v) => fmt(v), right = false) {
  const gg = svg('g', { class: 'grid' }, f.root);
  const g = svg('g', { class: 'tick' }, f.root);
  const xa = right ? f.W - f.m.r : f.m.l;
  for (const t of ticks) {
    const py = y(t);
    if (!right) svg('line', { x1: f.m.l, x2: f.W - f.m.r, y1: py, y2: py }, gg);
    svg('text', { x: right ? xa + 6 : xa - 6, y: py + 3.5, 'text-anchor': right ? 'start' : 'end' }, g).textContent = tf(t);
  }
  const t = svg('text', { class: 'axis-title', 'text-anchor': 'middle', transform: `translate(${right ? f.W - 6 : 11},${(f.m.t + f.H - f.m.b) / 2}) rotate(${right ? 90 : -90})` }, f.root);
  t.textContent = label;
}

function pathFrom(pts: [number, number][]) {
  let d = '';
  for (let i = 0; i < pts.length; i++) d += (i ? 'L' : 'M') + pts[i][0].toFixed(1) + ',' + pts[i][1].toFixed(1);
  return d;
}

function rainbowGradient(root: SVGSVGElement, id: string, x: Scale, x0: number, x1: number, toNm: (v: number) => number, opacity = 1) {
  const defs = svg('defs', {}, root);
  const lg = svg('linearGradient', { id, x1: x(x0), x2: x(x1), y1: 0, y2: 0, gradientUnits: 'userSpaceOnUse' }, defs);
  const n = 60;
  for (let i = 0; i <= n; i++) {
    const v = x0 + ((x1 - x0) * i) / n;
    svg('stop', { offset: i / n, 'stop-color': wlColor(toNm(v)), 'stop-opacity': opacity }, lg);
  }
  return `url(#${id})`;
}

// ---------------------------------------------------------------- spectrum
export function spectrumChart(host: HTMLElement, readout: HTMLElement) {
  const s = P.spectrum();
  const fr = P.bandFractions();
  const irFill = document.querySelector('[data-fill="ir-share"]');
  if (irFill) irFill.textContent = `More than half (${Math.round(fr.ir * 100)}%)`;

  let cursor = 550;
  let draw: (nm: number | null) => void = () => {};

  const setReadout = (nm: number) => {
    const i = Math.round(nm - s.nm[0]);
    const e = P.eV(nm);
    const ok = e >= P.SI_GAP;
    readout.innerHTML =
      `<span><i class="dot" style="background:${wlColor(nm)}"></i><b>${fmt(nm)} nm</b> · ${colourName(nm)}</span>` +
      `<span>Photon energy <b>${e.toFixed(2)} eV</b></span>` +
      `<span>Space <b>${s.top[i].toFixed(2)}</b> · ground <b>${s.ground[i].toFixed(2)}</b> W/m²/nm</span>` +
      `<span class="tag ${ok ? 'yes' : 'no'}">${ok ? 'Silicon can absorb it' : 'Passes through silicon'}</span>`;
  };

  onWidth(host, (W) => {
    const H = Math.round(clamp(W * 0.48, 250, 380));
    const f = frame(host, W, H, { l: 46, r: 12, t: 22, b: 40 });
    const x = linear(250, 2500, f.m.l, W - f.m.r);
    const y = linear(0, 2.3, H - f.m.b, f.m.t);
    yAxis(f, y, [0, 0.5, 1, 1.5, 2], 'W / m² / nm', (v) => v.toFixed(1));

    // band labels
    const bands: [number, number, string][] = [[250, 380, 'UV'], [380, 750, 'Visible'], [750, 2500, 'Infrared']];
    for (const [a, b, name] of bands) {
      svg('rect', { x: x(a), y: f.m.t - 16, width: x(b) - x(a) - 1, height: 3, rx: 1.5, fill: name === 'Visible' ? 'url(#vis-strip)' : '#d9d2c5' }, f.root);
      svg('text', { x: (x(a) + x(b)) / 2, y: f.m.t - 2, 'text-anchor': 'middle', style: 'font-weight:600' }, f.root).textContent = name === 'UV' && W < 500 ? '' : name;
    }
    rainbowGradient(f.root, 'vis-strip', x, 380, 750, (v) => v);
    const fillId = rainbowGradient(f.root, 'spec-fill', x, 250, 2500, (v) => v, 0.85);

    const step = W < 500 ? 4 : 2;
    const gp: [number, number][] = [[x(250), y(0)]];
    const tp: [number, number][] = [];
    for (let i = 0; i < s.nm.length; i += step) {
      if (s.nm[i] > 2500) break;
      gp.push([x(s.nm[i]), y(s.ground[i])]);
      tp.push([x(s.nm[i]), y(s.top[i])]);
    }
    gp.push([x(2500), y(0)]);
    svg('path', { d: pathFrom(gp) + 'Z', fill: fillId }, f.root);
    svg('path', { d: pathFrom(tp), fill: 'none', stroke: '#1c1b18', 'stroke-width': 1.6 }, f.root);

    // silicon threshold
    const gx = x(P.nmFromEV(P.SI_GAP));
    svg('line', { x1: gx, x2: gx, y1: f.m.t + 4, y2: H - f.m.b, stroke: '#1c1b18', 'stroke-dasharray': '3 3', 'stroke-width': 1 }, f.root);
    const lab = svg('text', { x: gx + 6, y: y(1.95), style: 'fill:#1c1b18;font-weight:600' }, f.root);
    lab.textContent = 'Silicon\u2019s limit';
    svg('text', { x: gx + 6, y: y(1.95) + 13 }, f.root).textContent = '1,107 nm';
    svg('text', { x: gx - 6, y: y(1.95) + 13, 'text-anchor': 'end' }, f.root).textContent = W < 520 ? '' : '\u2190 can be absorbed';
    // peak label
    svg('text', { x: x(502) + 8, y: y(2.06) - 4 }, f.root).textContent = W < 420 ? '' : 'peak ≈ 500 nm';

    xAxis(f, x, [500, 1000, 1500, 2000, 2500], 'Wavelength (nanometres)', (v) => fmt(v));

    // cursor
    const cur = svg('g', { 'pointer-events': 'none' }, f.root);
    const cl = svg('line', { y1: f.m.t, y2: H - f.m.b, stroke: '#1c1b18', 'stroke-width': 1, opacity: 0.6 }, cur);
    const c1 = svg('circle', { r: 4.5, fill: '#fff', stroke: '#1c1b18', 'stroke-width': 1.5 }, cur);
    const c2 = svg('circle', { r: 4.5, stroke: '#fff', 'stroke-width': 1.5 }, cur);
    draw = (nm) => {
      if (nm === null) return;
      const i = Math.round(nm - s.nm[0]);
      const px = x(nm);
      attr(cl, { x1: px, x2: px });
      attr(c1, { cx: px, cy: y(s.top[i]) });
      attr(c2, { cx: px, cy: y(s.ground[i]), fill: wlColor(nm) });
      setReadout(nm);
    };
    const hit = svg('rect', { x: f.m.l, y: 0, width: W - f.m.l - f.m.r, height: H, fill: 'transparent' }, f.root);
    scrub(hit, (px) => { cursor = Math.round(clamp(x.inv(px + f.m.l), 280, 2500)); draw(cursor); });
    draw(cursor);
  });
}

// ---------------------------------------------------------------- energy budget
const MATERIALS: [string, number][] = [
  ['Germanium', 0.67], ['Silicon', 1.12], ['Gallium arsenide', 1.42], ['Cadmium telluride', 1.5],
  ['Perovskite', 1.6], ['Amorphous silicon', 1.7], ['Gallium indium phosphide', 1.9],
];

export function budgetChart(host: HTMLElement, slider: HTMLInputElement, out: HTMLElement, chips: HTMLElement, bars: HTMLElement) {
  const s = P.spectrum();
  // power per unit photon energy: P_E = P_lambda * lambda^2 / 1240 (lambda in nm)
  const pts: { e: number; p: number }[] = [];
  for (let i = s.nm.length - 1; i >= 0; i -= 2) {
    const l = s.nm[i];
    const e = P.eV(l);
    if (e < 0.45 || e > 4.2) continue;
    pts.push({ e, p: (s.ground[i] * l * l) / 1239.84 });
  }

  // chips
  chips.innerHTML = '';
  const chipEls = MATERIALS.map(([name, g]) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.textContent = `${name} ${g.toFixed(2)}`;
    b.addEventListener('click', () => gapStore.set(g));
    chips.appendChild(b);
    return { b, g };
  });

  slider.addEventListener('input', () => gapStore.set(+slider.value, slider));

  bars.innerHTML = `<div class="budget-bar"><div class="b-pass"></div><div class="b-heat"></div><div class="b-kept"></div></div><div class="budget-note"></div>`;
  const [bp, bh, bk] = Array.from(bars.querySelectorAll('.budget-bar > div')) as HTMLElement[];
  const note = bars.querySelector('.budget-note') as HTMLElement;

  let redraw: (g: number) => void = () => {};
  onWidth(host, (W) => {
    const H = Math.round(clamp(W * 0.42, 240, 340));
    const f = frame(host, W, H, { l: 46, r: 12, t: 14, b: 66 });
    const x = linear(0.45, 4.2, f.m.l, W - f.m.r);
    const y = linear(0, 1350, H - f.m.b, f.m.t);
    yAxis(f, y, [0, 400, 800, 1200], 'W / m² / eV');
    // visible strip under axis
    const vid = rainbowGradient(f.root, 'bud-vis', x, 1.65, 3.26, (e) => P.nmFromEV(e));
    svg('rect', { x: x(1.65), y: H - f.m.b + 26, width: x(3.26) - x(1.65), height: 4, rx: 2, fill: vid }, f.root);
    xAxis(f, x, [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4], 'Photon energy (eV)', (v) => v.toFixed(1));
    svg('text', { x: (x(1.65) + x(3.26)) / 2, y: H - f.m.b + 44, 'text-anchor': 'middle' }, f.root).textContent = W < 420 ? '' : 'visible';
    svg('text', { x: x(0.6), y: H - f.m.b + 44, 'text-anchor': 'start' }, f.root).textContent = W < 420 ? '' : '\u2190 infrared';

    const passP = svg('path', { fill: 'var(--pass)' }, f.root);
    const heatP = svg('path', { fill: 'var(--heat)', opacity: 0.92 }, f.root);
    const keptP = svg('path', { fill: 'var(--kept)', opacity: 0.95 }, f.root);
    const outline = pathFrom(pts.map((q) => [x(q.e), y(q.p)]));
    svg('path', { d: outline, fill: 'none', stroke: '#5f584d', 'stroke-width': 0.8 }, f.root);
    const gl = svg('line', { y1: f.m.t, y2: H - f.m.b, stroke: '#1c1b18', 'stroke-width': 1.5 }, f.root);
    const gt = svg('text', { y: f.m.t + 10, style: 'fill:#1c1b18;font-weight:650' }, f.root);
    const knob = svg('circle', { r: 7, cy: f.m.t + 26, fill: '#fff', stroke: '#1c1b18', 'stroke-width': 2 }, f.root);

    redraw = (g: number) => {
      const below = pts.filter((q) => q.e < g);
      const above = pts.filter((q) => q.e >= g);
      const y0 = y(0);
      const pp: [number, number][] = [[x(below[0]?.e ?? g), y0], ...below.map((q) => [x(q.e), y(q.p)] as [number, number]), [x(g), y0]];
      attr(passP, { d: pathFrom(pp) + 'Z' });
      if (above.length) {
        const top = above.map((q) => [x(q.e), y(q.p)] as [number, number]);
        const kept = above.map((q) => [x(q.e), y((q.p * g) / q.e)] as [number, number]);
        attr(heatP, { d: pathFrom([...top, ...kept.slice().reverse()]) + 'Z' });
        attr(keptP, { d: pathFrom([[x(above[0].e), y0], ...kept, [x(above[above.length - 1].e), y0]]) + 'Z' });
      }
      const gx = x(g);
      attr(gl, { x1: gx, x2: gx });
      attr(knob, { cx: gx });
      const right = gx < W - 150;
      attr(gt, { x: right ? gx + 8 : gx - 8, 'text-anchor': right ? 'start' : 'end' });
      gt.textContent = `Gap ${g.toFixed(2)} eV`;
    };
    const hit = svg('rect', { x: f.m.l, y: 0, width: W - f.m.l - f.m.r, height: H - f.m.b, fill: 'transparent', style: 'cursor:ew-resize' }, f.root);
    scrub(hit, (px, _py, type, e) => {
      // mouse: only a press or drag changes the gap (hover would be too twitchy)
      if (type === 'move' && e.pointerType === 'mouse' && !e.buttons) return;
      gapStore.set(+clamp(x.inv(px + f.m.l), 0.5, 2.5).toFixed(2));
    });
    redraw(gapStore.get());
  });

  gapStore.sub((g, src) => {
    if (src !== slider) slider.value = String(g);
    out.textContent = `${g.toFixed(2)} eV`;
    chipEls.forEach((c) => c.b.classList.toggle('on', Math.abs(c.g - g) < 0.005));
    redraw(g);
    const b = P.gapBudget(g);
    const pc = (v: number) => `${Math.round(v * 100)}%`;
    bp.style.flex = `${b.notAbsorbed} 1 0`; bp.textContent = b.notAbsorbed > 0.09 ? pc(b.notAbsorbed) : '';
    bh.style.flex = `${b.heat} 1 0`; bh.textContent = b.heat > 0.09 ? pc(b.heat) : '';
    bk.style.flex = `${b.kept} 1 0`; bk.textContent = b.kept > 0.09 ? pc(b.kept) : '';
    note.innerHTML = `<span>Passes through <b>${pc(b.notAbsorbed)}</b></span><span>Heat <b>${pc(b.heat)}</b></span><span>Captured <b>${pc(b.kept)}</b></span><span>Best possible efficiency <b>${(b.sq * 100).toFixed(1)}%</b></span>`;
  });
}

// ---------------------------------------------------------------- Shockley–Queisser
export function sqChart(host: HTMLElement) {
  const data = P.sqCurveData();
  let mark: (g: number) => void = () => {};
  onWidth(host, (W) => {
    const H = Math.round(clamp(W * 0.55, 230, 320));
    const f = frame(host, W, H, { l: 46, r: 14, t: 12, b: 40 });
    const x = linear(0.5, 2.5, f.m.l, W - f.m.r);
    const y = linear(0, 50, H - f.m.b, f.m.t);
    yAxis(f, y, [0, 10, 20, 30, 40, 50], 'Efficiency (%)');
    xAxis(f, x, [0.5, 1, 1.5, 2, 2.5], 'Band gap (eV)', (v) => v.toFixed(1));
    svg('path', { d: pathFrom(data.map((d) => [x(d.gap), y(d.kept * 100)])), fill: 'none', stroke: '#8d857a', 'stroke-width': 1.4, 'stroke-dasharray': '4 4' }, f.root);
    svg('path', { d: pathFrom(data.map((d) => [x(d.gap), y(d.sq * 100)])), fill: 'none', stroke: 'var(--kept)', 'stroke-width': 2.5 }, f.root);
    const lab = (g: number) => data.reduce((a, b) => (Math.abs(b.gap - g) < Math.abs(a.gap - g) ? b : a));
    const k = lab(2.2);
    svg('text', { x: x(2.2), y: y(k.kept * 100) - 8, 'text-anchor': 'middle' }, f.root).textContent = 'gap + pass-through only';
    const k2 = lab(2.2);
    svg('text', { x: x(2.2), y: y(k2.sq * 100) + 18, 'text-anchor': 'middle', style: 'fill:#0c6b5a;font-weight:600' }, f.root).textContent = 'Shockley–Queisser limit';
    for (const [name, g] of [['Si', 1.12], ['GaAs', 1.42], ['Ge', 0.67], ['CdTe', 1.5]] as [string, number][]) {
      const b = P.gapBudget(g);
      svg('circle', { cx: x(g), cy: y(b.sq * 100), r: 3, fill: '#1c1b18' }, f.root);
      if (W > 380 || name === 'Si') svg('text', { x: x(g), y: y(b.sq * 100) + (name === 'CdTe' ? 16 : -8), 'text-anchor': 'middle', style: 'fill:#1c1b18' }, f.root).textContent = name;
    }
    const ml = svg('line', { y1: f.m.t, y2: H - f.m.b, stroke: '#1c1b18', 'stroke-dasharray': '2 3' }, f.root);
    const md = svg('circle', { r: 6, fill: '#fff', stroke: 'var(--kept)', 'stroke-width': 2.5 }, f.root);
    const mt = svg('text', { style: 'fill:#1c1b18;font-weight:650' }, f.root);
    mark = (g) => {
      const b = P.gapBudget(g);
      const gx = x(g), gy = y(b.sq * 100);
      attr(ml, { x1: gx, x2: gx });
      attr(md, { cx: gx, cy: gy });
      const right = gx < W - 110;
      attr(mt, { x: right ? gx + 10 : gx - 10, y: gy - 12, 'text-anchor': right ? 'start' : 'end' });
      mt.textContent = `${(b.sq * 100).toFixed(1)}%`;
    };
    const hit = svg('rect', { x: f.m.l, y: 0, width: W - f.m.l - f.m.r, height: H - f.m.b, fill: 'transparent', style: 'cursor:ew-resize' }, f.root);
    scrub(hit, (px, _py, type, e) => {
      if (type === 'move' && e.pointerType === 'mouse' && !e.buttons) return;
      gapStore.set(+clamp(x.inv(px + f.m.l), 0.5, 2.5).toFixed(2));
    });
    mark(gapStore.get());
  });
  gapStore.sub((g) => mark(g));
}

// ---------------------------------------------------------------- absorption depth
function fmtLen(m: number) {
  if (m < 1e-6) return `${fmt(m * 1e9, m < 1e-8 ? 1 : 0)} nm`;
  if (m < 1e-3) return `${fmt(m * 1e6, m < 1e-5 ? 1 : 0)} µm`;
  if (m < 1e-2) return `${fmt(m * 1e3, 1)} mm`;
  if (m < 1) return `${fmt(m * 1e2, 1)} cm`;
  return `${fmt(m, 1)} m`;
}

export function depthChart(host: HTMLElement, readout: HTMLElement) {
  const WAFER = 160e-6, JUNCTION = 0.4e-6;
  let draw: (nm: number) => void = () => {};
  const setReadout = (nm: number) => {
    const d = P.absorptionDepth(nm);
    let cmp = '';
    if (d < JUNCTION) cmp = 'caught right at the front, near the junction';
    else if (d < WAFER * 0.5) cmp = `${fmt((d / WAFER) * 100, d / WAFER < 0.1 ? 1 : 0)}% of the way through a typical wafer`;
    else if (d < WAFER) cmp = 'most of the way through a typical wafer';
    else cmp = `${fmt(d / WAFER, d / WAFER < 10 ? 1 : 0)}× the wafer\u2019s thickness: needs light trapping`;
    readout.innerHTML = `<span><i class="dot" style="background:${wlColor(nm)}"></i><b>${fmt(nm)} nm</b> · ${colourName(nm)}</span><span>Depth <b>${fmtLen(d)}</b></span><span>${cmp}</span>`;
  };
  onWidth(host, (W) => {
    const H = Math.round(clamp(W * 0.5, 270, 380));
    const f = frame(host, W, H, { l: 58, r: 12, t: 12, b: 40 });
    const x = linear(300, 1200, f.m.l, W - f.m.r);
    const y = log10(1e-9, 1, f.m.t, H - f.m.b); // depth grows downward, like going into the wafer
    // wafer band
    svg('rect', { x: f.m.l, y: y(1e-9), width: W - f.m.l - f.m.r, height: y(WAFER) - y(1e-9), fill: '#eef2fb' }, f.root);
    const dec = [1e-9, 1e-8, 1e-7, 1e-6, 1e-5, 1e-4, 1e-3, 1e-2, 1e-1, 1];
    yAxis(f, y, dec, 'Depth into silicon', (v) => (({ 1e-9: '1 nm', 1e-8: '10 nm', 1e-7: '100 nm', 1e-6: '1 µm', 1e-5: '10 µm', 1e-4: '100 µm', 1e-3: '1 mm', 1e-2: '1 cm', 1e-1: '10 cm', 1: '1 m' }) as Record<number, string>)[v]);
    for (const [d, t] of [[JUNCTION, 'junction (~0.4 µm)'], [WAFER, 'back of a typical wafer (0.16 mm)']] as [number, string][]) {
      svg('line', { x1: f.m.l, x2: W - f.m.r, y1: y(d), y2: y(d), stroke: '#2a64e8', 'stroke-dasharray': '4 3', 'stroke-width': 1.2 }, f.root);
      svg('text', { x: W - f.m.r - 4, y: y(d) - 5, 'text-anchor': 'end', style: 'fill:#2a4fa8;font-weight:600' }, f.root).textContent = t;
    }
    svg('text', { x: f.m.l + 6, y: y(1e-9) + 14, style: 'fill:#2a4fa8' }, f.root).textContent = 'front surface';
    const gid = rainbowGradient(f.root, 'depth-line', x, 300, 1200, (v) => v);
    const pts: [number, number][] = [];
    for (let l = 300; l <= 1200; l += 3) pts.push([x(l), y(P.absorptionDepth(l))]);
    svg('path', { d: pathFrom(pts), fill: 'none', stroke: gid, 'stroke-width': 3.5, 'stroke-linecap': 'round' }, f.root);
    svg('path', { d: pathFrom(pts), fill: 'none', stroke: '#1c1b18', 'stroke-width': 0.6, opacity: 0.5 }, f.root);
    xAxis(f, x, niceTicks(300, 1200, 6), 'Wavelength (nanometres)', (v) => fmt(v));
    const cur = svg('g', { 'pointer-events': 'none' }, f.root);
    const cl = svg('line', { y1: f.m.t, y2: H - f.m.b, stroke: '#1c1b18', opacity: 0.5 }, cur);
    const cd = svg('circle', { r: 5.5, stroke: '#1c1b18', 'stroke-width': 1.5 }, cur);
    draw = (nm) => {
      attr(cl, { x1: x(nm), x2: x(nm) });
      attr(cd, { cx: x(nm), cy: y(P.absorptionDepth(nm)), fill: wlColor(nm) });
      setReadout(nm);
    };
    const hit = svg('rect', { x: f.m.l, y: 0, width: W - f.m.l - f.m.r, height: H, fill: 'transparent' }, f.root);
    scrub(hit, (px) => draw(Math.round(clamp(x.inv(px + f.m.l), 300, 1200))));
    draw(650);
  });
}
