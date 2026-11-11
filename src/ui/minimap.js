// Minimapa circular: gira junto com a câmera (o "para cima" do minimapa é para onde a câmera olha),
// com um "N" passeando pela borda para não perder o norte. Desenha o recorte do mapa base em volta
// da Quim, ícones dos lugares importantes, "!" dos moradores com pedido, a estrela do objetivo
// (ou uma seta na borda quando está longe) e a setinha da Quim no centro.
import { LANDMARKS, REGIONS } from '../data/worldmap.js';
import { el } from './dom.js';
import { MAP_SCALE, toMap, LANDMARK_ICONS, MINIMAP_ICON_IDS, drawBadge, drawBang, drawStar, drawPlayerArrow, nearestRegion } from './mapdraw.js';

const VIEW_R = 72;     // metros mostrados do centro até a borda
const ICON_LMS = MINIMAP_ICON_IDS.map((id) => LANDMARKS.find((l) => l.id === id)).filter(Boolean);
const REG = Object.fromEntries(REGIONS.map((r) => [r.id, r]));

export function createMinimap(ctx, painter) {
  const { game } = ctx;
  const wrap = el('div', 'mo-minimap');
  const lashes = el('div', 'mo-mm-lashes', { html: '<i></i><i></i><i></i><i></i><i></i>' });
  const canvas = el('canvas', 'mo-mm-canvas');
  const label = el('div', 'mo-mm-label', { text: '' });
  wrap.append(lashes, canvas, label);
  const g = canvas.getContext('2d');
  let px = 0, curRegion = null, acc = 1;

  function resize() {
    const css = wrap.getBoundingClientRect().width || 190;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const want = Math.round(css * dpr);
    if (canvas.width !== want) { canvas.width = canvas.height = want; }
    px = want;
  }

  function playerPos() {
    const p = game.player?.position;
    if (p) return { x: p.x, z: p.z, rotY: game.player.rotY ?? 0 };
    const s = game.state?.player || { x: 0, z: 0, rotY: 0 };
    return { x: s.x, z: s.z, rotY: s.rotY ?? 0 };
  }

  function draw(t) {
    resize();
    const size = px, c = size / 2, pr = c - size * 0.035;
    const P = playerPos();
    // rotação: a direção da câmera vira "para cima"
    let rot = 0;
    const cam = game.render?.camera;
    if (cam?.matrixWorld) {
      const e = cam.matrixWorld.elements;
      const fx = -e[8], fz = -e[10];
      if (Math.hypot(fx, fz) > 1e-4) rot = -Math.PI / 2 - Math.atan2(fz, fx);
    }
    const cs = Math.cos(rot), sn = Math.sin(rot), k = pr / VIEW_R;
    const W2S = (x, z) => {
      const dx = x - P.x, dz = z - P.z;
      return [c + (dx * cs - dz * sn) * k, c + (dx * sn + dz * cs) * k];
    };

    g.clearRect(0, 0, size, size);
    g.save();
    g.beginPath(); g.arc(c, c, pr, 0, Math.PI * 2); g.clip();
    // recorte do mapa base
    g.save();
    g.translate(c, c); g.rotate(rot);
    const span = VIEW_R * 1.45 * MAP_SCALE, kk = k / MAP_SCALE;
    g.scale(kk, kk);
    g.drawImage(painter.canvas, toMap(P.x) - span, toMap(P.z) - span, span * 2, span * 2, -span, -span, span * 2, span * 2);
    g.restore();

    // ícones de lugares (sempre "de pé")
    const ic = size * 0.085;
    for (const l of ICON_LMS) {
      const [sx, sy] = W2S(l.x, l.z);
      if (Math.hypot(sx - c, sy - c) > pr - ic * 0.5) continue;
      drawBadge(g, sx, sy, LANDMARK_ICONS[l.id], ic);
    }
    // moradores com pedido
    for (const n of game.npcs?.list || []) {
      if (n.marker !== '!' || n.visible === false || !n.position) continue;
      const [sx, sy] = W2S(n.position.x, n.position.z);
      if (Math.hypot(sx - c, sy - c) > pr - ic * 0.4) continue;
      drawBang(g, sx, sy, ic * 0.9, t);
    }
    // vinheta interna (profundidade)
    const vg = g.createRadialGradient(c, c, pr * 0.7, c, c, pr);
    vg.addColorStop(0, 'rgba(75,55,104,0)'); vg.addColorStop(1, 'rgba(75,55,104,.28)');
    g.fillStyle = vg; g.fillRect(0, 0, size, size);
    g.restore();

    // objetivo da missão: estrela, ou seta grudada na borda se estiver longe
    const tgt = game.missions?.markerTarget?.();
    if (tgt) {
      const [sx, sy] = W2S(tgt.x, tgt.z);
      const dx = sx - c, dy = sy - c, d = Math.hypot(dx, dy);
      if (d < pr - ic * 0.6) drawStar(g, sx, sy, ic * 0.62, t);
      else {
        const a = Math.atan2(dy, dx), r = pr - ic * 0.55;
        const ax = c + Math.cos(a) * r, ay = c + Math.sin(a) * r;
        g.save(); g.translate(ax, ay); g.rotate(a + Math.PI / 2);
        const s = ic * 0.55 * (1 + 0.12 * Math.sin(t * 6));
        g.shadowColor = 'rgba(255,111,168,.9)'; g.shadowBlur = s;
        g.beginPath(); g.moveTo(0, -s); g.lineTo(s * 0.85, s * 0.6); g.lineTo(-s * 0.85, s * 0.6); g.closePath();
        g.fillStyle = '#ff6fa8'; g.fill(); g.shadowColor = 'transparent';
        g.strokeStyle = '#fff'; g.lineWidth = Math.max(1.5, s * 0.22); g.lineJoin = 'round'; g.stroke();
        g.restore();
      }
    }

    // a Quim
    const fx = Math.sin(P.rotY), fz = Math.cos(P.rotY);
    const rx = fx * cs - fz * sn, ry = fx * sn + fz * cs;
    drawPlayerArrow(g, c, c, size * 0.06, Math.atan2(rx, -ry));

    // "N" na borda
    {
      const nx = -sn, ny = -cs;                      // norte (0,-1) rotacionado
      const a = Math.atan2(ny, nx), r = pr - size * 0.005;
      const x = c + Math.cos(a) * r, y = c + Math.sin(a) * r, s = size * 0.062;
      g.save();
      g.shadowColor = 'rgba(60,40,90,.35)'; g.shadowBlur = 4;
      g.fillStyle = '#4b3768'; g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); g.fill();
      g.shadowColor = 'transparent';
      g.strokeStyle = '#fff'; g.lineWidth = Math.max(1.5, s * 0.2); g.stroke();
      g.fillStyle = '#fff'; g.font = `700 ${Math.round(s * 1.15)}px Fredoka, "Baloo 2", system-ui, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('N', x, y + s * 0.06);
      g.restore();
    }

    // nome da região
    const rid = game.world?.regionAt?.(P.x, P.z) ?? (() => {
      const r = nearestRegion(P.x, P.z);
      return Math.hypot(P.x - r.center.x, P.z - r.center.z) < r.radius ? r.id : null;
    })();
    if (rid !== curRegion) {
      curRegion = rid;
      label.textContent = rid ? REG[rid]?.name ?? '' : 'Entre um lugar e outro';
      label.classList.toggle('between', !rid);
      label.style.setProperty('--rc', rid ? REG[rid].palette.accents[0] : '#c9b6ff');
    }
  }

  return {
    el: wrap,
    /** ~20 quadros por segundo bastam para o minimapa. */
    update(dt, t) {
      acc += dt;
      if (acc < 0.05) return;
      acc = 0;
      draw(t);
    },
    redraw: (t) => draw(t),
  };
}
