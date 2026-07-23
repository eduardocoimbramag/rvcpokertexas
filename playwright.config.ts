import { defineConfig, devices } from '@playwright/test';

/**
 * E2E mobile-first: roda contra o build de preview em viewport de celular,
 * com o DevTools habilitado para permitir resultados determinísticos.
 */
export default defineConfig({
  testDir: './e2e',
  /* O fluxo completo é dramático de propósito (splash ~3,4s + lock-in
     1,6s + cara-ou-coroa ~10s, já com o beat do veredito + countdown
     4,5s + rolagem 2s + revelação ~5,9s): uma rodada inteira passa dos
     30s padrão. */
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
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
