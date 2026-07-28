import { useCallback, useEffect, useRef, useState } from 'react';

import { COIN_PICK_SECONDS, TIMINGS } from '../animations/timings';
import { audioManager } from '../services/AudioManager';
import type { CardColorId, CardColors } from '../store/cardColors';
import { assignColors, randomCardColor } from '../store/cardColors';
import type { CoinFlipState, CoinSide } from '../store/gameStore';

/**
 * Beats do cara-ou-coroa fora do gameStore, para as mesas que não são o
 * 1v1 — hoje a partida do torneio, que tem máquina de fases própria.
 *
 * A COREOGRAFIA é a mesma do 1v1, beat a beat e nos mesmos TIMINGS
 * (apresentação → voo → face → veredito → escolha → respiro), e a cena
 * é literalmente o mesmo componente (CoinFlipOverlay): o sorteio do
 * torneio não é uma segunda versão do sorteio, é o mesmo sorteio.
 *
 * O que este hook NÃO faz é decidir a partida: ele sorteia lado, face e
 * cor, e nada mais — a rodada de blackjack corre depois, no motor da
 * própria partida.
 */

export interface UseCoinFlipOptions {
  /**
   * Cores decididas (jogador e adversário). Chamado no INSTANTE da
   * escolha, não no fim: o anúncio "Você joga com as cartas X" e os
   * versos da mesa precisam já estar na cor certa no último beat.
   */
  onColors: (colors: CardColors) => void;
  /** Sorteio encerrado: a rodada pode começar. */
  onSettled: () => void;
  /** Fonte de aleatoriedade (determinística nos testes). */
  rng?: () => number;
}

export interface UseCoinFlipResult {
  /** Estado corrente do sorteio; `null` antes de `start`. */
  coinFlip: CoinFlipState | null;
  /**
   * Abre o sorteio (sorteia o lado do jogador e começa a apresentação).
   * Imperativo de propósito: quem chama é a transição de fase da tela,
   * de dentro do próprio beat que a produziu — nada de efeito espiando
   * um `active` e disparando renderização em cascata.
   */
  start: () => void;
  /** Confirma a cor escolhida pelo jogador (só vale na fase `pick`). */
  choose: (color: CardColorId) => void;
}

const coinSide = (rng: () => number): CoinSide => (rng() < 0.5 ? 'cara' : 'coroa');

export function useCoinFlip({
  onColors,
  onSettled,
  rng = Math.random,
}: UseCoinFlipOptions): UseCoinFlipResult {
  const [coin, setCoin] = useState<CoinFlipState | null>(null);

  // Callbacks e RNG por referência: trocar a identidade de um callback
  // não pode reagendar (nem cancelar) um beat em andamento.
  const onColorsRef = useRef(onColors);
  const onSettledRef = useRef(onSettled);
  const rngRef = useRef(rng);
  useEffect(() => {
    onColorsRef.current = onColors;
    onSettledRef.current = onSettled;
    rngRef.current = rng;
  });

  // Campos primitivos: os beats reagem a MUDANÇA DE ESTÁGIO, e nunca ao
  // relógio da escolha correndo dentro do estágio `pick`.
  const stage = coin?.stage ?? null;
  const playerSide = coin?.playerSide ?? null;
  const result = coin?.result ?? null;
  const winner = coin?.winner ?? null;

  /** Aplica a cor do jogador e fecha a escolha (toque ou relógio). */
  const applyPlayerPick = useCallback((color: CardColorId) => {
    onColorsRef.current(assignColors('player', color));
    setCoin((c) =>
      c && c.stage === 'pick'
        ? { ...c, stage: 'picked', chosenColor: color, pickSeconds: null }
        : c,
    );
    audioManager.playSfx('ready');
  }, []);

  const choose = useCallback(
    (color: CardColorId) => {
      if (stage !== 'pick') return;
      applyPlayerPick(color);
    },
    [stage, applyPlayerPick],
  );

  /** Arranque: a sorte dá um lado ao jogador e a apresentação abre. */
  const start = useCallback(() => {
    setCoin({
      playerSide: coinSide(rngRef.current),
      result: null,
      winner: null,
      stage: 'intro',
      chosenColor: null,
      pickSeconds: null,
    });
  }, []);

  // Encadeamento dos beats. Cada estágio agenda o SEU sucessor e limpa o
  // próprio timer ao sair — sem isto, sair da tela no meio do voo
  // deixaria a moeda pousando no vazio.
  useEffect(() => {
    if (!stage) return;

    if (stage === 'intro') {
      const timer = setTimeout(() => {
        // A face é decidida no INÍCIO do voo: a animação precisa saber
        // onde pousar (o mesmo contrato do 1v1).
        setCoin((c) => (c ? { ...c, stage: 'toss', result: coinSide(rngRef.current) } : c));
        audioManager.playSfx('coinToss');
      }, TIMINGS.coinIntroMs);
      return () => clearTimeout(timer);
    }

    if (stage === 'toss') {
      const timer = setTimeout(() => {
        setCoin((c) =>
          c ? { ...c, stage: 'result', winner: c.result === c.playerSide ? 'player' : 'opponent' } : c,
        );
        audioManager.playSfx('coinLand');
      }, TIMINGS.coinTossMs);
      return () => clearTimeout(timer);
    }

    if (stage === 'result') {
      const timer = setTimeout(
        () => setCoin((c) => (c ? { ...c, stage: 'verdict' } : c)),
        TIMINGS.coinResultMs,
      );
      return () => clearTimeout(timer);
    }

    if (stage === 'verdict') {
      const timer = setTimeout(() => {
        if (winner === 'player') {
          // A vez do jogador: o estágio espera o toque — ou o relógio.
          setCoin((c) => (c ? { ...c, stage: 'pick', pickSeconds: COIN_PICK_SECONDS } : c));
          return;
        }
        const color = randomCardColor(rngRef.current);
        onColorsRef.current(assignColors('opponent', color));
        setCoin((c) => (c ? { ...c, stage: 'botPick', chosenColor: color } : c));
        audioManager.playSfx('stake');
      }, TIMINGS.coinVerdictMs);
      return () => clearTimeout(timer);
    }

    if (stage === 'botPick' || stage === 'picked') {
      const timer = setTimeout(
        () => onSettledRef.current(),
        stage === 'botPick' ? TIMINGS.coinBotPickMs : TIMINGS.coinPickedMs,
      );
      return () => clearTimeout(timer);
    }

    return;
  }, [stage, playerSide, result, winner]);

  // Relógio anti-AFK da escolha (10 → 1). Zerado sem decisão, a mesa
  // sorteia a cor pelo jogador — a partida nunca fica esperando quem
  // saiu do aparelho.
  useEffect(() => {
    if (stage !== 'pick') return;
    const tick = setInterval(() => {
      setCoin((c) =>
        c && c.stage === 'pick' && c.pickSeconds !== null
          ? { ...c, pickSeconds: Math.max(0, c.pickSeconds - 1) }
          : c,
      );
    }, 1000);
    const fire = setTimeout(
      () => applyPlayerPick(randomCardColor(rngRef.current)),
      COIN_PICK_SECONDS * 1000,
    );
    return () => {
      clearInterval(tick);
      clearTimeout(fire);
    };
  }, [stage, applyPlayerPick]);

  return { coinFlip: coin, start, choose };
}
