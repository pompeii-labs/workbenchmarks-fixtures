// Ski vs. scenery: islands, gate pylons and marker buoys, ramp skirts and the
// free-roam buoys. Works for any Player; returns the hardest hit (or null) so
// the caller can do splashes / sound / camera shake.
import { waveHeight } from './waves.js';

export function collideScenery(ski, { islands, track, buoys }, t) {
  const p = ski.pos, vel = ski.vel;
  let hit = null;
  const report = (x, y, z, strength, kind) => {
    if (!hit || strength > hit.strength) hit = { x, y, z, strength, kind };
  };
  // bounce off a circle; returns the closing speed (or 0)
  const bounce = (nx, nz, k, damp) => {
    const vn = vel.x * nx + vel.z * nz;
    if (vn >= 0) return 0;
    vel.x -= k * vn * nx;
    vel.z -= k * vn * nz;
    if (damp < 1) {
      vel.x *= damp;
      vel.z *= damp;
    }
    return -vn;
  };

  if (islands) {
    for (const c of islands.colliders) {
      const dx = p.x - c.x, dz = p.z - c.z;
      const d = Math.hypot(dx, dz);
      if (d < c.r) {
        const nx = dx / d, nz = dz / d;
        p.x = c.x + nx * c.r;
        p.z = c.z + nz * c.r;
        const s = bounce(nx, nz, 1.6, 0.6);
        if (s > 6) report(p.x, p.y, p.z, 0.8, 'island');
      }
    }
  }
  if (track) {
    for (const c of track.colliders) {
      const dx = p.x - c.x, dz = p.z - c.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < c.r * c.r && p.y < c.y + 3.6) {
        const d = Math.sqrt(d2) || 1;
        const nx = dx / d, nz = dz / d;
        const s = bounce(nx, nz, 1.5, 1);
        if (s > 3) report(c.x, p.y, c.z, 0.4, 'pylon');
        p.x = c.x + nx * c.r;
        p.z = c.z + nz * c.r;
      }
    }
    const wall = track.rampWall(p.x, p.z, p.y, t);
    if (wall) {
      p.x = wall.x;
      p.z = wall.z;
      const s = bounce(wall.nx, wall.nz, 1.5, 0.7);
      if (s > 4) report(p.x, p.y, p.z, 0.6, 'ramp');
    }
  }
  if (buoys) {
    for (const b of buoys.items) {
      if (b.hidden) continue;
      const dx = p.x - b.x, dz = p.z - b.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 1.6 * 1.6 && p.y < waveHeight(b.x, b.z, t) + 1.5) {
        const d = Math.sqrt(d2) || 1;
        const nx = dx / d, nz = dz / d;
        const s = bounce(nx, nz, 1.5, 1);
        if (s > 0) {
          b.tilt = Math.min(1.2, s * 0.08);
          report(b.x, p.y, b.z, 0.4, 'buoy');
        }
        p.x = b.x + nx * 1.6;
        p.z = b.z + nz * 1.6;
      }
    }
  }
  return hit;
}
