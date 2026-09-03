import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Clock, TaskReturnIcon } from '@/components/ui/icons';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';

const formatElapsed = (elapsedMs) => {
  const totalMinutes = Math.max(0, Math.floor(Number(elapsedMs || 0) / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours} h ${String(minutes).padStart(2, '0')} min`;
};

const readErrorPayload = async (response) => {
  const payload = await response.json().catch(() => null);
  const error = new Error(payload?.error || `Returned task reminder failed with ${response.status}`);
  error.response = { data: payload };
  return error;
};

export default function ReturnedTaskAlertDialog({
  userId,
  userName,
  enabled = true,
  previewTasks = null,
  onBlockingChange = () => {},
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [dismissedSignature, setDismissedSignature] = useState(null);
  const [previewHiddenTaskIds, setPreviewHiddenTaskIds] = useState([]);
  const [snoozeError, setSnoozeError] = useState('');
  const firstName = String(userName || '').trim().split(/\s+/)[0];
  const isPreview = Array.isArray(previewTasks);
  const { data, error: queryError, isLoading } = useQuery({
    queryKey: ['returned-task-alerts', userId],
    queryFn: async () => {
      const response = await fetch(`${getApiBaseUrl()}/api/tasks/returned-alerts`, { cache: 'no-store' });
      if (!response.ok) throw await readErrorPayload(response);
      return response.json();
    },
    enabled: Boolean(userId && enabled && !isPreview),
    staleTime: 60_000,
    refetchInterval: userId && enabled && !isPreview ? () => (document.hidden ? false : 60_000) : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  const serverTasks = enabled && Array.isArray(data?.tasks) ? data.tasks : [];
  const tasks = !enabled
    ? []
    : isPreview
      ? previewTasks.filter((task) => !previewHiddenTaskIds.includes(task.id))
      : serverTasks;
  const taskSignature = useMemo(
    () => tasks.map((task) => `${task.id}:${task.returnedAt || ''}`).sort().join(','),
    [tasks]
  );
  const hasPendingDialog = Boolean(taskSignature && taskSignature !== dismissedSignature);

  useEffect(() => {
    if (!enabled || !taskSignature) {
      setIsOpen(false);
      return;
    }
    if (taskSignature !== dismissedSignature) setIsOpen(true);
  }, [dismissedSignature, enabled, taskSignature]);

  useEffect(() => {
    onBlockingChange(Boolean(enabled && (isLoading || isOpen || hasPendingDialog)));
    return () => onBlockingChange(false);
  }, [enabled, hasPendingDialog, isLoading, isOpen, onBlockingChange]);

  useEffect(() => {
    if (queryError) console.error('[ReturnedTaskAlert] Alert query failed:', queryError?.response?.data || queryError);
  }, [queryError]);

  const closeLocally = () => {
    setDismissedSignature(taskSignature);
    setIsOpen(false);
  };

  const openTask = (taskId) => {
    closeLocally();
    navigate(`/gestion?taskId=${taskId}${isPreview ? '&previewReturnedAlert=0' : ''}`);
  };

  const snoozeMutation = useMutation({
    mutationFn: async (taskId) => {
      if (isPreview) return { snoozed: true, taskId };
      const response = await fetch(`${getApiBaseUrl()}/api/tasks/${taskId}/returned-reminder/snooze`, { method: 'POST' });
      if (!response.ok) throw await readErrorPayload(response);
      return response.json();
    },
    onSuccess: (_result, taskId) => {
      setSnoozeError('');
      if (isPreview) {
        setPreviewHiddenTaskIds((current) => [...current, taskId]);
        return;
      }
      queryClient.setQueryData(['returned-task-alerts', userId], (current) => ({
        ...(current || {}),
        tasks: Array.isArray(current?.tasks) ? current.tasks.filter((task) => task.id !== taskId) : [],
      }));
      queryClient.invalidateQueries({ queryKey: ['returned-task-alerts', userId] });
    },
    onError: (error) => {
      console.error('[ReturnedTaskAlert] Reminder snooze failed:', error?.response?.data || error);
      setSnoozeError('No pudimos posponer el recordatorio. Inténtalo nuevamente.');
    },
  });

  if (tasks.length === 0) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && closeLocally()}>
      <DialogContent
        overlayClassName="z-[210]"
        className="z-[220] max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] overflow-y-auto border-zinc-200 bg-white p-0 dark:border-zinc-800 dark:bg-zinc-950 sm:max-w-xl"
      >
        <div className="relative overflow-hidden bg-gradient-to-br from-[#00AC8A] to-[#009EB9] px-6 py-7 pr-28 text-white">
          <img src="/brainstudio-mascot-tip.png" alt="Bria" className="absolute -bottom-4 right-2 h-24 w-24 object-contain drop-shadow-xl" />
          <DialogHeader className="relative z-10">
            <span className="mb-1.5 w-fit rounded-full border border-white/25 bg-white/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-white">Tarea devuelta</span>
            <DialogTitle className="text-base leading-snug text-white sm:text-lg">
              Hola{firstName ? ` ${firstName}` : ''}, recuerda que tienes una tarea devuelta
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-cyan-50/90">
              {tasks.length === 1
                ? 'Hay una tarea que está esperando tu revisión.'
                : 'Hay varias tareas que están esperando tu revisión.'}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-3 px-6 py-5">
          {tasks.map((task) => (
            <div key={task.id} className="rounded-xl border border-destructive/40 bg-white p-3.5 dark:bg-zinc-950">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-destructive/20 text-destructive">
                  <TaskReturnIcon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-zinc-900 dark:text-white">{task.title}</span>
                  <span className="mt-0.5 block truncate text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">{task.clientName}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1 text-xs font-bold tabular-nums text-destructive">
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                  {formatElapsed(task.elapsedMs)}
                </span>
              </div>
              <div className="mt-3 flex flex-col-reverse gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => snoozeMutation.mutate(task.id)}
                  disabled={snoozeMutation.isPending}
                  className="min-h-11 rounded-lg border-zinc-200 px-3 text-xs dark:border-zinc-700 sm:min-h-8"
                >
                  {snoozeMutation.isPending && snoozeMutation.variables === task.id ? 'Guardando...' : 'Recordarme más tarde'}
                </Button>
                <Button
                  type="button"
                  onClick={() => openTask(task.id)}
                  className="min-h-11 gap-1.5 rounded-lg bg-[#009EB9] px-3 text-xs text-white hover:bg-[#008CA4] sm:min-h-8"
                >
                  Revisar tarea <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </div>
            </div>
          ))}
          {snoozeError && <p role="alert" className="text-xs font-medium text-destructive">{snoozeError}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
