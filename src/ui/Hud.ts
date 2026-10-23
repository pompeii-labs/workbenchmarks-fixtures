import type { SimState } from '../sim/sim';
import { TUNING } from '../sim/sim';

function el(sel: string): HTMLElement {
  const e = document.querySelector<HTMLElement>(sel);
  if (!e) throw new Error(`Missing HUD element ${sel}`);
  return e;
}

export class Hud {
  private readonly score = el('#score-value');
  private readonly combo = el('#combo-value');
  private readonly comboFill = el('#combo-fill');
  private readonly best = el('#best-value');
  private readonly speed = el('#speed-value');
  private readonly boostFill = el('#boost-fill');
  private readonly boostBar = el('#boost-bar');
  private readonly air = el('#air-readout');
  private readonly airValue = el('#air-value');
  private readonly popups = el('#popups');
  private readonly wipeout = el('#wipeout');
  private readonly hint = el('#hint');
  private last = { score: -1, combo: -1, speed: -1, best: -1 };

  update(s: SimState): void {
    if (s.score !== this.last.score) {
      this.score.textContent = s.score.toLocaleString('en-US');
      this.last.score = s.score;
    }
    if (s.combo !== this.last.combo) {
      this.combo.textContent = `x${s.combo}`;
      this.last.combo = s.combo;
    }
    this.comboFill.style.width = `${s.combo > 1 ? Math.max(0, (s.comboTimer / TUNING.comboWindow) * 100) : 0}%`;
    const kmh = Math.round(Math.hypot(s.vx, s.vz) * 3.6);
    if (kmh !== this.last.speed) {
      this.speed.textContent = String(kmh);
      this.last.speed = kmh;
    }
    if (s.bestAir !== this.last.best) {
      this.best.textContent = `${s.bestAir.toFixed(1)}s`;
      this.last.best = s.bestAir;
    }
    this.boostFill.style.transform = `scaleX(${s.boost.toFixed(3)})`;
    this.boostBar.classList.toggle('active', s.boosting);
    const showAir = s.airborne && s.airTime > 0.3 && s.mode === 'ride';
    this.air.classList.toggle('hidden', !showAir);
    if (showAir) this.airValue.textContent = s.airTime.toFixed(1);
    this.wipeout.classList.toggle('hidden', s.mode !== 'wipeout');
    if (s.jumps > 2 || s.score > 0) this.hint.classList.add('hidden');
  }

  popup(label: string, points: number): void {
    const div = document.createElement('div');
    div.className = 'popup' + (points >= 300 ? ' big' : '');
    div.textContent = label;
    const b = document.createElement('b');
    b.textContent = `+${points}`;
    div.appendChild(b);
    this.popups.appendChild(div);
    while (this.popups.children.length > 3) this.popups.firstElementChild?.remove();
    window.setTimeout(() => div.remove(), 1600);
  }

  clearPopups(): void {
    this.popups.replaceChildren();
  }

  resetHint(): void {
    this.hint.classList.remove('hidden');
  }
}
