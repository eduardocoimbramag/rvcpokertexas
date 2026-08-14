# 🃏 Royal VIP Club — Texas Hold'em 1v1

Jogo de **Texas Hold'em heads-up** mobile-first em React + TypeScript com **toda a lógica rodando localmente**: duelo contra um oponente simulado numa mesa de feltro verde, créditos virtuais, cartas 3D animadas, áudio sintetizado e persistência versionada. Sem backend — mas com a arquitetura pronta para recebê-lo.

> Base histórica do projeto (era um Bac Bo de dados, depois um duelo de 21): [docs/limpeza.md](docs/limpeza.md) §2

## Regras do jogo

- **Uma SESSÃO de Texas Hold'em heads-up**, e não uma mão só: as mãos correm uma atrás da outra até alguém ficar sem fichas ou até você se levantar da mesa. Baralho de 52 cartas, embaralhado a cada mão.
- **Os dois compram fichas pelo mesmo BUY-IN: até 5.000** (ou o que o saldo permitir). Ele sai do saldo no ato de sentar e as fichas ficam no feltro: **o saldo não se mexe entre as mãos**, como em qualquer sala. Enquanto a sessão corre **o saldo sai de cena** — o que está em jogo está desenhado na mesa, e um terceiro número no canto não participa de decisão nenhuma. Ele volta no caixa, nos menus e no extrato.
- **A entrada é FIXA e igual dos dois lados: 100 créditos** de cada um vão ao pote antes da primeira carta, **em toda mão**. Não há valor a combinar — o que varia é o que se aposta dentro da mão.
- **O montante de cada um fica em cima do pano**, centrado no vão entre a mão e a borda da mesa, em **fichas de quatro valores** — 25 (marfim), 100 (vinho, a da entrada), 500 (ardósia) e 1.000 (ouro), todas com o brasão da casa. É a MESMA ficha do pote: uma ficha é uma ficha em toda a mesa, e o que muda é quanto ela vale. Um stack não se conta, se **lê**: seis douradas são seis mil, e isso se vê de relance. Apostar tira fichas do montante em direção ao centro; recolher o pote traz de volta. A distância entre as duas pilhas é o placar da sessão.
- **Regra do heads-up**: quem tem o botão (o disco branco com o **D**, sobre o pano ao lado da mão) fala **primeiro no pré-flop** — e **por último** no flop, no turn e no river. Ele é sorteado na abertura da mesa e **passa de lado a cada mão**, para que a posição se reparta ao longo da sessão. Não cobra blind nenhum aqui: diz só a ordem da palavra.
- **As quatro ruas** correm na ordem clássica: pré-flop → flop (3) → turn (1) → river (1) → showdown. Os cinco lugares da mesa ficam desenhados no feltro desde o primeiro instante, vazios.
- **Cada rua abre com um CORTE DE CENA**, na ordem de uma mesa de verdade: a tela inteira sai de foco, o letreiro de ouro da casa — o mesmo carimbo do "Hora do duelo" — entra no centro, o foco volta e **só então** as cartas caem. Anunciar e virar são dois acontecimentos: virar por trás do desfoque escondia justamente o que a rua É. A etiqueta miúda que antes trocava de palavra em silêncio saiu.
- **A fileira de lances tem quatro lugares fixos**: `APOSTAR · PASSAR/PAGAR · CORRER · LEVANTAR`, do que mais se faz para o que menos se faz. O lugar que não cabe na rua fica **vazio** em vez de encolher a fileira — botão que muda de lugar obriga a ler a barra a cada vez; com o lugar fixo o polegar aprende o caminho.
- **CORRER está sempre na mesa**, com ou sem aposta na frente — e passou a estar quando o duelo virou sessão: a entrada desta mão já está no meio, e largá-la é abrir mão de 100 fichas para guardar as outras. Aumentar, só com quem cubra.
- **O menor lance da mesa é UM crédito**, e o valor que se digita é o **acréscimo** — o que o rival tem de cobrir para seguir. Com a entrada de 100 na mesa, apostar 10 leva o seu total a 110 e o rival paga 10. A regra do no-limit (o aumento vale ao menos o tamanho do último) saiu de propósito: num anel ela impede o aumento de um crédito usado para empurrar o relógio, e aqui o relógio é de 20 s e o rival é a casa — o que ela fazia de fato era recusar apostas pequenas.
- **O valor se digita**, num campo **VAZIO** com **+10 / +100** — o padrão de valor em créditos da casa. O painel flutua sobre o feltro e traz os limites da rua em cena; um valor fora deles trava a confirmação e a mesa diz por quê. Digitar o teto é o all-in, e com aposta na frente o botão mostra o preço inteiro do lance (_"PAGAR 240 + 50"_). O campo já abriu com uma sugestão da casa, e isso respondia à pergunta no lugar de quem joga: quem só queria ver os limites saía tendo apostado o que a mesa escolheu.
- **A mesa é cega enquanto a mão corre**: as duas cartas fechadas do rival não atravessam a fronteira da engine até ela acabar. O contrato é simétrico — o rival decide sem ver uma carta sua.
- **No fim, as duas mãos abrem — inclusive na desistência.** Numa sala de verdade quem desiste mucha; aqui não, e é de propósito: ver que o rival largou a melhor mão (ou que blefou com carta alta) é a única leitura que se consegue dele. Ela chega depois que a mão acabou, então não vaza nada.
- **Quando o RIVAL corre, a mesa te oferece abrir a sua mão** — cinco segundos para decidir, com a leitura do que você tinha em cena. É jogada, não vaidade: abrir um par de Ases diz "eu aposto com mão feita"; abrir carta alta diz "eu blefo", e é o que faz a aposta seguinte valer o dobro. O silêncio vale por **não mostro**, que é o que uma sala faz com quem não diz nada.
- **Você tem 20 segundos** por decisão. Zerado o relógio, a mesa joga o lance seguro: passa se for de graça, desiste se houver aposta na frente.
- **A leitura da sua mão** está em cena **desde as cartas fechadas**, e ela diz sempre a COMBINAÇÃO: "Par de Ases" quando há par, "Carta alta: Ás" quando não há nada. Do flop em diante ela acompanha as comunitárias ("Dois pares, Reis e 9"). É informação sua — sai das suas próprias cartas, e não tem equivalente do lado do rival.
- **O fim da mão é um EMBATE**: viradas as cartas, a placa do rival desce de cima e a sua sobe de baixo, cada uma na cor do seu lado, com a categoria da mão e a força dela de 1 a 9. As duas colidem no meio do feltro; a perdedora é jogada para fora e só a vencedora fica, coroada — e a mesa então recolhe o pote e distribui de novo. Empate é a exceção: as duas travam e nenhuma cede.
- **O veredito é UMA placa**, na cor de quem levou o pote (azul se foi você, vermelho se foi o rival), coroada no alto, com **as cartas que decidiram abertas ao lado** — uma a uma, como um crupiê virando a mão. Eram duas placas simétricas, e elas anunciavam uma comparação quando o que houve foi um veredito: com o par na mesa as duas escreviam "PAR DE DAMAS" e a tela dizia empate enquanto o jogo dizia derrota.
- **A placa mostra a COMBINAÇÃO, não a mão de cinco**: um par de Reis são duas cartas, três se um kicker separou as mãos, e um flush são cinco porque ali as cinco _são_ a mão. Os outros kickers estão na mão de cinco porque a mão de poker tem cinco cartas — pendurá-los na placa faz o olho procurar a combinação dentro do monte, que é o trabalho que a placa existe para poupar.
- **Quando as duas mãos leem igual**, a mesa diz no que decidiu. Um par na MESA é de todo mundo: os dois leem "Par de Damas" e quem ganha é o kicker — então a placa vencedora completa a frase (_"decidiu no Ás"_) em linha própria e abre a carta que decidiu ao lado da combinação. Só nesse caso: um par de Ases contra um par de Reis não provoca pergunta nenhuma, e escrever "decidiu no Ás" ali repetiria o nome da mão com outras palavras.
- **Dentro da sessão as fichas são CONSERVADAS**: o pote vai inteiro para quem o levou, e uma aposta que ninguém cobriu volta para quem a fez. Nada evapora do feltro — sem isso, "jogar até alguém quebrar" viraria "jogar até os dois quebrarem".
- **A comissão da casa (10%) incide UMA VEZ, no caixa, e só sobre o LUCRO** — nunca sobre o buy-in que você trouxe. Quem sai no prejuízo leva o que sobrou, sem desconto nenhum.
- **A mesa fecha por uma de duas portas**: alguém ficou sem fichas para a entrada, ou você **levantou da mesa**. O botão de LEVANTAR fica em cena o tempo todo e **apagado na primeira mão** — a primeira é o compromisso de quem sentou. No meio de uma mão, levantar **corre a mão junto**: como em qualquer sala, ela é dada por perdida, não desfeita.
- **Entre uma mão e outra correm 10 segundos**, com um relógio em cena e a porta de saída ocupando a barra inteira — ali ela é a única decisão que existe. Zerado, a mesa distribui sozinha: uma sessão que exigisse um toque a cada mão seria uma sessão jogada com o dedo, não com a cabeça.
- **O fim é um BALANÇO, não um veredito**: com quanto sentou, com quanto levantou, a diferença e o que entra no saldo. Quem sai no lucro leva a festa inteira da casa (ouro, confete, plateia de pé); quem sai no prejuízo recebe um agradecimento e nada mais — perder já é a notícia ruim, e carimbá-la cobraria duas vezes pela mesma coisa. A antiga tela de VITÓRIA/DERROTA saiu com a mão única: numa sessão de quinze mãos a última não é o assunto.

## Como rodar

```bash
npm install
npm run dev          # desenvolvimento (DevTools habilitado via .env.development)
```

| Script              | O que faz                                        |
| ------------------- | ------------------------------------------------ |
| `npm run dev`       | Servidor de desenvolvimento Vite                 |
| `npm run build`     | Typecheck + build de produção                    |
| `npm run preview`   | Serve o build de produção                        |
| `npm run test`      | Testes unitários e de componentes (Vitest + RTL) |
| `npm run test:e2e`  | Testes E2E mobile (Playwright)                   |
| `npm run lint`      | ESLint                                           |
| `npm run format`    | Prettier                                         |
| `npm run typecheck` | `tsc -b`                                         |
| `npm run check`     | lint + typecheck + testes                        |

### Variáveis de ambiente

| Variável               | Default | Descrição                                                                                                |
| ---------------------- | ------- | -------------------------------------------------------------------------------------------------------- |
| `VITE_INITIAL_BALANCE` | `1000`  | Saldo inicial de créditos virtuais                                                                       |
| `VITE_ENABLE_DEVTOOLS` | `false` | Painel oculto: forçar resultado (vitória, derrota, empate ou **puxar flush**), add créditos, limpar tudo |

## Arquitetura

Estrutura por domínio (`features/bac-bo`), com regras do jogo em **funções puras** e a UI proibida de calcular resultados:

```
src/
├── shared/                  # Utilitários agnósticos de domínio
│   ├── config/env.ts        # Env vars validadas com Zod
│   ├── lib/random.ts        # Rng injetável: CryptoRng (produção) / SeededRng (testes)
│   └── components/          # Button, Sheet (bottom sheet acessível)
└── features/bac-bo/
    ├── engine/              # ★ Toda a lógica do jogo vive aqui
    │   ├── types.ts         # Carta, naipe, duelista, partida — o vocabulário comum
    │   ├── rules.ts         # Baralho + regras de 21 (usadas pelo modo Torneio)
    │   ├── credits.ts       # Regras puras de créditos/stakes
    │   ├── LocalBlackjackGameEngine.ts  # Engine de 21 (modo Torneio)
    │   └── poker/           # ★★ TEXAS HOLD'EM — o jogo do 1v1
    │       ├── handRank.ts          # Juízo das mãos: melhor 5 entre 7, puro
    │       ├── types.ts             # Ruas, lances, estado e resultado (Zod)
    │       ├── rules.ts             # Blinds, ações legais, pote, payout, bot
    │       ├── PokerEngine.ts       # Contrato assíncrono (act + advance)
    │       ├── LocalPokerEngine.ts  # Implementação local (matchmaking simulado)
    │       └── createPokerEngine.ts # Factory — troca futura por ApiPokerEngine
    ├── store/gameStore.ts   # Zustand + máquina de estados explícita
    ├── services/
    │   ├── GameStorageService.ts    # localStorage versionado com migrações
    │   ├── AudioManager.ts          # Howler.js central (música + SFX)
    │   └── sfxSynth.ts              # SFX sintetizados em runtime (zero assets binários)
    ├── scene/               # Cenário: mesa Emerald + dealer animada (docs/animacaodealer.md)
    │   ├── TableScene.tsx           # Compositor: mesa + dealer atrás do jogo
    │   ├── ambient/ · table/        # Ambiente global e feltro/trilho em CSS/SVG
    │   └── dealer/                  # Rig SVG com 10 reações por evento (plugável p/ Rive)
    ├── animations/          # Durações canônicas e poses das cartas
    ├── components/
    │   ├── poker/           # ★ A MESA DE HOLD'EM: assentos, board, apostas, embate
    │   ├── table/           # Peças compartilhadas (fichas, carta, medalhão)
    │   └── …                # Home, confirmação, resultado, folhas
    ├── tournament/          # Modo Torneio — segue jogando 21 (mesa própria)
    └── tests/               # Unitários + componentes
e2e/                         # Playwright (viewport Pixel 7)
```

> **Duas mesas, dois jogos.** O 1v1 é Texas Hold'em (`engine/poker` + `components/poker`); o modo **Torneio** continua sendo o duelo de 21, com a engine e a arena dele intactas (`engine/rules.ts`, `components/HandsArena.tsx`). O que as duas compartilham é o baralho, a carta 3D, as fichas e o cenário — não as regras.

### Máquina de estados

```
idle → search → confirm → found → countdown → dealing → betting → settle → completed
          └──────────┘ (cancelar/recusar)                   ↑          │            │
                                                   (as 4 ruas correm dentro          │
                                                    da própria fase `betting`)       │
          └──────────────────────────────────────────────────────────────────────────┘
```

Transições fora do mapa (`PHASE_TRANSITIONS`) são **ignoradas** — a UI não consegue pular etapas. Falhas na engine levam a `error` com devolução do stake.

Na fase `confirm` vale a **confirmação dupla**: a mesa só abre quando jogador **e** oponente confirmam (o oponente simulado confirma sozinho em 0,9–2,4 s). Durante `dealing`/`betting`/`settle` a cena corta para a **câmera vertical** sobre a mesa; em `completed` a câmera volta e a dealer reage ao resultado.

A fase `betting` **se repete**: o que muda a cada volta é a rua e de quem é a vez, não a fase. Quem conduz a mesa entre um lance e outro é o `handOff` do store — a mesa anda sozinha (`engine.advance`: o rival joga, o flop abre) e para quando a palavra é sua (`engine.act`).

### Fluxo de créditos

1. O stack é **debitado na virada para o countdown** — comprar fichas para sentar.
2. A engine resolve a mão e devolve `payout` e `netChange` prontos, calculados sobre o que foi **realmente disputado** (`contested` — o menor dos dois compromissos).
3. O payout é **creditado na conclusão**: vitória devolve o stack + 90% do que o rival pôs; empate devolve o stack; derrota devolve o stack menos o disputado.

### Decisões de implementação (lacunas da especificação)

| Lacuna                                       | Decisão                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entrada e stack da mesa                      | Entrada FIXA de 100 dos dois lados e stack de até 1.000 (cortado pelo saldo). Substituiu a rodada de negociação, que era uma segunda partida antes da partida: o que decidia o duelo era a conversa, não as cartas.                                                                                                                                                                                                                     |
| Desfoque por `filter`, não `backdrop-filter` | O corte de cena desfoca a árvore do `#root` em vez de pôr uma camada com `backdrop-filter` por cima (e o letreiro sai por um portal para o `body`, senão desfocaria junto). A camada é a técnica óbvia e é a errada: num elemento `fixed` ela obriga o motor a amostrar o fundo de uma superfície montada na hora, e os motores discordam sobre qual é — no WebKit o efeito não aparecia e em outros a tela saía duplicada para o lado. |
| Comissão no CAIXA, não por mão               | Ela já foi cobrada mão a mão, e com uma mesa de mão única dava no mesmo. Numa sessão, não: fichas evaporando a cada pote encolhem os dois stacks juntos, e "jogar até alguém quebrar" vira "jogar até os dois quebrarem". A casa cobra na porta de saída, sobre o lucro.                                                                                                                                                                |
| Sair só ENTRE as mãos                        | Levantar no meio de uma mão abandonaria fichas já postas no meio — uma sala de verdade dá a mão por perdida, não a desfaz. A porta abre no beat entre as mãos, e o beat foi dimensionado para caber o toque (ver `handoverMs`).                                                                                                                                                                                                         |
| Sem small/big blind                          | A entrada é simétrica. Blinds desiguais existem no anel para forçar ação num pote de várias pessoas; num duelo heads-up a entrada igual já cria o pote, e a vantagem que resta é só a posição.                                                                                                                                                                                                                                          |
| Sem aumento mínimo do no-limit               | Ele impede a guerra de aumentos de um crédito, que num anel cansa a mesa. Aqui o relógio é de 20 s e o rival é a casa: o que a regra fazia era recusar uma aposta de 20 num pote de 200. O stack finito continua garantindo o fim da mão — há teste para a guerra encenada.                                                                                                                                                             |
| Botão do dealer                              | Sorteado a cada mão. Dá-lo sempre ao jogador entregaria a posição de graça — meia mão de vantagem no heads-up.                                                                                                                                                                                                                                                                                                                          |
| Avaliador de mãos                            | Força bruta sobre as 21 combinações de C(7,5). Uma tabela perfeita seria mais rápida e ninguém aqui precisa dela: o que este código precisa ser é ÓBVIO.                                                                                                                                                                                                                                                                                |
| Cabeça do rival                              | Força da mão (Chen no pré-flop, categoria + desempate depois) × odds do pote × uma frequência baixa de blefe. Nunca vê uma carta sua.                                                                                                                                                                                                                                                                                                   |
| Força de 1 a 9 no embate                     | É a CATEGORIA contada como as pessoas a contam, e a placa é honesta sobre isso: ordena categorias, não mãos. Dois pares de Ases e de Reis marcam 3 os dois — quem decide é o detalhe logo abaixo, e é por isso que ele está lá.                                                                                                                                                                                                         |
| Painel de aumento                            | Flutua sobre o feltro em vez de empurrar o layout: com cinco fileiras ele não cabe no slot da barra de ações, e enquanto empurrava, o botão de confirmar saía da tela num aparelho de 640px.                                                                                                                                                                                                                                            |
| Aposta não coberta                           | Volta a quem a fez (`contested` é o menor dos dois compromissos) — ninguém leva um dinheiro que o outro não tinha como pôr.                                                                                                                                                                                                                                                                                                             |
| Mão morta por desistência                    | Fica MUCHADA: não abre na mesa nem no extrato, como em qualquer sala.                                                                                                                                                                                                                                                                                                                                                                   |
| Matchmaking sem backend                      | Delay artificial (1,2–2,6 s) + perfis de oponentes locais; cancelável                                                                                                                                                                                                                                                                                                                                                                   |
| Assets de áudio                              | WAV PCM sintetizado em runtime e entregue ao Howler como data URI                                                                                                                                                                                                                                                                                                                                                                       |
| Saldo zerado                                 | Botão de recarga restaura o saldo inicial (créditos são virtuais)                                                                                                                                                                                                                                                                                                                                                                       |
| RNG                                          | Interface `Rng` injetável — `CryptoRng` em produção, `SeededRng` em teste                                                                                                                                                                                                                                                                                                                                                               |

## Integração futura com backend

A UI e o store dependem apenas da interface `PokerEngine` (métodos assíncronos, erros tipados, dados validados com Zod). Para plugar um backend:

1. Implementar `ApiPokerEngine implements PokerEngine`.
2. Retorná-la em `createPokerEngine({ mode: 'api' })`.

Nenhum componente muda. O sigilo já é estrutural: `opponentHole` sai da engine vazio até o showdown, então uma engine remota não precisa inventar uma regra nova para não vazar as cartas do rival.

## Qualidade

- **555 testes** unitários/componentes — entre eles o avaliador de mãos (roda, royal, desempates), as regras de aposta, a engine de poker com invariantes de mesa (nenhuma ficha nasce ou some; a mão sempre termina; nem uma carta do rival atravessa antes do showdown), o store com timers falsos e a arena de Hold'em.
- **21 testes E2E** mobile no Playwright: a mão inteira do pré-flop ao showdown, a mesa cega, a legalidade dos lances rua após rua, a leitura da mão já no pré-flop, a sessão que continua de mão em mão, os montantes de fichas no feltro, a porta de saída da mesa e o caixa, o corte de cena de cada rua (e que as cartas só caem depois dele), o campo de aposta que abre vazio, os atalhos +10/+100, o embate do showdown, a placa única do vencedor com as cartas que decidiram, a entrada fixa da mesa, a geometria do centro do feltro, persistência pós-reload — mais o fluxo do modo Torneio.
- TypeScript `strict` + `noUncheckedIndexedAccess`, ESLint (`typescript-eslint` strict), Prettier.

## Acessibilidade e mobile

- Projetado primeiro para 360×640; casca central com `max-width` e safe areas (notch).
- Alvos de toque ≥ 44 px, `aria-live` para resultados, `role`/`aria-label` nos dados e placar.
- `prefers-reduced-motion` respeitado nas animações dos dados e partículas.
- Vibração opcional (configurável) nos momentos-chave.
