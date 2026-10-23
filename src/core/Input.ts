import type { Command } from '../sim/sim';

/** Keyboard + touch → one Command per sim step. */
export class Input {
  private readonly keys = new Set<string>();
  private jumpQueued = false;
  private stickX = 0;
  private stickY = 0;
  private stickId: number | null = null;
  private touchBoost = false;
  private center = { x: 0, y: 0, r: 1 };
  /** fired for non-driving keys (pause, restart, mute) */
  onAction: (action: 'pause' | 'restart' | 'mute' | 'start') => void = () => {};
  touchUsed = false;

  private readonly handlers: [EventTarget, string, EventListener][] = [];

  constructor(
    stick: HTMLElement,
    private readonly knob: HTMLElement,
    jumpBtn: HTMLElement,
    boostBtn: HTMLElement,
  ) {
    this.on(window, 'keydown', (e) => {
      const ev = e as KeyboardEvent;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(ev.code)) ev.preventDefault();
      if (ev.repeat) return;
      this.keys.add(ev.code);
      if (ev.code === 'Space') this.jumpQueued = true;
      if (ev.code === 'KeyP' || ev.code === 'Escape') this.onAction('pause');
      else if (ev.code === 'KeyR') this.onAction('restart');
      else if (ev.code === 'KeyM') this.onAction('mute');
      else this.onAction('start');
    });
    this.on(window, 'keyup', (e) => this.keys.delete((e as KeyboardEvent).code));
    this.on(window, 'blur', () => this.keys.clear());

    this.on(stick, 'pointerdown', (e) => {
      const ev = e as PointerEvent;
      ev.preventDefault();
      this.touchUsed = true;
      const r = stick.getBoundingClientRect();
      this.center = { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width * 0.42 };
      this.stickId = ev.pointerId;
      try {
        stick.setPointerCapture(ev.pointerId);
      } catch {
        // synthetic pointers may not be capturable
      }
      this.moveStick(ev.clientX, ev.clientY);
      this.onAction('start');
    });
    this.on(stick, 'pointermove', (e) => {
      const ev = e as PointerEvent;
      if (ev.pointerId !== this.stickId) return;
      ev.preventDefault();
      this.moveStick(ev.clientX, ev.clientY);
    });
    const release = (e: Event) => {
      if ((e as PointerEvent).pointerId !== this.stickId) return;
      this.stickId = null;
      this.stickX = 0;
      this.stickY = 0;
      this.drawKnob();
    };
    this.on(stick, 'pointerup', release);
    this.on(stick, 'pointercancel', release);

    this.on(jumpBtn, 'pointerdown', (e) => {
      e.preventDefault();
      this.touchUsed = true;
      this.jumpQueued = true;
      jumpBtn.classList.add('down');
      this.onAction('start');
    });
    const jumpUp = () => jumpBtn.classList.remove('down');
    this.on(jumpBtn, 'pointerup', jumpUp);
    this.on(jumpBtn, 'pointercancel', jumpUp);
    this.on(jumpBtn, 'pointerleave', jumpUp);
    this.on(boostBtn, 'pointerdown', (e) => {
      e.preventDefault();
      this.touchUsed = true;
      this.touchBoost = true;
      boostBtn.classList.add('down');
      this.onAction('start');
    });
    const boostUp = () => {
      this.touchBoost = false;
      boostBtn.classList.remove('down');
    };
    this.on(boostBtn, 'pointerup', boostUp);
    this.on(boostBtn, 'pointercancel', boostUp);
    this.on(boostBtn, 'pointerleave', boostUp);
  }

  private on(target: EventTarget, type: string, fn: EventListener): void {
    target.addEventListener(type, fn, { passive: false });
    this.handlers.push([target, type, fn]);
  }

  private moveStick(cx: number, cy: number): void {
    let x = (cx - this.center.x) / this.center.r;
    let y = (cy - this.center.y) / this.center.r;
    const l = Math.hypot(x, y);
    if (l > 1) {
      x /= l;
      y /= l;
    }
    this.stickX = x;
    this.stickY = y;
    this.drawKnob();
  }

  private drawKnob(): void {
    this.knob.style.transform = `translate(calc(-50% + ${this.stickX * 38}px), calc(-50% + ${this.stickY * 38}px))`;
  }

  read(): Command {
    const k = this.keys;
    let throttle = 0;
    let steer = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) throttle += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) throttle -= 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) steer -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) steer += 1;
    if (this.stickId !== null) {
      // Touch: any stick contact rides forward; pull down to brake.
      steer += Math.abs(this.stickX) < 0.12 ? 0 : this.stickX;
      throttle += this.stickY > 0.55 ? -1 : 1;
    }
    const jump = this.jumpQueued;
    this.jumpQueued = false;
    return {
      throttle: Math.max(-1, Math.min(1, throttle)),
      steer: Math.max(-1, Math.min(1, steer)),
      boost: k.has('ShiftLeft') || k.has('ShiftRight') || this.touchBoost,
      jump,
    };
  }

  /** Clears queued one-shots (e.g. when unpausing). */
  flush(): void {
    this.jumpQueued = false;
  }

  dispose(): void {
    for (const [t, type, fn] of this.handlers) t.removeEventListener(type, fn);
  }
}
