import React, { useState } from 'react';
import Select from '@/components/ui/Select';
import MoneyInput from '@/components/ui/MoneyInput';
import { BrainDatePicker } from '@/components/ui/BrainDatePicker';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { isCashPayment, settlementKindLabel } from '@/lib/receivableSettlement';

// Corregir un abono sin revertirlo (Rodny, 20 de octubre de 2026: «debe tener la opción de editar
// lo que ingresó o el valor registrado para no revertirlo»). Valor, fecha, cuenta, referencia y
// notas; cambiar el dinero exige motivo y el ingreso del abono cambia con él.
const field = 'min-h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 disabled:opacity-70 dark:border-white/10 dark:bg-zinc-950 dark:text-white';
const money = value => Number(value || 0).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 2 });

export default function ReceivablePaymentEditDialog({ debt, payment, accounts = [], saving, error, onClose, onSubmit }) {
  const cash = isCashPayment(payment);
  const usd = debt?.currency === 'USD';
  const [form, setForm] = useState({
    amount: String(payment?.amount ?? ''),
    paidAt: payment?.paidAt ? String(payment.paidAt).slice(0, 10) : '',
    accountId: payment?.account?.id || '',
    reference: payment?.reference || '',
    notes: payment?.notes || '',
    reason: '',
    settlesInFull: false
  });
  const set = patch => setForm(current => ({ ...current, ...patch }));
  const original = { amount: String(payment?.amount ?? ''), paidAt: payment?.paidAt ? String(payment.paidAt).slice(0, 10) : '', accountId: payment?.account?.id || '' };
  const touchesMoney = Number(form.amount) !== Number(original.amount) || form.paidAt !== original.paidAt || (cash && form.accountId !== original.accountId);
  // Lo que la cuenta admite sin este abono: su valor menos los demás abonos vigentes.
  const room = Math.max((Number(debt?.outstanding) || 0) + (Number(payment?.amount) || 0), 0);
  const submit = event => {
    event.preventDefault();
    const payload = { reference: form.reference, notes: form.notes };
    if (Number(form.amount) !== Number(original.amount)) payload.amount = Number(form.amount);
    if (form.paidAt !== original.paidAt) payload.paidAt = form.paidAt;
    if (cash && form.accountId !== original.accountId) payload.accountId = form.accountId;
    if (touchesMoney) payload.reason = form.reason.trim();
    if (usd && form.settlesInFull) payload.settlesInFull = true;
    onSubmit(payload);
  };
  return <Dialog open={!!payment} onOpenChange={open => !open && !saving && onClose()}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg dark:bg-zinc-900" onOpenAutoFocus={event => { event.preventDefault(); event.currentTarget.focus(); }}>
    <DialogHeader><DialogTitle>{cash ? 'Corregir abono' : `Corregir ${settlementKindLabel(payment?.kind).toLowerCase()}`}</DialogTitle><DialogDescription>{debt?.clientName}{cash ? ' · el ingreso de este abono en Movimientos cambia con él.' : ' · un ajuste sin dinero: no hay ingreso que tocar.'}</DialogDescription></DialogHeader>
    <form onSubmit={submit} className="space-y-4"><fieldset disabled={saving} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5 text-sm"><span className="block">Valor{usd ? ' en pesos' : ''}</span><MoneyInput required className={field} min="0.01" max={usd ? undefined : room} value={form.amount} onChange={amount => set({ amount })} /></label>
        <label className="block space-y-1.5 text-sm"><span className="block">Fecha</span><BrainDatePicker required className={field} value={form.paidAt} onChange={paidAt => set({ paidAt })} ariaLabel="Fecha del abono" /></label>
      </div>
      {usd && Number(form.amount) > room + 0.005 && <p data-receivable-edit-usd className="text-xs text-zinc-600 dark:text-zinc-300">Entró más que el valor en pesos de la cartera ({money(room)}): la cartera se ajusta sola a lo que entró.</p>}
      {usd && Number(form.amount) > 0 && Number(form.amount) < room - 0.005 && (
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 h-4 w-4" checked={form.settlesInFull} onChange={event => set({ settlesInFull: event.target.checked })} /><span>Con este abono la cuenta queda al día: la diferencia de {money(room - Number(form.amount))} es por la tasa del día, no un saldo pendiente.</span></label>
      )}
      {cash && <label className="block space-y-1.5 text-sm"><span className="block">Cuenta</span><Select required className={field} value={form.accountId} onChange={event => set({ accountId: event.target.value })}><option value="">Seleccionar…</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</Select></label>}
      {cash && <label className="block space-y-1.5 text-sm"><span className="block">Referencia</span><input className={field} value={form.reference} onChange={event => set({ reference: event.target.value })} /></label>}
      <label className="block space-y-1.5 text-sm"><span className="block">{cash ? 'Notas' : 'Motivo del ajuste'}</span><textarea className={field} rows={2} value={form.notes} onChange={event => set({ notes: event.target.value })} /></label>
      {touchesMoney && <label className="block space-y-1.5 text-sm"><span className="block">Motivo de la corrección</span><textarea required className={field} rows={2} maxLength={300} value={form.reason} onChange={event => set({ reason: event.target.value })} placeholder="Ej.: se registró por el máximo permitido; el depósito real fue 1.205.856." /><span className="block text-[11px] text-zinc-500">Cambiar el valor, la fecha o la cuenta queda en la bitácora con su motivo.</span></label>}
      {error && <p role="alert" className="text-sm text-destructive brain-destructive-text">{error}</p>}
      <DialogFooter><button type="button" className="min-h-11 rounded-lg px-4 text-sm" onClick={onClose}>Cancelar</button><button type="submit" disabled={saving} className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">{saving ? 'Guardando…' : 'Guardar corrección'}</button></DialogFooter>
    </fieldset></form>
  </DialogContent></Dialog>;
}
