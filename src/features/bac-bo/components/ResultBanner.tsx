import { useReducedMotion } from 'framer-motion';

import { Button } from '@/shared/components/Button';
import { Icon } from '@/shared/components/Icon';

import { isBroke } from '../engine/credits';
import type { RoundOutcome, RoundResult } from '../engine/types';
import { useGameStore } from '../store/gameStore';
import { Confetti } from './Confetti';
import type { ResultEffectOutcome } from './ResultOutcomeEffect';
import { ResultStage } from './ResultStage';

export interface ResultBannerProps {
  result: RoundResult;
}

const OUTCOME_TITLE: Record<RoundOutcome, string> = {
  win: 'VITÓRIA!',
  lose: 'DERROTA',
  tie: 'EMPATE',
};

/**
 * Que tratamento cada desfecho ganha (ver ResultOutcomeEffect). O EMPATE
 * fica de fora de propósito: ele não é notícia, e vesti-lo de ouro ou de
 * rubi diria o que não aconteceu. A aposta voltou — a tinta gravada de
 * sempre é exatamente o tom disso.
 */
const OUTCOME_EFFECT: Partial<Record<RoundOutcome, ResultEffectOutcome>> = {
  win: 'victory',
  lose: 'defeat',
};

/** Fase Completed: veredito da rodada, variação de saldo e próximas ações. */
export function ResultBanner({ result }: ResultBannerProps) {
  const playAgain = useGameStore((state) => state.playAgain);
  const goHome = useGameStore((state) => state.goHome);
  const balance = useGameStore((state) => state.balance);
  const refillCredits = useGameStore((state) => state.refillCredits);
  const reducedMotion = useReducedMotion();

  // Sem saldo para o menor lance, "jogar de novo" seria um beco: a
  // recarga assume o CTA (o botão volta a ser o duelo após recarregar).
  const broke = isBroke(balance);

  return (
    // O palco ocupa a faixa livre abaixo das cartas e centra o veredito
    // entre as PLACAS DE PLACAR e o botão — ver ResultStage. `--tight`
    // junta os dois botões empilhados deste desfecho.
    <ResultStage
      surface="felt"
      tone={result.outcome}
      title={OUTCOME_TITLE[result.outcome]}
      titleTestId="result-title"
      effect={OUTCOME_EFFECT[result.outcome]}
      /* Vitória/derrota: a variação de saldo é mostrada subindo para
         dentro da pílula de saldo (BalancePill) — nada aqui embaixo.
         Empate não altera o saldo, então mantém o aviso textual. */
      subtitle={result.outcome === 'tie' ? 'Aposta devolvida' : undefined}
      subtitleTestId="result-delta"
      tightActions
      instant={reducedMotion ?? false}
      /* A chuva de confetes por cima de TUDO, na vitória: o efeito de
         ouro é o acabamento da palavra, e o confete é a festa da sala.
         Um não substitui o outro — a mesa comemora nas duas escalas. */
      decoration={result.outcome === 'win' && !reducedMotion ? <Confetti /> : undefined}
    >
      {broke ? (
        <Button onClick={refillCredits} size="md" fullWidth data-testid="refill-button">
          <Icon name="chip" /> RECARREGAR CRÉDITOS
        </Button>
      ) : (
        <Button onClick={playAgain} size="md" fullWidth data-testid="play-again">
          <Icon name="club" /> JOGAR DE NOVO
        </Button>
      )}
      <Button variant="secondary" onClick={goHome} size="md" fullWidth data-testid="go-home">
        INÍCIO
      </Button>
    </ResultStage>
  );
}
