// Save / load: one slot in localStorage plus a rolling backup, a version number and corrupt-save recovery.
// No DOM apart from the storage object, so node tests can pass a fake storage.
import { AUTHORED } from '../data/jobs.js';
import { DAY_START, DAY_END } from './career.js';

export const VERSION = 1;
export const KEYS = { main: 'hinode.save', backup: 'hinode.save.backup', broken: 'hinode.save.broken' };
const LIVE = ['state', 'condition', 'late', 'acceptedAt', 'deadline', 'collectedAt', 'dist'];
const DEFS = new Map(AUTHORED.map((a) => [a.id, a]));
const num = (v) => typeof v === 'number' && Number.isFinite(v);

// Story jobs only store their live state; their text always comes from the current data file,
// so fixing a typo in a story job never leaves old text stuck in somebody's save.
export function snapshot({ clock, career, jobs, player, extra }) {
  const list = [];
  for (const j of jobs.jobs.values()) {
    if (j.authored) { const o = { id: j.id, authored: true }; for (const k of LIVE) o[k] = j[k]; list.push(o); }
    else list.push({ ...j });
  }
  return {
    v: VERSION, savedAt: Date.now(),
    clock: { day: clock.day, min: clock.min },
    career: { money: career.money, xp: career.xp, level: career.level, trust: career.trust, stats: { ...career.stats } },
    jobs: { list, completed: [...jobs.completed], flags: [...jobs.flags], log: jobs.log.slice(0, 80), trackedId: jobs.trackedId, pool: jobs.pool.map((j) => ({ ...j })), today: { ...jobs.today } },
    player: { pos: player.pos.map((v) => Math.round(v * 1000) / 1000), yaw: Math.round(player.yaw * 1e4) / 1e4 },
    extra: extra || {},
  };
}

// Throws a readable reason when the data can't be trusted.
export function check(d) {
  if (!d || typeof d !== 'object') throw new Error('not a save file');
  if (!num(d.v)) throw new Error('no version number');
  if (d.v > VERSION) throw new Error('made by a newer version of the game');
  if (!d.clock || !Number.isInteger(d.clock.day) || d.clock.day < 1 || !num(d.clock.min)) throw new Error('clock is damaged');
  const c = d.career;
  if (!c || !num(c.money) || c.money < 0 || !num(c.xp) || c.xp < 0 || !Number.isInteger(c.level) || c.level < 1 || !num(c.trust)) throw new Error('career is damaged');
  const J = d.jobs;
  if (!J || !Array.isArray(J.list) || !Array.isArray(J.completed) || !Array.isArray(J.log) || !Array.isArray(J.pool)) throw new Error('job list is damaged');
  const p = d.player;
  if (!p || !Array.isArray(p.pos) || p.pos.length !== 3 || !p.pos.every(num) || !num(p.yaw)) throw new Error('position is damaged');
  return d;
}

// Older saves get upgraded here one version at a time (none yet).
export function migrate(d) { return d; }

export function apply(d, { clock, career, jobs, player }) {
  clock.day = d.clock.day;
  clock.min = Math.min(DAY_END - 1, Math.max(DAY_START, d.clock.min));
  career.money = d.career.money; career.xp = d.career.xp; career.level = d.career.level;
  career.trust = Math.max(0, Math.min(100, d.career.trust));
  career.stats = { ...career.stats, ...(d.career.stats || {}) };

  const valid = (j) => j && typeof j.id === 'string' && jobs.place(j.from) && jobs.place(j.to) && num(j.reward);
  jobs.jobs = new Map();
  for (const s of d.jobs.list) {
    let j;
    if (s && s.authored) {
      const def = DEFS.get(s.id); if (!def) continue;
      j = jobs.fresh({ ...def, authored: true });
      for (const k of LIVE) if (s[k] !== undefined) j[k] = s[k];
    } else { if (!valid(s)) continue; j = { ...s }; }
    if (!['available', 'accepted', 'carried'].includes(j.state)) continue;
    jobs.jobs.set(j.id, j);
  }
  jobs.completed = new Set(d.jobs.completed.filter((id) => DEFS.has(id)));
  jobs.flags = new Set(Array.isArray(d.jobs.flags) ? d.jobs.flags : []);
  jobs.log = d.jobs.log.filter((e) => e && typeof e.title === 'string');
  jobs.pool = d.jobs.pool.filter(valid);
  jobs.today = { day: clock.day, delivered: 0, failed: 0, earned: 0, xp: 0, trust: 0, quick: 0, ...(d.jobs.today || {}) };
  jobs.trackedId = jobs.jobs.has(d.jobs.trackedId) ? d.jobs.trackedId : null;
  // No refresh here: the board must come back exactly as it was. New story jobs from a newer
  // data file appear at the next normal refresh (next delivery, cancel or morning).
  const [x, y, z] = d.player.pos;
  player.teleport(x, Math.max(0, y) + 0.05, z, d.player.yaw);
  return d.extra || {};
}

export const describe = (d) => ({ day: d.clock.day, time: d.clock.min, money: d.career.money, level: d.career.level, savedAt: d.savedAt || 0 });

export class SaveStore {
  constructor(storage) { this.s = storage || null; }
  get available() { return !!this.s; }
  raw(k) { try { return this.s ? this.s.getItem(k) : null; } catch { return null; } }
  parse(txt) { if (txt == null) return null; return migrate(check(JSON.parse(txt))); }

  // -> { status: 'none' | 'ok' | 'recovered' | 'corrupt', data?, why? }
  load() {
    const main = this.raw(KEYS.main);
    if (main == null) return { status: 'none' };
    try { return { status: 'ok', data: this.parse(main) }; }
    catch (e) {
      try { this.s.setItem(KEYS.broken, main); } catch { /* storage full: nothing else to do */ }
      let back = null;
      try { back = this.parse(this.raw(KEYS.backup)); } catch { back = null; }
      if (back) { try { this.s.setItem(KEYS.main, JSON.stringify(back)); } catch { /* keep going with the in-memory copy */ } return { status: 'recovered', data: back, why: e.message }; }
      return { status: 'corrupt', why: e.message };
    }
  }

  // The previous good save becomes the backup before it is overwritten.
  save(data) {
    if (!this.s) return false;
    try {
      const prev = this.s.getItem(KEYS.main);
      if (prev) { try { check(JSON.parse(prev)); this.s.setItem(KEYS.backup, prev); } catch { /* never back up a broken save */ } }
      this.s.setItem(KEYS.main, JSON.stringify(data));
      return true;
    } catch { return false; }
  }

  clear() { for (const k of [KEYS.main, KEYS.backup]) { try { this.s && this.s.removeItem(k); } catch { /* ignore */ } } }
}

// localStorage can be missing or throw (private windows, blocked cookies). Returns null then.
export function browserStorage() {
  try { const s = window.localStorage, k = '__hinode_probe'; s.setItem(k, '1'); s.removeItem(k); return s; } catch { return null; }
}
