// Pequenos utilitários de DOM e de cor usados por toda a UI.

/** Cria um elemento: el('div', 'classe outra', { text, html, attrs, on:{click} }, ...filhos). */
export function el(tag, cls = '', opts = {}, ...children) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (opts.text != null) e.textContent = opts.text;
  if (opts.html != null) e.innerHTML = opts.html;
  if (opts.attrs) for (const [k, v] of Object.entries(opts.attrs)) e.setAttribute(k, v);
  if (opts.style) Object.assign(e.style, opts.style);
  if (opts.on) for (const [k, fn] of Object.entries(opts.on)) e.addEventListener(k, fn);
  for (const c of children) if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  return e;
}

/** Escapa texto para usar dentro de innerHTML. */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------------------------------------
// Cores (hex) — inclusive a versão "desbotada" igual à do core/materials.js, para o mapa ficar
// cinza-lilás nas regiões que ainda não ganharam cor.
export function hexToRgb(hex) {
  let h = String(hex).replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const rgbToHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

const FADE_TINT = [0xa9, 0x9f, 0xc6];
/** Mesmo cálculo do toon desbotado: luminância → cinza, puxado para lilás; t=1 devolve a cor original. */
export function fadeHex(hex, t) {
  const [r, g, b] = hexToRgb(hex);
  const l = r * 0.3 + g * 0.59 + b * 0.11;
  const f = (v, k) => (v + (FADE_TINT[k] - v) * 0.4) * 0.8;
  const src = [r, g, b];
  const gr = [0, 1, 2].map((k) => f(l, k) + (src[k] - f(l, k)) * 0.14);
  // um pouco mais claro que no 3D: no papel do mapa fica mais legível
  const lift = (v) => v + (255 - v) * 0.12;
  return rgbToHex(lift(gr[0] + (r - gr[0]) * t), lift(gr[1] + (g - gr[1]) * t), lift(gr[2] + (b - gr[2]) * t));
}
/** Escurece (k<0) ou clareia (k>0) uma cor hex. */
export function shade(hex, k) {
  const [r, g, b] = hexToRgb(hex);
  const m = (v) => (k < 0 ? v * (1 + k) : v + (255 - v) * k);
  return rgbToHex(m(r), m(g), m(b));
}
export function mixHex(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}
export function rgba(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
