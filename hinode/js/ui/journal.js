// Journal (Tab): what's on the go, the logbook, career stats.
import { PKG } from '../data/jobs.js';
import { Career } from '../game/career.js';
import { esc, yen, el, keys, stepText, timeLeft } from './dom.js';

export class Journal {
  constructor(parent, { jobs, career, clock, onClose }) {
    this.jobs = jobs; this.career = career; this.clock = clock; this.onClose = onClose; this.armed = null;
    this.el = el('div', 'panel journal', `
      <div class="sheet" role="dialog" aria-label="Journal">
        <header><div class="ttl"><span class="jp">日誌</span><b>Journal</b></div><div class="meta" data-k="meta"></div><button class="x" type="button" data-close aria-label="Close">×</button></header>
        <div class="cols"><section><h4>On the go</h4><div data-k="act"></div></section><section><h4>Logbook</h4><ul class="jlog" data-k="log"></ul></section></div>
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

  render() {
    const { jobs, career, clock } = this, act = jobs.active();
    this.k.meta.textContent = `Day ${clock.day} · ${clock.fmt()}`;
    this.k.act.innerHTML = act.length ? act.map((j) => this.row(j)).join('') : '<p class="empty-s">Nothing on the go. The board at the depot has work.</p>';
    this.k.log.innerHTML = jobs.log.length ? jobs.log.slice(0, 30).map((e) => this.entry(e)).join('') : '<p class="empty-s">No deliveries yet.</p>';
    const s = career.stats;
    this.k.stats.innerHTML = [[s.delivered, 'Delivered'], [s.quick, 'Quick'], [s.failed, 'Failed'], [yen(s.earned), 'Earned'],
      [`Lv ${career.level}`, `${career.xp}/${Career.need(career.level)} XP`], [career.trustLabel(), `Trust ${career.trust}`]]
      .map(([a, b]) => `<div><b>${esc(a)}</b><span>${esc(b)}</span></div>`).join('');
  }
}
