export const REOPEN_REASONS = [
  { value: 'CLIENT_CORRECTION', label: 'Corrección normal del cliente' },
  { value: 'INTERNAL_ERROR', label: 'Error interno' },
  { value: 'INTERNAL_ADJUSTMENT', label: 'Ajuste interno o dirección creativa' },
  { value: 'SCOPE_CHANGE', label: 'Cambio de alcance' },
  { value: 'LATE_CLIENT_INFO', label: 'Información incorrecta o tardía' },
  { value: 'NEW_VERSION', label: 'Nueva versión después de aprobación' },
  { value: 'OTHER', label: 'Otro motivo' },
];

export const RETURN_REASONS = [
  { value: 'INCOMPLETE_DELIVERABLE', label: 'Entregable incompleto' },
  { value: 'BRIEF_MISMATCH', label: 'No cumple con el brief o alcance' },
  { value: 'MISSING_INPUTS', label: 'Faltan insumos o referencias' },
  { value: 'VISUAL_IDENTITY_ADJUSTMENT', label: 'Ajustes de diseño o identidad visual' },
  { value: 'COPY_OR_LANGUAGE_CORRECTION', label: 'Corrección de copy, gramática u ortografía' },
  { value: 'TECHNICAL_QUALITY_ISSUE', label: 'Error técnico o de calidad' },
  { value: 'OTHER', label: 'Otro motivo' },
];

const findReturnReason = (value) => RETURN_REASONS.find(reason => reason.value === value);

export function buildTaskReturnPayload(reason, note) {
  const returnReason = String(reason || '').trim();
  const returnNote = String(note || '').trim();
  if (!findReturnReason(returnReason) || !returnNote) return null;
  return {
    status: 'DEVUELTA',
    isReturned: true,
    returnReason,
    returnNote,
  };
}

export function formatTaskReturnEventContent(reason, note) {
  const returnReason = String(reason || '').trim();
  const returnNote = String(note || '').trim();
  if (findReturnReason(returnReason) && returnNote) {
    return `[${returnReason}]\n${returnNote}`;
  }
  if (returnReason && !returnNote) {
    return `[OTHER]\n${returnReason}`;
  }
  return null;
}

export function parseTaskReturnEventContent(content = '') {
  const text = String(content || '').trim();
  const structuredMatch = text.match(/^\[([^\]]+)\]\s*\n?([\s\S]*)$/);
  if (!structuredMatch) {
    return { reasonValue: null, reasonLabel: 'Motivo de devolución', note: text };
  }
  const reasonValue = structuredMatch[1];
  const note = structuredMatch[2].trim();
  return {
    reasonValue,
    reasonLabel: findReturnReason(reasonValue)?.label || 'Otro motivo',
    note,
  };
}

export function canReturnCompletedTaskToBoard(user) {
  return String(user?.role || '').toUpperCase() === 'ADMIN';
}

export function buildCompletedTaskReopenPayload(reason, note) {
  const reopenReason = String(reason || '').trim();
  const reopenNote = String(note || '').trim();
  if (!reopenReason || !reopenNote) return null;
  return {
    status: 'PENDIENTE',
    reopenReason,
    reopenNote,
  };
}

export function parseReopenEventContent(content = '') {
  const text = String(content || '').trim();
  const bracketMatch = text.match(/^\[([^\]]+)\]\s*\n?([\s\S]*)$/);
  const legacyMatch = text.match(/^([A-Z_]+):\s*([\s\S]*)$/);
  const reasonValue = bracketMatch?.[1] || legacyMatch?.[1] || 'OTHER';
  const note = (bracketMatch?.[2] || legacyMatch?.[2] || text).trim();
  const reason = REOPEN_REASONS.find(item => item.value === reasonValue);
  return { reasonValue, reasonLabel: reason?.label || 'Otro motivo', note };
}

export function getTaskLifecycleAction(status) {
  const normalizedStatus = String(status || '').trim().toUpperCase();
  if (normalizedStatus === 'REALIZADA' || normalizedStatus === 'REALIZADO') return 'reintegrate';
  if (
    normalizedStatus === 'PENDIENTE'
    || normalizedStatus === 'EN_CURSO'
    || normalizedStatus === 'EN PROCESO'
  ) return 'return';
  return null;
}

export function getTaskSystemEventPresentation(type, content = '') {
  const note = String(content || '').trim();
  if (type === 'system_reopen') {
    const reopenEvent = parseReopenEventContent(note);
    return { badgeLabel: reopenEvent.reasonLabel, note: reopenEvent.note };
  }
  if (type === 'system_return') {
    const returnEvent = parseTaskReturnEventContent(note);
    return { badgeLabel: returnEvent.reasonLabel, note: returnEvent.note };
  }
  if (type === 'system_reintegrate') {
    return { badgeLabel: 'Nota de reintegración', note };
  }
  return { badgeLabel: 'Actualización', note };
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

export function closeTaskWorkSession(task, endedAt = new Date()) {
  const accumulated = asNonNegativeNumber(task?.accumulatedWorkMs);
  if (!task?.startedAt) return accumulated;
  const startedAt = new Date(task.startedAt).getTime();
  const endedAtMs = endedAt instanceof Date ? endedAt.getTime() : new Date(endedAt).getTime();
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAtMs)) return accumulated;
  return accumulated + Math.max(0, endedAtMs - startedAt);
}

export function findConflictingActiveTask(tasks, targetTask) {
  if (!targetTask?.assigneeId) return null;
  return (tasks || []).find(task =>
    String(task.id) !== String(targetTask.id) &&
    task.assigneeId === targetTask.assigneeId &&
    String(task.status || '').toUpperCase() === 'EN_CURSO'
  ) || null;
}
