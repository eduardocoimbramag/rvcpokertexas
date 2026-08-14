import { z } from 'zod';

import { pokerHistoryRecordSchema } from '../engine/poker/types';

/**
 * Persistência do jogo em localStorage, com envelope versionado.
 * Dados corrompidos ou de versão desconhecida são descartados com
 * segurança (o jogo recomeça do estado inicial) em vez de quebrar a UI.
 */

/**
 * O NOME LEGADO É DE PROPÓSITO — não troque para `poker-arena:state`.
 *
 * `bacbo` é o primeiro jogo que este projeto foi, e desde a Fase 7 da
 * limpeza (docs/limpeza.md) esta string é a ÚLTIMA coisa que ainda o
 * nomeia: a pasta virou `features/poker/`, e é justamente por ficar
 * sozinha que ela parece um esquecimento. Não é.
 *
 * Uma chave de localStorage não é um nome, é um ENDEREÇO. Trocá-la faz o
 * jogo passar a ler um endereço vazio e **apagar saldo, histórico e
 * configurações de todo jogador que já abriu o jogo** — sem erro, sem
 * teste vermelho, sem nada em cena além de um saldo zerado.
 *
 * Renomear exige migração de verdade, não find & replace: ler a chave
 * antiga, gravar na nova, remover a antiga, e manter esse código por
 * algumas versões (o envelope versionado abaixo é o lugar dele). É
 * trabalho para uma decisão que não muda nada para quem joga — a string
 * é invisível.
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

/**
 * A MESA QUE FICOU ABERTA.
 *
 * O buy-in sai do saldo no instante em que a pessoa senta — é como
 * comprar fichas no caixa —, e só volta quando ela se levanta pelo
 * caminho normal. A mesa, porém, vivia SÓ NA MEMÓRIA: um F5, uma aba
 * descartada pelo sistema, uma ligação que bloqueia a tela, e os
 * créditos sumiam. Tinham saído do saldo e não voltavam nunca.
 *
 * Este registro é o canhoto da compra. Enquanto houver mesa aberta ele
 * fica gravado com o buy-in e o MONTANTE da última mão fechada; se o
 * jogo voltar a nascer e encontrar um canhoto pendurado, a mesa é
 * liquidada pelo último placar conhecido e o dinheiro volta ao saldo.
 *
 * Guarda o montante, e não só o buy-in, de propósito: devolver o buy-in
 * cheio pagaria a quem estivesse perdendo para recarregar a página —
 * o F5 viraria um botão de desfazer. Pelo último placar, recarregar
 * devolve exatamente o que a pessoa tinha na frente dela.
 */
export const openTableSchema = z.object({
  buyIn: z.number().int().positive(),
  /** O montante do jogador na última mão que fechou. */
  stack: z.number().int().nonnegative(),
});
export type OpenTable = z.infer<typeof openTableSchema>;

export const persistedStateSchema = z.object({
  balance: z.number().int().nonnegative(),
  history: z.array(pokerHistoryRecordSchema),
  settings: gameSettingsSchema,
  /* `.default(null)` mantém compatibilidade com estados gravados antes
     do canhoto existir — sem exigir migração de versão. */
  openTable: openTableSchema.nullable().default(null),
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
