// quick: syntax-load vehicles and compare full vs LOD triangle counts
import { buildVehicle } from '../js/game/vehicles.js';
const tris = (b) => b.pos.length / 9;
for (const s of ['coupe', 'sedan', 'kei']) {
  const hi = buildVehicle(s, '#b3161d'), lo = buildVehicle(s, '#b3161d', { lod: 0.3 });
  let bad = 0; for (const v of lo.body.pos) if (!Number.isFinite(v)) bad++;
  console.log(s, 'hi body', tris(hi.body), 'wheel', tris(hi.wheel), '| lo body', tris(lo.body), 'wheel', tris(lo.wheel), 'bad', bad);
}
