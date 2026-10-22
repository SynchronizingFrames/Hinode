// Title screen, pause menu, settings and credits. Styled as station name signs (css/menu.css).
// The title sits over a live cinematic fly-through of the town (js/ui/cinematic.js).
import { el, esc, yen } from './dom.js';
import { padMapHTML } from './padui.js';

const SKEY = 'hinode.settings';
export const DEFAULTS = { volume: 0.8, sens: 1, invertY: false, showFps: false, reduceMotion: false, fpv: false, quality: 'high', fov: 65, res: 1, padSens: 1, padInvertY: false, padDead: 0.15, padVibe: true, padPrompts: 'auto' };
export function loadSettings(st) {
  let s;
  try { s = { ...DEFAULTS, ...(JSON.parse(st && st.getItem(SKEY)) || {}) }; } catch { s = { ...DEFAULTS }; }
  if (!QUALITY_INFO[s.quality]) s.quality = DEFAULTS.quality;
  s.fov = Math.min(100, Math.max(50, +s.fov || DEFAULTS.fov));
  s.res = Math.min(2, Math.max(0.5, +s.res || 1));
  s.padSens = Math.min(2.5, Math.max(0.3, +s.padSens || 1));
  s.padDead = Math.min(0.35, Math.max(0.05, +s.padDead || 0.15));
  if (!['auto', 'xbox', 'ps'].includes(s.padPrompts)) s.padPrompts = 'auto';
  s.volume = s.volume != null && Number.isFinite(+s.volume) ? Math.min(1, Math.max(0, +s.volume)) : DEFAULTS.volume;
  return s;
}
export const hasSavedSettings = (st) => { try { return !!(st && st.getItem(SKEY)); } catch { return false; } };
export function saveSettings(st, s) { try { if (st) st.setItem(SKEY, JSON.stringify(s)); } catch { /* storage full or blocked */ } }

export const QUALITY_INFO = {
  low: { jp: '低', name: 'Low', desc: '70% resolution, no bloom. For laptops and older GPUs.' },
  medium: { jp: '中', name: 'Medium', desc: '85% resolution, HDR bloom, 2K shadows.' },
  high: { jp: '高', name: 'High', desc: 'Native resolution, HDR bloom, 2K shadows. The default.' },
  ultra: { jp: '極', name: 'Ultra', desc: 'Everything maxed: 200% supersampling, MSAA, 8K soft contact-hardening shadows, volumetric sunlight and lamp glow in the fog, full-res ambient occlusion, long-range wet reflections, 600 m draw distance and the biggest crowds. Built to push an RTX 50-series. Lower Resolution boost to trade sharpness for frame rate.' },
};

const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; };
const hhmm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;
const sign = (act, jp, en, sub = '', extra = '') => `<button type="button" class="m-sign${extra}" data-act="${act}"><span class="jp"><span class="roll" data-t="${jp}">${jp}</span></span><b>${esc(en)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</button>`;
const chars = (s, cls) => [...s].map((c, i) => `<i class="${cls}" style="--i:${i}">${c}</i>`).join('');
const petals = (n) => Array.from({ length: n }, (_, i) => {
  const x = (i * 37.3) % 100, d = 9 + ((i * 7.1) % 9), dl = -((i * 3.7) % 18), s = 0.6 + ((i * 0.37) % 0.8), sw = 30 + ((i * 13) % 70);
  return `<i style="--x:${x.toFixed(1)}vw;--d:${d.toFixed(1)}s;--dl:${dl.toFixed(1)}s;--s:${s.toFixed(2)};--sw:${sw}px"></i>`;
}).join('');

export class Menu {
  // actions: { continue, newGame, resume, save, depot, quit }
  constructor(parent, { settings, onSetting, actions }) {
    this.settings = settings; this.onSetting = onSetting; this.actions = actions;
    this.tab = 'controls';
    this.el = el('div', 'menu', `
      <div class="m-bars"><i></i><i></i></div>
      <div class="m-petals" aria-hidden="true">${petals(26)}</div>
      <div class="m-art"><i class="m-rays"></i><i class="m-sun"></i><h1><span class="v">${chars('日の出', 'c')}</span><span class="en">${chars('HINODE', 'l')}</span><small>LAST-MILE JAPAN</small></h1>
        <p class="m-tag">Every package has a story. Every street leads somewhere.</p></div>
      <nav class="m-list"></nav>
      <p class="m-note"></p>
      <footer class="m-foot"><span class="m-cap"></span><span>青島町 · Aoshima · build M3</span></footer>
      <i class="m-fade"></i>`);
    this.el.hidden = true;
    parent.append(this.el);
    this.list = this.el.querySelector('.m-list'); this.note = this.el.querySelector('.m-note');
    this.cap = this.el.querySelector('.m-cap'); this.fadeEl = this.el.querySelector('.m-fade');
    this.screen = null; this.info = null; this.armed = null;
    this.el.addEventListener('click', (e) => this.click(e));
    this.el.addEventListener('input', (e) => this.change(e));
    // Hover feel: tilt + spotlight on signs, a sliding line marker, ripples, parallax, soft UI sounds.
    this.sfx = null; this.hot = null; this.raf = 0;
    this.el.addEventListener('pointermove', (e) => this.move(e));
    this.el.addEventListener('pointerover', (e) => this.over(e));
    this.el.addEventListener('pointerout', (e) => this.out(e));
    this.el.addEventListener('focusin', (e) => this.over(e));
    this.el.addEventListener('focusout', (e) => this.out(e));
    this.el.addEventListener('pointerdown', (e) => this.press(e));
  }

  show(screen, info = this.info) {
    const changed = screen !== this.screen;
    this.screen = screen; this.info = info; this.armed = null;
    this.el.hidden = false;
    this.el.className = 'menu m-' + screen;
    this.render();
    if (changed) { this.list.classList.remove('swap'); void this.list.offsetWidth; this.list.classList.add('swap'); }
  }
  hide() { this.el.hidden = true; this.screen = null; }
  flash(msg, kind = '') { this.note.textContent = msg; this.note.className = 'm-note ' + kind; }
  // Cinematic hooks: shot caption (bottom-left) and the dip-to-black between shots.
  caption(text) { if (this.cap.textContent !== text) { this.cap.textContent = text; this.cap.classList.remove('in'); void this.cap.offsetWidth; this.cap.classList.add('in'); } }
  fade(a) { this.fadeEl.style.opacity = a.toFixed(3); }

  render() {
    this.list.classList.remove('swap');
    const s = this.screen, i = this.info || {};
    this.flash(i.note || '', i.noteKind || '');
    i.note = '';
    if (s === 'title') {
      const sv = i.save;
      this.list.innerHTML = (sv ? sign('continue', 'つづき', 'Continue', `Day ${sv.day} · ${hhmm(sv.time)} · ${yen(sv.money)} · Lv ${sv.level} · ${ago(sv.savedAt)}`, ' main') : '') +
        sign('new', 'はじめから', this.armed === 'new' ? 'Replace your save? Click again' : 'New game', sv ? 'Starts over from Day 1' : 'Start your first round', sv ? (this.armed === 'new' ? ' armed' : '') : ' main') +
        sign('settings', '設定', 'Settings', 'Controls · first person · graphics') + sign('credits', 'クレジット', 'Credits');
    } else if (s === 'pause') {
      this.list.innerHTML = sign('resume', '再開', 'Resume', 'Esc', ' main') + sign('save', '保存', 'Save now', i.saved ? `Last saved ${ago(i.saved)}` : 'The game also saves by itself') +
        sign('settings', '設定', 'Settings') + sign('depot', '営業所へ', 'Back to the depot', 'If you get stuck somewhere') +
        sign('quit', 'タイトルへ', this.armed === 'quit' ? 'Saves, then goes to the title. Click again' : 'Quit to title', '', this.armed === 'quit' ? ' armed' : '');
    } else if (s === 'settings') {
      this.list.innerHTML = this.settingsForm() + sign('back', '戻る', 'Back');
    } else if (s === 'credits') {
      this.list.innerHTML = `<div class="m-form m-credits"><p><b>HINODE: Last-Mile Japan</b></p><p>Design, code, art and words made for cam.</p>
        <p>Everything you see is built in code: procedural models, shaders, weather and lighting. No downloaded assets.</p><p>Aoshima, its people and its shops are fictional.</p></div>` + sign('back', '戻る', 'Back');
    }
    this.decorate();
  }

  decorate() {
    this.hot = null; this.list.classList.remove('hot'); this.el.classList.remove('hot');
    [...this.list.children].forEach((c, n) => c.style.setProperty('--i', n));
    this.list.insertAdjacentHTML('beforeend', '<i class="m-hl" aria-hidden="true"></i>');
    this.list.querySelectorAll('input[type=range]').forEach((r) => this.fill(r));
  }
  fill(r) { r.style.setProperty('--p', (((r.value - r.min) / ((r.max - r.min) || 1)) * 100).toFixed(1) + '%'); }
  calm() { return document.body.classList.contains('reduce-motion') || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); }

  move(e) {
    if (e.pointerType === 'touch' || this.calm()) return;
    this.mx = e.clientX; this.my = e.clientY; this.mt = e.target;
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      const W = innerWidth || 1, H = innerHeight || 1;
      this.el.style.setProperty('--px', ((this.mx / W) * 2 - 1).toFixed(3));
      this.el.style.setProperty('--py', ((this.my / H) * 2 - 1).toFixed(3));
      const b = this.mt && this.mt.closest && this.mt.closest('.m-sign');
      if (!b) return;
      const r = b.getBoundingClientRect(), x = (this.mx - r.left) / (r.width || 1), y = (this.my - r.top) / (r.height || 1);
      b.style.setProperty('--mx', (x * 100).toFixed(1) + '%'); b.style.setProperty('--my', (y * 100).toFixed(1) + '%');
      b.style.setProperty('--rx', ((x - 0.5) * 7).toFixed(2) + 'deg'); b.style.setProperty('--ry', ((0.5 - y) * 10).toFixed(2) + 'deg');
    });
  }
  over(e) {
    const t = e.target.closest && e.target.closest('.m-sign, .m-tab, .m-q');
    if (!t || t === this.hot) return;
    this.hot = t;
    if (this.sfx) this.sfx('hover');
    if (t.classList.contains('m-sign')) this.glide(t);
  }
  out(e) {
    const t = e.target.closest && e.target.closest('.m-sign, .m-tab, .m-q');
    const to = e.relatedTarget;
    if (!t || (to && t.contains(to))) return;
    if (t.classList.contains('m-sign')) { t.style.setProperty('--rx', '0deg'); t.style.setProperty('--ry', '0deg'); }
    if (this.hot === t) this.hot = null;
    if (!to || !to.closest || !to.closest('.m-sign')) { this.list.classList.remove('hot'); this.el.classList.remove('hot'); }
  }
  glide(b) {
    const hl = this.list.querySelector('.m-hl');
    if (!hl || b.parentElement !== this.list) return;
    const was = this.list.classList.contains('hot');
    if (!was) hl.classList.add('snap');
    hl.style.setProperty('--hl-y', b.offsetTop + 'px'); hl.style.setProperty('--hl-h', b.offsetHeight + 'px');
    if (!was) { void hl.offsetWidth; hl.classList.remove('snap'); }
    this.list.classList.add('hot'); this.el.classList.add('hot');
  }
  press(e) {
    const b = e.target.closest && e.target.closest('.m-sign, .m-q');
    if (!b) return;
    if (this.sfx) this.sfx('press');
    if (this.calm()) return;
    const r = b.getBoundingClientRect(), i = document.createElement('i');
    i.className = 'm-rip'; i.style.left = (e.clientX - r.left) + 'px'; i.style.top = (e.clientY - r.top) + 'px';
    b.append(i); setTimeout(() => i.remove(), 800);
  }

  settingsForm() {
    const st = this.settings, t = this.tab;
    const order = ['controls', 'graphics', 'comfort', 'sound', 'pad'], to = Math.max(0, order.indexOf(t)), from = this.tabPrev ? Math.max(0, order.indexOf(this.tabPrev)) : to;
    this.tabPrev = null;
    const dir = to > from ? ' r' : to < from ? ' l' : '';
    const tab = (id, jp, en) => `<button type="button" class="m-tab${t === id ? ' on' : ''}" data-tab="${id}"><span>${jp}</span>${en}</button>`;
    const chk = (k, label, sub = '') => `<label class="chk"><input type="checkbox" data-set="${k}"${st[k] ? ' checked' : ''}><span>${label}${sub ? `<em>${sub}</em>` : ''}</span></label>`;
    let body = '';
    if (t === 'controls') {
      body = `<label><span>Mouse sensitivity <output>${st.sens.toFixed(2)}×</output></span><input type="range" min="0.3" max="2.5" step="0.05" value="${st.sens}" data-set="sens"></label>
        ${chk('invertY', 'Invert camera up / down')}
        ${chk('fpv', 'First-person view', 'Eye-level on foot, cockpit view when driving. Press V in game to switch.')}`;
    } else if (t === 'graphics') {
      const q = st.quality, Q = QUALITY_INFO[q];
      body = `<div class="m-qset" role="radiogroup" aria-label="Graphics quality">${Object.entries(QUALITY_INFO).map(([id, v]) =>
        `<button type="button" role="radio" aria-checked="${id === q}" class="m-q${id === q ? ' on' : ''}${id === 'ultra' ? ' ultra' : ''}" data-q="${id}"><span>${v.jp}</span>${v.name}</button>`).join('')}</div>
        <p class="m-qdesc">${esc(Q.desc)}</p>
        <label><span>Resolution boost <output>${Math.round(st.res * 100)}%</output></span><input type="range" min="0.5" max="2" step="0.05" value="${st.res}" data-set="res"></label>
        <label><span>Field of view <output>${Math.round(st.fov)}°</output></span><input type="range" min="50" max="100" step="1" value="${st.fov}" data-set="fov"></label>
        ${chk('showFps', 'Show frame rate (F3)')}`;
    } else if (t === 'pad') {
      const pi = this.padInfo ? this.padInfo() : null, on = !!(pi && pi.connected);
      const PN = { xbox: 'Xbox controller', ps5: 'DualSense (PS5) controller', ps4: 'DualShock 4 (PS4) controller', generic: 'Controller' };
      const auto = on && (pi.kind === 'ps4' || pi.kind === 'ps5') ? 'ps' : 'xbox', kind = st.padPrompts === 'auto' ? auto : st.padPrompts;
      const pp = (id, jp, en) => `<button type="button" role="radio" aria-checked="${st.padPrompts === id}" class="m-q${st.padPrompts === id ? ' on' : ''}" data-pp="${id}"><span>${jp}</span>${en}</button>`;
      body = `<p class="m-pad${on ? ' on' : ''}">${on ? `<b>${PN[pi.kind] || 'Controller'}</b> connected${pi.std ? '' : ' (non-standard mapping, some buttons may differ)'}` : 'No controller detected. Plug one in or pair it over Bluetooth, then press any button. Xbox One / Series, DualShock 4 and DualSense all work.'}</p>
        <span class="m-padh">Button prompts</span>
        <div class="m-qset m-ppset" role="radiogroup" aria-label="Button prompts">${pp('auto', '自動', 'Auto')}${pp('xbox', 'A', 'Xbox')}${pp('ps', '✕', 'PlayStation')}</div>
        <label><span>Look sensitivity <output>${st.padSens.toFixed(2)}×</output></span><input type="range" min="0.3" max="2.5" step="0.05" value="${st.padSens}" data-set="padSens"></label>
        <label><span>Stick dead zone <output>${Math.round(st.padDead * 100)}%</output></span><input type="range" min="0.05" max="0.35" step="0.01" value="${st.padDead}" data-set="padDead"></label>
        ${chk('padInvertY', 'Invert look (Y axis)')}
        ${chk('padVibe', 'Vibration', 'Rumble on crashes (Chrome and Edge).')}
        <div class="m-padmap">${padMapHTML(kind, on && pi.kind === 'ps5')}</div>`;
    } else if (t === 'sound') {
      body = `<label><span>Master volume <output>${Math.round(st.volume * 100)}%</output></span><input type="range" min="0" max="1" step="0.05" value="${st.volume}" data-set="volume"></label>
        <p class="m-qdesc">Every sound is made live in the browser: engine and tyres, rain, footsteps, birds and insects, the Shinjuku crossing chime. Press H in the car to honk.</p>`;
    } else {
      body = `${chk('reduceMotion', 'Reduce motion', 'Less camera sway, no head bob, calmer menus.')}`;
    }
    return `<div class="m-form m-set"><div class="m-tabs">${tab('controls', '操作', 'Controls')}${tab('graphics', '画質', 'Graphics')}${tab('comfort', '快適', 'Comfort')}${tab('sound', '音', 'Sound')}${tab('pad', 'パッド', 'Controller')}<i class="m-tabbar" style="--from:${from};--to:${to}"></i></div><div class="m-body${dir}">${body}</div></div>`;
  }

  click(e) {
    const tb = e.target.closest('[data-tab]');
    if (tb) { if (tb.dataset.tab !== this.tab) { this.tabPrev = this.tab; this.tab = tb.dataset.tab; if (this.sfx) this.sfx('tab'); this.render(); } return; }
    const qb = e.target.closest('[data-q]');
    if (qb) { if (this.sfx && qb.dataset.q !== this.settings.quality) this.sfx('select'); this.settings.quality = qb.dataset.q; this.onSetting('quality', qb.dataset.q); this.render(); return; }
    const ppb = e.target.closest('[data-pp]');
    if (ppb) { if (this.sfx && ppb.dataset.pp !== this.settings.padPrompts) this.sfx('select'); this.settings.padPrompts = ppb.dataset.pp; this.onSetting('padPrompts', ppb.dataset.pp); this.render(); return; }
    const b = e.target.closest('[data-act]'); if (!b) return;
    const a = b.dataset.act, A = this.actions;
    if (a === 'settings' || a === 'credits') { this.prev = this.screen; this.show(a); return; }
    if (a === 'back') { this.show(this.prev || 'title'); return; }
    if (a === 'new' && this.info && this.info.save && this.armed !== 'new') { this.arm('new'); return; }
    if (a === 'quit' && this.armed !== 'quit') { this.arm('quit'); return; }
    if (a === 'continue') A.continue();
    else if (a === 'new') A.newGame();
    else if (a === 'resume') A.resume();
    else if (a === 'save') { const ok = A.save(); this.info.saved = ok ? Date.now() : this.info.saved; this.render(); this.flash(ok ? 'Saved.' : 'Could not save: this browser is blocking storage.', ok ? 'ok' : 'bad'); }
    else if (a === 'depot') A.depot();
    else if (a === 'quit') A.quit();
  }

  arm(what) {
    this.armed = what; this.render();
    clearTimeout(this.armT); this.armT = setTimeout(() => { this.armed = null; if (!this.el.hidden) this.render(); }, 5000);
  }

  change(e) {
    const k = e.target.dataset.set; if (!k) return;
    const v = e.target.type === 'checkbox' ? e.target.checked : parseFloat(e.target.value);
    this.settings[k] = v;
    if (e.target.type === 'range') this.fill(e.target);
    const out = e.target.parentElement.querySelector('output');
    if (k === 'sens' && out) out.textContent = v.toFixed(2) + '×';
    if (k === 'fov' && out) out.textContent = Math.round(v) + '°';
    if (k === 'volume' && out) out.textContent = Math.round(v * 100) + '%';
    if (k === 'res' && out) out.textContent = Math.round(v * 100) + '%';
    if (k === 'padSens' && out) out.textContent = v.toFixed(2) + '×';
    if (k === 'padDead' && out) out.textContent = Math.round(v * 100) + '%';
    this.onSetting(k, v);
  }
}
