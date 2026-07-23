import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeBots } from '../tournament/simulation';
import { useTournamentStore } from '../tournament/tournamentStore';
import type { LobbyVisibility, TournamentPlayer } from '../tournament/types';

/**
 * Regras da porta do lobby:
 * - ninguém entra duas vezes (a sala mostrava dois "Dante");
 * - quem é expulso não volta enquanto a sala existir;
 * - abrir outra sala recomeça a lista de convidados.
 */

const initialTournament = useTournamentStore.getInitialState();

beforeEach(() => {
  // Sem timers reais o preenchimento automático não roda no meio do teste.
  vi.useFakeTimers();
  useTournamentStore.setState(initialTournament, true);
});

afterEach(() => {
  vi.useRealTimers();
});

/** Abre uma sala com as características que a criação sempre define. */
function openRoom(visibility: LobbyVisibility = 'public'): void {
  useTournamentStore.getState().createLobby({
    name: 'Mesa de teste',
    visibility,
    size: 8,
    fee: 10,
    password: visibility === 'private' ? '1234' : '',
  });
}

/** Senta um bot na sala sem depender do preenchimento por timer. */
function seat(name: string): TournamentPlayer {
  const bot: TournamentPlayer = { id: `id-${name}`, name, avatar: name[0] ?? '?', isYou: false };
  const s = useTournamentStore.getState();
  useTournamentStore.setState({ members: [...s.members, bot] });
  return bot;
}

describe('makeBots — elenco sem repetição', () => {
  it('nunca devolve um nome excluído', () => {
    for (let i = 0; i < 60; i += 1) {
      const [bot] = makeBots(1, ['Otto']);
      expect(bot?.name).not.toBe('Otto');
    }
  });

  it('não repete nomes dentro da mesma leva', () => {
    const names = makeBots(12).map((b) => b.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('devolve menos que o pedido quando o elenco acaba', () => {
    const all = makeBots(12).map((b) => b.name);
    expect(makeBots(3, all)).toHaveLength(0);
  });
});

describe('expulsar do lobby', () => {
  it('remove o jogador e o barra pelo nome', () => {
    openRoom();
    const bot = seat('Nina');

    useTournamentStore.getState().kickMember(bot.id);

    const after = useTournamentStore.getState();
    expect(after.members.map((m) => m.name)).not.toContain('Nina');
    expect(after.bannedNames).toContain('Nina');
    expect(after.chat.at(-1)?.text).toBe('Nina foi expulso da sala');
  });

  it('o preenchimento automático nunca reconvida quem foi expulso', () => {
    openRoom();
    const bot = seat('Nina');
    useTournamentStore.getState().kickMember(bot.id);

    // Deixa a sala encher: só timers, sem rede nem aleatoriedade externa.
    vi.advanceTimersByTime(60_000);

    const after = useTournamentStore.getState();
    const names = after.members.map((m) => m.name);
    expect(names).not.toContain('Nina');
    expect(new Set(names).size).toBe(names.length); // e ninguém duplicado
  });

  it('só o dono expulsa, e nunca a si mesmo', () => {
    openRoom();
    const bot = seat('Otto');

    // Você deixa de ser o dono: o botão some da UI, e a ação também.
    useTournamentStore.setState({ ownerId: bot.id });
    useTournamentStore.getState().kickMember(bot.id);
    expect(useTournamentStore.getState().members.map((m) => m.name)).toContain('Otto');

    useTournamentStore.setState({ ownerId: 'you' });
    useTournamentStore.getState().kickMember('you');
    expect(useTournamentStore.getState().members.some((m) => m.isYou)).toBe(true);
  });

  it('abrir outra sala limpa a lista de barrados', () => {
    openRoom();
    const bot = seat('Nina');
    useTournamentStore.getState().kickMember(bot.id);
    expect(useTournamentStore.getState().bannedNames).toHaveLength(1);

    openRoom('private');
    expect(useTournamentStore.getState().bannedNames).toHaveLength(0);
  });
});
