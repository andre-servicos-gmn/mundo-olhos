// Modelos procedurais dos moradores, um construtor por espécie (todas as espécies usadas em story.js).
// buildNPCModel(def) -> rig = { root, visual, body, head, armL, armR, legs[], ears[], tail, eyes[], anchors{}, parts{},
//   kind:'biped'|'bird'|'quad'|'poste', gait:'walk'|'hop'|'waddle'|'slow'|'hover'|'none', hover, top, radius, speed, ... }
// Pivôs: pés em y = 0, frente para +Z, esquerda = +X. Altura-base ~1 m; o npcs.js aplica look.size no root.
// A animação (rig + estado -> poses) fica em animate.js.
import * as THREE from 'three';
import { GEO, part, pivot, addFace, onHead, mix, mat, BASIC } from './parts.js';
import { createEyes } from '../core/eyes.js';
import { addAccessory } from './accessories.js';
import { bakeRig } from './bake.js';

const PI = Math.PI;
const PINK = '#ffb6c8';
const WHITE = '#ffffff';
const INKC = '#3d2236';

function hash(s) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) / 4294967296; }

/** Cílios: senhoras, mocinhas e mamães (pelo nome) — puro charme. */
function hasLashes(def) {
  return /^(Dona|Vó|Vovó|Mamãe|Madame|Prefeita|Joaninha|Pipoca)\b/.test(def.name);
}

function newRig(def) {
  const root = new THREE.Group();
  root.name = 'npc_' + def.id;
  const visual = pivot(root, 0, 0, 0, 'visual');
  return {
    root, visual, body: null, head: null, armL: null, armR: null, legs: [], ears: [], tail: null, tailType: null,
    eyes: [], anchors: {}, parts: {}, kind: 'biped', gait: 'walk', hover: 0, wings: false, flap: 'normal',
    top: 1, R: 0.27, bodyR: 0.2, armRest: 0.18, radius: 0.3, speed: 1.1, seed: hash(def.id) * 100, headYawMax: 0.8,
  };
}
function anchor(rig, name, parent, x, y, z, s) {
  const a = pivot(parent, x, y, z, name);
  a.userData.s = s;
  rig.anchors[name] = a;
  return a;
}

// ================================================================================================
// Detalhes de rosto e corpo reaproveitados

function ears(rig, head, R, type, fur, inner = PINK) {
  for (const side of [1, -1]) {
    let g;
    switch (type) {
      case 'round':
        g = pivot(head, side * R * 0.66, R * 0.68, -R * 0.08);
        part(g, GEO.sph, fur, { s: [R * 0.27, R * 0.27, R * 0.12] });
        part(g, GEO.sphLo, inner, { p: [0, 0, R * 0.07], s: [R * 0.16, R * 0.16, R * 0.05], ol: false, sh: false });
        break;
      case 'bigRound':
        g = pivot(head, side * R * 0.72, R * 0.62, -R * 0.1);
        part(g, GEO.sph, fur, { s: [R * 0.42, R * 0.42, R * 0.1] });
        part(g, GEO.sphLo, inner, { p: [0, 0, R * 0.06], s: [R * 0.3, R * 0.3, R * 0.05], ol: false, sh: false });
        break;
      case 'tri':
        g = pivot(head, side * R * 0.52, R * 0.7, -R * 0.02);
        g.rotation.z = -side * 0.32;
        part(g, GEO.cone, fur, { p: [0, R * 0.2, 0], s: [R * 0.27, R * 0.48, R * 0.15] });
        part(g, GEO.cone, inner, { p: [0, R * 0.16, R * 0.07], s: [R * 0.15, R * 0.3, R * 0.05], ol: false, sh: false });
        break;
      case 'long':
        g = pivot(head, side * R * 0.34, R * 0.8, -R * 0.06);
        g.rotation.z = -side * 0.14;
        part(g, GEO.cap, fur, { p: [0, R * 0.7, 0], s: [R * 0.18, R * 0.36, R * 0.1] });
        part(g, GEO.cap, inner, { p: [0, R * 0.7, R * 0.07], s: [R * 0.09, R * 0.27, R * 0.04], ol: false, sh: false });
        break;
      case 'floppy':
        g = pivot(head, side * R * 0.8, R * 0.32, -R * 0.06);
        g.rotation.z = side * 0.28;
        part(g, GEO.sph, fur, { p: [side * R * 0.05, -R * 0.36, 0], s: [R * 0.2, R * 0.44, R * 0.13] });
        break;
      case 'sheep':
        g = pivot(head, side * R * 0.86, R * 0.22, -R * 0.04);
        g.rotation.z = side * -0.35;
        part(g, GEO.sph, fur, { p: [side * R * 0.2, 0, 0], s: [R * 0.32, R * 0.13, R * 0.15] });
        part(g, GEO.sphLo, inner, { p: [side * R * 0.22, 0, R * 0.08], s: [R * 0.2, R * 0.07, R * 0.05], ol: false, sh: false });
        break;
      case 'tiny':
        g = pivot(head, side * R * 0.52, R * 0.78, -R * 0.12);
        part(g, GEO.sph, fur, { s: [R * 0.13, R * 0.15, R * 0.09] });
        part(g, GEO.sphLo, inner, { p: [0, 0, R * 0.05], s: [R * 0.07, R * 0.09, R * 0.04], ol: false, sh: false });
        break;
      default: return;
    }
    g.userData.side = side;
    rig.ears.push(g);
  }
}

/** Focinho arredondado com narizinho e o sorriso reposicionado embaixo dele. */
function snout(rig, head, R, sc, color, { nose = INKC, w = 1, h = 1, y = -0.28, noseS = 1 } = {}) {
  const m = part(head, GEO.sph, color, { s: [R * 0.38 * w, R * 0.27 * h, R * 0.3] });
  onHead(m, R, sc, 0, R * y, -R * 0.12);
  m.quaternion.identity();
  const n = part(head, GEO.sph, nose, { s: [R * 0.11 * noseS, R * 0.08 * noseS, R * 0.07 * noseS], ol: false, sh: false, glow: nose === INKC ? 0 : 0.2 });
  onHead(n, R, sc, 0, R * (y + 0.16 * h), R * 0.13);
  if (rig.mouth) onHead(rig.mouth, R, sc, 0, R * (y - 0.15 * h), R * 0.17);
  return m;
}

function whiskers(head, R, sc, y = -0.22) {
  for (const side of [1, -1]) {
    for (const k of [-1, 1]) {
      const w = part(head, GEO.cylLo, INKC, { s: [R * 0.012, R * 0.34, R * 0.012], ol: false, sh: false, m: BASIC(INKC) });
      onHead(w, R, sc, side * R * 0.5, R * (y + k * 0.04), R * 0.02);
      w.rotation.set(0, 0, side * (PI / 2 + k * 0.18));
      w.position.x += side * R * 0.12;
    }
  }
}

function tail(rig, body, type, color, y, back) {
  const t = pivot(body, 0, y, back, 'tail');
  rig.tail = t;
  rig.tailType = type;
  switch (type) {
    case 'puff': part(t, GEO.sph, color, { p: [0, 0, -0.045], s: 0.075 }); break;
    case 'bear': part(t, GEO.sph, color, { p: [0, 0, -0.03], s: 0.05 }); break;
    case 'dog': part(t, GEO.cap, color, { p: [0, 0.06, -0.04], r: [-0.65, 0, 0], s: [0.032, 0.04, 0.032] }); break;
    case 'cat':
      part(t, GEO.cap, color, { p: [0, 0.04, -0.08], r: [-1.05, 0, 0], s: [0.03, 0.045, 0.03] });
      part(t, GEO.cap, color, { p: [0, 0.16, -0.13], r: [-0.25, 0, 0], s: [0.03, 0.045, 0.03] });
      break;
    case 'rat':
      part(t, GEO.cap, color, { p: [0, -0.02, -0.12], r: [-1.25, 0, 0], s: [0.013, 0.065, 0.013] });
      part(t, GEO.cap, color, { p: [0, 0.05, -0.24], r: [-0.4, 0, 0], s: [0.012, 0.04, 0.012] });
      break;
    case 'pompom':
      part(t, GEO.cylLo, color, { p: [0, 0.05, -0.04], r: [-0.6, 0, 0], s: [0.015, 0.1, 0.015], ol: false });
      part(t, GEO.sph, color, { p: [0, 0.1, -0.08], s: 0.075 });
      break;
    case 'nub': part(t, GEO.cone, color, { p: [0, -0.02, -0.04], r: [-1.9, 0, 0], s: [0.04, 0.09, 0.04] }); break;
    default: break;
  }
  return t;
}

/** Penteado "coque" (a Vó Cocada): touca de cabelo inclinada para trás, coque no alto e cachinhos fofos. */
function hairCoque(head, R, color) {
  const g = pivot(head, 0, 0, 0);
  g.rotation.x = -0.5;
  part(g, GEO.dome, color, { p: [0, 0.5 * R * 1.08, 0], s: [R * 1.08, R * 1.08, R * 1.08] });
  part(head, GEO.sph, color, { p: [0, R * 1.02, -R * 0.32], s: R * 0.4 });
  part(head, GEO.tor, '#ff9fc4', { p: [0, R * 0.78, -R * 0.24], r: [-1.05, 0, 0], s: R * 0.3, ol: false });
  for (const side of [1, -1]) {
    part(head, GEO.sph, color, { p: [side * R * 0.92, R * 0.05, -R * 0.12], s: R * 0.3 });
    part(head, GEO.sph, color, { p: [side * R * 0.42, R * 0.78, R * 0.42], s: R * 0.2 });
  }
  part(head, GEO.sph, color, { p: [0, R * 0.9, R * 0.3], s: R * 0.2 });
}
function hairCurto(head, R, color) {
  const g = pivot(head, 0, 0, 0);
  g.rotation.x = -0.45;
  part(g, GEO.dome, color, { p: [0, 0.5 * R * 1.07, 0], s: [R * 1.07, R * 1.07, R * 1.07] });
}

// ================================================================================================
// Plano "bípede" (humanos e bichinhos de pé com roupinha)

function biped(def, o = {}) {
  const rig = newRig(def);
  const L = def.look;
  const fur = o.fur ?? L.body, cloth = o.cloth ?? L.outfit;
  const legH = o.legH ?? 0.12, bodyH = o.bodyH ?? 0.36, bodyR = o.bodyR ?? 0.2, R = o.R ?? 0.27;
  const hs = o.hs ?? [1, 0.95, 0.95];
  rig.R = R;
  rig.bodyR = bodyR;
  rig.radius = Math.max(bodyR, R) + 0.08;

  // pernas e pés
  const footS = o.footS ?? [0.075, 0.045, 0.1];
  for (const side of [1, -1]) {
    const leg = pivot(rig.visual, side * bodyR * 0.48, legH, 0);
    if (legH > 0.05) part(leg, GEO.cap, o.legColor ?? fur, { p: [0, -legH * 0.45, 0], s: [0.05, legH * 0.25, 0.05] });
    part(leg, GEO.sph, o.footColor ?? fur, { p: [side * (o.footOut ?? 0), -legH + footS[1] * 0.9, 0.035], s: footS });
    rig.legs.push(leg);
  }

  // corpo (pivô na cintura)
  const body = pivot(rig.visual, 0, legH, 0, 'body');
  rig.body = body;
  rig.parts.torso = part(body, GEO.sph, o.torsoColor ?? cloth, { p: [0, bodyH * 0.45, 0], s: [bodyR, bodyH * 0.55, bodyR * 0.92] });
  if (o.skirt) part(body, GEO.skirt, cloth, { p: [0, bodyH * 0.2, 0], s: [bodyR * 1.28, bodyH * 0.42, bodyR * 1.18] });
  if (o.belly) part(body, GEO.sph, o.belly, { p: [0, bodyH * 0.38, bodyR * 0.42], s: [bodyR * 0.68, bodyH * 0.4, bodyR * 0.55], ol: false });

  // bracinhos (pivô no ombro, pendurados para -Y)
  const armLen = o.armLen ?? 0.2;
  for (const side of [1, -1]) {
    const arm = pivot(body, side * bodyR * 0.9, bodyH * 0.78, 0);
    part(arm, GEO.cap, o.sleeve ?? fur, { p: [0, -armLen * 0.45, 0], s: [0.046, armLen * 0.24, 0.046] });
    part(arm, GEO.sph, o.hand ?? fur, { p: [0, -armLen, 0], s: o.handS ?? 0.054 });
    anchor(rig, side > 0 ? 'handL' : 'handR', arm, 0, -armLen - 0.02, 0.03, 0.05);
    if (side > 0) rig.armL = arm; else rig.armR = arm;
  }

  // cabeça grandona
  const neckY = bodyH + (o.neck ?? 0);
  const head = pivot(body, 0, neckY + R * 0.78, o.headZ ?? 0, 'head');
  rig.head = head;
  rig.parts.head = part(head, GEO.sph, o.face ?? fur, { s: [R * hs[0], R * hs[1], R * hs[2]] });
  addFace(rig, head, { R, sc: hs, lashes: hasLashes(def), ...(o.faceOpts || {}) });

  anchor(rig, 'headTop', head, 0, R * hs[1] * 0.96, 0, R);
  anchor(rig, 'face', head, 0, 0, R * hs[2], R);
  anchor(rig, 'neck', body, 0, neckY, 0, bodyR);
  anchor(rig, 'chest', body, 0, bodyH * 0.66, bodyR * 0.8, bodyR);
  anchor(rig, 'waist', body, 0, bodyH * 0.3, bodyR * 0.86, bodyR);
  anchor(rig, 'back', body, 0, bodyH * 0.55, -bodyR * 0.85, bodyR);
  anchor(rig, 'hip', body, -bodyR * 0.92, bodyH * 0.28, 0, bodyR);
  rig.top = legH + neckY + R * 0.78 + R * hs[1];

  if (o.ears) ears(rig, head, R, o.ears, o.earColor ?? fur, o.earInner);
  if (o.tail) tail(rig, body, o.tail, o.tailColor ?? fur, bodyH * 0.22, -bodyR * 0.85);
  o.extra?.(rig, { head, body, R, hs, fur, cloth, bodyH, bodyR, legH, armLen });
  return rig;
}

// ================================================================================================
// Plano "passarinho"

function bird(def, o = {}) {
  const rig = newRig(def);
  rig.kind = 'bird';
  rig.wings = true;
  rig.gait = o.gait ?? 'hop';
  const L = def.look;
  const fur = o.fur ?? L.body;
  const legH = o.legH ?? 0.13;
  const bR = o.bodyR ?? [0.27, 0.31, 0.27];
  const R = o.R ?? 0.24;
  const hs = o.hs ?? [1, 0.95, 0.95];
  const legColor = o.legColor ?? '#ff9f6b';
  rig.R = R;
  rig.bodyR = bR[0];
  rig.radius = Math.max(bR[0], bR[2]) + 0.06;

  for (const side of [1, -1]) {
    const leg = pivot(rig.visual, side * bR[0] * 0.38, legH, 0);
    part(leg, GEO.cylLo, legColor, { p: [0, -legH / 2, 0], s: [0.02, legH, 0.02], ol: false });
    for (const k of [-1, 0, 1]) {
      part(leg, GEO.cap, legColor, { p: [k * 0.022, -legH + 0.014, 0.03], r: [PI / 2, 0, -k * 0.5], s: [0.015, 0.017, 0.015], ol: false });
    }
    rig.legs.push(leg);
  }

  const body = pivot(rig.visual, 0, legH, 0, 'body');
  rig.body = body;
  const by = bR[1] * 0.95;
  rig.parts.torso = part(body, GEO.sph, fur, { p: [0, by, 0], s: bR });
  const belly = o.belly ?? mix(L.outfit, WHITE, 0.3);
  if (belly) part(body, GEO.sph, belly, { p: [0, by * 0.88, bR[2] * 0.42], s: [bR[0] * 0.74, bR[1] * 0.72, bR[2] * 0.62], ol: false });

  // asas (são os "braços": acenam, batem, dançam)
  const wingC = o.wing ?? mix(fur, '#2a1a3a', 0.16);
  for (const side of [1, -1]) {
    const w = pivot(body, side * bR[0] * 0.9, by + bR[1] * 0.42, -0.01);
    const wl = o.wingLen ?? bR[1] * 0.55;
    part(w, GEO.sph, wingC, { p: [side * 0.012, -wl * 0.85, -0.02], r: [0.18, 0, side * 0.1], s: [0.055, wl, bR[2] * 0.6] });
    if (o.wingTip) part(w, GEO.sph, o.wingTip, { p: [side * 0.02, -wl * 1.45, -0.06], r: [0.35, 0, side * 0.1], s: [0.04, wl * 0.4, bR[2] * 0.35], ol: false });
    anchor(rig, side > 0 ? 'handL' : 'handR', w, side * 0.03, -wl * 1.6, 0.02, 0.05);
    if (side > 0) rig.armL = w; else rig.armR = w;
  }
  rig.armRest = 0.05;

  // cabeça
  const headY = by + bR[1] * (o.headRise ?? 0.82) + R * 0.35;
  const head = pivot(body, 0, headY, bR[2] * (o.headFwd ?? 0.12), 'head');
  rig.head = head;
  rig.parts.head = part(head, GEO.sph, o.headColor ?? fur, { s: [R * hs[0], R * hs[1], R * hs[2]] });
  addFace(rig, head, { R, sc: hs, lashes: hasLashes(def), eyeY: 0.1, eyeSize: o.eyeSize ?? 1.05, cheekY: -0.18, cheekX: 0.62,
    mouth: false, ...(o.faceOpts || {}) });

  // bico (cone deitado para a frente)
  const beakL = R * (o.beakLen ?? 0.36);
  const beak = part(head, GEO.cone, o.beak ?? '#ffb347', { s: [R * (o.beakW ?? 0.17), beakL, R * (o.beakW ?? 0.17) * 0.85], r: [PI / 2, 0, 0] });
  beak.position.set(0, -R * 0.12, R * hs[2] * 0.93 + beakL * 0.42);
  rig.parts.beak = beak;

  // cauda
  const t = pivot(body, 0, by * 0.7, -bR[2] * 0.82, 'tail');
  rig.tail = t;
  rig.tailType = 'bird';
  const tc = o.tailColor ?? wingC, tl = o.tailLen ?? 0.13;
  for (const k of (o.tailN === 2 ? [-0.5, 0.5] : [-1, 0, 1])) {
    part(t, GEO.sph, tc, { p: [k * 0.035, -0.01, -tl * 0.55], r: [-1.05, 0, k * 0.3], s: [0.045, tl, 0.018] });
  }

  anchor(rig, 'headTop', head, 0, R * hs[1] * 0.95, 0, R);
  anchor(rig, 'face', head, 0, 0, R * hs[2], R);
  anchor(rig, 'neck', body, 0, by + bR[1] * 0.75, bR[2] * 0.1, bR[0] * 0.75);
  anchor(rig, 'chest', body, 0, by + bR[1] * 0.35, bR[2] * 0.8, bR[0]);
  anchor(rig, 'waist', body, 0, by - bR[1] * 0.1, bR[2] * 0.92, bR[0]);
  anchor(rig, 'back', body, 0, by + bR[1] * 0.2, -bR[2] * 0.9, bR[0]);
  anchor(rig, 'hip', body, -bR[0] * 0.95, by - bR[1] * 0.1, 0, bR[0]);
  rig.top = legH + headY + R * hs[1];
  o.extra?.(rig, { head, body, R, hs, fur, bR, by, legH });
  return rig;
}

// ================================================================================================
// Espécies

const SPECIES = {
  humano(def) {
    const L = def.look;
    const shoe = mix(L.outfit, '#3d2236', 0.35);
    return biped(def, {
      R: 0.3, hs: [1, 0.96, 0.94], bodyH: 0.38, bodyR: 0.19, legH: 0.13, skirt: true,
      legColor: L.body, footColor: shoe, sleeve: L.outfit, hand: L.body, armLen: 0.21,
      faceOpts: { eyeY: 0.02, eyeSize: 1.05 },
      extra(rig, { head, R }) {
        const hair = L.hair ?? '#5b3122';
        if (L.hairStyle === 'coque') hairCoque(head, R, hair); else hairCurto(head, R, hair);
        // narizinho
        const n = part(head, GEO.sph, mix(L.body, '#e08070', 0.35), { s: [R * 0.08, R * 0.07, R * 0.07], ol: false, sh: false });
        onHead(n, R, [1, 0.96, 0.94], 0, -R * 0.15, 0);
      },
    });
  },

  toupeira(def) {
    const L = def.look;
    return biped(def, {
      R: 0.28, bodyR: 0.22, bodyH: 0.34, legH: 0.08, ears: 'tiny', earInner: '#e9a6b8',
      sleeve: L.body, hand: '#ffb3c1', handS: [0.075, 0.06, 0.05],
      footColor: '#ffb3c1', tail: 'nub', faceOpts: { eyeY: 0.14, eyeSize: 0.95 },
      extra(rig, { head, R, hs, body, bodyH, bodyR }) {
        // nariz-estrela cor-de-rosa
        const n = pivot(head, 0, -R * 0.12, R * hs[2] * 0.98);
        part(n, GEO.sph, '#ff9fb8', { s: [R * 0.15, R * 0.13, R * 0.1], glow: 0.15 });
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * PI * 2;
          part(n, GEO.sphLo, '#ff8fab', { p: [Math.cos(a) * R * 0.17, Math.sin(a) * R * 0.15, R * 0.02], s: R * 0.05, ol: false, sh: false });
        }
        if (rig.mouth) onHead(rig.mouth, R, hs, 0, -R * 0.42, R * 0.02);
        // jardineiro: macacão (outfit) por cima da barriguinha
        part(body, GEO.sph, L.outfit, { p: [0, bodyH * 0.24, 0], s: [bodyR * 1.03, bodyH * 0.36, bodyR * 0.95] });
        for (const side of [1, -1]) part(body, GEO.cylLo, L.outfit, { p: [side * bodyR * 0.45, bodyH * 0.62, bodyR * 0.5], r: [0.35, 0, 0], s: [0.02, bodyH * 0.5, 0.012], ol: false });
        // garrinhas de cavar
        for (const arm of [rig.armL, rig.armR]) {
          for (const k of [-1, 0, 1]) part(arm, GEO.coneLo, '#fff4e8', { p: [k * 0.025, -0.27, 0.03], r: [PI, 0, 0], s: [0.012, 0.04, 0.012], ol: false, sh: false });
        }
      },
    });
  },

  espantalho(def) {
    // Espantalho de verdade: espetado num poste, braços abertos de palha. Não anda (gait 'none').
    const rig = newRig(def);
    rig.kind = 'poste';
    rig.gait = 'none';
    const L = def.look;
    const straw = L.body, shirt = L.outfit, wood = '#9c6b4a';
    rig.R = 0.25;
    rig.bodyR = 0.2;
    rig.radius = 0.35;
    part(rig.visual, GEO.cylLo, wood, { p: [0, 0.3, 0], s: [0.035, 0.6, 0.035] });
    part(rig.visual, GEO.sph, '#7a9a4a', { p: [0, 0.02, 0], s: [0.16, 0.04, 0.16], ol: false });
    const body = pivot(rig.visual, 0, 0.42, 0, 'body');
    rig.body = body;
    rig.parts.torso = part(body, GEO.sph, shirt, { p: [0, 0.2, 0], s: [0.2, 0.24, 0.16] });
    // remendos e palha saindo da camisa
    part(body, GEO.box, '#ffd166', { p: [0.08, 0.16, 0.14], r: [0, 0.3, 0.2], s: [0.07, 0.07, 0.02], ol: false });
    part(body, GEO.box, '#ff8fa3', { p: [-0.09, 0.27, 0.13], r: [0, -0.3, -0.3], s: [0.06, 0.05, 0.02], ol: false });
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * PI * 2;
      part(body, GEO.coneLo, straw, { p: [Math.cos(a) * 0.13, -0.05, Math.sin(a) * 0.1], r: [PI + Math.sin(a) * 0.3, 0, Math.cos(a) * 0.3], s: [0.03, 0.12, 0.03], ol: false });
    }
    // braços abertos (descansam na horizontal)
    for (const side of [1, -1]) {
      const arm = pivot(body, side * 0.17, 0.32, 0);
      part(arm, GEO.cap, shirt, { p: [0, -0.15, 0], s: [0.05, 0.08, 0.05] });
      for (let i = 0; i < 4; i++) part(arm, GEO.coneLo, straw, { p: [(i - 1.5) * 0.015, -0.33, 0], r: [0, 0, (i - 1.5) * 0.25], s: [0.022, 0.1, 0.022], ol: false });
      anchor(rig, side > 0 ? 'handL' : 'handR', arm, 0, -0.33, 0.02, 0.05);
      if (side > 0) rig.armL = arm; else rig.armR = arm;
    }
    rig.armRest = 1.45;
    const R = 0.25, hs = [1, 1, 0.95];
    const head = pivot(body, 0, 0.6, 0, 'head');
    rig.head = head;
    rig.parts.head = part(head, GEO.sph, straw, { s: [R, R, R * 0.95] });
    addFace(rig, head, { R, sc: hs, eyeY: 0.08, mouthW: 1.4, mouthY: -0.36 });
    // pontinhos de costura no sorriso
    for (const k of [-2, -1, 0, 1, 2]) {
      const s = part(head, GEO.box, '#7a4a2a', { s: [R * 0.015, R * 0.12, R * 0.02], ol: false, sh: false });
      onHead(s, R, hs, k * R * 0.07, -R * (0.43 + Math.abs(k) * -0.012 + (k * k) * -0.004), R * 0.01);
    }
    // amarração do pescoço
    part(head, GEO.tor, '#c98a4b', { p: [0, -R * 0.82, 0], r: [PI / 2, 0, 0], s: [R * 0.48, R * 0.48, R * 0.6], ol: false });
    anchor(rig, 'headTop', head, 0, R * 0.95, 0, R);
    anchor(rig, 'face', head, 0, 0, R * 0.95, R);
    anchor(rig, 'neck', body, 0, 0.42, 0, 0.18);
    anchor(rig, 'chest', body, 0, 0.3, 0.14, 0.18);
    anchor(rig, 'waist', body, 0, 0.1, 0.15, 0.18);
    anchor(rig, 'back', body, 0, 0.22, -0.14, 0.18);
    anchor(rig, 'hip', body, -0.18, 0.1, 0, 0.18);
    rig.top = 0.42 + 0.6 + R;
    return rig;
  },

  sapo(def) {
    const L = def.look;
    const sc = [1.18, 0.72, 0.92];
    return biped(def, {
      R: 0.3, hs: sc, bodyR: 0.25, bodyH: 0.3, legH: 0.06, footS: [0.11, 0.04, 0.13], footOut: 0.04,
      torsoColor: L.body, belly: mix(L.body, '#fffbe0', 0.6), armLen: 0.17,
      faceOpts: { eyeY: 0.62, eyeSize: 1.0, spacing: 1.05, eyeZ: 0.13, mouthW: 2.6, mouthY: -0.1, cheekY: -0.1, cheekX: 0.72 },
      extra(rig, { head, R }) {
        // calombos dos olhos no alto da cabeça
        for (const side of [1, -1]) part(head, GEO.sph, L.body, { p: [side * R * 0.42, R * 0.48, R * 0.04], s: R * 0.33 });
        for (const side of [1, -1]) part(head, GEO.sphLo, mix(L.body, '#2a5a2a', 0.5), { p: [side * R * 0.14, R * 0.08, R * 0.86], s: R * 0.035, ol: false, sh: false });
      },
    });
  },

  joaninha(def) {
    // Bolinha voadora: casco vermelho de pintinhas, cabeça escura de olhões, anteninhas. Voa baixinho (hover).
    const rig = newRig(def);
    rig.gait = 'hover';
    rig.hover = 0.18;
    rig.radius = 0.32;
    const L = def.look;
    const red = L.body, dark = L.outfit;
    const body = pivot(rig.visual, 0, 0.12, 0, 'body');
    rig.body = body;
    rig.parts.torso = part(body, GEO.sph, red, { p: [0, 0.28, 0], s: [0.27, 0.28, 0.26] });
    part(body, GEO.sph, dark, { p: [0, 0.22, 0.15], s: [0.14, 0.15, 0.12], ol: false });   // barriguinha
    for (const [x, y, z] of [[0.24, 0.32, 0.05], [-0.24, 0.32, 0.05], [0.2, 0.15, 0.12], [-0.2, 0.15, 0.12]]) {
      const d = new THREE.Vector3(x / 0.27, (y - 0.28) / 0.28, z / 0.26).normalize();
      const sp = part(body, GEO.sphLo, '#2b2140', { p: [x, y, z], s: [0.045, 0.045, 0.012], ol: false, sh: false });
      sp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d);
    }
    // casco (meia esfera virada para trás) com sete pintinhas
    const shellPivot = pivot(body, 0, 0.3, -0.02);
    shellPivot.rotation.x = -1.25;
    const shell = part(shellPivot, GEO.dome, red, { p: [0, 0.5 * 0.3, 0], s: [0.31, 0.3, 0.31] });
    const spots = [[0.5, 0.6], [-0.5, 0.6], [0.55, 0.15], [-0.55, 0.15], [0.25, 0.85], [-0.25, 0.85], [0, 0.4]];
    for (const [sx, sy] of spots) {
      const d = new THREE.Vector3(sx, Math.sqrt(Math.max(0.05, 1 - sx * sx - (sy - 0.5) ** 2)) * 0.9, sy - 0.5).normalize();
      const s = new THREE.Mesh(GEO.sphLo, mat('#2b2140'));
      s.position.set(d.x * 1.0, -0.5 + d.y * 1.0, d.z * 1.0);
      s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
      s.scale.set(0.18, 0.05, 0.18);
      shell.add(s);
    }
    part(shellPivot, GEO.box, '#2b2140', { p: [0, 0.3 * 0.98, 0], s: [0.012, 0.02, 0.6], ol: false, sh: false });
    // perninhas e bracinhos
    for (const side of [1, -1]) {
      const leg = pivot(rig.visual, side * 0.1, 0.14, 0.02);
      part(leg, GEO.cap, dark, { p: [0, -0.06, 0], s: [0.03, 0.035, 0.03] });
      part(leg, GEO.sph, dark, { p: [0, -0.12, 0.02], s: [0.045, 0.03, 0.055] });
      rig.legs.push(leg);
      const arm = pivot(body, side * 0.24, 0.36, 0.06);
      part(arm, GEO.cap, dark, { p: [0, -0.07, 0], s: [0.028, 0.04, 0.028] });
      part(arm, GEO.sph, dark, { p: [0, -0.14, 0], s: 0.035 });
      anchor(rig, side > 0 ? 'handL' : 'handR', arm, 0, -0.15, 0.02, 0.04);
      if (side > 0) rig.armL = arm; else rig.armR = arm;
    }
    rig.armRest = 0.5;
    const R = 0.24, hs = [1.05, 0.95, 0.95];
    const head = pivot(body, 0, 0.6, 0.06, 'head');
    rig.head = head;
    rig.parts.head = part(head, GEO.sph, dark, { s: [R * hs[0], R * hs[1], R * hs[2]] });
    addFace(rig, head, { R, sc: hs, lashes: true, eyeY: 0.06, eyeSize: 1.15, cheekY: -0.32 });
    if (rig.mouth) rig.mouth.material = BASIC('#ff8fa6');
    for (const side of [1, -1]) {
      const a = pivot(head, side * R * 0.35, R * 0.8, 0);
      a.rotation.z = -side * 0.4;
      part(a, GEO.cylLo, dark, { p: [0, R * 0.35, 0], s: [0.012, R * 0.7, 0.012], ol: false });
      part(a, GEO.sph, red, { p: [0, R * 0.72, 0], s: 0.04 });
      a.userData.side = side;
      rig.ears.push(a);
    }
    anchor(rig, 'headTop', head, 0, R * 0.92, 0, R);
    anchor(rig, 'face', head, 0, 0, R, R);
    anchor(rig, 'neck', body, 0, 0.48, 0.05, 0.2);
    anchor(rig, 'chest', body, 0, 0.36, 0.22, 0.2);
    anchor(rig, 'waist', body, 0, 0.2, 0.24, 0.2);
    anchor(rig, 'back', body, 0, 0.3, -0.25, 0.2);
    anchor(rig, 'hip', body, -0.25, 0.2, 0, 0.2);
    rig.top = 0.12 + 0.6 + R;
    return rig;
  },

  ovelha(def) {
    const L = def.look;
    const face = mix(L.body, '#e7c9b2', 0.75);
    return biped(def, {
      R: 0.27, bodyR: 0.23, bodyH: 0.36, legH: 0.11, face, torsoColor: L.body, legColor: face, footColor: '#8f7466',
      sleeve: L.body, hand: face, ears: 'sheep', earColor: face, tail: 'puff',
      faceOpts: { eyeY: 0.0 },
      extra(rig, { head, body, R, bodyH, bodyR }) {
        // lã: bolinhas fofas no corpo e no cocuruto
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * PI * 2;
          part(body, GEO.sphLo, L.body, { p: [Math.cos(a) * bodyR * 0.95, bodyH * (0.32 + (i % 2) * 0.25), Math.sin(a) * bodyR * 0.85], s: bodyR * 0.38 });
        }
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * PI * 2;
          part(head, GEO.sphLo, L.body, { p: [Math.cos(a) * R * 0.5, R * 0.85, Math.sin(a) * R * 0.45 - R * 0.05], s: R * 0.3 });
        }
        part(head, GEO.sphLo, L.body, { p: [0, R * 1.05, 0], s: R * 0.32 });
        // cachecol tricotado (outfit) com a pontinha caída
        part(body, GEO.tor, L.outfit, { p: [0, bodyH + 0.01, 0], r: [PI / 2, 0, 0], s: [bodyR * 0.82, bodyR * 0.82, bodyR * 1.2] });
        part(body, GEO.box, L.outfit, { p: [bodyR * 0.35, bodyH * 0.72, bodyR * 0.72], r: [0.2, 0, 0.15], s: [0.07, 0.17, 0.025] });
        const n = part(head, GEO.sph, '#d98a9a', { s: [R * 0.09, R * 0.06, R * 0.05], ol: false, sh: false });
        onHead(n, R, [1, 0.95, 0.95], 0, -R * 0.2, 0);
      },
    });
  },

  urso(def) {
    const L = def.look;
    return biped(def, {
      R: 0.29, bodyR: 0.25, bodyH: 0.38, legH: 0.1, sleeve: L.body, ears: 'round', earInner: mix(L.body, '#ffd9b8', 0.5),
      tail: 'bear', faceOpts: { eyeY: 0.14, eyeSize: 0.95 },
      extra(rig, { head, R, hs, body, bodyH, bodyR }) {
        snout(rig, head, R, hs, mix(L.body, '#fbe3c8', 0.6));
        // avental de padeiro por cima da camisa
        part(body, GEO.sph, '#ffe8c2', { p: [0, bodyH * 0.32, bodyR * 0.55], s: [bodyR * 0.7, bodyH * 0.38, bodyR * 0.45], ol: false });
      },
    });
  },

  coelho(def) {
    const L = def.look;
    const small = def.look.size < 0.7;
    return biped(def, {
      R: small ? 0.3 : 0.27, bodyR: 0.19, bodyH: 0.33, legH: 0.1, sleeve: L.body, ears: 'long', tail: 'puff',
      tailColor: mix(L.body, WHITE, 0.6), skirt: small, footS: [0.07, 0.045, 0.13],
      faceOpts: { eyeY: 0.1 }, extra(rig, { head, R, hs }) {
        if (small) for (const e of rig.ears) e.scale.setScalar(1.3);
        const m = snout(rig, head, R, hs, mix(L.body, WHITE, 0.55), { nose: '#ff8fab', w: 0.7, h: 0.75, y: -0.22, noseS: 0.8 });
        const t = part(head, GEO.box, WHITE, { s: [R * 0.14, R * 0.1, R * 0.03], ol: false, sh: false });
        onHead(t, R, hs, 0, -R * 0.45, R * 0.1);
      },
    });
  },

  tartaruga(def) {
    const L = def.look;
    const shellC = mix(L.body, '#6b4a2a', 0.5);
    const rig = biped(def, {
      R: 0.27, bodyR: 0.22, bodyH: 0.34, legH: 0.09, torsoColor: mix(L.body, '#fff2b0', 0.55), sleeve: L.body,
      faceOpts: { eyeY: 0.08 },
      extra(rig, { body, bodyH, bodyR }) {
        const g = pivot(body, 0, bodyH * 0.5, -bodyR * 0.25);
        g.rotation.x = -PI / 2;
        const sh = part(g, GEO.dome, shellC, { p: [0, 0.5 * bodyR * 1.1, 0], s: [bodyR * 1.3, bodyR * 1.1, bodyH * 0.72] });
        part(g, GEO.tor, mix(shellC, '#fff2b0', 0.35), { r: [PI / 2, 0, 0], s: [bodyR * 1.28, bodyH * 0.7, bodyR * 0.6], ol: false });
        const Y = new THREE.Vector3(0, 1, 0);
        for (const [x, z] of [[0, 0], [0.55, 0.3], [-0.55, 0.3], [0.5, -0.4], [-0.5, -0.4], [0, 0.65], [0, -0.65]]) {
          const d = new THREE.Vector3(x, Math.sqrt(Math.max(0.1, 1 - x * x - z * z)), z).normalize();
          const s = new THREE.Mesh(GEO.sphLo, mat(mix(shellC, '#ffe39f', 0.35)));
          s.position.set(d.x, -0.5 + d.y, d.z);
          s.quaternion.setFromUnitVectors(Y, d);
          s.scale.set(0.26, 0.06, 0.26);
          sh.add(s);
        }
      },
    });
    rig.gait = 'slow';
    rig.speed = 0.4;
    return rig;
  },

  ourico(def) {
    const L = def.look;
    const face = mix(L.body, '#fff1e0', 0.55);
    const spike = mix(L.body, '#5a3a2a', 0.45);
    return biped(def, {
      R: 0.28, bodyR: 0.25, bodyH: 0.3, legH: 0.07, face, torsoColor: face, skirt: true, sleeve: face, hand: face,
      legColor: face, footColor: mix(L.body, '#5a3a2a', 0.3), ears: 'tiny', earColor: face,
      faceOpts: { eyeY: 0.06 },
      extra(rig, { head, body, R, hs, bodyH, bodyR }) {
        snout(rig, head, R, hs, face, { w: 0.6, h: 0.7, y: -0.2, noseS: 0.9 });
        // espinhos (instanciados: um desenho só por bichinho)
        const spikes = (parent, n, cx, cy, cz, rx, ry, rz, minZ) => {
          const dirs = [];
          for (let i = 0; i < n * 3 && dirs.length < n; i++) {
            const y = 1 - (i / (n * 3 - 1)) * 2, r = Math.sqrt(1 - y * y), a = i * 2.39996;
            const d = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
            if (d.z < minZ && d.y > -0.25) dirs.push(d);
          }
          const im = new THREE.InstancedMesh(GEO.coneLo, mat(spike), dirs.length);
          const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(0.05, 0.16, 0.05);
          dirs.forEach((d, i) => {
            q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
            p.set(cx + d.x * rx, cy + d.y * ry, cz + d.z * rz);
            m4.compose(p, q, s);
            im.setMatrixAt(i, m4);
          });
          im.castShadow = true;
          parent.add(im);
        };
        spikes(head, 26, 0, 0, 0, R * 0.98, R * 0.94, R * 0.94, 0.25);
        spikes(body, 26, 0, bodyH * 0.45, 0, bodyR * 1.0, bodyH * 0.55, bodyR * 0.92, -0.15);
      },
    });
  },

  cachorro(def) {
    const L = def.look;
    const poodle = L.hairStyle === 'poodle';
    const rig = biped(def, {
      R: 0.28, bodyR: 0.21, bodyH: 0.35, legH: 0.11, sleeve: L.body, ears: poodle ? null : 'floppy',
      earColor: mix(L.body, '#7a4a2a', 0.3), tail: poodle ? 'pompom' : 'dog', skirt: poodle,
      faceOpts: { eyeY: 0.13 },
      extra(rig, { head, R, hs, body, bodyH, bodyR }) {
        snout(rig, head, R, hs, mix(L.body, WHITE, 0.45), { w: 0.85, h: 0.85, y: -0.24 });
        if (poodle) {
          // pompons de poodle: topete, orelhas e tornozelos
          part(head, GEO.sph, L.body, { p: [0, R * 0.92, -R * 0.08], s: [R * 0.6, R * 0.45, R * 0.55] });
          for (const side of [1, -1]) {
            const g = pivot(head, side * R * 0.88, R * 0.05, -R * 0.05);
            part(g, GEO.sph, L.body, { p: [0, -R * 0.18, 0], s: [R * 0.3, R * 0.42, R * 0.3] });
            g.userData.side = side;
            rig.ears.push(g);
          }
          for (const leg of rig.legs) part(leg, GEO.sphLo, L.body, { p: [0, -0.04, 0], s: 0.07 });
          for (const arm of [rig.armL, rig.armR]) part(arm, GEO.sphLo, L.body, { p: [0, -0.2, 0], s: 0.07 });
          part(body, GEO.sphLo, L.body, { p: [0, bodyH * 0.95, 0], s: [bodyR * 1.05, bodyH * 0.25, bodyR * 0.95] });
        }
      },
    });
    return rig;
  },

  coruja(def) {
    const L = def.look;
    const rig = bird(def, {
      bodyR: [0.34, 0.36, 0.31], R: 0.32, hs: [1.05, 0.92, 0.9], legH: 0.08, legColor: '#ffc94d', headRise: 0.5,
      belly: mix(L.body, '#fff4e6', 0.55), wing: mix(L.body, '#3a2a5a', 0.25), beak: '#ffc94d', beakLen: 0.18, beakW: 0.14,
      eyeSize: 1.2, gait: 'waddle', tailLen: 0.1, faceOpts: { eyeY: 0.06, spacing: 1.1, cheekY: -0.3 },
      extra(rig, { head, R, hs, body, bR, by }) {
        rig.parts.beak.position.y = -R * 0.2;
        rig.parts.beak.rotation.x = PI / 2 + 0.5;
        // disco facial clarinho em volta dos olhos
        for (const side of [1, -1]) {
          const d = part(head, GEO.sph, mix(L.body, '#fff4e6', 0.7), { s: [R * 0.4, R * 0.42, R * 0.1], ol: false, sh: false });
          onHead(d, R, hs, side * R * 0.38, R * 0.05, -R * 0.06);
        }
        // tufinhos de "orelha"
        for (const side of [1, -1]) {
          const g = pivot(head, side * R * 0.62, R * 0.7, -R * 0.05);
          g.rotation.z = -side * 0.55;
          part(g, GEO.cone, L.body, { p: [0, R * 0.16, 0], s: [R * 0.18, R * 0.36, R * 0.1] });
          g.userData.side = side;
          rig.ears.push(g);
        }
        // peitinho com "vês" de pena
        for (const [x, y] of [[-0.08, 0.05], [0.08, 0.05], [0, -0.06], [-0.11, -0.16], [0.11, -0.16]]) {
          part(body, GEO.coneLo, mix(L.body, '#3a2a5a', 0.2), { p: [x, by + y, bR[2] * 0.93], r: [0.3, 0, PI], s: [0.025, 0.04, 0.01], ol: false, sh: false });
        }
      },
    });
    rig.headYawMax = 1.4; // corujas viram bem a cabeça
    rig.speed = 0.8;
    return rig;
  },

  pombo(def) {
    const L = def.look;
    const rig = bird(def, {
      bodyR: [0.29, 0.31, 0.33], R: 0.2, legColor: '#ff8fa3', belly: mix(L.body, WHITE, 0.25), beak: '#8f8aa6',
      wing: mix(L.body, '#6a6a8a', 0.3), wingTip: '#6d6a85', beakLen: 0.3, beakW: 0.13, gait: 'waddle', headRise: 0.65,
      extra(rig, { head, R, body, bR, by }) {
        // pescoço furta-cor
        part(body, GEO.tor, '#7fd1b9', { p: [0, by + bR[1] * 0.72, bR[2] * 0.08], r: [PI / 2 - 0.25, 0, 0], s: [bR[0] * 0.62, bR[0] * 0.62, bR[0] * 1.3], ol: false });
        part(body, GEO.tor, '#b48ad8', { p: [0, by + bR[1] * 0.6, bR[2] * 0.1], r: [PI / 2 - 0.25, 0, 0], s: [bR[0] * 0.7, bR[0] * 0.7, bR[0] * 1.2], ol: false });
        part(head, GEO.sphLo, WHITE, { p: [0, -R * 0.02, R * 0.98], s: [R * 0.1, R * 0.07, R * 0.08], ol: false, sh: false });
        // listras nas asas
        for (const w of [rig.armL, rig.armR]) for (const k of [0, 1]) part(w, GEO.box, '#55526e', { p: [0, -0.13 - k * 0.06, 0.02], s: [0.115, 0.012, 0.12], ol: false, sh: false });
      },
    });
    rig.headBob = true;
    return rig;
  },

  passaro(def) {
    const L = def.look;
    const baby = L.size < 0.4;
    const rig = bird(def, baby ? {
      bodyR: [0.3, 0.3, 0.28], R: 0.3, headRise: 0.45, eyeSize: 1.2, legH: 0.1, tailLen: 0.09, beakLen: 0.24, beakW: 0.15,
      belly: mix(L.outfit, WHITE, 0.45), beak: '#ffc14d', faceOpts: { cheekY: -0.25 },
      extra(rig, { head, R }) {
        // penugem de filhote: fiapinhos no cocuruto
        for (const k of [-1, 0, 1]) part(head, GEO.cone, L.body, { p: [k * R * 0.14, R * 1.02, -R * 0.05], r: [-0.2, 0, -k * 0.5], s: [R * 0.07, R * 0.25, R * 0.07], ol: false });
      },
    } : {
      bodyR: [0.27, 0.3, 0.28], R: 0.23, beak: def.id.startsWith('seu_barreto') || def.id === 'dona_barrinha' ? '#6b5a4a' : '#f2b049',
      wingTip: mix(L.body, '#2a1a3a', 0.35),
    });
    if (baby) rig.speed = 1.3;
    return rig;
  },

  pavao(def) {
    const L = def.look;
    const rig = bird(def, {
      bodyR: [0.22, 0.28, 0.25], R: 0.17, headRise: 1.6, belly: mix(L.body, '#7fd8ff', 0.2), wing: mix(L.outfit, '#8a6a4a', 0.45),
      beak: '#c9c3d9', beakLen: 0.32, beakW: 0.14, legH: 0.16, legColor: '#b9a7c9', tailN: 2, tailLen: 0.08, gait: 'walk',
      faceOpts: { eyeY: 0.12, eyeSize: 1.15 },
      extra(rig, { head, R, body, bR, by }) {
        // pescoço longo e elegante
        part(body, GEO.cap, L.body, { p: [0, by + bR[1] * 1.1, bR[2] * 0.14], s: [0.085, 0.09, 0.085] });
        // penacho
        for (const k of [-1, 0, 1]) {
          const g = pivot(head, k * R * 0.22, R * 0.85, -R * 0.1);
          g.rotation.z = -k * 0.3;
          part(g, GEO.cylLo, L.body, { p: [0, R * 0.35, 0], s: [0.008, R * 0.7, 0.008], ol: false });
          part(g, GEO.sph, L.outfit, { p: [0, R * 0.75, 0], s: [0.035, 0.045, 0.02] });
        }
        // a cauda-leque cheia de OLHOS (eles piscam e seguem a Quim!)
        const fan = pivot(body, 0, by * 0.9, -bR[2] * 0.75, 'leque');
        fan.rotation.x = -0.35;
        const n = 9;
        for (let i = 0; i < n; i++) {
          const a = (i / (n - 1) - 0.5) * 2.4;
          const g = pivot(fan, 0, 0, 0);
          g.rotation.z = a;
          part(g, GEO.sph, L.outfit, { p: [0, 0.38, -0.02], s: [0.085, 0.36, 0.02] });
          part(g, GEO.sph, '#ffd23f', { p: [0, 0.6, 0.0], s: [0.06, 0.07, 0.02], ol: false, sh: false, glow: 0.2 });
          if (i % 2 === 0) {
            const e = createEyes({ single: true, size: 0.042, irisColor: '#2b4fd9' });
            e.position.set(0, 0.6, 0.012);
            g.add(e);
            rig.eyes.push(e);
          } else {
            part(g, GEO.sph, '#2b4fd9', { p: [0, 0.6, 0.012], s: [0.032, 0.036, 0.012], ol: false, sh: false });
          }
        }
        rig.fan = fan;
      },
    });
    rig.top = 1.05;
    rig.speed = 0.9;
    return rig;
  },

  tucano(def) {
    const L = def.look;
    return bird(def, {
      bodyR: [0.26, 0.32, 0.27], R: 0.22, belly: L.outfit, wing: mix(L.body, '#4a4a7a', 0.15), legColor: '#7a8acb',
      beak: '#ff9f2a', beakLen: 0.95, beakW: 0.32, faceOpts: { eyeY: 0.18, cheekY: -0.05, cheekX: 0.7 },
      extra(rig, { head, R }) {
        const b = rig.parts.beak;
        b.scale.set(R * 0.3, R * 0.95, R * 0.42);
        b.position.set(0, -R * 0.12, R * 0.9 + R * 0.4);
        part(head, GEO.sph, '#ffd23f', { p: [0, R * 0.08, R * 1.0], s: [R * 0.3, R * 0.14, R * 0.25], ol: false });
        part(head, GEO.sph, '#2b2140', { p: [0, -R * 0.12, R * 2.15], s: [R * 0.1, R * 0.12, R * 0.12], ol: false, sh: false });
        // anel azul em volta dos olhos
        for (const side of [1, -1]) part(head, GEO.sphLo, '#6ec6ff', { p: [side * R * 0.44, R * 0.18, R * 0.78], s: [R * 0.24, R * 0.28, R * 0.06], ol: false, sh: false });
      },
    });
  },

  hipopotamo(def) {
    const L = def.look;
    return biped(def, {
      R: 0.31, hs: [1.08, 0.92, 0.96], bodyR: 0.28, bodyH: 0.38, legH: 0.09, skirt: true, sleeve: L.body,
      ears: 'tiny', tail: 'nub', footS: [0.09, 0.05, 0.11], faceOpts: { eyeY: 0.22, eyeSize: 0.95, cheekY: -0.12, cheekX: 0.72 },
      extra(rig, { head, R, hs }) {
        const m = part(head, GEO.sph, mix(L.body, '#ffd6ec', 0.35), { s: [R * 0.66, R * 0.42, R * 0.45] });
        onHead(m, R, hs, 0, -R * 0.3, -R * 0.2);
        m.quaternion.identity();
        for (const side of [1, -1]) {
          const n = part(head, GEO.sphLo, mix(L.body, '#5a3a6a', 0.4), { s: [R * 0.07, R * 0.05, R * 0.04], ol: false, sh: false });
          onHead(n, R, hs, side * R * 0.2, -R * 0.12, R * 0.22);
        }
        if (rig.mouth) { onHead(rig.mouth, R, hs, 0, -R * 0.52, R * 0.2); rig.mouth.scale.multiplyScalar(1.5); }
      },
    });
  },

  formiga(def) {
    const L = def.look;
    const dark = mix(L.body, '#2b2140', 0.35);
    return biped(def, {
      R: 0.27, bodyR: 0.14, bodyH: 0.3, legH: 0.14, torsoColor: L.body, legColor: dark, footColor: dark, sleeve: dark,
      hand: L.body, armLen: 0.18, faceOpts: { eyeY: 0.06, eyeSize: 1.1 },
      extra(rig, { head, body, R, bodyH, bodyR }) {
        // abdômen redondão atrás
        part(body, GEO.sph, L.body, { p: [0, bodyH * 0.25, -bodyR * 1.6], s: [0.17, 0.18, 0.22] });
        // bracinhos extras (formiga tem seis patinhas!)
        for (const side of [1, -1]) {
          const a = pivot(body, side * bodyR * 0.85, bodyH * 0.45, 0.02);
          a.rotation.z = side * 0.6;
          part(a, GEO.cap, dark, { p: [0, -0.06, 0], s: [0.025, 0.035, 0.025] });
        }
        // anteninhas
        for (const side of [1, -1]) {
          const a = pivot(head, side * R * 0.3, R * 0.8, R * 0.1);
          a.rotation.z = -side * 0.45;
          a.rotation.x = -0.3;
          part(a, GEO.cylLo, dark, { p: [0, R * 0.32, 0], s: [0.01, R * 0.64, 0.01], ol: false });
          part(a, GEO.sph, L.body, { p: [0, R * 0.66, 0], s: 0.035 });
          a.userData.side = side;
          rig.ears.push(a);
        }
        // lencinho no pescoço (outfit)
        part(body, GEO.cone, L.outfit, { p: [0, bodyH * 0.8, bodyR * 0.62], r: [0.2, 0, PI], s: [0.1, 0.12, 0.03] });
        part(body, GEO.tor, L.outfit, { p: [0, bodyH * 0.92, 0], r: [PI / 2, 0, 0], s: [bodyR * 0.8, bodyR * 0.8, bodyR * 1.3], ol: false });
      },
    });
  },

  capivara(def) {
    // Quadrúpede-pão: deitadona, zen. Anda devagarinho, quase nunca.
    const rig = newRig(def);
    rig.kind = 'quad';
    rig.gait = 'slow';
    rig.speed = 0.45;
    const L = def.look;
    const fur = L.body, dark = mix(fur, '#3a2a2a', 0.3);
    rig.radius = 0.45;
    const legH = 0.12;
    const legs = [[0.17, 0.25], [-0.17, 0.25], [0.17, -0.25], [-0.17, -0.25]];
    for (const [x, z] of legs) {
      const leg = pivot(rig.visual, x, legH, z);
      part(leg, GEO.cap, fur, { p: [0, -legH * 0.45, 0], s: [0.055, legH * 0.25, 0.055] });
      part(leg, GEO.sph, dark, { p: [0, -legH + 0.03, 0.02], s: [0.06, 0.035, 0.07] });
      rig.legs.push(leg);
    }
    rig.quadLegs = true;
    const body = pivot(rig.visual, 0, legH, 0, 'body');
    rig.body = body;
    rig.parts.torso = part(body, GEO.sph, fur, { p: [0, 0.22, -0.02], s: [0.3, 0.25, 0.42] });
    // lencinho zen (outfit)
    part(body, GEO.tor, L.outfit, { p: [0, 0.3, 0.3], r: [PI / 2 - 0.5, 0, 0], s: [0.19, 0.19, 0.3] });
    part(body, GEO.cone, L.outfit, { p: [0, 0.2, 0.43], r: [0.4, 0, PI], s: [0.1, 0.12, 0.03] });
    rig.armR = rig.legs[1];
    rig.armL = rig.legs[0];
    rig.armRest = 0;
    const R = 0.22, hs = [1.0, 0.92, 1.15];
    const head = pivot(body, 0, 0.42, 0.36, 'head');
    rig.head = head;
    rig.parts.head = part(head, GEO.sph, fur, { s: [R * hs[0], R * hs[1], R * hs[2]] });
    // focinho largo e quadradinho com narizão
    part(head, GEO.sph, mix(fur, '#fff1dc', 0.2), { p: [0, -R * 0.32, R * 0.72], s: [R * 0.78, R * 0.5, R * 0.48] });
    for (const side of [1, -1]) part(head, GEO.sphLo, '#5a3a32', { p: [side * R * 0.16, -R * 0.16, R * 1.12], s: [R * 0.08, R * 0.05, R * 0.04], ol: false, sh: false });
    addFace(rig, head, { R, sc: hs, eyeY: 0.36, eyeSize: 0.92, spacing: 1.08, cheekY: -0.05, cheekX: 0.74 });
    if (rig.mouth) rig.mouth.position.set(0, -R * 0.42, R * 1.15);
    ears(rig, head, R, 'tiny', fur, mix(fur, '#ffb6c8', 0.4));
    anchor(rig, 'headTop', head, 0, R * hs[1] * 0.95, 0, R);
    anchor(rig, 'face', head, 0, 0, R * hs[2], R);
    anchor(rig, 'neck', body, 0, 0.36, 0.32, 0.2);
    anchor(rig, 'chest', body, 0, 0.25, 0.4, 0.2);
    anchor(rig, 'waist', body, 0, 0.15, 0.4, 0.2);
    anchor(rig, 'back', body, 0, 0.45, -0.05, 0.25);
    anchor(rig, 'hip', body, -0.3, 0.2, 0, 0.2);
    rig.top = legH + 0.42 + R;
    rig.headYawMax = 0.6;
    return rig;
  },

  girafa(def) {
    // A Prefeita: pernas compridas, pescoção, chifrinhos e cílios enormes.
    const rig = newRig(def);
    rig.kind = 'quad';
    rig.gait = 'walk';
    rig.speed = 0.8;
    const L = def.look;
    const fur = L.body, spot = mix(fur, '#c0703a', 0.55), hoof = '#7a5a4a';
    rig.radius = 0.4;
    const legH = 0.42;
    for (const [x, z] of [[0.11, 0.16], [-0.11, 0.16], [0.11, -0.16], [-0.11, -0.16]]) {
      const leg = pivot(rig.visual, x, legH, z);
      part(leg, GEO.cap, fur, { p: [0, -legH * 0.48, 0], s: [0.035, legH * 0.22, 0.035] });
      part(leg, GEO.cyl, hoof, { p: [0, -legH + 0.025, 0], s: [0.04, 0.05, 0.04] });
      rig.legs.push(leg);
    }
    rig.quadLegs = true;
    const body = pivot(rig.visual, 0, legH, 0, 'body');
    rig.body = body;
    rig.parts.torso = part(body, GEO.sph, fur, { p: [0, 0.1, 0], s: [0.17, 0.15, 0.25] });
    for (const [x, y, z] of [[0.15, 0.13, 0.05], [-0.15, 0.1, -0.08], [0.12, 0.05, -0.15], [-0.13, 0.16, 0.1], [0, 0.24, -0.05]]) {
      const s = part(body, GEO.sphLo, spot, { p: [x, y, z], s: [0.05, 0.045, 0.012], ol: false, sh: false });
      s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(x / 0.17, (y - 0.1) / 0.15, z / 0.25).normalize());
    }
    tail(rig, body, 'rat', fur, 0.12, -0.24);
    // pescoço (pivô inclinado para a frente)
    const neck = pivot(body, 0, 0.17, 0.17, 'neck');
    neck.rotation.x = 0.25;
    part(neck, GEO.cap, fur, { p: [0, 0.2, 0], s: [0.06, 0.12, 0.06] });
    for (const y of [0.1, 0.22, 0.34]) part(neck, GEO.sphLo, spot, { p: [0.045, y, 0.03], s: [0.02, 0.03, 0.012], ol: false, sh: false });
    // crina
    part(neck, GEO.box, mix(fur, '#c0703a', 0.7), { p: [0, 0.22, -0.055], s: [0.02, 0.36, 0.03], ol: false });
    rig.neckPivot = neck;
    const R = 0.15, hs = [0.95, 0.95, 1.2];
    const head = pivot(neck, 0, 0.47, 0.03, 'head');
    head.rotation.x = -0.25;
    rig.headPitch0 = -0.25;
    rig.head = head;
    rig.parts.head = part(head, GEO.sph, fur, { s: [R * hs[0], R * hs[1], R * hs[2]] });
    part(head, GEO.sph, mix(fur, '#fff1d0', 0.45), { p: [0, -R * 0.35, R * 0.9], s: [R * 0.62, R * 0.5, R * 0.5] });
    addFace(rig, head, { R, sc: hs, lashes: true, eyeY: 0.18, eyeSize: 1.2, spacing: 1.08, cheekY: -0.18, cheekX: 0.66, mouthY: -0.62 });
    if (rig.mouth) rig.mouth.position.set(0, -R * 0.55, R * 1.32);
    // chifrinhos (ossicones)
    for (const side of [1, -1]) {
      part(head, GEO.cylLo, fur, { p: [side * R * 0.35, R * 1.05, -R * 0.3], r: [0, 0, -side * 0.15], s: [0.018, R * 0.6, 0.018], ol: false });
      part(head, GEO.sph, mix(fur, '#c0703a', 0.7), { p: [side * R * 0.4, R * 1.38, -R * 0.3], s: 0.03 });
    }
    ears(rig, head, R, 'tri', fur, PINK);
    for (const e of rig.ears) { e.rotation.z = -e.userData.side * 1.25; e.position.y = R * 0.45; e.position.x *= 1.5; }
    anchor(rig, 'headTop', head, 0, R * 0.95, 0, R);
    anchor(rig, 'face', head, 0, 0, R * hs[2], R);
    anchor(rig, 'neck', neck, 0, 0.05, 0, 0.12);
    anchor(rig, 'chest', body, 0, 0.12, 0.22, 0.15);
    anchor(rig, 'waist', body, 0, 0.05, 0.22, 0.15);
    anchor(rig, 'back', body, 0, 0.24, 0, 0.17);
    anchor(rig, 'hip', body, -0.17, 0.1, 0, 0.15);
    rig.armR = rig.legs[1];
    rig.armL = rig.legs[0];
    rig.armRest = 0;
    rig.top = legH + 0.17 + 0.47 * Math.cos(0.25) + R * 1.3;
    rig.headYawMax = 0.9;
    return rig;
  },

  preguica(def) {
    const L = def.look;
    const face = mix(L.body, '#fff1dc', 0.55);
    const rig = biped(def, {
      R: 0.27, bodyR: 0.21, bodyH: 0.36, legH: 0.09, face, sleeve: L.body, armLen: 0.3, skirt: true,
      faceOpts: { eyeY: 0.06 },
      extra(rig, { head, R, hs }) {
        // mascarinha escura em volta dos olhos
        for (const side of [1, -1]) {
          const m = part(head, GEO.sph, mix(L.body, '#3a2a2a', 0.45), { s: [R * 0.32, R * 0.16, R * 0.06], ol: false, sh: false });
          onHead(m, R, hs, side * R * 0.42, R * 0.0, -R * 0.03);
          m.rotateZ(-side * 0.35);
        }
        // cabelinho bagunçado
        part(head, GEO.sph, L.body, { p: [0, R * 0.75, -R * 0.2], s: [R * 0.85, R * 0.4, R * 0.75] });
        const n = part(head, GEO.sph, '#4a3030', { s: [R * 0.1, R * 0.07, R * 0.06], ol: false, sh: false });
        onHead(n, R, hs, 0, -R * 0.18, 0);
        // garrinhas compridas
        for (const arm of [rig.armL, rig.armR]) {
          for (const k of [-1, 0, 1]) part(arm, GEO.coneLo, '#fff4e8', { p: [k * 0.02, -0.35, 0.02], r: [PI, 0, 0], s: [0.01, 0.05, 0.01], ol: false, sh: false });
        }
      },
    });
    rig.gait = 'slow';
    rig.speed = 0.25;
    rig.sleepy = 0.55;
    return rig;
  },

  gato(def) {
    const L = def.look;
    return biped(def, {
      R: 0.28, bodyR: 0.19, bodyH: 0.34, legH: 0.11, sleeve: L.body, ears: 'tri', tail: 'cat', skirt: true,
      faceOpts: { eyeY: 0.08, eyeSize: 1.05 },
      extra(rig, { head, R, hs }) {
        const n = part(head, GEO.sph, '#ff8fab', { s: [R * 0.08, R * 0.06, R * 0.05], ol: false, sh: false, glow: 0.2 });
        onHead(n, R, hs, 0, -R * 0.17, R * 0.01);
        whiskers(head, R, hs, -0.24);
        if (rig.mouth) onHead(rig.mouth, R, hs, 0, -R * 0.34, R * 0.005);
      },
    });
  },

  rato(def) {
    const L = def.look;
    return biped(def, {
      R: 0.28, bodyR: 0.18, bodyH: 0.32, legH: 0.1, sleeve: L.body, ears: 'bigRound', tail: 'rat', tailColor: '#ffb3c1',
      faceOpts: { eyeY: 0.12 },
      extra(rig, { head, R, hs }) {
        const m = part(head, GEO.sph, mix(L.body, WHITE, 0.4), { s: [R * 0.3, R * 0.24, R * 0.42] });
        onHead(m, R, hs, 0, -R * 0.22, -R * 0.08);
        m.quaternion.identity();
        const n = part(head, GEO.sph, '#ff8fab', { s: [R * 0.09, R * 0.08, R * 0.07], ol: false, sh: false, glow: 0.2 });
        onHead(n, R, hs, 0, -R * 0.14, R * 0.36);
        whiskers(head, R, hs, -0.2);
        if (rig.mouth) onHead(rig.mouth, R, hs, 0, -R * 0.46, R * 0.12);
      },
    });
  },

  beija_flor(def) {
    const L = def.look;
    const rig = bird(def, {
      bodyR: [0.2, 0.22, 0.24], R: 0.2, belly: mix(L.outfit, WHITE, 0.2), wing: mix(L.body, '#ffffff', 0.35), beak: '#3d2236',
      beakLen: 1.2, beakW: 0.06, legH: 0.05, tailN: 2, tailLen: 0.12, wingLen: 0.2, faceOpts: { eyeY: 0.14 },
    });
    rig.gait = 'hover';
    rig.hover = 0.55;
    rig.flap = 'fast';
    rig.body.rotation.x = 0.25;
    rig.speed = 1.6;
    return rig;
  },

  periquito(def) {
    const L = def.look;
    const rig = bird(def, {
      bodyR: [0.29, 0.31, 0.28], R: 0.28, headRise: 0.42, eyeSize: 1.15, belly: mix(L.body, '#fff59a', 0.45),
      wing: mix(L.body, '#2f9a4a', 0.4), wingTip: '#2b9fd2', tailColor: '#35c3b0', tailN: 2, tailLen: 0.16,
      beak: '#ffa83c', beakLen: 0.22, beakW: 0.17, legColor: '#ff9f8a', faceOpts: { cheekY: -0.18, cheekX: 0.64 },
      extra(rig, { head, R }) {
        rig.parts.beak.rotation.x = PI / 2 + 0.45;
        rig.parts.beak.position.y = -R * 0.18;
        // topete arrepiado
        for (const k of [-1, 0, 1]) {
          const g = pivot(head, k * R * 0.15, R * 0.88, R * 0.1);
          g.rotation.set(0.5, 0, -k * 0.4);
          part(g, GEO.sph, mix(L.body, '#ffffff', 0.25), { p: [0, R * 0.2, 0], s: [R * 0.08, R * 0.24, R * 0.06] });
        }
      },
    });
    return rig;
  },
};

// Espécies sem construtor próprio caem num bichinho redondo genérico (nunca quebra se o roteiro ganhar alguém novo).
function generic(def) {
  return biped(def, { ears: 'round', tail: 'puff', sleeve: def.look.body });
}

/** Constrói o modelo do morador (sem escala: o npcs.js aplica look.size). */
export function buildNPCModel(def) {
  const build = SPECIES[def.species] ?? generic;
  const rig = build(def);
  addAccessory(rig, def);
  if (rig.flag) rig.flag.userData.keep = true;
  bakeRig(rig, [rig.visual, rig.body, rig.head, rig.armL, rig.armR, ...rig.legs, ...rig.ears, rig.tail, rig.fan, rig.neckPivot]);
  return rig;
}

export const KNOWN_SPECIES = Object.keys(SPECIES);
