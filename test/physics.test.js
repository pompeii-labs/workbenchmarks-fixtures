// Headless sanity tests for the pinball physics. Run: npm test
import { Sim, LANE, STEP, BALL_R, ARC } from '../src/physics.js';

let failures = 0;
const check = (name, ok, info = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  ' + info : ''}`);
  if (!ok) failures++;
};

function inBounds(b) {
  if (b.y < -2) return true; // drained
  if (b.x < -10 + BALL_R * 0.5 || b.x > LANE.x1 - BALL_R * 0.5) return false;
  const dx = b.x - ARC.cx, dy = b.y - ARC.cy;
  if (dy > 0 && Math.hypot(dx, dy) > ARC.r - BALL_R * 0.5) return false;
  return true;
}

function launch(sim, holdSteps) {
  sim.serve();
  for (let i = 0; i < 30; i++) sim.step({});
  for (let i = 0; i < holdSteps; i++) sim.step({ plunger: true });
  sim.step({});
}

// 1. Full plunge reaches the playfield.
{
  const sim = new Sim();
  launch(sim, 120);
  let entered = false;
  for (let i = 0; i < 600 && sim.ball.active; i++) {
    sim.step({});
    if (sim.ball.x < LANE.x0 - BALL_R) entered = true;
  }
  check('full plunge enters playfield', entered);
}

// 2. Weak plunge falls back onto the plunger.
{
  const sim = new Sim();
  launch(sim, 5);
  for (let i = 0; i < 400; i++) sim.step({});
  check('weak plunge returns to plunger', sim.ballOnPlunger(), `y=${sim.ball.y.toFixed(2)}`);
}

// 3. Ball dropped onto a raised left flipper cradles; then flipping sends it up-field.
{
  const sim = new Sim();
  sim.ball = { x: -3.5, y: 12, vx: 0, vy: 0, active: true };
  for (let i = 0; i < 240; i++) sim.step({ left: true });
  const cradled = sim.ball.active && sim.ball.y < 9;
  check('ball cradles on held flipper', cradled, `pos=(${sim.ball.x.toFixed(2)}, ${sim.ball.y.toFixed(2)})`);
  for (let i = 0; i < 40; i++) sim.step({ left: false });
  let maxY = 0;
  // Ball now rolling down the lowered flipper: flip as it nears the tip.
  for (let i = 0; i < 240 && sim.ball.active; i++) {
    sim.step({ left: sim.ball.x > -2.6 || i > 200 ? true : false });
    maxY = Math.max(maxY, sim.ball.y);
  }
  check('flipper shot travels up-field', maxY > 22, `maxY=${maxY.toFixed(1)}`);
}

// 4. Ball dropped at center with no flipping drains.
{
  const sim = new Sim();
  sim.ball = { x: 0, y: 14, vx: 0, vy: 0, active: true };
  let drained = false;
  sim.events = [];
  for (let i = 0; i < 600; i++) {
    sim.step({});
    if (sim.events.some((e) => e.type === 'drain')) { drained = true; break; }
  }
  check('center ball drains between flippers', drained);
}

// 5. Fuzz: random flipping for a long time never tunnels out of the table or sticks.
{
  let escapes = 0, stuck = 0, drains = 0, bumps = 0;
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let game = 0; game < 40; game++) {
    const sim = new Sim();
    launch(sim, 70 + Math.floor(rnd() * 50));
    let still = 0;
    for (let i = 0; i < 120 * 60 && sim.ball.active; i++) {
      // A simple "bot": flip when the ball is near a flipper.
      const b = sim.ball;
      const near = b.y < 8.5 && b.vy < 5;
      sim.step({ left: near && b.x < 0.3 && rnd() > 0.05, right: near && b.x > -0.3 && rnd() > 0.05 });
      if (!inBounds(sim.ball)) { escapes++; break; }
      const sp = Math.hypot(b.vx, b.vy);
      if (sp < 0.3 && !sim.ballInLane() && b.y > 9) still++;
      else still = 0;
      if (still > 600) { stuck++; break; }
    }
    for (const e of sim.events) {
      if (e.type === 'drain') drains++;
      if (e.type === 'bumper') bumps++;
    }
  }
  check('fuzz: no escapes', escapes === 0, `escapes=${escapes}`);
  check('fuzz: no stuck balls', stuck === 0, `stuck=${stuck}`);
  check('fuzz: bumpers get hit', bumps > 0, `bumperHits=${bumps} drains=${drains}/40`);
}

if (failures) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log('\nAll physics tests passed');
