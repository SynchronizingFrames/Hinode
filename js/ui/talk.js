// Conversation box: who you're talking to, their line typed out, numbered replies.
// Keys: 1-4 pick a reply, E / Enter (or a tap on the card) skip or continue, Esc or the cross leaves.
// It is an overlay: the player keeps walking and looking around while it is open (Space stays jump).
const KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4'];

export class Talk {
  constructor(root, { onClose } = {}) {
    this.onClose = onClose;
    const e = (this.el = document.createElement('div'));
    e.className = 'talk';
    e.hidden = true;
    e.innerHTML = '<div class="talk-card"><header><span class="jp"></span><span class="nm"></span><span class="role"></span><span class="bond"></span><button type="button" class="talk-x" aria-label="Leave conversation">✕</button></header>'
      + '<p class="line"></p><ol class="opts"></ol>'
      + '<footer><span class="k"><kbd>E</kbd> continue</span><span class="k"><kbd>1</kbd>–<kbd>4</kbd> reply</span><span class="k"><kbd>Esc</kbd> leave</span><span class="k">walk away to end</span>'
      + '<span class="tch">Tap the card to continue · tap a reply · ✕ to leave</span></footer></div>';
    root.appendChild(e);
    this.q = (s) => e.querySelector(s);
    this.$line = this.q('.line');
    this.$opts = this.q('.opts');
    this.text = ''; this.shown = 0; this.opts = []; this.open = false; this.who = null; this.adv = false;
    this.q('.talk-card').addEventListener('click', (ev) => {
      if (ev.target.closest('.opts button')) return;
      if (ev.target.closest('.talk-x')) { this.close(); return; }
      this.adv = true;
    });
  }

  show() { this.el.hidden = false; this.open = true; }
  hide() { this.el.hidden = true; this.open = false; }

  start(who, node) {
    this.who = who;
    this.q('.jp').textContent = who.jp;
    this.q('.nm').textContent = who.name;
    this.q('.role').textContent = who.role;
    this.q('.bond').textContent = who.bond || '';
    this.show();
    this.say(node);
  }

  say(node) {
    this.node = node;
    this.text = node.line || '';
    this.shown = 0;
    this.opts = node.options || [];
    this.$line.textContent = '';
    this.$opts.innerHTML = '';
    this.$opts.hidden = true;
  }

  showOpts() {
    this.$opts.innerHTML = '';
    this.opts.forEach((o, i) => {
      const li = document.createElement('li'), btn = document.createElement('button');
      btn.type = 'button';
      btn.innerHTML = `<kbd>${i + 1}</kbd>`;
      btn.append(o.label);
      btn.onclick = () => this.pick(i);
      li.appendChild(btn);
      this.$opts.appendChild(li);
    });
    this.$opts.hidden = false;
  }

  pick(i) {
    const o = this.opts[i];
    if (!o) return;
    const next = o.run();
    if (next) this.say(next); else this.close();
  }

  close() { if (!this.open) return; this.hide(); if (this.onClose) this.onClose(); }

  get typing() { return this.shown < this.text.length; }

  update(dt, input) {
    if (!this.open) return;
    if (input.tap('Escape') || input.tap('PadB')) return this.close();
    const adv = this.adv || input.tap('KeyE') || input.tap('Enter');
    this.adv = false;
    if (this.typing) {
      this.shown = adv ? this.text.length : Math.min(this.text.length, this.shown + dt * 52);
      this.$line.textContent = this.text.slice(0, Math.floor(this.shown));
      if (!this.typing) { this.$line.textContent = this.text; if (this.opts.length) this.showOpts(); }
      return;
    }
    if (!this.opts.length) { if (adv) this.close(); return; }
    for (let i = 0; i < KEYS.length; i++) if (input.tap(KEYS[i])) return this.pick(i);
  }
}
