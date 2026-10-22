// Pure 2D pinball simulation (no three.js dependency, so it can be tested in Node).
// Table space: x runs left -> right, y runs from the drain (0) up to the top arch (~41).
// The renderer maps (x, y) onto the tilted 3D playfield.

export const BALL_R = 0.5;
export const GRAVITY = 64; // along the table, units / s^2 (exaggerated for snappy play)
export const STEP = 1 / 120; // fixed game step
export const SUBSTEPS = 8; // physics substeps per game step (960 Hz)
export const MAX_SPEED = 95;
export const LANE = { x0: 10, x1: 11.6, cx: 10.8, top: 30 };
export const PLUNGER_REST = 1.5;
export const PLUNGER_TRAVEL = 1.4;
export const DRAIN_Y = -1.2;
export const ARC = { cx: 0.8, cy: 30, r: 10.8 };

const FLIP_UP = 0.5; // radians above horizontal
const FLIP_REST = -0.5;

export function buildTable() {
  const walls = [];
  const W = (ax, ay, bx, by, o = {}) => {
    const s = { ax, ay, bx, by, r: 0.15, e: 0.4, kind: 'wall', ...o };
    walls.push(s);
    return s;
  };

  // Outer left wall (above the left slingshot).
  W(-10, 15.5, -10, LANE.top);

  // Top arch from the left wall over to the outer lane wall.
  const N = 30;
  for (let i = 0; i < N; i++) {
    const a0 = Math.PI - (Math.PI * i) / N;
    const a1 = Math.PI - (Math.PI * (i + 1)) / N;
    W(
      ARC.cx + ARC.r * Math.cos(a0), ARC.cy + ARC.r * Math.sin(a0),
      ARC.cx + ARC.r * Math.cos(a1), ARC.cy + ARC.r * Math.sin(a1),
      { arc: true, e: 0.3 },
    );
  }

  // Shooter lane.
  W(LANE.x1, -0.5, LANE.x1, LANE.top, { lane: true });
  W(LANE.x0, -0.5, LANE.x0, LANE.top, { lane: true });
  // One-way gate at the top of the lane: the ball passes going up, but bounces
  // off (and rolls into the playfield) if it comes back down.
  W(LANE.x0, LANE.top, LANE.x1, LANE.top + 1.2, { kind: 'gate', oneWay: true, nx: -0.6, ny: 0.8, e: 0.2 });

  // Slingshots (kicker faces) and the inlane guides that feed the flippers.
  W(-10, 15.5, -6.4, 8.07, { kind: 'sling', id: 0, e: 0.5 });
  W(-6.4, 8.07, -4.5, 6.0, { guide: true, e: 0.2 });
  W(10, 15.5, 6.4, 8.07, { kind: 'sling', id: 1, e: 0.5 });
  W(6.4, 8.07, 4.5, 6.0, { guide: true, e: 0.2 });

  // Stand-up targets on the side walls.
  W(-9.72, 19.2, -9.72, 20.7, { kind: 'target', id: 0, e: 0.35 });
  W(-9.72, 21.3, -9.72, 22.8, { kind: 'target', id: 1, e: 0.35 });
  W(9.72, 19.2, 9.72, 20.7, { kind: 'target', id: 2, e: 0.35 });
  W(9.72, 21.3, 9.72, 22.8, { kind: 'target', id: 3, e: 0.35 });

  // Plunger tip (moves down as it is pulled back).
  const plunger = W(LANE.x0, PLUNGER_REST, LANE.x1, PLUNGER_REST, { kind: 'plunger', e: 0.05 });

  const posts = [
    { x: -6.8, y: 18.5, r: 0.4, e: 0.7 },
    { x: 6.8, y: 18.5, r: 0.4, e: 0.7 },
  ];

  const bumpers = [
    { id: 0, x: -3.2, y: 25, r: 1.1 },
    { id: 1, x: 3.2, y: 25, r: 1.1 },
    { id: 2, x: 0, y: 29.6, r: 1.1 },
  ];

  const rollovers = [
    { id: 0, x: -3.2, y: 35, r: 0.6 },
    { id: 1, x: 0.8, y: 36.2, r: 0.6 },
    { id: 2, x: 4.8, y: 35, r: 0.6 },
  ];

  const flippers = [
    { side: 'left', px: -4.2, py: 5.6, len: 3.4, r0: 0.55, r1: 0.28, rest: FLIP_REST, up: FLIP_UP },
    { side: 'right', px: 4.2, py: 5.6, len: 3.4, r0: 0.55, r1: 0.28, rest: Math.PI - FLIP_REST, up: Math.PI - FLIP_UP },
  ];
  for (const f of flippers) {
    f.angle = f.rest;
    f.omega = 0;
    f.pressed = false;
  }

  return { walls, posts, bumpers, rollovers, flippers, plunger };
}

function closestOnSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return [ax + dx * t, ay + dy * t, t];
}

export class Sim {
  constructor() {
    this.t = buildTable();
    this.time = 0;
    this.ball = { x: LANE.cx, y: PLUNGER_REST + BALL_R + 0.16, vx: 0, vy: 0, active: false };
    this.plunger = { charge: 0, pos: 0, pulling: false, releasing: false };
    this.cool = new Map(); // per-object hit cooldowns
    this.inRollover = [false, false, false];
    this.events = [];
  }

  serve() {
    const b = this.ball;
    b.x = LANE.cx;
    b.y = PLUNGER_REST - this.plunger.pos + BALL_R + 0.16;
    b.vx = 0;
    b.vy = 0;
    b.active = true;
    this.inRollover = [false, false, false];
  }

  ballInLane() {
    const b = this.ball;
    return b.active && b.x > LANE.x0 && b.y < LANE.top;
  }

  ballOnPlunger() {
    const b = this.ball;
    return this.ballInLane() && b.y < PLUNGER_REST + BALL_R + 0.6 && Math.abs(b.vy) < 6;
  }

  emit(type, data = {}) {
    this.events.push({ type, ...data });
  }

  canHit(key, cd) {
    const last = this.cool.get(key);
    if (last !== undefined && this.time - last < cd) return false;
    this.cool.set(key, this.time);
    return true;
  }

  // input: { left, right, plunger }
  step(input) {
    const t = this.t;
    t.flippers[0].pressed = !!input.left;
    t.flippers[1].pressed = !!input.right;

    // Plunger: hold to pull back, release to fire.
    const p = this.plunger;
    if (input.plunger && !p.releasing) {
      p.pulling = true;
      p.charge = Math.min(1, p.charge + STEP / 0.85);
      p.pos = p.charge * PLUNGER_TRAVEL;
    } else if (p.pulling) {
      p.pulling = false;
      p.releasing = true;
      if (this.ballOnPlunger()) {
        const power = 34 + 58 * p.charge;
        this.ball.vy = power;
        this.ball.y = PLUNGER_REST + BALL_R + 0.16;
        this.emit('launch', { power: p.charge });
      }
      p.charge = 0;
    }
    if (p.releasing) {
      p.pos = Math.max(0, p.pos - STEP * 40);
      if (p.pos === 0) p.releasing = false;
    }
    t.plunger.ay = t.plunger.by = PLUNGER_REST - p.pos;

    const h = STEP / SUBSTEPS;
    for (let s = 0; s < SUBSTEPS; s++) {
      this.time += h;
      for (const f of t.flippers) this.updateFlipper(f, h);
      if (this.ball.active) this.updateBall(h);
    }
  }

  updateFlipper(f, h) {
    const target = f.pressed ? f.up : f.rest;
    const speed = f.pressed ? 30 : 20; // rad/s
    const max = speed * h;
    let d = target - f.angle;
    if (d > max) d = max;
    else if (d < -max) d = -max;
    const wasMoving = f.omega !== 0;
    f.angle += d;
    f.omega = d / h;
    if (wasMoving && d === 0 && f.pressed) this.emit('flipperStop', { side: f.side });
  }

  updateBall(h) {
    const b = this.ball;
    const t = this.t;
    b.vy -= GRAVITY * h;
    const damp = Math.exp(-0.08 * h);
    b.vx *= damp;
    b.vy *= damp;
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > MAX_SPEED) {
      b.vx *= MAX_SPEED / sp;
      b.vy *= MAX_SPEED / sp;
    }
    b.x += b.vx * h;
    b.y += b.vy * h;

    for (let iter = 0; iter < 2; iter++) {
      for (const w of t.walls) this.collideSeg(w);
      for (const c of t.posts) this.collideCircle(c, 'post');
      for (const c of t.bumpers) this.collideCircle(c, 'bumper');
      for (const f of t.flippers) this.collideFlipper(f);
    }

    // Rollover sensors.
    for (const r of t.rollovers) {
      const inside = Math.hypot(b.x - r.x, b.y - r.y) < r.r + BALL_R * 0.5;
      if (inside && !this.inRollover[r.id]) this.emit('rollover', { id: r.id });
      this.inRollover[r.id] = inside;
    }

    if (b.y < DRAIN_Y) {
      b.active = false;
      this.emit('drain');
    }
  }

  // Resolve contact along normal (nx, ny); (vfx, vfy) is the surface velocity.
  resolve(nx, ny, pen, e, vfx = 0, vfy = 0) {
    const b = this.ball;
    b.x += nx * pen;
    b.y += ny * pen;
    const rvx = b.vx - vfx, rvy = b.vy - vfy;
    const vn = rvx * nx + rvy * ny;
    if (vn < 0) {
      b.vx -= (1 + e) * vn * nx;
      b.vy -= (1 + e) * vn * ny;
      return -vn;
    }
    return 0;
  }

  collideSeg(w) {
    const b = this.ball;
    const [cx, cy] = closestOnSeg(b.x, b.y, w.ax, w.ay, w.bx, w.by);
    const dx = b.x - cx, dy = b.y - cy;
    const min = BALL_R + w.r;
    const d2 = dx * dx + dy * dy;
    if (d2 >= min * min || d2 < 1e-12) return;
    const d = Math.sqrt(d2);
    const nx = dx / d, ny = dy / d;
    if (w.oneWay && nx * w.nx + ny * w.ny <= 0.05) return;
    const impact = this.resolve(nx, ny, min - d, w.e);
    if (w.kind === 'sling' && impact > 5 && this.canHit('s' + w.id, 0.12)) {
      // Kick the ball away from the slingshot face.
      const sx = w.by - w.ay, sy = -(w.bx - w.ax);
      const sl = Math.hypot(sx, sy);
      let kx = sx / sl, ky = sy / sl;
      if (kx * nx + ky * ny < 0) { kx = -kx; ky = -ky; }
      b.vx += kx * 26;
      b.vy += ky * 26;
      this.emit('sling', { id: w.id });
    } else if (w.kind === 'target' && impact > 3 && this.canHit('t' + w.id, 0.2)) {
      this.emit('target', { id: w.id });
    } else if (impact > 12 && this.canHit('w', 0.06)) {
      this.emit('wall', { speed: impact });
    }
  }

  collideCircle(c, kind) {
    const b = this.ball;
    const dx = b.x - c.x, dy = b.y - c.y;
    const min = BALL_R + c.r;
    const d2 = dx * dx + dy * dy;
    if (d2 >= min * min || d2 < 1e-12) return;
    const d = Math.sqrt(d2);
    const nx = dx / d, ny = dy / d;
    if (kind === 'bumper') {
      this.resolve(nx, ny, min - d, 0.5);
      // Active bumper: guarantee a strong outward kick.
      const vn = b.vx * nx + b.vy * ny;
      const kick = 34;
      if (vn < kick) {
        b.vx += (kick - vn) * nx;
        b.vy += (kick - vn) * ny;
      }
      if (this.canHit('b' + c.id, 0.08)) this.emit('bumper', { id: c.id });
    } else {
      const impact = this.resolve(nx, ny, min - d, c.e);
      if (impact > 8 && this.canHit('p', 0.06)) this.emit('post', { speed: impact });
    }
  }

  collideFlipper(f) {
    const b = this.ball;
    const ca = Math.cos(f.angle), sa = Math.sin(f.angle);
    const tx = f.px + ca * f.len, ty = f.py + sa * f.len;
    const [cx, cy, u] = closestOnSeg(b.x, b.y, f.px, f.py, tx, ty);
    const rr = f.r0 + (f.r1 - f.r0) * u;
    const dx = b.x - cx, dy = b.y - cy;
    const min = BALL_R + rr;
    const d2 = dx * dx + dy * dy;
    if (d2 >= min * min || d2 < 1e-12) return;
    const d = Math.sqrt(d2);
    const nx = dx / d, ny = dy / d;
    // Surface velocity of the flipper at the contact point (omega x r).
    const rx = cx + nx * rr - f.px, ry = cy + ny * rr - f.py;
    const vfx = -f.omega * ry, vfy = f.omega * rx;
    const impact = this.resolve(nx, ny, min - d, 0.25, vfx, vfy);
    if (impact > 15 && this.canHit('f' + f.side, 0.1)) this.emit('flipperHit', { side: f.side, speed: impact });
  }
}
