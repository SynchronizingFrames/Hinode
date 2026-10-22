// Button prompts for controllers. While a controller is the last thing you touched, the hint bar, the interact
// prompt, the dialogue footer and the settings layout show Xbox or PlayStation glyphs; touch the keyboard or mouse
// and they switch back to keys.
const G = {
  xbox: { a: 'A', b: 'B', x: 'X', y: 'Y', lb: 'LB', rb: 'RB', lt: 'LT', rt: 'RT', view: 'View', menu: 'Menu', ls: 'LS', rs: 'RS', l3: 'LS', r3: 'RS', dpad: '✚' },
  ps: { a: '✕', b: '○', x: '□', y: '△', lb: 'L1', rb: 'R1', lt: 'L2', rt: 'R2', view: 'Share', menu: 'Options', ls: 'L', rs: 'R', l3: 'L3', r3: 'R3', dpad: '✚' },
};

export function pb(kind, k, ps5 = false) {
  const fam = kind === 'ps' ? 'ps' : 'xbox';
  const label = fam === 'ps' && ps5 && k === 'view' ? 'Create' : G[fam][k];
  return `<i class="pb pb-${fam} pb-${k}">${label}</i>`;
}

const MAP = [
  ['On foot', [[['ls'], 'Move'], [['rs'], 'Look around'], [['l3', 'rb'], 'Run (click the stick to toggle, or hold)'], [['a'], 'Jump'],
    [['x'], 'Talk, pick up, deliver, get in the car'], [['y'], 'Switch camera view'], [['lb', 'view'], 'Journal'], [['menu'], 'Pause']]],
  ['Driving', [[['rt'], 'Accelerate'], [['lt'], 'Brake / reverse'], [['ls'], 'Steer'], [['a'], 'Handbrake'], [['r3'], 'Horn'],
    [['x'], 'Get out'], [['rs'], 'Look around'], [['y'], 'Cockpit / chase camera']]],
  ['Menus & dialogue', [[['dpad', 'ls'], 'Move the highlight'], [['a'], 'Select / continue'], [['b'], 'Back / leave'], [['lb', 'rb'], 'Switch tabs'], [['dpad'], 'Left / right on a slider to adjust']]],
];

export function padMapHTML(kind, ps5 = false) {
  return MAP.map(([h, rows]) => `<h4>${h}</h4>` + rows.map(([ks, t]) =>
    `<div><span class="gl">${ks.map((k) => pb(kind, k, ps5)).join('')}</span><span>${t}</span></div>`).join('')).join('');
}

export class PadUI {
  constructor({ input, hint, hud, talk }) {
    this.input = input; this.hint = hint; this.hud = hud;
    this.foot = talk && talk.el ? talk.el.querySelector('footer') : null;
    this.key = null; this.base = null; this.talkBase = null;
  }

  // Returns true when the prompts actually changed.
  refresh() {
    const I = this.input, kind = I.promptKind, ps5 = I.padInfo.kind === 'ps5';
    const key = kind ? kind + (ps5 ? '5' : '') : null;
    const B = document.body.classList;
    B.toggle('pad-on', !!kind); B.toggle('pad-ps', kind === 'ps'); B.toggle('pad-xbox', kind === 'xbox');
    if (key === this.key) return false;
    const was = this.key; this.key = key;
    const b = (k) => pb(kind, k, ps5);
    if (this.hint) {
      if (!was) this.base = this.hint.innerHTML;
      this.hint.innerHTML = kind
        ? `${b('ls')} move · ${b('rs')} look · ${b('l3')} run · ${b('a')} jump · ${b('x')} interact · ${b('y')} camera · ${b('view')} journal · ${b('menu')} pause<br><span class="pb-car">In the car: ${b('rt')} gas · ${b('lt')} brake · ${b('a')} handbrake · ${b('r3')} horn</span>`
        : (this.base != null ? this.base : this.hint.innerHTML);
    }
    if (this.foot) {
      if (!was) this.talkBase = this.foot.innerHTML;
      this.foot.innerHTML = kind
        ? `<span class="k">${b('a')} continue</span><span class="k">${b('dpad')} + ${b('a')} reply</span><span class="k">${b('b')} leave</span><span class="k">walk away to end</span>`
        : (this.talkBase != null ? this.talkBase : this.foot.innerHTML);
    }
    if (this.hud) { this.hud.keyHTML = kind ? b('x') : null; if (this.hud.cache) this.hud.cache.prompt = null; }
    return true;
  }
}
