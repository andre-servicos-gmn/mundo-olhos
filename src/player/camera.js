// Câmera em 3ª pessoa: órbita com o mouse (pointer lock ou arrastar), zoom na roda, colisão com o
// terreno e com os colisores do mundo, auto-ajuste atrás da Quim, cenas (setCinematic) e tremidinha.
// API em docs/ARQUITETURA.md (cameraRig). Extra: yaw/pitch/distance (o player usa yaw para andar).
import * as THREE from 'three';
import { clamp, damp, noise2 } from '../core/util.js';

const SENS = 0.0026;
const PITCH_MIN = -0.3, PITCH_MAX = 1.25, PITCH_DEFAULT = 0.32;
const DIST_MIN = 3, DIST_MAX = 14, DIST_DEFAULT = 5.6;
const FOCUS_H = 1.0;          // altura do ponto seguido (peito/cabeça da Quim)
const LOOK_UP = 0.25;         // mira um pouco acima para ela ficar no terço de baixo
const FOV = 50;
const GROUND_MARGIN = 0.5;
const ARM_SAMPLES = 10;

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const ease = (k) => k * k * k * (k * (k * 6 - 15) + 10);   // smootherstep

export function createCameraRig(game) {
  const cam = game.render.camera;
  let yaw = (game.player?.rotY ?? 0) + Math.PI;
  let pitch = PITCH_DEFAULT;
  let distGoal = DIST_DEFAULT, dist = DIST_DEFAULT;
  let mouseIdle = 10, trauma = 0, shakeT = 0;
  let cine = null;      // { fromPos, fromLook, toPos, toLook, t, dur }
  let release = null;   // { fromPos, fromLook, t, dur } — volta da cena para o modo normal

  const focus = new THREE.Vector3();
  const ahead = new THREE.Vector3();
  const off = new THREE.Vector3();
  const probe = new THREE.Vector3();
  const pushed = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const followPos = new THREE.Vector3();
  const followLook = new THREE.Vector3();
  const curPos = new THREE.Vector3().copy(cam.position);
  const curLook = new THREE.Vector3();

  const height = (x, z) => game.world?.getHeight?.(x, z) ?? 0;

  /** Distância máxima livre ao longo do "braço" da câmera (terreno + colisores). */
  function freeDistance() {
    const w = game.world;
    for (let i = 1; i <= ARM_SAMPLES; i++) {
      const d = (distGoal * i) / ARM_SAMPLES;
      probe.copy(focus).addScaledVector(off, d);
      let hit = probe.y < height(probe.x, probe.z) + GROUND_MARGIN;
      // colisores (troncos, casas, rochas): se o ponto é empurrado, está dentro de algo grande
      if (!hit && w?.resolveCollision && i % 2 === 0 && probe.y < focus.y + 4) {
        pushed.copy(probe);
        w.resolveCollision(pushed, 0.3, true);   // true = sem efeitos (respingo/aviso)
        hit = pushed.distanceToSquared(probe) > 1e-4;
      }
      if (hit) return Math.max(0.9, (distGoal * (i - 0.7)) / ARM_SAMPLES);
    }
    return distGoal;
  }

  function computeFollow(dt, instant) {
    const p = game.player;
    const pos = p.position, vel = p.velocity;
    tmp.set(vel.x, 0, vel.z).multiplyScalar(0.22);
    if (tmp.lengthSq() > 1.6 * 1.6) tmp.setLength(1.6);
    const tx = pos.x, ty = pos.y + FOCUS_H, tz = pos.z;
    // pulou muito longe (teleporte)? reposiciona sem varrer o mundo
    if (instant || Math.hypot(focus.x - tx, focus.z - tz) > 30) {
      ahead.copy(tmp);
      focus.set(tx + ahead.x, ty, tz + ahead.z);
      instant = true;
    } else {
      ahead.lerp(tmp, 1 - Math.exp(-3 * dt));
      focus.x = damp(focus.x, tx + ahead.x, 12, dt);
      focus.z = damp(focus.z, tz + ahead.z, 12, dt);
      const air = !p.onGround && p.state !== 'glide';
      focus.y = damp(focus.y, ty, air ? 3 : 9, dt);
      focus.y = clamp(focus.y, ty - 1.4, ty + 1.0);
    }
    off.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    const allowed = freeDistance();
    if (instant || allowed < dist) dist = allowed;     // entra rápido (nunca atravessa)
    else dist = damp(dist, allowed, 2.5, dt);           // sai devagar
    followPos.copy(focus).addScaledVector(off, dist);
    // braço encurtado por parede/tronco: sobe um pouco a câmera (vista por cima do ombro, não dentro dos cachos)
    followPos.y += Math.min(1, Math.max(0, distGoal - dist) * 0.25);
    const gh = height(followPos.x, followPos.z) + GROUND_MARGIN * 0.9;
    if (followPos.y < gh) followPos.y = gh;
    followLook.copy(focus).y += LOOK_UP;
    return instant;
  }

  function update(dt) {
    const p = game.player;
    if (!p) return;
    const m = game.input?.mouse;
    if (m && !game.paused) {
      if (m.dx || m.dy) {
        yaw -= m.dx * SENS;
        pitch = clamp(pitch + m.dy * SENS, PITCH_MIN, PITCH_MAX);
        mouseIdle = 0;
      } else mouseIdle += dt;
      if (m.wheel) distGoal = clamp(distGoal * Math.pow(1.12, m.wheel), DIST_MIN, DIST_MAX);
    }

    // auto-ajuste: com o mouse parado e a Quim andando, a câmera volta devagar para trás dela
    if (!game.paused && !game.cinematic && mouseIdle > 1.2) {
      const sp = Math.hypot(p.velocity.x, p.velocity.z);
      if (sp > 1 && p.state !== 'sit') {
        const diff = wrapAngle(p.rotY + Math.PI - yaw);
        if (Math.abs(diff) < 2.3) yaw += diff * (1 - Math.exp(-dt * 0.9 * clamp(sp / 6, 0.3, 1.3)));
        pitch = damp(pitch, PITCH_DEFAULT, 0.5, dt);
      }
    }
    yaw = wrapAngle(yaw);

    const jumped = computeFollow(dt, false);
    if (cine) {
      cine.t += dt;
      const k = ease(cine.dur > 0 ? Math.min(1, cine.t / cine.dur) : 1);
      curPos.lerpVectors(cine.fromPos, cine.toPos, k);
      curLook.lerpVectors(cine.fromLook, cine.toLook, k);
    } else if (release && !jumped) {
      release.t += dt;
      const k = ease(release.dur > 0 ? Math.min(1, release.t / release.dur) : 1);
      curPos.lerpVectors(release.fromPos, followPos, k);
      curLook.lerpVectors(release.fromLook, followLook, k);
      if (k >= 1) release = null;
    } else {
      release = null;
      curPos.copy(followPos);
      curLook.copy(followLook);
    }

    cam.position.copy(curPos);
    tmp.copy(curLook);
    if (trauma > 0) {
      shakeT += dt;
      const s = trauma * trauma * 0.35;
      cam.position.x += noise2(shakeT * 22, 1.3) * s;
      cam.position.y += noise2(shakeT * 22, 7.1) * s;
      tmp.x += noise2(shakeT * 22, 4.4) * s * 0.5;
      trauma = Math.max(0, trauma - dt * 1.6);
    }
    cam.lookAt(tmp);

    // um tiquinho mais de campo de visão correndo/planando (sensação de velocidade)
    const st = p.state;
    const fov = cine ? FOV : FOV + (st === 'run' ? 5 : 0) + (st === 'glide' ? 4 : 0);
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = damp(cam.fov, fov, 3, dt);
      cam.updateProjectionMatrix();
    }
  }

  const rig = {
    update,
    get yaw() { return yaw; },
    get pitch() { return pitch; },
    get distance() { return distGoal; },
    get mode() { return cine ? 'cinematic' : 'follow'; },

    /** Posiciona instantaneamente atrás da Quim. */
    snap() {
      const p = game.player;
      if (!p) return;
      yaw = wrapAngle(p.rotY + Math.PI);
      pitch = PITCH_DEFAULT;
      computeFollow(0, true);
      release = null;
      if (!cine) { curPos.copy(followPos); curLook.copy(followLook); }
      cam.position.copy(curPos);
      cam.lookAt(curLook);
    },

    /** pose {x,y,z,lookX,lookY,lookZ} leva a câmera até lá em `seconds`; null devolve ao jogador. */
    setCinematic(pose, seconds = 1.2) {
      if (pose) {
        cine = {
          fromPos: curPos.clone(), fromLook: curLook.clone(),
          toPos: new THREE.Vector3(pose.x, pose.y, pose.z),
          toLook: new THREE.Vector3(pose.lookX ?? pose.x, pose.lookY ?? pose.y, pose.lookZ ?? pose.z - 1),
          t: 0, dur: seconds,
        };
        release = null;
      } else if (cine) {
        release = { fromPos: curPos.clone(), fromLook: curLook.clone(), t: 0, dur: seconds };
        cine = null;
      }
    },

    shake(amount = 0.3) { trauma = clamp(trauma + amount, 0, 1); },
  };
  return rig;
}
