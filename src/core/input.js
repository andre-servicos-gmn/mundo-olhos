// Entrada de teclado + mouse. Usa event.code (independe do layout do teclado).
export function createInput(canvas) {
  const down = new Set();
  const pressed = new Set();   // apertadas neste quadro
  const released = new Set();
  const mouse = { dx: 0, dy: 0, wheel: 0, locked: false, buttons: 0 };
  let enabled = true;          // false enquanto um menu/diálogo captura o teclado

  addEventListener('keydown', (e) => {
    if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (!down.has(e.code)) pressed.add(e.code);
    down.add(e.code);
  });
  addEventListener('keyup', (e) => { down.delete(e.code); released.add(e.code); });
  addEventListener('blur', () => down.clear());

  canvas.addEventListener('mousedown', (e) => {
    mouse.buttons = e.buttons;
    if (!mouse.locked && canvas.requestPointerLock) {
      try { canvas.requestPointerLock(); } catch { /* ignorado */ }
    }
  });
  addEventListener('mouseup', (e) => { mouse.buttons = e.buttons; });
  document.addEventListener('pointerlockchange', () => { mouse.locked = document.pointerLockElement === canvas; });
  addEventListener('mousemove', (e) => {
    if (mouse.locked || mouse.buttons) { mouse.dx += e.movementX; mouse.dy += e.movementY; }
  });
  addEventListener('wheel', (e) => { mouse.wheel += Math.sign(e.deltaY); }, { passive: true });

  return {
    mouse,
    get enabled() { return enabled; },
    set enabled(v) { enabled = v; if (!v) down.clear(); },
    // Para jogabilidade (respeita "enabled"):
    isDown: (code) => enabled && down.has(code),
    wasPressed: (code) => enabled && pressed.has(code),
    // Para menus/UI (ignora "enabled"):
    rawDown: (code) => down.has(code),
    rawPressed: (code) => pressed.has(code),
    axis() { // -1..1 em x (direita) e y (frente)
      if (!enabled) return { x: 0, y: 0 };
      const x = (down.has('KeyD') || down.has('ArrowRight') ? 1 : 0) - (down.has('KeyA') || down.has('ArrowLeft') ? 1 : 0);
      const y = (down.has('KeyW') || down.has('ArrowUp') ? 1 : 0) - (down.has('KeyS') || down.has('ArrowDown') ? 1 : 0);
      return { x, y };
    },
    // Chamar no FIM de cada quadro.
    endFrame() { pressed.clear(); released.clear(); mouse.dx = 0; mouse.dy = 0; mouse.wheel = 0; },
    // Para testes automatizados.
    simulate(code, isDown) { if (isDown) { if (!down.has(code)) pressed.add(code); down.add(code); } else down.delete(code); },
  };
}
