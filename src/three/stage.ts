// A minimal three.js stage: renderer, camera on an orbit, and a render loop
// that only runs while the figure is on screen.
import { WebGLRenderer, PerspectiveCamera, Scene, Vector3, SRGBColorSpace } from 'three';

export interface StageOpts {
  className?: string; distance: number; azimuth: number; polar: number; target?: [number, number, number];
  fov?: number; hint?: string; minPolar?: number; maxPolar?: number;
  /** Extra distance multiplier for narrow canvases, given the aspect ratio. */
  fit?: (aspect: number) => number;
}

export class Stage {
  el: HTMLDivElement;
  scene = new Scene();
  camera: PerspectiveCamera;
  renderer: WebGLRenderer;
  azimuth: number; polar: number; distance: number;
  target = new Vector3();
  touched = false;
  onFrame: (dt: number, t: number) => void = () => {};
  onTap: (x: number, y: number) => void = () => {};
  private visible = false; private raf = 0; private last = 0; private time = 0;
  private reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(host: HTMLElement, private o: StageOpts) {
    this.el = document.createElement('div');
    this.el.className = `stage ${o.className ?? ''}`;
    host.append(this.el);
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.el.append(this.renderer.domElement);
    const hint = document.createElement('div');
    hint.className = 'stage-hint';
    hint.textContent = o.hint ?? 'drag to rotate';
    this.el.append(hint);
    this.camera = new PerspectiveCamera(o.fov ?? 35, 16 / 9, 0.1, 100);
    this.azimuth = o.azimuth; this.polar = o.polar; this.distance = o.distance;
    if (o.target) this.target.set(...o.target);

    new ResizeObserver(() => this.resize()).observe(this.el);
    this.resize();
    new IntersectionObserver((e) => {
      this.visible = e[e.length - 1].isIntersecting;
      if (this.visible) { this.last = 0; this.schedule(); }
    }, { rootMargin: '60px' }).observe(this.el);
    document.addEventListener('visibilitychange', () => { this.last = 0; this.schedule(); });
    this.renderer.domElement.addEventListener('webglcontextlost', (ev) => ev.preventDefault());
    this.renderer.domElement.addEventListener('webglcontextrestored', () => this.schedule());
    this.pointer(hint);
  }

  private pointer(hint: HTMLElement) {
    const c = this.renderer.domElement;
    let id = -1, px = 0, py = 0, moved = 0;
    c.addEventListener('pointerdown', (ev) => {
      id = ev.pointerId; px = ev.clientX; py = ev.clientY; moved = 0;
      try { c.setPointerCapture(id); } catch { /* ignore */ }
    });
    c.addEventListener('pointermove', (ev) => {
      if (ev.pointerId !== id) return;
      const dx = ev.clientX - px, dy = ev.clientY - py;
      px = ev.clientX; py = ev.clientY; moved += Math.abs(dx) + Math.abs(dy);
      this.azimuth -= dx * 0.008;
      // On touch screens vertical swipes scroll the page, so only the mouse tilts.
      if (ev.pointerType !== 'touch') {
        this.polar = Math.min(this.o.maxPolar ?? 1.5, Math.max(this.o.minPolar ?? 0.25, this.polar - dy * 0.006));
      }
      if (moved > 6) { this.touched = true; hint.style.opacity = '0'; }
    });
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      id = -1;
      if (moved < 6 && ev.type === 'pointerup') {
        const r = c.getBoundingClientRect();
        this.onTap(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      }
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    // Keyboard: arrow keys rotate.
    c.tabIndex = 0;
    c.setAttribute('role', 'img');
    c.addEventListener('keydown', (ev) => {
      const k = ev.key;
      if (k === 'ArrowLeft') this.azimuth -= 0.12; else if (k === 'ArrowRight') this.azimuth += 0.12;
      else if (k === 'ArrowUp') this.polar = Math.max(this.o.minPolar ?? 0.25, this.polar - 0.08);
      else if (k === 'ArrowDown') this.polar = Math.min(this.o.maxPolar ?? 1.5, this.polar + 0.08);
      else return;
      ev.preventDefault(); this.touched = true;
    });
  }

  label(text: string) { this.renderer.domElement.setAttribute('aria-label', text); }

  private resize() {
    const w = this.el.clientWidth, h = this.el.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.render();
  }

  private schedule() {
    if (!this.raf && this.visible && !document.hidden) this.raf = requestAnimationFrame((now) => this.frame(now));
  }

  private frame(now: number) {
    this.raf = 0;
    const dt = Math.min(0.05, this.last ? (now - this.last) / 1000 : 0.016);
    this.last = now; this.time += dt;
    if (!this.touched && !this.reduced) this.azimuth += dt * 0.12;
    this.onFrame(dt, this.time);
    this.render();
    this.schedule();
  }

  render() {
    const d = this.distance * (this.o.fit ? this.o.fit(this.camera.aspect) : 1);
    const sp = Math.sin(this.polar);
    this.camera.position.set(
      this.target.x + d * sp * Math.sin(this.azimuth),
      this.target.y + d * Math.cos(this.polar),
      this.target.z + d * sp * Math.cos(this.azimuth));
    this.camera.lookAt(this.target);
    this.renderer.render(this.scene, this.camera);
  }
}
