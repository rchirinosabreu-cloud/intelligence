import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ARCHIVE_REASON_MAX, collectionArchiveProblem } from '@/lib/receivableArchive';

// Archivar una cuenta del cobro (Elisa y Rodny, 11 de noviembre de 2026): sigue en Cartera con su saldo y su
// historia, pero deja de generar avisos de cartera y sale de la antigüedad de lo vencido. Se desarchiva cuando se quiera.
const field = 'min-h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-white/10 dark:bg-zinc-950 dark:text-white';
const money = value => Number(value || 0).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 2 });

export default function ReceivableArchiveDialog({ debt, saving, error, onClose, onConfirm }) {
  const [reason, setReason] = useState('');
  const problem = collectionArchiveProblem({ reason });
  return <Dialog open={!!debt} onOpenChange={open => !open && !saving && onClose()}><DialogContent data-receivable-archive-dialog className="sm:max-w-md dark:bg-zinc-900">
    <DialogHeader>
      <DialogTitle>Archivar cuenta</DialogTitle>
      <DialogDescription>{debt?.clientName} · saldo {money(debt?.outstanding)}. La cuenta sigue en Cartera con su saldo y su historial, pero pasa a «Cobros archivados», deja de generar avisos y no cuenta como vencida. Puedes desarchivarla cuando quieras.</DialogDescription>
    </DialogHeader>
    <form onSubmit={event => { event.preventDefault(); if (!problem) onConfirm(reason.trim()); }} className="space-y-4">
      <label className="block space-y-1.5 text-sm"><span className="block">Motivo</span>
        <textarea required autoFocus maxLength={ARCHIVE_REASON_MAX} rows={3} className={field} value={reason} onChange={event => setReason(event.target.value)} placeholder="Deuda de periodos anteriores en revisión" />
      </label>
      {error && <p role="alert" className="text-sm text-destructive brain-destructive-text">{error}</p>}
      <DialogFooter>
        <button type="button" className="min-h-11 rounded-lg px-4 text-sm" onClick={onClose}>Cancelar</button>
        <button type="submit" disabled={saving || Boolean(problem)} className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">{saving ? 'Archivando…' : 'Archivar'}</button>
      </DialogFooter>
    </form>
  </DialogContent></Dialog>;
}
