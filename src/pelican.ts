import * as THREE from 'three';
import type { ActPose, Side } from './motion';
import { DynamicSurface, DynamicTube, featherGeometry, mergeInto, orientBone, solveTwoBone, surface } from './rig';

const ARM_L1 = 0.24;
const ARM_L2 = 0.29;
const LEG_L1 = 0.25;
const LEG_L2 = 0.25;

// Landmarks in pelvis space (origin on the saddle top).
const SHOULDER = new THREE.Vector3(0.14, 0.4, 0.12);
const HIP = new THREE.Vector3(0.085, 0.05, 0.0);
const NECK_BASE = new THREE.Vector3(0, 0.46, 0.1);
const HEAD_REST = new THREE.Vector3(0, 0.94, 0.0);

// Foot: origin at the ankle; the sole sits SOLE_Y below, the ball of the foot BALL_Z ahead.
const SOLE_Y = -0.03;
const BALL_Z = 0.035;

// Bill dimensions (head space, +z along the bill).
const BILL_Z0 = 0.05;
const BILL_L = 0.4;

function featherBumpTexture(): THREE.CanvasTexture {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d')!;
  g.fillStyle = '#808080';
  g.fillRect(0, 0, size, size);
  // Overlapping scallops, like rows of small contour feathers.
  const rows = 16;
  const cols = 12;
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols + 1; k++) {
      const x = ((k + (r % 2) * 0.5) / cols) * size;
      const y = (r / rows) * size;
      const grad = g.createRadialGradient(x, y, 1, x, y, size / cols);
      grad.addColorStop(0, '#9a9a9a');
      grad.addColorStop(0.8, '#868686');
      grad.addColorStop(1, '#5c5c5c');
      g.fillStyle = grad;
      g.beginPath();
      g.ellipse(x, y, size / cols / 1.6, size / rows / 0.9, 0, 0, Math.PI);
      g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export type PelicanProbe = {
  footError: number; // ankle IK miss, metres
  wristError: number; // wing IK miss, metres
};

type Wing = {
  side: Side;
  upper: THREE.Group;
  fore: THREE.Group;
  primaries: THREE.Group;
  elbow: THREE.Mesh;
};
type Leg = {
  side: Side;
  thigh: THREE.Group;
  shin: THREE.Group;
  foot: THREE.Group;
  knee: THREE.Mesh;
};

export class Pelican {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly head = new THREE.Group();
  private readonly neck = new DynamicTube(18, 16);
  private readonly pouch = new DynamicSurface(22, 14);
  private readonly wings: Wing[] = [];
  private readonly legs: Leg[] = [];
  private readonly eyelids: THREE.Mesh[] = [];
  private readonly tail = new THREE.Group();
  torso!: THREE.Mesh;

  readonly probe: PelicanProbe = { footError: 0, wristError: 0 };

  // Scratch.
  private readonly pelvis = new THREE.Matrix4();
  private readonly tmpA = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();
  private readonly tmpC = new THREE.Vector3();
  private readonly tmpD = new THREE.Vector3();
  private readonly tmpE = new THREE.Vector3();

  readonly mats: Record<string, THREE.Material>;

  constructor() {
    const bump = featherBumpTexture();
    bump.repeat.set(3, 3);
    const feather = new THREE.MeshStandardMaterial({
      color: '#f3efe6',
      roughness: 0.86,
      bumpMap: bump,
      bumpScale: 1.2,
    });
    const featherSmooth = new THREE.MeshStandardMaterial({ color: '#f1ede4', roughness: 0.8 });
    const flight = new THREE.MeshStandardMaterial({
      color: '#17171a',
      roughness: 0.55,
      side: THREE.DoubleSide,
    });
    const covert = new THREE.MeshStandardMaterial({ color: '#f0ece2', roughness: 0.85, side: THREE.DoubleSide });
    const bill = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.0 });
    const pouch = new THREE.MeshStandardMaterial({
      color: '#f9c66a',
      roughness: 0.48,
      side: THREE.DoubleSide,
      emissive: '#5a2a00',
      emissiveIntensity: 0.06,
    });
    const skin = new THREE.MeshStandardMaterial({ color: '#f39a3c', roughness: 0.55 });
    const leg = new THREE.MeshStandardMaterial({ color: '#f08a3a', roughness: 0.5 });
    const web = new THREE.MeshStandardMaterial({ color: '#ec7f34', roughness: 0.55, side: THREE.DoubleSide });
    const claw = new THREE.MeshStandardMaterial({ color: '#3a2a22', roughness: 0.4 });
    const iris = new THREE.MeshStandardMaterial({ color: '#f5ecc2', roughness: 0.2 });
    const pupil = new THREE.MeshStandardMaterial({ color: '#0b0b0b', roughness: 0.1 });
    this.mats = { feather, featherSmooth, flight, covert, bill, pouch, skin, leg, web, claw, iris, pupil };

    this.root.add(this.body, this.head);
    this.buildBody();
    this.buildHead();
    const neckMesh = new THREE.Mesh(this.neck.geometry, feather);
    neckMesh.castShadow = true;
    neckMesh.receiveShadow = true;
    neckMesh.frustumCulled = false;
    this.root.add(neckMesh);
    for (const side of [-1, 1] as Side[]) {
      this.wings.push(this.buildWing(side));
      this.legs.push(this.buildLeg(side));
    }
    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
  }

  private buildBody() {
    const { feather, covert } = this.mats;
    // Heavy pear-shaped torso: broad, deep-chested, bottom-heavy.
    const g = new THREE.SphereGeometry(1, 48, 36);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const low = 1 - y; // 0 top .. 2 bottom
      const rx = 0.19 * (0.86 + 0.16 * low);
      const rz = (z > 0 ? 0.235 : 0.2) * (0.86 + 0.12 * low);
      const chest = z > 0 ? 0.03 * Math.max(0, 1 - (y - 0.25) ** 2 * 3) : 0;
      p.setXYZ(i, x * rx, y * 0.31, z * rz + chest * z);
    }
    g.computeVertexNormals();
    const torso = new THREE.Mesh(g, feather);
    this.torso = torso;
    torso.position.set(0, 0.27, 0.01);
    torso.rotation.x = 0.12;
    this.body.add(torso);

    // Short tail fan behind the saddle.
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 8 - 0.5) * 1.1;
      const f = featherGeometry(0.16, 0.05);
      f.rotateY(Math.PI); // point backwards
      f.rotateX(-0.9);
      f.rotateY(a);
      parts.push(f);
    }
    const tail = new THREE.Mesh(mergeInto(parts), covert);
    this.tail.add(tail);
    this.tail.position.set(0, 0.08, -0.15);
    this.body.add(this.tail);

    // Feathered shoulders where the wings leave the body.
    for (const s of [-1, 1]) {
      const sh = new THREE.Mesh(new THREE.SphereGeometry(0.058, 20, 14), feather);
      sh.position.set(s * (SHOULDER.x - 0.005), SHOULDER.y, SHOULDER.z - 0.01);
      this.body.add(sh);
    }
  }

  private buildHead() {
    const { feather, bill, pouch, skin, iris, pupil, featherSmooth } = this.mats;
    const skull = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), feather);
    skull.scale.set(0.056, 0.06, 0.08);
    skull.position.set(0, 0.006, 0);
    this.head.add(skull);
    // A soft crest of nape feathers.
    const crest = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), feather);
    crest.scale.set(0.028, 0.03, 0.05);
    crest.position.set(0, 0.035, -0.04);
    crest.rotation.x = -0.5;
    this.head.add(crest);

    for (const s of [-1, 1]) {
      // Bare orange facial skin around the eye, running into the bill base.
      const face = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), skin);
      face.scale.set(0.012, 0.022, 0.04);
      face.position.set(s * 0.041, 0.006, 0.04);
      this.head.add(face);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.0115, 16, 12), iris);
      eye.position.set(s * 0.046, 0.012, 0.032);
      this.head.add(eye);
      const pu = new THREE.Mesh(new THREE.SphereGeometry(0.0062, 12, 8), pupil);
      pu.position.set(s * 0.0545, 0.012, 0.0335);
      this.head.add(pu);
      const lid = new THREE.Mesh(new THREE.SphereGeometry(0.0135, 16, 10), featherSmooth);
      lid.position.copy(eye.position);
      lid.visible = false;
      this.eyelids.push(lid);
      this.head.add(lid);
    }

    // Upper mandible: long, flat, slightly spatulate, ending in a hooked nail.
    const colBase = new THREE.Color('#efa07c');
    const colMid = new THREE.Color('#f6b84e');
    const colNail = new THREE.Color('#d24a26');
    const colTmp = new THREE.Color();
    const billGeo = surface(40, 20, (u, vv, o) => {
      const ang = vv * Math.PI * 2;
      let w = 0.025 * (1 - 0.34 * u) + 0.004 * Math.sin(Math.PI * u);
      let h = 0.021 * Math.pow(1 - u, 1.3) + 0.0065;
      if (u > 0.9) {
        const k = Math.sqrt(Math.max(0, 1 - ((u - 0.9) / 0.1) ** 2));
        w *= 0.35 + 0.65 * k;
        h *= 0.5 + 0.5 * k;
        if (u > 0.995) w = h = 0.0005;
      }
      const yc = billCenterY(u);
      const sa = Math.sin(ang);
      const ridge = 0.0025 * Math.exp(-((Math.cos(ang) * 6) ** 2)) * (sa > 0 ? 1 : 0);
      o.set(Math.cos(ang) * w, yc + (sa > 0 ? h * sa + ridge : 0.22 * h * sa), BILL_Z0 + u * BILL_L);
    });
    const colors = new Float32Array(billGeo.attributes.position.count * 3);
    for (let i = 0; i < billGeo.attributes.position.count; i++) {
      const u = (billGeo.attributes.position.getZ(i) - BILL_Z0) / BILL_L;
      if (u < 0.3) colTmp.copy(colBase).lerp(colMid, u / 0.3);
      else if (u < 0.88) colTmp.copy(colMid);
      else colTmp.copy(colMid).lerp(colNail, Math.min(1, (u - 0.88) / 0.05));
      colors.set([colTmp.r, colTmp.g, colTmp.b], i * 3);
    }
    billGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.head.add(new THREE.Mesh(billGeo, bill));

    // Lower mandible rami: thin rods along the top edges of the pouch.
    for (const s of [-1, 1]) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 16; i++) {
        const ub = i / 16 * 0.985;
        pts.push(new THREE.Vector3(s * pouchRimWidth(ub) * 0.97, rimY(ub), BILL_Z0 + ub * BILL_L));
      }
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.0042, 6), skin);
      this.head.add(tube);
    }

    const pouchMesh = new THREE.Mesh(this.pouch.geometry, pouch);
    pouchMesh.frustumCulled = false;
    this.head.add(pouchMesh);
  }

  private buildWing(side: Side): Wing {
    const { feather, flight, covert } = this.mats;
    const upper = new THREE.Group();
    const fore = new THREE.Group();
    const primaries = new THREE.Group();
    // Bone groups: +Y along the bone, +Z toward the trailing edge (feathers hang along +Z).
    // Coverts: smooth flattened spindles, deepest toward the trailing edge.
    const upperCovert = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), feather);
    upperCovert.scale.set(0.03, ARM_L1 / 2 + 0.03, 0.075);
    upperCovert.position.set(0, ARM_L1 / 2, 0.035);
    upper.add(upperCovert);
    // Tertials hanging off the upper arm.
    const ter: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 5; i++) {
      const f = featherGeometry(0.13, 0.05);
      f.rotateX(-0.35);
      f.translate(0, 0.03 + i * 0.035, 0.03);
      ter.push(f);
    }
    upper.add(new THREE.Mesh(mergeInto(ter), covert));

    const foreCovert = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), feather);
    foreCovert.scale.set(0.026, ARM_L2 / 2 + 0.025, 0.065);
    foreCovert.position.set(0, ARM_L2 / 2, 0.03);
    fore.add(foreCovert);
    // Black secondaries along the forearm's trailing edge, white coverts over their bases.
    const sec: THREE.BufferGeometry[] = [];
    const cov: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 8; i++) {
      const y = 0.015 + (i / 7) * (ARM_L2 - 0.03);
      const f = featherGeometry(0.26 - i * 0.006, 0.06, 0.02);
      f.rotateX(-0.42 + i * 0.03);
      f.translate(side * 0.002 * i, y, 0.03);
      sec.push(f);
      const c = featherGeometry(0.12, 0.05);
      c.rotateX(-0.3);
      c.translate(0.004, y + 0.006, 0.028);
      cov.push(c);
    }
    fore.add(new THREE.Mesh(mergeInto(sec), flight));
    fore.add(new THREE.Mesh(mergeInto(cov), covert));

    // Primaries fan from the wrist, sweeping back and down: the folded black wingtip.
    const pri: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 7; i++) {
      const f = featherGeometry(0.24 + i * 0.012, 0.045, 0.03);
      f.rotateX(-0.55 - i * 0.12);
      f.translate(-side * 0.003 * i, -0.01 - i * 0.006, 0.02);
      pri.push(f);
    }
    primaries.add(new THREE.Mesh(mergeInto(pri), flight));
    primaries.position.set(0, ARM_L2, 0);
    fore.add(primaries);

    // The wrist: a feathered "mitten" (with the alula as thumb) closing round the pin's neck.
    const wrist = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), feather);
    wrist.scale.set(0.8, 1.2, 1.2);
    wrist.position.set(0, ARM_L2 - 0.005, 0.005);
    fore.add(wrist);
    const alula = new THREE.Mesh(featherGeometry(0.06, 0.03, 0.03), covert);
    alula.rotation.x = Math.PI * 0.85;
    alula.position.set(0, ARM_L2, -0.02);
    fore.add(alula);

    const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), feather);
    this.root.add(upper, fore, elbow);
    return { side, upper, fore, primaries, elbow };
  }

  private buildLeg(side: Side): Leg {
    const { feather, leg, web, claw } = this.mats;
    const thigh = new THREE.Group();
    const shin = new THREE.Group();
    const foot = new THREE.Group();
    const thighGeo = new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.0, -0.03),
        new THREE.Vector2(0.05, -0.01),
        new THREE.Vector2(0.066, 0.06),
        new THREE.Vector2(0.058, 0.15),
        new THREE.Vector2(0.036, LEG_L1 - 0.02),
        new THREE.Vector2(0.02, LEG_L1 + 0.005),
        new THREE.Vector2(0.0, LEG_L1 + 0.01),
      ],
      18,
    );
    thigh.add(new THREE.Mesh(thighGeo, feather));
    const shinGeo = new THREE.CylinderGeometry(0.016, 0.019, LEG_L2, 12);
    shinGeo.translate(0, LEG_L2 / 2, 0);
    shin.add(new THREE.Mesh(shinGeo, leg));
    const ankle = new THREE.Mesh(new THREE.SphereGeometry(0.021, 12, 10), leg);
    ankle.position.set(0, LEG_L2, 0);
    shin.add(ankle);
    const knee = new THREE.Mesh(new THREE.SphereGeometry(0.03, 14, 10), feather);

    // Totipalmate foot: all four toes joined by webbing, splayed over the pedal.
    const inner = -side; // the hallux sits on the inside of the foot
    const tips = [
      new THREE.Vector2(inner * -0.058, 0.115), // outer toe
      new THREE.Vector2(inner * -0.012, 0.135), // middle toe
      new THREE.Vector2(inner * 0.035, 0.12), // inner toe
      new THREE.Vector2(inner * 0.058, 0.07), // hallux, turned forward and in
    ].sort((a, b) => a.x - b.x);
    const heel = new THREE.Vector2(0, -0.03);
    const shape = new THREE.Shape();
    shape.moveTo(heel.x, heel.y);
    shape.lineTo(tips[0].x, tips[0].y);
    for (let i = 1; i < tips.length; i++) {
      const a = tips[i - 1];
      const b = tips[i];
      // Scalloped web edge between toe tips.
      shape.quadraticCurveTo((a.x + b.x) / 2, (a.y + b.y) / 2 - 0.03, b.x, b.y);
    }
    shape.lineTo(heel.x, heel.y);
    const webGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.006, bevelEnabled: false, curveSegments: 6 });
    webGeo.rotateX(Math.PI / 2); // shape XY -> XZ, extrude downward
    webGeo.translate(0, SOLE_Y + 0.006, 0);
    foot.add(new THREE.Mesh(webGeo, web));
    for (const tip of tips) {
      const len = Math.hypot(tip.x - heel.x, tip.y - heel.y);
      const toe = new THREE.CapsuleGeometry(0.0075, len - 0.01, 4, 8);
      const toeMesh = new THREE.Mesh(toe, this.mats.leg);
      const dir = new THREE.Vector3(tip.x - heel.x, 0, tip.y - heel.y).normalize();
      toeMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      toeMesh.position.set((tip.x + heel.x) / 2, SOLE_Y + 0.009, (tip.y + heel.y) / 2);
      foot.add(toeMesh);
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.0055, 0.018, 6), claw);
      c.quaternion.copy(toeMesh.quaternion);
      c.position.set(tip.x + dir.x * 0.006, SOLE_Y + 0.007, tip.y + dir.z * 0.006);
      foot.add(c);
    }
    const heelPad = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 10), leg);
    heelPad.scale.set(1, 0.9, 1.2);
    heelPad.position.set(0, SOLE_Y + 0.016, 0.0);
    foot.add(heelPad);

    this.root.add(thigh, shin, foot, knee);
    return { side, thigh, shin, foot, knee };
  }

  /** World-space wrist (grip) points [right, left] from the posed bones. */
  wristPoints(): THREE.Vector3[] {
    return this.wings.map((w) => w.fore.localToWorld(new THREE.Vector3(0, ARM_L2, 0)));
  }

  /** World-space ball-of-foot points [right, left] from the posed bones. */
  footBallPoints(): THREE.Vector3[] {
    return this.legs.map((l) => l.foot.localToWorld(new THREE.Vector3(0, SOLE_Y, BALL_Z)));
  }

  /**
   * Pose everything for one instant.
   * @param pelvis pelvis frame in act space (saddle top, leaning with the unicycle)
   * @param pedals pedal-top centres in act space [right, left]
   */
  update(pose: ActPose, pelvis: THREE.Matrix4, pedals: [THREE.Vector3, THREE.Vector3]) {
    this.pelvis.copy(pelvis);
    this.body.matrixAutoUpdate = false;
    this.body.matrix.copy(pelvis);
    this.body.matrixWorldNeedsUpdate = true;

    const bodyUp = this.tmpA.set(0, 1, 0).transformDirection(pelvis);
    this.tail.rotation.x = 0.25 + pose.pitch * 3 + 0.08 * Math.sin(pose.t * 2.1);
    this.tail.rotation.y = -pose.bodyYaw * 2;

    // ---- Head: bird-like stabilisation (stays steadier than the body) and tracks the pins.
    const headFromBody = HEAD_REST.clone().applyMatrix4(pelvis);
    const steady = new THREE.Vector3(0, HEAD_REST.y + 0.62, HEAD_REST.z + 0.03);
    const headPos = headFromBody.lerp(steady, 0.55);
    const dip = pose.hands[0].catchKick + pose.hands[1].catchKick;
    headPos.y -= 0.01 * dip;
    headPos.z += 0.008 * dip;
    const look = pose.look;
    const yaw = THREE.MathUtils.clamp(Math.atan2(look.x - headPos.x, 0.9) * 1.3, -0.35, 0.35);
    // Bill held a little below level, tipping further to watch the pins rise and land.
    const pitchDown = 0.16 + THREE.MathUtils.clamp((headPos.y - look.y) * 0.25, 0, 0.2) + 0.05 * dip;
    this.head.position.copy(headPos);
    this.head.rotation.set(pitchDown, yaw, -yaw * 0.25 + pose.bodyRoll * 0.3, 'YXZ');
    this.head.updateMatrix();

    // Neck: S-curve from the chest to the back of the skull.
    const base = NECK_BASE.clone().applyMatrix4(pelvis);
    const joint = new THREE.Vector3(0, -0.03, -0.035).applyMatrix4(this.head.matrix);
    const headDown = new THREE.Vector3(0, -1, -0.35).transformDirection(this.head.matrix);
    const p1 = base.clone().addScaledVector(bodyUp, 0.2).add(new THREE.Vector3(0, 0, 0.07));
    const p2 = joint.clone().addScaledVector(headDown, 0.2);
    const fwd = new THREE.Vector3(0, 0, 1);
    this.neck.update(
      base,
      p1,
      p2,
      joint,
      (s) => {
        const r = 0.09 * (1 - s) + 0.052 * s - 0.01 * Math.sin(Math.PI * s);
        const throat = 0.012 * Math.max(0, (s - 0.6) / 0.4);
        return [r, r * 1.12 + throat];
      },
      fwd,
    );

    // Pouch: hangs from the lower mandible; jiggles after catches and with pedalling.
    const sagScale = 1 + pose.pouch.sag;
    const sway = pose.pouch.sway;
    this.pouch.update((us, vv, o) => {
      const ub = -0.22 + 1.2 * us;
      const ang = Math.PI * vv;
      const sag = Math.max(0.003, 0.15 * (1 - ((ub - 0.22) / 0.78) ** 2)) * sagScale;
      const w = pouchRimWidth(ub);
      const sa = Math.sin(ang);
      const bulge = 1 + 0.45 * sa * Math.min(1, sag / 0.11);
      const yTop = rimY(Math.max(ub, -0.05)) + (ub < -0.05 ? (ub + 0.05) * 0.25 : 0);
      o.set(
        w * Math.cos(ang) * bulge + sway * sag * sa,
        yTop - sag * Math.pow(sa, 0.85),
        BILL_Z0 + ub * BILL_L,
      );
    });

    for (const lid of this.eyelids) {
      lid.visible = pose.blink > 0.05;
      lid.scale.set(1, Math.max(0.05, pose.blink), 1);
    }

    // ---- Wings: two-bone IK from the shoulder to the pin grip.
    let wristErr = 0;
    for (const w of this.wings) {
      const hand = pose.hands[w.side === -1 ? 0 : 1];
      const shoulder = new THREE.Vector3(w.side * SHOULDER.x, SHOULDER.y, SHOULDER.z).applyMatrix4(pelvis);
      shoulder.y += 0.012 * hand.throwKick; // shoulder lifts into the throw
      const target = new THREE.Vector3(hand.pos.x, hand.pos.y, hand.pos.z);
      const pole = new THREE.Vector3(w.side * 1.0, -0.7, -0.6);
      const elbow = this.tmpB;
      const reached = this.tmpC;
      wristErr = Math.max(wristErr, solveTwoBone(shoulder, target, ARM_L1, ARM_L2, pole, elbow, reached));
      const hang = new THREE.Vector3(w.side * 0.25, -1, -0.5);
      orientBone(w.upper, shoulder, this.tmpD.subVectors(elbow, shoulder), hang);
      orientBone(w.fore, elbow, this.tmpE.subVectors(reached, elbow), hang);
      w.elbow.position.copy(elbow);
      w.primaries.rotation.x = -0.35 * hand.throwKick + 0.18 * hand.catchKick;
    }

    // ---- Legs: hip to ankle, ball of the webbed foot on the pedal.
    let footErr = 0;
    for (const l of this.legs) {
      const i = l.side === -1 ? 0 : 1;
      const hip = new THREE.Vector3(l.side * HIP.x, HIP.y, HIP.z).applyMatrix4(pelvis);
      const ankleAngle = pose.ankle[i];
      l.foot.rotation.set(ankleAngle, l.side * -0.1, 0, 'YXZ');
      l.foot.updateMatrix();
      // Ankle = pedal top minus the rotated sole-to-ankle offset.
      const ballLocal = new THREE.Vector3(0, SOLE_Y, BALL_Z).applyEuler(l.foot.rotation);
      const ankle = pedals[i].clone().sub(ballLocal);
      const pole = new THREE.Vector3(l.side * 0.25, 0.1, 1);
      const knee = this.tmpB;
      const reached = this.tmpC;
      footErr = Math.max(footErr, solveTwoBone(hip, ankle, LEG_L1, LEG_L2, pole, knee, reached));
      const legHint = new THREE.Vector3(l.side, 0, 0);
      orientBone(l.thigh, hip, this.tmpD.subVectors(knee, hip), legHint);
      orientBone(l.shin, knee, this.tmpE.subVectors(reached, knee), legHint);
      l.knee.position.copy(knee);
      l.foot.position.copy(reached);
    }
    this.probe.footError = footErr;
    this.probe.wristError = wristErr;
  }
}

function billCenterY(u: number) {
  return -0.006 - 0.01 * u - 0.012 * Math.max(0, (u - 0.9) / 0.1) ** 2;
}
function rimY(ub: number) {
  const u = THREE.MathUtils.clamp(ub, 0, 1);
  return billCenterY(u) - 0.0065 - (ub < 0 ? -ub * 0.06 : 0);
}
function pouchRimWidth(ub: number) {
  const u = THREE.MathUtils.clamp(ub, 0, 1);
  return 0.0165 + 0.0105 * (1 - u) + (ub < 0 ? -ub * 0.06 : 0) - (u > 0.95 ? (u - 0.95) * 0.2 : 0);
}
