// Animação procedural dos moradores: respirar, andar/pular/gingar, acenar, dançar, dormir, conversar.
// animateRig(rig, a, dt) — "a" é preenchido pelo npcs.js a cada quadro (pesos 0..1 já suavizados lá):
//   { t, move, phase, wave, waveT, dance, danceT, sleep, talk, headYaw, headPitch, joy }
import { clamp, damp } from '../core/util.js';

const PI = Math.PI;

export function animateRig(rig, a, dt) {
  const { visual, body, head } = rig;
  const t = a.t + rig.seed;
  const breathe = Math.sin(t * (a.sleep > 0.5 ? 1.4 : 2.3));
  const mv = a.move, s = Math.sin(a.phase), c = Math.cos(a.phase);

  let y = 0, sq = 1, roll = 0, yaw = 0, lean = 0;

  // --- jeito de andar --------------------------------------------------------------------------
  switch (rig.gait) {
    case 'hop': {        // pulinhos (passarinhos, sapo, coelhinha)
      const h = Math.abs(Math.sin(a.phase));
      y += h * 0.11 * mv;
      sq += (h < 0.3 ? -0.1 * (1 - h / 0.3) : 0.05 * h) * mv;
      lean += 0.12 * mv;
      break;
    }
    case 'waddle':       // gingado (pombo, coruja)
      y += Math.abs(s) * 0.03 * mv;
      roll += s * 0.13 * mv;
      break;
    case 'slow':
      y += Math.abs(s) * 0.015 * mv;
      roll += s * 0.04 * mv;
      lean += 0.05 * mv;
      break;
    case 'hover':
      y += (rig.hover || 0.3) + Math.sin(t * 2.6) * 0.04;
      lean += 0.25 * mv;
      break;
    case 'none':
      break;
    default:             // caminhadinha com balanço
      y += Math.abs(s) * 0.035 * mv;
      roll += s * 0.05 * mv;
      lean += 0.06 * mv;
  }

  // --- dança (a Quim pulou perto!) --------------------------------------------------------------
  if (a.dance > 0.001) {
    const k = a.danceT * 7.5;
    const h = Math.abs(Math.sin(k));
    if (rig.gait === 'none') {            // espantalho: balança no poste
      roll += Math.sin(a.danceT * 6) * 0.22 * a.dance;
      yaw += Math.sin(a.danceT * 3) * 0.4 * a.dance;
    } else {
      y += h * 0.2 * a.dance;
      sq *= 1 + (h < 0.25 ? -0.14 : 0.08 * h) * a.dance;
      yaw += Math.sin(a.danceT * 3.2) * 0.7 * a.dance;
      roll += Math.sin(a.danceT * 6.4) * 0.08 * a.dance;
    }
  }

  // --- surpresinha (acordou / alegria) ---------------------------------------------------------
  if (a.joy > 0.001) { y += Math.sin(a.joy * PI) * 0.08; sq *= 1 + Math.sin(a.joy * PI) * 0.06; }

  // respiração + squash & stretch (volume aproximadamente constante)
  const breathAmp = a.sleep > 0.5 ? 0.03 : 0.018;
  const sy = sq * (1 + breathe * breathAmp);
  const sxz = 1 / Math.sqrt(Math.max(0.5, sq)) * (1 - breathe * breathAmp * 0.4);
  visual.position.y = y;
  visual.scale.set(sxz, sy, sxz);
  visual.rotation.z = roll + (a.sleep > 0 && rig.gait === 'none' ? a.sleep * 0.08 : 0);
  visual.rotation.y = yaw;
  if (body) body.rotation.x = damp(body.rotation.x, lean + (rig.kind === 'quad' ? 0 : a.sleep * 0.12) + (rig.baseLean || 0), 8, dt);

  // --- cabeça: olha a Quim, cochila, concorda conversando ----------------------------------------
  if (head) {
    const ym = rig.headYawMax;
    const nod = a.talk * Math.sin(t * 9) * 0.06;
    let hx = clamp(a.headPitch, -0.4, 0.4) * (1 - a.sleep) + a.sleep * (rig.kind === 'bird' ? 0.45 : 0.32) + nod;
    let hy = clamp(a.headYaw, -ym, ym) * (1 - a.sleep);
    let hz = Math.sin(t * 0.7) * 0.05 * (1 - a.sleep) + a.sleep * 0.22;
    if (rig.headBob) head.position.z = (rig.headZ0 ??= head.position.z) + Math.max(0, Math.sin(a.phase * 2)) * 0.05 * mv;
    if (rig.kind === 'bird') hz += Math.sin(t * 1.7) * 0.08 * (1 - a.sleep);   // inclinadinha de passarinho
    if (rig.gait === 'hover') hx -= 0.25 * mv;
    head.rotation.x = damp(head.rotation.x, hx + (rig.headPitch0 || 0), 10, dt);
    head.rotation.y = damp(head.rotation.y, hy, 10, dt);
    head.rotation.z = damp(head.rotation.z, hz, 6, dt);
  }

  // --- braços / asas / patas da frente ----------------------------------------------------------
  const rest = rig.armRest;
  const { armL, armR } = rig;
  if (rig.quadLegs) {
    rig.legs.forEach((leg, i) => {
      const off = i === 0 || i === 3 ? 0 : PI;
      let rx = Math.sin(a.phase + off) * 0.55 * mv;
      if (leg === armR && a.wave > 0.001) rx = rx * (1 - a.wave) + (-1.15 + Math.sin(a.waveT * 11) * 0.3) * a.wave;
      if (a.dance > 0.001) rx += Math.sin(a.danceT * 7.5 + off) * 0.35 * a.dance;
      leg.rotation.x = damp(leg.rotation.x, rx, 14, dt);
    });
  } else {
    if (armL && armR) {
      let zl = rest, zr = -rest, xl = 0, xr = 0;
      if (rig.wings) {
        // asinhas: batem ao pular/pairar, abrem para acenar e dançar
        const fast = rig.flap === 'fast' || rig.gait === 'hover';
        const flapA = fast ? 0.7 : (rig.gait === 'hop' ? 0.5 * mv * Math.abs(Math.sin(a.phase)) : 0.1 * mv);
        const f = Math.sin(t * (fast ? 46 : 18)) * flapA;
        zl += f + 0.06; zr -= f + 0.06;
        zr += a.wave * (-1.6 + Math.sin(a.waveT * 14) * 0.45 - zr);
        if (a.dance > 0.001) { const d = Math.sin(a.danceT * 12) * 0.5 + 0.9; zl += d * a.dance; zr -= d * a.dance; }
        zl -= a.sleep * 0.05; zr += a.sleep * 0.05;
      } else {
        // bracinhos: balançam ao andar, acenam, vão para o alto dançando, caem ao dormir
        xl = -s * 0.55 * mv; xr = s * 0.55 * mv;
        if (rig.gait === 'none') { zl += Math.sin(t * 1.3) * 0.04; zr -= Math.sin(t * 1.3 + 1) * 0.04; }
        const waveZ = rig.gait === 'none' ? -2.2 : -2.55;
        zr = zr * (1 - a.wave) + (waveZ + Math.sin(a.waveT * 13) * 0.38) * a.wave;
        xr *= 1 - a.wave;
        if (a.dance > 0.001) {
          const d = Math.sin(a.danceT * 7.5);
          zl = zl * (1 - a.dance) + (2.3 + d * 0.35) * a.dance;
          zr = zr * (1 - a.dance) + (-2.3 + d * 0.35) * a.dance;
        }
        zl -= a.sleep * rest * 0.6; zr += a.sleep * rest * 0.6;
        if (a.talk > 0.01 && a.wave < 0.1) { zl += Math.sin(t * 4) * 0.12 * a.talk; xr -= (0.4 + Math.sin(t * 5) * 0.15) * a.talk; }
      }
      armL.rotation.z = damp(armL.rotation.z, zl, 16, dt);
      armR.rotation.z = damp(armR.rotation.z, zr, 16, dt);
      armL.rotation.x = damp(armL.rotation.x, xl, 12, dt);
      armR.rotation.x = damp(armR.rotation.x, xr, 12, dt);
    }
    // perninhas
    if (rig.gait !== 'hop' && rig.gait !== 'hover' && rig.gait !== 'none') {
      const amp = rig.gait === 'slow' ? 0.35 : 0.7;
      if (rig.legs[0]) rig.legs[0].rotation.x = s * amp * mv;
      if (rig.legs[1]) rig.legs[1].rotation.x = -s * amp * mv;
    } else if (rig.gait === 'hop' && rig.legs.length >= 2) {
      const tuck = Math.abs(Math.sin(a.phase)) * 0.5 * mv;
      rig.legs[0].rotation.x = -tuck; rig.legs[1].rotation.x = -tuck;
    } else if (rig.gait === 'hover' && rig.legs.length >= 2) {
      rig.legs[0].rotation.x = 0.3 + Math.sin(t * 3) * 0.15; rig.legs[1].rotation.x = 0.3 + Math.sin(t * 3 + 1) * 0.15;
    }
  }

  // --- orelhas, antenas, cauda, leque -----------------------------------------------------------
  const perk = a.wave + a.dance + a.joy;
  for (const e of rig.ears) {
    const side = e.userData.side || 1;
    const base = e.userData.rz0 ??= e.rotation.z;
    e.rotation.z = base + side * (Math.sin(t * 1.9 + side) * 0.05 + Math.sin(t * 13) * 0.08 * Math.min(1, perk)) - side * a.sleep * 0.15;
  }
  if (rig.tail) {
    const wag = rig.tailType === 'dog' || rig.tailType === 'pompom'
      ? Math.sin(t * (perk > 0.1 ? 18 : 5)) * (0.25 + 0.35 * Math.min(1, perk + mv))
      : Math.sin(t * 1.6) * 0.18;
    if (rig.tailType === 'bird') { rig.tail.rotation.x = Math.sin(t * 2.1) * 0.08 + (a.dance > 0 ? Math.sin(a.danceT * 15) * 0.2 * a.dance : 0); rig.tail.rotation.y = wag * 0.5; }
    else rig.tail.rotation.y = wag;
  }
  if (rig.fan) {
    const open = 1 + 0.12 * Math.sin(t * 1.2) + 0.3 * Math.min(1, perk);
    rig.fan.scale.set(open, 1 + 0.05 * Math.sin(t * 1.2), 1);
  }
  if (rig.flag) rig.flag.rotation.x = Math.sin(t * 7) * 0.4;
}
