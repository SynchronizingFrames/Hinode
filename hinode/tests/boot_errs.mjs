// Debug helper: load the game and print every console error / page error during boot.
import { createRequire } from 'module';
import { spawn } from 'child_process';
const require = createRequire('/vercel/sandbox/index.js');
const { chromium } = require('playwright');
const PORT = 8139;
const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: '/tmp/ghp', stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  await sleep(600);
  const br = await chromium.launch({ executablePath: '/usr/local/bin/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const pg = await br.newPage({ viewport: { width: 960, height: 540 } });
  pg.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('CONSOLE', m.type(), m.text()); });
  pg.on('pageerror', (e) => console.log('PAGEERROR', e.stack || String(e)));
  pg.on('requestfailed', (q) => console.log('REQFAIL', q.url()));
  await pg.goto(`http://127.0.0.1:${PORT}/hinode/?test=1`);
  await sleep(25000);
  console.log('HOOK', await pg.evaluate(() => !!window.__HINODE__), 'FRAMES', await pg.evaluate(() => window.__HINODE__ ? window.__HINODE__.state.frames : -1));
  await br.close(); srv.kill();
})().catch((e) => { console.error(e); srv.kill(); process.exit(1); });
