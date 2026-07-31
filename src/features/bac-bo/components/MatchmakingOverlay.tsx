import { motion, useReducedMotion } from 'framer-motion';

import { Button } from '@/shared/components/Button';

import { useGameStore } from '../store/gameStore';

/**
 * Quantos anéis o sonar mantém no ar e de quanto em quanto tempo um
 * novo parte. O gesto de cada anel é o MESMO do impacto do "VS" da
 * confirmação de duelo (scale 0.4 → 2.6, opacidade acendendo e
 * apagando, easeOut) — lá ele dispara uma vez, quando o pacto fecha;
 * aqui ele não para, porque a mesa ainda está procurando.
 *
 * Três anéis num ciclo de 2,6 s dão uma emissão a cada 0,87 s. O ritmo
 * é de ESPERA, não de alarme: a tela avisa que a casa está procurando e
 * some em poucos segundos — ela não pode competir com o que vem depois.
 *
 * O ciclo não pode ser muito mais longo do que isto por um motivo de
 * encenação: os anéis entram escalonados, então o mostrador só fica
 * cheio depois de dois intervalos, e o matchmaking dura de 1,2 a 2,6 s.
 */
const PING_RINGS = 3;
const PING_CYCLE_S = 2.6;

/** Ramp de metal oficial da casa — a mesma do "VS" e do brasão. */
const GOLD_RAMP = [
  { offset: '0', color: '#fff4e8' },
  { offset: '0.34', color: '#fcd9a0' },
  { offset: '0.68', color: '#f5b76f' },
  { offset: '1', color: '#c67e38' },
] as const;

/**
 * A LUPA em ouro lapidado.
 *
 * É arte de marca, não ícone: como o brasão, a carta da Home e o "VS",
 * ela NÃO herda `currentColor` — percorre a rampa de metal oficial
 * (marfim → champagne → âmbar → bronze) com o vidro fosco no miolo e o
 * lustre atravessando a lente. O ícone genérico de busca, chapado numa
 * tinta só, era o que fazia esta tela desaparecer no feltro.
 */
function SonarLens() {
  return (
    <svg viewBox="0 0 64 64" className="sonar__lens" aria-hidden="true">
      <defs>
        <linearGradient id="sonar-metal" x1="0" y1="0" x2="0.7" y2="1">
          {GOLD_RAMP.map((stop) => (
            <stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
          ))}
        </linearGradient>
        {/* Vidro: fosco no centro, quase nada na borda — o feltro
            aparece por dentro da lente, como numa lupa de verdade. */}
        <radialGradient id="sonar-glass" cx="0.36" cy="0.3" r="0.85">
          <stop offset="0" stopColor="#fff4e8" stopOpacity="0.34" />
          <stop offset="0.55" stopColor="#fcd9a0" stopOpacity="0.12" />
          <stop offset="1" stopColor="#c67e38" stopOpacity="0.05" />
        </radialGradient>
        <linearGradient id="sonar-sheen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff4e8" stopOpacity="0.8" />
          <stop offset="1" stopColor="#fff4e8" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Cabo, por baixo do aro: sai da lente e engrossa na ponta. */}
      <path
        d="M 41.5 41.5 L 54 54"
        stroke="url(#sonar-metal)"
        strokeWidth="9"
        strokeLinecap="round"
        fill="none"
      />
      {/* Vidro. */}
      <circle cx="26" cy="26" r="16.5" fill="url(#sonar-glass)" />
      {/* Lustre especular: banda fria que morre antes do meio da lente. */}
      <path
        d="M 15 18 A 15 15 0 0 1 30 12"
        stroke="url(#sonar-sheen)"
        strokeWidth="3.5"
        strokeLinecap="round"
        fill="none"
      />
      {/* Aro. */}
      <circle
        cx="26"
        cy="26"
        r="16.5"
        stroke="url(#sonar-metal)"
        strokeWidth="6"
        fill="none"
      />
    </svg>
  );
}

/**
 * Fase Search: o SONAR da casa varrendo a mesa atrás de um adversário.
 *
 * A cena é a mesma família do "VS" da confirmação de duelo, e de
 * propósito: é o mesmo momento do jogo visto um instante antes. O anel
 * de impacto que lá carimba o pacto uma única vez, aqui pulsa sem parar
 * — e a chamada abre no mesmo selo dourado com que a tela seguinte
 * anuncia "Duelo encontrado", fechando a frase.
 *
 * Cancelar a busca devolve o jogador ao menu.
 */
export function MatchmakingOverlay() {
  const cancelSearch = useGameStore((state) => state.cancelSearch);
  const instant = useReducedMotion() ?? false;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-7">
      <div className="sonar" aria-hidden="true">
        {/* Halo quente: tira o conjunto de cima do feltro sem desenhar
            borda nenhuma — é o que faz a lupa parecer iluminada. */}
        <span className="sonar__glow" />

        {/* Nada de peça fixa aqui: nem mostrador tracejado, nem facho
            girando. O que se vê no feltro é só a lupa e a emissão — o
            aro parado disputava atenção com os anéis, e o ponteiro
            varrendo transformava uma espera de dois segundos em coisa
            agitada. */}

        {/* Os anéis do sonar — o gesto do "VS", em série. */}
        {!instant &&
          Array.from({ length: PING_RINGS }, (_, ring) => {
            /* O ciclo do anel, repetido para o valor e para a
               opacidade. A opacidade PRECISA repetir o ciclo inteiro:
               um `transition.opacity` parcial SUBSTITUI o de fora em vez
               de completá-lo, e o anel apagava em 0,3 s e não voltava
               mais — o sonar ficava mudo com a escala rodando à toa. */
            const ciclo = {
              repeat: Infinity,
              duration: PING_CYCLE_S,
              delay: (ring * PING_CYCLE_S) / PING_RINGS,
            } as const;
            return (
              <motion.span
                key={ring}
                className="sonar__ping"
                initial={{ scale: 0.4, opacity: 0 }}
                /* O anel acende depressa e só se apaga na borda: com o
                   pico curto do "VS" (que dispara sozinho) ficava um
                   anel visível por vez, e o que faz um sonar parecer
                   sonar são vários no ar.
                   Quem segura o tom aqui é o TRAÇO (1,5px, sem halo) e o
                   RITMO, não a transparência — a tinta pode ser firme
                   porque agora os anéis são a única coisa desenhada no
                   feltro além da lupa. */
                animate={{ scale: 2.6, opacity: [0, 0.78, 0.44, 0] }}
                transition={{
                  ...ciclo,
                  ease: 'easeOut',
                  opacity: { ...ciclo, ease: 'linear', times: [0, 0.1, 0.62, 1] },
                }}
              />
            );
          })}

        {/* A lupa respira UMA vez por ciclo inteiro, e de leve: um fôlego
            por emissão deixava a lente tremendo. */}
        <motion.span
          className="sonar__lens-wrap"
          initial={false}
          animate={instant ? { scale: 1 } : { scale: [1, 1.025, 1] }}
          transition={
            instant
              ? { duration: 0 }
              : { repeat: Infinity, duration: PING_CYCLE_S, ease: 'easeInOut' }
          }
        >
          <SonarLens />
        </motion.span>
      </div>

      <div className="flex flex-col items-center gap-2 text-center" role="status">
        {/* Mesmo selo dourado do "Duelo encontrado" da tela seguinte: as
            duas telas são uma frase só, e o jogador reconhece a segunda
            porque já viu a primeira. */}
        <motion.p
          className="sonar__kicker"
          initial={instant ? false : { opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={instant ? { duration: 0 } : { duration: 0.45 }}
        >
          Procurando oponente…
        </motion.p>
        {/* Champagne apagado em vez da tinta gravada escura: o verde do
            feltro engolia o marrom, e esta linha é da mesma frase que o
            selo dourado acima — tem de pertencer à mesma família. */}
        <p className="sonar__hint">Isso leva poucos segundos</p>
      </div>

      <Button variant="secondary" onClick={cancelSearch} data-testid="cancel-search">
        Cancelar busca
      </Button>
    </div>
  );
}
