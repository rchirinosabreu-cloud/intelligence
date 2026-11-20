// El historial de cada tarea (Rodny, 19 de noviembre de 2026: «es bueno que la tarea tenga su propio historial …
// sobrio, delicado, discreto, como el historial de las sesiones»). Qué cambió entre dos estados de una tarea; la
// regla la comparten el servidor (al guardar) y la pantalla (al leer). Solo lo que una persona necesita para
// entender por qué la tarea está como está: responsable, estado, fecha, cliente, título y prioridad.

const dayOf = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};
const priorityOf = (task) => (task?.isPriority ? (task.priority || 'NORMAL') : null);

const FIELDS = [
  ['ASSIGNEE', (task) => task?.assigneeId || null],
  ['STATUS', (task) => task?.status || null],
  ['DUE_DATE', (task) => dayOf(task?.dueDate)],
  ['CLIENT', (task) => task?.clientId || null],
  ['TITLE', (task) => task?.title || null],
  ['PRIORITY', priorityOf]
];

export const taskChangesBetween = (before, after) => FIELDS
  .map(([kind, read]) => ({ kind, fromValue: read(before), toValue: read(after) }))
  .filter((change) => change.fromValue !== change.toValue);

export const TASK_STATUS_LABELS = Object.freeze({
  PENDIENTE: 'Pendiente', EN_CURSO: 'En proceso', REALIZADA: 'Realizada', DEVUELTA: 'Devuelta'
});
const PRIORITY_LABELS = { NORMAL: 'prioritaria', ALTA: 'prioridad alta', URGENTE: 'urgente' };

const shortDay = (key) => {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
};

// Una línea por cambio, en tercera persona y sin adornos: «Kamila cambió el responsable: Kamila → Rodny».
// `names` resuelve ids de personas y clientes; un id sin nombre se dice «alguien», nunca el id.
export const describeTaskChange = (event, names = {}) => {
  const who = event.actorName || 'La plataforma';
  const person = (id) => (id ? names[id] || 'alguien' : 'nadie');
  const arrow = (from, to) => `${from} → ${to}`;
  switch (event.kind) {
    case 'CREATED': return event.toValue ? `${who} lo creó para ${person(event.toValue)}` : `${who} lo creó`;
    case 'ASSIGNEE': return `${who} cambió el responsable: ${arrow(person(event.fromValue), person(event.toValue))}`;
    case 'STATUS': return `${who} lo pasó a ${TASK_STATUS_LABELS[event.toValue] || event.toValue}`;
    case 'DUE_DATE': return event.toValue ? `${who} cambió la fecha: ${arrow(event.fromValue ? shortDay(event.fromValue) : 'sin fecha', shortDay(event.toValue))}` : `${who} quitó la fecha`;
    case 'CLIENT': return `${who} cambió el cliente: ${arrow(names[event.fromValue] || 'sin cliente', names[event.toValue] || 'sin cliente')}`;
    case 'TITLE': return `${who} cambió el título`;
    case 'PRIORITY': return event.toValue ? `${who} lo marcó como ${PRIORITY_LABELS[event.toValue] || 'prioritario'}` : `${who} le quitó la prioridad`;
    default: return `${who} hizo un cambio`;
  }
};
