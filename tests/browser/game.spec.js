import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

test("static game renders, drives, boosts, collects a buoy, pauses, and resets", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  const external = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:4173"))
      external.push(request.url());
  });
  await page.goto("/");
  await expect(page.locator("#loading")).toBeHidden();
  await expect(
    page.getByRole("heading", { name: /MAKE.*WAVES/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "LET’S RIDE", exact: true }).click();
  await expect(page.locator("#hud")).toBeVisible();
  await page.keyboard.down("w");
  await expect
    .poll(() => page.evaluate(() => window.__tideline.state.speed))
    .toBeGreaterThan(15);
  await page.keyboard.down("Space");
  await expect
    .poll(() => page.evaluate(() => window.__tideline.state.boost))
    .toBeLessThan(0.8);
  await expect
    .poll(() => page.evaluate(() => window.__tideline.state.collected), {
      timeout: 45000,
    })
    .toBeGreaterThan(0);
  await expect
    .poll(() => page.evaluate(() => window.__tideline.state.totalAirTime), {
      timeout: 45000,
    })
    .toBeGreaterThan(0.1);
  await page.keyboard.up("Space");
  await page.keyboard.up("w");
  await page.keyboard.down("a");
  await expect
    .poll(() => page.evaluate(() => window.__tideline.state.heading))
    .toBeGreaterThan(0.2);
  await page.keyboard.up("a");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeVisible();
  const paused = await page.evaluate(() => window.__tideline.state.time);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__tideline.state.time)).toBe(paused);
  await page.getByRole("button", { name: "BACK TO THE WATER" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.keyboard.press("r");
  expect(await page.evaluate(() => window.__tideline.state.collected)).toBe(0);
  expect(await page.evaluate(() => window.__tideline.state.speed)).toBe(0);
  await page.getByRole("button", { name: "Enable sound" }).click();
  await expect(page.getByRole("button", { name: "Mute sound" })).toBeVisible();
  await page.getByRole("button", { name: "Mute sound" }).click();
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test("mobile controls support throttle and steering with a responsive layout", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.locator("#loading")).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page.getByRole("button", { name: "LET’S RIDE", exact: true }).click();
  await expect(page.locator("#touch-controls")).toBeVisible();
  const go = page.getByRole("button", { name: "Accelerate" });
  const box = await go.boundingBox();
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(box.y + box.height).toBeLessThanOrEqual(844);
  const session = await context.newCDPSession(page);
  const goPoint = {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
    id: 1,
  };
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [goPoint],
  });
  await expect
    .poll(() => page.evaluate(() => window.__tideline.state.speed))
    .toBeGreaterThan(3);
  const right = await page
    .getByRole("button", { name: "Steer right" })
    .boundingBox();
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      goPoint,
      { x: right.x + right.width / 2, y: right.y + right.height / 2, id: 2 },
    ],
  });
  await expect
    .poll(() => page.evaluate(() => window.__tideline.state.heading))
    .toBeLessThan(-0.1);
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await page.getByRole("button", { name: "Pause game" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator("#touch-controls")).toBeHidden();
  await page.getByRole("button", { name: "BACK TO THE WATER" }).click();
  await page.setViewportSize({ width: 667, height: 320 });
  const landscapeGo = await go.boundingBox();
  expect(landscapeGo.y + landscapeGo.height).toBeLessThanOrEqual(320);
  expect(landscapeGo.x + landscapeGo.width).toBeLessThanOrEqual(667);
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(
    320,
  );
  await context.close();
});

test("production build works when uploaded to a nested static directory", async ({
  page,
}) => {
  const prefix = "/arcade/tideline/";
  const root = new URL("../../dist/", import.meta.url);
  const mime = {
    html: "text/html",
    js: "text/javascript",
    css: "text/css",
    svg: "image/svg+xml",
    woff2: "font/woff2",
    txt: "text/plain",
  };
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    const file = new URL(pathname.slice(prefix.length) || "index.html", root);
    if (!pathname.startsWith(prefix) || !file.href.startsWith(root.href)) {
      response.writeHead(404).end();
      return;
    }
    try {
      const bytes = await readFile(file);
      response
        .writeHead(200, {
          "Content-Type":
            mime[file.pathname.split(".").at(-1)] || "application/octet-stream",
        })
        .end(bytes);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400) errors.push(response.url());
  });
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}${prefix}`);
    await expect(page.locator("#loading")).toBeHidden();
    await page.getByRole("button", { name: "LET’S RIDE", exact: true }).click();
    await expect(page.locator("#hud")).toBeVisible();
    expect(
      await page.evaluate(() =>
        document.fonts.check('800 16px "Barlow Condensed"'),
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await page.goto("about:blank");
    await new Promise((resolve) => server.close(resolve));
  }
});
