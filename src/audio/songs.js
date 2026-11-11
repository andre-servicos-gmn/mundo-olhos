// Músicas procedurais (generativas) do Mundo Olhos.
// Cada música = { bpm, beats, swing?, lowpass?, start?(e) -> parar(), bar(e, n, t) }.
//   bar() agenda UM compasso começando em `t` (segundos do AudioContext). `n` = número do compasso.
//   e = { I (instrumentos), R (roteamento da música), spb (segundos por tempo), at(t, beat), st (estado livre) }
// Forma: seções de 8 compassos com dois motivos (A e B) que variam; a cada seção um motivo
// é reinventado e as camadas entram/saem — assim a música nunca cansa, mas tem identidade.
import { mtof, rand, pick, chance, degree, SCALES } from './synth.js';

const P = SCALES.penta;
const M = SCALES.maior;

// Bancos de ritmo (tempos dentro do compasso: [início, duração])
const R4 = [
  [[0, 1], [1, 1], [2, 1.5], [3.5, 0.5]],
  [[0, 0.5], [0.5, 0.5], [1, 1], [2, 2]],
  [[0, 1.5], [1.5, 0.5], [2, 1], [3, 1]],
  [[0, 0.5], [0.5, 0.5], [1, 0.5], [1.5, 0.5], [2, 2]],
  [[0, 2], [2, 1], [3, 1]],
  [[0.5, 0.5], [1, 1], [2, 0.5], [2.5, 0.5], [3, 1]],
  [[0, 1], [1.5, 0.5], [2, 0.5], [2.5, 1.5]],
];
const R3 = [
  [[0, 1], [1, 1], [2, 1]],
  [[0, 2], [2, 1]],
  [[0, 1.5], [1.5, 0.5], [2, 1]],
  [[0, 0.5], [0.5, 0.5], [1, 2]],
];
const RSPARSE = [
  [[0, 2], [2.5, 1.5]],
  [[0, 3], [3, 1]],
  [[1, 1], [2, 2]],
  [[0, 1.5], [2, 2]],
];

const clampI = (v, a, b) => Math.max(a, Math.min(b, v));

/** Cria um motivo: lista de { b, d, deg } em graus da pentatônica. */
function makeMotif(bank, lo, hi, start) {
  let d = start ?? Math.round((lo + hi) / 2);
  return pick(bank).map(([b, dur], i) => {
    if (i > 0) d = clampI(d + pick([-2, -1, -1, 1, 1, 2, 0, 3, -3]), lo, hi);
    return { b, dur, d };
  });
}
/** Variação: mexe em 1–2 notas e às vezes tira uma (respiro). */
function vary(m, lo, hi) {
  const c = m.map((x) => ({ ...x }));
  const k = 1 + (Math.random() < 0.5 ? 1 : 0);
  for (let i = 0; i < k; i++) {
    const j = (Math.random() * c.length) | 0;
    c[j].d = clampI(c[j].d + pick([-2, -1, 1, 2]), lo, hi);
  }
  if (c.length > 3 && chance(0.3)) c.splice(1 + ((Math.random() * (c.length - 2)) | 0), 1);
  return c;
}

/**
 * Melodia com forma A A' B (A) | A B B' fim, reinventando um motivo a cada seção.
 * o = { root, lo, hi, bank, play(t, midi, durSec, vel), restChance }
 */
function melody(e, n, t, o) {
  const st = e.st;
  const pos = n % 8;
  const sec = Math.floor(n / 8);
  if (pos === 0 || !st.mA) {
    if (!st.mA || sec % 2 === 1) st.mA = makeMotif(o.bank, o.lo, o.hi);
    if (!st.mB || sec % 2 === 0) st.mB = makeMotif(o.bank, o.lo, o.hi, st.mA[0].d + pick([-2, 2, 3]));
  }
  let m;
  switch (pos) {
    case 0: case 4: m = st.mA; break;
    case 1: m = vary(st.mA, o.lo, o.hi); break;
    case 2: case 5: m = st.mB; break;
    case 6: m = vary(st.mB, o.lo, o.hi); break;
    case 3: m = chance(0.5) ? st.mA.slice(0, 2) : vary(st.mA, o.lo, o.hi); break;
    default: { // fim de frase: nota longa na tônica (ou silêncio)
      if (chance(0.7)) o.play(e.at(t, 0), degree(o.root, P, o.endDeg ?? o.lo + 5), e.spb * (e.beats - 0.5), 0.8);
      return;
    }
  }
  if (o.restChance && chance(o.restChance)) return;
  for (const x of m) o.play(e.at(t, x.b), degree(o.root, P, x.d), x.dur * e.spb, x.b % 1 === 0 ? 0.85 : 0.7);
}

/** Notas MIDI de um acorde do campo harmônico maior (tríade ou tétrade). */
function chord(root, deg, { seventh = false, octave = 0 } = {}) {
  const tones = [0, 2, 4].concat(seventh ? [6] : []);
  return tones.map((k) => degree(root + octave * 12, M, deg + k));
}

/** Progressão: escolhe uma nova a cada 8 compassos. */
function prog(e, n, list) {
  if (n % 8 === 0 || !e.st.prog) e.st.prog = pick(list);
  return e.st.prog[n % e.st.prog.length];
}

// =============================================================================================
// Casinha Asas de Saudade: valsa composta nota a nota, em Fá maior, com o acorde menor emprestado (Si bemol menor).
// Cada compasso: [baixo, acorde, melodia [tempo, nota, duração?]].
const ASAS_BARS = [
  [41, [57, 60, 65], [[0, 69], [1, 72], [2, 77]]],     // Fá
  [40, [55, 60, 64], [[0, 76, 2], [2, 74]]],           // Dó/Mi
  [38, [57, 62, 65], [[0, 72], [1, 74], [2, 69]]],     // Rém
  [34, [58, 62, 65], [[0, 70, 2], [2, 69]]],           // Si bemol
  [41, [57, 60, 65], [[0, 69], [1, 72], [2, 77]]],     // Fá
  [34, [58, 61, 65], [[0, 77, 2], [2, 73]]],           // Si bemol menor
  [36, [57, 60, 65], [[0, 72, 2], [2, 69]]],           // Fá/Dó
  [36, [55, 60, 64], [[0, 67, 3]]],                    // Dó
  [38, [57, 62, 65], [[0, 74], [1, 77], [2, 81]]],     // Rém
  [33, [57, 60, 64], [[0, 79, 2], [2, 76]]],           // Lám
  [34, [58, 62, 65], [[0, 77], [1, 74], [2, 70]]],     // Si bemol
  [41, [57, 60, 65], [[0, 72, 2], [2, 69]]],           // Fá
  [31, [58, 62, 65], [[0, 70], [1, 74], [2, 79]]],     // Sol menor com sétima
  [34, [58, 61, 65], [[0, 77, 2], [2, 73]]],           // Si bemol menor
  [36, [57, 60, 65], [[0, 72], [1, 69], [2, 65]]],     // Fá/Dó
  [41, [57, 60, 65], [[0, 65, 3]]],                    // Fá
];

export const SONGS = {
  // Caixinha de música em 3/4 (menu)
  menu: {
    gain: 1.25, bpm: 84, beats: 3,
    bar(e, n, t) {
      const root = 65; // Fá
      const c = prog(e, n, [[0, 5, 3, 4], [0, 3, 4, 0], [5, 3, 0, 4], [0, 2, 3, 4]]);
      const ch = chord(root - 12, c);
      e.I.musicBox(e.R, e.at(t, 0), mtof(ch[0]), { vel: 0.55 });
      e.I.musicBox(e.R, e.at(t, 1), mtof(ch[1] + 12), { vel: 0.35, pan: -0.2 });
      e.I.musicBox(e.R, e.at(t, 2), mtof(ch[2] + 12), { vel: 0.35, pan: 0.2 });
      melody(e, n, t, { root, lo: 4, hi: 11, bank: R3, endDeg: 5,
        play: (tt, m, d, v) => e.I.musicBox(e.R, tt, mtof(m), { vel: v * 0.8 }) });
    },
  },

  // Campo das Pétalas: flauta + glockenspiel alegres, pentatônica maior
  campo: {
    gain: 0.45, bpm: 100, beats: 4,
    bar(e, n, t) {
      const root = 60; // Dó
      const c = prog(e, n, [[0, 5, 3, 4], [0, 3, 0, 4], [3, 4, 2, 5], [0, 4, 5, 3]]);
      const ch = chord(root, c);
      const sec = Math.floor(n / 8) % 4;
      e.I.bass(e.R, e.at(t, 0), mtof(ch[0] - 24), e.spb * 1.5, { vel: 0.8 });
      e.I.bass(e.R, e.at(t, 2.5), mtof(ch[0] - 24 + (chance(0.5) ? 7 : 12)), e.spb, { vel: 0.6 });
      // glockenspiel arpejando (some numa seção para respirar)
      if (sec !== 2) {
        const arp = [0, 1, 2, 1, 2, 0, 1, 2];
        for (let i = 0; i < 8; i++) {
          if (i % 2 === 1 && chance(0.35)) continue;
          e.I.glock(e.R, e.at(t, i * 0.5), mtof(ch[arp[i]] + 12), { vel: 0.32 + (i % 2 ? 0 : 0.1), pan: 0.3 });
        }
      }
      if (sec >= 1) for (let i = 0; i < 4; i++) e.I.shaker(e.R, e.at(t, i + 0.5), { vel: 0.7 });
      if (sec === 3 && n % 2 === 0) e.I.pad(e.R, e.at(t, 0), ch.map(mtof), e.spb * 7.5, { vel: 0.6 });
      melody(e, n, t, { root, lo: 5, hi: 13, bank: R4, restChance: sec === 2 ? 0 : 0.08,
        play: (tt, m, d, v) => e.I.flute(e.R, tt, mtof(m), d * 0.92, { vel: v, pan: -0.15 }) });
    },
  },

  // Vila Piscadela: ukulele saltitante + pizzicato
  vila: {
    gain: 1.4, bpm: 112, beats: 4,
    bar(e, n, t) {
      const root = 55; // Sol
      const c = prog(e, n, [[0, 3, 4, 0], [0, 5, 1, 4], [3, 0, 4, 5], [0, 3, 1, 4]]);
      const ch = chord(root + 12, c, { seventh: chance(0.25) });
      const sec = Math.floor(n / 8) % 3;
      // batida do ukulele (cordas levemente defasadas = rasqueado)
      const strum = [[0, 1, 1], [1.5, 0.6, -1], [2, 0.9, 1], [3, 0.7, 1], [3.5, 0.55, -1]];
      for (const [b, v, dir] of strum) {
        const notes = dir > 0 ? ch : [...ch].reverse();
        notes.forEach((m, k) => e.I.uke(e.R, e.at(t, b) + k * 0.014, mtof(m), { vel: v * 0.55, pan: -0.25 }));
      }
      // baixo pizzicato caminhando
      const b0 = ch[0] - 12;
      [[0, b0], [1, b0 + 7], [2, b0 + 4 + (chance(0.5) ? 0 : 3)], [3, b0 + 7]].forEach(([b, m]) =>
        e.I.pizz(e.R, e.at(t, b), mtof(m - 12), { vel: 0.8 }));
      e.I.woodblock(e.R, e.at(t, 1), { vel: 0.5 });
      e.I.woodblock(e.R, e.at(t, 3), { vel: 0.5, f: 1150 });
      if (sec > 0) for (let i = 0; i < 8; i++) if (chance(0.8)) e.I.shaker(e.R, e.at(t, i * 0.5), { vel: i % 2 ? 0.5 : 0.8 });
      melody(e, n, t, { root: root + 12, lo: 5, hi: 12, bank: R4, restChance: 0.05,
        play: (tt, m, d, v) => {
          e.I.pizz(e.R, tt, mtof(m), { vel: v, pan: 0.2, wet: 0.12 });
          if (sec === 2) e.I.glock(e.R, tt, mtof(m + 12), { vel: v * 0.35, pan: 0.3 });
        } });
    },
  },

  // Ninhal Cantante: harpa + passarinhos afinados cantando a melodia
  ninhal: {
    gain: 1.4, bpm: 88, beats: 4,
    bar(e, n, t) {
      const root = 62; // Ré
      const c = prog(e, n, [[0, 4, 5, 3], [0, 3, 0, 4], [5, 3, 0, 4], [3, 0, 4, 0]]);
      const ch = chord(root - 12, c, { seventh: chance(0.3) });
      const up = [...ch, ch[0] + 12, ch[1] + 12];
      const pat = [0, 1, 2, 3, 4, 3, 2, 1];
      for (let i = 0; i < 8; i++) e.I.harp(e.R, e.at(t, i * 0.5), mtof(up[pat[i] % up.length]), { vel: i === 0 ? 0.75 : 0.45, pan: -0.3 + i * 0.07 });
      e.I.harp(e.R, e.at(t, 0), mtof(ch[0] - 12), { vel: 0.6 });
      if (n % 2 === 0) e.I.pad(e.R, e.at(t, 0), chord(root, c).map(mtof), e.spb * 7.5, { vel: 0.4, cutoff: 900 });
      // a melodia é cantada por passarinhos (piados afinados na pentatônica)
      melody(e, n, t, { root: root + 12, lo: 5, hi: 12, bank: R4, restChance: 0.1,
        play: (tt, m, d, v) => {
          const f = mtof(m);
          e.I.chirp(e.R, tt, [[0, f * 0.92], [0.035, f], [Math.min(0.45, Math.max(0.12, d * 0.8)), f * 0.99]],
            { vel: v * 0.75, fm: 2, index: 0.2, warble: 10, pan: rand(-0.4, 0.4), wet: 0.35 });
        } });
      // piadinhos soltos no alto (afinados)
      if (chance(0.5)) {
        const f = mtof(degree(root + 24, P, (Math.random() * 5) | 0));
        const tt = e.at(t, pick([1.5, 2.5, 3.5]));
        e.I.chirp(e.R, tt, [[0, f], [0.04, f * 1.12], [0.08, f]], { vel: 0.3, pan: rand(-0.8, 0.8), wet: 0.5 });
        e.I.chirp(e.R, tt + 0.1, [[0, f], [0.04, f * 1.12], [0.08, f]], { vel: 0.25, pan: rand(-0.8, 0.8), wet: 0.5 });
      }
    },
  },

  // Bosque Açucarado: sininhos doces em compasso ternário composto (tercinas)
  bosque: {
    gain: 0.5, bpm: 76, beats: 4,
    bar(e, n, t) {
      const root = 57; // Lá
      const c = prog(e, n, [[0, 3, 5, 4], [0, 2, 3, 4], [3, 4, 0, 0], [0, 5, 3, 4]]);
      const ch = chord(root, c);
      const sec = Math.floor(n / 8) % 3;
      // celesta em tercinas (cada tempo dividido em 3)
      for (let b = 0; b < 4; b++) for (let k = 0; k < 3; k++) {
        if (sec === 1 && k === 1 && chance(0.5)) continue;
        e.I.glock(e.R, e.at(t, b + k / 3), mtof(ch[(b + k) % 3] + 12), { vel: k === 0 ? 0.32 : 0.22, pan: 0.35 * (k - 1) });
      }
      e.I.bass(e.R, e.at(t, 0), mtof(ch[0] - 12), e.spb * 2, { vel: 0.6 });
      e.I.bass(e.R, e.at(t, 2), mtof(ch[2] - 12), e.spb * 2, { vel: 0.45 });
      if (n % 2 === 0) e.I.pad(e.R, e.at(t, 0), ch.map((m) => mtof(m + 12)), e.spb * 7.6, { vel: 0.45, cutoff: 1600 });
      melody(e, n, t, { root: root + 12, lo: 5, hi: 12, bank: R4, restChance: 0.08,
        play: (tt, m, d, v) => e.I.chime(e.R, tt, mtof(m), { vel: v, pan: rand(-0.2, 0.2), wet: 0.4 }) });
    },
  },

  // Cidade Cílios: piano leve com acordes de sétima
  cidade: {
    gain: 1.7, bpm: 90, beats: 4, swing: 0.06,
    bar(e, n, t) {
      const root = 58; // Si bemol
      const c = prog(e, n, [[0, 5, 1, 4], [0, 3, 2, 5], [3, 4, 0, 0], [1, 4, 0, 5]]);
      const ch = chord(root, c, { seventh: true });
      const sec = Math.floor(n / 8) % 3;
      e.I.piano(e.R, e.at(t, 0), mtof(ch[0] - 24), e.spb * 2, { vel: 0.7, pan: -0.2 });
      e.I.piano(e.R, e.at(t, 2), mtof(ch[0] - 24 + 7), e.spb * 1.5, { vel: 0.5, pan: -0.2 });
      for (const b of [1, 2.5, 3.5].slice(0, sec === 0 ? 2 : 3)) {
        ch.slice(1).forEach((m, k) => e.I.piano(e.R, e.at(t, b) + k * 0.008, mtof(m - 12), e.spb, { vel: 0.38, pan: -0.1 }));
      }
      if (sec > 0) for (let i = 0; i < 8; i++) e.I.hat(e.R, e.at(t, i * 0.5), { vel: i % 2 ? 0.5 : 0.8 });
      melody(e, n, t, { root: root + 12, lo: 4, hi: 12, bank: R4, restChance: 0.08,
        play: (tt, m, d, v) => e.I.piano(e.R, tt, mtof(m), d, { vel: v * 0.9, pan: 0.15, wet: 0.25 }) });
    },
  },

  // Pico Pestana: vento + coral etéreo, acordes longos e sinos lá no alto
  pico: {
    gain: 0.7, bpm: 56, beats: 4,
    start(e) { return e.windLoop?.(0.5) || null; },
    bar(e, n, t) {
      const CH = [[50, 57, 62, 64, 69], [46, 53, 58, 62, 69], [53, 57, 60, 64, 67], [48, 55, 60, 64, 67], [45, 52, 57, 60, 64]];
      if (n % 8 === 0 || !e.st.order) e.st.order = pick([[0, 1, 2, 3], [0, 2, 1, 3], [0, 4, 1, 3], [2, 3, 0, 1]]);
      const ch = CH[e.st.order[n % 4]];
      e.I.choir(e.R, e.at(t, 0), ch.slice(1).map(mtof), e.spb * 3.8, { vel: 0.55, vowel: n % 2 ? 'o' : 'a' });
      e.I.bass(e.R, e.at(t, 0), mtof(ch[0] - 12), e.spb * 3.5, { vel: 0.35 });
      if (chance(0.6)) {
        const top = ch[2 + ((Math.random() * 3) | 0)] + 24;
        e.I.chime(e.R, e.at(t, pick([1, 2, 2.5])), mtof(top), { vel: 0.45, pan: rand(-0.6, 0.6), wet: 0.7 });
      }
      if (Math.floor(n / 4) % 2 === 1) {
        melody(e, n, t, { root: 62, lo: 5, hi: 11, bank: RSPARSE, restChance: 0.25,
          play: (tt, m, d, v) => e.I.flute(e.R, tt, mtof(m), d * 0.9, { vel: v * 0.6, wet: 0.5 }) });
      }
    },
  },

  // Cafeteria Nuvem de Leite: lo-fi — batida com swing, piano elétrico com 7ª/9ª, chiado de vinil
  cafe: {
    gain: 0.5, bpm: 78, beats: 4, swing: 0.07, swingUnit: 16, lowpass: 3800,
    start(e) { return e.vinyl?.() || null; },
    bar(e, n, t) {
      // [baixo, voicing] — ii-V-I-vi e IV-iii-ii-V em Dó
      const PROGS = [
        [[38, [53, 57, 60, 64]], [43, [53, 59, 64, 69]], [36, [52, 55, 59, 62]], [45, [55, 60, 64, 71]]],
        [[41, [52, 55, 57, 60]], [40, [50, 55, 59, 62]], [38, [53, 57, 60, 64]], [43, [53, 59, 62, 69]]],
      ];
      if (n % 8 === 0 || !e.st.p) e.st.p = pick(PROGS);
      const [bassM, voicing] = e.st.p[n % 4];
      const sec = Math.floor(n / 8) % 3;
      // acordes: no 1 e uma antecipação preguiçosa
      voicing.forEach((m, k) => e.I.epiano(e.R, e.at(t, 0) + k * 0.012, mtof(m), e.spb * 1.6, { vel: 0.55, pan: -0.15 }));
      if (chance(0.6)) voicing.forEach((m, k) => e.I.epiano(e.R, e.at(t, 2.75) + k * 0.01, mtof(m), e.spb * 1, { vel: 0.4, pan: -0.15 }));
      // baixo
      e.I.bass(e.R, e.at(t, 0), mtof(bassM), e.spb * 1.4, { vel: 0.9 });
      e.I.bass(e.R, e.at(t, 2.5), mtof(bassM + (chance(0.5) ? 7 : 12)), e.spb * 0.9, { vel: 0.6 });
      // bateria macia com swing nas semicolcheias
      e.I.kick(e.R, e.at(t, 0), { vel: 0.8 });
      e.I.kick(e.R, e.at(t, chance(0.5) ? 2.5 : 2.25), { vel: 0.6 });
      if (chance(0.3)) e.I.kick(e.R, e.at(t, 1.75), { vel: 0.4 });
      e.I.snare(e.R, e.at(t, 1), { vel: 0.5 });
      e.I.snare(e.R, e.at(t, 3), { vel: 0.55 });
      for (let i = 0; i < 16; i++) {
        if (i % 2 === 1 && chance(sec === 0 ? 0.7 : 0.35)) continue;
        e.I.hat(e.R, e.at(t, i * 0.25), { vel: (i % 4 === 0 ? 0.7 : 0.45) * rand(0.8, 1.1) });
      }
      // melodia esparsa no registro agudo
      if (sec > 0) melody(e, n, t, { root: 72, lo: 3, hi: 10, bank: RSPARSE, restChance: 0.2,
        play: (tt, m, d, v) => e.I.epiano(e.R, tt, mtof(m), d * 0.8, { vel: v * 0.5, pan: 0.2, wet: 0.3 }) });
    },
  },

  // Casinha Asas de Saudade: e.st.level (0..8) abre as camadas — caixinha sozinha, piano, cordas, coro e sinos.
  // e.st.soft = versão baixinha das visitas seguintes.
  asas: {
    gain: 1.3, bpm: 66, beats: 3,
    bar(e, n, t) {
      const [bass, ch, mel] = ASAS_BARS[n % ASAS_BARS.length];
      const level = e.st.level ?? 0;
      const v = e.st.soft ? 0.55 : 1;
      for (const [b, m, d = 1] of mel) {
        e.I.musicBox(e.R, e.at(t, b), mtof(m), { vel: 0.75 * v, wet: 0.45 });
        if (level >= 4) e.I.piano(e.R, e.at(t, b), mtof(m - 12), d * e.spb, { vel: 0.3 * v, pan: 0.15, wet: 0.35 });
      }
      [1, 2].forEach((b, k) => e.I.musicBox(e.R, e.at(t, b), mtof(ch[k + 1] + 12), { vel: 0.2 * v, pan: k ? 0.25 : -0.25, wet: 0.45 }));
      if (level >= 1) {
        e.I.piano(e.R, e.at(t, 0), mtof(bass + 12), e.spb * 3, { vel: 0.55 * v, pan: -0.2, wet: 0.35 });
        for (const b of [1, 2]) ch.forEach((m, k) => e.I.piano(e.R, e.at(t, b) + k * 0.012, mtof(m), e.spb, { vel: 0.22 * v, pan: -0.1, wet: 0.35 }));
      }
      if (level >= 2) e.I.pad(e.R, e.at(t, 0), ch.map(mtof), e.spb * 3.1, { vel: (0.18 + level * 0.05) * v, cutoff: 800 + level * 100, wet: 0.5 });
      if (level >= 6) e.I.choir(e.R, e.at(t, 0), ch.map((m) => mtof(m + 12)), e.spb * 3, { vel: 0.14 * (level - 4) * v, vowel: 'o', wet: 0.6 });
      if (level >= 8 && n % 2 === 0) e.I.chime(e.R, e.at(t, 0), mtof(ch[2] + 24), { vel: 0.3 * v, pan: rand(-0.5, 0.5), wet: 0.7 });
    },
  },

  // Noite: versão calma — harpa lenta, pad, caixinha de música esparsa
  noite: {
    gain: 1.5, bpm: 62, beats: 4,
    bar(e, n, t) {
      const root = 60;
      const c = prog(e, n, [[3, 0, 5, 4], [5, 3, 0, 4], [0, 3, 5, 3]]);
      const ch = chord(root - 12, c, { seventh: true });
      [0, 1, 2, 3].forEach((b) => e.I.harp(e.R, e.at(t, b), mtof(ch[b] + (b ? 12 : 0)), { vel: b ? 0.32 : 0.5, pan: -0.3 + b * 0.2 }));
      if (n % 2 === 0) e.I.pad(e.R, e.at(t, 0), chord(root, c).map(mtof), e.spb * 7.5, { vel: 0.4, cutoff: 800 });
      melody(e, n, t, { root: root + 12, lo: 3, hi: 10, bank: RSPARSE, restChance: 0.35,
        play: (tt, m, d, v) => e.I.musicBox(e.R, tt, mtof(m), { vel: v * 0.55, wet: 0.5 }) });
    },
  },
};
