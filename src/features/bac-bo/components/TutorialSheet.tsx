import { useState } from 'react';

import { Button } from '@/shared/components/Button';
import { Sheet } from '@/shared/components/Sheet';

import { useGameStore } from '../store/gameStore';

export interface TutorialSheetProps {
  open: boolean;
  onClose: () => void;
  /** Quando verdadeiro, fechar o tutorial leva direto à seleção de stake. */
  continueToGame?: boolean;
}

const STEPS: readonly { icon: string; title: string; text: string }[] = [
  {
    icon: '🪙',
    title: 'Escolha sua aposta',
    text: 'Selecione quantos créditos quer apostar no duelo. Você começa com um saldo virtual.',
  },
  {
    icon: '⚔️',
    title: 'Enfrente um oponente',
    text: 'Encontramos um adversário para você. Confirme o duelo para começar a rodada.',
  },
  {
    icon: '🎲',
    title: 'Maior soma vence',
    text: 'São 4 dados: 2 azuis seus e 2 vermelhos do oponente. Vitória paga 1:1 e empate devolve a aposta.',
  },
];

/** Tutorial em 3 passos exibido na primeira jogada (e sob demanda). */
export function TutorialSheet({ open, onClose, continueToGame = false }: TutorialSheetProps) {
  const [step, setStep] = useState(0);
  const markTutorialSeen = useGameStore((state) => state.markTutorialSeen);
  const goToStake = useGameStore((state) => state.goToStake);

  const isLastStep = step === STEPS.length - 1;
  const current = STEPS[step] ?? STEPS[0];

  const finish = () => {
    markTutorialSeen();
    onClose();
    setStep(0);
    if (continueToGame) goToStake();
  };

  const close = () => {
    onClose();
    setStep(0);
  };

  if (!current) return null;

  return (
    <Sheet open={open} title="Como jogar" onClose={close}>
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="text-5xl" aria-hidden="true">
          {current.icon}
        </span>
        <h3 className="text-xl font-extrabold">{current.title}</h3>
        <p className="min-h-16 text-sm text-slate-300">{current.text}</p>

        <div className="flex gap-2" aria-label={`Passo ${step + 1} de ${STEPS.length}`}>
          {STEPS.map((_, index) => (
            <span
              key={index}
              className={`h-2 w-2 rounded-full ${index === step ? 'bg-gold' : 'bg-arena-line'}`}
              aria-hidden="true"
            />
          ))}
        </div>

        <Button
          fullWidth
          onClick={isLastStep ? finish : () => setStep((value) => value + 1)}
          data-testid="tutorial-next"
        >
          {isLastStep ? (continueToGame ? 'COMEÇAR' : 'ENTENDI') : 'PRÓXIMO'}
        </Button>
      </div>
    </Sheet>
  );
}
