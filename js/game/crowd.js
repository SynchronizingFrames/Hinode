// Shinjuku crowds (M3-final): people on every pavement, a trickle through Omoide Yokocho, and the big scramble
// crossing at Kabukicho Ichiban-gai x Yasukuni-dori. The signal stops every car, then everyone crosses at once,
// diagonals included. Walkers slide around poles and stalls through the collision grid, wait for the player,
// open umbrellas in the rain, and far away they collapse to a single cheap mesh.
import { Builder, hex } from '../engine/geometry.js';
import { mat4, poseMatrix, multiply, rng, damp, dampAngle } from '../engine/math.js';
import { buildPerson } from './npcs.js';

export const CYCLE = 46, CAR_GO = 24, WALK0 = 27, WALK1 = 43;   // scramble signal cycle (seconds)
export const SC = [206, 0];
const HX = 7.9, HZ = 8.9;
const CORNER = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => ({ x: SC[0] + a * HX, z: SC[1] + b * HZ, ox: a, oz: b }));
const DRAW_R = 85, FULL_R = 34, BODY_R = 0.5;
const CAP = { low: 28, medium: 48, high: 72, ultra: 170 };
const DENSITY = 1 / 13;      // walkers per metre of pavement
const SCRAMBLE_N = 22;

const TOPS = ['#f0efe9', '#e9e4da', '#2c2f36', '#5b2730', '#c8b79b', '#3d5670', '#6e6250', '#121214', '#8b3a57', '#2f4a3a', '#b8b3aa', '#d36b2c', '#7d8a96', '#e3c9c0'];
const BOTS = ['#1b1f27', '#26282d', '#3a3f49', '#54493b', '#151517', '#6c6961', '#2b3550', '#8a7f6c'];
const SKIN = ['#efd0b1', '#e6c19e', '#d8aa84', '#c7926b'];
const HAIR = ['#121010', '#1b1714', '#2a2019', '#3d2d21', '#5a412c', '#8c8782', '#6e5a8a', '#b08a5a'];
const UMB = ['#d9dee2', '#d9dee2', '#d9dee2', '#1b1d22', '#2b3a66', '#7a2d2d'];   // mostly clear vinyl, Tokyo style

function lookOf(R) {
  const suit = R() < 0.32;
  const L = {
    top: suit ? R.pick(['#1d2330', '#23262d', '#2c2f36', '#121214', '#3a3d44']) : R.pick(TOPS),
    bottom: suit ? R.pick(['#1b1f27', '#26282d', '#151517']) : R.pick(BOTS),
    skin: R.pick(SKIN), hair: R.pick(HAIR), h: R.range(0.9, 1.05),
  };
  if (suit) { L.collar = '#eeeeea'; if (R() < 0.8) L.tie = R.pick(['#5b2730', '#2b3a66', '#3d3d3d', '#6a5a2a']); }
  else if (R() < 0.15) L.scarf = R.pick(['#c9b28a', '#8b3a57', '#3d5670']);
  const hr = R();
  if (hr < 0.14) { L.hat = 'cap'; L.cap = R.pick(['#1b1b1d', '#e9e4da', '#3d5670', '#7a2d2d']); }
  else if (hr < 0.2) L.hat = 'bucket';
  else if (hr < 0.3) L.hat = 'bun';
  if (R() < 0.22) L.glasses = true;
  return L;
}

// one-draw stand-in for far walkers (same proportions as buildPerson, limbs straight)
function personLo(L) {
  const b = new Builder(), top = hex(L.top), bot = hex(L.bottom), skin = hex(L.skin), hair = hex(L.hair), shoe = hex('#3b342e');
  for (const x of [-0.1, 0.1]) { b.box(x, 0.12, 0, 0.15, 0.72, 0.17, bot, { ao: 1 }); b.box(x, 0.04, 0.03, 0.16, 0.09, 0.26, shoe, { ao: 1 }); }
  b.box(0, 0.84, 0, 0.36, 0.2, 0.22, bot, { ao: 1 });
  b.box(0, 0.96, 0, 0.42, 0.56, 0.25, top, { ao: 0.9 });
  for (const x of [-0.29, 0.29]) { b.box(x, 0.92, 0, 0.12, 0.56, 0.13, top, { ao: 1 }); b.box(x, 0.82, 0, 0.1, 0.1, 0.1, skin, { ao: 1 }); }
  b.box(0, 1.52, 0, 0.12, 0.08, 0.12, skin, { ao: 1 });
  b.blob(0, 1.72, 0, 0.15, skin, 1.1, 6);
  b.blob(0, 1.77, -0.02, 0.155, hair, 0.9, 6);
  return b;
}

function umbrella(col) {
  const b = new Builder(), c = hex(col);
  b.cyl(0, 0, 0, 0.54, 0.18, c, 14, 0, 0.05);
  b.cyl(0, 0.17, 0, 0.02, 0.06, hex('#9a9da2'), 6);
  b.box(0, -0.7, 0, 0.022, 0.72, 0.022, hex('#9a9da2'), { ao: 1 });
  b.box(0, -0.78, 0.03, 0.03, 0.09, 0.08, hex('#2a2a2a'), { ao: 1 });
  return b;
}

// pavement centre-lines (sidewalk strip is 3.2 m wide, lane sits 1.6 m in from the road edge)
function pavements() {
  const L = [];
  const xRoads = [[0, 14], [-52, 8], [52, 8]], zRoads = [[146, 10], [206, 12]];
  const xs = [[118.3, 140.2], [151.8, 199.2], [212.8, 257.2]], zs = [[-95.7, -56.8], [-47.2, -7.8], [7.8, 47.2], [56.8, 95.7]];
  for (const [c, w] of xRoads) for (const s of [-1, 1]) for (const [a, b] of xs) L.push({ axis: 'x', c: c + s * (w / 2 + 1.6), a, b, wide: 0.55 });
  for (const [c, w] of zRoads) for (const s of [-1, 1]) for (const [a, b] of zs) L.push({ axis: 'z', c: c + s * (w / 2 + 1.6), a, b, wide: 0.55 });
  L.push({ axis: 'z', c: 125.15, a: -43.5, b: -11.5, wide: 0.15, alley: true });   // Omoide Yokocho
  return L;
}

export class Crowd {
  constructor(r, world) {
    this.r = r; this.col = world.collision;
    this.root = mat4(); this.local = mat4(); this.m = mat4();
    this.tmp = { x: 0, z: 0, hit: false };
    this.t = 0; this.rain = 0;
    this.signal = { walk: false, stopCars: false, phase: 0 };
    this.red = false; this.walk = false;
    this.crossing = []; this.near = [];
    const R = rng(8642);
    this.looks = [];
    for (let i = 0; i < 14; i++) {
      const L = lookOf(R), P = buildPerson(L);
      this.looks.push({ L, s: L.h || 1, hips: r.mesh(P.hips), torso: r.mesh(P.torso), head: r.mesh(P.head), leg: r.mesh(P.leg), arm: r.mesh(P.arm), lo: r.mesh(personLo(L)) });
    }
    this.umbs = UMB.map((c) => r.mesh(umbrella(c)));
    const sh = new Builder(); sh.cyl(0, 0.012, 0, 0.36, 0.005, [0.02, 0.02, 0.025], 12);
    this.shadow = r.mesh(sh);
    this.lanes = pavements();
    this.list = [];
    for (const lane of this.lanes) {
      const n = Math.max(1, Math.round((lane.b - lane.a) * DENSITY * (lane.alley ? 0.6 : 1)));
      for (let i = 0; i < n; i++) {
        const t = R.range(lane.a, lane.b), dir = R() < 0.5 ? -1 : 1, off = R.range(-lane.wide, lane.wide);
        const x = lane.axis === 'x' ? t : lane.c + off, z = lane.axis === 'x' ? lane.c + off : t;
        this.list.push(this.person(R, { mode: 'lane', lane, t, dir, off, x, z, v: R.range(1.05, 1.55) }));
      }
    }
    for (let i = 0; i < SCRAMBLE_N; i++) {
      const k = i % 4, c = CORNER[k], jx = R.range(0.2, 1.6), jz = R.range(0.2, 1.6);
      this.list.push(this.person(R, { mode: 'sc', k, x: c.x + c.ox * jx, z: c.z + c.oz * jz, v: R.range(1.55, 2.05), state: 'wait' }));
    }
    for (const w of this.list) w.yaw = w.mode === 'lane' ? (w.lane.axis === 'x' ? (w.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (w.dir > 0 ? 0 : Math.PI)) : Math.atan2(SC[0] - w.x, SC[1] - w.z);
    this.count = this.list.length;
  }

  person(R, o) {
    const look = R.int ? R.int(0, this.looks.length - 1) : Math.floor(R() * this.looks.length);
    return Object.assign({ look: Math.min(this.looks.length - 1, look), y: 0.15, yaw: 0, spd: 0, phase: R() * 6.28, pause: 0, umb: R() < 0.7 ? Math.floor(R() * this.umbs.length) : -1, stuck: 0, lx: o.x, lz: o.z, delay: 0, inRoad: false, dist: 0 }, o);
  }

  phaseInfo() {
    const p = ((this.t % CYCLE) + CYCLE) % CYCLE;
    return { p, red: p >= CAR_GO, walk: p >= WALK0 && p < WALK1 };
  }

  update(dt, player, car, weather) {
    if (dt <= 0) return;
    const was = this.walk;
    this.t += dt;
    const S = this.phaseInfo();
    this.red = S.red; this.walk = S.walk;
    this.signal.walk = S.walk; this.signal.stopCars = S.red; this.signal.phase = S.p;
    this.rain = weather ? weather.rain : 0;
    const px = player.pos[0], pz = player.pos[2], drive = !!(car && car.driving);
    const lx = drive ? car.x : px, lz = drive ? car.z : pz;
    if (S.walk && !was) {   // the lights change: everybody waiting picks a corner and goes
      for (const w of this.list) if (w.mode === 'sc' && w.state === 'wait') {
        w.delay = Math.random() * 2.6;
        w.k2 = (w.k + 1 + Math.floor(Math.random() * 3)) % 4;
        w.go = true;
      }
    }
    this.crossing.length = 0; this.near.length = 0;
    const far = lx < 30;   // standing deep in the home town: Tokyo is out of sight, keep walkers idle (signal still runs)
    for (const w of this.list) {
      if (!far) w.mode === 'lane' ? this.walkLane(w, dt, px, pz, drive, car) : this.walkScramble(w, dt, S, px, pz, drive, car);
      if (w.inRoad) this.crossing.push(w);
      if (car && Math.abs(w.x - car.x) < 30 && Math.abs(w.z - car.z) < 30) this.near.push(w);
      // nobody walks through the player
      if (!drive) {
        const dx = px - w.x, dz = pz - w.z, d = Math.hypot(dx, dz);
        if (d < BODY_R && d > 1e-4 && Math.abs(player.pos[1] - w.y) < 1.2) { const k = (BODY_R - d) / d; player.pos[0] += dx * k; player.pos[2] += dz * k; }
      }
    }
  }

  yieldTo(w, x, z, gap) {   // speed cap so a walker stops short of something in front
    const sy = Math.sin(w.yaw), cy = Math.cos(w.yaw), rx = x - w.x, rz = z - w.z;
    const f = rx * sy + rz * cy, lat = Math.abs(rx * cy - rz * sy);
    return f > 0 && f < gap && lat < 0.75 ? Math.max(0, f - 0.9) * 1.6 : Infinity;
  }

  steer(w, tx, tz, want, dt, px, pz, drive, car) {
    let cap = want;
    if (!drive) cap = Math.min(cap, this.yieldTo(w, px, pz, 2.2));
    else if (car) cap = Math.min(cap, this.yieldTo(w, car.x, car.z, 3.6));
    w.spd = damp(w.spd, cap, 5, dt);
    const dx = tx - w.x, dz = tz - w.z, d = Math.hypot(dx, dz);
    if (d > 1e-3) {
      const st = Math.min(d, w.spd * dt);
      w.x += dx / d * st; w.z += dz / d * st;
      if (w.spd > 0.2) w.yaw = dampAngle(w.yaw, Math.atan2(dx, dz), 7, dt);
    }
    const o = this.col.resolve([w.x, w.y, w.z], 0.28, w.y, 1.6, this.tmp);
    w.x = o.x; w.z = o.z;
    const g = this.col.groundAt(w.x, w.z, w.y + 0.3, 0.1);
    w.y = damp(w.y, Math.min(0.2, Math.max(0, g)), 14, dt);
    const moved = Math.hypot(w.x - w.lx, w.z - w.lz);
    w.phase += moved / 0.74 * Math.PI; w.dist += moved;
    w.lx = w.x; w.lz = w.z;
    return moved;
  }

  walkLane(w, dt, px, pz, drive, car) {
    const L = w.lane;
    if (w.pause > 0) { w.pause -= dt; w.spd = damp(w.spd, 0, 6, dt); return; }
    const o = w.off + w.dir * 0.35;   // two-way pavement: each direction keeps to its own side
    const ahead = Math.min(L.b, Math.max(L.a, (L.axis === 'x' ? w.x : w.z) + w.dir * 1.6));
    const tx = L.axis === 'x' ? ahead : L.c + o, tz = L.axis === 'x' ? L.c + o : ahead;
    const moved = this.steer(w, tx, tz, w.v, dt, px, pz, drive, car);
    const t = L.axis === 'x' ? w.x : w.z;
    w.stuck = moved < w.v * dt * 0.15 ? w.stuck + dt : 0;
    if ((w.dir > 0 && t >= L.b - 0.3) || (w.dir < 0 && t <= L.a + 0.3) || w.stuck > 2.5) {
      w.dir = -w.dir; w.stuck = 0;
      w.pause = Math.random() < 0.5 ? 0.3 + Math.random() * 2.5 : 0;   // some stop to check their phone
    }
  }

  walkScramble(w, dt, S, px, pz, drive, car) {
    if (w.state === 'wait') {
      w.inRoad = false;
      w.spd = damp(w.spd, 0, 6, dt);
      w.yaw = dampAngle(w.yaw, Math.atan2(SC[0] - w.x, SC[1] - w.z), 2, dt);
      if (w.go && S.walk) {
        w.delay -= dt;
        if (w.delay <= 0 && S.p < WALK1 - 9) {   // don't step out when the green man is about to flash
          const c = CORNER[w.k2];
          w.tx = c.x + c.ox * (0.2 + Math.random() * 1.4); w.tz = c.z + c.oz * (0.2 + Math.random() * 1.4);
          w.state = 'cross'; w.go = false;
        }
      }
      if (!S.walk) w.go = false;
      return;
    }
    w.inRoad = Math.abs(w.x - SC[0]) < HX - 1.3 || Math.abs(w.z - SC[1]) < HZ - 1.3;
    const hurry = S.walk ? w.v : w.v * 1.35;   // flashing / red: jog the rest of the way
    this.steer(w, w.tx, w.tz, hurry, dt, px, pz, drive, car);
    if (Math.hypot(w.tx - w.x, w.tz - w.z) < 0.35) { w.state = 'wait'; w.k = w.k2; w.inRoad = false; }
  }

  draw(r, cam) {
    const cx = cam.pos[0], cz = cam.pos[2];
    if (cx < 118.3 - DRAW_R) return;   // west of here every pavement is out of draw range
    const cap = CAP[r.quality] || 72, vis = [];
    for (const w of this.list) {
      const dx = w.x - cx, dz = w.z - cz, d2 = dx * dx + dz * dz;
      if (d2 < DRAW_R * DRAW_R) { w.d2 = d2; vis.push(w); }
    }
    if (vis.length > cap) { vis.sort((a, b) => a.d2 - b.d2); vis.length = cap; }
    const rainy = this.rain > 0.15;
    const L = (mesh, x, y, z, pitch, roll = 0, yaw = 0) => { poseMatrix(this.local, x, y, z, yaw, 1, pitch, roll); r.draw(mesh, multiply(this.m, this.root, this.local)); };
    for (const w of vis) {
      const M = this.looks[w.look], s = M.s, umb = rainy && w.umb >= 0;
      const sp = Math.min(1, w.spd / 1.4), sw = Math.sin(w.phase) * 0.5 * sp, bob = Math.abs(Math.cos(w.phase)) * 0.028 * sp;
      if (w.d2 > FULL_R * FULL_R) {
        poseMatrix(this.m, w.x, w.y + bob, w.z, w.yaw, s);
        r.draw(M.lo, this.m, false);
      } else {
        poseMatrix(this.m, w.x, w.y + 0.002, w.z, 0, s * (1 - bob));
        r.draw(this.shadow, this.m, false);
        poseMatrix(this.root, w.x, w.y + 0.9 * s + bob, w.z, w.yaw, s);
        // Gait: the swing foot lifts, the pelvis twists and drops with the stride, shoulders counter-rotate,
        // the head stays level. Standing still (waiting at a crossing) they shift weight and look around.
        const cp = Math.cos(w.phase), liftL = 0.045 * sp * Math.max(0, -cp), liftR = 0.045 * sp * Math.max(0, cp);
        const idle = 1 - sp, seed = w.look * 1.7 + w.lx * 0.13, now = performance.now() * 0.001;
        const ws = idle * Math.sin(now * 0.41 + seed), pr = -0.04 * cp * sp + 0.03 * ws, ty = 0.18 * sw, az = 0.29 * Math.sin(ty);
        L(M.hips, 0.02 * ws, -0.06, 0, 0, pr, -0.14 * sw);
        L(M.torso, 0.01 * ws, 0.06, 0, 0.04 * sp + 0.03 * sp * sp, -0.6 * pr, ty);
        L(M.head, 0.008 * ws, 0.62, 0, w.state === 'wait' ? -0.05 : 0.03, 0, idle * 0.3 * Math.sin(now * 0.23 + seed * 2));
        L(M.leg, -0.1 + 0.02 * ws, liftL, 0, sw - 0.06 * Math.max(0, ws), -0.023 * ws);
        L(M.leg, 0.1 + 0.02 * ws, liftR, 0, -sw - 0.06 * Math.max(0, -ws), -0.023 * ws);
        L(M.arm, -0.29 + 0.01 * ws, 0.58, az, -sw * 0.75, 0.06 - 0.6 * pr, ty);
        L(M.arm, 0.29 + 0.01 * ws, 0.58, -az, umb ? -1.05 : sw * 0.75, -0.06 - 0.6 * pr, ty);
      }
      if (umb) {
        poseMatrix(this.m, w.x + Math.cos(w.yaw) * 0.05 * s, w.y + 2.02 * s + bob, w.z - Math.sin(w.yaw) * 0.05 * s, w.yaw, s, 0.06, 0);
        r.draw(this.umbs[w.umb], this.m, w.d2 < FULL_R * FULL_R);
      }
    }
    this.drawn = vis.length;
  }
}
