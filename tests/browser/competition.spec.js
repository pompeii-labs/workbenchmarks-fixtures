import { test, expect } from "@playwright/test";
import { GATES } from "../../src/course.js";
import { RACE_LAPS } from "../../src/racers.js";

test("race rivals for two laps, show accessible results, explore, and rematch", async ({ page }) => {
  test.setTimeout(480000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator("#loading")).toBeHidden();
  await page.locator("#start").click();
  await expect(page.locator("#race-order li")).toHaveCount(4);
  await expect(page.locator(".map-opponent")).toHaveCount(3);

  // Use only real keyboard input and the read-only game snapshot. No teleporting
  // or race-state injection: the player must clear both laps against live AI.
  await page.evaluate((gates) => {
    const held = new Set();
    let nextGate = 0, recovering = false;
    function key(code, down) {
      if (held.has(code) === down) return;
      if (down) held.add(code); else held.delete(code);
      window.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { code }));
    }
    function drive() {
      const ride = window.__tideline.state;
      if (ride.mode === "finished") {
        for (const code of [...held]) key(code, false);
        return;
      }
      if (ride.race.nextGate !== nextGate) {
        nextGate = ride.race.nextGate;
        recovering = false;
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

  await expect.poll(() => page.evaluate(() => window.__tideline.state.racers[1].distance)).toBeGreaterThan(30);
  await page.keyboard.press("Escape");
  const paused = await page.evaluate(() => window.__tideline.state);
  await page.waitForTimeout(250);
  const still = await page.evaluate(() => window.__tideline.state);
  expect(still.raceElapsed).toBe(paused.raceElapsed);
  expect(still.racers.map(({ x, z }) => [x, z])).toEqual(paused.racers.map(({ x, z }) => [x, z]));
  await page.locator("#resume").click();
  await expect(page.locator("#finish")).toBeVisible({ timeout: 420000 });
  const state = await page.evaluate(() => window.__tideline.state);
  expect(state.race.lap).toBe(RACE_LAPS + 1);
  expect(state.racers[0].finishTime).toBeGreaterThan(100);
  await expect(page.locator("#finish-results li")).toHaveCount(4);
  await expect(page.locator("#finish-results .you b")).toHaveText(String(state.position));
  await expect(page.locator("#finish-summary")).toContainText(`You finished ${state.position} / 4`);
  await expect(page.locator("#race-again")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(page.locator("#free-ride")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.locator("#race-again")).toBeFocused();
  await page.waitForTimeout(200);
  expect((await page.evaluate(() => window.__tideline.state)).raceElapsed).toBe(state.raceElapsed);

  for (const viewport of [{ width: 320, height: 740 }, { width: 667, height: 320 }]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);
    await page.locator("#race-again").scrollIntoViewIfNeeded();
    await expect(page.locator("#race-again")).toBeInViewport();
    await page.locator("#free-ride").scrollIntoViewIfNeeded();
    await expect(page.locator("#free-ride")).toBeInViewport();
  }
  await page.locator("#free-ride").click();
  await expect(page.locator("#finish")).toBeHidden();
  expect(await page.evaluate(() => window.__tideline.state.mode)).toBe("roaming");
  await page.keyboard.press("Escape");
  await page.locator("#resume").click();
  expect(await page.evaluate(() => window.__tideline.state.mode)).toBe("roaming");
  await page.keyboard.press("r");
  expect(await page.evaluate(() => window.__tideline.state.racers.every((racer) => racer.finishTime === null && !racer.race.started))).toBe(true);
  expect(errors).toEqual([]);
});
