// A Casinha Asas de Saudade e a clareira em volta: modelo, colisão, poleiros, luz dourada e vaga-lumes.
// Coordenadas locais: +Z sai pela porta (a casinha olha para o leste, de onde vem a trilhinha).
import * as THREE from 'three';
import { SPOTS } from '../data/worldmap.js';
import { ASAS_BIRDS, ASAS_NAME, ASAS_DEDICATORIA } from '../data/asas.js';
import { toon } from '../core/materials.js';
import { createEyes, registerEyes } from '../core/eyes.js';
import { mulberry32 } from '../core/util.js';
import { G, add, beam, mat, rbox, signTexture, glowTexture, bakeStatic, skipOverridePasses } from '../world/kit.js';

const ASAS = SPOTS.asas_de_saudade;
const ROT = Math.PI / 2;
const W = 4.2, D = 4.2, H = 3.4, THICK = 0.22, PORCH = 2.4, ROOF_H = 2.4;
const FIREFLIES = 70;

const C = {
  parede: '#fff1dc', paredeFora: '#ffdfc2', madeira: '#c08a5e', madeiraClara: '#e2b98c', piso: '#d9ab7d',
  tapete: '#bcdcf5', tapete2: '#ffffff', corda: '#ad8560', pedra: '#c9c3d4', folha: '#7cc667',
};

/** Parede com arco de porta opcional (sai de y=0) e janelas redondas. Largura centrada em x=0. */
function wallGeometry(w, h, { door, windows = [] }) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  if (door) {
    s.lineTo(-door.hw, 0);
    s.lineTo(-door.hw, door.h - door.hw);
    s.absarc(0, door.h - door.hw, door.hw, Math.PI, 0, true);
    s.lineTo(door.hw, 0);
  }
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2, h);
  s.lineTo(-w / 2, h);
  s.closePath();
  for (const o of windows) {
    const hole = new THREE.Path();
    hole.absarc(o.x, o.y, o.r, 0, Math.PI * 2, true);
    s.holes.push(hole);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: THICK, bevelEnabled: false, curveSegments: 22 });
  g.translate(0, 0, -THICK / 2);
  return g;
}

function plaque(parent, text, w, h, x, y, z, opts) {
  const tex = signTexture(text, { w: Math.round(w * 280), h: Math.round(h * 280), ...opts });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, transparent: true, alphaTest: 0.5 }));
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

export function buildCasinha(game) {
  const world = game.world;
  const scene = game.render.scene;
  const rng = mulberry32(8);
  const cs = Math.cos(ROT), sn = Math.sin(ROT);
  const M = (color, opts) => mat(color, undefined, opts);

  // o piso fica um tiquinho acima do ponto mais alto do chão debaixo da casinha
  let gy = -Infinity;
  for (let i = -6; i <= 6; i++) for (let j = -6; j <= 8; j++) {
    const lx = i * 0.8, lz = j * 0.8;
    gy = Math.max(gy, world.getHeight(ASAS.x + lx * cs + lz * sn, ASAS.z - lx * sn + lz * cs));
  }
  const floorY = gy + 0.08;

  const group = new THREE.Group();
  group.name = 'casinha_asas_de_saudade';
  group.position.set(ASAS.x, floorY, ASAS.z);
  group.rotation.y = ROT;
  scene.add(group);

  const anchors = {};
  function anchor(id, x, y, z, parent = group) {
    const o = new THREE.Object3D();
    o.position.set(x, y, z);
    parent.add(o);
    anchors[id] = o;
    return o;
  }

  // ---- paredes ---------------------------------------------------------------------------------
  const wallMat = M(C.paredeFora), trim = M(C.madeira), trimLight = M(C.madeiraClara);
  const sideWindows = [{ x: -1.7, y: 1.95, r: 0.72 }, { x: 1.7, y: 1.95, r: 0.72 }];
  const door = { hw: 1.3, h: 2.9 };
  const front = new THREE.Mesh(wallGeometry(W * 2, H, { door }), wallMat);
  front.position.z = D;
  group.add(front);
  const back = new THREE.Mesh(wallGeometry(W * 2, H, {}), M(C.parede));
  back.position.z = -D;
  group.add(back);
  for (const s of [-1, 1]) {
    const side = new THREE.Mesh(wallGeometry(D * 2, H, { windows: sideWindows }), wallMat);
    side.position.x = s * W;
    side.rotation.y = Math.PI / 2;
    group.add(side);
    for (const o of sideWindows) add(group, G.torus, trim, s * (W + 0.02), o.y, o.x, o.r + 0.06, o.r + 0.06, 0.55, 0, Math.PI / 2);
  }
  // batente em arco da porta
  const arch = new THREE.TorusGeometry(door.hw + 0.05, 0.1, 8, 24, Math.PI);
  const archM = new THREE.Mesh(arch, trim);
  archM.position.set(0, door.h - door.hw, D + 0.14);
  group.add(archM);
  for (const s of [-1, 1]) add(group, G.cyl8, trim, s * (door.hw + 0.05), (door.h - door.hw) / 2, D + 0.14, 0.1, door.h - door.hw, 0.1);

  // ---- piso, tapete e varanda ------------------------------------------------------------------
  add(group, rbox(W * 2 + 0.3, 0.16, D * 2 + 0.3, 0.05), M(C.piso), 0, -0.08, 0);
  for (let i = -5; i <= 5; i++) add(group, G.box, M(C.madeira), i * 0.76, 0.004, 0, 0.018, 0.006, D * 2).userData.noShadow = true;
  add(group, G.disc, M(C.tapete), 0, 0.02, 0.4, 2.1, 0.03, 2.1).userData.noShadow = true;
  add(group, G.disc, M(C.tapete2), 0, 0.03, 0.4, 1.55, 0.03, 1.55).userData.noShadow = true;
  add(group, G.disc, M(C.tapete), 0, 0.04, 0.4, 1, 0.03, 1).userData.noShadow = true;

  const porchZ = D + PORCH / 2;
  add(group, rbox(W * 2 + 0.3, 0.16, PORCH + 0.1, 0.05), M(C.madeiraClara), 0, -0.08, porchZ);
  for (const s of [-1, 1]) {
    add(group, G.cyl8, trim, s * W, 1.68, D + PORCH - 0.08, 0.1, 3.36, 0.1);
    beam(group, trimLight, s * W, 1, D + PORCH - 0.08, s * 1.5, 1, D + PORCH - 0.08, 0.06);   // corrimão-poleiro
    add(group, G.cyl8, trim, s * 1.5, 0.5, D + PORCH - 0.08, 0.06, 1, 0.06);
  }
  anchor('corrimao_e', -2.85, 1.06, D + PORCH - 0.08);
  anchor('corrimao_d', 2.85, 1.06, D + PORCH - 0.08);
  anchor('par_a', 3.4, 1.06, D + PORCH - 0.08);
  anchor('par_b', 2.3, 1.06, D + PORCH - 0.08);
  // beiral da varanda
  add(group, rbox(W * 2 + 0.5, 0.14, PORCH + 0.2, 0.05), M('#f7b8cf'), 0, 3.38, porchZ, 1, 1, 1, 0.05);

  // banquinho da varanda
  const seatX = -2.7, seatZ = D + 0.75;
  add(group, rbox(1.7, 0.1, 0.55, 0.04), M('#bcdcf5'), seatX, 0.42, seatZ);
  add(group, rbox(1.7, 0.5, 0.08, 0.03), M('#bcdcf5'), seatX, 0.82, seatZ - 0.24);
  for (const s of [-1, 1]) add(group, G.box, trim, seatX + s * 0.72, 0.2, seatZ, 0.08, 0.4, 0.5);
  anchor('banco_a', seatX - 0.72, 1.08, seatZ - 0.24);
  anchor('banco_b', seatX - 0.22, 1.08, seatZ - 0.24);
  anchor('banco_c', seatX + 0.7, 1.08, seatZ - 0.24);

  // ---- telhado (some quando a câmera sobe lá dentro) ---------------------------------------------
  const roof = new THREE.Group();
  roof.name = 'telhado';
  roof.userData.dynamic = true;
  group.add(roof);
  const roofW = W * 2 + 1.2, roofL = D * 2 + 1.4;
  const shell = add(roof, G.prism, toon('#f3dcc4'), 0, H, 0, roofW, ROOF_H, roofL);
  shell.castShadow = true;
  add(roof, G.box, toon(C.madeiraClara), 0, H + 0.02, 0, W * 2, 0.08, D * 2);

  // telhinhas pastel nas duas águas
  const slope = Math.hypot(roofW / 2, ROOF_H), ang = Math.atan2(ROOF_H, roofW / 2);
  const rows = 11, cols = 13, tileGeo = new THREE.SphereGeometry(1, 10, 6);
  const tiles = new THREE.InstancedMesh(tileGeo, toon('#ffffff'), rows * cols * 2);
  tiles.castShadow = true;
  const dummy = new THREE.Object3D(), col = new THREE.Color();
  const PASTEL = ['#f7b8cf', '#bcdcf5', '#fff0b8', '#cdbcf0', '#f7b8cf', '#bcdcf5'];
  let ti = 0;
  for (const side of [-1, 1]) for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const along = (r + 0.5) / rows * slope;
    dummy.position.set(side * (roofW / 2 - Math.cos(ang) * along), H + Math.sin(ang) * along + 0.04, -roofL / 2 + (c + 0.5 + (r % 2 ? 0.25 : -0.25)) / cols * roofL);
    dummy.rotation.set(0, 0, side > 0 ? ang : -ang);
    dummy.scale.set(slope / rows * 0.72, 0.1, roofL / cols * 0.6);
    dummy.updateMatrix();
    tiles.setMatrixAt(ti, dummy.matrix);
    tiles.setColorAt(ti, col.set(PASTEL[(r * 2 + c + (side > 0 ? 1 : 0)) % PASTEL.length]));
    ti++;
  }
  roof.add(tiles);

  // placa com o nome, no frontão, e olhinhos da casinha
  plaque(roof, ASAS_NAME, 3.6, 0.82, 0, H + 0.62, D + 0.73, { size: 50 });
  for (const s of [-1, 1]) {
    const e = createEyes({ size: 0.34, lashes: true, single: true });
    e.position.set(s * 2.75, 2.7, D + 0.14);
    e.userData.sleepyOverride = 0;
    group.add(e);
    registerEyes(e);
  }
  plaque(group, ASAS_DEDICATORIA, 1.3, 0.72, 2.45, 1.45, D + 0.12, { size: 34, bg: '#fff7ea' });

  // ---- lá dentro -----------------------------------------------------------------------------------
  // balanço de Kié e Vidinho
  const swing = new THREE.Group();
  swing.userData.dynamic = true;
  swing.position.set(-1.9, H - 0.02, -1.5);
  group.add(swing);
  for (const s of [-1, 1]) add(swing, G.cyl8, toon(C.corda), s * 0.55, -0.75, 0, 0.018, 1.5, 0.018);
  add(swing, G.cyl8, toon(C.madeira), 0, -1.5, 0, 0.04, 1.2, 0.04, 0, 0, Math.PI / 2);
  anchor('balanco_a', -0.2, -1.47, 0, swing);
  anchor('balanco_b', 0.2, -1.47, 0, swing);

  // poleiro em T
  add(group, G.disc, trim, 1.9, 0.04, -1.3, 0.4, 0.08, 0.4);
  add(group, G.cyl8, trimLight, 1.9, 0.65, -1.3, 0.05, 1.2, 0.05);
  add(group, G.cyl8, trimLight, 1.9, 1.25, -1.3, 0.045, 1.2, 0.045, 0, 0, Math.PI / 2);
  anchor('t_a', 1.55, 1.29, -1.3);
  anchor('t_b', 2.25, 1.29, -1.3);
  world.addCollider(colliderCircle(1.9, -1.3, 0.3));

  // mesinha de sementes
  add(group, G.cyl8, trim, 3, 0.35, 2.7, 0.08, 0.7, 0.08);
  add(group, G.disc, trimLight, 3, 0.72, 2.7, 0.62, 0.06, 0.62);
  add(group, G.disc, M('#f7b8cf'), 3, 0.77, 2.7, 0.42, 0.05, 0.42);
  for (let i = 0; i < 16; i++) {
    const a = rng() * 6.28, r = Math.sqrt(rng()) * 0.33;
    add(group, G.sphereLo, M(i % 2 ? '#e8c47a' : '#d7a85a'), 3 + Math.cos(a) * r, 0.81, 2.7 + Math.sin(a) * r, 0.028, 0.018, 0.04, 0, a).userData.noShadow = true;
  }
  anchor('mesa', 3.3, 0.8, 2.45);
  world.addCollider(colliderCircle(3, 2.7, 0.55));

  // espelhinho e os ninhos com os nomes na parede do fundo
  add(group, G.torus, trim, W - 0.14, 1.65, 0.4, 0.5, 0.5, 0.6, 0, Math.PI / 2);
  add(group, G.disc, M('#d8f2ff', { emissive: '#bfe6ff', emissiveIntensity: 0.25 }), W - 0.13, 1.65, 0.4, 0.46, 0.02, 0.46, 0, 0, Math.PI / 2);
  ASAS_BIRDS.forEach((b, i) => {
    const x = -2.97 + i * 0.85;
    add(group, rbox(0.72, 0.62, 0.4, 0.1), M(b.look.body), x, 2.3, -D + 0.3);
    add(group, G.disc, M('#5d4a3a'), x, 2.32, -D + 0.5, 0.2, 0.02, 0.2, Math.PI / 2);
    plaque(group, b.name, 0.76, 0.26, x, 1.82, -D + 0.14, { size: 62, w: 340, h: 116 });
  });
  anchor('prateleira', -0.42, 2.63, -D + 0.3);

  // lanterna quentinha no meio da sala
  beam(group, toon(C.corda), 0, H, 0.4, 0, 2.75, 0.4, 0.015);
  add(group, G.sphere, M('#ffe2a0', { emissive: '#ffbd5e', emissiveIntensity: 1.6 }), 0, 2.58, 0.4, 0.2, 0.24, 0.2);

  // ---- clareira -------------------------------------------------------------------------------------
  const toLocal = (wx, wz) => { const dx = wx - ASAS.x, dz = wz - ASAS.z; return [dx * cs - dz * sn, dx * sn + dz * cs]; };
  // laguinho raso
  const lg = ASAS.laguinho;
  const [lx, lz] = toLocal(lg.x, lg.z);
  const groundAt = (x, z) => world.getHeight(ASAS.x + x * cs + z * sn, ASAS.z - x * sn + z * cs) - floorY;
  const pondY = groundAt(lx, lz) + 0.05;
  add(group, G.disc, M('#a7e3ff', { transparent: true, opacity: 0.8, emissive: '#7fd0ff', emissiveIntensity: 0.25 }), lx, pondY, lz, lg.r, 0.02, lg.r).userData.noShadow = true;
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    add(group, G.icoLo, M(C.pedra), lx + Math.cos(a) * lg.r, pondY + 0.02, lz + Math.sin(a) * lg.r, 0.26 + rng() * 0.12, 0.16, 0.26);
  }
  anchor('banho', lx - lg.r * 0.55, pondY + 0.03, lz + lg.r * 0.2);

  // poleiros de galho e as lanterninhas do caminho
  const stand = (id, x, z) => {
    const y = groundAt(x, z);
    add(group, G.cyl8, trim, x, y + 0.8, z, 0.07, 1.6, 0.07);
    add(group, G.cyl8, trim, x, y + 1.6, z, 0.05, 1.1, 0.05, 0, 0.5, Math.PI / 2);
    for (const s of [-1, 1]) add(group, G.ico, M(C.folha), x + s * 0.55 * Math.cos(0.5), y + 1.68, z - s * 0.55 * Math.sin(0.5), 0.17, 0.11, 0.17);
    anchor(id + '_a', x - 0.25 * Math.cos(0.5), y + 1.64, z + 0.25 * Math.sin(0.5));
    anchor(id + '_b', x + 0.25 * Math.cos(0.5), y + 1.64, z - 0.25 * Math.sin(0.5));
    world.addCollider(colliderCircle(x, z, 0.2));
  };
  stand('galho1', -7.4, -3);
  stand('galho2', 7.4, -2);
  for (const [x, z] of [[-3, 10], [3, 10.4]]) {
    const y = groundAt(x, z);
    add(group, G.cyl8, trim, x, y + 0.6, z, 0.05, 1.2, 0.05);
    add(group, G.sphere, M('#ffe2a0', { emissive: '#ffbd5e', emissiveIntensity: 1.4 }), x, y + 1.3, z, 0.17, 0.2, 0.17);
    world.addCollider(colliderCircle(x, z, 0.15));
  }

  // ---- colisão e piso andável ------------------------------------------------------------------------
  function colliderCircle(x, z, r) {
    return { kind: 'circle', x: ASAS.x + x * cs + z * sn, z: ASAS.z - x * sn + z * cs, r, y0: floorY - 2, y1: floorY + 3, walk: false, id: 'casinha' };
  }
  function box(x, z, hw, hd) {
    world.addCollider({ kind: 'box', x: ASAS.x + x * cs + z * sn, z: ASAS.z - x * sn + z * cs, hw, hd, rotY: ROT, cos: cs, sin: sn, y0: floorY - 2, y1: floorY + H + ROOF_H, walk: false, id: 'casinha' });
  }
  box(0, -D, W + 0.1, 0.14);
  box(-W, 0, 0.14, D + 0.1);
  box(W, 0, 0.14, D + 0.1);
  for (const s of [-1, 1]) box(s * (door.hw + (W - door.hw) / 2 + 0.05), D, (W - door.hw) / 2 + 0.05, 0.14);
  box(seatX, seatZ - 0.05, 0.85, 0.32);
  world.addSurface({ id: 'piso_casinha', type: 'solido', shape: 'box', x: ASAS.x + (PORCH / 2) * sn, z: ASAS.z + (PORCH / 2) * cs, hw: W + 0.15, hd: D + PORCH / 2 + 0.05, cos: cs, sin: sn, y: floorY, dy: 0, bounce: 0 });

  group.updateMatrixWorld(true);
  bakeStatic([{ obj: group, region: 'ninhal', detail: false }], scene);

  // ---- luz dourada ---------------------------------------------------------------------------------------
  const rayTex = (() => {
    const c = document.createElement('canvas');
    c.width = 8; c.height = 128;
    const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, 128);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(0.25, 'rgba(255,255,255,0.75)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 8, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const rayMat = new THREE.MeshBasicMaterial({ map: rayTex, color: '#ffd98a', transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const rayGeo = new THREE.CylinderGeometry(0.5, 1.3, 22, 12, 1, true);
  const rayPlaces = [[-10, 5], [9.5, 7.5], [-6, -9.5], [9.5, -7], [-7.5, 10]];
  const rays = rayPlaces.map(([x, z], i) => {
    const r = skipOverridePasses(new THREE.Mesh(rayGeo, rayMat));
    r.position.set(x, 10.5, z);
    r.rotation.set(0.22, i * 1.3, -0.34);
    r.renderOrder = 4;
    group.add(r);
    return r;
  });

  const inside = new THREE.PointLight('#ffd9a0', 0, 16, 1.2);
  inside.position.set(0, 2.5, 0.4);
  group.add(inside);
  const golden = new THREE.PointLight('#ffc873', 0, 34, 1.3);
  golden.position.set(0, 9, 8);
  group.add(golden);

  // ---- vaga-lumes e poeirinha brilhando (também de dia) ---------------------------------------------------
  const ff = [];
  const fPos = new Float32Array(FIREFLIES * 3);
  for (let i = 0; i < FIREFLIES; i++) {
    const indoor = i < 22;
    ff.push(indoor
      ? { x: (rng() - 0.5) * 7, y: 0.5 + rng() * 2.4, z: (rng() - 0.5) * 7, ph: rng() * 6.28, sp: 0.2 + rng() * 0.3 }
      : { x: (rng() - 0.5) * 22, y: 0.4 + rng() * 2.8, z: (rng() - 0.5) * 22, ph: rng() * 6.28, sp: 0.4 + rng() * 0.6 });
  }
  const fGeo = new THREE.BufferGeometry();
  fGeo.setAttribute('position', new THREE.BufferAttribute(fPos, 3));
  const fMat = new THREE.PointsMaterial({ size: 0.2, map: glowTexture(), color: '#ffd98a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const fireflies = new THREE.Points(fGeo, fMat);
  fireflies.frustumCulled = false;
  group.add(fireflies);

  let elapsed = 0;
  const camLocal = new THREE.Vector3();
  const api = {
    group, anchors, floorY, W, D, H, ROT, seatX, seatZ,
    /** Local (x,y,z, com y a partir do piso) para mundo. */
    toWorld(x, y, z, out = new THREE.Vector3()) {
      return out.set(ASAS.x + x * cs + z * sn, floorY + y, ASAS.z - x * sn + z * cs);
    },
    toLocal,
    inside(wx, wz) {
      const [x, z] = toLocal(wx, wz);
      return Math.abs(x) < W - 0.1 && z > -D && z < D - 0.5;
    },
    update(dt) {
      elapsed += dt;
      const p = game.player?.position;
      const near = p && Math.hypot(p.x - ASAS.x, p.z - ASAS.z) < 60;
      const night = game.render.isNight?.() ? 1 : 0;
      inside.intensity = near ? 26 + night * 8 : 0;
      golden.intensity = near ? 5 + night * 30 : 0;
      fireflies.visible = !!near;
      for (const r of rays) r.visible = !!near;
      if (!near) return;
      rayMat.opacity = (night ? 0.08 : 0.16) + Math.sin(elapsed * 0.4) * 0.03;
      swing.rotation.x = Math.sin(elapsed * 0.9) * 0.14;
      for (let i = 0; i < FIREFLIES; i++) {
        const f = ff[i], t = elapsed * f.sp + f.ph;
        fPos[i * 3] = f.x + Math.sin(t) * 0.8;
        fPos[i * 3 + 1] = f.y + Math.sin(t * 1.7) * 0.4;
        fPos[i * 3 + 2] = f.z + Math.cos(t * 0.8) * 0.8;
      }
      fGeo.attributes.position.needsUpdate = true;
      // o telhado sai da frente quando a câmera sobe lá dentro
      camLocal.copy(game.render.camera.position);
      group.worldToLocal(camLocal);
      roof.visible = !(Math.abs(camLocal.x) < W + 0.6 && Math.abs(camLocal.z) < D + 0.6 && camLocal.y > H - 0.3 && p && api.inside(p.x, p.z));
    },
  };
  return api;
}
