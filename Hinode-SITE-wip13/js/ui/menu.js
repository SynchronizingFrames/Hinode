// Title screen, pause menu, settings and credits. Styled as station name signs (css/menu.css).
// The title sits over a live cinematic fly-through of the town (js/ui/cinematic.js).
import { el, esc, yen } from './dom.js';

const SKEY = 'hinode.settings';
export const DEFAULTS = { sens: 1, invertY: false, showFps: false, reduceMotion: false, fpv: false, quality: 'high', fov: 65 };
export function loadSettings(st) {
  let s;
  try { s = { ...DEFAULTS, ...(JSON.parse(st && st.getItem(SKEY)) || {}) }; } catch { s = { ...DEFAULTS }; }
  if (!QUALITY_INFO[s.quality]) s.quality = DEFAULTS.quality;
  s.fov = Math.min(100, Math.max(50, +s.fov || DEFAULTS.fov));
  return s;
}
export function saveSettings(st, s) { try { if (st) st.setItem(SKEY, JSON.stringify(s)); } catch { /* storage full or blocked */ } }

export const QUALITY_INFO = {
  low: { jp: '低', name: 'Low', desc: '70% resolution, no bloom. For laptops and older GPUs.' },
  medium: { jp: '中', name: 'Medium', desc: '85% resolution, HDR bloom, 2K shadows.' },
  high: { jp: '高', name: 'High', desc: 'Native resolution, HDR bloom, 2K shadows. The default.' },
  ultra: { jp: '極', name: 'Ultra', desc: '150% supersampled, 4K shadows, longest draw distance, dense rain. For strong GPUs (RTX 30-series and up).' },
};

const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; };
const hhmm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;
const sign = (act, jp, en, sub = '', extra = '') => `<button type="button" class="m-sign${extra}" data-act="${act}"><span class="jp">${jp}</span><b>${esc(en)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</button>`;
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
  }

  settingsForm() {
    const st = this.settings, t = this.tab;
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
        <label><span>Field of view <output>${Math.round(st.fov)}°</output></span><input type="range" min="50" max="100" step="1" value="${st.fov}" data-set="fov"></label>
        ${chk('showFps', 'Show frame rate (F3)')}`;
    } else {
      body = `${chk('reduceMotion', 'Reduce motion', 'Less camera sway, no head bob, calmer menus.')}`;
    }
    return `<div class="m-form m-set"><div class="m-tabs">${tab('controls', '操作', 'Controls')}${tab('graphics', '画質', 'Graphics')}${tab('comfort', '快適', 'Comfort')}</div><div class="m-body">${body}</div></div>`;
  }

  click(e) {
    const tb = e.target.closest('[data-tab]');
    if (tb) { this.tab = tb.dataset.tab; this.render(); return; }
    const qb = e.target.closest('[data-q]');
    if (qb) { this.settings.quality = qb.dataset.q; this.onSetting('quality', qb.dataset.q); this.render(); return; }
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
    const out = e.target.parentElement.querySelector('output');
    if (k === 'sens' && out) out.textContent = v.toFixed(2) + '×';
    if (k === 'fov' && out) out.textContent = Math.round(v) + '°';
    this.onSetting(k, v);
  }
}
