// Procedural playfield artwork drawn to a canvas texture in table units.
import * as THREE from 'three';
import { BUMPERS, LANES, SLINGS } from '../sim/table';

export const CABINET = { left: -5.2, right: 6.2, bottom: -11.2, top: 12.2 };

export function createPlayfieldTexture(): THREE.CanvasTexture {
  const W = 1024;
  const H = 2048;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const w = CABINET.right - CABINET.left;
  const h = CABINET.top - CABINET.bottom;
  const sx = W / w;
  const sy = H / h;
  const X = (x: number) => (x - CABINET.left) * sx;
  const Y = (y: number) => (CABINET.top - y) * sy;
  const S = (d: number) => d * sx;

  // Base: deep midnight gradient.
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#1b0f3d');
  g.addColorStop(0.45, '#0d1330');
  g.addColorStop(1, '#150826');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Perspective grid, synthwave style, on the lower half.
  ctx.save();
  ctx.strokeStyle = 'rgba(122, 92, 255, 0.22)';
  ctx.lineWidth = 2;
  const horizon = Y(0.6);
  for (let i = -12; i <= 12; i++) {
    ctx.beginPath();
    ctx.moveTo(X(0) + i * S(0.25), horizon);
    ctx.lineTo(X(0) + i * S(1.6), Y(-10.5));
    ctx.stroke();
  }
  for (let i = 0; i < 14; i++) {
    const t = Math.pow(i / 13, 1.8);
    const y = horizon + (Y(-10.5) - horizon) * t;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.restore();

  // Sun disc behind the bumpers.
  const sun = ctx.createRadialGradient(X(0), Y(3.4), S(0.2), X(0), Y(3.4), S(3.4));
  sun.addColorStop(0, 'rgba(255, 45, 149, 0.55)');
  sun.addColorStop(0.6, 'rgba(255, 45, 149, 0.12)');
  sun.addColorStop(1, 'rgba(255, 45, 149, 0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, W, H);

  // Bumper halos.
  const colors = ['#ff2d95', '#22e4ff', '#ffb020'];
  BUMPERS.forEach((b, i) => {
    ctx.strokeStyle = colors[i];
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(X(b.x), Y(b.y), S(b.r + 0.32), 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.25;
    ctx.lineWidth = 16;
    ctx.stroke();
    ctx.globalAlpha = 1;
  });

  // Top lanes: guide stripes.
  LANES.forEach((lane) => {
    ctx.fillStyle = 'rgba(34, 228, 255, 0.10)';
    ctx.fillRect(X(lane.x - lane.halfWidth + 0.1), Y(lane.y + 0.8), S(lane.halfWidth * 2 - 0.2), S(2.2));
  });

  // Slingshot glow on the field.
  ctx.fillStyle = 'rgba(255, 45, 149, 0.18)';
  SLINGS.forEach((tri) => {
    ctx.beginPath();
    tri.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y))));
    ctx.closePath();
    ctx.lineWidth = 30;
    ctx.strokeStyle = 'rgba(255, 45, 149, 0.15)';
    ctx.stroke();
  });

  // Plunger lane stripe.
  ctx.fillStyle = 'rgba(255, 176, 32, 0.08)';
  ctx.fillRect(X(4.55), Y(5.0), S(0.9), S(14.5));

  // Titles and labels.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.save();
  ctx.translate(X(0), Y(-3.6));
  ctx.font = `900 ${Math.round(S(0.95))}px "Trebuchet MS", "Arial Black", sans-serif`;
  ctx.shadowColor = '#ff2d95';
  ctx.shadowBlur = 30;
  ctx.fillStyle = '#ff6fc0';
  ctx.fillText('NEON', 0, -S(0.5));
  ctx.shadowColor = '#22e4ff';
  ctx.fillStyle = '#8ff4ff';
  ctx.fillText('PINBALL', 0, S(0.5));
  ctx.restore();

  ctx.font = `700 ${Math.round(S(0.22))}px "Trebuchet MS", sans-serif`;
  ctx.fillStyle = 'rgba(255, 210, 140, 0.9)';
  ['2X', '3X', '4X', '5X'].forEach((label, i) => {
    ctx.fillText(label, X(-1.35 + i * 0.9), Y(-2.05));
  });
  ctx.fillStyle = 'rgba(140, 255, 190, 0.9)';
  ctx.fillText('SHOOT AGAIN', X(0), Y(-10.0));
  ctx.fillStyle = 'rgba(160, 240, 255, 0.85)';
  ctx.fillText('LIGHT ALL LANES', X(0), Y(5.9));
  ctx.save();
  ctx.translate(X(5.0), Y(-1.5));
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = 'rgba(255, 200, 100, 0.8)';
  ctx.fillText('SHOOT', 0, 0);
  ctx.restore();

  // Fine speckle so the field doesn't read as a flat fill.
  let seed = 1234567;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < 1600; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.03 + rnd() * 0.08})`;
    const r = rnd() * 2.2;
    ctx.fillRect(rnd() * W, rnd() * H, r, r);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
