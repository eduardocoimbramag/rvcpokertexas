# 🃏 Blackjack Arena

Jogo de blackjack 1v1 mobile-first em React + TypeScript com **toda a lógica rodando localmente**: duelo contra um oponente simulado numa mesa de feltro verde, créditos virtuais, cartas 3D animadas, áudio sintetizado e persistência versionada. Sem backend — mas com a arquitetura pronta para recebê-lo.

> Base histórica do projeto (era um Bac Bo de dados): [docs/BacBo_Arena_Master_Specification.md](docs/BacBo_Arena_Master_Specification.md)

## Regras do jogo

- **Duelo direto de 21**, em rodada única: você contra o adversário, **sem casa para bater**. Baralho único de 52 cartas.
- **A vez é simultânea**: os dois têm **20 segundos** para escolher (PEDIR CARTA ou PARAR) sem saber o que o outro vai fazer. Fechada a vez, os **dois lances são revelados juntos**. Quem não escolher a tempo tem a mão **parada** pela mesa (parar nunca estoura). Quem fecha a mão sai das vezes seguintes e o outro segue sozinho.
- **Regra de POV**: cada duelista vê a mão do outro **menos a última carta dela** — a informação chega em conta-gotas e o resto só abre no showdown.
- Vence quem chegar mais perto de 21: estourou, perdeu; os dois estourados empatam; **blackjack natural** (21 em duas cartas) ganha de um 21 montado em três.
- O natural **não fecha a mão de ninguém**: quem o recebe joga a vez como todo mundo (pode parar, pode pedir carta e jogá-lo fora, pode propor a dobra). Uma mão que saísse do rodízio na distribuição denunciaria o 21 antes de qualquer carta virar. A brasa que contorna as cartas do blackjack é **só da sua tela** — o rival não a vê.
- Vitória paga **90% da aposta do adversário** (10% é a comissão da casa) — inclusive a selada com blackjack natural: o duelo é um pote fechado de dois lances iguais e ninguém leva mais do que o adversário pôs na mesa.
- **Empate devolve** os créditos; derrota perde a aposta.
- **Dobra da aposta**: antes de travar a sua escolha, você pode propor dobrar o valor que está na mesa (o relógio da vez pausa enquanto o pedido está no ar). O rival aceita (✓) ou recusa (✗); aceita, a diferença sai do saldo na hora, o novo valor vale para o payout e o botão fica em brasa até o fim da mão. Uma dobra por mão.

## Como rodar

```bash
npm install
npm run dev          # desenvolvimento (DevTools habilitado via .env.development)
```

| Script              | O que faz                                        |
| ------------------- | ------------------------------------------------ |
| `npm run dev`       | Servidor de desenvolvimento Vite                 |
| `npm run build`     | Typecheck + build de produção                    |
| `npm run preview`   | Serve o build de produção                        |
| `npm run test`      | Testes unitários e de componentes (Vitest + RTL) |
| `npm run test:e2e`  | Testes E2E mobile (Playwright)                   |
| `npm run lint`      | ESLint                                           |
| `npm run format`    | Prettier                                         |
| `npm run typecheck` | `tsc -b`                                         |
| `npm run check`     | lint + typecheck + testes                        |

### Variáveis de ambiente

| Variável               | Default | Descrição                                                   |
| ---------------------- | ------- | ----------------------------------------------------------- |
| `VITE_INITIAL_BALANCE` | `1000`  | Saldo inicial de créditos virtuais                          |
| `VITE_ENABLE_DEVTOOLS` | `false` | Painel oculto: forçar resultados, add créditos, limpar tudo |

## Arquitetura

Estrutura por domínio (`features/bac-bo`), com regras do jogo em **funções puras** e a UI proibida de calcular resultados:

```
src/
├── shared/                  # Utilitários agnósticos de domínio
│   ├── config/env.ts        # Env vars validadas com Zod
│   ├── lib/random.ts        # Rng injetável: CryptoRng (produção) / SeededRng (testes)
│   └── components/          # Button, Sheet (bottom sheet acessível)
└── features/bac-bo/
    ├── engine/              # ★ Toda a lógica do jogo vive aqui
    │   ├── types.ts         # Tipos de domínio validados com Zod
    │   ├── rules.ts         # Regras puras: rolagem, resultado, payout
    │   ├── credits.ts       # Regras puras de créditos/stakes
    │   ├── GameEngine.ts    # Contrato assíncrono da engine
    │   ├── LocalBacBoGameEngine.ts  # Implementação local (matchmaking simulado)
    │   └── createGameEngine.ts      # Factory — troca futura por ApiBacBoGameEngine
    ├── store/gameStore.ts   # Zustand + máquina de estados explícita
    ├── services/
    │   ├── GameStorageService.ts    # localStorage versionado com migrações
    │   ├── AudioManager.ts          # Howler.js central (música + SFX)
    │   └── sfxSynth.ts              # SFX sintetizados em runtime (zero assets binários)
    ├── scene/               # Cenário: mesa Emerald + dealer animada (docs/scenario.md)
    │   ├── TableScene.tsx           # Compositor: mesa + dealer atrás do jogo
    │   ├── ambient/ · table/        # Ambiente global e feltro/trilho em CSS/SVG
    │   └── dealer/                  # Rig SVG com 10 reações por evento (plugável p/ Rive)
    ├── animations/          # Durações canônicas e rotações do dado 3D
    ├── components/          # Home, Arena, Die3D, ScoreBoard, NegotiationPanel, …
    └── tests/               # Unitários + componentes
e2e/                         # Playwright (viewport Pixel 7)
```

### Máquina de estados

```
idle → stake → search → found → confirm → countdown → rolling → reveal → completed
         ↑        └──────────────┘ (cancelar/recusar)                        │
         └───────────────────────────────────────────────────────────────────┘
```

Transições fora do mapa (`PHASE_TRANSITIONS`) são **ignoradas** — a UI não consegue pular etapas. Falhas na engine levam a `error` com devolução do stake.

Na fase `confirm` vale a **confirmação dupla**: o countdown só nasce quando jogador **e** oponente confirmam (o oponente simulado confirma sozinho em 0,9–2,4 s, antes ou depois do jogador). Recusar só é possível antes de dar a própria palavra. Durante `rolling`/`reveal` a cena corta para a **câmera vertical** sobre a mesa; em `completed` a câmera volta e a dealer reage ao resultado.

### Fluxo de créditos

1. O stake é **debitado quando ambos confirmam** o duelo (início do countdown).
2. A engine resolve a rodada e devolve `payout` e `netChange` prontos.
3. O payout é **creditado na conclusão** (vitória 2×, empate 1×, derrota 0).

### Decisões de implementação (lacunas da especificação)

| Lacuna                  | Decisão                                                                   |
| ----------------------- | ------------------------------------------------------------------------- |
| Payout de vitória       | 1:1, padrão da mesa Player/Banker do Bac Bo real                          |
| Matchmaking sem backend | Delay artificial (1,2–2,6 s) + perfis de oponentes locais; cancelável     |
| Assets de áudio         | WAV PCM sintetizado em runtime e entregue ao Howler como data URI         |
| Saldo zerado            | Botão de recarga restaura o saldo inicial (créditos são virtuais)         |
| RNG                     | Interface `Rng` injetável — `CryptoRng` em produção, `SeededRng` em teste |

## Integração futura com backend

A UI e o store dependem apenas da interface `GameEngine` (métodos assíncronos, erros tipados, dados validados com Zod). Para plugar um backend:

1. Implementar `ApiBacBoGameEngine implements GameEngine`.
2. Retorná-la em `createGameEngine({ mode: 'api' })`.

Nenhum componente muda.

## Qualidade

- **70 testes** unitários/componentes (regras, créditos, engine, storage, store com timers falsos, UI).
- **5 testes E2E** mobile determinísticos (vitória, derrota, empate, persistência pós-reload, cancelamento) usando o DevTools para forçar resultados.
- TypeScript `strict` + `noUncheckedIndexedAccess`, ESLint (`typescript-eslint` strict), Prettier.

## Acessibilidade e mobile

- Projetado primeiro para 360×640; casca central com `max-width` e safe areas (notch).
- Alvos de toque ≥ 44 px, `aria-live` para resultados, `role`/`aria-label` nos dados e placar.
- `prefers-reduced-motion` respeitado nas animações dos dados e partículas.
- Vibração opcional (configurável) nos momentos-chave.
