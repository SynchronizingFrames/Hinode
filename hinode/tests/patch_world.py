# wip11: tag world geometry with procedural materials + add house/road detail.
# New random decisions use a position hash (hr) so the main RNG stream (and so the town layout) is unchanged.
import sys
def load(p): return open(p, encoding='utf-8').read()
def rep(s, old, new, n=1):
    c = s.count(old)
    if c != n:
        print('MATCH COUNT', c, '(want', n, ') for:', old[:80]); sys.exit(1)
    return s.replace(old, new)

# ---- geometry.js: builder-level material (mat for sloped/flat faces, matV for vertical faces) ----
G = '/data/hinode/js/engine/geometry.js'
g = load(G)
g = rep(g, '    this.col.push(ca[0], ca[1], ca[2], em, cb[0], cb[1], cb[2], em, cc[0], cc[1], cc[2], em);',
'''    // em wins; otherwise the builder's current material (matV for near-vertical faces, mat for the rest).
    const m = Math.abs(ny) < 0.35 && this.matV != null ? this.matV : this.mat;
    const e = em || m || 0;
    this.col.push(ca[0], ca[1], ca[2], e, cb[0], cb[1], cb[2], e, cc[0], cc[1], cc[2], e);''')
open(G, 'w', encoding='utf-8').write(g)

# ---- neighborhood.js ----
N = '/data/hinode/js/world/neighborhood.js'
s = load(N)
s = rep(s, 'function buildRoads(ch) {\n', '''// Procedural surface materials understood by the world shader (renderer.js WORLD_FS, alpha = -0.05 * id).
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
''')
s = rep(s, '''      if (r.axis === 'x') ch.at((s + e) / 2, r.c).ground(s, a, e, b, 0.02, col);
      else ch.at(r.c, (s + e) / 2).ground(a, s, b, e, 0.021, col);
''', '''      if (r.axis === 'x') ch.at((s + e) / 2, r.c).ground(s, a, e, b, 0.02, col, MAT.asphalt);
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
''')
s = rep(s, '''  zebra(-3, 4.2, true, 7); zebra(-3, -6.8, true, 7); zebra(3.8, -3.3, false, 8); zebra(-6.4, -3.3, false, 8);
}
''', '''  zebra(-3, 4.2, true, 7); zebra(-3, -6.8, true, 7); zebra(3.8, -3.3, false, 8); zebra(-6.4, -3.3, false, 8);
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
''')

# House shell: materials, eaves with soffit, gutters + downpipe.
s = rep(s, "  b.box(hx, 0, hz, ww + 0.2, 0.45, wd + 0.2, C.plinth, { ao: 0.75 });\n  b.box(hx, 0.45, hz, ww, 2.75, wd, wall);\n  b.box(hx, 3.2, hz, ww, 2.6, wd, upper, { ao: 0.92 });\n  b.box(hx, 3.12, hz, ww + 0.16, 0.1, wd + 0.16, trad ? C.wood : hex('#8d877c'), { ao: 1 });\n",
"  b.box(hx, 0, hz, ww + 0.2, 0.45, wd + 0.2, C.plinth, { ao: 0.75, em: MAT.concrete });\n  b.box(hx, 0.45, hz, ww, 2.75, wd, wall, { em: trad ? MAT.wood : MAT.plaster });\n  b.box(hx, 3.2, hz, ww, 2.6, wd, upper, { ao: 0.92, em: MAT.plaster });\n  b.box(hx, 3.12, hz, ww + 0.16, 0.1, wd + 0.16, trad ? C.wood : hex('#8d877c'), { ao: 1, em: trad ? MAT.wood : MAT.concrete });\n")
s = rep(s, """  if (r.chance(0.55)) b.hip(hx, 5.8, hz, ww, wd, rise, roof);
  else b.gable(hx, 5.8, hz, ww, wd, rise, roof, ww >= wd, 0.5, trad ? C.wood : upper.map((v) => v * 0.9));
""", """  // Eaves: soffit + fascia under the overhang, then the roof (glazed kawara, or metal on some newer houses).
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
""")
# Windows: reflective glass, centre mullion, sill, head trim, shutter boxes on upper windows.
s = rep(s, """    b.panel(px, y, pz, ww2, hh, fx, fz, lit ? C.glassLit.map((v) => v * 0.55) : C.glass, lit ? r.range(0.3, 0.5) : 0, 0.045);
""", """    b.panel(px, y, pz, ww2, hh, fx, fz, lit ? C.glassLit.map((v) => v * 0.55) : C.glass, lit ? r.range(0.3, 0.5) : MAT.glass, 0.045);
    const [mx2, mz2] = front(lx, 0.05);
    b.box(mx2, y, mz2, fx ? 0.05 : 0.045, hh, fx ? 0.045 : 0.05, C.frame, { ao: 1, em: SATIN });
    const [sx3, sz3] = front(lx, 0.08);
    b.box(sx3, y - 0.15, sz3, fx ? 0.16 : ww2 + 0.36, 0.06, fx ? ww2 + 0.36 : 0.16, hex('#bdb9b0'), { ao: 1, em: MAT.concrete });
    b.box(sx3, y + hh + 0.08, sz3, fx ? 0.11 : ww2 + 0.28, 0.05, fx ? ww2 + 0.28 : 0.11, C.frame, { ao: 1, em: SATIN });
    if (!trad && y > 3 && hr(px, pz, 3) < 0.55) {
      const [tx, tz] = front(lx + (lx >= 0 ? 1 : -1) * (ww2 / 2 + 0.34), 0.07);
      b.box(tx, y - 0.1, tz, fx ? 0.13 : 0.56, hh + 0.22, fx ? 0.56 : 0.13, hex('#a29e94'), { ao: 0.95, em: MAT.metal });
    }
""")
s = rep(s, """    b.panel(px, 4.02, pz, 0.74, 0.76, side * sx, side * sz, r.chance(0.5) ? C.glassLit.map((v) => v * 0.55) : C.glass, r.chance(0.5) ? 0.35 : 0, 0.045);
""", """    const l1 = r.chance(0.5), l2 = r.chance(0.5);
    b.panel(px, 4.02, pz, 0.74, 0.76, side * sx, side * sz, l1 ? C.glassLit.map((v) => v * 0.55) : C.glass, l1 && l2 ? 0.35 : l1 ? 0.25 : MAT.glass, 0.045);
""")
# Entrance: framed wooden door, metal canopy, concrete step.
s = rep(s, "  b.panel(dx, 0.45, dz, 1.15, 2.1, fx, fz, C.door, 0, 0.03);\n",
"  b.panel(dx, 0.4, dz, 1.4, 2.28, fx, fz, C.frame, SATIN, 0.02);\n  b.panel(dx, 0.45, dz, 1.15, 2.1, fx, fz, C.door, MAT.wood, 0.03);\n")
s = rep(s, "  b.box(cx, 2.75, cz, fx ? 0.9 : 1.6, 0.1, fx ? 1.6 : 0.9, roof, { ao: 1 });\n",
"  b.box(cx, 2.75, cz, fx ? 0.9 : 1.6, 0.1, fx ? 1.6 : 0.9, roof, { ao: 1, em: MAT.metal, bottom: true });\n")
s = rep(s, "  b.box(sx2, 0, sz2, fx ? 1.0 : 1.5, 0.22, fx ? 1.5 : 1.0, C.concrete, { ao: 0.85 });\n",
"  b.box(sx2, 0, sz2, fx ? 1.0 : 1.5, 0.22, fx ? 1.5 : 1.0, C.concrete, { ao: 0.85, em: MAT.concrete });\n")
s = rep(s, "    b.box(px, 3.12, pz, fx ? 1.1 : bw, 0.14, fx ? bw : 1.1, C.concrete, { ao: 1 });\n",
"    b.box(px, 3.12, pz, fx ? 1.1 : bw, 0.14, fx ? bw : 1.1, C.concrete, { ao: 1, em: MAT.concrete, bottom: true });\n")
# AC unit: fan grille, pipe duct up the wall; utility meter.
s = rep(s, "    b.box(px, 0.45, pz, fx ? 0.75 : 0.32, 0.58, fx ? 0.32 : 0.75, hex('#e6e4de'), { ao: 0.9 }); }\n",
"""    b.box(px, 0.45, pz, fx ? 0.75 : 0.32, 0.58, fx ? 0.32 : 0.75, hex('#e6e4de'), { ao: 0.9 });
    const nx2 = side * sx, nz2 = side * sz;
    b.panel(px + nx2 * 0.16 - (fx ? 0 : 0) , 0.53, pz + nz2 * 0.16, 0.4, 0.42, nx2, nz2, hex('#34373c'), SATIN, 0.006);
    const [wx, wz] = W(side * (w / 2 + 0.05), -set + 0.4 + d / 4 + 0.48);
    b.box(wx, 0.7, wz, 0.1, 2.3, 0.1, hex('#dcd9cf'), { ao: 1 });
    const [ux, uz] = W(side * (w / 2 + 0.06), -set + 0.4 + d / 4 - 1.1);
    b.box(ux, 1.25, uz, fx ? 0.3 : 0.1, 0.38, fx ? 0.1 : 0.3, hex('#c9c6bd'), { ao: 1, em: SATIN });
    b.panel(ux + nx2 * 0.05, 1.42, uz + nz2 * 0.05, 0.16, 0.12, nx2, nz2, hex('#cfe3ea'), -2, 0.004); }
""")
# Block walls + garden ground.
s = rep(s, "C.block, { ao: 0.8, top: hex('#c7c2b6') }", "C.block, { ao: 0.8, top: hex('#c7c2b6'), em: MAT.block }", 2)
s = rep(s, "0.012, r.chance(0.5) ? C.gravel : C.grassD);", "0.012, ...(r.chance(0.5) ? [C.gravel, MAT.asphalt] : [C.grassD, MAT.grass]));")
open(N, 'w', encoding='utf-8').write(s)
print('patched geometry.js + neighborhood.js OK')
