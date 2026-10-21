// Realism shots (wip11): same 5 views on any build. HS_BASE = folder under /tmp/ghp (default hinode),
// HS_TAG = file prefix (default new). Prints per-shot luminance stats + a texture-detail metric
// (mean local 3x3 std-dev, higher = more surface detail) so old vs new can be compared.
import { createRequire } from 'module';
import { spawn, execSync } from 'child_process';
const require = createRequire('/vercel/sandbox/index.js');
const { chromium } = require('playwright');
const PORT = 8134, OUT = '/data/hinode_shots';
const BASE = process.env.HS_BASE || 'hinode', TAG = process.env.HS_TAG || 'new';
const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: '/tmp/ghp', stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, name, info = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + info : ''}`); };
const stats = (f) => execSync(`magick ${f} -colorspace gray -format '%[fx:mean*255] %[fx:standard_deviation*255]' info:`).toString().trim().split(' ').map(Number);
const detail = (f) => Number(execSync(`magick ${f} -colorspace gray -statistic StandardDeviation 3x3 -format '%[fx:mean*255]' info:`).toString().trim());
const warm = (f) => Number(execSync(`magick ${f} -fx 'r>0.55&&r>b*1.35&&g>b*1.05' -colorspace gray -format '%[fx:mean*100]' info:`).toString().trim());
(async () => {
  await sleep(600);
  const br = await chromium.launch({ executablePath: '/usr/local/bin/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const pg = await br.newPage({ viewport: { width: 960, height: 540 } });
  const errs = [];
  pg.on('console', (m) => { if (m.type() === 'error' || /Shader|compile/i.test(m.text())) errs.push(m.text()); });
  pg.on('pageerror', (e) => errs.push(String(e)));
  await pg.goto(`http://127.0.0.1:${PORT}/${BASE}/?test=1`);
  await pg.waitForFunction(() => window.__HINODE__ && window.__HINODE__.state.frames > 5, null, { timeout: 120000 });
  const E = (fn, a) => pg.evaluate(fn, a);
  const info = await E(() => {
    const W = window.__HINODE__;
    if (W.ui.mode !== 'play') W.ui.setMode('play');
    W.state.paused = true;
    if (W.cam) W.cam.fpv = false;
    for (const el of document.body.children) if (el.id !== 'view') el.style.visibility = 'hidden';
    W.player.teleport(300, 0, 300, 0);
    if (W.traffic) W.traffic.bots.forEach((b, i) => { b.x = 300 + i * 10; b.z = 300; b.hold = 1e6; });
    const hs = W.world.lots.filter((h) => h.kind === "house" && h.door && h.gate);
    return { n: hs.length, h: [hs[2], hs[Math.floor(hs.length / 2)]].map((h) => ({ door: h.door, gate: h.gate })) };
  });
  ok(info.n > 20, 'world has houses', String(info.n));
  // Camera for a 3/4 view of a house: back from the gate, offset sideways, looking at the upper floor.
  const houseCam = (h) => {
    const dx = h.gate[0] - h.door[0], dz = h.gate[1] - h.door[1], l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l;
    return { pos: [h.gate[0] + ux * 5.5 - uz * 4.5, 1.7, h.gate[1] + uz * 5.5 + ux * 4.5], tgt: [h.door[0] + uz * 0.5, 3.2, h.door[1] - ux * 0.5] };
  };
  const shot = async (name, { min, weather = 'clear', pos, tgt }) => {
    const f0 = await E(([min, weather, pos, tgt]) => {
      const W = window.__HINODE__;
      W.clock.min = min; W.weather.force(weather); W.weather.update(0, W.clock); W.weather.settle();
      W.cam.pos[0] = pos[0]; W.cam.pos[1] = pos[1]; W.cam.pos[2] = pos[2];
      W.cam.target[0] = tgt[0]; W.cam.target[1] = tgt[1]; W.cam.target[2] = tgt[2];
      return W.state.frames;
    }, [min, weather, pos, tgt]);
    await pg.waitForFunction((f) => window.__HINODE__.state.frames > f + 2, f0, { timeout: 120000 });
    const f = `${OUT}/house_${TAG}_${name}.png`;
    await pg.screenshot({ path: f });
    const [m, sd] = stats(f), dt = detail(f);
    console.log(`STAT ${name} mean=${m.toFixed(1)} sd=${sd.toFixed(1)} detail=${dt.toFixed(2)}`);
    return { f, m, sd, dt };
  };
  const A = houseCam(info.h[0]), B = houseCam(info.h[1]);
  const s1 = await shot('day', { min: 10 * 60, ...A });
  ok(s1.sd > 8 && s1.m > 30, 'day house shot renders', `${s1.m.toFixed(1)} / ${s1.sd.toFixed(1)}`);
  const s2 = await shot('road', { min: 15 * 60 + 30, pos: [-38, 1.25, 2.3], tgt: [-8, 0.2, 2.6] });
  ok(s2.sd > 6, 'low road shot renders', s2.sd.toFixed(1));
  const s3 = await shot('night', { min: 21 * 60, ...A });
  const w3 = warm(s3.f);
  console.log(`STAT night warm=${w3.toFixed(2)}%`);
  ok(w3 > 0.05, 'night windows glow warm', w3.toFixed(2) + '%');
  const s4 = await shot('rain', { min: 21 * 60 + 30, weather: 'storm', ...B });
  ok(s4.sd > 5, 'rainy night shot renders', s4.sd.toFixed(1));
  const s5 = await shot('aerial', { min: 9 * 60, pos: [26, 30, 34], tgt: [0, 0, 0] });
  ok(s5.sd > 8, 'aerial roof shot renders', s5.sd.toFixed(1));
  ok(errs.length === 0, 'no console errors', errs.slice(0, 3).join(' | '));
  console.log(`\n${pass}/${pass + fail} passed`);
  await br.close(); srv.kill();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('FAIL  test run  --', e.message); console.log(`\n${pass}/${pass + fail + 1} passed`); srv.kill(); process.exit(1); });
