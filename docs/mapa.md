# Mundo Olhos — Mapa do mundo aberto

Fonte de verdade: `src/data/worldmap.js` (dados puros). Este documento explica o desenho do mapa, as
regras de terreno que o `world` precisa respeitar, as rotas de plataformas e os pontos que a história usa.
Para ver o mapa de cima: abra `tests/mapa.html` num servidor local.

## 1. Visão geral

Um reino redondo de ~600 m de diâmetro (raio jogável 300), cercado por montanhas macias com nuvens.
O jogo começa no **sul** (casa da Quim) e o final fica no **nordeste**, no topo do Pico Pestana, que dá para
ver de quase qualquer lugar. O **Rio Bocejo** desce do Pico, passa pela Cidade e pela Vila e termina no lago
do Campo: seguindo o rio, a Quim sempre volta para casa.

```
                N (-Z)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^                ^^^^^^^^^^^^^^^^^^^^^^^^^^^^
^^^^^^^^^^^^^^^^^^^^^^                            ^^^^^^^^^^^^^^^^^^^^^^
^^^^^^^^^^^^^^^^^^                                ,,,,^^^^^^^^^^^^^^^^^^
^^^^^^^^^^^^^^^                  ,,,,,,          ,,,,,,,,^^^^^^^^^^^^^^^
^^^^^^^^^^^^                 ,,,,,,,,,,,,,,     ,,,==,,X,,,,^^^^^^^^^^^^   PICO PESTANA
^^^^^^^^^^                  ,,,,,,,,,,,,,,,,    ,,,==V=,,B,,,,^^^^^^^^^^   (serpentina)
^^^^^^^^                   ,,,,,,,,,T,,,,=======N=,=====,,,,,,,,^^^^^^^^
^^^^^^^   CIDADE CÍLIOS   ,::======,,=====,,,,   =====,,,,,,,,,,,^^^^^^^
^^^^^                   ::::,,,,L,,~F,,C,,,,,,     ======,~~,,,    ^^^^^
^^^^                 :::: ,,,,,,,,,,====,,,,,,      ~~~~~~,         ^^^^
^^^                :::     ,,,,,,,,,=,,=::,,,~~~~~~~~                ^^^
^^          ,,,,,::         ,,,,,,,,=,,,,:H~~~                        ^^
^^     ,,,,,,,,,::,,,         ,,,,,,=,,,~~~::::                       ^^
^    ,,,,,,,,,,:,,,,,,,,           =  ~~      :::                      ^
^   ,,,,,,,,,,a,,,,,,,,,,          =~~~          :::                   ^
   ,,,,,,,,,,,,,a,,,,,,,,,      ,,,~H,,,           ::: ,,,,,,
   ,,,,,,,,A,,,,,,,,,,,,,,    ,,,~~,=,,,,,         ,,::,,,,,,,,,,
  ,,,,,,,,,,,,,,============,,,,~~,,=,,,,G,,     ,,,,,::,,,,,,,,,,,
O  ,,,,,O,,,,,,,,,,,,,,,,, ====H~===K,,,,,,,   ,,,,,,,,,:=======,,,,      L
   ,,,,,,,,,,,,,,,,,,,U,,,  ,,,~,,,,=,=======  ,,,,,,,,==,,,,,,==,,,,
    ,,,~~,,,,,,,,,c,,,,,,   ,,,~,,,,=,,,,,,,==========,==,P,,,,,=,,,,
^     ,~~,,,,,,,,,,,,:,      ,,,~,,,=,,,,,,   ,,,,,,,,==========,,,,,  ^
^ NINHAL CANTANTE ,,,::        ,~,,,=,,,,      ,,==,,D,,,,,,~~~,,,,,,  ^
^^                    ::     ,,,~,,,=,,,,,,   ====,,,,,,,,,,~~~~,,,,  ^^
^^      VILA PISCADELA ::: ,,,~~~,,,==,,,,,,===  BOSQUE AÇUCARADO     ^^
^^^                      ::,,~~~~~,,==,,====,,     ,,,,,,,,,,,,,,    ^^^
^^^^                     ,:::~~~~~,,=====,,,,,,        ,,,,,,       ^^^^
^^^^^                    ,,,::,,,,,,=,,,,,,,,,,                    ^^^^^
^^^^^^^                  ,,,,,,,,*,==,,,,,,,,,,                  ^^^^^^^
^^^^^^^^                 ,,,,,,,,,,==,,J,,,M,,,                 ^^^^^^^^
^^^^^^^^^^                ,,,,,,,,,,@,,,,,,,,,                ^^^^^^^^^^
^^^^^^^^^^^^               ,,,,,,,,,Q,,,,,,,,               ^^^^^^^^^^^^
^^^^^^^^^^^^^^^              ,,,,,,,,,,,,,,              ^^^^^^^^^^^^^^^
^^^^^^^^^^^^^^^^^^   CAMPO DAS PÉTALAS  ,,,,              ^^^^^^^^^^^^^^^^^
^^^^^^^^^^^^^^^^^^^^^^                            ^^^^^^^^^^^^^^^^^^^^^^
^^^^^^^^^^^^^^^^^^^^^^^^^^^^                ^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                S (+Z)            (1 caractere ≈ 8 m × 17 m; gerado a partir do worldmap.js)
```

Legenda: `,` região · `=` estrada/trilha · `:` atalho secreto · `~` água (rio, lagos) · `^` fora do mundo ·
`Q` casa da Quim · `@` spawn · `*` Florzona Bocejante · `J` jardim do jardineiro · `M` Moinho Cata-Pétala ·
`K` coreto da Vila · `G` Casa do Telhado Alto (gato) · `H` ponte · `a` árvores da subida · `A` Árvore-Mãe + Ninho-Coreto ·
`O` árvore da Dona Plumínia · `U` pombal do Piu · `c` Árvore-Café · `P` Pirulito Gigante · `D` Cabana da Confeiteira ·
`F` fonte · `C` Cafeteria · `L` Loja de Acessórios · `T` Torre do Relógio · `N` Portal da Névoa · `V` Mirante ·
`B` Árvore do Bando · `X` Pedra do Bocejo.

### Marcos visíveis de longe (orientação)
| Marco | Onde | Por que se vê de longe |
|---|---|---|
| Pico Pestana | nordeste, platô em y=30 | a coisa mais alta do mundo, sempre no horizonte |
| Ninho-Coreto na Árvore-Mãe | Ninhal (-205, -30), y=34 | copa gigante com um coreto em cima |
| Torre do Relógio | Cidade (0, -192), 15 m acima da praça (que já fica a y=6) | relógio que pisca a cada hora |
| Pirulito Gigante | Bosque (188, 38), ~22 m | espiral colorida girando |
| Moinho Cata-Pétala | Campo (60, 196), em colina | pás girando devagar |
| Florzona Bocejante | Campo (-24, 170), ~16 m | flor gigante que boceja; primeira coisa que a Quim vê |
| Cascata do Bocejo | encosta sul do Pico (187, -155) | queda d'água branca visível da Cidade |

## 2. Convenções dos dados

- Y para cima, **norte = -Z**, 1 unidade ≈ 1 m. Ângulos de `polar()` no arquivo: 0° = leste, 90° = sul.
- `rotY` segue o Three.js: a frente do modelo é o +Z local. `rotY = 0` olha para o sul; `rotY = PI` para o norte.
  A função exportada `face(x, z, alvoX, alvoZ)` dá o `rotY` que vira a frente para um alvo (casas olham para a rua,
  bancos olham para a fonte etc.).
- `PLATFORMS.y` = altura absoluta do **topo andável**. Plataformas circulares usam `radius`; retangulares
  (`ponte_cipo`) usam `w` (largura, eixo X local), `d` (comprimento, eixo Z local) e `rotY`.
- `JUJUBA_SPOTS.y` (quando existe) = topo da plataforma onde ela está. O world soma a mesma flutuação que usa no chão.
- Ponto sem `y` = no chão (`world.getHeight`).

### Campos extras (opcionais, além do contrato)
| Onde | Campo | Uso |
|---|---|---|
| `PATHS` | `name`, `secret: true` | nome para o mapa; trilha secreta = estreita e apagadinha, o minimapa só mostra depois de pisar nela |
| `WATER` | `name`, `width` (rio), `data.calda`, `data.cor`, `data.cascata` | rio tem largura 5; o laguinho do Bosque é de calda rosa |
| `LANDMARKS.data` | `marco`, `cor`, `telhado`, `loja`, `estilo`, `trunkRadius`, `height`, `y`, `sobre`, `roofY`... | detalhes de construção (ver seção 8) |
| `PLATFORMS` | `route`, `look` | `route` agrupa a rota na ordem de subida; `look:'cogumelo'` = trampolim com cara de cogumelo de marshmallow |
| `SCATTER` | `treeKind`, chave `transicao` | tipo de árvore do bioma; `transicao` = campos entre regiões |
| export `SPOTS` | — | coordenadas nomeadas para a história (seção 7) |
| export `face` | — | utilitário de rotação |

## 3. Terreno (o world deve respeitar)

As plataformas, jujubas e pontos de história foram calculados com estas regras:

```
base(x,z)  = mistura suave das baseHeight das regiões (o Pico entra como 6, o pé do cone)
             q_i = d_i / raio_i                            d_i = distância ao centro da região i
             w_i = exp(-2 · q_i^4) + 0,05 · exp(-q_i^2)    (o 2º termo só pesa longe dos centros)
             B   = Σ w_i·base_i / Σ w_i                    (até ~0,7·raio, B ≈ baseHeight da região)
ruido(x,z) = 1,5 · fbm(x/45, z/45, 3)                      (core/util.js → fbm; faixa ±1,5)
             (+ colinas largas opcionais, ±2,2 · fbm(x/140, z/140, 2); também × máscara)
mascara    = 0 (terreno plano em B) em:
             · trilhas: até largura/2 + 3
             · landmarks no chão: até pegada·escala + 3
             · plataformas baixas (y − base < 3): até raio + 4
             · margens de água: até 6
             e sobe suave até 1 fora disso
h(x,z)     = B + ruido · mascara
Pico:      d = distância a (175, −215)
           h = max(h, 6 + 24 · clamp((75 − d) / 47, 0, 1))   → cone; platô plano y = 30 para d ≤ 28
           (sem ruído no platô; ruído ±0,8 na encosta)
Borda:     depois do raio 300, montanhas fofas sobem (barreira invisível em 300)
Água:      lagos: superfície = base − 0,6, fundo = base − 2,5, margem rampa em ~5 m
           rio: canal 1,6 abaixo do terreno ao redor, superfície 0,7 abaixo da margem; desce em cascata
           entre a nascente (194, −163, y≈16) e (160, −139, y≈6). Altura da margem nos vértices do rio:
           B (ou o cone, só onde d < 75 do Pico), sempre descendo rio abaixo — nunca acima do chão em volta.
           fonte: bacia elevada, água em base + 0,8
```

**Por que o 2º termo em `w_i`:** só com `exp(-2·q^4)`, longe de todos os centros os pesos normalizados trocam de
região em poucos metros e a base vira um paredão (ex.: 5 m de queda em 6 m na Trilha do Riacho, entre a Cidade
e o Bosque). Com o termo macio a base nunca passa de ~23% de inclinação e o interior das regiões continua plano
(as cores podem continuar usando só o termo de 4ª potência).

Garantias usadas no desenho: o primeiro degrau de cada rota fica em `base + 0,9` (sobe com um pulo de 1,6
mesmo com a máscara imperfeita); as pedras do lago ficam entre y 0,35 e 0,85 (acima da água do Campo, em −0,6).
O platô do Pico tem a Pedra do Bocejo e os ninhos do bando em y = 30.

## 4. Regiões

### Campo das Pétalas — início (centro 0,165 · raio 95 · base 0)
Colinas de flores que bocejam. A Quim acorda em casa, no sul, olhando para o norte: vê a Florzona, o moinho,
os telhados da Vila e, longe, a Torre do Relógio e o Pico.
- `casa_quim` (0, 232) olhando para o norte · `SPAWN` (0, 214) · `caixa_correio_quim` (-6, 221) · `banco_quim` (8, 222)
  · `jardim_quim` (15, 236) · `placa_quim` (-6, 212) "cuidado: cachinhos à solta!"
- `florzona` (-24, 170) · `moinho_petalas` (60, 196) · `casa_jardineiro` (44, 172) · `jardim_jardineiro` (26, 192)
- `lago_espelhinho` (-35, 132) r18 com pedras até a **ilhota** · `banco_lago` (-12, 140) · `placa_lago`
- `placa_campo` (14, 152): encruzilhada (Vila ao norte, Bosque pela Trilha das Formiguinhas)
- Segredo: `pedra_olhuda` (-45, 240) com jujuba escondida; Atalho das Raízes chega em (-55, 158).

### Vila Piscadela — cruzamento (centro 0,20 · raio 70 · base 2)
Pracinha redonda com o Coreto Cantarolante; as quatro estradas saem dela. O rio corta o lado oeste
(Ponte do Piscar Lento) e o norte (Ponte do Bocejo).
- `praca_vila` + `coreto_vila` (5, 15) · `placa_vila` (-6, 0) com as quatro direções · `poco_vila` (22, 32)
- `padaria_vila` (24, -10) · `correio_vila` (22, -32) · `caixa_correio_vila` (9, -24)
- `casa_gato` (46, -6): 2 andares, **terraço plano em y = 9,5** (`data.roofY`), escadinha de caixotes no lado oeste
- casas: `casa_rosa` (28, 46), `casa_menta` (-16, 42), `casa_bolinha` (42, -34), `casa_azul` (-15, -48),
  `casa_cogumelo` (-55, -18), `casa_lavanda` (-52, 34), `casa_sol` (56, 50), `celeiro_vila` (26, 76)
- hortas: `horta_vila_1` (-12, -8), `horta_vila_2` (-60, 16), `horta_vila_3` (40, 64) · `banco_rio_vila` (-22, 26)

### Ninhal Cantante — oeste, vertical (centro -180,-10 · raio 100 · base 4)
Floresta de árvores gigantes. A Trilha dos Piados chega na **Clareira Cantante** (-168, -8), de onde se vê a
Árvore-Mãe com o Ninho-Coreto lá em cima e a placa "pula, pula, pula!" ao pé da Árvore Primeiro-Degrau.
- `arvore_mae` (-205, -30) tronco r5, 30 m · `ninho_coreto` em y = 34 (r 7, entrada virada para 190°)
- `arvore_subida` (-160, -38) · `arvore_ponte` (-182, -55) — as três formam a rota até o coreto (seção 6)
- `arvore_coruja` (-228, 8): casa da Dona Plumínia, **oco em y = 12,6** voltado para o nordeste (`data.oco.angulo` 308°,
  exatamente onde termina a escadinha de galhos e fica a plataforma `oco_coruja`)
- `casa_piu` (-112, 20): pombal do Piu (Correio Aéreo), perto da trilha, primeira coisa do Ninhal · `caixa_correio_piu` (-104, 10)
- `arvore_cafe` (-145, 42): Árvore-Café dos Passarinhos (xicrinhas penduradas)
- `arvore_trio` (-120, -50) + `ninho_trio` (y 8): Tico-Teco-Tuco
- `arvore_casal` (-252, -18) + `ninho_casal` (y 9, em obras): Casa Nova
- `ninho_mamae` (-195, 35): ninho grande no chão para os Ovinhos Perdidos
- Coral: 5 cogumelos-nota `coral_nota_1..5` em arco em volta de (-182, 2)
- `cata_vento_ninhal` (-232, -56): clareira do Penas ao Vento · `rocha_pinceso` (-172, -93): onde o Pinceso pousa
- `banheira_passaros` (-232, 52): laguinho redondo
- **Clareira da Casinha Asas de Saudade** (`SPOTS.asas_de_saudade`, centro (-176, 72), raio 12): reservada e vazia
  (nenhum landmark, plataforma, jujuba, item ou morador dentro), a 52 m da trilha mais próxima. Chega-se pela
  **Trilhinha das Flores Azuis** (`trilha_asas`, secreta, largura 1,8), que sai de trás da Árvore-Café (-149, 53) e
  entra na clareira pela borda leste (-166, 71). Detalhes da casinha: `docs/casinha-asas-de-saudade.md`.

### Bosque Açucarado — leste, jujubas (centro 180,50 · raio 95 · base 1)
Algodão-doce, marshmallow e calda. A Volta do Pirulito (trilha em anel) dá a volta no Pirulito Gigante e é
coberta de jujubas.
- `pirulito_gigante` (188, 38) · `casa_doceira` (148, 80) · `laguinho_calda` (215, 92) r12 · `banco_calda` (199, 92)
- 10 algodões grandes `algodao_1..10`, 5 cogumelos de marshmallow, 3 pirulitos menores, `gelatina_olhuda` (246, 74)
- Segredo: **Nuvem do Tesouro** (223, y 12,6, 38) via cogumelo-trampolim em (208, 30)
- Atalho secreto Trilha do Riacho chega pelo norte em (172, 8).

### Cidade Cílios — norte, lojas (centro 0,-160 · raio 85 · base 6)
Praça redonda com a fonte no centro; prédios em anel olhando para ela. Ruas saem nos ângulos diagonais.
- `praca_cilios` + `fonte` (0, -160) · 4 bancos em volta da fonte (`banco_fonte_1..4`, raio 10)
- **`cafeteria`** (30, -160) a leste, de frente para a fonte · **`loja_acessorios`** (-30, -160) a oeste, de frente para a fonte
- `torre_relogio` (0, -192) com escadaria externa e terraço em y = 21 · `estatua_olho_cidade` (-14, -147)
- lojas/prédios: `doceria` (-23, -140), `livraria` (-12, -130), `floricultura` (-40, -196), `correio_central` (40, -198),
  `prefeitura` (0, -226), `casa_cidade_1..8`
- `rua_canal` desce até o **Cais** (40, -120) e o `banco_cais`; a Ponte de Troncos (57.8, -103.8) é o começo secreto
  da Trilha do Riacho. `rua_oeste` leva ao começo do Atalho do Cipó (-62, -170).
- `placa_pico` (50, -178): "Pico Pestana ↗ (só com vento a favor)".

### Pico Pestana — final (centro 175,-215 · raio 75 · platô y = 30)
Coberto por uma névoa sonolenta (`GATE nevoa_pico`, raio 64) até a flag `pico_liberado`. A Estrada do Vento sai da
Cidade e para no `portal_nevoa` (102.4, -198.2), no pé do cone (r 74,5, y ≈ 6,3, a mesma altura da estrada: sem degrau).
Depois, a **Serpentina da Pestana** sobe a face sudoeste em 3 grampos até o platô: ~5% nos trechos retos, ~16% na
primeira rampa e até ~30% nas curvas dos grampos (num cone de 51% toda curva fechada sobe ~1/3 do que anda).
- `mirante_pico` (148.9, -208) na borda do platô, olhando para o reino · `banco_mirante` · `placa_mirante`
- `arvore_bando` (180, -216) e 5 `ninho_bando_1..5` em volta (raio 9,5): o bando do Pinceso
- `pedra_bocejo` (160, -222): coluna de pedra com pedras em espiral até o cume (y 38,6) — o ponto mais alto do jogo
- `olho_do_pico` (186, -198): estátua de olho gigante · `cachoeira_pico` (187, -155): Cascata do Bocejo
- Como o lado nordeste do Pico passa da borda do mundo, tudo que é jogável fica na metade sudoeste do platô
  (distância à origem ≤ 290).

## 5. Caminhos

| id | Nome | Liga | Largura | Observação |
|---|---|---|---|---|
| `estrada_campo_vila` | Estrada das Pétalas | casa da Quim → pracinha | 4,5 | S-suave passando pela Florzona e pela encruzilhada |
| `estrada_vila_cidade` | Estrada do Bocejo | pracinha → praça | 4,5 | cruza o rio na `ponte_bocejo` (0, -42); sobe de 2 para 6 |
| `trilha_vila_ninhal` | Trilha dos Piados | pracinha → Clareira Cantante | 3,5 | cruza o rio na `ponte_piscar` (-35, 6) |
| `trilha_vila_bosque` | Trilha do Açúcar | pracinha → Clareira do Pirulito | 3,5 | o chão vai ficando rosa |
| `estrada_cidade_pico` | Estrada do Vento | praça → Portal da Névoa | 4 | |
| `serpentina_pico` | Serpentina da Pestana | portal → platô | 4 | 3 grampos; postes-lanterna |
| `trilha_campo_bosque` | Trilha das Formiguinhas | encruzilhada do Campo → Bosque | 3 | |
| `trilha_bosque_doce` | Volta do Pirulito | anel no Bosque | 3 | 12 jujubas no caminho |
| `rua_canal` / `rua_oeste` | Rua do Cais / Rua das Pálpebras | ruas da Cidade | 3 | |
| `atalho_raizes` | Atalho das Raízes (secreto) | Ninhal (-125, 62) → Campo (-55, 158) | 2,4 | corta caminho Ninhal↔Campo sem passar pela Vila |
| `atalho_cipo` | Atalho do Cipó (secreto) | Cidade (-62, -170) → Ninhal (-172, -74) | 2,4 | Ninhal↔Cidade |
| `trilha_riacho` | Trilha do Riacho (secreta) | Cais (40, -120) → Bosque (172, 8) | 2,4 | Ponte de Troncos sobre o rio |
| `trilha_asas` | Trilhinha das Flores Azuis (secreta) | Árvore-Café → clareira da Casinha Asas de Saudade | 1,8 | só flores azuis e brancas na beira |

Postes com cílios são gerados ao longo das estradas principais (32 no total), alternando os lados, só dentro
das regiões e longe de casas e água. Pontes são calculadas no cruzamento exato trilha × rio.

**Tempo de caminhada** (andar 4,5 / correr 8): casa → Vila ~43 s / 24 s; Vila → Cidade ~32 s / 18 s;
Vila → Ninhal ~36 s / 20 s; Vila → Bosque ~35 s / 20 s; Cidade → topo do Pico ~80 s / 44 s.

## 6. Rotas de plataformas

Regras de salto usadas (com folga): subida ≤ 1,3 e vão ≤ 3,2 entre bordas; saindo de trampolim
(`bounce` 2,2) subida ≤ 4,2 e vão ≤ 3,5. Nenhuma plataforma fica embaixo de outra com menos de 3 m livres.

### Subida ao Ninho-Coreto (`route: 'subida_coreto'`, 27 peças, chão y=4 → y=34)
| # | id | tipo | x, y, z | nota |
|---|---|---|---|---|
| 1–10 | `ninhal_s_1..10` | galhos (3, 6 e 8 são folhas que balançam) | espiral em volta da `arvore_subida`, y 4,9 → 14,35 | começa virada para a clareira; `ninhal_s_3` guarda o ovo 4 |
| 11 | `ninhal_ponte_1` | ponte_cipo 2×16,7 | (-170.8, 14.35, -46.4) | primeira ponte de cipó |
| 12 | `ninhal_p_1` | galho | (-178.3, 14.35, -52.1) | na `arvore_ponte` |
| 13 | `ninhal_p_2` | **ninho_trampolim** | (-177.5, 14.35, -56.2) | quica +3,95 |
| 14–17 | `ninhal_p_3..6` | galhos | y 18,3 → 21,45 | espiral horária |
| 18 | `ninhal_ponte_2` | ponte_cipo 2×20,7 | (-193.1, 21.45, -43.2) | ponte longa com vista |
| 19 | `ninhal_m_1` | galho | (-200.7, 21.45, -34.6) | na Árvore-Mãe |
| 20 | `ninhal_m_2` | **ninho_trampolim** | (-198.8, 21.45, -31.3) | quica +3,95 |
| 21–25 | `ninhal_m_3..7` | folhas | y 25,4 → 29,6 | sob o piso do coreto (4,4 m livres) |
| 26 | `ninhal_m_8` | **ninho_trampolim** | (-214.4, 30, -31.7) | para fora da copa, na direção 190° |
| 27 | `ninho_coreto_piso` | galho r7 | (-205, 34, -30) | piso do Ninho-Coreto (30 m acima do chão) |

### Outras rotas
| route | onde | peças | topo | prêmio |
|---|---|---|---|---|
| `oco_coruja` | `arvore_coruja` | 7 galhos + `oco_coruja` | y 12,6 | entrada da casa da Dona Plumínia (Alvorada), 2 jujubas |
| `telhado_gato` | `casa_gato` (Vila) | 6 caixotes (`escada`) + `terraco_gato` | y 9,5 | gato escondido, 3 jujubas |
| `torre_relogio` | Torre do Relógio | 13 degraus + `terraco_torre` r7 | y 21 | Mirante do Relógio, 6 jujubas, vista da Cidade |
| `ilhota_lago` | Lago Espelhinho | 4 pedras + `ilhota_lago` r3,6 | y 0,85 | 4 jujubas no meio do lago |
| `nuvem_tesouro` | Bosque | cogumelo-trampolim + 4 nuvens (uma é trampolim) + `nuvem_tesouro` | y 12,6 | 10 jujubas |
| `cume_bocejo` | Pedra do Bocejo (Pico) | 7 pedras + `cume_bocejo` | y 38,6 | ponto mais alto, 5 jujubas |

## 7. Pontos de história (`SPOTS`)

| Chave | Conteúdo | Missão |
|---|---|---|
| `flores_murchas` | 8 pontos espalhados pelo Campo; entrega no `jardim_jardineiro` | Flores Murchas |
| `regador`, `hortas` | regador (18, 38) e as 3 hortas da Vila | Regar as hortas |
| `gato_telhado`, `gato_pistas` | gato no terraço da `casa_gato` (47.5, 9.5, -7); 3 pistas (pegadinhas) até lá | Achar o gato |
| `carteiro_destinos` | 5 destinos: caixa da Vila, caixa da Quim, casa do jardineiro, correio da Cidade, cabana da Confeiteira | Carteiro Piu / entregar cartas |
| `pinceso_cipo` | (-128, -24): Pinceso preso em cipós, perto da trilha | O Filhote Sem Ninho |
| `penas_verdes` | 6 penas em zigue-zague para o norte, de (-134, -33) até (-162, -86) | O Filhote Sem Ninho |
| `pinceso_pouso` | em cima da Pedra Musguinho (-172, 7.2, -93) | O Filhote Sem Ninho (oferecer jujubas) |
| `ovos`, `ninho_ovos` | 5 ovos (um em cima da folha `ninhal_s_3`, y 7); entrega no `ninho_mamae` | Ovinhos Perdidos |
| `sementes_cafe` | 6 sementes pelo Ninhal; entrega na `arvore_cafe` | Café dos Passarinhos |
| `casa_nova` | 4 gravetos, 3 folhas, 3 flores; ninho no `ninho_casal` | Casa Nova |
| `penas_vento` | clareira do cata-vento (-232, -48) r14 | Penas ao Vento |
| `coral` | centro (-182, 2) e os 5 cogumelos-nota | O Coral da Floresta |
| `oco_coruja`, `coreto_palco` | oco (y 12,6) e piso do Ninho-Coreto (y 34) | Alvorada |
| `bancos_dormir` | 7 bancos onde dá para dormir até a noite/amanhecer | passos `night` |
| `cafeteria_mesa`, `loja_balcao` | (22, -160) e (-22, -160), na frente das portas | cafeteria / loja |
| `mirante`, `bando`, `pico_entrada` | mirante, centro do bando, portal | final |
| `asas_de_saudade` | clareira reservada (-176, 72) r12 + `entrada` | Casinha Asas de Saudade (sem missão) |

### A história no espaço (progressão sugerida)
1. **Campo** (tutorial): casa → Florzona → jardineiro. Primeiras flores recuperam a cor do Campo.
2. **Vila**: chega pela Estrada das Pétalas e vê o coreto. Hortas, gato no telhado, cartas. A placa da pracinha
   aponta para todas as direções: daqui o mundo abre.
3. **Ninhal** (obrigatório): o Pinceso está preso logo no começo da trilha, então ninguém passa reto por ele. As penas
   levam para dentro da floresta, onde a Quim vê a Árvore-Mãe pela primeira vez. Com o Pinceso, ela planeia
   e o Voo de Busca aponta itens no alto (ovo na folha, sementes). A subida ao Ninho-Coreto é o "momento uau" do meio do jogo.
4. **Bosque** e **Cidade** em qualquer ordem: jujubas no Bosque; cafeteria e loja na Cidade. Atalhos secretos ligam
   tudo para quem explora.
5. **Alvorada**: à noite, subir ao oco da coruja; ao amanhecer o concerto no Ninho-Coreto. Do alto do coreto a Quim
   vê a névoa no Pico — gancho natural para `pico_liberado`.
6. **Pico**: serpentina, mirante (vista do reino inteiro colorido), bando na Árvore do Bando. O cume da Pedra do
   Bocejo fica como segredo pós-final.

## 8. Notas para quem constrói (world/ui)

- **Tipos novos de landmark**: `caixa_correio` (caixinha de cartas com olhinhos, ~1,2 m) e `cachoeira` (queda d'água
  entre `data.topoY` e `data.baseY`, decorativa). Se não forem construídos, o mapa continua coerente.
- `arvore_gigante.data`: `trunkRadius` (colisor), `height` (altura do tronco acima do chão), `variante`
  ('cafe' = xicrinhas penduradas, 'retorcida'), `oco:{angulo, y}` (buraco iluminado à noite), `ninhos`, `copa`.
  As plataformas foram calculadas com esses raios: o tronco não pode ser mais grosso que `trunkRadius`.
- `ninho_coreto.data`: `y` = piso (34), `raio` 7, `entrada` = ângulo (190°) onde o parapeito tem a abertura
  para o último trampolim. Copa da Árvore-Mãe em leque **abaixo** do coreto.
- `torre_relogio.data`: corpo com raio ≤ 6 até `terraco.y` = 21; terraço plano r7 no topo (a escadaria fica no raio 8,5).
- `casa_gato.data`: `telhadoPlano: true`, `roofY: 9.5`, `raio: 4.5` — terraço com mureta baixa.
- `rocha` `pedra_bocejo`: coluna de raio 2,8 com topo em `data.topoY` (38,6). `rocha_pinceso`: ~3 m de altura.
- `ninho` com `data.y` + `data.sobre` fica no galho da árvore indicada (não no chão).
- `praca` é piso (decalque); `fonte` e `coreto` ficam no centro da praça de propósito.
- `casa.data`: `cor`, `telhado`, `loja` (padaria, correio, doceria, livraria, floricultura), `estilo`
  ('cogumelo', 'celeiro', 'biscoito', 'prefeitura').
- Pegadas usadas na validação (raio × `scale`): casa 5, casa_quim 6, cafeteria 7, loja 6, torre 5, moinho 5,
  horta 4, jardim 5, coreto 5, mirante 4, rocha 2,5, arvore_algodao 2,5, cogumelo 2, flor_gigante 2, estatua_olho 2,
  poço 1,8, ninho 1,5, banco 1,3, casinha_passaro 1, cata_vento 1, placa 0,6, caixa_correio 0,5, poste 0,4.
  O world pode usar esses raios para colisão e para achatar o terreno.

## 9. Números

- 186 landmarks (Campo 31, Vila 34, Ninhal 36, Bosque 28, Cidade 32, Pico 25), incluindo 32 postes e 3 pontes.
- 75 plataformas em 7 rotas · 14 caminhos (4 secretos) · 5 águas · 1 gate.
- 122 jujubas: Bosque 52, Ninhal 18, Campo 17, Vila 13, Cidade 12, Pico 10 (36 escondidas, 40 em plataformas).

## 10. Validação

`node tests/validate-data.mjs` (sem dependências; sai com código 1 se houver erro) confere mapa e história juntos:
ids únicos; tudo dentro da região declarada e do raio jogável; nada na água (exceto pontes, fonte, praça e jujubas
em plataformas); landmarks sem sobreposição (pegada × 0,9) e fora das trilhas; trilhas só cruzam o rio onde há ponte;
**inclinação da base em cada trilha ≤ 30%** (fórmula da seção 3); serpentina começando no pé do cone e sem trecho
acima de 35%; cada salto das rotas dentro do alcance; 1º degrau ≤ 1,3 acima do chão; nenhuma plataforma enterrada ou
"esmagando" outra; jujubas com `y` em cima de uma plataforma; oco e entrada do Ninho-Coreto apontando para as suas
plataformas; pontos de história fora d'água e fora de construções; câmeras de cena acima do chão e fora de troncos;
a névoa do Pico não bloqueia nenhuma outra trilha nem alvo de missão antes de `pico_liberado`; clareira da Casinha vazia.

`node tests/validate-data.mjs --terreno` repete as checagens contra o terreno **real** de `src/world/terrain.js`
(degraus nas trilhas, pontes no nível das cabeceiras, 1º degrau, plataformas enterradas, itens na água).
Visual rápido: `tests/mapa.html`.
