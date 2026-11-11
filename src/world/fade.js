// Desbotamento por região feito na GPU (terreno, água, grama e decoração instanciada).
// Cada vértice/instância carrega os pesos das 6 regiões (aRw0, aRw1); o uniform uRegT guarda
// a cor atual de cada região (0 = desbotado, 1 = colorido). Mesma fórmula de core/materials.js.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { REGIONS, SPOTS } from '../data/worldmap.js';
import { noise2, smoothstep } from '../core/util.js';

export const REGION_IDS = REGIONS.map((r) => r.id);
export const NR = REGIONS.length; // o shader assume 6 regiões (2 × vec3)

// uRegT = cor atual/alvo de cada região; uRegT0 = cor antiga. Durante uma restauração de cor, uWave = (x, z, raio):
// dentro do raio vale uRegT, fora vale uRegT0 — a cor se espalha em onda a partir da Quim. Parado: raio enorme.
export const shared = {
  uRegT: { value: REGIONS.map(() => 1) },
  uRegT0: { value: REGIONS.map(() => 1) },
  uWave: { value: new THREE.Vector3(0, 0, 1e6) },
  uFadeTint: { value: new THREE.Color('#a99fc6') },
  uTime: { value: 0 },
};

// Pesos normalizados das regiões em (x,z): w = exp(-2·q⁴) + 0,08·exp(-1,6·q²), q = distância/raio, com as
// coordenadas levemente "entortadas" por ruído — fronteiras orgânicas e campos de transição que misturam as
// cores vizinhas (sem fatias retas vistas de cima). Dentro de ~0,7·raio a região é pura. Escreve em out (tamanho NR).
const RC = REGIONS.map((r) => [r.center.x, r.center.z, 1 / r.radius]);
export function regionWeights(x, z, out) {
  const wx = x + 11 * noise2(x / 60 + 3.1, z / 60 - 1.7), wz = z + 11 * noise2(x / 60 - 5.3, z / 60 + 2.9);
  let s = 0;
  for (let i = 0; i < NR; i++) {
    const c = RC[i];
    const dx = (wx - c[0]) * c[2], dz = (wz - c[1]) * c[2];
    const q2 = dx * dx + dz * dz;
    const w = Math.exp(-2 * q2 * q2) + 0.08 * Math.exp(-1.6 * q2);
    out[i] = w; s += w;
  }
  for (let i = 0; i < NR; i++) out[i] /= s;
  return out;
}

// Pesos para o desbotamento: iguais aos da região, mas somem na clareira da Casinha Asas de Saudade,
// que nasce colorida e nunca desbota (peso total 0 = sempre colorido no shader).
const ASAS = SPOTS.asas_de_saudade;
export function fadeWeights(x, z, out) {
  regionWeights(x, z, out);
  const m = smoothstep(ASAS.radius + 2, ASAS.radius + 9, Math.hypot(x - ASAS.x, z - ASAS.z));
  for (let i = 0; i < NR; i++) out[i] *= m;
  return out;
}

const VERT_PARS = `
uniform float uRegT[${NR}];
uniform float uRegT0[${NR}];
uniform vec3 uWave;
uniform float uTime;
attribute vec3 aRw0;
attribute vec3 aRw1;
attribute float aTint;
varying float vRegT;
varying float vWave;
`;
const VERT_MAIN = `
{
  vec4 rwp = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    rwp = instanceMatrix * rwp;
  #endif
  rwp = modelMatrix * rwp;
  float wd = distance(rwp.xz, uWave.xy);
  float wv = 1.0 - smoothstep(uWave.z - 14.0, uWave.z, wd);
  vWave = uWave.z < 1e5 ? max(0.0, 1.0 - abs(wd - uWave.z + 6.0) / 6.0) : 0.0;
  float rs = aRw0.x + aRw0.y + aRw0.z + aRw1.x + aRw1.y + aRw1.z;
  float t1 = (aRw0.x * uRegT[0] + aRw0.y * uRegT[1] + aRw0.z * uRegT[2]
    + aRw1.x * uRegT[3] + aRw1.y * uRegT[4] + aRw1.z * uRegT[5]) / max(rs, 1e-4);
  float t0 = (aRw0.x * uRegT0[0] + aRw0.y * uRegT0[1] + aRw0.z * uRegT0[2]
    + aRw1.x * uRegT0[3] + aRw1.y * uRegT0[4] + aRw1.z * uRegT0[5]) / max(rs, 1e-4);
  vRegT = mix(1.0, mix(t0, t1, wv), clamp(rs, 0.0, 1.0));
  vWave *= clamp(abs(t1 - t0) * 4.0, 0.0, 1.0);   // só brilha onde a cor está mudando
}
`;
const FRAG_PARS = `
uniform vec3 uFadeTint;
uniform float uTime;
varying float vRegT;
varying float vWave;
`;
const FRAG_MAIN = `
{
  float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
  vec3 faded = mix(mix(vec3(lum), uFadeTint, 0.4) * 0.8, diffuseColor.rgb, 0.14);
  diffuseColor.rgb = mix(faded, diffuseColor.rgb, clamp(vRegT, 0.0, 1.0));
  diffuseColor.rgb += vec3(1.0, 0.9, 1.0) * vWave * 0.35;   // brilho na frente da onda de cor
}
`;
// Cor de vértice × cor da instância só onde aTint = 1 (pétalas tingidas, caule verde intacto).
const TINT_COLOR_VERTEX = `
#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
  vColor = vec3(1.0);
#endif
#ifdef USE_COLOR
  vColor *= color;
#endif
#ifdef USE_INSTANCING_COLOR
  vColor *= mix(vec3(1.0), instanceColor.xyz, aTint);
#endif
`;

/**
 * Injeta o desbotamento por região (e extras opcionais) num material da three.
 * o: { key, uniforms, vertexPars, vertexMain (após begin_vertex), project (substitui project_vertex),
 *      fragmentPars, fragmentColor (após color_fragment, antes do desbotamento),
 *      fragmentEmissive (após emissivemap_fragment: pode somar em totalEmissiveRadiance), tint: bool }
 */
export function patchMaterial(mat, o = {}) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRegT = shared.uRegT;
    shader.uniforms.uRegT0 = shared.uRegT0;
    shader.uniforms.uWave = shared.uWave;
    shader.uniforms.uFadeTint = shared.uFadeTint;
    shader.uniforms.uTime = shared.uTime;
    if (o.uniforms) Object.assign(shader.uniforms, o.uniforms);
    let vs = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}\n${o.vertexPars || ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERT_MAIN}\n${o.vertexMain || ''}`);
    if (o.tint) vs = vs.replace('#include <color_vertex>', TINT_COLOR_VERTEX);
    if (o.project) vs = vs.replace('#include <project_vertex>', o.project);
    shader.vertexShader = vs;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_PARS}\n${o.fragmentPars || ''}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${o.fragmentColor || ''}\n${FRAG_MAIN}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
${o.fragmentEmissive || ''}`);
  };
  mat.customProgramCacheKey = () => 'mo-' + (o.key || 'fade');
  return mat;
}

// ------------------------------------------------------------------------------------------
// Utilidades de geometria para a decoração instanciada (cor de vértice + aTint).
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Matriz de transformação: posição, escala, rotação (radianos). */
export function xf(x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0) {
  _q.setFromEuler(_e.set(rx, ry, rz));
  return _m.clone().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}

/** Pedaço de geometria colorido (não indexado, só position/normal/color/aTint). */
export function part(geo, color, tint = 0, matrix = null) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  if (matrix) g.applyMatrix4(matrix);
  const n = g.attributes.position.count;
  const c = new THREE.Color(color);
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aTint', new THREE.BufferAttribute(new Float32Array(n).fill(tint), 1));
  return g;
}

export function merge(parts) {
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return g;
}

/** Geometria nova que compartilha os atributos da base (para ter atributos de instância próprios). */
export function shareGeometry(base) {
  const g = new THREE.BufferGeometry();
  for (const [k, a] of Object.entries(base.attributes)) g.setAttribute(k, a);
  if (base.index) g.setIndex(base.index);
  return g;
}

const _W = new Float64Array(NR);
const _dummy = new THREE.Object3D();
const _col = new THREE.Color();
/**
 * InstancedMesh com pesos de região por instância.
 * items: [{ x, y, z, ry?, rx?, rz?, s? | sx,sy,sz, color? }]
 */
export function makeInstanced(baseGeo, material, items, { cast = false, receive = true } = {}) {
  const n = items.length;
  if (!n) return null;
  const geo = shareGeometry(baseGeo);
  const rw0 = new Float32Array(n * 3), rw1 = new Float32Array(n * 3);
  const mesh = new THREE.InstancedMesh(geo, material, n);
  for (let i = 0; i < n; i++) {
    const it = items[i];
    _dummy.position.set(it.x, it.y, it.z);
    _dummy.rotation.set(it.rx || 0, it.ry || 0, it.rz || 0);
    const s = it.s ?? 1;
    _dummy.scale.set(it.sx ?? s, it.sy ?? s, it.sz ?? s);
    _dummy.updateMatrix();
    mesh.setMatrixAt(i, _dummy.matrix);
    mesh.setColorAt(i, it.color ? _col.copy(it.color) : _col.setRGB(1, 1, 1));
    fadeWeights(it.x, it.z, _W);
    rw0[i * 3] = _W[0]; rw0[i * 3 + 1] = _W[1]; rw0[i * 3 + 2] = _W[2];
    rw1[i * 3] = _W[3]; rw1[i * 3 + 1] = _W[4]; rw1[i * 3 + 2] = _W[5];
  }
  geo.setAttribute('aRw0', new THREE.InstancedBufferAttribute(rw0, 3));
  geo.setAttribute('aRw1', new THREE.InstancedBufferAttribute(rw1, 3));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return mesh;
}

/** Atributos de região constantes numa geometria comum (objetos únicos, ex.: decoração com olhos). */
export function setRegionAttrs(geo, x, z) {
  fadeWeights(x, z, _W);
  const n = geo.attributes.position.count;
  const a0 = new Float32Array(n * 3), a1 = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    a0[i * 3] = _W[0]; a0[i * 3 + 1] = _W[1]; a0[i * 3 + 2] = _W[2];
    a1[i * 3] = _W[3]; a1[i * 3 + 1] = _W[4]; a1[i * 3 + 2] = _W[5];
  }
  geo.setAttribute('aRw0', new THREE.BufferAttribute(a0, 3));
  geo.setAttribute('aRw1', new THREE.BufferAttribute(a1, 3));
  return geo;
}
