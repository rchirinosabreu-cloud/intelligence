import React, { useState } from 'react';
import Select from '@/components/ui/Select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { THIRD_PARTY_KINDS, thirdPartyProblem } from '@/lib/accountsPayable';

// El registro de terceros (Rodny, 20 de octubre de 2026: «arranca con las cuentas por pagar y los
// terceros»): cada proveedor, colaborador, arrendador o socio una sola vez, con sus datos de pago.
// Nada se borra: un tercero que ya no se usa se desactiva y conserva sus cuentas.

const field = 'min-h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 disabled:opacity-70 dark:border-white/10 dark:bg-zinc-950 dark:text-white';
const DOCUMENT_TYPES = [['', 'Sin definir'], ['CC', 'Cédula de ciudadanía'], ['CE', 'Cédula de extranjería'], ['NIT', 'NIT'], ['PAS', 'Pasaporte'], ['EIN', 'EIN']];
const ACCOUNT_TYPES = [['', 'Sin definir'], ['AHORROS', 'Ahorros'], ['CORRIENTE', 'Corriente'], ['NEQUI', 'Nequi'], ['DAVIPLATA', 'Daviplata'], ['OTRA', 'Otra']];

export const emptyThirdParty = () => ({ kind: 'PROVEEDOR', name: '', legalName: '', documentType: '', documentNumber: '', email: '', phone: '', bankName: '', bankAccountType: '', bankAccountNumber: '', notes: '', isActive: true });

export function ThirdPartyDialog({ open, thirdParty, saving, error, onClose, onSubmit }) {
  const [form, setForm] = useState(() => ({ ...emptyThirdParty(), ...(thirdParty || {}) }));
  const [problem, setProblem] = useState('');
  const set = (patch) => { setProblem(''); setForm((current) => ({ ...current, ...patch })); };
  const submit = (event) => {
    event.preventDefault();
    const found = thirdPartyProblem(form);
    if (found) { setProblem(found); return; }
    onSubmit(form);
  };
  const shown = problem || error;
  return <Dialog open={open} onOpenChange={(next) => !next && !saving && onClose()}><DialogContent data-third-party-dialog className="max-h-[90vh] overflow-y-auto sm:max-w-lg dark:bg-zinc-900">
    <DialogHeader><DialogTitle>{thirdParty?.id ? 'Editar tercero' : 'Nuevo tercero'}</DialogTitle><DialogDescription>A quién le paga Brain Studio: proveedores, el equipo, el arrendador, un socio. Sus datos de pago quedan aquí una sola vez.</DialogDescription></DialogHeader>
    <form onSubmit={submit} className="space-y-4"><fieldset disabled={saving} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5 text-sm"><span className="block">Clase</span><Select required className={field} value={form.kind} onChange={(event) => set({ kind: event.target.value })}>{THIRD_PARTY_KINDS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</Select></label>
        <label className="block space-y-1.5 text-sm"><span className="block">Nombre</span><input required className={field} value={form.name} maxLength={120} onChange={(event) => set({ name: event.target.value })} placeholder="Ej.: Papelería El Punto" /></label>
      </div>
      <label className="block space-y-1.5 text-sm"><span className="block">Razón social <span className="text-zinc-400">(opcional)</span></span><input className={field} value={form.legalName || ''} maxLength={160} onChange={(event) => set({ legalName: event.target.value })} /></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5 text-sm"><span className="block">Tipo de documento</span><Select className={field} value={form.documentType || ''} onChange={(event) => set({ documentType: event.target.value })}>{DOCUMENT_TYPES.map(([value, label]) => <option key={value || 'none'} value={value}>{label}</option>)}</Select></label>
        <label className="block space-y-1.5 text-sm"><span className="block">Número</span><input className={field} value={form.documentNumber || ''} maxLength={40} onChange={(event) => set({ documentNumber: event.target.value })} /></label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5 text-sm"><span className="block">Correo <span className="text-zinc-400">(opcional)</span></span><input type="email" className={field} value={form.email || ''} onChange={(event) => set({ email: event.target.value })} /></label>
        <label className="block space-y-1.5 text-sm"><span className="block">Teléfono <span className="text-zinc-400">(opcional)</span></span><input className={field} value={form.phone || ''} maxLength={40} onChange={(event) => set({ phone: event.target.value })} /></label>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block space-y-1.5 text-sm"><span className="block">Banco</span><input className={field} value={form.bankName || ''} maxLength={80} onChange={(event) => set({ bankName: event.target.value })} placeholder="Bancolombia" /></label>
        <label className="block space-y-1.5 text-sm"><span className="block">Tipo de cuenta</span><Select className={field} value={form.bankAccountType || ''} onChange={(event) => set({ bankAccountType: event.target.value })}>{ACCOUNT_TYPES.map(([value, label]) => <option key={value || 'none'} value={value}>{label}</option>)}</Select></label>
        <label className="block space-y-1.5 text-sm"><span className="block">Número de cuenta</span><input className={field} value={form.bankAccountNumber || ''} maxLength={40} onChange={(event) => set({ bankAccountNumber: event.target.value })} /></label>
      </div>
      <label className="block space-y-1.5 text-sm"><span className="block">Notas <span className="text-zinc-400">(opcional)</span></span><textarea className={field} rows={2} maxLength={500} value={form.notes || ''} onChange={(event) => set({ notes: event.target.value })} /></label>
      {thirdParty?.id && <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={form.isActive !== false} onChange={(event) => set({ isActive: event.target.checked })} /><span>Activo. Un tercero desactivado conserva sus cuentas pero no aparece al registrar una nueva.</span></label>}
      {shown && <p role="alert" className="text-sm text-destructive brain-destructive-text">{shown}</p>}
      <DialogFooter><button type="button" className="min-h-11 rounded-lg px-4 text-sm" onClick={onClose}>Cancelar</button><button type="submit" disabled={saving} className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">{saving ? 'Guardando…' : 'Guardar tercero'}</button></DialogFooter>
    </fieldset></form>
  </DialogContent></Dialog>;
}
