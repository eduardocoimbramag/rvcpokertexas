import { describe, expect, it } from 'vitest';

import { synthesizeSfx } from '../services/sfxSynth';

const WAV_PREFIX = 'data:audio/wav;base64,';
const SAMPLE_RATE = 22050;
const BYTES_PER_SAMPLE = 2;

/** Bytes de PCM (sem o cabeçalho de 44 bytes) de um data URI WAV. */
function pcmBytes(dataUri: string): number {
  return atob(dataUri.slice(WAV_PREFIX.length)).length - 44;
}

describe('synthesizeSfx', () => {
  it('gera todos os efeitos como data URIs WAV', () => {
    const sfx = synthesizeSfx();
    for (const uri of Object.values(sfx)) {
      expect(uri.startsWith(WAV_PREFIX)).toBe(true);
    }
  });

  it('vitória carrega a celebração da plateia (aplausos por ~2,8s)', () => {
    const sfx = synthesizeSfx();
    // A ovação domina a duração: bem mais longa que a fanfarra (~0,7s).
    expect(pcmBytes(sfx.win)).toBeGreaterThan(2.5 * SAMPLE_RATE * BYTES_PER_SAMPLE);
    expect(pcmBytes(sfx.win)).toBeGreaterThan(pcmBytes(sfx.lose) * 3);
  });
});
