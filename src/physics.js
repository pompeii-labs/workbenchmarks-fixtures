export const WAVES = [
  { amplitude: 1.6, k: 0.132, x: 0.28, z: 0.96, speed: 1.18 },
  { amplitude: 0.64, k: 0.27, x: -0.65, z: 0.76, speed: 1.63 },
  { amplitude: 0.23, k: 0.64, x: 0.8, z: 0.6, speed: 2.1 },
  { amplitude: 0.09, k: 1.45, x: -0.4, z: 0.92, speed: 2.8 },
];

export function waterAt(x, z, time) {
  let height = 0,
    dx = 0,
    dz = 0;
  for (const w of WAVES) {
    const p = w.k * (w.x * x + w.z * z) - time * w.speed;
    height += w.amplitude * Math.sin(p);
    dx += w.amplitude * w.k * w.x * Math.cos(p);
    dz += w.amplitude * w.k * w.z * Math.cos(p);
  }
  return { height, dx, dz };
}

export function createRider() {
  return {
    x: 0,
    z: 16,
    y: 0,
    heading: 0,
    speed: 0,
    vy: 0,
    air: false,
    airTime: 0,
    airPeak: 0,
    jumpBase: 0,
    jumpCooldown: 0,
    boost: 1,
    boosting: false,
    bank: 0,
    pitch: 0,
    distance: 0,
    bestAir: 0,
    score: 0,
    gates: 0,
  };
}

export function stepRider(r, input, dt, time) {
  const events = [];
  const throttle = Number(input.gas) - Number(input.brake);
  r.boosting = input.boost && input.gas && r.boost > 0.025 && r.speed > 5;
  r.boost = Math.max(
    0,
    Math.min(1, r.boost + (r.boosting ? -0.22 : 0.09) * dt),
  );
  const acceleration =
    throttle > 0 ? (r.boosting ? 19 : 12) : throttle < 0 ? -24 : -3.7;
  const maximum = r.boosting ? 46 : 32;
  r.speed =
    throttle > 0
      ? r.speed > maximum
        ? Math.max(maximum, r.speed - 12 * dt)
        : Math.min(maximum, r.speed + acceleration * dt)
      : Math.max(0, r.speed + acceleration * dt);
  const steer = Number(input.left) - Number(input.right);
  r.heading +=
    steer * (0.45 + Math.min(r.speed / 25, 1) * 0.78) * dt * (r.air ? 0.6 : 1);
  r.bank +=
    (steer * Math.min(r.speed / 32, 1) * 0.42 - r.bank) * Math.min(1, dt * 7);
  const vx = -Math.sin(r.heading) * r.speed;
  const vz = -Math.cos(r.heading) * r.speed;
  r.x += vx * dt;
  r.z += vz * dt;
  r.distance += r.speed * dt;
  const water = waterAt(r.x, r.z, time);
  const surface = water.height + 0.58;
  r.jumpCooldown = Math.max(0, r.jumpCooldown - dt);
  if (r.air) {
    r.vy -= 14 * dt;
    r.y += r.vy * dt;
    r.airTime += dt;
    r.airPeak = Math.max(r.airPeak, r.y - water.height - 0.58);
    r.pitch +=
      (Math.max(-0.35, Math.min(0.35, r.vy * 0.025)) - r.pitch) *
      Math.min(1, dt * 3);
    if (r.y <= surface && r.vy < 0) {
      r.air = false;
      r.y = surface;
      r.jumpCooldown = 0.65;
      r.bestAir = Math.max(r.bestAir, r.airPeak);
      const points = Math.round(r.airPeak * 45 + r.airTime * 60);
      r.score += points;
      events.push({
        type: "land",
        height: r.airPeak,
        duration: r.airTime,
        points,
        impact: -r.vy,
      });
      r.vy = 0;
    }
  } else {
    r.y = surface;
    const slope =
      -water.dx * Math.sin(r.heading) - water.dz * Math.cos(r.heading);
    r.pitch += (Math.atan(slope) * 0.8 - r.pitch) * Math.min(1, dt * 8);
    const main = WAVES[0];
    const phase = main.k * (main.x * r.x + main.z * r.z) - time * main.speed;
    // Launch up the face, before the crest falls away underneath the hull.
    if (
      r.speed > 17 &&
      slope > 0.15 &&
      Math.sin(phase) > 0.45 &&
      r.jumpCooldown === 0
    ) {
      r.air = true;
      r.vy = 5.4 + r.speed * 0.18 + Math.max(0, slope) * 3;
      r.airTime = 0;
      r.airPeak = 0;
      r.jumpBase = surface;
      events.push({ type: "launch" });
    }
  }
  return events;
}
