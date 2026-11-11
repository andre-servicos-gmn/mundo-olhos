// Pós-processamento: bloom suave, GTAO (só em 'alta'), vinheta + grade de cor pastel, saída ACES/sRGB.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Grade de cor em espaço linear (antes do OutputPass): leve dessaturação, sombras levantadas
// para um lilás suave, tom quentinho de dia / azulado à noite e vinheta.
const GradeShader = {
  name: 'GradePastel',
  uniforms: {
    tDiffuse: { value: null },
    uSat: { value: 0.93 },
    uLift: { value: new THREE.Color(0.55, 0.45, 0.8) },
    uLiftAmt: { value: 0.022 },
    uDayTint: { value: new THREE.Color(1.03, 1.0, 0.97) },
    uNightTint: { value: new THREE.Color(0.93, 0.95, 1.08) },
    uNight: { value: 0 },
    uVignette: { value: 0.3 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uSat;
    uniform vec3 uLift;
    uniform float uLiftAmt;
    uniform vec3 uDayTint;
    uniform vec3 uNightTint;
    uniform float uNight;
    uniform float uVignette;
    varying vec2 vUv;
    void main() {
      vec4 tex = texture2D(tDiffuse, vUv);
      vec3 c = tex.rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSat);
      c *= mix(uDayTint, uNightTint, uNight);
      c += uLift * uLiftAmt * (1.0 - clamp(l, 0.0, 1.0));
      vec2 q = (vUv - 0.5) * vec2(1.15, 1.0);
      float v = smoothstep(0.85, 0.22, length(q));
      c *= mix(1.0 - uVignette, 1.0, v);
      gl_FragColor = vec4(c, tex.a);
    }
  `,
};

/**
 * Cria o composer para a qualidade dada.
 * opts: { ao: bool, samples: número de amostras MSAA }
 * Retorna { composer, render(), setSize(w,h), setNight(noite 0..1, sono 0..1), dispose() }.
 */
export function createPost(renderer, scene, camera, opts = {}) {
  const size = renderer.getSize(new THREE.Vector2());
  const pr = renderer.getPixelRatio();
  const rt = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, {
    type: THREE.HalfFloatType,
    samples: opts.samples || 0,
  });
  rt.texture.name = 'MundoOlhos.rt';
  const composer = new EffectComposer(renderer, rt);

  composer.addPass(new RenderPass(scene, camera));

  let gtao = null;
  if (opts.ao) {
    gtao = new GTAOPass(scene, camera, size.x * pr, size.y * pr);
    gtao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.5, thickness: 1, scale: 1, samples: 16, distanceFallOff: 1 });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6 });
    gtao.blendIntensity = 0.8;
    composer.addPass(gtao);
  }

  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.32, 0.55, 1.25);
  composer.addPass(bloom);

  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  composer.addPass(new OutputPass());

  // O construtor do composer usa o tamanho do alvo como "tamanho lógico"; corrige aqui.
  composer.setSize(size.x, size.y);

  return {
    composer,
    render() { composer.render(); },
    setSize(w, h) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h); },
    // n: 0 dia .. 1 noite (bloom mais generoso para janelas e vaga-lumes).
    // sleep: 0..1 sonolência do reino (tira um pouquinho de saturação da imagem toda).
    setNight(n, sleep = 0) {
      bloom.threshold = 1.25 + (0.7 - 1.25) * n;
      bloom.strength = 0.32 + (0.5 - 0.32) * n;
      grade.uniforms.uNight.value = n;
      grade.uniforms.uSat.value = 1.06 - 0.14 * sleep;   // ACES tira um pouco de cor; devolvemos
    },
    dispose() {
      for (const p of composer.passes) p.dispose?.();
      composer.dispose();
    },
  };
}
