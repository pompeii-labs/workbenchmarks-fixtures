// ---------------------------------------------------------------------------
// AI rider. It produces the same input a human does ({ throttle, steer, boost,
// hop }) and feeds it to its own Player, so rivals use exactly the player's
// physics: same top speed, same ramps, same landings, same wipeouts.
//
// Driving: pure pursuit on a point ahead on the course centerline, offset into
// the rider's own lane; speed from the sharpest bend coming up; ramps lined up
// dead straight from a long way out; a little dodging of slower skis ahead.
// ---------------------------------------------------------------------------
import { RAMP_L, GATE_HALF } from './track.js';

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = (a, b, x) => {
  const u = clamp((x - a) / (b - a), 0, 1);
  return u * u * (3 - 2 * u);
};

const LANE_MAX = GATE_HALF - 3.5; // stay well inside the gate pylons
const RAMP_LEAD = 120; // start lining up for a ramp this far out (m)
const RAMP_LOCK = 55; // from here on, ride the ramp's own axis

export class AIDriver {
  /**
   * @param layout track layout (buildLayout)
   * @param opts  skill 0..1 (corner speed, boost use), lane (m, + = right),
   *              aggression 0..1 (how little it bothers dodging), seed
   */
  constructor(layout, opts = {}) {
    this.L = layout;
    this.skill = opts.skill ?? 0.9;
    this.lane0 = opts.lane ?? 0;
    this.aggression = opts.aggression ?? 0.3;
    this.seed = opts.seed ?? Math.random() * 100;
    // tuning (see the headless sweep in the README)
    this.look0 = 9;
    this.lookK = 0.3;
    this.aLat0 = 15;
    this.aLatK = 9;
    this.rampLook = 12;
    this.slipK = 0.7;
    this.rampSlipK = 0.7;
    this.reset();
  }

  reset() {
    this.dodge = 0;
    this.boostHold = false;
    this.cruise = false;
  }

  /** Signed forward distance from s0 to s1 along the loop, in (-L/2, L/2]. */
  ahead(s0, s1) {
    const len = this.L.length;
    let d = (s1 - s0) % len;
    if (d > len / 2) d -= len;
    if (d <= -len / 2) d += len;
    return d;
  }

  /** The ramp we're heading for (within RAMP_LEAD) and how far its entry is. */
  rampAhead(s) {
    let best = null;
    for (const r of this.L.ramps) {
      const d = this.ahead(s, r.s - RAMP_L / 2);
      if (d > -RAMP_L - 2 && d < RAMP_LEAD && (!best || d < best.d)) best = { r, d };
    }
    return best;
  }

  laneAt(s, t) {
    const wob = Math.sin(t * 0.21 + this.seed) * 1.6 + Math.sin(s * 0.013 + this.seed * 2.3) * 1.2;
    return clamp(this.lane0 + wob + this.dodge, -LANE_MAX, LANE_MAX);
  }

  /**
   * @param ski    the rider's Player
   * @param s      its current distance along the centerline (m)
   * @param t      sim time
   * @param dt     step
   * @param others other racers' Players (for dodging)
   */
  drive(ski, s, t, dt, others) {
    const L = this.L;
    const inp = { throttle: 0, steer: 0, boost: false, hop: false };
    const v = ski.speed;
    const look = this.look0 + v * this.lookK;
    const ramp = this.rampAhead(s);

    // ---- dodge slower skis right in front ----
    let want = 0;
    if (!ramp || ramp.d > RAMP_LOCK) {
      for (const o of others) {
        const dx = o.pos.x - ski.pos.x, dz = o.pos.z - ski.pos.z;
        const along = dx * ski.fwd.x + dz * ski.fwd.z;
        if (along < -3 || along > 16) continue;
        const lat = dx * ski.right.x + dz * ski.right.z;
        if (along > -3 && along < 3 && Math.abs(lat) < 4.5) {
          // side by side: most give each other room, the aggressive ones lean in
          want += (lat > 0 ? -1 : 1) * 3 * (1 - this.aggression * 1.4);
          continue;
        }
        if (Math.abs(lat) > 3.2) continue;
        const closing = v - (o.vel.x * ski.fwd.x + o.vel.z * ski.fwd.z);
        if (closing < 1.5 * (1 + this.aggression * 3)) continue;
        want += (lat > 0 ? -1 : 1) * 4.5;
      }
    }
    this.dodge += (clamp(want, -6, 6) - this.dodge) * (1 - Math.exp(-2.5 * dt));

    // ---- where to aim ----
    let tx, tz;
    const locked = ramp && ramp.d < RAMP_LOCK;
    if (locked) {
      // locked on: aim down the ramp's own axis so we hit the deck square
      const r = ramp.r;
      const along = (ski.pos.x - r.cx) * r.fx + (ski.pos.z - r.cz) * r.fz;
      const a = Math.max(along, -RAMP_L * 2) + this.rampLook;
      tx = r.cx + r.fx * a;
      tz = r.cz + r.fz * a;
    } else {
      const p = L.at(s + look);
      let lane = this.laneAt(s + look, t);
      if (ramp) {
        // drift over to the ramp's line
        const w = smooth(RAMP_LEAD, RAMP_LOCK + 8, ramp.d);
        const rl = (ramp.r.cx - p.x) * p.rx + (ramp.r.cz - p.z) * p.rz;
        lane += (rl - lane) * w;
      }
      tx = p.x + p.rx * lane;
      tz = p.z + p.rz * lane;
    }
    const desired = Math.atan2(tx - ski.pos.x, tz - ski.pos.z);
    // steer the direction of travel, not just the nose: the hull slides
    const velH = v > 4 ? Math.atan2(ski.vel.x, ski.vel.z) : ski.heading;
    const slipK = locked ? this.rampSlipK : this.slipK;
    const err = wrap(desired - ski.heading) * (1 - slipK) + wrap(desired - velH) * slipK;

    if (ski.airborne && ski.pos.y - ski.surface.h > 0.75) {
      // Properly in the air (skipping low over the chop the hull still bites,
      // so that counts as driving). Keep the gas on, which tips the nose down
      // for a clean landing, and use a small spin to point the nose where we
      // want to go: well short of the angle that makes a landing sketchy.
      const want = clamp(ski.airSpin + wrap(desired - ski.heading - ski.airSpin), -0.8, 0.8);
      inp.steer = ski.airTime > 0.2 ? clamp(-(want - ski.airSpin) * 1.2, -0.6, 0.6) : 0;
      if (Math.abs(inp.steer) < 0.12) inp.steer = 0;
      inp.throttle = 1;
      this.boostHold = false;
      return inp;
    }
    // heading goes down with +steer; a touch of damping from the current yaw drift
    inp.steer = clamp(-err * 3.2 + ski.yawVel * 0.15, -1, 1);

    // ---- speed: the tightest bend in the braking window sets the pace ----
    const win = 18 + v * 1.5;
    let k = 0;
    for (let d = 0; d < win; d += L.step * 2) k = Math.max(k, Math.abs(L.curv[L.at(s + d).i]));
    const aLat = this.aLat0 + this.skill * this.aLatK;
    let vT = k > 1e-4 ? Math.sqrt(aLat / k) : 99;
    if (ramp && ramp.d < RAMP_LOCK) vT = 99; // never lift before a jump
    if (this.cruise) vT = Math.min(vT, 18);

    if (Math.abs(err) > 1.3) inp.throttle = 0.45; // way off line (spun out): turn round first
    else if (v < vT) inp.throttle = 1;
    else if (v > vT + 5) inp.throttle = -1;
    else inp.throttle = 0;

    // ---- boost on the straights and into the ramps ----
    const straight = vT > v + 6 && Math.abs(err) < 0.25;
    const wantBoost = this.boostHold ? ski.boost > 0.05 && straight : straight && ski.boost > 0.45 - this.skill * 0.15;
    this.boostHold = !this.cruise && wantBoost && inp.throttle > 0;
    inp.boost = this.boostHold;
    return inp;
  }
}
