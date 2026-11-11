// Registro de coisas com que a Quim pode interagir (tecla E).
// item: { id, getPosition(): {x,y,z}, radius, label, enabled?(): bool, onInteract(game) }
export function createInteractables() {
  const items = new Map();
  return {
    add(item) { items.set(item.id, item); return () => items.delete(item.id); },
    remove(id) { items.delete(id); },
    get(id) { return items.get(id); },
    // O item habilitado mais próximo dentro do raio, ou null.
    nearest(pos) {
      let best = null, bestD = Infinity;
      for (const it of items.values()) {
        if (it.enabled && !it.enabled()) continue;
        const p = it.getPosition();
        const d = Math.hypot(p.x - pos.x, p.z - pos.z);
        if (d <= (it.radius ?? 2.5) && Math.abs((p.y ?? pos.y) - pos.y) < 4 && d < bestD) { best = it; bestD = d; }
      }
      return best;
    },
    all: () => [...items.values()],
  };
}
