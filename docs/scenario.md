# 🎬 Bac Bo Arena — Cenário, Mesa & Dealer

**Versão:** 1.0 · **Data:** 2026-07-13
**Escopo:** documentação de implementação do ambiente visual (fundo/cenário), da mesa de jogo e do **dealer animado com reações por evento**. Complementa a [especificação-mãe](BacBo_Arena_Master_Specification.md) e o [README](../README.md).

> **TL;DR da estratégia.** O **cenário e a mesa** serão construídos **100% em CSS + SVG** — zero imagens, zero download, resolução infinita, pesa quilobytes. O **dealer** entra por um **contrato de componente plugável** (igual ao `createGameEngine`): começamos com um **rig SVG que eu construo sozinho, agora**, e deixamos a porta aberta para trocar por um personagem premium em **Rive** (arte ilustrada) sem tocar no código do jogo. Nada disso _exige_ um gerador de imagens. Ele só entra se você quiser o dealer com aparência de ilustração realista — e mesmo aí, a integração já estará pronta.

---

## 0. Direção de arte definida (2026-07-13)

Decisões travadas para a implementação:

- **Tema da mesa:** **Emerald** (feltro verde `#14532d` + trilho de mogno, spotlight âmbar). É o tema padrão da §6.6.
- **Persona do dealer:** dealer **feminina, jovem (~20 anos)**, **magra, corpo atlético**, **vestido de gala com ombros nus**, **luvas brancas de ópera**, **cabelo castanho**, **olhos verdes**, **traços asiáticos**.

### 0.1. Implicação técnica importante desta persona

O nível de detalhe descrito (feição humana realista, atraente, com traços específicos) **excede o que o rig vetorial do Tier 1 representa com fidelidade**. Isso divide a entrega em dois caminhos honestos:

| Caminho | O que a persona vira | Preciso de arte gerada? |
|---|---|---|
| **Tier 1 — rig SVG (eu, sozinho)** | Uma **interpretação estilizada** da persona: mesma silhueta e paleta (vestido de gala escuro, ombros nus, luvas brancas, cabelo castanho, olhos verdes, feição delicada), porém em estética **vetorial elegante** — não fotorrealista. Fica bonita e coerente, no registro "ilustração _flat_ premium". | ❌ Não |
| **Tier 2 — Rive ilustrado (upgrade)** | A persona **exatamente como descrita**, com rosto detalhado, expressões ricas, cabelo/tecido com física. É aqui que a descrição realista se concretiza 1:1. | ✅ Sim — arte gerada (IA/ilustrador) em camadas, riggada no Rive |

**Recomendação:** entrego a interpretação vetorial (Tier 1) como base sólida e já animada com as 10 reações; se a fidelidade realista da persona for essencial ao produto, subimos para o Tier 2 com a arte gerada — a integração já estará pronta esperando o `.riv`. As dimensões/camadas para essa arte estão na §8.3.

---

## 1. Respondendo direto às suas perguntas

| Sua pergunta | Resposta curta |
|---|---|
| **Você consegue fazer tudo isso sozinho?** | **Cenário e mesa: sim, 100%, sem nenhum asset externo.** **Dealer: sim, num estilo vetorial/mascote animado** (rig SVG com membros separados, animado por código). O que eu **não** consigo é _gerar do zero uma ilustração/foto realista_ do dealer — isso precisa de arte (IA ou ilustrador). |
| **Vou precisar de um gerador de imagens por IA?** | **Só se você quiser o dealer premium ilustrado/realista.** Para o MVP profissional e leve, **não precisa de nada** — eu codo o dealer vetorial. |
| **"Montar em camadas e animar os membros"** | Exatamente a técnica que vamos usar (cutout / skeletal rig). Descrita em detalhe na §7. Funciona tanto para o meu rig SVG quanto para a versão Rive. |
| **Qual a alternativa mais otimizada para mobile?** | **Cenário CSS/SVG + dealer em Rive** (se ilustrado) ou **rig SVG** (se vetorial). Rive é o runtime mais leve e GPU-acelerado do mercado para personagem interativo (§5). Ranking completo na §5.2. |
| **Proporções das imagens e como te mandar** | Tabelas exatas de dimensão, formato e nomenclatura na §6 e §8. **Você só precisa gerar imagem se escolher o dealer ilustrado.** |

---

## 2. Diagnóstico do estado atual

Hoje o jogo é **funcionalmente completo**, mas visualmente "flutua no vazio":

- O `body` usa um fundo sólido `--color-arena-950` (`#05080f`).
- A [`DiceArena`](../src/features/bac-bo/components/DiceArena.tsx) desenha dados vermelhos (topo) → placar (centro) → dados azuis (base), empilhados verticalmente, sem mesa nem ambiente.
- Não há personagem. O oponente é só um avatar emoji.
- A casca [`.app-shell`](../src/index.css) tem `max-width: 480px` centralizado; **o fundo precisa cobrir a viewport inteira, atrás da casca.**

O que este documento adiciona: **três camadas visuais novas** (ambiente → mesa → dealer) por trás do jogo, sem alterar a lógica nem a máquina de estados.

---

## 3. Filosofia técnica: por que camadas CSS/SVG em vez de imagens pesadas

O requisito "leve, roda em qualquer aparelho" é uma **decisão de arquitetura**, não um detalhe. Princípios:

1. **Vetor antes de raster.** Gradientes, feltro, vinheta e trilho da mesa são *matemática*, não pixels. Um fundo CSS custa **~0 KB** e é nítido em qualquer densidade de tela (DPR 1× a 4×). Um JPG/PNG equivalente custaria 150–400 KB e ficaria borrado ou serrilhado em alguma tela.
2. **Anime só `transform` e `opacity`.** São as duas únicas propriedades que o navegador anima na GPU sem recalcular layout (60 fps). Todo o cenário e o dealer respeitam isso.
3. **O peso mora no personagem, não no fundo.** Por isso separamos: o fundo nunca precisa de asset; o dealer é o único candidato a arte externa — e escolhemos o formato mais leve para ele.
4. **Degradação graciosa.** Aparelho fraco / `prefers-reduced-motion` / bateria baixa → cai para um "poster" estático do dealer e um fundo simplificado. O jogo nunca trava por causa de enfeite.

---

## 4. Arquitetura visual em camadas (z-index stack)

A tela vira uma pilha de camadas independentes. Cada uma é um componente isolado; nenhuma conhece a lógica do jogo — todas reagem a `phase`/`outcome` do store.

```
┌─────────────────────────────────────────────┐  z-index
│  HUD flutuante (saldo, voltar, botões)        │   40   (já existe no fluxo)
│  ┌─────────────────────────────────────────┐ │
│  │  Overlays de fase (countdown, resultado) │ │   30
│  │  ┌───────────────────────────────────┐   │ │
│  │  │  JOGO: dados 3D + placar          │   │ │   30
│  │  └───────────────────────────────────┘   │ │
│  │            ▲ dados rolam aqui             │ │
│  │  ┌───────────────────────────────────┐   │ │
│  │  │  DEALER (rig SVG ou Rive)         │   │ │   20  ◄── NOVO
│  │  └───────────────────────────────────┘   │ │
│  │  ┌───────────────────────────────────┐   │ │
│  │  │  MESA: feltro + trilho + luz      │   │ │   10  ◄── NOVO
│  │  └───────────────────────────────────┘   │ │
│  └─────────────────────────────────────────┘ │
│  AMBIENTE: gradiente + vinheta + partículas   │    0  ◄── NOVO (fixed, full-viewport)
└─────────────────────────────────────────────┘   -10
        Sheets/Modais (Tutorial, Histórico)          50   (já existe)
        DevTools                                      40   (já existe)
```

**Regras de camada:**

- **Ambiente** (`z-0`, `position: fixed; inset: 0`): cobre a viewport inteira, **atrás** da `.app-shell`. É o único elemento que "vaza" para além dos 480px da casca.
- **Mesa** e **Dealer** vivem **dentro** da área de jogo (a região do `<main>`), acima do ambiente e abaixo do conteúdo.
- **Jogo** (dados/placar) e **Overlays** continuam exatamente onde estão hoje — só ganham um pano de fundo.
- Os limites já usados (`Sheet` = `z-50`, `DevTools` = `z-40`) permanecem no topo. Por isso todas as camadas novas ficam **≤ 30**.

---

## 5. A grande decisão: como fazer o DEALER

Aqui está o cerne da sua dúvida. Existem 3 "níveis" de dealer, do mais leve/autônomo ao mais rico/dependente de arte. **Todos plugam no mesmo contrato de código** (§7), então dá para começar no Tier 1 e subir depois sem retrabalho.

### 5.1. Os três tiers

#### 🟢 Tier 1 — Rig SVG vetorial *(eu faço sozinho, agora, 0 assets)*
Um dealer estilizado desenhado em SVG, com **partes do corpo separadas** (cabeça, tronco, dois braços com antebraço/mão, olhos, boca) agrupadas e animadas por Framer Motion (que já está no projeto). Estilo "mascote premium" — limpo, elegante, com identidade, **não** fotorrealista.

- **Peso:** ~5–15 KB (o próprio SVG inline). **Zero download.**
- **Dependência nova:** nenhuma (usa Framer Motion já instalado).
- **Aparência:** vetorial/cartoon sofisticado (pense em ilustração _flat_ com sombras suaves).
- **Quem faz:** **eu, inteiramente.** Você não gera nada.

#### 🔵 Tier 2 — Rive *(premium ilustrado; precisa de arte + rigging)*
O dealer é ilustrado (por IA ou designer), **riggado** no editor Rive (esqueleto + malha + máquina de estados) e exportado como um único arquivo `.riv`. O React só dispara os _inputs_ ("win", "shake", etc.) e o Rive resolve a animação na GPU.

- **Peso:** `.riv` normalmente **30–120 KB** + runtime `@rive-app/react-canvas` (~200 KB gzip, _lazy-loaded_).
- **Dependência nova:** `@rive-app/react-canvas`.
- **Aparência:** ilustração rica, expressões faciais, cabelo/roupa com física. Nível "app de cassino premium".
- **Quem faz:** você (ou eu) gera a arte em camadas → riggagem no Rive → eu integro. **A máquina de estados do Rive espelha 1:1 as nossas fases** (§7.3), o que torna a integração quase trivial.

#### 🟡 Tier 3 — Lottie / Sprite sheet *(alternativas)*
- **Lottie:** animações vetoriais pré-renderizadas (After Effects → JSON). Ótimo para _clipes_ fixos (comemorar, chacoalhar), mas **não é interativo/state-machine** como o Rive e o JSON incha rápido em personagens complexos.
- **Sprite sheet:** quadros pré-desenhados tocados com `steps()`. Simples, mas **pesado** (muitos PNGs) e rígido. Só recomendo para efeitos pontuais, não para o dealer inteiro.

### 5.2. Comparativo (ranking de otimização mobile)

| Critério | 🟢 Rig SVG (T1) | 🔵 Rive (T2) | 🟡 Lottie (T3) | Sprite (T3) |
|---|---|---|---|---|
| Peso do personagem | **~10 KB** | 30–120 KB | 80–500 KB | 300 KB–2 MB |
| Runtime extra | **0** | ~200 KB (lazy) | ~250 KB | 0 |
| Interativo / state machine | Manual (bom) | **Nativo (excelente)** | Não | Não |
| Nitidez em qualquer DPR | **Vetor ∞** | **Vetor ∞** | Vetor ∞ | Raster (fixo) |
| GPU / fps | Bom | **Ótimo** | Bom | Médio |
| Expressividade facial | Média | **Alta** | Alta | Alta |
| Precisa de gerador de imagem | **Não** | Sim | Sim | Sim |
| Eu consigo entregar sozinho | **Sim, já** | Integração sim; arte não | Integração sim; arte não | Integração sim; arte não |

### 5.3. 🎯 Recomendação

**Estratégia em duas ondas:**

1. **Onda 1 (agora):** Cenário/mesa em CSS/SVG **+ dealer Tier 1 (rig SVG)**. Entrego 100% sozinho, o jogo ganha alma imediatamente, continua leve, e validamos as **reações por evento** (§9) no personagem real.
2. **Onda 2 (quando/se quiser subir o nível):** trocamos só o "miolo" do `<Dealer>` por **Rive (Tier 2)**. Como o contrato (§7) e o mapa de reações (§9) já existem, é plugar o `.riv` e mapear os _inputs_. **Nenhuma linha do jogo muda.**

Isso espelha exatamente o padrão que já adotamos no motor (`GameEngine` local hoje, API amanhã). Consistência arquitetural.

---

## 6. Especificação do CENÁRIO e da MESA (Tier CSS/SVG — construível já)

Composição inspirada no enquadramento de Bac Bo ao vivo: **dealer ao fundo/topo-centro, feltro curvo em semicírculo na base, área de rolagem no meio.**

### 6.1. Enquadramento (portrait)

```
  ┌───────── viewport (full-bleed) ─────────┐
  │  ▒▒▒ ambiente: gradiente radial + luz ▒▒ │  ← topo: mais escuro (teto)
  │                                          │
  │            ( DEALER aqui )               │  ← ~18–40% da altura
  │        ╭──────────────────────╮          │
  │       ╱   trilho / borda mesa   ╲         │  ← rail: madeira/veludo escuro
  │      │  ░░░░░ FELTRO VERDE ░░░░░ │        │
  │      │   dados vermelhos (opp)   │        │  ← área de rolagem
  │      │   ┌─ placar ─┐            │        │  ← ~40–72% da altura
  │      │   dados azuis (você)      │        │
  │       ╲   logo/monograma feltro ╱         │
  │        ╰──────────────────────╯          │
  │  HUD (saldo, botões) — safe area bottom   │  ← ~72–100%
  └──────────────────────────────────────────┘
```

### 6.2. Cobertura de tela (a razão das "proporções")

O desafio real: telas de celular variam de **9:16** (0.5625) a **~9:21** (0.43). A regra é **_safe zone_ central + sangria (bleed) que estica**:

- **Zona segura (nunca cortada):** proporção **9:16**. Todo elemento essencial (dealer, feltro, logo) vive aqui.
- **Sangria vertical:** o gradiente de ambiente e o trilho se estendem para cima/baixo para preencher telas mais longas, sem mostrar "bordas".
- Em CSS isso é automático: `background: radial-gradient(...) fixed; inset: 0;` cobre qualquer altura. **Nenhuma imagem precisa ser cortada** — é a grande vantagem de fazer em CSS.

### 6.3. Tokens de cor (estendendo o `@theme` atual)

Adicionar ao [`src/index.css`](../src/index.css):

```css
@theme {
  /* ...tokens existentes... */

  /* Cenário */
  --color-felt-900: #0c3a22;   /* feltro na sombra */
  --color-felt-700: #14532d;   /* feltro base (já existe como --color-felt) */
  --color-felt-500: #1c6b3c;   /* feltro sob a luz */
  --color-rail-900: #3a2417;   /* madeira do trilho (sombra) */
  --color-rail-700: #5a3a24;   /* madeira do trilho (luz) */
  --color-spot:     #fde68a;   /* cor do foco de luz (spotlight) */
}
```

### 6.4. Camada AMBIENTE (esboço pronto para uso)

```css
/* Fundo global — cobre a viewport inteira, atrás da casca */
.scene-ambient {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background:
    /* halo de luz descendo sobre o dealer */
    radial-gradient(120% 60% at 50% 12%, rgba(253, 230, 138, 0.10), transparent 55%),
    /* profundidade da sala */
    radial-gradient(140% 100% at 50% 40%, #0b1020 0%, #05080f 70%),
    #05080f;
}

/* Vinheta para focar o olhar no centro */
.scene-ambient::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(120% 90% at 50% 45%, transparent 55%, rgba(0, 0, 0, 0.55));
}
```

### 6.5. Camada MESA (feltro + trilho)

```css
/* Feltro: elipse curva na base, como visto de cima em ângulo */
.scene-felt {
  position: absolute;
  left: 50%;
  bottom: 0;
  translate: -50% 0;
  width: min(140%, 640px);
  aspect-ratio: 1 / 1;
  border-radius: 50% 50% 0 0 / 60% 60% 0 0;
  background:
    radial-gradient(80% 60% at 50% 30%, var(--color-felt-500), var(--color-felt-700) 60%, var(--color-felt-900));
  box-shadow: inset 0 8px 40px rgba(0, 0, 0, 0.5);
}

/* Trilho de madeira/veludo em volta */
.scene-rail {
  /* mesma curva, um pouco maior, atrás do feltro */
  border: 14px solid transparent;
  border-image: linear-gradient(var(--color-rail-700), var(--color-rail-900)) 1;
}
```

> Detalhes finos (monograma "BB" no feltro, textura de veludo, brilho especular) são um SVG leve sobreposto ou uma máscara de ruído SVG inline (`<feTurbulence>`), tudo vetorial. Isso é polimento da Fase D (§10).

### 6.6. Modos de mesa por tema

Duas paletas prontas via classe no container (`.scene--emerald` / `.scene--noir`), trocáveis nos Ajustes:

| Tema | Feltro | Trilho | Vibe |
|---|---|---|---|
| **Emerald** (padrão) | verde `#14532d` | mogno | cassino clássico |
| **Noir** | grafite/azul `#111827` | níquel escuro | premium moderno |

---

## 7. O contrato de código (a peça que torna tudo plugável)

Espelha o padrão `createGameEngine`. Nova pasta: `src/features/bac-bo/scene/`.

### 7.1. Estrutura de arquivos proposta

```
src/features/bac-bo/scene/
├── TableScene.tsx          # Compositor: ambiente + mesa + dealer (camadas)
├── ambient/AmbientLayer.tsx
├── table/TableLayer.tsx
├── dealer/
│   ├── Dealer.tsx          # Fachada: escolhe a implementação por prop/env
│   ├── DealerController.ts # Tipos: DealerReaction, DealerVariant
│   ├── SvgDealer.tsx       # 🟢 Tier 1 — rig SVG (eu construo)
│   ├── RiveDealer.tsx      # 🔵 Tier 2 — carrega .riv (lazy) [futuro]
│   ├── useDealerReaction.ts# Mapeia phase/outcome → reação
│   └── rig/                # partes SVG do Tier 1 (Head, Arm, Hand, Face…)
└── scene.timings.ts        # durações do dealer (estende TIMINGS)
```

### 7.2. Tipos centrais

```ts
// dealer/DealerController.ts
export type DealerReaction =
  | 'idle'        // respiração/parado
  | 'greet'       // acena ao encontrar oponente
  | 'present'     // "façam suas apostas" (gesto para a mesa)
  | 'anticipate'  // ergue as mãos na contagem
  | 'shake'       // chacoalha o copo de dados
  | 'reveal'      // revela / inclina-se
  | 'celebrate'   // vitória do jogador
  | 'console'     // derrota do jogador (empático)
  | 'shrug'       // empate ("push")
  | 'apologize';  // erro/falha

export type DealerVariant = 'svg' | 'rive' | 'none';

export interface DealerProps {
  reaction: DealerReaction;
  variant?: DealerVariant;   // default: 'svg'
  reducedMotion?: boolean;
  quality?: 'high' | 'low';  // low = poster estático
}
```

### 7.3. Fachada que troca T1↔T2 sem mexer no jogo

```tsx
// dealer/Dealer.tsx
import { lazy, Suspense } from 'react';
import { SvgDealer } from './SvgDealer';
import type { DealerProps } from './DealerController';

const RiveDealer = lazy(() => import('./RiveDealer')); // só baixa se usado

export function Dealer({ variant = 'svg', ...props }: DealerProps) {
  if (variant === 'none' || props.quality === 'low') {
    return <SvgDealer {...props} quality="low" />; // poster estático leve
  }
  if (variant === 'rive') {
    return (
      <Suspense fallback={<SvgDealer {...props} quality="low" />}>
        <RiveDealer {...props} />
      </Suspense>
    );
  }
  return <SvgDealer {...props} />;
}
```

> **Este é o ponto-chave da sua pergunta.** Hoje `variant="svg"` (eu entrego). Amanhã, se você gerar a arte e riggar no Rive, é só passar `variant="rive"` e soltar o `.riv` em `public/assets/dealer/`. O `GameScreen`, o store e as regras **não sabem que o dealer mudou.**

### 7.4. Hook que liga o dealer à máquina de estados

```ts
// dealer/useDealerReaction.ts
import type { GamePhase } from '../../store/gameStore';
import type { RoundOutcome } from '../../engine/types';
import type { DealerReaction } from './DealerController';

const PHASE_TO_REACTION: Record<GamePhase, DealerReaction> = {
  idle: 'idle',
  search: 'idle',
  found: 'greet',
  confirm: 'present',
  negotiate: 'present',
  countdown: 'anticipate',
  rolling: 'shake',
  reveal: 'reveal',
  completed: 'idle',   // sobrescrito pelo outcome abaixo
  error: 'apologize',
};

const OUTCOME_TO_REACTION: Record<RoundOutcome, DealerReaction> = {
  win: 'celebrate',
  lose: 'console',
  tie: 'shrug',
};

export function resolveDealerReaction(
  phase: GamePhase,
  outcome: RoundOutcome | null,
): DealerReaction {
  if (phase === 'completed' && outcome) return OUTCOME_TO_REACTION[outcome];
  return PHASE_TO_REACTION[phase];
}
```

### 7.5. Integração no `GameScreen` (mínima e não-invasiva)

Envolver o conteúdo de jogo com `<TableScene>`. Só a área de jogo (`rolling`/`reveal`/`completed`) e a `confirm`/`negotiate` mostram o dealer; matchmaking e erro usam o dealer em modo neutro.

```tsx
// dentro de GameScreen, envolvendo o bloco da arena:
<TableScene reaction={resolveDealerReaction(phase, result?.outcome ?? null)}>
  <DiceArena phase={phase} match={match} result={result} />
  {phase === 'completed' && result && <ResultBanner result={result} />}
</TableScene>
```

---

## 8. Proporções de imagem e como você deve me enviar (SE optar por arte gerada)

> ⚠️ **Lembrete:** nada disto é necessário para o Tier 1. Isto vale **apenas** se você quiser o dealer ilustrado (Tier 2) ou uma textura de fundo raster opcional.

### 8.1. Regras gerais de qualquer asset

- **Espaço de cor:** sRGB.
- **Formato de entrega para mim:** **PNG com transparência** (para camadas do personagem) ou **WebP/AVIF** (para texturas de fundo). Eu converto/otimizo para o build.
- **Densidade:** projete em **3× do tamanho lógico** (celulares chegam a DPR 3). Ex.: um dealer que ocupa 320 px lógicos de largura → arte a **960 px**.
- **Como entregar:** coloque os arquivos em `public/assets/` seguindo a nomenclatura abaixo (você arrasta pro repositório e eu leio), **ou** cole as imagens aqui no chat. Um **JSON de manifesto** (§8.4) acompanha, descrevendo pivôs e camadas.

### 8.2. Dealer ILUSTRADO — opção A: peça única (mais simples)

Uma única ilustração do dealer, tronco para cima, olhando para a câmera, fundo transparente.

| Propriedade | Valor |
|---|---|
| Proporção | **2:3 (retrato)** |
| Dimensão | **1024 × 1536 px** |
| Fundo | Transparente (alpha) |
| Enquadramento | Dealer centralizado, do quadril/cintura para cima; ~15% de margem no topo |
| Peso alvo (após otimização) | **≤ 200 KB** (AVIF) |
| Limitação | Sem animação de membros — só posso fazer "respiração", balanço e trocas de expressão via _crossfade_ entre 2–3 variações |

Para expressões, envie **3 versões** do rosto na mesma pose: `dealer_neutral`, `dealer_happy`, `dealer_sad`.

### 8.3. Dealer ILUSTRADO — opção B: camadas para rig (recomendado se for Tier 2)

Cada parte do corpo em seu **próprio PNG transparente**, todas no **mesmo tamanho de canvas** e **alinhadas à mesma origem** (para eu empilhar sem recalcular posição).

| Camada (arquivo) | Conteúdo | Observação |
|---|---|---|
| `dealer/torso.png` | Tronco + roupa | Âncora do rig |
| `dealer/head.png` | Cabeça + cabelo (boca/olhos neutros) | Pivô no pescoço |
| `dealer/eyes_open.png` / `eyes_closed.png` | Olhos | Para piscar |
| `dealer/mouth_neutral.png` / `mouth_smile.png` / `mouth_open.png` | Bocas | Troca por expressão |
| `dealer/arm_L_upper.png` / `arm_L_fore.png` / `hand_L.png` | Braço esquerdo (3 partes) | Pivôs no ombro/cotovelo/punho |
| `dealer/arm_R_upper.png` / `arm_R_fore.png` / `hand_R.png` | Braço direito (3 partes) | idem |
| `dealer/cup.png` | Copo de dados (opcional) | Preso à mão direita |

| Propriedade | Valor |
|---|---|
| Canvas de cada camada | **1024 × 1024 px** (todas iguais) |
| Proporção do personagem montado | ~2:3 dentro do canvas |
| Fundo | Transparente |
| Peso alvo (todas as camadas juntas) | **≤ 350 KB** |

> **Alternativa profissional:** em vez de me mandar PNGs soltos, você (ou um designer) monta essas camadas direto no **editor do Rive** e me entrega **um único `dealer.riv`**. É o caminho mais limpo — eu só ligo os _inputs_. Nesse caso, ignore as dimensões de PNG; a artboard do Rive fica em **~800 × 1000 px** vetorial.

### 8.4. Manifesto de rig (acompanha a opção B)

```json
// public/assets/dealer/manifest.json
{
  "canvas": { "w": 1024, "h": 1024 },
  "anchor": { "x": 512, "y": 720 },
  "pivots": {
    "head":        { "x": 512, "y": 360 },
    "arm_L_upper": { "x": 410, "y": 470 },
    "arm_L_fore":  { "x": 360, "y": 620 },
    "arm_R_upper": { "x": 614, "y": 470 },
    "arm_R_fore":  { "x": 664, "y": 620 }
  }
}
```

Com os pivôs, eu monto o esqueleto e animo cada reação (§9) por código — a técnica de "animar os membros" que você mencionou.

### 8.5. Textura de fundo raster (opcional, só se quiser foto de sala)

Se em vez do fundo CSS você quiser uma **foto/ilustração de sala de cassino**:

| Propriedade | Valor |
|---|---|
| Proporção | **9:20 (retrato longo)** — cobre até iPhone Pro Max |
| Dimensão | **1080 × 2400 px** |
| Zona segura (não cortar) | central **1080 × 1920** (9:16) |
| Formato | **AVIF** (fallback WebP) |
| Peso alvo | **≤ 150 KB** |
| Regras | Foco/detalhe no centro; topo e base "estagáveis" (gradiente uniforme) para esticar sem emenda |

> Recomendo **não** ir por aqui no MVP: o fundo CSS (§6) é mais leve, nítido e temável. A foto só se houver uma direção de arte específica.

### 8.6. Onde a IA/Canva entra

Para **gerar** a arte do dealer (Tier 2) ou a textura (§8.5), você pode usar qualquer gerador (Midjourney, DAL·E, Firefly, etc.) com os _prompts_ que eu preparo, ou o **conector do Canva** — que, no momento, está **desconectado nesta sessão e precisaria ser autorizado nas configurações de conectores do claude.ai** para eu poder acioná-lo. Enquanto isso, o fluxo é: você gera → coloca em `public/assets/` → eu integro/otimizo.

---

## 9. Reações do dealer por evento — a máquina de estados de animação

O coração do "dealer vivo". Cada reação é **sincronizada com os `TIMINGS` que já existem** (mantemos uma única fonte de verdade em `scene.timings.ts`, que reexporta de [`animations/timings.ts`](../src/features/bac-bo/animations/timings.ts)).

### 9.1. Mapa evento → reação → animação

| Fase / Evento | Reação | O que o dealer faz | Duração | Loop | Sinal sonoro atual |
|---|---|---|---|---|---|
| `idle` (Home) | `idle` | Respiração sutil, pisca ~1×/5 s | ∞ | sim | — |
| `search` | `idle` | Espera, olha o relógio ocasionalmente | ∞ | sim | — |
| `found` | `greet` | Acena / meneia a cabeça | dentro de **1400 ms** (`foundSplashMs`) | não | `found` |
| `confirm` | `present` | Apresenta a mesa com as duas mãos | entra 400 ms → idle | idle | — |
| `negotiate` | `present` | Apresenta a mesa enquanto os jogadores negociam a aposta | entra 400 ms → idle | idle | `stake` a cada proposta |
| `countdown` (3→2→1) | `anticipate` | Ergue o copo, corpo tenso; um "batida" por tick | 3 × **900 ms** (`countdownTickMs`) | pulsa | `countdownTick` ×3, `countdownGo` |
| `rolling` | `shake` | Chacoalha o copo vigorosamente | **2000 ms** (`rollingMs`) | sim | `roll` |
| `reveal` | `reveal` | "Solta" os dados, inclina-se para conferir | **1600 ms** (`revealMs`) | não | `reveal` |
| `completed` + `win` | `celebrate` | Sorri, aplaude / joia, empurra fichas ao jogador | até `playAgain` | idle-feliz | `win` |
| `completed` + `lose` | `console` | Leve reverência, gesto "quase lá / na próxima" | até `playAgain` | idle-neutro | `lose` |
| `completed` + `tie` | `shrug` | Encolhe os ombros, devolve as fichas ("push") | até `playAgain` | idle | `tie` |
| `error` | `apologize` | Mão no peito, gesto de desculpas | até dismiss | idle | — |

### 9.2. Anatomia de uma animação (exemplo: `shake`, Tier 1 SVG)

```tsx
// Braço direito segurando o copo, durante rolling
<motion.g
  style={{ originX: pivots.arm_R_upper.x, originY: pivots.arm_R_upper.y }}
  animate={{ rotate: [-6, 8, -6], y: [0, -4, 0] }}
  transition={{ duration: 0.28, repeat: Infinity, ease: 'easeInOut' }}
>
  <ArmRight />
  <Cup />
</motion.g>
```

Cada reação é um conjunto desses `motion.g` por membro, com pivô vindo do manifesto. No Rive (Tier 2), isso vira um _state_ na _State Machine_ disparado por um _trigger_ de mesmo nome (`shake`, `win`…).

### 9.3. Regras de transição (blend)

- **Prioridade:** reações de resultado (`celebrate`/`console`/`shrug`) > ação (`shake`/`reveal`) > apresentação (`present`/`greet`) > `idle`.
- **Blend-in/out:** 150–250 ms de _crossfade_ entre reações (nunca "corte seco").
- **Retorno ao idle:** toda reação não-loop volta para `idle` ao terminar.
- **Interrupção:** trocar de fase interrompe a reação atual com blend (a máquina de estados do jogo é a dona da verdade).

### 9.4. Durações do dealer (novo arquivo, alinhado ao existente)

```ts
// scene/scene.timings.ts
import { TIMINGS } from '../animations/timings';

export const DEALER_TIMINGS = {
  blendMs: 200,
  blinkEveryMs: 5000,
  greetMs: TIMINGS.foundSplashMs,     // 1400 — casa com o FoundSplash
  anticipateBeatMs: TIMINGS.countdownTickMs, // 900
  shakeMs: TIMINGS.rollingMs,         // 2000 — casa com o giro dos dados
  revealMs: TIMINGS.revealMs,         // 1600
} as const;
```

---

## 10. Orçamento de performance e degradação

### 10.1. Budget (metas duras)

| Item | Meta |
|---|---|
| Peso total adicionado (Tier 1) | **< 20 KB** (tudo CSS/SVG inline) |
| Peso total adicionado (Tier 2) | **< 150 KB** de assets + runtime Rive _lazy_ |
| FPS durante `shake`/`reveal` | **≥ 55 fps** em aparelho de entrada (~Moto G) |
| Propriedades animadas | **apenas** `transform` / `opacity` |
| Impacto no _first paint_ | 0 (cenário CSS renderiza junto; dealer Rive é _lazy_) |

### 10.2. Tiers de qualidade adaptativos

Detectar automaticamente e ajustar (novo campo em `settings` ou heurística):

```ts
// alto: rig completo + partículas + spotlight animado
// baixo: dealer "poster" estático + fundo simplificado, sem partículas
const quality =
  navigator.hardwareConcurrency <= 4 || prefersReducedMotion ? 'low' : 'high';
```

- **`prefers-reduced-motion`:** dealer congela em pose neutra; reações viram _crossfades_ suaves de 1 quadro; partículas desligadas (já respeitamos isso no [`ResultBanner`](../src/features/bac-bo/components/ResultBanner.tsx) e [`Die3D`](../src/features/bac-bo/components/Die3D.tsx)).
- **Bateria/economia:** opção nos Ajustes "Efeitos do cenário: Alto/Baixo/Off".
- **Fallback de erro:** se o Rive falhar ao carregar, cai para o `SvgDealer` (já previsto no `Suspense` da §7.3).

### 10.3. Acessibilidade

- O dealer é **decorativo**: `aria-hidden="true"`. As reações **não** substituem os anúncios `aria-live` de resultado já existentes.
- Contraste do texto (placar, resultado) precisa ser reverificado **sobre o feltro** — pode exigir uma faixa/sombra atrás do placar. Item da Fase D.

---

## 11. Plano de entrega em fases

| Fase | Entrega | Depende de | Quem | Status |
|---|---|---|---|---|
| **A — Cenário** | `AmbientLayer` + `TableLayer` (feltro, trilho, vinheta, spotlight) em CSS/SVG; integração no `GameScreen`; tema Emerald | nada | **eu, sozinho** | ✅ **Entregue** (2026-07-13) |
| **B — Dealer T1** | `SvgDealer` (rig completo) + `useDealerReaction` + todas as 10 reações (§9) sincronizadas aos `TIMINGS` | Fase A | **eu, sozinho** | ✅ **Entregue** (2026-07-13) |
| **C — Polimento** | Monograma no feltro, textura de veludo (ruído SVG), sombra dos dados no feltro, partículas de ambiente, setting "Cenário e dealer" (Alto/Leve/Desligado) nos Ajustes | Fase B | **eu, sozinho** | ✅ **Entregue** (2026-07-13) |
| **D — Dealer realista (vídeo)** | `VideoDealer`: clipe em loop emoldurado como retrato "ao vivo" | arte em vídeo | substituído | ❌ Removido (2026-07-15) |
| **E — Dealer em camadas raster (cutout)** | `CutoutDealer`: PNGs recortados com pipeline de alfa (`scripts/process-dealer-assets.py`, originais em `art/dealer/`) | PNGs em camadas | substituído pela Fase F | ❌ Removido (2026-07-15) |
| **F — Dealer rig SVG (modelo pronto)** | `SvgRigDealer`: modelo vetorial em 16 camadas (`public/dealer/*.svg`, canvas de cena compartilhado 4000×3000) com esqueleto real — pivôs medidos de ombros, cotovelos, pescoço, olhos e boca; cinemática ombro→cotovelo rígida; respiração, piscar, balanço de cabeça e as 10 reações; enquadrada da cintura para cima atrás da mesa (viewBox), grande ao apostar e compacta na rodada | SVGs em camadas (fornecidos) | você forneceu o modelo → **eu montei o rig** | ✅ **Entregue** (2026-07-15) |

**Notas de implementação (Fases A–C):**

- Código em `src/features/bac-bo/scene/` seguindo a estrutura da §7.1 (com `sceneQuality.ts` adicional para a heurística da §10.2).
- O tema **Noir** ficou fora do escopo entregue (decisão da §0: Emerald travado); os tokens em `@theme` permitem adicioná-lo depois.
- Técnica de rig do `SvgDealer`: cada articulação é um `motion.g` com pivô na origem local + retângulo âncora invisível que estabiliza o transform-origin — a versão em código do "montar em camadas e animar os membros" da §5.1.
- O setting `scenery` usa `.default('high')` no schema Zod, preservando estados persistidos anteriores sem migração.
- Testes: 21 novos casos (mapa de reações, qualidade de cena, rig por reação, TableScene, Ajustes) + asserções E2E de `data-reaction` (`present` no stake, `celebrate` na vitória). Suíte total: 91 unit + 5 E2E, verdes.

---

## 12. Checklist — o que eu preciso de você

### Para começar HOJE (Fases A + B): **nada.** ✅ Direção de arte já definida (§0)

1. ~~**Tema da mesa**~~ → **Emerald** (travado).
2. ~~**Persona do dealer**~~ → **dealer feminina, jovem, atlética, vestido de gala de ombros nus, luvas brancas de ópera, cabelo castanho, olhos verdes, traços asiáticos** (travado). Tier 1 = interpretação vetorial dessa persona; Tier 2 = versão ilustrada fiel.

### Se você quiser o dealer ILUSTRADO depois (Fase D):
3. Arte em **peça única** (§8.2 · 1024×1536) **ou** em **camadas/Rive** (§8.3 · canvas 1024×1024 + manifesto), fundo transparente, colocada em `public/assets/dealer/`.
4. Se ilustração estática: as **3 expressões** (neutro/feliz/triste).
5. (Opcional) autorizar o **conector do Canva** nas configurações do claude.ai, se quiser que eu ajude a gerar a arte por lá.

---

## 13. Resumo executivo

- **Cenário + mesa:** CSS/SVG puro, ~0 KB, nítido em toda tela, temável. **Eu entrego sozinho.**
- **Dealer:** contrato plugável. **Tier 1 (rig SVG) eu entrego sozinho, já, com as 10 reações sincronizadas aos eventos do jogo.** **Tier 2 (Rive ilustrado)** é um _upgrade_ opcional que só precisa de arte e não muda o código do jogo.
- **Você só precisa de gerador de imagem se quiser o dealer premium ilustrado** — e mesmo assim a integração já estará pronta esperando o `.riv`.
- **Otimização mobile:** vetor em tudo, animar só `transform`/`opacity`, Rive _lazy_, tiers de qualidade adaptativos, `prefers-reduced-motion` respeitado.

**Próximo passo sugerido:** você me diz **tema da mesa** + **persona do dealer**, e eu começo pela Fase A (cenário) e Fase B (dealer vetorial) — tudo sem depender de nenhum asset externo.
