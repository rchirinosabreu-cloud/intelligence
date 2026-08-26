export const REOPEN_REASONS = [
  { value: 'CLIENT_CORRECTION', label: 'Corrección normal del cliente' },
  { value: 'INTERNAL_ERROR', label: 'Error interno' },
  { value: 'INTERNAL_ADJUSTMENT', label: 'Ajuste interno o dirección creativa' },
  { value: 'SCOPE_CHANGE', label: 'Cambio de alcance' },
  { value: 'LATE_CLIENT_INFO', label: 'Información incorrecta o tardía' },
  { value: 'NEW_VERSION', label: 'Nueva versión después de aprobación' },
  { value: 'OTHER', label: 'Otro motivo' },
];

export function parseReopenEventContent(content = '') {
  const text = String(content || '').trim();
  const bracketMatch = text.match(/^\[([^\]]+)\]\s*\n?([\s\S]*)$/);
  const legacyMatch = text.match(/^([A-Z_]+):\s*([\s\S]*)$/);
  const reasonValue = bracketMatch?.[1] || legacyMatch?.[1] || 'OTHER';
  const note = (bracketMatch?.[2] || legacyMatch?.[2] || text).trim();
  const reason = REOPEN_REASONS.find(item => item.value === reasonValue);
  return { reasonValue, reasonLabel: reason?.label || 'Otro motivo', note };
}

export const TASK_TIMING_TUTORIAL_VERSION = 'v2';

export function getTaskTimingTutorialStorageKey(userId = 'guest') {
  return `brainstudio:task-timing-tutorial:${TASK_TIMING_TUTORIAL_VERSION}:${userId}`;
}

export function hasSeenTaskTimingTutorial(storage, userId) {
  const value = storage?.getItem?.(getTaskTimingTutorialStorageKey(userId));
  if (!value) return false;
  if (value === 'seen') return true;
  try {
    return Boolean(JSON.parse(value)?.seenAt);
  } catch {
    return false;
  }
}

export function markTaskTimingTutorialSeen(storage, userId, now = new Date()) {
  storage?.setItem?.(getTaskTimingTutorialStorageKey(userId), JSON.stringify({
    seenAt: now.toISOString(),
    afternoonSeenAt: null,
  }));
}

export function shouldShowTaskTimingTutorialAgain(storage, userId, now = new Date()) {
  const value = storage?.getItem?.(getTaskTimingTutorialStorageKey(userId));
  if (!value || value === 'seen') return false;
  try {
    const state = JSON.parse(value);
    if (!state?.seenAt || state.afternoonSeenAt) return false;
    const firstSeen = new Date(state.seenAt);
    const sameDay = firstSeen.getFullYear() === now.getFullYear()
      && firstSeen.getMonth() === now.getMonth()
      && firstSeen.getDate() === now.getDate();
    return sameDay && firstSeen.getHours() < 14 && now.getHours() >= 14;
  } catch {
    return false;
  }
}

export function markTaskTimingTutorialAfternoonSeen(storage, userId, now = new Date()) {
  const key = getTaskTimingTutorialStorageKey(userId);
  try {
    const state = JSON.parse(storage?.getItem?.(key) || '{}');
    storage?.setItem?.(key, JSON.stringify({ ...state, afternoonSeenAt: now.toISOString() }));
  } catch {
    markTaskTimingTutorialSeen(storage, userId, now);
  }
}

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
