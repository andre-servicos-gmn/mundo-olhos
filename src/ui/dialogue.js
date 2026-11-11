// Caixa de diálogo (texto letra a letra com murmurinhos) e escolhas navegáveis.
// Line = { speaker, text, mood? } (também aceita string = narrador). Entradas sem texto (ex.: CameraBeat) são puladas.
import { CAST, NPCS } from '../data/story.js';
import { el, esc } from './dom.js';
import { portraitHTML } from './art.js';

const NPC_BY_ID = new Map(NPCS.map((n) => [n.id, n]));
const DEFAULT_VOICE = { pitch: 1, speed: 1, timbre: 'suave' };
const NAME_COLORS = { quim: '#ff8fc7', pinceso: '#7fd04a' };

function speakerInfo(game, id) {
  if (!id || id === 'narrador') return { id: 'narrador', name: '', voice: CAST.narrador?.voice || DEFAULT_VOICE, narrator: true };
  if (CAST[id]) return { id, name: CAST[id].name, voice: CAST[id].voice || DEFAULT_VOICE, def: null };
  const def = NPC_BY_ID.get(id) || game.npcs?.get?.(id)?.def || game.casinha?.def?.(id);
  if (def) return { id, name: def.name, voice: def.voice || DEFAULT_VOICE, def };
  const pretty = String(id).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return { id, name: pretty, voice: DEFAULT_VOICE, def: null };
}

export function createDialogue(ctx) {
  const { game } = ctx;
  const box = el('div', 'mo-dialogue');
  const portrait = el('div', 'mo-dlg-portrait');
  const name = el('div', 'mo-dlg-name');
  const text = el('div', 'mo-dlg-text');
  const next = el('div', 'mo-dlg-next', { text: '▼' });
  const choices = el('div', 'mo-dlg-choices');
  const body = el('div', 'mo-dlg-body', {}, name, text, choices, next);
  box.append(portrait, body);
  ctx.root.appendChild(box);
  box.addEventListener('click', () => current?.onKey('Click'));

  let current = null;       // layer ativa (diálogo ou escolha)

  // ------------------------------------------------------------------------------------------
  // Datilografia: revela o texto aos poucos e toca o murmurinho de quem fala.
  function typer(line, info, onDone) {
    const full = String(line.text ?? '');
    const speed = (info.voice?.speed ?? 1) * (info.narrator ? 34 : 40);
    let shown = 0, acc = 0, pause = 0, raf = 0, last = performance.now(), done = false;
    text.textContent = '';
    const span = el('span', 'typed');
    const rest = el('span', 'rest', { text: full });     // reserva o espaço (o box não "pula" de tamanho)
    text.append(span, rest);
    function finish() {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      span.textContent = full; rest.textContent = '';
      onDone();
    }
    function tick(now) {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (pause > 0) pause -= dt;
      else {
        acc += dt * speed;
        while (acc >= 1 && shown < full.length) {
          acc -= 1;
          const ch = full[shown++];
          if (ch.trim()) game.audio?.murmur?.(info.voice, ch);
          if ('.!?…'.includes(ch) && full[shown] === ' ') { pause = 0.22; acc = 0; break; }
          if (ch === ',' || ch === ';') { pause = 0.09; acc = 0; break; }
        }
        span.textContent = full.slice(0, shown);
        rest.textContent = full.slice(shown);
      }
      if (shown >= full.length) finish();
      else raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return { finish, get done() { return done; } };
  }

  function showSpeaker(line) {
    const info = speakerInfo(game, line.speaker);
    box.classList.toggle('narrator', !!info.narrator);
    box.classList.toggle('no-portrait', !!info.narrator);
    portrait.innerHTML = info.narrator ? '' : portraitHTML(info.id, info.def, line.mood);
    name.textContent = info.name;
    name.style.setProperty('--nc', NAME_COLORS[info.id] || info.def?.look?.outfit || '#c9b6ff');
    if (info.id === 'quim' && line.mood) game.player?.setMood?.(line.mood === 'triste' ? 'triste' : line.mood, 3);
    portrait.firstElementChild?.classList.add('talk');
    return info;
  }

  function open() {
    box.classList.remove('out');
    box.classList.add('show');
  }
  function close() {
    box.classList.remove('show');
    box.classList.add('out');
  }

  // ------------------------------------------------------------------------------------------
  function dialogue(lines) {
    const list = (Array.isArray(lines) ? lines : [lines])
      .map((l) => (typeof l === 'string' ? { speaker: 'narrador', text: l } : l))
      .filter((l) => l && l.text);
    if (!list.length) return Promise.resolve();
    return new Promise((resolve) => {
      let i = -1, t = null;
      choices.innerHTML = '';
      box.classList.remove('choosing');
      const layer = {
        name: 'dialogue', keepPointer: true,
        onKey(code) {
          if (!['KeyE', 'Space', 'Enter', 'NumpadEnter', 'Click'].includes(code)) return code !== 'Escape';
          if (t && !t.done) { t.finish(); return true; }
          advance();
          return true;
        },
      };
      function advance() {
        i++;
        if (i >= list.length) {
          ctx.pop(layer);
          current = null;
          close();
          game.bus?.emit('dialogue:close');
          resolve();
          return;
        }
        if (i > 0) game.audio?.play?.('dialogo');
        const line = list[i];
        const info = showSpeaker(line);
        next.classList.remove('show');
        t = typer(line, info, () => {
          next.classList.add('show');
          portrait.firstElementChild?.classList.remove('talk');
        });
      }
      current = layer;
      ctx.push(layer);
      game.bus?.emit('dialogue:open', { lines: list });
      open();
      advance();
    });
  }

  // ------------------------------------------------------------------------------------------
  // Escolha: pergunta (string ou Line) + opções. Setas/W/S navegam, Enter/E/Espaço/1..9 escolhem.
  function choice(question, options = []) {
    const q = typeof question === 'string' ? { speaker: 'narrador', text: question } : (question || { text: '' });
    return new Promise((resolve) => {
      let sel = 0;
      const buttons = options.map((opt, k) => el('button', 'mo-choice', {
        html: `<span class="n">${k + 1}</span><span class="t">${esc(opt)}</span>`,
        on: { mouseenter: () => select(k, false), click: (e) => { e.stopPropagation(); pick(k); } },
      }));
      choices.innerHTML = '';
      choices.append(...buttons);
      box.classList.add('choosing');
      const layer = {
        name: 'choice',
        onKey(code) {
          if (code === 'ArrowUp' || code === 'KeyW' || code === 'ArrowLeft' || code === 'KeyA') select((sel - 1 + buttons.length) % buttons.length);
          else if (code === 'ArrowDown' || code === 'KeyS' || code === 'ArrowRight' || code === 'KeyD') select((sel + 1) % buttons.length);
          else if (['Enter', 'NumpadEnter', 'Space', 'KeyE'].includes(code)) { if (t && !t.done) t.finish(); else pick(sel); }
          else if (/^(Digit|Numpad)[1-9]$/.test(code)) { const k = Number(code.slice(-1)) - 1; if (k < buttons.length) pick(k); }
          return true;
        },
      };
      function select(k, sound = true) {
        if (k === sel && buttons[k]?.classList.contains('sel')) return;
        sel = k;
        buttons.forEach((b, j) => b.classList.toggle('sel', j === k));
        if (sound) game.audio?.play?.('mover');
      }
      let picked = false;
      function pick(k) {
        if (picked) return;
        picked = true;
        game.audio?.play?.('clique');
        buttons[k]?.classList.add('picked');
        setTimeout(() => {
          ctx.pop(layer);
          current = null;
          box.classList.remove('choosing');
          choices.innerHTML = '';
          close();
          game.bus?.emit('dialogue:close');
          resolve(k);
        }, 160);
      }
      current = layer;
      ctx.push(layer);
      game.bus?.emit('dialogue:open', { choice: true });
      const info = showSpeaker(q);
      open();
      next.classList.remove('show');
      const t = typer(q, info, () => portrait.firstElementChild?.classList.remove('talk'));
      select(0, false);
    });
  }

  // Falas pedidas enquanto outra conversa está aberta entram na fila (nunca se atropelam).
  let queue = Promise.resolve();
  const enqueue = (fn) => { const p = queue.then(fn); queue = p.catch(() => {}); return p; };
  return {
    dialogue: (lines) => enqueue(() => dialogue(lines)),
    choice: (q, opts) => enqueue(() => choice(q, opts)),
    get active() { return !!current; },
  };
}
