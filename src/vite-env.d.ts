/// <reference types="vite/client" />

/** True only in `vite build --mode test` / `vite --mode test`; strips hooks from production. */
declare const __TEST_HOOKS__: boolean;

interface ThreeGameDiagnostics {
  frame: number;
  elapsed: number;
  score: number;
  targetScore: number;
  complete: boolean;
  renderer: { calls: number; triangles: number; geometries: number; textures: number };
  canvas: { clientWidth: number; clientHeight: number; width: number; height: number; dpr: number };
  [key: string]: unknown;
}

interface ThreeGameTestHooks {
  seed(value: number): void;
  setState(name: string): { state: string };
  setPausedForScreenshot(paused: boolean): void;
  setReducedMotion(enabled: boolean): void;
  hideDebugUi(hidden: boolean): void;
  setTimeScale(n: number): void;
  setRenderScale(s: number): void;
  placeBall(x: number, y: number, vx: number, vy: number): void;
  resetBall(): void;
  clearHighScore(): void;
}

interface Window {
  __THREE_GAME_DIAGNOSTICS__?: ThreeGameDiagnostics;
  __THREE_GAME_TEST_HOOKS__?: ThreeGameTestHooks;
}
