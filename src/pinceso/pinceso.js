// O Pinceso: periquito verde-limão, companheiro (e "guarda-costas oficial") da Quim.
// createPinceso(game) -> { object, mode, update(dt), applyState(), setMode(modo, opts), flyTo(pos, seconds?) -> Promise,
//                          join() -> Promise, search(), emote(icone, segundos?) }
//
// Modos (setMode):
//   'hidden'                       invisível (antes de entrar na história)
//   'trapped'  { x, y?, z }        preso nos cipós (y = chão do ponto): se debate e pia triste de tempos em tempos
//   'fleeing'  { points:[{x,y?,z}] } voa até o 1º ponto e fica arisco: se a Quim chega perto, foge para o próximo;
//                                  no último ponto ele fica (tremendo) esperando
//   'perched'  { x, y?, z, rotY?, cafe? }  pousado num ponto (voa até lá se estiver por perto). cafe: true mostra o
//                                  dedalzinho de minicafé e ele fica bebericando (cafeteria)
//   'follow'                       acompanha a Quim (depois de join())
//   'scripted' { x?, y?, z? }      parado; só obedece flyTo
// flyTo em modo 'follow' é um desvio temporário: ele voa, fica ~1 s lá e volta para a cabeça da Quim.
// Em qualquer outro modo, flyTo passa para 'scripted' e ele fica no destino (pousado se houver chão, senão pairando).
import * as THREE from 'three';
import { clamp, damp, lerp, smoothstep } from '../core/util.js';
import { createPincesoModel } from './model.js';
import { createBubble } from './bubble.js';
import { createFx } from './fx.js';

const MODES = ['hidden', 'trapped', 'fleeing', 'perched', 'follow', 'scripted'];
const HEAD_FALLBACK_Y = 1.3;        // se o player não expõe headAnchor
// poleiro nos cachos: um pouquinho de lado (à esquerda dela) e atrás do cacho "antena" do topo, afundado no cabelo
const PERCH_OFFSET = new THREE.Vector3(0.095, -0.05, -0.03);
const HAT_LIFT = { chapeu: 0.17 };  // acessórios que levantam o "poleiro"
const HAIR_COLOR = '#5b3122';       // cor do cabelo da Quim (fio que ele segura ao planar)
const FLEE_DIST = 7;                // a Quim chegou perto demais: foge!
const SEARCH_RADIUS = 60;
const IDLE_PREEN = 8, IDLE_SLEEP = 14;
const HINT_AFTER = 60, HINT_FAR = 25;
const TRAP_LIFT = 0.3;              // no cipó ele fica pendurado um pouco acima do chão

const HINT_LINES = [
  'Psiu! É pra lá, ó! Confia no guarda-costas.',
  'Ei, ei! Meu bico tá apontando pra lá. Bico não mente!',
  'Eu sei o caminho. Eu sempre sei. Quase sempre. É pra lá!',
  'Acho que a gente tá enrolando... A missão fica pra lá!',
];

const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const dampAngle = (a, b, lambda, dt) => a + angleDiff(b, a) * (1 - Math.exp(-lambda * dt));
const easeInOut = (k) => k * k * (3 - 2 * k);

export function createPinceso(game) {
  const scene = game.render.scene;
  const model = createPincesoModel();
  const object = model.root;
  object.visible = false;
  scene.add(object);

  function groundY(x, z, y = Infinity) {
    const w = game.world;
    let g = w?.getHeight ? w.getHeight(x, z) : 0;
    if (w?.groundAt && Number.isFinite(y)) {
      const s = w.groundAt(x, z, y);
      if (s && s.y > g) g = s.y;
    }
    return g;
  }

  const bubble = createBubble(scene);
  const fx = createFx(scene, (x, z) => groundY(x, z));

  // fio de cabelo que ele puxa com o bico enquanto a Quim plana
  const strand = new THREE.Mesh(
    new THREE.CylinderGeometry(0.008, 0.016, 1, 6).translate(0, 0.5, 0),
    new THREE.MeshToonMaterial({ color: HAIR_COLOR }),
  );
  strand.visible = false;
  strand.castShadow = false;
  scene.add(strand);

  // ---- estado ----
  let mode = 'hidden';
  let act = 'idle';                 // sub-estado dentro do modo
  let actT = 0;
  const pos = new THREE.Vector3();
  const vel = new THREE.Vector3();
  let yaw = 0, pitch = 0, roll = 0, lastYaw = 0;
  let headBlend = 0;                // 0 = orientação própria, 1 = grudado na cabeça da Quim
  let standing = true;
  let hoverHere = false;            // pairando parado (sem chão embaixo)
  let flight = null;                // voo do flyTo { to, from, ctrl, dur, t, resolve }
  let opts = {};
  let fleePts = [], fleeIdx = 0, fleeFlying = false;
  let perchFlying = false;
  let search = null;                // { x, y, z, kind, phase, t, ang }
  let hint = null;                  // { dx, dz, t, shown }
  let idleT = 0, sleeping = false, sleepEmoteT = 0;
  let hopT = -1, mimicCD = 0, voiceCD = 0, cryT = 1.5, sparkT = 0;
  let progressT = 0, hintCheckT = 0, hintCount = 0;
  let lookT = 0, lookCam = false;
  let pendingJoinHeart = false;
  let lastPlayerPos = null;
  const landWaiters = [];
  let time = 0;

  const anim = { fly: 0, flapSpeed: 9, flapAmp: 1, pull: 0, sleep: 0, preen: 0, struggle: 0, nervous: 0, sip: 0, point: 0, hop: 0, happy: 0, lookAt: null };
  const lookTarget = new THREE.Vector3();
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  const anchorPos = new THREE.Vector3();
  const anchorQuat = new THREE.Quaternion();
  const qOwn = new THREE.Quaternion();
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const bubblePos = new THREE.Vector3();
  const prevPos = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);

  // ---------------------------------------------------------------------------------------------
  // Ajudantes

  /** cd = 0: fala importante (ignora o intervalo mínimo entre piados). */
  function voice(name, cd = 0.35) {
    if (cd > 0 && voiceCD > 0) return;
    voiceCD = Math.max(voiceCD, cd);
    model.chirp();
    try { game.audio?.pincesoVoice?.(name); } catch (e) { console.error('[pinceso] voz', e); }
  }

  function emote(icon, seconds = 2) {
    bubble.show(icon, seconds);
  }

  /** Ponto de pouso na cabeça da Quim (mundo) + orientação da cabeça dela. */
  function readAnchor() {
    const pl = game.player;
    if (!pl) return false;
    const a = pl.headAnchor;
    if (a) {
      a.updateWorldMatrix(true, false);
      a.getWorldPosition(anchorPos);
      a.getWorldQuaternion(anchorQuat);
    } else {
      pl.object.updateWorldMatrix(true, false);
      anchorPos.set(0, HEAD_FALLBACK_Y, 0);
      pl.object.localToWorld(anchorPos);
      pl.object.getWorldQuaternion(anchorQuat);
    }
    const acc = pl.model?.accessoryId ?? game.state?.accessories?.equipped;
    tmp.copy(PERCH_OFFSET);
    tmp.y += HAT_LIFT[acc] || 0;
    tmp.applyQuaternion(anchorQuat);
    anchorPos.add(tmp);
    return true;
  }

  function quimHead(out) {
    const p = game.player?.position;
    return p ? out.set(p.x, p.y + 1.0, p.z) : null;
  }

  function quimDist() {
    const p = game.player?.position;
    return p ? Math.hypot(p.x - pos.x, p.z - pos.z) : Infinity;
  }

  function keepAboveGround(clear) {
    const g = groundY(pos.x, pos.z, pos.y);
    if (pos.y < g + clear) { pos.y = g + clear; if (vel.y < 0) vel.y = 0; }
  }

  /** Não deixa o Pinceso entrar na cabeça/corpo da Quim enquanto voa. */
  function avoidQuim() {
    const p = game.player?.position;
    if (!p) return;
    tmp.set(pos.x - p.x, pos.y - (p.y + 0.78), pos.z - p.z);
    const d = tmp.length(), r = 0.42;
    if (d < r) {
      if (d < 1e-4) tmp.set(0, 1, 0); else tmp.divideScalar(d);
      pos.set(p.x, p.y + 0.78, p.z).addScaledVector(tmp, r);
    }
    // corpo (cilindro até a altura do ombro)
    const hd = Math.hypot(pos.x - p.x, pos.z - p.z);
    if (pos.y < p.y + 0.75 && hd < 0.32) {
      const k = hd < 1e-4 ? 1 : 0.32 / hd;
      pos.x = p.x + (pos.x - p.x || 0.32) * k;
      pos.z = p.z + (pos.z - p.z) * k;
    }
  }

  /**
   * Voo com "mola": velocidade desejada aponta para o alvo, desacelera ao chegar.
   * Em voos longos sobe para uma altitude de cruzeiro acima do terreno (passa por cima das coisas).
   * o: { speed, accel, arrive, lead: Vector3 (velocidade do alvo), cruise, cruiseH, clear }
   */
  function steer(dt, tx, ty, tz, o = {}) {
    const speed = o.speed ?? 9, accel = o.accel ?? 5, arrive = o.arrive ?? 1.8;
    tmp.set(tx - pos.x, ty - pos.y, tz - pos.z);
    const hd = Math.hypot(tmp.x, tmp.z);
    const d = tmp.length();
    if (o.cruise !== false && hd > 6) {
      const ahead = Math.min(hd, 9);
      const ax = pos.x + (tmp.x / hd) * ahead, az = pos.z + (tmp.z / hd) * ahead;
      const cruiseY = Math.max(groundY(ax, az), groundY(pos.x, pos.z)) + (o.cruiseH ?? 3.2);
      tmp.y = lerp(tmp.y, Math.max(cruiseY, ty) - pos.y, smoothstep(6, 14, hd));
    }
    const len = tmp.length();
    if (len > 1e-5) tmp.multiplyScalar((speed * Math.min(1, d / arrive)) / len);
    if (o.lead) tmp.add(o.lead);
    vel.lerp(tmp, 1 - Math.exp(-accel * dt));
    pos.addScaledVector(vel, dt);
    keepAboveGround(d < 1 ? 0 : (o.clear ?? 0.25));
    standing = false;
    return d;
  }

  function takeOff(boost = 2.2) {
    vel.y = Math.max(vel.y, boost);
    model.squash(-0.3);
    standing = false;
  }

  function touchDown(strength = 0.35) {
    vel.set(0, 0, 0);
    standing = true;
    model.squash(strength);
  }

  function resolveFlight(ok) {
    if (!flight) return;
    const f = flight;
    flight = null;
    f.resolve(ok);
  }

  function resolveLanding() {
    while (landWaiters.length) landWaiters.shift()(true);
  }

  // ---------------------------------------------------------------------------------------------
  // Voo do flyTo (com tempo: arco de bézier exato; sem tempo: voo livre até chegar)

  function runFlight(dt) {
    const f = flight;
    f.t += dt;
    let done = false;
    if (f.dur > 0) {
      const k = clamp(f.t / f.dur, 0, 1), e = easeInOut(k), u = 1 - e;
      prevPos.copy(pos);
      pos.set(
        u * u * f.from.x + 2 * u * e * f.ctrl.x + e * e * f.to.x,
        u * u * f.from.y + 2 * u * e * f.ctrl.y + e * e * f.to.y,
        u * u * f.from.z + 2 * u * e * f.ctrl.z + e * e * f.to.z,
      );
      if (k < 0.9) keepAboveGround(0.15);
      vel.subVectors(pos, prevPos).divideScalar(Math.max(dt, 1e-4));
      standing = false;
      done = k >= 1;
    } else {
      const d = steer(dt, f.to.x, f.to.y, f.to.z, { speed: 10, accel: 6, arrive: 1.6 });
      done = d < 0.06 || f.t > 25;
    }
    if (done) {
      pos.copy(f.to);
      hoverHere = f.to.y - groundY(f.to.x, f.to.z, f.to.y + 0.1) > 0.25;
      if (hoverHere) { vel.set(0, 0, 0); standing = false; } else touchDown(0.3);
      resolveFlight(true);
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Modos

  function updateTrapped(dt) {
    standing = true;
    anim.struggle = 1;
    const dQ = quimDist();
    if (dQ < 22 && quimHead(lookTarget)) anim.lookAt = lookTarget;
    cryT -= dt;
    if (cryT <= 0) {
      cryT = 2.4 + Math.random() * 1.8;
      if (dQ < 45) voice('piu', 0);
      if (dQ > 8 && dQ < 40) emote('❗', 1.6);   // chama a atenção de quem passa pela trilha
    }
  }

  function updateFleeing(dt) {
    const pt = fleePts[fleeIdx];
    if (!pt) return;
    if (fleeFlying) {
      const d = steer(dt, pt.x, pt.y, pt.z, { speed: 9, accel: 4.5, arrive: 2, cruiseH: 3.5 });
      sparkT -= dt;
      if (sparkT <= 0 && Math.random() < 0.35) { sparkT = 0.5; fx.feathers(pos, 1); }   // rastro de peninhas
      if (d < 0.07) { pos.copy(pt); fleeFlying = false; touchDown(0.4); }
      return;
    }
    standing = true;
    const dQ = quimDist();
    anim.nervous = dQ < 14 ? 1 : 0.4;
    if (dQ < 22 && quimHead(lookTarget)) anim.lookAt = lookTarget;
    if (dQ < FLEE_DIST && fleeIdx < fleePts.length - 1) {
      fleeIdx++;
      fleeFlying = true;
      voice('alerta', 0);
      emote('❗', 1.2);
      fx.feathers(pos, 3);
      takeOff(3);
    }
  }

  function updatePerched(dt) {
    if (perchFlying) {
      const d = steer(dt, opts.x, opts.y, opts.z, { speed: 8, accel: 5, arrive: 1.6 });
      if (d < 0.06) { pos.set(opts.x, opts.y, opts.z); perchFlying = false; touchDown(0.3); }
      return;
    }
    standing = true;
    if (opts.cafe) { model.setCup(true); anim.sip = 1; }
    const dQ = quimDist();
    if (dQ < 10 && quimHead(lookTarget) && !opts.cafe) anim.lookAt = lookTarget;
    // de vez em quando arruma as peninhas
    actT += dt;
    if (!opts.cafe && actT % 11 > 8.5) anim.preen = 1;
  }

  function updateScripted(dt) {
    if (flight) { runFlight(dt); return; }
    standing = !hoverHere;
    if (hoverHere) { anim.fly = 1; anim.flapSpeed = 8; vel.set(0, 0, 0); }
    const dQ = quimDist();
    if (dQ < 10 && quimHead(lookTarget)) anim.lookAt = lookTarget;
  }

  // ---- seguir a Quim ----

  function snapToHead() {
    act = 'head';
    headBlend = 1;
    if (readAnchor()) pos.copy(anchorPos);
    vel.set(0, 0, 0);
    standing = true;
    yaw = game.player?.rotY ?? 0;
    pitch = roll = 0;
  }

  function startLanding() {
    if (act === 'head') return;
    act = 'land';
    actT = 0;
  }

  function wake() {
    if (!sleeping) return;
    sleeping = false;
    model.squash(-0.35);
    hopT = 0;
    if (Math.random() < 0.6) voice('piu');
  }

  function updateFollow(dt) {
    const pl = game.player;
    if (!pl || !readAnchor()) { anim.fly = 1; return; }
    const ps = pl.state;
    actT += dt;

    // Quim se teleportou (ou ele ficou para trás demais): volta direto para a cabeça
    if (lastPlayerPos && lastPlayerPos.distanceTo(pl.position) > 8) snapToHead();
    (lastPlayerPos ??= new THREE.Vector3()).copy(pl.position);
    if (act !== 'search' && act !== 'fly' && pos.distanceTo(anchorPos) > 45) snapToHead();

    // planar tem prioridade: ele corre para segurar os cachos
    if (ps === 'glide' && act !== 'pull') {
      if (act === 'fly') resolveFlight(false);
      search = null; hint = null;
      wake();
      if (act === 'head') takeOff(1.5);
      act = 'pull'; actT = 0;
    }

    // Q: Voo de Busca
    if (!game.cinematic && game.input?.wasPressed?.('KeyQ')) api.search();

    // dica: muito tempo sem progresso e longe do marcador da missão
    updateHintTimer(dt, pl);

    switch (act) {
      case 'head': updateOnHead(dt, pl, ps); break;
      case 'land': {
        if (ps === 'run') { act = 'side'; break; }
        const hd = Math.hypot(anchorPos.x - pos.x, anchorPos.z - pos.z);
        const ty = anchorPos.y + (hd > 0.3 ? 0.35 : 0);
        const d = steer(dt, anchorPos.x, ty, anchorPos.z, { speed: 12, accel: 8, arrive: 1.1, lead: pl.velocity, cruise: hd > 10 });
        avoidQuim();
        if (d < 3) anim.lookAt = lookTarget.copy(anchorPos);
        if ((hd < 0.12 && Math.abs(anchorPos.y - pos.y) < 0.1) || actT > 5) {
          if (actT > 5) fx.sparkle(pos);
          act = 'head'; actT = 0;
          pos.copy(anchorPos);
          touchDown(0.4);
          resolveLanding();
          if (pendingJoinHeart) {
            pendingJoinHeart = false;
            emote('❤', 2.4);
            voice('feliz', 0);
            hopT = 0;
          }
        }
        break;
      }
      case 'side': {
        if (ps !== 'run' && ps !== 'jump') { if (actT > 0.7) startLanding(); } else actT = 0;
        const r = pl.rotY;
        const bob = Math.sin(time * 3.1) * 0.12;
        // à direita dela (a esquerda da Quim é +X local), um pouco atrás e acima
        const tx = pl.position.x - Math.cos(r) * 0.85 - Math.sin(r) * 0.35;
        const tz = pl.position.z + Math.sin(r) * 0.85 - Math.cos(r) * 0.35;
        steer(dt, tx, pl.position.y + 1.35 + bob, tz, { speed: 6, accel: 8, arrive: 1.5, lead: pl.velocity, cruise: false, clear: 0.4 });
        avoidQuim();
        anim.flapSpeed = 10;
        break;
      }
      case 'pull': {
        if (ps !== 'glide') {
          strand.visible = false;
          if (ps === 'run') { act = 'side'; actT = 0; } else startLanding();
          break;
        }
        const f = pl.rotY;
        tmp2.set(anchorPos.x - Math.sin(f) * 0.04, anchorPos.y + 0.32, anchorPos.z - Math.cos(f) * 0.04);
        if (pos.distanceTo(tmp2) > 1.2) {
          steer(dt, tmp2.x, tmp2.y, tmp2.z, { speed: 20, accel: 10, arrive: 1, lead: pl.velocity, cruise: false });
          avoidQuim();
        } else {
          prevPos.copy(pos);
          pos.addScaledVector(pl.velocity, dt);   // acompanha o movimento dela sem ficar para trás
          pos.x = damp(pos.x, tmp2.x, 16, dt);
          pos.y = damp(pos.y, tmp2.y + Math.sin(time * 12) * 0.015, 16, dt);
          pos.z = damp(pos.z, tmp2.z, 16, dt);
          vel.subVectors(pos, prevPos).divideScalar(Math.max(dt, 1e-4));
          anim.pull = 1;
          yaw = dampAngle(yaw, f, 10, dt);
        }
        standing = false;
        anim.flapSpeed = 13;
        anim.flapAmp = 1.1;
        break;
      }
      case 'search': updateSearch(dt, pl); break;
      case 'party': {
        const a = actT * 4.2;
        const tx = pl.position.x + Math.cos(a) * 0.95, tz = pl.position.z + Math.sin(a) * 0.95;
        steer(dt, tx, pl.position.y + 1.65 + Math.sin(a * 2) * 0.15, tz, { speed: 9, accel: 10, arrive: 0.6, lead: pl.velocity, cruise: false });
        avoidQuim();
        anim.happy = 1;
        anim.flapSpeed = 12;
        sparkT -= dt;
        if (sparkT <= 0) { sparkT = 0.08; fx.sparkle(pos); }
        if (actT > 1.3 && actT - dt <= 1.3) voice('feliz', 0);
        if (actT > 3) startLanding();
        break;
      }
      case 'hint': {
        const h = hint;
        const tx = pl.position.x + h.dx * 1.4, tz = pl.position.z + h.dz * 1.4;
        const d = steer(dt, tx, pl.position.y + 1.45, tz, { speed: 7, accel: 7, arrive: 1, lead: pl.velocity, cruise: false });
        avoidQuim();
        if (d < 0.5) {
          anim.point = 1;
          anim.fly = 1;
          yaw = dampAngle(yaw, Math.atan2(h.dx, h.dz), 10, dt);
          if (!h.shown) {
            h.shown = true;
            emote('❗', 2.6);
            voice('alerta', 0);
            game.ui?.toast?.('Pinceso: ' + HINT_LINES[hintCount++ % HINT_LINES.length], '❗');
          }
        }
        if (actT > 3.6) { hint = null; startLanding(); }
        break;
      }
      case 'fly': {
        if (flight) runFlight(dt);
        else { act = 'linger'; actT = 0; }
        break;
      }
      case 'linger': {
        standing = !hoverHere;
        if (hoverHere) anim.fly = 1;
        if (actT > 1.2) startLanding();
        break;
      }
      default: startLanding();
    }

    // brinca/imita só quando está na cabeça; fora dela não dorme
    if (act !== 'head') { idleT = 0; if (sleeping) wake(); }
  }

  function updateOnHead(dt, pl, ps) {
    pos.copy(anchorPos);
    vel.copy(pl.velocity);
    standing = true;
    yaw = pl.rotY; pitch = 0; roll = 0;
    if (ps === 'run') { act = 'side'; actT = 0; takeOff(1.8); if (Math.random() < 0.3) voice('piu'); return; }

    // parada: arruma os cachos, depois cochila
    const still = (ps === 'idle' || ps === 'sit') && !game.cinematic;
    idleT = still ? idleT + dt : 0;
    if (!still && sleeping) wake();
    if (idleT > IDLE_SLEEP) {
      anim.sleep = 1;
      if (!sleeping) { sleeping = true; sleepEmoteT = 0; voice('sono', 0); }
      sleepEmoteT -= dt;
      if (sleepEmoteT <= 0) { sleepEmoteT = 5.5; emote('💤', 3); }
    } else if (idleT > IDLE_PREEN) {
      anim.preen = 1;
    }

    // olhinhos: às vezes encara a câmera (todo mundo aqui olha pra você!)
    lookT -= dt;
    if (lookT <= 0) { lookT = 1.5 + Math.random() * 3; lookCam = Math.random() < 0.4; }
    if (lookCam && !sleeping && idleT < IDLE_PREEN && game.render.camera) {
      anim.lookAt = game.render.camera.getWorldPosition(lookTarget);
    }
  }

  function updateHintTimer(dt, pl) {
    if (game.cinematic) return;
    progressT += dt;
    hintCheckT -= dt;
    if (progressT < HINT_AFTER || hintCheckT > 0 || act !== 'head') return;
    hintCheckT = 2;
    const m = game.missions?.markerTarget?.();
    if (!m) return;
    const dx = m.x - pl.position.x, dz = m.z - pl.position.z, d = Math.hypot(dx, dz);
    if (d < HINT_FAR) return;
    wake();
    hint = { dx: dx / d, dz: dz / d, shown: false };
    act = 'hint'; actT = 0;
    takeOff(1.6);
    progressT = -HINT_AFTER;   // a próxima dica demora o dobro
  }

  function updateSearch(dt, pl) {
    const s = search;
    if (!s) { startLanding(); return; }
    s.t += dt;
    if (s.phase === 'go') {
      const d = steer(dt, s.x, s.y + 1.3, s.z, { speed: 13, accel: 5, arrive: 2.2, cruiseH: 4 });
      sparkT -= dt;
      if (sparkT <= 0) { sparkT = 0.06; fx.sparkle(pos); }
      if (d < 0.4) {
        s.phase = 'circle'; s.t = 0; s.ang = Math.atan2(pos.x - s.x, pos.z - s.z);
        emote(s.kind === 'jujuba' ? '🍬' : '❗', 3.2);
        voice('piui', 0);
      } else if (s.t > 14) { search = null; startLanding(); }
    } else {
      s.ang += dt * 2.6;
      steer(dt, s.x + Math.sin(s.ang) * 0.7, s.y + 1.3 + Math.sin(s.t * 3) * 0.1, s.z + Math.cos(s.ang) * 0.7,
        { speed: 4, accel: 9, arrive: 0.5, cruise: false });
      anim.lookAt = lookTarget.set(s.x, s.y, s.z);
      sparkT -= dt;
      if (sparkT <= 0) { sparkT = 0.25; fx.sparkle(tmp.set(s.x, s.y + 0.4, s.z)); }
      if (s.t > 3) { search = null; startLanding(); }
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Orientação final e animação

  function orient(dt) {
    const hs = Math.hypot(vel.x, vel.z);
    if (!standing && hs > 0.8 && anim.pull === 0 && anim.point === 0) {
      yaw = dampAngle(yaw, Math.atan2(vel.x, vel.z), 9, dt);
    } else if (standing && mode === 'perched' && opts.rotY !== undefined) {
      yaw = dampAngle(yaw, opts.rotY, 4, dt);
    } else if (standing && mode !== 'follow' && game.player && quimDist() < 25) {
      // de pé (preso, arisco, pousado): vira o corpinho para a Quim aos pouquinhos
      const p = game.player.position;
      yaw = dampAngle(yaw, Math.atan2(p.x - pos.x, p.z - pos.z), mode === 'trapped' ? 1.5 : 3, dt);
    }
    const yawRate = angleDiff(yaw, lastYaw) / Math.max(dt, 1e-4);
    lastYaw = yaw;
    let pt = 0, rt = 0;
    if (!standing) {
      pt = clamp(-vel.y * 0.07 + hs * 0.03, -0.55, 0.5) + anim.pull * 0.35;
      rt = clamp(-yawRate * 0.12, -0.6, 0.6) * (1 - anim.pull);
    }
    pitch = damp(pitch, pt, 6, dt);
    roll = damp(roll, rt, 5, dt);
    qOwn.setFromEuler(euler.set(pitch, yaw, roll, 'YXZ'));
    headBlend = damp(headBlend, act === 'head' && mode === 'follow' ? 1 : 0, act === 'head' ? 12 : 8, dt);
    if (headBlend > 0.001) object.quaternion.slerpQuaternions(qOwn, anchorQuat, headBlend);
    else object.quaternion.copy(qOwn);
    object.position.copy(pos);
  }

  function updateStrand() {
    if (!(mode === 'follow' && act === 'pull' && anim.pull > 0)) { strand.visible = false; return; }
    model.beakTip.updateWorldMatrix(true, false);
    model.beakTip.getWorldPosition(tmp);
    tmp2.copy(anchorPos).addScaledVector(UP, -0.02);
    const len = tmp.distanceTo(tmp2);
    if (len < 0.02 || len > 0.8) { strand.visible = false; return; }
    strand.position.copy(tmp2);
    strand.quaternion.setFromUnitVectors(UP, tmp.sub(tmp2).normalize());
    strand.scale.set(1, len, 1);
    strand.visible = true;
  }

  // ---------------------------------------------------------------------------------------------
  // Eventos

  game.bus?.on('mission:complete', () => {
    progressT = 0;
    if (mode !== 'follow' || act === 'pull' || act === 'fly') return;
    wake();
    search = null; hint = null;
    if (act === 'head') takeOff(2.5);
    act = 'party'; actT = 0;
    emote('❤', 2.4);
    voice('piui', 0);
  });
  for (const ev of ['mission:start', 'mission:step', 'item:collect']) game.bus?.on(ev, () => { progressT = 0; });
  game.bus?.on('player:jump', () => {
    if (mode !== 'follow' || act !== 'head') return;
    if (sleeping) { wake(); return; }
    if (mimicCD <= 0 && Math.random() < 0.45) {   // imita o "uii!" da Quim
      mimicCD = 3.5;
      hopT = 0;
      voice('piui', 0);
    }
  });

  // ---------------------------------------------------------------------------------------------
  // API

  const api = {
    object,
    get mode() { return mode; },
    /** Sub-estado atual (para depuração/testes): head, land, side, pull, search, party, hint, fly, linger... */
    get action() { return act; },
    get position() { return pos; },
    get sleeping() { return sleeping; },

    update(dt) {
      time += dt;
      voiceCD -= dt; mimicCD -= dt;
      if (mode === 'hidden') { strand.visible = false; bubble.update(dt, bubblePos, game.render.camera); fx.update(dt); return; }

      anim.fly = 0; anim.flapSpeed = 9; anim.flapAmp = 1; anim.lookAt = null;
      anim.pull = anim.sleep = anim.preen = anim.struggle = anim.nervous = anim.sip = anim.point = anim.happy = 0;

      switch (mode) {
        case 'trapped': updateTrapped(dt); break;
        case 'fleeing': updateFleeing(dt); break;
        case 'perched': updatePerched(dt); break;
        case 'scripted': updateScripted(dt); break;
        case 'follow': updateFollow(dt); break;
      }
      if (!standing) anim.fly = 1;
      if (mode !== 'perched') model.setCup(false);

      // pulinho (imitar o pulo, acordar, ficar feliz)
      anim.hop = 0;
      if (hopT >= 0) {
        hopT += dt;
        if (hopT < 0.45) { anim.hop = Math.sin((hopT / 0.45) * Math.PI) * 0.13; anim.fly = Math.max(anim.fly, 0.7); anim.happy = 0.6; }
        else { hopT = -1; model.squash(0.25); }
      }

      orient(dt);
      model.update(dt, anim);
      updateStrand();
      bubblePos.set(pos.x, pos.y + 0.36 + anim.hop, pos.z);
      bubble.update(dt, bubblePos, game.render.camera);
      fx.update(dt);
    },

    applyState() {
      resolveFlight(false);
      bubble.hide();
      search = null; hint = null; sleeping = false; idleT = 0; progressT = 0;
      lastPlayerPos = null;
      if (game.state?.pincesoJoined) {
        api.setMode('follow');
        snapToHead();
      } else api.setMode('hidden');
    },

    setMode(m, o = {}) {
      if (!MODES.includes(m)) { console.warn('[pinceso] modo desconhecido:', m); return; }
      const wasVisible = mode !== 'hidden';
      if (flight) resolveFlight(false);
      mode = m;
      opts = o || {};
      act = 'idle'; actT = 0;
      sleeping = false; idleT = 0; search = null; hint = null; hoverHere = false;
      model.setTrapped(m === 'trapped');
      model.setCup(false);
      strand.visible = false;
      object.visible = m !== 'hidden';
      if (m === 'hidden') { bubble.hide(); return; }

      if (m === 'trapped') {
        const base = o.y ?? groundY(o.x, o.z);
        pos.set(o.x, base + TRAP_LIFT, o.z);
        vel.set(0, 0, 0); standing = true; cryT = 1;
        if (game.player) yaw = Math.atan2(game.player.position.x - o.x, game.player.position.z - o.z);
      } else if (m === 'fleeing') {
        fleePts = (o.points || []).map((p) => new THREE.Vector3(p.x, p.y ?? groundY(p.x, p.z), p.z));
        fleeIdx = 0;
        if (!fleePts.length) { console.warn('[pinceso] fleeing sem pontos'); return; }
        if (wasVisible) { fleeFlying = true; takeOff(3); fx.feathers(pos, 4); }
        else { pos.copy(fleePts[0]); fleeFlying = false; standing = true; }
      } else if (m === 'perched') {
        opts = { ...o, y: o.y ?? groundY(o.x, o.z) };
        perchFlying = wasVisible && pos.distanceTo(tmp.set(opts.x, opts.y, opts.z)) < 30;
        if (perchFlying) takeOff(2);
        else { pos.set(opts.x, opts.y, opts.z); standing = true; vel.set(0, 0, 0); }
        if (opts.rotY !== undefined && !perchFlying) yaw = opts.rotY;
      } else if (m === 'scripted') {
        if (o.x !== undefined) {
          pos.set(o.x, o.y ?? groundY(o.x, o.z), o.z);
          hoverHere = pos.y - groundY(pos.x, pos.z, pos.y + 0.1) > 0.25;
        } else if (!wasVisible) {
          quimHead(pos)?.add(tmp.set(0, 2.5, 0));
          hoverHere = true;
        } else hoverHere = !standing;
      } else if (m === 'follow') {
        lastPlayerPos = null;
        const far = !game.player || pos.distanceTo(game.player.position) > 30;
        if (!wasVisible || far) snapToHead();
        else { if (standing) takeOff(1.5); startLanding(); }
      }
    },

    flyTo(p, seconds) {
      if (flight) resolveFlight(false);
      if (mode === 'hidden') { api.setMode('scripted'); }
      else if (mode !== 'follow' && mode !== 'scripted') api.setMode('scripted');
      const to = new THREE.Vector3(p.x, p.y ?? groundY(p.x, p.z), p.z);
      if (mode === 'follow') {
        wake();
        search = null; hint = null;
        act = 'fly'; actT = 0;
      }
      hoverHere = false;
      if (standing) takeOff(1.6);
      const from = pos.clone();
      const span = from.distanceTo(to);
      const ctrl = from.clone().lerp(to, 0.5);
      ctrl.y = Math.max(from.y, to.y) + Math.min(4, 0.3 + span * 0.25);
      return new Promise((resolve) => {
        flight = { to, from, ctrl, dur: seconds > 0 ? seconds : 0, t: 0, resolve };
      });
    },

    join() {
      if (game.state) game.state.pincesoJoined = true;
      pendingJoinHeart = true;
      const p = new Promise((resolve) => landWaiters.push(resolve));
      api.setMode('follow');
      if (act === 'head') {      // já estava em cima dela (ou apareceu direto): comemora na hora
        pendingJoinHeart = false;
        touchDown(0.4);
        emote('❤', 2.4);
        voice('feliz', 0);
        hopT = 0;
        resolveLanding();
      }
      game.bus?.emit('pinceso:joined');
      return p;
    },

    /** Voo de Busca: aponta o findable mais próximo (raio 60). Retorna o item escolhido ou null. */
    search() {
      if (mode !== 'follow' || !game.player || act === 'search' || act === 'pull' || act === 'fly') return null;
      const from = game.player.position;
      let best = null, bd = SEARCH_RADIUS;
      for (const provider of game.findables || []) {
        let list;
        try { list = provider(); } catch (e) { console.error('[pinceso] findable', e); continue; }
        for (const it of list || []) {
          if (!it) continue;
          const d = Math.hypot(it.x - from.x, it.z - from.z, ((it.y ?? from.y) - from.y) * 0.5);
          if (d < bd) { bd = d; best = it; }
        }
      }
      wake();
      if (!best) {
        emote('?', 2);
        voice('piu', 0);
        hopT = 0;
        return null;
      }
      search = { x: best.x, y: best.y ?? groundY(best.x, best.z), z: best.z, kind: best.kind, phase: 'go', t: 0, ang: 0 };
      hint = null;
      if (act === 'head') takeOff(2.6);
      act = 'search'; actT = 0;
      voice('alerta', 0);
      return best;
    },

    emote,
  };
  return api;
}
