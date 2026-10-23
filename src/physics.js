export const GRAVITY = 12.8;
export const MAX_SPEED = 29;
export const BOOST_SPEED = 42;

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

export function newRide() {
  return {
    x: 0,
    z: 35,
    y: 0,
    heading: 0,
    speed: 0,
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
    distance: 0,
  };
}

export function stepRide(ride, input, time, dt) {
  const wasAirborne = ride.airborne;
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
  const steerInput = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  ride.steering += (steerInput - ride.steering) * Math.min(1, dt * 7);
  ride.heading +=
    ride.steering *
    Math.min(1, ride.speed / 8) *
    (ride.airborne ? 0.7 : 1.05) *
    dt;
  const dx = -Math.sin(ride.heading);
  const dz = -Math.cos(ride.heading);
  ride.x += dx * ride.speed * dt;
  ride.z += dz * ride.speed * dt;
  ride.distance += ride.speed * dt;
  const sea = waveHeight(ride.x, ride.z, time);
  const surfaceY = sea + 0.47;
  const lookAhead = waveHeight(ride.x + dx * 1.6, ride.z + dz * 1.6, time);
  const lookBehind = waveHeight(ride.x - dx * 1.6, ride.z - dz * 1.6, time);
  const slope = (lookAhead - lookBehind) / 3.2;
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
  if (!ride.airborne) {
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
  } else {
    ride.verticalSpeed -= GRAVITY * dt;
    ride.y += ride.verticalSpeed * dt;
    ride.airTime += dt;
    ride.totalAirTime += dt;
    ride.jumpPeak = Math.max(ride.jumpPeak, ride.y - ride.launchY);
    ride.bestJump = Math.max(ride.bestJump, ride.jumpPeak);
    if (ride.y <= surfaceY && ride.verticalSpeed < surfaceVelocity) {
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
  return { launched: !wasAirborne && ride.airborne, landed };
}
