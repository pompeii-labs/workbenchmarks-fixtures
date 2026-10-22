import type { Command } from './sim/sim';

export class Input {
  private readonly keys = new Set<string>();
  private stickX = 0;
  private stickY = 0;
  private stickId: number | null = null;
  private sprintTouch = false;
  onPause: () => void = () => {};
  onConfirm: () => void = () => {};

  constructor(stick: HTMLElement, knob: HTMLElement, sprintBtn: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (k === 'p' || k === 'escape') this.onPause();
      if (k === 'enter') this.onConfirm();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());

    const updateStick = (e: PointerEvent) => {
      const r = stick.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const max = r.width / 2;
      let dx = (e.clientX - cx) / max;
      let dy = (e.clientY - cy) / max;
      const len = Math.hypot(dx, dy);
      if (len > 1) {
        dx /= len;
        dy /= len;
      }
      this.stickX = dx;
      this.stickY = -dy;
      knob.style.transform = `translate(${dx * max * 0.6}px, ${dy * max * 0.6}px)`;
    };
    stick.addEventListener('pointerdown', (e) => {
      this.stickId = e.pointerId;
      stick.setPointerCapture(e.pointerId);
      updateStick(e);
    });
    stick.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.stickId) updateStick(e);
    });
    const release = (e: PointerEvent) => {
      if (e.pointerId !== this.stickId) return;
      this.stickId = null;
      this.stickX = 0;
      this.stickY = 0;
      knob.style.transform = '';
    };
    stick.addEventListener('pointerup', release);
    stick.addEventListener('pointercancel', release);
    sprintBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.sprintTouch = true;
      sprintBtn.classList.add('held');
    });
    const up = () => {
      this.sprintTouch = false;
      sprintBtn.classList.remove('held');
    };
    sprintBtn.addEventListener('pointerup', up);
    sprintBtn.addEventListener('pointercancel', up);
    sprintBtn.addEventListener('pointerleave', up);
  }

  command(): Command {
    const k = this.keys;
    let steer = (k.has('arrowright') || k.has('d') ? 1 : 0) - (k.has('arrowleft') || k.has('a') ? 1 : 0);
    let pitch = (k.has('arrowup') || k.has('w') ? 1 : 0) - (k.has('arrowdown') || k.has('s') ? 1 : 0);
    if (this.stickId !== null) {
      if (Math.abs(this.stickX) > 0.18) steer = this.stickX;
      if (Math.abs(this.stickY) > 0.18) pitch = this.stickY;
    }
    return { steer, pitch, sprint: k.has(' ') || k.has('shift') || this.sprintTouch };
  }
}
