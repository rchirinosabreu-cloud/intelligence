import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, PlayCircle, Users } from '@/components/ui/icons';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';

/**
 * Al pasar a «En proceso» una tarea con colaboradores (Rodny, 5 de octubre de 2026). En estas tareas
 * ningún reloj arranca solo, tampoco el del responsable: el aviso lo recuerda y ofrece las dos cosas
 * que la persona puede querer hacer. «Empezar mi reloj» pone en marcha el de **quien la movió**.
 * La tarea no se abre sola: solo si la persona lo pide.
 */
export const TEAM_TASK_START_MESSAGE = 'En este tipo de tareas, el cronómetro no se activa de forma automática, recuerda poner en marcha tu reloj de forma manual.';

export default function TeamTaskStartNotice({ task, open, onClose, onOpenTask, onStarted }) {
  const [starting, setStarting] = useState(false);

  const start = async () => {
    setStarting(true);
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${getApiBaseUrl()}/api/tasks/${task.id}/work/start`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        console.error('[TeamTaskStartNotice] No se pudo empezar el reloj:', payload);
        toast.error(payload?.error || 'No se pudo empezar tu reloj.');
        return;
      }
      toast.success('Tu tiempo en esta tarea empezó a correr.');
      onStarted?.();
      onClose();
    } catch (error) {
      console.error('[TeamTaskStartNotice] No se pudo empezar el reloj:', error);
      toast.error('No se pudo empezar tu reloj.');
    } finally {
      setStarting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent
        className="max-w-md outline-none"
        onOpenAutoFocus={(event) => { event.preventDefault(); event.currentTarget.focus(); }}
      >
        <DialogHeader>
          <span className="mb-1 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-cyan/10 text-brand-cyan-deep dark:text-brand-cyan">
            <Users className="h-5 w-5" aria-hidden="true" />
          </span>
          <DialogTitle className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{task?.title || 'Tarea en proceso'}</DialogTitle>
          <DialogDescription className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            {TEAM_TASK_START_MESSAGE}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <button
            type="button"
            onClick={() => { onClose(); onOpenTask?.(task); }}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-zinc-200 px-4 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-white/5"
          >
            Abrir tarea
          </button>
          <button
            type="button"
            onClick={start}
            disabled={starting}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-cyan px-4 text-sm font-semibold text-white hover:bg-brand-cyan-deep disabled:opacity-60"
          >
            {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
            Empezar mi reloj
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
