import {
  AM15G_SPECTRUM,
  SQ_CURVE_CACHE,
  evaluateShockleyQueisser,
} from '../physics/solarPhysics';
import { drawRoundedRect, setupResponsiveCanvas } from './canvasUtils';

interface MaterialPreset {
  name: string;
  eg: number;
  note: string;
}

const MATERIALS: MaterialPreset[] = [
  { name: 'Germanium (0.67 eV)', eg: 0.67, note: 'Catches infrared, low voltage' },
  { name: 'Silicon (1.12 eV)', eg: 1.12, note: 'Earth-abundant sweet spot (~32.9% max)' },
  { name: 'GaAs (1.42 eV)', eg: 1.42, note: 'Spacecraft cells (~33.5% max)' },
  { name: 'Perovskite (1.55 eV)', eg: 1.55, note: 'Tunable thin-film crystal' },
  { name: 'GaP (2.26 eV)', eg: 2.26, note: 'High voltage, misses red & IR' },
];

export function initSpectrumChart(): void {
  const mount = document.getElementById('spectrum-chart-mount');
  if (!mount) return;

  let bandgapEv = 1.12;
  let hoverWlNm: number | null = null;

  mount.innerHTML = `
    <div class="ctrl-bar">
      <div class="ctrl-group">
        <div class="ctrl-label-row">
          <span>Semiconductor Bandgap Threshold (<span style="font-family:var(--font-mono)">E<sub>g</sub></span>)</span>
          <span class="ctrl-val" id="sq-eg-label">1.12 eV &middot; Cutoff 1,107 nm</span>
        </div>
        <input type="range" id="sq-eg-slider" min="0.45" max="3.00" step="0.01" value="1.12" aria-label="Semiconductor bandgap in electron volts" />
      </div>
      <div class="btn-group" id="sq-mat-btns" role="group" aria-label="Semiconductor material presets">
        ${MATERIALS.map(
          (m) =>
            `<button type="button" class="stage-btn ${Math.abs(m.eg - 1.12) < 0.01 ? 'active' : ''}" data-eg="${m.eg}">${m.name}</button>`
        ).join('')}
      </div>
    </div>

    <div class="dual-chart-grid">
      <div class="chart-card">
        <div class="chart-card-title">
          <span>AM1.5G Terrestrial Solar Spectrum (1,000 W/m&sup2;)</span>
          <span id="sq-hover-readout" style="font-family:var(--font-mono);font-size:0.73rem;color:#94a3b8;">Hover/touch spectrum to inspect</span>
        </div>
        <div class="chart-canvas-wrap">
          <canvas id="am15-canvas" style="cursor:crosshair;"></canvas>
        </div>
      </div>

      <div class="chart-card">
        <div class="chart-card-title">
          <span>Shockley–Queisser Single-Junction Limit</span>
          <span id="sq-peak-readout" style="font-family:var(--font-mono);font-size:0.75rem;color:#34d399;">Ceiling: 32.9%</span>
        </div>
        <div class="chart-canvas-wrap">
          <canvas id="sq-limit-canvas" style="cursor:pointer;"></canvas>
        </div>
      </div>
    </div>

    <!-- Live 100% stacked breakdown bar -->
    <div style="margin-top:0.9rem;background:var(--stage-panel);border:1px solid var(--stage-border);border-radius:12px;padding:0.8rem 0.95rem;">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.4rem;font-size:0.78rem;margin-bottom:0.45rem;">
        <strong style="color:#f8fafc;">Fate of 100% Incoming Sunlight at <span id="sq-bar-eg">1.12 eV</span>:</strong>
        <span style="color:#94a3b8;font-size:0.74rem;">Theoretical single-junction radiative breakdown</span>
      </div>
      <div id="sq-stack-bar" style="display:flex;height:14px;border-radius:999px;overflow:hidden;background:#090f1d;">
        <div id="bar-elec" style="background:#10b981;transition:width 80ms linear;" title="Max Deliverable Electricity"></div>
        <div id="bar-thermo" style="background:#38bdf8;opacity:0.55;transition:width 80ms linear;" title="Voltage / Entropy & Recombination Margin"></div>
        <div id="bar-heat" style="background:#fb923c;transition:width 80ms linear;" title="Excess Photon Energy Shed as Heat"></div>
        <div id="bar-trans" style="background:#475569;transition:width 80ms linear;" title="Unabsorbed Infrared (Passes Through)"></div>
      </div>
      <div class="metrics-row" style="margin-top:0.7rem;">
        <div class="metric-tile">
          <span class="m-label"><i class="dot" style="background:#10b981;margin-right:4px;"></i>Max Electricity</span>
          <span class="m-value" id="sq-m-elec" style="color:#34d399;">32.9%</span>
          <span class="m-sub" id="sq-m-vj">V<sub>oc</sub> 0.88 V &middot; J<sub>sc</sub> 43.8 mA/cm&sup2;</span>
        </div>
        <div class="metric-tile">
          <span class="m-label"><i class="dot" style="background:#fb923c;margin-right:4px;"></i>Excess Heat (E &gt; E<sub>g</sub>)</span>
          <span class="m-value" id="sq-m-heat" style="color:#fb923c;">32.7%</span>
          <span class="m-sub">Blue/green surplus shakes crystal</span>
        </div>
        <div class="metric-tile">
          <span class="m-label"><i class="dot" style="background:#475569;margin-right:4px;"></i>Passes Through (E &lt; E<sub>g</sub>)</span>
          <span class="m-value" id="sq-m-trans" style="color:#cbd5e1;">19.1%</span>
          <span class="m-sub">Photons weaker than bandgap</span>
        </div>
        <div class="metric-tile">
          <span class="m-label"><i class="dot" style="background:#38bdf8;opacity:0.75;margin-right:4px;"></i>Thermodynamic Margin</span>
          <span class="m-value" id="sq-m-thermo" style="color:#7dd3fc;">15.3%</span>
          <span class="m-sub">Entropy &amp; radiative balance</span>
        </div>
      </div>
    </div>
  `;

  const slider = mount.querySelector('#sq-eg-slider') as HTMLInputElement;
  const egLabel = mount.querySelector('#sq-eg-label') as HTMLElement;
  const hoverReadout = mount.querySelector('#sq-hover-readout') as HTMLElement;
  const peakReadout = mount.querySelector('#sq-peak-readout') as HTMLElement;
  const barEg = mount.querySelector('#sq-bar-eg') as HTMLElement;
  const barElec = mount.querySelector('#bar-elec') as HTMLElement;
  const barThermo = mount.querySelector('#bar-thermo') as HTMLElement;
  const barHeat = mount.querySelector('#bar-heat') as HTMLElement;
  const barTrans = mount.querySelector('#bar-trans') as HTMLElement;

  const mElec = mount.querySelector('#sq-m-elec') as HTMLElement;
  const mVj = mount.querySelector('#sq-m-vj') as HTMLElement;
  const mHeat = mount.querySelector('#sq-m-heat') as HTMLElement;
  const mTrans = mount.querySelector('#sq-m-trans') as HTMLElement;
  const mThermo = mount.querySelector('#sq-m-thermo') as HTMLElement;
  const matBtns = Array.from(mount.querySelectorAll('#sq-mat-btns button')) as HTMLButtonElement[];

  const am15Canvas = mount.querySelector('#am15-canvas') as HTMLCanvasElement;
  const sqCanvas = mount.querySelector('#sq-limit-canvas') as HTMLCanvasElement;

  const am15Handle = setupResponsiveCanvas(
    am15Canvas,
    (w) => (w < 500 ? 250 : 275),
    (ctx, w, h) => drawAm15Spectrum(ctx, w, h, bandgapEv, hoverWlNm),
    false
  );

  const sqHandle = setupResponsiveCanvas(
    sqCanvas,
    (w) => (w < 500 ? 250 : 275),
    (ctx, w, h) => drawSqLimitCurve(ctx, w, h, bandgapEv),
    false
  );

  const updateAll = () => {
    const bd = evaluateShockleyQueisser(bandgapEv);
    egLabel.textContent = `${bandgapEv.toFixed(2)} eV · Cutoff ${Math.round(bd.cutoffNm)} nm`;
    peakReadout.textContent = `Ceiling: ${bd.efficiencyPct.toFixed(1)}%`;
    barEg.textContent = `${bandgapEv.toFixed(2)} eV`;

    barElec.style.width = `${bd.efficiencyPct.toFixed(1)}%`;
    barThermo.style.width = `${bd.thermodynamicLossPct.toFixed(1)}%`;
    barHeat.style.width = `${bd.thermalizationLossPct.toFixed(1)}%`;
    barTrans.style.width = `${bd.transparentLossPct.toFixed(1)}%`;

    mElec.textContent = `${bd.efficiencyPct.toFixed(1)}%`;
    mVj.innerHTML = `V<sub>oc</sub> ${bd.vocVolts.toFixed(2)} V &middot; J<sub>sc</sub> ${bd.jscMaCm2.toFixed(1)} mA/cm&sup2;`;
    mHeat.textContent = `${bd.thermalizationLossPct.toFixed(1)}%`;
    mTrans.textContent = `${bd.transparentLossPct.toFixed(1)}%`;
    mThermo.textContent = `${bd.thermodynamicLossPct.toFixed(1)}%`;

    for (const btn of matBtns) {
      const eg = Number(btn.dataset.eg);
      btn.classList.toggle('active', Math.abs(eg - bandgapEv) < 0.02);
    }

    am15Handle.requestRedraw();
    sqHandle.requestRedraw();
  };

  slider.addEventListener('input', () => {
    bandgapEv = Number(slider.value);
    updateAll();
  });

  for (const btn of matBtns) {
    btn.addEventListener('click', () => {
      bandgapEv = Number(btn.dataset.eg);
      slider.value = bandgapEv.toFixed(2);
      updateAll();
    });
  }

  // Hover / touch inspection on AM1.5G chart
  const handleAm15Pointer = (clientX: number) => {
    const rect = am15Canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const padL = 42;
    const padR = 14;
    const plotW = rect.width - padL - padR;
    if (x < padL || x > rect.width - padR) {
      hoverWlNm = null;
      hoverReadout.textContent = 'Hover/touch spectrum to inspect';
      am15Handle.requestRedraw();
      return;
    }
    const wl = 280 + ((x - padL) / plotW) * (2500 - 280);
    hoverWlNm = Math.max(280, Math.min(2500, Math.round(wl / 5) * 5));
    const bin = AM15G_SPECTRUM.find((b) => Math.abs(b.wavelengthNm - hoverWlNm!) <= 2.5);
    if (bin) {
      hoverReadout.textContent = `λ=${bin.wavelengthNm}nm (${bin.energyEv.toFixed(2)}eV) · ${bin.irradiance.toFixed(2)} W/m²/nm`;
    }
    am15Handle.requestRedraw();
  };

  am15Canvas.addEventListener('pointermove', (e) => handleAm15Pointer(e.clientX));
  am15Canvas.addEventListener('pointerleave', () => {
    hoverWlNm = null;
    hoverReadout.textContent = 'Hover/touch spectrum to inspect';
    am15Handle.requestRedraw();
  });

  // Click/drag on SQ chart directly sets bandgap!
  let draggingSq = false;
  const setFromSqPointer = (clientX: number) => {
    const rect = sqCanvas.getBoundingClientRect();
    const padL = 38;
    const padR = 14;
    const plotW = rect.width - padL - padR;
    const u = Math.max(0, Math.min(1, (clientX - rect.left - padL) / plotW));
    bandgapEv = Number((0.45 + u * (3.0 - 0.45)).toFixed(2));
    slider.value = bandgapEv.toFixed(2);
    updateAll();
  };

  sqCanvas.addEventListener('pointerdown', (e) => {
    draggingSq = true;
    setFromSqPointer(e.clientX);
  });
  window.addEventListener('pointermove', (e) => {
    if (draggingSq) setFromSqPointer(e.clientX);
  });
  window.addEventListener('pointerup', () => {
    draggingSq = false;
  });

  updateAll();
}

function drawAm15Spectrum(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  bandgapEv: number,
  hoverWlNm: number | null
): void {
  const padL = 42;
  const padR = 14;
  const padT = 18;
  const padB = 32;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const minWl = 280;
  const maxWl = 2500;
  const maxIrr = 1.65;

  const xOf = (wl: number) => padL + ((wl - minWl) / (maxWl - minWl)) * plotW;
  const yOf = (irr: number) => padT + plotH - (irr / maxIrr) * plotH;

  // Subtle Visible Rainbow Backdrop Strip at top of plot
  const visX1 = xOf(380);
  const visX2 = xOf(740);
  const visGrad = ctx.createLinearGradient(visX1, 0, visX2, 0);
  visGrad.addColorStop(0, 'rgba(139, 92, 246, 0.22)');
  visGrad.addColorStop(0.25, 'rgba(59, 130, 246, 0.22)');
  visGrad.addColorStop(0.5, 'rgba(34, 197, 94, 0.22)');
  visGrad.addColorStop(0.75, 'rgba(234, 179, 8, 0.22)');
  visGrad.addColorStop(1, 'rgba(239, 68, 68, 0.22)');
  ctx.fillStyle = visGrad;
  ctx.fillRect(visX1, padT, visX2 - visX1, plotH);

  // Horizontal grid lines
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.13)';
  ctx.lineWidth = 1;
  ctx.font = '10px ui-monospace, monospace';
  ctx.fillStyle = '#94a3b8';
  ctx.textAlign = 'right';
  for (const tick of [0, 0.5, 1.0, 1.5]) {
    const y = yOf(tick);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(w - padR, y);
    ctx.stroke();
    ctx.fillText(tick.toFixed(1), padL - 6, y + 3);
  }

  const bd = evaluateShockleyQueisser(bandgapEv);
  const elecRetentionRatio =
    bd.usableBandgapPct > 0.01 ? bd.efficiencyPct / bd.usableBandgapPct : 0;

  // 1. Fill Total Spectrum with Thermalization Orange (for E >= Eg) and Slate Grey (for E < Eg)
  // First draw E >= Eg total absorbed area (Heat orange top layer)
  ctx.beginPath();
  let startedAbs = false;
  let lastAbsX = padL;
  for (const bin of AM15G_SPECTRUM) {
    if (bin.energyEv >= bandgapEv) {
      const x = xOf(bin.wavelengthNm);
      const y = yOf(bin.irradiance);
      if (!startedAbs) {
        ctx.moveTo(x, yOf(0));
        ctx.lineTo(x, y);
        startedAbs = true;
      } else {
        ctx.lineTo(x, y);
      }
      lastAbsX = x;
    }
  }
  if (startedAbs) {
    ctx.lineTo(lastAbsX, yOf(0));
    ctx.closePath();
    ctx.fillStyle = 'rgba(251, 146, 60, 0.72)'; // Thermalization heat
    ctx.fill();
  }

  // 2. Overlay Usable Bandgap Share (Eg / E) * Irradiance -> Thermodynamic sky-blue
  ctx.beginPath();
  startedAbs = false;
  for (const bin of AM15G_SPECTRUM) {
    if (bin.energyEv >= bandgapEv) {
      const x = xOf(bin.wavelengthNm);
      const usableIrr = bin.irradiance * (bandgapEv / bin.energyEv);
      const y = yOf(usableIrr);
      if (!startedAbs) {
        ctx.moveTo(x, yOf(0));
        ctx.lineTo(x, y);
        startedAbs = true;
      } else {
        ctx.lineTo(x, y);
      }
      lastAbsX = x;
    }
  }
  if (startedAbs) {
    ctx.lineTo(lastAbsX, yOf(0));
    ctx.closePath();
    ctx.fillStyle = 'rgba(56, 189, 248, 0.55)';
    ctx.fill();
  }

  // 3. Overlay Net Deliverable Electrical Share -> Emerald Green
  ctx.beginPath();
  startedAbs = false;
  for (const bin of AM15G_SPECTRUM) {
    if (bin.energyEv >= bandgapEv) {
      const x = xOf(bin.wavelengthNm);
      const elecIrr = bin.irradiance * (bandgapEv / bin.energyEv) * elecRetentionRatio;
      const y = yOf(elecIrr);
      if (!startedAbs) {
        ctx.moveTo(x, yOf(0));
        ctx.lineTo(x, y);
        startedAbs = true;
      } else {
        ctx.lineTo(x, y);
      }
      lastAbsX = x;
    }
  }
  if (startedAbs) {
    ctx.lineTo(lastAbsX, yOf(0));
    ctx.closePath();
    ctx.fillStyle = 'rgba(16, 185, 129, 0.88)';
    ctx.fill();
  }

  // 4. Fill Unabsorbed Transparent Sub-Bandgap Region (E < Eg)
  ctx.beginPath();
  let startedTrans = false;
  let lastTransX = padL;
  for (const bin of AM15G_SPECTRUM) {
    if (bin.energyEv < bandgapEv) {
      const x = xOf(bin.wavelengthNm);
      const y = yOf(bin.irradiance);
      if (!startedTrans) {
        ctx.moveTo(x, yOf(0));
        ctx.lineTo(x, y);
        startedTrans = true;
      } else {
        ctx.lineTo(x, y);
      }
      lastTransX = x;
    }
  }
  if (startedTrans) {
    ctx.lineTo(lastTransX, yOf(0));
    ctx.closePath();
    ctx.fillStyle = 'rgba(100, 116, 139, 0.42)';
    ctx.fill();
  }

  // 5. Crisp upper spectral outline
  ctx.beginPath();
  AM15G_SPECTRUM.forEach((bin, i) => {
    const x = xOf(bin.wavelengthNm);
    const y = yOf(bin.irradiance);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = '#f8fafc';
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // 6. Bandgap Cutoff Vertical Line
  if (bd.cutoffNm >= minWl && bd.cutoffNm <= maxWl) {
    const cx = xOf(bd.cutoffNm);
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(cx, padT);
    ctx.lineTo(cx, padT + plotH);
    ctx.stroke();
    ctx.setLineDash([]);

    const pillW = 84;
    const pillX = Math.min(w - padR - pillW, Math.max(padL + 2, cx - pillW / 2));
    drawRoundedRect(ctx, pillX, padT + 4, pillW, 18, 5);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.fill();
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#fde68a';
    ctx.font = '700 10px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`λg = ${Math.round(bd.cutoffNm)} nm`, pillX + pillW / 2, padT + 16);
  }

  // Hover crosshair
  if (hoverWlNm !== null) {
    const hx = xOf(hoverWlNm);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(hx, padT);
    ctx.lineTo(hx, padT + plotH);
    ctx.stroke();
  }

  // X-axis ticks & labels
  ctx.fillStyle = '#94a3b8';
  ctx.font = '10px ui-monospace, monospace';
  ctx.textAlign = 'center';
  for (const wlTick of [400, 800, 1200, 1600, 2000, 2400]) {
    const x = xOf(wlTick);
    ctx.fillText(`${wlTick}`, x, h - 14);
  }
  ctx.fillStyle = '#64748b';
  ctx.fillText('Wavelength (nm) — UV · Visible · Near-Infrared', padL + plotW / 2, h - 2);

  // Y-axis title rotated
  ctx.save();
  ctx.translate(12, padT + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = '#64748b';
  ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('W / (m²·nm)', 0, 0);
  ctx.restore();

  // Subtle annotation for H2O atmospheric dips
  if (w > 420) {
    ctx.fillStyle = 'rgba(148, 163, 184, 0.72)';
    ctx.font = '9.5px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Visible', (visX1 + visX2) / 2, padT + 12);
    ctx.fillText('H₂O dips', xOf(1385), yOf(0.55));
  }
}

function drawSqLimitCurve(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  selectedEg: number
): void {
  const padL = 38;
  const padR = 14;
  const padT = 18;
  const padB = 32;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const minEg = 0.45;
  const maxEg = 3.0;
  const maxEff = 38;

  const xOf = (eg: number) => padL + ((eg - minEg) / (maxEg - minEg)) * plotW;
  const yOf = (eff: number) => padT + plotH - (eff / maxEff) * plotH;

  // Grid
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.13)';
  ctx.lineWidth = 1;
  ctx.font = '10px ui-monospace, monospace';
  ctx.fillStyle = '#94a3b8';
  ctx.textAlign = 'right';
  for (const tick of [0, 10, 20, 30]) {
    const y = yOf(tick);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(w - padR, y);
    ctx.stroke();
    ctx.fillText(`${tick}%`, padL - 5, y + 3);
  }

  // Area fill under SQ curve
  ctx.beginPath();
  let first = true;
  let lastX = padL;
  for (const pt of SQ_CURVE_CACHE) {
    if (pt.bandgapEv < minEg || pt.bandgapEv > maxEg) continue;
    const x = xOf(pt.bandgapEv);
    const y = yOf(pt.efficiencyPct);
    if (first) {
      ctx.moveTo(x, yOf(0));
      ctx.lineTo(x, y);
      first = false;
    } else {
      ctx.lineTo(x, y);
    }
    lastX = x;
  }
  ctx.lineTo(lastX, yOf(0));
  ctx.closePath();
  const sqGrad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
  sqGrad.addColorStop(0, 'rgba(16, 185, 129, 0.36)');
  sqGrad.addColorStop(1, 'rgba(16, 185, 129, 0.02)');
  ctx.fillStyle = sqGrad;
  ctx.fill();

  // SQ Curve stroke
  ctx.beginPath();
  first = true;
  for (const pt of SQ_CURVE_CACHE) {
    if (pt.bandgapEv < minEg || pt.bandgapEv > maxEg) continue;
    const x = xOf(pt.bandgapEv);
    const y = yOf(pt.efficiencyPct);
    if (first) {
      ctx.moveTo(x, y);
      first = false;
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.strokeStyle = '#34d399';
  ctx.lineWidth = 2.4;
  ctx.stroke();

  // Reference markers for key semiconductors
  const refDots = [
    { label: 'Ge', eg: 0.67 },
    { label: 'Si (1.12)', eg: 1.12 },
    { label: 'GaAs', eg: 1.42 },
    { label: 'GaP', eg: 2.26 },
  ];
  for (const ref of refDots) {
    const bd = evaluateShockleyQueisser(ref.eg);
    const rx = xOf(ref.eg);
    const ry = yOf(bd.efficiencyPct);
    ctx.fillStyle = ref.eg === 1.12 ? '#fbbf24' : '#94a3b8';
    ctx.beginPath();
    ctx.arc(rx, ry, ref.eg === 1.12 ? 4.2 : 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = ref.eg === 1.12 ? '#fde68a' : '#cbd5e1';
    ctx.font = ref.eg === 1.12 ? '700 10px -apple-system, sans-serif' : '10px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    const dy = ref.eg === 1.12 ? -10 : -8;
    ctx.fillText(ref.label, rx, ry + dy);
  }

  // Active selected bandgap marker
  const cur = evaluateShockleyQueisser(selectedEg);
  const sx = xOf(selectedEg);
  const sy = yOf(cur.efficiencyPct);

  ctx.strokeStyle = 'rgba(251, 191, 36, 0.55)';
  ctx.lineWidth = 1.4;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(sx, yOf(0));
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = '#fbbf24';
  ctx.shadowColor = '#fbbf24';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(sx, sy, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2;
  ctx.stroke();

  // X-axis ticks
  ctx.fillStyle = '#94a3b8';
  ctx.font = '10px ui-monospace, monospace';
  ctx.textAlign = 'center';
  for (const egTick of [0.5, 1.0, 1.5, 2.0, 2.5, 3.0]) {
    ctx.fillText(egTick.toFixed(1), xOf(egTick), h - 14);
  }
  ctx.fillStyle = '#64748b';
  ctx.fillText('Bandgap Energy Eg (eV) — Click/drag curve', padL + plotW / 2, h - 2);
}
