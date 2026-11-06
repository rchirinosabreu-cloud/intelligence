import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createTaskPieceFixture, finalPiecePng } from './support/taskPieceFixture.js';

let fixture, storageOrigin;
const legacyBucket = 'task-piece-test';
const finalsBucket = 'task-piece-platform-test';
before(async () => {
  fixture = await createTaskPieceFixture({ port: 8096 });
  const health = await fetch(`${fixture.api.origin}/api/health`).then(response => response.json());
  assert.equal(health.isolatedTaskPieceTest, true);
  assert.equal(health.deliveryBucket, finalsBucket);
  assert.equal(health.evidenceBucket, legacyBucket);
  storageOrigin = health.storageOrigin;
});
after(async () => { await fixture?.close(); });
const objectUrl = (bucket, key) => `${storageOrigin}/${bucket}/${key}`;
const exists = async (bucket, key) => (await fetch(objectUrl(bucket, key), { method: 'HEAD' })).status;
const upload = async (fx, route, revision, name = 'final.png', expected = 201) => {
  const form = new FormData(); form.append('expectedRevision', String(revision)); form.append('requestId', randomUUID());
  form.append('files', new Blob([finalPiecePng], { type: 'image/png' }), name);
  const response = await fx.raw('ana', route, { method: 'POST', body: form });
  const data = await response.json(); assert.equal(response.status, expected, JSON.stringify(data)); return data;
};

test('finales nuevos usan el bucket dedicado y los temporales del chat conservan su bucket', async () => {
  const piece = fixture.pieces.current.production;
  await fixture.upload('ana', piece.id, 'final-desde-editor.png');
  const assets = (await fixture.evidence(piece)).assets;
  assert.equal(assets.length, 1);
  assert.equal(assets[0].storageArea, 'PLATFORM');
  assert.equal(await exists(finalsBucket, assets[0].storageKey), 200);
  assert.equal(await exists(legacyBucket, assets[0].storageKey), 404);
  const response = await fixture.raw('ana', `/content/items/${piece.id}/final-assets/${assets[0].id}`);
  assert.equal(response.status, 200); assert.deepEqual(Buffer.from(await response.arrayBuffer()), finalPiecePng);
  const form = new FormData(); form.append('file', new Blob([finalPiecePng], { type: 'image/png' }), 'adjunto.png');
  const temp = await fixture.raw('ana', '/tasks/upload-temp', { method: 'POST', body: form });
  assert.equal(temp.status, 200); const saved = await temp.json();
  assert.ok(new URL(saved.url).pathname.startsWith(`/${legacyBucket}/temp/`));
  assert.equal((await fetch(saved.url)).status, 200);
});

test('un final legado sigue legible y sustituirlo borra solo su ubicación antigua, aunque otra área tenga la misma clave', async () => {
  const piece = fixture.pieces.current.approved;
  const key = `content-plans/fixture/2026-11/${piece.id}/final-assets/legacy.png`;
  await fetch(objectUrl(legacyBucket, key), { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: finalPiecePng });
  await fetch(objectUrl(finalsBucket, key), { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: 'objeto independiente' });
  const old = await fixture.db.contentItemFinalAsset.create({ data: { contentItemId: piece.id, storageKey: key, name: 'legacy.png', mimeType: 'image/png', size: finalPiecePng.length, position: 0 } });
  assert.equal(old.storageArea, 'LEGACY');
  const before = await fixture.raw('ana', `/content/items/${piece.id}/final-assets/${old.id}`);
  assert.equal(before.status, 200); assert.deepEqual(Buffer.from(await before.arrayBuffer()), finalPiecePng);
  const saved = await upload(fixture, `/content/items/${piece.id}/delivery/replace`, 0, 'corregida.png');
  assert.equal(saved.files.length, 1);
  const row = await fixture.db.contentItemFinalAsset.findUnique({ where: { id: saved.files[0].id } });
  assert.equal(row.storageArea, 'PLATFORM');
  assert.equal(await exists(finalsBucket, row.storageKey), 200);
  assert.equal(await exists(legacyBucket, key), 404);
  assert.equal(await (await fetch(objectUrl(finalsBucket, key))).text(), 'objeto independiente');
  assert.equal((await fixture.raw('ana', `/content/items/${piece.id}/final-assets/${old.id}`)).status, 404);
});

test('los entregables internos y su limpieza resuelven el área persistida, sin tocar evidencias', async () => {
  const task = (await fixture.request('manager', '/tasks', { method: 'POST', expected: 201, body: {
    title: 'Almacenamiento final aislado', clientId: fixture.client.id, assigneeId: fixture.actors.ana.memberId,
  } })).data;
  const base = `/tasks/${task.id}/deliverables`;
  const saved = await upload(fixture, base, 0);
  const old = await fixture.db.taskDeliverable.findUnique({ where: { id: saved.files[0].id } });
  assert.equal(old.storageArea, 'PLATFORM');
  assert.equal(await exists(finalsBucket, old.storageKey), 200);
  assert.equal(await exists(legacyBucket, old.storageKey), 404);
  await fetch(objectUrl(legacyBucket, old.storageKey), { method: 'PUT', body: 'evidencia independiente' });
  const download = await fixture.raw('ana', `${base}/${old.id}/download`);
  assert.equal(download.status, 200); assert.deepEqual(Buffer.from(await download.arrayBuffer()), finalPiecePng);
  await upload(fixture, base, saved.revision, 'nuevo.png');
  const cleanup = await fetch(`${fixture.api.origin}/__test/cleanup-deliverables`, { method: 'POST' });
  assert.equal(cleanup.status, 200);
  assert.equal(await exists(finalsBucket, old.storageKey), 404);
  assert.equal(await (await fetch(objectUrl(legacyBucket, old.storageKey))).text(), 'evidencia independiente');
});

test('sin configuración dedicada se rechazan nuevas entregas, pero la lectura y los temporales anteriores siguen disponibles', async () => {
  const disabled = await createTaskPieceFixture({ port: 8097, deliveryStorage: false });
  try {
    const piece = disabled.pieces.current.production;
    const snapshot = (await disabled.request('ana', `/content/items/${piece.id}/delivery`)).data;
    assert.equal(snapshot.files.length, 0);
    await upload(disabled, `/content/items/${piece.id}/delivery/replace`, snapshot.revision, 'no-fallback.png', 503);
    const task = (await disabled.request('manager', '/tasks', { method: 'POST', expected: 201, body: {
      title: 'Sin configuración', clientId: disabled.client.id, assigneeId: disabled.actors.ana.memberId,
    } })).data;
    await upload(disabled, `/tasks/${task.id}/deliverables`, 0, 'no-fallback.png', 503);
    assert.equal(await disabled.db.taskDeliverable.count({ where: { taskId: task.id } }), 0);
    assert.equal(await disabled.db.contentItemFinalAsset.count({ where: { contentItemId: piece.id } }), 0);
    const form = new FormData(); form.append('file', new Blob([finalPiecePng], { type: 'image/png' }), 'comentario.png');
    const temp = await disabled.raw('ana', '/tasks/upload-temp', { method: 'POST', body: form });
    assert.equal(temp.status, 200);
  } finally { await disabled.close(); }
});
