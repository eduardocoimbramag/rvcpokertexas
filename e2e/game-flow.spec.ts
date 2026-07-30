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
 * blackjacks naturais, que decidem sozinhos — mas NÃO fecham a mão de
 * ninguém (um natural que saísse do rodízio denunciaria o 21). Em todos
 * os casos o jogador precisa PARAR (action-stand) uma vez para fechar a
 * própria mão; o desfecho forçado vale para quem para.
 * - 'win': o jogador recebe o natural e o rival, 20.
 * - 'lose': o rival recebe o natural e o jogador fica com 20.
 * - 'tie': os dois recebem naturais.
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
 * Atravessa a rodada de negociação propondo `stake` (bot em
 * auto-aceite). Não há botão de iniciar: o aceite fecha a mesa sozinho
 * — HORA DO DUELO → countdown — e a partida começa.
 */
async function negotiateStake(page: Page, stake: number) {
  // Matchmaking (1,2–2,6 s) → splash → confirmação dupla → negociação.
  await page.getByTestId('nego-input').fill(String(stake), { timeout: 15_000 });
  await page.getByTestId('nego-send').click();
  // O aceite fecha a mesa sozinho: HORA DO DUELO → countdown.
  await expect(page.getByTestId('countdown-value')).toBeVisible({ timeout: 15_000 });
}

/**
 * Joga a rodada inteira com o resultado forçado já ligado. Com 'win' e
 * 'tie' (naturais) ela resolve sozinha; com 'lose' o jogador precisa
 * PARAR uma vez — `stands` cobre os dois casos.
 */
async function playRound(page: Page, stake: number, stands = 1) {
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

  // Home → Tutorial (primeira visita, 4 passos) → busca por oponente.
  await page.getByTestId('play-button').click();
  await page.getByTestId('tutorial-next').click();
  await page.getByTestId('tutorial-next').click();
  await page.getByTestId('tutorial-next').click();
  await page.getByTestId('tutorial-next').click();

  await forceOutcome(page, 'win');
  await forceNegoAutoAccept(page);

  await page.getByTestId('confirm-match').click({ timeout: 15_000 });

  // Rodada de negociação sobre o próprio feltro; a crupiê apresenta a
  // mesa (docs/scenario.md §9.1) e o título de ouro carimba a abertura.
  await expect(page.getByTestId('negotiation-panel')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('dealer')).toHaveAttribute('data-reaction', 'present');
  await expect(page.getByTestId('nego-open-announce')).toHaveText(/rodada de negociação/i);

  // Proposta de 50: o balão do lance entra e o bot cobre — o aceite
  // fecha a mesa sozinho (não existe botão de iniciar).
  await page.getByTestId('nego-input').fill('50');
  await page.getByTestId('nego-send').click();
  await expect(page.getByTestId('nego-proposal')).toHaveAttribute('data-from', 'player');
  await expect(page.getByTestId('nego-proposal')).toHaveAttribute('data-status', 'accepted', {
    timeout: 15_000,
  });

  // A mesa passa a valer o acordo e a HORA DO DUELO abre a partida.
  await expect(page.getByTestId('nego-duel-announce')).toHaveText(/hora do duelo/i, {
    timeout: 10_000,
  });

  // O natural não fecha a mão: a vez abre normal, com relógio e botões —
  // é isso que impede o 21 de denunciar a si mesmo.
  await expect(page.getByTestId('turn-clock')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('action-stand').click();

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

test('negociação: sair da mesa não debita nada e volta ao menu', async ({ page }) => {
  await seedStorage(page);
  await page.goto('/');

  await page.getByTestId('play-button').click();
  await page.getByTestId('confirm-match').click({ timeout: 15_000 });

  // A rodada abre com a aposta padrão de 100 já nas fichas da mesa.
  await expect(page.getByTestId('negotiation-panel')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('nego-table-stake')).toContainText('100', { timeout: 10_000 });

  // Sair da mesa abandona a rodada sem debitar nada.
  await page.getByTestId('nego-quit').click();
  await expect(page.getByTestId('play-button')).toBeVisible();
  await expect(page.getByTestId('balance')).toContainText('1.000');
});

test('negociação: a contraproposta do bot pode ser coberta e vira a mesa', async ({ page }) => {
  await seedStorage(page);
  await page.goto('/');

  await page.getByTestId('play-button').click();
  await page.getByTestId('confirm-match').click({ timeout: 15_000 });

  // Lance mínimo (10): com saldo de 1.000 o alvo do bot é sempre maior,
  // então a resposta é garantidamente uma RECUSA com contraproposta —
  // que chega como um balão dele, com o ✓ e o ✗ na sua mão.
  await page.getByTestId('nego-input').fill('10', { timeout: 15_000 });
  await page.getByTestId('nego-send').click();
  await expect(page.getByTestId('nego-accept')).toBeVisible({ timeout: 15_000 });

  // Cobrir fecha a mesa no valor dele e o duelo abre sozinho.
  await page.getByTestId('nego-accept').click();
  await expect(page.getByTestId('nego-duel-announce')).toHaveText(/hora do duelo/i, {
    timeout: 10_000,
  });
  await expect(page.getByTestId('countdown-value')).toBeVisible({ timeout: 10_000 });
});

/**
 * Lê o anel de foco de quem está focado AGORA. `outlineStyle: 'none'`
 * denuncia um controle que ficou de fora do bloco compartilhado.
 */
async function focusRing(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const style = getComputedStyle(el);
    return {
      who: el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 24) ?? el.tagName,
      tag: el.tagName,
      width: Number.parseFloat(style.outlineWidth),
      style: style.outlineStyle,
    };
  });
}

/**
 * Dá `steps` Tabs e cobra o anel de cada controle que receber o foco.
 * Devolve quem foi conferido — o chamador exige um mínimo, senão um
 * Tab que não sai do lugar faria o teste passar sem testar nada.
 */
async function tabThrough(page: Page, steps: number) {
  const checked: string[] = [];
  for (let i = 0; i < steps; i += 1) {
    await page.keyboard.press('Tab');
    const ring = await focusRing(page);
    if (!ring) continue;
    if (ring.tag !== 'BUTTON' && ring.tag !== 'INPUT') continue;
    expect(ring, `sem anel de foco: ${ring.who}`).toMatchObject({ style: 'solid' });
    expect(ring.width, `anel fino demais em ${ring.who}`).toBeGreaterThanOrEqual(2);
    checked.push(ring.who);
  }
  return checked;
}

test('foco de teclado: todo controle acende o anel âmbar', async ({ page }) => {
  await seedStorage(page);
  await page.goto('/');
  await expect(page.getByTestId('play-button')).toBeVisible();

  // Sem clicar em nada antes: o Tab estabelece a modalidade de teclado,
  // que é o gatilho de `:focus-visible`. Um clique antes deixaria o
  // navegador na modalidade de ponteiro e o anel não acenderia — o teste
  // passaria a medir a heurística do Chromium, não o nosso CSS.
  const homeChecked = await tabThrough(page, 6);
  // Guarda contra o pior desfecho de um teste como este: passar sem ter
  // visitado nada. A Home tem ajustes, jogar, torneio e histórico.
  expect(homeChecked.length, `visitou só ${homeChecked.join(', ')}`).toBeGreaterThanOrEqual(4);

  // A folha de ajustes carrega os controles que mais ficaram de fora: o
  // × redondo de fechar, os toggles e o segmentado de cenário.
  await page.getByRole('button', { name: 'Ajustes' }).click();
  await expect(page.getByRole('dialog', { name: 'Ajustes' })).toBeVisible();

  const sheetChecked = await tabThrough(page, 8);
  expect(sheetChecked.length, `visitou só ${sheetChecked.join(', ')}`).toBeGreaterThanOrEqual(4);
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
