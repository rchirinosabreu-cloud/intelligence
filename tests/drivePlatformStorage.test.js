import test from 'node:test';
import assert from 'node:assert/strict';
import { uploadDriveFile, readManagedDriveFile, trashDriveFile, restoreDriveFile } from '../src/services/driveService.js';

const incoming = { originalname: 'manual.pdf', mimetype: 'application/pdf', size: 4, buffer: Buffer.from('%PDF') };
const actorId = 'ana';

test('manual Drive uploads require platform storage and persist their area without writing agency memory', async () => {
  let saved, configured = false;
  const writes = [], db = { driveFile: { create: async ({ data }) => { saved = { id: 'manual', ...data }; return saved; } } };
  const platformStorage = { putS3Object: async input => { writes.push(input); return { key: input.key, size: input.body.length, mimeType: input.contentType }; } };
  const options = { db, file: incoming, actorId, platformStorage, assertStorageConfigured: () => { if (!configured) throw Object.assign(new Error('Sin almacenamiento de plataforma'), { status: 503 }); } };
  await assert.rejects(uploadDriveFile(options), { status: 503 });
  assert.equal(writes.length, 0); assert.equal(saved, undefined);
  configured = true;
  await uploadDriveFile(options);
  assert.equal(saved.storageArea, 'PLATFORM'); assert.equal(writes.length, 1);
});

test('manual Drive reads legacy in agency memory and new files in platform even when object keys coincide', async () => {
  let area = 'LEGACY';
  const db = { driveFile: { findFirst: async () => ({ id: 'manual', storageArea: area, storageKey: 'same-key', name: 'manual.pdf', mimeType: 'application/pdf' }) } };
  const calls = [];
  const legacyStorage = { downloadBuffer: async ({ key }) => { calls.push(['memory', key]); return { body: Buffer.from('old'), size: 3 }; } };
  const platformStorage = { getS3ObjectBuffer: async key => { calls.push(['platform', key]); return Buffer.from('new'); } };
  assert.equal((await readManagedDriveFile({ db, id: 'manual', legacyStorage, platformStorage })).body.toString(), 'old');
  area = 'PLATFORM';
  assert.equal((await readManagedDriveFile({ db, id: 'manual', legacyStorage, platformStorage })).body.toString(), 'new');
  assert.deepEqual(calls, [['memory', 'same-key'], ['platform', 'same-key']]);
  area = 'UNKNOWN';
  await assert.rejects(readManagedDriveFile({ db, id: 'manual', legacyStorage, platformStorage }), { status: 503 });
  assert.equal(calls.length, 2);
});

test('manual Drive keeps recoverable trash and restoration without moving or deleting either bucket', async () => {
  const row = { id: 'manual', storageArea: 'PLATFORM', storageKey: 'same-key', deletedAt: null };
  const db = { driveFile: { update: async ({ data }) => Object.assign(row, data) } };
  await trashDriveFile({ id: row.id, db }); assert.ok(row.deletedAt);
  await restoreDriveFile({ id: row.id, db }); assert.equal(row.deletedAt, null);
  assert.equal(row.storageArea, 'PLATFORM'); assert.equal(row.storageKey, 'same-key');
});
