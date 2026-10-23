import test from 'node:test';
import assert from 'node:assert/strict';
import { correctionProblem, correctionPlan, formatTimeCorrectionContent, timeCorrectionPresentation, TIME_CORRECTION_EVENT_TYPE, TIME_CORRECTION_REASONS } from '../src/lib/taskWorkCorrection.js';
import { createTaskWorkCorrectionService } from '../src/services/taskWorkCorrectionService.js';
import { getTaskSystemEventPresentation } from '../src/lib/taskTiming.js';

// Corregir el tiempo de una tarea (Rodny, 23 de octubre de 2026: «como admin debo tener el permiso final de corregir
// el tiempo de una tarea, porque sigue pasando que la gente se olvida … para que los tiempos sigan siendo adecuados»).
// Solo administradores, con motivo, solo para acortar, guardando el tiempo original y diciéndolo en la tarea.

const H = 3_600_000, M = 60_000;
const admin = { userId: 'u-rodny', id: 'u-rodny', role: 'ADMIN', name: 'Rodny Chirinos' };
const now = new Date('2026-10-23T15:00:00Z');
const closed = { id: 's1', taskId: 't1', startedAt: new Date('2026-10-22T14:00:00Z'), endedAt: new Date('2026-10-22T23:12:00Z'), durationMs: 9 * H + 12 * M, closeReason: 'PAUSED', isCollaborator: false, originalDurationMs: null };
const running = { id: 's2', taskId: 't1', startedAt: new Date('2026-10-22T20:00:00Z'), endedAt: null, durationMs: null, closeReason: null, isCollaborator: false, originalDurationMs: null };
const task = { id: 't1', title: 'Reel de Aristea', status: 'PENDIENTE', startedAt: null, accumulatedWorkMs: 10 * H, _count: { collaborators: 0 } };

test('solo un administrador corrige, con motivo, y solo para acortar un tiempo que se pasó', () => {
  const base = { user: admin, session: closed, durationMs: 90 * M, reason: 'Se le olvidó pausar al salir', now };
  assert.equal(correctionProblem(base), null);
  assert.match(correctionProblem({ ...base, user: { ...admin, role: 'PROJECT_MANAGER' } }), /administradores/);
  assert.match(correctionProblem({ ...base, reason: ' ' }), /por qué/);
  assert.match(correctionProblem({ ...base, reason: 'x'.repeat(301) }), /300/);
  assert.match(correctionProblem({ ...base, durationMs: 30_000 }), /al menos un minuto/);
  assert.match(correctionProblem({ ...base, durationMs: 10 * H }), /solo acorta.*9 h 12 min/);
  assert.match(correctionProblem({ ...base, session: null }), /ya no existe/);
  assert.match(correctionProblem({ ...base, session: running, durationMs: 20 * H }), /solo acorta/, 'un reloj que corre no se alarga más de lo que lleva');
});

test('una sesión cerrada se acorta y el total de la tarea baja lo mismo; la original queda guardada', () => {
  const plan = correctionPlan({ task, session: closed, durationMs: 90 * M, reason: 'Se le olvidó pausar', actorId: 'u-rodny', now });
  assert.equal(plan.session.durationMs, 90 * M);
  assert.equal(plan.session.endedAt.toISOString(), '2026-10-22T15:30:00.000Z');
  assert.equal(plan.session.originalDurationMs, 9 * H + 12 * M);
  assert.equal(plan.session.closeReason, 'PAUSED');
  assert.deepEqual([plan.session.correctedById, plan.session.correctionReason], ['u-rodny', 'Se le olvidó pausar']);
  assert.deepEqual(plan.task, { accumulatedWorkMs: 10 * H - (9 * H + 12 * M - 90 * M) });
  // Corregir dos veces conserva el primer tiempo original, no el ya corregido.
  const again = correctionPlan({ task, session: { ...closed, durationMs: 90 * M, originalDurationMs: 9 * H + 12 * M }, durationMs: H, reason: 'Ajuste', actorId: 'u-rodny', now });
  assert.equal(again.session.originalDurationMs, 9 * H + 12 * M);
});

test('un reloj que sigue corriendo se cierra con el tiempo real; la tarea de una persona vuelve a Pendiente', () => {
  const inProgress = { ...task, status: 'EN_CURSO', startedAt: running.startedAt, accumulatedWorkMs: 2 * H };
  const plan = correctionPlan({ task: inProgress, session: running, durationMs: 2 * H, reason: 'Se fue sin pausar', actorId: 'u-rodny', now });
  assert.deepEqual([plan.wasRunning, plan.session.closeReason, plan.session.endedAt.toISOString()], [true, 'CORRECTED', '2026-10-22T22:00:00.000Z']);
  assert.equal(plan.session.originalDurationMs, 19 * H, 'lo que había corrido hasta que se corrigió');
  assert.deepEqual(plan.task, { accumulatedWorkMs: 4 * H, startedAt: null, status: 'PENDIENTE' });
  const team = correctionPlan({ task: { ...inProgress, _count: { collaborators: 2 } }, session: running, durationMs: 2 * H, reason: 'x x', actorId: 'u-rodny', now });
  assert.deepEqual(team.task, { accumulatedWorkMs: 4 * H, startedAt: null }, 'en una tarea con equipo el reloj se pausa y la tarea sigue en proceso');
  const collaborator = correctionPlan({ task: inProgress, session: { ...running, isCollaborator: true }, durationMs: H, reason: 'x x', actorId: 'u-rodny', now });
  assert.equal(collaborator.task, null, 'el reloj de un colaborador no es el de la tarea');
});

test('la novedad de la tarea dice de cuánto a cuánto y el motivo, con su propia etiqueta', () => {
  const content = formatTimeCorrectionContent({ fromMs: 9 * H + 12 * M, toMs: 90 * M, reason: 'Se le olvidó pausar', wasRunning: false });
  assert.equal(content, '[TIME_CORRECTION:33120000>5400000]\nSe le olvidó pausar');
  assert.deepEqual(timeCorrectionPresentation(content), { badgeLabel: 'De 9 h 12 min a 1 h 30 min', note: 'Se le olvidó pausar' });
  assert.deepEqual(getTaskSystemEventPresentation(TIME_CORRECTION_EVENT_TYPE, content), { badgeLabel: 'De 9 h 12 min a 1 h 30 min', note: 'Se le olvidó pausar' });
  const stopped = formatTimeCorrectionContent({ fromMs: 19 * H, toMs: 2 * H, reason: 'Se fue sin pausar', wasRunning: true });
  assert.match(timeCorrectionPresentation(stopped).note, /^Se fue sin pausar\n\nEl reloj quedó detenido/);
});

test('las piezas que la sostienen: ruta con su guardián, columna aditiva en el arranque, mapa de Bria y pantalla solo para administradores', async () => {
  const { readFile } = await import('node:fs/promises');
  const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  const [routes, pkg, catalog, history, panel, completed] = await Promise.all([read('src/routes/index.js'), read('package.json'), read('src/lib/platformCatalog.js'), read('src/components/modules/TaskWorkHistory.jsx'), read('src/components/modules/TaskSidePanel.jsx'), read('src/components/modules/CompletedTasksHistoryModal.jsx')]);
  // Rodny, 23 de octubre de 2026: en el historial de logros no aparecía «Corregir». Todo sitio que dibuja el historial
  // de tiempo le dice quién mira, o el botón no sale.
  for (const [name, source] of [['TaskSidePanel', panel], ['CompletedTasksHistoryModal', completed]]) {
    assert.match(source, /<TaskWorkHistory[\s\S]*?currentUser=\{currentUser\}[\s\S]*?onCorrected=/, `${name} pasa quién mira y qué hacer al corregir`);
  }
  assert.match(routes, /router\.post\('\/tasks\/:taskId\/work-sessions\/:sessionId\/correction', guardTask, taskController\.correctTaskWorkSessionHandler\)/, 'un pendiente privado sigue cerrado también para quien corrige');
  assert.match(pkg, /ensure-task-work-correction-schema\.js/);
  assert.match(catalog, /'POST \/tasks\/:taskId\/work-sessions\/:sessionId\/correction'/);
  assert.match(history, /canCorrect = String\(currentUser\?\.role \|\| ''\)\.toUpperCase\(\) === 'ADMIN'/);
  assert.match(history, /z-\[131\]/, 'el diálogo queda por encima del panel de la tarea');
  // Los motivos se eligen (Rodny, 23 de octubre de 2026): el más común viene elegido y «Otro motivo» abre el texto.
  assert.equal(TIME_CORRECTION_REASONS[0], 'Se le olvidó pausar al salir');
  assert.match(history, /useState\(TIME_CORRECTION_REASONS\[0\]\)/);
  assert.match(history, /<Select id="time-correction-reason"/, 'el desplegable compartido de la plataforma, no un select a mano');
  assert.match(history, /choice === TIME_CORRECTION_OTHER && \(/);
  assert.match(panel, /\[TIME_CORRECTION_EVENT_TYPE\]: \{/, 'la novedad tiene su tarjeta en la tarea');
});

const fakeDb =({ session = closed, current = task } = {}) => {
  const writes = [];
  const tx = {
    taskWorkSession: { findFirst: async ({ where }) => (where.id === session?.id && where.taskId === session.taskId ? session : null), update: async (args) => { writes.push(['session', args]); return { ...session, ...args.data }; } },
    task: { findUnique: async () => current, update: async (args) => { writes.push(['task', args]); return { ...current, ...args.data }; } },
    taskComment: { create: async (args) => { writes.push(['comment', args]); return args.data; } }
  };
  return { writes, transaction: async (work) => work(tx) };
};

test('el servicio escribe sesión, tarea y novedad en una sola transacción, y rechaza con su motivo', async () => {
  const { writes, transaction } = fakeDb();
  const out = await createTaskWorkCorrectionService({ transaction, now: () => now }).correct({ user: admin, taskId: 't1', sessionId: 's1', durationMinutes: 90, reason: 'Se le olvidó pausar' });
  assert.deepEqual(writes.map(([kind]) => kind), ['session', 'task', 'comment']);
  assert.equal(writes[0][1].data.durationMs, 90 * M);
  assert.equal(writes[2][1].data.type, TIME_CORRECTION_EVENT_TYPE);
  assert.equal(writes[2][1].data.authorId, 'u-rodny');
  assert.equal(out.message, 'Tiempo corregido en «Reel de Aristea»: de 9 h 12 min a 1 h 30 min.');
  const pm = createTaskWorkCorrectionService({ transaction: fakeDb().transaction, now: () => now });
  await assert.rejects(() => pm.correct({ user: { ...admin, role: 'PROJECT_MANAGER' }, taskId: 't1', sessionId: 's1', durationMinutes: 90, reason: 'x x' }), { status: 403 });
  await assert.rejects(() => pm.correct({ user: admin, taskId: 't1', sessionId: 'otra', durationMinutes: 90, reason: 'x x' }), { status: 404 });
  await assert.rejects(() => pm.correct({ user: admin, taskId: 't1', sessionId: 's1', durationMinutes: 600, reason: 'x x' }), { status: 400, message: /solo acorta/ });
});
