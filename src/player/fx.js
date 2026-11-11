// Efeitos da Quim: poeirinha (aterrissar/correr/respingo) e sombra-bolha de contato
// (ajuda a mirar os pulos; fica mais clara quanto mais alto ela está).
import * as THREE from 'three';
import { toon } from '../core/materials.js';
import { clamp } from '../core/util.js';

const POOL = 18;

function blobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.55, 'rgba(255,255,255,0.75)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createPlayerFX(scene) {
  const group = new THREE.Group();
  group.name = 'quim_fx';
  scene.add(group);

  // --- poeirinha ---
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const puffs = [];
  for (let i = 0; i < POOL; i++) {
    const mat = toon('#fff6ee', { transparent: true, opacity: 0 });
    mat.depthWrite = false;
    const m = new THREE.Mesh(geo, mat);
    m.visible = false;
    group.add(m);
    puffs.push({ m, t: 1, life: 1, vx: 0, vy: 0, vz: 0, s: 0.1 });
  }
  let next = 0;

  /** Solta n bolinhas de poeira em volta de (x,y,z). kind: 'poeira'|'agua'. */
  function puff(x, y, z, n = 6, strength = 1, kind = 'poeira') {
    for (let i = 0; i < n; i++) {
      const p = puffs[next];
      next = (next + 1) % POOL;
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.6;
      const sp = (0.9 + Math.random() * 0.8) * strength;
      p.m.position.set(x + Math.cos(a) * 0.15, y + 0.06, z + Math.sin(a) * 0.15);
      p.vx = Math.cos(a) * sp; p.vz = Math.sin(a) * sp;
      p.vy = (kind === 'agua' ? 2.2 : 0.5) * strength * (0.6 + Math.random() * 0.6);
      p.s = (0.07 + Math.random() * 0.06) * (0.7 + strength * 0.4);
      p.t = 0;
      p.life = 0.45 + Math.random() * 0.25;
      p.m.material.color.set(kind === 'agua' ? '#bfe9ff' : '#fff6ee');
      p.m.visible = true;
    }
  }

  // --- sombra-bolha ---
  const blobMat = new THREE.MeshBasicMaterial({
    map: blobTexture(), color: '#3a2a48', transparent: true, opacity: 0.3, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), blobMat);
  blob.renderOrder = 1;
  group.add(blob);

  /** Coloca a bolha no chão (groundY) sob a Quim; height = altura dela acima do chão. */
  function setBlob(x, groundY, z, height) {
    const k = clamp(height / 7, 0, 1);
    blob.position.set(x, groundY + 0.03, z);
    blob.scale.setScalar(0.62 * (1 - k * 0.45));
    blobMat.opacity = 0.28 * (1 - k * 0.6);
  }

  function update(dt) {
    for (const p of puffs) {
      if (!p.m.visible) continue;
      p.t += dt;
      const k = p.t / p.life;
      if (k >= 1) { p.m.visible = false; continue; }
      p.vx *= Math.exp(-5 * dt); p.vz *= Math.exp(-5 * dt);
      p.vy -= 1.5 * dt;
      p.m.position.x += p.vx * dt; p.m.position.y += p.vy * dt; p.m.position.z += p.vz * dt;
      p.m.scale.setScalar(p.s * (0.6 + k * 1.4));
      p.m.material.opacity = 0.85 * (1 - k * k);
    }
  }

  return { puff, setBlob, update, group };
}
