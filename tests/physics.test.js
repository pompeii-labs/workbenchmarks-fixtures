import test from "node:test";
import assert from "node:assert/strict";
import { WAVES, waterAt, createRider, stepRider } from "../src/physics.js";

const idle = {
  gas: false,
  brake: false,
  left: false,
  right: false,
  boost: false,
};
const gas = { ...idle, gas: true };
const boosted = { ...gas, boost: true };

function near(actual, expected, tolerance = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

function ride(rider, input, seconds, dt = 1 / 60, start = 0) {
  const events = [];
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    events.push(...stepRider(rider, input, dt, start + (i + 1) * dt));
  }
  return events;
}

test("water is deterministic, finite, bounded, and varies with position and time", () => {
  const bound = WAVES.reduce((sum, wave) => sum + Math.abs(wave.amplitude), 0);
  for (const [x, z, time] of [
    [0, 0, 0],
    [12.3, -45.6, 7.8],
    [-900, 2100, 1234],
  ]) {
    const sample = waterAt(x, z, time);
    assert.deepEqual(sample, waterAt(x, z, time));
    for (const value of Object.values(sample))
      assert.ok(Number.isFinite(value));
    assert.ok(Math.abs(sample.height) <= bound);
    assert.notEqual(sample.height, waterAt(x + 2, z, time).height);
    assert.notEqual(sample.height, waterAt(x, z + 2, time).height);
    assert.notEqual(sample.height, waterAt(x, z, time + 1).height);
  }
  near(waterAt(0, 0, 0).height, 0);
});

test("water spatial derivatives agree with central finite differences", () => {
  const h = 1e-4;
  for (const [x, z, time] of [
    [0, 0, 0],
    [12.3, -45.6, 7.8],
    [-111, 223, 97],
  ]) {
    const { dx, dz } = waterAt(x, z, time);
    near(
      dx,
      (waterAt(x + h, z, time).height - waterAt(x - h, z, time).height) /
        (2 * h),
      1e-7,
    );
    near(
      dz,
      (waterAt(x, z + h, time).height - waterAt(x, z - h, time).height) /
        (2 * h),
      1e-7,
    );
  }
});

test("new riders have independent, clean session state", () => {
  const rider = createRider();
  const other = createRider();
  assert.notStrictEqual(rider, other);
  assert.deepEqual(rider, other);
  assert.equal(rider.speed, 0);
  assert.equal(rider.boost, 1);
  assert.equal(rider.air, false);
  for (const key of ["distance", "score", "bestAir", "gates"])
    assert.equal(rider[key], 0);
  ride(rider, gas, 1);
  assert.equal(other.speed, 0);
  assert.equal(other.distance, 0);
});

test("throttle accelerates forward and settles at the normal top speed", () => {
  const rider = createRider();
  ride(rider, gas, 1);
  near(rider.speed, 12);
  assert.ok(rider.z < 16);
  near(rider.x, 0);
  assert.ok(rider.distance > 0);
  ride(rider, gas, 19, 1 / 60, 1);
  near(rider.speed, 32);
});

test("boost increases acceleration without exceeding the boosted top speed", () => {
  const rider = createRider();
  const normal = createRider();
  rider.speed = normal.speed = 20;
  ride(rider, boosted, 0.5);
  ride(normal, gas, 0.5);
  assert.ok(rider.speed > normal.speed);
  assert.equal(rider.boosting, true);
  let peak = rider.speed;
  for (let i = 0; i < 180; i++) {
    stepRider(rider, boosted, 1 / 60, 0.5 + (i + 1) / 60);
    peak = Math.max(peak, rider.speed);
  }
  assert.ok(peak > 32, "boost should exceed cruising speed");
  assert.ok(peak <= 46 + 1e-9, `boosted speed exceeded 46: ${peak}`);
});

test("boost requires acceleration, reserve, and forward speed", () => {
  for (const [speed, reserve, input] of [
    [20, 1, { ...idle, boost: true }],
    [0, 1, boosted],
    [5, 1, boosted],
    [20, 0, boosted],
    [20, 0.025, boosted],
  ]) {
    const rider = createRider();
    rider.speed = speed;
    rider.boost = reserve;
    stepRider(rider, input, 1 / 60, 1 / 60);
    assert.equal(rider.boosting, false);
    assert.ok(rider.boost >= reserve, "inactive boost should regenerate");
  }
});

test("boost depletes, stops at low reserve, and regenerates to full", () => {
  const rider = createRider();
  rider.speed = 20;
  ride(rider, boosted, 1);
  near(rider.boost, 0.78);
  let minimum = rider.boost;
  let stopped = false;
  for (let i = 0; i < 600; i++) {
    stepRider(rider, boosted, 1 / 60, 1 + (i + 1) / 60);
    assert.ok(rider.boost >= 0 && rider.boost <= 1);
    minimum = Math.min(minimum, rider.boost);
    stopped ||= !rider.boosting;
  }
  assert.ok(minimum <= 0.025, "sustained boost should exhaust usable reserve");
  assert.ok(stopped, "boost must switch off when reserve is low");
  const depleted = rider.boost;
  ride(rider, idle, 1, 1 / 60, 11);
  near(rider.boost, depleted + 0.09);
  ride(rider, idle, 20, 1 / 60, 12);
  assert.equal(rider.boost, 1);
  assert.equal(rider.boosting, false);
});

test("braking stops without reverse and coasting loses speed more slowly", () => {
  const braking = createRider();
  const coasting = createRider();
  braking.speed = coasting.speed = 20;
  ride(braking, { ...idle, brake: true }, 0.5);
  ride(coasting, idle, 0.5);
  near(braking.speed, 8);
  near(coasting.speed, 18.15);
  ride(braking, { ...idle, brake: true }, 2, 1 / 60, 0.5);
  assert.equal(braking.speed, 0);
  const { x, z, distance } = braking;
  ride(braking, { ...idle, brake: true }, 5, 1 / 60, 2.5);
  assert.equal(braking.speed, 0);
  assert.equal(braking.x, x);
  assert.equal(braking.z, z);
  assert.equal(braking.distance, distance);
  ride(coasting, idle, 10, 1 / 60, 0.5);
  assert.equal(coasting.speed, 0);
});

test("steering turns and banks in opposite directions; opposing inputs cancel", () => {
  const left = createRider();
  const right = createRider();
  const both = createRider();
  left.speed = right.speed = both.speed = 12;
  ride(left, { ...gas, left: true }, 0.5);
  ride(right, { ...gas, right: true }, 0.5);
  ride(both, { ...gas, left: true, right: true }, 0.5);
  assert.ok(left.heading > 0 && left.x < 0 && left.bank > 0);
  assert.ok(right.heading < 0 && right.x > 0 && right.bank < 0);
  near(left.heading, -right.heading);
  near(left.x, -right.x);
  near(left.z, right.z);
  near(left.bank, -right.bank);
  near(both.heading, 0);
  near(both.x, 0);
  near(both.bank, 0);
  const bank = Math.abs(left.bank);
  ride(left, gas, 0.5, 1 / 60, 0.5);
  assert.ok(Math.abs(left.bank) < bank);
});

test("grounded pitch raises the bow on rising water and lowers it on falling water", () => {
  for (const [z, time] of [
    [0, 0],
    [15, 2],
    [-20, 6],
    [-90, 12],
  ]) {
    const rider = createRider();
    rider.z = z;
    stepRider(rider, idle, 1 / 60, time);
    const slope = -waterAt(rider.x, rider.z, time).dz;
    // The model faces local -Z: positive X rotation raises the bow.
    assert.equal(Math.sign(rider.pitch), Math.sign(slope));
  }
});

test("airborne steering is weaker than steering on water", () => {
  const grounded = createRider();
  const airborne = createRider();
  grounded.speed = airborne.speed = 12;
  airborne.air = true;
  airborne.y = 100;
  const input = { ...gas, left: true };
  stepRider(grounded, input, 1 / 60, 1 / 60);
  stepRider(airborne, input, 1 / 60, 1 / 60);
  near(airborne.heading, grounded.heading * 0.6);
});

for (const dt of [1 / 30, 1 / 60, 1 / 120]) {
  test(`natural swell launches and scored landings remain stable at dt=${dt}`, () => {
    const rider = createRider();
    let launches = 0;
    let landings = 0;
    let score = 0;
    let best = 0;
    let flight = false;
    for (let i = 0; i < Math.round(60 / dt); i++) {
      const time = (i + 1) * dt;
      const events = stepRider(rider, gas, dt, time);
      for (const [key, value] of Object.entries(rider)) {
        if (typeof value === "number")
          assert.ok(Number.isFinite(value), `${key} must stay finite`);
      }
      assert.ok(rider.speed >= 0 && rider.speed <= 32 + 1e-9);
      assert.ok(rider.boost >= 0 && rider.boost <= 1);
      for (const event of events) {
        if (event.type === "launch") {
          assert.equal(flight, false, "cannot launch twice without landing");
          flight = true;
          launches++;
          assert.equal(rider.air, true);
          assert.ok(rider.vy > 0);
          assert.equal(rider.airTime, 0);
          assert.equal(rider.airPeak, 0);
        } else {
          assert.equal(event.type, "land");
          assert.equal(flight, true, "landing must follow a natural launch");
          flight = false;
          landings++;
          assert.equal(rider.air, false);
          assert.equal(rider.vy, 0);
          assert.ok(event.height > 0 && event.duration > 0 && event.impact > 0);
          assert.equal(
            event.points,
            Math.round(event.height * 45 + event.duration * 60),
          );
          assert.equal(event.height, rider.airPeak);
          assert.equal(event.duration, rider.airTime);
          near(rider.y, waterAt(rider.x, rider.z, time).height + 0.58);
          assert.ok(rider.jumpCooldown > 0);
          score += event.points;
          best = Math.max(best, event.height);
        }
      }
      assert.equal(
        rider.score,
        score,
        "points should only be awarded once per landing",
      );
      assert.equal(
        rider.bestAir,
        best,
        "best air should track the highest completed jump",
      );
    }
    assert.ok(
      launches >= 2,
      "throttle alone should naturally launch off multiple swells",
    );
    assert.ok(landings >= 2, "natural flights should return to the water");
    assert.ok(launches - landings === (rider.air ? 1 : 0));
    assert.ok(rider.distance > 1000);
  });
}

test("ordinary frame steps produce comparable acceleration and travel", () => {
  const riders = [1 / 30, 1 / 60, 1 / 120].map((dt) => {
    const rider = createRider();
    ride(rider, gas, 2, dt);
    near(rider.speed, 24);
    near(rider.heading, 0);
    near(rider.distance, 24, 0.41);
    near(rider.z, 16 - rider.distance);
    return rider;
  });
  near(riders[0].distance, riders[2].distance, 0.31);
});
