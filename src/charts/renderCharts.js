import { evaluateFastSummary } from '../model/saunaModel.js';

const COLORS = {
  solarLine: '#B45309',
  direct: '#D97706',
  battery: '#0F766E',
  batteryLight: '#14B8A6',
  loss: '#94A3B8',
  export: '#4B7BEC',
  exportFill: 'rgba(75, 123, 236, 0.24)',
  grid: '#C2410C',
  loadLine: '#181614',
  positive: '#15803D',
  negative: '#B91C1C',
  ink: '#181614',
  muted: '#6E665C',
  gridLine: '#E6DFD3',
  zeroLine: '#8C8275',
};

function fmtNum(n, digits = 1) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return Number(n).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function fmtUsd(n, digits = 0) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const sign = n < 0 ? '−$' : '$';
  return (
    sign +
    Math.abs(n).toLocaleString('en-US', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    })
  );
}

function attachChartTooltip(wrapper, svg, hitCallback) {
  let tip = wrapper.querySelector('.chart-tooltip');
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'chart-tooltip';
    tip.setAttribute('aria-hidden', 'true');
    wrapper.appendChild(tip);
  }

  const handleMove = (clientX, clientY) => {
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const relX = (clientX - rect.left) / rect.width;
    const relY = (clientY - rect.top) / rect.height;
    const result = hitCallback(relX, relY);
    if (!result) {
      tip.classList.remove('visible');
      return;
    }
    tip.innerHTML = result.html;
    tip.classList.add('visible');

    const wrapRect = wrapper.getBoundingClientRect();
    const px = clientX - wrapRect.left;
    const py = clientY - wrapRect.top;
    const tipW = tip.offsetWidth || 210;
    const tipH = tip.offsetHeight || 90;
    let left = px + 14;
    if (left + tipW > wrapRect.width - 8) {
      left = Math.max(8, px - tipW - 14);
    }
    let top = Math.max(8, Math.min(wrapRect.height - tipH - 8, py - tipH * 0.5));
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  };

  svg.addEventListener('mousemove', (e) => handleMove(e.clientX, e.clientY));
  svg.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches && e.touches[0]) {
        handleMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    },
    { passive: true }
  );
  svg.addEventListener('mouseleave', () => {
    tip.classList.remove('visible');
  });
}

/**
 * 1. 24-Hour Quarter-Hour Power Dispatch (+ Synchronized Battery SOC Panel when battery is on)
 */
export function renderDailyChart(wrapper, dayProfile, inputs) {
  const { intervals, isSaunaDay } = dayProfile;
  const hasBatt = inputs.battery;

  const W = 820;
  const H = hasBatt ? 445 : 330;
  const padL = 54;
  const padR = 24;
  const padT = 26;
  const topH = 245;
  const plotW = W - padL - padR;

  const maxSolar = Math.max(...intervals.map((d) => d.solarKw), 1);
  const maxY = Math.max(8.8, Math.ceil(maxSolar * 1.12));

  const xOfQ = (q) => padL + (q / 96) * plotW;
  const yOfKw = (kw) => padT + topH - (Math.min(kw, maxY) / maxY) * topH;

  // Build step bars for each 15-min interval
  const barW = plotW / 96 + 0.35;
  let barsSvg = '';

  for (let q = 0; q < 96; q++) {
    const d = intervals[q];
    const x = xOfQ(q);

    if (d.saunaKw > 0) {
      // Stack how sauna load is served: Direct Solar -> Battery Discharge -> Grid Import
      let curKw = 0;
      const drawSeg = (dkw, fill) => {
        if (dkw <= 0.001) return;
        const y1 = yOfKw(curKw + dkw);
        const y2 = yOfKw(curKw);
        barsSvg += `<rect x="${x.toFixed(2)}" y="${y1.toFixed(2)}" width="${barW.toFixed(2)}" height="${Math.max(0.5, y2 - y1).toFixed(2)}" fill="${fill}" />`;
        curKw += dkw;
      };
      drawSeg(d.directKw, COLORS.direct);
      drawSeg(d.batteryDischargeKw, COLORS.battery);
      drawSeg(d.gridImportKw, COLORS.grid);

      // Any surplus solar above sauna load (rare, e.g. huge array at 6:30pm June)
      let sCur = d.saunaKw;
      if (d.batteryChargeKw > 0.001) {
        const y1 = yOfKw(sCur + d.batteryChargeKw);
        const y2 = yOfKw(sCur);
        barsSvg += `<rect x="${x.toFixed(2)}" y="${y1.toFixed(2)}" width="${barW.toFixed(2)}" height="${(y2 - y1).toFixed(2)}" fill="rgba(20,184,166,0.45)" />`;
        sCur += d.batteryChargeKw;
      }
      if (d.exportKw > 0.001) {
        const y1 = yOfKw(sCur + d.exportKw);
        const y2 = yOfKw(sCur);
        barsSvg += `<rect x="${x.toFixed(2)}" y="${y1.toFixed(2)}" width="${barW.toFixed(2)}" height="${(y2 - y1).toFixed(2)}" fill="${COLORS.exportFill}" />`;
      }
    } else if (d.solarKw > 0.001) {
      let curKw = 0;
      if (d.batteryChargeKw > 0.001) {
        const y1 = yOfKw(d.batteryChargeKw);
        const y2 = yOfKw(0);
        barsSvg += `<rect x="${x.toFixed(2)}" y="${y1.toFixed(2)}" width="${barW.toFixed(2)}" height="${(y2 - y1).toFixed(2)}" fill="rgba(15,118,110,0.42)" />`;
        curKw += d.batteryChargeKw;
      }
      if (d.exportKw > 0.001) {
        const y1 = yOfKw(curKw + d.exportKw);
        const y2 = yOfKw(curKw);
        barsSvg += `<rect x="${x.toFixed(2)}" y="${y1.toFixed(2)}" width="${barW.toFixed(2)}" height="${(y2 - y1).toFixed(2)}" fill="${COLORS.exportFill}" />`;
      }
    }
  }

  // Solar curve path & Sauna step path
  let solarPath = '';
  let loadPath = '';
  for (let q = 0; q < 96; q++) {
    const d = intervals[q];
    const x1 = xOfQ(q);
    const x2 = xOfQ(q + 1);
    const xm = 0.5 * (x1 + x2);
    const ys = yOfKw(d.solarKw);
    solarPath += q === 0 ? `M ${xm.toFixed(2)} ${ys.toFixed(2)}` : ` L ${xm.toFixed(2)} ${ys.toFixed(2)}`;

    const yl = yOfKw(d.saunaKw);
    loadPath += q === 0 ? `M ${x1.toFixed(2)} ${yl.toFixed(2)} L ${x2.toFixed(2)} ${yl.toFixed(2)}` : ` L ${x1.toFixed(2)} ${yl.toFixed(2)} L ${x2.toFixed(2)} ${yl.toFixed(2)}`;
  }

  // Y-axis grid ticks
  const yStep = maxY > 12 ? 4 : 2;
  let yTicksSvg = '';
  for (let kw = 0; kw <= maxY; kw += yStep) {
    const y = yOfKw(kw);
    yTicksSvg += `
      <line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" stroke="${kw === 0 ? COLORS.zeroLine : COLORS.gridLine}" stroke-width="${kw === 0 ? 1.2 : 1}" />
      <text x="${padL - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end" class="svg-tick">${kw} kW</text>
    `;
  }

  // X-axis hour ticks
  const hourMarks = [0, 3, 6, 9, 12, 15, 18, 21, 24];
  const hourLabels = ['12a', '3a', '6a', '9a', '12p', '3p', '6p', '9p', '12a'];
  const bottomAxisY = hasBatt ? padT + topH + 122 : padT + topH;
  let xTicksSvg = '';
  hourMarks.forEach((hr, idx) => {
    const x = padL + (hr / 24) * plotW;
    xTicksSvg += `
      <line x1="${x.toFixed(1)}" y1="${padT}" x2="${x.toFixed(1)}" y2="${bottomAxisY.toFixed(1)}" stroke="rgba(228,221,208,0.55)" stroke-dasharray="2,3" />
      <text x="${x.toFixed(1)}" y="${(bottomAxisY + 18).toFixed(1)}" text-anchor="middle" class="svg-tick">${hourLabels[idx]}</text>
    `;
  });

  // Sauna window highlight band (6:30 pm - 8:00 pm -> q=74..80)
  let saunaBandSvg = '';
  if (isSaunaDay) {
    const sx1 = xOfQ(74);
    const sx2 = xOfQ(80);
    saunaBandSvg = `
      <rect x="${sx1.toFixed(1)}" y="${padT}" width="${(sx2 - sx1).toFixed(1)}" height="${topH}" fill="rgba(194, 65, 12, 0.06)" />
      <text x="${(sx1 - 6).toFixed(1)}" y="${(yOfKw(8) - 7).toFixed(1)}" text-anchor="end" class="svg-annot-strong">6:30 pm · 8 kW preheat (45m) → 4 kW session</text>
    `;
  } else {
    saunaBandSvg = `
      <text x="${(xOfQ(76)).toFixed(1)}" y="${(padT + 26).toFixed(1)}" text-anchor="middle" class="svg-annot">Sauna off today (Wed) — solar exports or recharges battery</text>
    `;
  }

  // 5 kW battery discharge cap line if battery enabled
  let battCapSvg = '';
  let socPanelSvg = '';
  if (hasBatt) {
    const y5 = yOfKw(5);
    battCapSvg = `
      <line x1="${padL}" y1="${y5.toFixed(1)}" x2="${W - padR}" y2="${y5.toFixed(1)}" stroke="${COLORS.battery}" stroke-width="1.3" stroke-dasharray="5,4" />
      <text x="${padL + 8}" y="${(y5 - 6).toFixed(1)}" class="svg-annot-teal">5.0 kW max battery charge / discharge ceiling</text>
    `;

    // Bottom SOC panel
    const socTop = padT + topH + 34;
    const socH = 88;
    const yOfSoc = (s) => socTop + socH - (Math.min(Math.max(s, 0), 13.5) / 13.5) * socH;

    let socArea = `M ${xOfQ(0).toFixed(2)} ${yOfSoc(0).toFixed(2)}`;
    let socLine = '';
    for (let q = 0; q < 96; q++) {
      const xm = xOfQ(q + 0.5);
      const ys = yOfSoc(intervals[q].socKwh);
      socArea += ` L ${xm.toFixed(2)} ${ys.toFixed(2)}`;
      socLine += q === 0 ? `M ${xm.toFixed(2)} ${ys.toFixed(2)}` : ` L ${xm.toFixed(2)} ${ys.toFixed(2)}`;
    }
    socArea += ` L ${xOfQ(95.5).toFixed(2)} ${yOfSoc(0).toFixed(2)} Z`;

    socPanelSvg = `
      <text x="${padL}" y="${socTop - 9}" class="svg-panel-label">Battery Usable Charge (kWh · 13.5 kWh capacity)</text>
      <line x1="${padL}" y1="${socTop}" x2="${W - padR}" y2="${socTop}" stroke="${COLORS.gridLine}" />
      <line x1="${padL}" y1="${(socTop + socH * 0.5).toFixed(1)}" x2="${W - padR}" y2="${(socTop + socH * 0.5).toFixed(1)}" stroke="${COLORS.gridLine}" />
      <line x1="${padL}" y1="${socTop + socH}" x2="${W - padR}" y2="${socTop + socH}" stroke="${COLORS.zeroLine}" stroke-width="1.1" />
      <text x="${padL - 8}" y="${socTop + 4}" text-anchor="end" class="svg-tick">13.5</text>
      <text x="${padL - 8}" y="${(socTop + socH * 0.5 + 4).toFixed(1)}" text-anchor="end" class="svg-tick">6.8</text>
      <text x="${padL - 8}" y="${socTop + socH + 4}" text-anchor="end" class="svg-tick">0</text>
      <path d="${socArea}" fill="rgba(15, 118, 110, 0.16)" />
      <path d="${socLine}" fill="none" stroke="${COLORS.battery}" stroke-width="2.2" />
    `;
  }

  wrapper.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" class="editorial-svg" role="img" aria-label="24-hour power dispatch chart">
      ${xTicksSvg}
      ${yTicksSvg}
      ${saunaBandSvg}
      ${barsSvg}
      ${battCapSvg}
      <path d="${solarPath}" fill="none" stroke="${COLORS.solarLine}" stroke-width="2.2" stroke-linejoin="round" />
      <path d="${loadPath}" fill="none" stroke="${COLORS.loadLine}" stroke-width="2" />
      ${socPanelSvg}
      <line class="hover-guide" x1="0" y1="${padT}" x2="0" y2="${bottomAxisY}" stroke="#181614" stroke-width="1" stroke-dasharray="3,3" opacity="0" />
    </svg>
    <div class="chart-tooltip" aria-hidden="true"></div>
  `;

  const svg = wrapper.querySelector('svg');
  const guide = svg.querySelector('.hover-guide');

  attachChartTooltip(wrapper, svg, (relX) => {
    const svgX = relX * W;
    if (svgX < padL || svgX > W - padR) {
      guide.setAttribute('opacity', '0');
      return null;
    }
    const q = Math.min(95, Math.max(0, Math.floor(((svgX - padL) / plotW) * 96)));
    const d = intervals[q];
    const gx = xOfQ(q + 0.5);
    guide.setAttribute('x1', gx.toFixed(1));
    guide.setAttribute('x2', gx.toFixed(1));
    guide.setAttribute('opacity', '0.65');

    let rows = `
      <div class="tt-head">${d.timeLabel} wall clock</div>
      <div class="tt-row"><span>Roof Solar:</span><strong>${fmtNum(d.solarKw, 2)} kW</strong></div>
      <div class="tt-row"><span>Sauna Heater:</span><strong>${fmtNum(d.saunaKw, 2)} kW</strong></div>
    `;
    if (d.directKw > 0.001) {
      rows += `<div class="tt-row tt-amber"><span>Direct PV → Sauna:</span><strong>${fmtNum(d.directKw, 2)} kW</strong></div>`;
    }
    if (hasBatt && d.batteryChargeKw > 0.001) {
      rows += `<div class="tt-row tt-teal"><span>Charging Battery:</span><strong>${fmtNum(d.batteryChargeKw, 2)} kW</strong></div>`;
    }
    if (hasBatt && d.batteryDischargeKw > 0.001) {
      rows += `<div class="tt-row tt-teal"><span>Battery → Sauna:</span><strong>${fmtNum(d.batteryDischargeKw, 2)} kW</strong></div>`;
    }
    if (d.gridImportKw > 0.001) {
      rows += `<div class="tt-row tt-rust"><span>Grid → Sauna:</span><strong>${fmtNum(d.gridImportKw, 2)} kW</strong></div>`;
    }
    if (d.exportKw > 0.001) {
      rows += `<div class="tt-row tt-blue"><span>Exported to Grid:</span><strong>${fmtNum(d.exportKw, 2)} kW</strong></div>`;
    }
    if (hasBatt) {
      rows += `<div class="tt-row"><span>Battery SOC:</span><strong>${fmtNum(d.socKwh, 2)} kWh</strong></div>`;
    }
    return { html: rows };
  });
}

/**
 * 2. Year 1 Energy Flow & Bill Waterfall Diagram
 */
export function renderEnergyAndMoneyFlows(wrapper, detailedResult) {
  const { summary, year1Dispatch, year1Settlement, inputs } = detailedResult;
  const W = 820;
  const H = 338;

  // Left half (0..420): Proportional stacked energy bars with flow connectors
  const solarTotal = Math.max(summary.annualSolarKwh, 0.01);
  const saunaTotal = summary.annualSaunaKwh; // 1872
  const scaleMax = Math.max(solarTotal, saunaTotal, 2000);
  const maxBarH = 192;
  const baseY = 266;

  // Solar segments (bottom to top: Direct -> Battery Delivered -> Battery Loss -> Exported)
  const sDirect = (summary.directSolarKwh / scaleMax) * maxBarH;
  const sBatt = (summary.batteryKwh / scaleMax) * maxBarH;
  const sLoss = (year1Dispatch.batteryLossKwh / scaleMax) * maxBarH;
  const sExp = (summary.exportedKwh / scaleMax) * maxBarH;

  // Sauna segments (bottom to top: Direct -> Battery -> Grid Import)
  const lDirect = sDirect;
  const lBatt = sBatt;
  const lGrid = (summary.gridKwh / scaleMax) * maxBarH;

  const ribbon = (x1, y1Top, y1Bot, x2, y2Top, y2Bot, fill) => {
    if (y1Bot - y1Top < 0.4 && y2Bot - y2Top < 0.4) return '';
    const cx = 0.5 * (x1 + x2);
    return `<path d="M ${x1} ${y1Top.toFixed(1)} C ${cx} ${y1Top.toFixed(1)}, ${cx} ${y2Top.toFixed(1)}, ${x2} ${y2Top.toFixed(1)} L ${x2} ${y2Bot.toFixed(1)} C ${cx} ${y2Bot.toFixed(1)}, ${cx} ${y1Bot.toFixed(1)}, ${x1} ${y1Bot.toFixed(1)} Z" fill="${fill}" />`;
  };

  const sx = 46;
  const sw = 44;
  const lx = 266;
  const lw = 44;

  // Build solar stack from baseY upward
  const syDirectBot = baseY;
  const syDirectTop = syDirectBot - sDirect;
  const syBattBot = syDirectTop;
  const syBattTop = syBattBot - sBatt;
  const syLossBot = syBattTop;
  const syLossTop = syLossBot - sLoss;
  const syExpBot = syLossTop;
  const syExpTop = syExpBot - sExp;

  // Build sauna stack from baseY upward
  const lyDirectBot = baseY;
  const lyDirectTop = lyDirectBot - lDirect;
  const lyBattBot = lyDirectTop;
  const lyBattTop = lyBattBot - lBatt;
  const lyGridBot = lyBattTop;
  const lyGridTop = lyGridBot - lGrid;

  const pctSaunaNonGrid = ((summary.directSolarKwh + summary.batteryKwh) / saunaTotal) * 100;

  // Right half (442..804): Year 1 Dollar Bill Waterfall
  const baseBill = year1Settlement.baselineBillUsd;
  const retailVal = year1Settlement.retailOffsetKwh * inputs.gridPriceUsdPerKwh;
  const exportVal = year1Settlement.surplusExportKwh * 0.04;
  const yr1Sav = summary.year1SavingsUsd;
  const netBill = year1Settlement.postSolarBillUsd;

  const maxPosDollar = Math.max(baseBill, retailVal, exportVal, yr1Sav, netBill, 100) * 1.16;
  const maxNegDollar = Math.max(0, -netBill) * 1.2;
  const totalDollarSpan = maxPosDollar + Math.max(45, maxNegDollar);
  const dPlotTop = 64;
  const dPlotH = 202;
  const dZeroY = dPlotTop + (maxPosDollar / totalDollarSpan) * dPlotH;
  const yOfUsd = (usd) => dZeroY - (usd / totalDollarSpan) * dPlotH;

  const cols = [
    {
      label: 'Baseline',
      sub: 'No Solar',
      val: baseBill,
      y1: yOfUsd(baseBill),
      y2: dZeroY,
      fill: '#94A3B8',
    },
    {
      label: inputs.exportPolicy === 'net-metering' ? '1:1 Offset' : 'Self-Used',
      sub: `@ ${fmtUsd(inputs.gridPriceUsdPerKwh, 2)}`,
      val: retailVal,
      y1: yOfUsd(retailVal),
      y2: dZeroY,
      fill: inputs.battery ? COLORS.battery : COLORS.direct,
    },
    {
      label: 'Exports',
      sub: '@ $0.04/kWh',
      val: exportVal,
      y1: yOfUsd(exportVal),
      y2: dZeroY,
      fill: COLORS.export,
    },
    {
      label: 'Yr 1 Saved',
      sub: 'Cash Inflow',
      val: yr1Sav,
      y1: yOfUsd(yr1Sav),
      y2: dZeroY,
      fill: COLORS.positive,
    },
    {
      label: 'New Bill',
      sub: netBill < 0 ? 'Net Credit' : 'Paid to Grid',
      val: netBill,
      y1: netBill >= 0 ? yOfUsd(netBill) : dZeroY,
      y2: netBill >= 0 ? dZeroY : Math.min(266, yOfUsd(netBill)),
      fill: netBill <= 0 ? COLORS.positive : COLORS.grid,
    },
  ];

  let moneyBarsSvg = '';
  cols.forEach((c, idx) => {
    const bx = 454 + idx * 70;
    const bw = 44;
    const h = Math.max(1.5, Math.abs(c.y2 - c.y1));
    const top = Math.min(c.y1, c.y2);
    // Keep value label above bar or cleanly above axis labels
    const labelY = c.val >= 0 ? top - 7 : Math.min(280, top + h + 13);
    moneyBarsSvg += `
      <rect x="${bx}" y="${top.toFixed(1)}" width="${bw}" height="${h.toFixed(1)}" rx="2" fill="${c.fill}" />
      <text x="${bx + bw / 2}" y="${labelY.toFixed(1)}" text-anchor="middle" class="svg-bar-val">${fmtUsd(c.val, 0)}</text>
      <text x="${bx + bw / 2}" y="298" text-anchor="middle" class="svg-tick-bold">${c.label}</text>
      <text x="${bx + bw / 2}" y="312" text-anchor="middle" class="svg-tick-sm">${c.sub}</text>
    `;
  });

  // Avoid overlap between export callout and Sauna Use top label (y = lyGridTop - 8)
  const expMidY = Math.max(66, 0.5 * (syExpTop + syExpBot) + 4);
  const safeExpY = Math.abs(expMidY - (lyGridTop - 8)) < 16 ? Math.max(62, lyGridTop - 24) : expMidY;

  wrapper.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" class="editorial-svg" role="img" aria-label="Year 1 energy and dollar ledger">
      <!-- Left Title -->
      <text x="18" y="22" class="svg-panel-title">A. Year 1 Physical Energy Balance (kWh)</text>
      <text x="18" y="39" class="svg-annot">${fmtNum(pctSaunaNonGrid, 1)}% of sauna heat from roof/battery; ${fmtNum(100 - pctSaunaNonGrid, 1)}% imported from grid.</text>

      <!-- Connecting Ribbons -->
      ${ribbon(sx + sw, syDirectTop, syDirectBot, lx, lyDirectTop, lyDirectBot, 'rgba(217, 119, 6, 0.28)')}
      ${ribbon(sx + sw, syBattTop, syBattBot, lx, lyBattTop, lyBattBot, 'rgba(15, 118, 110, 0.26)')}

      <!-- Solar Column -->
      <rect x="${sx}" y="${syExpTop.toFixed(1)}" width="${sw}" height="${Math.max(0, sExp).toFixed(1)}" fill="${COLORS.export}" />
      <rect x="${sx}" y="${syLossTop.toFixed(1)}" width="${sw}" height="${Math.max(0, sLoss).toFixed(1)}" fill="${COLORS.loss}" />
      <rect x="${sx}" y="${syBattTop.toFixed(1)}" width="${sw}" height="${Math.max(0, sBatt).toFixed(1)}" fill="${COLORS.battery}" />
      <rect x="${sx}" y="${syDirectTop.toFixed(1)}" width="${sw}" height="${Math.max(0.8, sDirect).toFixed(1)}" fill="${COLORS.direct}" />
      <line x1="28" y1="${baseY}" x2="395" y2="${baseY}" stroke="${COLORS.zeroLine}" stroke-width="1.1" />

      <text x="${sx + sw / 2}" y="${Math.max(56, syExpTop - 8).toFixed(1)}" text-anchor="middle" class="svg-bar-val">${fmtNum(summary.annualSolarKwh, 0)} kWh</text>
      <text x="${sx + sw / 2}" y="298" text-anchor="middle" class="svg-tick-bold">Roof Solar</text>
      <text x="${sx + sw / 2}" y="312" text-anchor="middle" class="svg-tick-sm">${fmtNum(inputs.arrayKw, 2)} kW array</text>

      <!-- Export callout arrow -->
      ${
        summary.exportedKwh > 1
          ? `<text x="${sx + sw + 8}" y="${safeExpY.toFixed(1)}" class="svg-annot-blue">↗ ${fmtNum(summary.exportedKwh, 0)} kWh exported (${fmtNum((summary.exportedKwh / solarTotal) * 100, 0)}%)</text>`
          : ''
      }
      ${
        year1Dispatch.batteryLossKwh > 1
          ? `<text x="${sx + sw + 8}" y="${Math.max(82, syLossTop + 3).toFixed(1)}" class="svg-annot">⊗ ${fmtNum(year1Dispatch.batteryLossKwh, 0)} kWh 10% loss</text>`
          : ''
      }

      <!-- Sauna Column -->
      <rect x="${lx}" y="${lyGridTop.toFixed(1)}" width="${lw}" height="${Math.max(0, lGrid).toFixed(1)}" fill="${COLORS.grid}" />
      <rect x="${lx}" y="${lyBattTop.toFixed(1)}" width="${lw}" height="${Math.max(0, lBatt).toFixed(1)}" fill="${COLORS.battery}" />
      <rect x="${lx}" y="${lyDirectTop.toFixed(1)}" width="${lw}" height="${Math.max(0.8, lDirect).toFixed(1)}" fill="${COLORS.direct}" />

      <text x="${lx + lw / 2}" y="${(lyGridTop - 8).toFixed(1)}" text-anchor="middle" class="svg-bar-val">1,872 kWh</text>
      <text x="${lx + lw / 2}" y="298" text-anchor="middle" class="svg-tick-bold">Sauna Use</text>
      <text x="${lx + lw / 2}" y="312" text-anchor="middle" class="svg-tick-sm">208 nights × 9 kWh</text>

      <text x="${lx + lw + 8}" y="${(0.5 * (lyGridTop + lyGridBot) + 4).toFixed(1)}" class="svg-annot-rust">${fmtNum(summary.gridKwh, 0)} kWh grid</text>
      ${
        summary.batteryKwh > 1
          ? `<text x="${lx + lw + 8}" y="${(0.5 * (lyBattTop + lyBattBot) + 4).toFixed(1)}" class="svg-annot-teal">${fmtNum(summary.batteryKwh, 0)} kWh batt</text>`
          : ''
      }
      <text x="${lx + lw + 8}" y="${(baseY - 2).toFixed(1)}" class="svg-annot-amber">${fmtNum(summary.directSolarKwh, 1)} kWh direct</text>

      <!-- Divider -->
      <line x1="426" y1="14" x2="426" y2="322" stroke="${COLORS.gridLine}" stroke-width="1.2" />

      <!-- Right Title -->
      <text x="446" y="22" class="svg-panel-title">B. Year 1 Billing Settlement (${inputs.exportPolicy === 'net-metering' ? 'Net Metering' : 'Net Billing'})</text>
      <text x="446" y="39" class="svg-annot">${fmtUsd(baseBill, 0)} baseline → ${fmtUsd(netBill, 0)} new bill (${fmtUsd(yr1Sav, 0)} saved in Yr 1).</text>

      <line x1="444" y1="${dZeroY.toFixed(1)}" x2="804" y2="${dZeroY.toFixed(1)}" stroke="${COLORS.zeroLine}" stroke-width="1.1" />
      ${moneyBarsSvg}
    </svg>
  `;
}

/**
 * 3. Monthly Supply vs Demand Chart (Jan - Dec)
 */
export function renderMonthlyChart(wrapper, monthly, inputs) {
  const W = 820;
  const H = 305;
  const padL = 52;
  const padR = 20;
  const padT = 26;
  const padB = 40;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const maxVal = Math.max(
    220,
    ...monthly.map((m) => Math.max(m.solarKwh, m.saunaKwh))
  ) * 1.12;

  const yOf = (v) => padT + plotH - (v / maxVal) * plotH;

  let gridSvg = '';
  const step = maxVal > 900 ? 250 : maxVal > 450 ? 100 : 50;
  for (let v = 0; v <= maxVal; v += step) {
    const y = yOf(v);
    gridSvg += `
      <line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" stroke="${v === 0 ? COLORS.zeroLine : COLORS.gridLine}" />
      <text x="${padL - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end" class="svg-tick">${v}</text>
    `;
  }

  const groupW = plotW / 12;
  const barW = Math.min(20, groupW * 0.34);
  let barsSvg = '';

  monthly.forEach((m, idx) => {
    const cx = padL + (idx + 0.5) * groupW;
    const xSol = cx - barW - 2;
    const xSau = cx + 2;

    // Left bar: Solar generation stacked (Direct -> Battery+Loss -> Export)
    const drawStack = (x, segs) => {
      let cur = 0;
      segs.forEach(([val, fill]) => {
        if (val <= 0.01) return;
        const y1 = yOf(cur + val);
        const y2 = yOf(cur);
        barsSvg += `<rect x="${x.toFixed(1)}" y="${y1.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(0.7, y2 - y1).toFixed(1)}" fill="${fill}" />`;
        cur += val;
      });
    };

    drawStack(xSol, [
      [m.directSolarKwh, COLORS.direct],
      [m.batteryKwh, COLORS.battery],
      [m.batteryLossKwh, COLORS.loss],
      [m.exportedKwh, 'rgba(75, 123, 236, 0.72)'],
    ]);

    // Right bar: Sauna demand stacked (Direct -> Battery -> Grid)
    drawStack(xSau, [
      [m.directSolarKwh, COLORS.direct],
      [m.batteryKwh, COLORS.battery],
      [m.gridKwh, COLORS.grid],
    ]);

    barsSvg += `<text x="${cx.toFixed(1)}" y="${H - 15}" text-anchor="middle" class="svg-tick-bold">${m.month}</text>`;
  });

  wrapper.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" class="editorial-svg" role="img" aria-label="Monthly solar generation vs sauna use">
      <text x="${padL}" y="16" class="svg-annot">kWh/month · Left bar: Roof Solar Supply | Right bar: Sauna Demand</text>
      ${gridSvg}
      ${barsSvg}
    </svg>
    <div class="chart-tooltip" aria-hidden="true"></div>
  `;

  const svg = wrapper.querySelector('svg');
  attachChartTooltip(wrapper, svg, (relX) => {
    const svgX = relX * W;
    if (svgX < padL || svgX > W - padR) return null;
    const idx = Math.min(11, Math.max(0, Math.floor(((svgX - padL) / plotW) * 12)));
    const m = monthly[idx];
    return {
      html: `
        <div class="tt-head">${m.month} 2027 (Year 1)</div>
        <div class="tt-row"><span>Roof Solar Total:</span><strong>${fmtNum(m.solarKwh, 1)} kWh</strong></div>
        <div class="tt-row tt-blue"><span>↳ Exported to Grid:</span><strong>${fmtNum(m.exportedKwh, 1)} kWh</strong></div>
        <div class="tt-row"><span>Sauna Total Use:</span><strong>${fmtNum(m.saunaKwh, 1)} kWh</strong></div>
        <div class="tt-row tt-amber"><span>↳ Direct from Roof:</span><strong>${fmtNum(m.directSolarKwh, 1)} kWh</strong></div>
        ${inputs.battery ? `<div class="tt-row tt-teal"><span>↳ From Battery:</span><strong>${fmtNum(m.batteryKwh, 1)} kWh</strong></div>` : ''}
        <div class="tt-row tt-rust"><span>↳ From Utility Grid:</span><strong>${fmtNum(m.gridKwh, 1)} kWh</strong></div>
      `,
    };
  });
}

/**
 * 4. 25-Year Cumulative Cash Flow Chart (Nominal vs Discounted Present Value)
 */
export function renderCashflowChart(wrapper, yearlySchedule, summary, inputs) {
  const W = 820;
  const H = 335;
  const padL = 68;
  const padR = 26;
  const padT = 28;
  const padB = 42;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const allVals = [0];
  yearlySchedule.forEach((r) => {
    allVals.push(r.cumNominalUsd, r.cumDiscountedUsd);
  });
  const minV = Math.min(...allVals) * 1.12;
  const maxV = Math.max(...allVals, 1500) * 1.15;
  const span = Math.max(1000, maxV - minV);

  const xOfYr = (yr) => padL + (yr / 25) * plotW;
  const yOfUsd = (v) => padT + plotH - ((v - minV) / span) * plotH;
  const yZero = yOfUsd(0);

  // Nice tick spacing
  const rawStep = span / 6;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const tickStep = (norm > 5 ? 10 : norm > 2 ? 5 : norm > 1 ? 2 : 1) * mag;

  let gridSvg = '';
  const firstTick = Math.ceil(minV / tickStep) * tickStep;
  for (let v = firstTick; v <= maxV; v += tickStep) {
    if (Math.abs(v) < 1e-6) continue;
    const y = yOfUsd(v);
    gridSvg += `
      <line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" stroke="${COLORS.gridLine}" />
      <text x="${padL - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end" class="svg-tick">${fmtUsd(v, 0)}</text>
    `;
  }
  // Zero line
  gridSvg += `
    <line x1="${padL}" y1="${yZero.toFixed(1)}" x2="${W - padR}" y2="${yZero.toFixed(1)}" stroke="${COLORS.zeroLine}" stroke-width="1.5" />
    <text x="${padL - 8}" y="${(yZero + 4).toFixed(1)}" text-anchor="end" class="svg-tick-bold">$0</text>
  `;

  let xTicksSvg = '';
  for (let yr = 0; yr <= 25; yr += 5) {
    const x = xOfYr(yr);
    xTicksSvg += `
      <line x1="${x.toFixed(1)}" y1="${padT}" x2="${x.toFixed(1)}" y2="${padT + plotH}" stroke="rgba(228,221,208,0.5)" stroke-dasharray="2,3" />
      <text x="${x.toFixed(1)}" y="${H - 18}" text-anchor="middle" class="svg-tick">Yr ${yr}</text>
      <text x="${x.toFixed(1)}" y="${H - 5}" text-anchor="middle" class="svg-tick-sm">${2027 + yr}</text>
    `;
  }

  let nomPath = '';
  let discPath = '';
  let discArea = `M ${xOfYr(0).toFixed(1)} ${yZero.toFixed(1)}`;

  yearlySchedule.forEach((r, idx) => {
    const x = xOfYr(r.year);
    const yn = yOfUsd(r.cumNominalUsd);
    const yd = yOfUsd(r.cumDiscountedUsd);
    nomPath += idx === 0 ? `M ${x.toFixed(1)} ${yn.toFixed(1)}` : ` L ${x.toFixed(1)} ${yn.toFixed(1)}`;
    discPath += idx === 0 ? `M ${x.toFixed(1)} ${yd.toFixed(1)}` : ` L ${x.toFixed(1)} ${yd.toFixed(1)}`;
    discArea += ` L ${x.toFixed(1)} ${yd.toFixed(1)}`;
  });
  discArea += ` L ${xOfYr(25).toFixed(1)} ${yZero.toFixed(1)} Z`;

  const mainStroke = summary.npvUsd >= 0 ? COLORS.positive : COLORS.negative;
  const areaFill = summary.npvUsd >= 0 ? 'rgba(21, 128, 61, 0.10)' : 'rgba(185, 28, 28, 0.08)';

  let calloutsSvg = '';
  if (summary.paybackYears !== null) {
    const px = xOfYr(summary.paybackYears);
    calloutsSvg += `
      <circle cx="${px.toFixed(1)}" cy="${yZero.toFixed(1)}" r="4.5" fill="#FFFFFF" stroke="${COLORS.ink}" stroke-width="2" />
      <text x="${Math.min(W - padR - 80, Math.max(padL + 40, px)).toFixed(1)}" y="${(yZero - 10).toFixed(1)}" text-anchor="middle" class="svg-annot-strong">Simple payback: ${fmtNum(summary.paybackYears, 1)} yrs</text>
    `;
  }
  if (inputs.battery) {
    const r13 = yearlySchedule[13];
    const x13 = xOfYr(13);
    const y13 = yOfUsd(r13.cumDiscountedUsd);
    calloutsSvg += `
      <circle cx="${x13.toFixed(1)}" cy="${y13.toFixed(1)}" r="4" fill="${COLORS.negative}" />
      <text x="${(x13 + 8).toFixed(1)}" y="${Math.min(padT + plotH - 8, y13 + 14).toFixed(1)}" class="svg-annot-rust">Yr 13: −$6,000 battery replacement</text>
    `;
  }

  const endRow = yearlySchedule[25];
  const endYDisc = yOfUsd(endRow.cumDiscountedUsd);

  wrapper.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" class="editorial-svg" role="img" aria-label="25-year cumulative cash flow trajectory">
      ${xTicksSvg}
      ${gridSvg}
      <path d="${discArea}" fill="${areaFill}" />
      <path d="${nomPath}" fill="none" stroke="#64748B" stroke-width="2" stroke-dasharray="5,4" />
      <path d="${discPath}" fill="none" stroke="${mainStroke}" stroke-width="2.7" />
      <circle cx="${xOfYr(25).toFixed(1)}" cy="${endYDisc.toFixed(1)}" r="4.5" fill="${mainStroke}" />
      <text x="${(xOfYr(25) - 8).toFixed(1)}" y="${(endYDisc - 9).toFixed(1)}" text-anchor="end" class="svg-annot-strong">NPV: ${fmtUsd(summary.npvUsd, 0)}</text>
      ${calloutsSvg}
      <line class="hover-guide" x1="0" y1="${padT}" x2="0" y2="${padT + plotH}" stroke="#181614" stroke-width="1" stroke-dasharray="3,3" opacity="0" />
    </svg>
    <div class="chart-tooltip" aria-hidden="true"></div>
  `;

  const svg = wrapper.querySelector('svg');
  const guide = svg.querySelector('.hover-guide');
  attachChartTooltip(wrapper, svg, (relX) => {
    const svgX = relX * W;
    if (svgX < padL - 10 || svgX > W - padR + 10) {
      guide.setAttribute('opacity', '0');
      return null;
    }
    const yr = Math.min(25, Math.max(0, Math.round(((svgX - padL) / plotW) * 25)));
    const r = yearlySchedule[yr];
    const gx = xOfYr(yr);
    guide.setAttribute('x1', gx.toFixed(1));
    guide.setAttribute('x2', gx.toFixed(1));
    guide.setAttribute('opacity', '0.65');

    return {
      html: `
        <div class="tt-head">Year ${r.year} (${r.calendarYear})</div>
        ${
          r.year === 0
            ? `<div class="tt-row tt-rust"><span>Upfront Purchase:</span><strong>${fmtUsd(r.netCashFlowUsd, 0)}</strong></div>`
            : `<div class="tt-row"><span>Bill Savings:</span><strong>${fmtUsd(r.billSavingsUsd, 2)}</strong></div>`
        }
        ${r.capexOrReplacementUsd < 0 && r.year > 0 ? `<div class="tt-row tt-rust"><span>Battery Repl.:</span><strong>${fmtUsd(r.capexOrReplacementUsd, 0)}</strong></div>` : ''}
        <div class="tt-row"><span>Year Net Cash Flow:</span><strong>${fmtUsd(r.netCashFlowUsd, 0)}</strong></div>
        <div class="tt-row"><span>Cum. Undiscounted:</span><strong>${fmtUsd(r.cumNominalUsd, 0)}</strong></div>
        <div class="tt-row"><span>Cum. NPV (${fmtNum(inputs.discountRatePct, 1)}%):</span><strong>${fmtUsd(r.cumDiscountedUsd, 0)}</strong></div>
      `,
    };
  });
}

/**
 * 5. NPV vs Array Size Curve (0.5 kW - 10.0 kW) across all 4 Policy/Battery Regimes
 */
export function renderSizingCurveChart(wrapper, inputs, activeSummary, onSelectKw) {
  const W = 820;
  const H = 350;
  const padL = 68;
  const padR = 26;
  const padT = 26;
  const padB = 42;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const sizes = [
    0.5, 0.75, 1.0, 1.2, 1.34, 1.42, 1.5, 1.75, 2.0, 2.15, 2.5, 3.0, 3.5, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0,
  ];

  const regimes = [
    {
      id: 'nm-nobatt',
      label: 'Net Metering · Solar Only',
      exportPolicy: 'net-metering',
      battery: false,
      stroke: COLORS.positive,
      dash: '',
      width: 2.5,
    },
    {
      id: 'nb-nobatt',
      label: 'Net Billing · Solar Only',
      exportPolicy: 'net-billing',
      battery: false,
      stroke: COLORS.grid,
      dash: '6,4',
      width: 2.1,
    },
    {
      id: 'nm-batt',
      label: 'Net Metering · + Battery',
      exportPolicy: 'net-metering',
      battery: true,
      stroke: COLORS.battery,
      dash: '4,3',
      width: 2.0,
    },
    {
      id: 'nb-batt',
      label: 'Net Billing · + Battery',
      exportPolicy: 'net-billing',
      battery: true,
      stroke: '#6D28D9',
      dash: '2,3',
      width: 2.0,
    },
  ];

  const series = regimes.map((reg) => ({
    ...reg,
    pts: sizes.map((kw) => ({
      kw,
      npv: evaluateFastSummary({
        ...inputs,
        arrayKw: kw,
        exportPolicy: reg.exportPolicy,
        battery: reg.battery,
      }).npvUsd,
    })),
  }));

  const allNpvs = [0, activeSummary.npvUsd];
  series.forEach((s) => s.pts.forEach((p) => allNpvs.push(p.npv)));
  const minV = Math.min(...allNpvs) * 1.08;
  const maxV = Math.max(...allNpvs, 2500) * 1.18;
  const span = Math.max(2000, maxV - minV);

  const xOfKw = (kw) => padL + ((Math.min(10, Math.max(0.5, kw)) - 0.5) / 9.5) * plotW;
  const yOfUsd = (v) => padT + plotH - ((v - minV) / span) * plotH;
  const yZero = yOfUsd(0);

  const rawStep = span / 6;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const tickStep = (norm > 5 ? 10 : norm > 2 ? 5 : norm > 1 ? 2 : 1) * mag;

  let gridSvg = '';
  const firstTick = Math.ceil(minV / tickStep) * tickStep;
  for (let v = firstTick; v <= maxV; v += tickStep) {
    if (Math.abs(v) < 1e-6) continue;
    const y = yOfUsd(v);
    gridSvg += `
      <line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" stroke="${COLORS.gridLine}" />
      <text x="${padL - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end" class="svg-tick">${fmtUsd(v, 0)}</text>
    `;
  }
  gridSvg += `
    <rect x="${padL}" y="${padT}" width="${plotW}" height="${Math.max(0, yZero - padT).toFixed(1)}" fill="rgba(21, 128, 61, 0.045)" />
    <line x1="${padL}" y1="${yZero.toFixed(1)}" x2="${W - padR}" y2="${yZero.toFixed(1)}" stroke="${COLORS.zeroLine}" stroke-width="1.5" />
    <text x="${padL - 8}" y="${(yZero + 4).toFixed(1)}" text-anchor="end" class="svg-tick-bold">$0</text>
  `;

  let xTicksSvg = '';
  [0.5, 1.4, 2, 3, 4, 5, 6, 8, 10].forEach((kw) => {
    const x = xOfKw(kw);
    xTicksSvg += `
      <line x1="${x.toFixed(1)}" y1="${padT}" x2="${x.toFixed(1)}" y2="${padT + plotH}" stroke="rgba(228,221,208,0.45)" stroke-dasharray="2,3" />
      <text x="${x.toFixed(1)}" y="${H - 14}" text-anchor="middle" class="svg-tick">${kw === 1.4 ? '1.4*' : kw} kW</text>
    `;
  });

  let pathsSvg = '';
  series.forEach((s) => {
    const isActiveRegime = s.exportPolicy === inputs.exportPolicy && s.battery === inputs.battery;
    let d = '';
    s.pts.forEach((p, idx) => {
      const x = xOfKw(p.kw);
      const y = yOfUsd(p.npv);
      d += idx === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
    });
    pathsSvg += `<path d="${d}" fill="none" stroke="${s.stroke}" stroke-width="${isActiveRegime ? 3.2 : s.width}" ${s.dash && !isActiveRegime ? `stroke-dasharray="${s.dash}"` : ''} opacity="${isActiveRegime ? 1 : 0.72}" />`;
  });

  // Highlight sweet spot kink on Net Metering curve (1.42 kW)
  const kinkPt = series[0].pts.find((p) => p.kw === 1.42);
  const kx = xOfKw(1.42);
  const ky = yOfUsd(kinkPt.npv);

  // Active selection bullseye
  const ax = xOfKw(inputs.arrayKw);
  const ay = yOfUsd(activeSummary.npvUsd);

  wrapper.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" class="editorial-svg clickable-svg" role="img" aria-label="NPV sensitivity to array size across all four regimes">
      ${xTicksSvg}
      ${gridSvg}
      ${pathsSvg}
      <circle cx="${kx.toFixed(1)}" cy="${ky.toFixed(1)}" r="4" fill="#FFFFFF" stroke="${COLORS.positive}" stroke-width="2" />
      <text x="${(kx + 8).toFixed(1)}" y="${Math.max(padT + 14, ky - 8).toFixed(1)}" class="svg-annot-strong">1.42 kW kink (${fmtUsd(kinkPt.npv, 0)} peak NPV)</text>

      <circle cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="8" fill="rgba(24,22,20,0.14)" />
      <circle cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="4.8" fill="${COLORS.ink}" stroke="#FFFFFF" stroke-width="1.8" />
      <text x="${Math.min(W - padR - 10, Math.max(padL + 10, ax + 10)).toFixed(1)}" y="${Math.min(padT + plotH - 8, ay + 16).toFixed(1)}" class="svg-annot-strong">Your size: ${fmtNum(inputs.arrayKw, 2)} kW (${fmtUsd(activeSummary.npvUsd, 0)})</text>

      <line class="hover-guide" x1="0" y1="${padT}" x2="0" y2="${padT + plotH}" stroke="#181614" stroke-width="1" stroke-dasharray="3,3" opacity="0" />
    </svg>
    <div class="chart-tooltip" aria-hidden="true"></div>
  `;

  const svg = wrapper.querySelector('svg');
  const guide = svg.querySelector('.hover-guide');

  svg.addEventListener('click', (e) => {
    if (!onSelectKw) return;
    const rect = svg.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    if (svgX < padL || svgX > W - padR) return;
    const rawKw = 0.5 + ((svgX - padL) / plotW) * 9.5;
    const snapped = Math.round(rawKw * 20) / 20;
    onSelectKw(Math.min(10, Math.max(0.5, snapped)));
  });

  attachChartTooltip(wrapper, svg, (relX) => {
    const svgX = relX * W;
    if (svgX < padL || svgX > W - padR) {
      guide.setAttribute('opacity', '0');
      return null;
    }
    const rawKw = 0.5 + ((svgX - padL) / plotW) * 9.5;
    const kw = Math.round(rawKw * 10) / 10;
    const gx = xOfKw(kw);
    guide.setAttribute('x1', gx.toFixed(1));
    guide.setAttribute('x2', gx.toFixed(1));
    guide.setAttribute('opacity', '0.6');

    const rows = regimes
      .map((reg) => {
        const npv = evaluateFastSummary({
          ...inputs,
          arrayKw: kw,
          exportPolicy: reg.exportPolicy,
          battery: reg.battery,
        }).npvUsd;
        return `<div class="tt-row"><span>${reg.label}:</span><strong>${fmtUsd(npv, 0)}</strong></div>`;
      })
      .join('');

    return {
      html: `
        <div class="tt-head">${fmtNum(kw, 1)} kW Array (${fmtUsd(kw * 3000, 0)} PV CapEx)</div>
        ${rows}
        <div class="tt-foot">Click chart to set array to ${fmtNum(kw, 1)} kW</div>
      `,
    };
  });
}
