// Showroom shots of the vehicles: front 3/4, side, rear 3/4, wheel close-up, lineup, night. Writes car_*.png + a montage.
import { createRequire } from 'module';
import { spawn, execSync } from 'child_process';
const require = createRequire('/vercel/sandbox/index.js');
const { chromium } = require('playwright');
const PORT = 8132, OUT = '/data/hinode_shots';
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
  await pg.waitForFunction(() => window.__HINODE__ && window.__HINODE__.state.frames > 5, null, { timeout: 120000 });
  const E = (fn, a) => pg.evaluate(fn, a);
  const X = -20, Z = -1.75;
  await E(([X, Z]) => {
    const W = window.__HINODE__;
    if (W.ui.mode !== 'play') W.ui.setMode('play');
    W.state.paused = true; W.clock.min = 10 * 60 + 20;
    for (const el of document.body.children) if (el.id !== 'view') el.style.visibility = 'hidden';
    const c = W.car; c.x = X; c.z = Z; c.yaw = Math.PI / 2; c.vx = c.vz = 0; c.steer = 0.18;
    W.player.teleport(X - 40, 0, Z - 30, 0);
    const spots = [[X - 6.6, Z], [X + 6.2, Z], [X + 12.2, Z], [X - 12.8, Z]];
    W.traffic.bots.forEach((b, i) => { const s = spots[i]; b.x = s[0]; b.z = s[1]; b.yaw = Math.PI / 2; b.v = 0; b.hold = 1e6; });
    window.__fov0 = W.cam.fov;
  }, [X, Z]);
  const shot = async (name, pos, tgt, fovK = 0.72, min = null) => {
    const f0 = await E(([pos, tgt, fovK, min]) => {
      const W = window.__HINODE__;
      if (min !== null) W.clock.min = min;
      W.cam.pos[0] = pos[0]; W.cam.pos[1] = pos[1]; W.cam.pos[2] = pos[2];
      W.cam.target[0] = tgt[0]; W.cam.target[1] = tgt[1]; W.cam.target[2] = tgt[2];
      W.cam.fov = window.__fov0 * fovK;
      return W.state.frames;
    }, [pos, tgt, fovK, min]);
    await pg.waitForFunction((f) => window.__HINODE__.state.frames > f + 3, f0, { timeout: 60000 });
    await pg.screenshot({ path: `${OUT}/car_${name}.png` });
    console.log('shot', name);
  };
  await shot('front', [X + 4.4, 1.25, Z + 3.4], [X + 0.2, 0.62, Z]);
  await shot('side', [X, 0.95, Z + 6.2], [X, 0.62, Z]);
  await shot('rear', [X - 4.6, 1.45, Z - 3.1], [X, 0.62, Z]);
  await shot('wheel', [X + 2.5, 0.55, Z + 2.1], [X + 1.35, 0.36, Z + 0.7], 0.6);
  await shot('lineup', [X - 1.5, 2.1, Z + 11.5], [X - 1.5, 0.7, Z], 0.9);
  await shot('night', [X + 4.4, 1.25, Z + 3.4], [X + 0.2, 0.62, Z], 0.72, 21 * 60);
  execSync(`cd ${OUT} && magick montage car_front.png car_side.png car_rear.png car_wheel.png car_lineup.png car_night.png -tile 3x2 -geometry 640x360+2+2 car_showroom.png`);
  console.log('errors:', errs.length ? errs.slice(0, 5).join(' | ') : 'none');
  await br.close(); srv.kill();
})().catch((e) => { console.error('FATAL', e); srv.kill(); process.exit(1); });
