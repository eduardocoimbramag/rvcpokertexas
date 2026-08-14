import { AnimatePresence, motion } from 'framer-motion';

export interface CountdownOverlayProps {
  value: number;
}

/** Fase Countdown: contagem falada 5→1 em tela cheia antes da rolagem. */
export function CountdownOverlay({ value }: CountdownOverlayProps) {
  return (
    <div
      className="flex flex-1 items-center justify-center"
      role="timer"
      aria-label={`Começando em ${value}`}
    >
      <AnimatePresence mode="popLayout">
        <motion.span
          key={value}
          className="font-display text-9xl font-bold text-gold tabular-nums [text-shadow:0_4px_18px_rgba(0,0,0,0.45),0_1px_2px_rgba(0,0,0,0.4)]"
          initial={{ scale: 2.2, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.6, opacity: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          data-testid="countdown-value"
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
