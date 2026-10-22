// Controller navigation for every HTML overlay (title / pause / settings menus, board, journal, day summary and
// dialogue replies). D-pad (or the left stick in menus) moves a highlight between the visible controls,
// A / Cross presses it, B / Circle backs out, LB / RB switch settings tabs, left / right adjust sliders.
const SEL = 'button:not([disabled]), [data-act], [data-tab], [data-q], [data-pp], input[type="range"], label.chk';
const SKIP = '#hud, .touch, .talk-x, [data-padskip]';
const NAV = ['PadUp', 'PadDown', 'PadLeft', 'PadRight'];

const rectOf = (e) => e.getBoundingClientRect();
function usable(e) {
  if (!e.isConnected || e.closest(SKIP)) return false;
  const r = rectOf(e);
  if (r.width < 2 || r.height < 2) return false;
  const cs = getComputedStyle(e);
  if (cs.visibility === 'hidden' || cs.pointerEvents === 'none') return false;
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) return !!e.closest('.m-form, .board, .journal, .summary, ol, ul');
  const hit = document.elementFromPoint(cx, cy);
  return !!hit && (hit === e || e.contains(hit));
}

export class PadNav {
  constructor(input) { this.input = input; this.cur = null; this.pt = null; }

  cands() {
    const all = Array.from(document.querySelectorAll(SEL)).filter(usable);
    return all.filter((e) => !all.some((o) => o !== e && e.contains(o)));
  }

  set(e) {
    if (this.cur === e) return;
    const old = this.cur;
    this.cur = e || null;
    if (old) { old.classList.remove('pad-focus'); old.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, relatedTarget: e || null })); }
    if (!e) return;
    e.classList.add('pad-focus');
    try { e.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (_) { /* old browsers */ }
    const r = rectOf(e); this.pt = [r.left + r.width / 2, r.top + r.height / 2];
    e.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));   // same hover sound / animation as the mouse
  }

  nearest(c) {
    if (!this.pt) return c[0];
    let best = c[0], bd = Infinity;
    for (const e of c) { const r = rectOf(e), d = Math.hypot(r.left + r.width / 2 - this.pt[0], r.top + r.height / 2 - this.pt[1]); if (d < bd) { bd = d; best = e; } }
    return best;
  }

  move(dir) {
    const c = this.cands(); if (!c.length) return this.set(null);
    const cur = this.cur && c.includes(this.cur) ? this.cur : null;
    if (!cur) return this.set(this.nearest(c));
    const h = dir === 'PadLeft' || dir === 'PadRight';
    if (h && cur.matches('input[type="range"]')) return this.nudge(cur, dir === 'PadRight' ? 1 : -1);
    const a = rectOf(cur), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    let best = null, bs = Infinity;
    for (const e of c) {
      if (e === cur) continue;
      const b = rectOf(e), dx = b.left + b.width / 2 - ax, dy = b.top + b.height / 2 - ay;
      const main = dir === 'PadRight' ? dx : dir === 'PadLeft' ? -dx : dir === 'PadDown' ? dy : -dy;
      if (main < 6) continue;
      const s = main + (h ? Math.abs(dy) * 3 : Math.abs(dx) * 1.5);
      if (s < bs) { bs = s; best = e; }
    }
    if (best) this.set(best);
  }

  nudge(e, s) {
    const st = parseFloat(e.step) || 0.01, lo = parseFloat(e.min), hi = parseFloat(e.max), v0 = parseFloat(e.value) || 0;
    const v = +Math.min(hi, Math.max(lo, Math.round((v0 + st * s) / st) * st)).toFixed(4);
    if (v === v0) return;
    e.value = String(v);
    e.dispatchEvent(new Event('input', { bubbles: true }));
    e.dispatchEvent(new Event('change', { bubbles: true }));
  }

  press() {
    const c = this.cur && this.cur.isConnected ? this.cur : null;
    if (!c) { this.input.pressed.add('Enter'); return; }   // nothing to pick: A advances the dialogue
    if (c.matches('input[type="range"]')) return;
    c.click();
  }

  tabs(s) {
    const t = Array.from(document.querySelectorAll('.m-tab')).filter(usable);
    if (!t.length) return;
    const i = Math.max(0, t.findIndex((e) => e.classList.contains('on')));
    t[(i + s + t.length) % t.length].click();
  }

  update() {
    const I = this.input, on = I.uiOpen && I.device === 'pad';
    document.body.classList.toggle('pad-nav', on);
    if (!on) { if (this.cur) this.set(null); this.pt = null; return; }
    if (this.cur && !usable(this.cur)) { this.cur.classList.remove('pad-focus'); this.cur = null; }
    const p = I.pressed;
    if (p.has('PadLB')) this.tabs(-1);
    if (p.has('PadRB')) this.tabs(1);
    for (const d of NAV) if (p.has(d)) this.move(d);
    if (!this.cur) { const c = this.cands(); if (c.length) this.set(this.nearest(c)); }
    if (p.has('PadA')) this.press();
  }
}
