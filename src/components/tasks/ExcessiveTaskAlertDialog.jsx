import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Clock } from '@/components/ui/icons';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';

const formatElapsed = (elapsedMs) => {
  const totalMinutes = Math.max(0, Math.floor(Number(elapsedMs || 0) / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours} h ${String(minutes).padStart(2, '0')} min`;
};

export default function ExcessiveTaskAlertDialog({ userId, userName, enabled = true }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [confirmationError, setConfirmationError] = useState('');
  const firstName = String(userName || '').trim().split(/\s+/)[0];
  const { data } = useQuery({
    queryKey: ['excessive-task-alerts', userId],
    queryFn: async () => {
      const response = await fetch(`${getApiBaseUrl()}/api/tasks/work-alerts`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Task work alerts failed with ${response.status}`);
      return response.json();
    },
    enabled: Boolean(userId && enabled),
    staleTime: 60_000,
    refetchInterval: userId && enabled ? () => (document.hidden ? false : 60_000) : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  const tasks = Array.isArray(data?.tasks) ? data.tasks : [];
  const dismissalKey = useMemo(() => {
    if (!userId || tasks.length === 0) return null;
    const signature = tasks.map((task) => task.id).sort().join(',');
    return `brainstudio:excessive-task-alert:v6:${userId}:${signature}`;
  }, [tasks, userId]);

  useEffect(() => {
    if (!dismissalKey) {
      setIsOpen(false);
      return;
    }
    setIsOpen(sessionStorage.getItem(dismissalKey) !== 'dismissed');
  }, [dismissalKey]);

  const dismiss = () => {
    if (dismissalKey) sessionStorage.setItem(dismissalKey, 'dismissed');
    setIsOpen(false);
  };

  const openTask = (taskId) => {
    dismiss();
    navigate(`/gestion?taskId=${taskId}`);
  };

  const confirmationMutation = useMutation({
    mutationFn: async (taskId) => {
      const response = await fetch(`${getApiBaseUrl()}/api/tasks/${taskId}/work-confirmation`, { method: 'POST' });
      if (!response.ok) throw new Error(`Task work confirmation failed with ${response.status}`);
      return response.json();
    },
    onSuccess: (_result, taskId) => {
      setConfirmationError('');
      queryClient.setQueryData(['excessive-task-alerts', userId], (current) => ({
        ...(current || {}),
        tasks: Array.isArray(current?.tasks) ? current.tasks.filter((task) => task.id !== taskId) : [],
      }));
      queryClient.invalidateQueries({ queryKey: ['excessive-task-alerts', userId] });
    },
    onError: (error) => {
      console.error('[ExcessiveTaskAlert] Work confirmation failed:', error);
      setConfirmationError('No pudimos guardar tu confirmación. Inténtalo nuevamente.');
    },
  });

  if (tasks.length === 0) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && dismiss()}>
      <DialogContent
        overlayClassName="z-[190]"
        className="z-[200] max-h-[calc(100vh-1.5rem)] w-[calc(100%-1.5rem)] overflow-y-auto border-zinc-200 bg-white p-0 dark:border-zinc-800 dark:bg-zinc-950 sm:max-w-xl"
      >
        <div className="relative overflow-hidden bg-gradient-to-br from-[#00AC8A] to-[#009EB9] px-6 py-7 pr-28 text-white">
          <img src="/brainstudio-mascot-tip.png" alt="Mascota de Brainstudio" className="absolute -bottom-4 right-2 h-24 w-24 object-contain drop-shadow-xl" />
          <DialogHeader className="relative z-10">
            <span className="mb-1.5 w-fit rounded-full border border-white/25 bg-white/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-white">Atención</span>
            <DialogTitle className="text-base leading-snug text-white sm:whitespace-nowrap sm:text-lg">
              Hola{firstName ? ` ${firstName}` : ''}, {tasks.length === 1 ? 'esta tarea necesita' : `${tasks.length} tareas necesitan`} tu atención
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-cyan-50/90">
              Revisemos si {tasks.length === 1 ? 'esta tarea todavía sigue activa' : 'estas tareas todavía siguen activas'} o si necesitas algún apoyo para poder avanzar.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-3 px-6 py-5">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="rounded-xl border border-zinc-200 p-3.5 dark:border-zinc-800"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
                  <Clock className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-zinc-900 dark:text-white">{task.title}</span>
                  <span className="mt-0.5 block truncate text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">{task.clientName}</span>
                </span>
                <span className="shrink-0 text-sm font-bold tabular-nums text-amber-600 dark:text-amber-400">{formatElapsed(task.elapsedMs)}</span>
              </div>
              <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
                <Button type="button" variant="outline" onClick={() => openTask(task.id)} className="h-8 gap-1.5 rounded-lg border-zinc-200 px-3 text-xs dark:border-zinc-700">
                  Revisar tarea <ArrowRight className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  onClick={() => confirmationMutation.mutate(task.id)}
                  disabled={confirmationMutation.isPending}
                  className="h-8 rounded-lg bg-[#009EB9] px-3 text-xs text-white hover:bg-[#008CA4]"
                >
                  {confirmationMutation.isPending && confirmationMutation.variables === task.id ? 'Confirmando...' : 'Sigo trabajando'}
                </Button>
              </div>
            </div>
          ))}
          {confirmationError && <p role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">{confirmationError}</p>}
          <div className="flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p><strong>Referencia operativa:</strong> {tasks.length === 1 ? 'esta tarea superó' : 'estas tareas superaron'} las 15 horas registradas. Esto no es una evaluación de tu desempeño; es una señal para revisar el flujo de trabajo.</p>
          </div>
        </div>

      </DialogContent>
    </Dialog>
  );
}
