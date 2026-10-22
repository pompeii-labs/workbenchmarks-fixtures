import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { SimState } from '../sim/sim';
import {
  ARC,
  BALL_R,
  BUMPERS,
  FIELD,
  FLIPPERS,
  LANES,
  PLUNGER,
  SEGMENTS,
  SLINGS,
  type FlipperDef,
} from '../sim/table';

const TABLE = { minX: -4.75, maxX: 5.6, minY: -11.2, maxY: 10.75 };
const RAIL_H = 0.42;
const BUMPER_COLORS = ['#ff3d9a', '#29e6ff', '#ffc23d'];

/** Sim (x, y) on the table plane -> world (x, h, -y). */
function w(x: number, y: number, h = 0): THREE.Vector3 {
  return new THREE.Vector3(x, h, -y);
}

interface Particle {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
}

export class TableView {
  readonly scene = new THREE.Scene();
  private readonly ball: THREE.Mesh;
  private readonly ballShadow: THREE.Mesh;
  private readonly flippers: THREE.Group[] = [];
  private readonly bumperCaps: THREE.MeshStandardMaterial[] = [];
  private readonly bumperHalos: THREE.Mesh[] = [];
  private readonly bumperBodies: THREE.Group[] = [];
  private readonly slingMats: THREE.MeshStandardMaterial[] = [];
  private readonly laneMats: THREE.MeshStandardMaterial[] = [];
  private readonly laneHalos: THREE.Mesh[] = [];
  private readonly plungerRod: THREE.Group;
  private plungerBaseZ = 0;
  private readonly particles: Particle[] = [];
  private particleCursor = 0;
  private readonly arrowMats: THREE.MeshBasicMaterial[] = [];

  constructor(renderer: THREE.WebGLRenderer) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    pmrem.dispose();
    this.scene.background = this.makeBackground();

    this.addLights();
    this.addCabinet();
    this.addRails();
    this.addSlings();
    this.addBumpers();
    this.addLanes();
    FLIPPERS.forEach((def) => this.flippers.push(this.addFlipper(def)));
    this.plungerRod = this.addPlunger();

    const ballMat = new THREE.MeshStandardMaterial({ color: '#e8ecf2', metalness: 1, roughness: 0.12, envMapIntensity: 1.6 });
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 32, 20), ballMat);
    this.ball.castShadow = true;
    this.scene.add(this.ball);

    const shadowTex = this.radialTexture('rgba(0,0,0,0.85)', 'rgba(0,0,0,0)');
    this.ballShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(BALL_R * 3.2, BALL_R * 3.2),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }),
    );
    this.ballShadow.rotation.x = -Math.PI / 2;
    this.scene.add(this.ballShadow);

    const sparkGeo = new THREE.SphereGeometry(0.05, 6, 4);
    for (let i = 0; i < 48; i += 1) {
      const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      const mesh = new THREE.Mesh(sparkGeo, mat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.particles.push({ mesh, vx: 0, vy: 0, vz: 0, life: 0 });
    }
  }

  get bounds(): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(TABLE.minX, -0.6, -TABLE.maxY), new THREE.Vector3(TABLE.maxX, RAIL_H + 0.2, -TABLE.minY));
  }

  burst(x: number, y: number, color: string, count = 10, speed = 5): void {
    for (let i = 0; i < count; i += 1) {
      const p = this.particles[this.particleCursor];
      this.particleCursor = (this.particleCursor + 1) % this.particles.length;
      const a = (i / count) * Math.PI * 2 + i * 0.37;
      const sp = speed * (0.6 + ((i * 7) % 5) / 10);
      p.mesh.position.copy(w(x, y, 0.35));
      p.vx = Math.cos(a) * sp;
      p.vz = -Math.sin(a) * sp;
      p.vy = 2 + (i % 3);
      p.life = 1;
      (p.mesh.material as THREE.MeshBasicMaterial).color.set(color);
      p.mesh.visible = true;
    }
  }

  update(s: SimState, dt: number, time: number, reducedMotion: boolean): void {
    const b = s.ball;
    this.ball.position.copy(w(b.x, b.y, BALL_R));
    this.ball.rotation.set(-b.spin * Math.sign(b.vy || 1) * 0.7, 0, -b.spin * Math.sign(b.vx || 1) * 0.3);
    this.ball.visible = b.y > FIELD.bottom;
    this.ballShadow.position.copy(w(b.x + 0.12, b.y - 0.1, 0.012));
    this.ballShadow.visible = this.ball.visible;

    FLIPPERS.forEach((def, i) => {
      const a = s.flippers[i].angle;
      this.flippers[i].rotation.y = def.side === -1 ? a : -a;
    });

    BUMPERS.forEach((_, i) => {
      const f = s.bumperFlash[i];
      const base = new THREE.Color(BUMPER_COLORS[i]);
      this.bumperCaps[i].emissive.copy(base);
      this.bumperCaps[i].emissiveIntensity = 0.35 + f * 3.2;
      const halo = this.bumperHalos[i];
      (halo.material as THREE.MeshBasicMaterial).opacity = 0.18 + f * 0.82;
      halo.scale.setScalar(1 + f * 0.6);
      this.bumperBodies[i].position.y = -f * 0.08;
    });

    s.slingFlash.forEach((f, i) => {
      this.slingMats[i].emissiveIntensity = 0.5 + f * 4;
    });

    const pulse = reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(time * 6);
    LANES.forEach((_, i) => {
      const lit = s.laneLit[i] || s.laneFlash > 0;
      this.laneMats[i].emissiveIntensity = lit ? 2.6 : 0.12 + pulse * 0.15;
      (this.laneHalos[i].material as THREE.MeshBasicMaterial).opacity = lit ? 0.75 : 0;
    });
    this.arrowMats.forEach((m, i) => {
      const chase = reducedMotion ? 0.6 : 0.35 + 0.65 * Math.max(0, Math.sin(time * 5 - i * 0.9));
      m.opacity = chase;
    });

    const pull = s.plunger.charge * PLUNGER.travel;
    this.plungerRod.position.z = this.plungerBaseZ + pull;

    for (const p of this.particles) {
      if (p.life <= 0) continue;
      p.life -= dt * 2.4;
      if (p.life <= 0 || reducedMotion) {
        p.life = 0;
        p.mesh.visible = false;
        continue;
      }
      p.vy -= 18 * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y = Math.max(0.05, p.mesh.position.y + p.vy * dt);
      p.mesh.position.z += p.vz * dt;
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = p.life;
      p.mesh.scale.setScalar(0.5 + p.life);
    }
  }

  private addLights(): void {
    this.scene.add(new THREE.HemisphereLight('#8fa2ff', '#1a0f24', 0.9));
    const key = new THREE.DirectionalLight('#fff3e0', 2.2);
    key.position.set(-4, 16, 6);
    key.target.position.set(0, 0, -1);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -7;
    key.shadow.camera.right = 7;
    key.shadow.camera.top = 12;
    key.shadow.camera.bottom = -12;
    key.shadow.camera.near = 2;
    key.shadow.camera.far = 40;
    key.shadow.bias = -0.0008;
    this.scene.add(key, key.target);
    const rim = new THREE.PointLight('#ff4fd8', 18, 14, 1.6);
    rim.position.copy(w(-3.5, 6.5, 2.5));
    const rim2 = new THREE.PointLight('#30d5ff', 18, 14, 1.6);
    rim2.position.copy(w(3.5, -3, 2.5));
    this.scene.add(rim, rim2);
  }

  private addCabinet(): void {
    const width = TABLE.maxX - TABLE.minX;
    const depth = TABLE.maxY - TABLE.minY;
    const cx = (TABLE.minX + TABLE.maxX) / 2;
    const cy = (TABLE.minY + TABLE.maxY) / 2;

    const tex = this.makePlayfieldTexture();
    const field = new THREE.Mesh(
      new THREE.PlaneGeometry(width, depth),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.38, metalness: 0.05, envMapIntensity: 0.6 }),
    );
    field.rotation.x = -Math.PI / 2;
    field.position.copy(w(cx, cy, 0));
    field.receiveShadow = true;
    this.scene.add(field);

    // Cabinet body and side rails (dark lacquer with chrome trim).
    const bodyMat = new THREE.MeshStandardMaterial({ color: '#1a1030', roughness: 0.45, metalness: 0.2 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(width + 1.0, 1.2, depth + 1.0), bodyMat);
    body.position.copy(w(cx, cy, -0.62));
    body.receiveShadow = true;
    this.scene.add(body);

    const railMat = new THREE.MeshStandardMaterial({ color: '#2b1a4d', roughness: 0.3, metalness: 0.4 });
    const trimMat = new THREE.MeshStandardMaterial({ color: '#d6dbe6', roughness: 0.18, metalness: 1 });
    const sideGeo = new THREE.BoxGeometry(0.5, 0.75, depth + 1.0);
    const endGeo = new THREE.BoxGeometry(width + 1.0, 0.75, 0.5);
    const parts: [THREE.BufferGeometry, THREE.Vector3][] = [
      [sideGeo, w(TABLE.minX - 0.25, cy, 0.1)],
      [sideGeo, w(TABLE.maxX + 0.25, cy, 0.1)],
      [endGeo, w(cx, TABLE.maxY + 0.25, 0.1)],
      [endGeo, w(cx, TABLE.minY - 0.25, 0.1)],
    ];
    for (const [g, p] of parts) {
      const m = new THREE.Mesh(g, railMat);
      m.position.copy(p);
      m.castShadow = true;
      m.receiveShadow = true;
      this.scene.add(m);
    }
    const trimSide = new THREE.BoxGeometry(0.08, 0.08, depth + 1.0);
    const trimEnd = new THREE.BoxGeometry(width + 1.0, 0.08, 0.08);
    const trims: [THREE.BufferGeometry, THREE.Vector3][] = [
      [trimSide, w(TABLE.minX - 0.02, cy, 0.5)],
      [trimSide, w(TABLE.maxX + 0.02, cy, 0.5)],
      [trimEnd, w(cx, TABLE.maxY + 0.02, 0.5)],
      [trimEnd, w(cx, TABLE.minY - 0.02, 0.5)],
    ];
    for (const [g, p] of trims) {
      const m = new THREE.Mesh(g, trimMat);
      m.position.copy(p);
      this.scene.add(m);
    }

    // Apron below the flippers.
    const apronShape = new THREE.Shape();
    apronShape.moveTo(TABLE.minX, TABLE.minY);
    apronShape.lineTo(FIELD.laneWall, TABLE.minY);
    apronShape.lineTo(FIELD.laneWall, -9.6);
    apronShape.lineTo(1.4, -9.6);
    apronShape.lineTo(0.9, -10.3);
    apronShape.lineTo(-0.9, -10.3);
    apronShape.lineTo(-1.4, -9.6);
    apronShape.lineTo(TABLE.minX, -9.6);
    apronShape.closePath();
    const apronGeo = new THREE.ExtrudeGeometry(apronShape, { depth: 0.18, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2 });
    apronGeo.rotateX(-Math.PI / 2);
    const apron = new THREE.Mesh(apronGeo, new THREE.MeshStandardMaterial({ color: '#241544', roughness: 0.35, metalness: 0.3 }));
    apron.receiveShadow = true;
    this.scene.add(apron);
    const drainGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.8, 0.7),
      new THREE.MeshBasicMaterial({ color: '#ff2a6d', transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    drainGlow.rotation.x = -Math.PI / 2;
    drainGlow.position.copy(w(0, -10.0, 0.02));
    this.scene.add(drainGlow);
  }

  private addRails(): void {
    const geos: THREE.BufferGeometry[] = [];
    const postGeos: THREE.BufferGeometry[] = [];
    for (const g of SEGMENTS) {
      if (!g.visible || g.kind === 'sling') continue;
      const a = w(g.ax, g.ay);
      const b = w(g.bx, g.by);
      const len = a.distanceTo(b);
      const isPost = g.kind === 'post';
      const h = isPost ? 0.3 : RAIL_H;
      const box = new THREE.BoxGeometry(len, h, g.r * 2);
      box.rotateY(Math.atan2(g.by - g.ay, g.bx - g.ax));
      box.translate((a.x + b.x) / 2, h / 2, (a.z + b.z) / 2);
      (isPost ? postGeos : geos).push(box);
      for (const p of [a, b]) {
        const cyl = new THREE.CylinderGeometry(g.r, g.r, h, 12);
        cyl.translate(p.x, h / 2, p.z);
        (isPost ? postGeos : geos).push(cyl);
      }
    }
    const railMat = new THREE.MeshStandardMaterial({ color: '#c9d0dc', metalness: 1, roughness: 0.22 });
    const rails = new THREE.Mesh(mergeGeometries(geos.map((g) => g.toNonIndexed())), railMat);
    rails.castShadow = true;
    rails.receiveShadow = true;
    this.scene.add(rails);
    const postMat = new THREE.MeshStandardMaterial({ color: '#ffd04d', emissive: '#ff9d00', emissiveIntensity: 0.4, roughness: 0.35 });
    const posts = new THREE.Mesh(mergeGeometries(postGeos.map((g) => g.toNonIndexed())), postMat);
    posts.castShadow = true;
    this.scene.add(posts);
    // Neon tube along the top arc.
    const arcCurve = new THREE.CatmullRomCurve3(
      Array.from({ length: 33 }, (_, i) => {
        const t = Math.PI - (Math.PI * i) / 32;
        return w(ARC.cx + Math.cos(t) * (ARC.r + 0.02), ARC.cy + Math.sin(t) * (ARC.r + 0.02), RAIL_H + 0.04);
      }),
    );
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(arcCurve, 96, 0.05, 6),
      new THREE.MeshStandardMaterial({ color: '#7a4dff', emissive: '#8a5cff', emissiveIntensity: 2.2 }),
    );
    this.scene.add(tube);
  }

  private addSlings(): void {
    SLINGS.forEach((tri) => {
      const shape = new THREE.Shape(tri.map(([x, y]) => new THREE.Vector2(x, y)));
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.36, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.04, bevelSegments: 2 });
      geo.rotateX(-Math.PI / 2);
      const body = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#f2f0ff', roughness: 0.3, metalness: 0.05 }));
      body.castShadow = true;
      body.receiveShadow = true;
      this.scene.add(body);
      const mat = new THREE.MeshStandardMaterial({ color: '#1b0d24', emissive: '#ff2fa8', emissiveIntensity: 0.6, roughness: 0.6 });
      this.slingMats.push(mat);
      const a = w(tri[0][0], tri[0][1]);
      const c = w(tri[2][0], tri[2][1]);
      const len = a.distanceTo(c);
      const band = new THREE.Mesh(new THREE.BoxGeometry(len, 0.3, 0.12), mat);
      band.position.set((a.x + c.x) / 2, 0.2, (a.z + c.z) / 2);
      band.rotation.y = Math.atan2(tri[2][1] - tri[0][1], tri[2][0] - tri[0][0]);
      // Offset the band onto the kick face (toward the table center).
      const nx = tri[0][0] < 0 ? 1 : -1;
      band.position.x += nx * 0.06;
      band.position.z -= 0.03;
      this.scene.add(band);
    });
  }

  private addBumpers(): void {
    const haloTex = this.radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)');
    BUMPERS.forEach((def, i) => {
      const group = new THREE.Group();
      const color = BUMPER_COLORS[i];
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(def.r + 0.08, def.r + 0.12, 0.08, 32),
        new THREE.MeshStandardMaterial({ color: '#d7dbe5', metalness: 1, roughness: 0.25 }),
      );
      base.position.y = 0.04;
      const bodyGroup = new THREE.Group();
      const skirt = new THREE.Mesh(
        new THREE.CylinderGeometry(def.r, def.r, 0.34, 32),
        new THREE.MeshStandardMaterial({ color: '#141022', roughness: 0.4, metalness: 0.3 }),
      );
      skirt.position.y = 0.25;
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(def.r + 0.02, 0.04, 8, 32),
        new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 1, roughness: 0.15 }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.42;
      const capMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.4, roughness: 0.25, metalness: 0.05 });
      this.bumperCaps.push(capMat);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(def.r * 0.86, def.r * 0.95, 0.22, 32), capMat);
      cap.position.y = 0.53;
      const star = new THREE.Mesh(
        new THREE.CircleGeometry(def.r * 0.42, 5),
        new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85 }),
      );
      star.rotation.x = -Math.PI / 2;
      star.position.y = 0.645;
      bodyGroup.add(skirt, ring, cap, star);
      skirt.castShadow = true;
      cap.castShadow = true;
      this.bumperBodies.push(bodyGroup);
      const halo = new THREE.Mesh(
        new THREE.PlaneGeometry(def.r * 4.2, def.r * 4.2),
        new THREE.MeshBasicMaterial({ map: haloTex, color, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      halo.rotation.x = -Math.PI / 2;
      halo.position.y = 0.02;
      this.bumperHalos.push(halo);
      group.add(base, bodyGroup, halo);
      group.position.copy(w(def.x, def.y));
      this.scene.add(group);
    });
  }

  private addLanes(): void {
    const haloTex = this.radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)');
    LANES.forEach((lane) => {
      const mat = new THREE.MeshStandardMaterial({ color: '#2a1d10', emissive: '#ffb020', emissiveIntensity: 0.2, roughness: 0.3 });
      this.laneMats.push(mat);
      const insert = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.02, 24), mat);
      insert.position.copy(w(lane.x, lane.y - 0.15, 0.01));
      const halo = new THREE.Mesh(
        new THREE.PlaneGeometry(1.2, 1.2),
        new THREE.MeshBasicMaterial({ map: haloTex, color: '#ffb020', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      halo.rotation.x = -Math.PI / 2;
      halo.position.copy(w(lane.x, lane.y - 0.15, 0.03));
      this.laneHalos.push(halo);
      this.scene.add(insert, halo);
    });
    // Chase arrows pointing from the flippers up to the bumpers.
    const arrowShape = new THREE.Shape();
    arrowShape.moveTo(0, 0.32);
    arrowShape.lineTo(0.26, -0.05);
    arrowShape.lineTo(0.1, -0.05);
    arrowShape.lineTo(0.1, -0.3);
    arrowShape.lineTo(-0.1, -0.3);
    arrowShape.lineTo(-0.1, -0.05);
    arrowShape.lineTo(-0.26, -0.05);
    arrowShape.closePath();
    const arrowGeo = new THREE.ShapeGeometry(arrowShape);
    arrowGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 4; i += 1) {
      const mat = new THREE.MeshBasicMaterial({ color: '#29e6ff', transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
      this.arrowMats.push(mat);
      const arrow = new THREE.Mesh(arrowGeo, mat);
      arrow.position.copy(w(0, -4.6 + i * 0.85, 0.015));
      this.scene.add(arrow);
    }
  }

  private addFlipper(def: FlipperDef): THREE.Group {
    const shape = new THREE.Shape();
    const { len, r0, r1 } = def;
    // Tapered capsule from the pivot (origin) along +x.
    const alpha = Math.asin((r0 - r1) / len);
    shape.absarc(0, 0, r0, Math.PI / 2 - alpha, -Math.PI / 2 + alpha, false);
    shape.absarc(len, 0, r1, -Math.PI / 2 + alpha, Math.PI / 2 - alpha, false);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2, curveSegments: 16 });
    geo.rotateX(-Math.PI / 2);
    if (def.side === 1) geo.scale(-1, 1, 1);
    geo.computeVertexNormals();
    const body = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#fbfbff', roughness: 0.28, metalness: 0.05, side: THREE.DoubleSide }));
    body.position.y = 0.04;
    body.castShadow = true;
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(len * 0.82, 0.06, 0.1),
      new THREE.MeshStandardMaterial({ color: '#ff2a6d', emissive: '#ff2a6d', emissiveIntensity: 0.9, roughness: 0.5 }),
    );
    stripe.position.set((def.side === -1 ? 1 : -1) * len * 0.47, 0.38, 0);
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.11, 0.08, 16),
      new THREE.MeshStandardMaterial({ color: '#c9d0dc', metalness: 1, roughness: 0.2 }),
    );
    cap.position.y = 0.4;
    const group = new THREE.Group();
    group.add(body, stripe, cap);
    group.position.copy(w(def.px, def.py));
    this.scene.add(group);
    return group;
  }

  private addPlunger(): THREE.Group {
    const group = new THREE.Group();
    const chrome = new THREE.MeshStandardMaterial({ color: '#d6dbe6', metalness: 1, roughness: 0.2 });
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.16, 20), new THREE.MeshStandardMaterial({ color: '#ff2a6d', roughness: 0.5 }));
    tip.rotation.x = Math.PI / 2;
    tip.position.set(0, 0.25, 0.08);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.6, 12), chrome);
    rod.rotation.x = Math.PI / 2;
    rod.position.set(0, 0.25, 0.9);
    const spring = new THREE.Mesh(new THREE.TorusKnotGeometry(0.13, 0.025, 64, 6, 1, 9), chrome);
    spring.scale.set(1, 1, 2.2);
    spring.position.set(0, 0.25, 0.7);
    group.add(tip, rod, spring);
    const start = w(PLUNGER.x, PLUNGER.restY);
    group.position.set(start.x, 0, start.z);
    this.plungerBaseZ = start.z;
    this.scene.add(group);
    return group;
  }

  private radialTexture(inner: string, outer: string): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, inner);
    grad.addColorStop(1, outer);
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  private makeBackground(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 256;
    const g = c.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#120a24');
    grad.addColorStop(0.6, '#07050f');
    grad.addColorStop(1, '#030207');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  private makePlayfieldTexture(): THREE.CanvasTexture {
    const ppu = 96;
    const W = Math.round((TABLE.maxX - TABLE.minX) * ppu);
    const H = Math.round((TABLE.maxY - TABLE.minY) * ppu);
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d')!;
    const X = (x: number) => (x - TABLE.minX) * ppu;
    const Y = (y: number) => (TABLE.maxY - y) * ppu;

    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#2a0f4f');
    bg.addColorStop(0.45, '#170b3a');
    bg.addColorStop(1, '#0b0820');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);

    // Fine grid.
    g.strokeStyle = 'rgba(120, 90, 255, 0.10)';
    g.lineWidth = 2;
    for (let x = Math.ceil(TABLE.minX); x <= TABLE.maxX; x += 0.5) {
      g.beginPath();
      g.moveTo(X(x), 0);
      g.lineTo(X(x), H);
      g.stroke();
    }
    for (let y = Math.ceil(TABLE.minY); y <= TABLE.maxY; y += 0.5) {
      g.beginPath();
      g.moveTo(0, Y(y));
      g.lineTo(W, Y(y));
      g.stroke();
    }

    // Orbit rings around the bumper cluster.
    const cx = X(0);
    const cy = Y(3.4);
    for (let i = 0; i < 6; i += 1) {
      g.strokeStyle = `rgba(${i % 2 ? '41,230,255' : '255,61,154'}, ${0.28 - i * 0.035})`;
      g.lineWidth = 6 - i * 0.6;
      g.beginPath();
      g.ellipse(cx, cy, (2.3 + i * 0.45) * ppu, (2.0 + i * 0.4) * ppu, 0, 0, Math.PI * 2);
      g.stroke();
    }
    const glow = g.createRadialGradient(cx, cy, 0, cx, cy, 3.2 * ppu);
    glow.addColorStop(0, 'rgba(255, 80, 200, 0.28)');
    glow.addColorStop(1, 'rgba(255, 80, 200, 0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, W, H);

    // Shooter lane.
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(X(FIELD.laneWall), Y(4.4), X(FIELD.outerRight) - X(FIELD.laneWall), Y(-10.8) - Y(4.4));
    g.fillStyle = 'rgba(41,230,255,0.35)';
    for (let y = -7.5; y < 3.5; y += 1.2) {
      g.beginPath();
      g.moveTo(X(PLUNGER.x), Y(y + 0.45));
      g.lineTo(X(PLUNGER.x + 0.25), Y(y));
      g.lineTo(X(PLUNGER.x - 0.25), Y(y));
      g.closePath();
      g.fill();
    }

    // Logo between the slingshots.
    g.save();
    g.translate(X(0), Y(-1.2));
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `900 ${0.95 * ppu}px "Avenir Next", "Segoe UI", Arial, sans-serif`;
    g.shadowColor = '#ff3d9a';
    g.shadowBlur = 30;
    g.fillStyle = '#ffe7f6';
    g.fillText('NEON', 0, -0.55 * ppu);
    g.shadowColor = '#29e6ff';
    g.fillStyle = '#e4fbff';
    g.fillText('ORBIT', 0, 0.45 * ppu);
    g.restore();

    // Lane labels.
    g.font = `800 ${0.32 * ppu}px "Avenir Next", Arial, sans-serif`;
    g.textAlign = 'center';
    g.fillStyle = 'rgba(255, 200, 80, 0.8)';
    ['O', 'R', 'B'].forEach((l, i) => g.fillText(l, X(LANES[i].x), Y(LANES[i].y + 0.45)));

    // Inlane chevrons.
    g.strokeStyle = 'rgba(255, 194, 61, 0.55)';
    g.lineWidth = 5;
    for (const side of [-1, 1]) {
      for (let k = 0; k < 3; k += 1) {
        const x = side * 4.0;
        const y = -4.4 - k * 0.55;
        g.beginPath();
        g.moveTo(X(x - 0.22), Y(y + 0.18));
        g.lineTo(X(x), Y(y - 0.05));
        g.lineTo(X(x + 0.22), Y(y + 0.18));
        g.stroke();
      }
    }

    // Shoot again insert above the drain.
    g.fillStyle = 'rgba(255, 42, 109, 0.75)';
    g.font = `800 ${0.24 * ppu}px "Avenir Next", Arial, sans-serif`;
    g.fillText('SHOOT AGAIN', X(0), Y(-8.7));

    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }
}
