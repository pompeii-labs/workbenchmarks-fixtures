// Headless sanity checks for the pinball simulation: node test/sim.test.js
import { Sim, DIVIDER, LEFT, OUTER } from '../src/physics.js';
import { Game } from '../src/game.js';

let failures = 0;
const check = (name, ok, info = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  ' + info : ''}`);
  if (!ok) failures++;
};

function run(sim, seconds, each) {
  const n = Math.round(seconds * 1200);
  for (let i = 0; i < n; i++) {
    sim.step(1 / 1200);
    if (each && each(sim, i / 1200) === false) break;
  }
}

// 1. Full plunge leaves the shooter lane and enters the playfield
{
  const s = new Sim();
  s.serveBall();
  s.setPlunger(true);
  run(s, 1.0);
  s.setPlunger(false);
  let maxY = 0;
  let left = false;
  run(s, 2.5, (sim) => {
    maxY = Math.max(maxY, sim.ball.y);
    if (sim.ball.x < DIVIDER - 0.5) left = true;
  });
  check('full plunge reaches playfield', left, `maxY=${maxY.toFixed(2)}`);
}

// 2. Weak plunge falls back onto the plunger
{
  const s = new Sim();
  s.serveBall();
  s.setPlunger(true);
  run(s, 0.1);
  s.setPlunger(false);
  run(s, 2.0);
  check('weak plunge returns to lane', s.ballInLane(), `y=${s.ball.y.toFixed(2)}`);
}

// 3. Ball dropped in left inlane rolls onto flipper; flip sends it up the table
{
  const s = new Sim();
  s.ball = { x: -4.4, y: 6.5, vx: 0, vy: 0, active: true };
  run(s, 2, (sim) => sim.ball.x < -1.6);
  const onFlipper = s.ball.x > -2.2 && s.ball.x < -0.3 && s.ball.y < 3;
  check('inlane feeds left flipper', onFlipper, `(${s.ball.x.toFixed(2)}, ${s.ball.y.toFixed(2)})`);
  s.setFlipper(0, true);
  let maxY = 0;
  run(s, 1.2, (sim) => { maxY = Math.max(maxY, sim.ball.y); });
  check('left flip shoots ball up the table', maxY > 10, `maxY=${maxY.toFixed(2)}`);
}

// 4. Cradle: holding flipper up traps the ball
{
  const s = new Sim();
  s.setFlipper(1, true);
  run(s, 0.1);
  s.ball = { x: 4.4, y: 6.5, vx: 0, vy: 0, active: true };
  run(s, 3);
  check('right flipper cradles ball', s.ball.active && s.ball.y > 2 && s.ball.y < 4.5, `(${s.ball.x.toFixed(2)}, ${s.ball.y.toFixed(2)})`);
}

// 5. Center drop drains
{
  const s = new Sim();
  s.ball = { x: 0, y: 6, vx: 0, vy: 0, active: true };
  let drained = false;
  run(s, 3, (sim) => { if (sim.events.some((e) => e.type === 'drain')) { drained = true; return false; } });
  check('center ball drains', drained);
}

// 6. Bumper pops
{
  const s = new Sim();
  const b0 = s.table.bumpers[2];
  s.ball = { x: b0.x + 0.05, y: b0.y + 1.5, vx: 0, vy: -5, active: true };
  let hit = false;
  run(s, 0.5, (sim) => { if (sim.events.some((e) => e.type === 'bumper')) { hit = true; return false; } });
  check('bumper registers hit', hit);
}

// 7. Long random-ish play: ball never escapes the cabinet or goes NaN
{
  const s = new Sim();
  let bad = null;
  let drains = 0;
  let bumps = 0;
  let t = 0;
  const serve = () => { s.serveBall(); s.setPlunger(true); };
  serve();
  let jitter = 0;
  let stillFor = 0;
  let plungeAt = 0.4 + Math.random() * 0.6;
  for (let i = 0; i < 1200 * 600 && !bad; i++) {
    t += 1 / 1200;
    if (s.plunger.charging && t > plungeAt) s.setPlunger(false);
    // naive autoplay: flip when ball is near a flipper
    const b = s.ball;
    const zone = (b.y < 3.6 + jitter) && b.vy < 0;
    s.setFlipper(0, zone && b.x < 0.2 && b.x > -1.6);
    s.setFlipper(1, zone && b.x > -0.2 && b.x < 1.6);
    if (b.y > 6) jitter = Math.random() * 0.8 - 0.5;
    s.step(1 / 1200);
    for (const e of s.events) {
      if (e.type === 'drain') { drains++; serve(); plungeAt = t + 0.3 + Math.random() * 0.7; }
      if (e.type === 'bumper') bumps++;
    }
    s.events.length = 0;
    if (s.ballInLane() && !s.plunger.charging && s.plunger.vel === 0 && Math.abs(b.vy) < 0.01) {
      s.setPlunger(true); plungeAt = t + 0.5 + Math.random() * 0.5;
    }
    if (b.active && !s.ballInLane() && Math.hypot(b.vx, b.vy) < 0.3) stillFor += 1 / 1200; else stillFor = 0;
    if (stillFor > 4) bad = `ball stuck at (${b.x.toFixed(2)}, ${b.y.toFixed(2)})`;
    if (!Number.isFinite(b.x) || !Number.isFinite(b.y)) bad = 'NaN';
    else if (b.active && (b.x < LEFT - 0.1 || b.x > OUTER + 0.1 || b.y > 21)) bad = `escaped at (${b.x.toFixed(2)}, ${b.y.toFixed(2)})`;
  }
  check('600s autoplay: in bounds, never stuck', !bad, bad || `drains=${drains} bumperHits=${bumps} end=(${s.ball.x.toFixed(2)}, ${s.ball.y.toFixed(2)})`);
}


// 8. Game flow: ball save, three balls, game over, high score
{
  const store = {};
  globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } };
  const s = new Sim();
  const msgs = [];
  const g = new Game(s, { message: (t) => msgs.push(t) });
  g.start();
  const drainOut = (late) => {
    s.ball.x = 0; s.ball.y = 8; s.ball.vx = 0; s.ball.vy = 0;
    g.update(0.01); // registers leaving the lane
    if (late) g.time += 10; // ball save expired
    s.ball.y = -1; s.ball.vy = -5;
    s.step(1 / 1200);
    g.update(0.01);
  };
  s.events.push({ type: 'bumper', id: 0 });
  g.update(0.01);
  check('bumper scores 100', g.score === 100, `score=${g.score}`);
  drainOut(false);
  check('early drain is saved', g.ball === 1 && msgs.includes('BALL SAVED'));
  drainOut(true);
  check('late drain costs a ball', g.ball === 2);
  drainOut(true);
  drainOut(true);
  check('game over after 3 balls', g.state === 'over', g.state);
  check('high score stored', store['neon-pinball-hiscore'] === '100' && g.hi === 100);
  for (let i = 0; i < 3; i++) { s.events.push({ type: 'target', id: i }); }
  g.update(0.01);
  check('no scoring after game over', g.score === 100);
  g.update(3.1);
  check('returns to attract', g.state === 'attract');
}

if (failures) {
  console.log(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nall checks passed');
