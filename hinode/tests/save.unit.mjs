// Unit tests for save / load (no browser). Run: node tests/save.unit.mjs
import { Jobs } from '../js/game/jobs.js';
import { Clock, Career } from '../js/game/career.js';
import { SaveStore, snapshot, apply, KEYS, VERSION } from '../js/game/save.js';

let pass = 0, fail = 0;
const ok = (name, cond, info = '') => { if (cond) { pass++; console.log('PASS ', name); } else { fail++; console.log('FAIL ', name, info ? ' -- ' + info : ''); } };

function fakeWorld() {
  const ids = ['1201', '1110', '3111', '0101', '2302', '0310', '3201', '0000', '0001', '2200', '3300', '1300'];
  const lots = ids.map((id, n) => ({ id, kind: id === '1110' || id === '3201' ? 'apartment' : 'house', family: 'Tanaka', jp: '田中', addr: `Aoshima ${n + 1}-1`, door: [-60 + n * 11, (n % 2 ? 1 : -1) * 20] }));
  return { depot: { counter: [10.4, -14.6] }, lots, postboxes: [{ id: 'P1', name: 'Minato-dōri postbox', stand: [-1.75, 10.5] }, { id: 'P2', name: 'Lane-east postbox', stand: [40.75, 36] }] };
}
class FakePlayer { constructor() { this.pos = [8.8, 0, -4.6]; this.yaw = 0; } teleport(x, y, z, yaw = this.yaw) { this.pos = [x, y, z]; this.yaw = yaw; } }
class MemStorage { constructor() { this.m = new Map(); } getItem(k) { return this.m.has(k) ? this.m.get(k) : null; } setItem(k, v) { this.m.set(k, String(v)); } removeItem(k) { this.m.delete(k); } }
const game = (world = fakeWorld()) => { const clock = new Clock(), career = new Career(); return { clock, career, jobs: new Jobs({ world, clock, career }), player: new FakePlayer() }; };

// Play part of a day
const A = game();
A.jobs.accept('first-round'); A.jobs.collectAt('depot'); A.jobs.deliverAt('lot:1201');
A.jobs.accept('darkroom'); A.jobs.collectAt('depot'); A.jobs.impact(8);
const daily = A.jobs.board().find((j) => !j.authored);
A.jobs.accept(daily.id);
A.clock.min = 615.5; A.player.teleport(-20.25, 0, 14.5, 1.25);
const store = new MemStorage(), S = new SaveStore(store);
ok('nothing saved yet reads as none', S.load().status === 'none');
ok('save writes', S.save(snapshot(A)));

const B = game();
const L = S.load();
ok('load reads ok', L.status === 'ok' && L.data.v === VERSION, L.status);
apply(L.data, B);
const dk = B.jobs.get('darkroom'), dA = A.jobs.get('darkroom');
ok('money, xp, level, trust, stats restored', B.career.money === A.career.money && B.career.xp === A.career.xp && B.career.level === A.career.level && B.career.trust === A.career.trust && B.career.stats.delivered === 1, JSON.stringify(B.career));
ok('clock restored', B.clock.day === 1 && B.clock.min === 615.5);
ok('story progress restored', B.jobs.completed.has('first-round') && !B.jobs.completed.has('darkroom'));
ok('carried fragile job keeps state, damage and deadline', dk && dk.state === 'carried' && dk.condition === dA.condition && dk.condition < 1 && dk.deadline === dA.deadline);
ok('accepted daily job restored with its pay', B.jobs.get(daily.id) && B.jobs.get(daily.id).state === 'accepted' && B.jobs.get(daily.id).reward === daily.reward);
ok('board is identical', B.jobs.board().map((j) => j.id).join() === A.jobs.board().map((j) => j.id).join(), B.jobs.board().map((j) => j.id).join());
ok('journal log restored', B.jobs.log.length === A.jobs.log.length && B.jobs.log[0].title === A.jobs.log[0].title);
ok('tracked job restored', B.jobs.trackedId === A.jobs.trackedId);
ok('player position and facing restored', Math.abs(B.player.pos[0] + 20.25) < 1e-3 && Math.abs(B.player.pos[2] - 14.5) < 1e-3 && B.player.yaw === 1.25);
const m0 = B.career.money; B.jobs.deliverAt('lot:1110');
ok('a restored job can still be delivered and pays', B.career.money > m0 && B.jobs.completed.has('darkroom'));

// Story text comes from the data file, not the save
const snap = snapshot(A);
ok('story jobs store state only, not text', snap.jobs.list.filter((j) => j.authored).every((j) => j.title === undefined));

// Recovery
S.save(snapshot(B));                                   // second save: first becomes the backup
ok('previous save kept as backup', store.getItem(KEYS.backup) !== null);
store.setItem(KEYS.main, '{"v":1,"clock":{"day":');
let R = S.load();
ok('corrupt save falls back to the backup', R.status === 'recovered' && R.data.career.money === A.career.money, R.status + ' ' + R.why);
ok('the damaged file is kept aside', store.getItem(KEYS.broken) === '{"v":1,"clock":{"day":');
ok('recovered backup is written back as the main save', S.load().status === 'ok');
store.removeItem(KEYS.backup); store.setItem(KEYS.main, 'garbage');
R = S.load();
ok('corrupt save with no backup reports corrupt', R.status === 'corrupt' && !!R.why);
const newer = snapshot(A); newer.v = VERSION + 1; store.setItem(KEYS.main, JSON.stringify(newer));
R = S.load();
ok('a save from a newer version is not loaded', R.status === 'corrupt' && /newer/.test(R.why), R.why);
const neg = snapshot(A); neg.career.money = -50; store.setItem(KEYS.main, JSON.stringify(neg));
ok('tampered money is rejected', S.load().status !== 'ok');

// Robustness
const odd = snapshot(A);
odd.jobs.list.push({ id: 'old-story-job', authored: true, state: 'available' });
odd.jobs.list.push({ ...odd.jobs.list.find((j) => !j.authored), id: 'ghost', to: 'lot:9999' });
odd.jobs.completed.push('removed-story');
const C = game(); apply(odd, C);
ok('unknown story jobs and missing addresses are dropped', !C.jobs.get('old-story-job') && !C.jobs.get('ghost') && !C.jobs.completed.has('removed-story'));
const full = new SaveStore({ getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem() {} });
let threw = false, res; try { res = full.save(snapshot(A)); } catch { threw = true; }
ok('full storage fails quietly', !threw && res === false);
ok('no storage at all reads as none', new SaveStore(null).load().status === 'none' && new SaveStore(null).save({}) === false);

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
