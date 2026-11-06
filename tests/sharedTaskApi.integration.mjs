import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createSharedTaskApiFixture } from './support/sharedTaskApiFixture.js';
import { SHARED_TEST_DATABASE_URL, sharedTaskOutput } from './support/sharedTaskSandbox.js';

// Fuera del glob ordinario: siempre usa la base dedicada, nunca una variable de producción.
let f;
before(async () => { f = await createSharedTaskApiFixture(); });
after(async () => { if (f) {
  await writeFile(path.join(sharedTaskOutput, 'api-acceptance.log'), f.api.logs());
  await writeFile(path.join(sharedTaskOutput, 'api-fixtures.json'), JSON.stringify({ runId: f.runId, clientId: f.client.id,
    members: Object.fromEntries(Object.entries(f.actors).map(([key, row]) => [key, row.memberId])),
    tasks: await f.db.task.findMany({ where: { clientId: f.client.id }, select: { id: true, title: true, status: true } }) }, null, 2));
  await f.close();
} });
const part = (task, key) => f.participation(task, key);
const move = async (...args) => (await f.move(...args)).data;

test('los cambios cotidianos de participación no publican comentarios y conservan la auditoría', async () => {
  let task = await f.createTask('Aceptación · conversación sin mensajes de estado');
  const initialComments = await f.db.taskComment.count({ where: { taskId: task.id } });
  for (const [key, status] of [['bea', 'EN_CURSO'], ['bea', 'PENDIENTE'], ['bea', 'EN_CURSO'],
    ['bea', 'REALIZADA'], ['ana', 'REALIZADA'], ['carlos', 'REALIZADA']]) {
    task = await move(task, key, status);
    assert.equal(await f.db.taskComment.count({ where: { taskId: task.id } }), initialComments,
      `${key}: ${status} no debe escribir en la conversación`);
  }
  assert.equal(task.status, 'REALIZADA');
  assert.equal(await f.db.operationalTraceEvent.count({ where: { taskId: task.id, eventType: 'TASK_PARTICIPATION_CHANGED' } }), 6);
  assert.equal(await f.db.taskWorkSession.count({ where: { taskId: task.id, endedAt: null } }), 0);
  assert.equal(await f.db.taskWorkSession.count({ where: { taskId: task.id, workerId: f.actors.bea.memberId } }), 2);
});

test('editar datos o integrantes no publica comentarios y permite los comentarios humanos', async () => {
  let task = await f.createTask('Aceptación · edición sin comentarios automáticos');
  assert.equal(await f.db.taskComment.count({ where: { taskId: task.id } }), 0);
  task = (await f.request('manager', `/tasks/${task.id}`, { method: 'PATCH', body: {
    collaboratorIds: [f.actors.bea.memberId], expectedRosterVersion: task.rosterVersion,
  } })).data;
  task = (await f.request('manager', `/tasks/${task.id}`, { method: 'PATCH', body: {
    collaboratorIds: [f.actors.bea.memberId, f.actors.carlos.memberId], expectedRosterVersion: task.rosterVersion,
    title: 'Aceptación · título corregido', comments: 'Descripción corregida',
  } })).data;
  assert.equal(await f.db.taskComment.count({ where: { taskId: task.id } }), 0);
  await f.request('bea', `/tasks/${task.id}/comments`, { method: 'POST', expected: 201,
    body: { content: 'Comentario escrito por Bea.' } });
  const comments = await f.db.taskComment.findMany({ where: { taskId: task.id } });
  assert.equal(comments.length, 1);
  assert.equal(comments[0].type, 'human');
  assert.equal(comments[0].content, 'Comentario escrito por Bea.');
});

test('una Task real conserva tres estados, relojes y cierres personales al recargar', async () => {
  let task = await f.createTask('Aceptación · tres personas y una tarea');
  assert.equal(task.sharedProgress, true);
  assert.equal(task.participants.length, 3);
  assert.equal(await f.db.task.count({ where: { id: task.id } }), 1);
  task = await move(task, 'ana', 'EN_CURSO');
  const first = await f.db.taskWorkSession.findMany({ where: { taskId: task.id, endedAt: null } });
  assert.equal(first.length, 1); assert.equal(first[0].workerId, f.actors.ana.memberId);
  assert.equal(part(task, 'bea').status, 'PENDIENTE'); assert.equal(part(task, 'carlos').startedAt, null);
  task = await move(task, 'bea', 'EN_CURSO');
  task = await move(task, 'ana', 'REALIZADA');
  assert.equal(task.status, 'EN_CURSO'); assert.equal(task.completedAt, null);
  assert.ok(part(task, 'ana').completedAt); assert.equal(part(task, 'bea').status, 'EN_CURSO');
  assert.equal(part(task, 'carlos').status, 'PENDIENTE');
  assert.equal(task.participationTransition.globalCompleted, false);
  const sessions = await f.db.taskWorkSession.findMany({ where: { taskId: task.id } });
  const ana = sessions.find(s => s.workerId === f.actors.ana.memberId), bea = sessions.find(s => s.workerId === f.actors.bea.memberId);
  assert.ok(ana.endedAt); assert.equal(bea.endedAt, null);
  assert.equal(ana.durationMs, ana.endedAt.getTime() - ana.startedAt.getTime());
  const refreshed = await f.loadTask(task.id, 'bea');
  assert.equal(part(refreshed, 'ana').status, 'REALIZADA');
  assert.equal(part(refreshed, 'ana').accumulatedWorkMs, ana.durationMs);
  assert.ok(part(refreshed, 'bea').startedAt);
});

test('la misma revisión compite una sola vez y el no-op no duplica trabajo', async () => {
  const task = await f.createTask('Aceptación · dos dispositivos de Bea');
  const responses = await Promise.all([f.move(task, 'bea', 'EN_CURSO', {}, 'bea', null), f.move(task, 'bea', 'EN_CURSO', {}, 'bea', null)]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
  const saved = responses.find(r => r.status === 200).data;
  await move(saved, 'bea', 'EN_CURSO');
  assert.equal(await f.db.taskWorkSession.count({ where: { taskId: task.id, workerId: f.actors.bea.memberId, endedAt: null } }), 1);
  assert.equal(await f.db.operationalTraceEvent.count({ where: { taskId: task.id, eventType: 'TASK_PARTICIPATION_CHANGED' } }), 1);
  await f.move(task, 'bea', 'REALIZADA', {}, 'bea', 409);
});

test('dos últimos cierres simultáneos producen una publicación, un ciclo cerrado y evidencia personal de ambos', async () => {
  const plan = await f.db.contentPlan.create({ data: { clientId: f.client.id, ownerId: f.actors.manager.memberId, month: 11, year: 2026 } });
  const item = await f.db.contentItem.create({ data: { planId: plan.id, objective: 'Pieza ficticia concurrente', format: 'Post', copyText: 'Texto ficticio', captionText: 'Texto ficticio', publishDate: new Date('2026-11-30T15:00:00Z'), status: 'EN_PRODUCCION' } });
  let task = await f.createTask('[Producción] Post: Pieza ficticia concurrente', { contentItemId: item.id });
  const detail = (await f.request('bea', `/tasks/${task.id}`)).data;
  assert.equal(detail.id, task.id);
  for (const field of ['shareToken', 'internalNotes', 'briaReviewLeaseToken']) assert.equal(Object.hasOwn(detail.contentItem.plan, field), false, `el plan operativo omite ${field}`);
  task = await move(task, 'ana', 'EN_CURSO'); task = await move(task, 'ana', 'REALIZADA');
  const starts = await Promise.all([f.move(task, 'bea', 'EN_CURSO'), f.move(task, 'carlos', 'EN_CURSO')]);
  assert.ok(starts.every(r => r.status === 200));
  task = await f.loadTask(task.id);
  assert.equal(await f.db.task.count({ where: { contentItemId: item.id, title: { startsWith: '[Publicar]' } } }), 0);
  const finishes = await Promise.all([f.move(task, 'bea', 'REALIZADA'), f.move(task, 'carlos', 'REALIZADA')]);
  assert.equal(finishes.filter(r => r.data.participationTransition.globalCompleted).length, 1);
  const final = await f.loadTask(task.id);
  assert.equal(final.status, 'REALIZADA'); assert.ok(final.completedAt);
  assert.ok(final.participants.every(p => p.status === 'REALIZADA' && p.completedAt));
  assert.equal(await f.db.taskWorkCycle.count({ where: { taskId: task.id, closedAt: { not: null } } }), 1);
  assert.equal(await f.db.taskWorkSession.count({ where: { taskId: task.id, endedAt: null } }), 0);
  assert.equal(await f.db.task.count({ where: { contentItemId: item.id, title: { startsWith: '[Publicar]' } } }), 1);
  assert.equal((await f.db.contentItem.findUnique({ where: { id: item.id } })).status, 'REALIZADO');
  for (const key of ['ana', 'bea', 'carlos']) {
    const rows = await f.db.operationalTraceEvent.findMany({ where: { taskId: task.id, subjectUserId: f.actors[key].id, eventType: 'TASK_PARTICIPATION_CHANGED' } });
    assert.equal(rows.filter(row => row.metadata?.toStatus === 'REALIZADA').length, 1);
  }
});

test('devolver, reintegrar y reabrir conserva las otras partes y aplica permisos reales', async () => {
  let task = await f.createTask('Aceptación · devolver y reabrir');
  task = await move(task, 'ana', 'EN_CURSO'); task = await move(task, 'bea', 'EN_CURSO');
  task = await move(task, 'ana', 'REALIZADA');
  const doneAt = part(task, 'ana').completedAt;
  await f.move(task, 'bea', 'DEVUELTA', {}, 'bea', 400);
  task = await move(task, 'bea', 'DEVUELTA', { returnReason: 'INCOMPLETE_DELIVERABLE', returnNote: 'Falta una revisión ficticia.' });
  assert.equal(task.status, 'DEVUELTA'); assert.equal(part(task, 'ana').completedAt, doneAt);
  assert.equal(part(task, 'bea').returnCount, 1);
  await f.move(task, 'bea', 'EN_CURSO', { reintegrateReason: 'Se completó el insumo ficticio.' }, 'bea', 403);
  task = await move(task, 'bea', 'EN_CURSO', { reintegrateReason: 'Se completó el insumo ficticio.' }, 'manager');
  assert.equal(part(task, 'ana').status, 'REALIZADA'); assert.equal(task.status, 'EN_CURSO');
  task = await move(task, 'ana', 'PENDIENTE', { reopenReason: 'CLIENT_CORRECTION', reopenNote: 'Corrección ficticia solicitada.' }, 'carlos');
  assert.equal(part(task, 'ana').completedAt, null); assert.equal(part(task, 'bea').status, 'EN_CURSO');
  assert.equal(await f.db.taskWorkSession.count({ where: { taskId: task.id, workerId: f.actors.bea.memberId, endedAt: null } }), 1);
  await f.move(task, 'ana', 'EN_CURSO', {}, 'outside', 403);
  const comments = await f.db.taskComment.findMany({ where: { taskId: task.id }, orderBy: { createdAt: 'asc' } });
  assert.deepEqual(comments.map(row => row.type), ['system_return', 'system_reintegrate', 'system_reopen']);
  assert.match(comments[0].content, /Falta una revisión ficticia/);
  assert.match(comments[1].content, /Se completó el insumo ficticio/);
  assert.match(comments[2].content, /Corrección ficticia solicitada/);
});

test('la ruta real protege una tarea privada incluso frente a quien ve su cabecera', async () => {
  const task = await f.createTask('Aceptación · cuerpo privado ficticio', { isPrivate: true, comments: 'Contenido privado solo de prueba' });
  const listed = await f.loadTask(task.id, 'outside');
  assert.equal(listed.isLocked, true); assert.equal(Object.hasOwn(listed, 'comments'), false);
  const response = await f.request('outside', `/tasks/${task.id}/participants/${f.actors.bea.memberId}`, { method: 'PATCH', expected: null,
    body: { status: 'EN_CURSO', expectedRevision: 0, expectedRosterVersion: task.rosterVersion } });
  assert.ok([403, 404].includes(response.status));
  assert.equal(await f.db.taskWorkSession.count({ where: { taskId: task.id } }), 0);
});

test('un fallo SQL al cierre global revierte parte, sesión, ciclo, publicación y evidencia', async () => {
  const plan = await f.db.contentPlan.create({ data: { clientId: f.client.id, ownerId: f.actors.manager.memberId, month: 11, year: 2026 } });
  const item = await f.db.contentItem.create({ data: { planId: plan.id, objective: 'Pieza ficticia rollback', format: 'Post', copyText: 'Texto ficticio', captionText: 'Texto ficticio', publishDate: new Date('2026-11-30T15:00:00Z'), status: 'EN_PRODUCCION' } });
  let task = await f.createTask('[Producción] Post: Pieza ficticia rollback', { contentItemId: item.id });
  for (const key of ['ana', 'bea']) { task = await move(task, key, 'EN_CURSO'); task = await move(task, key, 'REALIZADA'); }
  task = await move(task, 'carlos', 'EN_CURSO');
  const before = await f.db.task.findUnique({ where: { id: task.id }, include: { collaborators: true, workSessions: true, workCycles: true } });
  // PLATFORM_MUTATION se escribe tras res.finish: no pertenece a esta transacción.
  const traces = await f.db.operationalTraceEvent.count({ where: { taskId: task.id, eventType: 'TASK_PARTICIPATION_CHANGED' } });
  const comments = await f.db.taskComment.count({ where: { taskId: task.id } });
  assert.match(task.id, /^[a-z0-9-]+$/i);
  const sql = new pg.Client({ connectionString: SHARED_TEST_DATABASE_URL }); await sql.connect();
  try {
    await sql.query(`CREATE FUNCTION shared_task_fail_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id = '${task.id}' AND NEW.status = 'REALIZADA' THEN RAISE EXCEPTION 'Fallo deliberado de aceptación local'; END IF; RETURN NEW; END $$`);
    await sql.query('CREATE TRIGGER shared_task_fail_commit BEFORE UPDATE ON "Task" FOR EACH ROW EXECUTE FUNCTION shared_task_fail_commit()');
    const response = await f.move(task, 'carlos', 'REALIZADA', {}, 'carlos', null);
    assert.ok(response.status >= 400, 'un fallo de persistencia nunca entrega éxito');
    const after = await f.db.task.findUnique({ where: { id: task.id }, include: { collaborators: true, workSessions: true, workCycles: true } });
    assert.deepEqual(after, before);
    assert.equal(await f.db.operationalTraceEvent.count({ where: { taskId: task.id, eventType: 'TASK_PARTICIPATION_CHANGED' } }), traces);
    assert.equal(await f.db.taskComment.count({ where: { taskId: task.id } }), comments);
    assert.equal(await f.db.task.count({ where: { contentItemId: item.id, title: { startsWith: '[Publicar]' } } }), 0);
    assert.equal((await f.db.contentItem.findUnique({ where: { id: item.id } })).status, 'EN_PRODUCCION');
  } finally {
    await sql.query('DROP TRIGGER IF EXISTS shared_task_fail_commit ON "Task"');
    await sql.query('DROP FUNCTION IF EXISTS shared_task_fail_commit()');
    await sql.end();
  }
});

test('promover y retirar conserva identidades, relojes e historial y rechaza roster obsoleto', async () => {
  let task = await f.createTask('Aceptación · promoción y retiro');
  task = await move(task, 'ana', 'EN_CURSO'); task = await move(task, 'bea', 'EN_CURSO'); task = await move(task, 'bea', 'REALIZADA');
  const before = task, completedAt = part(task, 'bea').completedAt;
  const running = await f.db.taskWorkSession.findFirst({ where: { taskId: task.id, workerId: f.actors.ana.memberId, endedAt: null } });
  task = (await f.request('manager', `/tasks/${task.id}`, { method: 'PATCH', body: { assigneeId: f.actors.bea.memberId,
    collaboratorIds: [f.actors.ana.memberId, f.actors.carlos.memberId], expectedRosterVersion: task.rosterVersion } })).data;
  assert.equal(part(task, 'bea').role, 'ASSIGNEE'); assert.equal(part(task, 'bea').completedAt, completedAt);
  assert.equal(part(task, 'ana').status, 'EN_CURSO'); assert.ok(task.rosterVersion > before.rosterVersion);
  assert.equal((await f.db.taskWorkSession.findUnique({ where: { id: running.id } })).endedAt, null);
  await f.move(before, 'ana', 'PENDIENTE', {}, 'ana', 409);
  task = (await f.request('manager', `/tasks/${task.id}`, { method: 'PATCH', body: {
    collaboratorIds: [f.actors.carlos.memberId], expectedRosterVersion: task.rosterVersion } })).data;
  assert.equal(part(task, 'ana'), undefined);
  const ended = await f.db.taskWorkSession.findUnique({ where: { id: running.id } });
  assert.ok(ended.endedAt); assert.equal(ended.workerId, f.actors.ana.memberId);
  task = (await f.request('manager', `/tasks/${task.id}`, { method: 'PATCH', body: {
    collaboratorIds: [f.actors.carlos.memberId, f.actors.outside.memberId], expectedRosterVersion: task.rosterVersion } })).data;
  assert.equal(part(task, 'outside').status, 'PENDIENTE'); assert.equal(part(task, 'outside').accumulatedWorkMs, 0);
});

test('quitar al último incompleto no cierra la tarea y el roster cerrado exige reabrir', async () => {
  let task = await f.createTask('Aceptación · no cerrar por retirada');
  task = await move(task, 'ana', 'REALIZADA'); task = await move(task, 'bea', 'REALIZADA');
  await f.request('manager', `/tasks/${task.id}`, { method: 'PATCH', expected: 409, body: {
    collaboratorIds: [f.actors.bea.memberId], expectedRosterVersion: task.rosterVersion } });
  assert.equal(await f.db.taskCollaborator.count({ where: { taskId: task.id } }), 2);
  task = await move(task, 'carlos', 'REALIZADA');
  await f.request('manager', `/tasks/${task.id}`, { method: 'PATCH', expected: 409, body: {
    collaboratorIds: [f.actors.bea.memberId], expectedRosterVersion: task.rosterVersion } });
});

test('tiempo declarado y listado de logros identifican la participación propia sin cerrar a los demás', async () => {
  let task = await f.createTask('Aceptación · logro y tiempo propio');
  task = await move(task, 'ana', 'REALIZADA');
  assert.equal(task.needsDeclaredTime, true);
  const body = { minutes: 15, participantMemberId: f.actors.ana.memberId, expectedRevision: part(task, 'ana').revision };
  await f.request('bea', `/tasks/${task.id}/declared-time`, { method: 'POST', expected: 403, body });
  await f.request('ana', `/tasks/${task.id}/declared-time`, { method: 'POST', expected: 409, body: { ...body, expectedRevision: -1 } });
  const declared = await f.request('ana', `/tasks/${task.id}/declared-time`, { method: 'POST', body });
  assert.equal(declared.data.participantMemberId, f.actors.ana.memberId); assert.equal(declared.data.declaredMs, 900_000);
  const sessions = await f.db.taskWorkSession.findMany({ where: { taskId: task.id } });
  assert.equal(sessions.length, 1); assert.equal(sessions[0].workerId, f.actors.ana.memberId); assert.equal(sessions[0].durationMs, 900_000);
  const completed = (await f.request('ana', '/tasks/completed')).data.filter(row => row.id === task.id);
  assert.equal(completed.length, 1); assert.equal(completed[0].participantMemberId, f.actors.ana.memberId);
  assert.equal(completed[0].status, 'REALIZADA'); assert.notEqual(completed[0].globalStatus, 'REALIZADA');
  assert.equal((await f.loadTask(task.id)).completedAt, null);
});

test('corregir un reloj abierto de colaborador pausa solo su participación y conserva el reloj ajeno', async () => {
  let task = await f.createTask('Aceptación · corregir reloj abierto');
  task = await move(task, 'ana', 'EN_CURSO'); task = await move(task, 'bea', 'EN_CURSO');
  const revision = part(task, 'bea').revision;
  const ana = await f.db.taskWorkSession.findFirst({ where: { taskId: task.id, workerId: f.actors.ana.memberId, endedAt: null } });
  const bea = await f.db.taskWorkSession.findFirst({ where: { taskId: task.id, workerId: f.actors.bea.memberId, endedAt: null } });
  await f.request('manager', `/tasks/${task.id}/work-sessions/${bea.id}/correction`, { method: 'POST', body: { durationMinutes: 5, reason: 'Reloj ficticio corregido por dirección.' } });
  task = await f.loadTask(task.id);
  assert.equal(part(task, 'bea').status, 'PENDIENTE'); assert.equal(part(task, 'bea').revision, revision + 1);
  assert.equal(part(task, 'bea').startedAt, null); assert.equal(part(task, 'bea').accumulatedWorkMs, 300_000);
  assert.equal(part(task, 'ana').status, 'EN_CURSO'); assert.equal(task.status, 'EN_CURSO');
  assert.deepEqual(await f.db.taskWorkSession.findUnique({ where: { id: ana.id } }), ana);
});

test('corregir una sesión histórica del exresponsable no altera el total ni estado del responsable nuevo', async () => {
  let task = await f.createTask('Aceptación · corrección tras reasignar');
  task = await move(task, 'ana', 'EN_CURSO'); task = await move(task, 'ana', 'PENDIENTE');
  const oldSession = await f.db.taskWorkSession.findFirst({ where: { taskId: task.id, workerId: f.actors.ana.memberId } });
  task = (await f.request('manager', `/tasks/${task.id}`, { method: 'PATCH', body: { assigneeId: f.actors.bea.memberId,
    collaboratorIds: [f.actors.ana.memberId, f.actors.carlos.memberId], expectedRosterVersion: task.rosterVersion } })).data;
  const before = await f.db.task.findUnique({ where: { id: task.id } });
  await f.request('manager', `/tasks/${task.id}/work-sessions/${oldSession.id}/correction`, { method: 'POST', body: { durationMinutes: 7, reason: 'Corrección ficticia del trabajo anterior.' } });
  const after = await f.db.task.findUnique({ where: { id: task.id } });
  assert.equal(after.accumulatedWorkMs, before.accumulatedWorkMs);
  assert.equal(after.assigneeStatus, before.assigneeStatus);
  assert.equal(after.assigneeRevision, before.assigneeRevision);
  task = await f.loadTask(task.id);
  assert.equal(part(task, 'ana').accumulatedWorkMs, 420_000); assert.equal(part(task, 'bea').accumulatedWorkMs, 0);
});

test('el tiempo acumulado legado sin sesiones sobrevive a conversión y cambio de responsable sin fabricar tramos', async () => {
  const old = await f.db.task.create({ data: { title: 'Aceptación · tiempo legado sin tramos', clientId: f.client.id,
    assigneeId: f.actors.ana.memberId, creatorId: f.actors.manager.id, status: 'PENDIENTE', accumulatedWorkMs: 90_000,
    collaborators: { create: [{ memberId: f.actors.bea.memberId }, { memberId: f.actors.carlos.memberId }] } } });
  let task = await f.loadTask(old.id);
  assert.equal(part(task, 'ana').accumulatedWorkMs, 90_000); assert.equal(part(task, 'ana').completedAt, null);
  task = (await f.request('manager', `/tasks/${task.id}`, { method: 'PATCH', body: { assigneeId: f.actors.bea.memberId,
    collaboratorIds: [f.actors.ana.memberId, f.actors.carlos.memberId], expectedRosterVersion: task.rosterVersion } })).data;
  assert.equal(part(task, 'ana').accumulatedWorkMs, 90_000); assert.equal(part(task, 'bea').accumulatedWorkMs, 0);
  assert.equal(await f.db.taskWorkSession.count({ where: { taskId: task.id } }), 0);
  assert.ok(task.participants.every(p => p.completedAt == null));
});

test('retirar definitivamente al exresponsable conserva saldo y cierre en archivo sin pasarlos al nuevo', async () => {
  const old = await f.db.task.create({ data: { title: 'Aceptación · archivo de saldo y cierre personal', clientId: f.client.id,
    assigneeId: f.actors.ana.memberId, creatorId: f.actors.manager.id, status: 'PENDIENTE', accumulatedWorkMs: 90_000,
    isPrivate: true, comments: 'Detalle ficticio que el archivo no autoriza',
    collaborators: { create: [{ memberId: f.actors.bea.memberId }, { memberId: f.actors.carlos.memberId }] } } });
  let task = await f.loadTask(old.id);
  task = await move(task, 'ana', 'REALIZADA');
  const personal = part(task, 'ana');
  task = (await f.request('manager', `/tasks/${task.id}`, { method: 'PATCH', body: { assigneeId: f.actors.bea.memberId,
    collaboratorIds: [f.actors.carlos.memberId], expectedRosterVersion: task.rosterVersion } })).data;
  assert.equal(part(task, 'ana'), undefined); assert.equal(part(task, 'bea').accumulatedWorkMs, 0);
  const archives = await f.db.taskParticipationArchive.findMany({ where: { taskId: task.id, memberId: f.actors.ana.memberId } });
  assert.equal(archives.length, 1); assert.equal(archives[0].baselineWorkMs, 90_000);
  assert.equal(archives[0].completedAt.toISOString(), personal.completedAt); assert.equal(archives[0].status, 'REALIZADA');
  assert.equal(archives[0].userId, f.actors.ana.id);
  assert.equal(await f.db.taskWorkSession.count({ where: { taskId: task.id } }), 0);
  const locked = await f.loadTask(task.id, 'ana');
  assert.equal(locked.isLocked, true); assert.equal(Object.hasOwn(locked, 'comments'), false);
  await f.request('ana', `/tasks/${task.id}`, { expected: 403 });
  const authorized = await f.request('bea', `/tasks/${task.id}`);
  assert.equal(authorized.data.id, task.id); assert.equal(authorized.data.participants.length, 2);
  await f.request('ana', `/tasks/${task.id}/participants/${f.actors.ana.memberId}`, { method: 'PATCH', expected: 403,
    body: { status: 'PENDIENTE', expectedRevision: personal.revision, expectedRosterVersion: task.rosterVersion } });
  const completed = (await f.request('ana', '/tasks/completed')).data.filter(row => row.id === task.id && row.participantMemberId === f.actors.ana.memberId);
  assert.equal(completed.length, 1); assert.equal(completed[0].completedAt, personal.completedAt);
});

test('reabrir una parte con otra trabajando crea retrabajo personal sin sustituir el ciclo global inicial', async () => {
  let task = await f.createTask('Aceptación · retrabajo personal con ciclo abierto');
  task = await move(task, 'ana', 'EN_CURSO'); task = await move(task, 'bea', 'EN_CURSO');
  const bea = await f.db.taskWorkSession.findFirst({ where: { taskId: task.id, workerId: f.actors.bea.memberId, endedAt: null } });
  task = await move(task, 'ana', 'REALIZADA');
  task = await move(task, 'ana', 'PENDIENTE', { reopenReason: 'CLIENT_CORRECTION', reopenNote: 'Ajuste personal ficticio.' }, 'manager');
  task = await move(task, 'ana', 'EN_CURSO');
  const ana = await f.db.taskWorkSession.findFirst({ where: { taskId: task.id, workerId: f.actors.ana.memberId, endedAt: null } });
  assert.equal(ana.isRework, true); assert.equal(bea.isRework, false); assert.equal(ana.cycleId, bea.cycleId);
  assert.deepEqual(await f.db.taskWorkSession.findUnique({ where: { id: bea.id } }), bea);
  const cycle = await f.db.taskWorkCycle.findUnique({ where: { id: bea.cycleId } });
  assert.equal(cycle.kind, 'INITIAL'); assert.equal(cycle.closedAt, null);
  assert.equal(task.status, 'EN_CURSO'); assert.equal(part(task, 'carlos').status, 'PENDIENTE');
});

test('los caminos anteriores de estado y reloj no saltan el contrato personal', async () => {
  let task = await f.createTask('Aceptación · entradas anteriores bloqueadas');
  task = await move(task, 'ana', 'EN_CURSO');
  const before = await f.db.task.findUnique({ where: { id: task.id }, include: { collaborators: true, workSessions: true } });
  await f.request('manager', `/tasks/${task.id}`, { method: 'PATCH', expected: 409, body: { status: 'REALIZADA' } });
  await f.request('bea', `/tasks/${task.id}/work/start`, { method: 'POST', expected: 409, body: {} });
  await f.request('ana', `/tasks/${task.id}/work/pause`, { method: 'POST', expected: 409, body: {} });
  assert.deepEqual(await f.db.task.findUnique({ where: { id: task.id }, include: { collaborators: true, workSessions: true } }), before);
});

test('una tarea individual conserva el recorrido nativo sin participante obligatorio', async () => {
  let task = await f.createTask('Aceptación · regresión tarea individual', { collaboratorIds: [] });
  assert.equal(task.sharedProgress, false);
  task = (await f.request('ana', `/tasks/${task.id}`, { method: 'PATCH', body: { status: 'EN_CURSO' } })).data;
  assert.equal(task.status, 'EN_CURSO'); assert.ok(task.startedAt);
  task = (await f.request('ana', `/tasks/${task.id}`, { method: 'PATCH', body: { status: 'REALIZADA' } })).data;
  assert.equal(task.status, 'REALIZADA'); assert.ok(task.completedAt);
  assert.equal(await f.db.taskWorkSession.count({ where: { taskId: task.id, endedAt: null } }), 0);
});

test('retirar y reincorporar una parte no permite declarar tiempo con la revisión del cierre anterior', async () => {
  let task = await f.createTask('Aceptación · diálogo antiguo tras reincorporación');
  task = await move(task, 'bea', 'REALIZADA');
  const first = part(task, 'bea');
  task = (await f.request('manager', `/tasks/${task.id}`, { method: 'PATCH', body: {
    collaboratorIds: [f.actors.carlos.memberId], expectedRosterVersion: task.rosterVersion } })).data;
  task = (await f.request('manager', `/tasks/${task.id}`, { method: 'PATCH', body: {
    collaboratorIds: [f.actors.bea.memberId, f.actors.carlos.memberId], expectedRosterVersion: task.rosterVersion } })).data;
  assert.equal(part(task, 'bea').status, 'PENDIENTE'); assert.ok(part(task, 'bea').revision > first.revision);
  task = await move(task, 'bea', 'REALIZADA');
  const latest = part(task, 'bea'); assert.ok(latest.revision > first.revision);
  const body = { minutes: 15, participantMemberId: f.actors.bea.memberId, expectedRevision: first.revision };
  await f.request('bea', `/tasks/${task.id}/declared-time`, { method: 'POST', expected: 409, body });
  assert.equal(await f.db.taskWorkSession.count({ where: { taskId: task.id } }), 0);
  const accepted = await f.request('bea', `/tasks/${task.id}/declared-time`, { method: 'POST', body: { ...body, expectedRevision: latest.revision } });
  assert.equal(accepted.data.declaredMs, 900_000);
  const archived = await f.db.taskParticipationArchive.findMany({ where: { taskId: task.id, memberId: f.actors.bea.memberId } });
  assert.equal(archived.length, 1); assert.equal(archived[0].completedAt.toISOString(), first.completedAt);
  assert.equal(archived[0].revision, first.revision); assert.equal(archived[0].status, 'REALIZADA');
});

test('el foco propio bloquea empezar otra colaboración pero permite terminar la que ya trabajaba', async () => {
  const waiting = await f.createTask('Aceptación · colaboración pendiente durante foco');
  let working = await f.createTask('Aceptación · colaboración iniciada antes del foco');
  working = await move(working, 'bea', 'EN_CURSO');
  const focus = await f.createTask('Aceptación · compromiso propio de Bea', { assigneeId: f.actors.bea.memberId,
    collaboratorIds: [], focusDeadlineAt: new Date(Date.now() + 3_600_000).toISOString() });
  try {
    await f.move(waiting, 'bea', 'EN_CURSO', {}, 'bea', 423);
    assert.equal(await f.db.taskWorkSession.count({ where: { taskId: waiting.id } }), 0);
    assert.equal(part(await f.loadTask(waiting.id), 'bea').revision, part(waiting, 'bea').revision);
    working = await move(working, 'bea', 'REALIZADA');
    assert.equal(part(working, 'bea').status, 'REALIZADA');
  } finally {
    await f.request('manager', `/tasks/${focus.id}`, { method: 'PATCH', body: { status: 'REALIZADA' } });
  }
  let sharedFocus = await f.createTask('Aceptación · foco propio ya terminado con compañeros pendientes', {
    assigneeId: f.actors.bea.memberId, collaboratorIds: [f.actors.ana.memberId, f.actors.carlos.memberId],
    focusDeadlineAt: new Date(Date.now() + 3_600_000).toISOString() });
  sharedFocus = await move(sharedFocus, 'bea', 'REALIZADA');
  assert.notEqual(sharedFocus.status, 'REALIZADA');
  const started = await move(await f.loadTask(waiting.id), 'bea', 'EN_CURSO');
  assert.equal(part(started, 'bea').status, 'EN_CURSO');
});

test('una suspensión vigente de la parrilla también bloquea la ruta de participación sin cambiar relojes', async () => {
  const plan = await f.db.contentPlan.create({ data: { clientId: f.client.id, ownerId: f.actors.manager.memberId, month: 12, year: 2026 } });
  const item = await f.db.contentItem.create({ data: { planId: plan.id, objective: 'Pieza ficticia suspendida', format: 'Post', copyText: 'Texto ficticio', captionText: 'Texto ficticio', publishDate: new Date('2026-12-15T15:00:00Z'), status: 'EN_PRODUCCION' } });
  const task = await f.createTask('[Producción] Post: Pieza ficticia suspendida', { contentItemId: item.id });
  const suspension = await f.db.clientSuspension.create({ data: { clientId: f.client.id, fromCycle: '2026-12', suspendedOn: '2026-11-05',
    authorizedBy: 'Dirección ficticia', reason: 'Escenario de prueba aislado, sin deuda real' } });
  try {
    await f.move(task, 'carlos', 'EN_CURSO', {}, 'carlos', 409);
    const after = await f.loadTask(task.id);
    assert.equal(part(after, 'carlos').revision, part(task, 'carlos').revision);
    assert.equal(part(after, 'carlos').status, 'PENDIENTE');
    assert.equal(await f.db.taskWorkSession.count({ where: { taskId: task.id } }), 0);
  } finally {
    await f.db.clientSuspension.update({ where: { id: suspension.id }, data: { liftedAt: new Date(), liftReason: 'Fin de prueba local' } });
  }
});

test('retirar a Bea mientras inicia su parte serializa sin dejar un reloj huérfano', async () => {
  const task = await f.createTask('Aceptación · retiro concurrente con inicio');
  const [removed, started] = await Promise.all([
    f.request('manager', `/tasks/${task.id}`, { method: 'PATCH', body: {
      collaboratorIds: [f.actors.carlos.memberId], expectedRosterVersion: task.rosterVersion } }),
    f.move(task, 'bea', 'EN_CURSO', {}, 'bea', null),
  ]);
  assert.equal(removed.status, 200); assert.ok([200, 409].includes(started.status));
  const final = await f.loadTask(task.id);
  assert.equal(part(final, 'bea'), undefined); assert.equal(final.rosterVersion, task.rosterVersion + 1);
  const sessions = await f.db.taskWorkSession.findMany({ where: { taskId: task.id, workerId: f.actors.bea.memberId } });
  assert.equal(sessions.length, started.status === 200 ? 1 : 0);
  assert.ok(sessions.every(session => session.endedAt && session.durationMs >= 0));
  assert.equal(await f.db.taskWorkSession.count({ where: { taskId: task.id, endedAt: null } }), 0);
});

test('editar los datos comunes conserva los estados, revisiones y relojes de las tres personas', async () => {
  let task = await f.createTask('Aceptación · datos comunes antes');
  task = await move(task, 'ana', 'EN_CURSO'); task = await move(task, 'bea', 'REALIZADA');
  const partsBefore = task.participants.map(row => ({ memberId: row.memberId, status: row.status, revision: row.revision, completedAt: row.completedAt }));
  const sessions = await f.db.taskWorkSession.findMany({ where: { taskId: task.id } });
  const data = { title: 'Aceptación · título común corregido', dueDate: '2026-11-26T15:00:00.000Z',
    comments: 'Descripción común ficticia para las tres personas.', referenceUrl: 'https://example.invalid/referencia-compartida' };
  await f.request('manager', `/tasks/${task.id}`, { method: 'PATCH', body: data });
  for (const key of ['ana', 'bea', 'carlos']) {
    const detail = (await f.request(key, `/tasks/${task.id}`)).data;
    assert.equal(detail.id, task.id); assert.equal(detail.title, data.title); assert.equal(detail.dueDate, data.dueDate);
    assert.equal(detail.comments, data.comments); assert.equal(detail.referenceUrl, data.referenceUrl);
    assert.deepEqual(detail.participants.map(row => ({ memberId: row.memberId, status: row.status, revision: row.revision, completedAt: row.completedAt })), partsBefore);
  }
  assert.deepEqual(await f.db.taskWorkSession.findMany({ where: { taskId: task.id } }), sessions);
  assert.equal(await f.db.task.count({ where: { id: task.id } }), 1);
});

test('un cierre global legado conserva un solo logro histórico sin inventar cierres ni premios personales', async () => {
  const completedAt = new Date('2026-11-01T15:00:00.000Z');
  const old = await f.db.task.create({ data: { title: 'Aceptación · cierre global legado', clientId: f.client.id,
    assigneeId: f.actors.ana.memberId, creatorId: f.actors.manager.id, status: 'REALIZADA', completedAt,
    collaborators: { create: [{ memberId: f.actors.bea.memberId }, { memberId: f.actors.carlos.memberId }] } } });
  let task = (await f.request('ana', `/tasks/${old.id}`)).data;
  assert.equal(task.completedAt, completedAt.toISOString());
  assert.ok(task.participants.every(row => row.status === 'REALIZADA' && row.completedAt === null && row.legacy));
  const history = (await f.request('manager', '/tasks/completed?date=2026-11-01')).data.filter(row => row.id === task.id);
  assert.equal(history.length, 1); assert.equal(history[0].completedAt, completedAt.toISOString());
  const awards = await f.db.recognitionAward.count();
  task = await move(task, 'bea', 'PENDIENTE', { reopenReason: 'CLIENT_CORRECTION', reopenNote: 'Ajuste ficticio a una parte histórica.' });
  assert.equal(part(task, 'bea').status, 'PENDIENTE'); assert.equal(task.completedAt, null);
  assert.ok(['ana', 'carlos'].every(key => part(task, key).status === 'REALIZADA' && part(task, key).completedAt === null));
  assert.equal(await f.db.taskWorkSession.count({ where: { taskId: task.id } }), 0);
  assert.equal(await f.db.recognitionAward.count(), awards);
});
