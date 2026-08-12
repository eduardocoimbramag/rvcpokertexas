import { motion } from 'framer-motion';
import { useState } from 'react';

export interface HandoverClockProps {
  /** Segundos que faltam para a mesa distribuir de novo. */
  seconds: number;
  /**
   * De quantos segundos era o intervalo. A barra se mede por ele — depois
   * de uma desistência o intervalo é mais curto, e uma barra medida por um
   * total fixo nasceria pela metade.
   */
  total: number;
  /**
   * O que este relógio promete. O padrão é a próxima mão, que é o uso de
   * origem; a escolha de cadeira promete outra coisa com a mesma barra.
   */
  label?: string;
  /** Distingue os dois relógios em cena — nunca há dois ao mesmo tempo. */
  testId?: string;
  instant: boolean;
}

/**
 * O RELÓGIO DO INTERVALO — os segundos até a mesa distribuir a próxima
 * mão.
 *
 * Ele é a mesma barra do relógio da vez, e de propósito: a linguagem do
 * tempo na mesa é uma só. O que muda é o que ela promete — ali a mesa
 * joga por você, aqui ela só continua.
 *
 * Ele morava dentro da arena do duelo. Saiu de lá quando a mesa de seis
 * passou a ter o mesmo intervalo entre mãos: a peça é a mesma nas duas
 * mesas, e duas cópias sairiam de sincronia na primeira vez que alguém
 * mexesse na barra.
 *
 * A BARRA É UMA VARREDURA SÓ, de cheia a vazia, e não um degrau por
 * segundo. Ela andava ATRÁS do contador: a cada tique o alvo passava a
 * ser `restam/total` e a animação levava um segundo inteiro para chegar
 * lá — no último tique ela mirava 1/5 e a tela fechava com um quinto de
 * barra ainda aceso. O número zerava e o desenho dizia que ainda havia
 * tempo.
 *
 * Uma animação contínua de 1 a 0 pelos N segundos não tem como se
 * desencontrar do relógio que a gerou: as duas pontas são o mesmo
 * instante. É a MESMA lição que o convite de mostrar a mão já tinha
 * aprendido (ver `ShowCardsPrompt`), e que esta peça repetia por não
 * tê-la herdado.
 *
 * O ponto de partida é CONGELADO no monte (`useState` com inicializador):
 * o componente re-renderiza a cada segundo com um `seconds` novo, e uma
 * duração derivada dele reiniciaria a varredura a cada tique — que é
 * exatamente o defeito que ela existe para acabar.
 */
export function HandoverClock({
  seconds,
  total,
  label,
  testId = 'handover-clock',
  instant,
}: HandoverClockProps) {
  /* O instante do MONTE, congelado: de onde a barra parte e quanto ela
     tem para chegar a zero. Ele tolera um monte no meio da contagem — se
     o relógio já estiver em 3 de 5, a barra nasce em 60% e leva 3s. */
  const [partida] = useState(() => ({
    from: Math.max(0, Math.min(1, seconds / Math.max(1, total))),
    duration: Math.max(0, seconds),
  }));
  const texto = label ?? `Próxima mão em ${seconds}s`;

  return (
    <div className="handover-clock" data-testid={testId} role="timer" aria-label={texto}>
      <span className="handover-clock__track" aria-hidden="true">
        <motion.span
          className="handover-clock__bar"
          initial={{ scaleX: instant ? 0 : partida.from }}
          animate={{ scaleX: 0 }}
          transition={instant ? { duration: 0 } : { duration: partida.duration, ease: 'linear' }}
        />
      </span>
      <span className="handover-clock__label">{texto}</span>
    </div>
  );
}
