import { describe, expect, it } from 'vitest';

import type { PersistedState } from '../services/GameStorageService';
import { DEFAULT_SETTINGS, GameStorageService } from '../services/GameStorageService';

const STORAGE_KEY = 'bacbo-arena:state';

/** Storage em memória compatível com a interface Web Storage. */
function createMemoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, value),
  };
}

function sampleState(): PersistedState {
  return {
    balance: 750,
    history: [
      {
        id: 'r1',
        matchId: 'm1',
        playerHand: [
          { rank: '10', suit: 'spades' },
          { rank: '9', suit: 'hearts' },
        ],
        opponentHand: [
          { rank: '10', suit: 'clubs' },
          { rank: '7', suit: 'diamonds' },
        ],
        dealerHand: [
          { rank: '9', suit: 'hearts' },
          { rank: '8', suit: 'diamonds' },
        ],
        playerTotal: 19,
        opponentTotal: 17,
        dealerTotal: 17,
        playerCategory: 'win',
        opponentCategory: 'push',
        playerNatural: false,
        opponentNatural: false,
        outcome: 'win',
        stake: 50,
        payout: 95,
        netChange: 45,
        completedAt: 1700000000000,
        opponentName: 'Luna',
      },
    ],
    settings: DEFAULT_SETTINGS,
  };
}

describe('GameStorageService', () => {
  it('salva e carrega o estado (roundtrip)', () => {
    const service = new GameStorageService(createMemoryStorage());
    const state = sampleState();
    service.save(state);
    expect(service.load()).toEqual(state);
  });

  it('retorna null quando não há nada salvo', () => {
    const service = new GameStorageService(createMemoryStorage());
    expect(service.load()).toBeNull();
  });

  it('descarta e limpa JSON corrompido', () => {
    const storage = createMemoryStorage();
    storage.setItem(STORAGE_KEY, '{corrompido!!!');
    const service = new GameStorageService(storage);
    expect(service.load()).toBeNull();
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('descarta versões desconhecidas (futuras)', () => {
    const storage = createMemoryStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 999, state: sampleState() }));
    const service = new GameStorageService(storage);
    expect(service.load()).toBeNull();
  });

  it('descarta estado que viola o schema', () => {
    const storage = createMemoryStorage();
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 2, state: { balance: -10, history: [], settings: {} } }),
    );
    const service = new GameStorageService(storage);
    expect(service.load()).toBeNull();
  });

  it('migra estado v1 (Bac Bo): preserva saldo/preferências, descarta o histórico', () => {
    const storage = createMemoryStorage();
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        state: {
          balance: 620,
          history: [
            {
              id: 'r1',
              matchId: 'm1',
              playerDice: [6, 3],
              opponentDice: [2, 2],
              playerTotal: 9,
              opponentTotal: 4,
              outcome: 'win',
              stake: 50,
              payout: 100,
              netChange: 50,
              completedAt: 1700000000000,
              opponentName: 'Luna',
            },
          ],
          settings: { ...DEFAULT_SETTINGS, tutorialSeen: true },
        },
      }),
    );
    const service = new GameStorageService(storage);
    const loaded = service.load();
    expect(loaded?.balance).toBe(620);
    expect(loaded?.history).toEqual([]);
    expect(loaded?.settings.tutorialSeen).toBe(true);
  });

  it('não propaga erros de quota ao salvar', () => {
    const storage = createMemoryStorage();
    storage.setItem = () => {
      throw new DOMException('QuotaExceededError');
    };
    const service = new GameStorageService(storage);
    expect(() => service.save(sampleState())).not.toThrow();
  });

  it('clear remove o estado persistido', () => {
    const storage = createMemoryStorage();
    const service = new GameStorageService(storage);
    service.save(sampleState());
    service.clear();
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });
});
