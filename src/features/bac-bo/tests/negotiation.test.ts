import { describe, expect, it } from 'vitest';

import { MIN_STAKE } from '../engine/credits';
import { createBotNegotiator } from '../store/negotiation';

/** rng constante: alvo determinístico para as asserções. */
const flatRng = (value: number) => () => value;

describe('createBotNegotiator', () => {
  it('abre propondo o alvo quando ele está longe da aposta padrão', () => {
    const bot = createBotNegotiator(flatRng(0.5));
    // 0.08 + 0.5 × 0.32 = 24% de 500 = 120 — a 20 da mesa de 100.
    const amount = bot.opening({ balance: 500, tableStake: 100 });
    expect(amount).toBe(120);
    expect((amount ?? 0) % 10).toBe(0);
  });

  it('fica quieto quando a mesa já está perto do alvo dele', () => {
    const bot = createBotNegotiator(flatRng(0.5)); // alvo 120
    expect(bot.opening({ balance: 500, tableStake: 110 })).toBeNull();
  });

  it('nunca propõe acima do teto de 500 (nem do saldo do jogador)', () => {
    const rich = createBotNegotiator(flatRng(0.999));
    const amount = rich.opening({ balance: 5000, tableStake: 100 });
    expect(amount).toBe(500);

    // Saldo curto: o alvo desce junto — nada de lance impagável. O
    // shape é assertado ANTES do narrow: se o bot mudar e aceitar aqui,
    // o teste FALHA em vez de passar vazio sem checar o clamp.
    const humble = createBotNegotiator(flatRng(0.999));
    const reply = humble.respond(MIN_STAKE, { balance: 40, tableStake: 40 });
    expect(reply.action).toBe('decline');
    if (reply.action !== 'decline') return;
    expect(reply.counter).not.toBeNull();
    expect(reply.counter ?? 0).toBeLessThanOrEqual(40);
    expect(reply.counter ?? 0).toBeGreaterThanOrEqual(MIN_STAKE);
  });

  it('cobre lances no alvo ou acima', () => {
    const bot = createBotNegotiator(flatRng(0.5)); // alvo 120 com saldo 500
    expect(bot.respond(120, { balance: 500, tableStake: 100 })).toEqual({ action: 'accept' });

    const generous = createBotNegotiator(flatRng(0.5));
    expect(generous.respond(300, { balance: 500, tableStake: 100 })).toEqual({
      action: 'accept',
    });
  });

  it('recusa lances baixos com uma contraproposta no meio do caminho', () => {
    const bot = createBotNegotiator(flatRng(0.5)); // alvo 120
    const reply = bot.respond(20, { balance: 500, tableStake: 100 });
    expect(reply.action).toBe('decline');
    if (reply.action === 'decline') {
      expect(reply.counter).toBe(70); // (120 + 20) / 2
      expect((reply.counter ?? 0) % 10).toBe(0);
    }
  });

  it('cede a cada recusa e converge para o aceite — a mesa nunca trava', () => {
    const bot = createBotNegotiator(flatRng(0.5)); // alvo 120
    const context = { balance: 500, tableStake: 100 };

    // O jogador insiste no mínimo; o bot cede até cobrir.
    let reply = bot.respond(MIN_STAKE, context);
    let rounds = 0;
    while (reply.action === 'decline' && rounds < 10) {
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
    const reply = bot.respond(10, { balance: 150, tableStake: 100 });
    expect(reply).toEqual({ action: 'accept' });
  });
});
