import { motion } from 'framer-motion';

import { Button } from '@/shared/components/Button';
import { Icon } from '@/shared/components/Icon';

import { isBroke } from '../engine/credits';
import { audioManager } from '../services/AudioManager';
import { useGameStore } from '../store/gameStore';
import { TOURNAMENT_ENABLED, TOURNAMENT_SOON_HINT } from '../tournament/availability';
import { BalancePill } from './BalancePill';
import { BrandCard } from './BrandCard';

/**
 * Os andares do logotipo, de cima para baixo. "ARENA" é a linha de ouro
 * — a hierarquia da marca é a mesma de sempre, só empilhada.
 *
 * São DOIS andares agora, e não três: o nome do jogo virou uma palavra
 * só. Cada linha distribui as próprias letras na largura do bloco, então
 * duas palavras de cinco letras fecham num retângulo justo — a marca
 * ficou mais compacta e mais legível do que era empilhada em três.
 */
const BRAND_LINES = [
  { word: 'POKER', gold: false },
  { word: 'ARENA', gold: true },
] as const;

export interface HomeScreenProps {
  onOpenTutorial: () => void;
  onOpenHistory: () => void;
  onOpenSettings: () => void;
  onOpenTournament: () => void;
}

/** Tela inicial: logotipo, saldo e os dois modos de jogo. */
export function HomeScreen({
  onOpenTutorial,
  onOpenHistory,
  onOpenSettings,
  onOpenTournament,
}: HomeScreenProps) {
  const balance = useGameStore((state) => state.balance);
  const startSearch = useGameStore((state) => state.startSearch);
  const refillCredits = useGameStore((state) => state.refillCredits);

  const broke = isBroke(balance);

  /* JOGAR vai direto para a mesa, sempre.
     O botão já desviou para o tutorial na primeira partida, e a ideia
     era boa no papel: apresentar o jogo antes da primeira mão. Na
     prática ele interceptava um toque que dizia "quero jogar" e
     entregava outra coisa — e voltava a interceptar sempre que o estado
     era limpo. Quem quer aprender tem o COMO JOGAR logo abaixo, que é o
     botão que promete exatamente isso. */
  const handlePlay = () => {
    void startSearch();
  };

  const handleTournament = () => {
    // Único gesto garantido antes do torneio: o áudio nasce AQUI. O
    // fluxo de torneio não passa pela busca do 1v1 (startSearch), e o
    // WebKit só cria AudioContext dentro de um gesto do usuário — sem
    // isso a primeira partida seria muda no iOS/Safari.
    audioManager.playSfx('tap');
    onOpenTournament();
  };

  return (
    <main className="flex flex-1 flex-col items-center justify-between px-6 py-8">
      <header className="flex w-full items-center justify-between">
        <BalancePill balance={balance} />
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Ajustes"
          className="focus-ring grid h-11 w-11 place-items-center rounded-full border border-arena-line bg-arena-800 text-lg text-ivory active:brightness-125"
        >
          <Icon name="gear" />
        </button>
      </header>

      <motion.div
        className="flex flex-col items-center gap-4 text-center"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <motion.span
          aria-hidden="true"
          animate={{ rotate: [0, -8, 8, 0] }}
          transition={{ repeat: Infinity, repeatDelay: 3, duration: 0.8 }}
        >
          <BrandCard size={80} />
        </motion.span>
        {/* Logotipo em três andares. Cada linha DISTRIBUI as próprias
            letras na largura do bloco (que é a da linha mais larga), então
            as três terminam exatamente alinhadas nas duas bordas — o
            espacejamento sai da geometria, não de um letter-spacing
            chutado linha por linha. O rótulo acessível é a marca inteira:
            duas linhas soltas leriam "Poker. Arena.". */}
        <h1 className="brand-title" aria-label="Poker Arena">
          {BRAND_LINES.map(({ word, gold }) => (
            <span
              key={word}
              className={`brand-title__line ${gold ? 'brand-title__line--gold' : ''}`}
              aria-hidden="true"
            >
              {[...word].map((letter, index) => (
                <span key={`${letter}-${index}`}>{letter}</span>
              ))}
            </span>
          ))}
        </h1>
      </motion.div>

      <div className="flex w-full flex-col gap-3">
        {broke ? (
          // Sem saldo para o menor lance da mesa: a recarga assume o
          // lugar do 1V1 (antes ela morava na tela de aposta, extinta).
          <Button onClick={refillCredits} fullWidth data-testid="refill-button">
            <Icon name="chip" /> RECARREGAR CRÉDITOS
          </Button>
        ) : (
          <Button onClick={handlePlay} fullWidth data-testid="play-button">
            {/* Naipe de paus no lugar do dado: a casa agora joga cartas. */}
            <Icon name="club" /> 1V1
          </Button>
        )}
        {/* O TORNEIO com a porta fechada (ver `TOURNAMENT_ENABLED`). O
            botão CONTINUA em cena, apagado: esconder um modo que existe
            faria a Home mudar de forma quando ele voltasse, e quem já
            conhece o jogo procuraria um botão que sumiu. Apagado, ele
            diz as duas coisas de uma vez — que o torneio existe e que
            ainda não abriu. É o mesmo tratamento do LEVANTAR na primeira
            mão da mesa. */}
        <Button
          variant="secondary"
          onClick={handleTournament}
          fullWidth
          disabled={!TOURNAMENT_ENABLED}
          title={TOURNAMENT_ENABLED ? undefined : TOURNAMENT_SOON_HINT}
          data-testid="tournament-button"
        >
          <Icon name="trophy" /> TORNEIO
          {!TOURNAMENT_ENABLED && (
            <span className="btn__soon" data-testid="tournament-soon">
              {TOURNAMENT_SOON_HINT}
            </span>
          )}
        </Button>
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="secondary"
            size="md"
            onClick={onOpenHistory}
            data-testid="history-button"
          >
            <Icon name="scroll" /> Histórico
          </Button>
          <Button variant="secondary" size="md" onClick={onOpenTutorial}>
            <Icon name="help" /> Como jogar
          </Button>
        </div>
      </div>
    </main>
  );
}
