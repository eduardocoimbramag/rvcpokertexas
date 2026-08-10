# MULTIPLAYER 6-MAX — plano

> Plano de construção do poker de 6 lugares com lobby, mesa aberta/fechada e escolha
> de cadeira. Escrito em 09/08/2026, a partir de um levantamento completo do que já
> existe no projeto.
>
> **Nada foi implementado ainda.** Este documento existe para a decisão vir antes do
> código — e há uma decisão que muda o projeto em duas ordens de grandeza.
>
> **DECIDIDO em 09/08/2026:**
> - **Rota A** — bots agora, com a costura do backend já no lugar.
> - **Mesa fechada = cash** — blind fixo, sem níveis, sem campeão; fechada apenas a
>   *novos* jogadores. Ver a ressalva em 6.3.

---

## 1. A pergunta que decide tudo

O pedido cabe inteiro em **bots locais**, menos uma frase:

> *"quem clicar mais rápido pega aquela cadeira"*

Duas pessoas disputando a mesma cadeira **exige servidor**. Não é dificuldade, é
impossibilidade: hoje o jogo inteiro roda no navegador de uma pessoa só.

Isso não é opinião. É o que o código diz:

| Verificação | Resultado |
| --- | --- |
| `fetch` / `WebSocket` / `socket.io` / Supabase / Firebase em `src/` | **zero ocorrências** |
| `.env.example` | duas chaves: saldo inicial e DevTools. Nenhuma URL |
| `createPokerEngine({ mode: 'api' })` | **lança exceção** — a `ApiPokerEngine` não existe |
| De onde vêm as salas do lobby | `Math.random()` no **seu próprio** navegador |
| Onde mora o seu saldo | `localStorage`, escrito pelo cliente |
| Quem embaralha as cartas | o cliente, que conhece as duas mãos |

Consequência direta, e ela precisa ser dita sem rodeio: **"a sala fica constando no
lobby" é irrealizável localmente.** Duas pessoas abrindo o app hoje veem listas de
salas diferentes, inventadas em cada aparelho. É a linha do pedido que mais rápido
se desmascara com dois celulares lado a lado.

### As duas rotas

| | **Rota A — mesa de 6 com bots** | **Rota B — 6 pessoas de verdade** |
| --- | --- | --- |
| O que é | Poker 6-max completo, você contra 5 bots | O mesmo, com pessoas reais |
| Lobby, cadeiras, mesa aberta/fechada | tudo funciona | tudo funciona |
| "Quem clicar primeiro" | **encenado** (bots com timer) | real |
| Sala visível para outra pessoa | não | sim |
| Sigilo das cartas | o cliente sabe tudo | garantido pelo servidor |
| Saldo | editável no DevTools | ledger no servidor |
| Prazo | **~3,5 a 4 meses** | **~7 a 9 meses** |
| Backend | nenhum | obrigatório: auth, salas, ledger, WebSocket, timers |

**A Rota A é pré-requisito da B**, não um caminho alternativo. Todo o trabalho de
engine, mesa e lobby da A é reaproveitado integralmente na B. A recomendação é
construir A com a **costura da B já no lugar** (seção 4) — isso custa pouco agora e
evita reescrever a interface depois.

---

## 2. O que já existe (é mais do que parece)

Esta é a boa notícia, e ela encurta bastante o caminho.

### 2.1 O lobby está pronto

`tournament/screens/` já entrega criação de sala, vitrine de salas, sala privada com
senha de 4 dígitos, taxa de entrada com validação contra o saldo, chat, expulsão de
membro e confirmação de entrada. A folha de criação já tem visibilidade, nome,
senha, formato, tamanho e taxa — com validação campo a campo.

### 2.2 A mesa de 6 lugares já existe

`TableSize = 3 | 4 | 5 | 6` — e o comentário no código já diz por quê:

> *"o teto é 6 porque é quanto cabe no feltro com as mãos legíveis"*

A geometria mora em `tournament/tableLayout.ts` (39 linhas, lógica pura e testada).
Com 6 jogadores são 5 rivais, divididos em faixas `[3, 2]`: três ao fundo, dois à
frente, **você sempre embaixo**. Isto é exatamente o POV fixo que foi pedido — já
está construído.

### 2.3 A leitura de mãos de poker é reaproveitável quase inteira

`engine/poker/handRank.ts` (522 linhas) é código puro: sem DOM, sem timer, sem
aleatoriedade. **Roda no Node sem tocar uma vírgula** — é o ativo mais valioso do
repositório para este projeto, e sobrevive inclusive à Rota B.

### 2.4 A costura para um backend foi antecipada

`createPokerEngine` existe e é o **único** ponto de criação da engine em todo o app.
A intuição estava certa; a seção 4 explica os dois lugares onde o corte precisa
mudar de posição.

---

## 3. O que não existe

### 3.1 Blinds

O projeto **não tem blinds**, e isso está escrito de propósito em `engine/credits.ts`:

> *"não há blinds desiguais — a entrada desta mesa é igual dos dois lados"*

Mais: a regra do no-limit de "aumento ≥ último aumento" foi **removida de propósito**
(`rules.ts`), deixando o mínimo em `maxCommitted + 1`. O pedido reintroduz as duas
coisas. Não é generalizar — é reconstruir e então generalizar.

> **Nota de vocabulário:** "bind" é **blind**. É o valor obrigatório pago a cada
> rodada, e ele *roda* pela mesa: o small blind e o big blind passam de assento em
> assento a cada mão. É por isso que blind implica ordem de ação circular, implica
> botão do dealer girando, e implica pote lateral.

### 3.2 Pote lateral

Hoje a partilha do pote é `Math.min` de dois valores, com `pot = contested * 2`
cravado no código. Com 6 jogadores e all-ins de tamanhos diferentes o pote se parte
em camadas — até 5 delas. É a peça mais delicada do projeto inteiro.

**O algoritmo correto**, para registro:

```
1. níveis = valores únicos de committed[s] > 0, em ordem crescente
   (INCLUI quem desistiu — as fichas dele ficaram no meio)
2. anterior = 0
3. para cada nível L:
     contribuintes = { s | committed[s] >= L }        ← inclui foldados
     valor         = (L - anterior) × |contribuintes|
     elegíveis     = contribuintes menos os foldados  ← só estes podem ganhar
     se valor > 0: potes.push({ valor, elegíveis })
     anterior = L
4. funde potes consecutivos com o mesmo conjunto de elegíveis
5. a ficha ímpar de cada pote vai ao primeiro elegível à esquerda do botão
```

O caso de dois jogadores que existe hoje é o caso degenerado deste algoritmo — a
cabeça já está certa, só falta o resto.

### 3.3 A engine é heads-up até a raiz

O tipo `Duelist = 'player' | 'opponent'` aparece **60 vezes em 18 arquivos**. E a
armadilha: **ele não é do poker, é do jogo inteiro** — o modo blackjack também o usa.
Generalizá-lo globalmente derruba o blackjack junto.

**Mitigação:** criar um `SeatId` **só dentro de `engine/poker/`** e deixar `Duelist`
viver onde está. Custa uma decisão hoje e economiza cerca de uma semana depois.

### 3.4 `advance()` não sobrevive a 6 pessoas

O contrato atual documenta com orgulho:

> *"`advance` é a MESA seguindo sozinha… Quem chama `advance` decide o RITMO."*

É um desenho **cliente-autoritativo**, e é excelente para 1v1 contra bot. Com 6
humanos é impossível: quem chamaria? O ritmo passa a ser do servidor. Ver 4.2.

### 3.5 Um defeito no lobby atual, que o pedido expõe

`createLobby` **não insere a sala em `lobbies`**. A sua sala nunca aparece na
vitrine — hoje isso não incomoda porque a vitrine é decorativa, mas "a mesa aberta
fica constando no lobby" é exatamente esse caminho. Precisa ser consertado na F0.

---

## 4. A arquitetura proposta

Duas correções de rota, e são as que decidem se a Rota B custa 2 meses ou 6.

### 4.1 Cortar `LocalPokerEngine` em dois

Ele hoje mistura quatro coisas: a regra da mão, o relógio (`await delay`), a cabeça
do bot e um matchmaking falso. A separação:

```
engine/poker/handMachine.ts     ← PURO: reduce(estado, comando) → [estado, eventos]
                                   sem timer, sem random, sem DOM.
                                   É este arquivo que roda no servidor sem mudança.
engine/room/local/RoomServer.ts ← timers, bots, salas. O "servidor de mentira".
```

### 4.2 Trocar `advance()` por assinatura de eventos

O estado passa a **chegar**, em vez de ser puxado:

```ts
type RoomEvent =
  | { type: 'seat.taken'; seatIndex: number; player: Player }
  | { type: 'hand.started'; handId: string; button: number; blinds: Blinds }
  | { type: 'player.acted'; seatId: SeatId; move: LastMove }
  | { type: 'street.opened'; street: Street; cards: Card[] }
  | { type: 'hand.settled'; pots: SidePot[] }
  | { type: 'clock'; seatId: SeatId; deadlineMs: number }
  | { type: 'player.left'; seatId: SeatId };
```

No modo local, o servidor de mentira emite esses eventos **com os mesmos tempos de
hoje**. A interface não sabe a diferença — e no dia do backend, ela não muda.

Se `advance()` for mantido, a troca local→remoto reescreve `gameStore.ts` (1.357
linhas) e a mesa inteira.

### 4.3 A regra que salva a tela de cadeiras

> `claimSeat` precisa devolver `Promise<{ok:true} | {ok:false, reason:'taken'}>`
> **já no modo local**, com pedido otimista e desfazer visual.

Se a tela for escrita assumindo que clicar = sentar (síncrono, sem falha possível),
a migração para servidor **reescreve a tela**. Escrita como "eu peço, a mesa
responde", o bot local responde *"não, o Otto foi mais rápido"* com um timer e a
tela nunca mais muda.

No servidor, a corrida se resolve por **constraint do banco**, nunca por
ler-verificar-escrever na aplicação:

```sql
UPDATE seats SET player_id = $eu
WHERE room_id = $sala AND seat_index = $i AND player_id IS NULL;
-- 1 linha afetada → você pegou.  0 → chegou tarde.
```

### 4.4 Preservar o corte de sigilo

`PokerRoundState` já é o **ponto de vista do jogador**: as cartas do rival não
atravessam a fronteira antes do showdown. É a melhor decisão de projeto do
repositório e é exatamente o que um servidor emite — uma visão por assento, com as
N−1 mãos ocultas. **Não mexer.**

---

## 5. As fatias

| # | Fatia | Tamanho | O que entrega |
| --- | --- | --- | --- |
| **F0** | Lobby cash 6-max | 4–6 dias | Sala aberta/fechada, buy-in e blind na criação e no cartão |
| **F1** | Cadeiras vazias + corrida | 5–8 dias | As 6 cadeiras, o clique, a rotação de POV |
| **F2** | Chassi visual da mesa de 6 | 8–12 dias | Assentos com fichas, pote, board — ainda sem regras |
| **F3a** | Blinds + raise mínimo | 4–7 dias | Ainda heads-up, mas com a economia certa |
| **F3b** | `SeatId` com N=2 | 5–8 dias | Contrato novo, comportamento idêntico |
| **F3c** | Multiway: ordem circular, showdown de N | 8–12 dias | — |
| **F3d** | Side pots + migração de histórico | 5–8 dias | — |
| **F3e** | Recalibrar os bots para 6-max | 4–8 dias | — |
| **F4** | Ligar tudo: poker 6-max contra 5 bots | 5–8 dias | **O produto da Rota A** |
| **F5** | Backend autoritativo | 60–100 dias | **A Rota B** |

### Onde estamos — **Rota A concluída (F0 → F4)**

| # | Estado | O que ficou pronto |
| --- | --- | --- |
| **F0** | ✅ | Formato `cash`, mesa aberta/fechada, compra e blind na criação e no cartão da vitrine. Consertado de quebra: `createLobby` não punha a sua sala na lista (§3.5), e `openBrowse` a apagava ao voltar. |
| **F1** | ✅ | `seatOrder.ts` (rotação de POV), `SeatingScreen`, e `claimSeat` **assíncrono e falível** desde o modo local (§4.3). Os bots disputam por timer e nunca tomam a última cadeira antes de você. |
| **F2** | ✅ | `cashTable.ts` (o retrato da mesa) e `CashArena`: seis assentos com fichas, blinds no feltro, botão do dealer sorteado, as cinco casas da mesa e o que há em jogo. |
| **F3a** | ✅ | `engine/poker/betting.ts` — blinds, aumento mínimo de no-limit, all-in curto que **não reabre** a rodada nem encolhe o mínimo da mesa. |
| **F3b/c** | ✅ | `engine/poker/ringHand.ts` — a máquina de mão indexada por `SeatId`, imutável: ordem circular, exceção do heads-up, opção do big blind, fold de N, board corrido no all-in. |
| **F3d** | ✅ | `engine/poker/sidePots.ts` — camadas do pote, quem correu contribui sem ser elegível, ficha ímpar à esquerda do botão. Extrato passa a guardar mão de anel. |
| **F3e** | ✅ | `engine/poker/ringBot.ts` — força corrigida pelo número de rivais, posição, e o blefe que some com a mesa cheia. |
| **F4** | ✅ | `cashEngine.ts` + `CashActions` — poker 6-max jogável contra 5 bots, mão após mão, com botão rodando e caixa fechando. |
| **F5** | ⏳ | O backend autoritativo — a Rota B. |

**Três decisões que se afastaram do plano, e por quê**

1. **O duelo 1v1 não foi migrado.** O plano previa reescrever a economia da engine
   existente (F3a: *"ainda heads-up, mas com a economia certa"*). A engine do duelo
   está no ar, afinada, e tem uma economia própria e deliberada — entrada igual, sem
   blind, aumento mínimo de um crédito. Mudá-la seria alterar um jogo que funciona
   como efeito colateral de construir outro. A mesa de 6 ganhou máquina própria
   (`ringHand.ts`), e as duas compartilham o que valia a pena: `handRank.ts`.
2. **`SeatId` nasceu na máquina nova em vez de substituir `Duelist`.** Mesmo efeito
   que o §3.3 pedia (o `Duelist` do blackjack fica intacto), sem o risco do refactor.
3. **O histórico não foi migrado para v4.** Um `dropHistory` teria sido mais simples
   de escrever e teria **apagado o extrato de quem já jogou**. Em vez disso o extrato
   passou a guardar dois formatos, distinguidos por `kind`, com `'duel'` como padrão
   das linhas antigas. Nada foi migrado e nada foi descartado.

**Dois detalhes que valem registro porque são dinheiro ou são jogo**

- A **compra é debitada quando a mesa abre**, não no START do lobby, e o que volta ao
  levantar é o **stack vivo**. Sem esse débito, levantar creditaria fichas que nunca
  foram pagas.
- **Ninguém fala antes de as cartas assentarem** (`dealDurationMs`). Sem essa espera a
  barra de lances abria com a distribuição ainda no ar — a mesa pedia decisão sobre
  uma mão que o jogador ainda não tinha na frente dele.

### O que a mesa de 6 herdou do duelo

O pedido era claro: *"quero que o multiplayer tenha o máximo possível do 1v1"*. O que
foi trazido, e como:

| Peça | Como |
| --- | --- |
| **Cenário e feltro** | A MESMA `TableScene`, câmera de cima. A mesa deixou de flutuar sobre a foto do salão. |
| **Letreiro de rua** | O MESMO `StreetAnnounce` — a cena desfoca e a palavra carimba. Vale mais aqui: a rua vira depois de até seis lances. |
| **Relógio da vez** | `TurnClock`, **extraído** de dentro do `BetControls` para as duas mesas usarem. Vencido, a mesa joga o lance seguro. |
| **Levantar da mesa** | `LeaveButton`, extraído junto. Em cena desde a 1ª mão, apagado; abre na 2ª. |
| **Fichas** | `ChipRack` por assento e `ChipStack` no pote — em escala própria, porque o vão de um assento de seis é uma fração do de um duelo. |
| **Alto-falante** | O balão do lance, com a mesma gramática (`ALL-IN` substitui a ação em vez de completá-la). |
| **Mostrar a mão** | Só para QUEM LEVOU sem showdown — perguntar aos cinco que correram seriam cinco balões por mão. Os bots decidem pelo mesmo `botShowsHand`. |
| **Cartas que decidiram** | Acendem no feltro e deitam na placa do desfecho. |
| **Botão do dealer** | Disco sobre o pano, ao lado da mão de quem o tem, girando a cada mão. |

**O que NÃO foi trazido, e por quê:** o `ShowdownClash` — a animação de embate entre
duas mãos. Ela compara *dois* placares lado a lado, e numa mesa que pode ter quatro
mãos no showdown e dois potes ela não descreve o que aconteceu. O lugar dela é a placa
de desfecho (`CashVerdictPlate`), que sabe dizer "fulano e sicrano dividiram".

**Dois defeitos reais que a verificação pegou** (e que valem registro porque
travavam a mesa):

1. **O bot pedia um aumento ilegal.** A engine passava a ele o mínimo TEÓRICO da mesa
   em vez do mínimo POSSÍVEL para o stack dele: com 954 fichas e um mínimo de 1114, ele
   grampeava para 1114 e `applyMove` levantava — a mesa parava no meio da rua.
2. **`raiseRange` e `legalFor` discordavam.** A faixa oferecia aumento a quem já falou
   e levou só um all-in curto, que pela regra pode pagar mas não aumentar.

### A mesa de 6 é a mesa do duelo

O dono olhou os dois prints lado a lado e disse o essencial: *"existe uma
diferença enorme... queria que ficasse exatamente igual ao 1v1, sendo que sendo uma
versão com mais jogadores."* Um levantamento dimensão por dimensão achou **45
diferenças confirmadas**. As de raiz:

| O que estava errado | Por quê |
| --- | --- |
| **A moldura da mesa sumia** | `.scene-clip` estende o recorte em −1.5rem de cada lado para compensar o `px-6` do `<main>` do duelo. A mesa de 6 não tinha esse padding: o feltro vazava 1,5 rem para fora e o trilho de mogno ia junto. |
| **O trilho de cima também sumia** | O cabeçalho ficava DENTRO da `TableScene`, e a cena começava 60 px mais alto que no duelo. |
| **A página estava rolada 12 px** | Um véu decorativo com `inset: -8% -12%` transbordava a tela e empurrava o trilho da esquerda para fora sozinho. |
| **As cartas do rival eram 0,46 da carta da casa** | O duelo aboliu por escrito a escala menor do rival; a mesa de 6 a reintroduziu. |
| **A placa do assento era uma imitação** | Gradiente translúcido com um fio de ouro a 22% — textualmente o resultado que o comentário do duelo diz ter rejeitado. Agora ela É `.seat-plate`, e o CSS local só diz a escala. |
| **O vão morto embaixo** | `justify-content: center` rachava a sobra vertical em duas margens mortas. O duelo põe toda a sobra num item elástico (`.poker-center`). |
| **A mesa pulava a cada lance** | O rodapé não reservava altura. Agora usa `.arena-actions` (8,9 rem), a mesma banda que o brasão do feltro desconta. |
| **As fichas eram miúdas e o pote invertido** | Ficha de 20 px com uma placa duas vezes maior. O duelo tem ficha de 35 px e pastilha discreta (`.poker-pot`). |
| **O disco do dealer não encolhia** | A regra escrevia numa variável MORTA (`--puck-size`); o nome lido é `--dealer-puck-size`. |

**E o compasso**, que era a queixa nº 2. Todos os beats passaram a sair de
`TIMINGS`, os mesmos números do duelo:

- a distribuição de **doze** cartas leva o mesmo que a de quatro (2 753 ms contra
  2 770 ms) — a fração `DEAL_STAGGER` foi calculada para isso;
- o **letreiro vem antes das cartas**: anunciar → foco voltar → virar. A mesa de 6
  publicava o board primeiro, e o flop virava ATRÁS do desfoque — o mesmo bug que o
  duelo documenta como corrigido em `pokerStreetMs`;
- ninguém fala dentro do desfoque: a barra espera `pokerStreetMs`;
- o rival pensa `pokerThinkMinMs`–`pokerThinkMaxMs` (900–2 600 ms), sorteado, em vez
  de um número mágico de 700–1 200;
- o showdown é uma cena (`revealMs`), o intervalo entre mãos é
  `settleMs + handoverCloseMs`, o balão do lance SAI em `revealHoldMs`;
- e a mesa deixou de ser **muda**: baralho, lance e desfecho tocam pelo `audioManager`.

**O teste que impede a regressão:** `e2e/table-parity.spec.ts` mede a geometria da
cena nas DUAS telas e exige que coincidam. Nenhum dos três defeitos de enquadramento
aparecia num teste de comportamento — a mesa jogava perfeitamente, só não parecia uma
mesa.

**Uma peça que não foi portada, e por quê:** o `ShowdownClash` compara DUAS placas
lado a lado. Numa mesa que pode ter quatro mãos no showdown e dois potes ele não
descreve o que aconteceu; esse papel é da `CashVerdictPlate`, que sabe dizer "fulano e
sicrano dividiram".

### Duas correções pedidas olhando o print

**1. Sem fichas, a mesa era uma sala trancada.** Quebrado, você não recebe carta, não
tem vez, e a barra de lances nunca mais abre — e é nela que mora o LEVANTAR. A porta
do cabeçalho continuava lá, mas é um ícone de 2 rem no canto: não é onde o olho de
quem acabou de quebrar vai parar.

Agora o store publica `cashBroke`, e a faixa da espera troca de conteúdo: *"Você ficou
sem fichas"* com um **LEVANTAR DA MESA vermelho** embaixo. A invariante — *se
`cashBroke`, então `cashCanLeave`* — é testada mão a mão em `seating.test.ts`, e a mesa
que fica sem quem jogue também abre a saída, inclusive para quem ainda tem fichas.

De quebra, o diálogo parou de mentir: com zero na frente ele não promete mais que "as
fichas voltam para o saldo" — isso soava como reembolso, e o buy-in já virou as fichas
que se perdeu.

**2. A placa do assento diz duas coisas: QUEM e QUANTO.** Numa faixa de três assentos
cada placa tem ~79 px no aparelho mais estreito, e tudo o que entrava nela roubava
corpo de fonte das duas leituras que se faz vinte vezes por mão. Saíram do assento do
rival:

- o **medalhão** — repetia a inicial de um nome escrito ao lado;
- o **selo SB/BB** — os blinds já estão em cena duas vezes: nas fichas de aposta na
  frente de quem os pagou e na posição relativa ao disco do dealer, que é de onde eles
  saem;
- o **selo MOSTROU** — quando alguém abre a mão, as cartas ficam de face para cima. O
  selo repetia o que a carta já dizia.

O **ALL-IN ficou**. Ele não é enfeite de placa: é o único estado que muda o que se pode
fazer contra aquele assento, e aparece uma vez a cada muitas mãos.

Com o espaço liberado, `--plate-fs` subiu de 5,4 px para 7,4 px de corpo no aparelho
mais estreito — 37% a mais de tipografia nas duas informações que importam.

**Três defeitos de espaço que a mudança expôs**, e que foram corrigidos junto: o
alto-falante do lance ganhou faixa própria (dentro do miolo ele empurrava o board para
cima das cartas; flutuando, cobria as suas), a banda do rodapé passou a escalar com a
altura da tela (`clamp(6.4rem, 17dvh, 8.9rem)` só dentro de `.cash-screen` — o `:root`
do duelo não foi tocado), e os dois testes de mesa cheia declararam `test.setTimeout`:
uma mão de 6-max com o compasso do duelo passa dos 120 s do teto global, e é custo
real, não defeito.

### A sala virou uma sala de POKER, de 3 a 6 lugares

A folha de criação perguntava **qual formato** — poker, chaveamento ou mesa única. Só
que só há um jogo nesta casa, e é poker: perguntar isso era pedir para escolher entre
um jogo e dois modos de outro. A pergunta virou **quantas pessoas sentam**, com a
régua de 3 a 6.

O número não é decoração. Ele decide quantas cadeiras a corrida disputa, como os
rivais se dividem nas faixas do feltro (3 lugares → 2 rivais numa faixa; 6 → 3+2 em
duas) e, por tabela, o jogo que se joga: **numa mesa de três a mão média é muito mais
larga que numa de seis**, porque há menos mãos para bater. É isso que a dica da folha
diz em vez de repetir "mão após mão".

**O piso é três, e é regra de jogo.** Com dois jogadores o Hold'em vira heads-up, que é
outro jogo — o botão paga a small blind e a ordem da palavra inverte no pré-flop. A
máquina do anel sabe jogar heads-up e é testada nele (`ringHand.test.ts`), mas uma
*mesa de cash* que se abre para dois é uma mesa que já acabou.

**O teto é seis** porque é quanto cabe no feltro com as mãos legíveis.

**O que aconteceu com chaveamento e mesa única.** Eles continuam **inteiros** no
projeto — telas, store, regras e testes de unidade. O que saiu foi a porta: a folha não
os oferece mais e a vitrine não os anuncia (anunciar uma sala que não se pode criar
seria oferecer uma porta que leva a outro jogo). O interruptor é
`BRACKET_ENABLED = false`, no mesmo arquivo e no mesmo padrão do `TOURNAMENT_ENABLED`
que já existia: **reativar é uma linha**.

Os testes deles seguem a mesma regra — ficam inteiros, atrás do mesmo booleano
(`describe.skipIf` no unitário, `test.skip` no e2e). Apagá-los agora seria pagar de
novo para escrevê-los depois. O que valia para QUALQUER sala — a senha da sala privada,
o alvo de toque do × de expulsar, a ficha técnica — foi **portado para a mesa de poker**
em `e2e/cash-table.spec.ts`, onde continua rodando.

**A cobertura nova:** as quatro mesas (3, 4, 5 e 6) são criadas, enchem e sentam num
e2e próprio, que confere em cada uma o número de cadeiras da corrida, o número de
assentos no feltro, **os dois blinds** (mesmo numa mesa de três: no anel paga quem
senta à esquerda do botão e o seguinte) e a ausência de rolagem lateral.

### Dois ajustes de cena

**O cabeçalho é o nome da sala, e só.** Ali morava também a economia da mesa — compra,
blinds e o contador de mãos. Saiu porque é ficha técnica: a compra se decide na criação
e não muda; o blind está em cena a cada mão nas fichas na frente de quem o paga; e o
número da mão não muda decisão nenhuma. Eram três informações fixas ocupando a faixa
mais nobre da tela, sobre um feltro onde o que importa são as cartas. Tudo continua a
um toque, na ficha da sala. O nome ficou **centrado**, com o botão de levantar ancorado
à direita — com o nome à esquerda, o cabeçalho lia como duas peças soltas em vez de uma
faixa.

**O alto-falante do lance desceu para baixo da sua placa.** É a terceira posição que ele
ocupa, e cada mudança teve um motivo medido: dentro do miolo ele disputava altura com o
board e o empurrava para cima das cartas da segunda fileira; flutuando por cima, cobria
as comunitárias; entre o board e a sua mão, encostava na sua própria placa. Embaixo de
tudo ele não tem em quem esbarrar — e cai no lugar onde o olho já está.

Como o contador de mãos saiu de cena, o e2e que media "a mesa andou" passou a usar a
**placa do desfecho** como sinal: a mesa diz que anda pelo que acontece nela, não por
um número no topo.

### Dois problemas de encaixe, documentados

A mesa de seis é apertada por definição, e dois defeitos de layout ganharam documento
próprio com diagnóstico medido e cinco ou mais soluções cada:

- **`docs/encaixefichas.md`** — a pilha de fichas de um assento cobre as cartas do
  vizinho. Medido a 320px: o assento da faixa de três tem **70px**, as duas cartas
  ocupam **62px**, sobram **4px de vão de cada lado** — e a pilha mede de 15px (uma
  coluna de fichas) a **32px** (duas). O transbordo vai de 14px a **31px**, e cresce
  com o stack. Na faixa de dois não acontece: ali o assento tem 120px.
- **`docs/quebralinhanick.md`** — o nome quebra linha na placa. A causa não é falta de
  espaço: é o `flex-wrap: wrap` que a linha da placa recebeu para o nome não ser
  espremido a zero. Com ele, o flexbox **quebra a linha antes de encolher** — a elipse
  do nome nunca chega a disparar, e o montante cai para a segunda linha.

**O que a Rota A ainda finge**, e precisa ser dito a quem assistir: os cinco rivais são
bots; as salas do lobby nascem no seu próprio navegador (dois aparelhos veem listas
diferentes); e a corrida pela cadeira é encenada com `setTimeout` — embora o contrato
dela (§4.3) já esteja escrito para o dia do servidor.

**Acumulado:** protótipo apresentável ~2,5 semanas · mesa desenhada ~4,5 semanas ·
**poker 6-max jogável ~3,5–4 meses** · **6 pessoas reais ~7–9 meses**.

### A menor fatia apresentável: F0 + F1 (~2 a 2,5 semanas)

Roteiro completo: Home → botão aceso → lobby com salas anunciando buy-in e blind →
criar mesa aberta ou fechada → 6 cadeiras vazias → clicar → sentar → ver os outros
ocupando cadeiras uma a uma.

**O que essa fatia finge, item por item** — e isso precisa ser dito a quem assistir:

1. Os 5 rivais são bots de uma lista de 20 nomes fixos.
2. A corrida pela cadeira é encenada com `setTimeout`. Não há dois cliques
   concorrentes em lugar nenhum.
3. As salas do lobby nascem no seu próprio navegador. Dois aparelhos veem listas
   diferentes.
4. Buy-in e blind são texto. Nada é debitado.
5. A mesa ainda não joga.

Apresentar isso é legítimo **desde que seja chamado de protótipo de fluxo**. Chamar
de "multiplayer funcionando" cria uma dívida que vence em três meses.

---

## 6. Onde o pedido, ao pé da letra, machuca

Cinco pontos. Em todos, a alternativa preserva a intenção.

### 6.1 A corrida pela cadeira pune quem chega

Se a posição importa (e no poker importa: quem age por último tem vantagem), perder
a corrida é perder vantagem por reflexo, não por jogo.

**Alternativa:** anunciar na tela, em texto fixo, **"O botão é sorteado depois que
todos sentam."** Se a posição relativa ao dealer é sorteada de qualquer forma,
perder a corrida não custa nada — e o gesto de escolher a cadeira continua
existindo pelo prazer dele. Ao segurar uma cadeira, mostrar *"Você ficará à esquerda
de Bruno"*, que é a única informação real que ela carrega.

### 6.2 Mesa aberta com stack fixo é torneira de fichas

"Qualquer um entra a qualquer momento com o quantitativo pré-definido" significa:
perdi tudo → saio → entro de novo com o stack cheio.

**Alternativa:** quem entra é distribuído **só na próxima mão** (chip
`Sentando · próxima mão` na cadeira), e a taxa de entrada é **por buy-in**, não por
sala — quebrou, paga de novo.

### 6.3 Mesa fechada sem reposição morre em silêncio

> **DECIDIDO: mesa fechada é CASH** — blind fixo, sem níveis, sem campeão. Fica
> fechada apenas a jogadores **novos**. Esta seção passa a ser a lista do que essa
> escolha obriga a construir junto.

Com 6 pessoas, alguém cai. Uma mesa fechada e sem reposição que perde três vira um
jogador sozinho olhando o feltro, sem saber se acabou. Sendo cash, ela **não tem fim
natural** — então o fim precisa ser construído à mão:

1. **Fechada é fechada a novos, não a reconexão.** A cadeira fica reservada 90 s com
   contador visível na própria cadeira (*"Dara caiu · 1:28"*), com auto-fold
   enquanto isso e sit-out depois. Sem isso, uma queda de sinal esvazia a mesa.
2. **Abaixo de 2 jogadores a mesa encerra sozinha** e liquida para quem ficou, com a
   tela de caixa que já existe. Ninguém pode ficar sozinho no feltro esperando.
3. **A porta de saída existe desde a 2ª mão**, como no 1v1 de hoje — é ela que
   substitui o campeão como forma de terminar.
4. **A folha de criação precisa dizer isso.** Ao escolher "mesa fechada", um hint:
   *"Ninguém entra depois de começar. Você sai quando quiser."*

O custo disso é real e não estava na conta original de F0: some o `PrizeSplit` (não
há premiação num cash) e entram a reserva de cadeira e a regra de encerramento.
Estimativa de F0 revisada para **5–7 dias**.

### 6.4 O blind de uma mesa longa

Seis jogadores com 2.000 fichas cada, pagando 30 por rodada, jogam por horas. Com a
decisão por cash isso é **esperado** — um cash game não acaba, você sai dele.

O que a interface precisa garantir, então, é que **sair seja sempre fácil e óbvio**:
a porta de saída em cena o tempo todo, o caixa a um toque, e o saldo do buy-in nunca
preso. É o oposto do padrão de cassino, e é deliberado.

### 6.5 O lobby nasce vazio

Com salas reais, o normal na primeira semana é ver **zero**. O estado vazio de hoje
é decorativo; ele passaria a ser a experiência padrão.

**Alternativa:** um CTA **"MESA RÁPIDA"** acima da lista (entra na mesa mais cheia,
ou cria uma), e mesas com bots continuando a existir — **rotuladas com honestidade**,
com uma tag `COM BOTS`.

---

## 7. Sobre o botão

**Recomendação: manter desligado até F0+F1 entrarem.**

O botão hoje abre o torneio antigo — chaveamento mata-mata e uma mesa única de
**21**, não de poker. Ligá-lo agora mostra outra coisa que não a que este documento
descreve, e ligar/desligar de novo é pior que esperar.

Quando F0+F1 entrarem, ligar é uma edição de um caractere em
[`tournament/availability.ts`](../src/features/bac-bo/tournament/availability.ts) —
e os 7 testes e2e do torneio voltam a rodar sozinhos, porque leem a mesma constante.

---

## 8. Armadilhas de estimativa

1. **"É só ligar a flag"** liga junto 7 testes e2e que assertam o lobby e a mesa de
   blackjack atuais.
2. **`Duelist` não é do poker** — mexer nele derruba o blackjack. Ver 3.3.
3. **F3b não tem valor visível e não dá para pular**: uma semana em que a tela não
   muda nada. É a fatia que se quer cortar, e cortá-la dobra o risco de F3c.
4. **O raise incompleto** — um all-in menor que o mínimo legal **não reabre a ação**
   para quem já pagou. É a regra mais sutil do Hold'em em anel, e a engine a tornou
   irreproduzível ao apagar o mínimo de propósito.
5. **O side pot contamina o `localStorage`**: `PokerResult` codifica o desfecho em
   escalares já gravados no navegador dos usuários. Exige migração v3→v4.
6. **O gargalo é altura, não largura.** Cada assento ganha stack, aposta e botão do
   dealer. Já existe uma media query espremendo a mesa a 620px de altura — com
   assentos que hoje **não têm cifra nenhuma**.
7. **Os bots são problema de produto, não de código.** A cabeça deles está calibrada
   por escrito para heads-up ("*no heads-up, um par bom é uma mão de apostar*").
   Contra 5 rivais isso está errado por construção, e qualquer pessoa percebe numa
   apresentação. Recalibrar é empírico e precisa de um simulador que não existe.
8. **O maior risco não é técnico:** o protótipo (2 semanas) e o produto real
   (7–9 meses) são separados por duas ordens de grandeza. Se a apresentação vender o
   protótipo como "está funcionando", o prazo cobrado será o do protótipo e a conta
   que chega é a do backend.

---

## 9. O que preciso decidir com você

~~1. Rota A ou Rota B?~~ → **Rota A**, decidido.
~~2. A mesa fechada é sit-and-go ou cash?~~ → **cash**, decidido. Ver 6.3.

Em aberto:

1. **A corrida pela cadeira:** mantém exatamente como pedido, ou entra o sorteio do
   botão depois que todos sentam (6.1)? Sem o sorteio, quem clica devagar perde
   posição por reflexo, e não por jogo.
2. **Qual é a data da apresentação?** Ela decide se começamos por F0+F1 (o fluxo
   inteiro, mesa ainda sem jogo) ou por F2 (a mesa bonita, sem lobby novo).

Ver também: [`corre.md`](corre.md) para o estado atual da engine de poker.
