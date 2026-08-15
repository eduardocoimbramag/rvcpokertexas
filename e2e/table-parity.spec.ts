import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

import { TOURNAMENT_ENABLED } from '../src/features/poker/tournament/availability.js';

/**
 * AS DUAS MESAS SÃO A MESMA MESA.
 *
 * O duelo 1v1 e a mesa de cash de 6 desenham o mesmo cenário — o feltro
 * visto de cima, com o trilho de mogno em volta (`OverheadTableLayer`).
 * Ele NÃO se posiciona sozinho: `.scene-clip` estende o recorte em
 * −1.5rem de cada lado e −1rem embaixo, compensando o `px-6 py-4` do
 * `<main>` que o hospeda, e o cabeçalho da tela precisa ficar FORA da
 * cena para ela começar na altura certa.
 *
 * Quando a mesa de 6 nasceu, ela errava as três coisas ao mesmo tempo: o
 * `<main>` não tinha padding (o trilho saía do quadro pelos lados), o
 * cabeçalho ficava dentro da cena (o trilho saía por cima) e um véu
 * decorativo com `inset: -8% -12%` transbordava a tela e ROLAVA a página
 * 12 px — o que jogava o trilho da esquerda para fora sozinho.
 *
 * Nenhum desses três aparece num teste de comportamento: a mesa jogava
 * perfeitamente, só não parecia uma mesa. Este teste mede a geometria da
 * cena nas DUAS telas e exige que elas coincidam. É barato, e é o único
 * jeito de uma terceira mesa não repetir a mesma sequência de erros.
 */

test.skip(!TOURNAMENT_ENABLED, 'modo torneio desligado');

const SEEDED_STATE = {
  version: 4,
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

interface Caixa {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Geometria {
  appShell: Caixa | null;
  sceneStage: Caixa | null;
  sceneClip: Caixa | null;
  overhead: Caixa | null;
  overflowX: number;
}

/** A geometria da CENA — o que decide onde o trilho de mogno cai. */
async function geometria(page: Page): Promise<Geometria> {
  return page.evaluate(() => {
    const box = (sel: string) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
      };
    };
    return {
      appShell: box('.app-shell'),
      sceneStage: box('.scene-stage'),
      sceneClip: box('.scene-clip'),
      overhead: box('.scene-table-overhead'),
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 839 });
  await page.addInitScript((state) => {
    window.localStorage.setItem('bacbo-arena:state', JSON.stringify(state));
  }, SEEDED_STATE);
});

/** Abre o duelo 1v1 e espera a mesa. */
async function abreDuelo(page: Page) {
  await page.goto('/');
  await page.getByTestId('play-button').click();
  await page.getByTestId('confirm-match').click({ timeout: 30_000 });
  await expect(page.getByTestId('hand-player')).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(3000);
}

/** Abre a mesa de cash de 6 e espera o feltro. */
async function abreMesaDeSeis(page: Page) {
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
  await page.waitForTimeout(3000);
}

test('a mesa de 6 tem a MESMA geometria de cena do duelo 1v1', async ({ page }) => {
  await abreDuelo(page);
  const duelo = await geometria(page);

  await abreMesaDeSeis(page);
  const seis = await geometria(page);

  // Todas as quatro peças existem nas duas telas.
  for (const [nome, g] of [
    ['duelo', duelo],
    ['mesa de 6', seis],
  ] as const) {
    expect(g.appShell, `${nome}: app-shell`).not.toBeNull();
    expect(g.sceneStage, `${nome}: scene-stage`).not.toBeNull();
    expect(g.sceneClip, `${nome}: scene-clip`).not.toBeNull();
    expect(g.overhead, `${nome}: mesa vista de cima`).not.toBeNull();
  }

  /* NADA TRANSBORDA. Um transbordo horizontal ROLA a página, e a página
     rolada tira o trilho de um dos lados do quadro — foi assim que o véu
     decorativo da mesa de 6 comeu a moldura da esquerda. */
  expect(duelo.overflowX, 'duelo não transborda').toBeLessThanOrEqual(0);
  expect(seis.overflowX, 'mesa de 6 não transborda').toBeLessThanOrEqual(0);

  // A casca começa na borda da tela nas duas — nenhuma está deslocada.
  expect(seis.appShell?.x).toBe(duelo.appShell?.x);

  /* A CENA COMEÇA NA MESMA LINHA. É o que garante que o trilho de mogno
     caia no mesmo lugar: o recorte sobe 5rem a partir daqui. */
  expect(seis.sceneStage?.x, 'a cena começa na mesma coluna').toBe(duelo.sceneStage?.x);
  expect(seis.sceneStage?.w, 'a cena tem a mesma largura').toBe(duelo.sceneStage?.w);
  expect(seis.sceneStage?.y, 'a cena começa na mesma altura').toBe(duelo.sceneStage?.y);

  // E o recorte do feltro, que é o que desenha a moldura.
  expect(seis.sceneClip?.x).toBe(duelo.sceneClip?.x);
  expect(seis.sceneClip?.w).toBe(duelo.sceneClip?.w);
  expect(seis.sceneClip?.y).toBe(duelo.sceneClip?.y);

  /* O TRILHO CABE NO QUADRO. A camada da mesa é 4% mais larga que o
     recorte (`inset: 0 -2%`) e o trilho ocupa 24 de 400 unidades do SVG
     (6%) — sobra mogno visível dos dois lados. Se a camada saísse muito
     da tela, o trilho sairia junto. */
  const largura = seis.overhead?.w ?? 0;
  const esquerda = seis.overhead?.x ?? 0;
  const direita = esquerda + largura;
  expect(esquerda, 'a mesa não sai demais pela esquerda').toBeGreaterThan(-largura * 0.06);
  expect(direita, 'a mesa não sai demais pela direita').toBeLessThan(412 + largura * 0.06);
});
