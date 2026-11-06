import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createTaskPieceFixture, finalPiecePng } from './support/taskPieceFixture.js';

let fixture, storageOrigin, deliveryBucket, memoryBucket;
before(async () => {
  fixture = await createTaskPieceFixture({ port: 8094 });
  const health = await fetch(`${fixture.api.origin}/api/health`).then(response => response.json());
  assert.equal(health.isolatedTaskPieceTest, true);
  storageOrigin = health.storageOrigin;
  deliveryBucket = health.deliveryBucket;
  memoryBucket = health.memoryBucket;
  assert.equal(new URL(storageOrigin).hostname, '127.0.0.1');
});
after(async () => { await fixture?.close(); });

const createTask = async (title, isPrivate = false) => (await fixture.request('manager', '/tasks', { method: 'POST', expected: 201, body: {
  title, clientId: fixture.client.id, assigneeId: fixture.actors.ana.memberId,
  collaboratorIds: [fixture.actors.bea.memberId], isPrivate
} })).data;
const get = async task => (await fixture.request('ana', `/tasks/${task.id}/deliverables`)).data;
const change = revision => ({ expectedRevision: revision, requestId: randomUUID() });
const descriptors = () => [0, 1].map(() => ({ name: 'igual.png', mimeType: 'image/png', size: finalPiecePng.length }));
const prepare = async (task, actor, input = change(0), files = descriptors()) => (await fixture.request(actor, `/tasks/${task.id}/deliverables/direct-upload`, { method: 'POST', body: { ...input, files } })).data;
const confirm = (task, actor, prepared, expected = 201) => fixture.request(actor, `/tasks/${task.id}/deliverables/confirm`, { method: 'POST', expected, body: prepared });
const put = async (ticket, bytes = finalPiecePng) => {
  const response = await fetch(ticket.url, { method: 'PUT', headers: { 'Content-Type': ticket.mimeType }, body: bytes });
  assert.equal(response.status, 200);
};
const upload = async (task, name = 'anterior.png') => {
  const form = new FormData(); form.append('requestId', randomUUID()); form.append('expectedRevision', String((await get(task)).revision));
  form.append('files', new Blob([finalPiecePng], { type: 'image/png' }), name);
  const response = await fixture.raw('ana', `/tasks/${task.id}/deliverables`, { method: 'POST', body: form });
  const data = await response.json(); assert.equal(response.status, 201, JSON.stringify(data)); return data;
};
const status = async key => (await fetch(`${storageOrigin}/${deliveryBucket}/${key}`, { method: 'HEAD' })).status;
const cleanup = async () => assert.equal((await fetch(`${fixture.api.origin}/__test/cleanup-deliverables`, { method: 'POST' })).status, 200);

test('directa real: firma, persona, tarea y conjunto completo protegen la entrega anterior', async () => {
  const task = await createTask('Aceptación local · entrega directa protegida');
  const initial = await upload(task), prepared = await prepare(task, 'ana', change(initial.revision));
  await confirm(task, 'bea', prepared, 403);
  const other = await createTask('Aceptación local · otra identidad de tarea');
  await confirm(other, 'ana', prepared, 403);
  const tampered = structuredClone(prepared);
  const token = tampered.uploads[0].token.split('.'); token[1] = Buffer.from(JSON.stringify({ taskId: task.id, actorId: fixture.actors.ana.id })).toString('base64url');
  tampered.uploads[0].token = token.join('.');
  await confirm(task, 'ana', tampered, 400);
  await confirm(task, 'ana', { ...prepared, uploads: prepared.uploads.slice(0, 1) }, 400);
  await put(prepared.uploads[0]);
  await confirm(task, 'ana', prepared, 400);
  assert.deepEqual((await get(task)).files, initial.files);
  await put(prepared.uploads[1]);
  const saved = (await confirm(task, 'ana', prepared)).data;
  assert.equal(saved.files.length, 2); assert.equal(saved.revision, initial.revision + 1);
  assert.equal(new Set(saved.files.map(row => row.id)).size, 2);
  assert.equal(saved.files.some(row => initial.files.some(old => old.id === row.id)), false);
  assert.doesNotMatch(JSON.stringify(saved.history), /storageKey|https?:/);
  const replay = (await confirm(task, 'ana', prepared)).data;
  assert.equal(replay.receipt.duplicate, true); assert.deepEqual(replay.files, saved.files);
  assert.equal(await fixture.db.taskDeliverableEvent.count({ where: { taskId: task.id } }), 2);
  const preparedAgain = await prepare(task, 'ana', prepared);
  assert.equal(preparedAgain.alreadyCommitted, true); assert.deepEqual(preparedAgain.uploads, []);
  await put(prepared.uploads[0], Buffer.from('reescritura tardía'));
  const streamed = await fixture.raw('ana', saved.files[0].fileUrl.replace(/^\/api/, ''));
  assert.equal(streamed.status, 200); assert.deepEqual(Buffer.from(await streamed.arrayBuffer()), finalPiecePng);
  assert.equal((await get(task)).revision, saved.revision);
  await cleanup();
  for (const ticket of prepared.uploads) assert.equal(await status(ticket.key), 200, 'el staging firmado no se limpia antes de caducar el permiso');
});

test('dos personas confirman simultáneamente: una revisión gana y solo sus archivos quedan vigentes', async () => {
  const task = await createTask('Aceptación local · conflicto de entregas');
  const a = await prepare(task, 'ana'), b = await prepare(task, 'bea');
  await Promise.all([...a.uploads, ...b.uploads].map(ticket => put(ticket)));
  const responses = await Promise.all([['ana', a], ['bea', b]].map(([actor, body]) => fixture.raw(actor, `/tasks/${task.id}/deliverables/confirm`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  })));
  assert.deepEqual(responses.map(row => row.status).sort(), [201, 409]);
  const winnerIndex = responses.findIndex(row => row.status === 201), winner = await responses[winnerIndex].json();
  assert.equal(winner.receipt.requestId, [a, b][winnerIndex].requestId);
  const current = await get(task);
  assert.equal(current.revision, 1); assert.equal(current.history.length, 1);
  assert.deepEqual(current.files, winner.files);
  const rows = await fixture.db.taskDeliverable.findMany({ where: { taskId: task.id } });
  await cleanup();
  for (const row of rows) assert.equal(await status(row.storageKey), 200);
  const pending = await fixture.db.taskDeliverableCleanup.findMany({ where: { taskId: task.id } });
  assert.equal(pending.every(row => row.storageKey.includes('/staging/')), true, 'las copias perdedoras ya se retiraron');
});

test('privacidad real: dirección sin acceso y colaborador retirado no leen ni confirman', async () => {
  const task = await createTask('Aceptación local · permisos privados', true);
  // Arrangement only on this run's fictitious task: another creator makes the administrator an outsider.
  await fixture.db.task.update({ where: { id: task.id }, data: { creatorId: fixture.actors.ana.id } });
  const initial = await upload(task), prepared = await prepare(task, 'bea', change(initial.revision));
  for (const actor of ['manager', 'outside']) {
    await fixture.request(actor, `/tasks/${task.id}/deliverables`, { expected: 403 });
    assert.equal((await fixture.raw(actor, initial.files[0].fileUrl.replace(/^\/api/, ''))).status, 403);
  }
  const current = (await fixture.request('ana', `/tasks/${task.id}`)).data;
  await fixture.request('ana', `/tasks/${task.id}`, { method: 'PATCH', body: { collaboratorIds: [], expectedRosterVersion: current.rosterVersion } });
  await fixture.request('bea', `/tasks/${task.id}/deliverables`, { expected: 403 });
  await confirm(task, 'bea', prepared, 403);
  assert.deepEqual((await get(task)).files, initial.files);
});

test('borrar una tarea en PostgreSQL encola sus objetos, conserva historia y permite limpieza física', async () => {
  const task = await createTask('Aceptación local · borrado y limpieza');
  const initial = await upload(task), rows = await fixture.db.taskDeliverable.findMany({ where: { taskId: task.id } });
  for (const row of rows) assert.equal(await status(row.storageKey), 200);
  await fixture.db.task.delete({ where: { id: task.id } });
  assert.equal(await fixture.db.taskDeliverable.count({ where: { taskId: task.id } }), 0);
  assert.equal(await fixture.db.taskDeliverableEvent.count({ where: { taskId: task.id } }), 1);
  const pending = await fixture.db.taskDeliverableCleanup.findMany({ where: { taskId: task.id } });
  assert.deepEqual(pending.map(row => row.storageKey), rows.map(row => row.storageKey));
  await fixture.request('ana', `/tasks/${task.id}/deliverables`, { expected: 404 });
  assert.equal((await fixture.raw('ana', initial.files[0].fileUrl.replace(/^\/api/, ''))).status, 404);
  await cleanup();
  for (const row of rows) assert.equal(await status(row.storageKey), 404);
  assert.equal(await fixture.db.taskDeliverableCleanup.count({ where: { taskId: task.id } }), 0);
});

test('Drive real navega los mismos archivos vigentes y filtra módulo y privacidad antes de nombres y descargas', async () => {
  for (const key of ['ana', 'bea', 'outside']) await fixture.db.user.update({ where: { id: fixture.actors[key].id }, data: { modulePermissions: { drive: true, gestion: true, parrillas: true } } });
  const task = await createTask(`Informe reservado ${fixture.runId}`, true);
  await fixture.db.task.update({ where: { id: task.id }, data: { creatorId: fixture.actors.ana.id } });
  const saved = await upload(task, 'documento-original.png');
  const piece = fixture.pieces.current.approved;
  await fixture.upload('ana', piece.id, 'pieza-original.png');
  const search = `/drive/contents?folderId=deliverables&query=${encodeURIComponent(fixture.client.name)}`;
  const listed = (await fixture.request('ana', search)).data;
  const internal = listed.files.find(row => row.source?.taskId === task.id), content = listed.files.find(row => row.source?.itemId === piece.id);
  assert.ok(internal && content);
  assert.equal(internal.fileId, saved.files[0].id); assert.equal(internal.originalName, 'documento-original.png');
  assert.match(internal.name, /\.png$/); assert.doesNotMatch(JSON.stringify(listed), /storageKey|storageArea/);
  const downloaded = await fixture.raw('ana', internal.fileUrl.replace(/^\/api/, ''));
  assert.equal(downloaded.status, 200); assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), finalPiecePng);
  assert.equal((await fixture.request('manager', search)).data.files.some(row => row.source?.taskId === task.id), false);
  assert.equal((await fixture.request('outside', search)).data.files.some(row => row.source?.taskId === task.id), false);
  const root = (await fixture.request('ana', '/drive/contents?folderId=deliverables')).data;
  let current = root.folders.find(row => row.name === fixture.client.name);
  assert.ok(current);
  for (let depth = 0; depth < 4; depth++) {
    const children = (await fixture.request('ana', `/drive/contents?folderId=${encodeURIComponent(current.id)}`)).data.folders;
    current = children.find(row => depth === 2 ? row.name === 'Tareas' : depth === 3 ? row.name === task.title : true);
    assert.ok(current);
  }
  await fixture.request('outside', `/drive/contents?folderId=${encodeURIComponent(current.id)}`, { expected: 404 });
  await fixture.request('ana', '/drive/folders', { method: 'POST', expected: 400, body: { name: 'No duplicar', parentId: current.id } });
  await fixture.db.user.update({ where: { id: fixture.actors.ana.id }, data: { modulePermissions: { drive: true, gestion: false, parrillas: false } } });
  assert.deepEqual((await fixture.request('ana', search)).data.files, []);
  assert.equal((await fixture.raw('ana', internal.fileUrl.replace(/^\/api/, ''))).status, 403);
  assert.equal((await fixture.raw('ana', content.fileUrl.replace(/^\/api/, ''))).status, 403);
});

test('Drive manual real guarda en plataforma, lee legado en memoria y conserva la papelera recuperable', async () => {
  await fixture.db.user.update({ where: { id: fixture.actors.ana.id }, data: { modulePermissions: { drive: true, gestion: true, parrillas: true } } });
  const bytes = Buffer.from('%PDF-1.4\nDrive nuevo'), oldBytes = Buffer.from('%PDF-1.4\nDrive antiguo');
  const form = new FormData(); form.append('file', new Blob([bytes], { type: 'application/pdf' }), 'manual-plataforma.pdf');
  const uploaded = await fixture.raw('ana', '/drive/upload', { method: 'POST', body: form });
  assert.equal(uploaded.status, 201);
  const { file } = await uploaded.json();
  const row = await fixture.db.driveFile.findUnique({ where: { id: file.id } });
  assert.equal(row.storageArea, 'PLATFORM');
  assert.equal(await status(row.storageKey), 200);
  assert.equal((await fetch(`${storageOrigin}/${memoryBucket}/${row.storageKey}`, { method: 'HEAD' })).status, 404);
  const old = await fixture.db.driveFile.create({ data: { storageArea: 'LEGACY', storageKey: row.storageKey, name: 'manual-anterior.pdf', mimeType: 'application/pdf', sizeBytes: oldBytes.length, uploadedById: fixture.actors.ana.id } });
  assert.equal((await fetch(`${storageOrigin}/${memoryBucket}/${row.storageKey}`, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: oldBytes })).status, 200);
  for (const [id, expected] of [[row.id, bytes], [old.id, oldBytes]]) {
    const read = await fixture.raw('ana', `/drive/managed-files/${id}/content`);
    assert.equal(read.status, 200); assert.deepEqual(Buffer.from(await read.arrayBuffer()), expected);
  }
  await fixture.request('ana', `/drive/files/${row.id}`, { method: 'DELETE' });
  assert.equal((await fixture.raw('ana', `/drive/managed-files/${row.id}/content`)).status, 404);
  assert.equal(await status(row.storageKey), 200, 'papelera mantiene bytes recuperables');
  await fixture.request('ana', `/drive/files/${row.id}/restore`, { method: 'PATCH', body: {} });
  assert.equal((await fixture.raw('ana', `/drive/managed-files/${row.id}/content`)).status, 200);
  assert.equal((await fixture.db.driveFile.findUnique({ where: { id: old.id } })).storageArea, 'LEGACY');
});
