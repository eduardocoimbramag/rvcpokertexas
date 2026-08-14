import type { DealerReaction } from './DealerController';

/**
 * ROSTO da crupiê — a arte nova traz três jogos de peças faciais
 * (`public/dealernova/semvar|varfeliz|vartriste`), e é a REAÇÃO que
 * escolhe qual entra:
 *
 * - `neutra`: boca/pupila/sobrancelha padrão (a montagem de repouso);
 * - `feliz`: troca só a boca (sorriso aberto) — é o que a pasta oferece;
 * - `triste`: troca boca, pupila e sobrancelha, e acende as lágrimas.
 *
 * A separação existe porque o rosto e o CORPO não andam juntos: a
 * crupiê pode comemorar de rosto feliz enquanto o corpo faz o pulo, e
 * pode estar de rosto triste num gesto de consolo que o corpo conduz
 * devagar. Uma tabela só para as duas coisas amarraria os dois.
 */
export type DealerFace = 'neutra' | 'feliz' | 'triste';

const FACE_BY_REACTION: Record<DealerReaction, DealerFace> = {
  idle: 'neutra',
  greet: 'feliz',
  // Confirmação de duelo e apostas: o convite é de boas-vindas, e é o
  // ROSTO que o faz. Cara neutra ao lado de um "PARTIDA CONFIRMADA" lê
  // como tédio.
  present: 'feliz',
  anticipate: 'neutra',
  shake: 'neutra',
  reveal: 'neutra',
  // LUCRO na mesa: é aqui que ela comemora.
  celebrate: 'feliz',
  // PREJUÍZO na mesa: é aqui que ela se entristece (com lágrima).
  console: 'triste',
  shrug: 'neutra',
  // Erro: cara de "desculpa" — triste, mas sem chorar por um bug.
  apologize: 'triste',
};

/** Só a derrota chora: o pedido de desculpas usa o mesmo rosto, seco. */
const REACOES_COM_LAGRIMA: ReadonlySet<DealerReaction> = new Set<DealerReaction>(['console']);

export function faceForReaction(reaction: DealerReaction): DealerFace {
  return FACE_BY_REACTION[reaction];
}

export function tearsForReaction(reaction: DealerReaction): boolean {
  return REACOES_COM_LAGRIMA.has(reaction);
}

/**
 * POSE DE BRAÇOS por reação (docs/antebraco.md, solução B) — os braços
 * não articulam o cotovelo: trocam de POSE, cada uma uma arte pronta do
 * designer com o encaixe já resolvido no desenho:
 *
 * - `repouso`: mãos cruzadas no ventre (as quatro peças de sempre);
 * - `palmas`: mãos erguidas batendo palmas — a pose do LUCRO.
 *
 * O `repouso` é o PADRÃO, e não um fallback: é a única montagem em que o
 * encaixe das peças é perfeito. Toda reação que não tem um gesto de
 * braço próprio a serviço dela fica aqui, e a emoção vem do corpo, do
 * rosto e das lágrimas — inclusive a derrota (postura recolhida, mãos no
 * ventre, lágrimas por cima; ver tearsForReaction) e a confirmação de
 * duelo (o convite mora no sorriso).
 *
 * Houve uma terceira pose, `apresenta` (mão estendida), usada pelo
 * `present`. Foi RETIRADA: a arte não cabe no quadro do rig — a mão caía
 * fora do viewBox e o braço superior ficava solto, sem nada ligando o
 * ombro à mão. O diagnóstico e os números de volta estão em
 * docs/antebraco.md.
 */
export type BracoPose = 'repouso' | 'palmas';

const POSE_BY_REACTION: Record<DealerReaction, BracoPose> = {
  idle: 'repouso',
  greet: 'repouso',
  present: 'repouso',
  anticipate: 'repouso',
  shake: 'repouso',
  reveal: 'repouso',
  celebrate: 'palmas',
  console: 'repouso',
  shrug: 'repouso',
  apologize: 'repouso',
};

export function bracosForReaction(reaction: DealerReaction): BracoPose {
  return POSE_BY_REACTION[reaction];
}
