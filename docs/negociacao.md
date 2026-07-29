# Negociação da aposta — alternativas ao chat

> Documento de decisão. O diretor pediu que **a aposta seja negociada entre os
> jogadores**. Este texto separa o *requisito* (negociar) da *implementação atual*
> (um chat), e apresenta oito caminhos para cumprir o requisito sem uma tela de
> conversa ocupando a mesa.

---

## 1. O pedido e o problema

O requisito do diretor é legítimo e é o coração do modo 1v1: **o valor do duelo
não é escolhido por um dos lados, ele é acordado pelos dois.** Isso é o que separa
este jogo de um blackjack contra a casa — a aposta é a primeira mão do duelo.

O que está no ar hoje ([NegotiationPanel.tsx](../src/features/bac-bo/components/NegotiationPanel.tsx))
cumpre o requisito, mas paga caro por ele:

| Sintoma | Por quê |
| --- | --- |
| **A tela vira um mensageiro** | Cabeçalho com presença, log rolável, "digitando…", bolhas, composer. É a anatomia do WhatsApp, não de uma mesa de carteado. |
| **Carga de leitura antes de jogar** | Aviso do sistema + cumprimento + proposta + contraproposta + quip. São ~4 blocos de texto para chegar a um número. |
| **Latência teatral** | [`BOT_BEATS`](../src/features/bac-bo/store/negotiation.ts) soma até **6,3 s só na abertura** (cumprimento + proposta) e até **3,6 s por resposta**. O delay é fingido para parecer humano — e o jogador paga em espera real. |
| **O salão some** | A negociação é uma fase inteira ([`'negotiate'`](../src/features/bac-bo/store/gameStore.ts)) com um painel de vidro cobrindo o feltro. A mesa fica de fundo decorativo. |
| **Texto que não decide nada** | As falas (`GREETINGS`, `COUNTER_QUIPS`) não mudam o resultado — são ruído sobre o único dado que importa: o número. |
| **Custo de tradução e moderação** | Todo texto é conteúdo: precisa de i18n, revisão de tom e, num online real com chat livre, moderação. |

**O diagnóstico em uma frase:** *negociar não é conversar.* A conversa foi uma
metáfora escolhida para a negociação; o requisito sobrevive inteiro sem ela.

---

## 2. O que negociar realmente exige

Reduzido ao osso, um acordo de aposta precisa de **quatro coisas** — e só:

1. **Cada lado expressa um valor** (ou aceita o do outro).
2. **Uma regra de convergência** (o que acontece quando os valores diferem).
3. **Um consentimento explícito dos dois** (o aperto de mãos).
4. **Uma garantia de término** (nenhuma mesa trava em impasse infinito).

O chat é *uma* interface para isso. Todas as alternativas abaixo entregam os
quatro pontos — mudam a **interface**, o **protocolo**, ou os dois.

---

## 3. Invariantes (o que nenhuma alternativa pode quebrar)

Qualquer caminho escolhido mantém:

- **Piso**: `MIN_STAKE = 10` ([credits.ts](../src/features/bac-bo/engine/credits.ts)).
- **Teto duplo**: nenhuma proposta pode exceder o saldo de *nenhum* dos dois —
  uma aposta impagável trava a mesa sem culpa de ninguém.
- **Consentimento dos dois lados** — nunca um valor imposto.
- **Convergência garantida**: o protocolo tem um número máximo de trocas e um
  desfecho definido quando ele estoura.
- **Débito só na virada para o `countdown`** — a negociação não move saldo.
- **A "cabeça" do oponente continua injetável** (a interface `Negotiator` de
  [negotiation.ts](../src/features/bac-bo/store/negotiation.ts)): testes trocam por
  stub determinístico e o online futuro troca por mensagens do servidor.
- **`devNegotiationAutoAccept`** (DevTools/e2e) continua atravessando a fase em
  um toque.

---

## 4. Critérios de comparação

- **Toques** — quantos toques do jogador, no caminho típico, até a mesa fechar.
- **Tempo** — segundos até a primeira carta, incluindo os beats do oponente.
- **Ruído** — quanto da tela a negociação ocupa.
- **Expressividade** — quanto o jogador consegue *negociar de verdade* (regatear,
  blefar, ceder).
- **Cara de cassino** — o quanto a interação parece de mesa, não de app.
- **Custo** — esforço sobre o código atual.
- **Online real** — sobrevive a dois humanos, com latência e má-fé?

---

## 5. Alternativas

### A. Fichas na mesa — contraproposta sem chat  ⭐ *evolução mais barata*

**Como funciona.** Mesmo protocolo de hoje (alternância de propostas), zero
mensagens. A proposta do rival chega como uma **pilha de fichas empurrada ao
centro do feltro**, com o valor gravado. Você tem três ações, sempre no mesmo
lugar: **COBRIR** (aceita), **SUBIR/BAIXAR** (contrapropõe pelo stepper) e **SAIR**.

```
        ╔══════════════════════════════╗
        ║   BRUNO PÔS NA MESA          ║
        ║        ⛁ 150                 ║
        ╚══════════════════════════════╝
              ▼  (fichas deslizam ao centro)
        ┌──────────────────────────────┐
        │   sua contraproposta         │
        │   ◀  ⛁  80  ▶     [ COBRIR ] │
        └──────────────────────────────┘
                     [ SAIR DA MESA ]
```

**Por que resolve.** A negociação vira **objeto físico**, não texto. O feltro
continua visível; o painel encolhe de uma janela de chat para uma faixa. Sem
`GREETINGS`, sem `COUNTER_QUIPS`, sem "digitando…" — o beat do oponente cai para
um único delay curto (~600–1200 ms) que já se justifica como "ele está pensando".

**Custo.** Baixo. `NegotiationState` perde `messages`/`opponentTyping` e ganha
`playerOffer`/`opponentOffer`; `createBotNegotiator` fica igual (só descarta as
falas). O `AmountStepper` já existe.

**Riscos.** Se as duas ofertas estiverem longe, ainda pode virar pingue-pongue —
mitigar com **teto de 3 rodadas** (a concessão do bot já converge assim).

---

### B. Régua do acordo — dois cursores numa trilha  ⭐ *a mais tátil*

**Como funciona.** Uma única régua horizontal de `MIN_STAKE` até o menor dos dois
saldos. **Seu marcador** é arrastável; **o do rival** se move sozinho. Nenhum dos
dois "envia" nada: a posição *é* a proposta, ao vivo. Quando os marcadores se
encontram (ou se cruzam), a régua **trava em ouro** e o duelo libera — o valor
acordado é o ponto de encontro.

```
   ⛁10 ├──────●─────────────────◆──────────────┤ ⛁500
          você (80)          Bruno (150)

   ⛁10 ├───────────────●◆──────────────────────┤ ⛁500
                    ACORDO · ⛁ 120     ✧ travado
```

**Por que resolve.** Elimina o conceito de "mensagem" por completo. É **um
componente**, sem log, sem histórico, sem rolagem. A tensão da negociação vira
movimento — você vê o rival cedendo em tempo real, o que é dramaticamente mais
forte que ler "Hmm, sobe um pouco".

**Custo.** Médio. Componente novo (arraste + acessibilidade por teclado), mas o
store fica *mais simples* que hoje: dois números e um flag de trava.

**Riscos.** Arraste fino em telas pequenas — resolver com passos discretos
(múltiplos de 10) e feedback tátil. Precisa de um **limite de tempo** (ex.: 15 s)
que fecha no ponto médio se ninguém ceder.

---

### C. Placar de lance — reaproveitar o vocabulário da dobra

**Como funciona.** Copiar exatamente o padrão que **já existe e já funciona** no
jogo: o pedido de dobra em [HandsArena.tsx](../src/features/bac-bo/components/HandsArena.tsx)
— um CTA que vira placar, mais uma nuvem com o bico virado para o rival, e as
respostas ✓/✗ acendendo do lado dele.

A negociação passa a ter, no máximo, três estados no mesmo lugar da tela:
`convite → aguardando rival → aceita/recusa`. Recusou, o rival devolve **um**
número e você tem a mesma escolha. Fim.

**Por que resolve.** É **coerência interna de graça**: o jogador aprende o gesto
uma vez e ele vale na negociação e na dobra. Nenhum vocabulário visual novo entra
no jogo, e a fase de negociação passa a parecer parte do duelo.

**Custo.** Baixo — os componentes e o CSS da dobra são adaptáveis quase direto.

**Riscos.** Expressividade menor (poucas rodadas). É uma virtude aqui, mas se o
diretor quiser "regateio de verdade", combinar com **A**.

---

### D. Leilão de carta fechada — proposta simultânea  ⭐ *a mais temática*

**Como funciona.** Os dois escrevem o valor **ao mesmo tempo**, cada um sem ver o
outro. As duas propostas viram como cartas, juntas. A regra de convergência é a
regra clássica de mesa: **vale o menor valor** — ninguém pode apostar mais do que
o outro está disposto a cobrir.

```
      ┌───────┐        ┌───────┐              ┌───────┐   ┌───────┐
      │  ???  │        │ ⛁ 150 │   revelam →  │ ⛁ 80  │   │ ⛁ 150 │
      │ VOCÊ  │        │ BRUNO │              └───────┘   └───────┘
      └───────┘        └───────┘               A MESA VALE ⛁ 80
```

**Por que resolve.** Uma rodada, **um toque**, zero espera de contraproposta — e
carrega a *mesma* gramática do jogo (carta virada, revelação simultânea, POV
oculto) que a rodada de blackjack já usa. É a alternativa que mais parece
pertencer a este jogo em particular.

Variante mais tensa: **vale o maior**, com a opção de o menor lance **passar** (aí
o duelo não acontece) — isso cria blefe real. Recomendo começar pelo "menor
cobre", que é seguro e nunca surpreende o saldo de ninguém.

**Custo.** Médio-baixo. Protocolo novo no store, mas *muito* mais simples: um
input, um timer, uma revelação. O `Negotiator` perde `respond` e ganha um `bid`.

**Riscos.** Menos "negociação" no sentido de conversa — é um acordo tácito. Se o
diretor entende negociação como *ida e volta*, oferecer **uma única rodada de
re-lance** quando a diferença passa de X%.

---

### E. Cobrir ou passar — escada de pôquer com teto

**Como funciona.** Vocabulário de aposta, não de conversa. Quem abre põe um valor;
o outro tem exatamente três botões: **COBRIR** (fecha no valor), **SUBIR** (dobra
ou +50%, valor fixo — sem digitar nada) ou **PASSAR** (sai da mesa). Teto rígido:
**2 subidas por lado**; estourou, vale o último valor coberto.

**Por que resolve.** Zero digitação, zero texto, e o ritmo é o de uma mão de
pôquer — leitura instantânea para qualquer pessoa que já viu uma mesa. É a opção
mais rápida de todas em número de toques.

**Custo.** Baixo. É **A** com valores pré-calculados no lugar do stepper.

**Riscos.** Perde granularidade (não dá para propor 137). Se o produto valoriza o
número exato como parte da personalidade do duelo, prefira **A** ou **B**.

---

### F. Sinais de mesa — emotes fixos no lugar do texto

**Como funciona.** Mantém a ida e volta, mas o "chat" vira um **conjunto fechado
de sinais**: 👍 *fecho*, 👎 *tá caro*, ☝️ *subo*, 🤏 *pouco*, ⏳ *pensa aí*. Cada
sinal é um ícone sobre o avatar, não uma bolha num log.

**Por que resolve.** Preserva o *sabor social* que o chat trouxe — o diretor pode
ter pedido negociação justamente por isso — sem prosa, sem i18n, sem moderação, e
sem log rolável. E ecoa o fato de que **blackjack é um jogo de sinais de mão**:
bater na mesa para pedir carta, acenar para parar.

**Custo.** Baixo, mas é um **complemento**, não uma alternativa completa: precisa
de A, B, D ou E para carregar o número.

**Riscos.** Emotes envelhecem rápido e podem virar spam — limitar a 1 sinal por
rodada de proposta.

---

### G. Aposta viva — negociação dentro da mão  ⭐ *a mais ousada*

**Como funciona.** **Não existe tela de negociação.** O duelo começa direto na
ante mínima (⛁10), e o valor da mesa é negociado **durante a partida**, com o
mecanismo de dobra que já está implementado: a cada vez, qualquer lado pode
propor subir a aposta, e o outro aceita ou recusa.

**Por que resolve.** Atende ao requisito do diretor de forma mais *forte* que o
chat — a aposta é negociada entre os jogadores o tempo todo, com informação
parcial das mãos na mesa. E resolve o problema pela raiz: o tempo de negociação
some porque ele acontece *enquanto se joga*. O jogo fica dramaticamente melhor:
subir a aposta com 20 na mão é blefe; recusar é confissão.

**Custo.** Médio — mas quase tudo já existe (`DoubleBetState`, a nuvem, o placar,
o pause do relógio). O trabalho é generalizar "dobrar" para "subir para X" e
permitir mais de um pedido por mão.

**Riscos.** É uma **mudança de regra do produto**, não só de UI — precisa de aval
do diretor. Muda a matemática do payout e exige cuidado com saldo no meio da mão.
Também é o caminho que mais mexe em testes ([gameStore.test.ts](../src/features/bac-bo/tests/gameStore.test.ts)).

---

### H. Faixa declarada — o acordo acontece no pareamento

**Como funciona.** Antes de buscar, cada jogador declara **a faixa que topa
jogar** (ex.: 50–200) num controle de duas alças, uma vez só, e ela fica salva. O
matchmaking pareia **faixas que se sobrepõem**, e o valor da mesa é o meio da
sobreposição. Na tela de confirmação, isso aparece como um **selo de acordo**
("faixas cruzadas · a mesa vale ⛁ 120") — não como uma negociação a fazer.

```
   você   ├────────█████████████──────────┤   50 – 200
   Bruno  ├──────────────█████████████────┤  120 – 300
                        ▲
                  ACORDO ⛁ 160  (meio da sobreposição)
```

**Por que resolve.** **Zero toques na hora de jogar.** A negociação continua
existindo — é declarada, não conversada — e é a única alternativa que escala
limpo para online real: sem espera de resposta humana, sem impasse, sem
abandono no meio da negociação.

**Custo.** Médio. A fase `negotiate` desaparece do fluxo e vira preferência
persistida ([GameStorageService](../src/features/bac-bo/services/)). O matchmaking
ganha um critério.

**Riscos.** É a menos "negociação" de todas aos olhos do diretor — o jogador não
sente que barganhou. Mitigação forte: **H + D**, onde a faixa filtra o
pareamento e um leilão de carta fechada dentro dela dá o momento de decisão.

---

## 6. Matriz comparativa

| | Toques | Tempo até a carta | Ruído | Expressividade | Cassino | Custo | Online real |
| --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| **Hoje (chat)** | 2–6 | 8–20 s | ██████ | Alta | Baixa | — | Frágil |
| **A. Fichas** | 1–4 | 3–8 s | ██ | Alta | Alta | Baixo | Boa |
| **B. Régua** | 1–2 | 4–10 s | █ | Média-alta | Média | Médio | Boa |
| **C. Placar (dobra)** | 1–3 | 3–7 s | █ | Média | Alta | Baixo | Boa |
| **D. Carta fechada** | 1 | 3–5 s | ██ | Média | **Altíssima** | Médio | **Ótima** |
| **E. Cobrir/passar** | 1–3 | 2–5 s | █ | Baixa-média | **Altíssima** | Baixo | Boa |
| **F. Sinais** | +1 | +1 s | █ | (tempero) | Alta | Baixo | Boa |
| **G. Aposta viva** | 0 | **0 s** | ▪ | **Máxima** | Alta | Médio | Boa |
| **H. Faixa** | 0 | **0 s** | ▪ | Baixa | Média | Médio | **Ótima** |

---

## 7. Recomendação

**Curto prazo (uma sprint), sem mudar regra de jogo: `A` + `F`.**
Trocar o chat por fichas na mesa com stepper e três ações, mantendo o teto de 3
rodadas que o bot já respeita, e temperar com sinais de mesa no lugar dos quips.
É a menor distância entre o código de hoje e uma mesa que parece uma mesa: o
protocolo não muda, o `Negotiator` não muda, os testes de convergência
sobrevivem — cai a camada de mensageria.

**Se houver espaço para uma decisão de design mais forte: `D` (carta fechada).**
É a alternativa que *pertence* a este jogo — a revelação simultânea é a mesma
gramática da vez simultânea do duelo, já documentada no README. Uma rodada, um
toque, e o momento tem tensão real em vez de espera fingida.

**Se o diretor topar mexer na regra: `G` (aposta viva)** é a resposta mais
ambiciosa e a que melhor honra o pedido original — a aposta deixa de ser
burocracia antes do jogo e vira o jogo.

**Para o online real, em qualquer cenário: adicionar `H`** como filtro de
pareamento. Ela não substitui a negociação; ela garante que os dois lados já
estão na mesma ordem de grandeza antes de negociarem — o que faz qualquer um dos
protocolos acima convergir em uma rodada na maioria das vezes.

---

## 8. Impacto no código

Independentemente da escolha, o desenho atual já isola bem o que muda:

| Arquivo | O que acontece |
| --- | --- |
| [store/negotiation.ts](../src/features/bac-bo/store/negotiation.ts) | `NegotiationMessage`, `GREETINGS`, `COUNTER_QUIPS` e a maior parte de `BOT_BEATS` **saem**. A interface `Negotiator` e a lógica de concessão (`resolveTarget`, alvo 8–40% do saldo, 3 rodadas) **ficam** — é ela que garante a convergência em A/B/C/E. |
| [store/gameStore.ts](../src/features/bac-bo/store/gameStore.ts) | `NegotiationState` perde `messages`/`opponentTyping` e ganha os dois valores em jogo. `sendProposal`/`acceptProposal`/`startDuel`/`abandonNegotiation` mantêm a assinatura em A, B, C e E. Em **G** e **H**, a fase `'negotiate'` sai de `PHASE_TRANSITIONS`. |
| [components/NegotiationPanel.tsx](../src/features/bac-bo/components/NegotiationPanel.tsx) | Reescrito em todos os cenários (é o painel de chat). O `AmountStepper` e a faixa de segurança dos CTAs são reaproveitados. |
| [components/HandsArena.tsx](../src/features/bac-bo/components/HandsArena.tsx) | Fonte do padrão visual em **C**; ponto de extensão em **G**. |
| [tests/negotiation.test.ts](../src/features/bac-bo/tests/negotiation.test.ts) | Os testes de *convergência* seguem válidos; os de mensagens/typing saem. |
| [e2e/game-flow.spec.ts](../e2e/game-flow.spec.ts) | `nego-*` testids mudam. Manter `devNegotiationAutoAccept` como atalho da fase. |

---

## 9. Como cada protocolo termina (anti-impasse)

Toda alternativa precisa de uma resposta pronta para "e se ninguém ceder?":

- **A / C / E** — teto de rodadas (3). Estourou: vale a **última proposta do
  rival**, com aceitar/sair.
- **B** — relógio de 15 s. Zerou: fecha no **ponto médio** entre os marcadores.
- **D** — a regra já é terminal por construção (uma rodada, vale o menor).
- **G** — sem impasse possível: recusar apenas mantém o valor atual.
- **H** — sem impasse possível: sem sobreposição, não há pareamento.

E em todas: **sair da mesa** continua disponível e gratuito, porque o saldo só é
debitado na virada para o `countdown`.

---

## 10. O que foi descartado, e por quê

- **Chat com texto livre** — inviável em online real sem moderação, e é
  exatamente o que gerou este documento.
- **Leilão contínuo estilo pregão** (valores subindo em tempo real com o dedo
  pressionado) — bonito, mas exige latência baixíssima e pune quem tem conexão
  ruim.
- **Negociação assíncrona** (propostas que ficam pendentes minutos) — quebra a
  premissa de duelo em sessão única.
- **Deixar um lado escolher e o outro só aceitar** — cumpre a UX, mas **não é
  negociação**: falha no requisito do diretor.
