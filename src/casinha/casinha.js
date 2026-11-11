// Casinha Asas de Saudade: o reencontro, a vida na clareira e os carinhos (docs/casinha-asas-de-saudade.md).
// Lugar à parte, sem missão. As esperas das cenas contam tempo de jogo, então a pausa (Esc) congela a cena.
import * as THREE from 'three';
import { SPOTS } from '../data/worldmap.js';
import { ASAS_NAME, ASAS_DEDICATORIA, ASAS_CHEGADA, ASAS_REENCONTRO } from '../data/asas.js';
import { buildCasinha } from './house.js';
import { createBirds } from './birds.js';
import { createOverlay } from './overlay.js';

const ASAS = SPOTS.asas_de_saudade;
const FLAG = 'visitou_asas_de_saudade';
const FLAG_PINCESO = 'asas_pinceso_visitou';
const SKIP_HOLD = 1.4;     // segundos segurando Espaço para pular a cena
const FACE_BACK = -Math.PI / 2;   // a Quim de frente para o fundo da casinha

// De onde cada um vem no reencontro (coordenadas locais da casinha) e onde pousa ao lado da Quim
// ([para o lado, para a frente], em metros, de quem olha para ela), sem tampar o rostinho dela.
const ORIGEM = {
  kie: [0.35, 2.3, 6], vidinho: [-0.35, 2.3, 6], pirix: [-6, 2, -1.7], bolinha: [6, 2, 1.7],
  mish: [-1, 2.5, 7], piscilao: [-6, 2, 1.7], bluezinho: [1, 2.5, 7.5], bluby: [6, 2, -1.7],
};
const POUSO = {
  kie: [-0.5, 0.3], vidinho: [0.5, 0.3], pirix: [-0.95, 0.15], bolinha: [0.95, 0.15],
  mish: [-1.4, 0.3], piscilao: [1.4, 0.3], bluezinho: [-1.85, 0.15], bluby: [1.85, 0.15],
};
const CASA = {
  kie: 'balanco_a', vidinho: 'balanco_b', pirix: 't_a', bolinha: 't_b', mish: 'mesa',
  piscilao: 'banho', bluezinho: 'corrimao_e', bluby: 'corrimao_d',
};
const PASSEIOS = {   // poleiros extras dos periquitos
  pirix: ['galho1_a', 'prateleira'], bolinha: ['galho1_b', 'mesa'], mish: ['t_a', 'galho2_a'],
  piscilao: ['galho2_b', 'corrimao_d'], bluezinho: ['prateleira', 'galho2_a'], bluby: ['galho1_a', 'prateleira'],
};

export function createCasinha(game) {
  const house = buildCasinha(game);
  const birds = createBirds(game, house);
  const ui = createOverlay();
  for (const b of birds.list) birds.setPerch(b, house.anchors[CASA[b.id]]);

  const v = new THREE.Vector3(), camPos = new THREE.Vector3();
  const waits = new Set();
  let scene = null;          // cena em andamento: { skip, hold }
  let lock = false;          // alguma interação de carinho em andamento
  let musicOn = false, armed = false, seated = false;
  let shoulder = null, pincesoT = 0;
  const flags = () => game.state.flags;
  const visited = () => !!flags()[FLAG];
  const player = () => game.player;

  function wait(ms) {
    if (scene?.skip) return Promise.resolve();
    return new Promise((res) => waits.add({ t: ms / 1000, res }));
  }
  function flushWaits() { for (const w of waits) w.res(); waits.clear(); }

  function setBirdsVisible(on) {
    for (const b of birds.list) b.root.visible = on;
  }

  // ---- corações ------------------------------------------------------------------------------------
  const heartTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.font = '52px sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#ff7eb6';
    g.fillText('♥', 32, 36);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const hearts = Array.from({ length: 18 }, () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTex, transparent: true, depthWrite: false, opacity: 0 }));
    s.visible = false;
    game.render.scene.add(s);
    return { s, life: 0, vx: 0, vz: 0 };
  });
  function spawnHearts(p, n = 3) {
    for (let i = 0; i < n; i++) {
      const h = hearts.find((x) => x.life <= 0);
      if (!h) return;
      h.life = 1.6;
      h.vx = (Math.random() - 0.5) * 0.5;
      h.vz = (Math.random() - 0.5) * 0.5;
      h.s.position.set(p.x + h.vx * 0.5, p.y + 0.25, p.z + h.vz * 0.5);
      h.s.scale.setScalar(0.16 + Math.random() * 0.1);
      h.s.visible = true;
    }
  }
  function updateHearts(dt) {
    for (const h of hearts) {
      if (h.life <= 0) continue;
      h.life -= dt;
      h.s.position.x += h.vx * dt;
      h.s.position.z += h.vz * dt;
      h.s.position.y += dt * 0.7;
      h.s.material.opacity = Math.min(1, h.life * 1.6);
      if (h.life <= 0) h.s.visible = false;
    }
  }
  function featherBurst(p, colors) {
    game.world.sparkle?.(p.x, p.y + 0.2, p.z, { count: 10, colors: [...colors, '#ffffff'], speed: 1, up: 1, life: 1.1, size: 0.22, gravity: 0.5 });
  }
  const colorsOf = (b) => [b.def.look.body, b.def.look.outfit];

  // Pontos que acompanham a Quim.
  const onQuim = (x, y, z) => (out) => player().object.localToWorld(out.set(x, y, z));
  const headOf = (out) => player().headAnchor.getWorldPosition(out);
  const HAND = [[0.13, 0.6, 0.34], [-0.13, 0.6, 0.34]];
  const SIDE_HAND = [0.34, 0.5, 0.2];        // na festa: mãozinha aberta do lado, sem tampar o rosto
  const SHOULDER = [[0.27, 0.5, 0.02], [-0.27, 0.5, 0.02]];

  // ---- reencontro (primeira vez) ------------------------------------------------------------------------
  async function reunion() {
    scene = { skip: false, hold: 0 };
    game.cinematic = true;
    const p = player();
    const q = p.position.clone();
    p.rotY = FACE_BACK;
    p.velocity.set(0, 0, 0);
    const pinceso = game.state.pincesoJoined;
    if (pinceso) {   // assiste quietinho, de um canto
      game.pinceso.flyTo?.(house.anchors.prateleira.getWorldPosition(v).clone(), 2);
    }
    setBirdsVisible(false);
    game.audio.setMusic('asas');
    game.audio.musicParams({ level: 0, soft: false });
    musicOn = true;

    // câmera baixa, olhando para a Quim de frente, com a porta atrás dela
    const camX = q.x - 3.3, camZ = q.z + 0.9;
    camPos.set(camX, q.y + 0.62, camZ);
    game.cameraRig.setCinematic({ x: camX, y: q.y + 0.62, z: camZ, lookX: q.x, lookY: q.y + 0.86, lookZ: q.z }, 2.6);
    p.setMood('curiosa', 5);
    ui.bars(true);
    try {
      await wait(3200);
      birds.chirp(birds.byId.bluby, 'i');
      await wait(1500);
      p.setMood('surpresa', 2.5);
      birds.chirp(birds.byId.kie, 'a');
      await wait(1900);

      await ui.big('VOCÊ VOLTOU!', wait);
      await wait(1500);
      await ui.big('FICAMOS TÃO FELIZES EM TE VER DE VOLTA!', wait);
      await wait(2200);
      ui.clearBig();
      await wait(600);

      // um a um
      let level = 0;
      for (const grupo of ASAS_CHEGADA) {
        level = Math.min(8, level + grupo.length);
        game.audio.musicParams({ level });
        ui.name(grupo.map((id) => birds.byId[id].def.name).join(' e '));
        for (const id of grupo) arrive(birds.byId[id], q);
        p.setMood('feliz');
        await wait(3400);
      }
      ui.name(null);

      // festa
      const party = birds.list;
      party.forEach((b) => { b.happy = 1; });
      p.emote('abraco');
      game.audio.quimVoice('risadinha');
      const heartsAt = setInterval(() => {
        if (game.paused) return;
        spawnHearts(v.copy(q).setY(q.y + 1 + Math.random() * 0.6).add({ x: (Math.random() - 0.5) * 2, y: 0, z: (Math.random() - 0.5) * 2 }), 2);
      }, 420);
      const by = birds.byId;
      birds.send(by.kie, onQuim(...SHOULDER[0]), 1.3);
      birds.send(by.vidinho, onQuim(...SHOULDER[1]), 1.3);
      if (!pinceso) birds.send(by.bluby, headOf, 1.5);
      birds.send(by.bolinha, onQuim(...SIDE_HAND), 1.2);
      for (const id of pinceso ? ['pirix', 'mish', 'piscilao', 'bluezinho', 'bluby'] : ['pirix', 'mish', 'piscilao', 'bluezinho']) by[id].mode = 'orbit';
      for (const b of party) featherBurst(b.pos, colorsOf(b));
      await wait(3200);
      if (pinceso) {
        game.pinceso.setMode('follow');
        game.pinceso.emote?.('❤', 3);
        flags()[FLAG_PINCESO] = true;
      }
      for (const [id, text] of ASAS_REENCONTRO) {
        birds.chirp(by[id], 'i');
        await ui.say(by[id].def.name, text, wait);
        await wait(2500);
        p.setMood('feliz');
      }
      ui.say(null);
      p.emote('pular_feliz');
      await wait(2000);
      clearInterval(heartsAt);

      // volta cada um pro seu canto, e a câmera abre mostrando a casinha
      for (const b of party) { b.happy = 0; b.faceAt = null; birds.goHome(b, 1.8 + Math.random()); }
      await wait(900);
      const a = house.toWorld(0.2, 2.5, 14), t = house.toWorld(0, 2.4, 0);
      game.cameraRig.setCinematic({ x: a.x, y: a.y, z: a.z, lookX: t.x, lookY: t.y, lookZ: t.z }, 4);
      await wait(4600);
      ui.title(ASAS_NAME, ASAS_DEDICATORIA);
      await wait(6500);
      ui.title(null);
      await wait(1200);
    } finally {
      endScene();
    }
  }

  function arrive(b, q) {
    const o = ORIGEM[b.id];
    house.toWorld(o[0], o[1], o[2], b.pos);
    b.root.visible = true;
    b.busy = true;
    b.faceAt = camPos;
    const [side, front] = POUSO[b.id];
    const spot = new THREE.Vector3(q.x - front, house.floorY, q.z + side);
    birds.send(b, (out) => out.copy(spot), 2.3).then(() => { birds.chirp(b, 'a'); b.happy = 0.5; spawnHearts(b.pos, 2); });
    birds.chirp(b, 'i');
  }

  function endScene() {
    const skipped = scene?.skip;
    scene = null;
    flushWaits();
    ui.clear();
    flags()[FLAG] = true;
    game.bus.emit('casinha:visitou');
    if (skipped) {
      setBirdsVisible(true);
      for (const b of birds.list) birds.snapHome(b);
      game.audio.musicParams({ level: 8 });
      if (game.state.pincesoJoined) { game.pinceso.setMode('follow'); flags()[FLAG_PINCESO] = true; }
    }
    for (const b of birds.list) { b.busy = false; b.happy = 0; b.faceAt = null; }
    game.cameraRig.setCinematic(null, 1.6);
    game.cinematic = false;
    armed = false;
  }

  // ---- visitas seguintes ----------------------------------------------------------------------------------
  async function greet() {
    const q = player().position.clone();
    const free = birds.list.filter((b) => !b.busy && b.mode === 'perch' && b !== shoulder);
    if (!free.length) return;
    const who = free[(Math.random() * free.length) | 0];
    birds.chirp(who, 'i');
    ui.say(who.def.name, 'Ela voltou!', (ms) => wait(ms));
    free.forEach((b, i) => {
      b.busy = true;
      const a = (i / free.length) * Math.PI * 2, r = 1.2 + (i % 2) * 0.35;
      const spot = new THREE.Vector3(q.x + Math.cos(a) * r, house.floorY, q.z + Math.sin(a) * r);
      birds.send(b, (out) => out.copy(spot), 1.4 + Math.random() * 0.8).then(() => { b.happy = 1; spawnHearts(b.pos, 1); });
    });
    await wait(7000);
    ui.say(null);
    for (const b of free) { b.happy = 0; birds.goHome(b, 1.6 + Math.random()); b.busy = false; }
  }

  // ---- carinhos ------------------------------------------------------------------------------------------
  function closeUp(p) {
    const f = v.set(Math.sin(p.rotY), 0, Math.cos(p.rotY)).clone();
    const side = new THREE.Vector3(f.z, 0, -f.x);
    game.cameraRig.setCinematic({
      x: p.position.x + f.x * 1.75 + side.x * 0.75, y: p.position.y + 1.08, z: p.position.z + f.z * 1.75 + side.z * 0.75,
      lookX: p.position.x + f.x * 0.3, lookY: p.position.y + 0.82, lookZ: p.position.z + f.z * 0.3,
    }, 1.1);
  }

  async function caress(b, kind) {
    if (lock) return;
    lock = true;
    if (shoulder === b) shoulder = null;
    const p = player();
    const couple = kind === 'cafune' && (b.id === 'kie' || b.id === 'vidinho') ? [birds.byId.kie, birds.byId.vidinho] : [b];
    game.cinematic = true;
    p.velocity.set(0, 0, 0);
    if (p.state === 'sit') p.standUp();
    closeUp(p);
    try {
      couple.forEach((c) => { c.busy = true; c.faceQuim = true; });
      await Promise.all(couple.map((c, i) => birds.send(c, onQuim(...HAND[i]), 1.2)));
      if (kind === 'semente') {
        p.emote('sementinha');
        b.peck = 1;
        ui.say(b.def.name, b.def.semente, wait);
        for (let i = 0; i < 3; i++) { await wait(1000); birds.chirp(b, 'a'); }
        b.peck = 0;
        spawnHearts(b.pos, 3);
        await wait(500);
      } else {
        p.emote('carinho');
        couple.forEach((c) => { c.pet = 1; });
        ui.say(b.def.name, kind === 'cafune' ? b.def.cafune : b.def.pescoco, wait);
        game.audio.quimVoice('hmm');
        for (let i = 0; i < 5; i++) {
          couple.forEach((c) => { spawnHearts(c.pos, 1); });
          if (i === 2) { birds.chirp(b, 'i'); couple.forEach((c) => featherBurst(c.pos, colorsOf(c))); }
          await wait(850);
        }
        couple.forEach((c) => { c.pet = 0; });
        game.audio.quimVoice('risadinha');
      }
    } finally {
      ui.say(null);
      for (const c of couple) { c.busy = false; c.faceQuim = false; birds.goHome(c, 1.5); }
      game.cameraRig.setCinematic(null, 1);
      game.cinematic = false;
      lock = false;
    }
  }

  function toggleShoulder(b) {
    if (shoulder === b) { releaseShoulder(); return; }
    if (shoulder) releaseShoulder();
    shoulder = b;
    b.busy = true;
    birds.send(b, onQuim(...SHOULDER[0]), 1.1).then(() => birds.chirp(b, 'i'));
  }
  function releaseShoulder() {
    if (!shoulder) return;
    const b = shoulder;
    shoulder = null;
    b.busy = false;
    birds.goHome(b, 1.5);
  }

  async function birdMenu(b) {
    if (lock) return;
    const onShoulder = shoulder === b;
    const opts = ['Conversar', 'Fazer carinho', 'Coçar o pescocinho', 'Dar sementinha', onShoulder ? 'Voltar pro poleirinho' : 'Passear no ombro', 'Deixar quietinho'];
    const k = await game.ui.choice(`O que a Quim faz com ${b.def.name}?`, opts);
    if (k === 0) {
      birds.chirp(b, 'i');
      await game.ui.dialogue([{ speaker: b.id, text: b.def.falas[b.talk++ % b.def.falas.length] }]);
    } else if (k === 1) caress(b, 'cafune');
    else if (k === 2) caress(b, 'pescoco');
    else if (k === 3) caress(b, 'semente');
    else if (k === 4) toggleShoulder(b);
  }

  for (const b of birds.list) {
    game.interactables.add({
      id: 'asas_' + b.id, bird: b, radius: 2, label: `Ficar com ${b.def.name}  ·  F: carinho`,
      getPosition: () => b.pos,
      enabled: () => visited() && !lock && !scene && b.root.visible && b.mode === 'perch',
      onInteract: () => birdMenu(b),
    });
  }

  // ---- banquinho da varanda ---------------------------------------------------------------------------------
  const seat = house.toWorld(house.seatX, 0.4, house.seatZ + 0.1);
  const benchBirds = [];
  game.interactables.add({
    id: 'asas_banco', radius: 1.6, label: 'Sentar com eles',
    getPosition: () => house.toWorld(house.seatX, 0.3, house.seatZ + 0.4),
    enabled: () => visited() && !lock && !scene,
    onInteract() {
      const p = player();
      p.sitAt(seat, Math.PI / 2);
      seated = true;
      game.hideHud = true;
      const c = house.toWorld(house.seatX + 2.3, 1.1, house.seatZ + 3.4), l = house.toWorld(house.seatX, 0.85, house.seatZ);
      game.cameraRig.setCinematic({ x: c.x, y: c.y, z: c.z, lookX: l.x, lookY: l.y, lookZ: l.z }, 2.2);
      const free = birds.list.filter((b) => !b.busy && b !== shoulder).slice(2, 5);
      free.forEach((b, i) => {
        b.busy = true;
        birds.send(b, house.anchors[['banco_a', 'banco_b', 'banco_c'][i]], 1.6 + i * 0.5);
        benchBirds.push(b);
      });
    },
  });
  function standFromBench() {
    seated = false;
    game.hideHud = false;
    game.cameraRig.setCinematic(null, 1.2);
    for (const b of benchBirds.splice(0)) { b.busy = false; birds.goHome(b, 1.5); }
  }

  // ---- passeios pelos poleiros --------------------------------------------------------------------------------
  function roam(b, dt) {
    if (b.busy || b.mode !== 'perch' || !b.root.visible) return;
    b.roamT -= dt;
    if (b.roamT > 0) return;
    b.roamT = 16 + Math.random() * 24;
    if (b.id === 'vidinho') return;   // Vidinho vai junto de Kié
    if (b.id === 'kie') {
      const naVaranda = b.perchAnchor === house.anchors.par_a;
      const v2 = birds.byId.vidinho;
      if (v2.busy || v2.mode !== 'perch') return;
      birds.send(b, naVaranda ? house.anchors.balanco_a : house.anchors.par_a, 2.2);
      birds.send(v2, naVaranda ? house.anchors.balanco_b : house.anchors.par_b, 2.4);
      return;
    }
    const opts = [b.home, ...PASSEIOS[b.id].map((n) => house.anchors[n])];
    const taken = new Set(birds.list.map((o) => o.perchAnchor));
    const free = opts.filter((a) => !taken.has(a));
    if (free.length) birds.send(b, free[(Math.random() * free.length) | 0], 1.8 + Math.random());
  }

  // ---- por quadro ---------------------------------------------------------------------------------------------
  function update(dt) {
    for (const w of [...waits]) { w.t -= dt; if (w.t <= 0) { waits.delete(w); w.res(); } }
    house.update(dt);
    birds.update(dt);
    updateHearts(dt);
    const p = player();
    if (!p) return;
    const d = Math.hypot(p.position.x - ASAS.x, p.position.z - ASAS.z);

    if (scene) {
      const holding = game.input.rawDown('Space');
      scene.hold = holding ? scene.hold + dt : 0;
      ui.skip(scene.hold / SKIP_HOLD);
      if (scene.hold >= SKIP_HOLD && !scene.skip) { scene.skip = true; flushWaits(); }
      return;
    }

    const free = !game.cinematic && game.input.enabled && !game.ui.isBlocking();
    const inHouse = house.inside(p.position.x, p.position.z) && p.position.y < house.floorY + 2;
    if (d > ASAS.radius + 6) armed = true;
    if (free && inHouse) {
      if (!visited()) reunion();
      else if (armed) { armed = false; greet(); }
    }

    // música: baixinha nas visitas seguintes, só enquanto estiver na clareira
    const near = d < ASAS.radius + 6;
    if (visited() && near && !musicOn) {
      game.audio.setMusic('asas');
      game.audio.musicParams({ level: 3, soft: true });
      musicOn = true;
    } else if (!near && musicOn) {
      game.audio.setMusic('ninhal');
      musicOn = false;
    }

    if (seated && p.state !== 'sit') standFromBench();
    if (shoulder && d > ASAS.radius + 8) {
      game.ui.toast(`${shoulder.def.name} voltou pro poleirinho.`, '💙');
      releaseShoulder();
    }

    if (visited()) for (const b of birds.list) roam(b, dt);

    // o Pinceso conhece a turma
    if (visited() && game.state.pincesoJoined && !flags()[FLAG_PINCESO] && d < ASAS.radius && free) {
      flags()[FLAG_PINCESO] = true;
      game.pinceso.flyTo(house.anchors.prateleira.getWorldPosition(v).clone(), 2.2);
      game.pinceso.emote?.('❤', 3);
      for (const b of birds.list) if (!b.busy) { b.happy = 1; setTimeout(() => { b.happy = 0; }, 3500); }
      pincesoT = 12;
    }
    if (pincesoT > 0 && (pincesoT -= dt) <= 0) game.pinceso.setMode('follow');

    if (free && !lock && game.input.wasPressed('KeyF')) {
      const it = game.interactables.nearest(p.position);
      if (it?.bird) caress(it.bird, 'cafune');
    }
  }

  return {
    house, birds, update, reunion,
    get inScene() { return !!scene; },
    applyState() {
      setBirdsVisible(visited());
      for (const b of birds.list) birds.snapHome(b);
      shoulder = null; armed = false; musicOn = false; lock = false; seated = false;
    },
    /** Para a caixa de diálogo saber o nome, a voz e as cores de cada passarinho. */
    def(id) {
      const b = birds.byId[id];
      return b ? { name: b.def.name, species: 'passaro', look: b.def.look, voice: b.def.voice } : null;
    },
  };
}
