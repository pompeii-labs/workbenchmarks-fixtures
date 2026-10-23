import { waveHeight } from './waves';

/**
 * The race course: a closed Catmull-Rom loop through open water near the
 * start, with buoy gates on the turns and floating kicker ramps on the
 * straights. Pure data + math so the sim, renderer and bots share it.
 *
 * Coordinates: forward at heading 0 is -Z. Viewed from above with -Z "up",
 * the loop runs clockwise: north up the start straight, a sweeping right
 * over the top, a hairpin and an S-bend down the east side, a long east
 * straight, a hairpin at the bottom, and back west to the start line.
 */
export interface Gate {
  index: number;
  x: number;
  z: number;
  /** unit tangent: direction you must cross in */
  tx: number;
  tz: number;
  halfWidth: number;
  /** arc distance of this gate along the course */
  arc: number;
  start: boolean;
}

export interface Ramp {
  index: number;
  /** centre of the entry (low) edge */
  x: number;
  z: number;
  /** unit direction from entry to lip */
  dx: number;
  dz: number;
  len: number;
  halfWidth: number;
  height: number;
}

export interface CourseSample {
  x: number;
  z: number;
  arc: number;
}

const CONTROL: [number, number][] = [
  [0, -10], // 0 start / finish
  [0, -85],
  [0, -150],
  [35, -225], // 3 sweeper in
  [105, -248],
  [168, -208], // 5 hairpin top
  [162, -140],
  [105, -100], // 7 S-bend left
  [112, -40],
  [162, 0], // 9 S-bend right
  [172, 70],
  [150, 145], // 11 bottom hairpin
  [80, 172],
  [10, 166], // 13
  [-32, 120], // 14 last turn
  [-2, 55],
];

const GATE_POINTS = [0, 3, 5, 7, 9, 11, 13, 14];
const GATE_HALF_WIDTH = 11;

function cr(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

function buildSamples(): { samples: CourseSample[]; pointArc: number[]; total: number } {
  const n = CONTROL.length;
  const samples: CourseSample[] = [];
  const pointArc: number[] = [];
  let arc = 0;
  let px = CONTROL[0][0];
  let pz = CONTROL[0][1];
  const per = 40;
  for (let i = 0; i < n; i += 1) {
    const a = CONTROL[(i - 1 + n) % n];
    const b = CONTROL[i];
    const c = CONTROL[(i + 1) % n];
    const d = CONTROL[(i + 2) % n];
    for (let k = 0; k < per; k += 1) {
      const t = k / per;
      const x = cr(a[0], b[0], c[0], d[0], t);
      const z = cr(a[1], b[1], c[1], d[1], t);
      arc += Math.hypot(x - px, z - pz);
      px = x;
      pz = z;
      if (k === 0) pointArc.push(arc);
      samples.push({ x, z, arc });
    }
  }
  const total = arc + Math.hypot(CONTROL[0][0] - px, CONTROL[0][1] - pz);
  return { samples, pointArc, total };
}

const built = buildSamples();
export const COURSE_SAMPLES: CourseSample[] = built.samples;
export const COURSE_LENGTH: number = built.total;

/** Point and unit tangent at an arc distance (wraps). */
export function courseAt(arc: number): { x: number; z: number; tx: number; tz: number } {
  const L = COURSE_LENGTH;
  const a = ((arc % L) + L) % L;
  const S = COURSE_SAMPLES;
  // binary search
  let lo = 0;
  let hi = S.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (S[mid].arc <= a) lo = mid;
    else hi = mid - 1;
  }
  const s0 = S[lo];
  const s1 = S[(lo + 1) % S.length];
  const a1 = lo + 1 < S.length ? s1.arc : L;
  const f = a1 > s0.arc ? (a - s0.arc) / (a1 - s0.arc) : 0;
  const dx = s1.x - s0.x;
  const dz = s1.z - s0.z;
  const len = Math.hypot(dx, dz) || 1;
  return { x: s0.x + dx * f, z: s0.z + dz * f, tx: dx / len, tz: dz / len };
}

function tangentAt(arc: number): { tx: number; tz: number } {
  const a = courseAt(arc - 2);
  const b = courseAt(arc + 2);
  const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  return { tx: (b.x - a.x) / len, tz: (b.z - a.z) / len };
}

export const GATES: Gate[] = GATE_POINTS.map((pi, index) => {
  const arc = built.pointArc[pi];
  const p = courseAt(arc);
  const t = tangentAt(arc);
  return { index, x: p.x, z: p.z, tx: t.tx, tz: t.tz, halfWidth: GATE_HALF_WIDTH, arc, start: index === 0 };
});

function rampAtArc(index: number, arc: number): Ramp {
  const p = courseAt(arc);
  const t = tangentAt(arc + 5);
  return { index, x: p.x, z: p.z, dx: t.tx, dz: t.tz, len: 12, halfWidth: 3.2, height: 3.1 };
}

/** Kickers on the three long straights, on the racing line. */
export const RAMPS: Ramp[] = [
  rampAtArc(0, 42),
  rampAtArc(1, built.pointArc[9] + 22),
  rampAtArc(2, built.pointArc[12] + 18),
];

/** Rider spawn: 40 m before the start line, on the start straight. */
export const SPAWN = { x: 0, z: 30, heading: 0 };

/** Local ramp coords: u along (0 entry .. len lip), v across (+ right). */
export function rampLocal(r: Ramp, x: number, z: number): { u: number; v: number } {
  const rx = x - r.x;
  const rz = z - r.z;
  // right of direction (dx, dz) is (-dz, dx)
  return { u: rx * r.dx + rz * r.dz, v: rx * -r.dz + rz * r.dx };
}

/** Ramps float: they heave with the swell under them, entry edge awash. */
export function rampBaseY(r: Ramp, t: number): number {
  const ex = r.x;
  const ez = r.z;
  const lx = r.x + r.dx * r.len;
  const lz = r.z + r.dz * r.len;
  const avg = (waveHeight(ex, ez, t) + waveHeight(lx, lz, t) + 2 * waveHeight((ex + lx) / 2, (ez + lz) / 2, t)) * 0.25 * 0.7;
  // Never ride higher than the water at the entry edge, so the deck always
  // starts under water and riding onto it is seamless.
  return Math.min(avg, waveHeight(ex, ez, t) - 0.05);
}

/** Height of the ramp deck relative to its base at u (accelerating curve so the lip throws you). */
export function rampProfile(r: Ramp, u: number): number {
  const k = Math.max(0, Math.min(1, u / r.len));
  return -0.35 + (r.height + 0.35) * Math.pow(k, 1.7);
}

export function rampTop(r: Ramp, u: number, t: number): number {
  return rampBaseY(r, t) + rampProfile(r, u);
}

/** Nearest course sample index in a window around a hint (or globally). */
export function nearestSample(x: number, z: number, hint = -1, window = 60): number {
  const S = COURSE_SAMPLES;
  const n = S.length;
  let best = 0;
  let bestD = Infinity;
  if (hint < 0) {
    for (let i = 0; i < n; i += 1) {
      const d = (S[i].x - x) ** 2 + (S[i].z - z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }
  for (let o = -window; o <= window; o += 1) {
    const i = (((hint + o) % n) + n) % n;
    const d = (S[i].x - x) ** 2 + (S[i].z - z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** Distance from (x, z) to the course centre line (coarse, for decoration placement). */
export function distanceToCourse(x: number, z: number): number {
  const S = COURSE_SAMPLES;
  let bestD = Infinity;
  for (let i = 0; i < S.length; i += 4) {
    const d = (S[i].x - x) ** 2 + (S[i].z - z) ** 2;
    if (d < bestD) bestD = d;
  }
  return Math.sqrt(bestD);
}

export function formatLap(t: number): string {
  if (!Number.isFinite(t) || t <= 0) return '--:--.--';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(2)}`;
}
