import React, { useState } from 'react';
import axios from 'axios';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import Select from '@/components/ui/Select';
import MoneyInput from '@/components/ui/MoneyInput';
import { BrainDatePicker } from '@/components/ui/BrainDatePicker';
import { useFormDraft } from '@/hooks/useFormDraft';
import DraftNotice from '@/components/ui/DraftNotice';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { invalidateFinancialQueries } from '@/utils/financialQueryCache';
import { financialCents, financialAmountFromCents } from '@/utils/financialMoney';
import RecordDocumentsInline from './RecordDocumentsInline';
import { uploadReceivablePaymentDocument, fetchReceivablePaymentDocumentBlob } from '@/lib/financialDocumentsClient';

const field = 'min-h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-white/10 dark:bg-zinc-950 dark:text-white';
const primary = 'min-h-11 rounded-lg bg-brand-cyan-deep px-4 py-2 text-sm font-semibold text-white disabled:opacity-50';
const secondary = 'min-h-11 rounded-lg border border-zinc-200 px-4 py-2 text-sm dark:border-white/15';
const money = v => Number(v || 0).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 2 });
const when = v => new Date(v).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'medium', timeStyle: 'short' });
const api = p => `${getApiBaseUrl()}/api/financials${p}`;
const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` } });
const modes = { AGENCIA: 'Uso de Brain Studio', BENEFICIARIO: 'Cobrar a un beneficiario', OTRO_AUTORIZADO: 'Otra disposición autorizada, sin cobro' };
const docsApi = { upload: uploadReceivablePaymentDocument, fetchBlob: fetchReceivablePaymentDocumentBlob, label: 'soporte del canje' };

export default function FinancialBarterDialog({ receivableId, paymentId, onClose, onBack }) {
  const cache = useQueryClient(), [savedId, setSavedId] = useState(paymentId || null);
  const [review, setReview] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [success, setSuccess] = useState(''), [conflict, setConflict] = useState(false);
  const query = useQuery({ queryKey: ['financial-barter', savedId || receivableId], queryFn: async () => (await axios.get(api(savedId ? `/barters/${savedId}` : `/receivables/${receivableId}/barter-options`), auth())).data, refetchOnWindowFocus: false });
  const ctx = query.data, legacy = !!savedId && !ctx?.payment?.detail?.destinationMode && !ctx?.payment?.reversedAt;
  const [form, setForm, draft] = useFormDraft({ scope: `financial:barter:${savedId || receivableId}`, open: !!ctx, fingerprint: ctx?.revision,
    initial: { amount: '', settledAt: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }), goods: '', destinationMode: '', beneficiaryThirdPartyId: '', destination: '', authorizedBy: '', reason: '', requestId: crypto.randomUUID() } });
  const set = patch => { setError(''); setForm(v => ({ ...v, ...patch })); };
  const refresh = async () => { setReview(null); setConflict(false); setError(''); await query.refetch(); setForm(v => ({ ...v, requestId: crypto.randomUUID() })); };
  const prepare = (event, reverse = false) => {
    event.preventDefault(); setError(''); setSuccess('');
    if (!ctx || draft.conflict || !form.reason.trim()) return;
    const cents = financialCents(savedId ? ctx.payment.amount : form.amount);
    if (!cents || cents < 0 || (!savedId && cents > financialCents(ctx.receivable.outstanding))) { setError('Indica un valor positivo que no supere el saldo del cliente.'); return; }
    setReview({ reverse, context: ctx, amount: cents, body: { ...form, kind: 'CANJE', expectedRevision: ctx.revision }, legacy });
  };
  const confirm = async () => {
    if (busy || !review || conflict) return;
    setBusy(true); setError('');
    try {
      const path = savedId ? `/barters/${savedId}/${review.reverse ? 'reverse' : 'destination'}` : `/receivables/${receivableId}/settlements`;
      const { data } = await axios.post(api(path), review.body, auth());
      setSuccess(review.reverse ? 'Canje revertido. Se conservan las obligaciones, los soportes y el historial.' : review.legacy ? 'Destino confirmado. No se volvió a descontar la deuda del cliente.' : 'Canje registrado. No se generó movimiento bancario.');
      draft.clear(); setReview(null);
      if (!savedId) setSavedId(data.payment.id); else await query.refetch();
      await invalidateFinancialQueries(cache);
    } catch (cause) { setError(cause.response?.data?.message || 'No pudimos confirmar el resultado. Reintenta con la misma solicitud.'); setConflict([400, 403, 404, 409].includes(cause.response?.status)); }
    finally { setBusy(false); }
  };
  const active = review?.context || ctx, reversed = !!ctx?.payment?.reversedAt;
  const destMode = review && !review.reverse ? review.body.destinationMode : ctx?.payment?.detail?.destinationMode;
  const beneficiaryName = review && !review.reverse ? ctx?.parties.find(p => p.id === review.body.beneficiaryThirdPartyId)?.name : active?.beneficiary?.name;
  return <Dialog open onOpenChange={open => !open && !busy && onClose()}><DialogContent data-financial-barter className="max-h-[90vh] overflow-x-hidden overflow-y-auto sm:max-w-2xl dark:bg-zinc-900">
    <DialogHeader><DialogTitle>{review ? review.reverse ? 'Confirmar reversión del canje' : 'Revisar destino del canje' : savedId ? reversed ? 'Canje revertido' : legacy ? 'Completar destino del canje' : 'Detalle del canje' : 'Registrar canje y destino'}</DialogTitle><DialogDescription>El canje salda al cliente con bienes o servicios. Si una persona debe reintegrar su valor, se registra en la misma Cartera, vinculada al canje.</DialogDescription></DialogHeader>
    {query.isLoading && <p role="status">Consultando el canje…</p>}
    {query.error && <p role="alert" className="text-sm text-destructive brain-destructive-text">{query.error.response?.data?.message || 'No se pudo cargar el canje.'}<button className={secondary} onClick={refresh}>Reintentar</button></p>}
    {success && <p role="status" className="rounded-lg bg-brand-cyan/10 p-3 text-sm">{success}</p>}
    {active && <div className="grid gap-3 sm:grid-cols-2" data-barter-balances>
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-white/10 dark:bg-white/5"><p className="text-xs text-zinc-500">Cliente · {active.receivable.name}</p><p className="mt-2 text-sm">Saldo actual <strong className="block text-xl">{money(active.receivable.outstanding)}</strong></p>{review && <p className="mt-3 border-t pt-2 text-sm">Después de confirmar <strong className="block text-lg">{money(financialAmountFromCents(financialCents(active.receivable.outstanding) + (review.reverse ? review.amount : review.legacy ? 0 : -review.amount)))}</strong></p>}</div>
      <div className="rounded-xl border border-zinc-200 p-4 dark:border-white/10"><p className="text-xs text-zinc-500">{beneficiaryName ? `Beneficiario · ${beneficiaryName}` : 'Destino del canje'}</p><p className="mt-2 text-sm">{active.beneficiary ? <>Saldo actual <strong className="block text-xl">{money(active.beneficiary.outstanding)}</strong></> : modes[destMode] || 'Por confirmar'}</p>{review && <p className="mt-3 border-t pt-2 text-sm">{review.reverse && active.beneficiary ? 'Cuenta del beneficiario anulada por reversión: saldo $0.' : destMode === 'BENEFICIARIO' ? <>Cuenta por cobrar <strong className="block text-lg">{money(financialAmountFromCents(review.amount))}</strong></> : 'Sin cuenta por cobrar al beneficiario.'}</p>}</div>
    </div>}
    {review ? <div className="space-y-4"><div className="rounded-lg bg-zinc-50 p-4 text-sm leading-6 dark:bg-white/5"><p><strong>{money(financialAmountFromCents(review.amount))}</strong> · {review.reverse ? 'Reversión completa' : 'Sin entrada ni salida de dinero'}</p><p>{review.body.goods || ctx.payment?.detail?.goods}</p><p>Motivo: {review.body.reason}</p>{!review.reverse && <><p>Autorizó: {review.body.authorizedBy}</p><p>{review.body.destination}</p></>}<p className="mt-2 text-zinc-500">{review.reverse ? 'Se devuelve el importe al saldo del cliente y se anula la obligación del beneficiario. No se borran registros ni se devuelve dinero automáticamente.' : review.legacy ? 'El canje anterior y su fecha se conservan. Solo se completa el destino.' : 'Los bienes no se registran como ingreso bancario. El cobro al beneficiario, si corresponde, se registra cuando realmente se reciba.'}</p></div><div className="flex flex-wrap justify-end gap-2"><button className={secondary} disabled={busy} onClick={() => setReview(null)}>Volver</button><button className={primary} disabled={busy || conflict} onClick={confirm}>{busy ? 'Guardando…' : review.reverse ? 'Confirmar reversión' : 'Confirmar canje y destino'}</button></div></div>
      : ctx && <div className="space-y-4">
        {savedId && <div className="rounded-xl border border-zinc-200 p-4 text-sm leading-6 dark:border-white/10"><p><strong>{money(ctx.payment.amount)}</strong> · {ctx.payment.detail?.goods}</p><p>Destino: {ctx.payment.detail?.destination || 'Sin confirmar'}</p><p>Autorizó: {ctx.payment.detail?.authorizedBy || 'Sin dato histórico'} · Registró: {ctx.payment.detail?.actorName || ctx.payment.detail?.destinationActorName || 'Registro anterior'}</p>{ctx.payment.notes && <p>{ctx.payment.notes}</p>}{ctx.payment.detail?.destinationReason && <p>Destino confirmado: {ctx.payment.detail.destinationReason} · {ctx.payment.detail.destinationActorName} · {when(ctx.payment.detail.destinationAt)}</p>}{reversed && <p className="mt-2">Revertido el {when(ctx.payment.reversedAt)}: {ctx.payment.reversalReason}</p>}<RecordDocumentsInline recordId={savedId} documents={ctx.payment.documents || []} api={docsApi} canWrite={ctx.canWrite && !reversed} onChanged={query.refetch} onError={setError} /></div>}
        {(!savedId || legacy) && ctx.canWrite && <form onSubmit={prepare} className="space-y-4"><DraftNotice draft={draft} disabled={busy} /><fieldset disabled={busy || draft.conflict} className="space-y-4">
          {!savedId && <><div className="grid gap-4 sm:grid-cols-2"><label className="block space-y-1 text-sm">Valor recibido<MoneyInput required className={field} value={form.amount} onChange={amount => set({ amount })} /></label><label className="block space-y-1 text-sm">Fecha del canje<BrainDatePicker required className={field} value={form.settledAt} onChange={settledAt => set({ settledAt })} ariaLabel="Fecha del canje" /></label></div><label className="block space-y-1 text-sm">Bienes o servicios recibidos<textarea required maxLength={500} rows={2} className={field} value={form.goods} onChange={e => set({ goods: e.target.value })} /></label></>}
          <label className="block space-y-1 text-sm">Destino<Select required className={field} value={form.destinationMode} onChange={e => set({ destinationMode: e.target.value, beneficiaryThirdPartyId: '' })}><option value="">Seleccionar destino…</option>{Object.entries(modes).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select></label>
          {form.destinationMode === 'BENEFICIARIO' ? <label className="block space-y-1 text-sm">Beneficiario en Terceros<Select required className={field} value={form.beneficiaryThirdPartyId} onChange={e => set({ beneficiaryThirdPartyId: e.target.value })}><option value="">Seleccionar persona…</option>{ctx.parties.map(p => <option key={p.id} value={p.id}>{p.name} · {p.kind}{p.documentNumber ? ` · ${p.documentNumber}` : ''}</option>)}</Select><span className="block text-xs text-zinc-500">Se creará una cuenta por cobrar por el valor completo del canje. Los nuevos beneficiarios se registran en Terceros.</span></label> : form.destinationMode && <label className="block space-y-1 text-sm">Uso o disposición autorizada<textarea required maxLength={500} rows={2} className={field} value={form.destination} onChange={e => set({ destination: e.target.value })} /></label>}
          <label className="block space-y-1 text-sm">Autorizado por<input required maxLength={120} className={field} value={form.authorizedBy} onChange={e => set({ authorizedBy: e.target.value })} /></label><label className="block space-y-1 text-sm">Motivo<textarea required maxLength={300} rows={2} className={field} value={form.reason} onChange={e => set({ reason: e.target.value })} /></label>
          <div className="flex flex-wrap justify-end gap-2">{onBack && <button type="button" className={secondary} onClick={onBack}>Otra forma de saldar</button>}<button className={primary}>Revisar canje y destino</button></div>
        </fieldset></form>}
        {ctx.reversalBlock && <p className="rounded-lg border border-amber-300 p-3 text-sm" role="status">{ctx.reversalBlock}</p>}
        {savedId && ctx.canReverse && <form onSubmit={e => prepare(e, true)} className="space-y-3"><DraftNotice draft={draft} disabled={busy} /><label className="block space-y-1 text-sm">Motivo de reversión<textarea required maxLength={300} rows={2} className={field} value={form.reason} onChange={e => set({ reason: e.target.value })} /></label><p className="text-xs text-zinc-500">Para corregir valor o beneficiario, revisa la reversión completa y registra después el canje correcto. Ambos registros se conservan.</p><div className="flex justify-end"><button disabled={draft.conflict || busy} className={secondary}>Revisar reversión</button></div></form>}
        {ctx.history?.length > 0 && <details className="rounded-lg border border-zinc-200 p-3 text-sm dark:border-white/10"><summary className="min-h-11 cursor-pointer font-medium">Historial del canje ({ctx.history.length})</summary><ol className="space-y-3">{ctx.history.map(row => <li key={row.id} className="border-t pt-3"><p>{row.after.operation === 'BARTER_REVERSE' ? 'Reversión' : row.after.operation === 'BARTER_DESTINATION' ? 'Destino confirmado' : 'Registro'} · {when(row.createdAt)}</p><p>{row.after.actorName} · {row.after.reason}</p></li>)}</ol></details>}
      </div>}
    {error && <p role="alert" className="text-sm text-destructive brain-destructive-text">{error}</p>}{conflict && <button className={secondary} onClick={refresh}>Actualizar y revisar de nuevo</button>}
  </DialogContent></Dialog>;
}
