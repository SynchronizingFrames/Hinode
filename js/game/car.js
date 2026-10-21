// Your car: arcade handling with weight transfer, grip vs handbrake slides, crash impacts,
// chase camera assist, speed FOV, headlight pool at night and a speedometer.
import { mat4, poseMatrix, damp, dampAngle, clamp } from '../engine/math.js';
import { buildVehicle } from './vehicles.js';

const TOP = 41, REV = 9, ACC = 9.2, BRAKE = 17, WB = 2.7, ENTER_R = 2.9, BODY = [-1.4, 0, 1.4], RAD = 0.9;
const GEARS = [0, 9, 16, 24, 32, 44];

function makeSpeedo() {
  const el = document.createElement('div');
  el.className = 'speedo'; el.hidden = true;
  el.innerHTML = '<div class="gear">N</div><div class="spd"><b>0</b><span>km/h</span></div><div class="rpm"><i></i></div>'
    + '<div class="tips"><kbd>W</kbd><kbd>S</kbd> drive · <kbd>A</kbd><kbd>D</kbd> steer · <kbd>Space</kbd> handbrake · <kbd>E</kbd> get out</div>';
  document.body.appendChild(el);
  return { el, spd: el.querySelector('b'), gear: el.querySelector('.gear'), rpm: el.querySelector('.rpm i') };
}

export class Car {
  constructor(renderer, world, opt = {}) {
    const v = buildVehicle('coupe', opt.paint || '#b3161d', { rim: '#2b2d31' });
    this.spec = v.spec;
    this.mesh = { body: renderer.mesh(v.body), wheel: renderer.mesh(v.wheel), brake: renderer.mesh(v.brake) };
    const lo = buildVehicle('coupe', opt.paint || '#b3161d', { rim: '#2b2d31', lod: 0.3 });
    this.lo = { body: renderer.mesh(lo.body), wheel: renderer.mesh(lo.wheel) };
    this.m = mat4(); this.root = mat4(); this.flat = mat4(); this.local = mat4();
    this.world = world; this.col = world.collision; this.edge = (world.edge || 90) + 1.5;
    const E = this.edge; this.bb = world.bounds || { x0: -E, x1: E, z0: -E, z1: E };
    this.home = opt.at || [1.6, -9, Math.PI];
    this.lamp = [0, 0.9, 0, 0, 0.92, 0.95, 1.0]; if (world.lamps) world.lamps.push(this.lamp);
    this.hud = makeSpeedo();
    this.camTarget = { pos: [0, 0.15, 0] };
    this.tmp = { x: 0, z: 0, hit: false, nx: 0, nz: 0, tag: null };
    this.baseFov = null; this.look = 0; this.shown = '';
    this.reset();
  }

  reset() {
    [this.x, this.z, this.yaw] = this.home;
    this.vx = 0; this.vz = 0; this.yawRate = 0; this.steer = 0; this.spinF = 0; this.spinR = 0;
    this.pitch = 0; this.roll = 0; this.lastVf = 0; this.driving = false; this.braking = false;
    this.impact = 0; this.slip = 0; this.hb = false;
  }

  get speed() { return Math.hypot(this.vx, this.vz); }
  get fwd() { return this.vx * Math.sin(this.yaw) + this.vz * Math.cos(this.yaw); }

  update(dt, input, obstacles = []) {
    this.impact = 0;
    const n = dt > 1 / 45 ? 3 : 1, h = dt / n;
    for (let i = 0; i < n; i++) this.step(h, input, obstacles);
    const vf = this.fwd, acc = (vf - this.lastVf) / Math.max(dt, 1e-4);
    this.lastVf = vf;
    this.pitch = damp(this.pitch, clamp(-acc * 0.0042, -0.045, 0.06), 6, dt);
    this.roll = damp(this.roll, clamp(-this.yawRate * vf * 0.0032, -0.07, 0.07), 5, dt);
    this.spinF += (vf / this.spec.r) * dt;
    if (!this.hb) this.spinR += (vf / this.spec.r) * dt;
    this.camTarget.pos[0] = this.x; this.camTarget.pos[2] = this.z;
    if (this.driving) this.updateHud(vf);
  }

  step(dt, input, obs) {
    const [ax, ay] = this.driving ? input.axes() : [0, 0];
    const hb = this.driving && input.key('Space');
    this.hb = hb;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    let vf = this.vx * sy + this.vz * cy, vs = this.vx * cy - this.vz * sy;
    const sp = Math.abs(vf), thr = Math.max(0, ay), brk = Math.max(0, -ay);

    // Steering: plenty of lock when parking, very little at top speed.
    const lock = 0.62 - 0.46 * clamp(sp / 34, 0, 1);
    this.steer = damp(this.steer, -ax * lock, ax ? 7 : 10, dt);

    let a = 0;
    if (thr) a += vf < -0.4 ? BRAKE * thr : ACC * thr * Math.pow(Math.max(0, 1 - vf / TOP), 0.6);
    if (brk) a -= vf > 0.4 ? BRAKE * brk : 5.5 * brk * Math.max(0, 1 + vf / REV);
    if (hb) a -= Math.sign(vf) * 6.5;
    if (sp > 0.05) a -= vf * sp * 0.0021 + Math.sign(vf) * (thr || brk ? 0.25 : 0.9);
    const before = vf;
    vf += a * dt;
    if ((before > 0 && vf < 0 && !brk) || (before < 0 && vf > 0 && !thr)) vf = 0; // brakes and drag stop the car, they don't reverse it
    if (!thr && !brk && Math.abs(vf) < 0.25) vf = 0;
    this.braking = (brk > 0 && before > 0.4) || (thr > 0 && before < -0.4) || (hb && sp > 0.5);

    // Tyres: lateral grip pulls velocity back in line with the nose. Handbrake lets the rear go.
    const grip = hb ? 1.25 : 7.5 - 2.2 * clamp(sp / TOP, 0, 1) * (thr ? 1 : 0.4);
    vs *= Math.exp(-grip * dt);
    this.slip = Math.abs(vs);
    this.vx = vf * sy + vs * cy; this.vz = vf * cy - vs * sy;

    const yawWant = (vf * Math.tan(this.steer)) / WB * (hb ? 1.55 : 1);
    this.yawRate = damp(this.yawRate, yawWant, hb ? 4 : 9, dt);
    this.yaw += this.yawRate * dt;

    this.x += this.vx * dt; this.z += this.vz * dt;
    this.collide(obs);
  }

  hit(nx, nz, px, pz) {
    this.x += px; this.z += pz;
    const into = this.vx * nx + this.vz * nz;
    if (into < 0) {
      this.vx -= 1.25 * into * nx; this.vz -= 1.25 * into * nz;
      this.vx *= 0.92; this.vz *= 0.92; this.yawRate *= 0.6;
      this.impact = Math.max(this.impact, -into);
    }
  }

  collide(obs) {
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw), t = this.tmp;
    for (let pass = 0; pass < 2; pass++) for (const o of BODY) { // 2 passes: corners where two walls meet
      const cx = this.x + sy * o, cz = this.z + cy * o;
      this.col.resolve([cx, 0, cz], RAD, 0.25, 1.2, t);
      const dx = t.x - cx, dz = t.z - cz, d = Math.hypot(dx, dz);
      if (d > 1e-4) this.hit(dx / d, dz / d, dx, dz);
      for (const b of obs) {
        const ex = cx - b.x, ez = cz - b.z, e = Math.hypot(ex, ez), m = RAD + b.r;
        if (e < m && e > 1e-4) this.hit(ex / e, ez / e, (ex / e) * (m - e), (ez / e) * (m - e));
      }
    }
    for (const k of ['x', 'z']) {
      const lo = this.bb[k + '0'], hi = this.bb[k + '1']; if (this[k] < lo || this[k] > hi) { this[k] = Math.min(hi, Math.max(lo, this[k])); const v = 'v' + k; this.impact = Math.max(this.impact, Math.abs(this[v])); this[v] *= -0.3; }
    }
  }

  probe(px, pz, enter) {
    if (this.driving || Math.hypot(px - this.x, pz - this.z) > ENTER_R) return null;
    return { verb: 'Drive', text: 'Hinode coupe', sub: 'Get in', act: enter };
  }

  exitPrompt(exit) {
    return { verb: 'Get out', text: 'Hinode coupe', sub: this.speed > 3 ? 'Slow down first' : '', act: exit, passive: false };
  }

  enter(player, cam) {
    this.driving = true;
    if (this.baseFov == null) this.baseFov = cam.fov;
    cam.distWant = 7.2; cam.yaw = this.yaw + Math.PI; cam.pitch = 0.2;
    player.pos[0] = this.x; player.pos[2] = this.z; player.vel.fill(0);
    this.hud.el.hidden = false; document.body.classList.add('driving');
  }

  // force = something else moved the player (new day, load): just drop out of the car.
  exit(player, cam, force = false) {
    if (!this.driving) return true;
    if (!force) {
      if (this.speed > 3) return false;
      const t = this.tmp;
      let spot = null;
      for (const s of [1, -1]) { // driver's side first (right-hand drive)
        const x = this.x - Math.cos(this.yaw) * s * 1.7, z = this.z + Math.sin(this.yaw) * s * 1.7;
        this.col.resolve([x, 0, z], 0.35, 0.1, 1.7, t);
        if (Math.hypot(t.x - x, t.z - z) < 0.3) { spot = [t.x, t.z]; break; }
      }
      if (!spot) spot = [this.x + Math.sin(this.yaw) * 3, this.z + Math.cos(this.yaw) * 3];
      player.teleport(spot[0], 0, spot[1], this.yaw);
      this.vx = this.vz = this.yawRate = 0;
    }
    this.driving = false; this.braking = false; this.hb = false;
    if (this.baseFov != null) cam.fov = this.baseFov;
    cam.distWant = 5.2;
    this.hud.el.hidden = true; document.body.classList.remove('driving');
    return true;
  }

  camAssist(cam, input, dt) {
    if (Math.abs(input.mdx) + Math.abs(input.mdy) > 0.5 || Math.abs(input.pad.mx) + Math.abs(input.pad.my) > 0.15) this.look = 1.4;
    this.look = Math.max(0, this.look - dt);
    const sp = this.speed;
    if (this.look <= 0 && sp > 1) {
      cam.yaw = dampAngle(cam.yaw, this.yaw + Math.PI, 2 + sp * 0.08, dt);
      cam.pitch = damp(cam.pitch, 0.2, 1.5, dt);
    }
    if (this.baseFov != null) cam.fov = this.baseFov + clamp(sp / TOP, 0, 1) * 0.2;
  }

  updateHud(vf) {
    const sp = Math.abs(vf), kmh = Math.round(sp * 3.6);
    let g = 1; while (g < GEARS.length - 1 && sp > GEARS[g]) g++;
    const gear = vf < -0.4 ? 'R' : sp < 0.4 ? 'N' : String(g);
    const rpm = sp < 0.4 ? 0.12 : clamp(0.22 + 0.74 * (sp - GEARS[g - 1]) / (GEARS[g] - GEARS[g - 1]), 0, 0.98);
    const key = kmh + gear + Math.round(rpm * 50);
    if (key === this.shown) return;
    this.shown = key;
    this.hud.spd.textContent = kmh; this.hud.gear.textContent = gear; this.hud.rpm.style.width = (rpm * 100).toFixed(0) + '%';
  }

  draw(r, cam, time, env) {
    const S = this.spec, sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const lit = this.driving && env && env.night > 0.12;
    this.lamp[0] = this.x + sy * 7; this.lamp[2] = this.z + cy * 7; this.lamp[3] = lit ? 1.5 : 0;
    const d = Math.hypot(this.x - cam.pos[0], this.z - cam.pos[2]);
    if (d > 170) return;
    const M = d > (r.lodDist || 30) ? this.lo : this.mesh;
    poseMatrix(this.root, this.x, 0.02, this.z, this.yaw, 1, this.pitch, this.roll);
    r.draw(M.body, this.root);
    if (this.braking) r.draw(this.mesh.brake, this.root, false);
    poseMatrix(this.flat, this.x, 0, this.z, this.yaw, 1);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const front = sz > 0;
      poseMatrix(this.local, sx * S.track, S.r, sz * S.axle, front ? this.steer : 0, 1, front ? this.spinF : this.spinR);
      r.draw(M.wheel, mul(this.m, this.flat, this.local));
    }
  }
}

function mul(out, a, b) {
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    out[j * 4 + i] = a[i] * b[j * 4] + a[4 + i] * b[j * 4 + 1] + a[8 + i] * b[j * 4 + 2] + a[12 + i] * b[j * 4 + 3];
  }
  return out;
}
