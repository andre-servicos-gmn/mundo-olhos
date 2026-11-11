// Instrumentos sintetizados (usados pela música e pelos efeitos).
// Cada instrumento toca UMA nota/acorde num "roteamento" R = { pool, dest, send, wet, pan? }:
//   pool  — categoria de vozes ('sfx' | 'music' | 'amb' | 'voice')
//   dest  — nó seco (bus), send — entrada do reverb, wet — quanto mandar para o reverb.
// `vel` vai de 0 a 1 (intensidade). Tudo devolve sem erro se o pool estiver cheio.
import { rand } from './synth.js';

export function makeInstruments(S) {
  const grp = (R, o = {}) => S.group(R.pool, R.dest, {
    pan: o.pan ?? R.pan ?? 0, send: R.send, sendLevel: o.wet ?? R.wet ?? 0, force: o.force,
  });

  /** Sino/glockenspiel: parciais senoidais com decaimentos diferentes. */
  function bell(R, t, f, { vel = 1, decay = 1.2, partials = [[1, 1], [2, 0.3], [3, 0.1]], pan, wet, force } = {}) {
    const g = grp(R, { pan, wet, force });
    if (!g) return;
    partials.forEach(([ratio, amp], i) => {
      if (f * ratio > 16000) return;
      const o = g.osc('sine', t, t + decay + 0.1, f * ratio);
      const a = g.gain();
      g.env(a.gain, t, { a: 0.003, peak: 0.22 * vel * amp, r: decay / (1 + i * 1.6) });
      o.connect(a); a.connect(g.out);
    });
  }
  /** Caixinha de música: dente metálico brilhante com um "tic" de ataque. */
  function musicBox(R, t, f, o = {}) {
    bell(R, t, f, { decay: 1.8, partials: [[1, 1], [3, 0.22], [5.04, 0.07], [2, 0.12]], ...o });
  }
  /** Glockenspiel. */
  function glock(R, t, f, o = {}) {
    bell(R, t, f, { decay: 1.1, partials: [[1, 1], [2.76, 0.28], [5.4, 0.08]], ...o, vel: (o.vel ?? 1) * 0.9 });
  }
  /** Sininhos doces (bosque). */
  function chime(R, t, f, o = {}) {
    bell(R, t, f, { decay: 2.4, partials: [[1, 1], [2.4, 0.2], [4.1, 0.1], [6.2, 0.04]], ...o, vel: (o.vel ?? 1) * 0.8 });
  }

  /** Flauta: seno + triângulo, vibrato que entra devagar e um sopro no ataque. */
  function flute(R, t, f, dur, { vel = 1, pan, wet } = {}) {
    const g = grp(R, { pan, wet });
    if (!g) return;
    const end = t + dur + 0.35;
    const o1 = g.osc('sine', t, end, f);
    const o2 = g.osc('triangle', t, end, f, { detune: 3 });
    const mix2 = g.gain(0.22);
    const lp = g.filter('lowpass', Math.min(5200, f * 4), 0.5);
    const amp = g.gain();
    g.env(amp.gain, t, { a: 0.045, peak: 0.2 * vel, hold: Math.max(0.02, dur - 0.05), sus: 0.8, r: 0.18 });
    o1.connect(lp); o2.connect(mix2); mix2.connect(lp); lp.connect(amp); amp.connect(g.out);
    const vib = g.lfo(t, end, 5.2, 14, o1.detune, { delay: 0.12, fadeIn: 0.25 });
    vib.connect(o2.detune);
    const n = g.noise(t, t + 0.12);
    const bp = g.filter('bandpass', f * 2.2, 1.5);
    const na = g.gain();
    g.env(na.gain, t, { a: 0.012, peak: 0.05 * vel, r: 0.08 });
    n.connect(bp); bp.connect(na); na.connect(g.out);
  }

  /** Corda dedilhada (ukulele/pizzicato): filtro que fecha rápido = "plim" de corda. */
  function pluck(R, t, f, { vel = 1, decay = 0.6, bright = 3200, pan, wet } = {}) {
    const g = grp(R, { pan, wet });
    if (!g) return;
    const end = t + decay + 0.1;
    const o1 = g.osc('sawtooth', t, end, f);
    const o2 = g.osc('triangle', t, end, f, { detune: -4 });
    const lp = g.filter('lowpass', bright, 1.2);
    lp.frequency.setValueAtTime(bright, t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(200, f * 1.4), t + decay * 0.5);
    const amp = g.gain();
    g.env(amp.gain, t, { a: 0.003, peak: 0.16 * vel, r: decay });
    o1.connect(lp); o2.connect(lp); lp.connect(amp); amp.connect(g.out);
  }
  const uke = (R, t, f, o = {}) => pluck(R, t, f, { decay: 0.7, bright: 3600, ...o });
  const pizz = (R, t, f, o = {}) => pluck(R, t, f, { decay: 0.28, bright: 1800, ...o });

  /** Harpa: triângulo + oitava suave, cauda longa. */
  function harp(R, t, f, { vel = 1, pan, wet, force } = {}) {
    const g = grp(R, { pan, wet, force });
    if (!g) return;
    const end = t + 2;
    const o1 = g.osc('triangle', t, end, f);
    const o2 = g.osc('sine', t, end, f * 2);
    const m2 = g.gain(0.18);
    const lp = g.filter('lowpass', Math.min(6000, f * 5), 0.4);
    const amp = g.gain();
    g.env(amp.gain, t, { a: 0.004, peak: 0.2 * vel, r: 1.8 });
    o1.connect(lp); o2.connect(m2); m2.connect(lp); lp.connect(amp); amp.connect(g.out);
  }

  /** Piano leve: fundamental + harmônicos que somem antes. */
  function piano(R, t, f, dur, { vel = 1, pan, wet } = {}) {
    const g = grp(R, { pan, wet });
    if (!g) return;
    const rel = Math.min(2.2, 0.6 + dur);
    const end = t + rel + 0.1;
    const lp = g.filter('lowpass', Math.min(7000, 1200 + f * 4), 0.5);
    lp.connect(g.out);
    [[1, 1, rel], [2, 0.32, rel * 0.5], [3, 0.12, rel * 0.3], [1, 0.25, rel * 0.8, 'triangle', 6]].forEach(([k, amp, r, type, det]) => {
      const o = g.osc(type || 'sine', t, end, f * k, { detune: det || 0 });
      const a = g.gain();
      g.env(a.gain, t, { a: 0.004, peak: 0.17 * vel * amp, r });
      o.connect(a); a.connect(lp);
    });
  }

  /** Piano elétrico (lo-fi): FM com índice decaindo + leve trêmolo. */
  function epiano(R, t, f, dur, { vel = 1, pan, wet } = {}) {
    const g = grp(R, { pan, wet });
    if (!g) return;
    const end = t + dur + 0.8;
    const car = g.osc('sine', t, end, f);
    const mod = g.osc('sine', t, end, f);
    const mi = g.gain();
    mi.gain.setValueAtTime(f * 1.6 * vel, t);
    mi.gain.exponentialRampToValueAtTime(f * 0.15, t + 0.35);
    mod.connect(mi); mi.connect(car.frequency);
    const amp = g.gain();
    g.env(amp.gain, t, { a: 0.006, peak: 0.13 * vel, hold: dur, sus: 0.45, r: 0.7 });
    const trem = g.gain(1);
    g.lfo(t, end, 4.3, 0.12, trem.gain);
    car.connect(amp); amp.connect(trem); trem.connect(g.out);
  }

  /** Pad macio: serras desafinadas num passa-baixa, ataque lento. freqs = acorde. */
  function pad(R, t, freqs, dur, { vel = 1, cutoff = 1100, pan, wet } = {}) {
    const g = grp(R, { pan, wet });
    if (!g) return;
    const att = Math.min(1.2, dur * 0.35);
    const end = t + dur + 1.4;
    const lp = g.filter('lowpass', cutoff, 0.6);
    const amp = g.gain();
    g.env(amp.gain, t, { a: att, peak: 0.06 * vel, hold: Math.max(0.05, dur - att), sus: 0.9, r: 1.2 });
    for (const f of freqs) {
      for (const d of [-8, 7]) { const o = g.osc('sawtooth', t, end, f, { detune: d + rand(-2, 2) }); o.connect(lp); }
    }
    lp.connect(amp); amp.connect(g.out);
  }

  /** Coral etéreo: serras por formantes de "aa"/"oo", vibrato lento. */
  function choir(R, t, freqs, dur, { vel = 1, vowel = 'a', pan, wet } = {}) {
    const g = grp(R, { pan, wet });
    if (!g) return;
    const F = vowel === 'o' ? [[520, 1], [900, 0.5], [2600, 0.12]] : [[780, 1], [1250, 0.5], [2700, 0.15]];
    const att = Math.min(1.6, dur * 0.4);
    const end = t + dur + 1.8;
    const sum = g.gain(1);
    const amp = g.gain();
    g.env(amp.gain, t, { a: att, peak: 0.16 * vel, hold: Math.max(0.05, dur - att), sus: 0.85, r: 1.6 });
    for (const [ff, fa] of F) {
      const bp = g.filter('bandpass', ff, 6);
      const ga = g.gain(fa * 2.2);
      sum.connect(bp); bp.connect(ga); ga.connect(amp);
    }
    for (const f of freqs) {
      const o = g.osc('sawtooth', t, end, f, { detune: rand(-6, 6) });
      g.lfo(t, end, rand(4.4, 5.4), 9, o.detune, { delay: 0.3, fadeIn: 0.8 });
      o.connect(sum);
    }
    amp.connect(g.out);
  }

  /** Baixo redondo. */
  function bass(R, t, f, dur, { vel = 1, pan, wet = 0 } = {}) {
    const g = grp(R, { pan, wet });
    if (!g) return;
    const end = t + dur + 0.3;
    const o1 = g.osc('triangle', t, end, f);
    const o2 = g.osc('sine', t, end, f);
    const lp = g.filter('lowpass', 700, 0.7);
    const amp = g.gain();
    g.env(amp.gain, t, { a: 0.012, peak: 0.24 * vel, hold: dur * 0.75, sus: 0.6, r: 0.18 });
    o1.connect(lp); o2.connect(lp); lp.connect(amp); amp.connect(g.out);
  }

  // --- percussão suave -----------------------------------------------------------------------
  function kick(R, t, { vel = 1 } = {}) {
    const g = grp(R, { wet: 0 });
    if (!g) return;
    const o = g.osc('sine', t, t + 0.35, [[0, 125], [0.08, 50], [0.3, 44]]);
    const a = g.gain();
    g.env(a.gain, t, { a: 0.003, peak: 0.55 * vel, r: 0.26 });
    o.connect(a); a.connect(g.out);
  }
  function snare(R, t, { vel = 1, pan = 0 } = {}) {
    const g = grp(R, { pan, wet: 0.15 });
    if (!g) return;
    const n = g.noise(t, t + 0.25);
    const bp = g.filter('bandpass', 1900, 0.8);
    const a = g.gain();
    g.env(a.gain, t, { a: 0.002, peak: 0.22 * vel, r: 0.15 });
    n.connect(bp); bp.connect(a); a.connect(g.out);
    const o = g.osc('triangle', t, t + 0.1, [[0, 220], [0.05, 160]]);
    const oa = g.gain();
    g.env(oa.gain, t, { a: 0.002, peak: 0.12 * vel, r: 0.06 });
    o.connect(oa); oa.connect(g.out);
  }
  function hat(R, t, { vel = 1, open = false, pan = 0.25 } = {}) {
    const g = grp(R, { pan, wet: 0 });
    if (!g) return;
    const n = g.noise(t, t + 0.3);
    const hp = g.filter('highpass', 7000, 0.7);
    const a = g.gain();
    g.env(a.gain, t, { a: 0.001, peak: 0.07 * vel, r: open ? 0.18 : 0.035 });
    n.connect(hp); hp.connect(a); a.connect(g.out);
  }
  function shaker(R, t, { vel = 1, pan = -0.3 } = {}) {
    const g = grp(R, { pan, wet: 0.05 });
    if (!g) return;
    const n = g.noise(t, t + 0.15);
    const bp = g.filter('bandpass', 6500, 1.4);
    const a = g.gain();
    g.env(a.gain, t, { a: 0.012, peak: 0.07 * vel, r: 0.05 });
    n.connect(bp); bp.connect(a); a.connect(g.out);
  }
  function woodblock(R, t, { vel = 1, f = 950, pan = 0.35 } = {}) {
    const g = grp(R, { pan, wet: 0.1 });
    if (!g) return;
    const o = g.osc('sine', t, t + 0.1, f);
    const bp = g.filter('bandpass', f, 4);
    const a = g.gain();
    g.env(a.gain, t, { a: 0.001, peak: 0.25 * vel, r: 0.06 });
    o.connect(bp); bp.connect(a); a.connect(g.out);
  }

  /**
   * Piado de passarinho: portadora senoidal com glide + FM (índice decaindo) = timbre de assobio vivo.
   * pts = [[dt, f], ...] contorno de altura.
   */
  function chirp(R, t, pts, { vel = 1, fm = 2.02, index = 0.6, pan, wet, force, warble = 0 } = {}) {
    const g = grp(R, { pan, wet, force });
    if (!g) return;
    const dur = pts[pts.length - 1][0];
    const end = t + dur + 0.05;
    const car = g.osc('sine', t, end, pts);
    const mod = g.osc('sine', t, end, pts.map(([d, f]) => [d, f * fm]));
    const mi = g.gain();
    const f0 = pts[0][1];
    mi.gain.setValueAtTime(f0 * index, t);
    mi.gain.exponentialRampToValueAtTime(Math.max(1, f0 * index * 0.15), t + dur);
    mod.connect(mi); mi.connect(car.frequency);
    if (warble) g.lfo(t, end, 28, warble, car.detune);
    const amp = g.gain();
    g.env(amp.gain, t, { a: Math.min(0.01, dur * 0.2), peak: 0.16 * vel, hold: dur * 0.35, sus: 0.7, r: dur * 0.6 });
    car.connect(amp); amp.connect(g.out);
  }

  return { bell, musicBox, glock, chime, flute, pluck, uke, pizz, harp, piano, epiano, pad, choir, bass,
    kick, snare, hat, shaker, woodblock, chirp };
}
