import { motion } from 'framer-motion';

export interface TableVeilProps {
  /** Movimento reduzido: o véu entra montado, sem rampa de foco. */
  instant: boolean;
}

/**
 * O VÉU DO INTERVALO — a mesa sai de foco para o desfecho entrar nele.
 *
 * Ele existe pela mesma razão do corte de cena do letreiro de rua (ver
 * `body.is-street-cut`): quando a tela tem UMA notícia a dar, tudo o que
 * não é ela vira ruído. No fim de uma mão o feltro continua cheio —
 * cartas, fichas, placas de assento, o pote — e a placa do vencedor
 * disputava a atenção com uma mesa inteira que já não decide nada.
 *
 * ELE DESFOCA O FUNDO, e não a tela: `backdrop-filter` age sobre o que
 * está PINTADO ATRÁS dele, então tudo o que vem depois na ordem de
 * pintura fica nítido — a placa do desfecho (z 12), o relógio da próxima
 * mão e a porta. É a diferença que importa: o corte do letreiro desfoca
 * o `#root` inteiro porque ali não há nada com que interagir; aqui há
 * dois botões sob o polegar, e desfocar o que se precisa tocar seria o
 * inverso do que o véu existe para fazer.
 *
 * A tinta é um radial que fecha nas bordas: o miolo do feltro escurece
 * pouco, as pontas escurecem mais. É um refletor, não uma cortina.
 *
 * `pointer-events: none` é estrutural: o véu cobre o feltro inteiro, e um
 * véu que capturasse toque engoliria o que estiver embaixo dele.
 */
export function TableVeil({ instant }: TableVeilProps) {
  return (
    <motion.div
      className="table-veil"
      data-testid="table-veil"
      aria-hidden="true"
      initial={instant ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={instant ? { duration: 0 } : { duration: 0.3, ease: 'easeOut' }}
    />
  );
}
