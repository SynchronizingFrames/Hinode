// Weather: clear -> overcast -> rain from a per-day forecast (or forced for testing / settings).
// Runs after applyTimeOfDay() and rewrites the lighting env in place: greyer sky, weaker sun, thicker fog,
// plus env.rain (streak density) and env.wet (puddles + reflections). Ground stays wet for a while after rain.
const GREY = [0.52, 0.55, 0.6];
const frac = (v) => v - Math.floor(v);
const app = (v, t, k) => v + (t - v) * k;

export class Weather {
  constructor() {
    this.cloud = 0; this.rain = 0; this.wet = 0; this.want = 0;
    this.forced = null; // null = follow the forecast, otherwise 0..1 rain strength
  }

  // 'rain' | 'storm' | 'clear' | null (back to the forecast)
  force(mode) {
    this.forced = mode == null || mode === 'auto' ? null : mode === 'storm' ? 1 : mode === 'rain' ? 0.75 : 0;
  }

  // Deterministic per day: roughly 60% of days get one shower of 1-4 game hours somewhere between 09:00 and 18:00.
  forecast(day, min) {
    const r = frac(Math.sin(day * 78.233 + 4.1) * 43758.5453);
    if (r < 0.4) return 0;
    const h = min / 60, start = 9 + Math.floor(frac(r * 7.13) * 9), len = 1.2 + frac(r * 3.7) * 2.8;
    return h >= start && h < start + len ? 0.55 + 0.45 * frac(r * 11.1) : 0;
  }

  get label() { return this.rain > 0.7 ? 'Heavy rain' : this.rain > 0.08 ? 'Rain' : this.cloud > 0.5 ? 'Overcast' : 'Clear'; }

  update(dt, clock) {
    const want = this.forced != null ? this.forced : this.forecast(clock.day || 1, clock.min);
    this.want = want;
    this.cloud = app(this.cloud, want > 0 ? 1 : 0, 1 - Math.exp(-dt / 8));
    this.rain = app(this.rain, this.cloud > 0.6 ? want : 0, 1 - Math.exp(-dt / 5));
    if (this.rain > 0.05) this.wet = Math.min(1, this.wet + (dt * this.rain) / 25);
    else this.wet = Math.max(0, this.wet - dt / 90);
  }

  // Jump straight to the current target (tests, loading a save mid-shower).
  settle() {
    const w = this.want;
    this.cloud = w > 0 ? 1 : 0; this.rain = w; this.wet = w > 0 ? 1 : 0;
  }

  apply(env) {
    const k = this.cloud;
    if (k > 0.001) {
      const lum = (env.sky[0] + env.sky[1] + env.sky[2]) / 3;
      for (let i = 0; i < 3; i++) {
        env.sunCol[i] *= 1 - 0.72 * k;
        env.sky[i] = app(env.sky[i], GREY[i] * lum * 1.25, 0.65 * k);
        env.zenith[i] = app(env.zenith[i], GREY[i] * lum * 1.1, 0.75 * k);
        env.horizon[i] = app(env.horizon[i], GREY[i] * lum * 1.45, 0.7 * k);
        env.fog[i] = app(env.fog[i], GREY[i] * lum * 1.2, 0.7 * k);
        env.ground[i] *= 1 - 0.25 * k;
      }
      env.fogK *= 1 + (0.9 - 0.4 * (env.night || 0)) * k; // lighter at night so lamps still read
      env.exposure *= 1 + 0.18 * k;
    }
    env.wet = this.wet; env.rain = this.rain;
    const n = env.night || 0, rc = env.rainCol || (env.rainCol = [0, 0, 0]);
    for (let i = 0; i < 3; i++) {
      rc[i] = (env.fog[i] * 0.55 * (1 - n * 0.5) + (env.lampCol ? env.lampCol[i] : 1) * 0.12 * n) * (0.5 + 0.5 * this.rain);
    }
  }
}
