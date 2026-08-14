# Auditoria de limpeza — o que sobrou dos jogos anteriores

O projeto nasceu como **Bac Bo** (jogo de dados), virou **duelo de 21
(blackjack)** e hoje é **Texas Hold'em**. Cada troca deixou camadas para trás.
Este documento levanta o que ainda está no repositório, quanto pesa, **o que é
seguro remover** e em que ordem — com o método de medição descrito para que
qualquer número aqui possa ser reconferido.

> **Nada neste documento foi executado.** É um levantamento. A seção §7 traz o
> plano por fases, cada uma com o comando de verificação que precisa passar
> antes da fase seguinte.

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

### 5.1 Arquivos nunca importados (por ninguém, nem teste)

| Arquivo | Linhas | Nota |
| ------- | -----: | ---- |
| `engine/index.ts` | 7 | Barrel que reexporta o blackjack. Ninguém importa. |
| `engine/poker/index.ts` | 7 | Barrel do poker. Ninguém importa. |
| `src/vite-env.d.ts` | 13 | **NÃO REMOVER** — é referência de tipos do Vite, "não importado" por natureza. |

Os dois barrels são remoção livre. O `vite-env.d.ts` é falso positivo do método.

### 5.2 Assets órfãos em `public/` (~176 KB)

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

### 5.3 CSS sem nenhum uso

`.showdown-strip` (~12 linhas) e `.tournament-prize` (~17 linhas) não são
citados por nenhum `.ts`/`.tsx`. Também `--color-arena-700` e `--color-spot`,
duas custom properties declaradas e nunca lidas.

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

### 6.1 `src/features/bac-bo/` (a pasta)

**Todo o jogo vive dentro dela.** Renomear para `src/features/poker/` é o
rename mais visível da limpeza e o mais fácil de fazer com segurança —
**exceto** por um detalhe: `e2e/*.spec.ts` importam
`../src/features/bac-bo/tournament/availability.js` com caminho relativo e
**extensão `.js`**. Um rename que não atualizar esses quatro arquivos passa no
`tsc` e no `vitest`, e **quebra só no e2e**.

### 6.2 `bacbo-arena:state` (chave de localStorage) — ⚠️ NÃO RENOMEAR SEM MIGRAÇÃO

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

### Fase 0 — Decisão de produto (bloqueia tudo)

**O modo blackjack vai voltar?** Se sim, pare aqui: o flag já faz o trabalho e
esta auditoria vira uma lista de "não mexer". Se não, siga.

Não é decisão técnica. O código está saudável, testado e desligado de propósito.

### Fase 1 — Remoções sem risco (~10 min)

- `engine/index.ts` e `engine/poker/index.ts` (barrels que ninguém importa)
- `public/logocompletarvc.svg`
- `dealernova/semvar/pupila-padrao.svg`, `dealernova/vartriste/pupila-triste.svg`
- `.showdown-strip` e `.tournament-prize` do CSS; `--color-arena-700`, `--color-spot`
- `scripts/process-dealer-assets.py` (a pasta `art/` que ele lia não existe)
- Corrigir os 3 links quebrados do README

**Verificar:** `npm run check && npm run build`

### Fase 2 — Aposentar o rig antigo da crupiê (~20 min)

- `scene/dealer/SvgRigDealer.tsx`
- `public/dealer/` (16 SVGs, 156 KB)
- O ramo `variant === 'svg'` de `Dealer.tsx` e o valor `'svg'` de `DealerVariant`
- O caso de teste "o rig ANTIGO continua montável" em `tests/scene.test.tsx`

**Verificar:** `npm run check` + abrir o jogo e conferir a crupiê em cena.

### Fase 3 — Telas e componentes do blackjack (~1 h)

Remover os 17 arquivos da §4.1 e os quatro ramos de `stage` em
`TournamentApp.tsx`. O TypeScript vai apontar cada ponta solta — siga os erros
até o `tsc` ficar limpo.

**Verificar:** `npm run check && npm run build` + jogar uma sessão cash inteira.

### Fase 4 — Engine e regras (~1 h, a mais delicada)

1. Criar `engine/deck.ts` com `buildDeck`, `drawCard`, `rankValue`, `DECK_COUNT`
2. Repontar os 5 importadores do poker para o módulo novo
3. Apagar `engine/rules.ts`, `engine/LocalBlackjackGameEngine.ts`,
   `engine/createGameEngine.ts`
4. Fatiar `engine/types.ts` (§4.2) — **atenção ao enum `ForcedDeal`**
5. Migrar os casos de `tests/rules.test.ts` que cobrem o baralho para
   `tests/deck.test.ts`; apagar o resto

**Verificar:** `npm run check` — os testes de poker são a rede aqui, e são
densos (`pokerEngine`, `pokerRules`, `ringHand`, `sidePots`, `betting`).

### Fase 5 — Store do torneio (~1–2 h, a mais arriscada)

Remover de `tournamentStore.ts` o estado e as ações de chaveamento/mesa única.
**Faça por último e sozinho num commit** — são 2.192 linhas de estado
entrelaçado, e o modo cash depende do mesmo objeto.

**Verificar:** `npm run check` + `npm run test:e2e` (a suíte `cash-table.spec.ts`
é a que prova que a mesa continua de pé).

### Fase 6 — CSS (~30 min)

Remover os 33 blocos da §4.3. Sem risco de compilação (CSS não quebra build) —
o risco é remover um bloco a mais. Faça bloco a bloco, conferindo em tela.

### Fase 7 — Rename da pasta (~30 min)

`src/features/bac-bo/` → `src/features/poker/`. Use o rename da IDE (atualiza
imports), e **depois** confira à mão os quatro `e2e/*.spec.ts` (§6.1).

**Verificar:** `npm run check && npm run test:e2e && npm run build`

**Não** renomeie a chave de localStorage (§6.2).

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

**Rede de segurança que já existe:** 795 casos de teste unitário, 4 suítes e2e,
`tsc` estrito com `noUncheckedIndexedAccess`, e ESLint. Rodar
`npm run check && npm run build` entre fases cobre a maior parte.

---

## 10. Recomendação

**Faça as Fases 1 e 2 agora** — são 30 minutos, risco quase nulo, e tiram
176 KB de assets e arquivos que ninguém defende.

**As Fases 3 a 6 dependem da Fase 0.** Se a resposta for "o blackjack não
volta", vale muito: tira ~5.500 linhas, 22% do tempo de teste e um jogo
inteiro de carga mental de quem for mexer no `tournamentStore` amanhã.

**A Fase 7 (rename) é a de menor retorno prático** e a mais barulhenta no
histórico do git — deixe por último, e só quando as outras estiverem estáveis.
