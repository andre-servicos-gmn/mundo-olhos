# Mundo Olhos — Bíblia da história

Fonte de verdade: `src/data/story.js` (falas, missões, moradores, bebidas, acessórios, prólogo e final).
As coordenadas vêm de `src/data/worldmap.js` (`SPOTS`, `PLATFORMS`, `LANDMARKS`), então história e mapa nunca
desalinham. O mapa e as rotas estão em `docs/mapa.md`.

---

## 1. Em uma frase

O Sol do reino é um grande olho dourado que perdeu o despertador: a Quim, uma menininha de cachos que ainda
está bem acordada, sai ajudando todo mundo, faz amizade com um periquito convencido e leva o filhote de volta
para o bando, que canta o Sol para fora da cama. No fim, o periquito escolhe ficar com ela.

**Tom:** fofo, carinhoso e bobo, nunca triste por muito tempo. Ninguém é vilão. O "problema" do reino é sono.

---

## 2. Como o mundo funciona (lore)

- **Tudo tem olhinhos.** Flores, casas, nuvens, xícaras, postes, ninhos. E todos acompanham a Quim com o olhar.
- **O Sol-Olho.** O sol do reino é um olho dourado gigante. Ele acorda todo dia ouvindo a **Canção da Alvorada**,
  cantada pelo **bando dos periquitos verdes** no **Ninho-Coreto**, no alto da Árvore-Mãe, no Ninhal Cantante.
  O primeiro piado é sempre de um periquito verde ("uma voz verde").
- **O Grande Bocejo.** Poucos dias atrás, o Pico Pestana (a "pestana" do reino, com a Pedra do Bocejo no
  cume) deu um bocejo tão grande que virou ventania. O bando inteiro teve que **migrar** às pressas, levado pelo
  vento, até o Pico, onde uma **névoa sonolenta** fez todo mundo pegar no sono (eles piam dormindo, que nem o
  Pinceso quando era ovo). O menorzinho, o **Pinceso**, escorregou do vento e passou dias perdido procurando a
  família. Hoje cedinho, sobrevoando a Vila, ele perdeu uma pena (a que o gato Bolacha foi caçar) e caiu
  enroscado em cipós na entrada do Ninhal. Na mesma ventania voaram os laços da Madame Fivela, os ovinhos da
  Mamãe Sabiá, as penas da Madame Plumagem e as cartas do Piu.
- **Bocejo é contagioso.** Sem a Canção, o Sol-Olho acorda tarde e emburrado. Ele boceja, as nuvens bocejam,
  as flores bocejam... e quem boceja demais **desbota** (o cinza-lilás do jogo, olhinhos sonolentos).
  Até a coruja Dona Plumínia passou a dormir de noite, o que é um escândalo.
- **A cor mora no brilho dos olhos.** Quando alguém fica feliz, os olhos brilham, e "brilho de olho é a tinta mais
  forte que existe" (Seu Girassolino). Por isso **cada gentileza devolve cor** à região.
- **Por que tudo olha para a Quim?** Ela é "a menina mais acordada do reino" (Vó Cocada). Olhos que brilham
  chamam os outros olhos: o reino inteiro a segue com o olhar, esperando ajuda (Dona Plumínia).
- **"Periquito que escolhe uma cabeça não sai mais dela."** Ditado da Dona Plumínia. Aparece quando o Pinceso
  pousa nos cachos e volta no final, na boca do Vovô Pincelão.

---

## 3. Personagens centrais

| Personagem | Quem é | Arco |
|---|---|---|
| **Quim** | Menina pequena, cachos volumosos, cílios grandes, olhos enormes. Fala pouquíssimo: "Hmm?", "Uii!", "Hihi!", "Oh...". | No prólogo pede "mais cinco minutinhos". No final é ela quem acorda o reino com o maior "UII!" da história. |
| **Pinceso** | Periquito verde-limão, redondinho, bochechas rosadas, topete arrepiado. Convencido, curioso, leal. Fala pelos cotovelos e se diz "guarda-costas oficial". Traduz os piados dos passarinhos. | Do filhote assustado que finge estar "descansando enroscado de propósito" até o periquito que canta a primeira nota da Alvorada. Encontra a família e **escolhe ficar com a Quim**. |
| **Vó Cocada** | Avó da Quim, mora com ela no Campo. | Abre a história, dá a lancheira de jujubas que conquista o Pinceso. |
| **Dona Plumínia** | Coruja avó, sábia, fala devagar e bonito ("Hu-hu"). Fica na Clareira Cantante de dia. | Conta a lenda, manda a Quim ao Bosque e à Cidade, rege o ensaio da Alvorada. |
| **Vovô Pincelão / Mamãe Pincela** | Líder do bando e mãe do Pinceso, no Pico. | O reencontro. A mãe convida o filhote a voltar; ele escolhe a Quim, e o bando promete cantar para eles todo amanhecer. |

Bordões do Pinceso: "Eu sou ótimo.", "Isso eu inventei.", "Ideia minha. De nada.", "É só um cisco."
Ele imita a Quim: "Uii!" vira "Piuí!".

---

## 4. A jornada (linha principal)

A linha principal passa por todas as regiões numa ordem natural e sempre aponta o próximo lugar. As missões
principais começam sozinhas (`autoStart`) e o HUD mostra para onde ir. As secundárias abrem em paralelo.

```
PRÓLOGO (casa da Quim)
  └─ bom_dia ─ flores_murchas ............................ CAMPO (tutorial)
        └─ gato_no_telhado ............................... VILA (verticalidade: caixotes até o telhado)
              └─ filhote_sem_ninho ....................... NINHAL (o Pinceso entra; planar e Voo de Busca)
                    ├─ bala_de_gogo ...................... BOSQUE  ┐ em qualquer ordem
                    └─ relogio_cochilou .................. CIDADE  ┘
                          └─ alvorada .................... NINHAL (noite → oco da coruja → Ninho-Coreto ao amanhecer)
                                └─ piados_no_pico ........ PICO (flag pico_liberado) → FINAL
```

| # | Missão | Região | Pede | Onde acontece | Cor |
|---|---|---|---|---|---|
| 0 | **Prólogo** | Campo | — | Céu sobre a casa → porta da casa (0, 232) → a Quim olha a Florzona cinza | — |
| 1 | `bom_dia` **Bom Dia, Mundo Desbotado** | Campo | — | Florzona (-24, 170) boceja cinza → Seu Girassolino (34, 184) explica o bocejo contagioso | 0,10 |
| 2 | `flores_murchas` **Flores Murchas** | Campo | 1 | 6 das 8 `SPOTS.flores_murchas` → entrega ao jardineiro → onda de cor no Campo | 0,50 |
| 3 | `gato_no_telhado` **O Gato no Telhado** | Vila | 2 | Vovó Lãzinha (27, 4) → peninhas verdes → caixotes até o terraço (46, y 9,5, -6) → do telhado se vê o Ninhal e uma pena verde voando para lá | 0,45 |
| 4 | `filhote_sem_ninho` **O Filhote Sem Ninho** | Ninhal | 3 | Pinceso preso em cipós (-128, -24) → foge → 6 penas verdes para o norte → Pedra Musguinho (-172, -93) → jujubas da lancheira → pousa nos cachos → Dona Plumínia (-160, -4) conta a lenda | 0,35 |
| 5a | `bala_de_gogo` **Bala de Gogó** | Bosque | 4 | Dona Glacê (154, 70) → 6 Jujubas Douradas ao pé das árvores de algodão-doce → bala → "PIUÍÍÍ!" colore o Bosque | 0,60 |
| 5b | `relogio_cochilou` **O Relógio que Cochilou** | Cidade | 4 | Prefeita Girafina (8, -176) → Seu Ponteiro (-7, -181) → escadaria até o terraço da torre (y 21) → o Pinceso dá corda → partitura dourada; vista da névoa no Pico | 0,45 |
| 6 | `alvorada` **Alvorada** | Ninhal | 5a + 5b | Dona Plumínia pede para ser acordada → **noite** → subir até o oco (y 12,6) → subir até o Ninho-Coreto (y 34) → amanhecer: o coral canta, o Ninhal fica todo colorido (0,35 + 0,65 = 1), o bando responde lá do Pico, piando dormindo → `pico_liberado` | 0,65 |
| 7 | `piados_no_pico` **Piados no Pico** | Pico | 6 | Portal da Névoa (102, -198) → Serpentina → Mirante (vista do reino) → Árvore do Bando: todos dormindo; "UII!" + "PIUÍ!" acordam o bando → Vovô Pincelão → **FINAL** | 1,00 |

Por que essa ordem funciona no mapa:
- O **Campo** é o tutorial (andar, coletar, entregar). A Estrada das Pétalas leva direto à Vila.
- A **Vila** ensina a subir (caixotes até o telhado) e, lá de cima, aponta o Ninhal. A pena verde do gato é a
  primeira pista do Pinceso.
- O Pinceso fica **logo no começo da Trilha dos Piados**: ninguém passa reto por ele. As penas puxam a Quim para
  dentro da floresta, onde ela vê a Árvore-Mãe pela primeira vez.
- Com o Pinceso, o mundo **abre**: Bosque (leste) e Cidade (norte) em qualquer ordem, e todas as missões de
  passarinho (o Pinceso traduz os piados).
- A **Alvorada** junta tudo: a voz (Bosque), a partitura (Cidade) e a grande subida do Ninhal, à noite, com
  vaga-lumes. Do alto do coreto a Quim vê a névoa do Pico estremecer.
- O **Pico** fica visível a jornada toda. No Mirante a Quim vê o reino que ajudou a colorir.

---

## 5. Missões secundárias

| Missão | Região | Quem pede | Abre depois de | Resumo | Prêmio | Cor |
|---|---|---|---|---|---|---|
| `enfeitalho` O Espantalho que Queria Amigos *(extra)* | Campo | Seu Palhinha | Filhote | 4 flores viram o espantalho num "Enfeitalho"; o Pinceso é o primeiro a pousar nele | Coroa de Flores, 5 | 0,20 |
| `lago_sorriso` O Lago que Esqueceu de Sorrir *(extra)* | Campo | Sapinho Coaxé | Flores | Pular as pedras até a ilhota e sorrir para o lago, que sorri de volta | 8 | 0,20 |
| `hortas_com_sede` Hortas com Sede | Vila | Seu Repolhudo | Flores | Regador (18, 38) + minigame `regar` nas 3 hortas | 8 | 0,20 |
| `cartas_bom_dia` Cartas de Bom-Dia | Vila | Dona Lentina | Flores | 3 cartas espalhadas → Seu Miolo, Dona Fofura, Seu Cochilo | 8 | 0,20 |
| `festa_surpresa` Festa Surpresa no Coreto *(extra)* | Vila | Seu Miolo | Gato | 4 flores de enfeite → **noite** → festa no coreto para a Vovó Lãzinha | 10 | 0,15 |
| `ovinhos_perdidos` Ovinhos Perdidos | Ninhal | Mamãe Sabiá | Filhote | 5 ovos **frágeis** (um na folha `ninhal_s_3`) → ninho grande | 10 | 0,10 |
| `coral_da_floresta` O Coral da Floresta | Ninhal | Tico | Filhote | Minigame `coral` (5 rodadas) com os cogumelos-nota | 8 | 0,15 |
| `penas_ao_vento` Penas ao Vento | Ninhal | Madame Plumagem | Filhote | Minigame `penas_vento` na clareira do cata-vento | Tiara de Penas | 0,10 |
| `casa_nova` Casa Nova | Ninhal | Seu Barreto (e Dona Barrinha) | Filhote | 4 gravetos, 3 folhas, 3 flores → o Pinceso leva tudo ao galho → ninho com janelinha | 10 | 0,10 |
| `carteiro_piu` Carteiro Piu | Ninhal | Piu | Filhote | 5 cartas derrubadas → caixas da Vila, da Quim, do jardineiro, da Confeiteira e do Correio Central | 12 | 0,10 |
| `cafe_dos_passarinhos` Café dos Passarinhos | Ninhal | Seu Tostado | Filhote | 6 sementes → a Árvore-Café floresce → latte de mel e semente (receita vai para a cafeteria) | Latte de mel, 5 | 0,10 |
| `nuvem_gulosa` A Nuvem Gulosa *(extra)* | Bosque | Pipoca | Filhote | Subir pelos cogumelos-trampolim até a Nuvem do Tesouro, cosquinha na nuvem, ela arrota a cartinha de desejos | 10 | 0,20 |
| `piquenique_formigas` Piquenique das Formiguinhas *(extra)* | Bosque | Dona Migalha | Flores | 3 convites → Dona Glacê, Pipoca, Seu Caramelo → piquenique na beira do Laguinho de Calda | 8 | 0,20 |
| `pausa_na_nuvem` Uma Pausa na Nuvem | Cidade | Dona Nata | Relógio (começa sozinha) | Cena lo-fi na Cafeteria Nuvem de Leite: primeira bebida por conta da prefeitura, minicafé do Pinceso no dedal, e o "obrigado" dele | — | 0,20 |
| `lacos_ao_vento` Laços ao Vento | Cidade | Madame Fivela | Flores | 3 laços (Grande Piscão, placa do Pico, Banco do Cais) → abre a loja | 10 | 0,20 |
| `piscadinha_nas_alturas` Piscadinha nas Alturas *(extra)* | Cidade | Dona Soneca | Filhote | Piscar para as nuvens do alto da torre, do telhado do gato e da Nuvem do Tesouro | Óculos de Olhar Nuvem, 5 | 0,15 |

As missões "de passarinho" e as que têm falas do Pinceso só abrem depois do `filhote_sem_ninho`. As outras abrem
cedo, para quem gosta de explorar antes (a Trilha das Formiguinhas liga o Campo ao Bosque, por exemplo).

### Cor por região (soma das recompensas)
| Campo | Vila | Ninhal | Bosque | Cidade | Pico |
|---|---|---|---|---|---|
| 1,00 | 1,00 | 1,65 | 1,00 | 1,00 | 1,00 |

A linha principal sozinha deixa Campo 0,6, Vila 0,45, Bosque 0,6 e Cidade 0,45; o Ninhal chega a 1 na Alvorada
(como pede a visão: "Alvorada → região toda colorida") e o Pico vai direto a 1. As secundárias completam. O **final pinta
tudo em 1**, então quem só joga a linha principal também vê o reino inteiro colorido.

---

## 6. Final e pós-jogo

**Final (`ENDING`, 15 falas):** amanhecer no Pico. O Vovô Pincelão dá a primeira nota ao Pinceso ("você conhece o
caminho até aqui"). A Canção sobe, o Sol-Olho abre o olhão, e uma onda de cor desce o Pico e corre pelo reino
inteiro até a casinha da Quim. A Mamãe Pincela chama o filhote de volta para o Ninhal. O Pinceso responde que já
tem um ninho, "cacheado, que faz 'hmm'", e fica com a Quim. O avô repete o ditado da Dona Plumínia, a mãe promete
cantar para eles todo amanhecer. Última fala: *"E desde então, todo dia, o Mundo Olhos acorda colorido... e
olhando pra ela."*

**Pós-jogo:** o jogo continua livre, com o Pinceso, as secundárias que faltarem, os segredos do mapa (ilhota,
Nuvem do Tesouro, cume da Pedra do Bocejo, atalhos secretos) e a loja/cafeteria. A **Casinha Asas de Saudade**
(`docs/casinha-asas-de-saudade.md`) é um lugar especial à parte, sem missão, numa clareira escondida do Ninhal
(`SPOTS.asas_de_saudade`, -176, 72) aonde se chega pela Trilhinha das Flores Azuis, que sai de trás da Árvore-Café. A Dona Plumínia só deixa uma dica
carinhosa sobre ela numa das falas soltas.

---

## 7. Moradores (33)

| id | Nome | Espécie | Região | Posição (x, z) | Papel |
|---|---|---|---|---|---|
| `vo_cocada` | Vó Cocada | humana (avó) | Campo | (6, 217) · noite (3, 224) | prólogo |
| `seu_girassolino` | Seu Girassolino | toupeira jardineira | Campo | (34, 184) · noite (38, 177) | `bom_dia`, `flores_murchas` |
| `seu_palhinha` | Seu Palhinha | espantalho | Campo | (-38, 198) | `enfeitalho` |
| `sapinho_coaxe` | Sapinho Coaxé | sapo salva-vidas (com medo de água) | Campo | (-14, 147) | `lago_sorriso` |
| `joaninha_pontinha` | Joaninha Pontinha | joaninha | Campo | (-10, 158) | ambiente |
| `vovo_lazinha` | Vovó Lãzinha | ovelha, dona do gato Bolacha | Vila | (27, 4) | `gato_no_telhado`, festa |
| `seu_miolo` | Seu Miolo | urso padeiro | Vila | (16, -8) | `festa_surpresa`, carta |
| `seu_repolhudo` | Seu Repolhudo | coelho horteleiro | Vila | (-12, 0) | `hortas_com_sede` |
| `dona_lentina` | Dona Lentina | tartaruga carteira | Vila | (14, -29) | `cartas_bom_dia` |
| `dona_fofura` | Dona Fofura | ouriço | Vila | (14, 24) · noite (14, 12) | carta |
| `seu_cochilo` | Seu Cochilo | cachorro que só dorme | Vila | (-19, 24) | carta |
| `dona_pluminia` | Dona Plumínia | coruja avó | Ninhal | (-160, -4) · noite (-219, 2) | lenda, `alvorada` |
| `piu` | Piu | pombo-carteiro (com medo de altura) | Ninhal | (-108, 14) | `carteiro_piu` |
| `tico` / `teco` / `tuco` | Tico, Teco, Tuco | filhotes de tico-tico que imitam a Quim | Ninhal | (-113, -43) (-110, -46) (-112, -40) | `coral_da_floresta`, Alvorada |
| `mamae_sabia` | Mamãe Sabiá | sabiá | Ninhal | (-190, 30) | `ovinhos_perdidos` |
| `madame_plumagem` | Madame Plumagem | pavoa vaidosa | Ninhal | (-226, -44) | `penas_ao_vento` |
| `seu_barreto` / `dona_barrinha` | Seu Barreto, Dona Barrinha | casal de joões-de-barro | Ninhal | (-243, -11) (-245, -7) | `casa_nova` |
| `seu_tostado` | Seu Tostado | tucano barista | Ninhal | (-139, 36) | `cafe_dos_passarinhos` |
| `dona_glace` | Dona Glacê | hipopótama confeiteira | Bosque | (154, 70) | `bala_de_gogo`, piquenique |
| `dona_migalha` | Dona Migalha | formiga (com 2.300 netinhos) | Bosque | (116, 82) | `piquenique_formigas` |
| `pipoca` | Pipoca | coelhinha | Bosque | (203, 26) | `nuvem_gulosa`, piquenique |
| `seu_caramelo` | Seu Caramelo | capivara zen | Bosque | (198, 99) | piquenique |
| `dona_nata` | Dona Nata | gata barista da Nuvem de Leite | Cidade | (23, -154) | `pausa_na_nuvem` |
| `madame_fivela` | Madame Fivela | poodle da Laços & Cachos | Cidade | (-23, -154) | `lacos_ao_vento`, loja |
| `seu_ponteiro` | Seu Ponteiro | ratinho relojoeiro | Cidade | (-7, -181) | `relogio_cochilou` |
| `prefeita_girafina` | Prefeita Girafina | girafa de cílios enormes | Cidade | (8, -176) | `relogio_cochilou` |
| `dona_soneca` | Dona Soneca | bicho-preguiça | Cidade | (-9, -147) | `piscadinha_nas_alturas` |
| `seu_beija` | Seu Beija | beija-flor florista | Cidade | (-34, -186) | ambiente |
| `vovo_pincelao` | Vovô Pincelão | periquito, líder do bando | Pico | (175, -215) | final (aparece com `pico_liberado`) |
| `mamae_pincela` | Mamãe Pincela | periquito, mãe do Pinceso | Pico | (177, -212) | final (aparece com `pico_liberado`) |

O Piu e a Mamãe Sabiá só falam "passarinhês" (piu-piu, pruu); nas missões o Pinceso traduz, sempre aumentando
um pouquinho. Os outros passarinhos falam português.

---

## 8. Economia

- **Jujubas:** 122 no mapa + 191 em recompensas de missão (≈ 313 no total).
- **Laços & Cachos** (abre com `loja_aberta`): Laço de Cetim 30 · Cachecol Fofinho 40 · Chapéu de Sol 55 (total 125).
  Óculos de Olhar Nuvem, Tiara de Penas e Coroa de Flores são **presentes de missão**, não estão à venda.
- **Cafeteria Nuvem de Leite:** Soda de Jujuba 5 · Chá de Lavanda 6 · Latte de Morango 8 · Latte de Mel e Semente 9
  (só depois de `receita_mel_semente`) · Chocolate de Nuvem 10. A primeira bebida (`pausa_na_nuvem`) é cortesia.
- Ritmo: quem chega à Cidade depois de Campo, Vila e Ninhal tem por volta de 40 a 80 jujubas (26 de missões principais
  mais o que achar pelo caminho), o bastante para o laço e uma bebida. Para comprar tudo é preciso explorar bem ou fazer quase todas as missões.

---

## 9. Flags

| Flag | Quem liga | Efeito |
|---|---|---|
| `gogo_afinado` | `bala_de_gogo` | (história) voz do Pinceso afinada |
| `partitura_alvorada` | `relogio_cochilou` | (história) partitura em mãos; o relógio da torre volta a piscar |
| `pico_liberado` | passo `set_flag` da `alvorada` | libera o GATE `nevoa_pico`; mostra o bando no Pico |
| `alvorada_ensaiada` | `alvorada` | (história) |
| `final` | `piados_no_pico` | tocar o `ENDING` e colorir todas as regiões em 1 |
| `loja_aberta` | `lacos_ao_vento` | a loja passa a vender |
| `receita_mel_semente` | `cafe_dos_passarinhos` | latte de mel e semente entra no cardápio |
| `ninho_casal_pronto` | `casa_nova` | o world mostra o `ninho_casal` construído |
| `cafeteria_amiga`, `coral_ensaiado`, `carteira_honoraria` | secundárias | livres (adesivos do diário, falas futuras) |
| `visitou_asas_de_saudade` | reservada | ver `docs/casinha-asas-de-saudade.md` |

---

## 10. Notas para quem implementa

**Campos extras** do `story.js` (todos opcionais, explicados no topo do arquivo):
- `CameraBeat` no prólogo/final: `{ camera:{x,y,z,lookX,lookY,lookZ}, seconds?, dayTime? }`. As falas seguintes
  acontecem com essa câmera. `dayTime` = `render.skipTo(dayTime)` antes.
- `goto.y` e `interact.target.y`: alvos em cima de plataformas (telhado do gato, torre, oco, coreto, ilhota, nuvem).
  O passo só conta com a Quim a menos de ~2 m dessa altura: sem isso, ficar no chão embaixo do coreto (raio 6 > tronco 5)
  ou embaixo da Nuvem do Tesouro já completaria o passo.
- `interact.radius`: raio do interactable quando o padrão 2,5 não alcança (o Pinceso em cima da Pedra Musguinho usa 4,5).
  Para alvo que é landmark, use pegada do landmark + 1,5 (pegadas em `docs/mapa.md`, seção 8).
- `interact.prop`: prop a criar no alvo (`cipo_prisao` no Pinceso preso).
- `collect.label`: nome no HUD ("Jujuba Dourada", "Bolacha", "Convite"). As Jujubas Douradas são props de missão
  (`spawnProp('jujuba')`, de preferência douradas), **não** contam como moeda.
- `cutscene.dayTime`: a cena da Alvorada pula para o amanhecer (0,24).
- `cafe.free`: a bebida desse passo não cobra jujubas.
- `minigame.lines` e `minigame.params` (`coral`: `rounds`, `notas`, `x`, `z` · `penas_vento`: `count`, `need`,
  `seconds`, `x`, `z`, `radius` · `regar`: `horta`).
- `DRINKS.requiresFlag`.
- `deliver` entrega todos os itens daquele tipo que a Quim carrega para a missão; com `deliver.count`, só essa
  quantidade. As missões com uma carta/convite para cada morador (`cartas_bom_dia`, `piquenique_formigas`) usam
  `count: 1` — sem isso, a primeira entrega levaria tudo e as outras ficariam impossíveis.

**O Pinceso durante o `filhote_sem_ninho`:** `setMode('trapped')` em `SPOTS.pinceso_cipo` até o passo `interact`;
depois `fleeing` (voa pelas penas até `SPOTS.pinceso_pouso`, em cima da Pedra Musguinho, y 7,2); na cena do pouso,
`flyTo` até a cabeça da Quim; o passo `pinceso_join` chama `join()`. Antes disso, o Pinceso fica `hidden`.

**Cenas que pedem movimento de NPC** (`npcs.moveTo`/`setVisible`): na `festa_surpresa`, a Vovó Lãzinha vai até o
coreto à noite; na `alvorada`, a Dona Plumínia e o trio Tico-Teco-Tuco aparecem no Ninho-Coreto; no final, o bando
fica em volta da Árvore do Bando (o world pode espalhar periquitos decorativos nos `ninho_bando_1..5`).

**Dona Plumínia à noite:** a posição `nightPos` é ao pé da árvore dela; na Alvorada a Quim bate no **oco**
(interact com y 12,6), não fala com o NPC. Por isso, **entre o `talk` e o `interact` do oco da Alvorada** ela fica
escondida (`npcs.setVisible('dona_pluminia', false)`: está dormindo lá dentro); ao bater, ela sai do oco e reaparece
no Ninho-Coreto. Fora disso, ela pode ficar ao pé da árvore à noite normalmente.

**Hora da Alvorada:** o `cutscene.dayTime` 0,24 deve pular para o **próximo** amanhecer só se ainda for noite;
se a Quim demorou e o dia já nasceu, a cena acontece na hora atual (não gira o dia inteiro em 3 segundos).

**Final:** quando `piados_no_pico` termina (flag `final`), o sistema de missões toca o `ENDING`, chama
`world.setRegionColor(r, 1)` em todas as regiões e devolve o controle. O jogo continua.

**Espécies** que o módulo de NPCs precisa saber desenhar (um "bichinho" paramétrico resolve a maioria: orelhas,
bico, cauda, cor): humano, toupeira, espantalho, sapo, joaninha, ovelha, urso, coelho, tartaruga, ouriço, cachorro,
coruja, pombo, pássaro, pavão, tucano, hipopótamo, formiga, capivara, gato, rato, girafa, preguiça, beija-flor,
periquito. `look.accessory` traz uma dica de figurino em texto livre (ex.: `chapeu_palha`, `bone_de_carteira`).

---

## 11. Validação

`node tests/validate-data.mjs` (mapa + história juntos; sai com código 1 se houver erro). Além do mapa (ver
`docs/mapa.md`, seção 10), checa: ids únicos (missões, NPCs, itens, sem colidir com as jujubas); NPCs, landmarks, hortas
e notas referenciados existem; `requires` sem ciclos; flags exigidas ligadas por uma missão anterior; nenhum alvo de
missão dentro da névoa do Pico antes de `pico_liberado`; todo passo `night` com banco de dormir na região; campos do
contrato em cada passo; entregas com itens suficientes (`deliver.count`); alvos alcançáveis (raio maior que a pegada
do que está embaixo); NPCs e itens dentro da região, fora d'água e de construções; itens em plataforma com y = topo + 0,5;
o Pinceso só fala depois de entrar na história; a Quim só murmura (falas curtas); falas sem espaços sobrando,
parênteses ou aspas abertas; a linha principal passa por todas as regiões e termina no Pico com `final`; cada região
soma cor ≥ 1 e a Alvorada deixa o Ninhal todo colorido; câmeras de cena acima do chão; economia (o mais barato da loja
cabe no que se junta até a Cidade; nenhum passo obrigatório cobra jujubas); e os itens da visão do jogo (as 8 missões
do Ninhal, os minigames, tiara de penas, latte de mel, cipó → penas → jujubas → cachos, a fala da Dona Plumínia,
o dedalzinho na cafeteria, o Pinceso ficando com a Quim no final).
