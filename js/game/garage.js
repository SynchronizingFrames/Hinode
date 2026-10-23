// Your garage: which Hinode Motors cars you own, the paint on each, and which one you drive.
// Money goes through career.spend so a purchase can never put you below zero.
import { MODELS, PAINTS, STARTER, REPAINT } from '../data/cars.js';

const okPaint = (p) => PAINTS.some((q) => q.id === p);

export class Garage {
  constructor({ career }) {
    this.career = career; this.subs = [];
    this.reset();
  }

  reset() {
    this.owned = {};
    this.owned[STARTER] = { paint: MODELS[STARTER].paint, n: 1 };
    this.active = STARTER; this.spent = 0; this.tests = 0;
  }

  on(fn) { this.subs.push(fn); }
  emit(type, data) {
    for (const f of this.subs) {
      try { f(type, data); } catch (_) { /* a listener failing must not break a purchase */ }
    }
  }

  owns(id) { return !!this.owned[id]; }
  count() { return Object.keys(this.owned).length; }
  list() { return Object.keys(this.owned).sort((a, b) => this.owned[a].n - this.owned[b].n); }
  paintOf(id) { const o = this.owned[id]; return o ? o.paint : (MODELS[id] || MODELS[STARTER]).paint; }
  current() { return MODELS[this.active] || MODELS[STARTER]; }
  perk(k) { const m = this.current(); return (m.perk && m.perk[k]) || 0; }
  payMul() { return 1 + this.perk('pay'); }

  canBuy(id) {
    const m = MODELS[id];
    if (!m) return { ok: false, why: 'Not for sale' };
    if (this.owned[id]) return { ok: false, why: 'Already in your garage' };
    if (this.career.money < m.price) return { ok: false, why: 'Not enough money', short: m.price - this.career.money };
    return { ok: true };
  }

  buy(id, paint) {
    const c = this.canBuy(id);
    if (!c.ok) return c;
    const m = MODELS[id];
    if (!okPaint(paint)) paint = m.paint;
    if (!this.career.spend(m.price)) return { ok: false, why: 'Not enough money' };
    this.owned[id] = { paint, n: this.count() + 1 };
    this.spent += m.price; this.active = id;
    this.emit('buy', { id, paint }); this.emit('save');
    return { ok: true, model: m, paint };
  }

  use(id) {
    if (!this.owned[id] || this.active === id) return false;
    this.active = id;
    this.emit('use', { id }); this.emit('save');
    return true;
  }

  repaint(id, paint) {
    if (!this.owned[id]) return { ok: false, why: 'Not your car' };
    if (!okPaint(paint)) return { ok: false, why: 'Unknown colour' };
    if (this.owned[id].paint === paint) return { ok: false, why: 'It is already that colour' };
    if (!this.career.spend(REPAINT)) return { ok: false, why: 'Not enough money' };
    this.owned[id].paint = paint; this.spent += REPAINT;
    this.emit('paint', { id, paint }); this.emit('save');
    return { ok: true };
  }

  save() {
    const owned = {};
    for (const [id, o] of Object.entries(this.owned)) owned[id] = { paint: o.paint, n: o.n };
    return { owned, active: this.active, spent: this.spent, tests: this.tests };
  }

  // Old saves have no garage: you keep the starter coupe. Bad data is dropped, never trusted.
  load(d) {
    this.reset();
    if (!d || typeof d !== 'object') return;
    if (d.owned && typeof d.owned === 'object') {
      let n = 1;
      for (const [id, o] of Object.entries(d.owned)) {
        if (!MODELS[id]) continue;
        const paint = o && okPaint(o.paint) ? o.paint : MODELS[id].paint;
        this.owned[id] = { paint, n: o && Number.isFinite(o.n) ? o.n : ++n };
      }
    }
    if (!this.owned[STARTER]) this.owned[STARTER] = { paint: MODELS[STARTER].paint, n: 0 };
    if (typeof d.active === 'string' && this.owned[d.active]) this.active = d.active;
    this.spent = Number.isFinite(d.spent) ? Math.max(0, d.spent) : 0;
    this.tests = Number.isFinite(d.tests) ? Math.max(0, Math.floor(d.tests)) : 0;
  }
}
