# 🎨 Bac Bo Arena — Geração da Dealer Realista (GPT Image)

**Versão:** 1.0 · **Data:** 2026-07-13
**Objetivo:** substituir o dealer vetorial (rig SVG) por uma **dealer realista**, gerada por IA no **GPT Image**, e integrá-la ao jogo mantendo as **10 reações por evento** que já existem. Este documento é o passo a passo completo: o que gerar, como gerar com consistência, o que revisar e como me enviar.

> **Contexto.** O rig SVG (Tier 1) foi um bom placeholder animado, mas não alcança realismo — arte vetorial desenhada à mão nunca vai. Este é o **Tier 2** prometido em [scenario.md](scenario.md) §5.1, agora com um plano concreto de produção de arte.

> **✅ STATUS (2026-07-15): dealer em produção via RIG SVG (modelo pronto).**
> O modelo vetorial em 16 camadas (`public/dealer/*.svg`, todas no mesmo
> canvas de cena 4000×3000) foi montado no `SvgRigDealer` com esqueleto
> real: pivôs de ombros/cotovelos/pescoço medidos por `getBBox`,
> cinemática ombro→cotovelo, respiração, piscar e as 10 reações do jogo.
> Este guia segue útil caso um dia se queira gerar uma dealer por IA;
> o pipeline de alfa (`scripts/process-dealer-assets.py`) e o histórico
> das abordagens (vídeo, cutout raster) ficam como referência.

---

## 1. A técnica (leia antes de gerar qualquer coisa)

Existem duas formas de ter uma personagem realista **animada**:

| Técnica | O que é | Trabalho | Resultado |
|---|---|---|---|
| **Rigging completo (Live2D/Spine)** | Cortar a arte em dezenas de peças (pálpebras, lábios, dedos…) e deformar com esqueleto/malha | Altíssimo (dias de rigging manual por artista) | Movimento contínuo, tipo VTuber |
| **✅ Poses + crossfade (escolhida)** | Gerar **um punhado de poses realistas** (uma por "emoção" do jogo) e trocá-las com transição suave; o **código** adiciona a vida (respiração, tremor do copo, inclinação) | Baixo — você gera ~7 imagens, eu integro | Premium, expressivo, e **leve para mobile** |

**Vamos de poses + crossfade.** Motivos:

1. **Realista de verdade** — cada pose é uma imagem gerada, não um desenho vetorial.
2. **Casa com o que já existe** — nossas 10 reações (`present`, `shake`, `celebrate`, …) mapeiam para ~7 poses; o resto é movimento que eu faço em código.
3. **Leve** — imagens estáticas otimizadas (AVIF/WebP), carregadas sob demanda. Sem runtime de rigging.
4. **Você consegue produzir sozinho** — só precisa do GPT Image e deste guia.

### O que o CÓDIGO adiciona (você não precisa animar nada na imagem)

As imagens são **poses estáticas**. Eu adiciono por cima, via CSS/Framer Motion:

- **Respiração** sutil (idle) — leve escala/subida contínua.
- **Tremor do copo** (shake) — micro-oscilação horizontal na pose do copo.
- **Inclinação/"pop"** (reveal, celebrate) — deslocamento rápido.
- **Crossfade** de 200 ms entre poses (nunca corte seco).
- **Piscar** — opcional, só se você me mandar uma variação com olhos fechados (item 7).

---

## 2. Como isso se conecta ao jogo (já está preparado)

A fachada [`Dealer`](../src/features/bac-bo/scene/dealer/Dealer.tsx) já é plugável. Quando as imagens chegarem, eu adiciono uma implementação `RasterDealer` e passo a usar `variant="raster"` — **nenhuma outra linha do jogo muda**. O rig SVG atual permanece como _fallback_ do modo "Leve" e enquanto as imagens não existem.

```
Dealer (fachada)
├── variant="svg"    → SvgDealer   (atual, vira fallback)
├── variant="raster" → RasterDealer ← NOVO: troca suas imagens por reação
└── variant="none"   → nada
```

O contrato de reações (`DealerReaction`) e o mapa fase→reação ([useDealerReaction](../src/features/bac-bo/scene/dealer/useDealerReaction.ts)) continuam idênticos.

---

## 3. A "Bíblia da Personagem" (bloco fixo — NÃO altere entre imagens)

O maior desafio da IA é **manter a MESMA pessoa** em todas as poses. A regra de ouro: **repita este bloco, palavra por palavra, em todo prompt.** Ele traduz a persona travada em [scenario.md](scenario.md) §0.

**Copie e cole este bloco em inglês (o GPT Image responde melhor em inglês):**

```
CHARACTER (keep identical in every image):
A young adult woman in her early twenties, East Asian features, slim
athletic build, warm light-tan skin. Long straight chestnut-brown hair
with a center part, falling past the shoulders. Striking emerald-green
eyes, refined delicate features, subtle natural makeup, soft confident
friendly expression. She is an elegant professional casino croupier
wearing an off-the-shoulder emerald-green satin gala gown with a
sweetheart neckline, long white opera gloves past the elbow, a thin
delicate gold necklace and small gold stud earrings.
```

> **Tom:** mantenha sempre elegante e profissional. Evite termos que disparam filtros de conteúdo (nada de "sexy", "seductive", "revealing", "tight"). "Off-the-shoulder gown" e "opera gloves" são elegantes e passam tranquilo.

---

## 4. Decisão de estilo — escolha UM e use em tudo

O estilo tem que ser o mesmo nas 7 imagens. Escolha uma linha e cole junto da bíblia:

### 🟢 Opção A — Render 3D estilizado-realista *(recomendado)*
```
STYLE: high-end stylized-realistic 3D character render, semi-realistic,
cinematic AAA mobile-game quality, subsurface-scattering skin, clean
detailed features, ArtStation trending, soft studio lighting.
```
**Por quê:** mais fácil de manter consistente entre poses, perdoa mãos/rosto (o ponto fraco da IA), tem cara de jogo premium e **não** cai no vale da estranheza nem em "isso é uma pessoa real?".

### 🔵 Opção B — Fotorrealista
```
STYLE: photorealistic, ultra-detailed cinematic studio portrait, 85mm
lens, shallow depth of field, soft warm key light, high dynamic range.
```
**Por quê:** máximo realismo. Porém é mais difícil manter o mesmo rosto entre poses e a IA erra mais mãos/dedos.

> **Recomendação:** comece pela **Opção A**. Se não gostar, troque a linha STYLE por B e regenere a Master.

---

## 5. Iluminação e enquadramento (para casar com a mesa Emerald)

Nossa cena tem fundo escuro, foco de luz âmbar vindo de cima e feltro verde. Para a dealer encaixar, **cole este bloco também**:

```
FRAMING & LIGHT (identical in every image):
Waist-up, centered, front-facing, camera at chest height, subject
looking slightly down toward a table in front of her. Dark neutral
background. Warm golden key light from upper center, subtle emerald rim
light. Head and shoulders MUST stay in exactly the same position, size
and scale in every image — only the arms, hands and facial expression
change between poses. No background props, no table visible.
```

A instrução "**head and shoulders in the same position/scale**" é o que faz o crossfade entre poses ficar perfeito (a personagem não "pula" ao trocar de reação).

### Guia visual do enquadramento

```
        ┌───────────────────────┐
        │        (topo)         │  ← ~10% de margem acima do cabelo
        │      cabeça+cabelo    │  ← MESMA posição/escala em todas
        │   ombros nus / colar  │
        │   vestido + luvas     │  ← braços/mãos MUDAM por pose
        │      (cintura)        │  ← corta na cintura
        └───────────────────────┘
              1024 × 1536 (2:3)
```

---

## 6. Passo a passo de produção

### Passo 1 — Gerar a MASTER (retrato de referência)
O rosto/identidade nasce aqui. Só avance quando você **amar** esta imagem.

1. No ChatGPT (GPT Image / "criar imagem"), cole o **prompt Master** (§8.1).
2. Gere 3–4 variações. Escolha a de melhor **rosto, olhos verdes e cabelo**.
3. Peça ajustes em linguagem natural se precisar ("deixe o rosto um pouco mais jovem", "olhos mais verdes", "cabelo mais liso").
4. **Salve como `master.png`.** Ela é a referência de identidade de todas as próximas.

**Critérios de aprovação da Master:**
- [ ] Traços asiáticos, ~20 anos, expressão amigável e confiante
- [ ] Olhos claramente **verdes**
- [ ] Cabelo castanho liso, risca ao meio, além dos ombros
- [ ] Vestido esmeralda ombros nus + **luvas brancas de ópera** + colar dourado fino
- [ ] Enquadramento cintura para cima, de frente, fundo escuro neutro

### Passo 2 — Gerar cada POSE usando a Master como referência
Para cada uma das 7 poses (§8.2):

1. **Envie a `master.png`** no chat como imagem de referência.
2. Escreva: *"Same woman, same face, same hair, same outfit, same framing and lighting as the reference. New pose:"* + o prompt da pose.
3. Gere, confira a **consistência do rosto** (é a mesma pessoa?), regenere se destoar.
4. Repita para as 7 poses.

> **Dica de ouro:** gere todas as poses **na mesma sessão de chat**, logo após a Master. O modelo mantém melhor a identidade assim.

### Passo 3 — Fundo (para eu recortar limpo)
Escolha **um** método:

- **Transparente (ideal):** se você usa a **API** do GPT Image, peça `background: "transparent"` e formato PNG (§8.4). No ChatGPT a transparência é instável.
- **Chroma sólido (mais confiável no ChatGPT):** adicione ao prompt: *"isolated on a solid flat magenta #FF00FF background, no shadow cast on the background."* Eu removo o magenta no recorte. **Use magenta**, não verde (o verde conflita com o vestido e os olhos).

### Passo 4 — Nomear e me enviar (§9).

---

## 7. As 7 poses ↔ 10 reações

| Arquivo | Reações que cobre | Pose |
|---|---|---|
| `neutral.png` | `idle` | Calma, mãos levemente juntas na cintura, sorriso fechado gentil, olhando para a mesa. |
| `present.png` | `present` | Uma ou ambas as mãos abertas, palma para cima, "apresentando" a mesa; sorriso acolhedor. |
| `shake.png` | `anticipate`, `shake` | Segurando um **copo de dados** (dice shaker) elegante erguido perto do ombro com as duas mãos enluvadas; olhar concentrado. |
| `reveal.png` | `reveal` | Inclinada levemente à frente, uma mão enluvada estendida sobre a mesa (acabou de soltar os dados), olhos arregalados, lábios entreabertos. |
| `celebrate.png` | `celebrate` | Alegre, mãos erguidas ou aplaudindo, sorriso aberto, olhos brilhando — comemorando. |
| `console.png` | `console`, `apologize` | Expressão empática e calorosa, uma mão enluvada no peito, leve inclinação de cabeça. |
| `shrug.png` | `shrug` | Encolher de ombros brincalhão, palmas para cima perto dos ombros, sobrancelhas erguidas, meio sorriso. |
| `greet.png` *(opcional)* | `greet` | Aceno amigável com uma das mãos. Se não gerar, reutilizo `present.png`. |
| `blink.png` *(opcional)* | piscar (idle) | Idêntica à `neutral.png`, porém **de olhos fechados**. Só se quiser a personagem piscando. |

> Sem `greet.png`/`blink.png` o jogo funciona 100% — são refinos.

---

## 8. Prompts prontos (copiar e colar)

> Em cada prompt de pose, **primeiro envie a `master.png`** e comece com a frase de consistência. Sempre inclua os blocos CHARACTER + STYLE + FRAMING (ou referencie "same as reference").

### 8.1. Prompt MASTER

```
Create a portrait of a video-game casino dealer character.

CHARACTER (keep identical in every image):
A young adult woman in her early twenties, East Asian features, slim
athletic build, warm light-tan skin. Long straight chestnut-brown hair
with a center part, falling past the shoulders. Striking emerald-green
eyes, refined delicate features, subtle natural makeup, soft confident
friendly expression. She is an elegant professional casino croupier
wearing an off-the-shoulder emerald-green satin gala gown with a
sweetheart neckline, long white opera gloves past the elbow, a thin
delicate gold necklace and small gold stud earrings.

STYLE: high-end stylized-realistic 3D character render, semi-realistic,
cinematic AAA mobile-game quality, subsurface-scattering skin, clean
detailed features, ArtStation trending, soft studio lighting.

FRAMING & LIGHT: waist-up, centered, front-facing, camera at chest
height, calm neutral pose with hands lightly resting near the waist,
looking slightly down. Dark neutral background. Warm golden key light
from upper center, subtle emerald rim light. No table, no props.

Portrait orientation, 2:3.
```

### 8.2. Prompts das POSES
*(Envie a `master.png` antes de cada um. Prefixo sugerido: "Same woman, same face, same hair, same emerald gown and white opera gloves, same framing, scale and lighting as the reference image. Keep head and shoulders in the exact same position and size. New pose only:")*

**present.png**
```
New pose: she opens both gloved hands in a warm welcoming gesture, palms
up, presenting the table in front of her, gentle inviting smile, eyes
looking toward the viewer.
```

**shake.png**
```
New pose: she holds an elegant dice shaker cup raised near her right
shoulder with both white-gloved hands, focused playful anticipation,
lips lightly closed, leaning very slightly forward.
```

**reveal.png**
```
New pose: she leans slightly forward and extends one gloved hand forward
over the table as if she just released the dice, eyes wide with
excitement, lips parted in a small "oh".
```

**celebrate.png**
```
New pose: joyful celebration, both gloved hands raised near her head
clapping, bright open happy smile, eyes bright and cheerful.
```

**console.png**
```
New pose: warm sympathetic expression, one gloved hand resting gently on
her chest, head tilted slightly, a soft consoling "better luck next
time" look.
```

**shrug.png**
```
New pose: playful shrug, both gloved palms turned up near her shoulders,
eyebrows raised, small amused smile — a friendly "it's a tie" gesture.
```

**greet.png** *(opcional)*
```
New pose: friendly greeting, she raises her right gloved hand in a warm
wave, bright welcoming smile.
```

**blink.png** *(opcional)*
```
Exactly the same as the neutral reference in every detail, but with both
eyes gently closed (blinking). Do not change anything else.
```

### 8.3. Fundo (adicione ao final de cada prompt, se usar chroma)
```
Isolated on a solid flat magenta (#FF00FF) background, evenly lit, no
shadow cast on the background, subject fully separated from the edges.
```

### 8.4. Parâmetros da API (se for usar `gpt-image-1` em vez do ChatGPT)
```
model:       gpt-image-1
size:        1024x1536      (retrato)
quality:     high
background:  transparent    (dispensa o chroma; exporta PNG com alpha)
```
Para consistência via API, use o endpoint de **edição/variação** passando `master.png` como imagem de entrada e o texto da pose.

---

## 9. Especificações técnicas e como me enviar

### Especificações
| Item | Valor |
|---|---|
| Dimensão | **1024 × 1536 px** (retrato 2:3) |
| Formato de envio | **PNG** (transparente ou com fundo magenta) |
| Cor | sRGB |
| Enquadramento | cintura para cima, cabeça/ombros na MESMA posição em todas |
| Peso (você me envia) | não se preocupe — eu otimizo. Eu entrego em **AVIF/WebP ≤ ~90 KB** cada e reduzido ao tamanho de tela |

### Como enviar
Escolha um:
- **Repositório:** crie a pasta `public/assets/dealer/` e coloque os arquivos com **exatamente estes nomes**: `neutral.png`, `present.png`, `shake.png`, `reveal.png`, `celebrate.png`, `console.png`, `shrug.png` (+ opcionais `greet.png`, `blink.png`). Eu leio direto.
- **Chat:** cole as imagens aqui, dizendo qual é qual.

Envie também a `master.png` (me ajuda a ajustar recortes/tons).

---

## 10. Checklist antes de me enviar

- [ ] É visivelmente **a mesma pessoa** nas 7 imagens (rosto, cabelo, tom de pele)
- [ ] Cabeça e ombros na **mesma posição e escala** em todas (não "pulam")
- [ ] Mesma iluminação/cor em todas (nada de uma clara e outra escura)
- [ ] Mãos aceitáveis (sem dedos extras/derretidos) — as luvas ajudam a esconder
- [ ] Fundo limpo: transparente **ou** magenta chapado sem sombra
- [ ] Vestido esmeralda + luvas brancas + colar dourado consistentes
- [ ] Enquadramento cintura para cima, de frente

---

## 11. O que eu faço quando receber

1. Recorto o fundo (se magenta), normalizo tom/escala, exporto **AVIF + WebP** otimizados e redimensionados.
2. Crio `RasterDealer` atrás da fachada `Dealer` (adiciono `variant: 'raster'` ao contrato).
3. Mapeio as 7 imagens para as 10 reações e adiciono as micro-animações de código (respiração, tremor do copo, inclinação, crossfade, piscar se houver `blink.png`).
4. Ajusto o `dealer-slot` (tamanho/posição) para a nova arte e a sombra sob a mesa.
5. Mantenho o **rig SVG como fallback** do modo "Leve" e de `prefers-reduced-motion`.
6. Rodo lint + typecheck + testes + E2E + screenshots e te mostro o resultado.

---

## 12. FAQ / erros comuns

**"O rosto muda entre as poses."** → Sempre envie a `master.png` como referência e gere tudo na mesma sessão. Se destoar, regenere aquela pose citando "match the face of the reference exactly".

**"As mãos ficaram estranhas."** → Comum na IA. Gere 3–4 vezes e escolha a melhor; prefira poses com mãos parciais/perto do corpo; as luvas brancas simplificam. Em último caso, me mande mesmo assim — dá para recortar/ajustar mãos ruins nas bordas.

**"O GPT Image recusou o prompt."** → Remova adjetivos que possam soar sensuais; mantenha "elegant professional croupier". Nunca é necessário nada além de elegante.

**"A transparência veio suja (borda/xadrez)."** → Use o fundo **magenta chapado** e me deixe recortar; é mais confiável que pedir transparência no ChatGPT.

**"Posso mudar a personagem (roupa/cor)?"** → Pode. Ajuste o bloco CHARACTER e **regenere a Master primeiro**, depois todas as poses a partir dela. Nunca mude a descrição no meio do conjunto.

---

**Próximo passo:** gere a **Master** (§8.1), me mande para aprovarmos a identidade juntos, e só então produza as 7 poses. Assim garantimos consistência antes de você investir nas 7 gerações.
