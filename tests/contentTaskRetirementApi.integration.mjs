import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTaskPieceFixture } from './support/taskPieceFixture.js';

let f;
before(async () => { f = await createTaskPieceFixture({ port: 8102 }); });
after(async () => { await f?.close(); });

async function startShared(piece) {
  for (const actor of ['ana', 'bea']) {
    const task = (await f.request(actor, `/tasks/${piece.taskId}`)).data;
    const own = task.participants.find(p => p.memberId === f.actors[actor].memberId);
    await f.request(actor, `/tasks/${piece.taskId}/participants/${own.memberId}`, { method: 'PATCH', body: {
      status: 'EN_CURSO', expectedRevision: own.revision, expectedRosterVersion: task.rosterVersion,
    } });
  }
}

test('eliminar una pieza retira todas sus tareas, cierra relojes y conserva comentarios, tiempos y estados', async () => {
  const piece = f.pieces.current.approved;
  await f.db.task.update({ where: { id: piece.taskId }, data: { isPrivate: true } });
  await f.upload('ana', piece.id, 'entrega-conservada.png');
  await startShared(piece);
  const extra = await f.db.task.create({ data: { title: 'Otro encargo de la misma pieza', clientId: f.client.id,
    contentItemId: piece.id, creatorId: f.actors.manager.id, assigneeId: f.actors.ana.memberId, status: 'PENDIENTE' } });
  const comment = await f.db.taskComment.create({ data: { taskId: piece.taskId, authorId: f.actors.ana.id, content: 'Comentario histórico que se conserva.' } });
  const before = await f.evidence(piece);
  const awardCount = await f.db.recognitionAward.count({ where: { taskId: piece.taskId } });
  await f.request('manager', `/content/items/${piece.id}`, { method: 'DELETE' });
  const task = await f.db.task.findUnique({ where: { id: piece.taskId } });
  assert.ok(task, 'la fila histórica no se borra');
  assert.equal(task.status, before.tasks.find(t => t.id === piece.taskId).status);
  assert.equal(task.completedAt, null);
  assert.equal(task.startedAt, null, 'detiene el reloj del responsable');
  const sessions = await f.db.taskWorkSession.findMany({ where: { taskId: piece.taskId } });
  assert.equal(sessions.length, 2);
  assert.ok(sessions.every(s => s.endedAt && s.durationMs >= 0 && s.closeReason === 'CONTENT_REMOVED'));
  assert.ok(await f.db.taskComment.findUnique({ where: { id: comment.id } }));
  assert.equal(await f.db.recognitionAward.count({ where: { taskId: piece.taskId } }), awardCount);
  const afterRetirement = await f.evidence(piece);
  assert.deepEqual(afterRetirement.assets, before.assets);
  for (const original of before.tasks) {
    const retained = afterRetirement.tasks.find(t => t.id === original.id);
    assert.equal(retained.assigneeStatus, original.assigneeStatus);
    assert.deepEqual(retained.collaborators, original.collaborators);
  }
  const listed = (await f.request('manager', '/tasks')).data;
  assert.ok(!listed.some(t => [piece.taskId, extra.id].includes(t.id)), 'ninguna participación permanece en el tablero');
  assert.ok(listed.some(t => t.id === f.pieces.current.production.taskId), 'otras piezas permanecen');
  const history = (await f.request('manager', `/tasks/${piece.taskId}/work-history`)).data;
  assert.ok(history.cycles.some(c => c.sessions.length === 2));
  const comments = (await f.request('ana', `/tasks/${piece.taskId}/comments`)).data;
  assert.ok(comments.some(c => c.id === comment.id));
  await f.request('outside', `/tasks/${piece.taskId}/comments`, { expected: 403 });
  await f.request('outside', `/tasks/${piece.taskId}/work-history`, { expected: 403 });
  const events = await f.db.operationalTraceEvent.findMany({ where: { taskId: piece.taskId, eventType: 'TASK_RETIRED' } });
  assert.equal(events.length, 1);
  assert.equal(events[0].actorId, f.actors.manager.id);
  assert.equal(events[0].metadata.contentItemId, piece.id);
  const after = await f.evidence(piece);
  await f.request('manager', `/content/items/${piece.id}`, { method: 'DELETE' });
  assert.deepEqual(await f.evidence(piece), after, 'el reintento no suma tiempo ni cambia participaciones');
  assert.equal(await f.db.operationalTraceEvent.count({ where: { taskId: piece.taskId, eventType: 'TASK_RETIRED' } }), 1);
});

test('una pantalla antigua no puede editar, reiniciar, comentar ni borrar físicamente una tarea retirada', async () => {
  const piece = f.pieces.current.approved;
  for (const [path, method, body] of [
    ['', 'PATCH', { title: 'No modificar' }], ['', 'DELETE', { reason: 'No borrar el historial' }],
    ['/work/start', 'POST', {}], ['/comments', 'POST', { content: 'No publicar' }],
    [`/participants/${f.actors.ana.memberId}`, 'PATCH', { status: 'PENDIENTE', expectedRevision: 1, expectedRosterVersion: 0 }],
  ]) await f.request('manager', `/tasks/${piece.taskId}${path}`, { method, body, expected: 409 });
  const detail = await f.request('ana', `/tasks/${piece.taskId}`, { expected: 410 });
  assert.equal(detail.data.code, 'TASK_RETIRED');
  assert.ok(await f.db.task.findUnique({ where: { id: piece.taskId } }));
});

test('retirar una pieza realizada conserva su cierre y sus reconocimientos sin crear uno nuevo', async () => {
  const piece = f.pieces.current.published;
  const before = await f.evidence(piece);
  await f.request('manager', `/content/items/${piece.id}`, { method: 'DELETE' });
  const after = await f.evidence(piece);
  assert.deepEqual(after.tasks, before.tasks.map(task => ({ ...task, startedAt: null })));
  assert.ok(!(await f.request('manager', '/tasks')).data.some(t => t.id === piece.taskId));
});

test('eliminar la parrilla retira todas sus piezas y tareas en una transacción', async () => {
  const pieces = Object.values(f.pieces.next);
  await startShared(f.pieces.next.approved);
  await f.request('manager', `/content/plans/${f.pieces.next.approved.planId}`, { method: 'DELETE' });
  const ids = pieces.map(p => p.taskId);
  assert.equal(await f.db.task.count({ where: { id: { in: ids } } }), 3);
  assert.equal(await f.db.taskWorkSession.count({ where: { taskId: { in: ids }, endedAt: null } }), 0);
  assert.ok(!(await f.request('manager', '/tasks')).data.some(t => ids.includes(t.id)));
});

test('las tareas históricas de piezas ya eliminadas también quedan fuera de Gestión', async () => {
  const piece = f.pieces.previous.production;
  await f.db.contentItem.update({ where: { id: piece.id }, data: { deletedAt: new Date() } });
  assert.ok(!(await f.request('manager', '/tasks')).data.some(t => t.id === piece.taskId));
  assert.ok(await f.db.task.findUnique({ where: { id: piece.taskId } }));
});

test('eliminar solo el pendiente en Gestión conserva su pieza y las demás tareas de esa pieza', async () => {
  const piece = f.pieces.previous.published;
  const before = await f.db.contentItem.findUnique({ where: { id: piece.id } });
  const other = await f.db.task.create({ data: { title: 'Otra tarea que continúa', clientId: f.client.id, contentItemId: piece.id, creatorId: f.actors.manager.id } });
  await f.request('manager', `/tasks/${piece.taskId}`, { method: 'DELETE', body: { reason: 'Se cancela solo este encargo.' } });
  assert.deepEqual(await f.db.contentItem.findUnique({ where: { id: piece.id } }), before);
  assert.ok(await f.db.task.findUnique({ where: { id: other.id } }));
  assert.ok((await f.request('manager', `/content/plans/${piece.planId}`)).data.items.some(item => item.id === piece.id));
});

test('eliminar y mover una participación simultáneamente nunca deja un reloj activo ni resucita la tarjeta', async () => {
  const piece = f.pieces.previous.approved;
  const task = (await f.request('ana', `/tasks/${piece.taskId}`)).data;
  const own = task.participants.find(p => p.memberId === f.actors.ana.memberId);
  const [deletion, move] = await Promise.all([
    f.raw('manager', `/content/items/${piece.id}`, { method: 'DELETE' }),
    f.raw('ana', `/tasks/${piece.taskId}/participants/${own.memberId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'EN_CURSO', expectedRevision: own.revision, expectedRosterVersion: task.rosterVersion }) }),
  ]);
  assert.equal(deletion.status, 200);
  assert.ok([200, 409].includes(move.status), `HTTP ${move.status}`);
  assert.equal(await f.db.taskWorkSession.count({ where: { taskId: piece.taskId, endedAt: null } }), 0);
  assert.equal((await f.db.task.findUnique({ where: { id: piece.taskId } })).startedAt, null);
  assert.ok(!(await f.request('manager', '/tasks')).data.some(t => t.id === piece.taskId));
});

test('una publicación en curso bloquea la eliminación completa y una programada se cancela al retirar', async () => {
  const piece = f.pieces.current.production;
  const account = await f.db.clientSocialAccount.create({ data: { clientId: f.client.id, platform: 'INSTAGRAM', externalId: `retirement-${piece.id}`, displayName: 'Prueba local', encryptedToken: 'never-used' } });
  const publication = await f.db.socialPublication.create({ data: { contentItemId: piece.id, socialAccountId: account.id, platform: 'INSTAGRAM', scheduledAt: new Date('2030-12-15T15:00:00Z'), status: 'PUBLISHING' } });
  const before = await f.evidence(piece);
  await f.request('manager', `/content/items/${piece.id}`, { method: 'DELETE', expected: 409 });
  await f.request('manager', `/content/plans/${piece.planId}`, { method: 'DELETE', expected: 409 });
  assert.deepEqual(await f.evidence(piece), before, 'ni pieza ni tarea se retiran parcialmente');
  assert.equal((await f.db.contentPlan.findUnique({ where: { id: piece.planId } })).deletedAt, null);
  await f.db.socialPublication.update({ where: { id: publication.id }, data: { status: 'SCHEDULED' } });
  await f.request('manager', `/content/items/${piece.id}`, { method: 'DELETE' });
  const cancelled = await f.db.socialPublication.findUnique({ where: { id: publication.id } });
  assert.equal(cancelled.status, 'CANCELLED');
  assert.ok(cancelled.cancelledAt);
});
