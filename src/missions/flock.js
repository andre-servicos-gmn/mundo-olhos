// O bando do Pinceso no Pico Pestana: periquitos verde-limão redondinhos que dormem em volta da Árvore do Bando
// (enquanto a névoa sonolenta não passa), acordam num alvoroço e voam em roda. Construído com game.THREE
// (sem importar 'three' aqui, para o motor de missões continuar testável no Node).
//   const flock = createFlock(game, { x, z, nests:[{x,z}] });
//   flock.setMode('sleep'|'awake'|'fly'|'wave'); flock.update(dt); flock.dispose();

const N_BIRDS = 16;

export function createFlock(game, opts) {
  const THREE = game.THREE;
  const scene = game.render?.scene;
  if (!THREE || !scene) return null;
  const H = (x, z) => game.world?.getHeight?.(x, z) ?? 0;

  const root = new THREE.Group();
  root.name = 'bando_periquitos';
  scene.add(root);

  // ---- modelo compartilhado ----
  const M = (c) => new THREE.MeshToonMaterial({ color: c });
  const mats = {
    body: M('#a9ec5c'), belly: M('#ddfaa6'), cheek: M('#ff9fc2'), beak: M('#ffb347'),
    eye: new THREE.MeshBasicMaterial({ color: '#1d1430' }), shine: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
    wing: M('#7fd13b'), tail: M('#5fbf3a'),
  };
  const sph = new THREE.SphereGeometry(1, 14, 10);
  const cone = new THREE.ConeGeometry(1, 1, 8);

  function mesh(geo, mat, x, y, z, sx, sy, sz, parent) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.scale.set(sx, sy ?? sx, sz ?? sx);
    m.castShadow = true;
    parent.add(m);
    return m;
  }

  function buildBird(i) {
    const g = new THREE.Group();
    const body = new THREE.Group();
    g.add(body);
    mesh(sph, mats.body, 0, 0.17, 0, 0.16, 0.17, 0.18, body);
    mesh(sph, mats.belly, 0, 0.13, 0.08, 0.11, 0.12, 0.09, body);
    const head = new THREE.Group();
    head.position.set(0, 0.33, 0.04);
    body.add(head);
    mesh(sph, mats.body, 0, 0, 0, 0.125, 0.12, 0.12, head);
    for (const s of [-1, 1]) mesh(sph, mats.cheek, s * 0.085, -0.03, 0.07, 0.035, 0.025, 0.02, head);
    const beak = mesh(cone, mats.beak, 0, -0.02, 0.13, 0.035, 0.07, 0.035, head);
    beak.rotation.x = Math.PI / 2 + 0.5;
    const eyes = [];
    for (const s of [-1, 1]) {
      const e = new THREE.Group();
      e.position.set(s * 0.05, 0.025, 0.1);
      mesh(sph, mats.eye, 0, 0, 0, 0.028, 0.034, 0.02, e);
      mesh(sph, mats.shine, 0.008, 0.012, 0.016, 0.009, 0.009, 0.009, e);
      head.add(e);
      eyes.push(e);
    }
    for (let k = 0; k < 3; k++) {   // topete arrepiado
      const t = mesh(cone, mats.body, (k - 1) * 0.03, 0.13, -0.02, 0.025, 0.09, 0.025, head);
      t.rotation.set(-0.4, 0, (k - 1) * 0.5);
    }
    const wings = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.14, 0.24, -0.01);
      mesh(sph, mats.wing, s * 0.04, -0.06, 0, 0.035, 0.11, 0.13, pivot);
      body.add(pivot);
      wings.push({ pivot, s });
    }
    const tail = mesh(cone, mats.tail, 0, 0.1, -0.2, 0.05, 0.22, 0.03, body);
    tail.rotation.x = -Math.PI / 2 - 0.5;
    g.scale.setScalar(1.25 + ((i * 37) % 10) / 40);
    root.add(g);
    return { g, body, head, eyes, wings, phase: i * 1.7, i };
  }

  // ---- lugares de dormir: 2 por ninho + o resto encolhidinho no chão em volta da árvore ----
  const homes = [];
  for (const n of opts.nests || []) {
    for (const s of [-1, 1]) {
      const a = Math.atan2(n.z - opts.z, n.x - opts.x) + Math.PI / 2;
      homes.push({ x: n.x + Math.cos(a) * 0.32 * s, z: n.z + Math.sin(a) * 0.32 * s, lift: 0.35 });
    }
  }
  for (let k = homes.length; k < N_BIRDS; k++) {
    const a = (k / N_BIRDS) * Math.PI * 2 + 0.3;
    const r = 5.2 + (k % 3) * 1.1;
    homes.push({ x: opts.x + Math.cos(a) * r, z: opts.z + Math.sin(a) * r, lift: 0 });
  }

  const birds = [];
  for (let i = 0; i < N_BIRDS; i++) {
    const b = buildBird(i);
    const h = homes[i % homes.length];
    b.home = { x: h.x, y: H(h.x, h.z) + h.lift, z: h.z };
    b.g.position.set(b.home.x, b.home.y, b.home.z);
    b.g.rotation.y = Math.atan2(opts.x - h.x, opts.z - h.z);
    b.ring = 7 + (i % 5) * 2.2;
    b.alt = 5 + (i % 4) * 2.2;
    b.speed = (0.35 + (i % 3) * 0.08) * (i % 2 ? 1 : -1);
    b.ang = (i / N_BIRDS) * Math.PI * 2;
    b.blend = 0;           // 0 = no lugar de dormir, 1 = voando
    birds.push(b);
  }

  let mode = 'sleep';
  let time = 0;
  let waveK = 0;           // 0..1: abre a roda para a "onda de cor" do final

  function setEyes(b, open) { for (const e of b.eyes) e.scale.y = open; }

  return {
    object: root,
    get mode() { return mode; },
    /** 'sleep' (enroladinhos, olhos fechados) | 'awake' (pulinhos no lugar) | 'fly' (roda em volta da árvore) | 'wave' (roda bem aberta) */
    setMode(m) { mode = m; },
    update(dt) {
      time += dt;
      const p = game.player?.position;
      if (p && Math.hypot(p.x - opts.x, p.z - opts.z) > 260) { root.visible = false; return; }
      root.visible = true;
      waveK += ((mode === 'wave' ? 1 : 0) - waveK) * Math.min(1, dt * 0.6);
      const flying = mode === 'fly' || mode === 'wave';
      for (const b of birds) {
        b.blend += ((flying ? 1 : 0) - b.blend) * Math.min(1, dt * 1.2);
        const t = time + b.phase;
        // posição no chão (dormindo/acordado)
        const hopY = mode === 'awake' ? Math.max(0, Math.sin(t * 6)) * 0.18 : 0;
        const breathe = mode === 'sleep' ? Math.sin(t * 1.4) * 0.015 : 0;
        const gx = b.home.x, gy = b.home.y + hopY + breathe, gz = b.home.z;
        // posição no ar (roda)
        b.ang += b.speed * dt * (1 + waveK * 0.4);
        const ring = b.ring * (1 + waveK * 1.6);
        const ax = opts.x + Math.cos(b.ang) * ring;
        const az = opts.z + Math.sin(b.ang) * ring;
        const ay = H(opts.x, opts.z) + b.alt + waveK * 6 + Math.sin(t * 1.3) * 0.6;
        const k = b.blend * b.blend * (3 - 2 * b.blend);
        b.g.position.set(gx + (ax - gx) * k, gy + (ay - gy) * k, gz + (az - gz) * k);
        // orientação: no ar segue a tangente da roda; no chão olha para a árvore
        const tang = Math.atan2(-Math.sin(b.ang) * Math.sign(b.speed), Math.cos(b.ang) * Math.sign(b.speed));
        const groundYaw = Math.atan2(opts.x - b.home.x, opts.z - b.home.z);
        b.g.rotation.y = k > 0.5 ? tang : groundYaw;
        b.body.rotation.x = k * 0.35;
        // asas: batem voando; recolhidas dormindo
        const flap = k > 0.05 ? Math.sin(t * 22) * 1.1 * k : (mode === 'awake' ? Math.sin(t * 9) * 0.3 : 0);
        for (const w of b.wings) w.pivot.rotation.z = w.s * (0.1 + flap);
        // olhos e cabeça
        setEyes(b, mode === 'sleep' ? 0.12 : (Math.sin(t * 0.7) > 0.97 ? 0.15 : 1));
        b.head.rotation.x = mode === 'sleep' ? 0.45 : 0;
        b.head.rotation.z = mode === 'awake' ? Math.sin(t * 3) * 0.2 : 0;
      }
    },
    dispose() {
      scene.remove(root);
      root.traverse((o) => { if (o.isMesh) o.geometry !== sph && o.geometry !== cone && o.geometry.dispose(); });
      sph.dispose(); cone.dispose();
      for (const m of Object.values(mats)) m.dispose();
    },
  };
}
