import React from 'react';

export default function DraftNotice({ draft, disabled = false }) {
  if (!draft.saved && !draft.restored && !draft.unavailable && !draft.conflict) return null;
  return <div data-form-draft className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-600 dark:text-zinc-300">
    <span role={draft.conflict ? 'alert' : 'status'}>{draft.conflict ? 'El registro cambió desde que empezaste este borrador. Recuperarlo sustituye los campos del formulario por tu copia local. Elige recuperar o descartar antes de continuar.' : draft.unavailable ? 'No se pudo conservar el borrador en este navegador.' : draft.restored ? 'Se recuperó lo que estabas escribiendo.' : 'Borrador conservado en este navegador.'}</span>
    {draft.conflict && <button type="button" disabled={disabled} onClick={draft.recover} className="min-h-11 text-primary underline underline-offset-2 disabled:opacity-50">Recuperar borrador</button>}
    <button type="button" disabled={disabled} onClick={draft.discard} className="min-h-11 text-destructive brain-destructive-text underline underline-offset-2 disabled:opacity-50">Descartar borrador</button>
  </div>;
}
