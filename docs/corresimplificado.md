# CORRER — versão para quem está começando

> Este documento explica, **sem jargão**, os problemas que a auditoria encontrou
> na parte do jogo em que alguém desiste da mão.
>
> **✅ Os sete já foram consertados** (em 08/08/2026). Cada um continua descrito
> como era — é isso que explica por que o jogo funciona como funciona hoje — e
> termina com o que passou a acontecer.
>
> Se você não joga poker e não programa, **este é o documento certo**. A versão
> técnica, com nomes de arquivo e trechos de código, é a [`corre.md`](corre.md) —
> use ela depois, quando quiser mexer.

---

## Parte 1 — O vocabulário mínimo

Sete palavras. Depois delas, o resto do documento se lê sozinho.

### Do poker

**Mão** — uma rodada. Começa quando as cartas são distribuídas e acaba quando
alguém leva o dinheiro. Uma partida tem várias mãos, uma atrás da outra.

**Pote** — o dinheiro no meio da mesa. Todo mundo empurra fichas para lá durante
a mão, e no fim alguém leva tudo.

**Correr** (o *fold*) — desistir da mão. Você joga suas cartas fora e sai da
rodada. Perde o que já tinha empurrado para o pote, mas **guarda o resto das suas
fichas**. É como sair de um leilão: você não leva o objeto, mas para de gastar.

**Showdown** — quando ninguém desistiu e a mão vai até o fim: os dois viram as
cartas e a melhor ganha. É a única hora em que as cartas realmente se comparam.

**Blefe** — apostar forte com cartas ruins, para o outro desistir achando que
você tem algo bom.

**Entrada** — neste jogo, os dois jogadores põem 100 fichas no pote **antes de
ver qualquer carta**, toda mão. É o que faz valer a pena jogar: já tem dinheiro
no meio desde o começo.

**Montante** (ou *stack*) — as fichas que você ainda tem na sua frente, fora do
pote.

### Da programação

Só três, e são as três peças do jogo:

| Nome | O que é | Analogia |
| --- | --- | --- |
| **A engine** | O código que sabe as **regras** do poker. Quem ganha, quanto cada um recebe. | O **juiz** da mesa. Não desenha nada, só decide. |
| **O store** | O código que decide **a ordem das coisas** e quanto tempo cada uma dura. | O **diretor de cena**. "Agora entra isso, espera 5 segundos, agora aquilo." |
| **A interface** | O que aparece na tela: as cartas, os botões, as animações. | O **palco**. |

Um problema pode estar em qualquer uma das três. Vou dizer em qual está, sempre.

---

## Parte 2 — O que acontece quando alguém corre

A história, do começo ao fim:

1. Alguém corre (você aperta CORRER, ou o rival desiste, ou seu tempo acaba).
2. **A mesa congela.** Nada se move.
3. Aparece uma pergunta: *"Deseja mostrar sua mão para ele?"*, com **5 segundos**
   para responder. Se você não responder, vale como "não mostro".
4. As cartas do rival viram — **se ele quiser mostrar** (ele também escolhe).
5. Roda a **animação de impacto** — as duas plaquinhas se chocando no meio da tela.
6. Aparece quem ganhou.
7. **5 segundos** de intervalo e a próxima mão começa.

> Os passos 3 e 7 têm exceções: a pergunta não aparece se a mesa acabou, se foi o
> relógio que correu a mão por você, ou se você pediu para levantar. Os problemas
> 3, 5 e 2 explicam por quê.

### Por que existe essa pergunta do passo 3?

Porque **mostrar a mão é uma jogada**, mesmo depois que a rodada acabou.

- Se você mostra um par de Ases, o rival aprende: *"esse cara só aposta com mão
  boa"*. Nas próximas mãos ele vai desistir mais fácil quando você apostar.
- Se você mostra que estava blefando com lixo, ele aprende: *"esse cara blefa"*.
  Na próxima vez ele vai pagar para ver — o que é ruim quando você tem mão boa,
  e ótimo quando você quer que ele pague.

É informação sobre você. Dar ou guardar essa informação é decisão de verdade — e
é de graça, não custa ficha nenhuma.

---

## Parte 3 — Os 7 problemas (todos resolvidos)

Cada um tem: **o que você veria acontecer**, **por que é ruim** e **o que mudou**.

---

### Problema 1 · Só você pode esconder as cartas. O rival nunca esconde.

**O que você veria acontecer**

Você corre, o jogo te pergunta se quer mostrar, você diz "não". Suas cartas ficam
escondidas. Ótimo.

Agora o contrário: **o rival** corre. O jogo mostra as cartas dele **sempre**.
Ele nunca é perguntado. Você vê o que ele tinha, toda vez, sem falhar.

**Por que é ruim**

O jogo virou uma via de mão única. Toda vez que o rival desiste, você aprende
alguma coisa sobre ele — se ele estava blefando, se largou uma mão boa, como ele
joga. Ele nunca aprende nada sobre você, porque você pode se esconder.

Isso quebra a graça da decisão que acabamos de criar. Se um lado é obrigado a
mostrar e o outro escolhe, esconder deixa de ser uma jogada esperta e vira só
"apertar o botão certo". Não tem risco nenhum.

✅ **O que mudou**

O rival passou a escolher também, com uma cabeça de jogador de mesa:

| Quando ele… | Ele mostra |
| --- | --- |
| ganhou o pote com **mão boa** | quase sempre (6 em 10) — é propaganda barata |
| ganhou o pote **blefando** | raramente (2 em 10) — abrir um blefe queima a arma |
| **desistiu** | quase nunca (1,5 em 10) — é o que ele tem de mais caro |

E quando ele guarda, as cartas dele **não são só escondidas na tela: elas nem
chegam até lá**. O mesmo sigilo que vale durante a mão.

Agora as duas partes arriscam a mesma coisa, e guardar voltou a ser uma jogada
em vez do botão óbvio.

---

### Problema 2 · Um "bilhete" pode ficar esquecido e fechar a mesa sozinho

Este é o mais difícil de explicar sem programação, então vou com calma.

**O que o código faz hoje**

Quando você aperta LEVANTAR no meio de uma mão, o jogo não pode simplesmente te
tirar da mesa — tem uma rodada rolando. Então ele faz duas coisas, nesta ordem:

1. Cola um **bilhete** na geladeira que diz *"quando esta mão acabar, fecha a mesa"*.
2. Corre a mão por você.

Quando a mão acaba, o jogo lê o bilhete, fecha a mesa e joga fora o bilhete.

**O problema**

O bilhete é colado **antes** de a mão ser corrida. E correr a mão pode falhar
silenciosamente — existem cinco situações em que o jogo simplesmente não faz
nada e nem avisa (por exemplo: não era mais sua vez, ou já tinha uma jogada sendo
processada).

Se isso acontecer, a mão **não** foi corrida, mas **o bilhete continua colado**.

**O que você veria acontecer**

Você continua jogando normalmente. Mais uma mão, mais outra. Aí uma mão qualquer
termina — e do nada o jogo te tira da mesa e abre o caixa, como se você tivesse
pedido para sair. Você não pediu nada.

**Isso acontece hoje?**

Pela tela, **não**. Os botões estão bloqueados exatamente nas situações que
causariam a falha. Mas é um problema *adormecido*: basta alguém criar uma tela
nova ou um atalho novo que chame essa função, e ele acorda.

✅ **O que mudou**

A ordem foi invertida: o jogo agora **pergunta antes se a mão pode ser corrida**,
e só cola o bilhete se a resposta for sim. Se não puder, ele não faz nada — e
não deixa lembrete nenhum para trás.

A armadilha deixou de existir, inclusive para telas que ainda nem foram
escritas.

---

### Problema 3 · O jogo pergunta se você quer mostrar as cartas quando a mesa já acabou

**O que você veria acontecer**

Você corre e essa foi a última ficha que te sobrava — você quebrou, a mesa
acabou, é hora de ver o extrato e ir embora.

Mesmo assim o jogo pergunta: *"Deseja mostrar sua mão para ele?"* e espera 5
segundos. Depois roda a animação inteira, mais uns 4 segundos. **Você fica quase
10 segundos preso numa pergunta que não muda absolutamente nada.**

**Por que é ruim**

Lembra da Parte 2? Mostrar a mão serve para influenciar **as próximas mãos**. Se
a mesa acabou, não existem próximas mãos. A pergunta não tem consequência nenhuma
— e ainda segura o jogador numa tela que ele já quer deixar.

Pedir uma decisão que não decide nada é pior que não perguntar: ensina o jogador
que as perguntas do jogo podem ser ignoradas.

✅ **O que mudou**

A pergunta não aparece mais quando a mesa acabou. Você quebra, e o jogo vai
direto ao extrato — sem cobrar uma decisão que não decide nada.

---

### Problema 4 · Uma mão que morre em 1 segundo leva 20 segundos para acabar

**O que você veria acontecer**

O rival corre logo na primeira jogada. A mão teve **uma** ação e acabou. Aí o
jogo faz o ritual completo:

| Etapa | Tempo |
| --- | --- |
| A pergunta "quer mostrar?" | 5 s |
| As cartas do rival virando | 1,5 s |
| A animação de impacto | 3 s |
| O intervalo até a próxima mão | 10 s |
| **Total** | **~19,5 s** |

**Por que é ruim**

É o mesmo cerimonial de uma mão disputada até o fim, aplicado a uma mão que
nem começou. Na primeira vez passa; na quinta, o jogo parece lento.

Tem um detalhe estranho junto: a **animação de impacto** encena duas mãos se
comparando — mas numa desistência **não houve comparação nenhuma**. Quem correu
perdeu por ter desistido, não por ter carta pior. A animação está contando uma
história que não aconteceu.

✅ **O que mudou**

Três cortes, todos pelo mesmo motivo — não houve comparação, então não há
cerimônia de comparação a fazer:

| Etapa | Antes | Agora (numa desistência) |
| --- | --- | --- |
| A pergunta "quer mostrar?" | 5 s | 5 s — **mantida**, é decisão de verdade |
| Cartas do rival virando | 1,5 s | **0 s** se ele guardou (não há o que virar) |
| Animação de impacto | 3 s | **2 s** |
| Intervalo até a próxima mão | 10 s | **5 s** |
| **Total** | **~19,5 s** | **~12 s** |

Numa mão que vai até o fim de verdade nada mudou: ali há duas mãos para ler e
comparar, e o tempo é bem gasto.

⚠️ **Estes números são decisão sua, não minha.** Se achar que ficou rápido ou
lento demais, são constantes soltas no código e eu ajusto em minutos.

---

### Problema 5 · O jogo diz "Você correu" para quem não correu

**O que você veria acontecer**

Você tem 20 segundos para decidir cada jogada. Se você se distrai e o tempo
acaba, o jogo **joga por você** — e a jogada segura é desistir.

Aí aparece na tela: *"**Você** correu — deseja mostrar sua mão para ele?"*, com
mais 5 segundos de espera.

**Por que é ruim**

Duas coisas erradas de uma vez:

1. **Você não correu.** A mesa correu por você. A frase afirma uma decisão que
   você não tomou.
2. Se o seu tempo acabou, o motivo mais provável é que **você não está olhando a
   tela**. Fazer outra pergunta de 5 segundos para alguém que acabou de provar
   que não está ali é só somar espera.

✅ **O que mudou**

A pergunta não aparece quando foi o relógio que correu a mão. Quem não decidiu
nada não é convidado a decidir mais nada — e a tela deixou de afirmar uma
decisão que a pessoa não tomou.

---

### Problema 6 · Se a página recarregar no meio da partida, o dinheiro some

⚠️ **Este é o mais grave da lista, e ele não é culpa da desistência** — só fica
mais fácil de acontecer por causa dela.

**O que você veria acontecer**

Você entra numa mesa. Nesse momento o jogo **tira as fichas do seu saldo** — é
como comprar fichas no caixa do cassino. Digamos, 1.000 créditos.

Você joga. Aí, no meio da partida, acontece qualquer uma dessas coisas:

- você atualiza a página (F5);
- você fecha e reabre o navegador;
- o celular bloqueia a tela e o navegador descarta a aba;
- chega uma ligação.

**Quando você volta, a mesa não existe mais. E os 1.000 créditos também não.**
Eles saíram do saldo e nunca voltaram, porque só voltam quando você se levanta
da mesa pelo caminho normal.

**Por que a desistência entra nisso**

Aquela pergunta de 5 segundos é uma pausa em que a mesa fica **parada esperando
você**. É exatamente o tipo de momento em que a pessoa troca de aba, atende o
telefone, deixa a tela bloquear. A desistência não criou o problema, mas criou
mais uma janela para ele acontecer.

**Por que acontece (a parte técnica, bem simples)**

O jogo salva no seu aparelho: **saldo**, **histórico de mãos** e **configurações**.

O jogo **não** salva: **a mesa em andamento**. Ela existe só na memória do
navegador, e memória de navegador some quando a página fecha.

✅ **O que mudou**

O jogo passou a guardar um **canhoto da compra de fichas**, junto com o saldo.
Pense num recibo do caixa do cassino:

- **você senta** → o recibo é criado: *"comprou 1.000, tem 1.000 na frente"*;
- **cada mão que termina** → o recibo é atualizado com quanto você tem agora;
- **você se levanta** → o recibo é rasgado e o dinheiro volta ao saldo.

Se o jogo abrir e encontrar um recibo pendurado, aquela mesa nunca foi fechada:
ele **paga o recibo** e o dinheiro volta, antes de qualquer outra coisa.

O detalhe que faz isso não virar trapaça: o recibo guarda **quanto você tinha na
frente**, não quanto você comprou. Se devolvesse o valor da compra, quem
estivesse perdendo apertaria F5 para desfazer o prejuízo. Do jeito que ficou,
recarregar devolve exatamente o que era seu naquele momento — nem mais, nem
menos.

**Nada de dinheiro some mais.** Nem no F5, nem na aba descartada, nem na ligação
que bloqueia a tela.

---

### Problema 7 · Duas mensagens dizendo a mesma coisa no mesmo instante

**O que você veria acontecer**

Quando alguém corre, o jogo mostra uma plaquinha no meio da mesa escrito
"CORREU". No mesmíssimo instante, a caixa de pergunta abre por cima — e ela
também diz quem correu, na primeira linha.

Resultado: a plaquinha é desenhada, fica 1,8 segundo no ar, e **ninguém nunca a
vê**, porque está coberta.

**Por que é ruim**

Pouco, na verdade. A informação não se perde (a caixa diz a mesma coisa). É
desperdício, não defeito grave. Está na lista por completude.

✅ **O que mudou**

A plaquinha não é mais desenhada quando a caixa de pergunta vai entrar em cima
dela.

---

## Parte 4 — O placar

| # | Problema | Situação |
| --- | --- | --- |
| 1 | Só você podia esconder as cartas | ✅ resolvido |
| 2 | O bilhete esquecido fechava a mesa sozinha | ✅ resolvido |
| 3 | Pergunta com a mesa já acabada | ✅ resolvido |
| 4 | 20 segundos de cena para uma mão de um lance | ✅ resolvido (~12 s) |
| 5 | "Você correu" para quem não correu | ✅ resolvido |
| 6 | Dinheiro sumindo no F5 | ✅ resolvido |
| 7 | Duas mensagens iguais no mesmo instante | ✅ resolvido |

**O que ficou como decisão sua, não minha:** os tempos do problema #4. Encurtar a
cena de uma desistência é questão de gosto, não de certo e errado — se achar que
ficou apressado (ou ainda lento), são números soltos no código e eu mudo em
minutos.

Tudo o que entrou tem teste: **588 testes automáticos** rodam a cada mudança, e
14 deles dirigem o jogo de verdade num navegador, do menu ao caixa.

---

## Parte 5 — O que está certo (pode dormir tranquilo)

A auditoria também checou o que **não** tem problema. Vale saber, porque é o
coração do sistema:

✅ **As contas do dinheiro fecham.** Testei desistência simples, desistência
depois de aumento, e desistência contra alguém que apostou tudo. Em todos os
casos a soma das fichas da mesa continua a mesma — o dinheiro só troca de lado,
nunca aparece nem some.

✅ **Quem corre sempre perde.** Não importa se tinha a melhor mão do baralho. O
código nem chega a comparar as cartas — vai direto para "quem desistiu, perdeu".
É o correto.

✅ **O rival nunca desiste de graça.** O computador só considera desistir quando
há aposta na frente. Ele nunca joga uma mão fora podendo continuar sem pagar
nada, que seria bobagem.

✅ **Suas cartas são secretas de verdade.** As cartas do rival não são só
"escondidas na tela" — elas **nem chegam** na parte do código que desenha, até a
mão acabar. Não dá para trapacear inspecionando a página.

✅ **Não dá para responder a pergunta duas vezes.** Apertar MOSTRAR duas vezes
rápido, ou apertar no milésimo de segundo em que o tempo acaba, não bagunça nada.

✅ **Os relógios não se atropelam.** Quando a pergunta de 5 segundos aparece, o
relógio de 20 segundos da jogada já parou. Nunca há dois contando ao mesmo tempo.

---

## Onde continuar

Quando quiser mexer de verdade, a versão técnica é a [`corre.md`](corre.md) — ela
tem os nomes dos arquivos, os trechos de código e as contas conferidas.

E se quiser entender **por que** alguém corre no poker (a estratégia por trás),
o [`dmisterioso.md`](dmisterioso.md) explica a ordem em que os dois jogadores
falam — que é o que decide quem tem a chance de correr primeiro.
