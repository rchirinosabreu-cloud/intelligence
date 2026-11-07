import React, { useState } from 'react';
import axios from 'axios';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import Select from '@/components/ui/Select';
import MoneyInput from '@/components/ui/MoneyInput';
import { BrainDatePicker } from '@/components/ui/BrainDatePicker';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { invalidateFinancialQueries } from '@/utils/financialQueryCache';
import { financialCents, financialAmountFromCents } from '@/utils/financialMoney';
import RecordDocumentsInline from './RecordDocumentsInline';
import { useFormDraft } from '@/hooks/useFormDraft';
import DraftNotice from '@/components/ui/DraftNotice';
import { uploadReceivablePaymentDocument, fetchReceivablePaymentDocumentBlob } from '@/lib/financialDocumentsClient';

const field = 'min-h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-white/10 dark:bg-zinc-950 dark:text-white';
const primary = 'min-h-11 rounded-lg bg-brand-cyan-deep px-4 text-sm font-semibold text-white hover:bg-brand-cyan-deep/90 disabled:opacity-50';
const secondary = 'min-h-11 rounded-lg border border-zinc-200 px-4 text-sm dark:border-white/15';
const money = value => Number(value ?? 0).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 2 });
const day = value => new Date(value).toLocaleDateString('es-CO', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });
const when = value => new Date(value).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'medium', timeStyle: 'short' });
const api = path => `${getApiBaseUrl()}/api/financials${path}`;
const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` } });
const documentsApi = { upload: uploadReceivablePaymentDocument, fetchBlob: fetchReceivablePaymentDocumentBlob, label: 'soporte del cruce' };

function Balances({ context, amount = 0, reverse = false }) {
  return <div className="grid gap-3 sm:grid-cols-2" data-offset-balances>
    {[['receivable', 'Nos deben'], ['payable', 'Debemos']].map(([key, title]) => {
      const row = context[key];
      const after = financialAmountFromCents(financialCents(row.outstanding) + (reverse ? 1 : -1) * amount);
      return <div key={key} className="min-w-0 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-white/10 dark:bg-white/5">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{title} · {row.clientName || row.thirdPartyName}</p>
        <p className="mt-1 break-words text-sm font-medium">{row.label}{row.number ? ` · ${row.number}` : ''}</p>
        <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">Saldo actual</p><p className="text-lg font-semibold">{money(row.outstanding)}</p>
        {amount > 0 && <p className="mt-2 border-t border-zinc-200 pt-2 text-sm dark:border-white/10">{reverse ? 'Después de revertir' : 'Después del cruce'} <strong className="block text-lg">{money(after)}</strong></p>}
      </div>;
    })}
  </div>;
}

/** La misma revisión del cruce se abre desde Cartera o Proveedores. */
export default function FinancialOffsetDialog({ receivableId, paymentId, onClose, onBack }) {
  const queryClient = useQueryClient();
  const [savedId, setSavedId] = useState(paymentId || null);
  const [review, setReview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [conflict, setConflict] = useState(false);
  const query = useQuery({ queryKey: ['financial-offset', savedId || receivableId], queryFn: async () => (await axios.get(api(savedId ? `/offsets/${savedId}` : `/receivables/${receivableId}/offset-options`), auth())).data, refetchOnWindowFocus: false });
  const [form, setForm, draft] = useFormDraft({ scope: `financial:offset:${savedId || receivableId}`, open: !query.isLoading,
    fingerprint: JSON.stringify(savedId ? query.data?.revision : query.data?.options?.map(row => [row.id, row.revision])),
    initial: { payableId: '', amount: '', settledAt: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }), authorizedBy: '', reason: '', requestId: crypto.randomUUID() } });
  const { payableId, amount, settledAt, authorizedBy, reason } = form;
  const setPayableId = value => setForm(current => ({ ...current, payableId: value }));
  const setAmount = value => setForm(current => ({ ...current, amount: value }));
  const setSettledAt = value => setForm(current => ({ ...current, settledAt: value }));
  const setAuthorizedBy = value => setForm(current => ({ ...current, authorizedBy: value }));
  const setReason = value => setForm(current => ({ ...current, reason: value }));
  const context = savedId ? query.data : query.data?.options?.find(row => row.id === payableId);
  const reversed = !!context?.payment?.reversedAt;
  const amountCents = financialCents(savedId ? context?.payment?.amount : amount);
  const prepare = event => {
    event.preventDefault(); setError(''); setSuccess('');
    if (!context || !reason.trim() || draft.conflict) return;
    if (!savedId && (!amountCents || amountCents > Math.min(financialCents(context.receivable.outstanding), financialCents(context.payable.outstanding)))) { setError('El cruce debe ser positivo y no superar ninguno de los dos saldos.'); return; }
    setReview({ context, amount: amountCents, body: { reason: reason.trim(), expectedRevision: context.revision, requestId: form.requestId, ...(!savedId ? { kind: 'COMPENSACION', payableId, amount, settledAt, authorizedBy: authorizedBy.trim() } : {}) } });
  };
  const confirm = async () => {
    if (saving || !review || conflict) return;
    setSaving(true); setError('');
    try {
      const { data } = await axios.post(api(savedId ? `/offsets/${savedId}/reverse` : `/receivables/${receivableId}/settlements`), review.body, auth());
      setSuccess(savedId ? 'Cruce revertido. Los dos saldos se restauraron; el historial y los soportes se conservan.' : 'Cruce registrado en ambas obligaciones. No hubo entrada ni salida de dinero.');
      draft.clear();
      if (!savedId) setSavedId(data.payment.id);
      else await query.refetch();
      setReview(null);
      await invalidateFinancialQueries(queryClient);
    } catch (cause) { setError(cause.response?.data?.message || 'No pudimos confirmar el resultado. Reintenta: se conserva la misma solicitud para evitar duplicarlo.'); setConflict([400, 403, 404, 409].includes(cause.response?.status)); }
    finally { setSaving(false); }
  };
  const reload = async () => { setReview(null); setError(''); setConflict(false); await query.refetch(); setForm(current => ({ ...current, requestId: crypto.randomUUID() })); };
  return <Dialog open onOpenChange={open => !open && !saving && onClose()}><DialogContent data-financial-offset className="max-h-[90vh] min-w-0 overflow-x-hidden overflow-y-auto sm:max-w-2xl dark:bg-zinc-900">
    <DialogHeader><DialogTitle>{review ? savedId ? 'Confirmar reversión del cruce' : 'Confirmar cruce de obligaciones' : savedId ? reversed ? 'Cruce revertido' : 'Detalle del cruce' : 'Cruzar obligaciones'}</DialogTitle><DialogDescription>Una compensación reduce lo que una misma persona nos debe y lo que le debemos. Conserva los documentos originales, sin registrar ingresos ni egresos bancarios.</DialogDescription></DialogHeader>
    {query.isLoading && <p role="status" className="text-sm">Consultando ambas obligaciones…</p>}
    {query.error && <p role="alert" className="text-sm text-destructive brain-destructive-text">{query.error.response?.data?.message || 'No se pudieron cargar las obligaciones.'}<button className="ml-2 min-h-11 underline" onClick={reload}>Reintentar</button></p>}
    {success && <p role="status" className="rounded-lg bg-brand-cyan/10 p-3 text-sm">{success}</p>}
    {!review && !reversed && <DraftNotice draft={draft} disabled={saving} />}
    {review ? <div className="space-y-4">
      <Balances context={review.context} amount={review.amount} reverse={!!savedId} />
      <div className="rounded-xl border border-zinc-200 p-4 text-sm dark:border-white/10"><p>{savedId ? 'Importe a devolver a cada saldo' : 'Importe a compensar'}: <strong>{money(financialAmountFromCents(review.amount))}</strong></p>{!savedId && <p className="mt-1">Fecha: {day(review.body.settledAt)} · Autorizó: {review.body.authorizedBy}</p>}<p className="mt-2 break-words">Motivo: {review.body.reason}</p><p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{savedId ? 'Se revierte el cruce completo, conservando cualquier pago posterior y todos los soportes.' : 'El saldo restante sigue pendiente. No se registrará como pagado en dinero.'}</p></div>
      <div className="flex flex-wrap justify-end gap-2"><button disabled={saving} className={secondary} onClick={() => { setReview(null); setError(''); }}>{savedId ? 'Volver' : 'Editar revisión'}</button><button data-offset-confirm disabled={saving || conflict} className={primary} onClick={confirm}>{saving ? 'Guardando…' : savedId ? 'Confirmar reversión' : 'Confirmar cruce'}</button></div>
    </div> : savedId && context ? <div className="space-y-4">
      <Balances context={context} />
      <div className="rounded-xl border border-zinc-200 p-4 text-sm dark:border-white/10"><p><strong>{money(context.payment.amount)}</strong> · {reversed ? 'Compensación revertida' : 'Compensación vigente'} · {day(context.payment.paidAt)}</p><p className="mt-1">Autorizó: {context.payment.detail?.authorizedBy} · Registró: {context.payment.detail?.actorName || context.payment.createdById}</p><p className="mt-2 break-words">{context.payment.notes}</p>{reversed && <p className="mt-2">Revertido el {when(context.payment.reversedAt)}: {context.payment.reversalReason}</p>}
        <RecordDocumentsInline className="mt-3" recordId={savedId} documents={context.payment.documents || []} api={documentsApi} canWrite={context.canReverse} onChanged={async () => { await query.refetch(); await invalidateFinancialQueries(queryClient); }} onError={setError} />
      </div>
      {context.history?.length > 0 && <details className="rounded-lg border border-zinc-200 p-3 text-sm dark:border-white/10" data-offset-history><summary className="min-h-11 cursor-pointer font-medium">Historial del cruce ({context.history.length})</summary><ol className="space-y-3">{context.history.map(event => <li key={event.id} className="border-t border-zinc-200 pt-3 dark:border-white/10"><p>{event.after.operation === 'OFFSET_REVERSE' ? 'Reversión' : 'Registro'} · {when(event.createdAt)} · {event.after.actorName}</p><p className="mt-1 break-words text-zinc-500 dark:text-zinc-400">{event.after.reason}</p><p className="mt-1">Nos deben: {money(event.before.receivable.outstanding)} → {money(event.after.receivable.outstanding)}<br />Debemos: {money(event.before.payable.outstanding)} → {money(event.after.payable.outstanding)}</p></li>)}</ol></details>}
      {context.canReverse && <form onSubmit={prepare} className="space-y-3"><label className="block space-y-1 text-sm"><span>Motivo de reversión</span><textarea className={field} required maxLength={300} rows={2} value={reason} onChange={event => setReason(event.target.value)} /></label><div className="flex justify-end"><button className={secondary} type="submit" disabled={draft.conflict}>Revisar reversión</button></div></form>}
    </div> : !query.isLoading && !query.error && <form onSubmit={prepare} className="space-y-4">
      <label className="block space-y-1 text-sm"><span>Cuenta por pagar del mismo tercero</span><Select className={field} required value={payableId} onChange={event => { setPayableId(event.target.value); const selected = query.data?.options.find(row => row.id === event.target.value); setAmount(selected ? String(Math.min(Number(selected.receivable.outstanding), Number(selected.payable.outstanding))) : ''); }}><option value="">Selecciona la obligación</option>{query.data?.options?.map(row => <option key={row.id} value={row.id}>{row.payable.label} · {row.payable.number || 'Sin número'} · {money(row.payable.outstanding)}</option>)}</Select></label>
      {query.data?.message && <p className="rounded-lg bg-zinc-50 p-3 text-sm dark:bg-white/5">{query.data.message}</p>}
      {query.data?.unavailable?.map(row => <p className="text-sm" key={row.id}>{row.label}: {row.reason}</p>)}
      {context && <><Balances context={context} /><div className="grid gap-4 sm:grid-cols-2"><label className="block space-y-1 text-sm"><span>Valor del cruce</span><MoneyInput className={field} required value={amount} onChange={setAmount} /></label><label className="block space-y-1 text-sm"><span>Fecha del cruce</span><BrainDatePicker required className={field} value={settledAt} onChange={setSettledAt} ariaLabel="Fecha del cruce" /></label></div><label className="block space-y-1 text-sm"><span>Autorizado por</span><input className={field} required maxLength={120} value={authorizedBy} onChange={event => setAuthorizedBy(event.target.value)} /></label><label className="block space-y-1 text-sm"><span>Motivo del cruce</span><textarea className={field} required maxLength={300} rows={2} value={reason} onChange={event => setReason(event.target.value)} /></label></>}
      <div className="flex flex-wrap justify-end gap-2">{onBack && <button className={secondary} type="button" onClick={onBack}>Otra forma de saldar</button>}<button className={primary} type="submit" disabled={!context || draft.conflict}>Revisar cruce</button></div>
    </form>}
    {error && <p role="alert" className="text-sm text-destructive brain-destructive-text">{error}</p>}
    {conflict && <button className={secondary} disabled={saving} onClick={reload}>Actualizar y revisar de nuevo</button>}
    <div className="flex justify-end"><button type="button" className="min-h-11 px-3 text-sm" disabled={saving} onClick={onClose}>Cerrar</button></div>
  </DialogContent></Dialog>;
}
