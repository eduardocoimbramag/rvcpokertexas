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
    <div className="flex flex-1 flex-col">
      {/* Título + fichas centralizados verticalmente no couro livre acima
          do botão (não colados no trilho). */}
      <div className="flex flex-1 flex-col justify-center gap-7">
        {/* Mesma tinta escura da fonte do botão primário (#201608),
            gravada no couro. */}
        <h2 className="text-engraved text-center text-2xl font-extrabold text-[#201608]">
          Escolha sua aposta
        </h2>

        {/* Margem negativa -mx-3 reduz pela metade o padding horizontal
            do conteúdo (px-6 = 24px → 12px), alargando as fichas. */}
        <div className="-mx-3 grid grid-cols-3 gap-3" role="radiogroup" aria-label="Valor da aposta">
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
                className={`stake-chip flex min-h-24 w-3/4 flex-col items-center justify-center gap-0.5 justify-self-center font-black tabular-nums ${
                  selected ? 'stake-chip--selected' : ''
                }`}
              >
                <span className="text-[clamp(2.4rem,9vw,3rem)] leading-none">
                  {formatCredits(stake)}
                </span>
                <span
                  className={`text-[10px] font-semibold uppercase tracking-widest ${
                    selected ? 'text-gold-bright/80' : 'text-lavender'
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
