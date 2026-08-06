import type { TableTurn } from '../../engine/types';

/**
 * O VOCABULÁRIO DA MESA DE 21 — o relógio da vez, a revelação dos dois
 * lances e o pedido de dobra.
 *
 * Ele morou no `gameStore` enquanto o 1v1 era um duelo de blackjack. O
 * 1v1 hoje é Texas Hold'em (ver `engine/poker`), e estes tipos passaram a
 * descrever apenas a mesa que sobrou com as regras de 21: a MESA ÚNICA
 * DO TORNEIO, desenhada pela `HandsArena`.
 *
 * Por isso eles moram aqui, ao lado dela, e não num store que não os usa
 * mais: quem define o vocabulário de uma cena é a cena.
 */

/**
 * As quatro cenas da mesa de 21, e as únicas que a `HandsArena` conhece:
 * as cartas saindo do baralho, a vez dos duelistas, o showdown e o
 * desfecho.
 *
 * É um tipo PRÓPRIO, e não a fase do `gameStore`, porque a mesa que o
 * usa hoje é a do torneio — que tem uma máquina de estados só dela.
 * Amarrá-la à fase do 1v1 obrigava a arena a falar a língua de um fluxo
 * que ela não vive.
 */
export type DuelPhase = 'dealing' | 'turn' | 'settle' | 'completed';

/** Segundos que cada duelista tem para escolher o lance da vez. */
export const TURN_SECONDS = 20;

/**
 * O relógio da vez corrente. Os dois escolhem AO MESMO TEMPO: o que a
 * mesa mostra do outro lado é só se ele já bateu o martelo — nunca o
 * que ele escolheu.
 */
export interface TurnClock {
  /** Segundos restantes (TURN_SECONDS → 0); 0 fora de uma vez sua. */
  seconds: number;
  /** O rival já travou a escolha dele. */
  opponentReady: boolean;
}

/**
 * Os dois lances de uma vez, revelados JUNTOS pela mesa. O `id` é o que
 * faz duas vezes idênticas entrarem em cena duas vezes: sem ele a
 * animação não teria como saber que houve uma revelação nova.
 */
export interface TurnReveal extends TableTurn {
  id: string;
}

/**
 * Pedido de dobra da aposta no meio da mão.
 *
 * `status` é o estado do pedido NA RODADA: 'idle' é ninguém tendo pedido
 * ainda — é ele que libera o botão, e por isso a resposta (aceita ou
 * recusada) não volta para 'idle': cada mão admite um pedido só. `open`
 * governa apenas a nuvem em cena, que sai um beat depois.
 */
export type DoubleBetStatus = 'idle' | 'pending' | 'accepted' | 'declined';

export interface DoubleBetState {
  status: DoubleBetStatus;
  /** Valor que a mesa passa a valer se o rival topar (o dobro do stake). */
  amount: number;
  /** A nuvem do pedido está em cena. */
  open: boolean;
}
