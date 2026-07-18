import { Howl, Howler } from 'howler';

import type { AudioSettings } from './GameStorageService';
import type { SfxName } from './sfxSynth';
import { synthesizeMusicLoop, synthesizeSfx } from './sfxSynth';

/**
 * Gerenciador central de áudio (música + SFX) sobre Howler.js.
 *
 * - Inicialização lazy: os sons só são sintetizados/criados no primeiro
 *   gesto do usuário (política de autoplay dos navegadores).
 * - Tolerante a falhas: qualquer erro de áudio é engolido — som nunca
 *   pode quebrar o jogo.
 * - Em ambiente de teste (Vitest) permanece inerte.
 */
class AudioManager {
  private sfx = new Map<SfxName, Howl>();
  private music: Howl | null = null;
  private initialized = false;
  private settings: AudioSettings = { muted: false, musicVolume: 0.4, sfxVolume: 0.8 };

  /** Cria os Howls a partir dos sons sintetizados. Idempotente. */
  init(): void {
    if (this.initialized || isTestEnvironment()) return;
    this.initialized = true;
    try {
      const sources = synthesizeSfx();
      for (const [name, src] of Object.entries(sources) as [SfxName, string][]) {
        this.sfx.set(name, new Howl({ src: [src], format: ['wav'], preload: true }));
      }
      this.music = new Howl({
        src: [synthesizeMusicLoop()],
        format: ['wav'],
        loop: true,
        preload: true,
      });
      this.applySettings(this.settings);
    } catch {
      // Sem áudio o jogo segue funcional.
    }
  }

  /** Aplica configurações de volume/mute vindas das Settings persistidas. */
  applySettings(settings: AudioSettings): void {
    this.settings = settings;
    try {
      Howler.mute(settings.muted);
      this.music?.volume(settings.musicVolume);
      for (const howl of this.sfx.values()) {
        howl.volume(settings.sfxVolume);
      }
    } catch {
      // Ignorado: áudio é best-effort.
    }
  }

  playSfx(name: SfxName): void {
    this.init();
    try {
      this.sfx.get(name)?.play();
    } catch {
      // Ignorado: áudio é best-effort.
    }
  }

  /**
   * Fala um texto curto via Web Speech API (voz do countdown).
   * Best-effort como todo o áudio: sem suporte ou mutado, silêncio.
   */
  speak(text: string): void {
    if (isTestEnvironment() || this.settings.muted) return;
    try {
      const synth = window.speechSynthesis;
      if (!synth) return;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 0.85;
      utterance.volume = this.settings.sfxVolume;
      // Cancela a fala anterior: os ticks nunca podem se atropelar.
      synth.cancel();
      synth.speak(utterance);
    } catch {
      // Ignorado: áudio é best-effort.
    }
  }

  startMusic(): void {
    this.init();
    try {
      if (this.music && !this.music.playing()) {
        this.music.play();
      }
    } catch {
      // Ignorado: áudio é best-effort.
    }
  }

  stopMusic(): void {
    try {
      this.music?.stop();
    } catch {
      // Ignorado: áudio é best-effort.
    }
  }
}

function isTestEnvironment(): boolean {
  return typeof import.meta.env !== 'undefined' && import.meta.env.MODE === 'test';
}

/** Instância única compartilhada por toda a aplicação. */
export const audioManager = new AudioManager();
