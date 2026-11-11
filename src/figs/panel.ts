// Figure 10: sixty cells in series, three bypass diodes, and what shade does.
import { h, s, fmt, pct } from '../lib.ts';
import { ivCurve } from '../physics.ts';

const COLS = 6, ROWS = 10, SHADE = 0.15;

export function panel(root: HTMLElement) {
  const shaded = new Set<number>();
  const cell = ivCurve(1000, 25);
  const pCell = cell.mpp.p, vCell = cell.mpp.v, iCell = cell.mpp.i;
  const dim = ivCurve(1000 * SHADE, 25).mpp;

  const CW = 44, GAP = 4, PAD = 14, TOP = 14;
  const Wd = PAD * 2 + COLS * CW + (COLS - 1) * GAP, Hd = TOP + PAD + ROWS * CW + (ROWS - 1) * GAP + 54;
  const svg = s('svg', { class: 'chart', viewBox: `0 0 ${Wd} ${Hd}`, style: 'touch-action:manipulation' });
  svg.append(s('rect', { x: 1, y: 1, width: Wd - 2, height: Hd - 44, rx: 10, fill: '#0c1322', stroke: '#566079', 'stroke-width': 2 }));
  const rects: SVGRectElement[] = [];
  const stringOf = (i: number) => Math.floor((i % COLS) / 2);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const i = r * COLS + c;
    const rect = s('rect', {
      class: 'panel-cell', x: PAD + c * (CW + GAP), y: TOP + r * (CW + GAP), width: CW, height: CW, rx: 5,
      tabindex: 0, role: 'button', 'aria-pressed': 'false', 'aria-label': `Cell ${i + 1}, chain ${stringOf(i) + 1}`,
    });
    const toggle = () => { shaded.has(i) ? shaded.delete(i) : shaded.add(i); update(); };
    rect.addEventListener('click', toggle);
    rect.addEventListener('keydown', (ev) => { if (ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); toggle(); } });
    rects.push(rect); svg.append(rect);
  }
  // Chain outlines and bypass diodes along the bottom edge.
  const diodes: { g: SVGGElement; label: SVGTextElement; frame: SVGRectElement }[] = [];
  for (let k = 0; k < 3; k++) {
    const x0 = PAD + k * 2 * (CW + GAP) - 2, wd = 2 * CW + GAP + 4;
    const frame = s('rect', { x: x0, y: TOP - 2, width: wd, height: ROWS * (CW + GAP) - GAP + 4, rx: 7, fill: 'none', 'stroke-width': 1.5, style: 'pointer-events:none' });
    const cx = x0 + wd / 2, cy = Hd - 26;
    const g = s('g', { transform: `translate(${cx},${cy})` });
    g.append(s('line', { x1: -wd / 2 + 6, x2: wd / 2 - 6, y1: 0, y2: 0, 'stroke-width': 2 }),
      s('path', { d: 'M-7,-7L7,0L-7,7Z' }), s('line', { x1: 7, x2: 7, y1: -7, y2: 7, 'stroke-width': 2 }));
    const label = s('text', { x: cx, y: Hd - 4, 'text-anchor': 'middle', style: 'font-size:11px' });
    svg.append(frame, g, label);
    diodes.push({ g, label, frame });
  }

  const rP = h('div', { class: 'v', style: 'color:var(--photon)' }), rPS = h('div', { class: 's' });
  const rV = h('div', { class: 'v' }), rI = h('div', { class: 'v' });
  const status = h('p', { class: 'status', 'aria-live': 'polite' });
  const clear = h('button', { class: 'btn', type: 'button' }, 'Clear the shade');
  clear.addEventListener('click', () => { shaded.clear(); update(); });
  const leaf = h('button', { class: 'btn', type: 'button' }, 'Drop one leaf');
  leaf.addEventListener('click', () => { shaded.clear(); shaded.add(27); update(); });
  const chimney = h('button', { class: 'btn', type: 'button' }, 'Chimney shadow');
  chimney.addEventListener('click', () => { shaded.clear(); for (let c = 0; c < COLS; c++) { shaded.add(54 + c); shaded.add(48 + c); } update(); });

  root.append(
    h('div', { class: 'fig-head' }, h('div', {},
      h('p', { class: 'fig-title' }, 'Sixty cells in a chain'),
      h('p', { class: 'fig-sub' }, 'Tap cells to shade them. Each pair of columns is one chain of twenty with its own bypass diode.'))),
    h('div', { class: 'panel-grid' }, svg,
      h('div', {},
        h('div', { class: 'readouts', style: 'margin-top:0' },
          h('div', { class: 'readout' }, h('div', { class: 'k' }, 'Panel power'), rP, rPS),
          h('div', { class: 'readout' }, h('div', { class: 'k' }, 'Voltage'), rV, h('div', { class: 's' }, 'cells in use × volts each')),
          h('div', { class: 'readout' }, h('div', { class: 'k' }, 'Current'), rI, h('div', { class: 's' }, 'same through every cell in use'))),
        status,
        h('div', { class: 'controls' }, leaf, chimney, clear))),
  );

  function update() {
    const hit = [0, 1, 2].map((k) => [...shaded].some((i) => stringOf(i) === k));
    const clean = hit.filter((x) => !x).length;
    // Option A: run at full current and bypass every chain containing shade.
    const pA = clean * 20 * pCell;
    // Option B: slow the whole panel down to what the shaded cells can pass.
    const pB = 60 * dim.p;
    const bypass = shaded.size > 0 && pA >= pB;
    const full = 60 * pCell;
    const p = shaded.size === 0 ? full : Math.max(pA, pB);
    const v = shaded.size === 0 ? 60 * vCell : bypass ? clean * 20 * vCell : 60 * dim.v;
    const i = shaded.size === 0 || bypass ? iCell : dim.i;
    rects.forEach((r, idx) => {
      const sh = shaded.has(idx), off = bypass && hit[stringOf(idx)];
      r.setAttribute('fill', sh ? '#11151d' : off ? '#1a2740' : shaded.size && !bypass ? '#1f3f7a' : '#2b5fc4');
      r.setAttribute('stroke', sh ? '#3b4558' : 'rgba(255,255,255,.14)');
      r.setAttribute('aria-pressed', String(sh));
    });
    diodes.forEach((d, k) => {
      const on = bypass && hit[k];
      const col = on ? '#ffb938' : '#566079';
      d.g.setAttribute('stroke', col); d.g.setAttribute('fill', col);
      d.frame.setAttribute('stroke', on ? 'rgba(255,185,56,.8)' : 'transparent');
      d.label.textContent = on ? 'bypassed' : `chain ${k + 1}`;
      d.label.setAttribute('style', `font-size:11px;fill:${on ? '#ffb938' : 'var(--faint)'}`);
    });
    rP.replaceChildren(fmt(p), h('small', {}, 'W'));
    rPS.textContent = shaded.size ? `${pct(p / full)} of the unshaded ${fmt(full)} W` : 'in full sun';
    rV.replaceChildren(fmt(v, 1), h('small', {}, 'V'));
    rI.replaceChildren(fmt(i, 1), h('small', {}, 'A'));
    const lostCells = shaded.size;
    status.innerHTML = !shaded.size
      ? `<b>Full sun.</b> Sixty cells at ${vCell.toFixed(2)} V each add up to ${fmt(60 * vCell)} V, and all carry the same ${iCell.toFixed(1)} A.`
      : bypass
        ? `<b>${lostCells} shaded cell${lostCells > 1 ? 's' : ''}, ${(3 - clean) * 20} cells out of action.</b> The shaded cell${lostCells > 1 ? 's' : ''} cannot pass the full current, so the diode routes current around ${3 - clean === 1 ? 'that whole chain' : 'those chains'}. ${pct(lostCells / 60, lostCells < 6 ? 1 : 0)} of the panel is in shade, but ${pct(1 - p / full)} of its power is gone.`
        : `<b>Every chain has shade.</b> There is nothing left to bypass to, so the whole panel slows to the trickle the shaded cells can pass.`;
  }
  update();
}
