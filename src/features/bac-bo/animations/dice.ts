import type { DieValue } from '../engine/types';

/**
 * Rotação 3D (graus) que deixa cada valor de frente para a câmera.
 * Mapeamento das faces do cubo: 1 frente, 6 trás, 3 direita, 4 esquerda,
 * 2 topo, 5 base — pares opostos somam 7, como em dados reais.
 */
export const DIE_ROTATIONS: Record<DieValue, { x: number; y: number }> = {
  1: { x: 0, y: 0 },
  2: { x: -90, y: 0 },
  3: { x: 0, y: -90 },
  4: { x: 0, y: 90 },
  5: { x: 90, y: 0 },
  6: { x: 0, y: 180 },
};

/** Voltas extras durante o giro, para o dado nunca "andar de ré". */
export const ROLL_EXTRA_SPINS = 2;
