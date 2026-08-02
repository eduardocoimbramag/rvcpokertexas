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
> 01/08/2026.

---

## Sumário

1. [O que é, em uma frase](#1-o-que-é-em-uma-frase)
2. [Onde mora — mapa dos arquivos](#2-onde-mora--mapa-dos-arquivos)
3. [Quando acende e quando apaga](#3-quando-acende-e-quando-apaga)
4. [A forma: entrada + regime](#4-a-forma-entrada--regime)
5. [As cinco camadas](#5-as-cinco-camadas)
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

Um **estouro de luz dourada que bate uma vez e vira fogueira**, desenhado
em canvas atrás da mão de cartas (ou atrás do botão da dobra), e que
queima enquanto o motivo dele existir.

Os dois motivos são:

| Gatilho | Onde queima |
| --- | --- |
| **Blackjack natural** (21 nas duas primeiras cartas) | A mão que o tirou |
| **Aposta dobrada aceita** pelo rival | O botão da dobra **e** o pote no feltro |

---

## 2. Onde mora — mapa dos arquivos

| Arquivo | Papel | Linhas |
| --- | --- | :-: |
| `src/features/bac-bo/animations/blaze.ts` | **Modelo**: física, coreografia e paleta, em números puros. Sem desenho. | 414 |
| `src/features/bac-bo/components/table/BlazeBurst.tsx` | **Renderizador**: o `<canvas>`, os sprites e o laço de animação. | 372 |
| `src/index.css` (bloco `A COMBUSTÃO DOURADA`) | **Palco** (`.blaze-stage`, `.blaze-burst`) e o tratamento das **cartas**. | ~175 |
| `src/index.css` (`.double-cta--accepted`) | Céu do estouro no botão da dobra. | ~12 |
| `src/index.css` (`.felt-pot.is-ablaze`) | Céu do estouro no pote + a poça de brasa sob as fichas. | ~30 |
| `src/features/bac-bo/tests/blaze.test.ts` | 14 testes do modelo. | 210 |

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
// HandsArena.tsx
const stakeAblaze = doubleBet?.status === 'accepted';
```

Acende em **dois** lugares:

- o **botão** (`.double-cta--accepted`) — que é seu, e não existe na
  tela do rival;
- o **pote** (`.felt-pot.is-ablaze`) — que é da mesa, está no meio do
  feltro à vista dos dois lados, e é literalmente o valor que dobrou.

É o pote que faz a dobra ser um fato da mesa em vez de um aviso privado.

---

## 4. A forma: entrada + regime

```
 força
   │        ╭──╮  ← chamas no pico
 1 ─┤       ╱    ╲___________________________________  ← regime (0,78)
   │      ╱
   │  ╱╲ ╱                     ENTRADA          REGIME
   │ ╱  ╳  ← flash              ~1,9s        até desmontar
 0 └─┴──┴──────────────────────────┼─────────────────────────▶ tempo
     0  400ms                    1900ms
```

| Fase | Duração | O que roda | Cadência |
| --- | --- | --- | :-: |
| **Entrada** | `BLAZE.entranceMs` = **1900ms** | flash, anel de impacto, raios, chamas subindo ao pico, leva inteira de faíscas | 60fps |
| **Regime** | enquanto o componente viver | chamas em `flameSustain`, faíscas reciclando | ~30fps |

O que é **impacto** — flash, anel e raios — acontece uma vez só. Um soco
que se repetisse a cada dois segundos viraria estroboscópio, não
fogueira.

`entranceMs` é **derivado**, nunca escrito à mão:

```ts
get entranceMs(): number {
  return Math.max(
    this.flashInMs + this.flashOutMs,              //  455
    this.rayInMs + this.rayLifeMaxMs,              //  630
    this.flameInMs + this.flameHoldMs + this.flameOutMs, // 1320
    this.particleStaggerMs + this.particleLifeMaxMs,     // 1900  ← manda
  );
}
```

Encurtar um beat e esquecer deste número cortaria o rastro no ar. Há um
teste cobrindo exatamente essa invariante.

---

## 5. As cinco camadas

A ordem de pintura é **raios → chamas → flash → faíscas**, tudo em
`globalCompositeOperation = 'lighter'` (aditivo). Aditivo importa: duas
chamas que se cruzam **clareiam** em vez de se cobrir, e é assim que o
núcleo branco-quente aparece na base sem ninguém pintar branco.

### 5.1 Impacto de luz

Um clarão radial no **centro inferior** da mão, mais um **anel** que
corre para fora.

- Sobe em 55ms, some em 400ms.
- Núcleo branco (`#FFF8DC`) num miolo pequeno, depois dourado, ouro e
  âmbar; o branco não domina.
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

### 5.2 Chamas estilizadas

O coração do efeito. Cada língua é uma **pluma de discos macios**
carimbados ao longo de uma espinha curva:

```
        ·        ← u=1  ponta: âmbar, raio pequeno, alfa baixo
       ○
      ◯          ← a espinha pende para fora (u²) e recebe
     ◯◯             a deformação lateral do ruído
    ◯◯◯
   ●●●●●         ← u=0  base: núcleo, raio grande, alfa alto
  ═══════        ← a borda da mão
```

- **6 carimbos** por língua (`STAMPS`).
- Raio: `halfW × (2,3 − 1,7·u)` — encolhe subindo.
- Alfa: `env × (1−u)^1,2 × 0,62` — some subindo.
- Sprite por temperatura: núcleo até `u<0,13`, ouro até `u<0,58`, âmbar
  daí para cima.
- Nascem só na **base e nas laterais** (`perimeterPoint`) — 56% na base.
  O topo fica de fora: chama não nasce em cima do que ela está queimando.
- Pendem para **fora** do centro: fogo em volta de um objeto abre.
- Quem nasce longe do centro é mais alta, porque a chama que aparece é a
  que escapa da silhueta.

O que se move é a **forma de cada língua**, nunca o efeito inteiro —
subir e descer em bloco foi o que fez a versão anterior parecer um
elemento flutuando.

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

15 a 38 no pool, conforme a densidade e a escala do hospedeiro (ver
§6.3), em quatro tipos:

| Tipo | Desenho | Notas |
| --- | --- | --- |
| `dot` | sprite dourado | ~50% da mistura |
| `spark` | risco alongado na direção do movimento, encolhendo com a velocidade | ~30% |
| `ember` | sprite laranja profundo, mais fraco | ~20% |
| `star` | dois riscos cruzados, só nos primeiros 45% da vida | **2 ou 3, e só na entrada** |

Física:

```
v(t) = v₀ · e^(−d·t)                    arrasto exponencial
posição = v₀ · (1 − e^(−d·t)) / d       a integral disso
x += sin(t·swayF + phase) · swayA       bamboleio lateral próprio
alfa = fadeIn · (1 − k)^1,5             some sem corte
```

A faísca é definida pelo **quanto ela sobe**, não pela velocidade
inicial: `vy = alcance × arrasto`, com alcance ≤ 0,78 do lado menor da
mão. Ver §14 para o bug que isso corrigiu.

**Reciclagem.** No regime permanente, cada faísca que morre renasce no
perímetro com trajetória, tipo e tamanho novos, e um descanso sorteado
até `particleRestMs` (2200ms). Com vida média ~1,15s e descanso médio
~1,1s, sobra **menos da metade viva** a cada instante — brasa subindo de
uma fogueira, e não chuveiro para sempre.

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
| Aro dourado + brilho interno | `::before` (`card-rim`) | Entra em 8%, **fica** em `opacity: 0,62` |
| Reflexo diagonal | `::after` (`card-sheen`) | Atravessa a carta **uma vez**, em 0,95s |

O aro fica pelo mesmo motivo que a chama fica: enquanto a mão for
blackjack, a carta está em brasa. Um aro que apagasse sozinho com a
fogueira ainda queimando atrás deixaria a carta desconectada do próprio
efeito.

O reflexo é **dourado, não branco**: a faixa atravessa uma carta de
papel-marfim, e branco sobre marfim não é reflexo — é nada. O miolo
champagne só dá o fio de luz no meio do ouro.

A luz atravessa a **mão**, não cada carta por conta própria: a segunda
carta recebe o reflexo 0,19s depois da primeira (0,28s a terceira, 0,36s
da quarta em diante), e o olho lê uma faixa só passando pelas duas.

---

## 6. O modelo (`blaze.ts`)

### 6.1 Paleta

Guardada como triplas `R, G, B` (sem `rgb()`) porque o renderizador
compõe `rgba(${cor}, ${alfa})` a cada uso.

| Token | Hex | Papel |
| --- | --- | --- |
| `core` | `#FFF8DC` | Núcleo branco-quente |
| `lightGold` | `#FFD76A` | Dourado claro |
| `gold` | `#FFB800` | **Ouro principal — a cor que manda na cena** |
| `amber` | `#FF8A00` | Âmbar |
| `deepOrange` | `#E84A00` | Laranja profundo — **só extremidade** |
| `ember` | `#8C2100` | Brasa — ponto isolado, nunca massa |

### 6.2 Coreografia (`BLAZE`)

| Constante | Valor | O que governa |
| --- | :-: | --- |
| `flashInMs` | 55 | Subida do flash |
| `flashOutMs` | 400 | Queda do flash |
| `rayInMs` | 70 | Entrada dos raios |
| `rayLifeMinMs` / `rayLifeMaxMs` | 380 / 560 | Vida de cada raio |
| `flameInMs` | 160 | Chamas subindo ao pico |
| `flameHoldMs` | 520 | Pico sustentado |
| `flameOutMs` | 640 | Assentamento até o regime |
| `flameSustain` | **0,78** | Nível do regime permanente |
| `particleStaggerMs` | 320 | Escalonamento da leva de entrada |
| `particleLifeMinMs` / `MaxMs` | 720 / 1580 | Vida de cada faísca |
| `particleRestMs` | 2200 | Descanso máximo antes de renascer |
| `entranceMs` | **1900** (derivado) | Fim da entrada |

### 6.3 Densidade por perímetro

Uma contagem fixa serve a uma mão de cartas e **some** numa pílula de
330×44: o mesmo punhado de línguas espalhado por uma borda três vezes
mais longa vira fogo ralo.

```ts
const burningEdge = rect.w * 1.16 + rect.h * 0.92 * 2;  // base + laterais
const density = burningEdge / (unit * 3.6);             // 1 num hospedeiro quadrado
const tongueCount = clamp(8, round(lerp(18, 23) * scale * density), 40);
```

| Hospedeiro | Caixa (px) | `scale` | `density` | Línguas | Faíscas |
| --- | --- | :-: | :-: | :-: | :-: |
| Mão do duelo | ~143 × 95 | 1 | 1,00 | ~20 | ~28 |
| Botão da dobra | ~330 × 44 | 1 | 2,93 | **40** (teto) | **38** (teto) |
| Pote | ~90 × 40 | 0,7 | 1,24 | ~18 | ~24 |
| Mão mini (assento) | ~63 × 42 | 0,55 | 0,99 | ~11 | ~15 |

O **teto de 40** existe porque cada língua custa seis carimbos por
quadro e o regime dura a mão inteira.

### 6.4 Funções exportadas

| Função | O que faz |
| --- | --- |
| `buildBurst(rng, rect, scale)` | Monta o modelo inteiro (línguas, raios, faíscas, flash, centro) |
| `respawnParticle(rng, rect, scale, p, opts)` | (Re)nasce uma faísca **mutando** o objeto |
| `perimeterPoint(rect, t)` | Ponto no perímetro que queima, ponderado |
| `flameEnvelope(ms)` | Sobe → segura → assenta em `flameSustain`. **Nunca volta a zero** |
| `flashEnvelope(ms)` | Sobe quase instantâneo, cai suave, chega a zero |
| `tongueNoise(tongue, s)` | Ruído barato: duas senoides de frequências que não se dividem |
| `easeOutCubic(k)` | `1 − (1−k)³` |

Sobre o ruído: não é Perlin. Para deformar a ponta de uma língua o olho
não distingue, e custa duas multiplicações em vez de uma tabela de
gradientes.

---

## 7. O renderizador (`BlazeBurst.tsx`)

### 7.1 API

```tsx
<BlazeBurst scale={1} />
```

| Prop | Padrão | O que faz |
| --- | :-: | --- |
| `scale` | `1` | Régua do hospedeiro. Encolhe **contagem e tamanho** juntos |

Valores em uso: `1` (mão do duelo, botão da dobra), `0,7` (pote), `0,55`
(mão mini de assento).

O componente sempre renderiza um `<canvas class="blaze-burst"
aria-hidden data-testid="blaze-burst">`. Ele **precisa** ter um pai com
`.blaze-stage` — é do pai que sai a caixa do que está queimando.

### 7.2 Sprites

Quatro `<canvas>` de 64×64 com um gradiente radial, desenhados **uma
vez** na montagem (núcleo, ouro, âmbar, brasa). Depois é só `drawImage`.

Criar um `createRadialGradient` por partícula por quadro seriam ~1900
gradientes por segundo. É a diferença entre um efeito que cabe no
orçamento e um que não cabe.

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
| `.double-cta--accepted` | 0,05 | 1,75 | 1,30 | A pílula já tem 330px de largura; o que falta é altura |
| `.felt-pot.is-ablaze` | 0,42 | 1,45 | 0,85 | Monte baixo no meio do feltro |

O pote ainda ganha uma **poça de brasa parada** sob as fichas
(`::before`, `z-index: -1`), sem contorno: as fichas são discos soltos e
não preenchem retângulo nenhum — um aro nítido apareceria como uma
pílula pálida atravessando o monte.

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

### Regime permanente (2,5s, depois da entrada)

| | quadros |
| --- | --- |
| **com fogo** | 105, 108, 111 |
| sem fogo | 111, 113, 116 |

**~5% de custo.** É o número que importa, porque é o que dura.

### Entrada (janela de 1,9s)

| | quadros |
| --- | --- |
| **com estouro** | 56, 61, 65 |
| sem estouro | 72, 74, 80 |

~20% durante o clímax, e por tempo limitado.

### O que baixou o custo

| Medida | Efeito |
| --- | --- |
| `MAX_DPR = 1,5` (em vez de 2) | Área a preencher por quadro cai **~45%**. Num efeito de brilhos macios ninguém vê a diferença |
| Cadência de 30fps no regime | Metade do custo, justamente na parte permanente |
| Sprites pré-renderizados | Elimina ~1900 `createRadialGradient`/s |
| `STAMPS = 6` por língua | Entrada: 47 → 61 quadros na mesma janela |
| Pular carimbo com `alpha < 0,015` | Carimbo que não se vê não se paga |
| Teto de 40 línguas / 38 faíscas | Limita o pior caso do botão da dobra |

### Uma medida que **não** valeu

Uma tentativa anterior (a labareda em CSS puro, hoje removida) animava
`background-position` sob um `filter: blur()`. Medido: p95 do quadro
subia de **16,8ms para 33,3ms** — exatamente um quadro perdido a cada
tanto — porque o filtro era refeito quadro a quadro. É o mesmo motivo
pelo qual o canvas hoje não usa `filter` nenhum.

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

### Modelo — `src/features/bac-bo/tests/blaze.test.ts` (14)

Com `SeededRng`, então são determinísticos.

| Teste | Invariante |
| --- | --- |
| envelope das chamas | sobe, segura, **assenta** em `flameSustain` e nunca volta a zero |
| envelope do flash | pico em `flashInMs`, zero antes das chamas assentarem |
| `perimeterPoint` | nada nasce acima do topo do retângulo |
| peso do perímetro | mais da metade das chamas na base |
| contagens | 6–10 raios, ≤3 estrelas, ≥3 tipos de partícula |
| faíscas | nascem coladas na mão, sobem (`vy < 0`), freiam (`drag > 0`) |
| dispersão | ≥8 velocidades e ≥4 instantes de nascimento distintos |
| **entrada cobre os beats** | `entranceMs` ≥ cada beat — nada cortado no ar |
| alturas | ≥6 comprimentos distintos; desvio aponta para fora |
| escala | encolhe contagem **e** tamanho; piso de 6 raios |
| ruído | limitado a ±1 e diferente entre línguas vizinhas |
| determinismo | mesma semente → mesmo modelo |
| **reciclagem** | `respawnParticle` devolve o **mesmo** objeto, com trajetória nova |
| estrela no regime | nunca reaparece em 200 renascimentos |

### Componentes — `components.test.tsx`

| Teste | O que trava |
| --- | --- |
| a combustão é um evento | mesa parada não tem canvas nenhum |
| dobra aceita | canvas no botão **e** no pote, e em nenhuma mão |
| blackjack | canvas só na mão que o tirou |
| distribuição | nada acende com as cartas no ar |
| POV | mão do rival não acende antes do showdown; acende depois |

### Como filmar o efeito

Screenshot comum não serve: cada captura leva ~150ms numa animação de
1,9s. Para instantes exatos é preciso congelar **os dois relógios**:

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
for (const a of document.getAnimations()) {
  if (['card-ignite', 'card-rim', 'card-sheen'].includes(a.animationName)) {
    a.pause();
    a.currentTime = ms;
  }
}
```

Foi por esquecer o segundo que o reflexo diagonal passou três rodadas
sendo fotografado depois de já ter atravessado.

---

## 13. Como mexer sem quebrar

| Quero… | Mexa em | Cuidado |
| --- | --- | --- |
| Fogo mais/menos forte no regime | `BLAZE.flameSustain` | Abaixo de ~0,6 vira brilho tímido (medido em 0,58) |
| Estouro mais longo | `flameHoldMs` / `flameOutMs` | `entranceMs` acompanha sozinho |
| Faísca mais densa no regime | `BLAZE.particleRestMs` (menor = mais) | Custo do regime sobe junto |
| Chama mais alta | `len` em `buildBurst` | Precisa caber no céu (`--blaze-sky-*`), senão corta |
| Faísca mais alta | o `climb` em `respawnParticle` | **Idem** — o teto é o `padTop` |
| Novo hospedeiro | `.blaze-stage` + `<BlazeBurst scale=… />` | O palco tem de ter **exatamente** a caixa do que queima |
| Cor | `BLAZE_PALETTE` | O ouro tem de continuar dominando; laranja só em extremidade |
| Suavidade | `STAMPS`, raio dos carimbos | Custo por quadro é linear em `STAMPS × línguas` |

**Três armadilhas.**

1. **Não use `filter` no canvas nem no que anima junto dele.** Foi
   medido: dobra o p95 do quadro.
2. **Não dimensione o canvas por CSS.** Elemento substituído, laço de
   crescimento — ver §9.
3. **Não deixe faísca ultrapassar o céu.** O alcance vem do `climb`, e o
   céu vem do `--blaze-sky-top`; se um crescer, o outro tem de crescer.

---

## 14. Histórico: o que já falhou e por quê

Vale registrar, porque cada erro aqui parecia razoável no papel.

| # | Tentativa | Como ficou | Diagnóstico |
| :-: | --- | --- | --- |
| 1 | Anel de `conic-gradient` girando (CSS) | Glow arco-íris girando | Anel de cor uniforme é um LED, não uma labareda |
| 2 | Máscara **cônica** recortando línguas | **Sunburst** | Num botão de 330×44, alguns graus de ângulo valem meia borda no meio e quase nada nas quinas |
| 3 | Faixas verticais de período fixo | **Código de barras** | Dentes de topo reto, todos do mesmo comprimento |
| 4 | Gotas em `radial-gradient` na máscara | Meia-lua com base descontínua | Máscara é recortada **depois** do filtro: a borda sai dura faça o que fizer |
| 5 | Línguas pintadas no fundo + blur | Funcionou — mas custava um quadro | `background-position` animado sob `filter` refaz o blur por quadro |
| 6 | Polígono preenchido no canvas | **Caco de vidro amarelo** | Polígono tem borda dura; fogo não tem borda nenhuma |
| 7 | Pluma de sprites (atual) | Fogo | — |

Bugs corrigidos pelo caminho, que a medição achou e o olho não:

- **Canvas dobrando de tamanho** a cada passagem (§9).
- **Faíscas cortadas na borda**: as mais rápidas viajavam ~150px num céu
  de 90px. Corrigido definindo a faísca pelo alcance (`vy = alcance ×
  arrasto`) em vez da velocidade.
- **`totalMs` curto demais**: `particleStagger + lifeMax` (1900ms)
  passava do desligamento (1850ms). Hoje o número é derivado e há teste.
- **Botão queimando ralo**: contagem fixa de línguas num perímetro 3×
  maior. Corrigido com a densidade por perímetro (§6.3).

---

## 15. Limitações conhecidas

1. **O botão da dobra fica no rodapé**, então as chamas nascidas na base
   dele caem fora do viewport (`#root` tem `overflow: hidden`). O que se
   vê é a linha de fogo na borda e o brilho escapando por cima. É
   aceitável, mas é menos fogo do que o efeito desenha.
2. **O canvas mede o palco uma vez**, na montagem. Se a caixa da mão
   mudar de tamanho com o fogo aceso (não acontece hoje: as cartas têm
   tamanho fixo e a mão só cresce entre rodadas, quando o efeito
   remonta), o fogo ficaria fora de lugar. Um `ResizeObserver`
   resolveria, ao custo de complexidade que ainda não se paga.
3. **A luz do botão passa por cima de PEDIR CARTA / PARAR.** É aditiva e
   sutil, e lê como brilho de fogo espalhando — mas é sobreposição real,
   não ilusão.
4. **Vários fogos simultâneos não foram medidos.** O pior caso plausível
   é a mesa única do torneio com vários blackjacks no showdown (até 6
   canvas mini). O `scale: 0,55` reduz cada um, mas o total não tem
   medição própria.
