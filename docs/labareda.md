# Labareda — a combustão dourada da casa

> Documentação de referência do efeito de fogo que marca o **blackjack**
> e a **aposta dobrada**. Cobre o que ele é, onde mora, como cada camada
> funciona, o que custa, como testar e por que várias decisões são o que
> são.
>
> Todos os números aqui foram **medidos** — no app rodando, com o
> Playwright, em viewport Pixel 7 e com a CPU emulada 4× mais lenta.
> Nada é estimativa.
>
> Estado: implementado e em produção. Última revisão do documento:
> 02/08/2026 — reescrita para o **fogo cartoon** (línguas de Bézier em
> camadas chapadas, no lugar dos discos aditivos), para as **duas
> variantes** (`blackjack`, `double-button`) e para a **remoção total
> do efeito do pote**.

---

## Sumário

1. [O que é, em uma frase](#1-o-que-é-em-uma-frase)
2. [Onde mora — mapa dos arquivos](#2-onde-mora--mapa-dos-arquivos)
3. [Quando acende e quando apaga](#3-quando-acende-e-quando-apaga)
4. [A forma: entrada + regime](#4-a-forma-entrada--regime)
5. [As camadas](#5-as-camadas)
5b. [As três variantes](#5b-as-três-variantes)
6. [O modelo (`blaze.ts`)](#6-o-modelo-blazets)
7. [O renderizador (`BlazeBurst.tsx`)](#7-o-renderizador-blazebursttsx)
8. [O CSS: palco e cartas](#8-o-css-palco-e-cartas)
9. [Geometria: o palco, o céu e o canvas](#9-geometria-o-palco-o-céu-e-o-canvas)
10. [Performance — números medidos](#10-performance--números-medidos)
11. [Acessibilidade e movimento reduzido](#11-acessibilidade-e-movimento-reduzido)
12. [Testes](#12-testes)
13. [Como mexer sem quebrar](#13-como-mexer-sem-quebrar)
14. [Histórico: o que já falhou e por quê](#14-histórico-o-que-já-falhou-e-por-quê)
15. [Limitações conhecidas](#15-limitações-conhecidas)

---

## 1. O que é, em uma frase

Um **fogo cartoon que estoura uma vez e fica queimando** — línguas com
silhueta clara desenhadas em canvas atrás do hospedeiro, enquanto o
motivo existir.

São **dois desenhos diferentes**, não o mesmo efeito em duas escalas:

| Gatilho | Variante | Onde queima |
| --- | --- | --- |
| **Blackjack natural** (21 nas duas primeiras cartas) | `blackjack` | A mão inteira, como um grupo |
| **Aposta dobrada aceita** | `double-button` | A coroa do botão APOSTA DOBRADA |

**O pote não queima.** Decisão de direção: nenhum efeito nas fichas —
a poça de brasa que já morou ali virava um bloco amarelo sobre o monte
e brigava com a mão pela atenção. A dobra aceita é comunicada
exclusivamente pelo botão, e há teste garantindo que nenhum canvas
monta dentro de `felt-pot`.

---

## 2. Onde mora — mapa dos arquivos

| Arquivo | Papel | Linhas |
| --- | --- | :-: |
| `src/features/bac-bo/animations/blaze.ts` | **Modelo**: física, coreografia, paleta e a tabela das variantes (zonas), em números puros. Sem desenho. | 590 |
| `src/features/bac-bo/components/table/BlazeBurst.tsx` | **Renderizador**: o `<canvas>`, as línguas de Bézier e o laço de animação. | 502 |
| `src/index.css` (bloco `A COMBUSTÃO DOURADA`) | **Palco** (`.blaze-stage`, `.blaze-burst`) e o tratamento das **cartas**. | ~175 |
| `src/index.css` (`.double-cta--accepted`) | Céu do estouro no botão da dobra. | ~12 |
| `src/index.css` (nota em `.felt-pot`) | O registro de que o pote NÃO pega fogo. | 1 |
| `src/index.css` (`.hand-total--ablaze`) | O clímax da placa do "21". | ~80 |
| `src/features/bac-bo/tests/blaze.test.ts` | 30 testes do modelo. | 402 |

**Por que modelo e renderizador são separados.** Um efeito que só existe
dentro de um `requestAnimationFrame` não se verifica. Este tem regra
demais para ficar sem rede — quantas línguas, com que envelope, faísca
que não pode nascer fora da mão, faísca que não pode ser cortada na
borda do canvas. Com o modelo puro, tudo isso é teste de função.

---

## 3. Quando acende e quando apaga

O fogo é montado e desmontado por props. **Não existe relógio que o
apague** — quem apaga é o React tirando o componente da árvore.

### Blackjack

```tsx
// HandsArena.tsx
// A sua mão: acende quando as cartas ASSENTAM, não durante a
// distribuição — combustão em cima de carta no ar não tem onde acontecer.
const playerAblaze = !dealing && isNaturalBlackjack(playerCards);

// A do rival: só no SHOWDOWN. Ver a nota de POV abaixo.
const opponentAblaze = revealed && (result?.opponentNatural ?? false);
```

> **A regra de POV manda aqui.** A mão do rival tem uma carta virada
> (ver `components/table/pov.ts`). Uma labareda acesa nela antes do
> showdown diria "ele tem 21" com a oculta ainda de bruços — o duelo
> acabaria naquele instante, com você sabendo que basta não estourar. É
> o mesmo corte que já esconde o total parcial e o estouro dele.
>
> A regra é **simétrica**: cada lado vê o fogo do outro no instante em
> que a mesa pode mostrá-lo sem mentir.

Na mesa única do torneio (`TableArena.tsx`) o contrato é idêntico:

```tsx
// Assento de rival: showdown, e não antes.
ablaze={revealed && isNaturalBlackjack(cards)}
// A sua mão, em tamanho cheio:
ablaze={isNaturalBlackjack(yourCards)}
```

### Aposta dobrada

```tsx
// HandsArena.tsx (DoubleCta)
{status === 'accepted' && <BlazeBurst variant="double-button" />}
```

Acende **só no botão**. O pote fica exatamente como sempre foi — sem
canvas, sem classe, sem brilho. O rival não vê o seu botão, e tudo bem:
o que ele precisa saber (o valor da mesa) já está no pote e no placar.

---


## 4. A forma: entrada + regime

```
 força
   │        ╭──╮  ← ~20 línguas, núcleo branco-quente
 1 ─┤       ╱    ╲___________________________________  ← 12–16 línguas, ouro
   │      ╱                                              (regime, 0,62)
   │  ╱╲ ╱                     ENTRADA          REGIME
   │ ╱  ╳  ← flash              ~1,9s        até desmontar
 0 └─┴──┴──────────────────────────┼─────────────────────────▶ tempo
     0  400ms                    1900ms
```

| Fase | Duração | Composição | Cadência |
| --- | --- | --- | :-: |
| **Entrada** | `BLAZE.entranceMs` = **1900ms** | flash, anel, raios, faixa de borda, **todas** as línguas, núcleo branco-quente, leva inteira de faíscas | 60fps |
| **Regime** | enquanto o componente viver | **subconjunto** de línguas, maiores e espaçadas; ouro no lugar do branco; poucas brasas | ~30fps |

O ponto que carrega esta versão: **regime não é o clímax congelado**. São
duas composições diferentes, e a passagem de uma para a outra tem três
mecanismos, não um:

1. **Menos línguas.** Cada língua nasce com `sustains: true|false`. As que
   não sobrevivem recebem `sustain = 0` no envelope e somem passada a
   entrada. Blackjack: ~20 → 12–16. É o corte que abre o espaço negativo.
2. **Núcleo recolhido.** `settleProgress` interpola o limite do sprite
   branco de 13% da língua (pico) para **2%** (regime), e alarga a faixa
   do dourado. É o que tira a lâmpada branca de baixo das cartas.
3. **As sobreviventes crescem.** No regime elas ganham +50% de
   comprimento e raio. Sem isso as três reduções se somavam e a mão
   virava um sussurro — foi medido: aos 5s sobrava um brilho tímido nas
   quinas.

O que é **impacto** — flash, anel, raios, faixa de borda — acontece uma
vez só. Um soco que se repetisse a cada dois segundos viraria
estroboscópio.

`entranceMs` é **derivado**, nunca escrito à mão:

```ts
get entranceMs(): number {
  return Math.max(
    this.flashInMs + this.flashOutMs,              //  455
    this.rayInMs + this.rayLifeMaxMs,              //  630
    this.edgeSweepMs,                              //  760
    this.flameInMs + this.flameHoldMs + this.flameOutMs, // 1320
    this.particleStaggerMs + this.particleLifeMaxMs,     // 1900  ← manda
  );
}
```

Encurtar um beat e esquecer deste número cortaria o rastro no ar. Há um
teste cobrindo exatamente essa invariante.

---

## 5. As camadas

A ordem de pintura é **impacto (flash + anel) → raios → chamas → linha
de luz → faíscas**, com o blending dividido de propósito: o que é LUZ
(impacto, raios, faíscas) roda em `lighter`; as CHAMAS rodam em
`source-over`, cor chapada sobre cor chapada — é o que preserva a
silhueta. Somar as chamas era o erro da versão anterior.

### 5.1 Impacto de luz

Um clarão radial no **centro inferior** da mão, mais um **anel** que
corre para fora.

- Sobe em 55ms, some em 400ms.
- Creme (`#FFF2A6`) num miolo curto, depois amarelo, dourado e laranja
  — flash dourado, não branco.
- No botão o clarão é **achatado** (escala 0,3 em y): um círculo numa
  pílula de 330×44 viraria uma bola de luz no meio; achatado, ele corre
  a extensão como um filamento acendendo.
- O anel é uma casca de gradiente (não um traço) que expande até ~1,15×
  o raio do flash em 300ms e apaga. Casca e não traço de propósito: um
  círculo de 1px lido sobre o feltro parece elemento de interface, não
  luz.

> **Sem o anel o flash é um clarão que acende e apaga.** Com ele há uma
> frente de onda saindo do ponto de impacto, e é a frente que o olho lê
> como soco.

O flash **não cobre os números e naipes** por construção: o canvas está
atrás das cartas, a luz nasce embaixo delas e só escapa em volta — que é
como fogo atrás de um objeto se comporta.

### 5.2 Chamas cartoon

O coração do efeito. Cada língua é uma **forma fechada** — duas Bézier
cúbicas convergindo na ponta e uma quadrática arredondando a base — e
não um empilhado de brilhos:

```
      ▲          ← ponta estreita (as Bézier convergem)
     ◤█◥
    ◤███◥        ← corpo curvo: o "S" vem do bend por ruído
   ◤█████◥
  ◤███████◥      ← base larga, fechada por uma quadrática
  ═════════      ← âncora: a base NUNCA se move
```

**Camadas de cor chapada**, pintadas em `source-over` (nunca aditivo):

| Camada | Escala | Cor | Papel |
| --- | :-: | --- | --- |
| Externa | 1,0 | laranja `#FF7A00`, α 0,82 | A silhueta |
| Corpo | 0,68 | amarelo `#FFD43B` (⅓ em dourado `#FFB000`), α 0,92 | A cor dominante |
| Núcleo | 0,30 | creme `#FFF2A6` | Pequeno, na base — e recolhe 75% no regime |

Pintadas **por camada através de todas as línguas** (todos os laranjas,
depois todos os amarelos, depois os cremes): é o que funde silhuetas
vizinhas num contorno só, como fogo cartoon se desenha. Por língua,
cada chama cobriria o miolo da vizinha com a própria borda laranja.

**O movimento é do corpo, nunca do canvas.** A base é ancorada; por
língua e por quadro: a ponta bamboleia (`sway`, duas senoides
incomensuráveis), a altura respira ±12%, a largura contrai fora de fase
e a curvatura muda devagar (`bend`). Tudo contínuo por construção —
nenhum ciclo "reinicia", nada anda em ping-pong.

**Por que não os discos de gradiente da versão anterior:** somados em
`lighter`, eles produziam luz sem forma — a "nuvem amarela desfocada".
Forma vem de contorno, e contorno não sobrevive à soma.


### 5.3 Explosão radial

6 a 10 raios finos saindo do centro da mão.

- Comprimentos diferentes, ângulos em passo regular **com jitter** (só
  sorteio dá raios colados dois a dois, e o resultado lê como desenho de
  sol torto).
- Crescem alguns px durante a vida (380–560ms) e apagam **antes** das
  chamas.
- Começam a 38% do próprio comprimento — o miolo fica escondido atrás
  das cartas, então o que se vê é só a ponta escapando.
- Alfa máximo 0,36: são sutis de propósito.

### 5.4 Partículas e faíscas

20–30 no pool do blackjack, 14–22 no do botão (ver §5b), em cinco
tipos — e **grandes o bastante para se verem num celular**: o raio na
mão fica entre ~2 e ~4,8px, com um piso de 1,1px no desenho:

| Tipo | Desenho | Notas |
| --- | --- | --- |
| `dot` | disco nítido amarelo + halo curto | ~38% da mistura |
| `spark` | risco alongado na direção do movimento, encolhendo com a velocidade | ~24% |
| `ember` | disco laranja + halo | ~22% |
| `puff` | só halo dourado, grande e macio | ~16% |
| `star` | dois riscos cruzados, só nos primeiros 45% da vida | **≤2, e só na entrada do blackjack** |

Física:

```
v(t) = v₀ · e^(−d·t)                    arrasto exponencial
posição = v₀ · (1 − e^(−d·t)) / d       a integral disso
x += sin(t·swayF + phase) · swayA       bamboleio lateral próprio
alfa = fadeIn · (1 − k)^1,5             some sem corte
```

A faísca é definida pelo **quanto ela sobe**, não pela velocidade
inicial: `vy = alcance × arrasto`, com o alcance declarado pela
variante — sempre dentro do céu do canvas. Ver §14 para o bug que isso
corrigiu.

**Reciclagem.** No regime, cada faísca marcada (`recycles`) que morre
renasce numa zona nova, com trajetória, tipo e tamanho sorteados de
novo, e um descanso até `restMs` da variante. A conta fecha em **2–8
vivas por vez** (há teste) — brasa subindo em intervalos irregulares,
não chuveiro.

`respawnParticle` **muta** o objeto recebido em vez de alocar um novo: o
pool tem tamanho fixo do começo ao fim, porque o laço roda enquanto a
mão durar.

A **estrela não volta** no regime (`allowStar` só na leva da entrada) —
ela viraria um pisca-pisca a cada poucos segundos.

### 5.5 Contorno das cartas

Puro CSS, em `.card-scene--ablaze`. A carta é **banhada, não sacudida**:
não pula, não gira, não balança e termina exatamente onde estava.

| Peça | Seletor | Comportamento |
| --- | --- | --- |
| Sombra mais funda + halo quente | `.card-scene--ablaze` (`card-ignite`) | Aprofunda em 9% do tempo, assenta num valor levemente mais quente que o base |
| Aro dourado + brilho interno | `::before` (`card-rim`) | Entra em 8%, **fica** em `opacity: 0,42` |
| Reflexo diagonal | `::after` (`card-sheen`) | Atravessa a carta **uma vez**, em 0,95s |

O aro fica pelo mesmo motivo que a chama fica: enquanto a mão for
blackjack, a carta está em brasa. Um aro que apagasse sozinho com a
fogueira ainda queimando atrás deixaria a carta desconectada do próprio
efeito.

**0,42 e não 0,62.** Em 0,62 o aro somava com o fogo por trás e
embranquecia a carta — o marfim do papel já é claro, e um contorno forte
por cima dele fecha a leitura do naipe.

### A placa do "21"

O indicador estava alheio à cena: o fogo subia logo abaixo e ele seguia
igual. Hoje entra no beat, em `.hand-total--ablaze`:

| Peça | Comportamento |
| --- | --- |
| Pulo | `scale` 1 → **1,08** → 1, e **volta ao lugar** |
| Preenchimento | mais metálico no pico (realce interno mais forte) |
| Aro | fio champagne, que **fica** discreto no regime |
| Sombra | um pouco mais profunda |
| Reflexo | faixa dourada atravessando **uma vez** |

No regime sobra só o aro. Um indicador que pulsasse sem parar competiria
com as cartas pela atenção durante a mão inteira.

O reflexo é **dourado, não branco**: a faixa atravessa uma carta de
papel-marfim, e branco sobre marfim não é reflexo — é nada. O miolo
champagne só dá o fio de luz no meio do ouro.

A luz atravessa a **mão**, não cada carta por conta própria: a segunda
carta recebe o reflexo 0,19s depois da primeira (0,28s a terceira, 0,36s
da quarta em diante), e o olho lê uma faixa só passando pelas duas.

---

## 5b. As duas variantes

A tabela vive em `BLAZE_VARIANTS` (`blaze.ts`). Cada variante declara
**zonas** — onde o fogo nasce, com que peso e com que altura (frações
da caixa do hospedeiro). O sorteio é **estratificado**: cada zona
recebe a sua cota (peso × total) antes do sorteio livre, então uma
semente azarada nunca acende só um lado da mão.

| | `blackjack` | `double-button` |
| --- | :-: | :-: |
| Línguas (entrada → regime) | 13–18 → **10–14** | 10–14 → **8–12** |
| Meia-largura¹ | 0,05–0,095 | 0,09–0,15 |
| `flameSustain` | 0,62 | 0,55 |
| `intensity` | **1** | 0,8 |
| Impacto | radial + anel + 6–10 raios | horizontal + linha de luz |
| Faíscas (entrada / reciclam) | 20–30 / 8–11 | 14–22 / 6–8 |
| Alcance da faísca¹ | 0,30–0,70 | 0,15–0,40 |
| Raio da faísca¹ | 0,022–0,05 (≥ ~2px) | 0,05–0,09 |
| Descanso máx. | 2200ms | 1000ms |
| Céu (x / cima / baixo)² | 0,42 / 0,90 / 0,50 | 0,06 / **0,45** / 0,04 |

¹ fração da **altura** do hospedeiro. ² custom properties CSS.

### As zonas do `blackjack`

A caixa é o **container das duas cartas** — a mão queima como um grupo.

| Zona | Peso | Onde | Altura da chama |
| --- | :-: | --- | --- |
| Quinas inferiores (×2) | 0,22 cada | cantos de baixo, transbordando | 24–40% da altura |
| Laterais (×2) | 0,15 cada | metade de baixo das bordas | **30–45%** |
| Base (×2) | 0,09 cada | trechos com vãos | 18–30% |
| Vão central | 0,08 | entre as cartas | **10–16%** (não esconde naipe) |

Nada nasce no topo. O miolo da base fica quase vazio — o espaço
negativo é a regra, não a exceção.

**Quem sobrevive ao regime são as línguas MAIORES** (ordenadas por
altura, decidido uma vez na montagem): as curtinhas do vão morrem com a
entrada e o que fica é uma coroa de chamas grandes e espaçadas, que
ainda crescem +45% ao assentar.

### As zonas do `double-button`

Uma coroa na borda de **cima** — o formato 330×44 não recebe fogueira
no perímetro:

| Zona | Peso | Onde | Altura |
| --- | :-: | --- | --- |
| Quinas superiores (×2) | 0,3 cada | pontas do topo | **30–40%** (≈13–18px acima da borda) |
| Borda superior | 0,4 | topo, com vãos | 16–26% |

Nada na borda de baixo: ali é o fim do viewport, e chama cortada é pior
que chama nenhuma.

> **Os controles ficam por cima.** A fileira PEDIR CARTA/PARAR tem
> `relative z-10` (HandsArena): as pontas que invadem a folga de 12px
> somem **atrás** dos botões — a coroa passa da borda sem nunca cobrir
> texto.

**Entrada do botão** (~650ms): flash horizontal achatado, a linha de
luz percorrendo a borda superior da esquerda para a direita
(`edgeSweep`), o pulo do texto 1 → 1,04 → 1 (`double-pop`, CSS) e o
reflexo metálico atravessando o rótulo uma vez (`double-sheen`, CSS).

**Rastro** (CSS, `.double-cta--accepted > .btn:disabled`): fundo de
carvão quente, fio champagne de 1,5px, underglow âmbar — o botão fraco
e escuro era metade da reclamação, e o rastro é o que garante a leitura
numa captura estática.

### A linha de luz, e por que não é mais `setLineDash`

A entrada do botão desenha um segmento brilhante correndo a borda
SUPERIOR (não o perímetro): gradiente linear com cabeça de brilho,
`x = w × k` ao longo de `edgeSweepMs`. Mais simples e mais legível que
a volta completa — a coroa é de cima, a luz também.

---


## 6. O modelo (`blaze.ts`)

### 6.1 Paleta

Guardada como triplas `R, G, B` (sem `rgb()`) porque o renderizador
compõe `rgba(${cor}, ${alfa})` a cada uso.

| Token | Hex | Papel |
| --- | --- | --- |
| `cream` | `#FFF2A6` | Núcleo pequeno — praticamente só da entrada |
| `yellow` | `#FFD43B` | **O corpo da chama — a cor dominante** |
| `gold` | `#FFB000` | Corpo (⅓ das línguas) e brilhos |
| `orange` | `#FF7A00` | A camada externa — a silhueta |
| `deepOrange` | `#E64A00` | Detalhe de ponta |
| `ember` | `#9E2600` | Brasa — partícula isolada |

### 6.2 Coreografia (`BLAZE`)

| Constante | Valor | O que governa |
| --- | :-: | --- |
| `flashInMs` | 55 | Subida do flash |
| `flashOutMs` | 400 | Queda do flash |
| `rayInMs` | 70 | Entrada dos raios |
| `rayLifeMinMs` / `rayLifeMaxMs` | 380 / 560 | Vida de cada raio |
| `flameInMs` | 140 | Chamas crescendo da base |
| `flameHoldMs` | 260 | Pico sustentado |
| `flameOutMs` | 480 | Assentamento até o regime (clímax resolve em ~880ms) |
| `flameSustain` | **0,78** | Nível do regime permanente |
| `particleStaggerMs` | 320 | Escalonamento da leva de entrada |
| `particleLifeMinMs` / `MaxMs` | 720 / 1580 | Vida de cada faísca |
| `particleRestMs` | 2200 | Descanso máximo antes de renascer |
| `entranceMs` | **1900** (derivado) | Fim da entrada — cadência cai para ~30fps |

### 6.3 Densidade por perímetro — **removida**

Existia uma `density` que ajustava a contagem de línguas ao perímetro do
hospedeiro. Ela era um remendo: servia para o botão não queimar ralo com
a contagem da mão. Com `BLAZE_VARIANTS` cada hospedeiro declara a sua
contagem, e o mecanismo saiu inteiro — a spec pedia exatamente isso
("Não use apenas `scale` para adaptar o mesmo desenho a hospedeiros
completamente diferentes").

`scale` continua existindo, e só para o que sempre foi: **tamanho**. Uma
mão mini de assento (`scale: 0,55`) é a mesma cena menor.


### 6.4 Funções exportadas

| Função | O que faz |
| --- | --- |
| `buildBurst(rng, rect, variant, scale)` | Monta o modelo inteiro para a variante |
| `respawnParticle(rng, rect, variant, scale, p, opts)` | (Re)nasce uma faísca **mutando** o objeto |
| `pickZone(rng, zones)` | Sorteia uma zona pelo peso (o sorteio estratificado usa as cotas antes) |
| `flameEnvelope(ms, sustain?)` | Sobe → segura → assenta em `sustain`. `sustain: 0` faz a língua sumir no regime |
| `flashEnvelope(ms)` | Sobe quase instantâneo, cai suave, chega a zero |
| `settleProgress(ms)` | 0 no pico, 1 no regime — a **régua da troca de composição** |
| `tongueNoise(tongue, s)` | Ruído barato: duas senoides de frequências que não se dividem |
| `easeOutCubic(k)` | `1 − (1−k)³` |
| `BLAZE_VARIANTS` | A tabela dos três desenhos |

Sobre o ruído: não é Perlin. Para deformar a ponta de uma língua o olho
não distingue, e custa duas multiplicações em vez de uma tabela de
gradientes.

---

## 7. O renderizador (`BlazeBurst.tsx`)

### 7.1 API

```tsx
<BlazeBurst variant="blackjack" scale={1} />
<BlazeBurst variant="double-button" />
```

| Prop | Padrão | O que faz |
| --- | :-: | --- |
| `variant` | `'blackjack'` | **Qual desenho.** Escolhe a linha de `BLAZE_VARIANTS` |
| `scale` | `1` | Régua do **tamanho**. Encolhe contagem e tamanho juntos |

Onde cada uma é montada:

| Hospedeiro | Chamada | Arquivo |
| --- | --- | --- |
| Mão de cartas | `variant="blackjack" scale={mini ? 0.55 : 1}` | `HandRow.tsx` |
| Botão da dobra | `variant="double-button"` | `HandsArena.tsx` (`DoubleCta`) |

O canvas leva `data-variant`, o que torna a escolha verificável no DOM.

O componente sempre renderiza um `<canvas class="blaze-burst"
aria-hidden data-testid="blaze-burst">`. Ele **precisa** ter um pai com
`.blaze-stage` — é do pai que sai a caixa do que está queimando.

### 7.2 Sprites

Dois `<canvas>` de 64×64 com gradiente radial (dourado e creme),
desenhados **uma vez** na montagem — usados só nos halos das faíscas,
no `puff` e na cabeça da linha de luz. **As chamas não usam sprite
nenhum**: são caminho de Bézier preenchido, e é disso que vem a
silhueta.

### 7.3 O laço

```ts
const frame = (now) => {
  raf = requestAnimationFrame(frame);          // reagenda SEMPRE
  const elapsed = now - start;
  const settled = elapsed > BLAZE.entranceMs;
  if (settled && now - lastDrawnAt < SUSTAIN_FRAME_MS) return;  // 32ms ≈ 30fps
  lastDrawnAt = now;
  draw(elapsed);
};
```

O laço **não termina**. A cadência cai para ~30fps passada a entrada: o
estouro merece cada quadro; o regime, não — a chama é feita de brilhos
macios, ninguém distingue 30 de 60 nela, e o custo cai pela metade
justamente na parte que dura.

Limpeza: `cancelAnimationFrame` no retorno do efeito. O efeito depende
**só de `scale`**.

### 7.4 Ambientes sem canvas

`canvas.getContext('2d')` devolve `null` no jsdom. O efeito retorna cedo
e nada mais na mesa se importa — é o que permite os testes de componente
renderizarem a arena inteira sem stub de canvas.

---

## 8. O CSS: palco e cartas

```css
.blaze-stage {
  --blaze-sky-x: 0.42;      /* razões SEM unidade */
  --blaze-sky-top: 0.9;
  --blaze-sky-bottom: 0.5;
  position: relative;
  display: flex;
}

.blaze-burst {
  position: absolute;       /* left/top/width/height entram por style no TSX */
  z-index: 0;
  pointer-events: none;
}
```

Céu por hospedeiro:

| Hospedeiro | `sky-x` | `sky-top` | `sky-bottom` | Por quê |
| --- | :-: | :-: | :-: | --- |
| Mão (padrão) | 0,42 | 0,90 | 0,50 | Faísca sobe; precisa de céu em cima |
| `.double-cta--accepted` | 0,06 | **0,45** | 0,04 | A coroa passa ~13–18px da borda de cima; embaixo é o fim do viewport |

O pote não está na tabela porque **não tem canvas** — ver §1.

---

## 9. Geometria: o palco, o céu e o canvas

```
        ┌───────────────────────────────────────┐  ← canvas
        │                                       │     (padTop = h × sky-top)
        │        ╭───────────────────╮          │
        │        │                   │          │
        │        │    .blaze-stage   │          │  ← a MÃO: é esta caixa
        │        │  (caixa da mão)   │          │     que o efeito queima
        │        │                   │          │
        │        ╰───────────────────╯          │
        │                                       │  ← padBottom = h × sky-bottom
        └───────────────────────────────────────┘
         ↑ padX = w × sky-x
```

O canvas é dimensionado **em JavaScript**, não por `inset` no CSS:

```ts
const padX      = handBox.width  * ratio('--blaze-sky-x', 0.46);
const padTop    = handBox.height * ratio('--blaze-sky-top', 0.95);
const padBottom = handBox.height * ratio('--blaze-sky-bottom', 0.58);
canvas.style.left = `${-padX}px`;
canvas.style.top  = `${-padTop}px`;
canvas.style.width  = `${handBox.width + padX * 2}px`;
canvas.style.height = `${handBox.height + padTop + padBottom}px`;
```

> **Por quê.** `<canvas>` é elemento **substituído**, e num substituído
> `width: auto` resolve pelo tamanho intrínseco do *bitmap*, não pelos
> `inset`. Com o CSS mandando, a caixa virava o tamanho do bitmap — e,
> como o bitmap é derivado da caixa, cada passagem do efeito **dobrava**
> o canvas (1200×600 medido, contra os 274×240 corretos). O CSS segue
> dono do desenho: as razões vivem lá.

Dentro do canvas, a mão fica em `{ x: padX, y: padTop, w, h }`.

---

## 10. Performance — números medidos

Metodologia: Pixel 7 emulado, `Emulation.setCPUThrottlingRate: 4`,
contagem de quadros via `requestAnimationFrame` em janela fixa. Três
execuções por configuração.

### Com o fogo cartoon (Bézier)

| Janela | com fogo | sem fogo |
| --- | --- | --- |
| **Entrada** (1,9s) | 76, 85, 89 | 90, 91, 94 |
| **Regime** (2,5s) | 107, 109, 125 | 110, 127, 135 |

~7% na entrada, ~8% no regime — e **mais barato que a versão de discos
aditivos** (que media 53–60 quadros na mesma janela de entrada):
preencher ~30 caminhos de Bézier pequenos custa menos que carimbar
~120 sprites com blending aditivo.

### O que mantém o custo baixo

| Medida | Efeito |
| --- | --- |
| `MAX_DPR = 1,5` | área a preencher por quadro cai ~45% |
| Cadência de ~30fps no regime | metade do custo permanente |
| Scratch pré-alocado (`Float64Array`) | zero alocação por quadro no laço das línguas |
| Pool fixo de faíscas + `respawnParticle` mutando | zero alocação por quadro nas partículas |
| Sprites de halo pré-renderizados | nenhum `createRadialGradient` por partícula |

### Duas medidas que **não** valeram (história)

1. A labareda em CSS puro animava `background-position` sob um
   `filter: blur()` — o p95 do quadro dobrava (16,8 → 33,3ms). Por isso
   o efeito não usa `filter` nenhum, animado ou não.
2. Discos de gradiente em `lighter` — mais caros E sem silhueta. A
   forma de Bézier resolveu o visual e o custo juntos.

---


## 11. Acessibilidade e movimento reduzido

- O canvas é `aria-hidden="true"` e `pointer-events: none`. Ele é
  decoração pura: a informação "blackjack" vive no veredito da placa de
  nome e no total; "aposta dobrada" vive no texto do botão.
- Com `prefers-reduced-motion: reduce`:
  - o canvas desenha **um quadro** no nível em que a chama assenta
    (`draw(entranceMs + 400)`) e **fica** — sem `requestAnimationFrame`;
  - o aro da carta entra sem animação, direto em `opacity: 0,62`;
  - o reflexo diagonal é removido (`display: none`).

O estouro continua dizendo o que tem de dizer; ele só não se mexe.
Apagar tudo tiraria a informação junto com a animação.

---

## 12. Testes

### Modelo — `src/features/bac-bo/tests/blaze.test.ts` (30)

Todos com `SeededRng`, portanto determinísticos. Sem `Math.random`, sem
`Date.now`.

**Coreografia (7)** — envelope assenta e nunca apaga sozinho; clímax
resolve em 800–1000ms; regime < pico (e nem apagado, nem igual); língua
sem `sustains` assenta em zero; flash é soco e morre antes do
assentamento; `settleProgress` vai de 0 a 1; `entranceMs` cobre todos
os beats.

**Variantes (9)**

| Teste | Invariante |
| --- | --- |
| **seleção da variante** | `model.variant` e `model.config` batem com a pedida |
| pesos das zonas | somam 1 em cada variante |
| blackjack: contagens | 13–18 na entrada, 10–14 no regime, regime < entrada, e **as sobreviventes são as maiores** |
| blackjack: impacto | flash radial, anel, 6–10 raios |
| blackjack: **sem fogo no topo** | 30 sementes, nenhuma língua acima da metade da altura |
| blackjack: alturas por zona | laterais 30–45%, base 18–30%, vão ≤16% |
| blackjack: **base não contínua** | terço central da base < 15% dos sorteios |
| double-button: **coroa de cima** | 30 sementes, nada nasce abaixo de 20% da altura — chama nem faísca |
| double-button: composição e teto | 10–14 chamas, quinas maiores que o meio, tudo dentro do céu de 0,45 (nada cortado), 14–22 faíscas, sem raios, com linha de luz |

**Faíscas (8)** — nascem nas zonas, sobem e freiam; raio ≥ ~2px na mão
(nada microscópico); leva da entrada cabe na entrada; **2–8 vivas por
vez** no regime (ciclo de trabalho); reciclagem muta o mesmo objeto com
trajetória nova; **nenhuma estrela reciclada** (150 renascimentos × 2
variantes); ≤2 estrelas, só na entrada do blackjack; mistura tem
pontos, riscos e brasas.

**Geometria e determinismo (4)** — alturas variadas e desvio para fora;
escala encolhe contagem e tamanho; bamboleio limitado, contínuo e
diferente entre vizinhas; mesma semente → mesmo modelo.

**Hierarquia (1)** — `intensity` do blackjack (1) > botão (0,8).

### Componentes — `components.test.tsx`

| Teste | O que trava |
| --- | --- |
| a labareda só existe onde algo aconteceu | mesa parada não tem canvas nenhum; dobra aceita acende **só** o botão, com `data-variant="double-button"` |
| **o pote NUNCA pega fogo** | com dobra aceita ou recusada: sem `canvas` dentro de `felt-pot`, sem `is-ablaze`, sem `blaze-stage`, fichas intactas |
| blackjack | canvas só na mão que o tirou |
| distribuição | nada acende com as cartas no ar |
| POV | mão do rival não acende antes do showdown; acende depois |

### Desmontagem e limpeza do `requestAnimationFrame`

Coberto pela estrutura, não por asserção: em jsdom o `getContext('2d')`
devolve `null` e o efeito sai antes de agendar qualquer coisa (foi
verificado com uma sonda: zero chamadas de rAF no mount), então um
teste de unidade da limpeza passaria mesmo com o `cancelAnimationFrame`
removido. O que protege é o `return () => cancelAnimationFrame(raf)` no
mesmo escopo do `raf` e a dependência do efeito ser só
`[variant, scale]`.

### Como filmar o efeito

Screenshot comum não serve: cada captura leva ~150ms numa animação de
~0,9s. Para instantes exatos é preciso congelar **os dois relógios**:

```js
// 1. o do JavaScript
const real = performance.now.bind(performance);
window.__clock = real();
const pending = new Map(); let id = 0;
window.requestAnimationFrame = (cb) => { pending.set(++id, cb); return id; };
performance.now = () => window.__clock;
window.__step = (to) => {
  window.__clock = to;
  const cbs = [...pending.values()]; pending.clear();
  cbs.forEach((cb) => cb(window.__clock));
};

// 2. o do CSS — que corre na linha do tempo do NAVEGADOR e ignora o de cima
for (const a of document.getAnimations()) { a.pause(); a.currentTime = ms; }
```

### Instantes de validação

Capturas em **120ms, 450ms, 1,2s, 2,2s e 5s**, Pixel 7, CPU 4× mais
lenta. O contrato dos 5s:

- a mão continua claramente em brasa, com silhuetas de chama nos dois lados;
- não há massa branca nem nuvem amarela sob as cartas;
- o botão tem a coroa acesa e o rastro quente — obviamente especial;
- nenhuma chama aparece cortada pelo viewport;
- PEDIR CARTA e PARAR continuam limpos (as pontas somem atrás deles);
- **o pote está exatamente como sempre foi**.

---


## 13. Como mexer sem quebrar

| Quero… | Mexa em | Cuidado |
| --- | --- | --- |
| Regime mais/menos forte | `flameSustain` da variante | Sozinho não resolve: o `grown` (+45%) e o corte de línguas fazem metade da presença |
| Mais/menos fogo no regime | `tonguesSustain` da variante | As sobreviventes são sempre as MAIORES |
| Mudar onde o fogo nasce | as `zones` da variante | Os pesos têm de somar 1 (há teste); o sorteio estratificado depende disso |
| Chama mais alta | `len` da zona | Precisa caber no céu (`--blaze-sky-*`), senão corta — no botão o teto é o viewport |
| Faísca mais/menos ativa | `particlesSustain` + `restMs` | O teste de vivas-por-vez trava entre 2 e 8 |
| Silhueta mais gorda/magra | `tongueHalfW` da variante | — |
| Novo hospedeiro | Nova linha em `BLAZE_VARIANTS` + `.blaze-stage` + `<BlazeBurst variant=… />` | Não adapte um desenho existente só com `scale` |
| Cor | `BLAZE_PALETTE` | Amarelo/dourado dominam; creme é núcleo; laranja é silhueta |

**Cinco armadilhas.**

1. **Não volte ao blending aditivo nas chamas.** `lighter` soma luz e
   dissolve o contorno — é a receita da nuvem amarela.
2. **Não use `filter` no canvas nem no que anima junto dele.** Medido:
   dobra o p95 do quadro.
3. **Não dimensione o canvas por CSS.** Elemento substituído, laço de
   crescimento — ver §9.
4. **Não anime o container.** A base de cada chama é ancorada; o que
   dança é o corpo. Transform no canvas inteiro = "elemento flutuando".
5. **Não devolva fogo ao pote.** É decisão de direção com teste
   guardando a porta.

---

## 14. Histórico: o que já falhou e por quê

| # | Tentativa | Como ficou | Diagnóstico |
| :-: | --- | --- | --- |
| 1 | Anel de `conic-gradient` girando (CSS) | Glow arco-íris | Anel uniforme é um LED, não fogo |
| 2 | Máscara cônica recortando línguas | Sunburst | Ângulo não distribui por perímetro num retângulo largo |
| 3 | Faixas verticais de período fixo | Código de barras | Dentes retos, mesma altura |
| 4 | Gotas em `radial-gradient` na máscara | Meia-lua dura | Máscara recorta depois do filtro |
| 5 | Línguas pintadas no fundo + blur | Funcionou, mas custava um quadro | `background-position` sob `filter` repinta o blur |
| 6 | Polígono duro no canvas | Caco de vidro amarelo | Borda dura sem curva |
| 7 | Pluma de discos aditivos | **Nuvem amarela desfocada** | Luz somada não tem contorno |
| 8 | Poça de brasa no pote | Bloco amarelo sobre as fichas | Fichas são opacas; e o pote não pode competir com a mão |
| 9 | Regime = clímax congelado | Massa parada | Composições diferentes, não brilho menor |
| 10 | **Bézier em camadas chapadas (atual)** | Fogo cartoon com silhueta | — |

Bugs que a medição achou e o olho não: canvas dobrando de tamanho por
`width:auto` em elemento substituído; faíscas cortadas na borda do céu;
`totalMs` menor que o último beat; regime aceso só de um lado por
sorteio azarado (resolvido com cotas por zona).

---

## 15. Limitações conhecidas

1. **A coroa do botão invade ~5px atrás dos controles.** As pontas das
   quinas (até ~18px) passam da folga de 12px e somem atrás de PEDIR
   CARTA/PARAR (`relative z-10`). É intencional — mas se o layout do
   rodapé mudar, o céu (`--blaze-sky-top`) e as `zones` do botão têm de
   ser recalculados juntos.
2. **O canvas mede o palco uma vez, na montagem.** Se a caixa da mão
   mudar de tamanho com o fogo aceso (hoje não muda: o efeito remonta
   entre rodadas), o fogo ficaria fora de lugar.
3. **A composição do regime é determinística por montagem.** As
   sobreviventes são as maiores — dois estouros diferem na entrada, mas
   o regime tende a composições parecidas (quinas + laterais). É o
   preço de garantir presença; se cansar, o desempate entre línguas de
   altura próxima pode voltar a ser sorteado.
4. **Vários fogos simultâneos não têm medição própria.** O pior caso é
   a mesa única com vários blackjacks no showdown (até 6 canvas mini a
   `scale: 0,55`).
