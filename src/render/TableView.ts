// Three.js view of the table. Reads SimState; never writes it.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { SimState } from '../sim/sim';
import {
  ARCH_POINTS,
  BALL_RADIUS,
  BUMPERS,
  FLIPPERS,
  LANES,
  PLUNGER,
  POSTS,
  SLINGS,
  WALLS,
  type FlipperSpec,
  type Vec2,
} from '../sim/table';
import { createPlayfieldTexture, CABINET } from './playfieldArt';

const BUMPER_COLORS = ['#ff2d95', '#22e4ff', '#ffb020'];
const RAIL_HEIGHT = 0.42;

export class TableView {
  readonly scene = new THREE.Scene();
  /** Table plane: x right, y up-table, z up out of the playfield. */
  readonly table = new THREE.Group();
  private readonly ball: THREE.Mesh;
  private readonly ballShadow: THREE.Mesh;
  private readonly flippers: THREE.Group[] = [];
  private readonly bumperCaps: THREE.Mesh[] = [];
  private readonly bumperRings: THREE.Mesh[] = [];
  private readonly bumperGroups: THREE.Group[] = [];
  private readonly bumperMats: THREE.MeshStandardMaterial[] = [];
  private readonly slingMats: THREE.MeshStandardMaterial[] = [];
  private readonly laneMats: THREE.MeshStandardMaterial[] = [];
  private readonly multMats: THREE.MeshStandardMaterial[] = [];
  private readonly saveMat: THREE.MeshStandardMaterial;
  private readonly plungerRod: THREE.Group;
  private readonly spring: THREE.Mesh;
  private readonly launchArrowMat: THREE.MeshStandardMaterial;
  /** Visible glow per bumper, driven by hit events so no frame rate can skip a flash. */
  readonly flash: number[] = [0, 0, 0];
  readonly slingFlash: number[] = [0, 0];

  flashBumper(i: number): void {
    this.flash[i] = 1;
  }

  flashSling(i: number): void {
    this.slingFlash[i] = 1;
  }

  constructor(renderer: THREE.WebGLRenderer) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.3;
    pmrem.dispose();
    this.scene.background = new THREE.Color('#05060d');

    this.table.rotation.x = -Math.PI / 2;
    this.scene.add(this.table);

    this.scene.add(new THREE.HemisphereLight('#9fb4ff', '#1a0d2a', 0.45));
    const key = new THREE.DirectionalLight('#fff3e0', 1.1);
    key.position.set(-4, 14, 8);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight('#7a5cff', 0.8);
    rim.position.set(6, 6, -12);
    this.scene.add(rim);

    this.buildPlayfield();
    this.buildCabinet();
    this.buildRails();
    this.buildSlings();
    this.buildBumpers();
    this.buildPosts();
    this.buildInserts();
    this.saveMat = this.insertMaterial('#39ff88');
    const save = new THREE.Mesh(new THREE.CircleGeometry(0.26, 24), this.saveMat);
    save.position.set(0, -9.6, 0.012);
    this.table.add(save);
    this.buildFlippers();
    const plunger = this.buildPlunger();
    this.plungerRod = plunger.rod;
    this.spring = plunger.spring;
    this.launchArrowMat = this.insertMaterial('#ffb020');
    for (let i = 0; i < 3; i++) {
      const arrow = new THREE.Mesh(this.arrowGeometry(0.32), this.launchArrowMat);
      arrow.position.set(PLUNGER.x, -6.5 + i * 0.9, 0.012);
      this.table.add(arrow);
    }

    const ballMat = new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 0.9, roughness: 0.15, emissive: '#3a4660', emissiveIntensity: 0.6 });
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_RADIUS * 1.05, 32, 20), ballMat);
    this.table.add(this.ball);
    this.ballShadow = new THREE.Mesh(
      new THREE.CircleGeometry(BALL_RADIUS * 1.25, 24),
      new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.45, depthWrite: false }),
    );
    this.table.add(this.ballShadow);
  }

  private insertMaterial(color: string): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(color).multiplyScalar(0.25),
      emissive: color,
      emissiveIntensity: 0.15,
      roughness: 0.3,
      transparent: true,
      opacity: 0.95,
    });
  }

  private arrowGeometry(size: number): THREE.ShapeGeometry {
    const shape = new THREE.Shape();
    shape.moveTo(0, size);
    shape.lineTo(size, -size * 0.2);
    shape.lineTo(size * 0.45, -size * 0.2);
    shape.lineTo(size * 0.45, -size);
    shape.lineTo(-size * 0.45, -size);
    shape.lineTo(-size * 0.45, -size * 0.2);
    shape.lineTo(-size, -size * 0.2);
    shape.closePath();
    return new THREE.ShapeGeometry(shape);
  }

  private buildPlayfield(): void {
    const w = CABINET.right - CABINET.left;
    const h = CABINET.top - CABINET.bottom;
    const tex = createPlayfieldTexture();
    const field = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.38, metalness: 0.0, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: 0.1 }),
    );
    field.position.set((CABINET.left + CABINET.right) / 2, (CABINET.top + CABINET.bottom) / 2, 0);
    this.table.add(field);
  }

  private buildCabinet(): void {
    const wood = new THREE.MeshStandardMaterial({ color: '#1a1030', roughness: 0.55, metalness: 0.2 });
    const trim = new THREE.MeshStandardMaterial({ color: '#c9cfda', roughness: 0.25, metalness: 1 });
    const geos: THREE.BufferGeometry[] = [];
    const box = (x0: number, y0: number, x1: number, y1: number, z: number) => {
      const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z);
      g.translate((x0 + x1) / 2, (y0 + y1) / 2, z / 2);
      geos.push(g);
    };
    const { left, right, top, bottom } = CABINET;
    box(left - 0.5, bottom - 0.5, left, top + 0.5, 1.1);
    box(right, bottom - 0.5, right + 0.5, top + 0.5, 1.1);
    box(left, top, right, top + 0.5, 1.1);
    box(left, bottom - 0.5, right, bottom, 1.1);
    const cab = new THREE.Mesh(mergeGeometries(geos), wood);
    this.table.add(cab);
    // Chrome lip along the cabinet edge.
    const lipGeos: THREE.BufferGeometry[] = [];
    const lip = (x0: number, y0: number, x1: number, y1: number) => {
      const g = new THREE.BoxGeometry(Math.max(0.08, x1 - x0), Math.max(0.08, y1 - y0), 0.08);
      g.translate((x0 + x1) / 2, (y0 + y1) / 2, 1.14);
      lipGeos.push(g);
    };
    lip(left - 0.5, bottom - 0.5, left - 0.42, top + 0.5);
    lip(right + 0.42, bottom - 0.5, right + 0.5, top + 0.5);
    lip(left - 0.5, top + 0.42, right + 0.5, top + 0.5);
    this.table.add(new THREE.Mesh(mergeGeometries(lipGeos), trim));

    // Fill the corners outside the arch and the apron below the flippers.
    const plastic = new THREE.MeshStandardMaterial({ color: '#241445', roughness: 0.4, metalness: 0.1 });
    const corner = new THREE.Shape();
    corner.moveTo(left, ARCH_POINTS[0].y);
    for (const p of ARCH_POINTS) corner.lineTo(p.x, p.y);
    corner.lineTo(right, ARCH_POINTS[ARCH_POINTS.length - 1].y);
    corner.lineTo(right, top);
    corner.lineTo(left, top);
    corner.closePath();
    const sideL = new THREE.Shape([
      new THREE.Vector2(left, -5.0),
      new THREE.Vector2(left, ARCH_POINTS[0].y),
      new THREE.Vector2(-4.5, ARCH_POINTS[0].y),
      new THREE.Vector2(-4.5, -5.0),
    ]);
    const apronL = new THREE.Shape([
      new THREE.Vector2(left, bottom),
      new THREE.Vector2(left, -5.0),
      new THREE.Vector2(-4.5, -5.0),
      new THREE.Vector2(-2.52, -7.2),
      new THREE.Vector2(-2.45, -7.75),
      new THREE.Vector2(-1.35, -9.3),
      new THREE.Vector2(-1.0, bottom),
    ]);
    const apronR = new THREE.Shape([
      new THREE.Vector2(4.5, bottom),
      new THREE.Vector2(1.0, bottom),
      new THREE.Vector2(1.35, -9.3),
      new THREE.Vector2(2.45, -7.75),
      new THREE.Vector2(2.52, -7.2),
      new THREE.Vector2(4.5, -5.0),
    ]);
    const laneBase = new THREE.Shape([
      new THREE.Vector2(4.5, bottom),
      new THREE.Vector2(right, bottom),
      new THREE.Vector2(right, PLUNGER.restY - 1.3),
      new THREE.Vector2(4.5, PLUNGER.restY - 1.3),
    ]);
    const ex = (shape: THREE.Shape, depth: number) =>
      new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 4 });
    const fill = mergeGeometries([ex(corner, 0.42), ex(sideL, 0.42), ex(apronL, 0.3), ex(apronR, 0.3), ex(laneBase, 0.3)]);
    this.table.add(new THREE.Mesh(fill, plastic));
  }

  private buildRails(): void {
    const geos: THREE.BufferGeometry[] = [];
    const neon: THREE.BufferGeometry[] = [];
    for (const wall of WALLS) {
      if (wall.kind === 'sling') continue;
      const dx = wall.b.x - wall.a.x;
      const dy = wall.b.y - wall.a.y;
      const len = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      const g = new THREE.BoxGeometry(len + 0.1, 0.12, wall.kind === 'gate' ? 0.08 : RAIL_HEIGHT);
      g.rotateZ(angle);
      g.translate((wall.a.x + wall.b.x) / 2, (wall.a.y + wall.b.y) / 2, wall.kind === 'gate' ? 0.5 : RAIL_HEIGHT / 2);
      geos.push(g);
      if (wall.kind === 'wall') {
        const n = new THREE.BoxGeometry(len + 0.1, 0.05, 0.05);
        n.rotateZ(angle);
        n.translate((wall.a.x + wall.b.x) / 2, (wall.a.y + wall.b.y) / 2, RAIL_HEIGHT + 0.02);
        neon.push(n);
      }
    }
    const chrome = new THREE.MeshStandardMaterial({ color: '#d7dce6', metalness: 1, roughness: 0.18 });
    this.table.add(new THREE.Mesh(mergeGeometries(geos), chrome));
    const neonMat = new THREE.MeshStandardMaterial({ color: '#111', emissive: '#7a5cff', emissiveIntensity: 1.1 });
    this.table.add(new THREE.Mesh(mergeGeometries(neon), neonMat));
  }

  private buildSlings(): void {
    SLINGS.forEach((tri, i) => {
      const shape = new THREE.Shape(tri.map((p) => new THREE.Vector2(p.x, p.y)));
      const body = new THREE.Mesh(
        new THREE.ExtrudeGeometry(shape, { depth: 0.38, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2 }),
        new THREE.MeshStandardMaterial({ color: '#6e64a0', roughness: 0.35, metalness: 0.1 }),
      );
      this.table.add(body);
      const mat = new THREE.MeshStandardMaterial({ color: '#3a0a22', emissive: BUMPER_COLORS[0], emissiveIntensity: 0.5 });
      this.slingMats.push(mat);
      const a = tri[0];
      const b = tri[2];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const rubber = new THREE.Mesh(new THREE.BoxGeometry(len, 0.1, 0.3), mat);
      rubber.rotation.z = Math.atan2(b.y - a.y, b.x - a.x);
      const nx = i === 0 ? 0.05 : -0.05;
      rubber.position.set((a.x + b.x) / 2 + nx, (a.y + b.y) / 2, 0.2);
      this.table.add(rubber);
    });
  }

  private buildBumpers(): void {
    const baseGeo = new THREE.CylinderGeometry(0.62, 0.66, 0.12, 40);
    baseGeo.rotateX(Math.PI / 2);
    const bodyGeo = new THREE.CylinderGeometry(0.5, 0.52, 0.42, 40, 1, true);
    bodyGeo.rotateX(Math.PI / 2);
    const ringGeo = new THREE.TorusGeometry(0.56, 0.06, 10, 40);
    const capGeo = new THREE.CylinderGeometry(0.42, 0.55, 0.14, 40);
    capGeo.rotateX(Math.PI / 2);
    const starGeo = new THREE.CircleGeometry(0.2, 5);
    BUMPERS.forEach((b, i) => {
      const color = BUMPER_COLORS[i];
      const group = new THREE.Group();
      group.position.set(b.x, b.y, 0);
      const base = new THREE.Mesh(baseGeo, new THREE.MeshStandardMaterial({ color: '#1b1b24', metalness: 0.6, roughness: 0.3 }));
      base.position.z = 0.06;
      const bodyMat = new THREE.MeshStandardMaterial({ color: '#202030', emissive: color, emissiveIntensity: 0.6, roughness: 0.2, side: THREE.DoubleSide });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.z = 0.33;
      const ringMat = new THREE.MeshStandardMaterial({ color: '#cfd5e0', metalness: 1, roughness: 0.15 });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.z = 0.26;
      const capMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.5), emissive: color, emissiveIntensity: 0.25, roughness: 0.3 });
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.z = 0.6;
      const star = new THREE.Mesh(starGeo, new THREE.MeshBasicMaterial({ color: '#ffffff' }));
      star.position.z = 0.68;
      group.add(base, body, ring, cap, star);
      this.table.add(group);
      this.bumperGroups.push(group);
      this.bumperMats.push(bodyMat, capMat);
      this.bumperCaps.push(cap);
      this.bumperRings.push(ring);
    });
  }

  private buildPosts(): void {
    const geo = new THREE.CylinderGeometry(1, 1, 0.5, 20);
    geo.rotateX(Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ color: '#d7dce6', metalness: 1, roughness: 0.2 });
    const capMat = new THREE.MeshStandardMaterial({ color: '#222', emissive: '#22e4ff', emissiveIntensity: 1.6 });
    POSTS.slice(0, 4).forEach((p) => {
      const m = new THREE.Mesh(geo, mat);
      m.scale.set(p.r, p.r, 1);
      m.position.set(p.x, p.y, 0.25);
      this.table.add(m);
      const cap = new THREE.Mesh(new THREE.CircleGeometry(p.r * 0.8, 16), capMat);
      cap.position.set(p.x, p.y, 0.51);
      this.table.add(cap);
    });
  }

  private buildInserts(): void {
    LANES.forEach((lane) => {
      const mat = this.insertMaterial('#22e4ff');
      this.laneMats.push(mat);
      const m = new THREE.Mesh(new THREE.CircleGeometry(0.2, 24), mat);
      m.position.set(lane.x, lane.y - 1.0, 0.012);
      this.table.add(m);
      const arrow = new THREE.Mesh(this.arrowGeometry(0.16), mat);
      arrow.rotation.z = Math.PI;
      arrow.position.set(lane.x, lane.y + 0.05, 0.012);
      this.table.add(arrow);
    });
    // Multiplier inserts 2x..5x in a row above the drain.
    for (let i = 0; i < 4; i++) {
      const mat = this.insertMaterial('#ffb020');
      this.multMats.push(mat);
      const m = new THREE.Mesh(new THREE.CircleGeometry(0.24, 24), mat);
      m.position.set(-1.35 + i * 0.9, -1.6, 0.012);
      this.table.add(m);
    }
  }

  private flipperShape(spec: FlipperSpec): THREE.Shape {
    const r0 = spec.baseRadius;
    const r1 = spec.tipRadius;
    const L = spec.length;
    const shape = new THREE.Shape();
    const a = Math.asin((r0 - r1) / L);
    shape.absarc(0, 0, r0, Math.PI / 2 + a, Math.PI * 1.5 - a, false);
    shape.absarc(L, 0, r1, -Math.PI / 2 - a, Math.PI / 2 + a, false);
    shape.closePath();
    return shape;
  }

  private buildFlippers(): void {
    FLIPPERS.forEach((spec) => {
      const pivot = new THREE.Group();
      pivot.position.set(spec.pivot.x, spec.pivot.y, 0);
      const shape = this.flipperShape(spec);
      const body = new THREE.Mesh(
        new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 }),
        new THREE.MeshStandardMaterial({ color: '#b9b4d6', roughness: 0.35 }),
      );
      body.position.z = 0.04;
      const rubber = new THREE.Mesh(
        new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.0, bevelSegments: 1 }),
        new THREE.MeshStandardMaterial({ color: '#3a0618', emissive: '#ff2d95', emissiveIntensity: 0.4, roughness: 0.6 }),
      );
      rubber.position.z = 0.12;
      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.12, 0.06, 20).rotateX(Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: '#d7dce6', metalness: 1, roughness: 0.2 }),
      );
      cap.position.z = 0.4;
      pivot.add(body, rubber, cap);
      this.table.add(pivot);
      this.flippers.push(pivot);
    });
  }

  private buildPlunger(): { rod: THREE.Group; spring: THREE.Mesh } {
    const rod = new THREE.Group();
    const chrome = new THREE.MeshStandardMaterial({ color: '#d7dce6', metalness: 1, roughness: 0.2 });
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.22, 24), chrome);
    tip.position.set(0, -0.11, 0.28);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.8, 12), chrome);
    shaft.position.set(0, -1.5, 0.28);
    const knob = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 24, 16),
      new THREE.MeshStandardMaterial({ color: '#3a0618', emissive: '#ff2d95', emissiveIntensity: 0.9, roughness: 0.3 }),
    );
    knob.position.set(0, -2.95, 0.4);
    rod.add(tip, shaft, knob);
    rod.position.set(PLUNGER.x, PLUNGER.restY, 0);
    this.table.add(rod);

    const points: THREE.Vector3[] = [];
    const turns = 7;
    for (let i = 0; i <= turns * 24; i++) {
      const t = i / (turns * 24);
      const a = t * turns * Math.PI * 2;
      points.push(new THREE.Vector3(Math.cos(a) * 0.18, -t, 0.28 + Math.sin(a) * 0.18));
    }
    const spring = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), turns * 24, 0.025, 6, false),
      chrome,
    );
    spring.position.set(PLUNGER.x, PLUNGER.restY - 0.22, 0);
    this.table.add(spring);
    return { rod, spring };
  }

  /** Table point to world space. */
  toWorld(p: Vec2, z = 0): THREE.Vector3 {
    return new THREE.Vector3(p.x, z, -p.y);
  }

  update(s: SimState, dt: number, time: number): void {
    const b = s.ball0;
    const hidden = s.mode === 'attract' || s.mode === 'gameover' || s.mode === 'drained';
    this.ball.visible = !hidden || s.mode === 'attract';
    this.ballShadow.visible = this.ball.visible;
    this.ball.position.set(b.x, b.y, BALL_RADIUS);
    // Roll the ball visually along its velocity.
    const speed = Math.hypot(b.vx, b.vy);
    if (speed > 0.01) {
      const axis = new THREE.Vector3(-b.vy, b.vx, 0).normalize();
      this.ball.rotateOnWorldAxis(axis, (speed * dt) / BALL_RADIUS);
    }
    this.ballShadow.position.set(b.x + 0.08, b.y - 0.1, 0.01);

    FLIPPERS.forEach((spec, i) => {
      const angle = s.flippers[i].angle;
      // Left flipper rotates counter-clockwise when raised; the right mirrors it.
      this.flippers[i].rotation.z = spec.side === 'left' ? angle : Math.PI - angle;
    });

    BUMPERS.forEach((_, i) => {
      if (s.bumperLight[i] > 0) this.flash[i] = Math.max(this.flash[i], 1);
      const f = this.flash[i];
      this.flash[i] = Math.max(0, this.flash[i] - dt * 4);
      const idle = 0.55 + 0.15 * Math.sin(time * 2.2 + i * 2.1);
      this.bumperMats[i * 2].emissiveIntensity = idle * 0.6 + f * 3.0;
      this.bumperMats[i * 2 + 1].emissiveIntensity = 0.25 + f * 2.6;
      const squash = 1 - f * 0.12;
      this.bumperCaps[i].position.z = 0.6 - f * 0.12;
      this.bumperRings[i].position.z = 0.26 + f * 0.1;
      this.bumperGroups[i].scale.set(1 + f * 0.05, 1 + f * 0.05, squash);
    });

    s.slingLight.forEach((v, i) => {
      if (v > 0) this.slingFlash[i] = Math.max(this.slingFlash[i], 1);
      this.slingMats[i].emissiveIntensity = 0.35 + this.slingFlash[i] * 2.6;
      this.slingFlash[i] = Math.max(0, this.slingFlash[i] - dt * 6);
    });

    s.lanes.forEach((lit, i) => {
      this.laneMats[i].emissiveIntensity = lit ? 2.6 : 0.12;
    });
    this.multMats.forEach((mat, i) => {
      mat.emissiveIntensity = s.multiplier >= i + 2 ? 2.4 : 0.12;
    });
    const saveOn = s.ballSaveTimer > 0 || (s.mode === 'play' && !s.ballSaveUsed && b.inLane);
    this.saveMat.emissiveIntensity = saveOn ? (s.ballSaveTimer > 0 && s.ballSaveTimer < 1.2 ? (Math.sin(time * 20) > 0 ? 2.5 : 0.2) : 2.5) : 0.1;

    const ready = s.mode === 'play' && b.inLane && b.y < -8;
    const chase = Math.floor(time * 6) % 3;
    this.launchArrowMat.emissiveIntensity = ready ? (chase === 0 ? 2.8 : 1.2) : 0.12;

    // The spring compresses between the plunger tip and the fixed lane floor.
    this.plungerRod.position.y = PLUNGER.restY - s.plungerOffset;
    const springTop = PLUNGER.restY - s.plungerOffset - 0.22;
    const springBottom = PLUNGER.restY - 1.3;
    this.spring.position.y = springTop;
    this.spring.scale.y = Math.max(0.05, springTop - springBottom);
  }
}
