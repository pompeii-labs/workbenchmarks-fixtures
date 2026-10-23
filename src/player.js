import * as THREE from 'three';
import { waveHeight } from './waves.js';

const G = 13; // a bit stronger than real gravity: snappier, more arcade
const ACCEL = 16;
const BOOST_ACCEL = 28;
const LIN_DRAG = 0.1;
const QUAD_DRAG = (ACCEL - LIN_DRAG * 32) / (32 * 32); // ~32 m/s top speed, ~45 with boost
const LAUNCH_MULT = 1.4;
const HOP = 6.5;
const RAMP_POP = 4; // launch speed off a ramp lip: RAMP_POP + speed * RAMP_POP_K, capped
const RAMP_POP_K = 0.5;
const RAMP_POP_MAX = 22;
const TWO_PI = Math.PI * 2;

const lerpRate = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
const wrapNear = (a) => a - Math.round(a / TWO_PI) * TWO_PI;

export class Player {
  constructor(model) {
    this.model = model;
    this.pos = new THREE.Vector3(0, 0, 0);
    this.vel = new THREE.Vector3(0, 0, 0);
    this.heading = 0;
    this.airborne = false;
    this.airTime = 0;
    this.airSpin = 0;
    this.airFlip = 0;
    this.spinVel = 0;
    this.flipVel = 0;
    this.pitch = 0;
    this.roll = 0;
    this.airPitch = 0;
    this.steerS = 0;
    this.throttle = 0;
    this.boost = 1;
    this.boosting = false;
    this.hopCooldown = 0;
    this.takeoffY = 0;
    this.maxY = 0;
    this.wipeout = 0;
    this.lateral = 0;
    this.speed = 0;
    this.surfVy = 0;
    this.crouch = 0;
    this.slopeF = 0;
    this.slopeR = 0;
    this.events = [];
    this.ground = null; // optional track with floating ramps
    this.rampAllow = false;
    this.onRamp = false;
    this.wasOnRamp = false;
    this.rampJump = false;
    this.power = 1; // engine multiplier (AI skill / catch-up); 1 for the player
    this.mass = 1;
    this.yawVel = 0; // spin from bumps (rad/s), bleeds off quickly on the water
    this.fwd = new THREE.Vector3(0, 0, 1);
    this.right = new THREE.Vector3(-1, 0, 0);
    this.surface = this.sampleSurface(0);
    this.pos.y = this.surface.h;
  }

  basis() {
    const s = Math.sin(this.heading), c = Math.cos(this.heading);
    this.fwd.set(s, 0, c);
    this.right.set(-c, 0, s);
  }

  // Hull-averaged surface: filters out small chop so the ski rides the swells.
  // Ramp decks count as ground too (see Track.rampGround).
  heightAt(x, z, t) {
    const w = waveHeight(x, z, t);
    if (!this.ground) return w;
    return Math.max(w, this.ground.rampGround(x, z, t, this.rampAllow));
  }

  sampleSurface(t, x = this.pos.x, z = this.pos.z) {
    const fx = this.fwd.x, fz = this.fwd.z, rx = this.right.x, rz = this.right.z;
    const c = this.heightAt(x, z, t);
    const b = this.heightAt(x + fx * 1.4, z + fz * 1.4, t);
    const s = this.heightAt(x - fx * 1.4, z - fz * 1.4, t);
    const r = this.heightAt(x + rx * 0.6, z + rz * 0.6, t);
    const l = this.heightAt(x - rx * 0.6, z - rz * 0.6, t);
    let h = (c * 2 + b + s + r + l) / 6;
    this.onRamp = false;
    if (this.ground && c > waveHeight(x, z, t) + 0.05) {
      // on a deck: ride the deck itself, not the average with the water around it
      h = Math.max(h, c - 0.15);
      this.onRamp = true;
    }
    return { h, slopeF: (b - s) / 2.8, slopeR: (r - l) / 1.2 };
  }

  step(dt, t, input) {
    this.basis();
    if (this.hopCooldown > 0) this.hopCooldown -= dt;
    if (this.wipeout > 0) this.wipeout -= dt;
    const control = this.wipeout <= 0;
    const steerIn = control ? input.steer : 0;
    const throttleIn = control ? input.throttle : 0;
    this.steerS = lerpRate(this.steerS, steerIn, 7, dt);
    this.throttle = lerpRate(this.throttle, Math.max(0, throttleIn), 5, dt);

    const vel = this.vel;
    const fwd = this.fwd, right = this.right;
    let vF = vel.x * fwd.x + vel.z * fwd.z;
    let vL = vel.x * right.x + vel.z * right.z;

    if (!this.airborne) {
      this.boosting = control && input.boost && this.boost > 0.02 && throttleIn > 0;
      let accel = 0;
      if (throttleIn > 0) accel = throttleIn * (this.boosting ? BOOST_ACCEL : ACCEL) * this.power;
      else if (throttleIn < 0) accel = vF > 1 ? -22 : -7;
      vF += accel * dt;
      vF -= (vF * Math.abs(vF) * QUAD_DRAG + vF * LIN_DRAG) * dt;
      if (throttleIn === 0) vF -= vF * 0.25 * dt;
      vL *= Math.exp(-3.2 * dt);

      const spd = Math.abs(vF);
      const turn = this.steerS * 2.5 * Math.min(1, 0.25 + spd / 10) / (1 + spd / 55) * (vF < -0.5 ? -1 : 1);

      vel.x = fwd.x * vF + right.x * vL;
      vel.z = fwd.z * vF + right.z * vL;
      // gravity pulls you down the face of a swell
      vel.x -= (this.slopeF * fwd.x + this.slopeR * right.x) * G * 0.3 * dt;
      vel.z -= (this.slopeF * fwd.z + this.slopeR * right.z) * G * 0.3 * dt;
      this.heading -= turn * dt;
      // knocked sideways by a bump: the hull spins, and the water damps it out
      this.heading += this.yawVel * dt;
      this.yawVel *= Math.exp(-5 * dt);

      if (control && input.hop && this.hopCooldown <= 0) {
        vel.y = Math.max(vel.y, this.surfVy) + HOP;
        this.hopCooldown = 0.7;
        this.pos.y += 0.05;
        this.takeOff(t, true);
      }
    } else {
      this.yawVel *= Math.exp(-2 * dt);
      vel.x *= 1 - 0.04 * dt;
      vel.z *= 1 - 0.04 * dt;
      this.boosting = false;
      // skimming just above the chop: the hull still bites, so you can keep carving
      const skim = this.pos.y - this.surface.h < 0.9 && Math.abs(this.airSpin) < 0.3;
      if (skim) {
        const spd = Math.hypot(vel.x, vel.z);
        const a = -this.steerS * 2.1 * Math.min(1, 0.25 + spd / 10) / (1 + spd / 55) * dt;
        this.heading += a;
        const ca = Math.cos(a), sa = Math.sin(a);
        const vx = vel.x;
        vel.x = vx * ca + vel.z * sa;
        vel.z = -vx * sa + vel.z * ca;
      }
      // tricks: steer = spin, brake = backflip. Release and it eases back to the nearest clean angle.
      const spinTarget = this.airTime > 0.2 && !skim ? -steerIn * 7.0 : 0;
      this.spinVel = lerpRate(this.spinVel, spinTarget, 6, dt);
      this.airSpin += this.spinVel * dt;
      if (Math.abs(steerIn) < 0.1) this.airSpin -= wrapNear(this.airSpin) * Math.min(1, 3.5 * dt);

      const flipTarget = throttleIn < 0 ? -6.0 : 0;
      this.flipVel = lerpRate(this.flipVel, flipTarget, 6, dt);
      this.airFlip += this.flipVel * dt;
      if (throttleIn >= 0) this.airFlip -= wrapNear(this.airFlip) * Math.min(1, 3.0 * dt);

      // W in the air: push the nose down for a smoother landing
      const noseDown = throttleIn > 0 ? 0.25 : 0;
      const vp = -Math.atan2(vel.y, Math.hypot(vel.x, vel.z) + 1) * 0.55 + noseDown;
      this.airPitch = lerpRate(this.airPitch, vp, 3, dt);
      this.airTime += dt;
      this.maxY = Math.max(this.maxY, this.pos.y);
    }

    // boost energy
    if (this.boosting) this.boost = Math.max(0, this.boost - 0.28 * dt);
    else this.boost = Math.min(1, this.boost + 0.07 * dt);

    // vertical: ballistic, then glued to the (hull-averaged) water surface on contact
    let hOld = this.surface.h;
    const oldX = this.pos.x, oldZ = this.pos.z;
    vel.y -= G * dt;
    this.pos.addScaledVector(vel, dt);
    this.basis();
    if (this.ground) this.rampAllow = this.ground.rampAllow(this.pos.x, this.pos.z, this.pos.y, t + dt);
    const surf = this.sampleSurface(t + dt);
    this.surface = surf;
    this.slopeF = surf.slopeF;
    this.slopeR = surf.slopeR;
    if (this.airborne && this.ground && this.pos.y <= surf.h) {
      // touching down: compare with the surface under where we just were, using the
      // same ramp rules, so landing on a deck doesn't read as the deck shooting up
      const onRamp = this.onRamp;
      hOld = this.sampleSurface(t, oldX, oldZ).h;
      this.onRamp = onRamp;
    }
    const hs = Math.hypot(vel.x, vel.z);
    let surfVy = Math.max(-30, Math.min(Math.max(12, hs * 0.6 + 3), (surf.h - hOld) / dt));
    if (this.onRamp) {
      // on a deck use its true motion, so stepping onto it from the side doesn't fling you
      const rv = this.ground.rampVy(this.pos.x, this.pos.z, vel.x, vel.z, t, dt);
      if (rv !== null) surfVy = rv;
    }

    if (this.pos.y <= surf.h) {
      if (this.airborne) this.land(surfVy);
      this.pos.y = surf.h;
      vel.y = surfVy;
      this.surfVy = surfVy;
    } else if (!this.airborne) {
      // the water fell away faster than gravity can pull us down: we're flying
      if (this.wasOnRamp) {
        // off the lip of a kicker ramp: big, speed-dependent pop
        const hs = Math.hypot(vel.x, vel.z);
        vel.y = Math.max(vel.y, Math.min(RAMP_POP_MAX, RAMP_POP + hs * RAMP_POP_K));
        this.rampJump = true;
      } else if (vel.y > 2.5) vel.y *= LAUNCH_MULT;
      this.takeOff(t, false);
    }
    if (this.onRamp && !this.airborne) {
      const hit = this.ground.rampUnder(this.pos.x, this.pos.z);
      this.wasOnRamp = !!hit && hit.u > 0.7 && vel.x * hit.r.fx + vel.z * hit.r.fz > 3;
    } else this.wasOnRamp = false;

    this.speed = Math.hypot(vel.x, vel.z);
    this.lateral = Math.abs(vel.x * this.right.x + vel.z * this.right.z);
    this.crouch = lerpRate(this.crouch, 0, 4, dt);
    this.updatePose(dt);
  }

  takeOff(t, hop) {
    if (hop) this.rampJump = false;
    this.airborne = true;
    this.airTime = 0;
    this.airSpin = 0;
    this.airFlip = 0;
    this.spinVel = 0;
    this.flipVel = 0;
    this.airPitch = this.pitch;
    this.takeoffY = this.pos.y;
    this.maxY = this.pos.y;
    this.events.push({ type: 'launch', hop, vy: this.vel.y, ramp: !hop && this.rampJump });
  }

  land(surfVy) {
    const impact = Math.max(0, surfVy - this.vel.y);
    this.airborne = false;
    const airTime = this.airTime;
    const height = this.maxY - this.takeoffY;
    const spins = Math.round(this.airSpin / TWO_PI);
    const spinErr = this.airSpin - spins * TWO_PI;
    const flips = Math.round(this.airFlip / TWO_PI);
    const flipErr = this.airFlip - flips * TWO_PI;
    const pitchErr = flipErr + this.airPitch;

    // heading becomes wherever the nose ended up
    this.heading += this.airSpin;
    this.airSpin = 0;
    this.airFlip = 0;
    this.spinVel = 0;
    this.flipVel = 0;
    this.crouch = Math.min(1, impact / 12);

    const ev = { type: 'land', impact, airTime, height, spins, flips, clean: true, sketchy: false, wipeout: false, ramp: this.rampJump };
    this.rampJump = false;
    // (a skip off the chop right after a landing is too short to crash on)
    if (airTime > 0.15 && (Math.abs(pitchErr) > 1.0 || (impact > 26 && Math.abs(pitchErr) > 0.6))) {
      ev.clean = false;
      ev.wipeout = true;
      this.wipeout = 1.3;
      this.vel.x *= 0.15;
      this.vel.z *= 0.15;
      this.airPitch = 0;
    } else if (Math.abs(spinErr) > 1.25) {
      ev.clean = false;
      ev.sketchy = true;
      const keep = Math.max(0.4, Math.cos(spinErr));
      this.vel.x *= keep;
      this.vel.z *= keep;
    }
    this.pitch += this.airPitch;
    this.airPitch = 0;
    this.events.push(ev);
  }

  updatePose(dt) {
    let pitchT, rollT;
    if (!this.airborne) {
      const speedF = Math.min(1, this.speed / 32);
      pitchT = -Math.atan(this.slopeF) - 0.07 * speedF * this.throttle;
      rollT = -Math.atan(this.slopeR) + this.steerS * (0.12 + 0.45 * speedF);
      if (this.wipeout > 0) rollT += Math.sin(this.wipeout * 9) * 0.5 * this.wipeout;
      this.pitch = lerpRate(this.pitch, pitchT, 10, dt);
      this.roll = lerpRate(this.roll, rollT, 8, dt);
    } else {
      this.pitch = lerpRate(this.pitch, 0, 4, dt);
      this.roll = lerpRate(this.roll, this.steerS * 0.25, 3, dt);
    }
    const m = this.model;
    m.position.copy(this.pos);
    m.rotation.order = 'YXZ';
    m.rotation.y = this.heading + this.airSpin;
    m.rotation.x = this.pitch + (this.airborne ? this.airPitch + this.airFlip : 0);
    m.rotation.z = this.roll;
    const { body, bars, rider, upper } = m.userData;
    body.position.y = -0.18 - this.crouch * 0.05;
    bars.rotation.y = -this.steerS * 0.35;
    rider.rotation.z = this.steerS * 0.25 * Math.min(1, this.speed / 15);
    rider.position.y = 0.95 - this.crouch * 0.15 + (this.airborne ? 0.1 : 0);
    upper.rotation.x = 0.1 + this.crouch * 0.3 + (this.boosting ? 0.15 : 0);
  }

  respawn(t, pose = null) {
    if (pose) {
      this.pos.x = pose.x;
      this.pos.z = pose.z;
      this.heading = pose.heading;
    }
    this.vel.set(0, 0, 0);
    this.yawVel = 0;
    this.airborne = false;
    this.wipeout = 0;
    this.airSpin = this.airFlip = this.airPitch = 0;
    this.basis();
    this.surface = this.sampleSurface(t);
    this.pos.y = this.surface.h;
  }
}
