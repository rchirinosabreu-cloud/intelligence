// Compromiso con hora (Rodny, 21 de septiembre de 2026).
// Un deadline con hora (`Task.focusDeadlineAt`) significa que esa tarea es lo único en lo que la persona
// va a trabajar: sus demás pendientes quedan bloqueados hasta que la marque como realizada. Solo
// administradores y project managers pueden fijar o quitar la hora, y nunca quedan bloqueados.
// Lógica pura, compartida por el servidor y la interfaz.

const BOGOTA = 'America/Bogota';

export const FOCUS_ACTIVE_STATUSES = Object.freeze(['PENDIENTE', 'EN_CURSO', 'DEVUELTA']);
export const MANAGER_ROLES = Object.freeze(['ADMIN', 'PROJECT_MANAGER', 'PM']);

export const isManagerUser = (user) => MANAGER_ROLES.includes(String(user?.role || '').toUpperCase());

const statusOf = (task) => String(task?.status || '').toUpperCase();

/** Una tarea con hora comprometida sigue "activa" mientras no esté realizada. */
export const isActiveFocusTask = (task) => Boolean(task?.focusDeadlineAt) && FOCUS_ACTIVE_STATUSES.includes(statusOf(task));

/** La tarea con hora de la persona (por id de miembro o por id de usuario), la más próxima si hay varias. */
export const findFocusTaskFor = (tasks, { assigneeId, assigneeUserId } = {}) => {
  if (!assigneeId && !assigneeUserId) return null;
  return (tasks || [])
    .filter((task) => isActiveFocusTask(task) && (
      (assigneeId && task.assigneeId === assigneeId)
      || (assigneeUserId && (task.assigneeUserId === assigneeUserId || task.assignee?.userId === assigneeUserId))
    ))
    .sort((a, b) => new Date(a.focusDeadlineAt) - new Date(b.focusDeadlineAt))[0] || null;
};

/**
 * Bloqueo que aplica a `task` para quien mira el tablero: solo cuando la persona (no manager) tiene otra
 * tarea con hora activa y `task` también es suya. Devuelve `{ focusTask }` o `null`.
 */
export const getTaskLock = ({ tasks, task, viewerUserId, viewerIsManager = false }) => {
  if (viewerIsManager || !viewerUserId || !task) return null;
  const taskAssigneeUserId = task.assigneeUserId || task.assignee?.userId || null;
  if (taskAssigneeUserId !== viewerUserId) return null;
  const focusTask = findFocusTaskFor(tasks, { assigneeUserId: viewerUserId });
  if (!focusTask || String(focusTask.id) === String(task.id)) return null;
  // Rodny, 21 September 2026: what was already in progress when the commitment arrived can still be finished
  // (moved on, or back to pending); after that, only the commitment moves.
  if (statusOf(task) === 'EN_CURSO') return null;
  return { focusTask, inProgressTask: findInProgressTaskFor(tasks, { assigneeUserId: viewerUserId, exceptId: focusTask.id }) };
};

/** La tarea que la persona ya tenía en proceso (distinta del compromiso), si la hay. */
export const findInProgressTaskFor = (tasks, { assigneeUserId, exceptId } = {}) => {
  if (!assigneeUserId) return null;
  return (tasks || []).find((task) => statusOf(task) === 'EN_CURSO'
    && String(task.id) !== String(exceptId)
    && (task.assigneeUserId === assigneeUserId || task.assignee?.userId === assigneeUserId)) || null;
};

export const bogotaTimeOf = (value) => {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat('es-CO', { timeZone: BOGOTA, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
  } catch {
    return '';
  }
};

export const bogotaDateKeyOf = (value) => {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: BOGOTA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
  } catch {
    return '';
  }
};

/** 'YYYY-MM-DD' + 'HH:mm' en hora de Bogotá → instante ISO. Sin hora no hay compromiso. */
export const focusDeadlineIso = (dateKey, time) => {
  if (!dateKey || !time || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const date = new Date(`${dateKey}T${time}:00-05:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

export const focusTimeFromIso = (value) => bogotaTimeOf(value);

// Rodny, 21 September 2026: touching a locked card shakes it; trying again shortly after explains it in a popup.
export const LOCK_RETRY_WINDOW_MS = 8000;

/**
 * Decides how the board reacts to an attempt on a locked card.
 * `previous` is the record returned by the last call for that card (or null). Returns the reaction and the record to keep.
 */
export const nextLockReaction = (previous, now = Date.now()) => {
  const retry = Boolean(previous) && now - previous.at < LOCK_RETRY_WINDOW_MS;
  if (retry) return { reaction: 'explain', record: null };
  return { reaction: 'shake', record: { at: now } };
};

export const focusLockMessage = (focusTask, inProgressTask = null) => {
  const title = focusTask?.title || 'tu compromiso';
  const time = bogotaTimeOf(focusTask?.focusDeadlineAt);
  const when = time ? ` hasta las ${time}` : '';
  if (inProgressTask?.title) {
    // Rodny, 21 September 2026: "en cuanto termines tal, deberás continuar con tal".
    return `Tienes un compromiso${when}. En cuanto termines «${inProgressTask.title}», deberás continuar con «${title}». Mientras tanto, tus demás pendientes quedan bloqueados.`;
  }
  return `Estás enfocado en «${title}»${when}. Podrás abrir y mover tus demás pendientes cuando la marques como realizada.`;
};
