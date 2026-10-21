// M3 save / menu check in real Chromium: title, new game, autosave, pause, settings persist,
// quit to title, continue restores the game, damaged save falls back to the backup.
// Run: node tests/save.mjs   (from the repo root)
import { createRequire } from 'module';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import url from 'url';

const require = createRequire('/vercel/sandbox/index.js');
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const SERVE = '/tmp/ghp', PORT = 8125;
fs.mkdirSync(SERVE, { recursive: true });
if (!fs.existsSync(path.join(SERVE, 'hinode'))) fs.symlinkSync(ROOT, path.join(SERVE, 'hinode'));

const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: SERVE, stdio: 'ignore' });
const results = [];
const ok = (name, pass, info = '') => { results.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + info : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const URL_T = `http://127.0.0.1:${PORT}/hinode/?test=1&title=1`;

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
  const press = async (key) => { await page.keyboard.press(key); await sim(0.05); };
  const mode = () => H(() => window.__HINODE__.ui.mode);
  const ready = async () => {
    await page.waitForFunction(() => window.__HINODE__ && window.__HINODE__.state.frames > 8, null, { timeout: 90000 });
    await H(() => { window.__HINODE__.state.paused = true; });
  };
  const raw = () => H(() => localStorage.getItem('hinode.save'));

  // 1. Fresh title screen
  await page.goto(URL_T); await ready();
  ok('boots to the title screen', (await mode()) === 'title' && await page.isVisible('.menu.m-title'));
  ok('no Continue without a save', (await page.$$('.menu [data-act=continue]')).length === 0);
  ok('HUD hidden on title', !(await page.isVisible('.h-money')));
  const rects = await H(() => [...document.querySelectorAll('.menu .m-sign')].map((e) => { const r = e.getBoundingClientRect(); return [r.top, r.bottom, r.left, r.right]; }));
  const fits = rects.length >= 3 && rects.every((r, i) => r[1] <= 720 && r[3] <= 1280 && r[2] >= 0 && (i === 0 || r[0] >= rects[i - 1][1]));
  ok('menu signs fit and do not overlap', fits, JSON.stringify(rects.map((r) => r.map(Math.round))));

  // 2. New game
  await page.click('.menu [data-act=new]'); await sim(0.1);
  ok('New game starts play', (await mode()) === 'play' && !(await page.isVisible('.menu')));
  ok('New game writes a save', !!(await raw()));

  // 3. Accept a job through the board, autosave follows
  await H(() => window.__HINODE__.ui.setMode('board'));
  await page.click('.board .slip:not(.blocked) [data-accept]');
  await press('Escape');
  const jid = await H(() => window.__HINODE__.jobs.active()[0]?.id);
  await sim(2);
  const s1 = JSON.parse((await raw()) || '{}');
  const saved = (s1.jobs?.list || []).find((j) => j.id === jid);
  ok('autosave after accepting', !!jid && saved && saved.state === 'accepted', `${jid} -> ${saved && saved.state}`);

  // 4. Change state and save by hand
  const want = await H(() => {
    const W = window.__HINODE__;
    W.career.addMoney(777); W.clock.min = 520; W.player.teleport(20, 0.3, -10, 1.2); W.sim(0.3);
    W.save();
    return { money: W.career.money, min: W.clock.min, x: W.player.pos[0], z: W.player.pos[2] };
  });

  // 5. Pause and settings
  await press('Escape');
  ok('Esc opens the pause menu', (await mode()) === 'pause' && await page.isVisible('.menu.m-pause'));
  await page.click('.menu [data-act=settings]');
  await page.$eval('.m-form input[data-set=sens]', (e) => { e.value = '1.8'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.click('.m-form input[data-set=invertY]');
  const cs = await H(() => ({ sens: window.__HINODE__.cam.sens, inv: window.__HINODE__.cam.invertY }));
  ok('settings apply at once', cs.sens === 1.8 && cs.inv === true, JSON.stringify(cs));
  await page.click('.menu [data-act=back]');
  ok('Back returns to pause', await page.isVisible('.menu.m-pause'));
  await press('Escape');
  ok('Esc resumes', (await mode()) === 'play');

  // 6. Quit to title (two clicks), page reloads to the title
  await press('KeyP');
  await page.click('.menu [data-act=quit]');
  ok('Quit asks first', (await mode()) === 'pause' && (await page.textContent('.menu [data-act=quit]')).includes('again'));
  await Promise.all([page.waitForEvent('load'), page.$eval('.menu [data-act=quit]', (el) => el.click())]);
  await ready();
  const cont = await page.$('.menu [data-act=continue]');
  const ctext = cont ? await cont.textContent() : '';
  ok('title shows Continue with save info', !!cont && ctext.includes('Day 1') && ctext.includes('¥'), ctext);
  const ps = await H(() => ({ sens: window.__HINODE__.cam.sens, inv: window.__HINODE__.cam.invertY }));
  ok('settings survive a reload', ps.sens === 1.8 && ps.inv === true, JSON.stringify(ps));

  // 7. Continue restores everything
  await page.click('.menu [data-act=continue]'); await sim(0.05);
  const got = await H((jid) => { const W = window.__HINODE__; return { mode: W.ui.mode, money: W.career.money, min: W.clock.min, x: W.player.pos[0], z: W.player.pos[2], job: W.jobs.get(jid)?.state }; }, jid);
  ok('Continue enters play', got.mode === 'play');
  ok('money restored', got.money === want.money, `${got.money} vs ${want.money}`);
  ok('clock restored', Math.abs(got.min - want.min) < 2, `${got.min} vs ${want.min}`);
  ok('position restored', Math.hypot(got.x - want.x, got.z - want.z) < 0.5, `${got.x.toFixed(2)},${got.z.toFixed(2)}`);
  ok('accepted job restored', got.job === 'accepted', String(got.job));

  // 8. Damaged save falls back to the backup
  await H(() => { window.__HINODE__.ui.setMode('title'); localStorage.setItem('hinode.save', '{oops'); });
  await page.goto(URL_T); await ready();
  const note = await page.textContent('.menu .m-note');
  ok('damaged save is reported', /damaged/.test(note), note);
  ok('backup offered as Continue', (await page.$$('.menu [data-act=continue]')).length === 1);
  await page.click('.menu [data-act=continue]'); await sim(0.05);
  ok('backup loads the game', (await H(() => window.__HINODE__.career.money)) === want.money);

  ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  ok('no missing files', missing.length === 0, missing.slice(0, 3).join(' | '));
  await browser.close();
}

main().catch((e) => ok('test run', false, e.message)).finally(() => {
  server.kill();
  const pass = results.filter((r) => r.pass).length;
  console.log(`\n${pass}/${results.length} passed`);
  process.exit(pass === results.length ? 0 : 1);
});
