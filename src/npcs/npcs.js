// Moradores do Mundo Olhos: modelos (models.js), poses (animate.js), marcadores (markers.js) e comportamento.
// Contrato (docs/ARQUITETURA.md):
//   createNPCs(game) -> { list, get(id), update(dt), applyState(), setMarker(id, '!'|'?'|'♥'|null),
//                         moveTo(id, x, z) -> Promise, setVisible(id, bool), face(id, worldPos), speak(lines) -> Promise }
// Extras (opcionais, não quebram o contrato):
//   moveTo(id, x, z, { y?, speed? }) — y = altura de uma plataforma de destino (ex.: Ninho-Coreto).
//   place(id, x, z, y?)              — teletransporta na hora (cenas). moveTo/place mudam a "casa" do morador até o
//                                      próximo applyState(); setVisible(id, null) devolve a visibilidade às flags.
// Comportamento: respira e balança parado; passeia devagar dentro do raio `wander`; olha a Quim quando ela chega
// perto; acena na primeira passada depois de um tempo longe; alguns seguem a Quim uns passinhos e voltam; dançam
// se ela pula perto (bus 'player:jump'); à noite vão para `nightPos` e, tarde da noite, dormem soltando "Zz".
// Só quem está a menos de 120 m é simulado; além de 180 m o modelo nem é desenhado.
import * as THREE from 'three';
import { NPCS } from '../data/story.js';
import { clamp, damp, mulberry32 } from '../core/util.js';
import { buildNPCModel } from './models.js';
import { animateRig } from './animate.js';
import { setOutlines } from './parts.js';
import { createMarkerSprite, createZzSprite, createNameSprite } from './markers.js';

const ACTIVE = 120;      // simula e anima
const VISIBLE = 180;     // desenha
const LOOK = 8;          // olha para a Quim
const GREET = 7;         // acena quando ela chega a essa distância...
const GREET_AWAY = 30;   // ...depois de ficar esse tempo (s) longe (> 12 m)
const DANCE = 6;         // dança se ela pular dentro desse raio
const NAME = 6.5;        // mostra a plaquinha com o nome
const HEART_LIFE = 7;    // o '♥' some depois desse tempo (s)
const TAU = Math.PI * 2;
const GAIT_HZ = { walk: 9.5, hop: 11, waddle: 8.5, slow: 4.5, hover: 6, none: 0 };   // passos por segundo (rad)

// Jeitinhos individuais (o roteiro não precisa saber disso).
const TRAITS = {
  seu_cochilo: { napper: true },   // dorme o dia inteiro (acorda para conversar)
  seu_caramelo: { calm: true },    // capivara zen: nem pensa em sair do lugar
  dona_soneca: { calm: true },
  seu_palhinha: { calm: true },
};

const angleDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const dampAngle = (a, b, k, dt) => a + angleDiff(a, b) * (1 - Math.exp(-k * dt));
const easeOutBack = (x) => { const c = 1.9; return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2; };

export function createNPCs(game) {
  const scene = game.render.scene;
  setOutlines(game.state?.settings?.quality !== 'baixa');
  const group = new THREE.Group();
  group.name = 'moradores';
  scene.add(group);
  const hud = new THREE.Group();
  hud.name = 'moradores-marcadores';
  scene.add(hud);

  const rand = mulberry32(4242);
  const list = [];
  const byId = new Map();
  const qpos = new THREE.Vector3();
  const qhead = new THREE.Vector3();
  const lastQ = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  let hasQ = false, qSpeed = 0, T = 0, flagTimer = 0, dialogueOpen = false, nearestNpc = null;

  // ----------------------------------------------------------------------------------------------
  // Chão e espaço

  function groundY(x, z, refY) {
    const w = game.world;
    if (!w) return refY ?? 0;
    if (refY !== undefined && w.groundAt) {
      const g = w.groundAt(x, z, refY + 0.3);
      if (g && Number.isFinite(g.y)) return g.y;
    }
    return w.getHeight ? w.getHeight(x, z) : 0;
  }

  /** Põe o morador em (x,z). Sem y: chão; se o chão ali estiver dentro de algo (ex.: tronco da Árvore-Mãe
   *  sob o Ninho-Coreto), sobe para a superfície andável mais alta. */
  function placeAt(npc, x, z, y) {
    let gy = groundY(x, z, y);
    const w = game.world;
    if (y === undefined && w?.groundAt && w.resolveCollision && !w.gateBlocked?.(x, z) && !w.isWater?.(x, z)) {
      tmp.set(x, gy, z);
      w.resolveCollision(tmp, 0.25, true);
      if (Math.hypot(tmp.x - x, tmp.z - z) > 0.05) {
        const g = w.groundAt(x, z, Infinity);
        if (g?.surface && Number.isFinite(g.y)) gy = g.y;
      }
    }
    npc.position.set(x, gy, z);
  }

  function freeSpot(x, z, radius) {
    const w = game.world;
    if (!w) return true;
    if (w.isWater?.(x, z) || w.gateBlocked?.(x, z)) return false;
    if (w.resolveCollision) {
      tmp.set(x, groundY(x, z), z);
      w.resolveCollision(tmp, radius, true);
      if (Math.hypot(tmp.x - x, tmp.z - z) > 0.05) return false;
    }
    return true;
  }

  // ----------------------------------------------------------------------------------------------
  // Criação

  for (const def of NPCS) create(def);

  function create(def) {
    const rig = buildNPCModel(def);
    const size = def.look?.size ?? 1;
    rig.root.scale.setScalar(size);
    rig.root.rotation.y = def.rotY ?? 0;
    group.add(rig.root);
    const markerSprite = createMarkerSprite();
    const zz = createZzSprite();
    const plate = createNameSprite(def.name);
    hud.add(markerSprite, zz, plate);
    const traits = TRAITS[def.id] || {};
    const npc = {
      id: def.id, name: def.name, def, rig, size, traits,
      object: rig.root, position: rig.root.position,
      anchor: { x: def.x, z: def.z }, night: def.nightPos ? { x: def.nightPos.x, z: def.nightPos.z } : null, scripted: false,
      yaw: def.rotY ?? 0, moveYaw: 0, state: 'idle', timer: 1 + rand() * 5, target: null,
      wave: 0, dance: 0, danceDelay: 0, joy: 0, followT: 0, followCD: 4 + rand() * 12,
      talking: false, talkExt: 0, busy: false, lastNear: -1e9, awakeUntil: 0, sleeping: false,
      faceTarget: null, faceUntil: 0, script: null,
      marker: null, markerT: 0, markerSprite, zz, plate, plateOp: 0,
      override: null, visible: true, active: false, lastActive: -1e9, dist: 1e9,
      speed: rig.speed * clamp(Math.sqrt(size), 0.7, 1.3),
      canFollow: (def.wander ?? 0) >= 3 && rig.gait !== 'none' && rig.gait !== 'slow' && !traits.calm,
      idleBag: [],
      anim: { t: 0, move: 0, phase: rand() * TAU, wave: 0, waveT: 0, dance: 0, danceT: 0, sleep: 0, talk: 0, headYaw: 0, headPitch: 0, joy: 0 },
    };
    placeAt(npc, def.x, def.z);
    list.push(npc);
    byId.set(def.id, npc);

    game.interactables?.add({
      id: 'npc_' + def.id,
      label: 'Conversar com ' + def.name,
      radius: 2.1 + rig.radius * size,
      getPosition: () => npc.position,
      enabled: () => npc.visible && npc.active && !npc.script && !game.cinematic,
      onInteract: () => interact(npc),
    });
  }

  // ----------------------------------------------------------------------------------------------
  // Conversa

  function pickIdle(npc) {
    const lines = npc.def.idleLines || [];
    if (!lines.length) return '...';
    if (!npc.idleBag.length) {
      npc.idleBag = lines.map((_, i) => i);
      for (let i = npc.idleBag.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [npc.idleBag[i], npc.idleBag[j]] = [npc.idleBag[j], npc.idleBag[i]]; }
      if (npc.idleBag.length > 1 && npc.idleBag[npc.idleBag.length - 1] === npc.lastIdle) npc.idleBag.unshift(npc.idleBag.pop());
    }
    npc.lastIdle = npc.idleBag.pop();
    return lines[npc.lastIdle];
  }

  function headWorld(npc, out) {
    const r = npc.rig;
    return out.set(npc.position.x, npc.position.y + (r.top * 0.82 + r.visual.position.y) * npc.size, npc.position.z);
  }

  async function interact(npc) {
    if (npc.busy) return;
    npc.busy = true;
    npc.talking = true;
    if (npc.anim.sleep > 0.3) npc.joy = 1;           // acordou num pulinho
    npc.awakeUntil = T + 40;
    npc.state = 'idle';
    npc.target = null;
    npc.wave = 0;
    game.player?.lookAt?.(headWorld(npc, new THREE.Vector3()));
    try {
      const handled = await game.missions?.onTalk?.(npc.id);
      if (!handled) await speak([{ speaker: npc.id, text: pickIdle(npc) }]);
    } catch (e) {
      console.error('[npcs] erro na conversa com', npc.id, e);
    } finally {
      npc.talking = false;
      npc.busy = false;
      npc.timer = 2 + rand() * 3;
      npc.lastNear = T;
      game.player?.lookAt?.(null);
    }
  }

  /** Mostra falas na caixa de diálogo (a UI cuida das vozes). Quem fala se vira para a Quim e gesticula. */
  function speak(lines) {
    const speakers = new Set();
    for (const l of lines || []) { const n = byId.get(l?.speaker); if (n) speakers.add(n); }
    for (const n of speakers) { n.talkExt++; n.awakeUntil = Math.max(n.awakeUntil, T + 30); }
    return Promise.resolve(game.ui?.dialogue?.(lines)).finally(() => {
      for (const n of speakers) n.talkExt = Math.max(0, n.talkExt - 1);
    });
  }

  // ----------------------------------------------------------------------------------------------
  // Eventos

  game.bus?.on('player:jump', () => {
    for (const npc of list) {
      if (!npc.active || npc.dist > DANCE || npc.script || npc.talking || npc.sleeping) continue;
      if (npc.dance > 0.4 || npc.danceDelay > 0) continue;
      npc.danceDelay = 0.06 + rand() * 0.3;   // cada um entra no ritmo do seu jeito
    }
  });
  game.bus?.on('dialogue:open', () => { dialogueOpen = true; });
  game.bus?.on('dialogue:close', () => { dialogueOpen = false; });

  // ----------------------------------------------------------------------------------------------
  // Visibilidade e hora

  function refreshVisibility() {
    const flags = game.state?.flags || {};
    for (const npc of list) {
      const d = npc.def;
      const byFlags = (!d.showAfterFlag || !!flags[d.showAfterFlag]) && (!d.hideAfterFlag || !flags[d.hideAfterFlag]);
      const vis = npc.override ?? byFlags;
      if (vis && !npc.visible) npc.lastActive = -1e9;     // reaparece já no lugar certo
      npc.visible = vis;
      if (!vis) {
        npc.object.visible = false;
        hideHud(npc);
        if (npc.script) finishScript(npc, true);
      }
    }
  }

  const isNight = () => !!game.render?.isNight?.();
  const isLate = () => { const d = game.render?.dayTime ?? 0.5; return d > 0.86 || d < 0.19; };

  function anchorOf(npc, night) {
    if (!npc.scripted && night && npc.night) return npc.night;
    return npc.anchor;
  }

  // ----------------------------------------------------------------------------------------------
  // Movimento

  /** Anda em direção ao objetivo. Retorna a distância restante. */
  function step(npc, goal, speed, dt) {
    const p = npc.position;
    const dx = goal.x - p.x, dz = goal.z - p.z, d = Math.hypot(dx, dz);
    if (d < 0.12) return d;
    const v = Math.min(speed * dt, d);
    p.x += (dx / d) * v;
    p.z += (dz / d) * v;
    game.world?.resolveCollision?.(p, npc.rig.radius * npc.size, true);
    p.y = groundY(p.x, p.z, goal.y ?? p.y);
    npc.moveYaw = Math.atan2(dx, dz);
    npc.moving = true;
    npc.moveSpeed = v / Math.max(dt, 1e-4);
    return d - v;
  }

  function pickWander(npc, A) {
    const w = npc.def.wander ?? 0;
    for (let i = 0; i < 6; i++) {
      const a = rand() * TAU, r = w * (0.35 + 0.65 * Math.sqrt(rand()));
      const x = A.x + Math.cos(a) * r, z = A.z + Math.sin(a) * r;
      if (freeSpot(x, z, npc.rig.radius * npc.size)) return { x, z };
    }
    return null;
  }

  function finishScript(npc, teleport) {
    const s = npc.script;
    if (!s) return;
    npc.script = null;
    npc.anchor = s.y === undefined ? { x: s.x, z: s.z } : { x: s.x, z: s.z, y: s.y };
    npc.scripted = true;
    if (teleport) placeAt(npc, s.x, s.z, s.y);
    npc.state = 'idle';
    npc.timer = 3 + rand() * 3;
    s.resolve(true);
  }

  // ----------------------------------------------------------------------------------------------
  // Cérebro de cada morador (só para quem está ativo)

  function think(npc, dt, night, late) {
    const p = npc.position;
    const A = anchorOf(npc, night);
    const talking = npc.talking || npc.talkExt > 0;
    const listening = dialogueOpen && npc.dist < 10;        // conversa por perto: todo mundo presta atenção
    npc.moving = false;

    npc.wave = Math.max(0, npc.wave - dt);
    npc.joy = Math.max(0, npc.joy - dt * 2.2);
    npc.followCD -= dt;
    if (npc.danceDelay > 0) { npc.danceDelay -= dt; if (npc.danceDelay <= 0) { npc.danceDelay = 0; npc.dance = 2.4; } }
    else npc.dance = Math.max(0, npc.dance - dt);

    const wantsSleep = (late || npc.traits.napper) && T > npc.awakeUntil && !talking && !listening && !npc.script;
    const dA = Math.hypot(p.x - A.x, p.z - A.z);

    // aceno de "oi!" na primeira passada depois de um tempo
    if (hasQ && npc.dist < GREET && T - npc.lastNear > GREET_AWAY && !npc.sleeping && !talking && !npc.script) {
      npc.wave = 1.9;
      npc.anim.waveT = 0;
      game.audio?.murmur?.(npc.def.voice, 'o');
    }
    if (npc.dist < 12) npc.lastNear = T;

    let goal = null, speed = npc.speed;
    if (npc.script) {
      goal = npc.script;
      speed = npc.script.speed ?? Math.max(npc.speed * 1.4, 1.6);
    } else if (!(talking || npc.dance > 0 || npc.danceDelay > 0 || listening)) {
      const wander = A.y === undefined && npc.rig.gait !== 'none' ? (npc.def.wander ?? 0) : 0;
      if (npc.state === 'follow') {
        npc.followT -= dt;
        const leash = wander + 5;
        if (npc.followT <= 0 || npc.dist > 10 || dA > leash + 0.5 || wantsSleep) {
          npc.state = 'return';
          npc.followCD = 20 + rand() * 20;
        } else if (npc.dist > 2.2) {
          // para a ~1,8 m da Quim, sem passar da coleira
          const k = 1.8 / Math.max(npc.dist, 1e-3);
          let gx = qpos.x + (p.x - qpos.x) * k, gz = qpos.z + (p.z - qpos.z) * k;
          const ga = Math.hypot(gx - A.x, gz - A.z);
          if (ga > leash) { gx = A.x + (gx - A.x) * leash / ga; gz = A.z + (gz - A.z) * leash / ga; }
          goal = { x: gx, z: gz };
          speed = Math.max(speed * 1.6, 2);
        }
      }
      if (npc.state !== 'follow') {
        if (npc.canFollow && !wantsSleep && npc.followCD <= 0 && npc.dist < 6.5 && npc.dist > 2.4 && qSpeed > 1.5 && dA < wander + 2) {
          npc.state = 'follow';
          npc.followT = 3 + rand() * 3.5;
        } else if (npc.state === 'return' || dA > Math.max(1.2, wander + 1.5) || (wantsSleep && dA > 0.6)) {
          npc.state = 'return';
          goal = A;
          if (dA < 0.35) { npc.state = 'idle'; goal = null; npc.timer = 2 + rand() * 4; }
        } else if (npc.state === 'walk' && npc.target) {
          goal = npc.target;
        } else if (!wantsSleep && npc.wave <= 0) {
          npc.timer -= dt;
          if (npc.timer <= 0) {
            npc.timer = 3 + rand() * 6;
            if (wander > 0) { npc.target = pickWander(npc, A); if (npc.target) npc.state = 'walk'; }
          }
        }
      }
    }

    if (goal) {
      const left = step(npc, goal, speed, dt);
      if (npc.script) {
        const s = npc.script;
        s.t = (s.t || 0) + dt;
        if (left < s.best - 0.1) { s.best = left; s.stuck = 0; } else s.stuck = (s.stuck || 0) + dt;
        if (left < 0.25) finishScript(npc, false);
        else if (s.stuck > 2.5) finishScript(npc, true);        // empacou: aparece lá (ninguém viu)
      } else if (npc.state === 'walk' && left < 0.2) {
        npc.state = 'idle';
        npc.target = null;
        npc.timer = 3 + rand() * 6;
      } else if (npc.state === 'walk' && npc.moveSpeed < speed * 0.2) {
        npc.state = 'idle';                                      // trombou em algo: desiste do passeio
        npc.target = null;
      }
    }

    npc.sleeping = wantsSleep && !goal && dA < 1.2;

    // para onde o corpo vira
    const toQ = Math.atan2(qpos.x - p.x, qpos.z - p.z);
    let want = null;
    if (npc.moving) want = npc.moveYaw;
    else if (npc.faceTarget && (T < npc.faceUntil || dialogueOpen)) want = Math.atan2(npc.faceTarget.x - p.x, npc.faceTarget.z - p.z);
    else if (hasQ && !npc.sleeping && (talking || listening || npc.wave > 0 || npc.dance > 0 || npc.state === 'follow' || npc.dist < 4.5)) want = toQ;
    if (want !== null && npc.rig.gait !== 'none') npc.yaw = dampAngle(npc.yaw, want, npc.moving ? 9 : 4.5, dt);
    npc.object.rotation.y = npc.yaw;

    // cabeça e olhos acompanham a Quim
    const lookOn = hasQ && npc.dist < LOOK && !npc.sleeping;
    const a = npc.anim;
    if (lookOn) {
      headWorld(npc, tmp);
      a.headYaw = damp(a.headYaw, angleDiff(npc.yaw + npc.rig.visual.rotation.y, toQ), 7, dt);
      a.headPitch = damp(a.headPitch, -Math.atan2(qhead.y - tmp.y, Math.max(0.5, npc.dist)), 7, dt);
    } else {
      a.headYaw = damp(a.headYaw, 0, 4, dt);
      a.headPitch = damp(a.headPitch, 0, 4, dt);
    }
    const sleepy = Math.max(npc.rig.sleepy ?? 0, a.sleep * 0.95);
    for (const e of npc.rig.eyes) {
      const api = e.userData.eyes;
      api.setSleepy(sleepy);
      api.update(dt);
      if (lookOn || talking) api.lookAtWorld(qhead); else api.lookCenter();
      if (a.sleep > 0.6) for (const c of e.children) c.scale.y = 0.08;   // olhinhos fechados de verdade
    }

    // pesos da animação
    const gaitHz = GAIT_HZ[npc.rig.gait] ?? 9.5;
    const moveTarget = npc.moving ? clamp(npc.moveSpeed / Math.max(0.2, npc.speed), 0.25, 1.3) : 0;
    a.move = damp(a.move, moveTarget, 10, dt);
    a.phase += dt * gaitHz * Math.max(a.move, 0.0001) / Math.sqrt(npc.size);
    a.wave = damp(a.wave, npc.wave > 0.3 ? 1 : 0, 10, dt);
    a.waveT += dt;
    a.dance = damp(a.dance, npc.dance > 0.25 ? 1 : 0, 8, dt);
    a.danceT = a.dance > 0.01 ? a.danceT + dt : 0;
    a.sleep = damp(a.sleep, npc.sleeping ? 1 : 0, npc.sleeping ? 1.5 : 6, dt);
    a.talk = damp(a.talk, talking ? 1 : 0, 6, dt);
    a.joy = npc.joy;
    a.t = T;
    animateRig(npc.rig, a, dt);
  }

  // ----------------------------------------------------------------------------------------------
  // Marcadores, "Zz" e plaquinha

  function hideHud(npc) {
    npc.markerSprite.visible = false;
    npc.zz.visible = false;
    npc.plate.visible = false;
    npc.plateOp = 0;
  }

  function updateHud(npc, dt) {
    const p = npc.position, r = npc.rig, s = npc.size;
    const top = p.y + (r.top + r.visual.position.y) * s;
    const talking = npc.talking || npc.talkExt > 0;

    // plaquinha com o nome
    const wantPlate = npc === nearestNpc && !talking && !dialogueOpen;
    npc.plateOp = damp(npc.plateOp, wantPlate ? 1 : 0, 8, dt);
    const pl = npc.plate;
    pl.visible = npc.plateOp > 0.02;
    pl.material.opacity = npc.plateOp;
    pl.position.set(p.x, top + 0.12, p.z);
    const plateH = pl.visible ? pl.scale.y + 0.08 : 0;

    // marcador de missão
    const m = npc.markerSprite;
    const life = T - npc.markerT;
    const heart = npc.marker === '♥';
    if (npc.marker && !(heart && life > HEART_LIFE)) {
      m.visible = true;
      m.setKind(npc.marker);
      const far = clamp(npc.dist / 13, 1, 3.4);                 // continua legível de longe
      const pop = easeOutBack(clamp(life * 2.8, 0, 1));
      const pulse = npc.marker === '!' ? 1 + 0.1 * Math.sin(T * 6) : heart ? 1 + 0.08 * Math.sin(T * 9) : 1 + 0.04 * Math.sin(T * 3);
      const k = 0.62 * far * pulse * Math.max(0.01, pop);
      m.scale.set(k, k * 1.25, 1);
      m.material.opacity = heart ? clamp((HEART_LIFE - life) / 1.2, 0, 1) : 1;
      m.position.set(p.x, top + 0.18 + plateH * npc.plateOp + Math.sin(T * 2.4 + r.seed) * 0.08 + (heart ? Math.min(life, 2) * 0.15 : 0), p.z);
    } else m.visible = false;

    // Zz de quem dorme
    const zz = npc.zz;
    zz.visible = npc.anim.sleep > 0.6;
    if (zz.visible) {
      const cyc = (T * 0.45 + r.seed) % 1;
      const k = 0.55 * clamp(Math.sqrt(s), 0.8, 1.4) * (0.7 + cyc * 0.5);
      zz.scale.set(k, k * 1.25, 1);
      zz.position.set(p.x + 0.15 * s, top + cyc * 0.5, p.z);
      zz.material.opacity = Math.sin(cyc * Math.PI);
    }
  }

  // ----------------------------------------------------------------------------------------------
  // Laço principal

  function update(dt) {
    T += dt;
    const pp = game.player?.position;
    if (pp) {
      qSpeed = hasQ ? Math.hypot(pp.x - lastQ.x, pp.z - lastQ.z) / Math.max(dt, 1e-4) : 0;
      lastQ.copy(pp);
      qpos.copy(pp);
      hasQ = true;
    }
    qhead.set(qpos.x, qpos.y + 0.95, qpos.z);

    flagTimer -= dt;
    if (flagTimer <= 0) { flagTimer = 0.5; refreshVisibility(); }
    const night = isNight(), late = isLate();

    // só o morador mais pertinho mostra a plaquinha com o nome
    nearestNpc = null;
    let best = NAME;
    for (const npc of list) if (npc.visible && npc.dist < best && !npc.sleeping) { best = npc.dist; nearestNpc = npc; }

    for (const npc of list) {
      npc.dist = hasQ ? Math.hypot(npc.position.x - qpos.x, npc.position.z - qpos.z) : 0;
      if (!npc.visible) { npc.active = false; continue; }
      npc.object.visible = npc.dist < VISIBLE;
      npc.active = npc.dist < ACTIVE;
      if (!npc.active) {
        hideHud(npc);
        if (npc.script) finishScript(npc, true);
        continue;
      }
      if (T - npc.lastActive > 1.5) {
        // volta a ser simulado depois de um tempo longe: já aparece onde "deveria" estar
        const A = anchorOf(npc, night);
        placeAt(npc, A.x, A.z, A.y);
        npc.state = 'idle';
        npc.target = null;
        npc.dist = hasQ ? Math.hypot(npc.position.x - qpos.x, npc.position.z - qpos.z) : 0;
      }
      npc.lastActive = T;
      think(npc, dt, night, late);
      updateHud(npc, dt);
    }
  }

  // ----------------------------------------------------------------------------------------------
  // API

  function applyState() {
    const night = isNight();
    for (const npc of list) {
      if (npc.script) { const s = npc.script; npc.script = null; s.resolve(false); }
      npc.anchor = { x: npc.def.x, z: npc.def.z };
      npc.scripted = false;
      npc.override = null;
      npc.marker = null;
      npc.faceTarget = null;
      npc.talking = false;
      npc.talkExt = 0;
      npc.busy = false;
      npc.state = 'idle';
      npc.target = null;
      npc.wave = npc.dance = npc.danceDelay = npc.joy = 0;
      npc.awakeUntil = 0;
      npc.lastNear = -1e9;
      npc.lastActive = -1e9;
      npc.yaw = npc.def.rotY ?? 0;
      const A = anchorOf(npc, night);
      placeAt(npc, A.x, A.z, A.y);
    }
    refreshVisibility();
  }

  function setMarker(id, m) {
    const npc = byId.get(id);
    if (!npc) return;
    const k = m || null;
    if (npc.marker !== k) npc.markerT = T;
    npc.marker = k;
  }

  function moveTo(id, x, z, opts = {}) {
    const npc = byId.get(id);
    if (!npc) return Promise.resolve(false);
    if (npc.script) finishScript(npc, true);
    return new Promise((resolve) => {
      npc.script = { x, z, y: opts.y, speed: opts.speed, resolve, best: Infinity, stuck: 0 };
      npc.state = 'idle';
      npc.target = null;
      if (!npc.visible || !npc.active) finishScript(npc, true);   // ninguém está olhando: chega na hora
    });
  }

  function place(id, x, z, y) {
    const npc = byId.get(id);
    if (!npc) return;
    if (npc.script) finishScript(npc, true);
    npc.anchor = y === undefined ? { x, z } : { x, z, y };
    npc.scripted = true;
    npc.state = 'idle';
    npc.target = null;
    placeAt(npc, x, z, y);
  }

  function setVisible(id, v) {
    const npc = byId.get(id);
    if (!npc) return;
    npc.override = v === null || v === undefined ? null : !!v;
    refreshVisibility();
  }

  function face(id, worldPos) {
    const npc = byId.get(id);
    if (!npc) return;
    npc.faceTarget = worldPos ? { x: worldPos.x, z: worldPos.z } : null;
    npc.faceUntil = T + 6;
  }

  applyState();

  return {
    list,
    get: (id) => byId.get(id) ?? null,
    update,
    applyState,
    setMarker,
    moveTo,
    setVisible,
    face,
    speak,
    place,
    group,
  };
}
