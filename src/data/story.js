// Roteiro do Mundo Olhos — dados puros (sem Three.js). O sistema de missões, os NPCs e a UI leem daqui.
// Bíblia da história (lore, personagens, linha principal, mapa da história): docs/historia.md.
//
// Coordenadas: tudo vem de src/data/worldmap.js (SPOTS, PLATFORMS, LANDMARKS) para nunca desalinhar.
// Itens em cima de plataformas usam y = topo da plataforma + 0,5. Pontos sem y ficam no chão (world.getHeight).
//
// Campos EXTRAS (opcionais, além do contrato em docs/ARQUITETURA.md):
//   CameraBeat (PROLOGUE/ENDING): { camera:{x,y,z,lookX,lookY,lookZ}, seconds?, dayTime? }
//     move a câmera de cena; as falas seguintes acontecem com ela. dayTime = pular a hora (render.skipTo).
//   goto.y               altura do alvo quando ele fica em cima de uma plataforma (telhado, torre, coreto).
//                        O passo só conta com a Quim a menos de ~2 m dessa altura (senão vale ficar embaixo).
//   interact.target.y    idem; interact.prop = prop que o world.spawnProp cria no alvo (ex.: 'cipo_prisao').
//   interact.radius      raio do interactable quando o padrão (2,5) não alcança (alvo em cima de uma pedra alta).
//                        Alvo que é landmark: use pegada do landmark + 1,5 (docs/mapa.md, seção 8).
//   collect.label        nome do item no HUD quando difere do tipo do prop (ex.: 'Jujuba Dourada').
//   minigame.lines/hint  falas depois de vencer o minigame.
//   cutscene.dayTime     pula para essa hora antes das falas (ex.: 0.24 = amanhecer).
//   cafe.free            a primeira bebida é cortesia (não cobra jujubas).
//   DRINKS.requiresFlag  a bebida só aparece no cardápio depois dessa flag.
//   NPCS.look.species extra / accessory: textos livres para quem modela (ver docs/historia.md).
//   NPCS.voice.timbre    'doce'|'piado'|'grave'|'fofo'|'rouco'|'suave'|'nasal'|'arrastado'.
// deliver entrega todos os itens daquele tipo que a Quim carrega para aquela missão; com deliver.count,
//   entrega só essa quantidade (uma carta para cada morador, por exemplo).
//
// Flags da história (state.flags):
//   gogo_afinado (Bala de Gogó) · partitura_alvorada (Relógio) · pico_liberado (Alvorada — libera o GATE nevoa_pico)
//   alvorada_ensaiada · final (fim da missão piados_no_pico: tocar ENDING e colorir todas as regiões em 1)
//   loja_aberta (a loja Laços & Cachos só vende depois) · receita_mel_semente (latte de mel no cardápio)
//   ninho_casal_pronto (world mostra o ninho_casal construído) · coral_ensaiado · carteira_honoraria · cafeteria_amiga
//   Reservada por docs/casinha-asas-de-saudade.md: visitou_asas_de_saudade.
import { SPOTS, PLATFORMS, LANDMARKS } from './worldmap.js';

// ---------------------------------------------------------------------------------------------
// Utilitários de dados
const r2 = (v) => Math.round(v * 100) / 100;
const plat = (id) => PLATFORMS.find((p) => p.id === id);
const lm = (id) => LANDMARKS.find((l) => l.id === id);
/** Topo andável de uma plataforma (onde a Quim pisa). */
const topo = (id) => { const p = plat(id); return { x: p.x, y: p.y, z: p.z }; };
/** Ponto de item: no chão (sem y) ou em cima de plataforma (y do topo + 0,5). */
const item = (id, x, z, yTopo) => (yTopo === undefined ? { id, x, z } : { id, x, z, y: r2(yTopo + 0.5) });
const itens = (spots) => spots.map((s) => item(s.id, s.x, s.z, s.y));
/** Ponto ao lado de um landmark (ângulo em graus: 0 = leste, 90 = sul). */
const aoLado = (id, landmarkId, aDeg, r) => {
  const l = lm(landmarkId), a = (aDeg * Math.PI) / 180;
  return item(id, r2(l.x + Math.cos(a) * r), r2(l.z + Math.sin(a) * r));
};
const xz = (o) => ({ x: o.x, z: o.z });
/** Ponto sem o id dos SPOTS: { x, z } ou { x, y, z }. */
const pt = (s) => (s.y === undefined ? xz(s) : { x: s.x, y: s.y, z: s.z });

// Falas: L(quem, texto, humor?). Atalhos para a Quim (Q), o Pinceso (P) e o narrador (N).
const L = (speaker, text, mood) => (mood ? { speaker, text, mood } : { speaker, text });
const Q = (text, mood = 'feliz') => L('quim', text, mood);
const P = (text, mood) => L('pinceso', text, mood);
const N = (text) => L('narrador', text);

// Lugares usados por mais de uma missão.
const TERRACO_GATO = topo('terraco_gato');
const TERRACO_TORRE = topo('terraco_torre');
const NUVEM_TESOURO = topo('nuvem_tesouro');
const ILHOTA = topo('ilhota_lago');
const OCO = SPOTS.oco_coruja;
const CORETO = SPOTS.coreto_palco;
const destino = (id) => xz(SPOTS.carteiro_destinos.find((d) => d.id === id));

// ---------------------------------------------------------------------------------------------
export const CAST = {
  quim: { name: 'Quim', voice: { pitch: 1.35, speed: 1.1, timbre: 'doce' } },
  pinceso: { name: 'Pinceso', voice: { pitch: 1.9, speed: 1.35, timbre: 'piado' } },
  narrador: { name: '', voice: { pitch: 1, speed: 0.9, timbre: 'suave' } },
};

// ---------------------------------------------------------------------------------------------
// Moradores. Posições conferidas: dentro da região, fora d'água, fora das construções.
export const NPCS = [
  // ============================== CAMPO DAS PÉTALAS ==============================
  { id: 'vo_cocada', name: 'Vó Cocada', region: 'campo', x: 6, z: 217, rotY: Math.PI, species: 'humano',
    look: { body: '#f2c9a8', hair: '#f7f3ff', hairStyle: 'coque', outfit: '#c49bff', accessory: 'avental_florido', size: 1.15 },
    voice: { pitch: 0.95, speed: 0.85, timbre: 'doce' }, wander: 2, nightPos: { x: 3, z: 224 },
    idleLines: [
      'Já lanchou, Quim? Aventura de barriga vazia não rende!',
      'No meu tempo o sol acordava cantando. Eu acordava cantando junto. Os vizinhos, nem tanto.',
      'Esse seu cabelo tem mais cacho que pé de uva. Puxou a mim!',
      'Vai, vai explorar! Eu fico aqui de olho. Todo mundo aqui fica de olho, né? Literalmente.',
    ] },
  { id: 'seu_girassolino', name: 'Seu Girassolino', region: 'campo', x: 34, z: 184, rotY: 0, species: 'toupeira',
    look: { body: '#8a6a5c', outfit: '#7cc16b', accessory: 'chapeu_palha', size: 0.9 },
    voice: { pitch: 0.75, speed: 0.85, timbre: 'grave' }, wander: 4, nightPos: { x: 38, z: 177 },
    idleLines: [
      'Planta não gosta de pressa. Nem eu. Nem minha avó. Família de toupeira é assim.',
      'Se uma flor piscar pra você, pisca de volta. É educação floral.',
      'Eu cavo tão bem que às vezes chego do outro lado do Campo sem querer.',
      'A Florzona boceja desde que eu era pequenininho. E olha que eu ainda sou pequenininho!',
    ] },
  { id: 'seu_palhinha', name: 'Seu Palhinha', region: 'campo', x: -38, z: 198, rotY: 0, species: 'espantalho',
    look: { body: '#f3d27a', outfit: '#9b8bb4', accessory: 'chapeu_palha_furado', size: 1.3 },
    voice: { pitch: 0.85, speed: 0.9, timbre: 'rouco' }, wander: 0,
    idleLines: [
      'Eu fico parado aqui o dia todo. Não é preguiça, é profissionalismo.',
      'Se você vir um passarinho, diz que eu mandei um oi. Bem baixinho, pra não assustar.',
      'Meu chapéu é de palha, meu recheio é de palha, mas meu carinho é de verdade.',
      'Os passarinhos daqui são uns amores. Pena que eles acham que eu sou um monstro de palha.',
    ] },
  { id: 'sapinho_coaxe', name: 'Sapinho Coaxé', region: 'campo', x: -14, z: 147, rotY: 0, species: 'sapo',
    look: { body: '#7ed36b', outfit: '#ff6f61', accessory: 'boia', size: 0.6 },
    voice: { pitch: 1.25, speed: 1.2, timbre: 'nasal' }, wander: 3,
    idleLines: [
      'Croac! Foi mal. Soluço de sapo.',
      'Sou salva-vidas há doze anos e nunca entrei na água. Recorde invicto!',
      'O Lago Espelhinho imita tudo. Faz uma careta pra ele. Viu? Ele fez também!',
      'Dizem que na ilhota tem jujuba escondida. Eu vi de longe. Bem de longe.',
    ] },
  { id: 'joaninha_pontinha', name: 'Joaninha Pontinha', region: 'campo', x: -10, z: 158, rotY: 0, species: 'joaninha',
    look: { body: '#ff4f5e', outfit: '#2b2140', accessory: 'petala_na_cabeca', size: 0.5 },
    voice: { pitch: 1.6, speed: 1.3, timbre: 'fofo' }, wander: 6,
    idleLines: [
      'Eu tenho sete pintinhas. Ontem eram oito. Você viu uma pintinha perdida por aí?',
      'Eu voo baixinho pra não acordar as nuvens.',
      'Caiu uma pétala na minha cabeça. Agora eu sou uma joaninha de chapéu.',
      'Você tem olhos tão grandes! Dá pra ver o reino todo com eles?',
    ] },

  // ============================== VILA PISCADELA ==============================
  { id: 'vovo_lazinha', name: 'Vovó Lãzinha', region: 'vila', x: 27, z: 4, rotY: Math.PI / 2, species: 'ovelha',
    look: { body: '#fbf6ee', outfit: '#ff9aa2', accessory: 'oculos_redondos', size: 1 },
    voice: { pitch: 0.9, speed: 0.8, timbre: 'doce' }, wander: 2,
    idleLines: [
      'Esse cachecol eu tricotei em mil novecentos e lá vai pedrada. Lã não tem idade.',
      'O Bolacha só se mexe por três coisas: comida, cochilo e caixa de papelão.',
      'Menina, seus cachos dariam um novelo maravilhoso. Brincadeira! ...Mais ou menos.',
      'Na minha idade, cada piscada é um descansinho.',
    ] },
  { id: 'seu_miolo', name: 'Seu Miolo', region: 'vila', x: 16, z: -8, rotY: -Math.PI / 2, species: 'urso',
    look: { body: '#b07d56', outfit: '#ffffff', accessory: 'chapeu_de_padeiro', size: 1.35 },
    voice: { pitch: 0.7, speed: 0.9, timbre: 'grave' }, wander: 3,
    idleLines: [
      'Pão quentinho! Quer dizer, pão mornozinho. O forno também anda com sono.',
      'O segredo do pão de pisca é amassar com carinho e piscar três vezes pra massa.',
      'Já comeu sonho? Aqui tem sonho de verdade. Recheado de cochilo.',
      'Urso padeiro come metade da fornada. É regra da profissão.',
    ] },
  { id: 'seu_repolhudo', name: 'Seu Repolhudo', region: 'vila', x: -12, z: 0, rotY: Math.PI, species: 'coelho',
    look: { body: '#d9c7b8', outfit: '#6fae5b', accessory: 'macacao_e_regata', size: 0.95 },
    voice: { pitch: 1.1, speed: 1.05, timbre: 'fofo' }, wander: 4,
    idleLines: [
      'Cenoura? Não, obrigado, eu prefiro couve. Sou um coelho moderno.',
      'A horta dos tomatinhos é a mais tímida. Fala baixinho perto deles.',
      'Plantar é fácil: semente, água, sol e paciência. O sol é que anda faltando.',
      'Minhas orelhas escutam as plantas crescendo. Agora elas tão roncando.',
    ] },
  { id: 'dona_lentina', name: 'Dona Lentina', region: 'vila', x: 14, z: -29, rotY: -Math.PI / 2, species: 'tartaruga',
    look: { body: '#9bc47a', outfit: '#5aa9e6', accessory: 'bone_de_carteira', size: 0.8 },
    voice: { pitch: 0.85, speed: 1.3, timbre: 'suave' }, wander: 1,
    idleLines: [
      'Entrego cartas há cento e dez anos. Já entreguei umas trinta!',
      'Pressa é inimiga da entrega. E amiga do tropeção.',
      'Se tiver carta pra mandar, deixa na caixa. Eu chego lá. Um dia.',
      'Eu levo a casa nas costas, então nunca me atraso pro almoço.',
    ] },
  { id: 'dona_fofura', name: 'Dona Fofura', region: 'vila', x: 14, z: 24, rotY: Math.PI, species: 'ourico',
    look: { body: '#c9a27e', outfit: '#ffdac1', accessory: 'laco_no_espinho', size: 0.6 },
    voice: { pitch: 1.4, speed: 1.15, timbre: 'fofo' }, wander: 5, nightPos: { x: 14, z: 12 },
    idleLines: [
      'Abraço? Adoraria! Mas é por sua conta e risco.',
      'Meus espinhos são macios por dentro. Que nem eu!',
      'Quando fico feliz eu viro uma bolinha. Cuidado pra não me chutar sem querer!',
      'A pracinha fica mais bonita quando você passa. Todos os olhinhos acendem.',
    ] },
  { id: 'seu_cochilo', name: 'Seu Cochilo', region: 'vila', x: -19, z: 24, rotY: -Math.PI / 2, species: 'cachorro',
    look: { body: '#e8c58f', outfit: '#c7ceea', accessory: 'touca_de_dormir', size: 0.85 },
    voice: { pitch: 0.8, speed: 0.7, timbre: 'arrastado' }, wander: 0,
    idleLines: [
      'Zzz... hã? Tô acordado! Tô vigiando. De olhos fechados. É uma técnica.',
      'Zzz... ossinho... zzz...',
      'Esse banco é o melhor da Vila. Sombra, rio e um travesseiro de grama.',
      'Me chamam de Cochilo, mas meu nome é Cochilo Segundo. Meu pai era o Primeiro.',
    ] },

  // ============================== NINHAL CANTANTE ==============================
  { id: 'dona_pluminia', name: 'Dona Plumínia', region: 'ninhal', x: -160, z: -4, rotY: -Math.PI / 2, species: 'coruja',
    look: { body: '#a08cc2', outfit: '#6c5a8e', accessory: 'xale_e_oculos', size: 1.1 },
    voice: { pitch: 0.8, speed: 0.75, timbre: 'suave' }, wander: 1, nightPos: { x: -219, z: 2 },
    idleLines: [
      'Hu-hu. Coruja velha não sabe tudo, mas sabe onde procurar.',
      'Dizem que, escondida no Ninhal, existe uma casinha onde a luz é sempre dourada. Quem chega lá nunca sai triste.',
      'Os passarinhos daqui cantam desafinado de saudade. Mas cantam. É isso que importa.',
      'Lá do Ninho-Coreto, num dia claro, dá pra ver até o fim do mundo. E o fim do mundo é bem bonitinho.',
      'Cuidado com as folhas que balançam. Elas não fazem por mal, só têm cócegas.',
    ] },
  { id: 'piu', name: 'Piu', region: 'ninhal', x: -108, z: 14, rotY: Math.PI, species: 'pombo',
    look: { body: '#b9bfd6', outfit: '#5aa9e6', accessory: 'bolsa_de_carteiro', size: 0.7 },
    voice: { pitch: 1.0, speed: 1.2, timbre: 'rouco' }, wander: 3,
    idleLines: [
      'Pruu? Pru-pru-pruuu!',
      'Pru! Pruuu-pru-pru. Pru?',
      'Pru-pru! (Ele estufa o peito, muito orgulhoso de alguma coisa.)',
      'Pruuuuu... (Ele tropeçou no próprio pé.)',
    ] },
  { id: 'tico', name: 'Tico', region: 'ninhal', x: -113, z: -43, rotY: 0, species: 'passaro',
    look: { body: '#c8955f', outfit: '#ffd23f', accessory: 'topete', size: 0.35 },
    voice: { pitch: 1.8, speed: 1.4, timbre: 'piado' }, wander: 3,
    idleLines: [
      'Hmm? Hmm? Hmm!',
      'Eu sou o Tico! O mais velho! Por dois minutos!',
      'Quando eu crescer quero ter cachinhos que nem você.',
      'Uii! Uii! Uiiii! Tô treinando.',
    ] },
  { id: 'teco', name: 'Teco', region: 'ninhal', x: -110, z: -46, rotY: 0, species: 'passaro',
    look: { body: '#d4a06a', outfit: '#ff7aa8', accessory: 'lacinho', size: 0.33 },
    voice: { pitch: 1.9, speed: 1.45, timbre: 'piado' }, wander: 3,
    idleLines: [
      'Uii! Faz de novo! Faz "uii" de novo!',
      'Eu sou o Teco! O do meio! O mais bonito!',
      'Hihi! Hihi! Olha, eu rio que nem você!',
      'O Tuco disse que periquito é sabiá pintado de verde. É verdade?',
    ] },
  { id: 'tuco', name: 'Tuco', region: 'ninhal', x: -112, z: -40, rotY: 0, species: 'passaro',
    look: { body: '#b8875a', outfit: '#6ec6ff', accessory: 'pena_espetada', size: 0.3 },
    voice: { pitch: 2.0, speed: 1.5, timbre: 'piado' }, wander: 3,
    idleLines: [
      'Eu sou o Tuco! O caçula! Eu sei voar! Quase!',
      'Hmm-hmm! Hmm-hmm! Viu? Falo igualzinho você!',
      'Você é famosa? Parece famosa. Todo mundo olha pra você.',
      'Zzz... eu não tô com sono... zzz...',
    ] },
  { id: 'mamae_sabia', name: 'Mamãe Sabiá', region: 'ninhal', x: -190, z: 30, rotY: Math.PI / 2, species: 'passaro',
    look: { body: '#a7764a', outfit: '#ff9f5a', accessory: 'avental_de_ninho', size: 0.55 },
    voice: { pitch: 1.5, speed: 1.1, timbre: 'piado' }, wander: 2,
    idleLines: [
      'Piu-piriu! (Ela ajeita o ninho pela décima vez.)',
      'Piriu-piu? Piu! (Ela parece te achar muito educada.)',
      'Piu-piu-piriu... (Ela cantarola uma canção de ninar.)',
    ] },
  { id: 'madame_plumagem', name: 'Madame Plumagem', region: 'ninhal', x: -226, z: -44, rotY: Math.PI, species: 'pavao',
    look: { body: '#3f8fd9', outfit: '#2fbf9b', accessory: 'colar_de_perolas', size: 1 },
    voice: { pitch: 1.15, speed: 0.95, timbre: 'nasal' }, wander: 3,
    idleLines: [
      'Querida, elegância é piscar devagar. Assim, ó. Muito bem!',
      'Uma pavoa sem cauda é como bolo sem cobertura. Comível, mas triste.',
      'Seus cachos têm volume, movimento e personalidade. Nota dez!',
      'Eu não caminho. Eu desfilo.',
    ] },
  { id: 'seu_barreto', name: 'Seu Barreto', region: 'ninhal', x: -243, z: -11, rotY: -Math.PI / 2, species: 'passaro',
    look: { body: '#c98a4b', outfit: '#8a5a3c', accessory: 'capacete_de_obra', size: 0.5 },
    voice: { pitch: 1.2, speed: 1.1, timbre: 'grave' }, wander: 2,
    idleLines: [
      'Ninho bom tem porta virada pro nascente. Regra número um do joão-de-barro.',
      'Já construí trinta e dois ninhos. A Barrinha diz que foram trinta e um e meio.',
      'Barro, graveto e capricho. Esse é o segredo.',
    ] },
  { id: 'dona_barrinha', name: 'Dona Barrinha', region: 'ninhal', x: -245, z: -7, rotY: -Math.PI / 2, species: 'passaro',
    look: { body: '#d79a5e', outfit: '#ffb5c5', accessory: 'lenco_na_cabeca', size: 0.48 },
    voice: { pitch: 1.4, speed: 1.15, timbre: 'doce' }, wander: 2,
    idleLines: [
      'O Barreto fala muito e constrói devagar. Mas constrói bonito, isso eu admito.',
      'Toda casa precisa de flores na porta. E de um marido que limpe os pés.',
      'Quando o ninho ficar pronto, você vai ser nossa primeira visita!',
    ] },
  { id: 'seu_tostado', name: 'Seu Tostado', region: 'ninhal', x: -139, z: 36, rotY: Math.PI, species: 'tucano',
    look: { body: '#232033', outfit: '#ffffff', accessory: 'gravata_borboleta', size: 0.8 },
    voice: { pitch: 0.95, speed: 1, timbre: 'suave' }, wander: 2,
    idleLines: [
      'Um cafezinho? Hoje não tem, mas eu posso descrever um com muita emoção.',
      'Meu bico é grande pra sentir todos os aromas. É o que eu digo pras pessoas.',
      'Café de passarinho se toma em xicrinha de bolota. Com a peninha levantada.',
      'Torra média, espuma alta e um bom-dia caprichado. Essa é a receita.',
    ] },

  // ============================== BOSQUE AÇUCARADO ==============================
  { id: 'dona_glace', name: 'Dona Glacê', region: 'bosque', x: 154, z: 70, rotY: 0, species: 'hipopotamo',
    look: { body: '#c9a7e8', outfit: '#ffd6ec', accessory: 'touca_de_confeiteira', size: 1.4 },
    voice: { pitch: 0.85, speed: 1, timbre: 'doce' }, wander: 3,
    idleLines: [
      'Prova esse brigadeiro! Não é brigadeiro, é uma pedra. Mas é uma pedra muito doce.',
      'Na minha cabana até as paredes são de biscoito. Por favor, não mordam as paredes.',
      'Todo doce precisa de três coisas: açúcar, paciência e alguém pra dividir.',
      'Sou a confeiteira mais pesada do reino e a mais leve no glacê!',
    ] },
  { id: 'dona_migalha', name: 'Dona Migalha', region: 'bosque', x: 116, z: 82, rotY: Math.PI / 2, species: 'formiga',
    look: { body: '#c0392b', outfit: '#fff3b8', accessory: 'apito_e_bandeirinha', size: 0.45 },
    voice: { pitch: 1.5, speed: 1.4, timbre: 'fofo' }, wander: 2,
    idleLines: [
      'Esquerda, direita, esquerda! Ah, oi! Não pisa na fila, por favor.',
      'A gente carrega vinte vezes o próprio peso. Mas só se for doce.',
      'Tenho dois mil e trezentos netinhos. Sei o nome de todos. Mais ou menos.',
      'Uma migalha de bolo dá janta pra uma semana. A vida é boa no Bosque.',
    ] },
  { id: 'pipoca', name: 'Pipoca', region: 'bosque', x: 203, z: 26, rotY: Math.PI, species: 'coelho',
    look: { body: '#ffffff', outfit: '#ff6fa8', accessory: 'balde_de_brinquedo', size: 0.55 },
    voice: { pitch: 1.7, speed: 1.4, timbre: 'fofo' }, wander: 4,
    idleLines: [
      'Pula! Pula! Pula! Você também gosta de pular?',
      'Minhas orelhas são maiores que eu. Quando venta, eu viro pipa.',
      'Tô colecionando jujubas. Já tenho uma. Comi a outra.',
      'Quando eu crescer quero ser nuvem.',
    ] },
  { id: 'seu_caramelo', name: 'Seu Caramelo', region: 'bosque', x: 198, z: 99, rotY: 1.6, species: 'capivara',
    look: { body: '#a8794f', outfit: '#8ef0c0', accessory: 'laranja_na_cabeca', size: 1.1 },
    voice: { pitch: 0.7, speed: 0.6, timbre: 'arrastado' }, wander: 0,
    idleLines: [
      'Calma. Respira. A calda não vai a lugar nenhum. Eu também não.',
      'Já tentou ficar parado olhando o laguinho? Recomendo muito. Faço isso desde terça.',
      'Os patinhos sentam em mim, as formigas sentam em mim. Sou um banco muito querido.',
      'Pressa? Não conheço. Parece cansativo.',
    ] },

  // ============================== CIDADE CÍLIOS ==============================
  { id: 'dona_nata', name: 'Dona Nata', region: 'cidade', x: 23, z: -154, rotY: -1.6, species: 'gato',
    look: { body: '#f4e4d4', outfit: '#ffd6e8', accessory: 'avental_de_barista', size: 0.9 },
    voice: { pitch: 1.2, speed: 0.95, timbre: 'suave' }, wander: 2,
    idleLines: [
      'Café com leite, leite com café... a vida é uma questão de proporção.',
      'Aqui a espuma tem olhinhos. Pode beber sem dó, ela adora.',
      'Senta um pouquinho! Aventura também precisa de pausa.',
      'Meu ronronar combina com a máquina de café. Somos uma dupla.',
    ] },
  { id: 'madame_fivela', name: 'Madame Fivela', region: 'cidade', x: -23, z: -154, rotY: 1.6, species: 'cachorro',
    look: { body: '#f7d6e6', hairStyle: 'poodle', outfit: '#c9b6ff', accessory: 'laco_gigante', size: 0.95 },
    voice: { pitch: 1.3, speed: 1.05, timbre: 'nasal' }, wander: 2,
    idleLines: [
      'Cachos são a coisa mais elegante do universo. Eu sei do que falo.',
      'Um laço muda tudo. Experimente e me diga se não sorriu pro espelho.',
      'Moda é se sentir você mesma. Com um pouquinho mais de brilho.',
      'O pompom do meu rabo nasceu assim. Mas é muito bem penteado.',
    ] },
  { id: 'seu_ponteiro', name: 'Seu Ponteiro', region: 'cidade', x: -7, z: -181, rotY: 0, species: 'rato',
    look: { body: '#b8b2c8', outfit: '#6c8cff', accessory: 'lupa_de_relojoeiro', size: 0.5 },
    voice: { pitch: 1.6, speed: 1.3, timbre: 'nasal' }, wander: 2,
    idleLines: [
      'Tic-tac, tic-tac. Desculpa, é mania.',
      'Relógio pontual é como amigo pontual: raro e precioso.',
      'Já consertei relógio de bolso, de parede e até relógio de pulso de formiga.',
      'Se você se atrasar, diga que foi o relógio. Ele não liga. Eu ligo um pouquinho.',
    ] },
  { id: 'prefeita_girafina', name: 'Prefeita Girafina', region: 'cidade', x: 8, z: -176, rotY: Math.PI, species: 'girafa',
    look: { body: '#ffd27a', outfit: '#a3c4f3', accessory: 'faixa_de_prefeita_e_cilios_enormes', size: 2.4 },
    voice: { pitch: 1.05, speed: 0.95, timbre: 'doce' }, wander: 3,
    idleLines: [
      'Bom dia, cidadã! Dá pra me ver de qualquer lugar da cidade. Ótimo pra discurso.',
      'Meus cílios têm dois palmos. São o orgulho da Cidade Cílios.',
      'Lá de cima eu vejo tudo. Inclusive quem joga papel no chão. Hmm!',
      'Agenda de hoje: piscar, acenar e inaugurar um banco. Política é isso.',
    ] },
  { id: 'dona_soneca', name: 'Dona Soneca', region: 'cidade', x: -9, z: -147, rotY: Math.PI, species: 'preguica',
    look: { body: '#a99886', outfit: '#d3b8ff', accessory: 'binoculo_de_nuvem', size: 0.9 },
    voice: { pitch: 0.75, speed: 0.5, timbre: 'arrastado' }, wander: 0,
    idleLines: [
      'Oi... tudo... bem...?',
      'Eu... tava... indo... pra... cafeteria. Desde... semana... passada.',
      'As... nuvens... são... minhas... amigas. Elas... também... vão... devagar.',
      'Zzz...',
    ] },
  { id: 'seu_beija', name: 'Seu Beija', region: 'cidade', x: -34, z: -186, rotY: 0.5, species: 'beija_flor',
    look: { body: '#2fbf9b', outfit: '#fb6f92', accessory: 'cestinha_de_flores', size: 0.35 },
    voice: { pitch: 1.9, speed: 1.7, timbre: 'piado' }, wander: 4,
    idleLines: [
      'Flor fresquinha! Fresquíssima! Voo tão rápido que nem sei se vendi alguma!',
      'Eu bato as asas oitenta vezes por segundo. Contei. Demorou.',
      'Rosa pra quem ama, girassol pra quem sorri, margarida pra quem pisca!',
      'Cheira essa! Cheirou? Agora pisca. Viu? Ela piscou de volta!',
    ] },

  // ============================== PICO PESTANA (só depois da Alvorada) ==============================
  { id: 'vovo_pincelao', name: 'Vovô Pincelão', region: 'pico', x: 175, z: -215, rotY: 1.8, species: 'periquito',
    look: { body: '#b8f27c', outfit: '#ffd23f', accessory: 'sobrancelhas_brancas_e_bengala', size: 0.45 },
    voice: { pitch: 1.4, speed: 0.9, timbre: 'piado' }, wander: 1, showAfterFlag: 'pico_liberado',
    idleLines: [
      'Piuí! Ainda tenho fôlego pra cantar a Alvorada por mais cem anos.',
      'Liderar um bando é fácil: você voa na frente e torce pra ninguém ir pro outro lado.',
      'Esse meu neto é danado. Corajoso, convencido e leal. Igualzinho ao avô.',
      'Daqui do Pico eu vejo o Ninhal. Saudade do meu galho de lá.',
    ] },
  { id: 'mamae_pincela', name: 'Mamãe Pincela', region: 'pico', x: 177, z: -212, rotY: 2.2, species: 'periquito',
    look: { body: '#c6f56a', outfit: '#ff9fc2', accessory: 'bochechas_rosadas', size: 0.38 },
    voice: { pitch: 1.75, speed: 1.05, timbre: 'piado' }, wander: 1, showAfterFlag: 'pico_liberado',
    idleLines: [
      'Meu filhote, num cabelo cacheado. Quem diria! Ele sempre gostou de lugar fofinho.',
      'Cuida bem dele, tá? Ele é pequeno, mas tem um coração do tamanho do Pico.',
      'Quando ele ainda era ovo, já piava dormindo.',
      'Todo amanhecer a gente canta pra vocês. Escuta da sua janela!',
    ] },
];

// ---------------------------------------------------------------------------------------------
// Pontos de itens criados para o roteiro (os demais vêm de SPOTS).
const FLORES_ENFEITALHO = [item('flor_palhinha_1', -34, 186), item('flor_palhinha_2', 12, 176),
  item('flor_palhinha_3', -48, 160), item('flor_palhinha_4', 48, 140)];
const CARTAS_LENTINA = [item('carta_lentina_1', 12, -36), item('carta_lentina_2', 18, -41), item('carta_lentina_3', 8, -30)];
const FLORES_FESTA = [item('flor_festa_1', 44, 32), item('flor_festa_2', -8, 56), item('flor_festa_3', 60, 30), item('flor_festa_4', 12, 50)];
const CARTAS_PIU = [item('carta_piu_1', -116, 26), item('carta_piu_2', -104, 24), item('carta_piu_3', -120, 14),
  item('carta_piu_4', -100, 18), item('carta_piu_5', -110, 30)];
// Jujubas Douradas: ao pé de seis árvores de algodão-doce, do lado sudoeste.
const JUJUBAS_DOURADAS = ['algodao_1', 'algodao_3', 'algodao_5', 'algodao_6', 'algodao_7', 'algodao_9']
  .map((id, i) => aoLado('jujuba_dourada_' + (i + 1), id, 135, 9));
const CONVITES = [item('convite_1', 114, 88), item('convite_2', 121, 90), item('convite_3', 109, 79)];
const OVOS = itens(SPOTS.ovos);
const PIQUENIQUE = { x: 196, z: 94 };

// ---------------------------------------------------------------------------------------------
// Missões, na ordem da jornada. main:true = linha principal (Campo → Vila → Ninhal → Bosque/Cidade → Ninhal → Pico).
export const MISSIONS = [
  // ============================== CAMPO DAS PÉTALAS ==============================
  {
    id: 'bom_dia', region: 'campo', title: 'Bom Dia, Mundo Desbotado', main: true, giver: null, autoStart: true,
    summary: 'O reino acordou cinzinha. A Vó Cocada mandou a Quim procurar o Seu Girassolino, o jardineiro.',
    requires: {},
    rewards: { jujubas: 5, color: 0.1 },
    steps: [
      { type: 'goto', ...xz(lm('florzona')), radius: 12, label: 'Florzona Bocejante',
        hint: 'Siga a Estrada das Pétalas até a Florzona', marker: xz(lm('florzona')),
        lines: [
          N('A Florzona Bocejante abre a boca... e solta um bocejo cinzento. Até as pétalas dela estão sem cor.'),
          Q('Hmm?', 'curiosa'),
          Q('Oh...', 'triste'),
        ] },
      { type: 'talk', npc: 'seu_girassolino', hint: 'Fale com o Seu Girassolino, perto do jardim',
        lines: [
          L('seu_girassolino', 'Ora, ora! A menina dos cachos! Cuidado onde pisa, que eu tô cavando um... ai, cavei pro lado errado de novo.'),
          L('seu_girassolino', 'Você reparou, né? O Sol-Olho anda acordando tarde e com preguiça. E bocejo, minha filha, é contagioso.'),
          L('seu_girassolino', 'O sol boceja, as nuvens bocejam, as flores bocejam... e quem boceja demais vai perdendo a cor.'),
          Q('Hmm...', 'triste'),
          L('seu_girassolino', 'Mas eu sei um segredo de jardineiro: flor feliz pinta as vizinhas. Se a gente salvar as florzinhas murchas, o Campo lembra das cores!'),
          Q('Uii!'),
        ] },
    ],
    completeLines: [L('seu_girassolino', 'Então mãos à obra! Quer dizer... cachos à obra!')],
  },
  {
    id: 'flores_murchas', region: 'campo', title: 'Flores Murchas', main: true, giver: 'seu_girassolino', autoStart: true,
    summary: 'Encontre as florzinhas murchas espalhadas pelo Campo e leve para o Seu Girassolino replantar.',
    requires: { missions: ['bom_dia'] },
    rewards: { jujubas: 8, color: 0.5 },
    steps: [
      { type: 'collect', item: 'flor_murcha', spots: itens(SPOTS.flores_murchas), count: 6,
        hint: 'Encontre 6 florzinhas murchas pelo Campo',
        lines: [N('As florzinhas murchas cabem certinho nos braços da Quim. Elas dão uma piscadinha de alívio.'), Q('Hmm-hmm!')] },
      { type: 'deliver', npc: 'seu_girassolino', item: 'flor_murcha', hint: 'Leve as flores para o Seu Girassolino',
        lines: [L('seu_girassolino', 'Que beleza! Agora um tiquinho de terra fofa, um tiquinho de água e um cafuné em cada uma...')] },
      { type: 'cutscene', camera: { x: 14, y: 6, z: 206, lookX: 26, lookY: 1, lookZ: 192 },
        lines: [
          N('O jardineiro replanta as flores uma a uma. A Quim faz cafuné em cada pétala.'),
          N('Uma flor pisca. Depois outra. E então... PLIM! Uma onda de cor se espalha pelo Campo das Pétalas!'),
          Q('UII!', 'surpresa'),
          L('seu_girassolino', 'Funcionou! Gentileza deixa os olhos brilhando, e brilho de olho é a tinta mais forte que existe.'),
        ] },
    ],
    completeLines: [
      L('seu_girassolino', 'Escuta: lá na Vila Piscadela, a Vovó Lãzinha anda aflita. Segue a estrada pro norte.'),
      L('seu_girassolino', 'E leva esse sorriso junto, que ele tá fazendo efeito!'),
    ],
  },
  {
    id: 'enfeitalho', region: 'campo', title: 'O Espantalho que Queria Amigos', main: false, giver: 'seu_palhinha',
    summary: 'O Seu Palhinha passou a vida espantando passarinhos. O problema é que ele adora passarinhos.',
    requires: { missions: ['filhote_sem_ninho'] },
    rewards: { jujubas: 5, accessory: 'coroa_flores', color: 0.2 },
    steps: [
      { type: 'talk', npc: 'seu_palhinha', hint: 'Fale com o Seu Palhinha, o espantalho',
        lines: [
          L('seu_palhinha', 'Psiu! Menina! E... um periquito? Não se assusta, não! Por favor, não se assusta!'),
          P('Eu? Assustado? Eu sou o guarda-costas. Eu é que assusto.'),
          L('seu_palhinha', 'Meu trabalho é espantar passarinho, mas eu queria tanto um amigo de pena... Só que eu sou muito cinzento. Muito sério.'),
          L('seu_palhinha', 'Se eu ficasse todo florido, aí eu não ia ser espantalho. Ia ser um ENFEITALHO! Passarinho adora flor!'),
        ] },
      { type: 'collect', item: 'flor', spots: FLORES_ENFEITALHO, count: 4, hint: 'Colha 4 flores coloridas pelo Campo',
        lines: [P('Essa amarela combina com o chapéu dele. Eu tenho muito bom gosto.')] },
      { type: 'deliver', npc: 'seu_palhinha', item: 'flor', hint: 'Leve as flores para o Seu Palhinha',
        lines: [L('seu_palhinha', 'Uma no chapéu... uma no bolso... uma em cada braço de palha!')] },
      { type: 'cutscene', camera: { x: -33, y: 3, z: 205, lookX: -38, lookY: 2, lookZ: 198 },
        lines: [
          N('Florido dos pés à cabeça, o Seu Palhinha abre um sorrisão de palha.'),
          P('Tá bom, eu vou primeiro. Só porque eu sou corajoso.'),
          N('O Pinceso pousa no chapéu do espantalho. Logo chegam um sabiá, duas cambaxirras e uma borboleta muito curiosa.'),
          L('seu_palhinha', 'Amigos! Eu tenho AMIGOS! Agora eu sou um Enfeitalho oficial!'),
        ] },
    ],
    completeLines: [L('seu_palhinha', 'Sobrou um montão de flor. Fiz uma coroa pra você. Fica linda nos cachos!'), Q('Uii!')],
  },
  {
    id: 'lago_sorriso', region: 'campo', title: 'O Lago que Esqueceu de Sorrir', main: false, giver: 'sapinho_coaxe',
    summary: 'O Lago Espelhinho imita tudo o que vê. Mas anda tão sonolento que esqueceu como se sorri.',
    requires: { missions: ['flores_murchas'] },
    rewards: { jujubas: 8, color: 0.2 },
    steps: [
      { type: 'talk', npc: 'sapinho_coaxe', hint: 'Fale com o Sapinho Coaxé, na beira do lago',
        lines: [
          L('sapinho_coaxe', 'Croac! Ops, desculpa. Coaxé, muito prazer. Sou o salva-vidas do lago. Ele nunca precisou ser salvo, mas eu tô pronto.'),
          L('sapinho_coaxe', 'O Lago Espelhinho imita quem olha pra ele. Só que agora ele só imita bocejo.'),
          L('sapinho_coaxe', 'Se alguém sorrir pra ele lá do meio, da ilhota, quem sabe ele lembra? Eu iria, mas... tenho medo de água.'),
          Q('Hmm?', 'curiosa'),
          L('sapinho_coaxe', 'Eu sei. Sapo. Medo de água. A vida é complicada.'),
        ] },
      { type: 'goto', ...ILHOTA, radius: 3.5, label: 'Ilhota do Lago Espelhinho',
        hint: 'Pule pelas pedrinhas até a ilhota', marker: xz(ILHOTA) },
      { type: 'interact', target: ILHOTA, label: 'Sorrir para o lago', hint: 'Sorria para o Lago Espelhinho (E)',
        lines: [
          N('A Quim se debruça na beirada da ilhota e abre o sorriso mais largo que tem.'),
          N('Na água, a Quim do reflexo boceja... pisca... e sorri de volta! Depois o céu do reflexo sorri. Depois as nuvens.'),
          Q('Hihi! Uii!'),
        ] },
      { type: 'talk', npc: 'sapinho_coaxe', hint: 'Volte para o Sapinho Coaxé',
        lines: [L('sapinho_coaxe', 'CROAC! Ele sorriu! O lago sorriu! Vou pular de alegria! Mas só na grama.')] },
    ],
  },

  // ============================== VILA PISCADELA ==============================
  {
    id: 'gato_no_telhado', region: 'vila', title: 'O Gato no Telhado', main: true, giver: 'vovo_lazinha', autoStart: true,
    summary: 'O gato Bolacha, da Vovó Lãzinha, sumiu correndo atrás de uma pena verde que caiu do céu.',
    requires: { missions: ['flores_murchas'] },
    rewards: { jujubas: 8, color: 0.45 },
    steps: [
      { type: 'talk', npc: 'vovo_lazinha', hint: 'Vá até a Vila Piscadela e fale com a Vovó Lãzinha',
        lines: [
          L('vovo_lazinha', 'Ai, ai, ai, meu novelinho de nervos! Menina, você viu o Bolacha? Meu gato! Laranja, redondo, cara de quem comeu o pão do vizinho.'),
          L('vovo_lazinha', 'Hoje cedo caiu uma pena verde do céu, e ele saiu correndo atrás dela. Ele nunca corre! Ele mal anda!'),
          Q('Hmm?', 'curiosa'),
          L('vovo_lazinha', 'Se você seguir as peninhas, acha ele. Eu ia junto, mas meus joelhos são de lã.'),
        ] },
      { type: 'follow_trail', spots: SPOTS.gato_pistas.map(xz), item: 'pena_verde', hint: 'Siga as peninhas verdes',
        lines: [N('As peninhas levam até a Casa do Telhado Alto. Lá em cima, um rabo laranja balança.'), Q('Uii...', 'surpresa')] },
      { type: 'goto', ...TERRACO_GATO, radius: 4, label: 'Terraço da Casa do Telhado Alto',
        hint: 'Suba pelos caixotes até o telhado', marker: xz(TERRACO_GATO),
        lines: [N('O Bolacha está sentado na beiradinha, olhando para o oeste, com a pena verde presa no bigode.')] },
      { type: 'cutscene', camera: { x: 52, y: 13, z: -2, lookX: -180, lookY: 25, lookZ: -10 },
        lines: [
          N('Lá longe, depois do rio, as árvores gigantes do Ninhal Cantante. Uma pena verde dança no vento... indo pra lá.'),
          Q('Hmm...', 'curiosa'),
          N('O Bolacha boceja, satisfeito. Pelo jeito, ele só queria uma vista bonita.'),
        ] },
      { type: 'collect', item: 'gato', spots: [item('gato_bolacha', SPOTS.gato_telhado.x, SPOTS.gato_telhado.z, SPOTS.gato_telhado.y)],
        count: 1, label: 'Bolacha', hint: 'Pegue o Bolacha no colo' },
      { type: 'deliver', npc: 'vovo_lazinha', item: 'gato', hint: 'Leve o Bolacha de volta para a Vovó Lãzinha',
        lines: [
          L('vovo_lazinha', 'BOLACHA! Seu bolinho de pelo ingrato! Vem cá que a vovó vai te apertar!'),
          N('O Bolacha ronrona tão alto que a casa inteira pisca.'),
        ] },
    ],
    completeLines: [
      L('vovo_lazinha', 'Obrigada, florzinha. E essa pena verde... é pena de periquito! Do bando que cantava de manhã. Faz dias que ninguém ouve eles.'),
      L('vovo_lazinha', 'Quem sabe tudo de passarinho é a Dona Plumínia, no Ninhal Cantante. Segue a Trilha dos Piados pro oeste e atravessa a ponte.'),
      Q('Uii!'),
    ],
  },
  {
    id: 'hortas_com_sede', region: 'vila', title: 'Hortas com Sede', main: false, giver: 'seu_repolhudo',
    summary: 'As três hortas da Vila estão tão sonolentas que esqueceram de beber água.',
    requires: { missions: ['flores_murchas'] },
    rewards: { jujubas: 8, color: 0.2 },
    steps: [
      { type: 'talk', npc: 'seu_repolhudo', hint: 'Fale com o Seu Repolhudo',
        lines: [
          L('seu_repolhudo', 'Boa tarde, boa tarde! Ou bom dia? Com esse sol preguiçoso eu nem sei mais.'),
          L('seu_repolhudo', 'Minhas três hortas tão murchinhas. A couve piscante nem pisca. As cenouras curiosas perderam a curiosidade!'),
          L('seu_repolhudo', 'Pega meu regador, ali perto da pracinha, e dá uma regadinha caprichada em cada uma?'),
        ] },
      { type: 'collect', item: 'regador', spots: [item(SPOTS.regador.id, SPOTS.regador.x, SPOTS.regador.z)], count: 1,
        hint: 'Pegue o regador perto da pracinha', marker: xz(SPOTS.regador) },
      { type: 'minigame', kind: 'regar', params: { horta: SPOTS.hortas[0] },
        hint: 'Regue a Horta da Couve Piscante', marker: xz(lm(SPOTS.hortas[0])),
        lines: [N('A couve bebe, arrota uma bolhinha e pisca. Pisca de novo. Ela lembrou como se pisca!')] },
      { type: 'minigame', kind: 'regar', params: { horta: SPOTS.hortas[1] },
        hint: 'Regue a Horta das Cenouras Curiosas', marker: xz(lm(SPOTS.hortas[1])),
        lines: [N('As cenouras esticam as folhinhas e espiam a Quim. Curiosíssimas!')] },
      { type: 'minigame', kind: 'regar', params: { horta: SPOTS.hortas[2] },
        hint: 'Regue a Horta dos Tomatinhos Tímidos', marker: xz(lm(SPOTS.hortas[2])),
        lines: [N('Os tomatinhos ficam vermelhinhos. De saúde ou de vergonha, ninguém sabe.')] },
      { type: 'talk', npc: 'seu_repolhudo', hint: 'Volte para o Seu Repolhudo',
        lines: [
          L('seu_repolhudo', 'Olha só! A couve piscou, as cenouras tão curiosas e os tomatinhos... continuam tímidos, mas agora tão corados!'),
          Q('Uii!'),
        ] },
    ],
  },
  {
    id: 'cartas_bom_dia', region: 'vila', title: 'Cartas de Bom-Dia', main: false, giver: 'dona_lentina',
    summary: 'A Dona Lentina, a carteira mais devagar da Vila, tropeçou num bocejo e espalhou as cartas.',
    requires: { missions: ['flores_murchas'] },
    rewards: { jujubas: 8, color: 0.2 },
    steps: [
      { type: 'talk', npc: 'dona_lentina', hint: 'Fale com a Dona Lentina, no correio',
        lines: [
          L('dona_lentina', 'Bom... dia... menina. Eu... sou... a... carteira.'),
          L('dona_lentina', 'Brincadeirinha, eu falo rápido. Eu só ANDO devagar. Tartaruga, sabe como é.'),
          L('dona_lentina', 'Tropecei num bocejo e espalhei as cartas de bom-dia. Se eu for entregar, elas chegam ano que vem.'),
          L('dona_lentina', 'Junta as três cartinhas e entrega pro Seu Miolo, pra Dona Fofura e pro Seu Cochilo?'),
        ] },
      { type: 'collect', item: 'carta', spots: CARTAS_LENTINA, count: 3, hint: 'Junte as 3 cartinhas perto do correio' },
      { type: 'deliver', npc: 'seu_miolo', item: 'carta', count: 1, hint: 'Entregue uma carta ao Seu Miolo, na padaria',
        lines: [L('seu_miolo', 'Carta pra mim? "Bom dia, Miolo, seu pão é o mais fofinho." Ai, que vergonha. Que alegria! Que vergonha!')] },
      { type: 'deliver', npc: 'dona_fofura', item: 'carta', count: 1, hint: 'Entregue uma carta à Dona Fofura, na pracinha',
        lines: [L('dona_fofura', 'Pra mim? Que fofura! Eu te daria um abraço, mas sou um ouriço. Toma um abraço imaginário. Pronto.')] },
      { type: 'deliver', npc: 'seu_cochilo', item: 'carta', count: 1, hint: 'Entregue uma carta ao Seu Cochilo, no banco da beira-rio',
        lines: [L('seu_cochilo', 'Zzz... hã? Carta? "Acorda, Cochilo." ...Ué. Acordei. Que carta poderosa!')] },
      { type: 'talk', npc: 'dona_lentina', hint: 'Volte para a Dona Lentina',
        lines: [L('dona_lentina', 'Todas entregues? Num dia só?! Você é um raio! Um raio de cachinhos!')] },
    ],
  },
  {
    id: 'festa_surpresa', region: 'vila', title: 'Festa Surpresa no Coreto', main: false, giver: 'seu_miolo',
    summary: 'O Seu Miolo quer fazer uma festa surpresa à noite para a Vovó Lãzinha, que nunca ganhou uma.',
    requires: { missions: ['gato_no_telhado'] },
    rewards: { jujubas: 10, color: 0.15 },
    steps: [
      { type: 'talk', npc: 'seu_miolo', hint: 'Fale com o Seu Miolo, na padaria',
        lines: [
          L('seu_miolo', 'Psiu! Fala baixo! A Vovó Lãzinha faz aniversário hoje e nunca, NUNCA ganhou uma festa surpresa.'),
          L('seu_miolo', 'O bolo eu já fiz: fubá com cobertura de nuvem. Mas falta enfeite! Me traz umas flores bonitas?'),
          L('seu_miolo', 'E a festa tem que ser à noite, no coreto, com todas as janelinhas acesas. Combinado?'),
          Q('Hmm-hmm!'),
        ] },
      { type: 'collect', item: 'flor', spots: FLORES_FESTA, count: 4, hint: 'Colha 4 flores pela Vila' },
      { type: 'deliver', npc: 'seu_miolo', item: 'flor', hint: 'Leve as flores para o Seu Miolo',
        lines: [L('seu_miolo', 'Lindas! Vou enfeitar o coreto inteiro. Agora é esperar a noite... e bico calado!')] },
      { type: 'night', hint: 'Espere a noite (sente num banco para o tempo passar)',
        lines: [N('A Vila apaga as luzes da rua e acende as das janelas. Todo mundo cochicha em volta do coreto.')] },
      { type: 'goto', ...xz(lm('coreto_vila')), radius: 7, label: 'Coreto Cantarolante', hint: 'Vá até o coreto da Vila',
        marker: xz(lm('coreto_vila')) },
      { type: 'cutscene', camera: { x: -6, y: 5, z: 30, lookX: 5, lookY: 3, lookZ: 15 },
        lines: [
          N('A Vovó Lãzinha chega com o Bolacha no colo, desconfiada.'),
          L('seu_miolo', 'SURPRESAAA!'),
          N('O coreto toca sozinho, as casas piscam as janelas e a Vila inteira dança. O Bolacha dança também. Mais ou menos.'),
          L('vovo_lazinha', 'Oitenta e sete anos e minha primeira festa surpresa! Agora eu já vi de tudo nessa vida.'),
          Q('Uii! Hihi!'),
        ] },
    ],
  },

  // ============================== NINHAL CANTANTE ==============================
  {
    id: 'filhote_sem_ninho', region: 'ninhal', title: 'O Filhote Sem Ninho', main: true, giver: null, autoStart: true,
    summary: 'Alguém pequenininho e verde está pedindo socorro logo na entrada do Ninhal Cantante...',
    requires: { missions: ['gato_no_telhado'] },
    rewards: { jujubas: 5, color: 0.35 },
    steps: [
      // raio 20: o grito é ouvido da Trilha dos Piados (o cipó fica a ~19 m dela), ninguém passa reto.
      { type: 'goto', ...xz(SPOTS.pinceso_cipo), radius: 20, label: 'Um grito no Ninhal',
        hint: 'Siga a Trilha dos Piados até o Ninhal Cantante', marker: xz(SPOTS.pinceso_cipo) },
      { type: 'cutscene', camera: { x: -121, y: 7, z: -17, lookX: -128, lookY: 5, lookZ: -24 },
        lines: [
          P('Piu! Piu! Socorro! ...Quer dizer, tá tudo sob controle! Eu tô só descansando aqui. Enroscado. De propósito.'),
          Q('Hmm?', 'curiosa'),
          P('Não me olha assim! Eu sou um periquito perigosíssimo! Tenho um bico afiado e... e... me tira daqui?'),
        ] },
      { type: 'interact', target: xz(SPOTS.pinceso_cipo), prop: 'cipo_prisao', label: 'Desenroscar os cipós',
        hint: 'Desenrosque o passarinho dos cipós (E)', marker: xz(SPOTS.pinceso_cipo),
        lines: [
          N('A Quim puxa um cipó, depois outro... PLOFT! O passarinho cai no chão, todo descabelado.'),
          P('Livre! Eu me soltei sozinho, viu? Você só ajudou um pouquinho. Tchau!'),
          N('E ele sai voando, assustado, deixando um rastro de peninhas verdes.'),
          Q('Ei! Hmm...', 'surpresa'),
        ] },
      { type: 'follow_trail', spots: SPOTS.penas_verdes.map(xz), item: 'pena_verde', hint: 'Siga as penas verdes',
        lines: [N('As penas terminam numa pedra coberta de musgo. Lá em cima, uma bolinha verde tremendo.')] },
      { type: 'goto', ...xz(SPOTS.pinceso_pouso), radius: 6, label: 'Pedra Musguinho',
        hint: 'Chegue perto da Pedra Musguinho', marker: xz(SPOTS.pinceso_pouso),
        lines: [P('Você me seguiu?! Ninguém nunca me segue. Quer dizer, todo mundo me segue, eu sou importantíssimo.')] },
      // o Pinceso está em cima da Pedra Musguinho (~3 m, pegada ~2,3): a Quim oferece lá de baixo.
      { type: 'interact', target: pt(SPOTS.pinceso_pouso), radius: 4.5, label: 'Oferecer jujubas',
        hint: 'Ofereça jujubas da lancheira (E)', marker: xz(SPOTS.pinceso_pouso),
        lines: [
          Q('Hmm?', 'curiosa'),
          N('A Quim abre a lancheira e estende a mãozinha com três jujubas coloridas.'),
          P('...Isso é pra mim? Uma de cada cor? ...A verde é a minha favorita.'),
          P('Nham. Nham. Nhaaam. Tá bom, tá bom. Você é legal. Muito legal. Legal demais.'),
        ] },
      { type: 'cutscene', camera: { x: -167, y: 6.5, z: -87, lookX: -172, lookY: 5.5, lookZ: -93 },
        lines: [
          N('O passarinho desce da pedra, dá uma voltinha no ar... e pousa bem no meio dos cachos da Quim.'),
          P('Opa. Que lugar fofinho. Tem até eco aqui dentro. Piu! ...piu... piu...'),
          Q('Uii!'),
          P('Piuí! Eu sou o Pinceso. Periquito. Verde-limão. E a partir de agora, seu guarda-costas oficial.'),
        ] },
      { type: 'pinceso_join', hint: 'O Pinceso agora vai com você!' },
      { type: 'talk', npc: 'dona_pluminia', hint: 'Leve o Pinceso até a Dona Plumínia, na Clareira Cantante',
        lines: [
          L('dona_pluminia', 'Hu-hu... Ora vejam. Um periquito verde-limão num cabelo cacheado. Faz tempo que eu não vejo um desses.'),
          P('Um periquito ou um cabelo?'),
          L('dona_pluminia', 'Os dois, meu bem. Sentem que coruja velha fala devagar, mas fala bonito.'),
          L('dona_pluminia', 'Todo amanhecer, o bando dos periquitos verdes cantava a Canção da Alvorada lá no Ninho-Coreto. E o Sol-Olho acordava sorrindo.'),
          L('dona_pluminia', 'Até que, poucos dias atrás, o Pico Pestana deu um bocejo tão grande que virou ventania. O bando inteiro teve que migrar às pressas lá pro alto.'),
          P('E eu escorreguei do vento. Eu era o menorzinho. Passei dias procurando eles... até cair naquele cipó hoje cedo. Com muito estilo.'),
          L('dona_pluminia', 'Desde então ninguém canta a Alvorada. O Sol acorda emburrado, e bocejo, vocês sabem, é contagioso. O reino todo desbotou.'),
          Q('Oh...', 'triste'),
          L('dona_pluminia', 'Mas olhe pra você, menina: olhos tão acordados que o reino inteiro te segue com o olhar. E agora com um periquito na cabeça.'),
          L('dona_pluminia', 'E periquito que escolhe uma cabeça não sai mais dela. Hu-hu!'),
          P('Isso é verdade. Eu já me sinto em casa. Tem muito espaço aqui.'),
        ] },
    ],
    completeLines: [
      L('dona_pluminia', 'Pra cantar a Alvorada de novo, falta uma voz verde. E a única voz verde do reino está rouquinha de tanto gritar socorro.'),
      P('Eu não gritei socorro. Eu gritei "SOCORRO" em tom de aviso. *cof cof* ...piu.'),
      L('dona_pluminia', 'A Dona Glacê, no Bosque Açucarado, faz uma bala de gogó milagrosa. E a partitura da Canção fica guardada no Relógio Pisca-Hora, na Cidade Cílios.'),
      L('dona_pluminia', 'O Bosque fica a leste da Vila; a Cidade, ao norte. Vão na ordem que quiserem, e espalhem gentileza: os passarinhos daqui também precisam de ajuda.'),
      Q('Uii!'),
      P('Piuí!'),
    ],
  },
  {
    id: 'ovinhos_perdidos', region: 'ninhal', title: 'Ovinhos Perdidos', main: false, giver: 'mamae_sabia',
    summary: 'O Grande Bocejo espalhou os cinco ovinhos da Mamãe Sabiá pelo Ninhal. São frágeis: nada de correr!',
    requires: { missions: ['filhote_sem_ninho'] },
    rewards: { jujubas: 10, color: 0.1 },
    steps: [
      { type: 'talk', npc: 'mamae_sabia', hint: 'Fale com a Mamãe Sabiá, no ninho grande',
        lines: [
          L('mamae_sabia', 'Piu-piu-piriu... piu! Piu-piu-piriu!'),
          P('Ela tá dizendo que o vento levou os cinco ovinhos dela. E que você tem um cabelo lindo. A segunda parte eu acrescentei, mas é verdade.'),
          L('mamae_sabia', 'Piriu! Piu-piu.'),
          P('Ela pediu pra você andar devagarinho com eles. Ovo não gosta de correria. Ovo gosta de colo.'),
          P('E aperta Q, que eu procuro pra você. Tem um lá em cima de uma folha da Árvore Primeiro-Degrau, aposto.'),
        ] },
      { type: 'collect', item: 'ovo', spots: OVOS, count: 5, fragile: true, hint: 'Encontre os 5 ovinhos (sem correr!)',
        lines: [P('Cinco ovinhos inteirinhos! Nenhuma rachadura. Eu sou um ótimo supervisor.')] },
      { type: 'deliver', npc: 'mamae_sabia', item: 'ovo', hint: 'Leve os ovinhos para a Mamãe Sabiá',
        lines: [
          N('A Mamãe Sabiá ajeita os cinco ovinhos no ninho, um do lado do outro, e senta em cima com um suspiro feliz.'),
          L('mamae_sabia', 'Piiiu... piriu!'),
          P('Ela tá chorando de alegria. Eu também. Mas é só um cisco.'),
        ] },
    ],
  },
  {
    id: 'coral_da_floresta', region: 'ninhal', title: 'O Coral da Floresta', main: false, giver: 'tico',
    summary: 'Tico, Teco e Tuco querem formar um coral. Só falta alguém que saiba repetir as notas dos cogumelos.',
    requires: { missions: ['filhote_sem_ninho'] },
    rewards: { jujubas: 8, color: 0.15, flag: 'coral_ensaiado' },
    steps: [
      { type: 'talk', npc: 'tico', hint: 'Fale com o Tico, o Teco e o Tuco',
        lines: [
          L('tico', 'Hmm? Hmm? Uii!'),
          P('Eles tão te imitando, Quim. É o maior elogio que um filhote pode fazer.'),
          L('teco', 'Uii! A gente quer cantar no Coral da Floresta!'),
          L('tuco', 'Mas os cogumelos cantam rápido e a gente esquece!'),
          L('tico', 'Você repete as notas com a gente? Vai, vai, vai?'),
          Q('Hmm-hmm!'),
        ] },
      { type: 'goto', ...xz(SPOTS.coral), radius: 7, label: 'Cogumelos Cantores',
        hint: 'Vá até os cogumelos-nota perto da Clareira Cantante', marker: xz(SPOTS.coral) },
      { type: 'minigame', kind: 'coral', params: { rounds: 5, notas: SPOTS.coral.notas, x: SPOTS.coral.x, z: SPOTS.coral.z },
        hint: 'Repita a melodia dos cogumelos', marker: xz(SPOTS.coral),
        lines: [
          N('Os cogumelos acendem um depois do outro: dó, ré, mi, fá, sol! O trio canta tão alto que perde o equilíbrio.'),
          L('tuco', 'De novo! De novo!'),
          P('Nada mal, filhotes. Quase tão afinados quanto eu.'),
        ] },
    ],
  },
  {
    id: 'penas_ao_vento', region: 'ninhal', title: 'Penas ao Vento', main: false, giver: 'madame_plumagem',
    summary: 'O Cata-Vento espirrou e espalhou as penas de gala da Madame Plumagem. Pegue as penas antes que sumam!',
    requires: { missions: ['filhote_sem_ninho'] },
    rewards: { accessory: 'tiara_penas', color: 0.1 },
    steps: [
      { type: 'talk', npc: 'madame_plumagem', hint: 'Fale com a Madame Plumagem',
        lines: [
          L('madame_plumagem', 'Querida! Que tragédia, que DRAMA! O Cata-Vento espirrou e minhas penas de gala saíram voando!'),
          L('madame_plumagem', 'Sou uma pavoa, meu bem. Sem cauda eu sou só... uma galinha chique.'),
          P('Eu acho que a senhora tá ótima.'),
          L('madame_plumagem', 'Que periquito educado! Pegue minhas penas antes que o vento leve. Elas somem rapidinho!'),
        ] },
      { type: 'goto', ...xz(SPOTS.penas_vento), radius: 10, label: 'Clareira do Cata-Vento',
        hint: 'Vá até a clareira do Cata-Vento', marker: xz(SPOTS.penas_vento) },
      { type: 'minigame', kind: 'penas_vento',
        params: { count: 12, need: 10, seconds: 45, x: SPOTS.penas_vento.x, z: SPOTS.penas_vento.z, radius: SPOTS.penas_vento.radius },
        hint: 'Pegue as penas antes que elas sumam!', marker: xz(SPOTS.penas_vento),
        lines: [P('Pulei, peguei, voei! Quer dizer, você pulou. Mas eu torci muito.')] },
      { type: 'talk', npc: 'madame_plumagem', hint: 'Leve as penas para a Madame Plumagem',
        lines: [L('madame_plumagem', 'Minhas penas! Quase todas! E com as que sobraram, eu fiz uma coisinha pra você...')] },
    ],
    completeLines: [
      L('madame_plumagem', 'Uma tiara de penas! Combina com cachos E com periquito. Moda é isso, querida.'),
      P('Eu sou um acessório agora? ...Eu aceito.'),
    ],
  },
  {
    id: 'casa_nova', region: 'ninhal', title: 'Casa Nova', main: false, giver: 'seu_barreto',
    summary: 'O casal de joões-de-barro quer terminar o ninho, mas o barro desbotou. Junte gravetos, folhas e flores.',
    requires: { missions: ['filhote_sem_ninho'] },
    rewards: { jujubas: 10, color: 0.1, flag: 'ninho_casal_pronto' },
    steps: [
      { type: 'talk', npc: 'seu_barreto', hint: 'Fale com o casal de joões-de-barro',
        lines: [
          L('seu_barreto', 'Bom dia, vizinha! Somos o Barreto e a Barrinha, construtores de ninho há três gerações!'),
          L('dona_barrinha', 'E atrasados há duas. O barro ficou cinza e quebradiço com esse bocejo todo.'),
          L('seu_barreto', 'Então vamos fazer um ninho moderno: gravetos, folhinhas e flores. Ecológico, cheiroso e com vista!'),
          P('Eu levo tudo lá pra cima. Eu sou ótimo com coisas no alto. E com coisas embaixo. Eu sou ótimo.'),
        ] },
      { type: 'collect', item: 'graveto', spots: itens(SPOTS.casa_nova.gravetos), count: 4, hint: 'Junte 4 gravetos pelo Ninhal' },
      { type: 'collect', item: 'folha', spots: itens(SPOTS.casa_nova.folhas), count: 3, hint: 'Junte 3 folhas grandes' },
      { type: 'collect', item: 'flor', spots: itens(SPOTS.casa_nova.flores), count: 3, hint: 'Junte 3 flores para enfeitar' },
      { type: 'deliver', npc: 'seu_barreto', item: 'graveto', hint: 'Entregue os gravetos ao Seu Barreto',
        lines: [L('seu_barreto', 'Gravetos retinhos! Esses dão uma parede e tanto.')] },
      { type: 'deliver', npc: 'seu_barreto', item: 'folha', hint: 'Entregue as folhas ao Seu Barreto',
        lines: [L('dona_barrinha', 'Folhas macias pro chão. Tapete novo!')] },
      { type: 'deliver', npc: 'seu_barreto', item: 'flor', hint: 'Entregue as flores ao Seu Barreto',
        lines: [L('dona_barrinha', 'E flores na porta! Eu disse, Barreto. Eu SEMPRE disse.')] },
      { type: 'cutscene', camera: { x: -238, y: 9, z: -4, lookX: -248, lookY: 9, lookZ: -14 },
        lines: [
          N('O Pinceso sobe e desce, sobe e desce, levando graveto por graveto até o galho.'),
          N('Em pouco tempo o ninho fica pronto: redondinho, florido e com uma janelinha virada pro nascer do sol.'),
          L('dona_barrinha', 'Uma janela! Barreto, a gente tem uma JANELA!'),
          P('Ideia minha. De nada.'),
        ] },
    ],
  },
  {
    id: 'carteiro_piu', region: 'ninhal', title: 'Carteiro Piu', main: false, giver: 'piu',
    summary: 'O Piu, o pombo-carteiro mais atrapalhado do reino, derrubou as cartas da semana. Ajude a entregar em todas as regiões!',
    requires: { missions: ['filhote_sem_ninho'] },
    rewards: { jujubas: 12, color: 0.1, flag: 'carteira_honoraria' },
    steps: [
      { type: 'talk', npc: 'piu', hint: 'Fale com o Piu, no pombal',
        lines: [
          L('piu', 'Pruu! Pru-pru-pruuu! Pru?'),
          P('Ele disse: "Correio Aéreo do Piu, entregas rápidas, às vezes." E que derrubou todas as cartas.'),
          L('piu', 'Pruuu-pru! Pru-pru-pru-pruuu!'),
          P('E que ele tem medo de altura. Um pombo. Com medo de altura. Eu não julgo. Muito.'),
          L('piu', 'Pru!'),
          P('Ele pediu pra gente entregar cinco cartas: na Vila, na sua casa, no jardineiro, na Confeiteira e no Correio Central da Cidade.'),
        ] },
      { type: 'collect', item: 'carta', spots: CARTAS_PIU, count: 5, hint: 'Junte as 5 cartas que o Piu derrubou' },
      { type: 'interact', target: destino('carta_vila'), label: 'Pôr a carta na caixa',
        hint: 'Entregue uma carta na Caixa de Correio da Vila', marker: destino('carta_vila'),
        lines: [N('A caixinha de correio abre a boca, engole a carta e dá uma piscadinha satisfeita.')] },
      { type: 'interact', target: destino('carta_quim'), label: 'Pôr a carta na caixa',
        hint: 'Entregue uma carta na sua caixinha, em casa', marker: destino('carta_quim'),
        lines: [N('Uma carta... pra própria Quim! "Querida netinha, lembra de lanchar. Beijos, Vó Cocada."'), Q('Hihi!')] },
      { type: 'interact', target: destino('carta_jardineiro'), label: 'Entregar a carta',
        hint: 'Entregue uma carta na Casa do Jardineiro', marker: destino('carta_jardineiro'),
        lines: [P('Essa aqui tá cheirando a adubo. Com certeza é pro jardineiro.')] },
      { type: 'interact', target: destino('carta_doceira'), label: 'Entregar a carta',
        hint: 'Entregue uma carta na Cabana da Confeiteira', marker: destino('carta_doceira'),
        lines: [P('Essa tá cheirando a açúcar. Posso dar só uma lambidinha no envelope? ...Não? Tá bom.')] },
      { type: 'interact', target: destino('carta_cidade'), label: 'Entregar a carta',
        hint: 'Entregue a última carta no Correio Central da Cidade', marker: destino('carta_cidade'),
        lines: [N('O Correio Central dos Cílios carimba a carta com um PISC! bem caprichado.')] },
      { type: 'talk', npc: 'piu', hint: 'Volte para o Piu, no Ninhal',
        lines: [
          L('piu', 'PRUUU! Pru-pru!'),
          P('Ele disse que você agora é carteira honorária do reino. E que vai te dar um chapéu de carteiro. Mentira, essa eu inventei.'),
        ] },
    ],
  },
  {
    id: 'cafe_dos_passarinhos', region: 'ninhal', title: 'Café dos Passarinhos', main: false, giver: 'seu_tostado',
    summary: 'A Árvore-Café dos Passarinhos parou de dar café. O Seu Tostado precisa de sementes para acordá-la.',
    requires: { missions: ['filhote_sem_ninho'] },
    rewards: { jujubas: 5, drink: 'latte_mel_semente', flag: 'receita_mel_semente', color: 0.1 },
    steps: [
      { type: 'talk', npc: 'seu_tostado', hint: 'Fale com o Seu Tostado, na Árvore-Café',
        lines: [
          L('seu_tostado', 'Bem-vinda ao Café dos Passarinhos! Hoje temos... nada. A Árvore-Café dormiu.'),
          L('seu_tostado', 'Ela acorda com sementinhas novas no pé. Seis sementes bem escolhidas, e ela volta a florir xicrinhas!'),
          P('Sementes? Eu sou especialista. Eu como sementes profissionalmente.'),
          L('seu_tostado', 'Pois então não coma estas, por favor.'),
        ] },
      { type: 'collect', item: 'semente', spots: itens(SPOTS.sementes_cafe), count: 6, hint: 'Junte 6 sementes pelo Ninhal (Q ajuda!)' },
      { type: 'deliver', npc: 'seu_tostado', item: 'semente', hint: 'Leve as sementes para o Seu Tostado',
        lines: [L('seu_tostado', 'Uma, duas... seis! E nenhuma mordidinha. Estou impressionado, senhor periquito.'), P('Foi difícil.')] },
      { type: 'cutscene', camera: { x: -137, y: 8, z: 32, lookX: -145, lookY: 9, lookZ: 42 },
        lines: [
          N('O Seu Tostado planta as sementes. A Árvore-Café se espreguiça, e as xicrinhas penduradas se enchem de um latte dourado e cheiroso.'),
          L('seu_tostado', 'Latte de mel e semente, a especialidade da casa! E o do senhor periquito vem numa casquinha de bolota.'),
          P('Uau. Essa é a melhor coisa que já aconteceu no meu bico.'),
          Q('Uii!'),
        ] },
    ],
    completeLines: [L('seu_tostado', 'Vou mandar a receita pra Cafeteria Nuvem de Leite, na Cidade. Assim vocês tomam onde quiserem!')],
  },

  // ============================== BOSQUE AÇUCARADO ==============================
  {
    id: 'bala_de_gogo', region: 'bosque', title: 'Bala de Gogó', main: true, giver: 'dona_glace', autoStart: true,
    summary: 'O Pinceso ficou rouquinho. A Dona Glacê, no Bosque Açucarado, faz uma bala que afina qualquer voz.',
    requires: { missions: ['filhote_sem_ninho'] },
    rewards: { jujubas: 8, color: 0.6, flag: 'gogo_afinado' },
    steps: [
      { type: 'talk', npc: 'dona_glace', hint: 'Vá ao Bosque Açucarado (leste) e fale com a Dona Glacê',
        lines: [
          L('dona_glace', 'Uma cliente! Com um periquito! Entra, entra... cuidado com o tapete, ele é de chiclete.'),
          P('Senhora, eu preciso cantar a Canção da Alvorada. Mas olha só: piiu... *cof*'),
          L('dona_glace', 'Hmmm, gogó desafinado. Caso clássico. Precisa de Bala de Gogó Dó-Ré-Mi!'),
          L('dona_glace', 'O ingrediente secreto são as Jujubas Douradas. Elas nascem ao pé das árvores de algodão-doce... mas com o reino desbotado, ficaram tímidas.'),
          P('Pode deixar. Eu tenho olho de águia. De periquito, que é melhor ainda.'),
        ] },
      { type: 'collect', item: 'jujuba', label: 'Jujuba Dourada', spots: JUJUBAS_DOURADAS, count: 6,
        hint: 'Ache 6 Jujubas Douradas ao pé das árvores de algodão-doce (Q ajuda!)',
        lines: [P('Seis douradinhas! E eu só comi... nenhuma. Juro. Quase nenhuma.')] },
      { type: 'deliver', npc: 'dona_glace', item: 'jujuba', hint: 'Leve as Jujubas Douradas para a Dona Glacê',
        lines: [
          L('dona_glace', 'Perfeitas! Agora: uma pitada de calda, três mexidinhas pra esquerda e uma risadinha pra dar sorte.'),
          Q('Hihi!'),
          L('dona_glace', 'Isso! Risadinha de criança é o fermento da bala.'),
        ] },
      { type: 'cutscene', camera: { x: 157, y: 4, z: 63, lookX: 152, lookY: 2.5, lookZ: 71 },
        lines: [
          N('A Dona Glacê embrulha uma balinha listrada num papel brilhante. O Pinceso engole de uma vez.'),
          P('Hmm... mentolada... PIUÍÍÍÍ!'),
          N('O piado ecoa pelo Bosque inteiro. O Pirulito Gigante gira de alegria e as árvores de algodão-doce ficam rosinhas de novo!'),
          Q('Uii!', 'surpresa'),
        ] },
    ],
    completeLines: [
      L('dona_glace', 'Voz afinadíssima! Quando a Dona Plumínia der o sinal, esse bico vai acordar até pedra.'),
      P('Escutou, Quim? Afinadíssima. Eu sou praticamente um coral inteiro.'),
    ],
  },
  {
    id: 'nuvem_gulosa', region: 'bosque', title: 'A Nuvem Gulosa', main: false, giver: 'pipoca',
    summary: 'Uma nuvem comilona engoliu a cartinha de desejos da Pipoca. A nuvem está lá no alto, sobre o Bosque.',
    requires: { missions: ['filhote_sem_ninho'] },
    rewards: { jujubas: 10, color: 0.2 },
    steps: [
      { type: 'talk', npc: 'pipoca', hint: 'Fale com a Pipoca, perto do cogumelo pula-pula',
        lines: [
          L('pipoca', 'Moça! Moça dos cachos! A nuvem comeu minha cartinha de desejos! Eu ia mandar pro Sol-Olho!'),
          L('pipoca', 'Ela tava cheirando a algodão-doce, aí a nuvem achou que era doce e NHAC!'),
          P('Clássico. Nuvem é tudo gulosa.'),
          L('pipoca', 'Dá pra subir pelos cogumelos pula-pula. Mas eu sou pequenininha e minhas orelhas atrapalham.'),
        ] },
      { type: 'goto', ...NUVEM_TESOURO, radius: 3.5, label: 'Nuvem do Tesouro',
        hint: 'Quique nos cogumelos e suba pelas nuvens', marker: xz(NUVEM_TESOURO) },
      { type: 'interact', target: NUVEM_TESOURO, label: 'Fazer cosquinha na nuvem', hint: 'Faça cosquinha na nuvem (E)',
        lines: [
          N('A Quim faz cosquinha na nuvem. A nuvem treme, ri, ri mais... e solta um arroto cor-de-rosa.'),
          N('A cartinha cai rodopiando, inteirinha e com cheiro de morango.'),
          P('Saúde, nuvem.'),
        ] },
      { type: 'collect', item: 'carta', spots: [item('carta_pipoca', NUVEM_TESOURO.x, NUVEM_TESOURO.z, NUVEM_TESOURO.y)],
        count: 1, label: 'Cartinha de desejos', hint: 'Pegue a cartinha da Pipoca' },
      { type: 'deliver', npc: 'pipoca', item: 'carta', hint: 'Leve a cartinha para a Pipoca',
        lines: [
          L('pipoca', 'Minha cartinha! Vou ler o meu desejo: "Querido Sol-Olho, acorda, por favor, que eu quero brincar até tarde."'),
          Q('Hmm-hmm!'),
          P('Pode deixar, Pipoca. A gente tá cuidando disso.'),
        ] },
    ],
  },
  {
    id: 'piquenique_formigas', region: 'bosque', title: 'Piquenique das Formiguinhas', main: false, giver: 'dona_migalha',
    summary: 'A Dona Migalha está organizando um piquenique na beira do Laguinho de Calda, mas os convites são maiores que as formigas.',
    requires: { missions: ['flores_murchas'] },
    rewards: { jujubas: 8, color: 0.2 },
    steps: [
      { type: 'talk', npc: 'dona_migalha', hint: 'Fale com a Dona Migalha, no fim da Trilha das Formiguinhas',
        lines: [
          L('dona_migalha', 'Com licença, com licença! Fila indiana, pessoal! Ah, olá, gigante!'),
          L('dona_migalha', 'Somos a Família Migalha. Vamos fazer o maior piquenique da história do Bosque, na beira do Laguinho de Calda!'),
          L('dona_migalha', 'Só tem um probleminha: os convites são maiores que a gente. Você entrega pra Dona Glacê, pra Pipoca e pro Seu Caramelo?'),
        ] },
      { type: 'collect', item: 'carta', label: 'Convite', spots: CONVITES, count: 3, hint: 'Pegue os 3 convites das formiguinhas' },
      { type: 'deliver', npc: 'dona_glace', item: 'carta', count: 1, hint: 'Entregue um convite à Dona Glacê',
        lines: [L('dona_glace', 'Um piquenique?! Eu levo os docinhos. Todos. Talvez dois carrinhos.')] },
      { type: 'deliver', npc: 'pipoca', item: 'carta', count: 1, hint: 'Entregue um convite à Pipoca',
        lines: [L('pipoca', 'Eu vou! Eu vou! Posso levar meu balde? Ele não serve pra nada, mas eu gosto dele.')] },
      { type: 'deliver', npc: 'seu_caramelo', item: 'carta', count: 1, hint: 'Entregue um convite ao Seu Caramelo, no Laguinho de Calda',
        lines: [L('seu_caramelo', 'Piquenique... na beira da calda... É exatamente onde eu já estou. Perfeito. Nem preciso levantar.')] },
      { type: 'goto', ...PIQUENIQUE, radius: 8, label: 'Piquenique na beira da calda',
        hint: 'Vá até o piquenique no Laguinho de Calda', marker: PIQUENIQUE },
      { type: 'cutscene', camera: { x: 188, y: 4, z: 90, lookX: 198, lookY: 1.5, lookZ: 97 },
        lines: [
          N('Uma toalha xadrez minúscula, mil formiguinhas, a Dona Glacê com dois carrinhos de doce e o Seu Caramelo exatamente onde estava.'),
          L('dona_migalha', 'Um brinde! Com uma gota de calda pra cada uma!'),
          Q('Hihi! Uii!'),
        ] },
    ],
  },

  // ============================== CIDADE CÍLIOS ==============================
  {
    id: 'relogio_cochilou', region: 'cidade', title: 'O Relógio que Cochilou', main: true, giver: 'prefeita_girafina', autoStart: true,
    summary: 'O Relógio Pisca-Hora parou de piscar, e a partitura da Canção da Alvorada está guardada lá dentro.',
    requires: { missions: ['filhote_sem_ninho'] },
    rewards: { jujubas: 8, color: 0.45, flag: 'partitura_alvorada' },
    steps: [
      { type: 'talk', npc: 'prefeita_girafina', hint: 'Vá à Cidade Cílios (norte) e fale com a Prefeita Girafina',
        lines: [
          L('prefeita_girafina', 'Bem-vinda à Cidade Cílios, mocinha! Repare nos meus cílios: dois palmos de puro charme.'),
          L('prefeita_girafina', 'Mas temos uma crise: o Relógio Pisca-Hora cochilou. Sem ele, ninguém sabe a hora em que o sol devia nascer!'),
          P('E a partitura da Alvorada tá lá dentro, né? A coruja falou.'),
          L('prefeita_girafina', 'Um periquito bem informado! O Seu Ponteiro, nosso relojoeiro, sabe como acordar o relógio.'),
        ] },
      { type: 'talk', npc: 'seu_ponteiro', hint: 'Fale com o Seu Ponteiro, ao pé da torre',
        lines: [
          L('seu_ponteiro', 'Acordar o relógio? Fácil! É só subir os degraus e dar corda na chave lá do alto.'),
          L('seu_ponteiro', 'Eu subiria, mas... sou um ratinho de chão. Lá em cima tem muito... lá em cima.'),
          Q('Hmm-hmm!'),
          L('seu_ponteiro', 'Coragem, menina! E se a chave emperrar, faz cosquinha nela. Relógio é muito sensível.'),
        ] },
      { type: 'goto', ...TERRACO_TORRE, radius: 6, label: 'Terraço da Torre do Relógio',
        hint: 'Suba a escadaria da Torre do Relógio', marker: xz(TERRACO_TORRE) },
      { type: 'interact', target: TERRACO_TORRE, label: 'Dar corda no relógio', hint: 'Dê corda no Relógio Pisca-Hora (E)',
        lines: [
          N('A chave de corda está no topo do relógio, alto demais até pra Quim na pontinha dos pés.'),
          P('Deixa comigo! Guarda-costas também é guarda-chaves.'),
          N('O Pinceso gira a chave com o bico. Tic... tac... tic-tac-tic-tac... PISC!'),
          N('O relógio abre o olhão, pisca três vezes e solta um rolinho de papel dourado.'),
        ] },
      { type: 'cutscene', camera: { x: -5, y: 24, z: -185, lookX: 175, lookY: 30, lookZ: -215 },
        lines: [
          P('A partitura da Alvorada! Olha, Quim: as notinhas têm olhinhos!'),
          Q('Uii...', 'surpresa'),
          N('Lá do alto, a Quim vê o Pico Pestana enrolado numa névoa sonolenta. E, bem baixinho, parece ouvir um piado.'),
          P('...Você também ouviu? Deve ter sido o vento. É. O vento.'),
        ] },
    ],
    completeLines: [
      L('prefeita_girafina', 'O relógio voltou a piscar! A cidade inteira tá abrindo os olhos!'),
      L('prefeita_girafina', 'Isso merece comemoração. Passem na Cafeteria Nuvem de Leite, que a Dona Nata prepara algo especial. Por conta da prefeitura!'),
    ],
  },
  {
    id: 'pausa_na_nuvem', region: 'cidade', title: 'Uma Pausa na Nuvem', main: false, giver: 'dona_nata', autoStart: true,
    summary: 'A prefeita mandou comemorar! A Dona Nata espera a Quim na Cafeteria Nuvem de Leite.',
    requires: { missions: ['relogio_cochilou'] },
    rewards: { color: 0.2, flag: 'cafeteria_amiga' },
    steps: [
      { type: 'talk', npc: 'dona_nata', hint: 'Fale com a Dona Nata, na Cafeteria Nuvem de Leite',
        lines: [
          L('dona_nata', 'Bem-vinda à Nuvem de Leite, a cafeteria mais fofinha do reino. Aqui a espuma tem olhinhos e o açúcar é sempre um abraço.'),
          L('dona_nata', 'A prefeitura mandou um mimo pra você. Senta, escolhe o que quiser e respira fundo. Aventura também precisa de pausa.'),
        ] },
      { type: 'cafe', free: true, hint: 'Sente-se e escolha uma bebida', marker: xz(SPOTS.cafeteria_mesa),
        lines: [
          N('Lá fora a fonte cochicha. Aqui dentro toca uma musiquinha lenta, e a espuma da xícara pisca pra Quim.'),
          L('dona_nata', 'E pro cavalheiro de penas: um minicafé no dedalzinho.'),
          P('Um dedal! Do meu tamanho! Esse é o dia mais elegante da minha vida.'),
          Q('Hmm... uii.'),
          P('...Quim? Obrigado por me achar lá no cipó. Tá. Só isso. Bebe seu café.'),
        ] },
    ],
    completeLines: [L('dona_nata', 'Volte sempre! Latte de morango, chocolate de nuvem, chá de lavanda, soda de jujuba... tudo com carinha feliz.')],
  },
  {
    id: 'lacos_ao_vento', region: 'cidade', title: 'Laços ao Vento', main: false, giver: 'madame_fivela',
    summary: 'O Grande Bocejo espalhou os laços da vitrine da Madame Fivela pela Cidade. Sem eles, a loja não abre.',
    requires: { missions: ['flores_murchas'] },
    rewards: { jujubas: 10, color: 0.2, flag: 'loja_aberta' },
    steps: [
      { type: 'talk', npc: 'madame_fivela', hint: 'Fale com a Madame Fivela, na Laços & Cachos',
        lines: [
          L('madame_fivela', 'Ah, uma cliente com CACHOS! Meus sonhos se realizaram! ...Mas a loja tá fechada, querida.'),
          L('madame_fivela', 'A ventania do Grande Bocejo levou meus laços da vitrine. Um foi parar no Grande Piscão, outro na placa do Pico e outro lá no Cais.'),
          L('madame_fivela', 'Traga meus laços e eu abro a Laços & Cachos só pra você. Com desconto de cliente favorita!'),
        ] },
      { type: 'interact', target: 'estatua_olho_cidade', label: 'Desenroscar o laço',
        hint: 'Procure um laço no Grande Piscão, a estátua de olho', marker: xz(lm('estatua_olho_cidade')),
        lines: [N('Um laço cor-de-rosa enroscado nos cílios do Grande Piscão. A estátua pisca, agradecida.')] },
      { type: 'interact', target: 'placa_pico', label: 'Desamarrar o laço',
        hint: 'Procure um laço na placa do Pico Pestana', marker: xz(lm('placa_pico')),
        lines: [N('Um laço lilás amarrado na placa, balançando feito bandeirinha.')] },
      { type: 'interact', target: 'banco_cais', label: 'Pegar o laço',
        hint: 'Procure um laço no Banco do Cais', marker: xz(lm('banco_cais')),
        lines: [N('Um laço amarelinho cochilando no banco do Cais. Até laço anda com sono.')] },
      { type: 'talk', npc: 'madame_fivela', hint: 'Leve os laços para a Madame Fivela',
        lines: [L('madame_fivela', 'Meus bebês! Vou pendurar todos na vitrine. Pronto: Laços & Cachos oficialmente ABERTA!')] },
    ],
    completeLines: [L('madame_fivela', 'Passa no balcão quando quiser. Tenho laço, chapéu e cachecol, tudo no tamanho perfeito pra cachinhos.')],
  },
  {
    id: 'piscadinha_nas_alturas', region: 'cidade', title: 'Piscadinha nas Alturas', main: false, giver: 'dona_soneca',
    summary: 'A Dona Soneca quer saber se as nuvens ainda estão acordadas. Só tem um jeito: piscar pra elas lá do alto.',
    requires: { missions: ['filhote_sem_ninho'] },
    rewards: { jujubas: 5, accessory: 'oculos', color: 0.15 },
    steps: [
      { type: 'talk', npc: 'dona_soneca', hint: 'Fale com a Dona Soneca, perto da fonte',
        lines: [
          L('dona_soneca', 'Oooi... menina... tudo... bem?'),
          L('dona_soneca', 'Eu... sou... do... Clube... das... Nuvens... Piscantes. A gente... pisca... pras nuvens... e elas... piscam... de volta.'),
          L('dona_soneca', 'Mas... ultimamente... elas... não... respondem. Será... que... dormiram?'),
          P('Quer que a gente pisque pra elas lá do alto? Tipo, BEM do alto?'),
          L('dona_soneca', 'Isso. Da... torre... do... telhado... do... gato... e... da... nuvem... do... Bosque. ...Zzz.'),
        ] },
      { type: 'interact', target: TERRACO_TORRE, label: 'Piscar para as nuvens',
        hint: 'Pisque para as nuvens do alto da Torre do Relógio', marker: xz(TERRACO_TORRE),
        lines: [N('Piscadinha! Três nuvens respondem ao mesmo tempo. Uma delas manda um beijinho.')] },
      { type: 'interact', target: TERRACO_GATO, label: 'Piscar para as nuvens',
        hint: 'Pisque para as nuvens do telhado da Casa do Telhado Alto, na Vila', marker: xz(TERRACO_GATO),
        lines: [N('A Quim pisca. Uma nuvem gordinha pisca de volta, meio sonolenta, e boceja um arco-íris pequenininho.')] },
      { type: 'interact', target: NUVEM_TESOURO, label: 'Piscar para as nuvens',
        hint: 'Pisque para as nuvens lá da Nuvem do Tesouro, no Bosque', marker: xz(NUVEM_TESOURO),
        lines: [N('Lá de cima da nuvem, a Quim pisca. O céu inteiro pisca de volta!'), P('Elas tão acordadas! E tão me olhando. Eu tô bonito hoje?')] },
      { type: 'talk', npc: 'dona_soneca', hint: 'Volte para a Dona Soneca, na Cidade',
        lines: [L('dona_soneca', 'Elas... piscaram? ...Que... alegria. Toma... os... óculos... de... olhar... nuvem. Agora... você... é... do... clube.')] },
    ],
  },

  // ============================== ALVORADA (volta ao Ninhal) ==============================
  {
    id: 'alvorada', region: 'ninhal', title: 'Alvorada', main: true, giver: 'dona_pluminia', autoStart: true,
    summary: 'Voz afinada e partitura em mãos: é hora de cantar a Canção da Alvorada no Ninho-Coreto, ao amanhecer.',
    requires: { missions: ['bala_de_gogo', 'relogio_cochilou'] },
    // color 0.65: com o filhote_sem_ninho (0.35), a Alvorada deixa o Ninhal inteirinho colorido (visão do jogo).
    rewards: { jujubas: 12, color: 0.65, flag: 'alvorada_ensaiada' },
    steps: [
      { type: 'talk', npc: 'dona_pluminia', hint: 'Volte ao Ninhal e fale com a Dona Plumínia',
        lines: [
          L('dona_pluminia', 'Hu-hu! Bala de gogó E partitura dourada? Vocês são mais rápidos que fofoca de passarinho.'),
          L('dona_pluminia', 'A Alvorada se canta no Ninho-Coreto, no alto da Árvore-Mãe, bem na hora em que a noite vira dia.'),
          L('dona_pluminia', 'Vou tirar um cochilinho pra estar descansada. Me acordem à noite, no meu oco. E batam forte, que eu tenho sono pesado.'),
          P('Uma coruja... que dorme de noite?'),
          L('dona_pluminia', 'Culpa do Grande Bocejo, meu bem. Até eu ando trocando o dia pela noite. Que vexame.'),
        ] },
      { type: 'night', hint: 'Espere a noite (sente num banco para o tempo passar)',
        lines: [N('As estrelas piscam. Os vaga-lumes acendem as lanterninhas. Hora de acordar uma coruja!')] },
      { type: 'interact', target: pt(OCO), label: 'Bater no oco',
        hint: 'Suba os galhos até o oco da Dona Plumínia e bata (E)', marker: xz(OCO),
        lines: [
          N('Toc, toc, toc.'),
          L('dona_pluminia', 'Zzz... hã? Já amanheceu? Perdi a Alvorada?'),
          Q('Hmm-hmm!'),
          P('Ainda é noite, Dona Plumínia. A senhora é uma coruja. Coruja acorda de noite, lembra?'),
          L('dona_pluminia', 'Ah, é mesmo! Hu-hu! Que coisa. Vamos, vamos! Pro Ninho-Coreto, que eu chamo o coral!'),
        ] },
      { type: 'goto', ...pt(CORETO), radius: 6, label: 'Ninho-Coreto',
        hint: 'Suba até o Ninho-Coreto, no topo da Árvore-Mãe', marker: xz(CORETO),
        lines: [P('Quim... a gente tá MUITO alto. Eu tô ótimo. Só vou segurar seu cacho com um pouquinho mais de força.')] },
      { type: 'cutscene', dayTime: 0.24, camera: { x: -193, y: 37.5, z: -18, lookX: -205, lookY: 35, lookZ: -30 },
        lines: [
          N('Os passarinhos do Ninhal chegam um a um. Tico, Teco e Tuco se espremem na primeira fila.'),
          L('dona_pluminia', 'Atenção, coral! Partitura aberta, gogó afinado... e um, e dois, e...'),
          P('Piu... piu-piu... PIUÍÍÍ!'),
          N('O Ninhal inteiro canta junto. O céu clareia, as folhas se espreguiçam e o Ninhal Cantante se pinta inteirinho de cor!'),
          N('Lá longe, a névoa do Pico Pestana estremece. E do meio dela vem uma resposta: um coro de piados verdes, bem sonolento.'),
          P('...É o meu bando! Eles tão piando dormindo, que nem eu quando era ovo. Quim, é a minha família! Eles tão lá em cima!'),
          Q('Uii!', 'surpresa'),
        ] },
      { type: 'set_flag', flag: 'pico_liberado' },
    ],
    completeLines: [
      L('dona_pluminia', 'Nosso canto abriu um caminho de vento a favor até o Pico. Mas só o bando inteiro consegue acordar o Sol-Olho de verdade.'),
      L('dona_pluminia', 'Vão pela Cidade Cílios e peguem a Estrada do Vento. E levem esse filhote pra casa.'),
      P('Pra casa...'),
      Q('Hmm?', 'curiosa'),
    ],
  },

  // ============================== PICO PESTANA (final) ==============================
  {
    id: 'piados_no_pico', region: 'pico', title: 'Piados no Pico', main: true, giver: null, autoStart: true,
    summary: 'O caminho do Pico Pestana está aberto. Lá em cima, o bando do Pinceso espera.',
    requires: { missions: ['alvorada'], flags: ['pico_liberado'] },
    rewards: { jujubas: 20, color: 1, flag: 'final' },
    steps: [
      { type: 'goto', ...xz(SPOTS.pico_entrada), radius: 10, label: 'Portal da Névoa',
        hint: 'Saia da Cidade pela Estrada do Vento até o Portal da Névoa', marker: xz(SPOTS.pico_entrada),
        lines: [
          N('Um ventinho a favor sopra pelas costas da Quim e abre um corredor no meio da névoa sonolenta.'),
          P('Segura firme nos cachos, Quim. Quer dizer, eu seguro. Você só anda.'),
        ] },
      { type: 'goto', ...xz(SPOTS.mirante), radius: 8, label: 'Mirante da Pestana',
        hint: 'Suba a Serpentina da Pestana até o Mirante', marker: xz(SPOTS.mirante) },
      { type: 'cutscene', camera: { x: 153, y: 34, z: -205, lookX: 0, lookY: 4, lookZ: 60 },
        lines: [
          N('Do Mirante dá pra ver o reino inteirinho: o Campo, a Vila, o Ninhal, o Bosque, a Cidade. Tudo que a Quim ajudou a colorir.'),
          Q('Uii...'),
          P('Olha lá a sua casa! Tão pequenininha! Daqui ela parece uma jujuba.'),
        ] },
      { type: 'goto', ...xz(SPOTS.bando), radius: 12, label: 'Árvore do Bando',
        hint: 'Encontre o bando na Árvore do Bando', marker: xz(SPOTS.bando) },
      { type: 'cutscene', camera: { x: 167, y: 33, z: -207, lookX: 180, lookY: 33, lookZ: -216 },
        lines: [
          N('Na árvore retorcida, dezenas de periquitos verdes dormem enroladinhos na névoa, de olhos fechados.'),
          P('Eles tão dormindo... A névoa deixou todo mundo com sono. Pessoal? PESSOAL!'),
          N('Ninguém acorda. O Pinceso murcha.'),
          Q('Hmm...', 'curiosa'),
          N('A Quim enche o peito de ar, sorri e solta o maior "UII!" da história do reino.'),
          Q('UII!'),
          P('PIUÍÍÍÍ!'),
          N('Um olho se abre. Depois outro. E outro. A árvore inteira acorda num alvoroço de penas verdes!'),
        ] },
      { type: 'talk', npc: 'vovo_pincelao', hint: 'Fale com o Vovô Pincelão',
        lines: [
          L('vovo_pincelao', 'Pinceso?! Meu netinho! Você cresceu! Quer dizer, não cresceu nada, mas tá mais corajoso!'),
          P('Vovô! Eu achei uma menina. Quer dizer, ela me achou. Quer dizer... a gente se achou.'),
          L('vovo_pincelao', 'Menina dos cachos, o bando inteiro te agradece. Sem você, a gente ia dormir até o próximo bocejo.'),
          L('vovo_pincelao', 'O amanhecer tá chegando. Hora de cantar a Alvorada de verdade, todo mundo junto!'),
        ] },
    ],
    // Ao concluir (flag 'final'): o sistema de missões toca o ENDING e colore todas as regiões até 1.
  },
];

// ---------------------------------------------------------------------------------------------
// Cafeteria Nuvem de Leite (preços em jujubas).
export const DRINKS = [
  { id: 'latte_morango', name: 'Latte de Morango', price: 8, color: '#ffb3c7',
    description: 'Rosinha, cremoso e com uma carinha de morango desenhada na espuma.' },
  { id: 'chocolate_nuvem', name: 'Chocolate de Nuvem', price: 10, color: '#8b5e3c',
    description: 'Chocolate quente com uma nuvem de marshmallow por cima. A nuvem pisca enquanto derrete.' },
  { id: 'latte_mel_semente', name: 'Latte de Mel e Semente', price: 9, color: '#f2c063', requiresFlag: 'receita_mel_semente',
    description: 'Receita dos passarinhos do Ninhal: mel dourado e sementinhas tostadas. O Pinceso aprova.' },
  { id: 'cha_lavanda', name: 'Chá de Lavanda', price: 6, color: '#c9a7f5',
    description: 'Lilás, cheiroso e calminho. Faz até bocejo virar sorriso.' },
  { id: 'soda_jujuba', name: 'Soda de Jujuba', price: 5, color: '#7fd8ff',
    description: 'Borbulhante e de todas as cores. As bolinhas fazem cócegas no nariz.' },
];

// Acessórios: shop:true = vendido na Laços & Cachos (depois da flag loja_aberta); os outros são presentes de missão.
export const ACCESSORIES = [
  { id: 'laco', name: 'Laço de Cetim', price: 30, shop: true,
    description: 'Um laço cor-de-rosa que combina com cachos. Faz até o espelho piscar.' },
  { id: 'chapeu', name: 'Chapéu de Sol', price: 55, shop: true,
    description: 'Chapéu de palha com fita, ótimo para piqueniques e para esconder um periquito.' },
  { id: 'cachecol', name: 'Cachecol Fofinho', price: 40, shop: true,
    description: 'Tricotado com lã de nuvem. Ideal para o ventinho do Pico Pestana.' },
  { id: 'oculos', name: 'Óculos de Olhar Nuvem', price: 0, shop: false,
    description: 'Presente do Clube das Nuvens Piscantes. Com eles, toda nuvem parece sorrir.' },
  { id: 'tiara_penas', name: 'Tiara de Penas', price: 0, shop: false,
    description: 'Feita pela Madame Plumagem com as penas salvas do vento. Elegância nível pavoa.' },
  { id: 'coroa_flores', name: 'Coroa de Flores', price: 0, shop: false,
    description: 'Presente do Seu Palhinha, o Enfeitalho. Cheira a campo e a amizade nova.' },
];

// ---------------------------------------------------------------------------------------------
// Cena de abertura: começa no céu sobre a casa da Quim e termina na porta, com ela olhando o reino.
export const PROLOGUE = [
  { camera: { x: 0, y: 40, z: 262, lookX: 0, lookY: 18, lookZ: 100 }, seconds: 4 },
  N('No Mundo Olhos, tudo tem olhinhos: as flores, as casas, as nuvens... até as xícaras.'),
  N('E todo dia, lá no alto, o Sol-Olho abre o olhão dourado pra acordar o reino.'),
  N('Quer dizer... abria. Ultimamente ele acorda com uma preguiça danada. E o reino vai ficando cinzinha.'),
  { camera: { x: 7, y: 3, z: 221, lookX: 0, lookY: 2.5, lookZ: 230 }, seconds: 3 },
  L('vo_cocada', 'Quiiim! Acorda, flor do meu cacho! O sol já tá no céu... eu acho.'),
  Q('Hmmm... mais cinco minutinhos...', 'triste'),
  N('A porta se abre. Primeiro sai uma cabeleira de cachos. A Quim vem logo atrás.'),
  { camera: { x: 0, y: 3.5, z: 219, lookX: -24, lookY: 7, lookZ: 170 }, seconds: 3 },
  Q('Hmm?', 'curiosa'),
  Q('Oh...?', 'surpresa'),
  L('vo_cocada', 'Pois é. Até a Florzona amanheceu cinzinha. E repara: tudo anda olhando pra você. Acho que estão pedindo ajuda pra menina mais acordada do reino.'),
  Q('Eu?! ...Uii!', 'feliz'),
  L('vo_cocada', 'Leva a lancheira, que tem jujuba. E passa no Seu Girassolino, o jardineiro: ele entende de flor tristonha.'),
  N('E assim, de cachos ao vento, a Quim saiu para acordar o Mundo Olhos.'),
];

// Final: toca quando 'piados_no_pico' termina. Amanhecer no Pico, a onda de cor e a escolha do Pinceso.
export const ENDING = [
  { camera: { x: 166, y: 34, z: -204, lookX: 180, lookY: 33, lookZ: -216 }, seconds: 3, dayTime: 0.24 },
  N('No alto do Pico Pestana, o bando inteiro respirou fundo.'),
  L('vovo_pincelao', 'Pinceso, foi o seu piado que acordou a gente. Então a primeira nota é sua.'),
  P('Eu?! ...Claro que eu. Sou o guarda-costas oficial da Alvorada.'),
  Q('Uii!', 'feliz'),
  P('Piuí!'),
  { camera: { x: 150, y: 40, z: -200, lookX: 0, lookY: 0, lookZ: 80 }, seconds: 5, dayTime: 0.27 },
  N('A Canção da Alvorada subiu pelo céu, piado por piado, até o Sol-Olho abrir o olhão, enorme e dourado.'),
  N('Uma onda de cor desceu o Pico e correu pela Cidade, pelo Bosque, pela Vila e pelo Ninhal, até a casinha da Quim.'),
  // câmera a ~10 m enquadrando a Mamãe Pincela (177,-212) e o Vovô (175,-215), fora dos ninhos do bando.
  { camera: { x: 169, y: 32.5, z: -206, lookX: 176.5, lookY: 30.8, lookZ: -213 }, seconds: 2.5 },
  L('mamae_pincela', 'Filhote... vem pra casa com a gente? Tem um galho quentinho te esperando no ninho do bando.'),
  P('Mãe... eu já tenho um ninho. Ele é cacheado, faz "hmm" e passa o dia ajudando todo mundo.'),
  P('Alguém precisa cuidar desses cachos. Eu fico com a Quim.'),
  Q('...Uii?', 'surpresa'),
  L('vovo_pincelao', 'Periquito que escolhe uma cabeça não sai mais dela. A Plumínia sempre disse.'),
  L('mamae_pincela', 'Então venham nos visitar. Todo amanhecer a gente canta pra vocês.'),
  Q('Hmm-hmm! Uii!', 'feliz'),
  N('E desde então, todo dia, o Mundo Olhos acorda colorido... e olhando pra ela.'),
];

// ---------------------------------------------------------------------------------------------
export const TIPS = [
  'Cada gentileza devolve um pouquinho de cor ao reino.',
  'Moradores com "!" têm um pedido. Quando você ajuda, o "!" vira coração.',
  'Tudo no Mundo Olhos tem olhinhos. Repare: eles estão sempre olhando pra Quim.',
  'Segure Espaço no ar para planar: o Pinceso segura seus cachos com o bico!',
  'Aperte Q e o Pinceso voa até a coisa escondida mais próxima.',
  'Correr carregando ovinhos faz eles balançarem. Vá devagarinho!',
  'Sente num banco (E) para o tempo passar rapidinho até a noite ou o amanhecer.',
  'Siga o Rio Bocejo rio abaixo e você sempre volta para o Campo das Pétalas.',
  'Aperte Tab para abrir o Diário da Quim e ver missões e adesivos.',
  'Aperte M para ver o mapa. Regiões ainda não visitadas ficam cobertas de nuvem.',
  'Jujubas compram bebidas na Cafeteria Nuvem de Leite e acessórios na Laços & Cachos.',
  'Existem trilhas secretas ligando as regiões. Fique de olho em caminhos estreitinhos.',
  'No meio do Lago Espelhinho tem uma ilhota. Dá pra chegar pulando pelas pedras.',
  'Perto da Pipoca, no Bosque, tem um cogumelo de marshmallow que é pula-pula. Experimente!',
  'À noite os vaga-lumes acendem e as janelas brilham. Vale um passeio noturno.',
  'Lá do alto da Torre do Relógio dá pra ver a Cidade Cílios inteirinha.',
  'Folhas balançam quando você pisa nelas. Pule rápido!',
  'Se ficar parada muito tempo, a Quim boceja. E bocejo é contagioso!',
  'Fale com todo mundo: cada morador tem uma bobagem fofa pra contar.',
  'O Pico Pestana aparece de quase todo lugar. É lá que a jornada termina.',
];
