import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeBots, makeLobbyListings, you } from '../tournament/simulation';
import {
  tournamentSelectors,
  useTournamentStore,
} from '../tournament/tournamentStore';
import type { LobbyListing } from '../tournament/types';
import { CASH_SEATS } from '../tournament/types';
import { sizesFor } from '../tournament/types';
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
    format: 'cash',
    size: 4,
    filled: 2,
    fee: 25,
    visibility: 'public',
    password: '',
    // Economia do cash: irrelevante num chaveamento, mas o cartão da
    // vitrine é um só e sempre carrega os três campos.
    mode: 'open',
    buyIn: 1000,
    blind: 20,
    ...overrides,
  };
}

describe('criação de sala', () => {
  it('a sala nasce com as características escolhidas', () => {
    useTournamentStore.getState().createLobby({
      name: '  Mesa Coroa  ',
      visibility: 'private',
      format: 'cash',
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
      format: 'cash',
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
      format: 'cash',
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
      // O tamanho tem de ser válido para a mesa: de três a seis lugares.
      expect(sizesFor(lobby.format)).toContain(lobby.size);
    }

    /* A VITRINE É DE POKER, e só — não há outro formato a anunciar: os
       modos de blackjack foram REMOVIDOS do projeto (docs/limpeza.md,
       Fase 5). */
    expect(lobbies.every((l) => l.format === 'cash')).toBe(true);

    /* AS QUATRO MESAS APARECEM. A de seis é a mais comum, como numa casa
       real à noite, mas a de três existe para quem quer jogar muitas
       mãos — e uma vitrine que só mostrasse mesa cheia esconderia metade
       da régua que a folha de criação oferece. */
    for (const lugares of [3, 4, 5, 6]) {
      expect(lobbies.some((l) => l.size === lugares)).toBe(true);
    }
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
    format: 'cash',
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
    expect(useTournamentStore.getState().stage).toBe('seating');
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
      format: 'cash',
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

describe('sala de CASH — a economia da mesa de 6', () => {
  it('a sala nasce com modo, buy-in e blind, e o tamanho é fixo em 6', () => {
    useTournamentStore.getState().createLobby({
      name: 'Mesa Borgonha',
      visibility: 'public',
      format: 'cash',
      size: CASH_SEATS,
      fee: 0,
      password: '',
      mode: 'open',
      buyIn: 2000,
      blind: 25,
    });

    const s = useTournamentStore.getState();
    expect(s.format).toBe('cash');
    expect(s.size).toBe(6);
    expect(s.mode).toBe('open');
    expect(s.buyIn).toBe(2000);
    expect(s.blind).toBe(25);
  });

  it('a SUA sala entra na vitrine — e no topo dela', () => {
    /* Ela nunca entrava: `createLobby` montava o lobby e não tocava em
       `lobbies`, então a sala recém-criada não aparecia na lista. Não
       incomodava enquanto a vitrine era decoração, mas "a mesa aberta
       fica constando no lobby" é exatamente este caminho. */
    useTournamentStore.setState({ lobbies: [listing({ id: 'alheia' })] });
    useTournamentStore.getState().createLobby({
      name: 'Mesa Borgonha',
      visibility: 'public',
      format: 'cash',
      size: CASH_SEATS,
      fee: 0,
      password: '',
      mode: 'open',
      buyIn: 2000,
      blind: 25,
    });

    const [primeira, ...resto] = useTournamentStore.getState().lobbies;
    expect(primeira?.name).toBe('Mesa Borgonha');
    expect(primeira?.hostName).toBe('Você');
    expect(primeira?.buyIn).toBe(2000);
    expect(primeira?.blind).toBe(25);
    expect(primeira?.filled).toBe(1);
    // E não empurra as outras para fora da lista.
    expect(resto.map((l) => l.id)).toContain('alheia');
  });

  it('criar duas salas seguidas não deixa duas suas na vitrine', () => {
    const abrir = (name: string) =>
      useTournamentStore.getState().createLobby({
        name,
        visibility: 'public',
        format: 'cash',
        size: CASH_SEATS,
        fee: 0,
        password: '',
        mode: 'open',
        buyIn: 1000,
        blind: 20,
      });

    abrir('Primeira');
    abrir('Segunda');

    const minhas = useTournamentStore.getState().lobbies.filter((l) => l.hostName === 'Você');
    expect(minhas).toHaveLength(1);
    expect(minhas[0]?.name).toBe('Segunda');
  });

  it('quem ENTRA numa sala herda a economia dela, não a sua', () => {
    /* O contrato é o que o cartão da vitrine anunciou: quem senta depois
       compra o mesmo buy-in e paga o mesmo blind de quem já estava. */
    const alheia = listing({
      id: 'cash-1',
      format: 'cash',
      size: CASH_SEATS,
      mode: 'closed',
      buyIn: 5000,
      blind: 100,
    });

    expect(useTournamentStore.getState().joinLobby(alheia)).toBe(true);

    const s = useTournamentStore.getState();
    expect(s.mode).toBe('closed');
    expect(s.buyIn).toBe(5000);
    expect(s.blind).toBe(100);
  });

});
