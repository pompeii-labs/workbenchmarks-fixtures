import type { DolphinCommand } from './sim/sim';

// Keyboard + touch -> one DolphinCommand. Touch: drag on the left pad to steer
// and dive/rise (flip and spin in the air); hold the right button to roll.
export class Input {
  private readonly keys = new Set<string>();
  private pad = { active: false, id: -1, cx: 0, cy: 0, x: 0, y: 0 };
  private rollHeld = 0;
  onPause: () => void = () => {};
  onConfirm: () => void = () => {};

  constructor(private readonly padEl: HTMLElement, private readonly knobEl: HTMLElement, rollEl: HTMLElement) {
    window.addEventListener('keydown', this.down);
    window.addEventListener('keyup', this.up);
    window.addEventListener('blur', () => this.keys.clear());
    padEl.addEventListener('pointerdown', this.padDown);
    window.addEventListener('pointermove', this.padMove);
    window.addEventListener('pointerup', this.padUp);
    window.addEventListener('pointercancel', this.padUp);
    rollEl.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.rollHeld = 1;
      rollEl.classList.add('held');
    });
    const release = () => {
      this.rollHeld = 0;
      rollEl.classList.remove('held');
    };
    rollEl.addEventListener('pointerup', release);
    rollEl.addEventListener('pointerleave', release);
    rollEl.addEventListener('pointercancel', release);
  }

  private readonly down = (e: KeyboardEvent) => {
    if (e.repeat) return;
    if (e.code === 'Escape' || e.code === 'KeyP') this.onPause();
    if (e.code === 'Enter' || e.code === 'Space') this.onConfirm();
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    this.keys.add(e.code);
  };
  private readonly up = (e: KeyboardEvent) => this.keys.delete(e.code);

  private readonly padDown = (e: PointerEvent) => {
    e.preventDefault();
    const r = this.padEl.getBoundingClientRect();
    this.pad = { active: true, id: e.pointerId, cx: r.left + r.width / 2, cy: r.top + r.height / 2, x: 0, y: 0 };
    this.padMove(e);
  };
  private readonly padMove = (e: PointerEvent) => {
    if (!this.pad.active || e.pointerId !== this.pad.id) return;
    const max = 48;
    let dx = e.clientX - this.pad.cx;
    let dy = e.clientY - this.pad.cy;
    const len = Math.hypot(dx, dy);
    if (len > max) {
      dx = (dx / len) * max;
      dy = (dy / len) * max;
    }
    this.pad.x = dx / max;
    this.pad.y = dy / max;
    this.knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
  };
  private readonly padUp = (e: PointerEvent) => {
    if (e.pointerId !== this.pad.id) return;
    this.pad.active = false;
    this.pad.x = this.pad.y = 0;
    this.knobEl.style.transform = '';
  };

  command(): DolphinCommand {
    const k = this.keys;
    const axis = (neg: string[], pos: string[]) => (pos.some((c) => k.has(c)) ? 1 : 0) - (neg.some((c) => k.has(c)) ? 1 : 0);
    const dead = (v: number) => (Math.abs(v) < 0.18 ? 0 : v);
    const steer = axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']) + dead(this.pad.x);
    const pitch = axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']) - dead(this.pad.y);
    const roll = axis(['KeyQ'], ['KeyE', 'ShiftLeft', 'ShiftRight']) + this.rollHeld;
    const c = (v: number) => Math.max(-1, Math.min(1, v));
    return { steer: c(steer), pitch: c(pitch), roll: c(roll) };
  }
}
