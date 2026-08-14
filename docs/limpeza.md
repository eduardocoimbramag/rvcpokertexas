# Auditoria de limpeza — o que sobrou dos jogos anteriores

O projeto nasceu como **Bac Bo** (jogo de dados), virou **duelo de 21
(blackjack)** e hoje é **Texas Hold'em**. Cada troca deixou camadas para trás.
Este documento levanta o que ainda está no repositório, quanto pesa, **o que é
seguro remover** e em que ordem — com o método de medição descrito para que
qualquer número aqui possa ser reconferido.

> **Estado: AUDITORIA CONCLUÍDA — Fases 0 a 7 EXECUTADAS.** A Fase 0 foi
> decidida (**o blackjack não volta**), o jogo inteiro saiu do repositório e a
> pasta virou `src/features/poker/`. Não há fase pendente; o que restou de
> trabalho identificado está em §10.1 e §10.2, e nenhum dos dois estava no plano
> original.
>
> **O que a remoção deu, medido:** 30 arquivos apagados (2 criados:
> `engine/deck.ts` e o teste dele), **~12.000 linhas** a menos, `index.css` de 10.011 → 8.275 linhas, bundle JS de 720 → 652 kB
> (gzip 218 → 197 kB) e CSS de 138 → 116 kB (gzip 27,7 → 23,4 kB). A suíte caiu
> de 806 para 586 casos e **deixou de ter testes pulados** — os 5 que havia eram
> do modo desligado. `npm run check`, `npm run build` e as suítes e2e
> `cash-table` e `game-flow` passam.
>
> ⚠️ **As seções §1 a §6 abaixo são o LEVANTAMENTO ORIGINAL, preservado como
> estava.** Vários números e afirmações delas foram desmentidos na execução — as
> correções estão marcadas na fase em que apareceram (§7). Cinco erros valem
> destaque: `--color-arena-700` e `podium.ts` **não podiam sair**; `rankValue`
> **não** vai para o `deck.ts`; a "armadilha" do enum `ForcedDeal` **não
> existia**; e a §4.4 não listava dois arquivos de teste que precisavam de
> tratamento (`bracketAdvance.test.tsx` e o `components.test.tsx`, que teve de
> ser fatiado em vez de apagado).
>
> ⚠️ **Uma correção ao próprio documento**, achada ao executar a Fase 1: a §5.3
> dava `--color-arena-700` como "declarada e nunca lida". **Está errado.** O
> token vive dentro do bloco `@theme` do Tailwind v4, que gera utilitários a
> partir dele — e `bg-arena-700` é usado em `DevToolsPanel.tsx` (2×) e
> `Sheet.tsx` (1×). O CSS compilado confirma:
> `.bg-arena-700{background-color:var(--color-arena-700)}`. O token **foi
> mantido**; removê-lo apagaria o fundo desses três elementos sem quebrar build
> nem teste. Vale como regra para as fases seguintes: **em Tailwind v4, um
> `--color-*` do `@theme` pode ser consumido sem nunca aparecer como
> `var(--color-*)`** — a busca literal não enxerga isso.

---

## 1. Resumo executivo

| O que | Tamanho | Risco de remover |
| ----- | ------: | ---------------- |
| **Blackjack inteiro** (17 módulos exclusivos + fatias de outros 5) | **~4.900 linhas / ~188 KB** de fonte | **Baixo** — inalcançável em runtime hoje |
| CSS exclusivo do blackjack | **~1.180 linhas** | Baixo |
| Testes que só cobrem blackjack | **6 arquivos / ~175 casos / ~87 KB** | Baixo |
| E2E do chaveamento | 1 arquivo (18,5 KB), já pulado | Baixo |
| Assets órfãos em `public/` | **~176 KB** (16 SVGs + 1 logo + 2 pupilas) | Baixo |
| Arquivos nunca importados | 3 arquivos (27 linhas) | Nenhum |
| Links de documentação quebrados | 3 no README | Nenhum |
| Nomes legados (`bac-bo`, `bacbo`) | pasta raiz + 1 chave de storage | **Alto** se feito errado (§6) |

**Estimativa de redução:** ~5.500 linhas de código-fonte de produção
(≈11% do `src/`), ~87 KB de testes, ~176 KB de assets. O bundle atual é
**725 KB (218 KB gzip)**; a maior parte do blackjack **já não entra nele** por
tree-shaking (ver §3.1), então o ganho de bundle é modesto — o ganho real é de
**manutenção, tempo de CI e clareza**.

---

## 2. Como o projeto chegou aqui

Três jogos, uma base de código:

1. **Bac Bo** — sobrou o **nome da pasta** `src/features/bac-bo/` (onde vive
   100% do jogo) e a **chave de localStorage** `bacbo-arena:state`. Nenhuma
   lógica de dados sobreviveu.
2. **Blackjack (21)** — sobrou **inteiro e funcional**, atrás de um feature
   flag. É o maior bloco desta auditoria.
3. **Texas Hold'em** — o jogo atual: duelo 1v1 e mesa cash 6-max.

O ponto que muda o tom desta auditoria: **o blackjack não é código morto por
acidente — foi desligado de propósito**, com um flag documentado:

```ts
// src/features/bac-bo/tournament/availability.ts
export const BRACKET_ENABLED = false;
```

O comentário no próprio arquivo explica a decisão: *"um `git revert` de uma
remoção é caro e arriscado; um booleano é uma decisão que se desfaz."* Isso foi
uma boa decisão **na época**. A pergunta que esta auditoria coloca é se o modo
ainda vai voltar — se não vai, o flag deixou de ser uma opção e virou peso.

---

## 3. Método (para reconferir os números)

Todos os números vieram de análise do grafo de importação real, não de busca
por texto:

1. **Grafo de imports** a partir de `src/main.tsx`, resolvendo `@/`, `./`,
   `index.ts` e imports dinâmicos.
2. **Alcançabilidade** com corte: refaz o grafo removendo as quatro telas que
   só o `BRACKET_ENABLED` alcança. O que some da alcançabilidade é, por
   definição, exclusivo do blackjack.
3. **Símbolo a símbolo** nos módulos compartilhados (`engine/rules.ts`,
   `engine/types.ts`), para separar o que o poker consome do que só o
   blackjack consome.
4. **CSS por bloco BEM**, cruzando cada bloco com os arquivos que o citam.

### 3.1 Por que o ganho de bundle é menor do que parece

As quatro telas de blackjack **são importadas estaticamente** por
`TournamentApp.tsx`:

```tsx
{stage === 'match' && <TournamentMatchScreen />}   // blackjack
{stage === 'bracket' && <BracketScreen />}         // blackjack
{stage === 'table' && <TableMatchScreen />}        // blackjack
{stage === 'champion' && <ChampionScreen />}       // blackjack
```

`stage` nunca assume esses valores com `BRACKET_ENABLED = false`, mas o
**bundler não sabe disso** — o valor vem do store em runtime. Logo, **o código
está no bundle**. Remover os módulos remove peso real; apenas não os ~188 KB
de fonte (minificado + gzip, a ordem é de dezenas de KB).

---

## 4. O blackjack: inventário completo

### 4.1 Módulos EXCLUSIVOS (saem inteiros)

Nenhum destes é alcançado pelo poker. Verificado por corte de grafo.

| Arquivo | Linhas | O que é |
| ------- | -----: | ------- |
| `components/HandsArena.tsx` | 735 | A mesa de 21 do duelo |
| `animations/blaze.ts` | 598 | Modelo de partículas do "blaze" (efeito do 21) |
| `components/table/BlazeBurst.tsx` | 506 | Render do blaze |
| `tournament/screens/TournamentMatchScreen.tsx` | 500 | Partida de 21 do chaveamento |
| `tournament/screens/TableMatchScreen.tsx` | 475 | Mesa única de 21 |
| `engine/LocalBlackjackGameEngine.ts` | 400 | **A engine de blackjack** |
| `tournament/screens/TableArena.tsx` | 342 | Feltro da mesa única |
| `tournament/screens/ChampionScreen.tsx` | 264 | Pódio do chaveamento |
| `tournament/screens/BracketScreen.tsx` | 288 | Chaveamento mata-mata |
| `tournament/tableRound.ts` | 178 | Rodada da mesa única |
| `components/table/HandRow.tsx` | 113 | Fileira de cartas de 21 |
| `tournament/screens/AdvanceOverlay.tsx` | 111 | Overlay de avanço no chaveamento |
| `components/table/HandTotal.tsx` | 110 | O totalizador "17/21" |
| `components/table/CardVeil.tsx` | 80 | Véu da carta oculta |
| `components/table/duelArena.ts` | 69 | Geometria da arena de 21 |
| `components/table/pov.ts` | 56 | Ponto de vista da mesa de 21 |
| `components/RoundEndBanner.tsx` | 50 | Banner de fim de rodada |

**Subtotal: 4.875 linhas em 17 arquivos.**

### 4.2 Módulos que ficam, mas perdem partes

Estes são **compartilhados** — remover inteiro **quebra o poker**.

#### `engine/rules.ts` (339 linhas) — fatiar

O poker usa **quatro coisas** daqui, e só:

| Símbolo | Quem usa | Destino |
| ------- | -------- | ------- |
| `buildDeck` | `LocalPokerEngine`, `ringHand`, `cashTable` | **FICA** |
| `drawCard` | `LocalPokerEngine` | **FICA** |
| `rankValue` | `poker/handRank.ts` | **FICA** |
| `DECK_COUNT` | interno ao `buildDeck` | **FICA** |
| `handValue`, `isBust`, `isNaturalBlackjack` | só blackjack | sai |
| `botAction`, `blindBotAction` | só blackjack | sai |
| `standingOf`, `resolveOutcome`, `payoutFor`, `netChangeFor` | só `LocalBlackjackGameEngine` | sai |
| `dealInitialHands`, `visibleCards`, `forcedDealFor` | só blackjack | sai |
| `DECK_RESHUFFLE_THRESHOLD` | só `LocalBlackjackGameEngine` | sai |
| `winProfit`, `AVERAGE_HIDDEN_VALUE`, `DOUBLE_ACCEPT_CHANCE` | **só testes** | sai |
| `HandValue`, `InitialDeal`, `DuelistStanding` (tipos) | **só testes** | sai |

**Recomendação:** extrair `buildDeck` / `drawCard` / `rankValue` / `DECK_COUNT`
para **`engine/deck.ts`** — um módulo honesto ("o baralho francês de 52 cartas",
que é o que o poker precisa) — e apagar `engine/rules.ts`. Isso troca 339 linhas
por ~60 e remove o nome "rules" ambíguo (havia `engine/rules.ts` de 21 e
`engine/poker/rules.ts` de poker no mesmo projeto).

#### `engine/types.ts` (229 linhas) — fatiar

Mistura tipos genéricos de baralho com tipos de blackjack:

- **FICA:** `Card`, `CardRank`, `CardSuit`, `cardSchema`, `Duelist`,
  `Opponent`, `Match`, `RoundOutcome`, `HistoryEntry`, `RoundResult`
  (o histórico do poker o reusa)
- **SAI:** `BlackjackRoundState` (+ schema), `PlayerAction` (`hit`/`stand`),
  `TableMove`, `TableTurn`, `RoundPhase` (**já sem nenhum uso**), `Hand`,
  `handSchema`
- **ATENÇÃO:** `ForcedDeal` inclui o valor `'blackjack'` e é usada pelo
  `DevToolsPanel` **e** pelo `LocalPokerEngine` — o enum precisa perder só o
  valor `'blackjack'`, não o tipo (§6).

#### `tournament/tournamentStore.ts` (2.192 linhas)

Contém as três lógicas (chaveamento, mesa única, cash). Sai: `playMyMatch`,
`reportMatch`, o estado `bracket`/`tableSeries`, os stages `match`, `bracket`,
`table`, `champion`, e as importações de `bracket.ts` / `tableRules.ts`.
**Estimativa: 300–400 linhas.** É a remoção mais delicada do lote — o store é o
coração do modo cash e tem 2.192 linhas de estado entrelaçado.

#### Outros que saem junto

`tournament/bracket.ts` (237), `tournament/tableRules.ts` (144),
`tournament/podium.ts` (16), `engine/createGameEngine.ts` (29, **já só
alcançado por teste**), `engine/GameEngine.ts` (parte — `GameEngineError` fica,
é usado pelo `gameStore`).

### 4.3 CSS exclusivo do blackjack (~1.183 linhas)

Blocos citados **apenas** por módulos da §4.1:

`.active-round` (79) · `.card-veil` (98) · `.rival-seat` (81) · `.hand-total` (75)
· `.double-bubble` (70) · `.nameplate` (62) · `.score-plate` (60) · `.table-arena` (54)
· `.double-cta` (51) · `.phase-step` (49) · `.bk-seat` (48) · `.seat-total` (48)
· `.turn-call` (48) · `.bk-match` (44) · `.double-answer` (44) · `.advance-cell` (40)
· `.advance-token` (34) · `.table-verdict` (32) · `.felt-pot` (16) · `.table-lane` (16)
· `.blaze-stage` (14) · `.win-pip` (14) · `.bracket-status` (14) · `.advance-trail` (12)
· `.hand-slot` (12) · `.advance-overlay` (11) · `.advance-phase` (9)
· `.third-place-tag` (9) · `.advance-track` (6) · `.blaze-burst` (6)
· `.champion-trophy` (6) · `.win-pips` (4) · `.hands-arena` (3)

### 4.4 Testes e E2E do blackjack

| Arquivo | Casos | Bytes |
| ------- | ----: | ----: |
| `tests/rules.test.ts` | 47 | 15.693 |
| `tests/engine.test.ts` | 43 | 21.658 |
| `tests/blaze.test.ts` | 31 | 18.764 |
| `tests/tableSeries.test.ts` | 22 | 17.118 |
| `tests/tableRules.test.ts` | 22 | 7.615 |
| `tests/bracket.test.ts` | 10 | 6.286 |
| `e2e/tournament-flow.spec.ts` | — | 18.546 (já pulado por flag) |

**~175 dos ~795 casos da suíte (22%) cobrem código inalcançável.** Isso é tempo
de CI gasto em toda execução, para provar que um jogo desligado continua
correto.

> `tests/rules.test.ts` precisa de leitura antes de apagar: alguns casos cobrem
> `buildDeck`/`drawCard`/`rankValue`, que **ficam**. Esses casos migram para um
> `tests/deck.test.ts`.

---

## 5. Fora do blackjack

### 5.1 Arquivos nunca importados (por ninguém, nem teste) ✅ removidos na Fase 1

| Arquivo | Linhas | Nota |
| ------- | -----: | ---- |
| `engine/index.ts` | 7 | Barrel que reexporta o blackjack. Ninguém importa. |
| `engine/poker/index.ts` | 7 | Barrel do poker. Ninguém importa. |
| `src/vite-env.d.ts` | 13 | **NÃO REMOVER** — é referência de tipos do Vite, "não importado" por natureza. |

Os dois barrels são remoção livre. O `vite-env.d.ts` é falso positivo do método.

### 5.2 Assets órfãos em `public/` (~176 KB) ✅ removidos nas Fases 1 e 2

| Asset | Tamanho | Por quê |
| ----- | ------: | ------- |
| `public/dealer/` (16 SVGs) | **156 KB** | Rig **antigo** da crupiê. Só o `SvgRigDealer` os usa, e ele é o rig aposentado (`variant="svg"`, que o jogo nunca pede). |
| `public/logocompletarvc.svg` | **20 KB** | Não referenciado em lugar nenhum. |
| `dealernova/semvar/pupila-padrao.svg` | 4 KB | Original do par; substituído pelos splits `-dir`/`-esq`. |
| `dealernova/vartriste/pupila-triste.svg` | 4 KB | Idem. |

Junto sai `scene/dealer/SvgRigDealer.tsx` (286 linhas) e o ramo `variant: 'svg'`
do `Dealer.tsx`. Ver `docs/animacaodealer.md` — a crupiê nova está documentada
e o rig antigo está marcado como aposentado desde a substituição.

`scripts/process-dealer-assets.py` (9 KB) processava PNGs de uma pasta `art/`
que **não existe mais** no repositório. É um script sem entrada.

### 5.3 CSS sem nenhum uso ✅ removido na Fase 1

`.showdown-strip` (~12 linhas) e `.tournament-prize` (~17 linhas) não eram
citados por nenhum `.ts`/`.tsx` — saíram, junto com a regra órfã
`.showdown-strip .winner-plate`.

`--color-spot` era de fato morto (o `.rival-seat__spot` que parecia consumi-lo
usa `rgba()` escrito à mão) — saiu.

**`--color-arena-700` FICOU.** O levantamento original o dava como morto e
estava errado: ver o aviso no topo deste documento.

### 5.4 Documentação quebrada

O `README.md` (27 KB) aponta para três documentos que não existem mais:

- `docs/BacBo_Arena_Master_Specification.md`
- `docs/dmisterioso.md`
- `docs/scenario.md`

Os dois últimos são referenciados **também de dentro do código** (comentários em
`useDealerReaction.ts`, `DealerController.ts`, `Dealer.tsx`, `index.css` citam
`docs/scenario.md §7.2`, `§9.1`, `§4`). Esses ponteiros hoje não levam a lugar
nenhum. Ou os documentos voltam, ou as citações saem.

### 5.5 Dependências

**Todas as sete dependências de produção são usadas de fato.** Verificado
import a import: `howler` (1 arquivo, `AudioManager`), `zod` (4), `zustand` (2),
`framer-motion` (54), `react`/`react-dom`, `tailwindcss` (via `@tailwindcss/vite`).
**Nada a remover aqui.**

### 5.6 Exports "não usados"

O levantamento acusou ~60 exports nunca citados fora do próprio arquivo — mas
**quase todos são interfaces `*Props` de componentes**, exportadas por
convenção de API. Não são código morto e removê-las só piora a ergonomia.

As exceções reais, todas dentro de módulos que já saem com o blackjack:
os 8 tipos de `animations/blaze.ts` e `HAND_GAP`/`HAND_SPREAD_MAX`/
`HAND_MAX_WIDTH`/`MINI_HAND_MAX_WIDTH` de `animations/cards.ts` (conferir se
`cards.ts` sobrevive — ele tem outros símbolos em uso).

---

## 6. Nomes legados — e por que o maior deles é armadilha

### 6.1 `src/features/bac-bo/` (a pasta) ✅ RENOMEADA na Fase 7

**Todo o jogo vive dentro dela.** Renomear para `src/features/poker/` é o
rename mais visível da limpeza e o mais fácil de fazer com segurança —
**exceto** por um detalhe: `e2e/*.spec.ts` importam
`../src/features/bac-bo/tournament/availability.js` com caminho relativo e
**extensão `.js`**. Um rename que não atualizar esses quatro arquivos passa no
`tsc` e no `vitest`, e **quebra só no e2e**.

### 6.2 `bacbo-arena:state` (chave de localStorage) — ⚠️ MANTIDA de propósito

```ts
// src/features/bac-bo/services/GameStorageService.ts
const STORAGE_KEY = 'bacbo-arena:state';
```

Trocar essa string **apaga o saldo, o histórico e as configurações de todo
jogador que já abriu o jogo** — o app passaria a ler uma chave nova e vazia.

Se for renomear, exige migração explícita: ler a chave antiga, gravar na nova,
remover a antiga, e manter esse código por algumas versões. O `GameStorageService`
já tem versionamento (`version: 3`), então o lugar existe — mas é trabalho de
verdade, não um *find & replace*.

**Recomendação: deixar como está.** É uma string invisível ao jogador, e o custo
de errar é perder dados de usuário. Vale um comentário no arquivo explicando por
que o nome legado permanece.

### 6.3 O que NÃO é problema

`dice`/`dado` acusaram 119 ocorrências, mas **quase todas são falsos positivos**
— as palavras estão dentro de "ín**dice**", "apên**dice**", "**dado**s". A única
ocorrência real é `icon: 'dice'` em `opponentProfile.ts`, e o ícone `dice`
existe, é usado e é legítimo (um dado como avatar de perfil).

---

## 7. Plano de execução — em fases, cada uma verificável

A ordem importa: cada fase deixa o projeto verde antes da seguinte. **Um commit
por fase**, para que qualquer uma possa ser revertida sozinha.

### Fase 0 — Decisão de produto ✅ DECIDIDA: **o blackjack não volta**

**O modo blackjack vai voltar?** Não. A decisão foi tomada em 14/08/2026, ao
pedir a execução das Fases 3 a 6 — pedir a remoção *é* a resposta, e nenhuma
fase daquele bloco faz sentido sob a outra hipótese.

Não era decisão técnica: o código estava saudável, testado e desligado de
propósito. O que mudou não foi a qualidade dele, foi o produto — a casa joga
Texas Hold'em, em duas mesas (1v1 e cash de 6), e manter um segundo jogo inteiro
de pé custava manutenção, tempo de CI e carga mental em cada mexida no
`tournamentStore`.

**O caminho de volta, se alguém mudar de ideia:** `git revert` dos commits das
Fases 3 a 6. Eles foram feitos em fases justamente para isso, e o histórico
guarda o jogo inteiro — engine, telas, chaveamento, mesa única e testes.

### Fase 1 — Remoções sem risco ✅ FEITA

- ✅ `engine/index.ts` e `engine/poker/index.ts` (barrels que ninguém importa)
- ✅ `public/logocompletarvc.svg`
- ✅ `dealernova/semvar/pupila-padrao.svg`, `dealernova/vartriste/pupila-triste.svg`
- ✅ `.showdown-strip` e `.tournament-prize` do CSS; `--color-spot`
- ⚠️ `--color-arena-700` **NÃO removido** — está vivo via `bg-arena-700` (topo do doc)
- ✅ `scripts/process-dealer-assets.py` (a pasta `art/` que ele lia não existe);
  a pasta `scripts/` ficou vazia e saiu junto
- ✅ Os 3 links quebrados do README: o do spec histórico passou a apontar para
  este documento (§2), o de `dmisterioso.md` saiu (a regra do botão já está
  explicada por extenso no próprio bullet) e o de `scenario.md` virou
  `animacaodealer.md`

**Verificado:** `npm run check` (801 testes) + `npm run build`, ambos verdes.

### Fase 2 — Aposentar o rig antigo da crupiê ✅ FEITA

- ✅ `scene/dealer/SvgRigDealer.tsx` (e com ele um segundo `RIG_ASPECT`
  exportado, homônimo do de `dealerRig.ts` — ninguém importava o do rig antigo)
- ✅ `public/dealer/` (16 SVGs, 152 KB)
- ✅ O ramo `variant === 'svg'` de `Dealer.tsx` e o valor `'svg'` de
  `DealerVariant` (`'nova' | 'none'` agora)
- ✅ O caso de teste "o rig ANTIGO continua montável" virou "a fachada monta o
  rig da arte nova por padrão" — o mesmo assert de `data-face`, agora provando
  o caminho que o jogo usa de verdade

**Verificado:** `npm run check` + `npm run build` verdes, e a crupiê conferida no
app rodando: 20 peças carregadas, nenhuma de `/dealer/`, zero 404 e zero erro de
console.

### Fase 3 — Telas e componentes do blackjack ✅ FEITA

- ✅ Os 17 arquivos da §4.1, **confirmados por corte de grafo** (refiz a medição
  do §3.2 antes de apagar: o corte devolveu exatamente a mesma lista)
- ✅ Os quatro ramos de `stage` em `TournamentApp.tsx` e seus imports
- ✅ `tests/blaze.test.ts`, `tests/tableSeries.test.ts` e — **fora da lista da
  §4.4** — `tests/bracketAdvance.test.tsx`, que testava a `BracketScreen`
- ✅ `tests/components.test.tsx` foi **fatiado, não apagado**: três dos seus
  `describe` eram de blackjack (`HandsArena`, `CardVeil`, `RoundEndBanner`, 671
  linhas contíguas) e os outros sete são do poker vivo. A §4.4 não registrava
  isso.

`LocalBlackjackGameEngine.ts` ficou para a Fase 4: `createGameEngine.ts` ainda o
importava, e apagar um sem o outro deixaria a fase vermelha.

**Verificado:** `npm run check` + `npm run build` + a suíte e2e do cash.
Bundle: 720 kB → 660 kB (gzip 218 → 200 kB).

### Fase 4 — Engine e regras ✅ FEITA

- ✅ `engine/deck.ts` criado com `buildDeck`, `drawCard` e `DECK_COUNT`
- ✅ Os importadores do poker repontados (`LocalPokerEngine`, `ringHand`,
  `cashTable`)
- ✅ `LocalBlackjackGameEngine.ts`, `createGameEngine.ts` e `tests/engine.test.ts`
- ✅ `GameEngine.ts` aparado: a interface `GameEngine` (o contrato do 21) saiu
  inteira; ficaram `FindMatchParams`, `SetStakeParams` e `GameEngineError`, que
  o poker usa
- ✅ Casos de baralho migrados de `tests/rules.test.ts` para `tests/deck.test.ts`

**Duas correções ao levantamento, achadas aqui:**

1. **`rankValue` NÃO vai para o `deck.ts`.** A §4.2 o dava como usado por
   `poker/handRank.ts` — não é: aquele arquivo importa só `{ Card, CardRank }`, e
   o `rankValue` que aparece nele é uma **variável de laço** homônima. O
   `rankValue` de `rules.ts` é pontuação de **21** (Ás = 11), e o poker tem a
   própria tabela (`POKER_RANK_VALUE`, Ás = 14). Levá-lo junto seria carregar
   regra de blackjack para dentro do baralho do poker.
2. **A "armadilha" do enum `ForcedDeal` não existe.** A §4.2 avisava que ele era
   usado pelo `DevToolsPanel` e pelo `LocalPokerEngine` e que o valor
   `'blackjack'` teria de sair sozinho. Na verdade o DevTools usa
   `ForcedPokerDeal` (de `poker/types.ts`) e o `ForcedDeal` de blackjack só era
   usado por `rules.ts` — morreu inteiro com ele, sem cirurgia.

Também: **`HistoryEntry` não era reusado pelo poker** (§8 dizia que sim). O
poker tem `PokerHistoryEntry`/`RingHistoryEntry` próprios.

### Fase 5 — Store do torneio ✅ FEITA

- ✅ Estado (`bracket`, `tableSeries`, `activeMatch`, `simulating`, `prizePaid`),
  as 5 ações (`playMyMatch`, `finishMyMatch`, `backToBracket`,
  `settleTableRound`, `showTableChampion`), `runSimulation`, `chargeEntryFee`,
  os 4 estágios e 9 seletores
- ✅ `bracket.ts`, `tableRules.ts`, `engine/rules.ts` e os testes deles
- ✅ `e2e/tournament-flow.spec.ts` (estava 100% pulado pelo flag)
- ✅ `blackjackScore`/`simulateBotMatch` de `simulation.ts`
- ✅ `BRACKET_ENABLED` e `tests/createLobbyFee.test.tsx` — o arquivo inteiro era
  um `describe.skipIf(!BRACKET_ENABLED)`, e a premissa dele ("reativar numa linha
  reativa a cobertura") deixou de valer quando o modo saiu
- ✅ O fatiamento de `engine/types.ts` foi **fechado aqui**, e não na Fase 4: ele
  dependia de o store soltar o `RoundResult`. Sobraram carta, naipe, duelista,
  oponente e partida — todo o cluster de 21 (mão, ação, fase, lance, estado da
  rodada) saiu.

**`startTournament` ganhou uma saída explícita** (`if (s.format !== 'cash') return`).
Sem ela, uma sala de formato não-cash cairia num `if` sem `else` — um botão que
não faz nada, que é pior que um erro.

**`podium.ts` NÃO saiu.** A §4.2 o listava com o blackjack, mas
`screens/PrizeSplit.tsx` — tela viva do lobby — importa o `PODIUM_METALS`.

**Verificado:** `npm run check`, `npm run build`, e as suítes e2e `cash-table` +
`game-flow` (28 passaram).

### Fase 6 — CSS ✅ FEITA

Os 33 blocos da §4.3 saíram, mais o que eles arrastaram: **72 regras, 6
`@keyframes` órfãos e 3 blocos `@media` que esvaziaram**. `index.css`: 10.011 →
8.275 linhas. CSS do bundle: 138 kB → 116 kB (gzip 27,7 → 23,4 kB).

Três armadilhas que a remoção "bloco a bloco" teria pego mal, e por isso ela foi
feita por script com dry-run:

1. **Comentário não é seletor.** A primeira versão do script tratava o
   comentário anterior como parte do seletor e ia levando junto o cabeçalho da
   seção **viva** da mesa de cash.
2. **Lista de seletores pode ser mista.** A regra
   `.nameplate.is-turn .nameplate__dot, .turn-wait__dot` tem um seletor morto e
   um **vivo** (`.turn-wait__dot`, do `PokerArena`). Apagar a regra inteira
   mataria a animação do ponto da vez; o script passou a **podar** a lista.
3. **`@keyframes` sobrevivem calados.** `nameplate-breathe` continua vivo porque
   `.turn-wait__dot` o anima — enquanto outros seis ficaram órfãos e saíram.

**Rede de segurança usada:** as 114 classes que sumiram do CSS foram cruzadas,
uma a uma, contra o `src` — nenhuma aparece em nenhum `.ts`/`.tsx`. Depois,
conferência em tela: home, vitrine e a mesa de Hold'em em jogo (placas, fichas,
pote, board, botão do dealer e leitura da mão), sem erro de console nem 404.

### Fase 7 — Rename da pasta ✅ FEITA

`src/features/bac-bo/` → `src/features/poker/`, com `git mv`: os **132 arquivos**
entraram no histórico como **rename puro** (`R`, zero linha alterada), então
`git log --follow` continua achando o passado de cada um.

**O move em si foi trivial, e há um motivo verificável para isso:** nenhum
import DENTRO da pasta usava o alias `@/features/bac-bo/` — os 111 imports com
`@/` apontam todos para `@/shared/*` (e um para `@/App`), e o resto é relativo.
Conferi isso ANTES de mover; se houvesse um só self-reference por alias, o move
o quebraria em silêncio.

Só **12 referências externas** precisaram de edição:

- `src/App.tsx` — 10 imports por alias;
- `e2e/cash-table.spec.ts` e `e2e/table-parity.spec.ts` — a armadilha do §6.1.

**Correção ao §6.1:** ele fala em "quatro `e2e/*.spec.ts`". Hoje são **dois** —
`tournament-flow.spec.ts` saiu na Fase 5, e `game-flow.spec.ts` não importa nada
de `src/`. A armadilha em si é real e continua valendo para os dois que sobraram.

**A chave de localStorage NÃO foi renomeada** (§6.2), e agora ela é a última
coisa no projeto que ainda se chama `bacbo`. Justamente por ficar sozinha é que
parece um esquecimento — então o `GameStorageService.ts` ganhou um comentário
explicando que uma chave de storage é um ENDEREÇO, não um nome, e que trocá-la
apaga o saldo de quem já jogou.

**Verificado:** `npm run check` (586 testes), `npm run build` e **`npm run test:e2e`
(31/31)** — esta última é a única que pegaria o erro do §6.1. O bundle saiu com
**hash idêntico** ao de antes do rename (`index-BjHfnQhb.js`), que é a prova de
que a mudança foi puramente estrutural.

---

## 8. O que NÃO tocar

| Item | Por quê |
| ---- | ------- |
| `bacbo-arena:state` | Apaga saldo e histórico de todo jogador (§6.2) |
| `src/vite-env.d.ts` | Parece órfão, é referência de tipos do Vite |
| Interfaces `*Props` exportadas | Convenção de API, não código morto |
| `engine/GameEngine.ts` | `GameEngineError` é usado pelo `gameStore` do poker |
| `buildDeck`/`drawCard`/`rankValue` | O poker inteiro depende deles |
| `RoundResult`/`HistoryEntry` | O histórico do poker os reusa |
| Qualquer dependência do `package.json` | Todas as sete estão em uso |
| `availability.ts` | `TOURNAMENT_ENABLED` e `OPEN_TABLE_ENABLED` continuam valendo para o cash |

---

## 9. Riscos e como cobri-los

| Risco | Mitigação |
| ----- | --------- |
| Quebrar o modo cash ao mexer no store | Fase 5 isolada em commit próprio; `cash-table.spec.ts` como prova |
| Remover um símbolo compartilhado | A tabela símbolo-a-símbolo da §4.2 lista cada um e seu dono |
| Perder cobertura de teste real | `tests/rules.test.ts` tem casos de baralho misturados — migrar, não apagar |
| Quebrar o e2e no rename | Os quatro `e2e/*.spec.ts` importam por caminho relativo com `.js` |
| CSS: remover bloco vivo | Blocos com modificador dinâmico (`hud-pill--${variant}`) não aparecem em busca literal — a lista da §4.3 já foi filtrada por isso |
| Arrependimento | Um commit por fase; `git revert` de uma fase não afeta as outras |

**Rede de segurança que já existe:** 801 casos de teste unitário, 4 suítes e2e,
`tsc` estrito com `noUncheckedIndexedAccess`, e ESLint. Rodar
`npm run check && npm run build` entre fases cobre a maior parte.

> ⚠️ **Um teste INSTÁVEL na rede, achado ao executar a Fase 1.**
> `tests/seating.test.ts > a economia da mesa de cash > levantar sem fichas não
> credita nada, e o saldo fecha a conta` falha de forma intermitente — medido em
> ~1–2 vezes a cada 8 execuções, e **igualmente no código sem nenhuma limpeza**
> (conferido em worktree limpo no HEAD anterior). O grafo de imports dele
> (`engine/credits`, `tournamentStore`, `gameStore`, `simulation`) não toca nada
> que as Fases 1 e 2 removeram.
>
> Isso importa para quem seguir com as fases seguintes: **uma falha isolada
> nesse teste não é sinal de que a sua fase quebrou algo.** Rode de novo antes
> de investigar. E vale consertá-lo por si só — é a mesa cash de verdade, e um
> teste que pisca esconde regressão real justamente na área mais arriscada da
> limpeza (Fase 5).

---

## 10. Recomendação — e o que ficou

**As Fases 0 a 7 estão feitas.** Esta auditoria não tem mais nenhuma fase
pendente. O que segue abaixo são as duas coisas que a execução revelou e que
não estavam previstas em fase nenhuma.

### 10.1 O que a execução deixou em aberto, e não estava em fase nenhuma

Uma coisa: **a união `TournamentFormat` ainda é `'bracket' | 'table' | 'cash'`**,
embora só o `cash` tenha caminho de execução. Ela sobrevive porque cinco telas
ainda ramificam por ela (`LobbyScreen`, `LobbyBrowseScreen`,
`TournamentSettingsSheet`, `PrizeSplit`, `CreateLobbySheet`), junto com
`formatLabel`, `TOURNAMENT_FORMATS`, `sizesFor`, `defaultSizeFor`,
`TABLE_TARGET_WINS`, `tablePrize`, `prizeFor` e `PRIZE_SHARES`.

Colapsar tudo isso para `'cash'` é um refactor de interface que **nenhuma fase
desta auditoria escopou** — e por isso não foi feito por conta própria. O que
ficou no lugar é uma saída explícita em `startTournament`
(`if (s.format !== 'cash') return`), para que nenhuma sala de formato morto caia
num `if` sem `else`.

Se for encarar, é uma Fase 8, e o roteiro é: colapsar a união em `types.ts`,
seguir os erros do `tsc` pelas cinco telas, e apagar o que ficar órfão do prêmio
de pódio (que só o chaveamento pagava).

### 10.2 Um teste instável que continua lá

`tests/seating.test.ts > levantar sem fichas não credita nada` segue piscando
(ver §9). Não foi tocado por nenhuma fase, e o sintoma agora está visível: erro
de **1 crédito** (`expected 10009 to be 10010`), o que cheira a arredondamento
na conta do caixa, não a corrida de timer. Vale investigar por si só.
