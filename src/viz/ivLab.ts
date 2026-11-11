import { solveSiliconIvCurve } from '../physics/solarPhysics';
import { drawRoundedRect, setupResponsiveCanvas } from './canvasUtils';

export function initIvLab(): void {
  const mount = document.getElementById('iv-lab-mount');
  if (!mount) return;

  let irradiance = 1000; // W/m^2
  let tempC = 25; // °C
  let seriesCells = 1; // 1 cell or 60-cell panel
  let autoMppt = true;
  let manualVoltageRatio = 0.83; // fraction of Voc when not in autoMppt

  mount.innerHTML = `
    <div class="ctrl-bar">
      <div class="ctrl-group">
        <div class="ctrl-label-row">
          <span>Operating Voltage / Load</span>
          <span class="ctrl-val" id="iv-v-label">Auto-MPPT (0.58 V)</span>
        </div>
        <input type="range" id="iv-v-slider" min="0" max="1" step="0.005" value="0.83" aria-label="Operating voltage point from short circuit to open circuit" />
      </div>

      <div class="ctrl-group">
        <div class="ctrl-label-row">
          <span>Sunlight Intensity</span>
          <span class="ctrl-val" id="iv-irr-label">1,000 W/m&sup2;</span>
        </div>
        <input type="range" id="iv-irr-slider" min="100" max="1100" step="25" value="1000" aria-label="Sunlight irradiance in watts per square meter" />
      </div>

      <div class="ctrl-group">
        <div class="ctrl-label-row">
          <span>Cell Temperature</span>
          <span class="ctrl-val" id="iv-temp-label">25 &deg;C</span>
        </div>
        <input type="range" id="iv-temp-slider" min="0" max="70" step="1" value="25" aria-label="Silicon cell temperature in degrees Celsius" />
      </div>

      <div class="btn-group">
        <button type="button" class="stage-btn active-green" id="iv-mppt-btn">Auto-MPPT: ON</button>
        <button type="button" class="stage-btn" id="iv-scale-btn">Scale: 1 Cell</button>
      </div>
    </div>

    <div class="dual-chart-grid">
      <div class="chart-card">
        <div class="chart-card-title">
          <span>Live Closed-Loop Electron Pump</span>
          <span id="iv-loop-tag" style="font-family:var(--font-mono);font-size:0.74rem;color:#34d399;">Delivering 5.7 W</span>
        </div>
        <div class="chart-canvas-wrap">
          <canvas id="iv-circuit-canvas"></canvas>
        </div>
      </div>

      <div class="chart-card">
        <div class="chart-card-title">
          <span>Current (I–V) &amp; Power (P–V) Curves</span>
          <span style="font-size:0.72rem;color:#94a3b8;">Dashed = 25&deg;C, 1,000 W/m&sup2; ref</span>
        </div>
        <div class="chart-canvas-wrap">
          <canvas id="iv-curve-canvas" style="cursor:pointer;"></canvas>
        </div>
      </div>
    </div>

    <div class="metrics-row">
      <div class="metric-tile">
        <span class="m-label">Operating Point (V &times; I)</span>
        <span class="m-value" id="iv-m-op" style="color:#f8fafc;">0.58 V &middot; 9.9 A</span>
        <span class="m-sub" id="iv-m-rload">Load R = 0.058 &Omega;</span>
      </div>
      <div class="metric-tile">
        <span class="m-label">Output Electrical Power</span>
        <span class="m-value" id="iv-m-power" style="color:#34d399;">5.76 W</span>
        <span class="m-sub" id="iv-m-peak">Peak MPP: 5.76 W</span>
      </div>
      <div class="metric-tile">
        <span class="m-label">Short-Circuit / Open-Circuit</span>
        <span class="m-value" id="iv-m-bounds" style="color:#7dd3fc;">10.6 A / 0.69 V</span>
        <span class="m-sub" id="iv-m-ff">Fill Factor: 78.6%</span>
      </div>
      <div class="metric-tile">
        <span class="m-label">Conversion Efficiency</span>
        <span class="m-value" id="iv-m-eff" style="color:#fbbf24;">21.2%</span>
        <span class="m-sub" id="iv-m-tempnote">25 &deg;C lab standard</span>
      </div>
    </div>
  `;

  const vSlider = mount.querySelector('#iv-v-slider') as HTMLInputElement;
  const irrSlider = mount.querySelector('#iv-irr-slider') as HTMLInputElement;
  const tempSlider = mount.querySelector('#iv-temp-slider') as HTMLInputElement;
  const mpptBtn = mount.querySelector('#iv-mppt-btn') as HTMLButtonElement;
  const scaleBtn = mount.querySelector('#iv-scale-btn') as HTMLButtonElement;

  const vLabel = mount.querySelector('#iv-v-label') as HTMLElement;
  const irrLabel = mount.querySelector('#iv-irr-label') as HTMLElement;
  const tempLabel = mount.querySelector('#iv-temp-label') as HTMLElement;
  const loopTag = mount.querySelector('#iv-loop-tag') as HTMLElement;

  const mOp = mount.querySelector('#iv-m-op') as HTMLElement;
  const mRload = mount.querySelector('#iv-m-rload') as HTMLElement;
  const mPower = mount.querySelector('#iv-m-power') as HTMLElement;
  const mPeak = mount.querySelector('#iv-m-peak') as HTMLElement;
  const mBounds = mount.querySelector('#iv-m-bounds') as HTMLElement;
  const mFf = mount.querySelector('#iv-m-ff') as HTMLElement;
  const mEff = mount.querySelector('#iv-m-eff') as HTMLElement;
  const mTempNote = mount.querySelector('#iv-m-tempnote') as HTMLElement;

  const circuitCanvas = mount.querySelector('#iv-circuit-canvas') as HTMLCanvasElement;
  const curveCanvas = mount.querySelector('#iv-curve-canvas') as HTMLCanvasElement;

  let currentCurve = solveSiliconIvCurve(irradiance, tempC, seriesCells);
  let refCurve = solveSiliconIvCurve(1000, 25, seriesCells);
  let opV = currentCurve.vmp;
  let opI = currentCurve.imp;
  let opP = currentCurve.pmax;

  const curveHandle = setupResponsiveCanvas(
    curveCanvas,
    (w) => (w < 500 ? 255 : 280),
    (ctx, w, h) => drawIvCurveChart(ctx, w, h, currentCurve, refCurve, opV, opI, opP),
    false
  );

  const recompute = () => {
    currentCurve = solveSiliconIvCurve(irradiance, tempC, seriesCells);
    refCurve = solveSiliconIvCurve(1000, 25, seriesCells);

    if (autoMppt && currentCurve.voc > 0) {
      opV = currentCurve.vmp;
      opI = currentCurve.imp;
      opP = currentCurve.pmax;
      manualVoltageRatio = opV / currentCurve.voc;
      vSlider.value = manualVoltageRatio.toFixed(3);
    } else {
      const idx = Math.min(
        currentCurve.points.length - 1,
        Math.max(0, Math.round(manualVoltageRatio * (currentCurve.points.length - 1)))
      );
      const pt = currentCurve.points[idx];
      opV = pt.v;
      opI = pt.i;
      opP = pt.p;
    }

    const vFmt = seriesCells === 1 ? opV.toFixed(2) : opV.toFixed(1);
    const vocFmt = seriesCells === 1 ? currentCurve.voc.toFixed(2) : currentCurve.voc.toFixed(1);
    const pFmt = opP >= 100 ? opP.toFixed(0) : opP.toFixed(2);
    const pMaxFmt = currentCurve.pmax >= 100 ? currentCurve.pmax.toFixed(0) : currentCurve.pmax.toFixed(2);

    vLabel.textContent = autoMppt ? `Auto-MPPT (${vFmt} V)` : `${vFmt} V`;
    irrLabel.innerHTML = `${irradiance.toLocaleString()} W/m&sup2;`;
    tempLabel.innerHTML = `${tempC} &deg;C`;
    loopTag.textContent = `Delivering ${pFmt} W`;

    mpptBtn.textContent = autoMppt ? 'Auto-MPPT: ON' : 'Auto-MPPT: OFF';
    mpptBtn.classList.toggle('active-green', autoMppt);
    scaleBtn.textContent = seriesCells === 1 ? 'Scale: 1 Cell' : 'Scale: 60-Cell Panel';
    scaleBtn.classList.toggle('active', seriesCells === 60);

    mOp.textContent = `${vFmt} V · ${opI.toFixed(2)} A`;
    if (opI < 0.02) {
      mRload.textContent = 'Load R = ∞ Ω (Open Circuit)';
    } else if (opV < 0.005) {
      mRload.textContent = 'Load R = 0.00 Ω (Short Circuit)';
    } else {
      const r = opV / opI;
      mRload.textContent = `Load R = ${r < 1 ? r.toFixed(3) : r.toFixed(2)} Ω`;
    }

    mPower.textContent = `${pFmt} W`;
    mPeak.textContent = `Peak MPP: ${pMaxFmt} W`;
    mBounds.textContent = `${currentCurve.isc.toFixed(1)} A / ${vocFmt} V`;
    mFf.textContent = `Fill Factor: ${(currentCurve.fillFactor * 100).toFixed(1)}%`;

    const opEff =
      currentCurve.pmax > 0
        ? currentCurve.efficiencyPct * (opP / currentCurve.pmax)
        : 0;
    mEff.textContent = `${opEff.toFixed(1)}%`;
    mTempNote.textContent =
      tempC > 35
        ? `Heat drops Voc by ${((25 - tempC) * 0.33).toFixed(1)}%`
        : tempC < 15
          ? `Cold boosts Voc by +${((25 - tempC) * 0.33).toFixed(1)}%`
          : '25 °C standard test temp';

    curveHandle.requestRedraw();
  };

  vSlider.addEventListener('input', () => {
    autoMppt = false;
    manualVoltageRatio = Number(vSlider.value);
    recompute();
  });

  irrSlider.addEventListener('input', () => {
    irradiance = Number(irrSlider.value);
    recompute();
  });

  tempSlider.addEventListener('input', () => {
    tempC = Number(tempSlider.value);
    recompute();
  });

  mpptBtn.addEventListener('click', () => {
    autoMppt = !autoMppt;
    recompute();
  });

  scaleBtn.addEventListener('click', () => {
    seriesCells = seriesCells === 1 ? 60 : 1;
    recompute();
  });

  // Allow dragging directly along the I-V chart
  let draggingIv = false;
  const pickIvVoltage = (clientX: number) => {
    const rect = curveCanvas.getBoundingClientRect();
    const padL = 40;
    const padR = 42;
    const plotW = rect.width - padL - padR;
    const maxAxisV = seriesCells === 1 ? 0.8 : 48;
    const vClicked = Math.max(0, Math.min(currentCurve.voc, ((clientX - rect.left - padL) / plotW) * maxAxisV));
    if (currentCurve.voc > 0) {
      autoMppt = false;
      manualVoltageRatio = Math.max(0, Math.min(1, vClicked / currentCurve.voc));
      vSlider.value = manualVoltageRatio.toFixed(3);
      recompute();
    }
  };

  curveCanvas.addEventListener('pointerdown', (e) => {
    draggingIv = true;
    pickIvVoltage(e.clientX);
  });
  window.addEventListener('pointermove', (e) => {
    if (draggingIv) pickIvVoltage(e.clientX);
  });
  window.addEventListener('pointerup', () => {
    draggingIv = false;
  });

  recompute();

  // Animated Live Circuit Loop Canvas
  let wirePhase = 0;
  let lastT = 0;
  setupResponsiveCanvas(
    circuitCanvas,
    (w) => (w < 500 ? 255 : 280),
    (ctx, w, h, t) => {
      const dt = Math.min(0.05, lastT === 0 ? 0.016 : t - lastT);
      lastT = t;

      const normCurr = Math.min(1.2, opI / 10.65);
      const normLeak = Math.max(0, Math.min(1.2, (currentCurve.isc - opI) / 10.65));
      const normPower = currentCurve.pmax > 0 ? opP / (seriesCells === 1 ? 5.8 : 348) : 0;

      wirePhase = (wirePhase + dt * normCurr * 0.62) % 1;

      const cellX = 36;
      const cellY = h * 0.25;
      const cellW = w * 0.34;
      const cellH = h * 0.52;
      const loadX = w - 62;
      const loadY = h * 0.51;

      // Incoming Sunlight Arrows at top-left
      const sunAlpha = 0.2 + 0.75 * (irradiance / 1100);
      ctx.strokeStyle = `rgba(251, 191, 36, ${sunAlpha})`;
      ctx.lineWidth = 2;
      for (let r = 0; r < 4; r++) {
        const rx = cellX + 16 + (r / 3) * (cellW - 32);
        const drop = ((t * 1.3 + r * 0.25) % 1) * 20;
        ctx.beginPath();
        ctx.moveTo(rx - 8, 12 + drop * 0.4);
        ctx.lineTo(rx, cellY - 6);
        ctx.stroke();
      }

      // Draw Cell (or 60-cell array icon)
      drawRoundedRect(ctx, cellX, cellY, cellW, cellH, 9);
      ctx.fillStyle = '#142544';
      ctx.fill();
      ctx.strokeStyle = tempC > 45 ? '#fb923c' : '#6366f1';
      ctx.lineWidth = 1.8;
      ctx.stroke();

      // N-top & P-bottom inside cell
      ctx.fillStyle = 'rgba(56, 189, 248, 0.24)';
      ctx.fillRect(cellX + 2, cellY + 2, cellW - 4, cellH * 0.34);
      ctx.fillStyle = 'rgba(52, 211, 153, 0.24)';
      ctx.fillRect(cellX + 2, cellY + cellH * 0.36, cellW - 4, cellH * 0.14);
      ctx.fillStyle = 'rgba(251, 113, 133, 0.16)';
      ctx.fillRect(cellX + 2, cellY + cellH * 0.5, cellW - 4, cellH * 0.48);

      ctx.font = '700 10.5px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#bae6fd';
      const topCellLabel =
        seriesCells === 1
          ? 'N-Emitter (−)'
          : cellW < 132
            ? '60× Series (−)'
            : '60 Cells in Series (−)';
      ctx.fillText(topCellLabel, cellX + cellW / 2, cellY + 18);
      ctx.fillStyle = '#fecdd3';
      ctx.fillText('P-Base (+)', cellX + cellW / 2, cellY + cellH - 9);

      // Internal diode forward leakage indicator when near Voc!
      if (normLeak > 0.06) {
        ctx.strokeStyle = `rgba(251, 146, 60, ${Math.min(0.95, normLeak)})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 3]);
        const lx = cellX + cellW * 0.72;
        ctx.beginPath();
        ctx.moveTo(lx, cellY + 24);
        ctx.lineTo(lx, cellY + cellH - 22);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = '#fdba74';
        ctx.font = '600 9.5px -apple-system, sans-serif';
        ctx.fillText('Internal leak', cellX + cellW * 0.5, cellY + cellH * 0.47);
      }

      // External Wire Loop
      const topWireY = cellY - 16;
      const botWireY = cellY + cellH + 18;
      const tapX = cellX + cellW * 0.5;
      const isOpen = manualVoltageRatio > 0.992 && !autoMppt;

      ctx.strokeStyle = 'rgba(148, 163, 184, 0.6)';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(tapX, cellY);
      ctx.lineTo(tapX, topWireY);
      if (isOpen) {
        ctx.lineTo(loadX - 36, topWireY);
        ctx.lineTo(loadX - 20, topWireY - 10); // open switch!
        ctx.moveTo(loadX - 14, topWireY);
      }
      ctx.lineTo(loadX, topWireY);
      ctx.lineTo(loadX, loadY - 24);

      ctx.moveTo(loadX, loadY + 24);
      ctx.lineTo(loadX, botWireY);
      ctx.lineTo(tapX, botWireY);
      ctx.lineTo(tapX, cellY + cellH);
      ctx.stroke();

      // Electrons circulating along external wire
      const pts: [number, number][] = [
        [tapX, cellY],
        [tapX, topWireY],
        [loadX, topWireY],
        [loadX, loadY - 24],
        [loadX, loadY + 24],
        [loadX, botWireY],
        [tapX, botWireY],
        [tapX, cellY + cellH],
      ];
      let totalL = 0;
      const lens: number[] = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
        lens.push(l);
        totalL += l;
      }

      if (!isOpen && opI > 0.05) {
        const nDots = 11;
        for (let k = 0; k < nDots; k++) {
          let d = (((k / nDots + wirePhase) % 1) * totalL);
          for (let s = 0; s < lens.length; s++) {
            if (d <= lens[s] || s === lens.length - 1) {
              const u = lens[s] > 0 ? d / lens[s] : 0;
              const x = pts[s][0] + (pts[s + 1][0] - pts[s][0]) * u;
              const y = pts[s][1] + (pts[s + 1][1] - pts[s][1]) * u;
              ctx.fillStyle = '#38bdf8';
              ctx.beginPath();
              ctx.arc(x, y, 3.6, 0, Math.PI * 2);
              ctx.fill();
              break;
            }
            d -= lens[s];
          }
        }
      }

      // Connected Load Lamp / Appliance with brightness proportional to Power P!
      if (normPower > 0.02) {
        const gR = 16 + normPower * 36;
        const glow = ctx.createRadialGradient(loadX, loadY, 4, loadX, loadY, gR);
        glow.addColorStop(0, `rgba(52, 211, 153, ${Math.min(0.95, 0.25 + normPower * 0.75)})`);
        glow.addColorStop(1, 'rgba(16, 185, 129, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(loadX, loadY, gR, 0, Math.PI * 2);
        ctx.fill();
      }

      drawRoundedRect(ctx, loadX - 22, loadY - 22, 44, 44, 11);
      ctx.fillStyle = normPower > 0.05 ? '#064e3b' : '#1e293b';
      ctx.fill();
      ctx.strokeStyle = normPower > 0.05 ? '#34d399' : '#64748b';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = normPower > 0.05 ? '#d1fae5' : '#94a3b8';
      ctx.font = '700 10px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('LOAD', loadX, loadY - 2);
      ctx.fillText(
        `${opP >= 100 ? opP.toFixed(0) : opP.toFixed(1)}W`,
        loadX,
        loadY + 12
      );
    },
    true
  );
}

function drawIvCurveChart(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  curve: ReturnType<typeof solveSiliconIvCurve>,
  refCurve: ReturnType<typeof solveSiliconIvCurve>,
  opV: number,
  opI: number,
  opP: number
): void {
  const padL = 40;
  const padR = 42;
  const padT = 18;
  const padB = 32;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const isModule = curve.cellCount === 60;
  const maxV = isModule ? 48 : 0.8;
  const maxI = 12.5;
  const maxP = isModule ? 420 : 7.0;

  const xOf = (v: number) => padL + (v / maxV) * plotW;
  const yOfI = (curr: number) => padT + plotH - (curr / maxI) * plotH;
  const yOfP = (pwr: number) => padT + plotH - (pwr / maxP) * plotH;

  // Grid lines
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.13)';
  ctx.lineWidth = 1;
  ctx.font = '10px ui-monospace, monospace';
  for (let k = 0; k <= 4; k++) {
    const frac = k / 4;
    const y = padT + plotH - frac * plotH;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(w - padR, y);
    ctx.stroke();

    ctx.fillStyle = '#7dd3fc';
    ctx.textAlign = 'right';
    ctx.fillText(`${(frac * maxI).toFixed(0)}A`, padL - 5, y + 3);

    ctx.fillStyle = '#6ee7b7';
    ctx.textAlign = 'left';
    ctx.fillText(`${(frac * maxP).toFixed(isModule ? 0 : 1)}W`, w - padR + 5, y + 3);
  }

  // Shaded Operating Power Rectangle (V * I)
  const rectW = xOf(opV) - padL;
  const rectH = yOfI(0) - yOfI(opI);
  if (rectW > 1 && rectH > 1) {
    ctx.fillStyle = 'rgba(16, 185, 129, 0.17)';
    ctx.fillRect(padL, yOfI(opI), rectW, rectH);
    ctx.strokeStyle = 'rgba(52, 211, 153, 0.45)';
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(padL, yOfI(opI), rectW, rectH);
    ctx.setLineDash([]);
  }

  // Ghost Reference I-V Curve (25 °C, 1000 W/m^2)
  ctx.beginPath();
  refCurve.points.forEach((pt, idx) => {
    const x = xOf(pt.v);
    const y = yOfI(pt.i);
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.34)';
  ctx.lineWidth = 1.4;
  ctx.setLineDash([4, 4]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Power Curve P(V) (Emerald)
  ctx.beginPath();
  curve.points.forEach((pt, idx) => {
    const x = xOf(pt.v);
    const y = yOfP(pt.p);
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = '#10b981';
  ctx.lineWidth = 2.2;
  ctx.stroke();

  // Current Curve I(V) (Electric Cyan)
  ctx.beginPath();
  curve.points.forEach((pt, idx) => {
    const x = xOf(pt.v);
    const y = yOfI(pt.i);
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2.6;
  ctx.stroke();

  // MPP Star / Marker on Power Curve
  const mppX = xOf(curve.vmp);
  const mppPy = yOfP(curve.pmax);
  ctx.fillStyle = 'rgba(52, 211, 153, 0.4)';
  ctx.beginPath();
  ctx.arc(mppX, mppPy, 7, 0, Math.PI * 2);
  ctx.fill();

  // Operating Point Dots on I-V and P-V
  const ox = xOf(opV);
  const oiy = yOfI(opI);
  const opy = yOfP(opP);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(ox, padT);
  ctx.lineTo(ox, padT + plotH);
  ctx.stroke();

  ctx.fillStyle = '#38bdf8';
  ctx.beginPath();
  ctx.arc(ox, oiy, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = '#34d399';
  ctx.beginPath();
  ctx.arc(ox, opy, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2;
  ctx.stroke();

  // X-axis ticks
  ctx.fillStyle = '#94a3b8';
  ctx.font = '10px ui-monospace, monospace';
  ctx.textAlign = 'center';
  const vTicks = isModule ? [0, 12, 24, 36, 48] : [0, 0.2, 0.4, 0.6, 0.8];
  for (const vt of vTicks) {
    ctx.fillText(isModule ? `${vt}V` : `${vt.toFixed(1)}V`, xOf(vt), h - 14);
  }
  ctx.fillStyle = '#64748b';
  ctx.fillText('Voltage (V) — Drag along curve to vary load', padL + plotW / 2, h - 2);
}
