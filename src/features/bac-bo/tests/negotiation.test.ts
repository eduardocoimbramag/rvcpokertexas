import { describe, expect, it } from 'vitest';

import { MIN_STAKE } from '../engine/credits';
import { createBotNegotiator } from '../store/negotiation';

/** rng constante: alvo determinístico para as asserções. */
const flatRng = (value: number) => () => value;

describe('createBotNegotiator', () => {
  it('abre com um alvo proporcional ao saldo, em dezenas e dentro do teto', () => {
    const bot = createBotNegotiator(flatRng(0.5));
    const { amount } = bot.opening({ balance: 500 });

    // 0.08 + 0.5 × 0.32 = 24% de 500 = 120.
    expect(amount).toBe(120);
    expect(amount % 10).toBe(0);
    expect(amount).toBeGreaterThanOrEqual(MIN_STAKE);
    expect(amount).toBeLessThanOrEqual(500);
  });

  it('nunca propõe acima do saldo do jogador (nem abaixo do mínimo)', () => {
    const rich = createBotNegotiator(flatRng(0.999));
    expect(rich.opening({ balance: 5000 }).amount).toBeLessThanOrEqual(500);

    const humble = createBotNegotiator(flatRng(0.999));
    const { amount } = humble.opening({ balance: 15 });
    expect(amount).toBeGreaterThanOrEqual(MIN_STAKE);
    expect(amount).toBeLessThanOrEqual(15);
  });

  it('aceita lances no alvo ou acima', () => {
    const bot = createBotNegotiator(flatRng(0.5)); // alvo 120 com saldo 500
    expect(bot.respond(120, { balance: 500 })).toMatchObject({ action: 'accept' });

    const generous = createBotNegotiator(flatRng(0.5));
    expect(generous.respond(300, { balance: 500 })).toMatchObject({ action: 'accept' });
  });

  it('contrapropõe no meio do caminho para lances baixos', () => {
    const bot = createBotNegotiator(flatRng(0.5)); // alvo 120
    const reply = bot.respond(20, { balance: 500 });
    expect(reply.action).toBe('counter');
    if (reply.action === 'counter') {
      expect(reply.amount).toBe(70); // (120 + 20) / 2
      expect(reply.amount % 10).toBe(0);
    }
  });

  it('cede a cada rodada e converge para o aceite — a mesa nunca trava', () => {
    const bot = createBotNegotiator(flatRng(0.5)); // alvo 120
    const context = { balance: 500 };

    // O jogador insiste no mínimo; o bot cede até fechar.
    let reply = bot.respond(MIN_STAKE, context);
    let rounds = 0;
    while (reply.action === 'counter' && rounds < 10) {
      rounds += 1;
      reply = bot.respond(MIN_STAKE, context);
    }
    expect(reply.action).toBe('accept');
    expect(rounds).toBeLessThanOrEqual(4);
  });

  it('contraproposta igual ao lance vira aceite (sem eco de valor)', () => {
    // Alvo mínimo: saldo baixo força alvo = lance possível.
    const bot = createBotNegotiator(flatRng(0));
    // alvo com rng 0 → 8% de 150 = 12 → arredonda para 10 = MIN_STAKE.
    const reply = bot.respond(10, { balance: 150 });
    expect(reply.action).toBe('accept');
  });
});
