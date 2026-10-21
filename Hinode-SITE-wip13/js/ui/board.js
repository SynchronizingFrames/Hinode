// The delivery board at the depot: today's slips, accept buttons, basket space, end the day.
import { PKG } from '../data/jobs.js';
import { CAPACITY } from '../game/jobs.js';
import { esc, yen, el, keys } from './dom.js';

const slipNo = (id) => { let h = 7; for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 9000; return 1000 + h; };

export class Board {
  constructor(parent, { jobs, clock, onClose, onEndDay }) {
    this.jobs = jobs; this.clock = clock; this.onClose = onClose; this.onEndDay = onEndDay;
    this.el = el('div', 'panel board', `
      <div class="sheet" role="dialog" aria-label="Delivery board">
        <header><div class="ttl"><span class="jp">配達ボード</span><b>Delivery Board</b></div><div class="meta" data-k="meta"></div><button class="x" type="button" data-close aria-label="Close">×</button></header>
        <div class="slips" data-k="slips"></div>
        <footer><span data-k="slots"></span><span class="keys"><kbd>E</kbd> or <kbd>Esc</kbd> to close</span><button class="ghost" type="button" data-endday>Call it a day</button></footer>
      </div>`);
    this.el.hidden = true;
    parent.append(this.el);
    this.k = keys(this.el);
    this.endBtn = this.el.querySelector('[data-endday]');
    this.el.addEventListener('click', (e) => {
      const a = e.target.closest('[data-accept]');
      if (a) { if (!a.disabled) { this.jobs.accept(a.dataset.accept); this.render(); } return; }
      if (e.target.closest('[data-close]') || e.target === this.el) { this.onClose(); return; }
      if (e.target.closest('[data-endday]')) {
        if (this.endBtn.classList.contains('armed')) { this.disarm(); this.onEndDay(); return; }
        this.endBtn.classList.add('armed');
        this.endBtn.textContent = `End day ${this.clock.day}? Click again`;
        clearTimeout(this.armT); this.armT = setTimeout(() => this.disarm(), 3000);
      }
    });
  }

  disarm() { clearTimeout(this.armT); this.endBtn.classList.remove('armed'); this.endBtn.textContent = 'Call it a day'; }
  show() { this.disarm(); this.render(); this.el.hidden = false; }
  hide() { this.el.hidden = true; }

  render() {
    const { jobs, clock } = this, list = jobs.board(), act = jobs.active().length;
    this.k.meta.textContent = `Day ${clock.day} · ${clock.fmt()} · ${clock.period()}`;
    this.k.slots.innerHTML = `Basket <b>${jobs.slotsUsed()}/${CAPACITY}</b>${act ? ` · ${act} on the go` : ''}`;
    this.k.slips.innerHTML = list.length ? list.map((j) => this.slip(j)).join('')
      : '<div class="empty">No more work on the board today.<br>Finish what you have, or call it a day.</div>';
  }

  slip(j) {
    const K = PKG[j.kind], f = this.jobs.place(j.from), t = this.jobs.place(j.to), c = this.jobs.canAccept(j.id);
    const diff = 1 + (j.kind === 'fragile' || j.kind === 'heavy' ? 1 : 0) + (j.kind === 'food' || j.dist / j.limit > 2.4 ? 1 : 0);
    const dots = '●'.repeat(diff) + '○'.repeat(3 - diff);
    const fromSub = j.sender && j.from === 'depot' ? `Sent by ${j.sender}` : f.addr;
    return `<article class="slip${j.authored ? ' story' : ''}${c.ok ? '' : ' blocked'}" style="--c:${K.color}">
      <div class="band"><em>${K.jp}</em><span>${K.label}${K.slots > 1 ? ' · 2 slots' : ''}</span><span class="no">No. ${slipNo(j.id)}</span></div>
      ${j.authored ? '<i class="seal">物語</i>' : ''}
      <h3>${esc(j.title)}</h3><p class="item">${esc(j.item)}</p>
      <dl><dt>From</dt><dd><b>${esc(f.name)}</b><span>${esc(fromSub)}</span></dd><dt>To</dt><dd><b>${esc(t.name)}</b><span>${esc(t.addr)}</span></dd></dl>
      <p class="note">${esc(j.note)}</p>
      <div class="foot"><span class="facts">${j.dist} m · ${j.limit} min<br><span class="dots" title="Difficulty">${dots}</span></span><span class="pay">${yen(j.reward)}<small>${j.xp} XP</small></span></div>
      <button type="button" data-accept="${esc(j.id)}"${c.ok ? '' : ' disabled'}>${c.ok ? 'Accept' : esc(c.reason)}</button>
    </article>`;
  }
}
