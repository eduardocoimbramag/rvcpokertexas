import { create } from 'zustand';

import { createId } from '@/shared/lib/ids';

import { TIMINGS } from '../animations/timings';
import { MIN_STAKE, afterHouseEdge } from '../engine/credits';
import { audioManager } from '../services/AudioManager';
import type { Match, RoundResult } from '../engine/types';
import { useGameStore } from '../store/gameStore';
import {
  activeRoundIndex,
  createBracket,
  isEliminated,
  isThirdPlaceMatch,
  otherPendingMatches,
  placementOf,
  recordMatchResult,
  tournamentChampion,
  yourPendingMatch,
} from './bracket';
import {
  botChatLine,
  chatMessage,
  makeBots,
  makeLobbyListings,
  shuffle,
  simulateBotMatch,
  systemMessage,
  you,
} from './simulation';
import type {
  Bracket,
  ChatMessage,
  LobbyListing,
  LobbyVisibility,
  TournamentPlayer,
  TournamentSize,
} from './types';
import { lobbyPasswordMatches } from './types';

/**
 * Store do modo Torneio. Orquestra lobby (chat, membros, dono),
 * chaveamento mata-mata e a partida do jogador (que reusa a base do 1v1).
 * Todo o "multiplayer" é simulado — ver ./simulation.
 */

export type TournamentStage = 'closed' | 'browse' | 'lobby' | 'bracket' | 'match' | 'champion';

/**
 * Dados prontos para o TournamentMatchScreen abrir a mesa. A partida
 * NÃO nasce decidida: a tela joga a mão de blackjack de verdade (motor
 * próprio, hit/stand interativos) e devolve o desfecho em
 * `finishMyMatch(result)`.
 */
export interface ActiveMatch {
  bracketMatchId: string;
  match: Match;
  /** É a disputa do 3º lugar (muda o que está em jogo na tela). */
  thirdPlace: boolean;
}

/** Características escolhidas na criação da sala (todas de uma vez). */
export interface CreateLobbyOptions {
  name: string;
  visibility: LobbyVisibility;
  size: TournamentSize;
  /** Taxa de entrada por jogador — fixa a partir daqui. */
  fee: number;
  /** Senha de 4 dígitos; ignorada nas salas públicas. */
  password: string;
}

export interface TournamentState {
  stage: TournamentStage;
  visibility: LobbyVisibility;
  lobbyName: string;
  lobbyCode: string;
  /** Senha da sala privada (vazia nas públicas). */
  password: string;
  size: TournamentSize;
  /**
   * Taxa de entrada por jogador, definida na criação da sala. NÃO é
   * debitada ao entrar nem ao iniciar: só quem perde paga (ver
   * `chargeEntryFee`) — torneio que não acontece não custa nada.
   */
  entryFee: number;
  /** A taxa desta sala já foi cobrada do jogador (uma vez só). */
  feePaid: boolean;
  ownerId: string;
  members: TournamentPlayer[];
  /**
   * Quem já confirmou presença nesta sala. O DONO entra aqui de saída:
   * quem abre a mesa não precisa confirmar que está nela — ele é quem
   * dá o start. Os demais confirmam (e podem cancelar) no botão.
   */
  readyIds: string[];
  /**
   * Nomes expulsos pelo dono NESTA sala: quem sai pela porta não volta
   * pela janela. Zerado só ao abrir outra sala (criar ou entrar), que é
   * quando a lista de convidados recomeça do zero.
   */
  bannedNames: string[];
  chat: ChatMessage[];
  /** Salas anunciadas no navegador — públicas e privadas (com cadeado). */
  lobbies: LobbyListing[];
  bracket: Bracket | null;
  activeMatch: ActiveMatch | null;
  /** Bots preenchendo/simulando — trava botões durante a animação. */
  simulating: boolean;
  /** Garante que o prêmio ao campeão seja creditado uma única vez. */
  prizePaid: boolean;

  openBrowse: () => void;
  createLobby: (options: CreateLobbyOptions) => void;
  /**
   * Entra numa sala anunciada. Privada exige a senha certa — devolve
   * `false` (e não entra) quando o código não confere.
   */
  joinLobby: (lobby: LobbyListing, password?: string) => boolean;
  /** Confirma a sua presença no lobby (só para quem não é o dono). */
  confirmPresence: () => void;
  /** Desfaz a sua confirmação enquanto o torneio não começou. */
  cancelPresence: () => void;
  kickMember: (id: string) => void;
  sendChat: (text: string) => void;
  startTournament: () => void;
  playMyMatch: () => void;
  /** Grava no chaveamento o resultado que a mesa acabou de decidir. */
  finishMyMatch: (result: RoundResult) => void;
  backToBracket: () => void;
  leaveTournament: () => void;
}

/**
 * Bolo do torneio: as taxas de quem PERDEU. A taxa do campeão não entra
 * na conta porque ela nunca chega a ser cobrada dele — como no 1v1, quem
 * vence não arrisca o próprio dinheiro, leva o do adversário.
 */
export function tournamentPot(fee: number, size: TournamentSize): number {
  return fee * (size - 1);
}

/** Fatia do bolo (já sem a comissão) de cada lugar do pódio. */
export const PRIZE_SHARES = [0.5, 0.3, 0.2] as const;

/**
 * Prêmio de uma colocação: 50% / 30% / 20% do bolo, descontados os 10%
 * da casa. Do 4º lugar em diante não há prêmio — só a taxa paga.
 */
export function prizeFor(place: number, fee: number, size: TournamentSize): number {
  const share = PRIZE_SHARES[place - 1];
  if (!share) return 0;
  return Math.floor(afterHouseEdge(tournamentPot(fee, size)) * share);
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

  /**
   * Registra a confirmação de um participante. Quando o último assento
   * confirma com a mesa cheia, a sala anuncia o pacto fechado — é a
   * deixa do dono para iniciar (só ele pode).
   */
  const markReady = (id: string): void => {
    const s = get();
    if (s.stage !== 'lobby' || s.readyIds.includes(id)) return;
    const readyIds = [...s.readyIds, id];
    set({ readyIds });
    const everyone = s.members.length === s.size && s.members.every((m) => readyIds.includes(m.id));
    if (everyone) {
      set({
        chat: [
          ...get().chat,
          systemMessage('Todos confirmaram presença. O anfitrião pode iniciar o torneio.'),
        ],
      });
      audioManager.playSfx('locked');
    }
  };

  /**
   * O participante simulado confirma sozinho depois de um tempo natural
   * — a mesma janela do oponente do 1v1, para o lobby acender assento a
   * assento em vez de tudo de uma vez.
   */
  const scheduleBotReady = (id: string): void => {
    const { opponentConfirmMinMs, opponentConfirmMaxMs } = TIMINGS;
    const delay =
      opponentConfirmMinMs + Math.random() * (opponentConfirmMaxMs - opponentConfirmMinMs);
    schedule(() => {
      // Quem saiu (ou foi expulso) no meio da espera não confirma nada.
      if (!get().members.some((m) => m.id === id)) return;
      markReady(id);
    }, delay);
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
      scheduleBotReady(bot.id);
      scheduleFill();
    }, 700 + Math.random() * 1100);
  };

  /**
   * Cobra a taxa de entrada do jogador — o ÚNICO ponto do torneio que
   * mexe no saldo para baixo, e só na derrota que o elimina. Antes disso
   * nada é debitado: sala montada e desfeita, ou torneio que nunca
   * começou, não custam crédito nenhum.
   */
  const chargeEntryFee = (): void => {
    const s = get();
    if (s.feePaid || s.entryFee <= 0) return;
    set({ feePaid: true });
    useGameStore.getState().applyBalanceDelta(-s.entryFee);
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
        // Pódio pago uma única vez, pela colocação: 50/30/20 do bolo dos
        // derrotados. A disputa do 3º lugar corre ANTES da final, então
        // quando sai o campeão as quatro posições já estão definidas.
        if (!s.prizePaid) {
          const place = placementOf(b, YOU_ID);
          const prize = place ? prizeFor(place, s.entryFee, s.size) : 0;
          if (prize > 0) useGameStore.getState().applyBalanceDelta(prize);
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
    password: '',
    size: 8,
    entryFee: MIN_STAKE,
    feePaid: false,
    ownerId: YOU_ID,
    members: [],
    readyIds: [],
    bannedNames: [],
    chat: [],
    lobbies: [],
    bracket: null,
    activeMatch: null,
    simulating: false,
    prizePaid: false,

    openBrowse: () => {
      clearTimers();
      set({ stage: 'browse', lobbies: makeLobbyListings() });
    },

    createLobby: ({ name, visibility, size, fee, password }) => {
      clearTimers();
      const trimmed = name.trim();
      const code = Math.random().toString(36).slice(2, 6).toUpperCase();
      const isPrivate = visibility === 'private';
      set({
        stage: 'lobby',
        visibility,
        lobbyName: trimmed || (isPrivate ? 'Sua sala privada' : 'Sua sala pública'),
        lobbyCode: code,
        password: isPrivate ? password : '',
        size,
        entryFee: fee,
        feePaid: false,
        ownerId: YOU_ID,
        members: [you()],
        readyIds: [YOU_ID], // o dono não confirma: abrir a sala já é estar nela
        bannedNames: [], // sala nova, lista de convidados do zero
        chat: [
          systemMessage(
            isPrivate
              ? `Sala criada. Ela aparece na lista com cadeado — só entra quem tiver a senha ${password}.`
              : 'Sala criada. Ela já aparece na lista de salas para todo mundo.',
          ),
        ],
        bracket: null,
        activeMatch: null,
        simulating: false,
        prizePaid: false,
      });
      scheduleFill();
    },

    joinLobby: (lobby, password = '') => {
      // A porta da sala privada: sem o código do anfitrião não se entra.
      // A regra é a mesma que a folha da senha usa (lobbyPasswordMatches),
      // e passar por aqui é obrigatório — nenhum caminho de UI entra numa
      // sala privada sem ela.
      if (!lobbyPasswordMatches(lobby, password)) return false;
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
        visibility: lobby.visibility,
        lobbyName: lobby.name,
        lobbyCode: lobby.id.slice(0, 4).toUpperCase(),
        password: lobby.password,
        size: lobby.size,
        entryFee: lobby.fee,
        feePaid: false,
        ownerId: host.id, // você não é o dono ao entrar numa sala alheia
        members: [host, ...others, you()],
        readyIds: [host.id], // o anfitrião da sala já conta como presente
        bannedNames: [],
        chat: [systemMessage(`Você entrou em ${lobby.name}.`)],
        bracket: null,
        activeMatch: null,
        simulating: false,
        prizePaid: false,
      });
      // Os convidados confirmam ao longo dos próximos segundos; o
      // anfitrião não tem o que confirmar (a sala é dele).
      for (const member of others) scheduleBotReady(member.id);
      scheduleFill();
      return true;
    },

    confirmPresence: () => {
      const s = get();
      if (s.stage !== 'lobby' || isOwner(s) || s.readyIds.includes(YOU_ID)) return;
      audioManager.playSfx('ready');
      markReady(YOU_ID);
    },

    cancelPresence: () => {
      const s = get();
      // O dono não cancela o que nunca confirmou — a sala é dele.
      if (s.stage !== 'lobby' || isOwner(s) || !s.readyIds.includes(YOU_ID)) return;
      set({ readyIds: s.readyIds.filter((id) => id !== YOU_ID) });
      audioManager.playSfx('tap');
    },

    kickMember: (id) => {
      const s = get();
      if (!isOwner(s) || id === YOU_ID) return;
      const kicked = s.members.find((m) => m.id === id);
      if (!kicked) return;
      set({
        members: s.members.filter((m) => m.id !== id),
        readyIds: s.readyIds.filter((readyId) => readyId !== id),
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
      // Três travas, nesta ordem: só o dono aperta o botão, a mesa
      // precisa estar cheia e TODO mundo precisa ter confirmado.
      if (!isOwner(s) || s.members.length !== s.size) return;
      if (!s.members.every((m) => s.readyIds.includes(m.id))) return;
      // O saldo precisa COBRIR a taxa (é o que se arrisca), mas nada é
      // debitado aqui: a cobrança acontece na derrota, e só nela.
      if (useGameStore.getState().balance < s.entryFee) return;
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
      // Nada é decidido aqui: a tela da partida abre a mesa e joga a
      // mão de blackjack de verdade contra o dealer da casa.
      const match: Match = {
        id: bm.id,
        opponent: { id: opponent.id, name: opponent.name, avatar: opponent.avatar, rating: 1000 },
        stake: 0,
        createdAt: Date.now(),
      };
      set({
        stage: 'match',
        activeMatch: {
          bracketMatchId: bm.id,
          match,
          thirdPlace: isThirdPlaceMatch(b, bm.id),
        },
      });
    },

    /** Chamado quando a mesa do jogador fecha a mão (grava no chaveamento). */
    finishMyMatch: (result) => {
      const s = get();
      const am = s.activeMatch;
      const b = s.bracket;
      if (!am || !b) return;
      // A partida pode ser a do 3º lugar, que vive fora de `rounds`.
      const bm = [...b.rounds.flat(), ...(b.thirdPlace ? [b.thirdPlace] : [])].find(
        (m) => m.id === am.bracketMatchId,
      );
      if (!bm || bm.played || !bm.a || !bm.b) return;
      const youWin = result.outcome === 'win';
      // Placar do chaveamento: o total da mão; estouro conta 0 (quem
      // estoura não tem mão). O chaveamento decide o vencedor comparando
      // placares, então nos raros desfechos em que a CATEGORIA decide
      // com totais iguais (natural × 21 em três cartas), o perdedor cede
      // um ponto no registro — o placar tem de concordar com a mesa.
      let youScore = result.playerCategory === 'bust' ? 0 : result.playerTotal;
      let oppScore = result.opponentCategory === 'bust' ? 0 : result.opponentTotal;
      if (youWin && youScore <= oppScore) oppScore = Math.max(0, youScore - 1);
      if (!youWin && oppScore <= youScore) youScore = Math.max(0, oppScore - 1);
      const youAreA = bm.a.id === YOU_ID;
      const scoreA = youAreA ? youScore : oppScore;
      const scoreB = youAreA ? oppScore : youScore;
      set({ bracket: recordMatchResult(b, bm.id, scoreA, scoreB) });
      // Perdeu = está eliminado: é ESTE o instante em que a taxa sai do
      // saldo. Ganhando, ele segue no torneio sem pagar nada.
      if (!youWin) chargeEntryFee();
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
        readyIds: [],
        bannedNames: [],
        chat: [],
        bracket: null,
        activeMatch: null,
        simulating: false,
        // Sai sem dívida: quem não perdeu partida não paga taxa.
        feePaid: false,
      });
    },
  };
});

/** Seletores derivados usados pelas telas. */
export const tournamentSelectors = {
  youId: YOU_ID,
  isOwner: (s: TournamentState) => s.ownerId === YOU_ID,
  seatsFull: (s: TournamentState) => s.members.length === s.size,
  youReady: (s: TournamentState) => s.readyIds.includes(YOU_ID),
  readyCount: (s: TournamentState) =>
    s.members.filter((m) => s.readyIds.includes(m.id)).length,
  /** Mesa cheia e todos confirmados: a partida pode ser iniciada. */
  allReady: (s: TournamentState) =>
    s.members.length === s.size && s.members.every((m) => s.readyIds.includes(m.id)),
  yourPending: (s: TournamentState) =>
    s.bracket ? yourPendingMatch(s.bracket, YOU_ID) : null,
  youEliminated: (s: TournamentState) => (s.bracket ? isEliminated(s.bracket, YOU_ID) : false),
  activeRound: (s: TournamentState) => (s.bracket ? activeRoundIndex(s.bracket) : 0),
  champion: (s: TournamentState) => (s.bracket ? tournamentChampion(s.bracket) : null),
  /** Colocação final do jogador (1–4), ou `null` se caiu antes da semi. */
  placement: (s: TournamentState) => (s.bracket ? placementOf(s.bracket, YOU_ID) : null),
  /** A sua partida pendente é a disputa do 3º lugar. */
  yourPendingIsThirdPlace: (s: TournamentState) => {
    const pending = s.bracket ? yourPendingMatch(s.bracket, YOU_ID) : null;
    return !!(s.bracket && pending && isThirdPlaceMatch(s.bracket, pending.id));
  },
};
