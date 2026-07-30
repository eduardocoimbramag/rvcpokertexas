import { handValue, isBust, isNaturalBlackjack } from '../engine/rules';
import type { Card } from '../engine/types';
import { TABLE_TARGET_WINS } from './types';

/**
 * Regras puras da MESA ÚNICA (3 a 6 jogadores no mesmo feltro).
 *
 * Nenhuma função aqui tem efeito colateral: recebem mãos/pontos e
 * devolvem vereditos. É a única fonte de verdade da série — store e UI
 * nunca recalculam nada disto.
 *
 * O jogo: rodada após rodada de 21, todos na mesma mesa. A melhor mão
 * leva a rodada e ganha 1 ponto; o primeiro a 3 pontos leva 90% do bolo
 * (a comissão da casa é a mesma de todo o jogo).
 *
 * Empate é o coração das regras:
 * - EMPATE COMUM: todos que dividem a melhor mão ganham 1 ponto. A mesa
 *   segue com mais gente perto do título.
 * - EMPATE NA RODADA QUE DECIDE: se o ponto do empate fecharia a série de
 *   ALGUÉM, ninguém pontua — a mesa joga uma RODADA DE DESEMPATE entre os
 *   empatados, e quem está fora dela assiste (ver `judgeTableRound`).
 *   NINGUÉM é campeão por EMPATAR a mão que decide a mesa: o título e o
 *   bolo se ganham vencendo. O desempate que empatar de novo gera outro
 *   desempate, e a série nunca fecha em dois campeões.
 * - NINGUÉM SALVA A MÃO: rodada em que todos estouram não tem melhor mão,
 *   então não distribui ponto nenhum — a mesa redistribui as cartas.
 */

/** Situação de um assento no showdown, pronta para comparação. */
export interface TableStanding {
  playerId: string;
  /** Melhor total da mão (acima de 21 é estouro). */
  total: number;
  bust: boolean;
  /** Blackjack natural: 21 nas duas primeiras cartas. */
  natural: boolean;
}

/** Lê a mão de um assento como uma situação de showdown. */
export function tableStandingOf(playerId: string, hand: readonly Card[]): TableStanding {
  return {
    playerId,
    total: handValue(hand).total,
    bust: isBust(hand),
    natural: isNaturalBlackjack(hand),
  };
}

/**
 * Os donos da melhor mão da mesa — um, se houver um só; vários, se
 * houver empate; NENHUM, se todos estouraram (ninguém tem mão).
 *
 * A hierarquia é a mesma do duelo 1v1, estendida a N mãos: estouro perde
 * para qualquer mão viva, o blackjack natural ganha de um 21 montado em
 * três ou mais cartas, e no resto vale o total mais alto.
 */
export function bestTableHands(standings: readonly TableStanding[]): string[] {
  const alive = standings.filter((s) => !s.bust);
  if (alive.length === 0) return [];

  // Um natural na mesa rebaixa todo mundo que não tenha um: um 21 de três
  // cartas não alcança a mão perfeita.
  const naturals = alive.filter((s) => s.natural);
  const field = naturals.length > 0 ? naturals : alive;

  const best = Math.max(...field.map((s) => s.total));
  return field.filter((s) => s.total === best).map((s) => s.playerId);
}

/** Pontos de cada assento na série (o contador de 3). */
export type TableWins = Readonly<Record<string, number>>;

/**
 * Veredito de uma rodada da mesa.
 *
 * - `void`     — ninguém salvou a mão: a mesa redistribui, sem pontos.
 * - `points`   — os vencedores pontuam; `championId` sai preenchido
 *                quando o ponto fecha a série de alguém.
 * - `tiebreak` — o ponto coroaria dois ou mais: rodada de desempate
 *                entre `contenders`, e quem está fora assiste.
 */
export type TableRoundVerdict =
  | { kind: 'void' }
  | { kind: 'points'; winners: string[]; championId: string | null }
  | { kind: 'tiebreak'; contenders: string[] };

/**
 * Julga uma rodada: recebe as mãos de QUEM JOGOU (numa rodada de
 * desempate isso é só o grupo empatado) e o contador de vitórias da
 * série, e devolve o que a mesa faz a seguir.
 *
 * O mesmo veredito serve para rodada comum e para desempate — e é isso
 * que faz a série sempre convergir: um desempate que empata de novo cai
 * outra vez em `tiebreak`, com um grupo menor ou igual, e um vencedor
 * único fecha (ou continua) a série pelas regras normais.
 */
export function judgeTableRound(
  standings: readonly TableStanding[],
  wins: TableWins,
  target: number = TABLE_TARGET_WINS,
): TableRoundVerdict {
  const winners = bestTableHands(standings);
  if (winners.length === 0) return { kind: 'void' };

  // Quem fecharia a série com o ponto desta rodada.
  const deciding = winners.filter((id) => (wins[id] ?? 0) + 1 >= target);

  /* A RODADA QUE DECIDE não se resolve por empate. Basta UM dos
     empatados estar a um ponto do título para a mesa ir ao desempate:
     ninguém leva o bolo por ter EMPATADO a mão decisiva, e dois campeões
     de uma vez não existem (o pote é um só). Ninguém pontua aqui — o
     ponto é do desempate.

     Vão ao desempate TODOS os empatados, não só os que fecham a série:
     eles dividiram a melhor mão, então é entre eles que a mão se
     repete. Quem estava longe do título e vence o desempate leva só o
     ponto, e a mesa continua. */
  if (winners.length >= 2 && deciding.length >= 1) {
    return { kind: 'tiebreak', contenders: winners };
  }

  return { kind: 'points', winners, championId: deciding[0] ?? null };
}

/** Aplica o ponto da rodada ao contador da série. */
export function awardTableWins(wins: TableWins, winners: readonly string[]): Record<string, number> {
  const next: Record<string, number> = { ...wins };
  for (const id of winners) next[id] = (next[id] ?? 0) + 1;
  return next;
}

/**
 * Ordem do placar da série: mais vitórias primeiro e, empatado, a ordem
 * de assento (estável — o placar não dança entre rodadas).
 */
export function tableStandingsOrder(
  playerIds: readonly string[],
  wins: TableWins,
): string[] {
  return [...playerIds].sort((a, b) => {
    const diff = (wins[b] ?? 0) - (wins[a] ?? 0);
    return diff !== 0 ? diff : playerIds.indexOf(a) - playerIds.indexOf(b);
  });
}
