import { z } from 'zod';

/**
 * Configuração da aplicação lida das variáveis de ambiente do Vite.
 * Valores inválidos caem nos defaults — a aplicação nunca quebra por env mal formada.
 */
const envSchema = z.object({
  /** Saldo inicial de créditos virtuais para novos jogadores. */
  initialBalance: z.coerce.number().int().min(1).max(1_000_000).catch(1000),
  /** Habilita o painel de DevTools (forçar resultados, limpar estado). */
  devToolsEnabled: z
    .string()
    .optional()
    .transform((value) => value === 'true')
    .catch(false),
});

export type AppEnv = Readonly<z.infer<typeof envSchema>>;

function parseEnv(): AppEnv {
  return envSchema.parse({
    initialBalance: import.meta.env.VITE_INITIAL_BALANCE ?? 1000,
    devToolsEnabled: import.meta.env.VITE_ENABLE_DEVTOOLS,
  });
}

export const appEnv: AppEnv = parseEnv();
