export const REOPEN_REASONS = [
  { value: 'CLIENT_CORRECTION', label: 'Corrección normal del cliente' },
  { value: 'INTERNAL_ERROR', label: 'Error interno' },
  { value: 'INTERNAL_ADJUSTMENT', label: 'Ajuste interno o dirección creativa' },
  { value: 'SCOPE_CHANGE', label: 'Cambio de alcance' },
  { value: 'LATE_CLIENT_INFO', label: 'Información incorrecta o tardía' },
  { value: 'NEW_VERSION', label: 'Nueva versión después de aprobación' },
  { value: 'OTHER', label: 'Otro motivo' },
];

const asNonNegativeNumber = (value) => {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? number : 0;
};

export function formatElapsedTime(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(asNonNegativeNumber(milliseconds) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map(value => String(value).padStart(2, '0')).join(':');
}

export function getTaskElapsedMs(task, now = new Date()) {
  const accumulated = asNonNegativeNumber(task?.accumulatedWorkMs);
  if (String(task?.status || '').toUpperCase() !== 'EN_CURSO' || !task?.startedAt) {
    return accumulated;
  }

  const startedAt = new Date(task.startedAt).getTime();
  const currentTime = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(startedAt) || !Number.isFinite(currentTime)) return accumulated;
  return accumulated + Math.max(0, currentTime - startedAt);
}

export function findConflictingActiveTask(tasks, targetTask) {
  if (!targetTask?.assigneeId) return null;
  return (tasks || []).find(task =>
    String(task.id) !== String(targetTask.id) &&
    task.assigneeId === targetTask.assigneeId &&
    String(task.status || '').toUpperCase() === 'EN_CURSO'
  ) || null;
}
