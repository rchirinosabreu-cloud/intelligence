import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import Select from '@/components/ui/Select';
import MoneyInput from '@/components/ui/MoneyInput';
import { BrainDatePicker } from '@/components/ui/BrainDatePicker';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { LOAN_COUNTERPARTY_TYPES, loanProblem } from '@/lib/receivableLoans';

// Registrar un préstamo a un tercero (Rodny, 20 de octubre de 2026: «cuando registro un préstamo
// no se me va a cuentas por cobrar … que me aparezca en cartera»). Crea el egreso y la cuenta por
// cobrar de una vez; si el egreso ya está en Movimientos, lo liga en vez de duplicarlo.
const field = 'min-h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 disabled:opacity-70 dark:border-white/10 dark:bg-zinc-950 dark:text-white';
const money = value => Number(value || 0).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 2 });
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });

export default function ReceivableLoanDialog({ open, clients = [], accounts = [], saving, error, onClose, onSubmit }) {
  const [form, setForm] = useState({ counterpartyType: 'COLABORADOR', counterpartyName: '', clientId: '', amount: '', lentAt: today(), accountId: '', financialRecordId: '', source: 'NEW', dueDate: '', notes: '' });
  const [problem, setProblem] = useState('');
  const existing = form.source === 'EXISTING';
  const set = patch => { setProblem(''); setForm(current => ({ ...current, ...patch })); };
  const { data: candidates, isLoading } = useQuery({
    queryKey: ['financial-loan-candidates'],
    enabled: open && existing,
    queryFn: async () => (await axios.get(`${getApiBaseUrl()}/api/financials/records`, {
      params: { availableForLoan: true, page: 1, pageSize: 50 },
      headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
    })).data
  });
  const selectRecord = id => {
    const record = candidates?.items?.find(item => item.id === id);
    set(record ? { financialRecordId: id, amount: String(record.amount), lentAt: record.date.slice(0, 10), accountId: record.accountId || '' } : { financialRecordId: '' });
  };
  const submit = event => {
    event.preventDefault();
    const found = loanProblem(form);
    if (found) { setProblem(found); return; }
    const { source, ...payload } = form;
    onSubmit({ ...payload, amount: Number(form.amount), financialRecordId: existing ? form.financialRecordId : '', accountId: existing ? '' : form.accountId });
  };
  const shown = problem || error;
  return <Dialog open={open} onOpenChange={next => !next && !saving && onClose()}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg dark:bg-zinc-900" onOpenAutoFocus={event => { event.preventDefault(); event.currentTarget.focus(); }}>
    <DialogHeader><DialogTitle>Registrar préstamo</DialogTitle><DialogDescription>Queda en Cartera junto a lo de los clientes. El egreso sale de la cuenta que elijas y la devolución se registra como reintegro, no como venta.</DialogDescription></DialogHeader>
    <form onSubmit={submit} className="space-y-4"><fieldset disabled={saving} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5 text-sm"><span className="block">A quién se le presta</span><Select required className={field} value={form.counterpartyType} onChange={event => set({ counterpartyType: event.target.value, counterpartyName: '', clientId: '' })}>{LOAN_COUNTERPARTY_TYPES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</Select></label>
        {form.counterpartyType === 'CLIENTE'
          ? <label className="block space-y-1.5 text-sm"><span className="block">Cliente</span><Select required className={field} value={form.clientId} onChange={event => set({ clientId: event.target.value })}><option value="">Seleccionar…</option>{clients.map(client => <option key={client.id} value={client.id}>{client.label || client.name}</option>)}</Select></label>
          : <label className="block space-y-1.5 text-sm"><span className="block">Nombre</span><input required className={field} value={form.counterpartyName} onChange={event => set({ counterpartyName: event.target.value })} placeholder="Ej.: Melissa Ruiz" maxLength={120} /></label>}
      </div>
      <label className="block space-y-1.5 text-sm"><span className="block">El dinero</span><Select className={field} value={form.source} onChange={event => set({ source: event.target.value, financialRecordId: '', amount: '', accountId: '' })}><option value="NEW">Registrar el egreso ahora</option><option value="EXISTING">El egreso ya está en Movimientos</option></Select></label>
      {existing && <label className="block space-y-1.5 text-sm"><span className="block">Egreso de préstamo registrado</span><Select required className={field} value={form.financialRecordId} onChange={event => selectRecord(event.target.value)} disabled={isLoading}><option value="">{isLoading ? 'Consultando…' : 'Seleccionar egreso…'}</option>{candidates?.items?.map(record => <option key={record.id} value={record.id}>{record.date.slice(0, 10)} · {record.description || 'Préstamo'} · {money(record.amount)}</option>)}</Select>{!isLoading && existing && !candidates?.items?.length && <span className="block text-xs text-zinc-500">No hay egresos de categoría Préstamo sin ligar a un préstamo.</span>}</label>}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5 text-sm"><span className="block">Valor prestado</span><MoneyInput required readOnly={existing} className={field} min="0.01" value={form.amount} onChange={amount => set({ amount })} /></label>
        <label className="block space-y-1.5 text-sm"><span className="block">Salió el</span><BrainDatePicker required disabled={existing} className={field} value={form.lentAt} onChange={lentAt => set({ lentAt })} ariaLabel="Fecha en que salió el dinero" /></label>
      </div>
      {!existing && <label className="block space-y-1.5 text-sm"><span className="block">Cuenta de la que salió</span><Select required className={field} value={form.accountId} onChange={event => set({ accountId: event.target.value })}><option value="">Seleccionar…</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</Select></label>}
      <label className="block space-y-1.5 text-sm"><span className="block">Devolución acordada para <span className="text-zinc-400">(opcional)</span></span><BrainDatePicker className={field} value={form.dueDate} onChange={dueDate => set({ dueDate })} ariaLabel="Fecha acordada de devolución" isClearable /></label>
      <label className="block space-y-1.5 text-sm"><span className="block">Notas <span className="text-zinc-400">(opcional)</span></span><textarea className={field} rows={2} maxLength={500} value={form.notes} onChange={event => set({ notes: event.target.value })} placeholder="Ej.: se descuenta en dos quincenas." /></label>
      {shown && <p role="alert" className="text-sm text-destructive brain-destructive-text">{shown}</p>}
      <DialogFooter><button type="button" className="min-h-11 rounded-lg px-4 text-sm" onClick={onClose}>Cancelar</button><button type="submit" disabled={saving || (existing && !form.financialRecordId)} className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">{saving ? 'Guardando…' : 'Registrar préstamo'}</button></DialogFooter>
    </fieldset></form>
  </DialogContent></Dialog>;
}
