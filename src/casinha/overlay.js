// Textos das cenas da casinha: mensagem grande letra a letra, nome de quem chega, falinhas e título.
const LETTER_MS = 62;

function letters(text) {
  let i = 0;
  return text.split(' ').map((w) => `<span class="w">${[...w].map((ch) => `<span class="c" style="--i:${i++}">${ch}</span>`).join('')}</span>`).join(' ');
}

export function createOverlay() {
  const root = document.createElement('div');
  root.className = 'mo-asas';
  root.innerHTML = `
    <div class="bar top"></div><div class="bar bottom"></div>
    <div class="big"></div>
    <div class="name"></div>
    <div class="line"><b></b><span></span></div>
    <div class="title"><h2></h2><p></p></div>
    <div class="skip"><i></i><span>segure Espaço para pular</span></div>`;
  (document.querySelector('.mo-ui') || document.body).appendChild(root);
  const $ = (s) => root.querySelector(s);
  const big = $('.big'), name = $('.name'), line = $('.line'), title = $('.title'), skip = $('.skip');

  return {
    bars(on) { root.classList.toggle('cine', on); },
    /** Escreve a mensagem e espera a última letra aparecer. */
    big(text, wait) {
      big.classList.remove('out');
      big.innerHTML = letters(text);
      return wait(text.length * LETTER_MS + 500);
    },
    clearBig() { big.classList.add('out'); },
    name(text) {
      name.classList.remove('on');
      if (!text) return;
      name.textContent = text;
      void name.offsetWidth;   // reinicia a transição
      name.classList.add('on');
    },
    say(who, text, wait) {
      line.classList.remove('on');
      if (!who) return Promise.resolve();
      line.querySelector('b').textContent = who;
      line.querySelector('span').textContent = text;
      void line.offsetWidth;
      line.classList.add('on');
      return wait ? wait(600) : Promise.resolve();
    },
    title(t, sub) {
      title.classList.toggle('on', !!t);
      if (!t) return;
      title.querySelector('h2').textContent = t;
      title.querySelector('p').textContent = sub;
    },
    skip(k) {
      skip.classList.toggle('on', k > 0);
      skip.querySelector('i').style.width = `${Math.min(1, k) * 100}%`;
    },
    clear() {
      root.classList.remove('cine');
      big.innerHTML = '';
      name.classList.remove('on');
      line.classList.remove('on');
      title.classList.remove('on');
      skip.classList.remove('on');
    },
  };
}
