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
    onRamp: number;
    airFromRamp: boolean;
    rampJumps: number;
    lastRampAir: number;
    lastRampHeight: number;
    surfaceY: number;
  };
  race: {
    started: boolean;
    nextGate: number;
    gates: number;
    laps: number;
    gatesPassed: number;
    clock: number;
    lastLap: number;
    bestLap: number;
    storedBest: number;
    message: string;
    steerHint: number;
    throttleHint: number;
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
  placeBeforeRamp(index: number, dist: number): { x: number; z: number; heading: number };
}

interface Window {
  __THREE_GAME_DIAGNOSTICS__?: ThreeGameDiagnostics;
  __THREE_GAME_TEST_HOOKS__?: ThreeGameTestHooks;
}
