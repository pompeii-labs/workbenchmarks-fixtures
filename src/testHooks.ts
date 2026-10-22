// Test-build only: imported behind `import.meta.env.MODE === 'test'` so the
// production bundle contains none of these hooks or globals.
import type { Game } from './game/Game';
import { createState, serveBall, startGame, type Command } from './sim/sim';
import { BALL_R, LANE_CX, PLUNGER_REST_Y, TABLE, XC } from './sim/table';

const STATES = ['title', 'active-play', 'launch', 'late-game', 'game-over'] as const;

export function installTestHooks(game: Game): void {
  let seed = 1;

  const publish = () => {
    const s = game.state;
    const info = game.view.renderer.info;
    const canvas = game.view.renderer.domElement;
    window.__THREE_GAME_DIAGNOSTICS__ = {
      frame: game.frame,
      elapsed: s.time,
      mode: s.mode,
      paused: game.paused,
      score: s.score,
      highScore: s.highScore,
      newHigh: s.newHigh,
      ball: s.ball,
      multiplier: s.multiplier,
      lanes: [...s.lanes],
      bumperHits: s.bumperHits,
      bumperCount: [...s.bumperCount],
      modeAge: s.time - s.modeAt,
      bumperFlash: [...s.bumperFlash],
      flipperAngle: [...s.flipperAngle],
      plungerCharge: s.plungerCharge,
      ballPos: { ...s.ballPos },
      ballVel: { ...s.ballVel },
      lastEvent: s.events.length ? s.events[s.events.length - 1].type : null,
      storedHigh: Number(localStorage.getItem('neon-pinball.high') ?? 0),
      hud: {
        score: document.querySelector('#score-value')?.textContent ?? '',
        ball: document.querySelector('#ball-value')?.textContent ?? '',
        high: document.querySelector('#high-value')?.textContent ?? '',
        titleVisible: !document.querySelector('#overlay-title')?.classList.contains('hidden'),
        overVisible: !document.querySelector('#overlay-over')?.classList.contains('hidden'),
        pauseVisible: !document.querySelector('#overlay-pause')?.classList.contains('hidden'),
        launchHintVisible: !document.querySelector('#launch-hint')?.classList.contains('hidden'),
        launchButtonVisible: !document.querySelector('#launch-btn')?.classList.contains('hidden'),
      },
      renderer: {
        calls: info.render.calls,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
      },
      canvas: {
        clientWidth: canvas.clientWidth,
        clientHeight: canvas.clientHeight,
        width: canvas.width,
        height: canvas.height,
        dpr: game.view.renderer.getPixelRatio(),
      },
    };
  };
  game.onFrame = publish;

  const fresh = () => {
    game.paused = false;
    game.commandOverride = null;
    game.state = createState(game.state.highScore, seed);
  };

  const finish = (name: string) => {
    game.settle();
    game.syncHud(true);
    game.view.update(game.state, 0, true);
    game.view.render();
    publish();
    return { state: name };
  };

  window.__THREE_GAME_TEST_HOOKS__ = {
    seed: (value: number) => {
      seed = value >>> 0;
      game.state.rng = seed;
    },
    setState: (name: string) => {
      if (!(STATES as readonly string[]).includes(name)) throw new Error(`Unknown test state: ${name}`);
      fresh();
      const s = game.state;
      if (name === 'title') return finish(name);
      startGame(s);
      if (name === 'active-play') {
        s.score = 2350;
        s.bumperHits = 9;
        s.lanes = [true, false, false];
        s.ballPos = { x: XC + 1.0, y: 7.4 };
        s.ballVel = { x: -4, y: 9 };
        s.flipperAngle = [0.4, -0.49];
      } else if (name === 'launch') {
        s.plungerCharge = 0.7;
        s.ballPos = { x: LANE_CX, y: PLUNGER_REST_Y - 0.75 * 0.7 + BALL_R };
        s.plungerArmed = true;
        s.prev = { left: false, right: false, plunger: true, start: false };
        game.commandOverride = { left: false, right: false, plunger: true, start: false };
      } else if (name === 'late-game') {
        s.ball = 3;
        serveBall(s);
        s.score = 48720;
        s.highScore = Math.max(s.highScore, 52000);
        s.multiplier = 3;
        s.lanes = [true, false, true];
        const b = TABLE.bumpers[0];
        s.ballPos = { x: b.x + 0.62 + BALL_R + 0.02, y: b.y - 0.1 };
        s.ballVel = { x: 9, y: -3 };
        s.bumperFlash = [0.22, 0.1, 0];
      } else if (name === 'game-over') {
        s.ball = 3;
        s.score = 61340;
        s.highScore = 52000;
        s.mode = 'drain';
        s.drainTimer = 0;
        // One real step resolves the drain timer into the game-over transition.
      }
      return finish(name);
    },
    setPausedForScreenshot: (paused: boolean) => {
      game.pausedForScreenshot = paused;
      publish();
    },
    setReducedMotion: (enabled: boolean) => {
      game.reducedMotion = enabled;
      publish();
    },
    hideDebugUi: () => {},
    setTimeScale: (n: number) => {
      game.timeScale = Math.max(0.1, Math.min(8, n));
    },
    setRenderScale: (scale: number) => {
      game.view.renderScale = Math.max(0.25, Math.min(1, scale));
      game.view.resize();
    },
    /** Put the ball at a sim position/velocity (removes luck from a check). */
    placeBall: (x: number, y: number, vx: number, vy: number) => {
      game.state.ballPos = { x, y };
      game.state.ballVel = { x: vx, y: vy };
      publish();
    },
    /** Serve the ball onto the plunger in a live game (for drain checks). */
    serveOnPlunger: () => {
      const s = game.state;
      s.ballPos = { x: LANE_CX, y: PLUNGER_REST_Y + BALL_R };
      s.ballVel = { x: 0, y: 0 };
      publish();
    },
    setCommand: (cmd: Command | null) => {
      game.commandOverride = cmd;
    },
    clearHighScore: () => {
      localStorage.removeItem('neon-pinball.high');
      game.state.highScore = 0;
      game.syncHud(true);
      publish();
    },
    tableInfo: () => ({
      flippers: TABLE.flippers.map((f) => ({ ...f })),
      bumpers: TABLE.bumpers.map((b) => ({ ...b })),
      rollovers: TABLE.rollovers.map((r) => ({ ...r })),
    }),
  };
  publish();
}
