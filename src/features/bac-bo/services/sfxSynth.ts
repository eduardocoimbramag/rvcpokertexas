/**
 * Síntese procedural dos efeitos sonoros do jogo.
 *
 * O projeto não depende de assets binários: todos os sons são gerados em
 * runtime como WAV PCM 16-bit codificado em data URI, consumido pelo Howler.
 * Cada função é pura (amostras entram, amostras saem).
 */

const SAMPLE_RATE = 22050;

type Envelope = { attack: number; release: number };

/** Gera um tom senoidal com sweep opcional de frequência e envelope linear. */
function tone(
  freqStart: number,
  freqEnd: number,
  durationSec: number,
  volume: number,
  envelope: Envelope = { attack: 0.01, release: 0.08 },
): Float32Array {
  const length = Math.floor(SAMPLE_RATE * durationSec);
  const samples = new Float32Array(length);
  let phase = 0;
  for (let i = 0; i < length; i += 1) {
    const t = i / length;
    const freq = freqStart + (freqEnd - freqStart) * t;
    phase += (2 * Math.PI * freq) / SAMPLE_RATE;
    samples[i] = Math.sin(phase) * volume * envelopeGain(i / SAMPLE_RATE, durationSec, envelope);
  }
  return samples;
}

/** Gera ruído branco com envelope (usado para o chocalhar dos dados). */
function noise(durationSec: number, volume: number, envelope: Envelope): Float32Array {
  const length = Math.floor(SAMPLE_RATE * durationSec);
  const samples = new Float32Array(length);
  let last = 0;
  for (let i = 0; i < length; i += 1) {
    // Filtro passa-baixa simples para um ruído menos áspero.
    const white = Math.random() * 2 - 1;
    last = 0.6 * last + 0.4 * white;
    samples[i] = last * volume * envelopeGain(i / SAMPLE_RATE, durationSec, envelope);
  }
  return samples;
}

function envelopeGain(timeSec: number, durationSec: number, { attack, release }: Envelope): number {
  if (timeSec < attack) return timeSec / attack;
  const releaseStart = durationSec - release;
  if (timeSec > releaseStart) return Math.max(0, (durationSec - timeSec) / release);
  return 1;
}

/** Concatena trechos de áudio em sequência. */
function sequence(...parts: Float32Array[]): Float32Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** Mistura trechos de áudio simultâneos (soma com clamp). */
function mix(...parts: Float32Array[]): Float32Array {
  const length = Math.max(...parts.map((part) => part.length));
  const out = new Float32Array(length);
  for (const part of parts) {
    for (let i = 0; i < part.length; i += 1) {
      out[i] = clamp((out[i] ?? 0) + (part[i] ?? 0), -1, 1);
    }
  }
  return out;
}

function silence(durationSec: number): Float32Array {
  return new Float32Array(Math.floor(SAMPLE_RATE * durationSec));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Codifica amostras [-1, 1] como WAV PCM 16-bit mono em data URI base64. */
function encodeWavDataUri(samples: Float32Array): string {
  const headerSize = 44;
  const dataSize = samples.length * 2;
  const buffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Tamanho do chunk fmt
  view.setUint16(20, 1, true); // PCM linear
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true); // Byte rate
  view.setUint16(32, 2, true); // Block align
  view.setUint16(34, 16, true); // Bits por amostra
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  for (let i = 0; i < samples.length; i += 1) {
    const clamped = clamp(samples[i] ?? 0, -1, 1);
    view.setInt16(headerSize + i * 2, Math.round(clamped * 0x7fff), true);
  }

  return `data:audio/wav;base64,${bytesToBase64(new Uint8Array(buffer))}`;
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i += 1) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export type SfxName =
  | 'tap'
  | 'stake'
  | 'found'
  | 'ready'
  | 'locked'
  | 'countdownTick'
  | 'countdownGo'
  | 'roll'
  | 'reveal'
  | 'win'
  | 'lose'
  | 'tie';

/** Sintetiza todos os efeitos sonoros do jogo como data URIs WAV. */
export function synthesizeSfx(): Record<SfxName, string> {
  const rattle = sequence(
    noise(0.12, 0.5, { attack: 0.005, release: 0.06 }),
    silence(0.05),
    noise(0.1, 0.4, { attack: 0.005, release: 0.05 }),
    silence(0.07),
    noise(0.14, 0.55, { attack: 0.005, release: 0.07 }),
    silence(0.04),
    noise(0.09, 0.35, { attack: 0.005, release: 0.05 }),
  );

  return {
    tap: encodeWavDataUri(tone(620, 620, 0.07, 0.5, { attack: 0.005, release: 0.04 })),
    stake: encodeWavDataUri(tone(520, 780, 0.12, 0.5, { attack: 0.005, release: 0.06 })),
    found: encodeWavDataUri(
      sequence(tone(660, 660, 0.12, 0.5), silence(0.03), tone(880, 880, 0.18, 0.5)),
    ),
    /* Check de confirmação: "clique" curto subindo para um sino. */
    ready: encodeWavDataUri(
      sequence(
        tone(740, 740, 0.06, 0.45, { attack: 0.004, release: 0.03 }),
        tone(1175, 1175, 0.14, 0.5, { attack: 0.005, release: 0.09 }),
      ),
    ),
    /* Duelo travado: tríade firme fechando o pacto entre os dois lados. */
    locked: encodeWavDataUri(
      sequence(
        tone(392, 392, 0.09, 0.5),
        tone(587, 587, 0.09, 0.5),
        tone(784, 784, 0.22, 0.55, { attack: 0.008, release: 0.14 }),
      ),
    ),
    countdownTick: encodeWavDataUri(tone(880, 880, 0.08, 0.5, { attack: 0.005, release: 0.05 })),
    countdownGo: encodeWavDataUri(tone(988, 1319, 0.22, 0.55, { attack: 0.01, release: 0.12 })),
    roll: encodeWavDataUri(rattle),
    reveal: encodeWavDataUri(tone(330, 990, 0.22, 0.45, { attack: 0.01, release: 0.1 })),
    win: encodeWavDataUri(
      sequence(
        tone(523, 523, 0.13, 0.5),
        tone(659, 659, 0.13, 0.5),
        tone(784, 784, 0.13, 0.5),
        tone(1047, 1047, 0.3, 0.55, { attack: 0.01, release: 0.18 }),
      ),
    ),
    lose: encodeWavDataUri(
      sequence(
        tone(392, 392, 0.16, 0.45),
        tone(330, 330, 0.16, 0.45),
        tone(262, 262, 0.32, 0.45, { attack: 0.01, release: 0.2 }),
      ),
    ),
    tie: encodeWavDataUri(
      sequence(tone(494, 494, 0.14, 0.45), silence(0.05), tone(494, 494, 0.2, 0.45)),
    ),
  };
}

/** Sintetiza a música ambiente: um pad em loop com acordes suaves. */
export function synthesizeMusicLoop(): string {
  const chordAm = [220.0, 261.63, 329.63];
  const chordF = [174.61, 220.0, 261.63];
  const pad = (freqs: number[], durationSec: number) =>
    mix(...freqs.map((freq) => tone(freq, freq, durationSec, 0.16, { attack: 0.6, release: 0.9 })));
  return encodeWavDataUri(sequence(pad(chordAm, 4), pad(chordF, 4)));
}
