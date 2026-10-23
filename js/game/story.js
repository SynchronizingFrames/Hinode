// Story mode logic: chapter progress, scene and phone triggers, which family members are out in town,
// and the save block. The title cards, HUD objective and finale live in ui/storyui.js; main.js wires both.
import { CHAPTERS, SCENES, SPEAKERS } from '../data/story.js';
import { CAST } from '../data/cast.js';

const BY = Object.fromEntries(CAST.map((c) => [c.id, c]));
const SCENE_STEP = new Map();
for (const ch of CHAPTERS) for (const st of ch.steps) if (st.scene) SCENE_STEP.set(st.scene, st);
const STEP_BY = new Map();
for (const ch of CHAPTERS) for (const st of ch.steps) STEP_BY.set(st.id, st);
const CH_AT = Object.fromEntries(CHAPTERS.map((c, i) => [c.id, i]));
// Saves from before the story grew to twelve chapters stored a plain index into these five.
const OLD_ORDER = ['ch1', 'ch2', 'ch3', 'ch4', 'ch5'];
// Steps ticked off by something you do: a purchase, a gift, a test drive, cash on hand.
const FLAGGED = new Set(['buy', 'gift', 'test', 'money']);
const yen = (n) => '¥' + Math.round(n).toLocaleString('en-US');

// Where Mum works in Shinjuku: the first café (else bar, izakaya, ramen shop) in the district.
// She stands on the pavement just beside its door.
export function storyPlaces(world) {
  if (world.storyPlaces) return world.storyPlaces;
  const shops = (world.tokyo && world.tokyo.shops) || [];
  let i = -1;
  for (const k of ['cafe', 'bar', 'izakaya', 'ramen']) { i = shops.findIndex((s) => s.kind === k); if (i >= 0) break; }
  if (i < 0) i = shops.findIndex((s) => s.kind !== 'shutter');
  const s = shops[i], g = world.depot.gate;
  world.storyPlaces = { akiko: s ? { x: s.x + 2.2, z: s.z, shop: i } : { x: g[0] + 5, z: g[1] - 3, shop: -1 } };
  return world.storyPlaces;
}

const blank = () => ({ v: 2, ch: 0, seen: [], flags: [], choices: {}, done: false });
const hh = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;

export class Story {
  constructor({ jobs, npcs, shop = null, garage = null, career = null, weather = null }) {
    this.jobs = jobs; this.npcs = npcs; this.shop = shop; this.garage = garage; this.career = career; this.weather = weather; this.fns = [];
    this.s = blank(); this.wait = 0; this.pend = null; this.rung = false;
    this.wx = null; this.wxLock = false; // weather a chapter is forcing (the typhoon); wxLock: ?weather= wins
    if (npcs) { npcs.gate = (id) => this.visible(id); npcs.storyMark = (id) => !!this.sceneStep(id); }
    this.sync();
  }

  on(fn) { this.fns.push(fn); }
  emit(t, d) { for (const f of this.fns) f(t, d || {}); }

  reset() { this.s = blank(); this.pend = null; this.sync(); }
  save() { return JSON.parse(JSON.stringify({ ...this.s, v: 2, chId: CHAPTERS[this.s.ch].id })); }
  load(o) {
    const b = blank();
    if (o && typeof o === 'object') {
      let ch = Math.floor(+o.ch || 0);
      if (typeof o.chId === 'string' && o.chId in CH_AT) ch = CH_AT[o.chId];
      else if (o.v !== 2) ch = CH_AT[OLD_ORDER[Math.max(0, Math.min(OLD_ORDER.length - 1, ch))]];
      b.ch = Math.max(0, Math.min(CHAPTERS.length - 1, ch));
      b.seen = Array.isArray(o.seen) ? o.seen.filter((id) => SCENES[id]) : [];
      b.flags = Array.isArray(o.flags) ? o.flags.filter((f) => typeof f === 'string') : [];
      b.choices = o.choices && typeof o.choices === 'object' ? o.choices : {};
      b.done = !!o.done;
    }
    this.s = b; this.pend = null; this.sync();
  }

  get chapter() { return CHAPTERS[this.s.ch]; }
  get done() { return this.s.done; }
  get chapters() { return CHAPTERS; }
  seen(id) { return this.s.seen.includes(id); }

  stepDone(st) {
    if (!st) return true;
    if (st.type === 'job') return this.jobs.completed.has(st.job);
    if (st.type === 'finale') return this.s.done;
    if (st.type === 'car') return this.ownsAny(st.models);
    if (FLAGGED.has(st.type)) return this.s.flags.includes('step:' + st.id) || (!!st.or && st.or !== st.id && this.stepDone(STEP_BY.get(st.or)));
    return this.seen(st.scene);
  }
  ownsAny(models) { return !!this.garage && (models || []).some((m) => this.garage.owns(m)); }

  // Tick off a buy / gift / test / money step. It becomes a flag on the save (and on the board, for job gates).
  tick(st) {
    const f = 'step:' + st.id;
    if (this.s.flags.includes(f)) return false;
    this.s.flags.push(f); this.sync();
    this.emit('step', { step: st });
    this.emit('save');
    return true;
  }
  // Things you do elsewhere, forwarded by main.js: 'gift' { npc, id } from the shop, 'test' from the dealer.
  // They only count for a step that's open right now.
  event(type, d = {}) {
    if (this.s.done) return false;
    const ch = this.chapter;
    let hit = false;
    for (const st of ch.steps) {
      if (st.type !== type || this.stepDone(st) || !this.stepReady(st, ch)) continue;
      if (type === 'gift') {
        const who = d.npc === 'akiko-city' ? 'akiko' : d.npc;
        if (st.npc !== who || (st.item && st.item !== d.id)) continue;
      }
      hit = this.tick(st) || hit;
    }
    return hit;
  }
  // Steps that tick themselves (an item in your bag, cash on hand), and the typhoon's weather.
  poll(ch) {
    for (const st of ch.steps) {
      if ((st.type !== 'buy' && st.type !== 'money') || this.stepDone(st) || !this.stepReady(st, ch)) continue;
      if (st.type === 'buy' && this.shop && this.shop.has(st.item)) { if (st.take) this.shop.take(st.item); this.tick(st); }
      else if (st.type === 'money' && this.career && this.career.money >= st.amount) this.tick(st);
    }
    const until = ch.weatherUntil && STEP_BY.get(ch.weatherUntil);
    const want = ch.weather && !(until && this.stepDone(until)) ? ch.weather : null;
    if (this.weather && !this.wxLock && want !== this.wx) { this.weather.force(want); this.wx = want; }
  }
  // Jobs are gated by the board; scenes, calls and the finale wait for everything listed before them.
  stepReady(st, ch = this.chapter) {
    if (!st) return false;
    const needs = st.needs || (st.type === 'job' ? [] : ch.steps.slice(0, ch.steps.indexOf(st)).map((q) => q.id));
    return needs.every((id) => this.stepDone(ch.steps.find((q) => q.id === id)));
  }
  current() {
    if (this.s.done) return null;
    const ch = this.chapter;
    return ch.steps.find((st) => !this.stepDone(st) && this.stepReady(st, ch)) || null;
  }
  sceneStep(npcId) {
    if (this.s.done) return null;
    const ch = this.chapter;
    return ch.steps.find((st) => st.type === 'talk' && st.npc === npcId && !this.stepDone(st) && this.stepReady(st, ch)) || null;
  }

  // Family members only show up when the story has brought them there.
  visible(id) {
    const c = BY[id];
    if (!c || !c.story) return true;
    const ch = this.s.ch, end = this.s.done;
    // Mum works in Shinjuku from chapter 4 until you drive her home in chapter 10; after that she's at the depot.
    const P = CH_AT.platform;
    const home = end || ch > P || (ch === P && this.jobs.completed.has('mum-home'));
    const riding = ch === P && this.jobs.carried().some((j) => j.id === 'mum-home');
    if (id === 'akiko-city') return !home && !riding && ch >= CH_AT.ch4;
    if (id === 'akiko') return home;
    if (id === 'grandma') {
      if (end) return true;
      if (ch < CH_AT.ch5) return false;
      const st = STEP_BY.get('c5-home');
      return this.stepDone(st) || this.stepReady(st, CHAPTERS[CH_AT.ch5]);
    }
    return true;
  }

  // Chapter gates and scene flags go onto the job board, which then adds whatever they unlock.
  sync() {
    for (let i = 0; i <= this.s.ch && i < CHAPTERS.length; i++) this.jobs.flags.add(CHAPTERS[i].id);
    for (const f of this.s.flags) this.jobs.flags.add(f);
    this.jobs.refresh();
  }

  // HUD line: { ch, st, text, sub }
  objective() {
    if (this.s.done) return null;
    const ch = this.chapter, st = this.current();
    if (!st) return null;
    let sub = '';
    if (st.type === 'talk') {
      const c = BY[st.npc];
      sub = 'Look for the speech bubble' + (c && c.hours ? ` · around ${c.hours.map(([a, b]) => `${hh(a)}–${hh(b)}`).join(', ')}` : '');
    } else if (st.type === 'job') {
      const has = (L) => L.some((j) => j.id === st.job);
      sub = has(this.jobs.carried()) ? 'In your bag' : has(this.jobs.active()) ? 'Accepted · go and collect it' : has(this.jobs.board()) ? 'On the delivery board' : 'Not on the board yet';
    } else if (st.type === 'phone') sub = 'Keep your phone on';
    else if (st.type === 'buy') sub = st.where || 'Shops in Shinjuku';
    else if (st.type === 'gift') {
      const c = BY[st.npc], name = (SPEAKERS[st.npc] && SPEAKERS[st.npc].name) || (c ? c.name : 'them');
      const g = this.shop && this.shop.gifts ? this.shop.gifts() : [];
      const has = this.shop && (st.item ? this.shop.has(st.item) : (g && g.length > 0));
      sub = (st.hint ? st.hint + ' · ' : '') + (has ? `Talk to ${name}, then 'I brought you something.'` : 'Buy a gift first · konbini, café or drugstore');
    } else if (st.type === 'test') sub = 'Hinode Motors · under the tracks in Shinjuku · 09:00–21:00 · free';
    else if (st.type === 'money') sub = `${yen(this.career ? this.career.money : 0)} of ${yen(st.amount)} saved`;
    else if (st.type === 'car') sub = 'Hinode Motors · ' + (st.hint || 'any car');
    else if (st.type === 'finale') sub = this.jobs.active().length ? 'Finish the deliveries you have first' : 'Dawn is coming';
    return { ch, st, text: st.text, sub };
  }

  // Where the HUD arrow points for a talk objective (only if that person is out right now).
  goal() {
    const st = this.current();
    if (!st || (st.type !== 'talk' && st.type !== 'gift') || !this.npcs) return null;
    const n = this.npcs.list.find((q) => q.c.id === st.npc && q.out);
    return n ? { x: n.x, z: n.z, label: `${st.type === 'gift' ? 'Gift' : 'Talk'} · ${n.c.name}` } : null;
  }

  // ctx: { free: playing and not in a conversation, idle: no accepted deliveries }
  update(dt, ctx) {
    if (this.s.done) return;
    const ch = this.chapter;
    this.poll(ch);
    if (ch.steps.every((st) => this.stepDone(st))) {
      if (this.s.ch < CHAPTERS.length - 1) {
        this.s.ch++; this.pend = null; this.sync();
        this.emit('chapter', { chapter: this.chapter });
        this.emit('save');
      }
      return;
    }
    const cur = this.current();
    if (!cur || (cur.type !== 'phone' && cur.type !== 'finale')) { if (this.pend !== '__open') this.pend = null; return; }
    if (this.pend === '__open') return;
    if (this.pend !== cur.id) { this.pend = cur.id; this.wait = 0; this.rung = false; }
    if (!ctx.free || (cur.type === 'finale' && !ctx.idle)) return;
    this.wait += dt;
    if (cur.type === 'phone') {
      if (!this.rung && this.wait > 3) { this.rung = true; this.emit('ring', { step: cur, scene: SCENES[cur.scene] }); }
      if (this.wait > 5.5) { this.pend = '__open'; this.emit('phone', { step: cur }); }
    } else if (this.wait > 3) { this.pend = '__open'; this.emit('finale', { step: cur }); }
  }

  who(id, sc) {
    const c = BY[id];
    const base = SPEAKERS[id] || (c ? { jp: c.jp, name: c.name, role: c.role } : { jp: '', name: id, role: '' });
    if (!sc || !sc.phone || id === 'n') return base;
    return { ...base, role: `${sc.phone === 'out' ? 'Calling' : 'Phone call'} · ${sc.place || ''}` };
  }

  // A scene as a chain of Talk nodes: { who (header to open with), node }
  build(id) {
    const sc = SCENES[id];
    const chain = (lines, i, tail) => {
      if (i >= lines.length) return tail ? tail() : null;
      const L = lines[i], e = Array.isArray(L) ? { who: L[0], line: L[1] } : L;
      const rest = () => chain(lines, i + 1, tail);
      const node = { line: e.line, cls: e.who === 'n' ? 'narr' : '' };
      if (e.who !== 'n') node.who = this.who(e.who, sc);
      if (e.choose) node.options = e.choose.map((o, k) => ({ label: o.label, run: () => { this.s.choices[id] = k; return chain(o.then || [], 0, rest); } }));
      else node.next = rest;
      return node;
    };
    const st = SCENE_STEP.get(id);
    const host = sc.caller || (st && st.npc) || 'n';
    return { who: this.who(host === 'akiko-city' ? 'akiko' : host, sc), node: chain(sc.lines, 0, null), phone: !!sc.phone };
  }

  // Talk scenes only count if you reach the end; phone calls count as soon as they close.
  finishScene(id, reached) {
    const sc = SCENES[id], st = SCENE_STEP.get(id);
    this.pend = null;
    if (!sc || this.seen(id)) return false;
    if (!reached && st && st.type === 'talk') return false;
    this.s.seen.push(id);
    if (sc.flag && !this.s.flags.includes(sc.flag)) this.s.flags.push(sc.flag);
    if (sc.money && this.career) { this.career.addMoney(sc.money); this.emit('money', { n: sc.money, note: sc.moneyNote || '' }); }
    this.sync();
    this.emit('scene', { id, scene: sc, step: st });
    this.emit('save');
    return true;
  }

  finish() { this.s.done = true; this.pend = null; this.emit('done'); this.emit('save'); }

  // Journal: every chapter reached so far, its objectives, and the notes from scenes you've seen.
  journal() {
    return CHAPTERS.slice(0, this.s.ch + 1).map((ch) => ({
      ch,
      steps: ch.steps.map((st) => ({ text: st.text, done: this.stepDone(st), ready: this.stepReady(st, ch) })),
      notes: ch.steps.filter((st) => st.scene && this.seen(st.scene)).map((st) => SCENES[st.scene].note).filter(Boolean),
    }));
  }
}
