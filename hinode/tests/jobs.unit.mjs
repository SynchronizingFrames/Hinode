// Unit tests for the delivery logic (no browser). Run: node tests/jobs.unit.mjs
import { Jobs, CAPACITY, GRACE } from '../js/game/jobs.js';
import { Clock, Career, DAY_START } from '../js/game/career.js';

let pass = 0, fail = 0;
const ok = (name, cond, info = '') => { if (cond) { pass++; console.log('PASS ', name); } else { fail++; console.log('FAIL ', name, info ? ' -- ' + info : ''); } };

function fakeWorld() {
  const ids = ['1201', '1110', '3111', '0101', '2302', '0310', '3201', '0000', '0001', '2200', '3300', '1300'];
  const lots = ids.map((id, n) => ({ id, kind: id === '1110' || id === '3201' ? 'apartment' : 'house', family: 'Tanaka', jp: '田中', addr: `Aoshima ${n + 1}-1`, door: [-60 + n * 11, (n % 2 ? 1 : -1) * 20] }));
  return { depot: { counter: [10.4, -14.6] }, lots, postboxes: [{ id: 'P1', name: 'Minato-dōri postbox', stand: [-1.75, 10.5] }, { id: 'P2', name: 'Lane-east postbox', stand: [40.75, 36] }] };
}
function setup() {
  const clock = new Clock(), career = new Career();
  const jobs = new Jobs({ world: fakeWorld(), clock, career });
  const ev = []; jobs.on((t, d) => ev.push([t, d]));
  return { clock, career, jobs, ev };
}
const run = (jobs, id, from, to) => { jobs.accept(id); jobs.collectAt(from); return jobs.deliverAt(to); };

// Missing places are caught at boot
let threw = false;
try { const w = fakeWorld(); w.lots = w.lots.filter((l) => l.id !== '1201'); new Jobs({ world: w, clock: new Clock(), career: new Career() }); } catch (e) { threw = /1201/.test(e.message); }
ok('bad job data fails loudly at boot', threw);

{
  const { clock, career, jobs, ev } = setup();
  ok('day 1 board starts with only the tutorial job', jobs.board().length === 1 && jobs.board()[0].id === 'first-round', jobs.board().map((j) => j.id).join(','));
  ok('nothing to do at a door before accepting', jobs.promptAt('lot:1201') === null && jobs.promptAt('depot') === null);

  jobs.accept('first-round');
  const fr = jobs.get('first-round');
  ok('accept sets state + deadline', fr.state === 'accepted' && fr.deadline === DAY_START + 60);
  ok('cannot deliver before collecting', jobs.promptAt('lot:1201') === null && jobs.deliverAt('lot:1201').length === 0 && career.money === 0);
  const pc = jobs.promptAt('depot');
  ok('depot counter offers Collect', pc && pc.verb === 'Collect' && /Seed packets/.test(pc.text), pc && pc.text);
  ok('tracked target is the depot before pickup', jobs.tracked().ref === 'depot');
  pc.act();
  ok('collect -> carried', fr.state === 'carried' && jobs.tracked().ref === 'lot:1201');
  ok('wrong door does nothing', jobs.promptAt('lot:0000') === null && jobs.deliverAt('lot:0000').length === 0 && career.money === 0);
  clock.update(10);
  const pd = jobs.promptAt('lot:1201');
  ok('right door offers Deliver', pd && pd.verb === 'Deliver');
  const res = pd.act();
  ok('quick delivery pays reward x1.2', career.money === 720 && res[0].quick === true, `money ${career.money}`);
  ok('xp awarded (45 x 1.25 = 56)', career.xp === 56 && career.level === 1, `xp ${career.xp}`);
  ok('trust awarded', career.trust === 13, `trust ${career.trust}`);
  ok('second E pays nothing', jobs.deliverAt('lot:1201').length === 0 && career.money === 720);
  ok('journal logged the delivery with the thank-you line', jobs.log.length === 1 && /Chiyo/.test(jobs.log[0].line));
  ok('delivered event emitted', ev.some(([t]) => t === 'delivered'));
  const b = jobs.board();
  ok('story jobs unlock + daily jobs fill the board', b.length === 6 && b.some((j) => j.id === 'darkroom') && b.some((j) => j.id === 'post-run'), b.map((j) => j.id).join(','));
  ok('every board job points at real places', b.every((j) => jobs.place(j.from) && jobs.place(j.to) && j.reward >= 200 && j.limit >= 20));

  // Fragile damage
  jobs.accept('darkroom'); jobs.collectAt('depot');
  jobs.impact(2);
  ok('soft bump does not damage', jobs.get('darkroom').condition === 1);
  jobs.impact(6);
  const cond = jobs.get('darkroom').condition;
  ok('hard bump damages fragile goods', Math.abs(cond - 0.83) < 1e-9, `cond ${cond}`);
  clock.update(30);   // more than half the 50 min limit: no quick bonus
  const m0 = career.money;
  jobs.deliverAt('lot:1110');
  ok('damage reduces the fragile reward', career.money - m0 === 790, `paid ${career.money - m0}`);

  // Late delivery
  jobs.accept('post-run'); jobs.collectAt('lot:3111');
  clock.update(46);
  jobs.update();
  ok('late flagged after the deadline', jobs.get('post-run').late && ev.some(([t]) => t === 'late'));
  const m1 = career.money, t1 = career.trust;
  jobs.deliverAt('post:P1');
  ok('late delivery pays 60% and costs trust', career.money - m1 === 270 && career.trust === t1 - 1, `paid ${career.money - m1} trust ${career.trust - t1}`);

  // Capacity
  const daily = jobs.board().filter((j) => !j.authored);
  let taken = 0, refused = null;
  for (const j of daily) { const r = jobs.accept(j.id); if (r.ok) taken++; else { refused = r.reason; break; } }
  ok('capacity is enforced', jobs.slotsUsed() <= CAPACITY && refused && /Hands full/.test(refused), `used ${jobs.slotsUsed()} refused ${refused}`);

  // Cancel before pickup is free
  const first = jobs.active()[0], tr = career.trust;
  ok('cancel before pickup', jobs.cancel(first.id) && career.trust === tr && !jobs.active().includes(first));

  // Expiry fails daily jobs
  const a = jobs.active()[0];
  clock.update(a.limit + GRACE + 1);
  jobs.update();
  ok('expired daily job fails and leaves', !jobs.get(a.id) && jobs.log[0].ok === false && jobs.log[0].why === 'expired');

  // Heavy
  for (const j of jobs.active()) jobs.cancel(j.id);
  ok('rice unlocked by post-run', !!jobs.get('rice'));
  jobs.accept('rice'); jobs.collectAt('depot');
  ok('heavy load slows you down', jobs.speedMul() === 0.8 && jobs.slotsUsed() === 2);

  // Day end
  const sum = jobs.endDay();
  ok('day summary counts', sum.delivered === 3 && sum.failed >= 1 && sum.earned === career.money, JSON.stringify(sum));
  ok('story job returns to board at closing', jobs.get('rice').state === 'available' && jobs.active().length === 0);
  jobs.nextDay();
  ok('next day resets clock + new daily jobs', clock.day === 2 && clock.min === DAY_START && jobs.board().some((j) => j.id.startsWith('d2-')));
}

{
  const A = setup(), B = setup();
  const sig = (j) => j.pool.map((q) => q.id + q.item + q.to).join('|');
  ok('daily jobs are deterministic per day', sig(A.jobs) === sig(B.jobs));
  const c = new Career();
  const ups = c.addXP(250);
  ok('levels up across thresholds', c.level === 3 && ups.join() === '2,3' && c.xp === 250 - 100 - 140, `L${c.level} xp ${c.xp}`);
  ok('shop spend checks affordability', !c.spend(10) && (c.addMoney(50), c.spend(30)) && c.money === 20);
  const k = new Clock();
  ok('clock format + period', k.fmt() === '08:00' && k.period() === 'Morning' && k.fmt(21 * 60 + 5.7) === '21:05');
}

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
