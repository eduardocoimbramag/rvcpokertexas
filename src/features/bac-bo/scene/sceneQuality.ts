import type { SceneQualitySetting } from '../services/GameStorageService';

/** Qualidade efetiva de renderização da cena. */
export type SceneQuality = 'high' | 'low' | 'off';

/**
 * Heurística de aparelho fraco (docs/scenario.md §10.2): poucos núcleos
 * lógicos → rebaixa automaticamente para 'low'. Avaliada uma única vez.
 */
const AUTO_LOW = typeof navigator !== 'undefined' && (navigator.hardwareConcurrency ?? 8) <= 4;

/**
 * Resolve a qualidade efetiva da cena a partir da preferência do jogador,
 * de `prefers-reduced-motion` e da heurística de hardware.
 */
export function resolveSceneQuality(
  setting: SceneQualitySetting,
  reducedMotion: boolean,
): SceneQuality {
  if (setting === 'off') return 'off';
  if (setting === 'low') return 'low';
  return reducedMotion || AUTO_LOW ? 'low' : 'high';
}
