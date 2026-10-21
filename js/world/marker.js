// Floating target markers: a spinning gem over the spot and a dashed ring on the ground.
import { Builder, hex } from '../engine/geometry.js';
import { mat4, poseMatrix } from '../engine/math.js';

const COLORS = { Collect: '#ff9a4a', Deliver: '#57d6a8', board: '#fff1cf' };

function both(b, a, c, d, col) { b.tri(a, c, d, col, 1); b.tri(a, d, c, col, 1); }

function gem(col) {
  const b = new Builder(), top = [0, 0.34, 0], bot = [0, -0.34, 0];
  const ring = [[0.21, 0, 0], [0, 0, 0.21], [-0.21, 0, 0], [0, 0, -0.21]];
  for (let i = 0; i < 4; i++) { const a = ring[i], c = ring[(i + 1) % 4]; both(b, top, a, c, col); both(b, bot, a, c, col); }
  return b;
}

function ring(col) {
  const b = new Builder(), n = 24, r0 = 0.62, r1 = 0.8, y = 0.035;
  for (let i = 0; i < n; i += 2) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1.4) / n) * Math.PI * 2;
    const p = (r, a) => [Math.cos(a) * r, y, Math.sin(a) * r];
    both(b, p(r0, a0), p(r1, a0), p(r1, a1), col);
    both(b, p(r0, a0), p(r1, a1), p(r0, a1), col);
  }
  return b;
}

export class Markers {
  constructor(r) {
    this.mesh = {};
    for (const [k, c] of Object.entries(COLORS)) this.mesh[k] = { gem: r.mesh(gem(hex(c))), ring: r.mesh(ring(hex(c))) };
    this.m = mat4();
  }

  // list: [{ x, z, kind: 'Collect'|'Deliver'|'board', main }]
  draw(r, list, t) {
    for (const k of list) {
      const M = this.mesh[k.kind] || this.mesh.Collect, s = k.main ? 1.15 : 0.8;
      const bob = Math.sin(t * 2.2 + k.x * 0.3) * 0.12;
      r.draw(M.gem, poseMatrix(this.m, k.x, 2.1 + bob, k.z, t * 1.4, s), false);
      r.draw(M.ring, poseMatrix(this.m, k.x, 0, k.z, -t * 0.6, s), false);
    }
  }
}
