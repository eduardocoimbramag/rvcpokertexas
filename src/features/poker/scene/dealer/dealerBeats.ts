import { useEffect, useRef, useState } from 'react';

/**
 * BEATS DE OCIOSIDADE — o antídoto para a crupiê "respirando em loop".
 *
 * O `idle` sozinho é uma única curva que se repete: em dez segundos o
 * olho já decorou o ciclo e a figura vira um GIF. Os beats quebram isso
 * sem tocar na reação: de tempos em tempos um gesto curto entra POR
 * CIMA do idle (um olhar de lado, um alongar de ombros, um sorriso que
 * vai e volta), segura por um instante e devolve o corpo ao repouso.
 *
 * A mecânica é a de rótulos empilhados do framer: o grupo raiz anima
 * `[reacao, beat]`, e cada articulação declara variantes para os dois
 * vocabulários. Quem não tem nada a dizer sobre um beat simplesmente
 * não o declara — e continua na pose da reação. Por isso os beats só
 * valem no `idle`: em qualquer outra reação a cena já tem intenção
 * própria e um gesto solto por cima só atrapalharia.
 */
export const IDLE_BEATS = [
  'repouso',
  /** Olha para a direita da tela (pupilas + leve giro de cabeça). */
  'olharDir',
  /** Olha para a esquerda da tela. */
  'olharEsq',
  /** Inclina a cabeça, curiosa. */
  'inclina',
  /** Um sorriso que aparece e some. */
  'sorriso',
  /** Alonga: sobe o corpo, abre os ombros, respira fundo. */
  'alonga',
  /** Troca o peso de pé — o corpo desliza de leve para um lado. */
  'ajeitaOmbro',
  /** Confere a mesa: olhar e cabeça descem por um instante. */
  'confere',
] as const;

export type IdleBeat = (typeof IDLE_BEATS)[number];

/** Quanto cada gesto fica em cena antes de devolver o corpo ao repouso. */
const DURACAO_MS: Record<Exclude<IdleBeat, 'repouso'>, number> = {
  olharDir: 1500,
  olharEsq: 1500,
  inclina: 1900,
  sorriso: 1400,
  alonga: 2600,
  ajeitaOmbro: 1700,
  confere: 1600,
};

const GESTOS = Object.keys(DURACAO_MS) as Exclude<IdleBeat, 'repouso'>[];

/** Silêncio entre gestos — irregular de propósito: ritmo fixo lê como máquina. */
const PAUSA_MIN_MS = 2600;
const PAUSA_MAX_MS = 6400;

/**
 * Sorteia o próximo gesto EVITANDO repetir o anterior: dois "olhar para
 * a direita" seguidos leem como travamento, não como vida.
 */
function proximoGesto(anterior: IdleBeat): Exclude<IdleBeat, 'repouso'> {
  const opcoes = GESTOS.filter((g) => g !== anterior);
  return opcoes[Math.floor(Math.random() * opcoes.length)] ?? 'olharDir';
}

/**
 * Agenda os gestos de ociosidade enquanto `ativo`. Desligado (reduced
 * motion, cena de baixa qualidade ou qualquer reação que não seja
 * `idle`), devolve `repouso` e não agenda nada.
 */
export function useIdleBeat(ativo: boolean): IdleBeat {
  const [beat, setBeat] = useState<IdleBeat>('repouso');
  const beatRef = useRef<IdleBeat>('repouso');

  useEffect(() => {
    if (!ativo) return;

    let timer: ReturnType<typeof setTimeout>;

    const agendarGesto = () => {
      const pausa = PAUSA_MIN_MS + Math.random() * (PAUSA_MAX_MS - PAUSA_MIN_MS);
      timer = setTimeout(() => {
        const gesto = proximoGesto(beatRef.current);
        beatRef.current = gesto;
        setBeat(gesto);
        timer = setTimeout(() => {
          beatRef.current = 'repouso';
          setBeat('repouso');
          agendarGesto();
        }, DURACAO_MS[gesto]);
      }, pausa);
    };

    agendarGesto();
    // Ao desligar (reação saiu do idle), o gesto em curso é abortado e o
    // corpo volta ao repouso — a nova reação assume tudo a partir dali.
    return () => {
      clearTimeout(timer);
      beatRef.current = 'repouso';
      setBeat('repouso');
    };
  }, [ativo]);

  return ativo ? beat : 'repouso';
}
