# The Good Heat

An interactive, single-page field note answering: **should a Minneapolis homeowner buy rooftop solar to power an evening sauna?**

The page starts with a live financial verdict, then follows physical energy, utility credits, and 25 years of cash flows. It includes five assumption controls, daily/monthly/lifetime SVG charts, monthly and annual ledgers, CSV export, clickable price/rate sensitivity, a four-configuration comparison, a smaller-array preset, formulas, sources, and limitations.

## Run

Node 20.19+ or 22.12+ and npm are required. Verified with Node 24.

```sh
npm ci
npm run dev
```

Vite prints the development URL, normally `http://localhost:5173`.

```sh
npm run build
```

The output is **`dist/index.html`**, a self-contained static page of approximately **361 KB uncompressed / 156 KB gzip**. Open it directly in a modern browser, including via `file://`, or put it on any static host. No application server, CDN, API key, font service, or network connection is needed. All code, CSS, fonts, illustration, and weather data are embedded. For an HTTP preview:

```sh
npm run preview
```

## Verify

```sh
npm test
npm run build
npm run test:browser
```

The browser test uses an installed Playwright Chromium. On another machine, first run `npx playwright install chromium`, or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to an existing Chromium executable. The test recognizes the browser provided in the build environment automatically.

- **11 numerical tests:** resource provenance and shape; exact sauna schedule; zero-array baseline; annual and quarter-hour energy conservation; storage capacity, efficiency and power limits; monthly reconciliation; both tariff formulas; degradation, escalation and battery replacement; NPV, payback and IRR; cache isolation; very-small-cash-flow IRR stability.
- **Real Chromium, built file:** all five controls, both policies and battery modes, model/display agreement, positive/negative/zero verdicts, reset, sizing preset, sensitivity selection, CSV download, 12 monthly rows, 26 annual rows, loaded fonts, and zero browser errors or network requests.
- **Responsive layout:** 320, 375, 390, 520, 768, 1024 and 1440 px, with disclosures both closed and expanded. Wide data tables scroll inside their own regions; the page does not scroll sideways.
- **Automated accessibility:** axe WCAG 2 A/AA and 2.1 AA scans at desktop and phone widths, with every disclosure expanded. No detected violations. Native controls, keyboard focus, a skip link, status announcements, reduced motion, chart descriptions and table headers are provided. Automated checks are not a complete accessibility certification.
- **Visual inspection:** desktop and phone screenshots reviewed. To produce local test screenshots, set `SCREENSHOT_DIR` to an existing writable directory before running the browser test.

## Public Model

The page itself imports the same function it exposes:

```js
const result = window.saunaModel({
  arrayKw: 3,
  exportPolicy: "net-metering", // or "net-billing"
  battery: false,
  gridPriceUsdPerKwh: 0.16,
  discountRatePct: 5,
});
```

The call is synchronous. Omitted inputs use the original defaults above, regardless of the current UI state. Results include all required fields:

```js
{
  (annualSolarKwh,
    annualSaunaKwh,
    directSolarKwh,
    batteryKwh,
    gridKwh,
    exportedKwh,
    federalTaxCreditUsd,
    upfrontCostUsd,
    year1SavingsUsd,
    npvUsd,
    paybackYears,
    irrPct);
}
```

Also returned: normalized `inputs`; twelve `monthly` rows; 96 `daily` quarter-hour rows for June 22; `dailyDate`; 26 `years` rows including purchase year 0; battery loss and stored-energy-change totals. Financial and energy results are unrounded. `paybackYears` and `irrPct` can be `null`. Daily `batteryKw` is positive on discharge and negative on charging; `socKwh` is stored energy at the end of the quarter-hour.

`window.saunaModelNotes` contains full methodology and provenance. The model is also directly importable from `src/model.js` for independent Node checks.

### Default Reference Results

| Metric                | 3 kW, net metering, no battery |
| --------------------- | -----------------------------: |
| Year-1 solar          |                 4,383.3255 kWh |
| Year-1 sauna          |                 1,872.0000 kWh |
| Direct solar to sauna |                    28.5063 kWh |
| Grid imports          |                 1,843.4937 kWh |
| Solar exports         |                 4,354.8192 kWh |
| Federal credit        |                             $0 |
| Purchase cost         |                         $9,000 |
| Year-1 value          |                      $399.9730 |
| NPV at 5%             |                   -$1,544.0133 |
| Undiscounted payback  |                  17.7182 years |
| IRR                   |                        3.4042% |

The verdict is not a blanket rejection of solar. With the same tariff and prices, 1.25 kW and no battery yields approximately **+$1,531 NPV**. Under net billing, the default 3 kW system yields approximately **-$5,769 NPV**. Physical generation and financial credit are deliberately separated throughout the page.

## Resource And Assumptions

### Solar

- European Commission JRC **PVGIS 5.3 / ERA5 typical meteorological year**, latitude 44.98, longitude -93.27, representative months from 2005-2023.
- Source: <https://re.jrc.ec.europa.eu/api/v5_3/tmy?lat=44.98&lon=-93.27&outputformat=json>.
- `src/data/minneapolis-tmy.js` preserves 8,760 hourly GHI, DNI, DHI and air-temperature records, retrieval metadata, selected source months and column definitions. The source was independently re-fetched and all rows and timestamps compared during verification.
- South-facing 35-degree plane; isotropic diffuse transposition; ground albedo 0.20; NOAA solar geometry at the PVGIS +0.5-hour irradiance offset; 45 C NOCT; -0.4%/C temperature coefficient; 14% aggregate losses; 1:1 DC/AC clipping. This is a documented engineering estimate, not a PVWatts run or an installer guarantee.
- The hourly AC output is constant across its four quarters, preserving energy. NOAA method: <https://gml.noaa.gov/grad/solcalc/solareqns.PDF>.

To deliberately refresh the bundled resource (requires internet):

```sh
node src/data/fetch-resource.mjs
npm test
npm run build
```

Refreshing can change reference results if the provider updates its dataset. Normal installation, building and use do not fetch solar data.

### Clock And Storage

- Tuesday, Thursday, Saturday and Sunday in the **America/Chicago** 2027 calendar, including daylight saving time: 208 sessions.
- 18:30-19:15 at 8 kW; 19:15-20:00 at 4 kW: 9 kWh per session. Only sauna load is counted.
- Solar first serves the sauna, then charges storage, then exports. A battery serves remaining sauna demand; the grid serves the rest.
- Battery: 13.5 kWh usable stored energy, 5 kW AC charge/discharge limits, square-root-of-0.90 efficiency each way, no grid charging or battery exports. It starts empty once; SOC carries across years. Replacement at the end of year 13 discards remaining stored energy as a loss and starts year 14 empty.
- Spring 2027 is the purchase at year 0. Year 1 is an **annualized full operating year**, not electricity generated before installation. The complete reference calendar and weather repeat each operating year; no partial first season is counted.

### Finance

- PV purchase is $3,000/kW; battery purchase is $11,000; replacement is $6,000 nominal at the end of year 13.
- **No federal residential credit for a spring 2027 installation.** The IRS states that the Residential Clean Energy Credit is unavailable for property placed in service after December 31, 2025. Source verified November 10, 2026: <https://www.irs.gov/credits-deductions/residential-clean-energy-credit>.
- No state or utility incentives. The two tariffs are the task's specified scenarios, not a claim about eligibility with a specific utility.
- Let D = direct solar, B = delivered battery energy, E = exports, G = grid imports, p = retail price and x = export price. Annual net-metering value is `(D + B + min(E,G))*p + max(E-G,0)*x`. Net-billing value is `(D+B)*p + E*x`.
- Year-1 retail price is $0.16/kWh and export price $0.04/kWh. Both escalate 3% per year. PV output degrades 0.5% per year. Physical dispatch is rerun for every degraded year.
- Year-0 outlay is negative. Annual energy value less any replacement is received at year-end. NPV discounts these flows at the nominal input rate; default 5%.
- Payback is **undiscounted sustained recovery**, interpolated after the last negative cumulative balance so a battery replacement cannot silently reverse an apparent payback. No recovery within 25 years returns `null`. IRR uses the same complete cash flows; no unique detected root returns `null`.
- Monthly net-metering dollars allocate the annual settlement in proportion to exports. They are not separate monthly retail-credit limits.

## Boundaries

Historical representative weather is not a 2027 forecast. We have not verified roof-specific snow, shading, structural suitability, installation pricing or utility eligibility. There is no separate snow profile, sub-hourly cloud model, battery aging, standby draw, financing, maintenance, additional inverter replacement, insurance, taxes on export income, salvage value or fixed utility charge. Actual calendar variations after the reference year are not simulated. Small installations may not achieve the assumed linear $3/W price. Carbon, backup power, resale value, other household loads and the enjoyment of a sauna are outside this financial verdict.

Chromium was exercised automatically; full manual screen-reader and physical-device testing were not performed.

## Project Map

- `index.html`: semantic editorial structure and original inline sauna illustration.
- `src/style.css`: responsive design, local fonts and accessibility states.
- `src/main.js`: controls, narrative, charts, sensitivity and ledgers.
- `src/model.js`: shared energy/finance API, documented assumptions and dispatch cache.
- `src/data/`: bundled resource and reproducible fetch script.
- `src/fonts/`: local DM Sans and Libre Caslon Display, with SIL Open Font License notices also embedded in the build.
- `tests/`: numerical and offline browser tests.
- `vite.config.js`: single-file static bundling and embedded font-license notices.

No runtime JavaScript framework or chart library is required.
