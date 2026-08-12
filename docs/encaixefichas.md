# As fichas de um assento cobrem as cartas do vizinho

Na mesa de 6, a pilha de fichas de um jogador aparece por cima das cartas do jogador
à esquerda. Este documento explica **por que** isso acontece, com as medidas reais, e
lista **sete soluções** com o que cada uma custa.

> Este documento tem um irmão: **`quebralinhanick.md`**, sobre o nome que quebra linha
> na mesma placa. Os dois problemas dividem a mesma escassez de largura, e uma das
> soluções aparece nos dois — com uma **dependência de ordem** entre elas que está
> explicada na seção 3.

---

## 1. O diagnóstico, em linguagem de gente

Cada assento de rival é uma coluna com duas partes empilhadas: a **placa** (nome e
fichas) em cima, e embaixo a **linha da mão**, que tem três compartimentos lado a lado:

```
   [ vão esquerdo ]  [ as duas cartas ]  [ vão direito ]
      as fichas                            o disco "D"
```

O problema é de espaço, e é grande: **a linha da mão pede 116 px e o assento tem 70 px.**

### As medidas, num aparelho de 320 px de largura

| Peça | Quanto mede |
| --- | --- |
| Largura do assento numa faixa de **três** | **69,9 px** |
| As duas cartas (o compartimento do meio) | 62,1 px |
| Sobra para cada vão | **3,9 px** |
| A pilha de fichas (2 colunas) | **35,4 px** |
| O disco do dealer | 18,4 px |
| **Total pedido** | **115,9 px** |
| **Faltam** | **46,1 px** — 66% a mais do que cabe |

Num aparelho de 412 px o assento cresce para 96,8 px, mas a carta cresce junto, e o
déficit continua: faltam 43,6 px.

### Por que o excesso é PINTADO para fora, em vez de espremido

Três coisas se somam, e é preciso as três para o defeito acontecer:

1. **O compartimento do meio serve-se primeiro.** As duas cartas têm largura fixa
   (`auto` no CSS), então elas pegam os 62 px antes de sobrar qualquer coisa para os
   vãos. Os vãos ficam com as migalhas.
2. **Os vãos foram autorizados a encolher até zero.** A regra `min-width: 0`
   (`index.css`, `.cash-seat__gutter`) desliga exatamente a proteção que faria o vão
   respeitar o tamanho do que está dentro dele.
3. **A pilha se recusa a encolher.** O `ChipRack` é `flex: none` — ele mantém os 35 px
   custe o que custar. Como o vão só tem 3,9 px, os outros 31 px são desenhados **fora**
   da caixa do assento.

E não há nada barrando: nenhum elemento acima tem recorte (`overflow`), então o desenho
simplesmente atravessa para o assento ao lado.

### Onde exatamente ele cai

Medido com as posições reais na tela:

- **A 320 px:** a pilha do assento do meio invade **24,5 px** da segunda carta do
  vizinho — **81% da carta coberta**.
- **A 412 px:** invade 17,6 px — 45% da carta.
- **No assento da ponta**, a pilha sai 17 px para fora da faixa e **3,5 px para fora do
  feltro**, chegando a pintar em cima do trilho de mogno.

### Duas observações que estreitam o problema

- **Só acontece na faixa de TRÊS.** Na faixa de dois o assento tem 120 px, os vãos
  ficam com 26 px cada e a pilha de 16 px cabe folgada. Por isso o defeito aparece em
  alguns assentos e não em outros.

  E isso tem consequência direta em **quais mesas sofrem**. Os rivais se dividem assim:

  | Mesa | Rivais | Faixas | Tem faixa de 3? |
  | --- | --- | --- | --- |
  | 3 jogadores | 2 | `[2]` | não |
  | **4 jogadores** | 3 | `[3]` | **sim** — assento de 78,9 px, invasão de 23,5 px (72% da carta) |
  | 5 jogadores | 4 | `[2, 2]` | não |
  | **6 jogadores** | 5 | `[3, 2]` | **sim** — assento de 69,9 px, invasão de 24,5 px (81% da carta) |

  Ou seja: **as mesas de 4 e de 6 sofrem; as de 3 e 5 não.** A de 4 sofre um pouco
  menos porque tem uma faixa só, e ela não paga os 10% da perspectiva.
- **Piora com o stack.** Uma pilha de uma coluna mede 15 px e transborda 14 px; uma de
  duas colunas mede 32 px e transborda 31 px. Quanto mais fichas o rival tem, mais ele
  invade o vizinho.

- **A pilha de duas colunas não cabe em NENHUMA largura de tela suportada.** A ficha
  tem teto (`1.05rem`), então a pilha de duas colunas para de crescer em 35,95 px — mas
  a folga máxima do vão, já no aparelho mais largo que a casca do app permite (480 px),
  é 33,8 px. **Falta por 2,15 px mesmo no melhor caso.** Isso elimina de saída qualquer
  solução que dependa de "esperar uma tela maior".

- **O orçamento vertical já está negativo.** Numa tela de 568 px de altura, a soma do
  que a mesa precisa passa do que existe em cerca de 48 px — foi por isso que a banda
  do rodapé virou `clamp(6.4rem, 17dvh, 8.9rem)` em vez de fixa. Isso **elimina a
  família inteira de soluções do tipo "põe a pilha numa linha separada"**: elas trocam
  um problema de largura por um de altura, num lugar onde não há altura para dar.

---

## 2. As sete soluções

### 1. Só a cifra: o rival perde a pilha
*Esforço: baixo*

**O que muda:** tirar o `ChipRack` do vão esquerdo do assento de rival. O vão fica
vazio, como o da direita já fica quando o assento não tem o disco.

**Ganha:** zera os 35,4 px que o vão pedia, e com eles os 24,5 px de invasão. **Nenhuma
informação sai de cena** — o montante continua escrito na placa, a dois centímetros
dali. Sobra apenas o transbordo do disco do dealer (7,5 px), que é pequeno e afeta um
assento por mão.

**Perde:** a leitura de relance de **quem está na frente**. É a razão de existir da
peça, e o próprio código a defende: *"um número não dá essa leitura de relance; duas
pilhas dão"*. Com seis assentos, comparar seis cifras de 7 px de corpo é uma tarefa de
leitura; comparar seis pilhas é um olhar.

**Risco:** o seu assento mantém a pilha, e a mesa fica assimétrica — você tem fichas
desenhadas, os cinco rivais não.

---

### 2. Recortar: o assento vira caixa fechada
*Esforço: baixo*

**O que muda:** uma linha — `overflow: clip` no assento. Nada de um assento pode
aparecer dentro de outro, nunca mais.

**Ganha:** é a única solução que **continua valendo depois de qualquer mudança futura**.
As outras seis são calibrações: se amanhã alguém mexer no tamanho da carta, no buy-in
ou na faixa, elas voltam a estourar. Esta não.

**Perde:** o montante do rival, na prática. Dos 32 px da pilha sobram 3,9 px visíveis —
12% de uma ficha. O que fica em cena é uma meia-lua cortada rente, que lê como **defeito
de renderização**, não como pilha.

**Risco:** `overflow: clip` também corta o que hoje sangra para fora **de propósito** —
o halo dourado do assento da vez e o brilho da carta vencedora no showdown.

> Esta solução não serve sozinha. Ela serve como **rede de segurança** depois de outra.

---

### 3. A faixa de três para de pagar a perspectiva
*Esforço: baixo*

**O que muda:** hoje a faixa mais funda é 10% mais estreita que a da frente, para dar
sensação de profundidade (`width: calc(100% - --lane-depth * 10%)`). Só que a faixa mais
funda é justamente a de **três assentos** — a mais apertada. A perspectiva passa a ser
feita só pelo tamanho da carta, que já a faz (8% por faixa) e pelas pontas que descem
5%.

**Ganha:** **+9,1 px por assento** a 320 px (69,9 → 78,9) e +11,4 px a 390 px. É largura
de graça, e ajuda o outro problema desta mesa (ver `quebralinhanick.md`).

**Perde:** a curva da mesa fica mais rasa. As duas faixas passam a ter a mesma largura
útil, e a profundidade sobra só na carta e no deslocamento das pontas.

**Risco:** ⚠️ **ela PIORA este problema se aplicada sozinha.** Alargar a faixa empurra os
assentos das pontas para perto da borda, e a pilha do rival da ponta — que hoje já sai
17 px para fora — sai ainda mais: de ~13,6 px de folga para ~0,6 px com uma coluna de
fichas, e para **−18 px com duas**. Foi exatamente para evitar isso que a faixa ganhou
`padding-inline: 0.9rem`, e o comentário no CSS registra o motivo.

> **Ela só é segura DEPOIS que a pilha do rival sair do vão** (solução 1). Sem pilha
> para empurrar, a objeção desaparece — e aí os +9 px viram ganho puro, aproveitado
> pela placa. **A ordem importa.**

**Nota:** na mesa de **4 jogadores** esta mudança não faz nada — lá a faixa de três já é
a única, e já tem 100% da largura. Ela nivela a mesa de 6 com a de 4; não conserta
nenhuma das duas sozinha.

---

### 4. Um disco e a cifra, fora da linha
*Esforço: médio*

**O que muda:** a pilha vira uma **pastilha achatada** — uma ficha da maior denominação
do stack, mais o valor —, montada entre a placa e a linha da mão, onde o assento tem os
70 px inteiros.

**Ganha:** a **cor** da ficha mantém a escala de relance sem gastar largura de pilha:
dourado é milhar, roxo é meio milhar. Transbordo zero nos dois tamanhos de tela.

**Perde:** a **altura** da pilha, que é a comparação fina — a cor diz a ordem de
grandeza, não a diferença entre 900 e 1.400, e é aí que o cash se decide. E duplica: a
mesma cifra passa a aparecer duas vezes no mesmo assento, a 10 px de distância.

**Risco:** é uma linha a mais em cada assento — cerca de 24 px na mesa de 6. Quem paga
é o meio do feltro, e **o orçamento vertical já está 48 px negativo** (ver o
diagnóstico). Esta solução é a mais elegante da lista e a que a tela menos tem como
pagar; só entra se algo mais devolver altura antes.

---

### 5. Teto de uma coluna e ficha menor
*Esforço: médio*

**O que muda:** a pilha do rival passa a ter **uma coluna só**, e a ficha encolhe de
metade da carta para um terço dela (15 px → 9,6 px).

**Ganha:** cabe na folga real nos dois tamanhos de tela. **Nada muda de lugar e nada
muda de natureza** — a mesa continua com pilha de fichas em todos os assentos.

**Perde:** a ficha do rival cai para 9,6 px, **abaixo do piso que o próprio código
tinha escolhido**, e no limite de distinguir vinho de roxo de dourado. E o teto de uma
coluna obriga a arredondar mais grosso: stacks diferentes passam a desenhar a mesma
pilha.

**Risco:** **alto se feito da forma errada.** As constantes da pilha são compartilhadas
com o duelo 1v1 e travadas por teste. Mexer nelas quebra o duelo — a mudança tem de ser
uma propriedade passada só no assento do rival da mesa de 6.

---

### 6. Acabar com a faixa de três: 5 rivais viram 2+2+1
*Esforço: médio*

**O que muda:** o máximo por faixa cai de 3 para 2. Cinco rivais passam a se dividir em
`[2, 2, 1]` em vez de `[3, 2]`.

**Ganha:** com três faixas, a mais funda fica 20% mais estreita, o assento sobe para
92,8 px e o vão para **17,9 px**. A folga antes da carta do vizinho sobe de 7,7 px para
35,9 px — sobra até para a pilha de duas colunas. **Nenhuma linha de CSS muda.**

**Perde:** **altura**, que é o recurso mais escasso desta tela. Uma faixa a mais custa
cerca de 58 px numa tela de 568 px, e quem paga é o meio do feltro — o pote e as cinco
comunitárias.

**Risco:** a curva das pontas foi desenhada para faixas de 2 e 3; numa faixa de **um**
assento ela não se aplica, e o assento solitário fica visualmente órfão.

---

### 7. A carta do rival cede o espaço
*Esforço: baixo*

**O que muda:** quem come o assento é o compartimento das cartas (62 dos 70 px).
Encolher a carta de 0,62 para 0,36 da carta da casa devolve os dois vãos.

**Ganha:** carta de 19 px, vão de 15 px cada — o rack cabe. Uma linha por arquivo,
nenhuma peça muda de lugar.

**Perde:** exatamente o que já foi corrigido de propósito. A carta subiu de 0,46 para
0,62 porque *"uma carta de rival miúda era o que mais denunciava que esta não era a mesa
do duelo"*. **0,36 é menor que o valor já rejeitado.**

**Risco:** a carta é a origem do tamanho da ficha **e** do disco do dealer. Encolher a
carta encolhe as três peças juntas.

---

## 3. O que eu faria

**A combinação 1 → 3 → 2, e a ordem não é opcional:**

1. **Só a cifra: o rival perde a pilha.** É o que de fato zera o déficit — 35,4 px de
   demanda viram zero —, e o montante continua em cena, escrito na placa.
2. **Depois disso**, a faixa de três pode parar de pagar a perspectiva (+9 px). Antes
   disso, não: com a pilha ainda no vão, alargar a faixa joga a pilha do assento da
   ponta para fora da tela (ver o aviso da solução 3). Feita na ordem certa, ela vira
   largura de graça — e é a placa que a aproveita, resolvendo boa parte do problema
   descrito em `quebralinhanick.md`.
3. **Recortar o assento** como rede de segurança, para que nenhuma mudança futura
   reintroduza o defeito. Com a pilha fora do vão, o que ela recortaria é só o
   transbordo residual do disco do dealer.

O motivo de eu escolher tirar a pilha do rival e não encolhê-la: com 46 px faltando num
assento de 70 px, **não existe calibração que resolva com margem**. As soluções 5 e 7
fazem caber por 2 ou 3 px — e um stack de cinco dígitos, um nome mais longo ou um
aparelho um pouco mais estreito estouram de novo. Some a isso o fato medido de que a
pilha de duas colunas **não cabe em nenhuma largura de tela suportada**, e a conclusão
se impõe: tirar a peça resolve por definição; encolher a peça adia.

**Se a leitura de relance for inegociável**, a alternativa é a **4** (pastilha com ficha
colorida) em vez da 1: mantém a cor como escala e custa altura em vez de largura. Mas
leia o aviso dela — o orçamento vertical já está negativo, então ela só é viável se
alguma outra mudança devolver altura primeiro.

**O que eu NÃO faria:** a solução 7, porque desfaz uma decisão que já foi tomada e
registrada; e a 6 sozinha, porque troca um problema de largura por um de altura numa
tela onde a altura já está no limite.

### Uma nota sobre as outras mesas

O defeito acompanha a **faixa de três**, não o número de jogadores — e faixa de três
existe na mesa de **4** (3 rivais numa faixa) e na de **6** (`[3, 2]`). As mesas de
**3 e 5** não têm faixa de três e estão limpas.

Consequência para a escolha: uma solução aplicada só à mesa de 6 deixa a de 4 quebrada.
As soluções 1, 2, 3, 5 e 7 valem para as duas, e não pioram as mesas de 3 e 5 (nelas
sobra largura de qualquer jeito). A 6 muda a geometria de todas — inclusive das que hoje
estão certas.

---

# 4. O que foi construído — a solução 8, que não estava na lista

> Esta seção fecha o documento. Ela é o registro do que entrou no jogo, e ela
> **substitui a recomendação da seção 3**. As sete soluções continuam escritas
> acima porque a análise delas é o que levou até aqui — em particular a conta
> que mostra que nenhuma calibração resolvia com margem.

## A ideia que faltava

As sete soluções aceitam sem discutir uma premissa da montagem antiga: **o lado
da pilha é fixo**. Ela sempre saía à esquerda do assento, para todo mundo. Com o
lado fixo, o vizinho da esquerda está sempre no caminho, e só resta disputar
pixels — encolher a ficha, encolher a carta, recortar o assento.

A solução 8 troca a premissa: **o lado da pilha vem do lugar na faixa.**

| Lugar na faixa | Para onde a pilha vai | Quem está no caminho |
| --- | --- | --- |
| Assento da esquerda | Para a **esquerda**, na borda do feltro | ninguém |
| Assento do meio (só na faixa de três) | Para **baixo**, sob as próprias cartas | ninguém |
| Assento da direita | Para a **direita**, na borda do feltro | ninguém |

Não sobra sobreposição para calibrar porque não existe sobreposição possível: as
pilhas das pontas apontam para fora da faixa, e a do meio desce para um espaço
que é só dele. É a diferença entre **fazer caber** e **não ter o que caber**.

## Como o espaço passou a ser repartido

Três mudanças de geometria sustentam a ideia:

1. **O assento tem a largura das duas cartas, e nada mais.** Antes ele tomava a
   fração igual da faixa (`flex: 0 1 (100%/colunas)`), e as cartas se serviam
   dessa fração antes dos vãos — daí os 3,9 px de sobra medidos na seção 1. Com
   a largura vinda da carta, a conta se inverte: o assento é exato e **toda a
   sobra da faixa vira corredor nas bordas**.
2. **Os vãos da linha da mão viraram fendas de largura zero.** Uma fenda de
   largura zero não é um vão morto: é uma dobradiça. Com `justify-content:
   flex-end` a pilha é desenhada para a esquerda dela; com `flex-start`, para a
   direita.
3. **A faixa reserva o corredor nas duas bordas** (`--cash-rack-w`), medido em
   fichas: duas colunas mais o vão entre elas dão 2,14 fichas, e a reserva é
   2,3.

## O que isso permitiu desfazer

A ficha e a carta do rival **voltaram ao tamanho anterior** — a carta a 0,62 da
carta da casa, a ficha a 0,5 da carta. As soluções 5 e 7, que tinham sido
aplicadas, foram revertidas: elas pagavam com leitura um problema que a
geometria resolve de graça.

## O que ainda cobra, e quanto

A faixa de **três** continua sendo a única que aperta, e agora a conta é
explícita: três pares de carta cheios (186 px) mais os dois corredores (75 px)
mais os vãos passam de 272 px, que é o feltro num aparelho de 320. Por isso a
carta recua numa faixa de três — **8%**, contra 4% por faixa de profundidade
(`--lane-crowd` e `--lane-depth`).

Isto corrige de passagem um defeito que a seção "Uma nota sobre as outras mesas"
antecipou: a mesa de **4** tem a faixa de três **na frente**, onde a
profundidade não cobrava nada — era a única mesa em que a pilha de duas colunas
ainda alcançava o trilho de mogno.

## Medido no navegador, depois de pronto

Cinco configurações, com uma mão em andamento:

| Mesa | Tela | Invasão de pilha em carta | Pilha fora do feltro | Apelido cortado |
| --- | --- | --- | --- | --- |
| 6 | 320 | nenhuma | nenhuma | nenhum |
| 6 | 412 | nenhuma | nenhuma | nenhum |
| 5 | 320 | nenhuma | nenhuma | nenhum |
| 4 | 320 | nenhuma | nenhuma | nenhum |
| 3 | 320 | nenhuma | nenhuma | nenhum |

O pior caso real medido — pilha de duas colunas no assento da direita da mesa de
4 a 320 px — para a **5 px** da borda do feltro.

## O que mudou junto, e por quê

- **O disco do dealer saiu do vão e subiu para o lado da placa.** O vão virou o
  corredor da pilha, e o disco não é um atributo da mão que está na mesa: é de
  quem senta ali. A fenda dele é reservada em **todo** assento, com botão ou
  sem, senão a placa de quem tem o botão seria a única estreita e a
  irregularidade mudaria de assento a cada mão.
- **A placa passou a ter largura fixa** — o que sobra do assento depois da fenda
  do disco. Ver `quebralinhanick.md`: a placa empilhada resolveu a quebra de
  linha, e a largura fixa resolve o resto do mesmo problema, que era a moldura
  mudar de tamanho sozinha conforme o apelido e o montante.
- **O vão entre assentos triplicou** (de 0,12 rem interno para ~0,34 rem
  externo). Sem essa diferença, seis cartas na fileira de cima liam como uma
  tira contínua e não como três pares.

## Ajuste posterior: o afastamento, a placa centrada e o miolo

Três correções entraram depois da primeira medição, e uma delas descobriu um
defeito antigo.

**A pilha das pontas ganhou respiro.** Encostada na carta, ela lia como parte da
mão. Um terço de ficha (~5px a 320px) separa sem soltar — mais que isso e a
pilha passa a parecer de ninguém, no meio do feltro. O corredor reservado nas
bordas cresceu junto, de 2,3 para 2,55 fichas. Quem está no meio da faixa não
recebe o afastamento: lá a pilha desce, e na vertical o vão da coluna do assento
já a separa.

**A placa voltou ao centro das duas cartas.** Ela estava ~6px à esquerda, e a
causa era a montagem: a cabeça do assento era uma linha flex com a placa
elástica e o disco no fim, então a placa ocupava tudo *menos* o disco e o centro
dela caía meio disco à esquerda. Virou um grid de três colunas com as laterais
iguais. Duas armadilhas apareceram no caminho, e valem registro:

- `1fr` não serve — o mínimo de uma coluna `1fr` é o conteúdo dela, e a coluna da
  direita se recusava a ficar menor que o disco. `minmax(0, 1fr)` resolve.
- com o disco reivindicando a coluna 3 pelo nome, a colocação automática do grid
  mandou a placa para a coluna 1. A placa precisa declarar a sua.

**O board e o pote saíram do palpite.** O board estava a 9vw — 28px a 320px, um
terço da sua carta — quando o que faltava não era largura. Na horizontal ele
voltou à fração da casa (`--board-card-w` = 0,78 da carta cheia no `:root`), que
é a mesma frase em toda a casa: *um pouco menor que a sua*.

Na vertical, o teto era `dvh`, e `dvh` é o palpite errado. O que aperta não é a
tela ser baixa: é o **miolo** ser pouco — e o miolo é o que sobra depois de duas
fileiras de rival, que crescem com a **largura**. Num aparelho baixo e largo as
duas coisas conspiram, e nenhuma conta em `dvh` prevê isso. O miolo virou um
contêiner de consulta e as duas peças passaram a medir-se nele (`cqh`).

### O defeito antigo que isso revelou

Medindo em 320×568 — o aparelho mais estreito **e** mais baixo da suíte — o pote
saía por cima da segunda fileira de rival e o board por cima das suas cartas, em
**9px**. Não era regressão: com os valores anteriores o mesmo aparelho pedia 75px
de conteúdo num miolo de 55. O defeito existia e ninguém o via porque o e2e só
afirmava ausência de rolagem **horizontal**.

Ele só aparece nas mesas de fileira DUPLA (5 e 6). A correção é o teto de altura
da carta de rival dividido pelo número de fileiras (`9dvh / --lanes`): quem tem
uma fileira gasta o dobro em carta, porque tem metade das bocas. Em aparelho
normal o teto não morde — a 720px vale 32,4 contra os 32,7 da conta de largura.

### Medido de novo, sete configurações

320×568, 360×640, 412×640 e 412×839, mesas de 3 a 6, duas passagens cada:
nenhuma invasão de pilha em carta, nenhuma pilha fora do feltro, nenhum disco
sobre a placa do vizinho, nenhum transbordo vertical do pote ou do board, 29
apelidos e nenhum cortado, e o desvio da placa em relação ao centro das cartas
igual a **zero** em todos os assentos.
