// Diagnostic: frame rate with shadows on vs off on the software GPU. Run: node tests/perf_probe.mjs
import { createRequire } from 'module';
import { spawn } from 'child_process';
const require = createRequire('/vercel/sandbox/index.js');
const { chromium } = require('playwright');
const PORT = 8126;
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: '/tmp/ghp', stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  await sleep(600);
  const browser = await chromium.launch({ executablePath: '/usr/local/bin/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
  await page.goto(`http://127.0.0.1:${PORT}/${process.env.HS_BASE || "hinode"}/?test=1`);
  await page.waitForFunction(() => window.__HINODE__ && window.__HINODE__.state.frames > 5, null, { timeout: 90000 });
  const info = await page.evaluate(() => {
    const r = window.__HINODE__.r, gl = r.gl, d = gl.getExtension('WEBGL_debug_renderer_info');
    return { soft: r.soft, shadowOK: r.shadowOK, rend: d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), w: r.canvas.width, h: r.canvas.height };
  });
  console.log('INFO', JSON.stringify(info));
  const measure = async (label) => {
    const f0 = await page.evaluate(() => window.__HINODE__.state.frames); await sleep(5000);
    const f1 = await page.evaluate(() => window.__HINODE__.state.frames);
    console.log(label, ((f1 - f0) / 5).toFixed(2), 'fps');
  };
  await measure('shadows ON ');
  await page.evaluate(() => { window.__HINODE__.r.shadowOK = false; });
  await measure('shadows OFF');
  await browser.close(); server.kill();
})().catch((e) => { console.error(e); server.kill(); process.exit(1); });
