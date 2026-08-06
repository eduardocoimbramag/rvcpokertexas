import { motion } from 'framer-motion';

import type { Duelist } from '../../engine/types';
import { Monogram } from '../AvatarBadge';

export interface SeatMedallionProps {
  side: Duelist;
  name: string;
  /** Movimento reduzido: o medalhão aparece montado. */
  instant: boolean;
  /** Se definido, o medalhão vira botão e abre o perfil (rival). */
  onOpenProfile?: () => void;
}

/**
 * Medalhão de duelista ladeando a crupiê no desfecho — o retrato de
 * cada lado da mesa, à altura dos ombros dela: o seu à esquerda, com o
 * aro azul da casa; o do rival à direita, com o aro vermelho.
 *
 * SEM NOME embaixo, de propósito: quem diz quem é quem é a placa logo
 * abaixo, e repetir o nome a meia tela de distância só ocuparia o feltro.
 *
 * O do rival é um BOTÃO, e é o único lugar do duelo 1v1 em que o perfil
 * dele abre: aqui a mão já foi jogada e o valor há muito está travado —
 * não há mais nada a combinar (ver opponentIdentity.ts).
 *
 * Mora em `table/` porque as DUAS mesas do jogo terminam com ele: a de
 * Texas Hold'em do 1v1 e a de 21 do torneio. O desfecho é a única cena
 * que as duas compartilham inteira.
 */
export function SeatMedallion({ side, name, instant, onOpenProfile }: SeatMedallionProps) {
  const player = side === 'player';
  /* Entra junto com a placa do seu lado, um beat antes dela: o
     medalhão desliza da borda e a placa assenta em seguida. */
  const enter = {
    initial: instant ? false : { opacity: 0, x: player ? -20 : 20, scale: 0.85 },
    animate: { opacity: 1, x: 0, scale: 1 },
    transition: instant
      ? { duration: 0 }
      : { type: 'spring' as const, stiffness: 300, damping: 22, delay: 0.22 },
  };
  const face = <Monogram name={name} you={player} />;
  const className = `seat-medallion seat-medallion--${side}`;

  if (!onOpenProfile) {
    return (
      <motion.span
        className={className}
        data-testid={`seat-medallion-${side}`}
        aria-hidden="true"
        {...enter}
      >
        {face}
      </motion.span>
    );
  }

  return (
    <motion.button
      type="button"
      className={`${className} seat-medallion--link`}
      data-testid={`seat-medallion-${side}`}
      aria-label={`Ver perfil de ${name}`}
      title={`Ver perfil de ${name}`}
      onClick={onOpenProfile}
      whileTap={instant ? undefined : { scale: 0.9 }}
      {...enter}
    >
      {face}
    </motion.button>
  );
}
