// Diagnostic: same street at several times of day -> /data/hinode_shots/t_<hour>.png
import { createRequire } from 'module';
import { spawn } from 'child_process';
const require = createRequire('/vercel/sandbox/index.js');
const { chromium } = require('playwright');
const PORT = 8129, OUT = '/data/hinode_shots';
const HOURS = [9, 12, 17.5, 18.6, 19.2, 21];
const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: '/tmp/ghp', stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  await sleep(600);
  const br = await chromium.launch({ executablePath: '/usr/local/bin/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const pg = await br.newPage({ viewport: { width: 960, height: 540 } });
  const errs = [];
  pg.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  pg.on('pageerror', (e) => errs.push(String(e)));
  await pg.goto(`http://127.0.0.1:${PORT}/hinode/?test=1`);
  await pg.waitForFunction(() => window.__HINODE__ && window.__HINODE__.state.frames > 5, null, { timeout: 90000 });
  await pg.evaluate(() => document.querySelectorAll('body *').forEach((e) => { if (e.tagName !== 'CANVAS' && !e.querySelector('canvas')) e.style.visibility = 'hidden'; }));
  await pg.evaluate(() => { const W = window.__HINODE__; W.player.teleport(10, 0, 1.6, -Math.PI / 2); W.cam.yaw = Math.PI / 2; W.cam.pitch = 0.32; W.cam.distWant = 6.5; W.sim(1); });
  for (const h of HOURS) {
    await pg.evaluate((m) => { window.__HINODE__.clock.min = m; }, h * 60);
    await sleep(2200);
    const s = await pg.evaluate(() => { const W = window.__HINODE__, e = W.env; return { night: +e.night.toFixed(2), exp: +e.exposure.toFixed(2), sunY: +e.sunDir[1].toFixed(2), lamps: W.world.lamps.length, near: Array.from(e.lampBuf || []).filter((v, i) => i % 4 === 3 && v > 0).length }; });
    console.log('H' + h, JSON.stringify(s));
    await pg.screenshot({ path: `${OUT}/t_${String(h).replace('.', '_')}.png` });
  }
  console.log('ERRORS', errs.length ? errs.slice(0, 5).join(' | ') : 'none');
  await br.close(); srv.kill();
})().catch((e) => { console.error(e); srv.kill(); process.exit(1); });
