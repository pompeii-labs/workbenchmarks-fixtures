import { test, expect } from "@playwright/test";

test("desktop: renders, drives, boosts, jumps, pauses, resets, and scores gates", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/");
  await expect(page.locator("#loading")).toBeHidden();
  await expect(page.getByRole("heading", { name: /CHASE/ })).toBeVisible();
  expect(
    await page.evaluate(() => window.__WAKE_RUN__.renderer.triangles),
  ).toBeGreaterThan(50_000);
  await page.getByRole("button", { name: /LET.S RIDE/ }).click();
  await expect(page.locator("#hud")).toBeVisible();
  await expect(page.locator("#touch-controls")).toBeHidden();

  await page.keyboard.down("w");
  await expect
    .poll(() => page.evaluate(() => window.__WAKE_RUN__.state.speed))
    .toBeGreaterThan(28);
  await page.keyboard.down("Space");
  await expect
    .poll(() => page.evaluate(() => window.__WAKE_RUN__.state.boosting))
    .toBe(true);
  await expect
    .poll(() => page.evaluate(() => window.__WAKE_RUN__.state.bestAir))
    .toBeGreaterThan(3);
  await expect
    .poll(() => page.evaluate(() => window.__WAKE_RUN__.state.gates))
    .toBeGreaterThan(0);
  const airborneSession = await page.evaluate(() => window.__WAKE_RUN__.state);
  expect(airborneSession.score).toBeGreaterThanOrEqual(500);
  expect(airborneSession.speed).toBeLessThanOrEqual(46);
  await page.keyboard.up("Space");
  await page.keyboard.up("w");

  await page.keyboard.press("p");
  await expect(page.locator("#pause-overlay")).toBeVisible();
  await expect(page.locator("#resume-button")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(page.locator("#restart-button")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.locator("#resume-button")).toBeFocused();
  const stopped = await page.evaluate(() => window.__WAKE_RUN__.state);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__WAKE_RUN__.state.time)).toBe(
    stopped.time,
  );
  await page.getByRole("button", { name: /KEEP RIDING/ }).click();
  await expect(page.locator("#pause-overlay")).toBeHidden();
  await page.keyboard.press("r");
  const reset = await page.evaluate(() => window.__WAKE_RUN__.state);
  expect(reset.x).toBe(0);
  expect(reset.z).toBe(16);
  expect(reset.score).toBe(stopped.score);
  expect(reset.bestAir).toBe(stopped.bestAir);

  // Settings buttons must not steal Space from driving after a pointer click.
  await page.getByRole("button", { name: "Turn sound on" }).click();
  await expect(
    page.getByRole("button", { name: "Turn sound off" }),
  ).toBeVisible();
  await page.keyboard.down("ArrowUp");
  await expect
    .poll(() => page.evaluate(() => window.__WAKE_RUN__.state.speed))
    .toBeGreaterThan(8);
  await page.keyboard.down("Space");
  await expect
    .poll(() => page.evaluate(() => window.__WAKE_RUN__.state.boosting))
    .toBe(true);
  await page.keyboard.up("Space");
  await page.keyboard.up("ArrowUp");
  await page.keyboard.press("m");
  await expect(
    page.getByRole("button", { name: "Turn sound on" }),
  ).toBeVisible();

  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "START A FRESH SESSION" }).click();
  const fresh = await page.evaluate(() => window.__WAKE_RUN__.state);
  expect(fresh.score).toBe(0);
  expect(fresh.gates).toBe(0);
  expect(fresh.bestAir).toBe(0);
  expect(fresh.paused).toBe(false);
  expect(errors).toEqual([]);
});

test("mobile: fits the viewport and touch input drives and releases", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator("#loading")).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page.getByRole("button", { name: /LET.S RIDE/ }).tap();
  await expect(page.locator("#touch-controls")).toBeVisible();
  const gas = page.getByRole("button", { name: "Accelerate", exact: true });
  const bounds = await gas.boundingBox();
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.down();
  await expect
    .poll(() => page.evaluate(() => window.__WAKE_RUN__.state.speed))
    .toBeGreaterThan(10);
  await page.mouse.up();
  expect(
    await gas.evaluate((element) => element.classList.contains("pressed")),
  ).toBe(false);
  await page.getByRole("button", { name: "Pause game", exact: true }).tap();
  await expect(page.locator("#pause-overlay")).toBeVisible();
  await page.getByRole("button", { name: /KEEP RIDING/ }).tap();
  await expect(page.locator("#pause-overlay")).toBeHidden();
  expect(errors).toEqual([]);
  await page.setViewportSize({ width: 740, height: 360 });
  for (const id of [
    "reset-button",
    "boost-percent",
    "speed",
    "touch-controls",
  ]) {
    const rect = await page.locator(`#${id}`).boundingBox();
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.y + rect.height).toBeLessThanOrEqual(360);
  }
  await context.close();
});
