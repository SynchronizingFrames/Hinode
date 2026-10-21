// Aoshima residents: procedural bodies, idle animation, they turn to face you, wave, and talk.
import { Builder, hex } from '../engine/geometry.js';
import { mat4, poseMatrix, multiply, damp, dampAngle } from '../engine/math.js';
import { CAST } from '../data/cast.js';

const KEY = 'hinode.npc', TALK_R = 1.9, BODY_R = 0.55;
const part = (fn) => { const b = new Builder(); fn(b); return b; };
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function buildPerson(L) {
  const top = hex(L.top), bot = hex(L.bottom), skin = hex(L.skin), hair = hex(L.hair), eye = hex('#201814'), shoe = hex('#3b342e');
  return {
    hips: part((b) => b.box(0, 0, 0, 0.36, 0.2, 0.22, bot, { ao: 1 })),
    torso: part((b) => {
      b.box(0, 0, 0, 0.42, 0.56, 0.25, top, { ao: 0.9 });
      if (L.collar) b.box(0, 0.44, 0.05, 0.36, 0.1, 0.17, hex(L.collar), { ao: 1 });
      if (L.scarf) b.box(0, 0.3, 0.128, 0.09, 0.16, 0.012, hex(L.scarf), { ao: 1 });
      if (L.tie) b.box(0, 0.16, 0.128, 0.055, 0.34, 0.012, hex(L.tie), { ao: 1 });
      if (L.apron) b.box(0, -0.1, 0.13, 0.34, 0.5, 0.012, hex(L.apron), { ao: 1 });
      if (L.hat === 'police') b.box(-0.1, 0.36, 0.128, 0.06, 0.06, 0.012, hex('#d9b44a'), { em: 1, ao: 1 });
    }),
    head: part((b) => {
      b.box(0, 0, 0, 0.12, 0.08, 0.12, skin, { ao: 1 });
      b.blob(0, 0.2, 0, 0.15, skin, 1.1, 8);
      b.blob(0, 0.25, -0.02, 0.155, hair, 0.9, 8);
      b.box(-0.055, 0.2, 0.135, 0.03, 0.03, 0.02, eye, { ao: 1 });
      b.box(0.055, 0.2, 0.135, 0.03, 0.03, 0.02, eye, { ao: 1 });
      if (L.glasses) { b.box(0, 0.222, 0.15, 0.22, 0.016, 0.008, hex('#2a2a2a'), { ao: 1 }); b.box(0, 0.205, 0.15, 0.03, 0.012, 0.008, hex('#2a2a2a'), { ao: 1 }); }
      const h = L.hat;
      if (h === 'bun') b.blob(0, 0.37, -0.09, 0.075, hair, 1, 6);
      if (h === 'cap') { const c = hex(L.cap || '#e8742c'); b.cyl(0, 0.3, -0.005, 0.16, 0.07, c, 10); b.box(0, 0.3, 0.17, 0.22, 0.025, 0.14, c, { ao: 1 }); }
      if (h === 'bucket') { const c = hex('#b9ad8f'); b.cyl(0, 0.29, -0.01, 0.23, 0.025, c, 12); b.cyl(0, 0.3, -0.01, 0.16, 0.13, c, 12, 0, 0.14); }
      if (h === 'scarf') b.blob(0, 0.27, -0.03, 0.163, hex('#d8c59c'), 0.86, 8);
      if (h === 'police') { const c = hex('#1f2b44'); b.cyl(0, 0.31, -0.005, 0.165, 0.11, c, 12); b.box(0, 0.31, 0.16, 0.2, 0.02, 0.1, hex('#141414'), { ao: 1 }); b.box(0, 0.37, 0.163, 0.045, 0.045, 0.01, hex('#d9b44a'), { em: 1, ao: 1 }); }
    }),
    leg: part((b) => { b.box(0, -0.78, 0, 0.15, 0.78, 0.17, bot, { ao: 1 }); b.box(0, -0.86, 0.03, 0.16, 0.09, 0.26, shoe, { ao: 1 }); }),
    arm: part((b) => { b.box(0, -0.56, 0, 0.12, 0.56, 0.13, top, { ao: 1 }); b.box(0, -0.66, 0, 0.1, 0.1, 0.1, skin, { ao: 1 }); }),
  };
}

function anchorOf(spot, world) {
  if (spot.lot != null && world.lots && world.lots.length) {
    const l = world.lots[spot.lot % world.lots.length], g = l.gate || l.door;
    const fx = g[0] - l.x, fz = g[1] - l.z, fl = Math.hypot(fx, fz) || 1;
    // Stand on the pavement just beside the gate, facing the street.
    return [g[0] - (fz / fl) * 0.9, g[1] + (fx / fl) * 0.9, Math.atan2(fx, fz)];
  }
  if (spot.depot && world.depot) { const g = world.depot.gate; return [g[0] + 1.7, g[1] - 2.6, Math.PI]; }
  if (spot.at) return [spot.at[0], spot.at[1], spot.yaw || 0];
  return null;
}

function load() { try { return JSON.parse(localStorage.getItem(KEY)) || { met: {}, last: {} }; } catch { return { met: {}, last: {} }; } }

export class Npcs {
  constructor(renderer, world) {
    this.list = [];
    this.m = mat4(); this.root = mat4(); this.local = mat4();
    this.state = load();
    this.state.met = this.state.met || {}; this.state.last = this.state.last || {};
    this.shadow = renderer.mesh(part((b) => {
      const n = 14, c = hex('#000000');
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
        b.tri([0, 0.03, 0], [Math.cos(a1) * 0.4, 0.03, Math.sin(a1) * 0.4], [Math.cos(a0) * 0.4, 0.03, Math.sin(a0) * 0.4], c);
      }
    }));
    this.mark = renderer.mesh(part((b) => { // little speech bubble: "has something to say today"
      b.box(0, 0, 0, 0.26, 0.17, 0.05, hex('#f6f1e7'), { em: 1, ao: 1 });
      b.box(-0.05, -0.06, 0, 0.06, 0.06, 0.05, hex('#f6f1e7'), { em: 1, ao: 1 });
      for (const x of [-0.07, 0, 0.07]) b.box(x, 0.07, 0.03, 0.035, 0.035, 0.01, hex('#e8742c'), { em: 1, ao: 1 });
    }));
    const col = world.collision, tmp = { x: 0, z: 0, hit: false, nx: 0, nz: 0, tag: null };
    for (const c of CAST) {
      const a = anchorOf(c.spot, world);
      if (!a) continue;
      let x = a[0], z = a[1];
      for (let i = 0; i < 3; i++) { col.resolve([x, 0, z], 0.4, 0, 1.6, tmp); x = tmp.x; z = tmp.z; }
      const mesh = {};
      for (const [k, b] of Object.entries(buildPerson(c.look))) mesh[k] = renderer.mesh(b);
      this.list.push({ c, mesh, x, z, yaw: a[2], base: a[2], head: 0, phase: Math.random() * 6, wave: 0, near: false, out: true, s: c.look.h || 1, idx: { chat: 0, about: 0 } });
    }
  }

  persist() { try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch { /* storage full or blocked: fine */ } }

  update(dt, player, clock) {
    this.day = clock.day;
    const h = clock.min / 60, px = player.pos[0], pz = player.pos[2];
    for (const n of this.list) {
      n.out = n.c.hours.some(([a, b]) => h >= a && h < b);
      if (!n.out) continue;
      const dx = px - n.x, dz = pz - n.z, d = Math.hypot(dx, dz);
      const close = d < 4.5;
      if (close && !n.near && d > 2.2) n.wave = 1;          // wave when you walk up
      n.near = close;
      n.wave = Math.max(0, n.wave - dt * 0.8);
      n.phase += dt;
      const want = close ? Math.atan2(dx, dz) : n.base + Math.sin(n.phase * 0.21) * 0.5;
      n.yaw = dampAngle(n.yaw, want, close ? 5 : 1.2, dt);
      n.head = damp(n.head, close ? 0 : Math.sin(n.phase * 0.37) * 0.35, 3, dt);
      if (d < BODY_R && d > 1e-4) { player.pos[0] = n.x + (dx / d) * BODY_R; player.pos[2] = n.z + (dz / d) * BODY_R; }
    }
  }

  nearest(x, z) {
    let best = null, bd = TALK_R;
    for (const n of this.list) { if (!n.out) continue; const d = Math.hypot(n.x - x, n.z - z); if (d < bd) { bd = d; best = n; } }
    return best;
  }

  // Prompt for the HUD, or null. `talk(n)` is called when E is pressed.
  probe(x, z, talk) {
    const n = this.nearest(x, z);
    if (!n) return null;
    return { verb: 'Talk', text: `${n.c.jp} · ${n.c.name}`, sub: n.c.role, act: () => talk(n) };
  }

  // Builds the conversation. ctx: { clock, career, jobs, open }
  conversation(n, ctx) {
    const c = n.c, st = this.state, day = ctx.clock.day;
    const first = !st.met[c.id];
    let bond = '';
    if (st.last[c.id] !== day) { st.last[c.id] = day; if (ctx.career) { ctx.career.addTrust(1); bond = '+1 trust'; } }
    st.met[c.id] = true;
    this.persist();
    const cyc = (k) => { const arr = c[k]; const s = arr[n.idx[k] % arr.length]; n.idx[k]++; return s; };
    const work = () => (typeof c.work === 'function' ? c.work(ctx) : c.work);
    const menu = () => [
      { label: "How's it going?", run: () => ({ line: cyc('chat'), options: menu() }) },
      { label: 'Any work around here?', run: () => ({ line: work(), options: menu() }) },
      { label: 'Tell me about yourself.', run: () => ({ line: cyc('about'), options: menu() }) },
      { label: 'See you.', run: () => ({ line: pick(c.bye), options: [] }) },
    ];
    const greet = c.greet[ctx.clock.period()] || pick(Object.values(c.greet));
    return { who: { jp: c.jp, name: c.name, role: c.role, bond }, node: { line: first ? c.first : greet, options: menu() } };
  }

  draw(r, cam, time) {
    const cx = cam.pos[0], cz = cam.pos[2];
    for (const n of this.list) {
      if (!n.out || Math.hypot(n.x - cx, n.z - cz) > 70) continue;
      const s = n.s, br = Math.sin(n.phase * 1.7) * 0.008, kid = s < 0.8 ? 1.28 : 1;
      r.draw(this.shadow, poseMatrix(this.m, n.x, 0.005, n.z, 0, s), false);
      poseMatrix(this.root, n.x, 0.9 * s + br, n.z, n.yaw, s);
      const L = (mesh, x, y, z, pitch, roll = 0, yaw = 0, sc = 1) => { poseMatrix(this.local, x, y, z, yaw, sc, pitch, roll); r.draw(mesh, multiply(this.m, this.root, this.local)); };
      const mesh = n.mesh;
      const w = n.wave > 0 ? Math.sin(Math.min(1, (1 - n.wave) * 3) * Math.PI * 0.5) : 0;
      const wag = n.wave > 0 ? Math.sin(time * 14) * 0.35 * Math.min(1, n.wave * 3) : 0;
      L(mesh.hips, 0, -0.06, 0, 0);
      L(mesh.torso, 0, 0.06, 0, 0);
      L(mesh.head, 0, 0.62, 0, Math.sin(n.phase * 0.5) * 0.04, 0, n.head, kid);
      L(mesh.leg, -0.1, 0, 0, 0);
      L(mesh.leg, 0.1, 0, 0, 0);
      L(mesh.arm, -0.29, 0.58, 0, Math.sin(n.phase * 1.7) * 0.03, 0.06);
      L(mesh.arm, 0.29, 0.58, 0, -w * 2.7, -0.06 - w * 0.3 + wag);
      if (this.state.last[n.c.id] !== this.day) {
        poseMatrix(this.m, n.x, (1.95 + Math.sin(time * 3) * 0.05) * s + (kid > 1 ? 0.2 : 0), n.z, Math.atan2(cx - n.x, cz - n.z), 1);
        r.draw(this.mark, this.m, false);
      }
    }
  }

}
