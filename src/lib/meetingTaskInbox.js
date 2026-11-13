// La bandeja de pendientes de reuniones (Rodny, 13 de noviembre de 2026: «yo quiero tener un lugar donde ya los tenga
// armados y yo los vea, confirme y apruebe o descarte … prefiero lo de que se reúna por reuniones de Fireflies … debe
// vivir en Manager»). Cada compromiso que Fireflies anotó en una minuta llega aquí armado como pendiente —título,
// cliente que nombra la reunión, responsable del equipo, fecha, prioridad y el contexto de dónde salió— en una
// tarjeta pequeña; abrirla abre el mismo panel con que se crea cualquier pendiente, con los datos ya montados y
// «Despachar a Kanban» en lugar de «Crear tarea» (Rodny, el mismo día). Bria propone; nunca adivina: dos Melissas
// es una pregunta, no una elección. Nada se borra: lo despachado guarda su `taskId` en el compromiso y lo
// descartado guarda quién, cuándo y por qué. Lógica pura, compartida por la pantalla y el servidor.

import { minuteItems, guessClient, matchOwner, minuteLabel, minuteTaskContext } from './minuteTasks.js';

export const INBOX_PRIORITIES = Object.freeze([
  { value: 'NORMAL', label: 'Normal' },
  { value: 'ALTA', label: 'Alta' },
  { value: 'URGENTE', label: 'Urgente' }
]);

export const INBOX_DISCARD_REASONS = Object.freeze([
  { value: 'YA_HECHO', label: 'Ya se hizo' },
  { value: 'NO_ES_PENDIENTE', label: 'No es un pendiente' },
  { value: 'DEL_CLIENTE', label: 'Es del cliente, no nuestro' },
  { value: 'OTRO', label: 'Otro motivo' }
]);

export const INBOX_NOTE_MAX = 300;
/** La marca con que un pendiente nuevo dice de qué compromiso de qué minuta sale (`source` del POST /api/tasks). */
export const MINUTE_SOURCE_KIND = 'MINUTE';

const tidy = (value) => String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
const fold = (value) => tidy(value).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** La huella de un compromiso en la bandeja: la misma que lee el punto del menú de Manager. */
export const inboxKey = (minuteId, n) => `R:${minuteId}:${n}`;

const isPending = (raw) => raw && !raw.taskId && !raw.discarded;

// Un responsable propuesto o la razón por la que no se propone. Nunca se elige entre dos personas.
const proposeAssignee = (owner, members, rank) => {
  if (!owner) return { assigneeId: null, assigneeNote: 'La reunión no dice quién' };
  const term = fold(owner);
  const byWord = members.filter((member) => fold(member.name).split(' ').includes(term) || fold(member.name).startsWith(`${term} `));
  if (byWord.length > 1) return { assigneeId: null, assigneeNote: `«${owner}» puede ser ${byWord.map((member) => member.name).join(' o ')}` };
  const match = matchOwner(owner, members, rank);
  if (!match) return { assigneeId: null, assigneeNote: `«${owner}» no está en el equipo` };
  // Un nombre de pila único o el nombre completo no necesitan aclaración; un parecido («Peres» por «Pérez») sí.
  const plain = fold(match.name) === term || byWord.length === 1;
  return { assigneeId: match.id, assigneeNote: plain ? null : `«${owner}» lo entendí como ${match.name}` };
};

/**
 * Lo que hay por decidir: una fila por reunión con compromisos todavía sin aprobar ni descartar, la más reciente
 * primero. Cada compromiso trae su propuesta y, si falta algo, por qué; la persona completa en la pantalla.
 */
export const buildMeetingInbox = ({ minutes = [], clients = [], members = [], today, rank = null } = {}) => minutes
  .filter((minute) => minute?.status === 'READY' && Array.isArray(minute.actionItems))
  .map((minute) => {
    const raws = minute.actionItems;
    const items = minuteItems(minute, today)
      .filter((item) => isPending(raws[item.n - 1]))
      .map((item) => {
        const proposal = proposeAssignee(item.owner, members, rank);
        return { key: inboxKey(minute.id, item.n), n: item.n, title: item.title, owner: item.owner, dueDay: item.dueDay, priority: item.priority, context: minuteTaskContext(minute, item), ...proposal };
      });
    const client = guessClient(minute, clients);
    return {
      minuteId: minute.id, title: tidy(minute.title), label: minuteLabel(minute), meetingAt: minute.meetingAt ? new Date(minute.meetingAt).toISOString() : null,
      clientId: client?.id || null, clientName: client?.name || null, clientNote: client ? 'por el título de la reunión' : null,
      items, pending: items.length,
      created: raws.filter((raw) => raw?.taskId).length,
      discardedCount: raws.filter((raw) => raw?.discarded && !raw.taskId).length
    };
  })
  .filter((row) => row.pending > 0)
  .sort((a, b) => String(b.meetingAt || '').localeCompare(String(a.meetingAt || '')));

/**
 * Lo que el panel de crear pendientes recibe ya montado al abrir una tarjeta: título, cliente que nombra la reunión,
 * responsable propuesto, fecha, prioridad, el contexto como primer comentario y la marca de dónde sale. La persona
 * corrige ahí lo que haga falta; nada de esto se escribe hasta que pulse «Despachar a Kanban».
 */
export const taskPrefillOf = (minute, item) => ({
  title: item.title,
  clientId: minute.clientId || '',
  assigneeId: item.assigneeId || '',
  collaboratorIds: [],
  dueDate: item.dueDay || '',
  priority: INBOX_PRIORITIES.some((p) => p.value === item.priority) ? item.priority : 'NORMAL',
  comments: item.context ? [item.context] : [],
  source: { kind: MINUTE_SOURCE_KIND, minuteId: minute.minuteId, n: item.n }
});

/** Por qué la marca de origen de un pendiente nuevo no sirve, en palabras; null si apunta a un compromiso. */
export const sourceProblem = (source) => {
  if (!source || typeof source !== 'object') return 'Falta de qué reunión sale este pendiente.';
  if (source.kind !== MINUTE_SOURCE_KIND) return 'No conozco ese origen de pendientes.';
  if (!tidy(source.minuteId)) return 'Falta de qué reunión sale este pendiente.';
  const n = Number(source.n);
  if (!Number.isInteger(n) || n < 1) return 'No sé a qué compromiso de la reunión corresponde este pendiente.';
  return null;
};

/** Por qué no se puede descartar, en palabras; null si todo está bien. */
export const discardProblem = (body = {}) => {
  if (!tidy(body.minuteId)) return 'Falta de qué reunión es este compromiso.';
  const n = Number(body.n);
  if (!Number.isInteger(n) || n < 1) return 'No sé cuál compromiso descartar.';
  if (!INBOX_DISCARD_REASONS.some((reason) => reason.value === body.motivo)) return 'Elige un motivo para descartarlo.';
  const note = tidy(body.nota);
  if (body.motivo === 'OTRO' && !note) return 'Con «Otro motivo», cuéntame cuál en una línea.';
  if (note.length > INBOX_NOTE_MAX) return `La nota es muy larga: como máximo ${INBOX_NOTE_MAX} caracteres.`;
  return null;
};

/** El compromiso queda descartado con quién, cuándo y por qué; el texto original no se toca. Devuelve una copia. */
export const markDiscarded = (actionItems = [], n, { reason, note, by, byName, at }) => actionItems.map((raw, index) => (index === n - 1
  ? { ...raw, discarded: { reason, note: tidy(note) || null, by: by || null, byName: byName || null, at } }
  : raw));

/** El compromiso recuerda su pendiente: así nunca se despacha dos veces. Devuelve una copia. */
export const markCreated = (actionItems = [], n, taskId) => actionItems.map((raw, index) => (index === n - 1 ? { ...raw, taskId } : raw));
