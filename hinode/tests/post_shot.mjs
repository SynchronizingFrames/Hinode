// Diagnostic: confirms HDR post-processing is active, then the same view with post on vs off.
// -> /data/hinode_shots/post_on.png, post_off.png
import { createRequire } from 'module';
import { spawn } from 'child_process';
const require = createRequire('/vercel/sandbox/index.js');
const { chromium } = require('playwright');
const PORT = 8128, OUT = process.env.SHOTS || '/data/hinode_shots';
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: '/tmp/ghp', stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  await sleep(600);
  const browser = await chromium.launch({ executablePath: '/usr/local/bin/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/hinode/?test=1`);
  await page.waitForFunction(() => window.__HINODE__ && window.__HINODE__.state.frames > 5, null, { timeout: 90000 });
  const info = await page.evaluate(() => { const r = window.__HINODE__.r; return { postOK: r.postOK, samples: r.samples, levels: r.bloom.length, sizes: r.bloom.map((b) => b.w + 'x' + b.h).join(' ') }; });
  console.log('INFO', JSON.stringify(info));
  // Hide every DOM overlay (HUD, toasts) so the shots compare the 3D render only.
  await page.evaluate(() => document.querySelectorAll('body *').forEach((e) => { if (e.tagName !== 'CANVAS' && !e.querySelector('canvas')) e.style.visibility = 'hidden'; }));
  await page.evaluate(() => { const W = window.__HINODE__; W.player.teleport(10, 0, 1.6, -Math.PI / 2); W.cam.yaw = Math.PI / 2; W.cam.pitch = 0.32; W.cam.distWant = 6.5; W.sim(1); });
  await sleep(2500); await page.screenshot({ path: `${OUT}/post_on.png` });
  // Count bad pixels (NaN / Inf / negative) in the HDR scene buffer.
  const bad = await page.evaluate(() => {
    const r = window.__HINODE__.r, gl = r.gl; if (!r.sceneFbo) return 'no scene buffer';
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, r.sceneFbo);
    const px = new Float32Array(r.pw * r.ph * 4); gl.readPixels(0, 0, r.pw, r.ph, gl.RGBA, gl.FLOAT, px);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    let nan = 0, inf = 0, neg = 0, max = 0;
    for (let i = 0; i < px.length; i++) { const v = px[i]; if (v !== v) nan++; else if (!isFinite(v)) inf++; else { if (v < 0) neg++; if (v > max) max = v; } }
    return { nan, inf, neg, max: +max.toFixed(2) };
  });
  console.log('HDR', JSON.stringify(bad));
  await page.evaluate(() => { window.__HINODE__.r.postOn = false; });
  await sleep(2500); await page.screenshot({ path: `${OUT}/post_off.png` });
  await page.evaluate(() => { const W = window.__HINODE__; W.r.postOn = true; W.env.bloom = 0; });
  await sleep(2500); await page.screenshot({ path: `${OUT}/bloom_off.png` });
  await page.evaluate(() => { delete window.__HINODE__.env.bloom; });
  console.log('LOGS', logs.length ? logs.slice(0, 6).join(' | ') : 'none');
  await browser.close(); server.kill();
})().catch((e) => { console.error(e); server.kill(); process.exit(1); });
