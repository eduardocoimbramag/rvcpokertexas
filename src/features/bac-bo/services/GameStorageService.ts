import { z } from 'zod';

import { pokerHistoryEntrySchema } from '../engine/poker/types';

/**
 * Persistência do jogo em localStorage, com envelope versionado.
 * Dados corrompidos ou de versão desconhecida são descartados com
 * segurança (o jogo recomeça do estado inicial) em vez de quebrar a UI.
 */

const STORAGE_KEY = 'bacbo-arena:state';
const CURRENT_VERSION = 3;

export const audioSettingsSchema = z.object({
  muted: z.boolean(),
  musicVolume: z.number().min(0).max(1),
  sfxVolume: z.number().min(0).max(1),
});
export type AudioSettings = z.infer<typeof audioSettingsSchema>;

/** Qualidade do cenário/dealer escolhida pelo jogador (docs/scenario.md §10.2). */
export const sceneQualitySettingSchema = z.enum(['high', 'low', 'off']);
export type SceneQualitySetting = z.infer<typeof sceneQualitySettingSchema>;

export const gameSettingsSchema = z.object({
  audio: audioSettingsSchema,
  vibrationEnabled: z.boolean(),
  tutorialSeen: z.boolean(),
  // `.default` mantém compatibilidade com estados persistidos anteriores
  // à existência do cenário — sem exigir migração de versão.
  scenery: sceneQualitySettingSchema.default('high'),
});
export type GameSettings = z.infer<typeof gameSettingsSchema>;

export const persistedStateSchema = z.object({
  balance: z.number().int().nonnegative(),
  history: z.array(pokerHistoryEntrySchema),
  settings: gameSettingsSchema,
});
export type PersistedState = z.infer<typeof persistedStateSchema>;

const envelopeSchema = z.object({
  version: z.number().int().positive(),
  state: z.unknown(),
});

export const DEFAULT_SETTINGS: GameSettings = {
  audio: { muted: false, musicVolume: 0.4, sfxVolume: 0.8 },
  vibrationEnabled: true,
  tutorialSeen: false,
  scenery: 'high',
};

/**
 * Migrações incrementais: a chave N transforma o estado da versão N
 * para a versão N+1.
 */
const MIGRATIONS: Record<number, (state: unknown) => unknown> = {
  // v1 (Bac Bo) → v2 (Blackjack): o histórico guardava rodadas de dados,
  // incompatíveis com o schema de cartas — as entradas são descartadas,
  // mas saldo e preferências do jogador atravessam a mudança de jogo.
  1: dropHistory,
  // v2 (Blackjack) → v3 (Texas Hold'em): o histórico guardava totais de
  // 21, que não descrevem uma mão de poker. Mesma regra da migração
  // anterior, e pela mesma razão: o EXTRATO do jogo velho não tem
  // tradução no jogo novo, mas o SALDO e as preferências têm — e são
  // eles que pertencem à pessoa, não à modalidade.
  2: dropHistory,
};

/** Atravessa saldo e preferências, descarta um histórico de outro jogo. */
function dropHistory(state: unknown): unknown {
  if (typeof state === 'object' && state !== null) {
    return { ...(state as Record<string, unknown>), history: [] };
  }
  return state;
}

export class GameStorageService {
  private readonly storage: Storage;

  constructor(storage?: Storage) {
    this.storage = storage ?? window.localStorage;
  }

  /** Carrega o estado persistido. Retorna `null` (e limpa) se inválido. */
  load(): PersistedState | null {
    let raw: string | null;
    try {
      raw = this.storage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
    if (raw === null) return null;

    try {
      const envelope = envelopeSchema.parse(JSON.parse(raw));
      let { version } = envelope;
      let state = envelope.state;

      while (version < CURRENT_VERSION) {
        const migrate = MIGRATIONS[version];
        if (!migrate) throw new Error(`Sem migração da versão ${version}`);
        state = migrate(state);
        version += 1;
      }
      if (version !== CURRENT_VERSION) {
        throw new Error(`Versão desconhecida: ${version}`);
      }

      return persistedStateSchema.parse(state);
    } catch {
      // Estado corrompido/incompatível: descarta para recomeçar limpo.
      this.clear();
      return null;
    }
  }

  /** Salva o estado. Falhas (quota, storage indisponível) são silenciosas. */
  save(state: PersistedState): void {
    try {
      const envelope = { version: CURRENT_VERSION, state };
      this.storage.setItem(STORAGE_KEY, JSON.stringify(envelope));
    } catch {
      // Persistência é best-effort: o jogo continua funcional sem ela.
    }
  }

  /** Remove todo o estado persistido do jogo. */
  clear(): void {
    try {
      this.storage.removeItem(STORAGE_KEY);
    } catch {
      // Sem storage disponível não há o que limpar.
    }
  }
}
