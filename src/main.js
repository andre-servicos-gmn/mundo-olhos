// Ponto de entrada: monta todos os sistemas, tela de carregamento, menu e loop do jogo.
import * as THREE from 'three';
import { createBus } from './core/bus.js';
import { loadState, saveState, defaultState, hasSave, clearSave } from './core/state.js';
import { createInput } from './core/input.js';
import { createInteractables } from './core/interact.js';
import { nextFrame } from './core/util.js';
import { createRender } from './render/render.js';
import { createWorld } from './world/world.js';
import { createPlayer } from './player/player.js';
import { createCameraRig } from './player/camera.js';
import { createPinceso } from './pinceso/pinceso.js';
import { createNPCs } from './npcs/npcs.js';
import { createMissions } from './missions/missions.js';
import { createCasinha } from './casinha/casinha.js';
import { createUI } from './ui/ui.js';
import { createAudio } from './audio/audio.js';

const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');

async function boot() {
  const root = document.getElementById('game-root');
  const uiRoot = document.getElementById('ui-root');

  const game = {
    THREE,
    debug: DEBUG,
    params,
    bus: createBus(),
    state: hasSave() ? loadState() : defaultState(),
    interactables: createInteractables(),
    findables: new Set(),  // provedores: () => [{ x, y, z, kind }] — coisas que o Pinceso pode apontar (Q)
    paused: true,          // true em menus/pausa: o mundo não avança
    cinematic: false,      // true em cenas: jogador sem controle, câmera controlada por script
    time: { elapsed: 0 },
  };
  if (params.get('quality')) game.state.settings.quality = params.get('quality');
  window.__game = game;  // exposto cedo para testes (ready só fica true quando o loop começa)

  game.ui = createUI(game, uiRoot);
  game.ui.showLoading(0, 'Acordando o Mundo Olhos...');
  await nextFrame();

  game.audio = createAudio(game);
  game.render = createRender(game, root);
  game.input = createInput(game.render.renderer.domElement);
  game.ui.attachInput(game.input);

  game.world = createWorld(game);
  await game.world.build((p, text) => game.ui.showLoading(0.05 + p * 0.75, text));

  game.ui.showLoading(0.82, 'Penteando os cachinhos da Quim...');
  await nextFrame();
  game.player = createPlayer(game);
  game.cameraRig = createCameraRig(game);
  game.pinceso = createPinceso(game);

  game.ui.showLoading(0.9, 'Chamando os moradores...');
  await nextFrame();
  game.npcs = createNPCs(game);
  game.missions = createMissions(game);
  game.casinha = createCasinha(game);

  game.ui.showLoading(1, 'Pronto!');
  await game.render.warmup?.();
  await new Promise((r) => setTimeout(r, 400));
  game.ui.hideLoading();

  // Menu principal (ou pula com ?skip).
  let choice = 'new';
  if (!params.has('skip')) {
    game.audio.setMusic('menu');
    game.render.setMenuMode?.(true);
    choice = await game.ui.showMenu({ hasSave: hasSave() });
    game.render.setMenuMode?.(false);
  }
  game.audio.init();
  if (choice === 'new') {
    clearSave();
    Object.assign(game.state, defaultState(), { settings: game.state.settings });
  }
  applyDebugParams(game);
  startSession(game, choice === 'new');
  loop(game);
}

function startSession(game, isNew) {
  game.audio.setVolumes(game.state.settings);
  game.render.setQuality(game.state.settings.quality);
  game.render.dayTime = game.state.dayTime;
  game.world.applyState();     // cores das regiões, coletáveis já pegos
  game.player.applyState();    // posição, acessório
  game.pinceso.applyState();
  game.npcs.applyState();
  game.missions.applyState();
  game.casinha.applyState();
  game.cameraRig.snap();
  game.paused = false;
  game.bus.emit('session:start', { isNew });
  if (isNew && !game.params.has('noprologue')) game.missions.playPrologue();
}

function save(game) {
  const p = game.player.position;
  game.state.player = { x: p.x, y: p.y, z: p.z, rotY: game.player.rotY };
  game.state.dayTime = game.render.dayTime;
  saveState(game.state);
}

function applyDebugParams(game) {
  const pos = game.params.get('pos');
  if (pos) {
    const [x, z] = pos.split(',').map(Number);
    game.state.player = { x, y: game.world.getHeight(x, z), z, rotY: 0 };
  }
  if (game.params.get('time')) game.state.dayTime = Number(game.params.get('time'));
  for (const f of (game.params.get('flags') || '').split(',').filter(Boolean)) game.state.flags[f] = true;
  if (game.params.has('pinceso')) game.state.pincesoJoined = true;
  if (game.params.has('color')) for (const r of game.world.regionIds()) game.state.regionColor[r] = 1;
}

function loop(game) {
  const clock = new THREE.Clock();
  let saveTimer = 0;
  game.bus.on('mission:complete', () => save(game));
  addEventListener('beforeunload', () => save(game));

  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 1 / 20);
    game.ui.update(dt);                       // trata Esc/Tab/M e menus mesmo pausado
    if (!game.paused) {
      game.time.elapsed += dt;
      game.state.playTime += dt;
      game.render.update(dt);                 // ciclo dia/noite, céu, luz que segue a Quim
      game.player.update(dt);
      game.pinceso.update(dt);
      game.npcs.update(dt);
      game.world.update(dt);                  // vento, grama, água, olhos, cor das regiões
      game.missions.update(dt);
      game.casinha.update(dt);
      game.audio.update(dt);
      saveTimer += dt;
      if (saveTimer > 15) { saveTimer = 0; save(game); }
    }
    game.cameraRig.update(dt);
    game.render.render();
    game.input.endFrame();
  }
  frame();

  // Ganchos de teste/depuração.
  window.__game = game;
  window.__save = () => save(game);
  game.ready = true;
}

boot().catch((e) => {
  console.error(e);
  const el = document.createElement('pre');
  el.style.cssText = 'position:fixed;inset:0;margin:0;padding:24px;background:#2a1840;color:#ffd6f0;font:14px monospace;white-space:pre-wrap;z-index:99999';
  el.textContent = 'Ops! O Mundo Olhos tropeçou ao carregar:\n\n' + (e && e.stack || e);
  document.body.appendChild(el);
});
