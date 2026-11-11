// Modelo procedural da Quim + animação procedural (poses, expressões, cachos com mola).
// createQuimModel() -> { root, head, headAnchor, carryAnchor, update(dt, anim), setMood(m), setAccessory(id),
//                        resetMotion(), onStep: (pé) => {} }
// "anim" é preenchido pelo player a cada quadro (ver player.js, objeto `anim`).
// Pivôs: pés em y=0, olhando para +Z. A esquerda da Quim é +X (braço/olho "L").
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon } from '../core/materials.js';
import { clamp, lerp, damp, mulberry32, smoothstep } from '../core/util.js';
import { addOutline } from './outline.js';
import { buildAccessory } from './accessories.js';

export const QUIM_COLORS = {
  skin: '#f7c6a3', nose: '#f0a487', blush: '#ff8fa6',
  hair: '#5b3122', hair2: '#7b4630', hairDark: '#41221a',
  dress: '#ffcd3c', trim: '#ffffff', heart: '#ff5f8f', shoe: '#ff5d8f', sock: '#ffffff',
  iris: '#b8632b', iris2: '#f3b85a', pupil: '#2a1420', lash: '#2a1420', mouth: '#7c2638', tongue: '#ff8aa0',
};
const C = QUIM_COLORS;

/** Duração (s) de cada emote; o player usa para encerrar e resolver a Promise. */
export const EMOTE_DUR = { acenar: 1.8, pular_feliz: 1.5, cheirar: 2.3, bocejo: 2.6, carinho: 5, sementinha: 4, abraco: 3.6 };

const MOODS = {
  feliz:    { open: 1, brow: 0, browIn: 0, asym: 0, mouth: 'smile', pupil: 1, eye: 1, tilt: 0 },
  curiosa:  { open: 1, brow: 0.008, browIn: 0, asym: 0.022, mouth: 'hmm', pupil: 1.06, eye: 1, tilt: 0.17 },
  surpresa: { open: 1, brow: 0.03, browIn: 0, asym: 0, mouth: 'o', pupil: 0.72, eye: 1.1, tilt: 0 },
  triste:   { open: 0.8, brow: 0.004, browIn: 0.38, asym: 0, mouth: 'frown', pupil: 1.12, eye: 1, tilt: -0.08 },
  sono:     { open: 0.38, brow: -0.012, browIn: 0.12, asym: 0, mouth: 'hmm', pupil: 1, eye: 1, tilt: 0.12 },
};

const HEAD_R = 0.3;
const Z = new THREE.Vector3(0, 0, 1);
const SPH = new THREE.SphereGeometry(1, 20, 14);
const SPH_LO = new THREE.SphereGeometry(1, 12, 9);

// ------------------------------------------------------------------------------------------------
// Ajudantes de geometria

function colorize(geo, color) {
  const c = new THREE.Color(color);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}
function mesh(geo, mat, { outline = false, cast = true, receive = false } = {}) {
  const o = new THREE.Mesh(geo, mat);
  o.castShadow = cast;
  o.receiveShadow = receive;
  if (outline) addOutline(o);
  return o;
}
const ell = (sx, sy, sz, w = 18, h = 13) => new THREE.SphereGeometry(1, w, h).scale(sx, sy, sz);

/** Posiciona/orienta um objeto na superfície da cabeça (coordenadas do centro da cabeça). */
function onFace(obj, x, y, lift = 0, roll = 0) {
  const z = Math.sqrt(Math.max(0, HEAD_R * HEAD_R - x * x - y * y));
  const n = new THREE.Vector3(x, y, z).normalize();
  obj.position.copy(n).multiplyScalar(HEAD_R + lift);
  obj.quaternion.setFromUnitVectors(Z, n);
  if (roll) obj.rotateZ(roll);
  return obj;
}

// ------------------------------------------------------------------------------------------------

export function createQuimModel() {
  const rand = mulberry32(20240611);
  const M = {
    skin: toon(C.skin),
    nose: toon(C.nose),
    blush: toon(C.blush, { emissive: C.blush, emissiveIntensity: 0.3 }),
    hair: toon('#ffffff', { vertexColors: true }),
    dress: toon(C.dress),
    trim: toon(C.trim),
    heart: toon(C.heart),
    shoe: toon(C.shoe),
    sclera: new THREE.MeshBasicMaterial({ color: '#fdf8f8' }),
    iris: toon(C.iris, { emissive: C.iris, emissiveIntensity: 0.35 }),
    iris2: toon(C.iris2, { emissive: C.iris2, emissiveIntensity: 0.45 }),
    pupil: new THREE.MeshBasicMaterial({ color: C.pupil }),
    shine: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
    lash: new THREE.MeshBasicMaterial({ color: C.lash }),
    mouth: new THREE.MeshBasicMaterial({ color: C.mouth }),
    tongue: toon(C.tongue),
  };

  // --- hierarquia ---------------------------------------------------------------------------------
  const root = new THREE.Group();
  root.name = 'quim';
  const visual = new THREE.Group();        // bob, squash & stretch, inclinação (pivô nos pés)
  root.add(visual);
  const hips = new THREE.Group();
  hips.position.y = 0.3;
  visual.add(hips);
  const torso = new THREE.Group();         // pivô na cintura
  hips.add(torso);
  const neck = new THREE.Group();
  neck.position.y = 0.36;
  torso.add(neck);
  const head = new THREE.Group();          // centro da cabeça (y ≈ 0,88 do chão)
  head.position.y = 0.22;
  neck.add(head);

  // --- pernas e sapatinhos ------------------------------------------------------------------------
  const legs = [];
  for (const side of [1, -1]) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.075, 0, 0);
    hips.add(leg);
    const thigh = mesh(new THREE.CapsuleGeometry(0.047, 0.14, 4, 10).translate(0, -0.12, 0), M.skin, { outline: true });
    leg.add(thigh);
    const sock = mesh(new THREE.CylinderGeometry(0.052, 0.05, 0.06, 12).translate(0, -0.215, 0), M.trim, { outline: true });
    leg.add(sock);
    const frill = mesh(new THREE.TorusGeometry(0.054, 0.012, 5, 14).rotateX(Math.PI / 2).translate(0, -0.188, 0), M.trim, { cast: false });
    leg.add(frill);
    const shoe = mesh(ell(0.068, 0.054, 0.098).translate(0, -0.248, 0.026), M.shoe, { outline: true });
    leg.add(shoe);
    const strap = mesh(new THREE.TorusGeometry(0.06, 0.009, 4, 14, Math.PI).rotateY(Math.PI / 2).translate(0, -0.235, 0.03), M.shoe, { cast: false });
    leg.add(strap);
    const btn = mesh(SPH_LO, M.trim, { cast: false });
    btn.scale.setScalar(0.011);
    btn.position.set(side * 0.06, -0.235, 0.03);
    leg.add(btn);
    legs.push(leg);
  }

  // --- vestidinho ---------------------------------------------------------------------------------
  const prof = [[0.0, 0.0], [0.2, -0.045], [0.252, -0.06], [0.262, -0.038], [0.238, 0.02], [0.19, 0.1],
    [0.148, 0.17], [0.146, 0.22], [0.15, 0.265], [0.128, 0.315], [0.075, 0.352], [0.0, 0.36]].map(([r, y]) => new THREE.Vector2(r, y));
  const dress = mesh(new THREE.LatheGeometry(prof, 30), M.dress, { outline: true, receive: true });
  torso.add(dress);
  const hem = mesh(new THREE.TorusGeometry(0.256, 0.02, 6, 36).rotateX(Math.PI / 2), M.trim, { cast: false });
  hem.position.y = -0.047;
  torso.add(hem);
  // golinha redonda (duas abas)
  for (const s of [1, -1]) {
    const flap = mesh(ell(0.062, 0.018, 0.05), M.trim, { outline: true, cast: false });
    flap.position.set(s * 0.05, 0.335, 0.065);
    flap.rotation.set(0.5, s * 0.5, s * -0.25);
    torso.add(flap);
  }
  for (const y of [0.25, 0.2]) {
    const b = mesh(SPH_LO, M.trim, { cast: false });
    b.scale.set(0.014, 0.014, 0.008);
    b.position.set(0, y, 0.147);
    torso.add(b);
  }
  // bolsinho de coração
  {
    const s = new THREE.Shape();
    s.moveTo(0, -0.03);
    s.bezierCurveTo(-0.045, 0.0, -0.035, 0.035, 0, 0.018);
    s.bezierCurveTo(0.035, 0.035, 0.045, 0.0, 0, -0.03);
    const hg = new THREE.ExtrudeGeometry(s, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2 });
    const heart = mesh(hg, M.heart, { cast: false });
    heart.position.set(0.085, 0.055, 0.2);
    heart.rotation.set(-0.42, 0.4, 0);
    torso.add(heart);
  }

  // --- bracinhos ----------------------------------------------------------------------------------
  const arms = [];
  for (const side of [1, -1]) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.13, 0.3, 0);
    torso.add(arm);
    const puff = mesh(ell(0.068, 0.06, 0.066), M.trim, { outline: true });
    puff.position.y = -0.02;
    arm.add(puff);
    const fore = mesh(new THREE.CapsuleGeometry(0.036, 0.125, 4, 10).translate(0, -0.11, 0), M.skin, { outline: true });
    arm.add(fore);
    const hand = mesh(ell(0.047, 0.05, 0.047, 14, 10).translate(0, -0.215, 0.004), M.skin, { outline: true });
    arm.add(hand);
    arms.push(arm);
  }
  // âncora para carregar coisas (à frente do peito, entre as mãos)
  const carryAnchor = new THREE.Group();
  carryAnchor.position.set(0, 0.2, 0.27);
  torso.add(carryAnchor);

  // --- cabeça e rosto -----------------------------------------------------------------------------
  const skull = mesh(new THREE.SphereGeometry(HEAD_R, 32, 24), M.skin, { outline: true, receive: true });
  head.add(skull);
  for (const s of [1, -1]) {
    const cheek = mesh(new THREE.SphereGeometry(0.1, 20, 14), M.skin, { receive: true });
    cheek.position.set(s * 0.138, -0.15, 0.17);
    head.add(cheek);
    // blush: elipse rosada colada na bochecha
    const n = new THREE.Vector3(s * 0.45, 0.1, 0.89).normalize();
    const blush = mesh(ell(0.05, 0.03, 0.012, 16, 10), M.blush, { cast: false });
    blush.position.set(s * 0.138, -0.15, 0.17).addScaledVector(n, 0.097);
    blush.quaternion.setFromUnitVectors(Z, n);
    head.add(blush);
  }
  const nose = mesh(SPH_LO, M.nose, { cast: false });
  nose.scale.set(0.016, 0.013, 0.012);
  onFace(nose, 0, -0.088, 0.004);
  head.add(nose);

  // olhos ENORMES, com pálpebra, cílios e brilho
  const eyes = [buildEye(1), buildEye(-1)];
  for (const e of eyes) head.add(e.group);

  // sobrancelhas
  const brows = [];
  for (const side of [1, -1]) {
    const holder = new THREE.Group();
    onFace(holder, side * 0.11, 0.122, 0.004);
    head.add(holder);
    const piv = new THREE.Group();
    holder.add(piv);
    const b = mesh(new THREE.TorusGeometry(0.05, 0.0085, 5, 14, 1.25).rotateZ(Math.PI / 2 - 0.625).translate(0, -0.046, 0), M.lash, { cast: false });
    piv.add(b);
    brows.push({ side, piv });
  }

  // boca: várias formas, uma visível por vez
  const mouth = new THREE.Group();
  onFace(mouth, 0, -0.135, 0.003);
  head.add(mouth);
  const mouths = {};
  {
    const smile = mesh(new THREE.TorusGeometry(0.036, 0.008, 5, 16, Math.PI).rotateZ(Math.PI).translate(0, 0.018, 0), M.mouth, { cast: false });
    mouths.smile = smile;
    const grin = new THREE.Group();
    const gm = mesh(new THREE.CircleGeometry(0.043, 20, Math.PI, Math.PI), M.mouth, { cast: false });
    gm.position.y = 0.012;
    const gt = mesh(new THREE.CircleGeometry(0.022, 14), M.tongue, { cast: false });
    gt.scale.set(1, 0.55, 1);
    gt.position.set(0, -0.012, 0.002);
    grin.add(gm, gt);
    mouths.grin = grin;
    const o = new THREE.Group();
    const om = mesh(new THREE.CircleGeometry(0.022, 18), M.mouth, { cast: false });
    om.scale.set(0.85, 1.1, 1);
    const ot = mesh(new THREE.CircleGeometry(0.012, 12), M.tongue, { cast: false });
    ot.scale.set(1.1, 0.6, 1);
    ot.position.set(0, -0.012, 0.002);
    o.add(om, ot);
    mouths.o = o;
    mouths.frown = mesh(new THREE.TorusGeometry(0.026, 0.007, 5, 14, Math.PI).translate(0, -0.02, 0), M.mouth, { cast: false });
    const hmm = mesh(new THREE.CircleGeometry(0.016, 14), M.mouth, { cast: false });
    hmm.scale.set(1.15, 0.42, 1);
    mouths.hmm = hmm;
    for (const k in mouths) { mouth.add(mouths[k]); mouths[k].visible = false; }
    mouths.smile.visible = true;
  }

  // --- cabelo: volume cacheado + cachinhos de mola + "antena" -------------------------------------
  const hair = buildHair(head, M.hair, rand);

  // âncora no topo do cabelo (o Pinceso pousa aqui)
  const headAnchor = new THREE.Group();
  headAnchor.name = 'quim_topo_cabeca';
  headAnchor.position.set(0, 0.4, -0.03);
  head.add(headAnchor);

  // ================================================================================================
  // Olho: grupo no rosto -> "shape" (escala do olho) com esclera, íris, pupila, brilhos e pálpebra.
  function buildEye(side) {
    const group = new THREE.Group();
    // o olho é um elipsoide afundado no rosto: só a "tampa" da frente aparece e acompanha a curva da cabeça
    onFace(group, side * 0.112, -0.028, -0.03);
    const shape = new THREE.Group();
    shape.scale.set(0.09, 0.108, 0.046);
    group.add(shape);
    shape.add(mesh(SPH, M.sclera, { cast: false }));
    const iris = new THREE.Group();
    shape.add(iris);
    const ir = mesh(SPH, M.iris, { cast: false }); ir.position.z = 0.7; ir.scale.set(0.68, 0.76, 0.3);
    const ir2 = mesh(SPH, M.iris2, { cast: false }); ir2.position.set(0, -0.32, 0.78); ir2.scale.set(0.5, 0.36, 0.24);
    const pupilPiv = new THREE.Group();
    const pu = mesh(SPH, M.pupil, { cast: false }); pu.position.set(0, 0.04, 0.84); pu.scale.set(0.3, 0.38, 0.2);
    pupilPiv.add(pu);
    const sh1 = mesh(SPH, M.shine, { cast: false }); sh1.position.set(0.24, 0.3, 0.96); sh1.scale.set(0.22, 0.2, 0.09);
    const sh2 = mesh(SPH, M.shine, { cast: false }); sh2.position.set(-0.22, -0.28, 0.96); sh2.scale.set(0.11, 0.1, 0.09);
    iris.add(ir, ir2, pupilPiv, sh1, sh2);
    // pálpebra: calota da cor da pele que gira em X (-π/2 aberta, +π/2 fechada)
    const lid = new THREE.Group();
    shape.add(lid);
    lid.add(mesh(new THREE.SphereGeometry(1.1, 22, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.skin, { cast: false }));
    // linha dos cílios na borda da pálpebra + três cílios grandes no canto de fora
    lid.add(mesh(new THREE.TorusGeometry(1.06, 0.2, 5, 24, Math.PI).rotateX(Math.PI / 2), M.lash, { cast: false }));
    const lashGeo = new THREE.ConeGeometry(0.16, 1, 5).translate(0, 0.5, 0);
    [[0.1, 0.8], [0.36, 0.66], [0.64, 0.46]].forEach(([tt, len]) => {
      const t = side > 0 ? tt : Math.PI - tt;
      const l = mesh(lashGeo, M.lash, { cast: false });
      const dir = new THREE.Vector3(Math.cos(t), 0, Math.sin(t));
      l.position.copy(dir).multiplyScalar(1.08);
      l.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      l.scale.set(1, len, 1);
      lid.add(l);
    });
    // olhinho "^" (risada / alegria)
    const happy = mesh(new THREE.TorusGeometry(0.058, 0.012, 5, 16, Math.PI), M.lash, { cast: false });
    happy.position.set(0, -0.01, 0.036);
    happy.visible = false;
    group.add(happy);
    return { side, group, shape, iris, pupilPiv, lid, happy };
  }

  // ================================================================================================
  // Estado da animação
  const pose = {}, cur = {};
  const KEYS = ['y', 'sq', 'lean', 'bank', 'tX', 'tY', 'tZ', 'hX', 'hY', 'hZ', 'aLx', 'aLz', 'aRx', 'aRz', 'lLx', 'lLz', 'lRx', 'lRz'];
  for (const k of KEYS) { pose[k] = 0; cur[k] = 0; }
  const face = { open: 1, pupil: 1, eye: 1, brow: 0, browIn: 0, asym: 0, lx: 0, ly: 0, tilt: 0 };
  let moodKey = 'feliz';
  let mouthKey = 'smile', mouthPop = 1;
  let t = 0, phase = 0, prevPhaseSign = 0;
  let blinkT = 0, nextBlink = 2;
  let lookT = 0, idleYaw = 0, idlePitch = 0;
  let sq = 0, sqV = 0;                     // squash & stretch (mola)
  let surpriseT = 0;
  let accessory = null, accessoryId = null;
  const motion = { fwd: 0, side: 0, speed: 0 };
  // aceleração da cabeça (para os cachos)
  const headW = new THREE.Vector3(), headPrev = new THREE.Vector3(), headVel = new THREE.Vector3(), headVelPrev = new THREE.Vector3();
  const accW = new THREE.Vector3(), accL = new THREE.Vector3();
  let motionInit = false;
  const tmp = new THREE.Vector3();

  const api = {
    root, head, headAnchor, carryAnchor, visual,
    onStep: null,
    get mood() { return moodKey; },
    get accessoryId() { return accessoryId; },
    setMood(m) { if (MOODS[m]) moodKey = m; },
    setAccessory(id) {
      if (id === accessoryId) return;
      if (accessory) { accessory.obj.removeFromParent(); accessory = null; }
      accessoryId = null;
      hair.ahoge.visible = true;
      const acc = id ? buildAccessory(id) : null;
      if (!acc) return;
      accessory = acc;
      accessoryId = id;
      (acc.slot === 'neck' ? torso : head).add(acc.obj);
      if (acc.hideAhoge) hair.ahoge.visible = false;
    },
    resetMotion() { motionInit = false; for (const s of hair.springs) { s.x = s.rx; s.z = s.rz; s.vx = s.vz = 0; s.s = s.vs = 0; } },
    update,
  };

  function setMouth(k) {
    if (k === mouthKey) return;
    mouths[mouthKey].visible = false;
    mouthKey = k;
    mouths[k].visible = true;
    mouthPop = 0.55;
  }
  const mix = (k, v, w) => { pose[k] = lerp(pose[k], v, w); };

  // ================================================================================================
  function update(dt, a) {
    t += dt;
    for (const k of KEYS) pose[k] = 0;
    pose.aLz = 0.42; pose.aRz = -0.42;

    const grounded = a.grounded;
    const sitting = a.sit;
    const speed = a.speed;
    const run = clamp((speed - 4.5) / 3.5, 0, 1);
    const walkW = grounded && !sitting ? smoothstep(0.25, 2.2, speed) : 0;

    // ---- locomoção no chão: andar saltitante / correr ----
    if (walkW > 0) {
      phase += dt * (1.7 + speed * 0.28) * Math.PI * 2;
      const s = Math.sin(phase), c = Math.cos(phase);
      const amp = lerp(0.75, 1.05, run);
      pose.lLx = -s * amp * walkW; pose.lRx = s * amp * walkW;
      pose.aLx = s * lerp(0.6, 1.0, run) * walkW; pose.aRx = -s * lerp(0.6, 1.0, run) * walkW;
      pose.aLz += lerp(0.0, 0.3, run) * walkW; pose.aRz -= lerp(0.0, 0.3, run) * walkW;
      pose.y = Math.abs(c) * lerp(0.05, 0.085, run) * walkW;
      pose.sq = Math.pow(1 - Math.abs(c), 3) * 0.07 * walkW;
      pose.lean = lerp(0.07, 0.3, run) * walkW;
      pose.tY = s * 0.13 * walkW; pose.hY = -s * 0.08 * walkW;
      pose.hX = -pose.lean * 0.6;
      // passos: um a cada meio ciclo
      const sg = s >= 0 ? 1 : -1;
      if (sg !== prevPhaseSign) { prevPhaseSign = sg; api.onStep?.(sg); }
    }
    pose.bank = clamp(-a.turnRate * 0.05 * smoothstep(1, 5, speed), -0.28, 0.28);

    // ---- parada: respirar e olhar em volta ----
    const idleW = 1 - walkW;
    if (grounded && !sitting) {
      const br = Math.sin(t * 2.2);
      pose.tX += br * 0.02 * idleW;
      pose.sq += br * 0.012 * idleW;
      pose.aLz += br * 0.04 * idleW; pose.aRz -= br * 0.04 * idleW;
    }

    // ---- no ar: pulo e queda ----
    if (!grounded && !a.glide) {
      const up = clamp(a.vy / 8, -1, 1);
      const fall = clamp(-a.vy / 10, 0, 1);
      // bracinhos abertos para cima (acima disso a cabeçona esconde as mãos)
      pose.aLz = 1.6 + up * 0.25 + fall * 0.35 + Math.sin(t * 16) * 0.14 * fall;
      pose.aRz = -1.6 - up * 0.25 - fall * 0.35 - Math.sin(t * 16 + 1) * 0.14 * fall;
      pose.aLx = -0.3; pose.aRx = -0.3;
      pose.lLx = lerp(-0.7, -0.15, fall); pose.lRx = lerp(0.35, 0.1, fall) + Math.sin(t * 14) * 0.25 * fall;
      pose.sq = -Math.min(0.14, Math.abs(a.vy) * 0.013);
      pose.lean = up > 0 ? -0.06 : 0.08;
      pose.hX = -up * 0.12;
    }

    // ---- planando (o Pinceso segura os cachos) ----
    if (a.glide) {
      pose.aLz = 1.65 + Math.sin(t * 9) * 0.1; pose.aRz = -1.65 - Math.sin(t * 9 + 0.6) * 0.1;
      pose.aLx = 0.1; pose.aRx = 0.1;
      pose.lLx = 0.45 + Math.sin(t * 6) * 0.2; pose.lRx = 0.3 - Math.sin(t * 6) * 0.2;
      pose.lean = 0.42; pose.hX = -0.35;
      pose.bank += Math.sin(t * 2.1) * 0.07;
      pose.y = Math.sin(t * 3) * 0.03;
      pose.sq = -0.04;
    }

    // ---- sentada (banco) ou cochilando no chão ----
    if (sitting === 'banco') {
      pose.y = -0.27;
      pose.lLx = -1.3 + Math.sin(t * 3.2) * 0.28; pose.lRx = -1.3 - Math.sin(t * 3.2) * 0.28;
      pose.aLx = -0.5; pose.aRx = -0.5; pose.aLz = 0.25; pose.aRz = -0.25;
      pose.tX = Math.sin(t * 2) * 0.015;
    } else if (sitting === 'chao') {
      const br = Math.sin(t * 1.5);
      pose.y = -0.235;
      pose.lLx = -1.5; pose.lRx = -1.5; pose.lLz = 0.18; pose.lRz = -0.18;
      pose.aLz = 0.75; pose.aRz = -0.75; pose.aLx = 0.25; pose.aRx = 0.25;
      pose.tX = -0.06 + br * 0.02;
      pose.hX = 0.38 + br * 0.05; pose.hZ = 0.22;
      pose.sq = br * 0.015;
    }

    // ---- carregando algo: bracinhos para a frente ----
    if (a.carrying) {
      const w = a.sit ? 0.5 : 1;
      mix('aLx', -1.2 + (walkW ? Math.sin(phase) * 0.1 : 0), w); mix('aRx', -1.2 - (walkW ? Math.sin(phase) * 0.1 : 0), w);
      mix('aLz', 0.12, w); mix('aRz', -0.12, w);
    }

    // ---- emotes (sobrepõem a pose com peso que entra/sai suave) ----
    let faceOverride = null;
    if (a.emote) {
      const e = a.emote.t, dur = EMOTE_DUR[a.emote.name] ?? 1.5;
      const w = smoothstep(0, 0.18, e) * (1 - smoothstep(dur - 0.25, dur, e));
      switch (a.emote.name) {
        case 'acenar':
          mix('aRz', -1.85 + Math.sin(e * 13) * 0.38, w); mix('aRx', 0.8, w);   // mão ao lado/à frente do cabelo
          mix('hZ', 0.14, w); mix('lean', -0.04, w);
          faceOverride = 'grin';
          break;
        case 'pular_feliz': {
          const hop = e < 1.3 ? Math.abs(Math.sin(e * Math.PI / 0.44)) : 0;
          pose.y += hop * 0.22 * w;
          mix('aLz', 2.0 + Math.sin(e * 17) * 0.3, w); mix('aRz', -2.0 - Math.sin(e * 17 + 1) * 0.3, w);
          mix('aLx', 0.45, w); mix('aRx', 0.45, w);
          mix('lLx', -0.5 * hop, w); mix('lRx', 0.3 * hop, w);
          pose.sq -= hop * 0.08 * w;
          faceOverride = 'happy';
          break;
        }
        case 'cheirar':
          if (e < 1.45) {
            mix('lean', 0.3, w); mix('hX', 0.32 + Math.sin(e * 24) * 0.05, w);
            mix('aLx', -0.4, w); mix('aRx', -0.4, w);
            faceOverride = 'sniff';
          } else {
            mix('hX', -0.22, w); mix('lean', -0.06, w); mix('hZ', 0.12, w);
            mix('aLx', -0.75, w); mix('aRx', -0.75, w); mix('aLz', 0.05, w); mix('aRz', -0.05, w);
            faceOverride = 'happy';
          }
          break;
        case 'carinho':     // mão esquerda segura, direita faz cafuné
          mix('aLx', -1.3, w); mix('aLz', -0.1, w);
          mix('aRx', -1.75 + Math.sin(e * 7) * 0.16, w); mix('aRz', 0.25, w);
          mix('hX', 0.16, w); mix('hZ', Math.sin(e * 1.4) * 0.07, w);
          faceOverride = 'happy';
          break;
        case 'sementinha':  // as duas mãozinhas juntas oferecendo
          mix('aLx', -1.25, w); mix('aRx', -1.25, w); mix('aLz', -0.22, w); mix('aRz', 0.22, w);
          mix('hX', 0.14, w);
          faceOverride = 'happy';
          break;
        case 'abraco': {    // abraça o ar, de olhinhos fechados
          const sway = Math.sin(e * 2.2);
          mix('aLx', -1.2, w); mix('aRx', -1.2, w); mix('aLz', -0.85, w); mix('aRz', 0.85, w);
          mix('hZ', sway * 0.12, w); mix('lean', -0.04, w);
          faceOverride = 'happy';
          break;
        }
        case 'bocejo': {
          const st = smoothstep(0.2, 0.9, e) * (1 - smoothstep(1.9, 2.5, e));
          mix('aLz', lerp(0.42, 2.85, st), w); mix('aRz', lerp(-0.42, -2.85, st), w);
          mix('lean', -0.12 * st, w); mix('hX', -0.28 * st, w);
          pose.sq -= 0.05 * st * w;
          faceOverride = 'yawn';
          break;
        }
      }
    }

    // ---- olhar: alvo explícito, ou olhar em volta quando parada ----
    let yaw = 0, pitch = 0;
    if (a.lookTarget) {
      tmp.copy(a.lookTarget);
      root.worldToLocal(tmp);
      tmp.y -= 0.88;
      yaw = Math.atan2(tmp.x, tmp.z);
      pitch = Math.atan2(tmp.y, Math.hypot(tmp.x, tmp.z));
      if (Math.abs(yaw) > 1.9) { yaw = 0; pitch = 0; }
    } else if (grounded && walkW < 0.5 && !a.talk && sitting !== 'chao') {
      lookT -= dt;
      if (lookT <= 0) {
        lookT = 1.8 + rand() * 3;
        const r = rand();
        idleYaw = r < 0.3 ? 0 : (rand() - 0.5) * 1.3;
        idlePitch = (rand() - 0.4) * 0.35;
      }
      yaw = idleYaw; pitch = idlePitch;
    } else if (!grounded || a.glide) {
      pitch = -0.15;
    }
    pose.hY += clamp(yaw, -0.95, 0.95) * 0.7;
    pose.hX += -clamp(pitch, -0.5, 0.5) * 0.55;
    const mood = MOODS[moodKey] || MOODS.feliz;
    pose.hZ += mood.tilt;
    face.lx = damp(face.lx, clamp((yaw - clamp(yaw, -0.95, 0.95) * 0.7) * 0.5 + yaw * 0.15, -0.2, 0.2), 14, dt);
    face.ly = damp(face.ly, clamp(pitch * 0.35, -0.13, 0.13), 14, dt);

    // ---- aplica a pose (suavizada) ----
    const lam = a.snap ? 1000 : 16;
    for (const k of KEYS) cur[k] = damp(cur[k], pose[k], k === 'y' ? 20 : lam, dt);

    // squash & stretch com mola (recebe impulsos de aterrissagem/pulo)
    if (a.landImpact) { sqV += Math.min(a.landImpact, 22) * 0.16; surpriseT = a.landImpact > 15 ? 0.6 : surpriseT; }
    if (a.jumpImpulse) sqV -= a.jumpImpulse;
    sqV += (-220 * (sq - cur.sq) - 13 * sqV) * dt;
    sq += sqV * dt;
    const sqc = clamp(sq, -0.25, 0.32);
    visual.scale.set(1 + sqc * 0.55, 1 - sqc, 1 + sqc * 0.55);
    visual.position.y = cur.y + (a.stepOffset || 0);
    visual.rotation.set(cur.lean, 0, cur.bank);
    torso.rotation.set(cur.tX, cur.tY, cur.tZ);
    neck.rotation.set(cur.hX, cur.hY - cur.tY, cur.hZ);
    arms[0].rotation.set(cur.aLx, 0, cur.aLz);
    arms[1].rotation.set(cur.aRx, 0, cur.aRz);
    legs[0].rotation.set(cur.lLx, 0, cur.lLz);
    legs[1].rotation.set(cur.lRx, 0, cur.lRz);

    // ---- rosto ----
    updateFace(dt, a, mood, faceOverride, walkW, run);

    // ---- cachos com mola ----
    updateHair(dt, a, speed);

    // ---- acessório ----
    if (accessory?.update) accessory.update(dt, t, motion);
  }

  function updateFace(dt, a, mood, override, walkW, run) {
    // piscar
    nextBlink -= dt;
    if (nextBlink <= 0) { blinkT = 0.15; nextBlink = rand() < 0.2 ? 0.25 : 1.8 + rand() * 3.5; }
    let blink = 1;
    if (blinkT > 0) { blinkT -= dt; blink = Math.abs(blinkT - 0.075) / 0.075; }
    if (surpriseT > 0) surpriseT -= dt;

    let open = mood.open, pupil = mood.pupil, eyeS = mood.eye, brow = mood.brow, browIn = mood.browIn, asym = mood.asym;
    let mk = mood.mouth, happy = false;
    const m2 = moodKey === 'feliz' || moodKey === 'curiosa';
    // sono chegando quando fica parada muito tempo
    if (a.drowsy > 0 && moodKey !== 'surpresa') { open = Math.min(open, lerp(open, 0.35, a.drowsy)); brow -= 0.01 * a.drowsy; }
    if (m2) {
      if (a.glide || (!a.grounded && a.vy > 2)) mk = 'grin';
      else if (walkW > 0.5 && run > 0.5) mk = 'grin';
    }
    if (a.sit === 'chao') { open = 0; mk = 'hmm'; brow = -0.01; }
    if (surpriseT > 0) { mk = 'o'; open = 1; eyeS = 1.08; pupil = 0.75; brow = 0.025; }
    switch (override) {
      case 'grin': if (m2) mk = 'grin'; break;
      case 'happy': happy = true; mk = 'grin'; brow = 0.012; break;
      case 'sniff': open = 0; mk = 'hmm'; brow = 0.01; break;
      case 'yawn': open = 0; mk = 'o'; brow = -0.008; break;
    }
    face.open = damp(face.open, open, 18, dt);
    face.pupil = damp(face.pupil, pupil, 10, dt);
    face.eye = damp(face.eye, eyeS, 12, dt);
    face.brow = damp(face.brow, brow, 12, dt);
    face.browIn = damp(face.browIn, browIn, 10, dt);
    face.asym = damp(face.asym, asym, 10, dt);

    const o = clamp(face.open * blink, 0, 1.05);
    for (const e of eyes) {
      e.shape.visible = !happy;
      e.happy.visible = happy;
      // aberta: a borda da pálpebra (com os cílios) fica bem no topo da parte visível do olho
      e.lid.rotation.x = lerp(Math.PI / 2 + 0.06, -Math.PI / 2 + 0.3, o);
      e.iris.visible = o > 0.12;
      e.iris.position.set(face.lx, face.ly, 0);
      e.pupilPiv.scale.set(face.pupil, face.pupil, 1);
      e.group.scale.setScalar(face.eye);
    }
    for (const b of brows) {
      b.piv.position.y = face.brow + (b.side > 0 ? face.asym : -face.asym * 0.4);
      b.piv.rotation.z = -b.side * face.browIn;
    }
    setMouth(mk);
    mouthPop = damp(mouthPop, 1, 14, dt);
    let ms = mouthPop;
    if (override === 'yawn' && a.emote) ms *= 1 + 1.3 * smoothstep(0.2, 1.0, a.emote.t) * (1 - smoothstep(1.8, 2.4, a.emote.t));
    if (a.sit === 'chao') ms *= 0.8 + Math.sin(t * 1.5) * 0.15;
    mouth.scale.setScalar(ms);
  }

  function updateHair(dt, a, speed) {
    // aceleração da cabeça no espaço do corpo
    head.getWorldPosition(headW);
    if (!motionInit || dt <= 0) { headPrev.copy(headW); headVelPrev.set(0, 0, 0); accW.set(0, 0, 0); motionInit = true; }
    headVel.copy(headW).sub(headPrev).divideScalar(Math.max(dt, 1e-3));
    headPrev.copy(headW);
    if (headVel.lengthSq() > 900) headVel.set(0, 0, 0);       // teleporte
    tmp.copy(headVel).sub(headVelPrev).divideScalar(Math.max(dt, 1e-3));
    headVelPrev.copy(headVel);
    if (tmp.lengthSq() > 3600) tmp.setLength(60);
    accW.lerp(tmp, 1 - Math.exp(-25 * dt));
    const ry = root.rotation.y, cs = Math.cos(ry), sn = Math.sin(ry);
    accL.set(accW.x * cs - accW.z * sn, accW.y, accW.x * sn + accW.z * cs);   // x: esquerda, z: frente
    motion.fwd = clamp(accL.z * 0.05, -1, 1);
    motion.side = clamp(accL.x * 0.05, -1, 1);
    motion.speed = speed;

    const fallUp = !a.grounded ? clamp(-a.vy * 0.07, 0, 1.1) : 0;
    const glide = a.glide ? 1 : 0;
    for (const s of hair.springs) {
      let tx, tz;
      if (s.kind === 'up') {           // antena: aceleração para frente joga para trás
        tx = s.rx - accL.z * 0.012 - speed * 0.03 - glide * 0.5;
        tz = s.rz + accL.x * 0.012;
      } else {
        tx = s.rx + accL.z * 0.01 + speed * 0.035 + fallUp * 0.9 + glide * (1.15 + Math.sin(t * 11 + s.ph) * 0.15);
        tz = s.rz - accL.x * 0.01 + glide * Math.sin(t * 9 + s.ph) * 0.12;
      }
      s.vx += (-s.k * (s.x - tx) - s.c * s.vx) * dt;
      s.vz += (-s.k * (s.z - tz) - s.c * s.vz) * dt;
      s.x += s.vx * dt; s.z += s.vz * dt;
      s.x = clamp(s.x, -1.6, 1.9); s.z = clamp(s.z, -1.2, 1.2);
      s.pivot.rotation.set(s.x, 0, s.z);
      // mola vertical: cachinhos esticam/encolhem (boing!)
      s.vs += (-160 * s.s + accL.y * 0.6 - 9 * s.vs) * dt;
      s.s += s.vs * dt;
      s.s = clamp(s.s, -0.3, 0.45);
      const ss = s.kind === 'up' ? 1 - s.s * 0.5 : 1 + s.s;
      s.pivot.scale.set(1 - s.s * 0.15, ss, 1 - s.s * 0.15);
    }
    // o volume todo dá uma tremidinha
    hair.jv += (-260 * hair.j + accL.y * 0.2 - 12 * hair.jv) * dt;
    hair.j = clamp(hair.j + hair.jv * dt, -0.08, 0.08);
    hair.volume.scale.set(1 + hair.j * 0.5, 1 - hair.j, 1 + hair.j * 0.5);
  }

  return api;
}

// ================================================================================================
// Cabelo cacheado: um volume (esferas + argolinhas mescladas, com cores por vértice),
// cachinhos-mola pendurados e uma "antena" em espiral no topo.
function buildHair(head, mat, rand) {
  const parts = [];
  const tones = [C.hair, C.hair2, C.hairDark];
  const q = new THREE.Quaternion();
  const addSphere = (x, y, z, r, color) => {
    const g = new THREE.SphereGeometry(r, 11, 8);
    g.translate(x, y, z);
    parts.push(colorize(g, color));
  };
  const addRing = (p, n, r, color) => {
    const g = new THREE.TorusGeometry(r, r * 0.55, 5, 12);
    q.setFromUnitVectors(Z, n);
    g.applyQuaternion(q);
    g.translate(p.x, p.y, p.z);
    parts.push(colorize(g, color));
  };
  // Onde pode ter cabelo (d = direção unitária a partir do centro da cabeça)
  function keep(d, strict = 0) {
    if (d.y < -0.82) return false;
    if (d.z > -0.05 && d.y < 0.6 + strict * 0.04) {             // metade da frente, abaixo da franja
      if (d.z > 0.42 - strict * 0.1) return false;              // rosto
      if (Math.abs(d.x) < 0.86 + strict * 0.03) return false;
      if (d.y < -0.35) return false;                            // queixo / pescoço
    }
    if (d.y < -0.42 && d.z > -0.3) return false;
    return true;
  }
  const tone = (d) => {
    const r = rand();
    if (d.y < -0.3 && r < 0.6) return C.hairDark;
    return r < 0.32 + Math.max(0, d.y) * 0.25 ? C.hair2 : C.hair;
  };
  const fib = (i, n, out) => {
    const y = 1 - ((i + 0.5) / n) * 2, rr = Math.sqrt(1 - y * y), th = i * 2.399963;
    return out.set(Math.cos(th) * rr, y, Math.sin(th) * rr);
  };
  const d = new THREE.Vector3();
  // camada principal
  for (let i = 0, n = 90; i < n; i++) {
    fib(i, n, d);
    if (!keep(d)) continue;
    const R = 0.285 + 0.025 * Math.max(0, d.y) + rand() * 0.015;
    addSphere(d.x * R * 1.1, d.y * R, d.z * R, 0.085 + rand() * 0.025, tone(d));
  }
  // camada de fora: cachinhos menores deixam a silhueta "fofa"
  for (let i = 0, n = 70; i < n; i++) {
    fib(i + 0.5, n, d);
    if (!keep(d, 1)) continue;
    const R = 0.35 + 0.02 * Math.max(0, d.y) + rand() * 0.02;
    addSphere(d.x * R * 1.08, d.y * R, d.z * R, 0.048 + rand() * 0.02, tone(d));
  }
  // argolinhas (definição dos cachos)
  for (let i = 0, n = 40; i < n; i++) {
    fib(i + 0.25, n, d);
    if (!keep(d, 1) || rand() < 0.45) continue;
    const R = 0.385 + rand() * 0.02;
    const p = d.clone().multiplyScalar(R);
    p.x *= 1.08;
    addRing(p, d, 0.028 + rand() * 0.01, rand() < 0.5 ? C.hairDark : C.hair2);
  }
  // franja: cachinhos na testa, acima das sobrancelhas
  for (const [x, yy, r] of [[-0.46, 0.66, 0.072], [-0.23, 0.7, 0.08], [0.02, 0.69, 0.082], [0.26, 0.7, 0.078], [0.47, 0.65, 0.07],
    [-0.34, 0.83, 0.08], [-0.08, 0.86, 0.085], [0.18, 0.85, 0.084], [0.4, 0.8, 0.075]]) {
    d.set(x, yy, Math.sqrt(Math.max(0.05, 1 - x * x - yy * yy))).normalize();
    addSphere(d.x * 0.305, d.y * 0.305, d.z * 0.305, r, rand() < 0.5 ? C.hair2 : C.hair);
  }
  const volume = new THREE.Mesh(mergeGeometries(parts, false), mat);
  volume.castShadow = true;
  volume.receiveShadow = true;
  addOutline(volume);
  head.add(volume);
  for (const p of parts) p.dispose();

  // cachinhos-mola
  const springs = [];
  const ringlet = (n) => {
    const ps = [];
    for (let i = 0; i < n; i++) {
      const r = 0.044 - i * 0.004;
      const g = new THREE.TorusGeometry(r, r * 0.52, 5, 12);
      g.rotateX(Math.PI / 2 + (i % 2 ? 0.5 : -0.5));
      g.rotateY(i * 0.9);
      g.translate(i % 2 ? 0.007 : -0.007, -0.022 - i * 0.042, 0);
      ps.push(colorize(g, i % 2 ? C.hair2 : C.hair));
    }
    const tip = new THREE.SphereGeometry(0.028, 9, 7).translate(0, -0.03 - n * 0.042, 0);
    ps.push(colorize(tip, C.hair));
    const geo = mergeGeometries(ps, false);
    for (const p of ps) p.dispose();
    return geo;
  };
  const anchors = [
    // [x, y, z, n, lateral]
    [0.29, -0.04, 0.13, 4, 1], [-0.29, -0.04, 0.13, 4, -1],
    [0.34, -0.1, -0.06, 4, 1], [-0.34, -0.1, -0.06, 4, -1],
    [0.19, -0.2, -0.25, 5, 0.5], [-0.19, -0.2, -0.25, 5, -0.5], [0.0, -0.22, -0.29, 5, 0],
  ];
  for (const [x, y, z, n, lat] of anchors) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    const m = new THREE.Mesh(ringlet(n), mat);
    m.rotation.y = rand() * 3;     // cada cachinho gira de um jeito
    m.castShadow = true;
    addOutline(m);
    pivot.add(m);
    head.add(pivot);
    const rz = lat * 0.12, rx = z < 0 ? 0.1 : -0.05;
    springs.push({ pivot, kind: 'hang', rx, rz, x: rx, z: rz, vx: 0, vz: 0, s: 0, vs: 0,
      k: 55 + rand() * 20, c: 4.5, ph: rand() * 6 });
  }

  // antena (cachinho em espiral no topo)
  const ahoge = new THREE.Group();
  ahoge.position.set(0.03, 0.385, 0.06);
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.02, 0), new THREE.Vector3(0.0, 0.06, 0.0), new THREE.Vector3(0.025, 0.115, 0.03),
    new THREE.Vector3(0.0, 0.14, 0.075), new THREE.Vector3(-0.035, 0.115, 0.085), new THREE.Vector3(-0.03, 0.08, 0.06),
    new THREE.Vector3(0.0, 0.075, 0.045),
  ]);
  const tube = new THREE.Mesh(colorize(new THREE.TubeGeometry(curve, 30, 0.014, 6), C.hair2), mat);
  tube.castShadow = true;
  addOutline(tube);
  ahoge.add(tube);
  head.add(ahoge);
  springs.push({ pivot: ahoge, kind: 'up', rx: -0.1, rz: 0.08, x: -0.1, z: 0.08, vx: 0, vz: 0, s: 0, vs: 0,
    k: 90, c: 5, ph: 0 });

  return { volume, springs, ahoge, j: 0, jv: 0 };
}
