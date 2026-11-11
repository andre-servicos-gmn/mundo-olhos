// Render do Mundo Olhos: renderer, câmera, céu (com o sol-olho), ciclo dia/noite, luzes, névoa,
// nuvens e pós-processamento. Ver docs/ARQUITETURA.md (API "render").
import * as THREE from 'three';
import { REGIONS, SPAWN } from '../data/worldmap.js';
import { smoothstep, lerp, damp } from '../core/util.js';
import { createSkyDome, createSkyColors, sampleSky, bodyBasis } from './sky.js';
import { createClouds } from './clouds.js';
import { createPost } from './post.js';

const DAY_SECONDS = 600;     // dia completo = 10 min reais
const SHADOW_HALF = 30;      // câmera de sombra cobre ~60 m ao redor do alvo
const SHADOW_DIST = 120;     // distância da luz até o alvo
const CAMERA_FAR = 900;
const QUALITY = {
  baixa: { pixelRatio: 1, shadowSize: 512, post: false, ao: false, samples: 0 },
  media: { pixelRatio: 1.25, shadowSize: 1024, post: true, ao: false, samples: 2 },
  alta: { pixelRatio: 2, shadowSize: 2048, post: true, ao: true, samples: 4 },
};
const CAMPO = REGIONS.find((r) => r.id === 'campo')?.center ?? { x: 0, z: 165 };
const UP = new THREE.Vector3(0, 1, 0);

function phaseOf(t) {
  if (t >= 0.2 && t < 0.3) return 'amanhecer';
  if (t >= 0.3 && t < 0.7) return 'dia';
  if (t >= 0.7 && t < 0.8) return 'entardecer';
  return 'noite';
}
const wrap01 = (v) => ((v % 1) + 1) % 1;

export function createRender(game, rootEl) {
  // --- renderer -------------------------------------------------------------------------------
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.25));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.style.display = 'block';
  rootEl.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, CAMERA_FAR);
  camera.position.set(SPAWN.x, 6, SPAWN.z + 8);
  camera.lookAt(SPAWN.x, 2, SPAWN.z - 10);
  scene.add(camera);

  const fog = new THREE.Fog('#ffe3f1', 45, 470);
  scene.fog = fog;

  // --- luzes ----------------------------------------------------------------------------------
  const hemi = new THREE.HemisphereLight('#e4f3ff', '#a39a80', 1);
  const ambient = new THREE.AmbientLight('#ffffff', 0.3);
  const sun = new THREE.DirectionalLight('#fff6e8', 2.5);
  sun.name = 'sol';
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera;
  sc.left = -SHADOW_HALF; sc.right = SHADOW_HALF; sc.top = SHADOW_HALF; sc.bottom = -SHADOW_HALF;
  sc.near = 1; sc.far = SHADOW_DIST + 120;
  sc.updateProjectionMatrix();
  scene.add(hemi, ambient, sun, sun.target);

  // --- céu e nuvens ---------------------------------------------------------------------------
  const sky = createSkyDome(CAMERA_FAR - 100);
  const su = sky.material.uniforms;
  scene.add(sky);
  const clouds = createClouds(11);
  scene.add(clouds.group);

  // Cores de névoa por região (lerp suave quando a Quim muda de região).
  const regionFog = new Map(REGIONS.map((r) => [r.id, new THREE.Color(r.palette.fog)]));

  // --- estado interno (pré-alocado: nada de "new" no loop) -------------------------------------
  const colors = createSkyColors();
  const sunDir = new THREE.Vector3(0, 1, 0);   // direção real do sol (pode estar abaixo do horizonte)
  const moonDir = new THREE.Vector3();
  const lightDir = new THREE.Vector3(0, 1, 0); // direção da luz que faz sombra (sol de dia, lua à noite)
  const lsRight = new THREE.Vector3();
  const lsUp = new THREE.Vector3();
  const snapPos = new THREE.Vector3();
  const menuLook = new THREE.Vector3(CAMPO.x, 4, CAMPO.z);
  const shadowTarget = new THREE.Vector3(SPAWN.x, 0, SPAWN.z);
  const fogTint = new THREE.Color();
  const fogTintTarget = new THREE.Color();
  const tmpColor = new THREE.Color();
  const cloudTint = new THREE.Color();
  const cloudEmissive = new THREE.Color();
  const CLOUD_NIGHT = new THREE.Color('#6f6aa8');
  const WHITE = new THREE.Color('#ffffff');

  let dayTime = wrap01(game.state?.dayTime ?? 0.3);
  let phase = phaseOf(dayTime);
  let nightF = 0;
  let elapsed = 0;
  let quality = null;
  let post = null;
  let menuMode = false;
  let menuRaf = 0;
  let menuAngle = Math.PI / 2;
  let externalAt = -1e9;     // último render() chamado pelo loop principal
  let skip = null;           // { from, delta, t, dur, resolve }
  let ticked = false;        // update() rodou desde o último render()
  let pendingDt = 0;
  let lastNow = performance.now();
  let hasTint = false;
  let regionTimer = 0;

  // Sol-olho: sonolência do reino (média das cores das regiões) + piscadas.
  let sleepiness = kingdomSleep();
  let blinkT = 0;            // >0 enquanto pisca
  let blinkDur = 0.2;
  let nextBlink = 2 + Math.random() * 3;
  let sunOpen = 1;

  function kingdomSleep() {
    const rc = game.state?.regionColor;
    if (!rc) return 0;
    let sum = 0;
    for (const r of REGIONS) sum += rc[r.id] ?? 0;
    return 1 - sum / Math.max(1, REGIONS.length);
  }

  function setDay(v) {
    dayTime = wrap01(v);
    if (game.state) game.state.dayTime = dayTime;
    const p = phaseOf(dayTime);
    if (p !== phase) {
      phase = p;
      game.bus?.emit('time:phase', { phase, dayTime });
    }
  }

  function finishSkip() {
    if (!skip) return;
    const r = skip.resolve;
    skip = null;
    r();
  }

  function advanceSkip(dt) {
    skip.t += dt;
    const k = Math.min(1, skip.t / skip.dur);
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    setDay(skip.from + skip.delta * e);
    if (k >= 1) finishSkip();
  }

  // Lê a região atual (preguiçoso: world/player podem ainda não existir).
  function updateRegionTint(dt) {
    regionTimer -= dt;
    if (regionTimer > 0 && hasTint) return;
    regionTimer = 0.25;
    const pos = menuMode ? menuLook : game.player?.position;
    if (!pos) return;
    const id = game.world?.regionAt?.(pos.x, pos.z);
    const c = id && regionFog.get(id);
    if (!c) return;
    fogTintTarget.copy(c);
    if (!hasTint) { fogTint.copy(c); hasTint = true; }
  }

  // Pálpebras do sol: pesadas quando o reino está desbotado e quando o sol está baixinho
  // (acorda devagar no amanhecer, boceja no entardecer). Pisca de vez em quando.
  function updateSunEye(dt) {
    sleepiness = damp(sleepiness, kingdomSleep(), 1.5, dt);
    const low = 1 - smoothstep(0.02, 0.3, sunDir.y);
    const heavy = Math.max(sleepiness * 0.8, low * 0.7);
    nextBlink -= dt;
    if (nextBlink <= 0 && blinkT <= 0) {
      blinkDur = 0.2 + heavy * 0.5;           // sonolento = piscada lenta
      blinkT = blinkDur;
      nextBlink = 2.5 + Math.random() * 4 - heavy * 1.2;
    }
    let close = 0;
    if (blinkT > 0) {
      blinkT -= dt;
      close = Math.sin(Math.PI * Math.max(0, blinkT) / blinkDur);
    }
    sunOpen = (1 - close) * (1 - 0.6 * heavy);
    su.uOpen.value = sunOpen;
    // Olha para baixo, para o mundo (e para a Quim), passeando devagar o olhar.
    su.uLook.value.set(Math.sin(elapsed * 0.13) * 0.35, -0.55 + Math.sin(elapsed * 0.21) * 0.2);
  }

  // Céu, luzes, névoa, nuvens e grade para o dayTime atual. dt = tempo de animação deste quadro.
  function stepVisuals(dt) {
    elapsed += dt;
    sampleSky(dayTime, colors);

    // Sol nasce no leste (+x), passa alto pelo sul (+z) e se põe no oeste; a lua faz o caminho oposto.
    const a = (dayTime - 0.25) * Math.PI * 2;
    sunDir.set(Math.cos(a), Math.sin(a), 0.7).normalize();
    moonDir.set(-Math.cos(a), -Math.sin(a), 0.5).normalize();
    nightF = 1 - smoothstep(0.2, 0.28, dayTime) * (1 - smoothstep(0.72, 0.8, dayTime));
    const sunVis = smoothstep(-0.12, 0.0, sunDir.y);
    const moonVis = smoothstep(-0.12, 0.0, moonDir.y) * (0.2 + 0.8 * nightF);

    // Luz principal: sol de dia, lua à noite (troca perto do horizonte, quando está fraquinha).
    const useSun = sunDir.y > -0.02;
    lightDir.copy(useSun ? sunDir : moonDir);
    const elev = lightDir.y;
    if (lightDir.y < 0.25) { lightDir.y = 0.25; lightDir.normalize(); }
    sun.color.copy(colors.light);
    sun.intensity = colors.lightI * (0.2 + 0.8 * smoothstep(0, 0.12, elev));
    hemi.color.copy(colors.hemiSky);
    hemi.groundColor.copy(colors.hemiGround);
    hemi.intensity = colors.hemiI;
    ambient.color.copy(colors.amb);
    ambient.intensity = colors.ambI;

    // Névoa: horizonte do céu puxado para a cor da região (mais fraco à noite).
    updateRegionTint(dt);
    if (hasTint) fogTint.lerp(fogTintTarget, 1 - Math.exp(-1.2 * dt));
    fog.color.copy(colors.horizon);
    if (hasTint) {
      tmpColor.copy(fogTint).multiplyScalar(1 - 0.65 * nightF);
      fog.color.lerp(tmpColor, 0.32 * (1 - 0.6 * nightF));
    }
    fog.near = lerp(45, 35, nightF);
    fog.far = lerp(470, 380, nightF);
    renderer.setClearColor(fog.color);
    renderer.toneMappingExposure = 1 + 0.15 * nightF;

    // Céu.
    su.uTop.value.copy(colors.top);
    su.uHorizon.value.copy(fog.color);
    su.uSunColor.value.copy(useSun ? colors.light : WHITE);
    su.uSunDir.value.copy(sunDir);
    bodyBasis(sunDir, su.uSunRight.value, su.uSunUp.value);
    su.uMoonDir.value.copy(moonDir);
    bodyBasis(moonDir, su.uMoonRight.value, su.uMoonUp.value);
    su.uSunVis.value = sunVis;
    su.uMoonVis.value = moonVis;
    su.uNight.value = nightF;
    su.uTime.value = elapsed;
    updateSunEye(dt);

    // Nuvens: brancas de dia, lilás à noite, tingidas pelo horizonte (rosadas no pôr do sol).
    cloudTint.copy(WHITE).lerp(CLOUD_NIGHT, nightF).lerp(colors.horizon, 0.2);
    cloudEmissive.copy(colors.horizon).multiplyScalar(0.38 - 0.1 * nightF);  // barriga da nuvem nunca fica cinza
    clouds.update(dt, camera.position, cloudTint, cloudEmissive, nightF, skip ? 30 : 1);

    post?.setNight(nightF, sleepiness);
  }

  // Câmera do menu: órbita lenta e alta sobre o Campo das Pétalas.
  function updateMenuCamera(dt) {
    menuAngle += dt * 0.05;
    const r = 62;
    const x = CAMPO.x + Math.cos(menuAngle) * r;
    const z = CAMPO.z + Math.sin(menuAngle) * r;
    const gh = game.world?.getHeight?.(x, z) ?? 0;
    const ch = game.world?.getHeight?.(CAMPO.x, CAMPO.z) ?? 0;
    camera.position.set(x, Math.max(gh + 15, ch + 18) + Math.sin(elapsed * 0.3) * 1.5, z);
    menuLook.set(CAMPO.x, ch + 4, CAMPO.z);
    camera.lookAt(menuLook);
  }

  // Céu acompanha a câmera; luz do sol acompanha o alvo (com encaixe no texel p/ a sombra não tremer).
  function syncFollowers() {
    sky.position.copy(camera.position);
    const target = menuMode ? menuLook : shadowTarget;
    lsRight.crossVectors(UP, lightDir);
    if (lsRight.lengthSq() < 1e-6) lsRight.set(1, 0, 0);
    lsRight.normalize();
    lsUp.crossVectors(lightDir, lsRight).normalize();
    const texel = (SHADOW_HALF * 2) / sun.shadow.mapSize.x;
    const rr = Math.round(target.dot(lsRight) / texel) * texel;
    const uu = Math.round(target.dot(lsUp) / texel) * texel;
    snapPos.copy(lsRight).multiplyScalar(rr).addScaledVector(lsUp, uu).addScaledVector(lightDir, target.dot(lightDir));
    sun.target.position.copy(snapPos);
    sun.position.copy(snapPos).addScaledVector(lightDir, SHADOW_DIST);
  }

  function draw() {
    if (post) post.render();
    else renderer.render(scene, camera);
  }

  function frame(fromMenuLoop) {
    const now = performance.now();
    const rawDt = (now - lastNow) / 1000;
    const realDt = Math.min(rawDt, 0.05);
    lastNow = now;
    if (!fromMenuLoop) externalAt = now;
    if (skip) advanceSkip(Math.min(rawDt, 1));     // a passagem de tempo dura o combinado mesmo com FPS baixo
    // Pausado: o mundo congela (dt 0), exceto no menu e durante a passagem rápida de tempo.
    const vdt = ticked ? pendingDt : (menuMode || skip ? realDt : 0);
    ticked = false;
    pendingDt = 0;
    if (menuMode) updateMenuCamera(realDt);
    stepVisuals(vdt);
    syncFollowers();
    draw();
  }

  function onResize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    post?.setSize(w, h);
  }
  addEventListener('resize', onResize);

  function setQuality(q) {
    if (!QUALITY[q]) q = 'media';
    if (q === quality) return;
    quality = q;
    const cfg = QUALITY[q];
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, cfg.pixelRatio));
    renderer.setSize(innerWidth, innerHeight);
    if (sun.shadow.mapSize.x !== cfg.shadowSize) {
      sun.shadow.mapSize.set(cfg.shadowSize, cfg.shadowSize);
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    }
    // Viés proporcional ao tamanho do texel: sem "acne" e sem sombra descolando do pé.
    const texel = (SHADOW_HALF * 2) / cfg.shadowSize;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = texel * 0.6;
    post?.dispose();
    post = cfg.post ? createPost(renderer, scene, camera, { ao: cfg.ao, samples: cfg.samples }) : null;
    post?.setNight(nightF, sleepiness);
  }

  const render = {
    renderer,
    scene,
    camera,
    sun,
    shadowTarget,
    /** Direção (normalizada) para o sol; y < 0 quando ele está abaixo do horizonte. */
    sunDir,
    /** Direção da luz que faz sombra (sol de dia, lua à noite), sempre acima do horizonte. */
    lightDir,
    /** Cor do alto do céu e do horizonte/névoa neste quadro (THREE.Color vivas — não altere). */
    skyColor: colors.top,
    horizonColor: fog.color,
    get composer() { return post ? post.composer : null; },
    get quality() { return quality; },
    /** 0 = dia pleno .. 1 = noite fechada (suave; bom para acender janelas e vaga-lumes). */
    get nightFactor() { return nightF; },
    /** 0..1: quão sonolento/desbotado está o reino (média de state.regionColor). */
    get sleepiness() { return sleepiness; },

    get dayTime() { return dayTime; },
    set dayTime(v) {
      finishSkip();
      setDay(Number(v) || 0);
    },

    update(dt) {
      ticked = true;
      pendingDt += dt;
      if (!skip) setDay(dayTime + dt / DAY_SECONDS);
    },

    render() { frame(false); },

    setQuality,
    isNight() { return phase === 'noite'; },
    timePhase() { return phase; },

    /** Passagem rápida de tempo até `target` (sempre para frente). Resolve ao chegar. */
    skipTo(target, seconds = 3) {
      finishSkip();
      return new Promise((resolve) => {
        target = Number(target) || 0;
        const delta = wrap01(target - dayTime);
        if (delta < 1e-4 || !(seconds > 0)) {
          setDay(target);
          resolve();
          return;
        }
        skip = { from: dayTime, delta, t: 0, dur: seconds, resolve };
      });
    },

    /** Menu: câmera orbitando o Campo. Desenha sozinho (o loop principal ainda não roda no menu). */
    setMenuMode(on) {
      on = !!on;
      if (on === menuMode) return;
      menuMode = on;
      if (on) {
        menuAngle = Math.PI / 2;   // começa ao sul, olhando para o norte
        regionTimer = 0;
        lastNow = performance.now();
        const tick = () => {
          if (!menuMode) return;
          menuRaf = requestAnimationFrame(tick);
          if (performance.now() - externalAt > 100) frame(true);
        };
        menuRaf = requestAnimationFrame(tick);
      } else {
        cancelAnimationFrame(menuRaf);
        regionTimer = 0;
      }
    },

    /** Compila os shaders antes de mostrar o jogo (evita travadinhas). */
    async warmup() {
      stepVisuals(0);
      syncFollowers();
      try {
        if (renderer.compileAsync) await renderer.compileAsync(scene, camera);
        else renderer.compile(scene, camera);
      } catch (e) {
        console.warn('[render] warmup', e);
      }
      draw();
      lastNow = performance.now();
    },
  };

  setQuality(game.state?.settings?.quality ?? 'media');
  stepVisuals(0);
  syncFollowers();
  return render;
}
