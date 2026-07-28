import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

/**
 * E2E do fluxo de jogo em viewport mobile.
 * O DevTools (habilitado no build de preview do Playwright) força os
 * resultados para tornar as verificações determinísticas — inclusive o
 * auto-aceite da negociação (o bot fecha qualquer proposta), que fixa o
 * valor da aposta nos fluxos de resultado.
 *
 * Como o forçar funciona no duelo de 21: a engine empilha o baralho com
 * blackjacks naturais, que decidem sozinhos.
 * - 'win': o jogador recebe o natural → a rodada resolve na
 *   distribuição, sem interação.
 * - 'lose': o rival recebe o natural e o jogador fica com 20 → é preciso
 *   PARAR (action-stand) para a rodada seguir.
 * - 'tie': os dois recebem naturais → resolve sozinho e devolve a aposta.
 */

/** Estado persistido com tutorial já visto e sons desligados. */
const SEEDED_STATE = {
  version: 2,
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

/**
 * Joga a rodada inteira com o resultado forçado já ligado. Com 'win' e
 * 'tie' (naturais) ela resolve sozinha; com 'lose' o jogador precisa
 * PARAR uma vez — `stands` cobre os dois casos.
 */
async function playRound(page: Page, stake: number, stands = 0) {
  await forceNegoAutoAccept(page);
  await page.getByTestId('confirm-match').click({ timeout: 15_000 });
  await negotiateStake(page, stake);
  // Câmera vertical: só o feltro em quadro enquanto as cartas correm
  // (o timeout cobre o beat de início + countdown 4,5 s).
  await expect(page.getByTestId('table-scene')).toHaveAttribute('data-camera', 'overhead', {
    timeout: 20_000,
  });
  for (let i = 0; i < stands; i += 1) {
    const stand = page.getByTestId('action-stand');
    await stand.click({ timeout: 30_000 });
    // O botão segue em cena por um beat após a ação (a carta final
    // assenta antes de a mesa virar): esperar ele SAIR evita um repique.
    await expect(stand).toBeHidden({ timeout: 15_000 });
  }
  await expect(page.getByTestId('result-title')).toBeVisible({ timeout: 45_000 });
  // No resultado a câmera volta para a crupiê reagir.
  await expect(page.getByTestId('table-scene')).toHaveAttribute('data-camera', 'front');
}

test('primeira jogada: tutorial, negociação e a vitória com blackjack', async ({ page }) => {
  await page.goto('/');

  // Home → Tutorial (primeira visita) → busca direta por oponente.
  await page.getByTestId('play-button').click();
  await page.getByTestId('tutorial-next').click();
  await page.getByTestId('tutorial-next').click();
  await page.getByTestId('tutorial-next').click();

  await forceOutcome(page, 'win');
  await forceNegoAutoAccept(page);

  await page.getByTestId('confirm-match').click({ timeout: 15_000 });

  // Mesa de negociação sobre o mesmo salão; a crupiê apresenta a mesa
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
  // Rodada única com blackjack natural: resolve sem nenhuma interação.
  await expect(page.getByTestId('result-title')).toHaveText(/VITÓRIA/, { timeout: 45_000 });
  // No desfecho o placar migra para as placas ao lado da crupiê: 21 na
  // sua (o natural) contra a mão do rival.
  await expect(page.getByTestId('player-total')).toHaveText('21');

  // O pote é fechado, natural ou não: 50 de aposta → +45 de ganho
  // líquido (90% do lance do rival; os 10% ficam com a casa).
  await expect(page.getByTestId('balance')).toContainText('1.045');
  // ...e a crupiê comemora a vitória do jogador.
  await expect(page.getByTestId('dealer')).toHaveAttribute('data-reaction', 'celebrate');
});

test('derrota: você para com 20 e o blackjack do rival leva a aposta', async ({ page }) => {
  await seedStorage(page);
  await page.goto('/');

  await page.getByTestId('play-button').click();
  await forceOutcome(page, 'lose');
  await forceNegoAutoAccept(page);
  await page.getByTestId('confirm-match').click({ timeout: 15_000 });
  await negotiateStake(page, 25);

  // A vez do jogador abre com a REGRA DE POV em cena: a última carta do
  // rival está virada para baixo, e o total dele é só o que está aberto.
  await expect(page.getByTestId('action-stand')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('img', { name: /carta oculta/ })).toBeVisible();
  await expect(page.getByTestId('opponent-total')).toContainText('+?');

  await page.getByTestId('action-stand').click();

  // No showdown a oculta vira e o blackjack do rival decide: 21 dele
  // contra os 20 com que você parou.
  await expect(page.getByTestId('result-title')).toHaveText(/DERROTA/, { timeout: 45_000 });
  await expect(page.getByTestId('opponent-total')).toHaveText('21');
  await expect(page.getByTestId('player-total')).toHaveText('20');
  await expect(page.getByTestId('balance')).toContainText('975');
});

test('empate: dois blackjacks devolvem a aposta', async ({ page }) => {
  await seedStorage(page);
  await page.goto('/');

  await page.getByTestId('play-button').click();
  await forceOutcome(page, 'tie');
  await playRound(page, 25);

  await expect(page.getByTestId('result-title')).toHaveText(/EMPATE/);
  await expect(page.getByTestId('result-delta')).toHaveText(/Aposta devolvida/);
  // Nada saiu do bolso: o saldo volta exatamente ao que era.
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

test('cancelar a busca não debita créditos e volta ao menu', async ({ page }) => {
  await seedStorage(page);
  await page.goto('/');

  await page.getByTestId('play-button').click();
  await page.getByTestId('cancel-search').click();

  // De volta à Home com o saldo intacto.
  await expect(page.getByTestId('play-button')).toBeVisible();
  await expect(page.getByTestId('balance')).toContainText('1.000');
});
