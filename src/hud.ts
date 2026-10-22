import type { SimState, TrickResult } from './sim/sim';

function $(id: string): HTMLElement {
  const e = document.getElementById(id);
  if (!e) throw new Error(`Missing #${id}`);
  return e;
}

export class Hud {
  private readonly score = $('score-value');
  private readonly timer = $('timer-value');
  private readonly combo = $('combo');
  private readonly swell = $('swell-fill');
  private readonly swellBox = $('swell');
  private readonly stamina = $('stamina-fill');
  private readonly height = $('height');
  private readonly pops = $('pops');
  private readonly title = $('title-screen');
  private readonly pause = $('pause-screen');
  private readonly results = $('results-screen');
  private readonly hud = $('hud');
  private lastPhase = '';

  clearPopups(): void {
    this.pops.innerHTML = '';
  }

  toast(text: string, kind: string): void {
    const el = document.createElement('div');
    el.className = `pop toast ${kind}`;
    el.textContent = text;
    this.pops.appendChild(el);
    setTimeout(() => el.remove(), 1400);
  }

  trick(t: TrickResult): void {
    const el = document.createElement('div');
    const flop = t.landMult === 0;
    el.className = `pop trick ${flop ? 'flop' : t.grade.toLowerCase()}`;
    const mults: string[] = [];
    mults.push(`<span>Height ${t.height.toFixed(1)}m ×${t.heightMult.toFixed(1)}</span>`);
    mults.push(`<span>${t.grade} ×${t.landMult.toFixed(1)}</span>`);
    if (t.waveMult > 1.05) mults.push(`<span>Swell ×${t.waveMult.toFixed(1)}</span>`);
    if (t.comboMult > 1) mults.push(`<span>Combo ×${t.comboMult.toFixed(2)}</span>`);
    el.innerHTML = `<div class="name">${flop ? 'Belly flop!' : t.name}</div>
      <div class="pts">${flop ? 'combo lost' : `+${t.points.toLocaleString()}`}</div>
      <div class="mults">${mults.join('')}</div>`;
    this.pops.appendChild(el);
    while (this.pops.children.length > 3) this.pops.firstElementChild?.remove();
    setTimeout(() => el.remove(), 2300);
  }

  update(s: SimState): void {
    this.score.textContent = s.score.toLocaleString();
    const r = Math.ceil(s.remaining);
    this.timer.textContent = `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`;
    this.timer.classList.toggle('low', s.remaining < 10 && s.phase === 'playing');
    const comboMult = 1 + 0.25 * Math.min(s.combo, 8);
    this.combo.textContent = s.combo > 0 ? `Combo ×${comboMult.toFixed(2)}` : '';
    this.combo.style.setProperty('--t', String(Math.max(0, s.comboTimer / 7)));
    const d = s.dolphin;
    const pot = d.airborne ? 0 : Math.min(1, s.launchPotential / 7);
    this.swell.style.transform = `scaleX(${pot.toFixed(3)})`;
    this.swellBox.classList.toggle('hot', pot > 0.7);
    this.swellBox.classList.toggle('air', d.airborne);
    this.stamina.style.transform = `scaleX(${d.stamina.toFixed(3)})`;
    this.height.textContent = d.airborne ? `${Math.max(0, d.y).toFixed(1)} m` : '';

    if (s.phase !== this.lastPhase) {
      this.lastPhase = s.phase;
      this.title.hidden = s.phase !== 'title';
      this.pause.hidden = s.phase !== 'paused';
      this.results.hidden = s.phase !== 'results';
      this.hud.classList.toggle('inactive', s.phase === 'title' || s.phase === 'results');
      document.body.dataset.phase = s.phase;
      if (s.phase === 'results') this.fillResults(s);
      if (s.phase === 'title') $('title-best').textContent = s.best > 0 ? `Best ${s.best.toLocaleString()}` : '';
    }
  }

  private fillResults(s: SimState): void {
    $('res-score').textContent = s.score.toLocaleString();
    const newBest = s.score >= s.best && s.score > 0;
    $('res-best').textContent = newBest ? 'New personal best!' : `Best ${s.best.toLocaleString()}`;
    $('res-jumps').textContent = String(s.jumps);
    $('res-clean').textContent = String(s.cleanLandings);
    $('res-trick').textContent = s.bestTrick ? `${s.bestTrick.name} · ${s.bestTrick.points.toLocaleString()}` : '—';
  }
}
