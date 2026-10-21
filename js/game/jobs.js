// Delivery jobs: board, accept, collect, deliver, deadlines, fragile damage, rewards, day end.
// Pure logic (no DOM). State is plain data so it can be saved later.
import { PKG, AUTHORED, RESIDENTS, ITEMS, LINES, SENDERS, SHOP_LABEL, PLAIN_SHOPS, FOOD_SHOPS } from '../data/jobs.js';
import { DAY_END, DAY_START } from './career.js';

export const CAPACITY = 3;       // package slots on foot
export const BOARD_SIZE = 6;
export const GRACE = 60;         // game minutes a late job can still be delivered before it fails

const r5 = (v) => Math.round(v / 5) * 5;
const r10 = (v) => Math.round(v / 10) * 10;
const STREET_FALLBACK = { 'tk-rn': 'Ura-kita-dori', 'tk-rs': 'Ura-minami-dori', 'tk-w': 'Nishi-dori', meiji: 'Meiji-dori', kabuki: 'Kabukicho Ichiban-gai', 'tk-e': 'Higashi-dori' };
// Street a Shinjuku shop faces: the nearest road whose span covers it.
const streetOf = (roads, s) => {
  if (s.kind === 'yokocho') return 'Omoide Yokocho';
  let best = null, bd = Infinity;
  for (const r of roads || []) {
    const along = r.axis === 'x' ? s.x : s.z, d = Math.abs((r.axis === 'x' ? s.z : s.x) - r.c);
    if (r.a != null && (along < r.a - 4 || along > r.b + 4)) continue;
    if (d < bd) { bd = d; best = r; }
  }
  return best ? (best.name || STREET_FALLBACK[best.id] || 'Shinjuku back street') : 'Shinjuku';
};
const man = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function prng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export class Jobs {
  constructor({ world, clock, career }) {
    this.clock = clock; this.career = career;
    this.places = new Map();
    this.lotIds = [];
    const d = world.depot;
    this.places.set('depot', { ref: 'depot', kind: 'depot', name: 'Hinode Delivery', short: 'the depot', jp: '日の出配送', addr: 'Asahi-dōri', x: d.counter[0], z: d.counter[1] });
    for (const l of world.lots) {
      const res = RESIDENTS[l.id];
      this.places.set(`lot:${l.id}`, {
        ref: `lot:${l.id}`, kind: l.kind, id: l.id,
        name: res ? res.name : `${l.family} household`, short: res ? res.short : `${l.family}-san`,
        jp: res ? res.jp : l.jp, addr: l.addr + (l.kind === 'apartment' ? ', Rm 101' : ''), x: l.door[0], z: l.door[1],
      });
      this.lotIds.push(l.id);
    }
    for (const p of world.postboxes) {
      this.places.set(`post:${p.id}`, { ref: `post:${p.id}`, kind: 'postbox', name: p.name, short: 'the postbox', jp: '郵便ポスト', addr: p.name, x: p.stand[0], z: p.stand[1] });
    }
    this.shopIds = [];
    const tk = world.tokyo;
    if (tk && tk.shops) tk.shops.forEach((s, i) => {
      if (s.kind === 'shutter') return;
      const L = SHOP_LABEL[s.kind] || SHOP_LABEL.shop, word = s.word || '';
      this.places.set(`shop:${i}`, {
        ref: `shop:${i}`, kind: 'shop', shop: s.kind, id: i,
        name: PLAIN_SHOPS.includes(s.kind) || !word ? L.en : `${L.en} ${word}`,
        short: s.kind === 'konbini' ? 'Hinode Mart' : `the ${L.en.toLowerCase()}`,
        jp: word || L.jp, addr: `${streetOf(tk.roads, s)}, Shinjuku`, x: s.x, z: s.z,
      });
      this.shopIds.push(i);
    });
    const missing = [];
    for (const a of AUTHORED) for (const ref of [a.from, a.to]) if (!this.places.has(ref)) missing.push(`${a.id} -> ${ref}`);
    if (missing.length) throw new Error('Delivery data points at places that do not exist: ' + missing.join(', '));

    this.jobs = new Map();
    this.completed = new Set();   // authored job ids
    this.flags = new Set();
    this.log = [];                // journal entries, newest first
    this.trackedId = null;
    this.listeners = [];
    this.startDay();
  }

  on(fn) { this.listeners.push(fn); }
  emit(type, data) { for (const f of this.listeners) f(type, data); }
  place(ref) { return this.places.get(ref); }
  get(id) { return this.jobs.get(id); }

  // ---- board ----
  startDay() {
    for (const [id, j] of this.jobs) if (!j.authored && j.state === 'available') this.jobs.delete(id);
    this.pool = this.generate(this.clock.day);
    this.today = { day: this.clock.day, delivered: 0, failed: 0, earned: 0, xp: 0, trust: 0, quick: 0 };
    this.refresh();
  }

  refresh() {
    for (const a of AUTHORED) {
      if (this.completed.has(a.id) || this.jobs.has(a.id)) continue;
      if (a.requires.every((q) => this.completed.has(q))) this.jobs.set(a.id, this.fresh({ ...a, authored: true }));
    }
    // Daily work shows up once the first story delivery is done, topping the board up to BOARD_SIZE.
    if (!this.completed.has('first-round')) return;
    let open = this.board().length;
    while (open < BOARD_SIZE && this.pool.length) { const j = this.pool.shift(); this.jobs.set(j.id, j); open++; }
  }

  fresh(j) {
    j.state = 'available'; j.condition = 1; j.late = false;
    j.acceptedAt = null; j.deadline = null; j.collectedAt = null;
    j.dist = Math.round(man(this.place(j.from), this.place(j.to)));
    return j;
  }

  board() {
    return [...this.jobs.values()].filter((j) => j.state === 'available')
      .sort((a, b) => (b.authored - a.authored) || (a.dist - b.dist));
  }
  active() {
    return [...this.jobs.values()].filter((j) => j.state === 'accepted' || j.state === 'carried')
      .sort((a, b) => a.deadline - b.deadline);
  }
  carried() { return this.active().filter((j) => j.state === 'carried'); }
  slotsUsed() { return this.active().reduce((s, j) => s + PKG[j.kind].slots, 0); }
  speedMul() { return this.carried().some((j) => j.kind === 'heavy') ? PKG.heavy.speed : 1; }

  canAccept(id) {
    const j = this.jobs.get(id);
    if (!j || j.state !== 'available') return { ok: false, reason: 'Taken' };
    if (this.clock.min > DAY_END - 20) return { ok: false, reason: 'Depot closing' };
    const used = this.slotsUsed(), need = PKG[j.kind].slots;
    if (used + need > CAPACITY) return { ok: false, reason: `Hands full ${used}/${CAPACITY}` };
    return { ok: true };
  }

  accept(id) {
    const c = this.canAccept(id);
    if (!c.ok) { this.emit('refused', { id, reason: c.reason }); return c; }
    const j = this.jobs.get(id), now = this.clock.min;
    j.state = 'accepted'; j.acceptedAt = now; j.deadline = now + j.limit; j.late = false; j.condition = 1;
    if (!this.active().some((q) => q.id === this.trackedId)) this.trackedId = j.id;
    this.emit('accepted', { job: j });
    return { ok: true };
  }

  // Cancelling before pickup is free; dropping a job you are already carrying costs a little trust.
  cancel(id) {
    const j = this.jobs.get(id);
    if (!j || (j.state !== 'accepted' && j.state !== 'carried')) return false;
    const carried = j.state === 'carried';
    if (carried) { this.career.addTrust(-1); this.today.trust -= 1; }
    if (j.authored) this.fresh(j); else this.jobs.delete(id);
    if (this.trackedId === id) this.trackedId = null;
    this.emit('cancelled', { job: j, carried });
    this.refresh();
    return true;
  }

  track(id) { if (this.active().some((j) => j.id === id)) { this.trackedId = id; return true; } return false; }

  // ---- in the world ----
  // What pressing E would do at a place. null = nothing to do here.
  promptAt(ref) {
    const act = this.active();
    const drop = act.filter((j) => j.state === 'carried' && j.to === ref);
    const pick = act.filter((j) => j.state === 'accepted' && j.from === ref);
    const p = this.place(ref);
    if (drop.length) return { verb: 'Deliver', text: drop.length > 1 ? `Deliver ${drop.length} packages` : `Deliver · ${drop[0].item}`, sub: `to ${p.short}`, act: () => this.deliverAt(ref) };
    if (pick.length) return { verb: 'Collect', text: pick.length > 1 ? `Collect ${pick.length} packages` : `Collect · ${pick[0].item}`, sub: ref === 'depot' ? 'from the counter' : `from ${p.short}`, act: () => this.collectAt(ref) };
    return null;
  }

  collectAt(ref) {
    const got = this.active().filter((j) => j.state === 'accepted' && j.from === ref);
    for (const j of got) { j.state = 'carried'; j.collectedAt = this.clock.min; }
    if (got.length) this.emit('collected', { jobs: got, place: this.place(ref) });
    return got;
  }

  deliverAt(ref) {
    const out = [];
    for (const j of this.active().filter((q) => q.state === 'carried' && q.to === ref)) { const e = this.complete(j); if (e) out.push(e); }
    return out;
  }

  complete(j) {
    if (!j || j.state !== 'carried') return null;   // guards double rewards
    const now = this.clock.min, to = this.place(j.to);
    j.state = 'delivered';
    const quick = !j.late && now - j.acceptedAt <= j.limit * 0.5;
    const care = j.kind === 'fragile' ? 0.3 + 0.7 * j.condition : 1;
    const pay = r10(j.reward * (j.late ? 0.6 : 1) * care * (quick ? 1.2 : 1));
    const xp = Math.round(j.xp * (j.late ? 0.5 : 1) * (quick ? 1.25 : 1));
    const trust = j.late ? -1 : (j.trust || 1);
    this.career.addMoney(pay);
    const levelUps = this.career.addXP(xp);
    this.career.addTrust(trust);
    this.career.stats.delivered++; if (quick) this.career.stats.quick++;
    Object.assign(this.today, { delivered: this.today.delivered + 1, earned: this.today.earned + pay, xp: this.today.xp + xp, trust: this.today.trust + trust, quick: this.today.quick + (quick ? 1 : 0) });
    if (j.authored) { this.completed.add(j.id); if (j.flag) this.flags.add(j.flag); }
    const line = j.line || this.lineFor(j, to);
    const entry = { id: j.id, title: j.title, item: j.item, kind: j.kind, to: to.name, pay, xp, trust, quick, late: j.late, condition: j.condition, day: this.clock.day, time: now, line, ok: true, story: !!j.authored };
    this.log.unshift(entry);
    if (!j.authored) this.jobs.delete(j.id);
    if (this.trackedId === j.id) this.trackedId = null;
    this.refresh();
    this.emit('delivered', { ...entry, job: j, levelUps });
    return entry;
  }

  lineFor(j, to) {
    const set = to.kind === 'depot' ? LINES.depot : to.kind === 'postbox' ? LINES.postbox : LINES[j.kind] || LINES.parcel;
    return set[hash(j.id) % set.length];
  }

  // Bumps and hard landings while carrying fragile goods. strength ~ impact speed in m/s.
  impact(strength) {
    if (strength < 3) return;
    const loss = Math.min(0.35, 0.08 + 0.03 * (strength - 3));
    for (const j of this.carried()) {
      if (j.kind !== 'fragile' || j.condition <= 0) continue;
      j.condition = Math.max(0, j.condition - loss);
      this.emit('damaged', { job: j, condition: j.condition });
    }
  }

  update() {
    const now = this.clock.min;
    for (const j of this.active()) {
      if (!j.late && now > j.deadline) { j.late = true; this.emit('late', { job: j }); }
      if (j.late && now > j.deadline + GRACE) this.fail(j, 'expired');
    }
  }

  fail(j, why) {
    if (!j || (j.state !== 'accepted' && j.state !== 'carried')) return;
    const pen = why === 'closed' ? -1 : -3;
    this.career.addTrust(pen); this.career.stats.failed++;
    this.today.failed++; this.today.trust += pen;
    this.log.unshift({ id: j.id, title: j.title, item: j.item, kind: j.kind, to: this.place(j.to).name, pay: 0, xp: 0, trust: pen, day: this.clock.day, time: this.clock.min, ok: false, why, story: !!j.authored });
    // Story jobs come back to the board; daily jobs are gone.
    if (j.authored) this.fresh(j); else this.jobs.delete(j.id);
    if (this.trackedId === j.id) this.trackedId = null;
    this.emit('failed', { job: j, why });
  }

  // Called at closing time. Unfinished daily jobs fail; story jobs quietly return to the board.
  endDay() {
    for (const j of this.active()) {
      if (j.authored) { this.fresh(j); continue; }
      this.fail(j, 'closed');
    }
    this.trackedId = null;
    return { ...this.today, money: this.career.money, level: this.career.level, trustNow: this.career.trust };
  }

  nextDay() {
    this.clock.day++; this.clock.min = DAY_START;
    this.startDay();
  }

  // Where the player should go next for the tracked job (or the board when idle).
  tracked() {
    const act = this.active();
    const j = act.find((q) => q.id === this.trackedId) || act[0];
    if (!j) return null;
    this.trackedId = j.id;
    return this.targetOf(j);
  }
  targetOf(j) {
    const ref = j.state === 'accepted' ? j.from : j.to, p = this.place(ref);
    return { job: j, ref, x: p.x, z: p.z, verb: j.state === 'accepted' ? 'Collect' : 'Deliver', place: p };
  }
  targets() { return this.active().map((j) => this.targetOf(j)); }

  // ---- daily jobs ----
  generate(day) {
    const R = prng(9001 + day * 7919), pick = (a) => a[Math.floor(R() * a.length)];
    const depot = this.place('depot'), posts = [...this.places.values()].filter((p) => p.kind === 'postbox');
    const out = [];
    for (let n = 0; n < 12; n++) {
      const roll = R();
      let type, from, to;
      if (roll < 0.55) { type = 'parcel'; from = 'depot'; to = `lot:${pick(this.lotIds)}`; }
      else if (roll < 0.7) { type = 'return'; from = `lot:${pick(this.lotIds)}`; to = 'depot'; }
      else if (roll < 0.88) { type = 'neighbour'; from = `lot:${pick(this.lotIds)}`; do to = `lot:${pick(this.lotIds)}`; while (to === from); }
      else {
        type = 'post'; from = `lot:${pick(this.lotIds)}`;
        const f = this.place(from);
        to = posts.reduce((b, p) => (man(p, f) < man(b, f) ? p : b)).ref;
      }
      const t = pick(ITEMS[type]), K = PKG[t.kind];
      const f = this.place(from), d = this.place(to);
      const dist = man(f, d), lead = from === 'depot' ? 0 : man(depot, f) * 0.5;
      let limit = r5(Math.min(90, Math.max(25, (dist + lead) / 3 + 22)));
      if (t.kind === 'food') limit = Math.max(20, r5(limit * 0.75));
      const title = type === 'parcel' ? t.item : type === 'return' ? 'Return to Sender' : type === 'neighbour' ? 'Neighbour Favour' : 'To the Postbox';
      out.push(this.fresh({
        id: `d${day}-${n}`, authored: false, title, item: t.item, kind: t.kind, from, to, note: t.note,
        sender: from === 'depot' ? pick(SENDERS) : f.name,
        reward: Math.max(200, r10(220 + (dist + lead) * 4.5 + K.bonus)),
        xp: Math.round(18 + (dist + lead) / 7 + K.xp), trust: 1, limit,
      }));
    }
    // Shinjuku work: supplies for shops, takeout back to town, and hops between shops.
    // Separate RNG so the town's daily jobs are unchanged; spliced in so the board shows some.
    if (this.shopIds.length) {
      const T = prng(4243 + day * 104729), tp = (a) => a[Math.floor(T() * a.length)];
      const shopRef = (ok) => { const ids = this.shopIds.filter((i) => !ok || ok(this.place(`shop:${i}`))); return `shop:${tp(ids.length ? ids : this.shopIds)}`; };
      const eats = (p) => FOOD_SHOPS.includes(p.shop);
      for (let n = 0; n < 5; n++) {
        const roll = T();
        let type, from, to;
        if (roll < 0.4) { type = 'city'; from = 'depot'; to = shopRef(); }
        else if (roll < 0.75) { type = 'takeout'; from = shopRef(eats); to = `lot:${tp(this.lotIds)}`; }
        else { type = 'cityHop'; from = shopRef(); do to = shopRef(); while (to === from); }
        const t = tp(ITEMS[type]), K = PKG[t.kind];
        const f = this.place(from), d = this.place(to);
        const dist = man(f, d), lead = from === 'depot' ? 0 : man(depot, f) * 0.5;
        let limit = r5(Math.min(90, Math.max(30, (dist + lead) / 3 + 22)));
        if (t.kind === 'food') limit = Math.max(25, r5(limit * 0.75));
        const title = type === 'city' ? t.item : type === 'takeout' ? 'Takeout Run' : 'Across Shinjuku';
        out.splice(Math.min(out.length, 1 + n * 3), 0, this.fresh({
          id: `t${day}-${n}`, authored: false, city: true, title, item: t.item, kind: t.kind, from, to, note: t.note,
          sender: from === 'depot' ? tp(SENDERS) : f.name,
          reward: Math.max(300, r10(260 + (dist + lead) * 4.5 + K.bonus)),
          xp: Math.round(22 + (dist + lead) / 7 + K.xp), trust: 1, limit,
        }));
      }
    }
    return out;
  }
}
