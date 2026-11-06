import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createTaskPieceFixture, finalPiecePng } from './support/taskPieceFixture.js';

let fixture, storageOrigin, deliveryBucket, evidenceBucket;
before(async () => {
  fixture = await createTaskPieceFixture({ port: 8095 });
  const health = await fetch(`${fixture.api.origin}/api/health`).then(response => response.json());
  assert.equal(health.isolatedTaskPieceTest, true);
  storageOrigin = health.storageOrigin;
  deliveryBucket = health.deliveryBucket; evidenceBucket = health.evidenceBucket;
  assert.equal(new URL(storageOrigin).hostname, '127.0.0.1');
});
after(async () => { if (process.env.CONTENT_DELIVERY_DEBUG) console.error(fixture?.api.logs()); await fixture?.close(); });

const multipart = async (actor, route, revision, files, { expected = 201, requestId = randomUUID() } = {}) => {
  const form = new FormData();
  form.append('expectedRevision', String(revision));
  form.append('requestId', requestId);
  for (const file of files) form.append('files', new Blob([file.bytes || finalPiecePng], { type: file.type || 'image/png' }), file.name);
  const response = await fixture.raw(actor, route, { method: 'POST', body: form });
  const data = await response.json();
  assert.equal(response.status, expected, JSON.stringify(data));
  return data;
};
const storageStatus = async file => (await fetch(`${storageOrigin}/${file.storageArea === 'PLATFORM' ? deliveryBucket : evidenceBucket}/${file.storageKey}`, { method: 'HEAD' })).status;

test('pieza: reemplazo completo por nombres iguales, historia, retiro físico y orden con revisión real', async () => {
  const piece = fixture.pieces.current.approved;
  const base = `/content/items/${piece.id}`;
  await fixture.upload('ana', piece.id, 'igual.png');
  const before = await fixture.evidence(piece);
  const current = (await fixture.request('ana', `${base}/delivery`)).data;
  assert.equal(current.files.length, 1);
  assert.equal(await storageStatus(before.assets[0]), 200);
  const saved = await multipart('ana', `${base}/delivery/replace`, current.revision, [{ name: 'igual.png' }, { name: 'igual.png' }]);
  assert.equal(saved.files.length, 2);
  assert.equal(new Set(saved.files.map(file => file.id)).size, 2);
  assert.equal(saved.files.some(file => file.id === current.files[0].id), false);
  assert.ok(saved.revision > current.revision);
  const event = saved.history.find(row => row.revision === saved.revision);
  assert.equal(event.actorName, fixture.actors.ana.name);
  assert.equal(event.action, 'REPLACED');
  assert.equal(event.previousFiles.length, 1);
  assert.equal(event.files.length, 2);
  assert.doesNotMatch(JSON.stringify(saved.history), /storageKey|https?:/);
  const after = await fixture.evidence(piece);
  assert.deepEqual(after.tasks, before.tasks);
  assert.deepEqual(after.publications, before.publications);
  assert.equal(after.itemStatus, 'APROBADO');
  assert.ok(after.revisionRequestedAt);
  assert.equal(await storageStatus(before.assets[0]), 404);
  assert.equal((await fixture.raw('ana', `${base}/final-assets/${before.assets[0].id}`)).status, 404);
  const order = saved.files.map(file => file.id).reverse();
  await fixture.request('ana', `${base}/final-assets/order`, { method: 'PUT', body: { order, expectedRevision: saved.revision } });
  const reordered = (await fixture.request('ana', `${base}/delivery`)).data;
  assert.deepEqual(reordered.files.map(file => file.id), order);
  assert.ok(reordered.revision > saved.revision);
  await multipart('ana', `${base}/delivery/replace`, saved.revision, [{ name: 'revisión-antigua.png' }], { expected: 409 });
  assert.deepEqual((await fixture.request('ana', `${base}/delivery`)).data.files.map(file => file.id), order);
});

test('pieza: carga directa parcial conserva la entrega, sello de copia y reintento no duplican versiones', async () => {
  const piece = fixture.pieces.current.production;
  const base = `/content/items/${piece.id}`;
  await fixture.upload('ana', piece.id, 'anterior.png');
  const current = (await fixture.request('ana', `${base}/delivery`)).data;
  const requestId = randomUUID();
  const files = [{ name: 'igual.png', size: finalPiecePng.length, mimeType: 'image/png' }, { name: 'igual.png', size: finalPiecePng.length, mimeType: 'image/png' }];
  const prepared = (await fixture.request('ana', `${base}/delivery/direct-upload`, { method: 'POST', body: { files, expectedRevision: current.revision, requestId } })).data;
  const confirm = { uploadId: prepared.uploadId, expectedRevision: current.revision, requestId };
  await fixture.request('bea', `${base}/delivery/confirm`, { method: 'POST', body: confirm, expected: 403 });
  await fetch(prepared.tickets[0].url, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: finalPiecePng });
  await fixture.request('ana', `${base}/delivery/confirm`, { method: 'POST', body: confirm, expected: 409 });
  assert.deepEqual((await fixture.request('ana', `${base}/delivery`)).data.files.map(file => file.id), current.files.map(file => file.id));
  await fetch(prepared.tickets[1].url, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: finalPiecePng });
  const saved = (await fixture.request('ana', `${base}/delivery/confirm`, { method: 'POST', body: confirm, expected: 201 })).data;
  const replay = (await fixture.request('ana', `${base}/delivery/confirm`, { method: 'POST', body: confirm, expected: 201 })).data;
  assert.deepEqual(replay, saved);
  const replayPreparation = (await fixture.request('ana', `${base}/delivery/direct-upload`, { method: 'POST', body: { files, expectedRevision: current.revision, requestId } })).data;
  assert.equal(replayPreparation.committed, true);
  assert.deepEqual(replayPreparation.delivery, saved);
  await fetch(prepared.tickets[0].url, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: Buffer.from('cambio tardío') });
  const downloaded = await fixture.raw('ana', `${base}/final-assets/${saved.files[0].id}`);
  assert.equal(downloaded.status, 200);
  assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), finalPiecePng);
  assert.equal((await fixture.request('ana', `${base}/delivery`)).data.revision, saved.revision);
});

test('pieza: una sustitución inválida conserva el material publicado y sus estados', async () => {
  const piece = fixture.pieces.current.published;
  const base = `/content/items/${piece.id}`;
  await fixture.upload('ana', piece.id, 'publicada.png');
  const before = await fixture.evidence(piece);
  const current = (await fixture.request('ana', `${base}/delivery`)).data;
  await multipart('ana', `${base}/delivery/replace`, current.revision, [{ name: 'invalida.png', bytes: Buffer.from('000000186674797069736f6d', 'hex') }], { expected: 400 });
  assert.deepEqual((await fixture.request('ana', `${base}/delivery`)).data, current);
  const saved = await multipart('ana', `${base}/delivery/replace`, current.revision, [{ name: 'publicada-corregida.png' }]);
  assert.equal(saved.files.length, 1);
  const after = await fixture.evidence(piece);
  assert.equal(after.itemStatus, 'PUBLICADO');
  assert.equal(after.revisionRequestedAt, null);
  assert.deepEqual(after.tasks, before.tasks);
  assert.deepEqual(after.publications, before.publications);
});

test('tarea independiente: varios tipos, orden, sustitución e historial internos con estados personales intactos', async () => {
  const task = (await fixture.request('manager', '/tasks', { method: 'POST', expected: 201, body: {
    title: 'Entrega interna ficticia', clientId: fixture.client.id, assigneeId: fixture.actors.ana.memberId,
    collaboratorIds: [fixture.actors.bea.memberId], isPrivate: true,
  } })).data;
  const base = `/tasks/${task.id}/deliverables`;
  const current = (await fixture.request('ana', base)).data;
  assert.equal(current.canUpload, true);
  assert.equal(current.canReorder, true);
  assert.deepEqual(current.files, []);
  await fixture.request('outside', base, { expected: 403 });
  const before = (await fixture.request('ana', `/tasks/${task.id}`)).data;
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF');
  const saved = await multipart('ana', base, current.revision, [{ name: 'imagen.png' }, { name: 'documento.pdf', type: 'application/pdf', bytes: pdf }]);
  assert.equal(saved.files.length, 2);
  assert.deepEqual(new Set(saved.files.map(file => file.mimeType)), new Set(['image/png', 'application/pdf']));
  const oldRows = await fixture.db.taskDeliverable.findMany({ where: { taskId: task.id } });
  for (const file of oldRows) assert.equal(await storageStatus(file), 200);
  const order = saved.files.map(file => file.id).reverse();
  const reordered = (await fixture.request('bea', `${base}/order`, { method: 'PUT', body: { order, expectedRevision: saved.revision, requestId: randomUUID() } })).data;
  assert.deepEqual(reordered.files.map(file => file.id), order);
  await multipart('outside', base, reordered.revision, [{ name: 'ajeno.png' }], { expected: 403 });
  const replacementId = randomUUID();
  const replaced = await multipart('bea', base, reordered.revision, [{ name: 'imagen.png' }], { requestId: replacementId });
  assert.equal(replaced.files.length, 1);
  assert.equal(oldRows.some(row => row.id === replaced.files[0].id), false);
  assert.equal(replaced.history.find(event => event.revision === replaced.revision).actorName, fixture.actors.bea.name);
  assert.doesNotMatch(JSON.stringify(replaced.history), /storageKey|https?:/);
  const replay = await multipart('bea', base, reordered.revision, [{ name: 'imagen.png' }], { requestId: replacementId });
  assert.equal(replay.revision, replaced.revision);
  assert.deepEqual(replay.files.map(file => file.id), replaced.files.map(file => file.id));
  await multipart('ana', base, reordered.revision, [{ name: 'atrasada.png' }], { expected: 409 });
  for (const file of oldRows) assert.equal((await fixture.raw('ana', `${base}/${file.id}/file`)).status, 404);
  const after = (await fixture.request('ana', `/tasks/${task.id}`)).data;
  assert.equal(after.status, before.status);
  assert.deepEqual(after.participants, before.participants);
  assert.equal(after.accumulatedWorkMs, before.accumulatedWorkMs);
  assert.equal(after.startedAt, before.startedAt);
  const cleanup = await fetch(`${fixture.api.origin}/__test/cleanup-deliverables`, { method: 'POST' });
  assert.equal(cleanup.status, 200);
  for (const file of oldRows) assert.equal(await storageStatus(file), 404);
  assert.equal((await fixture.db.taskAttachment.findMany({ where: { taskId: task.id } })).length, 0, 'no convierte entregables en adjuntos purgables del chat');
  await fixture.db.task.delete({ where: { id: task.id } });
  assert.ok(await fixture.db.taskDeliverableEvent.count({ where: { taskId: task.id } }), 'el historial de entrega permanece tras eliminar la tarea ficticia');
  await fixture.request('ana', base, { expected: 404 });
});

test('una tarea vinculada dirige la entrega a su pieza y no admite un segundo conjunto paralelo', async () => {
  const taskId = fixture.pieces.next.production.taskId;
  const response = await fixture.request('ana', `/tasks/${taskId}/deliverables`, { expected: 409 });
  assert.equal(response.data.code, 'TASK_DELIVERABLE_LINKED_PIECE');
  assert.equal(response.data.contentItemId, fixture.pieces.next.production.id);
  assert.equal(await fixture.db.taskDeliverable.count({ where: { taskId } }), 0);
});
