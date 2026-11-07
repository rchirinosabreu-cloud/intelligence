import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { calculatePayrollPeriod } from '@/lib/payrollPeriods';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { BrainDatePicker } from '@/components/ui/BrainDatePicker';
import MoneyInput from '@/components/ui/MoneyInput';
import Select from '@/components/ui/Select';
import DraftNotice from '@/components/ui/DraftNotice';
import { useFormDraft } from '@/hooks/useFormDraft';

const api = path => `${getApiBaseUrl()}/api/financials${path}`;
const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` } });
const money = value => Number(value || 0).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 2 });
const day = value => value ? new Date(value).toLocaleDateString('es-CO', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }) : 'Por precisar';
const dateValue = value => value ? String(value).slice(0, 10) : '';
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
const field = 'w-full min-h-11 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-zinc-950 dark:text-white';
const button = 'min-h-11 rounded-lg border border-zinc-200 px-4 py-2 text-sm font-semibold disabled:opacity-50 dark:border-white/10';
const primary = `${button} border-transparent bg-primary text-primary-foreground hover:bg-primary/90`;
const label = 'block space-y-1.5 text-sm';

function useReview(path) {
  const [data, setData] = useState(null), [error, setError] = useState('');
  const load = async () => { const result = await axios.get(api(path), auth()); setData(result.data); setError(''); return result.data; };
  useEffect(() => {
    let active = true;
    axios.get(api(path), auth()).then(result => { if (active) setData(result.data); }).catch(e => { if (active) setError(e.response?.data?.message || 'No fue posible consultar la información.'); });
    return () => { active = false; };
  }, [path]);
  return { data, error, load, setError };
}
function Figures({ rows }) {
  return <dl className="grid gap-x-6 gap-y-3 rounded-lg bg-zinc-50 p-4 sm:grid-cols-2 dark:bg-white/5">{rows.map(([name, value]) => <div key={name}><dt className="text-xs text-zinc-500 dark:text-zinc-400">{name}</dt><dd className="mt-1 font-semibold tabular-nums">{value}</dd></div>)}</dl>;
}
function ReviewForm({ scope, revision, initial, children, summarize, send, onDone, onCancel, onBusy, onRefresh }) {
  const [form, setForm, draft] = useFormDraft({ scope, open: true, initial, fingerprint: revision });
  const [review, setReview] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { onBusy(busy); return () => onBusy(false); }, [busy, onBusy]);
  const set = patch => { setForm(current => ({ ...current, ...patch })); setReview(null); setError(''); };
  const submit = async event => {
    event.preventDefault(); if (busy || draft.conflict) return;
    if (!review) {
      try { if (!form.reason?.trim()) throw new Error('Explica el motivo.'); setReview({ rows: summarize(form), payload: { ...form, expectedRevision: revision, requestId: crypto.randomUUID() } }); setError(''); }
      catch (e) { setError(e.message); }
      return;
    }
    setBusy(true); setError('');
    try { await send(review.payload); draft.clear(); await onDone(); }
    catch (e) { setError(e.response?.data?.message || 'No se pudo confirmar. Puedes reintentar sin duplicar la operación.'); }
    finally { setBusy(false); }
  };
  return <form onSubmit={submit} className="space-y-4">
    <DraftNotice draft={draft} disabled={busy || Boolean(review)} />
    {review ? <><h3 className="font-semibold">Revisa antes de confirmar</h3><Figures rows={review.rows} /><p className="text-sm text-zinc-600 dark:text-zinc-300">Motivo: {form.reason}</p><p className="text-xs text-zinc-500">La decisión y su autor quedarán en el historial. No se crea ningún movimiento bancario.</p></> : <fieldset disabled={busy || draft.conflict} className="space-y-4">{children(form, set)}<label className={label}><span>Motivo</span><textarea required maxLength={300} rows={2} className={field} value={form.reason || ''} onChange={event => set({ reason: event.target.value })} /></label></fieldset>}
    {error && <div className="space-y-2"><p role="alert" className="text-sm text-destructive brain-destructive-text">{error}</p><button type="button" className={button} disabled={busy} onClick={async () => { setReview(null); try { await onRefresh(); setError(''); } catch { setError('No se pudo actualizar. Tus datos siguen guardados.'); } }}>Actualizar información</button></div>}
    <div className="flex flex-wrap justify-end gap-2"><button type="button" className={button} disabled={busy} onClick={onCancel}>Cancelar</button>{review && <button type="button" className={button} disabled={busy} onClick={() => setReview(null)}>Volver a editar</button>}<button type="submit" className={primary} disabled={busy || draft.conflict}>{busy ? 'Guardando…' : review ? 'Confirmar' : 'Revisar'}</button></div>
  </form>;
}
function Dates({ form, set }) {
  return <div className="grid gap-4 sm:grid-cols-2"><label className={label}><span>Inicio del servicio</span><BrainDatePicker required ariaLabel="Inicio del servicio" value={form.start} onChange={start => set({ start })} /></label><label className={label}><span>Fin del servicio</span><BrainDatePicker required ariaLabel="Fin del servicio" value={form.end} onChange={end => set({ end })} /></label></div>;
}
export function PayrollPeriodsDialog({ collaborator, year, month, canWrite, canApprove, onClose, onSaved }) {
  const [saving, setSaving] = useState(false);
  const context = useReview(`/payroll-contracts/${collaborator.id}/periods`), [action, setAction] = useState(null), [message, setMessage] = useState('');
  const done = async () => { setAction(null); setMessage(action?.type === 'reverse' ? 'Período revertido.' : 'Período guardado.'); await context.load(); await onSaved('Nómina actualizada; pagos e historial conservados.'); };
  const choose = next => { setMessage(''); setAction(next); };
  const initial = action && { start: dateValue(action.row?.serviceStart), end: dateValue(action.row?.serviceEnd), baseSalary: '', socialSecurity: '0', mode: 'AGREED', year, month, reason: '', reviewContractId: collaborator.id };
  return <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}><DialogContent data-payroll-periods className="max-h-[90vh] overflow-y-auto sm:max-w-3xl dark:bg-zinc-900" onInteractOutside={event => event.preventDefault()}>
    <DialogHeader><DialogTitle>Períodos de nómina · {collaborator.name}</DialogTitle><DialogDescription>Cada período conserva sus pagos. Los importes del contrato no reemplazan las liquidaciones anteriores.</DialogDescription></DialogHeader>
    {context.error && <p role="alert" className="text-sm text-destructive brain-destructive-text">{context.error}</p>}
    {!context.data && !context.error && <p>Cargando períodos…</p>}
    {message && <p role="status" className="text-sm text-status-positive-fg">{message}</p>}
    {context.data && (action ? <ReviewForm key={`${action.type}:${action.row?.id || 'new'}`} scope={`payroll:period:${collaborator.id}:${action.type}:${action.row?.id || `${year}-${month}`}`} revision={context.data.revision} initial={initial} onCancel={() => setAction(null)} onDone={done} onBusy={setSaving} onRefresh={context.load}
      summarize={form => action.type === 'create' ? (() => { const result = calculatePayrollPeriod(form); return [['Servicio', `${day(form.start)} – ${day(form.end)}`], ['Mes de liquidación', `${month}/${year}`], ['Días calendario incluidos', result.days], ['Importe del período', money(result.grossAmount)], ['Estado inicial', 'Borrador · requiere aprobación'], ['Pagos anteriores', 'Se conservan sin cambios']]; })() : action.type === 'identify' ? (() => { if (!form.start || !form.end || form.end < form.start) throw new Error('Revisa las fechas del servicio.'); return [['Período identificado', `${day(form.start)} – ${day(form.end)}`], ['Neto y pagos', 'Se conservan sin cambios']]; })() : [['Período a revertir', `${day(action.row.serviceStart)} – ${day(action.row.serviceEnd)}`], ['Importe que sale de pendientes', money(action.row.netAmount)], ['Historial', 'Se conserva la liquidación revertida']]}
      send={payload => action.type === 'create' ? axios.post(api(`/payroll-contracts/${collaborator.id}/periods`), payload, auth()) : action.type === 'identify' ? axios.patch(api(`/payroll-transactions/${action.row.id}/service-period`), payload, auth()) : axios.post(api(`/payroll-transactions/${action.row.id}/reverse-period`), payload, auth())}>
      {(form, set) => <>{action.type !== 'reverse' && <Dates form={form} set={set} />}{action.type === 'create' && <><label className={label}><span>Cómo se calcula</span><Select className={field} value={form.mode} onChange={event => set({ mode: event.target.value })}><option value="AGREED">Importe acordado para todo el período</option><option value="DAILY">Tarifa por cada día calendario del período</option></Select></label><div className="grid gap-4 sm:grid-cols-2"><label className={label}><span>Valor del servicio{form.mode === 'DAILY' ? ' por día' : ''}</span><MoneyInput required min="0.01" className={field} aria-label="Valor del servicio" value={form.baseSalary} onChange={baseSalary => set({ baseSalary })} /></label><label className={label}><span>Seguridad social{form.mode === 'DAILY' ? ' por día' : ' del período'}</span><MoneyInput className={field} value={form.socialSecurity} onChange={socialSecurity => set({ socialSecurity })} /></label></div><p className="text-xs text-zinc-500">Se liquidará en {month}/{year}, el mes elegido en Nómina. La tarifa diaria cuenta inicio y fin; no supone una quincena de 15 días.</p></>}{action.type === 'identify' && <p className="text-sm text-zinc-500">Solo se precisan las fechas. Se conservan los valores, pagos y comprobantes.</p>}{action.type === 'reverse' && <p className="text-sm">La liquidación dejará de estar pendiente. Si tiene pagos o descuentos vigentes, debes revertirlos antes desde su origen.</p>}</>}
    </ReviewForm> : <>
      <div className="space-y-3">{context.data.transactions.map(row => {
        const cash = row.payments.filter(p => !p.reversedAt).reduce((sum, p) => sum + Number(p.amount), 0), applied = row.adjustments.some(a => !a.reversedAt);
        return <article key={row.id} className="rounded-xl border border-zinc-200 p-4 dark:border-white/10">
          <div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">{row.serviceStart ? `${day(row.serviceStart)} – ${day(row.serviceEnd)}` : 'Período anterior · fechas por precisar'}</h3><span className="text-sm text-zinc-500">{row.voidedAt ? 'Revertida' : row.status === 'DRAFT' ? 'Borrador' : row.status === 'PAID' ? 'Liquidada' : 'Aprobada'}</span></div>
          <p className="my-2 text-xs text-zinc-500">Mes de liquidación: {row.month}/{row.year}</p>
          <Figures rows={[["Neto", money(row.netAmount)], ['Pagado en dinero', money(cash)], ['Descuentos', money(row.deductions)], ['Pendiente', money(row.voidedAt ? 0 : Math.max(Number(row.netAmount) - cash, 0))]]} />
          {row.voidedAt && <p className="mt-2 text-sm text-zinc-500">Motivo: {row.voidReason}</p>}
          {row.periodDetails?.reason && <p className="mt-2 text-xs text-zinc-500">{row.periodDetails.reason} · {row.periodDetails.actorName}</p>}
          {!row.voidedAt && canApprove && <div className="mt-2 flex flex-wrap gap-2"><button type="button" className={button} onClick={() => choose({ type: 'identify', row })}>{row.serviceStart ? 'Corregir fechas' : 'Precisar fechas'}</button><button type="button" className={button} disabled={cash > 0 || applied || Boolean(row.financialRecordId)} onClick={() => choose({ type: 'reverse', row })}>Revertir período</button></div>}
        </article>;
      })}</div>
      <div className="flex justify-end gap-2"><button className={button} type="button" onClick={onClose}>Cerrar</button>{canWrite && <button className={primary} type="button" onClick={() => choose({ type: 'create' })}>Nuevo período</button>}</div>
    </>)}
  </DialogContent></Dialog>;
}

export function PayrollDeductionsDialog({ transaction, canApprove, onClose, onSaved }) {
  const [saving, setSaving] = useState(false);
  const context = useReview(`/payroll-transactions/${transaction.id}/loan-deductions`), [action, setAction] = useState(null), [message, setMessage] = useState('');
  const data = context.data, row = data?.transaction;
  const done = async () => { setMessage(action?.type === 'reverse' ? 'Descuento revertido.' : 'Descuento guardado.'); setAction(null); await context.load(); await onSaved('Descuento actualizado en Nómina y Cartera.'); };
  const choose = next => { setMessage(''); setAction(next); };
  return <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}><DialogContent data-payroll-deductions className="max-h-[90vh] overflow-y-auto sm:max-w-2xl dark:bg-zinc-900" onInteractOutside={event => event.preventDefault()}>
    <DialogHeader><DialogTitle>Descuentos de préstamos · {transaction.collaboratorName}</DialogTitle><DialogDescription>El descuento reduce el préstamo y el neto de esta liquidación. El dinero transferido se registra con «Registrar pago».</DialogDescription></DialogHeader>
    {context.error && <p role="alert" className="text-sm text-destructive brain-destructive-text">{context.error}</p>}
    {!data && !context.error && <p>Cargando nómina y préstamos…</p>}
    {message && <p role="status" className="text-sm text-status-positive-fg">{message}</p>}
    {data && <><Figures rows={[["Bruto del período", money(row.grossAmount)], ['Descuentos vigentes', money(row.deductions)], ['Neto', money(row.netAmount)], ['Pendiente de transferencia', money(data.outstanding)]]} />
      {action ? <ReviewForm key={`${action.type}:${action.item.id}`} scope={`payroll:deduction:${row.id}:${action.type}:${action.item.id}`} revision={data.revision} initial={{ amount: '', authorizedBy: '', reason: '', settledAt: today(), confirmBorrower: false, receivableId: action.item.id }} onCancel={() => setAction(null)} onDone={done} onBusy={setSaving} onRefresh={async () => { await context.load(); setAction(null); }}
        summarize={form => {
          if (action.type === 'reverse') {
            if (action.item.loanOutstanding == null) throw new Error('Revisa el saldo de este préstamo en Cartera antes de revertir.');
            return [['Neto después de revertir', money(Number(row.netAmount) + Number(action.item.amount))], ['Pendiente de transferencia', money(data.outstanding + Number(action.item.amount))], ['Saldo del préstamo después', money(action.item.loanOutstanding + Number(action.item.amount))], ['Pagos ya realizados', 'Se conservan sin cambios']];
          }
          const amount = Number(form.amount);
          if (!Number.isFinite(amount) || amount <= 0 || amount > Math.min(data.outstanding, action.item.outstanding)) throw new Error('El descuento debe caber en ambos saldos.');
          if (!form.authorizedBy.trim()) throw new Error('Indica quién autorizó el descuento.');
          if (!action.item.linked && !form.confirmBorrower) throw new Error('Confirma a quién pertenece el préstamo.');
          return [['Préstamo seleccionado', action.item.name], ['Descuento', money(amount)], ['Neto después', money(Number(row.netAmount) - amount)], ['Pendiente de transferencia', money(data.outstanding - amount)], ['Saldo del préstamo después', money(action.item.outstanding - amount)], ['Dinero movido por este descuento', money(0)]];
        }}
        send={payload => action.type === 'reverse' ? axios.post(api(`/payroll-adjustments/${action.item.id}/reverse`), payload, auth()) : axios.post(api(`/payroll-transactions/${row.id}/loan-deductions`), payload, auth())}>
        {(form, set) => action.type === 'reverse' ? <p className="text-sm">Revertir {money(action.item.amount)} restablecerá ese importe en el préstamo y en lo pendiente de nómina.</p> : <><p className="text-sm font-semibold">{action.item.name} · saldo {money(action.item.outstanding)}</p><div className="grid gap-4 sm:grid-cols-2"><label className={label}><span>Valor del descuento</span><MoneyInput required min="0.01" className={field} value={form.amount} onChange={amount => set({ amount })} /></label><label className={label}><span>Fecha del descuento</span><BrainDatePicker required ariaLabel="Fecha del descuento" value={form.settledAt} onChange={settledAt => set({ settledAt })} /></label></div><label className={label}><span>Autorizado por</span><input required maxLength={120} className={field} value={form.authorizedBy} onChange={event => set({ authorizedBy: event.target.value })} /></label>{!action.item.linked && <label className="flex items-start gap-3 text-sm"><input required type="checkbox" className="mt-1 h-4 w-4" checked={form.confirmBorrower} onChange={event => set({ confirmBorrower: event.target.checked })} /><span>Confirmo que este préstamo pertenece a {transaction.collaboratorName}. Quedará vinculado a esta persona, conservando el nombre e historial anteriores.</span></label>}</>}
      </ReviewForm> : <>
        {data.deductions.length > 0 && <section className="space-y-3"><h3 className="font-semibold">Historial de descuentos</h3>{data.deductions.map(item => <article key={item.id} className="rounded-lg border border-zinc-200 p-3 text-sm dark:border-white/10"><div className="flex flex-wrap items-center justify-between gap-2"><strong>{money(item.amount)} · {item.reversedAt ? 'Revertido' : 'Vigente'}</strong>{!item.reversedAt && canApprove && <button type="button" className={button} onClick={() => choose({ type: 'reverse', item })}>Revertir descuento</button>}</div><p>{item.detail?.loanName} · {day(item.detail?.settledAt)}</p><p className="text-xs text-zinc-500">{item.description} · {item.detail?.actorName}</p>{item.reversedAt && <p className="mt-1 text-xs text-zinc-500">{item.reversalReason} · {item.detail?.reversal?.actorName}</p>}</article>)}</section>}
        {canApprove && row.status === 'APPROVED' && !row.voidedAt && data.outstanding > 0 && <section className="space-y-2"><h3 className="font-semibold">Seleccionar préstamo</h3><p className="text-xs text-zinc-500">Los préstamos sin vínculo necesitan confirmar su titular. No se relacionan por parecido de nombres.</p>{data.options.map(item => <button key={item.id} type="button" className={`${button} flex w-full items-center justify-between text-left`} onClick={() => choose({ type: 'create', item })}><span>{item.name}</span><span>{money(item.outstanding)}</span></button>)}{data.options.length === 0 && <p className="text-sm text-zinc-500">No hay préstamos disponibles con saldo.</p>}</section>}
        {row.status === 'DRAFT' && <p className="text-sm text-zinc-500">Aprueba la liquidación desde Nómina antes de aplicar un descuento.</p>}
        {data.unavailable.map(item => <p key={item.id} className="text-sm text-zinc-500">{item.name}: {item.reason}</p>)}
        <div className="flex justify-end"><button type="button" className={button} onClick={onClose}>Cerrar</button></div>
      </>}
    </>}
  </DialogContent></Dialog>;
}
