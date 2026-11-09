import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BEAT, CYCLE, FLIGHT, GRIP, WHEEL_RADIUS, AXLE_HEIGHT, GROUND_HEIGHT, handPose, pinPose, ridePose } from '../src/motion.js';
import { createPin, createUnicycle, createPelican, poseWing, poseLegs } from '../src/model.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const orientationDistance = (a, b) => Math.hypot(Math.sin(a.angle) - Math.sin(b.angle), Math.cos(a.angle) - Math.cos(b.angle));
const close = (actual, expected, epsilon = 1e-8) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} should equal ${expected}`);

test('three-pin pattern repeats continuously, including negative-time offsets', () => {
  for (let step = -4320; step <= 4320; step++) {
    const time = step / 1000;
    for (let i = 0; i < 3; i++) {
      const a = pinPose(time, i);
      const b = pinPose(time + CYCLE, i);
      assert.ok(distance(a, b) < 1e-10);
      assert.ok(orientationDistance(a, b) < 1e-10);
      assert.ok(a.y > 2.7 && a.y < 6.4);
    }
  }
});

test('phase and parity agree on exact beat boundaries over thousands of loops', () => {
  for (let cycle = -1000; cycle <= 1000; cycle++) {
    for (let beat = 0; beat < 12; beat++) {
      for (const time of [cycle * CYCLE + beat * BEAT / 2, (cycle * 12 + beat) * BEAT / 2]) {
        for (let i = 0; i < 3; i++) {
          const a = pinPose(time, i);
          for (const offset of [-1e-7, 1e-7]) {
            const b = pinPose(time + offset, i);
            assert.ok(distance(a, b) < 2e-6, `position discontinuity at ${time}, pin ${i}`);
            assert.ok(orientationDistance(a, b) < 2e-6);
          }
        }
      }
    }
  }
});

test('held pins stay exactly attached to their receiving wing', () => {
  let heldSamples = 0;
  for (let time = 0; time < CYCLE; time += .001) {
    for (let i = 0; i < 3; i++) {
      const pin = pinPose(time, i);
      if (!pin.held) continue;
      const hand = handPose(time, pin.side);
      const grip = { x: pin.x - Math.sin(pin.angle) * GRIP, y: pin.y + Math.cos(pin.angle) * GRIP, z: pin.z };
      assert.ok(distance(grip, hand) < 1e-12);
      close(pin.angle, hand.angle);
      heldSamples++;
    }
  }
  assert.ok(heldSamples > 2000);
});

test('catch and release match position, velocity, and angular velocity', () => {
  const epsilon = 1e-6;
  const velocity = (a, b) => ({ x: (b.x - a.x) / epsilon, y: (b.y - a.y) / epsilon, z: (b.z - a.z) / epsilon });
  const angularVelocity = (a, b) => Math.atan2(Math.sin(b.angle - a.angle), Math.cos(b.angle - a.angle)) / epsilon;
  for (let i = 0; i < 3; i++) {
    for (let k = -10; k < 10; k++) {
      for (const time of [i * BEAT + k * 3 * BEAT, i * BEAT + k * 3 * BEAT + FLIGHT]) {
        const before = pinPose(time - epsilon, i);
        const at = pinPose(time, i);
        const after = pinPose(time + epsilon, i);
        assert.ok(distance(velocity(before, at), velocity(at, after)) < .001);
        close(angularVelocity(before, at), angularVelocity(at, after), .001);
      }
    }
  }
});

test('airborne pins follow ballistic arcs with constant angular velocity', () => {
  const dt = .001;
  for (let time = .1; time < FLIGHT - .1; time += .01) {
    const a = pinPose(time - dt, 0), b = pinPose(time, 0), c = pinPose(time + dt, 0);
    close((a.x - 2 * b.x + c.x) / dt ** 2, 0, 1e-7);
    close((a.y - 2 * b.y + c.y) / dt ** 2, -8 * 2.65 / FLIGHT ** 2, 1e-7);
    close(a.z, b.z);
    close(c.z, b.z);
    close(a.angle - 2 * b.angle + c.angle, 0);
  }
});

test('pins cannot intersect: depth separation or conservative bounding spheres', () => {
  const pin = createPin(new THREE.Group());
  const profile = pin.children[0].geometry.parameters.points;
  const radial = Math.max(...profile.map((p) => p.x));
  const sphereRadius = Math.max(...profile.map((p) => Math.hypot(p.x, p.y)));
  for (let step = 0; step <= 21600; step++) {
    const time = step * CYCLE / 21600;
    const poses = [0, 1, 2].map((i) => pinPose(time, i));
    for (let i = 0; i < 3; i++) {
      for (let j = i + 1; j < 3; j++) {
        const a = poses[i], b = poses[j];
        if (!a.held && !b.held && a.side !== b.side) {
          assert.ok(Math.abs(a.z - b.z) - 2 * radial > .035);
        } else {
          assert.ok(distance(a, b) - 2 * sphereRadius > .1, `pin collision at ${time}`);
        }
      }
    }
  }
});

test('wheel, opposite cranks, and moving road share a rolling distance', () => {
  const parent = new THREE.Group();
  parent.rotation.order = 'ZXY';
  const cycle = createUnicycle(parent);
  for (let time = 0; time < 60; time += .03) {
    const ride = ridePose(time);
    parent.rotation.set(ride.pitch, 0, ride.roll);
    poseLegs(cycle, ride.wheelAngle - ride.pitch, ride.pitch, ride.roll);
    close((cycle.wheel.rotation.x + ride.pitch) * WHEEL_RADIUS, ride.distance);
    const [left, right] = cycle.cranks.map((leg) => leg.pedal.position);
    close(left.y + right.y, 2 * AXLE_HEIGHT);
    close(left.z + right.z, 0);
    for (const leg of cycle.cranks) close(leg.foot.position.y - leg.pedal.position.y, .09);
    for (const leg of cycle.cranks) {
      close(leg.thigh.scale.y / .6, .8);
      close(leg.shin.scale.y, 1.05);
    }
    const contactHeight = GROUND_HEIGHT + .685 * Math.cos(ride.roll) + .075;
    close(contactHeight - .685 * Math.cos(ride.roll) - .075, GROUND_HEIGHT);
    const q = cycle.wheel.getWorldQuaternion(new THREE.Quaternion());
    const expected = new THREE.Quaternion().setFromEuler(new THREE.Euler(ride.wheelAngle, 0, ride.roll, 'ZXY'));
    assert.ok(q.angleTo(expected) < 1e-6);
  }
});

test('wing articulation reaches the grips without stretching its bones', () => {
  const root = new THREE.Group();
  const { wings, bird } = createPelican(root);
  root.rotation.order = 'ZXY';
  for (let time = 0; time < 30; time += .01) {
    const ride = ridePose(time);
    root.rotation.set(ride.pitch, 0, ride.roll);
    root.position.set(0, -AXLE_HEIGHT, 0).applyEuler(root.rotation);
    root.position.y += GROUND_HEIGHT + .685 * Math.cos(ride.roll) + .075;
    bird.rotation.y = .018 * Math.sin(time * 2.18);
    bird.updateWorldMatrix(true, false);
    for (const wing of wings) {
      const hand = handPose(time, wing.side);
      const target = bird.worldToLocal(new THREE.Vector3(hand.x, hand.y, hand.z));
      poseWing(wing, target);
      close(wing.upper.scale.y, .86);
      close(wing.lower.scale.y, 1.02);
      const worldGrip = wing.wrist.getWorldPosition(new THREE.Vector3());
      assert.ok(distance(hand, worldGrip) < 1e-10);
    }
  }
});
