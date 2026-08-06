import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

/**
 * E2E do fluxo de jogo em viewport mobile.
 * O DevTools (habilitado no build de preview do Playwright) força os
 * resultados para tornar as verificações determinísticas.
 *
 * A MESA É UMA SESSÃO: os stacks sobrevivem de uma mão para a seguinte e
 * a mesa só fecha quando alguém fica sem fichas para a entrada ou quando
 * o jogador se levanta. Por isso os testes param em dois lugares
 * diferentes: `callDownToHandover` fecha UMA MÃO (é lá que a placa do
 * vencedor entra) e `cashOut` fecha a MESA (é lá que o extrato aparece).
 *
 * COMO O FORÇAR FUNCIONA na mão de Texas Hold'em: a engine empilha o
 * baralho com as fechadas dos dois lados e as cinco da mesa, garantindo
 * o desfecho do SHOWDOWN — nunca o caminho até ele. Quem desiste é quem
 * joga, então os testes de desfecho vão até o fim pagando tudo: quem só
 * paga e passa nunca põe o rival diante de uma aposta, e por isso o
 * rival nunca tem o que desistir.
 *
 * O QUE NÃO SE VERIFICA AQUI é o VALOR exato do saldo no fim. Quanto
 * entra no pote depende do que o rival aposta, e ele aposta com a mão
 * dele e um dado — como qualquer jogador. O que é determinístico é o
 * DESFECHO e a DIREÇÃO do saldo, e é isso que os testes cobram.
 */

/** Estado persistido com tutorial já visto e sons desligados. */
const SEEDED_STATE = {
  version: 3,
  state: {
    balance: 1000,
    history: [],
    settings: {
      audio: { muted: true, musicVolume: 0.4, sfxVolume: 0.8 },
      vibrationEnabled: false,
      tutorialSeen: true,
      scenery: 'high',
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
 * O saldo da pílula do topo, como número.
 *
 * Lê o RÓTULO ACESSÍVEL, não o texto: dentro da pílula convive a ficha
 * animada da variação ("+48"), e um `textContent` colaria os dois
 * números num só — "1.000" com "+48" vira 100048, que passa em
 * `toBeGreaterThan` e reprova em `toBeLessThan` sem dizer por quê.
 */
/**
 * O STACK do jogador, lido da plaquinha do assento.
 *
 * Não há pílula de saldo na mesa: o buy-in já saiu do saldo quando ele
 * sentou, e o que está em jogo está desenhado no feltro. Quem responde
 * por quanto ele tem AGORA é o assento.
 */
async function stack(page: Page): Promise<number> {
  const texto = (await page.getByTestId('stack-player').textContent()) ?? '';
  return Number(texto.replace(/\D/g, ''));
}

async function saldo(page: Page): Promise<number> {
  const rotulo = (await page.getByTestId('balance').getAttribute('aria-label')) ?? '';
  return Number(rotulo.replace(/\D/g, ''));
}

/**
 * Confirma o duelo e espera a mesa abrir sozinha. Não há mais nada a
 * combinar: a entrada é fixa e o stack saiu do saldo no ato da busca —
 * confirmado, a cena segue sem intervenção (apresentação do rival →
 * HORA DO DUELO → countdown, ~7 s no total, daí o timeout largo).
 */
async function confirmAndSit(page: Page) {
  await page.getByTestId('confirm-match').click({ timeout: 15_000 });
  await expect(page.getByTestId('countdown-value')).toBeVisible({ timeout: 25_000 });
}

/**
 * PAGA TUDO O QUE VIER até o veredito entrar em cena — a linha mais
 * passiva possível. Nunca aposta e nunca desiste, o que garante chegar
 * ao showdown: quem só paga jamais põe o rival diante de uma aposta, e
 * um rival que não tem o que pagar não tem o que jogar fora.
 *
 * O laço corre contra um PRAZO, não contra um número de voltas, e a
 * diferença já custou um teste: quantas voltas uma mão pede depende dos
 * beats da mesa (o anúncio do lance, o rival pensando, a rua abrindo), e
 * um teto de voltas estourava no meio da mão. Aí o laço soltava o
 * controle, ninguém mais decidia nada — e os 20 s do relógio jogavam a
 * mão fora por inatividade, com o teste cobrando um showdown que ele
 * mesmo tinha deixado de alcançar.
 */
async function callDownToHandover(page: Page) {
  const placa = page.getByTestId('winner-plate');
  const balao = page.getByTestId('show-prompt');
  const prazo = Date.now() + 90_000;
  while (Date.now() < prazo) {
    if ((await placa.count()) > 0 || (await balao.count()) > 0) break;
    const pagar = page.getByTestId('action-call');
    const passar = page.getByTestId('action-check');
    // O botão pode sair de cena entre a leitura e o clique (a mesa anda
    // sozinha): um clique perdido aqui é normal, e a volta seguinte
    // reencontra a barra.
    if ((await pagar.count()) > 0) await pagar.click({ timeout: 5_000 }).catch(() => undefined);
    else if ((await passar.count()) > 0)
      await passar.click({ timeout: 5_000 }).catch(() => undefined);
    else await page.waitForTimeout(400);
  }
  // O rival pode ter corrido: aí quem entra é o convite de mostrar a mão,
  // e guardar as cartas devolve a placa do vencedor.
  if ((await balao.count()) > 0) await page.getByTestId('show-cards-no').click();
  await expect(placa).toBeVisible({ timeout: 30_000 });
}

/**
 * Levanta da mesa e espera o CAIXA da sessão.
 *
 * A porta de saída só existe entre as mãos, e a mesa distribui de novo
 * sozinha: se este beat passar, o laço espera a mão seguinte fechar e
 * tenta na próxima janela. É o que um jogador faria.
 */
async function cashOut(page: Page) {
  const sair = page.getByTestId('leave-table');
  const prazo = Date.now() + 60_000;
  while (Date.now() < prazo) {
    if ((await page.getByTestId('result-title').count()) > 0) break;
    /* A porta fica em cena o tempo todo e APAGADA na primeira mão: só
       clicar quando ela abriu. No meio de uma mão levantar corre a mão
       junto, e é um caminho legítimo para o caixa. */
    if ((await sair.count()) > 0 && (await sair.isEnabled())) {
      await sair.click({ timeout: 3_000 }).catch(() => undefined);
      await page.waitForTimeout(400);
      continue;
    }
    const pagar = page.getByTestId('action-call');
    const passar = page.getByTestId('action-check');
    if ((await pagar.count()) > 0) await pagar.click({ timeout: 3_000 }).catch(() => undefined);
    else if ((await passar.count()) > 0)
      await passar.click({ timeout: 3_000 }).catch(() => undefined);
    else await page.waitForTimeout(300);
  }
  await expect(page.getByTestId('result-title')).toBeVisible({ timeout: 20_000 });
}

/** Joga a mão inteira com o desfecho forçado já ligado. */
async function playHand(page: Page) {
  await confirmAndSit(page);
  // Câmera vertical: só o feltro em quadro enquanto a mão corre.
  await expect(page.getByTestId('table-scene')).toHaveAttribute('data-camera', 'overhead', {
    timeout: 20_000,
  });
  await callDownToHandover(page);
  // Entre as mãos a câmera SEGUE de cima: a mesa não acabou, e a placa do
  // vencedor entra sobre o feltro.
  await expect(page.getByTestId('table-scene')).toHaveAttribute('data-camera', 'overhead');
}

test('da Home à mesa: o duelo abre sem nada a combinar', async ({ page }) => {
  await seedStorage(page);
  await page.goto('/');

  // A marca é desenhada letra a letra em dois andares (POKER / ARENA),
  // então quem responde por ela é o NOME ACESSÍVEL do título.
  await expect(page.getByRole('heading', { name: 'Poker Arena' })).toBeVisible();

  await forceOutcome(page, 'win');
  // JOGAR leva à MESA, e a nada mais: o tutorial não intercepta ninguém.
  await page.getByTestId('play-button').click();
  await expect(page.getByRole('dialog', { name: 'Como jogar' })).toHaveCount(0);

  await page.getByTestId('confirm-match').click({ timeout: 15_000 });

  // Confirmado o duelo, a cena corta direto para a APRESENTAÇÃO do
  // rival — é aqui que ele deixa de ser "Oponente".
  await expect(page.getByText('Partida confirmada')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/^Oponente$/i)).toHaveCount(0);
  await expect(page.getByTestId('duel-announce')).toHaveText(/hora do duelo/i, {
    timeout: 15_000,
  });

  // A MESA ABRE NO PRÉ-FLOP, com a ENTRADA fixa dos dois lados e os
  // cinco lugares da mesa vazios à espera do flop.
  await expect(page.getByTestId('street-announce')).toHaveText(/pré-flop/i, { timeout: 40_000 });
  await expect(page.getByTestId('board-slot-1')).toHaveClass(/board__slot--empty/);
  await expect(page.getByTestId('board-slot-5')).toHaveClass(/board__slot--empty/);

  // OS MONTANTES: as fichas de cada um em cima do pano, ao lado da mão.
  await expect(page.getByTestId('chip-rack-player')).toBeVisible();
  await expect(page.getByTestId('chip-rack-opponent')).toBeVisible();

  await callDownToHandover(page);

  // A MÃO fecha na placa do vencedor — não numa tela de vitória. A mesa
  // segue de pé, e o par de Ases é o que a mão empilhada garante.
  await expect(page.getByTestId('winner-plate')).toHaveClass(/winner-plate--player/);
  await expect(page.getByTestId('winner-hand')).toContainText(/par/i);
  /* E as cartas que decidiram, abertas ao lado do nome da mão: um par
     são DUAS, não a mão de cinco. Os outros três kickers estão na mão
     porque a mão de poker tem cinco cartas, e não porque decidiram
     alguma coisa. */
  await expect(page.getByTestId('winner-cards').locator('> *')).toHaveCount(2);
  // O stack subiu: o pote virou ficha na frente do jogador.
  expect(await stack(page), 'ganhar a mão engorda o stack').toBeGreaterThan(1000);

  // A MESA fecha no CAIXA, e é lá que o saldo se mexe.
  await cashOut(page);
  await expect(page.getByTestId('result-title')).toHaveText(/LUCROU/);
  await expect(page.getByTestId('table-scene')).toHaveAttribute('data-camera', 'front');
  await expect(page.getByTestId('dealer')).toHaveAttribute('data-reaction', 'celebrate');
});

test('o COMO JOGAR abre sob demanda e ensina Texas Hold’em', async ({ page }) => {
  await seedStorage(page);
  await page.goto('/');

  await page.getByRole('button', { name: /como jogar/i }).click();
  await expect(page.getByRole('dialog', { name: 'Como jogar' })).toBeVisible();
  await expect(page.getByText(/Texas Hold/i)).toBeVisible();
  // Nada de 21 sobrou: o jogo mudou, a folha mudou com ele.
  await expect(page.getByText(/blackjack/i)).toHaveCount(0);
});

test('a leitura da mão está em cena desde as fechadas, antes de qualquer flop', async ({
  page,
}) => {
  await seedStorage(page);
  await page.goto('/');

  await page.getByTestId('play-button').click();
  await forceOutcome(page, 'win');
  await confirmAndSit(page);

  // Pré-flop: os cinco lugares da mesa estão vazios e a placa JÁ diz o
  // que você tem. A decisão do pré-flop é a mais tomada do Hold'em, e é
  // exatamente onde a leitura não pode calar.
  await expect(page.getByTestId('street-announce')).toHaveText(/pré-flop/i, { timeout: 40_000 });
  await expect(page.getByTestId('board-slot-1')).toHaveClass(/board__slot--empty/);
  // A mão empilhada garante o par de Ases ao jogador.
  await expect(page.getByTestId('hand-reading')).toHaveText(/Ases/i);
});

test('a aposta se digita: campo, +10 e +100 no padrão da casa', async ({ page }) => {
  // O teste atravessa uma mão inteira até a primeira palavra do jogador
  // (busca, confirmação, distribuição) antes de mexer no painel: sob
  // três workers isso passa do orçamento padrão.
  test.slow();
  await seedStorage(page);
  await page.goto('/');

  await page.getByTestId('play-button').click();
  await confirmAndSit(page);

  await expect(page.getByTestId('bet-controls')).toBeVisible({ timeout: 45_000 });
  await page.getByTestId('action-raise').click();

  /* O QUE ESTE TESTE CONFERE, E POR QUÊ SÓ ISTO.
     A partir do momento em que a palavra chega ao jogador, os 20 s do
     relógio da mesa correm de verdade — e sob três workers cada ida ao
     navegador custa mais de um segundo. Um teste que ficasse aqui
     digitando e conferindo perderia a vez no meio da própria bateria de
     asserções, e falharia por ter demorado, não por estar errado.
     Então ele confere aqui a única coisa que EXIGE uma mão de verdade:
     que o painel de aumento abre sobre uma mesa viva com um campo
     digitável e VAZIO, com os limites daquela rua em cena e os atalhos
     de +10/+100 da casa à mão.
     A aritmética do campo, a recusa de valor fora dos limites e o VOLTAR
     são regras da PEÇA, não da mesa, e estão cobertos no teste de
     componente da PokerArena — onde nenhum relógio corre. */
  const campo = page.getByTestId('raise-input');
  await expect(campo).toBeVisible();
  await expect(page.getByTestId('raise-plus-10')).toBeVisible();
  await expect(page.getByTestId('raise-plus-100')).toBeVisible();
  /* O campo abre VAZIO: um valor já preenchido responderia a pergunta no
     lugar de quem joga, e quem só queria ver os limites sairia tendo
     apostado o que a casa escolheu. */
  await expect(campo).toHaveValue('');
  await expect(page.getByTestId('raise-confirm')).toBeDisabled();
  // E os limites da rua estão escritos, que é o que o campo vazio pede.
  const minimo = Number(
    (await page.getByTestId('raise-hint').textContent())?.split('–')[0]?.replace(/\D/g, '') ?? '0',
  );
  expect(minimo).toBeGreaterThan(0);

  // Um toque em +100 já dá um lance legal e libera o envio.
  await page.getByTestId('raise-plus-100').click();
  await page.getByTestId('raise-plus-100').click();
  await expect(campo).toHaveValue('200');
});

test('a desistência também abre as duas mãos: é onde o blefe aparece', async ({ page }) => {
  test.slow();
  await seedStorage(page);
  await page.goto('/');

  await page.getByTestId('play-button').click();
  // Rival com Ases: ele aposta, e a palavra volta com algo a pagar.
  await forceOutcome(page, 'lose');
  await confirmAndSit(page);

  /* CORRER está na mesa desde a primeira palavra — passou a estar quando
     o duelo virou sessão. A entrada desta mão já está no meio, e largá-la
     é abrir mão de 100 fichas para guardar as outras. */
  const desistir = page.getByTestId('action-fold');
  await expect(desistir).toBeVisible({ timeout: 60_000 });
  await desistir.click({ timeout: 5_000 });

  /* O EMBATE roda mesmo sem showdown, e é aqui que ele mais serve: ver
     que o rival tinha Ases (ou que blefava com nada) é a única leitura
     que este duelo dá dele. Numa sala de verdade quem desiste mucha;
     aqui as cartas abrem, porque a mão já acabou e mostrá-las não conta
     nada a ninguém. */
  await expect(page.getByTestId('showdown-clash')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('clash-player')).toContainText(/desistiu/i);
  await expect(page.getByTestId('clash-opponent')).toContainText(/par/i);
  // E as fechadas dele estão abertas na mesa.
  await expect(page.getByRole('img', { name: /Carta de .*1: A de/ })).toBeVisible();

  // O placar é do rival, e a nota diz que foi você quem largou.
  await expect(page.getByTestId('winner-plate')).toHaveClass(/winner-plate--opponent/, {
    timeout: 30_000,
  });
  await expect(page.getByTestId('winner-note')).toContainText(/você desistiu/i);

  /* E a MESA CONTINUA: correr custou a entrada, não a sessão. É a porta
     de saída que a sessão trouxe — e ela só abre da segunda mão em
     diante. */
  await expect(page.getByTestId('leave-table')).toBeVisible({ timeout: 10_000 });
});

test('o showdown encena o embate, e só a mão vencedora fica', async ({ page }) => {
  await seedStorage(page);
  await page.goto('/');

  await page.getByTestId('play-button').click();
  await forceOutcome(page, 'win');
  await playHand(page);

  // O embate roda ANTES da placa e some com ela: quando o veredito da mão
  // entra, a encenação já cumpriu o papel dela.
  await expect(page.getByTestId('showdown-clash')).toHaveCount(0);
  // E o que sobra na tela é UMA placa, com a mão que levou o pote.
  await expect(page.getByTestId('winner-plate')).toHaveCount(1);
  await expect(page.getByTestId('winner-hand')).toContainText(/par/i);
});

test('a barra nunca oferece um lance ilegal, rua após rua', async ({ page }) => {
  // Atravessa a mão INTEIRA parando em toda decisão, e cada rua agora
  // custa também o beat do letreiro: sob três workers isso passa do
  // orçamento padrão.
  test.slow();
  await seedStorage(page);
  await page.goto('/');

  await page.getByTestId('play-button').click();
  await forceOutcome(page, 'lose');
  await confirmAndSit(page);
  await expect(page.getByTestId('board')).toBeVisible({ timeout: 40_000 });

  /* A REGRA DA MESA, conferida em toda decisão que a mão oferecer:
     DESISTIR e PASSAR são mutuamente exclusivos, e a razão é de jogo, não
     de layout — jogar a mão fora podendo seguir de GRAÇA não é um lance
     que mesa nenhuma aceite, e passar com aposta na frente também não.
     Quem decide o que é legal é a engine; a barra só desenha o que ela
     permite, e é isso que este teste cobra a cada rua.
     O número de decisões varia (o botão é sorteado, o rival aposta com a
     mão dele), então o laço acompanha a mão em vez de contar passos. */
  let decisoes = 0;
  // A MÃO fecha na placa do vencedor: a mesa segue de pé depois dela.
  const veredito = page.getByTestId('winner-plate');
  const prazo = Date.now() + 90_000;
  while (Date.now() < prazo && (await veredito.count()) === 0) {
    const pagar = page.getByTestId('action-call');
    const passar = page.getByTestId('action-check');
    const desistir = page.getByTestId('action-fold');

    if ((await passar.count()) > 0) {
      /* Nada a pagar: PASSAR e CORRER convivem — largar a mão custa a
         entrada que já está no meio, e numa sessão isso é decisão. */
      await expect(desistir, 'faltou CORRER sem aposta na frente').toHaveCount(1);
      await expect(pagar, 'PAGAR apareceu sem nada a pagar').toHaveCount(0);
      decisoes += 1;
      await passar.click({ timeout: 5_000 }).catch(() => undefined);
    } else if ((await pagar.count()) > 0) {
      // Com aposta na frente as três saídas existem, e PASSAR não é uma.
      await expect(desistir, 'faltou CORRER com aposta na frente').toHaveCount(1);
      await expect(page.getByTestId('action-raise')).toHaveCount(1);
      decisoes += 1;
      await pagar.click({ timeout: 5_000 }).catch(() => undefined);
    } else {
      await page.waitForTimeout(600);
    }
  }

  await expect(veredito).toBeVisible({ timeout: 45_000 });
  expect(decisoes, 'a mão passou sem oferecer uma decisão sequer').toBeGreaterThan(0);
});

test('persistência: saldo e histórico sobrevivem ao reload', async ({ page }) => {
  // A sessão tem uma mão inteira mais o intervalo antes de o caixa abrir.
  test.slow();
  await seedStorage(page);
  await page.goto('/');

  await page.getByTestId('play-button').click();
  await forceOutcome(page, 'win');
  await playHand(page);
  // O saldo só se mexe no CAIXA: dentro da sessão as fichas ficam no
  // feltro, como em qualquer sala.
  await cashOut(page);
  const ganho = await saldo(page);
  expect(ganho).toBeGreaterThan(1000);

  await page.reload();

  // De volta à Home com o MESMO saldo — até o último crédito.
  await expect(page.getByTestId('play-button')).toBeVisible();
  expect(await saldo(page)).toBe(ganho);
  await page.getByTestId('history-button').click();
  await expect(page.getByTestId('history-list').locator('li')).toHaveCount(1);
  // O extrato conta a MÃO que decidiu o pote, não um total.
  await expect(page.getByTestId('history-list')).toContainText(/Ases/i);
});

test('a mesa abre com a ENTRADA fixa, sem nada a combinar', async ({ page }) => {
  await seedStorage(page);
  await page.goto('/');

  await page.getByTestId('play-button').click();
  await confirmAndSit(page);

  /* A rodada de negociação não existe mais, e este teste guarda a
     ausência dela: entre confirmar e sentar não há tela nenhuma pedindo
     valor. O que a mesa cobra é fixo, e o stack saiu do saldo no ato da
     busca. */
  await expect(page.getByTestId('ante-note')).toContainText('100', { timeout: 20_000 });
  await expect(page.getByTestId('ante-note')).toContainText('1.000');

  // A entrada dos DOIS já está no pote antes de qualquer decisão.
  await expect(page.getByTestId('pot-value')).toContainText('200', { timeout: 30_000 });
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
 * Geometria do CENTRO da mesa: o pote e as cinco comunitárias dividem a
 * faixa entre os dois assentos, e essa faixa é o recurso mais escasso da
 * tela — num aparelho de 640px ela é o que sobra depois de duas mãos
 * fechadas e da barra de apostas. Nada disso se verifica lendo CSS: só
 * medindo no navegador.
 */
async function medirCentro(page: Page) {
  return page.evaluate(() => {
    const caixa = (s: string) => {
      const el = document.querySelector(s);
      return el ? el.getBoundingClientRect() : null;
    };
    const pote = document.querySelector('[data-testid="pot"]');
    const mesa = document.querySelector('[data-testid="board"]');
    if (!pote || !mesa) throw new Error('sem pote ou mesa no feltro');
    const p = pote.getBoundingClientRect();
    const m = mesa.getBoundingClientRect();
    const rival = caixa('[data-testid="hand-opponent"]');
    const voce = caixa('[data-testid="hand-player"]');
    const centro = document.elementFromPoint(p.left + p.width / 2, p.top + p.height / 2);
    return {
      fichas: document.querySelectorAll('[data-testid="pot"] .rvc-chip').length,
      // As cinco comunitárias têm de caber DEITADAS: elas nunca se
      // sobrepõem, então a fileira é o gargalo de largura da mesa.
      mesaLargura: Math.round(m.width),
      mesaDentroDaTela: m.left >= 0 && m.right <= window.innerWidth,
      folgaAcima: rival ? Math.round(p.top - rival.bottom) : -1,
      folgaAbaixo: voce ? Math.round(voce.top - m.bottom) : -1,
      // O pote é cenário: um toque no meio dele atravessa.
      atravessaOToque: !pote.contains(centro),
    };
  });
}

test('o centro da mesa cabe no feltro e não rouba toque', async ({ page }) => {
  await seedStorage(page);
  await page.goto('/');
  await page.getByTestId('play-button').click();
  await confirmAndSit(page);
  await expect(page.getByTestId('board')).toBeVisible({ timeout: 40_000 });
  await page.waitForTimeout(800);

  const alto = await medirCentro(page);
  expect(alto.fichas, 'os blinds põem fichas na mesa desde o pré-flop').toBeGreaterThan(0);
  expect(alto.atravessaOToque, 'o pote é cenário, não controle').toBe(true);
  expect(alto.mesaDentroDaTela, 'as cinco comunitárias vazaram da tela').toBe(true);
  expect(alto.folgaAcima, 'o pote encostou na mão do rival').toBeGreaterThan(0);
  expect(alto.folgaAbaixo, 'a mesa encostou na sua mão').toBeGreaterThan(0);

  // O caso que aperta: viewport de 640px, o mais baixo que a casa
  // suporta. A carta encolhe junto (o termo em dvh do clamp) e o centro
  // continua sem encostar em mão nenhuma.
  await page.setViewportSize({ width: 412, height: 640 });
  await page.waitForTimeout(400);
  const baixo = await medirCentro(page);
  expect(baixo.mesaDentroDaTela, 'as comunitárias vazaram na tela baixa').toBe(true);
  expect(baixo.folgaAcima, 'o pote encostou na mão do rival na tela baixa').toBeGreaterThan(0);
  expect(baixo.folgaAbaixo, 'a mesa encostou na sua mão na tela baixa').toBeGreaterThan(0);
});

test('alvo de toque: os atalhos +10/+100 respondem além do próprio selo', async ({ page }) => {
  await seedStorage(page);
  await page.goto('/');
  await page.getByTestId('play-button').click();
  await confirmAndSit(page);
  await expect(page.getByTestId('bet-controls')).toBeVisible({ timeout: 45_000 });
  await page.getByTestId('action-raise').click();

  // Um toque errado aqui MUDA O VALOR DA APOSTA. O selo continua do
  // tamanho que era; quem cresceu foi a área tocável (um `::after`
  // esticado), e pseudo-elemento só se mede perguntando ao navegador
  // quem recebe o toque em cada ponto.
  const probe = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="raise-plus-10"]');
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
