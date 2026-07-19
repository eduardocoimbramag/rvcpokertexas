import { useGameStore } from '../store/gameStore';

/** Controles de áudio: mute geral e volumes de música e efeitos. */
export function AudioControls() {
  const audio = useGameStore((state) => state.settings.audio);
  const updateAudioSettings = useGameStore((state) => state.updateAudioSettings);

  return (
    <div className="flex flex-col gap-4">
      <label className="flex items-center justify-between gap-4">
        <span className="font-semibold">🔇 Silenciar tudo</span>
        <input
          type="checkbox"
          checked={audio.muted}
          onChange={(event) => updateAudioSettings({ muted: event.target.checked })}
          className="h-6 w-6 accent-amber-400"
          data-testid="mute-toggle"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-lavender">🎵 Música</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={audio.musicVolume}
          disabled={audio.muted}
          onChange={(event) => updateAudioSettings({ musicVolume: Number(event.target.value) })}
          className="accent-amber-400"
          aria-label="Volume da música"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-lavender">🔊 Efeitos sonoros</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={audio.sfxVolume}
          disabled={audio.muted}
          onChange={(event) => updateAudioSettings({ sfxVolume: Number(event.target.value) })}
          className="accent-amber-400"
          aria-label="Volume dos efeitos sonoros"
        />
      </label>
    </div>
  );
}
