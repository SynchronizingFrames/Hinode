// Aoshima residential quarter (first district). Deterministic: same seed, same town.
// Everything static is merged into 40 m chunks so the renderer can skip far/behind chunks.
import { Builder, hex } from '../engine/geometry.js';
import { rng } from '../engine/math.js';
import { Collision } from '../game/collision.js';
import { depot } from './depot.js';
import { buildTokyo } from './tokyo.js';
import { FAMILY } from '../data/names.js';

export const CHUNK = 40;
const EDGE = 80;

// Street network. axis 'x' = runs east-west at z=c; axis 'z' = runs north-south at x=c.
export const ROADS = [
  { id: 'asahi', name: 'Asahi-dōri', axis: 'x', c: 0, w: 7, lines: true, center: true },
  { id: 'minato', name: 'Minato-dōri', axis: 'z', c: 0, w: 6, lines: true },
  { id: 'lane-n', axis: 'x', c: -40, w: 4.2 },
  { id: 'lane-s', axis: 'x', c: 40, w: 4.2 },
  { id: 'lane-w', axis: 'z', c: -42, w: 4 },
  { id: 'lane-e', axis: 'z', c: 40, w: 4 },
  { id: 'rim-n', axis: 'x', c: -EDGE, w: 3.6 },
  { id: 'rim-s', axis: 'x', c: EDGE, w: 3.6 },
  { id: 'rim-w', axis: 'z', c: -EDGE, w: 3.6 },
  { id: 'rim-e', axis: 'z', c: EDGE, w: 3.6 },
];

const C = {
  asphalt: hex('#3b3e44'), asphaltLane: hex('#45474c'), line: hex('#e9e6dc'), lineY: hex('#e0b23a'),
  lot: hex('#9a9283'), gravel: hex('#a69d8c'), grass: hex('#6f8a4f'), grassD: hex('#5b7442'), sand: hex('#d6c39d'),
  concrete: hex('#b9b4a8'), block: hex('#aaa59a'), plinth: hex('#8e8c86'),
  walls: ['#e8dcc4', '#efe8dc', '#d9c4a2', '#cbc7bf', '#b9bfa6', '#e1c3a9', '#d2c9b8'].map((h) => hex(h)),
  wood: hex('#5b3f2c'), woodL: hex('#8a6440'), plaster: hex('#eee7da'),
  roofs: ['#4a5563', '#3b3f46', '#7e5238', '#56635a', '#5d4a44'].map((h) => hex(h)),
  frame: hex('#c8ccd0'), glass: hex('#5d7384'), glassLit: hex('#ffd9a0'), door: hex('#6e4a30'), steel: hex('#8b949c'),
  pole: hex('#9c9b95'), wire: hex('#1d1d1f'), lamp: hex('#fff1cf'), red: hex('#c8322b'), orange: hex('#e8742c'),
  leaf: [hex('#3f6b3a'), hex('#4e7d3f'), hex('#365c37'), hex('#5c8a46')], trunk: hex('#5a4330'),
  cloth: ['#f2efe6', '#a9c4d8', '#e7b7b0', '#e9d9a6', '#9fb59a'].map((h) => hex(h)),
};

class Chunks {
  constructor() { this.map = new Map(); }
  at(x, z) {
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK), k = cx + ',' + cz;
    let c = this.map.get(k);
    if (!c) { c = { cx, cz, x: (cx + 0.5) * CHUNK, z: (cz + 0.5) * CHUNK, b: new Builder() }; this.map.set(k, c); }
    return c.b;
  }
}

const roadEdges = (r) => [r.c - r.w / 2, r.c + r.w / 2];

// Procedural surface materials understood by the world shader (renderer.js WORLD_FS, alpha = -0.05 * id).
export const MAT = { plaster: -0.05, tile: -0.1, wood: -0.15, block: -0.2, asphalt: -0.25, glass: -0.3, concrete: -0.35, metal: -0.4, grass: -0.45 };
const SATIN = -5;   // vehicle satin-metal shader, reused for grates, manholes, fittings
// Position hash for new detail choices (keeps the main RNG stream, and so the layout, unchanged).
const hr = (x, z, k = 0) => { const v = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453; return v - Math.floor(v); };
const edges = (r) => { const [a, b] = roadEdges(r); return [Math.min(a, b), Math.max(a, b)]; };
const spans = (s, e, cuts) => {
  let out = [[s, e]];
  for (const [c0, c1] of cuts) out = out.flatMap(([a0, a1]) => (c1 <= a0 || c0 >= a1 ? [[a0, a1]] : [[a0, c0], [c1, a1]].filter(([p, q]) => q - p > 0.05)));
  return out;
};

function buildRoads(ch) {
  const L = EDGE + 2;
  for (const r of ROADS) {
    const [a, b] = roadEdges(r);
    const col = r.w >= 6 ? C.asphalt : C.asphaltLane;
    // Split long roads into chunk-sized strips so culling works.
    for (let s = -L; s < L; s += CHUNK / 2) {
      const e = Math.min(L, s + CHUNK / 2);
      if (r.axis === 'x') ch.at((s + e) / 2, r.c).ground(s, a, e, b, 0.02, col, MAT.asphalt);
      else ch.at(r.c, (s + e) / 2).ground(a, s, b, e, 0.021, col, MAT.asphalt);
      // Concrete gutters along both edges with steel grates, broken where another road crosses.
      const cuts = ROADS.filter((o) => o.axis !== r.axis).map(edges);
      const [ea, eb] = edges(r);
      for (const [g0, g1] of [[ea, ea + 0.38], [eb - 0.38, eb]]) for (const [p, q] of spans(s, e, cuts)) {
        if (r.axis === 'x') ch.at((p + q) / 2, r.c).ground(p, g0, q, g1, 0.028, C.concrete, MAT.concrete);
        else ch.at(r.c, (p + q) / 2).ground(g0, p, g1, q, 0.029, C.concrete, MAT.concrete);
        for (let t = Math.ceil((p + 2) / 9) * 9; t < q - 1; t += 9) {
          if (r.axis === 'x') ch.at(t, r.c).ground(t, g0 + 0.05, t + 0.6, g1 - 0.05, 0.034, C.steel, SATIN);
          else ch.at(r.c, t).ground(g0 + 0.05, t, g1 - 0.05, t + 0.6, 0.035, C.steel, SATIN);
        }
      }
      if (r.lines) {
        const t = 0.15, inset = 0.45;
        for (const off of [a + inset, b - inset - t]) {
          if (r.axis === 'x') ch.at((s + e) / 2, r.c).ground(s, off, e, off + t, 0.035, C.line);
          else ch.at(r.c, (s + e) / 2).ground(off, s, off + t, e, 0.035, C.line);
        }
      }
      if (r.center) {
        for (let d = s; d < e; d += 6) {
          if (r.axis === 'x') ch.at(d, r.c).ground(d, r.c - 0.07, d + 3, r.c + 0.07, 0.036, C.line);
        }
      }
    }
  }
  // Zebra crossings at the big intersection.
  const zebra = (x0, z0, alongX, n) => {
    for (let i = 0; i < n; i++) {
      if (alongX) ch.at(x0, z0).ground(x0 + i * 0.9, z0, x0 + i * 0.9 + 0.45, z0 + 2.6, 0.04, C.line);
      else ch.at(x0, z0).ground(x0, z0 + i * 0.9, x0 + 2.6, z0 + i * 0.9 + 0.45, 0.04, C.line);
    }
  };
  zebra(-3, 4.2, true, 7); zebra(-3, -6.8, true, 7); zebra(3.8, -3.3, false, 8); zebra(-6.4, -3.3, false, 8);
  // Manholes on the main roads, clear of intersections.
  for (const r of ROADS) if (r.w >= 6) {
    const cuts = ROADS.filter((o) => o.axis !== r.axis).map(edges);
    let i = 0;
    for (let t = -EDGE + 7; t < EDGE - 4; t += 17, i++) {
      if (cuts.some(([c0, c1]) => t > c0 - 2.5 && t < c1 + 2.5)) continue;
      const off = r.c + (i % 2 ? 1.7 : -1.7);
      const [mx, mz] = r.axis === 'x' ? [t, off] : [off, t];
      ch.at(mx, mz).cyl(mx, 0.02, mz, 0.34, 0.02, hex('#4a4c50'), 18, SATIN);
      ch.at(mx, mz).cyl(mx, 0.02, mz, 0.24, 0.024, hex('#3d3f43'), 14, SATIN);
    }
  }
  // Stop lines where the narrow lanes meet a main road.
  for (const mn of ROADS) if (mn.w < 6) for (const mj of ROADS) if (mj.w >= 6 && mj.axis !== mn.axis) {
    const [m0, m1] = edges(mj), [a, b] = edges(mn);
    for (const t of [m0 - 1.3, m1 + 1.0]) {
      if (mn.axis === 'x') ch.at(t, mn.c).ground(t, a + 0.3, t + 0.3, b - 0.3, 0.037, C.line);
      else ch.at(mn.c, t).ground(a + 0.3, t, b - 0.3, t + 0.3, 0.037, C.line);
    }
  }
}

const LAMPS = []; // [x, y, z, intensity] for night lighting, collected while building
function pole(ch, col, x, z, lampDir) {
  const b = ch.at(x, z);
  b.cyl(x, 0, z, 0.17, 9.6, C.pole, 8, 0, 0.13);
  b.box(x, 8.6, z, 1.5, 0.12, 0.12, C.pole, { ao: 1 });
  b.box(x, 7.7, z, 1.1, 0.1, 0.1, C.pole, { ao: 1 });
  b.cyl(x + 0.32, 6.6, z + 0.22, 0.2, 0.62, hex('#7d8086'), 8);              // transformer
  b.box(x, 2.1, z, 0.36, 1.1, 0.36, hex('#e9d36a'), { ao: 1 });               // yellow guard sleeve
  b.box(x, 2.1, z, 0.37, 0.12, 0.37, hex('#2b2b2b'), { ao: 1 });
  if (lampDir) {
    const [dx, dz] = lampDir;
    b.beam([x, 5.4, z], [x + dx * 1.4, 5.65, z + dz * 1.4], 0.07, C.pole);
    b.box(x + dx * 1.45, 5.45, z + dz * 1.45, 0.42, 0.14, 0.22, C.lamp, { em: 1, ao: 1, yaw: dx ? Math.PI / 2 : 0 });
    LAMPS.push([x + dx * 1.45, 5.25, z + dz * 1.45, 1.0]);
  }
  col.addCircle(x, z, 0.2, 0, 9.6, 'pole');
}

function wires(ch, a, b) {
  for (const [h, off] of [[8.62, -0.6], [8.62, 0.6], [7.72, 0.45]]) {
    const along = Math.abs(b[0] - a[0]) > Math.abs(b[2] - a[2]);
    const ox = along ? 0 : off, oz = along ? off : 0;
    let prev = [a[0] + ox, h, a[2] + oz];
    for (let i = 1; i <= 6; i++) {
      const t = i / 6, sag = Math.sin(t * Math.PI) * 0.55;
      const p = [a[0] + (b[0] - a[0]) * t + ox, h - sag, a[2] + (b[2] - a[2]) * t + oz];
      ch.at(p[0], p[2]).beam(prev, p, 0.03, C.wire);
      prev = p;
    }
  }
}

function buildPoles(ch, col) {
  for (const r of ROADS) {
    if (r.id.startsWith('rim')) continue;
    const [a] = roadEdges(r);
    const side = a + 0.25;
    let prev = null;
    for (let s = -EDGE + 11; s <= EDGE - 6; s += 23) {
      const x = r.axis === 'x' ? s : side, z = r.axis === 'x' ? side : s;
      // Keep intersections clear.
      if (ROADS.some((o) => o.axis !== r.axis && Math.abs((r.axis === 'x' ? x : z) - o.c) < o.w / 2 + 1.8)) { prev = null; continue; }
      const lamp = r.axis === 'x' ? [0, 1] : [1, 0];
      pole(ch, col, x, z, ((s / 23) | 0) % 2 === 0 ? lamp : null);
      if (prev) wires(ch, prev, [x, 0, z]);
      prev = [x, 0, z];
    }
  }
}

function tree(b, col, x, z, r, s = 1) {
  b.cyl(x, 0, z, 0.14 * s, 2.2 * s, C.trunk, 6);
  const leaf = r.pick(C.leaf);
  b.blob(x, 2.6 * s, z, 1.25 * s, leaf, 0.8, 7);
  b.blob(x + 0.6 * s, 2.2 * s, z + 0.3 * s, 0.85 * s, r.pick(C.leaf), 0.8, 6);
  b.blob(x - 0.5 * s, 3.1 * s, z - 0.3 * s, 0.8 * s, r.pick(C.leaf), 0.8, 6);
  col.addCircle(x, z, 0.25 * s, 0, 3, 'tree');
}

function pot(b, x, z, r) {
  b.cyl(x, 0, z, 0.22, 0.32, hex('#9a5a3a'), 7, 0, 0.27);
  b.blob(x, 0.5, z, 0.3, r.pick(C.leaf), 0.8, 5);
}

// One detached house on a lot. (x,z) = lot centre, yaw = which way the front faces.
function house(ch, col, r, x, z, lotW, lotD, yaw) {
  const b = ch.at(x, z);
  const fx = Math.round(Math.sin(yaw)), fz = Math.round(Math.cos(yaw));   // front normal
  const sx = fz, sz = -fx;                                               // right-hand tangent
  const W = (lx, lz) => [x + lx * sx + lz * fx, z + lx * sz + lz * fz];
  const trad = r.chance(0.3);
  const w = Math.min(lotW - 2.2, r.range(7, 9.5)), d = Math.min(lotD - 5, r.range(7, 9));
  const set = lotD / 2 - 2.6 - d / 2;                                    // centre offset toward the back
  const [hx, hz] = W(0, -set + 0.4);
  const ww = fx ? d : w, wd = fx ? w : d;                                // world-axis footprint
  const wall = trad ? C.wood : r.pick(C.walls);
  const upper = trad ? C.plaster : r.chance(0.35) ? r.pick(C.walls) : wall;
  const roof = r.pick(C.roofs);

  b.box(hx, 0, hz, ww + 0.2, 0.45, wd + 0.2, C.plinth, { ao: 0.75, em: MAT.concrete });
  b.box(hx, 0.45, hz, ww, 2.75, wd, wall, { em: trad ? MAT.wood : MAT.plaster });
  b.box(hx, 3.2, hz, ww, 2.6, wd, upper, { ao: 0.92, em: MAT.plaster });
  b.box(hx, 3.12, hz, ww + 0.16, 0.1, wd + 0.16, trad ? C.wood : hex('#8d877c'), { ao: 1, em: trad ? MAT.wood : MAT.concrete });
  const rise = r.range(1.6, 2.3);
  // Eaves: soffit + fascia under the overhang, then the roof (glazed kawara, or metal on some newer houses).
  b.box(hx, 5.64, hz, ww + 0.96, 0.15, wd + 0.96, trad ? C.wood : hex('#e7e4dc'), { ao: 1, bottom: true, em: trad ? MAT.wood : MAT.plaster });
  b.mat = trad || hr(x, z, 1) < 0.72 ? MAT.tile : MAT.metal; b.matV = trad ? MAT.wood : MAT.plaster;
  if (r.chance(0.55)) b.hip(hx, 5.8, hz, ww, wd, rise, roof);
  else b.gable(hx, 5.8, hz, ww, wd, rise, roof, ww >= wd, 0.5, trad ? C.wood : upper.map((v) => v * 0.9));
  b.mat = 0; b.matV = null;
  { // Half-round gutters along both eaves and a downpipe at a front corner.
    const gc = trad ? hex('#4d4237') : hex('#d6d3cb'), hz0 = -set + 0.4, ez = d / 2 + 0.5;
    for (const sg of [1, -1]) {
      const [g0x, g0z] = W(-w / 2 - 0.5, hz0 + sg * ez), [g1x, g1z] = W(w / 2 + 0.5, hz0 + sg * ez);
      b.beam([g0x, 5.62, g0z], [g1x, 5.62, g1z], 0.11, gc);
    }
    const ds = hr(x, z, 2) < 0.5 ? -1 : 1;
    const [p0x, p0z] = W(ds * (w / 2 + 0.4), hz0 + ez), [p1x, p1z] = W(ds * (w / 2 + 0.07), hz0 + d / 2 + 0.07);
    b.beam([p0x, 5.6, p0z], [p1x, 5.05, p1z], 0.065, gc);
    b.beam([p1x, 5.05, p1z], [p1x, 0.12, p1z], 0.065, gc);
  }
  col.addBox(hx - ww / 2 - 0.1, hz - wd / 2 - 0.1, hx + ww / 2 + 0.1, hz + wd / 2 + 0.1, 0, 7.5, 'house');

  // Front face position.
  const front = (lx, lzOff = 0) => W(lx, -set + 0.4 + d / 2 + lzOff);
  const win = (lx, y, ww2, hh, lit) => {
    const [px, pz] = front(lx);
    b.panel(px, y - 0.08, pz, ww2 + 0.16, hh + 0.16, fx, fz, C.frame, 0, 0.03);
    b.panel(px, y, pz, ww2, hh, fx, fz, lit ? C.glassLit.map((v) => v * 0.55) : C.glass, lit ? r.range(0.3, 0.5) : MAT.glass, 0.045);
    const [mx2, mz2] = front(lx, 0.05);
    b.box(mx2, y, mz2, fx ? 0.05 : 0.045, hh, fx ? 0.045 : 0.05, C.frame, { ao: 1, em: SATIN });
    const [sx3, sz3] = front(lx, 0.08);
    b.box(sx3, y - 0.15, sz3, fx ? 0.16 : ww2 + 0.36, 0.06, fx ? ww2 + 0.36 : 0.16, hex('#bdb9b0'), { ao: 1, em: MAT.concrete });
    b.box(sx3, y + hh + 0.08, sz3, fx ? 0.11 : ww2 + 0.28, 0.05, fx ? ww2 + 0.28 : 0.11, C.frame, { ao: 1, em: SATIN });
    if (!trad && y > 3 && hr(px, pz, 3) < 0.55) {
      const [tx, tz] = front(lx + (lx >= 0 ? 1 : -1) * (ww2 / 2 + 0.34), 0.07);
      b.box(tx, y - 0.1, tz, fx ? 0.13 : 0.56, hh + 0.22, fx ? 0.56 : 0.13, hex('#a29e94'), { ao: 0.95, em: MAT.metal });
    }
    if (trad) for (let i = -2; i <= 2; i++) { const [qx, qz] = front(lx + i * ww2 / 5); b.box(qx + fx * 0.06, y, qz + fz * 0.06, 0.05, hh, 0.05, C.woodL, { ao: 1 }); }
  };
  const doorX = r.chance(0.5) ? -w / 2 + 1.3 : w / 2 - 1.3;
  win(-doorX * 0.45, 1.25, 1.6, 1.15, r.chance(0.6));
  win(-w / 4, 3.9, 1.3, 1.05, r.chance(0.55));
  win(w / 4, 3.9, 1.3, 1.05, r.chance(0.45));
  // Side windows.
  for (const side of [-1, 1]) {
    const [px, pz] = W(side * w / 2, -set + 0.4);
    b.panel(px, 3.95, pz, 0.9, 0.9, side * sx, side * sz, C.frame, 0, 0.03);
    const l1 = r.chance(0.5), l2 = r.chance(0.5);
    b.panel(px, 4.02, pz, 0.74, 0.76, side * sx, side * sz, l1 ? C.glassLit.map((v) => v * 0.55) : C.glass, l1 && l2 ? 0.35 : l1 ? 0.25 : MAT.glass, 0.045);
  }
  // Entrance: door, canopy, step, house light.
  const [dx, dz] = front(doorX);
  b.panel(dx, 0.4, dz, 1.4, 2.28, fx, fz, C.frame, SATIN, 0.02);
  b.panel(dx, 0.45, dz, 1.15, 2.1, fx, fz, C.door, MAT.wood, 0.03);
  b.panel(dx + sx * 0.38, 1.1, dz + sz * 0.38, 0.16, 1.0, fx, fz, C.glassLit.map((v) => v * 0.5), 0.3, 0.05);
  const [cx, cz] = front(doorX, 0.45);
  b.box(cx, 2.75, cz, fx ? 0.9 : 1.6, 0.1, fx ? 1.6 : 0.9, roof, { ao: 1, em: MAT.metal, bottom: true });
  const [sx2, sz2] = front(doorX, 0.5);
  b.box(sx2, 0, sz2, fx ? 1.0 : 1.5, 0.22, fx ? 1.5 : 1.0, C.concrete, { ao: 0.85, em: MAT.concrete });
  const [lx2, lz2] = front(doorX + (doorX > 0 ? -0.85 : 0.85), 0.06);
  b.box(lx2, 2.15, lz2, 0.16, 0.2, 0.16, C.lamp, { em: 0.9, ao: 1 });
  if (trad) { const [nx, nz] = front(doorX, 0.08); b.panel(nx, 1.75, nz, 1.1, 0.55, fx, fz, hex('#2f4a6b'), 0, 0.06); } // noren

  // Balcony with laundry.
  if (!trad && r.chance(0.6)) {
    const bw = w * 0.55, bx = -doorX * 0.3;
    const [px, pz] = front(bx, 0.55);
    b.box(px, 3.12, pz, fx ? 1.1 : bw, 0.14, fx ? bw : 1.1, C.concrete, { ao: 1, em: MAT.concrete, bottom: true });
    const rail = (o) => front(bx + o, 1.08);
    const [r0x, r0z] = rail(-bw / 2), [r1x, r1z] = rail(bw / 2);
    b.beam([r0x, 4.1, r0z], [r1x, 4.1, r1z], 0.05, C.steel);
    b.beam([r0x, 3.6, r0z], [r1x, 3.6, r1z], 0.04, C.steel);
    for (let i = 0; i <= 6; i++) { const [qx, qz] = rail(-bw / 2 + (bw * i) / 6); b.beam([qx, 3.26, qz], [qx, 4.1, qz], 0.035, C.steel); }
    const [p0x, p0z] = front(bx - bw / 2 + 0.2, 0.75), [p1x, p1z] = front(bx + bw / 2 - 0.2, 0.75);
    b.beam([p0x, 5.05, p0z], [p1x, 5.05, p1z], 0.04, C.steel);
    const n = r.int(2, 4);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, cxp = p0x + (p1x - p0x) * t, czp = p0z + (p1z - p0z) * t;
      b.panel(cxp, 4.25, czp, r.range(0.45, 0.75), r.range(0.5, 0.75), fx, fz, r.pick(C.cloth), 0, 0);
      b.panel(cxp, 4.25, czp, r.range(0.45, 0.75), r.range(0.5, 0.75), -fx, -fz, r.pick(C.cloth), 0, 0.01);
    }
  }
  // Air conditioner on a side wall.
  { const side = doorX > 0 ? -1 : 1; const [px, pz] = W(side * (w / 2 + 0.2), -set + 0.4 + d / 4);
    b.box(px, 0.45, pz, fx ? 0.75 : 0.32, 0.58, fx ? 0.32 : 0.75, hex('#e6e4de'), { ao: 0.9 });
    const nx2 = side * sx, nz2 = side * sz;
    b.panel(px + nx2 * 0.16 - (fx ? 0 : 0) , 0.53, pz + nz2 * 0.16, 0.4, 0.42, nx2, nz2, hex('#34373c'), SATIN, 0.006);
    const [wx, wz] = W(side * (w / 2 + 0.05), -set + 0.4 + d / 4 + 0.48);
    b.box(wx, 0.7, wz, 0.1, 2.3, 0.1, hex('#dcd9cf'), { ao: 1 });
    const [ux, uz] = W(side * (w / 2 + 0.06), -set + 0.4 + d / 4 - 1.1);
    b.box(ux, 1.25, uz, fx ? 0.3 : 0.1, 0.38, fx ? 0.1 : 0.3, hex('#c9c6bd'), { ao: 1, em: SATIN });
    b.panel(ux + nx2 * 0.05, 1.42, uz + nz2 * 0.05, 0.16, 0.12, nx2, nz2, hex('#cfe3ea'), -2, 0.004); }

  // Block wall around the front garden, gap at the gate.
  const lineZ = lotD / 2 - 0.3;
  const seg = (lx0, lx1) => {
    if (lx1 - lx0 < 0.2) return;
    const [ax, az] = W((lx0 + lx1) / 2, lineZ);
    const len = lx1 - lx0;
    b.box(ax, 0, az, fx ? 0.16 : len, 1.15, fx ? len : 0.16, C.block, { ao: 0.8, top: hex('#c7c2b6'), em: MAT.block });
    const [e0x, e0z] = W(lx0, lineZ), [e1x, e1z] = W(lx1, lineZ);
    col.addBox(Math.min(e0x, e1x) - 0.1, Math.min(e0z, e1z) - 0.1, Math.max(e0x, e1x) + 0.1, Math.max(e0z, e1z) + 0.1, 0, 1.15, 'wall');
  };
  seg(-lotW / 2 + 0.3, doorX - 0.9); seg(doorX + 0.9, lotW / 2 - 0.3);
  const [mx, mz] = W(doorX + 1.1, lineZ + 0.1);
  b.box(mx, 0.75, mz, 0.34, 0.3, 0.34, hex('#3f4a52'), { ao: 1 });           // letterbox on the gate pillar
  // Side walls back to the house.
  for (const side of [-1, 1]) {
    const lx = side * (lotW / 2 - 0.3);
    const [a0x, a0z] = W(lx, lineZ), [a1x, a1z] = W(lx, -lotD / 2 + 0.5);
    const cx2 = (a0x + a1x) / 2, cz2 = (a0z + a1z) / 2, len = Math.hypot(a1x - a0x, a1z - a0z);
    b.box(cx2, 0, cz2, fx ? len : 0.16, 1.15, fx ? 0.16 : len, C.block, { ao: 0.8, top: hex('#c7c2b6'), em: MAT.block });
    col.addBox(Math.min(a0x, a1x) - 0.1, Math.min(a0z, a1z) - 0.1, Math.max(a0x, a1x) + 0.1, Math.max(a0z, a1z) + 0.1, 0, 1.15, 'wall');
  }
  // Garden: gravel, a tree, pots by the door.
  const [g0x, g0z] = W(-lotW / 2 + 0.4, lineZ - 0.1), [g1x, g1z] = W(lotW / 2 - 0.4, -lotD / 2 + 0.5);
  b.ground(Math.min(g0x, g1x), Math.min(g0z, g1z), Math.max(g0x, g1x), Math.max(g0z, g1z), 0.012, ...(r.chance(0.5) ? [C.gravel, MAT.asphalt] : [C.grassD, MAT.grass]));
  if (r.chance(0.55)) { const [tx, tz] = W(-doorX * 0.75, lineZ - 1.3); tree(b, col, tx, tz, r, r.range(0.75, 1.05)); }
  for (let i = 0; i < r.int(1, 3); i++) { const [px, pz] = front(doorX + (doorX > 0 ? -1.1 : 1.1) + i * 0.5 * Math.sign(-doorX || 1), 0.9); pot(b, px, pz, r); }
  // Where a courier stands to ring the bell, and the gate on the street side.
  return { kind: 'house', door: front(doorX, 1.45), gate: W(doorX, lineZ + 1.2) };
}

// Two-storey apartment block with an open corridor and stairs (the classic Japanese "apaato").
function apartment(ch, col, r, x, z, lotW, lotD, yaw) {
  const b = ch.at(x, z);
  const fx = Math.round(Math.sin(yaw)), fz = Math.round(Math.cos(yaw)), sx = fz, sz = -fx;
  const W = (lx, lz) => [x + lx * sx + lz * fx, z + lx * sz + lz * fz];
  const w = lotW - 3, d = 8.5, back = -lotD / 2 + d / 2 + 1.2;
  const [hx, hz] = W(0, back);
  const ww = fx ? d : w, wd = fx ? w : d;
  const wall = r.pick([hex('#d8d2c4'), hex('#c9b9a0'), hex('#bfc4c4')]);
  b.box(hx, 0, hz, ww, 6.2, wd, wall);
  b.box(hx, 6.2, hz, ww + 0.2, 0.5, wd + 0.2, wall.map((v) => v * 0.88), { ao: 1 });
  col.addBox(hx - ww / 2, hz - wd / 2, hx + ww / 2, hz + wd / 2, 0, 6.7, 'apartment');
  const front = (lx, o = 0) => W(lx, back + d / 2 + o);
  // Corridor slab + rail on the upper floor.
  const [cx, cz] = front(0, 0.7);
  b.box(cx, 3.0, cz, fx ? 1.4 : w, 0.2, fx ? w : 1.4, C.concrete, { ao: 1 });
  const [r0x, r0z] = front(-w / 2, 1.38), [r1x, r1z] = front(w / 2, 1.38);
  b.box((r0x + r1x) / 2, 3.2, (r0z + r1z) / 2, fx ? 0.08 : w, 0.95, fx ? w : 0.08, hex('#7f8a86'), { ao: 1 });
  const units = Math.max(3, Math.floor(w / 3.2));
  for (let f = 0; f < 2; f++) {
    for (let i = 0; i < units; i++) {
      const lx = -w / 2 + (i + 0.5) * (w / units);
      const [px, pz] = front(lx);
      const y = f * 3.2;
      b.panel(px - sx * 0.5, y + 0.05, pz - sz * 0.5, 0.85, 2.0, fx, fz, hex('#5a6b78'), 0, 0.03);
      const lit = r.chance(0.55);
      b.panel(px + sx * 0.6, y + 1.2, pz + sz * 0.6, 0.7, 0.55, fx, fz, lit ? C.glassLit.map((v) => v * 0.5) : C.glass, lit ? 0.4 : 0, 0.03);
      b.box(px + sx * 0.05, y + 2.35, pz + sz * 0.05, 0.12, 0.12, 0.12, C.lamp, { em: 0.8, ao: 1 });
    }
  }
  // External stair at one end.
  const [s0x, s0z] = front(w / 2 + 0.7, 2.2), [s1x, s1z] = front(w / 2 + 0.7, -1.6);
  for (let i = 0; i < 12; i++) {
    const t = i / 12, px = s0x + (s1x - s0x) * t, pz = s0z + (s1z - s0z) * t;
    b.box(px, t * 3.1, pz, fx ? 0.3 : 1.0, 0.08, fx ? 1.0 : 0.3, hex('#6f7a77'), { ao: 1 });
  }
  b.beam([s0x, 0, s0z], [s1x, 3.1, s1z], 0.1, hex('#6f7a77'));
  // Bicycle rack area: low roof + parked bikes are added with props later; lot surface now.
  const [g0x, g0z] = W(-lotW / 2 + 0.3, lotD / 2 - 0.3), [g1x, g1z] = W(lotW / 2 - 0.3, -lotD / 2 + 0.3);
  b.ground(Math.min(g0x, g1x), Math.min(g0z, g1z), Math.max(g0x, g1x), Math.max(g0z, g1z), 0.012, C.concrete);
  const [px, pz] = front(-w / 2 + 2, 3.2);
  b.box(px, 2.1, pz, fx ? 2.6 : 4.0, 0.08, fx ? 4.0 : 2.6, hex('#86a0a8'), { ao: 1 });
  for (const o of [-1.8, 1.8]) { const [qx, qz] = front(-w / 2 + 2 + o, 4.3); b.cyl(qx, 0, qz, 0.05, 2.1, C.steel, 6); col.addCircle(qx, qz, 0.08, 0, 2.1); }
  return { kind: 'apartment', door: front(-w / 2 + 0.5 * (w / units) - 0.5, 1.0), gate: W(0, lotD / 2 + 0.9) };
}

function vending(ch, col, x, z, yaw, body) {
  const b = ch.at(x, z);
  const fx = Math.round(Math.sin(yaw)), fz = Math.round(Math.cos(yaw));
  b.box(x, 0, z, fx ? 0.75 : 1.0, 1.85, fx ? 1.0 : 0.75, body, { ao: 0.85 });
  const px = x + fx * 0.38, pz = z + fz * 0.38;
  b.panel(px, 0.95, pz, 0.8, 0.78, fx, fz, hex('#f4f7fb'), 0.85, 0.01);
  const cans = ['#d33b2f', '#2f7bd3', '#f0c33c', '#3a9a5b', '#f07a2c', '#ffffff'].map((h) => hex(h));
  for (let row = 0; row < 3; row++) for (let i = 0; i < 6; i++) {
    const off = (i - 2.5) * 0.12;
    b.panel(px + fz * off, 1.0 + row * 0.25, pz - fx * off, 0.07, 0.15, fx, fz, cans[(i + row * 2) % 6], 0.75, 0.02);
  }
  b.panel(px, 0.25, pz, 0.5, 0.2, fx, fz, hex('#1c1c1e'), 0, 0.02);
  col.addBoxC(x, z, fx ? 0.75 : 1.0, fx ? 1.0 : 0.75, 0, 1.85, 'vending');
}

function postbox(ch, col, x, z) {
  const b = ch.at(x, z);
  b.cyl(x, 0, z, 0.12, 0.5, hex('#4a4a4a'), 6);
  b.box(x, 0.5, z, 0.52, 0.85, 0.42, C.red, { ao: 1 });
  b.box(x, 1.35, z, 0.58, 0.06, 0.48, C.red.map((v) => v * 0.85), { ao: 1 });
  b.panel(x, 1.12, z + 0.21, 0.3, 0.04, 0, 1, hex('#222222'), 0, 0.01);
  col.addCircle(x, z, 0.3, 0, 1.4, 'postbox');
}

function mirror(ch, col, x, z, yaw) {
  const b = ch.at(x, z);
  b.cyl(x, 0, z, 0.06, 2.8, C.orange, 6);
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  b.box(x + fx * 0.12, 2.6, z + fz * 0.12, fx ? 0.08 : 0.72, 0.72, fx ? 0.72 : 0.08, C.orange, { ao: 1, yaw: 0 });
  b.panel(x + fx * 0.12, 2.66, z + fz * 0.12, 0.56, 0.6, Math.round(fx), Math.round(fz), hex('#dfe7ee'), 0.55, 0.05);
  col.addCircle(x, z, 0.1, 0, 2.8, 'mirror');
}

function park(ch, col, r, x0, z0, x1, z1) {
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, b = ch.at(cx, cz);
  b.ground(x0 + 0.4, z0 + 0.4, x1 - 0.4, z1 - 0.4, 0.012, C.grass);
  b.ground(cx - 7, cz - 6, cx + 7, cz + 6, 0.016, C.sand);
  // Low fence with openings on two sides.
  const fence = (ax, az, bx, bz) => {
    b.beam([ax, 0.55, az], [bx, 0.55, bz], 0.06, hex('#7c8c6e'));
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 1.6);
    for (let i = 0; i <= n; i++) { const t = i / n; b.box(ax + (bx - ax) * t, 0, az + (bz - az) * t, 0.08, 0.6, 0.08, hex('#7c8c6e'), { ao: 1 }); }
    col.addBox(Math.min(ax, bx) - 0.05, Math.min(az, bz) - 0.05, Math.max(ax, bx) + 0.05, Math.max(az, bz) + 0.05, 0, 0.6, 'fence');
  };
  fence(x0 + 0.5, z0 + 0.5, cx - 2, z0 + 0.5); fence(cx + 2, z0 + 0.5, x1 - 0.5, z0 + 0.5);
  fence(x0 + 0.5, z1 - 0.5, x1 - 0.5, z1 - 0.5); fence(x1 - 0.5, z0 + 0.5, x1 - 0.5, z1 - 0.5);
  fence(x0 + 0.5, z0 + 0.5, x0 + 0.5, cz - 2); fence(x0 + 0.5, cz + 2, x0 + 0.5, z1 - 0.5);
  // Swings.
  const sw = hex('#c0452f');
  for (const s of [-1, 1]) b.beam([cx - 2.5 + s * 1.6, 0, cz - 4], [cx - 2.5 + s * 1.6, 2.5, cz - 4], 0.1, sw);
  b.beam([cx - 4.1, 2.5, cz - 4], [cx - 0.9, 2.5, cz - 4], 0.1, sw);
  for (const s of [-0.7, 0.7]) {
    b.beam([cx - 2.5 + s - 0.2, 2.5, cz - 4], [cx - 2.5 + s - 0.2, 0.55, cz - 4], 0.02, hex('#888888'));
    b.beam([cx - 2.5 + s + 0.2, 2.5, cz - 4], [cx - 2.5 + s + 0.2, 0.55, cz - 4], 0.02, hex('#888888'));
    b.box(cx - 2.5 + s, 0.5, cz - 4, 0.5, 0.06, 0.22, hex('#e2b13a'), { ao: 1 });
  }
  col.addBox(cx - 4.2, cz - 4.2, cx - 0.8, cz - 3.8, 0, 2.5, 'swing');
  // Slide.
  b.box(cx + 3, 0, cz - 3, 1.0, 1.8, 1.0, hex('#3d7fb5'), { ao: 0.8 });
  b.beam([cx + 3, 1.8, cz - 2.5], [cx + 3, 0.15, cz + 0.8], 0.6, hex('#f0c33c'));
  col.addBoxC(cx + 3, cz - 3, 1.0, 1.0, 0, 1.8, 'slide');
  // Benches and trees.
  for (const [bx, bz] of [[x0 + 3, cz + 4], [x0 + 3, cz - 6], [x1 - 3, cz + 7]]) {
    b.box(bx, 0.42, bz, 0.5, 0.06, 1.7, C.woodL, { ao: 1 });
    b.box(bx - 0.22, 0.48, bz, 0.06, 0.45, 1.7, C.woodL, { ao: 1 });
    for (const o of [-0.7, 0.7]) b.box(bx, 0, bz + o, 0.45, 0.42, 0.08, hex('#555555'), { ao: 1 });
    col.addBoxC(bx, bz, 0.5, 1.7, 0, 0.5, 'bench');
  }
  for (const [tx, tz] of [[x0 + 4, z0 + 4], [x1 - 4, z0 + 4], [x0 + 4, z1 - 4], [x1 - 4, z1 - 4], [cx + 9, cz + 1], [cx - 10, cz + 9]]) tree(b, col, tx, tz, r, r.range(1.1, 1.5));
  // Clock post.
  b.cyl(cx + 6, 0, cz + 5, 0.08, 3.2, C.steel, 6);
  b.cyl(cx + 6, 3.2, cz + 5, 0.4, 0.15, hex('#f1ede4'), 12, 0.6);
  col.addCircle(cx + 6, cz + 5, 0.12, 0, 3.2);
}

// Backdrop: hills to the north, fields around the edge, everything soft in the haze.
function backdrop(ch) {
  const r = rng(99);
  const b = ch.at(0, -200);
  b.ground(-500, -500, 500, 500, -0.02, hex('#7b8a5e'));
  ch.at(0, 0).ground(-EDGE - 3, -EDGE - 3, EDGE + 3, EDGE + 3, 0.0, C.lot);
  for (let i = 0; i < 16; i++) {
    const x = -380 + i * 52 + r.range(-15, 15), z = -260 - r.range(0, 120);
    b.blob(x, -10, z, r.range(55, 95), r.pick([hex('#4c6b4a'), hex('#557553'), hex('#466247')]), r.range(0.5, 0.85), 9);
  }
  const s = ch.at(0, 200);
  s.ground(-500, 150, 500, 500, -0.3, hex('#4f7f95'));
}

export async function buildNeighborhood(renderer, progress = () => {}) {
  const r = rng(20261017);
  const ch = new Chunks();
  const col = new Collision();
  const tick = () => new Promise((res) => requestAnimationFrame(() => res()));

  progress(0.05, 'Laying roads'); await tick();
  backdrop(ch);
  buildRoads(ch);

  progress(0.2, 'Building houses'); await tick();
  const xr = ROADS.filter((q) => q.axis === 'z').map(roadEdges).sort((a, b) => a[0] - b[0]);
  const zr = ROADS.filter((q) => q.axis === 'x').map(roadEdges).sort((a, b) => a[0] - b[0]);
  const spans = (edges) => { const out = []; for (let i = 0; i < edges.length - 1; i++) out.push([edges[i][1], edges[i + 1][0]]); return out; };
  const xs = spans(xr), zs = spans(zr);
  let n = 0, dep = null;
  const lots = [];
  const nr = rng(777), names = FAMILY.slice();
  for (let q = names.length - 1; q > 0; q--) { const s = Math.min(q, Math.floor(nr.range(0, q + 1))); [names[q], names[s]] = [names[s], names[q]]; }
  for (let i = 0; i < xs.length; i++) {
    for (let j = 0; j < zs.length; j++) {
      const [x0, x1] = xs[i], [z0, z1] = zs[j];
      if (i === 2 && j === 2) { park(ch, col, r, x0, z0, x1, z1); continue; }
      const half = (z1 - z0) / 2;
      for (const row of [0, 1]) {
        const rz0 = row ? z0 + half : z0, rz1 = row ? z1 : z0 + half;
        const yaw = row ? 0 : Math.PI;            // row 0 faces north road, row 1 faces south road
        const count = Math.max(1, Math.round((x1 - x0) / 10.5));
        const lw = (x1 - x0) / count;
        for (let k = 0; k < count; k++) {
          const lx = x0 + lw * (k + 0.5), lz = (rz0 + rz1) / 2;
          if (i === 1 && j === 1 && Math.abs(lx - -20) < lw / 2) continue; // alley
          if (i === 2 && j === 1 && row === 1 && k === 0) { dep = depot(ch, col, lx, lz, lw, half); continue; }
          let info;
          if ((i === 1 && j === 1 && row === 1 && k === 0) || (i === 3 && j === 2 && row === 0 && k === 1) || (i === 0 && j === 2 && row === 1 && k === 2)) {
            info = apartment(ch, col, r, lx, lz, lw, half, yaw);
          } else info = house(ch, col, r, lx, lz, lw, half, yaw);
          const [en, jp] = names[lots.length % names.length];
          lots.push({ id: `${i}${j}${row}${k}`, ...info, x: lx, z: lz, family: en, jp, addr: `Aoshima ${i * 4 + j + 1}-${row * count + k + 1}` });
          n++;
        }
      }
    }
    progress(0.2 + 0.5 * (i + 1) / xs.length, 'Building houses'); await tick();
  }

  // Stone-paved alley through the middle-north block, with lanterns and pots.
  { const b = ch.at(-20, -20);
    for (let z = -37.5; z < -4; z += 0.9) b.ground(-21.1, z, -18.9, z + 0.8, 0.02, r.chance(0.5) ? hex('#a7a093') : hex('#9b9487'));
    for (let z = -34; z < -6; z += 7) { pot(b, -21.4, z, r); b.box(-18.4, 0, z + 2, 0.3, 1.1, 0.3, hex('#8f8a80'), { ao: 0.8 }); b.box(-18.4, 1.1, z + 2, 0.36, 0.3, 0.36, C.lamp, { em: 0.85, ao: 1 }); LAMPS.push([-18.4, 1.3, z + 2, 0.5]); col.addCircle(-18.4, z + 2, 0.2, 0, 1.4); } }

  progress(0.75, 'Stringing power lines'); await tick();
  buildPoles(ch, col);
  vending(ch, col, 4.4, 5.6, Math.PI / 2, hex('#f2f2f0'));
  vending(ch, col, 4.4, 6.75, Math.PI / 2, hex('#c8322b'));
  vending(ch, col, -44.7, -36.6, -Math.PI / 2, hex('#2f6db5'));
  vending(ch, col, 37.4, -5.0, -Math.PI / 2, hex('#f2f2f0'));
  // Red postboxes stand at the kerb, on the street side of the garden walls.
  const postboxes = [
    { id: 'P1', name: 'Minato-dōri postbox', x: -2.65, z: 10.5, stand: [-1.75, 10.5] },
    { id: 'P2', name: 'Lane-east postbox', x: 41.65, z: 36.0, stand: [40.75, 36.0] },
  ];
  for (const p of postboxes) postbox(ch, col, p.x, p.z);
  for (const [x, z, yaw] of [[-44.6, -42.9, Math.PI / 4], [37.6, 42.8, -Math.PI / 4], [-39.6, 37.6, Math.PI * 0.75], [42.6, -42.8, -Math.PI * 0.75]]) mirror(ch, col, x, z, yaw);

  // Town boundary: invisible walls just past the rim lanes.
  const B = EDGE + 2.2;
  col.addBox(-B - 1, -B - 1, B + 1, -B, 0, 30, 'edge'); col.addBox(-B - 1, B, B + 1, B + 1, 0, 30, 'edge');
  col.addBox(-B - 1, -B, -B, B, 0, 30, 'edge'); col.addBox(B, -B, B + 1, -3.7, 0, 30, 'edge'); col.addBox(B, 3.7, B + 1, B, 0, 30, 'edge'); // gap: Asahi-dori -> Yasukuni-dori
  // Hedge along the rim so the edge reads as an edge.
  for (let s = -B; s < B; s += 4) {
    for (const [x, z, w, d] of [[s + 2, -B + 0.4, 4, 0.9], [s + 2, B - 0.4, 4, 0.9], [-B + 0.4, s + 2, 0.9, 4], [B - 0.4, s + 2, 0.9, 4]]) {
      if (x > 0 && w < 1 && Math.abs(z) < 4.5) continue; // opening onto the Tokyo avenue
      ch.at(x, z).box(x, 0, z, w, 1.3, d, C.leaf[2], { ao: 0.7, top: C.leaf[1] });
    }
  }

  progress(0.82, 'Lighting up Shinjuku'); await tick();
  const tokyo = buildTokyo(ch, col, LAMPS);

  progress(0.9, 'Uploading to GPU'); await tick();
  const chunks = [];
  for (const c of ch.map.values()) if (c.b.vertexCount) chunks.push({ x: c.x, z: c.z, far: Math.abs(c.z) > 140 || c.x < -120 || c.x > 280, mesh: renderer.mesh(c.b) });
  progress(1, 'Ready'); await tick();
  if (!dep) throw new Error('World build: depot lot missing');
  // Spawn on the depot forecourt, camera behind the player looking at the shopfront.
  return { chunks, lamps: LAMPS.splice(0), collision: col, houses: n, lots, depot: dep, postboxes, spawn: [dep.gate[0], 0, dep.gate[1] - 1.9], spawnYaw: 0, roads: ROADS, edge: EDGE, tokyo, bounds: { x0: -B - 1.3, x1: 270, z0: -105, z1: 105 } };
}
