// Test-build-only hooks (vite --mode test). Never bundled in production: boot.ts
// imports this module behind `import.meta.env.MODE === 'test'`, which Vite
// replaces with a constant so the import is dropped from `npm run build`.
// States are real page states: setState scrolls the page to the chapter
// position that produces the progress, starts that scene's renderer, and
// snaps its clock so captures on either backend are deterministic.
import type { SceneName } from '../scenes';
import { loadEngine } from './boot';
import type { SceneController } from './engine';

interface StateSpec {
  scene: SceneName;
  progress: number;
  clock: number;
}

const STATES: Record<string, StateSpec> = {
  'hero-extraction': { scene: 'hero-extraction', progress: 0, clock: 13.2 },
  'hero-settled': { scene: 'hero-extraction', progress: 0, clock: 23.6 },
  'espresso-drops': { scene: 'espresso', progress: 0.08, clock: 2 },
  'espresso-pour': { scene: 'espresso', progress: 0.45, clock: 4.5 },
  'espresso-finish': { scene: 'espresso', progress: 1, clock: 6 },
  'milk-stretch': { scene: 'milk', progress: 0.4, clock: 5 },
  'milk-finish': { scene: 'milk', progress: 0.95, clock: 7 },
  'latte-dive': { scene: 'latte', progress: 0.2, clock: 3 },
  'latte-rosetta': { scene: 'latte', progress: 0.62, clock: 5 },
  'latte-finished': { scene: 'latte', progress: 1, clock: 8 },
};

let current: SceneController | null = null;
let seedValue = 42;

const frames = (n = 2) =>
  new Promise<void>((resolve) => {
    const tick = (left: number) => (left <= 0 ? resolve() : requestAnimationFrame(() => tick(left - 1)));
    tick(n);
  });

async function refreshDiagnostics(): Promise<void> {
  const engine = await loadEngine();
  const scenes: Record<string, unknown> = {};
  engine.allControllers().forEach((controller) => {
    scenes[controller.name] = controller.info();
  });
  window.__THREE_GAME_DIAGNOSTICS__ = {
    renderer: current ? current.info() : null,
    scene: current?.name ?? null,
    scenes,
    seed: seedValue,
    runtime: { ...engine.runtime },
  };
}

function scrollTopFor(spec: StateSpec): number {
  if (spec.scene === 'hero-extraction') return 0;
  const step = document.querySelector<HTMLElement>(`[data-scene-target="${spec.scene}"]`);
  if (!step) throw new Error(`no chapter for ${spec.scene}`);
  const rect = step.getBoundingClientRect();
  const top = rect.top + window.scrollY;
  const p = Math.min(spec.progress, 0.995);
  return Math.max(0, top + p * rect.height - window.innerHeight * 0.55);
}

export function installTestHooks(): void {
  loadEngine().then((engine) => ((window as unknown as Record<string, unknown>).__SCAVO_ENGINE__ = engine));
  window.__THREE_GAME_DIAGNOSTICS__ = { renderer: null, scene: null, scenes: {}, seed: seedValue };
  window.__THREE_GAME_TEST_HOOKS__ = {
    states: Object.keys(STATES),
    async seed(value: number) {
      // Scenes are fully procedural and hash-driven; the seed is recorded for reports.
      seedValue = value;
      await refreshDiagnostics();
      return { seed: value };
    },
    async setState(name: string) {
      const spec = STATES[name];
      if (!spec) throw new Error(`unknown state ${name}; known: ${Object.keys(STATES).join(', ')}`);
      const engine = await loadEngine();
      const mount = document.querySelector<HTMLElement>(`[data-scene="${spec.scene}"]`);
      if (!mount) throw new Error(`no mount for ${spec.scene}`);
      window.scrollTo({ top: scrollTopFor(spec), behavior: 'instant' });
      await frames(1);
      const controller = await engine.ensureScene(spec.scene, mount, 3);
      if (!controller) throw new Error(`${spec.scene} renderer failed to start`);
      current = controller;
      controller.snap(spec.progress, spec.clock);
      await refreshDiagnostics();
      return { state: name };
    },
    async setPausedForScreenshot(paused: boolean) {
      const engine = await loadEngine();
      engine.runtime.paused = paused;
      if (!paused) engine.allControllers().forEach((controller) => controller.wake());
      await refreshDiagnostics();
      return { paused };
    },
    async setReducedMotion(frozen: boolean) {
      // Capture-time freeze of ambient liquid motion. The page's real reduced
      // motion path (no renderer at all) is driven by the media query.
      const engine = await loadEngine();
      engine.runtime.frozen = frozen;
      await refreshDiagnostics();
      return { frozen };
    },
    async setTimeScale(scale: number) {
      const engine = await loadEngine();
      engine.runtime.timeScale = scale;
      return { timeScale: scale };
    },
    async setRenderScale(scale: number) {
      const engine = await loadEngine();
      engine.runtime.renderScale = scale;
      engine.allControllers().forEach((controller) => controller.remeasure());
      return { renderScale: scale };
    },
    async hideDebugUi() {
      return { hidden: true };
    },
    async readFrame(width: number, height: number) {
      if (!current) throw new Error('call setState before readFrame');
      const frame = await current.readFrame(width, height);
      await refreshDiagnostics();
      return frame;
    },
    /** Sequence review: snap one scene to an arbitrary progress and clock. */
    async snapScene(scene: SceneName, progress: number, clock: number) {
      const engine = await loadEngine();
      const mount = document.querySelector<HTMLElement>(`[data-scene="${scene}"]`);
      const controller = mount ? await engine.ensureScene(scene, mount, 3) : null;
      if (!controller) throw new Error(`${scene} unavailable`);
      current = controller;
      controller.snap(progress, clock);
      await refreshDiagnostics();
      return { scene, progress };
    },
    async diagnostics() {
      await refreshDiagnostics();
      return window.__THREE_GAME_DIAGNOSTICS__;
    },
  };
}
