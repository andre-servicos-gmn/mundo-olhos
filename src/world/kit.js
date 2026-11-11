// Kit de construção do mundo: geometrias unitárias em cache, materiais toon por região (em cache),
// atalho add(), caixa arredondada, placas com texto (CanvasTexture), brilho radial, hash espacial e o
// "assar" das partes estáticas (vira poucas malhas com cor de vértice + desbotamento na GPU).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon } from '../core/materials.js';
import { patchMaterial, fadeWeights, NR } from './fade.js';

// ------------------------------------------------------------------------------------------
// Geometrias unitárias (escala pelo mesh). Compartilhadas: nunca dar dispose nelas.
export const G = {
  sphere: new THREE.SphereGeometry(1, 18, 14),
  sphereLo: new THREE.SphereGeometry(1, 10, 8),
  hemi: new THREE.SphereGeometry(1, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2),
  ico: new THREE.IcosahedronGeometry(1, 1),
  icoLo: new THREE.IcosahedronGeometry(1, 0),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 18),
  cyl8: new THREE.CylinderGeometry(1, 1, 1, 8),
  cylTaper: new THREE.CylinderGeometry(0.75, 1, 1, 16),
  cone: new THREE.ConeGeometry(1, 1, 18),
  cone4: new THREE.ConeGeometry(1, 1, 4, 1),
  box: new THREE.BoxGeometry(1, 1, 1),
  torus: new THREE.TorusGeometry(1, 0.25, 8, 24),
  torusThin: new THREE.TorusGeometry(1, 0.08, 6, 28),
  disc: new THREE.CylinderGeometry(1, 1, 1, 28),
  capsule: new THREE.CapsuleGeometry(0.5, 1, 6, 12),
  prism: (() => {   // prisma triangular (telhado de duas águas): base 1×1, altura 1, comprimento 1 (eixo Z)
    const s = new THREE.Shape();
    s.moveTo(-0.5, 0); s.lineTo(0.5, 0); s.lineTo(0, 1); s.lineTo(-0.5, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false });
    g.translate(0, 0, -0.5);
    return g;
  })(),
};
// Arco de meia-volta (porta/janela arredondada).
G.halfDisc = new THREE.CylinderGeometry(1, 1, 1, 18, 1, false, -Math.PI / 2, Math.PI);
G.halfDisc.rotateX(-Math.PI / 2);   // meia-lua para cima, espessura em Z

const rboxCache = new Map();
/** Caixa com cantos arredondados (largura x, altura y, profundidade z), centrada. */
export function rbox(w, h, d, r = Math.min(w, h, d) * 0.18) {
  const key = [w, h, d, r].map((v) => v.toFixed(2)).join('|');
  if (rboxCache.has(key)) return rboxCache.get(key);
  r = Math.min(r, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01);
  const s = new THREE.Shape();
  const x0 = -w / 2 + r, x1 = w / 2 - r, y0 = -h / 2 + r, y1 = h / 2 - r;
  s.moveTo(x0, -h / 2 + r * 0);
  s.absarc(x0, y0, r, -Math.PI / 2, -Math.PI, true);
  s.absarc(x0, y1, r, Math.PI, Math.PI / 2, true);
  s.absarc(x1, y1, r, Math.PI / 2, 0, true);
  s.absarc(x1, y0, r, 0, -Math.PI / 2, true);
  const bev = Math.min(r * 0.8, d / 2 - 0.01);
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.01, d - 2 * bev), bevelEnabled: true, bevelSize: bev * 0.6,
    bevelThickness: bev, bevelSegments: 2, curveSegments: 4 });
  g.translate(0, 0, -(d - 2 * bev) / 2);
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  rboxCache.set(key, g);
  return g;
}

/** Cria um mesh já posicionado/escalado/rotacionado e o adiciona ao pai. */
export function add(parent, geo, mat, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.rotation.set(rx, ry, rz);
  parent.add(m);
  return m;
}

/** Cilindro entre dois pontos (galhos, cordas, vigas). */
export function beam(parent, mat, ax, ay, az, bx, by, bz, r, geo = G.cyl8) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len = Math.hypot(dx, dy, dz) || 1e-4;
  const m = new THREE.Mesh(geo, mat);
  m.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
  m.scale.set(r, len, r);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / len, dy / len, dz / len));
  parent.add(m);
  return m;
}

// ------------------------------------------------------------------------------------------
// Materiais de cenário: toon(cor, { region }) em cache. userData.base guarda a cor original
// (usada para assar em cor de vértice); userData.bake = pode virar cor de vértice.
const matCache = new Map();
export function mat(color, region, opts = {}) {
  const key = `${region || '-'}|${color}|${opts.emissive || ''}|${opts.emissiveIntensity ?? ''}|${opts.transparent ? opts.opacity : ''}|${opts.side ?? ''}|${opts.flat ? 1 : 0}`;
  let m = matCache.get(key);
  if (m) return m;
  m = toon(color, { region, ...opts });
  if (opts.flat) m.flatShading = true;
  m.userData.base = new THREE.Color(color);
  m.userData.bake = !opts.emissive && !opts.transparent && !opts.noBake;
  matCache.set(key, m);
  return m;
}

// Material único das partes assadas (cor de vértice + pesos de região → desbota na GPU).
export const bakedMat = patchMaterial(toon('#ffffff', { vertexColors: true }), { key: 'baked' });
bakedMat.name = 'cenario_assado';

// ------------------------------------------------------------------------------------------
// Texturas geradas.
let glowTex = null;
/** Brilho radial macio (sprites, partículas). */
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.75)');
  grd.addColorStop(0.6, 'rgba(255,255,255,0.18)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

const FONT = "'Baloo 2', 'Fredoka', 'Nunito', 'Trebuchet MS', sans-serif";
/** Quebra o texto em linhas que cabem na largura. */
function wrap(g, text, maxW) {
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}
/**
 * Textura de placa: tábua de madeira clarinha com texto marrom arredondado.
 * opts: { w=512, h=256, bg, ink, border, size }
 */
export function signTexture(text, opts = {}) {
  const W = opts.w ?? 512, H = opts.h ?? 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const r = 36;
  g.fillStyle = opts.border ?? '#b07a52';
  g.beginPath(); g.roundRect(0, 0, W, H, r); g.fill();
  g.fillStyle = opts.bg ?? '#ffe9c7';
  g.beginPath(); g.roundRect(12, 12, W - 24, H - 24, r - 10); g.fill();
  // veios da madeira
  g.strokeStyle = 'rgba(176,122,82,0.18)';
  g.lineWidth = 3;
  for (let i = 0; i < 5; i++) {
    g.beginPath();
    const y = 40 + i * (H - 80) / 4;
    g.moveTo(30, y); g.bezierCurveTo(W * 0.3, y - 8, W * 0.6, y + 8, W - 30, y); g.stroke();
  }
  g.fillStyle = opts.ink ?? '#6b3f2a';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let size = opts.size ?? 54;
  let lines;
  for (;;) {
    g.font = `700 ${size}px ${FONT}`;
    lines = wrap(g, text, W - 70);
    if (lines.length * size * 1.1 <= H - 50 || size < 20) break;
    size -= 4;
  }
  const lh = size * 1.1;
  lines.forEach((l, i) => g.fillText(l, W / 2, H / 2 + (i - (lines.length - 1) / 2) * lh));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// ------------------------------------------------------------------------------------------
/** Hash espacial 2D simples (itens com x, z e raio de alcance). */
export class SpatialHash {
  constructor(cell = 16) { this.cell = cell; this.map = new Map(); }
  add(item, x, z, reach) {
    const c = this.cell;
    for (let i = Math.floor((x - reach) / c); i <= Math.floor((x + reach) / c); i++) {
      for (let j = Math.floor((z - reach) / c); j <= Math.floor((z + reach) / c); j++) {
        const k = i * 73856093 ^ j * 19349663;
        let a = this.map.get(k);
        if (!a) this.map.set(k, a = []);
        a.push(item);
      }
    }
  }
  /** Itens registrados na célula que contém (x,z). */
  query(x, z) {
    const c = this.cell;
    return this.map.get(Math.floor(x / c) * 73856093 ^ Math.floor(z / c) * 19349663) || EMPTY;
  }
}
const EMPTY = [];

// ------------------------------------------------------------------------------------------
// Assar: junta as partes estáticas em poucas malhas por pedaço do mapa (chunk) para economizar draw calls.
const CHUNK = 64;
const _W = new Float64Array(NR);
const _wp = new THREE.Vector3();

/** Copia a geometria só com position/normal (indexada), já transformada pela matriz. */
function prepGeo(geo, matrix) {
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', geo.attributes.position.clone());
  if (geo.attributes.normal) g.setAttribute('normal', geo.attributes.normal.clone());
  if (geo.index) g.setIndex(geo.index.clone());
  else {
    const n = geo.attributes.position.count;
    const idx = new (n > 65535 ? Uint32Array : Uint16Array)(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    g.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  g.applyMatrix4(matrix);
  // matriz espelhada (escala negativa): inverte a ordem dos triângulos
  if (matrix.determinant() < 0) {
    const ix = g.index.array;
    for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
  }
  return g;
}

/**
 * Percorre os grupos dos marcos e tira deles as partes estáticas (sem userData.dynamic no caminho),
 * juntando por chunk. Partes com material "assável" viram cor de vértice no bakedMat; as demais
 * (emissivas, transparentes) são juntadas por material.
 * groups: [{ obj, region, detail?:bool }]. Retorna [{ mesh, cx, cz, detail }].
 */
export function bakeStatic(groups, scene) {
  const buckets = new Map();
  for (const { obj, region, detail } of groups) {
    obj.updateMatrixWorld(true);
    obj.getWorldPosition(_wp);
    const ci = Math.floor(_wp.x / CHUNK), cj = Math.floor(_wp.z / CHUNK);
    const w = Float32Array.from(fadeWeights(_wp.x, _wp.z, _W));   // o marco inteiro desbota junto
    const remove = [];
    obj.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || o.isSprite) return;
      for (let p = o; p && p !== obj.parent; p = p.parent) if (p.userData.dynamic || p.name === 'eyes') return;
      const m = o.material;
      if (Array.isArray(m) || m.map) return;
      const baked = !!m.userData.bake;
      const cast = !o.userData.noShadow;
      const key = `${ci},${cj}|${detail ? 'd' : 'b'}|${baked ? 'vc' : m.uuid}|${cast ? 's' : 'ns'}`;
      let b = buckets.get(key);
      if (!b) buckets.set(key, b = { list: [], baked, mat: m, detail: !!detail, cx: (ci + 0.5) * CHUNK, cz: (cj + 0.5) * CHUNK, cast });
      b.list.push({ o, w, m });
      remove.push(o);
    });
    for (const o of remove) o.parent.remove(o);
  }
  const out = [];
  for (const b of buckets.values()) {
    const parts = [];
    for (const { o, m, w: _w } of b.list) {
      const g = prepGeo(o.geometry, o.matrixWorld);
      if (b.baked) {
        const n = g.attributes.position.count;
        const col = new Float32Array(n * 3), a0 = new Float32Array(n * 3), a1 = new Float32Array(n * 3);
        const c = m.userData.base || m.color;
        for (let i = 0; i < n; i++) {
          col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
          a0[i * 3] = _w[0]; a0[i * 3 + 1] = _w[1]; a0[i * 3 + 2] = _w[2];
          a1[i * 3] = _w[3]; a1[i * 3 + 1] = _w[4]; a1[i * 3 + 2] = _w[5];
        }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        g.setAttribute('aRw0', new THREE.BufferAttribute(a0, 3));
        g.setAttribute('aRw1', new THREE.BufferAttribute(a1, 3));
      }
      parts.push(g);
    }
    const merged = mergeGeometries(parts, false);
    for (const p of parts) p.dispose();
    if (!merged) continue;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, b.baked ? bakedMat : b.mat);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.name = b.detail ? 'detalhes' : 'marcos';
    scene.add(mesh);
    out.push({ mesh, cx: b.cx, cz: b.cz, detail: b.detail });
  }
  return out;
}

/**
 * Véus transparentes (névoa, espuma) não devem entrar nos passes com overrideMaterial (GTAO/normal/depth):
 * lá eles virariam um bloco opaco. Zera o drawRange só nesses passes.
 */
export function skipOverridePasses(mesh) {
  mesh.onBeforeRender = (renderer, scene, camera, geometry) => {
    geometry.setDrawRange(0, scene.overrideMaterial ? 0 : Infinity);
  };
  return mesh;
}
