import { GATES, RAMPS, newRace, stepRace } from "./course.js";
import { newRide, stepRide, resolveRideCollisions, waveHeight } from "./physics.js";

export const RACE_LAPS = 2;
export const RIDERS = [
  { name: "YOU", color: "#f15b35", lane: 0, pace: 25 },
  { name: "REEF", color: "#207eaa", lane: -2.8, pace: 24.5 },
  { name: "SUNNY", color: "#e5ad27", lane: 2.8, pace: 23.5 },
  { name: "RIPTIDE", color: "#875ab7", lane: 0.8, pace: 25.5 },
];

export function newCompetition(bestLap = null, time = 8) {
  return {
    elapsed: 0,
    racers: RIDERS.map((rider, index) => {
      const ride = newRide();
      ride.x = index === 1 ? -6 : index === 2 ? 6 : 0;
      ride.z = index === 3 ? 43 : 35;
      ride.y = waveHeight(ride.x, ride.z, time) + 0.47;
      return {
        ...rider, id: index, ride, race: newRace(index === 0 ? bestLap : null),
        finishTime: null, recovering: false, targetGate: 0, rampStage: 0,
      };
    }),
  };
}

export function opponentInput(racer) {
  const { ride, race } = racer;
  if (racer.finishTime !== null) return { brake: true };
  if (racer.targetGate !== race.nextGate) {
    racer.targetGate = race.nextGate;
    racer.recovering = false;
    racer.rampStage = 0;
  }
  const gate = GATES[race.nextGate];
  const dx = -Math.sin(gate.heading), dz = -Math.cos(gate.heading);
  const along = (ride.x - gate.x) * dx + (ride.z - gate.z) * dz;
  if (along > 4) racer.recovering = true;
  if (along < -45) racer.recovering = false;
  const lead = racer.recovering ? -65 : 14;
  let x = gate.x + dx * lead + Math.cos(gate.heading) * racer.lane;
  let z = gate.z + dz * lead - Math.sin(gate.heading) * racer.lane;

  // Approach each ramp on its centerline before aiming beyond the lip. Gates
  // remain authoritative, including when a collision forces a recovery loop.
  const ramp = race.nextGate === 1 ? RAMPS[0] : race.nextGate === 6 ? RAMPS[1] : null;
  if (ramp && !racer.recovering && racer.rampStage < 2) {
    const rx = -Math.sin(ramp.heading), rz = -Math.cos(ramp.heading);
    const rampAlong = (ride.x - ramp.x) * rx + (ride.z - ramp.z) * rz;
    const entryX = ramp.x - rx * 38 + Math.cos(ramp.heading) * racer.lane;
    const entryZ = ramp.z - rz * 38 - Math.sin(ramp.heading) * racer.lane;
    if (racer.rampStage === 0 &&
        (Math.hypot(ride.x - entryX, ride.z - entryZ) < 12 || rampAlong > -30))
      racer.rampStage = 1;
    if (rampAlong > 28) racer.rampStage = 2;
    if (racer.rampStage === 0) { x = entryX; z = entryZ; }
    else if (racer.rampStage === 1) {
      x = ramp.x + rx * 40 + Math.cos(ramp.heading) * racer.lane;
      z = ramp.z + rz * 40 - Math.sin(ramp.heading) * racer.lane;
    }
  }
  const bearing = Math.atan2(-(x - ride.x), -(z - ride.z));
  const error = Math.atan2(Math.sin(bearing - ride.heading), Math.cos(bearing - ride.heading));
  const targetSpeed = Math.abs(error) > 0.5 ? 14 : racer.pace;
  return {
    forward: true,
    steer: (error - ride.steering * 0.16) * 2.6,
    brake: ride.speed > targetSpeed + 0.4,
    boost: !racer.recovering && Math.abs(error) < 0.12 &&
      Math.hypot(x - ride.x, z - ride.z) > 80 && ride.boost > 0.35,
  };
}

export function raceProgress(racer) {
  const { race, ride } = racer;
  const passed = race.started ? (race.lap - 1) * GATES.length +
    (race.nextGate === 0 ? GATES.length : race.nextGate) : 0;
  const gate = GATES[race.nextGate];
  const previous = GATES[(race.nextGate + GATES.length - 1) % GATES.length];
  const start = !race.started ? { x: 0, z: 35 } : previous;
  const dx = gate.x - start.x, dz = gate.z - start.z;
  const fraction = ((ride.x - start.x) * dx + (ride.z - start.z) * dz) / (dx * dx + dz * dz);
  return passed + Math.max(0, Math.min(0.999, fraction));
}

export function standings(competition) {
  return [...competition.racers].sort((a, b) => {
    if (a.finishTime !== null || b.finishTime !== null) {
      if (a.finishTime === null) return 1;
      if (b.finishTime === null) return -1;
      return a.finishTime - b.finishTime || a.id - b.id;
    }
    return raceProgress(b) - raceProgress(a) || a.id - b.id;
  });
}

export function stepCompetition(competition, input, time, dt) {
  competition.elapsed += dt;
  const previous = competition.racers.map(({ ride }) => ({ x: ride.x, z: ride.z }));
  const events = competition.racers.map((racer, index) =>
    stepRide(racer.ride, index === 0 ? input : opponentInput(racer), time, dt));
  const impacts = resolveRideCollisions(competition.racers.map(({ ride }) => ride));
  const courseEvents = competition.racers.map((racer, index) => {
    if (racer.finishTime !== null) return null;
    const event = stepRace(racer.race, previous[index], racer.ride, dt);
    if (event?.type === "lap" && racer.race.lap > RACE_LAPS)
      racer.finishTime = competition.elapsed - racer.race.elapsed;
    return event;
  });
  return { events, impacts, courseEvents };
}
