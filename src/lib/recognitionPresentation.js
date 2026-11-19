// Shared presentation only. Eligibility and persistence live in services/recognitionService.js.
export const recognitionLabels = Object.freeze({
  FIRST_TASK: 'Buen comienzo',
  EARLY_DELIVERY: 'Entrega anticipada',
  DAILY_EIGHT: 'On fire',
  CAUGHT_UP: 'Al día',
  PLAN_APPROVED: 'Parrilla aprobada',
  WEEKLY_FIFTY: 'Ya son 50',
});

export const recognitionMessages = Object.freeze({
  FIRST_TASK: 'Eres el primero del equipo en completar una tarea. Cada avance cuenta.',
  EARLY_DELIVERY: 'Terminaste ese pendiente antes de lo previsto. Anticiparte también suma.',
  DAILY_EIGHT: 'Hoy completaste ocho tareas. ¡Qué manera de hacer avanzar las cosas!',
  // Desde el 12 de noviembre de 2026 se entrega al cierre de la jornada a quien terminó sin nada vencido.
  CAUGHT_UP: 'Cerraste el día sin dejar nada vencido, buen trabajo.',
  PLAN_APPROVED: 'El cliente aprobó tu parrilla. ¡A producción!',
  WEEKLY_FIFTY: 'Llevas 50 tareas cumplidas en esta semana, puro trabajo y dedicación. ¡Felicidades!',
});

// El texto de una tarjeta corre como un párrafo: un salto de línea suelto (como los que traen los mensajes guardados
// antes del 18 de noviembre de 2026) se lee como espacio, y solo una línea en blanco separa párrafos. Así el ancho de
// la tarjeta decide dónde cortar, nunca el texto (Rodny: «no esos saltos de línea sin razón»).
export function recognitionParagraphs(text) {
  return String(text || '').split(/\n\s*\n/).map(part => part.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

export function mergeRecognitions(previous = [], incoming = []) {
  const records = new Map();
  for (const event of [...previous, ...incoming]) {
    if (!event?.id || !Object.hasOwn(recognitionLabels, event.kind) || !event.recipient?.id
      || !event.recipient?.name || !event.description?.trim() || !event.occurredAt
      || !Number.isFinite(new Date(event.occurredAt).getTime())) continue;
    records.set(event.id, event);
  }
  return [...records.values()].sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt) || a.id.localeCompare(b.id));
}

// Display only explicit associations; never infer an award from the task's dates or status.
export function recognitionTitlesForTask(task, events = []) {
  if (!task?.id || !task.assignee?.userId) return [];
  return [...new Set(mergeRecognitions([], events)
    .filter(event => event.taskId === task.id && event.recipient.id === task.assignee.userId)
    .map(event => recognitionLabels[event.kind]))];
}

const dayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' });
export function recognitionsForDay(events, now = new Date()) {
  const day = dayFormatter.format(now);
  return mergeRecognitions([], events).filter(event => dayFormatter.format(new Date(event.occurredAt)) === day);
}

export function recognitionMotion(style, reducedMotion) {
  if (reducedMotion || style === 'quiet') return { offset: 0, duration: 0, particles: 0 };
  return { offset: 18, duration: 0.28, particles: style === 'celebration' ? 26 : 0 };
}
