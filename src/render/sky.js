// Céu do Mundo Olhos: cúpula em gradiente com o SOL-OLHO (um grande olho dourado que pisca),
// a lua dorminhoca, estrelas cintilantes + paleta de cores do ciclo do dia.
import * as THREE from 'three';

// Pontos-chave do dia (hex sRGB). t = dayTime: 0.25 nascer, 0.5 meio-dia, 0.75 pôr do sol.
// top: alto do céu · horizon: horizonte/névoa · light: cor da luz principal (sol ou lua)
// hemiSky/hemiGround: luz hemisférica · amb: luz ambiente. *I = intensidades.
const KEYS = [
  { t: 0.00, top: '#141238', horizon: '#3a3170', light: '#8fa3ff', lightI: 0.5, hemiSky: '#5658a8', hemiGround: '#2b2546', hemiI: 0.6, amb: '#6c66b8', ambI: 0.2 },
  { t: 0.20, top: '#2a2766', horizon: '#8a6aa8', light: '#a8a6ff', lightI: 0.4, hemiSky: '#7a74b8', hemiGround: '#3d3350', hemiI: 0.65, amb: '#8a7cc0', ambI: 0.22 },
  { t: 0.25, top: '#6f8fd8', horizon: '#ffb7a6', light: '#ffb48a', lightI: 1.3, hemiSky: '#ffd2c8', hemiGround: '#7d6a72', hemiI: 0.85, amb: '#ffc8c0', ambI: 0.25 },
  { t: 0.32, top: '#5aa6f2', horizon: '#ffdce8', light: '#fff0dc', lightI: 1.9, hemiSky: '#d6ecff', hemiGround: '#968a74', hemiI: 0.85, amb: '#fff0f4', ambI: 0.24 },
  { t: 0.50, top: '#3f9dff', horizon: '#c2e4ff', light: '#fff6e8', lightI: 2.1, hemiSky: '#dceeff', hemiGround: '#a09478', hemiI: 0.9, amb: '#ffffff', ambI: 0.25 },
  { t: 0.68, top: '#5a98ec', horizon: '#ffe0c0', light: '#ffe8c8', lightI: 1.9, hemiSky: '#ffeedd', hemiGround: '#9a8a74', hemiI: 0.85, amb: '#fff2e4', ambI: 0.24 },
  { t: 0.75, top: '#7c74cc', horizon: '#ffa39e', light: '#ff9a6e', lightI: 1.3, hemiSky: '#ffc6c0', hemiGround: '#7a6070', hemiI: 0.85, amb: '#ffc0c8', ambI: 0.25 },
  { t: 0.80, top: '#352d70', horizon: '#b0709f', light: '#a8a6ff', lightI: 0.4, hemiSky: '#7a6cb0', hemiGround: '#3d3150', hemiI: 0.65, amb: '#8a78c0', ambI: 0.22 },
];
const COLORS = ['top', 'horizon', 'light', 'hemiSky', 'hemiGround', 'amb'];
const NUMS = ['lightI', 'hemiI', 'ambI'];

// Converte uma vez para THREE.Color (linear) e fecha o ciclo (t = 1 igual a t = 0).
const keys = KEYS.map((k) => {
  const o = { t: k.t };
  for (const c of COLORS) o[c] = new THREE.Color(k[c]);
  for (const n of NUMS) o[n] = k[n];
  return o;
});
keys.push({ ...keys[0], t: 1 });

/** Objeto reutilizável com as cores/intensidades do momento. */
export function createSkyColors() {
  const o = {};
  for (const c of COLORS) o[c] = new THREE.Color();
  for (const n of NUMS) o[n] = 0;
  return o;
}

/** Preenche `out` com a interpolação suave para o dayTime t (0..1). Sem alocações. */
export function sampleSky(t, out) {
  let i = 0;
  while (i < keys.length - 2 && t >= keys[i + 1].t) i++;
  const a = keys[i], b = keys[i + 1];
  let k = (t - a.t) / (b.t - a.t);
  k = k * k * (3 - 2 * k);
  for (const c of COLORS) out[c].copy(a[c]).lerp(b[c], k);
  for (const n of NUMS) out[n] = a[n] + (b[n] - a[n]) * k;
  return out;
}

const vertexShader = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */`
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  uniform vec3 uSunRight;
  uniform vec3 uSunUp;
  uniform vec3 uMoonDir;
  uniform vec3 uMoonRight;
  uniform vec3 uMoonUp;
  uniform float uSunTan;     // tangente do raio angular do sol
  uniform float uMoonTan;
  uniform float uSunVis;
  uniform float uMoonVis;
  uniform float uNight;
  uniform float uTime;
  uniform float uOpen;       // abertura do olho do sol (0 fechado .. 1 aberto)
  uniform vec2 uLook;        // para onde a pupila do sol olha (-1..1)
  varying vec3 vDir;

  float hash3(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float segDist(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h);
  }

  // Círculo suave (cobertura 0..1) com borda antisserrilhada.
  float disc(vec2 p, vec2 c, float r, float aa) {
    return smoothstep(r + aa, r - aa, length(p - c));
  }

  // Desenha um olho fofo em coordenadas locais (raio do astro = 1) sobre a cor 'col'.
  // open: 0 = fechado (curvinha em U com cílios para baixo) .. 1 = aberto.
  vec3 drawEye(vec3 col, vec2 p, float open, vec2 look, float aa, vec3 ink, vec3 lid) {
    const float W = 0.6;
    float x = p.x / W;
    float k = max(1.0 - x * x, 0.0);
    float inX = smoothstep(1.0 + aa * 2.0, 1.0 - aa * 2.0, abs(x));
    float yBot = -0.04 - 0.27 * pow(k, 0.8);
    float yTopOpen = -0.04 + 0.42 * pow(k, 0.6);
    float yTop = mix(yBot, yTopOpen, open);

    // Pálpebra (a parte do olho coberta quando ele está sonolento): dourado um pouco mais escuro.
    float almond = inX * smoothstep(-aa, aa, yTopOpen - p.y) * smoothstep(-aa, aa, p.y - yBot);
    col = mix(col, lid, almond * 0.55 * (1.0 - open));

    // Branco do olho, íris com degradê, pupila e brilhinhos.
    float inside = inX * smoothstep(-aa, aa, yTop - p.y) * smoothstep(-aa, aa, p.y - yBot);
    vec3 eye = vec3(1.0, 0.97, 0.9);
    vec2 c = vec2(look.x * 0.2, -0.06 + look.y * 0.1);
    float ir = length(p - c);
    vec3 iris = mix(vec3(0.95, 0.55, 0.12), vec3(0.42, 0.17, 0.04), smoothstep(0.05, 0.26, ir));
    eye = mix(eye, iris, disc(p, c, 0.25, aa));
    eye = mix(eye, vec3(0.1, 0.04, 0.02), disc(p, c, 0.12, aa));
    eye = mix(eye, vec3(1.25), disc(p, c + vec2(0.08, 0.09), 0.06, aa));
    eye = mix(eye, vec3(1.1), disc(p, c + vec2(-0.08, -0.08), 0.03, aa));
    col = mix(col, eye, inside);

    // Contorno: pálpebra de cima grossa, de baixo fininha.
    float topLine = smoothstep(0.035 + aa, 0.035 - aa, abs(p.y - yTop)) * inX;
    float botLine = smoothstep(0.016 + aa, 0.016 - aa, abs(p.y - yBot)) * inX;
    col = mix(col, ink, max(topLine, botLine * open));

    // Três cílios ao longo da pálpebra de cima (para cima se aberto, para baixo se fechado).
    float lash = 0.0;
    for (int i = 0; i < 3; i++) {
      float lx = (float(i) - 1.0) * 0.62;
      float lk = 1.0 - lx * lx;
      vec2 b = vec2(lx * W, mix(-0.04 - 0.27 * pow(lk, 0.8), -0.04 + 0.42 * pow(lk, 0.6), open));
      vec2 dir = normalize(vec2(lx * 1.1, mix(-0.9, 1.0, open)));
      float len = i == 1 ? 0.17 * smoothstep(0.15, 0.5, open) : 0.17;  // fechado: só os cílios dos cantos
      if (len > 0.01) lash = max(lash, smoothstep(0.03 + aa, 0.03 - aa, segDist(p, b, b + dir * len)));
    }
    return mix(col, ink, lash);
  }

  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;

    // Gradiente: horizonte -> topo; abaixo do horizonte, um pouco mais escuro.
    float up = pow(clamp(h, 0.0, 1.0), 0.5);
    vec3 col = mix(uHorizon, uTop, smoothstep(0.0, 1.0, up));
    col = mix(col, uHorizon * 0.88, smoothstep(0.0, -0.2, h));
    float aboveHorizon = smoothstep(-0.03, 0.005, h);

    // ---- Sol: brilho largo + coroa de pétalas + disco dourado com um grande olho gentil ----
    float sd = dot(d, uSunDir);
    float sdp = max(sd, 0.0);
    col += uSunColor * (pow(sdp, 5.0) * 0.22 + pow(sdp, 40.0) * 0.18) * uSunVis;
    if (sd > 0.5 && uSunVis > 0.001) {
      vec2 p = vec2(dot(d, uSunRight), dot(d, uSunUp)) / (sd * uSunTan);
      float aa = max(length(fwidth(p)), 0.004);
      float r = length(p);
      float ang = atan(p.y, p.x);
      float vis = uSunVis * aboveHorizon;

      // Coroa: pétalas arredondadas que giram devagar.
      float petal = 1.22 + 0.13 * (0.5 + 0.5 * cos(ang * 12.0 + uTime * 0.12));
      float corona = smoothstep(petal + aa * 2.0, petal - aa * 2.0, r);
      col = mix(col, vec3(1.1, 0.62, 0.2), corona * 0.8 * vis);

      // Disco dourado (brilha o bastante para o bloom), com bochechinhas rosadas.
      float body = smoothstep(1.0 + aa, 1.0 - aa, r);
      vec3 gold = mix(vec3(1.3, 0.95, 0.3), vec3(1.25, 0.66, 0.16), smoothstep(0.1, 1.0, r));
      gold = mix(gold, vec3(1.3, 0.55, 0.5), disc(vec2(abs(p.x), p.y), vec2(0.66, -0.46), 0.16, 0.08) * 0.7);
      vec3 sunCol = drawEye(gold, p, uOpen, uLook, aa, vec3(0.4, 0.16, 0.04), vec3(1.05, 0.55, 0.14));
      col = mix(col, sunCol, body * vis);
    }

    // ---- Lua: disco creme com crateras suaves e um olhinho dormindo ----
    float md = dot(d, uMoonDir);
    float mdp = max(md, 0.0);
    col += vec3(0.6, 0.65, 1.0) * (pow(mdp, 60.0) * 0.18 + pow(mdp, 400.0) * 0.12) * uMoonVis;
    float moonCover = 0.0;
    if (md > 0.5 && uMoonVis > 0.001) {
      vec2 p = vec2(dot(d, uMoonRight), dot(d, uMoonUp)) / (md * uMoonTan);
      float aa = max(length(fwidth(p)), 0.004);
      float r = length(p);
      moonCover = smoothstep(1.0 + aa, 1.0 - aa, r) * uMoonVis * aboveHorizon;
      vec3 moon = mix(vec3(0.62, 0.56, 0.36), vec3(0.5, 0.45, 0.36), smoothstep(0.3, 1.0, r));
      moon = mix(moon, moon * 0.8, disc(p, vec2(0.45, 0.5), 0.17, aa) * 0.8);
      moon = mix(moon, moon * 0.82, disc(p, vec2(-0.55, 0.3), 0.11, aa) * 0.8);
      moon = mix(moon, moon * 0.84, disc(p, vec2(0.15, -0.68), 0.1, aa) * 0.8);
      moon = mix(moon, vec3(0.65, 0.34, 0.4), disc(vec2(abs(p.x), p.y), vec2(0.6, -0.36), 0.14, 0.07) * 0.5);
      moon = drawEye(moon, p * 1.15 + vec2(0.0, -0.05), 0.0, vec2(0.0), aa * 1.15, vec3(0.3, 0.22, 0.38), moon);
      col = mix(col, moon, moonCover);
    }

    // ---- Estrelas procedurais que cintilam ----
    float starAmt = smoothstep(0.45, 1.0, uNight);
    if (starAmt > 0.001 && h > 0.0) {
      vec3 p = d * 95.0;
      vec3 cell = floor(p);
      float r = hash3(cell);
      if (r > 0.955) {
        vec3 offs = vec3(hash3(cell + 1.7), hash3(cell + 3.1), hash3(cell + 5.3)) * 0.6 + 0.2;
        float s = smoothstep(0.2 + (r - 0.955) * 2.0, 0.0, length(fract(p) - offs));
        float tw = 0.55 + 0.45 * sin(uTime * (1.5 + r * 3.0) + r * 91.0);
        vec3 starCol = mix(vec3(1.0, 0.9, 0.75), vec3(0.8, 0.86, 1.0), hash3(cell + 9.9));
        starCol = mix(starCol, vec3(1.0, 0.75, 0.9), step(0.8, hash3(cell + 4.4)));
        col += starCol * s * tw * starAmt * smoothstep(0.0, 0.25, h) * (1.0 - moonCover) * 2.2;
      }
    }

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/**
 * Cúpula do céu (segue a câmera). Atualize os uniforms via mesh.material.uniforms.
 * radius deve ser menor que camera.far.
 */
export function createSkyDome(radius = 800) {
  const v3 = (x, y, z) => ({ value: new THREE.Vector3(x, y, z) });
  const uniforms = {
    uTop: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uSunColor: { value: new THREE.Color() },
    uSunDir: v3(0, 1, 0), uSunRight: v3(1, 0, 0), uSunUp: v3(0, 0, -1),
    uMoonDir: v3(0, -1, 0), uMoonRight: v3(1, 0, 0), uMoonUp: v3(0, 0, 1),
    uSunTan: { value: Math.tan(0.085) },
    uMoonTan: { value: Math.tan(0.055) },
    uSunVis: { value: 1 },
    uMoonVis: { value: 0 },
    uNight: { value: 0 },
    uTime: { value: 0 },
    uOpen: { value: 1 },
    uLook: { value: new THREE.Vector2(0, -0.5) },
  };
  const material = new THREE.ShaderMaterial({
    name: 'ceu',
    uniforms,
    vertexShader,
    fragmentShader,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24), material);
  mesh.name = 'ceu';
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  return mesh;
}

const WORLD_UP = new THREE.Vector3(0, 1, 0);
/** Base local de um astro (direita/cima na tela do céu), para o olho ficar "em pé". */
export function bodyBasis(dir, outRight, outUp) {
  outUp.copy(WORLD_UP).addScaledVector(dir, -dir.y);
  if (outUp.lengthSq() < 1e-6) outUp.set(0, 0, -1);
  outUp.normalize();
  outRight.crossVectors(dir, outUp).normalize();
}
