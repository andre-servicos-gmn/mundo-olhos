// Marcadores flutuantes dos moradores (billboards): '!' missão disponível, '?' aguardando a Quim, '♥' concluída,
// 'Zz' dormindo e a plaquinha com o nome. Texturas desenhadas em canvas (sem imagens externas) e compartilhadas.
import * as THREE from 'three';

const FONT = '"Baloo 2", "Fredoka", "Arial Rounded MT Bold", "Trebuchet MS", sans-serif';
const textures = new Map();

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function heartPath(g, cx, cy, s) {
  g.beginPath();
  g.moveTo(cx, cy + s * 0.9);
  g.bezierCurveTo(cx - s * 1.5, cy - s * 0.1, cx - s * 0.75, cy - s * 1.25, cx, cy - s * 0.45);
  g.bezierCurveTo(cx + s * 0.75, cy - s * 1.25, cx + s * 1.5, cy - s * 0.1, cx, cy + s * 0.9);
  g.closePath();
}

/** Bolha com sombra suave + símbolo. kind: '!' | '?' | '♥' | 'zz' */
function markerTexture(kind) {
  if (textures.has(kind)) return textures.get(kind);
  const tex = canvasTex(128, 160, (g) => {
    g.lineJoin = 'round';
    if (kind === '♥') {
      g.save();
      g.shadowColor = 'rgba(90,30,70,0.35)'; g.shadowBlur = 10; g.shadowOffsetY = 5;
      heartPath(g, 64, 78, 46);
      g.fillStyle = '#ff5f8f'; g.fill();
      g.restore();
      heartPath(g, 64, 78, 46);
      g.lineWidth = 9; g.strokeStyle = '#ffffff'; g.stroke();
      g.beginPath(); g.ellipse(46, 58, 10, 6, -0.6, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,255,0.75)'; g.fill();
      return;
    }
    if (kind === 'zz') {
      g.font = `bold 64px ${FONT}`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      for (const [x, y, sz] of [[46, 104, 64], [86, 56, 46]]) {
        g.font = `bold ${sz}px ${FONT}`;
        g.lineWidth = 10; g.strokeStyle = '#ffffff'; g.strokeText('z', x, y);
        g.fillStyle = '#9b7fe0'; g.fillText('z', x, y);
      }
      return;
    }
    const fill = kind === '!' ? '#ffd23f' : '#9fd8ff';
    // bolha arredondada com rabinho
    g.save();
    g.shadowColor = 'rgba(90,30,70,0.35)'; g.shadowBlur = 10; g.shadowOffsetY = 5;
    g.beginPath();
    g.arc(64, 66, 50, 0, Math.PI * 2);
    g.moveTo(52, 112); g.lineTo(64, 140); g.lineTo(76, 112);
    g.fillStyle = fill; g.fill();
    g.restore();
    g.beginPath(); g.arc(64, 66, 50, 0, Math.PI * 2);
    g.lineWidth = 8; g.strokeStyle = '#ffffff'; g.stroke();
    g.beginPath(); g.moveTo(54, 113); g.lineTo(64, 136); g.lineTo(74, 113);
    g.fillStyle = fill; g.fill(); g.lineWidth = 6; g.stroke();
    g.beginPath(); g.ellipse(44, 44, 12, 7, -0.7, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,255,0.7)'; g.fill();
    g.font = `900 78px ${FONT}`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#5a2a50';
    g.fillText(kind, 64, 72);
  });
  textures.set(kind, tex);
  return tex;
}

function spriteMat(tex) {
  return new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, toneMapped: false });
}

/** Sprite do marcador de missão ('!', '?', '♥'). Material próprio (a opacidade anima por morador). */
export function createMarkerSprite() {
  const sp = new THREE.Sprite(spriteMat(markerTexture('!')));
  sp.center.set(0.5, 0);
  sp.renderOrder = 20;
  sp.visible = false;
  sp.userData.kind = null;
  sp.setKind = (k) => {
    if (sp.userData.kind === k) return;
    sp.userData.kind = k;
    if (k) { sp.material.map = markerTexture(k); sp.material.needsUpdate = true; }
  };
  return sp;
}

export function createZzSprite() {
  const sp = new THREE.Sprite(spriteMat(markerTexture('zz')));
  sp.center.set(0.2, 0);
  sp.renderOrder = 19;
  sp.visible = false;
  return sp;
}

/** Plaquinha com o nome do morador. */
export function createNameSprite(name) {
  const W = 512, H = 112;
  const tex = canvasTex(W, H, (g) => {
    g.font = `bold 50px ${FONT}`;
    const tw = Math.min(W - 40, g.measureText(name).width + 56);
    const x0 = (W - tw) / 2, r = 36;
    g.save();
    g.shadowColor = 'rgba(90,30,70,0.3)'; g.shadowBlur = 8; g.shadowOffsetY = 4;
    g.beginPath();
    g.roundRect ? g.roundRect(x0, 18, tw, 74, r) : g.rect(x0, 18, tw, 74);
    g.fillStyle = 'rgba(255,250,253,0.94)'; g.fill();
    g.restore();
    g.lineWidth = 5; g.strokeStyle = '#ffb3d1'; g.stroke();
    g.fillStyle = '#5a2a50';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(name, W / 2, 57);
  });
  const sp = new THREE.Sprite(spriteMat(tex));
  sp.center.set(0.5, 0);
  sp.scale.set(1.9, 1.9 * H / W, 1);
  sp.renderOrder = 18;
  sp.visible = false;
  sp.material.opacity = 0;
  return sp;
}
