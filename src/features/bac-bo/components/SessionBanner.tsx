import { motion, useReducedMotion } from 'framer-motion';

import { Button } from '@/shared/components/Button';
import { Icon } from '@/shared/components/Icon';
import { formatCredits } from '@/shared/lib/format';

import { afterHouseEdge, isBroke } from '../engine/credits';
import type { PokerSession } from '../engine/poker/types';
import { useGameStore } from '../store/gameStore';
import { Confetti } from './Confetti';
import { ResultStage } from './ResultStage';

export interface SessionBannerProps {
  session: PokerSession;
}

/** A curva de entrada da casa: sai rápido e assenta devagar. */
const EASE: [number, number, number, number] = [0.16, 0.8, 0.3, 1];

/**
 * O FECHO DA MESA — o que você levou, e não quem ganhou a última mão.
 *
 * Aqui morava a tela de VITÓRIA/DERROTA, e ela parou de fazer sentido no
 * dia em que a mesa virou sessão: perder a última mão depois de subir
 * 2.000 fichas não é uma derrota, e a tela que dissesse isso estaria
 * mentindo sobre a noite inteira.
 *
 * Depois dela veio um EXTRATO de cinco linhas — sentou com, levantou com,
 * lucro, comissão da casa, para o saldo —, e ele respondia a pergunta
 * errada: contava COMO se chegou até ali, que é a estrutura de um
 * demonstrativo bancário. A pergunta de quem levanta de uma mesa é uma
 * só, e tem uma linha: quanto ficou. Cinco linhas para responder isso não
 * é rigor, é ruído — e a resposta ficava enterrada no meio das outras
 * quatro, no mesmo corpo miúdo.
 *
 * O NÚMERO DA TELA é o que entrou no saldo ACIMA do que se trouxe: o
 * lucro já sem a parte da casa. A conta vive em `afterHouseEdge`; aqui
 * ela não tem nome, e não deve ter. Com um valor único não há duas
 * parcelas que não fecham — a tela não omite nada, ela deixou de ser uma
 * tabela.
 *
 * O TOM É ASSIMÉTRICO, mas a MATÉRIA é a mesma. Os dois desfechos levam o
 * mesmo ouro no título e a mesma faixa de metal embaixo. O que muda é o
 * gesto: o lucro floresce, sobe e traz um número dentro; o fecho assenta
 * e traz uma palavra. Quem sai sem lucro não recebe uma vitória apagada —
 * recebe um encerramento, com a mesma duração de cerimônia. É isso que o
 * torna digno, e não a intensidade.
 */
export function SessionBanner({ session }: SessionBannerProps) {
  const playAgain = useGameStore((state) => state.playAgain);
  const goHome = useGameStore((state) => state.goHome);
  const balance = useGameStore((state) => state.balance);
  const refillCredits = useGameStore((state) => state.refillCredits);
  const reducedMotion = useReducedMotion() ?? false;

  const finalStack = session.stacks.player;
  const profit = finalStack - session.buyIn;

  /* O LÍQUIDO manda no desfecho, e não o bruto. `afterHouseEdge` arredonda
     para baixo: um lucro de 1 ficha vira 0, e a tela carimbaria festa com
     "+0 créditos". Quem termina com líquido zero cai no fecho — não houve
     lucro a anunciar, e nenhuma linha desta tela mente. */
  const net = afterHouseEdge(Math.max(profit, 0));
  const won = net > 0;
  const value = formatCredits(net);

  // Sem saldo para a entrada, "jogar de novo" seria um beco: a recarga
  // assume o CTA (o botão volta a ser o duelo após recarregar).
  const broke = isBroke(balance);

  /* UM lugar decide o tempo do bloco inteiro. Com movimento reduzido
     todos os compassos viram zero e a peça aparece montada. */
  const beat = (delay: number, duration = 0.42) =>
    reducedMotion ? { duration: 0 } : { duration, delay, ease: EASE };
  const from = (pose: Record<string, number>) => (reducedMotion ? false : pose);
  const still = reducedMotion ? ' payout--still' : '';

  /* Tudo aqui dentro é <span>: o hospedeiro é o <p> do subtítulo (ver
     ResultStage), e o <div> do extrato antigo era HTML inválido que só
     sobrevivia porque o React monta por API de DOM em vez de parser.
     Display de bloco vem do CSS, nunca da tag. */
  const payout = won ? (
    <span className={`payout payout--up${still}`} data-testid="session-payout">
      <motion.span
        className="payout__lede"
        initial={from({ opacity: 0, y: 6 })}
        animate={{ opacity: 1, y: 0 }}
        transition={beat(0.42, 0.34)}
      >
        Você terminou no positivo
      </motion.span>

      <motion.span
        className="payout__bar"
        initial={from({ opacity: 0, y: 10, scale: 0.96 })}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={beat(0.5)}
      >
        <Icon name="chip" size="1.1em" className="payout__chip" />
        <span className="payout__sign" aria-hidden="true">
          +
        </span>
        {/* Mola, e não easing: o valor é a única peça que ASSENTA — passa
            de 1 e volta, ecoando a entrada do título sem copiá-la.
            `data-value` alimenta só a pseudo-cópia da varredura (o mesmo
            truque do `data-word` do título): o DOM segue com um nó só e o
            leitor de tela lê o valor uma vez. A string sai de UMA const —
            duas fontes de verdade aqui desenhariam um número por cima do
            outro no primeiro descuido. */}
        <motion.span
          className="payout__value"
          data-value={value}
          data-testid="payout-value"
          initial={from({ opacity: 0, scale: 0.86 })}
          animate={{ opacity: 1, scale: 1 }}
          transition={
            reducedMotion
              ? { duration: 0 }
              : { type: 'spring', stiffness: 340, damping: 22, mass: 0.7, delay: 0.72 }
          }
        >
          {value}
        </motion.span>
      </motion.span>
    </span>
  ) : (
    <span className={`payout payout--closed${still}`} data-testid="session-payout">
      <motion.span
        className="payout__bar"
        initial={from({ opacity: 0, scale: 0.96 })}
        animate={{ opacity: 1, scale: 1 }}
        transition={beat(0.46, 0.5)}
      >
        <span className="payout__mark" data-value="Mesa encerrada" data-testid="payout-closed">
          Mesa encerrada
        </span>
      </motion.span>
    </span>
  );

  return (
    <ResultStage
      surface="felt"
      tone={won ? 'win' : 'tie'}
      title={won ? 'BOA PARTIDA!' : 'VALEU PELA PARTIDA!'}
      titleTestId="result-title"
      /* O MESMO OURO NOS DOIS DESFECHOS, e não o mesmo efeito: `victory`
         traz a festa junto (halo redondo, varredura rápida, partículas,
         confete), `close` traz o metal e uma chegada própria. */
      effect={won ? 'victory' : 'close'}
      subtitle={payout}
      subtitleTestId="result-delta"
      /* SEM NOTA. Ela contava quantas mãos correram e por que a mesa
         fechou — duas informações sobre o PASSADO, em corpo miúdo e tinta
         apagada, embaixo da única coisa que a tela existe para dizer.
         Quem quer o retrospecto tem o histórico; esta tela dá o saldo. */
      tightActions
      /* Sem espelho: a FAIXA é o assunto desta tela, e não um aposto do
         título. Espelhada, ela custaria duas vezes a própria altura — e o
         orçamento de um aparelho de 320×568 não paga isso. */
      mirror={false}
      instant={reducedMotion}
      /* A chuva de confetes por cima de TUDO, e só no lucro: o ouro é o
         acabamento da palavra, o confete é a festa da sala. */
      decoration={won && !reducedMotion ? <Confetti /> : undefined}
    >
      {broke ? (
        <Button onClick={refillCredits} size="md" fullWidth data-testid="refill-button">
          <Icon name="chip" /> RECARREGAR CRÉDITOS
        </Button>
      ) : (
        <Button onClick={playAgain} size="md" fullWidth data-testid="play-again">
          <Icon name="club" /> NOVA MESA
        </Button>
      )}
      <Button variant="secondary" onClick={goHome} size="md" fullWidth data-testid="go-home">
        INÍCIO
      </Button>
    </ResultStage>
  );
}
