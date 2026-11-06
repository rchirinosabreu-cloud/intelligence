import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createTaskPieceFixture, finalPiecePng } from './support/taskPieceFixture.js';

let fixture;
before(async () => { fixture = await createTaskPieceFixture({ port: 8098 }); });
after(async () => { await fixture?.close(); });

const move = async (piece, date, expected = 200) => (await fixture.request('ana', `/content/items/${piece.id}`, {
  method: 'PATCH', body: { publishDate: date }, expected
})).data;

test('fecha cambia de mes: misma pieza, tareas, entrega y carpeta; vuelta retira solo el mes automático vacío', async () => {
  const piece = fixture.pieces.current.approved;
  await fixture.upload('ana', piece.id, 'carrusel.png');
  const before = await fixture.evidence(piece);
  const original = await fixture.db.contentItem.findUnique({ where: { id: piece.id } });
  const moved = await move(piece, '2031-01-01');
  assert.notEqual(moved.planId, original.planId);
  assert.equal(moved.id, piece.id);
  const destination = await fixture.db.contentPlan.findUnique({ where: { id: moved.planId } });
  assert.equal(destination.month, 1); assert.equal(destination.year, 2031);
  assert.equal(destination.clientId, fixture.client.id);
  const after = await fixture.evidence(piece);
  assert.deepEqual(after.tasks, before.tasks, 'participaciones y tiempos no cambian');
  assert.deepEqual(after.assets, before.assets, 'los bytes y sus identidades no se vuelven a cargar');
  const task = (await fixture.request('ana', `/tasks/${piece.taskId}`)).data;
  assert.equal(task.contentItem.planId, moved.planId);
  assert.equal((await fixture.request('ana', `/content/items/${piece.id}/location`)).data.planId, moved.planId);
  await fixture.request('carlos', `/content/items/${piece.id}/location`, { expected: 403 });
  const files = (await fixture.request('ana', '/drive/contents?folderId=deliverables&query=carrusel')).data;
  const projected = files.files.find(file => file.source.itemId === piece.id);
  assert.equal(projected.source.planId, moved.planId);
  assert.match(projected.name, /2031/);
  assert.equal((await fixture.raw('ana', `/content/items/${piece.id}/final-assets/${before.assets[0].id}`)).status, 200);
  const restored = await move(piece, original.publishDate.toISOString());
  assert.equal(restored.planId, original.planId);
  assert.ok((await fixture.db.contentPlan.findUnique({ where: { id: destination.id } })).deletedAt);
  assert.equal((await fixture.db.contentPlan.findUnique({ where: { id: original.planId } })).deletedAt, null);
  const changes = await fixture.db.contentItemPeriodChange.findMany({ where: { itemId: piece.id }, orderBy: { createdAt: 'asc' } });
  assert.equal(changes.length, 2); assert.equal(changes[0].actorId, fixture.actors.ana.id);
});

test('dos traslados simultáneos crean una sola parrilla y el mes sigue mientras conserve otra pieza', async () => {
  const first = fixture.pieces.previous.approved, second = fixture.pieces.previous.production;
  const [a, b] = await Promise.all([move(first, '2032-02-02'), move(second, '2032-02-03')]);
  assert.equal(a.planId, b.planId);
  assert.equal(await fixture.db.contentPlan.count({ where: { clientId: fixture.client.id, year: 2032, month: 2, deletedAt: null } }), 1);
  await move(first, first.publishDate.toISOString());
  assert.equal((await fixture.db.contentPlan.findUnique({ where: { id: a.planId } })).deletedAt, null);
  await move(second, second.publishDate.toISOString());
  assert.ok((await fixture.db.contentPlan.findUnique({ where: { id: a.planId } })).deletedAt);
});

test('programación sigue la fecha; una publicación en curso bloquea el traslado completo', async () => {
  const piece = fixture.pieces.next.production;
  const account = await fixture.db.clientSocialAccount.create({ data: { clientId: fixture.client.id, platform: 'INSTAGRAM', externalId: `local-${piece.id}`, displayName: 'Prueba local', encryptedToken: 'never-used' } });
  const publication = await fixture.db.socialPublication.create({ data: { contentItemId: piece.id, socialAccountId: account.id, platform: 'INSTAGRAM', scheduledAt: new Date('2030-12-15T15:00:00Z') } });
  const moved = await move(piece, '2033-03-01');
  assert.equal((await fixture.db.socialPublication.findUnique({ where: { id: publication.id } })).scheduledAt.toISOString(), '2033-03-01T15:00:00.000Z');
  await fixture.db.socialPublication.update({ where: { id: publication.id }, data: { status: 'PUBLISHING' } });
  await move(piece, '2033-04-01', 409);
  assert.equal((await fixture.db.contentItem.findUnique({ where: { id: piece.id } })).planId, moved.planId);
  assert.equal(await fixture.db.contentPlan.count({ where: { clientId: fixture.client.id, year: 2033, month: 4 } }), 0);
  await fixture.db.socialPublication.update({ where: { id: publication.id }, data: { status: 'SCHEDULED' } });
  await move(piece, '2020-01-01');
  assert.equal((await fixture.db.socialPublication.findUnique({ where: { id: publication.id } })).status, 'CANCELLED');
});

test('cambiar la fecha desde una tarea de publicación usa el mismo traslado y respeta permisos', async () => {
  const piece = fixture.pieces.next.approved;
  await fixture.db.task.update({ where: { id: piece.taskId }, data: { title: `[Publicar] Post: ${piece.objective}` } });
  await fixture.request('ana', `/tasks/${piece.taskId}`, { method: 'PATCH', body: { dueDate: '2034-01-01' } });
  const item = await fixture.db.contentItem.findUnique({ where: { id: piece.id }, include: { plan: true } });
  assert.equal(item.plan.year, 2034); assert.equal(item.plan.month, 1);
  await fixture.request('ana', `/tasks/${piece.taskId}`, { method: 'PATCH', body: { dueDate: '2034-02-30' }, expected: 400 });
  await fixture.request('carlos', `/content/items/${piece.id}`, { method: 'PATCH', body: { publishDate: '2034-02-01' }, expected: 403 });
  assert.equal((await fixture.db.contentItem.findUnique({ where: { id: piece.id } })).planId, item.planId);
});

test('crear con fecha de otro mes usa ese período y registra a la persona que lo hizo', async () => {
  const source = fixture.plans[0];
  const body = { planId: source.id, objective: 'Nueva pieza fuera del mes', format: 'Post', copyText: '', captionText: '', publishDate: '2040-01-15' };
  const created = (await fixture.request('ana', '/content/items', { method: 'POST', body, expected: 201 })).data;
  assert.notEqual(created.planId, source.id);
  assert.equal(created.periodTransfer.toPlan.year, 2040);
  const event = await fixture.db.contentItemPeriodChange.findFirst({ where: { itemId: created.id } });
  assert.equal(event.actorId, fixture.actors.ana.id);
  await fixture.request('ana', '/content/items', { method: 'POST', body: { ...body, publishDate: '2040-02-30' }, expected: 400 });
});

test('se reutiliza una parrilla existente y nunca se retira una parrilla manual vacía', async () => {
  const piece = fixture.pieces.next.published;
  const manual = await fixture.db.contentPlan.create({ data: { clientId: fixture.client.id, year: 2035, month: 5 } });
  const before = await fixture.evidence(piece);
  const moved = await move(piece, '2035-05-12');
  assert.equal(moved.planId, manual.id);
  await move(piece, piece.publishDate.toISOString());
  assert.equal((await fixture.db.contentPlan.findUnique({ where: { id: manual.id } })).deletedAt, null);
  assert.equal((await fixture.evidence(piece)).itemStatus, 'PUBLICADO');
  assert.deepEqual((await fixture.evidence(piece)).tasks, before.tasks);
});

test('fecha dentro del mismo mes no mueve; planId arbitrario y fecha inválida se rechazan', async () => {
  const piece = fixture.pieces.current.production;
  const sameMonth = new Date(piece.publishDate); sameMonth.setUTCDate(20);
  assert.equal((await move(piece, sameMonth.toISOString())).planId, piece.planId);
  await move(piece, '2031-02-30', 400);
  await fixture.request('ana', `/content/items/${piece.id}`, { method: 'PATCH', body: { planId: fixture.plans[0].id }, expected: 400 });
  assert.equal((await fixture.db.contentItem.findUnique({ where: { id: piece.id } })).planId, piece.planId);
});

test('una entrega iniciada antes del traslado termina en la misma pieza, en su carpeta nueva', async () => {
  const piece = fixture.pieces.current.production;
  const base = `/content/items/${piece.id}`;
  const current = (await fixture.request('ana', `${base}/delivery`)).data;
  const prepared = (await fixture.request('ana', `${base}/delivery/direct-upload`, { method: 'POST', body: {
    expectedRevision: current.revision, requestId: randomUUID(), files: [{ name: 'en-transito.png', mimeType: 'image/png', size: finalPiecePng.length }]
  } })).data;
  const moved = await move(piece, '2036-06-01');
  assert.equal((await fetch(prepared.tickets[0].url, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: finalPiecePng })).status, 200);
  const saved = (await fixture.request('ana', `${base}/delivery/confirm`, { method: 'POST', expected: 201,
    body: { uploadId: prepared.uploadId, expectedRevision: current.revision } })).data;
  assert.equal(saved.files.length, 1);
  const search = (await fixture.request('ana', '/drive/contents?folderId=deliverables&query=en-transito')).data;
  assert.equal(search.files.find(file => file.source.itemId === piece.id).source.planId, moved.planId);
});

test('un período suspendido y una cuenta con parrilla externa bloquean el traslado sin crear destino', async () => {
  const piece = fixture.pieces.previous.published;
  const suspension = await fixture.db.clientSuspension.create({ data: { clientId: fixture.client.id, fromCycle: '2037-01', suspendedOn: '2026-11-06', authorizedBy: 'Prueba local', reason: 'Ficticia' } });
  try { await move(piece, '2037-01-01', 409); }
  finally { await fixture.db.clientSuspension.update({ where: { id: suspension.id }, data: { liftedAt: new Date() } }); }
  await fixture.db.client.update({ where: { id: fixture.client.id }, data: { externalPlanUrl: 'https://docs.google.com/spreadsheets/d/fictitious-local/edit' } });
  try { await move(piece, '2037-01-01', 409); }
  finally { await fixture.db.client.update({ where: { id: fixture.client.id }, data: { externalPlanUrl: null } }); }
  assert.equal(await fixture.db.contentPlan.count({ where: { clientId: fixture.client.id, year: 2037, month: 1 } }), 0);
  assert.equal((await fixture.db.contentItem.findUnique({ where: { id: piece.id } })).planId, piece.planId);
});

test('una pantalla con el mes anterior no sobreescribe un traslado posterior', async () => {
  const piece = fixture.pieces.previous.published;
  const moved = await move(piece, '2038-02-01');
  await fixture.request('ana', `/content/items/${piece.id}`, { method: 'PATCH', expected: 409,
    body: { publishDate: '2038-03-01', expectedPlanId: piece.planId } });
  assert.equal((await fixture.db.contentItem.findUnique({ where: { id: piece.id } })).planId, moved.planId);
});

test('los permisos de carga del editor emitidos antes del traslado siguen ligados a esa pieza', async () => {
  const piece = fixture.pieces.current.production;
  const base = `/content/items/${piece.id}`;
  const tickets = (await fixture.request('ana', `${base}/final-assets/direct-upload`, { method: 'POST', body: {
    files: [{ name: 'editor-en-transito.png', mimeType: 'image/png', size: finalPiecePng.length }]
  } })).data;
  await move(piece, '2036-07-01');
  assert.equal((await fetch(tickets[0].url, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: finalPiecePng })).status, 200);
  const revision = (await fixture.request('ana', `${base}/delivery`)).data.revision;
  await fixture.request('ana', `${base}/final-assets/confirm`, { method: 'POST', expected: 400, body: {
    uploads: [{ ...tickets[0], key: tickets[0].key.replace(piece.id, fixture.pieces.current.approved.id) }], expectedRevision: revision
  } });
  await fixture.request('ana', `${base}/final-assets/confirm`, { method: 'POST', expected: 201, body: { uploads: tickets, expectedRevision: revision } });
});

test('deshacer una publicación manual trasladada reabre su mes actual sin restaurar el estado del anterior', async () => {
  const piece = fixture.pieces.previous.published;
  await fixture.db.contentItem.update({ where: { id: piece.id }, data: { status: 'PUBLICADO', manualPublish: {
    previousStatus: 'APROBADO', previousPlanStatus: 'EN_APROBACION'
  } } });
  const moved = await move(piece, '2039-09-02');
  assert.equal((await fixture.db.contentPlan.findUnique({ where: { id: moved.planId } })).status, 'FINALIZADO');
  await fixture.request('manager', `/client-operations/${fixture.client.id}/pieces/${piece.id}/published`, { method: 'DELETE' });
  assert.equal((await fixture.db.contentPlan.findUnique({ where: { id: moved.planId } })).status, 'ACTIVO');
  assert.equal((await fixture.db.contentItem.findUnique({ where: { id: piece.id } })).status, 'APROBADO');
});

test('un mes automático con solo piezas en papelera se retira y puede reutilizarse sin resucitarlas', async () => {
  const piece = fixture.pieces.current.approved;
  const moved = await move(piece, '2040-02-01');
  const tombstone = await fixture.db.contentItem.create({ data: { planId: moved.planId, objective: 'Eliminada en prueba',
    format: 'Post', copyText: '', captionText: '', publishDate: new Date('2040-02-02'), deletedAt: new Date() } });
  await move(piece, piece.publishDate.toISOString());
  assert.ok((await fixture.db.contentPlan.findUnique({ where: { id: moved.planId } })).deletedAt);
  assert.equal((await move(piece, '2040-02-01')).planId, moved.planId);
  assert.ok((await fixture.db.contentItem.findUnique({ where: { id: tombstone.id } })).deletedAt);
});
