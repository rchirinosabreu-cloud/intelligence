import React, { useId, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import Select from '@/components/ui/Select';
import { BrainDatePicker } from '@/components/ui/BrainDatePicker';
import { Plus, Trash2 } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import {
  CLIENT_AGENCIES, CLIENT_COMPLEXITY, CONTRACT_FORMATS as FORMATS, CONTRACT_STATUSES, SERVICE_TYPES, STORY_FREQUENCIES,
  contractQuota, normalizeOperationProfile,
} from '@/lib/clientOperations';

// Ficha operativa (2 de octubre de 2026): las columnas del Excel que nadie más sabe —qué se vendió, para
// quién, a quién le toca— en un solo formulario. Lo editan admins y project managers. Se valida con la
// misma regla que el servidor y no se cierra hasta que el servidor confirma; un clic afuera no la cierra.
const FIELD = 'min-h-11 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60';
const LABEL = 'block text-sm font-medium text-zinc-800 dark:text-zinc-100';
const SECTION = 'space-y-4 border-t border-zinc-100 pt-5 dark:border-white/5';

const emptyContract = () => ({ serviceType: 'PARRILLA', status: 'ACTIVO', startDate: '', endDate: '', cutDay: 1, deliverables: [{ format: 'Reel', quantity: 2 }, { format: 'Carrusel', quantity: 2 }, { format: 'Post', quantity: 8 }], storiesPerWeek: 0, productionDays: 0, monthlyReport: true, notes: '' });

export default function ClientOperationDialog({ client, team, onClose, onSave }) {
  const base = client.contract || emptyContract();
  const [contract, setContract] = useState(() => ({ ...emptyContract(), ...base, deliverables: base.deliverables.map((row) => ({ ...row })) }));
  const [profile, setProfile] = useState({ description: client.description || '', instagramUrl: client.instagramUrl || '', agency: client.agency || 'BRAIN', complexity: client.complexity || '', pmId: client.projectManager?.id || '', cmId: client.communityManager?.id || '' });
  const [customCycle, setCustomCycle] = useState((base.cutDay || 1) !== 1);
  const [renew, setRenew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const id = useId();
  const setC = (patch) => setContract((current) => ({ ...current, ...patch }));
  const setP = (patch) => setProfile((current) => ({ ...current, ...patch }));
  const setRow = (index, patch) => setC({ deliverables: contract.deliverables.map((row, i) => (i === index ? { ...row, ...patch } : row)) });
  const quota = contractQuota(contract);
  const usedFormats = new Set(contract.deliverables.map((row) => row.format));
  const parrilla = contract.serviceType === 'PARRILLA';

  const submit = async (event) => {
    event.preventDefault();
    if (saving) return;
    const input = {
      description: profile.description, instagramUrl: profile.instagramUrl, agency: profile.agency, complexity: profile.complexity,
      projectManagerId: profile.pmId, communityManagerId: profile.cmId,
      renew,
      contract: {
        ...contract,
        cutDay: customCycle ? Number(contract.cutDay) || 1 : 1,
        endDate: contract.endDate || null,
        deliverables: parrilla ? contract.deliverables.map((row) => ({ format: row.format, quantity: Number(row.quantity) })) : [],
      },
    };
    const check = normalizeOperationProfile(input);
    if (!check.valid) { setErrors(check.errors); setError('Revisa los campos marcados.'); return; }
    setSaving(true);
    setErrors({});
    setError('');
    try {
      await onSave(input);
    } catch (failure) {
      console.error('[ClientOperationDialog] No se pudo guardar la ficha:', failure?.errors || failure?.message || failure);
      setErrors(failure?.errors || {});
      setError(failure?.message || 'No se pudo guardar la ficha. Inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  };
  const errorList = Object.values(errors);

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto rounded-2xl" showCloseButton={!saving}
        onInteractOutside={(event) => event.preventDefault()}
        onOpenAutoFocus={(event) => { event.preventDefault(); event.currentTarget.focus(); }}>
        <DialogTitle className="pr-8">Ficha operativa de {client.name}</DialogTitle>
        <DialogDescription>Lo que se le vendió y quién lo lleva. Con esto la plataforma mide el avance de cada mes.</DialogDescription>
        <form onSubmit={submit} className="space-y-5">
          <div className="space-y-1.5">
            <label htmlFor={`${id}-desc`} className={LABEL}>Qué es la marca</label>
            <textarea id={`${id}-desc`} rows={3} value={profile.description} onChange={(e) => setP({ description: e.target.value })} placeholder="En una o dos frases: qué vende, dónde, a quién." className={cn(FIELD, 'resize-y')} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={`${id}-ig`} className={LABEL}>Instagram</label>
            <input id={`${id}-ig`} type="url" value={profile.instagramUrl} onChange={(e) => setP({ instagramUrl: e.target.value })} placeholder="https://www.instagram.com/…" className={FIELD} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor={`${id}-agency`} className={LABEL}>Agencia</label>
              <Select id={`${id}-agency`} value={profile.agency} onChange={(e) => setP({ agency: e.target.value })} className={FIELD}>
                {CLIENT_AGENCIES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor={`${id}-cx`} className={LABEL}>Complejidad</label>
              <Select id={`${id}-cx`} value={profile.complexity} onChange={(e) => setP({ complexity: e.target.value })} className={FIELD}>
                <option value="">Sin definir</option>
                {CLIENT_COMPLEXITY.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor={`${id}-pm`} className={LABEL}>Project manager</label>
              <Select id={`${id}-pm`} value={profile.pmId} onChange={(e) => setP({ pmId: e.target.value })} className={FIELD}>
                <option value="">Sin asignar</option>
                {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </Select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor={`${id}-cm`} className={LABEL}>Community manager</label>
              <Select id={`${id}-cm`} value={profile.cmId} onChange={(e) => setP({ cmId: e.target.value })} className={FIELD}>
                <option value="">Sin asignar</option>
                {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </Select>
            </div>
          </div>

          <div className={SECTION}>
            <p className="text-sm font-semibold">Contrato</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor={`${id}-type`} className={LABEL}>Tipo</label>
                <Select id={`${id}-type`} value={contract.serviceType} onChange={(e) => setC({ serviceType: e.target.value })} className={FIELD}>
                  {SERVICE_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor={`${id}-status`} className={LABEL}>Estado</label>
                <Select id={`${id}-status`} value={contract.status} onChange={(e) => setC({ status: e.target.value })} className={FIELD}>
                  {CONTRACT_STATUSES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </div>
              <div className="space-y-1.5">
                <span className={LABEL}>Inicio</span>
                <BrainDatePicker id={`${id}-start`} ariaLabel="Inicio del contrato" value={contract.startDate} onChange={(value) => setC({ startDate: value })} className={FIELD} required />
              </div>
              <div className="space-y-1.5">
                <span className={LABEL}>Fin</span>
                <BrainDatePicker id={`${id}-end`} ariaLabel="Fin del contrato" value={contract.endDate || ''} onChange={(value) => setC({ endDate: value })} className={FIELD} isClearable placeholder="Sin fecha de cierre" />
              </div>
            </div>

            {parrilla && (
              <>
                <fieldset className="space-y-2">
                  <legend className={LABEL}>Ciclo de la parrilla</legend>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex rounded-xl border border-zinc-200 p-1 dark:border-white/10" role="radiogroup" aria-label="Ciclo de la parrilla">
                      {[[false, 'Mes calendario'], [true, 'Otro día de corte']].map(([value, label]) => (
                        <button key={label} type="button" role="radio" aria-checked={customCycle === value} onClick={() => setCustomCycle(value)}
                          className={cn('min-h-9 rounded-lg px-3 text-sm font-medium transition-colors', customCycle === value ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900' : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/5')}>
                          {label}
                        </button>
                      ))}
                    </div>
                    {customCycle && (
                      <label className="flex items-center gap-2 text-sm">
                        Empieza el día
                        <input type="number" min={2} max={28} value={contract.cutDay} onChange={(e) => setC({ cutDay: e.target.value })} className={cn(FIELD, 'w-20')} />
                      </label>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500">{customCycle ? `La parrilla de cada mes va del día ${contract.cutDay || '…'} al ${Math.max(1, (Number(contract.cutDay) || 2) - 1)} del mes siguiente.` : 'La parrilla de cada mes va del 1 al último día.'}</p>
                </fieldset>

                <fieldset className="space-y-2">
                  <legend className={LABEL}>Piezas al mes</legend>
                  <ul className="space-y-2">
                    {contract.deliverables.map((row, index) => (
                      <li key={index} className="grid grid-cols-[1fr_6rem_2.75rem] gap-2">
                        <Select value={row.format} onChange={(e) => setRow(index, { format: e.target.value })} aria-label={`Formato ${index + 1}`} className={FIELD}>
                          {FORMATS.map((format) => <option key={format} value={format} disabled={format !== row.format && usedFormats.has(format)}>{format}</option>)}
                        </Select>
                        <input type="number" min={0} max={99} value={row.quantity} aria-label={`Cantidad de ${row.format}`} onChange={(e) => setRow(index, { quantity: e.target.value })} className={FIELD} />
                        <button type="button" aria-label={`Quitar ${row.format}`} onClick={() => setC({ deliverables: contract.deliverables.filter((_, i) => i !== index) })}
                          className="brain-danger-button-icon inline-flex min-h-11 items-center justify-center rounded-xl"><Trash2 className="h-4 w-4" /></button>
                      </li>
                    ))}
                  </ul>
                  <div className="flex items-center justify-between gap-3">
                    <button type="button" disabled={usedFormats.size >= FORMATS.length}
                      onClick={() => setC({ deliverables: [...contract.deliverables, { format: FORMATS.find((f) => !usedFormats.has(f)), quantity: 1 }] })}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-brand-cyan-deep hover:bg-brand-cyan/10 disabled:opacity-40 dark:text-brand-cyan">
                      <Plus className="h-4 w-4" /> Añadir formato
                    </button>
                    <p className="text-sm font-semibold">{quota} piezas al mes</p>
                  </div>
                </fieldset>
              </>
            )}

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <label htmlFor={`${id}-stories`} className={LABEL}>Historias</label>
                <Select id={`${id}-stories`} value={String(contract.storiesPerWeek)} onChange={(e) => setC({ storiesPerWeek: Number(e.target.value) })} className={FIELD}>
                  {STORY_FREQUENCIES.map((o) => <option key={o.value} value={String(o.value)}>{o.label}</option>)}
                </Select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor={`${id}-days`} className={LABEL} title="Jornadas de producción al mes">Jornadas al mes</label>
                <input id={`${id}-days`} type="number" min={0} max={10} value={contract.productionDays} onChange={(e) => setC({ productionDays: Number(e.target.value) })} className={FIELD} />
              </div>
              <label className="flex min-h-11 items-center gap-3 self-end rounded-xl border border-zinc-200 px-3 text-sm font-medium dark:border-white/10">
                <input type="checkbox" checked={contract.monthlyReport} onChange={(e) => setC({ monthlyReport: e.target.checked })} className="h-4 w-4 accent-[rgb(var(--brand-cyan))]" />
                Informe mensual
              </label>
            </div>

            <div className="space-y-1.5">
              <label htmlFor={`${id}-notes`} className={LABEL}>Lo que no entra en las cifras</label>
              <textarea id={`${id}-notes`} rows={3} value={contract.notes} onChange={(e) => setC({ notes: e.target.value })} placeholder="Blogs, actualizaciones web, reactivar TikTok, pauta…" className={cn(FIELD, 'resize-y')} />
            </div>
          </div>

          {client.contract && (
            <label className="flex items-start gap-3 rounded-xl border border-zinc-200 p-3 text-sm dark:border-white/10">
              <input type="checkbox" checked={renew} onChange={(e) => setRenew(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[rgb(var(--brand-cyan))]" />
              <span><span className="font-medium">Es una renovación</span><span className="block text-xs text-zinc-500">Guarda esto como un contrato nuevo y deja el anterior en el historial, en vez de corregirlo.</span></span>
            </label>
          )}

          {(error || errorList.length > 0) && (
            <div role="alert" className="brain-alert-surface rounded-xl p-3 text-sm">
              <p className="font-medium">{error}</p>
              {errorList.length > 0 && <ul className="mt-1 list-disc pl-5">{errorList.map((text) => <li key={text}>{text}</li>)}</ul>}
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-zinc-100 pt-4 dark:border-white/5">
            <Button type="button" variant="ghost" className="min-h-11" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button type="submit" className="min-h-11" disabled={saving}>{saving ? 'Guardando…' : 'Guardar ficha'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
