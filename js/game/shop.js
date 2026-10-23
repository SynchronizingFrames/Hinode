// Shopping: buying from Shinjuku shops, the bag, food and drink boosts, and gifts for people you talk to.
// No DOM. Boost times are absolute game minutes (day * 1440 + minute), so they survive saves.
import { ITEMS, STOCK, SHOP_INFO, LIKES, GIFT_LINES, BAG_MAX } from '../data/shop.js';

const now = (clock) => clock.day * 1440 + clock.min;
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const FX = ['pace', 'care'];

export class Shop {
  constructor({ career, clock }) {
    this.career = career; this.clock = clock; this.fns = [];
    this.reset();
  }

  reset() { this.bag = {}; this.buffs = {}; this.given = {}; this.spent = 0; this.bought = 0; }
  on(fn) { this.fns.push(fn); }
  emit(type, data) { for (const f of this.fns) { try { f(type, data); } catch (e) { console.error(e); } } }

  info(kind) { return SHOP_INFO[kind] || null; }
  stock(kind) { return (STOCK[kind] || []).filter((id) => ITEMS[id]).map((id) => ({ id, ...ITEMS[id] })); }
  open(kind, min = this.clock.min) { const s = SHOP_INFO[kind]; if (!s) return false; const [a, b] = s.hours || [0, 1440]; return min >= a && min < b; }
  count() { let n = 0; for (const k in this.bag) n += this.bag[k]; return n; }
  full() { return this.count() >= BAG_MAX; }
  has(id) { return (this.bag[id] || 0) > 0; }
  carries(it) { return it.kind !== 'meal' && it.kind !== 'play'; }

  // -> { ok, why?, msg, won?, item }
  buy(id) {
    const it = ITEMS[id];
    if (!it || it.prize === true) return { ok: false, why: 'Not for sale' };
    if (this.carries(it) && this.full()) return { ok: false, why: 'Your bag is full', item: it };
    if (!this.career.spend(it.price)) return { ok: false, why: 'Not enough money', item: it };
    this.spent += it.price; this.bought++;
    if (it.kind === 'meal') {
      this.apply(it);
      this.clock.min += it.eat || 15;
      this.emit('eat', { id, it });
      this.emit('save');
      return { ok: true, item: it, msg: `ごちそうさまでした. ${it.name}, ${it.eat || 15} minutes well spent.` };
    }
    if (it.kind === 'play') {
      const won = Math.random() < (it.win || 0.3);
      if (won && it.prize && !this.full()) this.add(it.prize);
      this.emit('play', { id, won });
      this.emit('save');
      return { ok: true, won, item: it, msg: won ? `You won a ${ITEMS[it.prize].name.toLowerCase()}! It goes in your bag.` : 'The claw grabs it, lifts it, and drops it. Of course.' };
    }
    this.add(id);
    this.emit('buy', { id, it });
    return { ok: true, item: it, msg: `${it.name} goes in your bag.` };
  }

  add(id) { this.bag[id] = (this.bag[id] || 0) + 1; this.emit('save'); }
  take(id) { if (!this.has(id)) return false; if (--this.bag[id] <= 0) delete this.bag[id]; this.emit('save'); return true; }

  // Eat / drink / use something from the bag.
  use(id) {
    const it = ITEMS[id];
    if (!it || !it.fx || !this.take(id)) return false;
    this.apply(it);
    this.emit('use', { id, it });
    return true;
  }

  apply(it) {
    const f = it.fx; if (!f) return;
    const t = now(this.clock), until = t + (f.min || 60);
    for (const k of FX) {
      if (!f[k]) continue;
      const b = this.buffs[k], live = b && b.until > t;
      this.buffs[k] = { v: Math.max(f[k], live ? b.v : 0), until: Math.max(until, live ? b.until : 0) };
    }
    this.emit('save');
  }

  buff(k) { const b = this.buffs[k]; return b && b.until > now(this.clock) ? b.v : 0; }
  left(k) { const b = this.buffs[k]; return b ? Math.max(0, Math.ceil(b.until - now(this.clock))) : 0; }
  paceMul() { return 1 + this.buff('pace'); }
  careMul() { return 1 - this.buff('care'); }

  gifts() { return Object.keys(this.bag).filter((id) => ITEMS[id] && ITEMS[id].gift); }
  canGive(npc) { return this.given[npc] !== this.clock.day && this.gifts().length > 0; }

  give(npc, id) {
    const it = ITEMS[id];
    if (!it || !it.gift || this.given[npc] === this.clock.day || !this.take(id)) return null;
    this.given[npc] = this.clock.day;
    const liked = (LIKES[npc] || []).includes(id), trust = liked ? 3 : 2;
    this.career.addTrust(trust);
    let line = liked ? pick(GIFT_LINES.liked) : pick(GIFT_LINES.plain);
    if (liked && npc === 'grandma' && id === 'melonpan') line = GIFT_LINES.grandma;
    if (liked && npc === 'akiko' && id === 'latte') line = GIFT_LINES.akiko;
    this.emit('gift', { npc, id, liked });
    return { line, liked, trust, item: it };
  }

  // Add an "I brought you something" reply to a conversation (and to every reply after it).
  decorate(node, npc) {
    if (!node || !Array.isArray(node.options) || !node.options.length) return node;
    const base = node.options.filter((o) => !o.gift).map((o) => ({ ...o, run: () => this.decorate(o.run(), npc) }));
    const out = { ...node, options: base };
    if (this.canGive(npc)) {
      const back = () => base;
      const gift = {
        gift: true, label: 'I brought you something.',
        run: () => ({
          line: 'Oh? What have you got there?',
          options: [
            ...this.gifts().slice(0, 3).map((id) => ({
              label: `Give the ${ITEMS[id].name.toLowerCase()}`,
              run: () => { const g = this.give(npc, id); return { line: g ? g.line : 'Hm?', bond: g ? `+${g.trust} trust` : '', options: back() }; },
            })),
            { label: 'Actually, never mind.', run: () => ({ line: 'Ha. All right.', options: back() }) },
          ],
        }),
      };
      out.options = [...base.slice(0, Math.max(0, base.length - 1)), gift, ...base.slice(Math.max(0, base.length - 1))];
    }
    return out;
  }

  save() { return { bag: { ...this.bag }, buffs: JSON.parse(JSON.stringify(this.buffs)), given: { ...this.given }, spent: this.spent, bought: this.bought }; }

  load(d) {
    this.reset();
    if (!d || typeof d !== 'object') return;
    if (d.bag && typeof d.bag === 'object') for (const [k, v] of Object.entries(d.bag)) if (ITEMS[k] && Number.isInteger(v) && v > 0) this.bag[k] = Math.min(v, BAG_MAX);
    if (d.buffs && typeof d.buffs === 'object') for (const k of FX) { const b = d.buffs[k]; if (b && Number.isFinite(b.v) && Number.isFinite(b.until)) this.buffs[k] = { v: Math.min(0.5, Math.max(0, b.v)), until: b.until }; }
    if (d.given && typeof d.given === 'object') for (const [k, v] of Object.entries(d.given)) if (Number.isInteger(v)) this.given[k] = v;
    if (Number.isFinite(d.spent)) this.spent = d.spent;
    if (Number.isFinite(d.bought)) this.bought = d.bought;
  }
}
