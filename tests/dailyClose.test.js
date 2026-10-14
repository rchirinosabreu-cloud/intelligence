// El cierre del día (Rodny, 14 de octubre de 2026, primer punto del plan: «un solo mensaje por persona: qué cerró,
// qué quedó en proceso, qué vence mañana. Y para ti, el resumen del equipo»). A las 5 de la tarde de cada día hábil
// (Bogotá), para cada persona con Bria, un chat nuevo con el cierre y un aviso en la campana; encima de la mascota,
// «Bria dejó tu cierre del día». Lo escribe la plataforma con sus datos, sin modelo, una sola vez por día y persona.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildDailyClose, nextWorkday } from '../src/lib/dailyClose.js';
import { createDailyCloseService, initDailyCloseScheduler, DAILY_CLOSE_NOTIFICATION, DAILY_CLOSE_HOUR } from '../src/services/dailyCloseService.js';
import { buildNudges, nudgeActions, isValidNudgeKey } from '../src/lib/briaNudges.js';

const mine = {
  closed: [{ id: 'c1', title: 'Portada de octubre', clientName: 'Aristea' }, { id: 'c2', title: 'Informe mensual', clientName: null }],
  inProgress: [{ id: 'p1', title: 'Reel de lanzamiento', clientName: 'Endova' }],
  dueNext: [{ id: 'n1', title: 'Carrusel de vendimia', clientName: 'Foobespain' }],
  overdue: [{ id: 'o1', title: 'Guion atrasado', clientName: 'Nattal' }]
};
const team = {
  closedCount: 7, closedBy: [{ personName: 'Melissa Castaño', count: 4 }, { personName: 'Brayan Torres', count: 2 }, { personName: 'Helen Ruiz', count: 1 }],
  inProgressCount: 3,
  dueNext: [{ personName: 'Melissa Castaño', tasks: [{ id: 'm1', title: 'Historias de Endova' }, { id: 'm2', title: 'Post de Aristea' }] }, { personName: 'Brayan Torres', tasks: [{ id: 'b1', title: 'Video de Nattal' }] }],
  overdueCount: 2
};
const notices = [
  { title: 'Melissa no tiene una tarea en proceso desde las 9:55.', resolution: 'Melissa arrancó «Reel de lanzamiento» a las 10:40.', followUp: null, dismissedAt: null },
  { title: '«Carrusel de Endova» lleva 1 día devuelta sin cambios.', resolution: null, followUp: '«Carrusel de Endova» sigue devuelta sin cambios a las 11:31.', dismissedAt: null },
  { title: 'Aristea está en rojo en Operación.', resolution: null, followUp: null, dismissedAt: new Date('2026-10-13T16:00:00Z') }
];

test('the next workday skips weekends and holidays', () => {
  assert.equal(nextWorkday('2026-10-13'), '2026-10-14');
  assert.equal(nextWorkday('2026-10-16'), '2026-10-19', 'Friday to Monday');
  assert.equal(nextWorkday('2026-10-09'), '2026-10-13', 'the long weekend of 12 de octubre');
});

test('the close says the day, what the person closed, what stays in progress, what is overdue, what is due next, the team and how the notices ended', () => {
  const { title, text } = buildDailyClose({ personName: 'Kamila Pérez', today: '2026-10-13', mine, team, notices });
  assert.equal(title, 'Cierre del día · martes 13 de octubre');
  assert.match(text, /^Hola, Kamila\. Así cierra el martes 13 de octubre\./);
  assert.match(text, /\*\*Tu día\*\*\n\nCerraste 2 tareas:\n\n- \[Portada de octubre\]\(\/gestion\?taskId=c1\) · Aristea\n- \[Informe mensual\]\(\/gestion\?taskId=c2\)\n\nQueda en proceso 1:\n\n- \[Reel de lanzamiento\]\(\/gestion\?taskId=p1\) · Endova/);
  assert.match(text, /Vencida sin cerrar 1:\n\n- \[Guion atrasado\]\(\/gestion\?taskId=o1\) · Nattal/);
  assert.match(text, /\*\*Mañana, miércoles 14 de octubre\*\*\n\nTe vence 1:\n\n- \[Carrusel de vendimia\]\(\/gestion\?taskId=n1\) · Foobespain/);
  assert.match(text, /\*\*El equipo\*\*\n\n- Hoy se cerraron 7 tareas: Melissa 4, Brayan 2 y Helen 1\.\n- Al cierre quedan 3 en proceso\.\n- Mañana vencen 3 tareas que todavía no están en proceso: Melissa «Historias de Endova» y «Post de Aristea»; Brayan «Video de Nattal»\.\n- Vencidas abiertas en el equipo: 2\./);
  assert.match(text, /\*\*Lo que te avisé hoy\*\*\n\n- Melissa no tiene una tarea en proceso desde las 9:55\. → Melissa arrancó «Reel de lanzamiento» a las 10:40\.\n- «Carrusel de Endova» lleva 1 día devuelta sin cambios\. → Al cierre seguía igual\.\n- Aristea está en rojo en Operación\. → Lo ocultaste\./);
  assert.match(text, /Mañana seguimos\.$/);
  assert.doesNotMatch(text, /vosotros|tenéis|podéis|\b(lent[oa]|floj[oa]|mal)\b/);
});

test('with nothing to say each block says so plainly; Friday looks at Monday; the team block is only for whoever gets it', () => {
  const { text } = buildDailyClose({ personName: 'Rodny', today: '2026-10-16', mine: { closed: [], inProgress: [], dueNext: [], overdue: [] }, team: null, notices: [] });
  assert.match(text, /Hoy no quedó ninguna tarea cerrada a tu nombre\./);
  assert.match(text, /\*\*El lunes 19 de octubre\*\*\n\nNo tienes nada con fecha para ese día\./);
  assert.doesNotMatch(text, /\*\*El equipo\*\*|Lo que te avisé hoy/);
  const many = Array.from({ length: 10 }, (_, i) => ({ id: `t${i}`, title: `Tarea ${i}`, clientName: null }));
  assert.match(buildDailyClose({ personName: 'Rodny', today: '2026-10-13', mine: { closed: many, inProgress: [], dueNext: [], overdue: [] } }).text, /Cerraste 10 tareas:[\s\S]*…y 2 más en Gestión\./);
});

/* ---------------------------------------------------------------- El servicio */

const memoryRepo = () => {
  const deliveries = new Map();
  return {
    deliveries,
    dailyCloseDelivery: async (dayKey, userRef) => deliveries.get(`${dayKey}|${userRef}`) || null,
    recordDailyCloseDelivery: async (dayKey, userRef, conversationId) => { const row = { dayKey, userRef, conversationId }; deliveries.set(`${dayKey}|${userRef}`, row); return row; },
    messagesOfDay: async (userRef) => userRef === 'u-kamila' ? [{ title: 'Melissa no tiene una tarea en proceso desde las 9:55.', resolution: 'Melissa arrancó «Reel» a las 10:40.', followUp: null, dismissedAt: null }] : []
  };
};
const people = [
  { id: 'u-kamila', name: 'Kamila Pérez', role: 'PROJECT_MANAGER', modulePermissions: { bria: true, gestion: true }, teamMember: { id: 'm-kam', name: 'Kamila Pérez' } },
  { id: 'u-rodny', name: 'Rodny Chirinos', role: 'ADMIN', modulePermissions: { bria: true }, teamMember: { id: 'm-rod', name: 'Rodny Chirinos' } }
];
const db = {
  teamMember: { findMany: async () => [{ id: 'm-kam', name: 'Kamila Pérez', user: { role: 'PROJECT_MANAGER' } }, { id: 'm-rod', name: 'Rodny Chirinos', user: { role: 'ADMIN' } }, { id: 'm-mel', name: 'Melissa Castaño', user: { role: 'EDITOR' } }] },
  task: { findMany: async ({ where }) => where.completedAt
    ? [{ id: 'c1', title: 'Portada', status: 'REALIZADA', assigneeId: 'm-kam', completedAt: new Date('2026-10-13T19:00:00Z'), client: { name: 'Aristea' }, collaborators: [] }, { id: 'c2', title: 'Reel', status: 'REALIZADA', assigneeId: 'm-mel', completedAt: new Date('2026-10-13T20:00:00Z'), client: null, collaborators: [{ memberId: 'm-kam' }] }]
    : [{ id: 'p1', title: 'Historias', status: 'EN_CURSO', dueDate: new Date('2026-10-14T12:00:00Z'), assigneeId: 'm-mel', client: { name: 'Endova' }, collaborators: [] }, { id: 'n1', title: 'Post', status: 'PENDIENTE', dueDate: new Date('2026-10-14T12:00:00Z'), assigneeId: 'm-mel', client: null, collaborators: [] }, { id: 'o1', title: 'Vieja', status: 'PENDIENTE', dueDate: new Date('2026-10-09T12:00:00Z'), assigneeId: 'm-kam', client: null, collaborators: [] }] }
};
const build = ({ nowIso, repository = memoryRepo(), notes = [], notices = [], failNotify = false }) => ({
  repository, notes, notices,
  service: createDailyCloseService({
    db, repository,
    conversations: { postAssistantNote: async (actor, note) => { notes.push({ actor, note }); return { id: `c-${notes.length}`, title: note.title }; } },
    now: () => new Date(nowIso), notify: async (notice) => { if (failNotify) throw new Error('push caído'); notices.push(notice); },
    listPeople: async () => people, logger: { error: () => {}, log: () => {} }
  })
});

test('from 17:00 Bogotá on a workday each Bria person gets one chat with the close and one notice; before that, on weekends, and a second time it does nothing', async () => {
  assert.equal(DAILY_CLOSE_HOUR, 17);
  const repository = memoryRepo(), notes = [], notices = [];
  assert.deepEqual(await build({ nowIso: '2026-10-13T21:50:00Z', repository, notes, notices }).service.runAutomatic(), { skipped: 'fuera de horario' });
  assert.deepEqual(await build({ nowIso: '2026-10-17T23:00:00Z', repository, notes, notices }).service.runAutomatic(), { skipped: 'fuera de horario' }, 'Saturday');
  const first = await build({ nowIso: '2026-10-13T22:05:00Z', repository, notes, notices }).service.runAutomatic();
  assert.deepEqual(first, { dayKey: '2026-10-13', delivered: 2, already: 0, failed: 0 });
  assert.equal(notes[0].note.title, 'Cierre del día · martes 13 de octubre');
  assert.deepEqual(notes[0].actor, { ref: 'u-kamila', name: 'Kamila Pérez', role: 'PROJECT_MANAGER', permissions: { bria: true, gestion: true } });
  assert.match(notes[0].note.text, /Cerraste 2 tareas:\n\n- \[Portada\]\(\/gestion\?taskId=c1\) · Aristea\n- \[Reel\]\(\/gestion\?taskId=c2\) · colaboraste/);
  assert.match(notes[0].note.text, /Vencida sin cerrar 1:\n\n- \[Vieja\]/);
  assert.match(notes[0].note.text, /\*\*El equipo\*\*\n\n- Hoy se cerraron 2 tareas: Kamila 1 y Melissa 1\.\n- Al cierre queda 1 en proceso\.\n- Mañana vence 1 tarea que todavía no está en proceso: Melissa «Post»\.\n- Vencidas abiertas en el equipo: 1\./, 'the team counts everyone but administrators');
  assert.match(notes[0].note.text, /Lo que te avisé hoy\*\*\n\n- Melissa no tiene una tarea en proceso desde las 9:55\. → Melissa arrancó «Reel» a las 10:40\./);
  assert.doesNotMatch(notes[1].note.text, /Lo que te avisé hoy/, 'Rodny had no notices today');
  assert.deepEqual(notes[0].note.metadata, { note: 'CIERRE_DIA', dayKey: '2026-10-13' });
  assert.deepEqual(notices.map((n) => [n.userId, n.type, n.relatedId, n.message]), [['u-kamila', DAILY_CLOSE_NOTIFICATION, 'c-1', 'Bria dejó tu cierre del día en el chat.'], ['u-rodny', DAILY_CLOSE_NOTIFICATION, 'c-2', 'Bria dejó tu cierre del día en el chat.']]);
  assert.deepEqual(await build({ nowIso: '2026-10-13T23:30:00Z', repository, notes, notices }).service.runAutomatic(), { dayKey: '2026-10-13', delivered: 0, already: 2, failed: 0 });
  assert.equal(notes.length, 2);
});

test('a notice that fails never undoes the delivery, and the scheduler ticks every 10 minutes without overlapping', async () => {
  const { service, repository } = build({ nowIso: '2026-10-13T22:30:00Z', failNotify: true });
  assert.deepEqual(await service.runAutomatic(), { dayKey: '2026-10-13', delivered: 2, already: 0, failed: 0 });
  assert.equal(repository.deliveries.size, 2);
  const timers = [];
  const tick = initDailyCloseScheduler({ service: { runAutomatic: async () => ({ skipped: 'x' }) }, setIntervalFn: (fn, ms) => { timers.push(['interval', ms]); return { unref() {} }; }, setTimeoutFn: (fn, ms) => { timers.push(['timeout', ms]); return { unref() {} }; }, logger: { log: () => {}, error: () => {} } });
  assert.deepEqual(timers, [['timeout', 120_000], ['interval', 10 * 60_000]]);
  await tick();
});

test('the close shows above the mascot like the weekly focus, the bell opens its chat, start-up schedules it, and the side table is registered', () => {
  const rows = buildNudges({ people: [], now: new Date('2026-10-13T22:10:00Z'), dailyClose: { conversationId: 'c-9', dayKey: '2026-10-13' }, weeklyFocus: { conversationId: 'c-1', weekKey: '2026-W42' } });
  assert.deepEqual(rows.map((r) => [r.kind, r.key]), [['CIERRE_DIA', 'CIERRE_DIA:2026-10-13'], ['FOCO_SEMANAL', 'FOCO_SEMANAL:2026-W42']], 'today’s close goes first, then the week');
  assert.deepEqual(rows[0].actions, [{ label: 'Leer en Bria', conversationId: 'c-9' }]);
  assert.equal(rows[0].title, 'Bria dejó tu cierre del día.');
  assert.deepEqual(nudgeActions({ kind: 'CIERRE_DIA', conversationId: 'c-9' }), [{ label: 'Leer en Bria', conversationId: 'c-9' }]);
  assert.equal(isValidNudgeKey('CIERRE_DIA:2026-10-13'), true);
  assert.equal(buildNudges({ people: [], now: new Date('2026-10-13T22:10:00Z'), dailyClose: { conversationId: 'c-9', dayKey: '2026-10-13' }, dismissedKeys: new Set(['CIERRE_DIA:2026-10-13']) }).length, 0, 'the X hides it for the day');
  const layout = readFileSync('src/components/layout/AppLayout.jsx', 'utf8');
  assert.match(layout, /notif\.type === 'BRIA_FOCO_SEMANAL' \|\| notif\.type === 'BRIA_CIERRE_DEL_DIA'/);
  assert.match(readFileSync('src/utils/notificationUtils.js', 'utf8'), /BRIA_CIERRE_DEL_DIA[\s\S]*Tu cierre del día está listo/);
  assert.match(readFileSync('server.js', 'utf8'), /initDailyCloseScheduler\(\);/);
  assert.match(readFileSync('src/services/briaNudgeService.js', 'utf8'), /dailyCloseDelivery\(/, 'the card reads the delivery of today');
  assert.match(readFileSync('scripts/sql/bria-proactive.sql', 'utf8'), /CREATE TABLE IF NOT EXISTS bria_memory\.daily_close_deliveries/);
  assert.match(readFileSync('docs/BASE_DE_DATOS_LATERAL.md', 'utf8'), /`daily_close_deliveries`/);
  assert.match(readFileSync('prisma/schema.prisma', 'utf8'), /daily_close_deliveries/);
});
