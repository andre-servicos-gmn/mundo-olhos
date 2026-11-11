// Diário da Quim (Tab): abas Missões, Adesivos e Coleção. Dá para escolher a missão rastreada no HUD.
import { MISSIONS, NPCS, DRINKS, ACCESSORIES } from '../data/story.js';
import { REGIONS, JUJUBA_SPOTS } from '../data/worldmap.js';
import { el, esc, fadeHex } from './dom.js';
import { MISSION_STICKER, cupSVG, accessorySVG, jujubaSVG, pincesoSVG } from './art.js';
import { regionT } from './mapdraw.js';
import { ASAS_BIRDS, ASAS_NAME, ASAS_DEDICATORIA } from '../data/asas.js';

const REG = Object.fromEntries(REGIONS.map((r) => [r.id, r]));
const NPC_NAME = Object.fromEntries(NPCS.map((n) => [n.id, n.name]));
const BASE_TABS = [['missoes', 'Missões', '📜'], ['adesivos', 'Adesivos', '⭐'], ['colecao', 'Coleção', '🎀']];
const ASAS_TAB = ['asas', 'Asas de Saudade', '💙'];

export function createDiary(ctx) {
  const { game } = ctx;
  let wrap = null, page = null, tabBtns = [], tab = 'missoes', layer = null, sel = 0, selectable = [];
  const tabs = () => (game.state?.flags?.visitou_asas_de_saudade ? [...BASE_TABS, ASAS_TAB] : BASE_TABS);

  function missionList() {
    const l = game.missions?.list?.();
    if (Array.isArray(l)) return l;
    const all = game.state?.missions || {};
    return MISSIONS.map((m) => ({ ...m, status: all[m.id]?.status ?? 'locked', hint: null, progress: null, tracked: game.state?.activeMissionId === m.id }));
  }

  function chip(regionId) {
    const r = REG[regionId];
    return r ? `<span class="mo-chip" style="--c:${r.palette.accents[0]}">${esc(r.name)}</span>` : '';
  }

  function missionsPage() {
    const list = missionList();
    const trackedId = game.missions?.tracked?.()?.mission?.id ?? game.state?.activeMissionId;
    const active = list.filter((m) => m.status === 'active').sort((a, b) => (b.main ? 1 : 0) - (a.main ? 1 : 0));
    const avail = list.filter((m) => m.status === 'available');
    const done = list.filter((m) => m.status === 'done');
    const locked = list.length - active.length - avail.length - done.length;
    selectable = active.map((m) => m.id);
    sel = Math.min(sel, Math.max(0, selectable.length - 1));
    const card = (m, i) => {
      const p = m.progress;
      const pct = p && p.need ? Math.round((p.have / p.need) * 100) : 0;
      const isT = m.id === trackedId;
      return `<div class="mo-mcard ${m.main ? 'main' : ''} ${isT ? 'tracked' : ''} ${i === sel ? 'sel' : ''}" data-id="${esc(m.id)}" data-i="${i}">
        <div class="top">${m.main ? '<span class="tag">★ História</span>' : '<span class="tag side">♥ Pedido</span>'}${chip(m.region)}</div>
        <div class="title">${esc(m.title)}</div>
        <div class="hint">${esc(m.hint || m.summary || '')}</div>
        ${p && p.need ? `<div class="mo-q-prog"><div class="bar"><i style="width:${pct}%"></i></div><span>${esc(p.label || '')} ${p.have}/${p.need}</span></div>` : ''}
        <button class="mo-btn small track ${isT ? 'on' : ''}" data-track="${esc(m.id)}"><span class="lb">${isT ? '★ Seguindo' : 'Seguir no mapa'}</span></button>
      </div>`;
    };
    return `
      <section><h3>Em andamento <small>${active.length}</small></h3>
        ${active.length ? active.map(card).join('') : '<p class="empty">Nenhuma missão agora. Converse com quem tem <b>!</b> em cima da cabeça!</p>'}</section>
      ${avail.length ? `<section><h3>Pedidos por aí <small>${avail.length}</small></h3><div class="mo-avail">
        ${avail.map((m) => `<div class="mo-acard">${chip(m.region)}<b>${esc(m.title)}</b>
          <span>${m.giver ? `Fale com <i>${esc(NPC_NAME[m.giver] || m.giver)}</i>` : 'Começa sozinha quando você chegar lá'}</span></div>`).join('')}</div></section>` : ''}
      <section><h3>Concluídas <small>${done.length}</small></h3>
        ${done.length ? `<div class="mo-done">${done.map((m) => `<div class="mo-dcard"><span class="st">${MISSION_STICKER[m.id] || '💖'}</span><b>${esc(m.title)}</b>${chip(m.region)}<span class="heart">♥</span></div>`).join('')}</div>` : '<p class="empty">Ainda nenhuma... mas o reino está torcendo por você!</p>'}</section>
      ${locked > 0 ? `<p class="mo-locked">+${locked} ${locked === 1 ? 'missão escondida' : 'missões escondidas'} pelo reino... 👀</p>` : ''}`;
  }

  function stickersPage() {
    const list = missionList();
    const done = list.filter((m) => m.status === 'done').length;
    return `<div class="mo-stk-head"><b>${done}</b> de ${list.length} adesivos colados</div>
      <div class="mo-stickers">${list.map((m, i) => {
        const ok = m.status === 'done';
        const rot = ((i * 37) % 17) - 8;
        const c = REG[m.region]?.palette.accents[i % 3] || '#ff8fc7';
        return `<div class="mo-sticker ${ok ? 'on' : ''}" style="--rot:${rot}deg;--c:${c}" title="${ok ? esc(m.title) : '???'}">
          <div class="disc"><span>${MISSION_STICKER[m.id] || '💖'}</span></div><div class="cap">${ok ? esc(m.title) : '???'}</div></div>`;
      }).join('')}</div>`;
  }

  function collectionPage() {
    const s = game.state || {};
    const got = Object.keys(s.collected || {}).filter((k) => k.startsWith('jj_')).length;
    const mins = Math.floor((s.playTime || 0) / 60);
    const acc = s.accessories || { owned: {} };
    return `
      <section class="mo-col-jj"><h3>Jujubas</h3>
        <div class="mo-col-stats">
          <div class="stat">${jujubaSVG('#ff6fa8')}<b>${s.jujubas ?? 0}</b><span>no bolso</span></div>
          <div class="stat">${jujubaSVG('#ffd23f')}<b>${s.totalJujubasFound ?? got}</b><span>achadas no total</span></div>
          <div class="stat">${jujubaSVG('#7fd8ff')}<b>${got}/${JUJUBA_SPOTS.length}</b><span>espalhadas pelo reino</span></div>
          <div class="stat"><span class="big">⏱</span><b>${mins} min</b><span>de aventura</span></div>
        </div></section>
      <section><h3>Bebidas provadas <small>${DRINKS.filter((d) => s.drinksTried?.[d.id]).length}/${DRINKS.length}</small></h3>
        <div class="mo-col-grid">${DRINKS.map((d) => {
          const ok = !!s.drinksTried?.[d.id];
          return `<div class="mo-col-item ${ok ? 'on' : ''}">${cupSVG(ok ? d.color : '#d8d0e6')}<b>${ok ? esc(d.name) : '???'}</b></div>`;
        }).join('')}</div></section>
      <section><h3>Acessórios <small>${ACCESSORIES.filter((a) => acc.owned?.[a.id]).length}/${ACCESSORIES.length}</small></h3>
        <div class="mo-col-grid">${ACCESSORIES.map((a) => {
          const ok = !!acc.owned?.[a.id];
          return `<div class="mo-col-item acc ${ok ? 'on' : ''} ${acc.equipped === a.id ? 'eq' : ''}">${accessorySVG(a.id)}<b>${ok ? esc(a.name) : '???'}</b>${acc.equipped === a.id ? '<span class="eqtag">usando</span>' : ''}</div>`;
        }).join('')}</div></section>
      <section><h3>Cores do reino</h3>
        <div class="mo-col-regions">${REGIONS.map((r) => {
          const t = regionT(game, r.id), d = !!s.discoveredRegions?.[r.id];
          return `<div class="mo-lg-reg ${d ? '' : 'unk'}"><i style="background:${fadeHex(r.palette.ground, t)};border-color:${fadeHex(r.palette.accents[0], t)}"></i>
            <span class="n">${d ? esc(r.name) : '???'}</span><span class="bar"><b style="width:${Math.round(t * 100)}%;background:${r.palette.accents[0]}"></b></span><span class="p">${Math.round(t * 100)}%</span></div>`;
        }).join('')}</div></section>
      ${s.pincesoJoined ? `<section class="mo-col-friend"><div class="pin">${pincesoSVG()}</div><div><b>Pinceso</b><span>Companheiro de aventuras e guarda-costas oficial dos cachinhos. Convencido? Um pouquinho. Leal? Totalmente.</span></div></section>` : ''}`;
  }

  function asasPage() {
    return `<div class="mo-asas-page">
      <h3>${esc(ASAS_NAME)}</h3>
      <p class="ded">${esc(ASAS_DEDICATORIA)}</p>
      <div class="birds">${ASAS_BIRDS.map((b) => `<div class="bird"><i style="background:${b.look.body};border-color:${b.look.outfit}"></i><b>${esc(b.name)}</b><span>${esc(b.especie)}</span></div>`).join('')}</div>
    </div>`;
  }

  function render() {
    if (!page) return;
    tabBtns.forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    page.innerHTML = tab === 'missoes' ? missionsPage() : tab === 'adesivos' ? stickersPage() : tab === 'asas' ? asasPage() : collectionPage();
    page.querySelectorAll('[data-track]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); track(b.dataset.track); }));
    page.querySelectorAll('.mo-mcard').forEach((c) => c.addEventListener('mouseenter', () => { sel = Number(c.dataset.i); markSel(); }));
  }
  function markSel() { page?.querySelectorAll('.mo-mcard').forEach((c) => c.classList.toggle('sel', Number(c.dataset.i) === sel)); }
  function track(id) {
    const ok = game.missions?.track ? game.missions.track(id) : ((game.state.activeMissionId = id), true);
    if (ok !== false) { ctx.sfx('brilho'); ctx.hud.forceQuestRefresh(); }
    render();
  }
  function setTab(id) {
    if (id === tab) return;
    tab = id;
    ctx.sfx('mover');
    page.scrollTop = 0;
    render();
  }

  function open() {
    if (wrap) return;
    wrap = el('div', 'mo-overlay mo-diary');
    tabBtns = tabs().map(([id, lb, ic]) => el('button', 'mo-tab', { html: `<span>${ic}</span>${lb}`, attrs: { 'data-tab': id }, on: { click: () => setTab(id) } }));
    page = el('div', 'mo-book-page');
    const closeBtn = el('button', 'mo-btn small', { html: '<span class="lb">Fechar <kbd>Tab</kbd></span>', on: { click: () => close() } });
    wrap.appendChild(el('div', 'mo-book', {},
      el('div', 'mo-book-head', {}, el('h2', 'mo-book-title', { html: 'Diário da Quim <span>✿</span>' }), el('div', 'mo-tabs', {}, ...tabBtns), closeBtn),
      page,
      el('div', 'mo-book-foot', { text: '← → trocar de aba · ↑ ↓ escolher missão · Enter seguir · Tab fechar' })));
    ctx.root.appendChild(wrap);
    render();
    layer = {
      name: 'diary', pauses: true,
      onKey(code) {
        const TABS = tabs();
        const i = TABS.findIndex((t) => t[0] === tab);
        if (code === 'Tab' || code === 'Escape') close();
        else if (code === 'ArrowLeft' || code === 'KeyA' || code === 'KeyQ') setTab(TABS[(i + TABS.length - 1) % TABS.length][0]);
        else if (code === 'ArrowRight' || code === 'KeyD' || code === 'KeyE') setTab(TABS[(i + 1) % TABS.length][0]);
        else if (tab === 'missoes' && selectable.length && (code === 'ArrowUp' || code === 'KeyW')) { sel = (sel + selectable.length - 1) % selectable.length; markSel(); ctx.sfx('mover'); scrollSel(); }
        else if (tab === 'missoes' && selectable.length && (code === 'ArrowDown' || code === 'KeyS')) { sel = (sel + 1) % selectable.length; markSel(); ctx.sfx('mover'); scrollSel(); }
        else if (tab === 'missoes' && selectable.length && (code === 'Enter' || code === 'Space' || code === 'NumpadEnter')) track(selectable[sel]);
        else if (code === 'ArrowUp' || code === 'KeyW') page.scrollTop -= 80;
        else if (code === 'ArrowDown' || code === 'KeyS') page.scrollTop += 80;
        return true;
      },
    };
    ctx.push(layer);
    ctx.sfx('clique');
    requestAnimationFrame(() => wrap?.classList.add('show'));
  }
  function scrollSel() { page.querySelector('.mo-mcard.sel')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }

  function close() {
    if (!wrap) return;
    ctx.sfx('clique');
    ctx.pop(layer);
    const w = wrap;
    wrap = null; page = null;
    w.classList.add('out');
    setTimeout(() => w.remove(), 260);
  }

  return { open, close, get isOpen() { return !!wrap; } };
}
