import type { Opponent } from '../engine/types';

/**
 * Dados ILUSTRATIVOS do perfil do adversário (estilo Discord).
 *
 * O matchmaking local só produz `{ id, name, avatar, rating }`
 * (ver LocalBacBoGameEngine). Tudo aqui — nível, conquistas e as 4
 * badges estampadas — é derivado de forma DETERMINÍSTICA a partir do
 * oponente, para que o mesmo adversário mostre sempre o mesmo perfil
 * dentro de uma partida, sem persistência nem backend. Quando existir
 * a `ApiBacBoGameEngine`, estes campos passam a vir do servidor e este
 * arquivo vira só o fallback/adaptador.
 */

export interface Achievement {
  id: string;
  icon: string;
  name: string;
  description: string;
  /** Raridade define a cor do aro da badge. */
  rarity: 'comum' | 'raro' | 'épico' | 'lendário';
}

/** Catálogo ilustrativo de conquistas possíveis. */
export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: 'first-win', icon: '🎲', name: 'Primeira vitória', description: 'Venceu o primeiro duelo.', rarity: 'comum' },
  { id: 'streak-5', icon: '🔥', name: 'Em chamas', description: '5 vitórias seguidas.', rarity: 'raro' },
  { id: 'high-roller', icon: '💰', name: 'Alto apostador', description: 'Apostou 1000 créditos numa rodada.', rarity: 'raro' },
  { id: 'lucky-seven', icon: '🍀', name: 'Sete da sorte', description: 'Tirou 7 dez vezes.', rarity: 'comum' },
  { id: 'comeback', icon: '⚡', name: 'Virada', description: 'Venceu após 3 derrotas.', rarity: 'épico' },
  { id: 'duelist', icon: '⚔️', name: 'Duelista', description: '100 duelos disputados.', rarity: 'raro' },
  { id: 'champion', icon: '🏆', name: 'Campeão', description: 'Venceu um torneio.', rarity: 'épico' },
  { id: 'crown', icon: '👑', name: 'Realeza', description: 'Chegou ao topo do ranking.', rarity: 'lendário' },
  { id: 'sharp-eye', icon: '🎯', name: 'Mira certeira', description: 'Ganhou 20 vezes no detalhe.', rarity: 'raro' },
  { id: 'night-owl', icon: '🦉', name: 'Coruja', description: 'Jogou de madrugada 50 vezes.', rarity: 'comum' },
  { id: 'diamond', icon: '💎', name: 'Diamante', description: 'Rating acima de 1600.', rarity: 'lendário' },
  { id: 'phoenix', icon: '🐦‍🔥', name: 'Fênix', description: 'Renasceu de 10 derrotas.', rarity: 'épico' },
];

export const RARITY_RING: Record<Achievement['rarity'], string> = {
  comum: '#cba98a', // taupe
  raro: '#5aa9e6', // azul
  épico: '#b57edc', // roxo
  lendário: '#f5b76f', // âmbar da marca
};

export interface OpponentProfile {
  /** Nível derivado do rating (rating/100, mínimo 1). */
  level: number;
  /** Rating bruto do matchmaking, exibido como XP/pontos. */
  rating: number;
  /** @username derivado do nome. */
  username: string;
  /** As 4 conquistas ESTAMPADAS (showcase), determinísticas por oponente. */
  showcased: readonly Achievement[];
  /** Total de conquistas que o jogador possui (ilustrativo, ≥ 4). */
  totalUnlocked: number;
}

/** Hash estável e simples de uma string (determinístico, sem libs). */
function hashString(input: string): number {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0; // força int32
  }
  return Math.abs(hash);
}

/**
 * Deriva o perfil ilustrativo do oponente. Usa o `id` (ou o nome como
 * reserva) como semente para escolher — de forma estável — quais 4
 * conquistas ficam estampadas e quantas o jogador destravou no total.
 */
export function buildOpponentProfile(opponent: Opponent): OpponentProfile {
  const seed = hashString(opponent.id || opponent.name);
  const level = Math.max(1, Math.floor(opponent.rating / 100));

  // Escolhe 4 conquistas distintas do catálogo, começando num offset
  // derivado da semente e caminhando com passo coprimo do tamanho para
  // não repetir (12 conquistas; passo 5 é coprimo de 12).
  const count = ACHIEVEMENTS.length;
  const start = seed % count;
  const showcased: Achievement[] = [];
  for (let step = 0; step < 4; step += 1) {
    showcased.push(ACHIEVEMENTS[(start + step * 5) % count]);
  }

  // Total destravado ilustrativo: entre 4 e todas as conquistas, maior
  // para ratings mais altos.
  const ratingBonus = Math.floor(opponent.rating / 250); // 0..~7
  const totalUnlocked = Math.min(count, 4 + (seed % 3) + ratingBonus);

  return {
    level,
    rating: opponent.rating,
    username: `@${opponent.name.toLowerCase()}`,
    showcased,
    totalUnlocked,
  };
}
