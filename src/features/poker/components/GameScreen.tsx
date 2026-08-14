import { AnimatePresence, motion } from 'framer-motion';

import { Button } from '@/shared/components/Button';
import { Icon } from '@/shared/components/Icon';

import type { SceneCamera } from '../scene/TableScene';
import { TableScene } from '../scene/TableScene';
import { useDealerReaction } from '../scene/dealer/useDealerReaction';
import type { GamePhase } from '../store/gameStore';
import { useGameStore } from '../store/gameStore';
import { BalancePill } from './BalancePill';
import { TableTools } from './table/TableTools';
import { ConfirmPanel } from './ConfirmPanel';
import { CountdownOverlay } from './CountdownOverlay';
import { FoundSplash } from './FoundSplash';
import { GoldAnnounce } from './GoldAnnounce';
import { MatchmakingOverlay } from './MatchmakingOverlay';
import { SessionBanner } from './SessionBanner';
import { PokerArena } from './poker/PokerArena';
import { StreetAnnounce } from './poker/StreetAnnounce';

/** Fases em que as fichas estão no feltro — a pílula segue o STACK. */
const SESSION_PHASES: readonly GamePhase[] = ['dealing', 'betting', 'settle', 'handover'];

/** Fases em que a mão está sobre a mesa (grupo arena). */
const ARENA_PHASES: readonly GamePhase[] = [
  'dealing',
  'betting',
  'settle',
  // O beat entre as mãos é da MESA: a placa do vencedor e o convite de
  // mostrar as cartas ficam sobre o feltro, e a sessão segue dali.
  'handover',
  'completed',
];

/**
 * Tela de jogo: renderiza o conteúdo correspondente à fase atual da
 * máquina de estados. Não há navegação "voltar" — cada fase tem a sua
 * saída própria (cancelar a busca, recusar o duelo, desistir da mesa).
 */
export function GameScreen() {
  const phase = useGameStore((state) => state.phase);
  const balance = useGameStore((state) => state.balance);
  const match = useGameStore((state) => state.match);
  const round = useGameStore((state) => state.round);
  const actionPending = useGameStore((state) => state.actionPending);
  const result = useGameStore((state) => state.result);
  const session = useGameStore((state) => state.session);
  const showPrompt = useGameStore((state) => state.showPrompt);
  const handoverSeconds = useGameStore((state) => state.handoverSeconds);
  const handoverTotal = useGameStore((state) => state.handoverTotal);
  const cardsShown = useGameStore((state) => state.cardsShown);
  const answerShowCards = useGameStore((state) => state.answerShowCards);
  const leaveTable = useGameStore((state) => state.leaveTable);
  const fold = useGameStore((state) => state.fold);
  const check = useGameStore((state) => state.check);
  const call = useGameStore((state) => state.call);
  const raise = useGameStore((state) => state.raise);
  const announce = useGameStore((state) => state.announce);
  const streetAnnounce = useGameStore((state) => state.streetAnnounce);
  const actionClock = useGameStore((state) => state.actionClock);
  const countdown = useGameStore((state) => state.countdown);
  const duelAnnounce = useGameStore((state) => state.duelAnnounce);
  const error = useGameStore((state) => state.error);
  const dismissError = useGameStore((state) => state.dismissError);
  const dealerReaction = useDealerReaction();

  /* A PÍLULA DE SALDO SAI DE CENA ENQUANTO A SESSÃO CORRE.
     O buy-in já saiu do saldo quando você sentou, e o que está em jogo
     está desenhado na mesa: as duas pilhas de fichas e os dois números
     nas plaquinhas. Um terceiro número no canto — o saldo parado do lado
     de fora — não participa de decisão nenhuma e ainda compete com os
     que participam. Ele volta quando a mesa fecha, que é quando o
     dinheiro volta a ser dinheiro: no caixa, nos menus e no extrato. */
  const atTable = SESSION_PHASES.includes(phase);
  const balanceDelta =
    phase === 'completed' && session ? session.stacks.player - session.buyIn : null;

  return (
    // min-h-0: o viewport é fixo (#root overflow hidden) — a fase de
    // negociação rola DENTRO do chat, nunca estica a página.
    <main className="flex min-h-0 flex-1 flex-col px-6 py-4">
      {/* relative z-20: na câmera vertical a mesa toma a tela inteira
          (o recorte da cena sobe além do header) — o HUD flutua acima.
          O vão à esquerda é reservado, e não colapsado: o saldo fica na
          MESMA coluna em todas as fases, e nada dança de lugar quando a
          cena muda. */}
      <header className="relative z-20 mb-4 flex items-center justify-between gap-3">
        {atTable && match ? (
          /* NA MESA o cabeçalho é das FERRAMENTAS: o valor das fichas à
             esquerda, o extrato da sessão à direita. É o único lugar da
             tela que não disputa com nada — o feltro é do jogo e a faixa
             de baixo é do polegar —, e é justamente onde o saldo deixou
             de estar quando a sessão começou. */
          <TableTools table={match.id} />
        ) : (
          <>
            <span className="h-11 w-11" aria-hidden="true" />
            <BalancePill balance={balance} delta={balanceDelta} />
          </>
        )}
      </header>

      {/* A TableScene fica FORA do AnimatePresence: a crupiê e a mesa
          persistem entre as fases (só a reação muda, com blend). */}
      <TableScene reaction={dealerReaction} camera={cameraFor(phase)}>
        <AnimatePresence mode="wait">
          <motion.div
            key={phaseGroup(phase)}
            className="flex min-h-0 flex-1 flex-col"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}
          >
            {phase === 'search' && <MatchmakingOverlay />}
            {phase === 'confirm' && match && <ConfirmPanel />}
            {/* A fase da APRESENTAÇÃO tem duas cenas, e o store diz qual
                está no ar: a placa do rival — que aqui, com a aposta já
                fechada, enfim traz o nome dele (ver opponentIdentity.ts)
                — e, na sequência, o carimbo que abre o duelo. */}
            {phase === 'found' && match && (
              <div className="relative flex min-h-0 flex-1 flex-col">
                {duelAnnounce ? (
                  <GoldAnnounce text="Hora do duelo" data-testid="duel-announce" />
                ) : (
                  <FoundSplash match={match} />
                )}
              </div>
            )}
            {phase === 'countdown' && <CountdownOverlay value={countdown} />}
            {ARENA_PHASES.includes(phase) && match && (
              // relative: o banner de resultado se sobrepõe à mesa em vez
              // de disputar o flex com as mãos — as cartas não pulam de
              // lugar quando o veredito entra.
              <div className="relative flex flex-1 flex-col">
                <PokerArena
                  phase={phase}
                  match={match}
                  round={round}
                  result={result}
                  onFold={fold}
                  onCheck={check}
                  onCall={call}
                  onRaise={raise}
                  actionPending={actionPending}
                  clock={actionClock}
                  announce={announce}
                  session={session}
                  showPrompt={showPrompt}
                  handoverSeconds={handoverSeconds}
                  handoverTotal={handoverTotal}
                  cardsShown={cardsShown}
                  onAnswerShowCards={answerShowCards}
                  onLeaveTable={leaveTable}
                />
                {/* O CAIXA da sessão, e não o veredito de uma mão: numa
                    mesa que corre até alguém quebrar, quem ganhou a
                    última mão não é o assunto (ver SessionBanner). */}
                {phase === 'completed' && session && match && <SessionBanner session={session} />}
              </div>
            )}
            {phase === 'error' && (
              <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
                {/* Tinta de vinho gravada, como o texto de erro abaixo. */}
                <Icon name="warning" size={52} className="text-[#7a1f28]" />
                <p
                  className="text-engraved text-lg font-extrabold text-[#123324]"
                  role="alert"
                  data-testid="error-message"
                >
                  {error ?? 'Algo deu errado.'}
                </p>
                <Button onClick={dismissError} data-testid="dismiss-error">
                  Tentar novamente
                </Button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </TableScene>

      {/* O LETREIRO DA RUA mora aqui em cima, fora da cena do jogo, e não
          é frescura de organização: ele desfoca a TELA INTEIRA, e a cena
          inteira vive num contexto de empilhamento abaixo do cabeçalho.
          Nascido lá dentro, ele jamais passaria por cima da pílula de
          saldo — e meia tela fora de foco com um HUD nítido no canto não
          é um corte de cena. Ver StreetAnnounce. */}
      <StreetAnnounce street={streetAnnounce} />
    </main>
  );
}

/**
 * Agrupa fases que compartilham o mesmo layout para a transição de tela
 * não desmontar as cartas entre dealing → betting → … → completed.
 */
function phaseGroup(phase: GamePhase): string {
  return ARENA_PHASES.includes(phase) ? 'arena' : phase;
}

/**
 * Enquadramento por fase: câmera vertical sobre o feltro enquanto a mão
 * é distribuída, apostada e revelada; frontal em todo o resto, e em
 * `completed` a crupiê volta ao quadro reagindo ao resultado.
 */
function cameraFor(phase: GamePhase): SceneCamera {
  return phase !== 'completed' && ARENA_PHASES.includes(phase) ? 'overhead' : 'front';
}
