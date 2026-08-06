import { motion } from 'framer-motion';
import type { CSSProperties } from 'react';

import { Icon } from '@/shared/components/Icon';

import { TIMINGS } from '../../animations/timings';
import { CATEGORY_NAME, categoryLevel } from '../../engine/poker/handRank';
import type { HandRankSummary, PokerResult } from '../../engine/poker/types';
import type { Duelist } from '../../engine/types';

export interface ShowdownClashProps {
  /** Resultado da mão. Só há embate quando ela foi ao showdown. */
  result: PokerResult;
  opponentName: string;
  /** Movimento reduzido: o embate vira um quadro parado. */
  instant: boolean;
}

/* Os beats em segundos — o framer conta em segundos, o store em ms. */
const REVEAL_S = TIMINGS.revealMs / 1000;
const ENTER_S = TIMINGS.clashEnterMs / 1000;
const IMPACT_S = TIMINGS.clashImpactMs / 1000;
const VERDICT_S = TIMINGS.clashVerdictMs / 1000;

/** O instante em que as duas placas se tocam. */
const IMPACT_AT = REVEAL_S + ENTER_S;
/** O instante em que o veredito assume. */
const VERDICT_AT = IMPACT_AT + IMPACT_S;
/** A cena inteira, do mount ao último frame. */
const TOTAL_S = VERDICT_AT + VERDICT_S;

/**
 * As CINCO MARCAS da cena, como frações de 0 a 1:
 *
 *   0 ─── espera ─── entrada ─── impacto ─── veredito ─── 1
 *
 * Toda a coreografia mora numa keyframe por propriedade amarrada a estas
 * marcas. É de propósito: encadear três animações separadas por
 * `onComplete` deixaria um buraco de um frame entre elas — e num beat de
 * 1,8 s um buraco de frame é visível.
 *
 * A ESPERA no começo existe porque o embate divide o showdown com a
 * virada das cartas: durante `revealMs` as fechadas do rival estão
 * girando, e é isso que se tem de ver. As placas só entram depois.
 */
const MARKS = [0, REVEAL_S / TOTAL_S, IMPACT_AT / TOTAL_S, VERDICT_AT / TOTAL_S, 1];

/** Quantas fagulhas saem da colisão. */
const SPARKS = 14;

/**
 * O EMBATE DO FIM DA MÃO — o beat que transforma a comparação de duas
 * mãos num acontecimento.
 *
 * O problema que ele resolve: sem isso, o showdown é duas cartas
 * virando e, um segundo depois, uma tela dizendo VITÓRIA. O momento mais
 * importante da mão — a hora em que as duas mãos se medem — passava sem
 * ninguém ver a medição acontecer.
 *
 * ELE RODA TAMBÉM NA DESISTÊNCIA, e isso é uma escolha de jogo. Numa
 * sala de verdade quem desiste mucha e ninguém fica sabendo de nada; num
 * duelo de mão única, mostrar o que cada um tinha é a única leitura que
 * se consegue do adversário — e é ela que faz querer jogar de novo. Ver
 * que ele largou a melhor mão, ou que blefou com carta alta, é a
 * informação mais valiosa da partida, e ela só chega quando a mão já
 * acabou: não vaza nada.
 *
 * A CENA, em três batidas:
 *
 * 1. ENTRADA — a placa do rival desce da borda de cima, a sua sobe da de
 *    baixo, cada uma na cor do seu lado (vermelho e azul, a semântica
 *    que a casa já usa nas placas de placar). Cada uma traz a CATEGORIA
 *    em letras grandes, o detalhe que a completa e a FORÇA de 1 a 9.
 * 2. COLISÃO — elas se encontram no meio do feltro e batem: o clarão
 *    estoura e as fagulhas saem do ponto de impacto.
 * 3. VEREDITO — a placa perdedora é jogada para fora da mesa, girando;
 *    a vencedora fica, cresce e ganha a coroa. É a resposta à pergunta
 *    que a colisão fez.
 *
 * O EMPATE é a exceção e tem cena própria: as duas placas travam uma na
 * outra, nenhuma cede, e as duas ficam. Fazer uma "vencer" um empate
 * seria mentir sobre o que aconteceu na mesa.
 *
 * A FORÇA (1 a 9) é a CATEGORIA contada como as pessoas a contam, e a
 * placa é honesta sobre o que ela é: ordena categorias, não mãos. Dois
 * pares de Ases e dois pares de Reis marcam 3 os dois — e é por isso que
 * o detalhe fica logo abaixo dela: quando as forças empatam, é ele que
 * decide, e é para ele que o olho tem de ir.
 */
export function ShowdownClash({ result, opponentName, instant }: ShowdownClashProps) {
  const { playerRank, opponentRank, outcome, foldedBy } = result;
  const tie = outcome === 'tie';

  return (
    // aria-hidden: o embate é a ENCENAÇÃO de um veredito que o leitor de
    // tela já recebeu por extenso (ver o aria-live do App). Narrá-lo de
    // novo, em pedaços, só atrasaria quem ouve.
    <div className="clash" data-testid="showdown-clash" data-outcome={outcome} aria-hidden="true">
      <ClashPlate
        side="opponent"
        name={opponentName}
        rank={opponentRank}
        won={outcome === 'lose'}
        tie={tie}
        folded={foldedBy === 'opponent'}
        decidedBy={outcome === 'lose' ? result.decidedBy : undefined}
        instant={instant}
      />

      <ClashImpact tie={tie} instant={instant} />

      <ClashPlate
        side="player"
        name="Você"
        rank={playerRank}
        won={outcome === 'win'}
        tie={tie}
        folded={foldedBy === 'player'}
        decidedBy={outcome === 'win' ? result.decidedBy : undefined}
        instant={instant}
      />
    </div>
  );
}

interface ClashPlateProps {
  side: Duelist;
  name: string;
  rank: HandRankSummary;
  /** Esta placa levou o pote. */
  won: boolean;
  tie: boolean;
  /** Este lado largou a mão — o pote foi dele para o outro sem disputa. */
  folded: boolean;
  /**
   * A carta que decidiu, quando as duas mãos leram igual. Só a placa
   * VENCEDORA a recebe: é ela que tem o que explicar.
   */
  decidedBy?: string;
  instant: boolean;
}

/** Uma das duas placas do embate. */
function ClashPlate({ side, name, rank, won, tie, folded, decidedBy, instant }: ClashPlateProps) {
  const player = side === 'player';
  /** De que borda a placa entra: a sua sobe, a do rival desce. */
  const from = player ? 132 : -132;
  const level = categoryLevel(rank.category);
  const face = (
    <PlateFace
      name={name}
      rank={rank}
      level={level}
      won={won}
      folded={folded}
      decidedBy={decidedBy}
    />
  );

  /* Movimento reduzido: sem entrada, sem tranco, sem queda — a cena vira
     um quadro parado com as duas placas empilhadas e o veredito já dado.
     AS DUAS ficam, e não só a vencedora: o que a cena tem de mais útil é
     mostrar o que cada um tinha, e esconder a mão perdedora aqui tiraria
     de quem pediu menos movimento justamente a informação que ela
     carrega. */
  if (instant) {
    return (
      <div className={plateClass(side, { won, tie, still: true })} data-testid={`clash-${side}`}>
        {face}
      </div>
    );
  }

  /** O tranco do impacto: a placa avança contra a outra… */
  const nudge = player ? -14 : 14;
  /** …e onde ela para depois dele (a vencedora sobe ao centro). */
  const settle = tie ? nudge * 0.4 : player ? -30 : 30;

  const keyframes =
    won || tie
      ? {
          // Vencedora (ou empate): entra, bate e assume o centro.
          y: [from, from, 0, nudge, settle],
          opacity: [0, 0, 1, 1, 1],
          scale: [0.86, 0.86, 1, 1.06, tie ? 1 : 1.12],
          rotate: [0, 0, 0, 0, 0],
        }
      : {
          // Perdedora: entra, bate — e o impacto a joga para fora da mesa.
          y: [from, from, 0, nudge, from * 1.6],
          opacity: [0, 0, 1, 1, 0],
          scale: [0.86, 0.86, 1, 1.06, 0.68],
          rotate: [0, 0, 0, 0, player ? 12 : -12],
        };

  return (
    <motion.div
      className={plateClass(side, { won, tie, still: false })}
      data-testid={`clash-${side}`}
      initial={{ y: from, opacity: 0, scale: 0.86, rotate: 0 }}
      animate={keyframes}
      transition={{ duration: TOTAL_S, times: MARKS, ease: 'easeOut' }}
    >
      {face}
    </motion.div>
  );
}

/** O conteúdo da placa: quem é, o que tem e quanto isso vale. */
function PlateFace({
  name,
  rank,
  level,
  won,
  folded,
  decidedBy,
}: {
  name: string;
  rank: HandRankSummary;
  level: number;
  won: boolean;
  folded: boolean;
  decidedBy?: string;
}) {
  return (
    <>
      <span className="clash-plate__who">
        {won && <Icon name="crown" size={13} className="text-gold" />}
        {name}
      </span>
      <span className="clash-plate__body">
        <span className="clash-plate__category">{CATEGORY_NAME[rank.category]}</span>
        {/* Três coisas podem ocupar esta linha, nesta ordem de urgência:
            que este lado LARGOU a mão (a notícia da rodada, e o que
            revela o blefe), no que a mesa DECIDIU quando as duas leram
            igual, ou o detalhe que completa a categoria. */}
        {folded ? (
          <span className="clash-plate__detail clash-plate__detail--folded">desistiu</span>
        ) : decidedBy ? (
          <span className="clash-plate__detail clash-plate__detail--decider">
            decidiu no {decidedBy}
          </span>
        ) : (
          rank.detail && <span className="clash-plate__detail">{rank.detail}</span>
        )}
      </span>
      <span className="clash-plate__force" title="Força da mão, de 1 a 9">
        {level}
      </span>
    </>
  );
}

/**
 * O IMPACTO: o clarão e as fagulhas, no ponto exato em que as duas
 * placas se tocam.
 *
 * As fagulhas são DETERMINÍSTICAS (derivadas do índice, sem
 * `Math.random`): a mesma colisão sai igual em todo aparelho e em todo
 * teste — a bagunça é desenhada, não sorteada. É a mesma regra do pote
 * de fichas da casa (ver ChipStack).
 */
function ClashImpact({ tie, instant }: { tie: boolean; instant: boolean }) {
  if (instant) return null;

  return (
    <div className="clash-impact" data-testid="clash-impact">
      <motion.span
        className={`clash-impact__flash ${tie ? 'is-tie' : ''}`}
        initial={{ opacity: 0, scale: 0.2 }}
        animate={{ opacity: [0, 0, 0, 1, 0], scale: [0.2, 0.2, 0.3, 1.7, 2.6] }}
        transition={{ duration: TOTAL_S, times: MARKS, ease: 'easeOut' }}
      />
      {Array.from({ length: SPARKS }, (_, index) => {
        // Leque completo em volta do impacto, alternando entre fagulhas
        // curtas e longas para a explosão não sair como um anel.
        const angle = (index / SPARKS) * Math.PI * 2;
        const reach = 44 + (index % 3) * 28;
        const x = Math.cos(angle) * reach;
        const y = Math.sin(angle) * reach;
        return (
          <motion.span
            key={index}
            className="clash-spark"
            style={{ '--spark-tint': index % 2 === 0 ? '#ffd8a4' : '#ff9250' } as CSSProperties}
            initial={{ opacity: 0, x: 0, y: 0, scale: 0.4 }}
            animate={{
              opacity: [0, 0, 0, 1, 0],
              x: [0, 0, 0, x, x * 1.55],
              y: [0, 0, 0, y, y * 1.55],
              scale: [0.4, 0.4, 0.4, 1, 0.15],
            }}
            transition={{ duration: TOTAL_S, times: MARKS, ease: 'easeOut' }}
          />
        );
      })}
    </div>
  );
}

/** Classe da placa, com os modificadores de lado e de desfecho. */
function plateClass(
  side: Duelist,
  { won, tie, still }: { won: boolean; tie: boolean; still: boolean },
): string {
  return [
    'clash-plate',
    `clash-plate--${side}`,
    won ? 'clash-plate--won' : '',
    tie ? 'clash-plate--tie' : '',
    still ? 'clash-plate--still' : '',
  ]
    .filter(Boolean)
    .join(' ');
}
