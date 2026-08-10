import { create } from 'zustand';

import { createId } from '@/shared/lib/ids';
import { CryptoRng, randomInt } from '@/shared/lib/random';

import { TIMINGS } from '../animations/timings';
import { ACTION_SECONDS, SHOW_CARDS_SECONDS } from '../store/gameStore';
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
import { categoryLevel, readHand } from '../engine/poker/handRank';
import { botShowsHand, timeoutAction } from '../engine/poker/rules';
import type { PokerAction, Street } from '../engine/poker/types';
import type { Card } from '../engine/types';
import type { CashTableView } from './cashTable';
import { dealDurationMs } from './cashTable';
import type { CashHandResult } from './cashEngine';
import { CashTableEngine } from './cashEngine';
import { seatOf } from './seatOrder';
import type { TableRoundVerdict, TableStanding, TableWins } from './tableRules';
import { awardTableWins, judgeTableRound } from './tableRules';
import type {
  Bracket,
  BracketSize,
  ChatMessage,
  LobbyListing,
  LobbyVisibility,
  TableMode,
  TournamentFormat,
  TournamentPlayer,
  TournamentSize,
} from './types';
import {
  CASH_DEFAULT_BLIND,
  CASH_DEFAULT_BUY_IN,
  TABLE_TARGET_WINS,
  lobbyPasswordMatches,
} from './types';

/**
 * Store do modo Torneio. Orquestra lobby (chat, membros, dono),
 * chaveamento mata-mata e a partida do jogador (que reusa a base do 1v1).
 * Todo o "multiplayer" é simulado — ver ./simulation.
 */

/* A fonte de sorte da mesa. É a MESMA classe que embaralha o duelo — o
   sorteio do botão do dealer decide dinheiro, e `Math.random` não é uma
   fonte de qualidade para isso. */
const TABLE_RNG = new CryptoRng();

/* Quanto o desfecho fica em cena antes de a mesa recolher e distribuir a
   seguinte. Uma mão que fecha e já vira outra tira de quem jogou a única
   coisa que ele queria saber: quem ganhou, e com o quê. */
const HAND_OVER_MS = TIMINGS.settleMs + TIMINGS.handoverCloseMs;

export type TournamentStage =
  | 'closed'
  | 'browse'
  | 'lobby'
  | 'bracket'
  | 'match'
  /** Mesa única: a série inteira acontece numa tela só. */
  | 'table'
  /** Poker cash: as seis cadeiras vazias, antes da primeira mão. */
  | 'seating'
  /** Poker cash: a mesa de 6 montada, com fichas, pote e board. */
  | 'cash'
  | 'champion';

/** O lance que a mesa acabou de anunciar, para o alto-falante. */
export interface CashMoveCall {
  /** Muda a cada lance — é a chave que faz o balão reentrar. */
  id: string;
  seat: number;
  name: string;
  action: PokerAction;
  /** Fichas que saíram do stack neste lance. */
  amount: number;
  /** Total comprometido por ele nesta rua, depois do lance. */
  to: number;
  allIn: boolean;
  /** A mesa jogou por ele: o relógio venceu. */
  timedOut: boolean;
}

/** O desfecho de uma mão, pronto para a placa. */
export interface CashVerdict {
  /** Quem levou alguma coisa, por cadeira. */
  winners: readonly { seat: number; name: string; won: number; isYou: boolean }[];
  /** A leitura da melhor mão, quando houve showdown. */
  label: string | null;
  /** As cartas que decidiram — a mesa as acende no feltro. */
  highlight: readonly Card[];
  showdown: boolean;
  /** O que a mão fez com o SEU stack, com sinal. */
  netChange: number;
}

/**
 * O CONVITE PARA ABRIR A MÃO que ninguém pagou para ver.
 *
 * Ele só existe quando a mão morre por desistência, e — diferente do
 * duelo — só para QUEM LEVOU O POTE. Numa mesa de seis, perguntar a cada
 * um dos cinco que correram se ele quer abrir seria cinco balões por
 * mão, e a mesa passaria mais tempo perguntando do que jogando.
 */
export interface CashShowPrompt {
  open: boolean;
  seconds: number;
}

/**
 * A RESPOSTA DE UM PEDIDO DE CADEIRA.
 *
 * Ele é assíncrono e PODE FALHAR já no modo local, onde a corrida é
 * encenada e falhar seria tecnicamente impossível — e essa é a decisão
 * mais importante desta fatia. JavaScript é de uma linha só de execução:
 * `if (livre) sento` é atômico por construção, e uma tela escrita sobre
 * essa garantia assume que clicar É sentar.
 *
 * No dia em que a mesa for de verdade, quem resolve a corrida é uma
 * constraint do banco — e a resposta passa a chegar pela rede, com
 * latência e com "chegou tarde". Uma tela que nunca previu a recusa
 * precisaria ser reescrita inteira nesse dia. Escrita como "eu peço, a
 * mesa responde", o bot local responde `taken` com um timer e a tela não
 * muda nunca mais.
 *
 * Ver docs/multiplayer.md §4.3.
 */
export type SeatClaim =
  { ok: true; seatIndex: number } | { ok: false; reason: 'taken' | 'seated' | 'closed' };

/** Um assento da mesa única, com o contador da série. */
export interface TableSeriesSeat {
  player: TournamentPlayer;
  /** Rodadas vencidas (0 a TABLE_TARGET_WINS). */
  wins: number;
}

/**
 * A série da MESA ÚNICA: todos no mesmo feltro, rodada após rodada, até
 * alguém chegar a 3 vitórias. As regras de empate e desempate vivem em
 * ./tableRules — aqui fica só o estado que a mesa mostra.
 */
export interface TableSeries {
  seats: TableSeriesSeat[];
  /** Rodada corrente (1-based), contando as de desempate. */
  round: number;
  /** Quem joga a rodada corrente; quem está fora ASSISTE. */
  playingIds: string[];
  /** A rodada corrente é uma rodada de desempate. */
  tiebreak: boolean;
  /** Campeão da série (chegou a 3); `null` enquanto ela corre. */
  championId: string | null;
  /** Veredito da última rodada julgada — é o que a mesa anuncia. */
  lastVerdict: TableRoundVerdict | null;
}

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
  /** Chaveamento, mesa única ou poker cash de 6. */
  format: TournamentFormat;
  size: TournamentSize;
  /** Taxa de entrada por jogador — fixa a partir daqui. Não vale no cash. */
  fee: number;
  /** Senha de 4 dígitos; ignorada nas salas públicas. */
  password: string;
  /* ---- Só no formato `cash`; ignorados nos torneios ----
     OPCIONAIS de propósito: uma sala de chaveamento não tem buy-in nem
     blind, e obrigá-la a declarar os dois seria pedir um número que não
     significa nada ali. Os defaults valem só para quem não os informa. */
  mode?: TableMode;
  buyIn?: number;
  blind?: number;
}

export interface TournamentState {
  stage: TournamentStage;
  visibility: LobbyVisibility;
  lobbyName: string;
  lobbyCode: string;
  /** Senha da sala privada (vazia nas públicas). */
  password: string;
  /** Formato da sala, fixo desde a criação. */
  format: TournamentFormat;
  size: TournamentSize;
  /**
   * Taxa de entrada por jogador, definida na criação da sala. NÃO é
   * debitada ao entrar nem ao iniciar: só quem perde paga (ver
   * `chargeEntryFee`) — torneio que não acontece não custa nada.
   */
  entryFee: number;
  /** A taxa desta sala já foi cobrada do jogador (uma vez só). */
  feePaid: boolean;
  /**
   * Aberta ou fechada a quem chega depois. Só significa alguma coisa no
   * formato `cash`; nos torneios a sala sempre fecha ao iniciar.
   */
  mode: TableMode;
  /** Fichas com que cada um senta nesta mesa de cash. */
  buyIn: number;
  /** O que se paga por mão nesta mesa de cash. */
  blind: number;
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
  /**
   * AS SEIS CADEIRAS da mesa de cash, por índice REAL — a cadeira 3 é a
   * cadeira 3 para todo mundo. `null` é cadeira livre.
   *
   * O índice é o que a mesa entende (ordem da palavra, botão do dealer);
   * onde cada uma aparece na TELA sai da rotação de ponto de vista (ver
   * `seatOrder.ts`), e é outra coisa.
   */
  seats: (TournamentPlayer | null)[];
  /** Um pedido de cadeira em voo — trava os botões enquanto a mesa responde. */
  claiming: number | null;
  /** A última recusa, para a tela poder dizer por que não deu. */
  claimError: string | null;
  /**
   * O INSTANTE DA MESA DE CASH — quem senta onde, com quanto, o que pôs,
   * o que a mesa abriu (ver `cashTable.ts`). `null` fora do formato.
   *
   * Ele é um retrato, não o motor: hoje quem o produz é `openCashTable`,
   * amanhã é a engine multiway e depois um servidor. A tela que o desenha
   * não muda em nenhum dos três casos.
   */
  cashTable: CashTableView | null;
  /** A sua cadeira na mesa de cash; `-1` fora dela. */
  cashSeat: number;
  /** O que a mesa permite a você agora. Vazio quando não é a sua vez. */
  cashLegal: PokerAction[];
  /** Quanto falta pagar para seguir na mão. */
  cashToCall: number;
  /** A faixa legal de um aumento seu: `[mínimo, teto]`. */
  cashRaise: { min: number; max: number; allInOnly: boolean } | null;
  /** O último lance da mesa, para o alto-falante. */
  cashCall: CashMoveCall | null;
  /** O desfecho da mão, enquanto a mesa recolhe. */
  cashVerdict: CashVerdict | null;
  /**
   * A rua que a mesa está carimbando no letreiro; `null` fora do beat.
   * É o mesmo corte de cena do duelo (ver StreetAnnounce).
   */
  cashStreetCut: Street | null;
  /** O relógio da SUA vez. Só corre quando a palavra é sua. */
  cashClock: { open: boolean; seconds: number };
  /** O convite para abrir a mão que ninguém pagou para ver. */
  cashShow: CashShowPrompt;
  /**
   * VOCÊ FICOU SEM FICHAS.
   *
   * Não é um detalhe de placar: sem fichas você não recebe carta, não tem
   * vez e a barra de lances nunca mais abre — e a barra é onde mora o
   * botão de levantar. Sem este sinal, quem quebrava ficava preso num
   * "Aguardando a mesa" que não terminava nunca.
   */
  cashBroke: boolean;
  /** Você abriu a mão desta rodada — a mesa marca o assento. */
  cashShown: boolean;
  /**
   * A saída da mesa já abriu.
   *
   * Ela abre a partir da SEGUNDA mão, e a razão é a mesma do duelo: quem
   * senta, joga ao menos uma. Sem isso, sentar e levantar antes da
   * primeira carta seria um jeito de ocupar cadeira sem jogar — e numa
   * mesa aberta isso é a cadeira de outra pessoa.
   */
  cashCanLeave: boolean;
  bracket: Bracket | null;
  /** Série da mesa única; `null` fora do formato `table`. */
  tableSeries: TableSeries | null;
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
  /**
   * PEDE uma cadeira. Assíncrono e falível de propósito (ver `SeatClaim`)
   * — a tela pede e espera a resposta, mesmo quando a resposta é
   * instantânea.
   */
  claimSeat: (seatIndex: number) => Promise<SeatClaim>;
  /** Larga a cadeira antes de a mão começar. */
  releaseSeat: () => void;
  /** Joga o SEU lance na mesa de cash. */
  cashAct: (action: PokerAction, raiseTo?: number) => void;
  /** Responde ao convite de abrir a mão que ninguém pagou para ver. */
  cashAnswerShow: (show: boolean) => void;
  /** Levanta da mesa de cash e volta ao salão com as fichas que sobraram. */
  leaveCashTable: () => void;
  playMyMatch: () => void;
  /** Grava no chaveamento o resultado que a mesa acabou de decidir. */
  finishMyMatch: (result: RoundResult) => void;
  backToBracket: () => void;
  /**
   * Julga a rodada da mesa única a partir das mãos do showdown: aplica os
   * pontos, decide desempate/campeão e monta a rodada seguinte. Paga o
   * prêmio (ou cobra a taxa) no instante em que a série fecha.
   */
  settleTableRound: (standings: readonly TableStanding[]) => void;
  /** Encerra a mesa única e abre a coroação. */
  showTableChampion: () => void;
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

/**
 * Prêmio da MESA ÚNICA: quem leva 3 rodadas leva o bolo INTEIRO, menos a
 * comissão da casa — 90% das taxas dos derrotados. Não há pódio aqui: a
 * mesa tem um campeão e o resto pagou para jogar.
 */
export function tablePrize(fee: number, size: TournamentSize): number {
  return afterHouseEdge(tournamentPot(fee, size));
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
  /* A MESA DE CASH mora AQUI, fora do estado publicado.
     Ela contém as doze cartas fechadas; o store é lido pelo React, pelo
     DevTools e por quem abrir o inspetor. Publicando só a projeção — que
     já sai com a mão dos outros de bruços —, as cartas alheias
     simplesmente não existem do lado de fora (ver CashTableEngine). */
  let engine: CashTableEngine | null = null;
  /* O relógio da vez corre de segundo em segundo e vive fora do conjunto
     de timers de uma vez só: ele é um intervalo, e `clearTimers` limpa
     `setTimeout`. Perder essa distinção deixaria um relógio correndo
     depois de a mesa fechar. */
  let clockTimer: ReturnType<typeof setInterval> | null = null;

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
    if (clockTimer !== null) clearInterval(clockTimer);
    clockTimer = null;
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

  /**
   * A MESA RESPONDE AO PEDIDO DE CADEIRA — o "servidor de mentira".
   *
   * Aqui é onde a corrida se resolve, e no modo local ela é encenação: o
   * navegador é de uma linha só de execução, então ler-e-escrever é
   * atômico e não existe disputa de verdade. O que existe é o CONTRATO —
   * a resposta chega por promessa e pode ser "chegou tarde".
   *
   * No dia do servidor este corpo vira um `UPDATE ... WHERE player_id IS
   * NULL` e a assinatura não muda. É por isso que ele mora numa função
   * própria em vez de dentro do `claimSeat`: é o pedaço que troca de
   * casa, e o resto não.
   */
  const askSeat = (seatIndex: number): Promise<SeatClaim> =>
    Promise.resolve(
      get().seats[seatIndex] == null
        ? ({ ok: true, seatIndex } as const)
        : ({ ok: false, reason: 'taken' } as const),
    );

  /**
   * OS BOTS DISPUTANDO AS CADEIRAS, um a cada 700–1800 ms.
   *
   * Eles não escolhem "a melhor" cadeira porque não existe melhor: o
   * botão do dealer é sorteado depois que todos sentam, então a posição
   * relativa é sorte de qualquer forma. Escolhem uma livre ao acaso, que
   * é o que uma pessoa apressada faz.
   *
   * Param quando a mesa enche — e uma cadeira que você acabou de tomar
   * simplesmente não está mais na lista de livres, que é a recusa
   * acontecendo sem ninguém precisar programá-la.
   */
  const raceForSeats = (): void => {
    const s = get();
    if (s.stage !== 'seating') return;
    const free = s.seats.map((seat, i) => (seat === null ? i : -1)).filter((i) => i >= 0);
    if (free.length === 0) return;

    schedule(
      () => {
        const cur = get();
        if (cur.stage !== 'seating') return;
        const livres = cur.seats.map((seat, i) => (seat === null ? i : -1)).filter((i) => i >= 0);
        if (livres.length === 0) return;
        /* Uma cadeira precisa sobrar para você enquanto você não sentou:
           um bot tomando a última transformaria a escolha numa tela sem
           escolha. Numa mesa de verdade isso acontece — e ali a resposta
           certa é a fila, não o atropelo. */
        const eu = cur.seats.some((seat) => seat?.isYou);
        if (!eu && livres.length <= 1) return;

        const taken = cur.seats.filter((seat): seat is TournamentPlayer => seat !== null);
        const [bot] = makeBots(
          1,
          taken.map((p) => p.name),
        );
        const alvo = livres[Math.floor(Math.random() * livres.length)];
        if (!bot || alvo === undefined) return;

        const next = [...cur.seats];
        next[alvo] = bot;
        set({
          seats: next,
          chat: [...cur.chat, systemMessage(`${bot.name} sentou na cadeira ${alvo + 1}.`)],
        });
        openTableIfFull();
        raceForSeats();
      },
      700 + Math.floor(Math.random() * 1100),
    );
  };

  /**
   * A MESA ABRE quando a última cadeira enche.
   *
   * Ela não abre no START do lobby: abre quando as seis pessoas estão
   * sentadas, porque é a escolha das cadeiras que define o anel — e é do
   * anel que sai o botão do dealer, e do botão sai a ordem da palavra.
   *
   * O botão é SORTEADO aqui, e não escolhido: é a promessa que a tela das
   * cadeiras faz por escrito. Sem ela, clicar meio segundo mais rápido
   * compraria posição — e posição, no poker, é dinheiro (§6.1).
   *
   * Chamada dos DOIS lugares onde uma cadeira pode ser a última: você
   * sentando e o bot sentando. Nenhum dos dois sabe se é o sexto, e é por
   * isso que a verificação é daqui e não de lá.
   */
  const openTableIfFull = (): void => {
    const s = get();
    if (s.stage !== 'seating') return;
    if (s.seats.some((seat) => seat === null)) return;

    const eu = seatOf(s.seats, YOU_ID);
    if (eu < 0) return; // mesa cheia sem você não deveria acontecer

    /* Um respiro entre a última cadeira e o feltro: a mesa completa
       precisa ser VISTA completa antes de virar outra tela, senão a
       corrida termina num corte seco e ninguém entende quem sentou onde. */
    schedule(() => {
      const cur = get();
      if (cur.stage !== 'seating') return;

      /* A COMPRA SAI DO SALDO AQUI, e volta em fichas no feltro. Ela é
         debitada no instante em que a mesa abre — e não no START do
         lobby — porque é aqui que as fichas passam a existir na sua
         frente. Sem este débito, `leaveCashTable` devolveria um stack que
         nunca foi pago, e a mesa viraria uma torneira de crédito.
         Cash não tem taxa: o dinheiro entra e sai pela mesma porta. */
      useGameStore.getState().applyBalanceDelta(-cur.buyIn);

      /* O BOTÃO DO DEALER É SORTEADO, e essa é a promessa que a tela das
         cadeiras faz por escrito. Sem ela, clicar meio segundo mais
         rápido compraria posição — e posição, no poker, é dinheiro. */
      engine = new CashTableEngine({
        players: cur.seats,
        buyIn: cur.buyIn,
        bigBlind: cur.blind,
        youSeat: eu,
        button: randomInt(TABLE_RNG, 0, cur.seats.length - 1),
        rng: TABLE_RNG,
      });

      const view = engine.beginHand();
      set({
        stage: 'cash',
        cashSeat: eu,
        cashTable: view,
        cashCall: null,
        cashVerdict: null,
        chat: [
          ...cur.chat,
          systemMessage(`Mesa completa. Botão do dealer na cadeira ${view.button + 1}.`),
        ],
      });
      // Letreiro → distribuição → palavra, nesta ordem (ver `openHand`).
      openHand(view);
    }, 1200);
  };

  /* ---------------- O RITMO DA MESA DE CASH ----------------

     A engine não decide ritmo: ela expõe "jogue um lance de bot" e
     "comece a mão seguinte". Quem os chama, e quando, é este bloco — que
     é quem tem os timers. No dia do servidor esta mesma fronteira vira a
     assinatura de eventos: o ritmo passa a vir de lá, a engine local sai
     de cena e nada acima disto muda (ver docs/multiplayer.md §4.2). */

  /** O que a mesa espera de VOCÊ, publicado para a barra de lances. */
  const publishTurn = (): void => {
    if (!engine) return;
    const sua = engine.isYourTurn();
    const faixa = engine.range();
    set({
      cashTable: engine.view(),
      cashLegal: sua ? engine.legal() : [],
      cashToCall: sua ? engine.toCall() : 0,
      cashRaise:
        sua && faixa.can ? { min: faixa.min, max: faixa.max, allInOnly: faixa.allInOnly } : null,
    });
    if (sua) startClock();
    else stopClock();
  };

  /**
   * O SINAL DE QUEBRADO, republicado a cada troca de mão.
   *
   * Ele mora aqui e não numa conta na tela porque quem sabe o stack vivo
   * é a engine — a projeção mostra o assento FORA da mão (stack 0, sem
   * carta), e uma tela que deduzisse "quebrado" de um assento vazio
   * confundiria quem quebrou com uma cadeira vaga.
   */
  const publishBroke = (): void => {
    const quebrado = (engine?.yourStack() ?? 0) <= 0;
    if (get().cashBroke !== quebrado) set({ cashBroke: quebrado });
  };

  /* ---------------- O RELÓGIO DA VEZ ----------------

     Ele existe pelo mesmo motivo do duelo, e por um a mais que só a mesa
     de seis tem: numa mesa com gente esperando, pensar é caro para OS
     OUTROS. O relógio é o que transforma "pensar muito" numa decisão com
     custo em vez de numa mesa parada.

     Vencido, a mesa joga o lance SEGURO — passa se for de graça, desiste
     se houver aposta na frente (ver `timeoutAction`). Jamais paga por
     quem não pediu para pagar. */

  const stopClock = (): void => {
    if (clockTimer !== null) clearInterval(clockTimer);
    clockTimer = null;
    if (get().cashClock.open) set({ cashClock: { open: false, seconds: 0 } });
  };

  const startClock = (): void => {
    if (clockTimer !== null) clearInterval(clockTimer);
    set({ cashClock: { open: true, seconds: ACTION_SECONDS } });
    clockTimer = setInterval(() => {
      const cur = get();
      if (cur.stage !== 'cash' || !cur.cashClock.open) {
        stopClock();
        return;
      }
      const restam = cur.cashClock.seconds - 1;
      if (restam > 0) {
        set({ cashClock: { open: true, seconds: restam } });
        return;
      }
      stopClock();
      const eng = engine;
      if (!eng || !eng.isYourTurn()) return;
      playYourMove(timeoutAction(eng.toCall()), undefined, true);
    }, 1000);
  };

  /** O lance, para o alto-falante da mesa. */
  const callOf = (
    seat: number,
    name: string,
    action: PokerAction,
    to: number,
    toCall: number,
    allIn: boolean,
    timedOut = false,
  ): CashMoveCall => ({
    id: createId(),
    seat,
    name,
    action,
    amount: action === 'call' ? toCall : action === 'raise' ? to : 0,
    to,
    allIn,
    timedOut,
  });

  /**
   * O LETREIRO DA RUA — o corte de cena que separa uma rua da seguinte.
   *
   * A ORDEM É A DE UMA MESA DE VERDADE, e é a mesma que o duelo
   * documenta em `pokerStreetMs`: o crupiê ANUNCIA, todos olham, e só
   * então ele vira as cartas.
   *
   *   letreiro (1500 ms) → foco voltando (420 ms) → as cartas caindo
   *
   * A mesa de 6 fazia ao contrário: publicava o board novo e só depois
   * subia o letreiro. O flop virava ATRÁS do desfoque — escondendo
   * justamente o acontecimento que a rua É —, que é o bug que o duelo
   * já tinha corrigido e esta mesa reintroduziu.
   *
   * Por isso `publica` é uma função, e não um objeto: quem chama passa o
   * ato de mostrar as cartas novas, e ele acontece DEPOIS.
   */
  const announceStreet = (antes: Street, depois: Street, publica: () => void): void => {
    if (antes === depois || depois === 'showdown') {
      publica();
      return;
    }
    set({ cashStreetCut: depois });
    schedule(() => {
      if (get().cashStreetCut === depois) set({ cashStreetCut: null });
    }, TIMINGS.streetAnnounceMs);
    // As cartas caem com o foco JÁ de volta.
    schedule(publica, TIMINGS.streetAnnounceMs + TIMINGS.streetRevealMs);
  };

  /** O beat que a mesa deve esperar antes de pedir a palavra de novo. */
  const streetBeat = (antes: Street, depois: Street): number =>
    antes === depois || depois === 'showdown' ? 0 : TIMINGS.pokerStreetMs;

  /**
   * ABRE A MÃO: o letreiro do PRÉ-FLOP, a distribuição e só então a
   * palavra.
   *
   * A mesa de 6 pulava o letreiro da primeira mão e, nas seguintes,
   * corria-o POR CIMA da distribuição. Aqui os três beats acontecem em
   * ordem, e ninguém fala antes de as cartas chegarem.
   */
  const openHand = (view: CashTableView): void => {
    set({ cashStreetCut: 'preflop' });
    schedule(() => {
      if (get().cashStreetCut === 'preflop') set({ cashStreetCut: null });
    }, TIMINGS.streetAnnounceMs);

    schedule(() => {
      if (get().stage !== 'cash') return;
      audioManager.playSfx('shuffle');
      schedule(() => {
        if (get().stage !== 'cash') return;
        publishTurn();
        pumpTable();
      }, dealDurationMs(view.seats.length));
    }, TIMINGS.streetAnnounceMs + TIMINGS.streetRevealMs);
  };

  /** Executa o SEU lance — pela sua mão ou pelo relógio vencido. */
  const playYourMove = (action: PokerAction, raiseTo?: number, timedOut = false): void => {
    const eng = engine;
    if (!eng || get().stage !== 'cash' || !eng.isYourTurn()) return;
    const eu = get().cashSeat;
    const toCall = eng.toCall();
    const antes = eng.view();
    const view = eng.act(action, raiseTo);
    stopClock();
    set({
      cashTable: { ...view, board: antes.board },
      cashLegal: [],
      cashRaise: null,
    });
    sayMove(
      callOf(
        eu,
        'Você',
        action,
        view.seats[eu]?.bet ?? 0,
        toCall,
        view.seats[eu]?.allIn ?? false,
        timedOut,
      ),
    );
    announceStreet(antes.street, view.street, () => {
      if (get().stage !== 'cash') return;
      set({ cashTable: engine?.view() ?? view });
    });
    schedule(pumpTable, streetBeat(antes.street, view.street));
  };

  /**
   * TOCA A MESA PARA A FRENTE: joga os bots um a um, com respiro entre
   * eles, e para quando a vez volta a ser sua ou a mão fecha.
   *
   * O respiro não é enfeite. Sem ele, cinco bots resolvem a rua inteira
   * no mesmo quadro e o pote pula de 30 para 400 sem que ninguém tenha
   * visto acontecer — a mesa fica correta e ilegível ao mesmo tempo.
   */
  const pumpTable = (): void => {
    const eng = engine;
    if (!eng) return;
    if (get().stage !== 'cash') return;

    if (eng.isHandOver()) {
      /* O SHOWDOWN É UMA CENA, e tem o compasso do duelo: as fechadas
         viram (`revealMs`) e o quadro respira antes do veredito. Uma mão
         que fecha em 900 ms não é um showdown, é um corte. */
      const showdown = eng.view().seats.filter((seat) => !seat.folded).length > 1;
      schedule(closeCashHand, showdown ? TIMINGS.revealMs : TIMINGS.actionResolveMs);
      return;
    }
    if (eng.isYourTurn()) {
      publishTurn();
      return;
    }

    schedule(
      () => {
        const cur = engine;
        if (!cur || get().stage !== 'cash') return;
        const toCall = cur.toCall();
        const antes = cur.view();
        const lance = cur.botMove();
        if (!lance) {
          pumpTable();
          return;
        }
        const depois = cur.view();
        const nome = antes.seats[lance.seat]?.player.name ?? 'A mesa';
        const call = callOf(
          lance.seat,
          nome,
          lance.action,
          depois.seats[lance.seat]?.bet ?? 0,
          toCall,
          depois.seats[lance.seat]?.allIn ?? false,
        );
        sayMove(call);
        /* O board da rua nova só aparece DEPOIS do letreiro. Até lá a
           mesa mostra o assento com o lance feito e o board de antes. */
        set({ cashTable: { ...depois, board: antes.board } });
        announceStreet(antes.street, depois.street, () => {
          if (get().stage !== 'cash') return;
          set({ cashTable: engine?.view() ?? depois });
        });
        schedule(pumpTable, streetBeat(antes.street, depois.street));
      },
      /* A JANELA EM QUE O RIVAL PENSA — a mesma do duelo. Sorteada: um
         adversário que decide sempre no mesmo tempo denuncia que é
         máquina, e no poker o TEMPO de decisão é informação. */
      TIMINGS.pokerThinkMinMs +
        Math.floor(Math.random() * (TIMINGS.pokerThinkMaxMs - TIMINGS.pokerThinkMinMs)),
    );
  };

  /**
   * DIZ UM LANCE: o balão entra, toca e SAI.
   *
   * Ele nunca saía de cena: ficava pendurado no feltro até o lance
   * seguinte substituí-lo, e no fim da rua sobrava um "fulano pagou 40"
   * sobre uma mesa que já estava em outra rua. O duelo apaga o dele.
   */
  const sayMove = (call: CashMoveCall): void => {
    audioManager.playSfx(call.action === 'fold' ? 'tap' : 'stake');
    set({ cashCall: call });
    schedule(() => {
      if (get().cashCall?.id === call.id) set({ cashCall: null });
    }, TIMINGS.revealHoldMs);
  };

  /**
   * GRAVA A MÃO NO EXTRATO.
   *
   * O sigilo do registro é o mesmo da mesa: só entra carta que a mesa
   * VIU. Quem correu não abre, e quem levou o pote sem showdown também
   * não — o extrato não inventa o que ninguém mostrou (ver
   * `ringSeatRecordSchema`).
   */
  const recordCashHand = (fim: CashHandResult, view: CashTableView): void => {
    const s = get();
    const { settlement } = fim;

    useGameStore.getState().pushHistory({
      kind: 'ring',
      id: createId(),
      tableId: s.lobbyCode || s.lobbyName,
      tableName: s.lobbyName || 'Mesa de cash',
      seats: view.seats
        .filter((seat) => seat.player.id.startsWith('vaga-') === false)
        .map((seat) => {
          const rank = settlement.ranks.get(seat.seatIndex);
          const [primeira, segunda] = seat.cards;
          const abriu = primeira != null && segunda != null;
          return {
            seat: seat.seatIndex,
            name: seat.player.isYou ? 'Você' : seat.player.name,
            isYou: seat.player.isYou,
            putIn: settlement.putIn[seat.seatIndex] ?? 0,
            won: settlement.payouts[seat.seatIndex] ?? 0,
            folded: seat.folded,
            ...(abriu ? { hole: [primeira, segunda] as [typeof primeira, typeof segunda] } : {}),
            ...(rank
              ? {
                  rank: {
                    category: rank.category,
                    label: rank.label,
                    detail: rank.detail,
                    cards: [...rank.cards],
                  },
                }
              : {}),
          };
        }),
      board: [...view.board],
      pots: settlement.potes.map((p) => ({ amount: p.amount, eligible: [...p.eligible] })),
      button: view.button,
      yourSeat: s.cashSeat,
      smallBlind: view.smallBlind,
      bigBlind: view.bigBlind,
      showdown: settlement.showdown,
      netChange: fim.netChange,
      stack: engine?.yourStack() ?? 0,
      completedAt: Date.now(),
    });
  };

  /**
   * FECHA A MÃO: reparte, anuncia e distribui a seguinte.
   *
   * O anúncio fica em cena o tempo de ser lido antes de a mesa recolher.
   * Uma mão que fecha e já vira outra tira de quem jogou a única coisa
   * que ele queria saber — quem ganhou, e com o quê.
   */
  const closeCashHand = (): void => {
    const eng = engine;
    if (!eng || get().stage !== 'cash') return;
    const fim = eng.settle();
    if (!fim) return;

    stopClock();
    const { settlement } = fim;
    const view = eng.view();
    const eu = get().cashSeat;

    const winners = settlement.winners.map((seat) => ({
      seat,
      name: view.seats[seat]?.player.isYou ? 'Você' : (view.seats[seat]?.player.name ?? 'A mesa'),
      won: settlement.payouts[seat] ?? 0,
      isYou: seat === eu,
    }));
    const melhor = settlement.ranks.get(settlement.winners[0] ?? -1);

    set({
      cashTable: view,
      cashLegal: [],
      cashRaise: null,
      cashCall: null,
      cashVerdict: {
        winners,
        label: settlement.showdown ? (melhor?.label ?? null) : null,
        /* AS CARTAS QUE DECIDIRAM acendem no feltro — é o crupiê
           apontando o que levou o pote. Sem showdown não há o que
           apontar: ninguém pagou para ver. */
        highlight: settlement.showdown ? [...(melhor?.cards ?? [])] : [],
        showdown: settlement.showdown,
        netChange: fim.netChange,
      },
    });
    /* O SOM DO DESFECHO, do jeito do duelo: o que se ouve é a SUA
       sorte, não a de quem levou. */
    audioManager.playSfx(fim.netChange > 0 ? 'win' : fim.netChange < 0 ? 'lose' : 'tie');
    publishBroke();
    recordCashHand(fim, view);

    /* O CONVITE PARA ABRIR A MÃO que ninguém pagou para ver.
       Só quando a mão morre por desistência, e só para QUEM LEVOU o
       pote: numa mesa de seis, perguntar aos cinco que correram seria
       cinco balões por mão, e a mesa passaria mais tempo perguntando do
       que jogando. */
    const levouSemShowdown = !settlement.showdown && settlement.winners.includes(eu);
    if (levouSemShowdown) askToShow();
    else revealBotHand(settlement, view, eu);

    schedule(() => {
      const cur = engine;
      if (!cur || get().stage !== 'cash') return;
      /* Menos de dois com ficha: não há mão a distribuir. A mesa não
         "acaba" num cash — ela fica sem gente, e é isso que ela diz. */
      if (cur.seatedWithChips() < 2) {
        /* A mesa ficou sem quem jogue. A saída abre para todo mundo —
           inclusive para quem ainda tem fichas: não há mão a distribuir,
           e uma mesa parada com o botão de sair fechado é uma sala
           trancada. */
        set({ cashShow: { open: false, seconds: 0 }, cashCanLeave: true });
        return;
      }
      const nova = cur.beginHand();
      publishBroke();
      set({
        cashTable: nova,
        cashVerdict: null,
        cashCall: null,
        cashShown: false,
        cashShow: { open: false, seconds: 0 },
        /* A SAÍDA ABRE NA SEGUNDA MÃO. Quem senta, joga ao menos uma —
           sentar e levantar antes da primeira carta seria ocupar a
           cadeira de outra pessoa sem jogar. */
        cashCanLeave: true,
      });
      openHand(nova);
    }, HAND_OVER_MS);
  };

  /**
   * O RELÓGIO DE CINCO SEGUNDOS do convite de abrir a mão.
   *
   * O silêncio vale por NÃO MOSTRO, que é o que uma sala de verdade faz
   * com quem não diz nada: as cartas vão para o descarte de bruços.
   */
  const askToShow = (): void => {
    set({ cashShow: { open: true, seconds: SHOW_CARDS_SECONDS } });
    const tick = (): void => {
      schedule(() => {
        const cur = get();
        if (cur.stage !== 'cash' || !cur.cashShow.open) return;
        const restam = cur.cashShow.seconds - 1;
        if (restam <= 0) {
          set({ cashShow: { open: false, seconds: 0 } });
          return;
        }
        set({ cashShow: { open: true, seconds: restam } });
        tick();
      }, 1000);
    };
    tick();
  };

  /**
   * O RIVAL DECIDE SE ABRE a mão que ninguém pagou para ver.
   *
   * Ele tem a mesma moeda que você, e precisava ter: enquanto as cartas
   * dele abrissem sempre e as suas só por escolha, a leitura da mesa
   * correria num sentido só. É a mesma cabeça do duelo (`botShowsHand`).
   */
  const revealBotHand = (
    settlement: { showdown: boolean; winners: readonly number[] },
    view: CashTableView,
    eu: number,
  ): void => {
    if (settlement.showdown) return;
    const vencedor = settlement.winners[0];
    if (vencedor === undefined || vencedor === eu) return;
    const mao = engine?.holeOf(vencedor);
    if (!mao) return;
    const nivel = categoryLevel(readHand(mao, view.board).category);
    if (!botShowsHand({ level: nivel, folded: false, rng: TABLE_RNG })) return;
    engine?.revealSeat(vencedor);
    set({ cashTable: engine?.view() ?? view });
  };

  /** Preenche assentos vazios com bots, um a um, enquanto no lobby. */
  const scheduleFill = (): void => {
    const s = get();
    if (s.stage !== 'lobby' || s.members.length >= s.size) return;
    schedule(
      () => {
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
      },
      700 + Math.random() * 1100,
    );
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
    format: 'bracket',
    size: 8,
    entryFee: MIN_STAKE,
    feePaid: false,
    mode: 'open',
    buyIn: CASH_DEFAULT_BUY_IN,
    blind: CASH_DEFAULT_BLIND,
    ownerId: YOU_ID,
    members: [],
    readyIds: [],
    bannedNames: [],
    chat: [],
    lobbies: [],
    seats: [],
    claiming: null,
    claimError: null,
    cashTable: null,
    cashSeat: -1,
    cashLegal: [],
    cashToCall: 0,
    cashRaise: null,
    cashCall: null,
    cashVerdict: null,
    cashStreetCut: null,
    cashClock: { open: false, seconds: 0 },
    cashShow: { open: false, seconds: 0 },
    cashShown: false,
    cashCanLeave: false,
    cashBroke: false,
    bracket: null,
    tableSeries: null,
    activeMatch: null,
    simulating: false,
    prizePaid: false,

    openBrowse: () => {
      clearTimers();
      /* A VITRINE SE RENOVA, MENOS A SUA SALA.
         Ela era regenerada inteira a cada visita — e isso apagava a sala
         que você acabou de abrir, que é justamente a que precisa "ficar
         constando no lobby". Sua sala atravessa; as alheias são
         sorteadas de novo, como uma lista que respira. */
      const minha = get().lobbies.filter((l) => l.hostName === 'Você');
      set({ stage: 'browse', lobbies: [...minha, ...makeLobbyListings()] });
    },

    createLobby: ({
      name,
      visibility,
      format,
      size,
      fee,
      password,
      mode = 'open',
      buyIn = CASH_DEFAULT_BUY_IN,
      blind = CASH_DEFAULT_BLIND,
    }) => {
      clearTimers();
      const trimmed = name.trim();
      const code = Math.random().toString(36).slice(2, 6).toUpperCase();
      const isPrivate = visibility === 'private';
      const lobbyName = trimmed || (isPrivate ? 'Sua sala privada' : 'Sua sala pública');
      /* A SUA SALA ENTRA NA VITRINE. Ela nunca entrava: `createLobby`
         montava o lobby e não tocava em `lobbies`, então a sala que você
         acabou de abrir não aparecia na lista de salas. Não incomodava
         enquanto a vitrine era decoração — mas "a mesa aberta fica
         constando no lobby" é exatamente este caminho.
         Entra no TOPO, que é onde quem acabou de criar espera vê-la. */
      const mine: LobbyListing = {
        id: createId(),
        name: lobbyName,
        hostName: 'Você',
        format,
        size,
        filled: 1,
        fee,
        visibility,
        password: isPrivate ? password : '',
        mode,
        buyIn,
        blind,
      };
      set({
        lobbies: [mine, ...get().lobbies.filter((l) => l.hostName !== 'Você')],
        stage: 'lobby',
        visibility,
        lobbyName,
        lobbyCode: code,
        password: isPrivate ? password : '',
        format,
        size,
        entryFee: fee,
        feePaid: false,
        mode,
        buyIn,
        blind,
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
        tableSeries: null,
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
        format: lobby.format,
        size: lobby.size,
        entryFee: lobby.fee,
        feePaid: false,
        // A economia da mesa vem da SALA, não de quem entra: quem senta
        // depois compra o mesmo buy-in e paga o mesmo blind de quem já
        // estava. É o contrato que o cartão da vitrine anunciou.
        mode: lobby.mode,
        buyIn: lobby.buyIn,
        blind: lobby.blind,
        ownerId: host.id, // você não é o dono ao entrar numa sala alheia
        members: [host, ...others, you()],
        readyIds: [host.id], // o anfitrião da sala já conta como presente
        bannedNames: [],
        chat: [systemMessage(`Você entrou em ${lobby.name}.`)],
        bracket: null,
        tableSeries: null,
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
        schedule(
          () => {
            if (get().stage !== 'lobby') return;
            const bot = bots[Math.floor(Math.random() * bots.length)];
            if (bot) set({ chat: [...get().chat, chatMessage(bot, botChatLine())] });
          },
          900 + Math.random() * 1600,
        );
      }
    },

    startTournament: () => {
      const s = get();
      // Três travas, nesta ordem: só o dono aperta o botão, a mesa
      // precisa estar cheia e TODO mundo precisa ter confirmado.
      if (!isOwner(s) || s.members.length !== s.size) return;
      if (!s.members.every((m) => s.readyIds.includes(m.id))) return;
      /* O saldo precisa COBRIR o que está em jogo. No torneio é a taxa —
         e nada é debitado aqui, porque a cobrança acontece na derrota e
         só nela. No cash é a COMPRA, e ela sai do saldo quando a mesa
         abre (ver `openTableIfFull`). */
      const emJogo = s.format === 'cash' ? s.buyIn : s.entryFee;
      if (useGameStore.getState().balance < emJogo) return;
      clearTimers();
      const seeded = shuffle([you(), ...s.members.filter((m) => !m.isYou)]);

      /* POKER CASH: ninguém senta por sorteio. As cadeiras entram VAZIAS
         e cada um escolhe a sua — e é a escolha que decide quem fica à
         esquerda de quem, que é a única coisa que uma cadeira de poker
         decide. Os bots disputam por timer (ver `raceForSeats`).
         Quantas cadeiras é o TAMANHO DA SALA, escolhido na criação: a
         mesa vai de três a seis, e o número deixou de ser seis cravado
         quando a folha passou a perguntá-lo. */
      if (s.format === 'cash') {
        set({
          stage: 'seating',
          bracket: null,
          tableSeries: null,
          seats: Array.from({ length: s.size }, () => null),
          claiming: null,
          claimError: null,
          chat: [...s.chat, systemMessage('Mesa aberta. Escolha sua cadeira.')],
          simulating: false,
          prizePaid: false,
        });
        raceForSeats();
        return;
      }

      // MESA ÚNICA: ninguém é pareado com ninguém — todos sentam no mesmo
      // feltro e a série de melhor de 3 começa na primeira rodada.
      if (s.format === 'table') {
        set({
          stage: 'table',
          bracket: null,
          tableSeries: {
            seats: seeded.map((player) => ({ player, wins: 0 })),
            round: 1,
            playingIds: seeded.map((player) => player.id),
            tiebreak: false,
            championId: null,
            lastVerdict: null,
          },
          chat: [...s.chat, systemMessage('A mesa está aberta! Melhor de 3 — boa sorte.')],
          simulating: false,
          prizePaid: false,
        });
        return;
      }

      set({
        stage: 'bracket',
        bracket: createBracket(seeded, s.size as BracketSize),
        tableSeries: null,
        chat: [...s.chat, systemMessage('O torneio começou! Boa sorte.')],
        simulating: false,
        prizePaid: false,
      });
    },

    claimSeat: async (seatIndex) => {
      const s = get();
      if (s.stage !== 'seating') return { ok: false, reason: 'closed' };
      if (s.seats.some((seat) => seat?.isYou)) return { ok: false, reason: 'seated' };
      if (s.claiming !== null) return { ok: false, reason: 'closed' };
      if (seatIndex < 0 || seatIndex >= s.seats.length) return { ok: false, reason: 'closed' };

      /* O PEDIDO FICA EM VOO enquanto a mesa responde. No modo local a
         resposta é imediata, mas a tela passa por este estado do mesmo
         jeito — é ele que existirá no dia do servidor, e uma tela que
         nunca o exercita não sabe desenhá-lo. */
      set({ claiming: seatIndex, claimError: null });
      const answer = await askSeat(seatIndex);
      if (get().claiming !== seatIndex) return { ok: false, reason: 'closed' };

      if (!answer.ok) {
        const taken = get().seats[seatIndex];
        set({
          claiming: null,
          claimError:
            answer.reason === 'taken'
              ? `${taken?.name ?? 'Alguém'} foi mais rápido.`
              : 'Não deu para sentar aí.',
        });
        return answer;
      }

      const next = [...get().seats];
      next[seatIndex] = you();
      set({
        seats: next,
        claiming: null,
        claimError: null,
        chat: [...get().chat, systemMessage(`Você sentou na cadeira ${seatIndex + 1}.`)],
      });
      openTableIfFull();
      return answer;
    },

    cashAct: (action, raiseTo) => {
      playYourMove(action, raiseTo);
    },

    cashAnswerShow: (show) => {
      const s = get();
      if (s.stage !== 'cash' || !s.cashShow.open) return;
      if (show) engine?.revealSeat(s.cashSeat);
      set({
        cashShow: { open: false, seconds: 0 },
        cashShown: show,
        cashTable: engine?.view() ?? s.cashTable,
      });
    },

    leaveCashTable: () => {
      /* LEVANTAR DA MESA é um direito e não custa nada — é a diferença
         entre cash e torneio, e foi assim que a mesa fechada foi definida:
         "ninguém entra depois de começar. Você sai quando quiser".
         As fichas que sobraram voltam ao saldo. Hoje isso é a compra
         inteira porque ainda não há mão para perder; quando a engine
         entrar, é o stack vivo do assento — e a conta é a mesma. */
      /* Sai com o STACK VIVO — o que está na sua frente agora, e não a
         compra. É o que muda quando a mesa passa a jogar de verdade: as
         fichas mudam de dono a cada mão, e levantar devolve o que sobrou
         delas. */
      const fichas = engine?.yourStack() ?? 0;
      if (fichas > 0) useGameStore.getState().applyBalanceDelta(fichas);
      engine = null;
      clearTimers();
      set({
        stage: 'closed',
        members: [],
        readyIds: [],
        bannedNames: [],
        chat: [],
        seats: [],
        claiming: null,
        claimError: null,
        cashTable: null,
        cashSeat: -1,
        cashLegal: [],
        cashToCall: 0,
        cashRaise: null,
        cashCall: null,
        cashVerdict: null,
        cashStreetCut: null,
        cashClock: { open: false, seconds: 0 },
        cashShow: { open: false, seconds: 0 },
        cashShown: false,
        cashCanLeave: false,
        cashBroke: false,
        bracket: null,
        tableSeries: null,
        activeMatch: null,
        simulating: false,
        feePaid: false,
      });
    },

    releaseSeat: () => {
      const s = get();
      if (s.stage !== 'seating') return;
      set({
        seats: s.seats.map((seat) => (seat?.isYou ? null : seat)),
        claimError: null,
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
      // placares, então no desfecho em que o BLACKJACK decide com totais
      // iguais (natural × 21 em três cartas), o perdedor cede um ponto
      // no registro — o placar tem de concordar com a mesa.
      let youScore = result.playerBust ? 0 : result.playerTotal;
      let oppScore = result.opponentBust ? 0 : result.opponentTotal;
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

    settleTableRound: (standings) => {
      const s = get();
      const series = s.tableSeries;
      if (s.stage !== 'table' || !series || series.championId) return;

      const wins: TableWins = Object.fromEntries(
        series.seats.map((seat) => [seat.player.id, seat.wins]),
      );
      const verdict = judgeTableRound(standings, wins, TABLE_TARGET_WINS);

      // Ninguém salvou a mão: a rodada não vale ponto e a mesa
      // redistribui — mesma rodada, cartas novas.
      if (verdict.kind === 'void') {
        audioManager.playSfx('tie');
        set({
          tableSeries: { ...series, round: series.round + 1, lastVerdict: verdict },
        });
        return;
      }

      // Empate na decisão: o ponto coroaria dois de uma vez, então
      // ninguém pontua — a rodada de desempate é que vale, e quem está
      // fora dela vira espectador.
      if (verdict.kind === 'tiebreak') {
        audioManager.playSfx('stake');
        set({
          tableSeries: {
            ...series,
            round: series.round + 1,
            playingIds: verdict.contenders,
            tiebreak: true,
            lastVerdict: verdict,
          },
        });
        return;
      }

      const nextWins = awardTableWins(wins, verdict.winners);
      const seats = series.seats.map((seat) => ({
        ...seat,
        wins: nextWins[seat.player.id] ?? seat.wins,
      }));
      const championId = verdict.championId;

      if (!championId) {
        audioManager.playSfx(verdict.winners.includes(YOU_ID) ? 'win' : 'tap');
        set({
          tableSeries: {
            ...series,
            seats,
            round: series.round + 1,
            // Fechado o desempate sem campeão (impossível hoje, mas o
            // estado não pode ficar preso nele), a mesa volta cheia.
            playingIds: series.seats.map((seat) => seat.player.id),
            tiebreak: false,
            lastVerdict: verdict,
          },
        });
        return;
      }

      // A série fechou: é AQUI que o dinheiro se move, uma única vez.
      // O campeão leva 90% do bolo das taxas; todos os outros pagam a sua.
      if (!s.prizePaid) {
        set({ prizePaid: true });
        if (championId === YOU_ID) {
          useGameStore.getState().applyBalanceDelta(tablePrize(s.entryFee, s.size));
        } else {
          chargeEntryFee();
        }
      }
      audioManager.playSfx(championId === YOU_ID ? 'win' : 'lose');
      set({
        tableSeries: {
          ...series,
          seats,
          playingIds: [],
          tiebreak: false,
          championId,
          lastVerdict: verdict,
        },
      });
    },

    showTableChampion: () => {
      if (get().stage !== 'table' || !get().tableSeries?.championId) return;
      clearTimers();
      set({ stage: 'champion' });
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
        tableSeries: null,
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
  /** A sala é uma mesa única (melhor de 3) em vez de chaveamento. */
  isTable: (s: TournamentState) => s.format === 'table',
  /** O assento do jogador na mesa única. */
  yourSeat: (s: TournamentState) =>
    s.tableSeries?.seats.find((seat) => seat.player.id === YOU_ID) ?? null,
  /** Campeão da mesa única (o assento que chegou a 3). */
  tableChampion: (s: TournamentState) => {
    const series = s.tableSeries;
    if (!series?.championId) return null;
    return series.seats.find((seat) => seat.player.id === series.championId)?.player ?? null;
  },
  /** Você está de fora da rodada corrente (rodada de desempate alheia). */
  youSpectating: (s: TournamentState) => {
    const series = s.tableSeries;
    return !!series && !series.championId && !series.playingIds.includes(YOU_ID);
  },
  isOwner: (s: TournamentState) => s.ownerId === YOU_ID,
  seatsFull: (s: TournamentState) => s.members.length === s.size,
  youReady: (s: TournamentState) => s.readyIds.includes(YOU_ID),
  readyCount: (s: TournamentState) => s.members.filter((m) => s.readyIds.includes(m.id)).length,
  /** Mesa cheia e todos confirmados: a partida pode ser iniciada. */
  allReady: (s: TournamentState) =>
    s.members.length === s.size && s.members.every((m) => s.readyIds.includes(m.id)),
  yourPending: (s: TournamentState) => (s.bracket ? yourPendingMatch(s.bracket, YOU_ID) : null),
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
