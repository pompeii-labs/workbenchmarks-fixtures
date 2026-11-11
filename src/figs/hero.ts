// Hero backdrop: the sun in the corner and a slow rain of photons.
import { drawPhoton, loop, reducedMotion } from '../lib.ts';
import { wavelengthCss } from '../physics.ts';

interface P { x: number; y: number; nm: number; phase: number; speed: number; len: number }

export function hero(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!;
  let w = 0, hgt = 0, dpr = 1;
  const photons: P[] = [];
  const dir = { x: -0.62, y: 0.785 };
  let sun = { x: 0, y: 0, r: 0 };

  const spawn = (anywhere: boolean): P => {
    // Start on a line through the sun, perpendicular to the travel direction.
    const spread = (Math.random() - 0.5) * Math.hypot(w, hgt) * 1.5;
    const back = anywhere ? Math.random() * Math.hypot(w, hgt) * 1.2 : 0;
    return {
      x: sun.x + -dir.y * spread + dir.x * back,
      y: sun.y + dir.x * spread + dir.y * back,
      nm: Math.random() < 0.6 ? 570 + Math.random() * 40 : 440 + Math.random() * 230,
      phase: Math.random() * 6.28,
      speed: 90 + Math.random() * 70,
      len: 26 + Math.random() * 22,
    };
  };

  const resize = () => {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = r.width; hgt = r.height;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(hgt * dpr);
    sun = { x: w * 0.88, y: Math.min(hgt * 0.1, 90), r: Math.max(46, Math.min(w, hgt) * 0.11) };
    photons.length = 0;
    const n = Math.round(Math.min(46, 12 + w / 34));
    for (let i = 0; i < n; i++) photons.push(spawn(true));
    draw(0);
  };

  const draw = (dt: number) => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, hgt);
    // Sun: a soft corona and a disc.
    const g = ctx.createRadialGradient(sun.x, sun.y, sun.r * 0.6, sun.x, sun.y, sun.r * 5.5);
    g.addColorStop(0, 'rgba(255,190,80,0.55)');
    g.addColorStop(0.25, 'rgba(255,150,40,0.16)');
    g.addColorStop(1, 'rgba(255,140,30,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, hgt);
    const d = ctx.createRadialGradient(sun.x - sun.r * 0.2, sun.y - sun.r * 0.2, 0, sun.x, sun.y, sun.r);
    d.addColorStop(0, '#fff6d8'); d.addColorStop(0.6, '#ffd166'); d.addColorStop(1, '#ff9f1c');
    ctx.fillStyle = d;
    ctx.beginPath(); ctx.arc(sun.x, sun.y, sun.r, 0, Math.PI * 2); ctx.fill();

    for (let i = 0; i < photons.length; i++) {
      const p = photons[i];
      p.x += dir.x * p.speed * dt; p.y += dir.y * p.speed * dt; p.phase -= dt * 9;
      if (p.y > hgt + 60 || p.x < -60) photons[i] = spawn(false);
      const dist = Math.hypot(p.x - sun.x, p.y - sun.y);
      if (dist < sun.r + 6) continue;
      // Fade out towards the text at the bottom-left so the copy stays readable.
      const fade = Math.max(0, Math.min(1, (dist - sun.r) / 80)) * Math.max(0.12, 1 - (p.y / hgt) * 0.95);
      drawPhoton(ctx, p.x, p.y, dir.x, dir.y, wavelengthCss(p.nm, 0.75 * fade), p.phase, p.len, 3.5, 3);
    }
  };

  new ResizeObserver(resize).observe(canvas);
  resize();
  if (!reducedMotion()) loop(canvas, (dt) => draw(dt));
}
