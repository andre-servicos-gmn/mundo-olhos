// Balãozinho de emoção do Pinceso: Sprite (sempre de frente para a câmera) com textura desenhada em canvas.
// Os ícones conhecidos são desenhados à mão (não dependem de fonte de emoji); outros caem no fillText.
//   const b = createBubble(scene); b.show('❤', 2); b.update(dt, posicaoDoPinceso, camera);
import * as THREE from 'three';
import { clamp } from '../core/util.js';

const INK = '#3d2236';
const S = 128;
const cache = new Map();

function roundedBubble(ctx) {
  ctx.lineWidth = 7;
  ctx.strokeStyle = INK;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(64, 56, 46, 0.62 * Math.PI, 0.38 * Math.PI);   // círculo aberto embaixo
  ctx.lineTo(70, 112);                                      // biquinho do balão
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // brilhinho
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.strokeStyle = 'rgba(61,34,54,0.12)';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.ellipse(40, 32, 9, 5, -0.6, 0, Math.PI * 2); ctx.stroke();
}

const DRAW = {
  '❤'(ctx) {
    ctx.fillStyle = '#ff5f8f';
    ctx.beginPath();
    ctx.moveTo(64, 82);
    ctx.bezierCurveTo(28, 58, 34, 26, 56, 32);
    ctx.bezierCurveTo(61, 33, 64, 38, 64, 42);
    ctx.bezierCurveTo(64, 38, 67, 33, 72, 32);
    ctx.bezierCurveTo(94, 26, 100, 58, 64, 82);
    ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.stroke();
    ctx.fillStyle = '#ffd0df';
    ctx.beginPath(); ctx.ellipse(50, 44, 6, 4, -0.7, 0, Math.PI * 2); ctx.fill();
  },
  '❗'(ctx) {
    ctx.fillStyle = '#ff7a3d'; ctx.strokeStyle = INK; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.roundRect(55, 18, 18, 44, 9); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(64, 78, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffc3a0';
    ctx.beginPath(); ctx.roundRect(59, 23, 5, 18, 3); ctx.fill();
  },
  '🍬'(ctx) {   // jujuba (gotinha de goma açucarada)
    ctx.fillStyle = '#ff6fae'; ctx.strokeStyle = INK; ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(36, 80);
    ctx.bezierCurveTo(34, 50, 46, 24, 64, 24);
    ctx.bezierCurveTo(82, 24, 94, 50, 92, 80);
    ctx.bezierCurveTo(80, 86, 48, 86, 36, 80);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffffff';
    for (const [x, y] of [[52, 46], [72, 40], [62, 60], [80, 64], [46, 68], [66, 74]]) {
      ctx.beginPath(); ctx.arc(x, y, 2.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath(); ctx.ellipse(52, 36, 7, 4, -0.8, 0, Math.PI * 2); ctx.fill();
  },
  '💤'(ctx) {
    ctx.fillStyle = '#7b6cff'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
    ctx.font = 'bold 44px "Baloo 2", "Fredoka", "Arial Rounded MT Bold", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Z', 74, 42);
    ctx.font = 'bold 30px "Baloo 2", "Fredoka", "Arial Rounded MT Bold", sans-serif';
    ctx.fillText('z', 50, 66);
    ctx.font = 'bold 20px "Baloo 2", "Fredoka", "Arial Rounded MT Bold", sans-serif';
    ctx.fillText('z', 36, 82);
  },
  '♪'(ctx) {
    ctx.fillStyle = '#9b5cff'; ctx.strokeStyle = INK; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(52, 76, 13, 10, -0.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.roundRect(60, 24, 7, 52, 3); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(64, 24); ctx.bezierCurveTo(78, 30, 90, 36, 84, 56); ctx.bezierCurveTo(84, 44, 76, 40, 64, 40);
    ctx.fill();
  },
  '?'(ctx) {
    ctx.fillStyle = '#ffa21c'; ctx.strokeStyle = INK; ctx.lineWidth = 5;
    ctx.font = 'bold 72px "Baloo 2", "Fredoka", "Arial Rounded MT Bold", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.strokeText('?', 64, 58);
    ctx.fillText('?', 64, 58);
  },
};
DRAW['❤️'] = DRAW['❤'];
DRAW['♥'] = DRAW['❤'];
DRAW['!'] = DRAW['❗'];

function iconTexture(icon) {
  if (cache.has(icon)) return cache.get(icon);
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  roundedBubble(ctx);
  if (DRAW[icon]) DRAW[icon](ctx);
  else {
    ctx.font = '52px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = INK;
    ctx.fillText(String(icon), 64, 58);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  cache.set(icon, tex);
  return tex;
}

export function createBubble(scene) {
  const mat = new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false });
  mat.color.setScalar(0.94);   // branco um tiquinho abaixo de 1 para não estourar no bloom
  const sprite = new THREE.Sprite(mat);
  sprite.center.set(0.5, 0.02);  // cresce para cima a partir do biquinho
  sprite.renderOrder = 999;
  sprite.visible = false;
  sprite.name = 'pinceso_balao';
  scene.add(sprite);

  let life = 0, dur = 0, age = 0;
  const camPos = new THREE.Vector3();

  return {
    sprite,
    get active() { return life > 0; },
    show(icon, seconds = 2) {
      mat.map = iconTexture(icon);
      mat.needsUpdate = true;
      const fresh = life <= 0;
      life = dur = seconds;
      if (fresh) age = 0;
      sprite.visible = true;
    },
    hide() { life = 0; sprite.visible = false; },
    /** pos: ponto acima da cabeça do Pinceso. Escala cresce com a distância para ser visto de longe. */
    update(dt, pos, camera) {
      if (life <= 0) { sprite.visible = false; return; }
      life -= dt; age += dt;
      let k = 0.38;
      if (camera) {
        camera.getWorldPosition(camPos);
        k = clamp(camPos.distanceTo(pos) * 0.075, 0.34, 4);
      }
      // "pop" com exagero (easeOutBack) e saída encolhendo
      const a = clamp(age / 0.28, 0, 1);
      const pop = 1 + 2.4 * (a - 1) ** 3 + 1.4 * (a - 1) ** 2;
      const out = clamp(life / 0.25, 0, 1);
      const s = k * pop * (0.6 + 0.4 * out);
      sprite.scale.set(s, s, 1);
      sprite.position.copy(pos);
      sprite.position.y += Math.sin(age * 4) * 0.02 * k;
      mat.opacity = out;
      sprite.visible = life > 0;
    },
  };
}
