import React, { useRef, useState } from 'react';
import Select from '@/components/ui/Select';
import MoneyInput from '@/components/ui/MoneyInput';
import { BrainDatePicker } from '@/components/ui/BrainDatePicker';
import { Paperclip } from '@/components/ui/icons';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FINANCIAL_DOCUMENT_ACCEPT, financialDocumentProblem } from '@/lib/financialDocumentsClient';
import { payablePaymentProblem } from '@/lib/accountsPayable';

// Pagar una cuenta por pagar (20 de octubre de 2026): el egreso sale de la cuenta que se elija y
// queda en Movimientos ligado al pago. El comprobante se sube a ese egreso después de que el
// servidor confirme el pago, como en Cartera.
const field = 'min-h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 disabled:opacity-70 dark:border-white/10 dark:bg-zinc-950 dark:text-white';
const money = (value) => Number(value || 0).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 2 });
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });

export default function PayablePaymentDialog({ payable, accounts = [], saving, error, onClose, onSubmit }) {
  const [form, setForm] = useState({ amount: payable ? String(payable.outstanding) : '', paidAt: today(), accountId: '', reference: '', notes: '', file: null });
  const [problem, setProblem] = useState('');
  const [fileProblem, setFileProblem] = useState('');
  const fileInput = useRef(null);
  const set = (patch) => { setProblem(''); setForm((current) => ({ ...current, ...patch })); };
  const submit = (event) => {
    event.preventDefault();
    const found = payablePaymentProblem({ ...form, outstanding: payable?.outstanding });
    if (found) { setProblem(found); return; }
    onSubmit({ ...form, amount: Number(form.amount) });
  };
  const shown = problem || error;
  return <Dialog open={!!payable} onOpenChange={(next) => !next && !saving && onClose()}><DialogContent data-payable-payment-dialog className="max-h-[90vh] overflow-y-auto sm:max-w-lg dark:bg-zinc-900">
    <DialogHeader><DialogTitle>Registrar pago</DialogTitle><DialogDescription>{payable?.thirdParty?.name} · {payable?.concept} · saldo pendiente {money(payable?.outstanding)}. El egreso queda en Movimientos ligado a este pago.</DialogDescription></DialogHeader>
    <form onSubmit={submit} className="space-y-4"><fieldset disabled={saving} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5 text-sm"><span className="block">Valor pagado</span><MoneyInput required className={field} min="0.01" max={payable?.outstanding} value={form.amount} onChange={(amount) => set({ amount })} /></label>
        <label className="block space-y-1.5 text-sm"><span className="block">Fecha del pago</span><BrainDatePicker required className={field} value={form.paidAt} onChange={(paidAt) => set({ paidAt })} ariaLabel="Fecha del pago" /></label>
      </div>
      <label className="block space-y-1.5 text-sm"><span className="block">Cuenta de la que salió</span><Select required className={field} value={form.accountId} onChange={(event) => set({ accountId: event.target.value })}><option value="">Seleccionar…</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</Select></label>
      <label className="block space-y-1.5 text-sm"><span className="block">Referencia <span className="text-zinc-400">(opcional)</span></span><input className={field} value={form.reference} maxLength={120} onChange={(event) => set({ reference: event.target.value })} /></label>
      <label className="block space-y-1.5 text-sm"><span className="block">Notas <span className="text-zinc-400">(opcional)</span></span><textarea className={field} rows={2} maxLength={500} value={form.notes} onChange={(event) => set({ notes: event.target.value })} /></label>
      <div className="space-y-1.5 text-sm">
        <span className="block">Comprobante <span className="text-zinc-400">(opcional)</span></span>
        <input ref={fileInput} type="file" className="sr-only" accept={FINANCIAL_DOCUMENT_ACCEPT}
          onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; const found = financialDocumentProblem(file); setFileProblem(found || ''); if (!found) set({ file: file || null }); }} />
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <button type="button" onClick={() => fileInput.current?.click()} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-zinc-200 px-3 text-sm dark:border-white/10"><Paperclip className="h-4 w-4" />{form.file ? 'Cambiar archivo' : 'Subir comprobante'}</button>
          {form.file && <span className="min-w-0 truncate text-xs text-zinc-500">{form.file.name}</span>}
        </div>
        {fileProblem && <p role="alert" className="text-xs text-destructive brain-destructive-text">{fileProblem}</p>}
      </div>
      {shown && <p role="alert" className="text-sm text-destructive brain-destructive-text">{shown}</p>}
      <DialogFooter><button type="button" className="min-h-11 rounded-lg px-4 text-sm" onClick={onClose}>Cancelar</button><button type="submit" disabled={saving} className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">{saving ? 'Guardando…' : 'Guardar pago'}</button></DialogFooter>
    </fieldset></form>
  </DialogContent></Dialog>;
}
