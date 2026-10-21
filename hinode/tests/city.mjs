// Shinjuku gameplay (wip13a): shops are delivery places, city jobs reach the board,
// a full collect -> deliver round trip works at a shop, and the Tokyo traffic loops run.
import { createRequire } from 'module';
import { spawn } from 'child_process';
const require = createRequire('/vercel/sandbox/index.js');
const { chromium } = require('playwright');
const PORT = 8137, OUT = '/data/hinode_shots';
const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: '/tmp/ghp', stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, name, info = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + info : ''}`); };
(async () => {
  await sleep(600);
  const br = await chromium.launch({ executablePath: '/usr/local/bin/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const pg = await br.newPage({ viewport: { width: 960, height: 540 } });
  const errs = [];
  pg.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  pg.on('pageerror', (e) => errs.push(String(e)));
  await pg.goto(`http://127.0.0.1:${PORT}/hinode/?test=1`);
  await pg.waitForFunction(() => window.__HINODE__ && window.__HINODE__.state.frames > 5, null, { timeout: 150000 });
  const E = (fn, a) => pg.evaluate(fn, a);

  const pl = await E(() => {
    const W = window.__HINODE__;
    if (W.ui.mode !== 'play') W.ui.setMode('play');
    const shops = [...W.jobs.places.values()].filter((p) => p.kind === 'shop');
    const spots = W.interact.spots.filter((s) => s.ref && s.ref.startsWith('shop:')).length;
    const badAddr = shops.filter((p) => !/Shinjuku$/.test(p.addr) || /undefined|null/.test(p.addr + p.name + p.short)).length;
    const streets = [...new Set(shops.map((p) => p.addr))];
    return { n: shops.length, spots, badAddr, streets, sample: shops.slice(0, 3).map((p) => `${p.jp} | ${p.name} | ${p.addr}`) };
  });
  console.log('SHOPS ' + JSON.stringify(pl));
  ok(pl.n > 100 && pl.spots === pl.n, 'every open shop is a delivery place with a door spot', `${pl.n} places, ${pl.spots} spots`);
  ok(pl.badAddr === 0 && pl.streets.length >= 6, 'shop addresses are real street names', `${pl.streets.length} streets`);

  const bd = await E(() => {
    const W = window.__HINODE__, J = W.jobs;
    J.completed.add('first-round'); J.refresh();
    const board = J.board();
    const pool = J.generate(J.clock.day);
    const city = pool.filter((j) => j.city);
    return { board: board.map((j) => `${j.id}:${j.from}->${j.to}`), cityOnBoard: board.filter((j) => j.city).length,
      types: [...new Set(city.map((j) => j.title))], minLimit: Math.min(...city.map((j) => j.limit)), minReward: Math.min(...city.map((j) => j.reward)),
      town: pool.filter((j) => !j.city).length, ids: pool.map((j) => j.id).join(',') };
  });
  console.log('BOARD ' + JSON.stringify(bd));
  ok(bd.cityOnBoard >= 1, 'Shinjuku jobs show up on the delivery board', String(bd.cityOnBoard));
  ok(bd.town === 12, 'town daily jobs unchanged (12 per day)', String(bd.town));
  ok(bd.minLimit >= 25 && bd.minReward >= 300, 'city jobs have sane limits and pay more', `limit>=${bd.minLimit} reward>=${bd.minReward}`);

  // Full round trip on a shop job: accept, collect, deliver.
  const rt = await E(() => {
    const W = window.__HINODE__, J = W.jobs, I = W.interact;
    let j = J.board().find((q) => q.city && q.to.startsWith('shop:')) || J.board().find((q) => q.city);
    if (!j) { const p = J.generate(J.clock.day).find((q) => q.city && q.to.startsWith('shop:')); J.jobs.set(p.id, p); j = p; }
    const acc = J.accept(j.id);
    const fp = J.place(j.from), tp = J.place(j.to);
    W.player.teleport(fp.x, 0, fp.z, 0);
    const c = I.probe(fp.x, fp.z), cv = c && c.verb;
    if (c && c.act) c.act();
    const st1 = J.get(j.id).state;
    W.player.teleport(tp.x, 0, tp.z, 0);
    const d = I.probe(tp.x, tp.z), dv = d && d.verb, dt = d && (d.text + ' / ' + d.sub);
    if (d && d.act) d.act();
    const jj = J.get(j.id);
    return { id: j.id, from: j.from, to: j.to, acc: !!acc, cv, st1, dv, dt, st2: jj ? jj.state : 'gone', delivered: J.today.delivered, to_name: tp.name };
  });
  console.log('TRIP ' + JSON.stringify(rt));
  ok(rt.cv === 'Collect' && rt.st1 === 'carried', 'collect the package at the pickup', `${rt.cv} -> ${rt.st1}`);
  ok(rt.dv === 'Deliver' && rt.delivered === 1, 'deliver it at the Shinjuku shop door', `${rt.dt} -> ${rt.st2}, delivered ${rt.delivered}`);
  await sleep(1500);
  await E(() => { const W = window.__HINODE__; if (W.ui.mode !== 'play') W.ui.setMode('play'); });

  // Tokyo traffic: seven cars that drive their loops and stay in lane.
  const tr = await E(() => {
    const W = window.__HINODE__, T = W.traffic.bots.filter((b) => b.x > 100);
    W.player.teleport(-60, 0, -60, 0);
    const b0 = T.map((b) => [b.x, b.z]);
    let off = 0;
    const seg = (px, pz, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / (dx * dx + dz * dz))); return Math.hypot(px - a[0] - dx * t, pz - a[1] - dz * t); };
    for (let s = 0; s < 60; s++) {
      W.sim(0.5);
      for (const b of T) { let d = 1e9; for (let i = 0; i < b.path.length; i++) d = Math.min(d, seg(b.x, b.z, b.path[i], b.path[(i + 1) % b.path.length])); off = Math.max(off, d); }
    }
    return { n: T.length, moved: T.map((b, i) => Math.round(Math.hypot(b.x - b0[i][0], b.z - b0[i][1]))), off: +off.toFixed(2), inside: T.every((b) => b.x > 100 && b.x < 268 && Math.abs(b.z) < 104) };
  });
  console.log('TRAFFIC ' + JSON.stringify(tr));
  ok(tr.n === 7, 'seven cars drive Shinjuku', String(tr.n));
  ok(tr.moved.every((m) => m > 25), 'every Tokyo car keeps moving', tr.moved.join(','));
  ok(tr.off < 4.5 && tr.inside, 'Tokyo cars stay on their roads', `max off-lane ${tr.off} m`);

  // Night shot on Yasukuni-dori with the taxis about.
  const f0 = await E(() => {
    const W = window.__HINODE__;
    W.clock.min = 21 * 60 + 40; W.state.paused = true;
    for (const el of document.body.children) if (el.id !== 'view') el.style.visibility = 'hidden';
    const b = W.traffic.bots.find((q) => q.path[0][0] > 100 && Math.abs(q.z) < 6) || W.traffic.bots.find((q) => q.x > 100);
    const yaw = b.yaw;
    W.cam.pos[0] = b.x - Math.sin(yaw) * 14 + Math.cos(yaw) * 3; W.cam.pos[1] = 2.2; W.cam.pos[2] = b.z - Math.cos(yaw) * 14 - Math.sin(yaw) * 3;
    W.cam.target[0] = b.x + Math.sin(yaw) * 10; W.cam.target[1] = 1.4; W.cam.target[2] = b.z + Math.cos(yaw) * 10;
    return W.state.frames;
  });
  await pg.waitForFunction((f) => window.__HINODE__.state.frames > f + 2, f0, { timeout: 150000 });
  await pg.screenshot({ path: `${OUT}/city_taxi.png` });
  ok(errs.length === 0, 'no console errors', errs.slice(0, 3).join(' | '));
  console.log(`\n${pass}/${pass + fail} passed`);
  await br.close(); srv.kill();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('FAIL  test run  --', e.message); console.log(`\n${pass}/${pass + fail + 1} passed`); srv.kill(); process.exit(1); });
