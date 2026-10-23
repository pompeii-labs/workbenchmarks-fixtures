import test from "node:test";
import assert from "node:assert/strict";
import { COURSE, GATES, RAMPS, newRace, stepRace, formatLap } from "../src/course.js";

function cross(race, index, dt = 1, offset = 0, reverse = false) {
  const gate = GATES[index];
  const dx = -Math.sin(gate.heading), dz = -Math.cos(gate.heading);
  const a = { x: gate.x - dx * 5 + dz * offset, z: gate.z - dz * 5 - dx * offset };
  const b = { x: gate.x + dx * 5 + dz * offset, z: gate.z + dz * 5 - dx * offset };
  return stepRace(race, reverse ? b : a, reverse ? a : b, dt);
}

test("course has genuine turns, two aligned ramps, and a clear start straight", () => {
  assert.equal(COURSE.length, 8);
  assert.equal(GATES[0].heading, 0);
  assert.equal(GATES[1].heading, 0);
  assert.ok(new Set(GATES.map((gate) => gate.heading.toFixed(1))).size >= 6);
  assert.equal(RAMPS.length, 2);
  for (const ramp of RAMPS) assert.ok(ramp.height >= 4 && ramp.width < GATES[0].halfWidth * 2);
});

test("timer waits for start, rejects reverse and missed gates, and starts at crossing instant", () => {
  const race = newRace();
  assert.equal(cross(race, 1), null);
  assert.equal(cross(race, 0, 1, 0, true), null);
  assert.equal(cross(race, 0, 1, 19), null);
  assert.equal(race.elapsed, 0);
  assert.deepEqual(cross(race, 0), { type: "start" });
  assert.equal(race.elapsed, 0.5);
  assert.equal(race.nextGate, 1);
  assert.equal(race.lastLap, null);
});

test("all gates must be crossed in order before a lap can finish", () => {
  const race = newRace();
  cross(race, 0);
  assert.equal(cross(race, 0), null);
  assert.equal(cross(race, 2), null);
  assert.equal(race.lap, 1);
  for (let i = 1; i < GATES.length; i++) assert.equal(cross(race, i).type, "gate");
  assert.equal(race.nextGate, 0);
  assert.deepEqual(cross(race, 0), { type: "lap", record: true });
  assert.equal(race.lap, 2);
  assert.equal(race.lastLap, 10);
  assert.equal(race.bestLap, 10);
  assert.equal(race.elapsed, 0.5);
});

test("best lap only changes for a faster lap and is preserved on reset", () => {
  const race = newRace(20);
  cross(race, 0);
  for (let i = 1; i < GATES.length; i++) cross(race, i);
  assert.equal(cross(race, 0).record, true);
  assert.equal(race.bestLap, 8);
  for (let i = 1; i < GATES.length; i++) cross(race, i, 2);
  assert.equal(cross(race, 0, 2).record, false);
  assert.equal(race.bestLap, 8);
  const reset = newRace(race.bestLap);
  assert.equal(reset.bestLap, 8);
  assert.equal(reset.elapsed, 0);
  assert.equal(reset.started, false);
});

test("swept gate detection counts a fast crossing, not a nearby or repeated pass", () => {
  const race = newRace();
  assert.equal(stepRace(race, { x: 0, z: 100 }, { x: 0, z: -150 }, 1).type, "start");
  assert.ok(Math.abs(race.elapsed - 0.32) < 1e-12);
  assert.equal(stepRace(race, { x: 0, z: -150 }, { x: 0, z: -151 }, 1), null);
  assert.equal(race.nextGate, 1);
});

test("lap formatting uses hundredths and handles missing records", () => {
  assert.equal(formatLap(null), "--:--.--");
  assert.equal(formatLap(0), "00:00.00");
  assert.equal(formatLap(69.129), "01:09.12");
  assert.equal(formatLap(59.999), "00:59.99");
});
