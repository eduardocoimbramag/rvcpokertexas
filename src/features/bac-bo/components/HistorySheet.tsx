import { Sheet } from '@/shared/components/Sheet';
import { formatDelta, formatTime } from '@/shared/lib/format';

import type { HistoryEntry, RoundOutcome } from '../engine/types';
import { useGameStore } from '../store/gameStore';

export interface HistorySheetProps {
  open: boolean;
  onClose: () => void;
}

const OUTCOME_BADGE: Record<RoundOutcome, { label: string; className: string }> = {
  win: { label: 'V', className: 'bg-gold/20 text-gold' },
  lose: { label: 'D', className: 'bg-opponent/20 text-opponent-soft' },
  tie: { label: 'E', className: 'bg-lavender/20 text-lavender' },
};

/** Histórico das últimas rodadas persistidas. */
export function HistorySheet({ open, onClose }: HistorySheetProps) {
  const history = useGameStore((state) => state.history);

  return (
    <Sheet open={open} title="Histórico" onClose={onClose}>
      {history.length === 0 ? (
        <p className="py-8 text-center text-sm text-lavender" data-testid="history-empty">
          Nenhuma rodada jogada ainda. Bora pro primeiro duelo?
        </p>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="history-list">
          {history.map((entry) => (
            <HistoryRow key={entry.id} entry={entry} />
          ))}
        </ul>
      )}
    </Sheet>
  );
}

function HistoryRow({ entry }: { entry: HistoryEntry }) {
  const badge = OUTCOME_BADGE[entry.outcome];
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-arena-line bg-arena-800 px-4 py-3">
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-black ${badge.className}`}
        aria-label={
          entry.outcome === 'win' ? 'Vitória' : entry.outcome === 'lose' ? 'Derrota' : 'Empate'
        }
      >
        {badge.label}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold">
          {entry.playerTotal} × {entry.opponentTotal}
          <span className="font-normal text-lavender"> vs {entry.opponentName}</span>
        </p>
        <p className="text-xs text-lavender/70">
          {formatTime(entry.completedAt)}
          {entry.playerBust ? ' · você estourou' : ''}
          {entry.opponentBust ? ' · o rival estourou' : ''}
          {entry.playerNatural ? ' · blackjack!' : ''}
        </p>
      </div>
      <span
        className={`text-sm font-black tabular-nums ${
          entry.netChange > 0
            ? 'text-gold'
            : entry.netChange < 0
              ? 'text-opponent-soft'
              : 'text-lavender'
        }`}
      >
        {formatDelta(entry.netChange)}
      </span>
    </li>
  );
}
