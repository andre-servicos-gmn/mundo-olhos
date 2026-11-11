// Olhinhos que piscam e acompanham a Quim. Tudo no Mundo Olhos tem olhos.
//   const eyes = createEyes({ size: 0.3, spacing: 0.35, lashes: true });
//   objeto.add(eyes); eyes.position.set(...);
//   registerEyes(eyes);              // passa a seguir o alvo e piscar sozinho
//   updateEyes(dt, alvoWorldPos, centroCamera); // chamado uma vez por quadro (pelo world)
import * as THREE from 'three';

const whiteMat = new THREE.MeshToonMaterial({ color: '#ffffff' });
const pupilMat = new THREE.MeshBasicMaterial({ color: '#1d1430' });
const shineMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
const lashMat = new THREE.MeshBasicMaterial({ color: '#1d1430' });
const sphereGeo = new THREE.SphereGeometry(1, 16, 12);
const lashGeo = new THREE.CylinderGeometry(0.06, 0.02, 0.5, 5);

/**
 * opts: { size=0.3, spacing=size*1.2, lashes=false, irisColor='#1d1430', single=false, sleepy=0 }
 * Retorna um Group com .look(alvoLocalOuWorld), .blink(), .setSleepy(0..1).
 */
export function createEyes(opts = {}) {
  const size = opts.size ?? 0.3;
  const spacing = opts.spacing ?? size * 1.2;
  const group = new THREE.Group();
  group.name = 'eyes';
  const pupilM = opts.irisColor ? new THREE.MeshBasicMaterial({ color: opts.irisColor }) : pupilMat;
  const eyes = [];
  const offsets = opts.single ? [0] : [-spacing / 2, spacing / 2];
  for (const ox of offsets) {
    const eye = new THREE.Group();
    eye.position.x = ox;
    const white = new THREE.Mesh(sphereGeo, whiteMat);
    white.scale.set(size * 0.8, size, size * 0.45);
    eye.add(white);
    const pupilPivot = new THREE.Group();
    const pupil = new THREE.Mesh(sphereGeo, pupilM);
    pupil.scale.set(size * 0.48, size * 0.6, size * 0.2);
    pupil.position.z = size * 0.33;
    const shine = new THREE.Mesh(sphereGeo, shineMat);
    shine.scale.setScalar(size * 0.16);
    shine.position.set(size * 0.14, size * 0.2, size * 0.48);
    pupilPivot.add(pupil, shine);
    eye.add(pupilPivot);
    if (opts.lashes) {
      for (let i = -1; i <= 1; i++) {
        const lash = new THREE.Mesh(lashGeo, lashMat);
        lash.scale.setScalar(size * 0.9);
        lash.position.set(i * size * 0.35 + Math.sign(ox || 1) * size * 0.15, size * 1.05, size * 0.1);
        lash.rotation.z = -i * 0.45 - Math.sign(ox || 1) * 0.35;
        eye.add(lash);
      }
    }
    group.add(eye);
    eyes.push({ eye, pupilPivot });
  }

  let blinkT = 0;          // >0 enquanto pisca
  let nextBlink = 1 + Math.random() * 4;
  let sleepy = opts.sleepy ?? 0;
  const tmp = new THREE.Vector3();

  group.userData.eyes = {
    // Aponta as pupilas para um ponto no mundo.
    lookAtWorld(worldPos) {
      tmp.copy(worldPos);
      group.worldToLocal(tmp);
      const len = tmp.length() || 1;
      const yaw = THREE.MathUtils.clamp(Math.atan2(tmp.x, tmp.z), -0.6, 0.6);
      const pitch = THREE.MathUtils.clamp(-Math.asin(THREE.MathUtils.clamp(tmp.y / len, -1, 1)), -0.5, 0.5);
      for (const e of eyes) { e.pupilPivot.rotation.y = yaw; e.pupilPivot.rotation.x = pitch; }
    },
    lookCenter() { for (const e of eyes) { e.pupilPivot.rotation.set(0, 0, 0); } },
    blink() { blinkT = 0.16; },
    setSleepy(v) { sleepy = v; },
    update(dt) {
      nextBlink -= dt;
      if (nextBlink <= 0) { blinkT = 0.16; nextBlink = 1.5 + Math.random() * 4.5; }
      let open = 1 - sleepy * 0.75;
      if (blinkT > 0) { blinkT -= dt; open = Math.min(open, Math.abs(blinkT - 0.08) / 0.08); }
      for (const e of eyes) e.eye.scale.y = Math.max(0.08, open);
    },
  };
  group.look = (p) => group.userData.eyes.lookAtWorld(p);
  group.blink = () => group.userData.eyes.blink();
  group.setSleepy = (v) => group.userData.eyes.setSleepy(v);
  return group;
}

const registry = new Set();
export function registerEyes(eyesGroup) { registry.add(eyesGroup); return () => registry.delete(eyesGroup); }
export function unregisterEyes(eyesGroup) { registry.delete(eyesGroup); }

const wp = new THREE.Vector3();
/**
 * Atualiza olhos registrados perto do jogador (raio 70) para seguirem o alvo e piscarem.
 * sleepiness: número 0..1 ou função (eyesGroup) => 0..1 (ex.: olhos de região desbotada ficam sonolentos).
 */
export function updateEyes(dt, targetWorldPos, nearPos = targetWorldPos, sleepiness = 0) {
  for (const g of registry) {
    if (!g.parent) continue;
    g.getWorldPosition(wp);
    if (wp.distanceToSquared(nearPos) > 70 * 70) continue;
    const api = g.userData.eyes;
    api.setSleepy(typeof sleepiness === 'function' ? sleepiness(g) : sleepiness);
    api.update(dt);
    if (wp.distanceToSquared(targetWorldPos) < 30 * 30) api.lookAtWorld(targetWorldPos);
    else api.lookCenter();
  }
}
