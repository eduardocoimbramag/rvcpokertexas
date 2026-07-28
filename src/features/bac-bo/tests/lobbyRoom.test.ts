import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createBracket, placementOf, recordMatchResult } from '../tournament/bracket';
import { makeBots, makeLobbyListings, you } from '../tournament/simulation';
import {
  prizeFor,
  tournamentPot,
  tournamentSelectors,
  useTournamentStore,
} from '../tournament/tournamentStore';
import type { LobbyListing } from '../tournament/types';
import type { RoundResult } from '../engine/types';
import { useGameStore } from '../store/gameStore';

/**
 * Regras da sala do torneio:
 * - as características saem todas da criação (nome, tamanho, taxa, senha);
 * - privada aparece na lista como as outras, mas a porta pede senha;
 * - a taxa de entrada só sai do saldo na derrota que elimina o jogador.
 */

const initialTournament = useTournamentStore.getInitialState();
const initialGame = useGameStore.getInitialState();

beforeEach(() => {
  vi.useFakeTimers();
  useTournamentStore.setState(initialTournament, true);
  useGameStore.setState({ ...initialGame, balance: 1000 }, true);
});

function listing(overrides: Partial<LobbyListing> = {}): LobbyListing {
  return {
    id: 'lobby-1',
    name: 'Mesa Imperial',
    hostName: 'Otto',
    size: 4,
    filled: 2,
    fee: 25,
    visibility: 'public',
    password: '',
    ...overrides,
  };
}

describe('criação de sala', () => {
  it('a sala nasce com as características escolhidas', () => {
    useTournamentStore.getState().createLobby({
      name: '  Mesa Coroa  ',
      visibility: 'private',
      size: 4,
      fee: 50,
      password: '4821',
    });

    const s = useTournamentStore.getState();
    expect(s.stage).toBe('lobby');
    expect(s.lobbyName).toBe('Mesa Coroa'); // sem os espaços das pontas
    expect(s.visibility).toBe('private');
    expect(s.size).toBe(4);
    expect(s.entryFee).toBe(50);
    expect(s.password).toBe('4821');
  });

  it('sala pública não guarda senha nenhuma', () => {
    useTournamentStore.getState().createLobby({
      name: 'Mesa Aberta',
      visibility: 'public',
      size: 8,
      fee: 10,
      password: '1234',
    });
    expect(useTournamentStore.getState().password).toBe('');
  });

  it('criar não custa crédito: o saldo só muda na derrota', () => {
    useTournamentStore.getState().createLobby({
      name: 'Mesa Coroa',
      visibility: 'public',
      size: 4,
      fee: 50,
      password: '',
    });
    expect(useGameStore.getState().balance).toBe(1000);
  });
});

describe('sala de 16', () => {
  it('o elenco cobre os 15 assentos de bots, sem nomes repetidos', () => {
    const bots = makeBots(15);
    expect(bots).toHaveLength(15);
    expect(new Set(bots.map((b) => b.name)).size).toBe(15);
  });

  it('a sala nasce com 16 e o chaveamento abre nas oitavas', () => {
    useTournamentStore.getState().createLobby({
      name: 'Copa Grande',
      visibility: 'public',
      size: 16,
      fee: 10,
      password: '',
    });
    const members = [you(), ...makeBots(15)];
    useTournamentStore.setState({ members, readyIds: members.map((m) => m.id) });
    useTournamentStore.getState().startTournament();

    const s = useTournamentStore.getState();
    expect(s.stage).toBe('bracket');
    expect(s.bracket?.rounds.map((r) => r.length)).toEqual([8, 4, 2, 1]);
  });
});

describe('porta da sala privada', () => {
  it('a lista anuncia as privadas com senha, não as esconde', () => {
    // A vitrine é sorteada: UMA tirada pode vir sem sala privada (e a
    // mesa de 16 é rara de propósito). Agregar várias tiradas garante
    // que os dois ramos existem — e que a asserção nunca passa no vazio.
    const lobbies = Array.from({ length: 50 }, () => makeLobbyListings()).flat();
    expect(lobbies.length).toBeGreaterThan(0);
    expect(lobbies.some((l) => l.visibility === 'private')).toBe(true);
    for (const lobby of lobbies) {
      // Toda privada da lista tem senha de 4 dígitos; pública, nenhuma.
      if (lobby.visibility === 'private') expect(lobby.password).toMatch(/^\d{4}$/);
      else expect(lobby.password).toBe('');
      expect([4, 8, 16]).toContain(lobby.size);
    }
    // A copa de 16 aparece na vitrine — rara, mas existente.
    expect(lobbies.some((l) => l.size === 16)).toBe(true);
  });

  it('senha errada não abre a porta', () => {
    const locked = listing({ visibility: 'private', password: '4821' });
    expect(useTournamentStore.getState().joinLobby(locked, '1111')).toBe(false);
    expect(useTournamentStore.getState().stage).toBe('closed');
  });

  it('senha certa entra e traz as características da sala', () => {
    const locked = listing({ visibility: 'private', password: '4821', fee: 25, size: 4 });
    expect(useTournamentStore.getState().joinLobby(locked, ' 4821 ')).toBe(true);

    const s = useTournamentStore.getState();
    expect(s.stage).toBe('lobby');
    expect(s.visibility).toBe('private');
    expect(s.entryFee).toBe(25);
    expect(s.size).toBe(4);
  });

  it('sala pública entra sem senha', () => {
    expect(useTournamentStore.getState().joinLobby(listing())).toBe(true);
    expect(useTournamentStore.getState().stage).toBe('lobby');
  });
});

/** Sala de 4 cheia, com ou sem as confirmações de todo mundo. */
function fullRoom(fee: number, { ready = true } = {}) {
  useTournamentStore.getState().createLobby({
    name: 'Mesa Coroa',
    visibility: 'public',
    size: 4,
    fee,
    password: '',
  });
  const members = [you(), ...makeBots(3)];
  useTournamentStore.setState({
    members,
    // O dono (você) já nasce pronto: abrir a sala é estar nela. Os
    // convidados é que confirmam — ou não, conforme o teste.
    readyIds: ready ? members.map((m) => m.id) : ['you'],
  });
  return members;
}

/** Põe o torneio em andamento com a partida do jogador pronta para o desfecho. */
function startedTournament(fee: number) {
  fullRoom(fee);
  useTournamentStore.getState().startTournament();
}

/**
 * Desfecho de uma mão do duelo de 21, do jeito que a mesa do torneio o
 * entrega ao `finishMyMatch`: quem venceu fez 19, quem perdeu fez 17.
 * Nada de estouro — os totais gravados no chaveamento são os das
 * próprias mãos.
 */
function blackjackResult(outcome: 'win' | 'lose'): RoundResult {
  const winningHand = [
    { rank: '10', suit: 'spades' },
    { rank: '9', suit: 'hearts' },
  ] as const;
  const losingHand = [
    { rank: '10', suit: 'clubs' },
    { rank: '7', suit: 'hearts' },
  ] as const;
  const youWin = outcome === 'win';
  return {
    id: 'r1',
    matchId: 'bm-1',
    playerHand: [...(youWin ? winningHand : losingHand)],
    opponentHand: [...(youWin ? losingHand : winningHand)],
    playerTotal: youWin ? 19 : 17,
    opponentTotal: youWin ? 17 : 19,
    playerBust: false,
    opponentBust: false,
    playerNatural: false,
    opponentNatural: false,
    outcome,
    stake: 10,
    payout: youWin ? 20 : 0,
    netChange: youWin ? 10 : -10,
    completedAt: 0,
  };
}

describe('confirmação da sala', () => {
  it('sem todas as confirmações, nem o dono inicia', () => {
    const members = fullRoom(50, { ready: false });
    useTournamentStore.getState().startTournament();
    expect(useTournamentStore.getState().stage).toBe('lobby');

    // Faltando um único assento, o torneio continua parado.
    useTournamentStore.setState({ readyIds: members.slice(0, 3).map((m) => m.id) });
    useTournamentStore.getState().startTournament();
    expect(useTournamentStore.getState().stage).toBe('lobby');

    useTournamentStore.setState({ readyIds: members.map((m) => m.id) });
    useTournamentStore.getState().startTournament();
    expect(useTournamentStore.getState().stage).toBe('bracket');
  });

  it('com todo mundo confirmado, quem não é dono ainda não inicia', () => {
    const members = fullRoom(50);
    useTournamentStore.setState({ ownerId: members[1]?.id }); // a sala é de outro
    useTournamentStore.getState().startTournament();
    expect(useTournamentStore.getState().stage).toBe('lobby');
  });

  it('o dono não confirma: criar a sala já o deixa pronto', () => {
    fullRoom(50, { ready: false });
    expect(useTournamentStore.getState().readyIds).toEqual(['you']);

    // Confirmar e cancelar não são ações do dono.
    useTournamentStore.getState().confirmPresence();
    useTournamentStore.getState().cancelPresence();
    expect(useTournamentStore.getState().readyIds).toEqual(['you']);
  });

  it('o anfitrião da sala alheia também já conta como presente', () => {
    const host = useTournamentStore
      .getState()
      .joinLobby(listing({ id: 'l9', hostName: 'Otto', size: 4, filled: 2 }));
    expect(host).toBe(true);

    const s = useTournamentStore.getState();
    expect(s.readyIds).toEqual([s.ownerId]);
    expect(s.readyIds).not.toContain('you'); // você ainda precisa confirmar
  });

  it('convidado confirma e pode voltar atrás', () => {
    fullRoom(50, { ready: false });
    const bots = useTournamentStore.getState().members.filter((m) => !m.isYou);
    // Você deixa de ser o dono: agora a confirmação é sua obrigação.
    useTournamentStore.setState({ ownerId: bots[0]?.id ?? 'outro', readyIds: [] });

    useTournamentStore.getState().confirmPresence();
    expect(useTournamentStore.getState().readyIds).toEqual(['you']);

    useTournamentStore.getState().cancelPresence();
    expect(useTournamentStore.getState().readyIds).toEqual([]);

    // E a sala volta a ficar travada para o início.
    expect(tournamentSelectors.allReady(useTournamentStore.getState())).toBe(false);
  });

  it('a sala enche e os outros confirmam sozinhos até liberar o início', () => {
    useTournamentStore.getState().createLobby({
      name: 'Mesa Coroa',
      visibility: 'public',
      size: 4,
      fee: 10,
      password: '',
    });
    // Bots entram um a um e cada um confirma depois de um tempo próprio.
    vi.advanceTimersByTime(60_000);
    useTournamentStore.getState().confirmPresence();

    const s = useTournamentStore.getState();
    expect(s.members).toHaveLength(4);
    expect(tournamentSelectors.allReady(s)).toBe(true);
    expect(s.chat.at(-1)?.text).toContain('Todos confirmaram');
  });

  it('expulsar tira a confirmação junto com o jogador', () => {
    const members = fullRoom(50);
    const victim = members[1];
    if (!victim) throw new Error('sala sem bots');

    useTournamentStore.getState().kickMember(victim.id);
    const s = useTournamentStore.getState();
    expect(s.readyIds).not.toContain(victim.id);
    expect(tournamentSelectors.allReady(s)).toBe(false);
  });
});

describe('taxa de entrada: cobrada só na derrota', () => {
  it('iniciar o torneio não debita nada', () => {
    startedTournament(50);
    expect(useTournamentStore.getState().stage).toBe('bracket');
    expect(useGameStore.getState().balance).toBe(1000);
  });

  it('sair antes de perder não custa nada', () => {
    startedTournament(50);
    useTournamentStore.getState().leaveTournament();
    expect(useGameStore.getState().balance).toBe(1000);
  });

  it('perder a partida debita a taxa uma única vez', () => {
    startedTournament(50);
    useTournamentStore.getState().playMyMatch();
    if (!useTournamentStore.getState().activeMatch) {
      throw new Error('partida do jogador não iniciada');
    }

    // A mesa fechou a mão com a derrota do jogador (17 × 19).
    useTournamentStore.getState().finishMyMatch(blackjackResult('lose'));
    expect(useGameStore.getState().balance).toBe(950);
    expect(useTournamentStore.getState().feePaid).toBe(true);

    // Uma segunda chamada não cobra de novo.
    useTournamentStore.getState().finishMyMatch(blackjackResult('lose'));
    expect(useGameStore.getState().balance).toBe(950);
  });

  it('vencer não debita: o jogador segue no torneio sem pagar', () => {
    startedTournament(50);
    useTournamentStore.getState().playMyMatch();
    if (!useTournamentStore.getState().activeMatch) {
      throw new Error('partida do jogador não iniciada');
    }

    useTournamentStore.getState().finishMyMatch(blackjackResult('win'));
    expect(useGameStore.getState().balance).toBe(1000);
    expect(useTournamentStore.getState().feePaid).toBe(false);
  });

  it('o campeão leva 50% do bolo — e a taxa dele nunca foi cobrada', () => {
    startedTournament(50);
    useTournamentStore.setState({
      bracket: resolvedBracket('champion'),
      stage: 'bracket',
      activeMatch: null,
    });

    useTournamentStore.getState().backToBracket();
    vi.advanceTimersByTime(5000);

    // Bolo = 3 taxas de 50 = 150; menos 10% = 135; metade = 67.
    expect(prizeFor(1, 50, 4)).toBe(67);
    expect(useGameStore.getState().balance).toBe(1067);
    expect(useTournamentStore.getState().feePaid).toBe(false);
  });
});

/**
 * Chaveamento de 4 resolvido inteiro, com o jogador terminando na
 * colocação pedida. Monta na mão para não depender das simulações.
 */
function resolvedBracket(outcome: 'champion' | 'runnerUp' | 'third' | 'fourth') {
  let bracket = createBracket([you(), ...makeBots(3)], 4);
  const winsSemi = outcome === 'champion' || outcome === 'runnerUp';

  // Semifinais: a sua (índice 0) e a dos bots.
  const semi = bracket.rounds[0] ?? [];
  for (const match of semi) {
    const mine = match.a?.id === 'you' || match.b?.id === 'you';
    const youAreA = match.a?.id === 'you';
    if (!mine) {
      bracket = recordMatchResult(bracket, match.id, 11, 4);
      continue;
    }
    const youScore = winsSemi ? 11 : 4;
    const oppScore = winsSemi ? 4 : 11;
    bracket = recordMatchResult(
      bracket,
      match.id,
      youAreA ? youScore : oppScore,
      youAreA ? oppScore : youScore,
    );
  }

  // Disputa do 3º lugar (só existe para quem perdeu a semi).
  const third = bracket.thirdPlace;
  if (third?.a && third.b) {
    const youAreA = third.a.id === 'you';
    const youScore = outcome === 'third' ? 11 : 4;
    const oppScore = outcome === 'third' ? 4 : 11;
    const mine = third.a.id === 'you' || third.b.id === 'you';
    bracket = recordMatchResult(
      bracket,
      third.id,
      mine ? (youAreA ? youScore : oppScore) : 11,
      mine ? (youAreA ? oppScore : youScore) : 4,
    );
  }

  // Final.
  const final = bracket.rounds[1]?.[0];
  if (final?.a && final.b) {
    const youAreA = final.a.id === 'you';
    const youScore = outcome === 'champion' ? 11 : 4;
    const oppScore = outcome === 'champion' ? 4 : 11;
    const mine = final.a.id === 'you' || final.b.id === 'you';
    bracket = recordMatchResult(
      bracket,
      final.id,
      mine ? (youAreA ? youScore : oppScore) : 11,
      mine ? (youAreA ? oppScore : youScore) : 4,
    );
  }

  return bracket;
}

describe('pódio: 50 / 30 / 20 do bolo, menos 10% da casa', () => {
  it('divide o bolo entre os três primeiros e deixa 10% com a casa', () => {
    // 8 jogadores × 100: bolo = 700 (as taxas dos 7 derrotados).
    expect(tournamentPot(100, 8)).toBe(700);
    expect(prizeFor(1, 100, 8)).toBe(315); // 50% de 630
    expect(prizeFor(2, 100, 8)).toBe(189); // 30%
    expect(prizeFor(3, 100, 8)).toBe(126); // 20%
    expect(prizeFor(4, 100, 8)).toBe(0); // fora do pódio, sem prêmio

    const pago = prizeFor(1, 100, 8) + prizeFor(2, 100, 8) + prizeFor(3, 100, 8);
    expect(tournamentPot(100, 8) - pago).toBe(70); // exatamente os 10%
  });

  it('vice e terceiro recebem a sua fatia (com a taxa já debitada)', () => {
    for (const [outcome, place] of [
      ['runnerUp', 2],
      ['third', 3],
      ['fourth', 4],
    ] as const) {
      useTournamentStore.setState(initialTournament, true);
      useGameStore.setState({ ...initialGame, balance: 1000 }, true);
      startedTournament(50);
      useTournamentStore.setState({
        bracket: resolvedBracket(outcome),
        stage: 'bracket',
        activeMatch: null,
        // Perdeu pelo menos uma partida no caminho: a taxa saiu lá.
        feePaid: true,
      });
      useGameStore.setState({ balance: 950 });

      useTournamentStore.getState().backToBracket();
      vi.advanceTimersByTime(5000);

      const finished = useTournamentStore.getState().bracket;
      if (!finished) throw new Error('chaveamento perdido no meio do teste');
      expect(placementOf(finished, 'you')).toBe(place);
      expect(useGameStore.getState().balance).toBe(950 + prizeFor(place, 50, 4));
    }
  });
});
