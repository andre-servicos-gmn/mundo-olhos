// Quim: controle (movimento relativo à câmera, pulo com coyote/buffer, planar), física simples sobre
// world.groundAt, interação (E), sons, sono quando parada e estado para os outros sistemas.
// API em docs/ARQUITETURA.md (player). O modelo e as animações ficam em quim-model.js.
import * as THREE from 'three';
import { SPAWN } from '../data/worldmap.js';
import { clamp, damp, smoothstep } from '../core/util.js';
import { createQuimModel, EMOTE_DUR } from './quim-model.js';
import { createPlayerFX } from './fx.js';

const WALK = 4.5, RUN = 8;
const ACC_GROUND = 30, DEC_GROUND = 24, ACC_AIR = 11, DRAG_AIR = 1.5;
const JUMP_H = 1.68, G_UP = 20, G_DOWN = 27, G_CUT = 2.6;   // G_CUT: soltou o Espaço subindo = pulo baixo
const JUMP_V = Math.sqrt(2 * G_UP * JUMP_H);
const GLIDE_FALL = 1.5, GLIDE_SPEED = 6.2;
const COYOTE = 0.12, BUFFER = 0.15, MAX_FALL = 32;
const RADIUS = 0.32, SNAP_DOWN = 0.4;
const DROWSY_FROM = 13, SLEEP_AFTER = 20;
const BOUNCE_H = 2.3;                                        // trampolim: altura = bounce × 2,3 (2,2 → ~5 m)

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function createPlayer(game) {
  const model = createQuimModel();
  const object = model.root;
  game.render.scene.add(object);
  const fx = createPlayerFX(game.render.scene);

  const position = new THREE.Vector3(SPAWN.x, 0, SPAWN.z);
  const velocity = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const lookTmp = new THREE.Vector3();
  let rotY = SPAWN.rotY ?? 0;
  let onGround = true, gliding = false, bounced = false;
  let state = 'idle';
  let coyote = 0, buffer = 0, airT = 0, turnRate = 0, stepOffset = 0;
  let sit = null;                  // null | 'banco' | 'chao' (cochilo)
  let emote = null;                // { name, t, dur, resolve, said }
  let talking = false;
  let carrying = null, carryPrevParent = null;
  let lookTarget = null;           // Vector3 explícito (lookAt)
  let faceTarget = null;           // {x,y,z} de quem ela foi falar
  let autoLook = null;
  let idleT = 0, runT = 0, joyT = 0, moodT = 0, baseMood = 'feliz';
  let voiceCd = 0, stepCd = 0, gateCd = 0, time = 0;
  let wading = false;              // pisando na água rasa (rio): mais devagar e com respingos
  let prompt;                      // último texto enviado ao ui.setPrompt
  let lastEquipped;
  let carryShake = 0;

  // Dados que o modelo lê para animar.
  const anim = {
    speed: 0, grounded: true, vy: 0, glide: false, sit: null, emote: null, carrying: false, lookTarget: null,
    talk: false, turnRate: 0, landImpact: 0, jumpImpulse: 0, drowsy: 0, stepOffset: 0, joy: false, snap: true,
  };

  // --- consultas ao mundo (tudo opcional, para funcionar em testes) ---------------------------------
  const groundRes = { y: 0, surface: null, bounce: 0 };
  function ground(x, z, y) {
    const w = game.world;
    const g = w?.groundAt ? w.groundAt(x, z, y) : null;
    if (g) {
      groundRes.y = g.y;
      groundRes.surface = g.surface ?? null;
      const b = g.bounce ?? g.surface?.bounce ?? 0;
      groundRes.bounce = b === true ? 2.2 : Number(b) || 0;
    } else {
      groundRes.y = w?.getHeight ? w.getHeight(x, z) : 0;
      groundRes.surface = null;
      groundRes.bounce = 0;
    }
    return groundRes;
  }
  const terrain = (x, z) => (game.world?.getHeight ? game.world.getHeight(x, z) : ground(x, z, 1e4).y);
  /** Água sem plataforma por cima. (Água funda dos lagos: o world.resolveCollision devolve para a margem.) */
  function wet(x, z, y) {
    if (!game.world?.isWater?.(x, z)) return false;
    return !ground(x, z, y).surface;
  }
  function cameraYaw() {
    const y = game.cameraRig?.yaw;
    if (typeof y === 'number') return y;
    game.render.camera.getWorldDirection(tmp);
    return Math.atan2(-tmp.x, -tmp.z);
  }
  function voice(name, cd = 2.5, force = false) {
    if (!force && voiceCd > 0) return;
    voiceCd = cd;
    game.audio?.quimVoice?.(name);
  }
  function setPrompt(p) {
    if (p === prompt) return;
    prompt = p;
    game.ui?.setPrompt?.(p);
  }

  // Passos: o modelo avisa a cada pisada do ciclo de caminhada.
  model.onStep = () => {
    const hs = Math.hypot(velocity.x, velocity.z);
    if (!onGround || hs < 1 || stepCd > 0) return;
    stepCd = 0.1;
    if (wading) {
      fx.puff(position.x, position.y, position.z, 2, 0.6, 'agua');
      if (Math.random() < 0.35) game.audio?.play?.('agua');
      return;
    }
    game.audio?.play?.('passo');
    if (hs > WALK + 1 && Math.random() < 0.5) {
      fx.puff(position.x - Math.sin(rotY) * 0.2, position.y, position.z - Math.cos(rotY) * 0.2, 2, 0.45);
    }
  };

  game.bus?.on('dialogue:open', () => { talking = true; });
  game.bus?.on('dialogue:close', () => { talking = false; faceTarget = null; });
  game.bus?.on('jujuba:collect', () => { joyT = 0.7; });
  game.bus?.on('region:enter', () => { if (!sit && !talking) setMood('curiosa', 1.8); });

  // --- ações ---------------------------------------------------------------------------------------
  function jump(v, isBounce) {
    velocity.y = v;
    onGround = false;
    coyote = 0; buffer = 0; airT = 0;
    bounced = isBounce;
    anim.jumpImpulse = isBounce ? 4 : 2.4;
    game.audio?.play?.('pulo');
    if (isBounce) voice('uii', 1.5, true);
    else if (Math.random() < 0.33) voice('uii', 3);
    if (!isBounce) fx.puff(position.x, position.y, position.z, 3, 0.5);
    game.bus?.emit('player:jump', { x: position.x, y: position.y, z: position.z, bounce: isBounce });
  }

  function land(impact, gy, bounce) {
    anim.landImpact = impact;
    if (impact > 3.5) fx.puff(position.x, gy, position.z, impact > 12 ? 10 : 6, clamp(impact / 10, 0.5, 1.6));
    if (impact > 7) game.audio?.play?.('aterrissar');
    if (impact > 18) { game.cameraRig?.shake?.(0.3); voice('oh', 3); }
    game.bus?.emit('player:land', { x: position.x, y: gy, z: position.z, impact });
    if (bounce > 0) {
      position.y = gy;
      jump(Math.sqrt(2 * G_UP * BOUNCE_H * bounce), true);
      return true;
    }
    return false;
  }

  function endEmote() {
    if (!emote) return;
    const e = emote;
    emote = null;
    e.resolve?.(true);
    if (e.name === 'bocejo' && !sit && onGround) {   // depois do bocejo, senta e cochila
      sit = 'chao';
      setMood('sono');
    }
  }

  function setMood(m, seconds) {
    if (seconds > 0) {
      moodT = seconds;
    } else {
      baseMood = m;
      moodT = 0;
    }
    model.setMood(m);
  }

  function wakeUp() {
    setMood(baseMood === 'sono' ? 'feliz' : baseMood);
    setMood('surpresa', 0.7);
    voice('oh', 2, true);
  }

  function standUp() {
    if (!sit) return;
    if (sit === 'banco') {
      position.x += Math.sin(rotY) * 0.55;
      position.z += Math.cos(rotY) * 0.55;
      position.y = ground(position.x, position.z, position.y + 0.1).y;
    }
    if (sit === 'chao' && baseMood === 'sono') baseMood = 'feliz';
    sit = null;
    onGround = true;
    velocity.set(0, 0, 0);
    idleT = 0;
  }

  function syncAccessory() {
    const eq = game.state?.accessories?.equipped ?? null;
    if (eq !== lastEquipped) { lastEquipped = eq; model.setAccessory(eq); }
  }

  // --- quadro ----------------------------------------------------------------------------------------
  function update(dt) {
    if (!(dt > 0)) return;
    time += dt;
    voiceCd -= dt; stepCd -= dt; gateCd -= dt;
    syncAccessory();
    if (moodT > 0 && (moodT -= dt) <= 0) model.setMood(baseMood);
    if (joyT > 0) joyT -= dt;

    const inp = game.input;
    const blocked = !!game.cinematic || !inp || !inp.enabled;
    let ax = 0, ay = 0, runKey = false, jumpPressed = false, jumpDown = false, ePressed = false;
    if (!blocked) {
      const a = inp.axis();
      ax = a.x; ay = a.y;
      runKey = inp.isDown('ShiftLeft') || inp.isDown('ShiftRight');
      jumpPressed = inp.wasPressed('Space');
      jumpDown = inp.isDown('Space');
      ePressed = inp.wasPressed('KeyE');
    }
    const moveInput = ax !== 0 || ay !== 0;

    // Sentada: movimento, pulo ou E levantam (e o E não interage neste quadro).
    if (sit) {
      if (!blocked && (moveInput || jumpPressed || ePressed)) {
        const dozing = sit === 'chao';
        standUp();
        if (dozing) wakeUp();
        jumpPressed = false; ePressed = false;
      } else {
        velocity.set(0, 0, 0);
        setPrompt(null);
        return finish(dt);
      }
    }

    if (emote) {
      emote.t += dt;
      if (emote.name === 'cheirar' && !emote.said && emote.t > 1.45) { emote.said = true; voice('hmm', 1, true); }
      if ((moveInput && emote.name !== 'acenar') || jumpPressed || emote.t >= emote.dur) endEmote();
    }

    // --- movimento horizontal relativo à câmera ---
    const yaw = cameraYaw();
    let dx = -Math.sin(yaw) * ay + Math.cos(yaw) * ax;
    let dz = -Math.cos(yaw) * ay - Math.sin(yaw) * ax;
    const dl = Math.hypot(dx, dz);
    if (dl > 1) { dx /= dl; dz /= dl; }
    const hasDir = dl > 0.01;

    coyote = onGround ? COYOTE : coyote - dt;
    buffer = jumpPressed ? BUFFER : Math.max(0, buffer - dt);
    if (buffer > 0 && coyote > 0) jump(JUMP_V, false);

    gliding = !onGround && velocity.y < 0 && jumpDown && !!game.state?.pincesoJoined && airT > 0.12;
    const maxSp = gliding ? GLIDE_SPEED : (runKey ? RUN : WALK) * (wading ? 0.7 : 1);
    const rate = onGround ? (hasDir ? ACC_GROUND : DEC_GROUND) : (hasDir ? ACC_AIR : DRAG_AIR);
    let ddx = dx * maxSp - velocity.x, ddz = dz * maxSp - velocity.z;
    const dd = Math.hypot(ddx, ddz), step = rate * dt;
    if (dd > step) { ddx *= step / dd; ddz *= step / dd; }
    velocity.x += ddx; velocity.z += ddz;
    const hs = Math.hypot(velocity.x, velocity.z);

    // "hmm?" quando para de repente depois de correr
    if (hs > RUN - 1.5) runT += dt;
    else if (!hasDir && hs < 1.2 && runT > 0.6 && onGround) {
      runT = 0;
      if (Math.random() < 0.55) { voice('hmm', 6); setMood('curiosa', 1.3); }
    } else if (hs < 1.2) runT = 0;

    // --- rotação suave ---
    let wantRot = null;
    if (hasDir) wantRot = Math.atan2(dx, dz);
    else if (faceTarget && talking) wantRot = Math.atan2(faceTarget.x - position.x, faceTarget.z - position.z);
    if (wantRot !== null) {
      const turn = wrapAngle(wantRot - rotY) * (1 - Math.exp(-(onGround ? 14 : 7) * dt));
      rotY = wrapAngle(rotY + turn);
      turnRate = damp(turnRate, turn / dt, 10, dt);
    } else turnRate = damp(turnRate, 0, 10, dt);

    // --- gravidade (pulo variável, planar) ---
    if (gliding) {
      velocity.y = damp(velocity.y, -GLIDE_FALL, 6, dt);     // "paraquedas" de cachinhos: freia suave
    } else if (!onGround) {
      const g = velocity.y > 0 ? G_UP * (jumpDown || bounced ? 1 : G_CUT) : G_DOWN;
      velocity.y = Math.max(velocity.y - g * dt, -MAX_FALL);
    }

    // --- move em XZ e resolve colisões ---
    const ox = position.x, oz = position.z, oy = position.y;
    position.x += velocity.x * dt;
    position.z += velocity.z * dt;
    game.world?.resolveCollision?.(position, RADIUS);

    // bloqueios suaves (névoa/vento): não deixa entrar, mas não prende quem já está dentro
    const gate = game.world?.gateBlocked?.(position.x, position.z);
    if (gate && !game.world.gateBlocked(ox, oz)) {
      position.x = ox; position.z = oz;
      const nx = ox - gate.x, nz = oz - gate.z, nl = Math.hypot(nx, nz) || 1;
      const vn = (velocity.x * nx + velocity.z * nz) / nl;
      if (vn < 0) { velocity.x -= (vn * nx) / nl * 1.4; velocity.z -= (vn * nz) / nl * 1.4; }
      if (gateCd <= 0 && gate.message) { gateCd = 6; game.ui?.toast?.(gate.message, '🌫️'); voice('hmm', 3); }
    }

    // --- chão / plataformas ---
    const gr = ground(position.x, position.z, oy);
    const gy = gr.y, bounce = gr.bounce;
    const ny = oy + velocity.y * dt;
    const wasGround = onGround;
    if (velocity.y <= 0 && ny <= gy) {
      const impact = -velocity.y;
      position.y = gy;
      velocity.y = 0;
      onGround = true;
      if (!wasGround || bounce > 0) land(impact, gy, bounce);   // aterrissou (ou pisou num trampolim)
      else if (gy > oy) stepOffset -= gy - oy;                  // subiu um degrau: suaviza no visual
    } else if (wasGround && velocity.y <= 0 && gy <= oy && oy - gy <= SNAP_DOWN) {
      position.y = gy;                                    // descendo ladeira: gruda no chão
      velocity.y = 0;
    } else {
      position.y = ny;
      onGround = false;
    }
    airT = onGround ? 0 : airT + dt;
    if (onGround) bounced = false;

    // segurança: nunca abaixo do terreno
    const th = terrain(position.x, position.z);
    if (position.y < th - 0.5) { position.y = th; velocity.y = 0; onGround = true; }

    // água rasa: anda mais devagar e respinga (o respingo da entrada é maior)
    const nowWet = onGround && wet(position.x, position.z, position.y + 0.1);
    if (nowWet && !wading) {
      fx.puff(position.x, position.y, position.z, 7, 1, 'agua');
      game.audio?.play?.('agua');
    }
    wading = nowWet;

    // --- interação (E) ---
    autoLook = null;
    if (!blocked) {
      const it = game.interactables?.nearest(position);
      setPrompt(it ? 'E: ' + it.label : null);
      if (it) autoLook = it.getPosition();
      if (ePressed && it) {
        const p = it.getPosition();
        faceTarget = { x: p.x, y: p.y ?? position.y, z: p.z };
        endEmote();
        try { it.onInteract(game); } catch (e) { console.error('[player] erro ao interagir', e); }
      }
    } else setPrompt(null);

    // --- sono quando fica parada ---
    const idleNow = onGround && !moveInput && !emote && !talking && !carrying && !blocked && hs < 0.3;
    idleT = idleNow ? idleT + dt : 0;
    if (idleT > SLEEP_AFTER) {
      idleT = 0;
      startEmote('bocejo');
      voice('bocejo', 4, true);
    }

    finish(dt);
  }
  function finish(dt) {
    const hs = Math.hypot(velocity.x, velocity.z);
    state = sit ? 'sit' : talking ? 'talk' : !onGround ? (gliding ? 'glide' : 'jump')
      : hs > (WALK + RUN) / 2 ? 'run' : hs > 0.3 ? 'walk' : 'idle';

    object.position.copy(position);
    object.rotation.y = rotY;

    anim.speed = sit ? 0 : hs;
    anim.grounded = onGround || !!sit;
    anim.vy = velocity.y;
    anim.glide = gliding;
    anim.sit = sit;
    anim.emote = emote;
    anim.carrying = !!carrying;
    anim.talk = talking;
    anim.turnRate = turnRate;
    anim.drowsy = sit === 'chao' ? 1 : smoothstep(DROWSY_FROM, SLEEP_AFTER, idleT);
    anim.joy = joyT > 0;
    stepOffset = damp(stepOffset, 0, 14, dt);
    anim.stepOffset = stepOffset;
    let look = lookTarget;
    if (!look && talking && faceTarget) look = lookTmp.set(faceTarget.x, faceTarget.y + 0.9, faceTarget.z);
    else if (!look && autoLook) look = lookTmp.set(autoLook.x, (autoLook.y ?? position.y) + 0.8, autoLook.z);
    anim.lookTarget = look;
    model.update(dt, anim);
    anim.landImpact = 0;
    anim.jumpImpulse = 0;
    anim.snap = false;

    // objeto carregado balança se ela corre (missões frágeis podem ler player.carryShake)
    if (carrying) {
      const k = onGround ? smoothstep(WALK, RUN, hs) : 0.4;
      carryShake = damp(carryShake, k, 6, dt);
      model.carryAnchor.rotation.set(Math.sin(time * 9) * 0.1 * carryShake, 0, Math.sin(time * 13) * 0.16 * carryShake);
    } else carryShake = 0;

    const g = ground(position.x, position.z, position.y + 0.05);
    fx.setBlob(position.x, g.y, position.z, position.y - g.y);
    fx.update(dt);
    game.render.shadowTarget?.copy(position);
  }

  function startEmote(name, resolve) {
    if (emote) endEmote();
    emote = { name, t: 0, dur: EMOTE_DUR[name], resolve, said: false };
  }

  // --- API pública -------------------------------------------------------------------------------
  const player = {
    object,
    position,
    velocity,
    model,
    headAnchor: model.headAnchor,      // topo do cabelo (onde o Pinceso pousa)
    get rotY() { return rotY; },
    set rotY(v) { rotY = v; object.rotation.y = v; },
    get onGround() { return onGround; },
    get state() { return state; },
    get carrying() { return carrying; },
    get carryShake() { return carryShake; },
    get mood() { return model.mood; },
    update,

    applyState() {
      const p = game.state?.player;
      const fresh = !p || (!p.x && !p.z && !p.y);
      const x = fresh ? SPAWN.x : p.x, z = fresh ? SPAWN.z : p.z;
      position.set(x, 0, z);
      position.y = fresh || p.y === undefined ? terrain(x, z) : ground(x, z, p.y + 0.1).y;
      rotY = fresh ? (SPAWN.rotY ?? 0) : (p.rotY ?? 0);
      velocity.set(0, 0, 0);
      onGround = true; sit = null; emote = null; idleT = 0;
      lastEquipped = undefined;
      syncAccessory();
      anim.snap = true;
      model.resetMotion();
      finish(1 / 60);
    },

    teleport(x, z, ry) {
      position.set(x, terrain(x, z), z);
      if (ry !== undefined) rotY = ry;
      velocity.set(0, 0, 0);
      onGround = true; sit = null; idleT = 0; wading = false;
      anim.snap = true;
      model.resetMotion();
      finish(1 / 60);
      game.cameraRig?.snap?.();
    },

    setAccessory(id) {
      const v = id || null;
      if (game.state?.accessories) game.state.accessories.equipped = v;
      lastEquipped = v;
      model.setAccessory(v);
    },

    /** mood: 'feliz'|'surpresa'|'triste'|'curiosa'|'sono'. seconds (opcional): volta ao humor anterior depois. */
    setMood,

    carry(obj) {
      if (carrying === obj) return;
      if (carrying) {
        if (carryPrevParent) carryPrevParent.attach(carrying);
        else carrying.removeFromParent();
      }
      carrying = obj || null;
      carryPrevParent = null;
      if (obj) {
        carryPrevParent = obj.parent || game.render.scene;
        model.carryAnchor.add(obj);
        obj.position.set(0, 0, 0);
        obj.rotation.set(0, 0, 0);
      }
    },

    sitAt(pos, ry) {
      endEmote();
      sit = 'banco';
      position.set(pos.x, pos.y ?? terrain(pos.x, pos.z), pos.z);
      if (ry !== undefined) rotY = ry;
      velocity.set(0, 0, 0);
      onGround = true;
      finish(1 / 60);
    },
    standUp,

    lookAt(p) { lookTarget = p ? new THREE.Vector3(p.x, p.y ?? position.y + 0.9, p.z) : null; },

    /** 'acenar'|'pular_feliz'|'cheirar' (e 'bocejo'). Resolve quando termina. */
    emote(name) {
      if (!EMOTE_DUR[name] || sit) return Promise.resolve(false);
      return new Promise((res) => {
        startEmote(name, res);
        if (name === 'pular_feliz') voice('risadinha', 2, true);
        if (name === 'acenar') voice('eba', 3);
      });
    },
  };
  return player;
}
