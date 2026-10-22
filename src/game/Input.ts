import type { Command } from '../sim/sim';

const LEFT_KEYS = new Set(['KeyZ', 'ShiftLeft', 'ArrowLeft', 'KeyA']);
const RIGHT_KEYS = new Set(['Slash', 'ShiftRight', 'ArrowRight', 'KeyL', 'KeyD']);
const PLUNGER_KEYS = new Set(['Space', 'ArrowDown', 'Enter', 'KeyS']);

/**
 * Keyboard + pointer input folded into the single Command type. Touch/mouse:
 * the left half of the screen holds the left flipper, the right half the right
 * flipper; the launch button holds the plunger.
 */
export class Input {
  private keys = new Set<string>();
  private pointers = new Map<number, 'left' | 'right' | 'plunger' | 'start'>();
  private startLatch = false;
  onPause: () => void = () => {};
  onMute: () => void = () => {};
  onFirstGesture: () => void = () => {};

  constructor(private readonly surface: HTMLElement, private readonly launchButton: HTMLElement) {
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    window.addEventListener('blur', this.clear);
    surface.addEventListener('pointerdown', this.pointerDown);
    launchButton.addEventListener('pointerdown', this.launchDown);
    window.addEventListener('pointerup', this.pointerUp);
    window.addEventListener('pointercancel', this.pointerUp);
    surface.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** True when any start input (plunger key, tap) is held this frame. */
  command(): Command {
    let left = false;
    let right = false;
    let plunger = false;
    for (const k of this.keys) {
      if (LEFT_KEYS.has(k)) left = true;
      if (RIGHT_KEYS.has(k)) right = true;
      if (PLUNGER_KEYS.has(k)) plunger = true;
    }
    let tapStart = false;
    for (const p of this.pointers.values()) {
      if (p === 'left') left = true;
      if (p === 'right') right = true;
      if (p === 'plunger') plunger = true;
      if (p === 'start') tapStart = true;
    }
    const start = plunger || tapStart || this.startLatch;
    this.startLatch = false;
    return { left, right, plunger, start };
  }

  /** Programmatic start used by overlay buttons. */
  pressStart(): void {
    this.startLatch = true;
  }

  private keyDown = (e: KeyboardEvent) => {
    this.onFirstGesture();
    if (e.code === 'KeyP' || e.code === 'Escape') {
      if (!e.repeat) this.onPause();
      return;
    }
    if (e.code === 'KeyM') {
      if (!e.repeat) this.onMute();
      return;
    }
    if (LEFT_KEYS.has(e.code) || RIGHT_KEYS.has(e.code) || PLUNGER_KEYS.has(e.code)) e.preventDefault();
    this.keys.add(e.code);
  };

  private keyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private clear = () => {
    this.keys.clear();
    this.pointers.clear();
  };

  /** Set by Game: whether a tap should start a game rather than flip. */
  wantsStart = () => false;

  private pointerDown = (e: PointerEvent) => {
    this.onFirstGesture();
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    if (this.wantsStart()) {
      this.pointers.set(e.pointerId, 'start');
      return;
    }
    const rect = this.surface.getBoundingClientRect();
    this.pointers.set(e.pointerId, e.clientX - rect.left < rect.width / 2 ? 'left' : 'right');
  };

  private launchDown = (e: PointerEvent) => {
    this.onFirstGesture();
    e.preventDefault();
    e.stopPropagation();
    this.pointers.set(e.pointerId, 'plunger');
  };

  private pointerUp = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
  };

  dispose(): void {
    window.removeEventListener('keydown', this.keyDown);
    window.removeEventListener('keyup', this.keyUp);
    window.removeEventListener('blur', this.clear);
    window.removeEventListener('pointerup', this.pointerUp);
    window.removeEventListener('pointercancel', this.pointerUp);
    this.surface.removeEventListener('pointerdown', this.pointerDown);
    this.launchButton.removeEventListener('pointerdown', this.launchDown);
  }
}
