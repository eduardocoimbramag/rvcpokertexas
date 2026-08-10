import { expect, test } from '@playwright/test';

import { TOURNAMENT_ENABLED } from '../src/features/bac-bo/tournament/availability.js';

/**
 * A MESA DE CASH DE 6 — do lobby até estar sentado.
 *
 * O que só este teste alcança: a escolha da cadeira acontece contra o
 * relógio (os outros vão sentando por conta própria) e dentro de uma tela
 * estreita. Teste de unidade cobre a regra; nenhum deles cobre "cabe no
 * aparelho" nem "o botão responde enquanto os outros ocupam".
 */

test.skip(!TOURNAMENT_ENABLED, 'modo torneio desligado');

const SEEDED_STATE = {
  version: 3,
  state: {
    balance: 10000,
    history: [],
    settings: {
      audio: { muted: true, musicVolume: 0.4, sfxVolume: 0.8 },
      vibrationEnabled: false,
      tutorialSeen: true,
      scenery: 'high',
    },
  },
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript((state) => {
    if (window.localStorage.getItem('bacbo-arena:state') === null) {
      window.localStorage.setItem('bacbo-arena:state', JSON.stringify(state));
    }
  }, SEEDED_STATE);
});

test('a vitrine anuncia a economia das mesas de cash', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('tournament-button').click();
  await expect(page.getByTestId('public-lobbies')).toBeVisible({ timeout: 15_000 });

  /* Os dois valores que o dono da sala definiu na criação. Sem eles, a
     lista pediria para entrar às cegas numa mesa com dinheiro dentro. */
  const stakes = page.locator('[data-testid^="lobby-stakes-"]');
  expect(await stakes.count()).toBeGreaterThan(0);
  await expect(stakes.first()).toContainText(/Compra/);
  await expect(stakes.first()).toContainText(/Blind/);
});

test('a folha de criação abre no cash com mesa aberta/fechada, compra e blind', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('tournament-button').click();
  await page.getByTestId('create-room').click();

  /* NÃO HÁ MAIS ESCOLHA DE FORMATO: a folha é de poker, e o que ela
     pergunta é quantas pessoas sentam. */
  await expect(page.getByTestId('create-format-cash')).toHaveCount(0);
  await expect(page.getByTestId('create-mode-open')).toBeVisible();
  await expect(page.getByTestId('create-mode-closed')).toBeVisible();
  await expect(page.getByTestId('create-buyin')).toHaveValue('1000');
  await expect(page.getByTestId('create-blind')).toHaveValue('20');
  await expect(page.getByTestId('create-depth')).toHaveText(/50 blinds/);
  /* Cash não tem taxa nem premiação: o dinheiro da mesa é a compra, e
     ele volta em fichas — não em prêmio no fim. */
  await expect(page.getByTestId('create-fee')).toHaveCount(0);
  await expect(page.getByTestId('create-prize')).toHaveCount(0);

  /* A LINHA DE PARTICIPANTES no lugar da de formato: só há um jogo nesta
     casa, e o que muda de sala para sala é o tamanho da mesa. */
  for (const n of [3, 4, 5, 6]) {
    await expect(page.getByTestId(`create-size-${n}`)).toBeVisible();
  }
  await expect(page.getByTestId('create-size-6')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('create-seats-hint')).toContainText('seis lugares');
  await page.setViewportSize({ width: 412, height: 839 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test-results/criar-sala.png' });

  // A mesa curta muda a promessa da folha.
  await page.getByTestId('create-size-3').click();
  await expect(page.getByTestId('create-seats-hint')).toContainText('Mesa curta');
});

for (const vp of [
  { name: '320', width: 320, height: 568 },
  { name: '412', width: 412, height: 839 },
]) {
  test(`as seis cadeiras vazias cabem e respondem @${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');
    await page.getByTestId('tournament-button').click();
    await expect(page.getByTestId('public-lobbies')).toBeVisible({ timeout: 15_000 });

    await page.getByTestId('create-room').click();
    await page.getByTestId('create-name').fill('Mesa Do Teste');
    await page.getByTestId('create-confirm').click();

    // A sala enche sozinha; o START só acende com todos prontos.
    const start = page.getByTestId('start-tournament');
    await expect(start).toBeEnabled({ timeout: 60_000 });
    await start.click();

    // Seis cadeiras, todas vazias, e o aviso que desarma a corrida.
    await expect(page.getByTestId('seating-screen')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-testid^="seat-claim-"]')).toHaveCount(6);
    await expect(page.getByTestId('seating-rule')).toContainText('sorteado depois');
    await expect(page.getByTestId('seating-stakes')).toContainText('Compra');

    // Senta na 4: a cadeira mostra ícone e nome, e o botão vira "Trocar".
    await page.getByTestId('seat-claim-3').click();
    await expect(page.getByTestId('seat-name-3')).toHaveText('Você');
    await expect(page.getByTestId('seat-release')).toBeVisible();
    await expect(page.getByTestId('seating-lead')).toContainText('Você está na mesa');

    // Os outros terminam de encher a mesa sem tomar o seu lugar.
    await expect(page.locator('[data-testid^="seat-name-"]')).toHaveCount(6, {
      timeout: 30_000,
    });
    await expect(page.getByTestId('seat-name-3')).toHaveText('Você');

    // Nada de rolagem lateral: a fileira cabe na tela mais estreita.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test(`a mesa de 6 monta com fichas, blinds e board @${vp.name}`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');
    await page.getByTestId('tournament-button').click();
    await expect(page.getByTestId('public-lobbies')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('create-room').click();
    await page.getByTestId('create-name').fill('Mesa Do Teste');
    await page.getByTestId('create-confirm').click();
    const start = page.getByTestId('start-tournament');
    await expect(start).toBeEnabled({ timeout: 60_000 });
    await start.click();
    await page.getByTestId('seat-claim-3').click();

    // Cheia a mesa, o feltro abre sozinho.
    await expect(page.getByTestId('cash-screen')).toBeVisible({ timeout: 45_000 });

    // Cinco rivais em cima, você embaixo — o POV é fixo.
    await expect(page.locator('[data-testid^="cash-seat-"]')).toHaveCount(6);
    await expect(page.getByTestId('cash-seat-you')).toBeVisible();

    // Cada um com as suas fichas, e o disco do dealer em UMA cadeira só.
    await expect(page.locator('[data-testid^="cash-stack-"]')).toHaveCount(6);
    await expect(page.getByTestId('cash-dealer-button')).toHaveCount(1);

    /* O CABEÇALHO é o nome da sala, e só: a ficha técnica (compra,
       blinds, número da mão) saiu da faixa mais nobre da tela e mora na
       ficha da sala, a um toque. */
    await expect(page.getByTestId('cash-room-name')).toHaveText('Mesa Do Teste');
    await expect(page.getByTestId('cash-stakes')).toHaveCount(0);

    /* Dois blinds no feltro, e mais nenhum: numa mesa de 3 ou mais o
       botão não paga nada. */
    await expect(page.locator('[data-testid^="cash-bet-"]')).toHaveCount(2);

    // As cinco casas da mesa existem desde o primeiro instante, vazias.
    await expect(page.locator('[data-testid^="board-slot-"]')).toHaveCount(5);
    /* O pote é a MESMA pilha de fichas do duelo, com a placa da casa.
       O piso é a soma dos dois blinds; daí para cima depende de quem já
       falou — a mesa anda enquanto o teste olha. */
    const pote = Number((await page.getByTestId('cash-pot-value').textContent()) ?? '0');
    expect(pote).toBeGreaterThanOrEqual(30);

    // Só as SUAS cartas têm face.
    await expect(page.getByTestId('cash-hole-you')).toBeVisible();
    /* A ABERTURA DA MÃO tem o compasso do duelo: letreiro (1,5 s), foco
       voltando (0,42 s) e a distribuição das doze cartas (2,75 s). */
    await page.waitForTimeout(5200);
    await page.screenshot({ path: `test-results/f2-mesa-${vp.name}.png` });

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    // Levantar devolve as fichas e fecha a mesa.
    await page.getByTestId('cash-leave').click();
    await expect(page.getByTestId('cash-leave-prompt')).toBeVisible();
    await page.screenshot({ path: `test-results/f2-levantar-${vp.name}.png` });
    await page.getByTestId('cash-leave-confirm').click();
    await expect(page.getByTestId('tournament-button')).toBeVisible({ timeout: 10_000 });
  });

  /* MAIS TEMPO QUE O TETO GLOBAL, e de propósito.
     A mesa de 6 tem o compasso do duelo: letreiro de rua (1,5 s), foco
     voltando (0,42 s), distribuição de doze cartas (2,75 s) e a janela em
     que cada rival pensa (0,9–2,6 s, sorteada). Com seis assentos e
     quatro ruas, uma mão inteira passa dos 120 s do `playwright.config`.
     O limite explícito declara a conta em vez de deixar a suíte piscando
     vermelho por tempo e não por defeito. */
  test(`o desfecho anuncia quem levou e com o quê @${vp.name}`, async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');
    await page.getByTestId('tournament-button').click();
    await expect(page.getByTestId('public-lobbies')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('create-room').click();
    await page.getByTestId('create-name').fill('Mesa Do Teste');
    await page.getByTestId('create-confirm').click();
    const start = page.getByTestId('start-tournament');
    await expect(start).toBeEnabled({ timeout: 60_000 });
    await start.click();
    await page.getByTestId('seat-claim-3').click();
    await expect(page.getByTestId('cash-screen')).toBeVisible({ timeout: 45_000 });

    /* CORRER na primeira palavra é o caminho mais curto até o fim da
       mão: a mesa resolve entre os outros e anuncia o desfecho. */
    const correr = page.getByTestId('cash-fold');
    await expect(correr).toBeVisible({ timeout: 120_000 });
    await correr.click();

    /* A PLACA DO DESFECHO ocupa o lugar da barra de lances — com a mão
       fechada não há lance a fazer, e o lugar sob o polegar passa a ser
       o da notícia. */
    await expect(page.getByTestId('cash-verdict')).toBeVisible({ timeout: 180_000 });
    await expect(page.getByTestId('cash-verdict-delta')).toBeVisible();
    await expect(page.getByTestId('cash-verdict-who')).not.toBeEmpty();
    await page.screenshot({ path: `test-results/f4-desfecho-${vp.name}.png` });
  });

  test(`a mesa JOGA: a vez chega, o lance sai, a mão fecha @${vp.name}`, async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');
    await page.getByTestId('tournament-button').click();
    await expect(page.getByTestId('public-lobbies')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('create-room').click();
    await page.getByTestId('create-name').fill('Mesa Do Teste');
    await page.getByTestId('create-confirm').click();
    const start = page.getByTestId('start-tournament');
    await expect(start).toBeEnabled({ timeout: 60_000 });
    await start.click();
    await page.getByTestId('seat-claim-3').click();
    await expect(page.getByTestId('cash-screen')).toBeVisible({ timeout: 45_000 });

    /* A VEZ CHEGA. Antes dela a barra não existe — os cinco rivais falam
       primeiro, um a um, com respiro entre eles. */
    const barra = page.getByTestId('cash-actions');
    await expect(barra).toBeVisible({ timeout: 120_000 });
    await expect(page.getByTestId('cash-fold')).toBeVisible();

    /* O RELÓGIO DA VEZ, com a barra — a mesma peça do duelo. Sem ele,
       pensar não custa nada e a mesa fica parada para sempre. */
    await expect(page.getByTestId('turn-clock')).toBeVisible();

    /* A SAÍDA fica em cena desde a primeira mão, e APAGADA: quem senta
       descobre a porta antes de precisar dela, e descobre também que ela
       só abre na segunda. */
    await expect(page.getByTestId('leave-table')).toBeVisible();

    await page.screenshot({ path: `test-results/f4-sua-vez-${vp.name}.png` });

    /* JOGA A MÃO INTEIRA, barato: paga quando há o que pagar, passa
       quando não há. O que se prova aqui não é estratégia — é que a mesa
       ANDA: a vez volta, o lance é aceito, a rua fecha e a mão seguinte
       começa. É o caminho que nenhum teste de unidade alcança, porque
       ele depende dos timers dos bots. */
    const desfecho = page.getByTestId('cash-verdict');
    for (let lance = 0; lance < 80; lance += 1) {
      if (await desfecho.isVisible().catch(() => false)) break;
      const pagar = page.getByTestId('cash-pay');
      const passar = page.getByTestId('cash-check');
      if (await pagar.isVisible().catch(() => false)) {
        await pagar.click();
      } else if (await passar.isVisible().catch(() => false)) {
        await passar.click();
      } else {
        await page.waitForTimeout(700);
      }
    }

    /* A MÃO FECHOU: a placa do desfecho é o sinal.
       Era o contador de mãos do cabeçalho, e ele saiu de cena com a linha
       de ficha técnica — a mesa passou a dizer que anda pelo que
       acontece nela, não por um número no topo. */
    await expect(desfecho).toBeVisible({ timeout: 240_000 });
    await page.screenshot({ path: `test-results/f4-desfecho-jogo-${vp.name}.png` });

    /* E A SEGUINTE COMEÇOU: a barra volta, prova de que a mesa não trava
       nem numa rua sem quem fale, nem no fim da mão. */
    await expect(barra).toBeVisible({ timeout: 240_000 });

    /* Na segunda mão a SAÍDA já abriu: quem senta joga ao menos uma. */
    await expect(page.getByTestId('leave-table')).toBeEnabled();

    // Nada de rolagem lateral com a barra em cena.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

/* =====================================================================
   AS QUATRO MESAS: 3, 4, 5 e 6 lugares.

   A folha de criação deixou de perguntar o formato — só há poker — e
   passou a perguntar quantas pessoas sentam. O número não é decoração:
   ele decide quantas cadeiras a corrida disputa, como os rivais se
   dividem nas faixas do feltro (3 lugares → 2 rivais numa faixa; 6 →
   3+2 em duas) e quem paga blind.
   ===================================================================== */

for (const lugares of [3, 4, 5, 6] as const) {
  test(`mesa de ${lugares}: a sala nasce, enche e senta`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 412, height: 839 });
    await page.goto('/');
    await page.getByTestId('tournament-button').click();
    await expect(page.getByTestId('public-lobbies')).toBeVisible({ timeout: 15_000 });

    await page.getByTestId('create-room').click();
    // A régua vai de 3 a 6, e não há mais escolha de formato.
    for (const n of [3, 4, 5, 6]) {
      await expect(page.getByTestId(`create-size-${n}`)).toBeVisible();
    }
    await expect(page.getByTestId('create-format-bracket')).toHaveCount(0);
    await expect(page.getByTestId('create-format-table')).toHaveCount(0);

    await page.getByTestId(`create-size-${lugares}`).click();
    await page.getByTestId('create-name').fill(`Mesa de ${lugares}`);
    await page.getByTestId('create-confirm').click();

    // A sala anuncia o tamanho que foi escolhido.
    await page.getByTestId('lobby-settings').click();
    await expect(page.getByTestId('settings-size')).toContainText(`${lugares} jogadores`);
    await page.keyboard.press('Escape');

    const start = page.getByTestId('start-tournament');
    await expect(start).toBeEnabled({ timeout: 90_000 });
    await start.click();

    // TANTAS CADEIRAS QUANTO A SALA PEDIU — nem seis fixas.
    await expect(page.getByTestId('seating-screen')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-testid^="seat-claim-"]')).toHaveCount(lugares);

    await page.getByTestId('seat-claim-0').click();
    await expect(page.getByTestId('seat-name-0')).toHaveText('Você');

    // O feltro monta com o mesmo número de assentos.
    await expect(page.getByTestId('cash-screen')).toBeVisible({ timeout: 90_000 });
    await expect(page.locator('[data-testid^="cash-seat-"]')).toHaveCount(lugares);
    await expect(page.getByTestId('cash-dealer-button')).toHaveCount(1);

    /* DOIS BLINDS, sempre — mesmo numa mesa de três. É o anel: paga quem
       senta à esquerda do botão e o seguinte. */
    await expect(page.locator('[data-testid^="cash-bet-"]')).toHaveCount(2);

    await page.waitForTimeout(5200);
    await page.screenshot({ path: `test-results/mesa-${lugares}.png` });

    // Nada de rolagem lateral em nenhum tamanho.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test('a sala privada guarda a senha, e a ficha guarda o tamanho', async ({ page }) => {
  /* Portado de `tournament-flow.spec.ts`, que ficou suspenso com o
     chaveamento: a senha e a ficha técnica valem para QUALQUER sala, e
     agora toda sala é uma mesa de poker. */
  test.setTimeout(120_000);
  await page.goto('/');
  await page.getByTestId('tournament-button').click();
  await page.getByTestId('create-room').click();

  await page.getByTestId('create-visibility-private').click();
  await page.getByTestId('create-name').fill('Mesa do Teste');
  await page.getByTestId('create-password').fill('4821');
  await page.getByTestId('create-size-5').click();
  await page.getByTestId('create-confirm').click();

  // O cabeçalho traz SÓ o nome — visibilidade, código e senha são ficha
  // técnica.
  await expect(page.getByRole('heading', { name: 'Mesa do Teste' })).toBeVisible();
  await expect(page.getByTestId('lobby-visibility')).toHaveCount(0);

  await page.getByTestId('lobby-settings').click();
  await expect(page.getByTestId('settings-code')).toContainText('Privada');
  await expect(page.getByTestId('settings-size')).toContainText('5 jogadores');
  await expect(page.getByTestId('settings-password')).toContainText('4821');
  // A ficha da MESA diz o tamanho por extenso, e não um formato.
  await expect(page.getByTestId('settings-format')).toContainText('Mesa de 5');
});

test('o × de expulsar responde além do próprio selo', async ({ page }) => {
  /* Portado de `tournament-flow.spec.ts`. O × tem 20px de selo — abaixo
     dos 44px recomendados —, e a área TOCÁVEL é maior que o desenho (um
     `::after` esticado). Pseudo-elemento não se mede: quem responde
     "quem recebe este toque?" é o `elementFromPoint`. */
  test.setTimeout(120_000);
  await page.goto('/');
  await page.getByTestId('tournament-button').click();
  await page.getByTestId('create-room').click();
  await page.getByTestId('create-size-4').click();
  await page.getByTestId('create-confirm').click();

  // Basta o primeiro bot sentar para o × aparecer.
  const kick = page.locator('[data-testid^="seat-kick-"]').first();
  await expect(kick).toBeVisible({ timeout: 60_000 });

  const probe = await page.evaluate(() => {
    const el = document.querySelector('[data-testid^="seat-kick-"]');
    if (!el) throw new Error('sem botão de expulsar');
    const r = el.getBoundingClientRect();
    const hits = (x: number, y: number) => {
      const target = document.elementFromPoint(x, y);
      return (
        target != null &&
        (target === el ||
          el.contains(target) ||
          target.closest('[data-testid^="seat-kick-"]') === el)
      );
    };
    return {
      selo: { w: Math.round(r.width), h: Math.round(r.height) },
      abaixo: hits(r.left + r.width / 2, r.bottom + 12),
      aEsquerda: hits(r.left - 14, r.top + r.height / 2),
      longeAEsquerda: hits(r.left - 30, r.top + r.height / 2),
    };
  });

  expect(probe.selo.w).toBeLessThanOrEqual(22);
  expect(probe.abaixo, 'o toque logo abaixo do × devia acertá-lo').toBe(true);
  expect(probe.aEsquerda, 'o toque à esquerda do × devia acertá-lo').toBe(true);
  expect(probe.longeAEsquerda, 'o alvo não pode se esticar sem limite').toBe(false);
});
