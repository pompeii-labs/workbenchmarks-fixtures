// Current–voltage curve of a silicon cell with a load, plus an animated circuit.
import * as P from './physics';
import { svg, attr, linear, onWidth, scrub, fmt, clamp, animate, reducedMotion } from './util';

const R_MIN = 0.002, R_MAX = 20; // ohms per cell, log slider range

export function ivFigure(root: HTMLElement) {
  const chartHost = root.querySelector('[data-chart="iv"]') as HTMLElement;
  const circHost = root.querySelector('[data-widget="circuit"]') as HTMLElement;
  const loadS = root.querySelector('#iv-load') as HTMLInputElement;
  const sunS = root.querySelector('#iv-sun') as HTMLInputElement;
  const tempS = root.querySelector('#iv-temp') as HTMLInputElement;
  const outLoad = root.querySelector('[data-out="load"]') as HTMLElement;
  const outSun = root.querySelector('[data-out="sun"]') as HTMLElement;
  const outTemp = root.querySelector('[data-out="temp"]') as HTMLElement;
  const stats = root.querySelector('[data-readout="iv"]') as HTMLElement;
  const mppBtn = root.querySelector('[data-mpp]') as HTMLButtonElement;
  const cellBtns = Array.from(root.querySelectorAll('[data-cells]')) as HTMLButtonElement[];

  let N = 1;
  // slider 0..1000: 0 = short circuit, 1000 = open circuit, otherwise log-spaced resistance
  const rOf = (v: number) => (v <= 0 ? 0 : v >= 1000 ? Infinity : R_MIN * (R_MAX / R_MIN) ** (v / 1000));
  const vOf = (r: number) => (r <= 0 ? 0 : !isFinite(r) ? 1000 : clamp((Math.log(r / R_MIN) / Math.log(R_MAX / R_MIN)) * 1000, 1, 999));

  let state = {
    G: 1000, T: 25, R: rOf(+loadS.value),
  };
  let op = { I: 0, V: 0 }, mpp = { I: 0, V: 0, P: 0 };

  const compute = () => {
    const s = P.cellState(state.G, state.T);
    const Rtot = state.R * N;
    if (state.R === 0) op = { I: P.cellIsc(s), V: 0 };
    else if (!isFinite(state.R)) op = { I: 0, V: N * P.cellVoc(s) };
    else op = P.operatingPoint(s, Rtot, N);
    mpp = P.maxPower(s, N);
    return s;
  };

  // ---- chart
  let drawChart: (s: P.CellState) => void = () => {};
  onWidth(chartHost, (W) => {
    chartHost.innerHTML = '';
    const H = Math.round(clamp(W * 0.62, 240, 360));
    const m = { l: 44, r: 46, t: 14, b: 40 };
    const root2 = svg('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H }, chartHost);
    const layers = svg('g', {}, root2);
    drawChart = (s) => {
      layers.innerHTML = '';
      const vMax = 0.8 * N, iMax = 12, pMax = 7 * N;
      const x = linear(0, vMax, m.l, W - m.r);
      const y = linear(0, iMax, H - m.b, m.t);
      const yp = linear(0, pMax, H - m.b, m.t);
      const gg = svg('g', { class: 'grid' }, layers);
      for (const t of [0, 2, 4, 6, 8, 10, 12]) {
        svg('line', { x1: m.l, x2: W - m.r, y1: y(t), y2: y(t) }, gg);
        svg('text', { x: m.l - 6, y: y(t) + 3.5, 'text-anchor': 'end', style: 'fill:#2a4fa8' }, layers).textContent = String(t);
      }
      const pt = N === 1 ? [0, 2, 4, 6] : [0, 100, 200, 300, 400];
      for (const t of pt) svg('text', { x: W - m.r + 6, y: yp(t) + 3.5, style: 'fill:#b45a0d' }, layers).textContent = String(t);
      const vt = N === 1 ? [0, 0.2, 0.4, 0.6, 0.8] : [0, 10, 20, 30, 40, 48];
      svg('line', { x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b, stroke: '#9d958a' }, layers);
      for (const t of vt) {
        svg('line', { x1: x(t), x2: x(t), y1: H - m.b, y2: H - m.b + 4, stroke: '#9d958a' }, layers);
        svg('text', { x: x(t), y: H - m.b + 16, 'text-anchor': 'middle' }, layers).textContent = N === 1 ? t.toFixed(1) : String(t);
      }
      svg('text', { x: (m.l + W - m.r) / 2, y: H - 4, 'text-anchor': 'middle', class: 'axis-title' }, layers).textContent = 'Voltage (volts)';
      svg('text', { class: 'axis-title', 'text-anchor': 'middle', transform: `translate(11,${(m.t + H - m.b) / 2}) rotate(-90)`, style: 'fill:#2a4fa8' }, layers).textContent = 'Current (amps)';
      svg('text', { class: 'axis-title', 'text-anchor': 'middle', transform: `translate(${W - 6},${(m.t + H - m.b) / 2}) rotate(90)`, style: 'fill:#b45a0d' }, layers).textContent = 'Power (watts)';

      // reference curve at standard conditions
      const ref = P.cellState(1000, 25);
      const curve = (cs: P.CellState) => {
        const isc = P.cellIsc(cs);
        const pts: [number, number][] = [];
        const pp: [number, number][] = [];
        for (let k = 0; k <= 160; k++) {
          const I = isc * (1 - (k / 160) ** 3); // dense sampling near open circuit
          const V = N * P.cellV(cs, I);
          pts.push([x(V), y(I)]);
          pp.push([x(V), yp(V * I)]);
        }
        return { iv: pts, pw: pp };
      };
      const toD = (p: [number, number][]) => p.map((q, i) => (i ? 'L' : 'M') + q[0].toFixed(1) + ',' + q[1].toFixed(1)).join('');
      if (Math.abs(state.G - 1000) > 1 || Math.abs(state.T - 25) > 0.5) {
        const r = curve(ref);
        svg('path', { d: toD(r.iv), fill: 'none', stroke: '#c9c2b6', 'stroke-width': 1.5, 'stroke-dasharray': '2 3' }, layers);
        if (W > 420) svg('text', { x: r.iv[100][0] - 4, y: r.iv[100][1] - 6, 'text-anchor': 'end' }, layers).textContent = 'standard conditions';
      }
      if (s.il > 0) {
        const c = curve(s);
        svg('path', { d: toD(c.pw), fill: 'none', stroke: 'var(--sun-deep)', 'stroke-width': 2, 'stroke-dasharray': '5 4' }, layers);
        svg('path', { d: toD(c.iv), fill: 'none', stroke: 'var(--electron)', 'stroke-width': 2.8 }, layers);
        // power rectangle at the operating point
        svg('rect', { x: m.l, y: y(op.I), width: Math.max(0, x(op.V) - m.l), height: Math.max(0, H - m.b - y(op.I)), fill: 'rgba(245,165,36,0.16)', stroke: 'rgba(226,101,15,0.35)' }, layers);
        // MPP marker
        svg('circle', { cx: x(mpp.V), cy: y(mpp.I), r: 7, fill: 'none', stroke: '#1c1b18', 'stroke-width': 1.3, 'stroke-dasharray': '2 2' }, layers);
        svg('text', { x: x(mpp.V) - 12, y: y(mpp.I) + 26, 'text-anchor': 'end', style: 'fill:#1c1b18;font-weight:600' }, layers).textContent = 'maximum power point';
        svg('line', { x1: x(mpp.V) - 10, y1: y(mpp.I) + 20, x2: x(mpp.V) - 5, y2: y(mpp.I) + 6, stroke: '#1c1b18' }, layers);
        // labels Isc / Voc
        const isc = P.cellIsc(s), voc = N * P.cellVoc(s);
        svg('text', { x: m.l + 6, y: y(isc) + 15, style: 'fill:#2a4fa8;font-weight:600' }, layers).textContent = `short circuit ${isc.toFixed(1)} A`;
        svg('text', { x: x(voc) - 8, y: H - m.b - 8, 'text-anchor': 'end', style: 'fill:#2a4fa8;font-weight:600' }, layers).textContent = W < 400 ? `${voc.toFixed(N === 1 ? 2 : 1)} V` : `open circuit ${voc.toFixed(N === 1 ? 2 : 1)} V`;
      }
      // operating point
      svg('line', { x1: x(op.V), x2: x(op.V), y1: y(op.I), y2: H - m.b, stroke: '#1c1b18', 'stroke-dasharray': '2 3', opacity: 0.5 }, layers);
      svg('circle', { cx: x(op.V), cy: y(op.I), r: 7.5, fill: '#fff', stroke: 'var(--electron)', 'stroke-width': 3 }, layers);
      svg('circle', { cx: x(op.V), cy: yp(op.V * op.I), r: 4.5, fill: 'var(--sun-deep)' }, layers);
      const hit = svg('rect', { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, fill: 'transparent', style: 'cursor:ew-resize' }, layers);
      scrub(hit, (px, _py, type, e) => {
        if (type === 'move' && e.pointerType === 'mouse' && !e.buttons) return;
        // choose operating voltage → find current on the curve → implied load
        const cs = P.cellState(state.G, state.T);
        const V = clamp(x.inv(px + m.l), 0, N * P.cellVoc(cs));
        let lo = 0, hi = P.cellIsc(cs);
        for (let k = 0; k < 50; k++) { const mid = (lo + hi) / 2; if (N * P.cellV(cs, mid) > V) lo = mid; else hi = mid; }
        const R = lo > 1e-6 ? V / lo / N : Infinity;
        loadS.value = String(Math.round(vOf(V < 1e-4 ? 0 : R)));
        state.R = V < 1e-4 ? 0 : R;
        update();
      });
    };
    update();
  });

  // ---- circuit
  let circ: null | { path: SVGPathElement; len: number; dots: SVGCircleElement[]; glow: SVGCircleElement; bulb: SVGCircleElement; filament: SVGPathElement; rays: SVGGElement; label: SVGTextElement } = null;
  onWidth(circHost, (W) => {
    circHost.innerHTML = '';
    const VW = 320, VH = 300;
    const s = svg('svg', { viewBox: `0 0 ${VW} ${VH}`, width: W, height: (W * VH) / VW, style: 'font-family:var(--sans);max-width:420px;margin:0 auto' }, circHost);
    const defs = svg('defs', {}, s);
    const rg = svg('radialGradient', { id: 'bulbglow' }, defs);
    svg('stop', { offset: 0, 'stop-color': '#ffe27a', 'stop-opacity': 0.95 }, rg);
    svg('stop', { offset: 1, 'stop-color': '#ffe27a', 'stop-opacity': 0 }, rg);
    // sun rays onto cell
    const rays = svg('g', {}, s);
    for (let i = 0; i < 5; i++) {
      const x0 = 70 + i * 40;
      svg('path', { d: `M${x0 + 30},178 L${x0 + 14},214`, stroke: '#f5a524', 'stroke-width': 2.2, 'stroke-linecap': 'round', 'marker-end': '' }, rays);
    }
    // cell (side view): n layer on top, p below
    svg('rect', { x: 50, y: 222, width: 220, height: 8, fill: '#3e6fd8' }, s);
    svg('rect', { x: 50, y: 230, width: 220, height: 30, fill: '#7c5a8a' }, s);
    svg('rect', { x: 50, y: 260, width: 220, height: 5, fill: '#a0a4aa' }, s);
    for (let i = 0; i < 6; i++) svg('rect', { x: 62 + i * 38, y: 218, width: 6, height: 4, fill: '#c9ccd1' }, s);
    svg('text', { x: 160, y: 250, 'text-anchor': 'middle', style: 'font-size:11px;fill:#fff;font-weight:600' }, s).textContent = 'p-type';
    svg('text', { x: 278, y: 229, style: 'font-size:10.5px;fill:#2a4fa8;font-weight:700' }, s).textContent = 'n  −';
    svg('text', { x: 278, y: 266, style: 'font-size:10.5px;fill:#a3285a;font-weight:700' }, s).textContent = 'p  +';
    // wire: from front contact (top) out left, up to lamp, right, down to the back contact
    const d = 'M 56 218 L 22 218 L 22 60 L 136 60 M 184 60 L 298 60 L 298 282 L 160 282 L 160 265';
    svg('path', { d, fill: 'none', stroke: '#b07d3a', 'stroke-width': 4, 'stroke-linejoin': 'round' }, s);
    const path = svg('path', { d: 'M 56 218 L 22 218 L 22 60 L 136 60 L 184 60 L 298 60 L 298 282 L 160 282 L 160 265', fill: 'none', stroke: 'none' }, s);
    // lamp
    const glow = svg('circle', { cx: 160, cy: 60, r: 60, fill: 'url(#bulbglow)', opacity: 0 }, s);
    const bulb = svg('circle', { cx: 160, cy: 60, r: 22, fill: '#f4efe6', stroke: '#8b7a5c', 'stroke-width': 2 }, s);
    const filament = svg('path', { d: 'M136,60 L146,60 q3,-10 6,0 q3,10 6,0 q3,-10 6,0 q3,10 6,0 L184,60', fill: 'none', stroke: '#5f584d', 'stroke-width': 1.8 }, s);
    const label = svg('text', { x: 160, y: 104, 'text-anchor': 'middle', style: 'font-size:11.5px;fill:#3b3833;font-weight:600' }, s);
    svg('text', { x: 30, y: 140, style: 'font-size:10.5px;fill:#6b655c' }, s).textContent = 'electrons';
    svg('text', { x: 30, y: 153, style: 'font-size:10.5px;fill:#6b655c' }, s).textContent = 'leave the front';
    svg('text', { x: 290, y: 140, 'text-anchor': 'end', style: 'font-size:10.5px;fill:#6b655c' }, s).textContent = 'and return';
    svg('text', { x: 290, y: 153, 'text-anchor': 'end', style: 'font-size:10.5px;fill:#6b655c' }, s).textContent = 'to the back';
    const len = path.getTotalLength();
    const dots: SVGCircleElement[] = [];
    for (let i = 0; i < 22; i++) dots.push(svg('circle', { r: 3.4, fill: 'var(--electron)' }, s));
    circ = { path, len, dots, glow, bulb, filament, rays, label };
    update();
  });

  let phase = 0;
  animate(circHost, (_t, dt) => {
    if (!circ) return;
    const speed = reducedMotion() ? 0 : op.I * 6; // px/s, exaggerated
    phase = (phase + speed * dt) % circ.len;
    circ.dots.forEach((d, i) => {
      const s = (phase + (i * circ!.len) / circ!.dots.length) % circ!.len;
      const p = circ!.path.getPointAtLength(s);
      attr(d, { cx: p.x, cy: p.y, opacity: op.I > 0.01 ? 1 : 0.35 });
    });
  });

  const update = () => {
    const s = compute();
    const Pw = op.V * op.I;
    const Pin = state.G * P.CELL_AREA * N;
    outSun.textContent = `${fmt(state.G)} W/m²`;
    outTemp.textContent = `${fmt(state.T)} °C`;
    outLoad.textContent = state.R === 0 ? 'short circuit' : !isFinite(state.R) ? 'open circuit' : `${(state.R * N).toPrecision(2)} Ω`;
    stats.innerHTML =
      `<div><small>Voltage</small><b>${op.V.toFixed(N === 1 ? 3 : 1)} V</b></div>` +
      `<div><small>Current</small><b>${op.I.toFixed(2)} A</b></div>` +
      `<div><small>Power</small><b>${Pw.toFixed(N === 1 ? 2 : 0)} W</b></div>` +
      `<div><small>Efficiency</small><b>${Pin > 0 ? ((Pw / Pin) * 100).toFixed(1) : '0.0'}%</b></div>`;
    drawChart(s);
    if (circ) {
      const rel = mpp.P > 0 ? Pw / (5.2 * N) : 0;
      const b = clamp(rel, 0, 1.2);
      attr(circ.glow, { opacity: clamp(b, 0, 1) });
      attr(circ.bulb, { fill: b > 0.05 ? `rgb(255,${Math.round(236 - 20 * b)},${Math.round(200 - 110 * b)})` : '#f4efe6' });
      attr(circ.filament, { stroke: b > 0.05 ? '#d9822b' : '#5f584d' });
      attr(circ.rays, { opacity: clamp(state.G / 1000, 0, 1) });
      circ.label.textContent = `lamp: ${Pw.toFixed(N === 1 ? 2 : 0)} W`;
    }
  };

  loadS.addEventListener('input', () => { state.R = rOf(+loadS.value); update(); });
  sunS.addEventListener('input', () => { state.G = +sunS.value; update(); });
  tempS.addEventListener('input', () => { state.T = +tempS.value; update(); });
  cellBtns.forEach((b) => b.addEventListener('click', () => {
    N = +b.dataset.cells!;
    cellBtns.forEach((o) => { o.classList.toggle('on', o === b); o.setAttribute('aria-pressed', String(o === b)); });
    update();
  }));
  mppBtn.addEventListener('click', () => {
    const s = P.cellState(state.G, state.T);
    const m = P.maxPower(s, N);
    if (m.I <= 0) return;
    const target = m.V / m.I / N;
    const from = state.R === 0 ? R_MIN : !isFinite(state.R) ? R_MAX : state.R;
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = reducedMotion() ? 1 : clamp((t - t0) / 700, 0, 1);
      const e = 1 - (1 - k) ** 3;
      state.R = Math.exp(Math.log(from) + (Math.log(target) - Math.log(from)) * e);
      loadS.value = String(Math.round(vOf(state.R)));
      update();
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
