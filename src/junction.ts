// 2D simulation of photo-generated carriers in a p–n junction, drawn with its band diagram.
import { onWidth, animate, clamp, reducedMotion } from './util';

interface Carrier { e: boolean; x: number; y: number; age: number; life: number; jit: number }
interface WireDot { s: number }
interface Flash { x: number; y: number; t: number; kind: 'gen' | 'rec' | 'fill' }
interface Photon { x: number; y: number; ty: number; c: string }

const DEP_L = 0.44, DEP_R = 0.56; // depletion region (fractions of slab width)
const PHOTON_COLOURS = ['#e0262f', '#ff8a00', '#ffd400', '#3ccf5a', '#2f8bff', '#6f4cff', '#8c2a3c'];

export function junctionSim(host: HTMLElement, readout: HTMLElement, controls: HTMLElement) {
  const canvas = host.querySelector('canvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  let W = 600, H = 400, dpr = 1;
  let junction = true, light = true;
  let carriers: Carrier[] = [], wire: WireDot[] = [], flashes: Flash[] = [], photons: Photon[] = [];
  let spawnAcc = 0, collected = 0, recombined = 0, generated = 0;
  const recent: number[] = [];
  let simT = 0;

  // geometry (CSS px)
  let g = { sx0: 0, sx1: 0, sy0: 0, sy1: 0, by0: 0, by1: 0, wireTop: 0 };
  const layout = () => {
    const narrow = W < 560;
    H = Math.round(narrow ? W * 1.15 : W * 0.6);
    const pad = narrow ? 18 : 30;
    g.sx0 = pad + 10; g.sx1 = W - pad - 10;
    g.wireTop = narrow ? 30 : 34;
    g.sy0 = g.wireTop + (narrow ? 56 : 50); g.sy1 = g.sy0 + H * (narrow ? 0.3 : 0.34);
    g.by0 = g.sy1 + (narrow ? 40 : 44); g.by1 = H - 26;
    canvas.style.height = H + 'px';
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  };

  const sx = (f: number) => g.sx0 + f * (g.sx1 - g.sx0);
  const sy = (f: number) => g.sy0 + f * (g.sy1 - g.sy0);
  // band diagram: conduction-band edge height as fraction (0 = top) across the slab
  const step = (x: number) => (junction ? 1 / (1 + Math.exp(-(x - 0.5) / 0.022)) : 0.5);
  const ecY = (x: number) => { const hi = g.by0 + (g.by1 - g.by0) * 0.12, lo = g.by0 + (g.by1 - g.by0) * 0.44; return hi + (lo - hi) * step(x); };
  const gapPx = () => (g.by1 - g.by0) * 0.36;
  const evY = (x: number) => ecY(x) + gapPx();

  const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const expLife = (m: number) => -Math.log(Math.random() || 1e-6) * m;

  const generate = (x: number, y: number) => {
    const life = junction ? 2.6 : 1.4;
    carriers.push({ e: true, x, y, age: 0, life: expLife(life), jit: Math.random() });
    carriers.push({ e: false, x: x + 0.004, y, age: 0, life: expLife(life), jit: Math.random() });
    flashes.push({ x, y, t: 0, kind: 'gen' });
    generated++;
  };

  const firePhoton = (x?: number, y?: number) => {
    const fx = x ?? 0.03 + Math.random() * 0.94;
    const depth = y ?? Math.min(0.97, 0.04 + Math.pow(Math.random(), 1.4) * 0.95);
    photons.push({ x: fx, y: -0.25, ty: depth, c: PHOTON_COLOURS[(Math.random() * PHOTON_COLOURS.length) | 0] });
  };

  const D = 0.018; // diffusion (slab-widths^2 per s)
  const step2 = (dt: number) => {
    simT += dt;
    if (light) {
      spawnAcc += dt * 2.4;
      while (spawnAcc > 1) { spawnAcc -= 1; firePhoton(); }
    }
    for (const p of photons) p.y += dt * 2.2;
    photons = photons.filter((p) => { if (p.y >= p.ty) { generate(p.x, p.ty); return false; } return true; });

    const sd = Math.sqrt(2 * D * dt);
    for (const c of carriers) {
      c.age += dt;
      let vx = 0;
      if (junction) {
        const inDep = c.x > DEP_L && c.x < DEP_R;
        if (inDep) vx = c.e ? 1.4 : -1.4; // field sweeps electrons to n (right), holes to p (left)
        else if (c.e && c.x >= DEP_R) vx = 0.35; // electrons on the n side are majority carriers: flow to the contact
        else if (!c.e && c.x <= DEP_L) vx = -0.35;
      }
      c.x += vx * dt + sd * gauss();
      c.y = clamp(c.y + sd * gauss() * 0.9, 0.02, 0.98);
    }
    // contacts & recombination
    const keep: Carrier[] = [];
    for (const c of carriers) {
      const minority = !junction || (c.e ? c.x < DEP_L : c.x > DEP_R);
      if (c.x >= 1) {
        if (junction && c.e) { collected++; recent.push(simT); wire.push({ s: 0 }); continue; }
        if (junction && !c.e) { c.x = 0.995; } // a hole can't leave through the n contact here
        else c.x = 2 - c.x;
      }
      if (c.x <= 0) {
        if (junction && !c.e) { continue; } // hole filled by an electron arriving from the wire
        c.x = -c.x;
      }
      if (minority && c.age > c.life) { recombined += 0.5; flashes.push({ x: c.x, y: c.y, t: 0, kind: 'rec' }); continue; }
      keep.push(c);
    }
    carriers = keep;
    // pair recombination when an electron meets a hole (undoped case, mostly)
    if (!junction) {
      for (let i = 0; i < carriers.length; i++) {
        const a = carriers[i]; if (!a.e) continue;
        for (let j = 0; j < carriers.length; j++) {
          const b = carriers[j]; if (b.e || a.age < 0.4 || b.age < 0.4) continue;
          if (Math.abs(a.x - b.x) < 0.012 && Math.abs(a.y - b.y) < 0.03) { a.age = 1e9; b.age = 1e9; a.life = 0; b.life = 0; }
        }
      }
    }
    if (carriers.length > 400) carriers.splice(0, carriers.length - 400);
    for (const w of wire) w.s += dt * 0.55;
    wire = wire.filter((w) => { if (w.s >= 1) { flashes.push({ x: 0, y: 0.5, t: 0, kind: 'fill' }); return false; } return true; });
    for (const f of flashes) f.t += dt;
    flashes = flashes.filter((f) => f.t < 0.6);
    while (recent.length && recent[0] < simT - 5) recent.shift();
  };

  // wire path: from right contact, up and over, down into left contact
  const wirePt = (s: number): [number, number] => {
    const xr = g.sx1 + 4, xl = g.sx0 - 4, yt = g.wireTop, ym = (g.sy0 + g.sy1) / 2;
    const seg1 = ym - yt, seg2 = xr - xl, seg3 = ym - yt, L = seg1 + seg2 + seg3;
    let d = s * L;
    if (d < seg1) return [xr + 10, ym - d];
    d -= seg1;
    if (d < seg2) return [xr + 10 - d * ((xr - xl + 20) / seg2), yt];
    d -= seg2;
    return [xl - 10, yt + d];
  };

  const draw = () => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#fbf9f5'; ctx.fillRect(0, 0, W, H);
    const font = (s: number, w = 500) => `${w} ${s}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
    const narrow = W < 560;

    // wire
    ctx.strokeStyle = '#b07d3a'; ctx.lineWidth = 4; ctx.lineJoin = 'round';
    ctx.beginPath();
    const ym = (g.sy0 + g.sy1) / 2;
    ctx.moveTo(g.sx1, ym); ctx.lineTo(g.sx1 + 10, ym); ctx.lineTo(g.sx1 + 10, g.wireTop); ctx.lineTo(g.sx0 - 10, g.wireTop); ctx.lineTo(g.sx0 - 10, ym); ctx.lineTo(g.sx0, ym);
    ctx.stroke();
    // lamp on the wire
    const lx = (g.sx0 + g.sx1) / 2, ly = g.wireTop;
    const rate = recent.length / 5;
    const glow = junction ? clamp(rate / 2.2, 0, 1) : 0;
    const rg = ctx.createRadialGradient(lx, ly, 2, lx, ly, 34);
    rg.addColorStop(0, `rgba(255,214,90,${0.85 * glow})`); rg.addColorStop(1, 'rgba(255,214,90,0)');
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(lx, ly, 34, 0, 7); ctx.fill();
    ctx.fillStyle = glow > 0.05 ? '#ffe7a0' : '#efe9de'; ctx.strokeStyle = '#8b7a5c'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(lx, ly, 11, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#6b655c'; ctx.font = font(11); ctx.textAlign = 'left';
    ctx.fillText('lamp', lx + 16, ly - 6);
    // wire electrons
    for (const w of wire) { const [x, y] = wirePt(w.s); ctx.fillStyle = '#2a64e8'; ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill(); }

    // slab background
    const h = g.sy1 - g.sy0;
    if (junction) {
      ctx.fillStyle = '#fbe9ef'; ctx.fillRect(sx(0), g.sy0, sx(DEP_L) - sx(0), h);
      ctx.fillStyle = '#e7eefc'; ctx.fillRect(sx(DEP_R), g.sy0, sx(1) - sx(DEP_R), h);
      const grd = ctx.createLinearGradient(sx(DEP_L), 0, sx(DEP_R), 0);
      grd.addColorStop(0, '#f3dbe5'); grd.addColorStop(1, '#dbe4f7');
      ctx.fillStyle = grd; ctx.fillRect(sx(DEP_L), g.sy0, sx(DEP_R) - sx(DEP_L), h);
      // fixed ions
      ctx.font = font(11, 700); ctx.textAlign = 'center';
      for (let i = 0; i < 6; i++) {
        const yy = g.sy0 + ((i + 0.5) / 6) * h;
        ctx.fillStyle = '#a3285a'; ctx.fillText('−', sx(DEP_L + 0.02), yy + 4);
        ctx.fillStyle = '#2a4fa8'; ctx.fillText('+', sx(DEP_R - 0.02), yy + 4);
      }
      // field arrow
      ctx.strokeStyle = '#1c1b18'; ctx.fillStyle = '#1c1b18'; ctx.lineWidth = 1.3;
      const ay = g.sy0 - 12;
      ctx.beginPath(); ctx.moveTo(sx(DEP_R), ay); ctx.lineTo(sx(DEP_L) + 6, ay); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx(DEP_L), ay); ctx.lineTo(sx(DEP_L) + 7, ay - 4); ctx.lineTo(sx(DEP_L) + 7, ay + 4); ctx.fill();
      ctx.font = font(11); ctx.textAlign = 'center';
      ctx.fillText('built-in field', (sx(DEP_L) + sx(DEP_R)) / 2, ay - 6);
    } else {
      ctx.fillStyle = '#eeeae3'; ctx.fillRect(sx(0), g.sy0, sx(1) - sx(0), h);
    }
    ctx.strokeStyle = '#cfc7b9'; ctx.lineWidth = 1; ctx.strokeRect(sx(0), g.sy0, sx(1) - sx(0), h);
    // contacts
    ctx.fillStyle = '#9aa0a6'; ctx.fillRect(sx(0) - 6, g.sy0, 6, h); ctx.fillRect(sx(1), g.sy0, 6, h);
    // region labels
    ctx.font = font(narrow ? 11.5 : 13, 700); ctx.textAlign = 'center';
    if (junction) {
      ctx.fillStyle = '#a3285a'; ctx.fillText('p-type', sx(DEP_L / 2), g.sy1 - 8);
      ctx.fillStyle = '#2a4fa8'; ctx.fillText('n-type', sx((1 + DEP_R) / 2), g.sy1 - 8);
    } else { ctx.fillStyle = '#6b655c'; ctx.fillText('undoped silicon', sx(0.5), g.sy1 - 8); }

    // photons
    for (const p of photons) {
      const x = sx(p.x), y1 = g.sy0 + p.y * h;
      ctx.strokeStyle = p.c; ctx.lineWidth = 2; ctx.beginPath();
      for (let k = 0; k <= 24; k++) { const yy = y1 - 30 + k * 1.25; const xx = x + 4 * Math.sin(k * 0.9); if (k) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy); }
      ctx.stroke();
    }
    // flashes
    for (const f of flashes) {
      const a = 1 - f.t / 0.6;
      let x: number, y: number;
      if (f.kind === 'fill') { x = sx(0) - 3; y = ym; } else { x = sx(f.x); y = sy(f.y); }
      ctx.fillStyle = f.kind === 'gen' ? `rgba(255,220,90,${a * 0.8})` : f.kind === 'rec' ? `rgba(240,138,36,${a * 0.55})` : `rgba(42,100,232,${a * 0.5})`;
      ctx.beginPath(); ctx.arc(x, y, 4 + f.t * 26, 0, 7); ctx.fill();
    }
    // carriers in slab
    for (const c of carriers) {
      const x = sx(clamp(c.x, 0, 1)), y = sy(c.y);
      if (c.e) { ctx.fillStyle = '#2a64e8'; ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill(); }
      else { ctx.strokeStyle = '#e0457b'; ctx.lineWidth = 2; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 3.8, 0, 7); ctx.fill(); ctx.stroke(); }
    }

    // band diagram
    ctx.fillStyle = '#6b655c'; ctx.font = font(11, 600); ctx.textAlign = 'left';
    ctx.fillText('Same slice on the energy ladder', sx(0), g.by0 - 8);
    ctx.lineWidth = 2.2;
    for (const which of ['c', 'v'] as const) {
      ctx.strokeStyle = which === 'c' ? '#2a64e8' : '#e0457b';
      ctx.beginPath();
      for (let k = 0; k <= 200; k++) { const f = k / 200; const yy = which === 'c' ? ecY(f) : evY(f); if (k) ctx.lineTo(sx(f), yy); else ctx.moveTo(sx(f), yy); }
      ctx.stroke();
    }
    // fill bands lightly
    ctx.fillStyle = 'rgba(42,100,232,0.06)'; ctx.beginPath(); ctx.moveTo(sx(0), g.by0);
    for (let k = 0; k <= 100; k++) ctx.lineTo(sx(k / 100), ecY(k / 100));
    ctx.lineTo(sx(1), g.by0); ctx.fill();
    ctx.fillStyle = 'rgba(224,69,123,0.07)'; ctx.beginPath(); ctx.moveTo(sx(0), g.by1);
    for (let k = 0; k <= 100; k++) ctx.lineTo(sx(k / 100), evY(k / 100));
    ctx.lineTo(sx(1), g.by1); ctx.fill();
    ctx.font = font(narrow ? 10.5 : 11.5, 600);
    ctx.fillStyle = '#2a4fa8'; ctx.textAlign = 'right';
    ctx.fillText(narrow ? 'conduction band' : 'conduction band (free electrons)', sx(1) - 4, ecY(1) - 8);
    ctx.fillStyle = '#a3285a'; ctx.textAlign = 'left';
    ctx.fillText(narrow ? 'valence band' : 'valence band (holes)', sx(0) + 4, evY(0) + 18);
    if (junction) {
      ctx.fillStyle = '#1c1b18'; ctx.textAlign = 'center'; ctx.font = font(narrow ? 10.5 : 11.5, 500);
      ctx.fillText('electrons roll down →', sx(0.5) + (narrow ? 34 : 60), ecY(0.5) - 12);
      ctx.fillText('← holes float up', sx(0.5) - (narrow ? 30 : 50), evY(0.5) + 20);
    }
    for (const c of carriers) {
      const f = clamp(c.x, 0, 1), x = sx(f);
      if (c.e) { const y = ecY(f) - 5 - c.jit * 12; ctx.fillStyle = '#2a64e8'; ctx.beginPath(); ctx.arc(x, y, 3.4, 0, 7); ctx.fill(); }
      else { const y = evY(f) + 5 + c.jit * 12; ctx.strokeStyle = '#e0457b'; ctx.fillStyle = '#fff'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(x, y, 3.2, 0, 7); ctx.fill(); ctx.stroke(); }
    }
  };

  const updateReadout = () => {
    const rate = recent.length / 5;
    readout.innerHTML =
      `<span><i class="dot" style="background:#ffd75a"></i>Pairs made <b>${generated}</b></span>` +
      `<span><i class="dot" style="background:#2a64e8"></i>Electrons through the wire <b>${collected}</b></span>` +
      `<span><i class="dot" style="background:#f08a24"></i>Pairs lost to recombination <b>${Math.floor(recombined)}</b></span>` +
      `<span>Current now <b>${junction ? rate.toFixed(1) : '0.0'}</b> electrons/s</span>`;
  };

  const reset = () => { carriers = []; wire = []; photons = []; flashes = []; collected = 0; recombined = 0; generated = 0; recent.length = 0; };
  const bindToggle = (attrName: string, set: (on: boolean) => void) => {
    const btns = Array.from(controls.querySelectorAll(`[data-${attrName}]`)) as HTMLButtonElement[];
    btns.forEach((b) => b.addEventListener('click', () => {
      btns.forEach((o) => { o.classList.toggle('on', o === b); o.setAttribute('aria-pressed', String(o === b)); });
      set(b.dataset[attrName] === 'on');
    }));
  };
  bindToggle('junction', (on) => { junction = on; reset(); });
  bindToggle('light', (on) => { light = on; });

  canvas.addEventListener('click', (e) => {
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    if (y >= g.sy0 && y <= g.sy1 && x >= g.sx0 && x <= g.sx1) firePhoton((x - g.sx0) / (g.sx1 - g.sx0), (y - g.sy0) / (g.sy1 - g.sy0));
  });

  onWidth(host, (w) => { W = w; layout(); draw(); });
  let ro = 0;
  animate(host, (_t, dt) => {
    step2(reducedMotion() ? dt * 0.5 : dt);
    draw();
    if ((ro = (ro + 1) % 10) === 0) updateReadout();
  });
  updateReadout();
}
