// Figure 2: the solar spectrum, and the energy of one photon of each colour.
import { h, s, onWidth, linear, clamp, slider, scrub, pointerX, fmt, pct } from '../lib.ts';
import { SPECTRUM, blackbodySun, photonEnergyEv, wavelengthCss, bandName, spectrumAt, totalIrradiance } from '../physics.ts';

const X0 = 280, X1 = 2500, YMAX = 2.25;

export function spectrum(root: HTMLElement) {
  let nm = 500;
  const host = h('div');
  const total = totalIrradiance('am15');
  const share = (a: number, b: number) =>
    SPECTRUM.filter((p) => p.nm >= a && p.nm < b).reduce((t, p) => t + p.am15 * 5, 0) / total;
  const shares = { uv: share(0, 380), vis: share(380, 750), ir: share(750, 1e9) };

  const sw = h('span', { class: 'swatch', style: 'margin-right:.45rem;vertical-align:baseline' });
  const rWave = h('div', { class: 'v' });
  const rBand = h('div', { class: 's' });
  const rEv = h('div', { class: 'v' });
  const rEvS = h('div', { class: 's' });
  const rGround = h('div', { class: 'v' });
  const rGroundS = h('div', { class: 's' });

  const sl = slider({
    label: 'Pick a colour of light', min: 300, max: 2500, step: 5, value: nm, className: 'rainbow',
    format: (v) => `${fmt(v)} nm`, onInput: (v) => { nm = v; update(); },
  });

  root.append(
    h('div', { class: 'fig-head' },
      h('div', {},
        h('p', { class: 'fig-title' }, 'The colours in sunlight'),
        h('p', { class: 'fig-sub' }, 'Power arriving at each wavelength, in watts per square metre per nanometre')),
      h('ul', { class: 'legend', style: 'margin:0' },
        h('li', {}, h('i', { style: 'background:linear-gradient(90deg,#4b6bff,#38e07a,#ff9a2e,#7a1f1a)' }), 'at the ground'),
        h('li', { style: 'color:#dfe6f3' }, h('i', { class: 'line' }), h('span', { style: 'color:var(--muted)' }, 'above the atmosphere')),
        h('li', { style: 'color:#8e99ad' }, h('i', { class: 'dash' }), h('span', { style: 'color:var(--muted)' }, 'an ideal glowing ball at 5,500 °C')))),
    host,
    h('div', { class: 'controls' }, sl.root),
    h('div', { class: 'readouts' },
      h('div', { class: 'readout' }, h('div', { class: 'k' }, 'Wavelength'), rWave, rBand),
      h('div', { class: 'readout' }, h('div', { class: 'k' }, 'Energy of one photon'), rEv, rEvS),
      h('div', { class: 'readout' }, h('div', { class: 'k' }, 'Survives the atmosphere'), rGround, rGroundS)),
  );

  let x = linear(X0, X1, 0, 1), y = linear(0, YMAX, 0, 1);
  let cursor: SVGGElement | null = null, dot: SVGCircleElement | null = null, tag: SVGTextElement | null = null;
  let W = 0, plotH = 0, top = 0;

  onWidth(host, (w) => {
    W = w;
    const small = W < 560;
    const Ht = Math.round(clamp(W * 0.5, 280, 430));
    const m = { l: small ? 34 : 46, r: 8, t: 34, b: 40 };
    top = m.t; plotH = Ht - m.t - m.b;
    x = linear(X0, X1, m.l, W - m.r);
    y = linear(0, YMAX, Ht - m.b, m.t);
    const svg = s('svg', { class: 'chart', viewBox: `0 0 ${W} ${Ht}`, role: 'img',
      'aria-label': `Chart of the power in sunlight against wavelength, from ultraviolet at 280 nanometres to infrared at 2500. It peaks in visible light near 500 nanometres. About ${Math.round(shares.vis * 100)} percent of the power at ground level is visible light and ${Math.round(shares.ir * 100)} percent is infrared.` });
    const defs = s('defs');
    const grad = s('linearGradient', { id: 'sp-grad', gradientUnits: 'userSpaceOnUse', x1: x(X0), x2: x(X1), y1: 0, y2: 0 });
    for (let l = X0; l <= 1100; l += 10) {
      grad.append(s('stop', { offset: (l - X0) / (X1 - X0), 'stop-color': wavelengthCss(l), 'stop-opacity': l > 780 ? 0.75 : 0.95 }));
    }
    grad.append(s('stop', { offset: 1, 'stop-color': wavelengthCss(1100), 'stop-opacity': 0.55 }));
    defs.append(grad);
    svg.append(defs);

    // Grid and axes
    for (let v = 0; v <= 2; v += 0.5) {
      svg.append(s('line', { class: 'grid', x1: m.l, x2: W - m.r, y1: y(v), y2: y(v) }));
      const t = s('text', { x: m.l - 8, y: y(v) + 4, 'text-anchor': 'end' }); t.textContent = v.toFixed(1);
      svg.append(t);
    }
    for (let l = 500; l <= 2500; l += small ? 500 : 250) {
      const t = s('text', { x: x(l), y: Ht - m.b + 18, 'text-anchor': l === 2500 ? 'end' : 'middle' }); t.textContent = fmt(l);
      svg.append(t, s('line', { x1: x(l), x2: x(l), y1: Ht - m.b, y2: Ht - m.b + 5, stroke: 'rgba(255,255,255,.2)' }));
    }
    const xt = s('text', { x: (m.l + W - m.r) / 2, y: Ht - 4, 'text-anchor': 'middle', class: 'axis-title' });
    xt.textContent = 'Wavelength (nanometres) — shorter waves, more energetic photons, to the left';
    if (small) xt.textContent = 'Wavelength (nanometres)';
    svg.append(xt);

    // Region brackets
    const regions: [number, number, string, number][] = [
      [X0, 380, 'UV', shares.uv], [380, 750, small ? 'Visible' : 'Visible light', shares.vis], [750, X1, 'Infrared', shares.ir],
    ];
    for (const [a, b, name, sh] of regions) {
      const xa = x(a) + 1.5, xb = x(b) - 1.5;
      svg.append(s('path', { d: `M${xa},${m.t - 4}v-5H${xb}v5`, fill: 'none', stroke: 'rgba(255,255,255,.28)' }));
      const t = s('text', { x: (xa + xb) / 2, y: m.t - 14, 'text-anchor': 'middle', class: 'label' });
      t.textContent = name === 'UV' && small ? '' : name;
      if (name !== 'UV') t.append(s('tspan', { fill: 'var(--muted)', 'font-weight': 400 }, ` ${pct(sh)}`));
      svg.append(t);
    }

    // Curves
    const pts = SPECTRUM.filter((p) => p.nm <= X1);
    const base = y(0);
    let area = `M${x(X0)},${base}`;
    let lineG = '', lineS = '';
    pts.forEach((p, i) => {
      const px = x(p.nm).toFixed(1);
      area += `L${px},${y(p.am15).toFixed(1)}`;
      lineG += `${i ? 'L' : 'M'}${px},${y(p.am15).toFixed(1)}`;
      lineS += `${i ? 'L' : 'M'}${px},${y(Math.min(YMAX, p.am0)).toFixed(1)}`;
    });
    area += `L${x(X1)},${base}Z`;
    let bb = '';
    for (let l = X0; l <= X1; l += 10) bb += `${l === X0 ? 'M' : 'L'}${x(l).toFixed(1)},${y(blackbodySun(l)).toFixed(1)}`;
    svg.append(
      s('path', { d: area, fill: 'url(#sp-grad)', opacity: 0.9 }),
      s('path', { d: bb, fill: 'none', stroke: '#8e99ad', 'stroke-width': 1.2, 'stroke-dasharray': '4 4' }),
      s('path', { d: lineS, fill: 'none', stroke: '#dfe6f3', 'stroke-width': 1.3, 'stroke-linejoin': 'round', opacity: 0.85 }),
      s('path', { d: lineG, fill: 'none', stroke: 'rgba(255,255,255,.55)', 'stroke-width': 1, 'stroke-linejoin': 'round' }),
      s('line', { x1: m.l, x2: W - m.r, y1: base, y2: base, stroke: 'rgba(255,255,255,.3)' }),
    );

    // Absorption notes
    if (!small) {
      const notes: [number, number, string][] = [[940, 0.12, 'water'], [1385, 0.1, 'water'], [1880, 0.1, 'water'], [762, 0.2, 'oxygen']];
      for (const [l, v, name] of notes) {
        const ty = y(spectrumAt(l, 'am0')) - (name === 'oxygen' ? 30 : 12);
        const t = s('text', { x: x(l), y: ty, 'text-anchor': 'middle', class: 'axis-title label-bg' }); t.textContent = name;
        svg.append(t);
        if (name === 'oxygen') svg.append(s('line', { x1: x(l), x2: x(l), y1: ty + 4, y2: y(spectrumAt(l, 'am0')) - 3, stroke: 'rgba(255,255,255,.3)' }));
        void v;
      }
    }

    // Cursor
    cursor = s('g');
    cursor.append(s('line', { x1: 0, x2: 0, y1: m.t - 2, y2: base, stroke: '#fff', 'stroke-width': 1, opacity: 0.7 }));
    dot = s('circle', { r: 5.5, cx: 0, stroke: '#fff', 'stroke-width': 2 });
    tag = s('text', { y: m.t + 14, class: 'label label-bg' });
    cursor.append(dot);
    svg.append(cursor, tag);

    const hit = s('rect', { x: m.l, y: 0, width: W - m.l - m.r, height: Ht - m.b + 6, fill: 'transparent', style: 'cursor:ew-resize' });
    svg.append(hit);
    scrub(hit, (ev) => {
      nm = clamp(Math.round(x.invert(pointerX(svg, ev, W)) / 5) * 5, 300, X1);
      sl.set(nm);
      update();
    });
    host.replaceChildren(svg);
    update();
  });

  function update() {
    const ev = photonEnergyEv(nm);
    const g = spectrumAt(nm, 'am15'), a = spectrumAt(nm, 'am0');
    if (cursor && dot && tag) {
      cursor.setAttribute('transform', `translate(${x(nm)},0)`);
      dot.setAttribute('cy', String(y(g)));
      dot.setAttribute('fill', wavelengthCss(nm));
      const right = x(nm) > W - 110;
      tag.setAttribute('x', String(x(nm) + (right ? -8 : 8)));
      tag.setAttribute('text-anchor', right ? 'end' : 'start');
      tag.textContent = `${ev.toFixed(2)} eV`;
    }
    sw.style.background = wavelengthCss(nm);
    sw.style.boxShadow = `0 0 10px ${wavelengthCss(nm, 0.8)}`;
    rWave.replaceChildren(sw, `${fmt(nm)}`, h('small', {}, 'nm'));
    rBand.textContent = bandName(nm) + (nm < 380 || nm >= 750 ? ' (invisible to us)' : '');
    rEv.replaceChildren(ev.toFixed(2), h('small', {}, 'eV'));
    const rel = ev / photonEnergyEv(700);
    rEvS.textContent = `${rel >= 1 ? fmt(rel, 1) + '×' : pct(rel)} ${rel >= 1 ? '' : 'of '}a deep-red photon`;
    const tr = a > 0 ? g / a : 0;
    rGround.replaceChildren(pct(Math.min(1, tr)));
    rGroundS.textContent = tr < 0.25 ? 'mostly absorbed by the air' : tr < 0.7 ? 'partly absorbed or scattered' : 'most of it gets through';
  }
}
