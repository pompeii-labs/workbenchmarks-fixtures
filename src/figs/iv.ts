// Figure 9: the current-voltage curve of one cell, and the load that taps it.
import { h, s, onWidth, linear, clamp, slider, scrub, pointerXY, fmt, pct } from '../lib.ts';
import { ivCurve, CELL, type IvCurve } from '../physics.ts';

const VMAX = 0.8, IMAX = 17;

export function iv(root: HTMLElement) {
  let sun = 1000, temp = 25;
  // The load is stored as an angle of the "load line" so the slider feels even
  // from short circuit (0) to open circuit (1).
  let load = 0.4;
  let curve: IvCurve = ivCurve(sun, temp);
  const host = h('div');
  const rV = h('div', { class: 'v' }), rI = h('div', { class: 'v' }), rP = h('div', { class: 'v', style: 'color:var(--photon)' });
  const rPS = h('div', { class: 's' }), rEff = h('div', { class: 'v' }), rEffS = h('div', { class: 's' });
  const status = h('p', { class: 'status', 'aria-live': 'polite' });

  const ohms = (u: number) => (u <= 0 ? 0 : u >= 1 ? Infinity : (Math.tan(u * Math.PI / 2) * VMAX) / IMAX);
  const uOf = (r: number) => (Math.atan((r * IMAX) / VMAX) * 2) / Math.PI;

  const sSun = slider({ label: 'Sunlight', min: 0, max: 1200, step: 10, value: sun, thumb: 'var(--photon)',
    format: (v) => `${fmt(v)} W/m²${v === 1000 ? ' · full sun' : v === 0 ? ' · dark' : v <= 200 ? ' · overcast' : ''}`,
    onInput: (v) => { sun = v; recalc(); } });
  const sTemp = slider({ label: 'Cell temperature', min: -10, max: 80, step: 1, value: temp, thumb: 'var(--heat)',
    format: (v) => `${v} °C`, onInput: (v) => { temp = v; recalc(); } });
  const sLoad = slider({ label: 'What is connected', min: 0, max: 1, step: 0.002, value: load, thumb: 'var(--electron)',
    format: (v) => (v <= 0 ? 'a bare wire' : v >= 1 ? 'nothing' : v < 0.35 ? 'easy path' : v > 0.8 ? 'stiff path' : 'moderate'),
    onInput: (v) => { load = v; update(); } });
  const best = h('button', { class: 'btn primary', type: 'button' }, 'Find the sweet spot');
  best.addEventListener('click', () => {
    if (curve.mpp.i > 0) { load = uOf(curve.mpp.v / curve.mpp.i); sLoad.set(load); update(); }
  });

  root.append(
    h('div', { class: 'fig-head' }, h('div', {},
      h('p', { class: 'fig-title' }, 'What one cell delivers'),
      h('p', { class: 'fig-sub' }, 'Drag the dot along the curve, or use the sliders')),
      h('ul', { class: 'legend', style: 'margin:0' },
        h('li', { style: 'color:var(--electron)' }, h('i', { class: 'line' }), h('span', { style: 'color:var(--muted)' }, 'what the cell can supply')),
        h('li', { style: 'color:#cfd6e4' }, h('i', { class: 'dash' }), h('span', { style: 'color:var(--muted)' }, 'what the load asks for')),
        h('li', {}, h('i', { style: 'background:rgba(255,185,56,.45)' }), 'power'))),
    host,
    h('div', { class: 'controls' }, sLoad.root, best),
    h('div', { class: 'controls' }, sSun.root, sTemp.root),
    h('div', { class: 'readouts' },
      h('div', { class: 'readout' }, h('div', { class: 'k' }, 'Voltage'), rV, h('div', { class: 's' }, 'push per electron')),
      h('div', { class: 'readout' }, h('div', { class: 'k' }, 'Current'), rI, h('div', { class: 's' }, 'flow of electrons')),
      h('div', { class: 'readout' }, h('div', { class: 'k' }, 'Power'), rP, rPS),
      h('div', { class: 'readout' }, h('div', { class: 'k' }, 'Efficiency'), rEff, rEffS)),
    status,
  );

  let x = linear(0, VMAX, 0, 1), y = linear(0, IMAX, 1, 0);
  let els: { curve: SVGPathElement; line: SVGLineElement; rect: SVGRectElement; dot: SVGCircleElement; mpp: SVGGElement; pLabel: SVGTextElement } | null = null;
  let W = 0, Ht = 0;

  onWidth(host, (w) => {
    W = w;
    const small = W < 520;
    Ht = Math.round(clamp(W * 0.52, 280, 420));
    const m = { l: 40, r: 12, t: 22, b: 40 };
    x = linear(0, VMAX, m.l, W - m.r);
    y = linear(0, IMAX, Ht - m.b, m.t);
    const svg = s('svg', { class: 'chart', viewBox: `0 0 ${W} ${Ht}`, role: 'img',
      'aria-label': 'Current against voltage for one solar cell. The current stays nearly constant at about 13.6 amps from zero up to about half a volt, then drops steeply to zero at about 0.7 volts. Power is greatest at the knee of the curve.' });
    for (let a = 0; a <= IMAX; a += 4) {
      svg.append(s('line', { class: 'grid', x1: m.l, x2: W - m.r, y1: y(a), y2: y(a) }));
      const t = s('text', { x: m.l - 8, y: y(a) + 4, 'text-anchor': 'end' }); t.textContent = String(a);
      svg.append(t);
    }
    for (let v = 0; v <= VMAX + 1e-9; v += 0.1) {
      const t = s('text', { x: x(v), y: Ht - m.b + 18, 'text-anchor': 'middle' }); t.textContent = v.toFixed(1);
      svg.append(t, s('line', { class: 'grid', x1: x(v), x2: x(v), y1: m.t, y2: Ht - m.b }));
    }
    const yt = s('text', { x: 0, y: 11, class: 'axis-title' }); yt.textContent = 'Current (amps)';
    const xt = s('text', { x: (m.l + W - m.r) / 2, y: Ht - 4, 'text-anchor': 'middle', class: 'axis-title' }); xt.textContent = 'Voltage (volts)';
    svg.append(yt, xt);
    const rect = s('rect', { fill: 'rgba(255,185,56,.22)', stroke: 'rgba(255,185,56,.7)', 'stroke-width': 1 });
    const pLabel = s('text', { 'text-anchor': 'middle', style: 'fill:#ffd88a;font-weight:620;font-size:13px' });
    const line = s('line', { stroke: '#cfd6e4', 'stroke-width': 1.3, 'stroke-dasharray': '5 4' });
    const path = s('path', { fill: 'none', stroke: 'var(--electron)', 'stroke-width': 2.6, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
    const mpp = s('g', { style: 'pointer-events:none' });
    mpp.append(s('circle', { r: 4, fill: 'none', stroke: '#ffb938', 'stroke-width': 2 }));
    const ml = s('text', { x: 9, y: -9, style: 'fill:#ffb938;font-weight:600' }); ml.textContent = small ? 'max power' : 'maximum power';
    mpp.append(ml);
    const dot = s('circle', { r: 8, fill: '#fff', stroke: 'var(--electron)', 'stroke-width': 3, style: 'cursor:grab' });
    const ends = [s('text', { class: 'axis-title label-bg' }), s('text', { class: 'axis-title label-bg', 'text-anchor': 'end' })];
    svg.append(rect, pLabel, line, path, mpp, dot);
    const hit = s('rect', { x: 0, y: 0, width: W, height: Ht - m.b + 8, fill: 'transparent', style: 'cursor:grab' });
    svg.append(hit);
    scrub(hit, (ev) => {
      const [px, py] = pointerXY(svg, ev, W, Ht);
      const v = Math.max(0, x.invert(px)), i = Math.max(0, y.invert(py));
      load = clamp(uOf(i <= 0.01 ? 1e9 : v / i), 0, 1);
      sLoad.set(load); update();
    }, false);
    void ends;
    els = { curve: path, line, rect, dot, mpp, pLabel };
    host.replaceChildren(svg);
    recalc();
  });

  function recalc() { curve = ivCurve(sun, temp); update(); }

  function update() {
    const op = curve.at(ohms(load));
    if (els) {
      let d = '';
      curve.points.forEach((p, i) => { d += `${i ? 'L' : 'M'}${x(p.v).toFixed(1)},${y(p.i).toFixed(1)}`; });
      if (curve.points.length) d += `L${x(curve.voc).toFixed(1)},${y(0).toFixed(1)}`;
      els.curve.setAttribute('d', d || 'M0,0');
      // Load line from the origin through the operating point to the chart edge.
      const r = ohms(load);
      const ex = r === Infinity ? 0 : Math.min(VMAX, IMAX * r), ey = r === Infinity ? IMAX : r === 0 ? IMAX : Math.min(IMAX, VMAX / r);
      els.line.setAttribute('x1', String(x(0))); els.line.setAttribute('y1', String(y(0)));
      els.line.setAttribute('x2', String(x(r === 0 ? 0 : ex))); els.line.setAttribute('y2', String(y(ey)));
      els.rect.setAttribute('x', String(x(0))); els.rect.setAttribute('y', String(y(op.i)));
      els.rect.setAttribute('width', String(Math.max(0, x(op.v) - x(0)))); els.rect.setAttribute('height', String(Math.max(0, y(0) - y(op.i))));
      els.dot.setAttribute('cx', String(x(op.v))); els.dot.setAttribute('cy', String(y(op.i)));
      els.mpp.setAttribute('transform', `translate(${x(curve.mpp.v)},${y(curve.mpp.i)})`);
      els.mpp.setAttribute('opacity', curve.mpp.p > 0.05 ? '1' : '0');
      const big = x(op.v) - x(0) > 70 && y(0) - y(op.i) > 34;
      els.pLabel.textContent = big ? `${op.p.toFixed(1)} W` : '';
      els.pLabel.setAttribute('x', String((x(0) + x(op.v)) / 2)); els.pLabel.setAttribute('y', String((y(0) + y(op.i)) / 2 + 5));
    }
    const lightW = sun * CELL.areaM2;
    rV.replaceChildren(op.v.toFixed(2), h('small', {}, 'V'));
    rI.replaceChildren(op.i.toFixed(1), h('small', {}, 'A'));
    rP.replaceChildren(op.p.toFixed(1), h('small', {}, 'W'));
    rPS.textContent = curve.mpp.p > 0.01 ? `${pct(op.p / curve.mpp.p)} of the ${curve.mpp.p.toFixed(1)} W available` : 'no light, no power';
    rEff.replaceChildren(lightW > 0 ? pct(op.p / lightW, 1) : '–');
    rEffS.textContent = lightW > 0 ? `of ${fmt(lightW, 1)} W of light landing on it` : '';
    const frac = curve.mpp.p > 0 ? op.p / curve.mpp.p : 0;
    status.innerHTML = sun === 0 ? '<b>Dark.</b> No photons, no freed electrons, no current.'
      : load <= 0.001 ? '<b>Short circuit.</b> A bare wire lets the electrons race round freely. The current is as large as it can be, but with nothing to push against there is no voltage and no power.'
      : load >= 0.999 ? '<b>Open circuit.</b> Nothing is connected. Electrons pile up until the voltage is as high as it can go, but none of them flow, so there is no power.'
      : frac > 0.985 ? '<b>The sweet spot.</b> The load asks for exactly the mix of voltage and current that makes the rectangle as large as it can be.'
      : op.v < curve.mpp.v ? '<b>Too easy a path.</b> Nearly all the available current is flowing, but each electron is doing less work than it could. Voltage is being left on the table.'
      : '<b>Too stiff a path.</b> The voltage is high, but electrons are backing up, and more of them fall back across the junction inside the cell instead of going round the wire.';
  }
}
