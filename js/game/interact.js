// Finds the interactable spot the player is standing at and what pressing E would do there.
const hhmm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export class Interact {
  constructor(world, jobs) {
    this.jobs = jobs;
    const d = world.depot;
    this.spots = [
      { type: 'board', x: d.board[0], z: d.board[1], r: 1.7 },
      { type: 'place', ref: 'depot', x: d.counter[0], z: d.counter[1], r: 1.6 },
      ...world.lots.map((l) => ({ type: 'place', ref: `lot:${l.id}`, x: l.door[0], z: l.door[1], r: 1.7 })),
      ...world.postboxes.map((p) => ({ type: 'place', ref: `post:${p.id}`, x: p.stand[0], z: p.stand[1], r: 1.6 })),
      ...((world.tokyo && world.tokyo.shops) || []).map((s, i) => (s.kind === 'shutter' ? null : { type: 'place', ref: `shop:${i}`, x: s.x, z: s.z, r: 1.7 })).filter(Boolean),
      ...[...jobs.places.values()].filter((p) => p.kind === 'npc' || p.kind === 'story').map((p) => ({ type: 'place', ref: p.ref, x: p.x, z: p.z, r: 1.9 })),
    ];
    this.current = null;
  }

  nearest(x, z) {
    let best = null, bd = Infinity;
    for (const s of this.spots) { const d = Math.hypot(s.x - x, s.z - z); if (d < s.r && d < bd) { bd = d; best = s; } }
    return best;
  }

  // -> { verb, text, sub, act? , board?, passive? } or null
  probe(x, z) {
    const s = this.nearest(x, z);
    if (!s) return (this.current = null);
    if (s.type === 'board') return (this.current = { spot: s, verb: 'Open', text: 'Delivery board', sub: '配達ボード', board: true });
    const pr = this.jobs.promptAt(s.ref);
    if (pr) return (this.current = { spot: s, ...pr });
    const p = this.jobs.place(s.ref);
    if (p.kind === 'npc' || p.kind === 'story') return (this.current = null);   // talking takes over there
    if (p.kind === 'depot') return (this.current = { spot: s, passive: true, text: 'Depot counter', sub: 'Accepted parcels are picked up here' });
    if (p.kind === 'postbox') return (this.current = { spot: s, passive: true, text: `郵便ポスト · ${p.name}`, sub: 'Collected at five' });
    if (p.kind === 'shop' && this.shop) {
      const si = this.shop.info(p.shop);
      if (si) {
        if (!this.shop.open(p.shop)) return (this.current = { spot: s, passive: true, text: `${si.jp} · ${si.en}`, sub: `Closed · opens ${hhmm(si.hours[0])}` });
        return (this.current = { spot: s, verb: si.verb, text: `${si.jp} · ${si.en}`, sub: si.tag, shop: true, act: () => { if (this.onShop) this.onShop(p); } });
      }
    }
    return (this.current = { spot: s, passive: true, text: `${p.jp} · ${p.name}`, sub: p.addr });
  }
}
