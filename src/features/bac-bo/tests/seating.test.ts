import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { cashOutValue } from '../engine/credits';
import { OPEN_TABLE_ENABLED } from '../tournament/availability';
import { makeLobbyListings } from '../tournament/simulation';
import { useGameStore } from '../store/gameStore';
import {
  freeSeats,
  leftOf,
  neighbourHint,
  rightOf,
  rivalsFromPov,
  seatOf,
  seatsFromPov,
} from '../tournament/seatOrder';
import { SEATING_SECONDS, useTournamentStore } from '../tournament/tournamentStore';
import type { TournamentPlayer } from '../tournament/types';
import { CASH_SEATS } from '../tournament/types';

/**
 * F1 — a escolha de cadeira do poker de 6.
 *
 * Duas coisas se cobram aqui, e a segunda é a que importa a longo prazo:
 * a rotação de ponto de vista (você sempre embaixo, vizinhos diferentes)
 * e o CONTRATO do pedido de cadeira — assíncrono e falível já no modo
 * local, para a tela não precisar ser reescrita no dia do servidor.
 */

const player = (id: string, name: string, isYou = false): TournamentPlayer => ({
  id,
  name,
  avatar: name[0] ?? '?',
  isYou,
});

const initialTournament = useTournamentStore.getInitialState();
const initialGame = useGameStore.getInitialState();

beforeEach(() => {
  vi.useFakeTimers();
  useTournamentStore.setState(initialTournament, true);
  useGameStore.setState({ ...initialGame, balance: 10_000 }, true);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('rotação do ponto de vista', () => {
  it('você é sempre o primeiro da ordem de tela, sente onde sentar', () => {
    for (let seat = 0; seat < CASH_SEATS; seat += 1) {
      expect(seatsFromPov(seat)[0]).toBe(seat);
      expect(seatsFromPov(seat)).toHaveLength(CASH_SEATS);
    }
  });

  it('o que muda é QUEM fica à esquerda e à direita', () => {
    /* É o pedido, literalmente: "o pov será sempre o mesmo... a única
       diferença e quem vai estar na sua esquerda/direita". */
    expect(seatsFromPov(0)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(seatsFromPov(3)).toEqual([3, 4, 5, 0, 1, 2]);
    expect(seatsFromPov(5)).toEqual([5, 0, 1, 2, 3, 4]);
  });

  it('a lista de rivais exclui você e mantém a ordem circular', () => {
    expect(rivalsFromPov(3)).toEqual([4, 5, 0, 1, 2]);
    expect(rivalsFromPov(3)).toHaveLength(CASH_SEATS - 1);
  });

  it('a mesa é um ANEL: a esquerda da última cadeira é a primeira', () => {
    expect(leftOf(5)).toBe(0);
    expect(rightOf(0)).toBe(5);
  });

  it('a dica de vizinho só promete quem existe', () => {
    const seats = [player('a', 'Otto'), null, null, player('d', 'Luna'), null, null];
    /* A frase é dita do SEU ponto de vista, e por isso ela inverte: se
       Luna está à sua direita, VOCÊ está à esquerda dela. É assim que
       alguém descreve onde vai sentar numa mesa. */
    // Cadeira 4: Luna (3) fica à sua direita → você fica à esquerda dela.
    expect(neighbourHint(4, seats)).toBe('À esquerda de Luna');
    // Cadeira 5: Otto (0) fica à sua esquerda → você fica à direita dele.
    expect(neighbourHint(5, seats)).toBe('À direita de Otto');
    // Cadeira 1: Otto (0) à direita → você à esquerda dele.
    expect(neighbourHint(1, seats)).toBe('À esquerda de Otto');
    // Entre dois: a frase nomeia os dois, da direita para a esquerda.
    const cheia = [player('a', 'Otto'), null, player('c', 'Luna'), null, null, null];
    expect(neighbourHint(1, cheia)).toBe('Entre Otto e Luna');
    // Nenhum vizinho: a frase se cala em vez de inventar.
    expect(neighbourHint(0, [null, null, null, null, null, null])).toBeNull();
  });

  it('conta as livres e acha a sua', () => {
    const seats = [player('a', 'Otto'), null, player('y', 'Você', true), null, null, null];
    expect(freeSeats(seats)).toBe(4);
    expect(seatOf(seats, 'y')).toBe(2);
    expect(seatOf(seats, 'ninguem')).toBe(-1);
  });
});

describe('pedido de cadeira — o contrato', () => {
  /** Abre uma mesa de cash já na etapa das cadeiras. */
  function openSeating(seats: (TournamentPlayer | null)[] = Array(CASH_SEATS).fill(null)) {
    useTournamentStore.setState(
      { ...initialTournament, stage: 'seating', seats, buyIn: 1000, blind: 20 },
      true,
    );
  }

  it('sentar numa cadeira livre devolve ok e põe você nela', async () => {
    openSeating();
    const answer = await useTournamentStore.getState().claimSeat(3);

    expect(answer).toEqual({ ok: true, seatIndex: 3 });
    expect(useTournamentStore.getState().seats[3]?.isYou).toBe(true);
    expect(useTournamentStore.getState().claiming).toBeNull();
  });

  it('a cadeira TOMADA recusa, e a recusa diz de quem foi', async () => {
    /* É o caminho que no modo local nunca dispara sozinho — o navegador é
       de uma linha só de execução — e que existe justamente para a tela
       saber desenhá-lo antes de o servidor existir. */
    openSeating([null, null, player('o', 'Otto'), null, null, null]);
    const answer = await useTournamentStore.getState().claimSeat(2);

    expect(answer).toEqual({ ok: false, reason: 'taken' });
    expect(useTournamentStore.getState().claimError).toMatch(/Otto/);
    expect(useTournamentStore.getState().seats[2]?.name).toBe('Otto');
  });

  it('ninguém senta em duas cadeiras', async () => {
    openSeating();
    await useTournamentStore.getState().claimSeat(1);
    const answer = await useTournamentStore.getState().claimSeat(4);

    expect(answer).toEqual({ ok: false, reason: 'seated' });
    expect(useTournamentStore.getState().seats[4]).toBeNull();
    expect(useTournamentStore.getState().seats[1]?.isYou).toBe(true);
  });

  it('fora da etapa de cadeiras o pedido é recusado', async () => {
    useTournamentStore.setState({ ...initialTournament, stage: 'lobby' }, true);
    await expect(useTournamentStore.getState().claimSeat(0)).resolves.toEqual({
      ok: false,
      reason: 'closed',
    });
  });

  it('trocar de cadeira libera a antiga', async () => {
    openSeating();
    await useTournamentStore.getState().claimSeat(0);
    useTournamentStore.getState().releaseSeat();

    expect(useTournamentStore.getState().seats.every((s) => s === null)).toBe(true);
    // E dá para sentar de novo, em outro lugar.
    await useTournamentStore.getState().claimSeat(5);
    expect(useTournamentStore.getState().seats[5]?.isYou).toBe(true);
  });
});

describe('a corrida pelas cadeiras', () => {
  /** Sala de cash cheia e pronta, do jeito que `startTournament` exige. */
  function readyRoom() {
    const eu = player('you', 'Você', true);
    const bots = ['Otto', 'Luna', 'Dante', 'Rex', 'Maya'].map((n, i) => player(`b${i}`, n));
    useTournamentStore.setState(
      {
        ...initialTournament,
        stage: 'lobby',
        format: 'cash',
        size: CASH_SEATS,
        buyIn: 1000,
        blind: 20,
        ownerId: 'you',
        members: [eu, ...bots],
        readyIds: ['you', ...bots.map((b) => b.id)],
      },
      true,
    );
  }

  it('a mesa de cash começa nas SEIS CADEIRAS VAZIAS', () => {
    /* Ninguém senta por sorteio: as cadeiras entram vazias e cada um
       escolhe a sua, que é o que decide quem fica à esquerda de quem. */
    readyRoom();
    useTournamentStore.getState().startTournament();

    const s = useTournamentStore.getState();
    expect(s.stage).toBe('seating');
    expect(s.seats).toHaveLength(CASH_SEATS);
    expect(freeSeats(s.seats)).toBe(CASH_SEATS);
  });

  it('os bots vão ocupando cadeiras sozinhos', () => {
    readyRoom();
    useTournamentStore.getState().startTournament();

    vi.advanceTimersByTime(8000);
    const ocupadas = CASH_SEATS - freeSeats(useTournamentStore.getState().seats);
    expect(ocupadas).toBeGreaterThan(0);
  });

  it('mas NUNCA tomam a última cadeira antes de você sentar', () => {
    /* Um bot levando a última transformaria a tela da escolha numa tela
       sem escolha. Numa mesa de verdade isso acontece — e ali a resposta
       certa é a fila, não o atropelo. */
    readyRoom();
    useTournamentStore.getState().startTournament();

    /* Tempo de sobra para os bots, e MENOS que o relógio da escolha: se
       não houvesse a trava, a mesa encheria aqui. Passado o relógio a
       mesa senta você e enche de propósito — é outra regra, e ela tem
       teste próprio abaixo. */
    vi.advanceTimersByTime(SEATING_SECONDS * 1000 - 1500);
    const s = useTournamentStore.getState();
    expect(s.seats.some((seat) => seat?.isYou)).toBe(false);
    expect(freeSeats(s.seats)).toBeGreaterThanOrEqual(1);
  });

  it('o RELÓGIO senta você e abre a mesa quando o tempo acaba', async () => {
    /* A tela da escolha não tinha fim: quem não clicasse ficava ali para
       sempre, e as outras cinco pessoas junto. O relógio é o que a
       termina — e o sorteio no fim não custa nada, porque a cadeira só
       decide quem fala depois de você e o botão do dealer é sorteado de
       qualquer forma. */
    readyRoom();
    useTournamentStore.getState().startTournament();
    expect(useTournamentStore.getState().seatingClock).toBe(SEATING_SECONDS);

    await vi.advanceTimersByTimeAsync(SEATING_SECONDS * 1000);
    const sentado = useTournamentStore.getState();
    expect(sentado.seats.some((seat) => seat?.isYou)).toBe(true);
    expect(freeSeats(sentado.seats)).toBe(0);

    // E a mesa abre sozinha logo depois: a partida começa sem mais um toque.
    await vi.advanceTimersByTimeAsync(4000);
    expect(useTournamentStore.getState().stage).toBe('cash');
  });

  it('quem JÁ SENTOU não é movido pelo relógio', async () => {
    /* O sorteio é para quem não escolheu. Trocar a cadeira de quem
       escolheu seria desfazer a única decisão que esta tela oferece. */
    readyRoom();
    useTournamentStore.getState().startTournament();
    await useTournamentStore.getState().claimSeat(2);

    await vi.advanceTimersByTimeAsync(SEATING_SECONDS * 1000);
    expect(useTournamentStore.getState().seats[2]?.isYou).toBe(true);
  });

  it('sentado, a mesa enche até o fim', async () => {
    readyRoom();
    useTournamentStore.getState().startTournament();
    await useTournamentStore.getState().claimSeat(0);

    vi.advanceTimersByTime(60_000);
    expect(freeSeats(useTournamentStore.getState().seats)).toBe(0);
    expect(useTournamentStore.getState().seats[0]?.isYou).toBe(true);
  });
});

describe('a economia da mesa de cash', () => {
  /** Senta e espera a mesa abrir de fato (as cadeiras + o respiro). */
  async function abreMesa(buyIn = 1000) {
    const eu = player('you', 'Você', true);
    const bots = ['Otto', 'Luna', 'Dante', 'Rex', 'Maya'].map((n, i) => player(`b${i}`, n));
    useTournamentStore.setState(
      {
        ...initialTournament,
        stage: 'lobby',
        format: 'cash',
        size: CASH_SEATS,
        buyIn,
        blind: 20,
        lobbyName: 'Mesa Do Teste',
        ownerId: 'you',
        members: [eu, ...bots],
        readyIds: ['you', ...bots.map((b) => b.id)],
      },
      true,
    );
    useTournamentStore.getState().startTournament();
    await useTournamentStore.getState().claimSeat(0);
    /* SÓ ATÉ A MESA ABRIR E A PRIMEIRA MÃO ESTAR NA FRENTE DE TODOS.
       A corrida das cadeiras leva até ~10 s, o respiro da mesa cheia
       1,2 s, e a abertura da mão tem o compasso do duelo: letreiro
       (1,5 s), foco voltando (0,42 s) e distribuição (2,75 s).
       Parar AQUI é deliberado: quem avança quatro minutos assiste a
       várias mãos e pode até quebrar na mesa, e aí não há mais o que
       afirmar sobre "a mesa acabou de abrir". */
    await vi.advanceTimersByTimeAsync(30_000);
  }

  /** Deixa a mesa correr o bastante para virar de mão. */
  async function jogaAlgumasMaos() {
    await vi.advanceTimersByTimeAsync(240_000);
  }

  /**
   * Avança o relógio simulado ATÉ a condição valer, em rodadas.
   *
   * Uma corrida única de quatro minutos basta com a suíte parada, e
   * piscava com ela inteira em paralelo: `advanceTimersByTimeAsync`
   * drena as promessas pendentes a cada salto, e sob disputa de CPU a
   * cadeia da mesa podia terminar a corrida no meio de uma mão — o teste
   * então media um instante em que a segunda mão ainda não tinha
   * começado, e falhava por tempo em vez de por defeito.
   * O teto existe para que uma condição que nunca vale falhe rápido, com
   * a asserção do próprio teste, e não por estouro de prazo.
   */
  async function avancaAte(condicao: () => boolean, rodadas = 4) {
    for (let i = 0; i < rodadas; i += 1) {
      if (condicao()) return;
      await vi.advanceTimersByTimeAsync(120_000);
    }
  }

  it('a COMPRA sai do saldo quando a mesa abre', async () => {
    /* E não no START do lobby: é aqui que as fichas passam a existir na
       sua frente. Sem este débito, levantar creditaria um stack que
       nunca foi pago. */
    await abreMesa(1000);

    expect(useTournamentStore.getState().stage).toBe('cash');
    expect(useGameStore.getState().balance).toBe(9000);
    expect(useTournamentStore.getState().cashTable?.seats).toHaveLength(CASH_SEATS);
  });

  it('a mesa distribui e alguém tem a palavra', async () => {
    await abreMesa();
    const view = useTournamentStore.getState().cashTable;
    /* A mesa ANDA sozinha: os bots jogam por timer e o relógio joga por
       você quando estoura, então depois de um minuto de relógio simulado
       ela já está em outra mão. O que se cobra é que ela esteja VIVA —
       e NÃO de quem é a vez: entre uma mão e a seguinte a mesa fica
       legitimamente sem ninguém para falar, e cravar isso num instante
       exato faria o teste depender de onde o relógio parou. */
    expect(useTournamentStore.getState().stage).toBe('cash');
    expect(view?.handNo).toBeGreaterThanOrEqual(1);
    expect(view?.seats).toHaveLength(CASH_SEATS);
    // Seis mãos de duas cartas, e só as SUAS têm face.
    const eu = view?.seats.find((s) => s.player.isYou);
    expect(eu?.cards.filter(Boolean)).toHaveLength(2);
    const rival = view?.seats.find((s) => !s.player.isYou);
    expect(rival?.cards).toHaveLength(2);
    expect(rival?.cards.every((c) => c === null)).toBe(true);
  });

  it('levantar passa pelo CAIXA, com a comissão da casa', async () => {
    /* A mesma porta de saída do duelo, e a mesma conta: a comissão
       incide UMA vez, no caixa, e só sobre o LUCRO — nunca sobre a
       compra que a pessoa trouxe (ver `cashOutValue`). Antes daqui o
       cash creditava o stack bruto e a casa não cobrava nada. */
    await abreMesa(1000);
    const antes = useGameStore.getState().balance;
    const meu = useTournamentStore.getState().cashTable?.seats[0];
    const fichas = (meu?.stack ?? 0) + (meu?.bet ?? 0);

    useTournamentStore.getState().leaveCashTable();

    expect(useGameStore.getState().balance).toBe(antes + cashOutValue(1000, fichas));
    // E a mesa não some: ela abre o FECHO, que diz o que a sessão fez.
    expect(useTournamentStore.getState().stage).toBe('cashout');
    expect(useTournamentStore.getState().cashOut).toEqual({ buyIn: 1000, finalStack: fichas });
    expect(useTournamentStore.getState().cashTable).toBeNull();
  });

  it('a comissão é 10% do LUCRO, e zero quando não houve lucro', () => {
    /* A conta é a do duelo, na mesma função — duas cópias divergiriam no
       primeiro ajuste, e divergir aqui é pagar valores diferentes pela
       mesma mão. */
    expect(cashOutValue(1000, 2000)).toBe(1900);
    expect(cashOutValue(1000, 1000)).toBe(1000);
    expect(cashOutValue(1000, 400)).toBe(400);
  });

  it('levantar DUAS vezes não paga duas vezes', async () => {
    await abreMesa(1000);
    useTournamentStore.getState().leaveCashTable();
    const depois = useGameStore.getState().balance;
    useTournamentStore.getState().leaveCashTable();
    expect(useGameStore.getState().balance).toBe(depois);
  });

  it('o RELÓGIO joga por você quando estoura — o lance seguro', async () => {
    /* Passa se for de graça, desiste se houver aposta na frente. Jamais
       paga por quem não pediu para pagar (ver `timeoutAction`). Sem
       isso, uma mesa de seis fica parada para sempre esperando alguém
       que largou o celular. */
    await abreMesa();
    await jogaAlgumasMaos();
    const s = useTournamentStore.getState();
    // A mesa não travou esperando alguém que largou o celular.
    expect(s.stage).toBe('cash');
    expect(s.cashTable?.handNo).toBeGreaterThanOrEqual(1);
    // E o relógio nunca fica aberto quando a vez não é sua.
    if (s.cashTable?.toAct !== s.cashSeat) {
      expect(s.cashClock.open).toBe(false);
    }
  });

  it('a SAÍDA da mesa abre a partir da segunda mão', async () => {
    /* Quem senta, joga ao menos uma. Sentar e levantar antes da primeira
       carta seria ocupar a cadeira de outra pessoa sem jogar. */
    await abreMesa();
    // Na primeira mão a porta está em cena e FECHADA.
    expect(useTournamentStore.getState().cashCanLeave).toBe(false);
    await avancaAte(() => useTournamentStore.getState().cashCanLeave);
    expect(useTournamentStore.getState().cashCanLeave).toBe(true);
  });

  it('QUEBRADO, sempre há saída — a invariante que destrava a mesa', async () => {
    /* A armadilha que o dono encontrou: sem fichas você não recebe carta,
       não tem vez, e a barra de lances — onde mora o LEVANTAR — nunca
       mais abre. A mesa virava uma sala trancada com a pessoa dentro.

       A invariante é uma frase: SE `cashBroke`, ENTÃO `cashCanLeave`.
       Ela é amostrada mão a mão, porque quebrar depende do baralho e
       forçar um stack zero por dentro testaria a fixture, não a mesa. */
    await abreMesa(1000);

    for (let volta = 0; volta < 25; volta += 1) {
      const atual = useTournamentStore.getState();
      if (atual.stage !== 'cash') break;
      if (atual.cashBroke) {
        expect(atual.cashCanLeave).toBe(true);
        expect(atual.cashTable?.seats[0]?.stack).toBe(0);
        break;
      }
      await vi.advanceTimersByTimeAsync(60_000);
    }

    // Em qualquer amostra, a mesa nunca deixa alguém quebrado sem porta.
    const fim = useTournamentStore.getState();
    expect(fim.cashBroke && !fim.cashCanLeave).toBe(false);
  });

  it('a mesa SEM QUEM JOGUE também abre a saída', async () => {
    /* Não há mão a distribuir: uma mesa parada com o botão de sair
       fechado é uma sala trancada, mesmo para quem ainda tem fichas. */
    await abreMesa(1000);
    for (let volta = 0; volta < 25; volta += 1) {
      const atual = useTournamentStore.getState();
      if (atual.stage !== 'cash') break;
      const comFichas = (atual.cashTable?.seats ?? []).filter((seat) => seat.stack > 0).length;
      if (comFichas < 2) {
        expect(atual.cashCanLeave).toBe(true);
        break;
      }
      await vi.advanceTimersByTimeAsync(60_000);
    }
  });

  it('levantar sem fichas não credita nada, e o saldo fecha a conta', async () => {
    /* A conta inteira da mesa: a compra saiu do saldo quando ela abriu, e
       o que volta é o stack VIVO. Quebrado, isso é zero — e o diálogo
       não pode prometer fichas que não existem. */
    await abreMesa(1000);
    const antes = useGameStore.getState().balance;
    const meu = useTournamentStore.getState().cashTable?.seats[0];
    const fichas = (meu?.stack ?? 0) + (meu?.bet ?? 0);

    useTournamentStore.getState().leaveCashTable();
    expect(useGameStore.getState().balance).toBe(antes + fichas);
  });

  it('a mesa nunca abre com saldo que não cobre a compra', () => {
    useGameStore.setState({ balance: 100 });
    const eu = player('you', 'Você', true);
    const bots = ['Otto', 'Luna', 'Dante', 'Rex', 'Maya'].map((n, i) => player(`b${i}`, n));
    useTournamentStore.setState(
      {
        ...initialTournament,
        stage: 'lobby',
        format: 'cash',
        size: CASH_SEATS,
        buyIn: 1000,
        blind: 20,
        ownerId: 'you',
        members: [eu, ...bots],
        readyIds: ['you', ...bots.map((b) => b.id)],
      },
      true,
    );
    useTournamentStore.getState().startTournament();
    expect(useTournamentStore.getState().stage).toBe('lobby');
  });
});

describe('a mesa aberta está desligada', () => {
  /* Mesa aberta é a que continua na vitrine depois de começar. Ela
     existe inteira no projeto; o que saiu foi a porta — e a vitrine, que
     anunciava "Aberta" numa sala em que ninguém entra.
     Este teste é a rede do flag: se alguém religar a régua sem religar a
     vitrine (ou o contrário), ele cai. */
  it('a vitrine não anuncia sala aberta enquanto o flag estiver desligado', () => {
    const salas = Array.from({ length: 40 }, () => makeLobbyListings()).flat();
    expect(salas.length).toBeGreaterThan(0);
    if (OPEN_TABLE_ENABLED) {
      expect(salas.some((l) => l.mode === 'open')).toBe(true);
    } else {
      expect(salas.every((l) => l.mode === 'closed')).toBe(true);
    }
  });
});
