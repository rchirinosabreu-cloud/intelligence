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

/** Pasó la hora y la tarea sigue sin realizarse. El bloqueo no se suelta solo: lo suelta el manager o se termina la tarea. */
export const isFocusOverdue = (task, now = Date.now()) => (
  isActiveFocusTask(task) && new Date(task.focusDeadlineAt).getTime() < Number(now)
);

// Rodny, 21 September 2026: the person asks for more time choosing how much and why; the manager who set the hour decides.
export const FOCUS_EXTENSION_OPTIONS = Object.freeze([
  Object.freeze({ minutes: 15, label: '15 minutos' }),
  Object.freeze({ minutes: 30, label: '30 minutos' }),
  Object.freeze({ minutes: 60, label: '1 hora' }),
  Object.freeze({ minutes: 120, label: '2 horas' }),
  Object.freeze({ minutes: 240, label: '4 horas' })
]);
export const FOCUS_EXTENSION_REASON_MAX = 300;

export const focusExtensionLabel = (minutes) => FOCUS_EXTENSION_OPTIONS.find((option) => option.minutes === Number(minutes))?.label || null;

/**
 * La hora nueva al pedir más tiempo: se aplica sola, sin que nadie apruebe (Rodny, 21 de septiembre de 2026).
 * Se cuenta desde el compromiso, o desde ahora si ya venció, para que la hora nueva nunca quede en el pasado.
 */
export const extendedFocusDeadline = (focusDeadlineAt, minutes, now = Date.now()) => {
  if (!focusDeadlineAt) return null;
  const current = new Date(focusDeadlineAt).getTime();
  if (Number.isNaN(current)) return null;
  return new Date(Math.max(current, Number(now)) + Number(minutes) * 60_000);
};

/** Valida una petición de prórroga: devuelve `{ minutes, reason }` limpio o lanza un error con `statusCode` 400. */
export const parseFocusExtensionRequest = ({ minutes, reason } = {}) => {
  const label = focusExtensionLabel(minutes);
  if (!label) {
    const error = new Error('Elige cuánto tiempo más necesitas.');
    error.statusCode = 400;
    throw error;
  }
  const cleanReason = String(reason || '').replace(/\s+/g, ' ').trim();
  if (!cleanReason) {
    const error = new Error('Cuéntale al manager por qué necesitas más tiempo.');
    error.statusCode = 400;
    throw error;
  }
  return { minutes: Number(minutes), label, reason: cleanReason.slice(0, FOCUS_EXTENSION_REASON_MAX) };
};

export const focusLockMessage = (focusTask, inProgressTask = null, now = Date.now()) => {
  const title = focusTask?.title || 'tu compromiso';
  const time = bogotaTimeOf(focusTask?.focusDeadlineAt);
  const when = time ? ` hasta las ${time}` : '';
  if (isFocusOverdue(focusTask, now)) {
    // Past the hour the tone changes: finish it or ask for more time; the lock stays until the manager decides.
    const tail = inProgressTask?.title
      ? ` Termina «${inProgressTask.title}» y sigue con tu compromiso, o pide más tiempo. Mientras tanto, tus demás pendientes siguen bloqueados.`
      : ' Termínalo o pide más tiempo. Mientras tanto, tus demás pendientes siguen bloqueados.';
    return `Tu compromiso «${title}» venció${time ? ` a las ${time}` : ''} y sigue sin realizarse.${tail}`;
  }
  if (inProgressTask?.title) {
    // Rodny, 21 September 2026: "en cuanto termines tal, deberás continuar con tal".
    return `Tienes un compromiso${when}. En cuanto termines «${inProgressTask.title}», deberás continuar con «${title}». Mientras tanto, tus demás pendientes quedan bloqueados.`;
  }
  return `Estás enfocado en «${title}»${when}. Podrás abrir y mover tus demás pendientes cuando la marques como realizada.`;
};

// Aviso explicativo la primera vez que la persona ve cada compromiso (Rodny, 22 de septiembre de 2026).
// Se recuerda por tarea, no por persona: cada compromiso nuevo es un acuerdo nuevo y conviene recordar la regla.
export const FOCUS_NOTICE_VERSION = 'v1';
const FOCUS_NOTICE_MEMORY = 30;

export const focusNoticeStorageKey = (userId = 'guest') => `brainstudio:focus-commitment-notice:${FOCUS_NOTICE_VERSION}:${userId}`;

const readFocusNotices = (storage, userId) => {
  try {
    const stored = JSON.parse(storage?.getItem?.(focusNoticeStorageKey(userId)) || '[]');
    return Array.isArray(stored) ? stored.map(String) : [];
  } catch {
    return [];
  }
};

export const hasSeenFocusNotice = (storage, userId, taskId) => readFocusNotices(storage, userId).includes(String(taskId));

export const markFocusNoticeSeen = (storage, userId, taskId) => {
  const seen = readFocusNotices(storage, userId);
  if (seen.includes(String(taskId))) return;
  seen.push(String(taskId));
  try {
    storage?.setItem?.(focusNoticeStorageKey(userId), JSON.stringify(seen.slice(-FOCUS_NOTICE_MEMORY)));
  } catch { /* per-device convenience only */ }
};

// Novedades del compromiso en la conversación de la tarea, con el mismo formato `[MOTIVO]\nnota` que
// devolución, reintegración y reapertura (Rodny, 21 de septiembre de 2026).
export const FOCUS_OVERDUE_EVENT_TYPE = 'system_focus_overdue';
export const FOCUS_EXTENSION_EVENT_TYPE = 'system_focus_extension';

export const formatFocusOverdueEventContent = (task) => {
  const time = bogotaTimeOf(task?.focusDeadlineAt);
  return `[FOCUS_OVERDUE]\nEl compromiso venció${time ? ` a las ${time}` : ''}.`;
};

// La hora nueva viaja en la etiqueta, no en el texto: la nota es solo lo que escribió la persona.
export const formatFocusExtensionEventContent = ({ minutes, reason, newTime }) => (
  `[FOCUS_EXTENSION:${minutes}${newTime ? `@${newTime}` : ''}]\n${reason}`
);

const LEGACY_EXTENSION_LINE = /\n?El compromiso pasó a las (\d{1,2}:\d{2})\.\s*$/;

/** Presentación de esas novedades: etiqueta del evento y nota, como `getTaskSystemEventPresentation`. */
export const focusEventPresentation = (type, content = '') => {
  const text = String(content || '').trim();
  const match = text.match(/^\[([^\]]+)\]\s*\n?([\s\S]*)$/);
  let note = (match?.[2] ?? text).trim();
  if (type === FOCUS_EXTENSION_EVENT_TYPE) {
    const tag = (match?.[1] || '').match(/^FOCUS_EXTENSION:(\d+)(?:@(\d{1,2}:\d{2}))?$/);
    const minutes = tag?.[1];
    const taggedTime = tag?.[2];
    // Las novedades anteriores al 21 de septiembre de 2026 llevaban la hora nueva como una línea más.
    const legacyTime = note.match(LEGACY_EXTENSION_LINE)?.[1];
    if (legacyTime) note = note.replace(LEGACY_EXTENSION_LINE, '').trim();
    const newTime = taggedTime || legacyTime;
    const label = focusExtensionLabel(minutes);
    const added = label ? `Se añadieron ${label}` : 'Más tiempo añadido';
    return { badgeLabel: newTime ? `${added} · hasta las ${newTime}` : added, note };
  }
  // Sin etiqueta: repetiría el título del evento (Rodny, 21 de septiembre de 2026: «solo redunda»).
  return { badgeLabel: null, note };
};

/** Textos de los avisos al vencer: para quien puso la hora y para la persona. */
export const focusOverdueMessages = (task, assigneeName = 'La persona') => {
  const time = bogotaTimeOf(task?.focusDeadlineAt);
  const title = task?.title || 'la tarea';
  return {
    manager: `${assigneeName} no cumplió el compromiso «${title}»${time ? ` a las ${time}` : ''}. Ábrela para darle más tiempo, quitar la hora o reasignarla.`,
    person: `Tu compromiso «${title}» venció${time ? ` a las ${time}` : ''}. Termínalo o pide más tiempo.`
  };
};

/**
 * Aviso a quien puso la hora cuando la persona se toma más tiempo. No hay nada que aprobar: la hora ya cambió.
 */
export const focusExtensionRequestMessage = ({ task, assigneeName = 'La persona', label, reason, newTime }) => {
  const title = task?.title || 'la tarea';
  return `${assigneeName} necesitaba ${label} más para «${title}»: ${reason}. Su compromiso pasó${newTime ? ` a las ${newTime}` : ''}.`;
};
