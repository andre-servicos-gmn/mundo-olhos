// Pintor do mapa: desenha o reino inteiro (vista de cima) num canvas grande, que o minimapa e o mapa
// completo recortam/escalam. Lê tudo de src/data/worldmap.js. As cores das regiões seguem o quanto cada
// uma já foi colorida (desbotadas = cinza-lilás), e o desenho só é refeito quando isso muda.
import { WORLD, REGIONS, PATHS, LANDMARKS, WATER, GATES } from '../data/worldmap.js';
import { mulberry32 } from '../core/util.js';
import { fadeHex, shade, rgba, mixHex } from './dom.js';

export const MAP_SCALE = 2;                       // px por metro no canvas base
const HALF = WORLD.half;
export const MAP_SIZE = HALF * 2 * MAP_SCALE;
export const toMap = (v) => (v + HALF) * MAP_SCALE;
const REG = Object.fromEntries(REGIONS.map((r) => [r.id, r]));

// Ícones de lugares importantes (minimapa e mapa). Só emojis que existem no Windows 10 (até Emoji 12).
export const LANDMARK_ICONS = {
  casa_quim: '🏡', cafeteria: '☕', loja_acessorios: '🎀', torre_relogio: '🕰️', fonte: '⛲', florzona: '🌼',
  moinho_petalas: '🌾', coreto_vila: '🎵', arvore_mae: '🌳', ninho_coreto: '🐣', pirulito_gigante: '🍭',
  mirante_pico: '🔭', olho_do_pico: '👁️', portal_nevoa: '🌫️', casa_piu: '✉️', arvore_cafe: '🍵',
  padaria_vila: '🥐', correio_vila: '📮', casa_doceira: '🧁', clareira_cantante: '🍄', arvore_bando: '🦜',
  pedra_olhuda: '👀', prefeitura: '🏛️',
};
// No minimapa só os mais importantes (para não poluir).
export const MINIMAP_ICON_IDS = ['casa_quim', 'cafeteria', 'loja_acessorios', 'torre_relogio', 'florzona', 'moinho_petalas',
  'coreto_vila', 'arvore_mae', 'pirulito_gigante', 'mirante_pico', 'casa_piu', 'portal_nevoa'];

/** 0..1: quanto a região está colorida agora (animado pelo world quando existir). */
export function regionT(game, id) {
  const w = game.world?.regionColor?.(id);
  return typeof w === 'number' ? w : (game.state?.regionColor?.[id] ?? 0);
}

/** Região mais próxima (pela distância normalizada ao centro) — usada para colorir o que fica entre regiões. */
export function nearestRegion(x, z) {
  let best = REGIONS[0], bd = Infinity;
  for (const r of REGIONS) {
    const d = Math.hypot(x - r.center.x, z - r.center.z) / r.radius;
    if (d < bd) { bd = d; best = r; }
  }
  return best;
}

export function createMapPainter(game) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = MAP_SIZE;
  const g = canvas.getContext('2d');
  let sig = '';
  let version = 0;

  function signature() {
    const s = game.state || {};
    const parts = REGIONS.map((r) => Math.round(regionT(game, r.id) * 10));
    const secrets = PATHS.filter((p) => p.secret && s.discoveredPaths?.[p.id]).map((p) => p.id).join(',');
    return parts.join('') + '|' + secrets + '|' + (s.flags?.pico_liberado ? 1 : 0) + '|' + (s.flags?.ninho_casal_pronto ? 1 : 0);
  }

  function draw() {
    const s = game.state || {};
    const T = Object.fromEntries(REGIONS.map((r) => [r.id, regionT(game, r.id)]));
    const col = (hex, regionId) => fadeHex(hex, T[regionId] ?? 0);
    const colAt = (hex, x, z) => col(hex, nearestRegion(x, z).id);
    const X = toMap, S = MAP_SCALE;
    const rand = mulberry32(7);
    g.clearRect(0, 0, MAP_SIZE, MAP_SIZE);

    // --- o disco jogável (fora dele fica transparente: o papel do mapa / o fundo do minimapa aparecem)
    const avgT = REGIONS.reduce((a, r) => a + T[r.id], 0) / REGIONS.length;
    g.fillStyle = fadeHex('#b5e2a2', avgT);
    g.beginPath(); g.arc(X(0), X(0), WORLD.playRadius * S + 14 * S, 0, Math.PI * 2); g.fill();

    // --- manchas das regiões (gradiente suave, as bordas se misturam como no terreno)
    for (const r of [...REGIONS].sort((a, b) => b.radius - a.radius)) {
      const cx = X(r.center.x), cz = X(r.center.z), R = r.radius * 1.3 * S;
      const c1 = col(r.palette.ground, r.id);
      const gr = g.createRadialGradient(cx, cz, 0, cx, cz, R);
      gr.addColorStop(0, c1); gr.addColorStop(0.62, c1); gr.addColorStop(1, rgba(c1, 0));
      g.fillStyle = gr;
      g.beginPath(); g.arc(cx, cz, R, 0, Math.PI * 2); g.fill();
      // pintinhas de grama clara (textura)
      const c2 = col(r.palette.ground2, r.id);
      g.fillStyle = rgba(c2, 0.45);
      for (let i = 0; i < 160; i++) {
        const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * r.radius * 0.95;
        g.beginPath(); g.arc(cx + Math.cos(a) * d * S, cz + Math.sin(a) * d * S, (1.5 + rand() * 4.5) * S, 0, Math.PI * 2); g.fill();
      }
      // florzinhas de acento
      for (let i = 0; i < 70; i++) {
        const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * r.radius * 0.9;
        g.fillStyle = col(r.palette.accents[i % r.palette.accents.length], r.id);
        g.beginPath(); g.arc(cx + Math.cos(a) * d * S, cz + Math.sin(a) * d * S, 0.7 * S, 0, Math.PI * 2); g.fill();
      }
    }

    // --- montanhas na borda do mundo (anel lilás com morrinhos)
    {
      const R0 = (WORLD.playRadius - 4) * S, R1 = (HALF + 10) * S;
      const gr = g.createRadialGradient(X(0), X(0), R0, X(0), X(0), R1);
      gr.addColorStop(0, 'rgba(185,170,214,0)'); gr.addColorStop(0.3, '#cdc2e6'); gr.addColorStop(0.75, 'rgba(225,218,242,.8)'); gr.addColorStop(1, 'rgba(236,230,246,0)');
      g.fillStyle = gr;
      g.beginPath(); g.arc(X(0), X(0), R1, 0, Math.PI * 2); g.arc(X(0), X(0), R0, 0, Math.PI * 2, true); g.fill();
      for (let i = 0; i < 90; i++) {
        const a = (i / 90) * Math.PI * 2 + rand() * 0.04, d = WORLD.playRadius + 6 + rand() * 10;
        const x = X(Math.cos(a) * d), z = X(Math.sin(a) * d), rr = (7 + rand() * 7) * S;
        g.fillStyle = i % 2 ? '#bcaedb' : '#c8bce4';
        g.beginPath(); g.arc(x, z, rr, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(255,255,255,.55)';
        g.beginPath(); g.arc(x - rr * 0.25, z - rr * 0.3, rr * 0.4, 0, Math.PI * 2); g.fill();
      }
    }

    // --- Pico Pestana: curvas de nível (o cone sobe até o platô em y=30)
    {
      const p = REG.pico;
      if (p) {
        const cx = X(p.center.x), cz = X(p.center.z);
        const rings = [[74, 0.0], [62, 0.2], [50, 0.4], [38, 0.6], [28, 0.85]];
        for (const [r, k] of rings) {
          g.fillStyle = mixHex(col(p.palette.ground, 'pico'), '#ffffff', k * 0.75);
          g.beginPath(); g.arc(cx, cz, r * S, 0, Math.PI * 2); g.fill();
          g.strokeStyle = rgba(shade(col(p.palette.ground, 'pico'), -0.3), 0.35);
          g.lineWidth = 1.2; g.setLineDash([5, 4]); g.stroke(); g.setLineDash([]);
        }
      }
    }

    // --- água
    const waterCol = (w) => (w.data?.calda ? col(w.data.cor || '#ff8fbf', w.region) : col('#7cc8f4', w.region));
    for (const w of WATER) {
      const c = waterCol(w);
      if (w.type === 'rio' && w.points) {
        g.lineCap = 'round'; g.lineJoin = 'round';
        const path = () => { g.beginPath(); w.points.forEach(([x, z], i) => (i ? g.lineTo(X(x), X(z)) : g.moveTo(X(x), X(z)))); };
        path(); g.strokeStyle = shade(c, -0.2); g.lineWidth = (w.width || 5) * S + 5; g.stroke();
        path(); g.strokeStyle = c; g.lineWidth = (w.width || 5) * S; g.stroke();
        path(); g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 1.4; g.setLineDash([6, 10]); g.stroke(); g.setLineDash([]);
      } else {
        const r = (w.radius || 5) * S;
        g.fillStyle = shade(c, -0.18); g.beginPath(); g.arc(X(w.x), X(w.z), r + 3, 0, Math.PI * 2); g.fill();
        g.fillStyle = c; g.beginPath(); g.arc(X(w.x), X(w.z), r, 0, Math.PI * 2); g.fill();
        g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1.6;
        g.beginPath(); g.arc(X(w.x) - r * 0.2, X(w.z) - r * 0.2, r * 0.55, Math.PI * 1.1, Math.PI * 1.6); g.stroke();
      }
    }

    // --- trilhas (secretas só depois de descobertas, tracejadas)
    for (const p of PATHS) {
      if (p.secret && !s.discoveredPaths?.[p.id]) continue;
      const mid = p.points[Math.floor(p.points.length / 2)];
      const regionId = REG[p.from] && p.from === p.to ? p.from : nearestRegion(mid[0], mid[1]).id;
      const c = col(REG[regionId]?.palette.path || '#f3d9a4', regionId);
      const path = () => { g.beginPath(); p.points.forEach(([x, z], i) => (i ? g.lineTo(X(x), X(z)) : g.moveTo(X(x), X(z)))); };
      g.lineCap = 'round'; g.lineJoin = 'round';
      if (p.secret) {
        path(); g.strokeStyle = rgba(shade(c, -0.35), 0.8); g.lineWidth = p.width * S * 0.7; g.setLineDash([3 * S, 3 * S]); g.stroke(); g.setLineDash([]);
        continue;
      }
      path(); g.strokeStyle = shade(c, -0.22); g.lineWidth = p.width * S + 3; g.stroke();
      path(); g.strokeStyle = c; g.lineWidth = p.width * S; g.stroke();
    }

    // --- construções e marcos (formas simples vistas de cima)
    for (const l of LANDMARKS) {
      const x = X(l.x), z = X(l.z), sc = l.scale ?? 1, d = l.data || {};
      const C = (hex) => col(hex, l.region);
      g.save(); g.translate(x, z); g.rotate(-(l.rotY ?? 0));
      switch (l.type) {
        case 'praca':
          g.fillStyle = C('#f6e7d4'); g.beginPath(); g.arc(0, 0, (l.id === 'praca_cilios' ? 16 : 11) * S, 0, Math.PI * 2); g.fill();
          g.strokeStyle = C('#e2c9ae'); g.lineWidth = 2; g.stroke();
          break;
        case 'casa': case 'casa_quim': case 'cafeteria': case 'loja_acessorios': {
          const w = (l.type === 'cafeteria' ? 11 : l.type === 'loja_acessorios' ? 10 : l.type === 'casa_quim' ? 9 : 7) * sc * S;
          const roof = d.telhado || d.toldo || (l.type === 'casa_quim' ? '#ff8fa3' : l.type === 'cafeteria' ? '#ffd6e8' : '#ff9aa2');
          g.fillStyle = 'rgba(60,40,90,.18)'; roundRect(g, -w / 2 + 2, -w / 2 + 3, w, w, 3); g.fill();
          g.fillStyle = C(roof); roundRect(g, -w / 2, -w / 2, w, w, 3); g.fill();
          g.strokeStyle = C(shade(roof, -0.3)); g.lineWidth = 1.5; g.stroke();
          g.beginPath(); g.moveTo(-w / 2, 0); g.lineTo(w / 2, 0); g.stroke();
          break;
        }
        case 'arvore_gigante': {
          const r = (d.trunkRadius || 3) * 3.2 * S;
          g.fillStyle = 'rgba(40,60,40,.18)'; g.beginPath(); g.arc(3, 4, r, 0, Math.PI * 2); g.fill();
          g.fillStyle = C('#5fb36a'); g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
          g.fillStyle = C('#7fd08a'); g.beginPath(); g.arc(-r * 0.25, -r * 0.25, r * 0.6, 0, Math.PI * 2); g.fill();
          g.fillStyle = C('#a7e6a0'); g.beginPath(); g.arc(-r * 0.35, -r * 0.35, r * 0.25, 0, Math.PI * 2); g.fill();
          break;
        }
        case 'arvore_algodao': {
          const r = 5.5 * S, c = d.cor || '#ffb3d9';
          g.fillStyle = C(c);
          for (const [ox, oz] of [[0, 0], [-0.5, -0.3], [0.5, -0.2], [0, 0.5]]) { g.beginPath(); g.arc(ox * r, oz * r, r * 0.7, 0, Math.PI * 2); g.fill(); }
          g.fillStyle = 'rgba(255,255,255,.6)'; g.beginPath(); g.arc(-r * 0.3, -r * 0.35, r * 0.25, 0, Math.PI * 2); g.fill();
          break;
        }
        case 'flor_gigante': {
          const r = 2.2 * sc * S, c = l.id === 'florzona' ? '#ff8fc7' : '#ffd166';
          g.fillStyle = C(c);
          for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; g.beginPath(); g.arc(Math.cos(a) * r, Math.sin(a) * r, r * 0.7, 0, Math.PI * 2); g.fill(); }
          g.fillStyle = C('#fff3a3'); g.beginPath(); g.arc(0, 0, r * 0.7, 0, Math.PI * 2); g.fill();
          break;
        }
        case 'pirulito_gigante': {
          const r = (d.altura ? 6 : 3) * S;
          g.fillStyle = C('#ffffff'); g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
          g.strokeStyle = C('#ff6fa8'); g.lineWidth = r * 0.28; g.beginPath();
          for (let a = 0; a < Math.PI * 5; a += 0.2) { const rr = (a / (Math.PI * 5)) * r * 0.9; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
          g.stroke();
          break;
        }
        case 'horta': case 'jardim': {
          const w = 7 * sc * S;
          g.fillStyle = C('#b98a5e'); roundRect(g, -w / 2, -w / 2, w, w, 2); g.fill();
          g.strokeStyle = C('#7cc16b'); g.lineWidth = 2;
          for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(-w / 2 + 2, (i * w) / 6); g.lineTo(w / 2 - 2, (i * w) / 6); g.stroke(); }
          break;
        }
        case 'torre_relogio': case 'mirante': case 'coreto': case 'ninho_coreto': case 'fonte': case 'moinho': {
          const r = ({ torre_relogio: 6, mirante: 4, coreto: 5, ninho_coreto: 7, fonte: 4.5, moinho: 4 })[l.type] * S;
          const c = ({ torre_relogio: '#d3b8ff', mirante: '#ffe08a', coreto: '#ffffff', ninho_coreto: '#d9b98c', fonte: '#a0d8ef', moinho: '#ffd1a8' })[l.type];
          g.fillStyle = 'rgba(60,40,90,.18)'; g.beginPath(); g.arc(2, 3, r, 0, Math.PI * 2); g.fill();
          g.fillStyle = C(c); g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
          g.strokeStyle = C(shade(c, -0.3)); g.lineWidth = 1.5; g.stroke();
          break;
        }
        case 'ponte': {
          const len = (d.comprimento || 10) * S, w = (d.largura || 4) * S;
          g.fillStyle = C('#c69563'); g.fillRect(-w / 2, -len / 2, w, len);
          g.strokeStyle = C('#8a5a3c'); g.lineWidth = 1.2;
          for (let i = -len / 2 + 3; i < len / 2; i += 4) { g.beginPath(); g.moveTo(-w / 2, i); g.lineTo(w / 2, i); g.stroke(); }
          break;
        }
        case 'rocha':
          g.fillStyle = C(d.coluna ? '#b8b2c8' : '#cfc8dc'); g.beginPath(); g.arc(0, 0, (d.raio || 2.5) * S, 0, Math.PI * 2); g.fill();
          break;
        case 'cogumelo':
          g.fillStyle = C(d.cor || (d.marshmallow ? '#fff4fb' : '#ff7a8a')); g.beginPath(); g.arc(0, 0, 2 * S, 0, Math.PI * 2); g.fill();
          g.fillStyle = 'rgba(255,255,255,.8)'; g.beginPath(); g.arc(-1, -1, 0.6 * S, 0, Math.PI * 2); g.fill();
          break;
        default: break;
      }
      g.restore();
    }

    // --- névoa sonolenta sobre o Pico enquanto o caminho não abre
    if (!s.flags?.pico_liberado) {
      for (const gt of GATES) {
        const cx = X(gt.x), cz = X(gt.z), R = gt.radius * S;
        const gr = g.createRadialGradient(cx, cz, R * 0.2, cx, cz, R * 1.1);
        gr.addColorStop(0, 'rgba(236,230,248,.85)'); gr.addColorStop(0.8, 'rgba(236,230,248,.7)'); gr.addColorStop(1, 'rgba(236,230,248,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(cx, cz, R * 1.1, 0, Math.PI * 2); g.fill();
        g.strokeStyle = 'rgba(160,140,200,.55)'; g.lineWidth = 2; g.setLineDash([8, 8]);
        g.beginPath(); g.arc(cx, cz, R, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
        // espiraizinhas de vento
        g.strokeStyle = 'rgba(150,130,190,.45)'; g.lineWidth = 2.4;
        for (let i = 0; i < 7; i++) {
          const a = i * 0.9 + 0.3, d = R * (0.3 + (i % 3) * 0.22);
          const sx = cx + Math.cos(a) * d, sz = cz + Math.sin(a) * d;
          g.beginPath(); g.arc(sx, sz, 9, Math.PI * 0.2, Math.PI * 1.6); g.stroke();
        }
      }
    }
    version++;
  }

  return {
    canvas,
    get version() { return version; },
    /** Redesenha se a cor das regiões / trilhas descobertas mudaram. Barato quando nada mudou. */
    refresh(force = false) {
      const ns = signature();
      if (force || ns !== sig) { sig = ns; draw(); return true; }
      return false;
    },
  };
}

export function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
}

/** Badge redondinho com emoji (ícone de landmark) desenhado no canvas. */
export function drawBadge(g, x, y, emoji, size, ring = '#ffffff', fill = 'rgba(255,255,255,.92)') {
  g.save();
  g.shadowColor = 'rgba(60,40,90,.35)'; g.shadowBlur = size * 0.35; g.shadowOffsetY = size * 0.08;
  g.fillStyle = fill; g.beginPath(); g.arc(x, y, size * 0.62, 0, Math.PI * 2); g.fill();
  g.shadowColor = 'transparent';
  g.strokeStyle = ring; g.lineWidth = Math.max(1.5, size * 0.1); g.stroke();
  g.font = `${Math.round(size * 0.72)}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(emoji, x, y + size * 0.04);
  g.restore();
}

/** Marcador "!" de morador com missão. */
export function drawBang(g, x, y, size, t = 0) {
  const s = size * (1 + 0.08 * Math.sin(t * 6));
  g.save();
  g.shadowColor = 'rgba(60,40,90,.4)'; g.shadowBlur = s * 0.4;
  g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(x, y, s * 0.6, 0, Math.PI * 2); g.fill();
  g.shadowColor = 'transparent';
  g.strokeStyle = '#ffffff'; g.lineWidth = Math.max(1.5, s * 0.12); g.stroke();
  g.fillStyle = '#6b3a12'; g.font = `900 ${Math.round(s * 0.85)}px Fredoka, "Baloo 2", system-ui, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('!', x, y + s * 0.04);
  g.restore();
}

/** Estrela do objetivo da missão. */
export function drawStar(g, x, y, r, t = 0, fill = '#ff6fa8') {
  const rr = r * (1 + 0.1 * Math.sin(t * 5));
  g.save();
  g.translate(x, y);
  g.shadowColor = rgba(fill, 0.8); g.shadowBlur = rr * 0.9;
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, d = i % 2 ? rr * 0.48 : rr;
    g.lineTo(Math.cos(a) * d, Math.sin(a) * d);
  }
  g.closePath();
  g.fillStyle = fill; g.fill();
  g.shadowColor = 'transparent';
  g.strokeStyle = '#fff'; g.lineWidth = Math.max(1.5, rr * 0.16); g.lineJoin = 'round'; g.stroke();
  g.restore();
}

/** Setinha da Quim (aponta para angle, em radianos de tela; 0 = para cima). */
export function drawPlayerArrow(g, x, y, size, angle) {
  g.save();
  g.translate(x, y); g.rotate(angle);
  g.shadowColor = 'rgba(60,40,90,.45)'; g.shadowBlur = size * 0.4; g.shadowOffsetY = 1;
  g.beginPath();
  g.moveTo(0, -size); g.quadraticCurveTo(size * 0.2, -size * 0.2, size * 0.78, size * 0.7);
  g.quadraticCurveTo(0, size * 0.35, -size * 0.78, size * 0.7); g.quadraticCurveTo(-size * 0.2, -size * 0.2, 0, -size);
  g.fillStyle = '#ff5f8f'; g.fill();
  g.shadowColor = 'transparent';
  g.strokeStyle = '#ffffff'; g.lineWidth = Math.max(2, size * 0.22); g.lineJoin = 'round'; g.stroke();
  g.restore();
}
