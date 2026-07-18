/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Saldo inicial de créditos virtuais (string numérica). */
  readonly VITE_INITIAL_BALANCE?: string;
  /** Habilita o painel de DevTools quando igual a "true". */
  readonly VITE_ENABLE_DEVTOOLS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
