// Headless physics sanity checks: run with `npm test`.
import { Game } from '../src/game.js';
import { ARC, LANE, PLAYFIELD } from '../src/table.js';

let failures = 0;
const check = (cond, msg) => { if (!cond) { failures++; console.error('FAIL', msg); } else console.log('ok  ', msg); };

function inBounds(b) {
  if (b.y > ARC.cy) return Math.hypot(b.x - ARC.cx, b.y - ARC.cy) < ARC.r;
  return b.x > PLAYFIELD.left && b.x < LANE.outer;
}

// 1. Full plunge leaves the lane and reaches the upper playfield
{
  const g = new Game();
  g.start();
  g.setInput('plunger', true);
  for (let i = 0; i < 60; i++) g.update(1 / 60);
  g.setInput('plunger', false);
  let maxY = 0, out = false;
  for (let i = 0; i < 180; i++) { g.update(1 / 60); maxY = Math.max(maxY, g.ball.y); if (!inBounds(g.ball)) out = true; }
  check(g.inPlay, 'full plunge enters playfield');
  check(maxY > 17, `full plunge reaches top arc (maxY=${maxY.toFixed(2)})`);
  check(!out, 'ball stays inside cabinet after plunge');
}

// 2. Weak plunge falls back to the plunger
{
  const g = new Game();
  g.start();
  g.setInput('plunger', true);
  g.update(0.05);
  g.setInput('plunger', false);
  for (let i = 0; i < 240; i++) g.update(1 / 60);
  check(!g.inPlay && g.ball.x > LANE.inner, 'weak plunge returns to shooter lane');
}

// 3. Flipper shot from a cradle sends the ball up the table
{
  const g = new Game();
  g.start();
  g.setInput('left', true);
  g.ball.x = -2.6; g.ball.y = 3.8; g.ball.vx = 0; g.ball.vy = 0; g.inPlay = true;
  for (let i = 0; i < 120; i++) g.update(1 / 60);
  const cradled = g.ball.y < 3.5 && Math.hypot(g.ball.vx, g.ball.vy) < 0.5;
  check(cradled, `ball cradles on raised left flipper (x=${g.ball.x.toFixed(2)}, y=${g.ball.y.toFixed(2)})`);
  g.setInput('left', false);
  // ball rolls down the flipper; flip when near the middle
  let fired = false, maxY = 0;
  for (let i = 0; i < 600; i++) {
    if (!fired && g.ball.x > -1.0) { g.setInput('left', true); fired = true; }
    g.update(1 / 240);
    maxY = Math.max(maxY, g.ball.y);
  }
  check(maxY > 10, `flipper shot travels up the table (maxY=${maxY.toFixed(2)})`);
}

// 4. Long random play: no tunneling, game completes with 3 balls
{
  let escapes = 0, games = 0, bumpers = 0, slings = 0, rolls = 0, maxScore = 0;
  for (let seed = 0; seed < 12; seed++) {
    const g = new Game({ onEvent: (t) => { if (t === 'bumper') bumpers++; if (t === 'sling') slings++; if (t === 'rollover') rolls++; } });
    g.start();
    let t = 0;
    const bot = { left: 0, right: 0 };
    while (g.state !== 'gameover' && t < 900) {
      const b = g.ball;
      if (g.state === 'playing' && !g.inPlay && b.x > LANE.inner && Math.abs(b.vy) < 0.01) {
        g.setInput('plunger', true);
        for (let i = 0; i < 30 + Math.random() * 30; i++) g.update(1 / 60);
        g.setInput('plunger', false);
      }
      // simple bot: tap a flipper (0.2s) when the ball is over it
      const want = b.y < 3.2 && b.vy < 0.5;
      for (const [name, lo, hi] of [['left', -2.2, -0.4], ['right', 0.4, 2.2]]) {
        bot[name] -= 1 / 60;
        if (bot[name] <= -0.3 && want && b.x > lo && b.x < hi) bot[name] = 0.2;
        g.setInput(name, bot[name] > 0);
      }
      g.update(1 / 60);
      t += 1 / 60;
      if (g.state === 'playing' && !inBounds(g.ball)) { escapes++; g.ball.y = -5; }
    }
    if (g.state === 'gameover') games++;
    maxScore = Math.max(maxScore, g.score);
  }
  check(escapes === 0, `no ball escapes in random play (escapes=${escapes})`);
  check(games === 12, `all simulated games end (${games}/12)`);
  check(bumpers > 0 && slings > 0, `bumpers (${bumpers}) and slings (${slings}) fire; rollovers=${rolls}; best=${maxScore}`);
}

if (failures) { console.error(`${failures} failure(s)`); process.exit(1); }
console.log('all physics checks passed');
