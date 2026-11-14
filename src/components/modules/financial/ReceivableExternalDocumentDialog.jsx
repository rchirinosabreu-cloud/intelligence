import React, { useState } from 'react';
import { BrainDatePicker } from '@/components/ui/BrainDatePicker';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { externalDocumentProblem } from '@/lib/receivableDocument';

// «Ya la emití en Word» (Elisa, 13 de noviembre de 2026, con Haad: «no aparece el número de consecutivo de la
// cuenta de cobro … poder editarlo ahí mismo para poner la que ya yo le había mandado»). Solo número y fecha:
// no hay PDF que generar y el valor se sigue corrigiendo con el lápiz. La misma ventana cambia el número de una
// ya anotada así; una emitida por la plataforma no pasa por aquí.
const field = 'min-h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 disabled:opacity-70 dark:border-white/10 dark:bg-zinc-950 dark:text-white';

export default function ReceivableExternalDocumentDialog({ debt, saving, error, onClose, onSubmit }) {
  const changing = Boolean(debt?.externalDocument && debt?.number);
  const [form, setForm] = useState({
    number: changing ? String(debt.number) : '',
    issuedAt: debt?.issuedAt ? String(debt.issuedAt).slice(0, 10) : '',
    servicePeriod: debt?.servicePeriod || ''
  });
  const [touched, setTouched] = useState(false);
  const set = patch => setForm(current => ({ ...current, ...patch }));
  const problem = externalDocumentProblem(form);
  const submit = event => {
    event.preventDefault();
    setTouched(true);
    if (problem) return;
    onSubmit({ number: Number(form.number.trim()), issuedAt: form.issuedAt, servicePeriod: form.servicePeriod.trim() });
  };
  return <Dialog open={!!debt} onOpenChange={open => !open && !saving && onClose()}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg dark:bg-zinc-900" onOpenAutoFocus={event => { event.preventDefault(); event.currentTarget.focus(); }}>
    <DialogHeader>
      <DialogTitle>{changing ? `Cambiar el número de la cuenta de cobro ${debt.formattedNumber}` : 'Ya la emití en Word'}</DialogTitle>
      <DialogDescription>{debt?.clientName} · Se anotan el número y la fecha de la cuenta de cobro que ya se mandó, para que el estado de cuenta la nombre. No se genera otro PDF y el valor se sigue corrigiendo con el lápiz.</DialogDescription>
    </DialogHeader>
    <form onSubmit={submit} className="space-y-4" data-receivable-external-document>
      <fieldset disabled={saving} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5 text-sm"><span className="block">Número de la cuenta de cobro</span>
            <input required inputMode="numeric" pattern="[0-9]*" className={field} value={form.number} onChange={event => set({ number: event.target.value.replace(/\D/g, '') })} placeholder="Ej.: 380" aria-describedby="receivable-external-number-help" />
            <span id="receivable-external-number-help" className="block text-xs text-zinc-500">Tal como salió en Word, sin ceros a la izquierda.</span>
          </label>
          <label className="block space-y-1.5 text-sm"><span className="block">Fecha de emisión</span><BrainDatePicker required className={field} value={form.issuedAt} onChange={issuedAt => set({ issuedAt })} ariaLabel="Fecha de emisión de la cuenta de cobro" /></label>
        </div>
        <label className="block space-y-1.5 text-sm"><span className="block">Periodo del servicio <span className="font-normal text-zinc-400">(opcional)</span></span><input className={field} maxLength={120} value={form.servicePeriod} onChange={event => set({ servicePeriod: event.target.value })} placeholder="Ej.: 1 de julio al 31 de julio" /></label>
        {touched && problem && <p role="alert" className="text-sm text-destructive brain-destructive-text">{problem}</p>}
        {error && <p role="alert" className="text-sm text-destructive brain-destructive-text">{error}</p>}
        <DialogFooter><button type="button" className="min-h-11 rounded-lg px-4 text-sm" onClick={onClose}>Cancelar</button><button type="submit" disabled={saving} className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">{saving ? 'Guardando…' : changing ? 'Guardar número' : 'Anotar cuenta de cobro'}</button></DialogFooter>
      </fieldset>
    </form>
  </DialogContent></Dialog>;
}
