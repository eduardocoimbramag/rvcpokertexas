import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';

import type { Street } from '../../engine/poker/types';
import { GoldAnnounce } from '../GoldAnnounce';

export interface StreetAnnounceProps {
  /** A rua que a mesa está carimbando; `null` fora do beat. */
  street: Street | null;
}

/** A classe que põe a tela do jogo fora de foco enquanto o letreiro corre. */
const CUT_CLASS = 'is-street-cut';

/**
 * O nome de cada rua no letreiro que abre a cena dela.
 *
 * Ele já foi uma etiqueta miúda em cima das fichas, e o problema dela
 * era não ser vista: a rua é a virada de cena da mão — três cartas novas
 * na mesa, tudo o que se sabia mudou — e isso não cabe num texto de meia
 * altura que troca de palavra em silêncio.
 */
const STREET_LABEL: Record<Street, string> = {
  preflop: 'Pré-flop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
  showdown: 'Showdown',
};

/**
 * O LETREIRO DA RUA — o corte de cena que separa uma rua da seguinte.
 *
 * A CENA VEM ANTES DA PALAVRA: a tela inteira sai de foco, o quadro
 * escurece um tom e só então o letreiro entra, no centro, onde o olho já
 * está. Um beat depois o foco volta e as cartas novas caem. É a gramática
 * de corte do cinema, e ela resolve de uma vez o problema que um letreiro
 * no meio do feltro sempre teve: ele cobre as comunitárias. Fora de foco,
 * elas param de disputar atenção — não são uma peça tapada por outra, são
 * o fundo de onde a palavra se destaca.
 *
 * O DESFOQUE É DO CONTEÚDO, e não do fundo.
 *
 * Ele já foi um `backdrop-filter` numa camada por cima da tela, que é a
 * técnica óbvia — e é a errada aqui. Um `backdrop-filter` num elemento
 * `fixed` obriga o navegador a amostrar o que está atrás a partir de uma
 * superfície que ele monta na hora, e os motores discordam sobre qual
 * superfície é essa: no WebKit o efeito simplesmente não aparece, e em
 * outros o retrato do fundo sai deslocado — a tela parecia DUPLICADA
 * para o lado enquanto o letreiro corria.
 *
 * Um `filter` no `#root` não amostra nada: desfoca a árvore que já está
 * lá, e desenha igual em todo motor. O preço é estrutural, e é por isso
 * que este componente sai por um PORTAL para o `body`: filho do `#root`,
 * o letreiro seria desfocado junto com a mesa que ele anuncia.
 *
 * O `delay` do anúncio é o que garante a ordem: sem ele o desfoque e a
 * palavra chegariam juntos, e a respirada que antecede viraria ruído
 * simultâneo.
 */
export function StreetAnnounce({ street }: StreetAnnounceProps) {
  const instant = useReducedMotion() ?? false;

  /* A classe sai no MESMO instante em que a rua vira `null` — que é
     quando a saída do letreiro começa. Assim o foco volta junto com a
     palavra que se dissolve, e não depois dela. */
  useEffect(() => {
    if (!street) return undefined;
    document.body.classList.add(CUT_CLASS);
    return () => document.body.classList.remove(CUT_CLASS);
  }, [street]);

  return createPortal(
    <AnimatePresence>
      {street && (
        <motion.div
          className="street-announce"
          key={street}
          initial={instant ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={instant ? { opacity: 0 } : { opacity: 0, transition: { duration: 0.4 } }}
          transition={instant ? { duration: 0 } : { duration: 0.3, ease: 'easeOut' }}
        >
          <GoldAnnounce
            text={STREET_LABEL[street]}
            delay={instant ? 0 : 0.24}
            data-testid="street-announce"
          />
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
