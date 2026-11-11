// Os oito passarinhos da casinha: modelos fiéis às espécies e às cores de cada um, e como eles se mexem.
// Um passarinho está sempre em um de três modos: 'perch' (parado em um alvo, que pode se mexer, como o balanço
// ou o ombro da Quim), 'fly' (voando até um alvo) ou 'orbit' (dando voltas em torno da Quim).
import * as THREE from 'three';
import { ASAS_BIRDS } from '../data/asas.js';
import { toon } from '../core/materials.js';
import { createEyes, registerEyes } from '../core/eyes.js';
import { clamp, damp, smoothstep } from '../core/util.js';
import { part, merge, xf } from '../world/fade.js';
import { G } from '../world/kit.js';

const bodyMat = toon('#ffffff', { vertexColors: true });
const S = G.sphere, L = G.sphereLo;
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

function meshOf(parts, parent) {
  const m = new THREE.Mesh(merge(parts), bodyMat);
  m.castShadow = true;
  parent.add(m);
  return m;
}

function makeNameTag(name) {
  const c = document.createElement('canvas');
  c.width = 320; c.height = 96;
  const g = c.getContext('2d');
  g.font = "600 46px 'Fredoka', 'Baloo 2', 'Trebuchet MS', sans-serif";
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 9;
  g.strokeStyle = 'rgba(75,55,104,0.85)';
  g.lineJoin = 'round';
  g.strokeText(name, 160, 50);
  g.fillStyle = '#fff';
  g.fillText(name, 160, 50);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false }));
  sp.scale.set(0.85, 0.255, 1);
  sp.position.y = 0.62;
  return sp;
}

/** Monta um passarinho olhando para +Z, com os pés em y=0. */
function buildBird(def) {
  const c = def.cores, ag = def.kind === 'agapornis';
  const root = new THREE.Group();
  root.name = 'asas_' + def.id;
  const body = new THREE.Group();
  body.position.y = 0.055;
  root.add(body);

  const round = def.roundness;
  const bw = (ag ? 0.1 : 0.085) * round, bh = ag ? 0.115 : 0.12, bd = (ag ? 0.105 : 0.095) * round;
  const bp = [
    part(S, c.corpo, 0, xf(0, 0.12, 0, bw, bh, bd)),
    part(S, c.barriga, 0, xf(0, 0.1, 0.03, bw * 0.84, bh * 0.76, bd * 0.76)),
  ];
  for (const s of [-1, 1]) bp.push(part(G.cyl8, '#e8a7a0', 0, xf(s * 0.04, -0.02, 0.02, 0.009, 0.075, 0.009)), part(L, '#e8a7a0', 0, xf(s * 0.04, -0.052, 0.04, 0.02, 0.008, 0.035)));
  if (ag) bp.push(part(S, c.colar, 0, xf(0, 0.2, 0.012, 0.09, 0.034, 0.088)));
  meshOf(bp, body);

  // cabeça
  const head = new THREE.Group();
  head.position.set(0, ag ? 0.262 : 0.25, 0.02);
  body.add(head);
  const hr = (ag ? 0.092 : 0.076) * Math.sqrt(round);
  const hp = [part(S, c.cabeca, 0, xf(0, 0, 0, hr, hr, hr))];
  if (ag) {
    hp.push(part(S, c.rosto, 0, xf(0, -0.012, 0.03, hr * 0.92, hr * 0.84, hr * 0.8)));
    hp.push(part(S, c.bico, 0, xf(0, -0.03, 0.09, 0.034, 0.038, 0.032)));
    hp.push(part(S, c.bico, 0, xf(0, -0.058, 0.082, 0.02, 0.022, 0.018)));
  } else {
    hp.push(part(S, c.rosto, 0, xf(0, -0.014, 0.024, hr * 0.92, hr * 0.86, hr * 0.84)));
    // listrinhas finas na nuca
    for (let i = 0; i < 5; i++) {
      const a = 0.5 + i * 0.36, y = Math.cos(a) * hr * 1.01, z = -Math.sin(a) * hr * 1.01;
      hp.push(part(L, c.barras, 0, xf(0, y, z, hr * 0.8 * Math.sin(a + 0.2), 0.0052, 0.012, -a + Math.PI / 2 - 1.57)));
    }
    hp.push(part(S, c.bico, 0, xf(0, -0.026, 0.074, 0.02, 0.027, 0.02)));
    hp.push(part(S, c.cera, 0, xf(0, 0.002, 0.07, 0.022, 0.012, 0.013)));
    for (const s of [-1, 1]) {
      hp.push(part(S, c.bochecha, 0, xf(s * 0.054, -0.032, 0.04, 0.012, 0.02, 0.016)));
      if (c.pintas) for (const k of [0.3, 0.75]) hp.push(part(L, c.pintas, 0, xf(s * 0.02 * (1 + k * 1.3), -0.066, 0.056 - k * 0.012, 0.0072, 0.0072, 0.0072)));
    }
  }
  meshOf(hp, head);

  const eyes = createEyes({ size: ag ? 0.036 : 0.033, spacing: ag ? 0.088 : 0.075 });
  eyes.position.set(0, ag ? 0.022 : 0.018, ag ? 0.076 : 0.062);
  eyes.userData.sleepyOverride = 0;
  head.add(eyes);
  registerEyes(eyes);
  if (ag) {  // o anel branco em volta do olho, marca dos agapórnis
    const ring = new THREE.MeshToonMaterial({ color: '#ffffff' });
    for (const s of [-1, 1]) {
      const m = new THREE.Mesh(G.torusThin, ring);
      m.position.set(s * 0.044, 0.022, 0.075);
      m.scale.setScalar(0.046);
      head.add(m);
    }
  }

  // asas (com pivô no ombro)
  const wings = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * bw * 0.95, 0.195, -0.008);
    body.add(pivot);
    const wp = [part(S, c.asa, 0, xf(s * 0.012, -0.075, -0.024, 0.024, 0.105, 0.058, -0.2))];
    if (ag) wp.push(part(S, c.pontaAsa, 0, xf(s * 0.016, -0.14, -0.05, 0.018, 0.05, 0.036, -0.2)));
    else for (let i = 0; i < 5; i++) {
      const y = -0.03 - i * 0.033, z = -0.008 - i * 0.012;
      wp.push(part(L, c.barras, 0, xf(s * 0.034, y, z, 0.006, 0.0052, 0.042 - i * 0.003, -0.2)));
    }
    meshOf(wp, pivot);
    wings.push({ pivot, s });
  }

  // cauda: curtinha e larga nos agapórnis, longa e fina nos periquitos
  const tail = new THREE.Group();
  tail.position.set(0, 0.06, -0.075);
  body.add(tail);
  meshOf(ag
    ? [part(S, c.cauda, 0, xf(0, -0.02, -0.052, 0.042, 0.016, 0.075, -0.25))]
    : [part(S, c.cauda, 0, xf(-0.012, -0.045, -0.115, 0.017, 0.009, 0.14, -0.38)), part(S, c.cauda, 0, xf(0.012, -0.045, -0.115, 0.017, 0.009, 0.14, -0.38))], tail);

  const tag = makeNameTag(def.name);
  root.add(tag);
  root.scale.setScalar(def.size);
  return { root, body, head, wings, tail, eyes, tag };
}

export function createBirds(game, house) {
  const scene = game.render.scene;
  const list = [];
  const byId = {};
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3();

  ASAS_BIRDS.forEach((def, i) => {
    const b = {
      def, id: def.id, ...buildBird(def),
      mode: 'perch', pos: new THREE.Vector3(), yaw: 0, target: null, faceQuim: false, faceAt: null,
      from: new THREE.Vector3(), ctrl: new THREE.Vector3(), k: 0, dur: 1, resolve: null,
      busy: false, happy: 0, pet: 0, peck: 0, fluff: 0, t: i * 1.7, flap: 0,
      act: null, actT: 0, nextAct: 1 + i * 0.6, roamT: 12 + i * 5, talk: 0, orbitA: i * 0.9, chirpT: 3 + i * 2.3,
    };
    scene.add(b.root);
    list.push(b);
    byId[def.id] = b;
  });

  const anchorTarget = (a) => (out) => a.getWorldPosition(out);

  function setPerch(b, anchor) {
    b.home = b.home ?? anchor;
    b.target = anchorTarget(anchor);
    b.perchAnchor = anchor;
    b.mode = 'perch';
    b.target(b.pos);
  }

  /** Voa até o alvo (function(out) ou Object3D). Resolve ao pousar. */
  function send(b, target, dur = 1.6) {
    b.resolve?.();
    b.target = target.isObject3D ? anchorTarget(target) : target;
    b.perchAnchor = target.isObject3D ? target : null;
    b.from.copy(b.pos);
    b.k = 0;
    b.dur = dur;
    b.mode = 'fly';
    return new Promise((res) => { b.resolve = res; });
  }

  const goHome = (b, dur = 1.6) => send(b, b.home, dur);

  function snapHome(b) {
    b.resolve?.();
    b.resolve = null;
    setPerch(b, b.home);
    b.busy = false; b.happy = 0; b.pet = 0; b.peck = 0; b.faceAt = null;
  }

  const chirp = (b, ch = 'a') => game.audio?.murmur?.(b.def.voice, ch);

  function perchMotion(b, dt, quim) {
    // gestos soltos: olhar em volta, bicar, ajeitar as penas, pulinho
    b.nextAct -= dt;
    if (b.nextAct <= 0 && !b.act) {
      b.act = ['olha', 'olha', 'bica', 'ajeita', 'pulinho'][(Math.random() * 5) | 0];
      b.actT = 0;
      b.nextAct = 2 + Math.random() * 5;
    }
    let hx = 0, hz = 0, hop = 0;
    if (b.act) {
      b.actT += dt;
      const t = b.actT;
      if (b.act === 'olha') { hz = Math.sin(t * 2) * 0.35; if (t > 1.4) b.act = null; }
      else if (b.act === 'bica') { hx = Math.max(0, Math.sin(t * 9)) * 0.7; if (t > 1) b.act = null; }
      else if (b.act === 'ajeita') { hx = 0.5; hz = Math.sin(t * 16) * 0.2; if (t > 1.1) b.act = null; }
      else { hop = Math.max(0, Math.sin(t * 9)) * 0.05; if (t > 0.7) b.act = null; }
    }
    if (b.happy > 0) { hop = Math.abs(Math.sin(b.t * 9)) * 0.06 * b.happy; hz = Math.sin(b.t * 7) * 0.3; }
    if (b.pet > 0) { hx = 0.3; hz = Math.sin(b.t * 2.6) * 0.42; }
    if (b.peck > 0) { hx = Math.max(0, Math.sin(b.t * 8)) * 0.85; }
    return { hx, hz, hop, flap: b.happy > 0 ? 0.22 + Math.sin(b.t * 24) * 0.14 : 0 };
  }

  function update(dt) {
    const quim = game.player?.position;
    const nearHouse = quim && quim.distanceTo(house.group.position) < 70;
    for (const b of list) {
      if (!nearHouse) { b.root.children.forEach((c) => { c.visible = false; }); continue; }
      b.root.children.forEach((c) => { c.visible = true; });
      b.t += dt;
      let hx = 0, hz = 0, hop = 0, flap = 0, pitch = 0;
      if (b.mode === 'fly') {
        b.k = Math.min(1, b.k + dt / b.dur);
        const e = smoothstep(0, 1, b.k), it = 1 - e;
        b.target(v1);
        b.ctrl.copy(b.from).lerp(v1, 0.5);
        b.ctrl.y = Math.max(b.from.y, v1.y) + Math.min(2.2, 0.35 + b.from.distanceTo(v1) * 0.22);
        v2.set(it * it * b.from.x + 2 * it * e * b.ctrl.x + e * e * v1.x, it * it * b.from.y + 2 * it * e * b.ctrl.y + e * e * v1.y, it * it * b.from.z + 2 * it * e * b.ctrl.z + e * e * v1.z);
        v3.copy(v2).sub(b.pos);
        b.pos.copy(v2);
        if (v3.x * v3.x + v3.z * v3.z > 1e-6) b.yaw = wrapAngle(b.yaw + wrapAngle(Math.atan2(v3.x, v3.z) - b.yaw) * clamp(dt * 10, 0, 1));
        flap = Math.sin(b.t * 34) * 0.95;
        pitch = 0.55 * (1 - smoothstep(0.85, 1, b.k));
        if (b.k >= 1) {
          b.mode = 'perch';
          b.resolve?.();
          b.resolve = null;
        }
      } else if (b.mode === 'orbit') {
        b.orbitA += dt * 1.5;
        const r = 1.35 + Math.sin(b.t * 0.7) * 0.25;
        b.pos.set(quim.x + Math.cos(b.orbitA) * r, quim.y + 1.25 + Math.sin(b.t * 1.8) * 0.28, quim.z + Math.sin(b.orbitA) * r);
        b.yaw = Math.atan2(-Math.sin(b.orbitA), Math.cos(b.orbitA));
        flap = Math.sin(b.t * 32) * 0.9;
        pitch = 0.45;
      } else {
        b.target?.(b.pos);
        const m = perchMotion(b, dt, quim);
        hx = m.hx; hz = m.hz; hop = m.hop; flap = m.flap;
        // olha para a Quim quando ela chega perto
        const d = Math.hypot(quim.x - b.pos.x, quim.z - b.pos.z);
        const look = b.faceAt ?? quim;
        if (d < 7 || b.faceQuim || b.faceAt) b.yaw = wrapAngle(b.yaw + wrapAngle(Math.atan2(look.x - b.pos.x, look.z - b.pos.z) - b.yaw) * clamp(dt * 4, 0, 1));
        // piadinhos baixinhos de quem vive feliz
        b.chirpT -= dt;
        if (b.chirpT <= 0) {
          b.chirpT = 5 + Math.random() * 11;
          if (d < 16 && !game.cinematic) chirp(b, 'i');
        }
      }

      b.root.position.copy(b.pos);
      b.root.rotation.y = b.yaw;
      b.body.position.y = damp(b.body.position.y, 0.055 + hop, 18, dt);
      b.body.rotation.x = damp(b.body.rotation.x, pitch, 8, dt);
      b.head.rotation.x = damp(b.head.rotation.x, hx - pitch * 0.7, 12, dt);
      b.head.rotation.z = damp(b.head.rotation.z, hz, 10, dt);
      b.flap = flap;
      for (const w of b.wings) w.pivot.rotation.z = w.s * (0.05 + Math.max(0, flap) * 1.2 + (flap < 0 ? flap * 0.3 : 0));
      b.tail.rotation.x = Math.sin(b.t * 2.4) * 0.05 - pitch * 0.4;
      b.fluff = damp(b.fluff, b.pet > 0 ? 1 : 0, 6, dt);
      const fl = 1 + b.fluff * 0.14;
      b.body.scale.set(fl, 1 + b.fluff * 0.06, fl);
      b.eyes.userData.sleepyOverride = b.pet > 0 ? 0.98 : 0;

      // plaquinha com o nome quando a Quim chega perto
      const near = !game.cinematic && !game.hideHud && b.mode === 'perch' && b.root.visible && Math.hypot(quim.x - b.pos.x, quim.z - b.pos.z) < 4.5;
      b.tag.material.opacity = damp(b.tag.material.opacity, near ? 1 : 0, 8, dt);
    }
  }

  return { list, byId, setPerch, send, goHome, snapHome, chirp, update };
}
