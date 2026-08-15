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

const dayFormatter = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long' });
const datedDayFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/**
 * O DIA de um instante, do jeito que se fala dele: "Hoje", "Ontem",
 * "12 de agosto" — e com o ano só quando ele não é este.
 *
 * A régua é o CALENDÁRIO e não o relógio: 23h59 e 0h01 são dias
 * diferentes ainda que separados por dois minutos, e uma conta feita em
 * horas ("faz menos de 24h") chamaria de "hoje" uma mesa de ontem à
 * noite.
 *
 * `now` entra por parâmetro porque um rótulo relativo que lê o relógio
 * por dentro muda de resposta à meia-noite e não tem como ser testado.
 */
export function formatDay(timestamp: number, now = Date.now()): string {
  const date = new Date(timestamp);
  const today = new Date(now);
  const dias = Math.round((startOfDay(today) - startOfDay(date)) / 86_400_000);

  if (dias === 0) return 'Hoje';
  if (dias === 1) return 'Ontem';
  const formatter = date.getFullYear() === today.getFullYear() ? dayFormatter : datedDayFormatter;
  return formatter.format(date);
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}
