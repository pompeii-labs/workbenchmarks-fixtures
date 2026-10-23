import { RAMPS } from "./course.js";

export const GRAVITY = 12.8;
export const MAX_SPEED = 29;
export const BOOST_SPEED = 42;
export const RAMP_APRON_LENGTH = 6;

// These terms also generate the GPU ocean surface. Physics and visuals share one sea.
export const WAVES = [
  { x: 0.025, z: 0.052, speed: 1.05, amplitude: 1.25 },
  { x: -0.052, z: 0.032, speed: 1.38, amplitude: 0.65 },
  { x: 0.11, z: 0.075, speed: 2.1, amplitude: 0.22 },
  { x: -0.17, z: 0.12, speed: 2.8, amplitude: 0.1 },
];

export function waveHeight(x, z, time) {
  let height = 0;
  for (const wave of WAVES) {
    height +=
      Math.sin(x * wave.x + z * wave.z + time * wave.speed) * wave.amplitude;
  }
  const swell = Math.max(0, Math.sin(x * 0.012 + z * 0.038 + time * 0.8));
  return height + swell ** 6 * 3.8;
}

function rampPosition(ramp, x, z) {
  const sin = Math.sin(ramp.heading), cos = Math.cos(ramp.heading);
  return {
    across: (x - ramp.x) * cos - (z - ramp.z) * sin,
    along: -(x - ramp.x) * sin - (z - ramp.z) * cos,
  };
}

// Absolute deck height, without hull clearance. Shared with the flexible mesh.
export function rampSurfaceHeight(ramp, x, z, time) {
  const { along } = rampPosition(ramp, x, z);
  const base = waveHeight(ramp.x, ramp.z, time);
  const rear = -ramp.length / 2;
  if (along >= rear) return base + (along / ramp.length + 0.5) * ramp.height;
  const progress = Math.max(0, (along - rear + RAMP_APRON_LENGTH) / RAMP_APRON_LENGTH);
  const blend = progress ** 2 * (3 - 2 * progress);
  return waveHeight(x, z, time) * (1 - blend) + base * blend;
}

function rampSlope(ramp, x, z, dx, dz, time) {
  return (rampSurfaceHeight(ramp, x + dx * 0.001, z + dz * 0.001, time) -
    rampSurfaceHeight(ramp, x - dx * 0.001, z - dz * 0.001, time)) / 0.002;
}

export function newRide() {
  return {
    x: 0,
    z: 35,
    y: 0,
    heading: 0,
    speed: 0,
    pushX: 0,
    pushZ: 0,
    verticalSpeed: 0,
    pitch: 0,
    roll: 0,
    steering: 0,
    boost: 1,
    boosting: false,
    airborne: false,
    airTime: 0,
    totalAirTime: 0,
    jumpPeak: 0,
    bestJump: 0,
    launchY: 0,
    launchCooldown: 1,
    rampContact: null,
    distance: 0,
  };
}

export function stepRide(ride, input, time, dt) {
  const wasAirborne = ride.airborne;
  const previousX = ride.x, previousZ = ride.z, previousY = ride.y;
  const forward = input.forward ? 1 : 0;
  const braking = input.brake ? 1 : 0;
  ride.boosting = input.boost && ride.boost > 0.015 && forward && !braking;
  ride.boost = Math.max(
    0,
    Math.min(
      1,
      ride.boost + (ride.boosting ? -0.24 : input.boost ? 0 : 0.105) * dt,
    ),
  );
  const topSpeed = ride.boosting ? BOOST_SPEED : MAX_SPEED;
  const acceleration = forward ? (ride.boosting ? 14 : 8.5) : 0;
  const drag = 0.7 + ride.speed * 0.035 + (braking ? 19 : 0);
  ride.speed = Math.max(
    0,
    Math.min(
      BOOST_SPEED,
      ride.speed +
        (acceleration * Math.max(0, 1 - (ride.speed / topSpeed) ** 3) - drag) *
          dt,
    ),
  );
  const steerInput = input.steer === undefined
    ? (input.left ? 1 : 0) - (input.right ? 1 : 0)
    : Math.max(-1, Math.min(1, input.steer));
  ride.steering += (steerInput - ride.steering) * Math.min(1, dt * 7);
  ride.heading +=
    ride.steering *
    Math.min(1, ride.speed / 8) *
    (ride.airborne ? 0.7 : 1.05) *
    dt;
  const dx = -Math.sin(ride.heading);
  const dz = -Math.cos(ride.heading);
  ride.x += (dx * ride.speed + ride.pushX) * dt;
  ride.z += (dz * ride.speed + ride.pushZ) * dt;
  const grip = Math.exp(-dt * (ride.airborne ? 0.25 : 1.8));
  ride.pushX *= grip;
  ride.pushZ *= grip;
  ride.distance += ride.speed * dt;
  const sea = waveHeight(ride.x, ride.z, time);
  const surfaceY = sea + 0.47;
  const lookAhead = waveHeight(ride.x + dx * 1.6, ride.z + dz * 1.6, time);
  const lookBehind = waveHeight(ride.x - dx * 1.6, ride.z - dz * 1.6, time);
  let slope = (lookAhead - lookBehind) / 3.2;
  const curve = (lookAhead + lookBehind - 2 * sea) / (1.6 * 1.6);
  const surfaceVelocity =
    (waveHeight(
      ride.x + dx * ride.speed * 0.035,
      ride.z + dz * ride.speed * 0.035,
      time + 0.035,
    ) -
      sea) /
    0.035;
  ride.launchCooldown = Math.max(0, ride.launchCooldown - dt);
  let landed = false;
  let landedOnRamp = false;
  let rampHandled = false;
  if (!ride.airborne && !ride.rampContact) {
    for (const ramp of RAMPS) {
      const before = rampPosition(ramp, previousX, previousZ);
      const after = rampPosition(ramp, ride.x, ride.z);
      const rear = -ramp.length / 2 - RAMP_APRON_LENGTH;
      if (before.along > rear || after.along < rear ||
          after.along <= before.along ||
          Math.cos(ride.heading - ramp.heading) < 0.5) continue;
      const fraction = (rear - before.along) / (after.along - before.along);
      const across = before.across + (after.across - before.across) * fraction;
      if (Math.abs(across) > ramp.width / 2) continue;
      ride.rampContact = ramp;
      break;
    }
  }
  if (ride.rampContact && !ride.airborne) {
    rampHandled = true;
    const ramp = ride.rampContact;
    const before = rampPosition(ramp, previousX, previousZ);
    const after = rampPosition(ramp, ride.x, ride.z);
    const halfLength = ramp.length / 2, halfWidth = ramp.width / 2;
    const rear = -halfLength - RAMP_APRON_LENGTH;
    const inside = Math.abs(after.across) <= halfWidth &&
      after.along >= rear && after.along <= halfLength;
    const alignment = Math.cos(ride.heading - ramp.heading);
    const baseVelocity = (waveHeight(ramp.x, ramp.z, time) -
      waveHeight(ramp.x, ramp.z, time - dt)) / dt;
    slope = rampSlope(ramp, ride.x, ride.z, dx, dz, time);
    if (inside) {
      ride.y = rampSurfaceHeight(ramp, ride.x, ride.z, time) + 0.47;
      ride.verticalSpeed = (ride.y - previousY) / dt;
    } else {
      // Resolve the first crossed edge, not just the endpoint (lip vs. side).
      let fraction = 1;
      if (after.along > halfLength)
        fraction = Math.min(fraction, (halfLength - before.along) / (after.along - before.along));
      if (after.along < rear)
        fraction = Math.min(fraction, (rear - before.along) / (after.along - before.along));
      if (Math.abs(after.across) > halfWidth)
        fraction = Math.min(fraction, (Math.sign(after.across) * halfWidth - before.across) / (after.across - before.across));
      fraction = Math.max(0, fraction);
      const edgeAlong = before.along + (after.along - before.along) * fraction;
      const lip = edgeAlong >= halfLength - 1e-6 && alignment >= 0.5 &&
        after.along > before.along && ride.speed >= 10;
      const edgeTime = time - dt * (1 - fraction);
      const edgeX = previousX + (ride.x - previousX) * fraction;
      const edgeZ = previousZ + (ride.z - previousZ) * fraction;
      const edgeY = rampSurfaceHeight(ramp, edgeX, edgeZ, edgeTime) + 0.47;
      const edgeVelocity = (rampSurfaceHeight(ramp, edgeX, edgeZ, edgeTime + 0.001) -
        rampSurfaceHeight(ramp, edgeX, edgeZ, edgeTime - 0.001)) / 0.002;
      ride.verticalSpeed = edgeVelocity + ride.speed *
        rampSlope(ramp, edgeX, edgeZ, dx, dz, edgeTime);
      if (lip) ride.verticalSpeed = Math.max(0, baseVelocity) +
        ride.speed * (ramp.height / ramp.length * alignment + 0.38);
      const remaining = dt * (1 - fraction);
      ride.y = edgeY + ride.verticalSpeed * remaining - GRAVITY * remaining ** 2 / 2;
      ride.verticalSpeed -= GRAVITY * remaining;
      ride.airborne = true;
      ride.rampContact = null;
      ride.launchY = edgeY;
      ride.jumpPeak = Math.max(0, ride.y - edgeY);
      ride.airTime = remaining;
      ride.totalAirTime += remaining;
    }
  }
  if (!rampHandled && !ride.airborne) {
    ride.y = surfaceY;
    ride.verticalSpeed = surfaceVelocity;
    if (
      ride.speed > 16 &&
      curve * ride.speed ** 2 < -6 &&
      surfaceVelocity > 0.2 &&
      ride.launchCooldown === 0
    ) {
      ride.airborne = true;
      ride.verticalSpeed = Math.min(
        17.8,
        Math.max(8, surfaceVelocity + ride.speed * 0.23),
      );
      ride.launchY = surfaceY;
      ride.jumpPeak = 0;
      ride.airTime = 0;
    }
  } else if (!rampHandled) {
    ride.verticalSpeed -= GRAVITY * dt;
    ride.y += ride.verticalSpeed * dt;
    ride.airTime += dt;
    ride.totalAirTime += dt;
    ride.jumpPeak = Math.max(ride.jumpPeak, ride.y - ride.launchY);
    ride.bestJump = Math.max(ride.bestJump, ride.jumpPeak);
    for (const ramp of RAMPS) {
      const after = rampPosition(ramp, ride.x, ride.z);
      if (Math.abs(after.across) > ramp.width / 2 ||
          after.along < -ramp.length / 2 - RAMP_APRON_LENGTH ||
          after.along > ramp.length / 2) continue;
      const deckY = rampSurfaceHeight(ramp, ride.x, ride.z, time) + 0.47;
      const previousDeckY = rampSurfaceHeight(ramp, previousX, previousZ, time - dt) + 0.47;
      // A one-way deck: only a downward crossing from above can land.
      if (previousY < previousDeckY || ride.y > deckY ||
          ride.y - previousY >= deckY - previousDeckY) continue;
      ride.y = deckY;
      ride.verticalSpeed = (deckY - previousDeckY) / dt;
      ride.airborne = false;
      ride.rampContact = ramp;
      ride.launchCooldown = 0.85;
      slope = rampSlope(ramp, ride.x, ride.z, dx, dz, time);
      landed = true;
      landedOnRamp = true;
      break;
    }
    if (!landed && ride.y <= surfaceY && ride.verticalSpeed < surfaceVelocity) {
      ride.y = surfaceY;
      ride.airborne = false;
      ride.launchCooldown = 0.85;
      landed = true;
    }
  }
  const targetPitch = ride.airborne
    ? Math.atan2(ride.verticalSpeed, Math.max(12, ride.speed)) * 0.7
    : Math.atan(slope);
  ride.pitch +=
    (targetPitch - ride.pitch) * Math.min(1, dt * (ride.airborne ? 4 : 9));
  ride.roll +=
    (-ride.steering * Math.min(ride.speed / MAX_SPEED, 1) * 0.4 - ride.roll) *
    Math.min(1, dt * 5);
  return { launched: !wasAirborne && ride.airborne, landed, landedOnRamp };
}

// Three overlapping discs approximate the long hull, rather than a wide sphere.
// Equal-mass impulses exchange actual world velocity; lateral momentum survives
// steering and is gradually absorbed by water grip in stepRide.
export function resolveRideCollisions(rides) {
  const impacts = [];
  for (let iteration = 0; iteration < 4; iteration++) {
    for (let a = 0; a < rides.length; a++) {
      for (let b = a + 1; b < rides.length; b++) {
        const first = rides[a], second = rides[b];
        if (Math.abs(first.y - second.y) > 1.5 ||
            Math.hypot(first.x - second.x, first.z - second.z) > 4) continue;
        let contact = null;
        for (const front of [-1, 0, 1]) {
          for (const back of [-1, 0, 1]) {
            const x = second.x - Math.sin(second.heading) * back -
              first.x + Math.sin(first.heading) * front;
            const z = second.z - Math.cos(second.heading) * back -
              first.z + Math.cos(first.heading) * front;
            const distance = Math.hypot(x, z);
            if (distance < 1.8 && (!contact || distance < contact.distance))
              contact = { x, z, distance };
          }
        }
        if (!contact) continue;
        const nx = contact.distance > 1e-8 ? contact.x / contact.distance : 1;
        const nz = contact.distance > 1e-8 ? contact.z / contact.distance : 0;
        const correction = Math.max(0, 1.8 - contact.distance - 0.001) * 0.5;
        first.x -= nx * correction;
        first.z -= nz * correction;
        second.x += nx * correction;
        second.z += nz * correction;
        const vx = -Math.sin(second.heading) * second.speed + second.pushX +
          Math.sin(first.heading) * first.speed - first.pushX;
        const vz = -Math.cos(second.heading) * second.speed + second.pushZ +
          Math.cos(first.heading) * first.speed - first.pushZ;
        const closing = vx * nx + vz * nz;
        if (closing >= 0) continue;
        const impulse = -closing * 1.22 / 2;
        for (const [body, sign] of [[first, -1], [second, 1]]) {
          const dx = -Math.sin(body.heading), dz = -Math.cos(body.heading);
          const x = dx * body.speed + body.pushX + sign * nx * impulse;
          const z = dz * body.speed + body.pushZ + sign * nz * impulse;
          body.speed = Math.max(0, x * dx + z * dz);
          body.pushX = x - dx * body.speed;
          body.pushZ = z - dz * body.speed;
        }
        impacts.push({ a, b, impulse });
      }
    }
  }
  return impacts;
}
