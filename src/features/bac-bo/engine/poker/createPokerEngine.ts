import type { LocalPokerEngineOptions } from './LocalPokerEngine';
import { LocalPokerEngine } from './LocalPokerEngine';
import type { PokerEngine } from './PokerEngine';

export type PokerEngineMode = 'local' | 'api';

export interface CreatePokerEngineConfig {
  mode?: PokerEngineMode;
  local?: LocalPokerEngineOptions;
}

/**
 * Factory da engine de poker. Único ponto de criação em toda a
 * aplicação: quando o backend existir, `mode: 'api'` passará a retornar
 * uma `ApiPokerEngine` sem nenhuma mudança nos consumidores.
 */
export function createPokerEngine(config: CreatePokerEngineConfig = {}): PokerEngine {
  const mode = config.mode ?? 'local';

  switch (mode) {
    case 'local':
      return new LocalPokerEngine(config.local);
    case 'api':
      throw new Error(
        'ApiPokerEngine ainda não implementada. Use mode: "local" até o backend existir.',
      );
  }
}
