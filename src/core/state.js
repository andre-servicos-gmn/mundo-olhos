// Estado persistente do jogo (salvo no localStorage).
const SAVE_KEY = 'mundo-olhos-save-v1';

export function defaultState() {
  return {
    version: 1,
    jujubas: 0,
    totalJujubasFound: 0,
    collected: {},            // { [idDoColetavel]: true } — jujubas, flores, penas etc. já pegos
    missions: {},             // { [missionId]: { status: 'locked'|'available'|'active'|'done', step: 0, progress: {} } }
    activeMissionId: null,    // missão rastreada no HUD
    regionColor: {},          // { [regionId]: 0..1 } — 0 = desbotado, 1 = colorido
    discoveredRegions: {},    // { [regionId]: true }
    pincesoJoined: false,
    accessories: { owned: {}, equipped: null }, // equipped: id do acessório
    drinksTried: {},          // { [drinkId]: true }
    flags: {},                // flags livres de história { [flag]: true }
    player: { x: 0, y: 0, z: 0, rotY: 0 },
    dayTime: 0.3,             // 0..1 (0.25 = nascer do sol, 0.5 = meio-dia, 0.75 = pôr do sol)
    settings: { music: 0.6, sfx: 0.8, quality: 'media' }, // quality: 'baixa'|'media'|'alta'
    playTime: 0,
  };
}

export function hasSave() {
  try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; }
}

export function loadState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultState();
    const data = JSON.parse(raw);
    const base = defaultState();
    return { ...base, ...data, settings: { ...base.settings, ...data.settings },
      accessories: { ...base.accessories, ...data.accessories } };
  } catch {
    return defaultState();
  }
}

export function saveState(state) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); return true; } catch { return false; }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* sem armazenamento */ }
}
