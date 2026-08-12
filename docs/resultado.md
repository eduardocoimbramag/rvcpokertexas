# Resultado: o que fazer com a mesa apertada

Este documento traduz os outros dois — `encaixefichas.md` e `quebralinhanick.md` — para
linguagem de gente. **Sem CSS, sem pixel.** Para cada solução, só duas coisas: **o que
você vai ver na tela** e **o que acontece de bom e de ruim**.

No fim tem a minha recomendação e o desenho de como a mesa fica depois de tudo.

---

## Os dois problemas, em uma frase cada

**Problema 1 — as fichas invadem o vizinho.** A pilha de fichas de um jogador é
desenhada por cima das cartas do jogador à esquerda dele. Chega a cobrir **quatro
quintos** de uma carta.

**Problema 2 — o nome quebra linha.** Na plaquinha do jogador, o nome e o valor das
fichas não cabem lado a lado, e o valor cai para uma segunda linha. A plaquinha fica
mais alta que as vizinhas e desalinha a fileira.

**Os dois têm a mesma raiz:** numa mesa de 6, cada jogador tem uma coluna de menos de
1 centímetro de largura num celular comum. É pouco espaço para muita coisa.

E um detalhe importante: **isso só acontece nas mesas de 4 e de 6 jogadores.** As de 3
e 5 têm folga e estão certas hoje.

---

# Parte 1 — As fichas invadindo o vizinho

Hoje cada assento é assim:

```
        ┌─────────────────────┐
        │   NOME  ⊙ 1.000     │   ← a plaquinha
        └─────────────────────┘
    🪙🪙  [carta] [carta]   Ⓓ
     ↑                       ↑
   as fichas            o disco do dealer
```

O espaço do meio (as cartas) come quase tudo, e as fichas sobram para fora — para cima
do assento do lado.

---

### Opção 1 — Tirar a pilha de fichas do rival
*Trabalho: pequeno*

**O que você vai ver:** as pilhas de fichas ao lado dos rivais **somem**. Fica só a
carta. O valor continua escrito na plaquinha logo acima, como já está hoje.

**Resultado:** a invasão acaba por completo. Nenhuma informação some da tela — só a
segunda cópia dela.

**O lado ruim:** você perde o "bate-olho". Hoje dá para ver quem está ganhando só
olhando qual pilha é mais alta. Depois, para comparar, você tem que **ler** seis
números pequenos.

**Atenção:** a sua própria pilha continua. A mesa fica meio assimétrica — você com
fichas desenhadas, os cinco rivais não.

---

### Opção 2 — Recortar o assento como uma caixa fechada
*Trabalho: pequeno*

**O que você vai ver:** a pilha continua no lugar, mas **o pedaço que passava do
assento é cortado fora**. Fica só o pedacinho que cabe.

**Resultado:** nenhum assento consegue mais aparecer dentro de outro — hoje, amanhã ou
depois de qualquer mudança futura. É a única opção que **não estraga com o tempo**.

**O lado ruim:** sobra tão pouco da pilha que ela vira uma meia-lua cortada rente. Não
parece "pilha de fichas", parece **defeito de tela**. E o corte também apaga coisas que
hoje passam do assento **de propósito** — o brilho dourado de quem está jogando a vez, e
o brilho da carta vencedora no showdown.

> Sozinha ela não presta. Presta como **rede de segurança depois de outra**.

---

### Opção 3 — Dar mais largura à fileira de três
*Trabalho: pequeno*

**O que você vai ver:** a fileira de trás fica um pouco mais larga, quase encostando nas
bordas do feltro. Cada assento ganha cerca de **um caractere de largura**.

**Resultado:** espaço de graça, que ajuda os **dois** problemas.

**O lado ruim:** a mesa fica com menos "profundidade" — hoje a fileira de trás é
levemente mais estreita para parecer mais longe. Isso some.

> ⚠️ **Ela piora as coisas se feita sozinha.** Alargar a fileira empurra os assentos das
> pontas para perto da borda, e a pilha de fichas do assento da ponta — que já sai um
> pouco da tela hoje — sai muito mais.
>
> **Ela só é segura DEPOIS que a pilha do rival sair (Opção 1).** Sem pilha para
> empurrar, o problema desaparece. **A ordem importa.**

---

### Opção 4 — Trocar a pilha por uma pastilha com uma ficha só
*Trabalho: médio*

**O que você vai ver:** no lugar da pilha, uma pastilha pequena entre a plaquinha e as
cartas: **uma ficha colorida + o valor**. A cor da ficha diz a ordem de grandeza —
dourado é milhar, roxo é meio milhar.

**Resultado:** você mantém uma leitura rápida por cor, sem gastar largura.

**O lado ruim:** a cor diz se o cara tem "uns mil" ou "uns quinhentos", mas **não
distingue 900 de 1.400** — e é exatamente aí que o cash se decide. E o valor passa a
aparecer duas vezes no mesmo assento, bem perto um do outro.

> ⚠️ **Custa altura**, e a tela **já está 48 pixels no vermelho** de altura num celular
> pequeno. Só dá para fazer se antes alguma outra coisa devolver espaço vertical.

---

### Opção 5 — Encolher a ficha e limitar a pilha a uma coluna
*Trabalho: médio*

**O que você vai ver:** as pilhas continuam, mas **menores e mais finas** — uma coluna
só de fichinhas em vez de duas.

**Resultado:** cabe, e nada muda de lugar. A mesa continua com pilha em todo assento.

**O lado ruim:** a ficha fica tão pequena que **você deixa de distinguir as cores** (o
vinho, o roxo e o dourado viram a mesma manchinha). E com uma coluna só, stacks
diferentes passam a desenhar pilhas iguais — a leitura por altura vira mentira.

**Cuidado:** as fichas são compartilhadas com o jogo 1v1. Se a mudança for feita no
lugar errado, **ela encolhe as fichas do duelo também**.

---

### Opção 6 — Nunca mais três assentos por fileira
*Trabalho: médio*

**O que você vai ver:** em vez de `3 em cima + 2 embaixo`, os rivais passam a ficar em
**três fileiras**: `2 + 2 + 1`. Cada assento fica bem mais largo.

**Resultado:** sobra espaço de verdade — a pilha cabe com folga, e a plaquinha também.

**O lado ruim:** **uma fileira a mais come muita altura**, e a altura já está no
vermelho. Quem paga é o miolo da mesa — o pote e as cinco cartas comunitárias ficam mais
espremidos. E o assento sozinho da última fileira fica visualmente órfão.

---

### Opção 7 — Diminuir as cartas dos rivais
*Trabalho: pequeno*

**O que você vai ver:** as cartas de cabeça para baixo dos rivais ficam **bem menores**.

**Resultado:** sobra espaço para as fichas.

**O lado ruim:** isso **desfaz uma correção que já foi feita**. As cartas dos rivais já
foram pequenas, e foram aumentadas justamente porque *"uma carta de rival miúda era o
que mais denunciava que esta não era a mesa do duelo"*. O tamanho proposto aqui é
**menor ainda** que o que já foi rejeitado.

---

# Parte 2 — O nome quebrando linha

Hoje a plaquinha tenta pôr nome e fichas na mesma linha:

```
   ┌──────────────────────┐          ┌──────────────────────┐
   │  ZARA  │  ⊙ 1.000    │    mas   │  FLORA  │            │
   └──────────────────────┘          │           ⊙ 1.000    │
        (quando cabe)                └──────────────────────┘
                                       (quando não cabe)
```

**A causa não é falta de espaço — é uma instrução errada.** A plaquinha está mandada a
"quebrar linha se não couber". Só que o programa **quebra a linha antes de tentar
encolher o nome**. Ou seja: existe um mecanismo pronto para cortar o nome com "…" e ele
nunca chega a ser usado.

---

### Opção A — Desligar a quebra de linha
*Trabalho: pequeno* · **É o alicerce. Não vai sozinha.**

**O que você vai ver:** a plaquinha volta a ter **sempre uma linha só**, com a mesma
altura em todos os assentos. Quando o nome não couber, ele é cortado com reticências:
`FLOR…`.

**Resultado:** o defeito deixa de ser imprevisível. A fileira para de desalinhar.

**O lado ruim:** sozinha, ela troca "quebra feia" por "nome cortado" — e no pior caso o
nome vira só duas letras. Por isso ela **precisa** vir com as opções C e D abaixo, que
devolvem espaço para o corte quase nunca acontecer.

---

### Opção B — Nome em cima, fichas embaixo, de propósito
*Trabalho: médio* · **A única que resolve para sempre**

**O que você vai ver:** a plaquinha passa a ter **duas linhas assumidas**: o nome em
cima, o valor embaixo, os dois centralizados e alinhados.

**Resultado:** a plaquinha precisa da largura do **maior** dos dois, não da soma. Sobra
tanto espaço que dá até para **aumentar a letra**. E nunca mais quebra, com qualquer
nome e qualquer valor.

**O lado ruim:** custa altura em todos os assentos — e a altura está no vermelho. É a
melhor solução tecnicamente e a que a tela tem mais dificuldade de pagar.

---

### Opção C — Dieta de enfeite: espaço entre letras e o risquinho divisor
*Trabalho: pequeno*

**O que você vai ver:** quase nada. As letras do nome ficam **um pouco mais juntas**, e
o risquinho vertical entre o nome e o valor some.

**Resultado:** ganha espaço de verdade **sem cortar nem abreviar nada**. E é aplicado
**só na fileira apertada** — as outras mantêm a letra espaçada da marca.

**O lado ruim:** o nome do rival passa a ler como "texto de tela" em vez de "placa
gravada". É uma perda de caráter, pequena e só nos rivais.

---

### Opção D — Tirar o selo ALL-IN da linha do nome
*Trabalho: pequeno* · **Pequena, quase invisível, e obrigatória**

**O que você vai ver:** quando alguém está all-in, o selo vermelho **ALL-IN** aparece
numa linha própria em vez de espremer o nome.

**Resultado:** sem ela, a Opção A tem um efeito colateral feio: **quando alguém está
all-in, o nome de todo mundo da fileira vira "…"** — justo no lance mais importante da
mão.

**O lado ruim:** praticamente nenhum. Só existe quando alguém está all-in.

---

### Opção E — Dieta de moldura
*Trabalho: pequeno*

**O que você vai ver:** a moldura dourada da plaquinha do rival fica **um pouco mais
fina**, e o respiro interno diminui.

**Resultado:** mais espaço para o texto. A moldura foi desenhada para a plaquinha
grande (a sua); na miúda dos rivais ela ficou desproporcional.

**O lado ruim:** a plaquinha do rival fica um pouco menos imponente que a sua. O que,
sendo honesto, até faz sentido.

---

### Opção F — Trocar a fonte por uma mais estreita
*Trabalho: alto*

**O que você vai ver:** o mesmo texto ocupando **15 a 20% menos largura**, com um
desenho de letra ligeiramente diferente.

**Resultado:** ataca a causa física — as letras são largas demais para o espaço.

**O lado ruim:** é a mudança mais cara e mais arriscada. Mexe na identidade visual do
projeto inteiro, ou obriga a carregar **duas fontes**, o que deixa o jogo mais pesado.

---

## O que NÃO funciona (já foi testado e descartado)

| Ideia | Por que não |
| --- | --- |
| Abreviar o valor: `1.000` → `1k` | O código proposto **não produz "k"** no formato brasileiro. E "12,5k" pode ser 12.451 ou 12.549 — num jogo em que o valor exato decide se um all-in te cobre, isso é perda de informação real. |
| Fazer a letra se adaptar à largura da fileira | A conta proposta **piorava** a mesa de 4. E depende de um recurso novo do navegador que, se faltar, **desmonta a plaquinha inteira** em vez de degradar. |
| Tirar o valor da plaquinha e pôr embaixo das fichas | Duplica o olhar: você passa a consultar dois lugares por assento, quando juntar os dois foi uma melhoria consciente. |
| Alargar a fileira **sozinha** | Empurra a pilha de fichas do assento da ponta para fora da tela (ver a Opção 3). |

---

# Minha recomendação

São **seis mudanças**, todas pequenas, em duas levas. A ordem importa.

## Leva 1 — resolve o problema das fichas

| # | O que | O que você vê |
| --- | --- | --- |
| 1 | **Tirar a pilha dos rivais** (Opção 1) | As pilhas ao lado dos rivais somem; o valor fica na plaquinha |
| 2 | **Alargar a fileira de três** (Opção 3) | A fileira de trás fica um pouco mais larga |
| 3 | **Recortar o assento** (Opção 2) | Nada visível hoje — é a trava para o futuro |

**Por que nesta ordem:** a 2 só é segura depois da 1. Com a pilha fora, alargar a
fileira vira ganho limpo — e esse ganho é justamente o que a plaquinha precisa.

**Por que tirar a pilha em vez de encolhê-la:** faltam **46 pixels** num assento de 70.
Não existe ajuste fino que resolva isso com margem. As opções 5 e 7 fazem caber por 2 ou
3 pixels — e aí um stack maior, um nome maior ou um celular um pouco mais estreito
estouram de novo. **Encolher adia; tirar resolve.**

## Leva 2 — resolve o nome quebrando

| # | O que | O que você vê |
| --- | --- | --- |
| 4 | **Desligar a quebra de linha** (Opção A) | Plaquinha sempre com uma linha só |
| 5 | **ALL-IN em linha própria** (Opção D) | Só aparece quando alguém está all-in |
| 6 | **Dieta de enfeite + moldura** (Opções C e E) | Letras um pouco mais juntas, moldura mais fina |

**Por que juntas:** a 4 sozinha corta o nome. As 5 e 6 devolvem espaço suficiente para o
corte **quase nunca acontecer**.

## O que eu deixaria para depois

- **Opção B (nome em cima, valor embaixo)** — é tecnicamente a melhor, mas custa altura,
  e a altura está no vermelho. **Guarde-a**: se um dia entrar um apelido de 7+ letras ou
  um stack de 7 dígitos, é ela a resposta definitiva.
- **Opção F (trocar a fonte)** — cara demais para o ganho, por enquanto.
- **Opções 4, 5, 6 e 7 das fichas** — todas custam algo que a mesa não tem para dar
  (altura, legibilidade da ficha, ou desfazem uma correção já feita).

---

# O resultado final

## Como a mesa fica

```
             ┌──────────────────────────────────┐
             │          Salão do Coringa        │
             ├──────────────────────────────────┤
             │                                  │
             │   ZARA 1.000  THÉO 980  KAI 1.000│  ← plaquinhas de uma linha,
             │   [🂠][🂠]     [🂠][🂠]    [🂠][🂠] │    todas na mesma altura,
             │                                  │    nome inteiro visível
             │      LUNA 1.062     GAEL 970     │
             │      [🂠][🂠]        [🂠][🂠]      │  ← sem pilhas de fichas
             │                                  │    invadindo o vizinho
             │              🪙                   │
             │            ⊙ 30                  │
             │      [ ][ ][ ][ ][ ]             │
             │                                  │
             │         [ K♠ ][ 10♦ ]      🪙🪙   │  ← a SUA pilha continua
             │      ┌────────────────┐          │
             │      │ VOCÊ  ⊙ 1.000  │          │
             │      │ CARTA ALTA: REI│          │
             │      └────────────────┘          │
             └──────────────────────────────────┘
```

## O que muda, na prática

| Antes | Depois |
| --- | --- |
| A pilha de um jogador cobre **81% da carta** do vizinho | Nenhum assento invade nenhum outro |
| A pilha do assento da ponta sai **para fora do feltro** | Tudo dentro da moldura de madeira |
| Uma plaquinha fica mais alta que as outras e desalinha a fileira | Todas as plaquinhas com a mesma altura, sempre |
| O valor das fichas cai para uma segunda linha | Nome e valor lado a lado, na mesma linha |
| Nome espremido quando alguém está all-in | O selo ALL-IN tem linha própria |
| O defeito piora conforme o stack cresce | O tamanho do stack não afeta mais o layout |

## O que você perde, e é honesto dizer

**Uma coisa só:** o bate-olho das pilhas dos rivais. Hoje dá para ver quem está na frente
sem ler nada, só comparando alturas. Depois, você lê os números.

Eu acho a troca justa, por dois motivos:
1. O valor **continua em cena**, na plaquinha, e agora **maior e mais legível** do que
   é hoje.
2. Uma pilha que cobre a carta do vizinho não é uma leitura rápida — é um estorvo.

E se depois de ver na tela você achar que a pilha faz falta, o caminho de volta é a
**Opção 4** (a pastilha com ficha colorida): ela devolve a leitura por cor. Mas ela custa
altura, então a hora certa dela é depois de a mesa ter respirado.

## Onde nada muda

As mesas de **3 e 5 jogadores** não têm o problema e **não pioram** com nenhuma dessas
mudanças. O jogo **1v1** também não é tocado: todas as alterações são específicas dos
assentos de rival da mesa de cash.

---

## Resumo em uma linha

**Tirar as pilhas dos rivais, dar um pouco mais de largura à fileira apertada, e ensinar
a plaquinha a cortar o nome em vez de quebrar linha.** Seis mudanças pequenas, nenhuma
informação perdida, e a mesa deixa de se sobrepor a si mesma.

---

# Adendo — o que acabou sendo feito

Este documento apresentou sete opções para as fichas e seis para o nome, e você
escolheu a **5 + 7** (fichas) e a **B** (nome). Elas foram implementadas, e no
navegador ficou claro o que a análise já avisava: **faziam caber por 2 ou 3 px**.
A ficha e a carta do rival tinham encolhido tanto que a mesa perdia presença.

Você então propôs uma ideia melhor, e é ela que está no jogo hoje.

## A ideia, em uma frase

**As fichas de cada jogador saem para o lado de fora**, em vez de saírem sempre
para a esquerda: quem está à esquerda manda as fichas para a esquerda, quem está
à direita manda para a direita, e quem está no meio põe as fichas embaixo das
próprias cartas.

## Por que ela é melhor que todas as sete

As sete opções tentavam **fazer caber** — encolher a ficha, encolher a carta,
recortar o assento, tirar a pilha. Todas custavam alguma coisa que a mesa usa
para ser lida.

Esta não faz caber: ela **tira o vizinho do caminho**. Como cada pilha aponta
para fora, não existe mais o que sobrepor. E por não existir, nada precisou
encolher:

- a **ficha do rival voltou** ao tamanho de antes;
- a **carta do rival voltou** ao tamanho de antes;
- a pilha voltou a poder ter **duas colunas**.

## O que você vê na mesa agora

- As fichas de quem está nas pontas ficam junto à borda de madeira, como fichas
  ficam numa mesa de verdade.
- As fichas de quem está no meio ficam logo abaixo das cartas dele.
- O **botão de dealer** saiu de perto das cartas e virou um selo à direita da
  plaquinha com o nome.
- Todas as plaquinhas de uma mesma fileira têm **exatamente a mesma largura**, e
  o apelido fica centrado nelas. Antes a largura dependia do tamanho do apelido e
  da quantidade de fichas — e mudava sozinha durante a mão, a cada ficha ganha ou
  perdida.
- As cartas da fileira de cima agora se leem como **três pares** e não como uma
  tira de seis, porque o espaço entre assentos ficou três vezes maior que o
  espaço entre as duas cartas de uma mesma mão.

## O que continua valendo do que foi recomendado

A **Opção B** (nome em cima, fichas embaixo) ficou, e é o que sustenta a placa
de largura fixa: empilhados, o nome e o montante precisam da largura do **maior**
dos dois, e não da soma — é o que faz "Helena" com 1.000 fichas caber numa placa
de 50 px num aparelho de 320.

## O que foi revertido

As opções **5** e **7**. Elas resolviam o sintoma pagando com o tamanho das
peças; a mudança de geometria resolveu a causa e devolveu o tamanho.

## Conferido

Mesas de 3, 4, 5 e 6, em telas de 320 e 412 px, com uma mão em andamento:
nenhuma ficha sobre carta de ninguém, nenhuma ficha fora do feltro, nenhum
apelido cortado, e as plaquinhas todas do mesmo tamanho.

## Três acertos depois, e um defeito antigo que apareceu

**As fichas das pontas ganharam um respiro.** Estavam encostadas na carta e liam
como parte da mão; agora há um dedo de distância. Quem está no meio não mudou —
lá as fichas descem, e a separação já vem de cima.

**A plaquinha voltou ao centro das duas cartas.** Ela estava um pouco à esquerda
porque o botão de dealer, à direita dela, empurrava o conjunto todo. Agora o
botão sai para fora sem mexer no lugar da placa.

**As cinco cartas da mesa cresceram.** Elas estavam a um terço do tamanho da sua
carta; voltaram para 78% dela, que é a proporção que a casa usa no jogo inteiro —
inclusive no 1x1. As fichas do pote cresceram junto.

**E, medindo isso, apareceu um defeito que já existia.** No aparelho mais estreito
e mais baixo que o jogo suporta (320×568), o pote subia por cima da segunda
fileira de jogadores e as cartas da mesa desciam por cima das suas — nove pixels
para cada lado. Não era coisa nova: com os valores antigos o mesmo aparelho já
pedia mais espaço do que tinha. Ninguém tinha visto porque o teste automático só
verificava se a tela rolava para o **lado**, nunca para baixo.

Está corrigido: numa tela baixa as cartas dos rivais cedem um pouco de altura, e
cedem mais quando há duas fileiras de gente (mesas de 5 e 6) do que quando há
uma (mesas de 3 e 4). Em aparelho normal nada muda.
