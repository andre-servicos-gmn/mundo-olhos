// Modelo procedural do Pinceso + animação procedural (asinhas, cabecinha "de passarinho", squash & stretch).
// createPincesoModel() -> { root, head, beakTip, update(dt, anim), squash(qtd), chirp(), setTrapped(bool), setCup(bool) }
// Pivô nos pés (y = 0), olhando para +Z. A esquerda dele é +X. Altura ~0,3 (topete incluso ~0,36).
// "anim" é preenchido pelo pinceso.js a cada quadro: { fly, flapSpeed, flapAmp, pull, sleep, preen, struggle,
//   nervous, sip, point, hop, happy, lookAt: Vector3|null }  (pesos 0..1; o modelo suaviza sozinho).
import * as THREE from 'three';
import { toon } from '../core/materials.js';
import { clamp, damp, lerp } from '../core/util.js';
import { addOutline } from './outline.js';

export const PINCESO_COLORS = {
  body: '#9fe22f', crest: '#bdf150', belly: '#f0fb72', wing: '#7ccf36', wingTip: '#3faf5c',
  tail: '#35c3b0', tail2: '#2b9fd2', cheek: '#ff8fb3', beak: '#ffa83c', beakLow: '#f08a2a',
  leg: '#ff9f8a', iris: '#24152f', white: '#ffffff',
  vine: '#5fbf72', vine2: '#7fcf6a', leaf: '#8fdc7a', thimble: '#dcd8ec', coffee: '#7a4a2a', foam: '#f6e3c8',
};
const C = PINCESO_COLORS;
const SCALE = 0.95;           // escala geral (o contorno escala junto)
const TAU = Math.PI * 2;

const SPH = new THREE.SphereGeometry(1, 22, 16);
const SPH_LO = new THREE.SphereGeometry(1, 12, 9);
/** Elipsoide com escala/deslocamento "assados" na geometria (para o contorno ficar uniforme). */
function ell(rx, ry, rz, tx = 0, ty = 0, tz = 0, base = SPH) {
  return base.clone().scale(rx, ry, rz).translate(tx, ty, tz);
}

const mats = new Map();
const M = (color) => { if (!mats.has(color)) mats.set(color, toon(color)); return mats.get(color); };
const basic = (color) => new THREE.MeshBasicMaterial({ color });

function mesh(parent, geo, mat, { outline = true, shadow = true, x = 0, y = 0, z = 0 } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = false;
  if (outline) addOutline(m);
  parent.add(m);
  return m;
}

/** Bico curvo: cone deitado para a frente, com a ponta entortada para baixo (gancho de periquito). */
function beakGeometry(radius, length, bend) {
  const g = new THREE.ConeGeometry(radius, length, 12, 5);
  g.translate(0, length / 2, 0);                 // base em y=0, ponta em y=length
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const t = y / length;
    // (lado, cima, frente) <- (-x, z, y); a ponta desce em curva (o -x mantém as faces viradas para fora)
    p.setXYZ(i, -x * 0.92, z - t * t * bend, y);
  }
  g.computeVertexNormals();
  return g;
}

export function createPincesoModel() {
  const root = new THREE.Group();
  root.name = 'pinceso';
  const scaler = new THREE.Group();
  scaler.scale.setScalar(SCALE);
  root.add(scaler);
  const body = new THREE.Group();          // squash/stretch, pulinho, tremedeira
  scaler.add(body);

  // ---- corpo redondinho ----
  mesh(body, ell(0.105, 0.108, 0.1), M(C.body), { y: 0.13 });
  mesh(body, ell(0.082, 0.082, 0.07), M(C.belly), { outline: false, y: 0.112, z: 0.04 });

  // ---- cabeça (pivô no "pescoço") ----
  const head = new THREE.Group();
  head.position.set(0, 0.19, 0.012);
  body.add(head);
  mesh(head, ell(0.093, 0.089, 0.089), M(C.body), { y: 0.05, z: 0.004 });
  mesh(head, ell(0.068, 0.058, 0.05), M(C.belly), { outline: false, y: 0.03, z: 0.05 });   // carinha clarinha
  for (const s of [-1, 1]) {   // bochechas rosadas
    const ch = mesh(head, ell(0.023, 0.017, 0.011), M(C.cheek), { outline: false, shadow: false, x: s * 0.057, y: 0.02, z: 0.066 });
    ch.rotation.y = s * 0.72;
  }

  // olhos grandes e brilhantes (próprios: íris enorme + dois brilhos)
  const eyes = [];
  for (const s of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(s * 0.041, 0.064, 0.074);
    eye.rotation.y = s * 0.36;
    head.add(eye);
    const shape = new THREE.Group();     // escala (piscar / arregalar)
    eye.add(shape);
    mesh(shape, ell(0.031, 0.038, 0.02), M(C.white), { shadow: false });
    const pivot = new THREE.Group();
    shape.add(pivot);
    const iris = new THREE.Mesh(ell(0.025, 0.031, 0.012, 0, -0.002, 0.012), basic(C.iris));
    const shine = new THREE.Mesh(ell(0.0085, 0.0095, 0.004, 0.008, 0.012, 0.024, SPH_LO), basic(C.white));
    const shine2 = new THREE.Mesh(ell(0.0042, 0.0042, 0.003, -0.008, -0.01, 0.024, SPH_LO), basic(C.white));
    pivot.add(iris, shine, shine2);
    eyes.push({ eye, shape, pivot, side: s });
  }

  // bico curvo (parte de cima + mandíbula que abre ao piar)
  const beak = new THREE.Group();
  beak.position.set(0, 0.03, 0.094);
  head.add(beak);
  const upper = mesh(beak, beakGeometry(0.021, 0.042, 0.026), M(C.beak), { shadow: false });
  upper.rotation.x = 0.25;
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.006, -0.002);
  beak.add(jaw);
  const lower = mesh(jaw, beakGeometry(0.013, 0.022, 0.004), M(C.beakLow), { shadow: false });
  lower.rotation.x = 0.55;
  const beakTip = new THREE.Object3D();      // ponta do bico (o fio de cabelo do planar sai daqui)
  beakTip.position.set(0, -0.022, 0.03);
  beak.add(beakTip);

  // topete arrepiado (4 peninhas)
  const crest = new THREE.Group();
  crest.position.set(0, 0.122, 0.02);
  head.add(crest);
  const crestFeathers = [];
  for (const [rx, rz, len, c] of [[0.5, -0.55, 0.7, C.body], [0.35, -0.08, 0.95, C.crest], [0.1, 0.4, 0.8, C.crest], [-0.45, 0.1, 0.7, C.body]]) {
    const f = mesh(crest, ell(0.017, 0.05 * len, 0.012, 0, 0.042 * len, 0), M(c));
    f.rotation.set(rx, 0, rz);
    f.userData.rest = { x: rx, z: rz };
    crestFeathers.push(f);
  }

  // asinhas (pivô no "ombro")
  const wings = [];
  for (const s of [-1, 1]) {
    const w = new THREE.Group();
    w.position.set(s * 0.09, 0.17, -0.004);
    body.add(w);
    mesh(w, ell(0.022, 0.076, 0.056, 0, -0.06, -0.016), M(C.wing));
    mesh(w, ell(0.019, 0.034, 0.042, s * 0.003, -0.118, -0.03), M(C.wingTip), { outline: false });
    wings.push({ g: w, side: s });
  }

  // rabinho azul-turquesa
  const tail = new THREE.Group();
  tail.position.set(0, 0.085, -0.088);
  body.add(tail);
  const tailFeathers = [];
  for (const [ry, len, c] of [[-0.24, 0.85, C.tail], [0, 1.15, C.tail2], [0.24, 0.85, C.tail]]) {
    const f = mesh(tail, ell(0.021, 0.009, 0.075 * len, 0, 0, -0.065 * len), M(c));
    f.rotation.y = ry;
    f.userData.ry = ry;
    tailFeathers.push(f);
  }

  // perninhas com dedinhos
  const legs = [];
  for (const s of [-1, 1]) {
    const l = new THREE.Group();
    l.position.set(s * 0.036, 0.04, 0.018);
    body.add(l);
    mesh(l, new THREE.CylinderGeometry(0.009, 0.008, 0.042, 6).translate(0, -0.021, 0), M(C.leg), { outline: false });
    for (const a of [-0.45, 0, 0.45]) {
      const toe = mesh(l, ell(0.0065, 0.0055, 0.018, 0, 0, 0.012, SPH_LO), M(C.leg), { outline: false, shadow: false, y: -0.038 });
      toe.rotation.y = a;
    }
    const back = mesh(l, ell(0.006, 0.005, 0.012, 0, 0, -0.008, SPH_LO), M(C.leg), { outline: false, shadow: false, y: -0.038 });
    back.rotation.y = 0;
    legs.push(l);
  }

  // cipós enroscados (modo "preso")
  const vines = new THREE.Group();
  vines.visible = false;
  body.add(vines);
  for (const [r, rx, ry, y] of [[0.112, 1.25, 0.3, 0.12], [0.105, 1.9, -0.8, 0.15], [0.1, 0.5, 1.4, 0.1]]) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(r, 0.011, 6, 22), M(rx > 1.5 ? C.vine : C.vine2));
    t.rotation.set(rx, ry, 0);
    t.position.y = y;
    t.castShadow = true;
    vines.add(t);
  }
  for (const [x, y, z, ry] of [[0.09, 0.17, 0.05, 0.8], [-0.1, 0.09, 0.02, -1.2], [0.02, 0.2, -0.09, 2.6]]) {
    const leaf = new THREE.Mesh(ell(0.028, 0.008, 0.016, 0.02, 0, 0, SPH_LO), M(C.leaf));
    leaf.position.set(x, y, z); leaf.rotation.set(0.3, ry, 0.4);
    vines.add(leaf);
  }

  // dedalzinho de minicafé (cafeteria)
  const cup = new THREE.Group();
  cup.visible = false;
  cup.position.set(0, 0, 0.2);
  scaler.add(cup);
  mesh(cup, new THREE.CylinderGeometry(0.036, 0.03, 0.05, 18).translate(0, 0.025, 0), M(C.thimble));
  mesh(cup, new THREE.CylinderGeometry(0.031, 0.031, 0.003, 18).translate(0, 0.0515, 0), M(C.coffee), { outline: false });
  mesh(cup, ell(0.012, 0.003, 0.012, 0.004, 0.054, 0.002, SPH_LO), M(C.foam), { outline: false, shadow: false });
  for (let i = 0; i < 10; i++) {   // furinhos de dedal
    const a = (i / 10) * TAU;
    mesh(cup, ell(0.004, 0.004, 0.002, 0, 0, 0, SPH_LO), M('#b9b4cf'), { outline: false, shadow: false,
      x: Math.sin(a) * 0.034, y: 0.036, z: Math.cos(a) * 0.034 }).lookAt(Math.sin(a) * 2, 0.036, Math.cos(a) * 2);
  }

  // ---- estado de animação ----
  const w = { fly: 0, pull: 0, sleep: 0, preen: 0, struggle: 0, nervous: 0, sip: 0, point: 0, happy: 0 };
  let t = 0, phase = 0;
  let sq = 0, sqV = 0;                 // mola do squash & stretch
  let chirpT = 0;
  let blinkT = 0, nextBlink = 1.5;
  let headYaw = 0, headPitch = 0, headRoll = 0;
  let idleYaw = 0, idleRoll = 0, idlePitch = 0, nextGlance = 0.8;
  const tmpV = new THREE.Vector3();
  const tmpM = new THREE.Matrix4();

  function update(dt, a) {
    t += dt;
    for (const k in w) w[k] = damp(w[k], a[k] ?? 0, k === 'fly' ? 10 : 7, dt);
    const fly = w.fly;

    // squash & stretch (mola)
    sqV += (-260 * sq - 15 * sqV) * dt;
    sq += sqV * dt;
    const breathe = Math.sin(t * (w.sleep > 0.5 ? 1.6 : 3.2)) * (0.012 + w.sleep * 0.02);
    const puff = 1 + w.sleep * 0.06 + w.nervous * 0.03;
    body.scale.set((1 - sq * 0.5) * puff, (1 + sq) * puff * (1 + breathe), (1 - sq * 0.5) * puff);

    // asas
    const flapSpeed = a.flapSpeed ?? 9;
    phase += dt * flapSpeed * TAU;
    const amp = (a.flapAmp ?? 1) * (1 + w.pull * 0.25);
    const burst = w.struggle * Math.max(0, Math.sin(t * 2.3)) ** 2;     // debatidas em rajadas
    const flapW = Math.max(fly, burst);
    const flap = 1.05 + Math.sin(phase) * 0.95 * amp;
    for (const wg of wings) {
      let z = lerp(0.1 + w.sleep * 0.04, flap, flapW);
      let x = lerp(0.22, -0.05, flapW);
      if (w.point > 0.01 && wg.side > 0) {      // asa esquerda apontando para a frente
        z = lerp(z, 1.35 + Math.sin(t * 6) * 0.12, w.point);
        x = lerp(x, -1.05, w.point);
      }
      if (w.happy > 0.01 && fly < 0.5) z = lerp(z, 0.6 + Math.sin(t * 16) * 0.35, w.happy);   // bate asinha de alegria
      wg.g.rotation.set(x, 0, z * wg.side);
    }

    // corpo: pulinho, sobe-desce no voo, tremedeira, debatida
    body.position.set(
      Math.sin(t * 57) * 0.0035 * w.nervous + Math.sin(t * 13) * 0.01 * burst,
      (a.hop ?? 0) - Math.sin(phase) * 0.012 * fly,
      0,
    );
    body.rotation.set(
      Math.sin(t * 9) * 0.12 * burst + w.pull * -0.2,
      0,
      Math.sin(t * 14) * 0.32 * burst + Math.sin(t * 3.1) * 0.05 * w.sleep,
    );

    // pernas: encolhidas no voo, penduradas ao puxar o cabelo
    for (let i = 0; i < 2; i++) {
      const l = legs[i];
      l.rotation.x = lerp(0, 1.1, fly * (1 - w.pull)) + w.pull * (0.3 + Math.sin(t * 7 + i) * 0.15);
      l.position.y = 0.04 + fly * 0.012;
    }

    // rabinho: abre no voo, abana às vezes
    const wag = Math.sin(t * 11) * 0.12 * Math.max(0, Math.sin(t * 0.9)) * (1 - fly);
    tail.rotation.set(lerp(-0.5, -0.12, fly) + w.sleep * 0.1, wag, 0);
    for (const f of tailFeathers) f.rotation.y = f.userData.ry * (1 + fly * 0.8);

    // cabeça de passarinho: olhadinhas rápidas e inclinações curiosas
    nextGlance -= dt;
    if (nextGlance <= 0) {
      nextGlance = 0.5 + Math.random() * 1.8;
      idleYaw = (Math.random() - 0.5) * 1.2;
      idleRoll = Math.random() < 0.35 ? (Math.random() - 0.5) * 0.8 : 0;
      idlePitch = (Math.random() - 0.5) * 0.3;
    }
    let ty = idleYaw, tp = idlePitch, tr = idleRoll;
    if (a.lookAt) {
      // alvo no espaço local da cabeça (sem a rotação dela)
      head.parent.updateWorldMatrix(true, false);
      tmpM.copy(head.parent.matrixWorld).invert();
      tmpV.copy(a.lookAt).applyMatrix4(tmpM).sub(head.position);
      ty = clamp(Math.atan2(tmpV.x, tmpV.z), -1.3, 1.3);
      tp = clamp(-Math.atan2(tmpV.y, Math.hypot(tmpV.x, tmpV.z)), -0.7, 0.7);
      tr = idleRoll * 0.6;
    }
    if (fly > 0.5 && !a.lookAt) { ty *= 0.3; tp = 0.15; tr = 0; }
    // poses especiais (somam por cima)
    const peck = Math.max(0, Math.sin(t * 8.5)) ** 3;
    tp = lerp(tp, 0.75 + peck * 0.35, w.preen);
    ty = lerp(ty, Math.sin(t * 1.3) * 0.5, w.preen);
    tp = lerp(tp, 0.42, w.sleep); tr = lerp(tr, 0.38, w.sleep); ty = lerp(ty, 0.15, w.sleep);
    const sipK = Math.max(0, Math.sin(t * 1.4)) ** 6;
    tp = lerp(tp, -0.1 + sipK * 0.95, w.sip); ty = lerp(ty, 0, w.sip);
    tp = lerp(tp, 1.15, w.pull); ty = lerp(ty, 0, w.pull); tr = lerp(tr, 0, w.pull);
    tp = lerp(tp, -0.15, w.point); ty = lerp(ty, 0, w.point);
    const snap = a.lookAt ? 14 : 20;
    headYaw = damp(headYaw, ty, snap, dt);
    headPitch = damp(headPitch, tp, snap, dt);
    headRoll = damp(headRoll, tr, 9, dt);
    head.rotation.set(headPitch, headYaw, headRoll, 'YXZ');
    head.position.z = 0.012 + w.preen * peck * 0.02;

    // topete: varre para trás no voo, arrepia quando assustado, balança com o squash
    for (const f of crestFeathers) {
      const r = f.userData.rest;
      f.rotation.x = r.x - fly * 0.55 + w.nervous * 0.25 + sq * 0.8 + Math.sin(t * 7 + r.z * 5) * 0.04;
      f.rotation.z = r.z * (1 + w.nervous * 0.4 - fly * 0.3);
    }

    // olhos: piscar, arregalar, fechar dormindo, apertar de alegria; pupilas seguem o alvo
    nextBlink -= dt;
    if (nextBlink <= 0) { blinkT = 0.15; nextBlink = 1.4 + Math.random() * 3.6; }
    let open = 1;
    if (blinkT > 0) { blinkT -= dt; open = Math.abs(blinkT - 0.075) / 0.075; }
    open = Math.min(open, 1 - w.sleep * 0.9, 1 - w.happy * 0.65);
    const wide = 1 + w.nervous * 0.12;
    const pupilYaw = clamp((a.lookAt ? ty - headYaw : 0), -0.4, 0.4);
    for (const e of eyes) {
      e.shape.scale.set(wide, Math.max(0.08, open) * wide, wide);
      e.pivot.rotation.set(0, pupilYaw - e.eye.rotation.y * 0.55, 0);
    }

    // bico abre ao piar
    if (chirpT > 0) chirpT -= dt;
    jaw.rotation.x = chirpT > 0 ? Math.sin((chirpT / 0.22) * Math.PI) * 0.6 : 0;
  }

  return {
    root, head, beakTip,
    update,
    /** amount > 0 achata (pouso), < 0 estica (decolagem). */
    squash(amount) { sqV -= amount * 9; },
    chirp() { chirpT = 0.22; },
    setTrapped(v) { vines.visible = !!v; },
    setCup(v) { cup.visible = !!v; },
    get cupVisible() { return cup.visible; },
  };
}
