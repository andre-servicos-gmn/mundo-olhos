// Cafeteria Nuvem de Leite (cardápio) e Laços & Cachos (vitrine de acessórios).
import { el, esc } from './dom.js';
import { cupSVG, accessorySVG, jujubaSVG, quimSVG } from './art.js';

// Onde cada acessório fica sobre a Quim do espelho (em % da caixa do retrato).
const ACC_POS = {
  laco: 'left:58%;top:-2%;width:38%;transform:rotate(18deg)',
  chapeu: 'left:12%;top:-14%;width:76%',
  cachecol: 'left:22%;top:56%;width:56%',
  oculos: 'left:22%;top:38%;width:56%',
  tiara_penas: 'left:20%;top:-10%;width:60%',
  coroa_flores: 'left:14%;top:-4%;width:72%',
};

/** Lista navegável comum aos dois: seleção por teclado/mouse, Esc fecha. */
function grid(ctx, count, cols, onSel) {
  let sel = 0;
  return {
    get sel() { return sel; },
    set(i, sound = true) { if (i === sel) return; sel = (i + count) % count; if (sound) ctx.sfx('mover'); onSel(sel); },
    key(code) {
      if (code === 'ArrowUp' || code === 'KeyW') this.set(sel - cols);
      else if (code === 'ArrowDown' || code === 'KeyS') this.set(sel + cols);
      else if (cols > 1 && (code === 'ArrowLeft' || code === 'KeyA')) this.set(sel - 1);
      else if (cols > 1 && (code === 'ArrowRight' || code === 'KeyD')) this.set(sel + 1);
      else return false;
      return true;
    },
  };
}

export function createShops(ctx) {
  const { game } = ctx;
  const balance = () => game.state?.jujubas ?? 0;

  // ==========================================================================================
  function openCafe(drinks = [], opts = {}) {
    return new Promise((resolve) => {
      const free = !!opts.free;
      const wrap = el('div', 'mo-overlay mo-cafe');
      const rows = drinks.map((d, i) => {
        const price = free ? 0 : (d.price ?? 0);
        const r = el('div', 'mo-cafe-item', { html: `
          <div class="cup">${cupSVG(d.color || '#ffb3c7')}</div>
          <div class="txt"><b>${esc(d.name)}</b><span>${esc(d.description || '')}</span>${d.tried ? '<em>♥ já provei</em>' : ''}</div>
          <div class="price">${free ? '<span class="free">cortesia!</span>' : `${jujubaSVG('#ff6fa8')}<b>${price}</b>`}</div>` });
        r.addEventListener('mouseenter', () => nav.set(i, false));
        r.addEventListener('click', () => { nav.set(i, false); order(); });
        return r;
      });
      const msg = el('div', 'mo-cafe-msg');
      const bal = el('div', 'mo-cafe-bal');
      const btnOrder = el('button', 'mo-btn primary', { html: '<span class="lb">Pedir</span>', on: { click: () => order() } });
      const btnLeave = el('button', 'mo-btn', { html: '<span class="lb">Só olhar</span><small>Esc</small>', on: { click: () => finish(null) } });
      wrap.append(
        el('div', 'mo-cafe-lofi', { html: '<span class="eq"><i></i><i></i><i></i><i></i></span> tocando: <b>lo-fi de nuvem</b>' }),
        el('div', 'mo-cafe-card', {},
          el('div', 'mo-cafe-head', { html: `<div class="logo">☁</div><div><div class="t">Nuvem de Leite</div><div class="s">cafeteria · desde sempre · com carinho</div></div>` }),
          el('div', 'mo-cafe-list', {}, ...rows),
          msg,
          el('div', 'mo-cafe-foot', {}, bal, el('div', 'btns', {}, btnLeave, btnOrder))));
      const nav = grid(ctx, rows.length || 1, 1, () => paint());
      function paint() {
        rows.forEach((r, i) => r.classList.toggle('sel', i === nav.sel));
        const d = drinks[nav.sel];
        const price = free ? 0 : (d?.price ?? 0);
        const can = !!d && balance() >= price;
        rows.forEach((r, i) => r.classList.toggle('poor', !free && balance() < (drinks[i].price ?? 0)));
        bal.innerHTML = `${jujubaSVG('#ffd23f')} Você tem <b>${balance()}</b> jujubas`;
        btnOrder.classList.toggle('disabled', !can);
        msg.textContent = !d ? '' : can ? (free ? 'A primeira é por conta da prefeitura!' : '') : `Faltam ${price - balance()} jujubas para esse...`;
      }
      function order() {
        const d = drinks[nav.sel];
        if (!d) return;
        const price = free ? 0 : (d.price ?? 0);
        if (balance() < price) {
          ctx.sfx('mover');
          rows[nav.sel].classList.remove('shake'); void rows[nav.sel].offsetWidth; rows[nav.sel].classList.add('shake');
          return;
        }
        ctx.sfx('clique');
        finish(d.id);
      }
      let done = false;
      function finish(v) {
        if (done) return;
        done = true;
        ctx.pop(layer);
        wrap.classList.add('out');
        setTimeout(() => wrap.remove(), 400);
        resolve(v);
      }
      const layer = {
        name: 'cafe',
        onKey(code) {
          if (code === 'Escape') finish(null);
          else if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space' || code === 'KeyE') order();
          else nav.key(code);
          return true;
        },
      };
      ctx.root.appendChild(wrap);
      paint();
      ctx.push(layer);
      requestAnimationFrame(() => wrap.classList.add('show'));
    });
  }

  // ==========================================================================================
  // Vitrine. opts: { jujubas, buy(id), equip(id) }. Com os callbacks, a UI compra/equipa ali mesmo e só
  // devolve null ao fechar; sem eles, devolve { action:'buy'|'equip', id } para quem chamou resolver.
  function openShop(items = [], opts = {}) {
    return new Promise((resolve) => {
      const wrap = el('div', 'mo-overlay mo-shop');
      const mirrorAcc = el('div', 'mo-mirror-acc');
      const mirror = el('div', 'mo-mirror', {}, el('div', 'glass', { html: quimSVG({ mood: 'feliz', head: true }) }, mirrorAcc), el('div', 'cap', { text: 'espelhinho' }));
      const info = el('div', 'mo-shop-info');
      const accState = () => game.state?.accessories || { owned: {}, equipped: null };
      const owned = (it) => !!(accState().owned?.[it.id] ?? it.owned);
      const equipped = (it) => (game.state?.accessories ? accState().equipped === it.id : !!it.equipped);
      const cards = items.map((it, i) => {
        const c = el('div', 'mo-shop-card');
        c.addEventListener('mouseenter', () => nav.set(i, false));
        c.addEventListener('click', () => { nav.set(i, false); act(); });
        return c;
      });
      const bal = el('div', 'mo-cafe-bal');
      const btnAct = el('button', 'mo-btn primary', { html: '<span class="lb">Comprar</span>', on: { click: () => act() } });
      const btnLeave = el('button', 'mo-btn', { html: '<span class="lb">Sair da loja</span><small>Esc</small>', on: { click: () => finish(null) } });
      wrap.append(el('div', 'mo-shop-box', {},
        el('div', 'mo-shop-head', { html: '<div class="awn"></div><div class="t">Laços &amp; Cachos</div><div class="s">acessórios para cabelos com personalidade</div>' }),
        el('div', 'mo-shop-body', {}, mirror, el('div', 'mo-shop-shelf', {}, ...cards)),
        info,
        el('div', 'mo-cafe-foot', {}, bal, el('div', 'btns', {}, btnLeave, btnAct))));
      const cols = Math.min(3, Math.max(1, items.length));
      const nav = grid(ctx, items.length || 1, cols, () => paint());

      function paint() {
        items.forEach((it, i) => {
          const o = owned(it), e = equipped(it);
          cards[i].className = 'mo-shop-card' + (i === nav.sel ? ' sel' : '') + (o ? ' owned' : '') + (e ? ' eq' : '') + (!o && balance() < (it.price ?? 0) ? ' poor' : '');
          cards[i].innerHTML = `<div class="cushion">${accessorySVG(it.id)}</div><b>${esc(it.name)}</b>
            <div class="tag">${e ? '✓ usando' : o ? 'é seu!' : `${jujubaSVG('#ff6fa8')}${it.price ?? 0}`}</div>`;
        });
        const it = items[nav.sel];
        bal.innerHTML = `${jujubaSVG('#ffd23f')} Você tem <b>${balance()}</b> jujubas`;
        if (!it) { info.textContent = 'A vitrine está vazinha hoje...'; btnAct.classList.add('disabled'); return; }
        const o = owned(it), e = equipped(it), price = it.price ?? 0;
        info.innerHTML = `<b>${esc(it.name)}</b> — ${esc(it.description || '')}${!o && balance() < price ? ` <em>Faltam ${price - balance()} jujubas.</em>` : ''}`;
        btnAct.querySelector('.lb').textContent = e ? 'Tirar' : o ? 'Usar' : `Comprar · ${price}`;
        btnAct.classList.toggle('disabled', !o && balance() < price);
        mirrorAcc.innerHTML = accessorySVG(it.id);
        mirrorAcc.setAttribute('style', ACC_POS[it.id] || ACC_POS.laco);
      }
      function act() {
        const it = items[nav.sel];
        if (!it) return;
        const o = owned(it);
        if (!o && balance() < (it.price ?? 0)) {
          ctx.sfx('mover');
          cards[nav.sel].classList.remove('shake'); void cards[nav.sel].offsetWidth; cards[nav.sel].classList.add('shake');
          return;
        }
        const action = o ? 'equip' : 'buy';
        const fn = action === 'buy' ? (opts.buy || it.buy) : (opts.equip || it.equip);
        if (!fn) { finish({ action, id: it.id }); return; }
        const ok = fn(it.id);
        if (ok !== false) {
          if (action === 'buy') { cards[nav.sel].classList.remove('pop'); void cards[nav.sel].offsetWidth; cards[nav.sel].classList.add('pop'); }
        }
        paint();
      }
      let done = false;
      function finish(v) {
        if (done) return;
        done = true;
        ctx.pop(layer);
        wrap.classList.add('out');
        setTimeout(() => wrap.remove(), 400);
        resolve(v);
      }
      const layer = {
        name: 'shop',
        onKey(code) {
          if (code === 'Escape') finish(null);
          else if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space' || code === 'KeyE') act();
          else nav.key(code);
          return true;
        },
      };
      ctx.root.appendChild(wrap);
      paint();
      ctx.push(layer);
      ctx.sfx('porta');
      requestAnimationFrame(() => wrap.classList.add('show'));
    });
  }

  return { openCafe, openShop };
}
