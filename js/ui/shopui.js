// The shop counter overlay (konbini, cafe, drugstore, ramen, yakiniku, izakaya, game centre)
// and the little boost chips under the money in the HUD card.
import { ITEMS, BAG_MAX } from '../data/shop.js';
import { esc, yen, el, keys } from './dom.js';

const fxText = (it) => {
  const f = it.fx, out = [];
  if (f && f.pace) out.push(`+${Math.round(f.pace * 100)}% pace`);
  if (f && f.care) out.push(`−${Math.round(f.care * 100)}% bumps`);
  if (f && f.min) out.push(f.min >= 60 ? `${+(f.min / 60).toFixed(1)} h` : `${f.min} min`);
  return out.join(' · ');
};
const tagText = (it) => it.kind === 'meal' ? `Eat here · ${it.eat || 15} min` : it.kind === 'play' ? 'One go' : it.kind === 'gift' ? 'Gift' : it.gift ? 'Gift or eat' : it.kind === 'drink' ? 'Drink' : it.kind === 'tool' ? 'Use' : 'Food';

export class ShopUI {
  constructor(parent, { shop, career, clock, hudRoot, onClose, onBuy }) {
    this.shop = shop; this.career = career; this.clock = clock; this.hudRoot = hudRoot; this.onClose = onClose; this.onBuy = onBuy;
    this.el = el('div', 'panel shop', `
      <div class="sheet" role="dialog" aria-label="Shop">
        <header><div class="ttl"><span class="jp" data-k="jp"></span><b data-k="name"></b></div><div class="meta" data-k="meta"></div><button class="x" type="button" data-close aria-label="Close">×</button></header>
        <p class="sh-say" data-k="say"></p>
        <div class="sh-grid" data-k="grid"></div>
        <footer><span class="sh-wallet" data-k="wallet"></span><span class="sh-bag" data-k="bag"></span><span class="keys"><kbd>E</kbd> or <kbd>Esc</kbd> to leave</span></footer>
      </div>`);
    this.el.hidden = true;
    parent.append(this.el);
    this.k = keys(this.el);
    this.chips = el('div', 'sh-buffs'); this.chips.hidden = true; this.chipStr = null;
    this.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-buy]');
      if (b) { if (!b.disabled) this.buy(b.dataset.buy); return; }
      if (e.target.closest('[data-close]') || e.target === this.el) this.onClose();
    });
  }

  show(place) {
    this.place = place || {}; this.kind = this.place.shop;
    const info = this.shop.info(this.kind) || { jp: '店', en: 'Shop', greet: '' };
    this.el.dataset.kind = this.kind || '';
    this.k.jp.textContent = info.jp; this.k.name.textContent = info.en;
    this.k.say.textContent = info.greet || ''; this.k.say.className = 'sh-say';
    this.render();
    this.el.hidden = false;
  }
  hide() { this.el.hidden = true; }
  get open() { return !this.el.hidden; }

  buy(id) {
    const res = this.shop.buy(id);
    this.k.say.textContent = res.ok ? res.msg : `${res.why}.`;
    this.k.say.className = `sh-say ${res.ok ? (res.won === false ? 'meh' : 'ok') : 'no'}`;
    this.render();
    if (this.onBuy) this.onBuy(res, id);
    const f = this.el.querySelector(`[data-buy="${id}"]`);
    if (f && res.ok) { f.classList.remove('got'); void f.offsetWidth; f.classList.add('got'); }
  }

  render() {
    const { shop, career, clock } = this, list = shop.stock(this.kind), full = shop.full();
    this.k.meta.textContent = `${(this.place && this.place.addr) || 'Shinjuku'} · ${clock.fmt()}`;
    this.k.wallet.innerHTML = `Wallet <b>${yen(career.money)}</b>`;
    this.k.bag.textContent = `Bag ${shop.count()}/${BAG_MAX}`;
    this.k.grid.innerHTML = list.map((it) => {
      const broke = career.money < it.price, nospace = shop.carries(it) && full, dis = broke || nospace;
      const why = broke ? 'Not enough money' : nospace ? 'Bag full' : '';
      const own = shop.bag[it.id] ? `<i class="sh-own">×${shop.bag[it.id]} in bag</i>` : '';
      return `<button type="button" class="sh-item k-${esc(it.kind)}" data-buy="${esc(it.id)}"${dis ? ' disabled' : ''}>
        <span class="sh-g">${esc(it.g || '品')}</span>
        <span class="sh-tx"><b>${esc(it.name)}</b><span class="jp">${esc(it.jp)}</span><em>${esc(it.desc)}</em>
          <span class="sh-tags"><span class="sh-tag">${esc(tagText(it))}</span>${it.fx ? `<span class="sh-fx">${esc(fxText(it))}</span>` : ''}${own}</span></span>
        <span class="sh-pr">${yen(it.price)}${why ? `<small>${why}</small>` : ''}</span>
      </button>`;
    }).join('');
  }

  // Called every frame: keeps the boost chips under the money card up to date.
  tick() {
    if (!this.chips.isConnected && this.hudRoot) { const c = this.hudRoot.querySelector('.h-card'); if (c) c.append(this.chips); }
    const s = this.shop, parts = [];
    const p = s.buff('pace'), c = s.buff('care');
    if (p > 0) parts.push(['pace', '速', `+${Math.round(p * 100)}%`, s.left('pace')]);
    if (c > 0) parts.push(['care', '慎', `−${Math.round(c * 100)}%`, s.left('care')]);
    const str = parts.map((q) => q.join('|')).join(';');
    if (str === this.chipStr) return;
    this.chipStr = str;
    this.chips.hidden = !parts.length;
    this.chips.innerHTML = parts.map(([k, g, v, m]) => `<span class="sh-chip c-${k}" title="${k === 'pace' ? 'Faster on foot' : 'Fewer parcel bumps'}"><b>${g}</b>${v}<i>${m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m}m`}</i></span>`).join('');
  }
}

export { ITEMS };
