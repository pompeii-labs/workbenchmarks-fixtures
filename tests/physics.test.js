import { test } from "node:test";
import assert from "node:assert/strict";
import {
  newRide,
  stepRide,
  waveHeight,
  MAX_SPEED,
  BOOST_SPEED,
} from "../src/physics.js";

function simulate(ride, seconds, controls = {}, startTime = 8, rate = 90) {
  let launched = 0,
    landed = 0;
  for (let i = 0; i < seconds * rate; i++) {
    const events = stepRide(
      ride,
      typeof controls === "function" ? controls(i / rate) : controls,
      startTime + i / rate,
      1 / rate,
    );
    launched += Number(events.launched);
    landed += Number(events.landed);
  }
  return { launched, landed };
}

test("ocean is deterministic, continuous, and finite at distant coordinates", () => {
  for (const [x, z, time] of [
    [0, 0, 0],
    [140, -260, 18],
    [-12000, 15000, 3600],
  ]) {
    const height = waveHeight(x, z, time);
    assert.ok(Number.isFinite(height));
    assert.equal(height, waveHeight(x, z, time));
    assert.ok(Math.abs(height - waveHeight(x + 0.001, z, time)) < 0.01);
  }
});

test("idle craft follows the water without drifting or launching", () => {
  const ride = newRide();
  simulate(ride, 10);
  assert.equal(ride.x, 0);
  assert.equal(ride.z, 35);
  assert.equal(ride.speed, 0);
  assert.equal(ride.airborne, false);
  assert.ok(
    Math.abs(ride.y - waveHeight(0, 35, 8 + 10 - 1 / 90) - 0.47) < 0.001,
  );
});

test("throttle accelerates forward to a bounded cruising speed", () => {
  const ride = newRide();
  simulate(ride, 12, { forward: true });
  assert.ok(ride.speed > 24 && ride.speed <= MAX_SPEED);
  assert.ok(ride.z < -100);
  assert.equal(ride.x, 0);
});

test("boost increases speed, depletes, and refills when released", () => {
  const ride = newRide();
  simulate(ride, 3, { forward: true, boost: true });
  assert.ok(ride.speed > MAX_SPEED && ride.speed <= BOOST_SPEED);
  assert.ok(ride.boost < 0.3 && ride.boost > 0);
  simulate(ride, 3, { forward: true, boost: true }, 11);
  assert.ok(ride.boost < 0.02);
  simulate(ride, 10, { forward: true }, 14);
  assert.equal(ride.boost, 1);
});

test("braking stops the craft and never creates reverse speed", () => {
  const ride = newRide();
  simulate(ride, 7, { forward: true });
  simulate(ride, 5, { brake: true }, 15);
  assert.equal(ride.speed, 0);
  simulate(ride, 2, { brake: true, forward: true, boost: true }, 20);
  assert.equal(ride.speed, 0);
  assert.equal(ride.boosting, false);
});

test("steering changes heading in the correct directions and does not turn at rest", () => {
  const idle = newRide();
  simulate(idle, 3, { left: true });
  assert.equal(idle.heading, 0);
  const left = newRide(),
    right = newRide();
  simulate(left, 5, { forward: true, left: true });
  simulate(right, 5, { forward: true, right: true });
  assert.ok(left.heading > 1);
  assert.ok(right.heading < -1);
  assert.ok(left.x < 0 && right.x > 0);
});

test("swells launch the craft, gravity returns it, and boost creates big jumps", () => {
  const ride = newRide();
  const events = simulate(ride, 90, (t) => ({
    forward: true,
    boost: t % 10 < 3.3,
  }));
  assert.ok(
    events.launched >= 5,
    `Expected multiple jumps, got ${events.launched}`,
  );
  assert.ok(events.landed >= 5, `Expected splashdowns, got ${events.landed}`);
  assert.ok(ride.bestJump > 4, `Expected big air, got ${ride.bestJump}`);
  assert.ok(ride.totalAirTime > 8);
  for (const value of Object.values(ride))
    if (typeof value === "number") assert.ok(Number.isFinite(value));
});

test("fixed-time physics stays consistent across simulation rates", () => {
  const a = newRide(),
    b = newRide();
  simulate(a, 5, { forward: true }, 8, 90);
  simulate(b, 5, { forward: true }, 8, 180);
  assert.ok(Math.abs(a.speed - b.speed) < 0.05);
  assert.ok(Math.abs(a.z - b.z) < 0.2);
});
