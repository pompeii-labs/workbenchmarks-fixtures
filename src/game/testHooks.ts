// Test-only hooks. Imported only when VITE_TEST_HOOKS=1 (the build:test script),
// so the production bundle contains none of this.
import { EMPTY_COMMAND, createState, placeBallOnPlunger, startGame, step, type SimState } from '../sim/sim';
import type { Game } from './Game';

const STATES = ['title', 'plunger', 'active-play', 'paused', 'game-over', 'late'] as const;

function runSteps(s: SimState, n: number, cmd = EMPTY_COMMAND): void {
  for (let i = 0; i < n; i += 1) step(s, cmd);
}

export function installTestHooks(game: Game): void {
  let seed = 1;
  const fresh = (best: number) => {
    game.state = createState(best, seed);
    game.paused = false;
  };
  const finish = (name: string) => {
    game.advance(0, EMPTY_COMMAND);
    game.render(0, 0);
    game.publishDiagnostics();
    return { state: name };
  };

  window.__THREE_GAME_TEST_HOOKS__ = {
    seed: (value: number) => {
      seed = value >>> 0;
      game.state.rngState = seed;
    },
    setState: (name: string) => {
      if (!(STATES as readonly string[]).includes(name)) throw new Error(`Unknown test state: ${name}`);
      const wasFrozen = game.pausedForScreenshot;
      game.pausedForScreenshot = false;
      fresh(12500);
      const s = game.state;
      if (name === 'title') {
        // Attract screen: nothing else to do.
      } else if (name === 'plunger') {
        startGame(s);
        s.plunger.latch = false;
        // Real plunger pull: hold the plunger for ~0.55 s of sim time.
        runSteps(s, 260, { ...EMPTY_COMMAND, plunger: true });
      } else if (name === 'active-play' || name === 'paused' || name === 'late') {
        startGame(s);
        s.events.length = 0;
        if (name === 'late') {
          s.ballsLeft = 1;
          s.ballNumber = 3;
          s.score = 48210;
          s.mult = 3;
          s.laneLit = [true, false, true];
        } else {
          s.score = 3420;
          s.laneLit = [false, true, false];
        }
        // Fire the ball into the top bumper from below so the hit, kick, score and flash are real.
        s.mode = 'play';
        s.ball.x = 1.45 + 0.15;
        s.ball.y = 4.1 - 1.4;
        s.ball.vx = 0;
        s.ball.vy = 14;
        s.launchTime = s.time;
        let guard = 0;
        while (s.stats.bumperHits === 0 && guard++ < 2000) step(s, EMPTY_COMMAND);
        runSteps(s, 12, { ...EMPTY_COMMAND, left: true });
        if (name === 'paused') game.paused = true;
      } else if (name === 'game-over') {
        startGame(s);
        s.ballsLeft = 1;
        s.ballNumber = 3;
        s.score = 18450;
        s.mode = 'play';
        s.ballSaveUsed = true;
        s.ball.x = 0;
        s.ball.y = -9.5;
        s.ball.vy = -5;
        let guard = 0;
        while ((s.mode as string) !== 'over' && guard++ < 5000) step(s, EMPTY_COMMAND);
        if ((s.mode as string) !== 'over') throw new Error('game-over setup did not reach the over state');
      }
      const ack = finish(name);
      game.pausedForScreenshot = wasFrozen;
      return ack;
    },
    setPausedForScreenshot: (paused: boolean) => {
      game.pausedForScreenshot = paused;
      game.publishDiagnostics();
    },
    setReducedMotion: (enabled: boolean) => {
      game.reducedMotion = enabled;
      document.body.classList.toggle('reduced-motion', enabled);
      game.render(0, 0);
      game.publishDiagnostics();
    },
    hideDebugUi: () => {},
    setTimeScale: (n: number) => {
      game.timeScale = Math.max(0.1, n);
    },
    setRenderScale: (s: number) => {
      game.renderScale = Math.min(1, Math.max(0.2, s));
      game.resize();
    },
    /** Put the ball in play at (x, y) with velocity (vx, vy). */
    placeBall: (x: number, y: number, vx = 0, vy = 0) => {
      const s = game.state;
      if (s.mode === 'title' || s.mode === 'over') startGame(s);
      s.mode = 'play';
      s.ball.x = x;
      s.ball.y = y;
      s.ball.vx = vx;
      s.ball.vy = vy;
      game.publishDiagnostics();
    },
    /** Use up the ball save and set remaining balls (to reach game over quickly). */
    setBallsLeft: (n: number) => {
      const s = game.state;
      s.ballsLeft = n;
      s.ballNumber = 4 - n;
      s.ballSaveUsed = true;
      game.publishDiagnostics();
    },
    resetBall: () => {
      placeBallOnPlunger(game.state);
      game.state.mode = 'plunger';
    },
  };
}
