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
 * A MESA ABERTA está DESLIGADA — toda sala de cash nasce FECHADA.
 *
 * Mesa aberta é a que continua na vitrine depois de começar: quem chega
 * senta numa cadeira vaga e entra na mão seguinte. Ela existe inteira no
 * projeto — o campo `mode` no lobby, o selo "Aberta" na vitrine, o texto
 * da ficha da sala e os testes —, e o que saiu foi a porta: a folha de
 * criação não pergunta mais, e a vitrine só sorteia mesas fechadas.
 *
 * O motivo de desligar é honestidade, não escopo: a entrada no meio da
 * sessão pede coisas que a mesa ainda não tem — cadeira que vaga e é
 * reocupada, blind obrigatório de quem entra fora da posição, e o corte
 * de sigilo para quem chega no meio de uma mão. Anunciar "Aberta" numa
 * sala em que ninguém entra é a vitrine mentindo.
 *
 * Reativar é mudar esta linha para `true`: a régua de entrada volta à
 * folha e a vitrine volta a sortear os dois modos. É o mesmo flag dos
 * outros dois acima, pelo mesmo motivo — um `git revert` de uma remoção
 * é caro e arriscado; um booleano é uma decisão que se desfaz.
 */
export const OPEN_TABLE_ENABLED = false;
