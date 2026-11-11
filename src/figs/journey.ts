// Figure 1: the long stagger out of the sun, then 8 min 19 s in a straight line.
import { h, s, loop, onWidth, reducedMotion, fmt } from '../lib.ts';

const AU_MKM = 149.6; // million km
const C_MKM_S = 0.299792458; // million km per second
const TRIP_S = AU_MKM / C_MKM_S; // ~499 s
const SUN_R_MKM = 0.696;
const STOPS = [
  { name: 'Mercury', d: 57.9 },
  { name: 'Venus', d: 108.2 },
  { name: 'Earth', d: AU_MKM },
];
const clock = (sec: number) => { const r = Math.round(sec); return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`; };

export function journey(root: HTMLElement) {
  const walkCanvas = h('canvas', { class: 'journey-walk', width: 300, height: 300, 'aria-hidden': 'true' });
  const walkLabel = h('p', { class: 'journey-cap', html: '<b>Inside the sun</b><br>a random stagger lasting tens of thousands of years' });
  const stripHost = h('div', { class: 'journey-strip' });
  const stripLabel = h('p', { class: 'journey-cap', html: '<b>Outside</b><br>a straight line at the speed of light' });
  const timeV = h('span', { class: 'v' }, '0:00');
  const distV = h('span', { class: 'v' }, '0');
  const btn = h('button', { class: 'btn primary', type: 'button' }, 'Release a photon');
  const style = h('style', {}, `
    .journey-grid{display:grid;grid-template-columns:11rem minmax(0,1fr);gap:1rem 1.75rem;align-items:center}
    .journey-walk{width:100%;max-width:11rem;aspect-ratio:1;display:block;margin:0 auto}
    .journey-cap{margin:.4rem 0 0;font-size:.82rem;color:var(--muted);line-height:1.4}
    .journey-cap b{color:var(--text)}
    .journey-left{text-align:center}
    @media(max-width:640px){.journey-grid{grid-template-columns:minmax(0,1fr)}.journey-left{display:grid;grid-template-columns:7.5rem 1fr;gap:1rem;align-items:center;text-align:left}}
  `);
  root.append(
    style,
    h('div', { class: 'journey-grid' },
      h('div', { class: 'journey-left' }, walkCanvas, walkLabel),
      h('div', {}, stripHost, stripLabel),
    ),
    h('div', { class: 'controls' },
      btn,
      h('div', { class: 'readouts', style: 'flex:1 1 16rem;margin-top:0' },
        h('div', { class: 'readout' }, h('div', { class: 'k' }, 'Time since leaving'), timeV, h('div', { class: 's' }, 'minutes : seconds')),
        h('div', { class: 'readout' }, h('div', { class: 'k' }, 'Distance covered'), distV, h('div', { class: 's' }, 'million km'))),
    ),
  );

  // ── Random walk inside the sun ──
  const ctx = walkCanvas.getContext('2d')!;
  const R = 132, CX = 150, CY = 150;
  let path: [number, number][] = [[CX, CY]];
  let phase: 'idle' | 'walk' | 'fly' | 'done' = 'idle';
  let exitAngle = 0;
  const drawWalk = () => {
    ctx.clearRect(0, 0, 300, 300);
    const g = ctx.createRadialGradient(CX, CY, 0, CX, CY, R);
    g.addColorStop(0, '#fff3c4'); g.addColorStop(0.25, '#ffc94d'); g.addColorStop(0.8, '#f08a1c'); g.addColorStop(1, '#c75a12');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(CX, CY, R, 0, 6.2832); ctx.fill();
    ctx.strokeStyle = 'rgba(255,220,150,.5)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath();
    path.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.strokeStyle = 'rgba(60,20,0,.75)'; ctx.lineWidth = 1.6; ctx.lineJoin = 'round'; ctx.stroke();
    const [x, y] = path[path.length - 1];
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 4, 0, 6.2832); ctx.fill();
  };
  const stepWalk = (): boolean => {
    const [x, y] = path[path.length - 1];
    const r = Math.hypot(x - CX, y - CY);
    // Unbiased random direction; steps lengthen as the gas thins towards the surface.
    const a = Math.random() * 6.2832;
    const len = 5 + 9 * (r / R);
    const nx = x + Math.cos(a) * len, ny = y + Math.sin(a) * len;
    const nr = Math.hypot(nx - CX, ny - CY);
    if (nr >= R) {
      exitAngle = Math.atan2(ny - CY, nx - CX);
      path.push([CX + Math.cos(exitAngle) * R, CY + Math.sin(exitAngle) * R]);
      return true;
    }
    path.push([nx, ny]);
    return false;
  };

  // ── To-scale strip ──
  let W = 600;
  const H = 104;
  let photon: SVGCircleElement, trail: SVGLineElement, x0 = 0, x1 = 0;
  let travelled = 0; // seconds of real time
  const X = (mkm: number) => x0 + (mkm / AU_MKM) * (x1 - x0);
  const place = () => {
    const d = Math.min(AU_MKM, travelled * C_MKM_S);
    if (photon) {
      photon.setAttribute('cx', String(X(d)));
      photon.setAttribute('opacity', phase === 'fly' || phase === 'done' ? '1' : '0');
      trail.setAttribute('x2', String(X(d)));
    }
    timeV.textContent = clock(travelled);
    distV.textContent = fmt(d, d >= 100 || d === 0 ? 0 : 1);
  };
  onWidth(stripHost, (w) => {
    W = w;
    x0 = 14; x1 = W - 16;
    const cy = 52;
    const svg = s('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img',
      'aria-label': 'The sun, Mercury, Venus and Earth on a line drawn to scale. Light takes 3 minutes 13 seconds to pass Mercury, 6 minutes 1 second to pass Venus and 8 minutes 19 seconds to reach Earth.' });
    const defs = s('defs', {},
      s('radialGradient', { id: 'jr-glow' },
        s('stop', { offset: '0', 'stop-color': '#ffb938', 'stop-opacity': 0.55 }),
        s('stop', { offset: '1', 'stop-color': '#ffb938', 'stop-opacity': 0 })));
    svg.append(defs);
    svg.append(s('line', { x1: x0, x2: x1, y1: cy, y2: cy, stroke: 'rgba(255,255,255,.14)', 'stroke-dasharray': '2 5' }));
    svg.append(s('circle', { cx: x0, cy, r: 22, fill: 'url(#jr-glow)' }));
    svg.append(s('circle', { cx: x0, cy, r: Math.max(2, (SUN_R_MKM / AU_MKM) * (x1 - x0)), fill: '#ffd166' }));
    const t0 = s('text', { x: x0 - 6, y: cy - 22, class: 'label' }); t0.textContent = 'Sun';
    svg.append(t0);
    for (const st of STOPS) {
      const x = X(st.d);
      const earth = st.name === 'Earth';
      svg.append(s('circle', { cx: x, cy, r: earth ? 3.2 : 2.2, fill: earth ? '#6fb1ff' : '#8b95a8' }));
      svg.append(s('line', { x1: x, x2: x, y1: cy + 8, y2: cy + 16, stroke: 'rgba(255,255,255,.25)' }));
      const anchor = earth ? 'end' : 'middle';
      const tx = earth ? x + 8 : x;
      const a = s('text', { x: tx, y: cy - 14, 'text-anchor': anchor, class: 'label' }); a.textContent = st.name;
      const b = s('text', { x: tx, y: cy + 31, 'text-anchor': anchor }); b.textContent = clock(st.d / C_MKM_S);
      const c = s('text', { x: tx, y: cy + 46, 'text-anchor': anchor, class: 'axis-title' });
      c.textContent = `${fmt(st.d, st.d > 140 ? 0 : 0)} M km`;
      svg.append(a, b);
      if (W >= 440 || earth) svg.append(c);
    }
    trail = s('line', { x1: x0, x2: x0, y1: cy, y2: cy, stroke: '#ffb938', 'stroke-width': 2, 'stroke-linecap': 'round', opacity: 0.8 });
    photon = s('circle', { cx: x0, cy, r: 4.5, fill: '#fff', stroke: '#ffb938', 'stroke-width': 2, opacity: 0 });
    svg.append(trail, photon);
    stripHost.replaceChildren(svg);
    place();
  });

  const start = () => {
    path = [[CX, CY]];
    travelled = 0;
    phase = 'walk';
    btn.textContent = 'Release another';
    place();
    runner.kick();
  };
  btn.addEventListener('click', start);

  const runner = loop(root, (dt) => {
    if (phase === 'walk') {
      for (let i = 0; i < 5; i++) if (stepWalk()) { phase = 'fly'; break; }
      // Keep the walk from running forever on an unlucky path.
      if (path.length > 1500 && phase === 'walk') { path = [[CX, CY]]; }
      drawWalk();
    } else if (phase === 'fly') {
      travelled = Math.min(TRIP_S, travelled + dt * 60);
      if (travelled >= TRIP_S) phase = 'done';
      place();
    }
  });

  if (reducedMotion()) {
    // Show the finished state without animating.
    while (!stepWalk() && path.length < 1500) { /* build a full path */ }
    phase = 'done'; travelled = TRIP_S;
    drawWalk(); place();
  } else {
    drawWalk();
    // Play once automatically when the figure is first seen.
    const io = new IntersectionObserver((e) => {
      if (e.some((x) => x.isIntersecting) && phase === 'idle') { io.disconnect(); start(); }
    }, { threshold: 0.6 });
    io.observe(root);
  }
}
