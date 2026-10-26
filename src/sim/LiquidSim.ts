// Liquid surface simulation for the cup. Plain typed arrays, fixed step, no
// rendering or DOM. Linearised shallow-water equations on a staggered (MAC)
// grid inside a circular wall:
//   du/dt = -g grad(h) - damping u + cursor drag
//   dh/dt = -H div(u) + small diffusion
// Waves travel at c = sqrt(gH), reflect off the wall (closed faces), and
// superpose. The vortical part of u is the stir that carries the crema: a
// material-coordinate displacement field D is advected semi-Lagrangian, and
// the crema thickness is its Jacobian (stretched crema thins, squeezed
// crema thickens). Units: cup radius = 1, seconds.

export const N = 128; // cells per side
export const EXTENT = 1.04; // grid half-width, slightly past the wall
export const DX = (2 * EXTENT) / N;
export const SIM_DT = 1 / 200;
const ADVECT_EVERY = 4; // crema advection runs at 50 Hz

export type LiquidParams = {
  waveSpeed: number; // c, cup radii per second
  depth: number; // H, mean depth in cup radii
  damping: number; // 1/s on velocity, amplitude e-folds in 2/damping s
  diffusion: number; // h smoothing, kills grid-scale noise
  drag: number; // coupling of liquid to the cursor, 1/s
  dragRadius: number; // cursor footprint, cup radii
  maxCursorSpeed: number; // spike filter, cup radii per second
  cremaRelax: number; // 1/s, crema slowly relaxes back to rest
};

export const DEFAULT_PARAMS: LiquidParams = {
  waveSpeed: 1.75,
  depth: 0.16,
  damping: 1.8,
  diffusion: 0.0004,
  drag: 20,
  dragRadius: 0.085,
  maxCursorSpeed: 9,
  cremaRelax: 1 / 25,
};

/** The single command type that drives the liquid: where the cursor is. */
export type CursorCommand = { x: number; y: number; active: boolean };

export class LiquidSim {
  readonly params: LiquidParams;
  readonly h = new Float32Array(N * N);
  readonly u = new Float32Array((N + 1) * N); // x faces: index j*(N+1)+i, between cells i-1 and i
  readonly v = new Float32Array(N * (N + 1)); // y faces: index j*N+i, between rows j-1 and j
  dX = new Float32Array(N * N); // crema displacement: material coordinate = x + D
  dY = new Float32Array(N * N);
  private nX = new Float32Array(N * N);
  private nY = new Float32Array(N * N);
  readonly inside = new Uint8Array(N * N);
  private readonly openU = new Uint8Array((N + 1) * N);
  private readonly openV = new Uint8Array(N * (N + 1));
  private readonly nearest = new Int32Array(N * N); // outside cell -> nearest inside cell
  private readonly insideList: Int32Array;

  time = 0;
  steps = 0;
  // Cursor state, in cup coordinates. prev/cur bound the segment the steps of
  // the current frame sweep along, so fast swipes leave a continuous wake.
  private cursorActive = false;
  private segStartX = 0;
  private segStartY = 0;
  private cursorX = 0;
  private cursorY = 0;
  private velX = 0;
  private velY = 0;
  cursorSpeed = 0;
  peakCursorSpeed = 0; // since reset, for diagnostics
  private quiet = true;

  constructor(params: Partial<LiquidParams> = {}) {
    this.params = { ...DEFAULT_PARAMS, ...params };
    const list: number[] = [];
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = cellX(i);
        const y = cellX(j);
        if (x * x + y * y < 1) {
          this.inside[j * N + i] = 1;
          list.push(j * N + i);
        }
      }
    }
    this.insideList = Int32Array.from(list);
    for (let j = 0; j < N; j++) {
      for (let i = 1; i < N; i++) {
        this.openU[j * (N + 1) + i] = this.inside[j * N + i - 1] & this.inside[j * N + i];
      }
    }
    for (let j = 1; j < N; j++) {
      for (let i = 0; i < N; i++) {
        this.openV[j * N + i] = this.inside[(j - 1) * N + i] & this.inside[j * N + i];
      }
    }
    // Outside cells mirror their nearest inside neighbour (radial projection),
    // so bilinear sampling at the wall never reads zeros.
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const k = j * N + i;
        if (this.inside[k]) {
          this.nearest[k] = k;
          continue;
        }
        const x = cellX(i);
        const y = cellX(j);
        const r = Math.hypot(x, y) || 1;
        let s = 0.995;
        let found = -1;
        while (found < 0 && s > 0) {
          const ii = Math.round((x / r) * s / DX + N / 2 - 0.5);
          const jj = Math.round((y / r) * s / DX + N / 2 - 0.5);
          if (ii >= 0 && ii < N && jj >= 0 && jj < N && this.inside[jj * N + ii]) found = jj * N + ii;
          s -= DX * 0.5;
        }
        this.nearest[k] = found < 0 ? (N / 2) * N + N / 2 : found;
      }
    }
  }

  reset(): void {
    this.h.fill(0);
    this.u.fill(0);
    this.v.fill(0);
    this.dX.fill(0);
    this.dY.fill(0);
    this.time = 0;
    this.steps = 0;
    this.cursorActive = false;
    this.velX = 0;
    this.velY = 0;
    this.cursorSpeed = 0;
    this.peakCursorSpeed = 0;
    this.quiet = true;
  }

  /** Latest cursor sample. Entering (inactive -> active) never produces a speed spike. */
  command(cmd: CursorCommand): void {
    if (cmd.active && !this.cursorActive) {
      this.segStartX = cmd.x;
      this.segStartY = cmd.y;
      this.velX = 0;
      this.velY = 0;
    }
    this.cursorActive = cmd.active;
    this.cursorX = cmd.x;
    this.cursorY = cmd.y;
  }

  /** A drop landing on the surface: a small Gaussian mound (volume is tiny). */
  drop(x: number, y: number, amplitude: number, radius: number): void {
    const inv = 1 / (radius * radius);
    const list = this.insideList;
    let total = 0;
    for (let n = 0; n < list.length; n++) {
      const k = list[n];
      const j = (k / N) | 0;
      const i = k - j * N;
      const dx = cellX(i) - x;
      const dy = cellX(j) - y;
      const a = amplitude * Math.exp(-(dx * dx + dy * dy) * inv);
      this.h[k] += a;
      total += a;
    }
    // Keep the volume: the mean level stays at rest.
    const mean = total / list.length;
    for (let n = 0; n < list.length; n++) this.h[list[n]] -= mean;
    this.quiet = false;
  }

  /** True when nothing moves and no cursor is present: the step can be skipped. */
  get idle(): boolean {
    return this.quiet && !this.cursorMoving();
  }

  private cursorMoving(): boolean {
    if (!this.cursorActive) return false;
    return this.cursorSpeed > 1e-3 || this.cursorX !== this.segStartX || this.cursorY !== this.segStartY;
  }

  /** Advance n fixed steps, sweeping the cursor along the segment received since the last call. */
  advance(n: number): void {
    if (n <= 0) return;
    const p = this.params;
    let sx = this.segStartX;
    let sy = this.segStartY;
    const ex = this.cursorX;
    const ey = this.cursorY;
    if (this.cursorActive) {
      // Cursor speed over this frame's sim time, lightly smoothed, spike-clamped.
      let vx = (ex - sx) / (n * SIM_DT);
      let vy = (ey - sy) / (n * SIM_DT);
      const sp = Math.hypot(vx, vy);
      if (sp > p.maxCursorSpeed) {
        vx *= p.maxCursorSpeed / sp;
        vy *= p.maxCursorSpeed / sp;
      }
      const a = 1 - Math.exp((-n * SIM_DT) / 0.025);
      this.velX += (vx - this.velX) * a;
      this.velY += (vy - this.velY) * a;
      this.cursorSpeed = Math.hypot(this.velX, this.velY);
      if (this.cursorSpeed > this.peakCursorSpeed) this.peakCursorSpeed = this.cursorSpeed;
    } else {
      this.velX = this.velY = 0;
      this.cursorSpeed = 0;
      sx = ex;
      sy = ey;
    }
    for (let k = 0; k < n; k++) {
      const t = (k + 1) / n;
      this.step(sx + (ex - sx) * t, sy + (ey - sy) * t);
    }
    this.segStartX = ex;
    this.segStartY = ey;
  }

  private step(cx: number, cy: number): void {
    const p = this.params;
    const dt = SIM_DT;
    const g = (p.waveSpeed * p.waveSpeed) / p.depth;
    const h = this.h;
    const u = this.u;
    const v = this.v;
    const keep = 1 - p.damping * dt;
    const gk = (g * dt) / DX;

    let maxVel = 0;
    for (let j = 0; j < N; j++) {
      const row = j * (N + 1);
      const hr = j * N;
      for (let i = 1; i < N; i++) {
        const f = row + i;
        if (!this.openU[f]) continue;
        const nu = u[f] * keep - gk * (h[hr + i] - h[hr + i - 1]);
        u[f] = nu;
        const a = nu < 0 ? -nu : nu;
        if (a > maxVel) maxVel = a;
      }
    }
    for (let j = 1; j < N; j++) {
      const row = j * N;
      for (let i = 0; i < N; i++) {
        const f = row + i;
        if (!this.openV[f]) continue;
        const nv = v[f] * keep - gk * (h[row + i] - h[row - N + i]);
        v[f] = nv;
        const a = nv < 0 ? -nv : nv;
        if (a > maxVel) maxVel = a;
      }
    }

    // Cursor drag: liquid under the cursor is pulled toward the cursor's
    // velocity. Speed is the force: a slow drag barely moves it, a swipe
    // throws a bow wave ahead and a trough behind.
    if (this.cursorActive && this.cursorSpeed > 1e-3) {
      // Faster cursor: firmer grip and a wider footprint, so the force grows
      // with speed instead of saturating.
      const sp = this.cursorSpeed;
      const r = p.dragRadius * (1 + 0.12 * Math.min(sp, 6));
      const inv = 1 / (r * r);
      const reach = r * 2.6;
      const i0 = Math.max(1, Math.floor((cx - reach + EXTENT) / DX));
      const i1 = Math.min(N - 1, Math.ceil((cx + reach + EXTENT) / DX));
      const j0 = Math.max(0, Math.floor((cy - reach + EXTENT) / DX));
      const j1 = Math.min(N - 1, Math.ceil((cy + reach + EXTENT) / DX));
      const kd = Math.min(0.45, p.drag * (0.25 + 0.38 * sp) * dt);
      for (let j = j0; j <= j1; j++) {
        const y = cellX(j) - cy;
        for (let i = i0; i <= i1; i++) {
          const f = j * (N + 1) + i;
          if (!this.openU[f]) continue;
          const x = i * DX - EXTENT - cx;
          const w = Math.exp(-(x * x + y * y) * inv) * kd;
          u[f] += (this.velX - u[f]) * w;
        }
      }
      for (let j = Math.max(1, j0); j <= j1 + 1 && j < N; j++) {
        const y = j * DX - EXTENT - cy;
        for (let i = Math.max(0, i0 - 1); i <= i1; i++) {
          const f = j * N + i;
          if (!this.openV[f]) continue;
          const x = cellX(i) - cx;
          const w = Math.exp(-(x * x + y * y) * inv) * kd;
          v[f] += (this.velY - v[f]) * w;
        }
      }
    }

    // Height from divergence, with diffusion (zero flux through the wall).
    const hk = (p.depth * dt) / DX;
    const nuk = (p.diffusion * dt) / (DX * DX);
    const list = this.insideList;
    let maxH = 0;
    for (let n = 0; n < list.length; n++) {
      const k = list[n];
      const j = (k / N) | 0;
      const i = k - j * N;
      const fu = j * (N + 1) + i;
      const div = u[fu + 1] - u[fu] + v[k + N] - v[k];
      const hc = h[k];
      const hl = this.inside[k - 1] ? h[k - 1] : hc;
      const hr = this.inside[k + 1] ? h[k + 1] : hc;
      const hd = this.inside[k - N] ? h[k - N] : hc;
      const hu = this.inside[k + N] ? h[k + N] : hc;
      const nh = hc - hk * div + nuk * (hl + hr + hd + hu - 4 * hc);
      h[k] = nh;
      const a = nh < 0 ? -nh : nh;
      if (a > maxH) maxH = a;
    }

    this.steps += 1;
    this.time += dt;
    if (this.steps % ADVECT_EVERY === 0) this.advectCrema(dt * ADVECT_EVERY);

    this.quiet = maxH < 2e-5 && maxVel < 2e-4 && !this.cursorMoving();
    if (this.quiet) {
      // Below visibility: snap to exact rest so idle frames cost nothing.
      h.fill(0);
      u.fill(0);
      v.fill(0);
    }
  }

  /** Semi-Lagrangian advection of the crema displacement field. */
  private advectCrema(dt: number): void {
    const u = this.u;
    const v = this.v;
    const oX = this.dX;
    const oY = this.dY;
    const nX = this.nX;
    const nY = this.nY;
    const relax = 1 - this.params.cremaRelax * dt;
    const list = this.insideList;
    nX.set(oX);
    nY.set(oY);
    for (let n = 0; n < list.length; n++) {
      const k = list[n];
      const j = (k / N) | 0;
      const i = k - j * N;
      const fu = j * (N + 1) + i;
      const vx = 0.5 * (u[fu] + u[fu + 1]);
      const vy = 0.5 * (v[k] + v[k + N]);
      // Back-trace in cell units, sample bilinearly.
      let px = i - (vx * dt) / DX;
      let py = j - (vy * dt) / DX;
      px = px < 0 ? 0 : px > N - 1.001 ? N - 1.001 : px;
      py = py < 0 ? 0 : py > N - 1.001 ? N - 1.001 : py;
      const x0 = px | 0;
      const y0 = py | 0;
      const fx = px - x0;
      const fy = py - y0;
      const a = y0 * N + x0;
      const sX = (oX[a] * (1 - fx) + oX[a + 1] * fx) * (1 - fy) + (oX[a + N] * (1 - fx) + oX[a + N + 1] * fx) * fy;
      const sY = (oY[a] * (1 - fx) + oY[a + 1] * fx) * (1 - fy) + (oY[a + N] * (1 - fx) + oY[a + N + 1] * fx) * fy;
      nX[k] = (sX - vx * dt) * relax;
      nY[k] = (sY - vy * dt) * relax;
    }
    // Outside cells copy their nearest inside cell.
    for (let k = 0; k < N * N; k++) {
      if (this.inside[k]) continue;
      const m = this.nearest[k];
      nX[k] = nX[m];
      nY[k] = nY[m];
    }
    this.nX = oX;
    this.nY = oY;
    this.dX = nX;
    this.dY = nY;
  }

  /** Crema relaxation while the surface is idle (no wave stepping needed). */
  relaxOnly(dt: number): boolean {
    const f = 1 - this.params.cremaRelax * dt;
    let m = 0;
    const x = this.dX;
    const y = this.dY;
    for (let k = 0; k < x.length; k++) {
      x[k] *= f;
      y[k] *= f;
      const a = Math.abs(x[k]) + Math.abs(y[k]);
      if (a > m) m = a;
    }
    if (m < 2e-4) {
      x.fill(0);
      y.fill(0);
      return false;
    }
    return true;
  }

  /** Pack render data: A = (h, Dx, Dy, thickness), B = (dh/dx, dh/dy, speed, 0). */
  pack(outA: Float32Array, outB: Float32Array): void {
    const h = this.h;
    const dX = this.dX;
    const dY = this.dY;
    const u = this.u;
    const v = this.v;
    const inv2 = 1 / (2 * DX);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const k = j * N + i;
        const m = this.nearest[k];
        const mj = (m / N) | 0;
        const mi = m - mj * N;
        const hc = h[m];
        const l = this.insideAt(mi - 1, mj);
        const r = this.insideAt(mi + 1, mj);
        const d = this.insideAt(mi, mj - 1);
        const t = this.insideAt(mi, mj + 1);
        const gx = ((r >= 0 ? h[r] : hc) - (l >= 0 ? h[l] : hc)) * inv2;
        const gy = ((t >= 0 ? h[t] : hc) - (d >= 0 ? h[d] : hc)) * inv2;
        // Jacobian of the material map X = x + D -> crema areal density.
        const dxx = ((r >= 0 ? dX[r] : dX[m]) - (l >= 0 ? dX[l] : dX[m])) * inv2;
        const dxy = ((t >= 0 ? dX[t] : dX[m]) - (d >= 0 ? dX[d] : dX[m])) * inv2;
        const dyx = ((r >= 0 ? dY[r] : dY[m]) - (l >= 0 ? dY[l] : dY[m])) * inv2;
        const dyy = ((t >= 0 ? dY[t] : dY[m]) - (d >= 0 ? dY[d] : dY[m])) * inv2;
        const det = (1 + dxx) * (1 + dyy) - dxy * dyx;
        const fu = mj * (N + 1) + mi;
        const sp = Math.hypot(0.5 * (u[fu] + u[fu + 1]), 0.5 * (v[m] + v[m + N]));
        const o = k * 4;
        outA[o] = hc;
        outA[o + 1] = dX[m];
        outA[o + 2] = dY[m];
        outA[o + 3] = det < 0 ? 0 : det > 3 ? 3 : det;
        outB[o] = gx;
        outB[o + 1] = gy;
        outB[o + 2] = sp;
        outB[o + 3] = 0;
      }
    }
  }

  private insideAt(i: number, j: number): number {
    if (i < 0 || i >= N || j < 0 || j >= N) return -1;
    const q = j * N + i;
    return this.inside[q] ? q : -1;
  }

  /** Height (bilinear) at a cup-space point, for probes. */
  sampleHeight(x: number, y: number): number {
    const px = Math.min(N - 1.001, Math.max(0, (x + EXTENT) / DX - 0.5));
    const py = Math.min(N - 1.001, Math.max(0, (y + EXTENT) / DX - 0.5));
    const x0 = px | 0;
    const y0 = py | 0;
    const fx = px - x0;
    const fy = py - y0;
    const a = y0 * N + x0;
    const h = this.h;
    return (h[a] * (1 - fx) + h[a + 1] * fx) * (1 - fy) + (h[a + N] * (1 - fx) + h[a + N + 1] * fx) * fy;
  }

  stats(): { maxHeight: number; rmsHeight: number; maxCrema: number; kinetic: number } {
    let maxH = 0;
    let sum = 0;
    let maxD = 0;
    for (let n = 0; n < this.insideList.length; n++) {
      const k = this.insideList[n];
      const a = Math.abs(this.h[k]);
      if (a > maxH) maxH = a;
      sum += this.h[k] * this.h[k];
      const d = Math.hypot(this.dX[k], this.dY[k]);
      if (d > maxD) maxD = d;
    }
    let ke = 0;
    for (let k = 0; k < this.u.length; k++) ke += this.u[k] * this.u[k];
    for (let k = 0; k < this.v.length; k++) ke += this.v[k] * this.v[k];
    return {
      maxHeight: maxH,
      rmsHeight: Math.sqrt(sum / this.insideList.length),
      maxCrema: maxD,
      kinetic: ke * DX * DX * 0.5,
    };
  }
}

function cellX(i: number): number {
  return (i + 0.5) * DX - EXTENT;
}
