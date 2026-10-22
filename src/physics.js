// 2D pinball simulation in table space.
// x: -5 (left wall) .. 5.9 (outer wall of shooter lane), y: 0 (bottom) .. ~20.5 (top of arc).
// Gravity pulls toward -y (down the tilted table). Rendering maps (x, y) -> world (x, 0, -y).

export const R = 0.27; // ball radius
export const G = 25; // effective gravity along the playfield
export const MAX_SPEED = 42;
export const DT = 1 / 1200; // fixed physics step

export const LEFT = -5;
export const DIVIDER = 5;
export const OUTER = 5.9;
export const LANE_X = (DIVIDER + OUTER) / 2;
export const LANE_TOP = 13.5;
export const ARC = { cx: (LEFT + OUTER) / 2, cy: 15, r: (OUTER - LEFT) / 2 };

export const PLUNGER_REST = 1.0;
export const PLUNGER_PULL = 0.9;
export const PLUNGER_CHARGE_TIME = 0.85;
export const LAUNCH_MIN = 11;
export const LAUNCH_MAX = 38;

export const FLIPPER = {
  len: 1.75,
  r0: 0.24,
  r1: 0.12,
  rest: -0.52,
  up: 0.5,
  upSpeed: 30,
  downSpeed: 20,
  e: 0.25,
};

export const BUMPER_R = 0.55;
export const BUMPER_KICK = 15;
export const SLING_KICK = 11;

function buildTable() {
  const walls = [];
  const wall = (ax, ay, bx, by, opts = {}) => {
    const w = { ax, ay, bx, by, r: 0.06, e: 0.45, kind: 'wall', ...opts };
    walls.push(w);
    return w;
  };

  // outer walls
  wall(LEFT, 4.6, LEFT, ARC.cy);
  wall(OUTER, 0.5, OUTER, ARC.cy);
  // top arc
  const N = 48;
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI;
    const a1 = ((i + 1) / N) * Math.PI;
    wall(
      ARC.cx + ARC.r * Math.cos(a0), ARC.cy + ARC.r * Math.sin(a0),
      ARC.cx + ARC.r * Math.cos(a1), ARC.cy + ARC.r * Math.sin(a1),
      { arc: true, e: 0.3 },
    );
  }
  // shooter lane
  wall(DIVIDER, 0.5, DIVIDER, LANE_TOP, { lane: true });
  wall(DIVIDER, 0.5, OUTER, 0.5, { lane: true });
  // one-way gate at the lane exit: solid only from the upper-left side
  wall(DIVIDER, LANE_TOP, OUTER, LANE_TOP + 1.1, { oneWay: true, kind: 'gate', e: 0.3 });

  // lower guides into the flippers, and apron below the pivots
  // Guides end tangent to the flipper pivot cap so the ball rolls smoothly onto the flipper.
  for (const s of [1, -1]) {
    const ax = s > 0 ? LEFT : DIVIDER;
    const ay = 4.6;
    const px = -2.1 * s;
    const py = 2.4;
    const dx = px - ax;
    const dy = py - ay;
    const l = Math.hypot(dx, dy);
    // upward normal of the guide
    let nx = -dy / l;
    let ny = dx / l;
    if (ny < 0) { nx = -nx; ny = -ny; }
    const k = FLIPPER.r0 - 0.06;
    wall(ax, ay, px + nx * k, py + ny * k, { guide: true, e: 0.2 });
  }
  wall(-2.1, 2.4, -2.1, -1.2, { apron: true });
  wall(2.1, 2.4, 2.1, -1.2, { apron: true });

  // slingshots (triangles). The inward-facing hypotenuse kicks.
  const slings = [];
  for (const s of [1, -1]) {
    const p1 = [-3.9 * s, 6.7];
    const p2 = [-3.9 * s, 4.85];
    const p3 = [-2.75 * s, 4.0];
    wall(p1[0], p1[1], p2[0], p2[1], { e: 0.5 });
    wall(p2[0], p2[1], p3[0], p3[1], { e: 0.3 });
    const id = slings.length;
    wall(p1[0], p1[1], p3[0], p3[1], { kind: 'sling', id, e: 0.5 });
    slings.push({ id, pts: [p1, p2, p3], side: s });
  }

  // stand-up targets on the left face of the shooter-lane divider
  const targets = [];
  for (const [i, y] of [8.0, 9.1, 10.2].entries()) {
    wall(DIVIDER - 0.14, y - 0.38, DIVIDER - 0.14, y + 0.38, { kind: 'target', id: i, e: 0.35, r: 0.08 });
    targets.push({ id: i, x: DIVIDER - 0.14, y });
  }

  const bumpers = [
    { x: -0.85, y: 13.3 },
    { x: 1.75, y: 13.3 },
    { x: 0.45, y: 11.2 },
  ].map((b, id) => ({ ...b, id, r: BUMPER_R }));

  // top rollovers (sensors, no collision)
  const rollovers = [
    { x: -1.4, y: 16.9 },
    { x: 0.45, y: 17.5 },
    { x: 2.3, y: 16.9 },
  ].map((r, id) => ({ ...r, id, r: 0.42, inside: false }));

  // small rubber posts flanking the rollovers
  const posts = [
    { x: -0.5, y: 17.2, r: 0.16 },
    { x: 1.4, y: 17.2, r: 0.16 },
  ];

  const flippers = [
    { side: 1, px: -2.1, py: 2.4 },
    { side: -1, px: 2.1, py: 2.4 },
  ].map((f) => ({ ...f, a: FLIPPER.rest, w: 0, pressed: false }));

  return { walls, slings, targets, bumpers, rollovers, posts, flippers };
}

export class Sim {
  constructor() {
    this.table = buildTable();
    this.events = [];
    this.ball = { x: LANE_X, y: PLUNGER_REST + R, vx: 0, vy: 0, active: false };
    this.plunger = { y: PLUNGER_REST, pull: 0, vel: 0, charging: false };
  }

  get flippers() {
    return this.table.flippers;
  }

  serveBall() {
    const b = this.ball;
    b.x = LANE_X;
    b.y = this.plunger.y + R;
    b.vx = 0;
    b.vy = 0;
    b.active = true;
  }

  ballInLane() {
    const b = this.ball;
    return b.active && b.x > DIVIDER && b.y < LANE_TOP;
  }

  setFlipper(i, pressed) {
    this.table.flippers[i].pressed = pressed;
  }

  setPlunger(charging) {
    const p = this.plunger;
    if (charging && !p.charging) {
      p.charging = true;
    } else if (!charging && p.charging) {
      p.charging = false;
      if (p.pull > 0.02) {
        p.vel = LAUNCH_MIN + (LAUNCH_MAX - LAUNCH_MIN) * p.pull;
        this.events.push({ type: 'launch', power: p.pull });
      } else {
        p.pull = 0;
      }
    }
  }

  update(dt) {
    let steps = Math.round(dt / DT);
    if (steps > 120) steps = 120;
    for (let i = 0; i < steps; i++) this.step(DT);
  }

  step(dt) {
    const F = FLIPPER;
    for (const f of this.table.flippers) {
      if (f.pressed) {
        f.a += F.upSpeed * dt;
        f.w = F.upSpeed;
        if (f.a >= F.up) { f.a = F.up; f.w = 0; }
      } else {
        f.a -= F.downSpeed * dt;
        f.w = -F.downSpeed;
        if (f.a <= F.rest) { f.a = F.rest; f.w = 0; }
      }
    }

    const p = this.plunger;
    if (p.charging) {
      p.pull = Math.min(1, p.pull + dt / PLUNGER_CHARGE_TIME);
      p.y = PLUNGER_REST - p.pull * PLUNGER_PULL;
      p.vel = -PLUNGER_PULL / PLUNGER_CHARGE_TIME;
    } else if (p.vel > 0) {
      p.y += p.vel * dt;
      if (p.y >= PLUNGER_REST) { p.y = PLUNGER_REST; p.vel = 0; p.pull = 0; }
      else p.pull = (PLUNGER_REST - p.y) / PLUNGER_PULL;
    } else {
      p.vel = 0;
    }

    const b = this.ball;
    if (!b.active) return;

    b.vy -= G * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;

    // plunger tip
    if (b.x > DIVIDER && b.y - R < p.y) {
      b.y = p.y + R;
      if (p.vel > 0) {
        if (b.vy < p.vel) b.vy = p.vel;
      } else if (b.vy < 0) {
        b.vy = -b.vy > 2 ? -b.vy * 0.2 : 0;
      }
    }

    for (let i = 0; i < this.table.flippers.length; i++) this.collideFlipper(b, this.table.flippers[i], i);
    for (const w of this.table.walls) this.collideWall(b, w);
    for (const bm of this.table.bumpers) this.collideBumper(b, bm);
    for (const po of this.table.posts) this.collideCircle(b, po, 0.6);

    for (const ro of this.table.rollovers) {
      const inside = (b.x - ro.x) ** 2 + (b.y - ro.y) ** 2 < ro.r * ro.r;
      if (inside && !ro.inside) this.events.push({ type: 'rollover', id: ro.id });
      ro.inside = inside;
    }

    const sp2 = b.vx * b.vx + b.vy * b.vy;
    if (sp2 > MAX_SPEED * MAX_SPEED) {
      const k = MAX_SPEED / Math.sqrt(sp2);
      b.vx *= k;
      b.vy *= k;
    }
    // light rolling drag
    const drag = 1 - 0.08 * dt;
    b.vx *= drag;
    b.vy *= drag;

    if (b.y < -0.8) {
      b.active = false;
      this.events.push({ type: 'drain' });
    }
  }

  collideWall(b, s) {
    const dx = s.bx - s.ax;
    const dy = s.by - s.ay;
    const len2 = dx * dx + dy * dy;
    let t = ((b.x - s.ax) * dx + (b.y - s.ay) * dy) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = s.ax + t * dx;
    const cy = s.ay + t * dy;
    let nx = b.x - cx;
    let ny = b.y - cy;
    const d2 = nx * nx + ny * ny;
    const rr = R + s.r;
    if (d2 >= rr * rr) return;
    if (s.oneWay && (b.x - s.ax) * -dy + (b.y - s.ay) * dx < 0) return;
    const d = Math.sqrt(d2) || 1e-6;
    nx /= d;
    ny /= d;
    b.x = cx + nx * rr;
    b.y = cy + ny * rr;
    const vn = b.vx * nx + b.vy * ny;
    if (vn >= 0) return;
    const e = -vn > 1 ? s.e : 0;
    b.vx -= (1 + e) * vn * nx;
    b.vy -= (1 + e) * vn * ny;
    if (s.kind === 'sling') {
      if (-vn > 1.5) {
        b.vx += nx * SLING_KICK;
        b.vy += ny * SLING_KICK;
        this.events.push({ type: 'sling', id: s.id });
      }
    } else if (s.kind === 'target') {
      if (-vn > 1) this.events.push({ type: 'target', id: s.id });
    } else if (-vn > 3) {
      this.events.push({ type: 'wall', speed: -vn });
    }
  }

  collideCircle(b, c, e) {
    let nx = b.x - c.x;
    let ny = b.y - c.y;
    const rr = R + c.r;
    const d2 = nx * nx + ny * ny;
    if (d2 >= rr * rr) return 0;
    const d = Math.sqrt(d2) || 1e-6;
    nx /= d;
    ny /= d;
    b.x = c.x + nx * rr;
    b.y = c.y + ny * rr;
    const vn = b.vx * nx + b.vy * ny;
    if (vn >= 0) return 0;
    b.vx -= (1 + e) * vn * nx;
    b.vy -= (1 + e) * vn * ny;
    return { nx, ny, vn };
  }

  collideBumper(b, bm) {
    const hit = this.collideCircle(b, bm, 0.4);
    if (!hit) return;
    // pop: guarantee a strong outward speed
    const out = b.vx * hit.nx + b.vy * hit.ny;
    if (out < BUMPER_KICK) {
      b.vx += (BUMPER_KICK - out) * hit.nx;
      b.vy += (BUMPER_KICK - out) * hit.ny;
    }
    this.events.push({ type: 'bumper', id: bm.id });
  }

  flipperTip(f) {
    return [f.px + f.side * Math.cos(f.a) * FLIPPER.len, f.py + Math.sin(f.a) * FLIPPER.len];
  }

  collideFlipper(b, f, idx) {
    const F = FLIPPER;
    const dirx = f.side * Math.cos(f.a);
    const diry = Math.sin(f.a);
    let t = (b.x - f.px) * dirx + (b.y - f.py) * diry; // distance along flipper
    t = t < 0 ? 0 : t > F.len ? F.len : t;
    const cx = f.px + dirx * t;
    const cy = f.py + diry * t;
    const rf = F.r0 + (F.r1 - F.r0) * (t / F.len);
    let nx = b.x - cx;
    let ny = b.y - cy;
    const d2 = nx * nx + ny * ny;
    const rr = R + rf;
    if (d2 >= rr * rr) return;
    const d = Math.sqrt(d2) || 1e-6;
    nx /= d;
    ny /= d;
    b.x = cx + nx * rr;
    b.y = cy + ny * rr;
    // surface velocity at contact point (include radius offset)
    const arm = t;
    const svx = f.w * arm * -f.side * Math.sin(f.a);
    const svy = f.w * arm * Math.cos(f.a);
    const rvx = b.vx - svx;
    const rvy = b.vy - svy;
    const vn = rvx * nx + rvy * ny;
    if (vn >= 0) return;
    const e = -vn > 1.2 ? F.e : 0;
    b.vx -= (1 + e) * vn * nx;
    b.vy -= (1 + e) * vn * ny;
    if (f.w > 0 && -vn > 4) this.events.push({ type: 'flipperHit', id: idx, speed: -vn });
  }
}
