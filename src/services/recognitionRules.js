const dayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' });
export function recognitionCalendar(at) {
  const day = dayFormatter.format(new Date(at));
  const monday = new Date(`${day}T12:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  return { day, week: monday.toISOString().slice(0, 10) };
}
// Task deadlines are calendar dates persisted at UTC midnight (the existing task contract).
export function recognitionDueDay(value) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}
export function isRecognitionOverdue(task, at) {
  const due = recognitionDueDay(task?.dueDate);
  return Boolean(due && task.status !== 'REALIZADA' && due < recognitionCalendar(at).day);
}
export function taskAwardKinds({ teamDayCount, userDayCount, userWeekCount, early, caughtUp }) {
  return [teamDayCount === 1 && 'FIRST_TASK', early && 'EARLY_DELIVERY', userDayCount === 8 && 'DAILY_EIGHT', caughtUp && 'CAUGHT_UP', userWeekCount === 50 && 'WEEKLY_FIFTY'].filter(Boolean);
}
export function planIsApproved(items, approvedIds = []) {
  const active = items.filter(item => !item.deletedAt);
  return active.length > 0 && active.every(item => item.status === 'APROBADO'
    || (approvedIds.includes(item.id) && ['EN_PRODUCCION', 'REALIZADO', 'PUBLICADO'].includes(item.status)));
}
