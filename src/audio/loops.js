// Camadas contínuas em loop (vento, chiado de vinil). Diferente dos grupos descartáveis,
// estas ficam tocando até alguém chamar stop(segundosDeFade).
import { rand } from './synth.js';

let vinylBuf = null;
/** Buffer de 4 s de vinil: chiado baixinho + estalinhos aleatórios (com alguns "pops"). */
function makeVinyl(ctx) {
  if (vinylBuf && vinylBuf.sampleRate === ctx.sampleRate) return vinylBuf;
  const sr = ctx.sampleRate, len = sr * 4;
  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  let lp = 0;
  for (let i = 0; i < len; i++) { lp += 0.12 * ((Math.random() * 2 - 1) - lp); d[i] = lp * 0.25; }
  const clicks = 40;
  for (let k = 0; k < clicks; k++) {
    const at = (Math.random() * (len - 200)) | 0;
    const amp = Math.random() < 0.15 ? rand(0.5, 0.8) : rand(0.08, 0.3);
    const n = 6 + ((Math.random() * 30) | 0);
    for (let j = 0; j < n; j++) d[at + j] += amp * (Math.random() * 2 - 1) * Math.exp(-j / (n * 0.3));
  }
  // emenda do loop sem estalo: fade curtíssimo nas pontas
  for (let j = 0; j < 256; j++) { const k = j / 256; d[j] *= k; d[len - 1 - j] *= k; }
  vinylBuf = buf;
  return buf;
}

function handle(ctx, out, sources, extra = []) {
  let stopped = false;
  return {
    gain: out.gain,
    stop(fade = 1) {
      if (stopped) return;
      stopped = true;
      const now = ctx.currentTime;
      out.gain.cancelScheduledValues(now);
      out.gain.setValueAtTime(out.gain.value, now);
      out.gain.linearRampToValueAtTime(0, now + fade);
      setTimeout(() => {
        for (const s of sources) { try { s.stop(); } catch { /* já parado */ } }
        for (const n of [out, ...sources, ...extra]) { try { n.disconnect(); } catch { /* ok */ } }
      }, fade * 1000 + 200);
    },
  };
}

/** Chiado de vinil em loop, com fade-in. */
export function vinylLoop(ctx, dest, level = 0.5, fadeIn = 1.5) {
  const src = ctx.createBufferSource();
  src.buffer = makeVinyl(ctx);
  src.loop = true;
  src.playbackRate.value = rand(0.95, 1.05);
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 500;
  const out = ctx.createGain();
  const now = ctx.currentTime;
  out.gain.setValueAtTime(0, now);
  out.gain.linearRampToValueAtTime(level, now + fadeIn);
  src.connect(hp); hp.connect(out); out.connect(dest);
  src.start(now, Math.random() * 3);
  return handle(ctx, out, [src], [hp]);
}

/**
 * Vento: ruído num passa-banda cuja frequência e volume "respiram" devagar (LFOs lentos).
 * level = volume médio; bright = frequência central.
 */
export function windLoop(ctx, noiseBuf, dest, level = 0.3, { bright = 520, fadeIn = 2 } = {}) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf; src.loop = true;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = bright; bp.Q.value = 0.8;
  const lfoF = ctx.createOscillator(); lfoF.frequency.value = rand(0.05, 0.09);
  const lfoFg = ctx.createGain(); lfoFg.gain.value = bright * 0.45;
  const lfoA = ctx.createOscillator(); lfoA.frequency.value = rand(0.08, 0.14);
  const lfoAg = ctx.createGain(); lfoAg.gain.value = 0.45;
  const swell = ctx.createGain(); swell.gain.value = 0.6;   // 0.6 ± 0.45 → rajadas
  const out = ctx.createGain();
  const now = ctx.currentTime;
  out.gain.setValueAtTime(0, now);
  out.gain.linearRampToValueAtTime(level, now + fadeIn);
  lfoF.connect(lfoFg); lfoFg.connect(bp.frequency);
  lfoA.connect(lfoAg); lfoAg.connect(swell.gain);
  src.connect(bp); bp.connect(swell); swell.connect(out); out.connect(dest);
  src.start(now, Math.random() * 1.5); lfoF.start(now); lfoA.start(now);
  return handle(ctx, out, [src, lfoF, lfoA], [bp, lfoFg, lfoAg, swell]);
}
