// Hinode Delivery depot (日の出配送): Grandma Chiyo's little office on Asahi-dōri. The player's hub.
// Built in world space on a lot whose front faces +z (toward the main street).
import { hex } from '../engine/geometry.js';

const K = {
  wall: hex('#e6dccb'), wallIn: hex('#efe8dc'), floor: hex('#a9a598'), roof: hex('#3e434b'), trim: hex('#2a2f3a'),
  orange: hex('#e8742c'), white: hex('#f6f1e6'), navy: hex('#26324a'), wood: hex('#8a6440'), woodD: hex('#5b3f2c'),
  card: hex('#c49a6c'), cardL: hex('#d6b386'), tape: hex('#e2cfa6'), steel: hex('#8b949c'), cork: hex('#b98a58'),
  lamp: hex('#fff1cf'), leaf: hex('#4e7d3f'), bike: hex('#b8452f'), tyre: hex('#1e1e20'),
};

function parcel(b, col, x, y, z, w, h, d, tag = 'parcel') {
  b.box(x, y, z, w, h, d, K.card, { ao: 0.9, top: K.cardL });
  b.box(x, y + h - 0.005, z, w + 0.004, 0.012, d * 0.22, K.tape, { ao: 1, noTop: false });
  if (col) col.addBoxC(x, z, w, d, y, h, tag);
}

function wheel(b, x, y, z, r) {
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    b.beam([x + Math.cos(a0) * r, y + Math.sin(a0) * r, z], [x + Math.cos(a1) * r, y + Math.sin(a1) * r, z], 0.05, K.tyre);
  }
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI; b.beam([x - Math.cos(a) * r, y - Math.sin(a) * r, z], [x + Math.cos(a) * r, y + Math.sin(a) * r, z], 0.012, K.steel); }
}

// Chiyo's old bicycle, parked in the back. Flat tyres, basket on the front.
function oldBike(b, col, x, z) {
  const r = 0.33, y = r;
  wheel(b, x - 0.55, y, z, r); wheel(b, x + 0.55, y, z, r);
  const seat = [x - 0.2, 0.95, z], head = [x + 0.42, 0.98, z], crank = [x - 0.05, 0.36, z];
  b.beam([x - 0.55, y, z], crank, 0.04, K.bike); b.beam(crank, seat, 0.045, K.bike); b.beam(seat, [x - 0.55, y, z], 0.035, K.bike);
  b.beam(crank, head, 0.045, K.bike); b.beam(head, [x + 0.55, y, z], 0.04, K.bike);
  b.box(seat[0], seat[1], z, 0.26, 0.06, 0.13, K.trim, { ao: 1 });
  b.beam([head[0], 1.05, z - 0.28], [head[0], 1.05, z + 0.28], 0.03, K.steel);
  b.box(x + 0.72, 0.85, z, 0.32, 0.24, 0.36, K.steel.map((v) => v * 0.8), { ao: 0.9 });
  col.addBoxC(x, z, 1.5, 0.4, 0, 1.1, 'bike');
}

export function depot(ch, col, x, z, lotW, lotD) {
  const b = ch.at(x, z);
  const front = z + lotD / 2;              // lot edge on the street
  const W = 10, D = 8, H = 4.4;
  const fz = front - 5.6, bz = fz - D, cz = (fz + bz) / 2, x0 = x - W / 2, x1 = x + W / 2;
  const op0 = x - 2.4, op1 = x + 2.8;      // shutter opening

  // Forecourt and floor.
  b.ground(x - lotW / 2 + 0.3, fz, x + lotW / 2 - 0.3, front - 0.3, 0.014, hex('#b4aea2'));
  b.box(x, 0, cz, W, 0.12, D, K.floor, { ao: 1 });

  // Shell: back, sides, front piers, lintel, roof.
  const shell = (cx, czz, w, d, y0, h, c = K.wall) => { b.box(cx, y0, czz, w, h, d, c, { ao: 0.85 }); col.addBoxC(cx, czz, w, d, y0, h, 'depot'); };
  shell(x, bz + 0.15, W, 0.3, 0, H);
  shell(x0 + 0.15, cz, 0.3, D, 0, H);
  shell(x1 - 0.15, cz, 0.3, D, 0, H);
  shell((x0 + op0) / 2, fz - 0.15, op0 - x0, 0.3, 0, H);
  shell((op1 + x1) / 2, fz - 0.15, x1 - op1, 0.3, 0, H);
  b.box((op0 + op1) / 2, 3.0, fz - 0.15, op1 - op0, H - 3.0, 0.3, K.wall, { ao: 1 });
  col.addBox(op0, fz - 0.3, op1, fz, 3.0, H, 'depot');
  b.box(x, H, cz, W + 0.5, 0.28, D + 0.5, K.roof, { ao: 1 });
  col.addBoxC(x, cz, W + 0.5, D + 0.5, H, 0.28, 'depot');
  // Inner wall colour (a thin skin so the inside reads warmer than the outside).
  b.panel(x, 0.12, bz + 0.3, W - 0.6, H - 0.2, 0, 1, K.wallIn, 0, 0.005);
  // Rolled-up shutter and awning.
  b.box((op0 + op1) / 2, 2.82, fz + 0.05, op1 - op0, 0.2, 0.22, K.steel, { ao: 1 });
  b.box(x, 3.0, fz + 0.75, W + 0.3, 0.08, 1.5, K.trim, { ao: 1 });
  b.box(x, 2.92, fz + 1.5, W + 0.3, 0.16, 0.06, K.orange, { ao: 1 });

  // Sign band: orange board with a rising-sun mark.
  b.panel(x, 3.08, fz, W - 0.2, 1.18, 0, 1, K.orange, 0.62, 0.02);
  const sx = x0 + 1.3, sy = 3.42, sr = 0.42, zz = fz + 0.035;
  for (let i = 0; i < 10; i++) {
    const a0 = (i / 10) * Math.PI, a1 = ((i + 1) / 10) * Math.PI;
    b.tri([sx, sy, zz], [sx + Math.cos(a0) * sr, sy + Math.sin(a0) * sr, zz], [sx + Math.cos(a1) * sr, sy + Math.sin(a1) * sr, zz], K.white, 0.8);
  }
  b.panel(sx, 3.3, fz, 1.1, 0.07, 0, 1, K.white, 0.8, 0.04);
  b.panel(sx, 3.2, fz, 0.8, 0.05, 0, 1, K.white, 0.8, 0.04);
  b.panel(x + 0.9, 3.36, fz, 5.6, 0.16, 0, 1, K.white, 0.8, 0.04);
  b.panel(x + 0.3, 3.62, fz, 4.4, 0.08, 0, 1, K.navy, 0.7, 0.04);

  // Delivery board on the right pier, facing the street.
  const bx = (op1 + x1) / 2;
  b.panel(bx, 0.95, fz, 1.95, 1.35, 0, 1, K.woodD, 0, 0.03);
  b.panel(bx, 1.02, fz, 1.75, 1.2, 0, 1, K.cork, 0, 0.045);
  const slips = [[-0.55, 1.6, K.white], [-0.05, 1.68, hex('#f3e6b3')], [0.5, 1.58, K.white], [-0.45, 1.18, hex('#f6d2c4')], [0.15, 1.2, K.white], [0.62, 1.15, hex('#d7e6ef')]];
  for (const [ox, oy, c] of slips) { b.panel(bx + ox, oy - 0.2, fz, 0.42, 0.34, 0, 1, c, 0, 0.055); b.panel(bx + ox, oy + 0.08, fz, 0.05, 0.05, 0, 1, K.orange, 0, 0.06); }
  b.box(bx, 2.55, fz + 0.18, 1.6, 0.06, 0.12, K.lamp, { em: 0.9, ao: 1 });

  // Interior: counter, shelves of parcels, ceiling lights, cart, Chiyo's bike.
  const cx = x + 1.6, ccz = bz + 1.45;
  b.box(cx, 0.12, ccz, 4.2, 0.95, 0.8, K.wood, { ao: 0.85, top: hex('#a77d52') });
  col.addBoxC(cx, ccz, 4.2, 0.8, 0.12, 0.95, 'counter');
  parcel(b, null, cx - 1.3, 1.07, ccz, 0.5, 0.3, 0.4);
  b.box(cx + 1.2, 1.07, ccz, 0.4, 0.04, 0.3, hex('#30343c'), { ao: 1 });           // ledger
  b.box(cx + 0.4, 1.07, ccz - 0.1, 0.18, 0.2, 0.14, hex('#c8322b'), { ao: 1 });    // stamp tin
  const shx = x0 + 0.75, shz = cz + 0.6;
  for (const sy2 of [0.12, 0.95, 1.8]) b.box(shx, sy2, shz, 0.85, 0.05, 3.8, K.steel, { ao: 1 });
  for (const oz of [-1.85, 1.85]) for (const ox of [-0.38, 0.38]) b.beam([shx + ox, 0.12, shz + oz], [shx + ox, 2.3, shz + oz], 0.04, K.steel);
  col.addBoxC(shx, shz, 0.9, 3.9, 0, 2.3, 'shelf');
  const sizes = [[0.6, 0.4, 0.5], [0.45, 0.35, 0.4], [0.7, 0.5, 0.55], [0.35, 0.25, 0.3], [0.5, 0.45, 0.45]];
  let si = 0;
  for (const sy2 of [0.17, 1.0, 1.85]) for (let oz = -1.5; oz <= 1.5; oz += 0.75) {
    const [w, h, d] = sizes[si++ % sizes.length];
    if ((si * 7) % 5 === 0) continue;
    parcel(b, null, shx, sy2, shz + oz, Math.min(w, 0.75), h, Math.min(d, 0.6));
  }
  for (const lx of [x - 2.5, x + 2.5]) { b.box(lx, H - 0.1, cz, 1.2, 0.06, 0.25, K.lamp, { em: 1, ao: 1 }); }
  oldBike(b, col, x0 + 1.4, bz + 0.6);
  // Hand cart with a stack outside.
  const tx = x - 3.4, tz = fz + 1.6;
  b.box(tx, 0.18, tz, 0.9, 0.06, 0.6, K.steel, { ao: 1 });
  b.beam([tx + 0.45, 0.24, tz - 0.3], [tx + 0.6, 1.0, tz - 0.3], 0.03, K.steel); b.beam([tx + 0.45, 0.24, tz + 0.3], [tx + 0.6, 1.0, tz + 0.3], 0.03, K.steel);
  b.beam([tx + 0.6, 1.0, tz - 0.32], [tx + 0.6, 1.0, tz + 0.32], 0.03, K.steel);
  parcel(b, null, tx, 0.24, tz, 0.6, 0.4, 0.45); parcel(b, null, tx - 0.05, 0.64, tz, 0.45, 0.3, 0.4);
  col.addBoxC(tx + 0.1, tz, 1.1, 0.7, 0, 1.0, 'cart');
  // Planters either side of the forecourt, bench by the board.
  for (const px of [x - lotW / 2 + 0.9, x + lotW / 2 - 0.9]) {
    b.box(px, 0, front - 1.2, 0.7, 0.45, 1.8, K.woodD, { ao: 0.8 });
    b.blob(px, 0.65, front - 1.2, 0.45, K.leaf, 0.7, 6); b.blob(px, 0.6, front - 1.8, 0.35, K.leaf, 0.7, 5);
    col.addBoxC(px, front - 1.2, 0.7, 1.8, 0, 0.9, 'planter');
  }
  b.box(x1 + 0.1, 0.42, fz + 2.3, 0.45, 0.06, 1.5, K.wood, { ao: 1 });
  for (const o of [-0.6, 0.6]) b.box(x1 + 0.1, 0, fz + 2.3 + o, 0.4, 0.42, 0.07, K.trim, { ao: 1 });
  col.addBoxC(x1 + 0.1, fz + 2.3, 0.45, 1.5, 0, 0.48, 'bench');

  return {
    id: 'depot', name: 'Hinode Delivery', jp: '日の出配送',
    board: [bx, fz + 1.0], counter: [cx, ccz + 1.05], center: [x, cz], gate: [x, front + 0.8],
  };
}
