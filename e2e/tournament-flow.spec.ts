import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

/**
 * E2E do modo Torneio, focado no desfecho da partida do jogador:
 * - a contagem regressiva de retorno ao chaveamento (espelha o início
 *   automático da BracketScreen);
 * - o enquadramento do resultado (veredito centrado entre os poços e o
 *   botão), que é feito com espaçadores flex e só se verifica medindo.
 */

/**
 * O fluxo do torneio é longo por natureza: encher o lobby com bots +
 * a coreografia da mesa (~14,8s) + a contagem de retorno (10s) passam
 * bem do timeout padrão de 30s do Playwright.
 */
test.describe.configure({ timeout: 120_000 });

const SEEDED_STATE = {
  version: 1,
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
  // de 8, com os bots entrando um a um) e a menor taxa de entrada.
  await page.getByTestId('create-size-4').click();
  await page.getByTestId('create-fee-10').click();
  await page.getByTestId('create-confirm').click();

  // O dono não confirma presença — mas só inicia quando todos os outros
  // assentos confirmarem (o botão conta as confirmações até liberar).
  const start = page.getByTestId('start-tournament');
  await expect(start).toContainText(/\d\/4 JOGADORES CONFIRMADOS/);
  await expect(start).toBeEnabled({ timeout: 40_000 });
  await start.click();

  await page.getByTestId('play-tournament-match').click({ timeout: 20_000 });
  await expect(page.getByTestId('tournament-result-title')).toBeVisible({ timeout: 30_000 });
}

test('sala privada: características escolhidas na criação, senha na porta', async ({ page }) => {
  await seedStorage(page);
  await page.goto('/');

  await page.getByTestId('tournament-button').click();
  await page.getByTestId('create-room').click();

  // Privada é uma escolha DENTRO da folha — e é ela que revela o campo
  // de senha, logo abaixo do nome.
  await page.getByTestId('create-visibility-private').click();

  // A folha traz nome e senha já sugeridos; aqui reescrevemos os dois
  // para poder conferir exatamente o que a sala guardou.
  await page.getByTestId('create-name').fill('Mesa do Teste');
  await page.getByTestId('create-password').fill('4821');
  await page.getByTestId('create-size-4').click();
  await page.getByTestId('create-fee-10').click();
  await page.getByTestId('create-confirm').click();

  // A sala nasce com tudo o que foi escolhido, e a senha fica à mão do
  // anfitrião para ele convidar quem quiser.
  await expect(page.getByRole('heading', { name: 'Mesa do Teste' })).toBeVisible();
  await expect(page.getByTestId('lobby-visibility')).toContainText('Privada · Senha 4821');

  // A taxa é fato consumado na ficha da sala — não há onde reeditá-la.
  await page.getByTestId('lobby-settings').click();
  await expect(page.getByTestId('settings-fee')).toContainText('10');
  await expect(page.getByTestId('settings-password')).toContainText('4821');
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

test('o veredito fica centrado entre os poços e o botão', async ({ page }) => {
  await seedStorage(page);
  await page.goto('/');
  await playTournamentMatch(page);

  // Deixa as molas assentarem antes de medir.
  await page.waitForTimeout(900);

  const metrics = await page.evaluate(() => {
    const shakers = [...document.querySelectorAll('.shaker')].map((el) =>
      el.getBoundingClientRect(),
    );
    const diceBottom = Math.max(...shakers.map((r) => r.bottom));
    const titleEl = document.querySelector('[data-testid="tournament-result-title"]');
    const buttonEl = document.querySelector('[data-testid="back-to-bracket"]');
    if (!titleEl || !buttonEl) throw new Error('resultado do torneio não encontrado');
    const title = titleEl.getBoundingClientRect();
    const button = buttonEl.getBoundingClientRect();
    return {
      midpoint: (diceBottom + button.top) / 2,
      titleCenter: (title.top + title.bottom) / 2,
      diceAboveTitle: diceBottom < title.top,
    };
  });

  // Os poços ficam acima do veredito, e o veredito no meio exato da
  // faixa livre entre eles e o botão (tolerância de sub-pixel).
  expect(metrics.diceAboveTitle).toBe(true);
  expect(Math.abs(metrics.titleCenter - metrics.midpoint)).toBeLessThanOrEqual(1.5);
});
