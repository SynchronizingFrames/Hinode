// HINODE bootstrap: loader, world build, game state, main loop.
import { Renderer, WebGLUnavailable } from './engine/renderer.js';
import { Input } from './game/input.js';
import { Player } from './game/player.js';
import { CameraRig } from './game/camera.js';
import { buildNeighborhood } from './world/neighborhood.js';
import { Markers } from './world/marker.js';
import { applyTimeOfDay, nearestLamps } from './world/daynight.js';
import { Weather } from './world/weather.js';
import { Clock, Career, DAY_END } from './game/career.js';
import { Jobs } from './game/jobs.js';
import { Interact } from './game/interact.js';
import { Npcs } from './game/npcs.js';
import { Talk } from './ui/talk.js';
import { TouchControls } from './ui/touch.js';
import { Car } from './game/car.js';
import { Traffic } from './game/traffic.js';
import { Crowd } from './game/crowd.js';
import { GameAudio } from './game/audio.js';
import { Hud } from './ui/hud.js';
import { Board } from './ui/board.js';
import { Journal } from './ui/journal.js';
import { Summary } from './ui/summary.js';
import { yen } from './ui/dom.js';
import { SaveStore, snapshot, apply, describe, browserStorage } from './game/save.js';
import { Menu, loadSettings, saveSettings, hasSavedSettings } from './ui/menu.js';
import { Cinematic } from './ui/cinematic.js';
import { PadNav } from './ui/padnav.js';
import { PadUI } from './ui/padui.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const TEST = params.has('test');
let dead = false;

function fail(msg) {
  if (dead) return;
  dead = true;
  $('err-msg').textContent = msg;
  $('err').hidden = false;
  $('boot').classList.add('out');
  console.error('[HINODE] ' + msg);
}
$('err-reload').addEventListener('click', () => location.reload());
window.addEventListener('error', (e) => fail('Unexpected error: ' + (e.message || e.error || 'unknown') + (e.filename ? `\n${e.filename.split('/').pop()}:${e.lineno}` : '')));
window.addEventListener('unhandledrejection', (e) => fail('Unexpected error: ' + ((e.reason && e.reason.message) || e.reason)));

const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };

// Lighting state. Starts as golden hour; applyTimeOfDay() rewrites it every frame from the game clock.
const ENV = {
  sunDir: norm([-0.62, 0.38, 0.32]),
  sunCol: [2.5, 1.85, 1.25],
  sky: [0.34, 0.42, 0.56],
  ground: [0.25, 0.21, 0.16],
  zenith: [0.2, 0.36, 0.68],
  horizon: [0.96, 0.74, 0.54],
  fog: [0.8, 0.69, 0.58],
  window: [1.0, 0.74, 0.44],
  fogK: 0.0058, night: 0, exposure: 1.0, wet: 0, time: 0,
};

async function boot() {
  const canvas = $('view');
  let r;
  try { r = new Renderer(canvas); }
  catch (e) {
    if (e instanceof WebGLUnavailable) fail('HINODE needs WebGL2, and this browser has it turned off or unsupported.\n\nTry the latest Chrome, Edge or Firefox, and make sure hardware acceleration is enabled in the browser settings.');
    else fail('Could not start the renderer: ' + e.message);
    return;
  }
  const bar = $('boot-bar'), step = $('boot-step');
  const progress = (f, label) => { bar.style.width = Math.round(f * 100) + '%'; step.textContent = label; };

  const world = await buildNeighborhood(r, progress);
  const input = new Input(canvas);
  const cam = new CameraRig(world.spawnYaw);
  const player = new Player(r, world.spawn, world.spawnYaw - Math.PI);

  // ---- Delivery game -------------------------------------------------------
  const clock = new Clock(), career = new Career();
  const jobs = new Jobs({ world, clock, career });
  const interact = new Interact(world, jobs);
  const npcs = new Npcs(r, world);
  let talkWith = null; // the resident you're chatting with; you can keep walking while you talk
  const talk = new Talk(document.body, { onClose: () => { talkWith = null; } });
  const car = new Car(r, world, { at: [1.6, -9, Math.PI] });
  const traffic = new Traffic(r, world);
  const crowd = new Crowd(r, world); traffic.crowd = crowd;
  const audio = new GameAudio();
  const weather = new Weather();
  if (params.get('weather')) weather.force(params.get('weather')); // ?weather=rain | storm | clear
  const cine = new Cinematic(world);
  const openTalk = (n) => {
    const cv = npcs.conversation(n, { clock, career, jobs, open: jobs.board().length });
    talkWith = n;
    talk.start(cv.who, cv.node);
  };
  const markers = new Markers(r);
  const hud = new Hud($('hud'), { jobs, career, clock });
  const touch = new TouchControls(document.body, input, { hint: $('hint'), force: params.has('touch') });
  const store = new SaveStore(browserStorage());
  const settings = loadSettings(store.s);
  if (touch.on && !hasSavedSettings(store.s)) settings.quality = 'medium'; // phones start on a preset they can hold
  let padui = null, padnav = null;
  const applySetting = (k, v) => {
    if (k === 'sens') cam.sens = v;
    else if (k === 'invertY') cam.invertY = v;
    else if (k === 'reduceMotion') { cam.reduceMotion = v; document.body.classList.toggle('reduce-motion', v); }
    else if (k === 'showFps') $('fps').hidden = !v;
    else if (k === 'fpv') { cam.fpv = !!v; cam.focus = null; cam.eyeY = null; }
    else if (k === 'quality') r.setQuality(v);
    else if (k === 'res') r.resMul = +v || 1;
    else if (k === 'padSens') input.padSens = +v || 1;
    else if (k === 'padInvertY') input.padInvertY = !!v;
    else if (k === 'padDead') input.padDead = +v || 0.15;
    else if (k === 'padVibe') input.padVibe = !!v;
    else if (k === 'padPrompts') { input.padPrompts = v || 'auto'; if (padui) padui.refresh(); }
    else if (k === 'volume') audio.setVolume(v);
    else if (k === 'fov') { cam.fov = v * Math.PI / 180; if (car.baseFov != null) car.baseFov = cam.fov; }
    saveSettings(store.s, settings);
  };
  for (const k of Object.keys(settings)) applySetting(k, settings[k]);
  const ui = { mode: TEST && !params.has('title') ? 'play' : 'title', saved: 0, dirty: false, autosave: 0 };

  const setMode = (m, data) => {
    board.hide(); journal.hide(); summary.hide(); menu.hide(); talk.hide(); talkWith = null;
    if (m !== 'play') touch.reset();
    car.hud.el.hidden = !(m === 'play' && car.driving);
    if (m === 'title') { if (!cine.active) cine.start(weather); }
    else if (cine.active) cine.stop(weather, params.get('weather'));
    ui.mode = m;
    document.body.classList.toggle('at-title', m === 'title');
    input.clear();
    input.enabled = m === 'play';
    if (m !== 'play') input.releaseLock();
    else { if (document.activeElement && document.activeElement !== canvas) document.activeElement.blur(); canvas.focus({ preventScroll: true }); }
    if (m === 'board') board.show();
    else if (m === 'journal') journal.show();
    else if (m === 'summary') summary.show(data);
    else if (m === 'title' || m === 'pause') menu.show(m, data);
    document.body.classList.toggle('in-menu', m !== 'play');
  };
  const endDay = () => setMode('summary', jobs.endDay());
  const board = new Board(document.body, { jobs, clock, onClose: () => setMode('play'), onEndDay: endDay });
  const journal = new Journal(document.body, { jobs, career, clock, onClose: () => setMode('play') });
  const summary = new Summary(document.body, {
    onNext: () => {
      jobs.nextDay();
      player.teleport(world.spawn[0], world.spawn[1], world.spawn[2], world.spawnYaw - Math.PI);
      cam.yaw = world.spawnYaw;
      setMode('play');
      doSave();
      hud.toast(`Day ${clock.day}`, 'A new morning in Aoshima. Fresh slips are on the board.', '', 5000);
    },
  });

  // ---- Saving ----------------------------------------------------------------
  // Never saves on the title screen or mid-summary (the clock is past closing time there).
  const doSave = () => {
    if (ui.mode === 'title' || ui.mode === 'summary') return false;
    const ok = store.save(snapshot({ clock, career, jobs, player }));
    if (ok) { ui.saved = Date.now(); ui.dirty = false; ui.autosave = 0; }
    return ok;
  };
  const toDepot = () => { player.teleport(world.spawn[0], world.spawn[1], world.spawn[2], world.spawnYaw - Math.PI); cam.yaw = world.spawnYaw; cam.focus = null; };
  const startToast = () => hud.toast('日の出配送 · Hinode Delivery', "Chiyo's old depot is yours now. The delivery board is on the wall by the shutter.", '', 8000);
  const menu = new Menu(document.body, {
    settings, onSetting: applySetting,
    actions: {
      continue: () => {
        const L = store.load();
        if (!L.data) { menu.show('title', { save: null, note: 'That save could not be read. Start a new game instead.', noteKind: 'bad' }); return; }
        apply(L.data, { clock, career, jobs, player });
        cam.yaw = player.yaw + Math.PI; cam.focus = null;
        setMode('play');
        hud.toast(`Welcome back · Day ${clock.day}`, `${clock.fmt()} in Aoshima. Everything is where you left it.`, '', 5000);
      },
      newGame: () => { setMode('play'); doSave(); setTimeout(startToast, 500); },   // the old save becomes the backup
      resume: () => setMode('play'),
      save: () => doSave(),
      depot: () => { toDepot(); setMode('play'); },
      quit: () => { doSave(); location.reload(); },
    },
  });
  jobs.on((type) => audio.event(type));
  menu.sfx = (k) => audio.ui(k);
  jobs.on((type) => { if (type === 'accepted' || type === 'collected' || type === 'delivered' || type === 'failed' || type === 'cancelled') ui.dirty = true; });
  addEventListener('pagehide', () => doSave());
  document.addEventListener('visibilitychange', () => { if (document.hidden) doSave(); });

  jobs.on((type, d) => {
    if (type === 'accepted') hud.toast(`Accepted · ${d.job.title}`, d.job.from === 'depot' ? 'Pick it up at the depot counter.' : `Pick it up from ${jobs.place(d.job.from).short}.`);
    else if (type === 'collected') hud.toast(d.jobs.length > 1 ? `Collected ${d.jobs.length} packages` : `Collected · ${d.jobs[0].item}`, `Now take it to ${jobs.place(d.jobs[0].to).short}.`, 'good');
    else if (type === 'delivered') {
      const tags = [d.quick && 'Quick bonus', d.late && 'Late', d.kind === 'fragile' && d.condition < 1 && `Condition ${Math.round(d.condition * 100)}%`].filter(Boolean).join(' · ');
      const said = d.job.to.startsWith('lot:') ? `${d.to}: \u201c${d.line}\u201d` : d.line;
      hud.toast(`Delivered · +${yen(d.pay)} · +${d.xp} XP`, said + (tags ? `  (${tags})` : ''), 'big', 7000);
      for (const L of d.levelUps) hud.toast(`Level ${L}`, 'More of the town trusts you with their parcels.', 'level', 5000);
    }
    else if (type === 'late') hud.toast(`Running late · ${d.job.title}`, 'You can still deliver it, for less pay.', 'warn');
    else if (type === 'failed' && d.why === 'expired') hud.toast(`Lost · ${d.title}`, 'Too late. The customer gave up on it. (-3 trust)', 'bad', 5500);
    else if (type === 'damaged') hud.toast(`Careful! ${d.job.item}`, `Condition ${Math.round(d.condition * 100)}%`, 'bad', 2600);
    else if (type === 'refused') hud.toast("Can't take that", d.reason, 'warn', 2600);
    else if (type === 'cancelled') hud.toast(`Dropped · ${d.job.title}`, d.carried ? 'Returned to the board. (-1 trust)' : 'Back on the board.', '', 3000);
  });

  // Pre-render the city before the loading screen goes. Every chunk, the car, traffic, crowd and the rain are drawn
  // from three angles at noon, night and dusk (rain on the night pass), so the GPU driver compiles every shader
  // variant and uploads every mesh and texture now, instead of stalling the first time something comes into view.
  const PREWARM = { done: false, passes: 0, ms: 0 };
  {
    const t0 = performance.now(), passes = TEST ? 1 : 3;
    const p0 = Array.from(cam.pos), q0 = Array.from(cam.target), rain0 = ENV.rain;
    for (let i = 0; i < passes; i++) {
      progress(1, `Pre-rendering the city ${i + 1}/${passes}`);
      const a = i * 2.1;
      cam.pos[0] = p0[0]; cam.pos[1] = 30; cam.pos[2] = p0[2];
      cam.target[0] = p0[0] + Math.sin(a) * 40; cam.target[1] = 4; cam.target[2] = p0[2] + Math.cos(a) * 40;
      applyTimeOfDay(ENV, [720, 1260, 1020][i]);
      weather.apply(ENV);
      ENV.rain = i === 1 ? 0.7 : 0;
      ENV.lampColBuf = ENV.lampColBuf || new Float32Array(48);
      ENV.lampBuf = nearestLamps(world.lamps, cam.target, ENV.lampBuf, ENV.lampColBuf, ENV.lampCol);
      ENV.time = i;
      r.begin(cam, ENV);
      for (const c of world.chunks) r.draw(c.mesh);
      try { npcs.draw(r, cam, 0); car.draw(r, cam, 0, ENV); traffic.draw(r, cam); crowd.draw(r, cam); player.draw(r, 0); } catch (_) { /* a prop that is not ready yet is fine */ }
      r.end();
      PREWARM.passes++;
      await new Promise((res) => { let ok = false; const go = () => { if (!ok) { ok = true; res(); } }; requestAnimationFrame(go); setTimeout(go, 120); });
    }
    for (let k = 0; k < 3; k++) { cam.pos[k] = p0[k]; cam.target[k] = q0[k]; }
    ENV.rain = rain0;
    PREWARM.done = true; PREWARM.ms = Math.round(performance.now() - t0);
  }

  $('boot').classList.add('out');
  setTimeout(() => { $('boot').hidden = true; }, 700);
  $('hud').hidden = false;
  const hint = $('hint'), fps = $('fps');
  let hintTimer = 0, moved = 0;
  padui = new PadUI({ input, hint, hud, talk });
  padnav = new PadNav(input);
  menu.padInfo = () => input.padInfo;
  const PADN = { xbox: 'Xbox controller', ps5: 'DualSense (PS5)', ps4: 'DualShock 4 (PS4)', generic: 'Controller' };
  input.onDevice = (why) => {
    if (padui.refresh()) { hint.classList.remove('fade'); hintTimer = 0; moved = 0; }
    if (why === 'connected') hud.toast('Controller connected', `${PADN[input.padInfo.kind] || 'Controller'} ready. Tune it in Settings, Controller.`, '', 3200);
    else if (why === 'disconnected') hud.toast('Controller disconnected', 'Back to keyboard and mouse.', 'warn', 2400);
    if (why !== 'device' && menu.screen === 'settings' && menu.tab === 'pad') menu.render();
  };
  if (ui.mode === 'title') {
    const L = store.load(), info = { save: L.data ? describe(L.data) : null };
    if (L.status === 'recovered') { info.note = 'Your last save was damaged, so the backup from just before it was loaded instead.'; info.noteKind = 'bad'; }
    else if (L.status === 'corrupt') { info.note = `Your save could not be read (${L.why}). A copy is kept aside.`; info.noteKind = 'bad'; }
    if (!store.available) { info.note = 'This browser is blocking storage, so progress cannot be saved.'; info.noteKind = 'bad'; }
    setMode('title', info);
  } else setTimeout(startToast, 900);

  const state = { frames: 0, dt: 0, avg: 16.7, visible: 0, paused: false };
  const tick = (dt) => {
    input.menuOpen = ui.mode !== 'play';
    input.uiOpen = input.menuOpen || !!talk.open;
    input.pollPad();
    if (padnav) padnav.update();
    weather.update(dt, clock);
    if (ui.mode === 'play') {
      clock.update(dt);
      jobs.update();
      if (clock.min >= DAY_END) { endDay(); input.endFrame(); return; }
      player.speedMul = jobs.speedMul();
      player.carry = jobs.carried().map((j) => j.kind);
      if (car.driving && Math.hypot(player.pos[0] - car.x, player.pos[2] - car.z) > 3) car.exit(player, cam, true); // moved by new day / load
      if (car.driving) {
        car.camAssist(cam, input, dt);
        car.update(dt, input, traffic.obstacles(npcs));
        if (car.impact > 2) jobs.impact(car.impact * 0.6);
        player.pos[0] = car.x; player.pos[1] = 0; player.pos[2] = car.z; player.vel.fill(0);
      } else {
        player.update(dt, input, cam.yaw, world);
        if (player.impact) jobs.impact(player.impact);
        car.update(dt, input, traffic.obstacles(npcs));
        for (const o of [-1.4, 0, 1.4]) { // can't walk through the parked car
          const cx = car.x + Math.sin(car.yaw) * o, cz = car.z + Math.cos(car.yaw) * o;
          const ex = player.pos[0] - cx, ez = player.pos[2] - cz, e = Math.hypot(ex, ez);
          if (e < 1.25 && e > 1e-4) { player.pos[0] = cx + (ex / e) * 1.25; player.pos[2] = cz + (ez / e) * 1.25; }
        }
      }
      traffic.update(dt, car, player);
      crowd.update(dt, player, car, weather);
      npcs.update(dt, player, clock);
      // Conversations are an overlay: keep walking and looking while you talk. Walk off and it ends.
      const talking = talk.open;
      if (talking) {
        talk.update(dt, input);
        if (talkWith && (!talkWith.out || Math.hypot(player.pos[0] - talkWith.x, player.pos[2] - talkWith.z) > 7)) {
          const who = talkWith.c.name; talk.close(); hud.toast('Conversation over', `You walked away from ${who}.`, '', 1500);
        }
      }
      let p;
      if (car.driving) p = interact.current = car.exitPrompt(() => car.exit(player, cam));
      else {
        p = interact.probe(player.pos[0], player.pos[2]);
        if (!p || p.passive) { const tp = npcs.probe(player.pos[0], player.pos[2], openTalk); if (tp) p = interact.current = tp; }
        if (!p || p.passive) { const cp = car.probe(player.pos[0], player.pos[2], () => car.enter(player, cam)); if (cp) p = interact.current = cp; }
      }
      if (talking) p = interact.current = null;
      else if (p && input.hit('KeyE')) { if (p.board) setMode('board'); else if (p.act) p.act(); }
      else if (input.hit('Tab')) setMode('journal');
      else if ((input.tap('Escape') && !input.locked) || input.hit('KeyP')) setMode('pause', { saved: ui.saved });
      if (ui.mode === 'play' && input.hit('KeyV')) {
        settings.fpv = !settings.fpv; applySetting('fpv', settings.fpv);
        hud.toast(settings.fpv ? 'First-person view' : 'Third-person view', 'Press V to switch.', '', 1600);
      }
      touch.update(p, talk.open, car.driving);
      if (ui.mode === 'play') cam.update(dt, input, car.driving ? car.camTarget : player, world.collision, car.driving ? car : null);
      ui.autosave += dt;
      if (ui.mode === 'play' && ((ui.dirty && ui.autosave > 1.5) || ui.autosave > 30)) doSave();
    } else if (ui.mode === 'talk') { talk.update(dt, input); npcs.update(dt, player, clock); }
    else if (ui.mode === 'board') { if (input.tap('Escape') || input.tap('KeyE')) setMode('play'); }
    else if (ui.mode === 'journal') { if (input.tap('Escape') || input.tap('Tab')) setMode('play'); }
    else if (ui.mode === 'pause') { if (input.tap('Escape') && menu.screen === 'pause') setMode('play'); }
    else if (ui.mode === 'title') cine.update(dt, cam, weather, menu, settings.reduceMotion);
    // Esc / B / Circle on a sub-screen (Settings, About) goes back one level, from the title as well.
    if ((ui.mode === 'pause' || ui.mode === 'title') && menu.screen && menu.screen !== ui.mode && input.tap('Escape')) {
      const back = menu.list && menu.list.querySelector('[data-act="back"]'); if (back) back.click();
    }
    input.endFrame();
  };

  // What the HUD arrow and the 3D markers point at.
  const goals = () => {
    const tr = jobs.tracked();
    const marks = jobs.targets().map((k) => ({ x: k.x, z: k.z, kind: k.verb, main: !!tr && k.job.id === tr.job.id }));
    let way = tr ? { x: tr.x, z: tr.z, label: `${tr.verb} · ${tr.place.short}` } : null;
    if (!marks.length && jobs.board().length) {
      const [bx, bz] = world.depot.board;
      marks.push({ x: bx, z: bz, kind: 'board', main: true });
      way = { x: bx, z: bz, label: 'Delivery board' };
    }
    return { marks, way };
  };

  // Test hook: tests pause the live loop and advance the simulation in exact 1/60 s steps,
  // so results don't depend on how fast the (software) test GPU renders.
  if (TEST) window.__HINODE__ = { touch, crowd, audio,
    weather, cine,
    r, world, input, cam, player, state, env: ENV, padnav, padui, prewarm: PREWARM, npcs, talk, car, traffic, clock, career, jobs, interact, hud, board, journal, summary, goals,
    ui: { get mode() { return ui.mode; }, setMode, endDay }, menu, store, save: doSave, settings,
    sim(sec, step = 1 / 60) { const n = Math.max(1, Math.round(sec / step)); for (let i = 0; i < n; i++) tick(step); return [...player.pos]; },
  };

  let last = performance.now(), t = 0;
  const frame = (now) => {
    if (dead) return;
    try {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now; t += dt;
      state.dt = dt; state.avg += (dt * 1000 - state.avg) * 0.05;
      if (input.hit('F3')) fps.hidden = !fps.hidden;
      if (input.hit('Escape')) input.releaseLock();
      if (!state.paused) tick(dt);
      if (ui.mode === 'play' && car.driving && car.impact > 1.2 && input.rumble) input.rumble(Math.min(1, car.impact / 8), Math.min(1, car.impact / 5), 160 + Math.min(240, car.impact * 25));
      audio.update(dt, { car, player, input, weather, clock, crowd, mode: ui.mode, paused: state.paused });

      applyTimeOfDay(ENV, ui.mode === 'title' && cine.active ? cine.min : clock.min);
      weather.apply(ENV);
      ENV.lampColBuf = ENV.lampColBuf || new Float32Array(48);
      ENV.lampBuf = nearestLamps(world.lamps, cam.target, ENV.lampBuf, ENV.lampColBuf, ENV.lampCol);
      ENV.time = t;
      r.begin(cam, ENV);
      // Cheap culling: skip chunks far away or well behind the camera.
      const fx = cam.target[0] - cam.pos[0], fz = cam.target[2] - cam.pos[2], fl = Math.hypot(fx, fz) || 1;
      let vis = 0;
      for (const c of world.chunks) {
        if (!c.far) {
          const dx = c.x - cam.pos[0], dz = c.z - cam.pos[2], d = Math.hypot(dx, dz);
          // 29 m = half-diagonal of a 40 m chunk: keep every chunk that reaches into draw range, and only skip ones that
          // sit entirely behind the camera, with room left for the shadows they cast forward (the old skip was the pop-in).
          if (d - 29 > r.drawDist) continue;
          if ((dx * fx + dz * fz) / fl < -89) continue;
        }
        r.draw(c.mesh); vis++;
      }
      const g = goals();
      markers.draw(r, g.marks, t);
      npcs.draw(r, cam, t);
      car.draw(r, cam, t, ENV);
      traffic.draw(r, cam);
      crowd.draw(r, cam);
      if (cam.distNow > 0.55 && !car.driving) player.draw(r, t); // hide the rider when the camera is squeezed into their head
      r.end();
      state.visible = vis;
      hud.update({ prompt: ui.mode === 'play' ? interact.current : null, target: ui.mode === 'play' ? g.way : null, player: player.pos, vp: r.vp });

      moved += player.speed * dt;
      if (moved > 25 && !hint.classList.contains('fade')) { hintTimer += dt; if (hintTimer > 4) hint.classList.add('fade'); }
      if (!fps.hidden && state.frames % 15 === 0) fps.textContent = `${(1000 / state.avg).toFixed(0)} fps${r.gpuMs ? ` · GPU ${r.gpuMs.toFixed(2)} ms ≈ ${Math.round(1000 / r.gpuMs)} fps max` : ''} · ${r.stats.draws} draws · ${(r.stats.tris / 1000).toFixed(0)}k tris`;
      state.frames++;
    } catch (e) {
      fail('The game hit an error and stopped: ' + e.message);
      return;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

boot().catch((e) => fail('Loading failed: ' + e.message));
