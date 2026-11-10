import saunaModel, { DEFAULTS, MODEL_NOTES } from "./model.js";

window.saunaModel = saunaModel;
window.saunaModelNotes = MODEL_NOTES;

const $ = (id) => document.getElementById(id);
const number = (value, digits = 0) =>
  new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
const usd = (value, digits = 0) =>
  `${value < -0.005 ? "−" : ""}$${number(Math.abs(value), digits)}`;
const signedUsd = (value) => `${value > 0.005 ? "+" : ""}${usd(value)}`;
const pct = (value) => `${number(value, 1)}%`;
const shortUsd = (value) =>
  `${value < 0 ? "−" : ""}$${number(Math.abs(value) / 1000, 1)}k`;
const COLORS = {
  solar: "#e7b752",
  green: "#2d493c",
  grid: "#8c9c92",
  battery: "#9cae87",
  exported: "#d8ddca",
  clay: "#aa553c",
  line: "#e0e2d7",
};
let inputs = { ...DEFAULTS };
let current;
let updateTimer;
const narrow = () => window.matchMedia("(max-width: 520px)").matches;
const setText = (id, text) => {
  $(id).textContent = text;
};

function chartFrame(width, height, label, content) {
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${label}"><title>${label}</title>${content}</svg>`;
}

function linePath(values, x, y, key) {
  return values
    .map(
      (d, i) => `${i ? "L" : "M"}${x(d, i).toFixed(2)},${y(d[key]).toFixed(2)}`,
    )
    .join(" ");
}

function dailyChart(model) {
  const w = narrow() ? 440 : 940,
    h = narrow() ? 240 : 260;
  const left = 30,
    right = w - 15,
    top = 27,
    bottom = h - 31;
  const max = Math.max(9, ...model.daily.map((d) => d.solarKw * 1.13));
  const x = (hour) => left + (hour / 24) * (right - left);
  const y = (kw) => bottom - (kw / max) * (bottom - top);
  let content = "";
  for (const v of [0, max > 10 ? 6 : 4, max > 10 ? 12 : 8]) {
    content += `<line x1="${left}" x2="${right}" y1="${y(v)}" y2="${y(v)}" stroke="${COLORS.line}"/><text x="${left - 9}" y="${y(v) + 3}" text-anchor="end">${v}</text>`;
  }
  content += `<rect x="${x(18.5)}" y="${top - 5}" width="${x(20) - x(18.5)}" height="${bottom - top + 5}" fill="#2d493c07"/>`;
  const stepLine = (key) =>
    model.daily
      .map(
        (d, i) =>
          `${i ? "L" : "M"}${x(i / 4)},${y(d[key])} L${x((i + 1) / 4)},${y(d[key])}`,
      )
      .join(" ");
  content += `<path d="M${x(0)},${y(0)} ${stepLine("solarKw").replace(/^M/, "L")} L${x(24)},${y(0)} Z" fill="${COLORS.solar}" fill-opacity=".42" stroke="none"/>`;
  content += `<path d="${stepLine("solarKw")}" fill="none" stroke="${COLORS.solar}" stroke-width="2"/>`;
  content += `<path d="${stepLine("loadKw")}" fill="none" stroke="${COLORS.green}" stroke-width="2"/>`;
  content += `<path d="${stepLine("gridKw")}" fill="none" stroke="${COLORS.grid}" stroke-width="2.3" stroke-dasharray="5 3"/>`;
  if (model.inputs.battery) {
    const points = model.daily.map((d) => ({
      ...d,
      discharge: Math.max(0, d.batteryKw),
    }));
    content += `<path d="${linePath(points, (d) => x(d.hour), y, "discharge")}" fill="none" stroke="${COLORS.battery}" stroke-width="2.5" stroke-dasharray="3 3"/>`;
  }
  content += `<line x1="${x(18.5)}" x2="${x(18.5)}" y1="${top - 4}" y2="${bottom}" stroke="${COLORS.green}" stroke-width=".6" stroke-dasharray="2 4"/><text class="svg-label" x="${x(18.5) - 7}" y="${top - 10}" text-anchor="end">6:30 p.m. · heater on</text>`;
  const ticks = narrow()
    ? [
        [0, "12 a.m."],
        [6, "6 a.m."],
        [12, "Noon"],
        [18, "6 p.m."],
        [24, "12 a.m."],
      ]
    : [
        [0, "Midnight"],
        [4, "4 a.m."],
        [8, "8 a.m."],
        [12, "Noon"],
        [16, "4 p.m."],
        [20, "8 p.m."],
        [24, "Midnight"],
      ];
  for (const [hour, label] of ticks)
    content += `<text x="${x(hour)}" y="${h - 9}" text-anchor="${hour === 0 ? "start" : hour === 24 ? "end" : "middle"}">${label}</text>`;
  for (const d of model.daily) {
    content += `<rect x="${x(d.hour - 0.125)}" y="${top}" width="${(right - left) / 96}" height="${bottom - top}" fill="transparent"><title>${Math.floor(d.hour)}:${d.hour % 1 < 0.25 ? "00" : d.hour % 1 < 0.5 ? "15" : d.hour % 1 < 0.75 ? "30" : "45"} local: solar ${number(d.solarKw, 2)} kW; sauna ${number(d.loadKw, 1)} kW; grid ${number(d.gridKw, 2)} kW; battery ${number(Math.max(0, d.batteryKw), 2)} kW; exports ${number(d.exportKw, 2)} kW</title></rect>`;
  }
  $("daily-chart").innerHTML = chartFrame(
    w,
    h,
    "June 22 quarter-hour power: solar peaks earlier than the 6:30 p.m. sauna session. Grid imports and optional battery discharge serve the shortfall.",
    content,
  );
}

function monthlyChart(model) {
  const w = narrow() ? 440 : 940,
    h = narrow() ? 260 : 280;
  const left = 37,
    right = w - 12,
    top = 22,
    bottom = h - 35;
  const max =
    Math.max(...model.monthly.map((m) => Math.max(m.solarKwh, m.saunaKwh))) *
    1.15;
  const step = (right - left) / 12,
    barWidth = step * 0.52;
  const x = (i) => left + step * (i + 0.5),
    y = (val) => bottom - (val / max) * (bottom - top);
  let content = "";
  const tickStep = max > 1000 ? 500 : max > 500 ? 200 : max > 220 ? 100 : 50;
  for (let v = 0; v < max; v += tickStep)
    content += `<line x1="${left}" x2="${right}" y1="${y(v)}" y2="${y(v)}" stroke="${COLORS.line}"/><text x="${left - 8}" y="${y(v) + 3}" text-anchor="end">${number(v)}</text>`;
  model.monthly.forEach((m, i) => {
    const storage = Math.max(0, m.solarKwh - m.directSolarKwh - m.exportedKwh);
    let accumulated = 0;
    for (const [amount, color, label] of [
      [m.directSolarKwh, COLORS.solar, "Direct to sauna"],
      [storage, COLORS.battery, "Into storage"],
      [m.exportedKwh, COLORS.exported, "Exported"],
    ]) {
      content += `<rect x="${x(i) - barWidth / 2}" y="${y(accumulated + amount)}" width="${barWidth}" height="${Math.max(0, y(accumulated) - y(accumulated + amount))}" fill="${color}"><title>${m.month}: ${label}, ${number(amount, 1)} kWh</title></rect>`;
      accumulated += amount;
    }
    content += `<text x="${x(i)}" y="${h - 11}" text-anchor="middle">${narrow() ? m.month.charAt(0) : m.month}</text>`;
  });
  content += `<path d="${linePath(model.monthly, (_, i) => x(i), y, "saunaKwh")}" fill="none" stroke="${COLORS.clay}" stroke-width="1.8" stroke-dasharray="5 4"/>`;
  model.monthly.forEach((m, i) => {
    content += `<circle cx="${x(i)}" cy="${y(m.saunaKwh)}" r="2.2" fill="${COLORS.clay}"><title>${m.month} sauna: ${number(m.saunaKwh)} kWh</title></circle>`;
  });
  $("monthly-chart").innerHTML = chartFrame(
    w,
    h,
    `Year-one monthly energy. ${number(model.annualSolarKwh)} kWh solar produced, ${number(model.exportedKwh)} exported, and ${number(model.annualSaunaKwh)} sauna demand. Exact values are in the monthly ledger.`,
    content,
  );
  setText(
    "monthly-note",
    model.inputs.battery
      ? "*Into storage includes charge/discharge losses and energy still stored at year-end. It is not the same as energy delivered to the sauna."
      : `The roof exports ${number((model.exportedKwh / (model.annualSolarKwh || 1)) * 100)}% of its production. The utility policy determines what those exports are worth.`,
  );
}

function lifetimeChart(model) {
  const w = narrow() ? 440 : 940,
    h = narrow() ? 280 : 305;
  const left = narrow() ? 47 : 55,
    right = w - 16,
    top = 27,
    bottom = h - 35;
  let cumulativeDiscounted = 0;
  const data = model.years.map((d) => ({
    ...d,
    discounted: (cumulativeDiscounted += d.discountedCashFlowUsd),
  }));
  const low = Math.min(
    0,
    ...data.flatMap((d) => [d.cumulativeCashFlowUsd, d.discounted]),
  );
  const high = Math.max(
    0,
    ...data.flatMap((d) => [d.cumulativeCashFlowUsd, d.discounted]),
  );
  const span = Math.max(100, high - low),
    min = low - span * 0.09,
    max = high + span * 0.18;
  const x = (year) => left + (year / 25) * (right - left),
    y = (value) => bottom - ((value - min) / (max - min)) * (bottom - top);
  let content = "";
  const interval =
    span > 50000
      ? 20000
      : span > 25000
        ? 10000
        : span > 10000
          ? 5000
          : span > 4000
            ? 2000
            : span > 1000
              ? 1000
              : 100;
  for (let v = Math.ceil(min / interval) * interval; v <= max; v += interval) {
    content += `<line x1="${left}" x2="${right}" y1="${y(v)}" y2="${y(v)}" stroke="${v === 0 ? "#b4bdab" : COLORS.line}" stroke-width="${v === 0 ? 1.2 : 1}"/><text x="${left - 8}" y="${y(v) + 3}" text-anchor="end">${Math.abs(v) >= 1000 ? `${v < 0 ? "−" : ""}$${number(Math.abs(v) / 1000)}k` : usd(v)}</text>`;
  }
  content += `<path d="${linePath(data, (d) => x(d.year), y, "cumulativeCashFlowUsd")}" fill="none" stroke="${COLORS.green}" stroke-width="2.4"/><path d="${linePath(data, (d) => x(d.year), y, "discounted")}" fill="none" stroke="${COLORS.clay}" stroke-width="2" stroke-dasharray="6 4"/>`;
  for (const yr of [0, 5, 10, 15, 20, 25])
    content += `<text x="${x(yr)}" y="${h - 10}" text-anchor="${yr === 0 ? "start" : yr === 25 ? "end" : "middle"}">${yr === 0 ? "Purchase" : `Year ${yr}`}</text>`;
  if (model.inputs.battery)
    content += `<line x1="${x(13)}" x2="${x(13)}" y1="${top}" y2="${bottom}" stroke="#8d947c" stroke-dasharray="2 4" stroke-width=".8"/><text class="svg-note" x="${x(13) + 5}" y="${top - 6}">$6,000 replacement</text>`;
  content += `<circle cx="${x(25)}" cy="${y(model.npvUsd)}" r="3.4" fill="${COLORS.clay}"/><text class="svg-note" x="${x(25) - 5}" y="${y(model.npvUsd) + 17}" text-anchor="end">${signedUsd(model.npvUsd)} NPV</text>`;
  data.forEach((d) => {
    content += `<circle cx="${x(d.year)}" cy="${y(d.cumulativeCashFlowUsd)}" r="6" fill="transparent"><title>Year ${d.year}: cash flow ${usd(d.cashFlowUsd, 2)}, cumulative ${usd(d.cumulativeCashFlowUsd, 2)}, cumulative discounted ${usd(d.discounted, 2)}</title></circle>`;
  });
  $("lifetime-chart").innerHTML = chartFrame(
    w,
    h,
    `Cumulative 25-year cash flows. Final nominal balance ${usd(data.at(-1).cumulativeCashFlowUsd)}; discounted net present value ${usd(model.npvUsd)}. Full cash flows follow in the table.`,
    content,
  );
  setText(
    "lifetime-copy",
    `After 25 years, the nominal balance is ${signedUsd(data.at(-1).cumulativeCashFlowUsd)}. At your ${number(inputs.discountRatePct, 1)}% discount rate, that is ${signedUsd(model.npvUsd)} in today’s dollars. ${inputs.battery ? "The year-13 step down is the battery replacement." : "A dollar received decades from now is worth less than a dollar spent today."}`,
  );
}

function tables(model) {
  const monthlyColumns = [
    "month",
    "solarKwh",
    "saunaKwh",
    "directSolarKwh",
    "batteryKwh",
    "gridKwh",
    "exportedKwh",
    "savingsUsd",
  ];
  $("monthly-table").innerHTML =
    `<thead><tr>${["Month", "Solar", "Sauna", "Direct solar", "Battery delivered", "Grid imports", "Exports", "Energy value"].map((v) => `<th scope="col">${v}</th>`).join("")}</tr></thead><tbody>${model.monthly.map((m) => `<tr>${monthlyColumns.map((k, i) => (i === 0 ? `<th scope="row">${m[k]}</th>` : `<td>${k === "savingsUsd" ? usd(m[k], 2) : number(m[k], 1)}</td>`)).join("")}</tr>`).join("")}</tbody><tfoot><tr><th scope="row">Year 1</th>${monthlyColumns
      .slice(1)
      .map(
        (k) =>
          `<td>${k === "savingsUsd" ? usd(model.years[1][k], 2) : number(model.years[1][k], 1)}</td>`,
      )
      .join("")}</tr></tfoot>`;
  $("cashflow-table").innerHTML =
    `<thead><tr>${["Year", "Solar kWh", "Grid kWh", "Export kWh", "Retail / kWh", "Savings", "Replacement", "Net cash flow", "Discounted flow", "Cumulative cash"].map((h) => `<th scope="col">${h}</th>`).join("")}</tr></thead><tbody>${model.years.map((y) => `<tr${y.replacementUsd ? ' class="replacement-row"' : ""}><th scope="row">${y.year === 0 ? "0 · Purchase" : y.year}</th><td>${y.year ? number(y.solarKwh, 1) : "—"}</td><td>${y.year ? number(y.gridKwh, 1) : "—"}</td><td>${y.year ? number(y.exportedKwh, 1) : "—"}</td><td>${y.year ? usd(y.gridPriceUsdPerKwh, 3) : "—"}</td><td>${usd(y.savingsUsd, 2)}</td><td>${usd(y.replacementUsd, 2)}</td><td>${usd(y.cashFlowUsd, 2)}</td><td>${usd(y.discountedCashFlowUsd, 2)}</td><td>${usd(y.cumulativeCashFlowUsd, 2)}</td></tr>`).join("")}</tbody>`;
}

function settlement(model) {
  const matched =
    inputs.exportPolicy === "net-metering"
      ? Math.min(model.exportedKwh, model.gridKwh)
      : 0;
  const consumed = model.directSolarKwh + model.batteryKwh;
  const parts = [
    [
      "Electricity you don’t buy",
      consumed * inputs.gridPriceUsdPerKwh,
      `${number(consumed, 1)} kWh × ${number(inputs.gridPriceUsdPerKwh * 100, 1)}¢ retail`,
    ],
    [
      "Exports credited at retail",
      matched * inputs.gridPriceUsdPerKwh,
      `${number(matched, 1)} kWh × ${number(inputs.gridPriceUsdPerKwh * 100, 1)}¢${inputs.exportPolicy === "net-billing" ? " · not available with net billing" : ""}`,
    ],
    [
      "Exports paid in cash",
      (model.exportedKwh - matched) * 0.04,
      `${number(model.exportedKwh - matched, 1)} kWh × 4¢ export price`,
    ],
  ];
  $("settlement-lines").innerHTML = parts
    .map(
      ([label, value, note]) =>
        `<div class="settlement-row"><div><span>${label}</span><strong>${usd(value, 2)}</strong></div><small>${note}</small><div class="settlement-track"><span style="width:${(value / (model.year1SavingsUsd || 1)) * 100}%"></span></div></div>`,
    )
    .join("");
  setText("settlement-total", usd(model.year1SavingsUsd, 2));
  const baseline = model.annualSaunaKwh * inputs.gridPriceUsdPerKwh;
  setText(
    "settlement-note",
    `Without solar, the sauna’s year-1 electricity costs ${usd(baseline, 2)}. After solar and export compensation, its net energy bill is ${usd(baseline - model.year1SavingsUsd, 2)}${baseline - model.year1SavingsUsd < 0 ? " (a net payment to you)" : ""}. Fixed utility charges are excluded.`,
  );
}

function sensitivities(model, comparisons) {
  const prices = [0.08, 0.12, 0.16, 0.24, 0.32],
    rates = [0, 2.5, 5, 7.5, 10];
  let content =
    '<p class="heatmap-caption">DISCOUNT RATE →</p><div class="heatmap-grid"><span class="column-label">¢/kWh ↓</span>';
  content += rates
    .map((r) => `<span class="column-label">${number(r, 1)}%</span>`)
    .join("");
  for (const price of prices) {
    content += `<span class="row-label">${number(price * 100)}¢<small>GRID PRICE</small></span>`;
    for (const rate of rates) {
      const result = saunaModel({
        ...inputs,
        gridPriceUsdPerKwh: price,
        discountRatePct: rate,
      });
      const selected =
        inputs.gridPriceUsdPerKwh === price && inputs.discountRatePct === rate;
      content += `<button type="button" class="heatmap-cell ${result.npvUsd >= 0 ? "positive" : "negative"}${selected ? " selected" : ""}" data-price="${price}" data-rate="${rate}" aria-pressed="${selected}" aria-label="Try ${number(price * 100)} cents per kWh and ${number(rate, 1)} percent discount rate: NPV ${usd(result.npvUsd)}">${shortUsd(result.npvUsd)}</button>`;
    }
  }
  content +=
    '</div><div class="heatmap-legend"><span><i></i>Below the required return</span><span><i></i>Above the required return</span></div>';
  $("heatmap").innerHTML = content;
  const zero = saunaModel({ ...inputs, gridPriceUsdPerKwh: 0 }).npvUsd;
  const one = saunaModel({ ...inputs, gridPriceUsdPerKwh: 1 }).npvUsd;
  const threshold = one > zero ? -zero / (one - zero) : null;
  setText(
    "break-even-price",
    threshold === null
      ? "No tipping point"
      : threshold <= 0
        ? "Already ahead"
        : `${number(threshold * 100, 1)}¢ / kWh`,
  );
  setText(
    "break-even-copy",
    threshold === null
      ? "Without any solar production, changing the grid price cannot improve the investment."
      : threshold <= 0
        ? `Export revenue alone clears your ${number(inputs.discountRatePct, 1)}% required return under these assumptions.`
        : `The starting grid price needed for this ${number(inputs.arrayKw, 2)} kW ${inputs.battery ? "solar + battery" : "solar-only"} system to break even in present value at your ${number(inputs.discountRatePct, 1)}% discount rate. You’re currently paying ${number(inputs.gridPriceUsdPerKwh * 100, 1)}¢.`,
  );
  const without = comparisons.find(
    (m) => m.inputs.exportPolicy === inputs.exportPolicy && !m.inputs.battery,
  );
  const withBattery = comparisons.find(
    (m) => m.inputs.exportPolicy === inputs.exportPolicy && m.inputs.battery,
  );
  const delta = withBattery.npvUsd - without.npvUsd;
  setText(
    "battery-insight",
    `Adding storage changes NPV by ${signedUsd(delta)} under ${inputs.exportPolicy === "net-metering" ? "net metering" : "net billing"}. It supplies ${number(withBattery.batteryKwh)} kWh to the sauna in year 1, but costs $11,000 now and $6,000 in year 13. Backup power is not valued here.`,
  );
  const sized = saunaModel({ ...inputs, arrayKw: 1.25, battery: false });
  setText(
    "sizing-copy",
    `A 1.25 kW array makes about ${number(sized.annualSolarKwh)} kWh a year, close to the sauna’s ${number(sized.annualSaunaKwh)} kWh demand. Without a battery, its NPV is ${signedUsd(sized.npvUsd)} under your current tariff, grid price and discount rate. This is a useful comparison, not a guaranteed optimum: a small real-world installation may cost more than $3/W.`,
  );
}

function render() {
  const model = saunaModel(inputs);
  current = model;
  const metering = inputs.exportPolicy === "net-metering";
  const baseline = inputs.arrayKw === 0 && !inputs.battery;
  const positive = model.npvUsd > 0;
  $("verdict-title").innerHTML = baseline
    ? "No panels.<br><em>No investment.</em>"
    : positive
      ? "For the sauna alone,<br><em>the math works.</em>"
      : model.npvUsd > -3000
        ? "For the sauna alone,<br><em>not quite.</em>"
        : "For the sauna alone,<br><em>not at this price.</em>";
  setText("hero-npv", signedUsd(model.npvUsd));
  setText(
    "verdict-copy",
    baseline
      ? "This is the grid-only baseline: no purchase, no solar savings. Move the array-size slider to see what a solar investment would add."
      : `${usd(model.upfrontCostUsd)} up front buys about ${usd(model.year1SavingsUsd)} of first-year energy value. ${positive ? `Over 25 years, that clears your ${number(inputs.discountRatePct, 1)}% required return.` : `Over 25 years, that falls ${usd(-model.npvUsd)} short of your ${number(inputs.discountRatePct, 1)}% required return.`} ${inputs.battery ? "Storage shifts the sunlight, but its purchase and replacement both count." : metering ? "Annual net metering helps; extra summer exports earn just 4¢/kWh." : "Most solar is exported cheaply while evening electricity is bought at retail."}`,
  );
  setText(
    "npv-meaning",
    baseline
      ? "The reference case: all sauna electricity comes from the grid."
      : `${positive ? "Value created" : "Value lost"} versus buying all sauna electricity from the grid, in today’s dollars.`,
  );
  const share = (model.gridKwh / model.annualSaunaKwh) * 100;
  setText("grid-share-title", `${number(share)}% still comes from the grid.`);
  setText(
    "grid-share-copy",
    metering
      ? "Your bill can be offset even when your sauna is running on grid electricity. Net metering is an accounting benefit, not a physical battery."
      : "Solar only avoids a retail purchase when it reaches the heater directly or through storage. Exports earn their own, lower rate.",
  );
  setText("annual-demand", `${number(model.annualSaunaKwh)} kWh`);
  const sources = [
    ["Direct solar", model.directSolarKwh, "solar"],
    ["From battery", model.batteryKwh, "battery"],
    ["From the grid", model.gridKwh, "grid"],
  ];
  $("energy-bar").innerHTML = sources
    .filter(([, v]) => v > 0)
    .map(
      ([label, value, color]) =>
        `<span style="width:${(value / model.annualSaunaKwh) * 100}%;background:${COLORS[color]}" title="${label}: ${number(value, 1)} kWh"></span>`,
    )
    .join("");
  $("energy-bar").setAttribute(
    "aria-label",
    sources
      .map(([label, value]) => `${label}: ${number(value, 1)} kWh`)
      .join("; "),
  );
  $("energy-key").innerHTML = sources
    .map(
      ([label, value, color]) =>
        `<div><span><i class="key ${color}"></i>${label}</span><strong>${number(value)}<small>kWh</small></strong></div>`,
    )
    .join("");
  const ratio = model.annualSolarKwh / model.annualSaunaKwh;
  setText(
    "annual-copy",
    `Your ${number(inputs.arrayKw, 2)} kW roof makes ${number(model.annualSolarKwh)} kWh in year 1, ${number(ratio, 1)} times the sauna’s annual use. ${ratio > 1 ? "The surplus is real. So is the mismatch: bright summer afternoons do not line up with cold evening sessions." : "The annual total is only part of the story. The time of production determines how much you can use directly."}`,
  );
  setText(
    "money-intro",
    metering
      ? "Annual net metering lets summer exports cancel evening imports at the retail rate. Once the sauna’s annual demand is covered, another exported kilowatt-hour earns only 4 cents."
      : "Under net billing, every exported kilowatt-hour earns 4 cents. Every imported kilowatt-hour costs your retail rate. Annual production alone cannot tell you the value.",
  );
  setText("upfront", usd(model.upfrontCostUsd));
  setText("savings", usd(model.year1SavingsUsd));
  $("payback").innerHTML =
    model.paybackYears === null
      ? "Not in 25 <small>yrs</small>"
      : `${number(model.paybackYears, 1)} <small>years</small>`;
  setText("irr", model.irrPct === null ? "—" : pct(model.irrPct));
  setText("hurdle", `${number(inputs.discountRatePct, 1)}%`);
  setText(
    "tariff-title",
    metering ? "The grid does the time-shifting." : "Timing now has a price.",
  );
  setText(
    "tariff-copy",
    metering
      ? "Retail credit turns a sunny afternoon into a lower evening bill. A physical battery is less valuable when the utility already does that bookkeeping for you."
      : "A sunny afternoon earns less than an evening sauna costs. A battery can close part of that gap, but it also has to earn back its own substantial price tag.",
  );
  const comparisons = [];
  for (const exportPolicy of ["net-metering", "net-billing"])
    for (const battery of [false, true])
      comparisons.push(saunaModel({ ...inputs, exportPolicy, battery }));
  const net = comparisons.find(
    (m) =>
      m.inputs.exportPolicy === "net-metering" &&
      m.inputs.battery === inputs.battery,
  );
  const bill = comparisons.find(
    (m) =>
      m.inputs.exportPolicy === "net-billing" &&
      m.inputs.battery === inputs.battery,
  );
  $("tariff-compare").innerHTML =
    `<div><span>NET METERING · YEAR 1</span><strong>${usd(net.year1SavingsUsd)} <small>value</small></strong></div><div><span>NET BILLING · YEAR 1</span><strong>${usd(bill.year1SavingsUsd)} <small>value</small></strong></div>`;
  setText(
    "comparison-caption",
    `${number(inputs.arrayKw, 2)} kW · ${number(inputs.gridPriceUsdPerKwh * 100, 1)}¢ grid price · ${number(inputs.discountRatePct, 1)}% discount rate`,
  );
  $("comparison-table").innerHTML =
    `<thead><tr>${["Configuration", "Upfront cost", "Year-1 value", "25-year NPV", "Payback", "IRR"].map((v) => `<th scope="col">${v}</th>`).join("")}</tr></thead><tbody>${comparisons
      .map((m) => {
        const active =
          m.inputs.exportPolicy === inputs.exportPolicy &&
          m.inputs.battery === inputs.battery;
        return `<tr class="${active ? "current" : ""}"><td>${m.inputs.exportPolicy === "net-metering" ? "Net metering" : "Net billing"} · ${m.inputs.battery ? "with battery" : "solar only"}${active ? '<span class="row-badge">SELECTED</span>' : ""}</td><td>${usd(m.upfrontCostUsd)}</td><td>${usd(m.year1SavingsUsd)}</td><td class="${m.npvUsd >= 0 ? "positive-text" : "negative-text"}">${signedUsd(m.npvUsd)}</td><td>${m.paybackYears === null ? "Not in 25 yrs" : `${number(m.paybackYears, 1)} yrs`}</td><td>${m.irrPct === null ? "—" : pct(m.irrPct)}</td></tr>`;
      })
      .join("")}</tbody>`;
  setText(
    "energy-audit",
    `Year-1 energy audit (kWh): ${number(model.annualSolarKwh, 2)} solar + ${number(model.gridKwh, 2)} grid = ${number(model.annualSaunaKwh, 2)} sauna + ${number(model.exportedKwh, 2)} exports + ${number(model.batteryLossKwh, 2)} battery losses + ${number(model.batteryStoredChangeKwh, 2)} change in stored energy.`,
  );
  document.querySelectorAll(".battery-legend").forEach((el) => {
    el.hidden = !inputs.battery;
  });
  dailyChart(model);
  monthlyChart(model);
  lifetimeChart(model);
  tables(model);
  settlement(model);
  sensitivities(model, comparisons);
  setText(
    "update-status",
    `Updated: ${number(inputs.arrayKw, 2)} kilowatts, ${metering ? "net metering" : "net billing"}, ${inputs.battery ? "with battery" : "no battery"}. 25-year net present value ${usd(model.npvUsd)}.`,
  );
}

function syncControls() {
  $("array-size").value = inputs.arrayKw;
  $("grid-price").value = inputs.gridPriceUsdPerKwh * 100;
  $("discount-rate").value = inputs.discountRatePct;
  document.querySelectorAll('input[name="policy"]').forEach((el) => {
    el.checked = el.value === inputs.exportPolicy;
  });
  document.querySelectorAll('input[name="battery"]').forEach((el) => {
    el.checked = el.value === String(inputs.battery);
  });
  setText(
    "array-output",
    `${number(inputs.arrayKw, inputs.arrayKw % 0.5 === 0 ? 1 : 2)} kW`,
  );
  setText("price-output", `${number(inputs.gridPriceUsdPerKwh * 100)}¢ / kWh`);
  setText("rate-output", `${number(inputs.discountRatePct, 1)}%`);
  setText(
    "policy-hint",
    inputs.exportPolicy === "net-metering"
      ? "Annual credits at the retail rate"
      : "Every export earns 4¢ / kWh",
  );
  for (const id of ["array-size", "grid-price", "discount-rate"]) {
    const el = $(id);
    el.style.setProperty(
      "--fill",
      `${((el.value - el.min) / (el.max - el.min)) * 100}%`,
    );
  }
}

$("assumptions").addEventListener("input", (event) => {
  const target = event.target;
  if (target.id === "array-size") inputs.arrayKw = Number(target.value);
  else if (target.id === "grid-price")
    inputs.gridPriceUsdPerKwh = Number(target.value) / 100;
  else if (target.id === "discount-rate")
    inputs.discountRatePct = Number(target.value);
  else if (target.name === "policy") inputs.exportPolicy = target.value;
  else if (target.name === "battery") inputs.battery = target.value === "true";
  else return;
  syncControls();
  clearTimeout(updateTimer);
  updateTimer = setTimeout(render, 40);
});
$("reset").addEventListener("click", () => {
  clearTimeout(updateTimer);
  inputs = { ...DEFAULTS };
  syncControls();
  render();
});
$("try-sized").addEventListener("click", () => {
  clearTimeout(updateTimer);
  inputs.arrayKw = 1.25;
  inputs.battery = false;
  syncControls();
  render();
  $("verdict").scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "instant"
      : "smooth",
  });
});
$("heatmap").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-price]");
  if (!button) return;
  clearTimeout(updateTimer);
  inputs.gridPriceUsdPerKwh = Number(button.dataset.price);
  inputs.discountRatePct = Number(button.dataset.rate);
  syncControls();
  render();
  // Rendering replaces the grid; keep keyboard focus on the chosen scenario.
  $("heatmap")
    .querySelector(
      `[data-price="${inputs.gridPriceUsdPerKwh}"][data-rate="${inputs.discountRatePct}"]`,
    )
    .focus({ preventScroll: true });
});
$("download-csv").addEventListener("click", () => {
  const keys = [
    "year",
    "solarKwh",
    "saunaKwh",
    "directSolarKwh",
    "batteryKwh",
    "gridKwh",
    "exportedKwh",
    "gridPriceUsdPerKwh",
    "exportPriceUsdPerKwh",
    "savingsUsd",
    "replacementUsd",
    "cashFlowUsd",
    "discountedCashFlowUsd",
    "cumulativeCashFlowUsd",
  ];
  const csv = [
    keys.join(","),
    ...current.years.map((y) => keys.map((k) => y[k] ?? 0).join(",")),
  ].join("\r\n");
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `good-heat-${inputs.arrayKw}kw-${inputs.exportPolicy}${inputs.battery ? "-battery" : ""}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
document.querySelectorAll(".method-detail").forEach((el) =>
  el.addEventListener("toggle", () => {
    el.querySelector("summary b").textContent = el.open ? "−" : "+";
  }),
);
$("pvgis-source").href = MODEL_NOTES.sourceUrl;
let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    dailyChart(current);
    monthlyChart(current);
    lifetimeChart(current);
  }, 100);
});
syncControls();
render();
