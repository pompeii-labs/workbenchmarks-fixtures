/// <reference types="vite/client" />

interface ThreeGameDiagnostics {
  frame: number;
  renders: number;
  simTime: number;
  simSteps: number;
  idle: boolean;
  paused: boolean;
  reducedMotion: boolean;
  pointerKind: string;
  cursorSpeed: number;
  peakCursorSpeed: number;
  maxHeight: number;
  rmsHeight: number;
  kinetic: number;
  maxCrema: number;
  centerHeight: number;
  renderer: {
    backend: 'webgpu' | 'webgl2';
    calls: number;
    triangles: number;
    geometries: number;
    textures: number;
  };
  canvas: { clientWidth: number; clientHeight: number; width: number; height: number; dpr: number };
}

interface ThreeGameTestHooks {
  seed(value: number): void;
  setState(name: string): { state: string };
  setPausedForScreenshot(paused: boolean): void;
  setReducedMotion(enabled: boolean): void;
  hideDebugUi(hidden: boolean): void;
  setTimeScale(n: number): void;
  setRenderScale(s: number): void;
  readFrame(width?: number, height?: number): Promise<{ width: number; height: number; backend: 'webgpu' | 'webgl2'; rgba: string }>;
  projectToScreen(x: number, y: number): { x: number; y: number };
  probeHeight(x: number, y: number): number;
  drop(x: number, y: number, amplitude?: number): void;
}

interface Window {
  __THREE_GAME_DIAGNOSTICS__?: ThreeGameDiagnostics;
  __THREE_GAME_TEST_HOOKS__?: ThreeGameTestHooks;
}
