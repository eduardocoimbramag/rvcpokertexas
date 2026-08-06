import { useState } from 'react';

import { Button } from '@/shared/components/Button';
import type { IconName } from '@/shared/components/Icon';
import { Icon } from '@/shared/components/Icon';
import { Sheet } from '@/shared/components/Sheet';

import { TABLE_ANTE, TABLE_MAX_STACK } from '../engine/credits';
import { ACTION_SECONDS, useGameStore } from '../store/gameStore';
import { TABLE_TARGET_WINS } from '../tournament/types';

export interface TutorialSheetProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Os passos do COMO JOGAR, na ordem do que o jogador vai encontrar:
 * acha o rival, senta na mesa, joga as quatro ruas, chega ao showdown —
 * e, no fim, fica sabendo que existe um torneio.
 *
 * Este texto é CONTRATO COM A INTERFACE: quem o abre está perdido, e
 * descrever uma tela que não existe mais é pior do que não explicar
 * nada. Mudou a fase, mude aqui.
 */
const STEPS: readonly { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'swords',
    title: 'Texas Hold’em 1v1',
    text: `Encontramos um adversário para você. Confirme o duelo e os dois compram fichas pelo mesmo valor — até ${TABLE_MAX_STACK} créditos, ou o que o seu saldo permitir. A mesa não é UMA mão: as mãos correm uma atrás da outra, e a entrada de ${TABLE_ANTE} créditos de cada um vai ao pote antes da primeira carta de TODA mão.`,
  },
  {
    icon: 'club',
    title: 'Duas suas, cinco de todos',
    text: 'Você recebe duas cartas fechadas — só suas, e o rival não vê nenhuma delas. No meio do feltro abrem cinco cartas comunitárias, três de uma vez (o flop) e depois uma a uma (turn e river). A sua mão é a melhor combinação de cinco entre as suas duas e as cinco da mesa; a placa embaixo das suas cartas diz o que você tem a cada carta que vira.',
  },
  {
    icon: 'chip',
    title: 'Aposte a cada rua',
    text: `Antes de cada carta comunitária abre uma rodada de apostas, e você tem ${ACTION_SECONDS} segundos para decidir: PASSAR (seguir de graça), PAGAR o que o rival apostou, AUMENTAR — digitando quanto quer pôr a mais, com atalhos de +10 e +100 — ou CORRER, largando a mão. Correr custa só o que você já tinha posto, e por isso está sempre à mão: numa mesa que continua, guardar fichas é jogada. Aumentar até o fim do stack é o all-in.`,
  },
  {
    icon: 'crown',
    title: 'O showdown decide',
    text: 'Chegando ao river, as duas mãos viram e se comparam: a mais forte leva o pote, e o empate divide. As fichas ficam na mesa e passam para o lado de quem ganhou — o seu montante, ao lado da sua mão, sobe e desce a cada pote. Elas têm quatro valores: marfim vale 25, vinho 100, ardósia 500 e ouro 1.000. Se o rival correr, a mesa te pergunta se você quer abrir a sua mão para ele: mostrar um blefe é jogada, e não custa ficha nenhuma.',
  },
  {
    icon: 'chip',
    title: 'Até alguém quebrar',
    text: 'A mesa segue enquanto os dois tiverem fichas para a entrada, e entre uma mão e outra correm 10 segundos antes de a próxima ser distribuída. O botão de LEVANTAR fica no canto da fileira, apagado na primeira mão — ela é o compromisso de quem sentou. Levantar no meio de uma mão corre a mão junto. No caixa você vê o balanço: com quanto sentou, com quanto levantou e o que entra no seu saldo. A comissão da casa (10%) incide uma vez só ali, e só sobre o lucro.',
  },
  {
    icon: 'trophy',
    title: 'E tem torneio',
    text: `Quando quiser jogar com mais gente, crie uma sala e escolha o formato: chaveamento, um mata-mata de duelos até a final, com pódio premiado; ou mesa única, de 3 a 6 jogadores no mesmo feltro, onde o primeiro a vencer ${TABLE_TARGET_WINS} rodadas leva 90% do bolo.`,
  },
];

/**
 * A folha do COMO JOGAR, aberta sob demanda.
 *
 * Ela já foi um tutorial de primeira jogada, disparado por quem tocava
 * em JOGAR. Deixou de ser: o botão de jogar leva à mesa, e quem quer
 * aprender pede por isto — que é exatamente o que o botão abaixo dele
 * promete. Fechar devolve o jogador para onde ele estava.
 */
export function TutorialSheet({ open, onClose }: TutorialSheetProps) {
  const [step, setStep] = useState(0);
  const markTutorialSeen = useGameStore((state) => state.markTutorialSeen);

  const isLastStep = step === STEPS.length - 1;
  const current = STEPS[step] ?? STEPS[0];

  const close = () => {
    onClose();
    setStep(0);
  };

  const finish = () => {
    markTutorialSeen();
    close();
  };

  if (!current) return null;

  return (
    <Sheet open={open} title="Como jogar" onClose={close}>
      <div className="flex flex-col items-center gap-4 text-center">
        <Icon name={current.icon} size={52} className="text-gold" />
        <h3 className="text-xl font-extrabold">{current.title}</h3>
        <p className="min-h-32 text-sm text-lavender">{current.text}</p>

        {/* role="img": as bolinhas são decorativas (aria-hidden), então o
            passo só chega ao leitor de tela por este rótulo — e rótulo em
            <div> sem papel é descartado pela especificação ARIA. */}
        <div className="flex gap-2" role="img" aria-label={`Passo ${step + 1} de ${STEPS.length}`}>
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
          {isLastStep ? 'ENTENDI' : 'PRÓXIMO'}
        </Button>
      </div>
    </Sheet>
  );
}
