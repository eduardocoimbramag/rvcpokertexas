# O nick quebra linha na placa do assento

> Este documento tem um irmão: **`encaixefichas.md`**, sobre a pilha de fichas que
> cobre as cartas do vizinho. Os dois problemas dividem a mesma escassez de largura na
> mesa de 6, e as soluções de um destravam as do outro — há uma **dependência de ordem**
> entre eles, apontada nas duas pontas.

## Em uma frase

Não é o nome que quebra. É o **montante** que cai para uma segunda fileira, e ele cai
porque uma única linha de CSS manda a placa quebrar **antes** de deixar o nome
encolher. A placa daquele assento fica mais alta que a dos vizinhos, empurra a carta
dele para baixo e desalinha a fileira inteira — que é exatamente o print de FLORA.

---

## 1. Como a placa é montada (sem jargão)

A placa de um rival é uma caixinha com moldura de ouro. Dentro dela existe **uma
linha** com duas coisas lado a lado:

```
┌──────────────────────────┐
│  FLORA   │  ⊙ 1.000      │   ← isto é UMA linha
└──────────────────────────┘
   nome    fio  montante
```

Essa linha usa um mecanismo do CSS chamado **flexbox** — em português de gente: "põe
estas peças lado a lado e, se faltar espaço, negocia". A negociação tem duas moedas
possíveis:

- **Encolher** — alguma peça aceita ficar menor (no caso do nome, virar `FLOR…`).
- **Quebrar** — a peça que não coube desce para uma segunda fileira.

O CSS de hoje escolheu **quebrar**. E a ordem em que o navegador decide isso é o
coração do problema.

---

## 2. A causa raiz

`src/index.css:8714-8717`

```css
.cash-seat__plate .seat-plate__line {
  flex-wrap: wrap;
  row-gap: calc(var(--plate-fs) * 0.2);
}
```

`flex-wrap: wrap` significa "pode quebrar linha". O detalhe que quase ninguém sabe é
a **ordem das operações** do flexbox:

1. Primeiro ele mede cada peça no tamanho que ela **gostaria** de ter (tamanho
   hipotético) e distribui as peças em fileiras — *especificação Flexbox §9.3, passo 5*.
2. **Só depois** ele negocia encolhimento **dentro de cada fileira** — *§9.7*.

Ou seja: quando `wrap` está ligado, a quebra acontece **antes** de qualquer
encolhimento. A elipse do nome (`FLOR…`) nunca chega a ser cogitada. O montante
simplesmente desce.

E ao descer, ele encontra `margin-left: auto` (`src/index.css:3347`), que existe no
duelo para justificar as duas linhas nas mesmas bordas. Na segunda fileira sozinho,
esse `auto` o joga colado à direita — o fio divisor vertical fica pendurado sem nada
para dividir. É o print.

**Sem o `wrap`, o resultado seria `FLOR…` numa linha só.**

---

## 3. Quem pode encolher e quem não pode

| Peça | Arquivo | Pode encolher? | Por quê |
|---|---|---|---|
| `.seat-plate__name` | index.css:3324-3337 | **SIM** | Tem `overflow: hidden`, e isso faz o "tamanho mínimo automático" dele valer 0. Já tem `nowrap` + `text-overflow: ellipsis` + `max-width: 9ch` prontos. É o **único** item compressível da linha. |
| `.seat-plate__stack` (o montante) | index.css:3345-3360 | **NÃO** | `inline-flex`, `white-space: nowrap`, **sem** `overflow: hidden`. Sem isso, o mínimo automático dele é a largura inteira do conteúdo. `flex-shrink` não tira um pixel. É **rígido**. |
| `.seat-plate__flag` (ALL-IN) | index.css:3392-3394 | **NÃO** | `flex: none`. |
| `.seat-plate__line` / `__body` | index.css:3317-3322 / 3310-3315 | — | Já têm `min-width: 0`, então não atrapalham. |

**Conclusão:** quem quebra é o montante, porque é o segundo item e o único que não
cabe. E o nome nunca é truncado porque o `wrap` atropela o encolhimento.

---

## 4. A conta em pixels

### 4.1 Quanto espaço existe

A coluna da tela é `min(480px, largura do aparelho) − 48px`
(`.cash-screen { max-width: var(--app-shell-w) = 480px; padding: 1rem 1.5rem }`,
index.css:8440-8461). Dela sai:

- `padding-inline: 0.9rem` × 2 = **28,8px** de folga nas pontas (index.css:8642) —
  ela existe para a pilha de fichas do rival da ponta não sair da tela;
- os vãos `--cash-gap` = `clamp(0.2rem, 1vw, 0.42rem)` (index.css:8595);
- e — **este é o segundo achado** — `width: calc(100% - var(--lane-depth) * 10%)`
  (index.css:8636), a perspectiva por largura.

### 4.2 O erro de geometria: a perspectiva cobra da faixa mais cheia

Numa mesa de **6**, `laneSlices(5)` devolve `[3, 2]` (tableLayout.ts:21-39) e
`CashArena.tsx:358` escreve `--lane-depth: lanes.length - 1 - lane`. Resultado: a
faixa de **TRÊS** assentos é a de profundidade 1 e perde 10% da largura, enquanto a
de **DOIS** fica com 100%.

A perspectiva está descontando exatamente da faixa mais povoada.

| Aparelho | Coluna | Faixa de 3, mesa de **6** (perde 10%) | Faixa de 3, mesa de **4** (100%) |
|---|---|---|---|
| 320px | 272px | **69,9px** por assento | 78,9px |
| 390px | 342px | **90,4px** | 101,8px |
| 430px | 382px | **102,1px** | 114,7px |

O comentário do próprio CSS em index.css:8690-8702 promete "sobrando ~79px por
assento" — ele esqueceu os 10% e está descrevendo a mesa de 4. **O orçamento com que
a placa foi desenhada está 12% otimista para a mesa de 6.**

### 4.3 Quanto a placa pede

Aproximação: ~0,5em por glifo em Oswald, ~0,25em no ponto de milhar. (Oswald em caixa
alta roda de verdade entre 0,52 e 0,58em, então **todos os déficits abaixo estão
subestimados**.) Tudo em múltiplos de `--plate-fs`, porque `.seat-plate` tem
`font-size: var(--plate-fs)`:

```
moldura 2px × 2 ............................ 4px fixos
respiro (padding 0,46 + 0,95) .............. 1,41 × fs
vão entre nome e montante .................. 0,45 × fs
nome ....................................... N letras × 0,693 × fs
montante ................................... 0,99 (respiro + fio + ícone)
                                           + 0,26 (vão)
                                           + dígitos × 0,55 (ponto 0,275)
```

- **FLORA + 1.000** → 5px + **9,65** × `--plate-fs`
- **HELENA + 12.480** → 5px + **10,893** × `--plate-fs`

`--plate-fs` do rival é `clamp(0.46rem, 2.3vw, 0.6rem)` (index.css:8703):
**7,36px** a 320 · **8,97px** a 390 · **9,60px** a 430.

### 4.4 O confronto — glifo por glifo, na mesa de 6

| Caso | 320px | 390px | 430px |
|---|---|---|---|
| Disponível (faixa de 3) | 69,9 | 90,4 | 102,1 |
| ZARA / THÉO + 1.000 (4 letras) | 70,9 → falta 1,0 | 85,3 → **cabe** (+5,1) | 90,9 → **cabe** |
| **FLORA + 1.000** (5 letras) | 76,0 → **falta 6,1** | 91,6 → **falta 1,2** | 97,6 → **cabe** (+4,5) |
| **HELENA + 12.480** (pior caso) | 85,2 → **falta 15,3** | 102,7 → **falta 12,3** | 109,6 → **falta 7,5** |

FLORA a 390px falta por **1,2px** — um fio de cabelo. É por isso que, no print, só a
terceira placa quebrou e as outras não: ZARA e THÉO cabem com 5px de sobra.

### 4.5 O pior caso real não cabe em tela nenhuma

O elenco de bots é `BOT_POOL` em `simulation.ts:21-42`, e o nome mais longo é
**"Helena"** (6 caracteres). Como a tabela mostra, HELENA + 12.480 **não cabe em
nenhuma largura de aparelho** — falta 7,5px até nos 430px.

O corpo de fonte máximo que caberia a 320px seria `(69,9 − 5) / 10,893 = 5,96px =
0,372rem` — **19% ABAIXO do próprio piso de 0,46rem** do clamp. Não existe ajuste de
`vw` que salve o layout atual: o piso do token já é grande demais para o assento que
a mesa de 6 entrega.

---

## 5. Onde o bug vive e onde NÃO vive

`splitLanes` (tableLayout.ts:22-27) decide tudo:

| Mesa | Rivais | Faixas | Assento mais apertado (320px) | Quebra? |
|---|---|---|---|---|
| 3 jogadores | 2 | `[2]` | 120px | **Não.** Imune. |
| 4 jogadores | 3 | `[3]` | 78,9px | **Sim**, com HELENA (falta 6,3px). FLORA passa raspando. |
| 5 jogadores | 4 | `[2,2]` | 106,4px | **Não.** Imune. |
| 6 jogadores | 5 | `[3,2]` | **69,9px** | **Sim**, e é o pior caso da casa. |

**O bug é da faixa de TRÊS assentos, não da mesa de 6.** Ele aparece na mesa de 4 e
na de 6; as mesas de 3 e 5 nunca o viram e nunca verão. Isso é decisivo para escolher
a solução: qualquer coisa que cobre altura ou tipografia de todas as mesas está
cobrando de duas mesas que não têm o problema.

---

## 6. Dois achados colaterais

**(a) Regra morta.** O `flex-wrap: wrap` de `.cash-seat__plate` (index.css:8710) não
faz nada no rival: a placa do rival tem **um único filho flex**
(`<span className="seat-plate__body">`, CashArena.tsx:153), e um item só nunca quebra.
O comentário que a justifica (8706-8709) fala de selos SB/BB que **não são mais
renderizados ali** — e o ALL-IN que sobrou (CashArena.tsx:158) mora *dentro* da
`.seat-plate__line`, não como filho da placa. Na **sua** placa há dois filhos flex, e
lá o wrap só não dispara porque `.cash-seat__plate--mine` redeclara `nowrap`
(index.css:8727).

**(b) Comentário falso.** index.css:8719-8721 afirma que "o nome não precisa mais de
teto". Mas `max-width: 9ch` (index.css:3326) continua valendo na cash, sem override
nenhum. Hoje não morde (9ch ≈ 4,89 × fs ≈ 36px a 320px, e HELENA mede ~30,6px), mas
morde em qualquer nick de 8+ caracteres.

---

## 7. Uma via está fechada: "usar uma fonte mais estreita"

`index.html:23` baixa Oswald em pesos **estáticos** (400;500;600;700), sem eixo
`wdth`. Portanto `font-stretch: condensed` e `font-variation-settings: 'wdth'` **não
fazem absolutamente nada** — navegador não sintetiza condensação (só inclinação e
negrito). Estreitar a letra exige **trocar de família**, não de propriedade. Veja a
solução 6.

---

# AS SOLUÇÕES

## 1. Nowrap — devolver a elipse ao nome

> **O alicerce. Não vai sozinha.**

**O que muda.** Apagar o `flex-wrap: wrap` da linha da placa do rival, para que o
flexbox **encolha o nome** em vez de empurrar o montante para baixo.

- `src/index.css:8714-8717` — **apagar o bloco inteiro** (`.cash-seat__plate
  .seat-plate__line { flex-wrap: wrap; row-gap: … }`). Apagar, não reescrever para
  `nowrap`: a regra base (3317-3322) não declara `flex-wrap` nenhum, então `nowrap`
  **já é o valor padrão**. Escrever explicitamente só deixa no arquivo uma regra que
  parece essencial e não é. O `row-gap` morre junto (não tem efeito em linha única).
- `src/index.css:8706-8711` — apagar também o `flex-wrap: wrap` morto de
  `.cash-seat__plate` e o comentário que o justifica. **Manter** o
  `justify-content: center` e o `max-width: 100%`. **Atenção:** ao apagar, deixe um
  comentário no `nowrap` de `.cash-seat__plate--mine` (8727) dizendo que ele passou a
  ser a única declaração — senão o próximo desenvolvedor o apaga como redundante e a
  **sua** placa volta a quebrar em silêncio.
- `src/index.css:8719-8721` — corrigir o comentário falso do achado 6(b).
- `CashArena.tsx:155` — opcionalmente `title={player.name}`. Inofensivo no desktop,
  mas **não conte com ele**: `title` é tooltip de mouse e não dispara em toque, que é
  onde o corte acontece.

**Ganha.** A placa volta a ter **uma linha e altura constante** em toda largura e em
toda mesa — nada de placa de rival mais alta que a do vizinho empurrando a carta dele
para baixo. Medido a 320px numa faixa de três: hoje a placa vai a **29,4px** no
assento que quebra e **20,1px** no que não quebra, na mesma fileira; com a mudança,
**20,1px em todos os casos, inclusive com ALL-IN**. É a correção do sintoma exato do
print, em um bloco de CSS. Acessibilidade intacta: `text-overflow: ellipsis` é
puramente visual — o texto no DOM continua "Flora" e o leitor de tela lê o nome
inteiro. Nenhum teste quebra (CSS não muda `textContent`).

**Perde.** O nome passa a ser **cortado**, e é a única pergunta que a placa existe
para responder. Orçamento a 320px na faixa de três: sobram ~22-25px para o nome com
"12.480" ao lado, o que dá **`HEL…`**. E não é só a mesa de 6: é **toda faixa de
três**, o que inclui a mesa de 4. Some por volta de 400-430px de viewport. Do elenco,
os nomes de 4 letras sobrevivem; **DANTE, BRUNO, FLORA e HELENA são cortados**.
Pior: **com ALL-IN o nome vai a 8,8px — a reticência sozinha — para todos os nomes da
faixa, inclusive OTTO.** E hoje o assento em ALL-IN é justamente o único em que o
nome aparece inteiro, porque ele quebra. Ou seja: sozinha, esta mudança apaga a
identidade no estado mais consequente da mesa.

**Esforço.** Baixo (um bloco de CSS).

**Risco.** Baixíssimo. A regra é escopada em `.cash-seat__plate`; o duelo 1v1 nunca
teve wrap e já elipsa — está a salvo. **Um risco não óbvio:** nem o montante nem o
selo encolhem. Se selo + montante sozinhos passassem da largura do assento, a placa
**vazaria para fora** do assento sobre o vizinho, em vez de quebrar. Hoje não
dispara porque `allIn` implica stack 0 em todo o motor (cashTable.ts:252;
ringHand.ts:198/331/348), então selo largo e número de 5 dígitos nunca coexistem.
Esse acoplamento é essencial e não está documentado em lugar nenhum.

**Mesa de 3 e 5:** neutro (elas nunca quebraram). **Mesa de 4 e 6:** corrige a altura,
introduz o corte.

---

## 2. Nome em cima, montante embaixo — de propósito

> **A única solução estrutural que sobrevive para sempre.**

**O que muda.** Parar de disputar uma linha. Empilhar as duas leituras, para que a
placa precise da largura do **maior** dos dois em vez da **soma**. Não é uma linha
nova: com o `wrap` de hoje o montante **já** cai para a segunda fileira — só que
desalinhado e ainda com o fio divisor vertical pendurado. Aqui a quebra vira decisão
em vez de acidente.

Inserir **depois da linha 8717** (o fecho de `.cash-seat__plate .seat-plate__line`).
**Nunca "depois de 8704"** — ali é dentro do bloco `.cash-seat__plate { … }` aberto
em 8689, e seria erro de sintaxe.

```css
.cash-seat__plate:not(.cash-seat__plate--mine) .seat-plate__line {
  flex-wrap: nowrap;
  flex-direction: column;
  align-items: center;
  gap: 0;
  row-gap: calc(var(--plate-fs) * 0.16);
}

/* Em coluna o eixo cruzado é horizontal, e o `margin-left: auto` do duelo
   vence o `align-items: center` — o montante iria para a direita. O fio e
   o respiro da esquerda vão junto: eles separavam peças lado a lado. */
.cash-seat__plate:not(.cash-seat__plate--mine) .seat-plate__stack {
  margin-left: 0;
  padding-left: 0;
  border-left: none;
}
```

O `:not()` é **obrigatório nas duas regras** — sem ele no reset do `__stack`, o duelo
perde o `margin-left: auto` que o comentário de 3345-3351 diz existir de propósito.

Com a largura sobrando, dá para subir o corpo em index.css:8703 para
`clamp(0.55rem, 2.9vw, 0.64rem)`. **Não subir para 0,72rem**: `.cash-seat__plate--mine`
é `clamp(0.58rem, 3.05vw, 0.74rem)`, e 0,72 contra 0,74 apaga a distinção "esta é a
minha placa", que é decisão declarada no comentário de 8723. Com 0,64rem a sua placa
continua ~15% maior e o rival ainda ganha +7% de corpo.

**Ganha.** A largura necessária cai de **10,893 para 6,285 × plate-fs** no pior caso
(5px + o maior dos dois + 1,41 de respiro): **51,3px a 320px contra 69,9
disponíveis**. Resolve HELENA + 12.480 com folga em toda largura e **para sempre**:
nick de 9 letras e stack de 6 dígitos continuam cabendo. Sobra tanto que o corpo de
fonte pode subir — que é exatamente a troca que o comentário de index.css:8677-8681
diz querer.

**Perde.** **ALTURA**, que é o recurso mais escasso desta tela — o próprio CSS
reconhece isso ao trocar `--arena-actions-h` por `clamp(6.4rem, 17dvh, 8.9rem)`
(index.css:8451), com o comentário de que num aparelho de 568px o pote subia por cima
das cartas. Cada placa cresce ~1,4 × plate-fs ≈ 10-14px, e são **duas faixas** de
rival: ~20-28px a menos de feltro na mesa de 6. Perde-se também a leitura "nome e
montante na mesma varredura horizontal" (argumento do comentário em 8658-8660) — mas
essa já estava perdida no pior assento, que é onde ela importava.

**E aqui está o custo que o dono precisa entender:** nas mesas de **3 e 5 rivais** (as
faixas de dois, com assentos de 106-120px) a placa hoje cabe folgada numa linha só. A
coluna custa **uma linha inteira por placa, sem nenhum ganho**. É perda pura ali.

**Esforço.** Médio.

**Risco.** O `:not(.cash-seat__plate--mine)` é obrigatório: sem ele a **sua** placa
também empilha, e ela tem uma terceira linha (a leitura da mão, CashArena.tsx:272) —
viraria uma placa de quatro andares. **Cuidado com o ALL-IN**: ele mora na mesma
`.seat-plate__line` (CashArena.tsx:158) e, em coluna, vira uma **terceira linha** no
lance mais dramático da mão. Ou se aceita isso (é raro, e é a notícia mais importante
que a mesa dá), ou se aplica a solução 4 junto. Nada quebra fora da cash:
`.cash-seat__plate` só existe em CashArena.tsx:152 e :244; o duelo usa `.seat-plate`
puro, o torneio usa `.nameplate` e o blackjack não toca nenhuma dessas classes.

**Medir em 320×568 com 5 rivais E com 4 rivais** — a de 4 é a que só paga e não recebe.

---

## 3. Dieta de ornamento: entreletra e fio divisor

> **Recupera largura sem cortar nem abreviar nada.**

**O que muda.** Devolver à linha o espaço que hoje é decoração: a entreletra larga do
nome (`letter-spacing: 0.13em`) e o fio vertical + respiro antes do montante. E pagar
essa conta tipográfica **só na faixa de três**, que é a única apertada — as faixas de
dois ficam com a letra gravada da marca intacta.

Inserir **depois da linha 8717**. Escopar em `.cash-seat`, **não** em
`.cash-seat__plate`: a sua própria placa carrega `cash-seat__plate`
(CashArena.tsx:244), e `.cash-you` **não** carrega `.cash-seat` — então `.cash-seat …`
é o único escopo que é de verdade "só rival".

```css
/* A DIETA VALE ONDE A FAIXA APERTA. Numa faixa de TRÊS a entreletra larga
   e o fio antes do montante somam ~9,8px, e é deles que sai a largura que
   falta. Nas faixas de DOIS sobram ~106px e nada disso é preciso. */
.cash-lane:has(> .cash-seat:nth-child(3)) .cash-seat .seat-plate__name {
  letter-spacing: 0.04em;
}
.cash-lane:has(> .cash-seat:nth-child(3)) .cash-seat .seat-plate__stack {
  padding-left: 0;
  border-left: none;
}
```

**Não incluir `max-width: none`.** Medido: 1ch em Oswald 600 = 0,5431em, logo 9ch =
4,888em, e HELENA mede 3,781em. O teto nunca morde, a regra não devolve 1px, e
tirá-lo só cria o risco de trocar a reticência pela própria quebra que se está
consertando.

**Ganha.** Economia medida no Chromium com a Oswald real (não estimada):
`0,099 × N + 0,6` em plate-fs, mais 1px do fio → para HELENA, **9,8px a 320px** e
**11,7px a 390px**. A placa "HELENA + 12.480" cai de 84,7 → **74,9px** a 320 e de
102,1 → **90,4px** a 390. Isso **conserta sozinha a faixa de três da mesa de 4
jogadores** (78,9px disponíveis) nas duas larguras. **Nada é cortado, abreviado ou
removido do DOM; zero perda de acessibilidade.** As duas metades são necessárias: só a
entreletra dá 80,3px e só o fio dá 79,2px — as duas juntas dão 74,9px.

**Perde.** **Caráter tipográfico.** A entreletra larga em display condensado é a
assinatura da casa (o mesmo 0,13-0,15em aparece na leitura da mão e nos selos); a
0,04em o nome do rival passa a ler como texto de interface, não como placa gravada — e
convivem duas letras diferentes na mesma tela. Sem o fio, a separação nome↔montante
cai de 8,7px para 3,3px e "HELENA ⊙ 12.480" lê como um bloco só: é a perda mais
visível. Além disso, o comentário de 8679-8688 ("a placa da cash é a placa do duelo;
aqui só se diz o TAMANHO") deixa de ser verdade e precisa ser atualizado junto.

**Esforço.** Baixo.

**Risco.** Nenhum no duelo, no torneio ou no blackjack — `.seat-plate*` só existe em
PokerSeat.tsx e CashArena.tsx, e PokerSeat não carrega `.cash-seat`. Seu assento
protegido pelo escopo. Faixas de dois intocadas pelo `:has()`. **Único cuidado:**
`:has()` exige Safari 15.4+ / Firefox 121+; se o alvo for mais antigo, cair para
`.cash-seat .seat-plate__name` simples, aceitando que as mesas de 3 e 5 paguem a
perda tipográfica sem ganho.

**A folga que sobra é fina:** 4,05px a 320px na mesa de 4. Qualquer nome novo mais
longo que "Helena" traz a quebra de volta. É um limite, não uma margem.

---

## 4. O selo ALL-IN sai da linha do nome

> **Pequena, quase invisível — e sem ela a solução 1 se autodestrói.**

**O que muda.** Hoje o ALL-IN é o terceiro item **rígido** da mesma linha
(CashArena.tsx:158). Como ele não encolhe, ele come o orçamento inteiro do nome: com
a solução 1 aplicada, todo nome da faixa vira `…` quando alguém está all-in. Duas
saídas:

- **Envolver nome + selo** num `<span className="seat-plate__head">` que continua em
  linha, deixando só o montante negociar; **ou**
- dar ao selo `flex-basis: 100%` numa linha `wrap` própria, para que ele ocupe uma
  fileira só dele quando aparecer.

**Ganha.** O nome deixa de pagar pelo estado mais raro e mais importante da mesa. Se
combinada com a solução 2, evita a placa de três andares no rival. É a peça que
transforma a solução 1 de "troca um bug feio por um pior" em "corrige de vez".

**Perde.** No caminho da linha própria, o assento em all-in fica ~1 linha mais alto —
mas apenas ele, e apenas enquanto o estado durar. No caminho do `__head`, nada de
altura, mas entra um elemento novo na marcação (mudança de `.tsx`, não só de CSS).

**Esforço.** Baixo (uma tag e uma regra).

**Risco.** Baixo, mas mexe em **JSX**, então não é mais "só CSS": vale rodar
`cashBrokeSeat.test.tsx`. Nenhuma asserção atual olha a estrutura da linha (só
`toHaveTextContent` e presença do medalhão), então a tendência é passar limpo.

**Mesa de 3 e 5:** neutro. **Mesa de 4 e 6:** essencial.

---

## 5. Dieta de moldura: respiro e borda da placa do rival

> **Mesma ideia da 3, cobrando de outro bolso.**

**O que muda.** A placa gasta **4px fixos de moldura** (`border: 2px`, index.css:3160)
e **1,41 × plate-fs de respiro interno** (`padding` assimétrico, 3158-3159) antes de
qualquer texto. Numa placa de 9,76px de corpo isso é elegante; numa de 7,36px é
desproporcional — o ornamento não encolheu junto com a letra.

Só para o rival, depois da linha 8717:

```css
.cash-seat .seat-plate {
  padding: calc(var(--plate-fs) * 0.42) calc(var(--plate-fs) * 0.55)
           calc(var(--plate-fs) * 0.42) calc(var(--plate-fs) * 0.3);
  border-width: 1px;
}
```

**Ganha.** `0,56 × plate-fs` de respiro + 2px de moldura = **~6,1px a 320px** e
**~7,0px a 390px**. Sozinha não fecha o pior caso, mas **somada à solução 3** dá
~15,9px a 320px contra os 15,3px que faltam para HELENA — ou seja, o pior caso passa a
caber na mesa de 6, nas três larguras.

**Perde.** A moldura de ouro fica com metade da espessura, e é ela que faz a peça ler
como metal fundido em vez de retângulo pintado (o comentário de index.css:3149-3152
diz isso com todas as letras). O fio interno rebaixado (`::before`, inset 0,16em)
continua, então parte da profundidade sobrevive — mas a placa do rival passa a ser
visivelmente mais "leve" que a sua. Pode até ser lido como hierarquia intencional.

**Esforço.** Baixo.

**Risco.** Baixo e contido, **desde que escopado em `.cash-seat`**. Se alguém escrever
em `.seat-plate` puro, o duelo perde a moldura junto. Vale medir num aparelho real
antes de aceitar: 1px de borda em tela de alta densidade pode sumir sob o
`box-shadow`.

**Mesa de 3 e 5:** perda estética sem ganho (a menos que se aplique o mesmo `:has()`
da solução 3).

---

## 6. Trocar de família tipográfica por uma condensada de verdade

> **A solução que ataca a causa física, e a mais cara.**

**O que muda.** Oswald já é condensada, mas está carregada em pesos estáticos
(index.html:23). Trocar `--font-display` (index.css:29) — ou apenas o nome e o
montante do rival — por uma família **variável com eixo `wdth`** (Archivo, Encode
Sans, Saira) permite pedir literalmente 15-20% menos largura por glifo:

```
family=Archivo:wdth,wght@62..125,400..700
```

Com `font-variation-settings: 'wdth' 75` no nome do rival, os 0,693 × fs por letra
caem para ~0,55 × fs — para HELENA são **~5,7px a 320px**, sem tocar em entreletra,
fio ou moldura.

**Ganha.** É o único caminho que devolve largura **sem remover nada** — nem ornamento,
nem separação visual, nem altura. E resolve de uma vez qualquer texto de display
apertado da casa, não só esta placa.

**Perde.** **A voz da marca.** Oswald é a substituta escolhida do Morganite
proprietário; trocá-la é decisão de identidade, não de layout. Aplicar só na placa do
rival é pior: duas famílias display na mesma tela, e a placa do rival deixa de ser "a
mesma peça" da sua. Custo técnico: mais um arquivo de fonte na rede (variável pesa
mais que um peso estático) e um risco de FOUT no primeiro carregamento.

**Esforço.** Médio-alto (decisão de design + verificação de toda a tela, não só da
placa).

**Risco.** Médio. Fonte variável exige `@supports (font-variation-settings: normal)`
como rede de segurança, e qualquer texto de display da casa precisa ser revisto —
cabeçalhos, botões, o pote, o alto-falante da mesa. **Não faça isto para consertar um
bug de 15px.** Faça se e quando a identidade tipográfica for revista de propósito.

---

# O que NÃO funciona, e por quê

Saber o que já foi descartado vale tanto quanto a lista do que fazer. As quatro
abaixo foram levantadas, medidas e **refutadas**.

### ❌ "A faixa de 3 para de pagar a perspectiva" (tirar os −10%)

Parece óbvio: a faixa mais cheia é justamente a que perde 10%. Mas:

- **Na mesa de 4 jogadores a faixa de três já tem `--lane-depth: 0`** — ela já é 100%.
  A mudança é um **no-op absoluto** ali, e `CASH_SIZES = [3,4,5,6]` (types.ts:174), a
  mesa de 4 é selecionável.
- O que a mudança faz é **igualar a mesa de 6 à de 4** (69,9 → 78,9px). Mas 78,9px é
  exatamente onde a mesa de 4 **já quebra** com HELENA. Não conserta: nivela.
- **Custo decisivo, não citado:** alargar a faixa empurra o `ChipRack` do rival da
  ponta para fora. `.cash-seat__gutter` tem `min-width: 0` (index.css:8755), o que
  anula o mínimo automático da coluna — a trilha colapsa e a pilha **transborda**. A
  320px a pilha do rival da ponta sai de ~13,6px para ~0,6px com uma coluna de fichas
  e para **~−18px com duas**. E duas colunas são corriqueiras: `RACK_PER_COLUMN = 6`
  com denominações `[1000, 500, 100, 25]` (pot.ts:76,87) faz um stack de 875 já virar
  duas colunas. É exatamente a falha que index.css:8639-8641 documenta ("sem esta
  faixa a pilha do rival da ponta saía da tela").

> **A refutação tem prazo de validade.** Ela vale enquanto a pilha do rival estiver no
> vão do assento. O documento irmão — **`encaixefichas.md`** — recomenda justamente
> tirá-la de lá (a pilha invade as cartas do vizinho, e o montante já está escrito na
> placa). **Feito isso, esta objeção some**: não há mais pilha para empurrar para fora,
> e os +9,1px passam a ser ganho limpo para a placa.
>
> Ou seja: **as duas soluções não competem, elas se ordenam.** Primeiro a pilha sai do
> vão; depois a faixa pode largar os −10%. Nessa ordem, esta linha deixa de ser "o que
> não funciona" e vira um reforço à recomendação abaixo.

### ❌ "`--plate-fs` sai da largura da FAIXA, não da tela" (container query)

A **direção está certa** e o mecanismo é seguro. A **fórmula proposta estava errada**:

- `100cqi` já é o **content box** — o `padding-inline` já está descontado. Descontar
  `- 28.8px` de novo desconta duas vezes.
- Medido no Chromium, a mesa de **4 jogadores regride de 7,36px para 6,72px** de
  corpo, e a mesa de **6 também** — ou seja, piora o caso do chamado.
- A fórmula ignora os vãos (`--cash-gap`) entre os assentos e a largura reduzida da
  faixa funda.
- **Precipício:** sem container query o navegador ainda parseia a custom property,
  mas o `font-size: var(--plate-fs)` (3172), o `gap` (3155), o `padding` (3158), o
  `border-radius` (3161) e o `inset` do `::before` (3185) ficam todos inválidos. A
  placa não degrada: **desmonta**. Não há `browserslist` nem `build.cssTarget` no
  projeto. Precisaria de um `@supports`.

Se algum dia for retomada, a fórmula tem de sair do assento real
(`(100cqi − (cols−1) × gap) / cols`) e vir com `@supports`.

### ❌ "Abreviar o montante: 1.000 → 1k, 12.480 → 12,5k"

**O código proposto não produz "k".** Rodado em Node 22 / ICU 76.1, `notation:
'compact'` em **pt-BR** dá:

```
1000  → "1 mil"      1200 → "1,2 mil"      12480 → "12,5 mil"
```

"k" é en-US. Refazendo com métricas reais de Oswald: `"1.000"` → `"1 mil"` economiza
**2,3px** (não os 10,1 alegados), e `"12.480"` → `"12,5 mil"` fica **4,1px MAIS
LARGA**. No caso de 5 dígitos — o crítico — a mudança **piora**. A placa continua
quebrada (76,2px contra 69,9 disponíveis).

Mesmo corrigido para "k" de verdade, `"12,5k"` volta a estourar. E há dois custos
extras: (a) volta a **dança de largura** que o CSS proíbe de propósito
(`font-variant-numeric: tabular-nums`, com o comentário em 3339-3341) — o número de
glifos muda com a ordem de grandeza, e a placa passaria a **alternar entre uma e duas
linhas no meio da mão**, transformando o bug em intermitente; (b) na mesma tela
continuam por extenso o pote, a aposta no feltro, o alto-falante e a **sua** placa —
o rival abreviado fica sozinho contra quatro números inteiros.

### ❌ "O montante sai da placa e vira rótulo da pilha de fichas"

A metade da placa está certa (tirar o montante libera muito). O **destino** não
funciona:

- O vão do assento não tem 9,4px: tem **~3,9px**. E ele **não prende nada** —
  `min-width: 0` (8755) faz a trilha colapsar e o conteúdo transbordar. O `ChipRack`
  já mede 15,1px com uma coluna e 32,2px com duas contra esses 3,9px.
- Um rótulo "12.480" em corpo legível mede ~26px: **mais largo que a pilha de uma
  coluna**. Empilhá-lo sobre um bloco que já transborda não resolve largura nenhuma.
- **Custo não declarado, e é o que decide:** hoje o montante é texto **dentro da
  placa**, amarrado ao nome. Depois da mudança, o único portador acessível do valor é
  o `aria-label` do ChipRack (ChipRack.tsx:82): `"Fichas de seu rival: 12.480"` —
  **string idêntica para os cinco rivais, sem nome nenhum**. E `.chip-rack` tem
  `role="img"`, que é folha na árvore de acessibilidade: o rótulo visível novo **não
  é exposto ao leitor de tela**. Apaga a única forma de saber de quem é cada stack
  numa mesa de seis.
- E a placa **não** passaria a responder "só quem": o ALL-IN continua na mesma linha,
  e a quebra volta inteira quando alguém está all-in.

---

# RECOMENDAÇÃO

## O que eu faria primeiro

**Solução 1 (Nowrap) + Solução 4 (ALL-IN fora da linha), no mesmo commit.**

Motivo: a solução 1 é a única que ataca a **causa raiz** — o `flex-wrap: wrap` que
atropela o encolhimento. Ela transforma um defeito **imprevisível** (uma placa mais
alta que as vizinhas, empurrando a carta e desalinhando a fileira, e só às vezes) num
comportamento **determinístico** (altura constante, e no pior caso um `…`). Nunca se
conserta um layout com o mecanismo de negociação desligado. E a solução 4 é o
antídoto obrigatório para o efeito colateral dela: sem o ALL-IN fora da linha, o nome
de **todos** os rivais da faixa vira reticência no lance mais importante da mão.

Custo total: um bloco de CSS apagado, um `<span>` acrescentado. Meia hora.

## O que eu faria em seguida, na mesma semana

**Solução 3 (dieta de ornamento) + Solução 5 (dieta de moldura), com o `:has()` da 3
aplicado às duas.**

Juntas elas devolvem **~15,9px a 320px** — contra os 15,3px que faltam para o pior
caso real (HELENA + 12.480). Com a solução 1 já no lugar, isso significa que **a
elipse quase nunca dispara**: o nome inteiro cabe outra vez, e o corte fica reservado
para nicks futuros de 8+ caracteres. E o `:has()` garante que as mesas de 3 e 5 — que
nunca tiveram o problema — **não paguem nada**.

Ressalva honesta: 15,9 contra 15,3 é **0,6px de sobra**. Isso não é margem, é sorte —
**a menos que** a pilha do rival saia do vão primeiro (ver `encaixefichas.md`), o que
libera a faixa a largar os −10% e acrescenta 9,1px. Aí sim vira margem.
Funciona para o elenco atual (`BOT_POOL`, máximo 6 letras) e para os stakes atuais
(`CASH_STAKES` no teto dá "30.000", 6 caracteres). **Se um dia entrar um nome de 7
letras ou um stack de 7 dígitos, volta a quebrar** — e aí a resposta é a solução 2.

## A combinação que funciona bem junta

```
1 (nowrap)  +  4 (all-in fora)  +  3 (ornamento)  +  5 (moldura)     ← recomendada
```

As quatro são de CSS escopado em `.cash-seat`, todas de esforço baixo, todas sem
risco para o duelo, o torneio ou o blackjack, e nenhuma toca altura — que é o recurso
escasso desta tela.

## A alternativa estrutural

**Solução 2 (empilhar nome e montante)** é a única que resolve o problema **para
sempre**: reduz a necessidade de 10,893 para 6,285 × plate-fs, cabe com folga em toda
largura, e ainda deixa subir o corpo da fonte. Se o dono aceitar pagar **~20-28px de
feltro** na mesa de 6, é a escolha tecnicamente superior.

Mas **ela não deve ser aplicada sem o `:has()` da solução 3**: nas mesas de **3 e 5
jogadores** ela é **perda pura** — cobra uma linha inteira por placa de assentos de
106-120px que nunca tiveram o problema. Se for por esse caminho, escope-a na faixa de
três, exatamente como a solução 3 faz.

## O que fazer com as mesas grandes vs. pequenas

| Mesa | O que ela precisa |
|---|---|
| **3 jogadores** (assento 120px) | **Nada.** Imune. Qualquer solução não escopada é custo sem retorno. |
| **4 jogadores** (assento 78,9px) | Quebra com HELENA. A **solução 3 sozinha já a conserta** nas duas larguras críticas. |
| **5 jogadores** (assento 106,4px) | **Nada.** Imune. |
| **6 jogadores** (assento 69,9px) | O caso duro. Precisa de **1 + 4 + 3 + 5** juntas, ou da **2**. |

## Duas correções de documentação a fazer junto (grátis)

1. `index.css:8690-8702` — o comentário de orçamento diz "sobrando ~79px por assento".
   Isso descreve a mesa de **4**, não a de 6. O pior caso da casa é **69,9px**. Toda
   conta futura tem de sair desse número.
2. `index.css:8719-8721` — "o nome não precisa mais de teto" é falso: `max-width: 9ch`
   (3326) continua valendo, sem override.
