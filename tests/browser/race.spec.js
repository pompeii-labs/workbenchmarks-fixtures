import { test, expect } from "@playwright/test";
import { GATES } from "../../src/course.js";

test("a complete driven lap updates timing, survives pause, and saves its record", async ({ page }) => {
  test.setTimeout(240000);
  await page.goto("/");
  await expect(page.locator("#loading")).toBeHidden();
  await page.locator("#start").click();
  await expect(page.locator("#lap-time")).toHaveText("00:00.00");
  await expect(page.locator("#best-lap")).toHaveText("--:--.--");

  // Drive with the same keyboard events as a player, using only read-only snapshots.
  await page.evaluate((gates) => {
    const held = new Set();
    let nextGate = 0, recovering = false, wasOnRamp = false;
    const progress = { gates: [], rampContact: false, rampLaunch: false, finished: false };
    window.__raceDrive = progress;
    function key(code, down) {
      if (held.has(code) === down) return;
      if (down) held.add(code); else held.delete(code);
      window.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { code }));
    }
    function drive() {
      const ride = window.__tideline.state;
      if (ride.race.nextGate !== nextGate) {
        progress.gates.push(nextGate);
        nextGate = ride.race.nextGate;
        recovering = false;
      }
      progress.rampContact ||= Boolean(ride.rampContact);
      progress.rampLaunch ||= wasOnRamp && ride.airborne;
      wasOnRamp = Boolean(ride.rampContact);
      if (ride.race.lap > 1) {
        for (const code of [...held]) key(code, false);
        progress.finished = true;
        return;
      }
      if (ride.mode === "playing") {
        const gate = gates[nextGate];
        const dx = -Math.sin(gate.heading), dz = -Math.cos(gate.heading);
        const along = (ride.x - gate.x) * dx + (ride.z - gate.z) * dz;
        if (along > 3) recovering = true;
        if (along < -45) recovering = false;
        const lead = recovering ? -65 : 10;
        const bearing = Math.atan2(-(gate.x + dx * lead - ride.x), -(gate.z + dz * lead - ride.z));
        const difference = Math.atan2(Math.sin(bearing - ride.heading), Math.cos(bearing - ride.heading));
        const steer = difference - ride.steering * 0.16;
        key("KeyW", true);
        key("KeyA", steer > 0.035);
        key("KeyD", steer < -0.035);
        key("KeyS", ride.speed > (Math.abs(difference) > 0.4 ? 14 : 24));
      } else {
        for (const code of [...held]) key(code, false);
      }
      requestAnimationFrame(drive);
    }
    requestAnimationFrame(drive);
  }, GATES);

  await expect.poll(() => page.evaluate(() => window.__tideline.state.race.started)).toBe(true);
  await expect(page.locator("#lap-time")).not.toHaveText("00:00.00");
  await page.keyboard.press("Escape");
  const paused = await page.evaluate(() => window.__tideline.state.race.elapsed);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__tideline.state.race.elapsed)).toBe(paused);
  await page.locator("#resume").click();
  await expect.poll(() => page.evaluate(() => window.__raceDrive.finished), { timeout: 200000 }).toBe(true);
  const state = await page.evaluate(() => window.__tideline.state);
  expect(state.race.lastLap).toBeGreaterThan(30);
  expect(state.race.bestLap).toBe(state.race.lastLap);
  expect(await page.evaluate(() => window.__raceDrive.gates)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 0]);
  expect(await page.evaluate(() => window.__raceDrive.rampContact)).toBe(true);
  expect(await page.evaluate(() => window.__raceDrive.rampLaunch)).toBe(true);
  const record = await page.locator("#best-lap").textContent();
  await expect(page.locator("#last-lap")).toHaveText(`LAST ${record}`);
  await page.keyboard.press("r");
  await expect(page.locator("#lap-time")).toHaveText("00:00.00");
  await expect(page.locator("#best-lap")).toHaveText(record);
  await page.reload();
  await page.locator("#start").click();
  await expect(page.locator("#best-lap")).toHaveText(record);
});

test("lap records tolerate unavailable or malformed browser storage", async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem("tideline-circuit-v1-best", "not-a-time"); } catch { /* Disabled storage is tested on reload. */ }
  });
  await page.goto("/");
  await expect(page.locator("#loading")).toBeHidden();
  await page.locator("#start").click();
  await expect(page.locator("#best-lap")).toHaveText("--:--.--");
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", { get() { throw new Error("Storage is disabled"); } });
  });
  await page.reload();
  await page.locator("#start").click();
  await expect(page.locator("#hud")).toBeVisible();
  await expect(page.locator("#best-lap")).toHaveText("--:--.--");
});
