import { createId } from '@/shared/lib/ids';

import { STAKE_PRESETS } from '../engine/credits';
import type { DicePair, DieValue } from '../engine/types';
import type {
  ChatMessage,
  LobbyListing,
  LobbyVisibility,
  TournamentPlayer,
  TournamentSize,
} from './types';

/**
 * Simulação do "multiplayer": o app é local, então os outros jogadores,
 * as salas públicas e o chat são bots convincentes. Isolado aqui para
 * que a troca por um backend real toque só o store.
 */

const BOT_POOL: readonly { name: string; avatar: string }[] = [
  { name: 'Otto', avatar: 'O' },
  { name: 'Luna', avatar: 'L' },
  { name: 'Dante', avatar: 'D' },
  { name: 'Nina', avatar: 'N' },
  { name: 'Rex', avatar: 'R' },
  { name: 'Maya', avatar: 'M' },
  { name: 'Kai', avatar: 'K' },
  { name: 'Vera', avatar: 'V' },
  { name: 'Bruno', avatar: 'B' },
  { name: 'Ísis', avatar: 'Í' },
  { name: 'Théo', avatar: 'T' },
  { name: 'Zara', avatar: 'Z' },
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

/**
 * Sugestões para a sala do PRÓPRIO jogador — o campo de nome já nasce
 * preenchido com uma delas, e ele reescreve se quiser. Nomes distintos
 * dos da lista para a sala dele não nascer homônima de uma alheia.
 */
const YOUR_LOBBY_NAMES = [
  'Mesa Borgonha',
  'Salão do Coringa',
  'Privê dos Dados',
  'Copa da Casa',
  'Mesa Coroa',
];

const CHAT_LINES = [
  'boa sorte a todos',
  'bora bora, tô pronto',
  'quem cair na minha chave já era',
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
  return { id: 'you', name: 'Você', avatar: 'V', isYou: true };
}

/**
 * N bots distintos como participantes.
 *
 * `exclude` são NOMES que não podem entrar: quem já está sentado (senão
 * a sala aceitava dois "Dante") e quem foi expulso pelo dono. O nome é a
 * identidade que o jogador enxerga — o `id` é sorteado a cada entrada,
 * então filtrar por id deixaria a mesma pessoa voltar com outra crachá.
 * Devolve menos que `count` se o elenco disponível acabar; cabe a quem
 * chama decidir o que fazer com a sobra.
 */
export function makeBots(count: number, exclude: readonly string[] = []): TournamentPlayer[] {
  const blocked = new Set(exclude);
  return shuffle(BOT_POOL.filter((b) => !blocked.has(b.name)))
    .slice(0, count)
    .map((b) => ({ id: createId(), name: b.name, avatar: b.avatar, isYou: false }));
}

/** Senha de sala privada: 4 dígitos, o formato que o teclado do celular
    abre em modo numérico. */
export function randomLobbyPassword(): string {
  return String(randInt(0, 9999)).padStart(4, '0');
}

/** Nome sugerido para a sala do jogador (o campo já nasce preenchido). */
export function suggestLobbyName(): string {
  return pick(YOUR_LOBBY_NAMES);
}

/**
 * Salas anunciadas no navegador — públicas e privadas misturadas, como
 * numa lista real. As privadas vêm com senha: aparecem para todo mundo,
 * mas só entra quem tiver o código do anfitrião.
 */
export function makeLobbyListings(): LobbyListing[] {
  return shuffle(LOBBY_NAMES)
    .slice(0, randInt(3, 5))
    .map((name, index) => {
      const size: TournamentSize = Math.random() < 0.5 ? 4 : 8;
      // Uma em cada três, e nunca a primeira: a lista abre com uma sala
      // de entrada livre em vez de uma porta trancada.
      const visibility: LobbyVisibility =
        index > 0 && Math.random() < 0.34 ? 'private' : 'public';
      return {
        id: createId(),
        name,
        hostName: pick(HOST_NAMES),
        size,
        filled: randInt(1, size - 1),
        fee: pick(STAKE_PRESETS),
        visibility,
        password: visibility === 'private' ? randomLobbyPassword() : '',
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
