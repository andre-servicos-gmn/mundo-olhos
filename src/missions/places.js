// Lugares com interação permanente: bancos (o tempo passa), cochilo em casa, Cafeteria Nuvem de Leite e
// a loja Laços & Cachos. ctx (do missions.js): { game, say, wait, exclusive, isBusy(), scenes, cafeStep(),
// finishCafe(ref), nightPending(), targetedLandmarks() }.
import { DRINKS, ACCESSORIES } from '../data/story.js';
import { LANDMARKS, SPOTS, REGIONS } from '../data/worldmap.js';
import { LANDMARK_BY_ID } from './labels.js';

/** Ponto local (lx, lz) de um landmark → mundo. */
function toWorld(l, lx, lz) {
  const a = l.rotY ?? 0, c = Math.cos(a), s = Math.sin(a);
  return { x: l.x + lx * c + lz * s, z: l.z - lx * s + lz * c };
}
const yawOf = (dx, dz) => Math.atan2(dx, dz);

export function createPlaces(ctx) {
  const { game, say, wait, exclusive } = ctx;
  const H = (x, z) => game.world?.getHeight?.(x, z) ?? 0;
  const S = () => game.state;
  const isNight = () => !!game.render?.isNight?.();

  // ---------------------------------------------------------------------------------------------
  // Bancos e cochilo: o tempo passa rapidinho até a noite ou o amanhecer.
  async function passTime(sitPos, rotY, { fade = false } = {}) {
    const p = game.player;
    if (sitPos && p?.sitAt) p.sitAt(sitPos, rotY);
    let target = null;
    if (ctx.nightPending() && !isNight()) target = 0.9;
    else if (game.ui?.choice) {
      const i = await game.ui.choice(fade ? 'Um cochilinho em casa... até quando?' : 'Sentadinha no banco... esperar até quando?',
        ['Até a noite', 'Até o amanhecer', 'Só descansar um pouquinho']);
      target = [0.9, 0.26, null][i] ?? null;
    }
    if (target === null) return;
    game.audio?.quimVoice?.('bocejo');
    game.ui?.toast?.(target > 0.5 ? 'O tempo passa rapidinho... as estrelas vêm chegando.' : 'O tempo passa rapidinho... olha o sol nascendo!', target > 0.5 ? '🌙' : '🌅');
    if (fade && game.ui?.fade) {
      await game.ui.fade(true, 700);
      await ctx.scenes.skipTime(target, 0.6);
      await wait(300);
      await game.ui.fade(false, 900);
    } else await ctx.scenes.skipTime(target, 4);
  }

  const benches = LANDMARKS.filter((l) => l.type === 'banco');
  for (const b of benches) {
    game.interactables?.add({
      id: 'banco_' + b.id,
      get label() { return ctx.nightPending() && !isNight() ? 'Esperar a noite no banco' : 'Sentar no banco'; },
      radius: 2.2,
      getPosition: () => ({ x: b.x, y: H(b.x, b.z), z: b.z }),
      enabled: () => !ctx.isBusy() && !game.cinematic && !ctx.targetedLandmarks().has(b.id),
      onInteract: () => exclusive(() => passTime({ x: b.x, z: b.z }, b.rotY ?? 0)),
    });
  }
  const casa = LANDMARK_BY_ID.get('casa_quim');
  if (casa) {
    const door = toWorld(casa, 0, 6.6);
    game.interactables?.add({
      id: 'cochilo_casa_quim',
      get label() { return ctx.nightPending() && !isNight() ? 'Cochilar em casa até a noite' : 'Tirar um cochilo em casa'; },
      radius: 2.4,
      getPosition: () => ({ x: door.x, y: H(door.x, door.z), z: door.z }),
      enabled: () => !ctx.isBusy() && !game.cinematic,
      onInteract: () => exclusive(() => passTime(null, 0, { fade: true })),
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Cafeteria Nuvem de Leite: sentar à mesinha da calçada, câmera aconchegante, lo-fi e uma bebida.
  const cafe = LANDMARK_BY_ID.get('cafeteria');
  function cafeSeat() {
    // mesinha da calçada à direita da porta (landmarks.js: mesa em (3,6; 5,6) locais, cadeiras a ±0,95)
    const seat = toWorld(cafe, 2.65, 5.6), table = toWorld(cafe, 3.6, 5.6);
    const cup = toWorld(cafe, 3.32, 5.78);
    const cam = toWorld(cafe, 5.7, 8.3), look = toWorld(cafe, 3.0, 5.5);
    const gy = H(seat.x, seat.z);
    return {
      pos: { x: seat.x, z: seat.z },
      rotY: yawOf(table.x - seat.x, table.z - seat.z),
      cup: { x: cup.x, y: H(cup.x, cup.z) + 0.88, z: cup.z, rotY: yawOf(seat.x - cup.x, seat.z - cup.z), cafe: true },
      cam: { x: cam.x, y: gy + 2.05, z: cam.z, lookX: look.x, lookY: gy + 0.95, lookZ: look.z },
    };
  }

  function drinkMenu(free) {
    const flags = S().flags || {};
    return DRINKS.filter((d) => !d.requiresFlag || flags[d.requiresFlag]).map((d) => ({
      ...d, price: free ? 0 : d.price, fullPrice: d.price, free: !!free,
      affordable: free || (S().jujubas ?? 0) >= d.price, tried: !!S().drinksTried?.[d.id],
    }));
  }

  async function sitAtCafe() {
    const ref = ctx.cafeStep();               // { id, step } se alguma missão pede a cafeteria
    const free = !!ref?.step.free;
    const seat = cafeSeat();
    const pin = game.pinceso;
    game.player?.sitAt?.(seat.pos, seat.rotY);
    ctx.scenes.startCinematic(seat.cam, 1.6);
    game.audio?.setMusic?.('cafe');
    if (S().pincesoJoined) pin?.setMode?.('perched', seat.cup);
    await wait(1000);
    let drank = null;
    const menu = drinkMenu(free);
    const choice = game.ui?.openCafe ? await game.ui.openCafe(menu, { jujubas: S().jujubas, free }) : menu[0]?.id;
    const drink = DRINKS.find((d) => d.id === choice);
    if (drink) {
      const price = free ? 0 : drink.price;
      if ((S().jujubas ?? 0) < price) {
        game.ui?.toast?.(`Faltam ${price - S().jujubas} jujubas para o ${drink.name}.`, '🍬');
      } else {
        S().jujubas -= price;
        S().drinksTried[drink.id] = true;
        drank = drink;
        if (price) game.audio?.play?.('moeda');
        game.ui?.toast?.(free ? `${drink.name} (cortesia da prefeitura!)` : `${drink.name} (-${price} jujubas)`, '☕');
        // a Quim "bebe": golinho, suspiro feliz; o Pinceso bebe o minicafé do dedal
        game.player?.setMood?.('feliz');
        await wait(700);
        game.audio?.quimVoice?.('hmm');
        await wait(1100);
        game.audio?.quimVoice?.('risadinha');
        if (S().pincesoJoined) { game.audio?.pincesoVoice?.('feliz'); pin?.emote?.('❤', 2.4); }
        await wait(800);
      }
    }
    if (drank && ref) {
      await say(ref.step.lines);
      await ctx.finishCafe(ref);
    } else if (drank) {
      await say([{ speaker: 'dona_nata', text: 'Bom proveito! A espuma piscou pra você, viu?' }]);
    }
    await wait(600);
    ctx.scenes.endCinematic(1.4);
    const reg = REGIONS.find((r) => r.id === (game.world?.regionAt?.(seat.pos.x, seat.pos.z) ?? 'cidade'));
    game.audio?.setMusic?.(reg?.music ?? 'cidade');
    if (S().pincesoJoined && pin?.mode === 'perched') pin.setMode('follow');
  }

  if (cafe) {
    const mesa = SPOTS.cafeteria_mesa;
    game.interactables?.add({
      id: 'cafeteria_sentar',
      get label() { return ctx.cafeStep() ? 'Sentar e pedir uma bebida' : 'Sentar na Cafeteria Nuvem de Leite'; },
      radius: 3.2,
      getPosition: () => ({ x: mesa.x, y: H(mesa.x, mesa.z), z: mesa.z }),
      enabled: () => !ctx.isBusy() && !game.cinematic,
      onInteract: () => exclusive(sitAtCafe),
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Laços & Cachos: comprar e equipar acessórios (os presentes de missão também aparecem para equipar).
  function buy(id) {
    const a = ACCESSORIES.find((x) => x.id === id);
    const acc = S().accessories;
    if (!a || acc.owned[id]) return false;
    if ((S().jujubas ?? 0) < a.price) {
      game.ui?.toast?.(`Faltam ${a.price - S().jujubas} jujubas para o ${a.name}.`, '🍬');
      return false;
    }
    S().jujubas -= a.price;
    acc.owned[id] = true;
    game.audio?.play?.('moeda');
    game.ui?.toast?.(`${a.name} é seu!`, '🎀');
    equip(id, true);
    return true;
  }
  function equip(id, force = false) {
    const acc = S().accessories;
    if (id && !acc.owned[id]) return false;
    const v = !force && acc.equipped === id ? null : id;
    acc.equipped = v;
    game.player?.setAccessory?.(v);
    game.audio?.play?.('clique');
    return true;
  }
  function shopItems() {
    const acc = S().accessories;
    return ACCESSORIES.filter((a) => a.shop || acc.owned[a.id]).map((a) => ({
      ...a, owned: !!acc.owned[a.id], equipped: acc.equipped === a.id,
      affordable: (S().jujubas ?? 0) >= a.price, buy: () => buy(a.id), equip: () => equip(a.id),
    }));
  }

  async function openShop() {
    const flags = S().flags || {};
    if (!flags.loja_aberta) {
      const st = S().missions?.lacos_ao_vento?.status;
      await say([{ speaker: 'madame_fivela', text: st === 'active'
        ? 'Ainda faltam laços na vitrine, querida! Sem eles a Laços & Cachos não abre.'
        : 'A loja tá fechadinha, querida... A ventania levou meus laços da vitrine! Vem conversar comigo.' }]);
      return;
    }
    if (!game.ui?.openShop) return;
    // a UI pode cuidar das compras pelos callbacks (buy/equip) e só fechar, ou devolver { action, id } / id
    for (let guard = 0; guard < 30; guard++) {
      const res = await game.ui.openShop(shopItems(), { jujubas: S().jujubas, buy, equip });
      if (!res) break;
      const id = typeof res === 'string' ? res : res.id;
      const action = typeof res === 'string' ? null : res.action;
      if (action === 'buy' || (!action && !S().accessories.owned[id])) buy(id);
      else equip(id);
    }
  }

  const balcao = SPOTS.loja_balcao;
  if (balcao) {
    game.interactables?.add({
      id: 'loja_acessorios_balcao',
      get label() { return S().flags?.loja_aberta ? 'Ver acessórios' : 'Espiar a vitrine'; },
      radius: 3,
      getPosition: () => ({ x: balcao.x, y: H(balcao.x, balcao.z), z: balcao.z }),
      enabled: () => !ctx.isBusy() && !game.cinematic,
      onInteract: () => exclusive(openShop),
    });
  }

  return { sitAtCafe, openShop, buy, equip, drinkMenu, cafeSeat };
}
