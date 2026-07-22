import { create } from 'zustand';

import { createId } from '@/shared/lib/ids';

import { MIN_STAKE } from '../engine/credits';
import { resolveOutcome, sumDicePair } from '../engine/rules';
import type { Match, RoundResult } from '../engine/types';
import { useGameStore } from '../store/gameStore';
import {
  activeRoundIndex,
  createBracket,
  isEliminated,
  otherPendingMatches,
  recordMatchResult,
  tournamentChampion,
  yourPendingMatch,
} from './bracket';
import {
  botChatLine,
  chatMessage,
  makeBots,
  makePublicLobbies,
  rollPlayerMatch,
  shuffle,
  simulateBotMatch,
  systemMessage,
  you,
} from './simulation';
import type {
  Bracket,
  ChatMessage,
  LobbyVisibility,
  PublicLobby,
  TournamentPlayer,
  TournamentSize,
} from './types';

/**
 * Store do modo Torneio. Orquestra lobby (chat, membros, dono),
 * chaveamento mata-mata e a partida do jogador (que reusa a base do 1v1).
 * Todo o "multiplayer" é simulado — ver ./simulation.
 */

export type TournamentStage = 'closed' | 'browse' | 'lobby' | 'bracket' | 'match' | 'champion';

/** Dados prontos para o TournamentMatchScreen renderizar a mesa. */
export interface ActiveMatch {
  bracketMatchId: string;
  match: Match;
  result: RoundResult;
  youWin: boolean;
}

export interface TournamentState {
  stage: TournamentStage;
  visibility: LobbyVisibility;
  lobbyName: string;
  lobbyCode: string;
  size: TournamentSize;
  /** Buy-in por jogador; o campeão leva `stake × size`. */
  stake: number;
  ownerId: string;
  members: TournamentPlayer[];
  /**
   * Nomes expulsos pelo dono NESTA sala: quem sai pela porta não volta
   * pela janela. Zerado só ao abrir outra sala (criar ou entrar), que é
   * quando a lista de convidados recomeça do zero.
   */
  bannedNames: string[];
  chat: ChatMessage[];
  publicLobbies: PublicLobby[];
  bracket: Bracket | null;
  activeMatch: ActiveMatch | null;
  /** Bots preenchendo/simulando — trava botões durante a animação. */
  simulating: boolean;
  /** Garante que o prêmio ao campeão seja creditado uma única vez. */
  prizePaid: boolean;

  openBrowse: () => void;
  createLobby: (visibility: LobbyVisibility) => void;
  joinLobby: (lobby: PublicLobby) => void;
  setSize: (size: TournamentSize) => void;
  setStake: (stake: number) => void;
  kickMember: (id: string) => void;
  sendChat: (text: string) => void;
  startTournament: () => void;
  playMyMatch: () => void;
  finishMyMatch: () => void;
  backToBracket: () => void;
  leaveTournament: () => void;
}

/** Prêmio total do torneio (o campeão leva tudo). */
export function tournamentPot(stake: number, size: TournamentSize): number {
  return stake * size;
}

const YOU_ID = 'you';

/** Aviso único quando não há mais quem convidar para a sala. */
const POOL_EMPTY = 'Não há mais jogadores disponíveis para entrar nesta sala.';

/** Só o dono é você quando você cria a sala. */
function isOwner(state: TournamentState): boolean {
  return state.ownerId === YOU_ID;
}

export const useTournamentStore = create<TournamentState>()((set, get) => {
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const schedule = (fn: () => void, ms: number): void => {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
  };
  const clearTimers = (): void => {
    for (const t of timers) clearTimeout(t);
    timers.clear();
  };

  /** Preenche assentos vazios com bots, um a um, enquanto no lobby. */
  const scheduleFill = (): void => {
    const s = get();
    if (s.stage !== 'lobby' || s.members.length >= s.size) return;
    schedule(() => {
      const cur = get();
      if (cur.stage !== 'lobby' || cur.members.length >= cur.size) return;
      // Ninguém entra duas vezes, e ninguém expulso reentra.
      const taken = cur.members.map((m) => m.name);
      const [bot] = makeBots(1, [...taken, ...cur.bannedNames]);
      if (!bot) {
        // Elenco esgotado (expulsões demais): a sala não enche sozinha.
        // Avisa uma vez em vez de deixar o dono esperando um assento que
        // nunca vem — o botão de iniciar continua travado por desenho.
        const last = cur.chat[cur.chat.length - 1];
        if (last?.text !== POOL_EMPTY) {
          set({ chat: [...cur.chat, systemMessage(POOL_EMPTY)] });
        }
        return;
      }
      set({
        members: [...cur.members, bot],
        chat: [...cur.chat, systemMessage(`${bot.name} entrou na sala`)],
      });
      scheduleFill();
    }, 700 + Math.random() * 1100);
  };

  /**
   * Simula as partidas dos bots na rodada atual (escalonadas) e, quando a
   * rodada fecha, avança: espera o jogador se ele seguir vivo, ou continua
   * sozinha até coroar o campeão se ele já foi eliminado.
   */
  const runSimulation = (): void => {
    set({ simulating: true });
    const tick = (): void => {
      const s = get();
      const b = s.bracket;
      if (!b) return;
      const champ = tournamentChampion(b);
      if (champ) {
        // O campeão leva todo o montante — credita ao jogador uma só vez.
        if (champ.id === YOU_ID && !s.prizePaid) {
          useGameStore.getState().applyBalanceDelta(tournamentPot(s.stake, s.size));
          set({ prizePaid: true });
        }
        schedule(() => set({ stage: 'champion', simulating: false }), 1000);
        return;
      }
      const [target] = otherPendingMatches(b, YOU_ID);
      if (target) {
        const { scoreA, scoreB } = simulateBotMatch();
        schedule(() => {
          const cur = get().bracket;
          if (cur) set({ bracket: recordMatchResult(cur, target.id, scoreA, scoreB) });
          tick();
        }, 750);
        return;
      }
      // Sem outras partidas pendentes nesta rodada.
      if (yourPendingMatch(b, YOU_ID)) {
        set({ simulating: false }); // é a vez do jogador
        return;
      }
      // Rodada fechada e o jogador não está na próxima → segue simulando.
      schedule(tick, 500);
    };
    tick();
  };

  return {
    stage: 'closed',
    visibility: 'public',
    lobbyName: '',
    lobbyCode: '',
    size: 8,
    stake: MIN_STAKE,
    ownerId: YOU_ID,
    members: [],
    bannedNames: [],
    chat: [],
    publicLobbies: [],
    bracket: null,
    activeMatch: null,
    simulating: false,
    prizePaid: false,

    openBrowse: () => {
      clearTimers();
      set({ stage: 'browse', publicLobbies: makePublicLobbies() });
    },

    createLobby: (visibility) => {
      clearTimers();
      const code = Math.random().toString(36).slice(2, 6).toUpperCase();
      set({
        stage: 'lobby',
        visibility,
        lobbyName: visibility === 'public' ? 'Sua sala pública' : 'Sua sala privada',
        lobbyCode: code,
        size: 8,
        stake: MIN_STAKE,
        ownerId: YOU_ID,
        members: [you()],
        bannedNames: [], // sala nova, lista de convidados do zero
        chat: [systemMessage('Você criou a sala. Ajuste a aposta e os jogadores na engrenagem.')],
        bracket: null,
        activeMatch: null,
        simulating: false,
        prizePaid: false,
      });
      scheduleFill();
    },

    joinLobby: (lobby) => {
      clearTimers();
      const host: TournamentPlayer = {
        id: createId(),
        name: lobby.hostName,
        avatar: lobby.hostName.charAt(0).toUpperCase(),
        isYou: false,
      };
      // O anfitrião já ocupa um nome do elenco; sem excluí-lo a sala
      // podia abrir com duas pessoas homônimas.
      const others = makeBots(Math.max(0, lobby.filled - 1), [host.name]);
      set({
        stage: 'lobby',
        visibility: 'public',
        lobbyName: lobby.name,
        lobbyCode: lobby.id.slice(0, 4).toUpperCase(),
        size: lobby.size,
        stake: lobby.stake,
        ownerId: host.id, // você não é o dono ao entrar numa sala alheia
        members: [host, ...others, you()],
        bannedNames: [],
        chat: [systemMessage(`Você entrou em ${lobby.name}.`)],
        bracket: null,
        activeMatch: null,
        simulating: false,
        prizePaid: false,
      });
      scheduleFill();
    },

    setSize: (size) => {
      const s = get();
      if (!isOwner(s) || s.stage !== 'lobby') return;
      let members = s.members;
      if (members.length > size) {
        // Mantém você e corta os últimos bots para caber no novo tamanho.
        const youMember = members.find((m) => m.isYou);
        const bots = members.filter((m) => !m.isYou).slice(0, size - 1);
        members = youMember ? [youMember, ...bots] : bots;
      }
      set({ size, members });
      scheduleFill();
    },

    setStake: (stake) => {
      const s = get();
      if (!isOwner(s) || s.stage !== 'lobby') return;
      set({ stake });
    },

    kickMember: (id) => {
      const s = get();
      if (!isOwner(s) || id === YOU_ID) return;
      const kicked = s.members.find((m) => m.id === id);
      if (!kicked) return;
      set({
        members: s.members.filter((m) => m.id !== id),
        // Expulsar é definitivo enquanto a sala existir: o nome entra na
        // lista de barrados e o preenchimento automático deixa de
        // considerá-lo.
        bannedNames: [...s.bannedNames, kicked.name],
        chat: [...s.chat, systemMessage(`${kicked.name} foi expulso da sala`)],
      });
      scheduleFill();
    },

    sendChat: (text) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const s = get();
      set({ chat: [...s.chat, chatMessage(you(), trimmed)] });
      // Um bot responde pouco depois.
      const bots = get().members.filter((m) => !m.isYou);
      if (bots.length > 0) {
        schedule(() => {
          if (get().stage !== 'lobby') return;
          const bot = bots[Math.floor(Math.random() * bots.length)];
          if (bot) set({ chat: [...get().chat, chatMessage(bot, botChatLine())] });
        }, 900 + Math.random() * 1600);
      }
    },

    startTournament: () => {
      const s = get();
      if (!isOwner(s) || s.members.length !== s.size) return;
      // Buy-in: o saldo precisa cobrir a aposta; debita ao iniciar.
      const game = useGameStore.getState();
      if (game.balance < s.stake) return;
      game.applyBalanceDelta(-s.stake);
      clearTimers();
      const seeded = shuffle([you(), ...s.members.filter((m) => !m.isYou)]);
      set({
        stage: 'bracket',
        bracket: createBracket(seeded, s.size),
        chat: [...s.chat, systemMessage('O torneio começou! Boa sorte.')],
        simulating: false,
        prizePaid: false,
      });
    },

    playMyMatch: () => {
      const b = get().bracket;
      if (!b) return;
      const bm = yourPendingMatch(b, YOU_ID);
      if (!bm || !bm.a || !bm.b) return;
      const opponent = bm.a.id === YOU_ID ? bm.b : bm.a;
      const { playerDice, opponentDice } = rollPlayerMatch();
      const playerTotal = sumDicePair(playerDice);
      const opponentTotal = sumDicePair(opponentDice);
      const outcome = resolveOutcome(playerTotal, opponentTotal);
      const match: Match = {
        id: bm.id,
        opponent: { id: opponent.id, name: opponent.name, avatar: opponent.avatar, rating: 1000 },
        stake: 0,
        createdAt: Date.now(),
      };
      const result: RoundResult = {
        id: createId(),
        matchId: bm.id,
        playerDice,
        opponentDice,
        playerTotal,
        opponentTotal,
        outcome,
        stake: 0,
        payout: 0,
        netChange: 0,
        completedAt: Date.now(),
      };
      set({
        stage: 'match',
        activeMatch: { bracketMatchId: bm.id, match, result, youWin: outcome === 'win' },
      });
    },

    /** Chamado quando a mesa do jogador termina de revelar (grava no chaveamento). */
    finishMyMatch: () => {
      const s = get();
      const am = s.activeMatch;
      const b = s.bracket;
      if (!am || !b) return;
      const bm = b.rounds.flat().find((m) => m.id === am.bracketMatchId);
      if (!bm || bm.played || !bm.a || !bm.b) return;
      const youAreA = bm.a.id === YOU_ID;
      const youScore = am.result.playerTotal;
      const oppScore = am.result.opponentTotal;
      const scoreA = youAreA ? youScore : oppScore;
      const scoreB = youAreA ? oppScore : youScore;
      set({ bracket: recordMatchResult(b, bm.id, scoreA, scoreB) });
    },

    backToBracket: () => {
      set({ stage: 'bracket', activeMatch: null });
      runSimulation();
    },

    leaveTournament: () => {
      clearTimers();
      set({
        stage: 'closed',
        members: [],
        bannedNames: [],
        chat: [],
        bracket: null,
        activeMatch: null,
        simulating: false,
      });
    },
  };
});

/** Seletores derivados usados pelas telas. */
export const tournamentSelectors = {
  youId: YOU_ID,
  isOwner: (s: TournamentState) => s.ownerId === YOU_ID,
  seatsFull: (s: TournamentState) => s.members.length === s.size,
  yourPending: (s: TournamentState) =>
    s.bracket ? yourPendingMatch(s.bracket, YOU_ID) : null,
  youEliminated: (s: TournamentState) => (s.bracket ? isEliminated(s.bracket, YOU_ID) : false),
  activeRound: (s: TournamentState) => (s.bracket ? activeRoundIndex(s.bracket) : 0),
  champion: (s: TournamentState) => (s.bracket ? tournamentChampion(s.bracket) : null),
};
