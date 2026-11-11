// Itens que as missões espalham pelo mundo (world.spawnProp): pequenos, coloridos (não desbotam — precisam ser
// achados no reino cinzento), com flutuação suave, giro e um brilho pulsante. Alguns têm olhinhos.
// Extras em obj.userData: bloom() (flor_murcha desabrocha), release() (cipo_prisao se desenrola).
import * as THREE from 'three';
import { toon } from '../core/materials.js';
import { createEyes, registerEyes } from '../core/eyes.js';
import { G, rbox, add, beam, glowTexture } from './kit.js';

const TAU = Math.PI * 2;
const mats = new Map();
const M = (color, opts = {}) => {
  const key = color + JSON.stringify(opts);
  if (!mats.has(key)) mats.set(key, toon(color, opts));
  return mats.get(key);
};
const EGG = ['#ffd6e8', '#d9ecff', '#fff3b0', '#e2d1ff', '#c9f7d9'];
const FLOWER = ['#ff8fc7', '#ffd166', '#c49bff', '#ff9f6b', '#7fd8ff'];

function eyesOn(parent, x, y, z, size, ry = 0, lashes = false) {
  const e = createEyes({ size, lashes });
  e.position.set(x, y, z); e.rotation.y = ry;
  parent.add(e);
  e.userData.sleepyOverride = 0;   // itens ficam acordados (o world respeita esse valor)
  registerEyes(e);
  return e;
}
/** Ovo pintado: listras ou bolinhas. */
// geometrias próprias dos props ficam em cache (spawn/remove de missão não vaza geometria)
let eggGeo = null, jujubaGeo = null;
function egg(g, color, rng) {
  if (!eggGeo) { eggGeo = new THREE.SphereGeometry(0.2, 14, 12); eggGeo.scale(1, 1.3, 1); }
  add(g, eggGeo, M(color));
  if (rng() < 0.5) add(g, G.torusThin, M('#ffffff'), 0, 0.02, 0, 0.2, 0.2, 1.4, Math.PI / 2);
  else for (let i = 0; i < 6; i++) add(g, G.sphereLo, M(i % 2 ? '#ffffff' : '#ff8fab'), Math.cos(i) * 0.19, (i % 3 - 1) * 0.1, Math.sin(i) * 0.19, 0.04);
}
function feather(g, color, big = 1) {
  const p = new THREE.Group();
  add(p, G.sphere, M(color), 0, 0.22 * big, 0, 0.09 * big, 0.3 * big, 0.025 * big);
  add(p, G.cyl8, M('#ffffff'), 0, 0.12 * big, 0.02, 0.012, 0.5 * big, 0.012);
  for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) add(p, G.sphereLo, M(color), sx * 0.07 * big, (0.12 + k * 0.12) * big, 0, 0.06 * big, 0.04 * big, 0.015, 0, 0, sx * 0.6);
  p.rotation.z = 0.35;
  g.add(p);
}

/**
 * type: flor_murcha | flor | ovo | pena | pena_verde | graveto | folha | carta | jujuba | semente |
 *       regador | cipo_prisao | gato | broto
 * opts: { color, scale, float (padrão true para os pequenos), glow (padrão true) }
 */
export function buildProp(type, opts = {}, rng = Math.random) {
  const g = new THREE.Group();
  g.name = 'prop_' + type;
  const body = new THREE.Group();
  g.add(body);
  let float = opts.float ?? true, glow = opts.glow ?? true, spin = 0.8, lift = 0.35, glowColor = '#fff6c9';
  switch (type) {
    case 'flor_murcha': case 'flor': {
      const wilted = type === 'flor_murcha';
      const col = opts.color ?? FLOWER[Math.floor(rng() * FLOWER.length)];
      const stem = new THREE.Group(); body.add(stem);
      add(stem, G.cyl8, M(wilted ? '#9aab8a' : '#6cc46a'), 0, 0.25, 0, 0.025, 0.5, 0.025);
      add(stem, G.sphere, M(wilted ? '#a4b296' : '#7fd47a'), 0.08, 0.15, 0, 0.1, 0.02, 0.05, 0, 0, 0.5);
      const head = new THREE.Group(); head.position.y = 0.5; stem.add(head);
      const pet = wilted ? M('#b9b3c9').clone() : M(col);   // a murcha tem material próprio (muda de cor sozinha)
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        add(head, G.sphere, pet, Math.cos(a) * 0.1, 0, Math.sin(a) * 0.1, 0.09, 0.025, 0.05, 0, -a, 0);
      }
      add(head, G.sphereLo, M(wilted ? '#cfc6a8' : '#ffd84d'), 0, 0.02, 0, 0.06, 0.04, 0.06);
      const eyes = eyesOn(head, 0, 0.03, 0.07, 0.03, 0);
      eyes.rotation.x = -1.2;
      if (wilted) {
        stem.rotation.z = 0.5; head.rotation.z = 1.2;
        eyes.userData.sleepyOverride = 1;
        const bloomCol = opts.bloomColor ?? FLOWER[Math.floor(rng() * FLOWER.length)];
        // desabrochar: o caule se endireita, as pétalas ganham cor e os olhos abrem
        g.userData.bloom = () => {
          g.userData.blooming = 0.001;
          g.userData.bloomTarget = new THREE.Color(bloomCol);
        };
        const grey = new THREE.Color('#b9b3c9');
        g.userData.animBloom = (dt) => {
          if (!g.userData.blooming) return;
          const k = g.userData.blooming = Math.min(1, g.userData.blooming + dt / 1.2);
          stem.rotation.z = 0.5 * (1 - k); head.rotation.z = 1.2 * (1 - k);
          pet.color.lerpColors(grey, g.userData.bloomTarget, k);
          eyes.userData.sleepyOverride = 1 - k;
          body.scale.setScalar(1 + Math.sin(k * Math.PI) * 0.4);
          if (k >= 1) g.userData.blooming = 0;
        };
        float = false; spin = 0;
      } else { spin = 0.4; lift = 0.15; }
      break;
    }
    case 'ovo': egg(body, opts.color ?? EGG[Math.floor(rng() * EGG.length)], rng); spin = 0.5; lift = 0.3; break;
    case 'pena': case 'pena_verde':
      feather(body, opts.color ?? (type === 'pena_verde' ? '#b8f27c' : ['#ffffff', '#ffd23f', '#6ec6ff', '#ff7aa8'][Math.floor(rng() * 4)]), 1.3);
      spin = 1.2; lift = 0.6; glowColor = type === 'pena_verde' ? '#d9ff9e' : glowColor;
      break;
    case 'graveto': {
      add(body, G.cyl8, M('#a8794f'), 0, 0, 0, 0.04, 0.8, 0.04, 0, 0, Math.PI / 2 - 0.2);
      beam(body, M('#a8794f'), 0.1, 0.02, 0, 0.3, 0.2, 0.05, 0.025, G.cyl8);
      add(body, G.sphere, M('#8fdc7a'), 0.32, 0.22, 0.05, 0.07, 0.02, 0.04);
      spin = 0.4; lift = 0.25;
      break;
    }
    case 'folha':
      add(body, G.sphere, M('#7ed98a'), 0, 0, 0, 0.3, 0.03, 0.18, 0, 0, 0.2);
      add(body, G.box, M('#5fbf72'), 0, 0.02, 0, 0.5, 0.01, 0.02, 0, 0, 0.2);
      spin = 0.6; lift = 0.4;
      break;
    case 'carta': {
      add(body, rbox(0.5, 0.34, 0.05, 0.03), M('#fff8f0'));
      add(body, G.cone4, M('#ffe0ea'), 0, 0.05, 0.03, 0.34, 0.2, 0.02, Math.PI, Math.PI / 4, 0);
      for (const sx of [-1, 1]) add(body, G.sphereLo, M('#ff4f8b'), sx * 0.025, 0.0, 0.05, 0.035, 0.035, 0.02);
      add(body, G.cone4, M('#ff4f8b'), 0, -0.03, 0.05, 0.045, 0.05, 0.02, Math.PI, Math.PI / 4, 0);
      body.rotation.x = -0.2;
      spin = 1.0; lift = 0.55;
      break;
    }
    case 'jujuba': {
      const col = opts.color ?? '#ffd23f';
      jujubaGeo ||= new THREE.LatheGeometry([[0, 0], [0.18, 0], [0.21, 0.05], [0.2, 0.13], [0.15, 0.22], [0.08, 0.27], [0, 0.29]].map(([x, y]) => new THREE.Vector2(x, y)), 14);
      add(body, jujubaGeo, M(col, { emissive: col, emissiveIntensity: 0.25 }), 0, -0.14, 0);
      add(body, G.sphereLo, M('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.5 }), 0.07, 0.05, 0.1, 0.03);
      spin = 2.0; lift = 0.5; glowColor = col;
      break;
    }
    case 'semente': {
      add(body, G.sphere, M('#b07a52'), 0, 0, 0, 0.11, 0.15, 0.1);
      add(body, G.hemi, M('#8a5a3c'), 0, 0.07, 0, 0.12, 0.08, 0.12);
      add(body, G.cyl8, M('#6b3f2a'), 0, 0.17, 0, 0.012, 0.06, 0.012);
      eyesOn(body, 0, 0.0, 0.09, 0.03);
      spin = 0.9; lift = 0.35;
      break;
    }
    case 'regador': {
      add(body, rbox(0.42, 0.36, 0.3, 0.1), M('#7fd8c8'), 0, 0.18, 0);
      beam(body, M('#7fd8c8'), 0.15, 0.12, 0, 0.42, 0.38, 0, 0.035, G.cyl8);
      add(body, G.cylTaper, M('#7fd8c8'), 0.44, 0.4, 0, 0.06, 0.06, 0.06, 0, 0, -0.9);
      add(body, G.torus, M('#5fc2b2'), -0.18, 0.32, 0, 0.14, 0.14, 0.7, 0, 0, 0);
      eyesOn(body, 0, 0.22, 0.155, 0.05, 0, true);
      float = false; spin = 0;
      break;
    }
    case 'cipo_prisao': {
      // gaiolinha de cipós enroscados (o Pinceso fica dentro); release() desenrosca
      const vines = new THREE.Group(); body.add(vines);
      for (let i = 0; i < 7; i++) {
        const t = new THREE.Mesh(new THREE.TorusGeometry(0.42 + (i % 3) * 0.05, 0.035, 6, 20), M(i % 2 ? '#5fbf72' : '#7fcf6a'));
        t.position.y = 0.45 + Math.sin(i * 1.7) * 0.12;
        t.rotation.set(i * 0.9, i * 1.3, i * 0.4);
        vines.add(t);
      }
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        add(vines, G.sphere, M('#8fdc7a'), Math.cos(a) * 0.48, 0.3 + (i % 3) * 0.25, Math.sin(a) * 0.48, 0.1, 0.03, 0.06, i, a, 0);
      }
      beam(vines, M('#6cc46a'), 0, 0, 0, 0.2, 1.5, -0.1, 0.03, G.cyl8);
      beam(vines, M('#6cc46a'), 0.1, 0, 0.1, -0.25, 1.4, 0.05, 0.03, G.cyl8);
      g.userData.release = () => { g.userData.releasing = 0.001; };
      g.userData.animRelease = (dt) => {
        if (!g.userData.releasing) return;
        const k = g.userData.releasing = Math.min(1, g.userData.releasing + dt / 1.0);
        vines.children.forEach((o, i) => { o.scale.setScalar(Math.max(0.001, 1 - k)); o.position.y += dt * (i % 2 ? 0.6 : -0.3); });
        if (k >= 1) { g.visible = false; g.userData.releasing = 0; }
      };
      float = false; spin = 0; glow = false;
      break;
    }
    case 'gato': {
      // Bolacha: gatinho pão-de-forma laranja e branco, rabinho balançando
      const fur = M('#ffb36b'), white = M('#fff6ea');
      add(body, G.sphere, fur, 0, 0.22, 0, 0.32, 0.22, 0.42);
      add(body, G.sphere, white, 0, 0.18, 0.2, 0.22, 0.15, 0.22);
      const head = new THREE.Group(); head.position.set(0, 0.42, 0.33); body.add(head);
      add(head, G.sphere, fur, 0, 0, 0, 0.22, 0.19, 0.2);
      add(head, G.sphere, white, 0, -0.05, 0.12, 0.12, 0.08, 0.08);
      for (const sx of [-1, 1]) {
        add(head, G.cone, fur, sx * 0.12, 0.18, 0, 0.07, 0.13, 0.05, 0, 0, -sx * 0.25);
        add(head, G.cone, M('#ffb3c7'), sx * 0.12, 0.17, 0.02, 0.04, 0.08, 0.02, 0, 0, -sx * 0.25);
        add(head, G.sphereLo, M('#ff9fb8'), sx * 0.13, -0.05, 0.16, 0.04, 0.025, 0.01);
      }
      add(head, G.sphereLo, M('#ff7aa8'), 0, -0.02, 0.2, 0.025);
      eyesOn(head, 0, 0.04, 0.16, 0.06, 0, true);
      const tail = new THREE.Group(); tail.position.set(0, 0.25, -0.38); body.add(tail);
      beam(tail, fur, 0, 0, 0, 0.05, 0.35, -0.12, 0.045, G.cyl8);
      add(tail, G.sphereLo, white, 0.05, 0.36, -0.12, 0.06);
      g.userData.animTail = (dt, t) => { tail.rotation.z = Math.sin(t * 3) * 0.5; head.rotation.y = Math.sin(t * 0.7) * 0.3; };
      float = false; spin = 0; glow = false;
      break;
    }
    case 'broto':
      add(body, G.hemi, M('#9b6b4b'), 0, -0.02, 0, 0.18, 0.08, 0.18);
      add(body, G.cyl8, M('#7fcf6a'), 0, 0.12, 0, 0.02, 0.25, 0.02);
      for (const sx of [-1, 1]) add(body, G.sphere, M('#8fe08f'), sx * 0.08, 0.26, 0, 0.09, 0.025, 0.05, 0, 0, sx * 0.4);
      float = false; spin = 0;
      break;
    default:
      add(body, G.icoLo, M(opts.color ?? '#ffd166'), 0, 0, 0, 0.2);
  }
  if (glow) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: glowColor, transparent: true,
      opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    sp.scale.setScalar(1.1);
    sp.position.y = float ? 0 : 0.3;
    g.add(sp);
    g.userData.glow = sp;
  }
  const s = opts.scale ?? 1;
  g.scale.setScalar(s);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  g.userData.prop = { type, float, spin, lift, phase: rng() * TAU, body };
  return g;
}

/** Anima um prop (chamado pelo world a cada quadro para os props próximos). */
export function animateProp(g, dt, t) {
  const p = g.userData.prop;
  if (!p) return;
  if (p.float) p.body.position.y = Math.sin(t * 2 + p.phase) * 0.08;
  if (p.spin) p.body.rotation.y += dt * p.spin;
  const gl = g.userData.glow;
  if (gl) gl.material.opacity = 0.35 + 0.25 * Math.sin(t * 3 + p.phase);
  g.userData.animBloom?.(dt);
  g.userData.animRelease?.(dt);
  g.userData.animTail?.(dt, t);
}
