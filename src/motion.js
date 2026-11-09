export const TAU = Math.PI * 2;
export const BEAT = 0.72;
export const FLIGHT = BEAT * 2.5;
export const DWELL = BEAT * 0.5;
export const CYCLE = BEAT * 6;
export const WHEEL_RADIUS = 0.76;
export const GROUND_HEIGHT = 0.012;
export const AXLE_HEIGHT = GROUND_HEIGHT + WHEEL_RADIUS;
export const GRIP = 0.28;
export const THROW_X = 1.22;
export const CATCH_X = 1.70;
export const THROW_Y = 3.87;
export const CATCH_Y = 3.66;
export const ARC_HEIGHT = 2.65;
export const SPIN_RATE = (TAU + 0.44) / FLIGHT;

export const mod = (value, period) => ((value % period) + period) % period;
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const hermite = (a, b, va, vb, duration, u) =>
  (2 * u ** 3 - 3 * u ** 2 + 1) * a +
  (u ** 3 - 2 * u ** 2 + u) * duration * va +
  (-2 * u ** 3 + 3 * u ** 2) * b +
  (u ** 3 - u ** 2) * duration * vb;

// Endpoint velocities include the rotating grip, not just the pin's center.
const horizontalSpeed = (THROW_X + CATCH_X - 2 * Math.sin(.22) * GRIP) / FLIGHT + Math.cos(.22) * GRIP * SPIN_RATE;
const throwSpeed = (CATCH_Y - THROW_Y + 4 * ARC_HEIGHT) / FLIGHT + Math.sin(.22) * GRIP * SPIN_RATE;
const catchSpeed = (CATCH_Y - THROW_Y - 4 * ARC_HEIGHT) / FLIGHT - Math.sin(.22) * GRIP * SPIN_RATE;

export function handPose(time, side) {
  const age = mod(time - (side === -1 ? 0 : BEAT), BEAT * 2);
  let x, y, z, angle;
  const releaseZ = .90 + side * .21;
  const catchZ = .90 - side * .21;
  const baseAngle = -side * .22;
  if (age < BEAT * 1.5) {
    const duration = BEAT * 1.5;
    const followThrough = .15;
    z = mix(releaseZ, catchZ, smooth(age / duration));
    if (age < followThrough) {
      const u = age / followThrough;
      x = hermite(THROW_X, 1.03, -horizontalSpeed, 0, followThrough, u);
      y = hermite(THROW_Y, 4.24, throwSpeed, 0, followThrough, u);
      angle = hermite(baseAngle, baseAngle + side * .25, side * SPIN_RATE, 0, followThrough, u);
    } else if (age > duration - followThrough) {
      const u = (age - duration + followThrough) / followThrough;
      x = hermite(CATCH_X - .17, CATCH_X, 0, horizontalSpeed, followThrough, u);
      y = hermite(4.05, CATCH_Y, 0, catchSpeed, followThrough, u);
      angle = hermite(baseAngle + side * .25, baseAngle, 0, -side * SPIN_RATE, followThrough, u);
    } else {
      const u = smooth((age - followThrough) / (duration - 2 * followThrough));
      x = mix(1.03, CATCH_X - .17, u);
      y = mix(4.24, 4.05, u);
      angle = baseAngle + side * .25;
    }
  } else {
    const u = (age - BEAT * 1.5) / DWELL;
    x = hermite(CATCH_X, THROW_X, horizontalSpeed, -horizontalSpeed, DWELL, u);
    y = hermite(CATCH_Y, THROW_Y, catchSpeed, throwSpeed, DWELL, u);
    z = mix(catchZ, releaseZ, smooth(u));
    angle = baseAngle - side * SPIN_RATE * DWELL * u * (1 - u);
  }
  return { x: side * x, y, z, angle };
}

export function pinPose(time, index) {
  const offset = index * BEAT;
  // Derive phase and parity together, including at negative/exact beat times.
  const q = (time - offset) / (BEAT * 3);
  const step = Math.floor(q);
  const age = (q - step) * (BEAT * 3);
  const side = mod(index + step, 2) === 0 ? -1 : 1;
  const startAngle = -side * 0.22;
  const endAngle = side * 0.22;
  if (age >= FLIGHT) {
    const hand = handPose(time, -side);
    return {
      x: hand.x + Math.sin(hand.angle) * GRIP,
      y: hand.y - Math.cos(hand.angle) * GRIP,
      z: hand.z,
      angle: hand.angle,
      held: true,
      side: -side,
    };
  }
  const u = age / FLIGHT;
  const start = { x: side * THROW_X + Math.sin(startAngle) * GRIP, y: THROW_Y - Math.cos(startAngle) * GRIP };
  const end = { x: -side * CATCH_X + Math.sin(endAngle) * GRIP, y: CATCH_Y - Math.cos(endAngle) * GRIP };
  return {
    x: mix(start.x, end.x, u),
    y: mix(start.y, end.y, u) + 4 * ARC_HEIGHT * u * (1 - u),
    // A shallow, two-lane cascade clears both the other pin and the long bill.
    // Each flight is planar; only the occupied wing transfers between lanes.
    z: .90 + side * .21,
    angle: mix(startAngle, endAngle, u) + side * TAU * u,
    held: false,
    side,
  };
}

// A traveling frame: the road moves backwards by exactly the tire's
// rolling distance. Small accelerations produce real forward/backward corrections.
export function ridePose(time) {
  const distance = 0.76 * time + 0.11 * Math.sin(time * 1.6) + 0.035 * Math.sin(time * 3.2);
  const acceleration = -0.11 * 1.6 ** 2 * Math.sin(time * 1.6) - 0.035 * 3.2 ** 2 * Math.sin(time * 3.2);
  return {
    distance,
    wheelAngle: distance / WHEEL_RADIUS,
    pitch: -Math.atan(acceleration / 9.81),
    roll: 0.025 * Math.sin(time * 1.6 + 0.5),
  };
}
