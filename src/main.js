import './styles/main.css';
import {
  DEFAULT_INPUTS,
  saunaModel,
  evaluateScenario,
  evaluateFastSummary,
  computeBreakEvenThresholds,
  normalizeInputs,
} from './model/saunaModel.js';
import {
  renderDailyChart,
  renderEnergyAndMoneyFlows,
  renderMonthlyChart,
  renderCashflowChart,
  renderSizingCurveChart,
} from './charts/renderCharts.js';

// Expose programmatic verification API immediately on window
if (typeof window !== 'undefined') {
  window.saunaModel = saunaModel;
}

const PRESETS = {
  default: {
    arrayKw: 3.0,
    exportPolicy: 'net-metering',
    battery: false,
    gridPriceUsdPerKwh: 0.16,
    discountRatePct: 5.0,
  },
  sweetspot: {
    arrayKw: 1.4,
    exportPolicy: 'net-metering',
    battery: false,
    gridPriceUsdPerKwh: 0.16,
    discountRatePct: 5.0,
  },
  netbilling: {
    arrayKw: 3.0,
    exportPolicy: 'net-billing',
    battery: false,
    gridPriceUsdPerKwh: 0.16,
    discountRatePct: 5.0,
  },
  battery: {
    arrayKw: 3.0,
    exportPolicy: 'net-billing',
    battery: true,
    gridPriceUsdPerKwh: 0.16,
    discountRatePct: 5.0,
  },
  oversized: {
    arrayKw: 8.0,
    exportPolicy: 'net-metering',
    battery: false,
    gridPriceUsdPerKwh: 0.16,
    discountRatePct: 5.0,
  },
};

let state = { ...DEFAULT_INPUTS };
let selectedDayKey = 'summerSolstice';
let latestDetailed = null;

function fmtNum(n, digits = 1) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return Number(n).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function fmtUsd(n, digits = 0, forcePlus = false) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const sign = n < -1e-9 ? '−$' : forcePlus && n > 1e-9 ? '+$' : '$';
  return (
    sign +
    Math.abs(n).toLocaleString('en-US', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    })
  );
}

function fmtPct(n, digits = 2) {
  if (n === null || n === undefined || Number.isNaN(n)) return 'None';
  const sign = n < 0 ? '−' : '';
  return (
    sign +
    Math.abs(n).toLocaleString('en-US', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }) +
    '%'
  );
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setHtml(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

function syncControlsUI() {
  const arrayRange = document.getElementById('ctrl-array-range');
  const arrayNum = document.getElementById('ctrl-array-num');
  if (arrayRange) arrayRange.value = String(Math.min(10, Math.max(0.5, state.arrayKw)));
  if (arrayNum && document.activeElement !== arrayNum) arrayNum.value = String(state.arrayKw);

  const priceRange = document.getElementById('ctrl-price-range');
  const priceNum = document.getElementById('ctrl-price-num');
  if (priceRange) priceRange.value = String(Math.min(0.5, Math.max(0.06, state.gridPriceUsdPerKwh)));
  if (priceNum && document.activeElement !== priceNum) priceNum.value = state.gridPriceUsdPerKwh.toFixed(2);

  const discRange = document.getElementById('ctrl-disc-range');
  const discNum = document.getElementById('ctrl-disc-num');
  if (discRange) discRange.value = String(Math.min(12, Math.max(0, state.discountRatePct)));
  if (discNum && document.activeElement !== discNum) discNum.value = String(state.discountRatePct);

  document.getElementById('btn-nm')?.classList.toggle('active', state.exportPolicy === 'net-metering');
  document.getElementById('btn-nb')?.classList.toggle('active', state.exportPolicy === 'net-billing');
  document.getElementById('btn-batt-off')?.classList.toggle('active', !state.battery);
  document.getElementById('btn-batt-on')?.classList.toggle('active', state.battery);

  const approxPanels = Math.max(1, Math.round((state.arrayKw * 1000) / 400));
  setText('readout-array', `${fmtNum(state.arrayKw, 2)} kW (~${approxPanels}p)`);
  setText('readout-policy', state.exportPolicy === 'net-metering' ? '1:1 + $0.04' : '$0.04 Export');
  setText('readout-battery', state.battery ? '13.5 kWh / 5 kW' : 'None ($0)');
  setText('readout-price', `${fmtUsd(state.gridPriceUsdPerKwh, 2)} / kWh`);
  setText('readout-disc', `${fmtNum(state.discountRatePct, 2)}%`);

  // Highlight matching preset button if exact match
  document.querySelectorAll('.preset-btn').forEach((btn) => {
    const p = PRESETS[btn.dataset.preset];
    const matches =
      p &&
      Math.abs(p.arrayKw - state.arrayKw) < 1e-6 &&
      p.exportPolicy === state.exportPolicy &&
      p.battery === state.battery &&
      Math.abs(p.gridPriceUsdPerKwh - state.gridPriceUsdPerKwh) < 1e-6 &&
      Math.abs(p.discountRatePct - state.discountRatePct) < 1e-6;
    btn.classList.toggle('active', Boolean(matches));
  });
}

function buildLiveVerdictCopy(det) {
  const { inputs, summary } = det;
  const isYes = summary.npvUsd > 0;
  const polName = inputs.exportPolicy === 'net-metering' ? '1:1 net metering' : 'net billing';
  const battDesc = inputs.battery ? 'with a 13.5 kWh battery' : 'with no battery';

  if (inputs.arrayKw === 0 && !inputs.battery) {
    return 'Set an array size above 0 kW to evaluate a solar installation.';
  }

  if (isYes) {
    return `At ${fmtNum(inputs.arrayKw, 2)} kW under ${polName} ${battDesc}, the project clears your ${fmtNum(
      inputs.discountRatePct,
      1
    )}% hurdle rate with ${fmtUsd(summary.npvUsd, 0, true)} in 25-year NPV (${fmtPct(
      summary.irrPct,
      2
    )} IRR, ${fmtNum(summary.paybackYears, 1)}-year payback)—driven by ${
      inputs.exportPolicy === 'net-metering'
        ? 'retail bill credits on exported daytime solar rather than direct evening heating.'
        : 'high retail electricity savings.'
    }`;
  }

  if (inputs.battery) {
    return `No: adding the 13.5 kWh battery pushes upfront outlay to ${fmtUsd(
      summary.upfrontCostUsd,
      0
    )} (+$6,000 in Year 13), resulting in ${fmtUsd(
      summary.npvUsd,
      0
    )} NPV—and the 5 kW battery limit still forces ${fmtNum(
      summary.gridKwh,
      0
    )} kWh/yr of grid imports during 8 kW sauna preheats.`;
  }

  if (inputs.exportPolicy === 'net-billing') {
    return `No: under net billing, ${fmtNum(
      (summary.exportedKwh / Math.max(summary.annualSolarKwh, 1)) * 100,
      1
    )}% of your solar leaves at midday for $0.04/kWh while evening sauna power costs ${fmtUsd(
      inputs.gridPriceUsdPerKwh,
      2
    )}/kWh—yielding ${fmtUsd(summary.npvUsd, 0)} NPV (${
      summary.paybackYears === null ? 'never pays back in 25 yrs' : `${fmtNum(summary.paybackYears, 1)}-yr payback`
    }).`;
  }

  return `No: although 1:1 net metering offsets the sauna's 1,872 kWh, a ${fmtNum(
    inputs.arrayKw,
    2
  )} kW array is oversized for the sauna alone—excess output sells at $0.04/kWh, dragging IRR to ${fmtPct(
    summary.irrPct,
    2
  )} vs. your ${fmtNum(inputs.discountRatePct, 1)}% discount rate (${fmtUsd(summary.npvUsd, 0)} NPV).`;
}

function renderRegimesTable(det) {
  const { inputs } = det;
  setText('tbl1-kw', `${fmtNum(inputs.arrayKw, 2)} kW`);
  const combos = [
    { label: 'Net Metering · Solar Only', exportPolicy: 'net-metering', battery: false },
    { label: 'Net Metering · + 13.5 kWh Battery', exportPolicy: 'net-metering', battery: true },
    { label: 'Net Billing · Solar Only', exportPolicy: 'net-billing', battery: false },
    { label: 'Net Billing · + 13.5 kWh Battery', exportPolicy: 'net-billing', battery: true },
  ];

  const tbody = document.querySelector('#table-regimes tbody');
  if (!tbody) return;

  tbody.innerHTML = combos
    .map((c) => {
      const s = saunaModel({
        ...inputs,
        exportPolicy: c.exportPolicy,
        battery: c.battery,
      });
      const isActive = c.exportPolicy === inputs.exportPolicy && c.battery === inputs.battery;
      const npvCls = s.npvUsd >= 0 ? 'val-pos' : 'val-neg';
      return `
        <tr class="${isActive ? 'active-row' : ''}">
          <td>${isActive ? '▸ ' : ''}${c.label}</td>
          <td>${fmtUsd(s.upfrontCostUsd, 0)}</td>
          <td>${fmtNum(s.directSolarKwh, 1)} kWh</td>
          <td>${fmtNum(s.batteryKwh, 0)} kWh</td>
          <td>${fmtNum(s.gridKwh, 0)} kWh</td>
          <td>${fmtNum(s.exportedKwh, 0)} kWh</td>
          <td>${fmtUsd(s.year1SavingsUsd, 2)}</td>
          <td>${s.paybackYears !== null ? `${fmtNum(s.paybackYears, 1)} yrs` : 'Never (>25y)'}</td>
          <td>${fmtPct(s.irrPct, 2)}</td>
          <td class="${npvCls}">${fmtUsd(s.npvUsd, 0, true)}</td>
        </tr>
      `;
    })
    .join('');
}

function renderSensitivityMatrix(det) {
  const { inputs } = det;
  const polLabel = inputs.exportPolicy === 'net-metering' ? 'Net Metering' : 'Net Billing';
  const battLabel = inputs.battery ? '+ 13.5 kWh Battery' : 'No Battery';
  setText(
    'sens-subtitle',
    `${polLabel} · ${battLabel} · ${fmtNum(inputs.discountRatePct, 1)}% Discount Rate`
  );

  const kwCols = [1.0, 1.4, 2.0, 3.0, 4.0, 5.0, 8.0];
  const priceRows = [0.10, 0.13, 0.16, 0.20, 0.25, 0.35];

  const thead = document.querySelector('#table-sensitivity thead');
  const tbody = document.querySelector('#table-sensitivity tbody');
  if (!thead || !tbody) return;

  thead.innerHTML = `
    <tr>
      <th>Yr 1 Grid Price \\ Array</th>
      ${kwCols.map((kw) => `<th>${fmtNum(kw, 1)} kW</th>`).join('')}
    </tr>
  `;

  tbody.innerHTML = priceRows
    .map((gp) => {
      const cells = kwCols
        .map((kw) => {
          const res = evaluateFastSummary({
            ...inputs,
            arrayKw: kw,
            gridPriceUsdPerKwh: gp,
          });
          const npv = res.npvUsd;
          let cls = npv >= 1000 ? 'heat-pos-strong' : npv >= 0 ? 'heat-pos-mild' : npv >= -3500 ? 'heat-neg-mild' : 'heat-neg-strong';
          const isClose =
            Math.abs(inputs.arrayKw - kw) < 0.15 && Math.abs(inputs.gridPriceUsdPerKwh - gp) < 0.014;
          if (isClose) cls += ' heat-selected';
          return `<td class="${cls}" style="cursor:pointer" data-kw="${kw}" data-gp="${gp}" title="Click to set ${kw} kW & $${gp.toFixed(2)}/kWh">${fmtUsd(npv, 0, true)}</td>`;
        })
        .join('');
      return `
        <tr>
          <td><strong>${fmtUsd(gp, 2)} / kWh</strong></td>
          ${cells}
        </tr>
      `;
    })
    .join('');

  tbody.querySelectorAll('td[data-kw]').forEach((td) => {
    td.addEventListener('click', () => {
      state.arrayKw = Number(td.dataset.kw);
      state.gridPriceUsdPerKwh = Number(td.dataset.gp);
      updateAll();
    });
  });
}

function renderScheduleTable(det) {
  const { yearlySchedule, summary } = det;
  const tbody = document.querySelector('#table-schedule tbody');
  const tfoot = document.querySelector('#table-schedule tfoot');
  if (!tbody || !tfoot) return;

  const paybackIntYr = summary.paybackYears !== null ? Math.ceil(summary.paybackYears) : -1;

  let totSolar = 0;
  let totSelf = 0;
  let totGrid = 0;
  let totExp = 0;
  let totSaved = 0;
  let totCapex = 0;
  let totNetCf = 0;

  tbody.innerHTML = yearlySchedule
    .map((r) => {
      totSolar += r.solarKwh;
      totSelf += r.directSolarKwh + r.batteryKwh;
      totGrid += r.gridKwh;
      totExp += r.exportedKwh;
      totSaved += r.billSavingsUsd;
      totCapex += r.capexOrReplacementUsd;
      totNetCf += r.netCashFlowUsd;

      const rowCls =
        r.year > 0 && r.year === paybackIntYr
          ? 'payback-row'
          : r.year > 0 && r.capexOrReplacementUsd < 0
          ? 'replacement-row'
          : '';

      if (r.year === 0) {
        return `
          <tr>
            <td><strong>0</strong></td>
            <td>2027</td>
            <td>—</td>
            <td>—</td>
            <td>—</td>
            <td>—</td>
            <td>—</td>
            <td>$0.00</td>
            <td class="val-neg">${fmtUsd(r.capexOrReplacementUsd, 0)}</td>
            <td class="val-neg">${fmtUsd(r.netCashFlowUsd, 0)}</td>
            <td class="val-neg">${fmtUsd(r.discountedCashFlowUsd, 0)}</td>
            <td class="val-neg">${fmtUsd(r.cumNominalUsd, 0)}</td>
            <td class="val-neg">${fmtUsd(r.cumDiscountedUsd, 0)}</td>
          </tr>
        `;
      }

      return `
        <tr class="${rowCls}">
          <td><strong>${r.year}</strong></td>
          <td>${r.calendarYear}</td>
          <td>${fmtNum(r.solarKwh, 0)}</td>
          <td>${fmtNum(r.directSolarKwh + r.batteryKwh, 0)}</td>
          <td>${fmtNum(r.gridKwh, 0)}</td>
          <td>${fmtNum(r.exportedKwh, 0)}</td>
          <td>$${r.gridPrice.toFixed(3)} / $${r.exportPrice.toFixed(3)}</td>
          <td>${fmtUsd(r.billSavingsUsd, 2)}</td>
          <td class="${r.capexOrReplacementUsd < 0 ? 'val-neg' : ''}">${
        r.capexOrReplacementUsd < 0 ? fmtUsd(r.capexOrReplacementUsd, 0) : '—'
      }</td>
          <td class="${r.netCashFlowUsd >= 0 ? '' : 'val-neg'}">${fmtUsd(r.netCashFlowUsd, 2)}</td>
          <td>${fmtUsd(r.discountedCashFlowUsd, 2)}</td>
          <td class="${r.cumNominalUsd >= 0 ? 'val-pos' : ''}">${fmtUsd(r.cumNominalUsd, 0, true)}</td>
          <td class="${r.cumDiscountedUsd >= 0 ? 'val-pos' : 'val-neg'}">${fmtUsd(r.cumDiscountedUsd, 0, true)}</td>
        </tr>
      `;
    })
    .join('');

  tfoot.innerHTML = `
    <tr>
      <td colspan="2">25-Yr Total</td>
      <td>${fmtNum(totSolar, 0)}</td>
      <td>${fmtNum(totSelf, 0)}</td>
      <td>${fmtNum(totGrid, 0)}</td>
      <td>${fmtNum(totExp, 0)}</td>
      <td>—</td>
      <td>${fmtUsd(totSaved, 0)}</td>
      <td class="val-neg">${fmtUsd(totCapex, 0)}</td>
      <td class="${totNetCf >= 0 ? 'val-pos' : 'val-neg'}">${fmtUsd(totNetCf, 0, true)}</td>
      <td class="${summary.npvUsd >= 0 ? 'val-pos' : 'val-neg'}">${fmtUsd(summary.npvUsd, 0, true)}</td>
      <td>${fmtUsd(totNetCf, 0, true)}</td>
      <td class="${summary.npvUsd >= 0 ? 'val-pos' : 'val-neg'}">${fmtUsd(summary.npvUsd, 0, true)}</td>
    </tr>
  `;
}

function renderLiveMathFormulas(det, be) {
  const { inputs, summary, year1Dispatch, year1Settlement, yearlySchedule } = det;
  const yr25 = yearlySchedule[25];

  setHtml(
    'eq-live-1',
    `<strong>At ${fmtNum(inputs.arrayKw, 2)} kW:</strong> Year 1 solar = 1,397.62 × ${fmtNum(
      inputs.arrayKw,
      2
    )} = <strong>${fmtNum(summary.annualSolarKwh, 1)} kWh</strong>; Year 25 solar (0.995<sup>24</sup> = 88.67%) = <strong>${fmtNum(
      yr25.solarKwh,
      1
    )} kWh</strong>.`
  );

  setHtml(
    'eq-live-2',
    `<strong>Year 1 Sauna Supply (1,872.0 kWh):</strong> Direct PV = <strong>${fmtNum(
      summary.directSolarKwh,
      1
    )} kWh</strong> + Battery = <strong>${fmtNum(
      summary.batteryKwh,
      1
    )} kWh</strong> (loss: ${fmtNum(year1Dispatch.batteryLossKwh, 1)} kWh) + Grid = <strong>${fmtNum(
      summary.gridKwh,
      1
    )} kWh</strong>.`
  );

  setHtml(
    'eq-live-3',
    `<strong>Year 1 Settlement (${
      inputs.exportPolicy === 'net-metering' ? 'Net Metering' : 'Net Billing'
    }):</strong> ${fmtNum(year1Settlement.retailOffsetKwh, 1)} kWh × ${fmtUsd(
      inputs.gridPriceUsdPerKwh,
      2
    )} + ${fmtNum(year1Settlement.surplusExportKwh, 1)} kWh × $0.04 = <strong>${fmtUsd(
      summary.year1SavingsUsd,
      2
    )}</strong> saved.`
  );

  setHtml(
    'eq-live-4',
    `<strong>Valuation:</strong> CF<sub>0</sub> = <strong>${fmtUsd(
      -summary.upfrontCostUsd,
      0
    )}</strong> ($0 tax credit); at r = ${fmtNum(
      inputs.discountRatePct,
      2
    )}%, <strong>NPV = ${fmtUsd(summary.npvUsd, 0, true)}</strong>, <strong>IRR = ${fmtPct(
      summary.irrPct,
      2
    )}</strong>, Payback = <strong>${
      summary.paybackYears !== null ? `${fmtNum(summary.paybackYears, 2)} yrs` : 'null (>25 yrs)'
    }</strong>.`
  );

  // Break-even cards
  setText(
    'be-grid-price',
    be.breakEvenGridPrice !== null ? `${fmtUsd(be.breakEvenGridPrice, 2)} / kWh` : '> $2.50 / kWh'
  );
  setText(
    'be-grid-desc',
    be.breakEvenGridPrice !== null
      ? `Year 1 retail rate needed for NPV = $0 (vs. your ${fmtUsd(inputs.gridPriceUsdPerKwh, 2)}/kWh).`
      : 'Even at $2.50/kWh, this setup would not break even.'
  );

  if (be.breakEvenCostPerWatt !== null && be.breakEvenCostPerWatt >= 0) {
    setText('be-solar-cost', `${fmtUsd(be.breakEvenCostPerWatt, 2)} / W`);
    setText(
      'be-solar-desc',
      `Max installed solar $/W to break even at ${fmtNum(inputs.discountRatePct, 1)}% (vs. $3.00/W market cost).`
    );
  } else {
    setText('be-solar-cost', '< $0.00 / W');
    setText(
      'be-solar-desc',
      'Even if the solar panels were free ($0/W), the $11k+$6k battery cost keeps NPV negative!'
    );
  }

  setText('be-irr', fmtPct(summary.irrPct, 2));
  setText(
    'be-irr-desc',
    summary.irrPct !== null && summary.irrPct > 0
      ? `Any discount rate below ${fmtPct(summary.irrPct, 2)} makes NPV positive.`
      : 'Negative or undefined IRR: undiscounted 25-year cash inflows never recover capital outlays.'
  );

  const battEl = document.getElementById('be-batt-delta');
  if (battEl) {
    battEl.textContent = fmtUsd(be.batteryNetNpvDelta, 0, true);
    battEl.className = `be-val ${be.batteryNetNpvDelta >= 0 ? 'val-pos' : 'val-neg'}`;
  }
  setText(
    'be-batt-desc',
    `Battery adds ${fmtUsd(be.batteryIncrementalBillPv, 0, true)} in 25-yr PV bill savings vs. ${fmtUsd(
      be.batteryCapexPv,
      0
    )} in PV battery cost.`
  );
}

function updateAll() {
  state = normalizeInputs(state);
  syncControlsUI();

  const det = evaluateScenario(state, { detailed: true });
  latestDetailed = det;
  const { summary, inputs } = det;
  const be = computeBreakEvenThresholds(inputs, det);

  const isYes = summary.npvUsd > 0;
  const card = document.getElementById('live-verdict-card');
  const pill = document.getElementById('verdict-pill');
  if (card) {
    card.classList.toggle('is-yes', isYes);
    card.classList.toggle('is-no', !isYes);
  }
  if (pill) {
    pill.textContent = isYes ? 'Verdict at Your Settings: Yes' : 'Verdict at Your Settings: No';
    pill.className = `verdict-pill ${isYes ? 'yes' : 'no'}`;
  }

  const polShort = inputs.exportPolicy === 'net-metering' ? 'Net Metering' : 'Net Billing';
  const battShort = inputs.battery ? '+ 13.5 kWh Battery' : 'No Battery';
  setText('scenario-tag', `${fmtNum(inputs.arrayKw, 2)} kW · ${polShort} · ${battShort}`);
  setText('live-verdict-summary', buildLiveVerdictCopy(det));

  // KPI boxes
  const npvEl = document.getElementById('kpi-npv');
  if (npvEl) {
    npvEl.textContent = fmtUsd(summary.npvUsd, 0, true);
    npvEl.className = `kpi-val ${isYes ? 'pos' : 'neg'}`;
  }
  setText('kpi-npv-sub', `at ${fmtNum(inputs.discountRatePct, 1)}% discount rate`);
  setText('kpi-irr', fmtPct(summary.irrPct, 2));
  setText('kpi-irr-sub', `vs. ${fmtNum(inputs.discountRatePct, 1)}% hurdle rate`);
  setText('kpi-upfront', fmtUsd(summary.upfrontCostUsd, 0));
  setText('kpi-taxcredit', `${fmtUsd(summary.federalTaxCreditUsd, 0)} federal tax credit (2027)`);
  setText(
    'kpi-payback',
    summary.paybackYears !== null ? `${fmtNum(summary.paybackYears, 1)} yrs` : 'Never (>25y)'
  );
  setText('kpi-yr1sav', `${fmtUsd(summary.year1SavingsUsd, 0)} Year 1 bill savings`);
  setText('kpi-solarkwh', `${fmtNum(summary.annualSolarKwh, 0)} kWh`);
  const offGridShare = ((summary.directSolarKwh + summary.batteryKwh) / summary.annualSaunaKwh) * 100;
  setText('kpi-selfshare', `${fmtNum(offGridShare, 1)}%`);
  setText(
    'kpi-selfshare-sub',
    `${fmtNum(summary.directSolarKwh, 0)} kWh direct · ${fmtNum(summary.batteryKwh, 0)} kWh batt`
  );

  // Sticky dock strip
  setText('strip-npv', fmtUsd(summary.npvUsd, 0, true));
  setText('strip-irr', fmtPct(summary.irrPct, 2));
  setText(
    'strip-pb',
    summary.paybackYears !== null ? `${fmtNum(summary.paybackYears, 1)} yrs` : 'Never'
  );
  setText('strip-solar', `${fmtNum(summary.annualSolarKwh, 0)} kWh`);
  setText('strip-sav', fmtUsd(summary.year1SavingsUsd, 2));

  // Inline dynamic prose values
  setText('prose-pv-baseline', fmtUsd(det.pvBaselineSaunaBillsUsd, 0));
  setText('p-kw-1', `${fmtNum(inputs.arrayKw, 2)} kW`);
  setText('p-direct-kwh', `${fmtNum(summary.directSolarKwh, 1)} kWh`);
  setText('p-direct-pct', `${fmtNum((summary.directSolarKwh / summary.annualSaunaKwh) * 100, 1)}%`);
  setText('p-kw-2', `${fmtNum(inputs.arrayKw, 2)} kW`);
  setText('p-solar-yr1', `${fmtNum(summary.annualSolarKwh, 0)} kWh`);
  setText('p-export-yr1', `${fmtNum(summary.exportedKwh, 0)} kWh`);
  setText('p-grid-yr1', `${fmtNum(summary.gridKwh, 0)} kWh`);
  setText('p-gprice-1', fmtUsd(inputs.gridPriceUsdPerKwh, 2));
  setText('p-disc-1', `${fmtNum(inputs.discountRatePct, 1)}%`);

  // Statutory callout values
  setText('callout-kw', `${fmtNum(inputs.arrayKw, 2)} kW${inputs.battery ? ' + battery' : ''}`);
  setText('callout-capex', fmtUsd(summary.upfrontCostUsd, 0));
  setText('callout-itc30', fmtUsd(be.itc30CreditUsd, 0));
  setText('callout-npv30', fmtUsd(be.npvWith30PctItc, 0, true));

  // Render SVG figures
  const dailyEl = document.getElementById('chart-daily');
  if (dailyEl) {
    renderDailyChart(dailyEl, det.dailyProfiles[selectedDayKey], inputs);
  }
  const flowsEl = document.getElementById('chart-flows');
  if (flowsEl) {
    renderEnergyAndMoneyFlows(flowsEl, det);
  }
  const monthlyEl = document.getElementById('chart-monthly');
  if (monthlyEl) {
    renderMonthlyChart(monthlyEl, det.year1Dispatch.monthly, inputs);
  }
  const cfEl = document.getElementById('chart-cashflow');
  if (cfEl) {
    renderCashflowChart(cfEl, det.yearlySchedule, summary, inputs);
  }
  const sizingEl = document.getElementById('chart-sizing');
  if (sizingEl) {
    renderSizingCurveChart(sizingEl, inputs, summary, (clickedKw) => {
      state.arrayKw = clickedKw;
      updateAll();
    });
  }

  // Render tables & formulas
  renderRegimesTable(det);
  renderSensitivityMatrix(det);
  renderLiveMathFormulas(det, be);
  renderScheduleTable(det);
}

function bindEvents() {
  // Array size
  document.getElementById('ctrl-array-range')?.addEventListener('input', (e) => {
    state.arrayKw = Number(e.target.value);
    updateAll();
  });
  document.getElementById('ctrl-array-num')?.addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    if (!Number.isNaN(v) && v >= 0) {
      state.arrayKw = Math.min(50, v);
      updateAll();
    }
  });

  // Export policy
  document.querySelectorAll('[data-policy]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.exportPolicy = btn.dataset.policy;
      updateAll();
    });
  });

  // Battery toggle
  document.querySelectorAll('[data-batt]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.battery = btn.dataset.batt === 'true';
      updateAll();
    });
  });

  // Grid price
  document.getElementById('ctrl-price-range')?.addEventListener('input', (e) => {
    state.gridPriceUsdPerKwh = Number(e.target.value);
    updateAll();
  });
  document.getElementById('ctrl-price-num')?.addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    if (!Number.isNaN(v) && v >= 0) {
      state.gridPriceUsdPerKwh = Math.min(5, v);
      updateAll();
    }
  });

  // Discount rate
  document.getElementById('ctrl-disc-range')?.addEventListener('input', (e) => {
    state.discountRatePct = Number(e.target.value);
    updateAll();
  });
  document.getElementById('ctrl-disc-num')?.addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    if (!Number.isNaN(v) && v >= -10 && v <= 50) {
      state.discountRatePct = v;
      updateAll();
    }
  });

  // Presets
  document.querySelectorAll('.preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const p = PRESETS[btn.dataset.preset];
      if (p) {
        state = { ...p };
        updateAll();
      }
    });
  });

  // Representative day tabs
  document.querySelectorAll('.day-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      selectedDayKey = tab.dataset.day;
      document.querySelectorAll('.day-tab').forEach((t) => t.classList.toggle('active', t === tab));
      if (latestDetailed) {
        const dailyEl = document.getElementById('chart-daily');
        if (dailyEl) renderDailyChart(dailyEl, latestDetailed.dailyProfiles[selectedDayKey], state);
      }
    });
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      bindEvents();
      updateAll();
    });
  } else {
    bindEvents();
    updateAll();
  }
}
