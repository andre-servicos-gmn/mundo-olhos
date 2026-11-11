// Sequenciador de música com lookahead (setTimeout + AudioContext.currentTime) e crossfade.
// O relógio de áudio é a referência; o timer só "acorda" o agendador a cada ~100 ms e
// agenda compassos inteiros que caem dentro da janela de antecipação.
import { SONGS } from './songs.js';
import { vinylLoop, windLoop } from './loops.js';

const LOOKAHEAD = 0.8;   // s agendados à frente
const TICK_MS = 100;
const FADE = 2;          // s de crossfade

export function createMusic(S, I, musicBus, musicWet) {
  const ctx = S.ctx;
  const live = new Set();
  let current = null;
  let timer = null;

  function startInstance(id) {
    const def = SONGS[id];
    if (!def) return null;
    const now = ctx.currentTime;
    // fader seco e fader do reverb (ambos fazem o crossfade juntos)
    const fade = ctx.createGain();
    const fadeWet = ctx.createGain();
    for (const f of [fade, fadeWet]) {           // def.gain equaliza o volume entre as músicas
      f.gain.setValueAtTime(0, now);
      f.gain.linearRampToValueAtTime(def.gain ?? 1, now + FADE);
    }
    let lp = null;
    if (def.lowpass) {              // lo-fi: tudo um pouco abafado
      lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = def.lowpass; lp.Q.value = 0.5;
      fade.connect(lp); lp.connect(musicBus);
    } else fade.connect(musicBus);
    fadeWet.connect(musicWet);

    const spb = 60 / def.bpm;
    const swing = def.swing || 0;
    const swingUnit = def.swingUnit || 8;   // 8 = colcheias, 16 = semicolcheias
    const loops = [];
    const e = {
      I, spb, beats: def.beats, st: {},
      R: { pool: 'music', dest: fade, send: fadeWet, wet: 0.28 },
      // tempo → segundos, com swing: atrasa as subdivisões "de trás" (colcheias ou semicolcheias)
      at(t, b) {
        if (swing) {
          const q = b * (swingUnit / 4);
          const r = Math.round(q);
          if (Math.abs(q - r) < 1e-6 && r % 2 === 1) b += swing;
        }
        return t + b * spb;
      },
      vinyl: () => vinylLoop(ctx, fade, 0.6),
      windLoop: (lvl) => windLoop(ctx, S.noiseBuf, fade, lvl, { bright: 700 }),
    };
    const inst = { id, def, e, fade, fadeWet, lp, loops, n: 0, nextBar: now + 0.08, barDur: def.beats * spb, alive: true };
    try {
      const h = def.start?.(e);
      if (h) loops.push(h);
    } catch (err) { console.error('[audio] música', id, err); }
    live.add(inst);
    return inst;
  }

  function fadeOut(inst) {
    if (!inst || !inst.alive) return;
    inst.alive = false;
    const now = ctx.currentTime;
    for (const f of [inst.fade, inst.fadeWet]) {
      f.gain.cancelScheduledValues(now);
      f.gain.setValueAtTime(f.gain.value, now);
      f.gain.linearRampToValueAtTime(0, now + FADE);
    }
    for (const h of inst.loops) h.stop(FADE);
    // notas já agendadas terminam sozinhas; depois desligamos os faders
    setTimeout(() => {
      live.delete(inst);
      for (const n of [inst.fade, inst.fadeWet, inst.lp]) { try { n?.disconnect(); } catch { /* ok */ } }
    }, (FADE + LOOKAHEAD + 4) * 1000);
  }

  function tick() {
    const now = ctx.currentTime;
    if (ctx.state !== 'running') return;
    for (const inst of live) {
      if (!inst.alive) continue;
      // se o timer atrasou muito (aba em segundo plano), pula compassos perdidos em vez de embolar
      if (inst.nextBar < now - 0.15) inst.nextBar = now + 0.05;
      let guard = 0;
      while (inst.nextBar < now + LOOKAHEAD && guard++ < 4) {
        try { inst.def.bar(inst.e, inst.n, inst.nextBar); } catch (err) { console.error('[audio] compasso', inst.id, err); }
        inst.n++;
        inst.nextBar += inst.barDur;
      }
    }
  }

  return {
    get current() { return current?.id ?? null; },
    /** Troca a música com crossfade. null = silêncio (com fade). */
    play(id) {
      if ((current?.id ?? null) === (id ?? null)) return;
      fadeOut(current);
      current = id ? startInstance(id) : null;
      if (!timer) timer = setInterval(tick, TICK_MS);
      tick();
    },
    /** Parâmetros da música atual (lidos em e.st pelo bar()). */
    params(o) { if (current) Object.assign(current.e.st, o); },
    has: (id) => !!SONGS[id],
    ids: Object.keys(SONGS),
  };
}
