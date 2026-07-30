import { motion, useReducedMotion } from 'framer-motion';

import { Button } from '@/shared/components/Button';
import { Icon } from '@/shared/components/Icon';

import { isBroke } from '../engine/credits';
import type { RoundOutcome, RoundResult } from '../engine/types';
import { useGameStore } from '../store/gameStore';
import { Confetti } from './Confetti';
import { ResultStage } from './ResultStage';

export interface ResultBannerProps {
  result: RoundResult;
}

const OUTCOME_TITLE: Record<RoundOutcome, string> = {
  win: 'VITÓRIA!',
  lose: 'DERROTA',
  tie: 'EMPATE',
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
      /* Vitória/derrota: a variação de saldo é mostrada subindo para
         dentro da pílula de saldo (BalancePill) — nada aqui embaixo.
         Empate não altera o saldo, então mantém o aviso textual. */
      subtitle={result.outcome === 'tie' ? 'Aposta devolvida' : undefined}
      subtitleTestId="result-delta"
      tightActions
      instant={reducedMotion ?? false}
      decoration={
        result.outcome === 'win' && !reducedMotion ? (
          <>
            <Confetti />
            <WinParticles />
          </>
        ) : undefined
      }
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

/** Partículas douradas discretas para a vitória. */
function WinParticles() {
  return (
    <div className="pointer-events-none absolute -top-8 left-1/2" aria-hidden="true">
      {Array.from({ length: 10 }, (_, index) => {
        const angle = (index / 10) * Math.PI * 2;
        return (
          <motion.span
            key={index}
            className="absolute h-2 w-2 rounded-full bg-gold"
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{
              x: Math.cos(angle) * 90,
              y: Math.sin(angle) * 60 - 30,
              opacity: 0,
              scale: 0.4,
            }}
            transition={{ duration: 1.1, ease: 'easeOut', delay: index * 0.02 }}
          />
        );
      })}
    </div>
  );
}
