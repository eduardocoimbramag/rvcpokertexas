import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

/**
 * E2E do fluxo de jogo em viewport mobile.
 * O DevTools (habilitado no build de preview do Playwright) força os
 * resultados para tornar as verificações determinísticas — inclusive o
 * auto-aceite da negociação (o bot fecha qualquer proposta), que fixa o
 * valor da aposta nos fluxos de resultado.
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

/**
 * Força o vencedor do cara-ou-coroa. Com o oponente vencendo, o sorteio
 * corre sozinho (ele escolhe a própria cor) e `playRound` atravessa a
 * fase sem interação — determinístico para os fluxos de resultado.
 */
async function forceCoinWinner(page: Page, winner: 'player' | 'opponent') {
  await page.getByTestId('devtools-toggle').click();
  await page.getByTestId(`force-coin-${winner}`).click();
  await page.getByTestId('devtools-toggle').click();
}

/** Liga o auto-aceite da negociação: o bot fecha qualquer proposta. */
async function forceNegoAutoAccept(page: Page) {
  await page.getByTestId('devtools-toggle').click();
  await page.getByTestId('force-nego-accept').click();
  await page.getByTestId('devtools-toggle').click();
}

/**
 * Atravessa a mesa de negociação propondo `stake` (bot em auto-aceite)
 * e inicia a partida.
 */
async function negotiateStake(page: Page, stake: number) {
  // Matchmaking (1,2–2,6 s) → splash → confirmação dupla → negociação.
  await page.getByTestId('nego-input').fill(String(stake), { timeout: 15_000 });
  await page.getByTestId('nego-send').click();
  // O aceite do bot chega em ~2–4 s; o clique espera o CTA destravar.
  await page.getByTestId('nego-start').click({ timeout: 15_000 });
}

async function playRound(page: Page, stake: number) {
  await forceCoinWinner(page, 'opponent');
  await forceNegoAutoAccept(page);
  await page.getByTestId('confirm-match').click({ timeout: 15_000 });
  await negotiateStake(page, stake);
  // A moeda entra em cena com o lado sorteado do jogador.
  await expect(page.getByTestId('coinflip-overlay')).toBeVisible({ timeout: 10_000 });
  // Câmera vertical: só a mesa em quadro enquanto os dados rolam
  // (o timeout cobre sorteio ~10 s + countdown 4,5 s).
  await expect(page.getByTestId('table-scene')).toHaveAttribute('data-camera', 'overhead', {
    timeout: 30_000,
  });
  // Countdown + rolagem + revelação até o resultado.
  await expect(page.getByTestId('result-title')).toBeVisible({ timeout: 20_000 });
  // No resultado a câmera volta para a dealer reagir.
  await expect(page.getByTestId('table-scene')).toHaveAttribute('data-camera', 'front');
}

test('primeira jogada: tutorial, negociação e vitória leva 90% da aposta', async ({ page }) => {
  await page.goto('/');

  // Home → Tutorial (primeira visita) → busca direta por oponente.
  await page.getByTestId('play-button').click();
  await page.getByTestId('tutorial-next').click();
  await page.getByTestId('tutorial-next').click();
  await page.getByTestId('tutorial-next').click();

  await forceOutcome(page, 'win');
  await forceCoinWinner(page, 'opponent');
  await forceNegoAutoAccept(page);

  await page.getByTestId('confirm-match').click({ timeout: 15_000 });

  // Mesa de negociação sobre o mesmo salão; a dealer apresenta a mesa
  // (docs/scenario.md §9.1).
  await expect(page.getByTestId('negotiation-panel')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('dealer')).toHaveAttribute('data-reaction', 'present');

  // Sem acordo, o início fica bloqueado.
  await expect(page.getByTestId('nego-start')).toBeDisabled();

  // Proposta de 50: o lance entra no chat e o bot aceita.
  await page.getByTestId('nego-input').fill('50');
  await page.getByTestId('nego-send').click();
  await expect(page.getByTestId('nego-proposal-player')).toBeVisible();
  // O acordo não vira mensagem: o próprio cartão do lance ganha o selo.
  await expect(page.getByTestId('nego-accepted')).toBeVisible({ timeout: 15_000 });

  await page.getByTestId('nego-start').click();
  await expect(page.getByTestId('coinflip-overlay')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('result-title')).toHaveText(/VITÓRIA/, { timeout: 45_000 });

  // A variação sobe para a pílula de saldo e o contador chega ao total.
  await expect(page.getByTestId('balance')).toContainText('1.045');
  // ...e a dealer comemora a vitória do jogador.
  await expect(page.getByTestId('dealer')).toHaveAttribute('data-reaction', 'celebrate');
});

test('derrota: o stake negociado é perdido', async ({ page }) => {
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
  await expect(page.getByTestId('balance')).toContainText('1.045');

  await page.reload();

  // De volta à Home com o saldo persistido.
  await expect(page.getByTestId('balance')).toContainText('1.045');
  await page.getByTestId('history-button').click();
  await expect(page.getByTestId('history-list').locator('li')).toHaveCount(1);
  await expect(page.getByTestId('history-list')).toContainText('+45');
});

test('negociação: contraproposta do bot pode ser aceita; desistir volta ao menu', async ({
  page,
}) => {
  await seedStorage(page);
  await page.goto('/');

  await page.getByTestId('play-button').click();
  await page.getByTestId('confirm-match').click({ timeout: 15_000 });

  // Lance mínimo (10): o alvo do bot é sempre maior, então a resposta é
  // garantidamente uma CONTRAPROPOSTA — que traz o botão de aceitar.
  await page.getByTestId('nego-input').fill('10', { timeout: 15_000 });
  await page.getByTestId('nego-send').click();
  await expect(page.getByTestId('nego-accept')).toBeVisible({ timeout: 15_000 });

  // Aceitar fecha o acordo e destrava o início.
  await page.getByTestId('nego-accept').click();
  await expect(page.getByTestId('nego-accepted')).toBeVisible();
  await expect(page.getByTestId('nego-start')).toBeEnabled();

  // Desistir abandona a mesa sem debitar nada.
  await page.getByTestId('nego-quit').click();
  await expect(page.getByTestId('play-button')).toBeVisible();
  await expect(page.getByTestId('balance')).toContainText('1.000');
});

test('cara-ou-coroa: vencendo o sorteio, o jogador escolhe a cor dos dados', async ({ page }) => {
  await seedStorage(page);
  await page.goto('/');

  await page.getByTestId('play-button').click();
  await forceOutcome(page, 'win');
  await forceCoinWinner(page, 'player');
  await forceNegoAutoAccept(page);

  await page.getByTestId('confirm-match').click({ timeout: 15_000 });
  await negotiateStake(page, 50);

  // Moeda no ar → veredito sozinho em cena → escolha dos dados
  // (intro + voo + resultado + veredito ≈ 7,7 s).
  await expect(page.getByTestId('coin-side')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('coin-winner')).toHaveText(/Você venceu o sorteio/, {
    timeout: 15_000,
  });
  await expect(page.getByTestId('coin-headline')).toHaveText(/Escolha seus dados/, {
    timeout: 15_000,
  });

  // A escolha corre sob relógio — zerado, a mesa sorteia a cor sozinha.
  await expect(page.getByTestId('pick-countdown')).toContainText(/Escolha automática em \d+s/);

  // Confirmar só habilita depois de escolher um dos dois dados.
  const confirm = page.getByTestId('confirm-dice-color');
  await expect(confirm).toBeDisabled();
  await page.getByTestId('dice-color-vermelho').click();
  await confirm.click();

  // A troca vale pela rodada inteira: o dado do jogador assume o
  // vermelho (e o oponente fica com o azul). A asserção mira a cor
  // aplicada — que dura toda a rodada — e não o rótulo do beat, que
  // vive só 1,1 s antes de a fase virar countdown.
  await expect(page.getByTestId('shaker-player-1').locator('.die-scene')).toHaveAttribute(
    'style',
    /#f87171/,
    { timeout: 15_000 },
  );

  // A rodada segue normalmente até o resultado com os dados escolhidos.
  await expect(page.getByTestId('result-title')).toHaveText(/VITÓRIA/, { timeout: 30_000 });
});

test('cancelar a busca não debita créditos e volta ao menu', async ({ page }) => {
  await seedStorage(page);
  await page.goto('/');

  await page.getByTestId('play-button').click();
  await page.getByTestId('cancel-search').click();

  // De volta à Home com o saldo intacto.
  await expect(page.getByTestId('play-button')).toBeVisible();
  await expect(page.getByTestId('balance')).toContainText('1.000');
});
