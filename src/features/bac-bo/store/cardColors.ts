/**
 * As duas cores de verso de carta da mesa. O vencedor do cara-ou-coroa
 * escolhe com qual delas joga — e a outra fica para o adversário, então
 * a escolha é sempre uma TROCA entre os dois lados, nunca uma terceira
 * cor entrando na mesa.
 */

export type CardColorId = 'azul' | 'vermelho';

export interface CardColorDef {
  id: CardColorId;
  /** Nome exibido nos cartões e anúncios ("cartas Vermelhas"). */
  label: string;
  /** Extremos do degradê do verso (mesmo eixo 145° das faces). */
  gradientA: string;
  gradientB: string;
}

/* Exatamente as tintas históricas dos dois lados da mesa: a troca muda
   de lado quem usa cada uma, não as cores da mesa. */
export const CARD_COLORS: Record<CardColorId, CardColorDef> = {
  azul: { id: 'azul', label: 'Azuis', gradientA: '#60a5fa', gradientB: '#1d4ed8' },
  vermelho: { id: 'vermelho', label: 'Vermelhas', gradientA: '#f87171', gradientB: '#b91c1c' },
};

/** Ordem de exibição dos cartões de escolha. */
export const CARD_COLOR_LIST: readonly CardColorDef[] = [
  CARD_COLORS.azul,
  CARD_COLORS.vermelho,
];

/** Cor do verso de cada lado da mesa na partida corrente. */
export interface CardColors {
  player: CardColorId;
  opponent: CardColorId;
}

/** Azul do jogador e vermelho do oponente: as cores clássicas da mesa. */
export const DEFAULT_CARD_COLORS: CardColors = { player: 'azul', opponent: 'vermelho' };

export function otherColor(color: CardColorId): CardColorId {
  return color === 'azul' ? 'vermelho' : 'azul';
}

/** Distribui as cores a partir da escolha do vencedor do sorteio. */
export function assignColors(winner: 'player' | 'opponent', color: CardColorId): CardColors {
  return winner === 'player'
    ? { player: color, opponent: otherColor(color) }
    : { opponent: color, player: otherColor(color) };
}

/**
 * Sorteio entre as duas cores. Serve ao oponente simulado quando é ele
 * quem ganha o cara-ou-coroa e à mesa quando o relógio da escolha zera
 * sem o jogador decidir.
 */
export function randomCardColor(rng: () => number): CardColorId {
  return rng() < 0.5 ? 'azul' : 'vermelho';
}
