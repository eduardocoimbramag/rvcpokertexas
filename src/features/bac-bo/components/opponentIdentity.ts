/**
 * SIGILO DO ADVERSÁRIO — quem está do outro lado da mesa não tem nome
 * até o valor do duelo estar fechado.
 *
 * O motivo é antifraude, não estético: com o nome (e o perfil) à vista
 * já no pareamento, dois jogadores combinados se reconhecem e usam a
 * rodada de negociação para empurrar créditos de uma conta para a outra
 * — o duelo vira fachada de transferência. Sem saber QUEM é o rival,
 * não há como combinar de antemão nem confirmar que o parceiro é ele.
 *
 * O corte é por FASE, e vale para tudo o que a tela escreve:
 *
 * - `search`, `confirm`, `negotiate` → o rival é "Oponente". Assento da
 *   confirmação, pílula do HUD, balões de proposta e avisos de espera
 *   usam este apelido, e nenhuma delas abre o perfil.
 * - do `found` em diante → o nome entra por extenso. A apresentação de
 *   duelo ("VOCÊ vs FULANO") foi posta DEPOIS do acordo justamente para
 *   ser esse momento: a essa altura o valor já está travado e não há
 *   mais o que combinar. Dali em diante o nome acompanha a mesa, e o
 *   desfecho ainda oferece o medalhão clicável que abre o perfil.
 *
 * O monograma dos medalhões deriva do nome exibido (ver AvatarBadge),
 * então usar o apelido também apaga a inicial do rival das telas
 * anônimas — de graça.
 */
export const OPPONENT_ALIAS = 'Oponente';
