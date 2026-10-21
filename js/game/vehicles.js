// Procedural car modeller ("Blender in code"). Each body is lofted from ~100 smooth cross-sections with
// per-vertex normals: plan-view rounding, wheel arches, flares, tumblehome and a shoulder crease. The glass
// cabin is a second loft. Lights, grille, skirts and panel gaps are decal patches resampled from the same
// surface so they hug the curves. Wheels are turned on a lathe (tyre with tread grooves, deep-dish rim,
// twin spokes, brake disc).
// Materials ride in the colour alpha channel (see WORLD_FS): -1 paint, -2 glass, -3 chrome, -4 rubber,
// -5 satin metal, > 0 emissive.
// API (unchanged): buildVehicle(style, paint, opt) -> { body, brake, wheel, spec }  (Builders + spec)
import { Builder, hex } from '../engine/geometry.js';

const PAINT = -1, GLASS = -2, CHROME = -3, RUBBER = -4, SATIN = -5;
const PI = Math.PI, TAU = PI * 2;
const S = (t, e) => Math.sign(t) * Math.pow(Math.abs(t), e);
const sq = (x) => x * x;
const lerp = (a, b, t) => a + (b - a) * t;

// Smooth curve through [[z, y], ...] (sorted by z), cubic Hermite with finite-difference tangents.
function curve(pts) {
  const n = pts.length;
  return (z) => {
    if (z <= pts[0][0]) return pts[0][1];
    if (z >= pts[n - 1][0]) return pts[n - 1][1];
    let i = 0;
    while (z > pts[i + 1][0]) i++;
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
    const h = p2[0] - p1[0], t = (z - p1[0]) / h;
    const m1 = ((p2[1] - p0[1]) / (p2[0] - p0[0])) * h, m2 = ((p3[1] - p1[1]) / (p3[0] - p1[0])) * h;
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * p1[1] + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2[1] + (t3 - t2) * m2;
  };
}

// Mesh a parametric surface P(u, v) with smooth (welded, area-weighted) normals. out(x, y, z) returns a rough
// "outside" direction so every triangle gets CCW winding + an outward normal however the parameters run.
// mat(centroid, faceNormal, u, v) -> [rgb, alpha] or null to skip. opt.off pushes vertices out along the normal
// (decals sitting on another surface).
let Q = 1; // mesh quality (LOD), set per build by buildVehicle(opt.lod)
function surface(b, P, nu, nv, out, mat, opt = {}) {
  if (Q < 1) { if (nu > 6) nu = Math.max(6, Math.round(nu * Q)); if (nv > 6) nv = Math.max(6, Math.round(nv * Q)); }
  const W = nv + 1, N = (nu + 1) * W, pts = new Array(N), acc = new Float64Array(N * 3);
  for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) pts[i * W + j] = P(i / nu, j / nv);
  const faces = [];
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const a = i * W + j, q = (i + 1) * W + j, c = q + 1, d = a + 1;
    for (const t of [[a, q, c], [a, c, d]]) {
      const A = pts[t[0]], B = pts[t[1]], C = pts[t[2]];
      const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const ar = Math.hypot(nx, ny, nz);
      if (ar < 1e-12) continue;
      const cx = (A[0] + B[0] + C[0]) / 3, cy = (A[1] + B[1] + C[1]) / 3, cz = (A[2] + B[2] + C[2]) / 3;
      const o = out(cx, cy, cz);
      if (nx * o[0] + ny * o[1] + nz * o[2] < 0) { const k = t[1]; t[1] = t[2]; t[2] = k; nx = -nx; ny = -ny; nz = -nz; }
      for (const k of t) { acc[k * 3] += nx; acc[k * 3 + 1] += ny; acc[k * 3 + 2] += nz; }
      faces.push({ t, c: [cx, cy, cz], n: [nx / ar, ny / ar, nz / ar], u: (i + 0.5) / nu, v: (j + 0.5) / nv });
    }
  }
  // Weld coincident vertices (wrap seams, collapsed nose/tail) so their normals are shared.
  const groups = new Map();
  for (let k = 0; k < N; k++) {
    const p = pts[k], key = Math.round(p[0] * 2e4) + ',' + Math.round(p[1] * 2e4) + ',' + Math.round(p[2] * 2e4);
    let g = groups.get(key);
    if (!g) { g = [0, 0, 0, []]; groups.set(key, g); }
    g[0] += acc[k * 3]; g[1] += acc[k * 3 + 1]; g[2] += acc[k * 3 + 2]; g[3].push(k);
  }
  for (const g of groups.values()) {
    const l = Math.hypot(g[0], g[1], g[2]) || 1;
    for (const k of g[3]) { acc[k * 3] = g[0] / l; acc[k * 3 + 1] = g[1] / l; acc[k * 3 + 2] = g[2] / l; }
  }
  const off = opt.off || 0;
  for (const f of faces) {
    const m = mat(f.c, f.n, f.u, f.v);
    if (!m) continue;
    const col = m[0], al = m[1];
    for (const k of f.t) {
      let nx = acc[k * 3], ny = acc[k * 3 + 1], nz = acc[k * 3 + 2];
      // A smoothed normal must never face away from its own triangle (avoids black speckles at tight creases).
      if (nx * f.n[0] + ny * f.n[1] + nz * f.n[2] < 0.15) { nx = f.n[0]; ny = f.n[1]; nz = f.n[2]; }
      const p = pts[k];
      b.pos.push(p[0] + nx * off, p[1] + ny * off, p[2] + nz * off);
      b.nor.push(nx, ny, nz);
      b.col.push(col[0], col[1], col[2], al);
    }
  }
}

// Revolve a profile [[radius, x], ...] around the X axis (wheels, exhaust tips).
function lathe(b, prof, seg, out, mat) {
  const n = prof.length - 1;
  surface(b, (u, v) => {
    const p = prof[Math.round(v * n)], a = u * TAU;
    return [p[1], p[0] * Math.cos(a), p[0] * Math.sin(a)];
  }, seg, n, out, mat);
}

// Flat quad with winding chosen so its normal faces o.
function face4(b, A, B, C, D, col, al, o) {
  const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
  let q = [A, B, C, D];
  if (nx * o[0] + ny * o[1] + nz * o[2] < 0) { q = [A, D, C, B]; nx = -nx; ny = -ny; nz = -nz; }
  for (const k of [0, 1, 2, 0, 2, 3]) {
    const p = q[k];
    b.pos.push(p[0], p[1], p[2]); b.nor.push(nx, ny, nz); b.col.push(col[0], col[1], col[2], al);
  }
}

const DESIGNS = {
  // Hinode coupe: long hood, fastback, wide rear hips.
  coupe: {
    spec: { axle: 1.35, track: 0.79, r: 0.34, w: 0.27, front: 2.2, rear: -2.16, len: 4.36, wid: 1.82 },
    W: 0.9, pf: 3.6, pr: 4.4, eb: 0.45, et: 0.6, tumble: 0.1, crease: 0.014, flare: [0.04, 0.065],
    top: [[-2.16, 0.62], [-2.08, 0.82], [-1.9, 0.95], [-1.4, 0.94], [-0.4, 0.9], [0.62, 0.89], [1.3, 0.83], [1.9, 0.74], [2.14, 0.62], [2.2, 0.5]],
    bot: [[-2.16, 0.34], [-1.95, 0.2], [-1.6, 0.16], [1.7, 0.15], [2.05, 0.18], [2.2, 0.26]],
    cab: { z0: -1.62, z1: 0.66, wb: 0.76, taper: 0.24, zB: -0.62, zQ: -1.05, zRT: -0.5,
      roof: [[-1.62, 0.84], [-1.15, 1.08], [-0.65, 1.24], [-0.22, 1.29], [0.06, 1.27], [0.66, 0.84]] },
    door: [0.76, -0.62], hood: 1.96, trunk: -1.9, handles: [-0.45], mirrorZ: 0.46, exhaust: [-0.5, 0.5],
    head: [0.8, 0.975, 0.6, 0.74], tail: [-0.985, -0.86, 0.62, 0.76], bar: true, rim: '#2b2d31', signZ: -0.2,
  },
  // Four-door saloon (taxi base): upright greenhouse, separate boot.
  sedan: {
    spec: { axle: 1.42, track: 0.75, r: 0.32, w: 0.23, front: 2.3, rear: -2.3, len: 4.6, wid: 1.76 },
    W: 0.88, pf: 4.2, pr: 5, eb: 0.42, et: 0.55, tumble: 0.08, crease: 0.01, flare: [0.02, 0.025],
    top: [[-2.3, 0.7], [-2.22, 0.88], [-1.95, 0.97], [-1.3, 0.96], [0, 0.92], [0.8, 0.91], [1.6, 0.86], [2.15, 0.78], [2.3, 0.6]],
    bot: [[-2.3, 0.36], [-2.05, 0.22], [-1.7, 0.18], [1.8, 0.17], [2.15, 0.2], [2.3, 0.3]],
    cab: { z0: -1.32, z1: 0.82, wb: 0.8, taper: 0.16, zB: -0.22, zQ: -0.98, zRT: -0.62,
      roof: [[-1.32, 0.9], [-1.02, 1.18], [-0.58, 1.4], [0.1, 1.42], [0.42, 1.36], [0.82, 0.88]] },
    door: [0.8, -0.22, -1.08], hood: 2.04, trunk: -1.36, handles: [0.05, -0.85], mirrorZ: 0.6, exhaust: [-0.55],
    head: [0.84, 0.975, 0.6, 0.72], tail: [-0.985, -0.87, 0.6, 0.74], chromeTrim: true, rim: '#c3c8ce', signZ: -0.2,
  },
  // Kei car: 3.4 m box, tall roof, flat ends.
  kei: {
    spec: { axle: 1.15, track: 0.62, r: 0.27, w: 0.18, front: 1.7, rear: -1.7, len: 3.4, wid: 1.48 },
    W: 0.73, pf: 6, pr: 9, eb: 0.36, et: 0.42, tumble: 0.04, crease: 0.008, flare: [0.01, 0.01],
    top: [[-1.7, 0.8], [-1.64, 0.9], [-1.0, 0.9], [0.9, 0.86], [1.4, 0.82], [1.66, 0.72], [1.7, 0.6]],
    bot: [[-1.7, 0.34], [-1.55, 0.2], [1.5, 0.19], [1.7, 0.28]],
    cab: { z0: -1.67, z1: 1.06, wb: 0.86, taper: 0.08, zB: -0.2, zQ: -1.2, zRT: -1.45,
      roof: [[-1.67, 0.85], [-1.6, 1.5], [-1.3, 1.6], [0.35, 1.62], [0.62, 1.52], [1.06, 0.84]] },
    door: [0.7, -0.22, -1.12], hood: 1.6, trunk: null, handles: [0.0, -0.95], mirrorZ: 0.72, exhaust: [],
    head: [0.84, 0.985, 0.62, 0.8], tail: [-0.997, -0.93, 0.5, 0.82], rim: '#b9bdc2', signZ: -0.3,
  },
};

function makeBody(D, paintHex, opt) {
  const sp = D.spec, zc = (sp.front + sp.rear) / 2, Lh = (sp.front - sp.rear) / 2;
  const top = curve(D.top), bot0 = curve(D.bot), Ra = sp.r + 0.05, wy = sp.r - 0.02;
  const zN = (z) => (z - zc) / Lh;
  const bot = (z) => {
    let y = bot0(z);
    for (const za of [sp.axle, -sp.axle]) {
      const d = z - za;
      if (Math.abs(d) < Ra) y = Math.max(y, wy + Math.sqrt(Ra * Ra - d * d));
    }
    return Math.min(y, top(z) - 0.04);
  };
  const half = (z) => {
    const zn = zN(z), p = zn > 0 ? D.pf : D.pr;
    const w = D.W * Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, Math.abs(zn)), p)), 1 / p);
    return w * (1 + D.flare[0] * Math.exp(-sq((z - sp.axle) / 0.42)) + D.flare[1] * Math.exp(-sq((z + sp.axle) / 0.48)));
  };
  // Body cross-section: superellipse (flatter underneath), narrowing toward the top, with a shoulder crease.
  const P = (zn, th) => {
    const z = zc + zn * Lh, yt = top(z), yb = bot(z), yc = (yt + yb) / 2, hh = (yt - yb) / 2, w = half(z);
    const s = Math.sin(th), c = Math.cos(th), e = c > 0 ? D.eb : D.et;
    const y = yc - hh * S(c, e);
    const q = Math.max(0, -S(c, e));
    let x = w * S(s, e) * (1 - D.tumble * q * q);
    x += Math.sign(s) * w * D.crease * Math.exp(-sq((q - 0.42) / 0.08));
    return [x, y, z];
  };
  const outB = (x, y, z) => { const zn = zN(z); return [x / D.W, (y - (top(z) + bot(z)) / 2) / 0.3, Math.sign(zn) * sq(sq(zn)) * 3]; };

  const paint = [hex(paintHex), PAINT], under = [hex('#1a1b1d'), RUBBER], blk = [hex('#121316'), RUBBER];
  const glass = [hex(opt.tint || '#0e1419'), GLASS], chrome = [hex('#c2c7cd'), CHROME];
  const roofM = opt.roof ? [hex(opt.roof), PAINT] : paint;
  const b = new Builder(), br = new Builder();

  surface(b, (u, v) => P(Math.sin(PI * (u - 0.5)), v * TAU), D.nu || 104, D.nv || 60, outB, (p, n) => {
    if (n[1] < -0.5) return under;
    if (Math.abs(zN(p[2])) > 0.9 && p[1] < bot0(p[2]) + 0.07) return blk;
    return paint;
  });

  // Glass cabin: second loft sitting slightly into the body.
  const C = D.cab, roof = curve(C.roof), cabH = (z) => Math.max(0, roof(z) - top(z)), zMid = (C.z0 + C.z1) / 2;
  surface(b, (u, v) => {
    const z = lerp(C.z0, C.z1, u), phi = v * PI, H = cabH(z) + 0.105, qy = S(Math.sin(phi), 0.38);
    return [-S(Math.cos(phi), 0.8) * C.wb * half(z) * (1 - C.taper * Math.pow(qy, 1.6)), top(z) - 0.12 + H * qy, z];
  }, D.cnu || 72, D.cnv || 44, (x, y, z) => [x * 2, y - top(z) + 0.45, (z - zMid) * 0.6], (p, n, u, v) => {
    const z = p[2], k = Math.abs(Math.cos(v * PI)), hc = cabH(z);
    const qy = (p[1] - (top(z) - 0.12)) / (hc + 0.105);
    if (hc < 0.025 || qy < 0.1) return paint;
    if (n[2] > 0.3) return k > 0.8 ? roofM : glass;               // windscreen + A-pillars
    if (n[2] < -0.2 && z < C.zRT) return k > 0.72 ? paint : glass; // rear screen + C-pillars
    if (qy < 0.15) return D.chromeTrim ? chrome : blk;              // window trim
    if (qy > 0.86) return roofM;
    if (Math.abs(z - C.zB) < 0.05) return blk;                      // B-pillar
    if (z < C.zQ) return paint;
    return glass;
  });

  // Decals resampled from the body surface. t ranges are in units of PI around the section.
  const one = (zn0, zn1, t0, t1, nu, nv, m, off, dst = b) =>
    surface(dst, (s, t) => P(lerp(zn0, zn1, s), lerp(t0, t1, t) * PI), nu, nv, outB, () => m, { off });
  const pair = (zn0, zn1, t0, t1, nu, nv, m, off, dst = b) => {
    one(zn0, zn1, t0, t1, nu, nv, m, off, dst); one(zn0, zn1, 2 - t1, 2 - t0, nu, nv, m, off, dst);
  };
  // Headlights: dark chrome housing, LED daytime strip, projector lamp.
  const [h0, h1, ht0, ht1] = D.head;
  pair(h0 - 0.012, Math.min(1, h1 + 0.01), ht0 - 0.02, ht1 + 0.02, 14, 8, [hex('#23262b'), CHROME], 0.003);
  pair(h0 + 0.015, h1, ht1 - 0.035, ht1 - 0.008, 14, 3, [hex('#fff7ea'), 0.95], 0.006);
  pair(lerp(h0, h1, 0.45), lerp(h0, h1, 0.88), ht0 + 0.015, lerp(ht0, ht1, 0.55), 6, 6, [hex('#fff1d6'), 0.8], 0.006);
  // Tail lights: red glass housing + lit strip; brake overlay in its own mesh.
  const [t0, t1, tt0, tt1] = D.tail, ta = lerp(tt0, tt1, 0.3), tb = lerp(tt0, tt1, 0.72);
  pair(t0 - 0.008, t1 - 0.012, tt0 - 0.02, tt1 + 0.02, 14, 8, [hex('#5a0a0e'), GLASS], 0.003);
  pair(t0, t1, ta, tb, 14, 4, [hex('#c0141b'), 0.6], 0.006);
  pair(t0 + 0.002, t1 - 0.004, ta - 0.01, tb + 0.01, 12, 4, [hex('#ff2a16'), 1], 0.009, br);
  if (D.bar) {
    one(-1, -0.972, ta, 2 - ta, 4, 24, [hex('#c0141b'), 0.6], 0.006);
    one(-1, -0.972, ta, 2 - ta, 4, 24, [hex('#ff2a16'), 1], 0.009, br);
  }
  // Grille / intake, rear diffuser, side skirts.
  pair(0.935, 1, 0.2, 0.5, 8, 10, blk, 0.003);
  one(-1, -0.91, -0.32, 0.32, 8, 12, blk, 0.003);
  pair(zN(-sp.axle + Ra + 0.03), zN(sp.axle - Ra - 0.03), 0.3, 0.42, 30, 3, blk, 0.002);
  // Panel gaps and handles.
  const seam = [hex('#060607'), RUBBER], g = 0.0035 / Lh, gt = 0.003;
  for (const z of D.door) pair(zN(z) - g, zN(z) + g, 0.43, 0.8, 1, 12, seam, 0.0016);
  pair(zN(D.door[D.door.length - 1]), zN(D.door[0]), 0.43 - gt, 0.43 + gt, 16, 1, seam, 0.0016);
  if (D.hood) {
    one(zN(D.hood) - g, zN(D.hood) + g, 0.76, 1.24, 1, 16, seam, 0.0016);
    pair(zN(C.z1), zN(D.hood), 0.76 - gt, 0.76 + gt, 16, 1, seam, 0.0016);
  }
  if (D.trunk) {
    one(zN(D.trunk) - g, zN(D.trunk) + g, 0.76, 1.24, 1, 16, seam, 0.0016);
    pair(-0.97, zN(D.trunk), 0.76 - gt, 0.76 + gt, 10, 1, seam, 0.0016);
  }
  for (const z of D.handles) pair(zN(z - 0.07), zN(z + 0.07), 0.66, 0.69, 4, 2, chrome, 0.004);

  // Number plates (white private / yellow kei) with raised characters.
  const pl = hex(opt.plate || '#eeefe8'), ink = hex(opt.plateInk || '#1f6a3c');
  const plate = (z, y, dir) => {
    b.box(0, y, z, 0.33, 0.165, 0.012, pl, { ao: 1 });
    for (let i = 0; i < 4; i++) b.box(-0.093 + i * 0.062, y + 0.022, z + dir * 0.008, 0.038, 0.07, 0.006, ink, { ao: 1 });
    b.box(0, y + 0.11, z + dir * 0.008, 0.15, 0.03, 0.006, ink, { ao: 1 });
  };
  plate(sp.front - 0.004, (bot(sp.front - 0.03) + top(sp.front - 0.03)) / 2 - 0.09, 1);
  plate(sp.rear + 0.004, (bot(sp.rear + 0.03) + top(sp.rear + 0.03)) / 2 - 0.07, -1);

  // Door mirrors: painted shells, mirror glass facing back, black stalks.
  const mz = D.mirrorZ, mw = C.wb * half(mz), my = top(mz) + 0.05;
  for (const sx of [-1, 1]) {
    const cx = sx * (mw + 0.12), cy = my + 0.05;
    surface(b, (u, v) => {
      const a = u * TAU, ph = v * PI;
      return [cx + 0.09 * Math.sin(ph) * Math.cos(a), cy + 0.055 * Math.cos(ph), mz + 0.065 * Math.sin(ph) * Math.sin(a)];
    }, 16, 10, (x, y, z) => [x - cx, y - cy, z - mz], (p, n) => (n[2] < -0.55 ? [hex('#9aa3ab'), CHROME] : paint));
    b.box(sx * (mw + 0.05), my, mz + 0.01, 0.12, 0.035, 0.06, hex('#141518'), { ao: 1 });
  }

  // Exhaust tips.
  for (const ex of D.exhaust) {
    const cy = bot0(sp.rear + 0.05) + 0.07, z0 = sp.rear - 0.03, rr = 0.04;
    surface(b, (u, v) => [ex + rr * Math.cos(u * TAU), cy + rr * Math.sin(u * TAU), z0 + v * 0.18], 16, 1,
      (x, y) => [x - ex, y - cy, 0], () => [hex('#c9cdd2'), CHROME]);
    surface(b, (u, v) => [ex + rr * 0.8 * Math.cos(u * TAU), cy + rr * 0.8 * Math.sin(u * TAU), z0 + 0.01 + v * 0.15], 16, 1,
      (x, y) => [ex - x, cy - y, 0], () => [hex('#0b0b0c'), RUBBER]);
  }

  // Wheel-well liners so you can't see under the car through the arches.
  const liner = hex('#0c0d0f');
  for (const za of [sp.axle, -sp.axle]) for (const sx of [-1, 1]) {
    const x = sx * Math.max(0.1, sp.track - sp.w * 0.5 - 0.04), R2 = Ra + 0.02;
    for (let i = 0; i < 12; i++) {
      const a0 = (PI * i) / 12, a1 = (PI * (i + 1)) / 12, A = [x, wy, za];
      const B = [x, wy + Math.sin(a0) * R2, za + Math.cos(a0) * R2], Cc = [x, wy + Math.sin(a1) * R2, za + Math.cos(a1) * R2];
      face4(b, A, B, Cc, A, liner, RUBBER, [1, 0, 0]);
      face4(b, A, B, Cc, A, liner, RUBBER, [-1, 0, 0]);
    }
  }

  // Taxi roof sign (andon) and body stripe.
  if (opt.taxi) {
    const z = D.signZ, y = roof(z) - 0.012;
    b.box(0, y, z, 0.48, 0.03, 0.24, hex('#2a2c30'), { ao: 1 });
    b.box(0, y + 0.025, z, 0.42, 0.15, 0.19, hex('#f6e8c6'), { em: 0.9, ao: 1 });
  }
  if (opt.stripe) pair(-0.85, 0.82, 0.55, 0.585, 40, 2, [hex(opt.stripe), PAINT], 0.0022);
  return { body: b, brake: br, spec: sp };
}

function buildWheel(R, Wd, rimHex, chromeRim) {
  const b = new Builder(), hw = Wd / 2;
  const tyre = hex('#151619'), wall = hex('#1d1e21'), rim = hex(rimHex), disc = hex('#6b6e72'), cap = hex('#d4d7da');
  const rimMat = chromeRim ? CHROME : SATIN;
  // Tyre: bead -> bulging sidewall -> rounded shoulder -> tread with three grooves -> mirror.
  const T = [[0.66, -1.0], [0.8, -1.05], [0.92, -1.01], [0.975, -0.9], [0.995, -0.78], [1, -0.7], [1, -0.42], [0.982, -0.4],
    [0.982, -0.33], [1, -0.31], [1, -0.05], [0.985, -0.03], [0.985, 0.03], [1, 0.05], [1, 0.31], [0.982, 0.33], [0.982, 0.4],
    [1, 0.42], [1, 0.7], [0.995, 0.78], [0.975, 0.9], [0.92, 1.01], [0.8, 1.05], [0.66, 1.0]];
  lathe(b, T.map(([r, x]) => [r * R, x * hw]), 48, (x, y, z) => [x * 6, y, z], (p) => [Math.abs(p[0]) > hw * 0.84 ? wall : tyre, RUBBER]);
  // Rim: lip -> deep dish -> barrel -> dish -> lip. Visible faces look outward axially / inward radially.
  const RP = [[0.655, -1.0], [0.685, -0.97], [0.67, -0.9], [0.6, -0.74], [0.565, -0.45], [0.565, 0.45], [0.6, 0.74], [0.67, 0.9], [0.685, 0.97], [0.655, 1.0]];
  const rimOut = (x, y, z) => { const r = Math.hypot(y, z) || 1; return [Math.sign(x) || 1, -y / r, -z / r]; };
  lathe(b, RP.map(([r, x]) => [r * R, x * hw]), 48, rimOut, () => [rim, rimMat]);
  // Brake disc behind the spokes.
  lathe(b, [[0.14, -0.1], [0.52, -0.1], [0.52, 0.1], [0.14, 0.1]].map(([r, x]) => [r * R, x * hw]), 32, (x, y, z) => [x * 8, y, z], () => [disc, SATIN]);
  // Five twin spokes per face (both faces, since one mesh is used for all four corners) + centre cap.
  for (const sg of [-1, 1]) {
    const fh = sg * hw * 0.6, fr = sg * hw * 0.74, dep = sg * hw * 0.22, rh = 0.16 * R, rr = 0.6 * R, wH = 0.035 * R, wR = 0.022 * R;
    const Pp = (r, a, x) => [x, r * Math.cos(a), r * Math.sin(a)];
    for (let k = 0; k < 5; k++) for (const tw of [-1, 1]) {
      const a0 = (k * TAU) / 5, ah = a0 + tw * 0.11, ar = a0 + tw * 0.2;
      const hL = Pp(rh, ah - wH / rh, fh), hR = Pp(rh, ah + wH / rh, fh), rL = Pp(rr, ar - wR / rr, fr), rRt = Pp(rr, ar + wR / rr, fr);
      const bk = (p) => [p[0] - dep, p[1], p[2]];
      const quads = [[hL, hR, rRt, rL], [bk(hL), bk(hR), bk(rRt), bk(rL)], [hL, rL, bk(rL), bk(hL)], [hR, rRt, bk(rRt), bk(hR)]];
      const all = quads.flat(), cen = [0, 1, 2].map((i) => all.reduce((s, p) => s + p[i], 0) / all.length);
      for (const q of quads) {
        const fc = [0, 1, 2].map((i) => (q[0][i] + q[1][i] + q[2][i] + q[3][i]) / 4 - cen[i]);
        face4(b, q[0], q[1], q[2], q[3], rim, rimMat, fc);
      }
    }
    const CP = [[0.0, 0.66], [0.1, 0.655], [0.17, 0.6], [0.19, 0.5]].map(([r, x]) => [r * R, sg * x * hw]);
    lathe(b, CP, 24, (x, y, z) => [Math.sign(x), y * 0.2, z * 0.2], () => [cap, CHROME]);
  }
  return b;
}

export function buildVehicle(style = 'coupe', paint = '#b3161d', opt = {}) {
  const D = DESIGNS[style] || DESIGNS.coupe;
  Q = opt.lod > 0 && opt.lod < 1 ? opt.lod : 1;
  try {
    const { body, brake, spec } = makeBody(D, paint, opt);
    const wheel = buildWheel(spec.r, spec.w, opt.rim || D.rim || '#c3c8ce', !!opt.chromeRim);
    return { body, brake, wheel, spec: { ...spec } };
  } finally { Q = 1; }
}
