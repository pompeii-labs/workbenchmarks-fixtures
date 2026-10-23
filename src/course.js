// Gate centers form an open-water circuit, not a walled track.
export const COURSE = [
  [0, -70],
  [0, -220],
  [-140, -340],
  [-310, -260],
  [-260, -100],
  [-390, 65],
  [-180, 210],
  [70, 130],
];

export const GATES = COURSE.map(([x, z], index) => {
  const previous = COURSE[(index + COURSE.length - 1) % COURSE.length];
  const heading = index === 0 ? 0 : Math.atan2(previous[0] - x, previous[1] - z);
  return { x, z, heading, halfWidth: 18 };
});

export const RAMPS = [
  { x: 0, z: -145, heading: 0, width: 13, length: 20, height: 4.5 },
  { x: -285, z: 137.5, heading: Math.atan2(-210, -145), width: 15, length: 22, height: 5.5 },
];

export function newRace(bestLap = null) {
  return { nextGate: 0, started: false, lap: 1, elapsed: 0, lastLap: null, bestLap };
}

export function stepRace(race, previous, current, dt) {
  const gate = GATES[race.nextGate];
  const dx = -Math.sin(gate.heading), dz = -Math.cos(gate.heading);
  const before = (previous.x - gate.x) * dx + (previous.z - gate.z) * dz;
  const after = (current.x - gate.x) * dx + (current.z - gate.z) * dz;
  const elapsed = race.elapsed;
  if (race.started) race.elapsed += dt;
  if (before >= 0 || after < 0) return null;
  const fraction = -before / (after - before);
  const x = previous.x + (current.x - previous.x) * fraction - gate.x;
  const z = previous.z + (current.z - previous.z) * fraction - gate.z;
  if (Math.abs(x * dz - z * dx) > gate.halfWidth) return null;
  const crossed = race.nextGate;
  race.nextGate = (crossed + 1) % GATES.length;
  if (crossed !== 0) return { type: "gate", gate: crossed };
  if (!race.started) {
    race.started = true;
    race.elapsed = dt * (1 - fraction);
    return { type: "start" };
  }
  race.lastLap = elapsed + dt * fraction;
  const record = race.bestLap === null || race.lastLap < race.bestLap;
  if (record) race.bestLap = race.lastLap;
  race.lap++;
  race.elapsed = dt * (1 - fraction);
  return { type: "lap", record };
}

export function formatLap(seconds) {
  if (seconds === null) return "--:--.--";
  const hundredths = Math.floor(seconds * 100 + 1e-6);
  return `${String(Math.floor(hundredths / 6000)).padStart(2, "0")}:${String(Math.floor(hundredths / 100) % 60).padStart(2, "0")}.${String(hundredths % 100).padStart(2, "0")}`;
}
