// Keyboard, mouse (pointer lock), gamepad and touch (ui/touch.js writes into `touch`). Gameplay reads a single merged state each frame.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set();
    this.pressed = new Set();      // keys that went down since the last frame
    this.mdx = 0; this.mdy = 0; this.wheel = 0;
    this.enabled = true;           // false while a menu/dialogue owns the keyboard
    this.locked = false;
    this.pad = { mx: 0, my: 0, lx: 0, ly: 0, sprint: false };
    this.touch = { lx: 0, ly: 0, run: false, sprint: false };
    this.touchOn = false;
    this._padPrev = {};

    const typing = () => { const a = document.activeElement; return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable); };
    window.addEventListener('keydown', (e) => {
      if (typing()) return;
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => { this.down.delete(e.code); });
    window.addEventListener('blur', () => this.clear());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clear(); });
    canvas.addEventListener('mousedown', () => { if (this.enabled && !this.locked) this.requestLock(); });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; });
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mdx += e.movementX; this.mdy += e.movementY;
    });
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.wheel += Math.sign(e.deltaY); }, { passive: false });
  }

  requestLock() {
    try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (_) { /* not fatal */ }
  }
  releaseLock() { if (document.pointerLockElement) document.exitPointerLock(); }

  clear() { this.down.clear(); this.pressed.clear(); this.mdx = this.mdy = this.wheel = 0; this.touch.lx = this.touch.ly = 0; this.touch.sprint = false; }

  key(code) { return this.enabled && this.down.has(code); }
  hit(code) { return this.enabled && this.pressed.has(code); }
  // Raw press, ignores `enabled`: menus use it for their own close keys.
  tap(code) { return this.pressed.has(code); }

  // Movement axes in [-1, 1]: x = strafe right, y = forward.
  axes() {
    if (!this.enabled) return [0, 0];
    let x = (this.key('KeyD') || this.key('ArrowRight') ? 1 : 0) - (this.key('KeyA') || this.key('ArrowLeft') ? 1 : 0);
    let y = (this.key('KeyW') || this.key('ArrowUp') ? 1 : 0) - (this.key('KeyS') || this.key('ArrowDown') ? 1 : 0);
    if (Math.abs(this.pad.lx) > 0.15 || Math.abs(this.pad.ly) > 0.15) { x = this.pad.lx; y = -this.pad.ly; }
    if (Math.abs(this.touch.lx) > 0.06 || Math.abs(this.touch.ly) > 0.06) { x = this.touch.lx; y = -this.touch.ly; }
    const l = Math.hypot(x, y);
    return l > 1 ? [x / l, y / l] : [x, y];
  }

  sprint() { return this.key('ShiftLeft') || this.key('ShiftRight') || (this.enabled && (this.pad.sprint || this.touch.run || this.touch.sprint)); }

  // Poll gamepad once per frame; buttons are mapped onto key codes so gameplay has one code path.
  pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const g = pads && Array.from(pads).find((p) => p && p.connected);
    if (!g) { this.pad.lx = this.pad.ly = this.pad.mx = this.pad.my = 0; this.pad.sprint = false; return; }
    const dz = (v) => (Math.abs(v) < 0.15 ? 0 : v);
    this.pad.lx = dz(g.axes[0] || 0); this.pad.ly = dz(g.axes[1] || 0);
    this.pad.mx = dz(g.axes[2] || 0); this.pad.my = dz(g.axes[3] || 0);
    const map = { 0: 'Space', 2: 'KeyE', 3: 'KeyF', 1: 'KeyQ', 9: 'Escape', 8: 'KeyM', 4: 'Tab' };
    for (const [i, code] of Object.entries(map)) {
      const on = !!(g.buttons[i] && g.buttons[i].pressed);
      if (on && !this._padPrev[i]) this.pressed.add(code);
      if (on) this.down.add(code); else if (this._padPrev[i]) this.down.delete(code);
      this._padPrev[i] = on;
    }
    this.pad.sprint = !!(g.buttons[10] && g.buttons[10].pressed) || (g.buttons[7] && g.buttons[7].value > 0.4);
  }

  endFrame() { this.pressed.clear(); this.mdx = this.mdy = this.wheel = 0; }
}
