// Car + traffic test: get in, accelerate, steer, brake, drift, crash, headlights, get out; traffic stays on the roads.
import { createRequire } from 'module';
import { spawn } from 'child_process';
const require = createRequire('/vercel/sandbox/index.js');
const { chromium } = require('playwright');
const PORT = 8131, OUT = '/data/hinode_shots';
const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: '/tmp/ghp', stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, name, info = '') => { if (c) pass++; else fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${name}${info !== '' ? '  -- ' + info : ''}`); };
(async () => {
  await sleep(600);
  const br = await chromium.launch({ executablePath: '/usr/local/bin/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const pg = await br.newPage({ viewport: { width: 960, height: 540 } });
  const errs = [];
  pg.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  pg.on('pageerror', (e) => errs.push(String(e)));
  await pg.goto(`http://127.0.0.1:${PORT}/hinode/?test=1`);
  await pg.waitForFunction(() => window.__HINODE__ && window.__HINODE__.state.frames > 5, null, { timeout: 90000 });
  const E = (fn, a) => pg.evaluate(fn, a);
  await E(() => { const W = window.__HINODE__; if (W.ui.mode !== 'play') W.ui.setMode('play'); W.state.paused = true; W.clock.min = 10 * 60;
    // Move the car (and its driver with it, so the game doesn't treat it as the player teleporting away).
    window.__put = (x, z, yaw, v) => { const c = W.car; c.x = x; c.z = z; c.yaw = yaw; c.vx = Math.sin(yaw) * v; c.vz = Math.cos(yaw) * v; c.yawRate = 0; c.steer = 0; W.player.pos[0] = x; W.player.pos[2] = z; };
  });

  // Parked car spawns clear of walls.
  const park = await E(() => { const W = window.__HINODE__, c = W.car, t = { x: 0, z: 0 }; let worst = 0; for (const o of [-1.4, 0, 1.4]) { const x = c.x + Math.sin(c.yaw) * o, z = c.z + Math.cos(c.yaw) * o; W.world.collision.resolve([x, 0, z], 0.9, 0.25, 1.2, t); worst = Math.max(worst, Math.hypot(t.x - x, t.z - z)); } return worst; });
  ok(park < 0.05, 'parked car is clear of walls', park.toFixed(3));

  // Traffic moves and stays on the road network.
  const tr = await E(() => {
    const W = window.__HINODE__, b0 = W.traffic.bots.map((b) => [b.x, b.z]);
    let off = 0;
    const segD = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], l = dx * dx + dz * dz, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz); };
    for (let s = 0; s < 40; s++) { W.sim(0.5); for (const b of W.traffic.bots) { let d = 1e9; for (let i = 0; i < b.path.length; i++) d = Math.min(d, segD([b.x, b.z], b.path[i], b.path[(i + 1) % b.path.length])); off = Math.max(off, d); } }
    return { moved: W.traffic.bots.map((b, i) => Math.hypot(b.x - b0[i][0], b.z - b0[i][1])), off };
  });
  ok(tr.moved.every((m) => m > 20), 'traffic drives around', tr.moved.map((m) => m.toFixed(0)).join(','));
  ok(tr.off < 4.5, 'traffic stays near its lanes', tr.off.toFixed(2) + ' m');

  // Park traffic out of the way for the handling checks.
  await E(() => { const W = window.__HINODE__; W.traffic.bots.forEach((b, i) => { b.x = 300 + i * 10; b.z = 300; b.hold = 1e6; }); });

  // Get in.
  await E(() => { const W = window.__HINODE__, c = W.car; W.player.teleport(c.x - Math.cos(c.yaw) * 1.6, 0, c.z + Math.sin(c.yaw) * 1.6, 0); W.sim(0.2); });
  const pr = await E(() => { const c = window.__HINODE__.interact.current; return c ? c.verb : null; });
  ok(pr === 'Drive', 'Drive prompt next to car', String(pr));
  await E(() => { const W = window.__HINODE__; W.interact.current.act(); W.sim(0.1); });
  ok(await E(() => window.__HINODE__.car.driving && !document.querySelector('.speedo').hidden), 'in the car, speedometer shown');

  // Straight-line acceleration down Asahi-dori.
  await E(() => { window.__put(-36, -1.75, Math.PI / 2, 0); window.__HINODE__.sim(0.1); });
  await pg.keyboard.down('KeyW');
  const acc = await E(() => { const W = window.__HINODE__, x0 = W.car.x; W.sim(3); return { v: W.car.speed, dx: W.car.x - x0, kmh: document.querySelector('.speedo b').textContent, gear: document.querySelector('.speedo .gear').textContent }; });
  ok(acc.v > 17 && acc.dx > 20, '0-60+ km/h in 3 s, moving forward', `${(acc.v * 3.6).toFixed(0)} km/h, ${acc.dx.toFixed(1)} m`);
  ok(+acc.kmh > 55 && /[2-5]/.test(acc.gear), 'speedo shows speed and gear', `${acc.kmh} km/h gear ${acc.gear}`);
  ok(await E(() => window.__HINODE__.cam.fov > window.__HINODE__.car.baseFov + 0.05), 'FOV widens with speed');
  await pg.screenshot({ path: `${OUT}/car_drive.png` });

  // Steer right: D should turn the car to the right (yaw decreases).
  await pg.keyboard.down('KeyD');
  const st = await E(() => { const W = window.__HINODE__, y0 = W.car.yaw; W.sim(0.6); return W.car.yaw - y0; });
  await pg.keyboard.up('KeyD');
  ok(st < -0.3, 'D steers right', st.toFixed(2));
  await pg.keyboard.up('KeyW');

  // Brake to a stop.
  await E(() => { window.__put(-36, -1.75, Math.PI / 2, 20); });
  await pg.keyboard.down('KeyS');
  const bk = await E(() => { const W = window.__HINODE__; let lit = false, t = 0; while (W.car.fwd > 0.3 && t < 4) { W.sim(0.05); t += 0.05; lit = lit || W.car.braking; } return { t, lit }; });
  await pg.keyboard.up('KeyS');
  ok(bk.t < 2.2 && bk.lit, '72 km/h to 0 under 2.2 s, brake lights on', bk.t.toFixed(2) + ' s');

  // Handbrake turn: rear lets go, the car slides.
  await E(() => { window.__put(-30, -1.75, Math.PI / 2, 16); });
  await pg.keyboard.down('KeyA'); await pg.keyboard.down('Space');
  const dr = await E(() => { const W = window.__HINODE__; let slip = 0; for (let i = 0; i < 15; i++) { W.sim(0.05); slip = Math.max(slip, W.car.slip); } return slip; });
  await pg.keyboard.up('Space'); await pg.keyboard.up('KeyA');
  ok(dr > 2, 'handbrake drift (sideways slip)', dr.toFixed(2) + ' m/s');

  // Crash into a house: car stops at the wall, impact registered, no tunnelling.
  const cr = await E(() => {
    const W = window.__HINODE__, c = W.car, L = W.world.lots[3], t0 = { x: 0, z: 0 };
    const over = (x, z, yaw, r) => Math.max(...[-1.4, 0, 1.4].map((o) => { const px = x + Math.sin(yaw) * o, pz = z + Math.cos(yaw) * o; W.world.collision.resolve([px, 0, pz], r, 0.25, 1.2, t0); return Math.hypot(t0.x - px, t0.z - pz); }));
    let start = null; // nearest clear spot on a line out from the house, facing it
    for (let d = 7; d < 20 && !start; d += 0.5) for (const [ux, uz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) { const x = L.x + ux * d, z = L.z + uz * d, yaw = Math.atan2(-ux, -uz); if (over(x, z, yaw, 0.95) < 1e-3) { start = [x, z, yaw, d]; break; } }
    window.__put(start[0], start[1], start[2], 15);
    let imp = 0; for (let i = 0; i < 90; i++) { W.sim(1 / 60); imp = Math.max(imp, c.impact); }
    return { imp, inside: over(c.x, c.z, c.yaw, 0.9), dist: Math.hypot(c.x - L.x, c.z - L.z), v: c.speed, drv: c.driving, d0: start[3] };
  });
  ok(cr.imp > 5, 'crash registers an impact', cr.imp.toFixed(1) + ' m/s');
  ok(cr.inside < 0.1 && cr.dist > 1, 'no driving through houses', `started ${cr.d0} m out, stopped ${cr.dist.toFixed(1)} m from lot centre, overlap ${cr.inside.toFixed(2)}, driving ${cr.drv}`);

  // Night: headlights light the road ahead.
  await E(() => { const W = window.__HINODE__, c = W.car; window.__put(-20, -1.75, Math.PI / 2, 0); W.clock.min = 21 * 60; W.cam.yaw = c.yaw + Math.PI; W.sim(0.3); });
  await E(() => { window.__HINODE__.state.paused = false; });
  { const f0 = await E(() => window.__HINODE__.state.frames); await pg.waitForFunction((f) => window.__HINODE__.state.frames > f + 3, f0, { timeout: 60000 }); }
  ok(await E(() => window.__HINODE__.car.lamp[3] > 1), 'headlights on at night');
  await pg.screenshot({ path: `${OUT}/car_night.png` });
  await E(() => { const W = window.__HINODE__; W.state.paused = true; W.clock.min = 10 * 60; });

  // Get out beside the car.
  await E(() => { const W = window.__HINODE__; W.car.vx = W.car.vz = 0; W.sim(0.1); W.interact.current.act(); W.sim(0.1); });
  const ex = await E(() => { const W = window.__HINODE__; return { d: W.car.driving, dist: Math.hypot(W.player.pos[0] - W.car.x, W.player.pos[2] - W.car.z), hud: document.querySelector('.speedo').hidden, fov: W.cam.fov === W.car.baseFov }; });
  ok(!ex.d && ex.dist > 1 && ex.dist < 3.5 && ex.hud && ex.fov, 'get out beside the car', `${ex.dist.toFixed(2)} m`);
  ok(errs.length === 0, 'no console errors', errs.slice(0, 3).join(' | '));
  console.log(`${pass}/${pass + fail} passed`);
  await br.close(); srv.kill();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); srv.kill(); process.exit(1); });
