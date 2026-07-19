import { Sheet } from '@/shared/components/Sheet';

import type { SceneQualitySetting } from '../services/GameStorageService';
import { useGameStore } from '../store/gameStore';
import { AudioControls } from './AudioControls';

export interface SettingsSheetProps {
  open: boolean;
  onClose: () => void;
}

const SCENERY_OPTIONS: readonly { value: SceneQualitySetting; label: string }[] = [
  { value: 'high', label: 'Alto' },
  { value: 'low', label: 'Leve' },
  { value: 'off', label: 'Desligado' },
];

/** Ajustes do jogo: áudio, vibração e cenário, persistidos entre sessões. */
export function SettingsSheet({ open, onClose }: SettingsSheetProps) {
  const vibrationEnabled = useGameStore((state) => state.settings.vibrationEnabled);
  const setVibrationEnabled = useGameStore((state) => state.setVibrationEnabled);
  const scenery = useGameStore((state) => state.settings.scenery);
  const setSceneryQuality = useGameStore((state) => state.setSceneryQuality);

  return (
    <Sheet open={open} title="Ajustes" onClose={onClose}>
      <div className="flex flex-col gap-6">
        <AudioControls />

        <label className="flex items-center justify-between gap-4">
          <span className="font-semibold">📳 Vibração</span>
          <input
            type="checkbox"
            checked={vibrationEnabled}
            onChange={(event) => setVibrationEnabled(event.target.checked)}
            className="h-6 w-6 accent-amber-400"
            data-testid="vibration-toggle"
          />
        </label>

        <div className="flex flex-col gap-2">
          <span className="font-semibold">🎭 Cenário e dealer</span>
          <div
            className="grid grid-cols-3 gap-2"
            role="radiogroup"
            aria-label="Qualidade do cenário"
          >
            {SCENERY_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={scenery === option.value}
                onClick={() => setSceneryQuality(option.value)}
                data-testid={`scenery-${option.value}`}
                className={`min-h-11 rounded-xl border-2 text-sm font-bold transition-colors ${
                  scenery === option.value
                    ? 'border-gold bg-gold/15 text-gold'
                    : 'border-arena-line bg-arena-800 text-ivory'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-lavender/70">
            Em aparelhos mais simples, o jogo reduz os efeitos automaticamente.
          </p>
        </div>
      </div>
    </Sheet>
  );
}
