// Contorno leve "de desenho" do Pinceso (casco invertido: cópia da malha só com as faces de trás,
// inflada ao longo das normais). Mesma técnica do contorno da Quim, com espessura própria para o
// tamanho de um periquito. A espessura é em unidades locais: asse a escala na geometria.
import * as THREE from 'three';

const width = { value: 0.0042 };

const outlineMaterial = new THREE.MeshBasicMaterial({ color: '#3d2236', side: THREE.BackSide });
outlineMaterial.onBeforeCompile = (shader) => {
  shader.uniforms.uOutline = width;
  shader.vertexShader = 'uniform float uOutline;\n' + shader.vertexShader.replace(
    '#include <begin_vertex>',
    '#include <begin_vertex>\n  transformed += normalize(normal) * uOutline;',
  );
};
outlineMaterial.customProgramCacheKey = () => 'pinceso-outline';

/** Adiciona o contorno a uma malha (vira filho dela e a acompanha). */
export function addOutline(mesh) {
  const o = new THREE.Mesh(mesh.geometry, outlineMaterial);
  o.name = 'contorno';
  o.castShadow = false;
  o.receiveShadow = false;
  o.raycast = () => {};
  mesh.add(o);
  return o;
}
