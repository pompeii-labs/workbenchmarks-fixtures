// Game rules: scoring, balls, ball save, multiplier, high score.
const HI_KEY = 'neon-pinball-hiscore';
export const BALLS_PER_GAME = 3;
const BALL_SAVE_SECONDS = 6;
const MAX_MULT = 5;

export const POINTS = {
  bumper: 100,
  sling: 10,
  target: 250,
  targetSet: 2500,
  rollover: 100,
  rolloverSet: 1000,
  skillShot: 5000,
};

function loadHi() {
  try {
    return parseInt(localStorage.getItem(HI_KEY) || '0', 10) || 0;
  } catch {
    return 0;
  }
}

export class Game {
  constructor(sim, hooks = {}) {
    this.sim = sim;
    this.hooks = hooks; // { message(text, seconds), sound(name, arg), flash(kind, id) }
    this.state = 'attract'; // attract | play | over
    this.score = 0;
    this.ball = 0;
    this.hi = loadHi();
    this.newHi = false;
    this.mult = 1;
    this.targets = [false, false, false];
    this.rolls = [false, false, false];
    this.saveUntil = 0;
    this.leftLane = false;
    this.time = 0;
    this.overTimer = 0;
    this.skillArmed = false;
  }

  msg(text, secs = 1.6) {
    this.hooks.message?.(text, secs);
  }

  sound(name, arg) {
    this.hooks.sound?.(name, arg);
  }

  start() {
    this.state = 'play';
    this.score = 0;
    this.ball = 1;
    this.newHi = false;
    this.resetBallState();
    this.sim.serveBall();
    this.msg('BALL 1', 1.4);
    this.sound('start');
  }

  resetBallState() {
    this.mult = 1;
    this.targets = [false, false, false];
    this.rolls = [false, false, false];
    this.leftLane = false;
    this.saveUntil = 0;
  }

  add(points) {
    this.score += points * this.mult;
    if (this.score > this.hi) {
      if (!this.newHi && this.hi > 0) {
        this.msg('NEW HIGH SCORE!', 1.6);
        this.sound('hiscore');
      }
      this.newHi = true;
      this.hi = this.score;
    }
  }

  multUp() {
    if (this.mult < MAX_MULT) {
      this.mult++;
      this.msg(`${this.mult}X MULTIPLIER`, 1.4);
      this.sound('mult');
    }
  }

  // Lane change: flipper presses rotate the lit rollovers.
  laneChange(dir) {
    if (this.state !== 'play') return;
    const r = this.rolls;
    this.rolls = dir > 0 ? [r[2], r[0], r[1]] : [r[1], r[2], r[0]];
  }

  ballSaveActive() {
    return this.state === 'play' && this.leftLane && this.time < this.saveUntil;
  }

  update(dt) {
    this.time += dt;
    const sim = this.sim;

    if (this.state === 'play' && !this.leftLane && sim.ball.active && sim.ball.x < 4.9) {
      this.leftLane = true;
      this.saveUntil = this.time + BALL_SAVE_SECONDS;
    }

    for (const e of sim.events) this.handle(e);
    sim.events.length = 0;

    if (this.state === 'over') {
      this.overTimer -= dt;
      if (this.overTimer <= 0) this.state = 'attract';
    }
  }

  handle(e) {
    const playing = this.state === 'play';
    // Skill shot: plunge so the ball's first contact is a top rollover.
    if (e.type === 'launch') this.skillArmed = playing;
    else if (e.type === 'rollover' && this.skillArmed) {
      this.skillArmed = false;
      this.add(POINTS.skillShot);
      this.msg('SKILL SHOT!', 1.6);
      this.sound('set');
    } else if (['bumper', 'sling', 'target', 'flipperHit', 'drain'].includes(e.type)) this.skillArmed = false;

    switch (e.type) {
      case 'bumper':
        this.hooks.flash?.('bumper', e.id);
        this.sound('bumper', e.id);
        if (playing) this.add(POINTS.bumper);
        break;
      case 'sling':
        this.hooks.flash?.('sling', e.id);
        this.sound('sling');
        if (playing) this.add(POINTS.sling);
        break;
      case 'target':
        this.hooks.flash?.('target', e.id);
        this.sound('target');
        if (!playing) break;
        this.add(POINTS.target);
        this.targets[e.id] = true;
        if (this.targets.every(Boolean)) {
          this.add(POINTS.targetSet);
          this.targets = [false, false, false];
          this.msg('TARGETS COMPLETE', 1.4);
          this.multUp();
          this.sound('set');
        }
        break;
      case 'rollover':
        this.hooks.flash?.('rollover', e.id);
        this.sound('rollover');
        if (!playing) break;
        if (!this.rolls[e.id]) {
          this.rolls[e.id] = true;
          this.add(POINTS.rollover);
        } else {
          this.add(10);
        }
        if (this.rolls.every(Boolean)) {
          this.add(POINTS.rolloverSet);
          this.rolls = [false, false, false];
          this.msg('LANES COMPLETE', 1.4);
          this.multUp();
          this.sound('set');
        }
        break;
      case 'flipperHit':
        this.sound('hit', e.speed);
        break;
      case 'wall':
        this.sound('wall', e.speed);
        break;
      case 'launch':
        this.sound('launch', e.power);
        break;
      case 'drain':
        this.onDrain();
        break;
    }
  }

  onDrain() {
    if (this.state !== 'play') {
      return;
    }
    if (this.ballSaveActive() || !this.leftLane) {
      this.msg('BALL SAVED', 1.4);
      this.sound('save');
      this.leftLane = false;
      this.sim.serveBall();
      return;
    }
    this.sound('drain');
    if (this.ball >= BALLS_PER_GAME) {
      this.gameOver();
      return;
    }
    this.ball++;
    this.resetBallState();
    this.sim.serveBall();
    this.msg(this.ball === BALLS_PER_GAME ? 'LAST BALL' : `BALL ${this.ball}`, 1.4);
  }

  gameOver() {
    this.state = 'over';
    this.overTimer = 3;
    if (this.score >= this.hi) {
      this.hi = this.score;
      try {
        localStorage.setItem(HI_KEY, String(this.hi));
      } catch {
        /* storage unavailable */
      }
    }
    this.msg(this.newHi ? 'GAME OVER · NEW HIGH SCORE' : 'GAME OVER', 3);
    this.sound('gameover');
  }
}
