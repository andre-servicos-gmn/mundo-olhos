// O mundo aberto do Mundo Olhos: terreno, água, marcos, plataformas, decoração, jujubas, névoa do Pico,
// partículas, cor das regiões, colisão e consultas (altura, chão, região, água). Contrato: docs/ARQUITETURA.md.
//
// Organização (src/world/):
//   terrain.js   — altura em grade (= docs/mapa.md §3), malha com cores por região, montanhas da borda, água
//   fade.js      — desbotamento por região na GPU (+ onda de cor que se espalha a partir da Quim)
//   kit.js       — geometrias/materiais em cache, hash espacial, "assar" partes estáticas em poucas malhas
//   landmarks.js — os modelos dos LANDMARKS        platforms.js — PLATFORMS
//   scatter.js   — grama, flores, árvores, pedras  props.js     — itens de missão (spawnProp)
//   particles.js — pétalas/plumas/açúcar/vaga-lumes e brilhos
import * as THREE from 'three';
import { REGIONS, LANDMARKS, JUJUBA_SPOTS, GATES, WORLD } from '../data/worldmap.js';
import { setRegionSaturation, registerFadable, toon } from '../core/materials.js';
import { createEyes, registerEyes, unregisterEyes, updateEyes } from '../core/eyes.js';
import { nextFrame, mulberry32, clamp, smoothstep, lerp } from '../core/util.js';
import { createTerrain, HALF } from './terrain.js';
import { buildScatter, gumdropGeometry } from './scatter.js';
import { shared, REGION_IDS } from './fade.js';
import { mat, bakeStatic, SpatialHash, G, add, glowTexture, skipOverridePasses } from './kit.js';
import { BUILDERS, DETAIL, yawToPath } from './landmarks.js';
import { buildPlatforms } from './platforms.js';
import { buildProp, animateProp } from './props.js';
import { createParticles } from './particles.js';

const RIDX = Object.fromEntries(REGION_IDS.map((id, i) => [id, i]));
const REG = Object.fromEntries(REGIONS.map((r) => [r.id, r]));
const COLOR_SECONDS = 2.4;     // duração da onda de cor
const DETAIL_FAR = 170;        // detalhes assados (bancos, placas, postes...) somem além disso
const nightOf = (t) => 1 - smoothstep(0.2, 0.28, t) * (1 - smoothstep(0.72, 0.8, t));

export function createWorld(game) {
  const scene = game.render.scene;
  const quality = game.state?.settings?.quality || 'media';
  const rng = mulberry32(20261108);
  const terrain = createTerrain();
  const root = new THREE.Group();
  root.name = 'mundo';
  scene.add(root);

  // ---------------------------------------------------------------------------------------
  // Estado interno
  const colliders = [];
  const colHash = new SpatialHash(16);
  const surfHash = new SpatialHash(16);
  let surfaces = [];
  const landmarks = new Map();          // id -> { x, y, z, obj, def }
  const anims = [];                     // { fn, x, z, far }
  const eyeList = [];                   // { g, far, x, z }
  const lampSpots = [];                 // Vector3 (mundo)
  const windowMats = [], lampMats = [];
  const states = {};                    // estados especiais (ninho_casal: { obra, pronto })
  const props = new Set();
  let baked = [];
  let scatter = null, plat = null, particles = null;
  let elapsed = 0, lodTimer = 0, flagTimer = 0;
  const regionCur = Object.fromEntries(REGION_IDS.map((id) => [id, 1]));
  let colorAnim = null;                 // { id, from, to, t, cx, cz, maxR }
  let curRegion = null;
  const gradient = toon('#ffffff').gradientMap;
  const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();
  const fallbackPos = new THREE.Vector3();

  function addCollider(c) {
    colliders.push(c);
    const reach = c.kind === 'circle' ? c.r : Math.hypot(c.hw, c.hd);
    colHash.add(c, c.x, c.z, reach + 1.5);
  }
  function windowMat(region) {
    const m = mat('#d6ecff', region, { emissive: '#ffb84d', emissiveIntensity: 0 });
    if (!windowMats.includes(m)) windowMats.push(m);
    return m;
  }
  function lampMat(region) {
    const m = mat('#fff6d8', region, { emissive: '#ffd27a', emissiveIntensity: 0.2 });
    if (!lampMats.includes(m)) lampMats.push(m);
    return m;
  }
  function addEyes(parent, o, region) {
    const e = createEyes({ size: o.size ?? 0.3, lashes: !!o.lashes, single: !!o.single, spacing: o.spacing });
    e.position.set(o.x ?? 0, o.y ?? 0, o.z ?? 0);
    e.rotation.order = 'YXZ';   // primeiro vira (ry), depois inclina (rx) no eixo do próprio olho
    e.rotation.set(o.rx ?? 0, o.ry ?? 0, 0);
    e.userData.region = region;
    parent.add(e);
    registerEyes(e);
    eyeList.push({ g: e, far: o.far ?? 80, x: 0, z: 0 });
    return e;
  }

  // ---------------------------------------------------------------------------------------
  // Contexto dos construtores de marcos (coordenadas locais do marco; ver landmarks.js)
  function landmarkCtx(l, gy, pend) {
    const pal = REG[l.region]?.palette.accents ?? ['#ffb3d1'];
    return {
      rng, gy, terrain, gradient,
      ground: (x, z) => terrain.getHeight(x, z),
      M: (color, opts) => mat(color, l.region, opts),
      accent: (i) => pal[((i % pal.length) + pal.length) % pal.length],
      win: () => windowMat(l.region),
      lampMat: () => lampMat(l.region),
      registerFade: (m) => registerFadable(m, l.region),
      eyes: (parent, o) => addEyes(parent, o, l.region),
      circle: (x, z, r, y0, y1, walk = false, abs = false) => pend.colliders.push({ kind: 'circle', x, z, r, y0, y1, walk, abs }),
      box: (x, z, hw, hd, ry, y1, walk = false, y0 = 0) => pend.colliders.push({ kind: 'box', x, z, hw, hd, ry, y0, y1, walk, abs: false }),
      lamp: (parent, x, y, z) => pend.lamps.push({ parent, v: new THREE.Vector3(x, y, z) }),
      anim: (fn, x, z, far = 150) => anims.push({ fn, x, z, far }),
      faceYaw: (x, z) => yawToPath(x, z) - (l.rotY ?? 0),
      time: () => elapsed,
      dayTime: () => game.render.dayTime ?? 0.5,
      timeUniform: shared.uTime,
      mist: (x, y, z) => pend.mist.push([x, y, z]),
      setState: (id, v) => { states[id] = v; },
    };
  }

  function buildLandmark(l) {
    const builder = BUILDERS[l.type];
    if (!builder) { console.warn('[world] tipo de marco desconhecido:', l.type, l.id); return null; }
    const gy = terrain.getHeight(l.x, l.z);
    const pend = { colliders: [], lamps: [], mist: [] };
    const c = landmarkCtx(l, gy, pend);
    const g = builder(l, c);
    g.name = l.id;
    const rot = l.rotY ?? 0;
    if (g.userData.absolute) g.position.set(0, 0, 0);
    else {
      g.position.set(l.x, gy + g.position.y, l.z);
      g.rotation.y = rot;
    }
    root.add(g);
    g.updateMatrixWorld(true);
    const cs = Math.cos(rot), sn = Math.sin(rot);
    for (const k of pend.colliders) {
      const wx = l.x + k.x * cs + k.z * sn, wz = l.z - k.x * sn + k.z * cs;
      const y0 = k.abs ? k.y0 : gy + k.y0, y1 = k.abs ? k.y1 : gy + k.y1;
      if (k.kind === 'circle') addCollider({ kind: 'circle', x: wx, z: wz, r: k.r, y0: y0 - (k.abs ? 0 : 2), y1, walk: k.walk, id: l.id });
      else addCollider({ kind: 'box', x: wx, z: wz, hw: k.hw, hd: k.hd, rotY: rot + (k.ry || 0), cos: Math.cos(rot + (k.ry || 0)), sin: Math.sin(rot + (k.ry || 0)), y0: y0 - 2, y1, walk: k.walk, id: l.id });
    }
    for (const { parent, v } of pend.lamps) lampSpots.push(parent.localToWorld(v.clone()));
    for (const [x, y, z] of pend.mist) particlesPending.push([x, y, z]);
    const y = l.data?.y ?? gy;
    landmarks.set(l.id, { x: l.x, y, z: l.z, obj: g, def: l });
    return g;
  }
  const particlesPending = [];

  // ---------------------------------------------------------------------------------------
  // Jujubas espalhadas pelo mapa (instanciadas) + brilhinho
  let jjMesh = null, jjGlow = null;
  const JJ = JUJUBA_SPOTS.map((j) => ({ ...j, base: 0, alive: true, pop: 0 }));
  function buildJujubas() {
    const geo = gumdropGeometry(16);
    geo.translate(0, -0.21, 0);
    const m = toon('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.12 });
    jjMesh = new THREE.InstancedMesh(geo, m, JJ.length);
    jjMesh.name = 'jujubas';
    jjMesh.castShadow = true;
    const col = new THREE.Color();
    JJ.forEach((j, i) => {
      j.base = (j.y ?? terrain.getHeight(j.x, j.z)) + 0.55;
      jjMesh.setColorAt(i, col.set(j.color));
    });
    jjMesh.instanceColor.needsUpdate = true;
    jjMesh.frustumCulled = false;
    root.add(jjMesh);
    const gGeo = new THREE.BufferGeometry();
    gGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(JJ.length * 3), 3));
    gGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(JJ.length * 3), 3));
    jjGlow = new THREE.Points(gGeo, new THREE.PointsMaterial({ size: 1.3, map: glowTexture(), vertexColors: true, transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
    jjGlow.frustumCulled = false;
    root.add(jjGlow);
  }
  const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler();
  const _c = new THREE.Color();
  function updateJujubas(dt, ppos) {
    const gp = jjGlow.geometry.attributes.position.array, gc = jjGlow.geometry.attributes.color.array;
    for (let i = 0; i < JJ.length; i++) {
      const j = JJ[i];
      let s = 1, y = j.base + Math.sin(elapsed * 2.2 + i) * 0.12;
      if (!j.alive) {
        if (j.pop > 0) {   // pulinho de coleta: cresce, sobe e some
          j.pop = Math.max(0, j.pop - dt);
          const k = 1 - j.pop / 0.45;
          s = (1 + k * 0.8) * (1 - k * k);
          y += k * 1.6;
        } else s = 0;
      } else if (ppos) {
        const dx = ppos.x - j.x, dz = ppos.z - j.z, dy = j.base - ppos.y;
        if (dx * dx + dz * dz < 1.45 * 1.45 && dy > -0.9 && dy < 2.2) collectJujuba(j);
      }
      _e.set(0.15 * Math.sin(elapsed + i), elapsed * 1.8 + i, 0);
      _q.setFromEuler(_e);
      _m4.compose(_p.set(j.x, y, j.z), _q, _s.setScalar(s * 1.15));
      jjMesh.setMatrixAt(i, _m4);
      gp[i * 3] = j.x; gp[i * 3 + 1] = y + 0.02; gp[i * 3 + 2] = j.z;
      const tw = (j.alive ? (j.hidden ? 0.35 : 0.6) : 0) * (0.75 + 0.25 * Math.sin(elapsed * 3 + i * 1.7));
      _c.set(j.color);
      gc[i * 3] = _c.r * tw; gc[i * 3 + 1] = _c.g * tw; gc[i * 3 + 2] = _c.b * tw;
    }
    jjMesh.instanceMatrix.needsUpdate = true;
    jjGlow.geometry.attributes.position.needsUpdate = true;
    jjGlow.geometry.attributes.color.needsUpdate = true;
  }
  function collectJujuba(j) {
    const st = game.state;
    j.alive = false;
    j.pop = 0.45;
    if (st) {
      st.collected[j.id] = true;
      st.jujubas = (st.jujubas || 0) + 1;
      st.totalJujubasFound = (st.totalJujubasFound || 0) + 1;
    }
    particles?.burst(j.x, j.base, j.z, { count: 26, colors: [j.color, '#ffffff', '#fff3a3'], speed: 3.2, up: 2.2, life: 0.9, size: 0.4 });
    game.audio?.play?.('jujuba');
    game.bus?.emit('jujuba:collect', { id: j.id, x: j.x, y: j.base, z: j.z, color: j.color, total: st?.jujubas });
  }

  // ---------------------------------------------------------------------------------------
  // GATES: muralha de névoa sonolenta (shader) + nuvens dorminhocas; empurra a Quim até a flag existir
  const gates = [];
  function buildGates() {
    for (const gd of GATES) {
      const SEG = 96, R = gd.radius;
      const P = [], UV = [], I = [];
      for (let i = 0; i <= SEG; i++) {
        const a = (i / SEG) * Math.PI * 2;
        const x = gd.x + Math.cos(a) * R, z = gd.z + Math.sin(a) * R;
        const h = terrain.getHeight(clamp(x, -HALF + 1, HALF - 1), clamp(z, -HALF + 1, HALF - 1));
        P.push(x, h - 3, z, x, h + 30, z);
        UV.push(i / SEG, 0, i / SEG, 1);
        if (i < SEG) { const k = i * 2; I.push(k, k + 1, k + 2, k + 2, k + 1, k + 3); }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
      geo.setIndex(I);
      const m = new THREE.ShaderMaterial({
        uniforms: { uTime: shared.uTime, uOpacity: { value: 1 }, uTint: { value: new THREE.Color('#ffffff') } },
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform float uTime; uniform float uOpacity; uniform vec3 uTint; varying vec2 vUv;
          float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
            return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
          void main(){
            vec2 p = vec2(vUv.x * 90.0, vUv.y * 6.0);
            float k = n(p + vec2(uTime * 0.6, -uTime * 0.25)) * 0.6 + n(p * 2.3 - vec2(uTime * 0.9, uTime * 0.4)) * 0.4;
            float swirl = sin(vUv.x * 300.0 + vUv.y * 9.0 - uTime * 2.0) * 0.5 + 0.5;
            float a = (0.25 + 0.55 * k + 0.12 * swirl) * smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.45, vUv.y);
            vec3 col = mix(vec3(0.86, 0.83, 0.97), vec3(1.0, 0.97, 1.0), k) * uTint;
            gl_FragColor = vec4(col, a * 0.72 * uOpacity);
          }`,
      });
      const wall = skipOverridePasses(new THREE.Mesh(geo, m));
      wall.renderOrder = 3;
      wall.name = 'nevoa_' + gd.id;
      root.add(wall);
      // nuvens dorminhocas em volta
      const blobs = new THREE.Group();
      const cm = toon('#f4f0ff');
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2 + 0.1;
        const x = gd.x + Math.cos(a) * (R + 1), z = gd.z + Math.sin(a) * (R + 1);
        if (Math.hypot(x, z) > WORLD.playRadius + 30) continue;
        const b = new THREE.Group();
        b.position.set(x, terrain.getHeight(clamp(x, -HALF + 1, HALF - 1), clamp(z, -HALF + 1, HALF - 1)) + 4 + (i % 3) * 2.5, z);
        b.rotation.y = Math.atan2(-(x - gd.x), -(z - gd.z)) + Math.PI;   // olhando para fora (para quem chega)
        add(b, G.ico, cm, 0, 0, 0, 3.2, 2.4, 2.6);
        add(b, G.ico, cm, 2.6, -0.6, 0.2, 2.2, 1.8, 2.0);
        add(b, G.ico, cm, -2.5, -0.5, -0.2, 2.0, 1.7, 1.9);
        const e = createEyes({ size: 0.55, lashes: true });
        e.position.set(0, 0.2, 2.45);
        e.userData.sleepyOverride = 0.85;
        b.add(e);
        registerEyes(e);
        blobs.add(b);
      }
      root.add(blobs);
      gates.push({ def: gd, wall, blobs, open: 0, target: 0, lastToast: -99 });
    }
  }
  function gateOpen(gd) { return !!game.state?.flags?.[gd.requiresFlag]; }

  // ---------------------------------------------------------------------------------------
  // Cor das regiões
  function applyRegionColor(id, t) {
    regionCur[id] = t;
    setRegionSaturation(id, t);
  }
  function finishColorAnim() {
    if (!colorAnim) return;
    applyRegionColor(colorAnim.id, colorAnim.to);
    shared.uRegT0.value[RIDX[colorAnim.id]] = colorAnim.to;
    shared.uWave.value.z = 1e6;
    colorAnim = null;
  }
  function setRegionColor(id, t, animate = true) {
    if (!(id in RIDX)) return;
    t = clamp(Number(t) || 0, 0, 1);
    if (game.state) game.state.regionColor[id] = t;
    finishColorAnim();
    const i = RIDX[id];
    if (!animate || Math.abs(t - regionCur[id]) < 1e-3) {
      applyRegionColor(id, t);
      shared.uRegT.value[i] = t;
      shared.uRegT0.value[i] = t;
      return;
    }
    const p = game.player?.position;
    const reg = REG[id];
    const near = p && Math.hypot(p.x - reg.center.x, p.z - reg.center.z) < reg.radius * 1.4;
    const cx = near ? p.x : reg.center.x, cz = near ? p.z : reg.center.z;
    const maxR = Math.hypot(cx - reg.center.x, cz - reg.center.z) + reg.radius * 1.5 + 20;
    colorAnim = { id, from: regionCur[id], to: t, t: 0, cx, cz, maxR };
    shared.uRegT0.value[i] = regionCur[id];
    shared.uRegT.value[i] = t;
    shared.uWave.value.set(cx, cz, 0);
    game.bus?.emit('color:restore', { region: id, t });
    game.audio?.play?.('cor');
    const cy = p ? p.y + 1 : terrain.getHeight(cx, cz) + 1;
    particles?.burst(cx, cy, cz, { count: 70, colors: REG[id].palette.accents, speed: 7, up: 3, life: 1.6, size: 0.5, gravity: 1.2 });
  }
  function updateColorAnim(dt) {
    if (!colorAnim) return;
    const a = colorAnim;
    a.t += dt;
    const k = clamp(a.t / COLOR_SECONDS, 0, 1);
    const e = 1 - Math.pow(1 - k, 2);
    applyRegionColor(a.id, lerp(a.from, a.to, e));
    const r = e * a.maxR;
    shared.uWave.value.z = r;
    // brilhinhos na frente da onda
    if (particles && k < 1) {
      for (let i = 0; i < 3; i++) {
        const ang = Math.random() * Math.PI * 2;
        const x = a.cx + Math.cos(ang) * r, z = a.cz + Math.sin(ang) * r;
        if (Math.hypot(x - REG[a.id].center.x, z - REG[a.id].center.z) > REG[a.id].radius * 1.1) continue;
        particles.burst(x, terrain.getHeight(x, z) + 0.6, z, { count: 3, colors: REG[a.id].palette.accents, speed: 1.5, up: 2.5, life: 1.2, size: 0.45, gravity: 0.5 });
      }
    }
    if (k >= 1) finishColorAnim();
  }
  function sleepOf(g) {
    if (g.userData.sleepyOverride !== undefined) return g.userData.sleepyOverride;
    let r = g.userData.region;
    if (r === undefined) { g.getWorldPosition(tmpV2); r = regionAt(tmpV2.x, tmpV2.z) ?? nearestRegion(tmpV2.x, tmpV2.z); }
    return clamp((1 - (regionCur[r] ?? 1)) * 0.85 + nightNow * 0.3, 0, 1);
  }
  let nightNow = 0;

  // ---------------------------------------------------------------------------------------
  // Consultas
  function regionAt(x, z) {
    let best = null, bd = 1;
    for (const r of REGIONS) {
      const d = Math.hypot(x - r.center.x, z - r.center.z) / r.radius;
      if (d < bd) { bd = d; best = r.id; }
    }
    return best;
  }
  function nearestRegion(x, z) {
    let best = REGIONS[0].id, bd = Infinity;
    for (const r of REGIONS) {
      const d = Math.hypot(x - r.center.x, z - r.center.z) / r.radius;
      if (d < bd) { bd = d; best = r.id; }
    }
    return best;
  }
  function inSurface(s, x, z, pad = 0.12) {
    const dx = x - s.x, dz = z - s.z;
    if (s.shape === 'circle') return dx * dx + dz * dz <= (s.r + pad) * (s.r + pad);
    const lx = dx * s.cos - dz * s.sin, lz = dx * s.sin + dz * s.cos;
    return Math.abs(lx) <= s.hw + pad && Math.abs(lz) <= s.hd + pad;
  }
  function inCollider(c, x, z, pad = 0) {
    const dx = x - c.x, dz = z - c.z;
    if (c.kind === 'circle') return dx * dx + dz * dz <= (c.r + pad) * (c.r + pad);
    const lx = dx * c.cos - dz * c.sin, lz = dx * c.sin + dz * c.cos;
    return Math.abs(lx) <= c.hw + pad && Math.abs(lz) <= c.hd + pad;
  }
  /** Maior superfície andável em (x,z) com topo ≤ yAtual + 0,6 (terreno, plataformas, topos sólidos). */
  function groundAt(x, z, yAtual = Infinity) {
    let best = terrain.getHeight(x, z), surface = null, bounce = 0;
    const lim = yAtual + 0.6;
    for (const s of surfHash.query(x, z)) {
      const top = s.y + s.dy;
      if (top <= lim && top > best && inSurface(s, x, z)) { best = top; surface = s; bounce = s.bounce; }
    }
    for (const c of colHash.query(x, z)) {
      if (!c.walk || c.y1 > lim || c.y1 <= best) continue;
      if (inCollider(c, x, z, 0.05)) { best = c.y1; surface = c.surface || (c.surface = { id: c.id, type: 'solido', y: c.y1 }); bounce = 0; }
    }
    return { y: best, surface, bounce };
  }

  let gust = null, lastResolve = performance.now();
  /** Empurra pos (Vector3, pés da Quim) para fora de colisores, da água funda, da borda e da névoa. */
  // quiet = true: só colisores sólidos, lagos e borda, sem efeitos (respingo, aviso, rajada) e sem a névoa
  // dos gates — para câmera e moradores.
  // Sem ele, os efeitos são da Quim (o player é quem chama a cada quadro).
  function resolveCollision(pos, radius = 0.35, quiet = false) {
    const now = performance.now();
    const rdt = quiet ? 0 : Math.min(0.05, (now - lastResolve) / 1000);
    if (!quiet) lastResolve = now;
    for (let pass = 0; pass < 2; pass++) {
      for (const c of colHash.query(pos.x, pos.z)) {
        if (pos.y >= c.y1 - 0.05 || pos.y + 1.2 <= c.y0) continue;
        const dx = pos.x - c.x, dz = pos.z - c.z;
        if (c.kind === 'circle') {
          const min = c.r + radius, d2 = dx * dx + dz * dz;
          if (d2 >= min * min) continue;
          const d = Math.sqrt(d2) || 1e-4;
          const nx = d2 > 1e-8 ? dx / d : 1, nz = d2 > 1e-8 ? dz / d : 0;
          pos.x = c.x + nx * min; pos.z = c.z + nz * min;
        } else {
          const lx = dx * c.cos - dz * c.sin, lz = dx * c.sin + dz * c.cos;
          const qx = clamp(lx, -c.hw, c.hw), qz = clamp(lz, -c.hd, c.hd);
          let ox = lx - qx, oz = lz - qz;
          const d = Math.hypot(ox, oz);
          let nlx, nlz;
          if (d > 1e-6) {
            if (d >= radius) continue;
            nlx = qx + ox / d * radius; nlz = qz + oz / d * radius;
          } else {   // dentro da caixa: sai pelo lado mais perto
            const px = c.hw - Math.abs(lx), pz = c.hd - Math.abs(lz);
            if (px < pz) { nlx = Math.sign(lx || 1) * (c.hw + radius); nlz = lz; } else { nlx = lx; nlz = Math.sign(lz || 1) * (c.hd + radius); }
          }
          pos.x = c.x + nlx * c.cos + nlz * c.sin;
          pos.z = c.z - nlx * c.sin + nlz * c.cos;
        }
      }
    }
    // água funda dos lagos: devolve para a margem (a Quim não nada; o rio é rasinho e dá para atravessar)
    for (const L of terrain.lakes) {
      const dx = pos.x - L.x, dz = pos.z - L.z, d = Math.hypot(dx, dz), inner = L.R - 2.4;
      if (d < inner && pos.y < L.surf - 0.15) {
        const nx = d > 1e-4 ? dx / d : 1, nz = d > 1e-4 ? dz / d : 0;
        pos.x = L.x + nx * inner; pos.z = L.z + nz * inner;
        if (!quiet && now - (L.lastSplash || 0) > 600) {
          L.lastSplash = now;
          particles?.burst(pos.x, L.surf + 0.1, pos.z, { count: 16, colors: ['#d9f6ff', '#ffffff'], speed: 2.5, up: 3, life: 0.7, size: 0.35, gravity: 6 });
          game.audio?.play?.('agua');
        }
      }
    }
    // borda do mundo
    const r = Math.hypot(pos.x, pos.z), maxR = WORLD.playRadius - 2;
    if (r > maxR) { pos.x *= maxR / r; pos.z *= maxR / r; }
    // névoa do Pico (e outros gates) — só para a Quim: a câmera atravessa a névoa e quem mora lá dentro fica lá
    if (!quiet) for (const gt of gates) {
      const gd = gt.def;
      if (gateOpen(gd)) continue;
      const dx = pos.x - gd.x, dz = pos.z - gd.z, d = Math.hypot(dx, dz);
      if (d < gd.radius) {
        const nx = d > 1e-4 ? dx / d : 1, nz = d > 1e-4 ? dz / d : 0;
        pos.x = gd.x + nx * (gd.radius + 0.1); pos.z = gd.z + nz * (gd.radius + 0.1);
        gust = { nx, nz, until: now + 650 };
        if (elapsed - gt.lastToast > 6) {
          gt.lastToast = elapsed;
          game.ui?.toast?.(gd.message, '🌫️');
        }
        particles?.burst(pos.x, pos.y + 1, pos.z, { count: 18, colors: ['#ffffff', '#efe9ff'], speed: 5, up: 0.5, life: 0.9, size: 0.6, gravity: 0 });
      }
    }
    if (!quiet && gust && now < gust.until) { pos.x += gust.nx * 7 * rdt; pos.z += gust.nz * 7 * rdt; }
    return pos;
  }

  function gateBlocked(x, z) {
    for (const gt of gates) {
      const gd = gt.def;
      if (!gateOpen(gd) && Math.hypot(x - gd.x, z - gd.z) < gd.radius) return gd;
    }
    return null;
  }

  // ---------------------------------------------------------------------------------------
  // Props de missão
  function spawnProp(type, opts = {}) {
    const obj = buildProp(type, opts, rng);
    const x = opts.x ?? 0, z = opts.z ?? 0;
    const float = obj.userData.prop.float;
    let y;
    if (opts.y !== undefined) y = float ? opts.y : opts.y - 0.5;   // y dos dados = topo da plataforma + 0,5
    else y = terrain.getHeight(x, z) + (float ? 0.5 : 0);
    obj.position.set(x, y, z);
    obj.rotation.y = opts.rotY ?? rng() * Math.PI * 2;
    if (opts.id) obj.userData.id = opts.id;
    root.add(obj);
    props.add(obj);
    return obj;
  }
  function removeProp(obj) {
    if (!obj) return;
    obj.traverse((o) => { if (o.name === 'eyes') unregisterEyes(o); });
    obj.parent?.remove(obj);
    props.delete(obj);
  }

  // ---------------------------------------------------------------------------------------
  // Luzes de verdade só nos postes mais perto da Quim (o resto é emissivo)
  const lights = [];
  function buildLights() {
    const n = quality === 'baixa' ? 2 : quality === 'alta' ? 6 : 4;
    for (let i = 0; i < n; i++) {
      const L = new THREE.PointLight('#ffc977', 0, 16, 1.6);
      L.position.set(0, -500, 0);
      root.add(L);
      lights.push(L);
    }
  }
  function updateLights(ppos, nightF) {
    if (!lights.length) return;
    const sorted = lampSpots
      .map((p) => [p, (p.x - ppos.x) ** 2 + (p.z - ppos.z) ** 2])
      .filter((a) => a[1] < 60 * 60)
      .sort((a, b) => a[1] - b[1]);
    lights.forEach((L, i) => {
      const s = sorted[i];
      if (s && nightF > 0.02) {
        L.position.copy(s[0]);
        const fade = 1 - smoothstep(35 * 35, 60 * 60, s[1]);
        L.intensity = nightF * 9 * fade;
      } else L.intensity = 0;
    });
  }

  // ---------------------------------------------------------------------------------------
  function playerPos() {
    if (game.player?.position) return game.player.position;
    fallbackPos.copy(game.render.camera.position);
    return fallbackPos;
  }
  function applyFlags() {
    for (const gt of gates) gt.target = gateOpen(gt.def) ? 1 : 0;
    const nc = states.ninho_casal;
    if (nc) {
      const done = !!game.state?.flags?.ninho_casal_pronto;
      if (nc.pronto.visible !== done && done && nc.obra.visible) {
        const l = landmarks.get('ninho_casal');
        particles?.burst(l.x, l.y + 0.8, l.z, { count: 40, colors: ['#ffd23f', '#ff7aa8', '#b8f27c', '#ffffff'], speed: 3, up: 2, life: 1.2 });
      }
      nc.pronto.visible = done;
      nc.obra.visible = !done;
    }
  }

  // =========================================================================================
  const world = {
    terrain,
    async build(onProgress) {
      const prog = (p, t) => onProgress?.(p, t);
      prog(0, 'Desenhando as colinas...');
      await nextFrame();
      await terrain.build((p) => prog(0.02 + p * 0.25, 'Desenhando as colinas...'));

      prog(0.3, 'Pintando o chão de pétalas...');
      await nextFrame();
      const step = quality === 'baixa' ? 3 : quality === 'alta' ? 1.5 : 2;
      root.add(terrain.buildMesh(step));
      root.add(terrain.buildRing());
      root.add(terrain.buildWater());

      prog(0.36, 'Construindo as casinhas...');
      await nextFrame();
      const groups = [];
      let t0 = performance.now();
      for (let i = 0; i < LANDMARKS.length; i++) {
        const l = LANDMARKS[i];
        const g = buildLandmark(l);
        if (g) groups.push({ obj: g, region: l.region, detail: DETAIL.has(l.type) });
        if (performance.now() - t0 > 40) {
          prog(0.36 + 0.24 * (i / LANDMARKS.length), 'Construindo as casinhas...');
          await nextFrame();
          t0 = performance.now();
        }
      }

      prog(0.62, 'Pendurando galhos e nuvens...');
      await nextFrame();
      const platCtx = {
        rng, cur: 'ninhal', ground: (x, z) => terrain.getHeight(x, z),
        M: (color, opts) => mat(color, platCtx.cur, opts),            // cur = região da plataforma atual
        accent: (i) => ['#ff7aa8', '#ffd23f', '#6ec6ff', '#b8f27c', '#c792ff'][i % 5],
        eyes: (parent, o) => addEyes(parent, o, platCtx.cur),
        circle: (x, z, r, y0, y1, walk = false) => addCollider({ kind: 'circle', x, z, r, y0, y1, walk, id: 'plataforma' }),
        boxWorld: (x, z, hw, hd, rot, y0, y1) => addCollider({ kind: 'box', x, z, hw, hd, rotY: rot, cos: Math.cos(rot), sin: Math.sin(rot), y0, y1, walk: false, id: 'corrimao' }),
      };
      const platRoot = new THREE.Group();
      platRoot.name = 'plataformas';
      root.add(platRoot);
      plat = buildPlatforms(platCtx, platRoot);
      surfaces = plat.surfaces;
      for (const s of surfaces) surfHash.add(s, s.x, s.z, s.shape === 'circle' ? s.r + 0.5 : Math.hypot(s.hw, s.hd) + 0.5);
      for (const g of platRoot.children) groups.push({ obj: g, region: 'ninhal', detail: false });

      prog(0.68, 'Assando os detalhes...');
      await nextFrame();
      baked = bakeStatic(groups, root);

      prog(0.74, 'Plantando flores e grama...');
      await nextFrame();
      scatter = buildScatter({ scene: root, terrain, quality, rng, onCollider: (c) => {
        if (c.kind === 'box') addCollider({ ...c, cos: Math.cos(c.rotY || 0), sin: Math.sin(c.rotY || 0), walk: c.y1 - c.y0 < 3.5 });
        else addCollider({ ...c, walk: false });
      } });
      for (const g of scatter.eyed) eyeList.push({ g, far: 62 });

      prog(0.9, 'Espalhando jujubas...');
      await nextFrame();
      buildJujubas();
      buildGates();
      buildLights();
      particles = createParticles({ scene: root, quality, getHeight: (x, z) => terrain.getHeight(x, z), regionAt,
        regionT: (id) => regionCur[id] ?? 1 });
      for (const [x, y, z] of particlesPending) {
        particles.addEmitter({ x, y, z, rate: 10, far: 140, opts: { count: 2, colors: ['#ffffff', '#e9f7ff'], speed: 2.2, up: 2.5, life: 1.4, size: 0.9, gravity: 0.6, spread: 3 } });
      }
      game.findables?.add?.(() => JJ.filter((j) => j.alive).map((j) => ({ x: j.x, y: j.base, z: j.z, kind: 'jujuba', id: j.id })));
      for (const e of eyeList) { e.g.getWorldPosition(tmpV); e.x = tmpV.x; e.z = tmpV.z; }
      prog(1, 'Mundo pronto!');
      await nextFrame();
    },

    applyState() {
      const st = game.state || {};
      finishColorAnim();
      for (const id of REGION_IDS) setRegionColor(id, st.regionColor?.[id] ?? 0, false);
      for (const j of JJ) { j.alive = !st.collected?.[j.id]; j.pop = 0; }
      applyFlags();
      for (const gt of gates) { gt.open = gt.target; }
      curRegion = null;
    },

    update(dt) {
      elapsed += dt;
      shared.uTime.value = elapsed;
      const render = game.render;
      const ppos = playerPos();
      const cam = render.camera.position;
      const nightF = nightOf(render.dayTime ?? 0.5);
      nightNow = nightF;

      // água: direção da luz (sol ou lua) e cor do céu
      const wu = terrain.waterUniforms;
      if (render.sun) {
        wu.uSunDir.value.copy(render.sun.position).sub(render.sun.target.position).normalize();
        wu.uSunCol.value.copy(render.sun.color).multiplyScalar(Math.min(1.2, render.sun.intensity / 2.5));
      }
      if (scene.fog) wu.uSky.value.copy(scene.fog.color);

      updateColorAnim(dt);

      // região atual (com histerese para não piscar o título na fronteira)
      {
        let best = null, bd = Infinity;
        for (const r of REGIONS) {
          const d = Math.hypot(ppos.x - r.center.x, ppos.z - r.center.z) / r.radius;
          if (d < bd) { bd = d; best = r; }
        }
        if (best && bd < 0.92 && best.id !== curRegion) {
          curRegion = best.id;
          if (game.state) game.state.discoveredRegions[best.id] = true;
          game.bus?.emit('region:enter', { id: best.id, name: best.name });
        } else if (curRegion) {
          const r = REG[curRegion];
          if (Math.hypot(ppos.x - r.center.x, ppos.z - r.center.z) / r.radius > 1.08) curRegion = null;
        }
      }

      updateJujubas(dt, game.player ? ppos : null);

      for (const p of props) {
        if (Math.abs(p.position.x - cam.x) < 120 && Math.abs(p.position.z - cam.z) < 120) animateProp(p, dt, elapsed);
      }
      for (const a of anims) {
        if (Math.abs(a.x - cam.x) < a.far && Math.abs(a.z - cam.z) < a.far) a.fn(dt, elapsed);
      }

      // plataformas vivas: folhas afundam/balançam quando pisadas, trampolins amassam, nuvens flutuam
      if (plat) {
        const g = game.player ? groundAt(ppos.x, ppos.z, ppos.y + 0.05) : null;
        const on = g && g.surface && Math.abs(ppos.y - g.y) < 0.25 ? g.surface : null;
        for (const L of plat.leaves) {
          const target = on === L.s ? 1 : 0;
          L.k += (target - L.k) * Math.min(1, dt * 6);
          L.s.dy = -0.22 * L.k;
          L.leaf.position.y = L.s.dy;
          L.leaf.rotation.x = Math.sin(elapsed * 1.3 + L.ph) * 0.03 + Math.sin(elapsed * 9) * 0.05 * L.k;
          L.leaf.rotation.z = Math.cos(elapsed * 1.1 + L.ph) * 0.03;
        }
        for (const B of plat.bouncers) {
          if (on === B.s && B.k <= 0) { B.k = 0.5; particles?.burst(B.s.x, B.s.y + 0.2, B.s.z, { count: 10, colors: ['#ffb3d9', '#ffffff'], speed: 2, up: 1.5, life: 0.6 }); }
          if (on !== B.s && B.k < 0.05) B.k = 0;
          if (B.k > 0) {
            B.k = Math.max(0.0001, B.k - dt);
            const k = Math.sin((1 - B.k / 0.5) * Math.PI);
            B.obj.scale.set(1 + 0.25 * k, 1 - 0.35 * k, 1 + 0.25 * k);
            if (B.k <= 0.0001 && on !== B.s) B.k = 0;
          } else B.obj.scale.set(1, 1, 1);
        }
        for (const C of plat.clouds) {
          C.s.dy = Math.sin(elapsed * 0.8 + C.ph) * 0.08;
          C.obj.position.y = C.s.dy;
        }
      }

      // olhos: sono = região desbotada (+ um tiquinho à noite)
      updateEyes(dt, ppos, ppos, sleepOf);

      // janelas acendem à noite; postes brilham
      const wi = nightF * 1.5;
      for (const m of windowMats) m.emissiveIntensity = wi;
      for (const m of lampMats) m.emissiveIntensity = 0.2 + nightF * 2.4;

      // flags (névoa do Pico, ninho do casal)
      flagTimer -= dt;
      if (flagTimer <= 0) { flagTimer = 0.5; applyFlags(); }
      for (const gt of gates) {
        if (gt.open !== gt.target) {
          const was = gt.open;
          gt.open = clamp(gt.open + Math.sign(gt.target - gt.open) * dt / 3, 0, 1);
          if (was === 0 && gt.target === 1) {
            for (let i = 0; i < 12; i++) {
              const a = (i / 12) * Math.PI * 2, gd = gt.def;
              const x = gd.x + Math.cos(a) * gd.radius, z = gd.z + Math.sin(a) * gd.radius;
              particles?.burst(x, terrain.getHeight(clamp(x, -319, 319), clamp(z, -319, 319)) + 6, z, { count: 12, colors: ['#ffffff', '#ffe3f1', '#fff3a3'], speed: 6, up: 4, life: 2, size: 1.2, gravity: 0.3 });
            }
          }
        }
        const o = 1 - gt.open;
        gt.wall.material.uniforms.uOpacity.value = o;
        // a névoa acompanha a luz do céu (à noite fica lilás e apagadinha, não brilhando)
        gt.wall.material.uniforms.uTint.value.setRGB(1, 1, 1).lerp(scene.fog ? scene.fog.color : _c.set('#8a7fb8'), 0.25 + 0.45 * nightF).multiplyScalar(1 - 0.45 * nightF);
        gt.wall.visible = o > 0.01;
        gt.blobs.visible = o > 0.01;
        gt.blobs.scale.setScalar(1);
        gt.blobs.children.forEach((b, i) => { b.position.y += Math.sin(elapsed * 0.6 + i) * 0.004; b.scale.setScalar(Math.max(0.001, o)); });
        // vento visível perto da névoa
        if (o > 0.5 && particles) {
          const gd = gt.def;
          const d = Math.hypot(ppos.x - gd.x, ppos.z - gd.z);
          if (d < gd.radius + 25 && Math.random() < dt * 6) {
            const a = Math.atan2(ppos.z - gd.z, ppos.x - gd.x) + (Math.random() - 0.5) * 0.5;
            const x = gd.x + Math.cos(a) * (gd.radius + 1), z = gd.z + Math.sin(a) * (gd.radius + 1);
            particles.burst(x, terrain.getHeight(clamp(x, -319, 319), clamp(z, -319, 319)) + 1 + Math.random() * 4, z,
              { count: 4, colors: ['#ffffff', '#efe9ff'], speed: 3, up: 0.3, life: 1.2, size: 0.7, gravity: -0.2 });
          }
        }
      }

      // LOD: chunks de grama/flores, olhos e detalhes longe somem
      lodTimer -= dt;
      if (lodTimer <= 0) {
        lodTimer = 0.25;
        updateLights(ppos, nightF);
        scatter?.update(cam.x, cam.z);
        for (const e of eyeList) {
          const dx = e.x - cam.x, dz = e.z - cam.z;
          e.g.visible = dx * dx + dz * dz < e.far * e.far;
        }
        for (const b of baked) {
          if (!b.detail) continue;
          const dx = b.cx - cam.x, dz = b.cz - cam.z;
          b.mesh.visible = dx * dx + dz * dz < (DETAIL_FAR + 45) ** 2;
        }
      }

      const r = render.renderer;
      const pxScale = r ? r.domElement.height / (2 * Math.tan((render.camera.fov * Math.PI) / 360)) : 600;
      particles?.update(dt, ppos, nightF, pxScale);
    },

    /** Extra: colisor/superfície andável de quem constrói fora dos LANDMARKS (Casinha Asas de Saudade). */
    addCollider,
    addSurface(s) { surfHash.add(s, s.x, s.z, s.shape === 'circle' ? s.r + 0.5 : Math.hypot(s.hw, s.hd) + 0.5); },
    regionIds: () => REGION_IDS.slice(),
    getHeight: (x, z) => terrain.getHeight(x, z),
    groundAt,
    resolveCollision,
    regionAt,
    landmark: (id) => landmarks.get(id) ?? null,
    setRegionColor,
    spawnProp,
    removeProp,
    isWater: (x, z) => terrain.isWater(x, z),
    gateBlocked,
    /** Extra: explosão de brilhinhos (missões/UI podem usar em momentos especiais). */
    sparkle: (x, y, z, opts) => particles?.burst(x, y, z, opts),
    /** Extra: cor atual (animada) de uma região, 0..1. */
    regionColor: (id) => regionCur[id] ?? 1,
  };
  return world;
}
