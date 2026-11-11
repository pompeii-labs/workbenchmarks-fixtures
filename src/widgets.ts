// Explanatory widgets: photon energy, band-gap ladder, doping sketch, journey timeline.
import * as P from './physics';
import { svg, html, attr, linear, log10, onWidth, wlColor, colourName, fmt, clamp, animate, reducedMotion } from './util';

// ---------------------------------------------------------------- photon packet
const PRESETS: [string, number][] = [['UV', 350], ['Violet', 410], ['Blue', 460], ['Green', 530], ['Yellow', 580], ['Red', 650], ['Near IR', 950], ['Infrared', 1400]];

export function photonWidget(host: HTMLElement) {
  host.innerHTML = '';
  const top = html('div', { class: 'photon-top' }, host);
  const id = html('div', { class: 'photon-id' }, top);
  const sw = html('div', { class: 'photon-swatch' }, id);
  const idt = html('div', {}, id);
  const big = html('div', { class: 'big' }, idt);
  const name = html('small', {}, idt);
  const en = html('div', { class: 'photon-id' }, top);
  const ent = html('div', { style: 'text-align:right' }, en);
  const ebig = html('div', { class: 'big' }, ent);
  const etag = html('small', {}, ent);
  const waveHost = html('div', {}, host);
  const barHost = html('div', {}, host);
  const row = html('div', { class: 'slider-row' }, host);
  html('label', { for: 'wl-slider' }, row, 'Wavelength');
  const slider = html('input', { id: 'wl-slider', type: 'range', min: 300, max: 1600, step: 1, value: 530 }, row) as HTMLInputElement;
  const out = html('output', {}, row);
  const stops: string[] = [];
  for (let l = 300; l <= 1600; l += 50) stops.push(`${wlColor(l)} ${(((l - 300) / 1300) * 100).toFixed(1)}%`);
  slider.style.setProperty('--track', `linear-gradient(90deg, ${stops.join(',')})`);
  const pre = html('div', { class: 'presets' }, host);
  for (const [n, l] of PRESETS) {
    const b = html('button', { type: 'button', class: 'chip' }, pre, n);
    b.addEventListener('click', () => { slider.value = String(l); update(); });
  }

  let nm = 530, W = 600;
  let wave: SVGPathElement | null = null, waveSvg: SVGSVGElement | null = null;
  let bar: { fill: SVGRectElement; x: (e: number) => number; txt: SVGTextElement } | null = null;

  const buildBar = (w: number) => {
    barHost.innerHTML = '';
    const H = 64;
    const s = svg('svg', { viewBox: `0 0 ${w} ${H}`, width: w, height: H }, barHost);
    const x = linear(0, 4.2, 16, w - 16);
    svg('rect', { x: x(0), y: 18, width: x(4.2) - x(0), height: 14, rx: 7, fill: '#efe9de' }, s);
    const fill = svg('rect', { x: x(0), y: 18, height: 14, rx: 7 }, s);
    const gx = x(P.SI_GAP);
    svg('line', { x1: gx, x2: gx, y1: 10, y2: 40, stroke: '#1c1b18', 'stroke-width': 1.5 }, s);
    svg('text', { x: gx + 5, y: 12, style: 'font-size:11px;fill:#1c1b18;font-weight:600;font-family:var(--sans)' }, s).textContent = 'silicon needs 1.12 eV';
    for (const t of [0, 1, 2, 3, 4]) svg('text', { x: x(t), y: 52, 'text-anchor': 'middle', style: 'font-size:10.5px;fill:#6b655c;font-family:var(--sans)' }, s).textContent = `${t} eV`;
    const txt = svg('text', { y: 29, style: 'font-size:10.5px;fill:#fff;font-weight:700;font-family:var(--sans)' }, s);
    bar = { fill, x, txt };
  };

  const update = () => {
    nm = +slider.value;
    const e = P.eV(nm);
    const c = wlColor(nm);
    sw.style.background = c; sw.style.setProperty('--glow', wlColor(nm, 0.6));
    big.textContent = `${fmt(nm)} nm`;
    name.textContent = colourName(nm) + (nm < 380 || nm > 750 ? ' (invisible to us)' : '');
    ebig.textContent = `${e.toFixed(2)} eV`;
    etag.innerHTML = e >= P.SI_GAP ? '<span class="tag yes">enough for silicon</span>' : '<span class="tag no">too little for silicon</span>';
    out.textContent = `${fmt(nm)} nm`;
    if (bar) {
      attr(bar.fill, { width: Math.max(14, bar.x(Math.min(e, 4.2)) - bar.x(0)), fill: c });
    }
    if (waveSvg) waveSvg.style.setProperty('--wc', c);
  };

  onWidth(host, (w) => {
    W = w;
    waveHost.innerHTML = '';
    const H = 110;
    waveSvg = svg('svg', { viewBox: `0 0 ${w} ${H}`, width: w, height: H }, waveHost);
    svg('line', { x1: 0, x2: w, y1: H / 2, y2: H / 2, stroke: '#ece7de' }, waveSvg);
    wave = svg('path', { fill: 'none', stroke: 'var(--wc)', 'stroke-width': 3, 'stroke-linecap': 'round' }, waveSvg);
    buildBar(w);
    update();
    drawWave(0);
  });

  const drawWave = (t: number) => {
    if (!wave) return;
    const H = 110, A = 34;
    const lpx = (nm * W) / 2300; // to scale: 2,300 nm across the full width
    const phase = reducedMotion() ? 0 : (t * 90) % lpx; // same speed for every colour
    // wave packet: envelope makes it read as a "packet"
    let d = '';
    for (let x = 0; x <= W; x += 2) {
      const env = Math.exp(-(((x - W / 2) / (W * 0.33)) ** 4));
      const yv = H / 2 - A * env * Math.sin((2 * Math.PI * (x - phase)) / lpx);
      d += (x ? 'L' : 'M') + x + ',' + yv.toFixed(1);
    }
    attr(wave, { d });
  };
  slider.addEventListener('input', update);
  animate(host, (t) => drawWave(t));
}

// ---------------------------------------------------------------- band-gap ladder
const LADDER_PRESETS: [string, number][] = [['Infrared 1,300 nm', 1300], ['Near IR 1,000 nm', 1000], ['Red 650 nm', 650], ['Green 530 nm', 530], ['Blue 450 nm', 450], ['UV 365 nm', 365]];

export function ladderWidget(host: HTMLElement) {
  host.innerHTML = '';
  const svgHost = html('div', {}, host);
  const row = html('div', { class: 'slider-row' }, host);
  html('label', { for: 'ladder-e' }, row, 'Photon energy');
  const slider = html('input', { id: 'ladder-e', type: 'range', min: 0.6, max: 3.5, step: 0.01, value: 1.91 }, row) as HTMLInputElement;
  const out = html('output', {}, row);
  const stops: string[] = [];
  for (let e = 0.6; e <= 3.5; e += 0.1) stops.push(`${wlColor(P.nmFromEV(e))} ${(((e - 0.6) / 2.9) * 100).toFixed(1)}%`);
  slider.style.setProperty('--track', `linear-gradient(90deg, ${stops.join(',')})`);
  const pre = html('div', { class: 'presets' }, host);
  for (const [n, l] of LADDER_PRESETS) {
    const b = html('button', { type: 'button', class: 'chip' }, pre, n);
    b.addEventListener('click', () => { slider.value = P.eV(l).toFixed(2); fire(); });
  }
  const again = html('button', { type: 'button', class: 'chip', style: 'font-weight:600' }, pre, '↻ Fire again');
  again.addEventListener('click', () => fire());
  const status = html('p', { class: 'status', 'aria-live': 'polite' }, host);

  const Eg = P.SI_GAP;
  let E = 1.91, t0 = -10, now = 0;
  let parts: null | {
    photon: SVGPathElement; el: SVGCircleElement; hole: SVGCircleElement; heat: SVGGElement; flash: SVGCircleElement;
    y: (e: number) => number; xT: number; W: number; barKept: SVGRectElement; barHeat: SVGRectElement; barPass: SVGRectElement;
    barTxtK: SVGTextElement; barTxtH: SVGTextElement; by: (e: number) => number; topLabel: SVGTextElement; xL: number; xR: number;
  } = null;

  onWidth(host, (W) => {
    svgHost.innerHTML = '';
    const narrow = W < 560;
    const H = narrow ? 360 : 380;
    const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, style: 'font-family:var(--sans)' }, svgHost);
    const y = linear(-0.9, 3.7, H - 16, 14);
    const xL = narrow ? 54 : 70, xR = narrow ? W - 128 : W * 0.66;
    const defs = svg('defs', {}, s);
    const pat = svg('pattern', { id: 'hatch', width: 7, height: 7, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
    svg('line', { x1: 0, y1: 0, x2: 0, y2: 7, stroke: '#e4ded3', 'stroke-width': 3 }, pat);
    // bands
    svg('rect', { x: xL, y: y(3.7), width: xR - xL, height: y(Eg) - y(3.7), fill: '#e8eefc', rx: 6 }, s);
    svg('rect', { x: xL, y: y(Eg), width: xR - xL, height: y(0) - y(Eg), fill: 'url(#hatch)' }, s);
    svg('rect', { x: xL, y: y(0), width: xR - xL, height: y(-0.9) - y(0), fill: '#d6dbea', rx: 6 }, s);
    // filled valence band electrons
    const gEl = svg('g', {}, s);
    for (let yy = y(0) + 10; yy < y(-0.9) - 22; yy += 14) for (let xx = xL + 12; xx < xR - 6; xx += 14) svg('circle', { cx: xx, cy: yy, r: 3.6, fill: 'var(--electron)', opacity: 0.75 }, gEl);
    const T = (x: number, yy: number, t: string, st = '', anchor = 'start') => { const e = svg('text', { x, y: yy, 'text-anchor': anchor, style: 'font-size:12px;fill:#3b3833;' + st }, s); e.textContent = t; return e; };
    T(xL + 10, y(3.7) + 18, narrow ? 'Conduction band' : 'Conduction band: free electrons', 'font-weight:650');
    T(xL + 10, y(3.7) + 34, narrow ? 'free electrons; empty in the dark' : 'empty in the dark', 'fill:#6b655c;font-size:11px');
    T((xL + xR) / 2, (y(0) + y(Eg)) / 2 + 4, narrow ? 'gap: no rungs' : 'band gap: no allowed energies', 'font-weight:650;fill:#6b655c', 'middle');
    T(xL + 10, y(-0.9) - 8, narrow ? 'Valence band (full)' : 'Valence band: electrons locked in bonds (full)', 'font-weight:650;fill:#fff');
    // gap brace
    const bx = xL - 12;
    svg('path', { d: `M${bx},${y(0)} l-6,0 l0,${y(Eg) - y(0)} l6,0`, fill: 'none', stroke: '#1c1b18', 'stroke-width': 1.3 }, s);
    T(bx - 10, (y(0) + y(Eg)) / 2 + 4, '1.12', 'font-weight:700', 'end');
    T(bx - 10, (y(0) + y(Eg)) / 2 + 18, 'eV', 'fill:#6b655c', 'end');
    T(8, y(3.7) + 4, 'Energy ↑', 'fill:#6b655c;font-size:11px');

    const xT = xL + (xR - xL) * 0.42;
    const heat = svg('g', {}, s);
    const hole = svg('circle', { cx: xT, cy: y(0) + 10, r: 5, fill: '#fff', stroke: 'var(--hole)', 'stroke-width': 2.2, opacity: 0 }, s);
    const el = svg('circle', { cx: xT, cy: y(0) + 10, r: 6, fill: 'var(--electron)', stroke: '#fff', 'stroke-width': 1.5, opacity: 0 }, s);
    const flash = svg('circle', { cx: xT, cy: y(0) + 10, r: 4, fill: '#fff6c8', opacity: 0 }, s);
    const photon = svg('path', { fill: 'none', 'stroke-width': 3, 'stroke-linecap': 'round' }, s);

    // energy accounting bar
    const bxL = narrow ? W - 116 : W * 0.74, bw = narrow ? 30 : 38;
    const lblX = narrow ? bxL + bw + 5 : bxL - 6, lblA = narrow ? 'start' : 'end';
    const by = y; // same energy scale as the ladder, so the bar lines up with it
    const tlx = narrow ? bxL : bxL + bw / 2, tla = narrow ? 'start' : 'middle';
    T(tlx, by(3.7) + (narrow ? 64 : 18), 'This photon', 'font-weight:650', tla);
    const topLabel = T(tlx, by(3.7) + (narrow ? 78 : 32), '', 'fill:#6b655c;font-size:11px', tla);
    const barPass = svg('rect', { x: bxL, width: bw, fill: 'var(--pass)', rx: 4 }, s);
    const barKept = svg('rect', { x: bxL, width: bw, fill: 'var(--kept)', rx: 4 }, s);
    const barHeat = svg('rect', { x: bxL, width: bw, fill: 'var(--heat)', rx: 4 }, s);
    const barTxtK = T(lblX, 0, '', 'font-size:11px;fill:#0c6b5a;font-weight:650', lblA);
    const barTxtH = T(lblX, 0, '', 'font-size:11px;fill:#b45a0d;font-weight:650', lblA);
    parts = { photon, el, hole, heat, flash, y, xT, W, barKept, barHeat, barPass, barTxtK, barTxtH, by, topLabel, xL, xR };
    setBars();
    render();
  });

  const setBars = () => {
    if (!parts) return;
    const { by, barKept, barHeat, barPass, barTxtK, barTxtH, topLabel } = parts;
    const y0 = by(0);
    const absorbed = E >= Eg;
    out.textContent = `${E.toFixed(2)} eV`;
    topLabel.textContent = `${fmt(P.nmFromEV(E))} nm · ${E.toFixed(2)} eV`;
    if (!absorbed) {
      attr(barPass, { y: by(E), height: y0 - by(E), opacity: 1 });
      attr(barKept, { height: 0, opacity: 0 }); attr(barHeat, { height: 0, opacity: 0 });
      barTxtK.textContent = 'not absorbed'; attr(barTxtK, { y: (by(E) + y0) / 2 + 4, style: 'font-size:11px;fill:#6b655c;font-weight:650' });
      barTxtH.textContent = '';
    } else {
      attr(barPass, { height: 0, opacity: 0 });
      attr(barKept, { y: by(Eg), height: y0 - by(Eg), opacity: 1 });
      attr(barHeat, { y: by(E), height: Math.max(0, by(Eg) - by(E) - 1.5), opacity: 1 });
      barTxtK.textContent = `kept ${Eg.toFixed(2)}`; attr(barTxtK, { y: (by(Eg) + y0) / 2 + 4, style: 'font-size:11px;fill:#0c6b5a;font-weight:650' });
      barTxtH.textContent = E - Eg > 0.08 ? `heat ${(E - Eg).toFixed(2)}` : '';
      attr(barTxtH, { y: (by(E) + by(Eg)) / 2 + 4 });
    }
  };

  const msg = () => {
    if (E < Eg) return `At ${E.toFixed(2)} eV the photon can't lift an electron across the 1.12 eV gap, and there is no rung partway, so it passes straight through.`;
    const heat = E - Eg;
    if (heat < 0.15) return `A near-perfect match: the electron lands just above the bottom of the conduction band, and almost nothing is wasted.`;
    return `Absorbed. The electron jumps ${E.toFixed(2)} eV, then tumbles to the bottom of the conduction band, shedding ${heat.toFixed(2)} eV (${Math.round((heat / E) * 100)}% of the photon) as heat.`;
  };

  const fire = () => {
    E = +slider.value;
    t0 = now;
    setBars();
    status.textContent = msg();
    if (parts) parts.heat.innerHTML = '';
    if (reducedMotion()) t0 = now - 10;
    render();
  };

  // timeline (seconds after fire): 0-0.7 photon travels in; 0.7-1.0 jump; 1.0-2.4 relax with heat puffs
  const render = () => {
    if (!parts) return;
    const { photon, el, hole, heat, flash, y, xT, xL, xR } = parts;
    const t = now - t0;
    const nm = P.nmFromEV(E);
    const c = wlColor(nm);
    const yV = y(0) + 10;
    const absorbed = E >= Eg;
    const lpx = clamp(nm / 45, 8, 36);
    const head = absorbed ? xL + (xT - xL) * clamp(t / 0.7, 0, 1) : xL + (xR + 60 - xL) * clamp(t / 1.6, 0, 1);
    const len = 70;
    let d = '';
    const startX = head - len;
    for (let x = Math.max(startX, xL - 40); x <= head; x += 2) {
      const yy = yV - 30 - 7 * Math.sin((2 * Math.PI * (x - head)) / lpx);
      d += (d ? 'L' : 'M') + x.toFixed(1) + ',' + yy.toFixed(1);
    }
    const photonVisible = absorbed ? t < 0.72 : t < 1.6;
    attr(photon, { d, stroke: c, opacity: photonVisible ? (absorbed ? 1 : clamp(1.5 - t, 0.25, 1)) : 0 });
    if (!absorbed || t < 0.7) {
      attr(el, { opacity: 0 }); attr(hole, { opacity: 0 }); attr(flash, { opacity: 0 });
      return;
    }
    attr(hole, { opacity: 1 });
    const tj = clamp((t - 0.7) / 0.3, 0, 1);
    const ease = 1 - (1 - tj) ** 3;
    let ey = yV + (y(E) - yV) * ease;
    if (t > 1.05) {
      // relaxation: stepwise descent from E to Eg, each step gives off a heat puff
      const tr = clamp((t - 1.05) / 1.4, 0, 1);
      const steps = Math.max(1, Math.round((E - Eg) / 0.12));
      const k = Math.min(steps, Math.floor(tr * steps + 1e-6));
      const frac = tr * steps - k;
      const eNow = E - ((E - Eg) * (k + clamp(frac * 3, 0, 1))) / steps;
      ey = y(Math.max(Eg + 0.02, eNow)) ;
      while (heat.childNodes.length < k && E - Eg > 0.05) {
        const i = heat.childNodes.length;
        const yy = y(E - ((E - Eg) * (i + 1)) / steps);
        const sx = xT + 14;
        svg('path', { d: `M${sx},${yy} q4,-5 8,0 t8,0 t8,0`, fill: 'none', stroke: 'var(--heat)', 'stroke-width': 2, 'stroke-linecap': 'round', opacity: 0.9 }, heat);
      }
    }
    attr(el, { cy: ey, opacity: 1 });
    attr(flash, { r: 4 + 26 * tj, opacity: 0.8 * (1 - tj) });
    // fade heat puffs and drift them
    heat.childNodes.forEach((n, i) => (n as SVGElement).setAttribute('transform', `translate(${Math.min(40, (t - 1.05 - i * 0.1) * 30)},0)`));
  };

  slider.addEventListener('input', () => { E = +slider.value; setBars(); status.textContent = msg(); });
  slider.addEventListener('change', () => fire());
  animate(host, (tt) => { now = tt; if (t0 < 0) { t0 = now - 0.2; fire(); } render(); });
  E = +slider.value; setBars(); status.textContent = msg();
}

// ---------------------------------------------------------------- doping sketch
export function dopingSketch(host: HTMLElement) {
  onWidth(host, (W) => {
    host.innerHTML = '';
    const stack = W < 520;
    const pw = 300, ph = 290;
    const VW = stack ? pw : pw * 2 + 20, VH = stack ? ph * 2 + 10 : ph;
    const s = svg('svg', { viewBox: `0 0 ${VW} ${VH}`, width: W, height: (W * VH) / VW, style: 'font-family:var(--sans)' }, host);
    const panel = (ox: number, oy: number, kind: 'P' | 'B') => {
      const g = svg('g', { transform: `translate(${ox},${oy})` }, s);
      svg('rect', { x: 0, y: 0, width: pw, height: ph, rx: 14, fill: kind === 'P' ? '#eef3ff' : '#fdf0f4' }, g);
      svg('text', { x: 16, y: 26, style: `font-size:14px;font-weight:700;fill:${kind === 'P' ? '#2a4fa8' : '#a3285a'}` }, g).textContent = kind === 'P' ? 'n-type: add phosphorus' : 'p-type: add boron';
      const sp = 72, cx0 = pw / 2 - sp, cy0 = 70;
      const pos = (i: number, j: number) => [cx0 + i * sp, cy0 + j * sp] as const;
      // bonds
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        const [x, y] = pos(i, j);
        for (const [dx, dy] of [[1, 0], [0, 1]] as const) {
          const ni = i + dx, nj = j + dy;
          const [x2, y2] = ni < 3 && nj < 3 ? pos(ni, nj) : [x + dx * 30, y + dy * 30];
          const stub = !(ni < 3 && nj < 3);
          svg('line', { x1: x, y1: y, x2, y2, stroke: '#b9b2a6', 'stroke-width': 5, 'stroke-linecap': 'round' }, g);
          if (stub) continue;
          const isHoleBond = kind === 'B' && i === 1 && j === 1 && dx === 1;
          const mx = (x + x2) / 2, my = (y + y2) / 2;
          const o = 7;
          const e1 = [mx - dx * o, my - dy * o], e2 = [mx + dx * o, my + dy * o];
          svg('circle', { cx: e1[0], cy: e1[1], r: 4.2, fill: 'var(--electron)' }, g);
          if (isHoleBond) svg('circle', { cx: e2[0], cy: e2[1], r: 5, fill: '#fff', stroke: 'var(--hole)', 'stroke-width': 2.2 }, g);
          else svg('circle', { cx: e2[0], cy: e2[1], r: 4.2, fill: 'var(--electron)' }, g);
        }
        // left / top stubs
        for (const [dx, dy] of [[-1, 0], [0, -1]] as const) {
          if ((dx && i === 0) || (dy && j === 0)) svg('line', { x1: x, y1: y, x2: x + dx * 30, y2: y + dy * 30, stroke: '#b9b2a6', 'stroke-width': 5, 'stroke-linecap': 'round' }, g);
        }
      }
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        const [x, y] = pos(i, j);
        const center = i === 1 && j === 1;
        svg('circle', { cx: x, cy: y, r: 17, fill: center ? (kind === 'P' ? '#2a4fa8' : '#a3285a') : '#8a8478' }, g);
        svg('text', { x, y: y + 4.5, 'text-anchor': 'middle', style: 'font-size:12.5px;font-weight:700;fill:#fff' }, g).textContent = center ? kind : 'Si';
      }
      const [cx, cy] = pos(1, 1);
      if (kind === 'P') {
        svg('circle', { cx: cx + 26, cy: cy - 28, r: 5.2, fill: 'var(--electron)', stroke: '#fff', 'stroke-width': 1.5 }, g);
        svg('path', { d: `M${cx + 34},${cy - 34} q30,-24 48,-14`, fill: 'none', stroke: '#2a4fa8', 'stroke-width': 1.3, 'stroke-dasharray': '3 3' }, g);
        svg('text', { x: 16, y: ph - 16, style: 'font-size:12.5px;fill:#2a4fa8;font-weight:600' }, g).textContent = '5th electron has no bond: free to roam';
      } else {
        svg('text', { x: 16, y: ph - 16, style: 'font-size:12.5px;fill:#a3285a;font-weight:600' }, g).textContent = 'Only 3 electrons: one bond has a hole';
      }
    };
    panel(0, 0, 'P');
    if (stack) panel(0, ph + 10, 'B'); else panel(pw + 20, 0, 'B');
  });
}

// ---------------------------------------------------------------- timeline
interface Ev { t: number; title: string; when: string; detail: string; kind: 'sun' | 'cell' | 'wire' }
const EVENTS: Ev[] = [
  { t: 2e-15, title: 'Photon absorbed, electron freed', when: 'femtoseconds', kind: 'cell', detail: 'Absorption is practically instantaneous: an electron is lifted across the gap within a few millionths of a billionth of a second.' },
  { t: 3e-13, title: 'Extra energy shaken off as heat', when: '< 1 picosecond', kind: 'cell', detail: 'An electron freed by a blue photon starts with surplus energy. It hands that surplus to crystal vibrations in well under a trillionth of a second.' },
  { t: 1e-11, title: 'Swept across the junction', when: '~10 picoseconds', kind: 'cell', detail: 'Once an electron reaches the junction, its strong field carries it across the micrometre-wide region in around ten picoseconds.' },
  { t: 1.6e-11, title: 'Through the panel\u2019s cover glass', when: '~16 picoseconds', kind: 'sun', detail: 'A panel\u2019s front glass is about 3 mm thick. Light slows to about two-thirds of its speed in vacuum while crossing it.' },
  { t: 5e-8, title: 'The push travels 10 m of wire', when: '~50 nanoseconds', kind: 'wire', detail: 'The push travels as an electromagnetic wave guided by the wire, at a large fraction of the speed of light. That\u2019s why a lamp lights at once.' },
  { t: 3e-6, title: 'Electron wanders back to the junction', when: 'a few microseconds', kind: 'cell', detail: 'An electron made 100 µm deep in the wafer has no slope to guide it. It reaches the junction by random wandering (diffusion), which takes microseconds.' },
  { t: 3.3e-4, title: 'Crossing the atmosphere', when: '~0.3 milliseconds', kind: 'sun', detail: 'The last hundred kilometres of air take light about a third of a millisecond.' },
  { t: 1e-3, title: 'A free electron\u2019s lifetime', when: 'up to ~1 millisecond', kind: 'cell', detail: 'In very pure silicon, a free electron survives up to about a millisecond before meeting a hole. That\u2019s long enough to reach the junction from anywhere in the wafer.' },
  { t: 499, title: 'Sun to Earth', when: '8 min 20 s', kind: 'sun', detail: '150 million kilometres at the speed of light: 499 seconds.' },
  { t: 3.8e3, title: 'An electron drifts 1 m along the wire', when: '~1 hour', kind: 'wire', detail: 'At 9 amps in an ordinary 2.5 mm² copper wire, the electrons\u2019 average drift is only about a quarter of a millimetre per second.' },
  { t: 3e12, title: 'Energy escapes the Sun\u2019s interior', when: '~100,000 years', kind: 'sun', detail: 'Fusion energy works its way out from the core by countless absorptions and re-emissions. Estimates range from about ten thousand to a few hundred thousand years.' },
];

export function timelineWidget(host: HTMLElement) {
  host.innerHTML = '';
  const svgHost = html('div', {}, host);
  const detail = html('div', { class: 'tl-detail', 'aria-live': 'polite' }, host);
  let sel = 8;
  const showDetail = () => { const e = EVENTS[sel]; detail.innerHTML = `<b>${e.title}</b> · ${e.when}<br>${e.detail}`; };
  const colour = { sun: 'var(--sun-deep)', cell: 'var(--electron)', wire: 'var(--kept)' };
  let marks: SVGGElement[] = [];
  onWidth(host, (W) => {
    svgHost.innerHTML = '';
    const narrow = W < 520;
    const rowH = 46;
    const H = EVENTS.length * rowH + 60;
    const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, style: 'font-family:var(--sans)' }, svgHost);
    const ax = narrow ? 70 : 120;
    const y = log10(1e-15, 1e13, 20, H - 40);
    svg('line', { x1: ax, x2: ax, y1: y(1e-15), y2: y(1e13), stroke: '#cfc7b9', 'stroke-width': 2 }, s);
    const ticks: [number, string][] = [[1e-15, '1 fs'], [1e-12, '1 ps'], [1e-9, '1 ns'], [1e-6, '1 µs'], [1e-3, '1 ms'], [1, '1 s'], [1e3, '17 min'], [1e6, '12 days'], [1e9, '32 yr'], [1e12, '32,000 yr']];
    for (const [t, l] of ticks) {
      svg('line', { x1: ax - 5, x2: ax, y1: y(t), y2: y(t), stroke: '#9d958a' }, s);
      svg('text', { x: ax - 9, y: y(t) + 4, 'text-anchor': 'end', style: 'font-size:11px;fill:#6b655c' }, s).textContent = l;
    }
    // label positions: spread to avoid overlap
    const ys = EVENTS.map((e) => y(e.t));
    const ly = ys.slice();
    for (let pass = 0; pass < 50; pass++) for (let i = 1; i < ly.length; i++) if (ly[i] - ly[i - 1] < rowH - 8) { const m = (ly[i] + ly[i - 1]) / 2; ly[i - 1] = m - (rowH - 8) / 2; ly[i] = m + (rowH - 8) / 2; }
    const shift = Math.max(0, 22 - ly[0]);
    for (let i = 0; i < ly.length; i++) ly[i] += shift;
    marks = EVENTS.map((e, i) => {
      const g = svg('g', { class: 'ev', tabindex: 0, role: 'button', 'aria-label': `${e.title}, ${e.when}` }, s);
      const lx = ax + (narrow ? 26 : 40);
      svg('path', { d: `M${ax},${ys[i]} C${ax + 14},${ys[i]} ${lx - 14},${ly[i]} ${lx - 4},${ly[i]}`, fill: 'none', stroke: '#d6cfc2' }, g);
      svg('circle', { cx: ax, cy: ys[i], r: 5.5, fill: colour[e.kind], stroke: '#fff', 'stroke-width': 2 }, g);
      svg('rect', { x: lx - 6, y: ly[i] - 17, width: W - lx, height: 36, fill: 'transparent' }, g);
      svg('text', { x: lx, y: ly[i] - 1, style: `font-size:${narrow ? 12.5 : 13}px;fill:#1c1b18;font-weight:600` }, g).textContent = e.title;
      svg('text', { x: lx, y: ly[i] + 14, style: 'font-size:11.5px;fill:#6b655c' }, g).textContent = e.when;
      const pick = () => { sel = i; showDetail(); highlight(); };
      g.addEventListener('click', pick);
      g.addEventListener('mouseenter', pick);
      g.addEventListener('keydown', (ev) => { if ((ev as KeyboardEvent).key === 'Enter' || (ev as KeyboardEvent).key === ' ') { ev.preventDefault(); pick(); } });
      return g;
    });
    highlight();
  });
  const highlight = () => marks.forEach((g, i) => g.setAttribute('opacity', i === sel ? '1' : '0.62'));
  showDetail();
}
