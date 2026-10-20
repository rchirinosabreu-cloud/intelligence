import React, { useState } from 'react';
import Select from '@/components/ui/Select';
import MoneyInput from '@/components/ui/MoneyInput';
import { BrainDatePicker } from '@/components/ui/BrainDatePicker';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SETTLEMENT_KINDS, SETTLEMENT_REASON_MAX, settlementProblem } from '@/lib/receivableSettlement';

// Saldar una deuda sin que entre (todo) el dinero (Rodny, 20 de octubre de 2026): acuerdo por
// menor valor, canje, compensación o condonación. Se conserva el valor original y no se crea
// ningún ingreso; queda quién autorizó y por qué. La regla es la misma del servidor.
const field = 'min-h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 disabled:opacity-70 dark:border-white/10 dark:bg-zinc-950 dark:text-white';
const money = value => Number(value || 0).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 2 });
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });

export default function ReceivableSettlementDialog({ debt, saving, error, onClose, onSubmit }) {
  const [form, setForm] = useState({ kind: 'ACUERDO', amount: String(debt?.outstanding ?? ''), settledAt: today(), reason: '', authorizedBy: '', goods: '', destination: '', offsetAgainst: '' });
  const [problem, setProblem] = useState('');
  const kind = SETTLEMENT_KINDS.find(item => item.value === form.kind);
  const set = patch => { setProblem(''); setForm(current => ({ ...current, ...patch })); };
  const remaining = Math.max((Number(debt?.outstanding) || 0) - (Number(form.amount) || 0), 0);
  const submit = event => {
    event.preventDefault();
    const found = settlementProblem({ ...form, outstanding: debt?.outstanding });
    if (found) { setProblem(found); return; }
    onSubmit({ ...form, amount: Number(form.amount) });
  };
  const shown = problem || error;
  return <Dialog open={!!debt} onOpenChange={open => !open && !saving && onClose()}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg dark:bg-zinc-900" onOpenAutoFocus={event => { event.preventDefault(); event.currentTarget.focus(); }}>
    <DialogHeader><DialogTitle>Saldar de otra forma</DialogTitle><DialogDescription>{debt?.clientName} · saldo pendiente {money(debt?.outstanding)}. No se registra ningún ingreso: la deuda baja por un ajuste autorizado, y lo que entró en dinero sigue siendo lo único que cuenta como ingreso.</DialogDescription></DialogHeader>
    <form onSubmit={submit} className="space-y-4"><fieldset disabled={saving} className="space-y-4">
      <label className="block space-y-1.5 text-sm"><span className="block">Forma de saldar</span><Select required className={field} value={form.kind} onChange={event => set({ kind: event.target.value })}>{SETTLEMENT_KINDS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</Select></label>
      {kind && <p data-settlement-help className="rounded-lg bg-zinc-50 px-3 py-2 text-xs leading-5 text-zinc-600 dark:bg-white/5 dark:text-zinc-300">{kind.help}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5 text-sm"><span className="block">Valor que se da por saldado</span><MoneyInput required className={field} min="0.01" max={debt?.outstanding} value={form.amount} onChange={amount => set({ amount })} /></label>
        <label className="block space-y-1.5 text-sm"><span className="block">Fecha</span><BrainDatePicker required className={field} value={form.settledAt} onChange={settledAt => set({ settledAt })} ariaLabel="Fecha del cierre" /></label>
      </div>
      <p data-settlement-remaining className="text-xs text-zinc-600 dark:text-zinc-300">{remaining > 0.005 ? `Quedará pendiente ${money(remaining)}.` : 'La cuenta quedará saldada.'}</p>
      <label className="block space-y-1.5 text-sm"><span className="block">Autorizado por</span><input required className={field} value={form.authorizedBy} onChange={event => set({ authorizedBy: event.target.value })} placeholder="Ej.: Francisco Villa" maxLength={120} /></label>
      {form.kind === 'CANJE' && <>
        <label className="block space-y-1.5 text-sm"><span className="block">Qué se recibió</span><textarea required className={field} rows={2} value={form.goods} onChange={event => set({ goods: event.target.value })} placeholder="Ej.: muebles de oficina: 2 escritorios y 4 sillas" maxLength={500} /></label>
        <label className="block space-y-1.5 text-sm"><span className="block">A dónde fue <span className="text-zinc-400">(opcional)</span></span><input className={field} value={form.destination} onChange={event => set({ destination: event.target.value })} placeholder="Ej.: uso personal de un socio; pendiente definir si es anticipo" maxLength={500} /></label>
      </>}
      {form.kind === 'COMPENSACION' && <label className="block space-y-1.5 text-sm"><span className="block">Contra qué se compensa</span><input required className={field} value={form.offsetAgainst} onChange={event => set({ offsetAgainst: event.target.value })} placeholder="Ej.: lo que le debíamos por el alquiler del local" maxLength={500} /></label>}
      <label className="block space-y-1.5 text-sm"><span className="block">Motivo</span><textarea required className={field} rows={3} maxLength={SETTLEMENT_REASON_MAX} value={form.reason} onChange={event => set({ reason: event.target.value })} placeholder="Ej.: el negocio cerró; por mutuo acuerdo se cierra con 2.000.000 para recuperar al menos una parte." /><span className="block text-right text-[11px] text-zinc-400">{form.reason.length}/{SETTLEMENT_REASON_MAX}</span></label>
      {shown && <p role="alert" className="text-sm text-destructive brain-destructive-text">{shown}</p>}
      <DialogFooter><button type="button" className="min-h-11 rounded-lg px-4 text-sm" onClick={onClose}>Cancelar</button><button type="submit" disabled={saving} className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">{saving ? 'Guardando…' : 'Saldar la deuda'}</button></DialogFooter>
    </fieldset></form>
  </DialogContent></Dialog>;
}
