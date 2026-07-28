import { useState } from 'react';

import { Button } from '@/shared/components/Button';
import type { IconName } from '@/shared/components/Icon';
import { Icon } from '@/shared/components/Icon';
import { Sheet } from '@/shared/components/Sheet';

import { useGameStore } from '../store/gameStore';

export interface TutorialSheetProps {
  open: boolean;
  onClose: () => void;
  /** Quando verdadeiro, fechar o tutorial já inicia a busca por oponente. */
  continueToGame?: boolean;
}

const STEPS: readonly { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'swords',
    title: 'Enfrente um oponente',
    text: 'Encontramos um adversário para você. Confirme o duelo para abrir a mesa de negociação.',
  },
  {
    icon: 'coins',
    title: 'Negocie a aposta',
    text: 'Troquem propostas no chat até fecharem o valor do duelo. Quem propõe espera o outro aceitar — só o acordo libera a partida.',
  },
  {
    icon: 'club',
    title: 'Chegue mais perto de 21',
    text: 'É você contra o rival, sem casa no meio. A cada vez os dois têm 20 segundos para escolher em segredo — pedir carta, parar ou propor dobrar a aposta —, e os dois lances são revelados juntos. Quem estourar perde na hora, e a última carta de cada um só vira no showdown. A vitória leva 90% do que o rival pôs na mesa.',
  },
];

/** Tutorial em 3 passos exibido na primeira jogada (e sob demanda). */
export function TutorialSheet({ open, onClose, continueToGame = false }: TutorialSheetProps) {
  const [step, setStep] = useState(0);
  const markTutorialSeen = useGameStore((state) => state.markTutorialSeen);
  const startSearch = useGameStore((state) => state.startSearch);

  const isLastStep = step === STEPS.length - 1;
  const current = STEPS[step] ?? STEPS[0];

  const finish = () => {
    markTutorialSeen();
    onClose();
    setStep(0);
    if (continueToGame) void startSearch();
  };

  const close = () => {
    onClose();
    setStep(0);
  };

  if (!current) return null;

  return (
    <Sheet open={open} title="Como jogar" onClose={close}>
      <div className="flex flex-col items-center gap-4 text-center">
        <Icon name={current.icon} size={52} className="text-gold" />
        <h3 className="text-xl font-extrabold">{current.title}</h3>
        <p className="min-h-16 text-sm text-lavender">{current.text}</p>

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
