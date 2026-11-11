// Materiais compartilhados em estilo toon + sistema de "cor desbotada" por região.
// Todo material de cenário criado com toon(cor, { region }) entra no registro da região
// e passa a obedecer setRegionSaturation(regionId, t): t=0 desbotado (cinza-lilás), t=1 colorido.
import * as THREE from 'three';

let gradientMap = null;
function getGradient() {
  if (gradientMap) return gradientMap;
  // 4 faixas de luz: sombra suave, meio-tom, luz, brilho.
  const data = new Uint8Array([90, 90, 90, 255, 160, 160, 160, 255, 215, 215, 215, 255, 255, 255, 255, 255]);
  gradientMap = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  gradientMap.minFilter = THREE.NearestFilter;
  gradientMap.magFilter = THREE.NearestFilter;
  gradientMap.needsUpdate = true;
  return gradientMap;
}

const fadables = new Map();   // regionId -> [{ mat, color, emissive }]
const regionT = new Map();    // regionId -> t atual
const FADE_TINT = new THREE.Color('#a99fc6'); // cinza lilás do "reino sonolento"

function fadedColor(src, t, out) {
  const l = src.r * 0.3 + src.g * 0.59 + src.b * 0.11;
  // cinza puxado para o lilás, um pouco mais escuro, guardando um tiquinho da cor original (não vira "papel branco")
  out.setRGB(l, l, l).lerp(FADE_TINT, 0.4).multiplyScalar(0.8).lerp(src, 0.14);
  return out.lerp(src, t);
}

/**
 * Material toon.
 * opts: { region?: string, emissive?: color, emissiveIntensity?, transparent?, opacity?, side?, vertexColors?, flatShading? }
 */
export function toon(color, opts = {}) {
  const mat = new THREE.MeshToonMaterial({
    color: new THREE.Color(color),
    gradientMap: getGradient(),
    transparent: !!opts.transparent,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide,
    vertexColors: !!opts.vertexColors,
  });
  if (opts.emissive) {
    mat.emissive = new THREE.Color(opts.emissive);
    mat.emissiveIntensity = opts.emissiveIntensity ?? 1;
  }
  if (opts.region) registerFadable(mat, opts.region);
  return mat;
}

/** Registra um material existente para obedecer à cor da região. */
export function registerFadable(mat, region) {
  if (!fadables.has(region)) fadables.set(region, []);
  const entry = { mat, color: mat.color.clone(), emissive: mat.emissive ? mat.emissive.clone() : null };
  fadables.get(region).push(entry);
  const t = regionT.get(region);
  if (t !== undefined) applyEntry(entry, t);
  return mat;
}

const tmp = new THREE.Color();
function applyEntry(e, t) {
  e.mat.color.copy(fadedColor(e.color, t, tmp));
  if (e.emissive && e.mat.emissive) e.mat.emissive.copy(e.emissive).multiplyScalar(0.35 + 0.65 * t);
}

/** t: 0..1. Barato o bastante para chamar a cada quadro durante uma transição. */
export function setRegionSaturation(region, t) {
  regionT.set(region, t);
  const list = fadables.get(region);
  if (list) for (const e of list) applyEntry(e, t);
}

export function getRegionSaturation(region) {
  return regionT.get(region) ?? 1;
}

/** Cor (THREE.Color) já desbotada conforme a região — útil para cores de vértice. */
export function regionColor(color, region, out = new THREE.Color()) {
  return fadedColor(new THREE.Color(color), regionT.get(region) ?? 1, out);
}

/** Aplica sombra (cast/receive) em toda a hierarquia. */
export function enableShadows(obj, cast = true, receive = true) {
  obj.traverse((o) => { if (o.isMesh) { o.castShadow = cast; o.receiveShadow = receive; } });
  return obj;
}
