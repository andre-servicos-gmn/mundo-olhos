// Acessórios da Quim (laco, chapeu, oculos, tiara_penas, coroa_flores, cachecol), feitos por código.
// buildAccessory(id) -> { obj, slot:'head'|'neck', hideAhoge?, update?(dt, t, motion) } ou null.
// Coordenadas em relação ao centro da cabeça (slot 'head') ou à cintura/torso (slot 'neck').
// Referências da cabeça: raio 0,30; cabelo vai até ~0,41 no topo e ~0,42 nas laterais; olhos em x=±0,112.
import * as THREE from 'three';
import { toon } from '../core/materials.js';
import { addOutline } from './outline.js';

const SPH = new THREE.SphereGeometry(1, 14, 10);

function m(geo, mat, { outline = false, shadow = true } = {}) {
  const o = new THREE.Mesh(geo, mat);
  o.castShadow = shadow;
  if (outline) addOutline(o);
  return o;
}
/** Esfera com a escala "assada" na geometria (o contorno fica com espessura certa). */
function ell(sx, sy, sz, seg = 14) {
  return new THREE.SphereGeometry(1, seg, Math.max(6, Math.round(seg * 0.7))).scale(sx, sy, sz);
}

// --- Laço de cetim ------------------------------------------------------------------------------
function laco() {
  const g = new THREE.Group();
  const pink = toon('#ff5d97'), deep = toon('#e43c7c'), dot = toon('#ffffff');
  for (const s of [-1, 1]) {
    const loop = m(ell(0.095, 0.065, 0.035), pink, { outline: true });
    loop.position.set(s * 0.082, 0.012, 0);
    loop.rotation.z = s * 0.28;
    g.add(loop);
    // bolinhas brancas no laço
    for (const [dx, dy] of [[0.03, 0.02], [-0.02, -0.025], [0.055, -0.01]]) {
      const d = m(SPH, dot, { shadow: false });
      d.scale.setScalar(0.011);
      d.position.set(s * 0.082 + s * dx, 0.012 + dy, 0.034);
      g.add(d);
    }
    const tail = m(new THREE.ConeGeometry(0.026, 0.1, 6).translate(0, -0.05, 0), deep, { outline: true });
    tail.position.set(s * 0.025, -0.02, -0.005);
    tail.rotation.z = s * 0.45;
    g.add(tail);
  }
  const knot = m(ell(0.034, 0.03, 0.03), deep, { outline: true });
  g.add(knot);
  g.position.set(0.19, 0.3, 0.17);
  g.rotation.set(-0.35, 0.35, -0.55);
  return { obj: g, slot: 'head' };
}

// --- Chapéu de sol ------------------------------------------------------------------------------
function chapeu() {
  const g = new THREE.Group();
  const straw = toon('#f4d27e'), straw2 = toon('#e9bf62'), ribbon = toon('#ff7fb0');
  const brim = m(new THREE.CylinderGeometry(0.5, 0.48, 0.022, 40), straw, { outline: true });
  g.add(brim);
  const crown = m(new THREE.SphereGeometry(0.3, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.82, 1), straw2, { outline: true });
  crown.position.y = 0.008;
  g.add(crown);
  const band = m(new THREE.TorusGeometry(0.3, 0.03, 6, 36).rotateX(Math.PI / 2).scale(1, 0.75, 1), ribbon);
  band.position.y = 0.04;
  g.add(band);
  // florzinha na fita
  const fl = new THREE.Group();
  const white = toon('#ffffff'), yel = toon('#ffd34d');
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const p = m(SPH, white, { shadow: false });
    p.scale.set(0.03, 0.03, 0.012);
    p.position.set(Math.cos(a) * 0.032, Math.sin(a) * 0.032, 0);
    fl.add(p);
  }
  const c = m(SPH, yel, { shadow: false }); c.scale.set(0.02, 0.02, 0.016); c.position.z = 0.008; fl.add(c);
  fl.position.set(0.21, 0.05, 0.22);
  fl.rotation.y = 0.75;
  g.add(fl);
  g.position.set(0, 0.315, -0.015);
  g.rotation.set(-0.16, 0, 0.1);
  return { obj: g, slot: 'head', hideAhoge: true };
}

// --- Óculos de Olhar Nuvem ----------------------------------------------------------------------
function oculos() {
  const g = new THREE.Group();
  const frame = toon('#79c3ff'), cloud = toon('#ffffff');
  const lens = new THREE.MeshBasicMaterial({ color: '#d6f0ff', transparent: true, opacity: 0.22, depthWrite: false });
  for (const s of [-1, 1]) {
    const e = new THREE.Group();
    e.position.set(s * 0.115, -0.02, 0.322);
    e.rotation.y = s * 0.33;
    const rim = m(new THREE.TorusGeometry(0.105, 0.013, 6, 28), frame, { outline: true });
    e.add(rim);
    const l = new THREE.Mesh(new THREE.CircleGeometry(0.1, 24), lens);
    e.add(l);
    // nuvenzinha no canto de fora da armação
    const nv = new THREE.Group();
    for (const [x, y, r] of [[0, 0, 0.022], [0.02, 0.006, 0.018], [-0.02, 0.004, 0.017]]) {
      const b = m(SPH, cloud, { shadow: false }); b.scale.set(r, r, r * 0.6); b.position.set(x, y, 0); nv.add(b);
    }
    nv.position.set(s * 0.085, 0.075, 0.01);
    e.add(nv);
    g.add(e);
    // haste até a orelha (some dentro do cabelo)
    const arm = m(new THREE.BoxGeometry(0.012, 0.012, 0.26), frame);
    arm.position.set(s * 0.245, 0.0, 0.17);
    arm.rotation.y = s * -0.32;
    g.add(arm);
  }
  const bridge = m(new THREE.TorusGeometry(0.03, 0.01, 5, 10, Math.PI), frame);
  bridge.position.set(0, -0.005, 0.345);
  g.add(bridge);
  return { obj: g, slot: 'head' };
}

// --- Tiara de penas ------------------------------------------------------------------------------
function tiaraPenas() {
  const g = new THREE.Group();
  const gold = toon('#ffcf5a', { emissive: '#ffb020', emissiveIntensity: 0.15 });
  const band = m(new THREE.TorusGeometry(0.37, 0.018, 6, 40, Math.PI), gold, { outline: true });
  g.add(band);
  const colors = ['#4fd6a6', '#ff7eb6', '#ffd166', '#77b6ff', '#b48cff'];
  const feathers = [];
  colors.forEach((c, k) => {
    const piv = new THREE.Group();
    const a = Math.PI / 2 + (k - 2) * 0.2;
    piv.position.set(Math.cos(a) * 0.37, Math.sin(a) * 0.37, 0.012);
    piv.rotation.z = a - Math.PI / 2 + (k - 2) * 0.12;
    const f = m(ell(0.036, 0.13, 0.012).translate(0, 0.12, 0), toon(c), { outline: true });
    piv.add(f);
    const spine = m(new THREE.CylinderGeometry(0.004, 0.004, 0.2, 4).translate(0, 0.1, 0.012), toon('#ffffff'), { shadow: false });
    piv.add(spine);
    g.add(piv);
    feathers.push({ piv, base: piv.rotation.z, ph: k * 1.3 });
  });
  const gem = m(ell(0.03, 0.03, 0.02), toon('#ff5d97', { emissive: '#ff5d97', emissiveIntensity: 0.3 }));
  gem.position.set(0, 0.37, 0.02);
  g.add(gem);
  g.position.set(0, 0.02, 0.07);
  g.rotation.x = -0.42;
  return {
    obj: g, slot: 'head',
    update(dt, t, mo) {
      for (const f of feathers) {
        f.piv.rotation.z = f.base + Math.sin(t * 3.1 + f.ph) * 0.05 + mo.side * 0.08;
        f.piv.rotation.x = -mo.fwd * 0.1 + Math.sin(t * 2.3 + f.ph) * 0.04;
      }
    },
  };
}

// --- Coroa de flores ----------------------------------------------------------------------------
function coroaFlores() {
  const g = new THREE.Group();
  const vine = m(new THREE.TorusGeometry(0.36, 0.017, 6, 44).rotateX(Math.PI / 2), toon('#5fbf6a'), { outline: true });
  g.add(vine);
  const petalCols = ['#ff8fc2', '#ffffff', '#c9a6ff', '#ffb38a', '#ff8fc2', '#ffffff', '#ffd34d', '#c9a6ff', '#ffb38a'];
  const yel = toon('#ffd34d'), leaf = toon('#7fd16e');
  const n = petalCols.length;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.2;
    const fl = new THREE.Group();
    const pm = toon(petalCols[i]);
    for (let k = 0; k < 5; k++) {
      const b = (k / 5) * Math.PI * 2;
      const p = m(SPH, pm, { shadow: false });
      p.scale.set(0.03, 0.03, 0.013);
      p.position.set(Math.cos(b) * 0.03, Math.sin(b) * 0.03, 0);
      fl.add(p);
    }
    const c = m(SPH, petalCols[i] === '#ffd34d' ? toon('#ff9f43') : yel, { shadow: false });
    c.scale.set(0.019, 0.019, 0.016); c.position.z = 0.008;
    fl.add(c);
    fl.position.set(Math.sin(a) * 0.375, 0.012, Math.cos(a) * 0.375);
    fl.rotation.y = a;               // a florzinha olha para fora do anel
    fl.rotation.x = -0.35;
    g.add(fl);
    const lf = m(ell(0.03, 0.012, 0.016), leaf, { shadow: false });
    const a2 = a + Math.PI / n;
    lf.position.set(Math.sin(a2) * 0.37, 0, Math.cos(a2) * 0.37);
    lf.rotation.y = a2;
    g.add(lf);
  }
  g.position.set(0, 0.19, -0.02);
  g.rotation.x = 0.3;
  return { obj: g, slot: 'head' };
}

// --- Cachecol fofinho ---------------------------------------------------------------------------
function cachecol() {
  const g = new THREE.Group();
  const blue = toon('#7ec8ff'), white = toon('#ffffff');
  const ring = m(new THREE.TorusGeometry(0.15, 0.05, 8, 28).rotateX(Math.PI / 2).scale(1, 0.85, 1), blue, { outline: true });
  g.add(ring);
  for (const dy of [-0.024, 0.024]) {
    const st = m(new THREE.TorusGeometry(0.153, 0.016, 5, 28).rotateX(Math.PI / 2), white, { shadow: false });
    st.position.y = dy;
    g.add(st);
  }
  // pontinha pendurada que balança
  const tailPiv = new THREE.Group();
  tailPiv.position.set(0.075, -0.01, 0.14);
  const tail = m(new THREE.CapsuleGeometry(0.038, 0.12, 4, 10).scale(1, 1, 0.45).translate(0, -0.1, 0), blue, { outline: true });
  tailPiv.add(tail);
  const stripe = m(new THREE.CylinderGeometry(0.04, 0.04, 0.02, 10).scale(1, 1, 0.47), white, { shadow: false });
  stripe.position.y = -0.11;
  tailPiv.add(stripe);
  for (let i = -1; i <= 1; i++) {
    const fr = m(new THREE.CylinderGeometry(0.006, 0.004, 0.035, 4), white, { shadow: false });
    fr.position.set(i * 0.018, -0.215, 0);
    tailPiv.add(fr);
  }
  tailPiv.rotation.z = 0.15;
  g.add(tailPiv);
  g.position.set(0, 0.3, 0.005);
  let ax = 0, vx = 0, az = 0, vz = 0;
  return {
    obj: g, slot: 'neck',
    update(dt, t, mo) {
      // mola simples: aceleração para frente joga a ponta para trás, curva para o lado
      vx += (-90 * (ax - (mo.fwd * 0.5 + mo.speed * 0.05)) - 7 * vx) * dt;
      vz += (-90 * (az - mo.side * 0.5) - 7 * vz) * dt;
      ax += vx * dt; az += vz * dt;
      tailPiv.rotation.x = -Math.min(1.2, Math.max(-0.4, ax)) - 0.25;
      tailPiv.rotation.z = 0.15 + Math.max(-0.6, Math.min(0.6, az)) + Math.sin(t * 2) * 0.03;
    },
  };
}

const BUILDERS = { laco, chapeu, oculos, tiara_penas: tiaraPenas, coroa_flores: coroaFlores, cachecol };

export const ACCESSORY_IDS = Object.keys(BUILDERS);

export function buildAccessory(id) {
  const b = BUILDERS[id];
  if (!b) return null;
  const acc = b();
  acc.obj.name = 'acessorio_' + id;
  return acc;
}
