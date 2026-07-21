import { createId } from '@/shared/lib/ids';

import { STAKE_PRESETS } from '../engine/credits';
import type { DicePair, DieValue } from '../engine/types';
import type { ChatMessage, PublicLobby, TournamentPlayer, TournamentSize } from './types';

/**
 * Simulação do "multiplayer": o app é local, então os outros jogadores,
 * as salas públicas e o chat são bots convincentes. Isolado aqui para
 * que a troca por um backend real toque só o store.
 */

const BOT_POOL: readonly { name: string; avatar: string }[] = [
  { name: 'Otto', avatar: '🐙' },
  { name: 'Luna', avatar: '🦊' },
  { name: 'Dante', avatar: '🐺' },
  { name: 'Nina', avatar: '🦋' },
  { name: 'Rex', avatar: '🦁' },
  { name: 'Maya', avatar: '🐯' },
  { name: 'Kai', avatar: '🦈' },
  { name: 'Vera', avatar: '🦅' },
  { name: 'Bruno', avatar: '🐻' },
  { name: 'Ísis', avatar: '🐍' },
  { name: 'Théo', avatar: '🦉' },
  { name: 'Zara', avatar: '🐸' },
];

const HOST_NAMES = ['Otto', 'Luna', 'Dante', 'Rex', 'Maya', 'Vera'];

const LOBBY_NAMES = [
  'Mesa Imperial',
  'Salão Royal',
  'Duelo dos Reis',
  'Copa Borgonha',
  'Arena VIP',
  'Clube dos Ases',
];

const CHAT_LINES = [
  'boa sorte a todos 🎲',
  'bora bora, tô pronto',
  'quem cair na minha chave já era 😎',
  'partiu copa',
  'hoje o troféu é meu',
  'respeita o campeão',
  'tô sentindo os dados quentes hoje',
  'gg antecipado',
  'vamo que vamo',
  'que comece o show',
];

/** Sorteia inteiro em [min, max]. */
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(list: readonly T[]): T {
  return list[randInt(0, list.length - 1)] as T;
}

/** Embaralha sem mutar a entrada (decorate-sort-undecorate). */
export function shuffle<T>(list: readonly T[]): T[] {
  return list
    .map((value) => ({ value, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map((item) => item.value);
}

/** O jogador local. */
export function you(): TournamentPlayer {
  return { id: 'you', name: 'Você', avatar: '🫵', isYou: true };
}

/** N bots distintos como participantes. */
export function makeBots(count: number): TournamentPlayer[] {
  return shuffle(BOT_POOL)
    .slice(0, count)
    .map((b) => ({ id: createId(), name: b.name, avatar: b.avatar, isYou: false }));
}

/** Lista de salas públicas fictícias para o navegador de salas. */
export function makePublicLobbies(): PublicLobby[] {
  return shuffle(LOBBY_NAMES)
    .slice(0, randInt(2, 4))
    .map((name) => {
      const size: TournamentSize = Math.random() < 0.5 ? 4 : 8;
      return {
        id: createId(),
        name,
        hostName: pick(HOST_NAMES),
        size,
        filled: randInt(1, size - 1),
        stake: pick(STAKE_PRESETS),
      };
    });
}

export function systemMessage(text: string): ChatMessage {
  return { id: createId(), authorId: 'system', authorName: 'Sistema', text, system: true, at: Date.now() };
}

export function chatMessage(author: TournamentPlayer, text: string): ChatMessage {
  return {
    id: createId(),
    authorId: author.id,
    authorName: author.name,
    text,
    system: false,
    at: Date.now(),
  };
}

/** Uma fala aleatória de um bot para o chat do lobby. */
export function botChatLine(): string {
  return pick(CHAT_LINES);
}

/**
 * Soma (2–12) de um lado numa partida simulada de bot. Distribuição de
 * 2 dados honestos — a mesma base do jogo real.
 */
export function rollSum(): number {
  return randInt(1, 6) + randInt(1, 6);
}

/**
 * Resultado de uma partida SEM o jogador (dois bots): rola até haver um
 * vencedor (mata-mata não admite empate).
 */
export function simulateBotMatch(): { scoreA: number; scoreB: number } {
  let scoreA = rollSum();
  let scoreB = rollSum();
  while (scoreA === scoreB) {
    scoreA = rollSum();
    scoreB = rollSum();
  }
  return { scoreA, scoreB };
}

function rollDie(): DieValue {
  return randInt(1, 6) as DieValue;
}

/**
 * Dados da partida do jogador contra o adversário do chaveamento —
 * honestos, mas sem empate (mata-mata sempre decide um vencedor).
 */
export function rollPlayerMatch(): { playerDice: DicePair; opponentDice: DicePair } {
  let playerDice: DicePair = [rollDie(), rollDie()];
  let opponentDice: DicePair = [rollDie(), rollDie()];
  while (playerDice[0] + playerDice[1] === opponentDice[0] + opponentDice[1]) {
    playerDice = [rollDie(), rollDie()];
    opponentDice = [rollDie(), rollDie()];
  }
  return { playerDice, opponentDice };
}
