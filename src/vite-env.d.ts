/// <reference types="vite/client" />

/** True only in `npm run build:test` (vite --mode test). Dead-code-eliminated otherwise. */
declare const __TEST_HOOKS__: boolean;

interface ThreeGameDiagnostics {
  frame: number;
  ui: string;
  sim: {
    t: number;
    step: number;
    mode: string;
    x: number;
    y: number;
    z: number;
    speed: number;
    heading: number;
    airborne: boolean;
    airTime: number;
    heightAboveWater: number;
    score: number;
    combo: number;
    jumps: number;
    wipeouts: number;
    ringsHit: number;
    boost: number;
    boosting: boolean;
    bestAir: number;
    rings: number;
  };
  renderer: { calls: number; triangles: number; geometries: number; textures: number };
  canvas: { clientWidth: number; clientHeight: number; width: number; height: number; dpr: number };
}

interface ThreeGameTestHooks {
  seed(value: number): void;
  setState(name: string): { state: string };
  setPausedForScreenshot(paused: boolean): void;
  setReducedMotion(enabled: boolean): void;
  hideDebugUi(hidden: boolean): void;
  setTimeScale(n: number): void;
  setRenderScale(scale: number): void;
  placeRingAhead(dist: number, air: boolean): number;
}

interface Window {
  __THREE_GAME_DIAGNOSTICS__?: ThreeGameDiagnostics;
  __THREE_GAME_TEST_HOOKS__?: ThreeGameTestHooks;
}
