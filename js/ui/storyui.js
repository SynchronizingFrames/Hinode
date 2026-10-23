// Story mode UI: chapter title cards, the HUD objective line, the phone ring, and the finale at dawn
// (five camera shots with subtitles, then the title and the credits).
import { FINALE, SPEAKERS } from '../data/story.js';
import { CAST } from '../data/cast.js';

const ease = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
const L3 = (o, a, b, t) => { o[0] = lerp(a[0], b[0], t); o[1] = lerp(a[1], b[1], t); o[2] = lerp(a[2], b[2], t); };
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ESC[c]);
const div = (cls, parent) => { const e = document.createElement('div'); e.className = cls; parent.appendChild(e); return e; };

export class StoryUI {
  constructor(root, hudRoot, world, cineShots = []) {
    this.world = world; this.cineShots = cineShots || [];
    this.card = div('st-card', root); this.card.hidden = true;
    this.obj = div('st-obj', hudRoot); this.obj.hidden = true;
    const e = (this.end = div('st-end', root)); e.hidden = true;
    e.innerHTML = '<div class="bar top"></div><div class="bar bot"></div><div class="shade"></div><div class="st-cap"></div>'
      + '<div class="st-sub"><span class="who"></span><span class="ln"></span></div>'
      + '<div class="st-title"><div class="jp">日の出</div><div class="en">HINODE</div><div class="sub"></div></div>'
      + '<div class="st-roll"></div><div class="st-fin"><div class="k">終</div><p>The story is complete. Aoshima keeps going.</p><span class="hint"></span></div>'
      + '<div class="st-skip">Enter / E / Ⓐ next · Esc / Ⓑ skip</div>';
    this.q = (s) => e.querySelector(s);
    e.addEventListener('click', () => { this._click = true; });
    this.active = false; this.min = 300;
  }

  // ---- Chapter title card ---------------------------------------------------
  showCard(ch, ms = 5600) {
    const c = this.card;
    c.innerHTML = `<div class="k">${esc(ch.kanji)} · Chapter ${ch.n}</div><div class="t">${esc(ch.title)}</div><div class="j">${esc(ch.jpTitle)}</div><p>${esc(ch.intro)}</p>`;
    clearTimeout(this._ct);
    c.hidden = false; c.classList.remove('in', 'out');
    void c.offsetWidth;
    c.classList.add('in');
    this._ct = setTimeout(() => {
      c.classList.add('out');
      this._ct = setTimeout(() => { c.hidden = true; c.classList.remove('in', 'out'); }, 900);
    }, ms);
  }

  // ---- HUD objective ----------------------------------------------------------
  objective(o, epilogue) {
    const key = o ? `${o.ch.n}|${o.text}|${o.sub}` : epilogue ? 'epi' : '';
    if (key === this._ok) return;
    this._ok = key;
    if (!o && !epilogue) { this.obj.hidden = true; return; }
    this.obj.hidden = false;
    this.obj.classList.toggle('epi', !o);
    this.obj.innerHTML = o
      ? `<span class="c">${esc(o.ch.kanji)} · ${esc(o.ch.title)}</span><b>${esc(o.text)}</b>${o.sub ? `<i>${esc(o.sub)}</i>` : ''}`
      : '<span class="c">エピローグ · Epilogue</span><b>The route is yours</b>';
  }

  // ---- Phone ring (two soft tones, three times) -------------------------------
  ring(vol = 0.05) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ac = (this.ac = this.ac || new AC());
      if (ac.state === 'suspended') ac.resume();
      const t0 = ac.currentTime + 0.05;
      for (let k = 0; k < 3; k++) for (let j = 0; j < 2; j++) {
        const o = ac.createOscillator(), g = ac.createGain(), t = t0 + k * 0.9 + j * 0.16;
        o.type = 'sine'; o.frequency.value = j ? 1320 : 1046;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.02); g.gain.linearRampToValueAtTime(0, t + 0.14);
        o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + 0.16);
      }
    } catch { /* audio blocked: the toast still shows */ }
  }

  // ---- Finale -----------------------------------------------------------------
  shotsFor() {
    const w = this.world, [sx, , sz] = w.spawn, g = (w.depot && w.depot.gate) || [sx, sz];
    const pick = (re) => { const s = this.cineShots.find((q) => re.test(q.cap || '')); return s ? { p: s.p, t: s.t, orbit: s.orbit } : null; };
    const bx = sx + (sx - g[0]) * 0.7, bz = sz + (sz - g[1]) * 0.7;
    const base = [
      { min: 290, len: 11, orbit: { c: [0, 0, 0], r: 72, y: [44, 36], a: [2.3, 2.8] } },
      { min: 305, len: 11, p: [[bx, 2.3, bz], [sx, 1.9, sz]], t: [[g[0], 1.5, g[1]], [g[0], 1.4, g[1]]] },
      pick(/Asahi/) || { orbit: { c: [0, 0, 0], r: 40, y: [8, 12], a: [1.2, 1.7] } },
      pick(/Minato|harbour|Harbour|sea|Sea/) || { orbit: { c: [0, 0, 0], r: 52, y: [10, 18], a: [3.4, 3.9] } },
      { min: 348, len: 16, orbit: { c: [0, 0, 0], r: 62, y: [14, 46], a: [0.4, 1.0] } },
    ];
    const mins = [290, 305, 320, 335, 348], lens = [11, 11, 13, 12, 16];
    return base.map((s, i) => ({ ...s, min: mins[i], len: lens[i], cap: FINALE.shots[i].cap, subs: FINALE.shots[i].subs }));
  }

  startEnding(weather) {
    this.shots = this.shotsFor();
    this.ph = 'shots'; this.i = 0; this.t = 0; this.min = this.shots[0].min; this.active = true; this._sub = -1; this._click = false;
    if (weather && weather.force) weather.force('clear');
    this.end.hidden = false; this.end.className = 'st-end ph-shots';
    this.q('.st-title .sub').textContent = `${FINALE.title} · ${FINALE.jp}`;
    this.q('.st-sub').classList.remove('on');
    document.body.classList.add('at-ending');
    this.buildRoll();
  }

  buildRoll() {
    const rows = [];
    for (const c of FINALE.credits) {
      if (c[0] === 'cast') { for (const p of CAST) if (!p.story) rows.push(['r', p.role, p.name]); continue; }
      rows.push(c);
    }
    this.q('.st-roll').innerHTML = rows.map((c) => {
      if (c[0] === 'gap') return '<div class="gap"></div>';
      if (c[0] === 'r') return `<div class="r"><span>${esc(c[1])}</span><b>${esc(c[2])}</b></div>`;
      return `<div class="${esc(c[0])}">${esc(c[1])}</div>`;
    }).join('');
  }

  setPhase(ph) { this.ph = ph; this.t = 0; this.end.className = `st-end ph-${ph}`; }

  shotCam(s, u, cam) {
    if (s.orbit) {
      const o = s.orbit, a = lerp(o.a[0], o.a[1], u), y = lerp(o.y[0], o.y[1], u);
      cam.pos[0] = o.c[0] + Math.sin(a) * o.r; cam.pos[1] = y; cam.pos[2] = o.c[2] + Math.cos(a) * o.r;
      cam.target[0] = o.c[0]; cam.target[1] = o.c[1] + 2; cam.target[2] = o.c[2];
    } else { L3(cam.pos, s.p[0], s.p[1], u); L3(cam.target, s.t[0], s.t[1], u); }
    cam.focus = null;
  }

  // Returns true once the player closes the final screen.
  update(dt, cam, input) {
    if (!this.active) return false;
    const next = input.tap('Enter') || input.tap('KeyE') || input.tap('PadA') || input.tap('Space') || this._click;
    const skip = input.tap('Escape') || input.tap('PadB');
    this._click = false;
    this.t += dt;
    if (this.ph === 'shots') {
      const s = this.shots[this.i], u = ease(Math.min(1, this.t / s.len));
      this.shotCam(s, u, cam);
      this.min = s.min + u * 12;
      this.q('.st-cap').textContent = s.cap;
      const k = Math.min(s.subs.length - 1, Math.floor((this.t / s.len) * s.subs.length));
      if (k !== this._sub) {
        this._sub = k;
        const [who, line] = s.subs[k], sp = SPEAKERS[who];
        const box = this.q('.st-sub');
        box.classList.toggle('narr', who === 'n');
        this.q('.st-sub .who').textContent = who === 'n' ? '' : (sp ? sp.name : who);
        this.q('.st-sub .ln').textContent = line;
        box.classList.remove('on'); void box.offsetWidth; box.classList.add('on');
      }
      if (this.t >= s.len || next) {
        this.i++; this.t = 0; this._sub = -1;
        if (this.i >= this.shots.length) this.setPhase('title');
      }
      if (skip) this.setPhase('credits');
      return false;
    }
    // After the shots: keep drifting over the town in the sunrise.
    const last = this.shots[this.shots.length - 1];
    this.drift = (this.drift || 0) + dt;
    this.shotCam({ orbit: { ...last.orbit, a: [last.orbit.a[1], last.orbit.a[1] + 1.2], y: [46, 52] } }, Math.min(1, this.drift / 90), cam);
    this.min = Math.min(400, 360 + this.drift * 0.5);
    if (this.ph === 'title') { if (this.t > 6.5 || next || skip) this.setPhase('credits'); return false; }
    if (this.ph === 'credits') {
      const roll = this.q('.st-roll'), h = roll.scrollHeight || 1400, vh = this.end.clientHeight || 800;
      const y = vh - this.t * 46;
      roll.style.transform = `translateY(${y}px)`;
      if (y < -h || next || skip) this.setPhase('fin');
      return false;
    }
    if (this.ph === 'fin') {
      this.q('.st-fin .hint').textContent = input.device === 'pad' ? 'Press Ⓐ to keep riding' : 'Press Enter or click to keep riding';
      if (this.t > 1.2 && (next || skip)) { this.stop(); return true; }
    }
    return false;
  }

  stop() {
    this.active = false; this.drift = 0;
    this.end.hidden = true;
    document.body.classList.remove('at-ending');
  }
}
