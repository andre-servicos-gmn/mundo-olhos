// Mapa do Mundo Olhos — dados puros (sem Three.js). O world constrói tudo a partir daqui.
// Documento de design com mapa, rotas e segredos: docs/mapa.md.
//
// Convenções:
// - Y para cima, norte = -Z, 1 unidade ≈ 1 metro.
// - rotY segue o Three.js: a frente do modelo é o +Z local; rotY = 0 olha para o sul (+Z),
//   rotY = PI olha para o norte. face(x,z,alvoX,alvoZ) calcula o rotY que vira a frente para o alvo.
// - PLATFORMS.y é a altura absoluta do TOPO andável. Rotas (campo `route`) estão na ordem de subida.
// - JUJUBA_SPOTS.y (quando existe) é o topo da plataforma onde a jujuba está; o world soma a flutuação,
//   igual faz com as jujubas do chão (getHeight + flutuação).
//
// Terreno assumido (o world deve respeitar — detalhes em docs/mapa.md, "Terreno"):
//   h(x,z) = base da região (mistura suave entre regiões) + ruído ±1,5 × máscara
//   máscara = 0 (chão plano em baseHeight) sobre trilhas, perto de landmarks (pegada + 3),
//   perto de plataformas baixas (y - base < 3) e nas margens da água.
//   Pico Pestana: cone — h = 6 + 24 × clamp((75 - d) / 47, 0, 1) (d = distância ao centro do Pico),
//   platô em y = 30 para d ≤ 28.

const D = Math.PI / 180;
const r2 = (v) => Math.round(v * 100) / 100;
/** rotY para a frente (+Z local) de um objeto em (x,z) olhar para (tx,tz). */
export const face = (x, z, tx, tz) => r2(Math.atan2(tx - x, tz - z));
/** Ponto em coordenadas polares ao redor de (cx,cz); ângulo em graus (0 = leste, 90 = sul). */
const polar = (cx, cz, aDeg, r) => [r2(cx + Math.cos(aDeg * D) * r), r2(cz + Math.sin(aDeg * D) * r)];

// ---------------------------------------------------------------------------------------------
export const WORLD = { half: 320, playRadius: 300, seaLevel: -3 };

// A Quim acorda na porta de casa, olhando para o norte: dali já se vê a Florzona, o moinho,
// os telhados da Vila e, lá longe, a torre do relógio e o Pico Pestana.
export const SPAWN = { x: 0, z: 214, rotY: Math.PI };

// ---------------------------------------------------------------------------------------------
export const REGIONS = [
  {
    id: 'campo', name: 'Campo das Pétalas', center: { x: 0, z: 165 }, radius: 95, baseHeight: 0,
    palette: { ground: '#9ee07a', ground2: '#c9f291', path: '#f3d9a4', accents: ['#ff8fc7', '#ffd166', '#ffffff', '#c49bff', '#ff9f6b'], fog: '#ffe3f1' },
    music: 'campo',
    description: 'Colinas macias cobertas de flores que bocejam. A casa da Quim fica no sul, o Lago Espelhinho a oeste e o Moinho Cata-Pétala gira devagar no leste.',
    flavor: [
      'As flores daqui cochilam de olho meio aberto. Fofoqueiras.',
      'O vento cheira a pétala e a bolo de vó.',
      'Uma margarida acabou de piscar pra você. Pisca de volta!',
      'Dizem que no meio do Lago Espelhinho tem uma ilhota com doces escondidos...',
      'O Moinho Cata-Pétala gira tão devagar que parece estar pensando.',
    ],
  },
  {
    id: 'vila', name: 'Vila Piscadela', center: { x: 0, z: 20 }, radius: 70, baseHeight: 2,
    palette: { ground: '#a6e3a1', ground2: '#d6f5b0', path: '#e8c9a0', accents: ['#ff9aa2', '#ffdac1', '#b5ead7', '#c7ceea', '#ffe66d'], fog: '#fff1d6' },
    music: 'vila',
    description: 'Vilarejo redondinho no cruzamento de tudo: a pracinha do coreto liga as estradas para o Campo (sul), a Cidade (norte), o Ninhal (oeste) e o Bosque (leste). O Rio Bocejo corta o lado oeste.',
    flavor: [
      'Aqui todo mundo dá bom-dia. Até as janelas.',
      'O coreto da pracinha toca uma musiquinha quando ninguém está olhando.',
      'Cheirinho de pão saindo da Padaria Pão de Pisca!',
      'As casinhas piscam devagar... estão com soninho.',
      'Placa na pracinha: "Proibido correr de chinelo. Pular pode."',
    ],
  },
  {
    id: 'ninhal', name: 'Ninhal Cantante', center: { x: -180, z: -10 }, radius: 100, baseHeight: 4,
    palette: { ground: '#7fcf8a', ground2: '#b5e8a0', path: '#d9b98c', accents: ['#ffd23f', '#ff7aa8', '#6ec6ff', '#b8f27c', '#ffffff'], fog: '#dff7e3' },
    music: 'ninhal',
    description: 'Floresta de árvores gigantes onde vivem os passarinhos. Galhos, folhas que balançam, ninhos-trampolim e pontes de cipó sobem até o Ninho-Coreto, no topo da Árvore-Mãe.',
    flavor: [
      'Piu? Piu-piu! (Tradução: "olha a menina dos cachinhos!")',
      'Cada árvore aqui é um prédio de passarinho. Com elevador de cipó, não.',
      'Lá de cima do Ninho-Coreto dá pra ver o mundo inteiro. Dizem.',
      'Cuidado: algumas folhas balançam quando você pisa.',
      'Uma pena verde passou voando... de quem será?',
    ],
  },
  {
    id: 'bosque', name: 'Bosque Açucarado', center: { x: 180, z: 50 }, radius: 95, baseHeight: 1,
    palette: { ground: '#ffc4e1', ground2: '#ffe0f0', path: '#fff3b8', accents: ['#ff6fa8', '#7fd8ff', '#c792ff', '#fff07a', '#8ef0c0'], fog: '#ffd6ec' },
    music: 'bosque',
    description: 'Árvores de algodão-doce, cogumelos de marshmallow e um laguinho de calda de morango. O Pirulito Gigante gira no centro e jujubas brotam por todo canto.',
    flavor: [
      'Aviso oficial: proibido lamber as árvores. (Ninguém respeita.)',
      'O chão aqui é fofinho e cheira a festa de aniversário.',
      'O Pirulito Gigante está te olhando. Com carinho. E fome? Não, só carinho.',
      'Jujubas! Por toda parte! O Pinceso ia amar isso.',
      'Tem uma nuvem cor-de-rosa lá no alto... parece ter alguma coisa em cima.',
    ],
  },
  {
    id: 'cidade', name: 'Cidade Cílios', center: { x: 0, z: -160 }, radius: 85, baseHeight: 6,
    palette: { ground: '#b8e6c8', ground2: '#e2f2d8', path: '#f5e3d0', accents: ['#ffb3c7', '#a0d8ef', '#ffe39f', '#d3b8ff', '#ffffff'], fog: '#e9e4ff' },
    music: 'cidade',
    description: 'Cidadezinha de lojinhas em volta da Praça dos Cílios e sua fonte. A Torre do Relógio vigia tudo; a Cafeteria Nuvem de Leite e a Loja de Acessórios ficam de frente uma pra outra na praça.',
    flavor: [
      'Até os postes daqui têm cílios. Bem curvadinhos.',
      'Cheiro de café com leite vindo da Cafeteria Nuvem de Leite...',
      'A Torre do Relógio pisca a cada hora cheia.',
      'Na Loja de Acessórios dizem que tem um laço que combina com cachinhos.',
      'Jogue uma jujuba na fonte e faça um pedido! (Ou guarde a jujuba. Decisão difícil.)',
    ],
  },
  {
    id: 'pico', name: 'Pico Pestana', center: { x: 175, z: -215 }, radius: 75, baseHeight: 30,
    palette: { ground: '#cfe8ff', ground2: '#ffffff', path: '#e6dccb', accents: ['#9ad1ff', '#ffffff', '#ffb8de', '#b6f0c0', '#ffe08a'], fog: '#e3ecff' },
    music: 'pico',
    description: 'A montanha mais alta do reino, sempre visível no horizonte. Uma estrada em serpentina sobe até o platô, onde ficam o Mirante e os ninhos do bando do Pinceso.',
    flavor: [
      'O ar aqui em cima é fresquinho e faz cócegas no nariz.',
      'Dá pra ver o reino inteirinho... e ele está te olhando de volta.',
      'As nuvens passam tão perto que dá pra cumprimentar.',
      'Ventinho forte! Segura os cachinhos!',
      'Piados lá no alto... parecem com os do Pinceso!',
    ],
  },
];

// ---------------------------------------------------------------------------------------------
// Rio Bocejo: nasce na encosta sul do Pico, cai numa cascata, passa pelo canto sudeste da Cidade,
// corta o lado oeste da Vila e deságua no Lago Espelhinho, no Campo. É a espinha dorsal do mapa:
// seguindo o rio você sempre chega em casa.
const RIO = [
  [194, -163], [180, -147], [160, -139], [138, -134], [116, -128], [94, -121], [72, -113],
  [52, -100], [34, -84], [18, -64], [4, -46], [-10, -32], [-26, -14], [-35, 6], [-37, 30],
  [-33, 52], [-28, 74], [-27, 96], [-31, 114], [-35, 126],
];
const RIO_LARGURA = 5;

const LAGO = { x: -35, z: 132, radius: 18 };          // Lago Espelhinho (Campo)
const CALDA = { x: 215, z: 92, radius: 12 };          // Laguinho de Calda (Bosque)
const PICO = { x: 175, z: -215 };                      // centro do Pico Pestana

// Serpentina do Pico: [ângulo°, raio] ao redor do centro do Pico (0° = leste, 90° = sul).
// Três grampos (hairpins) na face sudoeste; sobe do pé do cone (r = 74,5, y ≈ 6,3, quase a mesma altura da Estrada do
// Vento — sem degrau no portal) até o platô (y = 30): ~5% nos trechos retos, até ~30% nas curvas dos grampos.
const SERPENTINA = [
  [167, 74.5], [150, 67.5], [135, 66], [120, 64.5], [108, 63], [100, 61.5], [95, 59.5], [99, 57], [110, 55.5],
  [125, 54], [140, 52.5], [155, 51], [170, 49.5], [185, 48], [195, 46.5], [200, 44.5], [196, 42], [185, 41],
  [170, 39.5], [155, 38], [140, 36.5], [125, 35], [115, 33.5], [111, 31.5], [116, 29.5], [127, 28.5],
  [140, 26], [148, 23],
].map(([a, r]) => polar(PICO.x, PICO.z, a, r));

export const PATHS = [
  // --- estradas principais (largas, com postes) ---
  { id: 'estrada_campo_vila', name: 'Estrada das Pétalas', from: 'campo', to: 'vila', width: 4.5,
    points: [[0, 220], [2, 200], [-2, 180], [2, 160], [7, 140], [9, 115], [4, 90], [2, 65], [6, 45], [6, 27]] },
  { id: 'estrada_vila_cidade', name: 'Estrada do Bocejo', from: 'vila', to: 'cidade', width: 4.5,
    points: [[4, 3], [2, -20], [0, -42], [-2, -62], [0, -85], [2, -110], [0, -130], [0, -141]] },
  { id: 'trilha_vila_ninhal', name: 'Trilha dos Piados', from: 'vila', to: 'ninhal', width: 3.5,
    points: [[-7, 13], [-22, 10], [-35, 6], [-50, 3], [-70, 0], [-95, -2], [-120, -3], [-145, -8], [-165, -12]] },
  { id: 'trilha_vila_bosque', name: 'Trilha do Açúcar', from: 'vila', to: 'bosque', width: 3.5,
    points: [[17, 17], [30, 20], [52, 27], [78, 37], [102, 44], [128, 46], [152, 50], [170, 52]] },
  { id: 'estrada_cidade_pico', name: 'Estrada do Vento', from: 'cidade', to: 'pico', width: 4,
    points: [[13, -173], [35, -180], [60, -186], [84, -193], SERPENTINA[0]] },
  { id: 'serpentina_pico', name: 'Serpentina da Pestana', from: 'pico', to: 'pico', width: 4,
    points: SERPENTINA },
  // --- trilhas secundárias ---
  { id: 'trilha_campo_bosque', name: 'Trilha das Formiguinhas', from: 'campo', to: 'bosque', width: 3,
    points: [[7, 142], [30, 138], [55, 125], [80, 108], [100, 92], [118, 80]] },
  { id: 'trilha_bosque_doce', name: 'Volta do Pirulito', from: 'bosque', to: 'bosque', width: 3,
    points: [[170, 52], [196, 60], [218, 62], [236, 48], [238, 25], [222, 8], [196, 6], [175, 15], [165, 35], [170, 52]] },
  { id: 'rua_canal', name: 'Rua do Cais', from: 'cidade', to: 'cidade', width: 3,
    points: [[12, -149], [26, -136], [40, -120]] },
  { id: 'rua_oeste', name: 'Rua das Pálpebras', from: 'cidade', to: 'cidade', width: 3,
    points: [[-13, -173], [-35, -180], [-62, -170]] },
  // --- atalhos secretos (trilha estreita e apagadinha; o minimapa só mostra depois de descoberto) ---
  { id: 'atalho_raizes', name: 'Atalho das Raízes', from: 'ninhal', to: 'campo', width: 2.4, secret: true,
    points: [[-125, 62], [-108, 92], [-90, 118], [-72, 142], [-55, 158]] },
  { id: 'atalho_cipo', name: 'Atalho do Cipó', from: 'cidade', to: 'ninhal', width: 2.4, secret: true,
    points: [[-62, -170], [-85, -158], [-110, -142], [-135, -124], [-158, -100], [-172, -74]] },
  { id: 'trilha_riacho', name: 'Trilha do Riacho', from: 'cidade', to: 'bosque', width: 2.4, secret: true,
    points: [[40, -120], [62, -100], [86, -84], [114, -62], [140, -36], [158, -14], [172, 8]] },
  // Trilhinha de flores azuis e brancas que sai de trás da Árvore-Café e some no mato até a clareira da
  // Casinha Asas de Saudade (SPOTS.asas_de_saudade; ver docs/casinha-asas-de-saudade.md).
  { id: 'trilha_asas', name: 'Trilhinha das Flores Azuis', from: 'ninhal', to: 'ninhal', width: 1.8, secret: true,
    points: [[-149, 53], [-156, 62], [-163, 69], [-166, 71]] },
];

// ---------------------------------------------------------------------------------------------
export const WATER = [
  { id: 'rio_bocejo', region: 'vila', type: 'rio', name: 'Rio Bocejo', width: RIO_LARGURA, points: RIO,
    data: { nascente: RIO[0], cascata: [RIO[0], RIO[2]] } },
  { id: 'lago_espelhinho', region: 'campo', type: 'lago', name: 'Lago Espelhinho', ...LAGO },
  { id: 'fonte_cilios', region: 'cidade', type: 'fonte', name: 'Fonte dos Cílios', x: 0, z: -160, radius: 4.5 },
  { id: 'laguinho_calda', region: 'bosque', type: 'lago', name: 'Laguinho de Calda', ...CALDA,
    data: { cor: '#ff8fbf', calda: true } },
  { id: 'banheira_passaros', region: 'ninhal', type: 'lago', name: 'Banheira dos Passarinhos', x: -232, z: 52, radius: 6 },
];

// Pontes: calculadas no cruzamento exato entre a trilha e o rio, para nunca desalinharem.
function cruzamento(pathId) {
  const path = PATHS.find((p) => p.id === pathId).points;
  for (let i = 0; i < path.length - 1; i++) {
    for (let j = 0; j < RIO.length - 1; j++) {
      const [ax, az] = path[i], [bx, bz] = path[i + 1], [cx, cz] = RIO[j], [dx, dz] = RIO[j + 1];
      const den = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx);
      if (Math.abs(den) < 1e-9) continue;
      const t = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / den;
      const u = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / den;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
        return { x: r2(ax + (bx - ax) * t), z: r2(az + (bz - az) * t), rotY: r2(Math.atan2(bx - ax, bz - az)) };
      }
    }
  }
  throw new Error('worldmap: trilha ' + pathId + ' não cruza o rio');
}

// ---------------------------------------------------------------------------------------------
// Árvores gigantes do Ninhal (dados usados também pelas rotas de plataformas).
// data.height = altura do tronco acima do chão; data.trunkRadius = raio do tronco (colisor).
const T = {
  subida: { x: -160, z: -38, trunkRadius: 3, height: 22 },
  ponte: { x: -182, z: -55, trunkRadius: 3.5, height: 28 },
  mae: { x: -205, z: -30, trunkRadius: 5, height: 30 },
  coruja: { x: -228, z: 8, trunkRadius: 4, height: 24 },
};
const NINHAL_Y = 4;
const OCO_ANG = 44 * 7;   // ângulo (polar: 0° = leste, 90° = sul) do oco da Dona Plumínia = topo da escadinha de galhos
const CORETO = { x: T.mae.x, z: T.mae.z, y: 34, radius: 7 };   // piso do Ninho-Coreto

const TORRE = { x: 0, z: -192, y: 6, height: 15, topRadius: 7 }; // terraço da torre em y = 21
const CUME = { x: 160, z: -222, y: 30, topY: 38.6 };             // Pedra do Bocejo (Pico)
const MIRANTE = { x: 148.9, z: -208 };                           // Mirante da Pestana (borda do platô)
const CASA_GATO = { x: 46, z: -6, roofY: 9.5 };                  // casa com terraço no telhado (Vila)

export const LANDMARKS = [
  // ============================== CAMPO DAS PÉTALAS ==============================
  { id: 'casa_quim', region: 'campo', type: 'casa_quim', name: 'Casa da Quim', x: 0, z: 232, rotY: Math.PI, scale: 1 },
  { id: 'caixa_correio_quim', region: 'campo', type: 'caixa_correio', name: 'Caixinha de Cartas da Quim', x: -6, z: 221, rotY: Math.PI },
  { id: 'jardim_quim', region: 'campo', type: 'jardim', name: 'Jardinzinho da Quim', x: 15, z: 236, scale: 0.6 },
  { id: 'banco_quim', region: 'campo', type: 'banco', name: 'Banco da Varanda', x: 8, z: 222, rotY: Math.PI },
  { id: 'placa_quim', region: 'campo', type: 'placa', name: 'Casa da Quim — cuidado: cachinhos à solta!', x: -6, z: 212, rotY: Math.PI },
  { id: 'cerca_quim', region: 'campo', type: 'cerca', x: -14, z: 236, rotY: Math.PI / 2, scale: 1, data: { comprimento: 10 } },
  { id: 'pedra_olhuda', region: 'campo', type: 'estatua_olho', name: 'Pedra Olhuda', x: -45, z: 240, rotY: face(-45, 240, 0, 220), scale: 0.8,
    data: { segredo: true } },
  { id: 'florzona', region: 'campo', type: 'flor_gigante', name: 'Florzona Bocejante', x: -24, z: 170, rotY: face(-24, 170, 0, 214), scale: 3,
    data: { marco: true, altura: 16 } },
  { id: 'moinho_petalas', region: 'campo', type: 'moinho', name: 'Moinho Cata-Pétala', x: 60, z: 196, rotY: face(60, 196, 0, 165), scale: 1.4,
    data: { marco: true, colina: 3 } },
  { id: 'casa_jardineiro', region: 'campo', type: 'casa', name: 'Casa do Jardineiro', x: 44, z: 172, rotY: face(44, 172, 2, 170),
    data: { cor: '#ffd1a8', telhado: '#ff8fa3' } },
  { id: 'jardim_jardineiro', region: 'campo', type: 'jardim', name: 'Jardim dos Canteiros Sonolentos', x: 26, z: 192, scale: 1.2,
    data: { canteiros: 8 } },
  { id: 'cata_vento_campo_1', region: 'campo', type: 'cata_vento', x: -52, z: 200 },
  { id: 'cata_vento_campo_2', region: 'campo', type: 'cata_vento', x: 72, z: 142 },
  { id: 'casinha_passaro_campo', region: 'campo', type: 'casinha_passaro', x: -64, z: 176 },
  { id: 'banco_lago', region: 'campo', type: 'banco', name: 'Banco do Lago', x: -12, z: 140, rotY: face(-12, 140, LAGO.x, LAGO.z) },
  { id: 'placa_lago', region: 'campo', type: 'placa', name: 'Lago Espelhinho — sorria, ele te imita', x: -14, z: 118, rotY: face(-14, 118, 9, 115) },
  { id: 'placa_campo', region: 'campo', type: 'placa', name: 'N: Vila Piscadela · L: Bosque Açucarado · S: Casa da Quim', x: 14, z: 152, rotY: face(14, 152, 2, 160) },
  { id: 'rocha_campo_1', region: 'campo', type: 'rocha', x: -80, z: 150, scale: 1.2 },
  { id: 'rocha_campo_2', region: 'campo', type: 'rocha', x: 58, z: 238, scale: 1 },
  { id: 'rocha_campo_3', region: 'campo', type: 'rocha', x: -68, z: 226, scale: 1.4 },
  { id: 'cogumelo_campo_1', region: 'campo', type: 'cogumelo', x: -40, z: 100, scale: 1 },
  { id: 'cogumelo_campo_2', region: 'campo', type: 'cogumelo', x: 34, z: 222, scale: 0.8 },
  { id: 'flor_gigante_campo_2', region: 'campo', type: 'flor_gigante', name: 'Margarida Fofoqueira', x: 40, z: 100, scale: 1.6 },
  { id: 'flor_gigante_campo_3', region: 'campo', type: 'flor_gigante', name: 'Tulipa Tímida', x: -60, z: 120, scale: 1.4 },
  { id: 'poco_campo', region: 'campo', type: 'poço', name: 'Poço das Pétalas', x: 30, z: 160 },

  // ============================== VILA PISCADELA ==============================
  { id: 'praca_vila', region: 'vila', type: 'praca', name: 'Pracinha do Pisca', x: 5, z: 15, scale: 1 },
  { id: 'coreto_vila', region: 'vila', type: 'coreto', name: 'Coreto Cantarolante', x: 5, z: 15, scale: 1 },
  { id: 'placa_vila', region: 'vila', type: 'placa', name: 'N: Cidade Cílios · O: Ninhal Cantante · L: Bosque Açucarado · S: Campo das Pétalas', x: -6, z: 0, rotY: face(-6, 0, 5, 15) },
  { id: 'poco_vila', region: 'vila', type: 'poço', name: 'Poço dos Desejos Piscantes', x: 22, z: 32 },
  { id: 'banco_praca_vila_1', region: 'vila', type: 'banco', x: 15, z: 7, rotY: face(15, 7, 5, 15) },
  { id: 'banco_praca_vila_2', region: 'vila', type: 'banco', x: -4, z: 23, rotY: face(-4, 23, 5, 15) },
  { id: 'padaria_vila', region: 'vila', type: 'casa', name: 'Padaria Pão de Pisca', x: 24, z: -10, rotY: face(24, -10, 3, -8),
    data: { loja: 'padaria', cor: '#ffe0b3', telhado: '#e07a5f' } },
  { id: 'correio_vila', region: 'vila', type: 'casa', name: 'Correio Pisca-Pisca', x: 22, z: -32, rotY: face(22, -32, 2, -30),
    data: { loja: 'correio', cor: '#cde7ff', telhado: '#5aa9e6' } },
  { id: 'caixa_correio_vila', region: 'vila', type: 'caixa_correio', name: 'Caixa de Correio da Vila', x: 9, z: -24, rotY: face(9, -24, 2, -24) },
  { id: 'casa_gato', region: 'vila', type: 'casa', name: 'Casa do Telhado Alto', x: CASA_GATO.x, z: CASA_GATO.z, rotY: face(CASA_GATO.x, CASA_GATO.z, 17, 17),
    data: { andares: 2, telhadoPlano: true, roofY: CASA_GATO.roofY, raio: 4.5, cor: '#ffc8dd', telhado: '#b388eb' } },
  { id: 'casa_rosa', region: 'vila', type: 'casa', name: 'Casa Cor-de-Rosa', x: 28, z: 46, rotY: face(28, 46, 6, 45), data: { cor: '#ffb5c5', telhado: '#ff6f91' } },
  { id: 'casa_menta', region: 'vila', type: 'casa', name: 'Casa Menta', x: -16, z: 42, rotY: face(-16, 42, 6, 42), data: { cor: '#b9f3d6', telhado: '#4ecdc4' } },
  { id: 'casa_bolinha', region: 'vila', type: 'casa', name: 'Casa de Bolinhas', x: 42, z: -34, rotY: face(42, -34, 2, -30), data: { cor: '#fff3b0', telhado: '#ff9f1c' } },
  { id: 'casa_azul', region: 'vila', type: 'casa', name: 'Casa Azul-Bocejo', x: -15, z: -48, rotY: face(-15, -48, -1, -55), data: { cor: '#c3d9ff', telhado: '#6c8cff' } },
  { id: 'casa_cogumelo', region: 'vila', type: 'casa', name: 'Casa Cogumelo', x: -55, z: -18, rotY: face(-55, -18, -55, 2), data: { cor: '#fff', telhado: '#ff5d73', estilo: 'cogumelo' } },
  { id: 'casa_lavanda', region: 'vila', type: 'casa', name: 'Casa Lavanda', x: -52, z: 34, rotY: face(-52, 34, -52, 2), data: { cor: '#e2d1ff', telhado: '#9b5de5' } },
  { id: 'casa_sol', region: 'vila', type: 'casa', name: 'Casa Solzinho', x: 56, z: 50, rotY: face(56, 50, 52, 27), data: { cor: '#ffe57a', telhado: '#f4a261' } },
  { id: 'celeiro_vila', region: 'vila', type: 'casa', name: 'Celeiro Bocejante', x: 26, z: 76, rotY: face(26, 76, 3, 76), scale: 1.3, data: { estilo: 'celeiro', cor: '#ff9e9e', telhado: '#c0392b' } },
  { id: 'horta_vila_1', region: 'vila', type: 'horta', name: 'Horta da Couve Piscante', x: -12, z: -8, rotY: 0 },
  { id: 'horta_vila_2', region: 'vila', type: 'horta', name: 'Horta das Cenouras Curiosas', x: -60, z: 16, rotY: 0 },
  { id: 'horta_vila_3', region: 'vila', type: 'horta', name: 'Horta dos Tomatinhos Tímidos', x: 40, z: 64, rotY: 0 },
  { id: 'cerca_horta_3', region: 'vila', type: 'cerca', x: 47, z: 64, rotY: 0, data: { comprimento: 8 } },
  { id: 'cata_vento_vila', region: 'vila', type: 'cata_vento', x: -40, z: -30 },
  { id: 'banco_rio_vila', region: 'vila', type: 'banco', name: 'Banco da Beira-Rio', x: -22, z: 26, rotY: face(-22, 26, -37, 30) },
  { id: 'casinha_passaro_vila', region: 'vila', type: 'casinha_passaro', x: 60, z: 10 },

  // ============================== NINHAL CANTANTE ==============================
  { id: 'arvore_mae', region: 'ninhal', type: 'arvore_gigante', name: 'Árvore-Mãe', x: T.mae.x, z: T.mae.z, scale: 2.2,
    data: { trunkRadius: T.mae.trunkRadius, height: T.mae.height, marco: true, copa: 'leque abaixo do coreto' } },
  { id: 'ninho_coreto', region: 'ninhal', type: 'ninho_coreto', name: 'Ninho-Coreto', x: CORETO.x, z: CORETO.z,
    data: { y: CORETO.y, raio: CORETO.radius, entrada: 190, marco: true, sobre: 'arvore_mae' } },
  { id: 'arvore_subida', region: 'ninhal', type: 'arvore_gigante', name: 'Árvore Primeiro-Degrau', x: T.subida.x, z: T.subida.z, scale: 1.3,
    data: { trunkRadius: T.subida.trunkRadius, height: T.subida.height } },
  { id: 'arvore_ponte', region: 'ninhal', type: 'arvore_gigante', name: 'Árvore do Meio-Caminho', x: T.ponte.x, z: T.ponte.z, scale: 1.5,
    data: { trunkRadius: T.ponte.trunkRadius, height: T.ponte.height } },
  { id: 'arvore_coruja', region: 'ninhal', type: 'arvore_gigante', name: 'Árvore da Dona Plumínia', x: T.coruja.x, z: T.coruja.z, scale: 1.7,
    data: { trunkRadius: T.coruja.trunkRadius, height: T.coruja.height, oco: { angulo: OCO_ANG, y: 12.6 }, lanterna: true } },
  { id: 'arvore_cafe', region: 'ninhal', type: 'arvore_gigante', name: 'Árvore-Café dos Passarinhos', x: -145, z: 42, scale: 1.1,
    data: { trunkRadius: 2.5, height: 14, variante: 'cafe', xicaras: 8 } },
  { id: 'arvore_trio', region: 'ninhal', type: 'arvore_gigante', name: 'Árvore do Tico-Teco-Tuco', x: -120, z: -50, scale: 1,
    data: { trunkRadius: 2.5, height: 16, ninhos: 3 } },
  { id: 'arvore_casal', region: 'ninhal', type: 'arvore_gigante', name: 'Árvore da Casa Nova', x: -252, z: -18, scale: 1.3,
    data: { trunkRadius: 3, height: 20 } },
  { id: 'ninho_casal', region: 'ninhal', type: 'ninho', name: 'Ninho do Casal (em obras)', x: -248, z: -14,
    data: { y: 9, sobre: 'arvore_casal', construido: false } },
  { id: 'arvore_gigante_2', region: 'ninhal', type: 'arvore_gigante', x: -150, z: -95, scale: 1.4, data: { trunkRadius: 3, height: 22 } },
  { id: 'arvore_gigante_3', region: 'ninhal', type: 'arvore_gigante', x: -225, z: -85, scale: 1.5, data: { trunkRadius: 3.5, height: 24 } },
  { id: 'arvore_gigante_4', region: 'ninhal', type: 'arvore_gigante', x: -255, z: 45, scale: 1.4, data: { trunkRadius: 3, height: 22 } },
  { id: 'arvore_gigante_5', region: 'ninhal', type: 'arvore_gigante', x: -205, z: 75, scale: 1.2, data: { trunkRadius: 2.5, height: 18 } },
  { id: 'casa_piu', region: 'ninhal', type: 'casinha_passaro', name: 'Pombal do Piu (Correio Aéreo)', x: -112, z: 20, rotY: face(-112, 20, -112, 0), scale: 2.4,
    data: { placa: 'Correio Aéreo do Piu — entregas rápidas (às vezes)' } },
  { id: 'caixa_correio_piu', region: 'ninhal', type: 'caixa_correio', name: 'Caixa de Cartas do Piu', x: -104, z: 10, rotY: Math.PI },
  { id: 'ninho_mamae', region: 'ninhal', type: 'ninho', name: 'Ninho da Mamãe Sabiá', x: -195, z: 35, scale: 1.6 },
  { id: 'ninho_trio', region: 'ninhal', type: 'ninho', name: 'Ninho do Tico-Teco-Tuco', x: -118, z: -46, data: { y: 8, sobre: 'arvore_trio' } },
  { id: 'clareira_cantante', region: 'ninhal', type: 'praca', name: 'Clareira Cantante', x: -168, z: -8, scale: 0.9, data: { piso: 'grama' } },
  { id: 'coral_nota_1', region: 'ninhal', type: 'cogumelo', name: 'Cogumelo Dó', x: -192, z: 4, scale: 1, data: { nota: 0, cor: '#ff7aa8' } },
  { id: 'coral_nota_2', region: 'ninhal', type: 'cogumelo', name: 'Cogumelo Ré', x: -188, z: -1, scale: 1, data: { nota: 1, cor: '#ffd23f' } },
  { id: 'coral_nota_3', region: 'ninhal', type: 'cogumelo', name: 'Cogumelo Mi', x: -182, z: -3, scale: 1, data: { nota: 2, cor: '#8ef0c0' } },
  { id: 'coral_nota_4', region: 'ninhal', type: 'cogumelo', name: 'Cogumelo Fá', x: -176, z: -1, scale: 1, data: { nota: 3, cor: '#6ec6ff' } },
  { id: 'coral_nota_5', region: 'ninhal', type: 'cogumelo', name: 'Cogumelo Sol', x: -172, z: 4, scale: 1, data: { nota: 4, cor: '#c792ff' } },
  { id: 'cata_vento_ninhal', region: 'ninhal', type: 'cata_vento', name: 'Cata-Vento das Penas', x: -232, z: -56, scale: 1.4 },
  { id: 'rocha_pinceso', region: 'ninhal', type: 'rocha', name: 'Pedra Musguinho', x: -172, z: -93, scale: 0.9 },
  { id: 'casinha_passaro_ninhal_1', region: 'ninhal', type: 'casinha_passaro', x: -150, z: 18 },
  { id: 'casinha_passaro_ninhal_2', region: 'ninhal', type: 'casinha_passaro', x: -210, z: 18 },
  { id: 'casinha_passaro_ninhal_3', region: 'ninhal', type: 'casinha_passaro', x: -262, z: 10 },
  { id: 'casinha_passaro_ninhal_4', region: 'ninhal', type: 'casinha_passaro', x: -195, z: -78 },
  { id: 'placa_ninhal', region: 'ninhal', type: 'placa', name: 'Ninhal Cantante — fale baixinho (ou cante alto, tanto faz)', x: -98, z: 6, rotY: face(-98, 6, -80, 0) },
  { id: 'placa_subida', region: 'ninhal', type: 'placa', name: 'Ninho-Coreto ↑ (pula, pula, pula!)', x: -153, z: -24, rotY: face(-153, -24, -165, -12) },
  { id: 'banco_clareira', region: 'ninhal', type: 'banco', name: 'Banco da Clareira', x: -158, z: 2, rotY: face(-158, 2, -168, -8) },

  // ============================== BOSQUE AÇUCARADO ==============================
  { id: 'pirulito_gigante', region: 'bosque', type: 'pirulito_gigante', name: 'Pirulito Gigante', x: 188, z: 38, scale: 4,
    data: { marco: true, altura: 22 } },
  { id: 'casa_doceira', region: 'bosque', type: 'casa', name: 'Cabana da Confeiteira', x: 148, z: 80, rotY: face(148, 80, 150, 55),
    data: { estilo: 'biscoito', cor: '#e8b07a', telhado: '#ff7eb6' } },
  { id: 'placa_bosque', region: 'bosque', type: 'placa', name: 'Bosque Açucarado — proibido lamber as árvores (sério)', x: 112, z: 53, rotY: face(112, 53, 102, 44) },
  { id: 'placa_lamber', region: 'bosque', type: 'placa', name: 'Pirulito Gigante → (não é de comer, é de olhar)', x: 160, z: 62, rotY: face(160, 62, 152, 50) },
  { id: 'algodao_1', region: 'bosque', type: 'arvore_algodao', x: 140, z: 20, scale: 2.2, data: { cor: '#ffb3d9' } },
  { id: 'algodao_2', region: 'bosque', type: 'arvore_algodao', x: 120, z: 70, scale: 2, data: { cor: '#b3e5ff' } },
  { id: 'algodao_3', region: 'bosque', type: 'arvore_algodao', x: 162, z: 112, scale: 2.4, data: { cor: '#e0c3ff' } },
  { id: 'algodao_4', region: 'bosque', type: 'arvore_algodao', x: 200, z: 122, scale: 2.2, data: { cor: '#ffb3d9' } },
  { id: 'algodao_5', region: 'bosque', type: 'arvore_algodao', x: 242, z: 96, scale: 2, data: { cor: '#fff3a3' } },
  { id: 'algodao_6', region: 'bosque', type: 'arvore_algodao', x: 256, z: 58, scale: 2.4, data: { cor: '#b3e5ff' } },
  { id: 'algodao_7', region: 'bosque', type: 'arvore_algodao', x: 252, z: 10, scale: 2.2, data: { cor: '#ffb3d9' } },
  { id: 'algodao_8', region: 'bosque', type: 'arvore_algodao', x: 215, z: -22, scale: 2, data: { cor: '#e0c3ff' } },
  { id: 'algodao_9', region: 'bosque', type: 'arvore_algodao', x: 194, z: -26, scale: 1.8, data: { cor: '#b3ffd9' } },
  { id: 'algodao_10', region: 'bosque', type: 'arvore_algodao', x: 135, z: -8, scale: 1.8, data: { cor: '#fff3a3' } },
  { id: 'cogumelo_bosque_1', region: 'bosque', type: 'cogumelo', x: 135, z: 32, scale: 1.6, data: { marshmallow: true } },
  { id: 'cogumelo_bosque_2', region: 'bosque', type: 'cogumelo', x: 232, z: 76, scale: 1.4, data: { marshmallow: true } },
  { id: 'cogumelo_bosque_3', region: 'bosque', type: 'cogumelo', x: 168, z: 96, scale: 1.5, data: { marshmallow: true } },
  { id: 'cogumelo_bosque_4', region: 'bosque', type: 'cogumelo', x: 252, z: 32, scale: 1.2, data: { marshmallow: true } },
  { id: 'cogumelo_bosque_5', region: 'bosque', type: 'cogumelo', x: 206, z: -8, scale: 1.3, data: { marshmallow: true } },
  { id: 'gelatina_olhuda', region: 'bosque', type: 'estatua_olho', name: 'Gelatina Olhuda', x: 246, z: 74, rotY: face(246, 74, 188, 38), data: { material: 'gelatina' } },
  { id: 'banco_bosque', region: 'bosque', type: 'banco', name: 'Banco de Biscoito', x: 178, z: 62, rotY: face(178, 62, 188, 38) },
  { id: 'banco_calda', region: 'bosque', type: 'banco', name: 'Banco da Calda', x: 199, z: 92, rotY: face(199, 92, CALDA.x, CALDA.z) },
  { id: 'pirulito_mini_1', region: 'bosque', type: 'pirulito_gigante', x: 120, z: 40, scale: 1 },
  { id: 'pirulito_mini_2', region: 'bosque', type: 'pirulito_gigante', x: 228, z: 110, scale: 1.2 },
  { id: 'pirulito_mini_3', region: 'bosque', type: 'pirulito_gigante', x: 182, z: -6, scale: 1 },

  // ============================== CIDADE CÍLIOS ==============================
  { id: 'praca_cilios', region: 'cidade', type: 'praca', name: 'Praça dos Cílios', x: 0, z: -160, scale: 1.6 },
  { id: 'fonte', region: 'cidade', type: 'fonte', name: 'Fonte dos Cílios', x: 0, z: -160, scale: 1 },
  { id: 'cafeteria', region: 'cidade', type: 'cafeteria', name: 'Cafeteria Nuvem de Leite', x: 30, z: -160, rotY: face(30, -160, 0, -160),
    data: { mesasFora: 3, toldo: '#ffd6e8' } },
  { id: 'loja_acessorios', region: 'cidade', type: 'loja_acessorios', name: 'Laços & Cachos — Acessórios', x: -30, z: -160, rotY: face(-30, -160, 0, -160),
    data: { toldo: '#c9b6ff' } },
  { id: 'torre_relogio', region: 'cidade', type: 'torre_relogio', name: 'Torre do Relógio Pisca-Hora', x: TORRE.x, z: TORRE.z, rotY: 0, scale: 1.2,
    data: { marco: true, height: TORRE.height, raio: 6, terraco: { y: TORRE.y + TORRE.height, raio: TORRE.topRadius } } },
  { id: 'doceria', region: 'cidade', type: 'casa', name: 'Doceria Jujubinha', x: -23, z: -140, rotY: face(-23, -140, 0, -160), data: { loja: 'doceria', cor: '#ffd6e0', telhado: '#ff8fab' } },
  { id: 'livraria', region: 'cidade', type: 'casa', name: 'Livraria Pálpebra Feliz', x: -12, z: -130, rotY: face(-12, -130, 0, -132), data: { loja: 'livraria', cor: '#d8f3dc', telhado: '#52b788' } },
  { id: 'floricultura', region: 'cidade', type: 'casa', name: 'Floricultura Pétala Piscante', x: -40, z: -196, rotY: face(-40, -196, -35, -180), data: { loja: 'floricultura', cor: '#ffe5ec', telhado: '#fb6f92' } },
  { id: 'correio_central', region: 'cidade', type: 'casa', name: 'Correio Central dos Cílios', x: 40, z: -198, rotY: face(40, -198, 35, -180), data: { loja: 'correio', cor: '#cde7ff', telhado: '#5aa9e6' } },
  { id: 'prefeitura', region: 'cidade', type: 'casa', name: 'Prefeitura Piscante', x: 0, z: -226, rotY: 0, scale: 1.4, data: { estilo: 'prefeitura', cor: '#fff1e6', telhado: '#a3c4f3' } },
  { id: 'casa_cidade_1', region: 'cidade', type: 'casa', x: -32, z: -220, rotY: face(-32, -220, 0, -200), data: { cor: '#fde2e4', telhado: '#e5989b' } },
  { id: 'casa_cidade_2', region: 'cidade', type: 'casa', x: 32, z: -222, rotY: face(32, -222, 0, -200), data: { cor: '#e2ece9', telhado: '#7bdff2' } },
  { id: 'casa_cidade_3', region: 'cidade', type: 'casa', x: -52, z: -138, rotY: face(-52, -138, -30, -150), data: { cor: '#fff1c1', telhado: '#f6bd60' } },
  { id: 'casa_cidade_4', region: 'cidade', type: 'casa', x: 56, z: -150, rotY: face(56, -150, 30, -150), data: { cor: '#e4c1f9', telhado: '#a06cd5' } },
  { id: 'casa_cidade_5', region: 'cidade', type: 'casa', x: -42, z: -112, rotY: face(-42, -112, 1, -112), data: { cor: '#caffbf', telhado: '#80b918' } },
  { id: 'casa_cidade_6', region: 'cidade', type: 'casa', x: 22, z: -100, rotY: face(22, -100, 1, -100), data: { cor: '#ffd6a5', telhado: '#ff924c' } },
  { id: 'casa_cidade_7', region: 'cidade', type: 'casa', x: -72, z: -152, rotY: face(-72, -152, -62, -170), data: { cor: '#bde0fe', telhado: '#8ecae6' } },
  { id: 'casa_cidade_8', region: 'cidade', type: 'casa', x: 66, z: -204, rotY: face(66, -204, 60, -186), data: { cor: '#ffc6ff', telhado: '#e36bae' } },
  { id: 'estatua_olho_cidade', region: 'cidade', type: 'estatua_olho', name: 'O Grande Piscão', x: -14, z: -147, rotY: face(-14, -147, 0, -160) },
  { id: 'banco_fonte_1', region: 'cidade', type: 'banco', x: r2(10 * Math.cos(30 * D)), z: r2(-160 + 10 * Math.sin(30 * D)), rotY: face(8.66, -155, 0, -160) },
  { id: 'banco_fonte_2', region: 'cidade', type: 'banco', x: r2(10 * Math.cos(150 * D)), z: r2(-160 + 10 * Math.sin(150 * D)), rotY: face(-8.66, -155, 0, -160) },
  { id: 'banco_fonte_3', region: 'cidade', type: 'banco', x: r2(10 * Math.cos(210 * D)), z: r2(-160 + 10 * Math.sin(210 * D)), rotY: face(-8.66, -165, 0, -160) },
  { id: 'banco_fonte_4', region: 'cidade', type: 'banco', x: r2(10 * Math.cos(330 * D)), z: r2(-160 + 10 * Math.sin(330 * D)), rotY: face(8.66, -165, 0, -160) },
  { id: 'banco_cafeteria', region: 'cidade', type: 'banco', name: 'Banquinho da Cafeteria', x: 24, z: -173, rotY: face(24, -173, 0, -160) },
  { id: 'banco_cais', region: 'cidade', type: 'banco', name: 'Banco do Cais', x: 46, z: -112, rotY: face(46, -112, 52, -100) },
  { id: 'placa_cidade', region: 'cidade', type: 'placa', name: 'Bem-vinda à Cidade Cílios! (pisque duas vezes para entrar)', x: 7, z: -96, rotY: face(7, -96, 2, -110) },
  { id: 'placa_pico', region: 'cidade', type: 'placa', name: 'Pico Pestana ↗ (só com vento a favor)', x: 50, z: -178, rotY: face(50, -178, 47, -183) },

  // ============================== PICO PESTANA ==============================
  { id: 'portal_nevoa', region: 'pico', type: 'portal_nuvem', name: 'Portal da Névoa Sonolenta', x: SERPENTINA[0][0], z: SERPENTINA[0][1],
    rotY: face(84, -193, SERPENTINA[0][0], SERPENTINA[0][1]), scale: 1.2, data: { gate: 'nevoa_pico' } },
  { id: 'cachoeira_pico', region: 'pico', type: 'cachoeira', name: 'Cascata do Bocejo', x: 187, z: -155, rotY: face(187, -155, 160, -139),
    data: { topoY: 16, baseY: 6, rio: 'rio_bocejo' } },
  { id: 'mirante_pico', region: 'pico', type: 'mirante', name: 'Mirante da Pestana', x: MIRANTE.x, z: MIRANTE.z, rotY: face(MIRANTE.x, MIRANTE.z, 0, 0), scale: 1,
    data: { marco: true } },
  { id: 'banco_mirante', region: 'pico', type: 'banco', name: 'Banco do Mirante', x: 157, z: -212, rotY: face(157, -212, 0, 0) },
  { id: 'arvore_bando', region: 'pico', type: 'arvore_gigante', name: 'Árvore do Bando', x: 180, z: -216, scale: 1.4,
    data: { trunkRadius: 3, height: 18, variante: 'retorcida' } },
  ...[70, 110, 150, 190, 230].map((a, i) => {
    const [x, z] = polar(180, -216, a, 9.5);
    return { id: 'ninho_bando_' + (i + 1), region: 'pico', type: 'ninho', name: 'Ninho do Bando', x, z, rotY: face(x, z, 180, -216), scale: 1.2 };
  }),
  { id: 'pedra_bocejo', region: 'pico', type: 'rocha', name: 'Pedra do Bocejo', x: CUME.x, z: CUME.z, scale: 1.2,
    data: { altura: CUME.topY - CUME.y, coluna: true, raio: 2.8, topoY: CUME.topY } },
  { id: 'olho_do_pico', region: 'pico', type: 'estatua_olho', name: 'Olho do Pico', x: 186, z: -198, rotY: face(186, -198, 0, 0), scale: 1.6, data: { marco: true } },
  { id: 'cata_vento_pico', region: 'pico', type: 'cata_vento', x: 166, z: -201 },
  { id: 'placa_mirante', region: 'pico', type: 'placa', name: 'Mirante da Pestana — dá tchauzinho pro reino!', x: 162, z: -196, rotY: face(162, -196, 157, -201) },
  { id: 'rocha_pico_1', region: 'pico', type: 'rocha', x: 140, z: -185, scale: 1.5 },
  { id: 'rocha_pico_2', region: 'pico', type: 'rocha', x: 210, z: -170, scale: 1.8 },
  { id: 'rocha_pico_3', region: 'pico', type: 'rocha', x: 150, z: -240, scale: 1.3 },
];

// Pontes (calculadas) — o rio cruza a Estrada do Bocejo, a Trilha dos Piados e a Trilha do Riacho.
LANDMARKS.push(
  { id: 'ponte_bocejo', region: 'vila', type: 'ponte', name: 'Ponte do Bocejo', ...cruzamento('estrada_vila_cidade'), scale: 1, data: { comprimento: 10, largura: 5 } },
  { id: 'ponte_piscar', region: 'vila', type: 'ponte', name: 'Ponte do Piscar Lento', ...cruzamento('trilha_vila_ninhal'), scale: 1, data: { comprimento: 10, largura: 4 } },
  { id: 'ponte_troncos', region: 'cidade', type: 'ponte', name: 'Ponte de Troncos', ...cruzamento('trilha_riacho'), scale: 0.8, data: { comprimento: 9, largura: 3, rustica: true } },
);

// ---------------------------------------------------------------------------------------------
// Postes com cílios ao longo das estradas principais (a cada ~24 m, lados alternados).
// Pulam lugares perto de outros landmarks, da água ou de outras trilhas.
const SOLIDO = { casa_quim: 6, casa: 5, cafeteria: 7, loja_acessorios: 6, fonte: 5, banco: 1.3, placa: 0.6, poste: 0.4,
  moinho: 5, horta: 4, jardim: 5, ninho: 1.5, casinha_passaro: 1, cata_vento: 1, arvore_algodao: 2.5, pirulito_gigante: 1.5,
  cogumelo: 2, flor_gigante: 2, torre_relogio: 5, mirante: 4, rocha: 2.5, cerca: 1, 'poço': 1.8, coreto: 5, estatua_olho: 2,
  caixa_correio: 0.5 };
function distSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0;
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}
function distPolyline(px, pz, pts) {
  let d = Infinity;
  for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, distSeg(px, pz, ...pts[i], ...pts[i + 1]));
  return d;
}
function regiaoDe(x, z) {
  for (const r of REGIONS) if (Math.hypot(x - r.center.x, z - r.center.z) <= r.radius - 3) return r.id;
  return null;
}
function lugarLivre(x, z, raio) {
  for (const l of LANDMARKS) {
    const rr = l.type === 'arvore_gigante' ? (l.data.trunkRadius + 3) : (SOLIDO[l.type] ?? 0) * (l.scale ?? 1);
    if (Math.hypot(x - l.x, z - l.z) < rr + raio + 2) return false;
  }
  if (distPolyline(x, z, RIO) < RIO_LARGURA / 2 + 3) return false;
  for (const w of [LAGO, CALDA]) if (Math.hypot(x - w.x, z - w.z) < w.radius + 3) return false;
  return true;
}
const POSTES_EM = ['estrada_campo_vila', 'estrada_vila_cidade', 'trilha_vila_ninhal', 'trilha_vila_bosque', 'estrada_cidade_pico', 'serpentina_pico'];
for (const pid of POSTES_EM) {
  const path = PATHS.find((p) => p.id === pid);
  let acc = 12, lado = 1, n = 0;
  for (let i = 0; i < path.points.length - 1; i++) {
    const [ax, az] = path.points[i], [bx, bz] = path.points[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    while (acc < len) {
      const t = acc / len, nx = -(bz - az) / len, nz = (bx - ax) / len;
      const off = path.width / 2 + 1.2;
      const x = r2(ax + (bx - ax) * t + nx * off * lado), z = r2(az + (bz - az) * t + nz * off * lado);
      const region = regiaoDe(x, z);
      const longeDeTrilhas = PATHS.every((p) => distPolyline(x, z, p.points) > p.width / 2 + 1);
      if (region && longeDeTrilhas && lugarLivre(x, z, 0.4)) {
        LANDMARKS.push({ id: `poste_${pid}_${++n}`, region, type: 'poste', x, z, rotY: face(x, z, x - nx * lado, z - nz * lado) });
        lado = -lado;
      }
      acc += 24;
    }
    acc -= len;
  }
}

// ---------------------------------------------------------------------------------------------
// PLATAFORMAS. Alcance da Quim: pulo sobe ~1,6; vão horizontal ~3,5 andando / ~6 correndo;
// trampolim (bounce 2.2) lança ~5. As rotas usam no máximo +1,3 de subida e 3,2 de vão por salto
// (+4,2 / 3,5 saindo de trampolim), com folga para o jogador.

/** Espiral de plataformas ao redor de um tronco. */
function espiral(prefix, region, route, cx, cz, { ring, a0, step, y0, dy, n, type = 'galho', radius = 1.5, special = {} }) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const [x, z] = polar(cx, cz, a0 + step * i, ring);
    const p = { id: `${prefix}_${i + 1}`, region, type, x, y: r2(y0 + dy * i), z, radius, route, rotY: face(cx, cz, x, z) };
    Object.assign(p, special[i] || {});
    out.push(p);
  }
  return out;
}
/** Ponte de cipó retangular ligando duas plataformas circulares no mesmo nível. */
function ponteCipo(id, region, route, a, b, w = 2) {
  const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
  return { id, region, type: 'ponte_cipo', x: r2((a.x + b.x) / 2), y: a.y, z: r2((a.z + b.z) / 2),
    w, d: r2(len - a.radius - b.radius + 0.8), rotY: r2(Math.atan2(dx, dz)), route };
}
const bounce = { type: 'ninho_trampolim', bounce: 2.2 };

// --- Ninhal: subida até o Ninho-Coreto (≈30 acima do chão) ---
const subidaS = espiral('ninhal_s', 'ninhal', 'subida_coreto', T.subida.x, T.subida.z,
  { ring: T.subida.trunkRadius + 1.2, a0: 110, step: 52, y0: NINHAL_Y + 0.9, dy: 1.05, n: 10,
    special: { 2: { type: 'folha' }, 5: { type: 'folha' }, 7: { type: 'folha' } } });
const subidaP = espiral('ninhal_p', 'ninhal', 'subida_coreto', T.ponte.x, T.ponte.z,
  { ring: T.ponte.trunkRadius + 1.2, a0: 37.7, step: -52, y0: subidaS[9].y, dy: 0, n: 6 });
// P1 = trampolim; daí para cima sobe 1,05 por degrau.
subidaP[1] = { ...subidaP[1], ...bounce };
for (let i = 2; i < subidaP.length; i++) subidaP[i].y = r2(subidaP[1].y + 3.95 + 1.05 * (i - 2));
const subidaM = espiral('ninhal_m', 'ninhal', 'subida_coreto', T.mae.x, T.mae.z,
  { ring: T.mae.trunkRadius + 1.3, a0: -47.4, step: 36, y0: subidaP[5].y, dy: 0, n: 7, radius: 1.6, type: 'folha' });
subidaM[0].type = 'galho';
subidaM[1] = { ...subidaM[1], ...bounce };
for (let i = 2; i < subidaM.length; i++) subidaM[i].y = r2(subidaM[1].y + 3.95 + 1.05 * (i - 2));
const [m8x, m8z] = polar(T.mae.x, T.mae.z, 190, 9.5);
const subidaFinal = [
  { id: 'ninhal_m_8', region: 'ninhal', type: 'ninho_trampolim', bounce: 2.2, x: m8x, y: 30, z: m8z, radius: 1.5, route: 'subida_coreto' },
  { id: 'ninho_coreto_piso', region: 'ninhal', type: 'galho', x: CORETO.x, y: CORETO.y, z: CORETO.z, radius: CORETO.radius, route: 'subida_coreto' },
];
const subidaColuna = [
  ...subidaS,
  ponteCipo('ninhal_ponte_1', 'ninhal', 'subida_coreto', subidaS[9], subidaP[0]),
  ...subidaP,
  ponteCipo('ninhal_ponte_2', 'ninhal', 'subida_coreto', subidaP[5], subidaM[0]),
  ...subidaM,
  ...subidaFinal,
];

// --- Ninhal: escadinha de galhos até o oco da Dona Plumínia ---
const subidaCoruja = espiral('ninhal_c', 'ninhal', 'oco_coruja', T.coruja.x, T.coruja.z,
  { ring: T.coruja.trunkRadius + 1.2, a0: 0, step: 44, y0: NINHAL_Y + 0.9, dy: 1.1, n: 7 });
const [ocoX, ocoZ] = polar(T.coruja.x, T.coruja.z, OCO_ANG, T.coruja.trunkRadius + 1.6);
subidaCoruja.push({ id: 'oco_coruja', region: 'ninhal', type: 'galho', x: ocoX, y: 12.6, z: ocoZ, radius: 2, route: 'oco_coruja' });

// --- Vila: caixotes até o terraço da Casa do Telhado Alto (onde o gato se esconde) ---
const caixotes = espiral('vila_caixote', 'vila', 'telhado_gato', CASA_GATO.x, CASA_GATO.z,
  { ring: 6.4, a0: 150, step: 21, y0: 3.1, dy: 1.1, n: 6, type: 'escada', radius: 1.1 });
caixotes.push({ id: 'terraco_gato', region: 'vila', type: 'pedra', x: CASA_GATO.x, y: CASA_GATO.roofY, z: CASA_GATO.z, radius: 4, route: 'telhado_gato' });

// --- Cidade: escadaria externa da Torre do Relógio até o terraço ---
const escadaTorre = espiral('torre_degrau', 'cidade', 'torre_relogio', TORRE.x, TORRE.z,
  { ring: 8.5, a0: 90, step: 28, y0: TORRE.y + 0.9, dy: 1.1, n: 13, type: 'escada', radius: 1.3 });
escadaTorre.push({ id: 'terraco_torre', region: 'cidade', type: 'pedra', x: TORRE.x, y: TORRE.y + TORRE.height, z: TORRE.z, radius: TORRE.topRadius, route: 'torre_relogio' });

// --- Campo: pedras até a ilhota do Lago Espelhinho ---
const pedrasLago = [
  { id: 'lago_pedra_1', x: -21, z: 147, y: 0.35, radius: 1.1 },
  { id: 'lago_pedra_2', x: -24.5, z: 144.5, y: 0.5, radius: 1.1 },
  { id: 'lago_pedra_3', x: -28, z: 142, y: 0.6, radius: 1.1 },
  { id: 'lago_pedra_4', x: -31.5, z: 139.5, y: 0.7, radius: 1.1 },
  { id: 'ilhota_lago', x: -37, z: 135, y: 0.85, radius: 3.6 },
].map((p) => ({ region: 'campo', type: 'pedra', route: 'ilhota_lago', ...p }));

// --- Bosque: nuvens de algodão-doce até a Nuvem do Tesouro ---
const nuvens = [
  { id: 'bosque_cogumelo_pula', x: 208, z: 30, y: 1.6, radius: 1.6, ...bounce, look: 'cogumelo' },
  { id: 'bosque_nuvem_1', x: 213, z: 26, y: 5.4, radius: 2 },
  { id: 'bosque_nuvem_2', x: 218, z: 22, y: 6.5, radius: 2 },
  { id: 'bosque_nuvem_3', x: 223, z: 25, y: 7.6, radius: 1.8, ...bounce, look: 'cogumelo' },
  { id: 'bosque_nuvem_4', x: 226, z: 31, y: 11.5, radius: 2 },
  { id: 'nuvem_tesouro', x: 223, z: 38, y: 12.6, radius: 3.2 },
].map((p) => ({ region: 'bosque', type: 'nuvem', route: 'nuvem_tesouro', ...p }));

// --- Pico: pedras em volta da Pedra do Bocejo até o cume ---
const cume = espiral('pico_pedra', 'pico', 'cume_bocejo', CUME.x, CUME.z,
  { ring: 4.6, a0: 140, step: 46, y0: CUME.y + 0.9, dy: 1.1, n: 7, type: 'pedra', radius: 1.3 });
cume.push({ id: 'cume_bocejo', region: 'pico', type: 'pedra', x: CUME.x, y: CUME.topY, z: CUME.z, radius: 2.6, route: 'cume_bocejo' });

export const PLATFORMS = [...subidaColuna, ...subidaCoruja, ...caixotes, ...escadaTorre, ...pedrasLago, ...nuvens, ...cume];

// ---------------------------------------------------------------------------------------------
export const GATES = [
  { id: 'nevoa_pico', x: PICO.x, z: PICO.z, radius: 64, requiresFlag: 'pico_liberado',
    message: 'Uma névoa sonolenta e um vento muito forte empurram a Quim de volta... Quem será que conhece o caminho do Pico?' },
];

// ---------------------------------------------------------------------------------------------
// Pontos de história (para story.js / missions). Tudo fora d'água e dentro das regiões.
const P = (id, x, z, y) => (y === undefined ? { id, x, z } : { id, x, z, y });
const plat = (id) => PLATFORMS.find((p) => p.id === id);
export const SPOTS = {
  // Campo — "Flores Murchas": o jardineiro replanta no jardim_jardineiro.
  flores_murchas: [
    P('flor_murcha_1', -58, 186), P('flor_murcha_2', -40, 222), P('flor_murcha_3', 26, 246), P('flor_murcha_4', 70, 162),
    P('flor_murcha_5', 52, 112), P('flor_murcha_6', -66, 140), P('flor_murcha_7', -10, 96), P('flor_murcha_8', 74, 222),
  ],
  entrega_flores: 'jardim_jardineiro',
  // Vila — hortas, regador, gato no telhado, carta.
  regador: P('regador', 18, 38),
  hortas: ['horta_vila_1', 'horta_vila_2', 'horta_vila_3'],
  gato_telhado: P('gato_telhado', CASA_GATO.x + 1.5, CASA_GATO.z - 1, CASA_GATO.roofY),
  gato_pistas: [P('gato_pista_1', 30, 4), P('gato_pista_2', 38, 6), P('gato_pista_3', 41, 2)],
  // Ninhal — O Filhote Sem Ninho.
  pinceso_cipo: P('pinceso_cipo', -128, -24),
  penas_verdes: [
    P('pena_verde_1', -134, -33), P('pena_verde_2', -140, -45), P('pena_verde_3', -146, -57),
    P('pena_verde_4', -141, -69), P('pena_verde_5', -150, -80), P('pena_verde_6', -162, -86),
  ],
  pinceso_pouso: P('pinceso_pouso', -172, -93, 7.2), // em cima da Pedra Musguinho
  // Ninhal — Ovinhos Perdidos (frágeis) → ninho_mamae.
  ovos: [
    P('ovo_1', -246, 28), P('ovo_2', -200, 62), P('ovo_3', -128, 33),
    P('ovo_4', plat('ninhal_s_3').x, plat('ninhal_s_3').z, plat('ninhal_s_3').y), P('ovo_5', -218, -80),
  ],
  ninho_ovos: 'ninho_mamae',
  // Ninhal — Café dos Passarinhos: sementes para a arvore_cafe.
  sementes_cafe: [
    P('semente_1', -122, 55), P('semente_2', -160, 70), P('semente_3', -236, 70),
    P('semente_4', -262, -6), P('semente_5', -205, -64), P('semente_6', -132, -78),
  ],
  // Ninhal — Casa Nova: materiais para o ninho_casal.
  casa_nova: {
    gravetos: [P('graveto_1', -238, 30), P('graveto_2', -268, -40), P('graveto_3', -214, -100), P('graveto_4', -176, 52)],
    folhas: [P('folha_1', -244, -80), P('folha_2', -188, 82), P('folha_3', -270, 22)],
    flores: [P('flor_ninho_1', -222, 72), P('flor_ninho_2', -140, 64), P('flor_ninho_3', -275, -28)],
  },
  // Ninhal — Penas ao Vento (minigame na clareira do cata-vento).
  penas_vento: { landmark: 'cata_vento_ninhal', x: -232, z: -48, radius: 14 },
  // Ninhal — O Coral da Floresta (5 cogumelos-nota).
  coral: { x: -182, z: 2, notas: ['coral_nota_1', 'coral_nota_2', 'coral_nota_3', 'coral_nota_4', 'coral_nota_5'] },
  // Ninhal — clareira reservada para a Casinha Asas de Saudade (docs/casinha-asas-de-saudade.md): nada do mapa
  // fica dentro do raio; a Trilhinha das Flores Azuis (trilha_asas, secreta) chega pela borda leste.
  asas_de_saudade: { x: -176, z: 72, radius: 12, entrada: [-166, 71], laguinho: { x: -170, z: 80, r: 2.2 } },
  // Ninhal — Alvorada: acordar a Dona Plumínia no oco, concerto no Ninho-Coreto.
  oco_coruja: P('oco_coruja', plat('oco_coruja').x, plat('oco_coruja').z, plat('oco_coruja').y),
  coreto_palco: P('coreto_palco', CORETO.x, CORETO.z, CORETO.y),
  // Carteiro Piu: destinos de cartas em outras regiões.
  carteiro_destinos: [
    { id: 'carta_vila', landmark: 'caixa_correio_vila', x: 9, z: -24 },
    { id: 'carta_quim', landmark: 'caixa_correio_quim', x: -6, z: 221 },
    { id: 'carta_jardineiro', landmark: 'casa_jardineiro', x: 38, z: 170 },
    { id: 'carta_cidade', landmark: 'correio_central', x: 40, z: -191 },
    { id: 'carta_doceira', landmark: 'casa_doceira', x: 148, z: 73 },
  ],
  // Bancos onde a Quim pode sentar e dormir até a noite / o amanhecer.
  bancos_dormir: ['banco_quim', 'banco_lago', 'banco_praca_vila_1', 'banco_clareira', 'banco_fonte_1', 'banco_calda', 'banco_mirante'],
  // Cidade / Pico.
  cafeteria_mesa: P('cafeteria_mesa', 22, -160),
  loja_balcao: P('loja_balcao', -22, -160),
  mirante: P('mirante', MIRANTE.x, MIRANTE.z, 30),
  bando: P('bando', 180, -216, 30),
  pico_entrada: P('pico_entrada', SERPENTINA[0][0], SERPENTINA[0][1]),
};

// ---------------------------------------------------------------------------------------------
// Jujubas (moeda). ~120 no total: metade no Bosque, o resto escondido pelo mundo.
const CORES = ['#ff6fa8', '#ffd23f', '#7ee081', '#6ec6ff', '#c792ff', '#ff9f5a'];
const JJ = [];
const jj = (region, x, z, extra = {}) => JJ.push({ region, x: r2(x), z: r2(z), ...extra });
const anel = (region, cx, cz, r, n, a0 = 0, extra) => { for (let i = 0; i < n; i++) jj(region, ...polar(cx, cz, a0 + (360 / n) * i, r), extra); };
const naPlat = (id, extra = {}) => { const p = plat(id); jj(p.region, p.x, p.z, { y: p.y, ...extra }); };
function aoLongo(region, pathId, n, from = 0.1, to = 0.9, extra) {
  const pts = PATHS.find((p) => p.id === pathId).points;
  const seg = []; let total = 0;
  for (let i = 0; i < pts.length - 1; i++) { const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); seg.push(l); total += l; }
  for (let k = 0; k < n; k++) {
    let s = total * (from + (to - from) * (n === 1 ? 0.5 : k / (n - 1)));
    let i = 0; while (i < seg.length - 1 && s > seg[i]) { s -= seg[i]; i++; }
    const t = Math.min(1, s / seg[i]);
    jj(region, pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t, extra);
  }
}
const H = { hidden: true };

// Bosque (50)
anel('bosque', 188, 38, 10, 8, 20);                                   // roda em volta do Pirulito Gigante
aoLongo('bosque', 'trilha_bosque_doce', 12, 0.08, 0.92);              // trilha doce em volta do pirulito
for (const id of ['bosque_cogumelo_pula', 'bosque_nuvem_1', 'bosque_nuvem_2', 'bosque_nuvem_3', 'bosque_nuvem_4']) naPlat(id);
anel('bosque', 223, 38, 1.8, 5, 0, { y: 12.6, hidden: true });       // Nuvem do Tesouro
anel('bosque', CALDA.x, CALDA.z, CALDA.radius + 3.5, 6, 90);         // margem do laguinho de calda
for (const [x, z] of [[140, 20], [120, 70], [162, 112], [200, 122], [256, 58]]) anel('bosque', x, z, 7.5, 2, 45);
jj('bosque', 141, 88, H); jj('bosque', 155, 89, H);                   // atrás da Cabana da Confeiteira
jj('bosque', 262, 30, H); jj('bosque', 172, 102, H);                  // atrás dos cogumelos
jj('bosque', 120, 26); jj('bosque', 225, 128, H);
// Campo (17)
naPlat('ilhota_lago'); jj('campo', -38.5, 133, { y: 0.85 }); jj('campo', -35.5, 137, { y: 0.85, hidden: true });
naPlat('lago_pedra_3');
jj('campo', 0, 244, H);                                               // atrás da casa da Quim
anel('campo', -24, 170, 10, 4, 45);                                   // em volta da Florzona
aoLongo('campo', 'trilha_campo_bosque', 3, 0.15, 0.6);
jj('campo', 72, 206, H); jj('campo', 16, 200, H);                     // atrás do moinho / no jardim
jj('campo', -45, 246, H);                                             // aos pés da Pedra Olhuda
aoLongo('campo', 'atalho_raizes', 2, 0.85, 1);
// Vila (13)
naPlat('terraco_gato'); jj('vila', CASA_GATO.x - 1.5, CASA_GATO.z + 1.5, { y: CASA_GATO.roofY, hidden: true }); naPlat('vila_caixote_4');
jj('vila', 31, -16, H); jj('vila', -24, 49, H); jj('vila', 52, 58, H); // atrás das casas
anel('vila', 22, 32, 4, 3, 0);                                         // em volta do poço
jj('vila', 5, 15 - 7.5); jj('vila', 5 + 7.5, 15);                     // na pracinha
jj('vila', -60, 24); jj('vila', -24, -44, H);
// Ninhal (18)
for (const id of ['ninhal_s_4', 'ninhal_s_8', 'ninhal_s_10', 'ninhal_p_4', 'ninhal_p_6', 'ninhal_m_4', 'ninhal_m_7']) naPlat(id);
anel('ninhal', CORETO.x, CORETO.z, 3.8, 3, 30, { y: CORETO.y });     // no Ninho-Coreto
naPlat('oco_coruja', H); naPlat('ninhal_c_5');
jj('ninhal', -158, -42, H); jj('ninhal', -236, 12, H); jj('ninhal', -116, -55, H); // entre raízes
jj('ninhal', -225, 50); jj('ninhal', -176, -96, H); jj('ninhal', -150, 30);
// Cidade (12)
anel('cidade', TORRE.x, TORRE.z, 4, 4, 45, { y: TORRE.y + TORRE.height, hidden: true });
naPlat('torre_degrau_5'); naPlat('torre_degrau_10');
jj('cidade', 38, -168, H); jj('cidade', -38, -168, H); jj('cidade', 0, -236, H); // atrás da cafeteria/loja/prefeitura
jj('cidade', 42, -110); jj('cidade', 50, -120);                       // no cais
jj('cidade', -64, -168);                                              // começo do Atalho do Cipó
// Pico (10)
anel('pico', CUME.x, CUME.z, 1.4, 3, 0, { y: CUME.topY, hidden: true });
naPlat('pico_pedra_3'); naPlat('pico_pedra_6');
jj('pico', 146, -203); jj('pico', 154, -214, H);
for (const i of [5, 13, 21]) jj('pico', SERPENTINA[i][0], SERPENTINA[i][1]);

export const JUJUBA_SPOTS = JJ.map((j, i) => ({ id: `jj_${j.region}_${String(i + 1).padStart(3, '0')}`, color: CORES[i % CORES.length], ...j }));

// ---------------------------------------------------------------------------------------------
// Decoração procedural por região. trees/flowers/rocks = quantidade de instâncias na região;
// grassDensity 0..1 (1 = grama cheia). special = decorações próprias do bioma (ver docs/mapa.md).
export const SCATTER = {
  campo: { trees: 35, flowers: 1400, rocks: 30, grassDensity: 1, treeKind: 'arredondada',
    special: ['flores_olhudas', 'petalas_ao_vento', 'borboletas', 'margaridas_altas', 'cata_ventos_mini'] },
  vila: { trees: 25, flowers: 450, rocks: 12, grassDensity: 0.7, treeKind: 'frutifera',
    special: ['cerquinhas', 'caixotes', 'varais_de_roupa', 'vasos_de_flor', 'bandeirolas'] },
  ninhal: { trees: 70, flowers: 320, rocks: 25, grassDensity: 0.85, treeKind: 'alta',
    special: ['samambaias', 'cipos_pendurados', 'penas_flutuantes', 'casinhas_passaro_mini', 'cogumelos_pequenos'] },
  bosque: { trees: 60, flowers: 500, rocks: 10, grassDensity: 0.6, treeKind: 'algodao_doce',
    special: ['pirulitos_mini', 'bengalas_doces', 'balas_de_goma', 'granulado_no_chao', 'bolhas_de_calda'] },
  cidade: { trees: 20, flowers: 260, rocks: 6, grassDensity: 0.35, treeKind: 'podada',
    special: ['lampioes', 'floreiras', 'toldos', 'bandeirolas', 'gatinhos_na_janela'] },
  pico: { trees: 18, flowers: 150, rocks: 60, grassDensity: 0.5, treeKind: 'pinheirinho',
    special: ['nuvens_baixas', 'neve_de_algodao', 'pedras_olhudas', 'bandeirinhas_de_vento'] },
  // Campos entre regiões (fora de qualquer raio): pradaria macia que mistura as cores vizinhas.
  transicao: { trees: 140, flowers: 900, rocks: 45, grassDensity: 0.9, treeKind: 'arredondada',
    special: ['arbustos_olhudos', 'cercas_velhas', 'pedras_com_musgo', 'flores_do_caminho'] },
};
