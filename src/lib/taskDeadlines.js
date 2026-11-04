import { bogotaDate } from './colombiaBusinessDays.js';

export const TASK_DEADLINE_POLICY = 'task-calendar-v1';

// dueDate stores the calendar chosen in the task form, not a deadline hour.
// Historical rows use midnight, noon and other UTC hours for the same day.
export const taskDueDay = value => {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const day = date.toISOString().slice(0, 10);
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && day !== value ? null : day;
};

export const isTaskOverdue = (task, now = new Date()) => {
  if (!['PENDIENTE', 'EN_CURSO'].includes(task.status)) return false;
  const day = taskDueDay(task.dueDate);
  const commitment = task.focusDeadlineAt ? new Date(task.focusDeadlineAt) : null;
  return Boolean((day && day < bogotaDate(now)) || (commitment && commitment < new Date(now)));
};

// Old snapshots contain only aggregates calculated with a different date rule.
// Never reconstruct dawn from the current, mutable task state.
export const snapshotOverdueCount = (metrics, day) => {
  const proof = metrics?.deadlineEvidence;
  if (proof?.policy !== TASK_DEADLINE_POLICY || proof.complete !== true || !Array.isArray(proof.tasks)) return null;
  const capturedAt = new Date(proof.capturedAt);
  if (!Number.isFinite(capturedAt.getTime()) || bogotaDate(capturedAt) !== day) return null;
  if (proof.tasks.some(t => !t.id || typeof t.overdue !== 'boolean') || new Set(proof.tasks.map(t => t.id)).size !== proof.tasks.length) return null;
  const count = proof.tasks.filter(t => t.overdue).length;
  return metrics.overdue === count ? count : null;
};
