// Telas de "fora do jogo": carregamento, menu principal, pausa, opções, controles e créditos.
import { TIPS } from '../data/story.js';
import { el, esc, wait } from './dom.js';
import { titleHTML, quimSVG, pincesoSVG, jujubaSVG, JUJUBA_COLORS } from './art.js';

/** Nuvenzinhas com olhos (decoração CSS). */
function clouds(n = 5) {
  const box = el('div', 'mo-clouds');
  for (let i = 0; i < n; i++) {
    const c = el('div', 'mo-cloud', { html: '<span class="e"></span><span class="e"></span>' });
    c.style.setProperty('--y', `${8 + ((i * 37) % 70)}%`);
    c.style.setProperty('--s', `${0.6 + ((i * 13) % 7) / 10}`);
    c.style.setProperty('--dur', `${38 + ((i * 11) % 30)}s`);
    c.style.setProperty('--delay', `${-i * 9}s`);
    box.appendChild(c);
  }
  return box;
}

/**
 * Lista vertical de botões navegável por teclado e mouse.
 * items: [{ label, sub?, icon?, action(), disabled? }]. Retorna { el, onKey(code), focus(i) }.
 */
export function buttonList(ctx, items, { cls = '', start = 0 } = {}) {
  const box = el('div', 'mo-btnlist ' + cls);
  let sel = Math.max(0, Math.min(start, items.length - 1));
  const btns = items.map((it, i) => {
    const b = el('button', 'mo-btn' + (it.cls ? ' ' + it.cls : ''), {
      html: `${it.icon ? `<span class="ic">${it.icon}</span>` : ''}<span class="lb">${esc(it.label)}</span>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}`,
      on: { mouseenter: () => focus(i, true), click: () => activate(i) },
    });
    box.appendChild(b);
    return b;
  });
  function focus(i, sound = true) {
    if (i === sel && btns[i].classList.contains('sel')) return;
    sel = i;
    btns.forEach((b, j) => b.classList.toggle('sel', j === i));
    if (sound) ctx.sfx('mover');
  }
  function activate(i) {
    const it = items[i];
    if (!it || it.disabled) return;
    focus(i, false);
    ctx.sfx('clique');
    btns[i].classList.remove('press'); void btns[i].offsetWidth; btns[i].classList.add('press');
    it.action();
  }
  focus(sel, false);
  return {
    el: box,
    onKey(code) {
      if (code === 'ArrowUp' || code === 'KeyW') { focus((sel - 1 + btns.length) % btns.length); return true; }
      if (code === 'ArrowDown' || code === 'KeyS') { focus((sel + 1) % btns.length); return true; }
      if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space' || code === 'KeyE') { activate(sel); return true; }
      return false;
    },
    focus,
  };
}

export function createMenus(ctx) {
  const { game } = ctx;

  // ==========================================================================================
  // Carregamento
  const SLOTS = 12;
  const loading = el('div', 'mo-loading', { html: `
    <div class="mo-ld-sky"></div>
    ${titleHTML()}
    <div class="mo-ld-sub">um reino que pisca pra você</div>
    <div class="mo-ld-stage">
      <div class="mo-ld-quim">${quimSVG()}</div>
      <div class="mo-ld-pin">${pincesoSVG()}</div>
      <div class="mo-ld-shadow q"></div><div class="mo-ld-shadow p"></div>
    </div>
    <div class="mo-ld-bar">${Array.from({ length: SLOTS }, (_, i) => `<span class="slot" style="--i:${i}">${jujubaSVG(JUJUBA_COLORS[i % JUJUBA_COLORS.length])}</span>`).join('')}</div>
    <div class="mo-ld-step"></div>
    <div class="mo-ld-tip"><b>Dica:</b> <span></span></div>` });
  loading.prepend(clouds(6));
  const slots = [...loading.querySelectorAll('.slot')];
  const stepEl = loading.querySelector('.mo-ld-step');
  const tipEl = loading.querySelector('.mo-ld-tip span');
  const tipBox = loading.querySelector('.mo-ld-tip');
  let tipTimer = 0, tipIdx = Math.floor(Math.random() * Math.max(1, TIPS.length)), loadingShown = false;

  function nextTip() {
    if (!TIPS.length) return;
    tipBox.classList.add('swap');
    setTimeout(() => {
      tipIdx = (tipIdx + 1) % TIPS.length;
      tipEl.textContent = TIPS[tipIdx];
      tipBox.classList.remove('swap');
    }, 350);
  }
  function showLoading(p, text) {
    if (!loadingShown) {
      loadingShown = true;
      ctx.root.appendChild(loading);
      tipEl.textContent = TIPS[tipIdx] || '';
      tipTimer = setInterval(nextTip, 3000);
      requestAnimationFrame(() => loading.classList.add('show'));
    }
    const filled = Math.round(Math.max(0, Math.min(1, p)) * SLOTS);
    slots.forEach((s, i) => s.classList.toggle('on', i < filled));
    if (text) stepEl.textContent = text;
  }
  function hideLoading() {
    clearInterval(tipTimer);
    loading.classList.add('out');
    setTimeout(() => { loading.remove(); loadingShown = false; loading.classList.remove('out', 'show'); }, 800);
  }

  // ==========================================================================================
  // Painéis genéricos (opções, controles, créditos) — abrem por cima do menu ou da pausa.
  function panel(title, contentEl, { cls = '', onClose } = {}) {
    return new Promise((resolve) => {
      const back = el('button', 'mo-btn small back', { html: '<span class="lb">Voltar</span>' });
      const p = el('div', 'mo-overlay mo-panel-wrap ' + cls, {},
        el('div', 'mo-panel', {}, el('h2', 'mo-panel-title', { text: title }), contentEl, el('div', 'mo-panel-foot', {}, back)));
      const layer = {
        name: 'panel',
        onKey(code) {
          if (contentEl._onKey?.(code)) return true;
          if (code === 'Escape' || code === 'Enter' || code === 'NumpadEnter') close();
          return true;
        },
      };
      function close() {
        ctx.sfx('clique');
        ctx.pop(layer);
        p.classList.add('out');
        setTimeout(() => p.remove(), 260);
        onClose?.();
        resolve();
      }
      back.addEventListener('click', close);
      ctx.root.appendChild(p);
      requestAnimationFrame(() => p.classList.add('show'));
      ctx.push(layer);
    });
  }

  function optionsContent() {
    const st = game.state.settings || (game.state.settings = { music: 0.6, sfx: 0.8, quality: 'media' });
    const rows = [];
    const apply = () => {
      game.audio?.setVolumes?.({ music: st.music, sfx: st.sfx });
      game.render?.setQuality?.(st.quality);
      game.world?.setQuality?.(st.quality);
    };
    function slider(key, label, icon) {
      const input = el('input', 'mo-slider', { attrs: { type: 'range', min: '0', max: '100', step: '5', value: String(Math.round((st[key] ?? 0.7) * 100)) } });
      const val = el('span', 'mo-opt-val', { text: `${input.value}%` });
      const paint = () => { input.style.setProperty('--v', `${input.value}%`); val.textContent = `${input.value}%`; };
      input.addEventListener('input', () => { st[key] = Number(input.value) / 100; paint(); apply(); });
      input.addEventListener('change', () => { ctx.sfx(key === 'sfx' ? 'jujuba' : 'clique'); input.blur(); }); // sem foco: as setas ficam só com a UI
      paint();
      const row = el('div', 'mo-opt-row', {}, el('span', 'mo-opt-label', { html: `<span class="ic">${icon}</span>${label}` }), input, val);
      row._step = (d) => { input.value = String(Math.max(0, Math.min(100, Number(input.value) + d * 5))); st[key] = Number(input.value) / 100; paint(); apply(); ctx.sfx('mover'); };
      return row;
    }
    function quality() {
      const opts = [['baixa', 'Leve'], ['media', 'Média'], ['alta', 'Caprichada']];
      const seg = el('div', 'mo-seg');
      const btns = opts.map(([id, lb]) => {
        const b = el('button', 'mo-seg-btn', { text: lb, on: { click: () => set(id) } });
        seg.appendChild(b);
        return b;
      });
      function set(id) {
        st.quality = id;
        btns.forEach((b, i) => b.classList.toggle('on', opts[i][0] === id));
        ctx.sfx('clique');
        apply();
      }
      btns.forEach((b, i) => b.classList.toggle('on', opts[i][0] === st.quality));
      const row = el('div', 'mo-opt-row', {}, el('span', 'mo-opt-label', { html: '<span class="ic">✨</span>Gráficos' }), seg,
        el('span', 'mo-opt-val small', { text: '' }));
      row._step = (d) => { const i = opts.findIndex((o) => o[0] === st.quality); set(opts[Math.max(0, Math.min(2, i + d))][0]); };
      return row;
    }
    rows.push(slider('music', 'Música', '🎵'), slider('sfx', 'Efeitos', '🔔'), quality());
    const box = el('div', 'mo-options', {}, ...rows,
      el('p', 'mo-opt-note', { text: '“Caprichada” liga sombras mais macias e brilho de ambiente. Se o jogo ficar lentinho, escolha “Leve”.' }));
    let sel = 0;
    const mark = () => rows.forEach((r, i) => r.classList.toggle('sel', i === sel));
    mark();
    rows.forEach((r, i) => r.addEventListener('mouseenter', () => { sel = i; mark(); }));
    box._onKey = (code) => {
      if (code === 'ArrowUp' || code === 'KeyW') { sel = (sel + rows.length - 1) % rows.length; mark(); ctx.sfx('mover'); return true; }
      if (code === 'ArrowDown' || code === 'KeyS') { sel = (sel + 1) % rows.length; mark(); ctx.sfx('mover'); return true; }
      if (code === 'ArrowLeft' || code === 'KeyA') { rows[sel]._step(-1); return true; }
      if (code === 'ArrowRight' || code === 'KeyD') { rows[sel]._step(1); return true; }
      return false;
    };
    return box;
  }
  const openOptions = () => panel('Opções', optionsContent(), { cls: 'options' });

  function controlsContent() {
    const keys = [
      [['W', 'A', 'S', 'D'], 'Andar (ou as setinhas)'], [['Shift'], 'Correr'], [['Espaço'], 'Pular · segure no ar para planar (com o Pinceso)'],
      [['E'], 'Conversar · pegar · interagir'], [['Q'], 'Voo de Busca do Pinceso'], [['Tab'], 'Diário da Quim'],
      [['M'], 'Mapa do reino'], [['Esc'], 'Pausa'], [['🖱️'], 'Girar a câmera · rodinha = zoom'],
    ];
    return el('div', 'mo-controls', { html: keys.map(([ks, d]) =>
      `<div class="row"><span class="keys">${ks.map((k) => `<kbd>${esc(k)}</kbd>`).join('')}</span><span class="d">${esc(d)}</span></div>`).join('') });
  }
  const openControls = () => panel('Controles', controlsContent(), { cls: 'controls' });

  function creditsContent() {
    return el('div', 'mo-credits', { html: `
      <div class="mo-cr-art">${quimSVG({ mood: 'feliz' })}${pincesoSVG()}</div>
      <p class="big">Mundo Olhos</p>
      <p>Uma aventura sobre devolver as cores a um reino sonolento, uma gentileza de cada vez.</p>
      <div class="mo-cr-grid">
        <div><b>Quim</b><span>a menina mais acordada do reino</span></div>
        <div><b>Pinceso</b><span>guarda-costas oficial dos cachinhos</span></div>
        <div><b>Feito de código</b><span>modelos, música, sons e mapa — tudo gerado na hora, sem nenhuma imagem baixada</span></div>
        <div><b>Motor 3D</b><span>Three.js</span></div>
      </div>
      <p class="small">Obrigada por jogar! Todo mundo aqui está te olhando com carinho. 👀💚</p>` });
  }
  const openCredits = () => panel('Créditos', creditsContent(), { cls: 'credits' });

  // ==========================================================================================
  // Menu principal
  function showMenu({ hasSave = false } = {}) {
    return new Promise((resolve) => {
      const wrap = el('div', 'mo-menu');
      const unlockAudio = () => game.audio?.init?.();
      wrap.addEventListener('pointerdown', unlockAudio);
      let done = false;
      const finish = async (v) => {
        if (done) return;
        done = true;
        unlockAudio();
        ctx.pop(layer);
        wrap.classList.add('out');
        await wait(550);
        wrap.remove();
        resolve(v);
      };
      const items = [];
      if (hasSave) items.push({ label: 'Continuar', icon: '💚', sub: 'de onde você parou', cls: 'primary', action: () => finish('continue') });
      items.push({
        label: hasSave ? 'Novo jogo' : 'Jogar', icon: '🌼', sub: hasSave ? 'começar do comecinho' : 'acordar o reino', cls: hasSave ? '' : 'primary',
        action: async () => {
          if (!hasSave) return finish('new');
          const k = await ctx.choice({ speaker: 'quim', text: 'Começar uma aventura novinha? O progresso salvo vai sumir!', mood: 'surpresa' },
            ['Sim, começar do zero!', 'Não, deixa como está']);
          if (k === 0) finish('new');
        },
      });
      items.push({ label: 'Opções', icon: '⚙️', action: () => openOptions() });
      items.push({ label: 'Créditos', icon: '💌', action: () => openCredits() });
      const list = buttonList(ctx, items, { cls: 'menu' });
      wrap.append(
        el('div', 'mo-menu-glow'),
        el('div', 'mo-menu-left', { html: `${titleHTML()}<div class="mo-menu-sub">um reino que pisca pra você</div>` }, list.el),
        el('div', 'mo-menu-art', { html: `<div class="q">${quimSVG()}</div><div class="p">${pincesoSVG()}</div>` }),
        el('div', 'mo-menu-foot', { html: '<span>↑ ↓ escolher · Enter confirmar</span><span>feito de código e carinho</span>' }),
      );
      const layer = { name: 'menu', onKey: (code) => { unlockAudio(); list.onKey(code); return true; } };
      ctx.root.appendChild(wrap);
      requestAnimationFrame(() => wrap.classList.add('show'));
      ctx.push(layer);
    });
  }

  // ==========================================================================================
  // Pausa
  let pauseOpen = false;
  function openPause() {
    if (pauseOpen) return;
    pauseOpen = true;
    const s = game.state || {};
    const mins = Math.floor((s.playTime || 0) / 60);
    const wrap = el('div', 'mo-overlay mo-pause');
    const close = () => {
      if (!pauseOpen) return;
      pauseOpen = false;
      ctx.pop(layer);
      wrap.classList.add('out');
      setTimeout(() => wrap.remove(), 260);
    };
    const toMenu = async () => {
      const k = await ctx.choice({ speaker: 'quim', text: 'Voltar ao menu? Eu guardo tudo direitinho antes!', mood: 'curiosa' }, ['Sim, voltar ao menu', 'Não, continuar brincando']);
      if (k !== 0) return;
      try { window.__save ? window.__save() : null; } catch (e) { console.error(e); }
      await ctx.fade(true, 500);
      const q = new URLSearchParams(location.search);
      q.delete('skip');
      const qs = q.toString();
      location.href = location.pathname + (qs ? '?' + qs : '');
    };
    const list = buttonList(ctx, [
      { label: 'Continuar', icon: '💖', cls: 'primary', action: close },
      { label: 'Opções', icon: '⚙️', action: () => openOptions() },
      { label: 'Controles', icon: '⌨️', action: () => openControls() },
      { label: 'Voltar ao menu', icon: '🏠', action: toMenu },
    ]);
    wrap.append(el('div', 'mo-panel mo-pause-panel', { html: `
      <div class="mo-pause-art">${quimSVG({ mood: 'sono', head: true })}<span class="zz">z<small>z</small></span></div>
      <h2 class="mo-panel-title">Pausinha</h2>
      <div class="mo-pause-stats"><span>${jujubaSVG('#ff6fa8')} ${s.jujubas ?? 0}</span><span>⏱ ${mins} min</span><span>📜 ${Object.values(s.missions || {}).filter((m) => m.status === 'done').length} missões</span></div>` }, list.el));
    const layer = {
      name: 'pause', pauses: true,
      onKey(code) {
        if (code === 'Escape') { ctx.sfx('clique'); close(); return true; }
        list.onKey(code);
        return true;
      },
    };
    ctx.root.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add('show'));
    ctx.push(layer);
  }

  return { showLoading, hideLoading, showMenu, openPause, openOptions, openControls, openCredits, get pauseOpen() { return pauseOpen; } };
}
