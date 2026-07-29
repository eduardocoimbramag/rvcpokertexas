import { MIN_STAKE } from '../engine/credits';

/**
 * Mesa de negociação do 1v1 — fichas na mesa, sem chat.
 *
 * A aposta padrão já está no feltro quando a rodada abre; cada lado
 * pode empurrar um lance novo ao centro (um balão de proposta, no
 * mesmo vocabulário da nuvem de dobra) e o outro cobre ou recusa. O
 * relógio da rodada garante o término: zerou, vale o que está na mesa.
 *
 * O ritmo é dirigido pelo gameStore (que agenda os beats de resposta);
 * AQUI vive apenas a "cabeça" do oponente — uma função pura de decisão
 * injetável, no mesmo espírito da GameEngine: os testes trocam o
 * negociador por um stub determinístico e um futuro modo online troca
 * a cabeça local por mensagens do servidor.
 */

/** Autor de um lance na mesa. */
export type ProposalAuthor = 'player' | 'opponent';

/** Situação de um lance: vivo, coberto ou recusado. */
export type ProposalStatus = 'pending' | 'accepted' | 'declined';

/** Contexto que o negociador enxerga a cada decisão. */
export interface NegotiatorContext {
  /** Saldo do jogador — teto de qualquer lance do oponente (uma
      proposta impagável travaria a mesa sem culpa do jogador). */
  balance: number;
  /** Valor vivo na mesa (a aposta padrão ou o último lance coberto). */
  tableStake: number;
}

/**
 * Resposta do oponente a um lance do jogador. A recusa pode vir com
 * uma contraproposta — que entra na mesa como um lance novo dele.
 */
export type NegotiatorReply =
  | { action: 'accept' }
  | { action: 'decline'; counter: number | null };

/** Cabeça do oponente na mesa de negociação. */
export interface Negotiator {
  /** Lance espontâneo de abertura; `null` = a mesa está boa para ele. */
  opening(context: NegotiatorContext): number | null;
  /** Reação a um lance do jogador. */
  respond(amount: number, context: NegotiatorContext): NegotiatorReply;
}

/**
 * Beats da presença do bot na mesa, em ms — janelas [min, max] para os
 * delays "humanos" de olhar a mesa, pesar um lance e responder. O
 * store sorteia dentro delas; os testes avançam os timers pelo máximo.
 */
export const BOT_BEATS = {
  /** Da abertura da mesa até o lance espontâneo do bot (se houver). O
   *  piso fica ACIMA do título de abertura da fase (~2,6s + o beat de
   *  montagem): o balão dele nunca atropela o letreiro. */
  openDelayMinMs: 3400,
  openDelayMaxMs: 5200,
  /** De um lance do jogador até a resposta do bot. */
  replyDelayMinMs: 700,
  replyDelayMaxMs: 1600,
  /** Da recusa do bot até a contraproposta dele entrar na mesa. */
  counterDelayMinMs: 900,
  counterDelayMaxMs: 1700,
} as const;

/** Pior caso até a resposta do bot a um lance do jogador. */
export const BOT_REPLY_MAX_MS = BOT_BEATS.replyDelayMaxMs;

/** Pior caso até o lance espontâneo de abertura do bot. */
export const BOT_OPENING_MAX_MS = BOT_BEATS.openDelayMaxMs;

/**
 * Distância mínima entre o alvo do bot e a mesa para ele se dar ao
 * trabalho de propor — perto disso, a aposta padrão já está boa.
 */
const OPENING_GAP = 20;

/** Arredonda para a dezena mais próxima, nunca abaixo do stake mínimo. */
function roundToTen(value: number): number {
  return Math.max(MIN_STAKE, Math.round(value / 10) * 10);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Negociador padrão: sorteia um valor-alvo proporcional ao saldo do
 * jogador (entre ~8% e ~40%, com teto de 500 créditos) e defende esse
 * valor cedendo a cada recusa — cobre na hora lances no alvo ou acima,
 * baixa o sarrafo a cada contraproposta e, à terceira recusa, cobre
 * qualquer lance válido. Assim toda negociação converge: o bot nunca
 * trava a mesa, e o relógio da rodada fecha o que sobrar.
 */
export function createBotNegotiator(rng: () => number = Math.random): Negotiator {
  let target: number | null = null;
  let declines = 0;

  const resolveTarget = (balance: number): number => {
    if (target !== null) return target;
    const cap = Math.max(MIN_STAKE, Math.min(500, balance));
    const share = 0.08 + rng() * 0.32;
    target = clamp(roundToTen(balance * share), MIN_STAKE, cap);
    return target;
  };

  return {
    opening(context) {
      const goal = resolveTarget(context.balance);
      return Math.abs(goal - context.tableStake) >= OPENING_GAP ? goal : null;
    },

    respond(amount, context) {
      const goal = resolveTarget(context.balance);
      // O sarrafo de aceite cede a cada recusa já feita:
      // 100% do alvo → 80% → 60% → cobre qualquer lance válido.
      const concession = [1, 0.8, 0.6][declines] ?? 0;
      const threshold = roundToTen(goal * concession);
      if (declines >= 3 || amount >= threshold) {
        return { action: 'accept' };
      }

      // Contraproposta no meio do caminho, sempre pagável pelo jogador.
      const middle = clamp(roundToTen((goal + amount) / 2), MIN_STAKE, context.balance);
      if (middle === amount) {
        return { action: 'accept' };
      }
      declines += 1;
      return { action: 'decline', counter: middle };
    },
  };
}
