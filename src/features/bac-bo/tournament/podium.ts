import type { IconName } from '@/shared/components/Icon';

/**
 * Metal de cada degrau do pódio: taça de ouro no topo, medalha de prata
 * e medalha de bronze. Símbolo e cor andam juntos — quem bate o olho na
 * tabela reconhece a colocação antes de ler o número.
 *
 * Vive fora dos componentes de propósito: a tabela de premiação da sala
 * e o pódio da coroação leem daqui, e nenhuma das duas telas dita a
 * aparência da outra.
 */
export const PODIUM_METALS = [
  { label: '1º', icon: 'trophy', metal: 'gold' },
  { label: '2º', icon: 'medal', metal: 'silver' },
  { label: '3º', icon: 'medal', metal: 'bronze' },
] as const satisfies readonly { label: string; icon: IconName; metal: string }[];
