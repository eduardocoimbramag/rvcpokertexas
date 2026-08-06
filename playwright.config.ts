import { defineConfig, devices } from '@playwright/test';

/**
 * E2E mobile-first: roda contra o build de preview em viewport de celular,
 * com o DevTools habilitado para permitir resultados determinísticos.
 */
export default defineConfig({
  testDir: './e2e',
  /* O fluxo completo é dramático de propósito e uma mão inteira leva
     tempo real: negociação (~20s de relógio, ou o aceite) + acordo
     selado 1,2s + apresentação 3,4s + HORA DO DUELO 2,4s + countdown
     4,5s + distribuição 2,8s, e daí as QUATRO RUAS do Hold'em, cada
     uma com o beat do lance do rival (~1,3s), a espera dele (0,9–2,6s)
     e a rua abrindo (~1,9s) — mais o showdown (1,5s de virada + 1,8s
     de embate). Uma mão que vá até o river passa dos 60s com folga
     curta. */
  timeout: 120_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  /* Uma retentativa TAMBÉM fora do CI. A razão não é esconder teste
     ruim: é que esta suíte dirige uma interface de tempo real — há um
     relógio de 20s por decisão e beats de animação em segundos — com
     três navegadores disputando a mesma máquina. Sob contenção, um
     clique que normalmente custa 200ms custa segundos, e a vez passa
     no meio da bateria de asserções. O teste falha por ter demorado,
     não por ter encontrado um defeito, e o sintoma é justamente o que
     denuncia isso: quem falha muda de rodada para rodada. */
  retries: process.env.CI ? 2 : 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      VITE_ENABLE_DEVTOOLS: 'true',
    },
  },
});
