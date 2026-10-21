// Tiny DOM helpers shared by the UI modules.
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const yen = (n) => '¥' + Math.round(n).toLocaleString('en-US');
export function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
export function keys(root) { const k = {}; for (const e of root.querySelectorAll('[data-k]')) k[e.dataset.k] = e; return k; }

// What the player has to do next for an active job, in plain words.
export function stepText(jobs, j) {
  if (j.state === 'accepted') return j.from === 'depot' ? 'Collect at the depot counter' : `Collect from ${jobs.place(j.from).short}`;
  return `Deliver to ${jobs.place(j.to).short}`;
}
export function timeLeft(j, now) { return j.late ? 'Late' : `${Math.max(0, Math.ceil(j.deadline - now))} min`; }
