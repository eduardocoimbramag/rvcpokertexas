# CORRER — a desistência, de ponta a ponta

> Auditoria completa do que acontece quando alguém larga a mão. Este documento
> percorre o caminho inteiro — da regra na engine ao último pixel do desfecho —,
> nomeia **onde cada decisão mora no código** e registra, no fim, **os sete
> defeitos que a auditoria encontrou e como cada um foi consertado**.
>
> Escrito em 07/08/2026, depois de a ordem do convite de mostrar as cartas ser
> invertida e de o convite passar a valer para os dois lados da mesa.
> **Atualizado em 08/08/2026: os sete defeitos foram corrigidos.** Cada seção da
> Parte 4 traz o defeito como ele era e o conserto como ele ficou.
>
> Versão para quem não joga poker nem programa:
> [`corresimplificado.md`](corresimplificado.md).

---

## 1. A resposta curta

**Correr é abrir mão do pote.** Quem corre perde a mão na hora, **tenha as cartas
que tiver** — e é o único desfecho do poker que não olha carta nenhuma. As fichas
que já estavam no meio ficam no meio; as que sobraram no montante continuam do
dono. Não há comparação, não há empate, não há kicker.

Três coisas correm a mão neste jogo, e vale saber que são três:

| Caminho | Quem decide | Onde |
| --- | --- | --- |
| **CORRER** na barra de lances | você | [`BetControls`](../src/features/bac-bo/components/poker/BetControls.tsx) → `onFold` |
| **O relógio de 20 s vence** | a mesa, por você | [`gameStore`](../src/features/bac-bo/store/gameStore.ts) → `runActionClock` → `timeoutAction` |
| **LEVANTAR com a mão viva** | você, confirmando | [`LeaveTablePrompt`](../src/features/bac-bo/components/poker/LeaveTablePrompt.tsx) → `leaveTable` |

E o rival corre pela cabeça dele, em [`botDecision`](../src/features/bac-bo/engine/poker/rules.ts).

---

## 2. A regra, na engine

### 2.1 Correr é sempre legal

```ts
// rules.ts → legalActionsFor
if (stack <= 0) return [];
const actions: PokerAction[] = ['fold'];
```

`fold` entra na lista **antes de qualquer condição**. Quem tem ficha pode correr,
haja aposta na frente ou não.

Isso **contraria a regra clássica** — em sala, jogar a mão fora podendo passar de
graça é lance que não se aceita, porque não custa nada e só atrasa. Aqui custa: a
**entrada desta mão já está no meio**, e desistir dela é abrir mão de 100 fichas
para guardar as outras. É decisão de verdade numa sessão, e por isso a barra a
oferece o tempo todo. Está documentado no próprio `legalActionsFor`. **Não é
defeito.**

### 2.2 O que o lance faz

```ts
// LocalPokerEngine.applyMove
if (action === 'fold') {
  hand.foldedBy = side;
}
…
if (action === 'fold') {
  this.settle(hand);
  return;
}
```

Correr **não move ficha nenhuma** (`amount = 0`) e liquida a mão na hora — não
espera rua, não espera o rival. É o único lance que encerra a mão sozinho.

### 2.3 Quem ganha

```ts
// LocalPokerEngine.settle
const showdown = hand.foldedBy === undefined;
if (hand.foldedBy) {
  outcome = hand.foldedBy === 'player' ? 'lose' : 'win';
}
```

**Confirmado: quem correu sempre perde, independente da carta.** O `outcome` sai
de `foldedBy` e nunca chega a `compareRanks`. Uma quadra largada perde para uma
carta alta, como tem de ser.

O `showdown: false` que vai junto é o que a interface inteira usa para saber que
o pote foi **entregue**, e não **ganho**.

### 2.4 Como o pote se reparte

As duas mãos são lidas **mesmo numa desistência** (`readHand` roda dos dois
lados) — não para decidir nada, mas para o desfecho poder mostrar o que cada um
tinha. Quem decide continua sendo o `foldedBy`.

A partilha usa a mesma conta de qualquer desfecho ([`potShareFor`](../src/features/bac-bo/engine/poker/rules.ts)):

```
contested = min(committed.player, committed.opponent)   // o que esteve em disputa
back[lado] = committed[lado] − contested                // o excedente volta
vencedor recebe: back[dele] + contested × 2
perdedor recebe: back[dele]
```

**Conferido com números.** Você aumenta para 300, o rival corre (ele tinha posto
100):

| | você | rival |
| --- | --- | --- |
| comprometido | 300 | 100 |
| `contested` | 100 | 100 |
| devolvido (`back`) | 200 | 0 |
| pote disputado | +200 | — |
| **recebe** | **400** | **0** |

Total devolvido = 400 = 300 + 100. **As fichas da mesa fecham.** O excedente de
200 que o rival nunca cobriu volta para você, que é o correto — ninguém ganha
dinheiro que o outro não tinha como pôr.

### 2.5 O que a mesa entrega para a tela

```ts
// LocalPokerEngine.table
const revealOpponent = settled && (hand.result?.opponentShown ?? true);
opponentHole: revealOpponent ? hand.opponentHole : [],
```

As fechadas do rival abrem quando a mão acaba — **mas só quando ele as abre**.
Num showdown ele não escolhe: as duas mãos foram pagas para serem vistas. Numa
desistência ele escolhe, como você (ver `botShowsHand`), e o que ele guardou
**não atravessa esta fronteira**.

Abrir a mão de uma desistência continua sendo escolha de direção desta mesa
(numa sala de verdade quem desiste mucha e ninguém fica sabendo de nada), mas
agora é escolha **dos dois lados** — antes só as suas cartas podiam ser
guardadas, e isso era o defeito **D-1**.

---

## 3. O caminho na interface, beat a beat

Ordem de uma mão que morre por desistência, do lance ao próximo baralho:

```
lance CORRER
  │
  ├─ engine.act → settle() → phase 'settled'                      (instantâneo)
  │
  ├─ store: transitionTo('settle')
  │     MESA CONGELADA — nada do desfecho em cena
  │     └─ openShowPrompt(foldedBy)                                    5 s
  │           ├─ MOSTRAR  → cardsShown = true
  │           ├─ GUARDAR  → cardsShown = false
  │           └─ silêncio → cardsShown = false
  │
  ├─ runShowdownBeat(result)
  │     ├─ as fechadas do rival viram — SE ele as abriu     0 ou 1,5 s
  │     └─ o EMBATE roda, comprimido       foldSettleMs         2,0 s
  │
  ├─ closeHand() → phase 'handover'
  │     ├─ a mão vira histórico, persist()
  │     └─ a placa do vencedor entra
  │
  └─ scheduleNextHand()            FOLD_HANDOVER_SECONDS         5 s
        └─ nova distribuição
```

**Total de uma mão morta no pré-flop: ~12 s de cena** (eram ~19,5 s — ver o
defeito **D-4**). O mesmo caminho num SHOWDOWN gasta 1,5 s de virada + 3,0 s de
embate + 10 s de intervalo, e gasta bem: ali há duas mãos de cinco cartas para
ler e comparar.

### 3.1 O congelamento

`phase` já é `settle`, mas a interface segura tudo enquanto o convite está no ar:

```tsx
// PokerArena
const settling = phase === 'settle' && !showPrompt;
const revealed = settling || handover;
```

É `settling` que guarda o embate **e** a virada das cartas do rival. Perguntar
"quer mostrar?" com a mão do outro já aberta na tela seria pedir uma decisão com
a resposta dada.

### 3.2 O convite

[`ShowCardsPrompt`](../src/features/bac-bo/components/poker/ShowCardsPrompt.tsx) —
duas linhas, cinco segundos, duas saídas. **O silêncio vale por NÃO MOSTRO**, que
é o que uma sala faz com quem não diz nada.

Ele vale **dos dois lados**, e essa é a mudança mais recente do sistema:

- **quem levou o pote** escolhe se conta com o que ganhou (mostrar Ases faz o
  rival pagar mais barato depois; mostrar carta alta faz a aposta seguinte valer
  o dobro);
- **quem correu** escolhe se conta o que jogou fora (mostrar um par de Reis
  largado diz "eu solto mão grande quando a mesa pede").

### 3.3 A mão guardada

Guardar tem consequência em **duas** telas, e a regra é a mesma nas duas: o que
se escolheu não contar não é escrito em lugar nenhum.

| Peça | Guardada | Mostrada |
| --- | --- | --- |
| `ShowdownClash`, cada placa | "Mão guardada" / "não revelou" / força `?` | categoria, detalhe e força |
| `WinnerPlate` (a mão de quem venceu) | "MÃO GUARDADA" / "decidiu não revelar" / duas cartas `?` | a mão e as cartas que decidiram |

```ts
// ShowdownClash — cada lado guarda a sua
const youHid = byFold && !cardsShown;
const heHid = byFold && !result.opponentShown;
// WinnerPlate — manda a escolha de QUEM VENCEU, que é a mão que ela mostra
const shownByWinner = winner === 'player' ? cardsShown : result.opponentShown;
const concealed = byFold && !shownByWinner;
```

O `WinnerPlate` olha a escolha do vencedor porque é a mão dele que ela mostra: a
sua quando o pote foi seu, a dele quando foi dele.

Num **showdown** nada disso vale: as duas mãos foram pagas para serem vistas.

### 3.4 Levantar com a mão viva

A engine **recusa**, e com razão:

```ts
// LocalPokerEngine.leaveTable
if (hand && !hand.settled) {
  throw new GameEngineError('illegal-action', 'Há uma mão em andamento nesta mesa.');
}
```

Então o store marca o pedido, corre a mão, e cumpre o pedido quando o pote fecha:

```ts
// gameStore.leaveTable
if (phase === 'betting') {
  leaveRequested = true;
  void commitAction('fold');
  return;
}
```

Quem pede para levantar **não recebe o convite de mostrar** — ele já disse que
vai embora, e uma pergunta sobre a mão de que acabou de abrir mão seria uma porta
no caminho da saída.

---

## 4. Defeitos encontrados — e como cada um foi consertado

Sete achados. Nenhum quebrava a partilha do pote — a aritmética da mesa está
correta e fecha em todos os cenários testados. O que havia eram **assimetrias,
estados presos e ritmo**.

**Os sete foram corrigidos em 08/08/2026.** Cada seção abaixo mantém o defeito
como ele era (é o que explica por que o código é como é hoje) e fecha com o
✅ **CONSERTO** que entrou.

---

### D-1 · O rival nunca pode guardar a mão — ALTO

**O quê.** `revealOpponent = settled` abre as fechadas do rival em **toda** mão
que acaba. Você ganhou o direito de guardar; ele não tem esse direito.

**Por que importa.** O convite existe porque mostrar é informação que vale nas
mãos seguintes. Se o rival mostra sempre e você escolhe, o jogo entrega de graça
metade da leitura da mesa — e, pior, torna a decisão dele *legível*: se o rival
larga uma mão e você vê que era lixo, você aprendeu que ele blefa; ele nunca
aprende o mesmo de você quando você guarda. A vantagem informacional é
unilateral.

**Onde.** `LocalPokerEngine.table` (linha ~538) e `PokerArena.opponentCards`.

✅ **CONSERTO.** O bot ganhou a mesma moeda, em
[`botShowsHand`](../src/features/bac-bo/engine/poker/rules.ts) — três taxas, e
elas são diferentes porque a cabeça de um jogador de mesa é assim:

| Situação dele | Mostra |
| --- | --- |
| levou o pote com **mão feita** (par ou melhor) | 60% — publicidade barata |
| levou o pote com **carta alta** (blefou) | 18% — blefe aberto é arma gasta |
| **correu** | 15% — um lay-down aberto é a informação mais cara que ele tem |

A decisão é tomada **no instante em que a mão morre**, dentro de `settle()`, e
vai gravada no resultado como `opponentShown`. Não é sorteada na hora de
desenhar: assim ela é uma só e não muda a cada re-render.

E o sigilo é **estrutural**, como o de durante a mão: `table()` devolve
`opponentHole: []` quando ele guardou. A mão muchada não fica escondida na tela
— ela não chega até lá.

---

### D-2 · `leaveRequested` pode ficar preso — ALTO

**O quê.**

```ts
leaveRequested = true;
void commitAction('fold');   // pode voltar sem fazer nada
```

`commitAction` tem cinco guardas de saída silenciosa (`phase !== 'betting'`,
`actionPending`, `round.toAct !== 'player'`, ação ilegal…). Se qualquer uma
disparar, o `fold` não acontece e **a flag continua ligada**.

**Por que importa.** A flag é consumida em `closeHand`:

```ts
if (leaveRequested) { leaveRequested = false; closeTable(); return; }
```

Uma flag presa significa que a **próxima mão que fechar normalmente** fecha a
mesa junto e joga o jogador no caixa sem que ele tenha pedido nada. É perda de
sessão silenciosa.

**Hoje é alcançável?** Pela interface, não: a barra só existe na sua vez e o
botão fica desabilitado com lance em andamento. É um defeito **latente** — mas
`leaveTable` é ação pública do store, e a distância entre latente e ativo é uma
tela nova.

✅ **CONSERTO.** Os guardas do lance saíram para uma função própria, `canCommit`,
e agora existe **uma fonte da verdade** consultada pelos dois chamadores:

```ts
if (phase === 'betting') {
  if (!canCommit('fold')) return;   // não vai correr? então não marca nada
  leaveRequested = true;
  void commitAction('fold');
  return;
}
```

Nada async acontece entre a checagem e o lance — as duas são leituras síncronas
do mesmo estado —, então não há janela entre uma e outro.

---

### D-3 · O convite roda com a mesa já fechada — MÉDIO

**O quê.** Se a desistência derruba alguém abaixo da entrada, `advanceSession`
marca `over: true` no mesmo `settle()`. Mas o convite abre assim mesmo, e só
depois dos 5 s + 4,5 s o caixa entra.

**Por que importa.** Mostrar a mão é jogada **para as próximas mãos**. Com a mesa
fechada não há próxima mão: a pergunta não tem consequência nenhuma e ainda
segura o extrato por quase dez segundos. É pedir uma decisão vazia.

**Onde.** `gameStore`, o `if` que chama `openShowPrompt` — `settled.session.over`
já está disponível ali.

✅ **CONSERTO.** O convite virou uma função só, `showPromptFor(next)`, com as
três exceções no mesmo lugar — e `session.over` é uma delas. A mesa fechada vai
direto ao desfecho e ao caixa.

---

### D-4 · Uma desistência pré-flop custa ~19,5 s de cena — MÉDIO

**O quê.** 5 s de convite + 1,5 s de virada + 3 s de embate + 10 s de intervalo.

**Por que importa.** Uma mão que morre na primeira palavra teve **um lance**. Dar
a ela o mesmo ritual de um showdown de river faz a sessão parecer parada, e é o
tipo de coisa que cansa na quinta repetição. O embate ainda encena uma
"comparação" que não houve.

**Não é regressão**: o embate já rodava na desistência antes de qualquer mudança
recente. O convite acrescentou 5 s ao caso em que o rival corre — e agora também
ao caso em que você corre.

✅ **CONSERTO.** Três cortes, todos no mesmo princípio — não houve comparação,
então não há cerimônia de comparação a fazer:

| Etapa | Showdown | Desistência |
| --- | --- | --- |
| convite | — | 5,0 s (mantido: é decisão de verdade) |
| virada das fechadas | 1,5 s | **0 s** se ele guardou — não há o que virar |
| embate | 3,0 s | **2,0 s** (`foldSettleMs`) |
| intervalo | 10 s | **5 s** (`FOLD_HANDOVER_SECONDS`) |
| **total** | | **~12 s**, contra os ~19,5 s de antes |

O `ShowdownClash` recebe as marcas da coreografia de fora (ver `beats()`), então
a animação encurta **junto** com o relógio do store em vez de ser cortada no
meio. E a barra do intervalo recebe o total junto com os segundos — com um total
fixo ela nasceria pela metade no intervalo curto.

Os 5 s de intervalo continuam sendo uma janela de verdade para a porta de saída:
não viraram um beat a acertar.

---

### D-5 · Quem foi corrido pelo relógio recebe um convite que não pediu — MÉDIO

**O quê.** O relógio de 20 s vence, `timeoutAction` corre a mão pelo jogador, e
o jogador ganha na sequência um convite de 5 s: *"Você correu — deseja mostrar
sua mão?"*.

**Por que importa.** Ele não correu; a mesa correu por ele, e a razão mais
provável é que ele não está olhando a tela. A mensagem afirma uma decisão que ele
não tomou, e pede outra que ele também não vai tomar.

**Onde.** O `lastMove.timedOut` existe e atravessa a fronteira — o dado está lá,
só não é consultado.

✅ **CONSERTO.** Terceira exceção do `showPromptFor`: `next.lastMove?.timedOut`
não abre convite. Quem não decidiu nada não é convidado a decidir mais nada — e
a frase deixa de afirmar uma decisão que a pessoa não tomou.

---

### D-6 · Recarregar a página no meio da sessão perde o buy-in inteiro — ALTO (pré-existente, fora do escopo da desistência)

**O quê.** O stack é debitado do saldo quando o duelo começa
(`startDuel` → `debitStake`), mas a sessão vive **só em memória** — no `Map` da
engine e no store. O `persist()` grava saldo, histórico e ajustes; não grava mesa.

**Por que importa aqui.** O convite abre uma janela de 5 s em que a mesa está
parada esperando o jogador. É exatamente o tipo de momento em que se troca de
aba, chega uma ligação, a tela bloqueia. Se o app for descartado ali, os créditos
do buy-in **somem** — foram debitados e nunca serão creditados de volta.

**Não é causado pela desistência**, mas a desistência criou mais uma pausa em que
ele acontece.

✅ **CONSERTO.** A mesa aberta ganhou um **canhoto** persistido junto com o saldo
(`openTable` em [`GameStorageService`](../src/features/bac-bo/services/GameStorageService.ts)):

```
sentar        → canhoto = { buyIn, stack: buyIn }   gravado NO MESMO persist do débito
cada mão fecha → canhoto.stack = montante atual
levantar      → canhoto = null                      antes de gravar o caixa
```

Se o jogo nascer e encontrar um canhoto pendurado, aquela mesa nunca foi fechada:
ela é **liquidada pelo último placar conhecido** e o dinheiro volta ao saldo,
antes de qualquer outra coisa.

Guardar o **montante**, e não só o buy-in, é o detalhe que impede o abuso:
devolver o buy-in cheio pagaria a quem estivesse perdendo para recarregar a
página — o F5 viraria um botão de desfazer. Pelo último placar, recarregar
devolve exatamente o que a pessoa tinha na frente dela.

O canhoto também morre no caminho de erro (`refundAndFail`), senão o
carregamento seguinte pagaria de novo uma mesa já reembolsada.

---

### D-7 · O anúncio "CORREU" nasce debaixo do convite — BAIXO

**O quê.** `announceMove` põe o lance no alto-falante da mesa (`.move-call`,
`z-index: 4`) por `moveHoldMs` = 1,8 s. O convite entra no mesmo instante com
`z-index: 14` e cobre o centro do feltro.

**Por que importa.** Pouco, na prática: o convite diz "Fulano correu" na primeira
linha, então a informação não se perde. Mas são duas peças anunciando a mesma
coisa no mesmo instante, e uma delas está sendo desenhada para ninguém.

✅ **CONSERTO.** `showTable()` consulta o mesmo `showPromptFor` e cala a
plaquinha quando o convite vai entrar em cima dela. Uma decisão, dois
consumidores — duas cópias da condição sairiam de sincronia no primeiro caso
novo.

---

## 5. O que foi conferido e está correto

Para o registro — estes pontos foram auditados e **não** têm defeito:

- **A partilha do pote fecha** em desistência simples, em desistência depois de
  aumento e em desistência contra all-in por menos. O excedente não coberto volta
  para quem o pôs (`contestedOf`), e a soma das fichas da mesa não muda.
- **Quem corre sempre perde**, sem consultar carta (`outcome = foldedBy === 'player' ? 'lose' : 'win'`).
- **O bot nunca corre de graça**: com `toCall === 0` o `botDecision` devolve
  `check` ou `raise`, nunca `fold`. Não há mão morta sem aposta na frente.
- **O sigilo durante a mão é estrutural**: as fechadas do rival não atravessam a
  fronteira da engine enquanto `settled` for falso — não é a tela que as esconde,
  elas não estão lá.
- **A corrida entre o convite e a resposta** está travada por `stepSeq`: responder
  duas vezes, ou responder no milissegundo em que o relógio vence, não dispara o
  desfecho duas vezes.
- **O relógio da vez para** quando a fase deixa de ser `betting`, então o convite
  não corre com dois relógios em cima da mesa.
- **`cardsShown` vale uma mão só**: é zerado em `dealHand`, e o gesto não vaza
  para o pote seguinte.

---

## 6. Onde mexer

| Assunto | Arquivo |
| --- | --- |
| Regra do fold, partilha do pote, cabeça do bot | [`engine/poker/rules.ts`](../src/features/bac-bo/engine/poker/rules.ts) |
| Liquidação, sigilo, sessão | [`engine/poker/LocalPokerEngine.ts`](../src/features/bac-bo/engine/poker/LocalPokerEngine.ts) |
| Ordem dos beats, convite, levantar | [`store/gameStore.ts`](../src/features/bac-bo/store/gameStore.ts) |
| Congelamento da mesa, montagem das cenas | [`components/poker/PokerArena.tsx`](../src/features/bac-bo/components/poker/PokerArena.tsx) |
| O convite | [`components/poker/ShowCardsPrompt.tsx`](../src/features/bac-bo/components/poker/ShowCardsPrompt.tsx) |
| A confirmação de levantar | [`components/poker/LeaveTablePrompt.tsx`](../src/features/bac-bo/components/poker/LeaveTablePrompt.tsx) |
| Mão guardada no embate | [`components/poker/ShowdownClash.tsx`](../src/features/bac-bo/components/poker/ShowdownClash.tsx) |
| Mão guardada no placar | [`components/poker/WinnerPlate.tsx`](../src/features/bac-bo/components/poker/WinnerPlate.tsx) |

Ver também: [`dmisterioso.md`](dmisterioso.md) (o botão do dealer e a ordem da
palavra, que é o que decide quem tem a chance de correr primeiro).
