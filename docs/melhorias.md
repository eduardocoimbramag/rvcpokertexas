# Melhorias — análise de design e código

> Análise feita lendo o código em 30/07/2026, com foco em **design**:
> o que está errado, o que falta de fundação e o que deixaria o jogo mais
> bonito. Cada item traz **onde está**, **por que importa**, **como
> resolver** e **o impacto depois de pronto**.
>
> Os números citados (contagens, tamanhos, medidas) foram medidos no
> código e no app rodando, não estimados.
>
> **Estado da implementação (30/07/2026):** foram implementados os itens
> **1.1**, **4.1**, **4.2**, **4.4**, **5.2** e a **seção 3 inteira**
> (3.1, 3.2 e 3.3). O item **1.2** saiu junto, de graça, porque era a
> mesma divergência que 3.1 resolve na origem. Todo o resto continua
> sendo proposta — nada mais foi tocado.

---

## Sumário — o que eu faria primeiro

| # | Item | Impacto | Esforço | Estado |
| --- | --- | :-: | :-: | :-: |
| 1 | [Tutorial fala de um chat que não existe mais](#11-o-tutorial-descrevia-uma-tela-que-não-existe-mais--feito) | 🔴 Alto | 5 min | ✅ Feito |
| 2 | [Escala tipográfica: 53 tamanhos diferentes](#21-tipografia-53-tamanhos-para-106-declarações) | 🔴 Alto | 3–4 h | — |
| 3 | [Foco de teclado ausente em metade dos controles](#41-metade-dos-controles-não-tinha-anel-de-foco--feito) | 🔴 Alto | 1 h | ✅ Feito |
| 4 | [Três vereditos de fim de partida, três desenhos](#31-três-telas-de-desfecho-com-três-tipografias--feito) | 🟡 Médio | 1–2 h | ✅ Feito |
| 5 | [Tipos de 7,7px ilegíveis na mesa única](#22-tipo-abaixo-do-legível) | 🟡 Médio | 30 min | — |
| 6 | [Tokens de cor contornados em 220 lugares](#23-a-paleta-existe-mas-quase-ninguém-usa) | 🟡 Médio | 2–3 h | — |
| 7 | [Histórico e ajustes não têm a identidade do clube](#51-o-histórico-é-a-tela-mais-pobre-do-jogo) | 🟢 Beleza | 2 h | — |
| 8 | [CSS morto e um arquivo de 4.961 linhas](#61-indexcss-tem-4961-linhas--e-um-pouco-de-código-morto) | 🟢 Saúde | 1–3 h | — |

---

## 1. Correções — coisas que estão erradas hoje

### 1.1 O tutorial descrevia uma tela que não existe mais — ✅ FEITO

**Onde:** `src/features/bac-bo/components/TutorialSheet.tsx`

**O que estava errado.** O passo 2 dizia:

> "Troquem propostas **no chat** até fecharem o valor do duelo."

O chat da negociação foi removido — hoje a fase é a rodada de fichas na
mesa, com relógio de 20 s, balões de proposta e a aposta padrão de 100. O
texto ensinava uma interface que o jogador não ia encontrar, e é a
PRIMEIRA coisa que ele lê no jogo. O torneio (com dois formatos) não
aparecia em lugar nenhum.

**O que foi implementado.**

1. **Passo 2 reescrito** para a mesa de fichas: aposta padrão, relógio,
   o balão da proposta, cobrir × recusar e o que acontece se o relógio
   zerar.
2. **4º passo novo — "E tem torneio"** (ícone `trophy`), apresentando os
   dois formatos: chaveamento (mata-mata com pódio) e mesa única (3 a 6
   no mesmo feltro, 90% do bolo para quem vencer primeiro).
3. **Números vindos das constantes reais**, não escritos à mão:
   `DEFAULT_STAKE`, `NEGOTIATION_SECONDS` e `TABLE_TARGET_WINS` entram no
   texto por interpolação. Mudar a aposta padrão ou o tempo do relógio
   passa a atualizar o tutorial sozinho.
4. **Comentário de contrato** no topo de `STEPS`, dizendo que este texto
   é interface e precisa acompanhar a fase.
5. Sem `✓`/`✗` no texto: a fonte da casa não tem esses glifos e o
   navegador caía num fallback que desenhava o "certo" como radical (`√`).
6. **Testes atualizados**: `components.test.tsx` percorre os 4 passos e
   trava a regressão (o passo da negociação precisa falar de "proposta" e
   **não pode** voltar a falar de "chat"); `e2e/game-flow.spec.ts` passou
   a dar 4 cliques em `tutorial-next`.

**Impacto depois de pronto.** O primeiro minuto de jogo deixa de mentir:
o jogador chega na negociação sabendo o que é o balão, o relógio e o
valor na mesa — em vez de procurar um campo de chat que não existe. É a
diferença entre "não entendi essa tela" e "já sei o que fazer" no momento
de maior risco de abandono. Além disso, o torneio deixa de ser um recurso
invisível: quem só jogava 1v1 agora sabe que existe uma sala com mais
gente. E, como o texto passou a derivar das constantes, essa classe de
erro (documentação interna desatualizada) não volta pela mesma porta.

### 1.2 O veredito da mesa única não usava a tipografia dos outros — ✅ RESOLVIDO POR 3.1

`.table-over__title` era 2,5 rem fixo contra o `clamp(2.75rem, 12vw,
3.75rem)` dos outros dois modos: o mesmo momento do jogo ("ganhei ou
perdi") tinha dois pesos conforme o modo.

Este item era um sintoma, não a doença. Ao extrair o `<ResultStage>`
(item 3.1) a mesa única passou a usar o MESMO título dos outros dois, e
`.table-over__title` deixou de existir — não sobrou nada para corrigir
aqui.

**Impacto (já em produção).** O clímax do jogo tem o mesmo peso nos três
modos: a mesa única parou de parecer a tela "de segunda" do produto. E a
troca do tamanho fixo pelo `clamp` faz o título sobreviver a telas de
320 px sem quebrar linha e crescer nas largas — antes ele ficava pequeno
demais no celular grande e apertado no pequeno.

### 1.3 CSS morto

**Onde:** `src/index.css`

Cinco blocos definidos e nunca usados (verificado por varredura no código,
incluindo classes montadas por template string):

- `.balance-pill` — o componente usa classes Tailwind inline.
- `.stake-chip` e `.stake-chip--selected` — restos da tela de escolha de
  aposta, extinta quando a negociação nasceu.
- `.tournament-prize` e `.tournament-prize__value`.

**Como resolver:** apagar. São ~40 linhas e nenhum risco.

**Impacto depois de pronto.** Nenhuma mudança visual — o ganho é de
confiança. Some a armadilha de alguém (eu inclusive) reaproveitar
`.stake-chip` achando que é código vivo e herdar o estilo de uma tela que
morreu. Cada bloco morto num arquivo de ~4.960 linhas é um falso positivo
a mais na hora de responder "onde eu mexo para mudar X" — e é exatamente
essa dificuldade que faz nascerem valores novos em vez de reuso (ver 2.1).

### 1.4 `test-results/` versionado

**Onde:** raiz do repositório.

A pasta de artefatos do Playwright aparece como não rastreada. Se entrar
num commit, traz screenshots e vídeos de teste para o histórico.

**Como resolver:** acrescentar `test-results/` e `playwright-report/` ao
`.gitignore`.

**Impacto depois de pronto.** Protege o repositório de engordar com
binários que nunca serão lidos (cada rodada de e2e com falha grava vídeo
e trace, na casa dos MB) — e, em git, o que entra no histórico não sai.
No dia a dia o ganho é mais imediato: o `git status` volta a mostrar só
mudança de verdade, o que torna a revisão antes do commit confiável.

---

## 2. Fundação de design — o que falta de sistema

Esta seção é a raiz da maioria dos problemas visuais. O jogo tem uma
identidade forte (Art Déco, vinho e âmbar) mas **não tem um sistema**: os
valores são decididos caso a caso, e é isso que produz as pequenas
dissonâncias que se percebem sem saber nomear.

### 2.1 Tipografia: 53 tamanhos para 106 declarações

**Medido** (renumerado depois das seções 3 e 4): o `index.css` declara
`font-size` 106 vezes, com **53 valores distintos**. Só entre 0,48 rem e
0,95 rem existem **vinte e um** valores:

```
0.48  0.5  0.52  0.55  0.56  0.58  0.6  0.62  0.64  0.66  0.68
0.7  0.72  0.74  0.75  0.78  0.8  0.82  0.85  0.9  0.95
```

Vários são visualmente idênticos (0,55 × 0,56 × 0,58 = 8,8 × 9 × 9,3 px).
Isso não é escolha de design, é acúmulo: cada componente novo escolheu o
seu número.

Ainda há **mistura de unidades**: `rem`, `em` e `px` cru (`9px`, `11px`,
`15px`, `17px`) convivem — os `px` não acompanham o ajuste de fonte do
sistema operacional, então quem aumenta a fonte do celular vê parte da
interface parada.

**Como resolver:** definir uma escala de 7–8 degraus no `@theme` (ex.:
`--text-2xs: 0.625rem`, `--text-xs: 0.75rem`, `--text-sm: 0.875rem`,
`--text-base: 1rem`, `--text-lg: 1.125rem`, `--text-xl: 1.5rem`,
`--text-2xl: 2.25rem`, `--text-3xl: 3rem`) e migrar. Migrar por tela, não
tudo de uma vez: a mesa 1v1 primeiro (é a tela mais vista), depois
torneio, depois folhas.

**Impacto depois de pronto.** É o maior ganho visual isolado deste
documento, e o mais difícil de explicar antes de acontecer: hoje o olho
percebe que três rótulos vizinhos têm tamanhos "quase iguais" e lê isso
como desleixo, sem saber apontar o motivo. Com a escala, a hierarquia
fica evidente — o que é título, o que é dado, o que é decoração — e as
telas ganham ritmo vertical. Do lado prático, todo componente novo passa
a ter resposta óbvia para "que tamanho eu uso?", que é o que impede o
problema de voltar. E trocar os `px` por `rem` faz o jogo finalmente
respeitar o ajuste de fonte do sistema, que hoje deixa metade da
interface parada.

### 2.2 Tipo abaixo do legível

**Onde:** doze seletores usam menos de 0,6 rem. Os piores:

| Seletor | Tamanho | Equivale a |
| --- | --- | --- |
| `.rival-seat__state` | 0,48 rem | **7,7 px** |
| `.chip-stack__label` | 0,52 rem | 8,3 px |
| `.prop-bubble__hint` / `.double-bubble__hint` | 0,55 rem | 8,8 px |
| `.active-round--dense` | 0,55 rem | 8,8 px |

7,7 px é menor que qualquer mínimo recomendado para texto em tela
(referências de mobile ficam entre 11 e 12 px para texto secundário).
Na mesa única com 6 assentos, o rótulo "ESCOLHENDO" é literalmente
ilegível a um braço de distância.

**Como resolver:** piso de 0,625 rem (10 px) para rótulo decorativo e
0,75 rem (12 px) para qualquer coisa que o jogador precise LER. Onde não
couber, a resposta certa é **remover a informação**, não encolher a fonte
— foi o que fizemos com o rótulo de status do seu próprio lado.

**Impacto depois de pronto.** A mesa de 6 para de parecer "suja". Texto
que não dá para ler não informa nada, mas continua ocupando espaço,
gerando ruído e disputando atenção com as cartas — remover ou aumentar
resolve as duas coisas. Quem joga passa a conseguir acompanhar o estado
dos rivais sem aproximar o celular do rosto, e o jogo fica utilizável
para quem tem qualquer redução de visão, que hoje simplesmente não
enxerga essa camada.

### 2.3 A paleta existe, mas quase ninguém usa

**Medido:** o `@theme` define 12 tokens de cor. O CSS tem **220
ocorrências de hexadecimal literal** (91 distintos) e **321 `rgba()`
escritos à mão**. Os mais repetidos são exatamente os tokens:

```
#f5b76f x23   (= --color-gold)
#fcd9a0 x17   (= --color-gold-bright)
#2a0810 x11   (= --color-arena-900)
#5f1420 x8    (= --color-arena-700)
#cb7349 x6    (= --color-copper)
```

Nos componentes há mais 27 cores arbitrárias no Tailwind (`text-[#7a4503]`,
`border-[#cb7349]/70`…), concentradas em `TournamentMatchScreen`,
`ResultBanner`, `HandsArena`, `MatchmakingOverlay`.

Consequência prática: **recalibrar a marca hoje exige caçar 200+ valores**,
e cada esquecido vira uma peça fora de tom (foi exatamente o que aconteceu
com o relógio da negociação, que tinha uma segunda paleta de brasa).

**Como resolver:** três frentes, da mais barata à mais cara:
1. Trocar os hexadecimais que são cópia exata de token por `var(--…)`.
2. Criar tokens para as tintas "gravadas" que se repetem nos componentes
   (`--ink-win: #7a4503`, `--ink-lose: #8f1616`, `--ink-felt: #123324`),
   hoje espalhadas como cor arbitrária.
3. Criar tokens de alfa para os `rgba()` recorrentes
   (`--gold-a20`, `--ink-a35`…) ou usar `color-mix()`.

**Impacto depois de pronto.** Mudar a identidade do jogo passa a ser
mexer em 12 linhas em vez de caçar 200 valores — e some a classe de bug
que já nos pegou: uma peça esquecida com a paleta antiga, gritando fora
de tom no meio da cena. Isso destrava coisas que hoje nem se cogita:
mesa alternativa (feltro azul, feltro verde), tema sazonal, variação por
torneio, modo de alto contraste. Nada disso é viável enquanto a cor mora
espalhada; com token, cada um vira um bloco de sobrescrita.

### 2.4 Sem escala de raio, sombra e espaçamento

- **Raio:** 14 valores distintos em 79 declarações (0,15 / 0,6 / 0,7 /
  0,75 / 0,8 / 0,9 / 1 / 1,15 / 1,25 rem + `9999px`). Um sistema de 4
  degraus cobriria tudo.
- **Sombra:** cada componente escreve a sua pilha de `box-shadow` (bisel +
  aro + projeção). São variações do mesmo gesto — caberiam em 3 tokens
  (`--shadow-plate`, `--shadow-raised`, `--shadow-glow`).
- **Espaçamento:** paddings ad-hoc (0,12 / 0,18 / 0,2 / 0,22 / 0,28 rem…)
  onde uma escala de 4 px resolveria.

**Impacto depois de pronto.** As peças passam a parecer da mesma família.
Raio e sombra são o que define a "silhueta" do produto: com 14 raios
diferentes, cartas, placas, botões e folhas parecem vir de projetos
distintos colados na mesma tela. Padronizar dá ao jogo aquela sensação de
acabamento caro que não se consegue apontar de onde vem. As sombras em
três degraus também organizam a **elevação** — hoje elementos do mesmo
nível projetam sombras diferentes, e o olho lê isso como profundidade
inconsistente.

### 2.5 Movimento sem vocabulário comum

As durações e curvas são decididas por componente: `0.15s`, `0.2s`,
`0.22s`, `0.25s`, `0.28s`, `0.3s`, `0.35s`, `0.4s`, molas com
`stiffness` de 210 a 520. Existe um `animations/timings.ts` muito bem
documentado para os beats do JOGO, mas nada equivalente para a INTERFACE.

**Como resolver:** três durações (`--dur-fast: 150ms`, `--dur-base: 250ms`,
`--dur-slow: 400ms`) e duas curvas (entrada e saída) como tokens, e uma
mola padrão exportada para o framer-motion.

**Impacto depois de pronto.** A interface passa a ter "uma mão só". Hoje,
quando dois elementos entram juntos com 0,22 s e 0,25 s, o olho percebe o
descompasso mesmo sem conseguir nomeá-lo — é o tipo de coisa que faz um
app parecer amador sem nenhum erro visível. Com o vocabulário fechado, as
animações reforçam umas às outras em vez de brigar. E ganha-se um lugar
único para honrar `prefers-reduced-motion`, que hoje precisaria ser
tratado componente a componente.

---

## 3. Consistência entre telas — ✅ SEÇÃO INTEIRA IMPLEMENTADA

### 3.1 Três telas de desfecho com três tipografias — ✅ FEITO

**O que estava errado.** O jogo terminava uma partida de três jeitos:

| Tela | Componente | Título (antes) |
| --- | --- | --- |
| 1v1 | `ResultBanner` | `.result-title` (fluido, 44–60 px) |
| Torneio (1v1) | `TournamentMatchScreen` | `.result-title` ✔ |
| Mesa única | `TableMatchScreen` | `.table-over__title` (40 px fixo) |

Além do tamanho, cada um tinha estrutura própria de espaçador e de
contagem. O bloco do torneio usava uma técnica engenhosa de "cópias
invisíveis" para centrar o título; a mesa única não usava nada disso.

**O que foi implementado.** Um `<ResultStage>` compartilhado
(`components/ResultStage.tsx`) que os três modos consomem passando só o
conteúdo — veredito, subtítulo, linha de débito, contagem e ações.

1. **A centragem por espelho virou máquina, não artesanato.** O veredito
   precisa cair no meio EXATO da faixa entre o que está acima (as placas
   de placar, ou a mesa) e o botão — e isso não sai de um
   `justify-content: center`, porque o grupo é assimétrico: tem subtítulo
   e débito embaixo do título e nada em cima. O palco resolve gerando
   CÓPIAS INVISÍVEIS de cada linha de baixo, acima do título. Antes elas
   eram escritas à mão, só no torneio, e tinham de repetir as classes da
   linha visível — desalinhavam na primeira vez que alguém mexesse numa
   e esquecesse da outra. Agora saem do mesmo JSX.
2. **Duas superfícies, uma tipografia.** `felt` é o couro claro (tinta
   gravada, e o respiro que desconta a faixa das placas); `overlay` é a
   cortina escura da mesa única (tinta luminosa, sem placa a descontar).
   O que muda entre elas é só a TINTA — tamanho de título, subtítulo,
   débito e contagem são os mesmos.
3. **Uma entrada só**: o mesmo `spring(260, 22)` a partir de `y: 24`,
   onde antes eram dois gestos ligeiramente diferentes.
4. **Token `--engraved-shadow`** para o realce branco do baixo-relevo,
   que estava escrito literal no `.text-engraved` e agora serve as duas
   coisas.
5. `.table-over*` deixou de existir (era ~45 linhas de CSS paralelo).
6. **Testes novos**: dois unitários que travam a máquina de centragem —
   cada linha existe duas vezes, a cópia é `invisible` + `aria-hidden` e
   tem o MESMO texto (senão não teria a mesma altura); e sem subtítulo
   nem débito, o palco não inventa cópia nenhuma. O e2e que mede o
   veredito centrado no torneio continua passando, o que prova que a
   máquina sobreviveu à extração.

**Impacto (já em produção).** O momento mais emocional do jogo passou a
ter um lugar só para ser melhorado: qualquer refino daqui em diante (uma
entrada mais dramática, o brasão ao fundo, o placar animado) chega aos
três modos de uma vez, em vez de exigir três implementações e virar duas
na prática. Foi exatamente isso que tinha acontecido com o ajuste de
centralização do veredito, que valeu para o 1v1 e não para a mesa única —
e que a mesa única agora herdou de graça. O item 1.2 morreu junto, porque
era o mesmo problema visto de outro ângulo.

*Uma mudança visível vale registro:* o "Aposta devolvida" do empate no
1v1 era `1,125 rem` e passou a `0,875 rem`, o tamanho de subtítulo dos
outros dois modos. É a consistência sendo cobrada de quem estava fora da
régua.

### 3.2 Três "pílulas de estado" com desenhos diferentes — ✅ FEITO

**O que estava errado.** Quatro peças com a mesma ideia (identidade +
rótulo + estado) e quatro desenhos:

- `.nego-hud` — o rival na negociação, no topo ao lado do saldo.
- `.table-hud` — a rodada e o bolo na mesa única.
- `.rival-seat__head` — a cabeça do assento na mesa única.
- `BalancePill` — o saldo, em Tailwind inline, sem classe nenhuma.

**O que foi implementado.** Um `<HudPill>` (`components/HudPill.tsx`) com
a casca única e quatro variantes de DENSIDADE — `rival`, `tag`, `value` e
`seat` —, com slots de `leading` (medalhão ou ícone), rótulo e `trailing`
(estado, ponto de presença, coroa).

- O `trailing` entra **cru**, sem embrulho: são quase sempre dois
  elementos que precisam do gap da própria pílula entre si, e um
  contêiner no meio quebraria esse ritmo.
- A variante `seat` é a única **sem casca**: ela já mora dentro do cartão
  do assento, e pílula dentro de pílula leria como caixa dupla. O que ela
  herda é o ritmo (gap, truncagem do nome, slot de estado).
- O `BalancePill` continua sendo o único que anima (a pílula pulsa e a
  ficha de variação voa para dentro dela); por isso o `HudPill` é um
  `motion.div` que aceita `animate`/`transition` — sem eles, é um div.
- Sumiram do CSS: `.nego-hud*` (12 regras), `.table-hud*` e
  `.rival-seat__head/__badge/__name`. O keyframe do ponto virou
  `hud-pill-call`.

**Impacto (já em produção).** O topo da tela parou de parecer montado por
quatro pessoas diferentes: o jogador atravessa negociação, duelo e mesa
única sem que a "linguagem do HUD" mude embaixo dele, o que reduz o
esforço de reaprender cada tela. Do lado do código, virou o lugar único
onde aplicar os tokens de cor (2.3) e o tamanho de fonte da escala (2.1)
— dois itens deste documento que ficaram bem mais baratos nessa família.

### 3.3 Dois "arenas" com código paralelo — ✅ FEITO

**O que estava errado.** `HandsArena` (1v1 e torneio) e `TableArena`
(mesa única) repetiam `HandRow`, leitura de total com `+?`, POV da última
carta e placa de nome. A duplicação já tinha cobrado o seu preço: a
correção do rótulo "TEMPO — PAROU" valeu só para o 1v1.

**O que foi implementado.** `components/table/`, consumido pelos dois:

1. **`HandRow`** — a fileira de cartas, com `cardSize`, `mini` (o aperto
   das mãos de rival) e `align` (o duelo CENTRA, porque as duas mãos são
   espelho em torno do brasão; a mesa única assenta na BASE, porque a
   fileira de assentos precisa de uma linha de chão comum). As
   geometrias das arenas continuam legitimamente diferentes — o que
   deixou de ser diferente é a mão.
2. **`HandTotal`** — o total, com as variantes `duel` e `seat`. As duas
   famílias de classe continuam (tamanhos e posições são próprios); o que
   passou a ser único é a LÓGICA: a leitura soft, o piso de estouro e o
   `+?`.
3. **`povHand`** — **a regra de POV, num arquivo só.** É a única regra do
   jogo cuja violação não dá erro, não quebra teste de layout e não
   aparece em lugar nenhum além da tela do jogador: ela simplesmente
   entrega de graça a informação que decide o duelo. Duas implementações
   de um segredo é uma a mais.

**Impacto (já em produção).** Correção feita uma vez passa a valer nos
dois modos — antes toda melhoria na mão de cartas tinha custo dobrado e,
na prática, só metade era feita. E o risco que sumiu é o mais caro do
projeto: enquanto o corte da carta oculta estava escrito duas vezes,
qualquer divergência entre as duas cópias era um vazamento de informação
sigilosa direto na tela do jogador, silencioso e sem sintoma até alguém
perceber que dá para ver a mão do rival.

---

## 4. Acessibilidade

### 4.1 Metade dos controles não tinha anel de foco — ✅ FEITO

**Onde:** `src/index.css` (bloco compartilhado, logo abaixo do `.btn`) e a
classe `.focus-ring` nos componentes.

**O que estava errado.** O CSS tinha **7 regras `focus-visible`**,
escritas uma a uma pelos componentes que lembraram. Ficavam de fora os
botões redondos de ícone (voltar, ajustes, engrenagem, fechar folha), os
segmentados, o × de expulsar, o enviar do chat, o cartão de sala, as
ações do perfil e os controles de áudio. Quem navega por teclado (ou por
controle, num futuro TV/desktop) atravessava metade do jogo às cegas.

**O que foi implementado.**

1. **Um bloco só de anel de foco**, no lugar da regra solitária do
   `.btn`: `outline: 2px solid var(--color-gold)` com `outline-offset:
   2px`. O hexadecimal cru que estava ali (`#f5b76f`) virou token de
   caminho — um empurrãozinho de graça no item 2.3.
2. **Consolidação das cópias**: `.prop-bubble__choice`,
   `.amount-stepper__bump` e `.lobby-seat__open` mantinham cada um a sua
   versão da mesma regra. Agora todas moram no bloco compartilhado; o
   assento do lobby continua com afastamento de 3px e raio próprio,
   documentado ali como a única exceção.
3. **Seletores que passaram a ter anel**: `.seg__btn`, `.lobby-card`,
   `.lobby-seat__kick`, `.lobby-chat__send`, `.profile-close` e
   `.profile-action`.
4. **Classe `.focus-ring`** para o que é montado com utilitário do
   Tailwind em vez de classe de componente — aplicada nos **6 redondos de
   ícone** (fechar folha, ajustes da Home, sair do chaveamento, voltar da
   lista de salas, sair da sala e detalhes da sala), nos **5 botões do
   DevTools**, nos **3 do segmentado de cenário**, no link de perfil da
   tela de confirmação e nos **4 controles de ajustes** (silenciar,
   vibração e os dois volumes, que até então dependiam do anel padrão do
   navegador — de estilo `auto`, não `solid`, e portanto fora do padrão
   da casa).
5. **Comentário de contrato** no bloco: controle novo entra ali, ou ganha
   `.focus-ring`. É o que impede a dispersão de voltar.
6. **Teste e2e novo** — `foco de teclado: todo controle acende o anel
   âmbar`: navega por Tab pela Home e pela folha de ajustes e cobra
   `outline` sólido de ≥ 2px de cada controle focado, com um piso de
   quantos precisam ser conferidos (um teste de Tab que não sai do lugar
   passaria sem testar nada). Verifiquei que ele **reprova** com o
   seletor desligado, apontando o botão de Ajustes pelo nome.

**Impacto depois de pronto.** O jogo passa a ser jogável sem toque —
teclado hoje, controle amanhã, se um dia virar desktop ou TV. Para quem
depende de teclado por deficiência motora, é a diferença entre usar e não
usar o produto. O custo visual é zero para todo mundo: `focus-visible` só
acende quando a navegação foi por teclado, o dedo continua sem ver nada.
Também é item obrigatório em qualquer revisão de acessibilidade de loja
de aplicativos.

### 4.2 Rótulo em elemento sem papel — ✅ FEITO

**O que estava errado.** Vários `aria-label` em `<span>`/`<div>` sem
`role`, onde a especificação ARIA **proíbe nome acessível** — o leitor de
tela simplesmente descarta.

**O que foi implementado.** Os cinco casos que ainda existiam ganharam
`role="img"`:

- o **indicador de passo** do tutorial (as bolinhas são `aria-hidden`, então
  o rótulo era a única voz que aquilo tinha);
- a **coroa do anfitrião** no assento do lobby;
- a **coroa de vencedor** no assento da mesa única;
- o **selo V/D/E** de cada linha do histórico (a letra sozinha não diz nada
  em voz alta);
- a **pílula de HUD**, que cobre o saldo e o rival da negociação.

Na pílula a correção mora no COMPONENTE, não em cada chamada: `HudPill`
resolve `role="img"` sozinho sempre que recebe um `aria-label` sem papel
explícito. É exatamente o tipo de detalhe que se esquece, e a falha é
silenciosa para quem enxerga.

**Correção do diagnóstico:** este documento citava o `FoundSplash` como
um dos pontos afetados. Ele não tem `aria-label` nenhum — o container já
usa `role="status"`. O apontamento estava errado.

**Guarda contra o retorno.** Um teste novo varre a árvore renderizada
(Home, tutorial e histórico, cheio e vazio) atrás de `[aria-label]` sem
`role` em marcação que não admite nome, e falha listando cada ofensor. Ele
tem um piso de quantos rótulos precisa ter olhado, para não passar por não
ter olhado nada — verifiquei que ele **reprova** com a correção da pílula
desligada, apontando `div[aria-label="Saldo: 1.000 créditos"]`.

**Impacto (já em produção).** O rótulo saiu do "escrito mas mudo" para
"efetivamente falado". Quem usa leitor de tela atravessava esses elementos
em silêncio — informação que o código achava que estava entregando e não
estava. É a pior classe de bug de acessibilidade justamente porque não dá
erro, não quebra teste e não muda um pixel; agora existe uma varredura que
o denuncia.

### 4.3 Contraste do texto sobre o feltro

O texto "gravado" sobre o couro claro usa tintas escuras (`#123324`,
`#2a1f12`) com `text-shadow` branco. Funciona, mas os secundários
(`#4a3826` sobre `#d9bd90`) ficam perto do limite de 4,5:1. Vale medir
com uma ferramenta e escurecer o que não passar.

**Impacto depois de pronto.** O texto gravado é a primeira coisa que
some ao sol ou numa tela barata com brilho baixo — exatamente as
condições em que um jogo de celular costuma ser jogado. Ajustar a tinta é
uma mudança quase imperceptível no ambiente ideal e decisiva fora dele.
Como se mexe só na tinta, o efeito de gravação no couro (que é uma das
melhores ideias visuais do projeto) fica intacto.

### 4.4 Alvos de toque — ✅ FEITO

**O que estava errado.** `.lobby-seat__kick` (o × de expulsar) tinha 20 px
de selo, abaixo dos 44 px recomendados; os atalhos `+10/+100` do stepper
acompanhavam a altura do campo (~37 px) e o `+10` mal passava de 42 px de
largura.

**O que foi implementado.** Um `::after` esticado em cada um — o desenho
não mudou um pixel, só a área que recebe o toque.

No × de expulsar a folga é **assimétrica**, e isso é o miolo da correção:
ela cresce para DENTRO do próprio assento (embaixo e à esquerda, onde só
existe canto vazio) e quase nada para fora. O vão entre assentos é de 8 px,
e esticar para lá roubaria o toque do vizinho — errar no × só abre a
confirmação de expulsar, que se cancela; errar para o lado abriria o perfil
de outra pessoa.

**Como isso foi testado.** Pseudo-elemento não se mede com
`getBoundingClientRect`. Quem responde "quem recebe este toque?" é o
`elementFromPoint`, e é assim que os dois e2e novos verificam: sondam
pontos além do selo e cobram que o botão os receba — e, no caso do ×,
cobram também que um ponto 30 px à esquerda **não** seja mais dele.

**Fora de escopo, e por quê:** o documento perguntava se `.rival-seat` da
mesa única de 6 é clicável. Não é — não há o que corrigir ali.

**Impacto (já em produção).** Menos toque errado nas duas ações em que
errar dói: expulsar um jogador e o stepper da aposta, onde um toque a mais
muda o valor do duelo. É o tipo de melhoria que ninguém elogia e todo mundo
sente — o jogo simplesmente passa a "responder direito".

---

## 5. Beleza — o que elevaria o acabamento

Estas são as oportunidades de "deixar mais bonito" propriamente ditas.

### 5.1 O histórico é a tela mais pobre do jogo

**Onde:** `HistorySheet.tsx`

Num jogo com brasão gravado, cartas em 3D e letreiros dourados, o
histórico é uma lista de retângulos com borda de 1 px e um badge circular
"V / D / E". Não tem nada da casa.

**Ideias:** tratar como **extrato do clube** — cada linha com o medalhão
do adversário (o `AvatarBadge` já existe), o placar em algarismos
tabulares grandes, a variação em ouro/vermelho gravado, e um cabeçalho com
o saldo do período. Um filete dourado separando os dias.

**Já andou metade do caminho:** o item 5.2 deu ao histórico VAZIO a cara
da casa (brasão em marca d'água e um caminho de saída). O que continua
pobre é a lista CHEIA — que é o que este item trata. A expressão "extrato
do clube" já está no texto do vazio, à espera da lista corresponder.

**Impacto depois de pronto.** O histórico é a tela que o jogador visita
entre partidas, quando está decidindo se joga de novo — e hoje é
justamente ela que quebra o encanto construído na mesa. Transformá-la em
extrato do clube dá a sensação de **progressão**: as partidas viram
patrimônio, não linhas de log. Também é a tela onde a fidelidade se
sustenta; ninguém volta para olhar retângulo cinza, mas todo mundo volta
para ver o próprio saldo subir.

### 5.2 Estados vazios sem personalidade — ✅ FEITO

**O que estava errado.** "Nenhuma rodada jogada ainda. Bora pro primeiro
duelo?" era um parágrafo cinza centralizado. A lista de salas vazia não
mostrava nada — sumia em silêncio.

**O que foi implementado.** Um `<EmptyState>`
(`components/EmptyState.tsx`) com o **brasão da casa em marca d'água**,
manchete, texto e CTA opcional.

O brasão vem por `mask-image` do MESMO SVG do couro da mesa e do verso das
cartas, em ouro apagado a 22% — é presença, não ilustração: fica no
limiar do perceptível, como o relevo do feltro.

Duas decisões de conteúdo:

- **O histórico ganha CTA** ("JOGAR AGORA"), porque o vazio dali é um beco
  — não há botão nenhum naquela folha. Ele fecha a folha e já procura
  oponente, o mesmo caminho do botão de jogar da Home.
- **A lista de salas não ganha**, porque o "CRIAR SALA" está a poucos
  pixels acima e dois convites idênticos na mesma tela viram ruído. O
  texto aponta para o botão que já existe.

**Impacto (já em produção).** O estado vazio é visto exatamente por quem
acabou de instalar — a hora em que o jogo tem uma chance só de parecer
acabado. O primeiro contato com o histórico e com a lista de salas era uma
tela quase em branco, que lia como "produto sem conteúdo". Com o brasão e
um caminho de saída, o vazio virou convite: em vez de um beco, o jogador
sai com um botão na mão.

*Duplicação assumida:* a constante do caminho do brasão agora existe em
três arquivos (`Card3D`, `TableCrest` e `EmptyState`). Unificá-la estava
fora do escopo desta mudança e fica registrada aqui.

### 5.3 A crupiê é subaproveitada

Existe um rig de dealer com reações (`greet`, `present`, `celebrate`,
`console`, `shrug`, `anticipate`, `shake`) e um controlador dedicado. Ela
reage bem no duelo, mas fica parada no lobby, no chaveamento e na
coroação.

**Ideias:** ela cumprimentar ao entrar na sala, aplaudir o campeão na
`ChampionScreen`, "apresentar" o chaveamento. Custo baixo (a máquina já
existe), ganho grande de vida.

**Impacto depois de pronto.** É o melhor retorno por hora de trabalho da
seção: as reações já estão construídas e testadas, falta só acioná-las.
A presença da crupiê é o que separa "aplicativo de cartas" de "cassino" —
ter alguém do outro lado da mesa reagindo ao que você faz muda a
temperatura emocional do jogo. Hoje o jogador atravessa lobby,
chaveamento e coroação num vazio; ativá-la nesses momentos faz o produto
inteiro parecer habitado.

### 5.4 A mesa única pede um "pote" no centro

O feltro da mesa única tem um miolo vazio grande (o brasão). Numa mesa
real, é ali que ficam as fichas apostadas. Hoje o valor do bolo mora numa
pílula no topo.

**Ideias:** reaproveitar a `ChipStack` da negociação como **pote no centro
do feltro**, crescendo a cada rodada. Fecha o vocabulário: as fichas que a
negociação põe na mesa são as mesmas que o pote guarda.

**Impacto depois de pronto.** A mesa ganha um centro. Hoje o miolo é
espaço morto e a informação mais tensa da partida — quanto está em jogo —
vive num canto, lida como dado. Como pilha de fichas crescendo, ela vira
**imagem**: o jogador sente o pote engordar a cada rodada em vez de ler
um número. E fecha o vocabulário aberto na negociação: a ficha que você
empurrou para a mesa é a mesma que está lá no meio, o que dá continuidade
narrativa ao modo inteiro.

### 5.5 Transições entre telas são sempre iguais

Todas as trocas de fase usam o mesmo `opacity + y: 10px, 0.22s`. Momentos
de peso diferente (entrar na mesa, ser eliminado, ser coroado) merecem
gestos diferentes.

**Ideias:** corte de câmera para a mesa (a `TableScene` já faz isso entre
frontal e vertical — dá para estender), escurecimento para a coroação.

**Impacto depois de pronto.** O torneio ganha arco dramático. Hoje ser
eliminado e abrir a folha de ajustes têm exatamente a mesma animação, o
que achata a hierarquia: nada parece grande porque tudo é igual.
Diferenciar os gestos faz a coroação parecer coroação e a eliminação
doer — e é isso que dá vontade de jogar de novo. Boa parte da máquina já
existe (a `TableScene` já corta entre câmeras), então é mais orquestração
do que construção.

### 5.6 O logotipo só existe na Home

O bloco `BLACK / JACK / ARENA` ficou bonito e some no resto do jogo. A
tela de coroação e a folha de tutorial poderiam trazê-lo em versão
reduzida, como assinatura.

**Impacto depois de pronto.** A marca passa a assinar os momentos que o
jogador fotografa e compartilha — a coroação, principalmente. Um
logotipo que aparece uma vez e some não constrói memória; repetido com
parcimônia nos pontos altos, ele transforma o jogo em algo com nome, não
"aquele blackjack que eu joguei". Custo praticamente zero: o bloco já
está construído, é só reduzi-lo.

### 5.7 Sem tela de carregamento

O fundo tem 217 KB e é pré-carregado com prioridade alta, mas não há
splash: numa conexão ruim o jogador vê a cor de fundo chapada e os botões
antes da foto entrar.

**Ideias:** um splash de marca de 400 ms com o brasão, cobrindo a chegada
do fundo. Também resolve o "pop" da fonte Oswald.

**Impacto depois de pronto.** Elimina a montagem visível do primeiro
quadro — os segundos em que o jogo se monta na frente do jogador e
parece quebrado, justamente na primeira impressão. Com o splash, a
primeira coisa vista é a marca, e a cena aparece pronta. Também esconde o
pop da fonte Oswald, que hoje faz o título saltar quando a fonte chega.
Em conexão boa ninguém vê o splash; em conexão ruim ele salva a abertura.

---

## 6. Saúde do código (com efeito no design)

### 6.1 `index.css` tem 4.961 linhas — e um pouco de código morto

Um arquivo único com tudo: tokens, cenário, cartas, botões, mesa,
negociação, torneio, mesa única, folhas. Achar "onde mexo para mudar X"
custa caro, e é isso que faz nascerem valores novos em vez de reusar os
existentes (ver seção 2).

**Nota honesta:** o arquivo CRESCEU 199 linhas com as seções 3 e 4-5,
não encolheu. Saíram ~140 linhas de CSS paralelo (`.table-over*`,
`.nego-hud*`, `.table-hud*`, `.rival-seat__head/__badge/__name`) e
entraram duas famílias compartilhadas (`.result-stage` e `.hud-pill`) com
o comentário que explica por que existem. O que diminuiu foi o número de
FAMÍLIAS a conhecer — de seis para duas —, não o de linhas. É o trade que
vale a pena aqui, mas não vamos chamá-lo de redução.

**Como resolver:** quebrar por domínio com `@import` do Tailwind v4 —
`tokens.css`, `base.css`, `scene.css`, `cards.css`, `table.css`,
`tournament.css`, `sheets.css`. Mudança mecânica, sem risco visual, e é o
que torna as seções 2.1–2.4 viáveis.

**Impacto depois de pronto.** Nenhum pixel muda — o impacto é sobre todo
o resto do documento. Os itens 2.1 a 2.4 são impraticáveis num arquivo de
4.762 linhas: ninguém audita 105 declarações de `font-size` espalhadas
por nove domínios. Quebrado por domínio, cada migração vira uma tarefa
pequena e verificável. E ataca a **causa** da proliferação de valores: o
valor novo nasce porque procurar o existente custa caro demais; num
arquivo de 300 linhas, reusar passa a ser mais barato que inventar.

### 6.2 Prettier não roda no repositório

`npx prettier --check` acusa 29 arquivos fora de formato, incluindo
arquivos que ninguém tocou nesta rodada. O `npm run lint` só roda ESLint.

**Como resolver:** decidir — ou formatar tudo de uma vez e ligar o
`--check` no CI, ou remover o Prettier da lista de dependências. O estado
atual (configurado, ignorado) só gera ruído em diff.

**Impacto depois de pronto.** Os diffs passam a mostrar só mudança de
intenção, sem reformatação parasita — o que torna a revisão (a sua e a
minha) confiável de verdade. Hoje, um arquivo que "mudou" pode ter mudado
só de aspas, e isso esconde alteração real no meio do ruído. Qualquer das
duas decisões resolve; o que não funciona é o estado atual, de ferramenta
configurada e ignorada.

### 6.3 Sem manifesto PWA

Existe `theme-color` e favicon SVG, mas não há `manifest.webmanifest` nem
`apple-touch-icon`. Num jogo mobile, "adicionar à tela de início" é
praticamente grátis e muda a percepção de produto.

**Impacto depois de pronto.** O jogo deixa de ser "um site que eu abro" e
vira ícone na tela inicial, abrindo em tela cheia sem a barra do
navegador — que é justamente a moldura que denuncia que aquilo não é um
app. Muda a percepção de produto por algumas dezenas de linhas de JSON e
um par de ícones. Também é pré-requisito de qualquer passo futuro
(instalação, notificação, jogo offline).

---

## 7. Ordem sugerida

**Semana 1 — correções baratas de alto retorno**
~~1.1 (tutorial)~~ ✅ · ~~4.1 (foco de teclado)~~ ✅ · ~~1.2 (título da
mesa única)~~ ✅ (por 3.1) · 1.3 (CSS morto) · 1.4 (gitignore) · 2.2
(piso de tamanho de fonte).

**Acessibilidade e acabamento** — ✅ feitos
~~4.2 (rótulos mudos) · 4.4 (alvos de toque) · 5.2 (estados vazios)~~.
Restam da acessibilidade o 4.3 (contraste), que precisa de medição com
ferramenta.

**Semana 2 — fundação**
6.1 (quebrar o CSS) e, sobre ele, 2.1 (escala tipográfica) e 2.3 (tokens
de cor). É a dupla que impede o problema de voltar.

**Semana 3 — consistência** — ✅ feita
~~3.1 (`ResultStage`) · 3.2 (`HudPill`) · 3.3 (`HandRow` compartilhado)~~.
Feita antes da fundação, o que barateou a semana 2: as três famílias
novas (`.result-stage`, `.hud-pill`, `components/table/`) são hoje um
lugar só para receber a escala tipográfica e os tokens de cor.

**Depois — beleza**
5.1 (histórico) · 5.3 (crupiê) · 5.4 (pote na mesa única) · 5.7 (splash).

---

## 8. O que está muito bom (não mexer)

Para calibrar: estas decisões são acima da média e devem ser preservadas
como referência ao mexer no resto.

- **Geometria da cena derivada de uma variável só** (`--dealer-h`): mesa,
  crupiê, placas e brasão saem dela. É o que permitiu ajustar o placar do
  desfecho sem quebrar nada.
- **Regra de POV da última carta**, estrutural na engine — a UI não tem
  como vazar a informação nem por engano.
- **Alturas reservadas** (`--arena-actions-h`, `--nego-actions-h`): as
  barras entram e saem sem mover o resto. Idioma consistente e raro.
- **Comentários que explicam o PORQUÊ**, não o quê. O CSS documenta
  decisões de design (por que a placa e não tinta direto no couro, por que
  o `translate` antes do `transform`) — isso é patrimônio do projeto.
- **Cobertura de teste do que é regra**: 341 unitários e 16 e2e, com os
  testes de regra de jogo (empate, desempate, POV) escritos como
  especificação legível.
