import { drawRoundedRect, setupResponsiveCanvas } from './canvasUtils';

interface WaterfallStep {
  label: string;
  shortLabel: string;
  watts: number; // negative for loss, positive for start/final
  kind: 'start' | 'loss' | 'final';
  color: string;
  explanation: string;
}

interface CellGeneration {
  id: string;
  title: string;
  steps: WaterfallStep[];
}

const GENERATIONS: CellGeneration[] = [
  {
    id: 'commercial',
    title: 'Modern Rooftop Silicon Panel (22.5%)',
    steps: [
      {
        label: 'Incoming Noon Sunlight (AM1.5G)',
        shortLabel: 'Sunlight',
        watts: 1000,
        kind: 'start',
        color: '#fbbf24',
        explanation:
          '1,000 W/m² of full-spectrum starlight arrives at Earth’s surface across ultraviolet, visible, and infrared wavelengths.',
      },
      {
        label: 'Infrared Transparency (E < 1.12 eV)',
        shortLabel: 'Sub-Bandgap',
        watts: -190,
        kind: 'loss',
        color: '#64748b',
        explanation:
          '~190 W/m² of infrared photons carry less than 1.12 eV each and slip through silicon without breaking a single covalent bond.',
      },
      {
        label: 'Excess Photon Heat (Thermalization)',
        shortLabel: 'Excess Heat',
        watts: -330,
        kind: 'loss',
        color: '#fb923c',
        explanation:
          '~330 W/m² is lost within picoseconds as blue, green, and yellow photons shed all energy above 1.12 eV into crystal lattice vibrations.',
      },
      {
        label: 'Thermodynamic & Recombination Voltage Drop',
        shortLabel: 'Voltage/Recomb',
        watts: -185,
        kind: 'loss',
        color: '#38bdf8',
        explanation:
          'Because carriers radiate and recombine at room temperature (and Auger/defect sites), each electron exits at ~0.58 V instead of 1.12 V.',
      },
      {
        label: 'Glass, Grid Shading & Wire Resistance',
        shortLabel: 'Optics & Grid',
        watts: -70,
        kind: 'loss',
        color: '#a78bfa',
        explanation:
          'Tempered glass reflection (~2%), front silver finger shading (~3%), cell-to-cell spacing, and ribbon resistance trim ~70 W/m².',
      },
      {
        label: 'Clean Electricity in the Wire',
        shortLabel: 'Wire Output',
        watts: 225,
        kind: 'final',
        color: '#10b981',
        explanation:
          '225 Watts per m² (~22.5% efficiency) streams silently out of the panel into your inverter with zero fuel and zero moving parts.',
      },
    ],
  },
  {
    id: 'record-si',
    title: 'Record Lab Silicon Cell (27.3%)',
    steps: [
      {
        label: 'Incoming Noon Sunlight (AM1.5G)',
        shortLabel: 'Sunlight',
        watts: 1000,
        kind: 'start',
        color: '#fbbf24',
        explanation: '1,000 W/m² standard terrestrial AM1.5G solar spectrum.',
      },
      {
        label: 'Infrared Transparency (E < 1.12 eV)',
        shortLabel: 'Sub-Bandgap',
        watts: -188,
        kind: 'loss',
        color: '#64748b',
        explanation:
          'Fundamental to silicon’s 1.12 eV bandgap—even the finest lab cell cannot absorb photons weaker than its bandgap.',
      },
      {
        label: 'Excess Photon Heat (Thermalization)',
        shortLabel: 'Excess Heat',
        watts: -328,
        kind: 'loss',
        color: '#fb923c',
        explanation:
          'Also fundamental to a single 1.12 eV absorber: surplus energy above 1.12 eV relaxes into heat.',
      },
      {
        label: 'Near-Ideal Passivated Contacts (HJT / IBC)',
        shortLabel: 'Voltage/Recomb',
        watts: -191,
        kind: 'loss',
        color: '#38bdf8',
        explanation:
          'Atomically passivated surfaces and ultra-pure silicon suppress defect recombination, pushing Voc past 0.74 V (near Auger limit).',
      },
      {
        label: 'All-Back-Contact Zero Front Shading',
        shortLabel: 'Optics & Grid',
        watts: -20,
        kind: 'loss',
        color: '#a78bfa',
        explanation:
          'Moving both N and P metal contacts to the rear face (Interdigitated Back Contact) eliminates front silver shading almost completely!',
      },
      {
        label: 'Clean Electricity in the Wire',
        shortLabel: 'Wire Output',
        watts: 273,
        kind: 'final',
        color: '#10b981',
        explanation:
          '273 W/m² (27.3%)—approaching silicon’s true physical Auger-limited ceiling of ~29.4%.',
      },
    ],
  },
  {
    id: 'tandem',
    title: 'Perovskite-on-Silicon Tandem (34.2%)',
    steps: [
      {
        label: 'Incoming Noon Sunlight (AM1.5G)',
        shortLabel: 'Sunlight',
        watts: 1000,
        kind: 'start',
        color: '#fbbf24',
        explanation: '1,000 W/m² standard terrestrial AM1.5G solar spectrum.',
      },
      {
        label: 'Infrared Transparency (E < 1.12 eV)',
        shortLabel: 'Sub-Bandgap',
        watts: -188,
        kind: 'loss',
        color: '#64748b',
        explanation:
          'Photons below silicon’s 1.12 eV bottom cell still pass through both layers.',
      },
      {
        label: 'Slashed Excess Heat (Two Bandgaps: 1.68 + 1.12 eV)',
        shortLabel: 'Excess Heat',
        watts: -198,
        kind: 'loss',
        color: '#fb923c',
        explanation:
          'Breakthrough! A 1.68 eV perovskite top layer catches blue/green photons at high voltage, cutting thermalization waste by ~130 W/m²!',
      },
      {
        label: 'Dual-Junction Thermodynamic & Recombination Drop',
        shortLabel: 'Voltage/Recomb',
        watts: -232,
        kind: 'loss',
        color: '#38bdf8',
        explanation:
          'Two series-connected junctions produce nearly ~1.95 V combined open-circuit voltage.',
      },
      {
        label: 'Interlayer Optics & TCO Resistance',
        shortLabel: 'Optics & Grid',
        watts: -40,
        kind: 'loss',
        color: '#a78bfa',
        explanation:
          'Transparent conductive oxides and textured interfaces couple light cleanly between top and bottom cells.',
      },
      {
        label: 'Clean Electricity in the Wire',
        shortLabel: 'Wire Output',
        watts: 342,
        kind: 'final',
        color: '#10b981',
        explanation:
          '342 W/m² (34.2%)—shattering the 33.7% single-junction Shockley–Queisser ceiling by sorting colors across two crystals!',
      },
    ],
  },
];

export function initEnergyWaterfall(): void {
  const mount = document.getElementById('waterfall-mount');
  if (!mount) return;

  let genIndex = 0;
  let activeStepIndex = 5; // Default highlight on final delivered output

  mount.innerHTML = `
    <div class="ctrl-bar" style="justify-content:space-between;">
      <div class="btn-group" id="wf-gen-btns" role="group" aria-label="Solar technology comparison">
        ${GENERATIONS.map(
          (g, idx) =>
            `<button type="button" class="stage-btn ${idx === 0 ? 'active-green' : ''}" data-idx="${idx}">${g.title}</button>`
        ).join('')}
      </div>
    </div>

    <div class="chart-canvas-wrap">
      <canvas id="wf-canvas" style="cursor:pointer;"></canvas>
    </div>

    <div class="inspector-box" id="wf-detail-box" style="margin-top:0.85rem;"></div>
  `;

  const genBtns = Array.from(mount.querySelectorAll('#wf-gen-btns button')) as HTMLButtonElement[];
  const canvas = mount.querySelector('#wf-canvas') as HTMLCanvasElement;
  const detailBox = mount.querySelector('#wf-detail-box') as HTMLElement;

  const handle = setupResponsiveCanvas(
    canvas,
    (w) => (w < 560 ? 275 : 265),
    (ctx, w, h) => drawWaterfall(ctx, w, h, GENERATIONS[genIndex], activeStepIndex),
    false
  );

  const updateDetail = () => {
    const gen = GENERATIONS[genIndex];
    const step = gen.steps[activeStepIndex];
    const signStr =
      step.kind === 'loss'
        ? `${step.watts} W/m² (${Math.abs(step.watts / 10).toFixed(1)}% loss)`
        : `${step.watts} W/m² (${(step.watts / 10).toFixed(1)}%)`;

    detailBox.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:0.4rem;margin-bottom:0.25rem;">
        <h4 style="margin:0;color:${step.color};">${step.label}</h4>
        <span style="font-family:var(--font-mono);font-weight:700;color:#f8fafc;">${signStr}</span>
      </div>
      <p>${step.explanation}</p>
    `;

    genBtns.forEach((b, idx) => {
      b.classList.toggle('active-green', idx === genIndex);
    });
    handle.requestRedraw();
  };

  genBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      genIndex = Number(btn.dataset.idx);
      updateDetail();
    });
  });

  const pickBar = (clientX: number) => {
    const rect = canvas.getBoundingClientRect();
    const padL = 44;
    const padR = 14;
    const plotW = rect.width - padL - padR;
    const x = clientX - rect.left - padL;
    if (x < 0 || x > plotW) return;
    const idx = Math.min(5, Math.max(0, Math.floor((x / plotW) * 6)));
    if (idx !== activeStepIndex) {
      activeStepIndex = idx;
      updateDetail();
    }
  };

  canvas.addEventListener('pointermove', (e) => pickBar(e.clientX));
  canvas.addEventListener('pointerdown', (e) => pickBar(e.clientX));

  updateDetail();
}

function drawWaterfall(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  gen: CellGeneration,
  selectedIdx: number
): void {
  const padL = 44;
  const padR = 14;
  const padT = 22;
  const padB = 40;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const yOf = (watts: number) => padT + plotH - (watts / 1050) * plotH;

  // Horizontal grid
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.13)';
  ctx.lineWidth = 1;
  ctx.font = '10px ui-monospace, monospace';
  ctx.fillStyle = '#94a3b8';
  ctx.textAlign = 'right';
  for (const tick of [0, 250, 500, 750, 1000]) {
    const y = yOf(tick);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(w - padR, y);
    ctx.stroke();
    ctx.fillText(`${tick}W`, padL - 6, y + 3);
  }

  const n = gen.steps.length;
  const colW = plotW / n;
  const barW = Math.min(68, colW * 0.68);

  let running = 1000;
  gen.steps.forEach((step, idx) => {
    const cx = padL + colW * (idx + 0.5);
    const bx = cx - barW / 2;

    let topVal = 0;
    let botVal = 0;
    if (step.kind === 'start') {
      topVal = step.watts;
      botVal = 0;
      running = step.watts;
    } else if (step.kind === 'loss') {
      topVal = running;
      running += step.watts;
      botVal = running;
    } else {
      topVal = step.watts;
      botVal = 0;
    }

    const yTop = yOf(topVal);
    const yBot = yOf(botVal);
    const bh = Math.max(3, yBot - yTop);

    // Connector line to next column
    if (idx < n - 1) {
      const nextBx = padL + colW * (idx + 1.5) - barW / 2;
      const connY = step.kind === 'start' ? yTop : yBot;
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(bx + barW, connY);
      ctx.lineTo(nextBx, connY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Highlight glow if selected
    if (idx === selectedIdx) {
      drawRoundedRect(ctx, bx - 4, padT - 4, barW + 8, plotH + 8, 8);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.055)';
      ctx.fill();
    }

    drawRoundedRect(ctx, bx, yTop, barW, bh, 5);
    ctx.fillStyle = step.color;
    ctx.globalAlpha = idx === selectedIdx ? 1.0 : 0.82;
    ctx.fill();
    ctx.globalAlpha = 1.0;

    if (idx === selectedIdx) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }

    // Value label above bar
    ctx.fillStyle = '#f8fafc';
    ctx.font = '700 10.5px ui-monospace, monospace';
    ctx.textAlign = 'center';
    const txt = step.kind === 'loss' ? `${step.watts}W` : `${step.watts}W`;
    ctx.fillText(txt, cx, yTop - 6);

    // X-axis short label
    ctx.fillStyle = idx === selectedIdx ? '#f8fafc' : '#94a3b8';
    ctx.font = w < 520 ? '600 9px -apple-system, sans-serif' : '600 10.5px -apple-system, sans-serif';
    ctx.fillText(step.shortLabel, cx, h - 18);
  });

  ctx.fillStyle = '#64748b';
  ctx.font = '10px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Hover or tap any column to inspect the physical mechanism', padL + plotW / 2, h - 3);
}
