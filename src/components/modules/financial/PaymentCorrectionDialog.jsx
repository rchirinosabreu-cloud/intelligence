import React, { useEffect, useState } from 'react';
import axios from 'axios';
import Select from '@/components/ui/Select';
import MoneyInput from '@/components/ui/MoneyInput';
import { BrainDatePicker } from '@/components/ui/BrainDatePicker';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { financialCents, financialAmountFromCents } from '@/utils/financialMoney';

const field = 'min-h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-white/10 dark:bg-zinc-950 dark:text-white';
const money = value => Number(value).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 2 });
const day = value => String(value || '').slice(0, 10);
const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('authToken')}` });

export default function PaymentCorrectionDialog({ kind, paymentId, accounts = [], onClose, onSaved }) {
  const [context, setContext] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [reload, setReload] = useState(0);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const url = `${getApiBaseUrl()}/api/financials/payment-corrections/${kind}/${paymentId}`;
  useEffect(() => {
    let active = true;
    setContext(null); setError(''); setConflict(false); setReviewing(false);
    axios.get(url, { headers: headers() }).then(({ data }) => {
      if (!active) return;
      setContext(data);
      setForm({ amount: String(data.payment.amount), paidAt: day(data.payment.paidAt), accountId: data.payment.accountId || '', reference: data.payment.reference || '', notes: data.payment.notes || '', reason: '' });
      setRequestId(crypto.randomUUID());
    }).catch(error => { if (active) { console.error('[Payment correction] Read failed:', error.response?.data || error); setError(error.response?.data?.message || 'No fue posible cargar el pago.'); } });
    return () => { active = false; };
  }, [url, reload]);
  const set = patch => { setForm(value => ({ ...value, ...patch })); setRequestId(crypto.randomUUID()); setReviewing(false); };
  const save = async () => {
    if (saving || conflict) return;
    setSaving(true); setError('');
    try {
      await axios.post(url, { ...form, expectedRevision: context.revision, requestId }, { headers: headers() });
      await onSaved('Corrección guardada. El pago, su movimiento y el saldo quedaron actualizados.');
    } catch (error) {
      console.error('[Payment correction] Save failed:', error.response?.data || error);
      setError(error.response?.data?.message || 'No se pudo confirmar el guardado. Puedes reintentar la misma corrección.');
      if (error.response?.status === 409) setConflict(true);
    } finally { setSaving(false); }
  };
  const original = context?.payment;
  const maximumCents = context ? (financialCents(context.outstanding) ?? 0) + (financialCents(original.amount) ?? 0) : 0;
  const nextCents = maximumCents - (financialCents(form?.amount) ?? 0);
  const nextOutstanding = nextCents < 0 ? -1 : financialAmountFromCents(nextCents);
  const accountName = id => accounts.find(account => account.id === id)?.name || (id === original?.accountId ? context?.accountName : 'Sin cuenta');
  return <Dialog open onOpenChange={open => !open && !saving && onClose()}><DialogContent data-payment-correction className="max-h-[90vh] overflow-x-hidden overflow-y-auto rounded-xl sm:max-w-2xl dark:bg-zinc-900" onInteractOutside={event => event.preventDefault()}>
    <DialogHeader className="min-w-0 pr-8 text-left"><DialogTitle>{reviewing ? 'Confirmar corrección del pago' : 'Corregir pago'}</DialogTitle><DialogDescription>{context?.label || 'Cargando el pago original…'}</DialogDescription></DialogHeader>
    {context && form && <form onSubmit={event => { event.preventDefault(); if (reviewing) save(); else setReviewing(true); }} className="min-w-0 space-y-5">
      <p className="text-sm text-zinc-600 dark:text-zinc-300">El pago conserva su identidad y sus comprobantes. La cuenta, el movimiento y el saldo se actualizan juntos; el cambio queda con autor, fecha y motivo.</p>
      {context.blocker && <p role="alert" className="text-sm text-destructive">{context.blocker}</p>}
      {!context.canCorrect && !context.blocker && <p className="text-sm text-zinc-600 dark:text-zinc-300">Tu acceso permite consultar este pago. Su corrección requiere el permiso de {kind === 'payroll' ? 'aprobación de nómina' : 'escritura financiera'}.</p>}
      {reviewing ? <div className="space-y-4" data-payment-correction-review>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-zinc-200 dark:border-white/10"><th className="py-3 font-medium">Dato</th><th className="px-3 font-medium">Antes</th><th className="px-3 font-medium">Después</th></tr></thead><tbody>
          {[['Valor', money(original.amount), money(form.amount)], ['Fecha', day(original.paidAt), form.paidAt], ['Cuenta', context.accountName, accountName(form.accountId)], ['Pendiente de la obligación', money(context.outstanding), money(nextOutstanding)]].map(([label, before, after]) => <tr key={label} className="border-b border-zinc-100 dark:border-white/5"><th className="py-3 font-normal">{label}</th><td className="px-3 text-zinc-500">{before}</td><td className="px-3 font-medium">{after}</td></tr>)}
        </tbody></table></div><p className="text-sm"><span className="font-medium">Motivo: </span>{form.reason}</p>
        <p className="text-xs text-zinc-500">Esta corrección no realiza una transferencia bancaria ni genera otro pago.</p>
      </div> : <fieldset disabled={saving || conflict || !context.canCorrect} className="space-y-4 disabled:opacity-60">
        <div className="grid gap-4 sm:grid-cols-2"><label className="space-y-1.5 text-sm"><span className="block">Valor pagado</span><MoneyInput aria-label="Valor pagado" required min="0.01" max={financialAmountFromCents(maximumCents)} className={field} value={form.amount} onChange={amount => set({ amount })} /></label><label className="space-y-1.5 text-sm"><span className="block">Fecha del pago</span><BrainDatePicker required className={field} value={form.paidAt} onChange={paidAt => set({ paidAt })} ariaLabel="Fecha del pago" /></label></div>
        <label className="block space-y-1.5 text-sm"><span className="block">Cuenta de salida</span><Select aria-label="Cuenta de salida" required className={field} value={form.accountId} onChange={event => set({ accountId: event.target.value })}><option value="">Seleccionar…</option>{!accounts.some(account => account.id === original.accountId) && <option value={original.accountId} disabled>{context.accountName} · no disponible</option>}{accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</Select></label>
        <div className="grid gap-4 sm:grid-cols-2"><label className="space-y-1.5 text-sm"><span className="block">Referencia</span><input className={field} maxLength={200} value={form.reference} onChange={event => set({ reference: event.target.value })} /></label><label className="space-y-1.5 text-sm"><span className="block">Notas</span><input className={field} maxLength={1000} value={form.notes} onChange={event => set({ notes: event.target.value })} /></label></div>
        <label className="block space-y-1.5 text-sm"><span className="block">Motivo de la corrección</span><textarea required maxLength={300} rows={2} className={field} value={form.reason} onChange={event => set({ reason: event.target.value })} placeholder="Explica qué dato se registró mal." /></label>
      </fieldset>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {conflict && <button type="button" className="min-h-11 text-sm font-medium text-primary underline" onClick={() => setReload(value => value + 1)}>Cargar versión actual y reemplazar este borrador</button>}
      <DialogFooter><button type="button" disabled={saving} className="min-h-11 rounded-lg border border-zinc-200 px-4 text-sm dark:border-white/10" onClick={reviewing ? () => setReviewing(false) : onClose}>{reviewing ? 'Volver a editar' : 'Cancelar'}</button><button type="submit" disabled={saving || conflict || !context.canCorrect || nextOutstanding < 0} className="min-h-11 rounded-lg bg-brand-cyan-deep px-4 text-sm font-semibold text-white hover:brightness-95 disabled:opacity-50">{saving ? 'Guardando…' : reviewing ? 'Confirmar corrección' : 'Revisar cambios'}</button></DialogFooter>
      {context.history?.length > 0 && <details className="border-t border-zinc-200 pt-4 text-sm dark:border-white/10"><summary className="cursor-pointer font-medium">Historial de correcciones · hasta 20 registros recientes</summary><ul className="mt-3 space-y-3">{context.history.filter(event => event.reason).map(event => <li key={event.id}><p>{event.reason}</p>{event.before && event.after && <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">Valor: {money(event.before.amount)} → {money(event.after.amount)} · Fecha: {day(event.before.paidAt)} → {day(event.after.paidAt)} · Cuenta: {accountName(event.before.accountId)} → {accountName(event.after.accountId)}</p>}<p className="text-xs text-zinc-500">{event.actorName || 'Autor registrado'} · {new Date(event.date).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}</p></li>)}</ul></details>}
    </form>}
    {!context && error && <div><p role="alert" className="text-sm text-destructive">{error}</p><button type="button" onClick={() => setReload(value => value + 1)} className="min-h-11 text-primary underline">Reintentar</button></div>}
  </DialogContent></Dialog>;
}
