// Camera rig: third-person orbit (mouse/stick look, wheel zoom, smoothed follow, collision pull-in)
// or first-person (eye height with head bob on foot, cockpit view when driving). Toggle with Settings or V.
import { clamp, damp } from '../engine/math.js';

const EYE = 1.62;

export class CameraRig {
  constructor(yaw = 0) {
    this.yaw = yaw; this.pitch = 0.32;
    this.dist = 5.2; this.distWant = 5.2; this.distNow = 5.2;
    this.focus = null;
    this.pos = [0, 0, 0]; this.target = [0, 0, 0];
    this.fov = 60 * Math.PI / 180;
    this.sens = 1;        // settings multiplier
    this.invertY = false;
    this.reduceMotion = false;
    this.fpv = false;     // first-person view
    this.look = 0;        // cockpit free-look offset (radians), springs back to centre
    this.bob = 0; this.eyeY = null;
  }

  // subject: the player (on foot) or car.camTarget (driving). car: the Car when driving, else null.
  update(dt, input, subject, col, car = null) {
    const k = 0.0024 * this.sens;
    // Mouse: pixels x sensitivity. Right stick: radians per second (curved and scaled in input.js).
    const mx = input.mdx * k + input.pad.mx * 2.8 * dt, my = input.mdy * k * (this.invertY ? -1 : 1) + input.pad.my * 1.8 * dt;
    if (this.fpv) return this.firstPerson(dt, input, subject, car, mx, my);
    this.yaw -= mx;
    this.pitch += my;
    this.pitch = clamp(this.pitch, -0.25, 1.15);
    if (input.wheel) this.distWant = clamp(this.distWant + input.wheel * 0.6, 2.4, 9.5);
    this.dist = damp(this.dist, this.distWant, 10, dt);

    const p = subject.pos;
    const fy = p[1] + 1.45;
    if (!this.focus) this.focus = [p[0], fy, p[2]];
    // Follow tightly horizontally (no lag on turns), softer vertically (jumps don't yank the view).
    this.focus[0] = damp(this.focus[0], p[0], 22, dt);
    this.focus[2] = damp(this.focus[2], p[2], 22, dt);
    this.focus[1] = damp(this.focus[1], fy, this.reduceMotion ? 5 : 9, dt);

    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const ox = Math.sin(this.yaw) * cp, oy = sp, oz = Math.cos(this.yaw) * cp;
    const f = this.focus;
    const want = this.dist;
    const t = col.segment(f[0], f[1], f[2], f[0] + ox * want, f[1] + oy * want, f[2] + oz * want, 0.22);
    // Never clamp past the hit point: a minimum distance here is what pushes cameras into walls.
    const allowed = Math.max(0.12, want * t - 0.1);
    // Pull in instantly when something blocks the view, ease back out afterwards.
    this.distNow = allowed < this.distNow ? allowed : damp(this.distNow, allowed, 3.5, dt);

    this.pos[0] = f[0] + ox * this.distNow; this.pos[1] = f[1] + oy * this.distNow; this.pos[2] = f[2] + oz * this.distNow;
    this.target[0] = f[0]; this.target[1] = f[1] - 0.1; this.target[2] = f[2];
  }

  firstPerson(dt, input, subject, car, mx, my) {
    this.distNow = 0; this.focus = null;   // distNow 0 hides the player's own body
    if (car) {
      // Cockpit: right-hand drive (Japan), eye just under the roof, looking down the bonnet.
      this.look = clamp(this.look - mx, -1.6, 1.6);
      if (!mx) this.look = damp(this.look, 0, 2.2, dt);
      this.pitch = clamp(this.pitch + my, -0.5, 0.6);
      if (!my) this.pitch = damp(this.pitch, 0.06, 1.5, dt);
      const fy = car.yaw, sy = Math.sin(fy), cy = Math.cos(fy);
      const rx = cy, rz = -sy;                     // right-hand side of the car
      const ex = car.x + sy * -0.05 + rx * 0.36, ez = car.z + cy * -0.05 + rz * 0.36;
      const ey = 1.18 + (car.pitch || 0) * -0.6;
      const dy = fy + this.look, cp = Math.cos(this.pitch);
      this.pos[0] = ex; this.pos[1] = ey; this.pos[2] = ez;
      this.target[0] = ex + Math.sin(dy) * cp * 10; this.target[1] = ey - Math.sin(this.pitch) * 10; this.target[2] = ez + Math.cos(dy) * cp * 10;
      this.yaw = fy + Math.PI;                     // so leaving the car hands back a sensible third-person yaw
      return;
    }
    this.look = 0;
    this.yaw -= mx;
    this.pitch = clamp(this.pitch + my, -1.35, 1.35);
    const p = subject.pos, sp = subject.speed || 0;
    if (!this.reduceMotion && subject.grounded !== false && sp > 0.4) this.bob += dt * (5.2 + sp * 1.25);
    const amp = this.reduceMotion ? 0 : clamp(sp / 7, 0, 1) * 0.055;
    const want = p[1] + EYE + Math.abs(Math.sin(this.bob)) * amp - amp * 0.5;
    this.eyeY = this.eyeY == null ? want : damp(this.eyeY, want, 18, dt);
    const sway = Math.sin(this.bob * 0.5) * amp * 0.4;
    const cyw = Math.cos(this.yaw), syw = Math.sin(this.yaw);
    this.pos[0] = p[0] - syw * 0.08 + cyw * sway; this.pos[1] = this.eyeY; this.pos[2] = p[2] - cyw * 0.08 - syw * sway;
    const cp = Math.cos(this.pitch);
    this.target[0] = this.pos[0] - syw * cp * 10; this.target[1] = this.pos[1] - Math.sin(this.pitch) * 10; this.target[2] = this.pos[2] - cyw * cp * 10;
  }
}
