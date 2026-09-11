import Select from '@/components/ui/Select';
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import DatePicker from 'react-datepicker';
import { format } from 'date-fns';
import { brainDatePickerProps } from '@/lib/brainDatePicker';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const field = 'min-h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 disabled:opacity-70 dark:border-white/10 dark:bg-zinc-950 dark:text-white';
const money = value => Number(value).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 2 });
export default function ReceivablePaymentDialog({ debt, form, setForm, accounts, saving, error, onClose, onSubmit }) {
  const [page, setPage] = useState(1);
  const existing = form.source === 'EXISTING';
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
    <DialogHeader><DialogTitle>Registrar pago</DialogTitle><DialogDescription>{debt?.clientName} · saldo pendiente {money(debt?.outstanding || 0)}</DialogDescription></DialogHeader>
    <form onSubmit={onSubmit} className="space-y-4"><fieldset disabled={saving} className="space-y-4">
      <label className="block space-y-1.5 text-sm">Origen del pago<Select className={field} value={form.source || 'NEW'} onChange={event => { setPage(1); setForm(current => ({ ...current, source: event.target.value, financialRecordId: '', category: '', amount: '', accountId: '', reference: '' })); }}><option value="NEW">Registrar un ingreso nuevo</option><option value="EXISTING" disabled={!debt?.clientId}>Ingreso ya registrado</option></Select></label>
      {existing && <div className="space-y-3">
        <p className="text-sm text-zinc-600 dark:text-zinc-300">No se creará otro ingreso. Se aplicará el importe completo del movimiento seleccionado a esta cuenta por cobrar.</p>
        {candidatesError ? <p role="alert" className="text-sm text-destructive">No fue posible consultar los ingresos registrados.</p> : <>
          <label className="block space-y-1.5 text-sm">Ingreso registrado<Select required className={field} value={form.financialRecordId || ''} onChange={event => selectRecord(event.target.value)} disabled={isLoading}><option value="">{isLoading ? 'Consultando…' : 'Seleccionar ingreso…'}</option>{data?.items?.map(record => <option key={record.id} value={record.id} disabled={Number(record.amount) > Number(debt.outstanding)}>{record.date.slice(0, 10)} · {record.description} · {money(record.amount)}</option>)}</Select></label>
          {!isLoading && !data?.items?.length && <p className="text-sm text-zinc-600 dark:text-zinc-300">No hay ingresos disponibles de este cliente.</p>}
          {(data?.total || 0) > 20 && <div className="flex items-center justify-between text-sm"><button type="button" className="min-h-11 px-2 disabled:opacity-40" disabled={page === 1} onClick={() => { selectRecord(''); setPage(value => value - 1); }}>Anterior</button><span>Página {page} de {Math.ceil(data.total / 20)}</span><button type="button" className="min-h-11 px-2 disabled:opacity-40" disabled={page * 20 >= data.total} onClick={() => { selectRecord(''); setPage(value => value + 1); }}>Siguiente</button></div>}
        </>}
      </div>}
      <label className="block space-y-1.5 text-sm">Concepto del ingreso<Select required disabled={existing} className={field} value={form.category || ''} onChange={event => setForm(current => ({ ...current, category: event.target.value }))}><option value="">Seleccionar concepto…</option><option value="MEMBRESIA">Membresía / fee</option><option value="SERVICIO">Servicio / adicional</option><option value="PAUTA">Pauta</option></Select></label>
      <label className="block space-y-1.5 text-sm">Valor<input required readOnly={existing} className={field} type="number" min="0.01" step="0.01" max={debt?.outstanding} value={form.amount} onChange={event => setForm(current => ({ ...current, amount: event.target.value }))} /></label>
      <div className="grid gap-4 sm:grid-cols-2"><label className="flex min-w-0 flex-col gap-1.5 text-sm">Fecha<DatePicker {...brainDatePickerProps} required disabled={existing} wrapperClassName="block w-full" className={field} selected={form.paidAt ? new Date(`${form.paidAt}T12:00:00`) : null} dateFormat="dd/MM/yyyy" onChange={date => setForm(current => ({ ...current, paidAt: date ? format(date, 'yyyy-MM-dd') : '' }))}/></label><label className="flex min-w-0 flex-col gap-1.5 text-sm">Cuenta<Select required disabled={existing} className={field} value={form.accountId} onChange={event => setForm(current => ({ ...current, accountId: event.target.value }))}><option value="">Seleccionar…</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</Select></label></div>
      <label className="block space-y-1.5 text-sm">Referencia<input readOnly={existing} className={field} value={form.reference} onChange={event => setForm(current => ({ ...current, reference: event.target.value }))}/></label>
      <label className="block space-y-1.5 text-sm">Notas<textarea className={field} rows={2} value={form.notes} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))}/></label>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <DialogFooter><button type="button" className="min-h-11 rounded-lg px-4 text-sm" onClick={onClose}>Cancelar</button><button type="submit" disabled={saving || (existing && !form.financialRecordId)} className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">{saving ? 'Guardando…' : 'Guardar pago'}</button></DialogFooter>
    </fieldset></form>
  </DialogContent></Dialog>;
}
