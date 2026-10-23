// ---------------------------------------------------------------------------
// Race: the grid, the countdown, every rider's progress round the course,
// race positions, the finish, and ski-on-ski bumps.
//
// Progress is measured in metres along the course, but it only counts up to
// the next gate you've actually been through, so skipping a gate never moves
// you up the order. Rivals are tracked with their own gate crossings; the
// player's come from Track (which also does the splits and lap records).
// ---------------------------------------------------------------------------
import { Track } from './track.js';
import { AIDriver } from './ai.js';

export const RACE_LAPS = 3;
const COUNTDOWN = 3.6; // 3, 2, 1, GO
const HULL_HALF = 0.9; // ski = capsule: segment of +-HULL_HALF along the nose, radius HULL_R
const HULL_R = 0.72;
const RESTITUTION = 0.35;
const YAW_GAIN = 0.55; // how much off-centre hits spin the hull
const STUCK_TIME = 4;
const GHOST_TIME = 1.6;

export const RIVALS = [
  { name: 'MARLIN', color: 0x2f7bff, accent: 0xffffff, vest: 0x1a2f80, skill: 1.0, aggression: 0.35, lane: -2.5 },
  { name: 'RIPTIDE', color: 0x18b85a, accent: 0xffe14d, vest: 0x0f5c2c, skill: 0.95, aggression: 0.9, lane: 2.5 },
  { name: 'CORAL', color: 0xff8a3d, accent: 0x2b2b2b, vest: 0xffe0c2, skill: 0.9, aggression: 0.45, lane: 0 },
  { name: 'GULL', color: 0xf2f2f2, accent: 0x14a5ff, vest: 0x3a3a3a, skill: 0.85, aggression: 0.2, lane: -4 },
  { name: 'BARNACLE', color: 0x9b51e0, accent: 0x5ff2e0, vest: 0x2d1450, skill: 0.78, aggression: 0.6, lane: 4 },
];

export const ordinal = (n) => {
  const s = ['TH', 'ST', 'ND', 'RD'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

export class Race {
  /**
   * @param track  Track (or anything with layout, gates and the ramp ground methods)
   * @param player the player's Player
   * @param rivals [{ ski: Player, ...RIVALS[i] }]
   */
  constructor(track, player, rivals) {
    this.track = track;
    this.L = track.layout;
    this.gates = track.gates;
    // Rivals get slack on gate width: a shove, or a long jump while the course
    // bends, can put them a few metres wide. Way off, and they get rescued.
    this.aiGates = this.gates.map((g) => ({ ...g, half: g.half + 10 }));
    this.racers = [
      { name: 'YOU', isPlayer: true, ski: player, color: 0xff2d6f },
      ...rivals.map((r, i) => ({ ...r, isPlayer: false, driver: new AIDriver(this.L, { skill: r.skill, lane: r.lane, aggression: r.aggression, seed: i * 17.3 + 3 }) })),
    ];
    this.player = this.racers[0];
    this.phase = 'idle'; // idle | demo | countdown | racing | finished
    this.t0 = 0; // sim time of GO
    this.bumps = [];
    this.events = [];
    for (const r of this.racers) this.resetRacer(r);
  }

  resetRacer(r) {
    r.c = 0; // gate crossings so far (the first arch crossing starts lap 1)
    r.s = 0;
    r.sHint = -1;
    r.finished = false;
    r.finishTime = null;
    r.lapStart = null;
    r.lapTimes = [];
    r.bestLap = null;
    r.progress = 0;
    r.place = 0;
    r.stuckT = 0;
    r.stuckP = -1e9;
    r.ghost = 0;
    r.x0 = r.ski.pos.x;
    r.z0 = r.ski.pos.z;
    if (r.driver) r.driver.reset();
  }

  get N() {
    return this.gates.length;
  }

  get lap() {
    return Math.min(RACE_LAPS, Math.max(1, Math.ceil(this.player.c / this.N)));
  }

  /** Grid slot k (0 = pole): rows of three behind the start line. */
  gridPose(k) {
    const g = this.gates[0];
    const row = Math.floor(k / 3), col = k % 3;
    const back = 13 + row * 10 + (col === 1 ? 0 : 2.5);
    const lat = (col - 1) * 5.5;
    return { x: g.x - g.tx * back + g.rx * lat, z: g.z - g.tz * back + g.rz * lat, heading: Math.atan2(g.tx, g.tz) };
  }

  /**
   * Line everyone up. Grid order: rivals by skill, the player in `playerSlot`.
   * demo = attract mode (everyone on autopilot, no countdown).
   */
  setup(t, { playerSlot = 4, demo = false } = {}) {
    const order = this.racers.filter((r) => !r.isPlayer);
    order.splice(Math.min(playerSlot, order.length), 0, this.player);
    order.forEach((r, k) => {
      r.grid = this.gridPose(k);
      r.ski.respawn(t, r.grid);
      this.resetRacer(r);
      r.s = this.sAt(r);
    });
    this.phase = demo ? 'demo' : 'countdown';
    this.t0 = t + (demo ? 0 : COUNTDOWN);
    this.lastCount = null;
    this.rank();
  }

  countdown(t) {
    return this.phase === 'countdown' ? this.t0 - t : 0;
  }

  raceTime(t) {
    if (this.phase === 'countdown' || this.phase === 'idle') return 0;
    if (this.player.finished) return this.player.finishTime;
    return t - this.t0;
  }

  /** Distance along the course, searched near the last answer so crossing legs of the loop don't confuse it. */
  sAt(r) {
    const { px, pz, n, step } = this.L;
    const x = r.ski.pos.x, z = r.ski.pos.z;
    let best = 1e18, bi = 0;
    const scan = (a, b) => {
      for (let j = a; j <= b; j++) {
        const i = ((j % n) + n) % n;
        const dx = px[i] - x, dz = pz[i] - z;
        const d = dx * dx + dz * dz;
        if (d < best) {
          best = d;
          bi = i;
        }
      }
    };
    if (r.sHint >= 0) scan(r.sHint - 40, r.sHint + 40);
    if (r.sHint < 0 || best > 45 * 45) scan(0, n - 1);
    r.sHint = bi;
    r.offLine = Math.sqrt(best);
    return bi * step;
  }

  /** Course position (m, along the loop) of crossing number k (1-based). */
  crossingS(k) {
    const N = this.N;
    return Math.floor((k - 1) / N) * this.L.length + this.gates[(k - 1) % N].s;
  }

  ahead(s0, s1) {
    const len = this.L.length;
    let d = (s1 - s0) % len;
    if (d > len / 2) d -= len;
    if (d <= -len / 2) d += len;
    return d;
  }

  // ---------------------------------------------------------------- driving --

  /** Input for an AI-driven racer (also used for the player on autopilot). */
  aiInput(r, t, dt) {
    if (!r.driver) r.driver = new AIDriver(this.L, { skill: 0.9, lane: 0, aggression: 0.1, seed: 1 });
    const others = [];
    for (const o of this.racers) if (o !== r && o.active !== false) others.push(o.ski);
    r.driver.cruise = r.finished;
    return r.driver.drive(r.ski, r.s, t, dt, others);
  }

  // ----------------------------------------------------------------- update --

  /** Before the physics step: remember where everyone was. */
  pre() {
    for (const r of this.racers) {
      r.x0 = r.ski.pos.x;
      r.z0 = r.ski.pos.z;
    }
  }

  /**
   * After every racer has stepped and hit the scenery: hold the grid during the
   * countdown, resolve bumps, track gates and progress, rank.
   * playerCrossings: the player's crossing count from Track.
   */
  post(t0, t1, dt, playerCrossings) {
    const active = this.racers.filter((r) => r.active !== false);
    if (this.phase === 'countdown') {
      for (const r of active) {
        // engines can rev but nobody leaves the line before GO
        r.ski.pos.x = r.grid.x;
        r.ski.pos.z = r.grid.z;
        r.ski.vel.x = r.ski.vel.z = 0;
        r.ski.heading = r.grid.heading;
        r.ski.yawVel = 0;
      }
      const left = this.t0 - t1;
      const n = Math.ceil(left);
      if (n !== this.lastCount) {
        this.lastCount = n;
        this.events.push(n > 0 ? { type: 'count', n } : { type: 'go' });
      }
      if (left <= 0) this.phase = 'racing';
      return;
    }

    this.collideRacers(active, dt);

    for (const r of active) {
      if (r.ghost > 0) r.ghost -= dt;
      r.s = this.sAt(r);
      if (r.isPlayer && this.phase !== 'demo' && !r.finished) {
        const before = r.c;
        r.c = playerCrossings;
        if (r.c > before) this.crossed(r, this.track.lapStart ?? t1);
      } else if (!r.finished) {
        const g = this.aiGates[r.c % this.N];
        const f = Track.cross(g, r.x0, r.z0, r.ski.pos.x, r.ski.pos.z);
        if (f >= 0) {
          r.c++;
          this.crossed(r, t0 + (t1 - t0) * f);
        }
      }
      if (!r.finished) {
        const next = this.gates[r.c % this.N];
        const rem = Math.max(0, this.ahead(r.s, next.s));
        r.progress = this.crossingS(r.c + 1) - rem;
      }
      if (!r.isPlayer || r.finished) this.rescue(r, t1, dt);
    }
    this.rank();
  }

  crossed(r, tc) {
    const N = this.N;
    if (this.phase === 'demo') {
      if (r.c > RACE_LAPS * N + 1) r.c -= N; // demo laps go on forever
      return;
    }
    if (r.finished) return;
    if ((r.c - 1) % N === 0) {
      // through the arch: a lap starts (and the previous one ends)
      if (r.lapStart !== null) {
        const lt = tc - r.lapStart;
        r.lapTimes.push(lt);
        if (r.bestLap === null || lt < r.bestLap) r.bestLap = lt;
      }
      r.lapStart = tc;
      const lapsDone = (r.c - 1) / N;
      if (lapsDone >= RACE_LAPS) {
        r.finished = true;
        r.finishTime = tc - this.t0;
        r.progress = this.crossingS(r.c);
        this.events.push({ type: 'finish', racer: r });
        if (r.isPlayer) this.phase = 'finished';
      } else if (lapsDone > 0) this.events.push({ type: 'lap', racer: r, lap: lapsDone + 1 });
    }
  }

  /** Rivals that are wedged somewhere, or skipped a gate, get put back on the course. */
  rescue(r, t, dt) {
    const ski = r.ski;
    if (ski.airborne || ski.wipeout > 0) return;
    let reason = null;
    if (r.progress > r.stuckP + 4) {
      r.stuckP = r.progress;
      r.stuckT = 0;
    } else if ((r.stuckT += dt) > STUCK_TIME && !r.finished) reason = 'stuck';
    const next = this.gates[r.c % this.N];
    const past = this.ahead(next.s, r.s);
    if (!r.finished && r.c > 0 && past > 25 && past < 200) reason = 'missed';
    if (r.offLine > 60) reason = 'lost';
    if (!reason) return;
    // back on the line just before the gate it owes (or where it got stuck)
    const s = reason === 'missed' ? next.s - 10 : r.s - 6;
    const p = this.L.at(s);
    const lane = r.driver ? r.driver.lane0 * 0.5 : 0;
    ski.respawn(t, { x: p.x + p.rx * lane, z: p.z + p.rz * lane, heading: Math.atan2(p.tx, p.tz) });
    ski.vel.x = p.tx * 12;
    ski.vel.z = p.tz * 12;
    r.sHint = p.i;
    r.s = this.sAt(r);
    r.stuckT = 0;
    r.stuckP = r.progress;
    r.ghost = GHOST_TIME;
    this.events.push({ type: 'rescue', racer: r, reason });
  }

  rank() {
    const list = this.racers.filter((r) => r.active !== false);
    list.sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      return b.progress - a.progress;
    });
    list.forEach((r, i) => (r.place = i + 1));
    this.order = list;
  }

  // ------------------------------------------------------------------ bumps --

  /**
   * Ski-on-ski contact. Each hull is a capsule; overlapping pairs are pushed
   * apart and swap momentum along the contact normal (equal-ish masses,
   * slightly bouncy), and an off-centre hit spins both hulls.
   */
  collideRacers(list, dt) {
    const R2 = HULL_R * 2;
    for (let i = 0; i < list.length; i++) {
      const A = list[i];
      if (A.ghost > 0) continue;
      for (let j = i + 1; j < list.length; j++) {
        const B = list[j];
        if (B.ghost > 0) continue;
        const a = A.ski, b = B.ski;
        const dx0 = a.pos.x - b.pos.x, dz0 = a.pos.z - b.pos.z;
        if (dx0 * dx0 + dz0 * dz0 > 16) continue;
        if (Math.abs(a.pos.y - b.pos.y) > 1.3) continue; // one is flying over the other
        const c = closestSegments(a, b);
        if (c.d >= R2) continue;
        let nx, nz;
        if (c.d > 1e-4) {
          nx = (c.ax - c.bx) / c.d;
          nz = (c.az - c.bz) / c.d;
        } else {
          const l = Math.hypot(dx0, dz0) || 1;
          nx = dx0 / l;
          nz = dz0 / l;
        }
        // contact point and lever arms
        const px = (c.ax + c.bx) / 2, pz = (c.az + c.bz) / 2;
        const rax = px - a.pos.x, raz = pz - a.pos.z;
        const rbx = px - b.pos.x, rbz = pz - b.pos.z;
        const ima = 1 / a.mass, imb = 1 / b.mass;
        const Ia = 0.9 * a.mass, Ib = 0.9 * b.mass;
        // push apart
        const pen = R2 - c.d;
        const sa = ima / (ima + imb), sb = imb / (ima + imb);
        a.pos.x += nx * pen * sa;
        a.pos.z += nz * pen * sa;
        b.pos.x -= nx * pen * sb;
        b.pos.z -= nz * pen * sb;
        // velocity of each hull at the contact (yaw adds w * (rz, -rx))
        const vax = a.vel.x + a.yawVel * raz, vaz = a.vel.z - a.yawVel * rax;
        const vbx = b.vel.x + b.yawVel * rbz, vbz = b.vel.z - b.yawVel * rbx;
        const vn = (vax - vbx) * nx + (vaz - vbz) * nz;
        if (vn >= 0) continue;
        const ta = raz * nx - rax * nz; // torque per unit impulse along n
        const tb = rbz * nx - rbx * nz;
        const jn = (-(1 + RESTITUTION) * vn) / (ima + imb + (ta * ta) / Ia + (tb * tb) / Ib);
        a.vel.x += nx * jn * ima;
        a.vel.z += nz * jn * ima;
        b.vel.x -= nx * jn * imb;
        b.vel.z -= nz * jn * imb;
        a.yawVel += ((ta * jn) / Ia) * YAW_GAIN;
        b.yawVel -= ((tb * jn) / Ib) * YAW_GAIN;
        // a bit of scrubbing friction along the contact
        const tx = -nz, tz = nx;
        const vt = (vax - vbx) * tx + (vaz - vbz) * tz;
        const jt = Math.max(-jn * 0.2, Math.min(jn * 0.2, -vt / (ima + imb) * 0.5));
        a.vel.x += tx * jt * ima;
        a.vel.z += tz * jt * ima;
        b.vel.x -= tx * jt * imb;
        b.vel.z -= tz * jt * imb;
        this.bumps.push({ a: A, b: B, x: px, z: pz, y: (a.pos.y + b.pos.y) / 2, impulse: jn });
      }
    }
  }
}

/** Closest points between two hull segments (2D, on the water plane). */
function closestSegments(a, b) {
  const ax0 = a.pos.x - a.fwd.x * HULL_HALF, az0 = a.pos.z - a.fwd.z * HULL_HALF;
  const bx0 = b.pos.x - b.fwd.x * HULL_HALF, bz0 = b.pos.z - b.fwd.z * HULL_HALF;
  const d1x = a.fwd.x * 2 * HULL_HALF, d1z = a.fwd.z * 2 * HULL_HALF;
  const d2x = b.fwd.x * 2 * HULL_HALF, d2z = b.fwd.z * 2 * HULL_HALF;
  const rx = ax0 - bx0, rz = az0 - bz0;
  const aa = d1x * d1x + d1z * d1z, e = d2x * d2x + d2z * d2z, f = d2x * rx + d2z * rz;
  const c = d1x * rx + d1z * rz, bb = d1x * d2x + d1z * d2z;
  const den = aa * e - bb * bb;
  let s = den > 1e-6 ? Math.max(0, Math.min(1, (bb * f - c * e) / den)) : 0;
  let t = (bb * s + f) / e;
  if (t < 0) {
    t = 0;
    s = Math.max(0, Math.min(1, -c / aa));
  } else if (t > 1) {
    t = 1;
    s = Math.max(0, Math.min(1, (bb - c) / aa));
  }
  const ax = ax0 + d1x * s, az = az0 + d1z * s;
  const bx = bx0 + d2x * t, bz = bz0 + d2z * t;
  return { ax, az, bx, bz, d: Math.hypot(ax - bx, az - bz) };
}
