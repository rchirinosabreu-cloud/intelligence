import React, { useState } from 'react';
import Select from '@/components/ui/Select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { CLOSE_NOTE_MAX, REPORT_LINK_MAX, REPORT_STATUSES, closeSnapshot, closeSummaryText, reportProblem } from '@/lib/monthlyClose';
import { AUTHORIZATION_REASON_MAX, authorizationProblem } from '@/lib/unbackedWork';
import { SUSPENSION_AUTHORIZED_BY_MAX, SUSPENSION_REASON_MAX, liftProblem, suspensionProblem } from '@/lib/clientSuspension';
import { BrainDatePicker } from '@/components/ui/BrainDatePicker';

// El informe del mes y el cierre del mes (punto 5 de la solicitud de Elisa, 29 de octubre de 2026).

const FIELD = 'min-h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-white/10 dark:bg-zinc-950 dark:text-white';
const PRIMARY = 'min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50';

export function ReportDialog({ month, onClose, onSave }) {
    const [form, setForm] = useState({ status: month.report?.status || 'EN_ELABORACION', link: month.report?.link || '', note: month.report?.note || '' });
    const [problem, setProblem] = useState('');
    const [saving, setSaving] = useState(false);
    const set = (patch) => { setForm((current) => ({ ...current, ...patch })); setProblem(''); };
    const save = async () => {
        const invalid = reportProblem(form);
        if (invalid) { setProblem(invalid); return; }
        setSaving(true);
        try {
            await onSave(form);
        } catch (error) {
            setProblem(error.message || 'No pudimos guardar el informe.');
        } finally {
            setSaving(false);
        }
    };
    return (
        <Dialog open onOpenChange={(next) => !next && !saving && onClose()}>
            <DialogContent data-report-dialog className="sm:max-w-md dark:bg-zinc-900">
                <DialogHeader>
                    <DialogTitle>Informe de {month.label.toLowerCase()}</DialogTitle>
                    <DialogDescription>En qué va y, cuando se envíe, el enlace al informe como soporte de entrega.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <label className="block space-y-1.5 text-sm"><span className="block">Estado</span>
                        <Select className={FIELD} value={form.status} onChange={(event) => set({ status: event.target.value })} aria-label="Estado del informe">
                            {REPORT_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                        </Select>
                    </label>
                    <label className="block space-y-1.5 text-sm"><span className="block">Enlace al informe <span className="text-zinc-400">(opcional)</span></span>
                        <input className={FIELD} maxLength={REPORT_LINK_MAX} value={form.link} data-report-link placeholder="https://"
                            onChange={(event) => set({ link: event.target.value })} />
                    </label>
                    <label className="block space-y-1.5 text-sm"><span className="block">Nota <span className="text-zinc-400">(opcional)</span></span>
                        <input className={FIELD} maxLength={CLOSE_NOTE_MAX} value={form.note} data-report-note
                            onChange={(event) => set({ note: event.target.value })} />
                    </label>
                    {problem && <p role="alert" className="brain-destructive-text text-destructive text-sm">{problem}</p>}
                </div>
                <DialogFooter>
                    <button type="button" className="min-h-11 rounded-lg px-4 text-sm" onClick={onClose} disabled={saving}>Cancelar</button>
                    <button type="button" onClick={save} disabled={saving} data-report-save className={PRIMARY}>{saving ? 'Guardando…' : 'Guardar'}</button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// Seguir trabajando sin propuesta aprobada hasta una fecha (29 de octubre de 2026): Dirección o Administración.
export function WorkAuthorizationDialog({ clientName, today, onClose, onSave }) {
    const [form, setForm] = useState({ until: '', reason: '' });
    const [problem, setProblem] = useState('');
    const [saving, setSaving] = useState(false);
    const set = (patch) => { setForm((current) => ({ ...current, ...patch })); setProblem(''); };
    const save = async () => {
        const invalid = authorizationProblem(form, today);
        if (invalid) { setProblem(invalid); return; }
        setSaving(true);
        try {
            await onSave(form);
        } catch (error) {
            setProblem(error.message || 'No pudimos guardar la autorización.');
        } finally {
            setSaving(false);
        }
    };
    return (
        <Dialog open onOpenChange={(next) => !next && !saving && onClose()}>
            <DialogContent data-work-authorization-dialog className="sm:max-w-md dark:bg-zinc-900"
                onOpenAutoFocus={(event) => { event.preventDefault(); event.currentTarget.focus(); }}>
                <DialogHeader>
                    <DialogTitle>Seguir sin propuesta aprobada</DialogTitle>
                    <DialogDescription>{clientName}. Mientras esté vigente no se avisa a Dirección; al vencer, vuelve a avisar si sigue igual.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <label className="block space-y-1.5 text-sm"><span className="block">Motivo</span>
                        <textarea className={cn(FIELD, 'min-h-20')} maxLength={AUTHORIZATION_REASON_MAX} value={form.reason} data-work-authorization-reason
                            placeholder="Por ejemplo: la renovación está firmada y falta cargar el contrato"
                            onChange={(event) => set({ reason: event.target.value })} />
                    </label>
                    <label className="block space-y-1.5 text-sm"><span className="block">Hasta</span>
                        <BrainDatePicker className={FIELD} value={form.until} min={today} onChange={(until) => set({ until: until || '' })} ariaLabel="Hasta qué fecha se autoriza" />
                    </label>
                    {problem && <p role="alert" className="brain-destructive-text text-destructive text-sm">{problem}</p>}
                </div>
                <DialogFooter>
                    <button type="button" className="min-h-11 rounded-lg px-4 text-sm" onClick={onClose} disabled={saving}>Cancelar</button>
                    <button type="button" onClick={save} disabled={saving} data-work-authorization-save className={PRIMARY}>{saving ? 'Guardando…' : 'Autorizar'}</button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/**
 * Suspender por cartera y levantarla (30 de octubre de 2026). Suspender pide **quién lo autorizó** porque la regla de
 * la empresa es que lo autoriza Francisco, y el motivo, que es lo que después explica una suspensión sin umbral.
 * Levantarla a mano solo pide el motivo: cuando el cliente se pone al día se levanta sola.
 */
export function SuspensionDialog({ clientName, suspension, candidate, onClose, onSave }) {
    const lifting = Boolean(suspension);
    const [form, setForm] = useState({ authorizedBy: '', reason: '' });
    const [problem, setProblem] = useState('');
    const [saving, setSaving] = useState(false);
    const set = (patch) => { setForm((current) => ({ ...current, ...patch })); setProblem(''); };
    const save = async () => {
        const invalid = lifting ? liftProblem(form) : suspensionProblem(form);
        if (invalid) { setProblem(invalid); return; }
        setSaving(true);
        try {
            await onSave(lifting ? { reason: form.reason } : form);
        } catch (error) {
            setProblem(error.message || (lifting ? 'No pudimos levantar la suspensión.' : 'No pudimos suspender al cliente.'));
        } finally {
            setSaving(false);
        }
    };
    return (
        <Dialog open onOpenChange={(next) => !next && !saving && onClose()}>
            <DialogContent data-suspension-dialog={lifting ? 'lift' : 'suspend'} className="sm:max-w-md dark:bg-zinc-900"
                onOpenAutoFocus={(event) => { event.preventDefault(); event.currentTarget.focus(); }}>
                <DialogHeader>
                    <DialogTitle>{lifting ? 'Levantar la suspensión' : 'Suspender por cartera'}</DialogTitle>
                    <DialogDescription>
                        {lifting
                            ? `${clientName} vuelve a trabajarse en cuanto guardes. Si se pone al día, se levanta sola.`
                            : `${clientName} termina el mes que va en curso y, desde el siguiente, no se trabaja parrilla ni producción.`}
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    {!lifting && candidate && (
                        <p data-suspension-candidate className="rounded-lg bg-brand-yellow/10 p-3 text-sm text-zinc-800 dark:text-zinc-100">
                            Lleva {candidate.days} días vencido y debe ${Math.round(candidate.balanceCents / 100).toLocaleString('es-CO')} en {candidate.count === 1 ? '1 cuenta' : `${candidate.count} cuentas`}.
                        </p>
                    )}
                    {!lifting && (
                        <label className="block space-y-1.5 text-sm"><span className="block">Quién lo autorizó</span>
                            <input className={FIELD} maxLength={SUSPENSION_AUTHORIZED_BY_MAX} value={form.authorizedBy} data-suspension-authorized-by
                                placeholder="Por ejemplo: Francisco Villa"
                                onChange={(event) => set({ authorizedBy: event.target.value })} />
                        </label>
                    )}
                    <label className="block space-y-1.5 text-sm"><span className="block">Motivo</span>
                        <textarea className={cn(FIELD, 'min-h-20')} maxLength={SUSPENSION_REASON_MAX} value={form.reason} data-suspension-reason
                            placeholder={lifting ? 'Por ejemplo: acuerdo de pago a tres cuotas' : 'Por ejemplo: no paga desde julio y no responde'}
                            onChange={(event) => set({ reason: event.target.value })} />
                    </label>
                    {problem && <p role="alert" className="brain-destructive-text text-destructive text-sm">{problem}</p>}
                </div>
                <DialogFooter>
                    <button type="button" className="min-h-11 rounded-lg px-4 text-sm" onClick={onClose} disabled={saving}>Cancelar</button>
                    <button type="button" onClick={save} disabled={saving} data-suspension-save
                        className={cn('min-h-11 rounded-lg px-4 text-sm font-semibold disabled:opacity-50',
                            lifting ? 'bg-primary text-primary-foreground' : 'bg-destructive text-destructive-foreground')}>
                        {saving ? 'Guardando…' : lifting ? 'Levantar' : 'Suspender'}
                    </button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export function CloseDialog({ month, monthlyReport, onClose, onConfirm }) {
    const [note, setNote] = useState('');
    const [problem, setProblem] = useState('');
    const [saving, setSaving] = useState(false);
    const preview = closeSnapshot(month, { monthlyReport });
    // Completo, la frase ya dice cuántas se publicaron; con pendientes, se dice antes.
    const complete = !preview.missing && (!preview.report || preview.report === 'ENVIADO');
    const confirm = async () => {
        setSaving(true);
        try {
            await onConfirm(note);
        } catch (error) {
            setProblem(error.message || 'No pudimos confirmar el cierre.');
        } finally {
            setSaving(false);
        }
    };
    return (
        <Dialog open onOpenChange={(next) => !next && !saving && onClose()}>
            <DialogContent data-close-dialog className="sm:max-w-md dark:bg-zinc-900">
                <DialogHeader>
                    <DialogTitle>Cerrar {month.label.toLowerCase()}</DialogTitle>
                    <DialogDescription>Confirmar el cierre no borra nada: lo pendiente sigue en este mes y queda escrito en el cierre.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <p className={cn('rounded-xl p-3 text-sm', complete ? 'bg-status-positive/10 text-status-positive-fg' : 'bg-zinc-50 text-zinc-800 dark:bg-white/5 dark:text-zinc-100')} data-close-preview>
                        {complete ? '' : `${preview.published} de ${preview.quota} publicadas. `}{closeSummaryText(preview)}
                    </p>
                    <label className="block space-y-1.5 text-sm"><span className="block">Nota <span className="text-zinc-400">(opcional)</span></span>
                        <input className={FIELD} maxLength={CLOSE_NOTE_MAX} value={note} data-close-note placeholder="Por ejemplo: el cliente pidió mover dos piezas a noviembre"
                            onChange={(event) => { setNote(event.target.value); setProblem(''); }} />
                    </label>
                    {problem && <p role="alert" className="brain-destructive-text text-destructive text-sm">{problem}</p>}
                </div>
                <DialogFooter>
                    <button type="button" className="min-h-11 rounded-lg px-4 text-sm" onClick={onClose} disabled={saving}>Cancelar</button>
                    <button type="button" onClick={confirm} disabled={saving} data-close-confirm className={PRIMARY}>{saving ? 'Confirmando…' : 'Confirmar cierre'}</button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
