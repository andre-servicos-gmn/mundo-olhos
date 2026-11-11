// Nomes, ícones e medidas que o sistema de missões usa para conversar com a UI e com o mundo.
import { LANDMARKS } from '../data/worldmap.js';

/** Nome do item no HUD (quando o passo não traz `label`). */
export const ITEM_NAMES = {
  flor_murcha: 'Florzinha murcha', flor: 'Flor', ovo: 'Ovinho', pena: 'Pena', pena_verde: 'Pena verde',
  graveto: 'Graveto', folha: 'Folha', carta: 'Carta', jujuba: 'Jujuba', semente: 'Semente',
  regador: 'Regador', gato: 'Bolacha', broto: 'Broto',
};

/** Ícone dos avisos (toasts) de coleta. */
export const ITEM_ICONS = {
  flor_murcha: '🌸', flor: '🌼', ovo: '🥚', pena: '🕊️', pena_verde: '🍃', graveto: '🌿', folha: '🍃',
  carta: '✉️', jujuba: '🍬', semente: '🌰', regador: '🚿', gato: '🐱', broto: '🌱',
};

// Pegadas (raio × scale) de docs/mapa.md §8 — o interactable de um landmark fica a pegada + 1,5 do centro.
const FOOTPRINT = {
  casa: 5, casa_quim: 6, cafeteria: 7, loja_acessorios: 6, torre_relogio: 5, moinho: 5, horta: 4, jardim: 5,
  coreto: 5, mirante: 4, rocha: 2.5, arvore_algodao: 2.5, cogumelo: 2, flor_gigante: 2, estatua_olho: 2,
  'poço': 1.8, ninho: 1.5, banco: 1.3, casinha_passaro: 1, cata_vento: 1, placa: 0.6, caixa_correio: 0.5, poste: 0.4,
};

export const LANDMARK_BY_ID = new Map(LANDMARKS.map((l) => [l.id, l]));

/** Raio de interação confortável para um landmark (nunca menor que 2,5). */
export function landmarkReach(id) {
  const l = LANDMARK_BY_ID.get(id);
  if (!l) return 2.5;
  return Math.max(2.5, (FOOTPRINT[l.type] ?? 1) * (l.scale ?? 1) + 1.5);
}

export const itemLabel = (step) => step.label || ITEM_NAMES[step.item] || step.item;

/** "Leve as flores..." -> "leve as flores..." (para frases do tipo "Ainda falta: ..."). */
export const lowerFirst = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : '');
