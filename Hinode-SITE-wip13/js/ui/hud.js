// In-game HUD: day/clock/money card, active deliveries, E prompt, waypoint and toasts.
import { PKG } from '../data/jobs.js';
import { Career } from '../game/career.js';
import { CAPACITY } from '../game/jobs.js';
import { esc, yen, el, keys, stepText, timeLeft } from './dom.js';

const PERIOD_JP = { Morning: '朝', Midday: '昼', Afternoon: '午後', Evening: '夕方', Night: '夜' };
const TRUST_JP = { Stranger: 'よそ者', 'New face': '新顔', Familiar: '顔なじみ', Trusted: '信頼', 'Part of Aoshima': '町の一員' };

export class Hud {
  constructor(root, { jobs, career, clock }) {
    this.root = root; this.jobs = jobs; this.career = career; this.clock = clock;
    this.card = el('div', 'h-card', `
      <div class="h-led"><span class="d" data-k="day"></span><b data-k="clock"></b><i><span data-k="period"></span><small data-k="periodEn"></small></i></div>
      <div class="h-row"><div class="h-money" data-k="money"></div><em class="hanko" data-k="lv" title="Level"></em></div>
      <div class="h-xp" title="Experience"><i data-k="xp"></i></div>
      <div class="h-trust" data-k="trust"></div>`);
    const place = document.getElementById('place');
    if (place) this.card.prepend(place);
    this.list = el('div', 'h-jobs');
    this.prompt = el('div', 'h-prompt'); this.prompt.hidden = true;
    this.way = el('div', 'h-way', '<div><i class="dia"></i><i class="arr"></i><span></span></div>'); this.way.hidden = true;
    this.wayArr = this.way.querySelector('.arr'); this.wayTxt = this.way.querySelector('span');
    this.toasts = el('div', 'h-toasts');
    root.append(this.card, this.list, this.prompt, this.way, this.toasts);
    this.k = keys(this.card);
    this.cache = {}; this.warned = 0;
  }

  put(k, v) { if (this.cache[k] !== v) { this.cache[k] = v; this.k[k].textContent = v; } }

  toast(title, sub = '', kind = '', ms = 4200) {
    const t = el('div', 'toast ' + kind, `<b>${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}`);
    this.toasts.append(t);
    while (this.toasts.children.length > 4) this.toasts.firstChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 450); }, ms);
    return t;
  }

  // target: { x, z, label } or null; vp: renderer view-projection matrix.
  update({ prompt, target, player, vp }) {
    const { clock, career } = this;
    const per = clock.period();
    this.put('day', `Day ${clock.day}`); this.put('clock', clock.fmt()); this.put('period', PERIOD_JP[per] || per); this.put('periodEn', per);
    if (this.cache.m !== undefined && career.money > this.cache.m) { this.k.money.classList.remove('bump'); void this.k.money.offsetWidth; this.k.money.classList.add('bump'); }
    this.cache.m = career.money;
    this.put('money', yen(career.money)); this.put('lv', String(career.level));
    const tl = career.trustLabel(), tsig = tl + career.trust;
    if (this.cache.trust !== tsig) { this.cache.trust = tsig; this.k.trust.innerHTML = `<b>${TRUST_JP[tl] || ''}</b>${esc(tl)} · trust ${career.trust}`; }
    const pct = Math.min(100, (career.xp / Career.need(career.level)) * 100).toFixed(1) + '%';
    if (this.cache.xp !== pct) { this.cache.xp = pct; this.k.xp.style.width = pct; }
    if (clock.min >= 21 * 60 && this.warned !== clock.day) { this.warned = clock.day; this.toast('The depot closes at 22:00', 'Anything still in your basket by then is lost.', 'warn', 6000); }
    this.renderJobs();
    this.renderPrompt(prompt);
    this.renderWay(target, player, vp);
  }

  renderJobs() {
    const { jobs, clock } = this, act = jobs.active(), tr = jobs.trackedId;
    const rows = act.map((j) => ({ j, K: PKG[j.kind], step: stepText(jobs, j), left: timeLeft(j, clock.min), addr: jobs.place(j.state === 'accepted' ? j.from : j.to).addr }));
    const sig = act.length ? rows.map((r) => `${r.j.id}${r.j.state}${r.left}${r.j.id === tr}`).join('|') : jobs.board().length ? 'idle' : 'none';
    if (sig === this.cache.jobs) return;
    this.cache.jobs = sig;
    if (!act.length) {
      this.list.innerHTML = jobs.board().length ? '<div class="h-job idle"><em class="stamp">配達</em><div><b>No deliveries yet</b><span>Check the board at the depot</span></div></div>' : '';
      return;
    }
    this.list.innerHTML = `<h4>Deliveries <span>Basket ${jobs.slotsUsed()}/${CAPACITY}</span></h4>` + rows.map((r) =>
      `<div class="h-job${r.j.id === tr ? ' on' : ''}${r.j.late ? ' late' : ''}"><em class="stamp" style="--c:${r.K.color}">${r.K.jp}</em>` +
      `<div><b>${esc(r.j.title)}</b><span>${esc(r.step)}</span><small>${esc(r.addr)}</small></div><time>${r.left}</time></div>`).join('');
  }

  renderPrompt(p) {
    const sig = p ? `${p.passive ? 'p' : 'a'}${p.verb}${p.text}${p.sub}` : '';
    if (sig === this.cache.prompt) return;
    this.cache.prompt = sig;
    if (!p) { this.prompt.hidden = true; return; }
    this.prompt.hidden = false;
    this.prompt.className = 'h-prompt' + (p.passive ? ' passive' : '') + (p.verb === 'Deliver' ? ' deliver' : '');
    this.prompt.innerHTML = `${p.passive ? '' : '<kbd>E</kbd>'}<div><b>${esc(p.text)}</b>${p.sub ? `<span>${esc(p.sub)}</span>` : ''}</div>`;
  }

  renderWay(t, pl, m) {
    const d = t ? Math.hypot(t.x - pl[0], t.z - pl[2]) : 0;
    if (!t || d < 2.2 || !m) { this.way.hidden = true; return; }
    this.way.hidden = false;
    const x = t.x, y = 2.3, z = t.z;
    const cx = m[0] * x + m[4] * y + m[8] * z + m[12], cy = m[1] * x + m[5] * y + m[9] * z + m[13], cw = m[3] * x + m[7] * y + m[11] * z + m[15];
    let nx, ny, edge = false;
    if (cw > 0.05) { nx = cx / cw; ny = cy / cw; } else { nx = Math.max(-1, Math.min(1, cx * 0.25)); ny = -1; edge = true; } // behind the camera: bottom edge, on the right side
    const LX = 0.9, LY = 0.8;
    if (edge || Math.abs(nx) > LX || Math.abs(ny) > LY) { const s = Math.max(Math.abs(nx) / LX, Math.abs(ny) / LY); nx /= s; ny /= s; edge = true; }
    const W = innerWidth, H = innerHeight, sx = (nx * 0.5 + 0.5) * W, sy = (0.5 - ny * 0.5) * H;
    this.way.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)`;
    this.way.classList.toggle('edge', edge);
    if (edge) this.wayArr.style.transform = `rotate(${(Math.atan2(sy - H / 2, sx - W / 2) * 180 / Math.PI + 90).toFixed(1)}deg)`;
    const txt = `${t.label} · ${Math.round(d)} m`;
    if (this.cache.way !== txt) { this.cache.way = txt; this.wayTxt.textContent = txt; }
  }
}
