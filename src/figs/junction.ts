// Figure 7: the p-n junction. Three steps: two separate pieces, joined, lit.
//
// What is simulated: carriers wander by random walk (diffusion). Only inside
// the thin charged zone is there a field, which sweeps electrons to the n-side
// and holes to the p-side. A light-generated minority carrier that wanders
// into the zone is collected; one that does not make it in time recombines.
import { h, fitCanvas, loop, slider, segmented, drawPhoton, clamp, fmt } from '../lib.ts';

type Kind = 'e' | 'h';
interface Carrier {
  kind: Kind; x: number; y: number; vx: number; vy: number;
  side: 'n' | 'p';           // region it currently belongs to
  minority: boolean; life: number;
  mode: 'walk' | 'sweep' | 'pair' | 'exit';
  tx: number; ty: number;     // target for scripted moves
  mate?: Carrier; counts?: boolean; dead?: boolean;
}
interface Photon { x: number; y: number; yAbs: number; phase: number }
interface Flash { x: number; y: number; t: number; color: string }

const PAIRS_TO_BUILD = 7;

export function junction(root: HTMLElement) {
  let step = 0;
  let brightness = 0.6;
  let collected = 0, lost = 0;

  const canvas = h('canvas', { class: 'sim', role: 'img', 'aria-label': 'Animated cross-section of a p-n junction: an n-type layer with free electrons on top of a p-type layer with free holes. When joined, a charged zone with an electric field forms between them. Under light, the field sends freed electrons up and holes down, driving electrons round an external wire through a lamp.' });
  const status = h('p', { class: 'status', 'aria-live': 'polite' });
  const rCount = h('div', { class: 'v' }, '0');
  const rLost = h('div', { class: 'v' }, '0');
  const sl = slider({ label: 'Brightness of the light', min: 0, max: 1, step: 0.05, value: brightness, thumb: 'var(--photon)',
    format: (v) => (v === 0 ? 'dark' : `${Math.round(v * 100)}%`), onInput: (v) => { brightness = v; } });
  const texts = [
    '<b>Two separate pieces.</b> The n-type piece has wandering electrons; the p-type piece has wandering holes. Each piece is neutral: every wanderer is balanced by a fixed charged atom (the faint + and − marks).',
    '<b>Joined.</b> Electrons near the boundary spill over and fill holes. That leaves bare charged atoms on both sides: a zone with + above and − below, and an electric field between them that stops further spilling.',
    '<b>Light on.</b> Each absorbed photon frees an electron and a hole. If the lone electron wanders into the charged zone, the field sweeps it up to the n-side, and one electron is pushed out through the wire. If it meets a hole first, the pair is lost as heat.',
  ];
  const seg = segmented(
    [{ id: '0', label: 'Two pieces', html: '<span class="step-n">1</span>Two pieces' },
     { id: '1', label: 'Join them', html: '<span class="step-n">2</span>Join them' },
     { id: '2', label: 'Shine light', html: '<span class="step-n">3</span>Shine light' }],
    '0', (v) => setStep(+v), 'Step');
  const lightUi = h('div', { class: 'controls', style: 'display:none' }, sl.root,
    h('div', { class: 'readouts', style: 'flex:2 1 16rem;margin-top:0' },
      h('div', { class: 'readout' }, h('div', { class: 'k' }, 'Electrons sent round the wire'), rCount),
      h('div', { class: 'readout' }, h('div', { class: 'k' }, 'Pairs lost before collection'), rLost)));
  root.append(
    h('div', { class: 'controls top' }, seg.root),
    canvas,
    h('ul', { class: 'legend' },
      h('li', {}, h('i', { class: 'dot', style: 'background:var(--electron)' }), 'free electron'),
      h('li', {}, h('i', { class: 'ring' }), 'hole'),
      h('li', {}, h('span', { style: 'color:#8fb2ff;font-weight:700' }, '+'), h('span', { style: 'color:#ff8fa8;font-weight:700' }, '−'), 'fixed charged atoms'),
      h('li', {}, h('i', { class: 'line', style: 'color:var(--photon)' }), 'photon')),
    status, lightUi,
  );

  const ctx = canvas.getContext('2d')!;
  let G = { x0: 0, x1: 0, nTop: 0, yJ: 0, yB: 0, D: 0, wireX: 0 };
  let carriers: Carrier[] = [];
  let photons: Photon[] = [];
  let flashes: Flash[] = [];
  let dep = 0;        // 0..1 how far the charged zone has built up
  let sep = 1;        // 1 = pieces apart, 0 = joined
  let pairTimer = 0, photonTimer = 0;
  let wireShift = 0, wireTarget = 0, glow = 0;

  let narrow = false;
  const size = fitCanvas(canvas, (w) => (w < 560 ? 1.02 : 0.54), (w, H) => {
    const small = narrow = w < 560;
    const wire = small ? 58 : 130;
    G = { x0: small ? 10 : 22, x1: w - wire, nTop: 40, yJ: 40 + (H - 96) * 0.34, yB: H - 56, D: (H - 96) * 0.085, wireX: w - wire / 2 };
    reset();
  });
  const gapPx = () => sep * 20;

  function mk(kind: Kind, side: 'n' | 'p', x: number, y: number, minority = false): Carrier {
    return { kind, x, y, vx: 0, vy: 0, side, minority, life: 0, mode: 'walk', tx: 0, ty: 0 };
  }
  function reset() {
    carriers = []; photons = []; flashes = [];
    const { x0, x1, nTop, yJ, yB } = G;
    const n = narrow ? 16 : 28;
    for (let i = 0; i < n; i++) {
      carriers.push(mk('e', 'n', x0 + 8 + Math.random() * (x1 - x0 - 16), nTop + 6 + Math.random() * (yJ - nTop - 12)));
      carriers.push(mk('h', 'p', x0 + 8 + Math.random() * (x1 - x0 - 16), yJ + 6 + Math.random() * (yB - yJ - 12)));
    }
    collected = 0; lost = 0; rCount.textContent = '0'; rLost.textContent = '0';
    wireShift = wireTarget = 0;
    if (step === 0) { dep = 0; sep = 1; }
    else if (step === 1) { dep = 0; }
    else { dep = 1; sep = 0; settle(); }
  }
  /** Jump straight to the built-up state (used when skipping to step 3). */
  function settle() {
    const { yJ, D } = G;
    for (let k = 0; k < PAIRS_TO_BUILD; k++) {
      const e = nearest('e', 'n', undefined, yJ), ho = nearest('h', 'p', undefined, yJ);
      if (e) e.dead = true; if (ho) ho.dead = true;
    }
    carriers = carriers.filter((c) => !c.dead);
    for (const c of carriers) {
      if (c.side === 'n') c.y = Math.min(c.y, yJ - D - 4); else c.y = Math.max(c.y, yJ + D + 4);
    }
  }
  function setStep(v: number) {
    const prev = step; step = v;
    status.innerHTML = texts[v];
    lightUi.style.display = v === 2 ? '' : 'none';
    if (v === 1 && prev === 0) { /* animate the join from the current state */ }
    else reset();
    if (v < 2) { photons = []; }
    runner.kick();
  }

  function nearest(kind: Kind, side: 'n' | 'p', x: number | undefined, y: number): Carrier | undefined {
    let best: Carrier | undefined, bd = Infinity;
    for (const c of carriers) {
      if (c.kind !== kind || c.side !== side || c.mode !== 'walk' || c.minority || c.dead) continue;
      const d = Math.abs(c.y - y) + (x == null ? 0 : Math.abs(c.x - x) * 0.6);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }
  const flash = (x: number, y: number, color: string) => flashes.push({ x, y, t: 0, color });

  /** One separated pair = one electron pushed round the external circuit. */
  function collect() {
    const { nTop, yB } = G;
    const fx = fingerXs();
    const e = nearest('e', 'n', undefined, nTop);
    if (e) {
      e.mode = 'exit';
      e.tx = fx.reduce((a, b) => (Math.abs(b - e.x) < Math.abs(a - e.x) ? b : a));
      e.ty = nTop - 2;
    }
    const ho = nearest('h', 'p', undefined, yB);
    if (ho) { ho.mode = 'exit'; ho.tx = ho.x; ho.ty = yB + 2; }
    collected++; rCount.textContent = fmt(collected);
    wireTarget += 1;
  }
  function fingerXs() {
    const { x0, x1 } = G;
    const n = narrow ? 3 : 5;
    return Array.from({ length: n }, (_, i) => x0 + ((i + 0.5) / n) * (x1 - x0));
  }

  function update(dt: number) {
    const { x0, x1, nTop, yJ, yB, D } = G;
    // Joining animation
    if (step >= 1 && sep > 0) sep = Math.max(0, sep - dt * 1.6);
    if (step === 1 && sep === 0 && dep < 1) {
      pairTimer -= dt;
      if (pairTimer <= 0) {
        pairTimer = 0.55;
        const e = nearest('e', 'n', undefined, yJ);
        const ho = e && nearest('h', 'p', e.x, yJ);
        if (e && ho) {
          // Alternate: electron spills down into a hole, or a hole spills up to an electron.
          const down = Math.round(dep * PAIRS_TO_BUILD) % 2 === 0;
          const my = yJ + (down ? 1 : -1) * D * 0.5, mx = (e.x + ho.x) / 2;
          e.mode = ho.mode = 'pair'; e.mate = ho; ho.mate = e;
          e.tx = ho.tx = mx; e.ty = ho.ty = my;
        }
      }
    }
    const zoneTop = yJ - D * dep, zoneBot = yJ + D * dep;

    for (const c of carriers) {
      if (c.mode === 'walk') {
        c.vx += (Math.random() - 0.5) * 900 * dt; c.vy += (Math.random() - 0.5) * 900 * dt;
        const sp = Math.hypot(c.vx, c.vy), max = c.minority ? 60 : 42;
        if (sp > max) { c.vx *= max / sp; c.vy *= max / sp; }
        c.x += c.vx * dt; c.y += c.vy * dt;
        if (c.x < x0 + 6) { c.x = x0 + 6; c.vx = Math.abs(c.vx); }
        if (c.x > x1 - 6) { c.x = x1 - 6; c.vx = -Math.abs(c.vx); }
        const off = c.side === 'p' ? gapPx() : 0;
        const yy = c.y - off;
        if (c.side === 'n') {
          if (yy < nTop + 6) { c.y = nTop + 6; c.vy = Math.abs(c.vy); }
          const lim = (c.minority ? zoneTop + 2 : zoneTop - 5);
          if (yy > lim) {
            if (c.minority && step === 2) { c.mode = 'sweep'; c.ty = zoneBot + 10; c.counts = true; }
            else { c.y = lim; c.vy = -Math.abs(c.vy); }
          }
        } else {
          if (yy > yB - 6) { c.y = yB - 6 + off; c.vy = -Math.abs(c.vy); }
          const lim = (c.minority ? zoneBot - 2 : zoneBot + 5);
          if (yy < lim) {
            if (c.minority && step === 2) { c.mode = 'sweep'; c.ty = zoneTop - 10; c.counts = true; }
            else { c.y = lim + off; c.vy = Math.abs(c.vy); }
          }
        }
        if (c.minority && c.mode === 'walk') {
          c.life -= dt;
          if (c.life <= 0) {
            // Recombination: the lone carrier meets one of the opposite kind.
            const mate = nearest(c.kind === 'e' ? 'h' : 'e', c.side, c.x, c.y);
            if (mate) { mate.dead = true; }
            c.dead = true; flash(c.x, c.y, 'rgba(255,122,69,'); lost++; rLost.textContent = fmt(lost);
          }
        }
      } else if (c.mode === 'sweep') {
        // The field: electrons are pushed up (towards n), holes down (towards p).
        const dir = c.kind === 'e' ? -1 : 1;
        c.y += dir * 190 * dt;
        if ((dir < 0 && c.y <= c.ty) || (dir > 0 && c.y >= c.ty)) {
          c.mode = 'walk'; c.minority = false; c.side = c.kind === 'e' ? 'n' : 'p'; c.vy = dir * 30;
          if (c.counts) collect();
        }
      } else if (c.mode === 'pair' || c.mode === 'exit') {
        const dx = c.tx - c.x, dy = c.ty - c.y, d = Math.hypot(dx, dy);
        const v = c.mode === 'exit' ? 150 : 70;
        if (d < v * dt + 1) {
          c.dead = true;
          if (c.mode === 'pair' && c.mate && !c.mate.dead) { /* wait for mate */ c.dead = false; c.x = c.tx; c.y = c.ty;
            const m = c.mate; if (Math.hypot(m.tx - m.x, m.ty - m.y) < 3) { c.dead = m.dead = true; flash(c.x, c.y, 'rgba(255,255,255,'); dep = Math.min(1, dep + 1 / PAIRS_TO_BUILD); }
          }
        } else { c.x += (dx / d) * v * dt; c.y += (dy / d) * v * dt; }
      }
    }
    carriers = carriers.filter((c) => !c.dead);

    // Light
    if (step === 2 && brightness > 0) {
      photonTimer -= dt;
      if (photonTimer <= 0) {
        photonTimer = (0.1 + Math.random() * 0.14) / brightness;
        const fx = fingerXs();
        let x = 0;
        do { x = x0 + 12 + Math.random() * (x1 - x0 - 24); } while (fx.some((f) => Math.abs(f - x) < 12));
        // Most light is absorbed in the first part of the thick p-layer; some in the thin n-layer.
        const r = Math.random();
        const yAbs = r < 0.22 ? nTop + 6 + Math.random() * (zoneTop - nTop - 10)
          : r < 0.34 ? zoneTop + Math.random() * (zoneBot - zoneTop)
          : zoneBot + 6 + Math.min(0.97, -Math.log(1 - Math.random()) * 0.38) * (yB - zoneBot - 12);
        photons.push({ x, y: -20, yAbs, phase: Math.random() * 6 });
      }
    }
    for (const p of photons) {
      p.y += 330 * dt; p.phase -= dt * 16;
      if (p.y >= p.yAbs) {
        flash(p.x, p.yAbs, 'rgba(255,185,56,');
        const inZone = p.yAbs > zoneTop && p.yAbs < zoneBot;
        const side: 'n' | 'p' = p.yAbs < yJ ? 'n' : 'p';
        const e = mk('e', side, p.x + 4, p.yAbs), ho = mk('h', side, p.x - 4, p.yAbs);
        if (inZone) {
          e.mode = 'sweep'; e.ty = zoneTop - 10; e.counts = true;
          ho.mode = 'sweep'; ho.ty = zoneBot + 10;
        } else {
          const minority = side === 'p' ? e : ho;
          minority.minority = true; minority.life = 2.5 + Math.random() * 5;
        }
        carriers.push(e, ho);
        p.y = Infinity;
      }
    }
    photons = photons.filter((p) => p.y !== Infinity);
    for (const f of flashes) f.t += dt;
    flashes = flashes.filter((f) => f.t < 0.45);
    const adv = (wireTarget - wireShift) * Math.min(1, dt * 5);
    wireShift += adv;
    glow += (Math.min(1, (adv / Math.max(dt, 0.001)) / 3.2) - glow) * Math.min(1, dt * 2.5);
  }

  function draw() {
    const { w, h: H, dpr } = size;
    const { x0, x1, nTop, yJ, yB, D, wireX } = G;
    const small = w < 560;
    const off = gapPx();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, H);
    ctx.font = `600 ${small ? 11.5 : 13}px Inter, system-ui, sans-serif`;
    ctx.textBaseline = 'middle';

    // Layers
    ctx.fillStyle = 'rgba(91,141,239,0.20)';
    ctx.fillRect(x0, nTop, x1 - x0, yJ - nTop);
    ctx.fillStyle = 'rgba(224,86,122,0.16)';
    ctx.fillRect(x0, yJ + off, x1 - x0, yB - yJ);
    // Charged zone
    if (dep > 0) {
      const g = ctx.createLinearGradient(0, yJ - D, 0, yJ + D);
      g.addColorStop(0, 'rgba(143,178,255,0)'); g.addColorStop(0.35, `rgba(143,178,255,${0.2 * dep})`);
      g.addColorStop(0.5, `rgba(255,255,255,${0.05 * dep})`);
      g.addColorStop(0.65, `rgba(255,143,168,${0.2 * dep})`); g.addColorStop(1, 'rgba(255,143,168,0)');
      ctx.fillStyle = g; ctx.fillRect(x0, yJ - D * 1.4, x1 - x0, D * 2.8);
    }
    if (sep === 0) {
      ctx.setLineDash([5, 5]); ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x0, yJ); ctx.lineTo(x1, yJ); ctx.stroke(); ctx.setLineDash([]);
    }
    // Metal contacts
    ctx.fillStyle = '#c9d2e0';
    for (const fx of fingerXs()) ctx.fillRect(fx - 9, nTop - 9, 18, 9);
    ctx.fillStyle = '#8a94a6';
    ctx.fillRect(x0, yB + off, x1 - x0, 8);

    // Fixed ions
    const sp = small ? 30 : 36;
    ctx.textAlign = 'center';
    ctx.font = `700 ${small ? 12 : 13}px Inter, system-ui, sans-serif`;
    const cols = Math.floor((x1 - x0) / sp);
    const ox = x0 + ((x1 - x0) - (cols - 1) * sp) / 2;
    const zoneTop = yJ - D * dep, zoneBot = yJ + D * dep;
    for (let c = 0; c < cols; c++) {
      const x = ox + c * sp;
      for (let y = yJ - sp * 0.42; y > nTop + 8; y -= sp * 0.84) {
        const lit = dep > 0 && y > zoneTop - 2;
        ctx.fillStyle = lit ? '#b9cfff' : 'rgba(143,178,255,0.22)';
        ctx.fillText('+', x, y);
      }
      for (let y = yJ + sp * 0.42; y < yB - 8; y += sp * 0.84) {
        const lit = dep > 0 && y < zoneBot + 2;
        ctx.fillStyle = lit ? '#ffb3c4' : 'rgba(255,143,168,0.22)';
        ctx.fillText('−', x, y + off);
      }
    }

    // Region labels
    ctx.font = `600 ${small ? 11.5 : 13}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#a9c2ff'; ctx.fillText(small ? 'n-type' : 'n-type silicon (phosphorus added)', x0 + 8, nTop + 13);
    ctx.fillStyle = '#ffa3b8'; ctx.fillText(small ? 'p-type' : 'p-type silicon (boron added)', x0 + 8, yB + off - 13);
    ctx.fillStyle = 'rgba(163,173,192,0.95)';
    ctx.font = `500 ${small ? 10.5 : 12}px Inter, system-ui, sans-serif`;
    if (step === 2) { ctx.fillText(small ? 'front contacts' : 'metal contacts on the front', x0, nTop - 22); }
    if (step === 2 && !small) ctx.fillText('metal contact on the back', x0, yB + 22);

    // Field arrow, drawn at the left edge of the zone
    if (dep > 0.5 && sep === 0) {
      const a = (dep - 0.5) * 2;
      const ax = x1 - (small ? 16 : 26);
      ctx.globalAlpha = a;
      ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(ax, yJ - D * 0.8); ctx.lineTo(ax, yJ + D * 0.8 - 5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ax - 5, yJ + D * 0.8 - 7); ctx.lineTo(ax + 5, yJ + D * 0.8 - 7); ctx.lineTo(ax, yJ + D * 0.8 + 1); ctx.fill();
      ctx.textAlign = 'right';
      ctx.font = `600 ${small ? 11 : 12.5}px Inter, system-ui, sans-serif`;
      ctx.fillText(small ? 'field' : 'electric field', ax - 10, yJ);
      ctx.globalAlpha = 1;
    }

    // External circuit
    if (step === 2) {
      const yTop = nTop - 5, yBot = yB + 4;
      const lampY = (yTop + yBot) / 2;
      ctx.strokeStyle = '#5d6880'; ctx.lineWidth = 3; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(x1 - 6, yTop); ctx.lineTo(wireX, yTop); ctx.lineTo(wireX, yBot); ctx.lineTo(x1, yBot); ctx.stroke();
      // Electrons in the wire: a full chain that shuffles along when one is pushed in.
      const path = (u: number): [number, number] => {
        const l1 = wireX - (x1 - 6), l2 = yBot - yTop, l3 = wireX - x1;
        let d = u * (l1 + l2 + l3);
        if (d < l1) return [x1 - 6 + d, yTop];
        d -= l1; if (d < l2) return [wireX, yTop + d];
        d -= l2; return [wireX - d, yBot];
      };
      const total = (wireX - x1 + 6) + (yBot - yTop) + (wireX - x1);
      const n = Math.max(6, Math.round(total / 16));
      ctx.fillStyle = 'rgba(76,201,240,0.95)';
      const frac = wireShift - Math.floor(wireShift);
      for (let i = 0; i < n; i++) {
        const [px, py] = path((i + frac) / n);
        if (Math.abs(py - lampY) < 15 && px === wireX) continue;
        ctx.beginPath(); ctx.arc(px, py, 2.6, 0, 6.2832); ctx.fill();
      }
      // Lamp
      const r = small ? 12 : 16;
      const gl = ctx.createRadialGradient(wireX, lampY, 0, wireX, lampY, r * 3.2);
      gl.addColorStop(0, `rgba(255,214,120,${0.75 * glow})`); gl.addColorStop(1, 'rgba(255,214,120,0)');
      ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(wireX, lampY, r * 3.2, 0, 6.2832); ctx.fill();
      ctx.fillStyle = `rgb(${Math.round(60 + 195 * glow)},${Math.round(64 + 150 * glow)},${Math.round(80 + 40 * glow)})`;
      ctx.strokeStyle = '#aeb7c7'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(wireX, lampY, r, 0, 6.2832); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(163,173,192,0.95)'; ctx.textAlign = 'center';
      ctx.font = `500 ${small ? 10.5 : 12}px Inter, system-ui, sans-serif`;
      ctx.fillText('lamp', wireX, lampY + r + 12);
    }

    // Photons
    for (const p of photons) drawPhoton(ctx, p.x, p.y, 0, 1, 'rgba(255,185,56,0.95)', p.phase, 30, 4, 2.5);

    // Flashes
    for (const f of flashes) {
      const u = f.t / 0.45;
      ctx.strokeStyle = `${f.color}${(1 - u) * 0.9})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(f.x, f.y, 4 + u * 16, 0, 6.2832); ctx.stroke();
    }

    // Carriers
    for (const c of carriers) {
      const yy = c.y + (c.side === 'p' && c.mode !== 'pair' ? off : 0);
      const hot = c.minority || c.mode === 'sweep';
      if (c.kind === 'e') {
        ctx.fillStyle = '#4cc9f0';
        if (hot) { ctx.shadowColor = '#4cc9f0'; ctx.shadowBlur = 12; }
        ctx.beginPath(); ctx.arc(c.x, yy, hot ? 5 : 4, 0, 6.2832); ctx.fill();
        ctx.shadowBlur = 0;
      } else {
        ctx.strokeStyle = '#ff6b81'; ctx.lineWidth = hot ? 2.5 : 2;
        ctx.beginPath(); ctx.arc(c.x, yy, hot ? 5 : 4, 0, 6.2832); ctx.stroke();
      }
    }
  }

  const runner = loop(canvas, (dt) => { if (size.w) { update(dt); draw(); } });
  status.innerHTML = texts[0];
  void clamp;
}
