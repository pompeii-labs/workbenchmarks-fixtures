import type { Game } from './game';
import { forceLaunch, RUN_SECONDS, stepSim } from './sim/sim';

// Test-build only (see vite.config.ts). Never imported by the production bundle.
export function installTestHooks(game: Game): void {
  const publish = () => {
    const s = game.sim;
    const d = s.dolphin;
    const info = game.renderer.info;
    const c = game.renderer.domElement;
    window.__THREE_GAME_DIAGNOSTICS__ = {
      frame: game.frame,
      phase: document.body.dataset.phase ?? s.phase,
      paused: game.paused,
      time: s.time,
      runTime: s.runTime,
      score: s.score,
      chain: s.chain,
      jumps: s.jumps,
      cleanLandings: s.cleanLandings,
      lastLanding: s.lastLanding,
      dolphin: {
        x: d.x, y: d.y, z: d.z, yaw: d.yaw, pitch: d.pitch, speed: d.speed, airborne: d.airborne,
        flip: d.air?.flip ?? 0, spin: d.air?.spin ?? 0, roll: d.air?.roll ?? 0, peak: d.air?.peak ?? 0,
      },
      renderer: { calls: info.render.calls, triangles: info.render.triangles, geometries: info.memory.geometries, textures: info.memory.textures },
      canvas: { clientWidth: c.clientWidth, clientHeight: c.clientHeight, width: c.width, height: c.height, dpr: game.renderer.getPixelRatio() },
    };
  };
  game.onFrame = publish;

  const settle = () => {
    game.world.update(game.sim, 0, true, true);
    game.renderer.render(game.world.scene, game.world.camera);
    publish();
  };

  window.__THREE_GAME_TEST_HOOKS__ = {
    seed: (value: number) => {
      game.reseed(value);
      settle();
    },
    setState: (name: string) => {
      game.paused = false;
      if (name === 'title') {
        game.reseed(game.sim.seed);
        game.showPhase();
      } else if (name === 'active-play') {
        game.start();
        for (let i = 0; i < 90; i++) game.stepOnce();
      } else if (name === 'airborne-trick') {
        game.start();
        for (let i = 0; i < 60; i++) game.stepOnce();
        game.sim.score = 4320;
        game.sim.chain = 1.5;
        forceLaunch(game.sim, 21, 0.72);
        // Real air physics with a held backflip input.
        for (let i = 0; i < 34; i++) stepSim(game.sim, { steer: 0, pitch: 1, roll: 0 });
      } else if (name === 'paused') {
        game.start();
        for (let i = 0; i < 90; i++) game.stepOnce();
        game.togglePause();
      } else if (name === 'results') {
        game.start();
        const s = game.sim;
        // Play out the clock on the real simulation, then credit a scripted tally.
        s.runTime = RUN_SECONDS - 0.5;
        s.score = 18640;
        s.jumps = 14;
        s.cleanLandings = 12;
        s.bestJump = 5280;
        s.bestTrick = 'Double Backflip + Barrel Roll';
        for (let i = 0; i < 120 && s.phase === 'play'; i++) game.stepOnce();
      } else {
        throw new Error(`Unknown test state: ${name}`);
      }
      settle();
      game.refreshHud();
      return { state: name };
    },
    setPausedForScreenshot: (paused: boolean) => {
      game.frozen = paused;
      publish();
    },
    setReducedMotion: () => {
      publish();
    },
    hideDebugUi: () => {},
    setRunTime: (t: number) => {
      game.sim.runTime = t;
      publish();
    },
    setTimeScale: (n: number) => {
      game.timeScale = n;
    },
    setRenderScale: (s: number) => {
      game.renderScale = s;
      game.resize();
    },
  };
  publish();
}
