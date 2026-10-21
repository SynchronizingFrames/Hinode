// Diagnostic: same street view with shadows on vs off -> /data/hinode_shots/sh_on.png, sh_off.png
import { createRequire } from 'module';
import { spawn } from 'child_process';
const require = createRequire('/vercel/sandbox/index.js');
const { chromium } = require('playwright');
const PORT = 8127, OUT = process.env.SHOTS || '/data/hinode_shots';
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: '/tmp/ghp', stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  await sleep(600);
  const browser = await chromium.launch({ executablePath: '/usr/local/bin/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  await page.goto(`http://127.0.0.1:${PORT}/hinode/?test=1`);
  await page.waitForFunction(() => window.__HINODE__ && window.__HINODE__.state.frames > 5, null, { timeout: 90000 });
  await page.evaluate(() => { const W = window.__HINODE__; W.player.teleport(10, 0, 1.6, -Math.PI / 2); W.cam.yaw = Math.PI / 2; W.cam.pitch = 0.32; W.cam.distWant = 6.5; W.sim(1); });
  await sleep(2500); await page.screenshot({ path: `${OUT}/sh_on.png` });
  await page.evaluate(() => { window.__HINODE__.r.shadowOK = false; });
  await sleep(2500); await page.screenshot({ path: `${OUT}/sh_off.png` });
  await browser.close(); server.kill();
})().catch((e) => { console.error(e); server.kill(); process.exit(1); });
