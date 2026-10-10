// Tiempo declarado al cerrar sin cronómetro (Rodny, 9 de octubre de 2026: «preguntar el tiempo al cerrar»). Lo
// comparten el servidor (declaredTimeService.js) y la pantalla (DeclaredTimeDialog.jsx).
const MINUTE = 60_000;
export const MIN_MEASURED_MS = 10 * MINUTE;
export const MAX_DECLARED_MINUTES = 12 * 60;
export const DECLARED_CLOSE_REASON = 'DECLARED';
export const DECLARED_TIME_OPTIONS = [
  { minutes: 15, label: '15 min' }, { minutes: 30, label: '30 min' }, { minutes: 60, label: '1 h' },
  { minutes: 120, label: '2 h' }, { minutes: 240, label: '4 h' }, { minutes: 480, label: '8 h' }
];

// Quien cierra una tarea (el tablero, el panel) no muestra nada: si el servidor respondió `needsDeclaredTime`,
// avisa y el diálogo único de la aplicación pregunta.
export const DECLARED_TIME_EVENT = 'brain:declared-time';
export const askDeclaredTimeIfNeeded = (task) => {
  if (!task?.needsDeclaredTime || !task.id || typeof window === 'undefined') return false;
  window.dispatchEvent(new CustomEvent(DECLARED_TIME_EVENT, { detail: { id: task.id, title: task.title || 'esta tarea' } }));
  return true;
};
