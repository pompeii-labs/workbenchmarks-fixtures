import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { plungerY, type SimState } from '../sim/sim';
import {
  ARC_CY,
  ARC_R,
  BALL_R,
  FLIPPER_LEN,
  FLIPPER_R0,
  FLIPPER_R1,
  LANE_CX,
  LANE_X0,
  LANE_X1,
  TABLE,
  XC,
  type Segment,
} from '../sim/table';

const TILT = 0.12; // visual tilt of the table (radians)
const FIELD_Y0 = -1.2;
const FIELD_Y1 = 20.6;
const BUMPER_COLORS = ['#ff2bd6', '#22e4ff', '#ffb020'];

/** Sim (x, y) to table-local world position. */
function w(x: number, y: number, h = 0): THREE.Vector3 {
  return new THREE.Vector3(x, h, -y);
}

export class View {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(40, 1, 0.1, 120);
  private readonly table = new THREE.Group();
  private readonly ball: THREE.Mesh;
  private readonly ballShadowFake: THREE.Mesh;
  private readonly flippers: THREE.Group[] = [];
  private readonly bumperParts: {
    group: THREE.Group;
    cap: THREE.MeshStandardMaterial;
    body: THREE.MeshStandardMaterial;
    skirt: THREE.Mesh;
    glow: THREE.Mesh;
  }[] = [];
  private readonly laneLights: THREE.MeshBasicMaterial[] = [];
  private readonly multLights: THREE.MeshBasicMaterial[] = [];
  private readonly chargeLights: THREE.MeshBasicMaterial[] = [];
  private readonly plunger = new THREE.Group();
  private readonly spring: THREE.Mesh;
  private readonly springBaseLen: number;
  private readonly glowTexture: THREE.Texture;
  private readonly lookTarget = new THREE.Vector3();
  private readonly baseCamPos = new THREE.Vector3();
  private shake = 0;
  private flashLanes = 0;
  renderScale = 1;
  private lastSize = '';

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene.background = new THREE.Color('#06050d');
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    pmrem.dispose();

    this.glowTexture = makeGlowTexture();
    this.table.rotation.x = TILT;
    this.scene.add(this.table);

    this.addLights();
    this.buildCabinet();
    this.buildPlayfield();
    this.buildWalls();
    this.buildBumpers();
    this.buildInserts();
    this.buildFlippers();

    const ballMat = new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 0.9, roughness: 0.12, envMapIntensity: 2.6, emissive: '#3a3f55' });
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 32, 20), ballMat);
    this.ball.castShadow = true;
    this.table.add(this.ball);

    this.ballShadowFake = new THREE.Mesh(
      new THREE.CircleGeometry(BALL_R * 1.25, 24),
      new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.35, depthWrite: false }),
    );
    this.ballShadowFake.rotation.x = -Math.PI / 2;
    this.table.add(this.ballShadowFake);

    // Plunger: knob + rod + spring in the shooter lane.
    const chrome = new THREE.MeshStandardMaterial({ color: '#d9dde8', metalness: 1, roughness: 0.2 });
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.26, 20), new THREE.MeshStandardMaterial({ color: '#ff2bd6', emissive: '#55003f', roughness: 0.35 }));
    knob.rotation.x = Math.PI / 2;
    knob.position.set(0, 0.26, 0.13);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 10), chrome);
    rod.rotation.x = Math.PI / 2;
    rod.position.set(0, 0.26, 1.2);
    this.plunger.add(knob, rod);
    knob.castShadow = true;
    this.table.add(this.plunger);
    const helix = new THREE.CatmullRomCurve3(
      Array.from({ length: 121 }, (_, i) => {
        const t = i / 120;
        const a = t * Math.PI * 2 * 9;
        return new THREE.Vector3(Math.cos(a) * 0.17, 0.26 + Math.sin(a) * 0.17, -t);
      }),
    );
    this.springBaseLen = 1;
    this.spring = new THREE.Mesh(new THREE.TubeGeometry(helix, 240, 0.025, 6), chrome);
    this.spring.position.copy(w(LANE_CX, -0.9));
    this.table.add(this.spring);
  }

  private addLights(): void {
    this.scene.add(new THREE.HemisphereLight('#b7c4ff', '#1a0f24', 0.9));
    const key = new THREE.DirectionalLight('#fff2df', 2.4);
    key.position.set(-4, 18, 6);
    key.target.position.set(XC, 0, -9);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 2048);
    const sc = key.shadow.camera;
    sc.left = -8;
    sc.right = 8;
    sc.top = 13;
    sc.bottom = -13;
    sc.near = 1;
    sc.far = 45;
    key.shadow.bias = -0.0008;
    key.shadow.normalBias = 0.02;
    this.scene.add(key, key.target);
    const rim = new THREE.DirectionalLight('#8a5cff', 0.8);
    rim.position.set(6, 6, -24);
    this.scene.add(rim);
  }

  private buildCabinet(): void {
    const wood = new THREE.MeshStandardMaterial({ color: '#1b1226', roughness: 0.55, metalness: 0.2 });
    const trim = new THREE.MeshStandardMaterial({ color: '#c9cfdc', roughness: 0.22, metalness: 1 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(12, 1.6, 24), wood);
    body.position.set(0, -0.82, -(FIELD_Y0 + FIELD_Y1) / 2);
    body.receiveShadow = true;
    this.table.add(body);
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.9, 24), wood);
      rail.position.set(side * 5.55, 0.3, -(FIELD_Y0 + FIELD_Y1) / 2);
      rail.castShadow = true;
      rail.receiveShadow = true;
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 24), trim);
      strip.position.set(side * 5.55, 0.78, -(FIELD_Y0 + FIELD_Y1) / 2);
      this.table.add(rail, strip);
    }
    const back = new THREE.Mesh(new THREE.BoxGeometry(11.85, 0.9, 0.75), wood);
    back.position.set(0, 0.3, -(FIELD_Y1 + 0.3));
    this.table.add(back);
    // Apron covers the drain.
    const apron = new THREE.Mesh(new THREE.BoxGeometry(10, 0.5, 1.4), new THREE.MeshStandardMaterial({ color: '#140c22', roughness: 0.4, metalness: 0.3 }));
    apron.position.set(0, 0.2, 1.75);
    apron.receiveShadow = true;
    const apronEdge = new THREE.Mesh(new THREE.BoxGeometry(10, 0.05, 0.06), new THREE.MeshBasicMaterial({ color: '#22e4ff' }));
    apronEdge.position.set(0, 0.46, 1.06);
    this.table.add(apron, apronEdge);
  }

  private buildPlayfield(): void {
    const tex = makePlayfieldTexture();
    tex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    const field = new THREE.Mesh(
      new THREE.PlaneGeometry(10, FIELD_Y1 - FIELD_Y0),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0.05, envMapIntensity: 0.22 }),
    );
    field.rotation.x = -Math.PI / 2;
    field.position.set(0, 0, -(FIELD_Y0 + FIELD_Y1) / 2);
    field.receiveShadow = true;
    this.table.add(field);
  }

  private buildWalls(): void {
    const metal: THREE.BufferGeometry[] = [];
    const neonCyan: THREE.BufferGeometry[] = [];
    const neonPink: THREE.BufferGeometry[] = [];
    const rubber: THREE.BufferGeometry[] = [];
    const add = (s: Segment, height: number, thick: number, list: THREE.BufferGeometry[], h0 = 0) => {
      const a = w(s.ax, s.ay);
      const b = w(s.bx, s.by);
      const len = a.distanceTo(b);
      const g = new THREE.BoxGeometry(len + thick * 0.6, height, thick);
      g.rotateY(-Math.atan2(b.z - a.z, b.x - a.x));
      g.translate((a.x + b.x) / 2, h0 + height / 2, (a.z + b.z) / 2);
      list.push(g);
    };
    for (const s of TABLE.segments) {
      if (s.kind === 'wall') {
        // Offset outer walls outward by half their thickness so the inner face matches the sim.
        const midX = (s.ax + s.bx) / 2;
        const midY = (s.ay + s.by) / 2;
        let ox = 0;
        let oy = 0;
        if (midY > ARC_CY + 0.01) {
          const d = Math.hypot(midX, midY - ARC_CY);
          ox = (midX / d) * 0.08;
          oy = ((midY - ARC_CY) / d) * 0.08;
        } else {
          ox = Math.sign(midX) * 0.08;
        }
        const o = { ...s, ax: s.ax + ox, bx: s.bx + ox, ay: s.ay + oy, by: s.by + oy };
        add(o, 0.55, 0.16, metal);
        add(o, 0.05, 0.07, neonCyan, 0.56);
      } else if (s.kind === 'guide') {
        add(s, 0.42, s.r * 2, rubber);
        add(s, 0.05, 0.06, neonPink, 0.43);
        for (const [x, y] of [[s.ax, s.ay], [s.bx, s.by]]) {
          const post = new THREE.CylinderGeometry(s.r + 0.02, s.r + 0.02, 0.5, 14);
          post.translate(x, 0.25, -y);
          metal.push(post);
        }
      } else if (s.kind === 'lane') {
        add(s, 0.5, s.r * 2, metal);
        add(s, 0.05, 0.06, neonPink, 0.51);
      } else if (s.kind === 'post') {
        add(s, 0.32, s.r * 2, rubber);
        for (const [x, y] of [[s.ax, s.ay], [s.bx, s.by]]) {
          const post = new THREE.CylinderGeometry(s.r + 0.03, s.r + 0.03, 0.45, 14);
          post.translate(x, 0.225, -y);
          metal.push(post);
        }
      } else if (s.kind === 'gate') {
        add(s, 0.3, 0.05, metal, 0.12);
      }
    }
    const metalMat = new THREE.MeshStandardMaterial({ color: '#b9c0d4', metalness: 1, roughness: 0.26 });
    const rubberMat = new THREE.MeshStandardMaterial({ color: '#f1ecf7', roughness: 0.6, metalness: 0 });
    const mk = (list: THREE.BufferGeometry[], mat: THREE.Material, shadow = true) => {
      const mesh = new THREE.Mesh(mergeGeometries(list.map((g) => g.toNonIndexed())), mat);
      mesh.castShadow = shadow;
      mesh.receiveShadow = shadow;
      this.table.add(mesh);
    };
    mk(metal, metalMat);
    mk(rubber, rubberMat);
    mk(neonCyan, new THREE.MeshBasicMaterial({ color: '#22e4ff' }), false);
    mk(neonPink, new THREE.MeshBasicMaterial({ color: '#ff2bd6' }), false);
  }

  private buildBumpers(): void {
    const black = new THREE.MeshStandardMaterial({ color: '#15121c', metalness: 0.6, roughness: 0.35 });
    const chrome = new THREE.MeshStandardMaterial({ color: '#dfe3ee', metalness: 1, roughness: 0.15 });
    const skirtMat = new THREE.MeshStandardMaterial({ color: '#f5f2ff', roughness: 0.45 });
    for (const b of TABLE.bumpers) {
      const color = new THREE.Color(BUMPER_COLORS[b.index]);
      const group = new THREE.Group();
      group.position.copy(w(b.x, b.y));
      const r = b.r;
      const base = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.02, r * 1.1, 0.1, 32), black);
      base.position.y = 0.05;
      const skirt = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.98, r * 1.0, 0.18, 32), skirtMat);
      skirt.position.y = 0.19;
      const bodyMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.4, roughness: 0.3, transparent: true, opacity: 0.92 });
      const body = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.62, r * 0.78, 0.34, 28), bodyMat);
      body.position.y = 0.45;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.86, 0.045, 10, 36), chrome);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.34;
      const capMat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: color, emissiveIntensity: 0.6, roughness: 0.25, map: makeCapTexture(BUMPER_COLORS[b.index]) });
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.96, r * 0.9, 0.14, 32), capMat);
      cap.position.y = 0.68;
      for (const m of [base, skirt, body, ring, cap]) {
        m.castShadow = true;
        group.add(m);
      }
      const glow = new THREE.Mesh(
        new THREE.PlaneGeometry(r * 4.2, r * 4.2),
        new THREE.MeshBasicMaterial({ map: this.glowTexture, color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = 0.012;
      group.add(glow);
      this.table.add(group);
      this.bumperParts.push({ group, cap: capMat, body: bodyMat, skirt, glow });
    }
  }

  private buildInserts(): void {
    const disc = new THREE.CircleGeometry(1, 28);
    const mkLight = (x: number, y: number, r: number, color: string, list: THREE.MeshBasicMaterial[]) => {
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false });
      const m = new THREE.Mesh(disc, mat);
      m.scale.setScalar(r);
      m.rotation.x = -Math.PI / 2;
      m.position.copy(w(x, y, 0.008));
      this.table.add(m);
      list.push(mat);
    };
    for (const lane of TABLE.rollovers) mkLight(lane.x, 16.8, 0.26, '#ffcc33', this.laneLights);
    [-1.5, -0.5, 0.5, 1.5].forEach((dx) => mkLight(XC + dx * 0.9, 6.3, 0.3, '#22e4ff', this.multLights));
    for (let i = 0; i < 8; i++) mkLight(LANE_CX, 2.2 + i * 0.55, 0.15, i < 5 ? '#ffb020' : '#ff2bd6', this.chargeLights);
  }

  private buildFlippers(): void {
    const bodyMat = new THREE.MeshStandardMaterial({ color: '#f7f4ff', roughness: 0.3, metalness: 0.05 });
    const rubberMat = new THREE.MeshStandardMaterial({ color: '#ff2b55', roughness: 0.55, emissive: '#3a0010' });
    const pinMat = new THREE.MeshStandardMaterial({ color: '#cfd5e2', metalness: 1, roughness: 0.2 });
    for (const def of TABLE.flippers) {
      const mirror = def.side === -1;
      const body = new THREE.ExtrudeGeometry(flipperShape(0, mirror), { depth: 0.3, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2, curveSegments: 16 });
      body.rotateX(-Math.PI / 2);
      body.translate(0, 0.1, 0);
      const band = new THREE.ExtrudeGeometry(flipperShape(0.035, mirror), { depth: 0.14, bevelEnabled: false, curveSegments: 16 });
      band.rotateX(-Math.PI / 2);
      band.translate(0, 0.12, 0);
      const g = new THREE.Group();
      const m1 = new THREE.Mesh(body, bodyMat);
      const m2 = new THREE.Mesh(band, rubberMat);
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.08, 14), pinMat);
      pin.position.y = 0.45;
      m1.castShadow = m2.castShadow = true;
      g.add(m1, m2, pin);
      g.position.copy(w(def.px, def.py));
      this.table.add(g);
      this.flippers.push(g);
    }
  }

  resize(): void {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * this.renderScale;
    const key = `${width}x${height}@${dpr}`;
    if (key === this.lastSize) return;
    this.lastSize = key;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.fitCamera(width, height);
  }

  /** Place the camera so the whole table fits, leaving room for the HUD. */
  private fitCamera(width: number, height: number): void {
    const portrait = height > width;
    this.camera.fov = portrait ? 46 : 38;
    this.camera.updateProjectionMatrix();
    this.table.updateMatrixWorld(true);
    const corners: THREE.Vector3[] = [];
    for (const x of [-5.95, 5.95]) for (const y of [-2.4, FIELD_Y1 + 0.7]) for (const h of [0, 0.8]) corners.push(this.table.localToWorld(w(x, y, h)));
    const target = this.table.localToWorld(w(0, 9.2));
    const elev = portrait ? (64 * Math.PI) / 180 : (58 * Math.PI) / 180;
    const dir = new THREE.Vector3(0, Math.sin(elev), Math.cos(elev));
    const topLimit = portrait ? 0.8 : 0.96;
    const xLimit = portrait ? 0.98 : 0.96;
    let lo = 5;
    let hi = 90;
    for (let i = 0; i < 30; i++) {
      const d = (lo + hi) / 2;
      this.camera.position.copy(target).addScaledVector(dir, d);
      this.camera.lookAt(target);
      this.camera.updateMatrixWorld(true);
      const fits = corners.every((c) => {
        const p = c.clone().project(this.camera);
        return Math.abs(p.x) <= xLimit && p.y <= topLimit && p.y >= -0.97;
      });
      if (fits) hi = d;
      else lo = d;
    }
    this.camera.position.copy(target).addScaledVector(dir, hi);
    this.camera.lookAt(target);
    this.baseCamPos.copy(this.camera.position);
    this.lookTarget.copy(target);
  }

  kick(amount: number): void {
    this.shake = Math.min(0.35, this.shake + amount);
  }

  lanesFlash(): void {
    this.flashLanes = 1.2;
  }

  update(s: SimState, dt: number, reducedMotion: boolean): void {
    this.resize();
    const live = s.mode === 'play';
    this.ball.visible = live;
    this.ballShadowFake.visible = live;
    this.ball.position.copy(w(s.ballPos.x, s.ballPos.y, BALL_R));
    this.ballShadowFake.position.copy(w(s.ballPos.x + 0.08, s.ballPos.y - 0.05, 0.004));
    if (!reducedMotion) {
      const sp = Math.hypot(s.ballVel.x, s.ballVel.y);
      if (sp > 0.01) {
        const axis = new THREE.Vector3(-s.ballVel.y, 0, -s.ballVel.x).normalize();
        this.ball.rotateOnWorldAxis(axis, (sp * dt) / BALL_R);
      }
    }

    this.flippers[0].rotation.y = s.flipperAngle[0];
    this.flippers[1].rotation.y = -s.flipperAngle[1];

    for (let i = 0; i < this.bumperParts.length; i++) {
      const p = this.bumperParts[i];
      const f = Math.min(1, s.bumperFlash[i] / 0.22);
      const idle = s.mode === 'title' ? 0.4 + 0.4 * Math.max(0, Math.sin(s.time * 3 + i * 2.1)) : 0.6;
      p.cap.emissiveIntensity = idle + 3.4 * f;
      p.body.emissiveIntensity = 0.35 + 2.6 * f;
      p.skirt.scale.set(1 + 0.12 * f, 1, 1 + 0.12 * f);
      const gm = p.glow.material as THREE.MeshBasicMaterial;
      gm.opacity = 0.3 + 0.7 * f;
      p.glow.scale.setScalar(1 + 0.5 * f);
    }

    this.flashLanes = Math.max(0, this.flashLanes - dt);
    const blink = this.flashLanes > 0 && Math.floor(this.flashLanes * 10) % 2 === 0;
    this.laneLights.forEach((m, i) => (m.opacity = s.lanes[i] || blink ? 1 : 0.16));
    this.multLights.forEach((m, i) => (m.opacity = s.multiplier >= i + 2 ? 1 : 0.14));
    const lit = Math.ceil(s.plungerCharge * this.chargeLights.length);
    this.chargeLights.forEach((m, i) => (m.opacity = i < lit ? 1 : 0.1));

    const top = plungerY(s);
    this.plunger.position.copy(w(LANE_CX, top));
    const springLen = Math.max(0.2, top - 0.26 + 0.9);
    this.spring.scale.set(1, 1, springLen / this.springBaseLen);

    // Camera shake decays quickly; it never accumulates.
    this.shake = Math.max(0, this.shake - dt * 1.6);
    this.camera.position.copy(this.baseCamPos);
    if (!reducedMotion && this.shake > 0) {
      const t = performance.now() * 0.06;
      this.camera.position.x += Math.sin(t * 1.7) * this.shake * 0.35;
      this.camera.position.y += Math.cos(t * 2.3) * this.shake * 0.25;
    }
    this.camera.lookAt(this.lookTarget);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.renderer.dispose();
  }
}

function flipperShape(grow: number, mirror: boolean): THREE.Shape {
  const r0 = FLIPPER_R0 + grow;
  const r1 = FLIPPER_R1 + grow;
  const L = FLIPPER_LEN;
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 16; i++) {
    const a = Math.PI / 2 + (i / 16) * Math.PI;
    pts.push(new THREE.Vector2(Math.cos(a) * r0, Math.sin(a) * r0));
  }
  for (let i = 0; i <= 12; i++) {
    const a = -Math.PI / 2 + (i / 12) * Math.PI;
    pts.push(new THREE.Vector2(L + Math.cos(a) * r1, Math.sin(a) * r1));
  }
  if (mirror) {
    for (const p of pts) p.x = -p.x;
    pts.reverse();
  }
  return new THREE.Shape(pts);
}

function makeGlowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeCapTexture(color: string): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = color;
  g.beginPath();
  g.arc(64, 64, 58, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ffffff';
  star(g, 64, 64, 34, 14, 5);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function star(g: CanvasRenderingContext2D, cx: number, cy: number, ro: number, ri: number, n: number): void {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? ro : ri;
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  g.closePath();
}

function makePlayfieldTexture(): THREE.CanvasTexture {
  const W = 1024;
  const H = 2048;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const px = (x: number) => ((x + 5) / 10) * W;
  const py = (y: number) => ((FIELD_Y1 - y) / (FIELD_Y1 - FIELD_Y0)) * H;
  const s = W / 10; // pixels per unit

  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#2a0b4a');
  bg.addColorStop(0.45, '#120c3a');
  bg.addColorStop(1, '#070a22');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);

  // Fine grid.
  g.strokeStyle = 'rgba(120, 140, 255, 0.07)';
  g.lineWidth = 2;
  for (let x = 0; x <= W; x += s / 2) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, H);
    g.stroke();
  }
  for (let y = 0; y <= H; y += s / 2) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(W, y);
    g.stroke();
  }

  // Sunburst behind the bumpers.
  const cx = px(XC);
  const cy = py(11.6);
  const burst = g.createRadialGradient(cx, cy, 10, cx, cy, s * 4.2);
  burst.addColorStop(0, 'rgba(255, 60, 220, 0.55)');
  burst.addColorStop(0.5, 'rgba(120, 40, 255, 0.22)');
  burst.addColorStop(1, 'rgba(40, 0, 80, 0)');
  g.fillStyle = burst;
  g.beginPath();
  g.arc(cx, cy, s * 4.2, 0, Math.PI * 2);
  g.fill();
  g.save();
  g.translate(cx, cy);
  for (let i = 0; i < 24; i++) {
    g.rotate((Math.PI * 2) / 24);
    g.fillStyle = i % 2 ? 'rgba(255, 255, 255, 0.035)' : 'rgba(34, 228, 255, 0.05)';
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(s * 4.4, -s * 0.5);
    g.lineTo(s * 4.4, s * 0.5);
    g.fill();
  }
  g.restore();

  // Arrows pointing up the field from the flippers.
  const arrow = (x: number, y: number, color: string, scale = 1) => {
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(px(x), py(y + 0.5 * scale));
    g.lineTo(px(x + 0.32 * scale), py(y));
    g.lineTo(px(x + 0.12 * scale), py(y));
    g.lineTo(px(x + 0.12 * scale), py(y - 0.4 * scale));
    g.lineTo(px(x - 0.12 * scale), py(y - 0.4 * scale));
    g.lineTo(px(x - 0.12 * scale), py(y));
    g.lineTo(px(x - 0.32 * scale), py(y));
    g.closePath();
    g.fill();
  };
  for (let i = 0; i < 3; i++) arrow(XC, 4.0 + i * 0.7, `rgba(34, 228, 255, ${0.25 + i * 0.15})`, 0.9);
  for (const lane of TABLE.rollovers) arrow(lane.x, 15.5, 'rgba(255, 204, 51, 0.45)', 0.8);

  // Title wordmark.
  g.save();
  g.translate(px(XC), py(8.3));
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `900 ${Math.round(s * 0.95)}px "Arial Black", Impact, sans-serif`;
  g.shadowColor = '#ff2bd6';
  g.shadowBlur = 30;
  g.fillStyle = '#ff7be8';
  g.fillText('NEON', 0, 0);
  g.font = `700 ${Math.round(s * 0.34)}px Arial, sans-serif`;
  g.shadowColor = '#22e4ff';
  g.fillStyle = '#9ff3ff';
  g.fillText('P  I  N  B  A  L  L', 0, s * 0.72);
  g.restore();

  // Multiplier insert labels.
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `800 ${Math.round(s * 0.3)}px Arial, sans-serif`;
  [-1.5, -0.5, 0.5, 1.5].forEach((dx, i) => {
    const x = px(XC + dx * 0.9);
    const y = py(6.3);
    g.strokeStyle = 'rgba(34, 228, 255, 0.6)';
    g.lineWidth = 4;
    g.beginPath();
    g.arc(x, y, s * 0.36, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = 'rgba(200, 250, 255, 0.85)';
    g.fillText(`${i + 2}x`, x, y);
  });

  // Rollover lane rings.
  for (const lane of TABLE.rollovers) {
    g.strokeStyle = 'rgba(255, 204, 51, 0.7)';
    g.lineWidth = 4;
    g.beginPath();
    g.arc(px(lane.x), py(16.8), s * 0.32, 0, Math.PI * 2);
    g.stroke();
  }

  // Inlane triangles above each flipper.
  for (const def of TABLE.flippers) {
    const x0 = def.side === 1 ? -4.6 : LANE_X0 - 0.4;
    const x1 = def.px - def.side * 0.6;
    g.fillStyle = 'rgba(255, 43, 214, 0.16)';
    g.beginPath();
    g.moveTo(px(x0), py(5.3));
    g.lineTo(px(x1), py(3.3));
    g.lineTo(px(x0), py(3.3 + 0.3));
    g.closePath();
    g.fill();
  }

  // Shooter lane.
  g.fillStyle = 'rgba(0, 0, 0, 0.45)';
  g.fillRect(px(LANE_X0), py(14.6), px(LANE_X1) - px(LANE_X0), py(FIELD_Y0) - py(14.6));
  g.font = `800 ${Math.round(s * 0.2)}px Arial, sans-serif`;
  g.save();
  g.translate(px(LANE_CX), py(7.6));
  g.rotate(-Math.PI / 2);
  g.fillStyle = 'rgba(255, 176, 32, 0.55)';
  g.fillText('S H O O T E R', 0, 0);
  g.restore();

  // Drain area shading.
  const drain = g.createLinearGradient(0, py(3), 0, py(FIELD_Y0));
  drain.addColorStop(0, 'rgba(0,0,0,0)');
  drain.addColorStop(1, 'rgba(0,0,0,0.85)');
  g.fillStyle = drain;
  g.fillRect(0, py(3), W, py(FIELD_Y0) - py(3));

  // Outside of the top arc is cabinet.
  g.fillStyle = '#0b0712';
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(W, 0);
  g.lineTo(W, py(ARC_CY));
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * Math.PI;
    g.lineTo(px(Math.cos(a) * ARC_R), py(ARC_CY + Math.sin(a) * ARC_R));
  }
  g.lineTo(0, py(ARC_CY));
  g.closePath();
  g.fill();

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
