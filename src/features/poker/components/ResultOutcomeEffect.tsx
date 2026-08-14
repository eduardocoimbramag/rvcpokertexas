import type { CSSProperties, ReactNode } from 'react';
import { useMemo } from 'react';
import { createPortal } from 'react-dom';

/**
 * O DESFECHO EM CENA — o tratamento do veredito da rodada, o único
 * momento em que a mesa levanta a voz.
 *
 * São dois efeitos irmãos, do mesmo sistema visual e com o mesmo
 * esqueleto, mas com linguagens opostas:
 *
 * - `victory` — OURO POLIDO. Movimento ascendente e expansivo: um halo
 *   se abre atrás da palavra, um reflexo metálico varre as letras e
 *   faíscas, losangos e lascas douradas sobem em leque. Depois da
 *   entrada o brilho fica respirando devagar e umas poucas partículas
 *   seguem flutuando. É recompensa.
 * - `defeat` — RUBI QUEBRADO E CINZAS. Movimento descendente e de
 *   impacto: a palavra é CARIMBADA na mesa (entra grande e assenta, com
 *   um tremor curtíssimo), um feixe vinho atravessa em diagonal, uma
 *   vinheta cobre as bordas por um instante e fragmentos se desprendem
 *   das bordas das letras — primeiro para fora, depois caindo. Fica um
 *   glow rubi mais fechado que o dourado e umas brasas esfriando. É
 *   energia se apagando.
 * - `close` — O MESMO OURO, PARADO. O metal da vitória (mesma liga, mesmo
 *   relevo, mesma varredura) com coreografia própria: a palavra ASSENTA
 *   em vez de florescer, o halo se abre numa faixa deitada em vez de
 *   estourar em círculo, e não há partícula nenhuma. Existe para o
 *   desfecho que merece o bom metal da casa sem merecer a festa — quem
 *   levanta da mesa sem lucro. Festejar ali seria deboche; agradecer em
 *   tinta comum seria mesquinhez. A diferença entre ganhar e não ganhar
 *   deixa de ser TER ou NÃO TER ouro e passa a ser o que o ouro faz
 *   depois de aparecer.
 *
 * TUDO É CSS. Nenhum timer, nenhum `requestAnimationFrame`, nenhum
 * listener: as partículas são spans com variáveis de posição no
 * `style`, e quem as move são keyframes. Isso resolve de uma vez três
 * requisitos que costumam brigar entre si — não há recurso a limpar na
 * desmontagem (o DOM sair já mata a animação, então clicar em JOGAR DE
 * NOVO corta o efeito no mesmo quadro), não há re-render contínuo, e
 * transform/opacity rodam no compositor, que é o que mantém 24
 * partículas fluidas num celular intermediário.
 *
 * As partículas são sorteadas UMA vez por montagem (useMemo): re-render
 * não reembaralha a cena no meio da animação.
 *
 * O efeito veste a PALAVRA, que entra como `children` — assim o texto
 * continua sendo um nó só no DOM (nada de cópia para leitor de tela) e
 * as camadas se ancoram nele com precisão, sem depender de medida.
 */

export type ResultEffectOutcome = 'victory' | 'defeat' | 'close';

export interface ResultOutcomeEffectProps {
  outcome: ResultEffectOutcome;
  /**
   * Movimento reduzido: a palavra aparece montada, no mesmo ouro (ou
   * rubi) lapidado e com o mesmo glow — só que parado. Nenhuma camada
   * animada chega a existir no DOM.
   */
  instant?: boolean;
  /** A palavra do veredito, já com as classes do palco do resultado. */
  children: ReactNode;
}

/** Feitios das partículas — o vocabulário Art Déco da casa. */
type ParticleKind = 'dot' | 'diamond' | 'spark' | 'shard';

interface Particle {
  id: number;
  kind: ParticleKind;
  style: CSSProperties;
}

/** Quantidades por fase, por desfecho (ver o comentário do topo). */
const COUNTS = {
  victory: { burst: 16, drift: 8 },
  defeat: { burst: 13, drift: 6 },
} as const;

/**
 * Teto de deslocamento vertical das partículas de derrota. Elas caem, e
 * abaixo da palavra estão os botões: o corte garante que apaguem MUITO
 * antes de chegar em "JOGAR DE NOVO" — o rodapé nunca fica com sujeira
 * passando por cima.
 */
const FALL_LIMIT_PX = 78;

const KINDS: readonly ParticleKind[] = ['dot', 'diamond', 'spark', 'shard'];

/**
 * Distribuição ORGÂNICA: o leque é dividido em fatias iguais (para não
 * haver buraco nem aglomerado) e cada partícula é deslocada dentro da
 * sua fatia. Sorteio puro forma grumos; fatia pura forma um pente.
 */
function fanAngle(index: number, total: number, center: number, spread: number): number {
  const slice = spread / total;
  return center - spread / 2 + slice * (index + Math.random());
}

/** Variáveis que os keyframes consomem, em `style` (uma por partícula). */
function vars(v: Record<string, string | number>): CSSProperties {
  return v as CSSProperties;
}

function buildVictory(phase: 'burst' | 'drift'): Particle[] {
  const total = COUNTS.victory[phase];
  return Array.from({ length: total }, (_, id) => {
    // Leque para CIMA: centro em -90° e abertura de ~200° na explosão
    // (que espirra para os lados) contra ~120° na flutuação, que é mais
    // vertical — a diferença é o que separa impacto de respiração.
    const angle = fanAngle(
      id,
      total,
      -Math.PI / 2,
      phase === 'burst' ? Math.PI * 1.1 : Math.PI * 0.66,
    );
    const dist = phase === 'burst' ? 66 + Math.random() * 88 : 52 + Math.random() * 54;
    return {
      id,
      kind: KINDS[id % KINDS.length] ?? 'dot',
      style: vars({
        '--ox': `${(Math.random() - 0.5) * 52}px`,
        '--tx': `${Math.cos(angle) * dist}px`,
        '--ty': `${Math.sin(angle) * dist}px`,
        '--sc': 0.45 + Math.random() * 0.85,
        '--rot': `${(Math.random() - 0.5) * 240}deg`,
        '--op': phase === 'burst' ? 0.62 + Math.random() * 0.38 : 0.32 + Math.random() * 0.36,
        '--dur': `${phase === 'burst' ? 0.9 + Math.random() * 1.1 : 1.5 + Math.random() * 0.6}s`,
        // Na flutuação o atraso espalha as entradas ao longo de ~3 s; com
        // as durações desencontradas elas nunca voltam a bater juntas.
        '--delay': `${phase === 'burst' ? Math.random() * 0.16 : Math.random() * 3}s`,
      }),
    };
  });
}

function buildDefeat(phase: 'burst' | 'drift'): Particle[] {
  const total = COUNTS.defeat[phase];
  return Array.from({ length: total }, (_, id) => {
    if (phase === 'drift') {
      // Cinzas: descida lenta, quase reta, apagando no caminho.
      const fall = 42 + Math.random() * 34;
      return {
        id,
        kind: id % 3 === 0 ? 'dot' : 'shard',
        style: vars({
          '--ox': `${(Math.random() - 0.5) * 118}px`,
          '--tx': `${(Math.random() - 0.5) * 34}px`,
          '--ty1': `${fall * 0.35}px`,
          '--ty2': `${Math.min(fall, FALL_LIMIT_PX)}px`,
          '--sc': 0.35 + Math.random() * 0.45,
          '--rot': `${(Math.random() - 0.5) * 150}deg`,
          '--op': 0.18 + Math.random() * 0.26,
          '--dur': `${2.2 + Math.random() * 1.1}s`,
          '--delay': `${Math.random() * 3.4}s`,
        }),
      };
    }

    // Estilhaço: sai para FORA das bordas das letras e depois cede para
    // baixo — a queda é o que separa o fragmento de rubi da faísca.
    const angle = fanAngle(id, total, 0, Math.PI * 2);
    const dist = 54 + Math.random() * 62;
    const out = Math.sin(angle) * dist * 0.5;
    return {
      id,
      kind: id % 4 === 1 ? 'diamond' : id % 4 === 3 ? 'dot' : 'shard',
      style: vars({
        '--ox': `${(Math.random() - 0.5) * 64}px`,
        '--tx': `${Math.cos(angle) * dist}px`,
        '--ty1': `${out}px`,
        '--ty2': `${Math.min(out + 38 + Math.random() * 40, FALL_LIMIT_PX)}px`,
        '--sc': 0.4 + Math.random() * 0.8,
        '--rot': `${(Math.random() - 0.5) * 260}deg`,
        '--op': 0.55 + Math.random() * 0.45,
        '--dur': `${0.7 + Math.random() * 0.9}s`,
        '--delay': `${Math.random() * 0.14}s`,
      }),
    };
  });
}

/** Camada de partículas de uma fase. Decorativa e intocável ao dedo. */
function ParticleLayer({
  outcome,
  phase,
  particles,
}: {
  outcome: ResultEffectOutcome;
  phase: 'burst' | 'drift';
  particles: readonly Particle[];
}) {
  return (
    <span className="blaze-layer" aria-hidden="true" data-testid={`blaze-${phase}`}>
      {particles.map((particle) => (
        <span
          key={particle.id}
          className={`blaze-particle blaze-particle--${particle.kind} blaze-particle--${phase} blaze-particle--${outcome}`}
          style={particle.style}
        />
      ))}
    </span>
  );
}

export function ResultOutcomeEffect({
  outcome,
  instant = false,
  children,
}: ResultOutcomeEffectProps) {
  const victory = outcome === 'victory';
  /* ATENÇÃO: `!victory` deixou de significar "derrota" no dia em que
     entrou o terceiro valor. O feixe e a vinheta são da DERROTA e
     precisam dizer isso por extenso — sem esta guarda, quem levanta da
     mesa sem lucro leva um feixe vinho atravessando o título e uma
     vinheta escura no `body`, que é o oposto exato do que a tela diz.
     O TypeScript não acusa nada disso. */
  const close = outcome === 'close';

  /* Sorteio único por montagem. Com `instant` — ou com `close`, que não
     tem partícula nenhuma — as listas nem chegam a ser construídas: a
     festa do fecho não é desligada, ela nunca é montada. */
  const burst = useMemo(
    () => (instant || close ? [] : victory ? buildVictory('burst') : buildDefeat('burst')),
    [instant, close, victory],
  );
  const drift = useMemo(
    () => (instant || close ? [] : victory ? buildVictory('drift') : buildDefeat('drift')),
    [instant, close, victory],
  );

  return (
    <div
      className={`result-blaze result-blaze--${outcome} ${instant ? 'result-blaze--still' : ''}`}
      data-testid="result-blaze"
      data-outcome={outcome}
    >
      {!instant && (
        <>
          {/* Vitória: o halo que se abre atrás da palavra. Fecho: o MESMO
              nó, deitado em faixa (ver .result-blaze--close .result-blaze__halo). */}
          {(victory || close) && <span className="result-blaze__halo" aria-hidden="true" />}
          {/* Derrota, e só ela: o feixe vinho que atravessa em diagonal. */}
          {!victory && !close && <span className="result-blaze__beam" aria-hidden="true" />}
          {!close && <ParticleLayer outcome={outcome} phase="burst" particles={burst} />}
          {!close && <ParticleLayer outcome={outcome} phase="drift" particles={drift} />}
        </>
      )}

      {children}

      {/* A vinheta vinho da derrota cobre as BORDAS da área de jogo, e
          não a caixa da palavra — daí o portal: os ancestrais animados
          pelo Framer carregam transforms, e um `fixed` aqui dentro
          ancoraria na caixa errada (mesmo motivo do Confetti). Ela é um
          fade único de ~0,9 s; sai de cena sozinha e some no ato se a
          tela for embora antes.
          Nada de vinheta no FECHO: não há derrota a anunciar. */}
      {!victory && !close && !instant && <DefeatVignette />}
    </div>
  );
}

function DefeatVignette() {
  return createPortal(
    <span className="ember-vignette" aria-hidden="true" data-testid="ember-vignette" />,
    document.body,
  );
}
