// Acessórios dos moradores (look.accessory em story.js). Cada um se pendura nas âncoras do rig:
// headTop, face, neck, chest, waist, back, hip, handL, handR (userData.s = tamanho de referência da âncora).
import { GEO, part, pivot, onHead, mix, mat, BASIC } from './parts.js';

const PI = Math.PI;
const WHITE = '#ffffff';
const GOLD = '#ffd23f';

/** Lacinho: duas abas (cones deitados) + nó. */
function bow(parent, s, color, { p = [0, 0, 0], r = [0, 0, 0] } = {}) {
  const g = pivot(parent, p[0], p[1], p[2]);
  g.rotation.set(r[0], r[1], r[2]);
  for (const side of [1, -1]) {
    part(g, GEO.cone, color, { p: [side * s * 0.55, 0, 0], r: [0, 0, side * PI / 2], s: [s * 0.5, s * 0.9, s * 0.25] });
  }
  part(g, GEO.sph, mix(color, '#ffffff', 0.25), { s: [s * 0.28, s * 0.3, s * 0.24] });
  return g;
}

/** Chapéu de palha (aba + copa + fita). furado = remendo e buraquinho com palha espetada. */
function strawHat(a, color, band, furado) {
  const s = a.userData.s;
  const g = pivot(a, 0, -s * 0.08, -s * 0.05);
  g.rotation.x = -0.12;
  part(g, GEO.cyl, color, { p: [0, 0, 0], s: [s * 1.45, s * 0.05, s * 1.45] });
  part(g, GEO.skirt, color, { p: [0, s * 0.28, 0], s: [s * 0.78, s * 0.5, s * 0.78], r: [PI, 0, 0] });
  part(g, GEO.cyl, band, { p: [0, s * 0.1, 0], s: [s * 0.79, s * 0.12, s * 0.79], ol: false });
  if (furado) {
    part(g, GEO.box, '#c98a4b', { p: [s * 0.45, s * 0.35, s * 0.45], r: [0.3, 0.8, 0.2], s: [s * 0.3, s * 0.25, s * 0.03], ol: false });
    part(g, GEO.cyl, '#5a3a2a', { p: [-s * 0.2, s * 0.54, s * 0.1], s: [s * 0.14, s * 0.02, s * 0.14], ol: false, sh: false });
    for (let i = 0; i < 4; i++) part(g, GEO.coneLo, color, { p: [-s * 0.2 + (i - 1.5) * s * 0.05, s * 0.6, s * 0.1], r: [0, 0, (i - 1.5) * 0.35], s: [s * 0.03, s * 0.2, s * 0.03], ol: false });
  } else {
    part(g, GEO.sph, '#ff8fab', { p: [s * 0.6, s * 0.18, s * 0.45], s: s * 0.14 });
  }
  return g;
}

/** Óculos redondinhos na frente do rosto. */
function glasses(rig, color = '#b8860b') {
  const a = rig.anchors.face, s = a.userData.s;
  const g = pivot(a, 0, s * 0.06, s * 0.08);
  for (const side of [1, -1]) {
    part(g, GEO.torThin, color, { p: [side * s * 0.4, 0, 0], s: s * 0.27, ol: false, sh: false, m: BASIC(color) });
  }
  part(g, GEO.cylLo, color, { p: [0, s * 0.05, 0], r: [0, 0, PI / 2], s: [s * 0.015, s * 0.26, s * 0.015], ol: false, sh: false, m: BASIC(color) });
  return g;
}

/** Avental na frente do corpo; detalhe opcional (bolinhas, xícara, galhinho). */
function apron(rig, color, detail, dots) {
  const a = rig.anchors.waist, s = a.userData.s * (rig.kind === 'bird' ? 0.8 : 1);
  const g = pivot(a, 0, 0, s * 0.02);
  part(g, GEO.sph, color, { p: [0, -s * 0.05, 0], s: [s * 0.6, s * 0.62, s * 0.1] });          // saia do avental
  part(g, GEO.sph, color, { p: [0, s * 0.55, -s * 0.06], s: [s * 0.4, s * 0.36, s * 0.09] });  // peitilho
  part(g, GEO.box, mix(color, '#000000', 0.12), { p: [0, s * 0.27, s * 0.0], s: [s * 1.1, s * 0.09, s * 0.12], ol: false }); // cordão
  if (dots) for (const [x, y] of [[-0.3, 0.15], [0.28, 0.25], [0, -0.1], [-0.25, -0.35], [0.3, -0.3], [0.05, 0.6]]) {
    part(g, GEO.sphLo, dots[(x * 10 + y * 10 + 20 | 0) % dots.length], { p: [x * s, y * s, s * 0.09], s: [s * 0.08, s * 0.08, s * 0.03], ol: false, sh: false });
  }
  if (detail === 'xicara') {
    part(g, GEO.cyl, WHITE, { p: [0, -s * 0.12, s * 0.1], r: [PI / 2, 0, 0], s: [s * 0.14, s * 0.03, s * 0.14], ol: false });
    part(g, GEO.tor, WHITE, { p: [s * 0.17, -s * 0.12, s * 0.1], s: s * 0.06, ol: false });
    part(g, GEO.sphLo, '#ff8fab', { p: [0, s * 0.55, s * 0.08], s: [s * 0.08, s * 0.06, s * 0.03], ol: false, sh: false });
  } else if (detail === 'galho') {
    part(g, GEO.cylLo, '#8a5a3c', { p: [0, -s * 0.1, s * 0.1], r: [0, 0, 0.9], s: [s * 0.025, s * 0.4, s * 0.025], ol: false });
    part(g, GEO.sphLo, '#7ee081', { p: [s * 0.1, 0, s * 0.11], s: [s * 0.09, s * 0.05, s * 0.03], ol: false });
  }
  return g;
}

/** Bonezinho: cúpula + aba virada para a frente. */
function cap(rig, color, emblem) {
  const a = rig.anchors.headTop, s = a.userData.s;
  const g = pivot(a, 0, -s * 0.3, 0);
  g.rotation.x = -0.15;
  part(g, GEO.dome, color, { p: [0, s * 0.3, 0], s: [s * 0.88, s * 0.6, s * 0.9] });
  part(g, GEO.cyl, mix(color, '#000000', 0.15), { p: [0, s * 0.02, s * 0.8], s: [s * 0.5, s * 0.03, s * 0.4] });
  part(g, GEO.sph, mix(color, WHITE, 0.4), { p: [0, s * 0.62, 0], s: s * 0.1, ol: false });
  if (emblem) part(g, GEO.box, WHITE, { p: [0, s * 0.3, s * 0.82], r: [-0.4, 0, 0], s: [s * 0.28, s * 0.18, s * 0.02], ol: false, sh: false });
  return g;
}

/** Bolsa de carteiro pendurada de lado, com alça atravessada e envelope saindo. */
function mailBag(rig, color) {
  const h = rig.anchors.hip, s = h.userData.s;
  const bag = part(h, GEO.box, color, { p: [-s * 0.08, 0, s * 0.15], s: [s * 0.3, s * 0.5, s * 0.6] });
  part(h, GEO.box, mix(color, '#000000', 0.2), { p: [-s * 0.08, s * 0.18, s * 0.15], s: [s * 0.32, s * 0.16, s * 0.62], ol: false });
  part(h, GEO.box, WHITE, { p: [-s * 0.02, s * 0.3, s * 0.2], r: [0, 0, 0.2], s: [s * 0.04, s * 0.3, s * 0.4], ol: false });
  const body = rig.body, c = rig.anchors.neck;
  part(body, GEO.torThin, mix(color, '#000000', 0.25), { p: [0, c.position.y * 0.55, 0], r: [PI / 2, 0.6, 0], s: [rig.bodyR * 1.02, rig.bodyR * 1.02, rig.bodyR * 0.6], ol: false });
  return bag;
}

function hardHat(rig, color) {
  const a = rig.anchors.headTop, s = a.userData.s;
  const g = pivot(a, 0, -s * 0.25, 0);
  part(g, GEO.dome, color, { p: [0, s * 0.32, 0], s: [s * 0.82, s * 0.64, s * 0.82] });
  part(g, GEO.cyl, color, { p: [0, 0.0, s * 0.05], s: [s * 1.0, s * 0.04, s * 1.0] });
  part(g, GEO.box, mix(color, WHITE, 0.3), { p: [0, s * 0.62, 0], s: [s * 0.12, s * 0.06, s * 1.0], ol: false });
}

function chefHat(rig, band, puff = WHITE, tall = 1) {
  const a = rig.anchors.headTop, s = a.userData.s;
  const g = pivot(a, 0, -s * 0.15, -s * 0.05);
  g.rotation.x = -0.12;
  part(g, GEO.cyl, puff, { p: [0, s * 0.22 * tall, 0], s: [s * 0.62, s * 0.45 * tall, s * 0.62] });
  part(g, GEO.cyl, band, { p: [0, s * 0.02, 0], s: [s * 0.66, s * 0.1, s * 0.66], ol: false });
  for (const [x, z] of [[0, 0], [0.32, 0.15], [-0.32, 0.15], [0.15, -0.3], [-0.15, -0.3]]) {
    part(g, GEO.sphLo, puff, { p: [x * s, s * 0.5 * tall + s * 0.12, z * s], s: s * 0.35 });
  }
  return g;
}

// ------------------------------------------------------------------------------------------------

const BUILD = {
  avental_florido(rig, L) { apron(rig, WHITE, null, ['#ff8fab', '#c49bff', '#ffd166']); },
  chapeu_palha(rig, L) { strawHat(rig.anchors.headTop, '#f3d27a', L.outfit, false); },
  chapeu_palha_furado(rig) { strawHat(rig.anchors.headTop, '#e8c46a', '#9b6b4a', true); },
  boia(rig, L) {
    const a = rig.anchors.waist, s = a.userData.s;
    const g = pivot(a, 0, -s * 0.2, -s * 0.86);
    part(g, GEO.tor, L.outfit, { r: [PI / 2, 0, 0], s: [s * 1.05, s * 1.05, s * 0.9] });
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * PI * 2 + PI / 4;
      part(g, GEO.box, WHITE, { p: [Math.cos(ang) * s * 1.05, 0, Math.sin(ang) * s * 1.05], r: [0, -ang, 0], s: [s * 0.1, s * 0.22, s * 0.48], ol: false });
    }
  },
  petala_na_cabeca(rig) {
    const a = rig.anchors.headTop, s = a.userData.s;
    part(a, GEO.sph, '#ff9fc7', { p: [s * 0.25, s * 0.05, 0], r: [0.2, 0.4, -0.5], s: [s * 0.42, s * 0.08, s * 0.3], glow: 0.1 });
  },
  oculos_redondos(rig) { glasses(rig, '#c08a3a'); },
  chapeu_de_padeiro(rig) { chefHat(rig, '#f4d9b0', WHITE, 1.1); },
  macacao_e_regata(rig, L) {
    rig.parts.torso.material = mat(WHITE);
    const b = rig.body, s = rig.bodyR, wa = rig.anchors.waist;
    part(b, GEO.sph, L.outfit, { p: [0, wa.position.y - s * 0.05, 0], s: [s * 1.04, s * 0.85, s * 0.97] });
    part(wa, GEO.box, L.outfit, { p: [0, s * 0.5, -s * 0.03], s: [s * 0.8, s * 0.6, s * 0.12] });
    for (const side of [1, -1]) {
      part(b, GEO.cylLo, L.outfit, { p: [side * s * 0.35, rig.anchors.chest.position.y + s * 0.05, s * 0.55], r: [0.4, 0, 0], s: [s * 0.08, s * 0.9, s * 0.05], ol: false });
      part(wa, GEO.sphLo, GOLD, { p: [side * s * 0.3, s * 0.72, s * 0.05], s: s * 0.07, ol: false, sh: false });
    }
  },
  bone_de_carteira(rig, L) { cap(rig, L.outfit, true); mailBag(rig, '#c98a4b'); },
  laco_no_espinho(rig) {
    const a = rig.anchors.headTop, s = a.userData.s;
    bow(a, s * 0.32, '#ff6fa8', { p: [s * 0.35, s * 0.12, s * 0.1], r: [0, 0, -0.4] });
  },
  touca_de_dormir(rig, L) {
    const a = rig.anchors.headTop, s = a.userData.s;
    const c = mix(L.outfit, '#9a8acb', 0.15);
    const g = pivot(a, 0, -s * 0.2, -s * 0.05);
    g.rotation.z = 0.25;
    part(g, GEO.cyl, WHITE, { p: [0, 0, 0], s: [s * 0.82, s * 0.16, s * 0.82] });
    part(g, GEO.cone, c, { p: [0, s * 0.4, 0], s: [s * 0.75, s * 0.75, s * 0.75] });
    const tip = pivot(g, 0, s * 0.72, 0);
    tip.rotation.z = -1.4;
    part(tip, GEO.cone, c, { p: [0, s * 0.25, 0], s: [s * 0.3, s * 0.5, s * 0.3] });
    part(tip, GEO.sph, WHITE, { p: [0, s * 0.52, 0], s: s * 0.16 });
    // estrelinhas e luazinha na touca
    part(g, GEO.sphLo, GOLD, { p: [s * 0.25, s * 0.25, s * 0.5], s: [s * 0.08, s * 0.08, s * 0.02], ol: false, sh: false, glow: 0.4 });
  },
  xale_e_oculos(rig, L) {
    const n = rig.anchors.neck, s = n.userData.s;
    part(n, GEO.tor, L.outfit, { p: [0, -s * 0.1, -s * 0.05], r: [PI / 2 - 0.2, 0, 0], s: [s * 1.05, s * 1.05, s * 1.6] });
    part(rig.anchors.back, GEO.cone, L.outfit, { p: [0, -s * 0.15, s * 0.05], r: [-0.25, 0, PI], s: [s * 0.9, s * 1.0, s * 0.2] });
    part(rig.anchors.chest, GEO.sph, GOLD, { p: [0, s * 0.25, s * 0.12], s: s * 0.1, ol: false });
    for (let i = 0; i < 6; i++) part(rig.anchors.back, GEO.sphLo, mix(L.outfit, WHITE, 0.4), { p: [(i - 2.5) * s * 0.16, -s * 0.62 + Math.abs(i - 2.5) * s * 0.17, s * 0.12], s: s * 0.07, ol: false, sh: false });
    glasses(rig, '#d4a64a');
  },
  bolsa_de_carteiro(rig, L) { cap(rig, L.outfit, true); mailBag(rig, '#d99a5a'); },
  topete(rig, L) {
    const a = rig.anchors.headTop, s = a.userData.s;
    for (const k of [-1, 0, 1]) {
      const g = pivot(a, k * s * 0.12, -s * 0.05, s * 0.15);
      g.rotation.set(0.6, 0, -k * 0.35);
      part(g, GEO.sph, L.body, { p: [0, s * 0.25, 0], s: [s * 0.1, s * 0.3, s * 0.08] });
      part(g, GEO.sph, L.outfit, { p: [0, s * 0.48, 0.0], s: [s * 0.08, s * 0.1, s * 0.07], ol: false });
    }
  },
  lacinho(rig, L) {
    const a = rig.anchors.headTop, s = a.userData.s;
    bow(a, s * 0.32, L.outfit, { p: [s * 0.3, -s * 0.05, s * 0.1], r: [0, 0, -0.35] });
  },
  pena_espetada(rig, L) {
    const a = rig.anchors.headTop, s = a.userData.s;
    const g = pivot(a, -s * 0.1, -s * 0.05, -s * 0.1);
    g.rotation.set(-0.3, 0, 0.35);
    part(g, GEO.sph, L.outfit, { p: [0, s * 0.45, 0], s: [s * 0.13, s * 0.5, s * 0.04] });
    part(g, GEO.cylLo, WHITE, { p: [0, s * 0.45, 0.0], s: [s * 0.015, s * 0.95, s * 0.015], ol: false, sh: false });
  },
  avental_de_ninho(rig, L) { apron(rig, mix(L.outfit, WHITE, 0.45), 'galho'); },
  colar_de_perolas(rig) {
    const n = rig.anchors.neck, s = n.userData.s;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * PI * 2;
      part(n, GEO.sphLo, '#fff8f0', { p: [Math.sin(a) * s * 0.55, -s * 0.1 - (Math.cos(a) > 0 ? Math.cos(a) * s * 0.15 : 0), Math.cos(a) * s * 0.55], s: s * 0.1, ol: false, glow: 0.15 });
    }
  },
  capacete_de_obra(rig) { hardHat(rig, '#ffc93c'); },
  lenco_na_cabeca(rig, L) {
    const a = rig.anchors.headTop, s = a.userData.s;
    const g = pivot(a, 0, -s * 0.35, -s * 0.05);
    g.rotation.x = -0.3;
    const d = part(g, GEO.dome, L.outfit, { p: [0, s * 0.3, 0], s: [s * 1.02, s * 0.62, s * 1.0] });
    for (const [x, z] of [[0.3, 0.4], [-0.4, 0.2], [0, -0.5], [0.5, -0.2]]) part(g, GEO.sphLo, WHITE, { p: [x * s, s * 0.45, z * s], s: [s * 0.08, s * 0.04, s * 0.08], ol: false, sh: false });
    bow(g, s * 0.25, L.outfit, { p: [0, s * 0.08, -s * 0.95], r: [0.2, 0, 0] });
    return d;
  },
  gravata_borboleta(rig) { bow(rig.anchors.neck, rig.anchors.neck.userData.s * 0.32, '#e63e6d', { p: [0, -0.01, rig.anchors.neck.userData.s * 0.95] }); },
  touca_de_confeiteira(rig, L) { chefHat(rig, '#ff8fc7', '#fff6fb', 1.4); },
  apito_e_bandeirinha(rig) {
    const n = rig.anchors.neck, s = n.userData.s;
    part(n, GEO.cyl, GOLD, { p: [s * 0.2, -s * 0.5, s * 0.85], r: [PI / 2, 0, 0.3], s: [s * 0.12, s * 0.3, s * 0.12], ol: false });
    const h = rig.anchors.handR;
    const g = pivot(h, 0, 0, 0);
    part(g, GEO.cylLo, '#8a5a3c', { p: [0, 0.07, 0], s: [0.008, 0.26, 0.008], ol: false });
    const f = part(g, GEO.cone, '#ff6f61', { p: [-0.045, 0.16, 0], r: [0, 0, PI / 2], s: [0.04, 0.09, 0.008] });
    rig.flag = f;
  },
  balde_de_brinquedo(rig) {
    const h = rig.anchors.handL;
    part(h, GEO.skirt, '#6ec6ff', { p: [0, -0.06, 0.03], r: [PI, 0, 0], s: [0.07, 0.09, 0.07] });
    part(h, GEO.torThin, GOLD, { p: [0, -0.01, 0.03], s: [0.065, 0.065, 0.065], ol: false });
    part(h, GEO.cyl, GOLD, { p: [0, -0.1, 0.03], s: [0.05, 0.015, 0.05], ol: false });
  },
  laranja_na_cabeca(rig) {
    const a = rig.anchors.headTop, s = a.userData.s;
    part(a, GEO.sph, '#ff9f2a', { p: [0, s * 0.18, -s * 0.05], s: s * 0.35, glow: 0.1 });
    part(a, GEO.sph, '#7ee081', { p: [s * 0.12, s * 0.52, -s * 0.05], r: [0, 0, -0.6], s: [s * 0.15, s * 0.06, s * 0.08], ol: false });
  },
  avental_de_barista(rig) { apron(rig, '#8b5e3c', 'xicara'); },
  laco_gigante(rig) {
    const a = rig.anchors.headTop, s = a.userData.s;
    bow(a, s * 0.5, '#ff6fa8', { p: [s * 0.45, s * 0.05, s * 0.05], r: [0.1, 0.3, -0.7] });
  },
  lupa_de_relojoeiro(rig) {
    const f = rig.anchors.face, s = f.userData.s;
    const g = pivot(f, -s * 0.4, s * 0.06, s * 0.05);
    part(g, GEO.cyl, '#3d3a52', { p: [0, 0, s * 0.08], r: [PI / 2, 0, 0], s: [s * 0.22, s * 0.2, s * 0.22] });
    part(g, GEO.cyl, '#bfe8ff', { p: [0, 0, s * 0.19], r: [PI / 2, 0, 0], s: [s * 0.18, s * 0.01, s * 0.18], ol: false, sh: false, glow: 0.3 });
    part(g, GEO.cylLo, GOLD, { p: [-s * 0.18, s * 0.12, s * 0.02], r: [0, 0, 1.1], s: [s * 0.015, s * 0.35, s * 0.015], ol: false, sh: false });
    // e um relógio de bolso na mão, claro
    const h = rig.anchors.handR;
    part(h, GEO.cyl, GOLD, { p: [0, -0.02, 0.02], r: [PI / 2, 0, 0], s: [0.04, 0.015, 0.04], ol: false });
    part(h, GEO.cyl, WHITE, { p: [0, -0.02, 0.03], r: [PI / 2, 0, 0], s: [0.032, 0.005, 0.032], ol: false, sh: false });
  },
  faixa_de_prefeita_e_cilios_enormes(rig, L) {
    // faixa atravessada no corpo com medalha dourada
    const b = rig.body;
    part(b, GEO.tor, L.outfit, { p: [0, 0.1, 0], r: [0, 0, 0.65], s: [0.175, 0.16, 0.85] });
    part(b, GEO.cyl, GOLD, { p: [0.12, 0.08, 0.2], r: [PI / 2 - 0.3, 0, 0], s: [0.035, 0.01, 0.035], ol: false, glow: 0.3 });
    // cílios enooormes (dois palmos de puro charme)
    const eyes = rig.eyes[0];
    if (eyes) {
      for (const eye of eyes.children) {
        const side = Math.sign(eye.position.x) || 1;
        for (let i = -1; i <= 1; i++) {
          part(eye, GEO.cylLo, '#1d1430', { p: [i * 0.018 + side * 0.012, 0.06, 0.005], r: [0, 0, -i * 0.5 - side * 0.4], s: [0.005, 0.07, 0.005], ol: false, sh: false, m: BASIC('#1d1430') });
        }
      }
    }
  },
  binoculo_de_nuvem(rig) {
    const c = rig.anchors.chest, s = c.userData.s;
    const g = pivot(c, 0, -s * 0.45, s * 0.22);
    g.rotation.x = 0.5;
    for (const side of [1, -1]) {
      part(g, GEO.cyl, '#d3b8ff', { p: [side * s * 0.15, 0, 0], r: [0, 0, 0], s: [s * 0.12, s * 0.3, s * 0.12] });
      part(g, GEO.sphLo, WHITE, { p: [side * s * 0.18, s * 0.08, s * 0.1], s: [s * 0.14, s * 0.1, s * 0.1], ol: false });
    }
    part(g, GEO.sphLo, WHITE, { p: [0, s * 0.12, 0], s: [s * 0.18, s * 0.1, s * 0.12], ol: false });
    part(rig.anchors.neck, GEO.torThin, '#9b8bb4', { p: [0, -s * 0.3, s * 0.15], r: [PI / 2 - 0.5, 0, 0], s: [s * 0.75, s * 0.75, s * 1.6], ol: false });
  },
  cestinha_de_flores(rig) {
    const h = rig.anchors.handR;
    const g = pivot(h, 0, -0.03, 0.04);
    part(g, GEO.dome, '#c98a4b', { p: [0, 0, 0], r: [PI, 0, 0], s: [0.07, 0.06, 0.07] });
    part(g, GEO.torThin, '#a8703a', { p: [0, 0.03, 0], s: [0.06, 0.06, 0.06], ol: false });
    for (const [x, z, c] of [[0.02, 0.01, '#ff6fa8'], [-0.025, 0.0, GOLD], [0, -0.025, '#c792ff']]) part(g, GEO.sphLo, c, { p: [x, 0.04, z], s: 0.02, ol: false, glow: 0.2 });
  },
  sobrancelhas_brancas_e_bengala(rig) {
    const f = rig.anchors.face, s = f.userData.s;
    for (const side of [1, -1]) {
      const e = part(rig.head, GEO.sph, WHITE, { s: [s * 0.24, s * 0.08, s * 0.1] });
      onHead(e, s, [1, 0.95, 0.95], side * s * 0.42, s * 0.55, s * 0.02);
      e.rotateZ(side * 0.25);
    }
    part(rig.head, GEO.sph, WHITE, { p: [0, -s * 0.5, s * 0.75], s: [s * 0.3, s * 0.12, s * 0.12] });  // bigodinho de pena
    const h = rig.anchors.handR;
    part(h, GEO.cylLo, '#9c6b4a', { p: [0, -0.12, 0.02], s: [0.012, 0.3, 0.012] });
    part(h, GEO.torThin, '#9c6b4a', { p: [0.03, 0.03, 0.02], r: [0, 0, 0], s: [0.03, 0.03, 0.12], ol: false });
    rig.cane = true;
  },
  bochechas_rosadas(rig) {
    const f = rig.anchors.face, s = f.userData.s;
    for (const side of [1, -1]) {
      const c = part(rig.head, GEO.sphLo, '#ff7fa8', { s: [s * 0.22, s * 0.16, s * 0.06], ol: false, sh: false, glow: 0.35 });
      onHead(c, s, [1, 0.95, 0.95], side * s * 0.62, -s * 0.16, 0);
    }
    bow(rig.anchors.headTop, s * 0.22, '#ff9fc2', { p: [s * 0.35, -s * 0.15, s * 0.15], r: [0, 0, -0.5] });
  },
};

/** Pendura o acessório do look (se houver). Acessórios desconhecidos são ignorados sem quebrar. */
export function addAccessory(rig, def) {
  const id = def.look?.accessory;
  if (!id) return;
  const fn = BUILD[id];
  if (fn) fn(rig, def.look);
  else if (typeof console !== 'undefined') console.warn('[npcs] acessório sem modelo:', id);
}

export const KNOWN_ACCESSORIES = Object.keys(BUILD);
