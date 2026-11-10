import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
  (existsSync("/ms-playwright/chromium-1223/chrome-linux64/chrome")
    ? "/ms-playwright/chromium-1223/chrome-linux64/chrome"
    : undefined);
const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
const page = await context.newPage();
const errors = [];
const network = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("request", (request) => {
  if (/^https?:/.test(request.url())) network.push(request.url());
});
const file = resolve("dist/index.html");
assert.ok(existsSync(file), "run npm run build before the browser test");
assert.ok(
  statSync(file).size < 500_000,
  "the complete standalone page stays under 500 KB",
);

try {
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(() => typeof window.saunaModel === "function");
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.locator("#hero-npv").textContent(), "−$1,544");
  assert.equal(await page.locator("#monthly-table tbody tr").count(), 12);
  assert.equal(await page.locator("#cashflow-table tbody tr").count(), 26);
  assert.equal(await page.locator("#heatmap button").count(), 25);
  assert.equal(await page.locator("#comparison-table tbody tr").count(), 4);
  assert.equal(await page.locator(".svg-chart svg").count(), 3);
  assert.equal(
    await page.evaluate(() =>
      document.fonts.check('400 16px "Libre Caslon Display"'),
    ),
    true,
  );
  assert.equal(
    await page.evaluate(() => document.fonts.check('500 16px "DM Sans"')),
    true,
  );

  const matchDisplayedModel = async () => {
    await page.waitForTimeout(150);
    return page.evaluate(() => {
      const options = {
        arrayKw: Number(document.getElementById("array-size").value),
        gridPriceUsdPerKwh:
          Number(document.getElementById("grid-price").value) / 100,
        discountRatePct: Number(document.getElementById("discount-rate").value),
        exportPolicy: document.querySelector('input[name="policy"]:checked')
          .value,
        battery:
          document.querySelector('input[name="battery"]:checked').value ===
          "true",
      };
      const result = window.saunaModel(options);
      const text = document.getElementById("hero-npv").textContent;
      const displayed = Number(text.replace("−", "-").replace(/[$,+]/g, ""));
      return { actual: result.npvUsd, displayed, result };
    });
  };

  for (const policy of ["net-billing", "net-metering"]) {
    await page
      .locator(`input[name="policy"][value="${policy}"]`)
      .check({ force: true });
    for (const battery of ["true", "false"]) {
      await page
        .locator(`input[name="battery"][value="${battery}"]`)
        .check({ force: true });
      const { actual, displayed, result } = await matchDisplayedModel();
      assert.ok(
        Math.abs(actual - displayed) < 0.51,
        "the public model and headline agree",
      );
      assert.equal(result.federalTaxCreditUsd, 0);
      assert.ok(
        Math.abs(
          result.annualSaunaKwh -
            result.directSolarKwh -
            result.batteryKwh -
            result.gridKwh,
        ) < 1e-7,
      );
    }
  }
  for (const [id, value] of [
    ["array-size", "1.25"],
    ["grid-price", "24"],
    ["discount-rate", "2.5"],
  ]) {
    await page.locator(`#${id}`).fill(value);
    const { actual, displayed } = await matchDisplayedModel();
    assert.ok(
      Math.abs(actual - displayed) < 0.51,
      `${id} updates model and display`,
    );
  }
  assert.match(
    await page.locator("#verdict-title").textContent(),
    /math works/,
  );
  await page
    .locator('#heatmap button[data-price="0.12"][data-rate="7.5"]')
    .click();
  assert.equal(await page.locator("#grid-price").inputValue(), "12");
  assert.equal(await page.locator("#discount-rate").inputValue(), "7.5");
  assert.equal(
    await page.locator('#heatmap button[aria-pressed="true"]').count(),
    1,
  );
  const selected = await matchDisplayedModel();
  assert.ok(Math.abs(selected.actual - selected.displayed) < 0.51);
  await page.locator("#reset").click();
  assert.equal(await page.locator("#hero-npv").textContent(), "−$1,544");
  await page.locator("#try-sized").click();
  assert.equal(await page.locator("#array-size").inputValue(), "1.25");
  assert.equal(await page.locator("#hero-npv").textContent(), "+$1,531");
  await page.locator("#reset").click();

  await page.locator("details:has(#cashflow-table) summary").click();
  const downloadEvent = page.waitForEvent("download");
  await page.locator("#download-csv").click();
  const download = await downloadEvent;
  assert.match(download.suggestedFilename(), /good-heat-3kw-net-metering.csv/);
  assert.equal(await download.failure(), null);
  await page.locator("details:has(#cashflow-table) summary").click();

  await page.locator("#array-size").fill("0");
  await page.waitForTimeout(150);
  assert.equal(await page.locator("#hero-npv").textContent(), "$0");
  assert.match(
    await page.locator("#verdict-title").textContent(),
    /No investment/,
  );
  await page.locator("#reset").click();

  for (const width of [1440, 1024, 768, 520, 390, 375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(150);
    const checkOverflow = () =>
      page.evaluate(() => ({
        width: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
      }));
    let dimensions = await checkOverflow();
    assert.ok(
      dimensions.scroll <= dimensions.width,
      `no horizontal overflow at ${width}px: ${JSON.stringify(dimensions)}`,
    );
    await page.evaluate(() =>
      document.querySelectorAll("details").forEach((el) => {
        el.open = true;
      }),
    );
    dimensions = await checkOverflow();
    assert.ok(
      dimensions.scroll <= dimensions.width,
      `expanded ledgers do not overflow at ${width}px`,
    );
    if (width === 1440 || width === 390) {
      const accessibility = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      assert.deepEqual(
        accessibility.violations.map((v) => ({
          id: v.id,
          targets: v.nodes.map((n) => n.target),
        })),
        [],
        `no automated WCAG A/AA findings at ${width}px with all disclosures expanded`,
      );
    }
    await page.evaluate(() =>
      document.querySelectorAll("details").forEach((el, index) => {
        el.open = index === 2;
      }),
    );
  }

  if (process.env.SCREENSHOT_DIR) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.waitForTimeout(150);
    await page.screenshot({
      path: `${process.env.SCREENSHOT_DIR}/good-heat-desktop.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(150);
    await page.screenshot({
      path: `${process.env.SCREENSHOT_DIR}/good-heat-mobile.png`,
      fullPage: true,
    });
  }
  assert.deepEqual(errors, [], "no browser exceptions");
  assert.deepEqual(
    network,
    [],
    "standalone built file makes no network requests",
  );
  console.log(
    "PASS: offline file:// load; all five controls and public API; both tariffs and battery modes; reset; sizing preset; sensitivity selection; CSV download; 12 monthly and 26 annual rows; positive/negative/zero verdicts; 320–1440px layouts, including expanded tables; desktop/mobile axe WCAG A/AA scan; local fonts; no browser errors; no network requests.",
  );
} finally {
  await browser.close();
}
