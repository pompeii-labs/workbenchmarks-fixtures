import { COURSE_LENGTH, COURSE_SAMPLES, GATES, courseAt, nearestSample } from './course';
import type { Command, SimState } from './sim';

/**
 * Course-following driver used by the title-screen attract mode, test
 * capture setup, and as a steering hint for the keyboard bot. It produces
 * the same Command a player does.
 */
export class Autopilot {
  cursor = -1;
  /** missed-gate recovery: 0 off, 1 to the approach point, 2 through the gate */
  private recover = 0;
  private recoverGate = -1;

  reset(): void {
    this.cursor = -1;
    this.recover = 0;
  }

  /** Desired steer in -1..1 plus throttle; `boost` lets it burn boost on straights. */
  command(s: SimState, boost = false): Command {
    this.cursor = nearestSample(s.x, s.z, this.cursor, 40);
    const near = COURSE_SAMPLES[this.cursor];
    // Lost (teleport, restart, big detour): fall back to a global search.
    if (Math.hypot(near.x - s.x, near.z - s.z) > 30) this.cursor = nearestSample(s.x, s.z);
    const speed = Math.hypot(s.vx, s.vz);
    const look = 16 + speed * 0.55;
    let aim: { x: number; z: number } = courseAt(COURSE_SAMPLES[this.cursor].arc + look);
    // Close to the gate that counts: aim through its middle.
    const g = GATES[s.race.nextGate];
    const gd = Math.hypot(g.x - s.x, g.z - s.z);
    const before = (s.x - g.x) * g.tx + (s.z - g.z) * g.tz;
    if (gd < 50 && before < -4) aim = { x: g.x + g.tx * 6, z: g.z + g.tz * 6 };
    // Knocked past the gate that counts (a bump, a wide line): loop back for it.
    const L = COURSE_LENGTH;
    const past = ((COURSE_SAMPLES[this.cursor].arc - g.arc + L * 1.5) % L) - L / 2;
    if (this.recover > 0 && this.recoverGate !== s.race.nextGate) this.recover = 0;
    if (this.recover === 0 && past > 15 && past < 250) {
      this.recover = 1;
      this.recoverGate = s.race.nextGate;
    }
    if (this.recover > 0) {
      const app = courseAt(g.arc - 28);
      if (this.recover === 1 && Math.hypot(app.x - s.x, app.z - s.z) < 10) this.recover = 2;
      aim = this.recover === 1 ? app : { x: g.x + g.tx * 10, z: g.z + g.tz * 10 };
    }
    const want = Math.atan2(-(aim.x - s.x), -(aim.z - s.z));
    const diff = Math.atan2(Math.sin(want - s.heading), Math.cos(want - s.heading));
    // steer > 0 turns right (heading decreases), so a positive diff (target left) needs steer < 0.
    const steer = s.airborne ? 0 : Math.max(-1, Math.min(1, -diff * 2.6));
    // Slow for the bends ahead: you cannot steer in the air, so carrying
    // full speed over the swells into a hairpin flies you past the gate.
    const here = courseAt(COURSE_SAMPLES[this.cursor].arc);
    let bend = 0;
    for (const d of [15, 30, 45, 60]) {
      const a = courseAt(COURSE_SAMPLES[this.cursor].arc + d);
      bend = Math.max(bend, Math.abs(Math.atan2(here.tx * a.tz - here.tz * a.tx, here.tx * a.tx + here.tz * a.tz)));
    }
    const target = Math.max(11, 26 - bend * 13);
    const turn = Math.abs(diff);
    let throttle = speed < target ? 1 : speed > target + 4 ? -0.35 : 0.15;
    if (turn > 0.6) throttle = Math.min(throttle, 0.5);
    const straight = bend < 0.25 && turn < 0.15;
    return { throttle, steer, boost: boost && straight && s.boost > 0.3, jump: false };
  }
}
