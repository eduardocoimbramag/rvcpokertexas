import { motion } from 'framer-motion';

import { Button } from '@/shared/components/Button';
import { formatCredits } from '@/shared/lib/format';

import { STAKE_PRESETS, isBroke, validateStake } from '../engine/credits';
import { useGameStore } from '../store/gameStore';

/**
 * Seleção de stake em fichas grandes, pensada para toque.
 * Fichas acima do saldo ficam desabilitadas; sem saldo mínimo,
 * oferece a recarga de créditos virtuais.
 */
export function StakeSelector() {
  const balance = useGameStore((state) => state.balance);
  const selectedStake = useGameStore((state) => state.selectedStake);
  const selectStake = useGameStore((state) => state.selectStake);
  const startSearch = useGameStore((state) => state.startSearch);
  const refillCredits = useGameStore((state) => state.refillCredits);

  const broke = isBroke(balance);

  return (
    <div className="flex flex-1 flex-col justify-between gap-6">
      <div>
        <h2 className="mb-6 text-center text-2xl font-extrabold">Escolha sua aposta</h2>

        <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label="Valor da aposta">
          {STAKE_PRESETS.map((stake) => {
            const disabled = !validateStake(balance, stake).ok;
            const selected = selectedStake === stake;
            return (
              <motion.button
                key={stake}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={disabled}
                whileTap={disabled ? undefined : { scale: 0.92 }}
                whileHover={disabled ? undefined : { y: -2 }}
                onClick={() => selectStake(stake)}
                data-testid={`stake-${stake}`}
                className={`stake-chip flex min-h-20 flex-col items-center justify-center font-black tabular-nums ${
                  selected ? 'stake-chip--selected' : ''
                }`}
              >
                <span className="text-xl">{formatCredits(stake)}</span>
                <span
                  className={`text-[10px] font-semibold uppercase tracking-widest ${
                    selected ? 'text-gold/80' : 'text-slate-400'
                  }`}
                >
                  créditos
                </span>
              </motion.button>
            );
          })}
        </div>
      </div>

      {broke ? (
        <div className="action-stack pb-2 text-center">
          <p className="text-engraved text-sm font-extrabold text-[#33261a]">
            Seus créditos acabaram!
          </p>
          <Button onClick={refillCredits} size="md" fullWidth data-testid="refill-button">
            🪙 RECARREGAR CRÉDITOS
          </Button>
        </div>
      ) : (
        <div className="action-stack pb-2">
          <Button
            onClick={() => void startSearch()}
            disabled={selectedStake === null}
            size="md"
            fullWidth
            data-testid="search-button"
          >
            ⚔️ BUSCAR OPONENTE
          </Button>
        </div>
      )}
    </div>
  );
}
