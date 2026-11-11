// Figure 5: where the sunlight's energy goes, as a function of the band gap.
import { h, s, onWidth, linear, clamp, scrub, pointerX, pct, slider } from '../lib.ts';
import { energyBudget, wavelengthNm, type Budget } from '../physics.ts';

const G0 = 0.5, G1 = 2.5, STEP = 0.02;
const PARTS = [
  { key: 'belowGap', name: 'Passes straight through', note: 'photons below the gap', color: '#5a2a33' },
  { key: 'heat', name: 'Trimmed off as heat', note: 'energy above the gap', color: '#ff7a45' },
  { key: 'voltage', name: 'Unavoidable electrical losses', note: 'even in a perfect cell', color: '#7d8bb3' },
  { key: 'electricity', name: 'Electricity', note: '', color: '#5fe3a1' },
] as const;
const MATERIALS: [string, number][] = [['Germanium', 0.67], ['Silicon', 1.12], ['Best possible', 1.34], ['Gallium arsenide', 1.42], ['Perovskite', 1.6]];

export function budget(root: HTMLElement) {
  const data: Budget[] = [];
  for (let g = G0; g <= G1 + 1e-9; g += STEP) data.push(energyBudget(+g.toFixed(3)));
  let gap = 1.12;

  const host = h('div');
  const gapBig = h('p', { class: 'gap-big' });
  const list = h('ul', { class: 'budget-list' });
  const rows = PARTS.map((p) => {
    const pc = h('span', { class: 'pc' });
    const bar = h('b', { style: `background:${p.color}` });
    const li = h('li', { class: p.key === 'electricity' ? 'total' : '' },
      h('span', { class: 'nm' }, h('i', { style: `background:${p.color}` }), h('span', {}, p.name)), pc,
      p.key === 'electricity' ? null : h('span', { class: 'bar' }, bar));
    list.append(li);
    return { pc, bar, key: p.key };
  });
  const chips = h('div', { class: 'chips' });
  for (const [name, g] of MATERIALS) {
    const b = h('button', { type: 'button' }, name);
    b.addEventListener('click', () => { gap = g; sl.set(g); update(); });
    chips.append(b);
  }
  const sl = slider({
    label: 'Band gap of the material', min: G0, max: G1, step: 0.01, value: gap,
    format: (v) => `${v.toFixed(2)} eV`, onInput: (v) => { gap = v; update(); },
  });
  root.append(
    h('div', { class: 'fig-head' }, h('div', {},
      h('p', { class: 'fig-title' }, 'Where the sunlight goes'),
      h('p', { class: 'fig-sub' }, 'Share of sunlight’s energy, for a perfect cell made of a material with each band gap'))),
    h('div', { class: 'budget-grid' },
      h('div', {}, host, h('div', { class: 'controls' }, sl.root)),
      h('div', {}, h('p', { class: 'gap-title' }, 'With a band gap of'), gapBig, list)),
    h('div', { class: 'controls' }, h('span', { class: 'fig-sub', style: 'margin:0' }, 'Try:'), chips),
  );

  let x = linear(G0, G1, 0, 1), y = linear(0, 1, 1, 0);
  let cursor: SVGGElement | null = null;
  let segs: SVGRectElement[] = [];
  let W = 0;
  onWidth(host, (w) => {
    W = w;
    const small = W < 520;
    const Ht = Math.round(clamp(W * 0.62, 270, 400));
    const m = { l: 40, r: 10, t: 12, b: 40 };
    x = linear(G0, G1, m.l, W - m.r);
    y = linear(0, 1, Ht - m.b, m.t);
    const svg = s('svg', { class: 'chart', viewBox: `0 0 ${W} ${Ht}`, role: 'img',
      'aria-label': 'Stacked chart of where sunlight energy goes against band gap. Electricity peaks at about 34 percent near 1.3 electron-volts. Small band gaps waste most energy as heat; large band gaps let most light pass through.' });
    for (let v = 0; v <= 1.001; v += 0.25) {
      const t = s('text', { x: m.l - 8, y: y(v) + 4, 'text-anchor': 'end' }); t.textContent = pct(v);
      svg.append(t);
    }
    // Stacked areas, bottom to top: electricity, voltage, heat, below-gap.
    const order = ['electricity', 'voltage', 'heat', 'belowGap'] as const;
    const acc = data.map(() => 0);
    for (const key of order) {
      const part = PARTS.find((p) => p.key === key)!;
      let up = '', down = '';
      data.forEach((d, i) => {
        const lo = acc[i], hi = lo + d[key];
        up += `${i ? 'L' : 'M'}${x(d.gap).toFixed(1)},${y(hi).toFixed(1)}`;
        down = `L${x(d.gap).toFixed(1)},${y(lo).toFixed(1)}` + down;
        acc[i] = hi;
      });
      svg.append(s('path', { d: up + down + 'Z', fill: part.color, opacity: key === 'electricity' ? 1 : 0.88, stroke: '#0e1320', 'stroke-width': 1 }));
    }
    for (let v = 0.25; v < 1; v += 0.25) svg.append(s('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), stroke: 'rgba(0,0,0,.22)' }));
    // In-chart labels
    const lab = (gx: number, vy: number, text: string, fill = '#fff') => {
      const t = s('text', { x: x(gx), y: y(vy), 'text-anchor': 'middle', fill, style: `fill:${fill};font-weight:600;font-size:${small ? 11 : 12.5}px` });
      t.textContent = text; svg.append(t);
    };
    lab(0.86, 0.66, small ? 'heat' : 'lost as heat', '#3a1300');
    lab(2.1, 0.72, small ? 'passes through' : 'passes through unused', '#f3c9cf');
    lab(1.4, 0.12, 'electricity', '#06301b');
    for (let g = 0.5; g <= 2.5; g += 0.5) {
      const t = s('text', { x: x(g), y: Ht - m.b + 18, 'text-anchor': g === 2.5 ? 'end' : 'middle' }); t.textContent = g.toFixed(1);
      svg.append(t);
    }
    const xt = s('text', { x: (m.l + W - m.r) / 2, y: Ht - 4, 'text-anchor': 'middle', class: 'axis-title' });
    xt.textContent = small ? 'Band gap (eV)' : 'Band gap (eV): the energy fee to free one electron';
    svg.append(xt);

    cursor = s('g', { style: 'pointer-events:none' });
    cursor.append(s('rect', { x: -9, y: m.t - 3, width: 18, height: Ht - m.b - m.t + 6, rx: 9, fill: 'none', stroke: '#fff', 'stroke-width': 2 }));
    segs = [];
    cursor.append(s('path', { d: `M-6,${Ht - m.b + 6}L0,${Ht - m.b + 0}L6,${Ht - m.b + 6}Z`, fill: '#fff' }));
    svg.append(cursor);
    const hit = s('rect', { x: m.l - 10, y: 0, width: W - m.l - m.r + 20, height: Ht - m.b + 8, fill: 'transparent', style: 'cursor:ew-resize' });
    svg.append(hit);
    scrub(hit, (ev) => {
      gap = clamp(Math.round(x.invert(pointerX(svg, ev, W)) * 100) / 100, G0, G1);
      sl.set(gap); update();
    }, false);
    host.replaceChildren(svg);
    update();
  });

  function update() {
    const b = energyBudget(gap);
    cursor?.setAttribute('transform', `translate(${x(gap)},0)`);
    const mat = MATERIALS.find(([, g]) => Math.abs(g - gap) < 0.006);
    gapBig.replaceChildren(`${gap.toFixed(2)} eV`, h('small', {}, mat ? mat[0].toLowerCase() : `absorbs light up to ${Math.round(wavelengthNm(gap) / 10) * 10} nm`));
    for (const r of rows) {
      r.pc.textContent = pct(b[r.key], r.key === 'electricity' ? 1 : 0);
      r.bar.style.width = `${b[r.key] * 100}%`;
    }
    void segs;
  }
}
