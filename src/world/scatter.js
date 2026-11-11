// Decoração procedural (SCATTER): grama instanciada que balança, flores nas cores da região,
// árvores por bioma, pedras, extras de cada região e alguns enfeites com olhinhos.
// Tudo instanciado e com desbotamento por região na GPU (ver fade.js).
import * as THREE from 'three';
import { toon } from '../core/materials.js';
import { createEyes, registerEyes } from '../core/eyes.js';
import { smoothstep, lerp } from '../core/util.js';
import { REGIONS, PATHS, LANDMARKS, PLATFORMS, SCATTER, SPOTS, JUJUBA_SPOTS, SPAWN } from '../data/worldmap.js';
import { patchMaterial, makeInstanced, part, merge, xf, setRegionAttrs, regionWeights, NR } from './fade.js';
import { OCC, isGroundLandmark, footprint } from './terrain.js';

const PLAY_R = 289;
const CHUNK = 64;

// ------------------------------------------------------------------------------------------
// Materiais: um shader "planta" (vento + some de longe + tinta só onde aTint = 1).
function plantMaterial(windAmp, far, key) {
  const uniforms = { uWindAmp: { value: windAmp }, uFar: { value: far } };
  const mat = patchMaterial(toon('#ffffff', { vertexColors: true }), {
    key: 'plant',
    tint: true,
    uniforms,
    vertexPars: 'uniform float uWindAmp;\nuniform float uFar;',
    vertexMain: `
#ifdef USE_INSTANCING
  {
    vec3 iPos = vec3(instanceMatrix[3]);
    float dCam = distance(iPos, cameraPosition);
    transformed *= 1.0 - smoothstep(uFar * 0.72, uFar, dCam);
  }
#endif
`,
    project: `
vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
  {
    float hy = max(position.y, 0.0);
    float ph = uTime * 1.8 + mvPosition.x * 0.13 + mvPosition.z * 0.09;
    vec2 wv = vec2(sin(ph) + 0.35 * sin(ph * 2.7 + mvPosition.z * 0.3), 0.5 * cos(ph * 0.8 + mvPosition.x * 0.2));
    mvPosition.xz += wv * hy * hy * uWindAmp;
  }
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;
`,
  });
  mat.name = key;
  mat.userData.uniforms = uniforms;
  return mat;
}

// ------------------------------------------------------------------------------------------
// Geometrias (cor de vértice; aTint = 1 onde a cor da instância pinta).
const ico = (r, d = 1) => new THREE.IcosahedronGeometry(r, d);
const cyl = (rt, rb, h, s = 6) => new THREE.CylinderGeometry(rt, rb, h, s);

function grassGeometry(rng) {
  const P = [], C = [];
  for (let b = 0; b < 5; b++) {
    const a = rng() * Math.PI * 2, r = rng() * 0.3;
    const bx = Math.cos(a) * r, bz = Math.sin(a) * r;
    const h = 0.36 + rng() * 0.34, w = 0.05 + rng() * 0.03;
    const yaw = rng() * Math.PI, cx = Math.cos(yaw), sx = Math.sin(yaw);
    const lx = (rng() - 0.5) * 0.3, lz = (rng() - 0.5) * 0.3;
    const pts = [[-w, 0], [w, 0], [-w * 0.6, 0.55 * h], [w * 0.6, 0.55 * h], [0, h]];
    const v = pts.map(([u, y]) => [bx + u * cx + lx * (y / h) * (y / h), y, bz + u * sx + lz * (y / h) * (y / h)]);
    for (const [i, j, k] of [[0, 1, 3], [0, 3, 2], [2, 3, 4], [0, 3, 1], [0, 2, 3], [2, 4, 3]]) {
      for (const q of [i, j, k]) {
        P.push(...v[q]);
        const s = 0.62 + 0.38 * (v[q][1] / h);
        C.push(s, s, s);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  const n = P.length / 3;
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  const nor = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) nor[i * 3 + 1] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.setAttribute('aTint', new THREE.BufferAttribute(new Float32Array(n).fill(1), 1));
  return g;
}

function flowerGeometry() {
  const parts = [
    part(cyl(0.018, 0.024, 0.42, 4), '#6cc46a', 0, xf(0, 0.21, 0)),
    part(new THREE.OctahedronGeometry(1), '#7fd47a', 0, xf(0.06, 0.12, 0, 0.08, 0.015, 0.035, 0, 0, 0.5)),
    part(ico(0.045, 0), '#ffd84d', 0, xf(0, 0.445, 0)),
  ];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    parts.push(part(new THREE.OctahedronGeometry(1), '#ffffff', 1,
      xf(Math.cos(a) * 0.075, 0.43, Math.sin(a) * 0.075, 0.075, 0.022, 0.045, 0, -a, 0)));
  }
  return merge(parts);
}

function rockGeometry(seed) {
  const g = ico(1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed * 11.1) * 43758.5453;
    const k = 0.82 + (h - Math.floor(h)) * 0.3;
    p.setXYZ(i, x * k, Math.max(y * k * 0.7, -0.3), z * k);
  }
  g.computeVertexNormals();
  return merge([part(g, '#ffffff', 1)]);
}

function bushGeometry() {
  return merge([
    part(ico(0.75, 1), '#ffffff', 1, xf(0, 0.55, 0)),
    part(ico(0.55, 1), '#ffffff', 1, xf(0.55, 0.42, 0.15)),
    part(ico(0.5, 1), '#ffffff', 1, xf(-0.5, 0.4, -0.15)),
  ]);
}

const TRUNK = '#b98a6a';
function treeGeometry(kind) {
  switch (kind) {
    case 'frutifera': {
      const parts = [
        part(cyl(0.2, 0.3, 2.2), TRUNK, 0, xf(0, 1.1, 0)),
        part(ico(1.4), '#ffffff', 1, xf(0, 3.0, 0)),
        part(ico(1.0), '#ffffff', 1, xf(0.85, 2.6, 0.25)),
        part(ico(0.95), '#ffffff', 1, xf(-0.75, 2.7, -0.3)),
      ];
      for (let i = 0; i < 7; i++) {
        const a = i * 2.4, r = 1.25;
        parts.push(part(ico(0.13, 0), '#ff6b6b', 0, xf(Math.cos(a) * r, 2.6 + (i % 3) * 0.45, Math.sin(a) * r)));
      }
      return merge(parts);
    }
    case 'alta':
      return merge([
        part(cyl(0.3, 0.48, 6, 7), TRUNK, 0, xf(0, 3, 0)),
        part(ico(1.8), '#ffffff', 1, xf(0, 6.6, 0)),
        part(ico(1.35), '#ffffff', 1, xf(0.1, 7.9, 0.1)),
        part(ico(1.3), '#ffffff', 1, xf(1.1, 6.1, 0.4)),
        part(ico(1.2), '#ffffff', 1, xf(-1.0, 6.2, -0.5)),
      ]);
    case 'algodao_doce':
      return merge([
        part(cyl(0.1, 0.13, 2.6), '#fff0f6', 0, xf(0, 1.3, 0)),
        part(ico(1.3), '#ffffff', 1, xf(0, 3.2, 0)),
        part(ico(0.95), '#ffffff', 1, xf(0.95, 2.95, 0.2)),
        part(ico(0.9), '#ffffff', 1, xf(-0.9, 3.0, -0.25)),
        part(ico(0.85), '#ffffff', 1, xf(0.15, 4.15, -0.1)),
        part(ico(0.8), '#ffffff', 1, xf(0.1, 3.1, 0.95)),
      ]);
    case 'podada':
      return merge([
        part(cyl(0.15, 0.2, 1.9), TRUNK, 0, xf(0, 0.95, 0)),
        part(ico(1.05, 2), '#ffffff', 1, xf(0, 2.65, 0)),
      ]);
    case 'pinheirinho':
      return merge([
        part(cyl(0.18, 0.26, 1.0), TRUNK, 0, xf(0, 0.5, 0)),
        part(new THREE.ConeGeometry(1.5, 1.8, 8), '#ffffff', 1, xf(0, 1.7, 0)),
        part(new THREE.ConeGeometry(1.15, 1.5, 8), '#ffffff', 1, xf(0, 2.6, 0)),
        part(new THREE.ConeGeometry(0.8, 1.3, 8), '#ffffff', 1, xf(0, 3.4, 0)),
        part(new THREE.ConeGeometry(0.34, 0.5, 8), '#ffffff', 0, xf(0, 3.92, 0)),
      ]);
    default: // arredondada
      return merge([
        part(cyl(0.22, 0.32, 2.4), TRUNK, 0, xf(0, 1.2, 0)),
        part(ico(1.5), '#ffffff', 1, xf(0, 3.3, 0)),
        part(ico(1.1), '#ffffff', 1, xf(0.9, 2.85, 0.3)),
        part(ico(1.0), '#ffffff', 1, xf(-0.8, 2.95, -0.4)),
        part(ico(0.9), '#ffffff', 1, xf(0.1, 4.25, 0.2)),
      ]);
  }
}
const TREE_TRUNK_R = { arredondada: 0.3, frutifera: 0.28, alta: 0.45, algodao_doce: 0.13, podada: 0.2, pinheirinho: 0.25 };
const TREE_COLORS = {
  arredondada: ['#7fd67a', '#94e07f', '#a6e88c', '#86dc8a', '#ffb8d4'],
  frutifera: ['#86d97c', '#9ee392', '#8fdc86'],
  alta: ['#5fbf72', '#6fcf80', '#7ed98a', '#69c98f'],
  algodao_doce: ['#ffb3d9', '#b3e5ff', '#e0c3ff', '#fff3a3', '#b3ffd9'],
  podada: ['#7fcf86', '#93dd8f', '#88d6a0'],
  pinheirinho: ['#6fbfa0', '#7ccfb0', '#88c9c0'],
};

/** Jujuba/bala de goma (lathe). */
export function gumdropGeometry(seg = 14) {
  const pts = [[0, 0], [0.26, 0], [0.3, 0.06], [0.29, 0.18], [0.23, 0.31], [0.13, 0.39], [0, 0.42]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(pts, seg);
}

function specialGeometries() {
  const mushroom = merge([
    part(cyl(0.06, 0.08, 0.26), '#fff6e8', 0, xf(0, 0.13, 0)),
    part(new THREE.SphereGeometry(0.17, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2), '#ffffff', 1, xf(0, 0.22, 0, 1, 0.8, 1)),
  ]);
  const lollipop = merge([
    part(cyl(0.035, 0.035, 1.1, 5), '#ffffff', 0, xf(0, 0.55, 0)),
    part(cyl(0.34, 0.34, 0.08, 16), '#ffffff', 1, xf(0, 1.3, 0, 1, 1, 1, Math.PI / 2, 0, 0)),
    part(cyl(0.13, 0.13, 0.1, 12), '#ffffff', 0, xf(0, 1.3, 0, 1, 1, 1, Math.PI / 2, 0, 0)),
  ]);
  const cane = merge([
    part(cyl(0.07, 0.07, 1.2, 6), '#ffffff', 0, xf(0, 0.6, 0)),
    part(new THREE.TorusGeometry(0.22, 0.07, 6, 10, Math.PI), '#ffffff', 0, xf(0.22, 1.2, 0)),
  ]);
  { // listras vermelhas
    const p = cane.attributes.position, c = cane.attributes.color;
    const red = new THREE.Color('#ff5470');
    for (let i = 0; i < p.count; i++) {
      if (Math.floor((p.getY(i) + p.getX(i) * 0.6) * 6) % 2 === 0) c.setXYZ(i, red.r, red.g, red.b);
    }
  }
  const fence = merge([
    part(new THREE.BoxGeometry(0.12, 0.85, 0.12), '#ffffff', 1, xf(-1.05, 0.42, 0)),
    part(new THREE.BoxGeometry(0.12, 0.85, 0.12), '#ffffff', 1, xf(1.05, 0.42, 0)),
    part(new THREE.BoxGeometry(2.2, 0.09, 0.05), '#ffffff', 1, xf(0, 0.32, 0)),
    part(new THREE.BoxGeometry(2.2, 0.09, 0.05), '#ffffff', 1, xf(0, 0.64, 0)),
  ]);
  const crate = merge([
    part(new THREE.BoxGeometry(0.8, 0.8, 0.8), '#ffffff', 1, xf(0, 0.4, 0)),
    part(new THREE.BoxGeometry(0.84, 0.1, 0.84), '#c98f5e', 0, xf(0, 0.72, 0)),
    part(new THREE.BoxGeometry(0.84, 0.1, 0.84), '#c98f5e', 0, xf(0, 0.08, 0)),
  ]);
  const pot = merge([
    part(cyl(0.28, 0.2, 0.42, 8), '#e8906a', 0, xf(0, 0.21, 0)),
    part(ico(0.3, 1), '#7fd47a', 0, xf(0, 0.48, 0, 1, 0.7, 1)),
    part(ico(0.1, 0), '#ffffff', 1, xf(0.12, 0.62, 0.05)),
    part(ico(0.1, 0), '#ffffff', 1, xf(-0.1, 0.6, -0.08)),
    part(ico(0.1, 0), '#ffffff', 1, xf(0, 0.66, 0.12)),
  ]);
  const pinwheelParts = [part(cyl(0.025, 0.025, 1.0, 4), '#ffffff', 0, xf(0, 0.5, 0))];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    pinwheelParts.push(part(new THREE.OctahedronGeometry(1), '#ffffff', 1,
      xf(Math.cos(a) * 0.14, 1.0 + Math.sin(a) * 0.14, 0.04, 0.15, 0.06, 0.02, 0, 0, a + 0.4)));
  }
  pinwheelParts.push(part(ico(0.04, 0), '#ffd84d', 0, xf(0, 1.0, 0.07)));
  const cloud = merge([
    part(ico(1.0, 1), '#ffffff', 1, xf(0, 0, 0)),
    part(ico(0.75, 1), '#ffffff', 1, xf(0.95, -0.15, 0.1)),
    part(ico(0.7, 1), '#ffffff', 1, xf(-0.9, -0.1, -0.1)),
    part(ico(0.6, 1), '#ffffff', 1, xf(0.4, 0.45, -0.3)),
    part(ico(0.55, 1), '#ffffff', 1, xf(-0.4, 0.35, 0.35)),
  ]);
  const gum = merge([part(gumdropGeometry(10), '#ffffff', 1)]);
  return { mushroom, lollipop, cane, fence, crate, pot, pinwheel: merge(pinwheelParts), cloud, gum };
}

// ------------------------------------------------------------------------------------------
/**
 * opts: { scene, terrain, quality, rng, onCollider(c) }
 * Retorna { update(camX, camZ), eyed: [...] }.
 */
export function buildScatter({ scene, terrain, quality, rng, onCollider }) {
  const Q = quality === 'baixa' ? 0.55 : quality === 'alta' ? 1.35 : 1;
  const grassFar = quality === 'baixa' ? 70 : quality === 'alta' ? 140 : 105;
  const flowerFar = grassFar + 40;
  const root = new THREE.Group();
  root.name = 'decoracao';
  scene.add(root);

  const grassMat = plantMaterial(0.3, grassFar, 'grama');
  const flowerMat = plantMaterial(0.35, flowerFar, 'flores');
  const treeMat = plantMaterial(0.004, 1e6, 'arvores');
  const propMat = plantMaterial(0, 1e6, 'enfeites');

  const W = new Float64Array(NR);
  const tmp = new Float32Array(3);
  const col = new THREE.Color();
  const pick = (arr) => arr[Math.floor(rng() * arr.length) % arr.length];
  const regionById = Object.fromEntries(REGIONS.map((r) => [r.id, r]));

  // Quão "fora das regiões" (transição) é o ponto: 0 dentro, 1 fora.
  function outside(x, z) {
    let m = Infinity;
    for (const r of REGIONS) m = Math.min(m, Math.hypot(x - r.center.x, z - r.center.z) / r.radius);
    return smoothstep(0.85, 1.12, m);
  }
  function nearestRegion(x, z) {
    let best = REGIONS[0], bd = Infinity;
    for (const r of REGIONS) {
      const d = Math.hypot(x - r.center.x, z - r.center.z) / r.radius;
      if (d < bd) { bd = d; best = r; }
    }
    return best;
  }

  // --- obstáculos (marcos, plataformas, pontos da história, jujubas) num hash espacial ---
  const OCELL = 16, obst = new Map();
  let maxObR = 0;
  function addObstacle(x, z, r) {
    maxObR = Math.max(maxObR, r);
    const key = Math.floor(x / OCELL) + ',' + Math.floor(z / OCELL);
    if (!obst.has(key)) obst.set(key, []);
    obst.get(key).push(x, z, r);
  }
  for (const l of LANDMARKS) if (isGroundLandmark(l)) addObstacle(l.x, l.z, footprint(l));
  for (const p of PLATFORMS) addObstacle(p.x, p.z, (p.radius ?? Math.max(p.w ?? 2, p.d ?? 2) / 2) + 4);
  for (const j of JUJUBA_SPOTS) addObstacle(j.x, j.z, 0.8);
  addObstacle(SPAWN.x, SPAWN.z, 4);
  // Clareira da Casinha Asas de Saudade: reservada (docs/casinha-asas-de-saudade.md) — nada de árvore/pedra/arbusto.
  const ASAS = SPOTS.asas_de_saudade;
  if (ASAS) addObstacle(ASAS.x, ASAS.z, ASAS.radius + 2);
  (function walk(v) {
    if (Array.isArray(v)) { for (const e of v) walk(e); return; }
    if (v && typeof v === 'object') {
      if (typeof v.x === 'number' && typeof v.z === 'number') addObstacle(v.x, v.z, 1.5);
      for (const k of Object.keys(v)) if (typeof v[k] === 'object') walk(v[k]);
    }
  })(SPOTS);

  function blocked(x, z, clr) {
    const reach = clr + maxObR;
    const i0 = Math.floor((x - reach) / OCELL), i1 = Math.floor((x + reach) / OCELL);
    const j0 = Math.floor((z - reach) / OCELL), j1 = Math.floor((z + reach) / OCELL);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const a = obst.get(i + ',' + j);
        if (!a) continue;
        for (let k = 0; k < a.length; k += 3) {
          const dx = x - a[k], dz = z - a[k + 1], rr = a[k + 2] + clr;
          if (dx * dx + dz * dz < rr * rr) return true;
        }
      }
    }
    return false;
  }
  const RING = [[1, 0], [0.71, 0.71], [0, 1], [-0.71, 0.71], [-1, 0], [-0.71, -0.71], [0, -1], [0.71, -0.71]];
  /** Lugar livre para algo de raio clr (longe de trilha, água, marcos e plataformas). */
  function isOpen(x, z, clr, useObst = true) {
    if (x * x + z * z > PLAY_R * PLAY_R) return false;
    if (terrain.occAt(x, z)) return false;
    for (const [dx, dz] of RING) {
      if (terrain.occAt(x + dx * clr, z + dz * clr)) return false;
      if (clr > 1.5 && terrain.occAt(x + dx * clr * 0.5, z + dz * clr * 0.5)) return false;
    }
    return !(useObst && blocked(x, z, clr));
  }
  function regionPoint(reg) {
    if (!reg) { // transição: fora de todas as regiões
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * PLAY_R;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      for (const R of REGIONS) if (Math.hypot(x - R.center.x, z - R.center.z) < R.radius) return null;
      return [x, z];
    }
    const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * reg.radius * 0.96;
    return [reg.center.x + Math.cos(a) * r, reg.center.z + Math.sin(a) * r];
  }
  const groundY = (x, z) => terrain.surfaceHeight(x, z);

  // --- grama e flores em pedaços (chunks) para cortar o que está longe ---
  const NC = Math.ceil((PLAY_R * 2 + 10) / CHUNK);
  const C0 = -NC * CHUNK / 2;
  const chunks = [];
  for (let j = 0; j < NC; j++) for (let i = 0; i < NC; i++) {
    chunks.push({ x0: C0 + i * CHUNK, z0: C0 + j * CHUNK, cx: C0 + (i + 0.5) * CHUNK, cz: C0 + (j + 0.5) * CHUNK, grass: [], flowers: [], meshes: [] });
  }
  const chunkAt = (x, z) => {
    const i = Math.floor((x - C0) / CHUNK), j = Math.floor((z - C0) / CHUNK);
    return i >= 0 && j >= 0 && i < NC && j < NC ? chunks[j * NC + i] : null;
  };

  // Grama: densidade = mistura das regiões (ou da transição).
  const GD = REGIONS.map((r) => SCATTER[r.id]?.grassDensity ?? 0.7);
  const GD_T = SCATTER.transicao?.grassDensity ?? 0.9;
  const TUFTS = 0.13 * Q;
  for (const ch of chunks) {
    const n = Math.round(CHUNK * CHUNK * TUFTS);
    for (let k = 0; k < n; k++) {
      const x = ch.x0 + rng() * CHUNK, z = ch.z0 + rng() * CHUNK;
      if (x * x + z * z > 296 * 296) continue;
      regionWeights(x, z, W);
      let gd = 0;
      for (let i = 0; i < NR; i++) gd += W[i] * GD[i];
      gd = lerp(gd, GD_T, outside(x, z));
      if (rng() > gd) continue;
      if (terrain.occAt(x, z) || terrain.paintAt(x, z) > 0.25) continue;
      const y = groundY(x, z);
      terrain.colorAt(x, z, y, 1, tmp, 0, true);
      const b = 1.05 + rng() * 0.18;
      const c = new THREE.Color(Math.min(1, tmp[0] * b), Math.min(1, tmp[1] * b), Math.min(1, tmp[2] * b));
      const s = 0.8 + rng() * 0.5;
      ch.grass.push({ x, y: y - 0.03, z, ry: rng() * Math.PI * 2, sx: s, sy: s * (0.8 + rng() * 0.5), sz: s, color: c });
    }
  }

  // Flores em canteiros naturais (manchas), nas cores de destaque da região.
  function addFlower(x, z, color, s = 0.9 + rng() * 0.5) {
    const ch = chunkAt(x, z);
    if (!ch || !isOpen(x, z, 0.3, false)) return false;
    ch.flowers.push({ x, y: groundY(x, z) - 0.02, z, ry: rng() * Math.PI * 2, s, color: col.set(color).clone() });
    return true;
  }
  function flowerPatches(reg, total, nearPaths = 0) {
    let placed = 0, tries = 0;
    const accents = (reg || null)?.palette.accents;
    while (placed < total && tries++ < total * 6) {
      let p = null;
      if (nearPaths && rng() < nearPaths) {
        const path = pick(PATHS.filter((q) => !q.secret));
        const s = Math.floor(rng() * (path.points.length - 1));
        const [ax, az] = path.points[s], [bx, bz] = path.points[s + 1];
        const t = rng(), len = Math.hypot(bx - ax, bz - az) || 1;
        const off = (path.width / 2 + 1 + rng() * 3) * (rng() < 0.5 ? -1 : 1);
        p = [ax + (bx - ax) * t - (bz - az) / len * off, az + (bz - az) * t + (bx - ax) / len * off];
        if (!reg && outside(p[0], p[1]) < 0.5) p = null;
      } else p = regionPoint(reg);
      if (!p) continue;
      const pal = accents || nearestRegion(p[0], p[1]).palette.accents;
      const main = pick(pal);
      const k = 3 + Math.floor(rng() * 7);
      for (let i = 0; i < k && placed < total; i++) {
        const a = rng() * Math.PI * 2, r = rng() * 2.6;
        if (addFlower(p[0] + Math.cos(a) * r, p[1] + Math.sin(a) * r, rng() < 0.75 ? main : pick(pal))) placed++;
      }
    }
  }
  for (const reg of REGIONS) flowerPatches(reg, Math.round((SCATTER[reg.id]?.flowers ?? 300) * Q));
  flowerPatches(null, Math.round((SCATTER.transicao?.flowers ?? 600) * Q),
    SCATTER.transicao?.special?.includes('flores_do_caminho') ? 0.4 : 0);
  // Trilhinha das Flores Azuis (secreta): só flores azuis e brancas na beira, e um tapetinho delas na clareira.
  const asasPath = PATHS.find((q) => q.id === 'trilha_asas');
  if (asasPath) {
    const BW = ['#7fc8ff', '#ffffff', '#a8d8ff', '#ffffff', '#5fb0ff'];
    for (let s = 0; s < asasPath.points.length - 1; s++) {
      const [ax, az] = asasPath.points[s], [bx, bz] = asasPath.points[s + 1];
      const len = Math.hypot(bx - ax, bz - az) || 1, nx = -(bz - az) / len, nz = (bx - ax) / len;
      for (let d = 0; d < len; d += 0.7) {
        for (const side of [-1, 1]) {
          const off = (asasPath.width / 2 + 0.3 + rng() * 0.8) * side;
          addFlower(ax + (bx - ax) * d / len + nx * off, az + (bz - az) * d / len + nz * off, pick(BW), 0.8 + rng() * 0.5);
        }
      }
    }
    if (ASAS) for (let i = 0; i < 90 * Q; i++) {
      const a = rng() * Math.PI * 2, r = ASAS.radius * (0.55 + 0.45 * Math.sqrt(rng()));
      const fx = ASAS.x + Math.cos(a) * r, fz = ASAS.z + Math.sin(a) * r;
      if (Math.hypot(fx - ASAS.laguinho.x, fz - ASAS.laguinho.z) < ASAS.laguinho.r + 0.5) continue;
      addFlower(fx, fz, pick(['#7fc8ff', '#ffffff', '#ffffff', '#a8d8ff']), 0.8 + rng() * 0.5);
    }
  }
  // Margaridas altas do Campo.
  if (SCATTER.campo?.special?.includes('margaridas_altas')) {
    for (let i = 0, t = 0; i < 120 * Q && t < 2000; t++) {
      const p = regionPoint(regionById.campo);
      if (p && addFlower(p[0], p[1], rng() < 0.8 ? '#ffffff' : '#fff3a3', 2.0 + rng() * 0.7)) i++;
    }
  }

  const grassGeo = grassGeometry(rng);
  const flowerGeo = flowerGeometry();
  for (const ch of chunks) {
    const g = makeInstanced(grassGeo, grassMat, ch.grass, { receive: true });
    const f = makeInstanced(flowerGeo, flowerMat, ch.flowers, { receive: true });
    for (const m of [g, f]) if (m) { root.add(m); ch.meshes.push(m); }
    ch.grass = ch.flowers = null;
  }

  // --- árvores ---
  const treeBuckets = {};
  function addTree(kind, x, z, color) {
    const y = groundY(x, z);
    const s = 0.8 + rng() * 0.6;
    (treeBuckets[kind] ||= []).push({ x, y: y - 0.1, z, ry: rng() * Math.PI * 2, s, color: col.set(color).clone() });
    addObstacle(x, z, 1.6 * s);
    const r = (TREE_TRUNK_R[kind] ?? 0.3) * s + 0.12;
    onCollider({ kind: 'circle', x, z, r, y0: y - 2, y1: y + 60 });
  }
  function plantTrees(reg, count, kind) {
    let n = 0, tries = 0;
    while (n < count && tries++ < count * 40) {
      const p = regionPoint(reg);
      if (!p || !isOpen(p[0], p[1], 3)) continue;
      addTree(kind, p[0], p[1], pick(TREE_COLORS[kind] || TREE_COLORS.arredondada));
      n++;
    }
  }
  for (const reg of REGIONS) {
    const sc = SCATTER[reg.id] || {};
    plantTrees(reg, Math.round((sc.trees ?? 20) * Math.min(1, Q + 0.2)), sc.treeKind || 'arredondada');
  }
  plantTrees(null, Math.round((SCATTER.transicao?.trees ?? 100) * Math.min(1, Q + 0.2)), SCATTER.transicao?.treeKind || 'arredondada');
  for (const [kind, items] of Object.entries(treeBuckets)) {
    const m = makeInstanced(treeGeometry(kind), treeMat, items, { cast: true, receive: true });
    if (m) { m.name = 'arvores_' + kind; root.add(m); }
  }

  // --- pedras ---
  const ROCK_COLORS = { campo: '#d6cfe0', vila: '#d9d2df', ninhal: '#b9cdb0', bosque: '#f3c9da', cidade: '#dcd7e6', pico: '#dfe6f2' };
  const rockBuckets = [[], [], []];
  function addRock(x, z, s, color) {
    const y = groundY(x, z);
    rockBuckets[Math.floor(rng() * 3)].push({ x, y: y - 0.2 * s, z, ry: rng() * Math.PI * 2, s, color: col.set(color).clone() });
    addObstacle(x, z, s);
    if (s > 0.7) onCollider({ kind: 'circle', x, z, r: 0.8 * s, y0: y - 2, y1: y + 0.5 * s });
  }
  function placeRocks(reg, count, colorFn, sMin, sMax) {
    let n = 0, tries = 0;
    while (n < count && tries++ < count * 30) {
      const p = regionPoint(reg);
      const s = sMin + rng() * (sMax - sMin);
      if (!p || !isOpen(p[0], p[1], s + 0.6)) continue;
      addRock(p[0], p[1], s, colorFn(p[0], p[1]));
      n++;
    }
  }
  for (const reg of REGIONS) {
    const big = reg.id === 'pico' ? 1.8 : 1.2;
    placeRocks(reg, Math.round((SCATTER[reg.id]?.rocks ?? 10) * Math.min(1, Q + 0.2)), () => ROCK_COLORS[reg.id] || '#d6cfe0', 0.3, big);
  }
  const mossy = SCATTER.transicao?.special?.includes('pedras_com_musgo');
  placeRocks(null, Math.round((SCATTER.transicao?.rocks ?? 30) * Math.min(1, Q + 0.2)),
    (x, z) => (mossy && rng() < 0.6 ? '#bcd6b0' : ROCK_COLORS[nearestRegion(x, z).id]), 0.3, 1.3);
  rockBuckets.forEach((items, i) => {
    const m = makeInstanced(rockGeometry(i + 1), propMat, items, { cast: true, receive: true });
    if (m) { m.name = 'pedras'; root.add(m); }
  });

  // --- extras de cada região ---
  const G = specialGeometries();
  const bushGeo = bushGeometry();
  const buckets = {};
  const put = (key, item) => (buckets[key] ||= []).push(item);
  const scatterIn = (reg, count, clr, fn) => {
    let n = 0, tries = 0;
    while (n < count && tries++ < count * 30) {
      const p = regionPoint(reg);
      if (!p || !isOpen(p[0], p[1], clr)) continue;
      fn(p[0], p[1], groundY(p[0], p[1]));
      addObstacle(p[0], p[1], clr * 0.8);
      n++;
    }
  };
  const has = (rid, name) => (SCATTER[rid]?.special || []).includes(name);
  const accents = (rid) => regionById[rid]?.palette.accents || ['#ffffff'];
  const qn = (n) => Math.round(n * Q);

  // Arbustos (Campo/Vila de leve; transição cheia) e samambaias no Ninhal.
  const bushGreens = ['#8fd88a', '#7fcf86', '#a3e39a'];
  scatterIn(regionById.campo, qn(30), 1.2, (x, z, y) => put('bush', { x, y: y - 0.1, z, ry: rng() * 6.28, s: 0.6 + rng() * 0.5, color: col.set(pick(bushGreens)).clone() }));
  if (has('transicao', 'arbustos_olhudos')) {
    scatterIn(null, qn(150), 1.2, (x, z, y) => put('bush', { x, y: y - 0.1, z, ry: rng() * 6.28, s: 0.6 + rng() * 0.6, color: col.set(pick(bushGreens)).clone() }));
  }
  if (has('ninhal', 'samambaias')) {
    scatterIn(regionById.ninhal, qn(140), 1, (x, z, y) => put('bush', { x, y: y - 0.15, z, ry: rng() * 6.28, sx: 0.7, sy: 0.45, sz: 0.7, color: col.set(pick(['#5fbf72', '#6ccf7c', '#58b874'])).clone() }));
  }
  if (has('ninhal', 'cogumelos_pequenos')) {
    scatterIn(regionById.ninhal, qn(40), 1, (x, z, y) => {
      const c = pick(['#ff7aa8', '#ffd23f', '#c792ff', '#ff9f5a']);
      for (let i = 0; i < 4; i++) {
        const a = rng() * 6.28, r = rng() * 0.9, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        put('mushroom', { x: px, y: groundY(px, pz), z: pz, ry: rng() * 6.28, s: 0.7 + rng() * 0.8, color: col.set(c).clone() });
      }
    });
  }
  if (has('bosque', 'pirulitos_mini')) {
    scatterIn(regionById.bosque, qn(50), 0.8, (x, z, y) => put('lollipop', { x, y, z, ry: rng() * 6.28, s: 0.8 + rng() * 0.6, color: col.set(pick(accents('bosque'))).clone() }));
  }
  if (has('bosque', 'bengalas_doces')) {
    scatterIn(regionById.bosque, qn(40), 0.8, (x, z, y) => put('cane', { x, y: y - 0.05, z, ry: rng() * 6.28, s: 0.8 + rng() * 0.5 }));
  }
  if (has('bosque', 'balas_de_goma')) {
    scatterIn(regionById.bosque, qn(70), 0.6, (x, z, y) => {
      for (let i = 0; i < 3; i++) {
        const a = rng() * 6.28, r = rng() * 0.8, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        put('gum', { x: px, y: groundY(px, pz) - 0.02, z: pz, ry: rng() * 6.28, s: 0.5 + rng() * 0.4, color: col.set(pick(accents('bosque'))).clone() });
      }
    });
  }
  if (has('campo', 'cata_ventos_mini')) {
    scatterIn(regionById.campo, qn(24), 0.6, (x, z, y) => put('pinwheel', { x, y, z, ry: rng() * 6.28, s: 0.9 + rng() * 0.4, color: col.set(pick(accents('campo'))).clone() }));
  }
  // Cercas ao longo das trilhas (Vila: branquinhas; transição: madeira velha).
  function fencesAlong(regFilter, runs, color) {
    let n = 0, tries = 0;
    while (n < runs && tries++ < runs * 40) {
      const path = pick(PATHS.filter((q) => !q.secret));
      const s = Math.floor(rng() * (path.points.length - 1));
      const [ax, az] = path.points[s], [bx, bz] = path.points[s + 1];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 10) continue;
      const tx = (bx - ax) / len, tz = (bz - az) / len;
      const side = rng() < 0.5 ? -1 : 1, off = path.width / 2 + 1.8;
      const t0 = rng() * (len - 8);
      const segs = [];
      for (let k = 0; k < 3; k++) {
        const d = t0 + 1.1 + k * 2.2;
        const x = ax + tx * d - tz * off * side, z = az + tz * d + tx * off * side;
        if (!regFilter(x, z) || !isOpen(x, z, 0.7)) { segs.length = 0; break; }
        segs.push([x, z]);
      }
      if (!segs.length) continue;
      const ry = Math.atan2(tx, tz) + Math.PI / 2;
      for (const [x, z] of segs) {
        const y = groundY(x, z);
        put('fence', { x, y: y - 0.05, z, ry, s: 1, color: col.set(color).clone() });
        onCollider({ kind: 'box', x, z, hw: 1.15, hd: 0.12, rotY: ry, y0: y - 2, y1: y + 0.85 });
        addObstacle(x, z, 1.2);
      }
      n++;
    }
  }
  const inRegion = (rid) => (x, z) => { const r = regionById[rid]; return Math.hypot(x - r.center.x, z - r.center.z) < r.radius * 0.95; };
  if (has('vila', 'cerquinhas')) fencesAlong(inRegion('vila'), Math.round(10 * Q + 2), '#fffaf0');
  if (has('transicao', 'cercas_velhas')) fencesAlong((x, z) => outside(x, z) > 0.6, Math.round(12 * Q + 2), '#d9b48f');

  // Casas: caixotes ao lado e vasinhos/floreiras na porta.
  function aroundHouses(rid, fn) {
    for (const l of LANDMARKS) {
      if (l.region !== rid || !['casa', 'cafeteria', 'loja_acessorios', 'casa_quim'].includes(l.type)) continue;
      fn(l, footprint(l), l.rotY ?? 0);
    }
  }
  const local = (l, rot, lx, lz) => [l.x + lx * Math.cos(rot) + lz * Math.sin(rot), l.z - lx * Math.sin(rot) + lz * Math.cos(rot)];
  if (has('vila', 'caixotes')) {
    aroundHouses('vila', (l, fp, rot) => {
      if (rng() < 0.35) return;
      const side = rng() < 0.5 ? -1 : 1;
      const [x, z] = local(l, rot, side * (fp + 1.1), -fp * 0.3 + rng() * 2);
      if (!isOpen(x, z, 0.6)) return;
      const y = groundY(x, z), ry = rot + (rng() - 0.5) * 0.5;
      put('crate', { x, y: y - 0.04, z, ry, s: 1, color: col.set('#e8b57f').clone() });
      if (rng() < 0.5) put('crate', { x, y: y + 0.76, z, ry: ry + 0.4, s: 0.8, color: col.set('#f0c896').clone() });
      onCollider({ kind: 'box', x, z, hw: 0.42, hd: 0.42, rotY: ry, y0: y - 2, y1: y + 0.8 });
      addObstacle(x, z, 0.8);
    });
  }
  for (const [rid, name] of [['vila', 'vasos_de_flor'], ['cidade', 'floreiras']]) {
    if (!has(rid, name)) continue;
    aroundHouses(rid, (l, fp, rot) => {
      for (const side of [-1, 1]) {
        const [x, z] = local(l, rot, side * 2.5, fp + 0.45);
        if (!isOpen(x, z, 0.3)) continue;
        const y = groundY(x, z);
        put('pot', { x, y: y - 0.03, z, ry: rng() * 6.28, s: 1, color: col.set(pick(accents(rid))).clone() });
        onCollider({ kind: 'circle', x, z, r: 0.3, y0: y - 2, y1: y + 0.55 });
      }
    });
  }
  // Nuvens baixas no Pico e em volta das montanhas da borda.
  if (has('pico', 'nuvens_baixas')) {
    scatterIn(regionById.pico, qn(7) + 2, 2, (x, z, y) => put('cloud', { x, y: y + 7 + rng() * 6, z, ry: rng() * 6.28, sx: 2.2 + rng() * 2, sy: 1.1 + rng() * 0.6, sz: 2 + rng() * 1.5 }));
  }
  for (let i = 0; i < 70; i++) {
    const a = (i / 70) * Math.PI * 2 + rng() * 0.08, r = 318 + rng() * 110;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const s = 5 + rng() * 6;
    put('cloud', { x, y: terrain.heightVisual(x, z) + 6 + rng() * 18, z, ry: rng() * 6.28, sx: s * 1.6, sy: s * 0.75, sz: s });
  }

  const SPECIAL_GEO = { bush: bushGeo, mushroom: G.mushroom, lollipop: G.lollipop, cane: G.cane, gum: G.gum,
    pinwheel: G.pinwheel, fence: G.fence, crate: G.crate, pot: G.pot, cloud: G.cloud };
  const CASTS = { bush: true, lollipop: true, cane: true, fence: true, crate: true, pot: true };
  for (const [key, items] of Object.entries(buckets)) {
    const m = makeInstanced(SPECIAL_GEO[key], propMat, items, { cast: !!CASTS[key], receive: key !== 'cloud' });
    if (m) { m.name = 'enfeite_' + key; root.add(m); }
  }

  // --- enfeites com olhinhos (objetos únicos, só aparecem perto) ---
  const eyed = [];
  const eyedFlowerGeo = (() => {
    const parts = [
      part(cyl(0.05, 0.07, 1.3, 6), '#6cc46a', 0, xf(0, 0.65, 0)),
      part(ico(1, 1), '#7fd47a', 0, xf(0.22, 0.4, 0, 0.25, 0.05, 0.12, 0, 0, 0.5)),
      part(cyl(0.32, 0.32, 0.12, 16), '#ffd84d', 0, xf(0, 1.45, 0.02, 1, 1, 1, Math.PI / 2, 0, 0)),
    ];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      parts.push(part(ico(1, 1), '#ffffff', 1, xf(Math.cos(a) * 0.5, 1.45 + Math.sin(a) * 0.5, -0.03, 0.26, 0.26, 0.08)));
    }
    return merge(parts);
  })();
  const eyedRockGeo = rockGeometry(7);
  function addEyed(geo, x, z, color, s, eyeY, eyeZ, eyeSize, ry) {
    const g = setRegionAttrs(geo.clone(), x, z);
    // pinta as partes "tingíveis" direto na cor de vértice
    const c = new THREE.Color(color), ca = g.attributes.color, ta = g.attributes.aTint;
    for (let i = 0; i < ca.count; i++) if (ta.getX(i) > 0.5) ca.setXYZ(i, c.r, c.g, c.b);
    const mesh = new THREE.Mesh(g, propMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const grp = new THREE.Group();
    grp.position.set(x, groundY(x, z) - 0.05, z);
    grp.rotation.y = ry;
    grp.scale.setScalar(s);
    grp.add(mesh);
    const eyes = createEyes({ size: eyeSize, lashes: rng() < 0.5 });
    eyes.position.set(0, eyeY, eyeZ);
    grp.add(eyes);
    registerEyes(eyes);
    root.add(grp);
    eyed.push(grp);
    addObstacle(x, z, 1.2 * s);
    return grp;
  }
  const faceToPath = (x, z) => {
    let best = null, bd = Infinity;
    for (const p of PATHS) for (const [px, pz] of p.points) {
      const d = Math.hypot(px - x, pz - z);
      if (d < bd) { bd = d; best = [px, pz]; }
    }
    return best && bd < 60 ? Math.atan2(best[0] - x, best[1] - z) : rng() * 6.28;
  };
  if (has('campo', 'flores_olhudas')) {
    scatterIn(regionById.campo, Math.max(6, qn(14)), 1.5, (x, z) =>
      addEyed(eyedFlowerGeo, x, z, pick(accents('campo')), 1 + rng() * 0.5, 1.45, 0.12, 0.13, faceToPath(x, z)));
  }
  if (has('transicao', 'arbustos_olhudos')) {
    scatterIn(null, Math.max(5, qn(10)), 1.5, (x, z) =>
      addEyed(bushGeo, x, z, pick(bushGreens), 0.9 + rng() * 0.4, 0.75, 0.62, 0.15, faceToPath(x, z)));
  }
  if (has('pico', 'pedras_olhudas')) {
    scatterIn(regionById.pico, 6, 2, (x, z) =>
      addEyed(eyedRockGeo, x, z, '#dfe6f2', 1 + rng() * 0.6, 0.35, 0.85, 0.2, faceToPath(x, z)));
  }

  // --- corte por distância ---
  const EYED_FAR2 = 62 * 62;
  const CH_FAR2 = (flowerFar + CHUNK * 0.75) ** 2;
  return {
    eyed,
    update(camX, camZ) {
      for (const ch of chunks) {
        const dx = ch.cx - camX, dz = ch.cz - camZ;
        const v = dx * dx + dz * dz < CH_FAR2;
        for (const m of ch.meshes) m.visible = v;
      }
      for (const g of eyed) {
        const dx = g.position.x - camX, dz = g.position.z - camZ;
        g.visible = dx * dx + dz * dz < EYED_FAR2;
      }
    },
  };
}
