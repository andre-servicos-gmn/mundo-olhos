// Marcos do mapa (LANDMARKS): casas, cafeteria, loja, fonte, torre, árvores gigantes, Ninho-Coreto, doces
// gigantes, placas, bancos, postes... Modelos procedurais fofos (formas redondas), quase todos com olhinhos.
// Cada construtor recebe (l, c) — l = dado do worldmap, c = contexto (ver createLandmarkContext em world.js) —
// e devolve um Group na origem local (frente = +Z). Partes animadas ficam em grupos com userData.dynamic = true
// (o resto é "assado" em poucas malhas pelo kit). Medidas seguem docs/mapa.md, seção 8.
import * as THREE from 'three';
import { G, rbox, add, beam, signTexture, skipOverridePasses } from './kit.js';
import { mulberry32 } from '../core/util.js';
import { LANDMARKS, PATHS } from '../data/worldmap.js';
import { patchMaterial, setRegionAttrs } from './fade.js';
import { toon } from '../core/materials.js';

const TAU = Math.PI * 2;
const D2R = Math.PI / 180;
const WOOD = '#d9a877', WOOD_D = '#b07a52', CREAM = '#fff6ea', WHITE = '#ffffff', INK = '#3a2740';
const dyn = (name) => { const g = new THREE.Group(); g.name = name; g.userData.dynamic = true; return g; };

// ------------------------------------------------------------------------------------------
// Pecinhas reutilizadas.
/** Janela com moldura, vidro que acende à noite e cruzinha. Frente da janela = +Z do pai. */
function janela(g, c, x, y, z, w = 0.9, h = 1.0, ry = 0, round = false) {
  const p = new THREE.Group();
  p.position.set(x, y, z); p.rotation.y = ry;
  if (round) {
    add(p, G.disc, c.M(WHITE), 0, 0, 0.02, w * 0.62, 0.12, w * 0.62, Math.PI / 2);
    add(p, G.disc, c.win(), 0, 0, 0.08, w * 0.5, 0.05, w * 0.5, Math.PI / 2);
    add(p, G.box, c.M(WHITE), 0, 0, 0.12, w, 0.07, 0.04);
    add(p, G.box, c.M(WHITE), 0, 0, 0.12, 0.07, w, 0.04);
  } else {
    add(p, rbox(w + 0.22, h + 0.22, 0.14, 0.08), c.M(WHITE), 0, 0, 0.02);
    add(p, G.box, c.win(), 0, 0, 0.08, w, h, 0.04);
    add(p, G.box, c.M(WHITE), 0, 0, 0.11, w, 0.07, 0.03);
    add(p, G.box, c.M(WHITE), 0, 0, 0.11, 0.07, h, 0.03);
    add(p, rbox(w + 0.4, 0.14, 0.3, 0.05), c.M(WHITE), 0, -h / 2 - 0.12, 0.12);
  }
  g.add(p);
  return p;
}
/** Porta arredondada no topo, com maçaneta. */
function porta(g, c, x, y, z, w = 1.1, h = 1.9, color = '#c9845e', ry = 0) {
  const p = new THREE.Group();
  p.position.set(x, y, z); p.rotation.y = ry;
  const m = c.M(color);
  add(p, G.box, m, 0, (h - w / 2) / 2, 0.04, w, h - w / 2, 0.12);
  add(p, G.halfDisc, m, 0, h - w / 2, 0.04, w / 2, w / 2, 0.12);
  add(p, G.sphereLo, c.M('#ffd166'), w * 0.3, h * 0.45, 0.14, 0.07);
  add(p, G.box, c.M(WHITE), 0, -0.04, 0.3, w + 0.5, 0.12, 0.6);   // degrau
  g.add(p);
  return p;
}
/** Floreira com florzinhas coloridas. */
function floreira(g, c, x, y, z, w, ry = 0, rng = Math.random) {
  const p = new THREE.Group();
  p.position.set(x, y, z); p.rotation.y = ry;
  add(p, rbox(w, 0.3, 0.32, 0.08), c.M('#c98f5e'), 0, 0, 0);
  add(p, G.sphereLo, c.M('#7fcf86'), 0, 0.15, 0, w * 0.45, 0.14, 0.14);
  const n = Math.max(2, Math.round(w / 0.28));
  for (let i = 0; i < n; i++) {
    const col = c.accent(i + Math.floor(rng() * 5));
    add(p, G.sphereLo, c.M(col), -w / 2 + 0.15 + i * (w - 0.3) / Math.max(1, n - 1), 0.28 + rng() * 0.06, 0.02 * i % 0.04, 0.1);
  }
  g.add(p);
  return p;
}
/** Telhado de duas águas: oitão na cor da parede + duas lajes arredondadas + cumeeira. */
function telhado(g, c, W, D, top, rise, wallColor, roofColor, over = 0.5) {
  add(g, G.prism, c.M(wallColor), 0, top, 0, W, rise, D);
  const a = Math.atan2(rise, W / 2), len = Math.hypot(W / 2, rise) + over;
  for (const s of [-1, 1]) {
    const slab = add(g, rbox(len, 0.28, D + over * 1.6, 0.12), c.M(roofColor),
      s * (W / 4 + Math.sin(a) * 0.14 + over * 0.5 * Math.cos(a)), top + rise / 2 + Math.cos(a) * 0.14 - over * 0.5 * Math.sin(a), 0);
    slab.rotation.z = -s * a;
  }
  add(g, G.cyl, c.M(roofColor), 0, top + rise + 0.12, 0, 0.2, D + over * 1.6, 0.2, Math.PI / 2);
}
/** Placa de texto (plano com textura) — não é assada. */
function placaTexto(g, c, text, x, y, z, w, h, ry = 0, opts) {
  const tex = signTexture(text, { w: 512, h: Math.round(512 * h / w), ...opts });
  const m = new THREE.MeshToonMaterial({ map: tex, gradientMap: c.gradient });
  const mesh = add(g, new THREE.PlaneGeometry(w, h), m, x, y, z, 1, 1, 1, 0, ry, 0);
  c.registerFade(m);
  return mesh;
}
function toldo(g, c, W, y, z, depth, colorA, colorB = WHITE) {
  const n = Math.max(5, Math.round(W / 0.55));
  const sw = W / n, a = 0.42;
  for (let i = 0; i < n; i++) {
    const stripe = add(g, rbox(sw * 1.02, 0.1, depth, 0.04), c.M(i % 2 ? colorB : colorA),
      -W / 2 + sw * (i + 0.5), y - Math.sin(a) * depth / 2, z + Math.cos(a) * depth / 2);
    stripe.rotation.x = a;
    add(g, G.sphereLo, c.M(i % 2 ? colorB : colorA), -W / 2 + sw * (i + 0.5), y - Math.sin(a) * depth - 0.06, z + Math.cos(a) * depth, sw * 0.5, 0.14, 0.1);
  }
}
/** Lojinha: ícone pendurado ao lado da porta. */
function iconeLoja(g, c, tipo, x, y, z) {
  const p = new THREE.Group();
  p.position.set(x, y, z);
  add(p, G.box, c.M(WOOD_D), 0, 0.55, -0.25, 0.08, 0.08, 0.6);
  add(p, G.disc, c.M(CREAM), 0, 0, 0.05, 0.5, 0.08, 0.5, Math.PI / 2);
  add(p, G.torusThin, c.M(WOOD_D), 0, 0, 0.05, 0.5);
  const fz = 0.12;
  switch (tipo) {
    case 'padaria':
      add(p, G.capsule, c.M('#e0a35f'), 0, 0, fz, 0.35, 0.32, 0.25, 0, 0, Math.PI / 2);
      for (const dx of [-0.12, 0, 0.12]) add(p, G.box, c.M('#fff1d6'), dx, 0.06, fz + 0.12, 0.03, 0.12, 0.02);
      break;
    case 'correio':
      add(p, G.box, c.M(WHITE), 0, 0, fz, 0.55, 0.36, 0.06);
      add(p, G.cone4, c.M('#ff8fab'), 0, 0.02, fz + 0.04, 0.38, 0.26, 0.05, Math.PI, Math.PI / 4, 0);
      break;
    case 'doceria':
      add(p, G.cylTaper, c.M('#ffb3c7'), 0, -0.1, fz, 0.2, 0.22, 0.16, Math.PI);
      add(p, G.sphereLo, c.M('#fff1f6'), 0, 0.08, fz, 0.24, 0.18, 0.18);
      add(p, G.sphereLo, c.M('#ff4d6d'), 0, 0.26, fz, 0.07);
      break;
    case 'livraria':
      add(p, G.box, c.M('#6c8cff'), -0.08, 0, fz, 0.32, 0.42, 0.08, 0, 0, 0.12);
      add(p, G.box, c.M('#52b788'), 0.12, -0.02, fz + 0.02, 0.28, 0.38, 0.08, 0, 0, -0.1);
      break;
    default: // floricultura e outras
      for (let i = 0; i < 5; i++) add(p, G.sphereLo, c.M('#fb6f92'), Math.cos(i * 1.256) * 0.14, Math.sin(i * 1.256) * 0.14, fz, 0.1, 0.1, 0.05);
      add(p, G.sphereLo, c.M('#ffd166'), 0, 0, fz + 0.03, 0.08);
  }
  g.add(p);
}

// ------------------------------------------------------------------------------------------
// CASAS
function casaComum(l, c) {
  const d = l.data || {};
  const g = new THREE.Group();
  const rng = c.rng;
  const W = 6, H = 3.5, D = 5;
  const wall = d.cor ?? '#ffe9d6', roof = d.telhado ?? '#ff8fa3';
  add(g, rbox(W + 0.4, 0.6, D + 0.4, 0.16), c.M('#e6dccf'), 0, 0.2, 0);
  add(g, rbox(W, H, D, 0.32), c.M(wall), 0, 0.45 + H / 2, 0);
  const top = 0.45 + H;
  telhado(g, c, W, D, top - 0.05, 2.1, wall, roof);
  // chaminé
  add(g, rbox(0.7, 1.5, 0.7, 0.12), c.M('#e8a598'), W * 0.22, top + 1.6, -D * 0.2);
  add(g, rbox(0.9, 0.22, 0.9, 0.08), c.M(CREAM), W * 0.22, top + 2.35, -D * 0.2);
  // frente: porta, janelas, floreiras
  porta(g, c, 0, 0.5, D / 2, 1.15, 2.0, d.loja ? '#ffffff' : '#c9845e');
  for (const sx of [-1.95, 1.95]) {
    janela(g, c, sx, 0.45 + H * 0.58, D / 2 + 0.02);
    floreira(g, c, sx, 0.45 + H * 0.58 - 0.78, D / 2 + 0.22, 1.1, 0, rng);
  }
  for (const s of [-1, 1]) janela(g, c, s * (W / 2 + 0.02), 0.45 + H * 0.58, 0, 0.85, 0.95, s * Math.PI / 2);
  janela(g, c, 0, 0.45 + H * 0.58, -D / 2 - 0.02, 0.85, 0.95, Math.PI);
  // olhinhos no oitão
  c.eyes(g, { x: 0, y: top + 0.78, z: D / 2 + 0.08, size: 0.32, lashes: rng() < 0.6, far: 110 });
  // bochechas rosadas no oitão
  for (const s of [-1, 1]) add(g, G.sphereLo, c.M('#ffb3c7'), s * 0.75, top + 0.38, D / 2 + 0.02, 0.2, 0.12, 0.05);
  if (d.loja) {
    toldo(g, c, 1.9, 0.5 + 2.35, D / 2 + 0.05, 0.9, roof);
    iconeLoja(g, c, d.loja, 1.3, 0.5 + 2.6, D / 2 + 0.6);
  }
  c.box(0, 0, W / 2 + 0.2, D / 2 + 0.2, 0, top + 2.4);
  return g;
}

function casaTorre(l, c) {     // Casa do Telhado Alto: dois andares, terraço plano em roofY
  const d = l.data || {};
  const g = new THREE.Group();
  const R = d.raio ?? 4.5;
  const top = d.roofY - c.gy;                 // altura do terraço acima do chão
  const wall = d.cor ?? '#ffc8dd', roof = d.telhado ?? '#b388eb';
  add(g, G.cyl, c.M('#e6dccf'), 0, 0.3, 0, R + 0.25, 0.6, R + 0.25);
  add(g, G.cyl, c.M(wall), 0, top / 2, 0, R - 0.25, top, R - 0.25);
  add(g, G.cyl, c.M(roof), 0, top * 0.5, 0, R - 0.1, 0.35, R - 0.1);      // faixa entre andares
  add(g, G.cyl, c.M(roof), 0, top - 0.2, 0, R, 0.4, R);                    // laje do terraço
  add(g, G.cyl, c.M(CREAM), 0, top - 0.02, 0, R - 0.15, 0.06, R - 0.15);
  porta(g, c, 0, 0.6, R - 0.22, 1.1, 2.0, '#9b5de5');
  for (const [a, y] of [[0, 0.62], [55, 0.3], [-55, 0.3], [120, 0.3], [-120, 0.3], [180, 0.3], [25, 0.78], [-25, 0.78], [90, 0.78], [-90, 0.78], [160, 0.78]]) {
    const r = a * D2R;
    if (a === 0) continue;
    janela(g, c, Math.sin(r) * (R - 0.2), top * y + 0.6, Math.cos(r) * (R - 0.2), 0.8, 0.9, r, y > 0.5);
  }
  // mureta baixa com abertura do lado dos caixotes (ângulo da última caixa: 255° polar)
  const gapA = Math.atan2(Math.cos(255 * D2R), Math.sin(255 * D2R)) - (l.rotY ?? 0);   // ângulo local (yaw)
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * TAU;
    let da = Math.abs(((a - gapA + Math.PI) % TAU + TAU) % TAU - Math.PI);
    if (da < 0.45) continue;
    add(g, G.sphereLo, c.M(roof), Math.sin(a) * (R - 0.2), top + 0.18, Math.cos(a) * (R - 0.2), 0.32, 0.26, 0.32);
  }
  // varal de bandeirinhas e vasinhos no terraço
  for (let i = 0; i < 3; i++) add(g, G.cylTaper, c.M('#e8906a'), -2 + i * 2, top + 0.25, -R + 1.2, 0.25, 0.4, 0.25, Math.PI);
  c.eyes(g, { x: 0, y: top * 0.5 + 1.25, z: R - 0.12, size: 0.42, lashes: true, far: 120 });
  for (const s of [-1, 1]) add(g, G.sphereLo, c.M('#ff9fc0'), s * 1.0, top * 0.5 + 0.75, R - 0.2, 0.25, 0.14, 0.06);
  c.circle(0, 0, R + 0.1, 0, top - 0.05);
  return g;
}

function casaCogumelo(l, c) {
  const d = l.data || {};
  const g = new THREE.Group();
  add(g, G.cylTaper, c.M(d.cor ?? '#fffaf0'), 0, 1.9, 0, 2.9, 3.8, 2.9, Math.PI);
  add(g, G.hemi, c.M(d.telhado ?? '#ff5d73'), 0, 3.6, 0, 4.6, 2.8, 4.6);
  for (let i = 0; i < 9; i++) {
    const a = i * 2.39, el = 0.35 + (i % 3) * 0.32;
    const x = Math.cos(a) * Math.cos(el) * 4.6, z = Math.sin(a) * Math.cos(el) * 4.6, y = 3.6 + Math.sin(el) * 2.8;
    add(g, G.sphereLo, c.M(WHITE), x, y, z, 0.55, 0.3, 0.55).lookAt(0, -2, 0);
  }
  add(g, G.torus, c.M('#f2e6d8'), 0, 3.62, 0, 4.4, 4.4, 1.4, Math.PI / 2);
  porta(g, c, 0, 0.05, 2.75, 1.1, 2.0, '#b5838d');
  for (const a of [50, -50, 140, -140]) janela(g, c, Math.sin(a * D2R) * 2.75, 2.2, Math.cos(a * D2R) * 2.75, 0.8, 0.8, a * D2R, true);
  c.eyes(g, { x: 0, y: 4.4, z: 3.95, size: 0.42, lashes: true, far: 110 });
  c.circle(0, 0, 3.2, 0, 6.3);
  return g;
}

function celeiro(l, c) {
  const d = l.data || {};
  const g = new THREE.Group();
  const W = 6.6, H = 3.6, D = 5.6, wall = d.cor ?? '#ff9e9e', roof = d.telhado ?? '#c0392b';
  add(g, rbox(W, H, D, 0.3), c.M(wall), 0, H / 2 + 0.2, 0);
  // telhado holandês (dois caimentos)
  const top = H + 0.2;
  add(g, G.prism, c.M(wall), 0, top - 0.05, 0, W, 2.6, D);
  for (const s of [-1, 1]) {
    add(g, rbox(2.2, 0.26, D + 0.8, 0.1), c.M(roof), s * 2.6, top + 0.9, 0, 1, 1, 1, 0, 0, -s * 1.05);
    add(g, rbox(2.4, 0.26, D + 0.8, 0.1), c.M(roof), s * 1.05, top + 2.15, 0, 1, 1, 1, 0, 0, -s * 0.42);
  }
  // portão com X branco
  add(g, G.box, c.M('#a8323e'), 0, 1.45, D / 2 + 0.02, 2.6, 2.5, 0.1);
  for (const s of [-1, 1]) add(g, G.box, c.M(WHITE), 0, 1.45, D / 2 + 0.09, 3.3, 0.18, 0.06, 0, 0, s * 0.76);
  add(g, rbox(2.9, 2.8, 0.14, 0.06), c.M(WHITE), 0, 1.45, D / 2 - 0.01);
  janela(g, c, 0, top + 1.0, D / 2 + 0.02, 0.9, 0.9, 0, true);
  c.eyes(g, { x: 0, y: top + 1.95, z: D / 2 + 0.06, size: 0.3, lashes: true, far: 110 });
  // fardos de feno
  for (const [x, z] of [[-4.2, 2.2], [-4.4, 0.8]]) add(g, G.cyl, c.M('#ffd27f'), x, 0.5, z, 0.55, 1.1, 0.55, 0, 0, Math.PI / 2);
  c.box(0, 0, W / 2 + 0.1, D / 2 + 0.1, 0, top + 2.6);
  c.circle(-4.3, 1.5, 0.9, 0, 1.0, true);
  return g;
}

function casaBiscoito(l, c) {
  const d = l.data || {};
  const g = new THREE.Group();
  const W = 5.8, H = 3.3, D = 5, wall = d.cor ?? '#e8b07a', roof = d.telhado ?? '#ff7eb6';
  add(g, rbox(W, H, D, 0.45), c.M(wall), 0, H / 2 + 0.15, 0);
  // glacê nas quinas e bordas
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(g, G.cyl, c.M(WHITE), sx * W / 2, H / 2 + 0.15, sz * D / 2, 0.14, H, 0.14);
  for (let i = 0; i < 10; i++) add(g, G.sphereLo, c.M(WHITE), -W / 2 + 0.3 + i * (W - 0.6) / 9, 0.3, D / 2 + 0.05, 0.16);
  const top = H + 0.15;
  telhado(g, c, W, D, top - 0.05, 2.0, wall, roof, 0.6);
  // gotinhas de glacê e confeitos no telhado
  for (let i = 0; i < 9; i++) {
    const x = -W / 2 + 0.2 + i * (W - 0.4) / 8;
    add(g, G.sphereLo, c.M(WHITE), x, top + 0.1 - Math.abs(x) * 0.12, D / 2 + 0.75, 0.14, 0.22, 0.14);
  }
  for (let i = 0; i < 14; i++) {
    const s = i % 2 ? 1 : -1, t = c.rng();
    add(g, G.sphereLo, c.M(c.accent(i)), s * (0.35 + t * 2.4), top + 2.0 - (0.35 + t * 2.4) * 0.66 + 0.35, -D / 2 + c.rng() * D, 0.1);
  }
  porta(g, c, 0, 0.15, D / 2, 1.1, 1.9, '#ff9ec7');
  for (const sx of [-1.8, 1.8]) janela(g, c, sx, 2.0, D / 2 + 0.02, 0.8, 0.8, 0, true);
  // bengalinha doce na porta
  for (const s of [-1, 1]) {
    add(g, G.cyl, c.M(WHITE), s * 1.0, 1.0, D / 2 + 0.4, 0.07, 2.0, 0.07);
    add(g, G.torusThin, c.M('#ff4d6d'), s * 1.0, 2.0, D / 2 + 0.4, 0.2, 0.2, 0.9, 0, 0, Math.PI / 2);
  }
  c.eyes(g, { x: 0, y: top + 0.75, z: D / 2 + 0.07, size: 0.32, lashes: true, far: 110 });
  c.box(0, 0, W / 2 + 0.2, D / 2 + 0.2, 0, top + 2.2);
  return g;
}

function prefeitura(l, c) {
  const d = l.data || {};
  const g = new THREE.Group();
  const W = 6.6, H = 4.2, D = 5.2, wall = d.cor ?? '#fff1e6', roof = d.telhado ?? '#a3c4f3';
  add(g, rbox(W + 0.6, 0.5, D + 0.6, 0.15), c.M('#e6dccf'), 0, 0.2, 0);
  add(g, rbox(W, H, D, 0.3), c.M(wall), 0, 0.45 + H / 2, 0);
  add(g, rbox(W + 0.3, 0.3, D + 0.3, 0.1), c.M(roof), 0, 0.45 + H, 0);
  // colunas e frontão
  for (let i = 0; i < 4; i++) add(g, G.cyl, c.M(WHITE), -1.8 + i * 1.2, 0.45 + H * 0.42, D / 2 + 0.55, 0.18, H * 0.84, 0.18);
  add(g, G.prism, c.M(WHITE), 0, 0.45 + H * 0.84, D / 2 + 0.55, 4.6, 0.9, 0.6);
  porta(g, c, 0, 0.45, D / 2, 1.2, 2.2, '#6c8cff');
  for (const sx of [-2.4, 2.4]) for (const y of [1.6, 3.4]) janela(g, c, sx, y, D / 2 + 0.02, 0.7, 0.9);
  // cúpula com bandeirinha
  const top = 0.6 + H;
  add(g, G.cyl, c.M(wall), 0, top + 0.5, 0, 1.6, 1.0, 1.6);
  add(g, G.hemi, c.M(roof), 0, top + 1.0, 0, 1.7, 1.6, 1.7);
  add(g, G.cyl, c.M(WHITE), 0, top + 3.0, 0, 0.04, 1.2, 0.04);
  const flag = dyn('bandeira');
  flag.position.set(0, top + 3.35, 0);
  add(flag, G.box, c.M('#ff8fab'), 0.35, 0, 0, 0.7, 0.42, 0.03);
  g.add(flag);
  c.anim((dt, t) => { flag.rotation.y = Math.sin(t * 2.1) * 0.35; }, l.x, l.z);
  c.eyes(g, { x: 0, y: top + 1.5, z: 1.55, size: 0.36, lashes: true, far: 140 });
  c.box(0, 0.4, W / 2 + 0.3, D / 2 + 0.9, 0, top + 2.6);
  return g;
}

function casa(l, c) {
  const e = l.data?.estilo;
  if (e === 'cogumelo') return casaCogumelo(l, c);
  if (e === 'celeiro') return celeiro(l, c);
  if (e === 'biscoito') return casaBiscoito(l, c);
  if (e === 'prefeitura') return prefeitura(l, c);
  if (l.data?.telhadoPlano) return casaTorre(l, c);
  return casaComum(l, c);
}

function casaQuim(l, c) {
  const g = new THREE.Group();
  const R = 3.9;
  add(g, G.cyl, c.M('#efe3d3'), 0, 0.25, 0, R + 0.3, 0.5, R + 0.3);
  add(g, G.cyl, c.M('#e7d6ff'), 0, 2.05, 0, R, 3.3, R);
  add(g, G.torus, c.M('#ffffff'), 0, 3.72, 0, R + 0.05, R + 0.05, 1.0, Math.PI / 2);
  // telhado cônico com babadinho
  add(g, G.cone, c.M('#ff9cc7'), 0, 5.6, 0, R + 1.25, 3.9, R + 1.25);
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * TAU;
    add(g, G.sphereLo, c.M(i % 2 ? '#ffb8d9' : '#ff8fc0'), Math.sin(a) * (R + 1.15), 3.72, Math.cos(a) * (R + 1.15), 0.42, 0.3, 0.42);
  }
  // coração no topo
  const heart = new THREE.Group(); heart.position.set(0, 7.85, 0);
  for (const s of [-1, 1]) add(heart, G.sphereLo, c.M('#ff4f8b'), s * 0.17, 0.08, 0, 0.22);
  add(heart, G.cone4, c.M('#ff4f8b'), 0, -0.14, 0, 0.3, 0.36, 0.2, Math.PI, Math.PI / 4, 0);
  g.add(heart);
  // chaminé com fumacinha
  add(g, rbox(0.6, 1.7, 0.6, 0.12), c.M('#ffd6a5'), 1.55, 6.45, -0.9);
  add(g, rbox(0.78, 0.2, 0.78, 0.08), c.M(WHITE), 1.55, 7.3, -0.9);
  const smoke = dyn('fumaca');
  smoke.position.set(1.55, 7.5, -0.9);
  const puffs = [];
  for (let i = 0; i < 4; i++) puffs.push(add(smoke, G.sphereLo, c.M('#ffffff', { transparent: true, opacity: 0.75 }), 0, 0, 0, 0.3));
  g.add(smoke);
  c.anim((dt, t) => {
    puffs.forEach((p, i) => {
      const k = ((t * 0.25 + i / puffs.length) % 1);
      p.position.set(Math.sin(k * 6 + i) * 0.35, k * 2.6, k * 0.4);
      p.scale.setScalar(0.18 + k * 0.45);
    });
  }, l.x, l.z);
  // porta redonda + varandinha
  porta(g, c, 0, 0.5, R - 0.05, 1.25, 2.15, '#ff8fab');
  add(g, rbox(3.2, 0.14, 1.6, 0.06), c.M('#ffb3d1'), 0, 3.0, R + 0.55, 1, 1, 1, 0.2);
  for (const s of [-1, 1]) add(g, G.cyl, c.M(WHITE), s * 1.4, 1.75, R + 1.15, 0.08, 2.5, 0.08);
  for (const a of [48, -48, 110, -110, 180]) janela(g, c, Math.sin(a * D2R) * (R - 0.02), 2.25, Math.cos(a * D2R) * (R - 0.02), 0.9, 0.9, a * D2R, true);
  // olhos grandes no telhado, como se a casa espiasse a Quim
  c.eyes(g, { x: 0, y: 4.75, z: R + 0.42, size: 0.5, lashes: true, far: 150, rx: -0.35 });
  for (const s of [-1, 1]) add(g, G.sphereLo, c.M('#ff7aa8'), s * 1.25, 4.35, R + 0.55, 0.3, 0.16, 0.08);
  // floreiras redondas e caminho de pedrinhas
  for (const s of [-1, 1]) floreira(g, c, s * 1.95, 0.75, R + 0.35, 1.3, 0, c.rng);
  for (let i = 0; i < 5; i++) add(g, G.cyl, c.M('#f3e3cd'), Math.sin(i * 1.3) * 0.5, 0.05, R + 1.8 + i * 1.3, 0.5, 0.1, 0.42);
  c.circle(0, 0, R + 0.25, 0, 7.9);
  return g;
}

function cafeteria(l, c) {
  const d = l.data || {};
  const g = new THREE.Group();
  const W = 9, H = 4.2, D = 7;
  add(g, rbox(W + 0.4, 0.5, D + 0.4, 0.15), c.M('#f3d9e4'), 0, 0.2, 0);
  add(g, rbox(W, H, D, 0.4), c.M('#fff4e6'), 0, 0.45 + H / 2, 0);
  add(g, rbox(W + 0.2, 0.7, D + 0.2, 0.3), c.M('#ffd6e8'), 0, 0.45, 0);
  const top = 0.45 + H;
  add(g, rbox(W + 0.7, 0.5, D + 0.7, 0.22), c.M('#ffc2dc'), 0, top + 0.2, 0);
  for (let i = 0; i < 26; i++) {   // nuvenzinhas de leite na beira do telhado
    const a = (i / 26) * TAU;
    const x = Math.max(-1, Math.min(1, Math.cos(a) * 1.5)) * (W / 2 + 0.3), z = Math.max(-1, Math.min(1, Math.sin(a) * 1.5)) * (D / 2 + 0.3);
    add(g, G.sphereLo, c.M(WHITE), x, top + 0.45, z, 0.42, 0.3, 0.42);
  }
  // xícara gigante no telhado (com olhinhos e vapor)
  const cup = new THREE.Group();
  cup.position.set(0, top + 0.45, -0.6);
  add(cup, G.disc, c.M(WHITE), 0, 0.12, 0, 2.6, 0.24, 2.6);
  add(cup, G.cylTaper, c.M(WHITE), 0, 1.45, 0, 2.0, 2.6, 2.0);
  add(cup, G.cyl, c.M('#ff9cc4'), 0, 1.0, 0, 1.78, 0.45, 1.78);
  add(cup, G.disc, c.M('#c88b5e'), 0, 2.72, 0, 1.9, 0.05, 1.9);
  add(cup, G.disc, c.M('#fff1e0'), 0, 2.76, 0, 1.55, 0.04, 1.55);
  for (const s of [-1, 1]) add(cup, G.sphereLo, c.M('#ff9cc4'), s * 0.32, 2.79, 0.2, 0.36, 0.04, 0.36);   // coraçãozinho de espuma
  add(cup, G.cone4, c.M('#ff9cc4'), 0, 2.79, -0.12, 0.42, 0.04, 0.42, 0, Math.PI / 4, 0);
  add(cup, G.torus, c.M(WHITE), 2.05, 1.5, 0, 0.75, 0.75, 1.3);
  c.eyes(cup, { x: 0, y: 1.6, z: 1.93, size: 0.5, lashes: true, far: 180 });
  for (const s of [-1, 1]) add(cup, G.sphereLo, c.M('#ffb3c7'), s * 1.05, 1.15, 1.75, 0.28, 0.17, 0.08);
  g.add(cup);
  const steam = dyn('vapor');
  steam.position.set(0, top + 3.3, -0.6);
  const puffs = [];
  for (let i = 0; i < 6; i++) puffs.push(add(steam, G.sphereLo, c.M('#ffffff', { transparent: true, opacity: 0.7 }), 0, 0, 0, 0.3));
  g.add(steam);
  c.anim((dt, t) => {
    puffs.forEach((p, i) => {
      const k = ((t * 0.2 + i / puffs.length) % 1);
      p.position.set(Math.sin(k * 5 + i * 2) * 0.6, k * 3.2, Math.cos(k * 4 + i) * 0.3);
      p.scale.setScalar((0.3 + k * 0.7) * (1 - k * 0.5));
    });
  }, l.x, l.z);
  // fachada: vitrine, porta de vidro, toldo listrado e letreiro
  porta(g, c, 0, 0.45, D / 2, 1.4, 2.4, '#ffb3c7');
  for (const sx of [-2.9, 2.9]) {
    add(g, rbox(2.5, 1.9, 0.16, 0.1), c.M(WHITE), sx, 2.1, D / 2 + 0.02);
    add(g, G.box, c.win(), sx, 2.1, D / 2 + 0.1, 2.2, 1.6, 0.04);
    add(g, G.box, c.M(WHITE), sx, 2.1, D / 2 + 0.13, 0.08, 1.6, 0.03);
  }
  toldo(g, c, W - 0.6, 3.75, D / 2 + 0.05, 1.5, d.toldo ?? '#ffd6e8');
  placaTexto(g, c, 'Cafeteria Nuvem de Leite', 0, top - 0.25, D / 2 + 0.27, 5.4, 0.85, 0, { bg: '#fff7fb', border: '#ff9cc4', ink: '#a8507a' });
  // mesinhas na calçada (fora da mesa da história, que fica 8 m à frente da porta)
  const mesas = [[-3.6, 5.6], [3.6, 5.6], [-5.2, 3.2]].slice(0, d.mesasFora ?? 3);
  mesas.forEach(([x, z], i) => {
    const t = new THREE.Group(); t.position.set(x, 0, z);
    add(t, G.disc, c.M(WHITE), 0, 0.82, 0, 0.6, 0.07, 0.6);
    add(t, G.cyl, c.M('#d8d0e6'), 0, 0.42, 0, 0.06, 0.8, 0.06);
    add(t, G.disc, c.M('#d8d0e6'), 0, 0.03, 0, 0.3, 0.06, 0.3);
    for (const s of [-1, 1]) {
      add(t, G.disc, c.M('#ffd6e8'), s * 0.95, 0.48, 0, 0.3, 0.08, 0.3);
      add(t, G.cyl, c.M(WHITE), s * 0.95, 0.24, 0, 0.04, 0.48, 0.04);
      add(t, rbox(0.12, 0.55, 0.5, 0.05), c.M('#ffd6e8'), s * 1.2, 0.78, 0);
    }
    add(t, G.cyl, c.M(WHITE), 0, 1.6, 0, 0.04, 1.6, 0.04);
    add(t, G.cone, c.M(i % 2 ? '#a0d8ef' : '#ffb3c7'), 0, 2.55, 0, 1.25, 0.6, 1.25);
    add(t, G.sphereLo, c.M(WHITE), 0, 0.92, 0, 0.1, 0.08, 0.1);   // xicrinha
    g.add(t);
    c.circle(x, z, 0.65, 0, 0.88, true);
  });
  for (const s of [-1, 1]) {   // vasos com arbustinho redondo
    add(g, G.cylTaper, c.M('#e8906a'), s * (W / 2 + 0.5), 0.35, D / 2 + 0.3, 0.4, 0.7, 0.4, Math.PI);
    add(g, G.sphere, c.M('#7fcf86'), s * (W / 2 + 0.5), 1.1, D / 2 + 0.3, 0.55);
  }
  c.box(0, 0, W / 2 + 0.2, D / 2 + 0.2, 0, top + 3.5);
  return g;
}

function lojaAcessorios(l, c) {
  const d = l.data || {};
  const g = new THREE.Group();
  const W = 8, H = 4, D = 6;
  add(g, rbox(W + 0.4, 0.5, D + 0.4, 0.15), c.M('#e9e0f7'), 0, 0.2, 0);
  add(g, rbox(W, H, D, 0.4), c.M('#f8f1ff'), 0, 0.45 + H / 2, 0);
  for (let i = 0; i < 9; i++) add(g, G.box, c.M('#efe2ff'), -W / 2 + 0.5 + i * (W - 1) / 8, 0.45 + H / 2, D / 2 + 0.01, 0.35, H - 0.6, 0.02);  // listras
  const top = 0.45 + H;
  add(g, rbox(W + 0.6, 0.45, D + 0.6, 0.2), c.M('#c9b6ff'), 0, top + 0.15, 0);
  for (let i = 0; i < 16; i++) add(g, G.sphereLo, c.M('#ffb8de'), -W / 2 - 0.1 + i * (W + 0.2) / 15, top - 0.08, D / 2 + 0.32, 0.26, 0.26, 0.18);
  // laço gigante no telhado (com olhinhos no nó)
  const bow = new THREE.Group(); bow.position.set(0, top + 1.8, 0.4);
  for (const s of [-1, 1]) {
    add(bow, G.sphere, c.M('#ff7eb6'), s * 1.25, 0.15, 0, 1.25, 0.9, 0.5, 0, 0, s * 0.25);
    add(bow, G.capsule, c.M('#ff7eb6'), s * 0.55, -1.2, 0, 0.5, 1.4, 0.35, 0, 0, s * 0.45);
  }
  add(bow, G.sphere, c.M('#ff5fa2'), 0, 0, 0.1, 0.72, 0.68, 0.55);
  c.eyes(bow, { x: 0, y: 0.05, z: 0.45, size: 0.24, lashes: true, far: 170 });
  g.add(bow);
  porta(g, c, 0, 0.45, D / 2, 1.3, 2.3, '#c9b6ff');
  // vitrines com cabecinha de manequim cacheada
  for (const sx of [-2.6, 2.6]) {
    add(g, rbox(2.3, 2.0, 0.16, 0.12), c.M(WHITE), sx, 2.1, D / 2 + 0.02);
    add(g, G.box, c.win(), sx, 2.1, D / 2 + 0.1, 2.0, 1.7, 0.04);
    add(g, G.cyl, c.M(WHITE), sx, 1.55, D / 2 + 0.35, 0.08, 0.5, 0.08);
    add(g, G.sphere, c.M('#f5d9c8'), sx, 2.0, D / 2 + 0.35, 0.32);
    for (let i = 0; i < 7; i++) add(g, G.sphereLo, c.M('#6b3f2a'), sx + Math.cos(i * 0.9) * 0.28, 2.18 + Math.sin(i * 0.9) * 0.16, D / 2 + 0.3, 0.15);
    add(g, G.sphereLo, c.M(sx < 0 ? '#ff5fa2' : '#ffd166'), sx + 0.22, 2.38, D / 2 + 0.42, 0.14, 0.1, 0.06);
  }
  toldo(g, c, W - 0.8, 3.7, D / 2 + 0.05, 1.3, d.toldo ?? '#c9b6ff');
  placaTexto(g, c, 'Laços & Cachos', 0, top - 0.3, D / 2 + 0.23, 4.4, 0.8, 0, { bg: '#fbf5ff', border: '#c9b6ff', ink: '#7a4fb8' });
  c.box(0, 0, W / 2 + 0.2, D / 2 + 0.2, 0, top + 3);
  return g;
}

// ------------------------------------------------------------------------------------------
// PRAÇAS E ÁGUA
function praca(l, c) {
  const g = new THREE.Group();
  const s = l.scale ?? 1;
  const R = 12 * s;
  if (l.data?.piso === 'grama') {   // clareira: anel de pedrinhas e florzinhas
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * TAU;
      add(g, G.sphereLo, c.M(i % 3 ? '#e9e4d8' : '#d8e8c8'), Math.cos(a) * R, 0.05, Math.sin(a) * R, 0.45, 0.2, 0.38).userData.noShadow = true;
      if (i % 2) add(g, G.sphereLo, c.M(c.accent(i)), Math.cos(a + 0.12) * (R - 0.8), 0.18, Math.sin(a + 0.12) * (R - 0.8), 0.14);
    }
    return g;
  }
  const floor = (r, h, col, y) => { const m = add(g, G.disc, c.M(col), 0, y, 0, r, h, r); m.userData.noShadow = true; return m; };
  floor(R + 0.35, 0.16, '#e9d8c4', 0.06);
  floor(R, 0.16, '#fbefe2', 0.08);
  floor(R * 0.66, 0.16, '#f6dfe6', 0.1);
  floor(R * 0.58, 0.16, '#fbefe2', 0.12);
  // pétalas de pedra em estrela
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const m = add(g, G.sphereLo, c.M(i % 2 ? '#ffd9e6' : '#d9ecff'), Math.cos(a) * R * 0.8, 0.13, Math.sin(a) * R * 0.8, R * 0.09, 0.06, R * 0.045, 0, -a, 0);
    m.userData.noShadow = true;
  }
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * TAU;
    add(g, G.box, c.M('#ead6c3'), Math.cos(a) * R * 0.92, 0.15, Math.sin(a) * R * 0.92, 0.06, 0.04, R * 0.12, 0, -a, 0).userData.noShadow = true;
  }
  return g;
}

function fonte(l, c) {
  const g = new THREE.Group();
  const s = l.scale ?? 1;
  g.scale.setScalar(s);
  const rim = new THREE.LatheGeometry([[4.15, 0.0], [4.15, 0.75], [4.3, 0.95], [4.65, 0.95], [4.8, 0.75], [4.75, 0.0]].map(([x, y]) => new THREE.Vector2(x, y)), 40);
  add(g, rim, c.M('#f2e7f7'));
  add(g, G.torus, c.M('#ffd6e8'), 0, 0.95, 0, 4.48, 4.48, 1.1, Math.PI / 2);
  add(g, G.disc, c.M('#bfe7f0'), 0, 0.25, 0, 4.15, 0.5, 4.15);
  // coluna, prato de cima e o Olho dos Cílios
  add(g, G.cylTaper, c.M('#f2e7f7'), 0, 1.6, 0, 0.55, 2.6, 0.55, Math.PI);
  const bowl = new THREE.LatheGeometry([[0, 2.5], [0.9, 2.55], [1.7, 2.9], [1.85, 3.1], [1.65, 3.1], [0.9, 2.85], [0, 2.85]].map(([x, y]) => new THREE.Vector2(x, y)), 32);
  add(g, bowl, c.M('#f2e7f7'));
  add(g, G.disc, c.M('#a8e8ff', { emissive: '#7fd4ff', emissiveIntensity: 0.15 }), 0, 3.0, 0, 1.6, 0.06, 1.6);
  add(g, G.cyl, c.M('#f2e7f7'), 0, 3.45, 0, 0.3, 0.9, 0.3);
  add(g, G.sphere, c.M(WHITE), 0, 4.65, 0, 0.95);
  c.eyes(g, { x: 0, y: 4.65, z: 0.55, size: 0.85, single: true, lashes: true, far: 160 });
  const lashes = new THREE.Group(); lashes.position.set(0, 4.65, 0);
  for (let i = -3; i <= 3; i++) {
    const a = i * 0.32;
    add(lashes, G.capsule, c.M(INK), Math.sin(a) * 0.95, Math.cos(a) * 0.95 + 0.1, 0.3, 0.12, 0.45, 0.12, 0.3, 0, -a * 1.2);
  }
  g.add(lashes);
  // jatinhos d'água em arco (gotas animadas)
  const drops = dyn('jatos');
  const N = 8, K = 7;
  const dropGeo = G.sphereLo;
  const dropMat = c.M('#bdefff', { emissive: '#9be3ff', emissiveIntensity: 0.25 });
  const inst = new THREE.InstancedMesh(dropGeo, dropMat, N * K);
  drops.add(inst);
  g.add(drops);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  c.anim((dt, t) => {
    let k = 0;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU;
      for (let j = 0; j < K; j++) {
        const u = ((t * 0.7 + j / K + i * 0.13) % 1);
        const r = 1.75 + u * 2.0;
        p.set(Math.cos(a) * r, 3.1 + Math.sin(u * Math.PI) * 1.1 - u * 2.3, Math.sin(a) * r);
        sc.setScalar(0.11 * (1 - u * 0.4));
        inst.setMatrixAt(k++, m4.compose(p, q, sc));
      }
    }
    inst.instanceMatrix.needsUpdate = true;
  }, l.x, l.z, 120);
  c.circle(0, 0, 4.8 * s, 0, 0.95 * s, true);
  c.circle(0, 0, 0.9 * s, 0, 5.6 * s);
  return g;
}

function ponte(l, c) {
  const d = l.data || {};
  const s = l.scale ?? 1;
  const g = new THREE.Group();
  const L = (d.comprimento ?? 10) * s + 2.4, Wd = (d.largura ?? 4) * s;
  const rust = !!d.rustica;
  if (rust) {
    const n = Math.round(Wd / 0.42);
    for (let i = 0; i < n; i++) add(g, G.cyl8, c.M(i % 2 ? '#c49067' : '#b98058'), -Wd / 2 + (i + 0.5) * Wd / n, -0.12, 0, 0.21, L, 0.21, Math.PI / 2);
  } else {
    add(g, rbox(Wd, 0.3, L, 0.1), c.M('#e7c49d'), 0, -0.15, 0);
    for (let i = 0; i < Math.round(L / 0.6); i++) add(g, G.box, c.M('#d2a77d'), 0, 0.005, -L / 2 + 0.3 + i * 0.6, Wd - 0.1, 0.02, 0.05).userData.noShadow = true;
    // arco por baixo
    const arc = new THREE.TorusGeometry(L * 0.42, 0.35, 8, 24, Math.PI);
    for (const sx of [-1, 1]) add(g, arc, c.M('#f0d6c0'), sx * (Wd / 2 - 0.3), -L * 0.42 + 0.0, 0, 1, 0.42, 1, 0, Math.PI / 2, 0);
  }
  // corrimãos arqueados com postinhos
  for (const sx of [-1, 1]) {
    const x = sx * (Wd / 2 + 0.05);
    const nPost = Math.max(3, Math.round(L / 1.6));
    for (let i = 0; i <= nPost; i++) {
      const z = -L / 2 + (i / nPost) * L;
      const h = 0.95 + Math.sin((i / nPost) * Math.PI) * 0.25;
      if (rust) add(g, G.cyl8, c.M(WOOD_D), x, h / 2 - 0.1, z, 0.1, h, 0.1);
      else {
        add(g, G.cyl8, c.M(WHITE), x, h / 2 - 0.1, z, 0.08, h, 0.08);
        add(g, G.sphereLo, c.M(i % 2 ? '#ffb3d1' : '#a0d8ef'), x, h - 0.05, z, 0.13);
      }
    }
    for (let i = 0; i < nPost; i++) {
      const z0 = -L / 2 + (i / nPost) * L, z1 = -L / 2 + ((i + 1) / nPost) * L;
      const h0 = 0.95 + Math.sin((i / nPost) * Math.PI) * 0.25, h1 = 0.95 + Math.sin(((i + 1) / nPost) * Math.PI) * 0.25;
      beam(g, c.M(rust ? '#cfa77a' : WHITE), x, h0 - 0.12, z0, x, h1 - 0.12, z1, rust ? 0.045 : 0.06);
    }
    c.box(x, 0, 0.12, L / 2, 0, 1.15, false, -0.6);
  }
  // olhinhos nos pilares da entrada
  for (const sz of [-1, 1]) {
    for (const sx of [-1, 1]) add(g, rbox(0.42, 1.3, 0.42, 0.1), c.M(rust ? WOOD_D : '#f2e7f7'), sx * (Wd / 2 + 0.05), 0.55, sz * (L / 2 + 0.1));
    c.eyes(g, { x: -(Wd / 2 + 0.05), y: 1.0, z: sz * (L / 2 + 0.33), size: 0.1, ry: sz > 0 ? 0 : Math.PI, far: 60 });
  }
  return g;
}

// ------------------------------------------------------------------------------------------
// PEQUENOS (placas, bancos, postes, caixinhas...)
const DIRS = { N: [0, -1], S: [0, 1], L: [1, 0], O: [-1, 0] };
function placa(l, c) {
  const g = new THREE.Group();
  const text = l.name || '';
  const parts = text.split(' · ').map((t) => t.match(/^([NSLO]):\s*(.+)$/)).filter(Boolean);
  add(g, G.cyl8, c.M(WOOD_D), 0, 1.25, 0, 0.09, 2.5, 0.09);
  add(g, G.sphereLo, c.M('#ffb3d1'), 0, 2.55, 0, 0.16);
  c.eyes(g, { x: 0, y: 2.25, z: 0.08, size: 0.07, far: 40 });
  if (parts.length >= 2) {   // poste de setas apontando para as direções de verdade
    const rot = l.rotY ?? 0;
    parts.forEach((m, i) => {
      const [dx, dz] = DIRS[m[1]];
      const yaw = Math.atan2(-dz, dx) - rot;
      const arm = new THREE.Group();
      arm.position.y = 2.0 - i * 0.42;
      arm.rotation.y = yaw;
      add(arm, rbox(1.6, 0.34, 0.08, 0.05), c.M('#ffe9c7'), 0.9, 0, 0);
      add(arm, G.cone4, c.M('#ffe9c7'), 1.82, 0, 0, 0.24, 0.3, 0.06, 0, Math.PI / 4, -Math.PI / 2);
      const txt = placaTexto(arm, c, m[2], 0.9, 0, 0.05, 1.5, 0.3, 0, { size: 60, bg: '#ffe9c7', border: '#ffe9c7' });
      const back = txt.clone(); back.position.z = -0.05; back.rotation.y = Math.PI; arm.add(back);
      g.add(arm);
    });
  } else {
    add(g, rbox(1.9, 0.95, 0.12, 0.12), c.M(WOOD_D), 0, 1.75, 0);
    placaTexto(g, c, text, 0, 1.75, 0.07, 1.78, 0.84, 0);
    placaTexto(g, c, text, 0, 1.75, -0.07, 1.78, 0.84, Math.PI);
  }
  c.circle(0, 0, 0.2, 0, 2.6);
  return g;
}

function banco(l, c) {
  const g = new THREE.Group();
  const city = l.region === 'cidade';
  const wood = city ? '#ffd6e8' : WOOD, leg = city ? WHITE : WOOD_D;
  for (let i = 0; i < 3; i++) add(g, rbox(1.9, 0.1, 0.19, 0.04), c.M(wood), 0, 0.47, -0.2 + i * 0.2);
  for (let i = 0; i < 2; i++) add(g, rbox(1.9, 0.17, 0.08, 0.04), c.M(wood), 0, 0.72 + i * 0.24, -0.33 - i * 0.03, 1, 1, 1, -0.15);
  for (const s of [-1, 1]) {
    add(g, G.box, c.M(leg), s * 0.8, 0.22, 0.1, 0.08, 0.45, 0.08);
    add(g, G.box, c.M(leg), s * 0.8, 0.5, -0.3, 0.08, 1.0, 0.08, -0.15);
    add(g, G.torusThin, c.M(leg), s * 0.88, 0.62, 0, 0.22, 0.22, 1.5, 0, Math.PI / 2, 0);
  }
  add(g, rbox(0.6, 0.12, 0.42, 0.06), c.M('#ffb3d1'), -0.45, 0.56, 0);   // almofadinha
  c.eyes(g, { x: 0, y: 1.0, z: -0.28, size: 0.08, far: 35 });
  c.box(0, 0, 0.95, 0.35, 0, 0.53, true);
  return g;
}

function poste(l, c) {
  const g = new THREE.Group();
  const col = l.region === 'cidade' ? '#d3b8ff' : l.region === 'pico' ? '#9ad1ff' : '#b5ead7';
  add(g, G.cylTaper, c.M(col), 0, 0.25, 0, 0.22, 0.5, 0.22, Math.PI);
  add(g, G.cyl8, c.M(col), 0, 1.75, 0, 0.07, 3.0, 0.07);
  add(g, G.torusThin, c.M(col), 0.32, 3.25, 0, 0.32, 0.32, 1.2, 0, 0, 0);
  // lanterna com cílios (frente = +Z: olha para a trilha)
  const lamp = new THREE.Group(); lamp.position.set(0.64, 3.0, 0);
  add(lamp, G.hemi, c.M(col), 0, 0.15, 0, 0.3, 0.2, 0.3);
  add(lamp, G.sphere, c.lampMat(), 0, -0.05, 0, 0.24, 0.27, 0.24);
  for (let i = -2; i <= 2; i++) {
    const a = i * 0.42;
    add(lamp, G.capsule, c.M(INK), Math.sin(a) * 0.28, 0.12, Math.cos(a) * 0.28, 0.05, 0.16, 0.05, Math.cos(a) * 0.9, 0, -Math.sin(a) * 0.9);
  }
  g.add(lamp);
  c.lamp(g, 0.64, 2.95, 0);
  c.circle(0, 0, 0.18, 0, 3.3);
  return g;
}

function cerca(l, c) {
  const g = new THREE.Group();
  const len = (l.data?.comprimento ?? 6) * (l.scale ?? 1);
  const n = Math.max(2, Math.round(len / 0.5));
  for (let i = 0; i <= n; i++) {
    const x = -len / 2 + (i / n) * len;
    add(g, G.box, c.M(WHITE), x, 0.42, 0, 0.12, 0.84, 0.07);
    add(g, G.cone4, c.M(WHITE), x, 0.92, 0, 0.085, 0.16, 0.05, 0, Math.PI / 4, 0);
  }
  for (const y of [0.3, 0.62]) add(g, rbox(len, 0.09, 0.06, 0.03), c.M('#fff1f6'), 0, y, -0.06);
  c.box(0, 0, len / 2, 0.12, 0, 0.95);
  return g;
}

function poco(l, c) {
  const g = new THREE.Group();
  const ring = new THREE.LatheGeometry([[1.0, 0], [1.25, 0], [1.3, 0.85], [1.15, 0.95], [1.0, 0.9]].map(([x, y]) => new THREE.Vector2(x, y)), 24);
  add(g, ring, c.M('#d9d3ea'));
  for (let i = 0; i < 10; i++) add(g, G.box, c.M('#c8c0dc'), Math.cos(i * 0.628) * 1.28, 0.45, Math.sin(i * 0.628) * 1.28, 0.04, 0.9, 0.3, 0, -i * 0.628, 0);
  add(g, G.disc, c.M('#6fb8d9', { emissive: '#3f8fb8', emissiveIntensity: 0.15 }), 0, 0.55, 0, 1.0, 0.05, 1.0);
  for (const s of [-1, 1]) add(g, G.cyl8, c.M(WOOD_D), s * 1.1, 1.5, 0, 0.08, 2.0, 0.08);
  telhado(g, c, 2.6, 1.8, 2.45, 0.9, WOOD, '#ff8fa3', 0.25);
  add(g, G.cyl8, c.M(WOOD_D), 0, 2.15, 0, 0.07, 2.4, 0.07, 0, 0, Math.PI / 2);
  add(g, G.cylTaper, c.M('#c98f5e'), 0, 1.45, 0, 0.22, 0.32, 0.22, Math.PI);
  c.eyes(g, { x: 0, y: 2.85, z: 0.93, size: 0.12, lashes: true, far: 60 });
  c.circle(0, 0, 1.32, 0, 3.4);
  return g;
}

function caixaCorreio(l, c) {
  const g = new THREE.Group();
  add(g, G.cyl8, c.M(WOOD_D), 0, 0.45, 0, 0.07, 0.9, 0.07);
  add(g, rbox(0.5, 0.42, 0.65, 0.12), c.M('#7fb8ff'), 0, 1.05, 0);
  add(g, G.cyl, c.M('#7fb8ff'), 0, 1.25, 0, 0.25, 0.65, 0.25, Math.PI / 2);
  add(g, G.box, c.M('#ff5d73'), 0.28, 1.25, -0.1, 0.03, 0.4, 0.06);
  add(g, G.box, c.M('#ff5d73'), 0.28, 1.4, -0.0, 0.03, 0.12, 0.2);
  add(g, G.box, c.M('#2b2140'), 0, 1.02, 0.33, 0.3, 0.05, 0.01);
  c.eyes(g, { x: 0, y: 1.22, z: 0.33, size: 0.08, lashes: true, far: 45 });
  c.circle(0, 0, 0.3, 0, 1.4);
  return g;
}

function casinhaPassaro(l, c) {
  const g = new THREE.Group();
  const s = l.scale ?? 1;
  g.scale.setScalar(s);
  const col = c.accent(Math.floor(c.rng() * 5));
  add(g, G.cyl8, c.M(WOOD_D), 0, 0.85, 0, 0.07, 1.7, 0.07);
  add(g, rbox(0.62, 0.6, 0.55, 0.08), c.M(col), 0, 1.95, 0);
  telhado(g, c, 0.62, 0.55, 2.24, 0.34, col, '#ff8fa3', 0.12);
  add(g, G.disc, c.M('#3a2740'), 0, 1.92, 0.28, 0.13, 0.02, 0.13, Math.PI / 2);
  add(g, G.cyl8, c.M(WOOD_D), 0, 1.72, 0.36, 0.025, 0.2, 0.025, Math.PI / 2);
  c.eyes(g, { x: 0, y: 2.14, z: 0.29, size: 0.06, far: 45 * s });
  if (l.data?.placa) {
    add(g, G.box, c.M(WOOD_D), 0, 1.25, 0.05, 0.05, 0.05, 0.1);
    placaTexto(g, c, l.data.placa, 0, 1.25, 0.11, 0.85, 0.32, 0, { size: 48 });
    for (const sx of [-0.55, 0.55]) add(g, G.sphereLo, c.M('#e8c9a0'), sx, 0.14, 0.3, 0.18, 0.13, 0.13);   // saquinhos de carta
  }
  c.circle(0, 0, 0.12 * s + 0.05, 0, 2.5 * s);
  return g;
}

function cataVento(l, c) {
  const g = new THREE.Group();
  const s = l.scale ?? 1;
  g.scale.setScalar(s);
  add(g, G.cyl8, c.M(WHITE), 0, 1.6, 0, 0.07, 3.2, 0.07);
  const wheel = dyn('cata_vento');
  wheel.position.set(0, 3.25, 0.12);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU;
    const b = new THREE.Group(); b.rotation.z = a;
    add(b, G.cone4, c.M(c.accent(i)), 0.33, 0.12, 0, 0.32, 0.72, 0.05, 0, 0, -0.6);
    wheel.add(b);
  }
  add(wheel, G.sphere, c.M('#ffd166'), 0, 0, 0.05, 0.13);
  g.add(wheel);
  c.eyes(g, { x: 0, y: 3.27, z: 0.27, size: 0.045, far: 40 });
  const ph = c.rng() * 6;
  c.anim((dt) => { wheel.rotation.z -= dt * (2.2 + Math.sin(c.time() * 0.3 + ph) * 1.2); }, l.x, l.z, 90);
  c.circle(0, 0, 0.12 * s, 0, 3.2 * s);
  return g;
}

function moinho(l, c) {
  const g = new THREE.Group();
  const s = l.scale ?? 1;
  g.scale.setScalar(s);
  add(g, G.cyl, c.M('#e3d8ee'), 0, 0.35, 0, 2.9, 0.7, 2.9);
  add(g, G.cylTaper, c.M('#fff6ea'), 0, 3.8, 0, 2.5, 6.8, 2.5);
  add(g, G.torus, c.M('#ffb3d1'), 0, 2.4, 0, 2.48, 2.48, 0.6, Math.PI / 2);
  add(g, G.cone, c.M('#ff8fa3'), 0, 8.1, 0, 2.35, 2.2, 2.35);
  add(g, G.sphereLo, c.M('#ffd166'), 0, 9.3, 0, 0.25);
  porta(g, c, 0, 0.7, 2.4, 1.1, 1.9, '#c9845e');
  for (const [a, y] of [[35, 4.2], [-35, 4.2], [180, 3.6]]) janela(g, c, Math.sin(a * D2R) * 2.18, y, Math.cos(a * D2R) * 2.18, 0.7, 0.7, a * D2R, true);
  c.eyes(g, { x: 0, y: 4.9, z: 2.15, size: 0.42, lashes: true, far: 160 });
  for (const sx of [-1, 1]) add(g, G.sphereLo, c.M('#ffb3c7'), sx * 0.85, 4.35, 2.05, 0.26, 0.15, 0.06);
  const sails = dyn('pas');
  sails.position.set(0, 6.9, 2.35);
  add(sails, G.cyl, c.M(WOOD_D), 0, 0, -0.3, 0.2, 0.8, 0.2, Math.PI / 2);
  add(sails, G.sphere, c.M('#ffd166'), 0, 0, 0.12, 0.3);
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Group(); b.rotation.z = (i / 4) * TAU + 0.3;
    add(b, G.box, c.M(WOOD_D), 0, 2.4, 0, 0.13, 4.8, 0.08);
    add(b, rbox(1.25, 3.6, 0.07, 0.15), c.M(['#ffd6e8', '#fff3b0', '#d9ecff', '#e2d1ff'][i]), 0.72, 2.9, 0.02);
    for (let k = 0; k < 4; k++) add(b, G.box, c.M(WOOD), 0.72, 1.4 + k * 0.95, 0.07, 1.3, 0.05, 0.03);
    sails.add(b);
  }
  g.add(sails);
  c.anim((dt) => { sails.rotation.z -= dt * 0.35; }, l.x, l.z, 260);
  c.circle(0, 0, 2.9 * s, 0, 9 * s);
  return g;
}

function horta(l, c) {
  const g = new THREE.Group();
  const name = l.name || '';
  const kind = /cenoura/i.test(name) ? 'cenoura' : /tomat/i.test(name) ? 'tomate' : 'couve';
  const W = 6, D = 4;
  add(g, rbox(W, 0.35, D, 0.12), c.M('#9b6b4b'), 0, 0.12, 0);
  for (const sz of [-1, 1]) add(g, G.box, c.M(WOOD), 0, 0.25, sz * (D / 2 + 0.06), W + 0.2, 0.42, 0.14);
  for (const sx of [-1, 1]) add(g, G.box, c.M(WOOD), sx * (W / 2 + 0.06), 0.25, 0, 0.14, 0.42, D + 0.2);
  const rows = 3, cols = 6;
  let eyed = 0;
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      const x = -W / 2 + 0.6 + k * (W - 1.2) / (cols - 1), z = -D / 2 + 0.75 + r * (D - 1.5) / (rows - 1);
      if (kind === 'couve') {
        add(g, G.sphere, c.M(k % 2 ? '#8fdc7a' : '#7fcf6a'), x, 0.5, z, 0.36, 0.3, 0.36);
        for (let i = 0; i < 4; i++) add(g, G.sphereLo, c.M('#a6e88c'), x + Math.cos(i * 1.57) * 0.3, 0.42, z + Math.sin(i * 1.57) * 0.3, 0.22, 0.08, 0.16, 0, -i * 1.57, 0.4);
      } else if (kind === 'cenoura') {
        add(g, G.cone, c.M('#ff9f45'), x, 0.42, z, 0.15, 0.3, 0.15, Math.PI);
        for (let i = 0; i < 3; i++) add(g, G.capsule, c.M('#6fcf5a'), x + (i - 1) * 0.06, 0.75, z, 0.07, 0.42, 0.07, 0, 0, (i - 1) * 0.35);
      } else {
        add(g, G.cyl8, c.M(WOOD), x, 0.85, z, 0.03, 1.2, 0.03);
        add(g, G.sphereLo, c.M('#6fcf5a'), x, 0.85, z, 0.3, 0.5, 0.3);
        for (let i = 0; i < 3; i++) add(g, G.sphere, c.M('#ff5a5f'), x + Math.cos(i * 2.1) * 0.22, 0.65 + i * 0.22, z + Math.sin(i * 2.1) * 0.22, 0.13);
      }
      if ((r * cols + k) % 7 === 3 && eyed < 3) {
        eyed++;
        c.eyes(g, { x, y: kind === 'tomate' ? 0.9 : 0.6, z: z + (kind === 'couve' ? 0.34 : 0.18), size: 0.07, far: 40 });
      }
    }
  }
  return g;
}

function jardim(l, c) {
  const g = new THREE.Group();
  const s = l.scale ?? 1;
  g.scale.setScalar(s);
  const n = l.data?.canteiros ?? 5;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + 0.3;
    const x = Math.cos(a) * 3.2, z = Math.sin(a) * 3.2;
    const bed = new THREE.Group(); bed.position.set(x, 0, z); bed.rotation.y = -a;
    add(bed, rbox(1.3, 0.3, 2.0, 0.15), c.M('#a5795a'), 0, 0.12, 0);
    add(bed, rbox(1.45, 0.2, 2.15, 0.1), c.M('#f0e2cf'), 0, 0.05, 0);
    for (let k = 0; k < 6; k++) {
      const fx = (k % 2 - 0.5) * 0.6, fz = -0.75 + Math.floor(k / 2) * 0.75;
      add(bed, G.cyl8, c.M('#6cc46a'), fx, 0.45, fz, 0.025, 0.5, 0.025);
      add(bed, G.sphereLo, c.M(c.accent(i + k)), fx, 0.74, fz, 0.17, 0.12, 0.17);
      add(bed, G.sphereLo, c.M('#ffd166'), fx, 0.8, fz, 0.06);
    }
    g.add(bed);
  }
  // relógio de sol fofinho no meio (com olhinhos)
  add(g, G.cylTaper, c.M('#e6dccf'), 0, 0.45, 0, 0.35, 0.9, 0.35, Math.PI);
  add(g, G.disc, c.M('#f6efe4'), 0, 0.93, 0, 0.55, 0.08, 0.55);
  add(g, G.cone4, c.M('#ffb3d1'), 0, 1.12, 0, 0.04, 0.32, 0.22, 0, 0, 0);
  c.eyes(g, { x: 0, y: 0.62, z: 0.3, size: 0.07, far: 40 });
  return g;
}

// ------------------------------------------------------------------------------------------
// NATUREZA
const NINHAL_GREENS = ['#5fbf72', '#6fcf80', '#7ed98a', '#69c98f', '#8fe08f'];
/** Tufo de copa: bolotas de folhagem em volta de (x,y,z). */
function copa(g, c, x, y, z, R, colors, rng, n = 7) {
  add(g, G.ico, c.M(colors[0], { flat: false }), x, y, z, R, R * 0.82, R);
  for (let i = 0; i < n; i++) {
    const a = rng() * TAU, el = (rng() - 0.3) * 1.1;
    const r = R * (0.55 + rng() * 0.35);
    add(g, G.ico, c.M(colors[1 + (i % (colors.length - 1))]), x + Math.cos(a) * Math.cos(el) * R * 0.75, y + Math.sin(el) * R * 0.6, z + Math.sin(a) * Math.cos(el) * R * 0.75, r, r * 0.85, r);
  }
}

function arvoreGigante(l, c) {
  const d = l.data || {};
  const g = new THREE.Group();
  const rng = c.rng;
  const tr = d.trunkRadius ?? 3, H = d.height ?? 20, s = l.scale ?? 1;
  const bark = d.variante === 'retorcida' ? '#b7a2c9' : l.region === 'ninhal' ? '#a8794f' : '#b98a6a';
  const barkD = d.variante === 'retorcida' ? '#9d86b3' : '#8f6340';
  const greens = d.variante === 'retorcida' ? ['#ffc6e0', '#ffb3d6', '#ffd9ec', '#fff0f7'] : d.variante === 'cafe' ? ['#7ed98a', '#94e07f', '#a6e88c', '#ffd6a5'] : NINHAL_GREENS;
  // tronco (nunca mais grosso que trunkRadius: o colisor e as plataformas usam esse raio)
  const segs = d.variante === 'retorcida' ? 5 : 1;
  if (segs === 1) {
    const tg = new THREE.CylinderGeometry(tr * 0.66, tr * 0.97, H, 22, 8);
    const p = tg.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const a = Math.atan2(z, x);
      const k = 1 - 0.07 * (0.5 + 0.5 * Math.sin(a * 5 + y * 0.35)) - 0.03 * (0.5 + 0.5 * Math.sin(a * 11 - y * 0.8));
      p.setXYZ(i, x * k, y, z * k);
    }
    tg.computeVertexNormals();
    add(g, tg, c.M(bark), 0, H / 2, 0);
  } else {
    let px = 0, pz = 0;
    for (let i = 0; i < segs; i++) {
      const nx = Math.sin(i * 1.7) * tr * 0.35, nz = Math.cos(i * 1.3) * tr * 0.35;
      const r = tr * (0.95 - i * 0.08);
      beam(g, c.M(i % 2 ? bark : barkD), px, (i / segs) * H - 0.3, pz, nx, ((i + 1) / segs) * H + 0.3, nz, r * 0.8, G.cyl);
      add(g, G.sphere, c.M(bark), nx, ((i + 1) / segs) * H, nz, r * 0.8);
      px = nx; pz = nz;
    }
  }
  // raízes
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + rng() * 0.3;
    beam(g, c.M(barkD), Math.cos(a) * tr * 0.5, 1.6, Math.sin(a) * tr * 0.5, Math.cos(a) * (tr + 1.3), -0.15, Math.sin(a) * (tr + 1.3), tr * 0.22, G.cyl8);
  }
  // musguinho (o tronco retorcido não é um cilindro reto: sem musgo)
  for (let i = 0; i < (segs === 1 ? 5 : 0); i++) {
    const a = rng() * TAU, y = 1 + rng() * H * 0.6;
    add(g, G.sphereLo, c.M('#8fdc7a'), Math.cos(a) * tr * 0.82, y, Math.sin(a) * tr * 0.82, tr * 0.28, 0.25, tr * 0.28);
  }
  // copa
  const isMae = d.copa && /leque/.test(d.copa);
  if (isMae) {
    // leque de folhas logo ABAIXO do piso do Ninho-Coreto (topo das bolotas < piso), longe das folhas-plataforma
    // (que ficam a ~6 m do tronco) e do último trampolim (9,5 m): o coreto parece pousado em cima da copa.
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * TAU + 0.15;
      const R = 16 + (i % 2) * 2.5, rr = 4.0 + (i % 3) * 0.5;
      const x = Math.cos(a) * R, z = Math.sin(a) * R, y = H - 1.4 - rr * 0.82 - (i % 2) * 0.8;
      beam(g, c.M(bark), Math.cos(a) * tr * 0.5, H - 4, Math.sin(a) * tr * 0.5, x * 0.8, y - 0.6, z * 0.8, 0.45, G.cyl8);
      copa(g, c, x, y, z, rr, greens, rng, 6);
    }
  } else {
    const R = (3.6 + tr * 1.25) * Math.sqrt(s);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + rng();
      const ex = Math.cos(a) * R * 0.8, ez = Math.sin(a) * R * 0.8, ey = H + R * 0.25;
      beam(g, c.M(bark), 0, H - 1, 0, ex, ey, ez, tr * 0.22, G.cyl8);
      copa(g, c, ex, ey + R * 0.35, ez, R * 0.55, greens, rng, 4);
    }
    copa(g, c, 0, H + R * 0.75, 0, R * 0.8, greens, rng, 8);
    // florzinhas na copa
    for (let i = 0; i < 12; i++) {
      const a = rng() * TAU, el = rng() * 1.2;
      add(g, G.sphereLo, c.M(i % 2 ? '#ffb3d1' : '#fff3a3'), Math.cos(a) * Math.cos(el) * R * 1.0, H + R * 0.6 + Math.sin(el) * R * 0.6, Math.sin(a) * Math.cos(el) * R * 1.0, 0.35);
    }
  }
  // xicrinhas penduradas (Árvore-Café)
  if (d.variante === 'cafe') {
    const n = d.xicaras ?? 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, r = tr + 2.2 + (i % 2) * 1.6, y = H - 1.4 - (i % 3) * 0.9;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      beam(g, c.M('#8f6340'), x, H + 1.5, z, x, y + 0.5, z, 0.03, G.cyl8);
      const cup = new THREE.Group(); cup.position.set(x, y, z); cup.rotation.y = -a + Math.PI / 2;
      add(cup, G.cylTaper, c.M(['#ffffff', '#ffd6e8', '#d9ecff', '#fff3b0'][i % 4]), 0, 0, 0, 0.42, 0.5, 0.42);
      add(cup, G.torus, c.M(WHITE), 0.45, 0.02, 0, 0.17, 0.17, 0.6);
      add(cup, G.disc, c.M('#c88b5e'), 0, 0.24, 0, 0.36, 0.02, 0.36);
      if (i % 3 === 0) c.eyes(cup, { x: 0, y: 0.02, z: 0.38, size: 0.08, far: 50 });
      g.add(cup);
    }
  }
  // ninhos extras nos galhos
  for (let i = 0; i < (d.ninhos ?? 0); i++) {
    const a = (i / (d.ninhos)) * TAU + 0.7, r = tr + 1.8;
    const nest = new THREE.Group(); nest.position.set(Math.cos(a) * r, H * 0.75 + i, Math.sin(a) * r);
    add(nest, G.torus, c.M('#c79a6b'), 0, 0, 0, 0.6, 0.6, 1.2, Math.PI / 2);
    add(nest, G.disc, c.M('#b5865a'), 0, -0.05, 0, 0.55, 0.15, 0.55);
    beam(g, c.M(bark), 0, H * 0.75 + i - 0.6, 0, nest.position.x, nest.position.y - 0.2, nest.position.z, 0.25, G.cyl8);
    g.add(nest);
  }
  // oco iluminado (casa da Dona Plumínia)
  if (d.oco) {
    const a = d.oco.angulo * D2R, y = d.oco.y - c.gy;
    const rr = tr * 0.82;
    const hole = new THREE.Group();
    hole.position.set(Math.cos(a) * rr, y + 1.1, Math.sin(a) * rr);
    hole.rotation.y = Math.atan2(Math.cos(a), Math.sin(a));
    add(hole, G.sphere, c.M('#3a2418'), 0, 0, 0.05, 0.85, 1.25, 0.5);
    add(hole, G.sphere, c.win(), 0, -0.1, 0.12, 0.62, 0.95, 0.4);
    add(hole, G.torus, c.M(barkD), 0, 0, 0.18, 0.9, 1.3, 1.5);
    add(hole, G.box, c.M('#ff8fab'), 0, 1.6, 0.4, 0.9, 0.35, 0.06);   // plaquinha
    g.add(hole);
    if (d.lanterna) {
      const lx = Math.cos(a + 0.35) * (tr + 0.5), lz = Math.sin(a + 0.35) * (tr + 0.5);
      beam(g, c.M(barkD), Math.cos(a + 0.35) * rr, y + 2.8, Math.sin(a + 0.35) * rr, lx, y + 2.6, lz, 0.1, G.cyl8);
      add(g, G.sphere, c.lampMat(), lx, y + 2.1, lz, 0.25, 0.32, 0.25);
      add(g, G.hemi, c.M('#ffd166'), lx, y + 2.38, lz, 0.28, 0.16, 0.28);
      c.lamp(g, lx, y + 2.0, lz);
    }
  }
  // olhos no tronco virados para a trilha (longe do oco)
  let yaw = c.faceYaw(l.x, l.z);
  if (d.oco) {
    const oy = Math.atan2(Math.cos(d.oco.angulo * D2R), Math.sin(d.oco.angulo * D2R));
    if (Math.abs(Math.atan2(Math.sin(yaw - oy), Math.cos(yaw - oy))) < 0.9) yaw = oy + 1.2;
  }
  const ey = Math.min(H * 0.32, isMae ? 7 : 4.6);
  const er = tr * 0.9 * (1 - 0.34 * (ey / H));
  const eyeSize = Math.min(1.0, 0.3 + tr * 0.13);
  c.eyes(g, { x: Math.sin(yaw) * er, y: ey, z: Math.cos(yaw) * er, ry: yaw, size: eyeSize, lashes: rng() < 0.5, far: 150 });
  for (const sx of [-1, 1]) {
    const a = yaw + sx * 0.32;
    add(g, G.sphereLo, c.M('#e59a7a'), Math.sin(a) * er, ey - eyeSize * 1.2, Math.cos(a) * er, eyeSize * 0.55, eyeSize * 0.3, eyeSize * 0.2, 0, a, 0);
  }
  c.circle(0, 0, tr, 0, H - 0.05);   // topo = altura do tronco (o Ninho-Coreto fica em cima da Árvore-Mãe)
  return g;
}

function ninhoCoreto(l, c) {
  const d = l.data || {};
  const g = new THREE.Group();
  const R = d.raio ?? 7, floorY = d.y ?? 34;
  g.position.y = floorY - c.gy;     // o construtor posiciona no chão; o coreto fica no alto
  const ent = (d.entrada ?? 190) * D2R;
  const entYaw = Math.atan2(Math.cos(ent), Math.sin(ent));
  // piso
  add(g, G.cyl, c.M('#b5865a'), 0, -0.45, 0, R + 0.3, 0.9, R + 0.3);
  add(g, G.disc, c.M('#e8c9a0'), 0, -0.02, 0, R, 0.06, R);
  add(g, G.disc, c.M('#ffd6e8'), 0, 0.02, 0, R * 0.55, 0.04, R * 0.55);
  add(g, G.sphere, c.M('#a8794f'), 0, -1.2, 0, R * 0.9, 1.6, R * 0.9);
  // parapeito trançado com abertura na entrada
  const gap = 0.55;
  const arc = TAU - gap * 2;
  const tor = new THREE.TorusGeometry(R + 0.2, 0.7, 10, 48, arc);
  // Deitado (rotX -90°) o parâmetro φ do torus vira o ângulo polar -φ; girando θ em Y o arco cobre
  // [-arc-θ, -θ] e a abertura fica em [-θ, -θ+2·gap] — com θ = gap - ent ela fica centrada na entrada.
  const rimHolder = new THREE.Group(); rimHolder.rotation.y = gap - ent; g.add(rimHolder);
  add(rimHolder, tor, c.M('#c79a6b'), 0, 0.35, 0, 1, 1, 1, -Math.PI / 2, 0, 0);
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * TAU;
    let da = Math.abs(Math.atan2(Math.sin(a - ent), Math.cos(a - ent)));
    if (da < gap + 0.1) continue;
    beam(g, c.M(i % 2 ? '#a8794f' : '#d9b48f'), Math.cos(a) * (R - 0.2), 0.1, Math.sin(a) * (R - 0.2), Math.cos(a + 0.25) * (R + 1.0), 1.05, Math.sin(a + 0.25) * (R + 1.0), 0.07, G.cyl8);
    c.circle(Math.cos(a) * (R + 0.25), Math.sin(a) * (R + 0.25), 0.75, floorY - 0.6, floorY + 1.05, true, true);
  }
  // coreto: colunas listradas, cúpula em gomos, sino e bandeirinhas
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.2;
    if (Math.abs(Math.atan2(Math.sin(a - ent), Math.cos(a - ent))) < 0.35) continue;
    const x = Math.cos(a) * (R - 1.3), z = Math.sin(a) * (R - 1.3);
    add(g, G.cyl8, c.M(WHITE), x, 1.9, z, 0.16, 3.8, 0.16);
    for (let k = 0; k < 4; k++) add(g, G.torusThin, c.M('#ff9cc4'), x, 0.5 + k * 0.95, z, 0.19, 0.19, 1.6, Math.PI / 2, 0, 0.3);
    c.circle(x, z, 0.22, floorY, floorY + 4, false, true);
  }
  for (let i = 0; i < 12; i++) {
    const wedge = new THREE.ConeGeometry(R + 0.3, 2.8, 2, 1, true, (i / 12) * TAU, TAU / 12);
    add(g, wedge, c.M(i % 2 ? '#fff3b0' : '#ffb8de', { side: THREE.DoubleSide }), 0, 5.2, 0);
  }
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU;
    add(g, G.sphereLo, c.M(i % 2 ? '#ffd6e8' : WHITE), Math.cos(a) * (R + 0.2), 3.8, Math.sin(a) * (R + 0.2), 0.4, 0.28, 0.4);
  }
  add(g, G.sphere, c.M('#ffd166'), 0, 6.9, 0, 0.45);
  add(g, G.cone, c.M('#ffd166'), 0, 3.4, 0, 0.55, 0.7, 0.55);
  add(g, G.sphereLo, c.M('#ffb703'), 0, 3.0, 0, 0.14);
  for (let i = 0; i < 16; i++) {   // bandeirinhas
    const a = (i / 16) * TAU;
    add(g, G.cone4, c.M(c.accent(i)), Math.cos(a) * (R - 0.4), 3.25, Math.sin(a) * (R - 0.4), 0.22, 0.4, 0.04, Math.PI, -a + Math.PI / 2, 0);
  }
  // olhos na cúpula virados para a entrada (quem chega pelo último trampolim é recebido com um olhar)
  const eyaw = entYaw + 0.9;   // cúpula: cone de raio R+0,3 de y 3,8 a 6,6 — olhos encostados na superfície
  const er = R - 2.2, eyY = 3.8 + 2.8 * (1 - er / (R + 0.3)) + 0.12;
  c.eyes(g, { x: Math.sin(eyaw) * er, y: eyY, z: Math.cos(eyaw) * er, ry: eyaw, rx: -0.36, size: 0.6, lashes: true, far: 260 });
  return g;
}

function ninho(l, c) {
  const d = l.data || {};
  const g = new THREE.Group();
  const s = l.scale ?? 1;
  const elevated = d.y !== undefined && d.sobre;
  if (elevated) {
    g.position.y = d.y - c.gy;
    const tree = LANDMARKS.find((t) => t.id === d.sobre);
    if (tree) {   // galho até o tronco
      const dx = tree.x - l.x, dz = tree.z - l.z, dist = Math.hypot(dx, dz);
      const tr = tree.data?.trunkRadius ?? 3;
      const k = Math.max(0, (dist - tr * 0.6) / dist);
      beam(g, c.M('#8f6340'), 0, -0.4, 0, dx * k, 0.6, dz * k, 0.35, G.cyl8);
    }
  }
  const nest = (parent, full) => {
    add(parent, G.torus, c.M('#c79a6b'), 0, 0.3, 0, 1.0, 1.0, 1.5, Math.PI / 2);
    add(parent, G.sphere, c.M('#a8794f'), 0, 0.1, 0, 1.0, 0.45, 1.0);
    add(parent, G.disc, c.M('#e8c9a0'), 0, 0.3, 0, 0.85, 0.05, 0.85);
    const twigs = full ? 14 : 6;
    for (let i = 0; i < twigs; i++) {
      const a = (i / twigs) * TAU + c.rng() * 0.3;
      beam(parent, c.M(i % 2 ? '#a8794f' : '#d9b48f'), Math.cos(a) * 0.7, 0.15, Math.sin(a) * 0.7, Math.cos(a + 0.5) * 1.45, 0.55, Math.sin(a + 0.5) * 1.45, 0.04, G.cyl8);
    }
  };
  if (l.id === 'ninho_casal') {
    // dois estados: em obras (gravetos soltos + cone de obra) e pronto (com flores e telhadinho de folha)
    const obra = dyn('ninho_obra');
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU;
      beam(obra, c.M('#a8794f'), Math.cos(a) * 0.9, 0, Math.sin(a) * 0.9, Math.cos(a + 0.8) * 1.2, 0.5, Math.sin(a + 0.8) * 1.2, 0.05, G.cyl8);
    }
    add(obra, G.disc, c.M('#b5865a'), 0, 0.05, 0, 1.0, 0.12, 1.0);
    add(obra, G.cone, c.M('#ff9f45'), 0.8, 0.35, 0.5, 0.18, 0.5, 0.18);
    add(obra, G.cyl, c.M(WHITE), 0.8, 0.35, 0.5, 0.15, 0.08, 0.15);
    const pronto = dyn('ninho_pronto');
    nest(pronto, true);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      add(pronto, G.sphereLo, c.M(c.accent(i)), Math.cos(a) * 1.05, 0.62, Math.sin(a) * 1.05, 0.16);
    }
    add(pronto, G.sphere, c.M('#7ed98a'), 0, 1.7, -0.3, 1.25, 0.18, 1.0, 0.35);
    beam(pronto, c.M('#8f6340'), 0, 0.4, -0.9, 0, 1.6, -0.6, 0.05, G.cyl8);
    c.eyes(pronto, { x: 0, y: 0.6, z: 1.15, size: 0.13, lashes: true, far: 70 });
    pronto.visible = false;
    g.add(obra, pronto);
    g.scale.setScalar(s);
    c.setState(l.id, { obra, pronto });
    return g;
  }
  nest(g, true);
  g.scale.setScalar(s);
  if (l.id === 'ninho_mamae' || /bando/.test(l.id)) {
    for (let i = 0; i < (l.id === 'ninho_mamae' ? 0 : 2); i++) add(g, G.sphere, c.M(['#b8f27c', '#fff3b0'][i]), (i - 0.5) * 0.45, 0.45, 0, 0.22, 0.28, 0.22);
  }
  c.eyes(g, { x: 0, y: 0.5, z: 1.25, size: 0.12, lashes: c.rng() < 0.5, far: 60 });
  if (!elevated) c.circle(0, 0, 1.2 * s, 0, 0.7 * s, true);
  else c.circle(0, 0, 1.2 * s, d.y - 0.5, d.y + 0.45, true, true);
  return g;
}

function arvoreAlgodao(l, c) {
  const g = new THREE.Group();
  const s = l.scale ?? 1;
  g.scale.setScalar(s);
  const col = l.data?.cor ?? '#ffb3d9';
  add(g, G.cyl8, c.M(WHITE), 0, 1.3, 0, 0.14, 2.6, 0.14);
  for (let i = 0; i < 6; i++) add(g, G.torusThin, c.M('#ff8fc0'), 0, 0.3 + i * 0.4, 0, 0.15, 0.15, 1.6, Math.PI / 2, 0, 0.5);
  const lighter = new THREE.Color(col).lerp(new THREE.Color('#ffffff'), 0.35).getStyle();
  const puffs = [[0, 3.25, 0, 1.35], [0.95, 3.0, 0.2, 0.95], [-0.9, 3.05, -0.25, 0.9], [0.15, 4.2, -0.1, 0.85], [0.1, 3.15, 0.95, 0.8], [-0.3, 3.3, -0.9, 0.75]];
  puffs.forEach(([x, y, z, r], i) => add(g, G.ico, c.M(i === 3 ? lighter : col), x, y, z, r, r * 0.92, r));
  const sugar = new THREE.Group();
  for (let i = 0; i < 9; i++) {
    const a = i * 2.4, e = (i % 3) * 0.4;
    add(sugar, G.icoLo, c.M(WHITE, { emissive: '#ffffff', emissiveIntensity: 0.35 }), Math.cos(a) * 1.3 * Math.cos(e), 3.3 + Math.sin(e) * 1.1, Math.sin(a) * 1.3 * Math.cos(e), 0.06);
  }
  g.add(sugar);
  const yaw = c.faceYaw(l.x, l.z);
  c.eyes(g, { x: Math.sin(yaw) * 1.25, y: 3.25, z: Math.cos(yaw) * 1.25, ry: yaw, size: 0.2, lashes: true, far: 110 });
  for (const sx of [-1, 1]) add(g, G.sphereLo, c.M('#ff8fc0'), Math.sin(yaw + sx * 0.35) * 1.22, 2.98, Math.cos(yaw + sx * 0.35) * 1.22, 0.12, 0.07, 0.05, 0, yaw, 0);
  c.circle(0, 0, 0.2 * s, 0, 2.7 * s);
  return g;
}

let spiralTex = null;
function spiralTexture() {
  if (spiralTex) return spiralTex;
  const S = 256, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const cols = ['#ff6fa8', '#ffffff', '#7fd8ff', '#ffffff', '#fff07a', '#ffffff', '#c792ff', '#ffffff', '#8ef0c0', '#ffffff'];
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, S, S);
  for (let k = 0; k < cols.length; k++) {
    g.fillStyle = cols[k];
    g.beginPath();
    for (let t = 0; t <= 1.0001; t += 0.01) {
      const a = t * Math.PI * 6 + (k / cols.length) * TAU, r = t * S * 0.5;
      const x = S / 2 + Math.cos(a) * r, y = S / 2 + Math.sin(a) * r;
      if (t === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    for (let t = 1; t >= 0; t -= 0.01) {
      const a = t * Math.PI * 6 + ((k + 1) / cols.length) * TAU, r = t * S * 0.5;
      g.lineTo(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r);
    }
    g.fill();
  }
  spiralTex = new THREE.CanvasTexture(cv);
  spiralTex.colorSpace = THREE.SRGBColorSpace;
  return spiralTex;
}
let lollipopMat = null;

function pirulito(l, c) {
  const g = new THREE.Group();
  const s = l.scale ?? 1;
  const big = s >= 3;
  g.scale.setScalar(s);
  add(g, G.cyl8, c.M(WHITE), 0, 2.05, 0, 0.11, 4.1, 0.11);
  for (let i = 0; i < 8; i++) add(g, G.torusThin, c.M(c.accent(i)), 0, 0.3 + i * 0.45, 0, 0.12, 0.12, 1.5, Math.PI / 2, 0, 0.4);
  // disco em espiral (textura) que gira devagar — desbota na GPU (setRegionAttrs)
  if (!lollipopMat) {
    lollipopMat = patchMaterial(toon('#ffffff'), { key: 'pirulito' });
    lollipopMat.map = spiralTexture();
  }
  const disc = dyn('espiral');
  disc.position.set(0, 4.15, 0);
  const geo = setRegionAttrs(new THREE.CylinderGeometry(1.4, 1.4, 0.32, 48), l.x, l.z);
  geo.rotateX(Math.PI / 2);
  add(disc, geo, lollipopMat);
  add(disc, G.torus, c.M(WHITE), 0, 0, 0, 1.42, 1.42, 0.55);
  g.add(disc);
  for (const sx of [-1, 1]) add(g, G.sphere, c.M('#ff6fa8'), sx * 0.35, 2.75, 0.05, 0.38, 0.22, 0.12, 0, 0, sx * 0.4);
  add(g, G.sphereLo, c.M('#ff4f8b'), 0, 2.75, 0.1, 0.13);
  c.eyes(g, { x: 0, y: 4.2, z: 0.26, size: big ? 0.26 : 0.2, lashes: true, far: big ? 320 : 110 });
  for (const sx of [-1, 1]) add(g, G.sphereLo, c.M('#ff8fc0'), sx * 0.55, 3.88, 0.2, 0.17, 0.1, 0.05);
  c.anim((dt) => { disc.rotation.z += dt * (big ? 0.25 : 0.5); }, l.x, l.z, big ? 400 : 120);
  c.circle(0, 0, 0.12 * s + 0.08, 0, 5.6 * s);
  return g;
}

function cogumelo(l, c) {
  const d = l.data || {};
  const g = new THREE.Group();
  const s = l.scale ?? 1;
  g.scale.setScalar(s);
  const mm = !!d.marshmallow;
  const capCol = d.cor ?? (mm ? '#ffd6ec' : c.accent(Math.floor(c.rng() * 5)));
  add(g, G.cylTaper, c.M(mm ? '#fff7fb' : '#fff3e3'), 0, 0.7, 0, 0.42, 1.4, 0.42, Math.PI);
  const cap = d.nota !== undefined ? dyn('chapeu') : new THREE.Group();
  cap.position.y = 1.35;
  if (mm) {
    add(cap, rbox(2.4, 0.8, 2.4, 0.38), c.M(capCol), 0, 0.35, 0);
    add(cap, rbox(2.0, 0.5, 2.0, 0.24), c.M(WHITE), 0, 0.8, 0);
  } else {
    add(cap, G.hemi, c.M(capCol, d.nota !== undefined ? { emissive: capCol, emissiveIntensity: 0.05 } : {}), 0, 0, 0, 1.3, 0.85, 1.3);
    for (let i = 0; i < 7; i++) {
      const a = i * 2.39, el = 0.35 + (i % 3) * 0.3;
      add(cap, G.sphereLo, c.M(WHITE), Math.cos(a) * Math.cos(el) * 1.25, Math.sin(el) * 0.82, Math.sin(a) * Math.cos(el) * 1.25, 0.17, 0.08, 0.17).lookAt(0, -3, 0);
    }
  }
  g.add(cap);
  const yaw = c.faceYaw(l.x, l.z);
  c.eyes(g, { x: Math.sin(yaw) * 0.36, y: 0.85, z: Math.cos(yaw) * 0.36, ry: yaw, size: 0.1, lashes: true, far: 60 });
  // "ping": o cogumelo-nota pula e brilha quando toca (missões do Coral podem chamar obj.userData.ping())
  let pingT = 0;
  g.userData.ping = () => { pingT = 0.6; };
  if (d.nota !== undefined) c.anim((dt) => {
    if (pingT <= 0 && cap.scale.y === 1) return;
    pingT = Math.max(0, pingT - dt);
    const k = Math.sin((pingT / 0.6) * Math.PI);
    cap.scale.set(1 + k * 0.15, 1 - k * 0.2, 1 + k * 0.15);
    cap.traverse((o) => { if (o.material?.emissive && d.nota !== undefined) o.material.emissiveIntensity = 0.05 + k * 1.2; });
    if (pingT === 0) cap.scale.set(1, 1, 1);
  }, l.x, l.z, 80);
  c.circle(0, 0, 0.42 * s, 0, 1.3 * s);
  c.circle(0, 0, (mm ? 1.2 : 1.25) * s, 1.25 * s, (mm ? 2.2 : 2.15) * s, true);
  return g;
}

function florGigante(l, c) {
  const d = l.data || {};
  const g = new THREE.Group();
  const s = l.scale ?? 1;
  const Hh = d.altura ?? 5.3 * s;
  const pal = ['#ff8fc7', '#c49bff', '#ffd166', '#ff9f6b'];
  const petal = l.id === 'florzona' ? '#ff8fc7' : pal[Math.floor(c.rng() * pal.length)];
  // caule curvo (tubo)
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.2, 0), new THREE.Vector3(0.25 * s, Hh * 0.35, -0.1 * s),
    new THREE.Vector3(-0.2 * s, Hh * 0.7, 0.1 * s), new THREE.Vector3(0, Hh - 0.6 * s, 0.25 * s),
  ]);
  add(g, new THREE.TubeGeometry(curve, 24, 0.13 * s, 8), c.M('#6cc46a'));
  for (const [y, sx] of [[0.25, 1], [0.48, -1], [0.66, 1]]) {
    const leaf = add(g, G.sphere, c.M(sx > 0 ? '#7fd47a' : '#8fdc86'), sx * 0.75 * s, Hh * y, 0, 0.8 * s, 0.12 * s, 0.38 * s, 0, 0, sx * 0.5);
    leaf.rotation.y = sx * 0.4;
  }
  // cabeça (animada: balança e boceja)
  const head = dyn('cabeca');
  head.position.set(0, Hh - 0.4 * s, 0.25 * s);
  const face = new THREE.Group(); face.rotation.x = 0.25; head.add(face);
  add(face, G.disc, c.M('#ffd84d'), 0, 0, 0, 0.75 * s, 0.3 * s, 0.75 * s, Math.PI / 2);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    add(face, G.sphere, c.M(i % 2 ? petal : new THREE.Color(petal).lerp(new THREE.Color('#ffffff'), 0.3).getStyle()),
      Math.cos(a) * 1.05 * s, Math.sin(a) * 1.05 * s, -0.08 * s, 0.6 * s, 0.32 * s, 0.1 * s, 0, 0, a);
  }
  c.eyes(face, { x: 0, y: 0.18 * s, z: 0.16 * s, size: 0.17 * s, lashes: true, far: l.data?.marco ? 260 : 110 });
  const mouth = add(face, G.sphere, c.M('#7a2d4a'), 0, -0.3 * s, 0.15 * s, 0.14 * s, 0.05 * s, 0.05 * s);
  for (const sx of [-1, 1]) add(face, G.sphereLo, c.M('#ff9fb8'), sx * 0.42 * s, -0.15 * s, 0.15 * s, 0.13 * s, 0.08 * s, 0.03 * s);
  g.add(head);
  const ph = c.rng() * 10;
  c.anim((dt, t) => {
    head.rotation.z = Math.sin(t * 0.7 + ph) * 0.06;
    head.rotation.x = Math.sin(t * 0.5 + ph) * 0.04;
    // bocejo a cada ~9 s
    const y = ((t + ph) % 9) / 9;
    const open = y > 0.82 ? Math.sin(((y - 0.82) / 0.18) * Math.PI) : 0;
    mouth.scale.set(0.14 * s * (1 - open * 0.3), (0.05 + open * 0.22) * s, 0.05 * s);
    head.position.y = Hh - 0.4 * s + open * 0.12 * s;
  }, l.x, l.z, 200);
  c.circle(0, 0, 0.15 * s + 0.1, 0, Hh);
  return g;
}

function torreRelogio(l, c) {
  const d = l.data || {};
  const g = new THREE.Group();
  const top = (d.terraco?.y ?? 21) - c.gy;   // altura do terraço acima do chão
  const R = Math.min(5.6, (d.raio ?? 6) - 0.4), TR = d.terraco?.raio ?? 7;
  add(g, G.cyl, c.M('#e9dcf5'), 0, 0.4, 0, R + 0.4, 0.8, R + 0.4);
  const body = new THREE.CylinderGeometry(R * 0.9, R, top - 0.6, 28);
  add(g, body, c.M('#fff1e6'), 0, (top - 0.6) / 2, 0);
  for (const y of [top * 0.33, top * 0.66]) add(g, G.torus, c.M('#ffc2dc'), 0, y, 0, R * (1 - 0.1 * y / top) + 0.05, R * (1 - 0.1 * y / top) + 0.05, 0.8, Math.PI / 2);
  porta(g, c, 0, 0.8, R - 0.05, 1.5, 2.6, '#a3c4f3');
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.5;
    const y = top * (0.25 + (i % 2) * 0.3);
    const rr = R * (1 - 0.1 * y / top) - 0.05;
    janela(g, c, Math.sin(a) * rr, y, Math.cos(a) * rr, 0.8, 1.1, a, i % 2 === 0);
  }
  // terraço (topo andável em y = terraco.y)
  add(g, G.cyl, c.M('#f6e3ee'), 0, top - 0.35, 0, TR, 0.7, TR);
  add(g, G.disc, c.M('#fffaf3'), 0, top + 0.005, 0, TR - 0.3, 0.02, TR - 0.3);
  // parapeito de bolinhas (aberto onde chega a escadaria — último degrau a 90° + 12·28°)
  const lastA = (90 + 12 * 28) * D2R;
  const lastYaw = Math.atan2(Math.cos(lastA), Math.sin(lastA));
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * TAU;
    if (Math.abs(Math.atan2(Math.sin(a - lastYaw), Math.cos(a - lastYaw))) < 0.4) continue;
    add(g, G.cyl8, c.M(WHITE), Math.sin(a) * (TR - 0.2), top + 0.35, Math.cos(a) * (TR - 0.2), 0.07, 0.7, 0.07);
    add(g, G.sphereLo, c.M(i % 2 ? '#ffc2dc' : '#a0d8ef'), Math.sin(a) * (TR - 0.2), top + 0.75, Math.cos(a) * (TR - 0.2), 0.12);
  }
  // relógios-olho nas quatro faces (ponteiros seguem a hora do dia; piscam a cada hora cheia)
  const clocks = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU;
    const y = top - 3.4, rr = R * 0.9 + 0.05;
    const ck = dyn('relogio');
    ck.position.set(Math.sin(a) * rr, y, Math.cos(a) * rr);
    ck.rotation.y = a;
    const faceG = new THREE.Group(); ck.add(faceG);
    add(faceG, G.disc, c.M(WHITE), 0, 0, 0.1, 1.9, 0.2, 1.9, Math.PI / 2);
    add(faceG, G.torus, c.M('#ffd166'), 0, 0, 0.18, 1.95, 1.95, 0.6);
    for (let k = 0; k < 12; k++) add(faceG, G.sphereLo, c.M(k % 3 ? '#c7b8e0' : '#ff8fab'), Math.sin(k * TAU / 12) * 1.55, Math.cos(k * TAU / 12) * 1.55, 0.22, k % 3 ? 0.08 : 0.14);
    const hh = new THREE.Group(), mh = new THREE.Group();
    hh.position.z = mh.position.z = 0.26;
    add(hh, rbox(0.16, 1.0, 0.06, 0.05), c.M(INK), 0, 0.45, 0);
    add(mh, rbox(0.1, 1.45, 0.06, 0.04), c.M('#ff5d8f'), 0, 0.68, 0.03);
    faceG.add(hh, mh);
    add(faceG, G.sphere, c.M('#ffd166'), 0, 0, 0.3, 0.14);
    for (let k = -3; k <= 3; k++) {   // cílios em cima do relógio
      const la = k * 0.3;
      add(ck, G.capsule, c.M(INK), Math.sin(la) * 2.0, Math.cos(la) * 2.0 + 0.1, 0.15, 0.14, 0.5, 0.14, 0, 0, -la * 1.1);
    }
    g.add(ck);
    clocks.push({ faceG, hh, mh });
  }
  let lastHour = -1, blink = 0;
  c.anim((dt) => {
    const dayT = c.dayTime();
    const hours = (dayT * 24) % 12, mins = (dayT * 24 * 60) % 60;
    const hour = Math.floor(dayT * 24);
    if (lastHour !== -1 && hour !== lastHour) blink = 0.5;
    lastHour = hour;
    blink = Math.max(0, blink - dt);
    const sy = blink > 0 ? Math.max(0.08, Math.abs(Math.cos((blink / 0.5) * Math.PI))) : 1;
    for (const k of clocks) {
      k.hh.rotation.z = -(hours / 12) * TAU;
      k.mh.rotation.z = -(mins / 60) * TAU;
      k.faceG.scale.y = sy;
    }
  }, l.x, l.z, 300);
  // cúpula com sino e cobertura pontuda
  const cy = top;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    add(g, G.cyl8, c.M(WHITE), Math.sin(a) * 2.0, cy + 1.6, Math.cos(a) * 2.0, 0.17, 3.2, 0.17);
  }
  add(g, G.cyl, c.M('#fff1e6'), 0, cy + 3.35, 0, 2.5, 0.5, 2.5);
  add(g, G.cone, c.M('#ffb8de'), 0, cy + 5.5, 0, 2.9, 3.9, 2.9);
  add(g, G.sphere, c.M('#ffd166'), 0, cy + 7.7, 0, 0.42);
  add(g, G.cone, c.M('#ffd166'), 0, cy + 2.5, 0, 0.8, 1.1, 0.8);
  add(g, G.sphereLo, c.M('#ffb703'), 0, cy + 1.85, 0, 0.18);
  c.eyes(g, { x: 0, y: cy + 4.9, z: 1.62, rx: -0.55, size: 0.5, lashes: true, far: 280 });
  c.circle(0, 0, R + 0.1, 0, top);
  c.circle(0, 0, 2.3, top, top + 7.5);
  return g;
}

function mirante(l, c) {
  const g = new THREE.Group();
  const s = l.scale ?? 1;
  g.scale.setScalar(s);
  add(g, rbox(6, 0.35, 4.2, 0.12), c.M(WOOD), 0, 0.25, 0);
  for (let i = 0; i < 9; i++) add(g, G.box, c.M('#c99a6b'), -2.7 + i * 0.67, 0.43, 0, 0.04, 0.02, 4.0).userData.noShadow = true;
  // grade na frente e nos lados
  const rail = (x0, z0, x1, z1) => {
    const n = Math.max(2, Math.round(Math.hypot(x1 - x0, z1 - z0) / 0.6));
    for (let i = 0; i <= n; i++) add(g, G.cyl8, c.M(WHITE), x0 + (x1 - x0) * i / n, 0.9, z0 + (z1 - z0) * i / n, 0.05, 1.0, 0.05);
    beam(g, c.M('#ffb3d1'), x0, 1.4, z0, x1, 1.4, z1, 0.07, G.cyl8);
  };
  rail(-3, 2.1, 3, 2.1); rail(-3, 2.1, -3, -1.2); rail(3, 2.1, 3, -1.2);
  c.box(0, 2.1 * s, 3 * s, 0.12, 0, 1.45 * s);
  // pérgola com florzinhas
  for (const [x, z] of [[-2.7, -1.9], [2.7, -1.9]]) add(g, G.cyl8, c.M(WHITE), x, 1.6, z, 0.1, 2.8, 0.1);
  beam(g, c.M(WHITE), -2.9, 3.0, -1.9, 2.9, 3.0, -1.9, 0.12, G.cyl8);
  for (let i = 0; i < 10; i++) add(g, G.sphereLo, c.M(c.accent(i)), -2.7 + i * 0.6, 3.05 + Math.sin(i) * 0.1, -1.9, 0.2);
  // luneta com olhão na lente
  const tel = new THREE.Group(); tel.position.set(1.4, 0.43, 1.2);
  for (let i = 0; i < 3; i++) beam(tel, c.M(WOOD_D), 0, 1.1, 0, Math.cos(i * 2.09) * 0.45, 0, Math.sin(i * 2.09) * 0.45, 0.04, G.cyl8);
  const tube = new THREE.Group(); tube.position.y = 1.2; tube.rotation.x = -0.25;
  add(tube, G.cyl, c.M('#ffd166'), 0, 0, 0, 0.16, 1.3, 0.16, Math.PI / 2);
  add(tube, G.cyl, c.M('#ffb3d1'), 0, 0, 0.7, 0.22, 0.25, 0.22, Math.PI / 2);
  c.eyes(tube, { x: 0, y: 0, z: 0.86, size: 0.17, single: true, lashes: true, far: 60 });
  tel.add(tube);
  g.add(tel);
  c.box(0, 0, 3 * s, 2.1 * s, 0, 0.45 * s, true);
  return g;
}

function portalNuvem(l, c) {
  const g = new THREE.Group();
  const s = l.scale ?? 1;
  g.scale.setScalar(s);
  const fluff = (x, y, z, r, col = WHITE) => add(g, G.ico, c.M(col), x, y, z, r, r * 0.9, r);
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 5; i++) fluff(sx * 3.4 + Math.sin(i * 2) * 0.25, 0.6 + i * 1.25, Math.cos(i) * 0.2, 1.25 - i * 0.06, i % 2 ? '#f4f0ff' : WHITE);
    c.circle(sx * 3.4 * s, 0, 1.3 * s, 0, 7 * s);
  }
  for (let i = 0; i <= 9; i++) {
    const a = (i / 9) * Math.PI;
    fluff(Math.cos(a) * 3.4, 6.6 + Math.sin(a) * 2.2, 0, 1.15, i % 2 ? '#e9e4ff' : WHITE);
  }
  c.eyes(g, { x: 0, y: 8.5, z: 1.0, size: 0.42, lashes: true, far: 200 });
  for (const sx of [-1, 1]) add(g, G.sphereLo, c.M('#ffc2dc'), sx * 0.95, 8.0, 1.0, 0.28, 0.16, 0.06);
  // estrelinhas penduradas balançando
  const stars = dyn('estrelas');
  for (let i = 0; i < 4; i++) {
    const st = new THREE.Group(); st.position.set(-1.8 + i * 1.2, 6.2, 0);
    beam(st, c.M(WHITE), 0, 1.6, 0, 0, 0.2, 0, 0.015, G.cyl8);
    add(st, G.icoLo, c.M('#fff07a', { emissive: '#ffe066', emissiveIntensity: 0.5 }), 0, 0.1, 0, 0.18);
    stars.add(st);
  }
  g.add(stars);
  c.anim((dt, t) => { stars.children.forEach((st, i) => { st.rotation.z = Math.sin(t * 1.4 + i) * 0.15; }); }, l.x, l.z, 90);
  return g;
}

/** Lathe de pedra arredondada com topo achatado em H. */
function pedraGeo(R, H, seed) {
  const pts = [[0, H], [R * 0.62, H], [R * 0.86, H - Math.min(0.5, H * 0.15)], [R, H * 0.62], [R * 1.04, H * 0.25], [R * 0.9, -0.3], [0, -0.3]];
  const geo = new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), 14);
  const p = geo.attributes.position;
  const rng = mulberry32(seed);
  const bumps = Array.from({ length: 5 }, () => rng() * TAU);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(z, x);
    const k = 1 + 0.06 * Math.sin(a * 3 + bumps[0]) + 0.04 * Math.sin(a * 5 + bumps[1] + y);
    p.setXYZ(i, x * k, y, z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

function rocha(l, c) {
  const d = l.data || {};
  const g = new THREE.Group();
  const s = l.scale ?? 1;
  const stone = l.region === 'pico' ? '#e3e8f4' : l.region === 'ninhal' ? '#c9d6c0' : '#ddd6e8';
  if (d.coluna) {   // Pedra do Bocejo: coluna empilhada que boceja
    const H = (d.topoY ?? 38.6) - c.gy, R = d.raio ?? 2.8;
    const n = 4;
    for (let i = 0; i < n; i++) {
      const h = H / n;
      add(g, pedraGeo(R * (1 - i * 0.04), h * 0.98, 11 + i), c.M(i % 2 ? stone : '#d6dceb'), 0, i * h, 0);
    }
    add(g, G.disc, c.M('#cfe8ff'), 0, H + 0.01, 0, R * 0.62, 0.03, R * 0.62);
    const yaw = Math.atan2(-l.x, -l.z);   // olha para o reino
    const fy = H * 0.55;
    c.eyes(g, { x: Math.sin(yaw) * (R * 0.98), y: fy + 0.8, z: Math.cos(yaw) * (R * 0.98), ry: yaw, size: 0.55, lashes: true, far: 200 });
    add(g, G.sphere, c.M('#5a3b55'), Math.sin(yaw) * (R * 0.93), fy - 0.6, Math.cos(yaw) * (R * 0.93), 0.45, 0.7, 0.3, 0, yaw, 0);
    c.circle(0, 0, R, 0, H, true);
    return g;
  }
  if (l.id === 'rocha_pinceso') {   // Pedra Musguinho: topo em y = pinceso_pouso (7,2)
    const H = 7.2 - c.gy;
    add(g, pedraGeo(2.1, H, 7), c.M(stone));
    add(g, G.sphere, c.M('#8fdc7a'), 0, H - 0.02, 0, 1.55, 0.2, 1.45);
    for (let i = 0; i < 6; i++) add(g, G.sphereLo, c.M('#7fcf6a'), Math.cos(i) * 1.7, H - 0.5 - (i % 3) * 0.5, Math.sin(i) * 1.7, 0.4, 0.5, 0.3, 0, -i, 0);
    c.eyes(g, { x: 0, y: H * 0.55, z: 2.1, size: 0.3, lashes: false, far: 90 });
    c.circle(0, 0, 2.05, 0, H, true);
    return g;
  }
  const H = 1.5 * s, R = 1.5 * s;
  add(g, pedraGeo(R, H, Math.round(l.x * 7 + l.z)), c.M(stone));
  add(g, pedraGeo(R * 0.55, H * 0.55, 3), c.M(stone), R * 1.05, 0, R * 0.3);
  add(g, G.sphere, c.M(l.region === 'pico' ? '#ffffff' : '#9fe08a'), 0, H - 0.02, 0, R * 0.62, 0.12 * s, R * 0.58);
  c.circle(0, 0, R * 0.95, 0, H, true);
  c.circle(R * 1.05, R * 0.3, R * 0.5, 0, H * 0.55, true);
  return g;
}

function estatuaOlho(l, c) {
  const d = l.data || {};
  const g = new THREE.Group();
  const s = l.scale ?? 1;
  g.scale.setScalar(s);
  if (d.segredo) {   // Pedra Olhuda: pedra musguenta de um olho só
    add(g, pedraGeo(1.4, 1.7, 5), c.M('#cfc8dc'));
    add(g, G.sphere, c.M('#9fe08a'), 0, 1.68, 0, 0.95, 0.16, 0.85);
    c.eyes(g, { x: 0, y: 1.0, z: 1.25, size: 0.5, single: true, lashes: true, far: 80 });
    c.circle(0, 0, 1.35 * s, 0, 1.7 * s, true);
    return g;
  }
  if (d.material === 'gelatina') {   // gelatina que treme
    const jelly = dyn('gelatina');
    add(jelly, rbox(2.2, 2.0, 2.2, 0.5), c.M('#8ef0c0', { transparent: true, opacity: 0.7 }), 0, 1.0, 0);
    add(jelly, rbox(2.25, 0.4, 2.25, 0.18), c.M('#ff9fd0', { transparent: true, opacity: 0.8 }), 0, 2.05, 0);
    add(jelly, G.sphere, c.M('#ff4f8b'), 0, 2.45, 0, 0.3);
    c.eyes(jelly, { x: 0, y: 1.1, z: 1.12, size: 0.45, single: true, lashes: true, far: 90 });
    g.add(jelly);
    c.anim((dt, t) => { const k = Math.sin(t * 5) * 0.03; jelly.scale.set(1 + k, 1 - k, 1 + k); }, l.x, l.z, 70);
    c.circle(0, 0, 1.15 * s, 0, 2.2 * s, true);
    return g;
  }
  add(g, G.cyl, c.M('#efe6f7'), 0, 0.3, 0, 1.0, 0.6, 1.0);
  add(g, G.cylTaper, c.M('#fff6ea'), 0, 1.0, 0, 0.6, 0.9, 0.6, Math.PI);
  add(g, G.cyl, c.M('#ffd6e8'), 0, 1.5, 0, 0.75, 0.15, 0.75);
  add(g, G.sphere, c.M(WHITE), 0, 2.45, -0.1, 0.85);
  c.eyes(g, { x: 0, y: 2.45, z: 0.42, size: 0.82, single: true, lashes: true, far: 180 });
  c.circle(0, 0, 1.0 * s, 0, 3.3 * s);
  return g;
}

function cachoeira(l, c) {
  // Cascata do Bocejo: espuma branca correndo por cima do trecho íngreme do rio + pedras + névoa.
  const g = new THREE.Group();
  g.userData.absolute = true;
  const pts = c.terrain.rioPts, hs = c.terrain.rioH, hw = c.terrain.rioHalfWidth + 0.6;
  const P = [], UV = [], I = [];
  let arc = 0;
  for (let s = 0; s < 2; s++) {
    const [ax, az] = pts[s], [bx, bz] = pts[s + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const nx = -(bz - az) / len, nz = (bx - ax) / len;
    const steps = Math.ceil(len / 1.5);
    for (let k = (s === 0 ? 0 : 1); k <= steps; k++) {
      const t = k / steps;
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      const y = hs[s] + (hs[s + 1] - hs[s]) * t - 0.62;
      P.push(x + nx * hw, y, z + nz * hw, x - nx * hw, y, z - nz * hw);
      UV.push(0, arc + len * t, 1, arc + len * t);
      const v = P.length / 3;
      if (v >= 4) I.push(v - 4, v - 2, v - 3, v - 3, v - 2, v - 1);
    }
    arc += len;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  geo.setIndex(I);
  geo.computeVertexNormals();
  const foamMat = new THREE.ShaderMaterial({
    uniforms: { uTime: c.timeUniform },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position + vec3(0.0, 0.06, 0.0), 1.0); }',
    fragmentShader: `uniform float uTime; varying vec2 vUv;
      void main(){
        float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
        float s = sin(vUv.y * 1.6 - uTime * 7.0 + sin(vUv.x * 12.0) * 1.5) * 0.5 + 0.5;
        float s2 = sin(vUv.y * 3.1 - uTime * 9.0 + vUv.x * 7.0) * 0.5 + 0.5;
        float a = (0.35 + 0.5 * smoothstep(0.4, 0.9, s * s2)) * edge;
        gl_FragColor = vec4(vec3(1.0, 1.0, 1.0), a);
      }`,
  });
  const foam = skipOverridePasses(new THREE.Mesh(geo, foamMat));
  foam.renderOrder = 2;
  const holder = dyn('cascata');
  holder.add(foam);
  g.add(holder);
  // pedras da nascente e da base
  const [sx, sz] = pts[0];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    const x = sx + Math.cos(a) * 4.2, z = sz + Math.sin(a) * 4.2;
    add(g, pedraGeo(1.4, 1.6, 20 + i), c.M('#dfe6f2'), x, c.ground(x, z) - 0.3, z);
  }
  const [bx, bz] = pts[2];
  for (let i = 0; i < 4; i++) {
    const x = bx + Math.cos(i * 1.7) * 4.6, z = bz + Math.sin(i * 1.7) * 4.6;
    add(g, pedraGeo(1.0, 1.0, 40 + i), c.M('#d6dceb'), x, c.ground(x, z) - 0.2, z);
  }
  c.mist(bx, hs[2] - 0.4, bz);
  c.eyes(g, { x: sx + 3.2, y: c.ground(sx + 3.2, sz) + 1.5, z: sz + 0.5, size: 0.3, ry: -0.8, far: 120 });
  return g;
}

// ------------------------------------------------------------------------------------------
export const BUILDERS = {
  casa_quim: casaQuim, casa, cafeteria, loja_acessorios: lojaAcessorios, fonte, praca, ponte, placa, banco, poste,
  moinho, horta, jardim, arvore_gigante: arvoreGigante, ninho_coreto: ninhoCoreto, casinha_passaro: casinhaPassaro,
  ninho, cata_vento: cataVento, arvore_algodao: arvoreAlgodao, pirulito_gigante: pirulito, cogumelo,
  flor_gigante: florGigante, torre_relogio: torreRelogio, mirante, portal_nuvem: portalNuvem, rocha, cerca,
  'poço': poco, coreto: coretoVila, estatua_olho: estatuaOlho, caixa_correio: caixaCorreio, cachoeira,
};
/** Tipos pequenos: entram no grupo "detalhe" (somem de longe). */
export const DETAIL = new Set(['banco', 'placa', 'poste', 'cerca', 'caixa_correio', 'casinha_passaro', 'horta', 'jardim', 'cata_vento', 'poço']);

function coretoVila(l, c) {
  const g = new THREE.Group();
  const s = l.scale ?? 1;
  g.scale.setScalar(s);
  add(g, new THREE.CylinderGeometry(5, 5.25, 0.5, 8), c.M('#f2e7f7'), 0, 0.25, 0);
  add(g, new THREE.CylinderGeometry(4.75, 4.75, 0.06, 8), c.M('#ffe3ef'), 0, 0.52, 0);
  add(g, rbox(2.6, 0.25, 0.9, 0.08), c.M('#f2e7f7'), 0, 0.12, 5.2);
  const front = 0;   // abertura de entrada na frente (+Z)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + TAU / 16;
    const x = Math.sin(a) * 4.5, z = Math.cos(a) * 4.5;
    add(g, G.cyl8, c.M(WHITE), x, 2.0, z, 0.15, 3.0, 0.15);
    for (let k = 0; k < 3; k++) add(g, G.torusThin, c.M('#b5ead7'), x, 1.0 + k * 0.9, z, 0.18, 0.18, 1.6, Math.PI / 2, 0, 0.3);
    c.circle(x * s, z * s, 0.2 * s, 0, 3.6 * s);
    // gradinha entre colunas (menos na frente)
    const a2 = ((i + 1) / 8) * TAU + TAU / 16;
    const mid = (a + a2) / 2;
    if (Math.abs(Math.atan2(Math.sin(mid - front), Math.cos(mid - front))) > 0.3) {
      beam(g, c.M(WHITE), x, 1.2, z, Math.sin(a2) * 4.5, 1.2, Math.cos(a2) * 4.5, 0.05, G.cyl8);
      for (let k = 1; k < 4; k++) {
        const t = k / 4;
        add(g, G.cyl8, c.M(WHITE), x + (Math.sin(a2) * 4.5 - x) * t, 0.85, z + (Math.cos(a2) * 4.5 - z) * t, 0.03, 0.7, 0.03);
      }
    }
  }
  for (let i = 0; i < 8; i++) {
    const wedge = new THREE.ConeGeometry(5.6, 2.6, 1, 1, true, (i / 8) * TAU, TAU / 8);
    add(g, wedge, c.M(i % 2 ? '#ff9aa2' : '#fff3e3', { side: THREE.DoubleSide }), 0, 4.75, 0);
  }
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    add(g, G.sphereLo, c.M(i % 2 ? '#ffd6e8' : '#ffdac1'), Math.sin(a) * 5.4, 3.5, Math.cos(a) * 5.4, 0.35, 0.25, 0.35);
  }
  add(g, G.sphere, c.M('#ffe66d'), 0, 6.25, 0, 0.35);
  add(g, G.cyl8, c.M(WHITE), 0, 6.8, 0, 0.03, 1.0, 0.03);
  const flag = dyn('flamula');
  flag.position.set(0, 7.15, 0);
  add(flag, G.cone4, c.M('#ff9aa2'), 0.35, 0, 0, 0.18, 0.7, 0.03, 0, 0, -Math.PI / 2);
  g.add(flag);
  c.anim((dt, t) => { flag.rotation.y = Math.sin(t * 1.7) * 0.5; }, l.x, l.z, 100);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    add(g, G.cone4, c.M(c.accent(i)), Math.sin(a) * 4.3, 3.15, Math.cos(a) * 4.3, 0.18, 0.35, 0.03, Math.PI, a, 0);
  }
  c.eyes(g, { x: 0, y: 4.35, z: 3.0, rx: -0.5, size: 0.42, lashes: true, far: 160 });
  c.circle(0, 0, 5.1 * s, 0, 0.52 * s, true);
  return g;
}

/** yaw (rotação Y) que vira a frente de (x,z) para o ponto de trilha mais próximo. */
export function yawToPath(x, z) {
  let best = null, bd = Infinity;
  for (const p of PATHS) {
    for (let i = 0; i < p.points.length - 1; i++) {
      const [ax, az] = p.points[i], [bx, bz] = p.points[i + 1];
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
      const px = ax + dx * t, pz = az + dz * t, d = Math.hypot(px - x, pz - z);
      if (d < bd) { bd = d; best = [px, pz]; }
    }
  }
  return best ? Math.atan2(best[0] - x, best[1] - z) : 0;
}
