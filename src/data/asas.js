// Casinha Asas de Saudade: os oito passarinhos da Gabaolbi (docs/casinha-asas-de-saudade.md).
// Dados puros. As falas evitam gênero de propósito: "você" e "a gente" valem para todos.
export const ASAS_NAME = 'Casinha Asas de Saudade';
export const ASAS_DEDICATORIA = 'Com amor, para os passarinhos da Gabaolbi.';

const COMUM = { barras: '#2b2a33', cauda: '#2e5fb0', bochecha: '#6a6be0', cera: '#6aa7e8', bico: '#e9c77a', pintas: '#2b2a33' };

export const ASAS_BIRDS = [
  {
    id: 'kie', name: 'Kié', kind: 'agapornis', especie: 'agapórnis personata', size: 1, roundness: 1,
    look: { body: '#5aa6e6', outfit: '#26242c' },
    cores: { corpo: '#5aa6e6', barriga: '#8cc4f2', asa: '#3f86cf', pontaAsa: '#2d5f9f', cabeca: '#26242c', rosto: '#26242c', colar: '#ffffff', bico: '#f2cfc4', cauda: '#2f6eb5' },
    voice: { pitch: 1.75, speed: 1.1, timbre: 'piado' },
    falas: ['Aqui a gente cuida um do outro. Sempre.', 'Senta um pouquinho com a gente?', 'Eu e Vidinho guardamos esse cantinho pra você.'],
    cafune: 'Kié e Vidinho pedem carinho juntinhos e encostam as cabecinhas na sua mão.',
    pescoco: 'Kié estica o pescocinho e fecha os olhos, bem devagar.',
    semente: 'Kié pega uma sementinha... e dá a primeira para Vidinho.',
  },
  {
    id: 'vidinho', name: 'Vidinho', kind: 'agapornis', especie: 'agapórnis personata', size: 1.02, roundness: 1,
    look: { body: '#69bf4d', outfit: '#f58a2e' },
    cores: { corpo: '#69bf4d', barriga: '#9edb6e', asa: '#4fa53c', pontaAsa: '#3a7d2f', cabeca: '#6a4128', rosto: '#f58a2e', colar: '#f7b13a', bico: '#f27a24', cauda: '#3f8f38' },
    voice: { pitch: 1.6, speed: 1.05, timbre: 'piado' },
    falas: ['Onde Kié vai, eu vou. É a regra da casa.', 'Hoje o sol entrou bem aqui no meu poleiro.', 'Que bom que você veio. Faz a gente tão feliz.'],
    cafune: 'Vidinho e Kié pedem carinho juntinhos e encostam as cabecinhas na sua mão.',
    pescoco: 'Vidinho arrepia as peninhas do pescoço, todo contente.',
    semente: 'Vidinho come da sua mãozinha, sem a menor pressa.',
  },
  {
    id: 'pirix', name: 'Pirix', kind: 'periquito', especie: 'periquito australiano', size: 1, roundness: 1,
    look: { body: '#84d24f', outfit: '#ffe45c' },
    cores: { ...COMUM, corpo: '#84d24f', barriga: '#a6e26a', asa: '#f2dd55', cabeca: '#e9dd5c', rosto: '#ffe45c' },
    voice: { pitch: 2.05, speed: 1.3, timbre: 'piado' },
    falas: ['Piu! Olha só quem veio!', 'Aqui ninguém tem pressa. É tão bom.', 'Tem sementinha pra todo mundo. Até pra você!'],
    cafune: 'Pirix inclina a cabeça para o lado, pedindo mais um pouquinho.',
    pescoco: 'Pirix fecha os olhinhos e solta um piadinho baixinho.',
    semente: 'Pirix pega uma, olha para você, e pega mais uma.',
  },
  {
    id: 'bolinha', name: 'Bolinha', kind: 'periquito', especie: 'periquito australiano', size: 0.98, roundness: 1.2,
    look: { body: '#8ed354', outfit: '#ffe45c' },
    cores: { ...COMUM, corpo: '#8ed354', barriga: '#b0e374', asa: '#f4df5e', cabeca: '#ecdf62', rosto: '#ffe661' },
    voice: { pitch: 1.9, speed: 1.15, timbre: 'piado' },
    falas: ['Aqui tem tanto carinho que a gente fica bem fofinho.', 'Vem cá, tem lugar no poleiro.', 'Olha o sol, olha as flores. Bonito, né?'],
    cafune: 'Bolinha arrepia as peninhas e vira uma bolinha ainda mais redonda.',
    pescoco: 'Bolinha se aconchega na sua mão e nem pisca.',
    semente: 'Bolinha come tudo, feliz da vida, e fica olhando se tem mais.',
  },
  {
    id: 'mish', name: 'Mish Pishi', kind: 'periquito', especie: 'periquito australiano', size: 0.96, roundness: 1,
    look: { body: '#93dc62', outfit: '#fff07a' },
    cores: { ...COMUM, corpo: '#93dc62', barriga: '#b6ea82', asa: '#f6e36a', cabeca: '#efe36c', rosto: '#fff07a' },
    voice: { pitch: 2.2, speed: 1.2, timbre: 'piado' },
    falas: ['Psiu! Tá ouvindo a gente cantar?', 'A gente canta um pouquinho todo dia. É pra você.', 'Aqui é calminho. Pode descansar.'],
    cafune: 'Mish Pishi se esfrega na sua mão e canta baixinho.',
    pescoco: 'Mish Pishi abaixa a cabeça, pedindo o cafuné bem ali.',
    semente: 'Mish Pishi escolhe a sementinha com todo o cuidado do mundo.',
  },
  {
    id: 'piscilao', name: 'Piscilão', kind: 'periquito', especie: 'periquito australiano', size: 1.06, roundness: 1,
    look: { body: '#74c544', outfit: '#ffdf52' },
    cores: { ...COMUM, corpo: '#74c544', barriga: '#98d95f', asa: '#eed84e', cabeca: '#e4d752', rosto: '#ffdf52' },
    voice: { pitch: 1.8, speed: 1.05, timbre: 'piado' },
    falas: ['A água daqui é a mais fresquinha do reino.', 'Um banhinho e um cochilo. A vida é boa.', 'Fica mais um pouco. Só mais um pouquinho.'],
    cafune: 'Piscilão sacode as peninhas molhadas e encosta em você mesmo assim.',
    pescoco: 'Piscilão estica o pescoço e suspira de felicidade.',
    semente: 'Piscilão come devagarinho, de olhinhos meio fechados.',
  },
  {
    id: 'bluezinho', name: 'Bluezinho', kind: 'periquito', especie: 'periquito australiano', size: 1, roundness: 1,
    look: { body: '#55a8f0', outfit: '#2f6cc0' },
    cores: { corpo: '#55a8f0', barriga: '#80c2f7', asa: '#4f9ce4', cabeca: '#60adf2', rosto: '#6bb6f4', barras: '#3377c4', cauda: '#2f6cc0', bochecha: '#3f83d4', cera: '#3f83d4', bico: '#e9c77a', pintas: '#3377c4' },
    voice: { pitch: 2.1, speed: 1.2, timbre: 'piado' },
    falas: ['O céu daqui é da minha cor, reparou?', 'Eu vejo você chegando lá de cima.', 'Quando sentir saudade, é só vir.'],
    cafune: 'Bluezinho fecha os olhinhos e deixa a cabeça pesar na sua mão.',
    pescoco: 'Bluezinho arrepia as peninhas azuis, todo bobo de alegria.',
    semente: 'Bluezinho pega a sementinha e canta antes de comer.',
  },
  {
    id: 'bluby', name: 'Bluby', kind: 'periquito', especie: 'periquito australiano', size: 0.98, roundness: 1,
    look: { body: '#ffdc4a', outfit: '#f6c82e' },
    cores: { corpo: '#ffdc4a', barriga: '#ffe878', asa: '#ffd83c', cabeca: '#ffe25e', rosto: '#ffe86a', barras: '#f2c433', cauda: '#f6c82e', bochecha: '#fff0a0', cera: '#f0b9a0', bico: '#eec98a', pintas: null },
    voice: { pitch: 2.3, speed: 1.25, timbre: 'piado' },
    falas: ['Sou da cor do solzinho da manhã!', 'Todo dia aqui começa bonito.', 'A gente tá bem. E a gente te ama.'],
    cafune: 'Bluby vira um solzinho quentinho na sua mão.',
    pescoco: 'Bluby inclina a cabeça, feliz da vida, e pede de novo.',
    semente: 'Bluby come, dá um pulinho e volta para comer mais.',
  },
];

// Ordem em que chegam no reencontro (Kié e Vidinho sempre juntinhos).
export const ASAS_CHEGADA = [['kie', 'vidinho'], ['pirix'], ['bolinha'], ['mish'], ['piscilao'], ['bluezinho'], ['bluby']];

export const ASAS_REENCONTRO = [
  ['kie', 'A gente sabia que você vinha!'],
  ['bolinha', 'Guardamos o melhor poleiro pra você.'],
  ['mish', 'Aqui tem sementinha, sol e cafuné todo dia.'],
  ['bluby', 'A gente tá bem, viu? Tá tudo bem.'],
];
