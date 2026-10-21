// M1 end-to-end check. Serves the repo under a /hinode/ subpath (like GitHub Pages) and drives real Chromium.
// Real keyboard/mouse events go through the game's Input; the simulation is advanced in fixed 1/60 s steps
// via the ?test=1 hook so results don't depend on the software GPU's frame rate.
// Run: node tests/e2e.mjs   (from the repo root)
import { createRequire } from 'module';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import url from 'url';

const require = createRequire('/vercel/sandbox/index.js');
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const SERVE = '/tmp/ghp', PORT = 8123;
const SHOTS = process.env.SHOTS || '/data/hinode_shots';
fs.mkdirSync(SERVE, { recursive: true }); fs.mkdirSync(SHOTS, { recursive: true });
if (!fs.existsSync(path.join(SERVE, 'hinode'))) fs.symlinkSync(ROOT, path.join(SERVE, 'hinode'));

const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: SERVE, stdio: 'ignore' });
const results = [];
const ok = (name, pass, info = '') => { results.push({ name, pass, info }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + info : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  const hold = async (keys, secs) => { for (const k of keys) await page.keyboard.down(k); await sim(secs); for (const k of keys) await page.keyboard.up(k); };

  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:${PORT}/hinode/?test=1`);
  try { await page.waitForFunction(() => window.__HINODE__ && window.__HINODE__.state.frames > 20, null, { timeout: 90000 }); }
  catch (e) { ok('boots and renders frames', false, (await H(() => document.getElementById('err-msg')?.textContent)) || e.message); throw e; }
  ok('boots and renders frames under /hinode/ subpath', true, `${((Date.now() - t0) / 1000).toFixed(1)}s`);
  ok('title', (await page.title()).startsWith('HINODE'));

  // Real frame rate in this sandbox (software rendering, CPU only) before pausing the live loop.
  const f0 = await H(() => window.__HINODE__.state.frames); await sleep(2000);
  const f1 = await H(() => window.__HINODE__.state.frames);
  const info = await H(() => { const W = window.__HINODE__; return { houses: W.world.houses, chunks: W.world.chunks.length, boxes: W.world.collision.boxes.length, circles: W.world.collision.circles.length, tris: Math.round(W.r.stats.tris), draws: W.r.stats.draws }; });
  ok('world built', info.houses >= 60 && info.boxes > 100, JSON.stringify(info));
  ok('frame rate sample (SwiftShader CPU renderer, not representative of a GPU)', true, `${((f1 - f0) / 2).toFixed(1)} fps`);

  await page.mouse.click(640, 360);
  await page.screenshot({ path: `${SHOTS}/m1_spawn.png` });
  await H(() => { window.__HINODE__.state.paused = true; });

  // 1) Walk forward on the main street: W should move the player along the camera's forward at walk speed.
  await H(() => { const W = window.__HINODE__; W.player.teleport(10, 0, 1.6); W.cam.yaw = Math.PI / 2; W.sim(0.3); });
  const p0 = await H(() => [...window.__HINODE__.player.pos]);
  await hold(['KeyW'], 1.5);
  const p1 = await H(() => [...window.__HINODE__.player.pos]);
  const walked = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]);
  ok('W moves the player camera-forward at walk speed', walked > 5.4 && walked < 6.6 && p1[0] < p0[0] - 5, `moved ${walked.toFixed(2)} m in 1.5 s`);
  await sim(0.3);
  const stop = await H(() => window.__HINODE__.player.speed);
  ok('stops within 0.3 s of release', stop < 0.05, `speed ${stop.toFixed(3)}`);

  // 2) Turning responsiveness + sprint.
  await hold(['KeyS'], 0.6);
  const back = await H(() => ({ v: window.__HINODE__.player.speed, yaw: window.__HINODE__.player.yaw }));
  await hold(['KeyS', 'ShiftLeft'], 0.6);
  const run = await H(() => window.__HINODE__.player.speed);
  await sim(0.4);
  ok('reverses direction quickly', back.v > 4.0 && Math.abs(Math.sin(back.yaw) - 1) < 0.05, `speed ${back.v.toFixed(2)}, facing ${back.yaw.toFixed(2)} rad`);
  ok('sprint faster than walk', run > 6.5, `run ${run.toFixed(2)} m/s`);

  // 3) Jump rises and lands on the same ground.
  const y0 = await H(() => window.__HINODE__.player.pos[1]);
  await page.keyboard.press('Space');
  await sim(0.25);
  const yUp = await H(() => window.__HINODE__.player.pos[1]);
  await sim(1.0);
  const yEnd = await H(() => ({ y: window.__HINODE__.player.pos[1], g: window.__HINODE__.player.grounded }));
  ok('jump rises and lands', yUp > y0 + 0.8 && yEnd.g && Math.abs(yEnd.y - y0) < 0.01, `at 0.25 s ${yUp.toFixed(2)} m, end ${yEnd.y.toFixed(2)}`);

  // 4) Collision with a house: stand next to its +x face and walk into it.
  const wall = await H(() => {
    const W = window.__HINODE__, b = W.world.collision.boxes.find((q) => q.tag === 'house' && q.x0 > 5 && q.z0 > -40 && q.z1 < -4);
    const z = (b.z0 + b.z1) / 2;
    W.player.teleport(b.x1 + 0.6, 0, z); W.cam.yaw = Math.PI / 2;
    return { x1: b.x1, z };
  });
  await hold(['KeyW'], 1.5); await sim(0.2);
  const pw = await H(() => [...window.__HINODE__.player.pos]);
  ok('cannot walk through a house', pw[0] >= wall.x1 + 0.3, `x ${pw[0].toFixed(3)} face ${wall.x1.toFixed(3)}`);

  // 5) Sliding: push diagonally into the same wall, should travel along it.
  await H(() => { window.__HINODE__.cam.yaw = Math.PI / 2 - 0.6; });
  await hold(['KeyW'], 0.6); await sim(0.2);
  const ps = await H(() => [...window.__HINODE__.player.pos]);
  ok('slides along walls instead of sticking', Math.abs(ps[2] - pw[2]) > 0.8 && ps[0] >= wall.x1 + 0.3, `slid ${Math.abs(ps[2] - pw[2]).toFixed(2)} m`);

  // 6) A 1.15 m garden wall blocks you (too high to step over).
  const low = await H(() => {
    const W = window.__HINODE__, b = W.world.collision.boxes.find((q) => q.tag === 'wall' && (q.x1 - q.x0) > 3 && (q.z1 - q.z0) < 0.6 && q.z0 > 3 && q.z1 < 5 && q.x0 > 44);
    if (!b) return null;
    W.player.teleport((b.x0 + b.x1) / 2, 0, b.z0 - 0.6); W.cam.yaw = Math.PI; // forward = +z
    return { z0: b.z0 };
  });
  if (!low) ok('blocked by 1.15 m garden wall', false, 'no suitable wall found');
  else {
    await hold(['KeyW'], 0.9); await sim(0.1);
    const pl = await H(() => [...window.__HINODE__.player.pos]);
    ok('blocked by 1.15 m garden wall', pl[2] <= low.z0 - 0.3 + 0.001 && pl[1] < 0.01, `z ${pl[2].toFixed(3)} wall ${low.z0.toFixed(3)}`);
  }

  // 7) Poles are solid.
  const pole = await H(() => {
    const W = window.__HINODE__, c = W.world.collision.circles.find((q) => q.tag === 'pole' && Math.abs(q.z - -3.25) < 0.01 && q.x < -5);
    W.player.teleport(c.x + 1.2, 0, c.z); W.cam.yaw = Math.PI / 2;
    return { x: c.x, z: c.z, r: c.r };
  });
  await hold(['KeyW'], 0.7); await sim(0.1);
  const pp = await H(() => [...window.__HINODE__.player.pos]);
  const pd = Math.hypot(pp[0] - pole.x, pp[2] - pole.z);
  ok('utility poles are solid', pd >= pole.r + 0.3, `dist ${pd.toFixed(3)}`);

  // 8) Camera never ends up inside a building when backed against one.
  const camOk = await H(() => {
    const W = window.__HINODE__, b = W.world.collision.boxes.find((q) => q.tag === 'house' && q.x0 > 5 && q.z0 > -40 && q.z1 < -4);
    W.player.teleport(b.x1 + 0.5, 0, (b.z0 + b.z1) / 2); W.cam.yaw = -Math.PI / 2; W.cam.distWant = 9;
    W.sim(1.0);
    const c = W.cam.pos, inside = W.world.collision.boxes.some((q) => q.tag !== 'edge' && c[0] > q.x0 && c[0] < q.x1 && c[2] > q.z0 && c[2] < q.z1 && c[1] > q.y0 && c[1] < q.y1);
    return { inside, dist: W.cam.distNow };
  });
  ok('camera pulls in instead of clipping into houses', !camOk.inside && camOk.dist < 3, `dist ${camOk.dist.toFixed(2)}`);
  await sleep(300);
  await page.screenshot({ path: `${SHOTS}/m1_wallcam.png` });

  // 9) Mouse wheel zoom, clamped.
  await H(() => { const W = window.__HINODE__; W.player.teleport(10, 0, 1.6); W.cam.yaw = Math.PI / 2; W.cam.distWant = 5.2; W.sim(0.3); });
  for (let i = 0; i < 12; i++) await page.mouse.wheel(0, 120);
  await sleep(100); await sim(0.1);
  const zOut = await H(() => window.__HINODE__.cam.distWant);
  for (let i = 0; i < 30; i++) await page.mouse.wheel(0, -120);
  await sleep(100); await sim(0.1);
  const zIn = await H(() => window.__HINODE__.cam.distWant);
  ok('wheel zoom clamps', zOut === 9.5 && zIn === 2.4, `out ${zOut} in ${zIn}`);
  await H(() => { const W = window.__HINODE__; W.cam.distWant = 5.2; W.cam.pitch = 0.3; });

  // 10) Town edge holds even at a sprint (away from the Asahi-dori gap into Shinjuku).
  await H(() => { const W = window.__HINODE__; W.player.teleport(78, 0, 20); W.cam.yaw = -Math.PI / 2; });
  await hold(['KeyW', 'ShiftLeft'], 2.0);
  const pe = await H(() => [...window.__HINODE__.player.pos]);
  ok('cannot leave the town edge', pe[0] < 82.3, `x ${pe[0].toFixed(2)}`);
  // ...but Asahi-dori runs straight on into Shinjuku.
  await H(() => { const W = window.__HINODE__; W.player.teleport(78, 0, 0); W.cam.yaw = -Math.PI / 2; });
  await hold(['KeyW', 'ShiftLeft'], 2.0);
  const pg2 = await H(() => [...window.__HINODE__.player.pos]);
  ok('Asahi-dori gap leads into Shinjuku', pg2[0] > 84, `x ${pg2[0].toFixed(2)}`);

  // 11) Blur clears held keys (no runaway walking after alt-tab).
  await H(() => window.__HINODE__.player.teleport(10, 0, 1.6));
  await page.keyboard.down('KeyW'); await sim(0.2);
  await H(() => window.dispatchEvent(new Event('blur')));
  await sim(0.5);
  const vb = await H(() => window.__HINODE__.player.speed);
  await page.keyboard.up('KeyW');
  ok('window blur releases keys', vb < 0.05, `speed ${vb.toFixed(3)}`);

  // 12) A long random walk never ends up inside a solid or below ground.
  const soak = await H(() => {
    const W = window.__HINODE__, I = W.input; let bad = 0, maxDepth = 0;
    const keys = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    W.player.teleport(10, 0, 1.6);
    for (let s = 0; s < 120; s++) {
      I.down.clear(); I.down.add(keys[(rnd() * 4) | 0]); if (rnd() < 0.5) I.down.add('ShiftLeft'); if (rnd() < 0.2) I.pressed.add('Space');
      W.cam.yaw += (rnd() - 0.5) * 2;
      for (let k = 0; k < 30; k++) {
        W.sim(1 / 60);
        const p = W.player.pos;
        if (p[1] < -0.01) bad++;
        for (const b of W.world.collision.boxes) {
          if (b.y1 <= p[1] + 0.45 || b.y0 >= p[1] + 1.7) continue;
          const d = Math.min(p[0] - b.x0, b.x1 - p[0], p[2] - b.z0, b.z1 - p[2]);
          if (d > 0.02) { bad++; maxDepth = Math.max(maxDepth, d); }
        }
      }
    }
    I.down.clear();
    return { bad, maxDepth, end: W.player.pos.map((v) => +v.toFixed(1)) };
  });
  ok('60 s random-walk soak: never inside a solid / under ground', soak.bad === 0, JSON.stringify(soak));

  // 13) Resize keeps rendering.
  await H(() => { window.__HINODE__.state.paused = false; });
  const fBefore = await H(() => window.__HINODE__.state.frames);
  await page.setViewportSize({ width: 640, height: 400 });
  // Wait for frames to actually advance at the new size (software GPU cadence varies) instead of a fixed sleep.
  await page.waitForFunction((f) => window.__HINODE__.state.frames > f + 2 && document.getElementById('view').width === 640, fBefore, { timeout: 20000 }).catch(() => {});
  const rs = await H(() => ({ f: window.__HINODE__.state.frames, w: document.getElementById('view').width }));
  ok('survives resize', rs.f > fBefore + 2 && rs.w === 640, `canvas ${rs.w}px, +${rs.f - fBefore} frames`);
  await page.setViewportSize({ width: 1280, height: 720 }); await sleep(800);
  await H(() => { window.__HINODE__.state.paused = true; });

  // Views for pixel checks.
  const shot = async (name, fn) => { await H(fn); await sleep(900); await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
  await shot('m1_street', () => { const W = window.__HINODE__; W.player.teleport(10, 0, 1.6, -Math.PI / 2); W.cam.yaw = Math.PI / 2; W.cam.pitch = 0.22; W.cam.distWant = 5.2; W.sim(1); });
  await shot('m1_alley', () => { const W = window.__HINODE__; W.player.teleport(-20, 0, -8, Math.PI); W.cam.yaw = 0; W.cam.pitch = 0.18; W.sim(1); });
  await shot('m1_park', () => { const W = window.__HINODE__; W.player.teleport(14, 0, 14, 0); W.cam.yaw = Math.PI * 0.8; W.cam.pitch = 0.5; W.cam.distWant = 9; W.sim(1); });

  ok('no console errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  ok('no missing files (404s)', missing.length === 0, missing.slice(0, 5).join(' | '));
  await browser.close();
}

main().catch((e) => { console.error(e); ok('test run', false, e.message); }).finally(() => {
  server.kill();
  const failed = results.filter((r) => !r.pass).length;
  fs.writeFileSync(`${SHOTS}/m1_results.json`, JSON.stringify(results, null, 1));
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
});
