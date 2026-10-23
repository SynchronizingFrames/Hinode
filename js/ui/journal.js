// Journal (Tab): what's on the go, the logbook, career stats.
import { PKG } from '../data/jobs.js';
import { ITEMS, BAG_MAX } from '../data/shop.js';
import { Career } from '../game/career.js';
import { esc, yen, el, keys, stepText, timeLeft } from './dom.js';

export class Journal {
  constructor(parent, { jobs, career, clock, onClose }) {
    this.story = (arguments[1] || {}).story;
    this.shop = (arguments[1] || {}).shop;
    this.jobs = jobs; this.career = career; this.clock = clock; this.onClose = onClose; this.armed = null;
    this.el = el('div', 'panel journal', `
      <div class="sheet" role="dialog" aria-label="Journal">
        <header><div class="ttl"><span class="jp">日誌</span><b>Journal</b></div><div class="meta" data-k="meta"></div><button class="x" type="button" data-close aria-label="Close">×</button></header>
        <section class="jstory" data-k="story"></section><section class="jbag" data-k="bag"></section><div class="cols"><section><h4>On the go</h4><div data-k="act"></div></section><section><h4>Logbook</h4><ul class="jlog" data-k="log"></ul></section></div>
        <footer><div class="stats" data-k="stats"></div><span class="keys"><kbd>Tab</kbd> or <kbd>Esc</kbd> to close</span></footer>
      </div>`);
    this.el.hidden = true;
    parent.append(this.el);
    this.k = keys(this.el);
    this.el.addEventListener('click', (e) => this.click(e));
  }

  click(e) {
    const tr = e.target.closest('[data-track]');
    if (tr) { this.jobs.track(tr.dataset.track); this.render(); return; }
    const cb = e.target.closest('[data-cancel]');
    if (cb) {
      const id = cb.dataset.cancel;
      clearTimeout(this.armT);
      if (this.armed === id) { this.armed = null; this.jobs.cancel(id); }
      else { this.armed = id; this.armT = setTimeout(() => { this.armed = null; if (!this.el.hidden) this.render(); }, 3000); }
      this.render();
      return;
    }
    if (e.target.closest('[data-close]') || e.target === this.el) this.onClose();
  }

  show() { this.armed = null; this.render(); this.el.hidden = false; }
  hide() { this.el.hidden = true; }

  row(j) {
    const { jobs, clock } = this, K = PKG[j.kind], f = jobs.place(j.from), t = jobs.place(j.to);
    const tracked = j.id === jobs.trackedId, armed = this.armed === j.id;
    const cancel = armed ? 'Sure? Click again' : j.state === 'carried' ? 'Give up (-1 trust)' : 'Cancel';
    const track = tracked ? '<span class="tracking">Tracking</span>' : `<button class="ghost" type="button" data-track="${esc(j.id)}">Track</button>`;
    return `<div class="jact${tracked ? ' on' : ''}${j.late ? ' late' : ''}"><em class="stamp" style="--c:${K.color}">${K.jp}</em>
      <div><b>${esc(j.title)}</b><span>${esc(stepText(jobs, j))} · ${timeLeft(j, clock.min)}</span><small>${esc(f.name)} → ${esc(t.name)}, ${esc(t.addr)}</small></div>
      <div class="btns">${track}<button class="ghost${armed ? ' armed' : ''}" type="button" data-cancel="${esc(j.id)}">${cancel}</button></div></div>`;
  }

  entry(e) {
    const res = e.ok ? yen(e.pay) : e.why === 'closed' ? 'Depot closed' : 'Expired';
    return `<li class="${e.ok ? '' : 'bad'}"><time>Day ${e.day} · ${this.clock.fmt(e.time)}</time><b>${esc(e.title)} <span>to ${esc(e.to)}</span></b><em>${res}</em>${e.ok && e.line ? `<q>${esc(e.line)}</q>` : ''}</li>`;
  }

  bagHtml() {
    const s = this.shop; if (!s) return '';
    const ids = Object.keys(s.bag).filter((id) => ITEMS[id]);
    const fx = [['pace', '\u901f', 'Pace', '+'], ['care', '\u614e', 'Steady hands', '\u2212']].filter(([k]) => s.buff(k) > 0)
      .map(([k, g, n, sg]) => `<span class="jbuff c-${k}"><b>${g}</b> ${n} ${sg}${Math.round(s.buff(k) * 100)}% \u00b7 ${s.left(k)} min left</span>`).join('');
    const rows = ids.map((id) => {
      const it = ITEMS[id], verb = it.kind === 'drink' ? 'Drink' : it.kind === 'tool' ? 'Use' : 'Eat';
      return `<li class="jbag-it k-${esc(it.kind)}"><span class="jbag-g">${esc(it.g || '\u54c1')}</span><b>${esc(it.name)}</b><i>\u00d7${s.bag[id]}</i>`
        + (it.gift ? '<span class="jgift">Gift: offer it when you talk to someone</span>' : '')
        + (it.fx ? `<button type="button" class="ghost" data-use="${esc(id)}">${verb}</button>` : '') + '</li>';
    }).join('');
    return `<h4>Bag <small>${s.count()}/${BAG_MAX}</small></h4>${fx ? `<div class="jbuffs">${fx}</div>` : ''}`
      + (rows ? `<ul class="jbag-list">${rows}</ul>` : '<p class="jnone">Empty. Hinode Mart in Shinjuku never closes.</p>');
  }

  storyHtml() {
    const S = this.story;
    if (!S) return '';
    const E = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => '&#' + c.charCodeAt(0) + ';');
    const chs = S.journal().reverse();
    return `<h4>Story${S.done ? ' · Complete' : ''}</h4>` + chs.map(({ ch, steps, notes }, i) => `<div class="jch${i ? ' old' : ''}"><div class="jct"><span>${E(ch.kanji)}</span><b>${E(ch.title)}</b><i>${E(ch.jpTitle)}</i></div>`
      + (i === 0 && !S.done ? `<ul class="jst">${steps.filter((q) => q.done || q.ready).map((q) => `<li class="${q.done ? 'ok' : 'now'}">${q.done ? '✓' : '•'} ${E(q.text)}</li>`).join('')}</ul>` : '')
      + notes.map((n) => `<p class="jnote">${E(n)}</p>`).join('') + '</div>').join('');
  }

  render() {
    const { jobs, career, clock } = this, act = jobs.active();
    this.k.meta.textContent = `Day ${clock.day} · ${clock.fmt()}`;
    if (this.k.story) this.k.story.innerHTML = this.storyHtml();
    if (this.k.bag) {
      this.k.bag.innerHTML = this.bagHtml();
      if (!this._bagBound) { this._bagBound = true; this.k.bag.addEventListener('click', (e) => { const u = e.target.closest('[data-use]'); if (u && this.shop && this.shop.use(u.dataset.use)) this.render(); }); }
    }
    this.k.act.innerHTML = act.length ? act.map((j) => this.row(j)).join('') : '<p class="empty-s">Nothing on the go. The board at the depot has work.</p>';
    this.k.log.innerHTML = jobs.log.length ? jobs.log.slice(0, 30).map((e) => this.entry(e)).join('') : '<p class="empty-s">No deliveries yet.</p>';
    const s = career.stats;
    this.k.stats.innerHTML = [[s.delivered, 'Delivered'], [s.quick, 'Quick'], [s.failed, 'Failed'], [yen(s.earned), 'Earned'],
      [`Lv ${career.level}`, `${career.xp}/${Career.need(career.level)} XP`], [career.trustLabel(), `Trust ${career.trust}`]]
      .map(([a, b]) => `<div><b>${esc(a)}</b><span>${esc(b)}</span></div>`).join('');
  }
}
