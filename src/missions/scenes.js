// Cenas da história: câmera de cinema, falas, prólogo, cutscenes de missão e o grande final.
// Tudo recebe um `ctx` montado pelo missions.js: { game, say, wait, ensureFlock, resetNPCs, placePlayer }.
import { PROLOGUE, ENDING } from '../data/story.js';
import { SPAWN, SPOTS, REGIONS } from '../data/worldmap.js';

const isBeat = (b) => b && b.camera && !b.text;
/** É noite ou madrugada (antes do amanhecer de 0,24)? */
export const beforeDawn = (t) => t >= 0.75 || t < 0.24;

export function createScenes(ctx) {
  const { game, say, wait } = ctx;

  function startCinematic(cam, seconds = 1.5) {
    game.cinematic = true;
    game.ui?.setPrompt?.(null);
    if (cam) game.cameraRig?.setCinematic?.(cam, seconds);
  }
  function endCinematic(seconds = 1.2) {
    game.cameraRig?.setCinematic?.(null, seconds);
    game.cinematic = false;
  }

  /** Pula a hora (sempre para frente) — com `onlyAtNight`, só se ainda não amanheceu. */
  async function skipTime(target, seconds = 3, onlyAtNight = false) {
    const r = game.render;
    if (!r) return;
    if (onlyAtNight && !beforeDawn(r.dayTime ?? 0.5)) return;
    if (r.skipTo) await r.skipTo(target, seconds);
    else r.dayTime = target;
  }

  /**
   * Toca uma lista de CameraBeat e falas (PROLOGUE/ENDING). Falas seguidas viram uma caixa de diálogo só.
   * hooks.beat(i, beat) é chamado em cada CameraBeat (i = índice do beat).
   */
  async function playBeats(list, hooks = {}) {
    let pending = [];
    let beatIdx = 0;
    const flush = async () => { if (pending.length) { const l = pending; pending = []; await say(l); } };
    for (const item of list) {
      if (isBeat(item)) {
        await flush();
        const first = beatIdx === 0;
        if (item.dayTime !== undefined) skipTime(item.dayTime, Math.max(2, item.seconds ?? 3));
        startCinematic(item.camera, first ? 0.01 : item.seconds ?? 2);
        await hooks.beat?.(beatIdx, item);
        await wait(first ? Math.min(2500, (item.seconds ?? 2) * 600) : (item.seconds ?? 2) * 650);
        beatIdx++;
      } else pending.push(item);
    }
    await flush();
  }

  // ---------------------------------------------------------------------------------------------
  // Prólogo: céu sobre a casa → porta → a Quim olha o reino cinzento.
  async function playPrologue() {
    const r = game.render;
    if (r && !(r.dayTime > 0.26 && r.dayTime < 0.4)) r.dayTime = 0.3;   // manhãzinha preguiçosa
    await playBeats(PROLOGUE, {
      beat(i) {
        if (i === 1) ctx.placePlayer(0, 225.5, Math.PI);                          // saindo pela porta
        if (i === 2) { ctx.placePlayer(-1.2, 216.8, Math.PI + 0.45); game.player?.setMood?.('curiosa', 4); }
      },
    });
    ctx.placePlayer(SPAWN.x, SPAWN.z, SPAWN.rotY);
    endCinematic(1.6);
    await wait(600);
    game.player?.emote?.('acenar');
    game.ui?.toast?.('WASD anda · Shift corre · Espaço pula · E conversa · Tab diário · M mapa', '🎀');
  }

  // ---------------------------------------------------------------------------------------------
  // Cutscene de passo de missão. setup/after = ganchos da história (posicionar moradores etc.).
  async function playCutscene(mission, step, idx, opts = {}) {
    if (step.dayTime !== undefined) {
      startCinematic(step.camera, 1.8);
      await skipTime(step.dayTime, 3, true);
    } else startCinematic(step.camera, 1.8);
    await opts.setup?.();
    await wait(step.camera ? 900 : 200);
    const lines = step.lines || [];
    const at = opts.lineHooks || {};
    // falas em blocos, parando onde há ganchos (ex.: o bando acorda em "Um olho se abre...")
    let start = 0;
    const cuts = Object.keys(at).map(Number).filter((n) => n > 0 && n < lines.length).sort((a, b) => a - b);
    for (const c of [...cuts, lines.length]) {
      if (c > start) await say(lines.slice(start, c));
      if (at[c]) await at[c]();
      start = c;
    }
    await opts.after?.();
    endCinematic(1.4);
  }

  // ---------------------------------------------------------------------------------------------
  // Final: amanhecer no Pico, a onda de cor pelo reino e a escolha do Pinceso. Depois, créditos e jogo livre.
  async function playEnding() {
    const flock = ctx.ensureFlock();
    flock?.setMode('fly');
    const order = ['pico', 'cidade', 'bosque', 'vila', 'ninhal', 'campo'];
    let wave = null;
    await playBeats(ENDING, {
      beat(i) {
        if (i === 1) {
          flock?.setMode('wave');
          game.audio?.play?.('cor');
          wave = (async () => {
            for (const id of order) {
              game.world?.setRegionColor?.(id, 1, true);
              await wait(1400);
            }
          })();
        }
        if (i === 2) flock?.setMode('fly');
      },
    });
    await wave;
    for (const reg of REGIONS) {
      if ((game.state.regionColor[reg.id] ?? 0) < 1) game.world?.setRegionColor?.(reg.id, 1, false);
      game.state.regionColor[reg.id] = 1;
    }
    game.state.flags.final_visto = true;
    // créditos
    const credits = [
      ['Mundo Olhos', 'uma aventura de cachos, olhinhos e um periquito convencido'],
      ['Estrelando', 'Quim e Pinceso, o guarda-costas oficial'],
      ['Com', 'todos os moradores do reino, que agora acordam coloridos'],
      ['Fim!', 'Mas o reino continua aberto: explore, ajude quem falta e passe na cafeteria.'],
    ];
    game.audio?.play?.('missao');
    for (const [t, s] of credits) {
      game.ui?.banner?.(t, s);
      await wait(3400);
    }
    endCinematic(2);
    game.player?.setMood?.('feliz');
    game.pinceso?.emote?.('❤', 3);
  }

  // ---------------------------------------------------------------------------------------------
  // Ganchos de cena por missão (quem aparece onde). Devolvem { setup, after, lineHooks }.
  function hooksFor(mission, step, idx) {
    const npcs = game.npcs;
    const place = (id, x, z, y) => npcs?.place?.(id, x, z, y) ?? npcs?.moveTo?.(id, x, z, y !== undefined ? { y } : undefined);
    const nextIsJoin = mission.steps[idx + 1]?.type === 'pinceso_join';
    const h = {};
    if (nextIsJoin && !game.state.pincesoJoined) {
      // o passarinho desce da pedra e pousa nos cachos
      h.setup = async () => {
        const head = game.player?.headAnchor;
        const p = game.player?.position;
        if (!p) return;
        let target = { x: p.x, y: p.y + 1.35, z: p.z };
        if (head?.getWorldPosition && game.THREE) { const v = new game.THREE.Vector3(); head.getWorldPosition(v); target = { x: v.x, y: v.y, z: v.z }; }
        game.pinceso?.flyTo?.(target, 2.2);
      };
    }
    if (mission.id === 'festa_surpresa') {
      h.setup = () => {
        place('vovo_lazinha', 1.5, 22);
        place('seu_miolo', 7.5, 22.5);
        npcs?.face?.('vovo_lazinha', { x: 5, z: 15 });
      };
      h.after = () => ctx.resetNPCs();
    }
    if (mission.id === 'alvorada') {
      h.setup = () => {
        const c = SPOTS.coreto_palco;
        npcs?.setVisible?.('dona_pluminia', true);
        place('dona_pluminia', c.x - 3, c.z - 2.5, c.y);
        ['tico', 'teco', 'tuco'].forEach((id, k) => place(id, c.x - 4.6 + k * 1.1, c.z + 2.8 - k * 0.6, c.y));
        npcs?.face?.('dona_pluminia', game.player?.position);
      };
      // ao concluir a Alvorada, o missions devolve todo mundo para casa (syncNPCs)
    }
    if (mission.id === 'piados_no_pico') {
      const flock = ctx.ensureFlock();
      const lines = step.lines || [];
      const wake = lines.findIndex((l) => /olho se abre/i.test(l.text || ''));
      const shout = lines.findIndex((l) => l.speaker === 'quim' && /UII/.test(l.text || ''));
      if (flock && wake >= 0) {
        h.setup = () => flock.setMode('sleep');
        h.lineHooks = {};
        if (shout > 0) h.lineHooks[shout] = () => { game.player?.setMood?.('surpresa', 2); game.cameraRig?.shake?.(0.25); };
        h.lineHooks[wake] = async () => { flock.setMode('awake'); game.audio?.pincesoVoice?.('alerta'); await wait(900); flock.setMode('fly'); };
        h.after = () => flock.setMode('fly');
      }
    }
    return h;
  }

  return { startCinematic, endCinematic, skipTime, playBeats, playPrologue, playCutscene, playEnding, hooksFor };
}

