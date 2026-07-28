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

  it('o aplauso da vitória é uma ovação longa, separada da fanfarra', () => {
    const sfx = synthesizeSfx();
    // A ovação (~3,4s) vive no próprio efeito `applause`; o `win` volta a
    // ser só a fanfarra (~0,7s) e os dois tocam juntos na vitória.
    expect(pcmBytes(sfx.applause)).toBeGreaterThan(3 * SAMPLE_RATE * BYTES_PER_SAMPLE);
    expect(pcmBytes(sfx.applause)).toBeGreaterThan(pcmBytes(sfx.win) * 3);
  });

  it('as rodadas do melhor de 3 têm cues curtos, sem plateia', () => {
    const sfx = synthesizeSfx();
    // Meio segundo de cue: bem mais curto que a ovação da série fechada.
    expect(pcmBytes(sfx.roundWin)).toBeLessThan(1 * SAMPLE_RATE * BYTES_PER_SAMPLE);
    expect(pcmBytes(sfx.roundLose)).toBeLessThan(1 * SAMPLE_RATE * BYTES_PER_SAMPLE);
  });
});
