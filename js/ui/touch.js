// Touch controls for phones and tablets: a floating move stick (left thumb), drag-to-look (right side),
// and big buttons for use / jump / run. Everything is written into Input, so gameplay keeps one code path
// for keyboard, gamepad and touch.
const R = 56; // stick travel in px
const GLYPH = { Talk: '話', Deliver: '届', Next: '次', Drive: '乗', Board: '板' };

export class TouchControls {
  static detect() {
    try { return matchMedia('(hover: none) and (pointer: coarse)').matches; } catch { return false; }
  }

  constructor(root, input, { hint = null, force = false } = {}) {
    this.input = input; this.hint = hint; this.hintHTML = hint ? hint.innerHTML : '';
    this.on = false; this.forced = force; this.look = 1.6;
    this.stickId = null; this.lookId = null; this.sx = 0; this.sy = 0; this.lx = 0; this.ly = 0; this.cache = '';
    const e = (this.el = document.createElement('div'));
    e.className = 'touch'; e.hidden = true;
    e.innerHTML = '<div class="t-zone t-left"></div><div class="t-zone t-right"></div>'
      + '<div class="t-stick idle"><i class="t-knob"></i></div>'
      + '<button type="button" class="t-btn t-act idle" data-key="KeyE" aria-label="Interact"><b>手</b><span>Use</span></button>'
      + '<button type="button" class="t-btn t-jump" data-key="Space" aria-label="Jump"><b>跳</b><span>Jump</span></button>'
      + '<button type="button" class="t-btn t-run" aria-label="Run" aria-pressed="false"><b>走</b><span>Run</span></button>'
      + '<div class="t-top">'
      + '<button type="button" class="t-sm" data-key="Tab" aria-label="Journal"><b>帳</b><span>Jobs</span></button>'
      + '<button type="button" class="t-sm" data-key="KeyV" aria-label="Switch camera"><b>視</b><span>View</span></button>'
      + '<button type="button" class="t-sm t-full" aria-label="Fullscreen"><b>全</b><span>Full</span></button>'
      + '<button type="button" class="t-sm" data-key="Escape" aria-label="Pause"><b>休</b><span>Pause</span></button>'
      + '</div>'
      + '<div class="t-rotate"><i class="t-phone"></i><b>横向きにしてください</b><span>Turn your phone sideways to play</span><button type="button" class="t-ok">Play anyway</button></div>';
    root.appendChild(e);
    const q = (s) => e.querySelector(s);
    this.stick = q('.t-stick'); this.knob = q('.t-knob');
    this.act = q('.t-act'); this.jump = q('.t-jump'); this.run = q('.t-run'); this.rot = q('.t-rotate');
    if (!(document.fullscreenEnabled || document.webkitFullscreenEnabled)) q('.t-full').hidden = true;

    q('.t-left').addEventListener('pointerdown', (ev) => this.stickDown(ev));
    q('.t-right').addEventListener('pointerdown', (ev) => this.lookDown(ev));
    window.addEventListener('pointermove', (ev) => this.move(ev), { passive: false });
    window.addEventListener('pointerup', (ev) => this.up(ev));
    window.addEventListener('pointercancel', (ev) => this.up(ev));
    for (const b of e.querySelectorAll('[data-key]')) this.bindKey(b, b.dataset.key);
    this.run.addEventListener('pointerdown', (ev) => { ev.preventDefault(); this.setRun(!input.touch.run); });
    q('.t-full').addEventListener('click', () => this.fullscreen());
    q('.t-ok').addEventListener('click', () => this.rot.classList.add('gone'));
    e.addEventListener('contextmenu', (ev) => ev.preventDefault());
    // Switch on with the first real touch; off again if a mouse is used on a hybrid laptop.
    window.addEventListener('pointerdown', (ev) => {
      if (ev.pointerType === 'touch' && !this.on) this.setOn(true);
      else if (ev.pointerType === 'mouse' && this.on && !this.forced && !TouchControls.detect()) this.setOn(false);
    }, true);
    window.addEventListener('resize', () => this.rest());
    if (force || TouchControls.detect()) this.setOn(true);
  }

  setOn(v) {
    this.on = v; this.el.hidden = !v;
    document.body.classList.toggle('touch-on', v);
    this.input.touchOn = v;
    this.reset();
    if (this.hint) this.hint.innerHTML = v
      ? '<b>Left thumb</b> move (push past the ring to run) · <b>drag the right side</b> to look · <b>手</b> talk, pick up, deliver'
      : this.hintHTML;
  }

  // Let go of everything (menus opening, focus lost).
  reset() {
    const t = this.input.touch;
    t.lx = t.ly = 0; t.sprint = false;
    this.stickId = this.lookId = null;
    this.stick.classList.add('idle'); this.stick.classList.toggle('run', !!t.run);
    this.knob.style.transform = '';
    this.rest();
  }

  // Resting spot for the ghost stick, so new players know where the thumb goes.
  rest() {
    if (this.stickId != null) return;
    this.place(Math.max(100, innerWidth * 0.12), innerHeight - Math.max(100, innerHeight * 0.25));
  }
  place(x, y) { this.stick.style.transform = `translate(${x}px, ${y}px)`; }

  stickDown(ev) {
    if (this.stickId != null) return;
    ev.preventDefault();
    this.stickId = ev.pointerId; this.sx = ev.clientX; this.sy = ev.clientY;
    this.stick.classList.remove('idle');
    this.place(this.sx, this.sy);
    this.knob.style.transform = '';
  }

  lookDown(ev) {
    if (this.lookId != null) return;
    ev.preventDefault();
    this.lookId = ev.pointerId; this.lx = ev.clientX; this.ly = ev.clientY;
  }

  move(ev) {
    if (ev.pointerId === this.stickId) {
      ev.preventDefault();
      let dx = ev.clientX - this.sx, dy = ev.clientY - this.sy;
      const d = Math.hypot(dx, dy), t = this.input.touch;
      // A thumb that keeps sliding drags the ring along, so the stick never feels stuck at its edge.
      if (d > R * 1.9) { const k = (d - R * 1.9) / d; this.sx += dx * k; this.sy += dy * k; this.place(this.sx, this.sy); dx = ev.clientX - this.sx; dy = ev.clientY - this.sy; }
      const dd = Math.hypot(dx, dy), m = Math.min(1, dd / R), nx = dd ? dx / dd : 0, ny = dd ? dy / dd : 0;
      t.lx = nx * m; t.ly = ny * m;
      t.sprint = dd > R * 1.35;            // push past the ring to run
      this.stick.classList.toggle('run', t.sprint || !!t.run);
      this.knob.style.transform = `translate(${nx * Math.min(dd, R)}px, ${ny * Math.min(dd, R)}px)`;
    } else if (ev.pointerId === this.lookId) {
      ev.preventDefault();
      this.input.mdx += (ev.clientX - this.lx) * this.look;
      this.input.mdy += (ev.clientY - this.ly) * this.look;
      this.lx = ev.clientX; this.ly = ev.clientY;
    }
  }

  up(ev) {
    if (ev.pointerId === this.stickId) {
      const t = this.input.touch;
      this.stickId = null; t.lx = t.ly = 0; t.sprint = false;
      this.stick.classList.add('idle'); this.stick.classList.toggle('run', !!t.run);
      this.knob.style.transform = '';
      this.rest();
    }
    if (ev.pointerId === this.lookId) this.lookId = null;
  }

  // A button acts like holding a key: pressed for one frame on touch, held until the finger lifts.
  bindKey(b, code) {
    const inp = this.input;
    b.addEventListener('pointerdown', (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      try { b.setPointerCapture(ev.pointerId); } catch { /* not fatal */ }
      if (!inp.down.has(code)) inp.pressed.add(code);
      inp.down.add(code); b.classList.add('down');
    });
    const off = () => { inp.down.delete(code); b.classList.remove('down'); };
    b.addEventListener('pointerup', off);
    b.addEventListener('pointercancel', off);
    b.addEventListener('lostpointercapture', off);
  }

  setRun(v) {
    this.input.touch.run = v;
    this.run.classList.toggle('on', v);
    this.run.setAttribute('aria-pressed', String(v));
    this.stick.classList.toggle('run', v || this.input.touch.sprint);
  }

  fullscreen() {
    const d = document, el = d.documentElement;
    if (d.fullscreenElement || d.webkitFullscreenElement) { const x = d.exitFullscreen || d.webkitExitFullscreen; if (x) x.call(d); return; }
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req) return;
    Promise.resolve(req.call(el, { navigationUI: 'hide' }))
      .then(() => (screen.orientation && screen.orientation.lock ? screen.orientation.lock('landscape') : null))
      .catch(() => {});
  }

  // Called every play frame: label the big button with what it will do right now.
  update(prompt, talking, driving) {
    if (!this.on) return;
    const live = !!(prompt && !prompt.passive);
    const verb = talking ? 'Next' : live ? (prompt.verb || 'Use') : 'Use';
    const sig = `${verb}|${live}|${talking}|${driving}`;
    if (sig === this.cache) return;
    this.cache = sig;
    this.act.querySelector('b').textContent = GLYPH[verb] || '手';
    this.act.querySelector('span').textContent = verb;
    this.act.setAttribute('aria-label', verb);
    this.act.classList.toggle('idle', !talking && !live);
    this.jump.querySelector('b').textContent = driving ? '止' : '跳';
    this.jump.querySelector('span').textContent = driving ? 'Brake' : 'Jump';
    this.jump.setAttribute('aria-label', driving ? 'Handbrake' : 'Jump');
    this.run.hidden = driving;
  }
}
