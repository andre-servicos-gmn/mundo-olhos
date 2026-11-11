// Barramento de eventos simples: bus.on(nome, fn) -> função para desinscrever.
export function createBus() {
  const handlers = new Map();
  return {
    on(name, fn) {
      if (!handlers.has(name)) handlers.set(name, new Set());
      handlers.get(name).add(fn);
      return () => handlers.get(name).delete(fn);
    },
    once(name, fn) {
      const off = this.on(name, (p) => { off(); fn(p); });
      return off;
    },
    emit(name, payload) {
      const set = handlers.get(name);
      if (!set) return;
      for (const fn of [...set]) {
        try { fn(payload); } catch (e) { console.error(`[bus] erro em "${name}"`, e); }
      }
    },
  };
}
