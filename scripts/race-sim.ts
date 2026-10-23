// Headless race check (bun scripts/race-sim.ts [seed] [laps]): the player seat is
// driven by the same AI, every rival must finish, take ramps, and bump.
import { createRace, stepRace, player, ordinal } from '../src/sim/race';
import { IDLE } from '../src/sim/sim';

const seed = Number(process.argv[2] ?? 1);
const laps = Number(process.argv[3] ?? 3);
const w = createRace(seed, { phase: 'countdown', laps });
let steps = 0;
const maxSteps = 60 * 60 * 8;
while (steps < maxSteps && w.finishOrder.length < w.racers.length) {
  stepRace(w, IDLE, true);
  steps += 1;
}
const rows = w.racers
  .slice()
  .sort((a, b) => a.place - b.place)
  .map((r) => ({
    place: ordinal(r.place),
    name: r.name,
    finished: r.finished,
    time: r.finishTime.toFixed(2),
    best: r.s.race.bestLap.toFixed(2),
    laps: r.s.race.laps,
    rampJumps: r.s.rampJumps,
    jumps: r.s.jumps,
    wipeouts: r.s.wipeouts,
    bumps: r.s.bumps,
  }));
console.table(rows);
console.log({ steps, t: w.t.toFixed(1), bumpsPlayerRival: w.bumpsPlayerRival, bumpsRivalRival: w.bumpsRivalRival, playerPlace: player(w).place });
