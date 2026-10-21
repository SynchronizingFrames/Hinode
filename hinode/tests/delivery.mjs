// M2 delivery-loop check in real Chromium: board, accept, collect, deliver, rewards, journal,
// postbox, fragile damage, heavy slowdown, expiry, day end. Real key presses and clicks go through the game.
// Run: node tests/delivery.mjs   (from the repo root)
import { createRequire } from 'module';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import url from 'url';

const require = createRequire('/vercel/sandbox/index.js');
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const SERVE = '/tmp/ghp', PORT = 8124;
const SHOTS = process.env.SHOTS || '/data/hinode_shots';
fs.mkdirSync(SERVE, { recursive: true }); fs.mkdirSync(SHOTS, { recursive: true });
if (!fs.existsSync(path.join(SERVE, 'hinode'))) fs.symlinkSync(ROOT, path.join(SERVE, 'hinode'));

const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: SERVE, stdio: 'ignore' });
const results = [];
const ok = (name, pass, info = '') => { results.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + info : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await sleep(600);
  const browser = await chromium.launch({ executablePath: '/usr/local/bin/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [], missing = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('response', (r) => { if (r.status() >= 400) missing.push(r.status() + ' ' + r.url()); });
  const H = (fn, arg) => page.evaluate(fn, arg);
  const sim = (s) => H((s) => window.__HINODE__.sim(s), s);
  const hold = async (keys, secs) => { for (const k of keys) await page.keyboard.down(k); await sim(secs); for (const k of keys) await page.keyboard.up(k); };
  const press = async (key) => { await page.keyboard.press(key); await sim(0.05); };
  const until = async (fn, arg, ms = 20000) => { try { await page.waitForFunction(fn, arg, { timeout: ms }); return true; } catch { return false; } };
  const go = (p, yaw = null) => H(([x, z, yaw]) => { const W = window.__HINODE__; W.player.teleport(x, 0.3, z); if (yaw !== null) W.cam.yaw = yaw; W.sim(0.25); }, [p[0], p[1], yaw]);
  const cur = () => H(() => { const c = window.__HINODE__.interact.current; return c && { board: !!c.board, verb: c.verb || '', text: c.text || '', passive: !!c.passive }; });
  const mode = () => H(() => window.__HINODE__.ui.mode);
  const job = (id) => H((id) => { const j = window.__HINODE__.jobs.get(id); return j && { state: j.state, condition: j.condition, late: j.late }; }, id);
  const money = () => H(() => window.__HINODE__.career.money);

  await page.goto(`http://127.0.0.1:${PORT}/hinode/?test=1`);
  try { await page.waitForFunction(() => window.__HINODE__ && window.__HINODE__.state.frames > 8, null, { timeout: 90000 }); }
  catch (e) { ok('boots', false, (await H(() => document.getElementById('err-msg')?.textContent)) || e.message); throw e; }
  await H(() => { window.__HINODE__.state.paused = true; });
  ok('boots with the delivery game', true);

  const S = await H(() => {
    const w = window.__HINODE__.world, L = (id) => w.lots.find((l) => l.id === id).door;
    return { board: w.depot.board, counter: w.depot.counter, ishida: L('1201'), ota: L('3111'), p1: w.postboxes.find((p) => p.id === 'P1').stand,
      other: w.lots.find((l) => !['1201', '1110', '3111'].includes(l.id)).door, spawn: w.spawn };
  });
  let b = await H(() => window.__HINODE__.jobs.board().map((j) => j.id));
  ok('day 1 board starts with the first story job', b.length === 1 && b[0] === 'first-round', b.join());
  ok('waypoint points to the board before any job', await until(() => { const w = document.querySelector('.h-way'); return w && !w.hidden && w.textContent.includes('Delivery board'); }));

  // Board
  await go(S.board);
  let c = await cur();
  ok('standing at the board shows its prompt', c && c.board && await until(() => !document.querySelector('.h-prompt').hidden), JSON.stringify(c));
  await press('e');
  ok('E opens the board', (await mode()) === 'board' && await page.isVisible('.panel.board'));
  const m0 = await H(() => window.__HINODE__.clock.min); await sim(2);
  ok('time stops while the board is open', (await H(() => window.__HINODE__.clock.min)) === m0);
  ok('one slip with an Accept button', (await page.locator('.board .slip').count()) === 1 && (await page.locator('.board [data-accept="first-round"]').isEnabled()));
  await page.screenshot({ path: `${SHOTS}/m2_board_day1.png` });
  await page.click('.board [data-accept="first-round"]');
  ok('clicking Accept takes the job', (await job('first-round')).state === 'accepted');
  await press('Escape');
  ok('Esc closes the board', (await mode()) === 'play' && !(await page.isVisible('.panel.board')));
  ok('HUD lists the job', await until(() => [...document.querySelectorAll('.h-job')].some((e) => e.textContent.includes('First Round'))));

  // Wrong door, collect, deliver
  await go(S.other); await press('e');
  ok('a random door does nothing', (await job('first-round')).state === 'accepted' && (await money()) === 0);
  await go(S.counter); c = await cur();
  ok('depot counter offers Collect', c && c.verb === 'Collect' && c.text.includes('Seed packets'), JSON.stringify(c));
  await press('e');
  ok('E collects it and the rider carries it', (await job('first-round')).state === 'carried' && (await H(() => window.__HINODE__.player.carry.length)) === 1);
  await go(S.ishida); c = await cur();
  ok('Ishida-san door offers Deliver', c && c.verb === 'Deliver', JSON.stringify(c));
  await press('e');
  const st = await H(() => { const W = window.__HINODE__; return { money: W.career.money, xp: W.career.xp, log: W.jobs.log.length, pay: W.jobs.log[0] && W.jobs.log[0].pay, carry: W.player.carry.length }; });
  ok('delivery pays, gives XP and logs it', st.money > 0 && st.money === st.pay && st.xp > 0 && st.log === 1 && st.carry === 0, JSON.stringify(st));
  await press('e');
  ok('no double payment', (await money()) === st.money);
  ok('delivered toast appears', await until(() => [...document.querySelectorAll('.toast')].some((t) => t.textContent.includes('Delivered'))));
  ok('HUD money matches the wallet', await until(() => document.querySelector('.h-money').textContent === '\u00a5' + window.__HINODE__.career.money.toLocaleString('en-US')));
  await page.screenshot({ path: `${SHOTS}/m2_delivered.png` });
  b = await H(() => window.__HINODE__.jobs.board().map((j) => j.id));
  ok('board refills with story and daily jobs', b.length === 6 && b.includes('darkroom') && b.includes('post-run'), b.join());

  // Journal
  await press('Tab');
  const jt = await page.locator('.journal .jlog time').first().textContent();
  ok('Tab opens the journal with the delivery logged', (await mode()) === 'journal' && (await page.locator('.journal .jlog li').count()) === 1 && /^Day 1 · \d{2}:\d{2}$/.test(jt), jt);
  await page.screenshot({ path: `${SHOTS}/m2_journal.png` });
  await press('Tab');
  ok('Tab closes it again', (await mode()) === 'play');

  // Pickup from a resident, drop at a postbox
  await H(() => window.__HINODE__.jobs.accept('post-run'));
  await go(S.ota); await press('e');
  ok('collect letters from \u014cta-san', (await job('post-run')).state === 'carried');
  await go(S.p1); c = await cur();
  ok('postbox offers Deliver', c && c.verb === 'Deliver', JSON.stringify(c));
  await press('e');
  ok('letters posted', await H(() => window.__HINODE__.jobs.completed.has('post-run')));

  // Fragile: sprint into the depot counter/back wall
  await H(() => { const J = window.__HINODE__.jobs; J.accept('darkroom'); J.collectAt('depot'); });
  await go([8.83, -12.2], 0);
  await hold(['ShiftLeft', 'KeyW'], 1.2);
  const dk = await job('darkroom');
  ok('running into something damages fragile goods', dk.condition < 1, JSON.stringify(dk));
  await H(() => window.__HINODE__.jobs.deliverAt('lot:1110'));

  // Heavy: the rice sack slows the walk
  await H(() => { const J = window.__HINODE__.jobs; J.accept('rice'); J.collectAt('depot'); });
  await go([10, 1.6], Math.PI / 2);
  const p0 = await H(() => [...window.__HINODE__.player.pos]);
  await hold(['KeyW'], 1.5);
  const p1 = await H(() => [...window.__HINODE__.player.pos]);
  const walked = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]);
  ok('heavy rice slows you down', walked > 4.0 && walked < 5.4 && (await H(() => window.__HINODE__.player.speedMul)) === 0.8, `${walked.toFixed(2)} m in 1.5 s`);
  await H(() => window.__HINODE__.jobs.cancel('rice'));

  // Expiry through the real game clock
  const exp = await H(() => { const W = window.__HINODE__, j = W.jobs.board().find((x) => !x.authored); W.jobs.accept(j.id); W.clock.min += j.limit + 61; return j.id; });
  await sim(0.05);
  const lg = await H(() => window.__HINODE__.jobs.log[0]);
  ok('an expired job is lost and logged', !(await job(exp)) && lg.ok === false && lg.why === 'expired', JSON.stringify(lg));

  // Board layout at the busiest point
  await H(() => window.__HINODE__.ui.setMode('board'));
  const lay = await H(() => { const s = document.querySelector('.board .sheet').getBoundingClientRect(); return { n: document.querySelectorAll('.board .slip').length, top: s.top, bottom: s.bottom, left: s.left, right: s.right }; });
  ok('full board fits the screen', lay.n >= 5 && lay.top >= 0 && lay.bottom <= 720 && lay.left >= 0 && lay.right <= 1280, JSON.stringify(lay));
  await page.screenshot({ path: `${SHOTS}/m2_board_full.png` });
  await press('Escape');
  const ov = await H(() => { const r = (q) => document.querySelector(q).getBoundingClientRect(); const a = r('.h-card'), t = r('.h-toasts'), j = r('.h-jobs'); return { card: a.right, tl: t.left, tr: t.right, jobs: j.left }; });
  ok('HUD pieces do not overlap', ov.card < ov.tl && ov.tr < ov.jobs, JSON.stringify(ov));

  // Day end at 22:00
  await H(() => { window.__HINODE__.clock.min = 22 * 60 - 0.05; });
  await sim(0.2);
  ok('22:00 ends the day with a summary', (await mode()) === 'summary' && (await page.locator('.panel.summary').textContent()).includes('Day 1 complete'));
  await page.screenshot({ path: `${SHOTS}/m2_summary.png` });
  await page.click('.summary .primary');
  const d2 = await H(() => { const W = window.__HINODE__; return { mode: W.ui.mode, day: W.clock.day, min: W.clock.min, board: W.jobs.board().map((j) => j.id), pos: [...W.player.pos] }; });
  ok('Start Day 2 resets clock, board and position', d2.mode === 'play' && d2.day === 2 && d2.min === 480 && d2.board.some((id) => id.startsWith('d2-')) && Math.hypot(d2.pos[0] - S.spawn[0], d2.pos[2] - S.spawn[2]) < 0.5, JSON.stringify(d2));

  await sleep(1500);
  ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  ok('no missing files (404s)', missing.length === 0, missing.slice(0, 3).join(' | '));
  await browser.close();
}

main().catch((e) => { ok('test run', false, e.message); }).finally(() => {
  server.kill();
  const pass = results.filter((r) => r.pass).length;
  console.log(`\n${pass}/${results.length} passed`);
  process.exit(pass === results.length ? 0 : 1);
});
