// NPC test: residents spawn clear of walls, prompt appears, a full conversation works, trust goes up.
import { createRequire } from 'module';
import { spawn } from 'child_process';
const require = createRequire('/vercel/sandbox/index.js');
const { chromium } = require('playwright');
const PORT = 8130, OUT = '/data/hinode_shots';
const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: '/tmp/ghp', stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, name, info = '') => { if (c) pass++; else fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + info : ''}`); };
(async () => {
  await sleep(600);
  const br = await chromium.launch({ executablePath: '/usr/local/bin/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const pg = await br.newPage({ viewport: { width: 960, height: 540 } });
  const errs = [];
  pg.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  pg.on('pageerror', (e) => errs.push(String(e)));
  await pg.goto(`http://127.0.0.1:${PORT}/hinode/?test=1`);
  await pg.waitForFunction(() => window.__HINODE__ && window.__HINODE__.state.frames > 5, null, { timeout: 90000 });
  await pg.evaluate(() => { const W = window.__HINODE__; if (W.ui.mode !== 'play') W.ui.setMode('play'); localStorage.removeItem('hinode.npc'); W.npcs.state = { met: {}, last: {} }; W.clock.min = 16 * 60; });
  const info = await pg.evaluate(() => { const W = window.__HINODE__, t = { x: 0, z: 0 }; return W.npcs.list.map((n) => { W.world.collision.resolve([n.x, 0, n.z], 0.3, 0, 1.6, t); return { id: n.c.id, x: +n.x.toFixed(2), z: +n.z.toFixed(2), stuck: Math.hypot(t.x - n.x, t.z - n.z) > 0.01 }; }); });
  console.log('NPCS', JSON.stringify(info));
  ok(info.length === 8, 'all 8 residents spawned', String(info.length));
  ok(info.every((n) => !n.stuck), 'nobody inside a wall', info.filter((n) => n.stuck).map((n) => n.id).join(',') || 'clear');
  // Walk up to Chiyo.
  await pg.evaluate(() => { const W = window.__HINODE__, n = W.npcs.list.find((q) => q.c.id === 'chiyo'); const yaw = Math.atan2(-1, 0); W.player.teleport(n.x + 1.3, 0, n.z, yaw); W.cam.yaw = yaw + Math.PI; W.cam.pitch = 0.12; W.cam.distWant = 3.4; W.sim(1.2); });
  await sleep(1800);
  const pr = await pg.evaluate(() => { const c = window.__HINODE__.interact.current; return c ? c.verb + ' | ' + c.text : null; });
  ok(pr && pr.startsWith('Talk'), 'talk prompt shows', pr);
  const trust0 = await pg.evaluate(() => window.__HINODE__.career.trust);
  await pg.evaluate(() => window.__HINODE__.interact.current.act());
  await sleep(1500);
  ok(await pg.evaluate(() => window.__HINODE__.ui.mode === 'talk'), 'conversation opens');
  await pg.keyboard.press('e'); await sleep(800);
  // Wait for the typewriter to finish and the replies to appear (frames are slower with Tokyo loaded).
  let first = { line: '', opts: 0 }, plen = -1;
  for (let i = 0; i < 40; i++) {
    first = await pg.evaluate(() => ({ line: document.querySelector('.talk .line').textContent, opts: document.querySelectorAll('.talk .opts button').length }));
    if (first.opts > 0 && first.line.length === plen) break;
    plen = first.line.length; await sleep(400);
  }
  ok(first.line.includes('Chiyo'), 'first meeting line', first.line.slice(0, 60));
  ok(first.opts === 4, 'four replies offered', String(first.opts));
  await pg.screenshot({ path: `${OUT}/npc_talk.png` });
  await pg.keyboard.press('1'); await sleep(1500); await pg.keyboard.press('e'); await sleep(1500);
  // typewriter text: wait until it stops growing (slow SwiftShader frames)
  let chat = '', prev = -1;
  for (let i = 0; i < 30; i++) {
    chat = await pg.evaluate(() => document.querySelector('.talk .line').textContent);
    if (chat.length > 10 && chat.length === prev) break;
    prev = chat.length; await sleep(400);
  }
  ok(chat.length > 10 && !chat.includes("I'm Chiyo"), 'reply 1 gives small talk', chat.slice(0, 60));
  ok((await pg.evaluate(() => window.__HINODE__.career.trust)) === trust0 + 1, 'trust +1 for first chat today');
  await pg.keyboard.press('Escape'); await sleep(1500);
  ok(await pg.evaluate(() => window.__HINODE__.ui.mode === 'play'), 'Esc returns to play');
  // Night: Sora goes home, Officer Endō is out.
  const night = await pg.evaluate(() => { const W = window.__HINODE__; W.clock.min = 21 * 60; W.npcs.update(0.016, W.player, W.clock); return W.npcs.list.filter((n) => n.out).map((n) => n.c.id).join(','); });
  ok(!night.includes('sora') && night.includes('endo'), 'schedules follow the clock', night);
  await pg.evaluate(() => { window.__HINODE__.clock.min = 16 * 60; });
  await sleep(1500);
  await pg.screenshot({ path: `${OUT}/npc_street.png` });
  ok(errs.length === 0, 'no console errors', errs.slice(0, 3).join(' | '));
  console.log(`${pass}/${pass + fail} passed`);
  await br.close(); srv.kill();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); srv.kill(); process.exit(1); });
