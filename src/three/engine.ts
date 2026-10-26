// Shared runtime for the four craft scenes. One SceneController per mount, each
// with its own WebGPURenderer (WebGPU first, WebGL2 fallback), camera, progress
// and still fallback. Frames are drawn on demand: while progress is easing,
// while the hero's extraction loop plays, or for a short ambient window after
// the last scroll update, and never while offscreen, idle, or the tab is hidden.
import * as THREE from 'three/webgpu';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { SceneName, SceneProgressDetail } from '../scenes';
import type { CraftScene } from './types';

export type RendererBackend = 'webgpu' | 'webgl2';

const AMBIENT_WINDOW = 18; // seconds of live liquid motion after the last progress change
const MAX_DT = 1 / 20;

const factories: Record<SceneName, () => Promise<{ create: () => CraftScene }>> = {
  'hero-extraction': () => import('./scenes/hero'),
  espresso: () => import('./scenes/espresso'),
  milk: () => import('./scenes/milk'),
  latte: () => import('./scenes/latte'),
};

const controllers = new Map<SceneName, SceneController>();
const pending = new Map<SceneName, Promise<SceneController | null>>();

export const runtime = {
  paused: false, // test hook: freeze the scene clock, keep rendering
  frozen: false, // test hook: no ambient motion (capture determinism)
  timeScale: 1,
  renderScale: 1,
};

function backendOf(renderer: THREE.WebGPURenderer): RendererBackend {
  return (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'webgpu' : 'webgl2';
}

function maxPixelRatio(): number {
  const phone = window.matchMedia('(max-width: 1023px), (pointer: coarse)').matches;
  return Math.min(window.devicePixelRatio || 1, phone ? 1.5 : 2);
}

export class SceneController {
  readonly name: SceneName;
  readonly mount: HTMLElement;
  renderer!: THREE.WebGPURenderer;
  scene!: CraftScene;
  canvas!: HTMLCanvasElement;
  backend: RendererBackend = 'webgl2';

  target = 0;
  progress = 0;
  active = false;
  clock = 0;
  lastChange = 0; // clock seconds at the last progress change
  frames = 0;
  private raf: number | null = null;
  private lastStamp = 0;
  private disposed = false;
  private resizeObserver?: ResizeObserver;
  private width = 1;
  private height = 1;
  private readonly onSceneEvent = (event: Event) => this.handleSceneEvent(event as CustomEvent<SceneProgressDetail>);
  private readonly onVisibility = () => this.wake();

  constructor(name: SceneName, mount: HTMLElement) {
    this.name = name;
    this.mount = mount;
  }

  async start(): Promise<void> {
    const module = await factories[this.name]();
    if (this.disposed) return;

    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.pointerEvents = 'none';
    canvas.className = 'scene-canvas';
    this.canvas = canvas;

    const forceWebGL = new URLSearchParams(window.location.search).get('backend') === 'webgl';
    const renderer = new THREE.WebGPURenderer({ canvas, antialias: true, alpha: false, forceWebGL, powerPreference: 'high-performance' });
    await renderer.init();
    if (this.disposed) {
      renderer.dispose();
      return;
    }
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // No tone mapping: WebGPURenderer applies it to the whole frame in its
    // output pass, which would shift the flat brand backdrops. Lights are
    // balanced to stay in range instead.
    renderer.toneMapping = THREE.NoToneMapping;
    this.renderer = renderer;
    this.backend = backendOf(renderer);
    renderer.onDeviceLost = () => this.fail();
    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      this.fail();
    });

    this.scene = module.create();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const environment = pmrem.fromScene(new RoomEnvironment(), 0.035).texture;
    this.scene.scene.environment = environment;
    this.scene.scene.environmentIntensity = this.scene.environmentIntensity ?? 0.8;
    pmrem.dispose();

    // Initial state from the mount: renderers may start after the first page update.
    this.target = Number(this.mount.dataset.progress ?? 0) || 0;
    this.progress = this.target;
    this.active = this.mount.dataset.sceneState === 'active';

    // Size from the mount, draw while detached, and attach only once the GPU
    // has finished the first frame (programs linked), so the still never
    // gives way to a stalled or half-built canvas.
    this.measure();
    this.scene.update(this.progress, this.clock, 0);
    await renderer.compileAsync(this.scene.scene, this.scene.camera);
    if (this.disposed) return;
    this.draw();
    await this.gpuSync();
    if (this.disposed) return;
    this.mount.insertBefore(canvas, this.mount.firstChild?.nextSibling ?? null);
    this.draw();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    if (this.disposed) return;
    this.mount.classList.add('has-scene-renderer');

    this.resizeObserver = new ResizeObserver(() => {
      if (this.measure()) this.draw();
    });
    this.resizeObserver.observe(this.mount);
    this.mount.addEventListener('scavo:scene', this.onSceneEvent);
    document.addEventListener('visibilitychange', this.onVisibility);
    document.dispatchEvent(new CustomEvent('scavo:scene-ready', { detail: { scene: this.name } }));
    this.lastChange = this.clock;
    this.wake();
  }

  /** Wait until submitted GPU work (including first-use program builds) is done. */
  private async gpuSync(): Promise<void> {
    const backend = this.renderer.backend as unknown as { device?: { queue: { onSubmittedWorkDone(): Promise<void> } }; gl?: WebGL2RenderingContext };
    if (backend.device) {
      await backend.device.queue.onSubmittedWorkDone();
    } else if (backend.gl) {
      const gl = backend.gl;
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    }
  }

  remeasure(): void {
    if (!this.disposed && this.renderer && this.measure()) this.draw();
  }

  private measure(): boolean {
    const rect = this.mount.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return false;
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const dpr = maxPixelRatio() * runtime.renderScale;
    const changed = width !== this.width || height !== this.height || this.renderer.getPixelRatio() !== dpr;
    if (!changed) return false;
    this.width = width;
    this.height = height;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
    this.scene.resize(width / height);
    return true;
  }

  private handleSceneEvent(event: CustomEvent<SceneProgressDetail>): void {
    const detail = event.detail;
    if (detail.scene !== this.name) return;
    if (detail.reducedMotion) {
      disposeAll();
      return;
    }
    if (Math.abs(detail.progress - this.target) > 1e-4) this.lastChange = this.clock;
    this.target = detail.progress;
    if (detail.active && !this.active) this.lastChange = this.clock;
    this.active = detail.active;
    this.wake();
  }

  /** Whether another frame is needed. */
  private wantsFrame(): boolean {
    if (this.disposed || document.hidden || !this.active || runtime.paused) return false;
    // Direct check as well as the scroll event: never draw an offscreen mount.
    const rect = this.mount.getBoundingClientRect();
    if (rect.bottom <= 0 || rect.top >= window.innerHeight) return false;
    if (Math.abs(this.target - this.progress) > 2e-4) return true;
    if (runtime.frozen) return false;
    if (this.scene.autoplay) return true;
    return this.scene.isLive(this.progress) && this.clock - this.lastChange < AMBIENT_WINDOW;
  }

  wake(): void {
    if (this.raf !== null || !this.wantsFrame()) return;
    this.lastStamp = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  private readonly tick = (stamp: number) => {
    this.raf = null;
    if (!this.wantsFrame()) return;
    const dt = Math.min(MAX_DT, Math.max(0, (stamp - this.lastStamp) / 1000));
    this.lastStamp = stamp;
    this.step(dt);
    this.draw();
    this.raf = requestAnimationFrame(this.tick);
  };

  step(dt: number): void {
    const scaled = runtime.paused ? 0 : dt * runtime.timeScale;
    if (!runtime.frozen) this.clock += scaled;
    // Exponential ease toward the scroll target: smooth, never overshoots.
    // A screenshot pause freezes state transitions, including this ease.
    const k = runtime.paused ? 0 : 1 - Math.exp(-dt * 7);
    this.progress += (this.target - this.progress) * k;
    if (Math.abs(this.target - this.progress) < 2e-4) this.progress = this.target;
    this.scene.update(this.progress, this.clock, runtime.frozen ? 0 : scaled);
  }

  draw(): void {
    if (this.disposed) return;
    try {
      this.renderer.render(this.scene.scene, this.scene.camera);
      this.frames += 1;
    } catch {
      this.fail();
    }
  }

  /** Snap to a progress and clock for deterministic captures. */
  snap(progress: number, clock: number): void {
    this.target = progress;
    this.progress = progress;
    this.clock = clock;
    this.lastChange = clock;
    this.scene.update(progress, clock, 0);
    this.draw();
  }

  async readFrame(width: number, height: number): Promise<{ width: number; height: number; backend: RendererBackend; rgba: string }> {
    const target = new THREE.RenderTarget(width, height);
    const previous = this.renderer.getRenderTarget();
    const aspect = this.width / this.height;
    try {
      this.scene.resize(width / height);
      this.renderer.setRenderTarget(target);
      this.renderer.render(this.scene.scene, this.scene.camera);
      const raw = (await this.renderer.readRenderTargetPixelsAsync(target, 0, 0, width, height)) as Uint8Array;
      const pixels = this.backend === 'webgpu' ? raw : new Uint8Array(raw.length);
      if (this.backend !== 'webgpu') {
        const row = width * 4;
        for (let y = 0; y < height; y += 1) pixels.set(raw.subarray(y * row, (y + 1) * row), (height - 1 - y) * row);
      }
      let binary = '';
      for (let i = 0; i < pixels.length; i += 0x8000) binary += String.fromCharCode(...pixels.subarray(i, i + 0x8000));
      return { width, height, backend: this.backend, rgba: btoa(binary) };
    } finally {
      this.renderer.setRenderTarget(previous);
      target.dispose();
      this.scene.resize(aspect);
    }
  }

  info() {
    if (!this.renderer) return { starting: true };
    const render = this.renderer.info.render;
    return {
      backend: this.backend,
      calls: render.drawCalls,
      drawCalls: render.drawCalls,
      triangles: render.triangles,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
      frames: this.frames,
      progress: Number(this.progress.toFixed(3)),
    };
  }

  /** Renderer failure or context loss: the still returns, the page stays readable. */
  fail(): void {
    this.dispose();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
    this.mount.classList.remove('has-scene-renderer');
    this.resizeObserver?.disconnect();
    this.mount.removeEventListener('scavo:scene', this.onSceneEvent);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.canvas?.remove();
    try {
      this.scene?.dispose?.();
      this.renderer?.dispose();
    } catch {
      // Already lost.
    }
    controllers.delete(this.name);
  }
}

interface StartRequest {
  name: SceneName;
  controller: SceneController;
  priority: number;
  resolve: (controller: SceneController | null) => void;
}

// Renderers start one at a time, highest priority first (a scene in view
// beats a preload), so one scene's shader compilation never stalls another's.
const waiting: StartRequest[] = [];
let starting = false;

let lastStartEnded = 0;
let pumpTimer: number | null = null;
const PRELOAD_GAP = 6000; // ms of quiet after a start before a mere preload compiles

function pump(): void {
  if (starting || waiting.length === 0) return;
  waiting.sort((a, b) => b.priority - a.priority);
  if (waiting[0].priority === 0) {
    const wait = lastStartEnded + PRELOAD_GAP - performance.now();
    if (wait > 0) {
      if (pumpTimer === null) {
        pumpTimer = window.setTimeout(() => {
          pumpTimer = null;
          pump();
        }, wait);
      }
      return;
    }
  }
  const request = waiting.shift()!;
  if (controllers.get(request.name) !== request.controller) {
    request.resolve(null);
    pump();
    return;
  }
  starting = true;
  request.controller
    .start()
    .then(() => (controllers.get(request.name) === request.controller ? request.controller : null))
    .catch((error: unknown) => {
      if (import.meta.env.DEV) console.warn(`[scavo] ${request.name} renderer unavailable`, error);
      request.controller.fail();
      return null;
    })
    .then((result) => {
      starting = false;
      lastStartEnded = performance.now();
      pending.delete(request.name);
      request.resolve(result);
      pump();
    });
}

/** Start (or find) the renderer for a mount. priority: 0 preload, 1 in view, 2 hero, 3 explicit. */
export function ensureScene(name: SceneName, mount: HTMLElement, priority = 1): Promise<SceneController | null> {
  const inflight = pending.get(name);
  if (inflight) {
    const queued = waiting.find((request) => request.name === name);
    if (queued) queued.priority = Math.max(queued.priority, priority);
    return inflight;
  }
  const existing = controllers.get(name);
  if (existing) return Promise.resolve(existing);
  const controller = new SceneController(name, mount);
  controllers.set(name, controller);
  const promise = new Promise<SceneController | null>((resolve) => {
    waiting.push({ name, controller, priority, resolve });
  });
  pending.set(name, promise);
  queueMicrotask(pump);
  return promise;
}

export function getController(name: SceneName): SceneController | undefined {
  return controllers.get(name);
}

export function allControllers(): SceneController[] {
  return Array.from(controllers.values());
}

export function disposeAll(): void {
  Array.from(controllers.values()).forEach((controller) => controller.dispose());
}
