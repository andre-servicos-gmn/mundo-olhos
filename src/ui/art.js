// Arte da interface desenhada em SVG (nada de imagens externas): Quim, Pinceso, título com olhinhos,
// jujubas, ícones de acessórios, xícaras e retratos dos moradores.
// As cores seguem os modelos 3D (player/quim-model.js e pinceso/model.js).
import { esc, shade } from './dom.js';

const QUIM = { skin: '#f7c6a3', blush: '#ff8fa6', hair: '#5b3122', hair2: '#7b4630', dress: '#ffcd3c',
  heart: '#ff5f8f', shoe: '#ff5d8f', iris: '#b8632b', iris2: '#f3b85a', ink: '#2a1420' };
const PIN = { body: '#9fe22f', crest: '#bdf150', belly: '#f0fb72', wing: '#7ccf36', wingTip: '#3faf5c',
  tail: '#35c3b0', tail2: '#2b9fd2', cheek: '#ff8fb3', beak: '#ffa83c', ink: '#24152f' };

let uid = 0;

// ------------------------------------------------------------------------------------------------
// Quim. mood: 'feliz' | 'surpresa' | 'triste' | 'curiosa' | 'sono'. head=true recorta só a cabeça (retrato).
export function quimSVG({ mood = 'feliz', head = false, cls = '' } = {}) {
  const id = 'q' + (++uid);
  // cachos: anel de círculos em volta da cabeça
  const curls = [];
  const ring = [[60, 20, 17], [38, 26, 16], [82, 26, 16], [22, 44, 15], [98, 44, 15], [16, 66, 14], [104, 66, 14],
    [20, 88, 14], [100, 88, 14], [30, 104, 12], [90, 104, 12], [48, 18, 13], [72, 18, 13]];
  for (const [x, y, r] of ring) curls.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="${QUIM.hair}"/>`);
  for (const [x, y, r] of ring.filter((_, i) => i % 2 === 0)) curls.push(`<circle cx="${x - r * 0.25}" cy="${y - r * 0.3}" r="${r * 0.45}" fill="${QUIM.hair2}"/>`);
  const bangs = [[40, 40, 10], [52, 35, 10], [64, 34, 10], [76, 37, 10], [86, 44, 9]]
    .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${QUIM.hair}"/><circle cx="${x - 2}" cy="${y - 3}" r="${r * 0.4}" fill="${QUIM.hair2}"/>`).join('');

  const eye = (x, flip) => {
    const lashes = [0, 1, 2].map((i) => {
      const a = (-150 + i * 22) * (flip ? -1 : 1) + (flip ? 180 : 0);
      const rad = (a * Math.PI) / 180, x1 = x + Math.cos(rad) * 9, y1 = 62 + Math.sin(rad) * 11;
      return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${(x1 + Math.cos(rad) * 5).toFixed(1)}" y2="${(y1 + Math.sin(rad) * 5).toFixed(1)}" stroke="${QUIM.ink}" stroke-width="2.4" stroke-linecap="round"/>`;
    }).join('');
    const surpresa = mood === 'surpresa';
    const ry = mood === 'sono' ? 3 : surpresa ? 12.5 : 11;
    return `<g class="mo-eye" style="transform-origin:${x}px 64px">
      <ellipse cx="${x}" cy="64" rx="${surpresa ? 10 : 9}" ry="${ry}" fill="#fff"/>
      ${mood === 'sono' ? '' : `<g class="mo-pupil">
        <ellipse cx="${x}" cy="66" rx="${surpresa ? 5.6 : 7.4}" ry="${surpresa ? 6 : 8.6}" fill="url(#${id}i)"/>
        <ellipse cx="${x}" cy="66.5" rx="${surpresa ? 2.6 : 3.8}" ry="${surpresa ? 2.8 : 4.6}" fill="${QUIM.ink}"/>
        <circle cx="${x + 2.8}" cy="62" r="2.6" fill="#fff"/><circle cx="${x - 2.6}" cy="70" r="1.2" fill="#fff"/></g>`}
      <path d="M${x - 9.6} ${mood === 'sono' ? 64 : 63} Q${x} ${mood === 'sono' ? 58 : 50.5} ${x + 9.6} ${mood === 'sono' ? 64 : 63}" stroke="${QUIM.ink}" stroke-width="2.8" fill="none" stroke-linecap="round"/>
      ${lashes}</g>`;
  };
  const mouths = {
    feliz: `<path d="M53 80 Q60 88 67 80 Q60 84 53 80Z" fill="#7c2638"/><path d="M56 83 Q60 86 64 83" fill="#ff8aa0"/>`,
    surpresa: `<ellipse cx="60" cy="82" rx="3.6" ry="4.4" fill="#7c2638"/>`,
    triste: `<path d="M54 84 Q60 79 66 84" stroke="#7c2638" stroke-width="2.4" fill="none" stroke-linecap="round"/>`,
    curiosa: `<path d="M55 82 Q60 84 66 80" stroke="#7c2638" stroke-width="2.4" fill="none" stroke-linecap="round"/>`,
    sono: `<ellipse cx="60" cy="82" rx="2.6" ry="3" fill="#7c2638"/>`,
  };
  const brows = mood === 'curiosa' ? `<path d="M40 47 Q47 43 54 47" stroke="${QUIM.hair}" stroke-width="2.6" fill="none" stroke-linecap="round"/>` : '';
  const body = head ? '' : `
    <g class="mo-q-body">
      <rect x="45" y="128" width="9" height="20" rx="4" fill="${QUIM.skin}"/><rect x="66" y="128" width="9" height="20" rx="4" fill="${QUIM.skin}"/>
      <rect x="44" y="140" width="11" height="6" fill="#fff"/><rect x="65" y="140" width="11" height="6" fill="#fff"/>
      <ellipse cx="49" cy="150" rx="8" ry="5" fill="${QUIM.shoe}"/><ellipse cx="71" cy="150" rx="8" ry="5" fill="${QUIM.shoe}"/>
      <ellipse cx="32" cy="112" rx="6" ry="9" fill="${QUIM.skin}" transform="rotate(25 32 112)"/>
      <ellipse cx="88" cy="112" rx="6" ry="9" fill="${QUIM.skin}" transform="rotate(-25 88 112)"/>
      <path d="M44 97 Q60 93 76 97 L88 132 Q60 138 32 132 Z" fill="${QUIM.dress}"/>
      <path d="M32 132 Q60 138 88 132 L87 128 Q60 134 33 128Z" fill="#fff"/>
      <path d="M60 116 l-5 -5 a3.2 3.2 0 0 1 5 -4 a3.2 3.2 0 0 1 5 4z" fill="${QUIM.heart}"/>
    </g>`;
  const vb = head ? '8 6 104 104' : '0 0 120 160';
  return `<svg class="mo-quim ${cls}" viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs><radialGradient id="${id}i" cx="50%" cy="70%" r="60%"><stop offset="0" stop-color="${QUIM.iris2}"/><stop offset="1" stop-color="${QUIM.iris}"/></radialGradient></defs>
    ${body}
    <g class="mo-q-head">
      ${curls.join('')}
      <ellipse cx="60" cy="66" rx="30" ry="28" fill="${QUIM.skin}"/>
      ${bangs}
      ${brows}
      ${eye(47, false)}${eye(73, true)}
      <ellipse cx="38" cy="78" rx="6" ry="3.6" fill="${QUIM.blush}" opacity=".7"/><ellipse cx="82" cy="78" rx="6" ry="3.6" fill="${QUIM.blush}" opacity=".7"/>
      ${mouths[mood] || mouths.feliz}
    </g>
  </svg>`;
}

// ------------------------------------------------------------------------------------------------
// Pinceso: periquito redondinho verde-limão.
export function pincesoSVG({ cls = '', mood = 'feliz' } = {}) {
  const sleepy = mood === 'sono';
  return `<svg class="mo-pinceso ${cls}" viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M14 52 Q2 62 4 74 Q14 66 22 60Z" fill="${PIN.tail}"/><path d="M16 56 Q8 66 10 74 Q18 66 22 61Z" fill="${PIN.tail2}"/>
    <g class="mo-p-crest"><path d="M36 14 L33 2 L41 11 L44 0 L47 12 L54 5 L51 17Z" fill="${PIN.crest}"/></g>
    <circle cx="42" cy="42" r="28" fill="${PIN.body}"/>
    <ellipse cx="44" cy="55" rx="17" ry="13" fill="${PIN.belly}"/>
    <ellipse class="mo-p-wing" cx="22" cy="46" rx="9" ry="15" fill="${PIN.wing}" transform="rotate(18 22 46)" style="transform-origin:26px 36px"/>
    <ellipse cx="20" cy="56" rx="5" ry="6" fill="${PIN.wingTip}" transform="rotate(18 20 56)"/>
    <g class="mo-eye" style="transform-origin:42px 36px">
      ${sleepy ? `<path d="M30 37 Q35 40 40 37 M46 37 Q51 40 56 37" stroke="${PIN.ink}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`
        : `<ellipse cx="35" cy="36" rx="6.5" ry="8" fill="#fff"/><ellipse cx="51" cy="36" rx="6.5" ry="8" fill="#fff"/>
      <g class="mo-pupil"><circle cx="36" cy="37" r="4.4" fill="${PIN.ink}"/><circle cx="50" cy="37" r="4.4" fill="${PIN.ink}"/>
      <circle cx="37.6" cy="35" r="1.6" fill="#fff"/><circle cx="51.6" cy="35" r="1.6" fill="#fff"/></g>`}
    </g>
    <ellipse cx="27" cy="47" rx="5" ry="3.4" fill="${PIN.cheek}"/><ellipse cx="59" cy="47" rx="5" ry="3.4" fill="${PIN.cheek}"/>
    <path d="M38 43 Q43 40 48 43 Q46 51 43 52 Q40 51 38 43Z" fill="${PIN.beak}"/>
    <path d="M38 43 Q43 46 48 43" stroke="#e07f22" stroke-width="1" fill="none"/>
    <path d="M36 69 l-2 6 M36 69 l2 6 M50 69 l-2 6 M50 69 l2 6" stroke="#ff9f8a" stroke-width="2.4" stroke-linecap="round"/>
  </svg>`;
}

// ------------------------------------------------------------------------------------------------
// Olhinho para as letras "o" do título (pisca e olha em volta via CSS).
export function eyeLetterSVG(big = false) {
  return `<svg class="mo-eyeletter${big ? ' big' : ''}" viewBox="0 0 40 40" aria-hidden="true">
    <circle cx="20" cy="20" r="17" fill="#fff" stroke="currentColor" stroke-width="5"/>
    <g class="mo-eyeletter-pupil"><circle cx="20" cy="21" r="8.5" fill="#2b1838"/><circle cx="23.5" cy="17.5" r="3" fill="#fff"/></g>
    <rect class="mo-eyeletter-lid" x="2" y="2" width="36" height="36" rx="18" fill="currentColor"/>
  </svg>`;
}

/** Título "Mundo Olhos" com as letras o/O virando olhinhos. */
export function titleHTML(text = 'Mundo Olhos') {
  let i = 0;
  return `<h1 class="mo-title" aria-label="${esc(text)}">${[...text].map((ch) => {
    const d = `style="--i:${i++}"`;
    if (ch === ' ') return '<span class="sp"> </span>';
    if (ch === 'o' || ch === 'O') return `<span class="ch eye" ${d}>${eyeLetterSVG(ch === 'O')}</span>`;
    return `<span class="ch" ${d}>${esc(ch)}</span>`;
  }).join('')}</h1>`;
}

// ------------------------------------------------------------------------------------------------
// Jujuba (moeda): gota de goma com açúcar.
export const JUJUBA_COLORS = ['#ff6fa8', '#ffd23f', '#7fd8ff', '#8ef0c0', '#c792ff', '#ff9f6b'];
export function jujubaSVG(color = '#ff6fa8', cls = '') {
  const d = shade(color, -0.22);
  return `<svg class="mo-jujuba ${cls}" viewBox="0 0 32 32" aria-hidden="true">
    <path d="M5 25 Q4 8 16 6 Q28 8 27 25 Q16 29 5 25Z" fill="${color}" stroke="${d}" stroke-width="1.6"/>
    <path d="M9 12 Q12 8 16 8" stroke="#fff" stroke-opacity=".75" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <circle cx="20" cy="14" r="1" fill="#fff" opacity=".8"/><circle cx="12" cy="20" r="1" fill="#fff" opacity=".8"/>
    <circle cx="22" cy="21" r=".9" fill="#fff" opacity=".8"/><circle cx="16" cy="17" r=".8" fill="#fff" opacity=".8"/>
  </svg>`;
}

// ------------------------------------------------------------------------------------------------
// Acessórios (loja e diário).
export function accessorySVG(id) {
  const s = {
    laco: `<path d="M32 30 L10 16 Q4 30 10 44Z" fill="#ff8fc7" stroke="#e0609f" stroke-width="2"/>
      <path d="M32 30 L54 16 Q60 30 54 44Z" fill="#ff8fc7" stroke="#e0609f" stroke-width="2"/>
      <path d="M28 32 L22 54 L28 50 L31 56 L33 33Z M36 32 L42 54 L36 50 L33 56 L31 33Z" fill="#ff6fb0"/>
      <rect x="26" y="23" width="12" height="14" rx="5" fill="#ff6fb0" stroke="#e0609f" stroke-width="2"/>`,
    chapeu: `<ellipse cx="32" cy="42" rx="28" ry="9" fill="#f6d88a" stroke="#d8b260" stroke-width="2"/>
      <path d="M16 41 Q16 16 32 16 Q48 16 48 41Z" fill="#ffe3a0" stroke="#d8b260" stroke-width="2"/>
      <path d="M16 36 Q32 41 48 36 L48 41 Q32 46 16 41Z" fill="#ff8fc7"/><circle cx="44" cy="37" r="4" fill="#fff3a3" stroke="#ffb84d"/>`,
    cachecol: `<path d="M10 22 Q32 32 54 22 L56 32 Q32 42 8 32Z" fill="#8fd3ff" stroke="#5aa9e6" stroke-width="2"/>
      <path d="M40 34 L44 58 L52 56 L48 32Z" fill="#8fd3ff" stroke="#5aa9e6" stroke-width="2"/>
      <path d="M16 26 L18 34 M24 28 L26 36 M32 29 L32 37 M40 28 L38 36 M44 50 L50 49" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>`,
    oculos: `<circle cx="20" cy="34" r="11" fill="#d7f1ff" fill-opacity=".8" stroke="#c792ff" stroke-width="3.4"/>
      <circle cx="44" cy="34" r="11" fill="#d7f1ff" fill-opacity=".8" stroke="#c792ff" stroke-width="3.4"/>
      <path d="M31 32 Q32 28 33 32" stroke="#c792ff" stroke-width="3" fill="none"/>
      <path d="M14 30 Q17 26 21 27 M38 30 Q41 26 45 27" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round"/>
      <path d="M17 38 q3 3 6 0 M41 38 q3 3 6 0" stroke="#ff8fc7" stroke-width="1.8" fill="none" stroke-linecap="round"/>`,
    tiara_penas: `<path d="M10 46 Q32 34 54 46" stroke="#ffd23f" stroke-width="4.5" fill="none" stroke-linecap="round"/>
      <path d="M32 40 Q24 20 32 6 Q40 20 32 40Z" fill="#6ec6ff" stroke="#3a8fd0" stroke-width="1.6"/>
      <path d="M22 43 Q10 28 14 14 Q26 26 22 43Z" fill="#ff7aa8" stroke="#d9507f" stroke-width="1.6"/>
      <path d="M42 43 Q54 28 50 14 Q38 26 42 43Z" fill="#b8f27c" stroke="#7cc04a" stroke-width="1.6"/>
      <circle cx="32" cy="40" r="3.6" fill="#fff" stroke="#ffd23f" stroke-width="1.6"/>`,
    coroa_flores: `<path d="M8 40 Q32 30 56 40" stroke="#7cc16b" stroke-width="4" fill="none" stroke-linecap="round"/>
      ${[[12, 36, '#ff8fc7'], [24, 31, '#ffd166'], [36, 30, '#c49bff'], [48, 34, '#ff9f6b']].map(([x, y, c]) =>
        `<g transform="translate(${x} ${y})">${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="0" cy="-5" rx="3.6" ry="5" fill="${c}" transform="rotate(${a})"/>`).join('')}<circle r="3" fill="#fff3a3"/></g>`).join('')}`,
  }[id];
  return `<svg class="mo-acc" viewBox="0 0 64 64" aria-hidden="true">${s || `<text x="32" y="42" font-size="30" text-anchor="middle">🎀</text>`}</svg>`;
}

// ------------------------------------------------------------------------------------------------
// Xícara com olhinhos e vapor (cardápio da cafeteria). color = cor da bebida.
export function cupSVG(color = '#ffb3c7', { foam = '#fff6ea' } = {}) {
  const d = shade(color, -0.25);
  return `<svg class="mo-cup" viewBox="0 0 80 80" aria-hidden="true">
    <g class="mo-steam" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" opacity=".9">
      <path d="M30 22 q-5 -6 0 -12 q5 -6 0 -10"/><path d="M42 20 q-5 -6 0 -12 q5 -6 0 -10"/>
    </g>
    <ellipse cx="38" cy="70" rx="30" ry="6" fill="#ffffff" stroke="#e6d9ef" stroke-width="2"/>
    <path d="M58 40 q14 0 12 12 q-2 10 -14 8" fill="none" stroke="#fff" stroke-width="6"/>
    <path d="M58 40 q14 0 12 12 q-2 10 -14 8" fill="none" stroke="#efe3f5" stroke-width="2"/>
    <path d="M14 32 L62 32 Q62 66 38 67 Q14 66 14 32Z" fill="#ffffff" stroke="#e6d9ef" stroke-width="2"/>
    <ellipse cx="38" cy="32" rx="24" ry="6" fill="${color}" stroke="${d}" stroke-width="1.5"/>
    <ellipse cx="34" cy="31" rx="10" ry="2.6" fill="${foam}" opacity=".85"/>
    <g class="mo-eye" style="transform-origin:38px 48px">
      <ellipse cx="31" cy="48" rx="3" ry="4" fill="#2b1838"/><ellipse cx="45" cy="48" rx="3" ry="4" fill="#2b1838"/>
      <circle cx="32" cy="46.5" r="1.1" fill="#fff"/><circle cx="46" cy="46.5" r="1.1" fill="#fff"/>
    </g>
    <path d="M35 55 q3 3 6 0" stroke="#2b1838" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <ellipse cx="24" cy="54" rx="3.4" ry="2" fill="#ffb3c7"/><ellipse cx="52" cy="54" rx="3.4" ry="2" fill="#ffb3c7"/>
    <path d="M20 36 Q20 52 26 60" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" opacity=".9"/>
  </svg>`;
}

// ------------------------------------------------------------------------------------------------
// Passarinho do coral (botões do minigame).
export function birdSVG(color) {
  const d = shade(color, -0.25);
  return `<svg class="mo-bird" viewBox="0 0 64 64" aria-hidden="true">
    <path d="M8 40 Q0 44 2 52 Q10 48 14 44Z" fill="${d}"/>
    <circle cx="32" cy="36" r="22" fill="${color}" stroke="${d}" stroke-width="2"/>
    <ellipse cx="34" cy="46" rx="12" ry="8" fill="#fff" opacity=".55"/>
    <path d="M28 14 L26 6 L32 12 L35 4 L36 14Z" fill="${d}"/>
    <g class="mo-eye" style="transform-origin:32px 31px">
      <ellipse cx="25" cy="31" rx="4.4" ry="5.4" fill="#fff"/><ellipse cx="39" cy="31" rx="4.4" ry="5.4" fill="#fff"/>
      <circle cx="25.6" cy="32" r="2.8" fill="#2b1838"/><circle cx="39.6" cy="32" r="2.8" fill="#2b1838"/>
    </g>
    <g class="mo-beak"><path d="M28 37 L36 37 L32 44Z" fill="#ffa83c"/></g>
    <ellipse cx="18" cy="39" rx="3.4" ry="2.2" fill="#ff8fb3"/><ellipse cx="46" cy="39" rx="3.4" ry="2.2" fill="#ff8fb3"/>
  </svg>`;
}

// ------------------------------------------------------------------------------------------------
// Retrato de morador: círculo na cor do corpo, aro na cor da roupa e emoji da espécie.
const SPECIES_EMOJI = {
  humano: '👵', toupeira: '🌻', espantalho: '🌾', sapo: '🐸', joaninha: '🐞', ovelha: '🐑', urso: '🐻',
  coelho: '🐰', tartaruga: '🐢', ourico: '🦔', cachorro: '🐶', coruja: '🦉', pombo: '🕊️', passaro: '🐦',
  pavao: '🦚', tucano: '🐦', hipopotamo: '🦛', formiga: '🐜', capivara: '🐹', gato: '🐱', rato: '🐭',
  girafa: '🦒', preguica: '🦥', beija_flor: '🐦', periquito: '🦜',
};
export const speciesEmoji = (sp) => SPECIES_EMOJI[sp] || '🙂';

export function portraitHTML(speaker, def, mood) {
  if (speaker === 'quim') return `<div class="mo-portrait quim">${quimSVG({ mood: mood || 'feliz', head: true })}</div>`;
  if (speaker === 'pinceso') return `<div class="mo-portrait pinceso">${pincesoSVG()}</div>`;
  const body = def?.look?.body || '#e6dcf5', outfit = def?.look?.outfit || '#c9b6ff';
  return `<div class="mo-portrait npc" style="--pb:${body};--po:${outfit}"><span>${speciesEmoji(def?.species)}</span></div>`;
}

// Ícone (emoji) de cada missão — vira adesivo no diário quando a missão termina.
// Só emojis presentes no Windows 10 (nada de 🪶/🪺/🫖, que aparecem como quadradinho).
export const MISSION_STICKER = {
  bom_dia: '🌅', flores_murchas: '🌷', enfeitalho: '🌾', lago_sorriso: '🐸', gato_no_telhado: '🐈',
  hortas_com_sede: '🥕', cartas_bom_dia: '💌', festa_surpresa: '🎉', filhote_sem_ninho: '🦜',
  ovinhos_perdidos: '🥚', coral_da_floresta: '🎶', penas_ao_vento: '🦚', casa_nova: '🐦', carteiro_piu: '✉️',
  cafe_dos_passarinhos: '☕', bala_de_gogo: '🍬', nuvem_gulosa: '☁️', piquenique_formigas: '🧺',
  relogio_cochilou: '🕰️', pausa_na_nuvem: '🧁', lacos_ao_vento: '🎀', piscadinha_nas_alturas: '😉',
  alvorada: '🌄', piados_no_pico: '💚',
};
