import * as THREE from 'three/webgpu';
import { gameTime } from '../core/GameTime';
import { createRenderer } from '../core/Renderer';
import { CursorCommand, LiquidSim, N, SIM_DT } from '../sim/LiquidSim';
import { bakeEnvironment, KEY_LIGHT_DIR } from '../render/environment';
import { bakeCremaPattern, createFieldTexture, createLiquidGeometry, createLiquidMaterial } from '../render/liquid';
import { createCup, createPorcelain, createSaucer, createTable, RIM_HEIGHT, SURFACE_Y } from '../render/tableware';
import { runStroke, type SceneState } from './strokes';

const TEST_BUILD = import.meta.env.MODE === 'test';
const MAX_STEPS_PER_FRAME = 40;

export class App {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
  readonly sim = new LiquidSim();
  private readonly fieldA = createFieldTexture();
  private readonly fieldB = createFieldTexture();
  private readonly packA = new Float32Array(N * N * 4);
  private readonly packB = new Float32Array(N * N * 4);
  private readonly raycaster = new THREE.Raycaster();
  private readonly surfacePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -SURFACE_Y);
  private readonly ndc = new THREE.Vector2();
  private readonly hit = new THREE.Vector3();
  /** @internal */ pattern: ReturnType<typeof bakeCremaPattern> | null = null;
  private liquidMaterial!: ReturnType<typeof createLiquidMaterial>;

  private frameId = 0;
  private lastTime = 0;
  private accumulator = 0;
  /** @internal */ dirty = true;
  private cremaRelaxing = false;
  private relaxTimer = 0;
  private introDropAt = 0.6;

  // Test-only controls (inert in production: nothing can set them).
  /** @internal */ paused = false;
  /** @internal */ timeScale = 1;
  /** @internal */ renderScale = 1;
  /** @internal */ reducedMotion = false;
  /** @internal */ seed = 7;
  frame = 0;
  /** @internal */ renders = 0;
  /** @internal */ lastCalls = 0;
  /** @internal */ lastTriangles = 0;
  /** @internal */ pointerKind = 'none';
  private hasInteracted = false;

  static async create(canvas: HTMLCanvasElement): Promise<App> {
    const renderer = await createRenderer(canvas);
    const app = new App(canvas, renderer);
    await renderer.compileAsync(app.scene, app.camera);
    return app;
  }

  private constructor(
    /** @internal */ readonly canvas: HTMLCanvasElement,
    readonly renderer: THREE.WebGPURenderer,
  ) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.buildScene();
    this.resize(true);
    this.bindInput();
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.setReducedMotion(mq.matches);
    mq.addEventListener('change', (e) => this.setReducedMotion(e.matches));
    window.addEventListener('resize', () => this.resize(false));
    if (TEST_BUILD) {
      // Test builds only: the hooks module is not in the production bundle.
      void import('./testHooks').then((m) => {
        m.installTestHooks(this);
        this.publishDiagnostics = () => m.publishDiagnostics(this);
      });
    }
  }

  private buildScene(): void {
    const scene = this.scene;
    scene.background = new THREE.Color('#050302');
    scene.environment = bakeEnvironment(this.renderer);
    scene.environmentIntensity = 0.9;

    const key = new THREE.DirectionalLight('#fff1de', 2.4);
    key.position.copy(KEY_LIGHT_DIR).multiplyScalar(8);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    const sc = key.shadow.camera;
    sc.left = -2.6;
    sc.right = 2.6;
    sc.top = 2.6;
    sc.bottom = -2.6;
    sc.near = 2;
    sc.far = 16;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 4;
    scene.add(key);
    scene.add(new THREE.HemisphereLight('#4a3b30', '#0b0705', 0.35));

    const porcelain = createPorcelain(1);
    const cup = createCup(porcelain);
    scene.add(cup);
    scene.add(createSaucer(porcelain));
    scene.add(createTable());

    this.pattern = bakeCremaPattern(this.renderer, this.seed);
    this.liquidMaterial = createLiquidMaterial({
      fieldA: this.fieldA.texture,
      fieldB: this.fieldB.texture,
      pattern: this.pattern.texture,
      surfaceY: SURFACE_Y,
      rimHeight: RIM_HEIGHT,
      keyDir: KEY_LIGHT_DIR,
    });
    const liquid = new THREE.Mesh(createLiquidGeometry(1.0), this.liquidMaterial.material);
    liquid.position.y = SURFACE_Y;
    liquid.frustumCulled = false;
    scene.add(liquid);
    this.uploadFields();
  }

  start(): void {
    this.lastTime = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, Math.max(0, (now - this.lastTime) / 1000));
      this.lastTime = now;
      this.update(dt);
      this.frameId = requestAnimationFrame(tick);
    };
    this.frameId = requestAnimationFrame(tick);
  }

  private update(dt: number): void {
    this.frame += 1;
    this.resize(false);
    if (!this.paused && !this.reducedMotion) {
      if (this.introDropAt > 0) {
        this.introDropAt -= dt;
        if (this.introDropAt <= 0 && !this.hasInteracted) this.sim.drop(0.06, -0.05, 0.018, 0.07);
        if (this.introDropAt <= 0) this.dirty = true;
      }
      this.accumulator += dt * this.timeScale;
      let n = Math.floor(this.accumulator / SIM_DT);
      this.accumulator -= n * SIM_DT;
      if (n > MAX_STEPS_PER_FRAME) n = MAX_STEPS_PER_FRAME;
      if (this.sim.idle) {
        this.accumulator = 0;
        // Only the crema's slow relaxation runs while the surface is at rest.
        if (this.cremaRelaxing) {
          this.relaxTimer += dt * this.timeScale;
          if (this.relaxTimer > 0.1) {
            this.cremaRelaxing = this.sim.relaxOnly(this.relaxTimer);
            this.relaxTimer = 0;
            this.uploadFields();
          }
        }
      } else if (n > 0) {
        this.sim.advance(n);
        this.cremaRelaxing = true;
        this.uploadFields();
      }
      gameTime.value = this.sim.time;
    }
    if (this.dirty) this.render();
    this.publishDiagnostics();
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
    this.renders += 1;
    this.dirty = false;
    this.lastCalls = this.renderer.info.render.drawCalls;
    this.lastTriangles = this.renderer.info.render.triangles;
  }

  private uploadFields(): void {
    this.sim.pack(this.packA, this.packB);
    const a = this.fieldA.data;
    const b = this.fieldB.data;
    const toHalf = THREE.DataUtils.toHalfFloat;
    for (let i = 0; i < a.length; i++) {
      a[i] = toHalf(this.packA[i]);
      b[i] = toHalf(this.packB[i]);
    }
    this.fieldA.texture.needsUpdate = true;
    this.fieldB.texture.needsUpdate = true;
    this.dirty = true;
  }

  // ---------- camera framing ----------
  resize(force: boolean): void {
    const w = Math.max(1, this.canvas.clientWidth);
    const h = Math.max(1, this.canvas.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * this.renderScale;
    const bw = Math.floor(w * dpr);
    const bh = Math.floor(h * dpr);
    if (!force && this.canvas.width === bw && this.canvas.height === bh) return;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    this.camera.aspect = aspect;
    // Fit the cup (with handle) to the viewport: by height on landscape, by
    // width on portrait phones. Three-quarter view from above.
    const tanV = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const distV = 1.5 / tanV;
    const distH = 1.5 / (tanV * aspect);
    const dist = Math.max(distV, distH);
    const elev = THREE.MathUtils.degToRad(aspect < 0.8 ? 56 : 46);
    const target = new THREE.Vector3(aspect < 0.8 ? 0.16 : 0.1, 0.58, 0.06);
    this.camera.position.set(target.x, target.y + Math.sin(elev) * dist, target.z + Math.cos(elev) * dist);
    this.camera.lookAt(target);
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  // ---------- input: mouse hover / pen / touch, all one cursor command ----------
  private bindInput(): void {
    const toCommand = (e: PointerEvent, active: boolean): CursorCommand => {
      const rect = this.canvas.getBoundingClientRect();
      this.ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      this.raycaster.setFromCamera(this.ndc, this.camera);
      const hit = this.raycaster.ray.intersectPlane(this.surfacePlane, this.hit);
      if (!hit) return { x: 0, y: 0, active: false };
      // Cup-space: x right, y toward the camera (world z).
      const over = Math.hypot(hit.x, hit.z) < 1.25;
      return { x: hit.x, y: hit.z, active: active && over };
    };
    const send = (cmd: CursorCommand) => {
      if (this.reducedMotion) return;
      if (cmd.active) {
        this.hasInteracted = true;
        document.body.classList.add('touched');
      }
      this.sim.command(cmd);
    };
    const c = this.canvas;
    c.addEventListener('pointermove', (e) => {
      this.pointerKind = e.pointerType;
      // Touch only displaces while in contact; mouse and pen on hover.
      const active = e.pointerType === 'touch' ? e.buttons !== 0 || e.pressure > 0 : true;
      send(toCommand(e, active));
    });
    c.addEventListener('pointerdown', (e) => {
      this.pointerKind = e.pointerType;
      send(toCommand(e, true));
    });
    const end = (e: PointerEvent) => {
      this.pointerKind = e.pointerType;
      if (e.pointerType === 'touch' || e.type !== 'pointerup') send({ ...toCommand(e, false), active: false });
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('pointerleave', end);
  }

  // ---------- reduced motion: one still, composed frame ----------
  private setReducedMotion(enabled: boolean): void {
    this.reducedMotion = enabled;
    document.body.classList.toggle('reduced-motion', enabled);
    if (enabled) {
      this.applyState('still');
    } else {
      this.dirty = true;
    }
  }

  applyState(name: SceneState): void {
    this.sim.reset();
    this.accumulator = 0;
    this.introDropAt = 0;
    runStroke(this.sim, name);
    this.cremaRelaxing = true;
    this.uploadFields();
    this.render();
  }

  publishDiagnostics: () => void = () => {};

  dispose(): void {
    cancelAnimationFrame(this.frameId);
    this.renderer.dispose();
  }
}
