import { motion, useReducedMotion } from 'framer-motion';

import { TIMINGS } from '../animations/timings';
import type { DieValue, Match, RoundResult } from '../engine/types';
import type { GamePhase } from '../store/gameStore';
import { useGameStore } from '../store/gameStore';
import { DiceShaker } from './DiceShaker';

export interface DiceArenaProps {
  phase: GamePhase;
  match: Match;
  result: RoundResult | null;
}

/**
 * Zona de dados fabricada na mesa: quatro poços em grade 2×2 rebaixados
 * direto no couro da cabeceira — azuis do jogador à esquerda, vermelhos
 * do oponente à direita. Em rolling/reveal a zona fica ancorada no topo
 * (o mesmo lugar físico da mesa); em completed ela desce e centra no
 * couro livre entre o trilho e o banner de resultado.
 *
 * Na revelação os poços param um a um, na ordem dramática azul de baixo
 * → vermelho de baixo → vermelho de cima → azul de cima (SETTLE_STEP ×
 * revealStaggerMs). Valores e totais vêm sempre da engine (`result`);
 * os totais só abrem em `completed`, depois que o último dado assentou.
 *
 * Placar em dois formatos, seguindo a câmera:
 * - rolling/reveal (câmera vertical): nome + total impressos no couro
 *   sob cada coluna, como o PLAYER/BANKER das mesas reais.
 * - completed (câmera frontal): os poços descem e o placar sobe para
 *   duas placas flanqueando a cabeça da dealer — nome em cima, total
 *   embaixo, coroa no vencedor. Com cenário desligado não há dealer e o
 *   placar permanece sob as colunas.
 */

/** Posição de cada poço na ordem de parada (multiplica o stagger). */
const SETTLE_STEP = {
  topLeft: 3,
  topRight: 2,
  bottomLeft: 0,
  bottomRight: 1,
} as const;

interface ScorePlateProps {
  side: 'player' | 'opponent';
  avatar: string;
  name: string;
  total: number;
  winner: boolean;
  instant: boolean;
}

/** Placa de placar ao lado da dealer: nome em cima, total embaixo. */
function ScorePlate({ side, avatar, name, total, winner, instant }: ScorePlateProps) {
  const player = side === 'player';
  return (
    <motion.div
      className={`score-plate ${player ? 'score-plate--player' : 'score-plate--opponent'} ${winner ? 'score-plate--winner' : ''}`}
      data-testid={`score-plate-${side}`}
      initial={instant ? false : { opacity: 0, x: player ? -28 : 28 }}
      animate={{ opacity: 1, x: 0 }}
      transition={
        instant ? { duration: 0 } : { type: 'spring', stiffness: 300, damping: 22, delay: 0.35 }
      }
    >
      {winner && (
        <motion.span
          className="score-plate__crown"
          aria-hidden="true"
          initial={instant ? false : { opacity: 0, y: 8, scale: 0.5 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={
            instant ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 15, delay: 0.7 }
          }
        >
          👑
        </motion.span>
      )}
      <span className="score-plate__name">
        {avatar} {name}
      </span>
      <span className="score-plate__total" data-testid={`${player ? 'player' : 'opponent'}-total`}>
        {total}
      </span>
    </motion.div>
  );
}

export function DiceArena({ phase, match, result }: DiceArenaProps) {
  const rolling = phase === 'rolling';
  const revealed = phase === 'reveal' || phase === 'completed';
  const completed = phase === 'completed';
  const reducedMotion = useReducedMotion() ?? false;
  const scenery = useGameStore((state) => state.settings.scenery);
  // Câmera vertical (rolling/reveal): a zona de dados cresce de leve,
  // como se a câmera tivesse descido mais perto da mesa.
  const overhead = rolling || phase === 'reveal';
  // Placar flanqueando a dealer: só na câmera frontal do resultado e
  // com o cenário ligado (sem cenário não há dealer para flanquear).
  const flankScoreboard = completed && result !== null && scenery !== 'off';

  const playerDice: readonly (DieValue | null)[] =
    revealed && result ? result.playerDice : [null, null];
  const opponentDice: readonly (DieValue | null)[] =
    revealed && result ? result.opponentDice : [null, null];

  const shared = { rolling, revealed, forceSettled: completed } as const;
  const stagger = TIMINGS.revealStaggerMs;

  return (
    // Em completed os poços descem ao centro VISUAL da mesa (não ao
    // centro do couro-livre): como o couro segue até a base atrás dos
    // botões, centralizar no couro-livre deixaria os dados altos. Os
    // dois espaçadores com grow 3:2 enviesam a grade ~60% para baixo, e
    // encolhem sozinhos em telas baixas (o dealer-spacer cede primeiro).
    // Nas demais fases os poços ficam ancorados no topo (parte da mesa).
    <div
      className={`flex flex-1 flex-col items-center pt-1 ${flankScoreboard ? '' : 'justify-start'}`}
    >
      {flankScoreboard && <div aria-hidden className="w-full grow-[3]" />}

      {flankScoreboard && result && (
        <>
          <ScorePlate
            side="player"
            avatar="🫵"
            name="Você"
            total={result.playerTotal}
            winner={result.playerTotal > result.opponentTotal}
            instant={reducedMotion}
          />
          <ScorePlate
            side="opponent"
            avatar={match.opponent.avatar}
            name={match.opponent.name}
            total={result.opponentTotal}
            winner={result.opponentTotal > result.playerTotal}
            instant={reducedMotion}
          />
        </>
      )}

      <motion.div
        layout={!reducedMotion}
        // place-items-center: os poços têm largura fixa (--shaker-size),
        // mas a linha de rótulos (Você/Bruno + total) é mais larga e
        // infla as duas trilhas do grid. Sem centralizar o item na
        // trilha, cada poço encostaria na borda esquerda da sua trilha
        // inflada e o PAR de dados pareceria deslocado à esquerda (mais
        // visível no mobile, onde os nomes ocupam proporção maior). Com
        // place-items-center o dado e o rótulo centram na própria trilha,
        // e o par fica perfeitamente no eixo da tela.
        className="grid grid-cols-2 place-items-center gap-x-8 gap-y-4"
        initial={false}
        animate={{ scale: reducedMotion ? 1 : overhead ? 1.08 : 1 }}
        transition={
          reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 180, damping: 22 }
        }
      >
        <DiceShaker
          {...shared}
          value={playerDice[0] ?? null}
          side="player"
          settleDelayMs={SETTLE_STEP.topLeft * stagger}
          seed={SETTLE_STEP.topLeft}
          label="Seu dado 1"
        />
        <DiceShaker
          {...shared}
          value={opponentDice[0] ?? null}
          side="opponent"
          settleDelayMs={SETTLE_STEP.topRight * stagger}
          seed={SETTLE_STEP.topRight}
          label="Dado 1 do oponente"
        />
        <DiceShaker
          {...shared}
          value={playerDice[1] ?? null}
          side="player"
          settleDelayMs={SETTLE_STEP.bottomLeft * stagger}
          seed={SETTLE_STEP.bottomLeft}
          label="Seu dado 2"
        />
        <DiceShaker
          {...shared}
          value={opponentDice[1] ?? null}
          side="opponent"
          settleDelayMs={SETTLE_STEP.bottomRight * stagger}
          seed={SETTLE_STEP.bottomRight}
          label="Dado 2 do oponente"
        />

        {/* Nome sob cada coluna (câmera vertical); o TOTAL só aparece
            quando a engine revela o resultado — antes disso não há
            placeholder nenhum, só o nome. Em completed o placar migra
            para as placas ao lado da dealer — exceto com o cenário
            desligado, quando o número fica aqui mesmo. */}
        {!flankScoreboard && (
          <>
            <div className="flex items-baseline justify-center gap-2">
              <span className="text-engraved text-sm font-black uppercase tracking-widest text-[#1e3a8a]">
                🫵 Você
              </span>
              {completed && result && (
                <span
                  className="text-engraved text-3xl font-black tabular-nums text-[#1e3a8a]"
                  data-testid="player-total"
                >
                  {result.playerTotal}
                </span>
              )}
            </div>
            <div className="flex items-baseline justify-center gap-2">
              <span className="text-engraved text-sm font-black uppercase tracking-widest text-[#7f1d1d]">
                {match.opponent.avatar} {match.opponent.name}
              </span>
              {completed && result && (
                <span
                  className="text-engraved text-3xl font-black tabular-nums text-[#7f1d1d]"
                  data-testid="opponent-total"
                >
                  {result.opponentTotal}
                </span>
              )}
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
