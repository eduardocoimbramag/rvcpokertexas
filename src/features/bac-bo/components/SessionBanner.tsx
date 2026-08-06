import { motion, useReducedMotion } from 'framer-motion';

import { Button } from '@/shared/components/Button';
import { Icon } from '@/shared/components/Icon';
import { formatCredits } from '@/shared/lib/format';

import { HOUSE_EDGE, cashOutValue, isBroke } from '../engine/credits';
import type { PokerSession } from '../engine/poker/types';
import { useGameStore } from '../store/gameStore';
import { Confetti } from './Confetti';
import { ResultStage } from './ResultStage';

export interface SessionBannerProps {
  session: PokerSession;
  opponentName: string;
}

/**
 * O CAIXA DA SESSÃO — o que você levou da mesa, e não quem ganhou a
 * última mão.
 *
 * Aqui morava a tela de VITÓRIA/DERROTA, e ela parou de fazer sentido no
 * dia em que a mesa virou sessão. Um veredito de mão única é uma notícia:
 * uma carta decidiu e a tela grita. Numa sessão de quinze mãos, a última
 * não é o assunto — perder a última mão depois de subir 2.000 fichas não
 * é uma derrota, e a tela que dissesse isso estaria mentindo sobre a
 * noite inteira.
 *
 * O que substitui o veredito é o BALANÇO: com quanto se sentou, com
 * quanto se levantou, e a diferença entre os dois. É a única pergunta que
 * uma sessão responde.
 *
 * O TOM SEGUE O BALANÇO, e é assimétrico de propósito. Quem sai no lucro
 * leva a festa inteira que a casa tem — o ouro, o confete, a plateia de
 * pé. Quem sai no prejuízo recebe um agradecimento, e nada mais: não há
 * rubi quebrado nem "DERROTA" em caixa alta. Perder fichas já é a notícia
 * ruim; carimbá-la seria cobrar duas vezes pela mesma coisa.
 */
export function SessionBanner({ session, opponentName }: SessionBannerProps) {
  const playAgain = useGameStore((state) => state.playAgain);
  const goHome = useGameStore((state) => state.goHome);
  const balance = useGameStore((state) => state.balance);
  const refillCredits = useGameStore((state) => state.refillCredits);
  const reducedMotion = useReducedMotion() ?? false;

  const finalStack = session.stacks.player;
  const profit = finalStack - session.buyIn;
  const won = profit > 0;
  /* O que entra no saldo: o buy-in inteiro mais o lucro já descontada a
     comissão da casa. Quem sai no prejuízo leva o que sobrou, sem
     desconto nenhum — a casa não cobra de quem já pagou. */
  const cashed = cashOutValue(session.buyIn, finalStack);
  const commission = won ? session.buyIn + profit - cashed : 0;

  // Sem saldo para a entrada, "jogar de novo" seria um beco: a recarga
  // assume o CTA (o botão volta a ser o duelo após recarregar).
  const broke = isBroke(balance);

  /** Por que a mesa fechou — a frase muda o sentido de todo o resto. */
  const reason = session.leftBy
    ? 'Você levantou da mesa'
    : session.bustedBy === 'opponent'
      ? `${opponentName} ficou sem fichas`
      : 'Suas fichas acabaram';

  const row = (label: string, value: string, testId: string, tone?: 'up' | 'down') => (
    <div className={`ledger__row ${tone ? `ledger__row--${tone}` : ''}`}>
      <span className="ledger__label">{label}</span>
      <span className="ledger__value" data-testid={testId}>
        {value}
      </span>
    </div>
  );

  return (
    <ResultStage
      surface="felt"
      tone={won ? 'win' : 'tie'}
      title={won ? 'VOCÊ LUCROU!' : 'OBRIGADO POR JOGAR'}
      titleTestId="result-title"
      /* O tratamento de ouro só na saída em lucro. No prejuízo o título
         fica na tinta gravada de sempre: é um agradecimento, e um
         agradecimento em brasa não agradece nada. */
      effect={won ? 'victory' : undefined}
      subtitle={
        <motion.span
          className="ledger"
          data-testid="session-ledger"
          initial={reducedMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reducedMotion ? { duration: 0 } : { duration: 0.4, delay: 0.25 }}
        >
          {row('Sentou com', formatCredits(session.buyIn), 'ledger-buyin')}
          {row('Levantou com', formatCredits(finalStack), 'ledger-final')}
          {row(
            won ? 'Lucro' : 'Prejuízo',
            `${profit > 0 ? '+' : ''}${formatCredits(profit)}`,
            'ledger-profit',
            profit > 0 ? 'up' : profit < 0 ? 'down' : undefined,
          )}
          {commission > 0 &&
            row(
              `Comissão da casa (${Math.round(HOUSE_EDGE * 100)}%)`,
              `−${formatCredits(commission)}`,
              'ledger-commission',
            )}
          <div className="ledger__row ledger__row--total">
            <span className="ledger__label">Para o saldo</span>
            <span className="ledger__value" data-testid="ledger-cashed">
              <Icon name="chip" size="0.9em" /> {formatCredits(cashed)}
            </span>
          </div>
        </motion.span>
      }
      subtitleTestId="result-delta"
      note={`${session.handsPlayed} ${session.handsPlayed === 1 ? 'mão jogada' : 'mãos jogadas'} · ${reason}`}
      noteTestId="session-reason"
      tightActions
      /* Sem espelho: o EXTRATO é o assunto desta tela, e não um aposto do
         título. Espelhado, ele custaria duas vezes a própria altura e não
         caberia em tela de celular nenhuma (ver ResultStage.mirror). */
      mirror={false}
      instant={reducedMotion}
      /* A chuva de confetes por cima de TUDO, na saída em lucro: o efeito
         de ouro é o acabamento da palavra, e o confete é a festa da sala.
         Um não substitui o outro — a mesa comemora nas duas escalas. */
      decoration={won && !reducedMotion ? <Confetti /> : undefined}
    >
      {broke ? (
        <Button onClick={refillCredits} size="md" fullWidth data-testid="refill-button">
          <Icon name="chip" /> RECARREGAR CRÉDITOS
        </Button>
      ) : (
        <Button onClick={playAgain} size="md" fullWidth data-testid="play-again">
          <Icon name="club" /> NOVA MESA
        </Button>
      )}
      <Button variant="secondary" onClick={goHome} size="md" fullWidth data-testid="go-home">
        INÍCIO
      </Button>
    </ResultStage>
  );
}
