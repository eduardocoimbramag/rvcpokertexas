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

  // A vez do jogador abre com a REGRA DE POV em cena, dos DOIS lados: a
  // última carta do rival está virada para baixo e o total dele é só o
  // que está aberto (um número limpo, sem "+?"); a última das SUAS leva o
  // selo do olho cortado, porque ele também não a vê.
  await expect(page.getByTestId('action-stand')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('img', { name: /carta oculta/ })).toBeVisible();
  const opponentTotal = page.getByTestId('opponent-total');
  await expect(opponentTotal).toHaveAttribute('data-partial', 'true');
  await expect(opponentTotal).not.toContainText('+?');
  await expect(page.getByTestId('card-veil')).toBeVisible();

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

/**
 * Geometria do pote no feltro: ele mora na faixa livre ENTRE as duas
 * mãos, e essa faixa é o recurso mais escasso da tela — mede 92px de
 * altura num aparelho de 640px. Nada disso se verifica lendo CSS: só
 * medindo no navegador, com a aposta mais alta que o pote comporta.
 */
async function medirPote(page: Page) {
  return page.evaluate(() => {
    const caixa = (s: string) => {
      const el = document.querySelector(s);
      return el ? el.getBoundingClientRect() : null;
    };
    const pote = document.querySelector('[data-testid="felt-pot"]');
    if (!pote) throw new Error('sem pote no feltro');
    const p = pote.getBoundingClientRect();
    const rival = caixa('[data-testid="hand-opponent"]');
    const voce = caixa('[data-testid="hand-player"]');
    const centro = document.elementFromPoint(p.left + p.width / 2, p.top + p.height / 2);
    return {
      fichas: document.querySelectorAll('[data-testid="felt-pot"] .chip').length,
      largura: Math.round(p.width),
      altura: Math.round(p.height),
      folgaAcima: rival ? Math.round(p.top - rival.bottom) : -1,
      folgaAbaixo: voce ? Math.round(voce.top - p.bottom) : -1,
      dentroDaTela: p.left >= 0 && p.right <= window.innerWidth,
      // O pote é cenário: um toque no meio dele atravessa.
      atravessaOToque: !pote.contains(centro),
    };
  });
}

test('o pote de fichas cabe na faixa livre e não rouba toque', async ({ page }) => {
  await seedStorage(page);
  await page.goto('/');
  await page.getByTestId('play-button').click();
  await forceNegoAutoAccept(page);
  await page.getByTestId('confirm-match').click({ timeout: 15_000 });
  // 400 créditos são 16 fichas — o monte mais largo que se vê jogando.
  await negotiateStake(page, 400);
  await expect(page.getByTestId('turn-clock')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(600);

  const alto = await medirPote(page);
  expect(alto.fichas, 'aposta de 400 põe 16 fichas na mesa').toBe(16);
  expect(alto.atravessaOToque, 'o pote é cenário, não controle').toBe(true);
  expect(alto.dentroDaTela).toBe(true);
  expect(alto.folgaAcima, 'o pote encostou na mão do rival').toBeGreaterThan(0);
  expect(alto.folgaAbaixo, 'o pote encostou na sua mão').toBeGreaterThan(0);

  // O caso que aperta: viewport de 640px, onde a faixa livre cai para
  // ~92px. O pote encolhe junto (o termo em dvh do clamp) e continua
  // sem encostar em carta nenhuma.
  await page.setViewportSize({ width: 412, height: 640 });
  await page.waitForTimeout(400);
  const baixo = await medirPote(page);
  expect(baixo.fichas, 'a contagem NÃO muda com o aparelho').toBe(16);
  expect(baixo.altura, 'o pote tem de caber nos 92px da faixa').toBeLessThan(70);
  expect(baixo.folgaAcima, 'o pote encostou na mão do rival na tela baixa').toBeGreaterThan(0);
  expect(baixo.folgaAbaixo, 'o pote encostou na sua mão na tela baixa').toBeGreaterThan(0);
});

test('alvo de toque: os atalhos +10/+100 respondem além do próprio selo', async ({ page }) => {
  await seedStorage(page);
  await page.goto('/');
  await page.getByTestId('play-button').click();
  await page.getByTestId('confirm-match').click({ timeout: 15_000 });
  await expect(page.getByTestId('negotiation-panel')).toBeVisible({ timeout: 15_000 });

  // Um toque errado aqui MUDA O VALOR DA APOSTA. O selo continua do
  // tamanho que era; quem cresceu foi a área tocável (um `::after`
  // esticado), e pseudo-elemento só se mede perguntando ao navegador
  // quem recebe o toque em cada ponto.
  const probe = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="nego-plus-10"]');
    if (!el) throw new Error('sem atalho de +10');
    const r = el.getBoundingClientRect();
    const hits = (x: number, y: number) => {
      const target = document.elementFromPoint(x, y);
      return target != null && (target === el || el.contains(target));
    };
    return {
      selo: { w: Math.round(r.width), h: Math.round(r.height) },
      acima: hits(r.left + r.width / 2, r.top - 3),
      abaixo: hits(r.left + r.width / 2, r.bottom + 3),
      // O vão entre os dois atalhos continua separando as áreas: o
      // toque no meio do vão não pode cair em nenhum dos dois.
      alvo: Math.round(r.height) + 8,
    };
  });

  expect(probe.acima, 'o toque acima do atalho devia acertá-lo').toBe(true);
  expect(probe.abaixo, 'o toque abaixo do atalho devia acertá-lo').toBe(true);
  expect(probe.alvo, 'o alvo somado tem de chegar aos 44px').toBeGreaterThanOrEqual(44);
});

test('o sonar da busca está de fato emitindo, não parado numa pose', async ({ page }) => {
  await seedStorage(page);
  await page.goto('/');
  await page.getByTestId('play-button').click();
  await expect(page.locator('.sonar')).toBeVisible();

  /* Uma animação MORTA não quebra teste nenhum: o elemento existe, a
     classe está lá, a tela parece certa num print. Este teste é o único
     jeito de saber que ela roda — amostra o estado computado duas vezes
     e cobra que tenha MUDADO. Já pegou um bug real: a opacidade dos
     anéis apagando em 0,3 s e nunca mais voltando, porque um
     `transition.opacity` parcial SUBSTITUI o de fora em vez de
     completá-lo — a escala rodava sozinha com a tinta apagada. */
  const amostrar = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('.sonar__ping')].map((el) => {
        const cs = getComputedStyle(el);
        return {
          opacidade: Number(cs.opacity),
          escala: new DOMMatrixReadOnly(cs.transform).a,
        };
      }),
    );

  const antes = await amostrar();
  await page.waitForTimeout(450);
  const depois = await amostrar();

  expect(antes.length, 'o sonar tem de emitir mais de um anel').toBeGreaterThan(1);

  // Em algum dos dois instantes tem de haver anel ACESO e ABERTO. O
  // piso é baixo de propósito: a emissão é discreta por decisão de
  // design, e o que este teste guarda é que ela EXISTE.
  const aceso = [...antes, ...depois].some((anel) => anel.opacidade > 0.1 && anel.escala > 0.5);
  expect(aceso, 'nenhum anel aceso: a emissão do sonar está muda').toBe(true);
  // E a emissão avança: o anel mais aberto do primeiro instante cresceu.
  const maior = (a: { escala: number }[]) => Math.max(...a.map((x) => x.escala));
  expect(maior(depois), 'os anéis não se abriram').toBeGreaterThan(maior(antes));
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
