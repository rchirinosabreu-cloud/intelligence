import React, { useState } from 'react';
import Select from '@/components/ui/Select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { Clock, Loader2 } from '@/components/ui/icons';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { FOCUS_EXTENSION_OPTIONS, FOCUS_EXTENSION_REASON_MAX, bogotaTimeOf, isFocusOverdue } from '@/lib/taskFocus';

/**
 * "Pedir más tiempo" (Rodny, 21 September 2026): the person chooses how much time and explains why, and the
 * time is added to the commitment on the spot. Nobody approves it; whoever set the hour is just told.
 * It lands as a novedad on the task.
 *
 * With `required` (the commitment expired) the dialog is inescapable: no X, no Escape, no click outside, no
 * cancel. The person cannot do anything else on the board until they explain and send.
 *
 * It sits above the task panel (z-[100]/[111]) and its emoji popover (z-[125]), so it also works from inside it.
 */
export default function FocusExtensionDialog({ task, open, onOpenChange, onSent, required = false }) {
  const { toast } = useToast();
  const [minutes, setMinutes] = useState(String(FOCUS_EXTENSION_OPTIONS[1].minutes));
  const [reason, setReason] = useState('');
  const [sending, setSending] = useState(false);
  const time = bogotaTimeOf(task?.focusDeadlineAt);
  const overdue = isFocusOverdue(task);
  const cleanReason = reason.trim();
  // Rodny, 21 September 2026: name the person who will read the reason (the task creator).
  const creatorName = task?.creatorName || task?.creator?.name || '';
  const recipient = creatorName && creatorName !== 'Sistema' ? creatorName : 'quien puso el compromiso';

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
      toast({
        title: `Se añadieron ${data.label || 'más minutos'}`,
        description: `Tu compromiso ahora es hasta las ${data.newTime}. Avisamos a ${recipient}.`
      });
      setReason('');
      onOpenChange(false);
      onSent?.(data);
    } catch (error) {
      toast({ variant: 'destructive', title: 'No se envió', description: error.message });
    } finally {
      setSending(false);
    }
  };

  const blockDismiss = (event) => { if (required) event.preventDefault(); };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!sending && !(required && !next)) onOpenChange(next); }}>
      <DialogContent
        data-focus-extension-required={required ? 'true' : undefined}
        showCloseButton={!required}
        overlayClassName="z-[130]"
        className="z-[131] sm:max-w-md border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
        onEscapeKeyDown={blockDismiss}
        onPointerDownOutside={blockDismiss}
        onInteractOutside={blockDismiss}
      >
        <form onSubmit={submit} data-focus-extension-form>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-zinc-900 dark:text-white">
              <Clock className={`h-5 w-5 ${overdue ? 'text-destructive' : 'text-brand-cyan-deep dark:text-brand-cyan'}`} />
              {required ? 'Tu compromiso venció' : 'Pedir más tiempo'}
            </DialogTitle>
            <DialogDescription>
              {overdue
                ? `Tu compromiso «${task?.title}» venció${time ? ` a las ${time}` : ''}. Elige cuánto tiempo más necesitas y explica el motivo.`
                : `Tu compromiso «${task?.title}»${time ? ` es hasta las ${time}` : ''}. Elige cuánto tiempo más necesitas y explica el motivo.`}
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
            {/* Vencido: no hay salida. La persona no puede hacer otra cosa sin explicar (Rodny, 21 de septiembre de 2026). */}
            {!required && (
              <button type="button" onClick={() => onOpenChange(false)} disabled={sending} className="rounded-xl px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800">
                Cancelar
              </button>
            )}
            <button type="submit" disabled={!cleanReason || sending} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 sm:ml-auto">
              {sending && <Loader2 className="h-4 w-4 animate-spin" />}
              {/* Nada que aprobar: el tiempo se aplica al confirmar (Rodny, 21 de septiembre de 2026). */}
              Confirmar
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
