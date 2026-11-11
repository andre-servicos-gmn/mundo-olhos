// Minigames de missão que acontecem no mundo 3D (o coral é uma tela da UI: ui.minigameCoral).
//   createPenasVento(ctx, params, { onWin, onCatch }) — penas de gala que derivam com o vento e somem.
//   waterFx(ctx, x, z)  — chuvinha de regador (partículas + som).
//   sproutRing(ctx, x, z, n, r) — brotinhos em volta de uma horta (decoração que fica).

const TAU = Math.PI * 2;

/**
 * Penas ao Vento: começa quando a Quim entra na clareira. As penas nascem aos poucos, flutuam numa altura
 * de pulo, giram com o vento e somem depois de alguns segundos. Pegue `need` de `count` antes de `seconds`;
 * se não der mais (penas perdidas demais ou tempo esgotado), o vento devolve todas e recomeça.
 * params: { count, need, seconds, x, z, radius }
 */
export function createPenasVento(ctx, params, hooks = {}) {
  const { game } = ctx;
  const count = params.count ?? 12, need = params.need ?? 10, seconds = params.seconds ?? 45;
  const cx = params.x, cz = params.z, radius = params.radius ?? 14;
  const LIFE = 11;                                  // cada pena fica ~11 s no ar
  const interval = (seconds * 0.6) / count;         // a última nasce com tempo de sobra para ser pega
  const H = (x, z) => game.world?.getHeight?.(x, z) ?? 0;

  let run = null;        // { t, spawned, caught, lost, next, feathers:[] }
  let restartT = 0;      // espera antes de recomeçar depois de uma falha
  let windA = Math.random() * TAU;
  let done = false;

  function clear() {
    if (!run) return;
    for (const f of run.feathers) game.world?.removeProp?.(f.obj);
    run.feathers.length = 0;
  }

  function spawnFeather() {
    const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * radius * 0.75;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    const lift = 0.9 + Math.random() * 1.6;     // umas no alcance da mão, outras só pulando
    const obj = game.world?.spawnProp?.('pena', { x, z, y: H(x, z) + lift, color: ['#3f8fd9', '#2fbf9b', '#ffd23f', '#c792ff'][run.spawned % 4] });
    run.spawned++;
    run.feathers.push({ obj, x, z, lift, age: 0, ph: Math.random() * TAU, vx: 0, vz: 0 });
  }

  function start() {
    run = { t: 0, spawned: 0, caught: 0, lost: 0, next: 0, feathers: [] };
    spawnFeather(); spawnFeather();
    run.next = interval;
    game.ui?.toast?.(`Pegue ${need} penas antes que o vento leve!`, '🍃');
    game.audio?.play?.('brilho');
  }

  function fail(msg) {
    clear();
    run = null;
    restartT = 2.5;
    game.ui?.toast?.(msg, '🌬️');
  }

  return {
    get running() { return !!run; },
    /** { have, need, label, timer } para o HUD. */
    progress() {
      return run ? { have: run.caught, need, label: 'Penas de gala', timer: Math.max(0, seconds - run.t) }
        : { have: 0, need, label: 'Penas de gala' };
    },
    /** Posições das penas no ar (para o Voo de Busca e para o marcador). */
    findables() {
      return run ? run.feathers.map((f) => ({ x: f.x, y: f.obj ? f.obj.position.y : H(f.x, f.z) + f.lift, z: f.z, kind: 'missao' })) : [];
    },
    update(dt) {
      if (done) return;
      const p = game.player?.position;
      if (!p) return;
      const dc = Math.hypot(p.x - cx, p.z - cz);
      if (!run) {
        if (restartT > 0) { restartT -= dt; return; }
        if (dc < radius) start();
        return;
      }
      if (dc > radius * 2.2) { fail('As penas voaram pra longe... Volte à clareira do Cata-Vento!'); restartT = 0; return; }
      run.t += dt;
      windA += dt * 0.35;
      const wx = Math.cos(windA) * 1.3, wz = Math.sin(windA) * 1.3;
      if (run.spawned < count && (run.next -= dt) <= 0) { spawnFeather(); run.next = interval; }
      for (let i = run.feathers.length - 1; i >= 0; i--) {
        const f = run.feathers[i];
        f.age += dt;
        // vento + redemoinho; se sair da clareira, o vento puxa de volta
        f.vx += (wx + Math.sin(f.age * 1.7 + f.ph) * 1.2 - f.vx) * Math.min(1, dt * 1.5);
        f.vz += (wz + Math.cos(f.age * 1.3 + f.ph) * 1.2 - f.vz) * Math.min(1, dt * 1.5);
        const d = Math.hypot(f.x - cx, f.z - cz);
        if (d > radius) { f.vx -= ((f.x - cx) / d) * 3 * dt * 4; f.vz -= ((f.z - cz) / d) * 3 * dt * 4; }
        f.x += f.vx * dt; f.z += f.vz * dt;
        const y = H(f.x, f.z) + f.lift + Math.sin(f.age * 2.1 + f.ph) * 0.45;
        const fade = Math.min(1, (LIFE - f.age) / 1.5);
        if (f.obj) {
          f.obj.position.set(f.x, y, f.z);
          f.obj.rotation.y += dt * 2;
          f.obj.scale.setScalar(Math.max(0.01, fade));
        }
        // pegou? (alcance com a mão; pulando alcança as mais altas)
        const dy = y - (p.y + 0.6);
        if (Math.hypot(f.x - p.x, f.z - p.z) < 1.25 && dy > -1 && dy < 1.3) {
          game.world?.removeProp?.(f.obj);
          run.feathers.splice(i, 1);
          run.caught++;
          game.world?.sparkle?.(f.x, y, f.z, { count: 10, colors: ['#ffffff', '#c792ff', '#6ec6ff'], speed: 2.5, life: 0.6 });
          game.audio?.play?.('coleta');
          hooks.onCatch?.(run.caught, need);
          if (run.caught >= need) {
            done = true;
            clear();
            run = null;
            hooks.onWin?.();
            return;
          }
          continue;
        }
        if (f.age >= LIFE) {
          game.world?.removeProp?.(f.obj);
          run.feathers.splice(i, 1);
          run.lost++;
        }
      }
      if (count - run.lost < need) fail('Ah não! O vento levou penas demais. Vamos de novo!');
      else if (run.t > seconds) fail('O tempo acabou! O Cata-Vento espirrou mais penas, tenta de novo!');
    },
    dispose() { clear(); run = null; done = true; },
  };
}

/** Chuvinha do regador sobre uma horta: três rajadas de gotinhas e o som de água. */
export function waterFx(ctx, x, y, z) {
  const { game, wait } = ctx;
  game.audio?.play?.('agua');
  const burst = () => game.world?.sparkle?.(x, y + 1.4, z, { count: 22, colors: ['#8fd8ff', '#c9f0ff', '#ffffff'], speed: 2.2, up: 0.4, life: 0.9, size: 0.5, gravity: 4 });
  burst();
  return wait(350).then(() => { burst(); return wait(350); }).then(() => { burst(); game.audio?.play?.('brilho'); });
}

/** Brotinhos em volta de uma horta (decoração permanente). Retorna os props criados. */
export function sproutRing(ctx, x, z, n = 6, r = 2) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + 0.4;
    const o = ctx.game.world?.spawnProp?.('broto', { x: x + Math.cos(a) * r, z: z + Math.sin(a) * r, float: false, glow: false });
    if (o) out.push(o);
  }
  return out;
}
