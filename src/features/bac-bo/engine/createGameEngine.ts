import type { GameEngine } from './GameEngine';
import type { LocalEngineOptions } from './LocalBlackjackGameEngine';
import { LocalBlackjackGameEngine } from './LocalBlackjackGameEngine';

export type GameEngineMode = 'local' | 'api';

export interface CreateGameEngineConfig {
  mode?: GameEngineMode;
  local?: LocalEngineOptions;
}

/**
 * Factory da engine. Único ponto de criação em toda a aplicação:
 * quando o backend existir, `mode: 'api'` passará a retornar uma
 * `ApiBlackjackGameEngine` sem nenhuma mudança nos consumidores.
 */
export function createGameEngine(config: CreateGameEngineConfig = {}): GameEngine {
  const mode = config.mode ?? 'local';

  switch (mode) {
    case 'local':
      return new LocalBlackjackGameEngine(config.local);
    case 'api':
      throw new Error(
        'ApiBlackjackGameEngine ainda não implementada. Use mode: "local" até o backend existir.',
      );
  }
}
