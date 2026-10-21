// Menu + settings (wip10): title cinematic moves and cuts between shots, settings tabs, graphics quality
// presets, FOV, first-person on foot and in the cockpit, V toggle, settings persist. Saves screenshots.
import { createRequire } from 'module';
import { spawn } from 'child_process';
const require = createRequire('/vercel/sandbox/index.js');
const { chromium } = require('playwright');
const PORT = 8135, OUT = '/data/hinode_shots';
const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: '/tmp/ghp', stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, name, info = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + info : ''}`); };
(async () => {
  await sleep(600);
  const br = await chromium.launch({ executablePath: '/usr/local/bin/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const pg = await br.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  pg.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  pg.on('pageerror', (e) => errs.push(String(e)));
  await pg.goto(`http://127.0.0.1:${PORT}/hinode/?test=1&title=1`);
  await pg.waitForFunction(() => window.__HINODE__ && window.__HINODE__.state.frames > 3, null, { timeout: 120000 });
  const E = (fn, a) => pg.evaluate(fn, a);
  const frames = async (n = 2) => { const f0 = await E(() => window.__HINODE__.state.frames); await pg.waitForFunction((f) => window.__HINODE__.state.frames > f, f0 + n, { timeout: 90000 }); };
  await E(() => { window.__HINODE__.state.paused = true; });

  // 1. Title cinematic
  const t0 = await E(() => { const W = window.__HINODE__; return { mode: W.ui.mode, active: W.cine.active, cap: document.querySelector('.m-cap').textContent, petals: document.querySelectorAll('.m-petals i').length, p: [...W.cam.pos] }; });
  ok(t0.mode === 'title' && t0.active, 'title starts the cinematic', JSON.stringify(t0.mode));
  ok(t0.cap.length > 5 && t0.petals > 10, 'caption and petals present', `${t0.cap} / ${t0.petals}`);
  const mv = await E(() => { const W = window.__HINODE__; const a = [...W.cam.pos]; W.sim(2); const b = [...W.cam.pos]; return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); });
  ok(mv > 1, 'camera dollies during a shot', mv.toFixed(2) + ' m');
  const cut = await E(() => { const W = window.__HINODE__; const i0 = W.cine.i; W.sim(W.cine.shot.len - W.cine.t + 0.5); return { i0, i1: W.cine.i, min: W.cine.min, cap: document.querySelector('.m-cap').textContent }; });
  ok(cut.i1 === (cut.i0 + 1) % 6 && cut.min > 500, 'cuts to the next shot with its own time of day', JSON.stringify(cut));
  const st = await E(() => { const W = window.__HINODE__; W.cine.i = 4; W.cine.t = 0; W.cine.enter(W.weather); W.sim(0.2); return W.weather.label || String(W.weather.rain); });
  ok(!!st, 'storm shot forces weather', st);
  await E(() => { const W = window.__HINODE__; W.cine.i = 0; W.cine.t = 4; W.cine.enter(W.weather); W.cine.t = 4; W.sim(1 / 60); });
  await frames(2);
  await pg.screenshot({ path: `${OUT}/menu_title.png` });
  await E(() => { const W = window.__HINODE__; W.cine.i = 3; W.cine.t = 5; W.cine.enter(W.weather); W.cine.t = 5; W.sim(1 / 60); });
  await frames(2);
  await pg.screenshot({ path: `${OUT}/menu_title2.png` });

  // 2. Settings tabs + graphics quality
  await pg.click('.menu [data-act=settings]');
  ok(await pg.isVisible('.menu.m-settings') && (await pg.$$('.m-tab')).length === 3, 'settings opens with 3 tabs');
  ok(await pg.isVisible('.m-form input[data-set=sens]') && await pg.isVisible('.m-form input[data-set=fpv]'), 'controls tab has sensitivity + first-person');
  await pg.click('.m-tab[data-tab=graphics]');
  ok((await pg.$$('.m-q')).length === 4, 'graphics tab shows 4 quality presets');
  await pg.click('.m-q[data-q=ultra]');
  await frames(2);
  const qu = await E(() => { const W = window.__HINODE__, c = W.r.canvas || document.getElementById('view'); return { q: W.r.quality, s: W.r.scale, lod: W.r.lodDist, draw: W.r.drawDist, ratio: c.width / c.clientWidth, set: W.settings.quality, stored: localStorage.getItem('hinode.settings') }; });
  ok(qu.q === 'ultra' && qu.s === 1.5 && qu.lod === 70 && qu.draw === 320 && qu.set === 'ultra', 'Ultra preset applies', JSON.stringify({ q: qu.q, s: qu.s, lod: qu.lod, draw: qu.draw }));
  ok(Math.abs(qu.ratio - 1.5) < 0.05, 'Ultra renders at 150% resolution', qu.ratio.toFixed(3));
  ok(/"quality":"ultra"/.test(qu.stored || ''), 'quality saved to settings');
  ok(await pg.isVisible('.m-q.ultra.on') && /supersampled/.test(await pg.textContent('.m-qdesc')), 'Ultra button highlighted with description');
  await pg.screenshot({ path: `${OUT}/menu_settings.png` });
  await pg.click('.m-q[data-q=low]'); await frames(1);
  const ql = await E(() => { const W = window.__HINODE__, c = document.getElementById('view'); return { q: W.r.quality, post: W.r.postOn, ratio: c.width / c.clientWidth }; });
  ok(ql.q === 'low' && ql.post === false && Math.abs(ql.ratio - 0.7) < 0.05, 'Low preset: no post, 70% resolution', JSON.stringify(ql));
  await pg.click('.m-q[data-q=high]'); await frames(1);
  await pg.$eval('.m-form input[data-set=fov]', (e) => { e.value = '90'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  const fov = await E(() => window.__HINODE__.cam.fov * 180 / Math.PI);
  ok(Math.abs(fov - 90) < 0.01 && /90°/.test(await pg.textContent('.m-form output')), 'FOV slider applies', fov.toFixed(1));
  await pg.$eval('.m-form input[data-set=fov]', (e) => { e.value = '65'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await pg.click('.m-tab[data-tab=controls]');
  await pg.click('.m-form input[data-set=fpv]');
  ok(await E(() => window.__HINODE__.cam.fpv === true && window.__HINODE__.settings.fpv === true), 'first-person checkbox applies');
  await pg.click('.menu [data-act=back]');
  ok(await pg.isVisible('.menu.m-title'), 'back returns to title');

  // 3. First person in play
  await pg.click('.menu [data-act=new]');
  const fp = await E(() => { const W = window.__HINODE__; W.state.paused = true; W.sim(0.6); const p = W.player.pos, c = W.cam.pos; return { mode: W.ui.mode, cine: W.cine.active, dist: W.cam.distNow, dy: c[1] - p[1], dxz: Math.hypot(c[0] - p[0], c[2] - p[2]) }; });
  ok(fp.mode === 'play' && !fp.cine, 'new game stops the cinematic', JSON.stringify(fp.mode));
  ok(fp.dist === 0 && Math.abs(fp.dy - 1.62) < 0.15 && fp.dxz < 0.35, 'first person puts the camera at eye height', JSON.stringify(fp));
  for (const el of await pg.$$('body > *:not(#view)')) await el.evaluate((n) => { n.dataset.v = n.style.visibility; n.style.visibility = 'hidden'; });
  await E(() => { const W = window.__HINODE__; W.clock.min = 10 * 60; W.weather.force('clear'); W.weather.settle(); W.sim(1 / 60); });
  await frames(2);
  await pg.screenshot({ path: `${OUT}/fpv_foot.png` });
  const ck = await E(() => { const W = window.__HINODE__, car = W.car; for (let i = 0; i < 40; i++) W.cam.update(1 / 60, W.input, car.camTarget, W.world.collision, car);
    return { d: Math.hypot(W.cam.pos[0] - car.x, W.cam.pos[2] - car.z), y: W.cam.pos[1] }; });
  ok(ck.d < 1.2 && ck.y > 0.8 && ck.y < 1.6, 'cockpit camera sits inside the car', JSON.stringify(ck));
  await frames(2);
  await pg.screenshot({ path: `${OUT}/fpv_car.png` });
  for (const el of await pg.$$('body > *:not(#view)')) await el.evaluate((n) => { n.style.visibility = n.dataset.v || ''; });
  await pg.focus('#view');
  await pg.keyboard.down('KeyV'); await E(() => window.__HINODE__.sim(1 / 60)); await pg.keyboard.up('KeyV');
  const tp = await E(() => { const W = window.__HINODE__; W.sim(0.8); return { fpv: W.cam.fpv, set: W.settings.fpv, dist: W.cam.distNow }; });
  ok(!tp.fpv && !tp.set && tp.dist > 1, 'V switches back to third person', JSON.stringify(tp));
  ok(errs.length === 0, 'no console errors', errs.slice(0, 3).join(' | '));
  console.log(`\n${pass}/${pass + fail} passed`);
  await br.close(); srv.kill();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('FAIL  test run  --', e.message); console.log(`\n${pass}/${pass + fail + 1} passed`); srv.kill(); process.exit(1); });
