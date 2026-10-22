// World collision: axis-aligned boxes and vertical cylinders in a uniform grid.
// Player is a vertical capsule approximated by a circle (radius r) between feet and head.

const CELL = 8;
const STEP = 0.45;   // max ledge height you can walk up (kerbs, steps)

export class Collision {
  constructor(heightAt = () => 0) {
    this.boxes = [];
    this.circles = [];
    this.grid = new Map();
    this.heightAt = heightAt;
    this._seen = new Set();
    this._tmp = [];
  }

  _key(cx, cz) { return cx * 73856093 ^ cz * 19349663; }
  _insert(item, x0, z0, x1, z1) {
    for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) {
      for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
        const k = this._key(cx, cz);
        let list = this.grid.get(k);
        if (!list) { list = []; this.grid.set(k, list); }
        list.push(item);
      }
    }
  }

  // Solid box. y0..y1 vertical extent. tag lets gameplay know what was hit.
  addBox(x0, z0, x1, z1, y0, y1, tag = null) {
    const b = { kind: 0, x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), y0, y1, tag };
    this.boxes.push(b);
    this._insert(b, b.x0, b.z0, b.x1, b.z1);
    return b;
  }
  // Box given by centre + size, the way the world builder places things.
  addBoxC(x, z, w, d, y0, h, tag = null) { return this.addBox(x - w / 2, z - d / 2, x + w / 2, z + d / 2, y0, y0 + h, tag); }

  addCircle(x, z, r, y0, y1, tag = null) {
    const c = { kind: 1, x, z, r, y0, y1, tag };
    this.circles.push(c);
    this._insert(c, x - r, z - r, x + r, z + r);
    return c;
  }

  near(x0, z0, x1, z1) {
    const out = this._tmp; out.length = 0;
    const seen = this._seen; seen.clear();
    for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) {
      for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
        const list = this.grid.get(this._key(cx, cz));
        if (!list) continue;
        for (const it of list) if (!seen.has(it)) { seen.add(it); out.push(it); }
      }
    }
    return out;
  }

  // Highest walkable surface under (x,z) that is at most STEP above feetY.
  groundAt(x, z, feetY, r = 0) {
    let g = this.heightAt(x, z);
    for (const it of this.near(x - r, z - r, x + r, z + r)) {
      if (it.y1 > feetY + STEP) continue;
      if (it.kind === 0) {
        if (x >= it.x0 - r * 0.5 && x <= it.x1 + r * 0.5 && z >= it.z0 - r * 0.5 && z <= it.z1 + r * 0.5 && it.y1 > g) g = it.y1;
      } else if (Math.hypot(x - it.x, z - it.z) < it.r && it.y1 > g) g = it.y1;
    }
    return g;
  }

  // Push a circle out of everything it overlaps. Returns the pushed position and contact info.
  resolve(pos, r, feetY, height = 1.7, out = { x: 0, z: 0, hit: false, nx: 0, nz: 0, tag: null }, solid = null) {   // solid: a tag that blocks even when low enough to step on (kerbs for the car)
    let x = pos[0], z = pos[2];
    out.hit = false; out.nx = 0; out.nz = 0; out.tag = null;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const it of this.near(x - r - 0.5, z - r - 0.5, x + r + 0.5, z + r + 0.5)) {
        if ((it.y1 <= feetY + STEP && (solid === null || it.tag !== solid)) || it.y0 >= feetY + height) continue;
        let dx, dz, d;
        if (it.kind === 0) {
          const cx = Math.max(it.x0, Math.min(x, it.x1)), cz = Math.max(it.z0, Math.min(z, it.z1));
          dx = x - cx; dz = z - cz; d = Math.hypot(dx, dz);
          if (d >= r) continue;
          if (d < 1e-5) {
            // Centre inside the box: leave through the nearest face.
            const l = x - it.x0, rr = it.x1 - x, t = z - it.z0, b = it.z1 - z, m = Math.min(l, rr, t, b);
            if (m === l) { x = it.x0 - r; dx = -1; dz = 0; } else if (m === rr) { x = it.x1 + r; dx = 1; dz = 0; }
            else if (m === t) { z = it.z0 - r; dx = 0; dz = -1; } else { z = it.z1 + r; dx = 0; dz = 1; }
            d = 1;
          } else { const p = (r - d) / d; x += dx * p; z += dz * p; }
        } else {
          dx = x - it.x; dz = z - it.z; d = Math.hypot(dx, dz);
          const rr = r + it.r;
          if (d >= rr) continue;
          if (d < 1e-5) { dx = 1; dz = 0; d = 1; x = it.x + rr; }
          else { const p = (rr - d) / d; x += dx * p; z += dz * p; }
        }
        const l = Math.hypot(dx, dz) || 1;
        out.hit = true; out.nx = dx / l; out.nz = dz / l; out.tag = it.tag || out.tag;
        moved = true;
      }
      if (!moved) break;
    }
    out.x = x; out.z = z;
    return out;
  }

  // Segment cast for the camera. Returns hit fraction in [0,1] (1 = clear).
  segment(ax, ay, az, bx, by, bz, pad = 0.2) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    let best = 1;
    for (const it of this.near(Math.min(ax, bx) - 1, Math.min(az, bz) - 1, Math.max(ax, bx) + 1, Math.max(az, bz) + 1)) {
      let x0, x1, z0, z1;
      if (it.kind === 0) { x0 = it.x0 - pad; x1 = it.x1 + pad; z0 = it.z0 - pad; z1 = it.z1 + pad; }
      else { x0 = it.x - it.r - pad; x1 = it.x + it.r + pad; z0 = it.z - it.r - pad; z1 = it.z + it.r + pad; }
      const y0 = it.y0 - pad, y1 = it.y1 + pad;
      let tmin = 0, tmax = best;
      const slab = (o, d, lo, hi) => {
        if (Math.abs(d) < 1e-8) return o >= lo && o <= hi;
        let t0 = (lo - o) / d, t1 = (hi - o) / d;
        if (t0 > t1) { const t = t0; t0 = t1; t1 = t; }
        if (t0 > tmin) tmin = t0;
        if (t1 < tmax) tmax = t1;
        return tmin <= tmax;
      };
      if (slab(ax, dx, x0, x1) && slab(ay, dy, y0, y1) && slab(az, dz, z0, z1) && tmin < best) best = Math.max(0, tmin);
    }
    // Terrain: sample along the segment so the camera never dips under hills.
    for (let i = 1; i <= 8; i++) {
      const t = i / 8;
      if (ay + dy * t < this.heightAt(ax + dx * t, az + dz * t) + 0.3) { best = Math.min(best, (i - 1) / 8); break; }
    }
    return best;
  }
}
