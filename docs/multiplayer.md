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

### O fim da mão passou a ter as três batidas do duelo

O maior buraco que sobrava entre as duas mesas não era de pixel: era de **compasso**.
No duelo, uma mão que acaba dispara três coisas em sequência — o **embate**
(`ShowdownClash`), a **placa do vencedor** (`WinnerPlate`) e o **relógio da próxima**
(`HandoverClock`). Na mesa de seis havia uma pausa cega de 5,6 s e uma plaquinha no
rodapé. O momento mais importante da mão — a hora em que as mãos se medem — passava
sem ninguém ver a medição acontecer.

A correção foi de arquitetura, e não de cópia. Cada uma das três peças ganhou um
**núcleo apresentacional** que não sabe de que mesa veio o veredito, e cada mesa virou
um **adaptador** dele:

| Peça | Núcleo comum | Adaptador do duelo | Adaptador da cash |
| --- | --- | --- | --- |
| Embate | `ClashStage` | `ShowdownClash` | `CashArena` |
| Placa do desfecho | `WinnerPlateFrame` | `WinnerPlate` | `CashVerdictPlate` |
| Relógio do intervalo | `HandoverClock` | `PokerArena` | `CashTableScreen` |

**A redução de seis mãos para duas placas é deliberada.** A cena do duelo compara dois
lados, e uma mesa de anel pode fechar com cinco mãos vivas. Quem escolhe os dois lados é
`buildClash`, no store, nesta ordem: você **não** levou → quem levou; você levou com
mais alguém → o outro dono do pote; você levou sozinho → a melhor mão que se mediu
contra a sua. Não é um resumo pobre — é a única comparação que decidiu o dinheiro, e as
outras perderam todas para a mesma placa. Enfileirar as cinco viraria uma tabela, e
tabela não é cena.

**O sigilo atravessa a tradução.** A leitura de um rival só entra no veredito quando ela
é pública: ou a mão foi ao showdown, ou ele escolheu abrir. Fora disso a placa dele vai
fechada — e vai fechada porque o **store não sabe**, não porque a tela decidiu não
contar.

O store ganhou uma fase (`cashPhase: 'hand' | 'settle' | 'handover'`) porque cada batida
mostra uma coisa diferente e a tela precisa saber qual. O intervalo da mesa de anel é de
**5 s**, contra os 10 do duelo: no duelo ele é o único respiro de uma sessão de duas
pessoas; aqui uma mão de seis já leva o dobro do tempo para correr.

### A porta saiu do canto e foi para onde a decisão se toma

A saída da mesa era uma **bandeira de 2 rem** no canto superior direito. Duas coisas
erradas nela: uma bandeira não diz "levantar" para ninguém, e o canto de cima não é onde
o olho de quem quer sair vai parar. Ela saiu de cena, e a saída passou a ter três
lugares, todos na faixa sob o polegar e todos escritos por extenso:

- na **barra de lances**, enquanto a vez é sua (`LeaveButton`, a peça do duelo);
- na **espera**, depois que você corre a mão — que era o buraco: quem corria ficava sem
  lance, sem vez e sem nada a fazer até a mesa fechar o pote, e ficar olhando não é uma
  escolha, é a ausência de uma;
- na **janela do intervalo**, ocupando a barra inteira, porque ali ela é a única decisão
  que existe.

### A escolha de cadeira ganhou fim

A tela das seis cadeiras não terminava: quem não clicasse ficava ali para sempre, e as
outras cinco pessoas junto. Ela agora tem um **relógio de 10 s** — a mesma barra do
intervalo entre mãos, porque a linguagem do tempo desta casa é uma só. Zerado, a mesa
senta você numa cadeira sorteada, preenche o resto e abre.

Saíram do lugar dele dois avisos em texto: o do sorteio do botão do dealer e a conta de
cadeiras livres. O primeiro explicava uma regra que a tela nunca contraria; o segundo
repetia, por extenso, o que as seis cadeiras mostram de relance. Nenhum dos dois
respondia a única pergunta que ficava no ar.

Sortear a cadeira não custa nada a ninguém, e é o §6.1 que garante isso: a cadeira só
decide quem fala depois de você, e o botão do dealer é sorteado quando a mesa abre.

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

### Um defeito que a janela do intervalo revelou

Com o desfecho parado em cena por oito segundos em vez de cinco e meio, ficou visível o
que a pausa cega escondia: **a projeção da mesa congelava no instante ANTERIOR ao
pagamento do pote**. Os stacks continuavam os de antes de repartir e as apostas seguiam
no feltro à frente de cada assento — e tudo pulava de uma vez quando a mão seguinte
começava.

A causa estava em `CashTableEngine.view()`: ela lia o stack e a aposta do assento **da
mão**, e `settle()` escreve o resultado noutro lugar (`this.stacks`). Enquanto a mão
corre as duas leituras são separadas de propósito — o que sobrou na frente e o que se
empurrou nesta rua são coisas diferentes, e é assim que uma mesa mostra. Fechado o pote
elas viram uma só.

O marco é o **pagamento**, e não o fim da mão: entre a última carta e `settle` existe um
instante em que a mão está fechada e o pote ainda não foi repartido — ler `this.stacks`
ali daria o montante de antes dos blinds. Quem separa os dois é `lastResult`.

O defeito não era novo; era só curto demais para ser visto.

### O intervalo tira a mesa de foco, e a placa virou porta

Duas peças a mais entraram nas DUAS mesas, e as duas pelo mesmo princípio: o que a
tela pede em cada momento.

**O véu do intervalo** (`TableVeil`). No fim de uma mão o feltro continua cheio —
cartas, fichas, placas de assento, o pote — e a placa do vencedor disputava a atenção
com uma mesa inteira que já não decide nada. O véu desfoca o FUNDO, e não a tela: ele
usa `backdrop-filter`, que age sobre o que está **pintado atrás**, então tudo o que vem
depois na ordem de pintura fica nítido — a placa do desfecho (z 12) e a faixa de lances
(z 12), que é onde estão o relógio da próxima mão e a porta.

É a diferença que importa em relação ao corte de cena do letreiro de rua
(`body.is-street-cut`), que desfoca o `#root` inteiro: ali não há nada com que
interagir; aqui há dois botões sob o polegar, e desfocar justamente o que se precisa
tocar seria o inverso do que o véu existe para fazer.

Ele **sangra para fora da arena**, e o de cima sangra o dobro. Colado no `inset: 0` o
véu tinha a caixa da arena, e a arena não é o feltro: sobrava uma faixa nítida no alto e
o desfoque terminava numa reta no meio do pano — a tela lia como um retângulo colado por
cima, e não como uma mesa fora de foco.

**A placa do nome abre o perfil.** A porta já existia no medalhão do desfecho do duelo,
e só lá: dava para saber com quem se jogou, nunca com quem se está jogando. Agora a
placa do rival é um `button` de verdade nas duas mesas — não um `div` que responde a
clique, porque a placa é o único alvo de toque do assento (na mesa de seis ela mede
~50px) e um `div` clicável não chega ao teclado, não anuncia nada ao leitor de tela e
não recebe o anel de foco da casa.

A folha é a mesma (`OpponentProfileSheet`): quem senta numa mesa desta casa tem um
perfil só. Ela fala em `Opponent`, e um jogador de torneio vira um pelo `asOpponent` —
a conversão que o chaveamento já fazia inline e que agora mora num lugar só.

A SUA placa não recebe a porta em nenhuma das duas mesas: um perfil de si mesmo aberto
por engano no meio de uma decisão cronometrada é só um toque perdido.

### As duas ferramentas da mesa, e o lugar certo do balanço

Duas consultas entraram nos cantos de cima das DUAS mesas — o único lugar da tela que
não disputa com nada: o feltro é do jogo, a faixa de baixo é do polegar, e o alto tem o
nome da mesa no meio e dois cantos vazios.

**O valor das fichas** (esquerda). As fichas têm valor fixo — 1.000, 500, 100 e 25 (ver
`CHIP_DENOMINATIONS`) —, e é por isso que um montante de milhares cabe numa faixa de
feltro: seis douradas são seis mil, e isso se lê sem contar nada. Quem não sabe a tabela
vê um monte colorido. O quadro mostra a **ficha da casa** (`.rvc-chip`, a mesma peça do
pote e do montante), e não um desenho parecido — seria a única ficha do jogo que não é a
ficha do jogo.

**O extrato da sessão** (direita). Saldo grande em cima, mãos embaixo, **da primeira
para a última**: um extrato de banco começa na mais recente porque a pergunta lá é "o
que acabou de acontecer"; aqui a pergunta é "como cheguei a este stack", e ela se
responde de trás para a frente. A lista rola sozinha e o saldo não — uma sessão longa
não pode empurrar para fora da tela a única linha que a resume. Quem correu tem selo
próprio: uma mão largada e uma perdida no showdown custam as duas fichas e não contam a
mesma história.

Ele é **derivado** do histórico que a casa já grava mão a mão (`handLog`), e não uma
segunda lista mantida em paralelo — o segundo lugar para a mesma verdade é sempre o que
sai de sincronia. A chave é a mesa: `matchId` no duelo, `tableId` na mesa de anel.

**E é para lá que o balanço da mão foi.** A placa do desfecho da mesa de seis trazia um
`-45` grande em cima do nome de quem levou, e era a única coisa que ela tinha a mais que
a do duelo. Ela agora é literalmente a mesma janela: quem levou, a leitura da mão, o que
a completa e as cartas que decidiram — inclusive o recorte de `decidingHand`, que mostra
a COMBINAÇÃO e não a mão de cinco. O balanço não se perdeu: virou uma linha do extrato,
onde vem com as outras mãos ao lado e o saldo da sessão em cima, em vez de aparecer e
sumir em cinco segundos.

### MESA ENCERRADA passou a ser do mesmo metal

A faixa do fecho da mesa era ouro médio chapado (`--color-gold`), pelo argumento de que
a peça não tem cifra a dar e não merecia o champagne. O argumento estava certo sobre o
**brilho** e errado sobre a **liga**: com "VALEU PELA PARTIDA" logo acima em metal
lapidado, um ouro fosco a dois centímetros dela não lia como discrição — lia como outra
peça, de outra tela.

Agora é o mesmo gradiente do título, recortado pelas letras, e a moldura ganhou o halo
que lhe faltava. O que continua diferente é a **festa**: o título tem halo redondo,
varredura rápida e partículas; a faixa tem o metal e mais nada.

Uma armadilha, e ela já estava documentada no título: numa caixa com
`background-clip: text` o fundo é pintado ANTES da sombra, e um `text-shadow` de 1px
cobre quase toda a glifa — o metal fica embaixo, invisível. O relevo sai de
`drop-shadow`, que age sobre o que já foi renderizado.

### O resumo do lobby diz o que a mesa de cash tem

A linha de resumo da sala trazia quatro leituras — tamanho, jogadores, taxa e premiação —
e duas delas eram de torneio:

- o **tamanho da mesa** ("Mesa de 6") repetia, por extenso, o denominador do `X/6` logo
  ao lado. Duas peças para o mesmo número, e a segunda gastava a maior largura da linha;
- a **premiação** não existe num cash: não há bolo no fim, há o que estiver na sua frente
  quando você levantar. Anunciar um prêmio numa mesa que não paga prêmio é prometer o que
  ela não tem.

Ficaram três, e são as que decidem se vale sentar: **quem já chegou**, a **compra** (as
fichas com que se entra) e o **blind** (o que uma volta de mesa custa). A razão entre os
dois últimos é a profundidade da mesa, e é ela que diz que jogo se vai jogar ali.

O blind vem com o **disco do dealer**, e não com uma ficha: quem paga o blind é quem
senta à esquerda dele, e é o disco que diz de quem é a vez. Foi preciso um ícone novo
(`dealer`) — um "D" traçado dentro do disco, sem tipografia carregada, como o resto do
conjunto. Os outros formatos mantêm a leitura deles: o torneio tem taxa e prêmio de
verdade.

### A marca da Home virou um flush de paus, com onda

O ícone acompanha o jogo, e este é o terceiro. O primeiro era um Ás sozinho, herdado do
blackjack. O segundo foi o par fechado do Hold'em — melhor, mas ainda a silhueta de duas
cartas que **qualquer** jogo de carta usa: de longe continuava lendo como blackjack, que
foi exatamente o que o dono apontou.

**Cinco cartas do mesmo naipe é uma imagem que só o poker tem.** Não é a mão que se
recebe: é a que se persegue.

A **onda** existe porque uma marca parada num menu é um adesivo. O gesto é o de um crupiê
passando o dedo pelo leque para conferir as cartas: uma sobe, assenta, a seguinte sobe. É
lento, tem respiro entre os ciclos e nunca tem duas cartas no ar pelo mesmo motivo. A
levantada é **no eixo da carta** — o grupo animado vive dentro do grupo que gira —, então
a da ponta sobe inclinada, como sairia de um leque de verdade; na vertical, as cinco
subiriam paralelas e o leque perderia a perspectiva.

O leque gira em torno de um pivô **muito abaixo** do quadro, e essa é a decisão de
geometria: a 54 unidades de distância, 11° deslocam a carta 8,6 de lado e a inclinam
quase nada. Um pivô logo abaixo das cartas daria o mesmo afastamento com 29° por carta —
as das pontas ficariam deitadas, e um flush deitado não se lê.

**Uma armadilha do framer, e ela é silenciosa:** com `initial={false}` no grupo animado,
uma sequência de keyframes é tratada como estado INICIAL e nunca chega a correr. O leque
nascia parado e parado ficava, sem erro nenhum. O e2e da Home passou a afirmar que o
gesto **acontece** — em amostras ao longo de um ciclo, a carta mais levantada tem de
mudar —, e a medição é pelo desvio de cada carta em relação ao próprio repouso: no leque
a do meio já nasce mais alta, e uma comparação crua diria "a do meio" em todas as
amostras.

O par de cartas antigo (`BrandCard`) saiu do projeto, e com ele o balanço que a Home
aplicava por fora: a peça tem movimento próprio agora, e as duas juntas davam um leque
que gingava enquanto as cartas pulavam.

### A ficha da sala virou de poker

A folha de detalhes ainda era a do chaveamento: formato, tamanho, **taxa de entrada** e
**premiação**. Numa mesa de cash duas delas são falsas — não há taxa (o dinheiro é a
compra, e ela volta em fichas) nem prêmio no fim (o prêmio é o que estiver na sua frente
quando você levantar). Uma ficha que anuncia um bolo que a mesa não paga é pior que uma
ficha incompleta.

Ficaram quatro leituras, nesta ordem: **sala** (pública/privada e o código), **mesa**
(quantos sentam · mão após mão), **compra** (o que se leva para o feltro) e **blinds**
(pequeno · grande, com a profundidade em blinds na dica). Saiu também o bloco
"Jogadores", que repetia por extenso o número que a linha da mesa já dá. Os outros
formatos mantêm a ficha deles.

### As fichas passaram a dizer a verdade

Este era o defeito mais grave da mesa, e ele era estrutural: **havia duas contas de
fichas**. O pote contava fichas de valor ÚNICO — uma a cada 25 créditos, no máximo 30 —
e o montante de cada jogador repartia por valor. As duas nunca bateram: um pote de 2.140
desenhava trinta fichas iguais, e nenhuma delas valia 2.140/30.

Agora há **uma conta só** (`chipsFor`), e ela vale para o pote e para o montante: cada
ficha na mesa vale o que a cor dela diz, e a soma bate com a cifra ao lado. É auditável —
o teste percorre o DOM somando as classes `rvc-chip--N` e compara com o valor da mesa.

**Três fichas novas** fecham qualquer conta: **10** (jade), **5** (lilás) e **1**
(terra). Com a menor valendo 25, um stack de 2.140 simplesmente não se escrevia em
fichas, e a mesa arredondava antes mesmo de perguntar se o exato cabia — o desenho dizia
um número e a cifra dizia outro. As cores ocupam a faixa fria e terrosa que faltava: o
vinho, o azul, o ouro e o marfim já estavam tomados. O verde vem **escuro e saturado**
porque verde é a cor do feltro — um verde claro desapareceria no pano.

**O conjunto é canônico, e isso é o que garante o mínimo de fichas.** Com
`{1, 5, 10, 25, 100, 500, 1000}` a repartição gulosa — pegar sempre a maior que couber —
é *provadamente* a de menor número de fichas. Não é sorte: é a mesma família do sistema
de moedas que qualquer caixa usa. Num conjunto não canônico ela falharia (com
`{1, 10, 25}`, 30 sairia como 25+5×1, seis fichas, em vez de 10+10+10, três). O teste
prova por exaustão contra a programação dinâmica para todo valor até 1.200 — se alguém
acrescentar uma ficha que quebre a canonicidade, ele cai.

O arredondamento continua existindo, e agora **só como último recurso**: o primeiro
degrau é 1 (exato), e a mesa só engrossa se a repartição exata não couber no espaço — o
mesmo gesto de um crupiê que troca as miúdas de quem está ganhando muito. O número
escrito ao lado nunca mente; o que cede é a granularidade do desenho.

**A ordem de empilhar inverteu.** Numa pilha vista de lado só a ficha do topo aparece
inteira: com a menor no topo, um pote de 2.030 era coroado por uma ficha de 5 e lia como
troco. A maior no topo faz a pilha ser lida pela melhor ficha dela, que é como se lê um
monte numa mesa de verdade.

O contrato antigo do pote — "dobrar a aposta dobra as fichas" — caiu junto, e a troca é
consciente: ele existia porque o pote não sabia o valor de nada, e o preço dele era a
mesa mentir. O teste que o guardava foi reescrito para o contrato novo, que é mais forte:
**as fichas do pote somam o valor da mesa.**

### A mesa parou de se mexer

Era o defeito mais visível da mesa de seis, e o mais difícil de nomear: "as cartas e as
fichas se movimentam". Medindo posição a posição ao longo de uma mão, ele se revelou como
**quatro causas somadas**, cada uma mudando a altura de um bloco — e como o miolo do
feltro é o item elástico da coluna, tudo o que está abaixo anda atrás.

| O que mudava | Quanto | Por quê |
| --- | --- | --- |
| A pastilha da aposta | 18px por fileira | Entrava e saía do fluxo a cada rua |
| A caixa do pote | 12px | Media a coluna que existe, não o curso inteiro |
| A faixa do alto-falante | 8px | `min-height` de 22px com um balão de 25 |
| A banda de lances | 3,2px | Reserva de 85px com uma barra de 88,4 |

Somadas, moviam o miolo em 18px, o board em 16 e **as suas cartas em 28**.

As correções seguem o mesmo princípio — *o que aparece e some não pode ocupar espaço em
disputa* —, mas cada uma o aplica de um jeito:

- **A pastilha SAIU DO FLUXO.** A primeira tentativa foi reservar o lugar dela, e estava
  meio certa: o salto sumia, mas o assento passava a carregar a altura da pastilha o
  tempo todo — 36px a menos de feltro num aparelho de 568px, que é onde ele não sobra.
  Fora do fluxo ela pende sobre o pano à frente do assento, que é onde as fichas de uma
  aposta ficam numa mesa de verdade.
- **A caixa do pote reserva a coluna cheia**, como a do montante já fazia. O argumento
  contrário estava escrito no código — com altura fixa sobra vazio no topo — e é
  verdadeiro; o preço dele era pior, porque o pote cresce a cada lance.
- **A faixa do alto-falante ganhou altura fixa**, e a altura é a do balão. Uma reserva
  menor que o conteúdo não reserva nada.
- **A banda de lances subiu de 5 para 5,6rem**, que é o que a barra mede de fato.

Com a caixa do pote reservando o curso inteiro, o que era folga virou altura cobrada — as
frações do miolo (`cqh`) desceram junto, e a coluna do pote passou de seis fichas para
quatro. O pote cresce **para os lados**, que é o que ele sempre disse que faria.

Medido depois: em 320×568 e 412×839, ao longo de dezenas de lances, **nenhum ponto de
referência da mesa muda de lugar** — nem a fileira de rivais, nem o miolo, nem o pote,
nem o board, nem as suas cartas. E o pote e o board voltaram a caber dentro do miolo no
aparelho mais apertado. O e2e afirma isso agora.

### A barra do intervalo zerava tarde

A tela do desfecho fechava um segundo antes de a barra esvaziar. A causa: a barra andava
**atrás** do contador — a cada tique o alvo passava a ser `restam/total` e a animação
levava um segundo inteiro para chegar lá, então no último tique ela mirava 1/5 e a tela
fechava com um quinto de barra ainda aceso.

Agora é **uma varredura só**, de cheia a vazia pelos N segundos: as duas pontas são o
mesmo instante do relógio que a gerou. É a mesma lição que o convite de mostrar a mão já
tinha aprendido e que esta peça repetia por não tê-la herdado. O ponto de partida é
congelado no monte — o componente re-renderiza a cada segundo, e uma duração derivada do
`seconds` corrente reiniciaria a varredura a cada tique.

Medido a cada 250ms: a barra desce linear de 0,96 a **0,012** no último quadro antes de a
tela fechar.

### A marca ganhou a sequência

O flush virou um **straight flush até o rei** — 9, 10, J, Q, K —, com o índice traçado no
canto de cada carta. O canto esquerdo é justamente o que o leque deixa de fora (cada
carta esconde um terço da vizinha pela direita), e é por isso que as cinco se leem como
uma sequência e não só como cinco paus.

### O caixa da mesa de seis é o caixa do duelo

Levantar de uma mesa de cash creditava o **stack bruto** e voltava direto para o salão. Duas
coisas erradas nisso, e a segunda é a grave:

- a sessão inteira — quantas mãos, quanto subiu, quanto desceu — terminava **sem uma linha
  sobre ela**;
- a **casa não cobrava nada**. No duelo a comissão incide uma vez, no caixa, e só sobre o
  lucro: 90% dele fica com quem jogou, 10% com a casa (ver `cashOutValue`). A mesa de seis
  passava por fora disso.

Agora as duas mesas passam pela mesma porta. A conta vive numa função só — duas cópias
divergiriam no primeiro ajuste, e divergir aqui significa **pagar valores diferentes pela
mesma mão**. O que cada mesa traz é o par de números (compra e stack final) e para onde
levam os dois botões: o duelo oferece NOVA MESA, a sala oferece OUTRA SALA, porque é da
vitrine que se entra numa mesa de cash.

A tela é a mesma peça (`SessionClose`, extraída do `SessionBanner`), com o mesmo título em
metal, a mesma faixa MESA ENCERRADA e o cenário ainda em cena — o fecho não é outro lugar,
é a mesma mesa depois de as cartas saírem.

**E a mesa que acaba também abre o caixa.** Quando não há duas pessoas com ficha não há mão
a distribuir, e antes daqui a mesa apenas destravava o botão de sair e ficava parada: quem
estava na frente tinha de descobrir por conta própria que não ia acontecer mais nada. Agora
ela fecha sozinha, que é o que uma sala faz.

### O caixa ganhou o cenário do duelo

A tela do fecho estava na câmera de CIMA, que é a da mesa em jogo — e ali a crupiê fica
fora de quadro **por desenho**: o vão que o corpo dela ocupa volta a ser feltro. O
resultado era um encerramento sobre um pano vazio.

O duelo já resolvia isso e o código estava lá: `cameraFor` desce para o frontal assim que
a fase vira `completed`, e a reação da crupiê sai de `resolveDealerReaction`. O caixa da
mesa de seis passou a usar os dois — a câmera frontal traz o salão e a crupiê de volta, e
ela reage ao desfecho da **sessão** no lugar do da mão: comemora o lucro, consola o
prejuízo, dá de ombros no zero a zero. Numa mesa que corre até você levantar, é a sessão
que decide se houve o que comemorar.

A comissão não entra nessa conta: ela é do caixa, e quem subiu na mesa subiu —
independentemente do que a casa cobra na porta.

### A mesa aberta saiu de cena

Mesa aberta é a que continua na vitrine depois de começar: quem chega senta numa cadeira
vaga e entra na mão seguinte. Ela está **desligada** (`OPEN_TABLE_ENABLED`), e o motivo é
honestidade, não escopo — a entrada no meio da sessão pede coisas que a mesa ainda não
tem: cadeira que vaga e é reocupada, blind obrigatório de quem entra fora da posição, e o
corte de sigilo para quem chega no meio de uma mão. Anunciar "Aberta" numa sala em que
ninguém entra é a vitrine mentindo.

Nada foi removido. A folha de criação não pergunta mais (o campo continua lá, atrás do
flag), toda sala nasce fechada e a vitrine só sorteia mesas fechadas. É o mesmo padrão dos
outros dois modos desligados, pelo mesmo motivo: um `git revert` de uma remoção é caro e
arriscado; um booleano é uma decisão que se desfaz.

Um teste guarda o flag pelos dois lados — se alguém religar a régua da folha sem religar a
vitrine (ou o contrário), ele cai.
