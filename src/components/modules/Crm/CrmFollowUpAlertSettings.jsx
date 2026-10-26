import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { normalizeFollowUpAlertDays } from '@/lib/crmFollowUpAlerts';
import { useSaveFollowUpAlertDays } from './crmApi';
import { inputClass } from './crmPresentation';

// Los días de las alertas comerciales (punto 2 de la solicitud de Elisa: «los tiempos serán configurables»). Solo los
// cambia un administrador; el servidor lo vuelve a comprobar. Se escriben como texto («5, 10, 15, 20») y la misma regla
// de la pantalla y el servidor dice el motivo si algo no sirve.
const parseDays = (text) => String(text || '').split(/[\s,;]+/).filter(Boolean);

export default function CrmFollowUpAlertSettings({ open, onOpenChange, current }) {
    const [reminders, setReminders] = useState(() => (current?.reminders || [5, 10, 15, 20]).join(', '));
    const [review, setReview] = useState(() => String(current?.review ?? 30));
    const [problem, setProblem] = useState('');
    const save = useSaveFollowUpAlertDays({
        onSuccess: () => {
            toast.success('Días de las alertas guardados');
            onOpenChange(false);
        },
        onError: (error) => {
            console.error('[CRM] Días de las alertas no guardados:', error);
            setProblem(error.message);
        }
    });

    const submit = (event) => {
        event.preventDefault();
        const check = normalizeFollowUpAlertDays({ reminders: parseDays(reminders), review });
        if (check.problem) { setProblem(check.problem); return; }
        setProblem('');
        save.mutate(check.value);
    };

    return (
        <Dialog open={open} onOpenChange={(next) => { if (!save.isPending) onOpenChange(next); }}>
            <DialogContent className="sm:max-w-md dark:bg-zinc-900" data-crm-alert-settings>
                <DialogHeader>
                    <DialogTitle>Alertas comerciales</DialogTitle>
                    <DialogDescription>
                        Cuántos días sin respuesta del cliente esperar antes de recordarle al responsable, y cuándo revisar si la oportunidad sigue. Cualquier gestión registrada reinicia la cuenta.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={submit} className="space-y-4">
                    <label className="block space-y-1.5 text-sm">
                        <span className="block font-medium text-zinc-800 dark:text-zinc-100">Recordatorios al responsable, en días</span>
                        <input value={reminders} inputMode="numeric" onChange={(event) => { setReminders(event.target.value); setProblem(''); }} className={inputClass} aria-describedby="crm-alert-days-help" />
                        <span id="crm-alert-days-help" className="block text-xs text-zinc-500">Separados por comas. Hasta seis.</span>
                    </label>
                    <label className="block space-y-1.5 text-sm">
                        <span className="block font-medium text-zinc-800 dark:text-zinc-100">Revisión, en días</span>
                        <input value={review} inputMode="numeric" onChange={(event) => { setReview(event.target.value); setProblem(''); }} className={inputClass} />
                        <span className="block text-xs text-zinc-500">Le llega también a los administradores.</span>
                    </label>
                    {problem && <p role="alert" className="text-sm text-destructive brain-destructive-text">{problem}</p>}
                    <DialogFooter>
                        <button type="button" onClick={() => onOpenChange(false)} className="min-h-11 rounded-lg px-4 text-sm">Cancelar</button>
                        <button type="submit" disabled={save.isPending} className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                            {save.isPending ? 'Guardando…' : 'Guardar'}
                        </button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
