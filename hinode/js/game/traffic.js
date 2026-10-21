// Town traffic: a few cars on one-way loops (outer ring + Asahi-dori, left-hand traffic).
// They follow the road by pure pursuit, slow for corners, and brake for you, your car and each other.
import { mat4, poseMatrix, multiply, damp, dampAngle, clamp, wrapAngle } from '../engine/math.js';
import { buildVehicle } from './vehicles.js';

// Left-hand traffic: shift each corner of a road-centre loop into the left lane.
const lanes = (pts, w) => pts.map((p, i) => {
  const nrm = (q, r) => { const dx = r[0] - q[0], dz = r[1] - q[1], l = Math.hypot(dx, dz) || 1; return [dz / l, -dx / l]; };
  const n1 = nrm(pts[(i + pts.length - 1) % pts.length], p), n2 = nrm(p, pts[(i + 1) % pts.length]);
  return [p[0] + (n1[0] + n2[0]) * w, p[1] + (n1[1] + n2[1]) * w];
});

export const PATHS = {
  ring: [[-42, -40], [40, -40], [40, 40], [-42, 40]],
  north: [[-42, 0], [-42, -40], [40, -40], [40, 1.75], [-42, 1.75]],
  south: [[40, 0], [40, 40], [-42, 40], [-42, -1.75], [40, -1.75]],
  // Shinjuku loops, from the road centres in tokyo.js (TK_ROADS).
  'tk-a': lanes([[114, 0], [262, 0], [262, -52], [114, -52]], 2.2),
  'tk-b': lanes([[262, 0], [114, 0], [114, 52], [262, 52]], 2.2),
  'tk-c': lanes([[146, -100], [206, -100], [206, 100], [146, 100]], 2.0),
  'tk-d': lanes([[206, -52], [262, -52], [262, 52], [206, 52]], 2.0),
};
const FLEET = [
  { path: 'ring', seg: 0, style: 'sedan', paint: '#1d3b2f', opt: { taxi: true, stripe: '#e8742c' }, v: 10 },
  { path: 'ring', seg: 2, style: 'kei', paint: '#ecebe4', opt: { plate: '#f3d34a' }, v: 9 },
  { path: 'north', seg: 2, style: 'sedan', paint: '#a8adb4', opt: {}, v: 11.5 },
  { path: 'south', seg: 1, style: 'kei', paint: '#8fb4c9', opt: { plate: '#f3d34a' }, v: 9.5 },
  // Shinjuku: mostly taxis, like the real thing at night.
  { path: 'tk-a', seg: 0, style: 'sedan', paint: '#141518', opt: { taxi: true, stripe: '#d9b24a' }, v: 11 },
  { path: 'tk-a', seg: 2, style: 'sedan', paint: '#e9e9e6', opt: {}, v: 10.5 },
  { path: 'tk-b', seg: 0, style: 'sedan', paint: '#e2c93a', opt: { taxi: true, stripe: '#1b1b1b' }, v: 11 },
  { path: 'tk-b', seg: 2, style: 'kei', paint: '#c63b3b', opt: { plate: '#f3d34a' }, v: 9.5 },
  { path: 'tk-c', seg: 0, style: 'sedan', paint: '#141518', opt: { taxi: true, stripe: '#e8742c' }, v: 10 },
  { path: 'tk-c', seg: 2, style: 'sedan', paint: '#22324a', opt: {}, v: 11 },
  { path: 'tk-d', seg: 3, style: 'sedan', paint: '#2f5d3a', opt: { taxi: true, stripe: '#f2f2f2' }, v: 10 },
];

export class Traffic {
  constructor(renderer, world) {
    this.m = mat4(); this.root = mat4(); this.local = mat4();
    this.obs = [];
    this.bots = FLEET.map((f, id) => {
      const v = buildVehicle(f.style, f.paint, f.opt), p = PATHS[f.path];
      const lo = buildVehicle(f.style, f.paint, { ...(f.opt || {}), lod: 0.3 });
      const a = p[f.seg % p.length], b = p[(f.seg + 1) % p.length];
      return {
        id, path: p, seg: (f.seg + 1) % p.length, vmax: f.v, v: 0, spin: 0, steer: 0, brake: false, hold: 0,
        x: a[0], z: a[1], yaw: Math.atan2(b[0] - a[0], b[1] - a[1]), spec: v.spec,
        mesh: { body: renderer.mesh(v.body), wheel: renderer.mesh(v.wheel), brake: renderer.mesh(v.brake) },
        lo: { body: renderer.mesh(lo.body), wheel: renderer.mesh(lo.wheel) },
      };
    });
  }

  // Circles for the player car's collision: front and back of each bot.
  obstacles(npcs) {
    const o = this.obs; o.length = 0;
    for (const b of this.bots) {
      const sy = Math.sin(b.yaw), cy = Math.cos(b.yaw), h = b.spec.len * 0.27;
      o.push({ x: b.x + sy * h, z: b.z + cy * h, r: 0.85, bot: b }, { x: b.x - sy * h, z: b.z - cy * h, r: 0.85, bot: b });
    }
    if (npcs) for (const n of npcs.list) if (n.out) o.push({ x: n.x, z: n.z, r: 0.4 });
    return o;
  }

  update(dt, car, player) {
    for (const b of this.bots) {
      const t = b.path[b.seg], dx = t[0] - b.x, dz = t[1] - b.z;
      if (Math.hypot(dx, dz) < 6.5) b.seg = (b.seg + 1) % b.path.length;
      const want = Math.atan2(dx, dz), turn = wrapAngle(want - b.yaw);
      let vw = b.vmax * (1 - clamp(Math.abs(turn) / 1.3, 0, 0.62));
      const sy = Math.sin(b.yaw), cy = Math.cos(b.yaw);
      const look = (x, z, gap) => {
        const rx = x - b.x, rz = z - b.z, ahead = rx * sy + rz * cy, lat = Math.abs(rx * cy - rz * sy);
        if (ahead > 0 && ahead < 12 && lat < 2.1) vw = Math.min(vw, Math.max(0, ahead - gap) * 1.3);
      };
      for (const o of this.bots) {
        if (o === b) continue;
        if (Math.cos(o.yaw - b.yaw) > 0.5 || o.id < b.id) look(o.x, o.z, 5.2);
      }
      if (car) look(car.x, car.z, 5.4);
      if (player && !(car && car.driving)) look(player.pos[0], player.pos[2], 3.6);
      if (b.hold > 0) { b.hold -= dt; vw = 0; }
      b.brake = vw < b.v - 0.5;
      b.v = damp(b.v, vw, vw < b.v ? 4 : 1.2, dt);
      b.steer = damp(b.steer, clamp(turn, -0.5, 0.5), 6, dt);
      b.yaw = dampAngle(b.yaw, want, 0.32 * b.v * 0.45 + 0.4, dt);
      b.x += Math.sin(b.yaw) * b.v * dt; b.z += Math.cos(b.yaw) * b.v * dt;
      b.spin += (b.v / b.spec.r) * dt;
      // Someone on foot standing in the lane gets nudged aside rather than driven through.
      if (player && !(car && car.driving)) {
        const ex = player.pos[0] - b.x, ez = player.pos[2] - b.z, e = Math.hypot(ex, ez), m = b.spec.wid * 0.5 + 0.45;
        if (e < m && e > 1e-4) { player.pos[0] = b.x + (ex / e) * m; player.pos[2] = b.z + (ez / e) * m; }
      }
    }
    // A bump from your car stops the bot for a moment.
    if (car && car.impact > 1) for (const b of this.bots) if (Math.hypot(b.x - car.x, b.z - car.z) < 4.5) { b.v = 0; b.hold = 1.5; }
  }

  draw(r, cam) {
    for (const b of this.bots) {
      const d = Math.hypot(b.x - cam.pos[0], b.z - cam.pos[2]);
      if (d > 170) continue;
      const S = b.spec, M = d > (r.lodDist || 30) ? b.lo : b.mesh;
      poseMatrix(this.root, b.x, 0.02, b.z, b.yaw, 1, b.brake ? 0.012 : 0, 0);
      r.draw(M.body, this.root);
      if (b.brake) r.draw(b.mesh.brake, this.root, false);
      poseMatrix(this.root, b.x, 0, b.z, b.yaw, 1);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        poseMatrix(this.local, sx * S.track, S.r, sz * S.axle, sz > 0 ? b.steer * 0.6 : 0, 1, b.spin);
        r.draw(M.wheel, multiply(this.m, this.root, this.local));
      }
    }
  }
}
