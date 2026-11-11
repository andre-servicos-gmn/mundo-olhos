// Minigame "O Coral da Floresta": memória musical. Os passarinhos cantam uma sequência que cresce a cada
// rodada; a Quim repete (teclas 1–5 ou clique). Promise<bool>: true = venceu, false = errou/desistiu.
import { LANDMARKS } from '../data/worldmap.js';
import { el, wait } from './dom.js';
import { birdSVG } from './art.js';

const NOTE_NAMES = ['Dó', 'Ré', 'Mi', 'Fá', 'Sol'];
const FALLBACK = ['#ff7aa8', '#ffd23f', '#8ef0c0', '#6ec6ff', '#c792ff'];

export function createCoral(ctx) {
  const { game } = ctx;

  function minigameCoral({ rounds = 5, notas = [], onNote } = {}) {
    return new Promise((resolve) => {
      const colors = FALLBACK.map((c, i) => LANDMARKS.find((l) => l.id === notas[i])?.data?.cor
        || LANDMARKS.find((l) => l.id === `coral_nota_${i + 1}`)?.data?.cor || c);
      const wrap = el('div', 'mo-overlay mo-coral');
      const status = el('div', 'mo-coral-status', { text: 'Escuta só...' });
      const dots = el('div', 'mo-coral-dots', { html: Array.from({ length: rounds }, () => '<i></i>').join('') });
      const birds = colors.map((c, i) => {
        const b = el('button', 'mo-coral-bird', { html: `${birdSVG(c)}<span class="nm">${NOTE_NAMES[i]}</span><kbd>${i + 1}</kbd>`, style: { '--c': c, '--i': i } });
        b.addEventListener('click', () => press(i));
        return b;
      });
      const giveUp = el('button', 'mo-btn small', { html: '<span class="lb">Desistir</span><small>Esc</small>', on: { click: () => end(false) } });
      wrap.append(el('div', 'mo-coral-stage', {},
        el('div', 'mo-coral-head', { html: '<span class="t">♪ Coral da Floresta ♪</span>' }, dots),
        status,
        el('div', 'mo-coral-birds', {}, ...birds),
        el('div', 'mo-coral-foot', {}, el('span', 'hint', { text: 'Repita a melodia: teclas 1 a 5 ou clique nos passarinhos' }), giveUp)));

      // sequência sem três notas iguais seguidas
      const seq = [];
      while (seq.length < rounds) {
        const n = Math.floor(Math.random() * 5);
        if (seq.length >= 2 && seq[seq.length - 1] === n && seq[seq.length - 2] === n) continue;
        seq.push(n);
      }
      let round = 0, pos = 0, listening = false, finished = false;

      function sing(i, ms = 420) {
        if (onNote) onNote(i); else game.audio?.note?.(i);
        const b = birds[i];
        b.classList.remove('sing'); void b.offsetWidth; b.classList.add('sing');
        const n = el('span', 'mo-coral-note', { text: ['♪', '♫', '♩'][Math.floor(Math.random() * 3)] });
        b.appendChild(n);
        setTimeout(() => n.remove(), 1000);
        setTimeout(() => b.classList.remove('sing'), ms);
      }
      async function playRound() {
        listening = false;
        wrap.classList.remove('your-turn');
        status.textContent = round === 0 ? 'Escuta só...' : 'Mais uma nota! Escuta...';
        await wait(700);
        const gap = Math.max(380, 640 - round * 50);
        for (let k = 0; k <= round; k++) {
          if (finished) return;
          sing(seq[k], gap * 0.7);
          await wait(gap);
        }
        if (finished) return;
        pos = 0;
        listening = true;
        wrap.classList.add('your-turn');
        status.textContent = 'Sua vez! ♪';
      }
      async function press(i) {
        if (!listening || finished) return;
        sing(i, 300);
        if (i !== seq[pos]) {
          listening = false;
          birds[i].classList.add('wrong');
          status.textContent = 'Ops! Desafinou um pouquinho...';
          wrap.classList.add('fail');
          await wait(1300);
          end(false);
          return;
        }
        pos++;
        if (pos > round) {
          listening = false;
          dots.children[round]?.classList.add('on');
          round++;
          if (round >= rounds) {
            status.textContent = 'Que coral lindo! Os passarinhos aplaudem!';
            wrap.classList.add('win');
            game.audio?.play?.('brilho');
            await wait(1600);
            end(true);
            return;
          }
          status.textContent = ['Isso!', 'Lindo!', 'Afinadíssima!', 'Uii, que voz!'][round % 4];
          await wait(650);
          playRound();
        }
      }
      function end(v) {
        if (finished) return;
        finished = true;
        ctx.pop(layer);
        wrap.classList.add('out');
        setTimeout(() => wrap.remove(), 400);
        resolve(v);
      }
      const layer = {
        name: 'coral',
        onKey(code) {
          if (code === 'Escape') end(false);
          const m = /^(Digit|Numpad)([1-5])$/.exec(code);
          if (m) press(Number(m[2]) - 1);
          return true;
        },
      };
      ctx.root.appendChild(wrap);
      ctx.push(layer);
      requestAnimationFrame(() => wrap.classList.add('show'));
      playRound();
    });
  }

  return { minigameCoral };
}
