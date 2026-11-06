import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTaskPieceFixture, finalPiecePng } from './support/taskPieceFixture.js';

let fixture;
before(async () => { fixture = await createTaskPieceFixture({ port: 8092 }); });
after(async () => { await fixture?.close(); });

test('real login reads three months and the same linked task and piece', async () => {
  for (const plan of fixture.plans) {
    const response = await fixture.request('ana', `/content/plans/${plan.id}`);
    assert.equal(response.data.month, plan.month);
    assert.equal(response.data.items.length, 3);
  }
  const piece = fixture.pieces.current.approved;
  const response = await fixture.request('ana', `/tasks/${piece.taskId}`);
  assert.equal(response.data.contentItemId, piece.id);
  assert.equal(response.data.contentItem.id, piece.id);
  assert.equal(response.data.id, piece.taskId);
});

test('multipart delivery persists one asset, reads its bytes and requests review without completing or publishing', async () => {
  const piece = fixture.pieces.current.approved;
  const before = await fixture.evidence(piece);
  const response = await fixture.upload('ana', piece.id, 'entrega-aprobada.png');
  assert.equal(response.data.length, 1);
  const after = await fixture.evidence(piece);
  assert.equal(after.assets.length, before.assets.length + 1);
  assert.equal(after.itemStatus, 'APROBADO');
  assert.ok(after.revisionRequestedAt);
  assert.deepEqual(after.tasks, before.tasks, 'delivery does not complete any personal or global state');
  assert.deepEqual(after.publications, before.publications);
  const download = await fixture.raw('ana', `/content/items/${piece.id}/final-assets/${after.assets[0].id}`);
  assert.equal(download.status, 200);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), finalPiecePng);
  const task = (await fixture.request('ana', `/tasks/${piece.taskId}`)).data;
  const plan = (await fixture.request('ana', `/content/plans/${piece.planId}`)).data;
  assert.equal(task.contentItem.revisionRequestedAt, after.revisionRequestedAt.toISOString());
  assert.equal(plan.items.find(item => item.id === piece.id).finalAssets[0].id, after.assets[0].id);
});

test('real direct upload confirms the stored object once and Drive keeps one external reference', async () => {
  const piece = fixture.pieces.current.production;
  const before = await fixture.evidence(piece);
  const tickets = (await fixture.request('ana', `/content/items/${piece.id}/final-assets/direct-upload`, { method: 'POST', body: { files: [{ name: 'directa.png', mimeType: 'image/png', size: finalPiecePng.length }] } })).data;
  assert.equal(tickets.length, 1);
  assert.equal(new URL(tickets[0].url).hostname, '127.0.0.1');
  const stored = await fetch(tickets[0].url, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: finalPiecePng });
  assert.equal(stored.status, 200);
  assert.equal((await fixture.evidence(piece)).assets.length, 0, 'an unconfirmed object is not a final asset');
  await fixture.request('ana', `/content/items/${piece.id}/final-assets/confirm`, { method: 'POST', body: { uploads: tickets }, expected: 201 });
  const response = await fixture.request('ana', `/content/items/${piece.id}/final-assets/drive`, { method: 'POST', expected: 201, body: { url: 'https://drive.google.com/file/d/local-fictitious-final-piece-2026/view', name: 'Video ficticio en Drive' } });
  assert.equal(response.data.length, 2);
  const after = await fixture.evidence(piece);
  assert.equal(after.assets.filter(asset => asset.storageKey).length, 1);
  assert.equal(after.assets.filter(asset => asset.externalUrl).length, 1);
  assert.equal(after.revisionRequestedAt, null);
  assert.equal(after.itemStatus, 'EN_PRODUCCION');
  assert.deepEqual(after.tasks, before.tasks);
  assert.deepEqual(after.publications, before.publications);
});

test('a task participant without Parrillas cannot read or upload final assets', async () => {
  const piece = fixture.pieces.current.approved;
  const before = await fixture.evidence(piece);
  await fixture.request('carlos', `/tasks/${piece.taskId}`);
  await fixture.request('carlos', `/content/plans/${piece.planId}`, { expected: 403 });
  await fixture.upload('carlos', piece.id, 'sin-permiso.png', 403);
  await fixture.request('carlos', `/content/items/${piece.id}/final-assets/direct-upload`, { method: 'POST', body: { files: [{ name: 'sin-permiso.png', mimeType: 'image/png', size: finalPiecePng.length }] }, expected: 403 });
  const response = await fixture.raw('carlos', `/content/items/${piece.id}/final-assets/${before.assets[0].id}`);
  assert.equal(response.status, 403);
  assert.deepEqual(await fixture.evidence(piece), before);
});

test('delivery to a published piece never reopens review, changes its task or publishes again', async () => {
  const piece = fixture.pieces.current.published;
  const before = await fixture.evidence(piece);
  await fixture.upload('ana', piece.id, 'archivo-publicado.png');
  await fixture.request('ana', `/content/items/${piece.id}/request-revision`, { method: 'POST', body: {}, expected: 409 });
  const after = await fixture.evidence(piece);
  assert.equal(after.itemStatus, 'PUBLICADO');
  assert.equal(after.revisionRequestedAt, null);
  assert.equal(after.assets.length, 1);
  assert.deepEqual(after.tasks, before.tasks);
  assert.deepEqual(after.publications, before.publications);
});
