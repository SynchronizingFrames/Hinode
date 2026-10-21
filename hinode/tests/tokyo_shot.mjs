// Tokyo district (wip12): night/rain/day shots + collision sanity (town gap open, district walls closed,
// raised kerbs walkable, car allowed past the old town edge, coloured lamps reaching the shader).
import { createRequire } from 'module';
import { spawn, execSync } from 'child_process';
const require = createRequire('/vercel/sandbox/index.js');
const { chromium } = require('playwright');
const PORT = 8136, OUT = '/data/hinode_shots';
const BASE = process.env.HS_BASE || 'hinode';
const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: '/tmp/ghp', stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, name, info = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + info : ''}`); };
const stats = (f) => execSync(`magick ${f} -colorspace gray -format '%[fx:mean*255] %[fx:standard_deviation*255]' info:`).toString().trim().split(' ').map(Number);
const detail = (f) => Number(execSync(`magick ${f} -colorspace gray -statistic StandardDeviation 3x3 -format '%[fx:mean*255]' info:`).toString().trim());
const sat = (f) => Number(execSync(`magick ${f} -colorspace HSL -channel G -separate +channel -format '%[fx:mean*100]' info:`).toString().trim());
const neon = (f) => Number(execSync(`magick ${f} -colorspace HSL -fx 'g>0.6&&b>0.35' -colorspace gray -format '%[fx:mean*100]' info:`).toString().trim());
(async () => {
  await sleep(600);
  const br = await chromium.launch({ executablePath: '/usr/local/bin/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const pg = await br.newPage({ viewport: { width: 960, height: 540 } });
  const errs = [];
  pg.on('console', (m) => { if (m.type() === 'error' || /Shader|compile/i.test(m.text())) errs.push(m.text()); });
  pg.on('pageerror', (e) => errs.push(String(e)));
  await pg.goto(`http://127.0.0.1:${PORT}/${BASE}/?test=1`);
  await pg.waitForFunction(() => window.__HINODE__ && window.__HINODE__.state.frames > 5, null, { timeout: 150000 });
  const E = (fn, a) => pg.evaluate(fn, a);
  const info = await E(() => {
    const W = window.__HINODE__, col = W.world.collision;
    if (W.ui.mode !== 'play') W.ui.setMode('play');
    W.state.paused = true;
    if (W.cam) W.cam.fpv = false;
    for (const el of document.body.children) if (el.id !== 'view') el.style.visibility = 'hidden';
    W.player.teleport(-300, 0, -300, 0);
    if (W.traffic) W.traffic.bots.forEach((b, i) => { b.x = -300 - i * 10; b.z = -300; b.hold = 1e6; });
    const R = (x, z) => { const o = col.resolve([x, 0, z], 0.4, 0, 1.6); return { hit: o.hit, tag: o.tag }; };
    return {
      gap: R(82.7, 0), wallN: R(82.7, 20), wallS: R(82.7, -20), east: R(270.3, 30), north: R(180, -104.4),
      kerb: col.groundAt(130, -57.5, 0.2, 0.3), road: col.groundAt(130, -52, 0.2, 0.3),
      bbx: W.car && W.car.bb ? W.car.bb.x1 : null,
      shops: W.world.tokyo ? W.world.tokyo.shops.length : 0, lamps: W.world.lamps.length,
      coloured: W.world.lamps.filter((l) => l.length >= 7).length, chunks: W.world.chunks.length,
      far: W.world.chunks.filter((c) => c.far).length,
    };
  });
  console.log('INFO ' + JSON.stringify(info));
  ok(!info.gap.hit, 'town -> Tokyo gap is open', JSON.stringify(info.gap));
  ok(info.wallN.hit && info.wallS.hit, 'town east wall still closed beside the gap');
  ok(info.east.hit && info.north.hit, 'district outer walls block');
  ok(Math.abs(info.kerb - 0.15) < 0.01 && info.road < 0.05, 'raised sidewalk is walkable, road is flat', `${info.kerb} / ${info.road}`);
  ok(info.bbx >= 260, 'car may drive into Tokyo', String(info.bbx));
  ok(info.shops > 100 && info.coloured > 300, 'district built (shops, coloured lamps)', `${info.shops} shops, ${info.coloured}/${info.lamps} lamps`);
  const shot = async (name, { min, weather = 'clear', pos, tgt }) => {
    const f0 = await E(([min, weather, pos, tgt]) => {
      const W = window.__HINODE__;
      W.clock.min = min; W.weather.force(weather); W.weather.update(0, W.clock); W.weather.settle();
      W.cam.pos[0] = pos[0]; W.cam.pos[1] = pos[1]; W.cam.pos[2] = pos[2];
      W.cam.target[0] = tgt[0]; W.cam.target[1] = tgt[1]; W.cam.target[2] = tgt[2];
      return W.state.frames;
    }, [min, weather, pos, tgt]);
    await pg.waitForFunction((f) => window.__HINODE__.state.frames > f + 2, f0, { timeout: 150000 });
    const f = `${OUT}/tokyo_${name}.png`;
    await pg.screenshot({ path: f });
    const [m, sd] = stats(f), dt = detail(f), s = sat(f), nn = neon(f);
    console.log(`STAT ${name} mean=${m.toFixed(1)} sd=${sd.toFixed(1)} detail=${dt.toFixed(2)} sat=${s.toFixed(1)} neon=${nn.toFixed(2)}%`);
    return { f, m, sd, dt, s, nn };
  };
  const a = await shot('avenue', { min: 21 * 60 + 30, pos: [150, 1.7, -4.5], tgt: [206, 6, 0] });
  ok(a.sd > 8 && a.nn > 0.3, 'night avenue renders with neon', `${a.sd.toFixed(1)} / ${a.nn.toFixed(2)}%`);
  const lc = await E(() => { const c = window.__HINODE__.env.lampColBuf; let n = 0; if (c) for (let k = 0; k < 16; k++) if (Math.abs(c[k * 3] - 1) > 0.05 || Math.abs(c[k * 3 + 2] - 0.42) > 0.05) n++; return n; });
  ok(lc >= 3, 'non-default lamp colours reach the shader', String(lc));
  const s = await shot('scramble', { min: 22 * 60, pos: [196, 1.7, 9.5], tgt: [212, 7, -8] });
  ok(s.sd > 8, 'scramble crossing renders', s.sd.toFixed(1));
  const y = await shot('yokocho', { min: 21 * 60, pos: [125.15, 1.7, -8.2], tgt: [125.15, 2.3, -30] });
  ok(y.sd > 8 && y.m > 12, 'lantern alley renders', `${y.m.toFixed(1)} / ${y.sd.toFixed(1)}`);
  const r = await shot('rain', { min: 22 * 60 + 30, weather: 'storm', pos: [170, 1.3, 4], tgt: [200, 3, -2] });
  ok(r.sd > 6, 'rainy neon avenue renders', r.sd.toFixed(1));
  const ae = await shot('aerial', { min: 21 * 60 + 45, pos: [140, 48, 62], tgt: [200, 0, -10] });
  ok(ae.sd > 8, 'aerial night renders', ae.sd.toFixed(1));
  const d = await shot('day', { min: 14 * 60, pos: [160, 1.7, -55.5], tgt: [200, 9, -50] });
  ok(d.sd > 8 && d.m > 40, 'daytime street renders', `${d.m.toFixed(1)} / ${d.sd.toFixed(1)}`);
  ok(errs.length === 0, 'no console errors', errs.slice(0, 3).join(' | '));
  console.log(`\n${pass}/${pass + fail} passed`);
  await br.close(); srv.kill();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('FAIL  test run  --', e.message); console.log(`\n${pass}/${pass + fail + 1} passed`); srv.kill(); process.exit(1); });
