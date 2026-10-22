import type { Command } from '../sim/sim';

const LEFT_KEYS = new Set(['KeyZ', 'ShiftLeft', 'ArrowLeft', 'KeyA']);
const RIGHT_KEYS = new Set(['Slash', 'ShiftRight', 'ArrowRight', 'KeyL', 'KeyD']);
const PLUNGER_KEYS = new Set(['Space', 'ArrowDown', 'Enter', 'KeyS']);
const START_KEYS = new Set(['Space', 'Enter']);

/** Maps keyboard and pointer/touch input onto the single sim Command. */
export class Input {
  private readonly keys = new Set<string>();
  /** Keys pressed since the last sample, so a tap shorter than a frame still registers. */
  private readonly tapped = new Set<string>();
  private readonly tappedRoles = new Set<string>();
  private readonly pointers = new Map<number, 'left' | 'right' | 'launch' | 'start'>();
  onPause: () => void = () => {};
  onMute: () => void = () => {};
  onFirstInput: () => void = () => {};
  private disposers: (() => void)[] = [];

  constructor(leftZone: HTMLElement, rightZone: HTMLElement, launch: HTMLElement, overlay: HTMLElement) {
    const down = (e: KeyboardEvent) => {
      if (LEFT_KEYS.has(e.code) || RIGHT_KEYS.has(e.code) || PLUNGER_KEYS.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.onFirstInput();
      if (e.code === 'KeyP' || e.code === 'Escape') this.onPause();
      if (e.code === 'KeyM') this.onMute();
      this.keys.add(e.code);
      this.tapped.add(e.code);
    };
    const up = (e: KeyboardEvent) => this.keys.delete(e.code);
    const blur = () => {
      this.keys.clear();
      this.pointers.clear();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    this.disposers.push(() => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    });

    this.bindPointer(leftZone, 'left');
    this.bindPointer(rightZone, 'right');
    this.bindPointer(launch, 'launch');
    this.bindPointer(overlay, 'start');
  }

  private bindPointer(el: HTMLElement, role: 'left' | 'right' | 'launch' | 'start'): void {
    const down = (e: PointerEvent) => {
      e.preventDefault();
      this.onFirstInput();
      this.pointers.set(e.pointerId, role);
      this.tappedRoles.add(role);
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic pointers may not be capturable */
      }
    };
    const up = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    this.disposers.push(() => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    });
  }

  private has(role: string): boolean {
    if (this.tappedRoles.has(role)) return true;
    for (const r of this.pointers.values()) if (r === role) return true;
    return false;
  }

  command(): Command {
    const any = (set: Set<string>) => [...set].some((c) => this.keys.has(c) || this.tapped.has(c));
    const cmd = {
      left: any(LEFT_KEYS) || this.has('left'),
      right: any(RIGHT_KEYS) || this.has('right'),
      plunger: any(PLUNGER_KEYS) || this.has('launch'),
      start: any(START_KEYS) || this.has('start'),
    };
    this.tapped.clear();
    this.tappedRoles.clear();
    return cmd;
  }

  clear(): void {
    this.keys.clear();
    this.tapped.clear();
    this.tappedRoles.clear();
    this.pointers.clear();
  }

  dispose(): void {
    for (const d of this.disposers) d();
  }
}
