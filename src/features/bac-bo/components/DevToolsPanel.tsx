import { useState } from 'react';

import { Icon } from '@/shared/components/Icon';
import { appEnv } from '@/shared/config/env';

import type { ForcedPokerDeal } from '../engine/poker/types';
import { useGameStore } from '../store/gameStore';

/**
 * Painel oculto de desenvolvimento (seção 21 da especificação).
 * Renderizado apenas quando `VITE_ENABLE_DEVTOOLS=true`; permite forçar
 * o resultado da próxima mão, adicionar créditos e zerar o estado.
 */
export function DevToolsPanel() {
  const [open, setOpen] = useState(false);
  const forcedDeal = useGameStore((state) => state.devForcedDeal);
  const devSetForcedDeal = useGameStore((state) => state.devSetForcedDeal);
  const devAddCredits = useGameStore((state) => state.devAddCredits);
  const devResetAll = useGameStore((state) => state.devResetAll);

  if (!appEnv.devToolsEnabled) return null;

  /* A mão empilhada garante o SHOWDOWN, não a mão: quem desiste é quem
     joga, e um jogador que jogue fora um par de Ases perde do mesmo
     jeito. Para conferir o desfecho, vá até o fim. */
  const deals: readonly { value: ForcedPokerDeal; label: string }[] = [
    { value: 'win', label: 'Vitória' },
    { value: 'lose', label: 'Derrota' },
    { value: 'tie', label: 'Empate' },
    // Não é um desfecho, é uma MÃO: serve para ver o placar do vencedor
    // com as cinco cartas do naipe.
    { value: 'flush', label: 'Puxar flush' },
  ];

  return (
    <div className="fixed bottom-2 left-2 z-40 flex flex-col items-start gap-2 text-xs">
      {open && (
        <div className="flex flex-col gap-2 rounded-xl border border-arena-line bg-arena-900/95 p-3 shadow-xl">
          <p className="font-bold text-lavender">Forçar o showdown da mão:</p>
          <div className="flex flex-wrap gap-1">
            {deals.map((deal) => (
              <button
                key={deal.value}
                type="button"
                onClick={() => devSetForcedDeal(forcedDeal === deal.value ? null : deal.value)}
                data-testid={`force-${deal.value}`}
                className={`focus-ring rounded-lg px-2 py-1 font-bold ${
                  forcedDeal === deal.value ? 'bg-gold text-arena-950' : 'bg-arena-700 text-ivory'
                }`}
              >
                {deal.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => devAddCredits(1000)}
            data-testid="dev-add-credits"
            className="focus-ring rounded-lg bg-arena-700 px-2 py-1 text-left font-bold text-ivory"
          >
            +1000 créditos
          </button>
          <button
            type="button"
            onClick={devResetAll}
            data-testid="dev-reset"
            className="focus-ring rounded-lg bg-opponent/80 px-2 py-1 text-left font-bold text-white"
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
        className="focus-ring grid h-10 w-10 place-items-center rounded-full border border-arena-line bg-arena-900/90 text-base shadow-lg"
      >
        <Icon name="wrench" className="text-lavender" />
      </button>
    </div>
  );
}
