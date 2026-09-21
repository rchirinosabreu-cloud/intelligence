import React, { useState } from 'react';
import Select from '@/components/ui/Select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { Clock, Loader2 } from '@/components/ui/icons';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { FOCUS_EXTENSION_OPTIONS, FOCUS_EXTENSION_REASON_MAX, bogotaTimeOf, isFocusOverdue } from '@/lib/taskFocus';

/**
 * "Pedir más tiempo" (Rodny, 21 September 2026): the person chooses how much time and writes why.
 * The request lands as a notification on the manager who set the hour, who adjusts it with the clock.
 */
export default function FocusExtensionDialog({ task, open, onOpenChange, onSent }) {
  const { toast } = useToast();
  const [minutes, setMinutes] = useState(String(FOCUS_EXTENSION_OPTIONS[1].minutes));
  const [reason, setReason] = useState('');
  const [sending, setSending] = useState(false);
  const time = bogotaTimeOf(task?.focusDeadlineAt);
  const overdue = isFocusOverdue(task);
  const cleanReason = reason.trim();

  const submit = async (event) => {
    event.preventDefault();
    if (!task?.id || !cleanReason || sending) return;
    setSending(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/tasks/${task.id}/focus-extension`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('authToken')}` },
        body: JSON.stringify({ minutes: Number(minutes), reason: cleanReason })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'No se pudo enviar la petición.');
      toast({ title: 'Petición enviada', description: `Pediste ${data.label || ''} más. Quien puso el compromiso decidirá y te avisamos.`.replace('  ', ' ') });
      setReason('');
      onOpenChange(false);
      onSent?.(data);
    } catch (error) {
      toast({ variant: 'destructive', title: 'No se envió', description: error.message });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!sending) onOpenChange(next); }}>
      <DialogContent className="sm:max-w-md border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <form onSubmit={submit} data-focus-extension-form>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-zinc-900 dark:text-white">
              <Clock className="h-5 w-5 text-brand-cyan-deep dark:text-brand-cyan" /> Pedir más tiempo
            </DialogTitle>
            <DialogDescription>
              {overdue
                ? `Tu compromiso «${task?.title}» venció${time ? ` a las ${time}` : ''}. Elige cuánto tiempo más necesitas y cuéntale por qué a quien lo puso.`
                : `Tu compromiso «${task?.title}»${time ? ` es hasta las ${time}` : ''}. Elige cuánto tiempo más necesitas y cuéntale por qué a quien lo puso.`}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="focus-extension-minutes" className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Cuánto tiempo más</label>
              <Select
                id="focus-extension-minutes"
                value={minutes}
                onChange={(event) => setMinutes(event.target.value)}
                className="w-full rounded-lg border border-zinc-200/70 bg-transparent px-3 py-2 text-sm font-medium text-zinc-900 outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 dark:border-zinc-800/70 dark:text-zinc-100"
              >
                {FOCUS_EXTENSION_OPTIONS.map((option) => (
                  <option key={option.minutes} value={String(option.minutes)}>{option.label}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="focus-extension-reason" className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Por qué</label>
              <textarea
                id="focus-extension-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value.slice(0, FOCUS_EXTENSION_REASON_MAX))}
                required
                rows={3}
                maxLength={FOCUS_EXTENSION_REASON_MAX}
                placeholder="Ej.: espero la aprobación del cliente para cerrar la pieza."
                className="w-full resize-none rounded-lg border border-zinc-200/70 bg-transparent px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-primary/50 focus:ring-2 focus:ring-primary/10 dark:border-zinc-800/70 dark:text-zinc-100 dark:placeholder:text-zinc-500"
              />
              <p className="text-right text-[11px] text-zinc-400">{cleanReason.length}/{FOCUS_EXTENSION_REASON_MAX}</p>
            </div>
          </div>
          <DialogFooter className="mt-4 gap-3 sm:justify-between">
            <button type="button" onClick={() => onOpenChange(false)} disabled={sending} className="rounded-xl px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800">
              Cancelar
            </button>
            <button type="submit" disabled={!cleanReason || sending} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">
              {sending && <Loader2 className="h-4 w-4 animate-spin" />}
              Enviar petición
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
