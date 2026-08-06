# O "D" misterioso — o botão do dealer

> Aquele disco branco com um **D** preto que fica no vão entre a mão de um dos
> dois jogadores e a borda da mesa, no Texas Hold'em. Este documento responde três coisas: **o
> que ele é**, **o que ele faz neste jogo** (que não é tudo o que ele faz no poker
> de verdade) e **onde ele mora no código**.

---

## 1. A resposta curta

O **D** é o **botão do dealer**. É um disco que fica **sobre o pano, à esquerda da
mão de quem o tem** — e como a mesa é vista de cima, com o rival de cabeça para
baixo, a esquerda *dele* cai na direita da tela. Ele marca um dos dois assentos a
cada mão, e a única coisa que decide é a **ordem em que os dois falam**:

| Momento | Quem fala primeiro |
| --- | --- |
| **Pré-flop** (antes de qualquer comunitária) | quem **tem** o D |
| **Flop, turn e river** | quem **não** tem o D |

É só isso. Mas "só isso" decide mão, e a seção 3 explica por quê.

O botão é **sorteado na abertura da mesa e PASSA de lado a cada mão** — nunca é
fixo. Numa sessão que corre até alguém quebrar, deixá-lo parado num dos lados
entregaria de graça a única vantagem posicional que existe, mão após mão. Passando,
ela se reparte: quem fala por último nesta mão fala primeiro na próxima.

---

## 2. O que ele **não** faz nesta mesa

Quem já jogou poker online associa o botão a duas coisas que **aqui não existem**:

- **Ele não cobra blind nenhum.** Nesta mesa a entrada é fixa e **igual dos dois
  lados**: 100 créditos de cada um vão ao pote antes da primeira carta. Não há
  small blind nem big blind, e portanto o botão não define quem paga o quê.
  (O porquê está na tabela de decisões do [README](../README.md): blinds desiguais
  existem no anel para forçar ação num pote de várias pessoas; num duelo de mão
  única a entrada igual já cria o pote.)
- **Ele não distribui as cartas.** Num jogo caseiro o botão marca de quem é a vez
  de embaralhar. Aqui quem dá é a casa, sempre, com um baralho novo a cada mão.

Sobrou uma função só — e é a original, a que o disco existe para marcar desde
antes de haver crupiê profissional: **quem é o último a falar.**

---

## 3. Por que a ordem da palavra vale tanto

**Quem fala por último decide sabendo mais.**

Antes de agir, você já viu o que o outro fez. Se ele passou, é sinal de que
provavelmente não tem nada de especial — você pode apostar barato e levar o pote
ali mesmo. Se ele apostou forte, você ainda está a tempo de largar a mão sem
gastar mais. Quem fala primeiro não tem nenhuma dessas informações: aposta no
escuro, e ainda expõe a força da própria mão para o outro decidir em cima.

Chama-se **posição**, e é uma das poucas vantagens do poker que não dependem das
cartas que você recebeu.

### A regra que confunde quem vem do anel

No heads-up (dois jogadores) a ordem **se inverte** entre o pré-flop e o resto da
mão, e isso costuma parecer erro de programação:

```
PRÉ-FLOP     [D] fala primeiro  →  o outro responde
FLOP         o outro fala primeiro  →  [D] responde
TURN         o outro fala primeiro  →  [D] responde
RIVER        o outro fala primeiro  →  [D] responde
```

Não é erro: é a regra oficial do heads-up. A lógica é que a **vantagem de posição
só existe quando há informação nova sobre a mesa para ler**. No pré-flop não há
comunitária nenhuma — não há o que observar —, então a ordem é invertida como
compensação. Do flop em diante, quando as cartas comuns começam a abrir, o botão
recebe a posição de verdade, e a mantém até o fim da mão.

Em resumo: **o D dá uma pequena desvantagem antes do flop e a vantagem que
importa depois dele.**

---

## 4. Como ler o D na prática

- **O D é seu.** Do flop em diante você age depois do rival em toda rua. Vale
  esperar: deixe-o falar, e decida em cima do que ele fez. É a mão em que blefar
  é mais barato e largar é mais fácil.
- **O D é do rival.** Do flop em diante é você quem abre. Cada aposta sua é uma
  informação entregue antes de receber qualquer uma. Aposte com mão feita e passe
  com dúvida — apostar por apostar aqui costuma custar caro.

---

## 5. Onde ele mora no código

| Peça | Arquivo | O que faz |
| --- | --- | --- |
| **O sorteio** | [`LocalPokerEngine.ts`](../src/features/bac-bo/engine/poker/LocalPokerEngine.ts) | `const button: Duelist = this.rng.next() < 0.5 ? 'player' : 'opponent'` — uma vez por mão, em `beginHand`. |
| **A regra** | [`rules.ts`](../src/features/bac-bo/engine/poker/rules.ts) | `firstToAct(street, button)`: devolve o botão no pré-flop e o outro lado nas demais ruas. É a função inteira — três linhas. |
| **O estado** | [`types.ts`](../src/features/bac-bo/engine/poker/types.ts) | `button` atravessa a fronteira da engine dentro do `PokerRoundState`: a tela precisa saber de quem é, e não tem como deduzir. |
| **O disco** | [`PokerSeat.tsx`](../src/features/bac-bo/components/poker/PokerSeat.tsx) | Renderiza o disco ao lado da mão do assento marcado (`data-testid="dealer-button-{side}"`). |
| **A roupa** | [`index.css`](../src/index.css) | `.dealer-puck` — a matéria das fichas (relevo, borda tracejada, miolo rebaixado) em marfim, com o `D` em tinta preta. Ele vive num dos dois vãos `1fr` da linha da mão (`.poker-seat__line`), o que o centra no espaço livre sem número mágico nenhum. |

E o teste que garante que ele nunca marca os dois lados ao mesmo tempo está em
[`pokerArena.test.tsx`](../src/features/bac-bo/tests/pokerArena.test.tsx):
*"o botão do dealer marca UM lado só"*.

---

## 6. Se um dia o D sair da tela

Ele é pequeno e passa despercebido — foi o que motivou este documento. Três
alternativas já consideradas, registradas aqui para não serem redescobertas:

- **Escrever a ordem em vez de marcá-la** ("você fala por último"). Diz mais para
  quem não conhece a convenção, mas é texto na mesa a cada rua, e a mesa já
  disputa espaço num aparelho de 360 px.
- **Deixá-lo dentro da placa de identidade**, entre o nome e o stack, que é onde
  ele nasceu. Era compacto e era feio: espremido entre dois textos, o `D` lia como
  abreviação de alguma coisa em vez do disco que é. Sobre o pano, ao lado da mão,
  ele volta a ser uma peça da mesa.
- **Tirar o botão e fixar a ordem.** Simplificaria a tela e removeria uma regra,
  mas custaria a única vantagem do jogo que não vem das cartas — e um duelo de
  mão única em que os dois sempre falam na mesma ordem é um duelo mais pobre.

A escolha atual é manter o disco sobre o pano e explicar aqui.
