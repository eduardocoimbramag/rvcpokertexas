import { motion } from 'framer-motion';
import { useState } from 'react';

import { Button } from '@/shared/components/Button';
import { Icon } from '@/shared/components/Icon';
import { Sheet } from '@/shared/components/Sheet';
import { formatCredits } from '@/shared/lib/format';

import { useTournamentStore } from '../tournamentStore';
import type { LobbyListing } from '../types';

export interface JoinPrivateSheetProps {
  /** Sala privada escolhida na lista; `null` mantém a folha fechada. */
  lobby: LobbyListing | null;
  onClose: () => void;
}

/**
 * Porta da sala privada. A sala está na lista como qualquer outra — o
 * que ela guarda é a entrada: sem os 4 dígitos do anfitrião, não passa.
 *
 * O convite mostra o código porque, num app local, não existe o "fora
 * do jogo" onde ele seria combinado; o gesto de digitar continua real, e
 * a validação mora no store (nenhuma tela consegue pular a senha).
 */
export function JoinPrivateSheet({ lobby, onClose }: JoinPrivateSheetProps) {
  const joinLobby = useTournamentStore((s) => s.joinLobby);
  // Campo e erro nascem limpos a cada tentativa: quem zera é a chave
  // que a tela de salas troca ao abrir a folha.
  const [code, setCode] = useState('');
  const [wrong, setWrong] = useState(false);

  const submit = () => {
    if (!lobby) return;
    if (joinLobby(lobby, code)) {
      onClose();
      return;
    }
    setWrong(true);
  };

  return (
    <Sheet open={lobby !== null} title="Sala privada" onClose={onClose}>
      {lobby && (
        <div className="flex flex-col gap-5">
          <div className="lobby-card lobby-card--static">
            <span className="lobby-card__crown text-gold" aria-hidden="true">
              <Icon name="lock" />
            </span>
            <span className="min-w-0 flex-1 text-left">
              <span className="block truncate font-bold text-ivory">{lobby.name}</span>
              <span className="block text-xs text-lavender">
                por {lobby.hostName} ·{' '}
                <Icon name="chip" size="0.85em" className="inline align-[-0.1em]" />{' '}
                {formatCredits(lobby.fee)}
              </span>
            </span>
            <span className="lobby-card__count">
              {lobby.filled}/{lobby.size}
            </span>
          </div>

          <div>
            <p className="mb-2 text-xs font-black uppercase tracking-widest text-copper">
              Senha de entrada
            </p>
            <motion.input
              value={code}
              onChange={(e) => {
                setCode(e.target.value.replace(/\D/g, '').slice(0, 4));
                setWrong(false);
              }}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              placeholder="0000"
              aria-label="Senha da sala"
              aria-invalid={wrong}
              className={`field__input field__input--code w-full text-center ${wrong ? 'field__input--wrong' : ''}`}
              data-testid="join-password"
              // Senha errada: a caixa nega com a cabeça em vez de só
              // pintar de vermelho — o erro se sente antes de se ler.
              animate={wrong ? { x: [0, -7, 7, -5, 5, 0] } : { x: 0 }}
              transition={{ duration: 0.32 }}
            />
            {wrong && (
              <p className="field__error" role="alert" data-testid="join-error">
                <Icon name="warning" size="0.95em" className="mr-1 inline align-[-0.1em]" />
                Senha incorreta. Confira com {lobby.hostName}.
              </p>
            )}
            <p className="field__invite">
              <Icon name="send" size="0.95em" className="mr-1 inline align-[-0.1em]" />
              Convite de {lobby.hostName} · senha{' '}
              <span className="field__invite-code">{lobby.password}</span>
            </p>
          </div>

          <Button onClick={submit} size="md" fullWidth data-testid="join-confirm">
            <Icon name="check" /> ENTRAR NA SALA
          </Button>
        </div>
      )}
    </Sheet>
  );
}
