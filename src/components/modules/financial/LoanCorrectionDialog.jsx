import React, { useEffect, useState } from 'react';
import axios from 'axios';
import Select from '@/components/ui/Select';
import MoneyInput from '@/components/ui/MoneyInput';
import { BrainDatePicker } from '@/components/ui/BrainDatePicker';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';

// Corregir un préstamo sin eliminarlo (Elisa, reunión de noviembre de 2026: «todo lo que haga un
// movimiento se tiene que poder modificar, siempre me puedo equivocar»). Valor, fecha y cuenta
// cambian en el préstamo y en su egreso a la vez; los reintegros se conservan.
const field = 'min-h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 disabled:opacity-70 dark:border-white/10 dark:bg-zinc-950 dark:text-white';
const money = value => Number(value || 0).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 2 });
const day = value => (value ? String(value).slice(0, 10) : '');

export const loanCorrectionFormFrom = debt => ({
  amount: String(debt?.amount ?? ''),
  lentAt: day(debt?.loanRecord?.date || debt?.period),
  accountId: debt?.loanRecord?.accountId || '',
  reason: '',
});

export default function LoanCorrectionDialog({ debt, accounts = [], onClose, onSaved }) {
  const [form, setForm] = useState(() => loanCorrectionFormFrom(debt));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setForm(loanCorrectionFormFrom(debt)); setError(''); }, [debt]);
  if (!debt) return null;

  const hasRecord = Boolean(debt.loanRecord);
  const applied = Math.max(Number(debt.amount || 0) - Number(debt.outstanding || 0), 0);
  const belowApplied = Number(form.amount) > 0 && Number(form.amount) + 0.005 < applied;
  const submit = async event => {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      const { data } = await axios.post(`${getApiBaseUrl()}/api/financials/loans/${debt.id}/correction`, {
        amount: form.amount, lentAt: form.lentAt, accountId: hasRecord ? form.accountId : undefined,
        reason: form.reason, expectedUpdatedAt: debt.updatedAt || undefined,
      }, { headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` } });
      onSaved?.(data);
    } catch (requestError) {
      console.error('[Loans] Correction failed:', requestError.response?.data || requestError);
      setError(requestError.response?.data?.message || 'No fue posible corregir el préstamo.');
    } finally {
      setSaving(false);
    }
  };

  return <Dialog open={!!debt} onOpenChange={open => !open && !saving && onClose()}><DialogContent data-loan-correction className="max-h-[90vh] overflow-y-auto sm:max-w-lg dark:bg-zinc-900" onOpenAutoFocus={event => { event.preventDefault(); event.currentTarget.focus(); }}>
    <DialogHeader>
      <DialogTitle>Corregir préstamo</DialogTitle>
      <DialogDescription>{debt.partyName || debt.clientName} · {hasRecord ? 'el egreso en Movimientos cambia con el préstamo.' : 'este préstamo no tiene egreso ligado en Movimientos.'}{applied > 0.005 ? ` Ya se aplicaron ${money(applied)}: se conservan.` : ''}</DialogDescription>
    </DialogHeader>
    <form onSubmit={submit} className="space-y-4"><fieldset disabled={saving} className="space-y-4">
      <label className="block space-y-1.5 text-sm"><span className="block">Valor prestado</span>
        <MoneyInput required min="0.01" className={field} value={form.amount} onChange={amount => setForm(current => ({ ...current, amount }))} aria-label="Valor prestado" />
      </label>
      {belowApplied && <p role="alert" className="text-xs text-destructive brain-destructive-text">No puede quedar por debajo de lo ya aplicado ({money(applied)}).</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex min-w-0 flex-col gap-1.5 text-sm"><span className="block">Fecha del préstamo</span>
          <BrainDatePicker required value={form.lentAt} onChange={lentAt => setForm(current => ({ ...current, lentAt }))} className={field} ariaLabel="Fecha del préstamo" />
        </label>
        {hasRecord && <label className="flex min-w-0 flex-col gap-1.5 text-sm"><span className="block">Cuenta de donde salió</span>
          <Select required className={field} value={form.accountId} onChange={event => setForm(current => ({ ...current, accountId: event.target.value }))}>
            <option value="">Seleccionar…</option>
            {accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
          </Select>
        </label>}
      </div>
      <label className="block space-y-1.5 text-sm"><span className="block">Motivo de la corrección</span>
        <textarea required maxLength={300} rows={2} className={field} value={form.reason} onChange={event => setForm(current => ({ ...current, reason: event.target.value }))} />
      </label>
      {error && <p role="alert" className="text-sm text-destructive brain-destructive-text">{error}</p>}
      <DialogFooter>
        <button type="button" className="min-h-11 rounded-lg px-4 text-sm" onClick={onClose}>Cancelar</button>
        <button type="submit" disabled={saving || belowApplied || !form.reason.trim()} className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">{saving ? 'Guardando…' : 'Guardar corrección'}</button>
      </DialogFooter>
    </fieldset></form>
  </DialogContent></Dialog>;
}
