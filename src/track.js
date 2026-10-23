import * as THREE from 'three';
import { waveHeight } from './waves.js';

// ---------------------------------------------------------------------------
// Race course: a closed loop of buoy gates out on the open water, with
// floating kicker ramps on the straights. Everything bobs on the same swell
// the ski rides, so the course feels like part of the sea.
// ---------------------------------------------------------------------------

// Control points (x, z) of the centerline. Starts at the start/finish line,
// heading +z (the direction the ski spawns facing). Looking down the start
// straight, -x is to the right, so most of the loop turns right.
const CONTROL = [
  [0, 30], [0, 150], [0, 245], [-8, 290], [-28, 318], [-55, 322], [-72, 300], [-68, 262],
  [-110, 215], [-150, 150], [-200, 100], [-290, 40], [-345, -40], [-355, -150], [-330, -250],
  [-270, -295], [-200, -285], [-165, -235], [-125, -220], [-90, -262], [-35, -268], [5, -205],
  [5, -120], [0, -60],
];

export const TRACK_ID = 'bay1';
const STEP = 2; // centerline sample spacing (m)
export const GATE_HALF = 10; // half the gate opening (m)
const GATE_MAX_GAP = 95;

// ramps: distance along the track (m), lateral offset (m, + = right)
const RAMPS = [
  { s: 75, off: 0 },
  { s: 560, off: 2 },
  { s: 880, off: -2 },
  { s: 1585, off: 0 },
];
export const RAMP_L = 14;
export const RAMP_W = 8;
export const RAMP_H = 3.2;
const RAMP_SINK = 0.8; // how deep the ramp's skirt goes below its base
// deck profile: gentle entry, steepening kicker (end slope ~0.4)
export const rampProfile = (u) => RAMP_H * (0.25 * u + 0.75 * u * u);

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** Pure geometry of the course (no three.js scene objects). */
export function buildLayout() {
  const curve = new THREE.CatmullRomCurve3(CONTROL.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');
  curve.arcLengthDivisions = 4000;
  const length = curve.getLength();
  const n = Math.round(length / STEP);
  const step = length / n;
  const pts = curve.getSpacedPoints(n).slice(0, n);
  const px = new Float32Array(n), pz = new Float32Array(n), tx = new Float32Array(n), tz = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    px[i] = pts[i].x;
    pz[i] = pts[i].z;
  }
  for (let i = 0; i < n; i++) {
    const a = (i - 1 + n) % n, b = (i + 1) % n;
    const dx = px[b] - px[a], dz = pz[b] - pz[a];
    const l = Math.hypot(dx, dz);
    tx[i] = dx / l;
    tz[i] = dz / l;
  }
  // signed curvature (1/m), + = turning left (heading increases)
  const curv = new Float32Array(n);
  const K = 6;
  for (let i = 0; i < n; i++) {
    const a = (i - K + n) % n, b = (i + K) % n;
    const d = wrap(Math.atan2(tx[b], tz[b]) - Math.atan2(tx[a], tz[a]));
    curv[i] = d / (2 * K * step);
  }

  const at = (s) => {
    const i = ((Math.round(s / step) % n) + n) % n;
    return { i, x: px[i], z: pz[i], tx: tx[i], tz: tz[i], rx: -tz[i], rz: tx[i] };
  };

  // ---- gates: one at the start, one at every real corner apex, then fill the gaps ----
  const rampZones = RAMPS.map((r) => [r.s - 30, r.s + 12]);
  const inRampZone = (s) => rampZones.some(([a, b]) => s > a && s < b);
  const peaks = [];
  for (let i = 0; i < n; i++) {
    const k = Math.abs(curv[i]);
    if (k < 1 / 140) continue;
    let isMax = true;
    for (let j = -12; j <= 12 && isMax; j++) if (j && Math.abs(curv[(i + j + n) % n]) > k) isMax = false;
    if (isMax) peaks.push({ s: i * step, k });
  }
  peaks.sort((a, b) => b.k - a.k);
  const gateS = [0];
  for (const p of peaks) {
    if (inRampZone(p.s)) continue;
    if (gateS.every((g) => Math.min(Math.abs(g - p.s), length - Math.abs(g - p.s)) > 45)) gateS.push(p.s);
  }
  gateS.sort((a, b) => a - b);
  const filled = [];
  for (let i = 0; i < gateS.length; i++) {
    const a = gateS[i];
    const b = i + 1 < gateS.length ? gateS[i + 1] : length;
    filled.push(a);
    const gap = b - a;
    const extra = Math.ceil(gap / GATE_MAX_GAP) - 1;
    for (let k = 1; k <= extra; k++) {
      let s = a + (gap * k) / (extra + 1);
      // keep gates off the ramps (put them just past the take-off instead)
      for (const [za, zb] of rampZones) if (s > za && s < zb) s = zb + 4;
      filled.push(s);
    }
  }
  const gates = filled.map((s, idx) => ({ idx, s, ...at(s), half: GATE_HALF }));

  const ramps = RAMPS.map((r) => {
    const p = at(r.s);
    return { s: r.s, cx: p.x + p.rx * r.off, cz: p.z + p.rz * r.off, fx: p.tx, fz: p.tz, rx: p.rx, rz: p.rz, baseT: NaN, base: 0 };
  });

  // outside-of-corner marker buoys
  const markers = [];
  let lastMarker = -1e9;
  for (let i = 0; i < n; i++) {
    const s = i * step;
    if (Math.abs(curv[i]) < 1 / 110 || s - lastMarker < 13) continue;
    if (gates.some((g) => Math.abs(g.s - s) < 5)) continue;
    lastMarker = s;
    const side = curv[i] > 0 ? 1 : -1; // turning left -> outside is right (+right)
    const off = GATE_HALF + 3;
    markers.push({ x: px[i] - tz[i] * off * side, z: pz[i] + tx[i] * off * side });
  }

  return { length, n, step, px, pz, tx, tz, curv, at, gates, ramps, markers };
}

// ------------------------------- ramps ----------------------------------------

/**
 * Base height of a floating ramp: it rides the swell with its nose tucked under
 * the water, so the deck always rises smoothly out of the sea (no step to trip on).
 */
function rampBase(r, t) {
  if (r.baseT !== t) {
    const h = RAMP_L * 0.5;
    const w0 = waveHeight(r.cx - r.fx * h, r.cz - r.fz * h, t);
    const w1 = waveHeight(r.cx - r.fx * h * 0.5, r.cz - r.fz * h * 0.5, t);
    const w2 = waveHeight(r.cx, r.cz, t);
    r.base = Math.min(w0, w1, w2) - 0.45;
    r.baseT = t;
  }
  return r.base;
}

/** Local coordinates on a ramp: u = 0 (entry) .. 1 (lip), v = lateral (m). */
function rampLocal(r, x, z) {
  const dx = x - r.cx, dz = z - r.cz;
  return { u: (dx * r.fx + dz * r.fz) / RAMP_L + 0.5, v: dx * r.rx + dz * r.rz };
}

// ------------------------------- visuals --------------------------------------

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function rampGeometry() {
  const segs = 16;
  // deck
  const deck = new THREE.PlaneGeometry(RAMP_W, RAMP_L, 1, segs);
  deck.rotateX(-Math.PI / 2); // faces +y, local z runs -L/2 (entry) .. +L/2 (lip)
  const p = deck.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getZ(i) / RAMP_L + 0.5;
    p.setY(i, rampProfile(u));
  }
  deck.computeVertexNormals();
  // skirts: both sides and the back
  const pos = [];
  const quad = (a, b, c, d) => pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  for (const sx of [-1, 1]) {
    const x = (sx * RAMP_W) / 2;
    for (let k = 0; k < segs; k++) {
      const u0 = k / segs, u1 = (k + 1) / segs;
      const z0 = (u0 - 0.5) * RAMP_L, z1 = (u1 - 0.5) * RAMP_L;
      quad([x, -RAMP_SINK, z0], [x, -RAMP_SINK, z1], [x, rampProfile(u1), z1], [x, rampProfile(u0), z0]);
    }
  }
  const zb = RAMP_L / 2;
  quad([-RAMP_W / 2, -RAMP_SINK, zb], [RAMP_W / 2, -RAMP_SINK, zb], [RAMP_W / 2, RAMP_H, zb], [-RAMP_W / 2, RAMP_H, zb]);
  const skirt = new THREE.BufferGeometry();
  skirt.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  skirt.computeVertexNormals();
  return { deck, skirt };
}

export class Track {
  constructor() {
    const L = (this.layout = buildLayout());
    this.group = new THREE.Group();
    this.gates = L.gates;
    this.ramps = L.ramps;
    this.colliders = []; // { x, z, r } updated every frame (they bob)

    // ---------- gate pylons ----------
    this.matNext = new THREE.MeshStandardMaterial({ color: 0xffd23a, emissive: 0xffa000, emissiveIntensity: 0.9, roughness: 0.4 });
    this.matIdle = new THREE.MeshStandardMaterial({ color: 0xff5a1f, roughness: 0.5 });
    this.matDone = new THREE.MeshStandardMaterial({ color: 0xc9d6de, roughness: 0.6, transparent: true, opacity: 0.85 });
    const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
    const pyBody = new THREE.CylinderGeometry(0.75, 1.05, 2.6, 14);
    const pyTop = new THREE.ConeGeometry(0.75, 1.4, 14);
    const pyBand = new THREE.CylinderGeometry(0.93, 0.97, 0.45, 14);
    const pyBase = new THREE.TorusGeometry(1.15, 0.28, 8, 20);
    const mkPylon = () => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(pyBody, this.matIdle);
      body.position.y = 1.0;
      const top = new THREE.Mesh(pyTop, this.matIdle);
      top.position.y = 3.0;
      const band = new THREE.Mesh(pyBand, white);
      band.position.y = 1.5;
      const ring = new THREE.Mesh(pyBase, white);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.05;
      g.add(body, top, band, ring);
      g.userData.paint = [body, top];
      return g;
    };

    // start / finish arch
    const checker = canvasTex(1024, 128, (g, w, h) => {
      const c = 32;
      for (let y = 0; y < h; y += c) for (let x = 0; x < w; x += c) {
        g.fillStyle = ((x + y) / c) % 2 ? '#111' : '#fff';
        g.fillRect(x, y, c, c);
      }
      g.fillStyle = 'rgba(10,60,110,0.92)';
      g.fillRect(w * 0.28, 10, w * 0.44, h - 20);
      g.fillStyle = '#ffcc33';
      g.font = 'italic bold 78px Trebuchet MS, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('START · FINISH', w / 2, h / 2 + 4);
    });
    const archMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
    const bannerMat = new THREE.MeshStandardMaterial({ map: checker, roughness: 0.7, side: THREE.DoubleSide });

    for (const gate of this.gates) {
      const g = new THREE.Group();
      g.rotation.y = Math.atan2(gate.tx, gate.tz);
      g.position.set(gate.x, 0, gate.z);
      gate.group = g;
      gate.pylons = [];
      if (gate.idx === 0) {
        const span = gate.half * 2 + 2.4;
        for (const sx of [-1, 1]) {
          const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.1, 10.5, 12), archMat);
          pillar.position.set(sx * (gate.half + 1.2), 4.4, 0);
          g.add(pillar);
          const float = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.2, 1.2, 16), this.matIdle);
          float.position.set(sx * (gate.half + 1.2), -0.2, 0);
          g.add(float);
          gate.pylons.push({ obj: float, lx: sx * (gate.half + 1.2), r: 2.4 });
        }
        const banner = new THREE.Mesh(new THREE.BoxGeometry(span, 2.4, 0.3), [archMat, archMat, archMat, archMat, bannerMat, bannerMat]);
        banner.position.y = 9.2;
        g.add(banner);
        // a checkered line floating on the water between the floats
        const line = new THREE.Mesh(new THREE.PlaneGeometry(gate.half * 2, 1.2), new THREE.MeshBasicMaterial({ map: checker, transparent: true, opacity: 0.8, depthWrite: false }));
        line.rotation.x = -Math.PI / 2;
        line.position.y = 0.15;
        line.renderOrder = 1;
        g.add(line);
        gate.line = line;
      } else {
        for (const sx of [-1, 1]) {
          const py = mkPylon();
          py.position.x = sx * gate.half;
          g.add(py);
          gate.pylons.push({ obj: py, lx: sx * gate.half, r: 1.35 });
        }
      }
      this.group.add(g);
    }

    // floating "next gate" chevron
    const chev = new THREE.Shape();
    chev.moveTo(-2.2, 1.4);
    chev.lineTo(0, -1.2);
    chev.lineTo(2.2, 1.4);
    chev.lineTo(1.2, 1.4);
    chev.lineTo(0, 0.1);
    chev.lineTo(-1.2, 1.4);
    chev.closePath();
    this.arrow = new THREE.Mesh(
      new THREE.ExtrudeGeometry(chev, { depth: 0.4, bevelEnabled: false }).translate(0, 0, -0.2),
      new THREE.MeshStandardMaterial({ color: 0xffe066, emissive: 0xffb000, emissiveIntensity: 1.2, roughness: 0.4 })
    );
    this.group.add(this.arrow);

    // ---------- corner markers ----------
    const mGeo = new THREE.CylinderGeometry(0.4, 0.55, 1.1, 10);
    const mMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, emissive: 0x335566, emissiveIntensity: 0.15 });
    this.markers = L.markers.map((m) => ({ ...m, r: 0.9 }));
    this.markerMesh = new THREE.InstancedMesh(mGeo, mMat, Math.max(1, this.markers.length));
    this.markerMesh.count = this.markers.length;
    this.markerMesh.frustumCulled = false;
    const stripe = new THREE.Color(0xff3b30);
    this.markers.forEach((m, i) => this.markerMesh.setColorAt(i, i % 2 ? stripe : new THREE.Color(0xffffff)));
    this.group.add(this.markerMesh);
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3(1, 1, 1);

    // ---------- ramps ----------
    const deckTex = canvasTex(256, 512, (g, w, h) => {
      g.fillStyle = '#1d5fa8';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffcc33';
      for (let y = -64; y < h + 64; y += 96) {
        g.beginPath();
        g.moveTo(0, y + 60);
        g.lineTo(w / 2, y);
        g.lineTo(w, y + 60);
        g.lineTo(w, y + 96);
        g.lineTo(w / 2, y + 36);
        g.lineTo(0, y + 96);
        g.closePath();
        g.fill();
      }
      g.fillStyle = '#fff';
      g.fillRect(0, 0, w, 26); // white lip
      g.fillRect(0, 0, 14, h);
      g.fillRect(w - 14, 0, 14, h);
    });
    const { deck, skirt } = rampGeometry();
    const deckMat = new THREE.MeshStandardMaterial({ map: deckTex, roughness: 0.55 });
    const skirtMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6, side: THREE.DoubleSide });
    const pontoonMat = new THREE.MeshStandardMaterial({ color: 0xff5a1f, roughness: 0.5 });
    const pontoonGeo = new THREE.CapsuleGeometry(0.7, RAMP_L - 1.4, 4, 10).rotateX(Math.PI / 2);
    for (const r of this.ramps) {
      const g = new THREE.Group();
      g.rotation.y = Math.atan2(r.fx, r.fz);
      g.position.set(r.cx, 0, r.cz);
      g.add(new THREE.Mesh(deck, deckMat), new THREE.Mesh(skirt, skirtMat));
      for (const sx of [-1, 1]) {
        const pont = new THREE.Mesh(pontoonGeo, pontoonMat);
        pont.position.set(sx * (RAMP_W / 2 + 0.5), -0.25, 0);
        g.add(pont);
      }
      r.group = g;
      this.group.add(g);
    }

    // ---------- race state ----------
    this.next = 0; // index of the gate you need to pass next
    this.lapStart = null; // sim time the current lap started
    this.lap = 0;
    this.lastLap = null;
    this.splits = [];
    this.missed = -1;
    this.best = null;
    this.bestSplits = null;
    try {
      const saved = JSON.parse(localStorage.getItem(`swellrider.${TRACK_ID}.best`) || 'null');
      if (saved && saved.time > 0 && Array.isArray(saved.splits) && saved.splits.length === this.gates.length) {
        this.best = saved.time;
        this.bestSplits = saved.splits;
      }
    } catch {
      /* ignore bad storage */
    }
    this.refreshGates();
  }

  get racing() {
    return this.lapStart !== null;
  }

  lapTime(t) {
    return this.lapStart === null ? 0 : t - this.lapStart;
  }

  // ---------- surface / ramps (used by the physics) ----------

  /** The ramp (and local coords) under (x, z), or null. */
  rampUnder(x, z, margin = 0) {
    for (const r of this.ramps) {
      const dx = x - r.cx, dz = z - r.cz;
      if (dx * dx + dz * dz > 100) continue;
      const l = rampLocal(r, x, z);
      if (l.u >= 0 && l.u <= 1 + margin / RAMP_L && Math.abs(l.v) <= RAMP_W / 2 + margin) return { r, u: Math.min(1, l.u), v: l.v };
    }
    return null;
  }

  /** Height of a ramp deck at (x, z) or -Infinity. */
  rampTop(x, z, t) {
    const hit = this.rampUnder(x, z);
    return hit ? rampBase(hit.r, t) + rampProfile(hit.u) : -Infinity;
  }

  /**
   * Height of a ramp deck usable as ground at (x, z). With `allow` false only the
   * low entry part counts, so you can't pop up onto the deck from the side or back.
   */
  rampGround(x, z, t, allow) {
    const hit = this.rampUnder(x, z);
    if (!hit || (!allow && hit.u > 0.25)) return -Infinity;
    return rampBase(hit.r, t) + rampProfile(hit.u);
  }

  /** May a ski at height y, centered at (x, z), ride the deck there? */
  rampAllow(x, z, y, t) {
    const hit = this.rampUnder(x, z);
    if (!hit) return false;
    return hit.u <= 0.25 || y > rampBase(hit.r, t) + rampProfile(hit.u) - 0.6;
  }

  /**
   * Vertical speed of the deck under a ski at (x, z) moving with (vx, vz): the
   * ramp's own bob plus climbing its profile. Null when not over a ramp.
   */
  rampVy(x, z, vx, vz, t, dt) {
    const hit = this.rampUnder(x, z);
    if (!hit) return null;
    const r = hit.r;
    const b1 = rampBase(r, t + dt);
    const b0 = rampBase(r, t);
    rampBase(r, t + dt); // leave the cache at the current time
    const u = hit.u;
    const slope = (RAMP_H * (0.25 + 1.5 * u)) / RAMP_L;
    return (b1 - b0) / dt + slope * (vx * r.fx + vz * r.fz);
  }

  /** Visible ground (water or ramp deck) for shadows. */
  groundHeight(x, z, t) {
    return Math.max(waveHeight(x, z, t), this.rampTop(x, z, t));
  }

  /**
   * If the ski is inside a ramp's skirt below its deck, return where to push it
   * (out through the nearest side or the back) and the wall normal.
   */
  rampWall(x, z, y, t) {
    const m = 0.9;
    const hit = this.rampUnder(x, z, m);
    if (!hit || hit.u <= 0.25) return null;
    const r = hit.r;
    const top = rampBase(r, t) + rampProfile(hit.u);
    if (y > top - 0.6) return null;
    const side = RAMP_W / 2 + m - Math.abs(hit.v);
    const back = (1 - hit.u) * RAMP_L + m;
    const l = rampLocal(r, x, z);
    if (side < back) {
      const s = Math.sign(hit.v) || 1;
      return { x: x + r.rx * s * side, z: z + r.rz * s * side, nx: r.rx * s, nz: r.rz * s };
    }
    const push = (1 + m / RAMP_L - l.u) * RAMP_L;
    return { x: x + r.fx * push, z: z + r.fz * push, nx: r.fx, nz: r.fz };
  }

  // ---------- lookup ----------

  /** Nearest centerline sample: { i, d, tx, tz }. */
  nearest(x, z) {
    const { px, pz, n } = this.layout;
    let best = 1e18, bi = 0;
    for (let i = 0; i < n; i++) {
      const dx = px[i] - x, dz = pz[i] - z;
      const d = dx * dx + dz * dz;
      if (d < best) {
        best = d;
        bi = i;
      }
    }
    return { i: bi, d: Math.sqrt(best), tx: this.layout.tx[bi], tz: this.layout.tz[bi] };
  }

  /** A spot just before the start line, facing down the course. */
  startPose() {
    const g = this.gates[0];
    return { x: g.x - g.tx * 28, z: g.z - g.tz * 28, heading: Math.atan2(g.tx, g.tz) };
  }

  /** Last gate you passed (or the start), to respawn there. */
  lastGatePose() {
    const g = this.gates[(this.next - 1 + this.gates.length) % this.gates.length];
    return { x: g.x + g.tx * 4, z: g.z + g.tz * 4, heading: Math.atan2(g.tx, g.tz) };
  }

  resetRace() {
    this.next = 0;
    this.lapStart = null;
    this.splits = [];
    this.missed = -1;
    this.refreshGates();
  }

  // ---------- lap logic ----------

  /** Did the segment p0 -> p1 cross `gate` forwards between its buoys? Returns the fraction or -1. */
  static cross(gate, x0, z0, x1, z1) {
    const d0 = (x0 - gate.x) * gate.tx + (z0 - gate.z) * gate.tz;
    const d1 = (x1 - gate.x) * gate.tx + (z1 - gate.z) * gate.tz;
    if (!(d0 < 0 && d1 >= 0)) return -1;
    const f = -d0 / (d1 - d0);
    const cx = x0 + (x1 - x0) * f, cz = z0 + (z1 - z0) * f;
    const lat = (cx - gate.x) * gate.rx + (cz - gate.z) * gate.rz;
    return Math.abs(lat) <= gate.half ? f : -1;
  }

  /**
   * Call once per physics step with the previous and current position.
   * t0/t1 are the sim times of those positions. Returns a list of events.
   */
  update(x0, z0, x1, z1, t0, t1) {
    const events = [];
    const N = this.gates.length;
    const gate = this.gates[this.next];
    const f = Track.cross(gate, x0, z0, x1, z1);
    if (f >= 0) {
      const tc = t0 + (t1 - t0) * f;
      if (this.next === 0) {
        if (this.lapStart !== null) {
          const time = tc - this.lapStart;
          this.splits[0] = time;
          const prevBest = this.best;
          const isBest = this.best === null || time < this.best;
          if (isBest) {
            this.best = time;
            this.bestSplits = this.splits.slice();
            try {
              localStorage.setItem(`swellrider.${TRACK_ID}.best`, JSON.stringify({ time, splits: this.bestSplits }));
            } catch {
              /* storage full or blocked */
            }
          }
          this.lastLap = time;
          events.push({ type: 'lap', time, lap: this.lap, best: isBest, prevBest });
        } else {
          events.push({ type: 'start' });
        }
        this.lap++;
        this.lapStart = tc;
        this.splits = new Array(N).fill(null);
      } else {
        const split = tc - this.lapStart;
        this.splits[this.next] = split;
        const ref = this.bestSplits ? this.bestSplits[this.next] : null;
        events.push({ type: 'gate', idx: this.next, count: N, split, delta: ref != null ? split - ref : null });
      }
      this.next = (this.next + 1) % N;
      this.missed = -1;
      this.refreshGates();
    } else if (this.lapStart !== null) {
      // flew past the gate you needed and through a later one?
      for (let k = 1; k <= 2; k++) {
        const j = (this.next + k) % N;
        if (j === 0 && this.next === 0) continue;
        if (Track.cross(this.gates[j], x0, z0, x1, z1) >= 0 && this.missed !== this.next) {
          this.missed = this.next;
          events.push({ type: 'missed', idx: this.next });
        }
      }
    }
    return events;
  }

  refreshGates() {
    const N = this.gates.length;
    for (const g of this.gates) {
      let mat = this.matIdle;
      if (g.idx === this.next) mat = this.matNext;
      else if (this.lapStart !== null && g.idx !== 0 && g.idx < this.next) mat = this.matDone;
      for (const p of g.pylons) {
        if (p.obj.userData.paint) for (const m of p.obj.userData.paint) m.material = mat;
        else p.obj.material = mat;
      }
    }
    this.nextGate = this.gates[this.next % N];
  }

  // ---------- per-frame animation ----------
  animate(t) {
    this.colliders.length = 0;
    for (const g of this.gates) {
      const h = waveHeight(g.x, g.z, t);
      g.group.position.y = h - 0.25;
      // pylons bob on their own patch of water
      for (const p of g.pylons) {
        const wx = g.x + g.rx * p.lx, wz = g.z + g.rz * p.lx;
        const wh = waveHeight(wx, wz, t);
        if (g.idx !== 0) {
          p.obj.position.y = wh - h + Math.sin(t * 2.1 + p.lx) * 0.06;
          p.obj.rotation.z = Math.sin(t * 1.3 + wx * 0.1) * 0.08;
        }
        this.colliders.push({ x: wx, z: wz, r: p.r, y: wh });
      }
      if (g.line) g.line.material.opacity = g.idx === this.next ? 0.9 : 0.45;
    }
    const ng = this.nextGate;
    const ay = waveHeight(ng.x, ng.z, t) + (ng.idx === 0 ? 5.5 : 6.5) + Math.sin(t * 3) * 0.4;
    this.arrow.position.set(ng.x, ay, ng.z);
    this.arrow.rotation.set(0, Math.atan2(ng.tx, ng.tz) + t * 1.5, 0);

    for (let i = 0; i < this.markers.length; i++) {
      const m = this.markers[i];
      const h = waveHeight(m.x, m.z, t);
      this._v.set(m.x, h + 0.2 + Math.sin(t * 2 + i) * 0.05, m.z);
      this._q.setFromEuler(this._e.set(Math.sin(t * 1.7 + i) * 0.1, 0, Math.cos(t * 1.4 + i) * 0.1));
      this._m.compose(this._v, this._q, this._s);
      this.markerMesh.setMatrixAt(i, this._m);
      this.colliders.push({ x: m.x, z: m.z, r: m.r, y: h });
    }
    this.markerMesh.instanceMatrix.needsUpdate = true;

    for (const r of this.ramps) r.group.position.y = rampBase(r, t);
  }
}
