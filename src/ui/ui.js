// Interface do Mundo Olhos (DOM + CSS por cima do canvas). API em docs/ARQUITETURA.md (ui):
//   createUI(game, rootEl) -> { attachInput, update, showLoading, hideLoading, showMenu, dialogue, choice, toast,
//     setPrompt, banner, missionComplete, regionTitle, openMap, openDiary, openPause, openCafe, openShop,
//     minigameCoral, fade, isBlocking }
//
// Como as camadas funcionam: cada tela que captura o teclado (menu, diálogo, mapa, diário, pausa, loja...)
// entra numa pilha. Enquanto a pilha tem algo, game.input.enabled = false; se alguma camada "pausa"
// (mapa, diário, pausa), game.paused = true. As teclas vão só para a camada do topo.
// Teclas chegam por game.input.rawPressed no update(); antes do loop do jogo existir (menu principal),
// um ouvinte de keydown faz o mesmo papel.
import { PATHS } from '../data/worldmap.js';
import { el } from './dom.js';
import { createMapPainter } from './mapdraw.js';
import { createHud } from './hud.js';
import { createMinimap } from './minimap.js';
import { createDialogue } from './dialogue.js';
import { createMenus } from './menus.js';
import { createBigMap } from './bigmap.js';
import { createDiary } from './diary.js';
import { createShops } from './shops.js';
import { createCoral } from './coral.js';

const KEYS = ['Escape', 'Tab', 'KeyM', 'KeyE', 'KeyQ', 'KeyC', 'Space', 'Enter', 'NumpadEnter',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'Equal', 'Minus', 'NumpadAdd', 'NumpadSubtract',
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap((n) => [`Digit${n}`, `Numpad${n}`])];

function injectFont() {
  if (document.getElementById('mo-font')) return;
  // Em navegador automatizado (testes) não baixa a fonte — evita erro de rede quando não há internet.
  if (navigator.webdriver && !new URLSearchParams(location.search).has('font')) return;
  for (const href of ['https://fonts.googleapis.com', 'https://fonts.gstatic.com']) {
    document.head.appendChild(el('link', '', { attrs: { rel: 'preconnect', href, crossorigin: '' } }));
  }
  document.head.appendChild(el('link', '', { attrs: { id: 'mo-font', rel: 'stylesheet',
    href: 'https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&display=swap' } }));
}

export function createUI(game, rootEl) {
  injectFont();
  const root = el('div', 'mo-ui');
  (rootEl || document.body).appendChild(root);

  let input = null;
  const stack = [];
  let pausedByUs = false, prevPaused = false, releasePending = false;
  let lastUpdate = 0, sessionActive = false, selfExit = false, ignoreEscUntil = 0;
  let knownRegions = {}, secretAcc = 0;

  const fadeEl = el('div', 'mo-fade');
  root.appendChild(fadeEl);

  const ctx = {
    game, root,
    sfx: (name) => { try { game.audio?.play?.(name); } catch { /* sem áudio */ } },
    push, pop,
    choice: (q, o) => dlg.choice(q, o),
    fade,
    hud: null,
  };

  // ------------------------------------------------------------------------------------------
  // Pilha de camadas
  function push(layer) {
    stack.push(layer);
    // Telas que usam o mouse soltam o ponteiro; o diálogo simples não (avança com E/Espaço ou clique).
    if (!layer.keepPointer && document.pointerLockElement) { selfExit = true; document.exitPointerLock?.(); }
    refresh();
  }
  function pop(layer) {
    const i = stack.lastIndexOf(layer);
    if (i >= 0) stack.splice(i, 1);
    refresh();
  }
  function refresh() {
    const pausing = stack.some((l) => l.pauses);
    if (pausing && !pausedByUs) { prevPaused = !!game.paused; game.paused = true; pausedByUs = true; }
    else if (!pausing && pausedByUs) { game.paused = prevPaused; pausedByUs = false; }
    if (stack.length) {
      releasePending = false;
      if (input) input.enabled = false;
    } else {
      // devolve o controle só no próximo quadro: a tecla que fechou o diálogo não pode virar "interagir"
      releasePending = true;
      if (Date.now() - lastUpdate > 250 && input) { input.enabled = true; releasePending = false; }
    }
    root.classList.toggle('blocking', stack.length > 0);
    hud.setPrompt(hud.prompt);
  }
  const top = () => stack[stack.length - 1];

  function handleKey(code) {
    const t = top();
    if (t) { t.onKey?.(code); return; }
    if (!sessionActive) return;
    if (code === 'Escape') {
      if (performance.now() < ignoreEscUntil) return;
      menus.openPause();
    } else if (code === 'Tab' && !game.cinematic) diary.open();
    else if (code === 'KeyM' && !game.cinematic) bigmap.open();
  }

  // Teclado direto do DOM quando o loop do jogo ainda não está rodando (menu principal, carregamento).
  addEventListener('keydown', (e) => {
    if (stack.length && ['Space', 'Enter', 'Tab', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    if (e.repeat && !e.code.startsWith('Arrow')) return;
    if (Date.now() - lastUpdate > 250) handleKey(e.code);
  });
  // Com o ponteiro preso no canvas, um clique em qualquer lugar avança o diálogo.
  addEventListener('mousedown', () => { if (document.pointerLockElement && top()?.name === 'dialogue') top().onKey('Click'); });
  // Botões não "roubam" o foco (senão Enter/Espaço apertariam o botão duas vezes).
  root.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });

  // Sair do pointer lock com Esc (o navegador engole a tecla) → abre a pausa.
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement) return;
    if (selfExit) { selfExit = false; return; }
    if (sessionActive && !stack.length && !game.paused) {
      menus.openPause();
      ignoreEscUntil = performance.now() + 400;
    }
  });

  // ------------------------------------------------------------------------------------------
  // Partes
  const painter = createMapPainter(game);
  const hud = createHud(ctx);
  ctx.hud = hud;
  const minimap = createMinimap(ctx, painter);
  hud.el.appendChild(minimap.el);
  const dlg = createDialogue(ctx);
  const menus = createMenus(ctx);
  const bigmap = createBigMap(ctx, painter);
  const diary = createDiary(ctx);
  const shops = createShops(ctx);
  const coral = createCoral(ctx);

  // ------------------------------------------------------------------------------------------
  // Eventos do jogo
  game.bus?.on('session:start', () => {
    sessionActive = true;
    knownRegions = { ...(game.state?.discoveredRegions || {}) };
    painter.refresh(true);
    hud.show(true);
    hud.forceQuestRefresh();
  });
  game.bus?.on('region:enter', (p) => {
    if (!p) return;
    const isNew = !knownRegions[p.id];
    knownRegions[p.id] = true;
    if (game.state?.discoveredRegions) game.state.discoveredRegions[p.id] = true;
    hud.showRegionTitle(p.name, p.id, isNew);
  });
  game.bus?.on('mission:step', () => hud.forceQuestRefresh());
  game.bus?.on('mission:start', () => hud.forceQuestRefresh());
  game.bus?.on('mission:complete', () => hud.forceQuestRefresh());

  // Trilhas secretas: aparecem no mapa quando a Quim pisa nelas.
  function checkSecrets(dt) {
    secretAcc += dt;
    if (secretAcc < 0.5) return;
    secretAcc = 0;
    const p = game.player?.position, s = game.state;
    if (!p || !s) return;
    s.discoveredPaths ||= {};
    for (const path of PATHS) {
      if (!path.secret || s.discoveredPaths[path.id]) continue;
      const pts = path.points;
      for (let i = 0; i < pts.length - 1; i++) {
        if (segDist(p.x, p.z, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]) < path.width / 2 + 1.5) {
          s.discoveredPaths[path.id] = true;
          hud.toast(`Trilha secreta descoberta: ${path.name}!`, '🗺️');
          ctx.sfx('brilho');
          break;
        }
      }
    }
  }

  // ------------------------------------------------------------------------------------------
  function fade(toBlack = true, ms = 600) {
    fadeEl.style.transitionDuration = `${ms}ms`;
    fadeEl.classList.toggle('on', !!toBlack);
    return new Promise((r) => setTimeout(r, ms));
  }

  const ui = {
    attachInput(inp) { input = inp; if (stack.length) input.enabled = false; },

    update(dt) {
      lastUpdate = Date.now();
      if (releasePending && !stack.length) { if (input) input.enabled = true; releasePending = false; }
      if (input) for (const code of KEYS) if (input.rawPressed(code)) handleKey(code);
      const t = performance.now() / 1000;
      hud.setMode({ cinematic: !!game.cinematic || !!game.hideHud, blocked: stack.length > 0 });
      if (sessionActive) {
        painter.refresh();
        hud.update(dt);
        if (!game.cinematic) minimap.update(dt, t);
        checkSecrets(dt);
      }
    },

    showLoading: (p, text) => menus.showLoading(p, text),
    hideLoading: () => menus.hideLoading(),
    showMenu: (opts) => menus.showMenu(opts),

    dialogue: (lines) => dlg.dialogue(lines),
    choice: (q, opts) => dlg.choice(q, opts),
    toast: (text, icon) => hud.toast(text, icon),
    setPrompt: (text) => hud.setPrompt(text),
    banner: (title, subtitle) => hud.banner(title, subtitle),
    missionComplete: (mission) => hud.missionComplete(mission),
    regionTitle: (name, id) => hud.showRegionTitle(name, id),

    openMap: () => bigmap.open(),
    openDiary: () => diary.open(),
    openPause: () => menus.openPause(),
    openCafe: (drinks, opts) => shops.openCafe(drinks, opts),
    openShop: (items, opts) => shops.openShop(items, opts),
    minigameCoral: (opts) => coral.minigameCoral(opts),
    fade,
    isBlocking: () => stack.length > 0,
  };
  return ui;
}

function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}
