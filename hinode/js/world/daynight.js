// Time of day: sun/moon, sky colours, fog, exposure and night lights, all driven by the game clock.
// Keys: [hour, sunCol, sky(ambient), ground, zenith, horizon, fog, fogK, night, exposure]
const NIGHT = [[0.3, 0.38, 0.58], [0.06, 0.08, 0.14], [0.035, 0.035, 0.045], [0.012, 0.02, 0.06], [0.08, 0.09, 0.15], [0.07, 0.08, 0.13], 0.0075, 1, 1.9];
const KEYS = [
  [0, ...NIGHT],
  [5.0, ...NIGHT],
  [6.0, [1.5, 0.85, 0.55], [0.26, 0.27, 0.38], [0.14, 0.11, 0.1], [0.14, 0.2, 0.42], [0.95, 0.6, 0.48], [0.62, 0.52, 0.5], 0.0068, 0.3, 1.25],
  [7.2, [2.3, 1.95, 1.55], [0.4, 0.48, 0.62], [0.25, 0.23, 0.19], [0.2, 0.4, 0.76], [0.86, 0.8, 0.76], [0.76, 0.76, 0.78], 0.0055, 0, 1.02],
  [12, [2.6, 2.45, 2.2], [0.44, 0.54, 0.7], [0.27, 0.25, 0.21], [0.18, 0.4, 0.82], [0.75, 0.82, 0.9], [0.72, 0.78, 0.86], 0.0045, 0, 0.92],
  [15.5, [2.55, 2.15, 1.7], [0.4, 0.48, 0.62], [0.26, 0.23, 0.18], [0.2, 0.39, 0.76], [0.86, 0.8, 0.7], [0.77, 0.74, 0.69], 0.005, 0, 0.97],
  [17.4, [2.5, 1.85, 1.25], [0.34, 0.42, 0.56], [0.25, 0.21, 0.16], [0.2, 0.36, 0.68], [0.96, 0.74, 0.54], [0.8, 0.69, 0.58], 0.0058, 0, 1.0],
  [18.4, [2.1, 0.95, 0.42], [0.3, 0.28, 0.38], [0.2, 0.14, 0.11], [0.15, 0.2, 0.44], [1.0, 0.5, 0.28], [0.72, 0.5, 0.4], 0.0065, 0.25, 1.15],
  [19.0, [0.42, 0.36, 0.5], [0.15, 0.17, 0.29], [0.09, 0.08, 0.08], [0.05, 0.08, 0.22], [0.45, 0.3, 0.36], [0.3, 0.25, 0.3], 0.007, 0.7, 1.5],
  [20.2, ...NIGHT],
  [24, ...NIGHT],
];
const FIELDS = ['sunCol', 'sky', 'ground', 'zenith', 'horizon', 'fog'];
const sm = (t) => t * t * (3 - 2 * t);
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

export function applyTimeOfDay(env, minutes) {
  const h = (((minutes / 60) % 24) + 24) % 24;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1][0] <= h) i++;
  const a = KEYS[i], b = KEYS[i + 1], t = sm(clamp01((h - a[0]) / (b[0] - a[0])));
  const lerp = (x, y) => x + (y - x) * t;
  for (let f = 0; f < 6; f++) {
    const out = env[FIELDS[f]] || (env[FIELDS[f]] = [0, 0, 0]);
    for (let k = 0; k < 3; k++) out[k] = lerp(a[f + 1][k], b[f + 1][k]);
  }
  env.fogK = lerp(a[7], b[7]); env.night = lerp(a[8], b[8]); env.exposure = lerp(a[9], b[9]);

  // Sun arcs east -> west between ~05:24 and ~19:12; the moon takes over below the horizon.
  // Light fades to zero at the hand-over so the shadow direction never visibly pops.
  const th = (Math.PI * (h - 5.4)) / 13.8, sy = Math.sin(th) * 0.88;
  const sunW = sm(clamp01((sy + 0.02) / 0.12));
  let dir;
  if (sunW >= 0.5) dir = norm([Math.cos(th), Math.max(sy, 0.03), 0.38]);
  else { const ph = (Math.PI * (h - 18.5)) / 12; dir = norm([-Math.cos(ph) * 0.6, 0.55 + 0.25 * Math.sin(ph), -0.45]); }
  const f = Math.abs(sunW * 2 - 1);
  for (let k = 0; k < 3; k++) { env.sunDir[k] = dir[k]; env.sunCol[k] *= f; }
  env.lampCol = env.lampCol || [1.0, 0.72, 0.42];
  env.hour = h;
  return env;
}

// Picks the 16 lamps closest to `pos` and packs them as [x, y, z, intensity] (+ rgb into outC) for the shader.
// Lamps are [x, y, z, w] (default warm colour) or [x, y, z, w, r, g, b]. Far lamps fade so lights never pop.
const NL = 16;
export function nearestLamps(lamps, pos, out, outC, defCol) {
  out = out || new Float32Array(NL * 4);
  out.fill(0);
  if (outC) outC.fill(0);
  if (!lamps || !lamps.length) return out;
  const dc = defCol || [1.0, 0.72, 0.42];
  const bd = new Array(NL).fill(Infinity), bi = new Array(NL).fill(-1);
  for (let i = 0; i < lamps.length; i++) {
    const L = lamps[i], dx = L[0] - pos[0], dz = L[2] - pos[2], d = dx * dx + dz * dz;
    if (d >= bd[NL - 1]) continue;
    let j = NL - 1;
    while (j > 0 && bd[j - 1] > d) { bd[j] = bd[j - 1]; bi[j] = bi[j - 1]; j--; }
    bd[j] = d; bi[j] = i;
  }
  for (let k = 0; k < NL; k++) {
    if (bi[k] < 0) continue;
    const L = lamps[bi[k]], o = k * 4;
    out[o] = L[0]; out[o + 1] = L[1]; out[o + 2] = L[2];
    out[o + 3] = L[3] * clamp01(1.6 - Math.sqrt(bd[k]) / 60);
    if (outC) { const c = L.length >= 7 ? 4 : -1; for (let q = 0; q < 3; q++) outC[k * 3 + q] = c > 0 ? L[c + q] : dc[q]; }
  }
  return out;
}
