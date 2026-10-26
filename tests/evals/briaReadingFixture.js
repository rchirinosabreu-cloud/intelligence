// Casos ficticios con el servicio y la composición reales. Solo la persistencia es memoria por caso;
// ninguna lectura, veredicto o desenlace depende de un objeto de respuesta escrito a mano para el evaluador.
import { composeReading, validateDailyReading } from '../../src/lib/dailyReading.js';
import { createDailyReadingService } from '../../src/services/dailyReadingService.js';

const before = (day, count) => new Date(Date.parse(`${day}T12:00:00Z`) - count * 86_400_000).toISOString().slice(0, 10);
const rejectEffect = () => { throw new Error('La evaluación ficticia no ejecuta acciones ni consulta servicios externos.'); };

export const createReadingEvalFixture = ({ today = '2026-10-15', userRef = 'eval-ficticio' } = {}) => {
  const records = [];
  const metrics = { level: 'red', reasons: ['Van 3 publicadas; a esta fecha deberían ir 6.'], cycle: { published: 3, quota: 12, expected: 6 }, awaitingApproval: 4, returnedPieces: 1, returnedTasks: 0, openTasks: 6, overdueTasks: 1, hoursMs: 5_400_000 };
  const clients = [
    { id: 'cli-aristea', name: 'Aristea Ficticia', slug: 'aristea-ficticia', metrics },
    ...Array.from({ length: 52 }, (_, index) => ({ id: `cli-eval-${index + 1}`, name: `Cuenta Eval ${index + 1} Ficticia`, slug: `cuenta-eval-${index + 1}`, metrics: { ...metrics, level: 'yellow', reasons: ['Esperan aprobación.'], awaitingApproval: 1 } }))
  ];
  const people = [{ id: 'm-jarlan', name: 'Jarlan Ficticio', metrics: { open: 8, inProgress: 2, overdue: 5, returned: 0, closedTasks: 1, hoursMs: 3_600_000 } }];
  const context = { accounts: clients.map(client => ({ clientId: client.id, state: 'CONSULTADO', partial: false, facts: [], contract: null })), criteria: [] };
  const signal = (row) => ({ direction: 'peor', severity: 2, evidence: [], ...row });
  const signals = [
    signal({ id: 'APROBACION_DETENIDA:cli-aristea', kind: 'APROBACION_DETENIDA', subjectType: 'CLIENT', subjectId: 'cli-aristea', subjectName: 'Aristea Ficticia', url: '/clientes/operacion/aristea-ficticia', text: 'Aristea Ficticia lleva 8 días seguidos con piezas esperando su aprobación (hoy 4).' }),
    signal({ id: 'ROJO_SOSTENIDO:cli-aristea', kind: 'ROJO_SOSTENIDO', subjectType: 'CLIENT', subjectId: 'cli-aristea', subjectName: 'Aristea Ficticia', url: '/clientes/operacion/aristea-ficticia', text: 'Aristea Ficticia lleva 6 días en rojo: Van 3 publicadas; a esta fecha deberían ir 6.' }),
    signal({ id: 'VENCIDAS_SOSTENIDAS:m-jarlan', kind: 'VENCIDAS_SOSTENIDAS', subjectType: 'PERSON', subjectId: 'm-jarlan', subjectName: 'Jarlan Ficticio', url: '/gestion?responsable=Jarlan', text: 'Jarlan Ficticio lleva 5 días con tareas vencidas (hoy 5).' }),
    ...clients.slice(1).map((client) => signal({ id: `APROBACION_DETENIDA:${client.id}`, kind: 'APROBACION_DETENIDA', subjectType: 'CLIENT', subjectId: client.id, subjectName: client.name, url: `/clientes/operacion/${client.slug}`, text: `${client.name} tiene una pieza esperando aprobación desde hace tres días.` }))
  ];
  const makeReading = (day) => composeReading({
    day, baseDay: before(day, 1), signals, clients, context,
    summary: { historyDays: 12, firstDay: before(day, 11), clients: { red: 1, yellow: 52, green: 0, gray: 0 }, team: { open: 8, overdue: 5, returned: 0 } },
    model: validateDailyReading({
      resumen: 'Aristea Ficticia sigue en rojo y sus aprobaciones no se mueven; Jarlan Ficticio acumula vencidas.',
      decisiones: [
        { titulo: 'Destrabar las aprobaciones de Aristea Ficticia', porque: 'Cuatro piezas llevan ocho días esperando y el mes va atrasado.', tipo: 'HACER', evidencia: [signals[0].id], pedido: 'Redáctame un mensaje por WhatsApp para Aristea Ficticia para que apruebe lo pendiente.' },
        { titulo: 'No cargarle más trabajo a Jarlan Ficticio esta semana', porque: 'Lleva cinco días con tareas vencidas.', tipo: 'NO_HACER', evidencia: [signals[2].id], pedido: null }
      ],
      cuentas: [{ clientId: 'cli-aristea', lectura: 'Publica por debajo del ritmo y las aprobaciones llevan más de una semana sin moverse.' }]
    }, { signals, clients, day })
  });
  const readings = [makeReading(before(today, 1)), makeReading(today)];
  const entries = ['SIN_EVIDENCIA', 'YA_NO_SE_VE'].map((outcome, index) => ({
    id: `eval-unknown-${index}`, decisionId: `${before(today, 2)}:unknown-${index}`, dayKey: before(today, 2), userRef,
    title: `Decisión ficticia antigua ${index + 1}`, kind: 'HACER', subjectType: 'CLIENT', subjectId: 'cli-aristea', subjectName: 'Aristea Ficticia',
    evidence: [signals[0].id], verdict: 'HECHO', note: null, decidedAt: new Date(`${before(today, 2)}T17:00:00Z`), revision: 1, history: [],
    outcome, outcomeDay: before(today, 1), outcomeText: 'No hay evidencia suficiente para comprobar el resultado.'
  }));
  const repository = {
    reading: async (day) => readings.find((row) => row.day === day) || null,
    latestReading: async () => readings.at(-1),
    readingsBefore: async (day, days = 30) => readings.filter((row) => row.day < day && row.day >= before(day, days)).reverse(),
    snapshot: async () => ({ clients, people }),
    series: async (subjectType, id, { until }) => {
      const subject = (subjectType === 'CLIENT' ? clients : people).find((row) => row.id === id);
      return subject ? Array.from({ length: 7 }, (_, index) => ({ day: before(until, 6 - index), name: subject.name, metrics: { ...subject.metrics, ...(subjectType === 'CLIENT' && index === 0 ? { level: 'yellow' } : {}) } })) : [];
    },
    recentDecisions: async (day, { days = 30, userRef: owner = null } = {}) => entries.filter((row) => row.dayKey <= day && row.dayKey >= before(day, days) && (!owner || row.userRef === owner)),
    recordDecision: async ({ decision, dayKey, user, verdict, note, decidedAt }) => {
      let entry = entries.find((row) => row.decisionId === decision.id && row.userRef === user.ref);
      if (!entry) {
        entry = { ...decision, id: `eval-record-${entries.length}`, decisionId: decision.id, dayKey, userRef: user.ref, userName: user.name, revision: 1, history: [], outcome: null, outcomeDay: null, outcomeText: null };
        entries.push(entry);
      } else if (entry.verdict !== verdict || entry.note !== note) entry.revision += 1;
      Object.assign(entry, { verdict, note, decidedAt });
      records.push({ decisionId: entry.decisionId, dayKey: entry.dayKey, verdict: entry.verdict });
      return entry;
    }
  };
  const service = createDailyReadingService({
    db: {}, repository, proactive: {}, conversations: {}, operations: { listOperations: rejectEffect },
    generate: rejectEffect, notify: rejectEffect, whatsapp: rejectEffect, listPeople: rejectEffect, criteria: async () => [],
    memoryContext: async () => context,
    now: () => new Date(`${today}T17:00:00Z`)
  });
  return { service, records, clients };
};
