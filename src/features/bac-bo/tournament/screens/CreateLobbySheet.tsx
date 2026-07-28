import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';

import { Button } from '@/shared/components/Button';
import { Icon } from '@/shared/components/Icon';
import { Sheet } from '@/shared/components/Sheet';
import { formatCredits } from '@/shared/lib/format';

import { AmountStepper } from '../../components/AmountStepper';
import { MIN_STAKE } from '../../engine/credits';
import { useGameStore } from '../../store/gameStore';
import { randomLobbyPassword, suggestLobbyName } from '../simulation';
import { useTournamentStore } from '../tournamentStore';
import type { LobbyVisibility, TournamentSize } from '../types';
import { TOURNAMENT_SIZES } from '../types';
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
  const [size, setSize] = useState<TournamentSize>(8);
  // A taxa é texto enquanto se digita (o campo precisa poder ficar
  // vazio); o número derivado alimenta a validação E a premiação, que
  // por isso recalcula a cada tecla.
  const [feeDraft, setFeeDraft] = useState(String(MIN_STAKE));
  const [password, setPassword] = useState(randomLobbyPassword);
  const [touched, setTouched] = useState(false);

  const fee = Number.parseInt(feeDraft, 10) || 0;
  const trimmed = name.trim();
  const isPrivate = visibility === 'private';
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
  const error = nameError ?? passwordError ?? feeError;

  const submit = () => {
    setTouched(true);
    if (error) return;
    createLobby({ name: trimmed, visibility, size, fee, password });
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

        {/* O quantitativo se decide AQUI e vira contrato: depois de criada
            a sala, não há onde mudá-lo. Com 16, o chaveamento abre nas
            oitavas de final. */}
        <Field label="Jogadores">
          <div className="seg seg--full" role="group" aria-label="Número de jogadores">
            {TOURNAMENT_SIZES.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setSize(n)}
                aria-pressed={size === n}
                className={`seg__btn ${size === n ? 'seg__btn--on' : ''}`}
                data-testid={`create-size-${n}`}
              >
                {n} jogadores
              </button>
            ))}
          </div>
          <p className="field__hint">Fixo após a criação da sala.</p>
        </Field>

        {/* Taxa livre, no mesmo campo com atalhos da mesa de negociação:
            o valor é da pessoa, não de uma lista de fichas. */}
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

        {/* Recalcula a cada tecla: a premiação é função direta da taxa e
            do tamanho da mesa, então acompanha o campo acima ao vivo. */}
        <Field label="Premiação">
          <PrizeSplit fee={fee} size={size} data-testid="create-prize" />
        </Field>

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
