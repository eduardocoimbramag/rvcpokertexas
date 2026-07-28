import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

/**
 * E2E do modo Torneio, focado no desfecho da partida do jogador:
 * - a contagem regressiva de retorno ao chaveamento (espelha o início
 *   automático da BracketScreen);
 * - o enquadramento do resultado (veredito centrado entre a mesa e o
 *   botão), que é feito com espaçadores flex e só se verifica medindo.
 */

/**
 * O fluxo do torneio é longo por natureza: encher o lobby com bots + a
 * coreografia da mesa (apresentação 3,4s + cara-ou-coroa até ~19s, com
 * o relógio da escolha correndo inteiro quando ninguém toca + a mão de
 * blackjack interativa ~15–40s, com re-distribuição em empate) + a
 * contagem de retorno (10s) passam bem do padrão.
 */
test.describe.configure({ timeout: 180_000 });

const SEEDED_STATE = {
  version: 2,
  state: {
    balance: 5000,
    history: [],
    settings: {
      audio: { muted: true, musicVolume: 0.4, sfxVolume: 0.8 },
      vibrationEnabled: false,
      tutorialSeen: true,
    },
  },
};

async function seedStorage(page: Page) {
  await page.addInitScript((state) => {
    if (window.localStorage.getItem('bacbo-arena:state') === null) {
      window.localStorage.setItem('bacbo-arena:state', JSON.stringify(state));
    }
  }, SEEDED_STATE);
}

/** Cria uma sala de 4, inicia o torneio e joga a partida do jogador. */
async function playTournamentMatch(page: Page) {
  await page.getByTestId('tournament-button').click();
  await page.getByTestId('create-room').click();

  // Tudo se escolhe na criação: sala de 4 (enche bem mais rápido que a
  // de 8, com os bots entrando um a um) e a taxa digitada à mão.
  await page.getByTestId('create-size-4').click();
  await page.getByTestId('create-fee').fill('10');
  await page.getByTestId('create-confirm').click();

  // O dono não confirma presença — mas só inicia quando todos os outros
  // assentos confirmarem (o botão conta as confirmações até liberar).
  const start = page.getByTestId('start-tournament');
  await expect(start).toContainText(/\d\/4 JOGADORES CONFIRMADOS/);
  await expect(start).toBeEnabled({ timeout: 40_000 });
  await start.click();

  await page.getByTestId('play-tournament-match').click({ timeout: 20_000 });

  // A partida do torneio passa pelo MESMO cara-ou-coroa do 1v1: a moeda
  // entra em cena antes das cartas. Sem tocar em nada, o relógio da
  // escolha (10s) corre inteiro e a mesa sorteia a cor pelo jogador.
  await expect(page.getByTestId('coinflip-overlay')).toBeVisible({ timeout: 15_000 });

  // A mão é INTERATIVA: paramos na primeira oportunidade. Um blackjack
  // natural resolve sozinho (a vez do jogador nem abre) e um empate
  // re-distribui — o laço cobre os dois: PARA sempre que a vez abrir,
  // até o veredito entrar em cena.
  const title = page.getByTestId('tournament-result-title');
  const deadline = Date.now() + 120_000;
  while (!(await title.isVisible().catch(() => false)) && Date.now() < deadline) {
    const stand = page.getByTestId('action-stand');
    if (await stand.isVisible().catch(() => false)) {
      await stand.click().catch(() => undefined);
    }
    await page.waitForTimeout(400);
  }
  await expect(title).toBeVisible({ timeout: 5_000 });
}

test('sala privada: características escolhidas na criação, senha na porta', async ({ page }) => {
  await seedStorage(page);
  await page.goto('/');

  await page.getByTestId('tournament-button').click();
  await page.getByTestId('create-room').click();

  // A folha oferece os três tamanhos de mesa — inclusive a copa de 16,
  // que abre nas oitavas. O quantitativo é fixo após a criação.
  await expect(page.getByTestId('create-size-16')).toBeVisible();

  // Privada é uma escolha DENTRO da folha — e é ela que revela o campo
  // de senha, logo abaixo do nome.
  await page.getByTestId('create-visibility-private').click();

  // A folha traz nome e senha já sugeridos; aqui reescrevemos os dois
  // para poder conferir exatamente o que a sala guardou.
  await page.getByTestId('create-name').fill('Mesa do Teste');
  await page.getByTestId('create-password').fill('4821');
  await page.getByTestId('create-size-4').click();

  // Taxa livre: os atalhos somam sobre o valor digitado (10 + 100 = 110)
  // e a premiação acompanha a mudança na hora — 110 × 3 assentos
  // perdedores, menos os 10% da casa, metade para o campeão = 148.
  await page.getByTestId('create-fee').fill('10');
  await page.getByTestId('create-fee-plus-100').click();
  await expect(page.getByTestId('create-fee')).toHaveValue('110');
  await expect(page.getByTestId('create-prize')).toContainText('148');

  // De volta a 10 para o resto do fluxo caber no saldo semeado.
  await page.getByTestId('create-fee').fill('10');
  await page.getByTestId('create-confirm').click();

  // A sala nasce com tudo o que foi escolhido. O cabeçalho traz SÓ o
  // nome — visibilidade, código e senha são ficha técnica.
  await expect(page.getByRole('heading', { name: 'Mesa do Teste' })).toBeVisible();
  await expect(page.getByTestId('lobby-visibility')).toHaveCount(0);

  // A ficha da sala guarda o que foi decidido na criação; nada ali se
  // reedita — nem a taxa, nem o tamanho.
  await page.getByTestId('lobby-settings').click();
  await expect(page.getByTestId('settings-code')).toContainText('Privada');
  await expect(page.getByTestId('settings-size')).toContainText('4 jogadores');
  await expect(page.getByTestId('settings-fee')).toContainText('10');
  await expect(page.getByTestId('settings-password')).toContainText('4821');
});

test('entrar numa sala passa por uma confirmação com a taxa', async ({ page }) => {
  await seedStorage(page);
  await page.goto('/');
  await page.getByTestId('tournament-button').click();

  // A vitrine é sorteada; a primeira sala é sempre pública (a lista
  // nunca abre com uma porta trancada).
  const first = page.getByTestId('public-lobbies').locator('button').first();
  const label = await first.getAttribute('aria-label');
  await first.click();

  // O toque não entrou em sala nenhuma: abriu a pergunta da porta.
  const dialog = page.getByTestId('join-room-confirm');
  await expect(dialog).toContainText('Deseja realmente entrar em');
  await expect(dialog).toContainText('taxa de entrada');
  await expect(page.getByTestId('lobby-settings')).toHaveCount(0);

  // "Não" devolve a lista intacta.
  await page.getByTestId('confirm-dialog-cancel').click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('public-lobbies')).toBeVisible();

  // "Sim" abre a sala escolhida.
  await first.click();
  await page.getByTestId('confirm-dialog-accept').click();
  await expect(page.getByTestId('lobby-settings')).toBeVisible();
  await expect(page.getByRole('heading', { name: (label ?? '').split(',')[0] })).toBeVisible();
});

test('a partida do torneio volta sozinha ao chaveamento após a contagem', async ({ page }) => {
  await seedStorage(page);
  await page.goto('/');
  await playTournamentMatch(page);

  // A contagem aparece e decresce até o fim.
  await expect(page.getByTestId('auto-return')).toContainText(/Retornando em \d+s/);
  await expect(page.getByTestId('auto-return')).toContainText(/Retornando em [1-3]s/, {
    timeout: 12_000,
  });

  // Sem nenhum clique, a tela de resultado sai sozinha.
  await expect(page.getByTestId('tournament-result-title')).toBeHidden({ timeout: 15_000 });
});

test('o botão volta ao chaveamento imediatamente', async ({ page }) => {
  await seedStorage(page);
  await page.goto('/');
  await playTournamentMatch(page);

  await page.getByTestId('back-to-bracket').click();
  await expect(page.getByTestId('tournament-result-title')).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Chaveamento' })).toBeVisible();
});

test('o veredito fica centrado entre a mesa e o botão', async ({ page }) => {
  await seedStorage(page);
  await page.goto('/');
  await playTournamentMatch(page);

  // Deixa as molas assentarem antes de medir.
  await page.waitForTimeout(900);

  const metrics = await page.evaluate(() => {
    const blockEl = document.querySelector('[data-testid="tournament-result-block"]');
    const titleEl = document.querySelector('[data-testid="tournament-result-title"]');
    const buttonEl = document.querySelector('[data-testid="back-to-bracket"]');
    if (!blockEl || !titleEl || !buttonEl) throw new Error('resultado do torneio não encontrado');
    const block = blockEl.getBoundingClientRect();
    const title = titleEl.getBoundingClientRect();
    const button = buttonEl.getBoundingClientRect();
    // As placas de placar flanqueiam a dealer, bem acima do veredito.
    const plates = [...document.querySelectorAll('.score-plate')].map((el) =>
      el.getBoundingClientRect(),
    );
    const platesBottom = plates.length > 0 ? Math.max(...plates.map((r) => r.bottom)) : 0;
    return {
      midpoint: (block.top + button.top) / 2,
      titleCenter: (title.top + title.bottom) / 2,
      platesAboveTitle: platesBottom < title.top,
    };
  });

  // As placas ficam acima do veredito, e o veredito no meio exato da
  // faixa livre entre o topo do bloco e o botão (tolerância de
  // sub-pixel — as cópias invisíveis compensam contagem e subtítulo).
  expect(metrics.platesAboveTitle).toBe(true);
  expect(Math.abs(metrics.titleCenter - metrics.midpoint)).toBeLessThanOrEqual(1.5);
});
