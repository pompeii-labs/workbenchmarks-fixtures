// Pure game simulation (no DOM / three.js) so it can be unit-tested in Node.
import {
  BALL_R, WALLS, BUMPERS, FLIPPERS, FLIPPER, GATE, LANE, LANE_X, ROLLOVERS, PLAYFIELD,
} from './table.js';

export const GRAVITY = 25;
export const STEP = 1 / 480;
const MAX_SPEED = 40;
const BALLS_PER_GAME = 3;
const BALL_SAVE_TIME = 7;
const EXTRA_BALL_AT = 100000;
const JACKPOT_HITS = 25;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Flipper {
  constructor({ side, px, py }) {
    this.side = side;
    this.px = px;
    this.py = py;
    const s = side === 'L' ? 1 : -1;
    // world angles; left flipper points right, right flipper points left
    this.restAngle = side === 'L' ? -FLIPPER.rest : Math.PI + FLIPPER.rest;
    this.upAngle = side === 'L' ? FLIPPER.up : Math.PI - FLIPPER.up;
    this.dir = s; // +1 => angle increases when flipping up
    this.angle = this.restAngle;
    this.omega = 0;
    this.pressed = false;
  }
  step(dt) {
    const target = this.pressed ? this.upAngle : this.restAngle;
    const speed = this.pressed ? FLIPPER.upSpeed : FLIPPER.downSpeed;
    const prev = this.angle;
    const d = target - this.angle;
    const maxMove = speed * dt;
    this.angle += clamp(d, -maxMove, maxMove);
    this.omega = (this.angle - prev) / dt;
  }
}

// Resolve contact of ball against a surface point moving at (svx, svy).
function resolve(ball, nx, ny, pen, svx, svy, e, friction) {
  ball.x += nx * pen;
  ball.y += ny * pen;
  const rvx = ball.vx - svx;
  const rvy = ball.vy - svy;
  const vn = rvx * nx + rvy * ny;
  if (vn >= 0) return 0;
  const imp = -vn;
  const rest = imp < 0.6 ? 0 : e; // kill micro-bounces so the ball rolls
  const tvx = rvx - vn * nx;
  const tvy = rvy - vn * ny;
  ball.vx += -(1 + rest) * vn * nx - tvx * friction;
  ball.vy += -(1 + rest) * vn * ny - tvy * friction;
  return imp;
}

function segT(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  return clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1);
}

export class Game {
  constructor({ highScore = 0, onEvent = () => {} } = {}) {
    this.highScore = highScore;
    this.emit = onEvent;
    this.flippers = FLIPPERS.map((f) => new Flipper(f));
    this.ball = { x: LANE_X, y: LANE.plungerRest + BALL_R, vx: 0, vy: 0, active: false };
    this.plungerY = LANE.plungerRest;
    this.plungerPull = 0; // 0..1
    this.input = { left: false, right: false, plunger: false };
    this.bumperGlow = BUMPERS.map(() => 0);
    this.slingGlow = [0, 0];
    this.bumperCooldown = BUMPERS.map(() => 0);
    this.slingCooldown = [0, 0];
    this.rolloverInside = ROLLOVERS.map(() => false);
    this.lanesLit = [false, false, false];
    this.state = 'attract';
    this.time = 0;
    this.acc = 0;
    this.score = 0;
    this.lastScore = 0;
    this.ballNumber = 1;
    this.multiplier = 1;
    this.bumperHits = 0;
    this.ballSave = 0;
    this.ballSaveUsed = false;
    this.inPlay = false; // ball left the shooter lane
    this.stuckTime = 0;
    this.drainTimer = 0;
    this.extraBalls = 0;
    this.extraBallAwarded = false;
    this.newHigh = false;
  }

  start() {
    this.state = 'playing';
    this.score = 0;
    this.ballNumber = 1;
    this.extraBalls = 0;
    this.extraBallAwarded = false;
    this.newHigh = false;
    this.lanesLit = [false, false, false];
    this.emit('start');
    this.serveBall();
  }

  serveBall() {
    const b = this.ball;
    b.x = LANE_X;
    b.y = LANE.plungerRest + BALL_R;
    b.vx = b.vy = 0;
    b.active = true;
    this.multiplier = 1;
    this.bumperHits = 0;
    this.inPlay = false;
    this.ballSave = 0;
    this.ballSaveUsed = false;
    this.emit('serve', { ball: this.ballNumber });
  }

  addScore(points) {
    if (this.state !== 'playing') return;
    this.score += points * this.multiplier;
    if (!this.extraBallAwarded && this.score >= EXTRA_BALL_AT) {
      this.extraBallAwarded = true;
      this.extraBalls++;
      this.emit('extraball');
    }
  }

  setInput(name, down) {
    if (this.input[name] === down) return;
    this.input[name] = down;
    if (name === 'left' || name === 'right') {
      const f = this.flippers[name === 'left' ? 0 : 1];
      if (this.state === 'playing') {
        f.pressed = down;
        this.emit('flipper', { side: f.side, up: down });
        // lane change: rotate lit rollover lights
        if (down) {
          const l = this.lanesLit;
          this.lanesLit = name === 'left' ? [l[1], l[2], l[0]] : [l[2], l[0], l[1]];
        }
      }
    }
    if (name === 'plunger' && !down && this.state === 'playing') this.releasePlunger();
  }

  releasePlunger() {
    const b = this.ball;
    const pull = this.plungerPull;
    const inLane = b.x > LANE.inner && b.y < LANE.plungerRest + BALL_R + 0.25;
    if (inLane && pull > 0.03) {
      b.vy = 16 + pull * 22 + Math.random() * 0.4;
      this.emit('launch', { power: pull });
    } else if (pull > 0.03) {
      this.emit('plungerDry');
    }
    this.plungerPull = 0;
    this.plungerY = LANE.plungerRest;
  }

  update(dt) {
    dt = Math.min(dt, 0.1);
    this.time += dt;
    // visual decay
    for (let i = 0; i < this.bumperGlow.length; i++) this.bumperGlow[i] = Math.max(0, this.bumperGlow[i] - dt * 4);
    for (let i = 0; i < 2; i++) this.slingGlow[i] = Math.max(0, this.slingGlow[i] - dt * 6);

    if (this.state === 'draining') {
      this.drainTimer -= dt;
      if (this.drainTimer <= 0) this.nextBall();
    }
    if (this.state !== 'playing') {
      // keep flippers relaxed outside play
      for (const f of this.flippers) { f.pressed = false; f.step(dt); }
      return;
    }

    // plunger pull
    if (this.input.plunger) {
      this.plungerPull = Math.min(1, this.plungerPull + dt / 0.9);
      this.plungerY = LANE.plungerRest - (LANE.plungerRest - LANE.plungerPulled) * this.plungerPull;
    }
    if (this.ballSave > 0) this.ballSave = Math.max(0, this.ballSave - dt);

    this.acc += dt;
    while (this.acc >= STEP) {
      this.acc -= STEP;
      this.step(STEP);
      if (this.state !== 'playing') { this.acc = 0; break; }
    }
  }

  step(dt) {
    const b = this.ball;
    for (const f of this.flippers) f.step(dt);
    for (let i = 0; i < 3; i++) this.bumperCooldown[i] -= dt;
    for (let i = 0; i < 2; i++) this.slingCooldown[i] -= dt;

    b.vy -= GRAVITY * dt;
    b.vx *= 1 - 0.12 * dt;
    b.vy *= 1 - 0.12 * dt;
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > MAX_SPEED) { b.vx *= MAX_SPEED / sp; b.vy *= MAX_SPEED / sp; }
    b.x += b.vx * dt;
    b.y += b.vy * dt;

    for (let iter = 0; iter < 2; iter++) {
      this.collideWalls(b);
      this.collideFlippers(b);
      this.collideBumpers(b);
      this.collideGate(b);
      this.collidePlunger(b);
    }
    this.checkRollovers(b);

    if (!this.inPlay && b.x < LANE.inner - BALL_R) {
      this.inPlay = true;
      if (!this.ballSaveUsed) this.ballSave = BALL_SAVE_TIME;
      this.emit('inplay');
    }

    // anti-stuck nudge (never near flippers or in the lane)
    if (Math.hypot(b.vx, b.vy) < 0.25 && b.y > 4 && b.x < LANE.inner) {
      this.stuckTime += dt;
      if (this.stuckTime > 2) {
        this.stuckTime = 0;
        b.vx += (Math.random() - 0.5) * 4;
        b.vy += 3;
        this.emit('nudge');
      }
    } else this.stuckTime = 0;

    if (b.y < -0.8) this.drain();
  }

  collideWalls(b) {
    for (const w of WALLS) {
      const t = segT(b.x, b.y, w.ax, w.ay, w.bx, w.by);
      const cx = w.ax + (w.bx - w.ax) * t;
      const cy = w.ay + (w.by - w.ay) * t;
      const dx = b.x - cx, dy = b.y - cy;
      const min = BALL_R + w.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min || d2 < 1e-12) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d, ny = dy / d;
      const imp = resolve(b, nx, ny, min - d, 0, 0, w.e, 0.002);
      if (w.kind === 'sling' && imp > 1.2 && this.slingCooldown[w.index] <= 0 && t > 0.08 && t < 0.92) {
        // fire the slingshot along the face normal
        const fx = -(w.by - w.ay), fy = w.bx - w.ax;
        const fl = Math.hypot(fx, fy);
        let kx = fx / fl, ky = fy / fl;
        if (kx * nx + ky * ny < 0) { kx = -kx; ky = -ky; }
        b.vx += kx * 9;
        b.vy += ky * 9;
        this.slingCooldown[w.index] = 0.12;
        this.slingGlow[w.index] = 1;
        this.addScore(10);
        this.emit('sling', { index: w.index });
      } else if (imp > 2) {
        this.emit('hit', { kind: w.kind, speed: imp });
      }
    }
  }

  collideFlippers(b) {
    const { len, r0, r1 } = FLIPPER;
    for (const f of this.flippers) {
      const c = Math.cos(f.angle), s = Math.sin(f.angle);
      const rx = b.x - f.px, ry = b.y - f.py;
      const t = clamp((rx * c + ry * s) / len, 0, 1);
      const cx = f.px + c * len * t, cy = f.py + s * len * t;
      const r = r0 + (r1 - r0) * t;
      const dx = b.x - cx, dy = b.y - cy;
      const min = BALL_R + r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min || d2 < 1e-12) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d, ny = dy / d;
      const qx = cx + nx * r - f.px, qy = cy + ny * r - f.py;
      const svx = -f.omega * qy, svy = f.omega * qx;
      const imp = resolve(b, nx, ny, min - d, svx, svy, 0.3, 0.003);
      if (imp > 3) this.emit('hit', { kind: 'flipper', speed: imp });
    }
  }

  collideBumpers(b) {
    for (let i = 0; i < BUMPERS.length; i++) {
      const bp = BUMPERS[i];
      const dx = b.x - bp.x, dy = b.y - bp.y;
      const min = BALL_R + bp.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2) || 1e-6;
      const nx = dx / d, ny = dy / d;
      resolve(b, nx, ny, min - d, 0, 0, 0.5, 0);
      if (this.bumperCooldown[i] <= 0) {
        // pop! guarantee a strong kick away from the bumper
        b.vx += nx * 8;
        b.vy += ny * 8;
        const vn = b.vx * nx + b.vy * ny;
        if (vn < 13) { b.vx += nx * (13 - vn); b.vy += ny * (13 - vn); }
        this.bumperCooldown[i] = 0.06;
        this.bumperGlow[i] = 1;
        this.bumperHits++;
        this.addScore(100);
        this.emit('bumper', { index: i });
        if (this.bumperHits % JACKPOT_HITS === 0) {
          this.addScore(10000);
          this.emit('jackpot');
        }
      }
    }
  }

  collideGate(b) {
    const g = GATE;
    const dx = g.bx - g.ax, dy = g.by - g.ay;
    const l = Math.hypot(dx, dy);
    const nx = -dy / l, ny = dx / l; // points up/left (the blocking side)
    const t = ((b.x - g.ax) * dx + (b.y - g.ay) * dy) / (l * l);
    if (t < 0 || t > 1) return;
    const sd = (b.x - g.ax) * nx + (b.y - g.ay) * ny;
    if (sd > 0 && sd < BALL_R + 0.03 && b.vx * nx + b.vy * ny < 0) {
      resolve(b, nx, ny, BALL_R + 0.03 - sd, 0, 0, 0.3, 0.002);
      this.emit('hit', { kind: 'gate', speed: 2 });
    }
  }

  collidePlunger(b) {
    if (b.x < LANE.inner || b.x > LANE.outer) return;
    const top = this.plungerY;
    if (b.y - BALL_R < top && b.y > top - 0.6) {
      resolve(b, 0, 1, top - (b.y - BALL_R), 0, 0, 0.1, 0.05);
    }
  }

  checkRollovers(b) {
    for (let i = 0; i < ROLLOVERS.length; i++) {
      const r = ROLLOVERS[i];
      const inside = Math.abs(b.x - r.x) < 0.4 && Math.abs(b.y - r.y) < 0.35;
      if (inside && !this.rolloverInside[i]) {
        this.addScore(this.lanesLit[i] ? 100 : 500);
        this.lanesLit[i] = true;
        this.emit('rollover', { index: i });
        if (this.lanesLit.every(Boolean)) {
          this.lanesLit = [false, false, false];
          this.addScore(2500);
          if (this.multiplier < 5) this.multiplier++;
          this.emit('lanes', { multiplier: this.multiplier });
        }
      }
      this.rolloverInside[i] = inside;
    }
  }

  drain() {
    const b = this.ball;
    if (this.ballSave > 0) {
      this.ballSaveUsed = true;
      this.ballSave = 0;
      b.x = LANE_X;
      b.y = LANE.plungerRest + BALL_R;
      b.vx = b.vy = 0;
      this.inPlay = false;
      this.emit('saved');
      return;
    }
    b.active = false;
    b.vx = b.vy = 0;
    this.state = 'draining';
    this.drainTimer = 1.6;
    for (const f of this.flippers) f.pressed = false;
    this.emit('drain', { ball: this.ballNumber });
  }

  nextBall() {
    if (this.extraBalls > 0) {
      this.extraBalls--;
      this.state = 'playing';
      this.emit('shootagain');
      this.serveBall();
      return;
    }
    if (this.ballNumber >= BALLS_PER_GAME) {
      this.state = 'gameover';
      this.lastScore = this.score;
      if (this.score > this.highScore) {
        this.highScore = this.score;
        this.newHigh = true;
      }
      this.emit('gameover', { score: this.score, newHigh: this.newHigh });
      return;
    }
    this.ballNumber++;
    this.state = 'playing';
    this.serveBall();
    // carry held flipper buttons over
    this.flippers[0].pressed = this.input.left;
    this.flippers[1].pressed = this.input.right;
  }
}

export { BALLS_PER_GAME, PLAYFIELD };
