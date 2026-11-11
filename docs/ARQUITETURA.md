# Mundo Olhos — Contrato de Arquitetura

Jogo 3D de exploração em mundo aberto, Three.js r160 (local em `vendor/three/`, import map em `index.html`:
`import * as THREE from 'three'` e `import { X } from 'three/addons/postprocessing/X.js'`).
JavaScript puro em módulos ES, **sem build, sem dependências novas, sem imagens/áudio externos**.
Tudo (modelos, texturas, sons, música) é gerado por código. Textos do jogo em **português do Brasil**.
Jogo ORIGINAL: não referenciar personagens, nomes ou visuais de jogos existentes.

Rodar: servidor local na pasta `mundo-olhos/` (`python -m http.server 8080`) e abrir `http://localhost:8080/`.
Parâmetros de teste na URL: `?skip` (pula menu, jogo novo), `?noprologue`, `?debug`, `?pos=x,z`, `?time=0.9`,
`?quality=baixa|media|alta`, `?flags=a,b`, `?pinceso` (Pinceso já acompanha), `?color` (todas as regiões coloridas).
`window.__game` expõe o objeto `game` para testes.

## Arquivos e donos

| Pasta | Arquivo de entrada | Exporta |
|---|---|---|
| `src/core/` | bus, state, input, interact, util, materials, eyes | (já prontos — não mudar a API; pode corrigir bugs) |
| `src/data/` | `worldmap.js`, `story.js` | dados puros (sem Three.js) |
| `src/render/` | `render.js` | `createRender(game, rootEl)` |
| `src/world/` | `world.js` | `createWorld(game)` |
| `src/player/` | `player.js`, `camera.js` | `createPlayer(game)`, `createCameraRig(game)` |
| `src/pinceso/` | `pinceso.js` | `createPinceso(game)` |
| `src/npcs/` | `npcs.js` | `createNPCs(game)` |
| `src/missions/` | `missions.js` | `createMissions(game)` |
| `src/ui/` + `css/style.css` | `ui.js` | `createUI(game, rootEl)` |
| `src/audio/` | `audio.js` | `createAudio(game)` |
| `src/main.js` | — | monta tudo e roda o loop (ver o arquivo; é a referência da ordem de chamadas) |

Cada pasta pode ter quantos arquivos internos quiser. Importar de outra pasta **só** `src/core/*` e `src/data/*`;
a comunicação entre sistemas é pelo objeto `game` (ex.: `game.world.getHeight`) e pelo `game.bus`.
Sistemas criados depois (ex.: `game.missions`) devem ser acessados de forma preguiçosa (no `update`, não no `create`).

## Objeto `game`

```
game = {
  THREE, debug, params, bus, state, interactables, findables:Set<() => [{x,y,z,kind}]>,
  paused, cinematic, time:{elapsed},
  ui, audio, render, input, world, player, cameraRig, pinceso, npcs, missions
}
```
- `game.paused`: menus/pausa abertos → mundo congelado (main não chama update dos sistemas, só ui/cameraRig/render).
- `game.cinematic`: cenas → jogador ignora input; `cameraRig` segue o alvo de cena.
- `game.input.enabled = false` enquanto diálogos/overlays capturam o teclado (a UI cuida disso).

## Escala e coordenadas

- Y para cima. **Norte = -Z**. Unidade ≈ 1 metro. Quim tem ~1,25 de altura; Pinceso ~0,3.
- Mundo: x,z ∈ [-320, 320]. Bordas: montanhas suaves/penhascos com nuvens + barreira invisível (raio jogável ~300).
- Velocidades da Quim: andar 4,5 · correr 8 · pulo ~1,6 de altura · planar cai a ~1,5/s.
- Dia completo = 10 min reais. `dayTime` 0..1: 0.25 nascer do sol, 0.5 meio-dia, 0.75 pôr do sol, noite ≈ [0.8, 0.2].

## Layout fixo das regiões (centros não mudam)

| id | Nome | Centro (x,z) | Raio | Altura base | Papel |
|---|---|---|---|---|---|
| `campo` | Campo das Pétalas | (0, 165) | 95 | 0 | Início. Casa da Quim no sul (~0, 225) |
| `vila` | Vila Piscadela | (0, 20) | 70 | 2 | Centro, cruzamento de caminhos |
| `ninhal` | Ninhal Cantante | (-180, -10) | 100 | 4 | Oeste. Árvores gigantes, plataformas, Ninho-Coreto |
| `bosque` | Bosque Açucarado | (180, 50) | 95 | 1 | Leste. Árvores de algodão-doce, jujubas |
| `cidade` | Cidade Cílios | (0, -160) | 85 | 6 | Norte. Praça, fonte, lojas, Cafeteria Nuvem de Leite |
| `pico` | Pico Pestana | (175, -215) | 75 | 30 | Nordeste, alto. Final (bando do Pinceso). Bloqueado por névoa/vento até a história liberar |

## Dados — `src/data/worldmap.js`

```js
export const WORLD = { half: 320, playRadius: 300, seaLevel: -3 };
export const SPAWN = { x, z, rotY };                       // perto da casa da Quim
export const REGIONS = [{ id, name, center:{x,z}, radius, baseHeight,
   palette:{ ground:'#hex', ground2:'#hex', path:'#hex', accents:['#hex',...], fog:'#hex' },
   music:'campo'|'vila'|'ninhal'|'bosque'|'cidade'|'pico', description, flavor:[...frases do lugar] }];
export const PATHS = [{ id, from, to, width, points:[[x,z],...] }];   // trilhas (terreno achatado e colorido)
export const LANDMARKS = [{ id, region, type, name?, x, z, rotY?, scale?, data? }];
export const PLATFORMS = [{ id, region, type, x, y, z, radius?, w?, d?, rotY?, bounce? }]; // superfícies elevadas andáveis
export const WATER = [{ id, region, type:'lago'|'rio'|'fonte', x, z, radius?, points? }];
export const JUJUBA_SPOTS = [{ id, region, x, z, y? /*altura absoluta se em plataforma*/, color, hidden? }];
export const GATES = [{ id, x, z, radius, requiresFlag, message }];  // bloqueios suaves (névoa/vento) liberados por flag
export const SCATTER = { [regionId]: { trees, flowers, rocks, grassDensity, special:[...] } }; // densidades p/ decoração procedural
```
Tipos de `LANDMARKS.type` que o `world` sabe construir (pode criar mais e documentar em `docs/mapa.md`):
`casa_quim, casa, cafeteria, loja_acessorios, fonte, praca, ponte, placa, banco, poste, moinho, horta, jardim,
arvore_gigante, ninho_coreto, casinha_passaro, ninho, cata_vento, arvore_algodao, pirulito_gigante, cogumelo,
flor_gigante, torre_relogio, mirante, portal_nuvem, rocha, cerca, poço, coreto, estatua_olho`.
`PLATFORMS.type`: `folha` (balança), `galho`, `ninho_trampolim` (bounce), `ponte_cipo`, `pedra`, `nuvem`, `escada`.

## Dados — `src/data/story.js`

```js
export const CAST = { quim:{ name:'Quim', voice:{pitch,speed,timbre} }, pinceso:{...}, ... };
export const NPCS = [{ id, name, region, x, z, rotY, species:'humano'|'coruja'|'passaro'|'pombo'|'gato'|'coelho'|...,
   look:{ body:'#hex', hair?:'#hex', hairStyle?, outfit:'#hex', accessory?, size }, voice:{ pitch, speed },
   wander:raio, idleLines:[...], nightPos?:{x,z}, showAfterFlag?, hideAfterFlag? }];
export const MISSIONS = [{ id, region, title, summary, main:bool, giver:npcId|null,
   requires:{ missions?:[ids], flags?:[...] }, autoStart?:bool,
   rewards:{ jujubas?, accessory?, drink?, color?:0..1 /*quanto colore a região*/, flag? },
   steps:[ Step ], completeLines?:[Line] }];
export const DRINKS = [{ id, name, price, description, color }];
export const ACCESSORIES = [{ id, name, price, description, shop:bool }];
export const PROLOGUE = [Line|CameraBeat], ENDING = [...];
export const TIPS = ['dicas para a tela de carregamento'];
// Line = { speaker: 'quim'|'pinceso'|npcId|'narrador', text, mood?:'feliz'|'surpresa'|'triste'|'curiosa' }
```
IDs fixos de acessórios: `laco, chapeu, oculos, tiara_penas, coroa_flores, cachecol`.
IDs fixos de bebidas: `latte_morango, chocolate_nuvem, latte_mel_semente, cha_lavanda, soda_jujuba`.

### Tipos de passo de missão (`Step`) — o sistema de missões implementa todos
- `{ type:'talk', npc, lines }` — falar com um NPC (tecla E nele).
- `{ type:'goto', x, z, radius, label, lines? }` — chegar a um lugar.
- `{ type:'collect', item, spots:[{id,x,z,y?}], count, fragile?, deliverTo?, lines? }` — pegar itens no mundo.
  `fragile`: se a Quim correr carregando, o item balança; se balançar demais, volta ao lugar original.
- `{ type:'deliver', npc, item, lines }` — entregar itens coletados.
- `{ type:'interact', target:landmarkId|{x,z}, label, lines }` — interagir com um objeto.
- `{ type:'follow_trail', spots:[{x,z,y?}], item:'pena_verde', lines }` — seguir pistas em sequência.
- `{ type:'minigame', kind:'coral'|'penas_vento'|'regar', params }`.
- `{ type:'night', lines? }` — esperar a noite (a Quim pode dormir num banco/casa para pular o tempo).
- `{ type:'cafe', lines? }` — sentar na cafeteria e pedir uma bebida.
- `{ type:'cutscene', lines, camera?:{x,y,z,lookX,lookY,lookZ} }`.
- `{ type:'pinceso_join' }` — Pinceso passa a acompanhar (state.pincesoJoined = true).
- `{ type:'set_flag', flag }`.
Cada passo pode ter `hint` (texto do HUD) e `marker:{x,z}` (onde o marcador do minimapa aponta).

Itens que o `world.spawnProp` sabe criar: `flor_murcha, flor, ovo, pena, pena_verde, graveto, folha, carta,
jujuba, semente, regador, cipo_prisao, gato, broto`.

## APIs dos sistemas

### render — `createRender(game, rootEl)`
```
{ renderer, scene, camera, composer, sun, dayTime (get/set 0..1), update(dt), render(),
  setQuality('baixa'|'media'|'alta'), isNight(), timePhase(): 'amanhecer'|'dia'|'entardecer'|'noite',
  skipTo(dayTime, seconds=3) -> Promise (passagem rápida de tempo), setMenuMode(bool), warmup() -> Promise,
  shadowTarget: Vector3 (a luz do sol segue esse ponto; o player atualiza) }
```
Emite `bus 'time:phase'` ao mudar de fase. Renderer: sombras PCFSoft, ACES, sRGB, céu em gradiente com sol,
lua, estrelas e nuvens (com olhinhos!), névoa colorida que acompanha o céu, pós-processamento
(bloom suave; SSAO/GTAO em `alta`; vinheta + grade de cor pastel). `resize` automático.

### world — `createWorld(game)`
```
{ async build(onProgress(p0..1, texto)), applyState(), update(dt), regionIds(),
  getHeight(x,z), groundAt(x,z,yAtual) -> { y, surface:null|platform, bounce? }   // maior superfície andável ≤ yAtual+0.6
  resolveCollision(pos:Vector3, radius) // empurra para fora de colisores (troncos, casas, rochas, bordas)
                                        // 3º arg opcional quiet=true: ignora a névoa dos gates e não faz respingo/aviso/rajada (câmera, moradores)
  regionAt(x,z) -> regionId|null, landmark(id) -> {x,y,z,obj}, 
  setRegionColor(regionId, t, animate=true), spawnProp(type, opts) -> Object3D (já na cena),
  removeProp(obj), isWater(x,z), gateBlocked(x,z) -> gate|null }
```
Emite `bus 'region:enter' {id, name}` quando a Quim entra numa região (ui mostra o nome).
Usa `toon(cor,{region})` para cenário (cor desbotada até a missão colorir) e `createEyes`+`registerEyes` em
casas, flores gigantes, nuvens, ninhos, xícaras etc. Chama `updateEyes(dt, posQuim, posQuim, g => sono da região)`.
Grama instanciada balançando ao vento (shader), flores, árvores, partículas (pétalas, plumas, vaga-lumes à noite),
água animada. Coleta de jujubas espalhadas: o world cria as jujubas de `JUJUBA_SPOTS` (não coletadas),
detecta a Quim por proximidade, marca `state.collected[id]`, soma `state.jujubas`, emite `bus 'jujuba:collect'`.
Registra um provedor em `game.findables` para as jujubas restantes.

### player — `createPlayer(game)` e `createCameraRig(game)`
```
player = { object, position:Vector3, velocity:Vector3, rotY, onGround, state:'idle'|'walk'|'run'|'jump'|'glide'|'sit'|'talk',
  update(dt), applyState(), teleport(x,z,rotY?), setAccessory(id|null), setMood('feliz'|'surpresa'|'triste'|'curiosa'|'sono'),
  carry(obj|null), get carrying, sitAt(pos, rotY) / standUp(), lookAt(worldPos|null), emote('acenar'|'pular_feliz'|'cheirar') }
cameraRig = { update(dt), snap(), setCinematic({x,y,z,lookX,lookY,lookZ}|null, seconds), shake(amount) }
```
Controles: WASD/setas (relativo à câmera), Shift correr, Espaço pular (segurar no ar = planar, só se
`state.pincesoJoined`), E interagir (usa `game.interactables.nearest(position)` e `game.ui.setPrompt`),
mouse gira a câmera (pointer lock ou arrastar), roda = zoom. Câmera 3ª pessoa suave com colisão no terreno.
Quim: menina pequena, cabelo cacheado volumoso (cachos com física simples), cílios grandes, olhos enormes,
squash & stretch, expressões. Sons via `game.audio.quimVoice(...)` (hmm parado, uii no pulo, risadinha).
Fica com sono se parada ~20 s (boceja, senta). Atualiza `game.render.shadowTarget`.
Emite `bus 'player:jump'`, `'player:land'`.

### pinceso — `createPinceso(game)`
```
{ object, mode, update(dt), applyState(), setMode('hidden'|'trapped'|'fleeing'|'perched'|'follow'|'scripted', opts),
  flyTo(pos, seconds?) -> Promise, join(), search(), emote(icon:'❤'|'❗'|'🍬'|'💤'|'♪') }
```
Periquito verde-limão redondinho, bochechas rosadas, topete arrepiado, olhos grandes. Depois de `join()`:
pousa na cabeça da Quim andando, voa ao lado ao correr, ajuda a planar (segura o cabelo), Q = Voo de Busca
(voa até o findable mais próximo e mostra ícone), cochila/arruma os cachos se a Quim fica parada,
imita murmurinhos (`game.audio.pincesoVoice`). Nunca atravessa o chão (usa `world.getHeight`).

### npcs — `createNPCs(game)`
```
{ list, get(id), update(dt), applyState(), setMarker(id, '!'|'?'|'♥'|null), moveTo(id,x,z) -> Promise,
  setVisible(id,bool), face(id, worldPos), speak(lines) -> Promise (=game.ui.dialogue com vozes) }
```
Moradores fofos com olhos grandes, felizes; acenam quando a Quim passa, alguns a seguem um pouco, dançam se
ela pular perto. Ao interagir (E): `await game.missions.onTalk(npcId)`; se retornar false, fala uma `idleLines`.

### missions — `createMissions(game)`
```
{ update(dt), applyState(), playPrologue(), onTalk(npcId) -> Promise<bool>, start(id), complete(id),
  status(id), list(), tracked() -> {mission, step}|null, track(id), markerTarget() -> {x,y,z}|null }
```
Interpreta `MISSIONS` (todos os tipos de passo), cria/remove props de missão, registra interactables,
dá recompensas (jujubas, acessórios, bebidas, `world.setRegionColor` progressivo, flags), marca NPCs com
`!`/`♥`, registra findables dos itens de missão, cuida da cafeteria (interactable que abre `ui.openCafe`)
e da loja (`ui.openShop`), do prólogo e do final. Emite `mission:start`, `mission:step`, `mission:complete`.

### ui — `createUI(game, rootEl)`
```
{ attachInput(input), update(dt), showLoading(p, texto), hideLoading(), showMenu({hasSave}) -> Promise<'new'|'continue'>,
  dialogue(lines) -> Promise, choice(pergunta, opcoes) -> Promise<index>, toast(texto, icone?), setPrompt(texto|null),
  banner(titulo, subtitulo), missionComplete(mission), regionTitle(nome),
  openMap(), openDiary(), openPause(), openCafe(drinks) -> Promise<drinkId|null>, openShop(items) -> Promise,
  minigameCoral({ rounds }) -> Promise<bool>, fade(paraPreto, ms) -> Promise, isBlocking() }
```
DOM + CSS (`css/style.css`), visual fofo e arredondado (fonte do Google Fonts permitida: ex. "Baloo 2"/"Fredoka").
HUD: jujubas, missão rastreada + dica, minimapa circular (canvas 2D desenhando REGIONS/PATHS/LANDMARKS/água,
seta da Quim, marcador da missão, nome da região). Mapa completo (M) com regiões nomeadas, regiões não
descobertas cobertas por "nuvem", ícones de NPCs com missão. Diário (Tab) com missões e adesivos.
Pausa (Esc): Continuar, Opções (volume música/efeitos, qualidade gráfica), Voltar ao menu.
Diálogo: caixa arredondada, nome do personagem, texto letra a letra sincronizado com `game.audio.murmur`.
Enquanto overlay/diálogo aberto: `game.input.enabled=false`; mapa/diário/pausa também `game.paused=true`.

### audio — `createAudio(game)`
```
{ init() (após gesto do usuário; pode ser chamado várias vezes), setVolumes({music,sfx}), update(dt),
  play(nome), murmur(voice{pitch,speed,timbre}, char), quimVoice('hmm'|'uii'|'risadinha'|'bocejo'|'oh'|'eba'),
  pincesoVoice('piu'|'piui'|'feliz'|'sono'|'alerta'), setMusic(id|null), note(i0..4) }
```
Tudo Web Audio API. Efeitos: `pulo, aterrissar, passo, coleta, jujuba, missao, dialogo, clique, mover, brilho,
piado, ovo, agua, porta, moeda, cor`. Música procedural suave por região + `menu`, `cafe` (lo-fi), `noite`.

## Eventos do `bus`
`session:start, region:enter, time:phase, player:jump, player:land, jujuba:collect, item:collect,
mission:start, mission:step, mission:complete, color:restore {region,t}, pinceso:joined, dialogue:open, dialogue:close`.
