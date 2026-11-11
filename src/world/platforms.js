// Plataformas andáveis (PLATFORMS): galhos, folhas que balançam, ninhos-trampolim, pontes de cipó, pedras,
// caixotes, degraus da torre e nuvens. O topo andável fica exatamente em p.y (docs/mapa.md, seção 2).
// Devolve a lista de superfícies para o groundAt e os objetos animados (folhas, trampolins, nuvens).
import * as THREE from 'three';
import { G, rbox, add, beam } from './kit.js';
import { LANDMARKS, PLATFORMS } from '../data/worldmap.js';

const TAU = Math.PI * 2;
// Superfícies que o próprio marco desenha (terraços, piso do Ninho-Coreto, cume da Pedra do Bocejo).
const NO_VISUAL = new Set(['terraco_gato', 'terraco_torre', 'ninho_coreto_piso', 'cume_bocejo']);
const TREES = LANDMARKS.filter((l) => l.type === 'arvore_gigante');
const COLUNA = LANDMARKS.find((l) => l.data?.coluna);
const TORRE = LANDMARKS.find((l) => l.type === 'torre_relogio');

/** Árvore gigante cujo tronco sustenta a plataforma (ou null). */
function treeFor(p) {
  let best = null, bd = Infinity;
  for (const t of TREES) {
    const d = Math.hypot(p.x - t.x, p.z - t.z) - (t.data?.trunkRadius ?? 3);
    if (d < (p.radius ?? 1.5) + 2.6 && d < bd) { bd = d; best = t; }
  }
  return best;
}
/** Braço (galho) da plataforma até um eixo vertical em (cx,cz) com raio r. Coordenadas locais da plataforma. */
function armTo(g, c, p, cx, cz, r, color, thick = 0.32, drop = 0.9) {
  const dx = cx - p.x, dz = cz - p.z, dist = Math.hypot(dx, dz);
  if (dist < 0.01) return;
  const k = Math.max(0, (dist - r * 0.6) / dist);
  beam(g, c.M(color), 0, -0.3, 0, dx * k, -0.3 - drop, dz * k, thick, G.cyl8);
}

/**
 * c: contexto (M, eyes, anim, ground, rng). Retorna { surfaces, dynamic: [...], colliders: [...] }.
 * surface: { id, type, x, y, z, shape:'circle'|'rect', r, hw, hd, cos, sin, bounce, dy, obj }
 */
export function buildPlatforms(c, root) {
  const surfaces = [];
  const leaves = [], bouncers = [], clouds = [];
  for (const p of PLATFORMS) {
    c.cur = p.region;
    const s = {
      id: p.id, type: p.type, x: p.x, y: p.y, z: p.z, bounce: p.bounce || 0, dy: 0, obj: null,
      shape: p.type === 'ponte_cipo' ? 'rect' : 'circle', r: p.radius ?? 1.5,
      hw: (p.w ?? 2) / 2, hd: (p.d ?? 2) / 2, cos: Math.cos(p.rotY ?? 0), sin: Math.sin(p.rotY ?? 0), route: p.route,
    };
    surfaces.push(s);
    if (NO_VISUAL.has(p.id)) continue;
    const g = new THREE.Group();
    g.position.set(p.x, p.y, p.z);
    g.rotation.y = p.rotY ?? 0;
    const r = s.r;
    const tree = (p.type === 'galho' || p.type === 'folha' || p.type === 'ninho_trampolim') ? treeFor(p) : null;
    const gy = c.ground(p.x, p.z);
    let dynamicPart = null;
    switch (p.type) {
      case 'galho': {
        add(g, G.cyl, c.M('#c9935f'), 0, -0.28, 0, r, 0.56, r);
        add(g, G.disc, c.M('#ecc596'), 0, 0.005, 0, r * 0.88, 0.02, r * 0.88).userData.noShadow = true;
        add(g, G.torusThin, c.M('#d9a877'), 0, 0.01, 0, r * 0.55, r * 0.55, 1, Math.PI / 2).userData.noShadow = true;
        add(g, G.sphere, c.M('#b98058'), 0, -0.55, 0, r * 0.85, 0.35, r * 0.85);
        for (let i = 0; i < 3; i++) {
          const a = i * 2.2 + c.rng();
          add(g, G.ico, c.M(i % 2 ? '#7ed98a' : '#94e07f'), Math.cos(a) * r * 0.95, -0.2, Math.sin(a) * r * 0.95, 0.45, 0.3, 0.45);
        }
        if (tree) armTo(g, c, p, tree.x, tree.z, tree.data?.trunkRadius ?? 3, '#a8794f', 0.36);
        break;
      }
      case 'folha': {
        // pivô no ponto de apoio; a folha balança quando a Quim pisa
        const leaf = new THREE.Group(); leaf.name = 'folha'; leaf.userData.dynamic = true;
        add(leaf, G.sphere, c.M('#8fdc7a'), 0, -0.12, 0, r * 1.15, 0.13, r * 0.95);
        add(leaf, G.box, c.M('#6cc46a'), 0, 0.01, 0, 0.08, 0.03, r * 1.9).userData.noShadow = true;
        for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) {
          add(leaf, G.box, c.M('#79cf6e'), sx * r * 0.32, 0.01, -r * 0.5 + k * r * 0.5, 0.05, 0.02, r * 0.7, 0, sx * 0.8, 0).userData.noShadow = true;
        }
        g.add(leaf);
        if (tree) armTo(g, c, p, tree.x, tree.z, tree.data?.trunkRadius ?? 3, '#7fbf5a', 0.12, 0.5);
        dynamicPart = leaf;
        leaves.push({ s, leaf, k: 0, ph: c.rng() * TAU });
        break;
      }
      case 'ninho_trampolim': {
        const tramp = new THREE.Group(); tramp.name = 'trampolim'; tramp.userData.dynamic = true;
        if (p.look === 'cogumelo') {
          add(tramp, rbox(r * 2.1, 0.7, r * 2.1, 0.32), c.M('#ffb3d9'), 0, -0.35, 0);
          add(tramp, rbox(r * 1.6, 0.25, r * 1.6, 0.12), c.M('#ffffff'), 0, -0.02, 0);
          for (let i = 0; i < 6; i++) add(tramp, G.sphereLo, c.M(c.accent(i)), Math.cos(i) * r * 0.85, -0.05, Math.sin(i) * r * 0.85, 0.12);
          c.eyes(tramp, { x: 0, y: -0.35, z: r * 1.06, size: 0.14, lashes: true, far: 60 });
        } else {
          add(tramp, G.torus, c.M('#c79a6b'), 0, -0.15, 0, r * 0.95, r * 0.95, 1.6, Math.PI / 2);
          add(tramp, G.sphere, c.M('#ff9cc7'), 0, -0.12, 0, r * 0.85, 0.15, r * 0.85);
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * TAU;
            beam(tramp, c.M('#a8794f'), Math.cos(a) * r * 0.7, -0.4, Math.sin(a) * r * 0.7, Math.cos(a + 0.6) * r * 1.2, 0.0, Math.sin(a + 0.6) * r * 1.2, 0.04, G.cyl8);
          }
          for (let i = 0; i < 4; i++) add(tramp, G.sphereLo, c.M('#fff3a3'), Math.cos(i * 1.57) * r * 0.45, 0.02, Math.sin(i * 1.57) * r * 0.45, 0.1, 0.05, 0.1);
          c.eyes(tramp, { x: 0, y: -0.15, z: r * 1.15, size: 0.12, far: 60 });
        }
        g.add(tramp);
        if (p.look === 'cogumelo' && p.y - gy < 3) {
          add(g, G.cylTaper, c.M('#fff7fb'), 0, -(p.y - gy) / 2 - 0.3, 0, 0.45, p.y - gy, 0.45, Math.PI);
          c.circle(p.x, p.z, 0.5, gy - 1, p.y - 0.6);
        } else if (p.look === 'cogumelo') {
          add(g, G.ico, c.M('#ffe0f0'), 0, -0.9, 0, r * 1.3, 0.55, r * 1.2);
        } else if (tree) armTo(g, c, p, tree.x, tree.z, tree.data?.trunkRadius ?? 3, '#a8794f', 0.32);
        dynamicPart = tramp;
        bouncers.push({ s, obj: tramp, k: 0 });
        break;
      }
      case 'ponte_cipo': {
        const w = p.w ?? 2, d = p.d ?? 10;
        const n = Math.max(3, Math.round(d / 0.55));
        for (let i = 0; i < n; i++) {
          add(g, rbox(w, 0.14, 0.42, 0.05), c.M(i % 2 ? '#d9a877' : '#c9935f'), 0, -0.07, -d / 2 + (i + 0.5) * d / n, 1, 1, 1, 0, (c.rng() - 0.5) * 0.06, 0);
        }
        for (const sx of [-1, 1]) {
          beam(g, c.M('#7fbf5a'), sx * (w / 2 + 0.05), -0.12, -d / 2, sx * (w / 2 + 0.05), -0.12, d / 2, 0.05, G.cyl8);
          // corda de mão com barriguinha
          const K = 8;
          for (let k = 0; k < K; k++) {
            const z0 = -d / 2 + (k / K) * d, z1 = -d / 2 + ((k + 1) / K) * d;
            const sag = (t) => 0.95 - Math.sin(t * Math.PI) * 0.25;
            beam(g, c.M('#8fcf6a'), sx * (w / 2 + 0.05), sag(k / K), z0, sx * (w / 2 + 0.05), sag((k + 1) / K), z1, 0.045, G.cyl8);
            if (k > 0) beam(g, c.M('#8fcf6a'), sx * (w / 2 + 0.05), -0.1, z0, sx * (w / 2 + 0.05), sag(k / K), z0, 0.025, G.cyl8);
          }
          for (let k = 0; k < 5; k++) add(g, G.sphereLo, c.M(k % 2 ? '#a6e88c' : '#ffb3d1'), sx * (w / 2 + 0.06), 0.7, -d / 2 + (k + 0.5) * d / 5, 0.12, 0.08, 0.16);
          // corrimão: não deixa a Quim cair de lado (mas dá para pular por cima)
          c.boxWorld(p.x + s.cos * sx * (w / 2 + 0.12), p.z - s.sin * sx * (w / 2 + 0.12), 0.1, d / 2, p.rotY ?? 0, p.y - 0.3, p.y + 1.0);
        }
        break;
      }
      case 'pedra': case 'escada': {
        if (p.route === 'telhado_gato') {   // pilha de caixotes até o topo
          const h = p.y - gy;
          const n = Math.max(1, Math.ceil(h / 0.95));
          const ch = h / n;
          for (let i = 0; i < n; i++) {
            add(g, rbox(r * 1.5, ch * 0.98, r * 1.5, 0.08), c.M(i % 2 ? '#e8b57f' : '#f0c896'), 0, -h + ch * (i + 0.5), 0, 1, 1, 1, 0, (i * 0.37) % 0.4 - 0.2, 0);
            add(g, G.box, c.M('#c98f5e'), 0, -h + ch * (i + 0.5), r * 0.76, r * 1.3, 0.1, 0.02, 0, (i * 0.37) % 0.4 - 0.2, 0);
          }
          c.circle(p.x, p.z, r * 0.78, gy - 1, p.y - 0.05);
        } else if (p.route === 'torre_relogio' && TORRE) {   // degrau com mão-francesa até a torre
          add(g, rbox(2.5, 0.35, 2.2, 0.12), c.M(surfaces.length % 2 ? '#ffd6e8' : '#fff1e6'), 0, -0.175, 0);
          add(g, G.sphereLo, c.M('#a0d8ef'), 0.95, 0.05, 0.85, 0.1);
          const dx = TORRE.x - p.x, dz = TORRE.z - p.z, dist = Math.hypot(dx, dz);
          const k = (dist - 5.4) / dist;
          const lx = (dx * k) * s.cos - (dz * k) * s.sin, lz = (dx * k) * s.sin + (dz * k) * s.cos;
          beam(g, c.M('#e9dcf5'), 0, -0.3, 0, lx, -1.6, lz, 0.16, G.cyl8);
        } else if (p.route === 'cume_bocejo' && COLUNA) {   // pedras em volta da Pedra do Bocejo
          add(g, rbox(r * 1.9, 0.5, r * 1.7, 0.2), c.M(surfaces.length % 2 ? '#e3e8f4' : '#d6dceb'), 0, -0.25, 0);
          add(g, G.sphere, c.M('#ffffff'), 0, -0.02, 0, r * 0.6, 0.06, r * 0.5).userData.noShadow = true;
          const dx = COLUNA.x - p.x, dz = COLUNA.z - p.z, dist = Math.hypot(dx, dz);
          const k = (dist - 2.6) / dist;
          const lx = (dx * k) * s.cos - (dz * k) * s.sin, lz = (dx * k) * s.sin + (dz * k) * s.cos;
          beam(g, c.M('#cfd6e6'), 0, -0.4, 0, lx, -1.2, lz, 0.22, G.cyl8);
        } else {   // pedras do lago e a ilhota
          const h = p.y - gy + 0.4;
          const geo = new THREE.LatheGeometry([[0, 0], [r * 0.85, 0], [r, -0.25], [r * 1.08, -h * 0.6], [r * 1.15, -h]].map(([x, y]) => new THREE.Vector2(x, y)), 14);
          add(g, geo, c.M(p.id === 'ilhota_lago' ? '#d9cfe0' : '#cfc8dc'));
          if (p.id === 'ilhota_lago') {
            add(g, G.sphere, c.M('#9ee07a'), 0, -0.05, 0, r * 0.9, 0.18, r * 0.9);
            for (let i = 0; i < 9; i++) {
              const a = i * 2.4, rr = 0.6 + (i % 3) * 0.8;
              add(g, G.cyl8, c.M('#6cc46a'), Math.cos(a) * rr, 0.2, Math.sin(a) * rr, 0.02, 0.4, 0.02);
              add(g, G.sphereLo, c.M(c.accent(i)), Math.cos(a) * rr, 0.42, Math.sin(a) * rr, 0.11);
            }
            add(g, G.cylTaper, c.M('#fff3e3'), -1.6, 0.3, -1.2, 0.18, 0.6, 0.18, Math.PI);
            add(g, G.hemi, c.M('#ff8fc7'), -1.6, 0.55, -1.2, 0.5, 0.35, 0.5);
            c.eyes(g, { x: 0.6, y: 0.25, z: r * 0.85, size: 0.12, far: 50 });
          } else add(g, G.sphere, c.M('#a6e88c'), 0.2, -0.02, -0.1, r * 0.45, 0.08, r * 0.35);
          c.circle(p.x, p.z, r * 0.9, gy - 3, p.y - 0.02);
        }
        break;
      }
      case 'nuvem': {
        const cloud = new THREE.Group(); cloud.name = 'nuvem'; cloud.userData.dynamic = true;
        const treasure = p.id === 'nuvem_tesouro';
        const col = treasure ? '#ffd6ec' : '#ffffff', col2 = treasure ? '#fff0f7' : '#f3efff';
        if (p.look === 'cogumelo') {
          add(cloud, G.ico, c.M('#ffffff'), 0, -0.9, 0, r * 1.25, 0.6, r * 1.15);
          add(cloud, rbox(r * 2.0, 0.6, r * 2.0, 0.28), c.M('#ffb3d9'), 0, -0.3, 0);
          add(cloud, rbox(r * 1.5, 0.22, r * 1.5, 0.1), c.M('#ffffff'), 0, -0.02, 0);
          bouncers.push({ s, obj: cloud, k: 0 });
        } else {
          add(cloud, G.sphere, c.M(col), 0, -0.55, 0, r * 1.05, 0.55, r * 0.95);
          for (let i = 0; i < 7; i++) {
            const a = (i / 7) * TAU + c.rng() * 0.4;
            const rr = r * (0.42 + c.rng() * 0.2);
            add(cloud, G.sphere, c.M(i % 2 ? col : col2), Math.cos(a) * r * 0.85, -0.55 - c.rng() * 0.25, Math.sin(a) * r * 0.85, rr, rr * 0.75, rr);
          }
          add(cloud, G.cyl, c.M(col2), 0, -0.04, 0, r * 0.92, 0.08, r * 0.92).userData.noShadow = true;
          if (treasure || c.rng() < 0.5) {
            const yaw = c.rng() * TAU;
            c.eyes(cloud, { x: Math.sin(yaw) * r * 0.98, y: -0.5, z: Math.cos(yaw) * r * 0.98, ry: yaw, size: treasure ? 0.28 : 0.18, lashes: treasure, far: 120 });
            for (const sx of [-1, 1]) add(cloud, G.sphereLo, c.M('#ffb3d1'), Math.sin(yaw + sx * 0.4) * r * 0.97, -0.72, Math.cos(yaw + sx * 0.4) * r * 0.97, 0.16, 0.09, 0.05, 0, yaw, 0);
          }
          if (treasure) for (let i = 0; i < 6; i++) add(cloud, G.icoLo, c.M('#fff3a3', { emissive: '#ffe066', emissiveIntensity: 0.6 }), Math.cos(i) * r * 1.1, 0.4 + (i % 3) * 0.3, Math.sin(i) * r * 1.1, 0.09);
        }
        g.add(cloud);
        dynamicPart = cloud;
        clouds.push({ s, obj: cloud, ph: c.rng() * TAU });
        break;
      }
    }
    s.obj = g;
    if (dynamicPart) g.userData.hasDynamic = true;
    root.add(g);
  }
  return { surfaces, leaves, bouncers, clouds };
}
