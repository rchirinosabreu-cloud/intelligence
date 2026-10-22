import React, { useState } from 'react';
import Select from '@/components/ui/Select';
import MoneyInput from '@/components/ui/MoneyInput';
import { BrainDatePicker } from '@/components/ui/BrainDatePicker';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PAYABLE_CATEGORY_OPTIONS, payableProblem, thirdPartyKindLabel } from '@/lib/accountsPayable';

// Una cuenta por pagar (Rodny, 20 de octubre de 2026): el documento que llegó de un tercero —factura,
// cuenta de cobro, recibo— con su valor, su fecha y su vencimiento. El soporte se adjunta después,
// en la propia cuenta.
const field = 'min-h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 disabled:opacity-70 dark:border-white/10 dark:bg-zinc-950 dark:text-white';
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
const day = (value) => (value ? String(value).slice(0, 10) : '');

export default function PayableDialog({ open, payable, thirdParties = [], saving, error, onClose, onSubmit, onNewThirdParty, defaultThirdPartyId = '' }) {
  const [form, setForm] = useState(() => payable
    ? { thirdPartyId: payable.thirdPartyId, concept: payable.concept || '', category: payable.category || '', amount: String(payable.amount ?? ''), receivedAt: day(payable.receivedAt), dueDate: day(payable.dueDate), documentNumber: payable.documentNumber || '', notes: payable.notes || '' }
    : { thirdPartyId: defaultThirdPartyId, concept: '', category: 'OPERATIVO', amount: '', receivedAt: today(), dueDate: '', documentNumber: '', notes: '' });
  const [problem, setProblem] = useState('');
  const set = (patch) => { setProblem(''); setForm((current) => ({ ...current, ...patch })); };
  const submit = (event) => {
    event.preventDefault();
    const found = payableProblem(form);
    if (found) { setProblem(found); return; }
    onSubmit({ ...form, amount: Number(form.amount) });
  };
  const shown = problem || error;
  return <Dialog open={open} onOpenChange={(next) => !next && !saving && onClose()}><DialogContent data-payable-dialog className="max-h-[90vh] overflow-y-auto sm:max-w-lg dark:bg-zinc-900" onOpenAutoFocus={(event) => { event.preventDefault(); event.currentTarget.focus(); }}>
    <DialogHeader><DialogTitle>{payable ? 'Corregir cuenta por pagar' : 'Nueva cuenta por pagar'}</DialogTitle><DialogDescription>Lo que llegó de un tercero y hay que pagar. Al pagarla, el egreso queda en Movimientos ligado a ella.</DialogDescription></DialogHeader>
    <form onSubmit={submit} className="space-y-4"><fieldset disabled={saving} className="space-y-4">
      <div className="space-y-1.5 text-sm">
        <div className="flex items-center justify-between"><span>Tercero</span>{!payable && onNewThirdParty && <button type="button" data-payable-new-third-party onClick={onNewThirdParty} className="text-xs font-semibold text-primary hover:underline">Nuevo tercero</button>}</div>
        <Select required disabled={!!payable} className={field} value={form.thirdPartyId} onChange={(event) => set({ thirdPartyId: event.target.value })} aria-label="Tercero">
          <option value="">Seleccionar…</option>
          {thirdParties.filter((item) => item.isActive !== false || item.id === form.thirdPartyId).map((item) => <option key={item.id} value={item.id}>{item.name} · {thirdPartyKindLabel(item.kind)}</option>)}
        </Select>
        {!payable && thirdParties.length === 0 && <p className="text-xs text-zinc-500">Todavía no hay terceros: crea el primero con «Nuevo tercero».</p>}
      </div>
      <label className="block space-y-1.5 text-sm"><span className="block">Concepto</span><input required className={field} value={form.concept} maxLength={300} onChange={(event) => set({ concept: event.target.value })} placeholder="Ej.: Arriendo de octubre" /></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5 text-sm"><span className="block">Categoría del gasto</span><Select required className={field} value={form.category} onChange={(event) => set({ category: event.target.value })}>{PAYABLE_CATEGORY_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label>
        <label className="block space-y-1.5 text-sm"><span className="block">Valor</span><MoneyInput required className={field} min="0.01" value={form.amount} onChange={(amount) => set({ amount })} /></label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5 text-sm"><span className="block">Llegó el</span><BrainDatePicker required className={field} value={form.receivedAt} onChange={(receivedAt) => set({ receivedAt })} ariaLabel="Fecha en que llegó el documento" /></label>
        <label className="block space-y-1.5 text-sm"><span className="block">Vence el <span className="text-zinc-400">(opcional)</span></span><BrainDatePicker className={field} value={form.dueDate} onChange={(dueDate) => set({ dueDate })} ariaLabel="Fecha de vencimiento" isClearable /></label>
      </div>
      <label className="block space-y-1.5 text-sm"><span className="block">Número del documento <span className="text-zinc-400">(opcional)</span></span><input className={field} value={form.documentNumber} maxLength={60} onChange={(event) => set({ documentNumber: event.target.value })} placeholder="Factura o cuenta de cobro del tercero" /></label>
      <label className="block space-y-1.5 text-sm"><span className="block">Notas <span className="text-zinc-400">(opcional)</span></span><textarea className={field} rows={2} maxLength={500} value={form.notes} onChange={(event) => set({ notes: event.target.value })} /></label>
      {shown && <p role="alert" className="text-sm text-destructive brain-destructive-text">{shown}</p>}
      <DialogFooter><button type="button" className="min-h-11 rounded-lg px-4 text-sm" onClick={onClose}>Cancelar</button><button type="submit" disabled={saving} className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">{saving ? 'Guardando…' : payable ? 'Guardar cambios' : 'Registrar cuenta'}</button></DialogFooter>
    </fieldset></form>
  </DialogContent></Dialog>;
}
