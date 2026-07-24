import { MIN_STAKE } from '../engine/credits';

/**
 * Mesa de negociação do 1v1: tipos do chat e o negociador simulado.
 *
 * A conversa é dirigida pelo gameStore (que agenda os beats de
 * digitação e resposta); AQUI vive apenas a "cabeça" do oponente — uma
 * função pura de decisão injetável, no mesmo espírito da GameEngine:
 * os testes trocam o negociador por um stub determinístico e um futuro
 * modo online troca a cabeça local por mensagens do servidor.
 */

/** Autor de uma mensagem do chat de negociação. */
export type NegotiationAuthor = 'player' | 'opponent' | 'system';

/** Situação de uma proposta na mesa. */
export type ProposalStatus = 'pending' | 'superseded' | 'accepted';

export interface NegotiationMessage {
  id: string;
  author: NegotiationAuthor;
  /** `text` = fala/aviso · `proposal` = lance de créditos. */
  kind: 'text' | 'proposal';
  /** Fala do chat ou legenda do sistema. */
  text?: string;
  /** Valor em créditos (proposal). */
  amount?: number;
  /** Situação da proposta; só existe em `kind: 'proposal'`. */
  status?: ProposalStatus;
}

/** Contexto que o negociador enxerga a cada decisão. */
export interface NegotiatorContext {
  /** Saldo do jogador — teto de qualquer lance do oponente (uma
      proposta impagável travaria a mesa sem culpa do jogador). */
  balance: number;
}

/** Aceitar não tem fala: quem anuncia o acordo é o selo no cartão do
    lance e o CTA de início destravando — o chat não ganha mensagem. */
export type NegotiatorReply =
  | { action: 'accept' }
  | { action: 'counter'; amount: number; quip: string };

/** Cabeça do oponente na mesa de negociação. */
export interface Negotiator {
  /** Fala de abertura + proposta inicial (o bot sempre abre o jogo). */
  opening(context: NegotiatorContext): { greeting: string; amount: number };
  /** Reação a uma proposta do jogador. */
  respond(amount: number, context: NegotiatorContext): NegotiatorReply;
}

/**
 * Beats da presença do bot no chat, em ms — janelas [min, max] para os
 * delays "humanos" de ler, pensar e digitar. O store sorteia dentro
 * delas; os testes avançam os timers pelo máximo.
 */
export const BOT_BEATS = {
  /** Da entrada na mesa até o bot começar a digitar o cumprimento. */
  greetDelayMinMs: 900,
  greetDelayMaxMs: 1800,
  /** Digitação do cumprimento. */
  greetTypingMinMs: 900,
  greetTypingMaxMs: 1600,
  /** Pausa entre o cumprimento e digitar a proposta de abertura. */
  openDelayMinMs: 1100,
  openDelayMaxMs: 2100,
  /** Digitação da proposta de abertura. */
  openTypingMinMs: 1000,
  openTypingMaxMs: 1800,
  /** Da proposta do jogador até o bot começar a digitar a resposta. */
  replyDelayMinMs: 700,
  replyDelayMaxMs: 1500,
  /** Digitação da resposta (aceite ou contraproposta). */
  replyTypingMinMs: 1000,
  replyTypingMaxMs: 2100,
} as const;

/** Pior caso (delay + digitação) até a resposta do bot a uma proposta. */
export const BOT_REPLY_MAX_MS = BOT_BEATS.replyDelayMaxMs + BOT_BEATS.replyTypingMaxMs;

/** Pior caso da abertura completa (cumprimento + proposta inicial). */
export const BOT_OPENING_MAX_MS =
  BOT_BEATS.greetDelayMaxMs +
  BOT_BEATS.greetTypingMaxMs +
  BOT_BEATS.openDelayMaxMs +
  BOT_BEATS.openTypingMaxMs;

/** Aviso da mesa ao abrir a negociação. */
export const NEGOTIATION_INTRO =
  'Proponham valores e cheguem a um acordo para liberar o duelo.';

const GREETINGS: readonly string[] = [
  'E aí! Quanto vamos colocar na mesa?',
  'Boa! Vamos fechar o valor do duelo?',
  'Chegou a hora de negociar. Qual a sua oferta?',
  'Vamos direto ao ponto: quanto vale esse duelo?',
];

const COUNTER_QUIPS: readonly string[] = [
  'Muito pouco pra mim. Que tal assim?',
  'Consigo melhor que isso. Minha contraproposta:',
  'Hmm, sobe um pouco. Minha oferta:',
  'Quase lá. Fecha nesse valor?',
];

/** Arredonda para a dezena mais próxima, nunca abaixo do stake mínimo. */
function roundToTen(value: number): number {
  return Math.max(MIN_STAKE, Math.round(value / 10) * 10);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function pick<T>(rng: () => number, list: readonly T[]): T {
  const item = list[Math.floor(rng() * list.length)];
  return item ?? (list[0] as T);
}

/**
 * Negociador padrão: sorteia um valor-alvo proporcional ao saldo do
 * jogador (entre ~8% e ~40%, com teto de 500 créditos) e defende esse
 * valor cedendo a cada rodada — aceita na hora lances no alvo ou acima,
 * baixa o sarrafo a cada contraproposta e, à terceira recusa, fecha
 * qualquer lance válido. Assim toda negociação converge: o bot nunca
 * trava a mesa num impasse infinito.
 */
export function createBotNegotiator(rng: () => number = Math.random): Negotiator {
  let target: number | null = null;
  let counters = 0;

  const resolveTarget = (balance: number): number => {
    if (target !== null) return target;
    const cap = Math.max(MIN_STAKE, Math.min(500, balance));
    const share = 0.08 + rng() * 0.32;
    target = clamp(roundToTen(balance * share), MIN_STAKE, cap);
    return target;
  };

  return {
    opening(context) {
      const amount = resolveTarget(context.balance);
      return { greeting: pick(rng, GREETINGS), amount };
    },

    respond(amount, context) {
      const goal = resolveTarget(context.balance);
      // O sarrafo de aceite cede a cada contraproposta já feita:
      // 100% do alvo → 80% → 60% → aceita qualquer lance válido.
      const concession = [1, 0.8, 0.6][counters] ?? 0;
      const threshold = roundToTen(goal * concession);
      if (counters >= 3 || amount >= threshold) {
        return { action: 'accept' };
      }

      // Contraproposta no meio do caminho, sempre pagável pelo jogador.
      const middle = clamp(roundToTen((goal + amount) / 2), MIN_STAKE, context.balance);
      if (middle === amount) {
        return { action: 'accept' };
      }
      counters += 1;
      return { action: 'counter', amount: middle, quip: pick(rng, COUNTER_QUIPS) };
    },
  };
}
