import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

/**
 * E2E do fluxo de jogo em viewport mobile.
 * O DevTools (habilitado no build de preview do Playwright) força os
 * resultados para tornar as verificações determinísticas.
 */

/** Estado persistido com tutorial já visto e sons desligados. */
const SEEDED_STATE = {
  version: 1,
  state: {
    balance: 1000,
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
    // Roda em toda navegação (inclusive reload): semeia apenas uma vez
    // para não sobrescrever o progresso persistido pelo jogo.
    if (window.localStorage.getItem('bacbo-arena:state') === null) {
      window.localStorage.setItem('bacbo-arena:state', JSON.stringify(state));
    }
  }, SEEDED_STATE);
}

async function forceOutcome(page: Page, outcome: string) {
  await page.getByTestId('devtools-toggle').click();
  await page.getByTestId(`force-${outcome}`).click();
  await page.getByTestId('devtools-toggle').click();
}

async function playRound(page: Page, stake: number) {
  await page.getByTestId(`stake-${stake}`).click();
  await page.getByTestId('search-button').click();
  // Matchmaking simulado (1,2–2,6 s) → splash → confirmação dupla
  // (o oponente confirma sozinho e o countdown nasce com os dois prontos).
  await page.getByTestId('confirm-match').click({ timeout: 15_000 });
  // Câmera vertical: só a mesa em quadro enquanto os dados rolam.
  await expect(page.getByTestId('table-scene')).toHaveAttribute('data-camera', 'overhead', {
    timeout: 15_000,
  });
  // Countdown + rolagem + revelação até o resultado.
  await expect(page.getByTestId('result-title')).toBeVisible({ timeout: 20_000 });
  // No resultado a câmera volta para a dealer reagir.
  await expect(page.getByTestId('table-scene')).toHaveAttribute('data-camera', 'front');
}

test('primeira jogada: tutorial completo e vitória paga 1:1', async ({ page }) => {
  await page.goto('/');

  // Home → Tutorial (primeira visita) → Stake.
  await page.getByTestId('play-button').click();
  await page.getByTestId('tutorial-next').click();
  await page.getByTestId('tutorial-next').click();
  await page.getByTestId('tutorial-next').click();

  // A dealer apresenta a mesa na seleção de stake (docs/scenario.md §9.1).
  await expect(page.getByTestId('dealer')).toHaveAttribute('data-reaction', 'present');

  await forceOutcome(page, 'win');
  await playRound(page, 50);

  await expect(page.getByTestId('result-title')).toHaveText(/VITÓRIA/);
  await expect(page.getByTestId('result-delta')).toHaveText(/\+50/);
  await expect(page.getByTestId('balance')).toContainText('1.050');
  // ...e comemora a vitória do jogador.
  await expect(page.getByTestId('dealer')).toHaveAttribute('data-reaction', 'celebrate');
});

test('derrota: o stake é perdido', async ({ page }) => {
  await seedStorage(page);
  await page.goto('/');

  await page.getByTestId('play-button').click();
  await forceOutcome(page, 'lose');
  await playRound(page, 25);

  await expect(page.getByTestId('result-title')).toHaveText(/DERROTA/);
  await expect(page.getByTestId('balance')).toContainText('975');
});

test('empate: os créditos são devolvidos', async ({ page }) => {
  await seedStorage(page);
  await page.goto('/');

  await page.getByTestId('play-button').click();
  await forceOutcome(page, 'tie');
  await playRound(page, 25);

  await expect(page.getByTestId('result-title')).toHaveText(/EMPATE/);
  await expect(page.getByTestId('result-delta')).toHaveText(/devolvida/i);
  await expect(page.getByTestId('balance')).toContainText('1.000');
});

test('persistência: saldo e histórico sobrevivem ao reload', async ({ page }) => {
  await seedStorage(page);
  await page.goto('/');

  await page.getByTestId('play-button').click();
  await forceOutcome(page, 'win');
  await playRound(page, 50);
  await expect(page.getByTestId('balance')).toContainText('1.050');

  await page.reload();

  // De volta à Home com o saldo persistido.
  await expect(page.getByTestId('balance')).toContainText('1.050');
  await page.getByTestId('history-button').click();
  await expect(page.getByTestId('history-list').locator('li')).toHaveCount(1);
  await expect(page.getByTestId('history-list')).toContainText('+50');
});

test('cancelar a busca não debita créditos', async ({ page }) => {
  await seedStorage(page);
  await page.goto('/');

  await page.getByTestId('play-button').click();
  await page.getByTestId('stake-50').click();
  await page.getByTestId('search-button').click();
  await page.getByTestId('cancel-search').click();

  // De volta à seleção de stake com o saldo intacto.
  await expect(page.getByTestId('search-button')).toBeVisible();
  await expect(page.getByTestId('balance')).toContainText('1.000');
});
