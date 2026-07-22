import { motion } from 'framer-motion';

import { Button } from '@/shared/components/Button';
import { Icon } from '@/shared/components/Icon';

import { useGameStore } from '../store/gameStore';

/** Fase Search: radar pulsante enquanto o oponente simulado é encontrado. */
export function MatchmakingOverlay() {
  const cancelSearch = useGameStore((state) => state.cancelSearch);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8">
      <div className="relative grid h-40 w-40 place-items-center" aria-hidden="true">
        {[0, 1, 2].map((ring) => (
          <motion.span
            key={ring}
            className="absolute inset-0 rounded-full border-2 border-[#cb7349]/70"
            initial={{ scale: 0.4, opacity: 0.9 }}
            animate={{ scale: 1.15, opacity: 0 }}
            transition={{ repeat: Infinity, duration: 1.6, delay: ring * 0.5, ease: 'easeOut' }}
          />
        ))}
        {/* Lupa em terracota gravada, no tom dos anéis do radar. */}
        <Icon name="search" size={52} className="text-[#8a5a28]" />
      </div>

      {/* Tinta escura gravada: o conteúdo assenta sobre o couro claro. */}
      <div className="text-center" role="status">
        <p className="text-engraved text-xl font-extrabold text-[#2a1f12]">Procurando oponente…</p>
        <p className="text-engraved text-sm font-semibold text-[#4a3826]">
          Isso leva poucos segundos
        </p>
      </div>

      <Button variant="secondary" onClick={cancelSearch} data-testid="cancel-search">
        Cancelar busca
      </Button>
    </div>
  );
}
