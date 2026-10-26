// Test-build-only hooks and diagnostics. Imported dynamically behind
// import.meta.env.MODE === 'test', so a production bundle contains none of it.
import * as THREE from 'three/webgpu';
import { readFrame, rendererBackend } from '../core/Renderer';
import { SURFACE_Y } from '../render/tableware';
import type { App } from './App';
import { sceneStates, type SceneState } from './strokes';

export function installTestHooks(app: App): void {
  window.__THREE_GAME_TEST_HOOKS__ = {
    seed: (value: number) => {
      app.seed = value;
      app.pattern?.rebake(value);
      app.dirty = true;
    },
    setState: (name: string) => {
      if (!(sceneStates as readonly string[]).includes(name)) throw new Error(`Unknown state: ${name}`);
      app.applyState(name as SceneState);
      publishDiagnostics(app);
      return { state: name };
    },
    setPausedForScreenshot: (paused: boolean) => {
      app.paused = paused;
    },
    setReducedMotion: (enabled: boolean) => {
      // Capture stabilisation: freeze the surface as it is. (The media query
      // path additionally composes the 'still' frame.)
      app.reducedMotion = enabled;
      publishDiagnostics(app);
    },
    hideDebugUi: () => {
      // This page has no debug UI to hide.
    },
    setTimeScale: (n: number) => {
      app.timeScale = Math.max(0, n);
    },
    setRenderScale: (s: number) => {
      app.renderScale = Math.min(1, Math.max(0.25, s));
      app.resize(true);
    },
    readFrame: (width = 160, height = 90) => readFrame(app.renderer, app.scene, app.camera, width, height),
    projectToScreen: (x: number, y: number) => {
      const v = new THREE.Vector3(x, SURFACE_Y, y).project(app.camera);
      const rect = app.canvas.getBoundingClientRect();
      return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
    },
    probeHeight: (x: number, y: number) => app.sim.sampleHeight(x, y),
    drop: (x: number, y: number, amplitude = 0.02) => {
      app.sim.drop(x, y, amplitude, 0.07);
    },
  };
}

export function publishDiagnostics(app: App): void {
  const info = app.renderer.info;
  const s = app.sim.stats();
  window.__THREE_GAME_DIAGNOSTICS__ = {
    frame: app.frame,
    renders: app.renders,
    simTime: app.sim.time,
    simSteps: app.sim.steps,
    idle: app.sim.idle,
    paused: app.paused,
    reducedMotion: app.reducedMotion,
    pointerKind: app.pointerKind,
    cursorSpeed: app.sim.cursorSpeed,
    peakCursorSpeed: app.sim.peakCursorSpeed,
    maxHeight: s.maxHeight,
    rmsHeight: s.rmsHeight,
    kinetic: s.kinetic,
    maxCrema: s.maxCrema,
    centerHeight: app.sim.sampleHeight(0, 0),
    renderer: {
      backend: rendererBackend(app.renderer),
      calls: app.lastCalls,
      triangles: app.lastTriangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
    },
    canvas: {
      clientWidth: app.canvas.clientWidth,
      clientHeight: app.canvas.clientHeight,
      width: app.canvas.width,
      height: app.canvas.height,
      dpr: Math.min(window.devicePixelRatio || 1, 2) * app.renderScale,
    },
  };
}

