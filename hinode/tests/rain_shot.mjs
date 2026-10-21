// Rain + wet roads: dry vs storm, day and night, from street level. Checks the rain pass draws, the wet shader
// compiles, the forecast is deterministic, and prints road pixel stats (bottom of frame) for each shot.
import { createRequire } from 'module';
import { spawn, execSync } from 'child_process';
const require = createRequire('/vercel/sandbox/index.js');
const { chromium } = require('playwright');
const PORT = 8133, OUT = '/data/hinode_shots';
const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: '/tmp/ghp', stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, name, info = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + info : ''}`); };
const stats = (f) => execSync(`magick ${f} -gravity south -crop 100%x38%+0+0 +repage -colorspace gray -format '%[fx:mean*255] %[fx:standard_deviation*255] %[fx:maxima*255]' info:`).toString().trim().split(' ').map(Number);
(async () => {
  await sleep(600);
  const br = await chromium.launch({ executablePath: '/usr/local/bin/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const pg = await br.newPage({ viewport: { width: 960, height: 540 } });
  const errs = [];
  pg.on('console', (m) => { if (m.type() === 'error' || /rain disabled|Shader/.test(m.text())) errs.push(m.text()); });
  pg.on('pageerror', (e) => errs.push(String(e)));
  await pg.goto(`http://127.0.0.1:${PORT}/hinode/?test=1`);
  await pg.waitForFunction(() => window.__HINODE__ && window.__HINODE__.state.frames > 5, null, { timeout: 120000 });
  const E = (fn, a) => pg.evaluate(fn, a);
  ok(await E(() => !!window.__HINODE__.r.rainP), 'rain shader compiled');
  await E(() => {
    const W = window.__HINODE__;
    if (W.ui.mode !== 'play') W.ui.setMode('play');
    W.state.paused = true;
    for (const el of document.body.children) if (el.id !== 'view') el.style.visibility = 'hidden';
    W.player.teleport(-60, 0, -30, 0);
    W.traffic.bots.forEach((b, i) => { b.x = 300 + i * 10; b.z = 300; b.hold = 1e6; });
  });
  const shot = async (name, mode, min, wet = null) => {
    const f0 = await E(([mode, min, wet]) => {
      const W = window.__HINODE__;
      W.clock.min = min; W.weather.force(mode); W.weather.update(0, W.clock); W.weather.settle();
      if (wet !== null) W.weather.wet = wet;
      W.cam.pos[0] = -26; W.cam.pos[1] = 1.7; W.cam.pos[2] = 1.2;
      W.cam.target[0] = 2; W.cam.target[1] = 0.9; W.cam.target[2] = 0;
      return W.state.frames;
    }, [mode, min, wet]);
    await pg.waitForFunction((f) => window.__HINODE__.state.frames > f + 3, f0, { timeout: 60000 });
    const info = await E(() => { const W = window.__HINODE__; return { draws: W.r.stats.draws, rain: W.env.rain, wet: W.env.wet, label: W.weather.label, fogK: W.env.fogK }; });
    await pg.screenshot({ path: `${OUT}/rain_${name}.png` });
    const s = stats(`${OUT}/rain_${name}.png`);
    console.log(`shot ${name}`, JSON.stringify(info), 'road mean/sd/max', s.map((v) => v.toFixed(1)).join(' '));
    return { ...info, s };
  };
  const dryDay = await shot('dry_day', 'clear', 11 * 60);
  const wetDay = await shot('wet_day', 'storm', 11 * 60);
  const dryNight = await shot('dry_night', 'clear', 21 * 60 + 30);
  const wetNight = await shot('wet_night', 'storm', 21 * 60 + 30);
  // Same storm sky with a dry road, to isolate what the wet-ground shader adds.
  const stormDryDay = await shot('storm_dryroad_day', 'storm', 11 * 60, 0);
  const stormDryNight = await shot('storm_dryroad_night', 'storm', 21 * 60 + 30, 0);
  ok(dryDay.rain === 0 && dryDay.wet === 0, 'clear weather is dry');
  ok(wetDay.rain > 0.9 && wetDay.wet === 1 && wetDay.label === 'Heavy rain', 'storm sets rain + wet', `${wetDay.rain} ${wetDay.wet} ${wetDay.label}`);
  ok(wetDay.draws === dryDay.draws + 1, 'rain pass drawn only when raining', `${dryDay.draws} -> ${wetDay.draws}`);
  ok(wetDay.fogK > dryDay.fogK * 1.4, 'rain thickens the fog', `${dryDay.fogK.toFixed(4)} -> ${wetDay.fogK.toFixed(4)}`);
  const dd = Math.abs(wetDay.s[0] - stormDryDay.s[0]) + Math.abs(wetDay.s[1] - stormDryDay.s[1]);
  ok(dd > 3, 'wet ground visibly changes the road by day', `mean ${stormDryDay.s[0].toFixed(1)} -> ${wetDay.s[0].toFixed(1)}, sd ${stormDryDay.s[1].toFixed(1)} -> ${wetDay.s[1].toFixed(1)}`);
  ok(wetNight.s[1] > stormDryNight.s[1] && wetNight.s[2] >= stormDryNight.s[2], 'wet road at night: lamp reflections add contrast', `sd ${stormDryNight.s[1].toFixed(1)} -> ${wetNight.s[1].toFixed(1)}, max ${stormDryNight.s[2].toFixed(0)} -> ${wetNight.s[2].toFixed(0)}`);
  // Forecast: deterministic, and some days rain while others stay clear.
  const fc = await E(() => {
    const w = window.__HINODE__.weather, a = [], b = [];
    for (let d = 1; d <= 20; d++) { let r = 0; for (let m = 480; m < 1320; m += 10) r = Math.max(r, w.forecast(d, m)); a.push(r > 0); b.push(w.forecast(d, 900)); }
    const again = []; for (let d = 1; d <= 20; d++) again.push(w.forecast(d, 900));
    return { rainy: a.filter(Boolean).length, same: JSON.stringify(b) === JSON.stringify(again) };
  });
  ok(fc.rainy >= 5 && fc.rainy <= 17 && fc.same, 'forecast is deterministic with a mix of rainy and dry days', `${fc.rainy}/20 rainy`);
  // Ground dries after the rain stops.
  const dry = await E(() => { const w = window.__HINODE__.weather; w.force('clear'); for (let i = 0; i < 60 * 120; i++) w.update(1 / 60, window.__HINODE__.clock); return w.wet; });
  ok(dry === 0, 'ground dries within 2 minutes of clear sky', String(dry));
  ok(errs.length === 0, 'no console errors', errs.slice(0, 3).join(' | '));
  try { execSync(`magick ${OUT}/rain_dry_day.png ${OUT}/rain_wet_day.png +append /tmp/r1.png && magick ${OUT}/rain_dry_night.png ${OUT}/rain_wet_night.png +append /tmp/r2.png && magick /tmp/r1.png /tmp/r2.png -append -resize 1500x -quality 85 ${OUT}/rain_montage.jpg`); } catch (e) { console.log('montage failed', e.message); }
  console.log(`\n${pass}/${pass + fail} passed`);
  await br.close(); srv.kill();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('FAIL  test run  --', e.message); console.log(`\n${pass}/${pass + fail + 1} passed`); srv.kill(); process.exit(1); });
