# Fundo do salão — especificação e prompts de geração

> Documento de produção. O fundo em uso é `public/fundocassinobot.webp` —
> arte própria, gerada com o **prompt 2** (jardim de inverno) desta
> página. Aqui está **tudo o que uma imagem nova precisa respeitar** para
> entrar no jogo sem quebrar a cena, mais os cinco prompts para novas
> rodadas.
>
> O fundo anterior (`fundocassino.webp`), herdado de outro projeto, foi
> removido do repositório — está no histórico do git se precisar.

---

## 1. Especificação técnica

| Item | Valor |
| --- | --- |
| **Resolução** | **1024 × 1536 px** (retrato, proporção 2:3) |
| Proporção | 2:3 — a mesma do arquivo atual; não mude |
| Formato de entrega | PNG/WebP do gerador → recomprimido para **WebP com perdas** |
| Peso alvo | ≤ 300 KB (o atual tem 217 KB) |
| Caminho no projeto | `public/fundocassinobot.webp` |
| Referências no código | `src/index.css` (`.scene-ambient__stage` e `.scene-ambient__wash::before`) e o `<link rel="preload">` do `index.html` |

**Por que 1024 × 1536.** É o tamanho retrato nativo do GPT Image (os três
suportados são 1024×1024, 1024×1536 e 1536×1024) e é exatamente o do
arquivo atual, então a troca é 1:1 — nenhum ajuste de CSS. Pedir outra
proporção obriga a recortar, e o recorte quebra o mapa de zonas da seção 2.

**Retina (opcional).** Se quiser dobrar a nitidez, gere em 1024×1536 e
faça upscale para 2048×3072 num upscaler; **não** peça ao gerador uma
proporção diferente para "ganhar" pixels.

**Peso: a pegadinha.** O GPT Image devolve WebP **sem perdas** — a arte
atual chegou com **1,4 MB**. É inviável: o fundo é pré-carregado com
`fetchpriority="high"`, ou seja, ele disputa a primeira pintura da tela.
Recomprimir com perdas em q≈0,9 derrubou para **217 KB (6,3×)** sem
banding visível nos gradientes escuros, que é onde o WebP costuma
falhar. **Sempre recomprima antes de commitar.**

O projeto não tem `sharp` nem `squoosh` (e não vale somar dependência de
build por um asset), então o caminho é o Chromium que o Playwright já
instala:

```js
// reencode.mjs — rode na raiz do projeto: node reencode.mjs entrada.webp saida.webp
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const [, , SOURCE, OUT] = process.argv;
const dataUrl = `data:image/webp;base64,${readFileSync(SOURCE).toString('base64')}`;
const browser = await chromium.launch();
const page = await browser.newPage();
const base64 = await page.evaluate(async (url) => {
  const img = new Image();
  img.src = url;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  canvas.getContext('2d').drawImage(img, 0, 0);
  return canvas.toDataURL('image/webp', 0.9).split(',')[1];
}, dataUrl);
writeFileSync(OUT, Buffer.from(base64, 'base64'));
await browser.close();
```

Curva medida nesta arte: q0,9 → 217 KB · q0,86 → 165 KB · q0,82 → 135 KB
· q0,78 → 113 KB · q0,72 → 94 KB. Ficamos em **0,9**: sobra orçamento e o
degradê do teto continua liso.

---

## 2. Como o app usa a imagem (leia antes de escrever qualquer prompt)

A imagem é desenhada numa **coluna central** com a largura da casca do app
(480 px no máximo), em `background-size: cover` ancorada no **topo**. Há
**dois enquadramentos**:

- **Menu / lobby / chaveamento** — a imagem inteira, com o lustre em cena.
- **Jogo (mesa em cena)** — a imagem **sobe 20% da própria altura**: o
  lustre sai de quadro e o que fica atrás da crupiê são as colunas e as
  arandelas.

Daí o mapa de zonas. As porcentagens são da ALTURA da imagem (1536 px):

| Faixa | Pixels | O que vive ali | Regra |
| --- | --- | --- | --- |
| **0 – 20%** | 0 – 307 | Teto e lustre | Só aparece nos menus. Ornamento aqui é bônus, não pode ser essencial. |
| **20 – 45%** | 307 – 690 | Friso, colunas, arandelas | **É o que fica atrás da crupiê.** As laterais carregam o ornamento; o **centro tem de ser liso e escuro**. |
| **45 – 70%** | 690 – 1075 | Base das colunas, plantas | Laterais visíveis; o centro fica coberto pelo corpo da crupiê. |
| **70 – 100%** | 1075 – 1536 | Piso | Coberto pela mesa (jogo) e pelos botões (menu). Escuro, sem detalhe. |

### A regra que mais importa

**A faixa central vertical (x de 25% a 75%) precisa ficar VAZIA e ESCURA**
— parede lisa, sem quadro, sem móvel, sem mesa, sem luminária baixa. É
onde a crupiê fica de pé e onde o saldo, os títulos e as cartas são
desenhados por cima. Qualquer detalhe ali vira ruído atrás da interface.

O CSS ainda aplica por cima da foto: poças de luz âmbar nos cantos
superiores, um halo descendo no centro, um scrim que escurece o topo e a
base, faíscas de bokeh e poeira dourada. **Não peça esses efeitos no
prompt** — eles já existem em código e dobrá-los satura a imagem.

---

## 3. Paleta oficial (Royal VIP Club)

Cole os hexas no prompt; o gerador respeita bem valores explícitos.

| Uso | Hex |
| --- | --- |
| Preto ameixa (fundo mais escuro) | `#140404` |
| Vinho profundo | `#2a0810` |
| Vinho borgonha (paredes) | `#4c0a15` |
| Vinho claro (realces de madeira) | `#5f1420` |
| Terracota (metal secundário) | `#cb7349` |
| Âmbar (luz principal) | `#f5b76f` |
| Champagne (brilho das luminárias) | `#fcd9a0` |
| Marfim (pontos de luz) | `#fff4e8` |

---

## 4. Regras invioláveis

**Precisa ter**
- Simetria de eixo vertical (a crupiê fica no centro exato).
- Ornamento Art Déco nas laterais: pilastras caneladas, leques, frisos.
- **Plantas** — o pedido desta rodada. Ver a observação abaixo.
- Luz quente vinda de cima e das laterais, com o centro em penumbra.

**Não pode ter**
- Pessoas, mãos, silhuetas humanas.
- Texto, números, logotipos, marcas.
- Mesa, cadeira, balcão ou qualquer móvel na metade de baixo.
- Cartas, fichas, dados, roleta — o jogo desenha os seus.
- Verde saturado, azul ou roxo dominando a cena.
- Composição em diagonal, câmera torta, profundidade de campo forte.

### Sobre as plantas (a armadilha desta arte)

A mesa do jogo é **feltro verde**. Se a folhagem do fundo vier verde e
saturada, ela briga com a mesa e o salão perde a unidade. Peça as plantas
como **massas escuras quase pretas**, iluminadas só por luz quente vinda
de baixo — folha em verde-oliva profundo, quase carvão, com **fio de luz
âmbar** nas bordas. Todos os prompts abaixo já dizem isso; se reescrever
algum, não perca essa frase.

---

## 5. Os cinco prompts

Estão em inglês de propósito: o vocabulário de estilo ("Art Deco",
"fluted pilaster", "sconce", "uplight") é mais preciso e o modelo adere
melhor. Cole o bloco inteiro, **um por vez**.

---

### Prompt 1 — Salão Art Déco com palmeiras (evolução direta do atual)

*Direção: o mesmo salão de hoje, com mais presença botânica e madeira
mais rica. É a opção mais segura — combina com o que já está no ar.*

```text
A vertical 2:3 background illustration of an empty Art Deco casino salon,
seen straight on, perfectly symmetrical along the vertical axis.

Composition: tall fluted mahogany pilasters with carved sunburst fan
motifs frame the left and right thirds. Between them, a wide expanse of
smooth deep burgundy wall panelling. A tiered crystal chandelier with
vertical glass rods hangs at the very top center. Two slender vertical
Art Deco wall sconces made of stacked glass rods glow warmly on the
pilasters, one on each side. Tall potted palms and fan palms stand at the
base of the pilasters on both sides, lit from below by hidden uplights.
Polished dark floor at the bottom, reflecting the warm light softly.

CRITICAL: the central vertical band of the image (from 25% to 75% of the
width) must stay completely EMPTY and DARK — plain unadorned wall in
shadow. No furniture, no table, no picture, no lamp in that band. The
bottom third must be simple and dark with almost no detail.

Palette, strictly: near-black plum #140404, deep wine #2a0810, burgundy
#4c0a15, warm wood highlight #5f1420, terracotta metal #cb7349, amber
light #f5b76f, champagne glow #fcd9a0, ivory highlights #fff4e8.

Foliage must read as very dark, desaturated near-black olive masses with
thin amber rim light — never bright or saturated green.

Lighting: warm amber pools at the top corners and along the sconces, soft
halo under the chandelier, deep shadow in the center and at the bottom.

Style: refined stylized 3D render, cinematic, moody, clean edges, subtle
film grain. No people, no text, no logos, no cards, no chips, no
furniture. Empty room.
```

---

### Prompt 2 — Jardim de inverno do cassino

*Direção: estufa Art Déco — teto de vidro e latão, samambaias e costelas
de adão. Muito mais planta, mantendo o vinho e o âmbar nas paredes.*

```text
A vertical 2:3 background illustration of an empty Art Deco casino winter
garden, seen straight on, perfectly symmetrical along the vertical axis.

Composition: an arched ceiling of glass panes framed by slim brass ribs
occupies the top of the frame, with a night sky barely visible beyond it.
Below it, burgundy lacquered wall panels with fine brass inlay. Large
brass planters flank both sides, holding tall ferns, monstera and palm
fronds that rise along the left and right edges. A single elegant Art
Deco pendant lamp hangs at the top center. Dark polished stone floor at
the bottom.

CRITICAL: the central vertical band of the image (from 25% to 75% of the
width) must stay completely EMPTY and DARK — plain wall and shadow, no
plants crossing it, no furniture, no bench, no table. The bottom third
must be simple and dark with almost no detail.

Palette, strictly: near-black plum #140404, deep wine #2a0810, burgundy
#4c0a15, warm wood highlight #5f1420, terracotta metal #cb7349, amber
light #f5b76f, champagne glow #fcd9a0, ivory highlights #fff4e8.

Foliage must read as very dark, desaturated near-black olive masses with
thin amber rim light — never bright or saturated green.

Lighting: warm amber uplights at the base of the planters, cool faint
moonlight through the glass roof kept very subtle, deep shadow in the
center and at the bottom.

Style: refined stylized 3D render, cinematic, moody, clean edges, subtle
film grain. No people, no text, no logos, no cards, no chips, no
furniture. Empty room.
```

---

### Prompt 3 — Mezanino com samambaias pendentes

*Direção: olhando de baixo para um mezanino; folhagem que cai da
balaustrada emoldura o alto do quadro. Dá verticalidade e profundidade.*

```text
A vertical 2:3 background illustration of an empty Art Deco casino hall
seen from the main floor looking toward a mezzanine, perfectly
symmetrical along the vertical axis.

Composition: a brass balustrade with geometric Art Deco railing crosses
the upper third of the frame. Lush ferns and trailing ivy cascade down
from planters set on the balustrade, framing the top left and top right
corners. Below the mezzanine, deep burgundy wall panels with slim vertical
gold pinstripes, flanked by fluted columns. Two vertical glass-rod sconces
glow on the columns. Dark polished floor at the bottom.

CRITICAL: the central vertical band of the image (from 25% to 75% of the
width) must stay completely EMPTY and DARK — plain wall in shadow. No
hanging plants crossing the center, no furniture, no table, no staircase
in that band. The bottom third must be simple and dark with almost no
detail.

Palette, strictly: near-black plum #140404, deep wine #2a0810, burgundy
#4c0a15, warm wood highlight #5f1420, terracotta metal #cb7349, amber
light #f5b76f, champagne glow #fcd9a0, ivory highlights #fff4e8.

Foliage must read as very dark, desaturated near-black olive masses with
thin amber rim light — never bright or saturated green.

Lighting: warm amber light spilling from under the mezzanine and from the
sconces, deep shadow in the center and at the bottom.

Style: refined stylized 3D render, cinematic, moody, clean edges, subtle
film grain. No people, no text, no logos, no cards, no chips, no
furniture. Empty room.
```

---

### Prompt 4 — Corredor de espelhos e trepadeiras

*Direção: painéis espelhados Art Déco com trepadeiras subindo pelas
laterais; profundidade infinita ao fundo. O mais dramático dos cinco.*

```text
A vertical 2:3 background illustration of an empty Art Deco casino
corridor seen head-on, perfectly symmetrical along the vertical axis,
with a strong sense of depth receding to the center.

Composition: tall mirrored panels framed in brass line both sides,
reflecting warm lights into the distance. Climbing jasmine and small-leaf
vines grow up the frames at the left and right edges. Slim vertical
sconces repeat along the corridor, getting smaller toward the back. A
faceted Art Deco ceiling light at the top center. Dark reflective floor
at the bottom.

CRITICAL: the central vertical band of the image (from 25% to 75% of the
width) must stay completely EMPTY and DARK — the far end of the corridor
must dissolve into plain shadow, with no door, no window, no furniture,
no bright focal point there. The bottom third must be simple and dark
with almost no detail.

Palette, strictly: near-black plum #140404, deep wine #2a0810, burgundy
#4c0a15, warm wood highlight #5f1420, terracotta metal #cb7349, amber
light #f5b76f, champagne glow #fcd9a0, ivory highlights #fff4e8.

Foliage must read as very dark, desaturated near-black olive masses with
thin amber rim light — never bright or saturated green.

Lighting: warm amber sconces repeating down both sides, reflections
muted, deep shadow in the center and at the bottom.

Style: refined stylized 3D render, cinematic, moody, clean edges, subtle
film grain. No people, no text, no logos, no cards, no chips, no
furniture. Empty room.
```

---

### Prompt 5 — Pátio interno noturno do clube

*Direção: terraço coberto — treliças, ciprestes e oliveiras em vasos de
latão, claraboia à noite. O mais "arejado", ainda dentro da paleta.*

```text
A vertical 2:3 background illustration of an empty Art Deco private club
courtyard at night, seen straight on, perfectly symmetrical along the
vertical axis.

Composition: burgundy stucco walls with brass Art Deco lattice screens on
the left and right. Slender cypress trees and small olive trees in tall
brass urns stand against the lattice on both sides. A geometric skylight
frames the top center, night sky beyond it. Warm lanterns hang low near
the lattice on each side. Dark stone floor at the bottom.

CRITICAL: the central vertical band of the image (from 25% to 75% of the
width) must stay completely EMPTY and DARK — plain wall in shadow. No
fountain, no bench, no planter, no lantern in that band. The bottom third
must be simple and dark with almost no detail.

Palette, strictly: near-black plum #140404, deep wine #2a0810, burgundy
#4c0a15, warm wood highlight #5f1420, terracotta metal #cb7349, amber
light #f5b76f, champagne glow #fcd9a0, ivory highlights #fff4e8.

Foliage must read as very dark, desaturated near-black olive masses with
thin amber rim light — never bright or saturated green.

Lighting: warm amber lanterns on both sides, faint cool moonlight from
the skylight kept very subtle, deep shadow in the center and at the
bottom.

Style: refined stylized 3D render, cinematic, moody, clean edges, subtle
film grain. No people, no text, no logos, no cards, no chips, no
furniture. Empty room.
```

---

## 6. Como pedir variações

Depois de escolher a direção, ajuste **uma coisa por vez** e regenere:

- **Mais planta:** troque "tall potted palms and fan palms" por "a dense
  wall of ferns and palms".
- **Mais escuro:** acrescente ao fim "overall exposure one stop darker,
  the center almost black".
- **Menos ornamento:** troque "carved sunburst fan motifs" por "plain
  fluted pilasters".
- **Outra planta:** troque a espécie citada (palms → bird of paradise,
  ferns → philodendron, cypress → bamboo).

Se o gerador insistir em pôr algo no meio, repita a restrição no fim do
prompt com outras palavras: "the middle of the image is empty wall in
shadow — nothing is placed there".

---

## 7. Checklist de aprovação

Antes de substituir o arquivo, confira na imagem gerada:

- [ ] 1024 × 1536, retrato.
- [ ] Simétrica no eixo vertical.
- [ ] Faixa central (25%–75% da largura) vazia e escura, de cima a baixo.
- [ ] Terço inferior escuro e sem detalhe.
- [ ] Nenhuma pessoa, texto, logo, carta, ficha ou móvel.
- [ ] Folhagem escura, sem verde saturado.
- [ ] Paleta em vinho/âmbar — nada de azul ou roxo dominando.
- [ ] Ornamento presente nas laterais, não no centro.

Testes no app, depois de trocar o arquivo:

1. **Home** — o lustre aparece e o logotipo continua legível sobre o fundo.
2. **Confirmação de duelo** — a crupiê recorta bem contra a parede lisa.
3. **Mesa (1v1 e torneio)** — o enquadramento sobe; nada de ornamento
   estranho brotando atrás da crupiê.
4. **Ajustes → Cenário "off"** — a cena cai para a paleta chapada sem
   depender da foto (o fundo não pode ser a única fonte de contraste).
