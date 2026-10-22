// Sound (M3-final): everything is synthesised live with WebAudio, no audio files to download.
// Engine (gear-aware rpm), tyre squeal, impacts, horn (H), rain, wind, footsteps, birds by day, insects at night,
// the Shinjuku street hum, the scramble crossing's cuckoo chime, and little UI chimes for jobs.
// Browsers only allow sound after a click or key press, so the context starts on the first input.
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const GEARS = [0, 9, 16, 24, 32, 44];
const SC = [206, 0];

export class GameAudio {
  constructor() {
    this.ctx = null; this.vol = 0.8; this.steps = 0; this.chimes = 0; this.birds = 0;
    this.stride = 0; this.nextBird = 3; this.nextChime = 0; this.lastHit = 0; this.clock = 0;
    this.unlock = () => this.start();
    for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, this.unlock, { capture: true, passive: true });
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend().catch(() => {}); else this.ctx.resume().catch(() => {});
    });
  }

  get running() { return !!this.ctx && this.ctx.state === 'running'; }
  setVolume(v) { this.vol = clamp01(+v); }

  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended' && !document.hidden) this.ctx.resume().catch(() => {}); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    let c; try { c = new AC(); } catch { return; }
    this.ctx = c;
    const master = c.createGain(); master.gain.value = 0;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.01; comp.release.value = 0.25;
    master.connect(comp); comp.connect(c.destination);
    this.master = master;
    const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    const bed = (type, f, q) => {
      const s = c.createBufferSource(); s.buffer = buf; s.loop = true;
      const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      const g = c.createGain(); g.gain.value = 0;
      s.connect(fl); fl.connect(g); g.connect(master); s.start(0, Math.random() * 1.8);
      return { f: fl, g };
    };
    this.rain = bed('highpass', 1100, 0.3);
    this.rainLow = bed('lowpass', 380, 0.5);
    this.wind = bed('bandpass', 360, 0.6);
    this.city = bed('lowpass', 260, 0.7);
    this.murmur = bed('bandpass', 900, 1.1);
    this.tyre = bed('bandpass', 1750, 3);
    this.intake = bed('bandpass', 240, 1.4);
    // engine: two detuned saws + a sub-octave square through a resonant lowpass
    const ef = c.createBiquadFilter(); ef.type = 'lowpass'; ef.frequency.value = 500; ef.Q.value = 1.6;
    const eg = c.createGain(); eg.gain.value = 0; ef.connect(eg); eg.connect(master);
    this.eng = { f: ef, g: eg, o: [] };
    for (const [type, mul, gain] of [['sawtooth', 1, 0.5], ['sawtooth', 1.007, 0.35], ['square', 0.5, 0.3], ['sine', 0.25, 0.6]]) {
      const o = c.createOscillator(); o.type = type; o.frequency.value = 30;
      const g = c.createGain(); g.gain.value = gain; o.connect(g); g.connect(ef); o.start();
      this.eng.o.push({ o, mul });
    }
    // horn: the classic two-tone (G4 + B4)
    const hf = c.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 2200;
    const hg = c.createGain(); hg.gain.value = 0; hf.connect(hg); hg.connect(master);
    for (const f of [392, 494]) { const o = c.createOscillator(); o.type = 'square'; o.frequency.value = f; o.connect(hf); o.start(); }
    this.horn = hg;
    // night insects: a high sine chopped by a fast square LFO
    const ins = c.createOscillator(); ins.type = 'sine'; ins.frequency.value = 4400;
    const chop = c.createGain(); chop.gain.value = 0.5;
    const lfo = c.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 13;
    const lg = c.createGain(); lg.gain.value = 0.5; lfo.connect(lg); lg.connect(chop.gain);
    const ig = c.createGain(); ig.gain.value = 0;
    ins.connect(chop); chop.connect(ig); ig.connect(master); ins.start(); lfo.start();
    this.insects = ig; this.insectLfo = lfo;
    if (document.hidden) c.suspend().catch(() => {}); else c.resume().catch(() => {});
  }

  set(param, v, tc = 0.08) { param.setTargetAtTime(v, this.ctx.currentTime, tc); }

  tone(f0, f1, dur, gain, type = 'sine', when = 0) {
    const c = this.ctx, t = c.currentTime + when, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }

  burst(gain, type, f, dur, q = 0.7) {
    const c = this.ctx, t = c.currentTime, s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise; fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    g.gain.setValueAtTime(Math.max(0.0002, gain), t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(this.master); s.start(t, Math.random() * 1.7); s.stop(t + dur + 0.05);
  }

  ui(kind) {   // menu feedback: soft ticks and chimes, quiet enough to stay out of the way
    if (!this.ctx || this.ctx.state !== 'running' || !this.master || !this.noise) return;
    const now = this.ctx.currentTime;
    if (kind === 'hover' && now - (this.uiT || 0) < 0.05) return;
    this.uiT = now;
    if (kind === 'hover') { this.tone(1760, 1640, 0.05, 0.02); this.burst(0.01, 'bandpass', 4200, 0.03, 3); }
    else if (kind === 'press') { this.tone(540, 300, 0.09, 0.07, 'triangle'); this.burst(0.035, 'bandpass', 1800, 0.05, 2); }
    else if (kind === 'tab') { this.tone(1175, 1175, 0.07, 0.035); this.tone(1568, 1568, 0.1, 0.03, 'sine', 0.05); }
    else if (kind === 'select') { this.tone(880, 880, 0.08, 0.04); this.tone(1319, 1319, 0.16, 0.035, 'sine', 0.06); }
  }

  event(type) {   // job events from the game
    if (!this.running) return;
    if (type === 'delivered') { this.tone(659, 659, 0.32, 0.12); this.tone(1047, 1047, 0.5, 0.1, 'sine', 0.14); this.chimes++; }
    else if (type === 'accepted') this.tone(740, 742, 0.18, 0.07);
    else if (type === 'collected') { this.tone(880, 880, 0.14, 0.07); this.tone(988, 988, 0.18, 0.06, 'sine', 0.09); }
    else if (type === 'failed' || type === 'late') this.tone(330, 300, 0.4, 0.07, 'triangle');
  }

  update(dt, s) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    this.clock += dt;
    const { car, player, input, weather, clock, crowd } = s;
    const play = s.mode === 'play' && !s.paused;
    this.set(this.master.gain, this.vol * (play ? 1 : s.mode === 'title' ? 0.6 : 0.4), 0.15);
    const drive = !!(car && car.driving);
    const lx = drive ? car.x : player.pos[0], lz = drive ? car.z : player.pos[2];
    const tokyo = smooth(84, 124, lx), town = 1 - tokyo;
    const rain = weather ? weather.rain : 0;
    const min = clock ? clock.min % 1440 : 720, night = min < 330 || min > 1150 ? 1 : 0;
    const cabin = drive ? 0.55 : 1;   // rain and street sound are muffled inside the car

    // weather + street beds
    this.set(this.rain.g.gain, 0.3 * rain * cabin);
    this.set(this.rainLow.g.gain, 0.16 * rain);
    const sp = drive ? Math.abs(car.speed || 0) : 0;
    this.set(this.wind.g.gain, 0.012 + 0.03 * rain + 0.09 * Math.pow(sp / 40, 2));
    this.set(this.wind.f.frequency, 300 + sp * 14 + Math.sin(this.clock * 0.3) * 80, 0.3);
    this.set(this.city.g.gain, 0.17 * tokyo * cabin);
    const dS = Math.hypot(lx - SC[0], lz - SC[1]);
    this.set(this.murmur.g.gain, (0.012 + 0.05 * clamp01(1 - dS / 70)) * tokyo * cabin);
    this.set(this.insects.gain, play ? 0.018 * night * town * (1 - rain) : 0, 0.5);
    this.insectLfo.frequency.value = 11 + Math.sin(this.clock * 0.7) * 3;

    // engine, tyres, impacts, horn
    let rpm = 0, thr = 0;
    if (drive) {
      let g = 1; while (g < GEARS.length - 1 && sp > GEARS[g]) g++;
      rpm = sp < 0.4 ? 0.13 : clamp01(0.22 + 0.74 * (sp - GEARS[g - 1]) / (GEARS[g] - GEARS[g - 1]));
      const dn = input && input.down;
      thr = dn && (dn.has('KeyW') || dn.has('ArrowUp')) ? 1 : 0;
    }
    const f0 = 28 + rpm * 190;
    for (const o of this.eng.o) this.set(o.o.frequency, f0 * o.mul, 0.05);
    this.set(this.eng.g.gain, drive && play ? 0.06 + 0.07 * thr + 0.05 * rpm : 0, 0.06);
    this.set(this.eng.f.frequency, 320 + rpm * 1900 + thr * 700, 0.05);
    this.set(this.intake.g.gain, drive && play ? 0.015 + 0.05 * thr * rpm : 0, 0.06);
    this.set(this.intake.f.frequency, 160 + rpm * 650, 0.05);
    const slip = drive ? clamp01(((car.slip || 0) - 0.3) * 2) * clamp01(sp / 6) : 0;
    this.set(this.tyre.g.gain, play ? 0.11 * slip * (1 - 0.6 * (weather ? weather.wet || 0 : 0)) : 0, 0.05);
    if (drive && (car.impact || 0) > 1.6 && this.clock - this.lastHit > 0.3) {
      this.lastHit = this.clock;
      const k = Math.min(1, car.impact / 10);
      this.tone(85, 38, 0.35, 0.35 * k); this.burst(0.25 * k, 'lowpass', 900, 0.18);
    }
    const honk = drive && play && input && input.down && input.down.has('KeyH');
    this.set(this.horn.gain, honk ? 0.09 : 0, 0.02);

    // footsteps
    const ps = player.vel ? Math.hypot(player.vel[0], player.vel[2]) : 0;
    if (!drive && play && player.grounded && ps > 0.6) {
      this.stride += ps * dt;
      const len = ps > 4 ? 0.95 : 0.72;
      if (this.stride > len) {
        this.stride = 0; this.steps++;
        const wet = weather ? weather.wet || 0 : 0;
        this.burst(0.05 + 0.02 * tokyo, 'lowpass', 650 + 500 * tokyo + Math.random() * 200, 0.07);
        if (wet > 0.3) this.burst(0.025 * wet, 'highpass', 2600, 0.09);
      }
    } else this.stride = 0.5;

    // birds by day in the home town
    this.nextBird -= dt;
    if (this.nextBird <= 0) {
      this.nextBird = 2 + Math.random() * 6;
      if (play && !night && town > 0.4 && rain < 0.3) {
        const n = 2 + Math.floor(Math.random() * 4), f = 2800 + Math.random() * 2200, gain = 0.035 * town;
        for (let i = 0; i < n; i++) this.tone(f * (1 + Math.random() * 0.15), f * (0.75 + Math.random() * 0.5), 0.06 + Math.random() * 0.07, gain, 'sine', i * (0.1 + Math.random() * 0.06));
        this.birds++;
      }
    }

    // the scramble's "kakko" crossing chime while the green man is lit
    if (crowd && crowd.walk && play) {
      this.nextChime -= dt;
      if (this.nextChime <= 0) {
        this.nextChime = 1.15;
        const g = 0.08 * clamp01(1 - dS / 85) * cabin;
        if (g > 0.003) { this.tone(1220, 1210, 0.1, g); this.tone(980, 970, 0.15, g, 'sine', 0.17); this.chimes++; }
      }
    } else this.nextChime = 0;
  }
}
