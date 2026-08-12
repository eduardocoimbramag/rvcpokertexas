import type { CSSProperties } from 'react';

import { Icon } from '@/shared/components/Icon';
import { formatCredits } from '@/shared/lib/format';

import type { Card, Duelist } from '../../engine/types';
import { Monogram } from '../AvatarBadge';
import { Card3D } from '../Card3D';
import { ChipRack } from './ChipRack';

export interface PokerSeatProps {
  side: Duelist;
  name: string;
  /**
   * As duas cartas fechadas do assento. `null` no lugar de uma carta é
   * uma carta de bruços — é assim que a mão do rival chega aqui até o
   * showdown (a engine não manda as cartas dele, ver LocalPokerEngine).
   */
  cards: readonly (Card | null)[];
  /** Fichas que ainda restam a este lado. */
  stack: number;
  /**
   * Este assento tem o BOTÃO DO DEALER. Nesta mesa ele não cobra blind
   * nenhum — a entrada é igual dos dois lados —, e diz uma coisa só:
   * fala primeiro no pré-flop e por último do flop em diante. Ver
   * docs/dmisterioso.md.
   */
  button: boolean;
  /** A mesa está esperando a decisão deste lado. */
  toAct: boolean;
  /** Não sobrou ficha nenhuma: ele está com tudo no meio. */
  allIn: boolean;
  /**
   * Você ABRIU esta mão para o rival depois de levar o pote sem showdown
   * (ver ShowCardsPrompt). É um gesto voluntário, e por isso tem selo
   * próprio: quem olha a mesa precisa distinguir uma carta que a mesa
   * virou de uma que o dono escolheu virar.
   */
  shown?: boolean;
  /** A mão deste lado, lida com as comunitárias — só a sua aparece. */
  reading?: string;
  /** As cinco cartas vencedoras: as fechadas que estão nelas acendem. */
  highlight?: readonly Card[];
  /** Atraso da carta na coreografia da distribuição. */
  dealDelayFor: (index: number) => number;
  /**
   * Abre o perfil de quem senta aqui. Omitido, a placa não é clicável —
   * é o que mantém o SEU assento como placa e não como botão, e o que
   * cala a porta enquanto o rival ainda é anônimo (ver
   * `opponentIdentity`).
   */
  onOpenProfile?: () => void;
  instant: boolean;
}

/**
 * UM ASSENTO DA MESA: quem é, quanto tem, o que pôs e as duas cartas
 * fechadas dele.
 *
 * O que se mostra de um lado da mesa é exatamente o que uma mesa de
 * verdade mostra: o STACK é público — é com ele que se calcula tudo o que
 * há para calcular no poker — e as CARTAS não são. A mão do rival fica de
 * bruços até o showdown, e a leitura ("dois pares") só existe do seu
 * lado, porque só sai da sua própria mão.
 *
 * A IDENTIDADE do assento é UMA placa (ver `.seat-plate`), não três
 * pastilhas soltas: brasão, nome, montante e — do seu lado — a leitura
 * da mão, na mesma moldura. Antes eram três peças em três alturas do
 * feltro, e ler o próprio assento custava três paradas do olho no meio
 * de uma decisão cronometrada.
 *
 * O que este assento NÃO mostra mais é a aposta da rua em cifra solta no
 * feltro. Ela pendurava um número ao lado do disco do dealer que ninguém
 * pedia para ler e que competia com as duas coisas que importam ali — o
 * montante de cada lado e o POTE no meio, que já soma tudo o que foi
 * empurrado. O lance que acabou de acontecer continua sendo dito por
 * extenso pela mesa (ver MoveCall).
 */
export function PokerSeat({
  side,
  name,
  cards,
  stack,
  button,
  toAct,
  allIn,
  shown = false,
  reading,
  highlight,
  dealDelayFor,
  onOpenProfile,
  instant,
}: PokerSeatProps) {
  const you = side === 'player';
  /* A MESMA carta dos dois lados da mesa. O rival já teve uma escala
     própria (0,62 da sua) e uma face compacta, pelo argumento de que uma
     carta de bruços não tem nada a ler; o que aquilo produzia na tela era
     um assento em segundo plano, como se ele jogasse com outro baralho.
     Mesa de verdade tem um baralho só. Ver --hole-card-w no index.css. */
  const cardSize = 'var(--hole-card-w)';

  /* A PLACA DO ASSENTO — a peça de identidade de cada lado da mesa.
     Uma placa só, e não três pastilhas soltas: quem é, quanto tem e o
     que a mão vale AGORA são a mesma leitura, e antes elas moravam em
     três lugares diferentes do feltro. Reunidas na mesma moldura, o olho
     faz uma parada em vez de três.

     A ordem é a da importância na mesa: NOME e MONTANTE na linha de
     cima, que é a que se consulta a cada lance; a LEITURA embaixo, em
     ouro menor — ela muda a cada rua e é comentário, não decisão.

     À esquerda, o RETRATO de quem senta ali: o monograma do clube (ver
     AvatarBadge), a mesma identidade que a pessoa tem no chaveamento do
     torneio, no perfil do rival e em toda lista do salão. Ali já morou o
     naipe da casa, e o naipe era decoração: dizia a mesma coisa nos dois
     lados da mesa. O retrato diz QUEM — que é a única pergunta que uma
     placa de assento existe para responder. Enquanto o pareamento não
     revela o rival, o monograma dele é uma interrogação, e é assim que
     tem de ser (ver `initialOf`).

     A LEITURA só existe do SEU lado, e isso é regra de poker, não de
     layout: ela sai das suas duas fechadas com o que a mesa abriu. Do
     lado do rival a linha simplesmente não nasce, e a placa fica de uma
     linha só. */
  const identityBody = (
    <>
      <span className="seat-plate__crest" data-testid={`seat-avatar-${side}`} aria-hidden="true">
        <Monogram name={name} you={you} />
      </span>
      <span className="seat-plate__body">
        <span className="seat-plate__line">
          <span className="seat-plate__name">{name}</span>
          {allIn && (
            <span
              className="seat-plate__flag seat-plate__flag--allin"
              data-testid={`allin-${side}`}
            >
              ALL-IN
            </span>
          )}
          {shown && (
            <span
              className="seat-plate__flag seat-plate__flag--shown"
              data-testid={`shown-${side}`}
            >
              MOSTROU
            </span>
          )}
          <span className="seat-plate__stack" data-testid={`stack-${side}`}>
            <Icon name="chip" size="0.9em" /> {formatCredits(stack)}
          </span>
        </span>
        {reading && (
          <span className="seat-plate__reading" data-testid="hand-reading">
            {reading}
          </span>
        )}
      </span>
    </>
  );

  /* A PLACA ABRE O PERFIL de quem senta ali, e é a mesma porta que o
     medalhão do desfecho já oferecia — só que agora ela existe DURANTE a
     mão, que é quando se quer saber com quem se está jogando.
     Ela vira `button` só quando há perfil a abrir: um `div` que responde
     a clique não chega ao teclado nem ao leitor de tela, e um `button`
     onde não há ação anuncia uma porta que não existe. */
  const abrePerfil = onOpenProfile !== undefined;
  const identity = abrePerfil ? (
    <button
      type="button"
      className={`seat-plate seat-plate--${side} seat-plate--tappable ${toAct ? 'is-turn' : ''}`}
      data-testid={`seat-${side}`}
      onClick={onOpenProfile}
      aria-label={`Ver o perfil de ${name}`}
    >
      {identityBody}
    </button>
  ) : (
    <div
      className={`seat-plate seat-plate--${side} ${toAct ? 'is-turn' : ''}`}
      data-testid={`seat-${side}`}
    >
      {identityBody}
    </div>
  );

  /* O MONTANTE deste lado. Mostra o stack VIVO — o que já foi empurrado
     para o meio não está mais aqui, está na aposta da rua. */
  const rack = <ChipRack side={side} stack={stack} instant={instant} />;

  const puck = button && (
    /* O BOTÃO DO DEALER, ao lado da MÃO — que é onde ele fica numa mesa
       de verdade: um disco em cima do pano, na frente de quem o tem, e
       não um selo dentro da plaquinha do nome.
       Ele fica sempre à ESQUERDA de quem o tem, do ponto de vista dele:
       como a mesa é vista de cima e o rival está de cabeça para baixo, a
       esquerda dele cai na direita da tela.
       Aqui ele não diz quem paga blind nenhum — a entrada desta mesa é
       igual dos dois lados. Diz uma coisa só, e ela decide mão: a ORDEM
       DA PALAVRA. Ver docs/dmisterioso.md. */
    <span
      className="dealer-puck"
      data-testid={`dealer-button-${side}`}
      role="img"
      aria-label={`Botão do dealer com ${you ? 'você' : name}: fala por último do flop em diante`}
    >
      <span className="dealer-puck__face" aria-hidden="true">
        D
      </span>
    </span>
  );

  const hand = (
    <div className="poker-seat__cards" data-testid={`hole-${side}`}>
      {cards.map((card, index) => {
        const lit =
          card !== null &&
          (highlight?.some((held) => held.rank === card.rank && held.suit === card.suit) ?? false);
        return (
          <span
            key={index}
            className={`poker-seat__card ${lit ? 'poker-seat__card--lit' : ''}`}
            data-testid={`hole-${side}-card-${index + 1}`}
            style={{ '--card-size': cardSize } as CSSProperties}
          >
            <Card3D
              card={card}
              size={cardSize}
              faceDown={card === null}
              dealDelayMs={dealDelayFor(index)}
              label={`${you ? 'Sua carta' : `Carta de ${name}`} ${index + 1}`}
            />
          </span>
        );
      })}
    </div>
  );

  return (
    <section
      className={`poker-seat poker-seat--${side}`}
      data-testid={`hand-${side}`}
      aria-label={you ? 'Sua mão' : `Mão de ${name}`}
    >
      {/* O rival tem a placa em CIMA das cartas e você embaixo: as duas
          identidades ficam nas bordas do feltro e as cartas, viradas
          para o centro — a mesa lê como uma mesa vista de cima. */}
      {!you && identity}

      {/* A LINHA DA MÃO em três colunas: vão · cartas · vão.
          Os dois vãos são `1fr`, e é isso que centra o disco e o montante
          EXATAMENTE no espaço que sobra de cada lado — sem número mágico
          nenhum. Antes as duas peças pendiam da borda das cartas e
          ficavam coladas nelas, com todo o vão sobrando do lado de fora.
          Quem tem o disco fica com ele à sua esquerda (a da direita da
          tela, no caso do rival, que está de cabeça para baixo) e o
          montante do outro lado. */}
      <div className="poker-seat__line">
        <span className="poker-seat__gutter">{you ? puck : rack}</span>
        {hand}
        <span className="poker-seat__gutter">{you ? rack : puck}</span>
      </div>
      {you && identity}
    </section>
  );
}
