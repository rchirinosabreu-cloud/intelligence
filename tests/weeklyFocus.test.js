// El foco de la semana (Rodny, 10 de octubre de 2026): cada lunes, para cada persona con Bria, un chat nuevo con su
// resumen. Lo escribe la plataforma, una sola vez por semana y persona, y avisa en la campana.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWeeklyFocus, weekBounds } from '../src/lib/weeklyFocus.js';
import { createWeeklyFocusService, initWeeklyFocusScheduler, WEEKLY_FOCUS_NOTIFICATION } from '../src/services/weeklyFocusService.js';
import { createBriaConversationRepository } from '../src/services/briaConversationRepository.js';

const tasks = [
  { id: 't1', title: 'Portada de octubre', status: 'PENDIENTE', dueDay: '2026-10-09', clientName: 'Aristea', role: 'responsable' },
  { id: 't2', title: 'Reel de lanzamiento', status: 'EN_CURSO', dueDay: '2026-10-14', clientName: 'Endova', role: 'responsable' },
  { id: 't3', title: 'Carrusel de vendimia', status: 'PENDIENTE', dueDay: '2026-10-13', clientName: 'Foobespain', role: 'colabora' },
  { id: 't4', title: 'Informe mensual', status: 'DEVUELTA', dueDay: '2026-10-16', clientName: null, role: 'responsable' },
  { id: 't5', title: 'Sin fecha', status: 'PENDIENTE', dueDay: null, clientName: null, role: 'responsable' }
];

test('the week runs Monday to Sunday in Bogotá and the focus lists overdue, in progress, this week by day, undated and the team', () => {
  assert.deepEqual(weekBounds('2026-10-13'), { monday: '2026-10-12', sunday: '2026-10-18' });
  assert.deepEqual(weekBounds('2026-10-18'), { monday: '2026-10-12', sunday: '2026-10-18' });
  const { title, text } = buildWeeklyFocus({ personName: 'Kamila Pérez', today: '2026-10-13', tasks, teamSignals: [{ message: 'Brayan Torres tiene 9 h estimadas el 14 de octubre.' }] });
  assert.equal(title, 'Foco de la semana · 12 de octubre');
  assert.match(text, /^Hola, Kamila\. Este es tu foco de la semana del 12 de octubre al 18 de octubre\./);
  assert.match(text, /\*\*Vencidas \(1\)\*\*[^\n]*\n\n- \[Portada de octubre\]\(\/gestion\?taskId=t1\) · Aristea · venció el 9 de octubre/);
  assert.match(text, /\*\*En proceso \(1\)\*\*\n\n- \[Reel de lanzamiento\]\(\/gestion\?taskId=t2\) · Endova/);
  // Cada día va separado por líneas en blanco: pegado a la lista anterior, Markdown lo leería como parte del ítem.
  assert.match(text, /\*\*Esta semana \(2\)\*\*\n\n_Martes 13 de octubre \(hoy\)_\n\n- \[Carrusel de vendimia\]\(\/gestion\?taskId=t3\) · Foobespain · colaboras\n\n_Viernes 16 de octubre_\n\n- \[Informe mensual\]\(\/gestion\?taskId=t4\)/);
  assert.match(text, /1 pendiente sin fecha/);
  assert.match(text, /\*\*El equipo\*\*\n\n- Brayan Torres tiene 9 h estimadas/);
  assert.match(text, /Si quieres, dime por dónde empezar y lo organizamos juntos\.$/);
  assert.doesNotMatch(text, /vosotros|tenéis|podéis/);
});

test('with nothing open the focus says so kindly, and a long list is cut with a pointer to Gestión', () => {
  assert.match(buildWeeklyFocus({ personName: 'Rodny', today: '2026-10-13', tasks: [] }).text, /No tienes tareas abiertas esta semana\. Buen momento para adelantar lo que viene\./);
  const many = Array.from({ length: 11 }, (_, i) => ({ id: `d${i}`, title: `Tarea ${i}`, status: 'PENDIENTE', dueDay: '2026-10-15', clientName: null, role: 'responsable' }));
  const { text } = buildWeeklyFocus({ personName: 'Rodny', today: '2026-10-13', tasks: many });
  assert.match(text, /Esta semana \(11\)/);
  assert.match(text, /…y 3 más en Gestión\./);
});

const memoryRepo = () => {
  const deliveries = new Map();
  return {
    deliveries,
    focusDelivery: async (weekKey, userRef) => deliveries.get(`${weekKey}|${userRef}`) || null,
    recordFocusDelivery: async (weekKey, userRef, conversationId) => { const row = { weekKey, userRef, conversationId }; deliveries.set(`${weekKey}|${userRef}`, row); return row; }
  };
};
const people = [
  { id: 'u-kamila', name: 'Kamila Pérez', role: 'PROJECT_MANAGER', modulePermissions: { bria: true, gestion: true }, teamMember: { id: 'm-kam', name: 'Kamila Pérez' } },
  { id: 'u-rodny', name: 'Rodny Chirinos', role: 'ADMIN', modulePermissions: { bria: true }, teamMember: { id: 'm-rod', name: 'Rodny Chirinos' } }
];
const build = ({ nowIso, repository = memoryRepo(), notes = [], notices = [], failNotify = false }) => ({
  repository, notes, notices,
  service: createWeeklyFocusService({
    db: { task: { findMany: async ({ where }) => where.OR[0].assigneeId === 'm-kam' ? [{ id: 't1', title: 'Portada', status: 'PENDIENTE', dueDate: new Date('2026-10-14T12:00:00Z'), assigneeId: 'm-kam', client: { name: 'Aristea' } }] : [] } },
    conversations: { postAssistantNote: async (actor, note) => { notes.push({ actor, note }); return { id: `c-${notes.length}`, title: note.title, revision: 1, turns: [{ id: `c-${notes.length}:1`, role: 'assistant', text: note.text }] }; } },
    repository, load: { get: async () => ({ signals: [{ message: 'Brayan tiene 9 h el miércoles.' }] }) },
    now: () => new Date(nowIso), notify: async (notice) => { if (failNotify) throw new Error('push caído'); notices.push(notice); },
    listPeople: async () => people, logger: { error: () => {}, log: () => {} }
  })
});

test('on Monday from 7:00 Bogotá each Bria person gets one new chat with the focus and one notice; a restart does not repeat it', async () => {
  const repository = memoryRepo(), notes = [], notices = [];
  assert.deepEqual(await build({ nowIso: '2026-10-12T11:30:00Z', repository, notes, notices }).service.runAutomatic(), { skipped: 'fuera de horario' });
  const first = await build({ nowIso: '2026-10-12T12:10:00Z', repository, notes, notices }).service.runAutomatic();
  assert.deepEqual(first, { weekKey: '2026-W42', delivered: 2, already: 0, failed: 0 });
  assert.equal(notes.length, 2);
  assert.deepEqual(notes[0].actor, { ref: 'u-kamila', name: 'Kamila Pérez', role: 'PROJECT_MANAGER', permissions: { bria: true, gestion: true } }, 'the note belongs to the person, with her permissions for the fingerprint');
  assert.equal(notes[0].note.title, 'Foco de la semana · 12 de octubre');
  assert.match(notes[0].note.text, /\[Portada\]\(\/gestion\?taskId=t1\) · Aristea/);
  assert.match(notes[0].note.text, /Brayan tiene 9 h el miércoles/);
  assert.deepEqual(notes[0].note.metadata, { note: 'FOCO_SEMANAL', weekKey: '2026-W42' });
  assert.deepEqual(notices.map((n) => [n.userId, n.type, n.relatedId]), [['u-kamila', WEEKLY_FOCUS_NOTIFICATION, 'c-1'], ['u-rodny', WEEKLY_FOCUS_NOTIFICATION, 'c-2']]);
  const again = await build({ nowIso: '2026-10-12T20:00:00Z', repository, notes, notices }).service.runAutomatic();
  assert.deepEqual(again, { weekKey: '2026-W42', delivered: 0, already: 2, failed: 0 });
  assert.equal(notes.length, 2);
});

test('a notice that fails never undoes the delivery, and the scheduler ticks without overlapping', async () => {
  const { service, repository } = build({ nowIso: '2026-10-12T13:00:00Z', failNotify: true });
  assert.deepEqual(await service.runAutomatic(), { weekKey: '2026-W42', delivered: 2, already: 0, failed: 0 });
  assert.equal(repository.deliveries.size, 2);
  const timers = [];
  const tick = initWeeklyFocusScheduler({ service: { runAutomatic: async () => ({ skipped: 'x' }) }, setIntervalFn: (fn, ms) => { timers.push(['interval', ms]); return { unref() {} }; }, setTimeoutFn: (fn, ms) => { timers.push(['timeout', ms]); return { unref() {} }; }, logger: { log: () => {}, error: () => {} } });
  assert.deepEqual(timers, [['timeout', 120_000], ['interval', 30 * 60_000]]);
  await tick();
});

test('postAssistantNote opens the chat at revision 1 with Bria’s only turn at position 1, inside a transaction', async () => {
  const queries = [];
  const client = { query: async (sql, params) => { queries.push([sql, params]); return { rows: [] }; }, release() {} };
  const pool = { connect: async () => client, query: async (sql, params) => {
    if (/FROM bria_memory\.conversations/.test(sql)) return { rows: [{ id: params[2], title: 'Foco de la semana · 12 de octubre', revision: 1, updated_at: new Date('2026-10-12T12:10:00Z') }] };
    return { rows: [{ position: 1, role: 'assistant', content: 'Hola, Kamila.', metadata: { note: 'FOCO_SEMANAL', accessFingerprint: 'x' } }] };
  } };
  const repository = createBriaConversationRepository({ pool, workspace: 'application' });
  const chat = await repository.postAssistantNote({ ref: 'u-kamila', role: 'PROJECT_MANAGER', permissions: { bria: true } }, { title: 'Foco de la semana · 12 de octubre', text: 'Hola, Kamila.', metadata: { note: 'FOCO_SEMANAL' } });
  assert.deepEqual(queries.map(([sql]) => sql.split(' ')[0]), ['BEGIN', 'INSERT', 'INSERT', 'COMMIT']);
  assert.match(queries[1][0], /INSERT INTO bria_memory\.conversations\(id,workspace,actor_ref,title,revision\) VALUES\(\$1,\$2,\$3,\$4,1\)/);
  assert.deepEqual(queries[1][1].slice(1), ['application', 'u-kamila', 'Foco de la semana · 12 de octubre']);
  assert.match(queries[2][0], /VALUES\(\$1,1,'assistant',\$2,\$3\)/);
  assert.equal(queries[2][1][1], 'Hola, Kamila.');
  assert.deepEqual(Object.keys(queries[2][1][2]).sort(), ['accessFingerprint', 'failures', 'note', 'sources', 'toolsUsed']);
  assert.equal(chat.revision, 1);
  assert.equal(chat.turns[0].role, 'assistant');
});
