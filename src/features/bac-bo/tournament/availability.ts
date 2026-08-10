/**
 * O TORNEIO ESTÁ NO AR?
 *
 * Uma chave, e é ela que a Home lê para acender ou apagar o botão. O
 * modo inteiro continua no projeto — telas, store, chaveamento, simulação
 * e a suíte de e2e —, e nada dele foi removido: o que muda é apenas se a
 * porta de entrada abre.
 *
 * Ela nasceu desligada por um dia, para uma apresentação em que o modo
 * ainda não devia aparecer. A alternativa teria sido comentar código ou
 * apagar a rota — as duas apodrecem em uma semana e voltam com merge
 * conflict. Uma constante volta com uma edição de um caractere, e foi
 * exatamente o que aconteceu.
 *
 * O QUE HÁ ATRÁS DELA HOJE é o torneio original: chaveamento mata-mata e
 * a mesa única de 21. NÃO é ainda o poker 6-max com lobby de mesa
 * aberta/fechada — esse está planejado em docs/multiplayer.md e vai
 * ocupar este mesmo botão quando existir.
 *
 * QUEM MAIS LÊ ISTO: `e2e/tournament-flow.spec.ts` pula a suíte inteira
 * quando a chave está desligada. Os testes não são apagados nem marcados
 * com `.skip` na mão — eles voltam a rodar sozinhos no mesmo commit em
 * que o botão volta a abrir, e é isso que impede o modo de morrer sem
 * ninguém perceber.
 */
export const TOURNAMENT_ENABLED = true;

/** O que o botão diz quando a porta está fechada. */
export const TOURNAMENT_SOON_HINT = 'Em breve';

/**
 * OS MODOS DE BLACKJACK — chaveamento e mesa única — estão DESLIGADOS.
 *
 * Eles continuam inteiros no projeto (telas, store, regras e testes de
 * unidade): o que saiu foi a porta de entrada. A folha de criação virou
 * uma folha de POKER — você escolhe quantas pessoas sentam, não que jogo
 * se joga —, e a vitrine passou a anunciar só mesas de poker.
 *
 * Reativar é mudar esta linha para `true`: a régua de formatos volta à
 * folha de criação e a vitrine volta a sortear os três formatos.
 *
 * O flag existe pelo mesmo motivo do de cima: um `git revert` de uma
 * remoção é caro e arriscado; um booleano é uma decisão que se desfaz.
 */
export const BRACKET_ENABLED = false;
