// End-of-day summary card.
import { yen, el, keys, esc } from './dom.js';

export class Summary {
  constructor(parent, { onNext }) {
    this.el = el('div', 'panel summary', `
      <div class="sheet" role="dialog" aria-label="Day summary">
        <header><div class="ttl"><span class="jp">本日の配達</span><b data-k="title"></b></div></header>
        <div class="sum-body"><div class="sum-grid" data-k="grid"></div><p class="sum-note" data-k="note"></p><button class="primary" type="button" data-k="next"></button></div>
      </div>`);
    this.el.hidden = true;
    parent.append(this.el);
    this.k = keys(this.el);
    this.k.next.addEventListener('click', () => onNext());
  }

  show(s) {
    const sign = (n) => (n > 0 ? '+' : '') + n;
    this.k.title.textContent = `Day ${s.day} complete`;
    this.k.grid.innerHTML = [[s.delivered, 'Delivered'], [s.quick, 'Quick deliveries'], [yen(s.earned), 'Earned today'], [sign(s.xp) + ' XP', 'Experience'],
      [sign(s.trust), 'Trust'], [s.failed, 'Failed or lost'], [yen(s.money), 'In your wallet'], [`Lv ${s.level}`, 'Level']]
      .map(([a, b]) => `<div><b>${esc(a)}</b><span>${esc(b)}</span></div>`).join('');
    this.k.note.textContent = s.delivered === 0 ? 'A quiet day. The board will have fresh work in the morning.'
      : s.failed === 0 && s.delivered >= 3 ? 'Not a single parcel late or lost. Chiyo would have nodded at that.'
      : 'The streetlights come on along Asahi-dōri. Tomorrow is another round.';
    this.k.next.textContent = `Start Day ${s.day + 1}`;
    this.el.hidden = false;
  }
  hide() { this.el.hidden = true; }
}
