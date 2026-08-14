# Animação da crupiê

A crupiê da mesa foi **substituída**: saiu o rig antigo (`public/dealer/`, 16 PNGs
convertidos em SVG) e entrou a arte nova de `public/dealernova/`, montada num rig
articulado próprio. Este documento diz **quantas animações existem, quais são as
variações e o que dispara cada uma**.

Resumo em números:

| O quê                                          | Quantas |
| ---------------------------------------------- | ------: |
| Reações (estado do jogo → corpo da crupiê)     |  **10** |
| Beats de ociosidade (variações do repouso)     |   **7** |
| Rostos intercambiáveis                         |   **3** |
| Automatismos contínuos (piscada, lágrima)      |   **2** |
| Articulações animadas de forma independente    |  **11** |

---

## 1. Onde a crupiê nova mora

| Arquivo                                            | Papel                                                          |
| -------------------------------------------------- | -------------------------------------------------------------- |
| `public/dealernova/semvar/*`                       | Corpo padrão (montagem de repouso e idle)                       |
| `public/dealernova/varfeliz/boca-feliz.svg`        | Troca da boca para o rosto feliz                                |
| `public/dealernova/vartriste/*`                    | Troca de boca, pupila e sobrancelha + lágrima                   |
| `src/features/bac-bo/scene/dealer/dealerRig.ts`    | Geometria: posição/escala de cada peça e os pivôs               |
| `src/features/bac-bo/scene/dealer/NovaDealer.tsx`  | O rig e **todas** as variantes de animação                      |
| `src/features/bac-bo/scene/dealer/dealerBeats.ts`  | Sorteio e duração dos beats de ociosidade                       |
| `src/features/bac-bo/scene/dealer/dealerExpression.ts` | Mapa reação → rosto e reação → lágrima                      |
| `src/features/bac-bo/scene/dealer/useDealerReaction.ts` | Mapa fase/desfecho do jogo → reação (já existia)            |

A crupiê antiga foi **desativada**, não apagada: `Dealer` monta a nova por padrão
e ainda aceita `variant="svg"` para montar a antiga (`public/dealer/`), que o jogo
nunca pede. `variant="none"` tira a crupiê de cena.

### Enquadramento

A arte nova entrou **no mesmo lugar e no mesmo tamanho** da anterior. O recorte
(`RIG_VIEWBOX = '1269 40 440 880'`) mantém a proporção 1:2 do rig antigo
(720×1440), e dentro dele a figura foi enquadrada pelos mesmos marcos:
linha dos olhos a ~21% da altura, ombros a ~40%, topo do cabelo a ~2%. Nenhuma
regra de cena, CSS ou layout mudou por causa da troca.

### Proporções da modelo

As peças soltas não trazem escala: cada SVG veio no seu próprio artboard, e
"tamanho natural" não quer dizer nada até alguém decidir o encaixe. As medidas
abaixo foram tiradas **da modelo de referência do rig** e são o que faz a
montagem parecer com ela — as quatro andam juntas, e mexer numa só desmancha a
semelhança:

Duas das medidas são **relações entre peças**, e não escalas absolutas — é o que
permite acertá-las por cálculo, sem depender de estimar tamanho numa referência
de baixa resolução:

| Peça             | Medida                                                    |
| ---------------- | ---------------------------------------------------------- |
| **Olhos**        | O delineado vai **de orelha a orelha** (x 1398 → 1577 na arte do corpo): as pontas do cílio quase encostam na borda do rosto. É essa relação que fixa a escala (0,99 do natural). |
| **Franja**       | A borda de baixo **desce até bater no cílio** (topo do olho, y≈194). É essa relação que fixa o `y` dela. Em tamanho, 0,95 do natural — é ELA que domina o alto da cabeça |
| Cabelo de trás   | Tamanho natural (1,0) — mais largo que os ombros, caindo até o peito |
| Íris             | Enche quase todo o branco — sobra só como foices finas nos cantos |
| Boca             | Tamanho natural — cerca de 1/3 da largura dos olhos          |
| Braços           | Por **fora** do vestido, com uma faixa larga de pele à mostra na lateral |

Franja pequena demais deixava um platô liso de cabelo de trás no cocuruto e a
cabeça lia como grande demais para o corpo. Braços recuados entravam por dentro
do corpo e sumiam. Olhos menores que a distância entre as orelhas mudavam a
personagem — é a medida que mais pesa na leitura do rosto. O recorte da cena
(`RIG_VIEWBOX`) teve o topo subido de 40 para 16 quando a franja cresceu: ela
passou a ser o ponto mais alto da figura.

A íris entra **esticada na horizontal**, e não em escala uniforme: a arte da
pupila é um oval alto e o olho é largo. Mantendo a proporção nativa, ou sobrava
branco demais dos lados (olhar pequeno, de boneca) ou a íris vazava por baixo da
pálpebra.

### Os braços são POSES PRONTAS (não articulam o cotovelo)

Depois de quatro tentativas de articular o cotovelo por rotação (histórico em
`antebraco.md`), os braços passaram a trabalhar por **troca de pose** — cada
pose é uma arte pronta do designer (pasta `varantebraco/`), com o encaixe do
cotovelo resolvido no próprio desenho, até o vinco:

| Pose        | Arte                                                   | Quando entra                     |
| ----------- | ------------------------------------------------------ | -------------------------------- |
| `repouso`   | As quatro peças de sempre, mãos cruzadas no ventre     | Todas as reações neutras — e a **derrota**, de propósito: postura recolhida com as lágrimas por cima |
| `apresenta` | Antebraço estendido nascendo no cotovelo direito, palma aberta | `present` (confirmação de duelo e apostas) — o convite para o jogador agir, sorrindo |
| `palmas`    | Dois antebraços de palma erguida, um por lado          | `celebrate` (lucro) — **batem de verdade**: cada mão afasta e volta ao contato, girando no cotovelo (2,5°, 0,4 s), somada ao pulo do corpo |

**O que a pose troca é o ANTEBRAÇO.** As três artes de `varantebraco/` são
antebraços — a pasta diz isso no nome —, e todas se penduram no mesmo pivô de
cotovelo. Os **braços superiores ficam sempre em cena**: escondê-los para montar
as palmas como braços inteiros deixava o ombro solto, sem nada ligando o corpo à
mão. Nas palmas a ordem de desenho é **invertida** em relação ao repouso — a mão
da direita da tela entra primeiro e fica atrás da esquerda, como no desenho de
referência —, e o repouso mantém a ordem original, que já tinha o encaixe certo.

A troca é crossfade de 200 ms (o mesmo `blendMs` do rosto). A pose `apresenta`
ganha uma flutuação lenta da mão (±2,5° em 3,2 s), de quem sustenta o gesto. O
repouso — único que ainda articula — fica **pinado**: cotovelo preso à pose de
encaixe perfeito (clamp de ±1,5°, a micro-flexão que o idle provou ser
invisível), com os gestos restantes morando no ombro.

O mapa reação → pose vive em `bracosForReaction` (`dealerExpression.ts`),
coberto por teste, e o rig expõe `data-bracos` para inspeção.

**O ombro só ABRE, nunca fecha.** O braço superior vive atrás do tronco e o
antebraço à frente do vestido: girando o ombro para dentro, o braço superior
afunda no tronco e some enquanto o antebraço continua em cena — o braço parte no
meio e o cotovelo vira um degrau. Era o que deformava a pose de choro (fechava
4°) e, em menor grau, a tensão e o pedido de desculpas. O construtor das
variantes agora trava o ângulo em ≥ 0 (`abre()` em `NovaDealer.tsx`), então
nenhuma pose consegue fechar por engano. Abrir é seguro: a calota do ombro gira
em torno do próprio centro, o topo continua coberto pelo deltoide desenhado no
corpo e o braço só ganha mais pele à mostra.

Com ângulo zero a pose fica **idêntica à de repouso, pixel a pixel** — o encaixe
perfeito da arte. É o que `console`, `anticipate` e `apologize` usam: a emoção
vem do corpo (mais baixo e encolhido), do rosto e das lágrimas, não de torcer
os braços.

### O caixa reage à sessão, não à última mão

Na fase `completed` (o caixa, "BOA PARTIDA!"), a reação sai do **desfecho da
SESSÃO** — stack final contra o buy-in — e não do desfecho da última mão. A mesa
é uma sessão: quem perdeu a última mão mas se levantou no lucro levou a noite, e
uma crupiê chorando ao lado de um "você terminou no positivo" era contradição em
cena. No `settle` (showdown), segue valendo o desfecho da mão — ali é a ela que
a mesa reage. (`useDealerReaction.ts`, coberto por teste.)

### Duas costuras que sustentam o rig

Vale saber que existem, porque limitam o que dá para animar:

- **Corte cabeça/corpo.** O `Corpo-base.svg` é uma peça só (cabeça, tronco e
  vestido no mesmo desenho); para a cabeça se mover, ela é **recortada** do resto.
  O corte cai na sombra preta e chapada sob o queixo (`CORTE_CABECA`/`CORTE_CORPO`),
  onde ele não aparece — e mora no espaço da **cena**, fora do grupo que gira, para
  a borda de baixo da cabeça cair sempre na mesma linha e nunca abrir fresta.
  **Orçamento: ±6° de giro e ±4 de deslocamento.** Passando disso a emenda sai da
  faixa preta e fica visível.
- **Calotas de ombro e cotovelo.** Os pivôs não são a ponta das peças, e sim o
  **centro do círculo** de cada calota (ombro ≈ raio 19,5; cotovelo ≈ raio 30),
  medidos por varredura de pixel. O antebraço ainda começa ~14 unidades acima do
  pivô do cotovelo, para a calota de uma peça entrar por dentro da outra: é essa
  sobreposição que faz o contorno atravessar a articulação sem degrau.

### Ajustes feitos na arte recebida

Três correções mínimas, todas em `public/dealernova/`:

1. `braco-dir.svg` e `braco-esq.svg` vinham com um **resíduo de exportação** (um
   fragmento solto da mão, herdado do arquivo do antebraço) que inflava o viewBox
   e desenhava uma mancha flutuante. Removido, viewBox reapertado no braço.
2. `pupila-padrao.svg` e `pupila-triste.svg` traziam **as duas pupilas no mesmo
   arquivo**, com um espaçamento que não bate com o dos olhos — encaixadas como par
   único, ficavam vesgas. Foram divididas em `-dir`/`-esq`, o que também deu ao rig
   o controle por olho de que o olhar precisa.
3. Nada mais foi redesenhado: posição e escala de cada peça são só números em
   `dealerRig.ts`.

---

## 2. As 10 reações

A reação é escolhida por `resolveDealerReaction(fase, desfecho)` — o mapa já
existente do jogo. Cada uma move **corpo, cabeça, braços, sobrancelhas, pálpebras,
pupilas e boca** de uma vez.

| Reação       | Quando entra em cena                                            | O que a crupiê faz                                                                                            |
| ------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `idle`       | Menu, busca, mesa parada, fase `completed`                        | Respiração de 4,4 s, cabeça oscilando em 9 s, braços em 5,5 s — ciclos **de durações primas entre si**, para o conjunto não repetir. É a única reação que recebe os beats do §3. |
| `greet`      | Fase `found` (rival encontrado)                                   | **Acena**: um braço sobe e desce duas vezes em 1,25 s, cabeça inclinada, corpo sobe 6 — e o **rosto fica feliz**. |
| `present`    | Fases `confirm` e `betting`                                       | Apresenta a mesa: braços abertos 7°, respiração mais longa (4,8 s).                                              |
| `anticipate` | `countdown`                                                       | Tensão: respiração curta de 0,9 s, braços recolhidos, sobrancelhas baixas, olhos semicerrados (0,86).            |
| `shake`      | `dealing` e `handover` (distribuindo / recolhendo o pote)          | **É o antebraço que trabalha**, em 0,42 s, com o corpo balançando de leve — não o corpo inteiro sacudindo.       |
| `reveal`     | `settle` (showdown)                                               | Inclina-se para a frente (desce 10), cabeça virada 3,5°, olhos **mais abertos** (1,1).                           |
| `celebrate`  | **Lucro na mesa** — desfecho `win` da mão e do caixa da sessão     | Ver §2.1.                                                                                                       |
| `console`    | **Prejuízo na mesa** — desfecho `lose`                            | Ver §2.2.                                                                                                       |
| `shrug`      | Empate (`tie`)                                                    | Dá de ombros: braços abrem 12° numa mola rápida, corpo sobe 10 e volta em 0,6 s, cabeça de lado.                 |
| `apologize`  | Fase `error`                                                      | Cabeça baixa, corpo pesado (desce 16), **olhos fechados** (0,12) e rosto triste — sem lágrima.                   |

### 2.1 Comemoração (lucro)

O ciclo tem **1,15 s** e repete enquanto a tela do lucro estiver em cena:

- **Dois pulos de alturas diferentes** por ciclo (−38 e −26). Um pulo só, repetido,
  vira metrônomo; o segundo, mais baixo, dá o quique de quem está genuinamente
  animada.
- **Agacha antes de subir** (`scaleY` 0,94 no impulso, 1,045 no ar): é o
  squash & stretch, ancorado no quadril, que faz o pulo ter peso em vez de parecer
  a figura deslizando para cima.
- **Braços abertos no ar**, oscilando entre 20° e 30° no ombro, com o **cotovelo
  esticando** (0° → −10°) — o braço abre inteiro, não dobrado.
- **Cabeça balançando** ±4° e **corpo girando** ±2,2°, ambos em contratempo com o
  pulo (meio ciclo), que é o que dá a sensação de solavanco alegre.
- **Rosto feliz** (boca aberta com dentes), sobrancelhas erguidas 3, olhos
  levemente semicerrados de sorriso (0,9), pupilas subindo 1,5, e a boca ganha um
  realce de escala de 7%.

### 2.2 Tristeza (prejuízo)

O oposto exato da curva acima, e de propósito:

- **Corpo desce e fica pesado**: repousa 12 abaixo e respira longo entre 12 e 16
  em **2,8 s** (contra 1,15 s da comemoração), com `scaleY` 0,985 — encolhida.
- **Ombros caídos** (braços fecham 4°), **cotovelos recolhidos** (12°) —
  as mãos se juntam à frente.
- **Cabeça baixa e virada** 4,5°, pupilas descendo 2,5, pálpebras a 0,72.
- **Rosto triste completo**: boca, pupila e sobrancelha trocadas pelas peças de
  `vartriste`.
- **Lágrimas** (ver §5).

---

## 3. Os 7 beats de ociosidade

O problema que eles resolvem: um `idle` sozinho é uma curva que se repete, e em
dez segundos o olho já decorou o ciclo — a figura vira um GIF. Os beats são gestos
curtos que entram **por cima** do idle, seguram por um instante e devolvem o corpo
ao repouso.

**Quando disparam:** só na reação `idle`, e só em qualidade alta. Entre um gesto e
o seguinte há uma pausa **aleatória de 2,6 s a 6,4 s** (ritmo fixo lê como
máquina), e o sorteio **nunca repete o gesto anterior** — dois "olhar para a
direita" seguidos leem como travamento, não como vida.

| Beat          | Duração | O que acontece                                                                                     |
| ------------- | ------: | -------------------------------------------------------------------------------------------------- |
| `olharDir`    |  1,5 s  | Olha para a direita da tela: pupilas correm 3,5 e a cabeça acompanha com 2° de inclinação.           |
| `olharEsq`    |  1,5 s  | O mesmo, para a esquerda.                                                                            |
| `inclina`     |  1,9 s  | Inclina a cabeça 5,5°, curiosa, com as sobrancelhas subindo de leve e o olhar correndo 2.             |
| `sorriso`     |  1,4 s  | **Troca a boca para a feliz** e volta — um sorriso que aparece e some, sem motivo aparente.           |
| `alonga`      |  2,6 s  | Respira fundo: corpo sobe 12 e estica (`scaleY` 1,02), ombros abrem 10°, cabeça vai para trás, olhar sobe. |
| `ajeitaOmbro` |  1,7 s  | Troca o peso de pé: o corpo desliza 7 para o lado, com um ombro subindo mais que o outro.             |
| `confere`     |  1,6 s  | Confere a mesa: corpo desce 5, cabeça e olhar descem, pálpebras baixam de leve.                       |

Tecnicamente, reação e beat são **dois rótulos de variante empilhados**
(`animate={[reação, beat]}`) no grupo raiz: o framer os propaga por toda a árvore,
e cada articulação declara o que tem a dizer sobre cada rótulo e ignora o resto.
É isso que permite um olhar de lado acontecer **por cima** da respiração sem que um
anule o outro — e o motivo de um beat que uma peça não conhece deixá-la exatamente
onde a reação a colocou.

---

## 4. Os 3 rostos

O rosto é escolhido **separadamente** do corpo (`dealerExpression.ts`), porque as
duas coisas não andam juntas: a crupiê pode comemorar de rosto feliz enquanto o
corpo faz o pulo, e pode ter rosto triste num gesto que o corpo conduz devagar.

| Rosto     | Peças trocadas                                            | Reações que o pedem                                       |
| --------- | ---------------------------------------------------------- | ---------------------------------------------------------- |
| `neutra`  | boca, pupila e sobrancelha padrão                          | `idle`, `present`, `anticipate`, `shake`, `reveal`, `shrug` |
| `feliz`   | só a **boca** (sorriso aberto com dentes)                  | `greet`, `celebrate` — e o beat `sorriso`                   |
| `triste`  | **boca + pupila + sobrancelha** de `vartriste`             | `console`, `apologize`                                      |

A troca é **crossfade de 200 ms** (`DEALER_TIMINGS.blendMs`), nunca corte seco: não
existe transform que interpole um sorriso fechado num sorriso aberto com dentes, e
a única forma honesta de morfar peças diferentes é dissolver uma na outra.

---

## 5. Os 2 automatismos contínuos

Rodam por conta própria, por cima de qualquer reação:

**Piscada.** A cada ~5 s (`blinkEveryMs`), com **jitter de ±35%**, a pálpebra fecha
por 110 ms. Em **25% das vezes a piscada é dupla** (segunda batida 110 ms depois) —
o olho humano pisca em rajada, e uma piscada perfeitamente periódica é das coisas
que mais denunciam um boneco. O squash vertical vale para o branco **e** para a
pupila: piscar com a íris parada entrega o truque.

**Lágrimas.** Só em `console` (a derrota). Nascem no canto do olho, engordam,
escorrem 46 unidades pela bochecha e somem, num ciclo de 2,3 s com 0,5 s de pausa.
As duas correm **dessincronizadas** — a segunda entra 0,9 s depois da primeira —,
porque duas lágrimas simétricas caindo juntas parecem um efeito, não choro.
`apologize` usa o mesmo rosto triste **seco**: não se chora por um bug.

---

## 6. Qualidade e acessibilidade

`quality="low"` — que a cena liga sozinha em `prefers-reduced-motion` ou quando o
jogador escolhe cenário reduzido — congela **todos** os loops (`MotionConfig
reducedMotion="always"`), desliga a piscada, desliga os beats de ociosidade e tira
as lágrimas de cena. A crupiê continua montada e nas poses corretas de cada
reação; ela só para de se mexer.

`scenery: 'off'` remove a cena inteira, crupiê incluída.

---

## 7. As 11 articulações

Para referência de quem for mexer: raiz (quadril), cabeça, ombro direito, ombro
esquerdo, cotovelo direito, cotovelo esquerdo, sobrancelhas, pálpebras, pupilas,
boca e lágrimas. Cada uma gira em torno de um pivô medido, declarado em
`PIVOTS` (`dealerRig.ts`) — mexer num valor de lá move a articulação inteira, em
todas as 17 animações de uma vez.
