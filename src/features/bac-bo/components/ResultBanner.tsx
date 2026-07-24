import { motion, useReducedMotion } from 'framer-motion';

import { Button } from '@/shared/components/Button';
import { Icon } from '@/shared/components/Icon';

import { isBroke } from '../engine/credits';
import type { RoundOutcome, RoundResult } from '../engine/types';
import { useGameStore } from '../store/gameStore';
import { Confetti } from './Confetti';

export interface ResultBannerProps {
  result: RoundResult;
}

/* Tintas escuras e saturadas: o banner assenta sobre o couro claro. */
const OUTCOME_COPY: Record<RoundOutcome, { title: string; className: string }> = {
  win: { title: 'VITÓRIA!', className: 'text-[#7a4503]' },
  lose: { title: 'DERROTA', className: 'text-[#8f1616]' },
  tie: { title: 'EMPATE', className: 'text-[#3d372f]' },
};

/** Fase Completed: veredito da rodada, variação de saldo e próximas ações. */
export function ResultBanner({ result }: ResultBannerProps) {
  const playAgain = useGameStore((state) => state.playAgain);
  const goHome = useGameStore((state) => state.goHome);
  const balance = useGameStore((state) => state.balance);
  const refillCredits = useGameStore((state) => state.refillCredits);
  const reducedMotion = useReducedMotion();

  const copy = OUTCOME_COPY[result.outcome];
  // Sem saldo para o menor lance, "jogar de novo" seria um beco: a
  // recarga assume o CTA (o botão volta a ser o duelo após recarregar).
  const broke = isBroke(balance);

  return (
    // O banner ocupa toda a faixa livre abaixo dos dados (flex-1) e a
    // divide em: [espaço] · veredito · [espaço] · ações. Os dois
    // espaçadores crescem igual (grow), então o veredito fica
    // EXATAMENTE no centro vertical entre os dados e o botão "Jogar de
    // novo" — em qualquer altura de tela (docs/centralizacao.md).
    <motion.div
      className="relative flex flex-1 flex-col items-center pb-4"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', damping: 20, stiffness: 260 }}
    >
      {result.outcome === 'win' && !reducedMotion && (
        <>
          <Confetti />
          <WinParticles />
        </>
      )}

      {/* Espaçador superior: da base dos dados até o veredito. */}
      <div aria-hidden className="w-full grow" />

      <div className="flex flex-col items-center gap-0.5">
        <p
          className={`font-display text-engraved text-4xl font-bold tracking-wide ${copy.className}`}
          data-testid="result-title"
        >
          {copy.title}
        </p>
        {/* Vitória/derrota: a variação de saldo é mostrada subindo para
            dentro da pílula de saldo (BalancePill) — nada aqui embaixo.
            Empate não altera o saldo, então mantém o aviso textual. */}
        {result.outcome === 'tie' && (
          <p
            className="text-engraved text-lg font-extrabold tabular-nums text-[#33261a]"
            data-testid="result-delta"
          >
            Aposta devolvida
          </p>
        )}
      </div>

      {/* Espaçador inferior: do veredito até o botão. Mesmo grow do de
          cima → veredito centralizado na faixa. */}
      <div aria-hidden className="w-full grow" />

      {/* --tight = metade do gap padrão da .action-stack (0.75rem →
          0.375rem): ações mais juntas neste desfecho, sem alterar as
          demais telas que usam .action-stack. */}
      <div className="action-stack action-stack--tight">
        {broke ? (
          <Button onClick={refillCredits} size="md" fullWidth data-testid="refill-button">
            <Icon name="chip" /> RECARREGAR CRÉDITOS
          </Button>
        ) : (
          <Button onClick={playAgain} size="md" fullWidth data-testid="play-again">
            <Icon name="dice" /> JOGAR DE NOVO
          </Button>
        )}
        <Button variant="secondary" onClick={goHome} size="md" fullWidth data-testid="go-home">
          INÍCIO
        </Button>
      </div>
    </motion.div>
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
