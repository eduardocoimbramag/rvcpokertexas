# Migração de paleta — Bac Bo Arena → paleta da plataforma

> **Status: documentação de planejamento. Nenhuma mudança de código foi feita.**
>
> Estilo-alvo da plataforma: **Dark Luxury + Royal Gaming + Gamificação VIP**.

## 1. Paleta-alvo (fornecida pela plataforma)

| Função             | Cor               | HEX       |
| ------------------ | ----------------- | --------- |
| Fundo principal    | Preto ameixa      | `#09070D` |
| Fundo secundário   | Roxo muito escuro | `#15101C` |
| Cards e campos     | Grafite arroxeado | `#201927` |
| Dourado principal  | Ouro envelhecido  | `#C6A15B` |
| Dourado iluminado  | Champagne         | `#E5CA86` |
| Texto principal    | Marfim            | `#F4F0E8` |
| Texto secundário   | Cinza lavanda     | `#A69EAC` |
| Bordas             | Roxo acinzentado  | `#3B3043` |

## 2. Onde as cores vivem hoje

O jogo tem **duas famílias de cor** com papéis distintos. Entender essa
separação é a decisão mais importante da migração:

### 2.1 Cores de INTERFACE (migram direto para a paleta)

Tokens declarados no `@theme` de `src/index.css` (Tailwind v4
theme-first) e consumidos via classes/vars em toda a UI:

| Token atual          | Valor atual | Papel                                  | Substituto proposto |
| -------------------- | ----------- | -------------------------------------- | ------------------- |
| `--color-arena-950`  | `#05080f`   | Fundo principal do app                 | `#09070D`           |
| `--color-arena-900`  | `#0b1020`   | Fundo secundário / chips de texto      | `#15101C`           |
| `--color-arena-800`  | `#121a30`   | Cards, pills, botões escuros           | `#201927`           |
| `--color-arena-700`  | `#1c2745`   | Cards elevados / disabled              | `#2A2133` (derivado)|
| `--color-arena-line` | `#283457`   | Bordas de cards e sheets               | `#3B3043`           |
| `--color-gold`       | `#fbbf24`   | Dourado de destaque (CTA, VS, seleção) | `#C6A15B`           |
| Texto principal      | `#f8fafc` (body) | Texto claro sobre fundo escuro    | `#F4F0E8`           |
| Textos `slate-*`     | vários      | Texto secundário sobre fundo escuro    | `#A69EAC`           |

### 2.2 Cores de CENA/JOGO (decisão de design — ver §4)

| Token / literal                      | Valor atual         | Papel                            |
| ------------------------------------ | ------------------- | -------------------------------- |
| `--color-table-500/700/900`          | `#c9b795 → #7e6b47` | Couro cáqui da mesa              |
| `--color-rail-700/900`               | `#5a3a24 / #3a2417` | Mogno do trilho                  |
| `--color-player` / `--color-player-soft`   | `#3b82f6 / #93c5fd` | Azul do jogador (semântica Bac Bo) |
| `--color-opponent` / `--color-opponent-soft` | `#ef4444 / #fca5a5` | Vermelho do oponente (semântica) |
| Tintas sobre couro (literais)        | `#33261a`, `#1e3a8a`, `#7f1d1d`, `#8a5200` etc. | Textos gravados na mesa |

## 3. Inventário de literais fora do @theme

Estes pontos têm cor **hardcoded** e precisam ser tocados um a um (ou
promovidos a tokens antes da troca — recomendado):

- **`.btn--primary`** (`index.css`): gradiente ouro `#ffe08a → #fbbf24 → #e8a70c → #c88a05`, aro `#a87608`, halo `rgba(200,138,5,…)`, texto `#2a1703`. → Recriar com a dupla `#E5CA86` (topo/luz) → `#C6A15B` (corpo) → tom escurecido derivado (~`#8f7340`) na base; texto `#1d1509`.
- **`.btn--secondary` / `.stake-chip`**: gradientes navy `#2a3657 → #161f38` / `#202b4a → #101830`, aros `rgba(148,163,184,…)`. → Gradientes grafite arroxeado `#2A2133 → #201927`, aro `#3B3043` (hover: clarear o aro com `#A69EAC`).
- **`.stake-chip--selected`**: fundo âmbar `#4a3a12 → #241a06`, aro `#d99a06`, glow `rgba(251,191,36,…)`, texto `#ffd970`. → Derivar de `#C6A15B` (aro), glow `rgba(198,161,91,0.35)`, texto `#E5CA86`.
- **`.vs-mark`**: gradiente `#ffe08a → #fbbf24 → #c88a05` + contorno `rgba(58,36,4,…)`. → `#E5CA86 → #C6A15B → #8f7340`.
- **`.scene-ambient`**: salão vinho `#241019 → #0d060c`, base `#07040a`, luzes quentes `rgba(255,196,110,…)`. → Salão ameixa: `#1b1122 → #0c0812`, base `#09070D`; bokeh champagne `rgba(229,202,134,…)`.
- **Placas (duelo e placar)**: gradiente navy `#1b2440 → #0d1326`. → `#2A2133 → #15101C`, borda mantendo a cor do lado (azul/vermelho).
- **`.shaker` / `.shaker__well`**: filetes dourados `#dcbf78 / #7d5f28` e tons de couro. → Filetes com `#E5CA86 / #8f7340`; couro segue a decisão do §4.
- **`--color-spot`** (`#fde68a`) e partículas/halos da cena → `#E5CA86`.
- **`public/favicon.svg`** e a logo `rvclogo.png` — conferir se seguem a identidade da plataforma.

## 4. A decisão de design: a mesa

A mesa de couro cáqui é hoje um **material físico** (couro + mogno +
latão), não uma cor de interface. Duas rotas:

### Rota A — recomendada: "mesa como objeto, UI como plataforma"

Manter a mesa em material claro (couro) e migrar TODO o resto (fundos,
cards, botões, dourados, textos) para a paleta. Justificativa:

- O contraste couro-claro × ambiente-ameixa reforça o clima de mesa
  iluminada em salão escuro (exatamente o "Dark Luxury").
- Preserva todo o trabalho de contraste das tintas gravadas
  (`.text-engraved` + tintas escuras) que dependem de fundo claro.
- Menor risco: nenhuma tela precisa de re-tuning de legibilidade.

Ajuste fino opcional: esfriar levemente o couro (ex.: dessaturar
`--color-table-*` ~8% na direção do cinza) para "sentar" melhor no
ambiente roxo.

### Rota B — mesa em veludo roxo (imersão total na paleta)

Trocar `--color-table-*` por um veludo derivado de `#201927`
(ex.: `#2E2438 → #201927 → #140F1A`) e o trilho para um mogno
arroxeado. Consequências que ENTRAM no escopo se essa rota for
escolhida:

- Todas as tintas escuras sobre a mesa invertem para claras
  (`#F4F0E8` / `#A69EAC` / `#E5CA86`) — placar sob as colunas, VITÓRIA/
  DERROTA/EMPATE, textos de busca/erro, rating do duelo.
- `.text-engraved` inverte (sombra clara → sombra escura).
- A marca d'água RVC muda de `multiply` para `screen`/`soft-light` com
  opacidade recalibrada (sobre fundo escuro, multiply desaparece).
- Filetes dourados dos poços ganham mais contraste (bom), mas o bisel
  interno precisa de re-tuning das sombras.

## 5. Plano de migração sugerido (quando for executar)

1. **Promover literais a tokens**: criar no `@theme` os tokens que
   faltam (`--color-gold-bright: #E5CA86`, `--color-gold-deep`,
   `--color-card`, `--color-border`, `--color-text`, `--color-text-dim`)
   e substituir os literais dos gradientes por `var(...)`. Sem mudança
   visual nesta etapa — apenas desacoplamento.
2. **Trocar os valores dos tokens** pela paleta (tabela do §2.1).
   Uma mudança pequena e reversível, já que tudo referencia tokens.
3. **Re-derivar os gradientes** (botões, fichas, VS, ambiente) a partir
   dos novos dourados/roxos — regra prática: luz = `#E5CA86`, corpo =
   `#C6A15B`, sombra = corpo escurecido ~30%.
4. **Decidir e aplicar a rota da mesa** (§4).
5. **QA visual**: rodar o script de screenshots multi-viewport
   (stake, duelo, confirmação, countdown, rolling, reveal, completed em
   ≥4 resoluções) e comparar antes/depois.
6. **QA de contraste**: textos sobre os novos fundos precisam de razão
   ≥ 4.5:1 (WCAG AA) — atenção especial a `#A69EAC` sobre `#201927`
   (4.6:1, no limite: usar só para texto de apoio, nunca para valores
   de aposta/saldo).

## 6. O que NÃO deve mudar

- **Azul do jogador / vermelho do oponente**: são a linguagem universal
  do Bac Bo (Player/Banker) e código de cor dos dados físicos — mantêm
  a identidade de jogo dentro de qualquer paleta. No máximo, ajustar o
  tom para harmonizar (ex.: azul levemente arroxeado).
- **Semântica de feedback**: vitória dourada, derrota avermelhada,
  empate neutro.
- **A lógica de contraste por superfície**: texto claro sobre fundos
  escuros, tinta escura gravada sobre superfícies claras (couro).
