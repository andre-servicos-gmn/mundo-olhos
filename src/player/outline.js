// Contorno leve "de desenho" (técnica do casco invertido): uma cópia da malha, só com as faces de trás,
// inflada ao longo das normais. Uso: addOutline(mesh) — o contorno vira filho da malha e a acompanha.
// Funciona melhor em malhas com escala 1 (asse a escala na geometria), pois a espessura é em unidades locais.
import * as THREE from 'three';

const width = { value: 0.011 };

export const outlineMaterial = new THREE.MeshBasicMaterial({ color: '#3d2236', side: THREE.BackSide });
outlineMaterial.onBeforeCompile = (shader) => {
  shader.uniforms.uOutline = width;
  shader.vertexShader = 'uniform float uOutline;\n' + shader.vertexShader.replace(
    '#include <begin_vertex>',
    '#include <begin_vertex>\n  transformed += normalize(normal) * uOutline;',
  );
};
outlineMaterial.customProgramCacheKey = () => 'quim-outline';

/** Adiciona o contorno a uma malha (ou a todas as malhas marcadas de um grupo). */
export function addOutline(mesh) {
  const o = new THREE.Mesh(mesh.geometry, outlineMaterial);
  o.name = 'contorno';
  o.castShadow = false;
  o.receiveShadow = false;
  o.raycast = () => {};
  mesh.add(o);
  return o;
}

/** Espessura global do contorno (em metros). */
export function setOutlineWidth(w) { width.value = w; }
