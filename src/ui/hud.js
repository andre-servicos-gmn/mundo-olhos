// HUD: jujubas, relógio de sol/lua, missão rastreada, prompt de interação, avisos (toasts),
// título de região, faixas (banner) e celebração de missão concluída.
import { REGIONS } from '../data/worldmap.js';
import { ACCESSORIES, DRINKS } from '../data/story.js';
import { el, esc, wait } from './dom.js';
import { jujubaSVG, MISSION_STICKER } from './art.js';

const REG = Object.fromEntries(REGIONS.map((r) => [r.id, r]));

export function createHud(ctx) {
  const { game } = ctx;
  const root = el('div', 'mo-hud hidden');

  // --- canto superior esquerdo: jujubas + relógio
  const jjCount = el('span', 'mo-jj-count', { text: '0' });
  const jjFloat = el('div', 'mo-jj-floats');
  const jj = el('div', 'mo-jj', { attrs: { title: 'Jujubas' } });
  jj.innerHTML = jujubaSVG('#ff6fa8', 'mo-jj-icon');
  jj.append(jjCount, jjFloat);
  const clockIcon = el('div', 'mo-clock-orbit', { html: '<span class="sun"></span><span class="moon"></span>' });
  const clockLabel = el('span', 'mo-clock-label', { text: '' });
  const clock = el('div', 'mo-clock', {}, el('div', 'mo-clock-dial', {}, clockIcon), clockLabel);
  const topLeft = el('div', 'mo-topleft', {}, jj, clock);

  // --- missão rastreada
  const quest = el('div', 'mo-quest empty');

  // --- prompt de interação
  const promptKey = el('span', 'mo-key', { text: 'E' });
  const promptText = el('span', 'mo-prompt-text');
  const prompt = el('div', 'mo-prompt', {}, promptKey, promptText);

  // --- avisos, título de região, faixas
  const toasts = el('div', 'mo-toasts', { attrs: { 'aria-live': 'polite' } });
  const regionTitle = el('div', 'mo-region-title');
  const bannerBox = el('div', 'mo-banner-box');
  const keysHint = el('div', 'mo-keys-hint', { html: '<span><b>Tab</b> Diário</span><span><b>M</b> Mapa</span><span><b>Esc</b> Pausa</span>' });

  root.append(topLeft, quest, prompt, keysHint);
  // avisos e títulos ficam fora do HUD (aparecem até em cenas)
  ctx.root.append(root, toasts, regionTitle, bannerBox);

  let shownJJ = 0, lastJJ = null, jjAcc = 0;
  let questKey = '', questAcc = 1, promptValue = null;
  let lastPhase = '';

  // ------------------------------------------------------------------------------------------
  function setPrompt(text) {
    promptValue = text || null;
    if (!promptValue) { prompt.classList.remove('show'); return; }
    const m = /^([A-Za-zÀ-ú0-9]{1,6}):\s*(.+)$/.exec(promptValue);
    promptKey.textContent = m ? m[1] : 'E';
    promptText.textContent = m ? m[2] : promptValue;
    prompt.classList.add('show');
  }

  // ------------------------------------------------------------------------------------------
  const recent = new Map();
  function toast(text, icon = '✨') {
    const now = performance.now();
    if (recent.has(text) && now - recent.get(text) < 1200) return;
    recent.set(text, now);
    while (toasts.children.length >= 4) toasts.firstChild.remove();
    const t = el('div', 'mo-toast', {}, el('span', 'mo-toast-icon', { text: icon || '✨' }), el('span', 'mo-toast-text', { text }));
    toasts.appendChild(t);
    const life = Math.min(6500, 2600 + String(text).length * 45);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 450); }, life);
  }

  // ------------------------------------------------------------------------------------------
  // Título de região (estilo cinematográfico): nome grande, ornamento e uma frase do lugar.
  let regionTimer = 0;
  function showRegionTitle(name, regionId, isNew = false) {
    const r = regionId ? REG[regionId] : REGIONS.find((x) => x.name === name);
    const flavor = r?.flavor?.length ? r.flavor[Math.floor(Math.random() * r.flavor.length)] : '';
    const accent = r?.palette?.accents?.[0] || '#ff8fc7';
    regionTitle.style.setProperty('--accent', accent);
    regionTitle.innerHTML = `
      ${isNew ? '<div class="mo-rt-new">✦ nova região descoberta ✦</div>' : ''}
      <div class="mo-rt-name">${[...String(name)].map((ch, i) => `<span style="--i:${i}">${ch === ' ' ? '&nbsp;' : esc(ch)}</span>`).join('')}</div>
      <div class="mo-rt-orn"><i></i><b>◆</b><i></i></div>
      ${flavor ? `<div class="mo-rt-flavor">${esc(flavor)}</div>` : ''}`;
    regionTitle.classList.remove('show');
    void regionTitle.offsetWidth;
    regionTitle.classList.add('show');
    clearTimeout(regionTimer);
    regionTimer = setTimeout(() => regionTitle.classList.remove('show'), 4800);
  }

  // ------------------------------------------------------------------------------------------
  // Faixas em fila (uma de cada vez, para não se atropelarem).
  let bannerChain = Promise.resolve();
  function queueBanner(build, ms) {
    bannerChain = bannerChain.then(async () => {
      const b = build();
      bannerBox.appendChild(b);
      void b.offsetWidth;
      b.classList.add('show');
      await wait(ms);
      b.classList.remove('show');
      b.classList.add('out');
      await wait(600);
      b.remove();
    }).catch(() => {});
    return bannerChain;
  }
  function banner(title, subtitle) {
    return queueBanner(() => el('div', 'mo-banner', { html: `
      <div class="mo-banner-ribbon"><span class="st">★</span><span class="t">${esc(title)}</span><span class="st">★</span></div>
      ${subtitle ? `<div class="mo-banner-sub">${esc(subtitle)}</div>` : ''}` }), 3600);
  }
  function confetti(n = 46) {
    const colors = ['#ff8fc7', '#ffd23f', '#8ef0c0', '#7fd8ff', '#c792ff', '#ff9f6b', '#ffffff'];
    const box = el('div', 'mo-confetti');
    for (let i = 0; i < n; i++) {
      const p = el('i');
      const a = (Math.random() - 0.5) * Math.PI * 1.3 - Math.PI / 2, v = 160 + Math.random() * 260;
      p.style.setProperty('--dx', `${Math.cos(a) * v}px`);
      p.style.setProperty('--dy', `${Math.sin(a) * v}px`);
      p.style.setProperty('--r', `${(Math.random() - 0.5) * 900}deg`);
      p.style.setProperty('--d', `${Math.random() * 0.25}s`);
      p.style.background = colors[i % colors.length];
      if (i % 3 === 0) p.classList.add('star');
      box.appendChild(p);
    }
    return box;
  }
  function missionComplete(mission) {
    if (!mission) return Promise.resolve();
    const rw = mission.rewards || {};
    const bits = [];
    if (rw.jujubas) bits.push(`<span class="rw">${jujubaSVG('#ffd23f')}+${rw.jujubas}</span>`);
    if (rw.accessory) bits.push(`<span class="rw">🎀 ${esc(ACCESSORIES.find((a) => a.id === rw.accessory)?.name ?? rw.accessory)}</span>`);
    if (rw.drink) bits.push(`<span class="rw">☕ ${esc(DRINKS.find((d) => d.id === rw.drink)?.name ?? rw.drink)}</span>`);
    if (rw.color) bits.push(`<span class="rw">🌈 ${esc(REG[mission.region]?.name ?? '')} mais colorido</span>`);
    const sticker = MISSION_STICKER[mission.id] || '💖';
    return queueBanner(() => {
      const b = el('div', 'mo-complete', { html: `
        <div class="mo-complete-sticker"><span>${sticker}</span></div>
        <div class="mo-complete-head">Missão concluída!</div>
        <div class="mo-complete-title">${esc(mission.title)}</div>
        ${bits.length ? `<div class="mo-complete-rw">${bits.join('')}</div>` : ''}
        <div class="mo-complete-foot">Adesivo novo no Diário ♥</div>` });
      b.prepend(confetti());
      return b;
    }, 4300);
  }

  // ------------------------------------------------------------------------------------------
  function updateJujubas(dt) {
    const target = game.state?.jujubas ?? 0;
    if (lastJJ === null) { lastJJ = shownJJ = target; jjCount.textContent = String(target); return; }
    if (target !== lastJJ) {
      const diff = target - lastJJ;
      lastJJ = target;
      if (diff > 0) {
        const f = el('span', 'mo-jj-float', { text: `+${diff}` });
        jjFloat.appendChild(f);
        setTimeout(() => f.remove(), 1100);
        jj.classList.remove('bump'); void jj.offsetWidth; jj.classList.add('bump');
      } else {
        jj.classList.remove('spend'); void jj.offsetWidth; jj.classList.add('spend');
      }
    }
    if (shownJJ === target) return;
    jjAcc += dt;
    if (jjAcc < 0.035) return;
    jjAcc = 0;
    const d = target - shownJJ;
    shownJJ += Math.sign(d) * Math.max(1, Math.floor(Math.abs(d) / 6));
    jjCount.textContent = String(shownJJ);
  }

  function updateClock() {
    const t = game.render?.dayTime ?? game.state?.dayTime ?? 0.3;
    clockIcon.style.transform = `rotate(${(t * 360 + 180) % 360}deg)`;
    const phase = game.render?.timePhase?.() ?? (t < 0.2 || t > 0.8 ? 'noite' : t < 0.3 ? 'amanhecer' : t < 0.7 ? 'dia' : 'entardecer');
    if (phase !== lastPhase) {
      lastPhase = phase;
      clock.dataset.phase = phase;
      clockLabel.textContent = { amanhecer: 'Amanhecer', dia: 'Dia', entardecer: 'Entardecer', noite: 'Noite' }[phase] || '';
    }
  }

  function updateQuest(dt) {
    questAcc += dt;
    if (questAcc < 0.2) return;
    questAcc = 0;
    const tr = game.missions?.tracked?.();
    const tgt = tr ? game.missions?.markerTarget?.() : null;
    const p = game.player?.position;
    const dist = tgt && p ? Math.round(Math.hypot(tgt.x - p.x, tgt.z - p.z)) : null;
    const prog = tr?.progress;
    const key = tr ? [tr.mission.id, tr.stepIndex, tr.hint, prog ? prog.have + '/' + prog.need : '', dist === null ? '' : Math.round(dist / 5)].join('|') : 'none';
    if (key === questKey) return;
    const stepChanged = questKey.split('|').slice(0, 2).join('|') !== key.split('|').slice(0, 2).join('|');
    questKey = key;
    if (!tr) {
      quest.className = 'mo-quest empty';
      quest.innerHTML = `<div class="mo-q-free">Livre para passear! <small>Procure moradores com <b>!</b></small></div>`;
      return;
    }
    const m = tr.mission, reg = REG[m.region];
    const pct = prog && prog.need ? Math.min(100, Math.round((prog.have / prog.need) * 100)) : 0;
    quest.className = 'mo-quest' + (m.main ? ' main' : '');
    quest.style.setProperty('--rc', reg?.palette?.accents?.[0] || '#ff8fc7');
    quest.innerHTML = `
      <div class="mo-q-top"><span class="mo-q-tag">${m.main ? '★ História' : '♥ Pedido'}</span><span class="mo-q-reg">${esc(reg?.name ?? '')}</span></div>
      <div class="mo-q-title">${esc(m.title)}</div>
      <div class="mo-q-hint">${esc(tr.hint || m.summary || '')}</div>
      ${prog && prog.need ? `<div class="mo-q-prog"><div class="bar"><i style="width:${pct}%"></i></div><span>${esc(prog.label || '')} ${prog.have}/${prog.need}</span></div>` : ''}
      ${dist !== null && dist > 6 ? `<div class="mo-q-dist">★ a ${dist} m</div>` : ''}`;
    if (stepChanged) { quest.classList.remove('pulse'); void quest.offsetWidth; quest.classList.add('pulse'); }
  }

  return {
    el: root,
    setPrompt,
    get prompt() { return promptValue; },
    toast,
    showRegionTitle,
    banner,
    missionComplete,
    show(v) { root.classList.toggle('hidden', !v); },
    /** Esconde partes do HUD em cenas/menus. */
    setMode({ cinematic = false, blocked = false } = {}) {
      root.classList.toggle('cine', cinematic);
      root.classList.toggle('blocked', blocked);
    },
    update(dt) {
      updateJujubas(dt);
      updateClock();
      updateQuest(dt);
    },
    forceQuestRefresh() { questKey = '~'; questAcc = 1; },
  };
}
