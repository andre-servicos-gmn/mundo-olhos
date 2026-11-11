// Ambiente em camada baixa: vento contínuo (mais forte no Pico), passarinhos de dia
// (muitos no Ninhal), grilos e uma corujinha à noite. Atualizado por update(dt).
import { rand } from './synth.js';
import { windLoop } from './loops.js';

// por região: volume do vento e intervalo [min,max] entre cantos de passarinho (s)
const PROFILE = {
  campo:  { wind: 0.16, birds: [2.5, 6] },
  vila:   { wind: 0.1,  birds: [4, 9] },
  ninhal: { wind: 0.12, birds: [0.8, 2.6] },
  bosque: { wind: 0.12, birds: [3, 7] },
  cidade: { wind: 0.08, birds: [7, 14] },
  pico:   { wind: 0.42, birds: [12, 25] },
};
const DEFAULT = { wind: 0.14, birds: [4, 9] };

export function createAmbient(S, I, dest, wetSend) {
  const ctx = S.ctx;
  const R = { pool: 'amb', dest, send: wetSend, wet: 0.45 };
  let wind = null;
  let birdT = 1.5, cricketT = 0.5, owlT = 25;

  // ---- vozes do ambiente ----
  function bird(t) {
    const pan = rand(-0.9, 0.9);
    const f = rand(2400, 4200);
    const vel = rand(0.25, 0.45);
    switch ((Math.random() * 4) | 0) {
      case 0: // trinado
        for (let i = 0, n = 4 + ((Math.random() * 5) | 0); i < n; i++) {
          I.chirp(R, t + i * 0.055, [[0, f], [0.025, f * 1.15], [0.045, f * 1.02]], { vel: vel * 0.8, pan });
        }
        break;
      case 1: // chamado de duas notas "fi-uu"
        I.chirp(R, t, [[0, f * 1.1], [0.15, f * 1.12]], { vel, pan, index: 0.15 });
        I.chirp(R, t + 0.22, [[0, f * 0.85], [0.18, f * 0.78]], { vel, pan, index: 0.15 });
        break;
      case 2: // piadinhos soltos
        for (let i = 0; i < 3; i++) I.chirp(R, t + i * rand(0.12, 0.2), [[0, f * 0.9], [0.05, f * 1.2], [0.09, f]], { vel, pan });
        break;
      default: // assobio ondulado
        I.chirp(R, t, [[0, f * 0.7], [0.12, f], [0.3, f * 0.9]], { vel, pan, index: 0.1, warble: 60 });
    }
  }
  function crickets(t) {
    const pan = rand(-1, 1);
    const f = rand(4300, 5200);
    const pulses = 3 + ((Math.random() * 3) | 0);
    for (let i = 0; i < pulses; i++) {
      const g = S.group('amb', dest, { pan });
      if (!g) return;
      const tt = t + i * 0.045;
      const o = g.osc('sine', tt, tt + 0.05, f);
      const a = g.gain();
      g.env(a.gain, tt, { a: 0.004, peak: rand(0.025, 0.045), r: 0.025 });
      o.connect(a); a.connect(g.out);
    }
  }
  function owl(t) {
    const pan = rand(-0.8, 0.8);
    [[0, 0.32], [0.55, 0.5]].forEach(([dt, dur]) => {
      const g = S.group('amb', dest, { pan, send: wetSend, sendLevel: 0.6 });
      if (!g) return;
      const tt = t + dt;
      const o = g.osc('sine', tt, tt + dur + 0.1, [[0, 360], [dur * 0.3, 400], [dur, 330]]);
      const lp = g.filter('lowpass', 900, 0.7);
      const a = g.gain();
      g.env(a.gain, tt, { a: 0.06, peak: 0.07, hold: dur * 0.5, sus: 0.8, r: dur * 0.5 });
      o.connect(lp); lp.connect(a); a.connect(g.out);
    });
  }

  return {
    /** info = { region, phase } (phase: 'amanhecer'|'dia'|'entardecer'|'noite') */
    update(dt, info) {
      const prof = PROFILE[info.region] || DEFAULT;
      const night = info.phase === 'noite';
      if (!wind) wind = windLoop(ctx, S.noiseBuf, dest, prof.wind, { bright: 480, fadeIn: 3 });
      else wind.gain.setTargetAtTime(prof.wind * (night ? 0.8 : 1), ctx.currentTime, 1.5);

      const t = ctx.currentTime + 0.05;
      if (!night) {
        birdT -= dt * (info.phase === 'dia' ? 1 : 1.6);   // amanhecer/entardecer: mais cantoria
        if (birdT <= 0) { birdT = rand(prof.birds[0], prof.birds[1]); bird(t); }
      } else {
        cricketT -= dt;
        if (cricketT <= 0) { cricketT = rand(0.25, 1.2) * (info.region === 'cidade' ? 2.5 : 1); crickets(t); }
        owlT -= dt;
        if (owlT <= 0) { owlT = rand(25, 50); if (info.region === 'ninhal' || info.region === 'campo' || Math.random() < 0.3) owl(t); }
      }
    },
    stop() { wind?.stop(1); wind = null; },
  };
}
