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
    // Sem mesa aberta: o canhoto da compra de fichas só existe entre
    // sentar e levantar (ver `openTableSchema`).
    openTable: null,
    balance: 750,
    // Uma linha do extrato é uma MESA: o recibo do caixa dela.
    history: [
      {
        id: 't1',
        name: '1v1',
        kind: 'duel' as const,
        seats: 2,
        buyIn: 500,
        finalStack: 1000,
        cashedOut: 950,
        hands: 6,
        close: 'left' as const,
        startedAt: 1700000000000,
        endedAt: 1700000600000,
      },
    ],
    settings: DEFAULT_SETTINGS,
  };
}

/** Uma mão de duelo no formato da v3 — o extrato de MÃOS. */
function v3DuelHand(over: {
  matchId: string;
  completedAt: number;
  stack: number;
  handsPlayed: number;
  over: boolean;
  leftBy?: 'player' | 'opponent';
}) {
  return {
    kind: 'duel',
    id: `r-${over.completedAt}`,
    matchId: over.matchId,
    playerHole: [
      { rank: 'A', suit: 'spades' },
      { rank: 'A', suit: 'hearts' },
    ],
    opponentHole: [
      { rank: 'K', suit: 'clubs' },
      { rank: 'K', suit: 'diamonds' },
    ],
    board: [],
    playerRank: {
      category: 'pair',
      label: 'Par de Ases',
      detail: 'de Ases',
      cards: [
        { rank: 'A', suit: 'spades' },
        { rank: 'A', suit: 'hearts' },
      ],
    },
    opponentRank: {
      category: 'pair',
      label: 'Par de Reis',
      detail: 'de Reis',
      cards: [
        { rank: 'K', suit: 'clubs' },
        { rank: 'K', suit: 'diamonds' },
      ],
    },
    showdown: true,
    opponentShown: true,
    outcome: 'win',
    stake: 500,
    committed: { player: 50, opponent: 50 },
    contested: 50,
    pot: 100,
    payout: over.stack,
    netChange: 0,
    session: {
      matchId: over.matchId,
      buyIn: 500,
      stacks: { player: over.stack, opponent: 1000 - over.stack },
      handsPlayed: over.handsPlayed,
      button: 'player',
      over: over.over,
      ...(over.leftBy ? { leftBy: over.leftBy } : {}),
    },
    completedAt: over.completedAt,
    opponentName: 'Luna',
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

  it('migra estado v2 (Blackjack): o saldo atravessa, o extrato de 21 não', () => {
    const storage = createMemoryStorage();
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 2,
        state: {
          balance: 1240,
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
              playerTotal: 19,
              opponentTotal: 17,
              playerBust: false,
              opponentBust: false,
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
          settings: { ...DEFAULT_SETTINGS, tutorialSeen: true, scenery: 'low' },
        },
      }),
    );
    const service = new GameStorageService(storage);
    const loaded = service.load();
    // Um "19 × 17" não descreve mão de poker nenhuma: o extrato do jogo
    // velho vai embora. O que é da PESSOA — saldo e preferências —
    // atravessa a mudança de jogo, como já atravessou a anterior.
    expect(loaded?.balance).toBe(1240);
    expect(loaded?.history).toEqual([]);
    expect(loaded?.settings.tutorialSeen).toBe(true);
    expect(loaded?.settings.scenery).toBe('low');
  });

  it('migra em cadeia: um estado v1 atravessa todas as migrações', () => {
    const storage = createMemoryStorage();
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        state: { balance: 300, history: [{ qualquer: 'coisa' }], settings: DEFAULT_SETTINGS },
      }),
    );
    expect(new GameStorageService(storage).load()?.balance).toBe(300);
  });

  describe('v3 → v4: o extrato de MÃOS vira um extrato de MESAS', () => {
    /**
     * É a primeira migração de histórico que NÃO descarta nada, e a
     * diferença é que aqui existe tradução: o jogo é o mesmo e as mãos
     * gravadas são as mesmas mãos — o que mudou foi a UNIDADE do
     * extrato. Jogar fora o extrato de quem já jogou por uma mudança de
     * unidade seria apagar dado da pessoa por conveniência de schema.
     */
    function load(history: unknown[], balance = 1000) {
      const storage = createMemoryStorage();
      storage.setItem(
        STORAGE_KEY,
        JSON.stringify({ version: 3, state: { balance, history, settings: DEFAULT_SETTINGS } }),
      );
      return new GameStorageService(storage).load();
    }

    it('as mãos de uma mesma mesa viram UMA linha, com o recibo do caixa', () => {
      /* O extrato é gravado do mais novo para o mais velho, e as três
         mãos são da mesma mesa: sentou com 500, levantou com 1.000 — o
         caixa devolveu 950 (a comissão incide só sobre o lucro). */
      const loaded = load([
        v3DuelHand({
          matchId: 'm1',
          completedAt: 300,
          stack: 1000,
          handsPlayed: 3,
          over: true,
          leftBy: 'player',
        }),
        v3DuelHand({ matchId: 'm1', completedAt: 200, stack: 700, handsPlayed: 2, over: false }),
        v3DuelHand({ matchId: 'm1', completedAt: 100, stack: 600, handsPlayed: 1, over: false }),
      ]);

      expect(loaded?.history).toHaveLength(1);
      expect(loaded?.history[0]).toMatchObject({
        name: '1v1',
        kind: 'duel',
        buyIn: 500,
        finalStack: 1000,
        cashedOut: 950,
        hands: 3,
        close: 'left',
        startedAt: 100,
        endedAt: 300,
      });
    });

    it('mesas diferentes não se misturam, e a mais recente vem primeiro', () => {
      const loaded = load([
        v3DuelHand({ matchId: 'm2', completedAt: 900, stack: 400, handsPlayed: 1, over: true }),
        v3DuelHand({ matchId: 'm1', completedAt: 100, stack: 600, handsPlayed: 1, over: true }),
      ]);

      expect(loaded?.history.map((linha) => linha.endedAt)).toEqual([900, 100]);
      // Ninguém sai com o mesmo id: as linhas vêm da mesa, não do acaso.
      expect(new Set(loaded?.history.map((linha) => linha.id)).size).toBe(2);
    });

    it('a mesa de ANEL reconstrói a compra do stack de antes da mão', () => {
      /* O registro de anel não guardava com quanto se sentou — a compra é
         da SALA, e a mão só sabia do stack. Ela vem de trás para a
         frente: 900 de stack menos os −100 daquela mão são os 1.000 com
         que se sentou. */
      const anel = (completedAt: number, stack: number, netChange: number) => ({
        kind: 'ring',
        id: `a-${completedAt}`,
        tableId: 'sala-1',
        tableName: 'Copa da Casa',
        seats: [
          { seat: 0, name: 'Você', isYou: true, putIn: 20, won: 0, folded: false },
          { seat: 1, name: 'Otto', isYou: false, putIn: 20, won: 40, folded: false },
        ],
        board: [],
        pots: [],
        button: 0,
        yourSeat: 0,
        smallBlind: 10,
        bigBlind: 20,
        showdown: true,
        netChange,
        stack,
        completedAt,
      });

      const loaded = load([anel(200, 1500, 600), anel(100, 900, -100)]);

      expect(loaded?.history).toHaveLength(1);
      expect(loaded?.history[0]).toMatchObject({
        name: 'Copa da Casa',
        kind: 'ring',
        seats: 2,
        buyIn: 1000,
        finalStack: 1500,
        cashedOut: 1450,
        hands: 2,
      });
    });

    it('uma linha estranha é pulada — e o saldo não vai junto com ela', () => {
      /* Levantar aqui derrubaria o estado inteiro no `catch` do `load`, e
         o saldo da pessoa iria embora por causa de uma linha torta no
         meio de cinquenta. */
      const loaded = load(
        [
          { qualquer: 'coisa' },
          v3DuelHand({ matchId: 'm1', completedAt: 10, stack: 600, handsPlayed: 1, over: true }),
        ],
        777,
      );

      expect(loaded?.balance).toBe(777);
      expect(loaded?.history).toHaveLength(1);
    });
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
