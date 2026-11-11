// Áudio do Mundo Olhos — tudo sintetizado na hora com Web Audio API (nenhum arquivo de som).
//
// Mixer:  [música] → musicBus ─┐                       ┌→ compressor suave → saída
//         [efeitos/vozes] → sfxBus ─┼→ master ──────────┘
//         [ambiente] → ambBus → sfxBus
//         envios de reverb (musicWet / sfxWet) → Convolver (impulso gerado) → master
//
// Antes do init() (que precisa de um gesto do usuário) tudo é ignorado sem erro;
// só setMusic() lembra o pedido para tocar assim que o áudio destravar.
import { REGIONS } from '../data/worldmap.js';
import { createSynth, makeImpulse } from './synth.js';
import { makeInstruments } from './instruments.js';
import { makeSfx } from './sfx.js';
import { makeVoices } from './voices.js';
import { createMusic } from './music.js';
import { createAmbient } from './ambient.js';

const REGION_MUSIC = Object.fromEntries(REGIONS.map((r) => [r.id, r.music || r.id]));
const AUTO_IDS = new Set(Object.values(REGION_MUSIC));   // músicas de região = modo automático
const MIN_GAP = { passo: 0.07, jujuba: 0.04, agua: 0.1, mover: 0.03, clique: 0.03, dialogo: 0.05, piado: 0.12, ovo: 0.2 };
const AUTO_SWITCH_GAP = 3;                                // s mínimos entre trocas automáticas de música

// curva perceptiva para os sliders (0..1)
const volCurve = (v) => Math.pow(Math.max(0, Math.min(1, Number(v) || 0)), 1.6);

export function createAudio(game) {
  let ctx = null, disabled = false;
  let S, I, sfx, voices, music, ambient;
  let buses = null;
  const vol = { music: game?.state?.settings?.music ?? 0.6, sfx: game?.state?.settings?.sfx ?? 0.8 };

  // estado da música automática
  let forced = null;          // música especial imposta (menu/cafe/noite) | '' = silêncio | null = automático
  let regionId = null;        // região atual (do bus 'region:enter')
  let phase = null;           // fase do dia (do bus 'time:phase')
  let lastAutoSwitch = -99;
  let pollT = 0;
  const lastPlay = {};

  // ---------------------------------------------------------------------------------------------
  function buildMixer() {
    const master = ctx.createGain();
    master.gain.value = 0.85;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 18; comp.ratio.value = 3.5;
    comp.attack.value = 0.008; comp.release.value = 0.25;
    master.connect(comp); comp.connect(ctx.destination);

    const reverb = ctx.createConvolver();
    reverb.buffer = makeImpulse(ctx, 2.6, 3.2);
    const revReturn = ctx.createGain();
    revReturn.gain.value = 0.7;
    reverb.connect(revReturn); revReturn.connect(master);

    const musicBus = ctx.createGain(); musicBus.connect(master);
    const musicWet = ctx.createGain(); musicWet.connect(reverb);
    const sfxBus = ctx.createGain(); sfxBus.connect(master);
    const sfxWet = ctx.createGain(); sfxWet.connect(reverb);
    const ambBus = ctx.createGain(); ambBus.gain.value = 0.7; ambBus.connect(sfxBus);
    return { master, comp, reverb, musicBus, musicWet, sfxBus, sfxWet, ambBus };
  }

  function applyVolumes(ramp = 0.15) {
    if (!buses) return;
    const t = ctx.currentTime;
    const m = volCurve(vol.music) * 0.75, s = volCurve(vol.sfx);
    for (const [node, v] of [[buses.musicBus, m], [buses.musicWet, m], [buses.sfxBus, s], [buses.sfxWet, s]]) {
      node.gain.cancelScheduledValues(t);
      node.gain.setTargetAtTime(v, t, ramp / 3);
    }
  }

  const ready = () => !!ctx && !disabled && !!buses;
  const now = () => ctx.currentTime + 0.005;
  const Rsfx = () => ({ pool: 'sfx', dest: buses.sfxBus, send: buses.sfxWet, wet: 0.12 });
  const Rvoice = () => ({ pool: 'voice', dest: buses.sfxBus, send: buses.sfxWet, wet: 0.08 });

  // ---------------------------------------------------------------------------------------------
  // Música: qual deveria estar tocando agora?
  function desiredMusic() {
    if (forced !== null) return forced || null;
    const reg = regionId ? REGION_MUSIC[regionId] : null;
    if (phase === 'noite' && reg !== 'pico') return 'noite';
    return reg || 'campo';
  }
  function applyMusic(isAuto = false) {
    if (!ready()) return;
    const want = desiredMusic();
    if (want === music.current) return;
    const t = ctx.currentTime;
    if (isAuto && t - lastAutoSwitch < AUTO_SWITCH_GAP) return;
    lastAutoSwitch = t;
    music.play(want);
  }

  // ---------------------------------------------------------------------------------------------
  // Eventos do jogo
  game?.bus?.on('region:enter', (p) => { if (p?.id) regionId = p.id; });
  game?.bus?.on('time:phase', (p) => { if (p?.phase) phase = p.phase; });
  game?.bus?.on('session:start', () => {
    if (forced === 'menu') forced = null;    // saiu do menu: volta a música do lugar
    lastAutoSwitch = -99;
    applyMusic();
  });

  // Destrava sozinho no primeiro gesto (para a música do menu tocar já no primeiro clique/tecla).
  const unlock = () => { api.init(); if (ctx?.state === 'running') removeUnlock(); };
  const removeUnlock = () => { for (const ev of ['pointerdown', 'keydown', 'touchstart']) removeEventListener(ev, unlock, true); };
  if (typeof addEventListener === 'function') {
    for (const ev of ['pointerdown', 'keydown', 'touchstart']) addEventListener(ev, unlock, true);
    // aba escondida: suspende (o agendador não fica embolando notas atrasadas)
    document.addEventListener?.('visibilitychange', () => {
      if (!ctx || disabled) return;
      if (document.hidden) ctx.suspend?.().catch(() => {});
      else ctx.resume?.().catch(() => {});
    });
  }

  // ---------------------------------------------------------------------------------------------
  const api = {
    /** Cria/resume o AudioContext. Seguro chamar várias vezes (deve vir de um gesto do usuário). */
    init() {
      if (disabled) return;
      if (!ctx) {
        const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AC) { disabled = true; return; }
        try {
          ctx = new AC({ latencyHint: 'interactive' });
          buses = buildMixer();
          S = createSynth(ctx);
          I = makeInstruments(S);
          sfx = makeSfx(S, I);
          voices = makeVoices(S, I);
          music = createMusic(S, I, buses.musicBus, buses.musicWet);
          ambient = createAmbient(S, I, buses.ambBus, buses.sfxWet);
          applyVolumes(0.01);
        } catch (e) {
          console.warn('[audio] Web Audio indisponível:', e);
          disabled = true; ctx = null; buses = null;
          return;
        }
      }
      if (ctx.state === 'suspended' && !document.hidden) ctx.resume().catch(() => {});
      applyMusic();
    },

    setVolumes({ music: m, sfx: s } = {}) {
      if (m != null) vol.music = m;
      if (s != null) vol.sfx = s;
      applyVolumes();
    },

    update(dt) {
      if (!ready()) return;
      // fallback de sondagem (1x/s): região e fase caso os eventos tenham acontecido antes
      pollT -= dt;
      if (pollT <= 0) {
        pollT = 1;
        const p = game?.player?.position;
        if (!regionId && p) regionId = game.world?.regionAt?.(p.x, p.z) ?? null;
        const ph = game?.render?.timePhase?.();
        if (ph) phase = ph;
      }
      applyMusic(true);
      try { ambient.update(dt, { region: regionId, phase: phase || 'dia' }); } catch (e) { console.error('[audio] ambiente', e); }
    },

    play(name) {
      if (!ready() || ctx.state !== 'running') return;
      const t = ctx.currentTime;
      const gap = MIN_GAP[name] ?? 0.025;
      if (t - (lastPlay[name] ?? -1) < gap) return;
      lastPlay[name] = t;
      try { sfx.play(Rsfx(), name, now()); } catch (e) { console.error('[audio] efeito', name, e); }
    },

    murmur(voice, char) {
      if (!ready() || ctx.state !== 'running') return;
      try { voices.murmur(Rvoice(), voice || {}, char); } catch (e) { console.error('[audio] murmúrio', e); }
    },

    quimVoice(name) {
      if (!ready() || ctx.state !== 'running') return;
      try { voices.quim(Rvoice(), name, now()); } catch (e) { console.error('[audio] voz da Quim', e); }
    },

    pincesoVoice(name) {
      if (!ready() || ctx.state !== 'running') return;
      try { voices.pinceso(Rvoice(), name, now()); } catch (e) { console.error('[audio] voz do Pinceso', e); }
    },

    /** Nota de passarinho 0..4 (pentatônica) — coral. */
    note(i) {
      if (!ready() || ctx.state !== 'running') return;
      try { voices.note({ ...Rsfx(), wet: 0.3 }, i, now()); } catch (e) { console.error('[audio] nota', e); }
    },

    /**
     * Música: id de região ('campo','vila',...) = modo automático (segue região e noite);
     * id especial ('menu','cafe','noite') fica forçado até outro setMusic; null = silêncio.
     */
    setMusic(id) {
      if (id == null) forced = '';
      else if (AUTO_IDS.has(id)) { forced = null; if (!regionId) regionId = REGIONS.find((r) => (r.music || r.id) === id)?.id ?? null; }
      else forced = id;
      applyMusic();
    },

    /** Extra: ajusta a música atual (camadas da música da Casinha Asas de Saudade). */
    musicParams(o) { if (ready()) music.params(o); },

    // extras para testes/depuração (fora do contrato)
    get ready() { return ready() && ctx.state === 'running'; },
    get context() { return ctx; },
    get output() { return buses?.comp ?? null; },
    get currentMusic() { return music?.current ?? null; },
    get pools() { return S?.pools; },
    get sfxNames() { return sfx?.names ?? []; },
  };
  return api;
}
