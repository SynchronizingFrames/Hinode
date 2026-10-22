// Keyboard, mouse (pointer lock), gamepad (Xbox / PlayStation through the browser's standard mapping) and touch
// (ui/touch.js writes into `touch`). Gameplay reads a single merged state each frame.

// Which controller family a Gamepad.id belongs to (USB vendor 045e = Microsoft, 054c = Sony).
// Xbox is checked first: a Bluetooth Xbox One pad reports "Xbox Wireless Controller", and a DualShock 4 just "Wireless Controller".
export function padKind(id = '') {
  if (/xbox|xinput|045e|microsoft/i.test(id)) return 'xbox';
  if (/054c|dualsense|dualshock|playstation|wireless controller/i.test(id)) return /0ce6|0df2|dualsense/i.test(id) ? 'ps5' : 'ps4';
  return 'generic';
}

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set();
    this.pressed = new Set();      // keys that went down since the last frame
    this.mdx = 0; this.mdy = 0; this.wheel = 0;
    this.enabled = true;           // false while a menu/dialogue owns the keyboard
    this.locked = false;
    this.pad = { mx: 0, my: 0, lx: 0, ly: 0, rt: 0, lt: 0, sprint: false };
    this.padInfo = { connected: false, kind: null, name: '', index: -1, std: false };
    this.padSens = 1; this.padInvertY = false; this.padDead = 0.15; this.padVibe = true; this.padPrompts = 'auto';
    this.uiOpen = false;           // set by main: a menu, board, journal or dialogue is up (buttons drive the UI)
    this.menuOpen = false;         // set by main: a full-screen menu is up (the left stick navigates it too)
    this.device = 'kbm';           // what was used last: 'kbm' | 'pad'
    this.onDevice = null;          // called with 'connected' | 'disconnected' | 'device'
    this.touch = { lx: 0, ly: 0, run: false, sprint: false };
    this.touchOn = false;
    this.gp = null;
    this._padPrev = {}; this._ls = false; this._run = false; this._nav = null; this._navT = 0; this._rumT = 0;
    this.spikes = 0; this._mAvg = 0; this._lockT = 0;

    const typing = () => { const a = document.activeElement; return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable); };
    window.addEventListener('keydown', (e) => {
      if (typing()) return;
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
      this.use('kbm');
    });
    window.addEventListener('keyup', (e) => { this.down.delete(e.code); });
    window.addEventListener('blur', () => this.clear());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clear(); });
    canvas.addEventListener('mousedown', () => { this.use('kbm'); if (this.enabled && !this.locked) this.requestLock(); });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      this._lockT = performance.now(); this._mAvg = 0;
    });
    window.addEventListener('mousemove', (e) => {
      const x = e.movementX || 0, y = e.movementY || 0, m = Math.abs(x) + Math.abs(y);
      if (!this.locked) { if (m > 6) this.use('kbm'); return; }
      // The first events after the lock engages can carry the cursor's jump to the centre of the screen.
      if (performance.now() - this._lockT < 100) return;
      // Chrome on Windows sometimes reports a single bogus jump of hundreds of pixels while the pointer is locked
      // (it reads as an instant 90-180 degree flick). A real hand never goes from slow to that in one event,
      // so drop the outlier; a genuinely fast swipe is accepted on the very next event.
      if (m > 160 && m > this._mAvg * 8 + 60) { this.spikes++; this._mAvg = Math.max(this._mAvg, m / 6); return; }
      this._mAvg += (m - this._mAvg) * 0.3;
      if (m > 1) this.use('kbm');
      this.mdx += x; this.mdy += y;
    });
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.wheel += Math.sign(e.deltaY); }, { passive: false });
  }

  use(d) { if (this.device !== d) { this.device = d; if (this.onDevice) this.onDevice('device'); } }

  // Glyph family for on-screen prompts: null = keyboard, else 'xbox' | 'ps'.
  get promptKind() {
    if (this.device !== 'pad' || !this.padInfo.connected) return null;
    if (this.padPrompts === 'xbox' || this.padPrompts === 'ps') return this.padPrompts;
    const k = this.padInfo.kind;
    return k === 'ps4' || k === 'ps5' ? 'ps' : 'xbox';
  }

  // Raw (unaccelerated) mouse input where the browser supports it: it also sidesteps the Windows jump bug.
  requestLock() {
    const c = this.canvas;
    const plain = () => { try { const q = c.requestPointerLock(); if (q && q.catch) q.catch(() => {}); } catch (_) { /* not fatal */ } };
    try {
      const p = c.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => plain());
    } catch (_) { plain(); }
  }
  releaseLock() { if (document.pointerLockElement) document.exitPointerLock(); }

  // Pad buttons still held stay marked as used (true), so a held Menu / B doesn't re-fire after every mode switch.
  clear() {
    this.down.clear(); this.pressed.clear(); this.mdx = this.mdy = this.wheel = 0; this.touch.lx = this.touch.ly = 0; this.touch.sprint = false;
    for (const i in this._padPrev) if (this._padPrev[i]) this._padPrev[i] = true;
  }

  key(code) { return this.enabled && this.down.has(code); }
  hit(code) { return this.enabled && this.pressed.has(code); }
  // Raw press, ignores `enabled`: menus use it for their own close keys.
  tap(code) { return this.pressed.has(code); }

  // Movement axes in [-1, 1]: x = strafe right, y = forward.
  axes() {
    if (!this.enabled) return [0, 0];
    let x = (this.key('KeyD') || this.key('ArrowRight') ? 1 : 0) - (this.key('KeyA') || this.key('ArrowLeft') ? 1 : 0);
    let y = (this.key('KeyW') || this.key('ArrowUp') ? 1 : 0) - (this.key('KeyS') || this.key('ArrowDown') ? 1 : 0);
    if (Math.abs(this.pad.lx) > 0.01 || Math.abs(this.pad.ly) > 0.01) { x = this.pad.lx; y = -this.pad.ly; }
    if (Math.abs(this.touch.lx) > 0.06 || Math.abs(this.touch.ly) > 0.06) { x = this.touch.lx; y = -this.touch.ly; }
    const l = Math.hypot(x, y);
    return l > 1 ? [x / l, y / l] : [x, y];
  }

  // Driving: steer with the stick, analog throttle on RT / R2 and brake / reverse on LT / L2.
  driveAxes() {
    const [x, y] = this.axes();
    if (!this.enabled) return [0, 0];
    const P = this.pad;
    if (P.rt > 0.04 || P.lt > 0.04) return [x, Math.max(-1, Math.min(1, P.rt - P.lt))];
    return [x, y];
  }

  sprint() { return this.key('ShiftLeft') || this.key('ShiftRight') || (this.enabled && (this.pad.sprint || this.touch.run || this.touch.sprint)); }

  // Rumble (Chrome / Edge on Xbox and PlayStation pads). Throttled so a pile-up does not buzz forever.
  rumble(strong, weak = strong, ms = 140) {
    const g = this.gp;
    if (!this.padVibe || !g || this.device !== 'pad') return;
    const a = g.vibrationActuator; if (!a || !a.playEffect) return;
    const now = performance.now(); if (now < this._rumT) return;
    this._rumT = now + ms * 0.8;
    try {
      const p = a.playEffect('dual-rumble', { startDelay: 0, duration: ms, strongMagnitude: Math.min(1, Math.max(0, strong)), weakMagnitude: Math.min(1, Math.max(0, weak)) });
      if (p && p.catch) p.catch(() => {});
    } catch (_) { /* no rumble motors */ }
  }

  // Poll the gamepad once per frame. Buttons become key codes so gameplay keeps one code path;
  // the code depends on context (playing vs a menu / dialogue) and is remembered until release.
  pollPad() {
    const pads = navigator.getGamepads ? Array.from(navigator.getGamepads() || []) : [];
    let g = null;
    for (const p of pads) {
      if (!p || !p.connected) continue;
      const ps = p.mapping === 'standard', gs = g && g.mapping === 'standard';
      if (!g || (ps && !gs) || (ps === gs && p.timestamp > g.timestamp)) g = p;
    }
    const P = this.pad, I = this.padInfo;
    if (!g) {
      P.lx = P.ly = P.mx = P.my = P.rt = P.lt = 0; P.sprint = false; this._run = false; this._nav = null;
      if (I.connected) {
        I.connected = false; I.kind = null; I.name = ''; I.index = -1; this.gp = null;
        for (const c of Object.values(this._padPrev)) if (typeof c === 'string') this.down.delete(c);
        this._padPrev = {};
        if (this.device === 'pad') this.device = 'kbm';
        if (this.onDevice) this.onDevice('disconnected');
      }
      return;
    }
    this.gp = g;
    if (!I.connected || I.index !== g.index || I.name !== g.id) {
      I.connected = true; I.index = g.index; I.name = g.id; I.kind = padKind(g.id); I.std = g.mapping === 'standard';
      this.device = 'pad';
      if (this.onDevice) this.onDevice('connected');
    }
    const val = (i) => { const b = g.buttons[i]; return !b ? 0 : typeof b === 'number' ? b : (b.value || (b.pressed ? 1 : 0)); };
    const btn = (i) => { const b = g.buttons[i]; return !!b && (typeof b === 'number' ? b > 0.5 : !!b.pressed); };
    const dz = Math.min(0.5, Math.max(0.02, this.padDead));
    // Radial dead zone rescaled to the full range, so the first millimetre past the dead zone is slow, not a jump.
    const stick = (x, y) => { const l = Math.hypot(x, y); if (l < dz) return [0, 0]; const k = Math.min(1, (l - dz) / (1 - dz)) / l; return [x * k, y * k]; };
    const [lx, ly] = stick(+g.axes[0] || 0, +g.axes[1] || 0), [rx, ry] = stick(+g.axes[2] || 0, +g.axes[3] || 0);
    const curve = (v) => Math.sign(v) * Math.pow(Math.abs(v), 1.6);   // fine aim near the centre, full speed at the edge
    P.lx = lx; P.ly = ly;
    P.mx = curve(rx) * this.padSens; P.my = curve(ry) * this.padSens * (this.padInvertY ? -1 : 1);
    P.rt = val(7); P.lt = val(6);

    let any = Math.abs(lx) + Math.abs(ly) + Math.abs(rx) + Math.abs(ry) > 0.25 || P.rt > 0.2 || P.lt > 0.2;
    for (let i = 0; i < g.buttons.length && !any; i++) if (i !== 6 && i !== 7 && btn(i)) any = true;
    if (any) this.use('pad');

    const ui = this.uiOpen, menu = this.menuOpen;
    const map = {
      0: ui ? 'PadA' : 'Space',       // A / Cross: jump, handbrake | select
      1: menu ? 'Escape' : 'PadB',    // B / Circle: back (dialogue closes on PadB)
      2: 'KeyE',                      // X / Square: talk, pick up, deliver, get in / out
      3: 'KeyV',                      // Y / Triangle: switch camera view
      4: ui ? 'PadLB' : 'Tab',        // LB / L1: journal | previous tab
      5: ui ? 'PadRB' : 'PadRB',      // RB / R1: run while held | next tab
      8: 'Tab',                       // View / Share / Create: journal
      9: menu ? 'Escape' : 'KeyP',    // Menu / Options: pause | close
      11: 'KeyH',                     // RS / R3: horn
    };
    for (const k in map) {
      const i = +k, on = btn(i), prev = this._padPrev[i];
      if (on && !prev) { const code = map[k]; this.pressed.add(code); this.down.add(code); this._padPrev[i] = code; }
      else if (!on && prev) { this.down.delete(prev); this._padPrev[i] = null; }
    }

    // Navigation with key-repeat: d-pad anywhere a UI is up, the left stick only in full-screen menus.
    let dir = btn(12) ? 'PadUp' : btn(13) ? 'PadDown' : btn(14) ? 'PadLeft' : btn(15) ? 'PadRight' : null;
    if (!dir && menu) {
      const sx = +g.axes[0] || 0, sy = +g.axes[1] || 0;
      if (Math.max(Math.abs(sx), Math.abs(sy)) > 0.55) dir = Math.abs(sx) > Math.abs(sy) ? (sx > 0 ? 'PadRight' : 'PadLeft') : (sy > 0 ? 'PadDown' : 'PadUp');
    }
    const now = performance.now();
    if (dir && (dir !== this._nav || now >= this._navT)) { this.pressed.add(dir); this._navT = now + (dir !== this._nav ? 420 : 110); }
    this._nav = dir;

    // Run: click the left stick to toggle (drops when you stop), or hold RB / RT on foot.
    const ls = btn(10);
    if (ls && !this._ls) this._run = !this._run;
    this._ls = ls;
    if (Math.hypot(lx, ly) < 0.2) this._run = false;
    P.sprint = this._run || btn(5) || (!ui && P.rt > 0.4);
  }

  endFrame() { this.pressed.clear(); this.mdx = this.mdy = this.wheel = 0; }
}
