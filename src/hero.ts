// Hero animation: the Sun, travelling photons, and a panel catching them.
import { animate, reducedMotion, wlColor } from './util';

export function hero(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!;
  let W = 0, H = 0, dpr = 1;
  let stars: { x: number; y: number; r: number; p: number }[] = [];
  interface Ph { t: number; sx: number; sy: number; ex: number; ey: number; c: string; wl: number; dur: number }
  let ph: Ph[] = [];
  let sparks: { x: number; y: number; t: number }[] = [];
  let acc = 0;

  const geom = () => {
    const narrow = W < 700;
    const sun = { x: W * (narrow ? 0.8 : 0.8), y: H * (narrow ? 0.09 : 0.2), r: Math.min(W, H) * (narrow ? 0.1 : 0.085) };
    // panel: a parallelogram near the bottom right
    const pw = Math.min(W * (narrow ? 0.42 : 0.3), 420), phh = pw * 0.32;
    const px = narrow ? W * 0.06 : W - pw - W * 0.06, py = H * (narrow ? 0.2 : 0.72);
    return { sun, panel: { x: px, y: py, w: pw, h: phh, skew: pw * 0.18 } };
  };

  const resize = () => {
    const r = canvas.getBoundingClientRect();
    W = r.width; H = r.height; dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    stars = Array.from({ length: Math.round((W * H) / 6000) }, () => ({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.1 + 0.2, p: Math.random() * 6 }));
    ph = [];
  };

  const panelPoint = (g: ReturnType<typeof geom>, u: number, v: number) => {
    const p = g.panel;
    return [p.x + p.skew * (1 - v) + u * p.w, p.y + v * p.h] as const;
  };

  const spawn = (g: ReturnType<typeof geom>) => {
    const wl = Math.random() < 0.5 ? 420 + Math.random() * 300 : 700 + Math.random() * 500;
    const a = Math.random() * Math.PI * 2;
    const [ex, ey] = panelPoint(g, 0.05 + Math.random() * 0.9, 0.1 + Math.random() * 0.8);
    ph.push({ t: 0, sx: g.sun.x + Math.cos(a) * g.sun.r * 1.02, sy: g.sun.y + Math.sin(a) * g.sun.r * 1.02, ex, ey, c: wlColor(Math.min(wl, 760)), wl, dur: 2.2 + Math.random() * 0.8 });
  };

  const frame = (t: number, dt: number) => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const g = geom();
    for (const s of stars) {
      ctx.globalAlpha = 0.35 + 0.35 * Math.sin(t * 1.3 + s.p);
      ctx.fillStyle = '#e9e6ff'; ctx.fillRect(s.x, s.y, s.r, s.r);
    }
    ctx.globalAlpha = 1;
    // sun
    const { x, y, r } = g.sun;
    const pulse = 1 + 0.03 * Math.sin(t * 1.4);
    const cg = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * 4.2 * pulse);
    cg.addColorStop(0, 'rgba(255,214,120,0.55)'); cg.addColorStop(0.3, 'rgba(255,150,40,0.16)'); cg.addColorStop(1, 'rgba(255,120,30,0)');
    ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(x, y, r * 4.2 * pulse, 0, 7); ctx.fill();
    const sg = ctx.createRadialGradient(x - r * 0.25, y - r * 0.25, r * 0.1, x, y, r);
    sg.addColorStop(0, '#fff6d8'); sg.addColorStop(0.55, '#ffd06a'); sg.addColorStop(1, '#f39a1e');
    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();

    // panel
    const p = g.panel;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(p.x + p.skew, p.y); ctx.lineTo(p.x + p.skew + p.w, p.y); ctx.lineTo(p.x + p.w, p.y + p.h); ctx.lineTo(p.x, p.y + p.h); ctx.closePath();
    const pg = ctx.createLinearGradient(p.x, p.y, p.x + p.w, p.y + p.h);
    pg.addColorStop(0, '#1d2c5c'); pg.addColorStop(1, '#0f1838');
    ctx.fillStyle = pg; ctx.fill();
    ctx.strokeStyle = 'rgba(160,180,255,0.35)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.clip();
    ctx.strokeStyle = 'rgba(150,170,240,0.18)';
    for (let i = 1; i < 10; i++) { const [a1, b1] = panelPoint(g, i / 10, 0); const [a2, b2] = panelPoint(g, i / 10, 1); ctx.beginPath(); ctx.moveTo(a1, b1); ctx.lineTo(a2, b2); ctx.stroke(); }
    for (let j = 1; j < 4; j++) { const [a1, b1] = panelPoint(g, 0, j / 4); const [a2, b2] = panelPoint(g, 1, j / 4); ctx.beginPath(); ctx.moveTo(a1, b1); ctx.lineTo(a2, b2); ctx.stroke(); }
    ctx.restore();
    // panel legs
    ctx.strokeStyle = 'rgba(160,170,210,0.35)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(p.x + p.w * 0.25, p.y + p.h); ctx.lineTo(p.x + p.w * 0.25, p.y + p.h * 1.6); ctx.moveTo(p.x + p.w * 0.8, p.y + p.h); ctx.lineTo(p.x + p.w * 0.8, p.y + p.h * 1.6); ctx.stroke();

    // photons
    acc += dt * 5;
    while (acc > 1) { acc -= 1; spawn(g); }
    for (const q of ph) {
      q.t += dt / q.dur;
      const dx = q.ex - q.sx, dy = q.ey - q.sy, L = Math.hypot(dx, dy);
      const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
      const head = q.t * L, len = 38, lam = q.wl / 60;
      ctx.strokeStyle = q.c; ctx.globalAlpha = Math.min(1, q.t * 5) * 0.9; ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let s = 0; s <= len; s += 1.5) {
        const d = head - len + s; if (d < 0) continue;
        const env = Math.sin((Math.PI * s) / len);
        const a = 3.2 * env * Math.sin((2 * Math.PI * (d - t * 200)) / lam);
        const px2 = q.sx + ux * d + nx * a, py2 = q.sy + uy * d + ny * a;
        if (s === 0 || d - 1.5 < 0) ctx.moveTo(px2, py2); else ctx.lineTo(px2, py2);
      }
      ctx.stroke();
      if (q.t >= 1 && q.wl < 1107) sparks.push({ x: q.ex, y: q.ey, t: 0 });
    }
    ctx.globalAlpha = 1;
    ph = ph.filter((q) => q.t < 1);
    for (const s of sparks) {
      s.t += dt;
      ctx.fillStyle = `rgba(110,160,255,${Math.max(0, 0.9 - s.t * 1.6)})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, 1.5 + s.t * 8, 0, 7); ctx.fill();
    }
    sparks = sparks.filter((s) => s.t < 0.6);
  };

  new ResizeObserver(() => { resize(); if (reducedMotion()) staticFrame(); }).observe(canvas);
  resize();
  const staticFrame = () => { for (let i = 0; i < 60; i++) frame(i * 0.05, 0.05); };
  if (reducedMotion()) staticFrame();
  else animate(canvas, frame);
}
