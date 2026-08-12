import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';

import { Button } from '@/shared/components/Button';
import { Icon } from '@/shared/components/Icon';
import { Sheet } from '@/shared/components/Sheet';
import { formatCredits } from '@/shared/lib/format';

import { AmountStepper } from '../../components/AmountStepper';
import { OPEN_TABLE_ENABLED } from '../availability';
import { MIN_STAKE } from '../../engine/credits';
import { useGameStore } from '../../store/gameStore';
import { randomLobbyPassword, suggestLobbyName } from '../simulation';
import { useTournamentStore } from '../tournamentStore';
import type { LobbyVisibility, TableMode, TournamentFormat, TournamentSize } from '../types';
import {
  CASH_DEFAULT_BLIND,
  CASH_DEFAULT_BUY_IN,
  CASH_MIN_BLIND,
  CASH_MIN_BLINDS_DEEP,
  CASH_SIZES,
  TABLE_MODES,
  defaultSizeFor,
  isCash,
  seatsHint,
  tableModeHint,
  tableModeLabel,
} from '../types';
import { PrizeSplit } from './PrizeSplit';

export interface CreateLobbySheetProps {
  open: boolean;
  onClose: () => void;
}

const NAME_MAX = 24;
const PASSWORD_LENGTH = 4;

/**
 * Criação de sala: a pessoa define TODAS as características antes de a
 * sala existir — nome, visibilidade, número de jogadores, taxa de
 * entrada e, sendo privada, a senha. Nada disso vira pergunta depois;
 * a taxa, em especial, fica fixa a partir daqui.
 *
 * O X do cabeçalho (do próprio Sheet) é a saída: fechar não cria sala
 * nenhuma, então desistir no meio do preenchimento não custa nada.
 *
 * Cada abertura é uma sala nova, com nome e senha sugeridos na hora —
 * quem remonta a folha (e portanto zera este formulário) é a chave posta
 * pela tela de salas, não um efeito de sincronização aqui dentro.
 */
export function CreateLobbySheet({ open, onClose }: CreateLobbySheetProps) {
  const createLobby = useTournamentStore((s) => s.createLobby);
  const balance = useGameStore((s) => s.balance);

  const [visibility, setVisibility] = useState<LobbyVisibility>('public');
  const [name, setName] = useState(suggestLobbyName);
  /* A SALA É DE POKER, e isso deixou de ser uma escolha. O formato
     sobrevive como constante porque o store, a vitrine e o histórico
     ainda falam essa língua — e porque os outros dois modos continuam
     inteiros no projeto, atrás de `BRACKET_ENABLED`. */
  const format: TournamentFormat = 'cash';
  const [size, setSize] = useState<TournamentSize>(defaultSizeFor('cash'));
  /* Com a mesa aberta desligada, toda sala nasce FECHADA — e o estado
     inicial diz isso, para a folha não criar uma sala aberta sem nunca
     ter perguntado (ver `OPEN_TABLE_ENABLED`). */
  const [mode, setMode] = useState<TableMode>(OPEN_TABLE_ENABLED ? 'open' : 'closed');
  // Buy-in e blind são texto enquanto se digita, como a taxa: o campo
  // precisa poder ficar vazio no meio da edição.
  const [buyInDraft, setBuyInDraft] = useState(String(CASH_DEFAULT_BUY_IN));
  const [blindDraft, setBlindDraft] = useState(String(CASH_DEFAULT_BLIND));
  // A taxa é texto enquanto se digita (o campo precisa poder ficar
  // vazio); o número derivado alimenta a validação E a premiação, que
  // por isso recalcula a cada tecla.
  const [feeDraft, setFeeDraft] = useState(String(MIN_STAKE));
  const [password, setPassword] = useState(randomLobbyPassword);
  const [touched, setTouched] = useState(false);

  const fee = Number.parseInt(feeDraft, 10) || 0;
  const buyIn = Number.parseInt(buyInDraft, 10) || 0;
  const blind = Number.parseInt(blindDraft, 10) || 0;
  const trimmed = name.trim();
  const isPrivate = visibility === 'private';
  const cash = isCash(format);
  const nameError = trimmed.length === 0 ? 'Dê um nome à sala.' : null;
  const passwordError =
    isPrivate && password.length !== PASSWORD_LENGTH
      ? `A senha tem ${PASSWORD_LENGTH} dígitos.`
      : null;
  const feeError =
    fee < MIN_STAKE
      ? `A taxa mínima é de ${MIN_STAKE} créditos.`
      : fee > balance
        ? 'Sua taxa precisa caber no saldo.'
        : null;

  /* A ECONOMIA DA MESA DE CASH. As três regras existem para impedir uma
     mesa que não dá jogo:
     - o buy-in sai DO SEU SALDO na hora de sentar, então precisa caber;
     - um blind sem piso não pressiona ninguém e a mão nunca fecha;
     - um buy-in raso demais não é poker: com menos de 20 blinds na
       frente, toda mão vira all-in pré-flop. */
  const blindError = blind < CASH_MIN_BLIND ? `O blind mínimo é ${CASH_MIN_BLIND}.` : null;
  const buyInError =
    buyIn > balance
      ? 'O buy-in precisa caber no seu saldo.'
      : blind > 0 && buyIn < blind * CASH_MIN_BLINDS_DEEP
        ? `Com este blind, o buy-in mínimo é ${formatCredits(blind * CASH_MIN_BLINDS_DEEP)}.`
        : null;

  const error = cash
    ? (nameError ?? passwordError ?? blindError ?? buyInError)
    : (nameError ?? passwordError ?? feeError);

  const submit = () => {
    setTouched(true);
    if (error) return;
    createLobby({ name: trimmed, visibility, format, size, fee, password, mode, buyIn, blind });
    onClose();
  };

  return (
    <Sheet open={open} title="Criar sala" onClose={onClose}>
      <div className="flex flex-col gap-5">
        {/* Visibilidade: define se a sala pede senha na porta. */}
        <Field label="Visibilidade">
          <div className="seg seg--full" role="group" aria-label="Visibilidade da sala">
            {(['public', 'private'] as LobbyVisibility[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setVisibility(option)}
                aria-pressed={visibility === option}
                className={`seg__btn ${visibility === option ? 'seg__btn--on' : ''}`}
                data-testid={`create-visibility-${option}`}
              >
                <Icon
                  name={option === 'public' ? 'globe' : 'lock'}
                  size="0.95em"
                  className="mr-1 inline align-[-0.1em]"
                />
                {option === 'public' ? 'Pública' : 'Privada'}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Nome da sala" error={touched ? nameError : null}>
          <div className="field__wrap">
            <input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, NAME_MAX))}
              maxLength={NAME_MAX}
              placeholder="Nome da sala"
              aria-label="Nome da sala"
              className="field__input"
              data-testid="create-name"
            />
            <span className="field__counter" aria-hidden="true">
              {trimmed.length}/{NAME_MAX}
            </span>
          </div>
        </Field>

        {/* A senha só existe na sala privada, e vem colada no nome: as
            duas são a identidade da sala — como ela se chama e como se
            entra nela. Mesma caixa, mesmo tamanho. */}
        <AnimatePresence initial={false}>
          {isPrivate && (
            <motion.div
              key="password"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.22 }}
              className="overflow-hidden"
            >
              <Field label="Senha da sala" error={touched ? passwordError : null}>
                <input
                  value={password}
                  onChange={(e) =>
                    setPassword(e.target.value.replace(/\D/g, '').slice(0, PASSWORD_LENGTH))
                  }
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={PASSWORD_LENGTH}
                  placeholder="0000"
                  aria-label="Senha da sala"
                  className="field__input"
                  data-testid="create-password"
                />
              </Field>
            </motion.div>
          )}
        </AnimatePresence>

        {/* QUANTAS PESSOAS SENTAM — a escolha que substituiu o formato.
            Só há um jogo nesta casa, e é poker: perguntar "qual formato"
            era pedir para escolher entre um jogo e dois modos de outro.
            O que muda de sala para sala é o TAMANHO DA MESA, e ele muda o
            jogo de verdade: numa mesa de três a mão média que se joga é
            muito mais larga que numa de seis, porque há menos mãos para
            bater. Escolhido aqui, vira contrato — a sala nasce com o
            número de lugares que tem. */}
        <Field label="Participantes">
          <div className="seg seg--full" role="group" aria-label="Número de participantes">
            {CASH_SIZES.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setSize(n)}
                aria-pressed={size === n}
                aria-label={`${n} participantes`}
                className={`seg__btn ${size === n ? 'seg__btn--on' : ''}`}
                data-testid={`create-size-${n}`}
              >
                <Icon name="users" size="0.9em" className="mr-1 inline align-[-0.1em]" />
                {n}
              </button>
            ))}
          </div>
          <p className="field__hint" data-testid="create-seats-hint">
            {seatsHint(Number(size))} Você compra fichas, paga o blind e sai quando quiser.
          </p>
        </Field>

        {/* MESA ABERTA OU FECHADA — a decisão que muda o que acontece
            DEPOIS de a partida começar, e por isso vem antes do dinheiro:
            é ela que diz se a sala continua na vitrine.
            Só existe no cash: um torneio sempre fecha ao iniciar, porque
            o chaveamento já foi montado com quem estava lá.
            HOJE ELA NÃO É PERGUNTADA: a mesa aberta está desligada e toda
            sala nasce fechada (ver `OPEN_TABLE_ENABLED`). O campo fica
            aqui inteiro, atrás do flag — a régua volta com uma edição de
            um caractere. */}
        {cash && OPEN_TABLE_ENABLED && (
          <Field label="Entrada na mesa">
            <div className="seg seg--full" role="group" aria-label="Mesa aberta ou fechada">
              {TABLE_MODES.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setMode(option)}
                  aria-pressed={mode === option}
                  className={`seg__btn ${mode === option ? 'seg__btn--on' : ''}`}
                  data-testid={`create-mode-${option}`}
                >
                  <Icon
                    name={option === 'open' ? 'users' : 'lock'}
                    size="0.95em"
                    className="mr-1 inline align-[-0.1em]"
                  />
                  {tableModeLabel(option)}
                </button>
              ))}
            </div>
            <p className="field__hint">{tableModeHint(mode)}</p>
          </Field>
        )}

        {/* OS DOIS VALORES QUE A VITRINE ANUNCIA. Eles vêm em campo
            separado e nesta ordem — primeiro com quanto se senta, depois
            quanto custa cada mão — porque é assim que um jogador lê uma
            mesa: quanto arrisco, e por quanto tempo isso dura. */}
        {cash && (
          <>
            <Field label="Fichas ao sentar" error={touched ? buyInError : null}>
              <AmountStepper
                value={buyInDraft}
                onChange={setBuyInDraft}
                label="Buy-in em créditos"
                placeholder={`Mín. ${blind * CASH_MIN_BLINDS_DEEP}`}
                data-testid="create-buyin"
                stepTestIdPrefix="create-buyin-plus"
              />
              <p className="field__hint">
                Sai do seu saldo ao sentar e volta ao levantar. Seu saldo: {formatCredits(balance)}.
              </p>
            </Field>

            <Field label="Blind por mão" error={touched ? blindError : null}>
              <AmountStepper
                value={blindDraft}
                onChange={setBlindDraft}
                label="Blind em créditos"
                placeholder={`Mín. ${CASH_MIN_BLIND}`}
                data-testid="create-blind"
                stepTestIdPrefix="create-blind-plus"
              />
              <p className="field__hint" data-testid="create-depth">
                {blind > 0
                  ? `${Math.floor(buyIn / blind)} blinds na frente de cada um.`
                  : 'O que cada um paga antes de ver carta, a cada mão.'}
              </p>
            </Field>
          </>
        )}

        {/* Taxa livre, no mesmo campo com atalhos da mesa de negociação:
            o valor é da pessoa, não de uma lista de fichas.
            No cash não há taxa nem premiação: o dinheiro é o buy-in, e
            ele volta para quem levantar da mesa com ele. */}
        {!cash && (
          <Field label="Taxa de entrada" error={touched ? feeError : null}>
            <AmountStepper
              value={feeDraft}
              onChange={setFeeDraft}
              label="Taxa de entrada em créditos"
              placeholder={`Mín. ${MIN_STAKE}`}
              data-testid="create-fee"
              stepTestIdPrefix="create-fee-plus"
            />
            <p className="field__hint">
              Seu saldo: {formatCredits(balance)} créditos. Só sai do seu saldo se você perder.
            </p>
          </Field>
        )}

        {/* Recalcula a cada tecla: a premiação é função direta da taxa e
            do tamanho da mesa, então acompanha o campo acima ao vivo. */}
        {!cash && (
          <Field label="Premiação">
            <PrizeSplit fee={fee} size={size} format={format} data-testid="create-prize" />
          </Field>
        )}

        <Button onClick={submit} size="md" fullWidth data-testid="create-confirm">
          <Icon name={isPrivate ? 'lock' : 'globe'} /> CRIAR SALA
        </Button>
      </div>
    </Sheet>
  );
}

/** Bloco rotulado do formulário: título de cobre, campo e erro embaixo. */
function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-black uppercase tracking-widest text-copper">{label}</p>
      {children}
      {error && (
        <p className="field__error" role="alert">
          <Icon name="warning" size="0.95em" className="mr-1 inline align-[-0.1em]" />
          {error}
        </p>
      )}
    </div>
  );
}
