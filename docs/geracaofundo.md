# 🎨 Geração do fundo de cassino (atrás da dealer)

**Versão:** 1.0 · **Data:** 2026-07-20
**Escopo:** especificação para **gerar** (no GPT Image) uma imagem de
fundo de salão de cassino que fica **atrás da dealer**, na paleta oficial
Royal VIP Club. Este documento **não implementa nada** — é só o briefing
de arte: resolução recomendada e dois prompts prontos para colar.

> Complementa [`scenario.md`](./scenario.md) (§6 cenário, §8.5 textura de
> fundo raster). Hoje o fundo é 100% CSS (`.scene-ambient` em
> [`src/index.css`](../src/index.css)). Esta imagem seria uma **camada
> raster opcional** por trás desse ambiente, para dar profundidade de
> "salão real" sem substituir a lógica de camadas existente.

---

## 1. Contexto técnico que define a medida

Três fatos do projeto determinam a resolução:

| Fato | Onde | Implicação |
|---|---|---|
| O fundo é **full-bleed** (cobre a viewport inteira, atrás da casca). | `.scene-ambient { position: fixed; inset: 0 }` — [`index.css`](../src/index.css) | A imagem precisa cobrir de **9:16 até ~9:21**, sem depender dos 480px da casca. |
| A casca do app trava em **480px** de largura e é centralizada. | `.app-shell { max-width: 480px }` | O **conteúdo essencial** do fundo (o salão, os lustres) deve viver na faixa central; as laterais são sangria que estica. |
| Telas de celular variam de **9:16** (0,56) a **~9:21** (0,43). | `scenario.md` §6.2 | Regra de **zona segura central + sangria vertical**: nada crítico no topo/base extremos. |

Ou seja: **retrato longo, detalhe no centro, topo e base "esticáveis"**.

---

## 2. Resolução recomendada

### 2.1. Alvo final no app (o que o CSS vai usar)

| Propriedade | Valor | Motivo |
|---|---|---|
| Proporção | **9:20 (retrato longo)** | Cobre do iPhone SE (9:16) ao Pro Max (~9:19,5) sem mostrar borda. |
| Dimensão alvo | **1080 × 2400 px** | Mesmo alvo já documentado na `scenario.md` §8.5 — mantém consistência. |
| Zona segura (não cortar) | central **1080 × 1920** (9:16) | Tudo que importa (salão, mesa distante, lustres) vive aqui. |
| Formato de entrega | **AVIF** (fallback WebP) | Peso mínimo; eu converto/otimizo no build. |
| Peso alvo (após otimização) | **≤ 150 KB** | Budget de fundo da `scenario.md` §10.1 / §8.5. |
| Espaço de cor | **sRGB** | Padrão do projeto (`scenario.md` §8.1). |

### 2.2. O que gerar no GPT Image (a pegadinha da ferramenta)

O **GPT Image** exporta em tamanhos fixos. O retrato disponível é
**1024 × 1536 (proporção 2:3)** — **não** existe 9:20 nativo. Então o
fluxo é:

1. **Gere em `1024 × 1536` (retrato, "portrait").** É a maior razão
   vertical que o GPT Image entrega bem.
2. **Peça a composição "esticável":** topo e base com gradiente/atmosfera
   uniforme (sem detalhe crítico nas bordas), detalhe concentrado no
   terço central-superior (onde entram os lustres) e central (onde a mesa
   distante aparece).
3. **Entregue esse PNG/JPG** em `public/assets/scene/` (ou cole no chat).
   Eu faço o **reenquadramento para 1080 × 2400** estendendo o gradiente
   das bordas (as áreas "esticáveis" garantem que isso não deforme nada)
   e otimizo para AVIF ≤ 150 KB.

> **Resumo prático:** gere **1024 × 1536** no GPT Image; o alvo do app é
> **1080 × 2400** e eu faço a ponte entre os dois. Se o seu plano do GPT
> Image oferecer resolução maior no mesmo 2:3, gere na maior — dá mais
> margem para o upscale.

### 2.3. Onde a dealer entra (importante para o prompt)

A dealer é uma **camada separada por cima** (rig SVG, `SvgRigDealer`).
Portanto a imagem de fundo deve deixar o **centro-superior "respirável"**:
sem foco/objeto forte exatamente onde a dealer fica (topo-centro, ~18–40%
da altura, conforme `scenario.md` §6.1). Pense nela como o **cenário do
palco**, não como o retrato — a atriz entra depois.

---

## 3. Paleta oficial a fixar no prompt

Do manual de marca Royal VIP Club (`index.css` `@theme`):

| Papel | Hex | Nome |
|---|---|---|
| Fundo principal | `#140404` | preto ameixa |
| Fundo secundário | `#2A0810` / `#3A0A12` | vinho profundo |
| Cards / vinho | `#4C0A15` | borgonha |
| Dourado principal | `#F5B76F` | âmbar |
| Dourado iluminado | `#FCD9A0` | champagne |
| Secundário | `#CB7349` | terracota |
| Texto / luz marfim | `#FFF4E8` | marfim |

**Direção de cor:** salão em **borgonha/ameixa escuro** com **luz âmbar
dourada** (lustres, poças de luz) e realces **champagne/marfim**. Nada de
azul, verde ou neon frio — a marca é quente (vinho + ouro).

---

## 4. Dois prompts para o GPT Image

Ambos pedem **retrato 2:3 (1024×1536)**, sem pessoas, com a paleta
travada e o topo-centro "respirável" para a dealer. Escolha o que
combinar melhor com o clima que você quer.

### Prompt A — "Salão VIP clássico, profundo e cinematográfico"

```
A luxurious empty VIP casino lounge interior, portrait orientation,
photographed straight-on as an elegant stage backdrop. Deep burgundy and
plum-black walls (#140404, #2A0810, #4C0A15) fading into darkness at the
edges. Warm golden amber lighting (#F5B76F) from ornate crystal
chandeliers glowing at the top of the frame, with soft champagne and
ivory highlights (#FCD9A0, #FFF4E8). Subtle bokeh of distant amber lights,
gentle vignette drawing the eye to the center. A faint velvet-textured
gaming table suggested far in the background center. Rich, moody,
cinematic, high-end, symmetrical composition. IMPORTANT: keep the
upper-center area calm and uncluttered (a dealer figure will be composited
there later) — no people, no text, no logos, no watermarks. Top and bottom
of the image should fade into smooth uniform gradient so it can be
extended vertically. Color palette strictly warm burgundy, plum, amber
gold, champagne and ivory — absolutely no blue, teal, green or cold neon.
```

### Prompt B — "Cassino Art Déco íntimo, com trilho de mogno"

```
An intimate Art Deco casino room seen from the player's seat, portrait
orientation, as a theatrical stage backdrop. Dark plum-black and burgundy
palette (#140404, #2A0810, #4C0A15) with warm amber-gold accents
(#F5B76F, #CB7349) and champagne highlights (#FCD9A0). Geometric Art Deco
paneling and mahogany-toned wood trim catching warm light on the side
columns, a large glowing golden chandelier near the top center, soft
amber light pools spilling from the corners, dust motes floating in the
warm light. Elegant, refined, cozy-luxurious, symmetrical, shallow depth
of field with soft blurred background. IMPORTANT: leave the upper-center
region open and softly lit (a dealer will be added on top afterwards) —
no people, no faces, no text, no signage, no watermarks. Top and bottom
edges should be smooth uniform darkness/gradient for seamless vertical
stretching. Strictly warm colors — burgundy, plum, amber, terracotta,
champagne, ivory. No blue, no green, no cold tones.
```

### Ajustes finos (se o resultado vier "errado")

- **Muito claro / competindo com a dealer:** adicione `darker overall,
  the center-top should be dimmer` e reforce `moody, low-key lighting`.
- **Apareceu gente/rosto:** repita `absolutely no people, no faces,
  no silhouettes` no fim.
- **Cor fria vazou:** reforce `remove any blue or green tint, warm amber
  and burgundy only`.
- **Detalhe demais na borda:** peça `plain smooth gradient at the very
  top and bottom 15% of the image`.

---

## 5. Checklist de entrega (quando você gerar)

1. [ ] Gerado em **1024 × 1536** (retrato 2:3) no GPT Image.
2. [ ] **Sem** pessoas, texto, logo ou marca d'água.
3. [ ] **Centro-superior respirável** (espaço para a dealer).
4. [ ] Paleta **quente** (borgonha + âmbar + champagne), sem azul/verde.
5. [ ] Topo e base "esticáveis" (gradiente uniforme).
6. [ ] Colocar em `public/assets/scene/` **ou** colar no chat.

Com isso eu faço o reenquadramento para **1080 × 2400**, exporto AVIF
≤ 150 KB e integro como camada raster atrás da dealer (opcional sobre o
`.scene-ambient` atual) — **sem tocar na lógica do jogo**, seguindo o
contrato de camadas da [`scenario.md`](./scenario.md) §4.
