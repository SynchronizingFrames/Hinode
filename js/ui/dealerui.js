// Hinode Motors showroom panel: pick a model, read the real numbers, choose a colour,
// then test drive, buy, switch cars or repaint. Money and ownership live in game/garage.js;
// moving the actual car is main.js's job (onAction returns { ok, msg }).
import { MODELS, ORDER, PAINTS, REPAINT, TEST_DRIVE, carStats, paintHex } from '../data/cars.js';
import { profile } from '../game/vehicles.js';

const yen = (n) => '\u00a5' + Math.round(n).toLocaleString('en-US');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const clamp01 = (v) => Math.max(0.04, Math.min(1, v));

// Side silhouette built from the same profile numbers as the 3D body. Front is on the right.
function silhouette(style, hexc) {
  const P = profile(style), S = P.spec;
  const X = (z) => (z * 100).toFixed(1), Y = (y) => ((2.15 - y) * 100).toFixed(1);
  const pts = (a) => a.map((p) => X(p[0]) + ' ' + Y(p[1])).join(' L');
  const body = 'M' + pts(P.top) + ' L' + pts(P.bot.slice().reverse()) + ' Z';
  const cab = 'M' + pts(P.roof) + ' Z';
  let cx = 0, cy = 0;
  for (const p of P.roof) { cx += p[0]; cy += p[1]; }
  cx /= P.roof.length; cy /= P.roof.length;
  const glass = 'M' + pts(P.roof.map((p) => [cx + (p[0] - cx) * 0.86, cy + (p[1] - cy) * 0.8 + 0.02])) + ' Z';
  const wheels = [-1, 1].map((s) => {
    const x = X(s * S.axle), y = Y(S.r), r = S.r * 100;
    return `<circle cx="${x}" cy="${y}" r="${(r + 4).toFixed(1)}" fill="#07080a"/>` +
      `<circle cx="${x}" cy="${y}" r="${r.toFixed(1)}" fill="#151619"/>` +
      `<circle cx="${x}" cy="${y}" r="${(r * 0.62).toFixed(1)}" fill="${P.rim}" opacity=".92"/>` +
      `<circle cx="${x}" cy="${y}" r="${(r * 0.16).toFixed(1)}" fill="#2a2c30"/>`;
  }).join('');
  const id = 'g' + style;
  return `<svg viewBox="-270 30 540 200" aria-hidden="true">` +
    `<defs><linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".34"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".38"/></linearGradient>` +
    `<linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3d4857"/><stop offset=".55" stop-color="#10141a"/><stop offset="1" stop-color="#28303a"/></linearGradient></defs>` +
    `<ellipse cx="0" cy="216" rx="${(S.len * 52).toFixed(0)}" ry="9" fill="#000" opacity=".55"/>` +
    `<path d="${cab}" fill="${hexc}"/><path d="${cab}" fill="url(#${id}b)"/>` +
    `<path d="${glass}" fill="url(#${id}g)"/>` +
    `<path d="${body}" fill="${hexc}"/><path d="${body}" fill="url(#${id}b)"/>` +
    wheels + `</svg>`;
}

export class DealerUI {
  constructor(parent, o) {
    this.o = o; this.sel = null; this.paint = null; this.tab = 'lot'; this.msg = ''; this.tone = '';
    const root = this.root = document.createElement('div');
    root.className = 'panel dealer'; root.hidden = true;
    root.innerHTML = `
      <div class="sheet">
        <header class="dl-head">
          <div class="dl-brand"><span class="dl-mark">\u65e5\u306e\u51fa</span><div><b>Hinode Motors</b><small>Gado-shita \u00b7 Shinjuku \u00b7 open 09:00\u201321:00</small></div></div>
          <div class="dl-tabs"><button data-dtab="lot">Showroom</button><button data-dtab="garage">Your garage <i data-k="gcount"></i></button></div>
          <button class="dl-x" data-close aria-label="Close">\u2715</button>
        </header>
        <div class="dl-body"><nav class="dl-list" data-k="list"></nav><section class="dl-card" data-k="card"></section></div>
        <footer class="dl-foot"><span class="dl-wallet" data-k="wallet"></span><span class="dl-say" data-k="say"></span><span class="dl-hint">Esc to leave</span></footer>
      </div>`;
    this.k = {};
    for (const n of root.querySelectorAll('[data-k]')) this.k[n.dataset.k] = n;
    root.addEventListener('click', (e) => {
      const t = e.target.closest('button');
      if (!t || t.disabled || !root.contains(t)) return;
      if (t.hasAttribute('data-close')) { if (this.o.onClose) this.o.onClose(); return; }
      if (t.dataset.dtab) { this.tab = t.dataset.dtab; if (this.tab === 'garage' && !this.o.garage.owns(this.sel)) this.pick(this.o.garage.active); this.render(); return; }
      if (t.dataset.pick) { this.pick(t.dataset.pick); this.render(); return; }
      if (t.dataset.paint) { this.paint = t.dataset.paint; this.render(); return; }
      if (t.dataset.deal) this.act(t.dataset.deal);
    });
    parent.appendChild(root);
  }

  get open() { return !this.root.hidden; }

  pick(id) {
    const G = this.o.garage;
    this.sel = MODELS[id] ? id : G.active;
    this.paint = G.owns(this.sel) ? G.paintOf(this.sel) : MODELS[this.sel].paint;
    this.msg = '';
  }

  show(id) {
    this.tab = 'lot';
    this.pick(id || this.sel || this.o.garage.active);
    this.root.hidden = false;
    this.render();
  }

  hide() { this.root.hidden = true; }

  say(msg, tone) { this.msg = msg || ''; this.tone = tone || ''; }

  act(type) {
    const res = (this.o.onAction && this.o.onAction(type, this.sel, this.paint)) || {};
    this.say(res.msg || res.why || '', res.ok ? 'ok' : 'no');
    if (this.open) this.render();
    return res;
  }

  render() {
    const G = this.o.garage, C = this.o.career, id = this.sel, M = MODELS[id];
    for (const b of this.root.querySelectorAll('[data-dtab]')) b.classList.toggle('on', b.dataset.dtab === this.tab);
    this.k.gcount.textContent = G.count();
    const ids = this.tab === 'garage' ? G.list() : ORDER;
    this.k.list.innerHTML = ids.map((m) => {
      const X = MODELS[m], own = G.owns(m);
      const tag = G.active === m ? '<em class="dl-own drv">Driving</em>' : own ? '<em class="dl-own">Owned</em>' : `<em>${yen(X.price)}</em>`;
      const c = own ? paintHex(G.paintOf(m)) : paintHex(X.paint);
      return `<button class="dl-item${m === id ? ' on' : ''}" data-pick="${m}"><span class="dl-chip" style="--c:${c}"></span>` +
        `<span class="dl-n"><b>${esc(X.name)}</b><small>${esc(X.cls)}</small></span>${tag}</button>`;
    }).join('');
    const st = carStats(M), own = G.owns(id), active = G.active === id;
    const paintName = (PAINTS.find((p) => p.id === this.paint) || PAINTS[0]).name;
    const bars = [
      ['Top speed', `${st.kmh} km/h`, st.kmh / 215],
      ['0\u2013100 km/h', st.zero100 >= 99 ? 'never' : `${st.zero100.toFixed(1)} s`, st.zero100 >= 99 ? 0.05 : (16 - st.zero100) / 12],
      ['Grip', st.grip.toFixed(1), st.grip / 9.5],
      ['Brakes', st.brake.toFixed(1), st.brake / 23],
    ].map(([l, v, f]) => `<div class="dl-st"><span>${l}</span><b>${v}</b><i class="dl-bar"><i style="--v:${(clamp01(f) * 100).toFixed(0)}%"></i></i></div>`).join('');
    const swatches = PAINTS.map((p) => `<button class="dl-sw${p.id === this.paint ? ' on' : ''}" data-paint="${p.id}" title="${esc(p.name)}" style="--c:${p.hex}" aria-label="${esc(p.name)}"></button>`).join('');
    const acts = [];
    if (!own) {
      const short = M.price - C.money;
      acts.push(`<button class="dl-btn ghost" data-deal="test">Test drive<small>${TEST_DRIVE / 60} min \u00b7 free</small></button>`);
      acts.push(`<button class="dl-btn" data-deal="buy"${short > 0 ? ' disabled' : ''}>Buy ${yen(M.price)}<small>${short > 0 ? 'Need ' + yen(short) + ' more' : 'in ' + esc(paintName)}</small></button>`);
    } else {
      if (!active) acts.push(`<button class="dl-btn" data-deal="use">Drive this one<small>brought round to the kerb</small></button>`);
      else acts.push('<span class="dl-pill">You are driving this</span>');
      if (this.paint !== G.paintOf(id)) acts.push(`<button class="dl-btn ghost" data-deal="paint"${C.money < REPAINT ? ' disabled' : ''}>Repaint ${yen(REPAINT)}<small>to ${esc(paintName)}</small></button>`);
    }
    this.k.card.innerHTML = `
      <div class="dl-hero" style="--paint:${paintHex(this.paint)}"><span class="dl-jp">${esc(M.jp)}</span><span class="dl-cls">${esc(M.cls)}</span>${silhouette(M.style, paintHex(this.paint))}</div>
      <div class="dl-title"><h3>${esc(M.name)}</h3><span class="dl-price">${own ? 'In your garage' : yen(M.price)}</span></div>
      <p class="dl-desc">${esc(M.desc)}</p>
      <div class="dl-stats">${bars}</div>
      ${M.perkText ? `<p class="dl-perk">${esc(M.perkText)}</p>` : ''}
      <div class="dl-paints"><span>Paint \u00b7 ${esc(paintName)}</span><div>${swatches}</div></div>
      <div class="dl-acts">${acts.join('')}</div>`;
    this.k.wallet.innerHTML = `Wallet <b>${yen(C.money)}</b>`;
    this.k.say.textContent = this.msg;
    this.k.say.className = 'dl-say ' + this.tone;
  }
}
