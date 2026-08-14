# O antebraço da crupiê — diagnóstico e todas as saídas

> **RESOLVIDO — solução B (poses prontas), com arte do designer.** As peças de
> `public/dealernova/varantebraco/` chegaram depois desta doc: mão estendida
> (confirmação de duelo), e as duas mãos de palmas (lucro) — braços completos
> com o cotovelo já resolvido no desenho. A solução A (tampa circular) foi
> implementada, avaliada em tela e **revertida**: mesmo com o anel fino ou em
> tom de sombreado, o círculo lia como articulação de manequim. O sistema de
> poses vive em `NovaDealer.tsx` (camadas com crossfade) + `bracosForReaction`
> (`dealerExpression.ts`); o repouso segue pinado. Detalhes na seção
> correspondente de `animacaodealer.md`.

Este documento existe porque o encaixe braço/antebraço já passou por **quatro
correções** e continua imperfeito. Antes de listar as soluções, ele explica o
motivo de o problema resistir: **não é bug de código — é uma limitação da arte**,
e nenhum ajuste de posição, pivô ou ângulo consegue eliminá-la por completo. As
soluções de verdade mexem na arte (algumas eu mesmo executo em minutos; uma é
espec para o designer).

---

## 1. O diagnóstico de raiz — por que ajustar números nunca vai resolver

As duas peças vêm de SVGs separados:

| Peça                  | Terminação na articulação                            | Meia-largura |
| --------------------- | ---------------------------------------------------- | -----------: |
| `braco-*.svg`         | Calota arredondada, quase um círculo                 | **~30,2** (com contorno de ~5) |
| `anteb-*.svg`         | Topo estreito que alarga em diagonal                 | **~26,5**    |

E cada uma carrega o **próprio contorno preto** por toda a volta.

O encaixe atual é uma coincidência calibrada: na pose de repouso, os contornos
de uma continuam nos da outra e a emenda some. Mas **as larguras são
diferentes**, então qualquer rotação relativa quebra a coincidência — e quebra
dos dois jeitos:

- **girando o antebraço**: o arco de contorno do topo dele atravessa o braço
  como uma linha preta solta, e na silhueta abre um degrau de ~4 unidades;
- **sem girar nada** (gesto só no ombro): o encaixe fica correto, mas aí o
  antebraço nunca se move — as mãos vivem cruzadas, que é rigidez inaceitável.

A conclusão importa porque fecha a porta dos "ajustes": **peças de larguras
diferentes, cada uma com contorno próprio, não têm NENHUMA posição que
sobreviva a rotação**. A única forma geométrica invariante à rotação é um
**círculo centrado no pivô** — e é disso que as soluções boas derivam.

### O que já foi tentado (e o que cada tentativa provou)

| Tentativa                                        | Resultado                                                                                 |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Encaixe tangente (eixo do antebraço pelo centro da calota) | Perfeito **parado**; quebra ao primeiro gesto. Provou que posição não basta.        |
| "Pino" (travar o antebraço, gesto só no ombro)   | Emenda some, movimento morre — mãos sempre cruzadas. Rejeitado por rigidez.                |
| "Fecho" com contorno (braço redesenhado por cima, disco r=33) | O anel do contorno da calota aparecia sobre o antebraço como traço de manga. Rejeitado. |
| "Fecho" só-miolo (disco r=25, apenas pele) — **estado atual** | Apaga as emendas internas; nas rotações grandes ainda sobram pontas de contorno e o degrau da silhueta. Melhor até agora, insuficiente. |

---

## 2. As soluções possíveis

### A. Tampa circular casada no antebraço ⭐ RECOMENDADA

**Ideia**: editar os dois SVGs do antebraço acrescentando, POR CIMA da arte
existente na região do cotovelo, um **círculo de pele com contorno preto**, do
mesmo raio da calota do braço (contorno externo em r=30,2, traço ~5, igual ao
da arte), centrado exatamente no ponto da peça que cai sobre o pivô do cotovelo
(local: x=29,9 y=10,8 no `anteb-dir`; x=210,0 y=10,8 no `anteb-esq`).

**Por que funciona em qualquer ângulo, por construção**: o círculo gira sobre o
próprio centro, então é **invariante à rotação** — a articulação fica idêntica
em todas as poses. Ele cobre o arco de contorno problemático do topo do
antebraço (viaja junto com a peça) e cobre a calota do braço por inteiro (mesmo
raio, mesmo centro, desenhado na camada de cima). O que se vê, sempre: o braço
terminando num cotovelo redondo de onde o antebraço sai — um cotovelo de
desenho, com o MESMO traço da arte original.

**Custo visual**: a linha do círculo aparece também no repouso — um cotovelo
levemente marcado, constante e intencional, no lugar de defeitos que mudam a
cada pose. É o padrão dos rigs de recorte profissionais (a arte já é desenhada
assim quando nasce para animar).

**Trabalho**: eu executo. Editar 2 SVGs (círculo + estender o viewBox ~20
unidades para cima), atualizar 2 números em `dealerRig.ts`, **remover o fecho**
(deixa de ser necessário — hoje são 2 clipPaths + 2 redesenhos por frame).

| Qualidade | Esforço | Risco | Quem faz |
| --------- | ------- | ----- | -------- |
| Alta e CONSTANTE em todas as poses | ~30 min | Baixo (mudança pequena e reversível) | Eu, agora |

---

### B. Poses prontas de braço inteiro (bake por pose)

**Ideia**: abandonar a rotação do cotovelo. Para cada pose que o jogo usa
(repouso, apresentar, acenar, distribuir, comemorar, ombros), gerar **uma
imagem única de braço já montado** — braço+antebraço fundidos, emenda corrigida
uma única vez, à mão, naquela pose. O rig troca a imagem com crossfade e anima
só o ombro/corpo.

**Prós**: a articulação simplesmente deixa de existir — não há emenda nenhuma,
em pose nenhuma. É como personagens 2D de jogo grande fazem.
**Contras**: o movimento contínuo do cotovelo vira transição entre poses
(crossfade não é rotação — em gestos rápidos como o aceno, lê diferente);
são ~6 imagens novas por braço para gerar e retocar; qualquer pose nova no
futuro exige novo bake.

| Qualidade | Esforço | Risco | Quem faz |
| --------- | ------- | ----- | -------- |
| Máxima por pose, movimento menos fluido | 1–2 dias | Médio (retoque manual em cada bake) | Eu, com iteração |

---

### C. Encomendar as peças certas ao designer (a solução "de estúdio")

**Ideia**: quando o designer estiver disponível, pedir as duas peças
redesenhadas **para animação**, com a espec abaixo. É a versão profissional da
solução A, com o cotovelo desenhado pelo artista em vez de um círculo
geométrico.

**Espec para o designer** (copiar e colar):

> Preciso do braço e do antebraço terminando em **círculos concêntricos de
> mesmo raio** na articulação do cotovelo, para rig de recorte:
> - os dois com a terminação circular COMPLETA (360°), centrada no ponto de
>   pivô, com o contorno incluído no círculo;
> - raio idêntico nas duas peças (na arte atual: 30 unidades, traço de 5);
> - sobreposição: o antebraço deve invadir o braço até o centro do círculo;
> - entregar cada peça em SVG separado, no mesmo artboard/escala das atuais
>   (`anteb-dir/esq.svg`, `braco-dir/esq.svg`), com o pivô marcado.
>
> Com isso o antebraço pode girar qualquer ângulo sem abrir emenda.

| Qualidade | Esforço | Risco | Quem faz |
| --------- | ------- | ----- | -------- |
| A melhor possível | Depende do designer | Zero técnico | Designer (quando disponível) |

---

### D. Pino visível de boneco articulado

**Ideia**: assumir a estética de boneco: um botão/rebite desenhado no cotovelo
(círculo pequeno, tom da pele mais escuro ou dourado combinando com os brincos).
O olho lê "articulação proposital" em vez de "defeito".

**Contras**: muda o estilo da personagem — ela vira visivelmente uma marionete.
Já houve uma reação negativa ao aspecto "manequim" numa das tentativas.

| Qualidade | Esforço | Risco | Quem faz |
| --------- | ------- | ----- | -------- |
| Média (estilo divisivo) | ~20 min | Estético | Eu |

---

### E. Luvas de gala (mudança de figurino)

**Ideia**: vestir a crupiê com luvas compridas (opera gloves — combinam com o
vestido vermelho de cassino). As duas peças do braço são recoloridas para o tom
da luva; a emenda continua existindo, mas em superfície lisa de cor chapada ela
fica menos visível que na pele com sombreamento — e ganha um acabamento de
costura no cotovelo que a disfarça de vez.

**Contras**: mexe na identidade visual da personagem (decisão de direção de
arte, não técnica); o trabalho de recolorir mantendo o sombreamento é maior do
que parece; a emenda só fica *menos* visível — a raiz continua lá (precisaria
da tampa circular da solução A do mesmo jeito).

| Qualidade | Esforço | Risco | Quem faz |
| --------- | ------- | ----- | -------- |
| Média-alta SE a direção de arte quiser luvas | Meio dia | Estético + retrabalho | Eu, com aprovação prévia do visual |

---

### F. Gerar um antebraço novo por IA no estilo da arte

**Ideia**: gerar a peça inteira de novo, já com terminação circular.

**Por que fica por último**: manter o estilo exato do traço, sombreamento e da
MÃO desenhada é o ponto frágil — o risco de a peça nova destoar do resto do
corpo é alto, e cada iteração de geração+recorte+encaixe custa mais que a
solução A inteira. Só faz sentido se a A não agradar E o designer não existir.

| Qualidade | Esforço | Risco | Quem faz |
| --------- | ------- | ----- | -------- |
| Imprevisível | Alto | Alto (estilo destoante) | Eu, sem garantia |

---

### G. Conviver: manter o fecho atual e limitar os ângulos

**Ideia**: ficar como está (fecho só-miolo) e limitar o cotovelo a ~±15°, onde
os resíduos são pequenos. É o "não fazer nada" informado.

**Contras**: é o meio-termo que motivou esta doc — nem encaixe perfeito, nem
movimento pleno.

---

## 3. Comparação e recomendação

| Solução | Encaixe em QUALQUER ângulo | Movimento pleno | Esforço | Muda o estilo? |
| ------- | :------------------------: | :-------------: | :-----: | :------------: |
| **A. Tampa circular** ⭐ | ✅ por construção | ✅ | ~30 min | cotovelo levemente marcado |
| B. Poses prontas | ✅ (não há articulação) | 🟡 crossfade | 1–2 dias | não |
| C. Designer | ✅ | ✅ | externo | não (arte oficial) |
| D. Pino visível | ✅ | ✅ | ~20 min | sim (boneco) |
| E. Luvas | 🟡 disfarça | ✅ | meio dia | sim (figurino) |
| F. Peça por IA | ❓ | ✅ | alto | risco alto |
| G. Status quo | ❌ | 🟡 | zero | não |

**Recomendação: A agora, C quando o designer voltar.** A tampa circular é a
única opção que resolve *por construção* (não por calibragem), custa minutos,
é reversível e ainda simplifica o código (remove o fecho). Se o cotovelo
marcado incomodar no visual, o caminho seguinte natural é a B (poses prontas)
— e a espec da C fica pronta neste documento para quando houver designer.

---

*Contexto técnico para quem for executar: pivôs do cotovelo em coordenadas de
cena (1343.8, 557.3) e (1633.1, 557.3); peças `anteb-*` posicionadas em escala
1:1 com topo 10,8 acima do pivô; calota do braço com contorno externo em raio
30,2 e traço ~5. Histórico completo das tentativas em `animacaodealer.md`.*
