// Lap timer, best / last lap, gate splits, minimap and the wrong-way warning.
const $ = (id) => document.getElementById(id);

export function fmtTime(t) {
  if (t === null || t === undefined || !isFinite(t)) return '-:--.--';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

export class RaceHud {
  constructor(track, isTouch) {
    this.track = track;
    this.el = {
      lapN: $('lap-n'), time: $('lap-time'), best: $('lap-best'), last: $('lap-last'), gate: $('gate-info'),
      split: $('split'), wrong: $('wrongway'), box: document.querySelector('.race-box'),
    };
    this.splitTimer = 0;
    this.wrongT = 0;
    this.flash = 0;

    // ---- minimap: north-up view of the course, screen-right = world -x ----
    this.canvas = $('minimap');
    this.ctx = this.canvas.getContext('2d');
    const size = isTouch ? 112 : 180;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = this.canvas.height = Math.round(size * dpr);
    this.canvas.style.width = this.canvas.style.height = `${size}px`;
    this.size = size;
    this.dpr = dpr;
    const { px, pz, n } = track.layout;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < n; i++) {
      minX = Math.min(minX, px[i]);
      maxX = Math.max(maxX, px[i]);
      minZ = Math.min(minZ, pz[i]);
      maxZ = Math.max(maxZ, pz[i]);
    }
    const pad = 14;
    const sc = (size - pad * 2) / Math.max(maxX - minX, maxZ - minZ);
    const ox = pad + (size - pad * 2 - (maxX - minX) * sc) / 2;
    const oy = pad + (size - pad * 2 - (maxZ - minZ) * sc) / 2;
    this.map = (x, z) => [ox + (maxX - x) * sc, oy + (maxZ - z) * sc];
    this.sc = sc;
    this.path = new Path2D();
    for (let i = 0; i <= n; i++) {
      const [cx, cy] = this.map(px[i % n], pz[i % n]);
      if (i === 0) this.path.moveTo(cx, cy);
      else this.path.lineTo(cx, cy);
    }
    this.reset();
  }

  reset() {
    this.splitTimer = 0;
    this.wrongT = 0;
    this.el.split.className = '';
    this.el.split.textContent = '';
  }

  showSplit(ev) {
    const el = this.el.split;
    if (ev.delta === null) {
      el.className = 'show';
      el.textContent = fmtTime(ev.split);
    } else {
      el.className = 'show ' + (ev.delta < 0 ? 'ahead' : 'behind');
      el.textContent = `${ev.delta < 0 ? '−' : '+'}${Math.abs(ev.delta).toFixed(2)}`;
    }
    this.splitTimer = 2.2;
  }

  showLap(ev) {
    this.flash = 1.5;
    const el = this.el.split;
    el.className = 'show ' + (ev.best ? 'ahead' : 'behind');
    el.textContent = ev.best ? 'BEST LAP!' : `LAP ${fmtTime(ev.time)}`;
    this.splitTimer = 3;
  }

  update(dt, t, player) {
    const tr = this.track;
    const el = this.el;
    const N = tr.gates.length;
    el.lapN.textContent = tr.racing ? String(tr.lap) : '-';
    el.time.textContent = fmtTime(tr.lapTime(t));
    el.best.textContent = fmtTime(tr.best);
    el.last.textContent = fmtTime(tr.lastLap);
    if (!tr.racing) el.gate.textContent = 'Ride through the START arch';
    else if (tr.next === 0) el.gate.textContent = 'Back to the arch to finish!';
    else el.gate.textContent = `GATE ${tr.next} / ${N - 1}`;
    if (this.splitTimer > 0) {
      this.splitTimer -= dt;
      if (this.splitTimer <= 0) el.split.classList.remove('show');
    }
    if (this.flash > 0) this.flash -= dt;
    el.box.classList.toggle('flash', this.flash > 0);

    // wrong way: riding against the course while racing
    const near = tr.nearest(player.pos.x, player.pos.z);
    const sp = player.speed;
    const along = sp > 0.1 ? (player.vel.x * near.tx + player.vel.z * near.tz) / sp : 0;
    if (tr.racing && near.d < 45 && sp > 6 && along < -0.5 && !player.airborne) this.wrongT += dt;
    else this.wrongT = Math.max(0, this.wrongT - dt * 3);
    el.wrong.classList.toggle('show', this.wrongT > 0.8);

    this.drawMap(t, player);
  }

  drawMap(t, player) {
    const g = this.ctx;
    const S = this.size;
    const tr = this.track;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, S, S);
    g.fillStyle = 'rgba(0, 30, 60, 0.38)';
    g.beginPath();
    if (g.roundRect) g.roundRect(0, 0, S, S, 16);
    else g.rect(0, 0, S, S);
    g.fill();
    g.lineJoin = g.lineCap = 'round';
    g.strokeStyle = 'rgba(255,255,255,0.28)';
    g.lineWidth = Math.max(4, tr.gates[0].half * 2 * this.sc);
    g.stroke(this.path);
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = 1.5;
    g.stroke(this.path);
    // ramps
    g.fillStyle = '#3fa9ff';
    for (const r of tr.ramps) {
      const [x, y] = this.map(r.cx, r.cz);
      g.fillRect(x - 2.5, y - 2.5, 5, 5);
    }
    // start line
    const s0 = tr.gates[0];
    const [sx, sy] = this.map(s0.x, s0.z);
    g.strokeStyle = '#fff';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(sx + s0.rx * 6, sy + s0.rz * 6);
    g.lineTo(sx - s0.rx * 6, sy - s0.rz * 6);
    g.stroke();
    // next gate
    const ng = tr.nextGate;
    const [gx, gy] = this.map(ng.x, ng.z);
    g.fillStyle = '#ffcc33';
    g.beginPath();
    g.arc(gx, gy, 4 + Math.sin(t * 6) * 1.2, 0, Math.PI * 2);
    g.fill();
    // player
    let [px, py] = this.map(player.pos.x, player.pos.z);
    px = Math.max(6, Math.min(S - 6, px));
    py = Math.max(6, Math.min(S - 6, py));
    const h = player.heading + player.airSpin;
    const a = Math.atan2(-Math.cos(h), -Math.sin(h));
    g.save();
    g.translate(px, py);
    g.rotate(a);
    g.fillStyle = '#ff4d4d';
    g.strokeStyle = '#fff';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(7, 0);
    g.lineTo(-5, 4.5);
    g.lineTo(-2.5, 0);
    g.lineTo(-5, -4.5);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }
}
