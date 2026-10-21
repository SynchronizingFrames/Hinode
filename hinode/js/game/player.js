// On-foot player: camera-relative movement, acceleration, gravity, jump, collision, procedural walk cycle.
import { Builder, hex } from '../engine/geometry.js';
import { mat4, poseMatrix, multiply, clamp, damp, dampAngle } from '../engine/math.js';

export const WALK = 4.2, SPRINT = 7.0;
const ACCEL = 38, DECEL = 30, AIR = 9, GRAV = 26, JUMP = 7.4, RADIUS = 0.34, HEIGHT = 1.7;

function part(build) { const b = new Builder(); build(b); return b; }

// Delivery-rider look: navy jacket, orange cap and a satchel. Built facing +Z, feet at y=0.
function buildRider() {
  const navy = hex('#26324a'), navyD = hex('#1b2436'), skin = hex('#e9c3a0'), hair = hex('#2a2220');
  const orange = hex('#e8742c'), pants = hex('#3a3a40'), shoe = hex('#f1ede4'), bag = hex('#c9a46a'), white = hex('#f4efe6');
  return {
    hips: part((b) => { b.box(0, 0, 0, 0.36, 0.2, 0.22, pants, { ao: 1 }); }),
    torso: part((b) => {
      b.box(0, 0, 0, 0.44, 0.56, 0.26, navy, { ao: 0.9 });
      b.box(0, 0.5, 0, 0.3, 0.06, 0.22, navyD, { ao: 1 });                  // collar
      b.panel(0, 0.3, 0.131, 0.12, 0.08, 0, 1, orange, 0, 0.002);            // chest badge
      b.box(0.02, 0.08, -0.19, 0.34, 0.36, 0.14, bag, { ao: 0.85 });        // satchel on the back
      b.beam([-0.2, 0.52, 0.12], [0.16, 0.06, -0.12], 0.04, hex('#7a5a36')); // strap
    }),
    head: part((b) => {
      b.box(0, 0, 0, 0.12, 0.08, 0.12, skin, { ao: 1 });                    // neck
      b.blob(0, 0.2, 0, 0.15, skin, 1.1, 8);
      b.blob(0, 0.25, -0.02, 0.155, hair, 0.9, 8);
      b.cyl(0, 0.3, -0.005, 0.16, 0.07, orange, 10);                         // cap crown
      b.box(0, 0.3, 0.17, 0.22, 0.025, 0.14, orange, { ao: 1 });             // brim
      b.box(0, 0.34, 0.16, 0.06, 0.02, 0.01, white, { ao: 1 });
      b.box(-0.055, 0.2, 0.135, 0.03, 0.03, 0.02, hex('#201814'), { ao: 1 }); // eyes
      b.box(0.055, 0.2, 0.135, 0.03, 0.03, 0.02, hex('#201814'), { ao: 1 });
    }),
    leg: part((b) => { b.box(0, -0.78, 0, 0.15, 0.78, 0.17, pants, { ao: 1 }); b.box(0, -0.86, 0.03, 0.16, 0.09, 0.27, shoe, { ao: 1 }); }),
    arm: part((b) => { b.box(0, -0.56, 0, 0.12, 0.56, 0.13, navy, { ao: 1 }); b.box(0, -0.66, 0, 0.1, 0.1, 0.1, skin, { ao: 1 }); }),
    // Packages strapped to the back, one mesh per package type.
    pkg: Object.fromEntries(Object.entries({ parcel: '#c49a6c', letters: '#f3ecdf', food: '#e8a33c', fragile: '#d9534f', heavy: '#6c7a89' }).map(([k, c]) => [k, part((b) => {
      const h = k === 'heavy' ? 0.34 : k === 'letters' ? 0.1 : 0.22, w = k === 'letters' ? 0.26 : 0.34;
      b.box(0, 0, 0, w, h, 0.26, hex(c), { ao: 0.9 });
      b.box(0, h, 0, w + 0.004, 0.012, 0.06, k === 'fragile' ? hex('#f6f1e7') : hex('#e6d7b3'), { ao: 1 });
    })])),
    shadow: part((b) => { // soft blob shadow disc under the feet
      const n = 14, c = hex('#000000');
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
        b.tri([0, 0.03, 0], [Math.cos(a1) * 0.42, 0.03, Math.sin(a1) * 0.42], [Math.cos(a0) * 0.42, 0.03, Math.sin(a0) * 0.42], c);
      }
    }),
  };
}

export class Player {
  constructor(renderer, spawn = [0, 0, 0], yaw = 0) {
    this.pos = [...spawn];
    this.vel = [0, 0, 0];
    this.yaw = yaw;
    this.grounded = true;
    this.coyote = 0; this.jumpBuf = 0;
    this.phase = 0; this.lean = 0;
    this.safe = [...spawn];
    this.speed = 0;
    this.contact = { x: 0, z: 0, hit: false, nx: 0, nz: 0, tag: null };
    const parts = buildRider();
    this.mesh = {};
    for (const [k, b] of Object.entries(parts)) if (k !== 'pkg') this.mesh[k] = renderer.mesh(b);
    this.pkgMesh = {};
    for (const [k, b] of Object.entries(parts.pkg)) this.pkgMesh[k] = renderer.mesh(b);
    this.speedMul = 1;   // set by the delivery system (heavy packages slow you down)
    this.impact = 0;     // hardest bump this frame, in m/s (fragile packages care)
    this.carry = [];     // package kinds currently carried, drawn on the back
    this.root = mat4(); this.local = mat4(); this.m = mat4();
  }

  teleport(x, y, z, yaw = this.yaw) { this.pos[0] = x; this.pos[1] = y; this.pos[2] = z; this.vel.fill(0); this.yaw = yaw; }

  update(dt, input, camYaw, world) {
    const col = world.collision;
    const [ax, ay] = input.axes();
    const sprint = input.sprint();
    const top = (sprint ? SPRINT : WALK) * this.speedMul;
    this.impact = 0;
    // Camera-relative wish direction.
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw), rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
    let wx = (rx * ax + fx * ay) * top, wz = (rz * ax + fz * ay) * top;
    const has = ax !== 0 || ay !== 0;

    // Accelerate horizontal velocity toward the wish velocity.
    const rate = !this.grounded ? AIR : has ? ACCEL : DECEL;
    let dx = wx - this.vel[0], dz = wz - this.vel[2];
    const dl = Math.hypot(dx, dz), stepV = rate * dt;
    if (dl <= stepV) { this.vel[0] = wx; this.vel[2] = wz; } else { this.vel[0] += (dx / dl) * stepV; this.vel[2] += (dz / dl) * stepV; }

    // Jump with coyote time and input buffering so it never feels like it ate the press.
    this.coyote = this.grounded ? 0.12 : Math.max(0, this.coyote - dt);
    this.jumpBuf = input.hit('Space') ? 0.14 : Math.max(0, this.jumpBuf - dt);
    if (this.jumpBuf > 0 && this.coyote > 0) { this.vel[1] = JUMP; this.grounded = false; this.coyote = 0; this.jumpBuf = 0; }

    this.vel[1] -= GRAV * dt;

    // Integrate in sub-steps so fast movement can't tunnel through thin walls.
    const travel = Math.hypot(this.vel[0], this.vel[2]) * dt;
    const n = Math.max(1, Math.ceil(travel / (RADIUS * 0.7)));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.pos[0] += this.vel[0] * h; this.pos[2] += this.vel[2] * h;
      const c = col.resolve(this.pos, RADIUS, this.pos[1], HEIGHT, this.contact);
      if (c.hit) {
        this.pos[0] = c.x; this.pos[2] = c.z;
        // Remove the velocity component going into the wall, keep the slide.
        const into = this.vel[0] * c.nx + this.vel[2] * c.nz;
        if (into < -3) this.impact = Math.max(this.impact, -into);
        if (into < 0) { this.vel[0] -= into * c.nx; this.vel[2] -= into * c.nz; }
      }
    }
    this.pos[1] += this.vel[1] * dt;

    const g = col.groundAt(this.pos[0], this.pos[2], this.pos[1], RADIUS * 0.6);
    const wasGrounded = this.grounded, vy = this.vel[1];
    if (!wasGrounded && vy < -10 && this.pos[1] <= g + 0.001) this.impact = Math.max(this.impact, -vy - 6); // hard landing
    if (this.pos[1] <= g + 0.001 && this.vel[1] <= 0) { this.pos[1] = g; this.vel[1] = 0; this.grounded = true; }
    else if (wasGrounded && this.vel[1] <= 0 && this.pos[1] - g < 0.5) { this.pos[1] = g; this.vel[1] = 0; this.grounded = true; } // stick to slopes/steps going down
    else this.grounded = false;

    if (this.grounded) { this.safe[0] = this.pos[0]; this.safe[1] = this.pos[1]; this.safe[2] = this.pos[2]; }
    if (this.pos[1] < -30) this.teleport(this.safe[0], this.safe[1] + 0.5, this.safe[2]);

    // Face where we're going.
    this.speed = Math.hypot(this.vel[0], this.vel[2]);
    if (this.speed > 0.3) this.yaw = dampAngle(this.yaw, Math.atan2(this.vel[0], this.vel[2]), 14, dt);
    this.lean = damp(this.lean, has ? clamp(this.speed / SPRINT, 0, 1) * 0.12 : 0, 8, dt);
    this.phase += dt * (this.grounded ? 2.3 + this.speed * 1.55 : 0);
  }

  draw(r, time) {
    const M = this.mesh, p = this.pos, s = clamp(this.speed / WALK, 0, 1.4);
    const swing = Math.sin(this.phase) * 0.75 * s;
    const bob = this.grounded ? Math.abs(Math.sin(this.phase)) * 0.05 * s + Math.sin(time * 1.8) * 0.006 : 0;
    const air = this.grounded ? 0 : 0.5;
    r.draw(M.shadow, poseMatrix(this.m, p[0], p[1] + 0.005, p[2], 0, 1), false);
    poseMatrix(this.root, p[0], p[1] + 0.9 + bob, p[2], this.yaw, 1, this.lean);
    const drawLocal = (mesh, x, y, z, pitch, roll = 0) => {
      poseMatrix(this.local, x, y, z, 0, 1, pitch, roll);
      r.draw(mesh, multiply(this.m, this.root, this.local));
    };
    drawLocal(M.hips, 0, -0.06, 0, 0);
    drawLocal(M.torso, 0, 0.06, 0, 0);
    drawLocal(M.head, 0, 0.62, 0.0, -this.lean * 0.6);
    drawLocal(M.leg, -0.1, 0.0, 0, swing + air * 0.4);
    drawLocal(M.leg, 0.1, 0.0, 0, -swing - air * 0.2);
    drawLocal(M.arm, -0.29, 0.58, 0, -swing * 0.8 - air, 0.06);
    drawLocal(M.arm, 0.29, 0.58, 0, swing * 0.8 - air, -0.06);
    let sy = 0.12;
    for (const k of this.carry) {
      const mesh = this.pkgMesh[k] || this.pkgMesh.parcel;
      drawLocal(mesh, 0, sy, -0.42, 0);
      sy += k === 'heavy' ? 0.36 : k === 'letters' ? 0.12 : 0.24;
    }
  }
}
