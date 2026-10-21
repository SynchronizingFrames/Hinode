// Title-screen fly-through: a loop of slow dolly / crane / orbit shots across Aoshima, each with its own
// time of day and weather, joined by a short dip to black. Drives the camera directly (no player input).
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);
const L3 = (o, a, b, t) => { o[0] = lerp(a[0], b[0], t); o[1] = lerp(a[1], b[1], t); o[2] = lerp(a[2], b[2], t); };

export class Cinematic {
  constructor(world) {
    const [sx, , sz] = world.spawn;
    this.shots = [
      { cap: 'Asahi-dōri · 05:50 · first light', min: 5 * 60 + 50, wx: 'clear', len: 10,
        p: [[-72, 1.1, 2.3], [-38, 1.45, 2.0]], t: [[0, 2.2, 0.4], [14, 2.4, -0.6]] },
      { cap: 'Minato-dōri · 09:40', min: 9 * 60 + 40, wx: 'clear', len: 9,
        p: [[2.5, 1.7, -72], [2.3, 2.3, -40]], t: [[-5, 2.4, -12], [-7, 2.9, 2]] },
      { cap: 'Over Aoshima · 14:20', min: 14 * 60 + 20, wx: 'clear', len: 11, orbit: { c: [0, 0, 0], r: 64, y: [38, 30], a: [0.55, 1.15] } },
      { cap: 'The depot · 17:45 · golden hour', min: 17 * 60 + 45, wx: 'clear', len: 9,
        p: [[sx + 9, 2.6, sz + 11], [sx + 4.5, 1.9, sz + 8]], t: [[sx, 1.6, sz], [sx - 0.5, 1.5, sz]] },
      { cap: 'Asahi-dōri · 21:20 · rain', min: 21 * 60 + 20, wx: 'storm', len: 11,
        p: [[-14, 1.35, -1.3], [10, 1.5, -1.1]], t: [[30, 1.0, 0.2], [52, 1.1, 0.4]] },
      { cap: 'Kita lane · 23:10', min: 23 * 60 + 10, wx: 'clear', len: 9,
        p: [[-30, 7.5, -36.5], [-26, 2.2, -37.6]], t: [[2, 1.2, -40], [8, 1.4, -40.4]] },
    ];
    this.i = 0; this.t = 0; this.min = this.shots[0].min; this.active = false;
  }

  get shot() { return this.shots[this.i]; }

  start(weather) { this.active = true; this.i = 0; this.t = 0; this.enter(weather); }
  stop(weather, wantWeather) {
    if (!this.active) return;
    this.active = false;
    weather.force(wantWeather || null); weather.settle();
  }
  enter(weather) {
    const s = this.shot; this.min = s.min;
    if (weather) { weather.force(s.wx); weather.update(0, { min: s.min, day: 1 }); weather.settle(); }
  }

  update(dt, cam, weather, menu, calm = false) {
    if (!this.active) return;
    this.t += dt * (calm ? 0.5 : 1);
    if (this.t >= this.shot.len) { this.t = 0; this.i = (this.i + 1) % this.shots.length; this.enter(weather); }
    const s = this.shot, u = ease(Math.min(1, this.t / s.len));
    this.min = s.min + u * 6;   // light drifts a little during each shot
    if (s.orbit) {
      const o = s.orbit, a = lerp(o.a[0], o.a[1], u), y = lerp(o.y[0], o.y[1], u);
      cam.pos[0] = o.c[0] + Math.sin(a) * o.r; cam.pos[1] = y; cam.pos[2] = o.c[2] + Math.cos(a) * o.r;
      cam.target[0] = o.c[0]; cam.target[1] = o.c[1] + 2; cam.target[2] = o.c[2];
    } else { L3(cam.pos, s.p[0], s.p[1], u); L3(cam.target, s.t[0], s.t[1], u); }
    cam.focus = null;
    if (menu) {
      const edge = 0.8, f = Math.max(0, 1 - this.t / edge, 1 - (s.len - this.t) / edge);
      menu.fade(Math.min(1, f));
      menu.caption(s.cap);
    }
  }
}
