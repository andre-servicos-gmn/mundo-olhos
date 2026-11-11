// Vozes: murmurinhos de diálogo, vozinha da Quim, piados do Pinceso e as 5 notas do coral.
// A "voz" é uma fonte (triângulo/serra/quadrada) passando por 3 formantes (filtros passa-banda
// nas frequências das vogais) + um pouco do seno puro para dar corpo. Formantes deslocados para
// cima (shift > 1) = vozinha pequena e fofa.
import { rand, pick } from './synth.js';

// Formantes (F1, F2, F3) de vogais, já num registro "de desenho animado".
const VOWELS = {
  a: [900, 1500, 2900],
  e: [560, 2100, 3000],
  i: [380, 2600, 3400],
  o: [600, 1000, 2800],
  u: [400, 850, 2600],
  m: [300, 1250, 2500],   // boca fechada ("hmm")
};
const FORMANT_GAIN = [2.4, 1.6, 0.7];

// Timbres usados em NPCS.voice.timbre (src/data/story.js).
const TIMBRES = {
  doce:      { gain: 1.4, src: 'triangle', body: 0.45, shift: 1.15, vib: [6, 16], breath: 0.04, contour: 'arc' },
  fofo:      { gain: 0.75, src: 'square',   body: 0.4,  shift: 1.28, vib: [7, 20], breath: 0.03, contour: 'up' },
  grave:     { gain: 0.75, src: 'sawtooth', body: 0.6,  shift: 0.88, vib: [5, 10], breath: 0.03, contour: 'down' },
  rouco:     { gain: 0.8, src: 'sawtooth', body: 0.3,  shift: 1.0,  vib: [9, 28], breath: 0.22, contour: 'arc' },
  suave:     { gain: 1.0, src: 'sine',     body: 0.9,  shift: 1.1,  vib: [5, 10], breath: 0.1,  contour: 'arc', soft: true },
  nasal:     { gain: 0.65, src: 'square',   body: 0.15, shift: 1.22, vib: [6, 14], breath: 0.02, contour: 'arc', nasal: true },
  arrastado: { gain: 1.3, src: 'triangle', body: 0.5,  shift: 0.95, vib: [4, 22], breath: 0.06, contour: 'slide', durMul: 1.6 },
};

const VOWEL_OF = { á: 'a', à: 'a', â: 'a', ã: 'a', é: 'e', ê: 'e', í: 'i', ó: 'o', ô: 'o', õ: 'o', ú: 'u', ü: 'u' };
const PLOSIVES = 'pbtdkgcq';
const HISS = 'sfzxçj';

export function makeVoices(S, I) {
  const ctx = S.ctx;

  /**
   * Síntese vocal. o = { dur, pitch:[[dt,f]..], vowels:[[dt,'a']..], src, gain, body, shift,
   *   vib:[hz,cents], vibDelay, breath, attack, pan, force, nasal }
   */
  function vocal(R, t, o) {
    const g = S.group(R.pool, R.dest, { pan: o.pan ?? 0, send: R.send, sendLevel: R.wet ?? 0, force: o.force });
    if (!g) return false;
    const dur = o.dur;
    const end = t + dur + 0.08;
    const src = g.osc(o.src || 'triangle', t, end, o.pitch);
    const body = g.osc('sine', t, end, o.pitch);
    const sum = g.gain(1);
    const amp = g.gain();
    src.connect(sum);

    // formantes que seguem a sequência de vogais
    const shift = o.shift ?? 1.15;
    const vs = o.vowels || [[0, 'a']];
    for (let k = 0; k < 3; k++) {
      const bp = g.filter('bandpass', VOWELS[vs[0][1]][k] * shift, k === 0 ? 4 : 6);
      for (let j = 0; j < vs.length; j++) {
        const f = VOWELS[vs[j][1]][k] * shift;
        if (j === 0) bp.frequency.setValueAtTime(f, t + vs[j][0]);
        else bp.frequency.linearRampToValueAtTime(f, t + vs[j][0]);
      }
      const ga = g.gain(FORMANT_GAIN[k]);
      sum.connect(bp); bp.connect(ga); ga.connect(amp);
    }
    if (o.nasal) { // ressonância nasal fixa
      const bp = g.filter('bandpass', 1300, 8);
      const ga = g.gain(1.4);
      sum.connect(bp); bp.connect(ga); ga.connect(amp);
    }
    const bg = g.gain(o.body ?? 0.4);
    body.connect(bg); bg.connect(amp);

    if (o.vib) {
      const v = g.lfo(t, end, o.vib[0], o.vib[1], src.detune, { delay: o.vibDelay ?? 0.03, fadeIn: Math.min(0.15, dur * 0.4) });
      v.connect(body.detune);
    }
    if (o.breath) {
      const n = g.noise(t, end);
      const bp = g.filter('bandpass', 2800 * shift, 0.9);
      const na = g.gain(o.breath * 0.5);
      n.connect(bp); bp.connect(na); na.connect(amp);
    }
    const a = o.attack ?? 0.012;
    g.env(amp.gain, t, { a, peak: o.gain ?? 0.2, hold: Math.max(0.01, dur * 0.6 - a), sus: 0.75, r: dur * 0.4 + 0.02 });
    amp.connect(g.out);
    return true;
  }

  /** Consoante: estalinho (p/t/k) ou chiadinho (s/f/x) bem sutil antes da vogal. */
  function consonant(R, t, ch, shift) {
    const hiss = HISS.includes(ch);
    if (!hiss && !PLOSIVES.includes(ch)) return;
    const g = S.group(R.pool, R.dest);
    if (!g) return;
    const n = g.noise(t, t + 0.06);
    const f = g.filter(hiss ? 'highpass' : 'bandpass', hiss ? 4500 : 2600 * shift, hiss ? 0.7 : 1.5);
    const a = g.gain();
    g.env(a.gain, t, { a: 0.002, peak: hiss ? 0.035 : 0.05, r: hiss ? 0.035 : 0.012 });
    n.connect(f); f.connect(a); a.connect(g.out);
  }

  // ---------------------------------------------------------------------------------------------
  // Murmurinho de diálogo: uma sílaba por caractere (com limite de taxa)
  let lastMurmur = -1;
  let walk = 0; // "melodia da fala": passeio aleatório em semitons
  const STEPS = [0, 2, 4, 7, 5, -3, 9];

  function murmur(R, voice = {}, ch = 'a') {
    if (typeof ch !== 'string' || !ch) return;
    let c = ch.toLowerCase()[0];
    c = VOWEL_OF[c] || c;
    if (!/[a-zç]/.test(c)) return;                 // espaços, pontuação, números e emojis: silêncio
    const pitch = voice.pitch ?? 1, speed = voice.speed ?? 1;
    const tb = voice.timbre || 'doce';
    const now = ctx.currentTime;
    if (now - lastMurmur < 0.055 / Math.max(0.4, speed)) return;
    lastMurmur = now;

    const isV = 'aeiou'.includes(c);
    const vowel = isV ? c : 'aeiou'[c.charCodeAt(0) % 5];
    const base = 230 * pitch;
    walk = Math.max(-3, Math.min(9, pick(STEPS) * 0.5 + walk * 0.5));
    const f = base * Math.pow(2, Math.round(walk) / 12) * rand(0.985, 1.015);
    const t = now + 0.005;

    if (tb === 'piado') {                              // passarinhos falam piando
      const ff = f * 4.2;
      I.chirp(R, t, [[0, ff * 0.9], [0.03, ff * 1.12], [isV ? 0.09 : 0.06, ff]], { vel: 0.9, fm: 2, index: 0.35 });
      return;
    }
    const T = TIMBRES[tb] || TIMBRES.doce;
    const dur = (isV ? 0.105 : 0.07) * (T.durMul || 1) / Math.max(0.5, speed);
    const C = T.contour;
    const pts = C === 'up' ? [[0, f * 0.92], [dur, f * 1.1]]
      : C === 'down' ? [[0, f * 1.05], [dur, f * 0.93]]
      : C === 'slide' ? [[0, f * 1.08], [dur, f * 0.84]]
      : [[0, f * 0.96], [dur * 0.4, f * 1.04], [dur, f * 0.95]];
    consonant(R, t, c, T.shift);
    vocal(R, t + (isV ? 0 : 0.008), {
      dur, pitch: pts, vowels: [[0, vowel]], src: T.src, body: T.body, shift: T.shift, vib: T.vib,
      breath: T.breath, nasal: T.nasal, attack: T.soft ? 0.03 : 0.01, gain: 0.15 * (T.gain ?? 1),
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Vozinha da Quim — cada exclamação tem contorno próprio e reconhecível
  const QUIM = {
    // "hm... hmm?" — boca fechada, termina subindo (curiosa)
    hmm(R, t) {
      vocal(R, t, { dur: 0.16, pitch: [[0, 420], [0.16, 395]], vowels: [[0, 'm']], src: 'triangle', body: 0.8, shift: 1.05, gain: 0.17, force: true });
      vocal(R, t + 0.22, { dur: 0.42, pitch: [[0, 385], [0.16, 360], [0.42, 500]], vowels: [[0, 'm'], [0.42, 'u']],
        src: 'triangle', body: 0.8, shift: 1.05, vib: [6, 14], vibDelay: 0.2, gain: 0.17, force: true });
    },
    // "uiii!" — sobe animado do u para o i
    uii(R, t) {
      vocal(R, t, { dur: 0.46, pitch: [[0, 470], [0.07, 560], [0.3, 930], [0.46, 880]],
        vowels: [[0, 'u'], [0.1, 'i'], [0.46, 'i']], src: 'triangle', body: 0.4, shift: 1.2,
        vib: [7.5, 35], vibDelay: 0.22, breath: 0.05, gain: 0.17, force: true });
    },
    // "hihihi" — risadinha aerada descendo
    risadinha(R, t) {
      [760, 710, 690, 640, 590].forEach((f, i) => {
        const dt = i * 0.1 + (i === 4 ? 0.03 : 0);
        vocal(R, t + dt, { dur: 0.075, pitch: [[0, f * 1.04], [0.075, f * 0.94]], vowels: [[0, 'i'], [0.075, 'e']],
          src: 'triangle', body: 0.35, shift: 1.22, breath: 0.45, gain: 0.17, force: true });
      });
    },
    // "aaaa-uhhm" — bocejo longo, sobe e despenca, bem soprado
    bocejo(R, t) {
      vocal(R, t, { dur: 1.35, pitch: [[0, 410], [0.35, 560], [0.75, 480], [1.35, 230]],
        vowels: [[0, 'a'], [0.55, 'a'], [0.95, 'o'], [1.35, 'm']], src: 'triangle', body: 0.5, shift: 1.12,
        vib: [4.5, 25], vibDelay: 0.3, breath: 0.4, attack: 0.12, gain: 0.3, force: true });
    },
    // "oh!" — surpresa curtinha
    oh(R, t) {
      vocal(R, t, { dur: 0.3, pitch: [[0, 520], [0.07, 690], [0.3, 560]], vowels: [[0, 'o'], [0.3, 'o']],
        src: 'triangle', body: 0.45, shift: 1.15, attack: 0.008, gain: 0.17, force: true });
    },
    // "e-ba!" — duas sílabas, a segunda pula de alegria
    eba(R, t) {
      vocal(R, t, { dur: 0.13, pitch: [[0, 560], [0.13, 600]], vowels: [[0, 'e']], src: 'triangle', body: 0.4, shift: 1.18, gain: 0.15, force: true });
      vocal(R, t + 0.17, { dur: 0.32, pitch: [[0, 640], [0.09, 840], [0.32, 770]], vowels: [[0, 'u'], [0.03, 'a'], [0.32, 'a']],
        src: 'triangle', body: 0.4, shift: 1.18, vib: [7, 25], vibDelay: 0.15, attack: 0.006, gain: 0.17, force: true });
    },
  };

  // ---------------------------------------------------------------------------------------------
  // Piados do Pinceso (periquito): chirps rápidos com FM
  const pc = (R, t, pts, o) => I.chirp(R, t, pts, { ...o, vel: o.vel * 1.9 });
  const PIN = {
    piu(R, t) { pc(R, t, [[0, 2300], [0.05, 3300], [0.13, 2700]], { vel: 0.8, fm: 2, index: 0.5, force: true }); },
    // imita o "uii!" da Quim: "pi-uííí!" com o mesmo vibratinho
    piui(R, t) {
      pc(R, t, [[0, 2500], [0.05, 2900]], { vel: 0.6, fm: 2, index: 0.4, force: true });
      pc(R, t + 0.08, [[0, 1900], [0.06, 2150], [0.28, 3700], [0.4, 3500]], { vel: 0.85, fm: 2, index: 0.3, warble: 45, force: true });
    },
    // trinado feliz subindo + "piu!" final
    feliz(R, t) {
      for (let i = 0; i < 6; i++) {
        const f = 2300 * (1 + i * 0.07);
        pc(R, t + i * 0.062, [[0, f], [0.025, f * 1.2], [0.05, f * 1.05]], { vel: 0.55 + i * 0.05, fm: 2, index: 0.45, force: true });
      }
      pc(R, t + 0.42, [[0, 2900], [0.05, 3900], [0.15, 3500]], { vel: 0.8, fm: 2, index: 0.4, force: true });
    },
    // assobios sonolentos descendo
    sono(R, t) {
      pc(R, t, [[0, 2300], [0.4, 1450]], { vel: 0.4, fm: 2, index: 0.1, force: true });
      pc(R, t + 0.55, [[0, 1900], [0.5, 1150]], { vel: 0.28, fm: 2, index: 0.08, force: true });
    },
    // três piados agudos e ásperos: "olha ali!"
    alerta(R, t) {
      for (let i = 0; i < 3; i++) {
        pc(R, t + i * 0.11, [[0, 3000], [0.03, 3900], [0.075, 3400]], { vel: 0.9, fm: 1.5, index: 1.1, force: true });
      }
    },
  };

  // ---------------------------------------------------------------------------------------------
  // 5 notas de passarinho afinadas (pentatônica de Ré maior, oitava 6) — minigame do coral
  const NOTE_MIDI = [86, 88, 90, 93, 95];
  function note(R, i, t) {
    const k = Math.max(0, Math.min(4, i | 0));
    const f = 440 * Math.pow(2, (NOTE_MIDI[k] - 69) / 12);
    const pan = (k - 2) * 0.3;
    I.chirp(R, t, [[0, f * 0.93], [0.04, f], [0.5, f * 0.995]], { vel: 0.85, fm: 2, index: 0.18, warble: 12, pan, force: true });
    I.bell(R, t, f / 2, { vel: 0.5, decay: 0.9, partials: [[1, 1], [2, 0.25]], pan, wet: 0.3, force: true });
  }

  return {
    murmur,
    quim(R, name, t) { const fn = QUIM[name]; if (fn) fn(R, t); return !!fn; },
    pinceso(R, name, t) { const fn = PIN[name]; if (fn) fn(R, t); return !!fn; },
    note,
    vocal,
  };
}
