import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';
import { useEffect, useId, useRef } from 'react';

import { Button } from './Button';

export interface ConfirmDialogProps {
  open: boolean;
  /** Cabeçalho curto da decisão (ex.: "Expulsar jogador"). */
  title: string;
  /** A pergunta em si, já com o nome de quem for afetado. */
  message: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** Ação destrutiva: o botão de confirmar vem em vermelho. */
  danger?: boolean;
  /**
   * Disposição das ações. `stack` (padrão) empilha confirmar em cima de
   * cancelar — o desenho certo para as decisões que não se desfazem, em
   * que o botão perigoso não deve ficar a um deslize do dedo do outro.
   * `row` põe os dois lado a lado em 50/50 (confirmar à esquerda), para
   * as perguntas simples de sim ou não.
   */
  actions?: 'stack' | 'row';
  onConfirm: () => void;
  onCancel: () => void;
  'data-testid'?: string;
}

/**
 * Confirmação modal para ações que não dão para desfazer. Mesma
 * linguagem do perfil do adversário (cartão vinho lapidado por cima da
 * tela escurecida), e não um bottom sheet: a pergunta interrompe o
 * fluxo, então nasce no centro do campo de visão.
 *
 * Cancelar é o caminho barato — clique fora, Escape e o próprio botão.
 * O foco vai para o painel ao abrir, para o leitor de tela anunciar a
 * pergunta antes das ações.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancelar',
  danger = false,
  actions = 'stack',
  onConfirm,
  onCancel,
  'data-testid': testId,
}: ConfirmDialogProps) {
  const row = actions === 'row';
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const instant = useReducedMotion() ?? false;

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onCancel]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
          <motion.div
            className="absolute inset-0 bg-black/72"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
            aria-hidden="true"
          />

          <motion.div
            ref={panelRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            data-testid={testId}
            className="profile-card relative w-full max-w-[340px] p-6 text-center outline-none"
            initial={instant ? false : { opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={instant ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.97 }}
            transition={instant ? { duration: 0 } : { type: 'spring', damping: 26, stiffness: 320 }}
          >
            <h2 id={titleId} className="text-base font-black uppercase tracking-[0.2em] text-copper">
              {title}
            </h2>
            <p className="mt-3 text-base font-bold leading-snug text-ivory">{message}</p>

            {/* Confirmar vem primeiro no DOM: à esquerda em linha, em
                cima quando empilhado — a leitura e a ordem de foco são a
                mesma nos dois desenhos. `basis-0` é o que garante as
                metades exatas: sem ele, os botões se mediriam pelo texto
                (um "NÃO" nasceria menor que um "SIM, ENTRAR"). */}
            <div className={`mt-6 flex gap-2 ${row ? 'flex-row' : 'flex-col'}`}>
              <Button
                variant={danger ? 'danger' : 'primary'}
                size="md"
                fullWidth={!row}
                className={row ? 'flex-1 basis-0' : ''}
                onClick={onConfirm}
                data-testid="confirm-dialog-accept"
              >
                {confirmLabel}
              </Button>
              <Button
                variant="secondary"
                size="md"
                fullWidth={!row}
                className={row ? 'flex-1 basis-0' : ''}
                onClick={onCancel}
                data-testid="confirm-dialog-cancel"
              >
                {cancelLabel}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
