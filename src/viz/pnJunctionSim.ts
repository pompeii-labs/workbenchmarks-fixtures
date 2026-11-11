import { drawRoundedRect, setupResponsiveCanvas } from './canvasUtils';

type CircuitMode = 'dark' | 'short' | 'mpp' | 'open';

interface CarrierPair {
  ex: number; // normalized 0..1 across wafer
  ey: number; // normalized 0..1 vertically in cross-section
  hx: number;
  hy: number;
  age: number;
  eCollected: boolean;
  hCollected: boolean;
  flash: number;
}

export function initPnJunctionSim(): void {
  const mount = document.getElementById('pn-junction-mount');
  if (!mount) return;

  let mode: CircuitMode = 'mpp';
  let suns = 1.0; // 0 to 1.5 suns

  mount.innerHTML = `
    <div class="ctrl-bar">
      <div class="btn-group" id="pn-mode-btns" role="group" aria-label="Operating state">
        <button type="button" class="stage-btn" data-mode="dark">In the Dark</button>
        <button type="button" class="stage-btn" data-mode="short">Sunlight + Short Circuit</button>
        <button type="button" class="stage-btn active-green" data-mode="mpp">Sunlight + Optimal Load (0.57 V)</button>
        <button type="button" class="stage-btn" data-mode="open">Sunlight + Open Circuit (0.68 V)</button>
      </div>
      <div class="ctrl-group" style="max-width:250px;">
        <div class="ctrl-label-row">
          <span>Sunlight Rate</span>
          <span class="ctrl-val" id="pn-sun-val">1.0 Sun</span>
        </div>
        <input type="range" id="pn-sun-slider" min="0" max="1.5" step="0.1" value="1.0" aria-label="Sunlight intensity in suns" />
      </div>
    </div>

    <div class="chart-canvas-wrap">
      <canvas id="pn-canvas" style="cursor:pointer;"></canvas>
    </div>

    <div class="metrics-row">
      <div class="metric-tile">
        <span class="m-label">Built-in Barrier Hill</span>
        <span class="m-value" id="pn-m-barrier">0.28 eV</span>
        <span class="m-sub" id="pn-m-barrier-sub">Reduced from 0.85 eV dark hill by V</span>
      </div>
      <div class="metric-tile">
        <span class="m-label">Cell Voltage Split (V)</span>
        <span class="m-value" id="pn-m-volt" style="color:#fbbf24;">0.57 V</span>
        <span class="m-sub">Quasi-Fermi split &Delta;E<sub>F</sub> / q</span>
      </div>
      <div class="metric-tile">
        <span class="m-label">Wire Current</span>
        <span class="m-value" id="pn-m-curr" style="color:#38bdf8;">High (9.9 A)</span>
        <span class="m-sub" id="pn-m-curr-sub">Swept pairs exit into external wire</span>
      </div>
      <div class="metric-tile">
        <span class="m-label">What’s Happening</span>
        <span class="m-value" id="pn-m-status" style="color:#34d399;font-size:0.88rem;">Peak Power Delivery</span>
        <span class="m-sub" id="pn-m-status-sub">Steep slide + high voltage push</span>
      </div>
    </div>
  `;

  const modeBtns = Array.from(mount.querySelectorAll('#pn-mode-btns button')) as HTMLButtonElement[];
  const sunSlider = mount.querySelector('#pn-sun-slider') as HTMLInputElement;
  const sunVal = mount.querySelector('#pn-sun-val') as HTMLElement;
  const mBarrier = mount.querySelector('#pn-m-barrier') as HTMLElement;
  const mBarrierSub = mount.querySelector('#pn-m-barrier-sub') as HTMLElement;
  const mVolt = mount.querySelector('#pn-m-volt') as HTMLElement;
  const mCurr = mount.querySelector('#pn-m-curr') as HTMLElement;
  const mCurrSub = mount.querySelector('#pn-m-curr-sub') as HTMLElement;
  const mStatus = mount.querySelector('#pn-m-status') as HTMLElement;
  const mStatusSub = mount.querySelector('#pn-m-status-sub') as HTMLElement;
  const canvas = mount.querySelector('#pn-canvas') as HTMLCanvasElement;

  const pairs: CarrierPair[] = [];
  const ripples: { x: number; y: number; age: number }[] = [];

  const getCellVoltage = (): number => {
    const effSun = mode === 'dark' ? 0 : suns;
    if (effSun <= 0.02) return 0;
    if (mode === 'short') return 0;
    if (mode === 'mpp') return 0.57 + 0.025 * Math.log(effSun);
    return 0.685 + 0.026 * Math.log(effSun);
  };

  const syncLabels = () => {
    const effSun = mode === 'dark' ? 0 : suns;
    sunVal.textContent = `${effSun.toFixed(1)} Sun`;
    const v = Math.max(0, getCellVoltage());
    const vbi = 0.86; // dark equilibrium built-in potential (V)
    const netHill = Math.max(0.14, vbi - v);

    mBarrier.textContent = `${netHill.toFixed(2)} eV`;
    mVolt.textContent = `${v.toFixed(2)} V`;

    if (mode === 'dark' || effSun <= 0.02) {
      mBarrierSub.textContent = 'Full equilibrium barrier blocks diffusion';
      mCurr.textContent = '0.0 A';
      mCurrSub.textContent = 'Dynamic equilibrium — zero net flow';
      mStatus.textContent = 'Dark Equilibrium';
      mStatus.style.color = '#94a3b8';
      mStatusSub.textContent = 'Locked P⁺ and B⁻ ions hold steady';
    } else if (mode === 'short') {
      mBarrierSub.textContent = 'Full 0.86 eV slide sweeps every pair';
      mCurr.textContent = `Max (${(10.6 * effSun).toFixed(1)} A)`;
      mCurrSub.textContent = 'Zero load resistance in external wire';
      mStatus.textContent = 'Max Current · 0 Watts';
      mStatus.style.color = '#38bdf8';
      mStatusSub.textContent = 'No voltage buildup across terminals';
    } else if (mode === 'mpp') {
      mBarrierSub.textContent = 'Slide stays steep enough to sort charges';
      mCurr.textContent = `Strong (${(9.9 * effSun).toFixed(1)} A)`;
      mCurrSub.textContent = 'Electrons do work through external load';
      mStatus.textContent = 'Sweet Spot (Max Power)';
      mStatus.style.color = '#34d399';
      mStatusSub.textContent = 'High voltage AND strong current';
    } else {
      mBarrierSub.textContent = 'Piled-up charges flatten hill to 0.18 eV';
      mCurr.textContent = '0.0 A (Wire Cut)';
      mCurrSub.textContent = 'Forward leakage cancels photo-current!';
      mStatus.textContent = 'Max Voltage · 0 Watts';
      mStatus.style.color = '#fbbf24';
      mStatusSub.textContent = 'Carriers pile up on N & P sides';
    }

    for (const btn of modeBtns) {
      const m = btn.dataset.mode as CircuitMode;
      btn.className = 'stage-btn';
      if (m === mode) {
        btn.classList.add(mode === 'mpp' ? 'active-green' : mode === 'open' ? 'active-gold' : 'active');
      }
    }
  };

  for (const btn of modeBtns) {
    btn.addEventListener('click', () => {
      mode = btn.dataset.mode as CircuitMode;
      if (mode !== 'dark' && suns < 0.2) {
        suns = 1.0;
        sunSlider.value = '1.0';
      }
      syncLabels();
    });
  }

  sunSlider.addEventListener('input', () => {
    suns = Number(sunSlider.value);
    if (suns === 0) mode = 'dark';
    else if (mode === 'dark') mode = 'mpp';
    syncLabels();
  });

  const spawnPair = (ux: number, uy: number) => {
    if (pairs.length > 38) pairs.shift();
    pairs.push({
      ex: ux,
      ey: uy,
      hx: ux,
      hy: uy,
      age: 0,
      eCollected: false,
      hCollected: false,
      flash: 1,
    });
    ripples.push({ x: ux, y: uy, age: 0 });
  };

  // Click inside top cross-section to spawn a test photon!
  canvas.addEventListener('pointerdown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const padX = 28;
    const waferW = rect.width - padX * 2;
    const ux = Math.max(0.05, Math.min(0.95, (e.clientX - rect.left - padX) / waferW));
    const uy = Math.max(0.15, Math.min(0.85, (e.clientY - rect.top - 26) / (rect.height * 0.42)));
    spawnPair(ux, uy);
  });

  syncLabels();

  let lastTime = 0;
  let spawnTimer = 0;

  setupResponsiveCanvas(
    canvas,
    (w) => (w < 600 ? 450 : 420),
    (ctx, w, h, t) => {
      const dt = Math.min(0.05, lastTime === 0 ? 0.016 : t - lastTime);
      lastTime = t;

      const effSun = mode === 'dark' ? 0 : suns;
      const cellV = Math.max(0, getCellVoltage());
      const vbi = 0.86;
      const barrierRatio = Math.max(0.2, (vbi - cellV) / vbi); // 1.0 in dark/short, ~0.22 in open circuit

      // Spatial geometry (aligned vertically between Top Wafer & Bottom Band Diagram!)
      const padX = 28;
      const plotW = w - padX * 2;
      const nEndU = 0.30; // N-region 0..0.30
      // Depletion width shrinks slightly when forward voltage V builds up!
      const halfDep = 0.055 + 0.065 * Math.sqrt(barrierRatio);
      const depStartU = nEndU - halfDep * 0.65;
      const depEndU = nEndU + halfDep * 1.15;

      const xOf = (u: number) => padX + u * plotW;

      // Auto-spawn sunlight photons
      if (effSun > 0.02) {
        spawnTimer += dt * effSun * 5.2;
        while (spawnTimer >= 1) {
          spawnTimer -= 1;
          // Beer-Lambert-like bias toward sunlit left/top N-emitter + depletion + P-bulk
          const uRand = Math.min(0.92, 0.06 + Math.pow(Math.random(), 1.35) * 0.84);
          spawnPair(uRand, 0.18 + Math.random() * 0.64);
        }
      }

      // Update carrier pairs physics: random walk outside depletion zone, fierce drift inside!
      for (let i = pairs.length - 1; i >= 0; i--) {
        const p = pairs[i];
        p.age += dt;
        p.flash = Math.max(0, p.flash - dt * 3.2);

        // Electron motion: rolls left (toward N-contact at u=0) when inside depletion field
        if (!p.eCollected) {
          const inField = p.ex >= depStartU && p.ex <= depEndU;
          const driftLeft = inField ? -0.58 * barrierRatio : 0;
          // In open circuit, piled-up electrons on N side occasionally leak right across lowered barrier
          const leakRight = mode === 'open' && p.ex < depStartU ? 0.09 : 0;
          const brownianX = (Math.random() - 0.5) * 0.24;
          const brownianY = (Math.random() - 0.5) * 0.22;

          p.ex += (driftLeft + leakRight) * dt + brownianX * Math.sqrt(dt) * 0.38;
          p.ey = Math.max(0.14, Math.min(0.86, p.ey + brownianY * Math.sqrt(dt) * 0.38));

          if (p.ex <= 0.03) {
            if (mode === 'open') {
              p.ex = 0.04 + Math.random() * 0.16; // Piles up on N-side!
            } else {
              p.eCollected = true;
            }
          }
          p.ex = Math.min(0.97, p.ex);
        }

        // Hole motion: swept right (toward P-contact at u=1) when inside depletion field
        if (!p.hCollected) {
          const inField = p.hx >= depStartU && p.hx <= depEndU;
          const driftRight = inField ? 0.58 * barrierRatio : 0;
          const brownianX = (Math.random() - 0.5) * 0.22;
          const brownianY = (Math.random() - 0.5) * 0.22;

          p.hx += driftRight * dt + brownianX * Math.sqrt(dt) * 0.36;
          p.hy = Math.max(0.14, Math.min(0.86, p.hy + brownianY * Math.sqrt(dt) * 0.36));

          if (p.hx >= 0.97) {
            if (mode === 'open') {
              p.hx = 0.80 + Math.random() * 0.15; // Piles up on P-side!
            } else {
              p.hCollected = true;
            }
          }
          p.hx = Math.max(0.03, p.hx);
        }

        if ((p.eCollected && p.hCollected) || p.age > 6.5) {
          pairs.splice(i, 1);
        }
      }

      for (let i = ripples.length - 1; i >= 0; i--) {
        ripples[i].age += dt;
        if (ripples[i].age > 0.7) ripples.splice(i, 1);
      }

      // ======================================================================
      // TOP PANEL: SILICON WAFER CROSS-SECTION
      // ======================================================================
      const topY = 24;
      const topH = h * 0.43;

      drawRoundedRect(ctx, padX, topY, plotW, topH, 10);
      ctx.fillStyle = '#0d1729';
      ctx.fill();

      const depX1 = xOf(depStartU);
      const depX2 = xOf(depEndU);

      // N-type region tint
      ctx.fillStyle = 'rgba(56, 189, 248, 0.13)';
      ctx.fillRect(padX, topY, depX1 - padX, topH);

      // Depletion zone emerald tint
      const depGrad = ctx.createLinearGradient(depX1, 0, depX2, 0);
      depGrad.addColorStop(0, 'rgba(56, 189, 248, 0.18)');
      depGrad.addColorStop(0.5, 'rgba(16, 185, 129, 0.24)');
      depGrad.addColorStop(1, 'rgba(251, 113, 133, 0.18)');
      ctx.fillStyle = depGrad;
      ctx.fillRect(depX1, topY, depX2 - depX1, topH);

      // P-type region tint
      ctx.fillStyle = 'rgba(251, 113, 133, 0.09)';
      ctx.fillRect(depX2, topY, padX + plotW - depX2, topH);

      // Wafer border & contact bars on left (N-front) and right (P-rear)
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
      ctx.lineWidth = 1.2;
      drawRoundedRect(ctx, padX, topY, plotW, topH, 10);
      ctx.stroke();

      // Left N-contact bar (silver) & Right P-contact bar (aluminum)
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(padX - 5, topY + 14, 5, topH - 28);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(padX + plotW, topY + 8, 5, topH - 16);

      // Region headers
      ctx.font = '700 11px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#7dd3fc';
      ctx.fillText('N-Type (Phosphorus)', padX + 10, topY - 7);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#6ee7b7';
      ctx.fillText('Depletion Zone (Electric Field →)', (depX1 + depX2) / 2, topY - 7);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#fda4af';
      ctx.fillText('P-Type Base (Boron)', padX + plotW - 10, topY - 7);

      // Draw FIXED Uncovered Crystal Ions: P+ on left of metallurgical junction, B- on right
      const juncX = xOf(nEndU);
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(juncX, topY);
      ctx.lineTo(juncX, h - 22);
      ctx.stroke();
      ctx.setLineDash([]);

      const rows = 3;
      for (let r = 0; r < rows; r++) {
        const iy = topY + 18 + (r / (rows - 1)) * (topH - 56);
        // Fixed P+ ions between depX1 and juncX
        for (const frac of [0.28, 0.72]) {
          const ix = depX1 + (juncX - depX1) * frac;
          ctx.strokeStyle = 'rgba(125, 211, 252, 0.55)';
          ctx.lineWidth = 1.2;
          ctx.strokeRect(ix - 7, iy - 7, 14, 14);
          ctx.fillStyle = '#bae6fd';
          ctx.font = '700 10px ui-monospace, monospace';
          ctx.textAlign = 'center';
          ctx.fillText('+', ix, iy + 3.5);
        }
        // Fixed B- ions between juncX and depX2
        for (const frac of [0.28, 0.72]) {
          const ix = juncX + (depX2 - juncX) * frac;
          ctx.strokeStyle = 'rgba(253, 164, 175, 0.55)';
          ctx.lineWidth = 1.2;
          ctx.strokeRect(ix - 7, iy - 7, 14, 14);
          ctx.fillStyle = '#fecdd3';
          ctx.font = '700 11px ui-monospace, monospace';
          ctx.textAlign = 'center';
          ctx.fillText('−', ix, iy + 3.5);
        }
      }

      // Built-in Electric Field vector arrow (N -> P, so electrons get pushed LEFT!)
      const arrowY = topY + topH - 13;
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(depX1 + 6, arrowY);
      ctx.lineTo(depX2 - 6, arrowY);
      ctx.lineTo(depX2 - 12, arrowY - 4);
      ctx.moveTo(depX2 - 6, arrowY);
      ctx.lineTo(depX2 - 12, arrowY + 4);
      ctx.stroke();
      ctx.fillStyle = '#6ee7b7';
      ctx.font = '600 9.5px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('E-field pushes e⁻ left, h⁺ right', (depX1 + depX2) / 2, arrowY - 6);

      // Background majority carriers (gentle jiggle in neutral N and P zones)
      for (let k = 0; k < 7; k++) {
        const bx = padX + 14 + ((k * 0.13 + 0.05) % 1) * Math.max(12, depX1 - padX - 24);
        const by = topY + 18 + ((k * 37) % (topH - 38)) + Math.sin(t * 3 + k) * 2.5;
        ctx.fillStyle = 'rgba(56, 189, 248, 0.45)';
        ctx.beginPath();
        ctx.arc(bx, by, 3.3, 0, Math.PI * 2);
        ctx.fill();
      }
      for (let k = 0; k < 9; k++) {
        const bx = depX2 + 14 + ((k * 0.11 + 0.04) % 1) * Math.max(18, padX + plotW - depX2 - 28);
        const by = topY + 18 + ((k * 43) % (topH - 38)) + Math.cos(t * 2.8 + k) * 2.5;
        ctx.strokeStyle = 'rgba(251, 113, 133, 0.45)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(bx, by, 3.4, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Photon absorption ripples
      for (const r of ripples) {
        const rx = xOf(r.x);
        const ry = topY + r.y * topH;
        const alpha = 1 - r.age / 0.7;
        ctx.strokeStyle = `rgba(251, 191, 36, ${alpha})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(rx, ry, 4 + r.age * 26, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Draw active photo-generated pairs in top cross-section
      for (const p of pairs) {
        if (!p.eCollected) {
          ctx.fillStyle = '#38bdf8';
          ctx.shadowColor = '#38bdf8';
          ctx.shadowBlur = 7;
          ctx.beginPath();
          ctx.arc(xOf(p.ex), topY + p.ey * topH, 4.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
        if (!p.hCollected) {
          ctx.strokeStyle = '#fb7185';
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.arc(xOf(p.hx), topY + p.hy * topH, 4.5, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // ======================================================================
      // BOTTOM PANEL: ALIGNED ENERGY BAND DIAGRAM ("THE ENERGY SLIDE")
      // ======================================================================
      const bandTop = topY + topH + 28;
      const bandH = h - bandTop - 16;

      drawRoundedRect(ctx, padX, bandTop, plotW, bandH, 10);
      ctx.fillStyle = '#09101f';
      ctx.fill();
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.24)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Smooth electrostatic potential step S(u) from 0 (on N-side) to 1 (on P-side)
      const stepProfile = (u: number): number => {
        if (u <= depStartU) return 0;
        if (u >= depEndU) return 1;
        const s = (u - depStartU) / (depEndU - depStartU);
        return s * s * (3 - 2 * s); // smoothstep!
      };

      const hillPx = (bandH * 0.36) * barrierRatio;
      const gapPx = bandH * 0.44;
      const ecLeftY = bandTop + bandH * 0.46; // N-side Ec is LOWER -> electrons roll downhill to left!

      const ecY = (u: number) => ecLeftY - stepProfile(u) * hillPx;
      const evY = (u: number) => ecY(u) + gapPx;

      // Shade forbidden 1.12 eV Bandgap ribbon between Ec(x) and Ev(x)
      ctx.beginPath();
      for (let i = 0; i <= 80; i++) {
        const u = i / 80;
        const x = xOf(u);
        const y = ecY(u);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      for (let i = 80; i >= 0; i--) {
        const u = i / 80;
        ctx.lineTo(xOf(u), evY(u));
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(30, 41, 59, 0.55)';
      ctx.fill();

      // Draw Conduction Band Ec(x)
      ctx.beginPath();
      for (let i = 0; i <= 80; i++) {
        const u = i / 80;
        const x = xOf(u);
        const y = ecY(u);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.6;
      ctx.stroke();

      // Draw Valence Band Ev(x)
      ctx.beginPath();
      for (let i = 0; i <= 80; i++) {
        const u = i / 80;
        const x = xOf(u);
        const y = evY(u);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = '#fb7185';
      ctx.lineWidth = 2.6;
      ctx.stroke();

      // Draw Fermi / Quasi-Fermi Levels (showing exact voltage qV split!)
      const efnY = ecLeftY + gapPx * 0.14;
      const efpY = evY(1) - gapPx * 0.14;
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1.4;

      if (cellV < 0.03) {
        // Single flat Fermi level across the entire junction!
        const efFlat = (efnY + efpY) * 0.5;
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.65)';
        ctx.beginPath();
        ctx.moveTo(padX + 8, efFlat);
        ctx.lineTo(padX + plotW - 8, efFlat);
        ctx.stroke();
        ctx.fillStyle = '#fde68a';
        ctx.font = '600 10px ui-monospace, monospace';
        ctx.textAlign = 'left';
        ctx.fillText('Equilibrium Fermi Level EF (V = 0 V)', padX + 12, efFlat - 5);
      } else {
        // Split Quasi-Fermi levels EFn and EFp -> their vertical gap IS q*V!
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.75)';
        ctx.beginPath();
        ctx.moveTo(padX + 8, efnY);
        ctx.lineTo(xOf(0.62), efnY);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(251, 113, 133, 0.75)';
        ctx.beginPath();
        ctx.moveTo(xOf(0.25), efpY);
        ctx.lineTo(padX + plotW - 8, efpY);
        ctx.stroke();

        // Highlight qV voltage bracket on right
        const vx = padX + plotW - 86;
        ctx.setLineDash([]);
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(vx, efnY);
        ctx.lineTo(vx, efpY);
        ctx.stroke();
        ctx.fillStyle = '#fbbf24';
        ctx.font = '700 10.5px ui-monospace, monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`qV = ${cellV.toFixed(2)} eV`, vx + 6, (efnY + efpY) / 2 + 4);
      }
      ctx.setLineDash([]);

      // Project active electrons onto Ec slope ("rolling downhill") & holes onto Ev slope ("floating uphill")
      for (let i = 0; i < Math.min(12, pairs.length); i++) {
        const p = pairs[i];
        if (!p.eCollected) {
          ctx.fillStyle = '#38bdf8';
          ctx.beginPath();
          ctx.arc(xOf(p.ex), ecY(p.ex) - 5, 4, 0, Math.PI * 2);
          ctx.fill();
        }
        if (!p.hCollected) {
          ctx.strokeStyle = '#fb7185';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(xOf(p.hx), evY(p.hx) + 5, 4, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // Labels on Band Diagram
      ctx.font = '700 10.5px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#7dd3fc';
      ctx.fillText('Conduction Band Ec (Electrons roll downhill ↙)', padX + 12, bandTop + 16);
      ctx.fillStyle = '#fda4af';
      ctx.fillText('Valence Band Ev (Holes float uphill ↗)', padX + 12, bandTop + bandH - 8);
    },
    true
  );
}
