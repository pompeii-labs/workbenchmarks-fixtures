// Keyboard, mouse and touch -> one Command per simulation step.
import type { Command } from '../sim/sim';

const LEFT_KEYS = new Set(['KeyZ', 'ArrowLeft', 'ShiftLeft', 'KeyA']);
const RIGHT_KEYS = new Set(['Slash', 'ArrowRight', 'ShiftRight', 'KeyL', 'KeyM']);
const PLUNGER_KEYS = new Set(['Space', 'ArrowDown', 'Enter', 'KeyS']);
const PREVENT = new Set([...LEFT_KEYS, ...RIGHT_KEYS, ...PLUNGER_KEYS, 'ArrowUp']);

export class Input {
  private keys = new Set<string>();
  private pointerSides = new Map<number, 'left' | 'right' | 'plunger'>();
  // Latches make a press shorter than one frame still register. A flipper tap
  // holds for a minimum number of sim steps so it always completes a full swing.
  private latch = { left: false, right: false, plunger: false, start: false };
  private minHold = { left: 0, right: 0 };
  private static readonly FLIP_MIN_STEPS = 16;
  private suppressPlunger = false;
  onPause: () => void = () => {};
  onAnyInput: () => void = () => {};

  constructor(
    private readonly surface: HTMLElement,
    private readonly plungerButton: HTMLElement,
  ) {
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    window.addEventListener('blur', this.clear);
    surface.addEventListener('pointerdown', this.pointerDown);
    plungerButton.addEventListener('pointerdown', this.plungerDown);
    window.addEventListener('pointerup', this.pointerUp);
    window.addEventListener('pointercancel', this.pointerUp);
    surface.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Ignore the plunger until it is released (the start press must not also charge a launch). */
  suppressPlungerUntilRelease(): void {
    this.suppressPlunger = true;
    this.latch.plunger = false;
  }

  private plungerHeld(): boolean {
    for (const k of PLUNGER_KEYS) if (this.keys.has(k)) return true;
    for (const side of this.pointerSides.values()) if (side === 'plunger') return true;
    return false;
  }

  command(): Command {
    let left = this.latch.left || this.minHold.left > 0;
    let right = this.latch.right || this.minHold.right > 0;
    for (const k of this.keys) {
      if (LEFT_KEYS.has(k)) left = true;
      if (RIGHT_KEYS.has(k)) right = true;
    }
    for (const side of this.pointerSides.values()) {
      if (side === 'left') left = true;
      if (side === 'right') right = true;
    }
    const rawPlunger = this.plungerHeld();
    if (this.suppressPlunger && !rawPlunger) this.suppressPlunger = false;
    const plunger = !this.suppressPlunger && (rawPlunger || this.latch.plunger);
    return { left, right, plunger, start: this.latch.start || rawPlunger };
  }

  /** Called after a step consumed the command. */
  consumeLatches(): void {
    if (this.latch.left) this.minHold.left = Input.FLIP_MIN_STEPS;
    if (this.latch.right) this.minHold.right = Input.FLIP_MIN_STEPS;
    this.minHold.left = Math.max(0, this.minHold.left - 1);
    this.minHold.right = Math.max(0, this.minHold.right - 1);
    this.latch.left = false;
    this.latch.right = false;
    this.latch.plunger = false;
    this.latch.start = false;
  }

  private keyDown = (e: KeyboardEvent) => {
    if (PREVENT.has(e.code)) e.preventDefault();
    if (e.code === 'KeyP' || e.code === 'Escape') {
      if (!e.repeat) this.onPause();
      return;
    }
    this.onAnyInput();
    if (e.repeat) return;
    this.keys.add(e.code);
    if (LEFT_KEYS.has(e.code)) this.latch.left = true;
    if (RIGHT_KEYS.has(e.code)) this.latch.right = true;
    if (PLUNGER_KEYS.has(e.code)) {
      this.latch.start = true;
      this.latch.plunger = true;
    }
  };

  private keyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private clear = () => {
    this.keys.clear();
    this.pointerSides.clear();
  };

  private pointerDown = (e: PointerEvent) => {
    if (e.target instanceof HTMLElement && e.target.closest('button')) return;
    e.preventDefault();
    this.onAnyInput();
    const rect = this.surface.getBoundingClientRect();
    const side = e.clientX - rect.left < rect.width / 2 ? 'left' : 'right';
    this.pointerSides.set(e.pointerId, side);
    this.latch[side] = true;
    this.latch.start = true;
  };

  private plungerDown = (e: PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    this.onAnyInput();
    this.pointerSides.set(e.pointerId, 'plunger');
    this.latch.start = true;
    this.latch.plunger = true;
  };

  private pointerUp = (e: PointerEvent) => {
    this.pointerSides.delete(e.pointerId);
  };

  dispose(): void {
    window.removeEventListener('keydown', this.keyDown);
    window.removeEventListener('keyup', this.keyUp);
    window.removeEventListener('blur', this.clear);
    this.surface.removeEventListener('pointerdown', this.pointerDown);
    this.plungerButton.removeEventListener('pointerdown', this.plungerDown);
    window.removeEventListener('pointerup', this.pointerUp);
    window.removeEventListener('pointercancel', this.pointerUp);
  }
}
