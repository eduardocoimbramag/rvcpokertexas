import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

/**
 * E2E do fluxo de jogo em viewport mobile.
 * O DevTools (habilitado no build de preview do Playwright) força os
 * resultados para tornar as verificações determinísticas — inclusive o
 * auto-aceite da negociação (o bot fecha qualquer proposta), que fixa o
 * valor da aposta nos fluxos de resultado.
 *
 * Como o forçar funciona no blackjack: a engine empilha o sapato.
 * - 'win': o jogador recebe BLACKJACK NATURAL → a rodada resolve na
 *   distribuição, sem interação, e a vitória decisiva paga 3:2.
 * - 'lose': o rival recebe o natural e o jogador fica com 20 → é preciso
 *   PARAR (action-stand) para a rodada seguir.
 * - 'tie': os dois recebem naturais → resolve sozinho e re-distribui.
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

/**
 * Força o vencedor do cara-ou-coroa. Com o oponente vencendo, o sorteio
 * corre sozinho (ele escolhe a própria cor) e a rodada atravessa a fase
 * sem interação — determinístico para os fluxos de resultado.
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

/**
 * Joga a SÉRIE inteira (melhor de 3) com o resultado forçado já ligado.
 * Com 'win' (naturais do jogador) a série fecha sozinha em 2 rodadas;
 * com 'lose' o jogador precisa PARAR uma vez por rodada — `stands`
 * cobre os dois casos.
 */
async function playSeries(page: Page, stake: number, stands = 0) {
  await forceCoinWinner(page, 'opponent');
  await forceNegoAutoAccept(page);
  await page.getByTestId('confirm-match').click({ timeout: 15_000 });
  await negotiateStake(page, stake);
  // A moeda entra em cena com o lado sorteado do jogador.
  await expect(page.getByTestId('coinflip-overlay')).toBeVisible({ timeout: 10_000 });
  // Câmera vertical: só o feltro em quadro enquanto as cartas correm
  // (o timeout cobre sorteio ~10 s + countdown 4,5 s).
  await expect(page.getByTestId('table-scene')).toHaveAttribute('data-camera', 'overhead', {
    timeout: 30_000,
  });
  // Nas rodadas interativas (derrota forçada), cada PARAR fecha uma mão.
  for (let i = 0; i < stands; i += 1) {
    const stand = page.getByTestId('action-stand');
    await stand.click({ timeout: 45_000 });
    // O botão segue em cena por um beat após a ação (a carta final
    // assenta antes de a mesa virar): esperar ele SAIR garante que o
    // próximo clique é da rodada seguinte, não um repique nesta.
    await expect(stand).toBeHidden({ timeout: 15_000 });
  }
  // Duas rodadas (distribuição + vezes + veredito) + o beat entre elas.
  await expect(page.getByTestId('result-title')).toBeVisible({ timeout: 90_000 });
  // No resultado a câmera volta para a dealer reagir.
  await expect(page.getByTestId('table-scene')).toHaveAttribute('data-camera', 'front');
}

test('primeira jogada: tutorial, negociação e o natural decisivo paga 3:2', async ({ page }) => {
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
  // Melhor de 3 com vitória forçada (naturais): a série fecha 2 a 0 na
  // 2ª rodada, sem nenhuma interação.
  await expect(page.getByTestId('result-title')).toHaveText(/VITÓRIA/, { timeout: 90_000 });
  await expect(page.getByTestId('series-dots')).toHaveAttribute('data-score', '2-0');

  // O natural decisivo paga 3:2: 50 de stake → +75 de ganho líquido.
  await expect(page.getByTestId('balance')).toContainText('1.075');
  // ...e a dealer comemora a vitória do jogador.
  await expect(page.getByTestId('dealer')).toHaveAttribute('data-reaction', 'celebrate');
});

test('derrota: o jogador para com 20, o natural do rival leva, o stake se perde', async ({
  page,
}) => {
  await seedStorage(page);
  await page.goto('/');

  await page.getByTestId('play-button').click();
  await forceOutcome(page, 'lose');
  // Derrota forçada: o jogador recebe 20 e a vez dele abre — uma parada
  // por rodada (a série fecha 0 a 2 em duas rodadas).
  await playSeries(page, 25, 2);

  await expect(page.getByTestId('result-title')).toHaveText(/DERROTA/);
  await expect(page.getByTestId('series-dots')).toHaveAttribute('data-score', '0-2');
  await expect(page.getByTestId('balance')).toContainText('975');
});

test('empate re-distribui a rodada: nenhum círculo preenche e a série continua', async ({
  page,
}) => {
  await seedStorage(page);
  await page.goto('/');

  await page.getByTestId('play-button').click();
  await forceOutcome(page, 'tie');
  await forceCoinWinner(page, 'opponent');
  await forceNegoAutoAccept(page);
  await page.getByTestId('confirm-match').click({ timeout: 15_000 });
  await negotiateStake(page, 25);

  // A 1ª rodada empata (naturais dos dois lados): o beat de nova mão
  // entra em cena e o placar da série segue zerado — empate não
  // preenche círculo.
  await expect(page.getByTestId('round-verdict')).toHaveText(/EMPATE/, { timeout: 60_000 });
  await expect(page.getByTestId('series-dots')).toHaveAttribute('data-score', '0-0');

  // Destravada a força para VITÓRIA, o jogador fecha a série 2 a 0 nas
  // rodadas seguintes — e o natural decisivo paga 3:2 (25 → +37).
  await forceOutcome(page, 'win');
  await expect(page.getByTestId('result-title')).toHaveText(/VITÓRIA/, { timeout: 120_000 });
  await expect(page.getByTestId('balance')).toContainText('1.037');
});

test('persistência: saldo e histórico sobrevivem ao reload', async ({ page }) => {
  await seedStorage(page);
  await page.goto('/');

  await page.getByTestId('play-button').click();
  await forceOutcome(page, 'win');
  await playSeries(page, 50);
  await expect(page.getByTestId('balance')).toContainText('1.075');

  await page.reload();

  // De volta à Home com o saldo persistido.
  await expect(page.getByTestId('balance')).toContainText('1.075');
  await page.getByTestId('history-button').click();
  await expect(page.getByTestId('history-list').locator('li')).toHaveCount(1);
  await expect(page.getByTestId('history-list')).toContainText('+75');
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

test('cara-ou-coroa: vencendo o sorteio, o jogador escolhe a cor das cartas', async ({ page }) => {
  await seedStorage(page);
  await page.goto('/');

  await page.getByTestId('play-button').click();
  await forceOutcome(page, 'win');
  await forceCoinWinner(page, 'player');
  await forceNegoAutoAccept(page);

  await page.getByTestId('confirm-match').click({ timeout: 15_000 });
  await negotiateStake(page, 50);

  // Moeda no ar → veredito sozinho em cena → escolha das cartas
  // (intro + voo + resultado + veredito ≈ 7,7 s).
  await expect(page.getByTestId('coin-side')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('coin-winner')).toHaveText(/Você venceu o sorteio/, {
    timeout: 15_000,
  });
  await expect(page.getByTestId('coin-headline')).toHaveText(/Escolha suas cartas/, {
    timeout: 15_000,
  });

  // A escolha corre sob relógio — zerado, a mesa sorteia a cor sozinha.
  await expect(page.getByTestId('pick-countdown')).toContainText(/Escolha automática em \d+s/);

  // Confirmar só habilita depois de escolher um dos dois versos.
  const confirm = page.getByTestId('confirm-card-color');
  await expect(confirm).toBeDisabled();
  await page.getByTestId('card-color-vermelho').click();
  await confirm.click();

  // A troca vale pela partida inteira: o círculo da série preenchido
  // pela vitória do jogador usa o degradê VERMELHO escolhido — uma
  // âncora estável (o círculo persiste), ao contrário do rótulo do
  // beat, que vive só 1,1 s antes de a fase virar countdown.
  await expect(page.getByTestId('series-dot-1')).toHaveAttribute('style', /#f87171/, {
    timeout: 60_000,
  });

  // A série segue normalmente até o resultado com as cartas escolhidas
  // (duas rodadas com a vitória forçada).
  await expect(page.getByTestId('result-title')).toHaveText(/VITÓRIA/, { timeout: 90_000 });
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
