// Nuvens fofas com olhinhos e bochechas que passeiam pelo céu e viram para olhar a câmera.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon } from '../core/materials.js';
import { createEyes } from '../core/eyes.js';
import { mulberry32 } from '../core/util.js';

const COUNT = 14;
const WRAP = 460;          // nuvens dão a volta em x ∈ [-WRAP, WRAP]
const EYES_RANGE2 = 320 * 320;
const WHITE = new THREE.Color('#ffffff');
const CHEEK = new THREE.Color('#ffa9c9');

// Uma bolinha pintada (cor de vértice) já posicionada.
function blob(parts, x, y, z, r, color, squashZ = 1) {
  const g = new THREE.SphereGeometry(r, 14, 10);
  g.scale(1, 1, squashZ);
  g.translate(x, y, z);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = color.r; col[i * 3 + 1] = color.g; col[i * 3 + 2] = color.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  parts.push(g);
}

// Corpo da nuvem: bolota central (raio 5, frente em +z) + bolotas laterais + bochechas rosadas.
function cloudGeometry(rng) {
  const parts = [];
  blob(parts, 0, 0, 0, 5, WHITE);
  for (const s of [-1, 1]) {
    blob(parts, s * (4.8 + rng() * 1.5), -1.1, rng() - 0.5, 3.6 + rng() * 1.0, WHITE);
    blob(parts, s * (8.6 + rng() * 1.2), -2.0, rng() - 0.5, 2.3 + rng() * 0.6, WHITE);
  }
  blob(parts, (rng() - 0.5) * 3, 3.4, -0.8, 3.0 + rng() * 0.8, WHITE);
  for (const s of [-1, 1]) blob(parts, s * 2.7, -0.5, 4.15, 0.8, CHEEK, 0.35);
  const geo = mergeGeometries(parts);
  for (const g of parts) g.dispose();
  return geo;
}

/** Retorna { group, update(dt, camPos, tint, emissive, night, drift) }. */
export function createClouds(seed = 7) {
  const rng = mulberry32(seed);
  const group = new THREE.Group();
  group.name = 'nuvens-do-ceu';
  const geos = [cloudGeometry(rng), cloudGeometry(rng), cloudGeometry(rng)];
  const material = toon('#ffffff', { vertexColors: true });
  material.name = 'nuvem';

  const clouds = [];
  for (let i = 0; i < COUNT; i++) {
    const obj = new THREE.Group();
    const body = new THREE.Mesh(geos[i % geos.length], material);
    obj.add(body);
    // Quase todas têm olhinhos; algumas são só nuvem mesmo (dormindo de olhos bem fechados).
    const eyes = i % 4 === 3 ? null : createEyes({ size: 1.15, spacing: 2.5 });
    if (eyes) { eyes.position.set(0, 0.9, 4.75); obj.add(eyes); }
    const scale = 0.8 + rng() * 0.9;
    obj.scale.setScalar(scale);
    obj.position.set((rng() * 2 - 1) * WRAP, 58 + rng() * 38, (rng() * 2 - 1) * 400);
    group.add(obj);
    clouds.push({
      obj, eyes, api: eyes?.userData.eyes,
      baseY: obj.position.y,
      speed: 1.2 + rng() * 2.0,
      phase: rng() * Math.PI * 2,
    });
  }

  let time = 0;
  function update(dt, camPos, tint, emissive, night, drift = 1) {
    time += dt;
    material.color.copy(tint);
    material.emissive.copy(emissive);
    for (const c of clouds) {
      const p = c.obj.position;
      p.x += c.speed * dt * drift;
      p.z += c.speed * 0.25 * dt * drift;
      if (p.x > WRAP) p.x -= WRAP * 2;
      if (p.z > 420) p.z -= 840;
      p.y = c.baseY + Math.sin(time * 0.35 + c.phase) * 1.4;

      // Vira devagar para olhar a câmera (só no eixo Y).
      const want = Math.atan2(camPos.x - p.x, camPos.z - p.z);
      let diff = want - c.obj.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      c.obj.rotation.y += diff * Math.min(1, dt * 0.8);

      if (!c.eyes) continue;
      const dx = camPos.x - p.x, dy = camPos.y - p.y, dz = camPos.z - p.z;
      const near = dx * dx + dy * dy + dz * dz < EYES_RANGE2;
      c.eyes.visible = near;
      if (near) {
        c.api.setSleepy(night * 0.8);
        c.api.update(dt);
        c.api.lookAtWorld(camPos);
      }
    }
  }

  return { group, update };
}
