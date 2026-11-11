import {
  SI_BANDGAP_EV,
  spectralBandLabel,
  wavelengthToCssColor,
  wavelengthToEv,
} from '../physics/solarPhysics';
import { drawRoundedRect, setupResponsiveCanvas } from './canvasUtils';

interface Preset {
  label: string;
  nm: number;
}

const PRESETS: Preset[] = [
  { label: 'UV · 350 nm', nm: 350 },
  { label: 'Blue · 460 nm', nm: 460 },
  { label: 'Green · 540 nm', nm: 540 },
  { label: 'Red · 660 nm', nm: 660 },
  { label: 'Si Edge · 1105 nm', nm: 1105 },
  { label: 'Infrared · 1550 nm', nm: 1550 },
];

export function initPhotonTuner(): void {
  const mount = document.getElementById('photon-tuner-mount');
  if (!mount) return;

  let wavelengthNm = 540;

  mount.innerHTML = `
    <div class="ctrl-bar">
      <div class="ctrl-group">
        <div class="ctrl-label-row">
          <span>Photon Wavelength (&lambda;)</span>
          <span class="ctrl-val" id="pt-wl-val">540 nm &middot; Green</span>
        </div>
        <input type="range" id="pt-wl-slider" min="300" max="1850" step="5" value="540" aria-label="Photon wavelength in nanometers" />
      </div>
      <div class="btn-group" id="pt-presets" role="group" aria-label="Wavelength presets">
        ${PRESETS.map(
          (p) =>
            `<button type="button" class="stage-btn ${p.nm === 540 ? 'active-gold' : ''}" data-nm="${p.nm}">${p.label}</button>`
        ).join('')}
      </div>
    </div>
    <div class="chart-canvas-wrap">
      <canvas id="pt-canvas"></canvas>
    </div>
    <div class="metrics-row">
      <div class="metric-tile">
        <span class="m-label">Photon Energy Packet</span>
        <span class="m-value" id="pt-ev-val">2.30 eV</span>
        <span class="m-sub" id="pt-band-sub">Visible Green Light</span>
      </div>
      <div class="metric-tile">
        <span class="m-label">Silicon Bandgap Hurdle</span>
        <span class="m-value">1.12 eV</span>
        <span class="m-sub">Cutoff at &lambda; = 1,107 nm</span>
      </div>
      <div class="metric-tile">
        <span class="m-label">Outcome Inside Silicon</span>
        <span class="m-value" id="pt-outcome-val" style="color:#34d399;">Electron Freed!</span>
        <span class="m-sub" id="pt-outcome-sub">Promoted across 1.12 eV gap</span>
      </div>
      <div class="metric-tile">
        <span class="m-label">Leftover Heat Shed</span>
        <span class="m-value" id="pt-heat-val" style="color:#fb923c;">1.18 eV (51%)</span>
        <span class="m-sub" id="pt-heat-sub">Turns into crystal vibrations</span>
      </div>
    </div>
  `;

  const slider = mount.querySelector('#pt-wl-slider') as HTMLInputElement;
  const wlLabel = mount.querySelector('#pt-wl-val') as HTMLElement;
  const evVal = mount.querySelector('#pt-ev-val') as HTMLElement;
  const bandSub = mount.querySelector('#pt-band-sub') as HTMLElement;
  const outcomeVal = mount.querySelector('#pt-outcome-val') as HTMLElement;
  const outcomeSub = mount.querySelector('#pt-outcome-sub') as HTMLElement;
  const heatVal = mount.querySelector('#pt-heat-val') as HTMLElement;
  const heatSub = mount.querySelector('#pt-heat-sub') as HTMLElement;
  const presetBtns = Array.from(mount.querySelectorAll('#pt-presets button')) as HTMLButtonElement[];
  const canvas = mount.querySelector('#pt-canvas') as HTMLCanvasElement;

  const syncUi = () => {
    const ev = wavelengthToEv(wavelengthNm);
    const band = spectralBandLabel(wavelengthNm);
    wlLabel.textContent = `${wavelengthNm} nm · ${band}`;
    evVal.textContent = `${ev.toFixed(2)} eV`;
    evVal.style.color = wavelengthToCssColor(wavelengthNm, 1);
    bandSub.textContent = band;

    if (ev >= SI_BANDGAP_EV) {
      const heat = Math.max(0, ev - SI_BANDGAP_EV);
      const heatPct = Math.round((heat / ev) * 100);
      outcomeVal.textContent = 'Absorbed → Freed!';
      outcomeVal.style.color = '#34d399';
      outcomeSub.textContent = '1.12 eV stored as electrical potential';
      heatVal.textContent = `${heat.toFixed(2)} eV (${heatPct}%)`;
      heatVal.style.color = heat > 0.15 ? '#fb923c' : '#34d399';
      heatSub.textContent =
        heat < 0.08 ? 'Near-zero heat loss right at threshold!' : 'Excess energy shakes lattice as heat';
    } else {
      outcomeVal.textContent = 'Passes Right Through';
      outcomeVal.style.color = '#94a3b8';
      outcomeSub.textContent = `Short by ${(SI_BANDGAP_EV - ev).toFixed(2)} eV — silicon looks transparent`;
      heatVal.textContent = '0.00 eV';
      heatVal.style.color = '#94a3b8';
      heatSub.textContent = 'No absorption occurs';
    }

    for (const btn of presetBtns) {
      const btnNm = Number(btn.dataset.nm);
      btn.classList.toggle('active-gold', Math.abs(btnNm - wavelengthNm) <= 10);
    }
  };

  slider.addEventListener('input', () => {
    wavelengthNm = Number(slider.value);
    syncUi();
  });

  for (const btn of presetBtns) {
    btn.addEventListener('click', () => {
      wavelengthNm = Number(btn.dataset.nm);
      slider.value = String(wavelengthNm);
      syncUi();
    });
  }

  syncUi();

  setupResponsiveCanvas(
    canvas,
    (w) => (w < 600 ? 255 : 235),
    (ctx, w, h, t) => {
      const ev = wavelengthToEv(wavelengthNm);
      const absorbed = ev >= SI_BANDGAP_EV;
      const excessEv = Math.max(0, ev - SI_BANDGAP_EV);
      const color = wavelengthToCssColor(wavelengthNm, 1);
      const colorSoft = wavelengthToCssColor(wavelengthNm, 0.24);

      // Background stage card
      drawRoundedRect(ctx, 0, 0, w, h, 12);
      ctx.fillStyle = '#090f1d';
      ctx.fill();

      const splitX = w < 600 ? w * 0.54 : w * 0.58;

      // Left zone: Incoming Electromagnetic Wave
      const waveStartX = 20;
      const waveEndX = absorbed ? splitX + 18 : w - 20;
      const centerY = h * 0.52;

      // Subtle spectrum ruler strip along bottom of wave panel
      const barY = h - 22;
      const barW = splitX - 36;
      const grad = ctx.createLinearGradient(20, 0, 20 + barW, 0);
      grad.addColorStop(0, '#8b5cf6');
      grad.addColorStop(0.12, '#3b82f6');
      grad.addColorStop(0.22, '#22c55e');
      grad.addColorStop(0.3, '#eab308');
      grad.addColorStop(0.38, '#ef4444');
      grad.addColorStop(0.55, '#881337');
      grad.addColorStop(1, '#3f1d2b');
      drawRoundedRect(ctx, 20, barY, barW, 6, 3);
      ctx.fillStyle = grad;
      ctx.fill();

      const markerU = (wavelengthNm - 300) / (1850 - 300);
      const markerX = 20 + markerU * barW;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(markerX, barY + 3, 5, 0, Math.PI * 2);
      ctx.fill();

      // Right zone: Silicon Energy Ladder (Valence Band -> 1.12 eV Gap -> Conduction Band)
      const boxX = splitX;
      const boxW = w - splitX - 14;
      const boxTop = 16;
      const boxH = h - 32;

      drawRoundedRect(ctx, boxX, boxTop, boxW, boxH, 10);
      ctx.fillStyle = 'rgba(23, 35, 59, 0.82)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
      ctx.lineWidth = 1;
      ctx.stroke();

      const valenceY = boxTop + boxH - 36;
      const gapPx = Math.min(92, boxH * 0.42);
      const condBandBottomY = valenceY - gapPx;

      // Conduction Band shaded zone
      drawRoundedRect(ctx, boxX + 10, boxTop + 26, boxW - 20, condBandBottomY - (boxTop + 26), 6);
      ctx.fillStyle = 'rgba(56, 189, 248, 0.12)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
      ctx.beginPath();
      ctx.moveTo(boxX + 10, condBandBottomY);
      ctx.lineTo(boxX + boxW - 10, condBandBottomY);
      ctx.stroke();

      // Valence Band shaded zone
      drawRoundedRect(ctx, boxX + 10, valenceY, boxW - 20, 26, 6);
      ctx.fillStyle = 'rgba(148, 163, 184, 0.18)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
      ctx.beginPath();
      ctx.moveTo(boxX + 10, valenceY);
      ctx.lineTo(boxX + boxW - 10, valenceY);
      ctx.stroke();

      // Labels for bands
      ctx.font = '600 11px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillStyle = '#7dd3fc';
      ctx.textAlign = 'left';
      ctx.fillText('Mobile State (Conduction Band)', boxX + 16, boxTop + 19);

      ctx.fillStyle = '#cbd5e1';
      ctx.fillText('Locked Bond (Valence Band)', boxX + 16, valenceY + 17);

      // 1.12 eV gap indicator arrow
      const arrowX = boxX + 24;
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.55)';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(arrowX, valenceY - 3);
      ctx.lineTo(arrowX, condBandBottomY + 3);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#fbbf24';
      ctx.font = '700 10.5px ui-monospace, monospace';
      ctx.fillText('1.12 eV gap', arrowX + 6, (valenceY + condBandBottomY) / 2 + 4);

      // Draw continuous oscillating electromagnetic wave with visual spatial period proportional to wavelength
      const visualPeriodPx = 14 + ((wavelengthNm - 300) / 1550) * 68;
      const kWave = (Math.PI * 2) / visualPeriodPx;
      const amp = 22;

      // Soft glow behind wave
      ctx.strokeStyle = colorSoft;
      ctx.lineWidth = 7;
      ctx.beginPath();
      for (let x = waveStartX; x <= waveEndX; x += 2) {
        const atten = !absorbed && x > splitX ? 0.65 : 1;
        const y = centerY + Math.sin(x * kWave - t * 8.5) * amp * atten;
        if (x === waveStartX) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      ctx.strokeStyle = color;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      for (let x = waveStartX; x <= waveEndX; x += 2) {
        const atten = !absorbed && x > splitX ? 0.65 : 1;
        const y = centerY + Math.sin(x * kWave - t * 8.5) * amp * atten;
        if (x === waveStartX) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      ctx.fillStyle = '#94a3b8';
      ctx.font = '600 11px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(
        `Incoming Wave: λ = ${wavelengthNm} nm (${ev.toFixed(2)} eV)`,
        20,
        24
      );

      // Animate electron inside Silicon Energy Ladder
      const eCenterX = boxX + boxW * 0.66;
      const cycle = (t * 0.62) % 1;

      if (absorbed) {
        // Peak height proportional to photon energy E relative to 1.12 eV
        const liftRatio = Math.min(1.85, ev / SI_BANDGAP_EV);
        const peakY = Math.max(boxTop + 34, valenceY - gapPx * liftRatio);

        let eY = valenceY + 13;
        if (cycle < 0.22) {
          // Photon lifts electron straight up to peakY
          const u = cycle / 0.22;
          const ease = 1 - Math.pow(1 - u, 3);
          eY = valenceY + 13 + (peakY - (valenceY + 13)) * ease;
        } else if (cycle < 0.55) {
          // Thermalization: electron sheds excess energy (E - Eg) as heat ripples down to conduction band edge
          const u = (cycle - 0.22) / 0.33;
          eY = peakY + (condBandBottomY - 8 - peakY) * u;

          if (excessEv > 0.08) {
            const rippleR = 6 + u * 26;
            ctx.strokeStyle = `rgba(251, 146, 60, ${(1 - u) * 0.85})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(eCenterX, eY, rippleR, 0, Math.PI * 2);
            ctx.stroke();
          }
        } else {
          // Electron is free at conduction band edge and drifts away to be collected!
          eY = condBandBottomY - 8;
        }

        // Hole left behind in Valence Band
        ctx.strokeStyle = '#fb7185';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(eCenterX, valenceY + 13, 6, 0, Math.PI * 2);
        ctx.stroke();

        // Promoted Electron
        const driftX = cycle >= 0.55 ? ((cycle - 0.55) / 0.45) * 28 : 0;
        ctx.fillStyle = '#38bdf8';
        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(eCenterX + driftX, eY, 6.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      } else {
        // Insufficient energy: electron wobbles tiny bit, stays locked in Valence Band!
        const reachY = valenceY + 13 - gapPx * (ev / SI_BANDGAP_EV) * 0.85;
        ctx.strokeStyle = 'rgba(248, 113, 113, 0.4)';
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(eCenterX, valenceY + 6);
        ctx.lineTo(eCenterX, reachY);
        ctx.stroke();
        ctx.setLineDash([]);

        const wobble = Math.sin(t * 10) * 2.2;
        ctx.fillStyle = '#94a3b8';
        ctx.beginPath();
        ctx.arc(eCenterX + wobble, valenceY + 13, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    true
  );
}
