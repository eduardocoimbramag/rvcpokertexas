import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

import { Button } from '@/shared/components/Button';
import { Icon } from '@/shared/components/Icon';

import { useGameStore } from '../store/gameStore';
import { DuelistSeat } from './DuelistSeat';
import { OPPONENT_ALIAS } from './opponentIdentity';
import { PhaseTitle } from './PhaseTitle';

const STAMP_SPRING = { type: 'spring', stiffness: 520, damping: 16 } as const;

interface ReadySeatProps {
  name: string;
  accent: 'player' | 'opponent';
  confirmed: boolean;
  instant: boolean;
}

/**
 * O assento do duelista (DuelistSeat, o mesmo da apresentação) com o
 * ESTADO DE PRONTIDÃO por cima: enquanto espera, um aro tracejado gira
 * devagar em volta do medalhão; ao confirmar, um anel esmeralda se
 * desenha, o selo de visto carimba no canto e um flash expande.
 *
 * Os DOIS assentos são a mesma peça, com a mesma pilha de elementos. É o
 * que os mantém à mesma altura — nenhum lado ganha um apêndice (rótulo
 * extra, atalho de perfil) que empurre o avatar do outro para baixo. Ver
 * o `items-start` da fileira.
 */
function ReadySeat({ name, accent, confirmed, instant }: ReadySeatProps) {
  return (
    <DuelistSeat name={name} accent={accent}>
      <>
        {confirmed ? (
          <svg className="confirm-ring" viewBox="0 0 100 100" aria-hidden="true">
            <motion.circle
              cx="50"
              cy="50"
              r="47"
              fill="none"
              stroke="#34d399"
              strokeWidth="3.5"
              strokeLinecap="round"
              transform="rotate(-90 50 50)"
              initial={instant ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={instant ? { duration: 0 } : { duration: 0.5, ease: 'easeOut' }}
            />
          </svg>
        ) : (
          <motion.svg
            className="confirm-ring"
            viewBox="0 0 100 100"
            aria-hidden="true"
            animate={instant ? undefined : { rotate: 360 }}
            transition={instant ? undefined : { repeat: Infinity, duration: 7, ease: 'linear' }}
          >
            <circle
              cx="50"
              cy="50"
              r="47"
              fill="none"
              stroke="rgba(203, 115, 73, 0.6)"
              strokeWidth="3"
              strokeDasharray="10 8"
              strokeLinecap="round"
            />
          </motion.svg>
        )}

        <AnimatePresence>
          {confirmed && (
            <motion.span
              className="confirm-badge"
              aria-hidden="true"
              initial={instant ? false : { scale: 0, rotate: -40, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={instant ? { duration: 0 } : STAMP_SPRING}
            >
              <Icon name="check" size={14} strokeWidth={3} />
            </motion.span>
          )}
        </AnimatePresence>

        {confirmed && !instant && (
          <motion.span
            className="confirm-flash"
            aria-hidden="true"
            initial={{ opacity: 0.9, scale: 0.9 }}
            animate={{ opacity: 0, scale: 1.5 }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
          />
        )}
      </>
    </DuelistSeat>
  );
}

/**
 * Fase Confirm: o duelo só começa quando os DOIS lados confirmam.
 * O jogador confirma no botão; o oponente confirma sozinho instantes
 * depois (ou antes!). Cada confirmação carimba o assento correspondente;
 * com ambos prontos, o VS flareja e a faixa "duelo confirmado" fecha o
 * pacto antes da mesa de negociação.
 *
 * O rival é ANÔNIMO aqui — "Oponente", sem nome e sem perfil a abrir
 * (ver opponentIdentity.ts): você aceita o duelo, não a pessoa. O nome
 * entra em cena depois do acordo, junto com as cartas. Por isso a tela
 * não recebe o `match`: não há nada nele que ela possa mostrar.
 */
export function ConfirmPanel() {
  const confirmMatch = useGameStore((state) => state.confirmMatch);
  const declineMatch = useGameStore((state) => state.declineMatch);
  const confirmations = useGameStore((state) => state.confirmations);
  const instant = useReducedMotion() ?? false;

  const bothReady = confirmations.player && confirmations.opponent;

  return (
    <div className="flex flex-1 flex-col">
      {/* Três espaçadores em proporção 2 : 1 : 1. O de cima é o dobro
          dos outros: ele empurra o título para DENTRO do couro (sem ele
          a placa nasceria colada no trilho da mesa) e, de quebra,
          aperta o trio — título, duelistas e ações ficam próximos em vez
          de esparramados pela mesa. Os dois de baixo são iguais entre
          si, então os duelistas continuam no meio EXATO entre o título e
          os botões (docs/centralizacao.md). Tudo em fluxo normal: em
          aparelhos baixos a faixa comprime junto em vez de sobrepor. */}
      <div className="flex flex-1 flex-col items-center">
        <div aria-hidden className="w-full grow-[2]" />

        <PhaseTitle>{bothReady ? 'Que vença o melhor!' : 'Confirmação de duelo'}</PhaseTitle>

        {/* Espaçador do título até os assentos. */}
        <div aria-hidden className="w-full grow" />

        {/* `items-start` e não `items-center`: os dois assentos nascem na
            MESMA linha de topo, então os avatares ficam à mesma altura
            aconteça o que acontecer com o que vem abaixo deles (um nome
            que quebre em duas linhas, por exemplo). Centrado, o assento
            mais alto puxava o avatar do outro para baixo — era o que
            deixava "Você" mais fundo que o rival. O VS ganha a altura do
            avatar (h-20) para se centrar contra ele, não contra a
            coluna inteira. */}
        <div className="flex w-full items-start justify-around">
          <ReadySeat
            name="Você"
            accent="player"
            confirmed={confirmations.player}
            instant={instant}
          />

          {/* VS central: flareja quando o pacto fecha — devagar, para o
              momento ser saboreado dentro do beat de lock-in. */}
          <div className="relative grid h-20 place-items-center">
            {bothReady && !instant && (
              <motion.span
                className="absolute h-16 w-16 rounded-full border-2 border-gold"
                aria-hidden="true"
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 2.6, opacity: [0, 0.9, 0] }}
                transition={{ duration: 1.0, ease: 'easeOut', delay: 0.1 }}
              />
            )}
            <motion.span
              className="vs-mark text-3xl"
              initial={false}
              animate={bothReady && !instant ? { scale: [1, 1.4, 1.12] } : { scale: 1 }}
              transition={{ duration: 0.9, ease: 'easeOut' }}
            >
              VS
            </motion.span>
          </div>

          <ReadySeat
            name={OPPONENT_ALIAS}
            accent="opponent"
            confirmed={confirmations.opponent}
            instant={instant}
          />
        </div>

        {/* Espaçador inferior: dos assentos até as ações. Mesmo grow do
            de cima → duelistas EXATAMENTE no meio da faixa.

            Sem placa de aposta aqui: o valor do duelo nasce DEPOIS, na
            mesa de negociação — esta fase só sela o pareamento. */}
        <div aria-hidden className="w-full grow" />
      </div>

      {/* Mesma faixa de segurança do CTA da tela de aposta
          (docs/margemdeseguranca.md): w-[min(100%,80vw)] + max-w-96 +
          mx-auto = ~10% lateral no mobile, teto de 24rem no desktop; pb-4
          espelha o respiro inferior. Antes usava w-full e vazava até o
          px-6 do <main>, ignorando a margem lateral. */}
      <div className="mx-auto flex min-h-28 w-[min(100%,80vw)] max-w-96 flex-col justify-end gap-3 pb-4">
        <AnimatePresence mode="wait" initial={false}>
          {bothReady ? (
            <motion.div
              key="locked"
              className="confirm-locked"
              data-testid="confirm-locked"
              role="status"
              initial={instant ? false : { opacity: 0, scale: 0.85, y: 14 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={
                instant
                  ? { duration: 0 }
                  : { type: 'spring', stiffness: 210, damping: 22, mass: 1.1, delay: 0.15 }
              }
            >
              <span className="inline-flex items-center gap-2">
                <Icon name="swords" /> Duelo confirmado
              </span>
            </motion.div>
          ) : confirmations.player ? (
            <motion.div
              key="waiting"
              className="confirm-waiting"
              data-testid="confirm-waiting"
              role="status"
              initial={instant ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
            >
              <span>Aguardando {OPPONENT_ALIAS.toLocaleLowerCase('pt-BR')}</span>
              <span className="waiting-dots" aria-hidden="true">
                <span className="waiting-dot">.</span>
                <span className="waiting-dot">.</span>
                <span className="waiting-dot">.</span>
              </span>
            </motion.div>
          ) : (
            <motion.div
              key="actions"
              // gap-1.5 (0.375rem = 6px): mesmo respiro compacto entre as
              // ações do desfecho (ResultBanner .action-stack--tight),
              // metade do gap-3 padrão — Confirmar e Recusar mais juntos.
              className="flex flex-col gap-1.5"
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <Button onClick={confirmMatch} size="md" fullWidth data-testid="confirm-match">
                <Icon name="check" strokeWidth={2.4} /> CONFIRMAR
              </Button>
              <Button
                variant="secondary"
                onClick={declineMatch}
                size="md"
                fullWidth
                data-testid="decline-match"
              >
                RECUSAR
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
