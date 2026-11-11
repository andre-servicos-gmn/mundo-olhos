// Partículas do Pinceso: peninhas verdes que caem quando ele foge e brilhinhos no rastro do Voo de Busca.
// Pool fixo, sem alocação por quadro.
import * as THREE from 'three';
import { toon } from '../core/materials.js';
import { PINCESO_COLORS } from './model.js';

const FEATHER_GEO = new THREE.SphereGeometry(1, 8, 6).scale(0.012, 0.004, 0.035);
const SPARK_GEO = new THREE.OctahedronGeometry(0.035, 0);

/** groundY(x, z): altura do chão (as peninhas pousam nele em vez de atravessar). */
export function createFx(scene, groundY = null) {
  const parts = [];
  const add = (geo, mat, kind) => {
    const m = new THREE.Mesh(geo, mat);
    m.visible = false;
    m.frustumCulled = false;
    m.raycast = () => {};
    scene.add(m);
    parts.push({ m, kind, life: 0, max: 1, v: new THREE.Vector3(), spin: 0, seed: 0 });
  };
  for (let i = 0; i < 10; i++) {
    const mat = toon(i % 2 ? PINCESO_COLORS.body : PINCESO_COLORS.wing, { transparent: true });
    add(FEATHER_GEO, mat, 'feather');
  }
  for (let i = 0; i < 28; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: i % 3 ? '#fff4b8' : '#c9ff8a', transparent: true, depthWrite: false, toneMapped: false });
    add(SPARK_GEO, mat, 'spark');
  }

  function spawn(kind, pos, life) {
    const p = parts.find((q) => q.kind === kind && q.life <= 0) || parts.filter((q) => q.kind === kind).sort((a, b) => a.life - b.life)[0];
    p.life = p.max = life;
    p.seed = Math.random() * 10;
    p.landed = false;
    p.m.position.copy(pos);
    p.m.rotation.set(Math.random() * 3, Math.random() * 6, Math.random() * 3);
    p.m.visible = true;
    p.m.material.opacity = 1;
    return p;
  }

  return {
    /** Peninhas que caem balançando. */
    feathers(pos, n = 3) {
      for (let i = 0; i < n; i++) {
        const p = spawn('feather', pos, 2.6 + Math.random());
        p.v.set((Math.random() - 0.5) * 1.2, 0.6 + Math.random() * 0.6, (Math.random() - 0.5) * 1.2);
        p.spin = (Math.random() - 0.5) * 6;
      }
    },
    /** Brilhinho que fica para trás e some. */
    sparkle(pos) {
      const p = spawn('spark', pos, 0.7);
      p.v.set((Math.random() - 0.5) * 0.4, -0.2 + Math.random() * 0.3, (Math.random() - 0.5) * 0.4);
      p.spin = 5;
    },
    update(dt) {
      for (const p of parts) {
        if (p.life <= 0) continue;
        p.life -= dt;
        if (p.life <= 0) { p.m.visible = false; continue; }
        const k = p.life / p.max;
        if (p.kind === 'feather') {
          if (!p.landed) {
            p.v.y = Math.max(p.v.y - 3 * dt, -0.55);                   // cai devagar (resistência do ar)
            p.v.x *= 1 - 1.5 * dt; p.v.z *= 1 - 1.5 * dt;
            p.m.position.addScaledVector(p.v, dt);
            p.m.position.x += Math.sin(p.life * 4 + p.seed) * 0.6 * dt;  // balança de um lado pro outro
            p.m.rotation.z = Math.sin(p.life * 4 + p.seed) * 0.7;
            p.m.rotation.y += p.spin * dt;
            const g = groundY ? groundY(p.m.position.x, p.m.position.z) + 0.006 : -Infinity;
            if (p.m.position.y < g) { p.m.position.y = g; p.landed = true; p.m.rotation.x = 0; p.m.rotation.z = 0; }
          }
          p.m.material.opacity = Math.min(1, k * 3);
        } else {
          p.m.position.addScaledVector(p.v, dt);
          p.m.rotation.y += p.spin * dt;
          p.m.scale.setScalar(Math.sin(k * Math.PI) * 1.2 + 0.05);
          p.m.material.opacity = k;
        }
      }
    },
  };
}
