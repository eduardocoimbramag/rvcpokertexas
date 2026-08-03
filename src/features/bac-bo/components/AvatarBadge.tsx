/**
 * Medalhões de jogador do Royal VIP Club — a identidade visual dos
 * jogadores no lugar dos emojis de animal (que variavam por plataforma
 * e destoavam do acabamento do salão).
 *
 * A CARA do jogador é o monograma: a inicial do nome em Oswald sobre um
 * disco de vinho com aro dourado, como um pin de clube de jogo. "Você"
 * inverte a placa (disco de ouro, tinta de vinho) para se destacar de
 * qualquer adversário sem depender de cor de aro.
 *
 * O campo `avatar` dos tipos da engine/torneio continua existindo por
 * compatibilidade de dados, mas NENHUMA tela o imprime mais — quem
 * renderiza identidade usa estes componentes, derivando do nome.
 */

import { OPPONENT_ALIAS } from './opponentIdentity';

/**
 * Primeira letra "visível" do nome (lida por grafema — 'Ísis' → 'Í').
 *
 * O rival ANÔNIMO é a exceção, e ela mora aqui de propósito: enquanto o
 * pareamento não revela quem é (ver opponentIdentity.ts), o medalhão
 * traz uma INTERROGAÇÃO. Um "O" de "Oponente" seria a inicial de um nome
 * que não existe — o medalhão diria "conheça esta pessoa" quando o que
 * a mesa quer dizer é "não se sabe quem é". Como a regra vive na função
 * que todo medalhão do jogo usa, nenhuma tela nova esquece dela.
 */
function initialOf(name: string): string {
  if (name === OPPONENT_ALIAS) return '?';
  const first = [...name.trim()][0];
  return (first ?? '?').toLocaleUpperCase('pt-BR');
}

export interface AvatarBadgeProps {
  name: string;
  /** Placa invertida (ouro) do próprio jogador. */
  you?: boolean;
  /** Controla o tamanho via font-size (o disco mede 1.5em). */
  className?: string;
}

/** Disco completo: fundo, aro e monograma. Escala com o font-size. */
export function AvatarBadge({ name, you = false, className = '' }: AvatarBadgeProps) {
  return (
    <span className={`avatar-badge ${you ? 'avatar-badge--you' : ''} ${className}`} aria-hidden="true">
      {initialOf(name)}
    </span>
  );
}

export interface MonogramProps {
  name: string;
  you?: boolean;
  className?: string;
}

/**
 * Só a letra, para dentro de molduras que já são redondas (o assento da
 * confirmação, o avatar grande do perfil): evita disco dentro de disco.
 */
export function Monogram({ name, you = false, className = '' }: MonogramProps) {
  return (
    <span className={`avatar-monogram ${you ? 'avatar-monogram--you' : ''} ${className}`} aria-hidden="true">
      {initialOf(name)}
    </span>
  );
}
