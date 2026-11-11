// Peças compartilhadas dos moradores: geometrias unitárias (uma só cópia para todos), materiais toon em cache,
// contorno leve "de desenho" e ajudantes para montar rostos fofos (olhos grandes, bochechas, sorriso).
// Convenção dos modelos: pés em y = 0, frente para +Z, esquerda do personagem = +X. Altura-base ~1 m (look.size escala).
import * as THREE from 'three';
import { toon } from '../core/materials.js';
import { createEyes } from '../core/eyes.js';

// ------------------------------------------------------------------------------------------------
// Geometrias unitárias (centradas na origem). A forma vem do mesh.scale.
export const GEO = {
  sph: new THREE.SphereGeometry(1, 20, 14),
  sphLo: new THREE.SphereGeometry(1, 10, 8),
  dome: new THREE.SphereGeometry(1, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, -0.5, 0), // meia esfera (y -0,5..0,5)
  cyl: new THREE.CylinderGeometry(1, 1, 1, 16),
  cylLo: new THREE.CylinderGeometry(1, 1, 1, 7),
  cone: new THREE.ConeGeometry(1, 1, 14),
  coneLo: new THREE.ConeGeometry(1, 1, 6),
  skirt: new THREE.CylinderGeometry(0.62, 1, 1, 18),        // tronco de cone (saia, balde, chapéu)
  cap: new THREE.CapsuleGeometry(1, 2, 4, 10),             // meia-altura 2 (raio 1 + meio corpo 1)
  tor: new THREE.TorusGeometry(1, 0.22, 8, 24),
  torThin: new THREE.TorusGeometry(1, 0.1, 6, 24),
  smile: new THREE.TorusGeometry(1, 0.2, 6, 14, Math.PI).rotateZ(Math.PI), // "U" do sorriso
  box: new THREE.BoxGeometry(1, 1, 1),
};
// Meia-extensão de cada geometria (para o contorno ficar com espessura parecida em qualquer escala).
const HALF = new Map();
for (const g of Object.values(GEO)) {
  g.computeBoundingBox();
  const b = g.boundingBox;
  HALF.set(g, new THREE.Vector3().subVectors(b.max, b.min).multiplyScalar(0.5));
}

// ------------------------------------------------------------------------------------------------
// Materiais (toon sem região: moradores são sempre coloridos e felizes).
const mats = new Map();
export function mat(color, glow = 0) {
  const key = color + '|' + glow;
  if (!mats.has(key)) mats.set(key, toon(color, glow ? { emissive: color, emissiveIntensity: glow } : {}));
  return mats.get(key);
}
export const BASIC = (() => {
  const cache = new Map();
  return (color) => {
    if (!cache.has(color)) cache.set(color, new THREE.MeshBasicMaterial({ color }));
    return cache.get(color);
  };
})();

export const CHEEK = '#ff8fa6';
export const INK = '#3d2236';
const outlineMat = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
let outlinesOn = true;
/** Liga/desliga contornos para os modelos criados daqui em diante (qualidade baixa = sem contorno). */
export function setOutlines(v) { outlinesOn = v; }

const T_OUTLINE = 0.013;   // espessura do contorno em unidades do modelo (antes do look.size)
/** Casco invertido: cópia da malha só com as faces de trás, levemente inflada eixo a eixo. */
export function outline(mesh) {
  if (!outlinesOn) return null;
  const h = HALF.get(mesh.geometry);
  if (!h) return null;
  const s = mesh.scale;
  const o = new THREE.Mesh(mesh.geometry, outlineMat);
  o.scale.set(1 + T_OUTLINE / Math.max(1e-3, h.x * Math.abs(s.x)),
    1 + T_OUTLINE / Math.max(1e-3, h.y * Math.abs(s.y)),
    1 + T_OUTLINE / Math.max(1e-3, h.z * Math.abs(s.z)));
  o.raycast = () => {};
  o.name = 'contorno';
  mesh.add(o);
  return o;
}

/**
 * Cria uma peça e coloca no pai.
 * o: { p:[x,y,z], s:número|[sx,sy,sz], r:[rx,ry,rz], ol: contorno (true), sh: sombra (true), m: material, glow }
 */
export function part(parent, geo, color, o = {}) {
  const m = new THREE.Mesh(geo, o.m ?? (color ? mat(color, o.glow ?? 0) : undefined));
  if (o.p) m.position.set(o.p[0], o.p[1], o.p[2]);
  if (o.s !== undefined) { if (typeof o.s === 'number') m.scale.setScalar(o.s); else m.scale.set(o.s[0], o.s[1], o.s[2]); }
  if (o.r) m.rotation.set(o.r[0], o.r[1], o.r[2]);
  m.castShadow = o.sh ?? true;
  m.receiveShadow = false;
  if (o.ol ?? true) outline(m);
  parent.add(m);
  return m;
}

/** Grupo vazio (pivô) posicionado no pai. */
export function pivot(parent, x = 0, y = 0, z = 0, name) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  if (name) g.name = name;
  parent.add(g);
  return g;
}

// ------------------------------------------------------------------------------------------------
// Rostos

const ZAXIS = new THREE.Vector3(0, 0, 1);
const tmpN = new THREE.Vector3();
/**
 * Põe um objeto na superfície de uma cabeça elipsoidal (raio R, proporções sc=[sx,sy,sz]) centrada na origem,
 * orientado pela normal. x,y em unidades do modelo; lift = afastamento extra da superfície.
 */
export function onHead(obj, R, sc, x, y, lift = 0) {
  const ax = R * sc[0], ay = R * sc[1], az = R * sc[2];
  const nx = x / ax, ny = y / ay;
  const nz = Math.sqrt(Math.max(0.02, 1 - nx * nx - ny * ny));
  tmpN.set(nx / ax, ny / ay, nz / az).normalize();
  obj.position.set(x, y, nz * az).addScaledVector(tmpN, lift);
  obj.quaternion.setFromUnitVectors(ZAXIS, tmpN);
  return obj;
}

/**
 * Rosto padrão: olhos grandes (core/eyes), bochechas rosadas e sorrisinho.
 * f: { R, sc=[1,1,1], eyeY=0.05, eyeSize=1, spacing=1, lashes, iris, cheekY=-0.3, cheekX=0.56, cheeks=1,
 *      mouthY=-0.38, mouth=true, mouthW=1, eyeZ (padrão: superfície) }
 */
export function addFace(rig, head, f) {
  const R = f.R, sc = f.sc ?? [1, 1, 1];
  const size = R * 0.36 * (f.eyeSize ?? 1);
  const eyes = createEyes({ size, spacing: R * 0.8 * (f.spacing ?? 1), lashes: !!f.lashes, irisColor: f.iris });
  const ey = R * (f.eyeY ?? 0.05);
  const surf = R * sc[2] * Math.sqrt(Math.max(0.05, 1 - (ey / (R * sc[1])) ** 2 - (R * 0.4 * (f.spacing ?? 1) / (R * sc[0])) ** 2));
  eyes.position.set(0, ey, f.eyeZ ?? (surf - size * 0.12));
  head.add(eyes);
  rig.eyes.push(eyes);
  if (f.cheeks !== 0) {
    const k = f.cheeks ?? 1;
    for (const side of [-1, 1]) {
      const c = part(head, GEO.sphLo, CHEEK, { s: [R * 0.17 * k, R * 0.11 * k, R * 0.05], ol: false, sh: false, glow: 0.25 });
      onHead(c, R, sc, side * R * (f.cheekX ?? 0.56), R * (f.cheekY ?? -0.3), -R * 0.01);
    }
  }
  if (f.mouth !== false) {
    const mo = part(head, GEO.smile, '#7c2638', { s: [R * 0.11 * (f.mouthW ?? 1), R * 0.1, R * 0.11], ol: false, sh: false, m: BASIC('#7c2638') });
    onHead(mo, R, sc, 0, R * (f.mouthY ?? -0.38), R * 0.005);
    rig.mouth = mo;
  }
  return eyes;
}

/** Mistura duas cores hex (t = 0 -> a, 1 -> b). */
export function mix(a, b, t) {
  return '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();
}
