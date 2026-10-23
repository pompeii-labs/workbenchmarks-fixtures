import { test } from "node:test";
import assert from "node:assert/strict";
import { newRide, resolveRideCollisions, stepRide } from "../src/physics.js";

function velocity(ride) {
  return {
    x: -Math.sin(ride.heading) * ride.speed + ride.pushX,
    z: -Math.cos(ride.heading) * ride.speed + ride.pushZ,
  };
}

function near(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-9,
    `${message}: expected ${expected}, got ${actual}`);
}

for (const headOn of [false, true]) {
  test(`${headOn ? "head-on" : "rear-end"} collisions exchange equal-mass world momentum`, () => {
    for (const heading of [0, 0.7]) {
      const dx = -Math.sin(heading), dz = -Math.cos(heading);
      const first = { ...newRide(), heading, speed: headOn ? 20 : 24,
        pushX: 1.3, pushZ: -0.4 };
      const second = { ...newRide(), x: first.x + dx * 3.5,
        z: first.z + dz * 3.5, heading: heading + (headOn ? Math.PI : 0),
        speed: headOn ? 20 : 8, pushX: 1.3, pushZ: -0.4 };
      const before = [velocity(first), velocity(second)];
      const closing = (before[1].x - before[0].x) * dx +
        (before[1].z - before[0].z) * dz;
      const expectedImpulse = -closing * (1 + 0.22) / 2;

      const impacts = resolveRideCollisions([first, second]);

      assert.equal(impacts.length, 1);
      assert.equal(impacts[0].a, 0);
      assert.equal(impacts[0].b, 1);
      near(impacts[0].impulse, expectedImpulse, "equal-mass impulse");
      const after = [velocity(first), velocity(second)];
      for (const axis of ["x", "z"]) {
        const normal = axis === "x" ? dx : dz;
        near(after[0][axis], before[0][axis] - normal * expectedImpulse,
          `first hull ${axis} velocity`);
        near(after[1][axis], before[1][axis] + normal * expectedImpulse,
          `second hull ${axis} velocity`);
        near(after[0][axis] + after[1][axis], before[0][axis] + before[1][axis],
          `total ${axis} momentum`);
      }
      near((after[1].x - after[0].x) * dx + (after[1].z - after[0].z) * dz,
        -closing * 0.22, "normal rebound velocity");
      assert.ok(first.speed >= 0 && second.speed >= 0);
    }
  });
}

test("overlapping stationary hulls separate symmetrically without an impulse", () => {
  const first = { ...newRide(), x: -0.5 };
  const second = { ...newRide(), x: 0.5 };

  assert.deepEqual(resolveRideCollisions([first, second]), []);

  assert.ok(first.x < -0.5 && second.x > 0.5);
  near(-0.5 - first.x, second.x - 0.5, "equal positional corrections");
  near(first.x + second.x, 0, "unchanged center of mass");
  near(second.x - first.x, 1.799, "hull clearance with contact slop");
  assert.equal(first.z, 35);
  assert.equal(second.z, 35);
  assert.deepEqual(velocity(first), { x: 0, z: 0 });
  assert.deepEqual(velocity(second), { x: 0, z: 0 });
  const separated = structuredClone([first, second]);
  assert.deepEqual(resolveRideCollisions([first, second]), []);
  assert.deepEqual([first, second], separated);
});

test("a side swipe leaves persistent world push that stepRide moves and damps in water", () => {
  const heading = 0.7;
  const nx = Math.cos(heading), nz = -Math.sin(heading);
  const first = { ...newRide(), heading, speed: 12, pushX: 4 * nx, pushZ: 4 * nz,
    launchCooldown: 100 };
  const second = { ...newRide(), heading, x: 1.4 * nx, z: 35 + 1.4 * nz, speed: 9,
    launchCooldown: 100 };

  const impacts = resolveRideCollisions([first, second]);

  assert.equal(impacts.length, 1);
  near(impacts[0].impulse, 2.44, "sideways impulse");
  near(first.pushX, 1.56 * nx, "striking hull retains sideways x momentum");
  near(first.pushZ, 1.56 * nz, "striking hull retains sideways z momentum");
  near(second.pushX, 2.44 * nx, "struck hull gains sideways x momentum");
  near(second.pushZ, 2.44 * nz, "struck hull gains sideways z momentum");
  near(first.speed, 12, "first tangential speed");
  near(second.speed, 9, "second tangential speed");

  const dt = 1 / 60;
  for (const ride of [first, second]) {
    for (let tick = 1; tick <= 6; tick++) {
      const before = { ...ride };
      stepRide(ride, { left: true }, 8 + tick * dt, dt);
      assert.equal(ride.airborne, false);
      assert.ok(ride.heading > before.heading, "steering changes heading");
      near(ride.x - before.x, (-Math.sin(ride.heading) * ride.speed + before.pushX) * dt,
        "world x push contributes to movement while steering");
      near(ride.z - before.z, (-Math.cos(ride.heading) * ride.speed + before.pushZ) * dt,
        "world z push contributes to movement while steering");
      near(ride.pushX, before.pushX * Math.exp(-1.8 * dt), "water damps x push");
      near(ride.pushZ, before.pushZ * Math.exp(-1.8 * dt), "water damps z push");
      assert.ok(ride.pushX > 0, "collision push persists across steps");
    }
  }
});

test("height-separated airborne hulls do not collide, but same-height airborne hulls do", () => {
  for (const secondAirborne of [false, true]) {
    const first = { ...newRide(), y: 5, airborne: true, pushX: 4 };
    const second = { ...newRide(), x: 1.4, y: 3.49, airborne: secondAirborne };
    const before = structuredClone([first, second]);

    assert.deepEqual(resolveRideCollisions([first, second]), []);
    assert.deepEqual([first, second], before, "no separation or momentum transfer across height gap");

    second.y = first.y;
    assert.equal(resolveRideCollisions([first, second]).length, 1,
      "airborne state alone must not disable hull contacts");
    assert.ok(second.pushX > 0);
  }
});

test("opponents at non-player indices collide exactly like a pair containing the player", () => {
  const playerPair = [
    { ...newRide(), x: 0, pushX: 4, speed: 12 },
    { ...newRide(), x: 1.4, speed: 9 },
  ];
  const opponents = structuredClone(playerPair);
  const distantPlayer = { ...newRide(), x: 100 };
  const beforePlayer = { ...distantPlayer };
  const playerImpacts = resolveRideCollisions(playerPair);
  const opponentImpacts = resolveRideCollisions([distantPlayer, ...opponents]);

  assert.equal(playerImpacts.length, 1);
  assert.deepEqual(opponentImpacts, [
    { a: 1, b: 2, impulse: playerImpacts[0].impulse },
  ]);
  assert.deepEqual(opponents, playerPair);
  assert.deepEqual(distantPlayer, beforePlayer);
});

test("coincident hulls separate with finite positions, velocities, and impulses", () => {
  const first = { ...newRide(), pushX: 4, speed: 12 };
  const second = { ...newRide(), pushX: -4, speed: 9 };

  const impacts = resolveRideCollisions([first, second]);

  assert.ok(impacts.length > 0, "coincident approaching hulls receive an impulse");
  assert.ok(Math.hypot(second.x - first.x, second.z - first.z) > 0);
  near(first.x + second.x, 0, "coincident hull center x");
  near(first.z + second.z, 70, "coincident hull center z");
  for (const ride of [first, second]) {
    for (const [key, value] of Object.entries(ride)) {
      if (typeof value === "number") assert.ok(Number.isFinite(value), `${key} remains finite`);
    }
    for (const value of Object.values(velocity(ride))) assert.ok(Number.isFinite(value));
  }
  for (const { impulse } of impacts) assert.ok(Number.isFinite(impulse) && impulse > 0);
});
