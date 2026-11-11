// Figure 4: the band gap. One photon at a time meets one bonded electron.
import { h, fitCanvas, loop, slider, drawPhoton, fmt, pct, clamp } from '../lib.ts';
import { photonEnergyEv, wavelengthCss, bandName, SILICON_GAP_EV as GAP } from '../physics.ts';

interface Shot {
  ev: number; nm: number; x: number; targetX: number; state: 'in' | 'lift' | 'cool' | 'rest' | 'through';
  t: number; ey: number; done: boolean;
}
interface Heat { x: number; y: number; vx: number; vy: number; life: number }

const E_MIN = -0.75, E_MAX = 3.75;

export function gap(root: HTMLElement) {
  let nm = 520;
  const canvas = h('canvas', { class: 'sim', role: 'img', 'aria-label': 'Animation: photons arrive from the left. A photon with more energy than the band gap lifts an electron from the lower band to the upper band, where it quickly loses its extra energy as heat. A photon with less energy passes straight through.' });
  const rE = h('div', { class: 'v' }), rES = h('div', { class: 's' });
  const rKeep = h('div', { class: 'v', style: 'color:var(--good)' }), rKeepS = h('div', { class: 's' });
  const rHeat = h('div', { class: 'v', style: 'color:var(--heat)' }), rHeatS = h('div', { class: 's' });
  const status = h('p', { class: 'status', 'aria-live': 'polite' });
  const sl = slider({
    label: 'Colour of the incoming photons', min: 350, max: 2000, step: 10, value: nm, className: 'rainbow',
    format: (v) => `${fmt(v)} nm · ${bandName(v)}`, onInput: (v) => { nm = v; readout(); timer = Math.min(timer, 0.15); },
  });
  // The rainbow track is calibrated for 300-2500 nm; this slider spans 350-2000.
  sl.input.style.setProperty('--track', 'linear-gradient(90deg,#7a5cff 0%,#4b6bff 5%,#22c8ff 8%,#38e07a 11%,#f5e642 14%,#ff9a2e 16%,#ff3b30 20%,#7a1f1a 32%,#3a1512 100%)');
  const presets = h('div', { class: 'chips' });
  for (const [label, v] of [['Blue', 450], ['Green', 530], ['Red', 680], ['Near infrared', 1000], ['Far infrared', 1600]] as [string, number][]) {
    const b = h('button', { type: 'button' }, label);
    b.addEventListener('click', () => sl.set(v, true));
    presets.append(b);
  }
  root.append(
    h('div', { class: 'fig-head' }, h('div', {},
      h('p', { class: 'fig-title' }, 'One photon meets one electron'),
      h('p', { class: 'fig-sub' }, 'Height is electron energy. Change the colour of the light and watch what silicon does with it.'))),
    canvas,
    h('div', { class: 'controls' }, sl.root, presets),
    h('div', { class: 'readouts' },
      h('div', { class: 'readout' }, h('div', { class: 'k' }, 'Photon brings'), rE, rES),
      h('div', { class: 'readout' }, h('div', { class: 'k' }, 'Electron keeps'), rKeep, rKeepS),
      h('div', { class: 'readout' }, h('div', { class: 'k' }, 'Lost as heat'), rHeat, rHeatS)),
    status,
  );

  function readout() {
    const ev = photonEnergyEv(nm);
    rE.replaceChildren(ev.toFixed(2), h('small', {}, 'eV'));
    rES.textContent = `${bandName(nm)} light`;
    if (ev >= GAP) {
      rKeep.replaceChildren(GAP.toFixed(2), h('small', {}, 'eV'));
      rKeepS.textContent = `${pct(GAP / ev)} of the photon`;
      rHeat.replaceChildren((ev - GAP).toFixed(2), h('small', {}, 'eV'));
      rHeatS.textContent = `${pct(1 - GAP / ev)} of the photon`;
      status.innerHTML = `<b>Absorbed.</b> The photon has ${ev.toFixed(2)} eV, more than the 1.12 eV fee, so it frees one electron and leaves one hole. The spare ${(ev - GAP).toFixed(2)} eV is shed as heat almost instantly.`;
    } else {
      rKeep.replaceChildren('0', h('small', {}, 'eV'));
      rKeepS.textContent = 'nothing absorbed';
      rHeat.replaceChildren('0', h('small', {}, 'eV'));
      rHeatS.textContent = 'the photon carries on';
      status.innerHTML = `<b>Passes through.</b> At ${ev.toFixed(2)} eV the photon cannot pay the 1.12 eV fee. No electron can take it, so the silicon is transparent to this light and its energy is not captured.`;
    }
  }

  const ctx = canvas.getContext('2d')!;
  const size = fitCanvas(canvas, (w) => (w < 560 ? 0.78 : 0.44));
  const shots: Shot[] = [];
  const heat: Heat[] = [];
  let timer = 0.3;

  const Y = (ev: number) => {
    const top = 14, bot = size.h - 12;
    return bot - ((ev - E_MIN) / (E_MAX - E_MIN)) * (bot - top);
  };

  const frame = (dt: number, t: number) => {
    const { w, h: H, dpr } = size;
    if (!w) return;
    timer -= dt;
    if (timer <= 0) {
      timer = 1.5;
      const ev = photonEnergyEv(nm);
      shots.push({ ev, nm, x: -10, targetX: w * (0.38 + Math.random() * 0.4), state: 'in', t: 0, ey: 0, done: false });
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, H);
    const left = w < 560 ? 8 : 16, right = w - (w < 560 ? 8 : 16);
    const yV = Y(0), yC = Y(GAP);

    // Bands
    ctx.fillStyle = 'rgba(76,201,240,0.10)';
    ctx.fillRect(left, yV, right - left, H - 8 - yV);
    const g = ctx.createLinearGradient(0, yC, 0, 8);
    g.addColorStop(0, 'rgba(76,201,240,0.13)'); g.addColorStop(1, 'rgba(76,201,240,0.02)');
    ctx.fillStyle = g;
    ctx.fillRect(left, 8, right - left, yC - 8);
    ctx.strokeStyle = 'rgba(76,201,240,0.55)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(left, yV); ctx.lineTo(right, yV); ctx.moveTo(left, yC); ctx.lineTo(right, yC); ctx.stroke();

    // Bonded electrons sitting in the lower band
    const gapPx = 26;
    const cols = Math.floor((right - left - 20) / gapPx);
    const x0 = left + (right - left - (cols - 1) * gapPx) / 2;
    ctx.fillStyle = 'rgba(76,201,240,0.5)';
    for (let r = 0; r < 2; r++) for (let c = 0; c < cols; c++) {
      const yy = yV + 13 + r * 17;
      if (yy > H - 14) continue;
      ctx.beginPath(); ctx.arc(x0 + c * gapPx + (r ? gapPx / 2 : 0), yy, 4, 0, 6.2832); ctx.fill();
    }

    // Labels
    ctx.font = `${w < 560 ? 11 : 12.5}px Inter, system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(233,237,245,0.85)';
    ctx.textAlign = 'right';
    ctx.fillText('upper band: free to move', right - 8, 22);
    ctx.fillText('lower band: electrons locked in bonds', right - 8, H - 18);
    ctx.fillStyle = 'rgba(163,173,192,0.9)';
    ctx.fillText('nothing allowed here', right - 8, (yV + yC) / 2);
    // Gap bracket
    ctx.textAlign = 'left';
    const bx = left + 10;
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(bx, yV - 3); ctx.lineTo(bx, yC + 3);
    ctx.moveTo(bx - 4, yV - 3); ctx.lineTo(bx + 4, yV - 3); ctx.moveTo(bx - 4, yC + 3); ctx.lineTo(bx + 4, yC + 3); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.fillText('band gap', bx + 9, (yV + yC) / 2 - 8);
    ctx.fillText('1.12 eV', bx + 9, (yV + yC) / 2 + 8);

    // Shots
    for (const sh of shots) {
      sh.t += dt;
      const col = wavelengthCss(sh.nm);
      const absorbed = sh.ev >= GAP;
      // Photons fly in along the middle of the gap, tilted slightly down to the electron.
      const yPh = (yV + yC) / 2 + 4;
      if (sh.state === 'in' || sh.state === 'through') {
        sh.x += dt * w * 0.55;
        const waves = clamp(sh.ev * 1.6, 1.5, 6);
        drawPhoton(ctx, sh.x, yPh, 1, 0, col, -t * 14, 46, 6, waves);
        if (sh.state === 'in' && absorbed && sh.x >= sh.targetX) { sh.state = 'lift'; sh.t = 0; }
        if (sh.x > w + 60) sh.done = true;
        if (!absorbed) sh.state = 'through';
        continue;
      }
      const yTop = Y(Math.min(sh.ev, E_MAX - 0.1));
      let ex = sh.targetX, ey = yC;
      if (sh.state === 'lift') {
        const u = Math.min(1, sh.t / 0.22);
        ey = yV + (yTop - yV) * (1 - (1 - u) ** 2);
        // flash
        ctx.fillStyle = wavelengthCss(sh.nm, 0.35 * (1 - u));
        ctx.beginPath(); ctx.arc(sh.targetX, yPh, 10 + 26 * u, 0, 6.2832); ctx.fill();
        if (u >= 1) { sh.state = 'cool'; sh.t = 0; }
      } else if (sh.state === 'cool') {
        const u = Math.min(1, sh.t / 0.9);
        ey = yTop + (yC - 6 - yTop) * (1 - (1 - u) ** 2);
        ex = sh.targetX + Math.sin(u * 16) * 5 * (1 - u);
        if (yC - yTop > 12 && Math.random() < 0.5 * (1 - u)) {
          const a = Math.random() * 6.2832;
          heat.push({ x: ex, y: ey, vx: Math.cos(a) * 40, vy: Math.sin(a) * 40, life: 0.6 });
        }
        if (u >= 1) { sh.state = 'rest'; sh.t = 0; }
      } else {
        ex = sh.targetX + sh.t * 26; ey = yC - 6;
        if (sh.t > 2.6) sh.done = true;
      }
      const fade = sh.state === 'rest' ? clamp(2.6 - sh.t, 0, 1) : 1;
      // Hole left in the lower band, drifting the other way
      const hx = sh.targetX - (sh.state === 'rest' ? sh.t * 26 : 0);
      ctx.strokeStyle = `rgba(255,107,129,${fade})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(hx, yV + 7, 5, 0, 6.2832); ctx.stroke();
      // Electron
      ctx.fillStyle = `rgba(76,201,240,${fade})`;
      ctx.shadowColor = 'rgba(76,201,240,0.9)'; ctx.shadowBlur = 12 * fade;
      ctx.beginPath(); ctx.arc(ex, ey, 5.5, 0, 6.2832); ctx.fill();
      ctx.shadowBlur = 0;
      if (sh.state === 'cool' && yC - yTop > 12) {
        ctx.fillStyle = 'rgba(255,122,69,0.95)'; ctx.textAlign = 'left';
        ctx.fillText('heat', ex + 14, ey - 4);
      }
    }
    for (let i = shots.length - 1; i >= 0; i--) if (shots[i].done) shots.splice(i, 1);

    // Heat sparks
    ctx.strokeStyle = 'rgba(255,122,69,0.9)'; ctx.lineWidth = 1.5;
    for (let i = heat.length - 1; i >= 0; i--) {
      const p = heat[i];
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.life <= 0) { heat.splice(i, 1); continue; }
      ctx.globalAlpha = Math.min(1, p.life * 2.5);
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.09, p.y - p.vy * 0.09); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  };

  readout();
  loop(canvas, frame);
}
