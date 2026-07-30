import { useState } from 'react';

import { Button } from '@/shared/components/Button';
import type { IconName } from '@/shared/components/Icon';
import { Icon } from '@/shared/components/Icon';
import { Sheet } from '@/shared/components/Sheet';

import { NEGOTIATION_SECONDS } from '../animations/timings';
import { DEFAULT_STAKE } from '../engine/credits';
import { useGameStore } from '../store/gameStore';
import { TABLE_TARGET_WINS } from '../tournament/types';

export interface TutorialSheetProps {
  open: boolean;
  onClose: () => void;
  /** Quando verdadeiro, fechar o tutorial já inicia a busca por oponente. */
  continueToGame?: boolean;
}

/**
 * Os passos do tutorial, na ordem do que o jogador vai encontrar: acha o
 * rival, acerta a aposta, joga a mão — e, no fim, fica sabendo que existe
 * um torneio.
 *
 * Este texto é CONTRATO COM A INTERFACE: é a primeira coisa que se lê no
 * jogo, então descrever uma tela que não existe mais é pior do que não
 * explicar nada. Mudou a fase, mude aqui.
 */
const STEPS: readonly { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'swords',
    title: 'Enfrente um oponente',
    text: 'Encontramos um adversário para você. Confirme o duelo para abrir a mesa de negociação.',
  },
  {
    icon: 'coins',
    title: 'Negocie a aposta',
    // Sem ✓/✗ no texto: a fonte da casa não tem esses glifos e o
    // navegador cai num fallback que desenha o certo como radical.
    text: `A mesa abre com uma aposta padrão de ${DEFAULT_STAKE} fichas e ${NEGOTIATION_SECONDS} segundos no relógio. Quer outro valor? Envie uma proposta: ela vira um balão na mesa, e o rival cobre ou recusa — cobrir fecha o duelo naquele valor, recusar mantém o que já estava. Se o relógio zerar, vale o que estiver na mesa.`,
  },
  {
    icon: 'club',
    title: 'Chegue mais perto de 21',
    text: 'É você contra o rival, sem casa no meio. A cada vez os dois têm 20 segundos para escolher em segredo — pedir carta, parar ou propor dobrar a aposta —, e os dois lances são revelados juntos. Quem estourar perde na hora, e a última carta de cada um só vira no showdown — nem um blackjack na sua mão muda o seu jeito de jogar, para não entregar nada. A vitória leva 90% do que o rival pôs na mesa.',
  },
  {
    icon: 'trophy',
    title: 'E tem torneio',
    text: `Quando quiser jogar com mais gente, crie uma sala e escolha o formato: chaveamento, um mata-mata de duelos até a final, com pódio premiado; ou mesa única, de 3 a 6 jogadores no mesmo feltro, onde o primeiro a vencer ${TABLE_TARGET_WINS} rodadas leva 90% do bolo.`,
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

        {/* role="img": as bolinhas são decorativas (aria-hidden), então o
            passo só chega ao leitor de tela por este rótulo — e rótulo em
            <div> sem papel é descartado pela especificação ARIA. */}
        <div
          className="flex gap-2"
          role="img"
          aria-label={`Passo ${step + 1} de ${STEPS.length}`}
        >
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
