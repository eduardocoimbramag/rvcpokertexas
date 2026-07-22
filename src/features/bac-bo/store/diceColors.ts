/**
 * As duas cores de dado da mesa. O vencedor do cara-ou-coroa escolhe
 * com qual delas joga — e a outra fica para o adversário, então a
 * escolha é sempre uma TROCA entre os dois lados, nunca uma terceira
 * cor entrando na mesa.
 */

export type DiceColorId = 'azul' | 'vermelho';

export interface DiceColorDef {
  id: DiceColorId;
  /** Nome exibido nos cartões e anúncios ("dados Vermelhos"). */
  label: string;
  /** Extremos do degradê da face (mesmo eixo 145° das faces do dado). */
  gradientA: string;
  gradientB: string;
}

/* Exatamente as tintas históricas de .die-face--player/--opponent: a
   troca muda de lado quem usa cada uma, não as cores da mesa. */
export const DICE_COLORS: Record<DiceColorId, DiceColorDef> = {
  azul: { id: 'azul', label: 'Azuis', gradientA: '#60a5fa', gradientB: '#1d4ed8' },
  vermelho: { id: 'vermelho', label: 'Vermelhos', gradientA: '#f87171', gradientB: '#b91c1c' },
};

/** Ordem de exibição dos cartões de escolha. */
export const DICE_COLOR_LIST: readonly DiceColorDef[] = [DICE_COLORS.azul, DICE_COLORS.vermelho];

/** Cor de cada lado da mesa na rodada corrente. */
export interface DiceColors {
  player: DiceColorId;
  opponent: DiceColorId;
}

/** Azul do jogador e vermelho do oponente: as cores clássicas da mesa. */
export const DEFAULT_DICE_COLORS: DiceColors = { player: 'azul', opponent: 'vermelho' };

export function otherColor(color: DiceColorId): DiceColorId {
  return color === 'azul' ? 'vermelho' : 'azul';
}

/** Distribui as cores a partir da escolha do vencedor do sorteio. */
export function assignColors(winner: 'player' | 'opponent', color: DiceColorId): DiceColors {
  return winner === 'player'
    ? { player: color, opponent: otherColor(color) }
    : { opponent: color, player: otherColor(color) };
}

/** Escolha do oponente simulado entre as duas cores. */
export function pickOpponentColor(rng: () => number): DiceColorId {
  return rng() < 0.5 ? 'azul' : 'vermelho';
}
