import React, { useState } from 'react';
import axios from 'axios';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import Select from '@/components/ui/Select';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { invalidateFinancialQueries } from '@/utils/financialQueryCache';
const api = path => `${getApiBaseUrl()}/api/financials${path}`;
const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` } });
const money = value => Number(value).toLocaleString('es-CO', { style: 'currency', currency: 'COP' });
const field = 'min-h-11 w-full rounded-lg border border-zinc-200 bg-white p-3 text-sm dark:border-white/10 dark:bg-zinc-950';
export default function LegacyOffsetDialog({ paymentId, onClose, onLinked }) {
  const cache = useQueryClient(), [selected, setSelected] = useState(''), [reason, setReason] = useState(''), [authorization, setAuthorization] = useState(null), [review, setReview] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const query = useQuery({ queryKey: ['legacy-offset', paymentId], queryFn: async () => (await axios.get(api(`/offsets/${paymentId}/legacy-options`), auth())).data });
  const row = query.data?.options.find(o => o.id === selected), payment = query.data?.payment;
  const confirm = async () => {
    if (busy) return; setBusy(true); setError('');
    try { await axios.post(api(`/offsets/${paymentId}/link`), review, auth()); await invalidateFinancialQueries(cache); onLinked(paymentId); }
    catch (e) { setError(e.response?.data?.message || 'No fue posible confirmar. Puedes reintentar sin duplicar el cruce.'); }
    finally { setBusy(false); }
  };
  return <Dialog open onOpenChange={open => !open && !busy && onClose()}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl dark:bg-zinc-900">
    <DialogHeader><DialogTitle>Completar cruce anterior</DialogTitle><DialogDescription>La compensación ya descontó Cartera. Ahora se confirma su cuenta por pagar, sin descontar otra vez al cliente ni crear movimientos bancarios.</DialogDescription></DialogHeader>
    {query.isLoading && <p>Cargando compensación…</p>}{query.error && <p role="alert" className="text-sm text-destructive">{query.error.response?.data?.message || 'No se pudo cargar.'}</p>}
    {payment && <><p>Compensación registrada: <strong>{money(payment.amount)}</strong></p>{query.data.message && <p>{query.data.message}</p>}{query.data.unavailable.map(o => <p key={o.id}>{o.label}: {o.reason}</p>)}
      <label className="space-y-2 text-sm">Cuenta por pagar<Select className={field} value={selected} disabled={!!review || busy} onChange={e => setSelected(e.target.value)}><option value="">Seleccionar obligación…</option>{query.data.options.map(o => <option key={o.id} value={o.id}>{o.payable.thirdPartyName} · {o.payable.label} · {money(o.payable.outstanding)}</option>)}</Select></label>
      {row && <div className="rounded-xl bg-zinc-50 p-4 text-sm dark:bg-white/5"><p>Por cobrar: <strong>{money(row.receivable.outstanding)} → {money(row.receivable.outstanding)}</strong> (se conserva)</p><p>Por pagar: <strong>{money(row.payable.outstanding)} → {money(row.payable.outstanding - payment.amount)}</strong></p><p className="mt-2">Si el saldo no corresponde, revisa primero pagos y cruces anteriores. Este paso no confirma un pago en dinero.</p></div>}
      <label className="space-y-2 text-sm">Autorizado por<input className={field} maxLength={120} disabled={!!review || busy} value={authorization ?? payment.authorizedBy ?? ''} onChange={e => setAuthorization(e.target.value)} /></label>
      <label className="space-y-2 text-sm">Motivo de la vinculación<textarea className={field} maxLength={300} disabled={!!review || busy} value={reason} onChange={e => setReason(e.target.value)} /></label>
      <div className="flex justify-end gap-2">{review ? <><button className="min-h-11 rounded-lg border px-4 dark:border-white/10" disabled={busy} onClick={() => setReview(null)}>Volver</button><button className="min-h-11 rounded-lg bg-brand-cyan-deep px-4 text-white" disabled={busy} onClick={confirm}>Confirmar vinculación</button></> : <button className="min-h-11 rounded-lg bg-brand-cyan-deep px-4 text-white disabled:opacity-50" disabled={!row || !reason.trim() || !(authorization ?? payment.authorizedBy ?? '').trim()} onClick={() => setReview({ payableId: row.id, expectedRevision: row.revision, reason: reason.trim(), authorizedBy: (authorization ?? payment.authorizedBy ?? '').trim(), requestId: crypto.randomUUID() })}>Revisar vinculación</button>}</div>
    </>}{error && <div role="alert" className="text-sm text-destructive"><p>{error}</p><button className="min-h-11 underline" onClick={async () => { setReview(null); await query.refetch(); setError(''); }}>Actualizar y revisar</button></div>}
  </DialogContent></Dialog>;
}
