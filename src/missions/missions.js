// Motor de missões e história do Mundo Olhos (contrato em docs/ARQUITETURA.md, roteiro em src/data/story.js).
//   createMissions(game) -> { update(dt), applyState(), playPrologue(), onTalk(npcId) -> Promise<bool>, start(id),
//                             complete(id), status(id), list(), tracked(), track(id), markerTarget() }
//
// Estado salvo: game.state.missions[id] = { status:'locked'|'available'|'active'|'done', step, progress }
//   progress.got  { [spotId]: true }   itens já pegos (de qualquer passo collect da missão)
//   progress.inv  { [item]: n }        o que a Quim carrega para entregar
//   progress.done { [stepIdx]: true }  passos de um "grupo" já feitos fora de ordem (ver abaixo)
//   progress.s    { ... }              dados do passo atual (pena da trilha etc.); zera a cada passo
//   progress.fragile { item, step, order:[spotId] } itens frágeis carregados (ovinhos)
//
// Grupos: passos interact/deliver CONSECUTIVOS (mesmo tipo; deliver com o mesmo item) podem ser feitos em
// qualquer ordem — mundo aberto (ex.: as 5 cartas do Piu, os 3 laços da Madame Fivela).
//
// Tudo é reconstruído a partir do estado em applyState() (props, interactables, modo do Pinceso, moradores),
// então carregar um save no meio de uma missão nunca duplica nem perde nada.
import { MISSIONS, NPCS, ACCESSORIES, DRINKS } from '../data/story.js';
import { REGIONS, SPOTS } from '../data/worldmap.js';
import { ITEM_ICONS, itemLabel, landmarkReach, LANDMARK_BY_ID, lowerFirst } from './labels.js';
import { createScenes } from './scenes.js';
import { createPlaces } from './places.js';
import { createPenasVento, waterFx, sproutRing } from './minigames.js';
import { createFlock } from './flock.js';

const BY_ID = new Map(MISSIONS.map((m) => [m.id, m]));
const NPC_DEF = new Map(NPCS.map((n) => [n.id, n]));
const REGION_NAME = Object.fromEntries(REGIONS.map((r) => [r.id, r.name]));
const STATUSES = ['locked', 'available', 'active', 'done'];
const AUTO_STEPS = new Set(['cutscene', 'pinceso_join', 'set_flag']);
const PICK_RADIUS = 1.35;       // coleta automática encostando no item
const HEART_SECONDS = 6.5;

export function createMissions(game) {
  const S = () => game.state;
  const H = (x, z) => game.world?.getHeight?.(x, z) ?? 0;
  const P = () => game.player?.position;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  let busy = false;              // uma sequência (falas/cena) por vez
  let time = 0;
  let availT = 0, markerT = 0, beaconT = 0, announceT = 0;
  const rt = new Map();          // missionId -> runtime do passo atual (props, interactables...)
  const hearts = new Map();      // npcId -> até quando mostra '♥'
  const lastMarker = new Map();
  const announce = [];           // missões novas a anunciar quando a tela estiver livre
  let carried = null;            // { key, obj } — o que aparece nos braços da Quim
  let pincesoKey = null, npcKey = null;
  let decor = [];                // props permanentes da história (flores replantadas, brotos)
  let decorKey = null;
  let flock = null;
  const fragileWobble = { t: 0, warnT: 0 };

  // ---------------------------------------------------------------------------------------------
  // Estado
  function rec(id) {
    const all = S().missions || (S().missions = {});
    let r = all[id];
    if (!r) r = all[id] = { status: 'locked', step: 0, progress: {} };
    if (!STATUSES.includes(r.status)) r.status = 'locked';
    if (!r.progress || typeof r.progress !== 'object') r.progress = {};
    return r;
  }
  function prog(id) {
    const p = rec(id).progress;
    p.got ??= {}; p.inv ??= {}; p.done ??= {}; p.s ??= {};
    return p;
  }
  const status = (id) => (BY_ID.has(id) ? rec(id).status : null);
  const flag = (f) => !!S().flags?.[f];
  const curStep = (id) => BY_ID.get(id)?.steps[rec(id).step] ?? null;

  function requirementsMet(m) {
    const req = m.requires || {};
    return (req.missions || []).every((id) => status(id) === 'done') && (req.flags || []).every(flag);
  }
  /** Ativas, a rastreada primeiro e depois as principais. */
  function activeIds() {
    const ids = MISSIONS.filter((m) => status(m.id) === 'active').map((m) => m.id);
    const tr = S().activeMissionId;
    return ids.sort((a, b) => (b === tr) - (a === tr) || (BY_ID.get(b).main - BY_ID.get(a).main));
  }

  /** Passos do grupo (interact/deliver consecutivos) a partir do passo atual, ainda não feitos. */
  function groupOf(id) {
    const m = BY_ID.get(id), R = rec(id), p = prog(id);
    const first = m.steps[R.step];
    if (!first) return [];
    const out = [R.step];
    if (first.type !== 'interact' && first.type !== 'deliver') return out;
    for (let k = R.step + 1; k < m.steps.length; k++) {
      const s = m.steps[k];
      if (s.type !== first.type || s.prop || first.prop) break;
      if (s.type === 'deliver' && s.item !== first.item) break;
      if (!p.done[k]) out.push(k);
    }
    return out;
  }

  // ---------------------------------------------------------------------------------------------
  // Posições
  function lmPos(id) {
    const l = game.world?.landmark?.(id);
    if (l) return { x: l.x, y: l.y ?? H(l.x, l.z), z: l.z };
    const d = LANDMARK_BY_ID.get(id);
    return d ? { x: d.x, y: H(d.x, d.z), z: d.z } : null;
  }
  function targetPos(t) {
    if (typeof t === 'string') return lmPos(t);
    if (!t) return null;
    return { x: t.x, y: t.y ?? H(t.x, t.z), z: t.z, onPlatform: t.y !== undefined };
  }
  function npcPos(id) {
    const n = game.npcs?.get?.(id);
    if (n?.position) return { x: n.position.x, y: n.position.y, z: n.position.z };
    const d = NPC_DEF.get(id);
    return d ? { x: d.x, y: H(d.x, d.z), z: d.z } : null;
  }
  const itemY = (sp) => (sp.y !== undefined ? sp.y : H(sp.x, sp.z) + 0.5);
  const dist2D = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

  // ---------------------------------------------------------------------------------------------
  // Falas e sequências
  function say(lines) {
    if (!lines?.length) return Promise.resolve();
    try {
      const r = game.npcs?.speak ? game.npcs.speak(lines) : game.ui?.dialogue?.(lines);
      return Promise.resolve(r).catch((e) => console.error('[missions] diálogo', e));
    } catch (e) {
      console.error('[missions] diálogo', e);
      return Promise.resolve();
    }
  }
  const blocked = () => busy || !!game.cinematic || !!game.ui?.isBlocking?.();
  /** Roda fn sozinha (nada de duas cenas ao mesmo tempo). Retorna false se já havia algo rodando. */
  function exclusive(fn) {
    if (busy) return false;
    busy = true;
    Promise.resolve()
      .then(fn)
      .catch((e) => console.error('[missions] sequência', e))
      .finally(() => { busy = false; });
    return true;
  }

  // ---------------------------------------------------------------------------------------------
  // Runtime de passo: props e interactables criados para o passo atual.
  function teardown(id) {
    const r = rt.get(id);
    if (!r) return;
    for (const iid of r.inters) game.interactables?.remove(iid);
    for (const o of r.props) game.world?.removeProp?.(o);
    r.pv?.dispose();
    for (const f of r.cleanup) { try { f(); } catch (e) { console.error(e); } }
    rt.delete(id);
  }
  const addProp = (r, type, opts) => {
    const o = game.world?.spawnProp?.(type, opts) ?? null;
    if (o) r.props.push(o);
    return o;
  };
  const dropProp = (r, o) => {
    if (!o) return;
    const i = r.props.indexOf(o);
    if (i >= 0) r.props.splice(i, 1);
    game.world?.removeProp?.(o);
  };
  const addInter = (r, item) => { game.interactables?.add(item); r.inters.push(item.id); };
  const removeInter = (r, iid) => { game.interactables?.remove(iid); r.inters = r.inters.filter((x) => x !== iid); };
  const live = (r) => rt.get(r.id) === r;

  function setupStep(id) {
    teardown(id);
    const m = BY_ID.get(id), R = rec(id);
    if (R.status !== 'active') return;
    const step = m.steps[R.step];
    if (!step) return;
    const r = { id, m, step, idx: R.step, props: [], inters: [], items: new Map(), cleanup: [], beacons: [] };
    rt.set(id, r);
    const p = prog(id);
    // prop de um interact logo adiante (ex.: os cipós do Pinceso) já aparece nos passos de chegada/cena
    const ahead = m.steps.findIndex((s, k) => k > R.step && s.type === 'interact' && s.prop);
    if (ahead > 0 && m.steps.slice(R.step, ahead).every((s) => s.type === 'goto' || s.type === 'cutscene')) {
      const t = targetPos(m.steps[ahead].target);
      if (t) addProp(r, m.steps[ahead].prop, { x: t.x, z: t.z, y: m.steps[ahead].target.y, float: false, glow: false });
    }
    switch (step.type) {
      case 'collect': {
        if (haveOf(step, p) < needOf(step)) for (const sp of step.spots) if (!p.got[sp.id]) spawnItem(r, sp);
        break;
      }
      case 'interact':
        for (const k of groupOf(id)) setupInteract(r, k);
        break;
      case 'follow_trail':
        spawnTrail(r);
        break;
      case 'minigame':
        setupMinigame(r);
        break;
    }
    syncPinceso();
    syncNPCs();
  }

  // ---- collect ----
  const needOf = (step) => step.count ?? step.spots.length;
  const haveOf = (step, p) => step.spots.reduce((n, sp) => n + (p.got[sp.id] ? 1 : 0), 0);
  const golden = (step) => /dourad/i.test(step.label || '');

  function spawnItem(r, sp) {
    const step = r.step;
    const obj = addProp(r, step.item, { id: sp.id, x: sp.x, z: sp.z, y: sp.y, color: golden(step) ? '#ffc93c' : undefined });
    const iid = `missao_${r.id}_${sp.id}`;
    addInter(r, {
      id: iid,
      label: 'Pegar: ' + itemLabel(step),
      radius: 2.2,
      getPosition: () => ({ x: sp.x, y: itemY(sp) - 0.5, z: sp.z }),
      enabled: () => !busy && !game.cinematic,
      onInteract: () => pickup(r, sp.id),
    });
    r.items.set(sp.id, { sp, obj, iid });
  }

  function pickup(r, spotId) {
    if (busy || !live(r)) return;
    const it = r.items.get(spotId);
    if (!it) return;
    const step = r.step, p = prog(r.id);
    r.items.delete(spotId);
    removeInter(r, it.iid);
    dropProp(r, it.obj);
    p.got[spotId] = true;
    p.inv[step.item] = (p.inv[step.item] || 0) + 1;
    if (step.fragile) {
      if (!p.fragile) p.fragile = { item: step.item, step: r.idx, order: [] };
      p.fragile.order.push(spotId);
    }
    const have = haveOf(step, p), need = needOf(step);
    game.world?.sparkle?.(it.sp.x, itemY(it.sp), it.sp.z, { count: 14, colors: ['#fff6c9', '#ffffff', '#ffb3d9'], speed: 2.4, life: 0.7 });
    game.audio?.play?.(step.item === 'ovo' ? 'ovo' : 'coleta');
    if (step.item === 'flor_murcha' || step.item === 'flor') game.audio?.quimVoice?.('hmm');
    game.ui?.toast?.(`${itemLabel(step)} ${have}/${need}`, ITEM_ICONS[step.item] || '✨');
    game.bus?.emit('item:collect', { mission: r.id, item: step.item, id: spotId, have, need });
    if (S().collected) S().collected[spotId] = true;
    refreshCarry();
    if (have >= need) {
      for (const rest of [...r.items.values()]) { removeInter(r, rest.iid); dropProp(r, rest.obj); }
      r.items.clear();
      exclusive(() => finishStep(r.id, step.lines));
    }
  }

  // ---- interact ----
  function setupInteract(r, k) {
    const step = r.m.steps[k];
    const pos = targetPos(step.target);
    if (!pos) { console.warn('[missions] alvo não encontrado', r.id, step.target); return; }
    const isLm = typeof step.target === 'string';
    const radius = step.radius ?? (isLm ? landmarkReach(step.target) : pos.onPlatform ? 3.5 : 2.5);
    let propObj = null;
    if (step.prop) propObj = addProp(r, step.prop, { x: pos.x, z: pos.z, y: step.target.y, float: false, glow: false });
    const iid = `missao_${r.id}_passo${k}`;
    addInter(r, {
      id: iid,
      label: step.label || 'Interagir',
      radius,
      getPosition: () => pos,
      enabled: () => !busy && !game.cinematic,
      onInteract: () => exclusive(async () => {
        if (!live(r)) return;
        removeInter(r, iid);
        if (propObj?.userData?.release) {          // cipó se desenrosca, depois some
          propObj.userData.release();
          const i = r.props.indexOf(propObj);
          if (i >= 0) r.props.splice(i, 1);
          const o = propObj;
          setTimeout(() => game.world?.removeProp?.(o), 1600);
        }
        const p = prog(r.id);
        if (/carta/i.test(step.label || '') && p.inv.carta > 0) { p.inv.carta--; refreshCarry(); }
        game.world?.sparkle?.(pos.x, pos.y + 1, pos.z, { count: 16, colors: ['#fff6c9', '#ffd6ec', '#ffffff'], speed: 2.5, life: 0.8 });
        game.audio?.play?.('brilho');
        await say(step.lines);
        await markDone(r.id, k);
      }),
    });
    r.beacons.push({ ...pos, y: pos.y + 1.2 });
  }

  // ---- follow_trail ----
  function spawnTrail(r) {
    const step = r.step, p = prog(r.id);
    const i = p.s.trail ?? 0;
    if (i >= step.spots.length) return;
    const sp = step.spots[i];
    const obj = addProp(r, step.item || 'pena_verde', { x: sp.x, z: sp.z, y: sp.y });
    const iid = `missao_${r.id}_trilha`;
    r.trail = { sp, obj, iid };
    addInter(r, {
      id: iid, label: 'Pegar a pena', radius: 2.2,
      getPosition: () => ({ x: sp.x, y: itemY(sp) - 0.5, z: sp.z }),
      enabled: () => !busy && !game.cinematic,
      onInteract: () => takeTrail(r),
    });
  }
  function takeTrail(r) {
    if (busy || !live(r) || !r.trail) return;
    const { sp, obj, iid } = r.trail;
    removeInter(r, iid);
    dropProp(r, obj);
    r.trail = null;
    const p = prog(r.id);
    p.s.trail = (p.s.trail ?? 0) + 1;
    game.audio?.play?.('coleta');
    game.world?.sparkle?.(sp.x, itemY(sp), sp.z, { count: 12, colors: ['#b8f27c', '#ffffff'], speed: 2, life: 0.7 });
    const n = r.step.spots.length;
    if (p.s.trail < n) {
      game.ui?.toast?.(`Pena verde ${p.s.trail}/${n}... tem outra ali na frente!`, '🍃');
      spawnTrail(r);
    } else exclusive(() => finishStep(r.id, r.step.lines));
  }

  // ---- minigame ----
  function setupMinigame(r) {
    const step = r.step, par = step.params || {};
    if (step.kind === 'coral') {
      const pos = { x: par.x, y: H(par.x, par.z), z: par.z };
      addInter(r, {
        id: `missao_${r.id}_coral`, label: 'Cantar com os cogumelos', radius: 7,
        getPosition: () => pos,
        enabled: () => !busy && !game.cinematic,
        onInteract: () => exclusive(async () => {
          if (!live(r)) return;
          const notas = par.notas || [];
          const onNote = (i) => {
            game.audio?.note?.(i);
            const l = lmPos(notas[i]);
            if (l) game.world?.sparkle?.(l.x, l.y + 2.2, l.z, { count: 12, colors: ['#ffffff', '#fff3a3'], speed: 2, life: 0.6 });
          };
          let won = true;
          if (game.ui?.minigameCoral) won = await game.ui.minigameCoral({ rounds: par.rounds ?? 5, notas, onNote });
          else console.warn('[missions] ui.minigameCoral ausente: coral considerado vencido');
          if (!live(r)) return;
          if (won) await finishStep(r.id, step.lines);
          else {
            game.ui?.toast?.('Quase! Os cogumelos esperam outra tentativa.', '🍄');
            game.audio?.quimVoice?.('oh');
          }
        }),
      });
      r.beacons.push({ ...pos, y: pos.y + 2 });
    } else if (step.kind === 'penas_vento') {
      r.pv = createPenasVento(ctx, par, {
        onCatch: (n, need) => game.ui?.toast?.(`Penas de gala ${n}/${need}`, '🍃'),
        onWin: () => { r.pvWon = true; },
      });
    } else if (step.kind === 'regar') {
      const hid = par.horta;
      const pos = lmPos(hid);
      if (!pos) return;
      addInter(r, {
        id: `missao_${r.id}_regar_${hid}`, label: 'Regar a horta', radius: landmarkReach(hid),
        getPosition: () => pos,
        enabled: () => !busy && !game.cinematic,
        onInteract: () => exclusive(async () => {
          if (!live(r)) return;
          game.player?.lookAt?.(pos);
          await waterFx(ctx, pos.x, pos.y, pos.z);
          const sprouts = sproutRing(ctx, pos.x, pos.z, 6, 2.2);
          decor.push(...sprouts);
          await say(step.lines);
          game.player?.lookAt?.(null);
          await finishStep(r.id);
        }),
      });
      r.beacons.push({ ...pos, y: pos.y + 1.5 });
    } else {
      console.warn('[missions] minigame desconhecido:', step.kind, '— passo concluído direto');
      exclusive(() => finishStep(r.id));
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Avanço de passos e conclusão
  async function markDone(id, k) {
    const R = rec(id);
    if (k === R.step) return finishStep(id);
    prog(id).done[k] = true;
    markerT = 0;
    game.bus?.emit('mission:step', { id, step: R.step, done: k });
    setupStep(id);   // reconstrói o grupo sem o passo feito (marcadores e alvos atualizados)
  }

  async function finishStep(id, lines) {
    if (status(id) !== 'active') return;
    if (lines?.length) await say(lines);
    await advance(id);
  }

  async function advance(id) {
    const m = BY_ID.get(id), R = rec(id), p = prog(id);
    teardown(id);
    R.step++;
    while (m.steps[R.step] && p.done[R.step]) R.step++;
    p.s = {};
    markerT = 0;
    game.bus?.emit('mission:step', { id, step: R.step });
    if (R.step >= m.steps.length) return complete(id);
    setupStep(id);
  }

  function start(id, { quiet = false } = {}) {
    const m = BY_ID.get(id);
    if (!m) return false;
    const R = rec(id);
    if (R.status === 'active' || R.status === 'done') return false;
    R.status = 'active';
    R.step = 0;
    R.progress = { got: {}, inv: {}, done: {}, s: {} };
    game.bus?.emit('mission:start', { id, mission: m });
    if (!quiet) announce.push(m);
    const tr = S().activeMissionId;
    if (!tr || status(tr) !== 'active' || (m.main && !BY_ID.get(tr)?.main) || !m.autoStart) S().activeMissionId = id;
    setupStep(id);
    return true;
  }

  function addColor(region, amount) {
    if (!amount || !region) return;
    const cur = S().regionColor[region] ?? 0;
    const v = Math.min(1, cur + amount);
    if (v <= cur) return;
    S().regionColor[region] = v;
    game.world?.setRegionColor?.(region, v, true);
    if (v >= 1) game.ui?.banner?.(REGION_NAME[region] || region, 'Todinho colorido de novo!');
    else game.ui?.toast?.(`As cores do ${REGION_NAME[region]} estão voltando! (${Math.round(v * 100)}%)`, '🌈');
  }

  async function complete(id) {
    const m = BY_ID.get(id);
    if (!m) return;
    const R = rec(id);
    if (R.status === 'done') return;
    teardown(id);
    R.status = 'done';
    R.step = m.steps.length;
    const p = prog(id);
    p.inv = {}; delete p.fragile; p.s = {};
    p.doneAt = S().playTime ?? 0;
    refreshCarry();
    if (m.completeLines?.length) await say(m.completeLines);

    // recompensas
    const rw = m.rewards || {};
    if (rw.jujubas) {
      S().jujubas = (S().jujubas ?? 0) + rw.jujubas;
      game.audio?.play?.('moeda');
      game.ui?.toast?.(`+${rw.jujubas} jujubas`, '🍬');
    }
    if (rw.accessory) {
      const a = ACCESSORIES.find((x) => x.id === rw.accessory);
      S().accessories.owned[rw.accessory] = true;
      S().accessories.equipped = rw.accessory;
      game.player?.setAccessory?.(rw.accessory);
      game.ui?.toast?.(`Presente: ${a?.name ?? rw.accessory}!`, '🎀');
    }
    if (rw.drink) {
      S().drinksTried[rw.drink] = true;
      const d = DRINKS.find((x) => x.id === rw.drink);
      game.ui?.toast?.(`Receita nova na Cafeteria: ${d?.name ?? rw.drink}`, '☕');
    }
    if (rw.flag) S().flags[rw.flag] = true;
    game.ui?.missionComplete?.(m);
    game.audio?.play?.('missao');
    game.player?.emote?.('pular_feliz');
    const heartNpc = m.giver ?? [...m.steps].reverse().find((s) => s.npc)?.npc;
    if (heartNpc) { hearts.set(heartNpc, time + HEART_SECONDS); lastMarker.delete(heartNpc); }
    addColor(m.region, rw.color);
    game.bus?.emit('mission:complete', { id, mission: m });

    if (S().activeMissionId === id) S().activeMissionId = null;
    if (id === 'alvorada') S().flags.pico_liberado = true;   // garantia (o passo set_flag já liga)
    syncNPCs();
    syncDecor();
    refreshAvailability();
    if (rw.flag === 'final') await scenes.playEnding();
    S().activeMissionId = autoPick();
  }

  function refreshAvailability({ quiet = false } = {}) {
    for (const m of MISSIONS) {
      const R = rec(m.id);
      if (R.status !== 'locked' || !requirementsMet(m)) continue;
      R.status = 'available';
      markerT = 0;
      if (m.autoStart || !m.giver) start(m.id, { quiet });
    }
  }

  function autoPick() {
    const act = MISSIONS.filter((m) => status(m.id) === 'active');
    return (act.find((m) => m.main) ?? act[0])?.id ?? null;
  }

  // ---------------------------------------------------------------------------------------------
  // Carregar itens (visual nos braços da Quim)
  function refreshCarry() {
    const pl = game.player;
    if (!pl?.carry) return;
    let want = null;
    for (const id of activeIds()) {
      const p = prog(id);
      const inv = Object.entries(p.inv).filter(([, n]) => n > 0);
      if (!inv.length) continue;
      const item = p.fragile && p.inv[p.fragile.item] > 0 ? p.fragile.item : inv[inv.length - 1][0];
      const m = BY_ID.get(id);
      const st = m.steps.find((s) => s.type === 'collect' && s.item === item);
      want = { item, color: st && golden(st) ? '#ffc93c' : undefined };
      break;
    }
    const key = want ? want.item + (want.color || '') : null;
    if (carried?.key === key && (!carried || pl.carrying === carried.obj)) return;
    if (carried) {
      if (pl.carrying === carried.obj) pl.carry(null);
      game.world?.removeProp?.(carried.obj);
      carried = null;
    }
    if (!want) return;
    const p = pl.position;
    const obj = game.world?.spawnProp?.(want.item, { x: p.x, z: p.z, float: false, glow: false, color: want.color });
    if (!obj) return;
    if (obj.scale?.setScalar) obj.scale.setScalar(want.item === 'gato' ? 0.9 : 0.75);
    pl.carry(obj);
    carried = { key, obj };
  }

  // Itens frágeis: correr faz balançar; ~2 s correndo e o ovinho rola de volta pro lugar.
  function updateFragile(dt) {
    const pl = game.player;
    let owner = null;
    for (const id of activeIds()) { const p = prog(id); if (p.fragile && p.inv[p.fragile.item] > 0) { owner = id; break; } }
    if (!owner || !pl) { fragileWobble.t = 0; return; }
    const running = pl.state === 'run';
    fragileWobble.t = running ? fragileWobble.t + dt : Math.max(0, fragileWobble.t - dt * 1.5);
    fragileWobble.warnT -= dt;
    if (running && fragileWobble.t > 0.3 && fragileWobble.warnT <= 0) {
      const k = Math.min(5, Math.ceil((fragileWobble.t / 2) * 5));
      game.ui?.toast?.(`Devagar! O ovinho tá balançando ${'●'.repeat(k)}${'○'.repeat(5 - k)}`, '🥚');
      fragileWobble.warnT = 0.55;
    }
    if (fragileWobble.t >= 2) { fragileWobble.t = 0; dropFragile(owner); }
  }
  function dropFragile(id) {
    const m = BY_ID.get(id), R = rec(id), p = prog(id);
    const f = p.fragile;
    const spotId = f.order.pop();
    if (!spotId) return;
    p.got[spotId] = false;
    p.inv[f.item] = Math.max(0, (p.inv[f.item] || 0) - 1);
    if (S().collected) delete S().collected[spotId];
    game.audio?.play?.('ovo');
    game.audio?.quimVoice?.('oh');
    game.player?.setMood?.('surpresa', 1.5);
    game.cameraRig?.shake?.(0.15);
    const pp = P();
    if (pp) game.world?.sparkle?.(pp.x, pp.y + 0.8, pp.z, { count: 12, colors: ['#ffd6e8', '#ffffff'], speed: 2.5, life: 0.6 });
    game.ui?.toast?.(`Ploft! O ${(m.steps[f.step]?.item === 'ovo' ? 'ovinho' : 'item')} rolou de volta pro lugar dele. Sem correr!`, '🥚');
    refreshCarry();
    if (R.step !== f.step) {               // já estava entregando: volta para o passo de coleta
      teardown(id);
      R.step = f.step;
      p.s = {};
      setupStep(id);
    } else {
      const r = rt.get(id);
      const sp = m.steps[f.step].spots.find((s) => s.id === spotId);
      if (r && sp && !r.items.has(spotId)) spawnItem(r, sp);
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Pinceso e moradores conforme a história
  function syncPinceso() {
    const pin = game.pinceso;
    if (!pin?.setMode) return;
    if (S().pincesoJoined) { pincesoKey = 'joined'; return; }
    const R = rec('filhote_sem_ninho');
    const m = BY_ID.get('filhote_sem_ninho');
    let key = 'hidden', apply = () => pin.setMode('hidden');
    if (m && R.status === 'active') {
      const i = R.step;
      const trailIdx = m.steps.findIndex((s) => s.type === 'follow_trail');
      const interIdx = m.steps.findIndex((s) => s.type === 'interact' && s.prop);
      const pouso = SPOTS.pinceso_pouso;
      const cipo = SPOTS.pinceso_cipo;
      if (i <= interIdx) {
        key = 'trapped';
        apply = () => pin.setMode('trapped', { x: cipo.x, z: cipo.z });
      } else if (i === trailIdx) {
        const trail = m.steps[trailIdx];
        const from = prog('filhote_sem_ninho').s.trail ?? 0;
        key = 'fleeing';
        apply = () => pin.setMode('fleeing', { points: [...trail.spots.slice(from).map((s) => ({ x: s.x, z: s.z })), { x: pouso.x, y: pouso.y, z: pouso.z }] });
      } else if (m.steps[i]?.type !== 'pinceso_join' && m.steps[i]?.type !== 'cutscene') {
        key = 'perched';
        apply = () => pin.setMode('perched', { x: pouso.x, y: pouso.y, z: pouso.z });
      } else {
        key = 'scene';
        apply = () => { if (pin.mode === 'hidden') pin.setMode('perched', { x: pouso.x, y: pouso.y, z: pouso.z }); };
      }
    }
    if (key === pincesoKey) return;
    pincesoKey = key;
    apply();
  }

  /** Quem aparece onde (Dona Plumínia dormindo no oco / no Ninho-Coreto na Alvorada). */
  function syncNPCs() {
    const n = game.npcs;
    if (!n) return;
    const R = rec('alvorada');
    const m = BY_ID.get('alvorada');
    let key = 'normal';
    if (R.status === 'active' && m) {
      const oco = m.steps.findIndex((s) => s.type === 'interact');
      if (R.step >= 1 && R.step <= oco) key = 'coruja_dorme';
      else if (R.step > oco) key = 'coruja_no_coreto';
    }
    if (key === npcKey) return;
    const prev = npcKey;
    npcKey = key;
    if (key === 'normal') {
      // saindo de uma cena com moradores reposicionados: todo mundo volta para casa
      if (prev && prev !== 'normal') { n.applyState?.(); lastMarker.clear(); } else n.setVisible?.('dona_pluminia', null);
      return;
    }
    if (key === 'coruja_dorme') n.setVisible?.('dona_pluminia', false);
    else if (key === 'coruja_no_coreto') {
      const c = SPOTS.coreto_palco;
      n.setVisible?.('dona_pluminia', true);
      n.place?.('dona_pluminia', c.x - 3, c.z - 2.5, c.y);
      ['tico', 'teco', 'tuco'].forEach((id, k) => n.place?.(id, c.x - 4.6 + k * 1.1, c.z + 2.8 - k * 0.6, c.y));
    }
  }
  function resetNPCs() {
    game.npcs?.applyState?.();
    lastMarker.clear();
    npcKey = null;
    syncNPCs();
  }

  // Decoração que a história deixa no mundo: flores replantadas no jardim e brotos nas hortas regadas.
  function syncDecor(forceRebuild = false) {
    const fm = rec('flores_murchas'), hs = rec('hortas_com_sede');
    const fmDone = fm.status === 'done';
    const hm = BY_ID.get('hortas_com_sede');
    const watered = hm ? hm.steps.map((s, i) => (s.kind === 'regar' && (hs.status === 'done' || (hs.status === 'active' && hs.step > i)) ? s.params.horta : null)).filter(Boolean) : [];
    const key = `${fmDone}|${watered.join(',')}`;
    if (key === decorKey && !forceRebuild) return;
    decorKey = key;
    for (const o of decor) game.world?.removeProp?.(o);
    decor = [];
    if (fmDone) {
      const j = lmPos('jardim_jardineiro');
      if (j) for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const o = game.world?.spawnProp?.('flor', { x: j.x + Math.cos(a) * 2.6, z: j.z + Math.sin(a) * 2.6, float: false, glow: false });
        if (o) decor.push(o);
      }
    }
    for (const h of watered) { const p = lmPos(h); if (p) decor.push(...sproutRing(ctx, p.x, p.z, 6, 2.2)); }
  }

  function ensureFlock() {
    if (flock || !game.THREE || !game.render?.scene) return flock;
    const b = SPOTS.bando;
    const nests = [1, 2, 3, 4, 5].map((i) => LANDMARK_BY_ID.get('ninho_bando_' + i)).filter(Boolean);
    flock = createFlock(game, { x: b.x, z: b.z, nests });
    return flock;
  }
  function syncFlock() {
    if (!flag('pico_liberado')) { if (flock) { flock.dispose(); flock = null; } return; }
    const f = ensureFlock();
    if (!f) return;
    const pr = rec('piados_no_pico'), m = BY_ID.get('piados_no_pico');
    const sceneIdx = m ? m.steps.findIndex((s) => s.type === 'cutscene' && (s.lines || []).some((l) => /olho se abre/i.test(l.text || ''))) : -1;
    const awake = flag('final') || pr.status === 'done' || (pr.status === 'active' && pr.step > sceneIdx);
    f.setMode(awake ? 'fly' : 'sleep');
  }

  // ---------------------------------------------------------------------------------------------
  // Marcadores dos moradores: '!' missão nova, '?' quer falar/receber algo agora, '♥' acabou de ajudar.
  function refreshMarkers() {
    const n = game.npcs;
    if (!n?.setMarker) return;
    const want = new Map();
    for (const m of MISSIONS) {
      const st = status(m.id);
      if (st === 'available' && m.giver && !want.has(m.giver)) want.set(m.giver, '!');
      if (st !== 'active') continue;
      const R = rec(m.id);
      for (const k of groupOf(m.id)) {
        const s = m.steps[k];
        if ((s.type === 'talk' || s.type === 'deliver') && s.npc) {
          const intro = R.step === 0 && s.npc === m.giver && s.type === 'talk';
          if (want.get(s.npc) !== '?') want.set(s.npc, intro ? '!' : '?');
        }
      }
    }
    for (const d of NPCS) {
      const mk = (hearts.get(d.id) ?? 0) > time ? '♥' : want.get(d.id) ?? null;
      if (lastMarker.get(d.id) === mk) continue;
      lastMarker.set(d.id, mk);
      n.setMarker(d.id, mk);
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Conversa com moradores (chamado pelo npcs ao apertar E)
  async function talkFlow(npcId) {
    for (const id of activeIds()) {
      const m = BY_ID.get(id), p = prog(id);
      for (const k of groupOf(id)) {
        const st = m.steps[k];
        if (st.npc !== npcId) continue;
        if (st.type === 'talk') {
          game.npcs?.face?.(npcId, P());
          await say(st.lines);
          await markDone(id, k);
          return true;
        }
        if (st.type === 'deliver') {
          const have = p.inv[st.item] || 0;
          if (have <= 0) continue;
          const n = Math.min(have, st.count ?? have);
          p.inv[st.item] = have - n;
          if (p.inv[st.item] <= 0) { delete p.inv[st.item]; if (p.fragile?.item === st.item) delete p.fragile; }
          refreshCarry();
          game.audio?.play?.('coleta');
          game.npcs?.face?.(npcId, P());
          await say(st.lines);
          await markDone(id, k);
          return true;
        }
      }
    }
    // missão nova deste morador
    for (const m of MISSIONS) {
      if (m.giver !== npcId || status(m.id) !== 'available') continue;
      start(m.id, { quiet: true });
      S().activeMissionId = m.id;
      game.npcs?.face?.(npcId, P());
      const first = m.steps[0];
      if (first?.type === 'talk' && first.npc === npcId) {
        await say(first.lines);
        await markDone(m.id, 0);
      } else await say([{ speaker: npcId, text: m.summary }]);
      game.ui?.toast?.(`Nova missão: ${m.title}`, '📜');
      return true;
    }
    // lembrete: missão deste morador em andamento, mas o passo atual é em outro lugar
    for (const id of activeIds()) {
      const m = BY_ID.get(id);
      if (m.giver !== npcId) continue;
      const st = curStep(id);
      if (!st?.hint || Math.random() < 0.5) return false;   // às vezes só uma fala solta, pra variar
      const who = S().pincesoJoined ? 'pinceso' : 'narrador';
      await say([{ speaker: who, text: who === 'pinceso' ? `Lembra? ${st.hint}. Eu lembro de tudo.` : `Ainda falta: ${lowerFirst(st.hint)}.` }]);
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------------------------------------
  // Atualização por quadro
  function nearGoal(step, pp) {
    if (Math.hypot(pp.x - step.x, pp.z - step.z) > (step.radius ?? 4)) return false;
    return step.y === undefined || Math.abs(pp.y - step.y) < 2.2;
  }

  function updateStep(r, dt, pp) {
    const st = r.step;
    switch (st.type) {
      case 'goto': {
        // também vale chegar direto num goto seguinte (ex.: entrou no Pico por outro lado da névoa)
        let ok = nearGoal(st, pp);
        for (let k = r.idx + 1; !ok && r.m.steps[k]?.type === 'goto'; k++) ok = nearGoal(r.m.steps[k], pp);
        if (ok) exclusive(() => finishStep(r.id, st.lines));
        break;
      }
      case 'collect':
        for (const it of r.items.values()) {
          const sp = it.sp;
          if (Math.hypot(sp.x - pp.x, sp.z - pp.z) < PICK_RADIUS && Math.abs(itemY(sp) - (pp.y + 0.6)) < 1.5) { pickup(r, sp.id); break; }
        }
        break;
      case 'follow_trail':
        if (r.trail) {
          const sp = r.trail.sp;
          if (Math.hypot(sp.x - pp.x, sp.z - pp.z) < PICK_RADIUS + 0.3 && Math.abs(itemY(sp) - (pp.y + 0.6)) < 1.8) takeTrail(r);
        }
        break;
      case 'night':
        if (game.render?.isNight?.()) exclusive(() => finishStep(r.id, st.lines));
        break;
      case 'cutscene':
        exclusive(async () => {
          if (!live(r)) return;
          await scenes.playCutscene(r.m, st, r.idx, scenes.hooksFor(r.m, st, r.idx));
          await finishStep(r.id);
        });
        break;
      case 'pinceso_join':
        exclusive(async () => {
          if (!live(r)) return;
          const pin = game.pinceso;
          if (pin?.join) await Promise.race([pin.join(), wait(5000)]);
          S().pincesoJoined = true;
          pincesoKey = 'joined';
          game.ui?.toast?.('O Pinceso agora vai com você! Q: Voo de Busca · segure Espaço no ar para planar', '💚');
          await finishStep(r.id);
        });
        break;
      case 'set_flag':
        S().flags[st.flag] = true;
        exclusive(() => finishStep(r.id));
        break;
    }
  }

  function flushAnnouncements(dt) {
    announceT -= dt;
    if (!announce.length || announceT > 0 || blocked()) return;
    const m = announce.shift();
    if (status(m.id) !== 'active') return;
    if (m.main) game.ui?.banner?.(m.title, m.summary);
    else game.ui?.toast?.(`Nova missão: ${m.title}`, '📜');
    announceT = 3.5;
  }

  function update(dt) {
    time += dt;
    const pp = P();
    if ((availT -= dt) <= 0) { availT = 0.5; refreshAvailability(); syncFlock(); if (!busy) refreshCarry(); }
    if (S().activeMissionId && status(S().activeMissionId) !== 'active') S().activeMissionId = null;
    if (!S().activeMissionId) S().activeMissionId = autoPick();
    flushAnnouncements(dt);
    flock?.update(dt);
    if ((markerT -= dt) <= 0) { markerT = 0.4; refreshMarkers(); }
    if (!pp) return;
    // brilhinho sobre alvos de interação próximos (dá pra achar sem olhar o mapa)
    if ((beaconT -= dt) <= 0) {
      beaconT = 1.3;
      for (const r of rt.values()) for (const b of r.beacons) {
        if (Math.hypot(b.x - pp.x, b.z - pp.z) < 30) game.world?.sparkle?.(b.x, b.y, b.z, { count: 5, colors: ['#fff6c9', '#ffffff'], speed: 1, up: 1.2, life: 0.9, size: 0.6, gravity: -0.5 });
      }
    }
    for (const r of [...rt.values()]) {
      if (!live(r)) continue;
      if (r.pv) {                       // penas ao vento: o vento sopra mesmo durante falas
        r.pv.update(dt);
        if (r.pvWon && !blocked()) exclusive(() => finishStep(r.id, r.step.lines));
        continue;
      }
      if (blocked()) continue;
      // cenas automáticas esperam a vez da missão rastreada, se ela também tiver uma pendente
      if (AUTO_STEPS.has(r.step.type)) {
        const first = activeIds().find((o) => AUTO_STEPS.has(curStep(o)?.type));
        if (first && first !== r.id) continue;
      }
      updateStep(r, dt, pp);
    }
    if (!blocked()) updateFragile(dt);
  }

  // ---------------------------------------------------------------------------------------------
  // Rastreio e marcador do HUD
  function stepTarget(id, k) {
    const m = BY_ID.get(id), st = m.steps[k], r = rt.get(id), pp = P();
    switch (st.type) {
      case 'talk': case 'deliver': return npcPos(st.npc);
      case 'collect': {
        if (r?.items.size && pp) {
          let best = null, bd = Infinity;
          for (const it of r.items.values()) { const d = dist2D(it.sp, pp); if (d < bd) { bd = d; best = it.sp; } }
          if (best) return { x: best.x, y: itemY(best), z: best.z };
        }
        break;
      }
      case 'follow_trail':
        if (r?.trail) return { x: r.trail.sp.x, y: itemY(r.trail.sp), z: r.trail.sp.z };
        break;
      case 'interact': return targetPos(st.target);
      case 'goto': return { x: st.x, y: st.y ?? H(st.x, st.z), z: st.z };
      case 'minigame':
        if (r?.pv?.running && pp) {
          const fs = r.pv.findables();
          if (fs.length) return fs.reduce((a, b) => (dist2D(a, pp) < dist2D(b, pp) ? a : b));
        }
        break;
      case 'night': {
        if (game.render?.isNight?.() || !pp) return null;
        let best = null, bd = Infinity;
        for (const bid of SPOTS.bancos_dormir || []) { const b = lmPos(bid); if (b && dist2D(b, pp) < bd) { bd = dist2D(b, pp); best = b; } }
        return best;
      }
      case 'cafe': return st.marker ? { x: st.marker.x, y: H(st.marker.x, st.marker.z), z: st.marker.z } : lmPos('cafeteria');
      default: return null;
    }
    return st.marker ? { x: st.marker.x, y: H(st.marker.x, st.marker.z), z: st.marker.z } : null;
  }

  function trackedId() {
    const id = S().activeMissionId;
    return id && status(id) === 'active' ? id : autoPick();
  }

  /** Passo "da vez" de uma missão: no grupo, o membro mais perto da Quim. */
  function focusStep(id) {
    const ks = groupOf(id), pp = P();
    if (ks.length <= 1 || !pp) return ks[0] ?? rec(id).step;
    let best = ks[0], bd = Infinity;
    for (const k of ks) { const t = stepTarget(id, k); if (t && dist2D(t, pp) < bd) { bd = dist2D(t, pp); best = k; } }
    return best;
  }

  function progressOf(id, k) {
    const m = BY_ID.get(id), st = m.steps[k], p = prog(id), r = rt.get(id);
    if (st.type === 'collect') return { have: haveOf(st, p), need: needOf(st), label: itemLabel(st) };
    if (st.type === 'follow_trail') return { have: p.s.trail ?? 0, need: st.spots.length, label: 'Penas verdes' };
    if (st.type === 'minigame' && r?.pv) return r.pv.progress();
    if (st.type === 'interact' || st.type === 'deliver') {   // grupo: quantos já foram feitos
      let total = 0, done = 0;
      for (let j = rec(id).step; j < m.steps.length; j++) {
        const s = m.steps[j];
        if (s.type !== st.type || s.prop || st.prop || (s.type === 'deliver' && s.item !== st.item)) break;
        total++;
        if (p.done[j]) done++;
      }
      if (total > 1) return { have: done, need: total, label: st.type === 'deliver' ? 'Entregas' : 'Feito' };
    }
    return null;
  }

  // ---------------------------------------------------------------------------------------------
  const ctx = {
    game, say, wait, exclusive,
    isBusy: () => busy,
    placePlayer(x, z, rotY) {
      const pl = game.player;
      if (!pl) return;
      pl.position.set?.(x, H(x, z), z);
      if (rotY !== undefined) pl.rotY = rotY;
      pl.velocity?.set?.(0, 0, 0);
    },
    resetNPCs,
    ensureFlock,
    nightPending: () => activeIds().some((id) => curStep(id)?.type === 'night'),
    cafeStep() {
      for (const id of activeIds()) { const st = curStep(id); if (st?.type === 'cafe') return { id, step: st, idx: rec(id).step }; }
      return null;
    },
    finishCafe: (ref) => (status(ref.id) === 'active' && rec(ref.id).step === ref.idx ? advance(ref.id) : Promise.resolve()),
    targetedLandmarks() {
      const out = new Set();
      for (const id of activeIds()) for (const k of groupOf(id)) { const t = BY_ID.get(id).steps[k].target; if (typeof t === 'string') out.add(t); }
      return out;
    },
  };
  const scenes = createScenes(ctx);
  ctx.scenes = scenes;
  createPlaces(ctx);

  // Voo de Busca (Q): o Pinceso também acha itens de missão.
  game.findables?.add?.(() => {
    const out = [];
    for (const r of rt.values()) {
      for (const it of r.items.values()) out.push({ x: it.sp.x, y: itemY(it.sp), z: it.sp.z, kind: 'missao', id: it.sp.id });
      if (r.trail) out.push({ x: r.trail.sp.x, y: itemY(r.trail.sp), z: r.trail.sp.z, kind: 'missao' });
      if (r.pv) out.push(...r.pv.findables());
    }
    return out;
  });

  // ---------------------------------------------------------------------------------------------
  const api = {
    update,

    applyState() {
      for (const id of [...rt.keys()]) teardown(id);
      announce.length = 0;
      hearts.clear(); lastMarker.clear();
      pincesoKey = null; npcKey = null;
      fragileWobble.t = 0;
      if (carried) { if (game.player?.carrying === carried.obj) game.player.carry(null); game.world?.removeProp?.(carried.obj); carried = null; }
      // saneia saves antigos / dados que mudaram
      for (const m of MISSIONS) {
        const R = rec(m.id);
        if (R.status === 'active' && R.step >= m.steps.length) R.step = m.steps.length - 1;
        if (R.status === 'done') R.step = m.steps.length;
        if (R.step < 0 || !Number.isFinite(R.step)) R.step = 0;
      }
      if (status('alvorada') === 'done') S().flags.pico_liberado = true;
      refreshAvailability({ quiet: true });
      for (const m of MISSIONS) if (status(m.id) === 'active') setupStep(m.id);
      syncPinceso();
      syncNPCs();
      syncDecor(true);
      syncFlock();
      refreshCarry();
      if (!S().activeMissionId || status(S().activeMissionId) !== 'active') S().activeMissionId = autoPick();
    },

    playPrologue() {
      return new Promise((resolve) => {
        const ok = exclusive(async () => {
          try {
            await scenes.playPrologue();
            const id = autoPick();
            if (id) announce.push(BY_ID.get(id));
          } finally { resolve(); }
        });
        if (!ok) resolve();
      });
    },

    async onTalk(npcId) {
      if (busy) return false;
      busy = true;
      try { return await talkFlow(npcId); } catch (e) { console.error('[missions] conversa', e); return false; } finally { busy = false; }
    },

    start: (id) => start(id),
    complete(id) {
      if (status(id) === 'done') return Promise.resolve();
      if (status(id) !== 'active') start(id, { quiet: true });
      return complete(id);
    },
    status,
    list() {
      return MISSIONS.map((m) => {
        const R = rec(m.id);
        const st = m.steps[R.step];
        return { ...m, mission: m, status: R.status, stepIndex: R.step, stepCount: m.steps.length, hint: R.status === 'active' ? st?.hint ?? null : null,
          progress: R.status === 'active' && st ? progressOf(m.id, R.step) : null, tracked: S().activeMissionId === m.id };
      });
    },
    tracked() {
      const id = trackedId();
      if (!id) return null;
      const m = BY_ID.get(id);
      const k = focusStep(id);
      const step = m.steps[k];
      if (!step) return null;
      return { mission: m, step, stepIndex: k, hint: step.hint ?? m.summary, progress: progressOf(id, k), target: stepTarget(id, k) };
    },
    track(id) {
      if (id === null) { S().activeMissionId = null; return true; }
      if (status(id) !== 'active') return false;
      S().activeMissionId = id;
      refreshCarry();
      return true;
    },
    markerTarget() {
      const id = trackedId();
      return id ? stepTarget(id, focusStep(id)) : null;
    },
    // extras (testes / depuração)
    get busy() { return busy; },
    playEnding: () => new Promise((resolve) => { if (!exclusive(async () => { try { await scenes.playEnding(); } finally { resolve(); } })) resolve(); }),
  };
  return api;
}
