const creditFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

/** Formata créditos com separador de milhar pt-BR (ex.: 1.000). */
export function formatCredits(value: number): string {
  return creditFormatter.format(value);
}

/** Formata a variação de créditos com sinal explícito (ex.: +50 / −50). */
export function formatDelta(value: number): string {
  if (value > 0) return `+${creditFormatter.format(value)}`;
  if (value < 0) return `−${creditFormatter.format(Math.abs(value))}`;
  return '0';
}

/** Formata um timestamp para hora local curta (ex.: 14:32). */
export function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}
