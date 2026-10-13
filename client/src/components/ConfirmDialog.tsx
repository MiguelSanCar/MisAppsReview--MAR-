import { ReactNode, useEffect, useRef } from 'react';

interface Props {
  title: string;
  message: ReactNode;
  detail?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Ventana emergente de confirmación para acciones que no se pueden deshacer.
 * El foco empieza en «Cancelar» (para no borrar por un Enter accidental); Escape y clic fuera cancelan.
 */
export function ConfirmDialog({ title, message, detail, confirmLabel = 'Borrar', cancelLabel = 'Cancelar', busy, onConfirm, onCancel }: Props) {
  const cancel = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancel.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="modal-wrap" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-msg" onClick={onCancel}>
      <div className="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
        <h2 id="confirm-title" className="h2 first">{title}</h2>
        <p id="confirm-msg" className="confirm-msg">{message}</p>
        {detail && <p className="muted small">{detail}</p>}
        <div className="confirm-actions">
          <button ref={cancel} className="btn ghost" onClick={onCancel} disabled={busy}>{cancelLabel}</button>
          <button className="btn danger-solid" onClick={onConfirm} disabled={busy}>{busy ? 'Borrando…' : confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
