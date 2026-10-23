// Hinode Motors: the old coin-parking lot under the Gado-shita tracks, now a small car dealer.
// Six display cars you can walk round (they are solid), a sign you can browse at, and a kerbside
// spot on Gado-shita where test-drive and new cars wait for you.
import { mat4, poseMatrix, multiply } from '../engine/math.js';
import { buildVehicle } from '../game/vehicles.js';
import { MODELS, ORDER, paintHex } from '../data/cars.js';

export const LOT = { x0: 84, x1: 96, z0: 24.2, z1: 44.2, y: 0.15 };
export const HOURS = [540, 1260];   // 09:00 to 21:00
const XS = [86.3, 90.0, 93.7];
const hhmm = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
const yen = (n) => '\u00a5' + Math.round(n).toLocaleString('en-US');

export class Dealer {
  constructor(renderer, world) {
    this.r = renderer;
    const mid = (LOT.z0 + LOT.z1) / 2;
    this.sign = [95.2, mid];
    this.door = [97.8, mid];            // where you are dropped after a test drive
    this.out = [112.4, 36.5, Math.PI];  // kerbside lane on Gado-shita, nose toward Yasukuni-dori
    this.m = mat4(); this.root = mat4(); this.flat = mat4(); this.local = mat4();
    this.slots = ORDER.map((id, i) => {
      const row = i < 3 ? 0 : 1;
      return { id, x: XS[i % 3], z: row === 0 ? LOT.z0 + 2.9 : LOT.z1 - 2.9, yaw: row === 0 ? 0 : Math.PI, spec: null, mesh: null, lo: null };
    });
    const col = world && (world.collision || world.col);
    if (col && col.addBoxC) { col.addBoxC(85.4, 34.2, 2.8, 4.0, 0, 2.6, 'dealer'); col.addBoxC(95.2, 34.2, 0.4, 0.4, 0, 2.2, 'pole'); }
    for (const s of this.slots) {
      const M = MODELS[s.id], hexc = paintHex(M.paint);
      const v = buildVehicle(M.style, hexc), lo = buildVehicle(M.style, hexc, { lod: 0.3 });
      s.spec = v.spec;
      s.mesh = { body: renderer.mesh(v.body), wheel: renderer.mesh(v.wheel) };
      s.lo = { body: renderer.mesh(lo.body), wheel: renderer.mesh(lo.wheel) };
      if (col && col.addBoxC) col.addBoxC(s.x, s.z, v.spec.wid - 0.1, v.spec.len - 0.2, 0, 1.5, 'car');
    }
  }

  isOpen(min) { return min >= HOURS[0] && min < HOURS[1]; }
  hours() { return hhmm(HOURS[0]) + '\u2013' + hhmm(HOURS[1]); }
  slot(id) { return this.slots.find((s) => s.id === id) || null; }

  // owns(id) tells the prompt whether a model is already yours.
  probe(px, pz, open, min, owns) {
    if (px < LOT.x0 - 1 || px > LOT.x1 + 3 || pz < LOT.z0 - 1 || pz > LOT.z1 + 1) return null;
    let best = null, bd = 3.4;
    for (const s of this.slots) { const d = Math.hypot(px - s.x, pz - s.z); if (d < bd) { bd = d; best = s; } }
    const ds = Math.hypot(px - this.sign[0], pz - this.sign[1]);
    if (!best && ds > 3.2) return null;
    if (!this.isOpen(min)) return { verb: 'Closed', text: '\u65e5\u306e\u51fa \u00b7 Hinode Motors', sub: `Open ${this.hours()} \u00b7 come back at ${hhmm(HOURS[0])}`, passive: true, dealer: true };
    if (best && ds > bd) {
      const M = MODELS[best.id];
      const sub = owns && owns(best.id) ? `${M.cls} \u00b7 already in your garage` : `${M.cls} \u00b7 ${yen(M.price)} \u00b7 test drive free`;
      return { verb: 'Look', text: M.name, sub, act: () => open(best.id), dealer: true, model: best.id };
    }
    return { verb: 'Browse', text: '\u65e5\u306e\u51fa \u00b7 Hinode Motors', sub: 'New and used cars \u00b7 free test drives', act: () => open(null), dealer: true };
  }

  draw(r, cam) {
    for (const s of this.slots) {
      const d = Math.hypot(s.x - cam.pos[0], s.z - cam.pos[2]);
      if (d > 170) continue;
      const M = d > (r.lodDist || 30) ? s.lo : s.mesh, S = s.spec;
      poseMatrix(this.root, s.x, LOT.y + 0.02, s.z, s.yaw, 1);
      r.draw(M.body, this.root);
      poseMatrix(this.flat, s.x, LOT.y, s.z, s.yaw, 1);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        // showroom pose: front wheels turned a little so you see the face of the rim
        poseMatrix(this.local, sx * S.track, S.r, sz * S.axle, sz > 0 ? 0.22 : 0, 1, 0);
        r.draw(M.wheel, multiply(this.m, this.flat, this.local));
      }
    }
  }
}
