// Neon Tokyo district east of Aoshima: Shinjuku / Kabukicho-style streets, built for night and rain.
// Deterministic (own seed), so the residential quarter, its addresses and saves are untouched.
// Everything is static geometry merged into the same 40 m chunks as the rest of the world.
import { hex } from '../engine/geometry.js';
import { rng } from '../engine/math.js';
import { GLYPHS, GLYPH_PX, ADVANCE, SIGNS_V, SIGNS_H, LANTERN, PLATES } from '../data/glyphs.js';

const M = { plaster: -0.05, tile: -0.1, wood: -0.15, block: -0.2, asphalt: -0.25, glass: -0.3, concrete: -0.35, metal: -0.4, grass: -0.45 };
const SATIN = -5;
const KERB = 0.15, SW = 3.2, GF = 4.4, FH = 3.3;

export const TK = { x0: 82.2, x1: 270, z0: -104, z1: 104 };
export const TK_ROADS = [
  { id: 'yasukuni', name: 'Yasukuni-dori', axis: 'x', c: 0, w: 14, a: 90, b: 266, major: true },
  { id: 'tk-n', name: 'Hanamichi-dori', axis: 'x', c: -52, w: 8, a: 110.5, b: 266 },
  { id: 'tk-s', name: 'Shinjuku-dori', axis: 'x', c: 52, w: 8, a: 110.5, b: 266 },
  { id: 'tk-rn', axis: 'x', c: -100, w: 7, a: 110.5, b: 266, edge: -1 },
  { id: 'tk-rs', axis: 'x', c: 100, w: 7, a: 110.5, b: 266, edge: 1 },
  { id: 'tk-w', name: 'Gado-shita', axis: 'z', c: 114, w: 7, a: -103.5, b: 103.5 },
  { id: 'meiji', name: 'Meiji-dori', axis: 'z', c: 146, w: 10, a: -103.5, b: 103.5, major: true },
  { id: 'kabuki', name: 'Kabukicho Ichiban-gai', axis: 'z', c: 206, w: 12, a: -103.5, b: 103.5, major: true },
  { id: 'tk-e', axis: 'z', c: 262, w: 8, a: -103.5, b: 103.5, edge: 1 },
];
export const SCRAMBLE = [206, 0];
const XR = TK_ROADS.filter((q) => q.axis === 'x');
const ZR = TK_ROADS.filter((q) => q.axis === 'z');

const T = {
  base: hex('#3a3c40'), asphalt: hex('#34363b'), line: hex('#e9e6dc'), lineY: hex('#e3b53c'),
  walk: hex('#a8a39a'), kerb: hex('#c9c5bb'), tactile: hex('#d8b23a'), lot: hex('#5a5c60'),
  steel: hex('#8b949c'), dark: hex('#202226'), darker: hex('#131417'), frame: hex('#b9bec4'),
  guard: hex('#e6e9e7'), concD: hex('#8c8b86'), girder: hex('#3e4a47'), ballast: hex('#5d5852'),
  facades: ['#c9c4bb', '#b7b2a9', '#8d9096', '#d8d2c6', '#a69f94', '#e2ddd2', '#9aa3a8', '#c0a891', '#7d7f84', '#b4aa9a'].map((h) => hex(h)),
  tileF: ['#d8cbb5', '#c7b39a', '#e0d8c8', '#b9a58c', '#cfc6b8'].map((h) => hex(h)),
  white: hex('#e9e8e2'), darkF: hex('#55585e'),
  glassT: hex('#2f3b46'), glassB: hex('#4f6272'),
  winW: hex('#ffd9a0').map((v) => v * 0.55), winC: hex('#e4eeff'),
  shop: ['#ffe3b0', '#fff4dc', '#ffd6a8', '#eef4ff', '#ffe9c8', '#fff0f0'].map((h) => hex(h)),
  neon: ['#ff2d6f', '#ff4fd8', '#3fd0ff', '#36f5c8', '#ffd23f', '#ff7a2e', '#9b6bff', '#ff3b3b', '#5cff8e', '#f4f4ff'].map((h) => hex(h)),
  boxBg: ['#fbfaf4', '#fff3a6', '#ffe14a', '#fbfaf4', '#f2f7ff'].map((h) => hex(h)),
  ink: [hex('#1c1c1e'), hex('#c81f1a'), hex('#1b3f9c'), hex('#1c1c1e')],
  red: hex('#d8261f'), blue: hex('#1f5fd0'), green: hex('#13844d'), orange: hex('#ff8a1f'), cream: hex('#fff8ec'),
  lantern: hex('#e5322b'), wood: hex('#5b3f2c'), woodD: hex('#3e2a1d'), tin: hex('#7c8186'), rust: hex('#8a5a3c'),
  ac: hex('#d6d8d4'), tank: hex('#c9ccc8'), noren: [hex('#1f2d4f'), hex('#6b1e1e'), hex('#2b2b2b'), hex('#e8e2d0')],
  sigG: hex('#19d39b'), sigY: hex('#ffc21a'), sigR: hex('#ff2a1f'),
};
const dim = (c, k) => c.map((v) => v * k);

// ---------------------------------------------------------------- lettering
const unit = (ch) => (ADVANCE[ch] ? ADVANCE[ch] / GLYPH_PX : 1);
const measure = (str) => [...str].reduce((a, ch) => a + unit(ch), 0);

// Text on a vertical plane with outward normal (nx,nz); (x,y,z) is the centre of the text block.
export function text(b, str, x, y, z, s, nx, nz, col, em, vert, off = 0.03) {
  const p = s / GLYPH_PX, tx = nz, tz = -nx, chars = [...str];
  const total = vert ? chars.length * s * 1.06 : measure(str) * s;
  let cur = vert ? y + total / 2 : -total / 2;
  for (const ch of chars) {
    const a = vert ? s : unit(ch) * s;
    let gcx, gtop;
    if (vert) { gcx = 0; gtop = cur - s * 0.03; cur -= s * 1.06; } else { gcx = cur + a / 2; gtop = y + s / 2; cur += a; }
    const g = GLYPHS[ch];
    if (!g) continue;
    for (let i = 0; i + 3 < g.length; i += 4) {
      const gx = g.charCodeAt(i) - 48, gy = g.charCodeAt(i + 1) - 48, gw = g.charCodeAt(i + 2) - 48, gh = g.charCodeAt(i + 3) - 48;
      const u = gcx + (gx + gw / 2 - GLYPH_PX / 2) * p;
      b.panel(x + tx * u, gtop - (gy + gh) * p, z + tz * u, gw * p, gh * p, nx, nz, col, em, off);
    }
  }
  return total;
}

// Flat quad on the ground; orders the corners so it faces up.
function flat(b, P, y, col, em = 0) {
  const [p0, p1, p2, p3] = P;
  const cr = (p1[1] - p0[1]) * (p2[0] - p0[0]) - (p1[0] - p0[0]) * (p2[1] - p0[1]);
  const Q = cr >= 0 ? [p0, p1, p2, p3] : [p3, p2, p1, p0];
  b.quad([Q[0][0], y, Q[0][1]], [Q[1][0], y, Q[1][1]], [Q[2][0], y, Q[2][1]], [Q[3][0], y, Q[3][1]], col, em);
}

// Road lettering (e.g. 止まれ) read by a driver heading (fx,fz); stretched 2.4x along the lane.
function roadText(b, str, x, z, s, fx, fz, y = 0.017) {
  const rx = -fz, rz = fx, p = s / GLYPH_PX, L = 2.4, chars = [...str];
  const step = s * L * 1.08;
  chars.forEach((ch, k) => {
    const g = GLYPHS[ch];
    if (!g) return;
    const dist = (chars.length - 1 - k - (chars.length - 1) / 2) * step;   // first glyph farthest
    const ox = x + fx * dist, oz = z + fz * dist;
    for (let i = 0; i + 3 < g.length; i += 4) {
      const gx = g.charCodeAt(i) - 48, gy = g.charCodeAt(i + 1) - 48, gw = g.charCodeAt(i + 2) - 48, gh = g.charCodeAt(i + 3) - 48;
      const u0 = (gx - GLYPH_PX / 2) * p, u1 = (gx + gw - GLYPH_PX / 2) * p;
      const v1 = (GLYPH_PX / 2 - gy) * p * L, v0 = (GLYPH_PX / 2 - gy - gh) * p * L;
      const C = (u, v) => [ox + rx * u + fx * v, oz + rz * u + fz * v];
      flat(b, [C(u0, v0), C(u1, v0), C(u1, v1), C(u0, v1)], y, T.line);
    }
  });
}

function signStyle(r) {
  const k = r();
  if (k < 0.4) return { bg: r.pick(T.boxBg), bgEm: r.range(0.6, 0.66), fg: r.pick(T.ink), fgEm: 0, glow: [1, 0.94, 0.82] };
  if (k < 0.58) return { bg: T.red, bgEm: 0.64, fg: T.cream, fgEm: 0.8, glow: [1, 0.32, 0.25] };
  if (k < 0.68) return { bg: T.blue, bgEm: 0.62, fg: T.cream, fgEm: 0.8, glow: [0.35, 0.55, 1] };
  const n = r.pick(T.neon);
  return { bg: T.darker, bgEm: M.metal, fg: n, fgEm: 0.97, glow: n, neon: true };
}
const glowOf = (c) => { if (!c) return [1, 0.95, 0.85]; const m = Math.max(c[0], c[1], c[2]) || 1; return [c[0] / m, c[1] / m, c[2] / m]; };

// Lightbox / neon banner on a facade (horizontal text).
function banner(b, lamps, r, x, y, z, nx, nz, w, h, word, st = signStyle(r)) {
  word = word || r.pick(SIGNS_V);
  const s = Math.min(h * 0.64, (w - 0.5) / Math.max(1, measure(word)));
  b.panel(x, y, z, w, h, nx, nz, st.bg, st.bgEm, 0.06);
  if (st.neon) {
    const tx = nz, tz = -nx;
    for (const sgn of [-1, 1]) b.panel(x + tx * sgn * (w / 2 - 0.05), y + 0.04, z + tz * sgn * (w / 2 - 0.05), 0.05, h - 0.08, nx, nz, st.fg, 0.97, 0.075);
    b.panel(x, y + 0.04, z, w - 0.1, 0.05, nx, nz, st.fg, 0.97, 0.075);
    b.panel(x, y + h - 0.09, z, w - 0.1, 0.05, nx, nz, st.fg, 0.97, 0.075);
  }
  text(b, word, x, y + h / 2, z, s, nx, nz, st.fg, st.fgEm, false, 0.085);
  if (r() < 0.45) lamps.push([x + nx * 1.2, y + h * 0.5, z + nz * 1.2, st.neon ? 0.65 : 0.45, ...glowOf(st.glow)]);
}

// Vertical sign sticking out of a facade (front face at z = zf, facing fz), readable along the street.
// wip22: the north coin-parking lot is now Hinode Motors. Display cars, the cabin and pylon collision
// live in world/dealer.js; this builds the static dressing only.
function dealerLot(b, lamps, z0, z1) {
  const mid = (z0 + z1) / 2, RED = hex('#c8102e'), WH = hex('#f1eee7'), STEEL = hex('#2a2c30');
  b.ground(84, z0, 96, z1, KERB + 0.004, hex('#35373b'), M.asphalt);
  for (const [a, c] of [[z0 + 0.3, z0 + 5.6], [z1 - 5.6, z1 - 0.3]]) {
    for (const px of [84.45, 88.15, 91.85, 95.55]) b.ground(px - 0.06, a, px + 0.06, c, KERB + 0.008, T.line);
  }
  // pylon: red vertical board over a white panel, lettered on both faces
  b.box(95.2, KERB, mid, 0.34, 2.2, 0.34, STEEL, { ao: 1 });
  b.box(95.2, KERB + 2.2, mid, 0.3, 0.95, 2.7, WH, { em: 0.5, ao: 1, bottom: true });
  b.box(95.2, KERB + 3.15, mid, 0.36, 3.1, 1.25, RED, { em: 0.62, ao: 1 });
  for (const nx of [-1, 1]) {
    text(b, '日の出', 95.2 + nx * 0.18, KERB + 4.7, mid, 0.78, nx, 0, WH, 0.95, true, 0.012);
    text(b, '新車', 95.2 + nx * 0.15, KERB + 2.675, mid + 0.66 * nx, 0.4, nx, 0, RED, 0.5, false, 0.012);
    text(b, '中古車', 95.2 + nx * 0.15, KERB + 2.675, mid - 0.6 * nx, 0.4, nx, 0, RED, 0.5, false, 0.012);
  }
  lamps.push([94, 4.6, mid, 0.55, 1.0, 0.6, 0.55]);
  // bunting along the street edge
  const FL = [RED, WH, hex('#1d4fa8'), hex('#f2b705')];
  for (const zz of [z0 + 0.2, z1 - 0.2]) b.cyl(96, KERB, zz, 0.05, 3.2, T.steel, 6, M.metal);
  let k = 0;
  for (let z = z0 + 0.7; z < z1 - 0.5; z += 0.75) {
    const sag = 0.45 * Math.sin(Math.PI * (z - z0) / (z1 - z0));
    b.box(96, KERB + 2.72 - sag, z, 0.02, 0.34, 0.3, FL[k++ % 4], { em: 0.15 });
  }
  // floodlights over the two rows
  for (const zz of [z0 + 0.35, z1 - 0.35]) {
    b.cyl(84.4, KERB, zz, 0.07, 5.2, T.steel, 6, M.metal);
    b.box(84.9, KERB + 5.0, zz, 1.0, 0.16, 0.36, hex('#fdf6e3'), { em: 0.9, bottom: true });
    lamps.push([86.5, 5.0, zz + (zz < mid ? 3 : -3), 0.7, 0.92, 0.95, 1.0]);
  }
  // little sales cabin between the rows
  b.box(85.4, KERB, mid, 2.8, 2.5, 4.0, hex('#e8e5de'), { ao: 1 });
  b.box(86.82, KERB + 0.85, mid, 0.04, 1.35, 3.2, hex('#ffe7b8'), { em: 0.55 });
  b.box(85.4, KERB + 2.5, mid, 3.1, 0.16, 4.4, RED, { em: 0.2, ao: 1, bottom: true });
  lamps.push([87.2, 2.4, mid, 0.35, 1.0, 0.85, 0.6]);
}

function vsign(b, lamps, r, x, zf, fz, yTop, word, s) {
  const st = signStyle(r), n = [...word].length;
  const H = n * s * 1.06 + s * 0.55, wd = s * 1.5, th = 0.24, out = 0.25;
  const zc = zf + fz * (out + wd / 2), yb = yTop - H;
  if (yb < GF - 0.6) return false;
  b.box(x, yb, zc, th, H, wd, st.bg, { em: st.bgEm, ao: 1, bottom: true });
  for (const yy of [yb + 0.3, yTop - 0.3]) b.beam([x, yy, zf], [x, yy, zf + fz * (out + 0.05)], 0.07, T.steel, M.metal);
  for (const nx of [-1, 1]) {
    const px = x + nx * th / 2;
    text(b, word, px, yb + H / 2, zc, s, nx, 0, st.fg, st.fgEm, true, 0.012);
    if (st.neon) {
      for (const sg of [-1, 1]) b.panel(px, yb + 0.05, zc + sg * (wd / 2 - 0.06), 0.05, H - 0.1, nx, 0, st.fg, 0.97, 0.016);
      b.panel(px, yb + 0.05, zc, wd - 0.12, 0.05, nx, 0, st.fg, 0.97, 0.016);
      b.panel(px, yTop - 0.1, zc, wd - 0.12, 0.05, nx, 0, st.fg, 0.97, 0.016);
    }
  }
  if (r() < 0.6) lamps.push([x, yb + H * 0.45, zc + fz * 0.4, st.neon ? 0.75 : 0.5, ...glowOf(st.glow)]);
  return true;
}

// ---------------------------------------------------------------- buildings
// Window grid for one face. (ax,az) = centre of the face at ground level, face normal (nx,nz), width len.
function facade(b, lamps, r, ax, az, nx, nz, len, floors, kind, signs, f0 = 1) {
  const tx = nz, tz = -nx;
  const office = kind === 'glass';
  const litP = office ? 0.55 : 0.42;
  for (let f = f0; f < floors; f++) {
    const y = GF + (f - 1) * FH + (office ? 0.15 : 0.75);
    if (signs && f <= 6 && len > 4 && r() < 0.3) { banner(b, lamps, r, ax, y - 0.2, az, nx, nz, len - 1.0, 2.1); continue; }
    if (!office) b.panel(ax, y - 0.22, az, len - 0.6, 0.14, nx, nz, dim(T.concD, 1.05), M.concrete, 0.07);
    const pane = office ? 1.5 : 1.7;
    const n = Math.max(1, Math.round((len - 1.2) / pane)), pw = (len - 1.2) / n;
    const ph = office ? 3.0 : 1.8;
    const floorLit = r() < litP;
    for (let i = 0; i < n; i++) {
      const u = -len / 2 + 0.6 + pw * (i + 0.5);
      const lit = floorLit ? r() < 0.8 : r() < 0.12;
      const px = ax + tx * u, pz = az + tz * u;
      if (lit && office && r() < 0.65) b.panel(px, y, pz, pw - 0.1, ph, nx, nz, T.winC, r.range(0.57, 0.62), 0.04);
      else b.panel(px, y, pz, pw - (office ? 0.1 : 0.16), ph, nx, nz, lit ? T.winW : (office ? T.glassT : T.glassB), lit ? r.range(0.26, 0.48) : M.glass, 0.04);
      if (office) b.panel(px + tx * (pw / 2), y, pz + tz * (pw / 2), 0.07, ph, nx, nz, T.frame, SATIN, 0.05);
      else if (r() < 0.1) b.box(px + nx * 0.25, y - 0.12, pz + nz * 0.25, 0.75, 0.52, 0.32, T.ac, { em: M.metal, ao: 0.85, yaw: nx ? Math.PI / 2 : 0 });
    }
  }
}

function roof(b, lamps, r, x0, z0, x1, z1, top, floors, fz, kind) {
  const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const pc = kind === 'glass' ? T.steel : dim(T.concD, 1.1), pm = kind === 'glass' ? M.metal : M.concrete;
  b.box(cx, top, z0 + 0.11, w, 1.0, 0.22, pc, { em: pm, ao: 0.9 });
  b.box(cx, top, z1 - 0.11, w, 1.0, 0.22, pc, { em: pm, ao: 0.9 });
  b.box(x0 + 0.11, top, cz, 0.22, 1.0, d - 0.44, pc, { em: pm, ao: 0.9 });
  b.box(x1 - 0.11, top, cz, 0.22, 1.0, d - 0.44, pc, { em: pm, ao: 0.9 });
  if (w > 5 && d > 5) {
    if (r() < 0.45) {
      const tx = r.range(x0 + 1.6, x1 - 1.6), tz = r.range(z0 + 1.6, z1 - 1.6);
      b.box(tx, top, tz, 1.6, 0.6, 1.6, T.steel, { em: M.metal, ao: 0.8 });
      b.cyl(tx, top + 0.6, tz, 0.9, 1.7, T.tank, 10, M.plaster);
    }
    const n = r.int(1, 4);
    for (let i = 0; i < n; i++) {
      const ux = r.range(x0 + 1, x1 - 1), uz = r.range(z0 + 1, z1 - 1);
      b.box(ux, top, uz, 0.95, 0.75, 0.55, T.ac, { em: M.metal, ao: 0.8 });
      b.panel(ux, top + 0.762, uz, 0.5, 0.01, 0, 1, T.dark, 0, 0.001);
    }
    if (floors >= 6 && r() < 0.6) b.box(r.range(x0 + 2, x1 - 2), top, r.range(z0 + 2, z1 - 2), 2.6, 2.5, 2.6, pc, { em: pm, ao: 0.8 });
  }
  if (floors >= 14) for (const [ax, az] of [[x0 + 0.3, z0 + 0.3], [x1 - 0.3, z1 - 0.3]]) b.box(ax, top + 1.0, az, 0.25, 0.25, 0.25, T.sigR, { em: 0.97, ao: 1 });
  if (kind !== 'glass' && floors >= 5 && w >= 6 && r() < 0.42) billboard(b, lamps, r, cx, top, fz < 0 ? z0 + 1.2 : z1 - 1.2, fz, w);
}

function billboard(b, lamps, r, cx, y, z, fz, w) {
  const st = signStyle(r), word = r.pick(SIGNS_H), u = Math.max(1, measure(word));
  const bw = Math.min(w - 0.8, Math.max(4.5, u * 1.9)), s = Math.min(2.4, (bw - 0.8) / u), bh = s * 1.45 + 0.4;
  const y0 = y + 1.4;
  for (const sx of [-1, 1]) {
    const lx = cx + sx * (bw / 2 - 0.4);
    b.beam([lx, y, z], [lx, y0 + bh, z], 0.14, T.steel, M.metal);
    b.beam([lx, y, z - fz * 1.6], [lx, y0 + bh * 0.8, z], 0.1, T.steel, M.metal);
  }
  b.box(cx, y0, z, bw, bh, 0.3, st.neon ? T.darker : st.bg, { em: st.neon ? M.metal : st.bgEm, ao: 1, bottom: true });
  const zf = z + fz * 0.15;
  if (st.neon) { b.panel(cx, y0 + 0.08, zf, bw - 0.2, 0.07, 0, fz, st.fg, 0.97, 0.012); b.panel(cx, y0 + bh - 0.15, zf, bw - 0.2, 0.07, 0, fz, st.fg, 0.97, 0.012); }
  text(b, word, cx, y0 + bh / 2, zf, s, 0, fz, st.fg, st.fgEm, false, 0.02);
  lamps.push([cx, y0 + bh / 2, z + fz * 2.5, 0.8, ...glowOf(st.glow)]);
}

const SHOPS = ['izakaya', 'ramen', 'karaoke', 'drug', 'bar', 'game', 'office', 'cafe', 'yakiniku', 'shutter', 'izakaya', 'bar'];

function storefront(b, lamps, r, x0, x1, zf, fz, shop, body, shops) {
  const w = x1 - x0, cx = (x0 + x1) / 2, nz = fz, Y = KERB;
  const pil = dim(body, 0.82);
  b.panel(x0 + 0.25, Y, zf, 0.5, GF - Y, 0, nz, pil, M.concrete, 0.05);
  b.panel(x1 - 0.25, Y, zf, 0.5, GF - Y, 0, nz, pil, M.concrete, 0.05);
  const gw = w - 1.0;
  let light = null;
  if (shop === 'shutter') {
    b.panel(cx, Y, zf, gw, 3.1, 0, nz, hex('#9da2a6'), M.metal, 0.03);
    for (let k = 1; k < 14; k++) b.panel(cx, Y + k * 0.22, zf, gw, 0.025, 0, nz, hex('#7b8084'), M.metal, 0.035);
  } else {
    const interior = shop === 'konbini' ? hex('#f4f8ff') : shop === 'office' ? hex('#e8eef4') : r.pick(T.shop);
    const em = shop === 'konbini' ? 0.8 : shop === 'office' ? 0.58 : r.range(0.6, 0.7);
    b.panel(cx, Y + 0.08, zf, gw, 3.0, 0, nz, interior, em, 0.03);
    for (let k = 0; k < 2; k++) b.panel(cx + r.range(-gw / 4, gw / 4), Y + 0.45 + k * 0.95, zf, gw * r.range(0.3, 0.6), 0.2, 0, nz, dim(interior, 0.5), 0.55, 0.036);
    const nm = Math.max(1, Math.round(gw / 1.8));
    for (let k = 1; k < nm; k++) b.panel(cx - gw / 2 + (gw * k) / nm, Y + 0.08, zf, 0.07, 3.0, 0, nz, T.frame, SATIN, 0.045);
    b.panel(cx, Y + 3.05, zf, gw, 0.09, 0, nz, T.frame, SATIN, 0.045);
    b.panel(cx, Y, zf, gw, 0.1, 0, nz, T.dark, SATIN, 0.045);
    light = glowOf(interior);
  }
  // sign band
  let word = null, st = null;
  if (shop === 'konbini') { word = '日の出マート'; st = { bg: hex('#fbfdff'), bgEm: 0.66, fg: hex('#0d7a5f'), fgEm: 0 }; }
  else if (shop === 'office') { word = r.pick(PLATES); st = { bg: hex('#2a2d33'), bgEm: M.metal, fg: hex('#e8e8e8'), fgEm: 0.75 }; }
  else if (shop === 'pachinko') { word = 'パチンコ'; st = { bg: T.red, bgEm: 0.66, fg: hex('#ffe86a'), fgEm: 0.92, glow: [1, 0.6, 0.2] }; }
  b.panel(cx, Y + 3.25, zf, w - 0.3, 0.08, 0, nz, T.dark, SATIN, 0.055);
  banner(b, lamps, r, cx, Y + 3.35, zf, 0, nz, w - 0.3, 0.92, word, st || signStyle(r));
  if (shop === 'konbini') for (const [k, c] of [[0, '#12a37d'], [1, '#ffffff'], [2, '#f4b400']]) b.panel(cx, Y + 3.07 + k * 0.06, zf, w - 0.3, 0.06, 0, nz, hex(c), 0.62, 0.06);
  if (shop !== 'shutter' && shop !== 'office' && r() < 0.35) {
    const ac = r.pick([T.red, T.green, hex('#2b3a67'), hex('#7a2d4f'), hex('#d7c9a7')]);
    b.box(cx, Y + 2.95, zf + fz * 0.6, gw, 0.07, 1.2, ac, { em: M.plaster, ao: 1, bottom: true });
    b.panel(cx, Y + 2.62, zf + fz * 1.2, gw, 0.36, 0, nz, ac, M.plaster, 0.0);
  }
  if (light && r() < 0.5) lamps.push([cx, 2.3, zf + fz * 1.6, shop === 'konbini' ? 0.8 : 0.42, ...light]);
  if (shops) shops.push({ kind: shop, x: cx, z: zf + fz * 1.0, word });
}

function pachinkoBulbs(b, x0, x1, zf, fz, top) {
  const cols = [hex('#ffd85a'), hex('#ff5a3c'), hex('#ffffff'), hex('#ff4fd8')];
  let k = 0;
  for (let x = x0 + 0.35; x < x1 - 0.3; x += 0.32) {
    for (const y of [KERB + 3.18, KERB + 4.35]) b.panel(x, y, zf, 0.11, 0.11, 0, fz, cols[k++ % 4], 0.97, 0.09);
  }
  for (const x of [x0 + 0.55, x1 - 0.55]) for (let y = 4.6; y < Math.min(top - 0.5, 15); y += 0.34) b.panel(x, y, zf, 0.12, 0.12, 0, fz, cols[k++ % 4], 0.97, 0.06);
}

// One building on a lot. Front face is z0 (fz = -1) or z1 (fz = +1); sides lists exposed ends (-1 = x0, +1 = x1).
function building(ch, col, lamps, r, x0, z0, x1, z1, fz, sides, hf, opt = {}, shops = null) {
  const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, b = ch.at(cx, cz);
  const zf = fz < 0 ? z0 : z1;
  const floors = opt.floors || Math.max(2, Math.min(22, Math.round(r.range(3, 8) * hf)));
  const top = GF + (floors - 1) * FH;
  const kind = opt.kind || (floors >= 11 && r() < 0.55 ? 'glass' : r.pick(['concrete', 'tile', 'concrete', 'white', 'tile', 'dark']));
  const body = kind === 'glass' ? T.glassT : kind === 'tile' ? r.pick(T.tileF) : kind === 'white' ? T.white : kind === 'dark' ? T.darkF : r.pick(T.facades);
  const mat = kind === 'glass' ? M.glass : kind === 'tile' ? M.block : kind === 'white' ? M.plaster : M.concrete;
  b.box(cx, 0, cz, w, top, d, body, { em: mat, ao: 0.78 });
  col.addBox(x0, z0, x1, z1, 0, top + 1, 'building');
  const shop = opt.shop || (kind === 'glass' ? 'office' : r.pick(SHOPS));
  if (!opt.lite) storefront(b, lamps, r, x0, x1, zf, fz, shop, body, shops);
  else b.panel(cx, KERB, zf, w - 1, 3.0, 0, fz, r.pick(T.shop), r() < 0.5 ? 0.6 : M.glass, 0.03);
  if (shop === 'pachinko') pachinkoBulbs(b, x0, x1, zf, fz, top);
  const signs = kind !== 'glass' && !opt.lite;
  facade(b, lamps, r, cx, zf, 0, fz, w, floors, kind, signs);
  for (const s of sides) {
    const xf = s < 0 ? x0 : x1;
    facade(b, lamps, r, xf, cz, s, 0, d, floors, kind, signs && d > 6);
    if (!opt.lite && shop !== 'shutter') {
      b.panel(xf, KERB + 0.08, zf - fz * (2.2), 3.4, 3.0, s, 0, r.pick(T.shop), 0.62, 0.03);
    }
  }
  if (!opt.lite) facade(b, lamps, r, cx, fz < 0 ? z1 : z0, 0, -fz, w, floors, kind, false, Math.max(1, floors - 2));
  if (signs && floors >= 3 && r() < 0.78) {
    const sx = r() < 0.5 ? x0 + 0.45 : x1 - 0.45;
    const s = r.range(0.75, 1.25), word = r.pick(SIGNS_V);
    const yTop = Math.min(top - 0.4, GF + FH * Math.min(floors - 1, 7));
    vsign(b, lamps, r, sx, zf, fz, yTop, word, s);
  }
  roof(b, lamps, r, x0, z0, x1, z1, top, floors, fz, kind);
  return { top, floors, kind, b };
}

// ---------------------------------------------------------------- blocks
function slab(ch, col, x0, z0, x1, z1, tactileSides = []) {
  for (let x = x0; x < x1 - 0.01; x += 40) for (let z = z0; z < z1 - 0.01; z += 40) {
    const xe = Math.min(x1, x + 40), ze = Math.min(z1, z + 40);
    ch.at((x + xe) / 2, (z + ze) / 2).box((x + xe) / 2, 0, (z + ze) / 2, xe - x, KERB, ze - z, T.walk, { em: M.concrete, ao: 0.9 });
  }
  col.addBox(x0, z0, x1, z1, 0, KERB, 'walk');
  const y = KERB + 0.003;
  const K = (ax0, az0, ax1, az1, c) => ch.at((ax0 + ax1) / 2, (az0 + az1) / 2).ground(ax0, az0, ax1, az1, y, c, M.concrete);
  K(x0, z0, x1, z0 + 0.28, T.kerb); K(x0, z1 - 0.28, x1, z1, T.kerb);
  K(x0, z0 + 0.28, x0 + 0.28, z1 - 0.28, T.kerb); K(x1 - 0.28, z0 + 0.28, x1, z1 - 0.28, T.kerb);
  for (const s of tactileSides) {
    if (s === 'n') K(x0 + 0.9, z0 + 0.7, x1 - 0.9, z0 + 1.0, T.tactile);
    if (s === 's') K(x0 + 0.9, z1 - 1.0, x1 - 0.9, z1 - 0.7, T.tactile);
  }
}

const roadAt = (axis, edge) => TK_ROADS.find((q) => q.axis === axis && Math.abs(q.c + Math.sign(edge.dir) * q.w / 2 - edge.v) < 0.01);

function rowsBlock(ch, col, lamps, r, x0, z0, x1, z1, shops, special = {}) {
  const mid = (z0 + z1) / 2;
  const nRoad = roadAt('x', { v: z0, dir: 1 }), sRoad = roadAt('x', { v: z1, dir: -1 });
  const nearK = Math.abs(x0 - 212) < 0.1 || Math.abs(x1 - 200) < 0.1;
  const hfOf = (rd) => (rd ? (rd.id === 'yasukuni' ? 1.75 : rd.edge ? 0.85 : 1.1) : 0.9) * (nearK ? 1.2 : 1);
  for (const row of [0, 1]) {
    const fz = row ? 1 : -1, hf = hfOf(row ? sRoad : nRoad);
    const bz0 = row ? mid + 0.35 : z0 + SW, bz1 = row ? z1 - SW : mid - 0.35;
    const xs = x0 + SW, xe = x1 - SW, lots = [];
    let x = xs;
    while (x < xe - 0.5) {
      let w = r.range(6.2, 13);
      if (xe - (x + w) < 6) w = xe - x;
      lots.push([x, Math.min(xe, x + w)]); x += w;
    }
    lots.forEach(([a, c], k) => {
      const sides = [];
      if (k === 0) sides.push(-1);
      if (k === lots.length - 1) sides.push(1);
      const key = `${row}:${k}`;
      const sp = special[key] || (k === lots.length - 1 ? special[`${row}:last`] : null);
      if (sp && sp.custom) { sp.custom(a + 0.12, bz0, c - 0.12, bz1, fz, sides); return; }
      building(ch, col, lamps, r, a + 0.12, bz0, c - 0.12, bz1, fz, sides, hf, sp || {}, shops);
    });
  }
}

// Omoide Yokocho-style lanes: tiny two-storey bars under strings of red lanterns.
function yokocho(ch, col, lamps, r, x0, z0, x1, z1, shops) {
  const ix0 = x0 + SW, ix1 = x1 - SW, iz0 = z0 + SW, iz1 = z1 - SW;
  const lanes = [ix0 + 3.3 + 1.15, ix1 - 3.3 - 1.15];
  const LW = 2.3;
  const rows = [
    { a: ix0, b: lanes[0] - LW / 2, f: 1 },
    { a: lanes[0] + LW / 2, b: (lanes[0] + lanes[1]) / 2, f: -1 },
    { a: (lanes[0] + lanes[1]) / 2, b: lanes[1] - LW / 2, f: 1 },
    { a: lanes[1] + LW / 2, b: ix1, f: -1 },
  ];
  const wire = hex('#1e1f22');
  for (const R of rows) {
    const fx = R.f, xf = fx > 0 ? R.b : R.a;
    col.addBox(R.a, iz0, R.b, iz1, 0, 6.5, 'yokocho');
    col.addBox(Math.min(xf, xf + fx * 0.35), iz0, Math.max(xf, xf + fx * 0.35), iz1, 0, 1.1, 'counter');
    let z = iz0;
    while (z < iz1 - 0.5) {
      let sw = r.range(2.3, 3.1);
      if (iz1 - (z + sw) < 2.2) sw = iz1 - z;
      const za = z, zb = z + sw, zc = (za + zb) / 2, b = ch.at((R.a + R.b) / 2, zc);
      const h = r.range(5.0, 6.2), bodyC = r.pick([T.wood, hex('#6d655c'), hex('#8a8379'), T.rust, hex('#5f6468')]);
      b.box((R.a + R.b) / 2, 0, zc, R.b - R.a, h, sw - 0.06, bodyC, { em: r() < 0.5 ? M.wood : M.metal, ao: 0.7 });
      b.box((R.a + R.b) / 2, h, zc, R.b - R.a + 0.5, 0.12, sw, T.tin, { em: M.metal, ao: 1, bottom: true });
      // open front: warm interior, counter, stools
      const warm = r.pick([hex('#ffb36b'), hex('#ffc787'), hex('#ffa65a')]);
      b.panel(xf, KERB, zc, sw - 0.5, 2.25, fx, 0, warm, r.range(0.6, 0.7), 0.02);
      b.box(xf + fx * 0.18, KERB, zc, 0.36, 0.95, sw - 0.5, T.woodD, { em: M.wood, ao: 0.85 });
      for (const o of [-0.5, 0.5]) { b.cyl(xf + fx * 0.65, KERB, zc + o * (sw - 1.0), 0.17, 0.62, hex('#c62d25'), 8, M.plaster); }
      const nc = r.pick(T.noren);
      b.panel(xf, KERB + 1.75, zc, sw - 0.6, 0.55, fx, 0, nc, M.plaster, 0.04);
      const nw = r.pick(LANTERN);
      text(b, nw, xf, KERB + 2.02, zc, 0.24, fx, 0, nc === T.noren[3] ? T.dark : T.cream, 0, false, 0.05);
      b.box(xf + fx * 0.5, 2.55, zc, 1.0, 0.06, sw, T.tin, { em: M.metal, ao: 1, bottom: true });
      // lanterns
      const nl = sw > 2.6 ? 2 : 1;
      for (let i = 0; i < nl; i++) {
        const lz = nl === 1 ? zc : zc + (i ? 0.6 : -0.6), lx = xf + fx * 0.85;
        b.beam([lx, 2.55, lz], [lx, 2.36, lz], 0.02, wire, 0);
        b.cyl(lx, 1.88, lz, 0.2, 0.48, T.lantern, 8, 0.8, 0.2);
        b.cyl(lx, 1.84, lz, 0.12, 0.04, T.dark, 6, 0);
        b.cyl(lx, 2.36, lz, 0.12, 0.04, T.dark, 6, 0);
        text(b, r.pick(LANTERN).slice(0, 2), lx + fx * 0.205, 2.12, lz, 0.16, fx, 0, T.darker, 0.55, true, 0.0);
      }
      lamps.push([xf + fx * 0.9, 2.1, zc, 0.5, 1.0, 0.5, 0.28]);
      // upper floor
      b.panel(xf, 3.2, zc, Math.min(1.3, sw - 0.9), 0.9, fx, 0, r() < 0.5 ? T.winW : T.glassB, r() < 0.5 ? 0.4 : M.glass, 0.03);
      if (r() < 0.55) {
        const word = r.pick(SIGNS_V).slice(0, 4), s = 0.3, n = [...word].length, H = n * s * 1.06 + 0.2;
        const sx = xf + fx * 0.55, st = signStyle(r);
        b.box(sx, 2.85, zb - 0.35, 0.6, H, 0.1, st.bg, { em: st.bgEm, ao: 1 });
        for (const nz of [-1, 1]) text(b, word, sx, 2.85 + H / 2, zb - 0.35 + nz * 0.05, s, 0, nz, st.fg, st.fgEm, true, 0.01);
      }
      if (r() < 0.4) b.box(xf + fx * 0.3, 4.2, zc + r.range(-0.6, 0.6), 0.55, 0.45, 0.7, T.ac, { em: M.metal, ao: 0.85 });
      if (shops) shops.push({ kind: 'yokocho', x: xf + fx * 1.0, z: zc, word: nw });
      z = zb;
    }
  }
  // overhead wires and entrance gates
  for (const lx of lanes) {
    for (let z = iz0 + 2; z < iz1 - 1; z += r.range(3, 6)) ch.at(lx, z).beam([lx - LW / 2 - 0.2, 5.0 + r.range(-0.3, 0.3), z], [lx + LW / 2 + 0.2, 5.0 + r.range(-0.3, 0.3), z + r.range(-1.5, 1.5)], 0.03, wire, 0);
    for (const [gz, nz] of [[iz0 - 0.2, -1], [iz1 + 0.2, 1]]) {
      const b = ch.at(lx, gz);
      for (const sx of [-1, 1]) b.box(lx + sx * (LW / 2 + 0.15), KERB, gz, 0.14, 3.7, 0.14, T.steel, { em: M.metal, ao: 1 });
      b.box(lx, 3.3, gz, LW + 0.6, 0.62, 0.16, T.cream, { em: 0.64, ao: 1 });
      for (const n of [-1, 1]) text(b, '思い出横丁', lx, 3.61, gz + n * 0.08, 0.44, 0, n, T.red, 0.6, false, 0.01);
      lamps.push([lx, 3.0, gz + nz * 0.8, 0.5, 1.0, 0.85, 0.65]);
    }
  }
}

// Elevated rail line (JR-style) on concrete piers, with the steel "Ogado" bridge over the avenue.
function viaduct(ch, col, lamps, r) {
  const X0 = 97, X1 = 107, XC = 102, Y = 7.2;
  for (let z = -104; z < 104; z += 8) {
    const ze = Math.min(104, z + 8), zc = (z + ze) / 2, b = ch.at(XC, zc);
    const bridge = Math.abs(zc) < 10;
    const dc = bridge ? T.girder : T.concD, dm = bridge ? M.metal : M.concrete;
    b.box(XC, Y, zc, X1 - X0, 1.1, ze - z, dc, { em: dm, bottom: true, ao: 0.9 });
    for (const px of [X0 + 0.15, X1 - 0.15]) b.box(px, Y + 1.1, zc, 0.3, 1.05, ze - z, dc, { em: dm, ao: 0.9 });
    b.ground(X0 + 0.3, z, X1 - 0.3, ze, Y + 1.11, T.ballast, M.concrete);
    for (const rx of [99.6, 101.07, 102.93, 104.4]) b.box(rx, Y + 1.11, zc, 0.07, 0.15, ze - z, T.steel, { em: SATIN, ao: 1 });
  }
  for (let z = -100; z <= 100; z += 20) {
    const b = ch.at(XC, z);
    for (const px of [X0 + 0.3, X1 - 0.3]) b.box(px, Y + 2.15, z, 0.22, 4.4, 0.22, T.steel, { em: M.metal, ao: 1 });
    b.beam([X0 + 0.3, Y + 6.2, z], [X1 - 0.3, Y + 6.2, z], 0.16, T.steel, M.metal);
  }
  for (const wx of [100.33, 103.67]) for (let z = -104; z < 104; z += 20) ch.at(XC, z + 10).beam([wx, Y + 5.9, z], [wx, Y + 5.9, Math.min(104, z + 20)], 0.025, T.dark, 0);
  for (let z = -98; z <= 98; z += 12) {
    if (Math.abs(z) < 11) continue;
    const b = ch.at(XC, z);
    for (const px of [X0 + 1.2, X1 - 1.2]) { b.box(px, 0, z, 1.4, Y, 1.4, T.concD, { em: M.concrete, ao: 0.8 }); col.addBox(px - 0.7, z - 0.7, px + 0.7, z + 0.7, 0, Y, 'pier'); }
    b.box(XC, Y - 0.9, z, X1 - X0 - 1.0, 0.9, 1.2, T.concD, { em: M.concrete, ao: 0.9 });
  }
  for (const zb of [-10.6, 10.6]) {
    const b = ch.at(XC, zb);
    b.box(XC, 0, zb, X1 - X0, Y, 1.6, T.concD, { em: M.concrete, ao: 0.8 });
    col.addBox(X0, zb - 0.8, X1, zb + 0.8, 0, Y, 'pier');
  }
  for (const nx of [-1, 1]) {
    const px = nx < 0 ? X0 : X1, b = ch.at(XC, 0);
    b.box(px + nx * 0.12, Y - 1.6, 0, 0.25, 1.6, 20, T.girder, { em: M.metal, ao: 1 });
    b.panel(px + nx * 0.25, Y - 1.45, 0, 7.6, 1.3, nx, 0, T.cream, 0.64, 0.0);
    text(b, '大ガード', px + nx * 0.25, Y - 0.8, 0, 1.0, nx, 0, hex('#1d3f8f'), 0, false, 0.02);
    for (const z of [-8, -4, 0, 4, 8]) lamps.push([px + nx * 1.5, Y - 1.9, z, 0.35, 0.95, 0.95, 1.0]);
  }
  // shops built into the arches (gado-shita), facing the side road
  for (let z = -46; z < 46; z += 12) {
    if (Math.abs(z + 6) < 12) continue;
    const za = z + 0.7, zb = z + 11.3, zc = (za + zb) / 2, b = ch.at(XC, zc);
    b.box(XC + 1.0, 0, zc, X1 - X0 - 3.4, Y - 0.9, zb - za, hex('#6f6a63'), { em: M.concrete, ao: 0.8 });
    col.addBox(X0 + 1.7, za, XC + 4.3, zb, 0, Y, 'arch');
    archFront(b, lamps, r, XC + 4.3, za, zb);
  }
}

// storefront() works along x; arches face +x, so draw them with a tiny adapter.
function archFront(b, lamps, r, xf, za, zb) {
  const w = zb - za, zc = (za + zb) / 2, warm = r.pick(T.shop);
  b.panel(xf, KERB + 0.08, zc, w - 1.0, 3.0, 1, 0, warm, r.range(0.6, 0.68), 0.03);
  banner(b, lamps, r, xf, KERB + 3.35, zc, 1, 0, w - 0.4, 0.9);
  for (let i = 0; i < 3; i++) {
    const lz = za + 1.2 + i * (w - 2.4) / 2;
    b.cyl(xf + 0.6, 2.4, lz, 0.2, 0.5, T.lantern, 8, 0.8, 0.2);
  }
  lamps.push([xf + 1.2, 2.4, zc, 0.45, 1.0, 0.55, 0.3]);
}

// ---------------------------------------------------------------- streets
function spans(s, e, cuts) {
  const out = []; let p = s;
  for (const [a, b] of [...cuts].sort((m, n) => m[0] - n[0])) { if (a > p) out.push([p, Math.min(a, e)]); p = Math.max(p, b); }
  if (p < e) out.push([p, e]);
  return out.filter(([a, b]) => b - a > 0.3);
}
const crossX = (q) => ZR.filter((z) => z.c - z.w / 2 >= q.a - 0.01 && z.c + z.w / 2 <= q.b + 0.01 && q.c >= z.a - 0.01 && q.c <= z.b + 0.01);
const crossZ = (q) => XR.filter((x) => q.c - q.w / 2 >= x.a - 0.01 && q.c + q.w / 2 <= x.b + 0.01 && x.c >= q.a - 0.01 && x.c <= q.b + 0.01);

function roads(ch) {
  for (const q of XR) {
    const z0 = q.c - q.w / 2, z1 = q.c + q.w / 2;
    for (let x = q.a; x < q.b - 0.01; x += 20) { const xe = Math.min(q.b, x + 20); ch.at((x + xe) / 2, q.c).ground(x, z0, xe, z1, 0.012, T.asphalt, M.asphalt); }
  }
  for (const q of ZR) {
    const x0 = q.c - q.w / 2, x1 = q.c + q.w / 2;
    const cuts = crossZ(q).map((x) => [x.c - x.w / 2, x.c + x.w / 2]);
    for (const [s, e] of spans(q.a, q.b, cuts)) for (let z = s; z < e - 0.01; z += 20) { const ze = Math.min(e, z + 20); ch.at(q.c, (z + ze) / 2).ground(x0, z, x1, ze, 0.012, T.asphalt, M.asphalt); }
  }
  // the avenue flares out of Asahi-dori at the town edge
  const b = ch.at(86, 0);
  b.quad([81.8, 0.012, 3.5], [90, 0.012, 7], [90, 0.012, -7], [81.8, 0.012, -3.5], T.asphalt, M.asphalt);
}

function markings(ch) {
  const Y = 0.016;
  const G = (x0, z0, x1, z1, c = T.line) => ch.at((x0 + x1) / 2, (z0 + z1) / 2).ground(x0, z0, x1, z1, Y, c);
  for (const q of XR) {
    const cuts = crossX(q).map((z) => [z.c - z.w / 2 - 5.2, z.c + z.w / 2 + 5.2]);
    for (const [s, e] of spans(q.a + 1, q.b - 1, cuts)) {
      if (q.w >= 12) {
        G(s, q.c - 0.26, e, q.c - 0.14, T.lineY); G(s, q.c + 0.14, e, q.c + 0.26, T.lineY);
        for (let x = s; x < e - 1; x += 10) { const xe = Math.min(e, x + 5); G(x, q.c - 3.56, xe, q.c - 3.44); G(x, q.c + 3.44, xe, q.c + 3.56); }
        G(s, q.c - q.w / 2 + 0.3, e, q.c - q.w / 2 + 0.45); G(s, q.c + q.w / 2 - 0.45, e, q.c + q.w / 2 - 0.3);
      } else {
        for (let x = s; x < e - 1; x += 9) G(x, q.c - 0.07, Math.min(e, x + 4.5), q.c + 0.07);
        G(s, q.c - q.w / 2 + 0.35, e, q.c - q.w / 2 + 0.47); G(s, q.c + q.w / 2 - 0.47, e, q.c + q.w / 2 - 0.35);
      }
    }
  }
  for (const q of ZR) {
    const cuts = crossZ(q).map((x) => [x.c - x.w / 2 - 5.2, x.c + x.w / 2 + 5.2]);
    for (const [s, e] of spans(q.a + 1, q.b - 1, cuts)) {
      if (q.w >= 10) { G(q.c - 0.26, s, q.c - 0.14, e, T.lineY); G(q.c + 0.14, s, q.c + 0.26, e, T.lineY); }
      else for (let z = s; z < e - 1; z += 9) G(q.c - 0.07, z, q.c + 0.07, Math.min(e, z + 4.5));
      G(q.c - q.w / 2 + 0.35, s, q.c - q.w / 2 + 0.47, e); G(q.c + q.w / 2 - 0.47, s, q.c + q.w / 2 - 0.35, e);
    }
  }
  // crossings, stop lines and 止まれ on the minor approaches
  for (const xr of XR) for (const zr of crossX(xr)) {
    const ix0 = zr.c - zr.w / 2, ix1 = zr.c + zr.w / 2, iz0 = xr.c - xr.w / 2, iz1 = xr.c + xr.w / 2;
    const minorX = !xr.major && zr.major, minorZ = !zr.major && xr.major;
    if (xr.a < ix0 - 1) { for (let z = iz0 + 0.5; z < iz1 - 0.5; z += 0.9) G(ix0 - 4.4, z, ix0 - 0.8, z + 0.45); G(ix0 - 5.4, iz0 + 0.3, ix0 - 5.0, xr.c); if (minorX) roadText(ch.at(ix0 - 9, xr.c), '止まれ', ix0 - 9.5, (iz0 + xr.c) / 2, Math.min(1.1, xr.w / 2 - 1.2), 1, 0); }
    if (xr.b > ix1 + 1) { for (let z = iz0 + 0.5; z < iz1 - 0.5; z += 0.9) G(ix1 + 0.8, z, ix1 + 4.4, z + 0.45); G(ix1 + 5.0, xr.c, ix1 + 5.4, iz1 - 0.3); if (minorX) roadText(ch.at(ix1 + 9, xr.c), '止まれ', ix1 + 9.5, (iz1 + xr.c) / 2, Math.min(1.1, xr.w / 2 - 1.2), -1, 0); }
    if (zr.a < iz0 - 1) { for (let x = ix0 + 0.5; x < ix1 - 0.5; x += 0.9) G(x, iz0 - 4.4, x + 0.45, iz0 - 0.8); G(zr.c, iz0 - 5.4, ix1 - 0.3, iz0 - 5.0); if (minorZ) roadText(ch.at(zr.c, iz0 - 9), '止まれ', (ix1 + zr.c) / 2, iz0 - 9.5, Math.min(1.1, zr.w / 2 - 1.2), 0, 1); }
    if (zr.b > iz1 + 1) { for (let x = ix0 + 0.5; x < ix1 - 0.5; x += 0.9) G(x, iz1 + 0.8, x + 0.45, iz1 + 4.4); G(ix0 + 0.3, iz1 + 5.0, zr.c, iz1 + 5.4); if (minorZ) roadText(ch.at(zr.c, iz1 + 9), '止まれ', (ix0 + zr.c) / 2, iz1 + 9.5, Math.min(1.1, zr.w / 2 - 1.2), 0, -1); }
  }
  // the scramble: diagonal zebras corner to corner
  const [sx, sz] = SCRAMBLE, hx = 6, hz = 7, b = ch.at(sx, sz);
  for (const [dx, dz] of [[hx, hz], [hx, -hz]]) {
    const L = Math.hypot(dx, dz) * 2 - 3, ux = dx / Math.hypot(dx, dz), uz = dz / Math.hypot(dx, dz), yaw = Math.atan2(ux, uz);
    for (let t = -L / 2; t < L / 2; t += 0.9) b.box(sx + ux * t, 0.013, sz + uz * t, 3.6, 0.005, 0.45, T.line, { yaw, ao: 1, noTop: false });
  }
}

function lampPost(b, col, lamps, x, z, ax, az, tall = 7.6) {
  b.cyl(x, KERB, z, 0.1, tall, T.steel, 8, M.metal, 0.08);
  const hx = x + ax * 1.6, hz = z + az * 1.6;
  b.beam([x, KERB + tall - 0.2, z], [hx, KERB + tall, hz], 0.09, T.steel, M.metal);
  b.box(hx, KERB + tall - 0.12, hz, 0.75, 0.14, 0.32, T.dark, { em: M.metal, ao: 1, yaw: az ? Math.PI / 2 : 0 });
  b.panel(hx, KERB + tall - 0.125, hz, 0.6, 0.004, 0, 1, hex('#f4f8ff'), 0.92, 0.0);
  b.box(hx, KERB + tall - 0.135, hz, 0.6, 0.01, 0.24, hex('#f4f8ff'), { em: 0.92, ao: 1, yaw: az ? Math.PI / 2 : 0, noTop: true, bottom: true });
  col.addCircle(x, z, 0.16, 0, tall, 'pole');
  lamps.push([hx, KERB + tall - 0.4, hz, 0.9, 0.86, 0.92, 1.0]);
}

function signalHead(b, lamps, x, y, z, fx, fz, state) {
  // horizontal Japanese signal: blue-green, yellow, red from the kerb side outward; faces (fx,fz)
  const yaw = fx ? Math.PI / 2 : 0;
  b.box(x, y, z, 1.25, 0.42, 0.3, T.dark, { em: M.metal, ao: 1, yaw });
  const tx = fz, tz = -fx;
  [['g', T.sigG], ['y', T.sigY], ['r', T.sigR]].forEach(([k, c], i) => {
    const u = (i - 1) * 0.38, on = k === state;
    b.panel(x + tx * u + fx * 0.15, y + 0.07, z + tz * u + fz * 0.15, 0.28, 0.28, fx, fz, on ? c : dim(c, 0.18), on ? 0.97 : 0, 0.005);
    if (on) lamps.push([x + fx * 0.6, y + 0.2, z + fz * 0.6, 0.35, ...glowOf(c)]);
  });
}

function furniture(ch, col, lamps, r) {
  // street lamps
  for (const q of XR) {
    const cuts = crossX(q).map((z) => [z.c - z.w / 2 - 3, z.c + z.w / 2 + 3]);
    for (const [s, e] of spans(q.a + 2, q.b - 2, cuts)) for (let x = s + 6; x < e - 3; x += 24) for (const side of [-1, 1]) {
      if (q.edge && side === q.edge) continue;
      const z = q.c + side * (q.w / 2 + 0.55);
      lampPost(ch.at(x, z), col, lamps, x, z, 0, -side);
    }
  }
  for (const q of ZR) {
    const cuts = crossZ(q).map((x) => [x.c - x.w / 2 - 3, x.c + x.w / 2 + 3]);
    for (const [s, e] of spans(q.a + 2, q.b - 2, cuts)) for (let z = s + 6; z < e - 3; z += 24) for (const side of [-1, 1]) {
      if (q.edge && side === q.edge) continue;
      if (q.id === 'tk-w' && side < 0) continue;
      const x = q.c + side * (q.w / 2 + 0.55);
      lampPost(ch.at(x, z), col, lamps, x, z, -side, 0);
    }
  }
  // guardrails along the avenue (gaps at the crossings)
  const av = XR.find((q) => q.id === 'yasukuni');
  const cuts = crossX(av).map((z) => [z.c - z.w / 2 - 5.0, z.c + z.w / 2 + 5.0]);
  for (const [s, e] of spans(av.a + 1, av.b - 1, cuts)) for (const side of [-1, 1]) {
    const z = side * (av.w / 2 + 0.3);
    for (let x = s; x < e - 0.5; x += 20) {
      const xe = Math.min(e, x + 20), b = ch.at((x + xe) / 2, z);
      for (let px = x; px <= xe + 0.01; px += 2) b.box(px, KERB, z, 0.07, 0.95, 0.07, T.guard, { em: SATIN, ao: 1 });
      b.beam([x, KERB + 0.6, z], [xe, KERB + 0.6, z], 0.06, T.guard, SATIN);
      b.beam([x, KERB + 0.92, z], [xe, KERB + 0.92, z], 0.06, T.guard, SATIN);
      col.addBox(x, z - 0.06, xe, z + 0.06, 0, 1.15, 'rail');
    }
  }
  // signals at the big junctions
  for (const xr of XR) for (const zr of crossX(xr)) {
    if (!xr.major && !zr.major) continue;
    const ix0 = zr.c - zr.w / 2, ix1 = zr.c + zr.w / 2, iz0 = xr.c - xr.w / 2, iz1 = xr.c + xr.w / 2;
    const sX = xr.major ? 'g' : 'r', sZ = xr.major ? 'r' : 'g';
    const posts = [
      [ix1 + 0.6, iz0 - 0.6, -1, 0, sX, ix1 - 1.5, iz0 + 1.6],   // facing westbound traffic? (traffic from the east, left lane is north)
      [ix0 - 0.6, iz1 + 0.6, 1, 0, sX, ix0 + 1.5, iz1 - 1.6],
      [ix0 - 0.6, iz0 - 0.6, 0, -1, sZ, ix0 + 1.6, iz0 + 1.5],
      [ix1 + 0.6, iz1 + 0.6, 0, 1, sZ, ix1 - 1.6, iz1 - 1.5],
    ];
    for (const [px, pz, fx, fz, st] of posts) {
      const b = ch.at(px, pz);
      b.cyl(px, KERB, pz, 0.11, 5.6, T.steel, 8, M.metal, 0.09);
      col.addCircle(px, pz, 0.16, 0, 5.6, 'pole');
      const ax = fz ? 0 : 0, az = 0;
      const reachX = fx ? 0 : (px < zr.c ? 1 : -1) * 3.2, reachZ = fz ? 0 : (pz < xr.c ? 1 : -1) * 3.2;
      b.beam([px, KERB + 5.4, pz], [px + reachX + ax, KERB + 5.4, pz + reachZ + az], 0.1, T.steel, M.metal);
      signalHead(b, lamps, px + reachX, KERB + 4.95, pz + reachZ, fx, fz, st);
      b.box(px, KERB + 2.3, pz, 0.32, 0.62, 0.22, T.dark, { em: M.metal, ao: 1 });
      b.panel(px, KERB + 2.62, pz, 0.22, 0.24, fx || 0, fz || 0, st === 'g' ? T.sigR : T.sigG, 0.9, 0.12);
    }
  }
  // vending machines
  const vcols = [hex('#e8eaec'), hex('#c8262c'), hex('#1d5fb4'), hex('#f2f2f2'), hex('#2c8c4e')];
  let n = 0;
  for (let tries = 0; tries < 400 && n < 22; tries++) {
    const q = r.pick(XR);
    if (q.edge) continue;
    const x = r.range(q.a + 12, q.b - 6), side = r() < 0.5 ? -1 : 1;
    if (crossX(q).some((z) => Math.abs(x - z.c) < z.w / 2 + 6)) continue;
    const z = q.c + side * (q.w / 2 + SW - 0.55), b = ch.at(x, z);
    const cnt = r.int(1, 3);
    for (let i = 0; i < cnt; i++) {
      const vx = x + i * 1.05, vc = r.pick(vcols);
      b.box(vx, KERB, z, 1.0, 1.83, 0.72, vc, { em: M.metal, ao: 0.85 });
      b.panel(vx, KERB + 0.95, z, 0.86, 0.75, 0, -side, hex('#f6f3ea'), 0.7, 0.365);
      for (let k = 0; k < 3; k++) for (let j = 0; j < 5; j++) b.panel(vx - 0.34 + j * 0.17, KERB + 1.02 + k * 0.24, z, 0.1, 0.14, 0, -side, r.pick(T.neon), 0.62, 0.37);
      b.panel(vx, KERB + 0.3, z, 0.6, 0.22, 0, -side, T.darker, 0, 0.365);
      col.addBox(vx - 0.5, z - 0.36, vx + 0.5, z + 0.36, 0, 1.83, 'vending');
    }
    lamps.push([x + (cnt - 1) * 0.5, 1.2, z - side * 1.1, 0.4, 0.95, 0.97, 1.0]);
    n++;
  }
}

// ---------------------------------------------------------------- landmarks
function gate(ch, lamps) {
  const gx = 206, gz = -16.5, b = ch.at(gx, gz), red = hex('#c8201d');
  for (const sx of [-1, 1]) b.box(gx + sx * 6.7, KERB, gz, 0.4, 6.6, 0.4, red, { em: SATIN, ao: 1 });
  b.box(gx, 5.4, gz, 13.8, 0.35, 0.5, red, { em: SATIN, ao: 1, bottom: true });
  b.box(gx, 6.6, gz, 14.2, 0.3, 0.5, red, { em: SATIN, ao: 1, bottom: true });
  b.box(gx, 5.75, gz, 11.6, 0.85, 0.3, hex('#fbfaf4'), { em: 0.68, ao: 1 });
  for (const n of [-1, 1]) text(b, '歌舞伎町一番街', gx, 6.17, gz + n * 0.15, 0.62, 0, n, red, 0.62, false, 0.012);
  lamps.push([gx, 5.0, gz + 1.5, 0.8, 1.0, 0.35, 0.3]);
  lamps.push([gx, 5.0, gz - 1.5, 0.6, 1.0, 0.35, 0.3]);
}

function bigScreen(b, lamps, x, y, z, nx, nz, w, h) {
  const tx = nz, tz = -nx;
  b.panel(x, y - 0.3, z, w + 0.6, h + 0.6, nx, nz, T.darker, M.metal, 0.1);
  const rows = 6, cols = 10;
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    const u = -w / 2 + (j + 0.5) * (w / cols), t = i / (rows - 1);
    const c = [0.18 + 0.5 * t, 0.42 + 0.4 * t, 0.95 - 0.1 * t];
    b.panel(x + tx * u, y + i * (h / rows), z + tz * u, w / cols + 0.002, h / rows + 0.002, nx, nz, c, 0.86, 0.13);
  }
  b.panel(x, y + h * 0.08, z, w, h * 0.22, nx, nz, hex('#ff8a1f'), 0.9, 0.15);
  text(b, '日の出運送', x, y + h * 0.55, z, Math.min(h * 0.3, w / 6), nx, nz, hex('#ffffff'), 0.96, false, 0.17);
  text(b, 'HINODE', x, y + h * 0.19, z, h * 0.15, nx, nz, hex('#1d1d1d'), 0, false, 0.17);
  lamps.push([x + nx * 6, y + h / 2, z + nz * 6, 1.1, 0.55, 0.75, 1.0]);
}

function koban(ch, col, lamps, x0, z0, x1, z1, fz) {
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, b = ch.at(cx, cz), zf = fz < 0 ? z0 : z1;
  const w = Math.min(6, x1 - x0), d = Math.min(5.5, z1 - z0), bz = zf - fz * d / 2;
  b.box(cx, 0, bz, w, 5.2, d, hex('#d9d4c8'), { em: M.block, ao: 0.8 });
  b.hip(cx, 5.2, bz, w, d, 1.4, hex('#4a4f55'), 0.35);
  col.addBox(cx - w / 2, bz - d / 2, cx + w / 2, bz + d / 2, 0, 6.6, 'koban');
  b.panel(cx, KERB, zf, 2.4, 2.6, 0, fz, hex('#eef2f4'), 0.66, 0.03);
  b.panel(cx, 3.3, zf, 2.8, 0.75, 0, fz, hex('#1f3b78'), 0.62, 0.05);
  text(b, '交番', cx, 3.675, zf, 0.55, 0, fz, hex('#ffffff'), 0.85, false, 0.075);
  b.blob(cx, 4.55, zf + fz * 0.35, 0.22, T.sigR, 1, 8, 0.97);
  lamps.push([cx, 4.3, zf + fz * 1.2, 0.6, 1.0, 0.18, 0.15]);
}

function skyline(ch, r) {
  // Nishi-Shinjuku-style towers beyond the east edge (no collision; the district wall stops you first).
  const towers = [[320, -60, 34, 30, 172], [356, -60, 24, 24, 188], [320, 40, 30, 34, 150], [372, 10, 36, 30, 210], [300, 90, 26, 26, 120], [400, -40, 30, 30, 160], [345, 110, 28, 28, 135], [298, -105, 24, 28, 110]];
  for (const [x, z, w, d, H] of towers) {
    const b = ch.at(x, z);
    b.box(x, 0, z, w, H, d, T.glassT, { em: M.glass, ao: 0.85 });
    for (const [nx, nz, len] of [[-1, 0, d], [0, -1, w], [0, 1, w], [1, 0, d]]) {
      const fx = x + nx * w / 2, fz = z + nz * d / 2, tx = nz, tz = -nx;
      for (let y = 6; y < H - 6; y += 4) {
        const segs = 4;
        for (let k = 0; k < segs; k++) {
          const u = -len / 2 + (k + 0.5) * (len / segs), lit = r() < 0.38;
          b.panel(fx + tx * u, y, fz + tz * u, len / segs - 0.3, 2.6, nx, nz, lit ? T.winC : T.glassB, lit ? r.range(0.54, 0.6) : M.glass, 0.05);
        }
      }
    }
    b.box(x, H, z, w * 0.6, 6, d * 0.6, T.steel, { em: M.metal, ao: 0.8 });
    for (const [ax, az] of [[-1, -1], [1, 1], [-1, 1], [1, -1]]) b.box(x + ax * w * 0.28, H + 6, z + az * d * 0.28, 0.6, 0.6, 0.6, T.sigR, { em: 0.97, ao: 1 });
  }
  for (let x = 290; x < 440; x += 40) for (let z = -160; z < 160; z += 40) ch.at(x + 20, z + 20).ground(x, z, x + 40, z + 40, -0.01, T.lot, M.concrete);
}

// ---------------------------------------------------------------- build
export function buildTokyo(ch, col, lamps) {
  const r = rng(1964);
  const shops = [];
  for (let x = 83; x < TK.x1; x += 40) for (let z = TK.z0; z < TK.z1; z += 40) {
    const xe = Math.min(TK.x1, x + 40), ze = Math.min(TK.z1, z + 40);
    ch.at((x + xe) / 2, (z + ze) / 2).ground(x, z, xe, ze, 0.0, T.base, M.concrete);
  }
  roads(ch);
  markings(ch);
  const zb = []; const xb = [];
  const zs = [...XR].sort((a, b) => a.c - b.c), xs = [...ZR].sort((a, b) => a.c - b.c);
  for (let i = 0; i + 1 < xs.length; i++) xb.push([xs[i].c + xs[i].w / 2, xs[i + 1].c - xs[i + 1].w / 2]);
  for (let j = 0; j + 1 < zs.length; j++) zb.push([zs[j].c + zs[j].w / 2, zs[j + 1].c - zs[j + 1].w / 2]);
  for (const [x0, x1] of xb) for (const [z0, z1] of zb) {
    const tact = [];
    if (Math.abs(z1 + 7) < 0.1) tact.push('s');
    if (Math.abs(z0 - 7) < 0.1) tact.push('n');
    slab(ch, col, x0, z0, x1, z1, tact);
    if (Math.abs(x0 - 117.5) < 0.1 && Math.abs(z0 + 48) < 0.1) { yokocho(ch, col, lamps, r, x0, z0, x1, z1, shops); continue; }
    const special = {};
    if (Math.abs(x0 - 212) < 0.1 && Math.abs(z0 + 48) < 0.1) {
      special['1:0'] = { custom: (a, bz0, c, bz1, fz, sides) => {
        const o = building(ch, col, lamps, r, a, bz0, c, bz1, fz, sides, 1, { floors: 18, kind: 'concrete', shop: 'game' }, shops);
        bigScreen(o.b, lamps, (a + c) / 2, 13, bz1, 0, 1, Math.min(14, c - a - 1.5), 8.5);
        bigScreen(o.b, lamps, a, 24, (bz0 + bz1) / 2, -1, 0, Math.min(12, bz1 - bz0 - 1.5), 7);
      } };
    }
    if (Math.abs(x0 - 151) < 0.1 && Math.abs(z0 - 7) < 0.1) special['0:1'] = { shop: 'konbini', floors: 7 };
    if (Math.abs(x0 - 212) < 0.1 && Math.abs(z0 - 7) < 0.1) special['0:2'] = { shop: 'pachinko', floors: 6, kind: 'white' };
    if (Math.abs(x0 - 151) < 0.1 && Math.abs(z0 + 48) < 0.1) special['1:last'] = { custom: (a, bz0, c, bz1, fz) => koban(ch, col, lamps, a, bz0, c, bz1, fz) };
    rowsBlock(ch, col, lamps, r, x0, z0, x1, z1, shops, special);
  }
  // west strip between the town wall and the side road: rail viaduct, low buildings, coin parking
  for (const [z0, z1, fz] of [[-104, -7, 1], [7, 104, -1]]) {
    slab(ch, col, 83.2, z0, 110.5, z1, fz > 0 ? ['s'] : ['n']);
    const zf = fz > 0 ? z1 - SW : z0 + SW;
    let x = 84;
    for (const w of [6.5, 5.8]) { const bz0 = fz > 0 ? zf - 12 : zf, bz1 = fz > 0 ? zf : zf + 12; building(ch, col, lamps, r, x, bz0, x + w - 0.2, bz1, fz, x === 84 ? [-1] : [1], 0.6, { floors: r.int(2, 4) }, shops); x += w; }
    const pz0 = fz > 0 ? zf - 34 : zf + 14, pz1 = fz > 0 ? zf - 14 : zf + 34, b = ch.at(90, (pz0 + pz1) / 2);
    if (fz < 0) dealerLot(b, lamps, pz0, pz1);   // wip22: the north lot is Hinode Motors
    else {
      b.ground(84, pz0, 96, pz1, KERB + 0.004, hex('#4a4c50'), M.asphalt);
      for (let px = 84.2; px < 96; px += 2.5) b.ground(px, pz0 + 0.3, px + 0.12, pz0 + 5.3, KERB + 0.008, T.line);
      b.cyl(95.2, KERB, (pz0 + pz1) / 2, 0.08, 4.2, T.steel, 6, M.metal);
      b.box(95.2, KERB + 4.2, (pz0 + pz1) / 2, 0.2, 1.6, 1.6, hex('#ffd400'), { em: 0.66, ao: 1 });
      for (const nx of [-1, 1]) text(b, 'P', 95.2 + nx * 0.1, KERB + 5.0, (pz0 + pz1) / 2, 1.2, nx, 0, hex('#1b3f9c'), 0, false, 0.01);
      lamps.push([94, 4.5, (pz0 + pz1) / 2, 0.5, 1.0, 0.9, 0.5]);
    }
  }
  viaduct(ch, col, lamps, r);
  gate(ch, lamps);
  furniture(ch, col, lamps, r);
  // backdrop street walls just outside the district so the edge reads as more city
  for (const [z0, z1, fz] of [[-128, -104.5, 1], [104.5, 128, -1]]) {
    let x = 111;
    while (x < 266) { const w = Math.min(266 - x, r.range(8, 16)); building(ch, col, lamps, r, x, z0, x + w - 0.3, z1, fz, [], 1.3, { lite: true }, null); x += w; }
  }
  { let z = -103; while (z < 103) { const w = Math.min(103 - z, r.range(9, 16)); const b0 = building(ch, col, lamps, r, 270.5, z, 292, z + w - 0.3, -1, [], 1.6, { lite: true }, null); b0.b.panel(270.5, KERB, z + w / 2, w - 1, 3, -1, 0, r.pick(T.shop), 0.6, 0.03); z += w; } }
  skyline(ch, r);
  // district boundary
  col.addBox(82.2, TK.z0 - 1, TK.x1 + 1, TK.z0, 0, 40, 'edge');
  col.addBox(82.2, TK.z1, TK.x1 + 1, TK.z1 + 1, 0, 40, 'edge');
  col.addBox(TK.x1, TK.z0, TK.x1 + 1, TK.z1, 0, 40, 'edge');
  col.addBox(82.2, TK.z0, 83.2, -82.2, 0, 40, 'edge');
  col.addBox(82.2, 82.2, 83.2, TK.z1, 0, 40, 'edge');
  return { roads: TK_ROADS, shops, bounds: TK, scramble: SCRAMBLE };
}
