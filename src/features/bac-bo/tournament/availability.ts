/**
 * O TORNEIO ESTÁ NO AR?
 *
 * Uma chave, e é ela que a Home lê para acender ou apagar o botão. O
 * modo inteiro continua no projeto — telas, store, chaveamento, simulação
 * e a suíte de e2e —, e nada dele foi removido: o que muda é apenas se a
 * porta de entrada abre.
 *
 * Existe porque o torneio ainda não está pronto para ser mostrado, e a
 * alternativa seria comentar código ou apagar a rota — as duas apodrecem
 * em uma semana e voltam com merge conflict. Uma constante volta com uma
 * edição de um caractere.
 *
 * QUEM MAIS LÊ ISTO: `e2e/tournament-flow.spec.ts` pula a suíte inteira
 * quando a chave está desligada. Os testes não são apagados nem marcados
 * com `.skip` na mão — eles voltam a rodar sozinhos no mesmo commit em
 * que o botão voltar a abrir, e é isso que impede o modo de morrer sem
 * ninguém perceber.
 */
export const TOURNAMENT_ENABLED = false;

/** O que o botão diz quando a porta está fechada. */
export const TOURNAMENT_SOON_HINT = 'Em breve';
