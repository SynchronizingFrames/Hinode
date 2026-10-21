// Game clock and the player's career (money, XP, level, neighbourhood trust). No DOM, no rendering.

export const DAY_START = 8 * 60;   // 08:00
export const DAY_END = 22 * 60;    // 22:00, depot closes

export class Clock {
  constructor(day = 1, min = DAY_START) { this.day = day; this.min = min; this.rate = 1; } // game minutes per real second
  update(dt) { this.min += dt * this.rate; }
  fmt(m = this.min) {
    const t = Math.floor(m), h = Math.floor(t / 60) % 24, mm = t % 60;
    return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }
  period(m = this.min) {
    const h = m / 60;
    return h < 11 ? 'Morning' : h < 14 ? 'Midday' : h < 17 ? 'Afternoon' : h < 19.5 ? 'Evening' : 'Night';
  }
}

export class Career {
  constructor() {
    this.money = 0; this.xp = 0; this.level = 1; this.trust = 10;
    this.stats = { delivered: 0, failed: 0, earned: 0, quick: 0 };
  }
  static need(level) { return 60 + level * 40; }   // XP to go from `level` to `level + 1`
  addXP(n) {
    const ups = [];
    this.xp += Math.max(0, n);
    while (this.xp >= Career.need(this.level)) { this.xp -= Career.need(this.level); this.level++; ups.push(this.level); }
    return ups;
  }
  addMoney(n) { this.money = Math.max(0, this.money + n); if (n > 0) this.stats.earned += n; }
  // Spend only if affordable. Returns true when the money was taken.
  spend(n) { if (n < 0 || this.money < n) return false; this.money -= n; return true; }
  addTrust(n) { this.trust = Math.max(0, Math.min(100, this.trust + n)); }
  trustLabel() {
    const t = this.trust;
    return t < 15 ? 'Stranger' : t < 30 ? 'New face' : t < 50 ? 'Familiar' : t < 75 ? 'Trusted' : 'Part of Aoshima';
  }
}
