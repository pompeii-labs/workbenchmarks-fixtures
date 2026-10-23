// Keyboard + touch input, merged into a single state each frame.
export class Input {
  constructor() {
    this.keys = new Set();
    this.hopQueued = false;
    this.onKey = null;
    this.touch = { active: false, id: null, x0: 0, y0: 0, dx: 0, dy: 0 };
    this.touchBoost = false;

    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (!e.repeat && e.code === 'Space') this.hopQueued = true;
      this.keys.add(e.code);
      if (!e.repeat && this.onKey) this.onKey(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  bindTouch(stickZone, knob, hopBtn, boostBtn) {
    const t = this.touch;
    const R = 60;
    const setKnob = () => {
      knob.style.transform = `translate(${t.dx * R}px, ${t.dy * R}px)`;
    };
    stickZone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const tt = e.changedTouches[0];
      t.active = true;
      t.id = tt.identifier;
      const r = stickZone.getBoundingClientRect();
      t.x0 = r.left + r.width / 2;
      t.y0 = r.top + r.height / 2;
      t.dx = Math.max(-1, Math.min(1, (tt.clientX - t.x0) / R));
      t.dy = Math.max(-1, Math.min(1, (tt.clientY - t.y0) / R));
      setKnob();
    }, { passive: false });
    stickZone.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const tt of e.changedTouches) {
        if (tt.identifier !== t.id) continue;
        t.dx = Math.max(-1, Math.min(1, (tt.clientX - t.x0) / R));
        t.dy = Math.max(-1, Math.min(1, (tt.clientY - t.y0) / R));
        setKnob();
      }
    }, { passive: false });
    const end = (e) => {
      for (const tt of e.changedTouches) {
        if (tt.identifier !== t.id) continue;
        t.active = false;
        t.dx = t.dy = 0;
        setKnob();
      }
    };
    stickZone.addEventListener('touchend', end);
    stickZone.addEventListener('touchcancel', end);

    hopBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.hopQueued = true;
    }, { passive: false });
    boostBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.touchBoost = true;
    }, { passive: false });
    const bEnd = () => (this.touchBoost = false);
    boostBtn.addEventListener('touchend', bEnd);
    boostBtn.addEventListener('touchcancel', bEnd);
  }

  read() {
    const k = this.keys;
    let throttle = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    let steer = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let boost = k.has('ShiftLeft') || k.has('ShiftRight');
    const t = this.touch;
    if (t.active) {
      // touching the stick = gas; pull it down to brake / backflip
      throttle = t.dy > 0.6 ? -1 : 1;
      steer = Math.abs(t.dx) < 0.12 ? 0 : t.dx;
    }
    if (this.touchBoost) {
      boost = true;
      if (!t.active) throttle = 1;
    }
    const hop = this.hopQueued;
    this.hopQueued = false;
    return { throttle, steer, boost, hop };
  }
}
