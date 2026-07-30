# Melhorias — análise de design e código

> Análise feita lendo o código em 30/07/2026, com foco em **design**:
> o que está errado, o que falta de fundação e o que deixaria o jogo mais
> bonito. Cada item traz **onde está**, **por que importa**, **como
> resolver** e **o impacto depois de pronto**.
>
> Os números citados (contagens, tamanhos, medidas) foram medidos no
> código e no app rodando, não estimados.
>
> **Estado da implementação:** apenas o item **1.1** foi implementado
> (30/07/2026). Todo o resto continua sendo proposta — nada mais foi
> tocado.

---

## Sumário — o que eu faria primeiro

| # | Item | Impacto | Esforço | Estado |
| --- | --- | :-: | :-: | :-: |
| 1 | [Tutorial fala de um chat que não existe mais](#11-o-tutorial-descrevia-uma-tela-que-não-existe-mais--feito) | 🔴 Alto | 5 min | ✅ Feito |
| 2 | [Escala tipográfica: 52 tamanhos diferentes](#21-tipografia-52-tamanhos-para-105-declarações) | 🔴 Alto | 3–4 h | — |
| 3 | [Foco de teclado ausente em metade dos controles](#41-metade-dos-controles-não-tem-anel-de-foco) | 🔴 Alto | 1 h | — |
| 4 | [Três vereditos de fim de partida, três desenhos](#31-três-telas-de-desfecho-com-três-tipografias) | 🟡 Médio | 1–2 h | — |
| 5 | [Tipos de 7,7px ilegíveis na mesa única](#22-tipo-abaixo-do-legível) | 🟡 Médio | 30 min | — |
| 6 | [Tokens de cor contornados em 216 lugares](#23-a-paleta-existe-mas-quase-ninguém-usa) | 🟡 Médio | 2–3 h | — |
| 7 | [Histórico e ajustes não têm a identidade do clube](#51-o-histórico-é-a-tela-mais-pobre-do-jogo) | 🟢 Beleza | 2 h | — |
| 8 | [CSS morto e um arquivo de 4.762 linhas](#61-índexcss-tem-4762-linhas-e-um-pouco-de-código-morto) | 🟢 Saúde | 1–3 h | — |

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

### 1.2 O veredito da mesa única não usa a tipografia dos outros

**Onde:** `src/index.css` → `.table-over__title` (2,5 rem fixo) contra
`.result-title` (`clamp(2.75rem, 12vw, 3.75rem)`).

O 1v1 e a partida do torneio já compartilham `.result-title`. A mesa única
tem um título próprio, menor e sem a escala fluida — o mesmo momento do
jogo ("ganhei ou perdi") tem dois pesos diferentes conforme o modo.

**Como resolver:** aplicar `.result-title` no `.table-over__title`.

**Impacto depois de pronto.** O clímax do jogo passa a ter o mesmo peso
nos três modos: a mesa única para de parecer a tela "de segunda" do
produto. Como bônus técnico, a troca do tamanho fixo pelo `clamp` faz o
título sobreviver a telas de 320 px sem quebrar linha e crescer em telas
largas — hoje ele fica pequeno demais no celular grande e apertado no
pequeno.

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
morreu. Cada bloco morto num arquivo de 4.762 linhas é um falso positivo
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

### 2.1 Tipografia: 52 tamanhos para 105 declarações

**Medido:** o `index.css` declara `font-size` 105 vezes, com **52 valores
distintos**. Só entre 0,48 rem e 0,95 rem existem **vinte e um** valores:

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

**Medido:** o `@theme` define 12 tokens de cor. O CSS tem **216
ocorrências de hexadecimal literal** (83 distintos) e **322 `rgba()`
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

## 3. Consistência entre telas

### 3.1 Três telas de desfecho com três tipografias

O jogo termina uma partida de três jeitos diferentes:

| Tela | Componente | Título |
| --- | --- | --- |
| 1v1 | `ResultBanner` | `.result-title` (fluido, 44–60 px) |
| Torneio (1v1) | `TournamentMatchScreen` | `.result-title` ✔ |
| Mesa única | `TableMatchScreen` | `.table-over__title` (40 px fixo) |

Além do tamanho, os três têm estruturas próprias de espaçador e de
contagem regressiva. O bloco do torneio usa uma técnica engenhosa de
"cópias invisíveis" para centrar o título; a mesa única não usa nada
disso.

**Como resolver:** extrair um `<ResultStage>` compartilhado (título,
subtítulo, linha de débito, contagem, ações) e deixar cada modo passar só
o conteúdo. Elimina a divergência na origem.

**Impacto depois de pronto.** O momento mais emocional do jogo passa a
ter um lugar só para ser melhorado — qualquer refino (uma entrada mais
dramática, o brasão ao fundo, o placar animado) chega aos três modos de
uma vez, em vez de exigir três implementações e virar duas na prática.
Foi exatamente isso que aconteceu com o ajuste de centralização do
veredito: ele valeu para o 1v1 e não para a mesa única. Com o
`ResultStage`, a mesa única herda de graça a técnica de centragem que já
funciona no torneio.

### 3.2 Três "pílulas de estado" com desenhos diferentes

- `.nego-hud` — o rival na negociação (topo, ao lado do saldo).
- `.table-hud` — a rodada e o bolo na mesa única.
- `.rival-seat__head` — o assento na mesa única.

São a mesma ideia (identidade + estado) em três desenhos. A pílula do
saldo (`BalancePill`) é uma quarta variação, em Tailwind inline.

**Como resolver:** um componente `<HudPill>` com variantes. Ganho duplo:
consistência e um lugar só para o foco de teclado (ver 4.1).

**Impacto depois de pronto.** O topo da tela para de parecer montado por
quatro pessoas diferentes: o jogador atravessa negociação, duelo e mesa
única sem que a "linguagem do HUD" mude embaixo dele, o que reduz o
esforço de reaprender cada tela. Do lado do código, vira o lugar único
onde aplicar o anel de foco (4.1), os tokens de cor (2.3) e o tamanho de
fonte da escala (2.1) — três itens deste documento resolvidos de uma vez
nessa família de componentes.

### 3.3 Dois "arenas" com código paralelo

`HandsArena` (1v1 e torneio) e `TableArena` (mesa única) repetem
`HandRow`, leitura de total com `+?`, POV da última carta e placa de nome.
A duplicação já cobrou o seu preço: a correção do rótulo "TEMPO — PAROU"
valeu só para o 1v1, porque a mesa única nem tem essa linha.

**Como resolver:** extrair `HandRow` e `HandTotal` para
`components/table/` e consumir nos dois. Não vale unificar os arenas
inteiros — as geometrias são legitimamente diferentes.

**Impacto depois de pronto.** Correção feita uma vez passa a valer nos
dois modos — hoje toda melhoria na mão de cartas tem custo dobrado e, na
prática, só metade é feita. Mais importante: a **regra de POV** (a última
carta do rival virada para baixo) passa a morar num componente só. Hoje
ela está implementada duas vezes; qualquer divergência entre as duas
implementações é um vazamento de informação sigilosa direto na tela, que
é o pior bug possível neste jogo.

---

## 4. Acessibilidade

### 4.1 Metade dos controles não tem anel de foco

**Medido:** o CSS tem **7 regras `focus-visible`**. Ficam de fora:

- Os **9 botões redondos de ícone** (voltar, ajustes, engrenagem, fechar
  folha) — só têm `active:brightness-125`, que não existe para teclado.
  Aparecem em `GameScreen`, `HomeScreen`, `BracketScreen`,
  `LobbyBrowseScreen`, `LobbyScreen` (×2) e `Sheet`.
- `.seg__btn` — os segmentados de visibilidade, formato e nº de jogadores.
- `.lobby-seat__kick`, `.lobby-chat__send`, os botões do DevTools.

Quem navega por teclado (ou por controle, num futuro TV/desktop) fica sem
saber onde está.

**Como resolver:** um mixin de foco aplicado a todos eles — o projeto já
tem o padrão certo em `.btn:focus-visible` (`outline: 2px solid` âmbar,
`outline-offset: 2px`). Reaproveitar.

**Impacto depois de pronto.** O jogo passa a ser jogável sem toque —
teclado hoje, controle amanhã, se um dia virar desktop ou TV. Para quem
depende de teclado por deficiência motora, é a diferença entre usar e não
usar o produto. O custo visual é zero para todo mundo: `focus-visible` só
acende quando a navegação foi por teclado, o dedo continua sem ver nada.
Também é item obrigatório em qualquer revisão de acessibilidade de loja
de aplicativos.

### 4.2 Rótulo em elemento sem papel

Vários `aria-label` estão em `<span>`/`<div>` sem `role`, onde a
especificação ARIA **proíbe nome acessível** — o leitor de tela
simplesmente descarta. Já corrigimos dois casos (a pilha de fichas e o
contador de vitórias); o padrão ainda aparece em outros pontos
(`FoundSplash`, `TutorialSheet` no indicador de passo).

**Como resolver:** `role="img"` ou `role="group"` junto do `aria-label`,
ou trocar por texto em `.sr-only`.

**Impacto depois de pronto.** O rótulo sai do "escrito mas mudo" para
"efetivamente falado". Hoje, quem usa leitor de tela atravessa esses
elementos em silêncio — informação que o código acha que está entregando
e não está. É uma correção de poucas linhas que transforma trechos
inertes em conteúdo real, sem alterar um pixel para quem enxerga.

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

### 4.4 Alvos de toque

`.rival-seat` na mesa única de 6 é clicável? Não — mas `.lobby-seat__kick`
(o × de expulsar) tem ~20 px, abaixo dos 44 px recomendados. O mesmo vale
para os `+10/+100` do stepper em telas estreitas.

**Como resolver:** manter o desenho e aumentar só a área tocável (padding
transparente ou `::after` esticado), preservando a aparência atual.

**Impacto depois de pronto.** Menos toque errado nas duas ações em que
errar dói: expulsar um jogador (irreversível, e o alvo tem 20 px) e o
stepper da aposta (um toque a mais muda o valor do duelo). Aumentar a
área sem mexer no desenho é o tipo de melhoria que ninguém elogia e todo
mundo sente — o jogo simplesmente passa a "responder direito".

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

**Impacto depois de pronto.** O histórico é a tela que o jogador visita
entre partidas, quando está decidindo se joga de novo — e hoje é
justamente ela que quebra o encanto construído na mesa. Transformá-la em
extrato do clube dá a sensação de **progressão**: as partidas viram
patrimônio, não linhas de log. Também é a tela onde a fidelidade se
sustenta; ninguém volta para olhar retângulo cinza, mas todo mundo volta
para ver o próprio saldo subir.

### 5.2 Estados vazios sem personalidade

"Nenhuma rodada jogada ainda. Bora pro primeiro duelo?" é um parágrafo
cinza centralizado. O mesmo vale para a lista de salas vazia.

**Ideias:** ilustração leve (o brasão em marca d'água, um baralho fechado)
+ CTA. O jogo já tem os elementos gráficos; falta usá-los aqui.

**Impacto depois de pronto.** O estado vazio é visto exatamente por quem
acabou de instalar — a hora em que o jogo tem uma chance só de parecer
acabado. Hoje o primeiro contato com o histórico e com a lista de salas é
uma tela quase em branco, que lê como "produto sem conteúdo". Com o
brasão e um CTA, o vazio vira convite, e ainda aponta o caminho: em vez
de um beco, o jogador sai com um botão na mão.

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

### 6.1 `index.css` tem 4.762 linhas — e um pouco de código morto

Um arquivo único com tudo: tokens, cenário, cartas, botões, mesa,
negociação, torneio, mesa única, folhas. Achar "onde mexo para mudar X"
custa caro, e é isso que faz nascerem valores novos em vez de reusar os
existentes (ver seção 2).

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
~~1.1 (tutorial)~~ ✅ feito · 1.2 (título da mesa única) · 1.3 (CSS morto)
· 1.4 (gitignore) · 4.1 (foco de teclado) · 2.2 (piso de tamanho de
fonte).

**Semana 2 — fundação**
6.1 (quebrar o CSS) e, sobre ele, 2.1 (escala tipográfica) e 2.3 (tokens
de cor). É a dupla que impede o problema de voltar.

**Semana 3 — consistência**
3.1 (`ResultStage`) · 3.2 (`HudPill`) · 3.3 (`HandRow` compartilhado).

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
- **Cobertura de teste do que é regra**: 335 unitários e 13 e2e, com os
  testes de regra de jogo (empate, desempate, POV) escritos como
  especificação legível.
