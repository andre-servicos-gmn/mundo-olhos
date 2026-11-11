// Validador permanente dos dados do Mundo Olhos (src/data/worldmap.js + src/data/story.js).
// Sem dependências: node tests/validate-data.mjs [-v] [--terreno]
//   -v         mostra cada salto das rotas de plataformas
//   --terreno  também confere contra o terreno REAL de src/world/terrain.js (usa o Three.js de vendor/)
// Sai com código 1 se houver erro. Avisos não reprovam.
//
// O que confere: ids e referências; tudo dentro da região e do mundo, fora d'água e de construções;
// trilhas × rio × pontes; saltos das rotas (pulo 1,6 / trampolim ~5); cabeçadas entre plataformas;
// terreno de docs/mapa.md (inclinação das trilhas, 1º degrau, plataformas enterradas, câmeras de cena);
// cadeia de missões (ciclos, flags, gate do Pico, noite com banco, final alcançável, cor ≥ 1 por região);
// passos do contrato; entregas (deliver.count); falas (Pinceso só depois de entrar, Quim fala pouco);
// economia de jujubas; itens da visão do jogo; clareira da Casinha Asas de Saudade.
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const url = (p) => pathToFileURL(join(ROOT, p)).href;
const Wm = await import(url('src/data/worldmap.js'));
const St = await import(url('src/data/story.js'));
const { WORLD, SPAWN, REGIONS, PATHS, LANDMARKS, PLATFORMS, WATER, JUJUBA_SPOTS, GATES, SCATTER, SPOTS } = Wm;
const { CAST, NPCS, MISSIONS, DRINKS, ACCESSORIES, PROLOGUE, ENDING, TIPS } = St;
const VERBOSE = process.argv.includes('-v');

const errors = [], warns = [], report = [];
const E = (m) => errors.push(m), Wn = (m) => warns.push(m);
const hyp = Math.hypot;
const R = Object.fromEntries(REGIONS.map((r) => [r.id, r]));
const lmById = Object.fromEntries(LANDMARKS.map((l) => [l.id, l]));
const npcById = Object.fromEntries(NPCS.map((n) => [n.id, n]));
const misById = Object.fromEntries(MISSIONS.map((m) => [m.id, m]));

// =============================================================================================
// Geometria
function distSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0;
  return hyp(px - ax - dx * t, pz - az - dz * t);
}
const distPoly = (x, z, pts) => { let d = Infinity; for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, distSeg(x, z, ...pts[i], ...pts[i + 1])); return d; };
/** Amostra uma polilinha a cada ~passo metros: [[x,z], ...]. */
function samples(pts, passo = 1) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], n = Math.max(1, Math.ceil(hyp(bx - ax, bz - az) / passo));
    for (let k = 0; k < n; k++) out.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// Pegadas no chão (raio × scale), iguais às de docs/mapa.md (seção 8). 0 = decalque / no alto.
const FOOT = { casa_quim: 6, casa: 5, cafeteria: 7, loja_acessorios: 6, fonte: 5, banco: 1.3, placa: 0.6, poste: 0.4,
  moinho: 5, horta: 4, jardim: 5, ninho: 1.5, casinha_passaro: 1, cata_vento: 1, arvore_algodao: 2.5, pirulito_gigante: 1.5,
  cogumelo: 2, flor_gigante: 2, torre_relogio: 5, mirante: 4, rocha: 2.5, cerca: 1, 'poço': 1.8, coreto: 5, estatua_olho: 2,
  caixa_correio: 0.5, praca: 0, ponte: 0, portal_nuvem: 0, ninho_coreto: 0, cachoeira: 0 };
const KNOWN = new Set(['casa_quim', 'casa', 'cafeteria', 'loja_acessorios', 'fonte', 'praca', 'ponte', 'placa', 'banco', 'poste',
  'moinho', 'horta', 'jardim', 'arvore_gigante', 'ninho_coreto', 'casinha_passaro', 'ninho', 'cata_vento', 'arvore_algodao',
  'pirulito_gigante', 'cogumelo', 'flor_gigante', 'torre_relogio', 'mirante', 'portal_nuvem', 'rocha', 'cerca', 'poço', 'coreto',
  'estatua_olho', 'caixa_correio', 'cachoeira']);   // os dois últimos são extras documentados em docs/mapa.md
const foot = (l) => (l.type === 'arvore_gigante' ? l.data.trunkRadius + 1 : (FOOT[l.type] ?? 1) * (l.scale ?? 1));
const aloft = (l) => !!(l.data?.sobre || (l.data?.y !== undefined && l.type !== 'mirante'));
const SMALL = new Set(['placa', 'poste', 'banco', 'caixa_correio']);
/** Landmark sólido no chão que contém (x,z), ou null. */
function solidAt(x, z, pad = 0, { small = true } = {}) {
  for (const l of LANDMARKS) {
    const f = foot(l);
    if (!f || aloft(l) || (!small && SMALL.has(l.type))) continue;
    if (hyp(x - l.x, z - l.z) < f + pad) return l;
  }
  return null;
}

// Água: distância até a borda (negativa = dentro).
function waterDist(x, z) {
  let d = Infinity;
  for (const w of WATER) d = Math.min(d, w.type === 'rio' ? distPoly(x, z, w.points) - w.width / 2 : hyp(x - w.x, z - w.z) - w.radius);
  return d;
}
const inRegion = (o, slack = 0) => hyp(o.x - R[o.region].center.x, o.z - R[o.region].center.z) <= R[o.region].radius + slack;
const inWorld = (x, z) => hyp(x, z) <= WORLD.playRadius - 8;
const regionsAt = (x, z) => REGIONS.filter((r) => hyp(x - r.center.x, z - r.center.z) <= r.radius).map((r) => r.id);

// Plataformas: forma e vão borda-a-borda.
function shapeOf(p) {
  if (p.w) return { kind: 'rect', x: p.x, z: p.z, hw: p.w / 2, hd: p.d / 2, rot: p.rotY || 0 };
  return { kind: 'circle', x: p.x, z: p.z, r: p.radius ?? 1.5 };
}
function rectPointDist(s, x, z) {
  const dx = x - s.x, dz = z - s.z, c = Math.cos(s.rot), sn = Math.sin(s.rot);
  const lx = dx * c - dz * sn, lz = dx * sn + dz * c;
  return hyp(Math.max(Math.abs(lx) - s.hw, 0), Math.max(Math.abs(lz) - s.hd, 0));
}
function edgeGap(a, b) {
  const A = shapeOf(a), B = shapeOf(b);
  if (A.kind === 'circle' && B.kind === 'circle') return hyp(A.x - B.x, A.z - B.z) - A.r - B.r;
  if (A.kind === 'rect' && B.kind === 'circle') return rectPointDist(A, B.x, B.z) - B.r;
  if (B.kind === 'rect' && A.kind === 'circle') return rectPointDist(B, A.x, A.z) - A.r;
  return hyp(A.x - B.x, A.z - B.z) - Math.max(A.hd, A.hw) - Math.max(B.hd, B.hw);
}
/** Plataforma cujo topo é y (ou y - 0.5 para itens) e que contém (x,z). */
const platAt = (x, z, y, item = false) => PLATFORMS.find((pl) => edgeGap(pl, { x, z, radius: 0 }) <= 0.2
  && (Math.abs(y - pl.y) < 0.01 || (item && Math.abs(y - (pl.y + 0.5)) < 0.01)));

// =============================================================================================
// Terreno de docs/mapa.md, seção 3 (analítico, sem o ruído — onde importa a máscara zera o ruído).
const PICO = R.pico.center;
const BASE_EFF = REGIONS.map((r) => (r.id === 'pico' ? 6 : r.baseHeight));   // o Pico entra na mistura como o pé do cone
function baseB(x, z) {
  let s = 0, b = 0;
  REGIONS.forEach((r, i) => {
    const q = hyp(x - r.center.x, z - r.center.z) / r.radius;
    const w = Math.exp(-2 * q ** 4) + 0.05 * Math.exp(-q * q);   // 2º termo: transição macia longe dos centros
    s += w; b += w * BASE_EFF[i];
  });
  return b / s;
}
const cone = (d) => 6 + 24 * Math.max(0, Math.min(1, (75 - d) / 47));
const ground = (x, z) => { const d = hyp(x - PICO.x, z - PICO.z); return d < 75 ? Math.max(baseB(x, z), cone(d)) : baseB(x, z); };

// =============================================================================================
// MAPA
const ids = new Map();
for (const [name, arr] of Object.entries({ PATHS, LANDMARKS, PLATFORMS, WATER, JUJUBA_SPOTS, GATES })) {
  for (const o of arr) { if (ids.has(o.id)) E(`id duplicado ${o.id} (${name} e ${ids.get(o.id)})`); ids.set(o.id, name); }
}
if (!inWorld(SPAWN.x, SPAWN.z)) E('SPAWN fora do mundo');
if (solidAt(SPAWN.x, SPAWN.z)) E('SPAWN dentro de ' + solidAt(SPAWN.x, SPAWN.z).id);
for (const r of REGIONS) if (!SCATTER[r.id]) E('SCATTER sem ' + r.id);

// Trilhas: dentro do mundo, só cruzam o rio onde há ponte, sem rampa de base íngreme.
for (const p of PATHS) {
  if (!R[p.from] || !R[p.to]) E(`trilha ${p.id} com região inválida`);
  for (const [x, z] of p.points) if (!inWorld(x, z)) E(`trilha ${p.id} ponto fora do mundo ${x},${z}`);
  for (const [x, z] of samples(p.points, 1)) {
    if (waterDist(x, z) < p.width / 2 && !LANDMARKS.some((l) => l.type === 'ponte' && hyp(l.x - x, l.z - z) < 9))
      E(`trilha ${p.id} entra na água perto de ${x.toFixed(1)},${z.toFixed(1)} sem ponte`);
  }
  if (p.id === 'serpentina_pico') continue;   // segue o cone; conferida abaixo
  const s = samples(p.points, 1);
  let mx = 0, at = '';
  for (let i = 0; i < s.length - 1; i++) {
    const L = hyp(s[i + 1][0] - s[i][0], s[i + 1][1] - s[i][1]); if (L < 0.05) continue;
    const g = Math.abs(ground(...s[i + 1]) - ground(...s[i])) / L;
    if (g > mx) { mx = g; at = s[i].map((v) => v.toFixed(0)).join(','); }
  }
  if (mx > 0.3) E(`trilha ${p.id}: rampa de ${(mx * 100).toFixed(0)}% em ${at} (máx 30%)`);
}
// Serpentina: começa no pé do cone (sem degrau no portal) e nenhum trecho passa de 35%.
{
  const serp = PATHS.find((p) => p.id === 'serpentina_pico'), estrada = PATHS.find((p) => p.id === 'estrada_cidade_pico');
  const p0 = serp.points[0], d0 = hyp(p0[0] - PICO.x, p0[1] - PICO.z);
  if (cone(d0) - baseB(...p0) > 0.6) E(`serpentina começa ${(cone(d0) - baseB(...p0)).toFixed(1)} m acima da Estrada do Vento (degrau no portal)`);
  if (hyp(estrada.points.at(-1)[0] - p0[0], estrada.points.at(-1)[1] - p0[1]) > 0.5) E('Estrada do Vento não termina no início da serpentina');
  for (let i = 0; i < serp.points.length - 1; i++) {
    const [ax, az] = serp.points[i], [bx, bz] = serp.points[i + 1];
    const g = (cone(hyp(bx - PICO.x, bz - PICO.z)) - cone(hyp(ax - PICO.x, az - PICO.z))) / hyp(bx - ax, bz - az);
    if (g < -0.01) E(`serpentina desce no trecho ${i}`);
    if (g > 0.35) E(`serpentina trecho ${i}: ${(g * 100).toFixed(0)}% (máx 35%)`);
  }
  if (cone(hyp(serp.points.at(-1)[0] - PICO.x, serp.points.at(-1)[1] - PICO.z)) < 29.9) E('serpentina não chega ao platô');
}

// Landmarks.
const perRegion = {};
for (const l of LANDMARKS) {
  perRegion[l.region] = (perRegion[l.region] || 0) + 1;
  if (!R[l.region]) { E(`landmark ${l.id} região inválida`); continue; }
  if (!KNOWN.has(l.type)) E(`landmark ${l.id}: tipo ${l.type} não documentado`);
  if (!inRegion(l, ['ponte', 'portal_nuvem'].includes(l.type) ? 12 : 0)) E(`landmark ${l.id} fora da região ${l.region}`);
  if (!inWorld(l.x, l.z)) E(`landmark ${l.id} fora do mundo`);
  const f = foot(l);
  if (!['ponte', 'fonte', 'cachoeira', 'praca'].includes(l.type) && waterDist(l.x, l.z) < f + 0.5) E(`landmark ${l.id} na água`);
  if (f > 0 && !aloft(l)) for (const p of PATHS) {
    const need = SMALL.has(l.type) ? p.width / 2 + 0.3 : f + p.width / 2 + 0.5;
    if (distPoly(l.x, l.z, p.points) < need) E(`landmark ${l.id} em cima da trilha ${p.id}`);
  }
  if (l.data?.sobre && !lmById[l.data.sobre]) E(`landmark ${l.id}: sobre ${l.data.sobre} não existe`);
}
for (let i = 0; i < LANDMARKS.length; i++) for (let j = i + 1; j < LANDMARKS.length; j++) {
  const a = LANDMARKS[i], b = LANDMARKS[j], fa = foot(a), fb = foot(b);
  if (!fa || !fb || a.data?.sobre === b.id || b.data?.sobre === a.id) continue;
  const d = hyp(a.x - b.x, a.z - b.z);
  if (d < (fa + fb) * 0.9) E(`sobreposição ${a.id} × ${b.id} (d=${d.toFixed(1)})`);
}
// Oco da Dona Plumínia: o buraco desenhado (data.oco.angulo) tem que ficar onde está a plataforma oco_coruja.
{
  const arv = lmById.arvore_coruja, oco = PLATFORMS.find((p) => p.id === 'oco_coruja');
  const ang = (Math.atan2(oco.z - arv.z, oco.x - arv.x) * 180 / Math.PI + 360) % 360;
  const diff = Math.abs(((arv.data.oco.angulo - ang) % 360 + 540) % 360 - 180);
  if (diff > 10) E(`arvore_coruja.data.oco.angulo (${arv.data.oco.angulo}°) não aponta para a plataforma oco_coruja (${ang.toFixed(0)}°)`);
  if (Math.abs(arv.data.oco.y - oco.y) > 0.01) E('altura do oco ≠ plataforma oco_coruja');
}
// Ninho-Coreto: abertura do parapeito virada para o último trampolim.
{
  const c = lmById.ninho_coreto, m8 = PLATFORMS.find((p) => p.id === 'ninhal_m_8');
  const ang = (Math.atan2(m8.z - c.z, m8.x - c.x) * 180 / Math.PI + 360) % 360;
  if (Math.abs(ang - c.data.entrada) > 10) E('ninho_coreto.data.entrada não aponta para ninhal_m_8');
}

// Plataformas e rotas.
const trunks = LANDMARKS.filter((l) => l.type === 'arvore_gigante')
  .map((l) => ({ id: l.id, x: l.x, z: l.z, r: l.data.trunkRadius, top: R[l.region].baseHeight + l.data.height }));
const routes = {};
for (const p of PLATFORMS) {
  if (!R[p.region]) E(`plataforma ${p.id} região inválida`); else if (!inRegion(p)) E(`plataforma ${p.id} fora da região`);
  if (!['folha', 'galho', 'ninho_trampolim', 'ponte_cipo', 'pedra', 'nuvem', 'escada'].includes(p.type)) E(`plataforma ${p.id} tipo ${p.type}`);
  if (typeof p.y !== 'number') E(`plataforma ${p.id} sem y`);
  else if (p.y - ground(p.x, p.z) < 0.3) E(`plataforma ${p.id} enterrada (y ${p.y}, chão ${ground(p.x, p.z).toFixed(2)})`);
  if (p.route) (routes[p.route] ||= []).push(p); else Wn(`plataforma ${p.id} sem route`);
}
for (const [rid, list] of Object.entries(routes)) {
  const first = list[0], g0 = ground(first.x, first.z);
  if (first.y - g0 > 1.3) E(`rota ${rid}: 1º degrau ${(first.y - g0).toFixed(2)} acima do chão (máx 1,3)`);
  for (let i = 0; i < list.length - 1; i++) {
    const a = list[i], b = list[i + 1], rise = b.y - a.y, gap = edgeGap(a, b), bouncy = !!a.bounce;
    const ok = rise <= (bouncy ? 4.2 : 1.3) && gap <= (bouncy ? 3.5 : 3.2);
    report.push(`${rid}: ${a.id} -> ${b.id}  sobe ${rise.toFixed(2)}  vão ${gap.toFixed(2)}${bouncy ? ' (trampolim)' : ''}${ok ? '' : '  <-- RUIM'}`);
    if (!ok) E(`rota ${rid}: salto ${a.id} -> ${b.id} impossível (sobe ${rise.toFixed(2)}, vão ${gap.toFixed(2)})`);
  }
}
for (let i = 0; i < PLATFORMS.length; i++) for (let j = i + 1; j < PLATFORMS.length; j++) {
  const a = PLATFORMS[i], b = PLATFORMS[j], dy = Math.abs(a.y - b.y);
  if (dy >= 0.05 && dy < 3 && edgeGap(a, b) < -0.05) E(`plataformas ${a.id} e ${b.id} empilhadas com só ${dy.toFixed(2)} livres`);
}
for (const p of PLATFORMS) for (const t of trunks) {
  const s = shapeOf(p), d = s.kind === 'circle' ? hyp(p.x - t.x, p.z - t.z) - s.r : rectPointDist(s, t.x, t.z);
  if ((s.kind === 'rect' && d < t.r - 0.6 && p.y < t.top) || (hyp(p.x - t.x, p.z - t.z) < t.r && p.y < t.top - 0.1)) E(`plataforma ${p.id} atravessa o tronco ${t.id}`);
}
for (const p of PLATFORMS) {
  const low = p.y - R[p.region].baseHeight;
  if (low <= 2.2) for (const path of PATHS) if (distPoly(p.x, p.z, path.points) < (p.radius ?? 1.5) + path.width / 2) E(`plataforma baixa ${p.id} em cima da trilha ${path.id}`);
  if (low <= 4) for (const l of LANDMARKS) {
    const f = foot(l);
    if (!f || aloft(l) || l.type === 'arvore_gigante' || (p.route === 'telhado_gato' && l.id === 'casa_gato')) continue;
    if (edgeGap(p, { x: l.x, z: l.z, radius: f }) < 0) E(`plataforma baixa ${p.id} dentro de ${l.id}`);
  }
}

// Jujubas.
const jjRegion = {};
for (const j of JUJUBA_SPOTS) {
  jjRegion[j.region] = (jjRegion[j.region] || 0) + 1;
  if (!/^#[0-9a-f]{6}$/i.test(j.color)) E(`jujuba ${j.id} cor`);
  if (!inRegion(j)) E(`jujuba ${j.id} fora da região ${j.region}`);
  if (j.y === undefined) {
    if (waterDist(j.x, j.z) < 0.6) E(`jujuba ${j.id} na água`);
    for (const l of LANDMARKS) if (foot(l) && !aloft(l) && hyp(j.x - l.x, j.z - l.z) < foot(l) * 0.95) E(`jujuba ${j.id} dentro de ${l.id}`);
  } else if (!platAt(j.x, j.z, j.y)) E(`jujuba ${j.id} com y=${j.y} fora de plataforma`);
}
for (let i = 0; i < JUJUBA_SPOTS.length; i++) for (let k = i + 1; k < JUJUBA_SPOTS.length; k++) {
  const a = JUJUBA_SPOTS[i], b = JUJUBA_SPOTS[k];
  if (hyp(a.x - b.x, a.z - b.z) < 0.9 && Math.abs((a.y ?? 0) - (b.y ?? 0)) < 1) E(`jujubas ${a.id} e ${b.id} grudadas`);
}

// SPOTS: fora d'água, dentro de alguma região, ids referenciados existem.
(function walk(o, name) {
  if (Array.isArray(o)) { if (o.length === 2 && o.every((v) => typeof v === 'number')) return; o.forEach((v, i) => walk(v, `${name}[${i}]`)); return; }
  if (typeof o === 'string') { if (!lmById[o] && !PLATFORMS.some((p) => p.id === o)) E(`${name} referencia id inexistente ${o}`); return; }
  if (!o || typeof o !== 'object') return;
  if (typeof o.x === 'number') {
    if (!regionsAt(o.x, o.z).length) E(`${name} fora de qualquer região`);
    if (o.y === undefined) {
      if (waterDist(o.x, o.z) < 0.8) E(`${name} na água`);
      const l = solidAt(o.x, o.z, 0, { small: false }); if (l && hyp(o.x - l.x, o.z - l.z) < foot(l) * 0.95) E(`${name} dentro de ${l.id}`);
    }
  }
  for (const [k, v] of Object.entries(o)) if (k !== 'id' && (typeof v === 'object' || typeof v === 'string')) walk(v, `${name}.${k}`);
})(SPOTS, 'SPOTS');

// Gates: não bloqueiam outras trilhas; a serpentina começa fora da névoa.
for (const g of GATES) {
  for (const p of PATHS.filter((p) => !['serpentina_pico', 'estrada_cidade_pico'].includes(p.id)))
    if (distPoly(g.x, g.z, p.points) < g.radius) E(`gate ${g.id} bloqueia trilha ${p.id}`);
  const s0 = PATHS.find((p) => p.id === 'serpentina_pico').points[0];
  if (hyp(s0[0] - g.x, s0[1] - g.z) <= g.radius + 3) E('o portal (início da serpentina) fica dentro da névoa');
}

// =============================================================================================
// HISTÓRIA
const PROPS = new Set(['flor_murcha', 'flor', 'ovo', 'pena', 'pena_verde', 'graveto', 'folha', 'carta', 'jujuba', 'semente', 'regador', 'cipo_prisao', 'gato', 'broto']);
const MOODS = new Set(['feliz', 'surpresa', 'triste', 'curiosa']);
const SPEAKERS = new Set(['quim', 'pinceso', 'narrador', ...NPCS.map((n) => n.id)]);

function checkPoint(ctx, p, { region = null, building = true, water = true, item = false } = {}) {
  if (typeof p?.x !== 'number' || typeof p?.z !== 'number' || Number.isNaN(p.x) || Number.isNaN(p.z)) return E(`${ctx}: coordenada inválida`);
  if (!inWorld(p.x, p.z)) E(`${ctx}: fora do raio jogável (${p.x},${p.z})`);
  const rs = regionsAt(p.x, p.z);
  if (!rs.length) E(`${ctx}: fora de qualquer região (${p.x},${p.z})`);
  if (region && !rs.includes(region)) E(`${ctx}: fora da região ${region} (${p.x},${p.z})`);
  if (p.y === undefined) {
    if (water && waterDist(p.x, p.z) < 1) E(`${ctx}: na água (${p.x},${p.z})`);
    if (building) { const l = solidAt(p.x, p.z, 0.6); if (l) E(`${ctx}: dentro de ${l.id} (${p.x},${p.z})`); }
  } else {
    const rocha = LANDMARKS.find((l) => l.type === 'rocha' && hyp(l.x - p.x, l.z - p.z) < 0.1);   // topo de rocha (Pedra Musguinho)
    const pl = platAt(p.x, p.z, p.y, item);
    if (!pl && !rocha) E(`${ctx}: y=${p.y} não está sobre nenhuma plataforma (${p.x},${p.z})`);
    if (item && pl && Math.abs(pl.y + 0.5 - p.y) > 0.01) E(`${ctx}: item em plataforma deve ter y = topo + 0,5`);
  }
}
function checkLines(ctx, lines, pincesoOk) {
  if (!Array.isArray(lines)) return E(`${ctx}: lines não é array`);
  lines.forEach((l, i) => {
    if (l.camera) return;
    const c = `${ctx}[${i}]`;
    if (!SPEAKERS.has(l.speaker)) E(`${c}: speaker desconhecido ${l.speaker}`);
    if (typeof l.text !== 'string' || !l.text.trim()) return E(`${c}: texto vazio`);
    if (l.mood && !MOODS.has(l.mood)) E(`${c}: mood inválido ${l.mood}`);
    if (l.speaker === 'pinceso' && !pincesoOk) E(`${c}: Pinceso fala antes de entrar na história`);
    if (l.text.length > 150) Wn(`${c}: fala longa (${l.text.length})`);
    if (l.speaker === 'quim' && l.text.length > 36) E(`${c}: a Quim fala pouco e murmura ("${l.text}")`);
    if (/ {2}|^\s|\s$/.test(l.text)) E(`${c}: espaços sobrando`);
    if ((l.text.match(/\(/g) || []).length !== (l.text.match(/\)/g) || []).length) E(`${c}: parênteses desbalanceados`);
    if ((l.text.match(/"/g) || []).length % 2) E(`${c}: aspas desbalanceadas`);
    if (!/[.!?…)"]$/.test(l.text)) Wn(`${c}: sem pontuação final: ${l.text.slice(-20)}`);
  });
}

// Unicidade.
const dup = (arr, what) => { const s = new Set(); for (const id of arr) { if (s.has(id)) E(`${what} duplicado: ${id}`); s.add(id); } };
dup(NPCS.map((n) => n.id), 'NPC');
dup(MISSIONS.map((m) => m.id), 'missão');
dup([...MISSIONS.flatMap((m) => m.steps.filter((s) => s.type === 'collect').flatMap((s) => s.spots.map((p) => p.id))), ...JUJUBA_SPOTS.map((j) => j.id)], 'item');
for (const k of ['quim', 'pinceso']) if (!CAST[k]?.voice) E(`CAST.${k} sem voz`);

// Moradores.
const flagSetters = {};
for (const m of MISSIONS) for (const f of [m.rewards?.flag, ...m.steps.filter((s) => s.type === 'set_flag').map((s) => s.flag)].filter(Boolean)) (flagSetters[f] ||= []).push(m.id);
for (const n of NPCS) {
  const c = `NPC ${n.id}`;
  for (const f of ['id', 'name', 'region', 'species', 'look', 'voice', 'idleLines']) if (n[f] === undefined) E(`${c}: falta ${f}`);
  if (!R[n.region]) E(`${c}: região ${n.region}`);
  checkPoint(c, n, { region: n.region });
  if (n.nightPos) checkPoint(c + ' nightPos', n.nightPos);
  if (typeof n.wander !== 'number') E(`${c}: wander`);
  if (n.idleLines.length < 3 || n.idleLines.length > 5) E(`${c}: ${n.idleLines.length} idleLines (3–5)`);
  if (!n.look?.body || !n.look?.outfit || !n.look?.size) E(`${c}: look incompleto`);
  if (typeof n.voice?.pitch !== 'number' || typeof n.voice?.speed !== 'number') E(`${c}: voz incompleta`);
  for (const f of [n.showAfterFlag, n.hideAfterFlag].filter(Boolean)) if (!flagSetters[f]) E(`${c}: flag ${f} nunca é ligada`);
  for (const o of NPCS) if (o !== n && hyp(o.x - n.x, o.z - n.z) < 2) E(`${c}: grudado em ${o.id}`);
}

// Requisitos, ciclos, flags.
const reqOf = (m) => m.requires?.missions ?? [];
for (const m of MISSIONS) for (const r of reqOf(m)) if (!misById[r]) E(`missão ${m.id}: requires ${r} não existe`);
const ancestors = (id, seen = new Set()) => { for (const r of reqOf(misById[id] ?? {})) if (!seen.has(r)) { seen.add(r); ancestors(r, seen); } return seen; };
for (const m of MISSIONS) if (ancestors(m.id).has(m.id)) E(`missão ${m.id}: ciclo de requires`);
const JOIN = MISSIONS.find((m) => m.steps.some((s) => s.type === 'pinceso_join'));
if (!JOIN) E('nenhuma missão tem pinceso_join');
for (const m of MISSIONS) for (const f of m.requires?.flags ?? []) {
  if (!flagSetters[f]) E(`missão ${m.id}: flag ${f} nunca é ligada`);
  else if (!flagSetters[f].some((id) => ancestors(m.id).has(id))) E(`missão ${m.id}: flag ${f} não vem de um ancestral`);
}
for (const g of GATES) if (!flagSetters[g.requiresFlag]) E(`GATE ${g.id}: flag ${g.requiresFlag} nunca é ligada`);
for (const d of DRINKS) if (d.requiresFlag && !flagSetters[d.requiresFlag]) E(`bebida ${d.id}: flag ${d.requiresFlag} nunca é ligada`);
/** Missões que só existem depois que a flag do gate liga (descendem de quem liga, ou são quem liga depois do set_flag). */
const afterGate = (m, g) => (flagSetters[g.requiresFlag] ?? []).some((id) => ancestors(m.id).has(id));

// Passos.
const STEP_REQ = { talk: ['npc', 'lines'], goto: ['x', 'z', 'radius', 'label'], collect: ['item', 'spots', 'count'],
  deliver: ['npc', 'item', 'lines'], interact: ['target', 'label', 'lines'], follow_trail: ['spots', 'item', 'lines'],
  minigame: ['kind', 'params'], night: [], cafe: [], cutscene: ['lines'], pinceso_join: [], set_flag: ['flag'] };
const colorSum = Object.fromEntries(REGIONS.map((r) => [r.id, 0])), mainColor = { ...colorSum };
const accIds = new Set(ACCESSORIES.map((a) => a.id)), drinkIds = new Set(DRINKS.map((d) => d.id));
const bancos = (SPOTS.bancos_dormir ?? []).map((id) => lmById[id]).filter(Boolean);
const cameras = [];
for (const m of MISSIONS) {
  const ctx = `missão ${m.id}`;
  for (const f of ['id', 'region', 'title', 'summary', 'main', 'giver', 'requires', 'rewards', 'steps']) if (m[f] === undefined) E(`${ctx}: falta ${f}`);
  if (!R[m.region]) E(`${ctx}: região ${m.region}`);
  if (m.giver && !npcById[m.giver]) E(`${ctx}: giver ${m.giver} não existe`);
  const c = m.rewards.color ?? 0;
  colorSum[m.region] += c; if (m.main) mainColor[m.region] += c;
  if (!c) E(`${ctx}: não devolve cor (toda missão colore um pouco)`);
  if (!m.main && (c < 0.1 || c > 0.2)) E(`${ctx}: cor de secundária ${c} fora de 0,1–0,2`);
  if (m.rewards.accessory && !accIds.has(m.rewards.accessory)) E(`${ctx}: acessório ${m.rewards.accessory}`);
  if (m.rewards.drink && !drinkIds.has(m.rewards.drink)) E(`${ctx}: bebida ${m.rewards.drink}`);
  const pincesoOk = JOIN && (m.id === JOIN.id || ancestors(m.id).has(JOIN.id));
  const carried = {};   // item -> quantos a Quim carrega para esta missão
  m.steps.forEach((s, i) => {
    const sc = `${ctx} passo ${i} (${s.type})`;
    if (!STEP_REQ[s.type]) return E(`${sc}: tipo desconhecido`);
    for (const f of STEP_REQ[s.type]) if (s[f] === undefined) E(`${sc}: falta ${f}`);
    if (!s.hint && !['set_flag', 'cutscene', 'pinceso_join'].includes(s.type)) Wn(`${sc}: sem hint`);
    if (s.marker) checkPoint(sc + ' marker', s.marker, { building: false, water: false });
    if (s.lines) checkLines(sc, s.lines, pincesoOk);
    if (s.npc && !npcById[s.npc]) E(`${sc}: npc ${s.npc} não existe`);
    if (s.npc && npcById[s.npc]?.showAfterFlag && !(flagSetters[npcById[s.npc].showAfterFlag] ?? []).some((id) => ancestors(m.id).has(id)))
      E(`${sc}: ${s.npc} ainda está escondido (showAfterFlag) nesse ponto da história`);
    if (s.item && !PROPS.has(s.item)) E(`${sc}: item ${s.item} não é prop do world`);
    if (s.prop && !PROPS.has(s.prop)) E(`${sc}: prop ${s.prop}`);
    if (s.camera) cameras.push([sc, s.camera]);
    // alvos no mundo (para conferir o gate do Pico)
    const alvos = [];
    switch (s.type) {
      case 'goto': {
        checkPoint(sc, s, { building: false });
        const l = s.y === undefined && solidAt(s.x, s.z, 0, { small: false });
        if (l && s.radius < foot(l) + 1) E(`${sc}: alvo dentro de ${l.id} com raio ${s.radius} (inalcançável)`);
        if (s.radius < 2) E(`${sc}: raio pequeno`);
        alvos.push(s); break;
      }
      case 'collect':
        if (s.count > s.spots.length) E(`${sc}: count > spots`);
        s.spots.forEach((p, k) => { if (!p.id) E(`${sc} spot ${k}: sem id`); checkPoint(`${sc} ${p.id}`, p, { item: true }); alvos.push(p); });
        carried[s.item] = (carried[s.item] ?? 0) + s.count; break;
      case 'deliver': {
        if (carried[s.item] === undefined) { E(`${sc}: entrega ${s.item} sem ter coletado antes`); break; }
        if (!carried[s.item]) { E(`${sc}: não sobrou ${s.item} para entregar (uma entrega anterior levou tudo)`); break; }
        const later = m.steps.slice(i + 1).some((t) => t.type === 'deliver' && t.item === s.item);
        if (later && !s.count) E(`${sc}: há outras entregas de ${s.item} depois; use deliver.count (senão esta entrega leva tudo)`);
        const n = s.count ?? carried[s.item];
        if (n > carried[s.item]) E(`${sc}: entrega ${n} ${s.item}, mas só tem ${carried[s.item]}`);
        carried[s.item] -= n;
        alvos.push(npcById[s.npc]); break;
      }
      case 'talk': alvos.push(npcById[s.npc]); break;
      case 'interact':
        if (typeof s.target === 'string') {
          const l = lmById[s.target];
          if (!l) { E(`${sc}: landmark ${s.target} não existe`); break; }
          if ((s.radius ?? 2.5) < foot(l) + 0.5) Wn(`${sc}: raio ${(s.radius ?? 2.5)} vs pegada ${foot(l).toFixed(1)} de ${l.id} (use pegada + 1,5)`);
          alvos.push(l);
        } else {
          checkPoint(sc + ' target', s.target, { building: false });
          const l = !(s.target.y !== undefined && platAt(s.target.x, s.target.z, s.target.y)) && solidAt(s.target.x, s.target.z, 0, { small: false });
          if (l && (s.radius ?? 2.5) < foot(l) + 0.8) E(`${sc}: alvo em cima de ${l.id} (pegada ${foot(l).toFixed(1)}) com raio ${s.radius ?? 2.5}: a Quim não alcança`);
          alvos.push(s.target);
        }
        break;
      case 'follow_trail': s.spots.forEach((p, k) => { checkPoint(`${sc} pista ${k}`, p); alvos.push(p); }); break;
      case 'minigame':
        if (!['coral', 'penas_vento', 'regar'].includes(s.kind)) E(`${sc}: kind ${s.kind}`);
        if (s.kind === 'regar' && !lmById[s.params.horta]) E(`${sc}: horta ${s.params.horta}`);
        if (s.kind === 'coral') { if (!s.params.rounds) E(`${sc}: rounds`); for (const n of s.params.notas ?? []) if (!lmById[n]) E(`${sc}: nota ${n}`); }
        if (s.kind === 'penas_vento') checkPoint(sc, s.params);
        break;
      case 'night':
        if (!bancos.some((b) => b.region === m.region)) E(`${sc}: nenhum banco de dormir (SPOTS.bancos_dormir) na região ${m.region}`);
        break;
      case 'cutscene':
        if (s.camera) for (const k of ['x', 'y', 'z', 'lookX', 'lookY', 'lookZ']) if (typeof s.camera[k] !== 'number') E(`${sc}: camera.${k}`);
        break;
    }
    // Nada antes da flag do gate pode exigir entrar na névoa.
    for (const g of GATES) if (!afterGate(m, g)) for (const a of alvos.filter(Boolean))
      if (hyp(a.x - g.x, a.z - g.z) < g.radius) E(`${sc}: alvo (${a.x},${a.z}) dentro da névoa ${g.id} antes de ${g.requiresFlag}`);
  });
  if (m.completeLines) checkLines(ctx + ' completeLines', m.completeLines, pincesoOk);
}
for (const [r, v] of Object.entries(colorSum)) if (v < 0.999) E(`cor da região ${r} soma ${v.toFixed(2)} (< 1)`);

// Linha principal: passa por todas as regiões e termina no Pico com a flag 'final'.
const mains = MISSIONS.filter((m) => m.main);
const finals = mains.filter((m) => !mains.some((o) => reqOf(o).includes(m.id)));
if (finals.length !== 1) E(`a linha principal deveria ter 1 final, tem ${finals.map((m) => m.id)}`);
const final = finals[0];
for (const m of mains) if (m !== final && !ancestors(final.id).has(m.id)) E(`principal ${m.id} não leva ao final`);
for (const r of REGIONS) if (!mains.some((m) => m.region === r.id)) E(`linha principal não passa por ${r.id}`);
for (const m of mains) if (!m.autoStart) Wn(`principal ${m.id} sem autoStart`);
if (final.rewards.flag !== 'final' || final.region !== 'pico') E('o final deve ser no Pico e ligar a flag "final"');
if (MISSIONS.some((m) => !m.main && m.requires?.missions?.includes(final.id))) Wn('missão que só abre depois do final');

// Visão do jogo (docs/historia.md): o que o usuário pediu tem que existir.
const NINHAL_VISAO = ['filhote_sem_ninho', 'ovinhos_perdidos', 'coral_da_floresta', 'penas_ao_vento', 'casa_nova', 'carteiro_piu', 'cafe_dos_passarinhos', 'alvorada'];
for (const id of NINHAL_VISAO) if (misById[id]?.region !== 'ninhal') E(`visão: missão ${id} no Ninhal ausente`);
for (const id of ['dona_pluminia', 'piu', 'tico', 'teco', 'tuco', 'seu_girassolino', 'vovo_lazinha', 'dona_nata', 'madame_fivela', 'vovo_pincelao', 'mamae_pincela'])
  if (!npcById[id]) E(`visão: personagem ${id} ausente`);
const temPasso = (pred) => MISSIONS.some((m) => m.steps.some(pred));
const textos = (arr) => (arr ?? []).filter((l) => l.text).map((l) => l.text).join(' ');
const ALVORADA = misById.alvorada;
if (!ALVORADA?.steps.some((s) => s.type === 'night')) E('visão: Alvorada sem passo de noite');
if (ALVORADA && mainColor[ALVORADA.region] < 0.999) E(`visão: a Alvorada deveria deixar o ${ALVORADA.region} todo colorido (linha principal soma ${mainColor[ALVORADA.region].toFixed(2)})`);
for (const k of ['coral', 'penas_vento', 'regar']) if (!temPasso((s) => s.type === 'minigame' && s.kind === k)) E(`visão: falta minigame ${k}`);
if (!temPasso((s) => s.type === 'collect' && s.fragile && s.item === 'ovo' && s.count === 5)) E('visão: 5 ovinhos frágeis');
if (misById.penas_ao_vento?.rewards.accessory !== 'tiara_penas') E('visão: Penas ao Vento dá a tiara de penas');
if (misById.cafe_dos_passarinhos?.rewards.drink !== 'latte_mel_semente') E('visão: Café dos Passarinhos dá o latte de mel e semente');
{
  const st = JOIN?.steps ?? [], ft = st.findIndex((s) => s.type === 'follow_trail' && s.item === 'pena_verde'), jn = st.findIndex((s) => s.type === 'pinceso_join');
  if (JOIN?.region !== 'ninhal' || ft < 0 || jn < ft || !st.some((s) => s.prop === 'cipo_prisao')) E('visão: Pinceso preso em cipós → penas verdes → jujubas → pousa nos cachos');
  if (!/periquito que escolhe uma cabeça não sai mais dela/i.test(st.map((s) => textos(s.lines)).join(' '))) E('visão: falta a fala da Dona Plumínia sobre a cabeça do periquito');
  const piu = misById.carteiro_piu, regs = new Set();
  for (const s of piu?.steps ?? []) if (s.type === 'interact' && typeof s.target === 'object') regs.add(regionsAt(s.target.x, s.target.z)[0]);
  regs.delete('ninhal'); if (regs.size < 3) E('visão: o Carteiro Piu entrega cartas em pelo menos 3 outras regiões');
  const cafe = MISSIONS.flatMap((m) => m.steps).find((s) => s.type === 'cafe');
  if (!cafe || !/dedal/i.test(textos(cafe.lines))) E('visão: na cafeteria o Pinceso toma um minicafé no dedalzinho');
  if (!/fico com a Quim/i.test(textos(ENDING))) E('visão: no final o Pinceso escolhe ficar com a Quim');
}
if (DRINKS.map((d) => d.id).sort().join() !== ['latte_morango', 'chocolate_nuvem', 'latte_mel_semente', 'cha_lavanda', 'soda_jujuba'].sort().join()) E('ids de DRINKS fora do contrato');
if (ACCESSORIES.map((a) => a.id).sort().join() !== ['laco', 'chapeu', 'oculos', 'tiara_penas', 'coroa_flores', 'cachecol'].sort().join()) E('ids de ACCESSORIES fora do contrato');
for (const a of ACCESSORIES) {
  if (!a.shop && !MISSIONS.some((m) => m.rewards.accessory === a.id)) E(`acessório ${a.id} não é vendido nem dado`);
  if (a.shop && MISSIONS.some((m) => m.rewards.accessory === a.id)) Wn(`acessório ${a.id} vendido E dado`);
}
if (!ACCESSORIES.some((a) => a.shop)) E('visão: jujubas compram acessórios — a loja precisa vender algo');
if (TIPS.length < 15) E(`TIPS: ${TIPS.length} (mín. 15)`);
const nLines = (arr) => arr.filter((l) => !l.camera).length;
for (const [nome, arr] of [['PROLOGUE', PROLOGUE], ['ENDING', ENDING]]) {
  const n = nLines(arr); if (n < 8 || n > 16) E(`${nome}: ${n} falas (8–16)`);
  checkLines(nome, arr, nome === 'ENDING');
  for (const b of arr.filter((l) => l.camera)) { for (const k of ['x', 'y', 'z', 'lookX', 'lookY', 'lookZ']) if (typeof b.camera[k] !== 'number') E(`${nome}: camera.${k}`); cameras.push([nome, b.camera]); }
}
if (!PROLOGUE[0]?.camera) E('PROLOGUE deveria começar com câmera');

// Câmeras de cena: acima do chão, fora de troncos e construções.
for (const [ctx, c] of cameras) {
  if (!inWorld(c.x, c.z)) E(`${ctx}: câmera fora do mundo`);
  if (c.y < ground(c.x, c.z) + 1.5) E(`${ctx}: câmera enterrada/rente ao chão (y ${c.y}, chão ${ground(c.x, c.z).toFixed(1)})`);
  for (const t of trunks) if (hyp(c.x - t.x, c.z - t.z) < t.r + 0.5 && c.y < t.top) E(`${ctx}: câmera dentro do tronco ${t.id}`);
  const l = solidAt(c.x, c.z, 0.3, { small: false }); if (l && c.y < ground(c.x, c.z) + 5) E(`${ctx}: câmera dentro de ${l.id}`);
  for (const n of NPCS) if (hyp(c.x - n.x, c.z - n.z) < 1.5 && Math.abs(c.y - ground(n.x, n.z) - 1) < 2) E(`${ctx}: câmera em cima do ${n.id}`);
}

// Economia de jujubas.
const rewardJ = MISSIONS.reduce((a, m) => a + (m.rewards.jujubas ?? 0), 0);
const shopCost = ACCESSORIES.filter((a) => a.shop).reduce((a, b) => a + b.price, 0);
const drinkCost = DRINKS.reduce((a, b) => a + b.price, 0);
const totalJ = rewardJ + JUJUBA_SPOTS.length;
if (totalJ < shopCost + drinkCost) E(`economia: ${totalJ} jujubas no jogo < loja (${shopCost}) + uma de cada bebida (${drinkCost})`);
{
  // Quem abre a loja cedo: missões principais até o Ninhal + a da loja + metade das jujubas visíveis do Campo, Vila e Cidade.
  const loja = MISSIONS.find((m) => m.rewards.flag === 'loja_aberta');
  const cedo = [...ancestors(loja.id), loja.id].reduce((a, id) => a + (misById[id].rewards.jujubas ?? 0), 0);
  const visiveis = JUJUBA_SPOTS.filter((j) => !j.hidden && ['campo', 'vila', 'cidade'].includes(j.region)).length;
  const barato = Math.min(...ACCESSORIES.filter((a) => a.shop).map((a) => a.price));
  if (cedo + visiveis / 2 < barato) E(`economia: ao abrir a loja a Quim tem ~${cedo + visiveis / 2} jujubas e o mais barato custa ${barato}`);
  if (Math.max(...DRINKS.map((d) => d.price)) > cedo + visiveis / 2) Wn('economia: bebida mais cara que o que se junta até a Cidade');
}
for (const m of MISSIONS) for (const s of m.steps) if (s.type === 'cafe' && !s.free) E(`missão ${m.id}: passo cafe obrigatório cobra jujubas (soft-lock se a Quim estiver sem)`);

// Casinha Asas de Saudade: clareira reservada, vazia e com a trilhinha secreta chegando nela.
{
  const c = SPOTS.asas_de_saudade;
  if (!c) E('SPOTS.asas_de_saudade ausente (docs/casinha-asas-de-saudade.md)');
  else {
    if (!regionsAt(c.x, c.z).includes('ninhal')) E('a clareira da Casinha deve ficar no Ninhal');
    const dentro = (x, z, r = 0) => hyp(x - c.x, z - c.z) < c.radius + r;
    for (const l of LANDMARKS) if (dentro(l.x, l.z, foot(l))) E(`clareira da Casinha ocupada por ${l.id}`);
    for (const p of PLATFORMS) if (dentro(p.x, p.z, p.radius ?? 2)) E(`clareira da Casinha ocupada por ${p.id}`);
    for (const j of JUJUBA_SPOTS) if (dentro(j.x, j.z)) E(`clareira da Casinha ocupada por ${j.id}`);
    for (const n of NPCS) if (dentro(n.x, n.z, n.wander)) E(`clareira da Casinha ocupada por ${n.id}`);
    for (const m of MISSIONS) for (const s of m.steps) for (const p of s.spots ?? []) if (dentro(p.x, p.z)) E(`clareira da Casinha ocupada por ${p.id}`);
    if (waterDist(c.x, c.z) < c.radius) E('clareira da Casinha na água');
    for (const p of PATHS.filter((p) => !p.secret)) if (distPoly(c.x, c.z, p.points) < c.radius + 25) E(`clareira da Casinha perto demais da trilha ${p.id} (deve ser escondida)`);
    if (!PATHS.some((p) => p.secret && Math.abs(hyp(p.points.at(-1)[0] - c.x, p.points.at(-1)[1] - c.z) - c.radius) < 2.5)) E('nenhuma trilha secreta chega na borda da clareira da Casinha');
  }
}

// =============================================================================================
// --terreno: confere contra o terreno real do world (pega bugs do terrain.js que os dados não mostram).
if (process.argv.includes('--terreno')) {
  const { register } = await import('node:module');
  const three = url('vendor/three/three.module.js'), addons = url('vendor/three/addons/');
  register('data:text/javascript,' + encodeURIComponent(`export async function resolve(s, c, n) {
    if (s === 'three') return { url: ${JSON.stringify(three)}, shortCircuit: true };
    if (s.startsWith('three/addons/')) return { url: ${JSON.stringify(addons)} + s.slice(13), shortCircuit: true };
    return n(s, c); }`));
  globalThis.requestAnimationFrame ??= (f) => setImmediate(f);
  const t = (await import(url('src/world/terrain.js'))).createTerrain();
  await t.build(() => {});
  const H = (x, z) => t.getHeight(x, z), T = (m) => E('[terreno] ' + m);
  for (const p of PATHS) {
    const s = samples(p.points, 1); let mx = 0, at = '';
    for (let i = 0; i < s.length - 1; i++) {
      const L = hyp(s[i + 1][0] - s[i][0], s[i + 1][1] - s[i][1]); if (L < 0.05) continue;
      const g = Math.abs(H(...s[i + 1]) - H(...s[i])) / L; if (g > mx) { mx = g; at = s[i].map((v) => v.toFixed(0)).join(','); }
    }
    if (mx > 0.45) T(`trilha ${p.id}: degrau/rampa de ${(mx * 100).toFixed(0)}% em ${at}`);
  }
  for (const [rid, list] of Object.entries(routes)) { const g = H(list[0].x, list[0].z); if (list[0].y - g > 1.3) T(`rota ${rid}: 1º degrau ${(list[0].y - g).toFixed(2)} acima do chão`); }
  for (const p of PLATFORMS) if (p.y - H(p.x, p.z) < 0.25) T(`plataforma ${p.id} enterrada`);
  const pts = [...NPCS.map((n) => [n.id, n]), ...MISSIONS.flatMap((m) => m.steps.flatMap((s) => (s.spots ?? []).map((p) => [m.id + ':' + p.id, p])))];
  for (const [n, p] of pts) { if (p.y === undefined && t.isWater(p.x, p.z)) T(`${n} na água`); if (p.y !== undefined && p.y < H(p.x, p.z)) T(`${n} abaixo do chão`); }
  for (const [ctx, c] of cameras) if (c.y < H(c.x, c.z) + 1) T(`${ctx}: câmera rente ao chão`);
  for (const b of LANDMARKS.filter((l) => l.type === 'ponte')) {
    const hb = H(b.x, b.z), ends = [-1, 1].map((sg) => H(b.x + Math.sin(b.rotY) * sg * 9, b.z + Math.cos(b.rotY) * sg * 9));
    if (ends.some((h) => Math.abs(h - hb) > 1)) T(`ponte ${b.id} em y ${hb.toFixed(1)} mas as cabeceiras estão em ${ends.map((h) => h.toFixed(1))}`);
  }
}

// =============================================================================================
console.log('Landmarks:', LANDMARKS.length, perRegion);
console.log('Jujubas:', JUJUBA_SPOTS.length, jjRegion, '| plataformas:', PLATFORMS.length, 'rotas:', Object.keys(routes).length, '| trilhas:', PATHS.length);
console.log('Missões:', MISSIONS.length, '(principais:', mains.map((m) => m.id).join(' → ') + ') | NPCs:', NPCS.length);
console.log('Cor por região (tudo):', Object.fromEntries(Object.entries(colorSum).map(([k, v]) => [k, +v.toFixed(2)])),
  '| só principais:', Object.fromEntries(Object.entries(mainColor).map(([k, v]) => [k, +v.toFixed(2)])));
console.log(`Jujubas: ${JUJUBA_SPOTS.length} no mapa + ${rewardJ} de missões = ${totalJ}; loja ${shopCost}; uma de cada bebida ${drinkCost}`);
if (VERBOSE) console.log(report.join('\n'));
if (warns.length) console.log(`\n${warns.length} avisos:\n  ` + [...new Set(warns)].join('\n  '));
console.log(errors.length ? `\n${errors.length} ERROS:\n  ` + errors.join('\n  ') : '\nOK — nenhum erro.');
process.exit(errors.length ? 1 : 0);
