import Select from '@/components/ui/Select';
import MoneyInput from '@/components/ui/MoneyInput';
import React, { useRef, useState } from 'react';
import { Paperclip } from '@/components/ui/icons';
import { FINANCIAL_DOCUMENT_ACCEPT, financialDocumentProblem } from '@/lib/financialDocumentsClient';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import DatePicker from 'react-datepicker';
import { format } from 'date-fns';
import { brainDatePickerProps } from '@/lib/brainDatePicker';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { isLoanReceivable } from '@/lib/receivableLoans';
import { RETENTION_TYPES, normalizeRetentions, retentionsProblem } from '@/lib/receivableSettlement';

// Las retenciones que se ofrecen al registrar un pago: en una cuenta de cobro, la fuente y el ICA.
const PAYMENT_RETENTION_TYPES = RETENTION_TYPES.filter(type => type.value !== 'RETEIVA');

const field = 'min-h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 disabled:opacity-70 dark:border-white/10 dark:bg-zinc-950 dark:text-white';
const money = value => Number(value).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 2 });
export default function ReceivablePaymentDialog({ debt, form, setForm, accounts, saving, error, onClose, onSubmit }) {
  const [page, setPage] = useState(1);
  const [fileProblem, setFileProblem] = useState('');
  const fileInput = useRef(null);
  const existing = form.source === 'EXISTING';
  // La devolución de un préstamo es reintegro (Rodny, 20 de octubre de 2026): no se pide
  // concepto, siempre es Préstamo, y no cuenta como venta.
  const loan = isLoanReceivable(debt);
  const usd = debt?.currency === 'USD';
  // Lo que el cliente retuvo de este pago (Elisa, 22 de octubre de 2026, Fundación Grit): cierra esa
  // parte de la deuda sin contar como ingreso, en el mismo paso que el pago.
  const retentions = form.retentions || {};
  const retentionList = normalizeRetentions(PAYMENT_RETENTION_TYPES.map(type => ({ type: type.value, amount: retentions[type.value] })));
  const retained = retentionList.reduce((sum, item) => sum + item.amount, 0);
  const retentionIssue = !loan && !usd ? retentionsProblem(retentionList, { cash: Number(form.amount) || 0, outstanding: debt?.outstanding }) : null;
  const afterPayment = Math.max((Number(debt?.outstanding) || 0) - (Number(form.amount) || 0) - retained, 0);
  const setRetention = (type, amount) => setForm(current => {
    const next = { ...(current.retentions || {}), [type]: amount };
    // Si el pago venía con todo el saldo, lo retenido sale de ahí: Elisa escribe la retención y el
    // valor del pago baja solo a lo que de verdad entró.
    const nextRetained = normalizeRetentions(PAYMENT_RETENTION_TYPES.map(item => ({ type: item.value, amount: next[item.value] }))).reduce((sum, item) => sum + item.amount, 0);
    const previousRetained = normalizeRetentions(PAYMENT_RETENTION_TYPES.map(item => ({ type: item.value, amount: (current.retentions || {})[item.value] }))).reduce((sum, item) => sum + item.amount, 0);
    const outstanding = Number(debt?.outstanding) || 0;
    const followsBalance = Math.abs((Number(current.amount) || 0) + previousRetained - outstanding) < 0.005;
    return { ...current, retentions: next, ...(followsBalance && !current.financialRecordId ? { amount: String(Math.max(Math.round((outstanding - nextRetained) * 100) / 100, 0)) } : {}) };
  });
  const { data, isLoading, error: candidatesError } = useQuery({
    queryKey: ['financial-payment-candidates', debt?.clientId, page],
    enabled: !!debt?.clientId && existing,
    queryFn: async () => (await axios.get(`${getApiBaseUrl()}/api/financials/records`, {
      params: { availableForReceivable: true, clientId: debt.clientId, page, pageSize: 20 },
      headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
    })).data
  });
  const selectRecord = id => {
    const record = data?.items?.find(item => item.id === id);
    setForm(current => record ? { ...current, financialRecordId: id, amount: String(record.amount), paidAt: record.date.slice(0, 10), accountId: record.accountId, category: record.category, reference: record.reference || '' } : { ...current, financialRecordId: '' });
  };
  return <Dialog open={!!debt} onOpenChange={open => !open && !saving && onClose()}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg dark:bg-zinc-900">
    <DialogHeader><DialogTitle>{loan ? 'Registrar reintegro' : 'Registrar pago'}</DialogTitle><DialogDescription>{debt?.clientName} · {loan ? 'préstamo pendiente' : 'saldo pendiente'} {money(debt?.outstanding || 0)}{loan ? '. Entra como reintegro del préstamo, no como venta.' : ''}</DialogDescription></DialogHeader>
    <form onSubmit={onSubmit} className="space-y-4"><fieldset disabled={saving} className="space-y-4">
      {!loan && <label className="block space-y-1.5 text-sm">Origen del pago<Select className={field} value={form.source || 'NEW'} onChange={event => { setPage(1); setForm(current => ({ ...current, source: event.target.value, financialRecordId: '', category: '', amount: '', accountId: '', reference: '' })); }}><option value="NEW">Registrar un ingreso nuevo</option><option value="EXISTING" disabled={!debt?.clientId}>Ingreso ya registrado</option></Select></label>}
      {existing && <div className="space-y-3">
        <p className="text-sm text-zinc-600 dark:text-zinc-300">No se creará otro ingreso. Se aplicará el importe completo del movimiento seleccionado a esta cuenta por cobrar.</p>
        {candidatesError ? <p role="alert" className="text-sm text-destructive">No fue posible consultar los ingresos registrados.</p> : <>
          <label className="block space-y-1.5 text-sm">Ingreso registrado<Select required className={field} value={form.financialRecordId || ''} onChange={event => selectRecord(event.target.value)} disabled={isLoading}><option value="">{isLoading ? 'Consultando…' : 'Seleccionar ingreso…'}</option>{data?.items?.map(record => <option key={record.id} value={record.id} disabled={Number(record.amount) > Number(debt.outstanding)}>{record.date.slice(0, 10)} · {record.description} · {money(record.amount)}</option>)}</Select></label>
          {!isLoading && !data?.items?.length && <p className="text-sm text-zinc-600 dark:text-zinc-300">No hay ingresos disponibles de este cliente.</p>}
          {(data?.total || 0) > 20 && <div className="flex items-center justify-between text-sm"><button type="button" className="min-h-11 px-2 disabled:opacity-40" disabled={page === 1} onClick={() => { selectRecord(''); setPage(value => value - 1); }}>Anterior</button><span>Página {page} de {Math.ceil(data.total / 20)}</span><button type="button" className="min-h-11 px-2 disabled:opacity-40" disabled={page * 20 >= data.total} onClick={() => { selectRecord(''); setPage(value => value + 1); }}>Siguiente</button></div>}
        </>}
      </div>}
      {!loan && <label className="block space-y-1.5 text-sm">Concepto del ingreso<Select required disabled={existing} className={field} value={form.category || ''} onChange={event => setForm(current => ({ ...current, category: event.target.value }))}><option value="">Seleccionar concepto…</option><option value="MEMBRESIA">Membresía / fee</option><option value="SERVICIO">Servicio / adicional</option><option value="PAUTA">Pauta</option></Select></label>}
      {/* El financiero se lleva en pesos (Rodny, 30 de septiembre de 2026): de una cuenta en
          dólares se registra lo que entró en pesos. */}
      {/* Foobspain, 19 de octubre de 2026: el depósito llega con la tasa del día y no cabía en el
          valor en pesos de la cartera. En dólares el campo no tiene tope: si entró más, la cartera
          se ajusta sola a lo que entró; si entró menos y la cuenta queda al día, se marca. */}
      {usd && <p data-receivable-payment-usd className="rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:bg-white/5 dark:text-zinc-300">Esta cuenta de cobro está en dólares. Registra los pesos que entraron a la cuenta. Si entró más que el valor en pesos de la cartera ({money(debt?.outstanding || 0)} pendientes), la cartera se ajusta sola a lo que entró.</p>}
      <label className="block space-y-1.5 text-sm">Valor{usd ? ' que entró en pesos' : retained > 0 ? ' que entró a la cuenta' : ''}<MoneyInput required readOnly={existing} className={field} min="0.01" max={usd ? undefined : Math.max((Number(debt?.outstanding) || 0) - retained, 0.01)} value={form.amount} onChange={amount => setForm(current => ({ ...current, amount }))} /></label>
      {!loan && !usd && (
        <div data-receivable-payment-retentions className="space-y-2 rounded-lg border border-zinc-200 p-3 dark:border-white/10">
          <p className="text-sm">¿El cliente aplicó retenciones? <span className="text-zinc-400">(opcional)</span></p>
          <p className="text-xs text-zinc-500">Lo retenido lo paga el cliente a la DIAN a nombre de quien emitió la cuenta. Cierra esa parte de la deuda, no cuenta como ingreso y el certificado se adjunta cuando llegue.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {PAYMENT_RETENTION_TYPES.map(type => (
              <label key={type.value} className="block space-y-1.5 text-sm"><span className="block">{type.label}</span><MoneyInput className={field} min="0" value={retentions[type.value] || ''} onChange={amount => setRetention(type.value, amount)} aria-label={type.label} /></label>
            ))}
          </div>
          {retentionIssue
            ? <p role="alert" className="text-xs text-destructive brain-destructive-text">{retentionIssue}</p>
            : retained > 0 && <p data-receivable-payment-after className="text-xs text-zinc-600 dark:text-zinc-300">{afterPayment > 0.005 ? `Con el pago y las retenciones quedará pendiente ${money(afterPayment)}.` : 'Con el pago y las retenciones la cuenta queda pagada.'}</p>}
        </div>
      )}
      {usd && Number(form.amount) > 0 && Number(form.amount) < Number(debt?.outstanding || 0) - 0.005 && (
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 h-4 w-4" checked={Boolean(form.settlesInFull)} onChange={event => setForm(current => ({ ...current, settlesInFull: event.target.checked }))} /><span>Con este pago la cuenta queda al día: la diferencia de {money(Number(debt?.outstanding || 0) - Number(form.amount))} es por la tasa del día, no un saldo pendiente.</span></label>
      )}
      <div className="grid gap-4 sm:grid-cols-2"><label className="flex min-w-0 flex-col gap-1.5 text-sm">Fecha<DatePicker {...brainDatePickerProps} required disabled={existing} wrapperClassName="block w-full" className={field} selected={form.paidAt ? new Date(`${form.paidAt}T12:00:00`) : null} dateFormat="dd/MM/yyyy" onChange={date => setForm(current => ({ ...current, paidAt: date ? format(date, 'yyyy-MM-dd') : '' }))}/></label><label className="flex min-w-0 flex-col gap-1.5 text-sm">Cuenta<Select required disabled={existing} className={field} value={form.accountId} onChange={event => setForm(current => ({ ...current, accountId: event.target.value }))}><option value="">Seleccionar…</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</Select></label></div>
      <label className="block space-y-1.5 text-sm">Referencia<input readOnly={existing} className={field} value={form.reference} onChange={event => setForm(current => ({ ...current, reference: event.target.value }))}/></label>
      <label className="block space-y-1.5 text-sm">Notas<textarea className={field} rows={2} value={form.notes} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))}/></label>
      {/* El soporte del pago (Elisa, 5 de octubre de 2026: «no se puede adjuntar el comprobante»).
          Se sube al ingreso del abono después de que el servidor lo confirme. */}
      <div className="space-y-1.5 text-sm">
        <span className="block">Comprobante <span className="text-zinc-400">(opcional)</span></span>
        <input ref={fileInput} type="file" className="sr-only" accept={FINANCIAL_DOCUMENT_ACCEPT}
          onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; const problem = financialDocumentProblem(file); setFileProblem(problem || ''); if (!problem) setForm(current => ({ ...current, file: file || null })); }} />
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <button type="button" onClick={() => fileInput.current?.click()} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-zinc-200 px-3 text-sm dark:border-white/10"><Paperclip className="h-4 w-4" />{form.file ? 'Cambiar archivo' : 'Subir comprobante'}</button>
          {form.file && <span className="min-w-0 truncate text-xs text-zinc-500">{form.file.name}</span>}
        </div>
        {fileProblem && <p role="alert" className="text-xs text-destructive brain-destructive-text">{fileProblem}</p>}
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <DialogFooter><button type="button" className="min-h-11 rounded-lg px-4 text-sm" onClick={onClose}>Cancelar</button><button type="submit" disabled={saving || (existing && !form.financialRecordId) || Boolean(retentionIssue)} className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">{saving ? 'Guardando…' : loan ? 'Guardar reintegro' : 'Guardar pago'}</button></DialogFooter>
    </fieldset></form>
  </DialogContent></Dialog>;
}
