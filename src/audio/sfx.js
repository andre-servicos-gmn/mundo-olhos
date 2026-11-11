// Efeitos sonoros do jogo (game.audio.play(nome)). Todos curtinhos, fofos e sem cliques.
// R = roteamento dos efeitos { pool:'sfx', dest, send, wet }.
import { mtof, rand, pick } from './synth.js';

export function makeSfx(S, I) {
  let stepFlip = 1;            // alterna os passos entre esquerda/direita
  const C6 = 84;               // dó agudo (MIDI)

  const recipes = {
    // "bwip!" elástico subindo
    pulo(R, t) {
      const g = S.group('sfx', R.dest, { send: R.send, sendLevel: 0.08 });
      if (!g) return;
      const k = rand(0.95, 1.08);
      const o = g.osc('sine', t, t + 0.25, [[0, 250 * k], [0.12, 720 * k], [0.2, 660 * k]]);
      const o2 = g.osc('triangle', t, t + 0.25, [[0, 500 * k], [0.12, 1440 * k], [0.2, 1320 * k]]);
      const m2 = g.gain(0.12);
      const a = g.gain();
      g.env(a.gain, t, { a: 0.008, peak: 0.3, hold: 0.06, sus: 0.7, r: 0.12 });
      o.connect(a); o2.connect(m2); m2.connect(a); a.connect(g.out);
    },
    // "pof" macio no chão
    aterrissar(R, t) {
      const g = S.group('sfx', R.dest);
      if (!g) return;
      const n = g.noise(t, t + 0.2);
      const lp = g.filter('lowpass', rand(380, 520), 0.8);
      const a = g.gain();
      g.env(a.gain, t, { a: 0.004, peak: 0.45, r: 0.13 });
      n.connect(lp); lp.connect(a); a.connect(g.out);
      const o = g.osc('sine', t, t + 0.2, [[0, 150], [0.1, 55]]);
      const oa = g.gain();
      g.env(oa.gain, t, { a: 0.003, peak: 0.4, r: 0.13 });
      o.connect(oa); oa.connect(g.out);
    },
    // passinho suave, com variação de timbre a cada passo
    passo(R, t) {
      stepFlip = -stepFlip;
      const g = S.group('sfx', R.dest, { pan: stepFlip * 0.12 });
      if (!g) return;
      const n = g.noise(t, t + 0.12);
      const bp = g.filter('bandpass', rand(650, 1500), rand(0.9, 1.6));
      const a = g.gain();
      g.env(a.gain, t, { a: 0.004, peak: rand(0.09, 0.14), r: rand(0.045, 0.075) });
      n.connect(bp); bp.connect(a); a.connect(g.out);
      const o = g.osc('sine', t, t + 0.1, [[0, rand(95, 120)], [0.06, 70]]);
      const oa = g.gain();
      g.env(oa.gain, t, { a: 0.003, peak: 0.12, r: 0.05 });
      o.connect(oa); oa.connect(g.out);
    },
    // pegar um item: duas notinhas subindo
    coleta(R, t) {
      I.glock(R, t, mtof(C6 + 4), { vel: 0.8 });
      I.glock(R, t + 0.075, mtof(C6 + 11), { vel: 0.9 });
    },
    // "plim" doce ascendente (arpejo de jujuba), levemente diferente a cada vez
    jujuba(R, t) {
      const tr = pick([0, 2, 5]);
      [0, 4, 7, 12].forEach((s, i) => I.bell(R, t + i * 0.052, mtof(C6 + tr + s),
        { vel: 0.55 + i * 0.12, decay: 0.5 + i * 0.12, partials: [[1, 1], [2, 0.25], [4, 0.06]], wet: 0.2 }));
      I.bell(R, t + 0.23, mtof(C6 + tr + 24), { vel: 0.25, decay: 0.6, partials: [[1, 1]], wet: 0.5 });
    },
    // fanfarra curtinha e fofa de missão concluída
    missao(R, t) {
      const B = 72; // dó 5
      [[0, 0], [0.11, 4], [0.22, 7]].forEach(([dt, s]) => brassy(R, t + dt, mtof(B + s), 0.12, 0.8));
      [0, 4, 7, 12].forEach((s) => brassy(R, t + 0.36, mtof(B + s), 0.75, 0.7));
      [24, 28, 31, 36].forEach((s, i) => I.glock(R, t + 0.36 + i * 0.07, mtof(B + s), { vel: 0.5, wet: 0.35, force: true }));
      I.kick(R, t + 0.36, { vel: 0.5 });
    },
    // nova caixa de diálogo: "pop" leve
    dialogo(R, t) { blip(R, t, [[0, 520], [0.05, 820]], 0.07, 0.16); },
    clique(R, t) { blip(R, t, [[0, 1500], [0.03, 1150]], 0.035, 0.16, 'triangle'); },
    mover(R, t) { blip(R, t, [[0, 950], [0.02, 1000]], 0.03, 0.09); },
    // brilho mágico: pings agudos espalhados
    brilho(R, t) {
      const notes = [96, 98, 100, 103, 105, 108];
      for (let i = 0; i < 6; i++) {
        I.bell(R, t + i * 0.06 + rand(0, 0.03), mtof(pick(notes)),
          { vel: 0.35, decay: 0.45, partials: [[1, 1], [2.01, 0.2]], pan: rand(-0.6, 0.6), wet: 0.6 });
      }
    },
    // piado genérico de passarinho
    piado(R, t) {
      const f = rand(2300, 3400);
      I.chirp(R, t, [[0, f * 0.8], [0.05, f * 1.15], [0.11, f]], { vel: 0.7, wet: 0.25, pan: rand(-0.4, 0.4) });
      if (Math.random() < 0.6) I.chirp(R, t + 0.14, [[0, f], [0.07, f * 1.25]], { vel: 0.55, wet: 0.25 });
    },
    // ovo balançando: "uóbli-uóbli" + toquinho de casca
    ovo(R, t) {
      const g = S.group('sfx', R.dest, { send: R.send, sendLevel: 0.1 });
      if (!g) return;
      const o = g.osc('sine', t, t + 0.5, [[0, 420], [0.4, 380]]);
      g.lfo(t, t + 0.5, 13, 90, o.detune);
      const trem = g.gain(0.6);
      g.lfo(t, t + 0.5, 6.5, 0.4, trem.gain);
      const a = g.gain();
      g.env(a.gain, t, { a: 0.02, peak: 0.25, hold: 0.2, sus: 0.8, r: 0.18 });
      o.connect(trem); trem.connect(a); a.connect(g.out);
      const n = g.noise(t, t + 0.05);
      const bp = g.filter('bandpass', 2600, 3);
      const na = g.gain();
      g.env(na.gain, t, { a: 0.001, peak: 0.25, r: 0.025 });
      n.connect(bp); bp.connect(na); na.connect(g.out);
    },
    // splash: ruído descendo + bolhinhas
    agua(R, t) {
      const g = S.group('sfx', R.dest, { send: R.send, sendLevel: 0.15 });
      if (!g) return;
      const n = g.noise(t, t + 0.5);
      const bp = g.filter('bandpass', 2400, 1.3);
      bp.frequency.setValueAtTime(2600, t);
      bp.frequency.exponentialRampToValueAtTime(550, t + 0.35);
      const a = g.gain();
      g.env(a.gain, t, { a: 0.006, peak: 0.3, hold: 0.04, sus: 0.6, r: 0.28 });
      n.connect(bp); bp.connect(a); a.connect(g.out);
      for (let i = 0; i < 3; i++) {
        const t1 = t + 0.05 + rand(0, 0.25);
        const f = rand(380, 700);
        const o = g.osc('sine', t1, t1 + 0.09, [[0, f], [0.06, f * 2.2]]);
        const oa = g.gain();
        g.env(oa.gain, t1, { a: 0.004, peak: 0.12, r: 0.05 });
        o.connect(oa); oa.connect(g.out);
      }
    },
    // porta: rangidinho de madeira + sininho de loja
    porta(R, t) {
      const g = S.group('sfx', R.dest);
      if (g) {
        const o = g.osc('sawtooth', t, t + 0.45, [[0, 70], [0.2, 115], [0.38, 95]]);
        const bp = g.filter('bandpass', 950, 7);
        const a = g.gain();
        g.env(a.gain, t, { a: 0.04, peak: 0.28, hold: 0.2, sus: 0.7, r: 0.12 });
        o.connect(bp); bp.connect(a); a.connect(g.out);
      }
      I.bell(R, t + 0.08, mtof(91), { vel: 0.6, decay: 0.9, partials: [[1, 1], [2.7, 0.3]], wet: 0.3 });
      I.bell(R, t + 0.2, mtof(88), { vel: 0.45, decay: 0.9, partials: [[1, 1], [2.7, 0.3]], wet: 0.3 });
    },
    // moedinha / gastar jujubas
    moeda(R, t) {
      I.bell(R, t, mtof(83), { vel: 0.7, decay: 0.25, partials: [[1, 1], [3, 0.2]] });
      I.bell(R, t + 0.075, mtof(88), { vel: 0.8, decay: 0.7, partials: [[1, 1], [3, 0.2], [2, 0.15]], wet: 0.2 });
    },
    // a cor voltando: sopro subindo + glissando de harpa + acorde brilhante
    cor(R, t) {
      const g = S.group('sfx', R.dest, { send: R.send, sendLevel: 0.5, force: true });
      if (g) {
        const n = g.noise(t, t + 2.2);
        const bp = g.filter('bandpass', 300, 2.2);
        bp.frequency.setValueAtTime(300, t);
        bp.frequency.exponentialRampToValueAtTime(5000, t + 1.5);
        const a = g.gain();
        g.env(a.gain, t, { a: 0.6, peak: 0.12, hold: 0.5, sus: 0.6, r: 0.9 });
        n.connect(bp); bp.connect(a); a.connect(g.out);
      }
      const penta = [0, 2, 4, 7, 9];
      for (let i = 0; i < 12; i++) {
        const m = 67 + Math.floor(i / 5) * 12 + penta[i % 5];
        I.harp(R, t + 0.1 + i * 0.075, mtof(m), { vel: 0.45 + i * 0.03, pan: -0.5 + i / 11, wet: 0.45, force: true });
      }
      [72, 76, 79, 83, 86].forEach((m, i) =>
        I.bell(R, t + 1.0 + i * 0.04, mtof(m + 12), { vel: 0.35, decay: 2.2, partials: [[1, 1], [2, 0.2]], wet: 0.7, force: true }));
    },
  };

  /** Bip curtinho para UI. */
  function blip(R, t, pts, dur, peak, type = 'sine') {
    const g = S.group('sfx', R.dest);
    if (!g) return;
    const o = g.osc(type, t, t + dur + 0.05, pts);
    const a = g.gain();
    g.env(a.gain, t, { a: 0.003, peak, r: dur });
    o.connect(a); a.connect(g.out);
  }

  /** Metalzinho de brinquedo para a fanfarra. */
  function brassy(R, t, f, dur, vel) {
    const g = S.group('sfx', R.dest, { send: R.send, sendLevel: 0.25, force: true });
    if (!g) return;
    const o = g.osc('sawtooth', t, t + dur + 0.3, f);
    const o2 = g.osc('square', t, t + dur + 0.3, f * 1.002);
    const m2 = g.gain(0.3);
    const lp = g.filter('lowpass', 900, 1.5);
    lp.frequency.setValueAtTime(700, t);
    lp.frequency.linearRampToValueAtTime(2600, t + 0.05);
    lp.frequency.exponentialRampToValueAtTime(1200, t + dur);
    const a = g.gain();
    g.env(a.gain, t, { a: 0.015, peak: 0.12 * vel, hold: dur, sus: 0.7, r: 0.2 });
    o.connect(lp); o2.connect(m2); m2.connect(lp); lp.connect(a); a.connect(g.out);
  }

  return {
    names: Object.keys(recipes),
    play(R, name, t) {
      const fn = recipes[name];
      if (!fn) return false;
      fn(R, t);
      return true;
    },
  };
}
