// On-foot player: camera-relative movement, acceleration, gravity, jump, collision, procedural walk cycle.
import { Builder, hex } from '../engine/geometry.js';
import { mat4, poseMatrix, multiply, clamp, damp, dampAngle } from '../engine/math.js';

export const WALK = 4.2, SPRINT = 7.0;
const ACCEL = 38, DECEL = 30, AIR = 9, GRAV = 26, JUMP = 7.4, RADIUS = 0.34, HEIGHT = 1.7;

function part(build) { const b = new Builder(); build(b); return b; }

// Legs: thigh + shin to the ankle, solved with two-bone IK onto foot targets so planted feet don't skate.
const L1 = 0.42, L2 = 0.36, ANKLE = 0.08, HIP = 0.86, REACH = L1 + L2 - 0.0008;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function legIK(out, z, y) { // ankle target (z forward, y up) relative to the hip -> [thigh pitch, knee pitch]
  const d = clamp(Math.hypot(z, y), 0.3, REACH);
  const a = Math.atan2(z, -y);
  const b = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
  const k = Math.PI - Math.acos(clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1));
  out[0] = -(a + b); out[1] = k;
  return out;
}
// One foot over a stride. u: 0 = heel strike; [0, D) planted, sliding back under the hips; [D, 1) swinging forward.
function footPath(F, u, D, c, lift, g) {
  if (u < D) {
    const q = u / D, heel = sstep(0.62, 1, q) * g;
    F.z = c * (0.5 - q); F.y = 0.045 * heel; F.lift = 0;
    F.p = 0.5 * heel - 0.22 * g * (1 - sstep(0, 0.18, q));      // toe comes down after the heel, heel peels up at the end
  } else {
    const q = (u - D) / (1 - D), arc = Math.sin(Math.PI * Math.pow(q, 0.75));
    F.z = c * ((1 - Math.cos(Math.PI * q)) / 2 - 0.5) - 0.1 * g * Math.sin(Math.PI * q) * (1 - q); // heel kicks back, then reaches
    F.y = lift * arc + 0.045 * g * (1 - sstep(0, 0.3, q));
    F.p = g * (0.5 * (1 - sstep(0, 0.45, q)) - 0.22 * sstep(0.55, 0.95, q)); // toe-off, then toe up for the next heel strike
    F.lift = arc;
  }
  return F;
}
function mixFoot(F, z, y, p, w) { F.z += (z - F.z) * w; F.y += (y - F.y) * w; F.p += (p - F.p) * w; F.lift *= 1 - w; }

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
    thigh: part((b) => { b.box(0, -0.43, 0, 0.155, 0.45, 0.175, pants, { ao: 1 }); }),
    shin: part((b) => {
      b.blob(0, 0, 0, 0.082, pants, 1, 6);                                   // knee
      b.box(0, -0.37, 0, 0.14, 0.39, 0.16, pants, { ao: 1 });
      b.box(0, -0.37, 0, 0.147, 0.05, 0.167, hex('#2e2e33'), { ao: 1 });     // turned-up hem
    }),
    foot: part((b) => {
      b.box(0, -0.08, 0.035, 0.16, 0.09, 0.27, shoe, { ao: 1 });
      b.box(0, -0.085, 0.035, 0.166, 0.026, 0.276, hex('#bdb6a8'), { ao: 1 }); // sole
    }),
    upperArm: part((b) => { b.box(0, -0.31, 0, 0.12, 0.33, 0.13, navy, { ao: 1 }); }),
    forearm: part((b) => {
      b.blob(0, 0, 0, 0.064, navy, 1, 6);                                    // elbow
      b.box(0, -0.27, 0, 0.11, 0.29, 0.12, navy, { ao: 1 });
      b.box(0, -0.285, 0, 0.117, 0.035, 0.127, navyD, { ao: 1 });           // cuff
      b.box(0, -0.37, 0, 0.1, 0.1, 0.1, skin, { ao: 1 });
    }),
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
    this.gait = 0; this.bank = 0; this.accLean = 0; this.land = 0; this.idleT = 0; this.airT = 0;
    this.prevYaw = yaw; this.prevSpeed = 0; this.fL = { z: 0, y: 0, p: 0, lift: 0 }; this.fR = { z: 0, y: 0, p: 0, lift: 0 }; this.ik = [0, 0];
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
    this.mx = { base: mat4(), pel: mat4(), spine: mat4(), th: mat4(), sh: mat4(), ua: mat4() };
  }

  teleport(x, y, z, yaw = this.yaw) { this.pos[0] = x; this.pos[1] = y; this.pos[2] = z; this.vel.fill(0); this.yaw = yaw; this.prevYaw = yaw; this.land = 0; this.bank = 0; }

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
    // Stride phase in cycles; cadence rises with speed (about 100 steps a minute strolling, 250 sprinting).
    const cad = 1.05 + 0.15 * this.speed;
    this.phase = (this.phase + dt * cad * clamp(this.speed / 0.35, 0, 1) * (this.grounded ? 1 : 0.3)) % 1;
    // Animation state, smoothed so idle, walk, sprint, jumps and landings blend instead of snapping.
    this.gait = damp(this.gait, this.speed, 12, dt);
    let dyaw = this.yaw - this.prevYaw; dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw)); this.prevYaw = this.yaw;
    const yawRate = dt > 1e-4 ? dyaw / dt : 0;
    this.bank = damp(this.bank, clamp(-yawRate * 0.05 * clamp(this.speed / WALK, 0, 1.5), -0.24, 0.24), 6, dt);
    const acc = dt > 1e-4 ? (this.speed - this.prevSpeed) / dt : 0; this.prevSpeed = this.speed;
    this.accLean = damp(this.accLean, this.grounded ? clamp(acc * 0.01, -0.12, 0.12) : 0, 5, dt);
    if (!wasGrounded && this.grounded && vy < -2) this.land = Math.max(this.land, clamp(-vy / 14, 0.2, 1));
    this.land = damp(this.land, 0, 6, dt);
    this.idleT += dt * (1 - clamp(this.speed / 0.9, 0, 1));
    this.airT = this.grounded ? 0 : this.airT + dt;
  }

  draw(r, time) {
    const M = this.mesh, p = this.pos, v = this.gait, X = this.mx;
    const g = clamp(v / WALK, 0, 1), run = clamp((v - WALK) / (SPRINT - WALK), 0, 1);
    const move = clamp(v / 0.9, 0, 1), idle = 1 - move;
    const air = this.grounded ? 0 : clamp(this.airT / 0.1, 0, 1), land = this.land;
    const cad = 1.05 + 0.15 * v;
    const D = 0.6 - 0.24 * g - 0.06 * run;                // share of a stride each foot spends on the ground
    const c = Math.min(0.64, v * D / cad);                // how far a planted foot travels under the hips
    const lift = (0.08 + 0.07 * g + 0.1 * run) * move;
    const br = Math.sin(time * 1.6) * (0.4 + 0.6 * idle); // breathing
    const ws = Math.sin(this.idleT * 0.42) * idle;        // standing still: weight drifts from foot to foot
    const look = idle * Math.sin(this.idleT * 0.29) * Math.max(0, Math.sin(this.idleT * 0.11 + 0.7)) * 0.6; // and a look around
    const ga = g * (1 - air);
    const FL = footPath(this.fL, this.phase, D, c, lift, ga), FR = footPath(this.fR, (this.phase + 0.5) % 1, D, c, lift, ga);
    FL.z += 0.05 * idle; FR.z -= 0.03 * idle;
    if (air > 0) { mixFoot(FL, 0.14, 0.34, 0.35, air); mixFoot(FR, -0.12, 0.28, 0.45, air); }
    const stepW = move * (1 - air);
    const pelvisRoll = -0.045 * (FL.lift - FR.lift) * stepW + 0.04 * ws;      // hip drops on the swinging side
    const pelvisYaw = c > 0.05 ? -0.16 * clamp((FL.z - FR.z) / c, -1, 1) * ga : 0; // hips turn with the legs
    const swayX = 0.02 * (FR.lift - FL.lift) * stepW * (1 - 0.5 * run) + 0.028 * ws;
    let h = HIP - 0.02 * g - 0.025 * run - 0.16 * land;
    h = Math.min(h, ANKLE + FL.y + Math.sqrt(Math.max(0, REACH * REACH - FL.z * FL.z)));
    h = Math.min(h, ANKLE + FR.y + Math.sqrt(Math.max(0, REACH * REACH - FR.z * FR.z)));

    r.draw(M.shadow, poseMatrix(this.m, p[0], p[1] + 0.005, p[2], 0, 1), false);
    poseMatrix(X.base, p[0], p[1] + h, p[2], this.yaw, 1, 0, this.bank); // whole body banks into turns
    const at = (out, parent, x, y, z, yaw = 0, pitch = 0, roll = 0) => multiply(out, parent, poseMatrix(this.local, x, y, z, yaw, 1, pitch, roll));
    const put = (mesh, parent, x, y, z, yaw, pitch, roll) => r.draw(mesh, at(this.m, parent, x, y, z, yaw, pitch, roll));
    for (let side = -1; side <= 1; side += 2) {
      const F = side > 0 ? FL : FR;
      const hx = swayX + side * 0.1, hy = side * 0.1 * Math.sin(pelvisRoll), hz = -side * 0.1 * Math.sin(pelvisYaw);
      const ik = legIK(this.ik, F.z - hz, -h + ANKLE + F.y - hy);
      at(X.th, X.base, hx, hy, hz, pelvisYaw * 0.5, ik[0], 0); r.draw(M.thigh, X.th);
      at(X.sh, X.th, 0, -L1, 0, 0, ik[1], 0); r.draw(M.shin, X.sh);
      put(M.foot, X.sh, 0, -L2, 0, 0, F.p - (ik[0] + ik[1]), 0);
    }
    at(X.pel, X.base, swayX, 0, 0, pelvisYaw, 0, pelvisRoll);
    put(M.hips, X.pel, 0, -0.06, 0);
    const lean = this.lean + this.accLean + 0.22 * land - 0.012 * br * idle + 0.05 * air;
    const torsoYaw = -1.7 * pelvisYaw, torsoRoll = -0.6 * pelvisRoll - 0.02 * ws; // shoulders counter-rotate
    at(X.spine, X.pel, 0, 0.06 + 0.005 * br, 0, torsoYaw, lean, torsoRoll); r.draw(M.torso, X.spine);
    const net = pelvisYaw + torsoYaw;
    put(M.head, X.spine, 0, 0.56, 0, -0.8 * net + look, -lean * 0.75 + 0.04 * land, -(torsoRoll + pelvisRoll + this.bank) * 0.7); // head stays level
    const A = (0.3 * g + 0.28 * run) * (1 - air);
    for (let side = -1; side <= 1; side += 2) {
      const u = side > 0 ? this.phase : (this.phase + 0.5) % 1;
      const fwd = -A * Math.cos(u * Math.PI * 2) + 0.035 * br * idle + 0.6 * air + 0.25 * land; // arm swings against its leg
      const elbow = 0.12 + 0.28 * g + 0.85 * run + 0.5 * air + 0.3 * Math.max(0, fwd);         // elbows tuck as you speed up
      at(X.ua, X.spine, side * 0.29, 0.52, 0, 0, -fwd - lean * 0.6, side * (0.05 + 0.05 * run + 0.35 * air + 0.015 * br));
      r.draw(M.upperArm, X.ua);
      put(M.forearm, X.ua, 0, -0.3, 0, 0, -elbow, 0);
    }
    let sy = 0.06;
    for (const k of this.carry) {
      const mesh = this.pkgMesh[k] || this.pkgMesh.parcel;
      put(mesh, X.spine, 0, sy, -0.42);
      sy += k === 'heavy' ? 0.36 : k === 'letters' ? 0.12 : 0.24;
    }
  }
}
