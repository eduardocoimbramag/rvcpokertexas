import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import App from '@/App';

import { Card3D } from '../components/Card3D';
import { ConfirmPanel } from '../components/ConfirmPanel';
import { HistorySheet } from '../components/HistorySheet';
import { SessionBanner } from '../components/SessionBanner';
import { ResultStage } from '../components/ResultStage';
import type { PokerHistoryEntry, PokerResult, PokerSession } from '../engine/poker/types';
import type { Card, CardRank, CardSuit, Match } from '../engine/types';
import { useGameStore } from '../store/gameStore';

const card = (rank: CardRank, suit: CardSuit): Card => ({ rank, suit });

/**
 * Uma mão de Hold'em resolvida no showdown: par de Ases contra par de
 * Reis, num board seco. Stack de 100, os dois com 50 no pote → vitória
 * paga 50 de volta + 45 (90% do que o rival pôs).
 */
const samplePokerResult: PokerResult = {
  id: 'p1',
  matchId: 'm1',
  playerHole: [card('A', 'spades'), card('A', 'hearts')],
  opponentHole: [card('K', 'clubs'), card('K', 'diamonds')],
  board: [
    card('2', 'clubs'),
    card('7', 'diamonds'),
    card('9', 'hearts'),
    card('J', 'spades'),
    card('4', 'hearts'),
  ],
  playerRank: {
    category: 'pair',
    label: 'Par de Ases',
    detail: 'de Ases',
    cards: [
      card('A', 'spades'),
      card('A', 'hearts'),
      card('J', 'spades'),
      card('9', 'hearts'),
      card('7', 'diamonds'),
    ],
  },
  opponentRank: {
    category: 'pair',
    label: 'Par de Reis',
    detail: 'de Reis',
    cards: [
      card('K', 'clubs'),
      card('K', 'diamonds'),
      card('J', 'spades'),
      card('9', 'hearts'),
      card('7', 'diamonds'),
    ],
  },
  showdown: true,
  opponentShown: true,
  outcome: 'win',
  stake: 100,
  committed: { player: 50, opponent: 50 },
  contested: 50,
  pot: 100,
  payout: 145,
  netChange: 45,
  session: {
    matchId: 'm1',
    buyIn: 100,
    stacks: { player: 145, opponent: 55 },
    handsPlayed: 1,
    button: 'opponent' as const,
    over: false,
  },
  completedAt: 1700000000000,
};

const sampleEntry: PokerHistoryEntry = {
  ...samplePokerResult,
  kind: 'duel',
  opponentName: 'Luna',
};

afterEach(() => {
  // Restaura o store singleton entre os testes.
  useGameStore.setState(useGameStore.getInitialState(), true);
});

describe('ConfirmPanel — pareamento anônimo', () => {
  const match: Match = {
    id: 'm1',
    stake: 25,
    opponent: { id: 'o1', name: 'Luna', avatar: 'L', rating: 1420 },
    createdAt: 1700000000000,
  };

  const openConfirm = (confirmations = { player: false, opponent: false }) => {
    useGameStore.setState({ phase: 'confirm', match, confirmations });
  };

  it('o rival é "Oponente": sem nome, sem inicial e sem perfil a abrir', () => {
    openConfirm();
    const { container } = render(<ConfirmPanel />);

    // "?" e não "O": o medalhão diz "não se sabe quem é", não a inicial
    // de um nome que não existe.
    expect(screen.getByTestId('duelist-seat-opponent')).toHaveTextContent('?');
    expect(container.textContent).not.toContain('Luna');
    expect(screen.getByText('Oponente')).toBeInTheDocument();

    // Nada aqui abre o perfil — nem atalho de texto, nem avatar clicável.
    expect(screen.queryByText(/ver perfil/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('opponent-profile')).not.toBeInTheDocument();
    expect(container.querySelectorAll('button')).toHaveLength(2); // confirmar + recusar
  });

  it('a espera pelo rival também não o nomeia', () => {
    openConfirm({ player: true, opponent: false });
    render(<ConfirmPanel />);

    const waiting = screen.getByTestId('confirm-waiting');
    expect(waiting).toHaveTextContent(/aguardando oponente/i);
    expect(waiting.textContent).not.toContain('Luna');
  });

  it('os dois assentos são a MESMA peça — nada desnivela os avatares', () => {
    openConfirm();
    render(<ConfirmPanel />);

    const you = screen.getByTestId('duelist-seat-player');
    const rival = screen.getByTestId('duelist-seat-opponent');

    // A simetria não se mede em jsdom (não há layout), então o teste
    // trava o que a PRODUZ: avatares idênticos (só o aro muda de cor),
    // assentos com a mesma pilha de filhos e a fileira alinhada pelo
    // TOPO. Era o `items-center` que desnivelava — a coluna do rival
    // tinha um atalho a mais embaixo ("ver perfil"), e centrar as duas
    // colunas de alturas diferentes subia o avatar dele.
    expect(you.className).toBe(rival.className.replace('border-opponent', 'border-player'));

    const seatYou = you.closest('.flex-col');
    const seatRival = rival.closest('.flex-col');
    expect(seatYou?.className).toBe(seatRival?.className);
    expect(seatYou?.children.length).toBe(seatRival?.children.length);
    expect(seatYou?.parentElement).toHaveClass('items-start');
  });
});

describe('Card3D', () => {
  it('anuncia a carta via aria-label quando aberta', () => {
    render(<Card3D card={card('10', 'spades')} label="Sua carta 1" />);
    expect(screen.getByRole('img', { name: 'Sua carta 1: 10 de espadas' })).toBeInTheDocument();
  });

  it('anuncia "carta oculta" com a face para baixo, mesmo conhecendo a carta', () => {
    render(<Card3D card={card('A', 'hearts')} faceDown label="Carta de Luna 2" />);
    expect(screen.getByRole('img', { name: 'Carta de Luna 2: carta oculta' })).toBeInTheDocument();
  });

  it('carta desconhecida (null) também fica oculta', () => {
    render(<Card3D card={null} silent label="Carta de Luna 2" />);
    expect(screen.getByRole('img', { name: 'Carta de Luna 2: carta oculta' })).toBeInTheDocument();
  });

  it('baralho único: o verso é o da casa, igual para os dois duelistas', () => {
    // Sem escolha de cor na mesa — nenhuma prop pinta o verso, e o
    // brasão do clube no medalhão é o mesmo dos dois lados.
    const crest = (container: HTMLElement) => container.querySelector('.card3d__crest');
    const oculta = render(<Card3D card={null} silent label="Carta de Luna 2" />);
    expect(crest(oculta.container)).toBeInTheDocument();
    oculta.unmount();

    const virada = render(
      <Card3D card={card('9', 'hearts')} faceDown silent label="Sua carta 2" />,
    );
    expect(crest(virada.container)).toBeInTheDocument();
    // O desenho vem do SVG da marca usado como máscara — nada de texto.
    expect(virada.container.querySelector('.card3d__crest')).toHaveStyle({
      '--crest-src': 'url("/brasaorvc.svg")',
    });
  });
});

describe('SessionBanner — o caixa da sessão', () => {
  /* O ResultStage centra o veredito espelhando o que vem ABAIXO dele em
     cópias invisíveis (ver ResultStage) — então o extrato existe duas
     vezes no DOM. Só a de fora do fantasma é a que se lê. */
  const visible = (testId: string) => {
    const found = screen.getAllByTestId(testId).find((el) => !el.closest('.invisible'));
    if (!found) throw new Error(`sem elemento visível para ${testId}`);
    return found;
  };

  const session = (patch: Partial<PokerSession> = {}): PokerSession => ({
    matchId: 'm1',
    buyIn: 1000,
    stacks: { player: 1500, opponent: 500 },
    handsPlayed: 7,
    button: 'player',
    over: true,
    ...patch,
  });

  it('quem sai no LUCRO leva a festa inteira da casa', () => {
    render(<SessionBanner session={session()} />);

    expect(screen.getByTestId('result-title')).toHaveTextContent('BOA PARTIDA!');
    expect(screen.getByTestId('result-blaze')).toHaveAttribute('data-outcome', 'victory');
    // As duas escalas da festa convivem: o ouro é o acabamento da
    // palavra, o confete é a sala inteira comemorando.
    expect(screen.getByTestId('confetti')).toBeInTheDocument();
  });

  it('a faixa traz o LÍQUIDO, e a comissão não aparece em lugar nenhum', () => {
    /* Sentou com 1.000, levantou com 1.500: o lucro de 500 entra no saldo
       como 450. A conta some da tela — e a palavra também. A tela não
       omite nada: ela deixou de ser uma tabela. */
    render(<SessionBanner session={session()} />);

    expect(visible('payout-value')).toHaveTextContent('450');
    expect(screen.getByTestId('session-payout')).toHaveTextContent('Você terminou no positivo');
    /* A asserção que guarda a restrição do dono. Sem ela a palavra volta
       na primeira manutenção que "só quis dar mais transparência". */
    expect(screen.queryByText(/comiss/i)).toBeNull();
    // E o bruto não vaza junto com o líquido.
    expect(screen.queryByText(/1\.500/)).toBeNull();
    expect(screen.queryByTestId('payout-closed')).not.toBeInTheDocument();
  });

  it('quem NÃO lucra recebe o MESMO ouro, e um fecho no lugar do número', () => {
    /* Perder fichas já é a notícia ruim: carimbá-la com rubi quebrado
       cobraria duas vezes pela mesma coisa. Mas negar o ouro seria
       mesquinhez — a diferença entre ganhar e não ganhar deixou de ser
       TER ou NÃO TER metal e passou a ser o que o metal faz. */
    render(<SessionBanner session={session({ stacks: { player: 300, opponent: 1700 } })} />);

    expect(screen.getByTestId('result-title')).toHaveTextContent('VALEU PELA PARTIDA!');
    expect(screen.getByTestId('result-blaze')).toHaveAttribute('data-outcome', 'close');
    expect(visible('payout-closed')).toHaveTextContent('Mesa encerrada');
    expect(screen.queryByTestId('payout-value')).not.toBeInTheDocument();
  });

  it('e nada da DERROTA vaza para o fecho', () => {
    /* `!victory` deixou de significar "derrota" quando entrou o terceiro
       desfecho. Sem as guardas por extenso, quem levanta sem lucro leva
       um feixe vinho no título e uma vinheta escura no body. */
    render(<SessionBanner session={session({ stacks: { player: 300, opponent: 1700 } })} />);

    expect(screen.queryByTestId('ember-vignette')).not.toBeInTheDocument();
    expect(screen.queryByTestId('confetti')).not.toBeInTheDocument();
    // A festa do fecho não é desligada: ela nunca chega a ser montada.
    expect(document.querySelectorAll('.blaze-particle')).toHaveLength(0);
    expect(document.querySelector('.result-blaze__beam')).toBeNull();
  });

  it('lucro que a comissão zera cai no fecho — nada de "+0" com festa', () => {
    /* `afterHouseEdge` arredonda para baixo: um lucro de 1 ficha vira 0.
       Carimbar "BOA PARTIDA! +0 créditos" seria a tela mentindo. */
    render(<SessionBanner session={session({ stacks: { player: 1001, opponent: 999 } })} />);

    expect(visible('payout-closed')).toBeInTheDocument();
    expect(screen.queryByTestId('payout-value')).not.toBeInTheDocument();
  });

  it('a tela não olha para trás: nem contagem de mãos, nem por que fechou', () => {
    /* A nota contava quantas mãos correram e por que a mesa fechou — duas
       informações sobre o PASSADO, em corpo miúdo e tinta apagada,
       embaixo da única coisa que a tela existe para dizer. Quem quer o
       retrospecto tem o histórico. */
    render(<SessionBanner session={session({ leftBy: 'player' })} />);

    expect(screen.queryByTestId('session-reason')).not.toBeInTheDocument();
    expect(screen.queryByText(/mãos jogadas|mão jogada/)).toBeNull();
    expect(screen.queryByText(/levantou da mesa/)).toBeNull();
    // E a unidade também: a ficha da faixa já diz que são créditos.
    expect(screen.queryByText(/créditos nesta mesa/i)).toBeNull();
  });
});

describe('ResultStage', () => {
  /**
   * O palco é compartilhado pelos TRÊS desfechos (duelo, partida do
   * torneio, mesa única) e o que ele carrega de precioso é a centragem
   * por espelho: para cada linha abaixo do título entra uma cópia
   * invisível acima. Se as cópias sumirem, nada quebra, nada dá erro — o
   * veredito só passa a cair um pouco alto demais, que é exatamente o
   * tipo de regressão que ninguém percebe até estar publicada.
   */
  const lines = (container: HTMLElement, selector: string) => [
    ...container.querySelectorAll(selector),
  ];

  it('espelha subtítulo, débito e contagem acima do título para centrar o veredito', () => {
    const { container } = render(
      <ResultStage
        surface="felt"
        tone="lose"
        title="DERROTA"
        titleTestId="t"
        subtitle="Fim da sua caminhada"
        note="Taxa de entrada de 10 debitada"
        footer="Retornando em 8s"
      >
        <button type="button">VOLTAR</button>
      </ResultStage>,
    );

    // Cada linha existe DUAS vezes: a que se lê e a que só ocupa altura.
    for (const selector of [
      '.result-stage__subtitle',
      '.result-stage__note',
      '.result-stage__footer',
    ]) {
      const both = lines(container, selector);
      expect(both, selector).toHaveLength(2);
      // A cópia é invisível e fora do fluxo de leitura...
      const ghost = both.find((el) => el.classList.contains('invisible'));
      expect(ghost, selector).toBeDefined();
      expect(ghost).toHaveAttribute('aria-hidden');
      // ...e tem o MESMO texto, senão não teria a mesma altura.
      expect(ghost?.textContent).toBe(both.find((el) => el !== ghost)?.textContent);
    }

    // Quem lê a tela ouve o veredito uma vez só.
    expect(screen.getAllByText('Fim da sua caminhada')).toHaveLength(2);
    expect(screen.getByTestId('t')).toHaveTextContent('DERROTA');
  });

  it('sem subtítulo e sem débito, não inventa cópia nenhuma', () => {
    const { container } = render(
      <ResultStage surface="overlay" tone="win" title="VITÓRIA!" titleTestId="t">
        <button type="button">VER O RESULTADO</button>
      </ResultStage>,
    );
    expect(lines(container, '.result-stage__subtitle')).toHaveLength(0);
    expect(lines(container, '.result-stage__note')).toHaveLength(0);
    expect(lines(container, '.result-stage__footer')).toHaveLength(0);
    // A superfície manda na roupa: a cortina escura da mesa única.
    expect(container.querySelector('.result-stage')).toHaveClass('result-stage--overlay');
  });
});

/**
 * Marcações cujo papel IMPLÍCITO já admite nome acessível. Qualquer outra
 * (span, div, p…) precisa de `role` explícito ao lado do `aria-label`:
 * sem ele a especificação ARIA proíbe o nome e o leitor de tela descarta
 * o rótulo em silêncio.
 */
const NOMEAVEIS = new Set([
  'A',
  'AREA',
  'ASIDE',
  'BUTTON',
  'DIALOG',
  'FORM',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'IFRAME',
  'IMG',
  'INPUT',
  'MAIN',
  'METER',
  'NAV',
  'OUTPUT',
  'PROGRESS',
  'SECTION',
  'SELECT',
  'SUMMARY',
  'TABLE',
  'TEXTAREA',
]);

/** Rótulos que o navegador vai jogar fora, com o seletor de cada um. */
function rotulosMudos(container: HTMLElement): string[] {
  return [...container.querySelectorAll('[aria-label]')]
    .filter((el) => !el.hasAttribute('role') && !NOMEAVEIS.has(el.tagName))
    .map((el) => `${el.tagName.toLowerCase()}[aria-label="${el.getAttribute('aria-label')}"]`);
}

describe('acessibilidade: nenhum rótulo mudo', () => {
  /**
   * Um `aria-label` em elemento sem papel é a pior classe de bug de
   * acessibilidade: não dá erro, não quebra teste nenhum, não muda um
   * pixel — o código acha que está entregando a informação e ela nunca
   * sai. Esta varredura é o que impede o padrão de voltar.
   */
  it('Home, histórico e tutorial não têm aria-label descartado', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    // Guarda contra a varredura passar por não ter olhado nada: a Home
    // tem saldo, ajustes e o logotipo rotulados.
    expect(container.querySelectorAll('[aria-label]').length).toBeGreaterThanOrEqual(3);
    expect(rotulosMudos(container)).toEqual([]);

    await user.click(screen.getByTestId('play-button'));
    expect(rotulosMudos(container)).toEqual([]);
  });

  it('a folha do histórico não tem, nem vazia nem cheia', () => {
    const vazia = render(<HistorySheet open onClose={() => undefined} />);
    expect(rotulosMudos(vazia.container)).toEqual([]);
    vazia.unmount();

    useGameStore.setState({ history: [sampleEntry] });
    const cheia = render(<HistorySheet open onClose={() => undefined} />);
    expect(rotulosMudos(cheia.container)).toEqual([]);
  });
});

describe('HistorySheet', () => {
  it('mostra estado vazio sem rodadas', () => {
    render(<HistorySheet open onClose={() => undefined} />);
    expect(screen.getByTestId('history-empty')).toBeInTheDocument();
    // O vazio deixou de ser um beco: tem o brasão da casa e uma saída.
    expect(screen.getByTestId('history-play')).toBeInTheDocument();
  });

  it('do vazio dá para sair jogando: o CTA fecha a folha e procura oponente', async () => {
    const user = userEvent.setup();
    let aberta = true;
    render(<HistorySheet open onClose={() => (aberta = false)} />);

    await user.click(screen.getByTestId('history-play'));
    expect(aberta).toBe(false);
    expect(useGameStore.getState().phase).toBe('search');
  });

  it('lista rodadas persistidas com resultado e variação', () => {
    useGameStore.setState({ history: [sampleEntry] });
    render(<HistorySheet open onClose={() => undefined} />);

    expect(screen.getByTestId('history-list')).toBeInTheDocument();
    expect(screen.getByText(/vs Luna/)).toBeInTheDocument();
    expect(screen.getByText('+45')).toBeInTheDocument();
  });
});

describe('App (fluxo Home → Tutorial → Busca)', () => {
  it('JOGAR vai direto para a mesa — o tutorial não intercepta ninguém', async () => {
    const user = userEvent.setup();
    render(<App />);

    // O logotipo é desenhado letra a letra em dois andares (POKER /
    // ARENA), então quem responde pela marca é o NOME ACESSÍVEL do
    // título, não um nó de texto.
    expect(screen.getByRole('heading', { name: 'Poker Arena' })).toBeInTheDocument();

    /* Mesmo com o tutorial nunca visto, o botão de jogar JOGA. Ele já
       desviava para o tutorial na primeira partida — interceptando um
       toque que dizia "quero jogar" e entregando outra coisa. */
    expect(useGameStore.getState().settings.tutorialSeen).toBe(false);
    await user.click(screen.getByTestId('play-button'));

    expect(screen.queryByRole('dialog', { name: 'Como jogar' })).not.toBeInTheDocument();
    expect(useGameStore.getState().phase).toBe('search');
    expect(await screen.findByText('Procurando oponente…')).toBeInTheDocument();
  });

  it('o COMO JOGAR abre a folha, e ela ensina Texas Hold’em', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /como jogar/i }));
    expect(screen.getByRole('dialog', { name: 'Como jogar' })).toBeInTheDocument();

    // Os passos falam do jogo que se joga: entrada fixa, as duas
    // fechadas, as ruas de aposta e o showdown.
    expect(screen.getByText(/Texas Hold/i)).toBeInTheDocument();
    await user.click(screen.getByTestId('tutorial-next'));
    expect(screen.getByText(/comunitárias/i)).toBeInTheDocument();
    await user.click(screen.getByTestId('tutorial-next'));
    expect(screen.getByText(/AUMENTAR/)).toBeInTheDocument();
    await user.click(screen.getByTestId('tutorial-next'));
    expect(screen.getByText(/showdown/i)).toBeInTheDocument();

    // Nada de 21 sobrou no texto: o jogo mudou, a folha mudou com ele.
    expect(screen.queryByText(/blackjack/i)).not.toBeInTheDocument();

    /* Fechar devolve o jogador para onde ele estava — a folha é consulta,
       não caminho. Avança até o fim sem contar passos: o número de telas
       muda com o jogo, e um teste que o fixasse quebraria a cada regra
       nova sem ter nada a dizer sobre ela. */
    for (let passo = 0; passo < 10; passo += 1) {
      const proximo = screen.queryByTestId('tutorial-next');
      if (!proximo) break;
      await user.click(proximo);
    }
    expect(useGameStore.getState().phase).toBe('idle');
    expect(useGameStore.getState().settings.tutorialSeen).toBe(true);
  });
});
