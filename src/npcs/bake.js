// "Assa" o modelo de um morador para economizar chamadas de desenho: em cada osso animado (corpo, cabeça,
// braços, pernas, orelhas, cauda...) todas as peças estáticas viram UMA malha toon com cores por vértice,
// uma malha "básica" (boca, bigodes) e uma malha de contorno. Olhos (core/eyes, animados), malhas instanciadas
// e qualquer coisa marcada como osso ficam intocados. Montar com peças compartilhadas, desenhar com poucas malhas.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon } from '../core/materials.js';

const toonVC = toon('#ffffff', { vertexColors: true });
const basicVC = new THREE.MeshBasicMaterial({ vertexColors: true });
const tmpM = new THREE.Matrix4();
const inv = new THREE.Matrix4();

function prepared(mesh, rel, color) {
  const g = mesh.geometry.clone();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  if (!g.index) return null;
  g.applyMatrix4(rel);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = color.r; arr[i * 3 + 1] = color.g; arr[i * 3 + 2] = color.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

/** bones: lista de Object3D animados (cada um ganha suas malhas assadas). */
export function bakeRig(rig, bones) {
  const boneSet = new Set(bones.filter(Boolean));
  rig.root.updateMatrixWorld(true);
  const isEyes = (o) => o.name === 'eyes';
  const out = { toon: 0, basic: 0, outline: 0 };

  for (const bone of boneSet) {
    const groups = { toon: [], basic: [], outline: [] };
    const remove = [];
    let outlineMat = null;
    inv.copy(bone.matrixWorld).invert();
    const visit = (o) => {
      for (const c of o.children) {
        if (boneSet.has(c) || isEyes(c) || c.isInstancedMesh || c.userData.keep) continue;
        if (c.isMesh) {
          const rel = tmpM.multiplyMatrices(inv, c.matrixWorld);
          const m = c.material;
          if (c.name === 'contorno') {
            outlineMat = m;
            const g = prepared(c, rel, m.color);
            if (g) { groups.outline.push(g); remove.push(c); }
          } else if (m.isMeshToonMaterial && !m.transparent) {
            const col = m.color.clone();
            if (m.emissive && m.emissiveIntensity) col.add(m.emissive.clone().multiplyScalar(m.emissiveIntensity * 0.35));
            const g = prepared(c, rel, col);
            if (g) { groups.toon.push(g); remove.push(c); }
          } else if (m.isMeshBasicMaterial && m.side !== THREE.BackSide && !m.transparent) {
            const g = prepared(c, rel, m.color);
            if (g) { groups.basic.push(g); remove.push(c); }
          }
        }
        visit(c);
      }
    };
    visit(bone);
    if (!remove.length) continue;
    // remove as originais (os filhos que não foram assados, como olhos, sobem para o osso no mesmo lugar)
    for (const c of remove) {
      for (const k of [...c.children]) if (!remove.includes(k)) bone.attach(k);
      c.parent?.remove(c);
    }
    const add = (list, mat, shadow, name) => {
      if (!list.length) return;
      const geo = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      if (!geo) return;
      geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, mat);
      m.name = name;
      m.castShadow = shadow;
      m.receiveShadow = false;
      if (name === 'contorno') m.raycast = () => {};
      bone.add(m);
      out[name === 'contorno' ? 'outline' : name]++;
    };
    add(groups.toon, toonVC, true, 'toon');
    add(groups.basic, basicVC, false, 'basic');
    add(groups.outline, outlineMat, false, 'contorno');
  }
  return out;
}
