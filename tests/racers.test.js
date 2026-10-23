import test from "node:test";
import assert from "node:assert/strict";
import { GATES, RAMPS } from "../src/course.js";
import { RACE_LAPS, newCompetition, opponentInput, raceProgress, standings, stepCompetition } from "../src/racers.js";

test("all rivals complete two ordered laps and ride both ramps on different seas", () => {
  for (const start of [0, 8, 80]) {
    const competition = newCompetition(null, start);
    const contacts = competition.racers.map(() => new Set());
    const launches = competition.racers.map(() => new Set());
    const lastRamp = Array(4).fill(null);
    const gates = competition.racers.map(() => []);
    for (let tick = 1; tick < 90 * 200; tick++) {
      const result = stepCompetition(competition, {}, start + tick / 90, 1 / 90);
      competition.racers.forEach((racer, i) => {
        const ramp = racer.ride.rampContact;
        if (ramp) {
          contacts[i].add(ramp);
          lastRamp[i] = ramp;
        }
        if (result.events[i].launched && lastRamp[i]) launches[i].add(lastRamp[i]);
        if (result.courseEvents[i]) gates[i].push(result.courseEvents[i].type);
        if (!ramp) lastRamp[i] = null;
      });
      if (competition.racers.slice(1).every((racer) => racer.finishTime !== null)) break;
    }
    for (const racer of competition.racers.slice(1)) {
      assert.equal(racer.race.lap, RACE_LAPS + 1, `${racer.name} finishes at phase ${start}`);
      assert.ok(racer.finishTime > 100 && racer.finishTime < 200);
      assert.equal(gates[racer.id].filter((type) => type === "gate").length, 14);
      assert.equal(gates[racer.id].filter((type) => type === "lap").length, 2);
      for (const ramp of RAMPS) {
        assert.ok(contacts[racer.id].has(ramp), `${racer.name} rides ramp ${ramp.x}`);
        assert.ok(launches[racer.id].has(ramp), `${racer.name} launches from ramp ${ramp.x}`);
      }
    }
  }
});

test("a rival knocked past a gate circles back and crosses in the proper direction", () => {
  const competition = newCompetition();
  const racer = competition.racers[1];
  const gate = GATES[3];
  racer.race.started = true;
  racer.race.nextGate = 3;
  racer.ride.x = gate.x - Math.sin(gate.heading) * 25 + Math.cos(gate.heading) * 45;
  racer.ride.z = gate.z - Math.cos(gate.heading) * 25 - Math.sin(gate.heading) * 45;
  racer.ride.heading = gate.heading;
  racer.ride.speed = 23;
  opponentInput(racer);
  assert.equal(racer.recovering, true);
  for (let tick = 1; tick < 90 * 40 && racer.race.nextGate === 3; tick++)
    stepCompetition(competition, {}, 8 + tick / 90, 1 / 90);
  assert.equal(racer.race.nextGate, 4);
});

test("standings use ordered gates and clamped leg progress, then interpolated finish times", () => {
  const competition = newCompetition();
  const [player, reef, sunny, riptide] = competition.racers;
  assert.equal(standings(competition)[0], player);
  player.ride.z = -400;
  reef.race.started = true;
  reef.race.nextGate = 1;
  reef.ride.z = -80;
  assert.equal(standings(competition)[0], reef, "a shortcut cannot beat a valid start");
  player.race.started = true;
  player.race.nextGate = 1;
  player.ride.z = -150;
  assert.equal(standings(competition)[0], player);
  sunny.race.started = true;
  sunny.race.nextGate = 2;
  sunny.ride.x = 2000;
  sunny.ride.z = 2000;
  assert.equal(standings(competition)[0], sunny, "cleared gates beat distance to the finish");
  assert.ok(raceProgress(player) >= 1 && raceProgress(player) < 2);
  reef.finishTime = 150.01;
  riptide.finishTime = 150;
  assert.deepEqual(standings(competition).map(({ id }) => id), [3, 1, 2, 0]);
});

test("the second valid lap finishes exactly once and reset preserves only the player's record", () => {
  const competition = newCompetition(500);
  const player = competition.racers[0];
  // Position immediately before each gate, then cross through normal physics.
  function cross(index) {
    const gate = GATES[index];
    Object.assign(player.ride, {
      x: gate.x + Math.sin(gate.heading) * 0.1,
      z: gate.z + Math.cos(gate.heading) * 0.1,
      heading: gate.heading, speed: 20, pushX: 0, pushZ: 0,
    });
    return stepCompetition(competition, { forward: true }, 8 + competition.elapsed, 1 / 90);
  }
  cross(0);
  for (let lap = 0; lap < RACE_LAPS; lap++) {
    for (let gate = 1; gate < GATES.length; gate++) cross(gate);
    const result = cross(0);
    assert.equal(result.courseEvents[0].type, "lap");
    assert.equal(player.finishTime !== null, lap === RACE_LAPS - 1);
  }
  assert.ok(player.finishTime < competition.elapsed);
  const finish = player.finishTime;
  const best = player.race.bestLap;
  assert.equal(cross(0).courseEvents[0], null);
  assert.equal(player.finishTime, finish);
  const reset = newCompetition(best);
  assert.equal(reset.elapsed, 0);
  assert.equal(reset.racers[0].race.bestLap, best);
  assert.ok(reset.racers.every((racer) => racer.finishTime === null && !racer.race.started));
  assert.ok(reset.racers.slice(1).every((racer) => racer.race.bestLap === null));
});
