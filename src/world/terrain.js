// Terreno do Mundo Olhos: altura em grade (1 m, amostragem bilinear), máscaras de trilhas/marcos/água,
// malha com cores de vértice por região, montanhas fofas da borda e a água (rio, lagos, fonte).
// Regras de altura: docs/mapa.md, seção 3.
import * as THREE from 'three';
import { fbm, noise2, smoothstep, lerp, clamp, nextFrame } from '../core/util.js';
import { toon } from '../core/materials.js';
import { REGIONS, PATHS, LANDMARKS, PLATFORMS, WATER, WORLD, SPOTS } from '../data/worldmap.js';
import { regionWeights, fadeWeights, NR, patchMaterial } from './fade.js';

export const HALF = WORLD.half;            // grade cobre x,z ∈ [-320, 320]
const N = HALF * 2 + 1;                    // amostras por lado (1 m)

// Pegadas (raio × scale) usadas para achatar o chão e afastar a decoração (docs/mapa.md, seção 8).
const FOOT = { casa_quim: 6, casa: 5, cafeteria: 7, loja_acessorios: 6, fonte: 5, banco: 1.3, placa: 0.6, poste: 0.4,
  moinho: 5, horta: 4, jardim: 5, ninho: 1.5, casinha_passaro: 1, cata_vento: 1, arvore_algodao: 2.5, pirulito_gigante: 1.5,
  cogumelo: 2, flor_gigante: 2, torre_relogio: 5, mirante: 4, rocha: 2.5, cerca: 1, 'poço': 1.8, coreto: 5, estatua_olho: 2,
  caixa_correio: 0.5, praca: 12, portal_nuvem: 4, ponte: 5 };

/** Landmark apoiado no chão? (ninhos em galhos, o Ninho-Coreto e a cascata não contam) */
export function isGroundLandmark(l) {
  if (l.type === 'ninho_coreto' || l.type === 'cachoeira') return false;
  return !(l.data && l.data.y !== undefined && l.data.sobre);
}
/** Raio da pegada de um landmark no chão. */
export function footprint(l) {
  const d = l.data || {};
  if (l.type === 'arvore_gigante') return (d.trunkRadius ?? 3) + 2;
  if (l.type === 'cerca') return (d.comprimento ?? 6) / 2;
  return (FOOT[l.type] ?? 2) * (l.scale ?? 1);
}

// ------------------------------------------------------------------------------------------
// Dados fixos
const PICO = REGIONS.find((r) => r.id === 'pico');
const PX = PICO.center.x, PZ = PICO.center.z;
const PICO_IDX = REGIONS.indexOf(PICO);
const cone = (d) => 6 + 24 * clamp((75 - d) / 47, 0, 1);   // platô y=30 para d ≤ 28
// O Pico entra na mistura como 6 (o pé do cone); o cone sobe por cima.
const BASE_EFF = REGIONS.map((r) => (r.id === 'pico' ? 6 : r.baseHeight));

const RIO = WATER.find((w) => w.type === 'rio');
const RIO_PTS = RIO.points;
const RIO_HW = (RIO.width ?? 5) / 2;
const LAKE_DEFS = WATER.filter((w) => w.type === 'lago');
const FONTE_DEFS = WATER.filter((w) => w.type === 'fonte');
const SERP = PATHS.find((p) => p.id === 'serpentina_pico');
const SERP_HW = SERP ? SERP.width / 2 : 2;
const SERP_PTS = SERP ? SERP.points : [];
const SERP_H = SERP_PTS.map(([x, z]) => cone(Math.hypot(x - PX, z - PZ)));

const COLINAS = LANDMARKS.filter((l) => l.data && l.data.colina)
  .map((l) => ({ x: l.x, z: l.z, h: l.data.colina, r0: footprint(l) + 3 }));

const W = new Float64Array(NR);
const RCB = REGIONS.map((r) => [r.center.x, r.center.z, 1 / r.radius]);

/** Base das alturas (docs/mapa.md §3): w = exp(-2q⁴) + 0,05·exp(-q²) — o 2º termo evita paredões longe dos centros. */
function baseB(x, z) {
  let b = 0, s = 0;
  for (let i = 0; i < NR; i++) {
    const c = RCB[i];
    const dx = (x - c[0]) * c[2], dz = (z - c[1]) * c[2];
    const q2 = dx * dx + dz * dz;
    const w = Math.exp(-2 * q2 * q2) + 0.05 * Math.exp(-q2);
    b += w * BASE_EFF[i]; s += w;
  }
  b /= s;
  for (const c of COLINAS) {
    const d = Math.hypot(x - c.x, z - c.z);
    if (d < c.r0 + 16) b += c.h * (1 - smoothstep(c.r0, c.r0 + 16, d));
  }
  return b;
}

/** Montanhas fofas depois do raio jogável. */
export function mountain(x, z) {
  const r = Math.hypot(x, z);
  if (r < 290) return 0;
  const e = smoothstep(292, 352, r);
  const big = smoothstep(340, 620, r);
  return e * (24 + 20 * (0.5 + fbm(x / 60, z / 60, 3))) + big * (55 + 30 * fbm(x / 160 + 3.7, z / 160 - 1.3, 2));
}

// Serpentina do Pico: altura da estrada por kernel (sem degrau entre as voltas dos grampos).
let serpW = 0, serpH = 0;
function serpentina(x, z) {
  let dmin = Infinity, sw = 0, sh = 0;
  for (let i = 0; i < SERP_PTS.length - 1; i++) {
    const ax = SERP_PTS[i][0], az = SERP_PTS[i][1];
    const dx = SERP_PTS[i + 1][0] - ax, dz = SERP_PTS[i + 1][1] - az;
    const l2 = dx * dx + dz * dz || 1e-9;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1);
    const ex = x - ax - dx * t, ez = z - az - dz * t;
    const d2 = ex * ex + ez * ez;
    const d = Math.sqrt(d2);
    if (d < dmin) dmin = d;
    const w = Math.exp(-d2 / 4.84);
    sw += w; sh += w * lerp(SERP_H[i], SERP_H[i + 1], t);
  }
  serpW = 1 - smoothstep(SERP_HW + 1, SERP_HW + 4.5, dmin);
  serpH = sw > 1e-12 ? sh / sw : 0;
}

// Margem/altura do rio nos vértices (desce sempre).
const RIO_H = [];
for (let i = 0; i < RIO_PTS.length; i++) {
  const [x, z] = RIO_PTS[i];
  const dP = Math.hypot(x - PX, z - PZ);
  let h = dP < 75 ? Math.max(baseB(x, z), cone(dP)) : baseB(x, z);   // o cone só vale perto do Pico
  if (i > 0) h = Math.min(h, RIO_H[i - 1]);
  RIO_H.push(h);
}

const LAKES = LAKE_DEFS.map((w) => {
  const b = baseB(w.x, w.z);
  return { def: w, x: w.x, z: w.z, R: w.radius, ramp: Math.min(5, w.radius * 0.6), base: b, surf: b - 0.6,
    calda: !!(w.data && w.data.calda), color: (w.data && w.data.cor) || null };
});
const FONTES = FONTE_DEFS.map((w) => ({ def: w, x: w.x, z: w.z, r: (w.radius ?? 4.5) - 0.3, surf: baseB(w.x, w.z) + 0.8 }));

// Pontes: o chão "lógico" (getHeight) fica no nível da trilha sobre o rio; a malha visual continua cavada.
const BRIDGES = LANDMARKS.filter((l) => l.type === 'ponte').map((l) => {
  const s = l.scale ?? 1, d = l.data || {};
  const rot = l.rotY ?? 0;
  return { x: l.x, z: l.z, cos: Math.cos(rot), sin: Math.sin(rot),
    len: (d.comprimento ?? 10) * s + 4, wid: (d.largura ?? 4) * s, y: baseB(l.x, l.z) + 0.12 };
});
function onBridge(x, z) {
  for (const b of BRIDGES) {
    const dx = x - b.x, dz = z - b.z;
    const lx = dx * b.cos - dz * b.sin, lz = dx * b.sin + dz * b.cos;
    if (Math.abs(lx) <= b.wid / 2 + 0.3 && Math.abs(lz) <= b.len / 2) return b;
  }
  return null;
}

/** Altura analítica (usada para preencher a grade e fora dela). m = máscara 0..1, rD/rH = rio. */
function heightAt(x, z, m, rD, rH) {
  let h = baseB(x, z);
  h += (1.5 * fbm(x / 45, z / 45, 3) + 2.2 * fbm(x / 140 + 11.3, z / 140 - 7.1, 2)) * m;
  h += mountain(x, z);
  const dP = Math.hypot(x - PX, z - PZ);
  if (dP < 75) {
    let c = cone(dP);
    if (dP > 28) c += 0.8 * fbm(x / 18, z / 18, 2) * smoothstep(28, 34, dP) * (1 - smoothstep(66, 75, dP)) * m;
    if (dP < 78) {
      serpentina(x, z);
      if (serpW > 0) c = lerp(c, serpH, serpW);
    }
    if (c > h) h = c;
  }
  if (rD < RIO_HW + 5) {
    const bank = lerp(rH, h, smoothstep(RIO_HW + 1, RIO_HW + 5, rD));
    h = bank - 1.6 * (1 - smoothstep(RIO_HW - 1.5, RIO_HW + 1.2, rD));
  }
  for (const L of LAKES) {
    const d = Math.hypot(x - L.x, z - L.z);
    if (d < L.R + 1) h = lerp(L.base - 2.5, h, smoothstep(L.R - L.ramp, L.R + 1, d));
  }
  return h;
}

// Ocupação do chão (para a decoração): 1 trilha, 2 marco, 3 água, 4 praça, 5 plataforma baixa.
export const OCC = { PATH: 1, LANDMARK: 2, WATER: 3, PLAZA: 4, PLATFORM: 5 };

export function createTerrain() {
  const mask = new Float32Array(N * N).fill(1);
  const paint = new Float32Array(N * N);
  const occ = new Uint8Array(N * N);
  const riverD = new Float32Array(N * N).fill(1e9);
  const riverH = new Float32Array(N * N);
  const hVis = new Float32Array(N * N);
  let hLog = hVis;

  // --- rasterização de segmentos e círculos na grade ---
  function rasterSeg(ax, az, bx, bz, reach, fn) {
    const i0 = Math.max(0, Math.floor(Math.min(ax, bx) - reach + HALF)), i1 = Math.min(N - 1, Math.ceil(Math.max(ax, bx) + reach + HALF));
    const j0 = Math.max(0, Math.floor(Math.min(az, bz) - reach + HALF)), j1 = Math.min(N - 1, Math.ceil(Math.max(az, bz) + reach + HALF));
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1e-9;
    for (let j = j0; j <= j1; j++) {
      const z = j - HALF;
      for (let i = i0; i <= i1; i++) {
        const x = i - HALF;
        const t = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1);
        const ex = x - ax - dx * t, ez = z - az - dz * t;
        const d = Math.sqrt(ex * ex + ez * ez);
        if (d <= reach) fn(j * N + i, d, t, x, z);
      }
    }
  }
  function rasterCircle(cx, cz, reach, fn) {
    const i0 = Math.max(0, Math.floor(cx - reach + HALF)), i1 = Math.min(N - 1, Math.ceil(cx + reach + HALF));
    const j0 = Math.max(0, Math.floor(cz - reach + HALF)), j1 = Math.min(N - 1, Math.ceil(cz + reach + HALF));
    for (let j = j0; j <= j1; j++) {
      const z = j - HALF;
      for (let i = i0; i <= i1; i++) {
        const x = i - HALF;
        const d = Math.hypot(x - cx, z - cz);
        if (d <= reach) fn(j * N + i, d, x, z);
      }
    }
  }
  const flatten = (k, d, flat, ramp) => { const v = smoothstep(flat, flat + ramp, d); if (v < mask[k]) mask[k] = v; };

  function buildMasks() {
    // Trilhas: chão plano + tinta de terra com borda macia.
    for (const p of PATHS) {
      const hw = p.width / 2 * (p.secret ? 0.85 : 1);
      const strength = p.secret ? 0.5 : 1;
      for (let s = 0; s < p.points.length - 1; s++) {
        const [ax, az] = p.points[s], [bx, bz] = p.points[s + 1];
        rasterSeg(ax, az, bx, bz, p.width / 2 + 11, (k, d, t, x, z) => {
          flatten(k, d, p.width / 2 + 3, 8);
          if (d < hw + 1.5) {
            const j = noise2(x * 0.4, z * 0.4) * 0.5;
            const v = (1 - smoothstep(hw - 0.9, hw + 0.3, d + j)) * strength;
            if (v > paint[k]) paint[k] = v;
            if (d < hw + 0.4 && !occ[k]) occ[k] = OCC.PATH;
          }
        });
      }
    }
    // Marcos no chão.
    for (const l of LANDMARKS) {
      if (!isGroundLandmark(l)) continue;
      const fp = footprint(l);
      const plaza = l.type === 'praca' && !(l.data && l.data.piso === 'grama');
      rasterCircle(l.x, l.z, fp + 9, (k, d) => {
        flatten(k, d, fp + 3, 6);
        if (d < fp && occ[k] !== OCC.WATER) occ[k] = plaza ? OCC.PLAZA : OCC.LANDMARK;
      });
    }
    // Clareira da Casinha Asas de Saudade: chão plano para a casinha.
    rasterCircle(SPOTS.asas_de_saudade.x, SPOTS.asas_de_saudade.z, SPOTS.asas_de_saudade.radius + 12, (k, d) => flatten(k, d, SPOTS.asas_de_saudade.radius + 2, 9));
    // Plataformas baixas.
    for (const p of PLATFORMS) {
      const r = p.radius ?? Math.max(p.w ?? 2, p.d ?? 2) / 2;
      const low = p.y - baseB(p.x, p.z) < 3;
      rasterCircle(p.x, p.z, r + 9, (k, d) => {
        if (low) flatten(k, d, r + 4, 5);
        if (d < r + 0.5 && !occ[k]) occ[k] = OCC.PLATFORM;
      });
    }
    // Lagos e fonte.
    for (const L of LAKES) {
      rasterCircle(L.x, L.z, L.R + 14, (k, d) => {
        flatten(k, d, L.R + 6, 8);
        if (d < L.R + 0.6) occ[k] = OCC.WATER;
      });
    }
    for (const F of FONTES) rasterCircle(F.x, F.z, F.r + 0.5, (k) => { occ[k] = OCC.WATER; });
    // Rio: distância e altura da margem no ponto mais próximo.
    for (let s = 0; s < RIO_PTS.length - 1; s++) {
      const [ax, az] = RIO_PTS[s], [bx, bz] = RIO_PTS[s + 1];
      const ha = RIO_H[s], hb = RIO_H[s + 1];
      rasterSeg(ax, az, bx, bz, RIO_HW + 14, (k, d, t) => {
        flatten(k, d, RIO_HW + 6, 8);
        if (d < riverD[k]) { riverD[k] = d; riverH[k] = lerp(ha, hb, t); }
        if (d < RIO_HW + 0.8) occ[k] = OCC.WATER;
      });
    }
  }

  async function computeHeights(onProgress) {
    let t0 = performance.now();
    for (let j = 0; j < N; j++) {
      const z = j - HALF;
      for (let i = 0; i < N; i++) {
        const k = j * N + i;
        hVis[k] = heightAt(i - HALF, z, mask[k], riverD[k], riverH[k]);
      }
      if (performance.now() - t0 > 35) {
        onProgress?.(j / N);
        await nextFrame();
        t0 = performance.now();
      }
    }
    // Chão lógico: pontes cobrem o rio no nível da trilha.
    hLog = hVis.slice();
    for (const b of BRIDGES) {
      const reach = Math.hypot(b.len, b.wid) / 2 + 1;
      rasterCircle(b.x, b.z, reach, (k, d, x, z) => {
        if (onBridge(x, z) === b && hLog[k] < b.y) hLog[k] = b.y;
      });
    }
  }

  function sample(arr, x, z) {
    const fx = x + HALF, fz = z + HALF;
    if (!(fx >= 0 && fz >= 0 && fx < N - 1 && fz < N - 1)) return NaN;
    const i = fx | 0, j = fz | 0, tx = fx - i, tz = fz - j, k = j * N + i;
    const a = arr[k], b = arr[k + 1], c = arr[k + N], d = arr[k + N + 1];
    return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
  }
  function cellIndex(x, z) {
    const i = Math.round(x + HALF), j = Math.round(z + HALF);
    if (i < 0 || j < 0 || i >= N || j >= N) return -1;
    return j * N + i;
  }

  /** Altura andável (com pontes). Rápida: grade + bilinear. */
  function getHeight(x, z) {
    if (meshH) {   // depois que a malha existe: exatamente a superfície desenhada (+ tabuleiro das pontes)
      const hm = meshHeight(x, z);
      if (hm === hm) {
        if (onBridge(x, z)) { const hb = sample(hLog, x, z); return hb > hm ? hb : hm; }
        return hm;
      }
    }
    const h = sample(hLog, x, z);
    return h === h ? h : heightAt(x, z, 1, 1e9, 0);
  }
  // Alturas dos vértices da malha principal (preenchido em buildMesh) e interpolação nos mesmos triângulos.
  let meshH = null, meshN = 0, meshSt = 1;
  function meshHeight(x, z) {
    const fx = (x + HALF) / meshSt, fz = (z + HALF) / meshSt;
    if (!(fx >= 0 && fz >= 0 && fx < meshN - 1 && fz < meshN - 1)) return NaN;
    const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, k = j * meshN + i;
    const a = meshH[k], b = meshH[k + 1], c = meshH[k + meshN], d = meshH[k + meshN + 1];
    if ((i + j) & 1) return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
    return v >= u ? a + (d - c) * u + (c - a) * v : a + (b - a) * u + (d - b) * v;
  }
  /** Altura da malha visual (sem pontes). */
  function heightVisual(x, z) {
    const h = sample(hVis, x, z);
    return h === h ? h : heightAt(x, z, 1, 1e9, 0);
  }
  function occAt(x, z) { const k = cellIndex(x, z); return k < 0 ? 0 : occ[k]; }
  function paintAt(x, z) { const p = sample(paint, x, z); return p === p ? p : 0; }
  function riverDistAt(x, z) { const k = cellIndex(x, z); return k < 0 ? 1e9 : riverD[k]; }

  function isWater(x, z) {
    for (const L of LAKES) if (Math.hypot(x - L.x, z - L.z) < L.R - 1) return true;
    for (const F of FONTES) if (Math.hypot(x - F.x, z - F.z) < F.r) return true;
    if (riverDistAt(x, z) < RIO_HW - 0.2 && !onBridge(x, z)) return true;
    return false;
  }

  // --- cores ---
  const lin = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
  const PAL = REGIONS.map((r) => ({ g1: lin(r.palette.ground), g2: lin(r.palette.ground2), path: lin(r.palette.path) }));
  const SAND = lin('#f6e7c1'), SAND_PINK = lin('#ffd3e6'), BED = lin('#7cc9c6'), BED_PINK = lin('#f39bc2');
  const LILAC = lin('#cdbff2'), SNOW = lin('#ffffff');
  const rgb = [0, 0, 0], PATHC = [0, 0, 0];
  const mixTo = (c, f) => { rgb[0] += (c[0] - rgb[0]) * f; rgb[1] += (c[1] - rgb[1]) * f; rgb[2] += (c[2] - rgb[2]) * f; };

  /**
   * Cor do chão (linear) em (x,z). ny = normal.y (inclinação). groundOnly: sem trilha/margens (para a grama).
   * Escreve em out[off..off+2].
   */
  function colorAt(x, z, h, ny, out, off = 0, groundOnly = false) {
    regionWeights(x, z, W);
    const n = smoothstep(-0.35, 0.45, fbm(x / 34 + 5.1, z / 34 - 2.3, 2)) * 0.85 + 0.15 * (noise2(x * 0.35, z * 0.35) * 0.5 + 0.5);
    let r = 0, g = 0, b = 0, pr = 0, pg = 0, pb = 0;
    for (let i = 0; i < NR; i++) {
      const p = PAL[i], w = W[i];
      if (w < 1e-4) continue;
      r += w * (p.g1[0] + (p.g2[0] - p.g1[0]) * n);
      g += w * (p.g1[1] + (p.g2[1] - p.g1[1]) * n);
      b += w * (p.g1[2] + (p.g2[2] - p.g1[2]) * n);
      pr += w * p.path[0]; pg += w * p.path[1]; pb += w * p.path[2];
    }
    rgb[0] = r; rgb[1] = g; rgb[2] = b;
    if (!groundOnly) {
      PATHC[0] = pr; PATHC[1] = pg; PATHC[2] = pb;
      const pt = paintAt(x, z);
      if (pt > 0) mixTo(PATHC, pt);
      // encostas íngremes viram terrinha
      const steep = smoothstep(0.9, 0.74, ny);
      if (steep > 0) { PATHC[0] *= 0.86; PATHC[1] *= 0.84; PATHC[2] *= 0.86; mixTo(PATHC, steep * 0.75); }
      // margens e fundo da água
      for (const L of LAKES) {
        const d = Math.hypot(x - L.x, z - L.z);
        if (d < L.R + 3) {
          mixTo(L.calda ? SAND_PINK : SAND, 1 - smoothstep(L.R + 0.5, L.R + 3, d));
          mixTo(L.calda ? BED_PINK : BED, (1 - smoothstep(L.R - L.ramp, L.R - 0.5, d)) * 0.8);
        }
      }
      const rd = riverDistAt(x, z);
      if (rd < RIO_HW + 3) {
        mixTo(SAND, 1 - smoothstep(RIO_HW + 0.5, RIO_HW + 3, rd));
        mixTo(BED, (1 - smoothstep(RIO_HW - 1.6, RIO_HW - 0.2, rd)) * 0.8);
      }
    }
    // neve de algodão no alto do Pico
    const snow = W[PICO_IDX] * smoothstep(20, 29.5, h) * 0.5;
    if (snow > 0) mixTo(SNOW, snow);
    // montanhas da borda: lilás e topos brancos
    const m = mountain(x, z);
    if (m > 0) {
      mixTo(LILAC, smoothstep(2, 30, m) * 0.6);
      mixTo(SNOW, smoothstep(60, 110, h) * 0.85);
    }
    out[off] = rgb[0]; out[off + 1] = rgb[1]; out[off + 2] = rgb[2];
  }

  function fillRegionAttrs(x, z, a0, a1, i3) {
    fadeWeights(x, z, W);
    a0[i3] = W[0]; a0[i3 + 1] = W[1]; a0[i3 + 2] = W[2];
    a1[i3] = W[3]; a1[i3 + 1] = W[4]; a1[i3 + 2] = W[5];
  }

  const terrainMat = patchMaterial(toon('#ffffff', { vertexColors: true }), { key: 'terrain' });

  function finishGeometry(pos, idx, xs, zs) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    const n = pos.length / 3;
    const nor = geo.attributes.normal.array;
    const col = new Float32Array(n * 3), a0 = new Float32Array(n * 3), a1 = new Float32Array(n * 3);
    for (let v = 0; v < n; v++) {
      const x = pos[v * 3], h = pos[v * 3 + 1], z = pos[v * 3 + 2];
      colorAt(x, z, h, nor[v * 3 + 1], col, v * 3);
      fillRegionAttrs(x, z, a0, a1, v * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aRw0', new THREE.BufferAttribute(a0, 3));
    geo.setAttribute('aRw1', new THREE.BufferAttribute(a1, 3));
    geo.computeBoundingSphere();
    return geo;
  }

  /** Malha principal do terreno (passo em metros conforme a qualidade). */
  function buildMesh(step) {
    const n = Math.round((HALF * 2) / step) + 1;
    const st = (HALF * 2) / (n - 1);
    const pos = new Float32Array(n * n * 3);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = -HALF + i * st, z = -HALF + j * st, v = (j * n + i) * 3;
        pos[v] = x; pos[v + 1] = heightVisual(x, z); pos[v + 2] = z;
      }
    }
    meshN = n; meshSt = st;
    meshH = new Float32Array(n * n);
    for (let k = 0; k < n * n; k++) meshH[k] = pos[k * 3 + 1];
    const idx = new Uint32Array((n - 1) * (n - 1) * 6);
    let q = 0;
    for (let j = 0; j < n - 1; j++) {
      for (let i = 0; i < n - 1; i++) {
        const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
        // diagonal alternada para colinas mais redondinhas
        if ((i + j) & 1) { idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d; }
        else { idx[q++] = a; idx[q++] = c; idx[q++] = d; idx[q++] = a; idx[q++] = d; idx[q++] = b; }
      }
    }
    const mesh = new THREE.Mesh(finishGeometry(pos, idx), terrainMat);
    mesh.name = 'terreno';
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    return mesh;
  }

  /** Anel de montanhas fora da grade (até r=900), por baixo da borda da malha principal. */
  function buildRing() {
    const A = 160;
    const T = [0, 0.012, 0.03, 0.06, 0.1, 0.16, 0.24, 0.34, 0.46, 0.6, 0.78, 1];
    const R = T.length;
    const pos = new Float32Array(A * R * 3);
    for (let a = 0; a < A; a++) {
      const th = (a / A) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
      const inner = HALF / Math.max(Math.abs(c), Math.abs(s)) - 6;
      for (let r = 0; r < R; r++) {
        const rr = lerp(inner, 900, T[r]);
        const x = c * rr, z = s * rr, v = (a * R + r) * 3;
        pos[v] = x; pos[v + 1] = heightAt(x, z, 1, 1e9, 0) - (r === 0 ? 1.5 : 0); pos[v + 2] = z;
      }
    }
    const idx = new Uint32Array(A * (R - 1) * 6);
    let q = 0;
    for (let a = 0; a < A; a++) {
      const a2 = (a + 1) % A;
      for (let r = 0; r < R - 1; r++) {
        const p0 = a * R + r, p1 = a * R + r + 1, p2 = a2 * R + r, p3 = a2 * R + r + 1;
        idx[q++] = p0; idx[q++] = p2; idx[q++] = p1; idx[q++] = p2; idx[q++] = p3; idx[q++] = p1;
      }
    }
    const mesh = new THREE.Mesh(finishGeometry(pos, idx), terrainMat);
    mesh.name = 'montanhas';
    mesh.matrixAutoUpdate = false;
    return mesh;
  }

  // --- água ---
  // Toon + ondinhas: listras de brilho que correm (rio) ou se espalham (lagos), reflexo do céu nas bordas
  // (fresnel), brilho do sol/lua (uSunDir) e espuminha nas margens (aEdge = 0 no meio, 1 na beira).
  const waterUniforms = {
    uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.3).normalize() },
    uSunCol: { value: new THREE.Color('#fff6e8') },
    uSky: { value: new THREE.Color('#bfe3ff') },
  };
  const waterMat = patchMaterial(toon('#ffffff', { vertexColors: true, transparent: true, opacity: 0.86 }), {
    key: 'water',
    uniforms: waterUniforms,
    vertexPars: 'attribute vec2 aWUv;\nattribute float aFlow;\nattribute float aEdge;\nvarying vec2 vWUv;\nvarying float vFlow;\nvarying float vEdge;\nvarying vec3 vWPos;',
    vertexMain: `vWUv = aWUv; vFlow = aFlow; vEdge = aEdge;
transformed.y += sin(uTime * 1.3 + aWUv.x * 0.6 + aWUv.y * 0.4) * 0.03;
vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
    fragmentPars: 'uniform vec3 uSunDir;\nuniform vec3 uSunCol;\nuniform vec3 uSky;\nvarying vec2 vWUv;\nvarying float vFlow;\nvarying float vEdge;\nvarying vec3 vWPos;',
    fragmentColor: `
      float pat;
      if (vFlow > 0.5) {
        pat = sin(vWUv.x * 0.7 - uTime * 2.6 + sin(vWUv.y * 1.3 + vWUv.x * 0.15) * 1.4);
      } else {
        float rr = length(vWUv);
        pat = sin(rr * 0.9 - uTime * 1.1 + sin(atan(vWUv.y, vWUv.x + 0.001) * 3.0 + uTime * 0.4) * 0.9);
      }
      diffuseColor.rgb += smoothstep(0.86, 0.98, pat) * 0.25;
      // normal das ondinhas (para o reflexo)
      vec2 wp = vWPos.xz;
      vec2 wg = vec2(cos(wp.x * 0.9 + uTime * 1.7), cos(wp.y * 0.8 - uTime * 1.3)) * 0.10
              + vec2(cos(wp.x * 2.3 - wp.y * 1.1 + uTime * 2.9), cos(wp.y * 2.1 + wp.x * 0.7 + uTime * 2.3)) * 0.05;
      vec3 wN = normalize(vec3(-wg.x, 1.0, -wg.y));
      vec3 wV = normalize(cameraPosition - vWPos);
      float wFres = pow(1.0 - clamp(dot(wN, wV), 0.0, 1.0), 3.0);
      diffuseColor.rgb = mix(diffuseColor.rgb, uSky, wFres * 0.6);
      diffuseColor.a = mix(diffuseColor.a, 1.0, wFres * 0.6);
      float wFoam = smoothstep(0.82, 1.0, vEdge) * (0.65 + 0.35 * sin(uTime * 2.0 + vWUv.x * 1.7 + vWUv.y * 1.3));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), wFoam * 0.55);
      float wSpec = pow(max(dot(reflect(-wV, wN), uSunDir), 0.0), 90.0);
      wSpec += smoothstep(0.93, 1.0, pat) * 0.15 * max(uSunDir.y, 0.0);
    `,
    fragmentEmissive: 'totalEmissiveRadiance += uSunCol * wSpec * 1.4;',
  });

  function buildWater() {
    const P = [], C = [], UV = [], F = [], E = [], I = [];
    const vert = (x, y, z, col, u, v, flow, edge = 1) => {
      P.push(x, y, z); C.push(col.r, col.g, col.b); UV.push(u, v); F.push(flow); E.push(edge);
      return P.length / 3 - 1;
    };
    // Rio: fita ao longo do traçado (mesmos segmentos do canal), até entrar no lago.
    const rioCol = new THREE.Color('#86d6f5');
    const endLake = LAKES.reduce((best, L) => {
      const [x, z] = RIO_PTS[RIO_PTS.length - 1];
      const d = Math.hypot(x - L.x, z - L.z);
      return d < L.R + 2 && (!best || d < best.d) ? { L, d } : best;
    }, null)?.L;
    const hw = RIO_HW + 1.3;
    let arc = 0, prev = -1;
    for (let s = 0; s < RIO_PTS.length - 1; s++) {
      const [ax, az] = RIO_PTS[s], [bx, bz] = RIO_PTS[s + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const steps = Math.max(1, Math.ceil(len / 2));
      let stop = false;
      for (let k = (s === 0 ? 0 : 1); k <= steps; k++) {
        const t = k / steps;
        const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        if (endLake && Math.hypot(x - endLake.x, z - endLake.z) < endLake.R - 1) { stop = true; break; }
        // tangente: média dos segmentos vizinhos nos vértices
        let tx = (bx - ax) / len, tz = (bz - az) / len;
        if (k === steps && s + 2 < RIO_PTS.length) {
          const [cx, cz] = RIO_PTS[s + 2];
          const l2 = Math.hypot(cx - bx, cz - bz);
          tx += (cx - bx) / l2; tz += (cz - bz) / l2;
          const l = Math.hypot(tx, tz); tx /= l; tz /= l;
        }
        const nx = -tz, nz = tx;
        const y = lerp(RIO_H[s], RIO_H[s + 1], t) - 0.7;
        const u = arc + len * t;
        const l = vert(x + nx * hw, y, z + nz * hw, rioCol, u, -hw, 1, 1);
        vert(x, y, z, rioCol, u, 0, 1, 0);
        const r = vert(x - nx * hw, y, z - nz * hw, rioCol, u, hw, 1, 1);
        if (prev >= 0) { I.push(prev, l, prev + 1, prev + 1, l, l + 1, prev + 1, l + 1, prev + 2, prev + 2, l + 1, r); }
        prev = l;
      }
      arc += len;
      if (stop) break;
    }
    // Lagos (disco) e fonte.
    const disc = (cx, cz, R, y, cCenter, cEdge, seg) => {
      const c0 = vert(cx, y, cz, cCenter, 0, 0, 0, 0);
      for (let i = 0; i < seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        vert(cx + Math.cos(a) * R, y, cz + Math.sin(a) * R, cEdge, Math.cos(a) * R, Math.sin(a) * R, 0);
      }
      for (let i = 0; i < seg; i++) I.push(c0, c0 + 1 + ((i + 1) % seg), c0 + 1 + i);
    };
    for (const L of LAKES) {
      const edge = new THREE.Color(L.color || (L.R < 8 ? '#a8e8ff' : '#8fdcf2'));
      const center = edge.clone().multiplyScalar(0.8);
      disc(L.x, L.z, L.R + 0.6, L.surf, center, edge, 48);
    }
    for (const F of FONTES) disc(F.x, F.z, F.r, F.surf, new THREE.Color('#8fe0ff'), new THREE.Color('#b5ecff'), 32);

    const n = P.length / 3;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    const nor = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) nor[i * 3 + 1] = 1;
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    geo.setAttribute('aWUv', new THREE.Float32BufferAttribute(UV, 2));
    geo.setAttribute('aFlow', new THREE.Float32BufferAttribute(F, 1));
    geo.setAttribute('aEdge', new THREE.Float32BufferAttribute(E, 1));
    const a0 = new Float32Array(n * 3), a1 = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) fillRegionAttrs(P[i * 3], P[i * 3 + 2], a0, a1, i * 3);
    geo.setAttribute('aRw0', new THREE.BufferAttribute(a0, 3));
    geo.setAttribute('aRw1', new THREE.BufferAttribute(a1, 3));
    geo.setIndex(I);
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, waterMat);
    mesh.name = 'agua';
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    return mesh;
  }

  return {
    async build(onProgress) {
      buildMasks();
      await nextFrame();
      await computeHeights(onProgress);
    },
    getHeight, heightVisual, occAt,
    /** Altura da superfície desenhada (malha, sem pontes) — para apoiar decoração no chão. */
    surfaceHeight: (x, z) => { const h = meshH ? meshHeight(x, z) : NaN; return h === h ? h : heightVisual(x, z); }, paintAt, isWater, colorAt, riverDistAt,
    buildMesh, buildRing, buildWater,
    lakes: LAKES, fontes: FONTES, bridges: BRIDGES, waterUniforms, rioPts: RIO_PTS, rioH: RIO_H, rioHalfWidth: RIO_HW,
  };
}
