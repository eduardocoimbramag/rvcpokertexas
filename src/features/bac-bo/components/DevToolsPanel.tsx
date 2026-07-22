import { useState } from 'react';

import { Icon } from '@/shared/components/Icon';
import { appEnv } from '@/shared/config/env';

import type { RoundOutcome } from '../engine/types';
import { useGameStore } from '../store/gameStore';

/**
 * Painel oculto de desenvolvimento (seção 21 da especificação).
 * Renderizado apenas quando `VITE_ENABLE_DEVTOOLS=true`; permite forçar
 * o resultado da próxima rodada, adicionar créditos e zerar o estado.
 */
export function DevToolsPanel() {
  const [open, setOpen] = useState(false);
  const forcedOutcome = useGameStore((state) => state.devForcedOutcome);
  const devSetForcedOutcome = useGameStore((state) => state.devSetForcedOutcome);
  const forcedCoinWinner = useGameStore((state) => state.devForcedCoinWinner);
  const devSetForcedCoinWinner = useGameStore((state) => state.devSetForcedCoinWinner);
  const devAddCredits = useGameStore((state) => state.devAddCredits);
  const devResetAll = useGameStore((state) => state.devResetAll);

  if (!appEnv.devToolsEnabled) return null;

  const outcomes: readonly { value: RoundOutcome; label: string }[] = [
    { value: 'win', label: 'Vitória' },
    { value: 'lose', label: 'Derrota' },
    { value: 'tie', label: 'Empate' },
  ];

  return (
    <div className="fixed bottom-2 left-2 z-40 flex flex-col items-start gap-2 text-xs">
      {open && (
        <div className="flex flex-col gap-2 rounded-xl border border-arena-line bg-arena-900/95 p-3 shadow-xl">
          <p className="font-bold text-lavender">Forçar próxima rodada:</p>
          <div className="flex gap-1">
            {outcomes.map((outcome) => (
              <button
                key={outcome.value}
                type="button"
                onClick={() =>
                  devSetForcedOutcome(forcedOutcome === outcome.value ? null : outcome.value)
                }
                data-testid={`force-${outcome.value}`}
                className={`rounded-lg px-2 py-1 font-bold ${
                  forcedOutcome === outcome.value
                    ? 'bg-gold text-arena-950'
                    : 'bg-arena-700 text-ivory'
                }`}
              >
                {outcome.label}
              </button>
            ))}
          </div>
          <p className="font-bold text-lavender">Forçar cara-ou-coroa:</p>
          <div className="flex gap-1">
            {(
              [
                { value: 'player', label: 'Você vence' },
                { value: 'opponent', label: 'Oponente' },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() =>
                  devSetForcedCoinWinner(forcedCoinWinner === option.value ? null : option.value)
                }
                data-testid={`force-coin-${option.value}`}
                className={`rounded-lg px-2 py-1 font-bold ${
                  forcedCoinWinner === option.value
                    ? 'bg-gold text-arena-950'
                    : 'bg-arena-700 text-ivory'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => devAddCredits(1000)}
            data-testid="dev-add-credits"
            className="rounded-lg bg-arena-700 px-2 py-1 text-left font-bold text-ivory"
          >
            +1000 créditos
          </button>
          <button
            type="button"
            onClick={devResetAll}
            data-testid="dev-reset"
            className="rounded-lg bg-opponent/80 px-2 py-1 text-left font-bold text-white"
          >
            Limpar estado
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="DevTools"
        data-testid="devtools-toggle"
        className="grid h-10 w-10 place-items-center rounded-full border border-arena-line bg-arena-900/90 text-base shadow-lg"
      >
        <Icon name="wrench" className="text-lavender" />
      </button>
    </div>
  );
}
