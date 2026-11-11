// Núcleo de síntese do Mundo Olhos: "grupos" de vozes descartáveis, envelopes sem clique,
// ruído, impulso de reverb gerado e utilidades de teoria musical.
//
// Um GRUPO é um som (um efeito, uma nota, uma sílaba). Ele registra todos os nós que cria;
// quando a última fonte (oscilador/ruído) termina, desconecta tudo e libera a vaga do pool.
// Os pools limitam vozes simultâneas por categoria — se estiver cheio, o som é descartado
// (melhor perder um passinho do que saturar o mixer).

export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const chance = (p) => Math.random() < p;

const SILENT = 0.0001; // alvo das rampas exponenciais (≈ -80 dB, inaudível e sem clique)

/** Buffer de ruído branco (mono) — compartilhado por todos os sons de ruído. */
export function makeNoiseBuffer(ctx, seconds = 2) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

/**
 * Resposta ao impulso estéreo para o ConvolverNode: ruído com decaimento exponencial,
 * pré-atraso curto e passa-baixa que vai fechando (cauda "de veludo", nada metálica).
 */
export function makeImpulse(ctx, seconds = 2.6, decay = 3.2) {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * seconds);
  const pre = Math.floor(sr * 0.018);
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const x = (i - pre) / (len - pre);
      const k = 0.55 - 0.45 * x;                 // coeficiente do passa-baixa (escurece com o tempo)
      lp += k * ((Math.random() * 2 - 1) - lp);
      d[i] = lp * Math.pow(1 - x, decay) * 0.9;
    }
  }
  return buf;
}

/**
 * Aplica pontos de automação: pts = [[dt, valor], ...] a partir de t0.
 * exp=true usa rampas exponenciais (natural para frequência).
 */
export function curve(param, t0, pts, exp = true) {
  param.setValueAtTime(pts[0][1], t0 + pts[0][0]);
  for (let i = 1; i < pts.length; i++) {
    const [dt, v] = pts[i];
    if (exp) param.exponentialRampToValueAtTime(Math.max(v, SILENT), t0 + dt);
    else param.linearRampToValueAtTime(v, t0 + dt);
  }
}

/**
 * Envelope de amplitude sem cliques: sobe de 0 em `a`, segura (com decaimento opcional até `sus`)
 * até `hold`, e solta exponencialmente em `r`. Retorna o instante em que o som acabou.
 */
export function env(param, t, { a = 0.005, peak = 1, hold = 0, sus = 1, r = 0.2 } = {}) {
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + a);
  if (hold > 0) {
    if (sus < 1) param.exponentialRampToValueAtTime(Math.max(peak * sus, SILENT), t + a + hold);
    else param.setValueAtTime(peak, t + a + hold);
  }
  const end = t + a + hold + r;
  param.exponentialRampToValueAtTime(SILENT, end);
  param.setValueAtTime(0, end + 0.005);
  return end + 0.01;
}

export function createSynth(ctx) {
  const noiseBuf = makeNoiseBuffer(ctx, 2);
  const pools = {
    sfx: { active: 0, max: 26 },
    voice: { active: 0, max: 8 },
    music: { active: 0, max: 96 },
    amb: { active: 0, max: 14 },
  };

  /**
   * Cria um grupo ligado a `dest`. opts: { pan, send:AudioNode, sendLevel, force }.
   * Retorna null se o pool estiver cheio (o chamador simplesmente não toca).
   */
  function group(poolName, dest, { pan = 0, send = null, sendLevel = 0, force = false } = {}) {
    const pool = pools[poolName];
    if (!force && pool.active >= pool.max) return null;
    pool.active++;
    const nodes = [];
    let pending = 0, done = false;
    const out = ctx.createGain();
    nodes.push(out);
    let tail = out;
    if (pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      out.connect(p); nodes.push(p); tail = p;
    }
    tail.connect(dest);
    if (send && sendLevel > 0) {
      const s = ctx.createGain();
      s.gain.value = sendLevel;
      tail.connect(s); s.connect(send); nodes.push(s);
    }
    function finish() {
      if (done) return;
      done = true;
      pool.active--;
      for (const n of nodes) { try { n.disconnect(); } catch { /* já desconectado */ } }
    }
    function addSource(src, t0, t1) {
      nodes.push(src);
      pending++;
      src.onended = () => { if (--pending <= 0) finish(); };
      src.start(t0);
      src.stop(Math.max(t1, t0 + 0.01));
      return src;
    }
    const g = {
      out,
      /** Oscilador; freq é número ou pontos [[dt,f],...] (relativos a t0). */
      osc(type, t0, t1, freq, { detune = 0, exp = true } = {}) {
        const o = ctx.createOscillator();
        o.type = type;
        if (Array.isArray(freq)) curve(o.frequency, t0, freq, exp);
        else o.frequency.setValueAtTime(freq, t0);
        if (detune) o.detune.setValueAtTime(detune, t0);
        return addSource(o, t0, t1);
      },
      /** Ruído branco tocando de um ponto aleatório do buffer. */
      noise(t0, t1, rate = 1) {
        const s = ctx.createBufferSource();
        s.buffer = noiseBuf;
        s.loop = true;
        s.playbackRate.value = rate;
        s.loopStart = 0; s.loopEnd = noiseBuf.duration;
        nodes.push(s);
        pending++;
        s.onended = () => { if (--pending <= 0) finish(); };
        s.start(t0, Math.random() * (noiseBuf.duration - 0.1));
        s.stop(Math.max(t1, t0 + 0.01));
        return s;
      },
      /** Fonte de buffer qualquer (loops de vinil/vento). */
      buffer(buf, t0, t1, { loop = false, rate = 1 } = {}) {
        const s = ctx.createBufferSource();
        s.buffer = buf; s.loop = loop; s.playbackRate.value = rate;
        return addSource(s, t0, t1);
      },
      gain(v = 0) { const n = ctx.createGain(); n.gain.value = v; nodes.push(n); return n; },
      filter(type, freq, Q = 0.7) {
        const f = ctx.createBiquadFilter();
        f.type = type; f.frequency.value = freq; f.Q.value = Q;
        nodes.push(f);
        return f;
      },
      /** LFO somado a um AudioParam (ex.: vibrato em cents no detune). */
      lfo(t0, t1, rate, depth, param, { type = 'sine', delay = 0, fadeIn = 0 } = {}) {
        const o = ctx.createOscillator();
        o.type = type; o.frequency.value = rate;
        const d = ctx.createGain();
        if (delay || fadeIn) {
          d.gain.setValueAtTime(0, t0);
          d.gain.setValueAtTime(0, t0 + delay);
          d.gain.linearRampToValueAtTime(depth, t0 + delay + Math.max(0.01, fadeIn));
        } else d.gain.value = depth;
        o.connect(d); d.connect(param);
        nodes.push(d);
        addSource(o, t0, t1);
        return d;
      },
      /** Conecta em série e retorna o último nó. */
      chain(...ns) { for (let i = 0; i < ns.length - 1; i++) ns[i].connect(ns[i + 1]); return ns[ns.length - 1]; },
      env,
    };
    return g;
  }

  return { ctx, noiseBuf, pools, group };
}

// ---------------------------------------------------------------------------------------------
// Teoria musical
export const SCALES = {
  maior: [0, 2, 4, 5, 7, 9, 11],
  penta: [0, 2, 4, 7, 9],
  pentaMenor: [0, 3, 5, 7, 10],
  dorico: [0, 2, 3, 5, 7, 9, 10],
  lidio: [0, 2, 4, 6, 7, 9, 11],
};

/** Grau da escala (pode ser negativo ou passar da oitava) → nota MIDI. */
export function degree(root, scale, d) {
  const n = scale.length;
  const oct = Math.floor(d / n);
  const i = ((d % n) + n) % n;
  return root + oct * 12 + scale[i];
}

/** Nota MIDI mais próxima de `m` que pertence à escala. */
export function snap(root, scale, m) {
  for (let k = 0; k < 12; k++) {
    for (const s of [m - k, m + k]) {
      const pc = (((s - root) % 12) + 12) % 12;
      if (scale.includes(pc)) return s;
    }
  }
  return m;
}
