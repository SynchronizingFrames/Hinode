// Geometry builder: accumulates flat-shaded triangles with per-vertex colour.
// Colour is vec4: rgb (sRGB 0..1) + emissive weight in alpha (windows, signs, bulbs glow at night).

export function hex(h, jitter = 0, r = Math.random) {
  const n = typeof h === 'number' ? h : parseInt(h.replace('#', ''), 16);
  let c = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  if (jitter) { const j = (r() - 0.5) * jitter; c = c.map((v) => Math.min(1, Math.max(0, v + j))); }
  return c;
}

export class Builder {
  constructor() { this.pos = []; this.nor = []; this.col = []; }
  get vertexCount() { return this.pos.length / 3; }

  tri(a, b, c, col, em = 0) { this.tri3(a, b, c, col, col, col, em); }

  // Triangle with a colour per vertex (used for baked ground-contact shading).
  tri3(a, b, c, ca, cb, cc, em = 0) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    this.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    this.nor.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    // em wins; otherwise the builder's current material (matV for near-vertical faces, mat for the rest).
    const m = Math.abs(ny) < 0.35 && this.matV != null ? this.matV : this.mat;
    const e = em || m || 0;
    this.col.push(ca[0], ca[1], ca[2], e, cb[0], cb[1], cb[2], e, cc[0], cc[1], cc[2], e);
  }
  // Vertical quad: a,b bottom edge, c,d top edge. Bottom gets darker colour (fake ambient occlusion).
  wall(a, b, c, d, bottom, top, em = 0) { this.tri3(a, b, c, bottom, bottom, top, em); this.tri3(a, c, d, bottom, top, top, em); }
  // Quad given counter-clockwise (seen from outside).
  quad(a, b, c, d, col, em = 0) { this.tri(a, b, c, col, em); this.tri(a, c, d, col, em); }

  // Box: centre x,z; bottom y; size w (x), h (y), d (z); rotated by yaw around its centre.
  box(x, y, z, w, h, d, col, opt = {}) {
    const yaw = opt.yaw || 0, em = opt.em || 0, c = Math.cos(yaw), s = Math.sin(yaw);
    const hw = w / 2, hd = d / 2;
    const P = (lx, ly, lz) => [x + lx * c + lz * s, y + ly, z - lx * s + lz * c];
    const p000 = P(-hw, 0, -hd), p100 = P(hw, 0, -hd), p110 = P(hw, h, -hd), p010 = P(-hw, h, -hd);
    const p001 = P(-hw, 0, hd), p101 = P(hw, 0, hd), p111 = P(hw, h, hd), p011 = P(-hw, h, hd);
    const top = opt.top || col, side = opt.side || col;
    const k = opt.ao === undefined ? (h > 1.2 ? 0.62 : 0.8) : opt.ao;
    const sb = side.map((v) => v * k), cb = col.map((v) => v * k);
    this.wall(p001, p101, p111, p011, sb, side, em);      // +z
    this.wall(p100, p000, p010, p110, sb, side, em);      // -z
    this.wall(p101, p100, p110, p111, cb, col, em);       // +x
    this.wall(p000, p001, p011, p010, cb, col, em);       // -x
    if (!opt.noTop) this.quad(p011, p111, p110, p010, top, em);
    if (opt.bottom) this.quad(p000, p100, p101, p001, col, em);
  }

  // Flat panel facing a direction (for windows, signs, doors). nx/nz is the outward normal (axis aligned).
  panel(x, y, z, w, h, nx, nz, col, em = 0, off = 0.02) {
    const ox = x + nx * off, oz = z + nz * off;
    // tangent = up x normal
    const tx = nz, tz = -nx;
    const a = [ox - tx * w / 2, y, oz - tz * w / 2], b = [ox + tx * w / 2, y, oz + tz * w / 2];
    const c = [b[0], y + h, b[2]], d = [a[0], y + h, a[2]];
    this.quad(a, b, c, d, col, em);
  }

  // Gable roof along X (ridge parallel to x) or Z. Includes overhang and thick fascia.
  gable(x, y, z, w, d, rise, col, alongX = true, over = 0.45, fascia = null) {
    const hw = w / 2 + over, hd = d / 2 + over;
    if (alongX) {
      const a = [x - hw, y, z + hd], b = [x + hw, y, z + hd], r1 = [x + hw, y + rise, z], r0 = [x - hw, y + rise, z];
      const c = [x + hw, y, z - hd], e = [x - hw, y, z - hd];
      this.quad(a, b, r1, r0, col); this.quad(c, e, r0, r1, col);
      const g = fascia || col;
      this.tri([x - w / 2, y, z + d / 2], [x - w / 2, y + rise * (d / 2) / hd, z], [x - w / 2, y, z - d / 2], g);
      this.tri([x + w / 2, y, z - d / 2], [x + w / 2, y + rise * (d / 2) / hd, z], [x + w / 2, y, z + d / 2], g);
      this.quad(e, c, [c[0], y - 0.12, c[2]], [e[0], y - 0.12, e[2]], g);
      this.quad(b, a, [a[0], y - 0.12, a[2]], [b[0], y - 0.12, b[2]], g);
    } else {
      const a = [x + hw, y, z + hd], b = [x + hw, y, z - hd], r1 = [x, y + rise, z - hd], r0 = [x, y + rise, z + hd];
      const c = [x - hw, y, z - hd], e = [x - hw, y, z + hd];
      this.quad(a, b, r1, r0, col); this.quad(c, e, r0, r1, col);
      const g = fascia || col;
      this.tri([x + w / 2, y, z + d / 2], [x, y + rise * (w / 2) / hw, z + d / 2], [x - w / 2, y, z + d / 2], g);
      this.tri([x - w / 2, y, z - d / 2], [x, y + rise * (w / 2) / hw, z - d / 2], [x + w / 2, y, z - d / 2], g);
      this.quad(b, a, [a[0], y - 0.12, a[2]], [b[0], y - 0.12, b[2]], g);
      this.quad(e, c, [c[0], y - 0.12, c[2]], [e[0], y - 0.12, e[2]], g);
    }
  }

  // Hip roof (four slopes), common on Japanese houses.
  hip(x, y, z, w, d, rise, col, over = 0.5) {
    const hw = w / 2 + over, hd = d / 2 + over, ridge = Math.max(0, (w - d) / 2);
    const a = [x - hw, y, z + hd], b = [x + hw, y, z + hd], c = [x + hw, y, z - hd], e = [x - hw, y, z - hd];
    const r0 = [x - ridge, y + rise, z], r1 = [x + ridge, y + rise, z];
    this.quad(a, b, r1, r0, col); this.quad(c, e, r0, r1, col);
    this.tri(b, c, r1, col); this.tri(e, a, r0, col);
    const f = col.map((v) => v * 0.7);
    for (const [p, q] of [[a, b], [b, c], [c, e], [e, a]]) this.quad(q, p, [p[0], y - 0.14, p[2]], [q[0], y - 0.14, q[2]], f);
  }

  cyl(x, y, z, r, h, col, seg = 8, em = 0, r2 = r) {
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const p0 = [x + Math.cos(a0) * r, y, z + Math.sin(a0) * r], p1 = [x + Math.cos(a1) * r, y, z + Math.sin(a1) * r];
      const q0 = [x + Math.cos(a0) * r2, y + h, z + Math.sin(a0) * r2], q1 = [x + Math.cos(a1) * r2, y + h, z + Math.sin(a1) * r2];
      this.quad(p1, p0, q0, q1, col, em);
      this.tri([x, y + h, z], q1, q0, col, em);
    }
  }

  // Thin beam between two points (wires, rails, handrails). Square cross-section.
  beam(p, q, t, col, em = 0) {
    const dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2];
    const l = Math.hypot(dx, dy, dz) || 1;
    const fx = dx / l, fy = dy / l, fz = dz / l;
    let ux = 0, uy = 1, uz = 0;
    if (Math.abs(fy) > 0.9) { ux = 1; uy = 0; }
    let sx = fy * uz - fz * uy, sy = fz * ux - fx * uz, sz = fx * uy - fy * ux;
    const sl = Math.hypot(sx, sy, sz); sx /= sl; sy /= sl; sz /= sl;
    const vx = sy * fz - sz * fy, vy = sz * fx - sx * fz, vz = sx * fy - sy * fx;
    const h = t / 2;
    const C = (o, a, b) => [o[0] + (sx * a + vx * b) * h, o[1] + (sy * a + vy * b) * h, o[2] + (sz * a + vz * b) * h];
    const corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
    for (let i = 0; i < 4; i++) {
      const [a0, b0] = corners[i], [a1, b1] = corners[(i + 1) % 4];
      this.quad(C(p, a0, b0), C(p, a1, b1), C(q, a1, b1), C(q, a0, b0), col, em);
    }
  }

  // Low-poly sphere-ish blob for foliage and heads.
  blob(x, y, z, r, col, sy = 1, seg = 6, em = 0) {
    const rings = Math.max(3, seg - 2);
    for (let i = 0; i < rings; i++) {
      const t0 = (i / rings) * Math.PI, t1 = ((i + 1) / rings) * Math.PI;
      for (let j = 0; j < seg; j++) {
        const p0 = (j / seg) * Math.PI * 2, p1 = ((j + 1) / seg) * Math.PI * 2;
        const P = (t, p) => [x + Math.sin(t) * Math.cos(p) * r, y + Math.cos(t) * r * sy, z + Math.sin(t) * Math.sin(p) * r];
        const a = P(t0, p0), b = P(t0, p1), c = P(t1, p1), d = P(t1, p0);
        if (i === 0) this.tri(a, c, d, col, em);
        else if (i === rings - 1) this.tri(a, b, d, col, em);
        else this.quad(a, b, c, d, col, em);
      }
    }
  }

  // Flat ground polygon (y fixed), rectangle x0..x1, z0..z1.
  ground(x0, z0, x1, z1, y, col, em = 0) {
    this.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], col, em);
  }

  append(other) {
    for (let i = 0; i < other.pos.length; i++) this.pos.push(other.pos[i]);
    for (let i = 0; i < other.nor.length; i++) this.nor.push(other.nor[i]);
    for (let i = 0; i < other.col.length; i++) this.col.push(other.col[i]);
  }
}
