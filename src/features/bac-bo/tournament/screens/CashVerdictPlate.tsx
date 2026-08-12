import { formatCredits } from '@/shared/lib/format';

import { WinnerPlateFrame } from '../../components/poker/WinnerPlate';
import type { CashVerdict } from '../tournamentStore';

/**
 * O DESFECHO DA MÃO na mesa de seis — a MESMA janela do duelo.
 *
 * Não parecida: a mesma. A moldura é a do 1v1 (`WinnerPlateFrame`), e o
 * que entra nela é o que entra lá — quem levou, a leitura da mão, o que
 * a completa e as cartas que decidiram. Aqui já houve uma peça própria,
 * e depois uma versão com um balanço grande em cima; as duas eram
 * "parecidas de longe", que foi exatamente o que o dono da mesa apontou
 * como defeito.
 *
 * O BALANÇO DA MÃO saiu daqui, e não se perdeu: ele agora é uma LINHA do
 * histórico da mesa (ver `TableTools`), que é onde ele vale mais — lá
 * ele vem com as outras mãos ao lado e com o saldo da sessão em cima, em
 * vez de aparecer e sumir em cinco segundos.
 *
 * O que a mesa de anel ainda acrescenta é o POTE DIVIDIDO: podem existir
 * dois vencedores na mesma mão — um leva o principal, outro o lateral —,
 * e a placa precisa saber dizer isso sem virar uma tabela. O duelo não
 * tem como ter esse caso.
 *
 * A COR É DA SUA SORTE, não da do vencedor. Numa mesa de seis, saber que
 * "a Zara levou" é notícia de terceiro; o que se lê na cor é se sobrou ou
 * faltou ficha na sua frente. É a mesma semântica do duelo, lida do seu
 * lado da mesa.
 */

export interface CashVerdictPlateProps {
  verdict: CashVerdict;
  /** Você abriu a mão desta rodada. */
  shown: boolean;
  instant: boolean;
}

export function CashVerdictPlate({ verdict, shown, instant }: CashVerdictPlateProps) {
  const { winners, label, detail, deciding, showdown, netChange } = verdict;
  const nomes = winners.map((w) => w.name).join(' e ');
  const dividiu = winners.length > 1;

  /* SEM SHOWDOWN NÃO HÁ MÃO A MOSTRAR: ninguém pagou para ver, e a placa
     não conta o que não foi comprado. É a mesma "mão guardada" do duelo,
     com as duas interrogações no lugar das cartas. */
  const concealed = !showdown;

  return (
    <WinnerPlateFrame
      data={{
        tone: netChange > 0 ? 'player' : netChange < 0 ? 'opponent' : 'tie',
        who: dividiu ? `${nomes} dividiram` : nomes,
        hand: concealed ? 'MÃO GUARDADA' : (label?.toUpperCase() ?? 'POTE ENTREGUE'),
        detail: concealed ? null : detail,
        note: concealed ? 'ninguém pagou para ver' : null,
        cards: deciding,
        concealed,
        outcome: netChange > 0 ? 'win' : netChange < 0 ? 'lose' : 'tie',
        /* A coroa é do DONO do pote, e um pote dividido não tem dono —
           coroar ali seria mentir sobre o que a mesa fez. */
        crowned: !dividiu,
      }}
      testId="cash-verdict"
      instant={instant}
    >
      {/* O `who` da moldura já diz quem levou; este espelho existe para os
          testes e para o leitor de tela terem um alvo estável, e não
          repete nada na tela. */}
      <span className="sr-only" data-testid="cash-verdict-who">
        {dividiu ? `${nomes} dividiram` : `${nomes} levou`}
        {label ? ` com ${label}` : ''}
      </span>

      {dividiu && (
        <span className="cash-verdict__split" data-testid="cash-verdict-split">
          {winners.map((w) => (
            <span key={w.seat}>
              {w.name} <strong>{formatCredits(w.won)}</strong>
            </span>
          ))}
        </span>
      )}

      {shown && (
        <span className="cash-verdict__shownflag" data-testid="cash-shown">
          Você mostrou a mão.
        </span>
      )}
    </WinnerPlateFrame>
  );
}
