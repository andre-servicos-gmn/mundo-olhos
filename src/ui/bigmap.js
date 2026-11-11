// Mapa completo (tecla M): papel fofinho com o reino inteiro. Regiões coloridas (ou desbotadas!) conforme
// o progresso, nomes, rio e lagos, lugares com ícone (nome ao passar o mouse), moradores com pedido,
// objetivo da missão com trilha pontilhada desde a Quim, regiões não descobertas cobertas de nuvem,
// legenda com as "cores do reino". Zoom com a rodinha/botões, arrastar para mover.
import { WORLD, REGIONS, LANDMARKS, WATER, PATHS } from '../data/worldmap.js';
import { mulberry32 } from '../core/util.js';
import { el, esc, fadeHex } from './dom.js';
import { quimSVG } from './art.js';
import { MAP_SCALE, LANDMARK_ICONS, MINIMAP_ICON_IDS, drawBadge, drawBang, drawStar, regionT, roundRect } from './mapdraw.js';

const REG = Object.fromEntries(REGIONS.map((r) => [r.id, r]));
// Lugares com nome que aparecem ao passar o mouse (sem postes, cercas e afins).
const NAMED = LANDMARKS.filter((l) => l.name && !['poste', 'cerca'].includes(l.type) && !/^(placa|banco_fonte)/.test(l.id) && l.type !== 'placa');
const ICONS = LANDMARKS.filter((l) => LANDMARK_ICONS[l.id]);
// Onde fica o nome de cada região (escolhido para não cobrir os ícones principais).
const LABEL_POS = { campo: [-58, 200], vila: [-4, -20], ninhal: [-195, 52], bosque: [205, 84], cidade: [0, -122], pico: [205, -168] };
const MAJOR = new Set(MINIMAP_ICON_IDS);

// Nuvens (determinísticas) que cobrem as regiões ainda não visitadas.
const CLOUDS = Object.fromEntries(REGIONS.map((r, k) => {
  const rand = mulberry32(100 + k);
  const puffs = [];
  for (let i = 0; i < 34; i++) {
    const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * r.radius * 0.95;
    puffs.push([r.center.x + Math.cos(a) * d, r.center.z + Math.sin(a) * d, 16 + rand() * 18]);
  }
  return [r.id, puffs];
}));

export function createBigMap(ctx, painter) {
  const { game } = ctx;
  let wrap = null, canvas = null, g = null, layer = null, raf = 0, tip = null, quimEl = null;
  let view = { x: 0, z: 0, zoom: 1 }, fit = 1, W = 0, H = 0, dpr = 1;
  let drag = null;

  const discovered = (id) => !!game.state?.discoveredRegions?.[id];
  const playerPos = () => {
    const p = game.player?.position;
    return p ? { x: p.x, z: p.z, rotY: game.player.rotY ?? 0 } : { ...(game.state?.player || { x: 0, z: 0 }), rotY: game.state?.player?.rotY ?? 0 };
  };

  // mundo → tela (px CSS)
  const sx = (x) => W / 2 + (x - view.x) * view.zoom;
  const sz = (z) => H / 2 + (z - view.z) * view.zoom;

  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    fit = Math.min(W, H) / (WORLD.half * 2 * 0.98);
  }
  function clampView() {
    view.zoom = Math.max(fit * 0.9, Math.min(fit * 4.5, view.zoom));
    const lim = WORLD.half;
    view.x = Math.max(-lim, Math.min(lim, view.x));
    view.z = Math.max(-lim, Math.min(lim, view.z));
  }

  function draw() {
    const t = performance.now() / 1000;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    // papel
    g.fillStyle = '#fbf1df'; g.fillRect(0, 0, W, H);
    // mapa base
    g.save();
    g.translate(sx(-WORLD.half), sz(-WORLD.half));
    const k = view.zoom / MAP_SCALE;
    g.scale(k, k);
    g.globalAlpha = 0.97;
    g.drawImage(painter.canvas, 0, 0);
    g.restore();
    // um véu de papel (dá o ar de mapa desenhado)
    g.save();
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = 'rgba(255,236,205,.35)'; g.fillRect(0, 0, W, H);
    g.restore();

    const s = game.state || {};
    const R = (m) => m * view.zoom;

    const near = view.zoom >= fit * 1.45;      // de perto mostra tudo; de longe só o principal
    // nomes da água
    for (const w of WATER) {
      if (!near || !discovered(w.region) || !w.name || w.type === 'fonte') continue;
      const p = w.points ? w.points[Math.floor(w.points.length * 0.62)] : [w.x, w.z];
      label(w.name, sx(p[0]) + (w.points ? 34 : 0), sz(p[1]) + (w.points ? 0 : R(w.radius || 6) + 10), { size: 12, italic: true, color: '#3f7fb8' });
    }

    // ícones de lugares
    const ic = Math.max(18, Math.min(30, 13 * view.zoom / fit));
    for (const l of ICONS) {
      if (!discovered(l.region) || (!near && !MAJOR.has(l.id))) continue;
      drawBadge(g, sx(l.x), sz(l.z), LANDMARK_ICONS[l.id], ic);
    }
    // moradores com pedido
    for (const n of game.npcs?.list || []) {
      if (n.marker !== '!' || n.visible === false || !n.position) continue;
      const rid = n.def?.region;
      if (rid && !discovered(rid)) continue;
      drawBang(g, sx(n.position.x), sz(n.position.z), ic * 0.85, t);
    }

    // nuvens nas regiões não descobertas
    for (const r of REGIONS) {
      if (discovered(r.id)) continue;
      const puffs = CLOUDS[r.id];
      g.fillStyle = 'rgba(170,150,210,.45)';
      for (const [x, z, rr] of puffs) { g.beginPath(); g.arc(sx(x) + 3, sz(z) + 5, R(rr), 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#ffffff';
      for (const [x, z, rr] of puffs) { g.beginPath(); g.arc(sx(x), sz(z), R(rr), 0, Math.PI * 2); g.fill(); }
      g.fillStyle = 'rgba(236,228,250,.9)';
      for (const [x, z, rr] of puffs) { g.beginPath(); g.arc(sx(x) + R(rr) * 0.25, sz(z) + R(rr) * 0.3, R(rr) * 0.55, 0, Math.PI * 2); g.fill(); }
      // olhinhos sonolentos na nuvem
      const cx = sx(r.center.x), cz = sz(r.center.z) - R(10);
      g.strokeStyle = '#6b5a8e'; g.lineWidth = 2.4; g.lineCap = 'round';
      for (const ox of [-10, 10]) { g.beginPath(); g.arc(cx + ox, cz, 6, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); }
    }

    // nomes das regiões (plaquinha) e "???" nas nuvens
    for (const r of REGIONS) {
      if (discovered(r.id)) {
        const [x, z] = LABEL_POS[r.id] || [r.center.x, r.center.z];
        plate(r.name, sx(x), sz(z), Math.max(14, Math.min(22, 8 * view.zoom / fit + 7)), r.palette.accents[0]);
      } else label('???', sx(r.center.x), sz(r.center.z) + R(14), { size: 18, color: '#8a78ad', bold: true });
    }

    // objetivo da missão + trilha pontilhada desde a Quim
    const P = playerPos();
    const tgt = game.missions?.markerTarget?.();
    if (tgt) {
      g.save();
      g.strokeStyle = 'rgba(255,111,168,.85)'; g.lineWidth = 3; g.setLineDash([2, 9]); g.lineCap = 'round';
      g.lineDashOffset = -t * 20;
      g.beginPath(); g.moveTo(sx(P.x), sz(P.z)); g.lineTo(sx(tgt.x), sz(tgt.z)); g.stroke();
      g.restore();
      drawStar(g, sx(tgt.x), sz(tgt.z), ic * 0.62, t);
    }

    // a Quim (elemento DOM por cima do canvas)
    quimEl.style.transform = `translate(${sx(P.x)}px, ${sz(P.z)}px)`;
    quimEl.querySelector('.dir').style.transform = `translate(-50%,-50%) rotate(${Math.atan2(Math.sin(P.rotY), -Math.cos(P.rotY))}rad)`;
  }

  function label(text, x, y, { size = 14, color = '#4b3768', bold = false, italic = false } = {}) {
    g.save();
    g.font = `${italic ? 'italic ' : ''}${bold ? 700 : 500} ${size}px Fredoka, "Baloo 2", system-ui, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineJoin = 'round'; g.lineWidth = size * 0.36; g.strokeStyle = 'rgba(255,250,240,.95)';
    g.strokeText(text, x, y);
    g.fillStyle = color; g.fillText(text, x, y);
    g.restore();
  }

  /** Plaquinha arredondada com o nome da região. */
  function plate(text, x, y, size, accent) {
    g.save();
    g.font = `700 ${size}px Fredoka, "Baloo 2", system-ui, sans-serif`;
    const w = g.measureText(text).width + size * 1.3, h = size * 1.7;
    g.shadowColor = 'rgba(75,55,104,.3)'; g.shadowBlur = 8; g.shadowOffsetY = 2;
    g.fillStyle = 'rgba(255,250,243,.93)'; roundRect(g, x - w / 2, y - h / 2, w, h, h / 2); g.fill();
    g.shadowColor = 'transparent';
    g.strokeStyle = accent; g.lineWidth = 2.5; g.stroke();
    g.fillStyle = '#4b3768'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, x, y + size * 0.05);
    g.restore();
  }

  function loop() {
    if (!wrap) return;
    draw();
    raf = requestAnimationFrame(loop);
  }

  function hover(e) {
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    let best = null, bd = 16;
    for (const l of NAMED) {
      if (!discovered(l.region)) continue;
      const d = Math.hypot(sx(l.x) - mx, sz(l.z) - my);
      if (d < bd) { bd = d; best = l; }
    }
    if (!best) {
      // trilha com nome?
      for (const p of PATHS) {
        if (!p.name || (p.secret && !game.state?.discoveredPaths?.[p.id])) continue;
        for (let i = 0; i < p.points.length - 1; i++) {
          const d = segDist(mx, my, sx(p.points[i][0]), sz(p.points[i][1]), sx(p.points[i + 1][0]), sz(p.points[i + 1][1]));
          if (d < 7 && d < bd && discovered(p.from)) { bd = d; best = { name: p.name, region: p.from, path: true }; }
        }
      }
    }
    if (best) {
      tip.innerHTML = `<b>${esc(best.name)}</b><small>${best.path ? 'trilha · ' : ''}${esc(REG[best.region]?.name ?? '')}</small>`;
      tip.style.transform = `translate(${mx + 14}px, ${my - 10}px)`;
      tip.classList.add('show');
      canvas.style.cursor = 'help';
    } else {
      tip.classList.remove('show');
      canvas.style.cursor = drag ? 'grabbing' : 'grab';
    }
  }

  function zoomAt(f, mx = W / 2, my = H / 2) {
    const wx = view.x + (mx - W / 2) / view.zoom, wz = view.z + (my - H / 2) / view.zoom;
    view.zoom *= f;
    clampView();
    view.x = wx - (mx - W / 2) / view.zoom;
    view.z = wz - (my - H / 2) / view.zoom;
    clampView();
  }
  const centerOnQuim = () => { const P = playerPos(); view.x = P.x; view.z = P.z; clampView(); };

  function legend() {
    const rows = REGIONS.map((r) => {
      const t = regionT(game, r.id), d = discovered(r.id);
      const pct = Math.round(t * 100);
      return `<div class="mo-lg-reg ${d ? '' : 'unk'}"><i style="background:${fadeHex(r.palette.ground, t)};border-color:${fadeHex(r.palette.accents[0], t)}"></i>
        <span class="n">${d ? esc(r.name) : '???'}</span><span class="bar"><b style="width:${pct}%;background:${r.palette.accents[0]}"></b></span><span class="p">${d ? pct + '%' : ''}</span></div>`;
    }).join('');
    return `<h3>Legenda</h3>
      <div class="mo-lg-row"><span class="sym quim"></span>Você (a Quim)</div>
      <div class="mo-lg-row"><span class="sym star">★</span>Objetivo da missão</div>
      <div class="mo-lg-row"><span class="sym bang">!</span>Morador com pedido</div>
      <div class="mo-lg-row"><span class="sym cloud">☁</span>Ainda não visitado</div>
      <div class="mo-lg-row"><span class="sym dash"></span>Trilha secreta achada</div>
      <h3>Cores do reino</h3>${rows}`;
  }

  function open() {
    if (wrap) return;
    wrap = el('div', 'mo-overlay mo-map');
    canvas = el('canvas', 'mo-map-canvas');
    tip = el('div', 'mo-map-tip');
    quimEl = el('div', 'mo-map-quim', { html: `<span class="dir"></span><span class="face">${quimSVG({ head: true })}</span>` });
    const view_ = el('div', 'mo-map-view', {}, canvas, quimEl, tip,
      el('div', 'mo-map-rose', { html: '<svg viewBox="0 0 60 60"><circle cx="30" cy="30" r="26" fill="#fff8ec" stroke="#d9c3a3" stroke-width="2"/><path d="M30 6 L36 30 L30 54 L24 30Z" fill="#ff8fc7"/><path d="M30 30 L36 30 L30 54Z M30 30 L24 30 L30 6Z" fill="#c25a8f" opacity=".35"/><path d="M6 30 L30 25 L54 30 L30 35Z" fill="#c9b6ff" opacity=".8"/><circle cx="30" cy="30" r="4" fill="#fff" stroke="#4b3768" stroke-width="1.5"/><text x="30" y="5" text-anchor="middle" font-size="9" font-weight="700" fill="#4b3768" dy="2">N</text></svg>' }));
    const zoomIn = el('button', 'mo-btn small round', { text: '+', on: { click: () => { zoomAt(1.35); ctx.sfx('mover'); } } });
    const zoomOut = el('button', 'mo-btn small round', { text: '−', on: { click: () => { zoomAt(1 / 1.35); ctx.sfx('mover'); } } });
    const center = el('button', 'mo-btn small', { html: '<span class="lb">◎ Quim</span>', on: { click: () => { centerOnQuim(); ctx.sfx('mover'); } } });
    const closeBtn = el('button', 'mo-btn small', { html: '<span class="lb">Fechar <kbd>M</kbd></span>', on: { click: () => close() } });
    const paper = el('div', 'mo-map-paper', {},
      el('div', 'mo-map-head', {}, el('h2', 'mo-map-title', { text: 'Mapa do Reino' }),
        el('div', 'mo-map-tools', {}, zoomOut, zoomIn, center, closeBtn)),
      el('div', 'mo-map-body', {}, view_, el('div', 'mo-map-legend', { html: legend() })));
    wrap.appendChild(paper);
    ctx.root.appendChild(wrap);
    g = canvas.getContext('2d');
    resize();
    view = { x: 0, z: 0, zoom: fit };
    clampView();

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, vx: view.x, vz: view.z }; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; });
    canvas.addEventListener('pointermove', (e) => {
      if (drag) { view.x = drag.vx - (e.clientX - drag.x) / view.zoom; view.z = drag.vz - (e.clientY - drag.y) / view.zoom; clampView(); }
      hover(e);
    });
    const endDrag = () => { drag = null; canvas.style.cursor = 'grab'; };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointerleave', () => tip.classList.remove('show'));
    canvas.addEventListener('dblclick', (e) => { const r = canvas.getBoundingClientRect(); zoomAt(1.6, e.clientX - r.left, e.clientY - r.top); });

    layer = {
      name: 'map', pauses: true,
      onKey(code) {
        const pan = 40 / view.zoom * (fit * 2);
        if (code === 'KeyM' || code === 'Escape') close();
        else if (code === 'Equal' || code === 'NumpadAdd') zoomAt(1.25);
        else if (code === 'Minus' || code === 'NumpadSubtract') zoomAt(0.8);
        else if (code === 'ArrowLeft' || code === 'KeyA') { view.x -= pan; clampView(); }
        else if (code === 'ArrowRight' || code === 'KeyD') { view.x += pan; clampView(); }
        else if (code === 'ArrowUp' || code === 'KeyW') { view.z -= pan; clampView(); }
        else if (code === 'ArrowDown' || code === 'KeyS') { view.z += pan; clampView(); }
        else if (code === 'KeyC' || code === 'Space') centerOnQuim();
        return true;
      },
    };
    ctx.push(layer);
    ctx.sfx('clique');
    requestAnimationFrame(() => wrap?.classList.add('show'));
    addEventListener('resize', onResize);
    loop();
  }
  function onResize() { if (wrap) { resize(); clampView(); } }

  function close() {
    if (!wrap) return;
    ctx.sfx('clique');
    cancelAnimationFrame(raf);
    removeEventListener('resize', onResize);
    ctx.pop(layer);
    const w = wrap;
    wrap = null;
    w.classList.add('out');
    setTimeout(() => w.remove(), 260);
  }

  return { open, close, get isOpen() { return !!wrap; } };
}

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  return Math.hypot(px - ax - dx * t, py - ay - dy * t);
}
