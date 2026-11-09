import * as THREE from 'three';
import {
  createChoreography,
  evaluateAct,
  SEAT_H,
  STILL_TIME,
  WHEEL_R,
  type ActPose,
  type Choreography,
} from './motion';
import { Pelican } from './pelican';
import { createStage, type Stage } from './stage';
import { createPin, PEDAL_TOP, Unicycle } from './unicycle';

const SEED = 7;
const DRIFT = 0.085; // rad/s the camera drifts around the act
const ACT_CENTER_Y = 0.93;

export class App {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 80);
  readonly act = new THREE.Group();
  readonly lean = new THREE.Group();
  readonly uni = new Unicycle();
  readonly pelvisNode = new THREE.Object3D();
  readonly pelican = new Pelican();
  readonly pins: THREE.Mesh[] = [];
  readonly stage: Stage;
  choreo: Choreography = createChoreography(SEED);

  t = STILL_TIME;
  pose!: ActPose;
  paused = false;
  reducedMotion = false;
  timeScale = 1;
  renderScale = 1;
  frame = 0;

  // Camera orbit, relative to the act's heading.
  az = 1.0;
  el = 0.16;
  private azVel = 0;
  private dragging = false;
  private lastPointer = { x: 0, y: 0, id: -1 };
  private lastInput = -10;
  private dirty = true;
  private last = performance.now();
  private raf = 0;
  readonly actInv = new THREE.Matrix4();
  private readonly pelvisAct = new THREE.Matrix4();
  readonly pedalTops: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(), new THREE.Vector3()];
  private onFirstFrame?: () => void;

  constructor(
    readonly canvas: HTMLCanvasElement,
    opts: { reducedMotion: boolean; onFirstFrame?: () => void },
  ) {
    const compact = Math.min(window.innerWidth, window.innerHeight) < 600;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.reducedMotion = opts.reducedMotion;
    this.onFirstFrame = opts.onFirstFrame;

    this.scene.background = new THREE.Color('#120a0c');
    this.scene.fog = new THREE.Fog('#120a0c', 9, 30);
    this.stage = createStage(SEED, compact);
    this.scene.add(this.stage.group);

    this.scene.add(this.act);
    this.act.add(this.lean);
    this.lean.add(this.uni.frame);
    this.pelvisNode.position.set(0, SEAT_H - WHEEL_R, 0);
    this.uni.frame.add(this.pelvisNode);
    this.act.add(this.pelican.root);
    const pin = createPin();
    for (let i = 0; i < 3; i++) {
      const p = i === 0 ? pin : new THREE.Mesh(pin.geometry, pin.material);
      p.castShadow = true;
      this.pins.push(p);
      this.act.add(p);
    }
    this.stage.followSpot.target = this.pelican.body;

    this.bindInput();
    this.applyTime(this.t);
  }

  start() {
    const tick = (now: number) => {
      this.raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.step(dt);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop() {
    cancelAnimationFrame(this.raf);
  }

  setReducedMotion(on: boolean) {
    this.reducedMotion = on;
    if (on) {
      this.t = STILL_TIME;
      this.applyTime(this.t);
    }
    this.dirty = true;
  }

  step(dt: number) {
    const resized = this.resize();
    const animate = !this.paused && !this.reducedMotion;
    if (animate) {
      const sdt = dt * this.timeScale;
      this.t += sdt;
      // Slow auto-drift around the act, eased back in after the user lets go.
      if (!this.dragging) {
        const sinceInput = this.t - this.lastInput;
        const ease = THREE.MathUtils.smoothstep(sinceInput, 1.5, 4);
        this.az += (DRIFT * ease + this.azVel) * sdt;
        this.azVel *= Math.exp(-3 * sdt);
      }
      this.applyTime(this.t);
    }
    if (animate || resized || this.dirty) {
      this.placeCamera();
      this.renderer.render(this.scene, this.camera);
      this.dirty = false;
      this.frame++;
      if (this.onFirstFrame) {
        this.onFirstFrame();
        this.onFirstFrame = undefined;
      }
    }
  }

  /** Pose the whole scene graph for time t. */
  applyTime(t: number) {
    const pose = evaluateAct(this.choreo, t);
    this.pose = pose;
    this.act.position.set(pose.position.x, 0, pose.position.z);
    this.act.rotation.set(0, pose.heading + pose.steer, 0);
    this.lean.rotation.set(0, 0, -pose.roll);
    this.uni.frame.rotation.set(pose.pitch, 0, 0);
    // The wheel's world angle is distance / radius: subtract the frame's pitch.
    this.uni.wheel.rotation.x = pose.wheelAngle - pose.pitch;
    this.uni.pedals.forEach((p, i) => {
      p.rotation.x = pose.ankle[i] - pose.wheelAngle;
    });
    this.pelvisNode.position.set(0, SEAT_H - WHEEL_R + pose.bodyBob, 0);
    this.pelvisNode.rotation.set(pose.bodyPitch, pose.bodyYaw, pose.bodyRoll, 'YXZ');

    this.act.updateMatrixWorld(true);
    this.actInv.copy(this.act.matrixWorld).invert();
    this.pelvisAct.multiplyMatrices(this.actInv, this.pelvisNode.matrixWorld);
    this.uni.pedals.forEach((p, i) => {
      this.pedalTops[i].set(0, PEDAL_TOP, 0).applyMatrix4(p.matrixWorld).applyMatrix4(this.actInv);
    });
    this.pelican.update(pose, this.pelvisAct, this.pedalTops);

    pose.pins.forEach((pp, i) => {
      const m = this.pins[i];
      m.position.set(pp.com.x, pp.com.y, pp.com.z);
      m.rotation.set(pp.phi, 0, pp.roll, 'ZYX');
    });
    this.act.updateMatrixWorld(true);
  }

  placeCamera() {
    // Frame the act's centre: a little ahead of the axle, where the pins fly.
    const h0 = this.pose.heading;
    const target = new THREE.Vector3(
      this.act.position.x + Math.sin(h0) * 0.17,
      ACT_CENTER_Y,
      this.act.position.z + Math.cos(h0) * 0.17,
    );
    const vfov = THREE.MathUtils.degToRad(this.camera.fov);
    const tanV = Math.tan(vfov / 2);
    const tanH = tanV * this.camera.aspect;
    const dist = Math.max(0.88 / tanV, 0.68 / tanH) * 1.05 + 0.45;
    const heading = this.pose.heading;
    const breathe = this.reducedMotion ? 0 : 0.035 * Math.sin(this.t * 0.13);
    const el = THREE.MathUtils.clamp(this.el + breathe, 0.02, 0.85);
    const a = heading + this.az;
    this.camera.position.set(
      target.x + dist * Math.cos(el) * Math.sin(a),
      target.y + dist * Math.sin(el),
      target.z + dist * Math.cos(el) * Math.cos(a),
    );
    this.camera.lookAt(target);
    // Rim light always comes from behind the act relative to the viewer.
    this.stage.rim.position.set(target.x - Math.sin(a) * 5, 4, target.z - Math.cos(a) * 5);
    this.stage.rim.target.position.copy(target);
    this.stage.rim.target.updateMatrixWorld();
    const f = a + 0.7;
    this.stage.fill.position.set(target.x + Math.sin(f) * 5, 3.5, target.z + Math.cos(f) * 5);
    this.stage.fill.target.position.copy(target);
    this.stage.fill.target.updateMatrixWorld();
  }

  private resize(): boolean {
    const w = Math.max(1, this.canvas.clientWidth);
    const h = Math.max(1, this.canvas.clientHeight);
    let dpr = Math.min(window.devicePixelRatio || 1, 2) * this.renderScale;
    const maxPixels = 3.2e6;
    if (w * h * dpr * dpr > maxPixels) dpr = Math.sqrt(maxPixels / (w * h));
    const bw = Math.floor(w * dpr);
    const bh = Math.floor(h * dpr);
    if (this.canvas.width === bw && this.canvas.height === bh) return false;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 0.8 ? 44 : 38;
    this.camera.updateProjectionMatrix();
    return true;
  }

  private bindInput() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      if (this.lastPointer.id !== -1 && this.dragging) return;
      this.dragging = true;
      this.lastPointer = { x: e.clientX, y: e.clientY, id: e.pointerId };
      this.azVel = 0;
      try {
        c.setPointerCapture(e.pointerId);
      } catch {
        /* capture is a nicety */
      }
    });
    c.addEventListener('pointermove', (e) => {
      if (!this.dragging || e.pointerId !== this.lastPointer.id) return;
      const dx = e.clientX - this.lastPointer.x;
      const dy = e.clientY - this.lastPointer.y;
      this.lastPointer.x = e.clientX;
      this.lastPointer.y = e.clientY;
      const k = 5.5 / Math.max(320, Math.min(c.clientWidth, 1400));
      // Ignore single-event spikes (e.g. a pointer jump on capture).
      if (Math.abs(dx) > 300 || Math.abs(dy) > 300) return;
      this.az -= dx * k;
      this.el = THREE.MathUtils.clamp(this.el + dy * k * 0.7, 0.02, 0.85);
      this.azVel = THREE.MathUtils.lerp(this.azVel, (-dx * k) / 0.016, 0.3);
      this.lastInput = this.t;
      this.dirty = true;
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.lastPointer.id) return;
      this.dragging = false;
      this.lastPointer.id = -1;
      this.lastInput = this.t;
      this.azVel = THREE.MathUtils.clamp(this.azVel, -2, 2);
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
  }
}
