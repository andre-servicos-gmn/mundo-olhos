// Partículas do mundo: ambiente por região em volta da Quim (pétalas no Campo, plumas no Ninhal, açúcar
// brilhante no Bosque, folhinhas na Vila/Cidade, flocos de algodão no Pico, pólen nos campos entre regiões),
// vaga-lumes à noite, e explosões de brilho (jujubas, cor voltando, névoa do Pico, cascata).
import * as THREE from 'three';
import { glowTexture } from './kit.js';

const TAU = Math.PI * 2;
// tipos de partícula ambiente por região
const KINDS = {
  campo: { colors: ['#ff8fc7', '#ffffff', '#ffd166', '#c49bff', '#ffb3d1'], size: 0.13, fall: 0.45, sway: 0.9, density: 1, shape: 'petala' },
  vila: { colors: ['#ffffff', '#fff3d6', '#ffe66d'], size: 0.07, fall: 0.18, sway: 0.6, density: 0.45, shape: 'fofo' },
  ninhal: { colors: ['#ffffff', '#ffd23f', '#6ec6ff', '#ff7aa8', '#b8f27c'], size: 0.17, fall: 0.28, sway: 1.1, density: 0.85, shape: 'pluma' },
  bosque: { colors: ['#ffffff', '#ffe0f0', '#fff6b0', '#d9f6ff'], size: 0.06, fall: 0.15, sway: 0.4, density: 1, shape: 'acucar' },
  cidade: { colors: ['#9ee07a', '#ffd166', '#ff9f6b', '#c9e8a0'], size: 0.12, fall: 0.5, sway: 1.0, density: 0.5, shape: 'folha' },
  pico: { colors: ['#ffffff', '#f2f6ff', '#eaf4ff'], size: 0.1, fall: 0.7, sway: 0.7, density: 1, shape: 'floco' },
  _: { colors: ['#fff7c2', '#ffffff', '#f6ffd0'], size: 0.05, fall: 0.06, sway: 0.5, density: 0.35, shape: 'acucar' },
};

function petalGeometry() {
  // losango curvinho (duas faces), centrado
  const g = new THREE.BufferGeometry();
  const P = [0, 0.5, 0, 0.35, 0, 0.08, 0, -0.5, 0, -0.35, 0, 0.08];
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 2, 0, 2, 1]);
  g.computeVertexNormals();
  return g;
}

/**
 * opts: { scene, quality, getHeight(x,z), regionAt(x,z), regionT(id) }
 */
export function createParticles({ scene, quality, getHeight, regionAt, regionT }) {
  const N = quality === 'baixa' ? 90 : quality === 'alta' ? 260 : 170;
  const BOX = 26;
  // --- ambiente (quadradinhos instanciados, sem luz: cores vivas) ---
  const amb = new THREE.InstancedMesh(petalGeometry(), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true, opacity: 0.92 }), N);
  amb.frustumCulled = false;
  amb.name = 'particulas_ambiente';
  scene.add(amb);
  const P = [];
  const col = new THREE.Color(), grey = new THREE.Color();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  for (let i = 0; i < N; i++) P.push({ i, x: 0, y: -999, z: 0, sp: 0, k: KINDS._, ph: Math.random() * TAU, on: false });
  function respawn(p, cx, cy, cz, top) {
    p.x = cx + (Math.random() * 2 - 1) * BOX;
    p.z = cz + (Math.random() * 2 - 1) * BOX;
    const rid = regionAt(p.x, p.z);
    p.k = KINDS[rid] || KINDS._;
    p.on = Math.random() < p.k.density;
    const gh = getHeight(p.x, p.z);
    p.y = top ? Math.max(cy, gh) + 6 + Math.random() * 10 : gh + 0.3 + Math.random() * 12;
    p.ph = Math.random() * TAU;
    p.sp = 0.6 + Math.random() * 0.8;
    const c = p.k.colors[Math.floor(Math.random() * p.k.colors.length)];
    const t = rid ? regionT(rid) : 1;
    col.set(c);
    grey.setScalar(col.r * 0.3 + col.g * 0.59 + col.b * 0.11);
    col.lerp(grey, (1 - t) * 0.7);
    amb.setColorAt(p.i, col);
    if (amb.instanceColor) amb.instanceColor.needsUpdate = true;
  }
  let first = true;

  // --- vaga-lumes (pontos com brilho) ---
  const NF = quality === 'baixa' ? 40 : quality === 'alta' ? 120 : 80;
  const fGeo = new THREE.BufferGeometry();
  const fPos = new Float32Array(NF * 3), fPh = new Float32Array(NF);
  for (let i = 0; i < NF; i++) { fPh[i] = Math.random() * TAU; fPos[i * 3 + 1] = -999; }
  fGeo.setAttribute('position', new THREE.BufferAttribute(fPos, 3));
  fGeo.setAttribute('aPh', new THREE.BufferAttribute(fPh, 1));
  const fMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uNight: { value: 0 }, uTex: { value: glowTexture() }, uScale: { value: 300 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float aPh; uniform float uTime; uniform float uScale; varying float vA;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vA = 0.5 + 0.5 * sin(uTime * 2.3 + aPh * 7.0);
        gl_PointSize = uScale * (0.25 + 0.15 * vA) / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D uTex; uniform float uNight; varying float vA;
      void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vec3(0.85, 1.0, 0.45) * t.a * vA * uNight * 1.6, 1.0); }`,
  });
  const flies = new THREE.Points(fGeo, fMat);
  flies.frustumCulled = false;
  flies.name = 'vagalumes';
  scene.add(flies);
  const F = Array.from({ length: NF }, () => ({ x: 0, y: -999, z: 0, bx: 0, by: 0, bz: 0, ph: Math.random() * TAU }));

  // --- explosões de brilho (pool) ---
  const NB = 700;
  const bGeo = new THREE.BufferGeometry();
  const bPos = new Float32Array(NB * 3), bCol = new Float32Array(NB * 3), bSize = new Float32Array(NB);
  bGeo.setAttribute('position', new THREE.BufferAttribute(bPos, 3));
  bGeo.setAttribute('color', new THREE.BufferAttribute(bCol, 3));
  bGeo.setAttribute('aSize', new THREE.BufferAttribute(bSize, 1));
  const bMat = new THREE.ShaderMaterial({
    uniforms: { uTex: { value: glowTexture() }, uScale: { value: 300 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
    vertexShader: `attribute float aSize; uniform float uScale; varying vec3 vC;
      void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = uScale * aSize / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D uTex; varying vec3 vC;
      void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vC * t.a, 1.0); }`,
  });
  const bursts = new THREE.Points(bGeo, bMat);
  bursts.frustumCulled = false;
  bursts.name = 'brilhos';
  scene.add(bursts);
  const B = Array.from({ length: NB }, () => ({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r: 1, g: 1, b: 1, size: 0.3, grav: 0 }));
  let bNext = 0;
  const bc = new THREE.Color();

  /** Explosão de brilhinhos. opts: { count, color|colors, speed, up, life, size, gravity, spread } */
  function burst(x, y, z, opts = {}) {
    const n = opts.count ?? 24;
    const colors = opts.colors ?? [opts.color ?? '#fff3a3'];
    for (let i = 0; i < n; i++) {
      const p = B[bNext]; bNext = (bNext + 1) % NB;
      const a = Math.random() * TAU, el = (Math.random() - 0.3) * Math.PI * 0.6;
      const sp = (opts.speed ?? 3) * (0.4 + Math.random() * 0.8);
      const spread = opts.spread ?? 0;
      p.x = x + (Math.random() - 0.5) * spread; p.y = y; p.z = z + (Math.random() - 0.5) * spread;
      p.vx = Math.cos(a) * Math.cos(el) * sp; p.vz = Math.sin(a) * Math.cos(el) * sp;
      p.vy = Math.sin(el) * sp + (opts.up ?? 1.5);
      p.max = p.life = (opts.life ?? 1.0) * (0.6 + Math.random() * 0.6);
      p.size = (opts.size ?? 0.35) * (0.6 + Math.random() * 0.8);
      p.grav = opts.gravity ?? 2.5;
      bc.set(colors[Math.floor(Math.random() * colors.length)]);
      p.r = bc.r; p.g = bc.g; p.b = bc.b;
    }
  }

  // emissores contínuos (névoa da cascata etc.): { x, y, z, rate, opts, acc }
  const emitters = [];

  let time = 0;
  return {
    burst,
    addEmitter(em) { emitters.push({ acc: 0, ...em }); },
    /** center = posição da Quim (ou da câmera); nightF 0..1; pxScale = altura da tela em px / (2·tan(fov/2)). */
    update(dt, center, nightF, pxScale = 600) {
      time += dt;
      fMat.uniforms.uScale.value = pxScale;
      bMat.uniforms.uScale.value = pxScale;
      const cx = center.x, cy = center.y, cz = center.z;
      // ambiente
      for (let i = 0; i < N; i++) {
        const p = P[i];
        if (first || Math.abs(p.x - cx) > BOX || Math.abs(p.z - cz) > BOX || p.y < cy - 8) respawn(p, cx, cy, cz, !first);
        const k = p.k;
        p.y -= k.fall * p.sp * dt;
        p.x += (Math.sin(time * k.sway + p.ph) * 0.6 + 0.35) * dt;
        p.z += Math.cos(time * k.sway * 0.8 + p.ph * 1.3) * 0.4 * dt;
        if (p.y < getHeight(p.x, p.z)) { respawn(p, cx, cy, cz, true); }
        if (!p.on) { m4.makeScale(0, 0, 0); amb.setMatrixAt(i, m4); continue; }
        const s = k.size * (k.shape === 'acucar' ? 0.7 + 0.5 * Math.sin(time * 6 + p.ph * 5) : 1);
        if (k.shape === 'pluma') sc.set(s * 0.6, s * 1.6, s);
        else if (k.shape === 'folha') sc.set(s * 0.8, s * 1.2, s);
        else sc.set(s, s, s);
        e.set(time * 1.3 * p.sp + p.ph, time * 0.9 + p.ph * 2, Math.sin(time + p.ph) * 0.8);
        q.setFromEuler(e);
        v.set(p.x, p.y, p.z);
        m4.compose(v, q, sc);
        amb.setMatrixAt(i, m4);
      }
      first = false;
      amb.instanceMatrix.needsUpdate = true;

      // vaga-lumes (só aparecem de noite; ficam perto do chão)
      fMat.uniforms.uTime.value = time;
      fMat.uniforms.uNight.value = nightF;
      flies.visible = nightF > 0.01;
      if (flies.visible) {
        for (let i = 0; i < NF; i++) {
          const f = F[i];
          if (Math.abs(f.bx - cx) > 30 || Math.abs(f.bz - cz) > 30 || f.y < -500) {
            f.bx = cx + (Math.random() * 2 - 1) * 30; f.bz = cz + (Math.random() * 2 - 1) * 30;
            f.by = getHeight(f.bx, f.bz) + 0.6 + Math.random() * 2.2;
            f.y = f.by;
          }
          const t = time * 0.4 + f.ph;
          fPos[i * 3] = f.bx + Math.sin(t * 1.3) * 1.5;
          fPos[i * 3 + 1] = f.by + Math.sin(t * 2.1) * 0.5;
          fPos[i * 3 + 2] = f.bz + Math.cos(t * 1.1) * 1.5;
        }
        fGeo.attributes.position.needsUpdate = true;
      }

      // emissores
      for (const em of emitters) {
        if (Math.hypot(em.x - cx, em.z - cz) > (em.far ?? 120)) continue;
        em.acc += dt * em.rate;
        while (em.acc >= 1) { em.acc -= 1; burst(em.x, em.y, em.z, em.opts); }
      }

      // explosões
      for (let i = 0; i < NB; i++) {
        const p = B[i];
        if (p.life <= 0) { bSize[i] = 0; continue; }
        p.life -= dt;
        p.vy -= p.grav * dt;
        p.vx *= 1 - dt * 1.5; p.vz *= 1 - dt * 1.5;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        const k = Math.max(0, p.life / p.max);
        bPos[i * 3] = p.x; bPos[i * 3 + 1] = p.y; bPos[i * 3 + 2] = p.z;
        const tw = 0.7 + 0.3 * Math.sin(time * 20 + i);
        bCol[i * 3] = p.r * k * tw; bCol[i * 3 + 1] = p.g * k * tw; bCol[i * 3 + 2] = p.b * k * tw;
        bSize[i] = p.size * (0.5 + 0.5 * k);
      }
      bGeo.attributes.position.needsUpdate = true;
      bGeo.attributes.color.needsUpdate = true;
      bGeo.attributes.aSize.needsUpdate = true;
    },
  };
}
