import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { createTaskDeliverableService } from '../src/services/taskDeliverableService.js';
import { validateDeliverableFiles, taskDeliverableAccess, TASK_DELIVERABLE_LIMITS } from '../src/lib/taskDeliverables.js';
import { redactTaskBody } from '../src/lib/taskPrivacy.js';

const user = { id: 'ana', name: 'Ana', role: 'EDITOR' };
const request = (revision = 0, requestId = randomUUID()) => ({ expectedRevision: revision, requestId });
const file = (name = 'Entrega.pdf', text = '%PDF-1.4\nEntrega') => ({ originalname: name, mimetype: 'application/pdf', size: Buffer.byteLength(text), buffer: Buffer.from(text) });

function fixture({ task = {}, storage = {}, storageOptions = {} } = {}) {
  let data = { task: { id: 'task', creatorId: 'creator', contentItemId: null, isPrivate: false, deliverableRevision: 0,
    assignee: { userId: 'ana' }, collaborators: [{ member: { userId: 'bea' } }], viewers: [], status: 'EN_CURSO', startedAt: new Date('2026-11-05T12:00:00Z'), ...task }, files: [], events: [], queue: [] };
  const matches = (row, where = {}) => Object.entries(where).every(([key, value]) => value && typeof value === 'object' && !(value instanceof Date)
    ? ('in' in value ? value.in.includes(row[key]) : 'lte' in value ? row[key] <= value.lte : key === 'storageArea_storageKey' ? row.storageArea === value.storageArea && row.storageKey === value.storageKey : key === 'taskId_requestId' ? row.taskId === value.taskId && row.requestId === value.requestId : false)
    : row[key] === value);
  const table = key => ({
    findMany: async ({ where, take } = {}) => structuredClone(data[key].filter(row => matches(row, where)).sort((a, b) => key === 'events' ? b.revision - a.revision : (a.position || 0) - (b.position || 0)).slice(0, take)),
    findUnique: async ({ where }) => structuredClone(data[key].find(row => matches(row, where)) || null),
    findFirst: async ({ where }) => structuredClone(data[key].find(row => matches(row, where)) || null),
    create: async ({ data: row }) => { const saved = { id: randomUUID(), createdAt: new Date(), ...row }; data[key].push(saved); return structuredClone(saved); },
    createMany: async ({ data: rows }) => { for (const row of rows) data[key].push({ id: randomUUID(), createdAt: new Date(), ...row }); return { count: rows.length }; },
    deleteMany: async ({ where }) => { const old = data[key].length; data[key] = data[key].filter(row => !matches(row, where)); return { count: old - data[key].length }; },
    updateMany: async ({ where, data: patch }) => { const rows = data[key].filter(row => matches(row, where)); for (const row of rows) Object.assign(row, patch); return { count: rows.length }; },
    update: async ({ where, data: patch }) => { const row = data[key].find(row => matches(row, where)); Object.assign(row, patch); return structuredClone(row); },
    upsert: async ({ where, create, update }) => { let row = data[key].find(row => matches(row, where)); if (row) Object.assign(row, update); else { row = { id: randomUUID(), createdAt: new Date(), ...create }; data[key].push(row); } return structuredClone(row); }
  });
  const db = { task: { findUnique: async () => structuredClone(data.task), updateMany: async ({ where, data: patch }) => {
    if (!matches(data.task, where)) return { count: 0 }; Object.assign(data.task, patch); return { count: 1 };
  } }, taskDeliverable: table('files'), taskDeliverableEvent: table('events'), taskDeliverableCleanup: table('queue'),
    taskWorkCycle: { findFirst: async () => ({ id: 'cycle-existing' }) } };
  const objects = new Map(), calls = [];
  const store = {
    putS3Object: async ({ key, body, contentType }) => { calls.push(['put', key]); objects.set(key, { bytes: Buffer.from(body), mimeType: contentType, etag: 'v1' }); },
    createSignedUpload: async ({ key }) => { calls.push(['sign', key]); return { key, url: `http://localhost/upload/${key}` }; },
    headS3Object: async key => { const object = objects.get(key); return object && { size: object.bytes.length, mimeType: object.mimeType, etag: object.etag }; },
    readS3ObjectPrefix: async key => objects.get(key).bytes.subarray(0, 512),
    copyS3Object: async (from, to, options) => { calls.push(['copy', from, to]); assert.equal(options.etag, objects.get(from).etag); objects.set(to, structuredClone(objects.get(from))); },
    deleteFromS3: async key => { calls.push(['delete', key]); objects.delete(key); },
    ...storage
  };
  const service = createTaskDeliverableService({ db, storage: store, ...storageOptions, secret: 'test-deliverable-secret-32-characters', transaction: async work => {
    const before = structuredClone(data); try { return await work(db); } catch (error) { data = before; throw error; }
  } });
  return { service, db, storage: store, objects, calls, data: () => data };
}

test('deliverables keep native privacy, participant write rights and linked-piece separation', async () => {
  assert.equal(taskDeliverableAccess({ isPrivate: true, creatorId: 'creator', assignee: { userId: 'ana' }, viewers: [{ userId: 'reader' }] }, { id: 'boss', role: 'ADMIN' }).canRead, false);
  const f = fixture({ task: { isPrivate: true, viewers: [{ userId: 'reader' }] } });
  const read = await f.service.get('task', { id: 'reader', role: 'EDITOR' });
  assert.equal(read.canUpload, false); assert.equal(read.canReorder, false);
  await assert.rejects(f.service.replace('task', { id: 'reader' }, [file()], request()), { status: 403 });
  await f.service.replace('task', { id: 'bea', name: 'Bea' }, [file()], request());
  const linked = fixture({ task: { contentItemId: 'piece' } });
  await assert.rejects(linked.service.replace('task', user, [file()], request()), { status: 409, code: 'TASK_DELIVERABLE_LINKED_PIECE' });
  assert.equal(linked.calls.length, 0);
});

test('replacement always replaces the whole set even with the same names, keeping immutable metadata and clocks', async () => {
  const f = fixture(), taskBefore = structuredClone(f.data().task);
  const first = await f.service.replace('task', user, [file(), file('Audio.mp3', 'ID3 audio')], request());
  const second = await f.service.replace('task', user, [file('Entrega.pdf', '%PDF-1.4\nNueva versión')], request(first.revision));
  assert.equal(second.files.length, 1); assert.notEqual(second.files[0].id, first.files[0].id);
  assert.equal(second.history[0].action, 'REPLACED'); assert.equal(second.history[0].previousFiles.length, 2);
  assert.equal(second.history[0].cycleId, 'cycle-existing'); assert.equal(second.history[0].actorName, 'Ana');
  assert.equal(second.history[1].action, 'DELIVERED');
  assert.doesNotMatch(JSON.stringify(second.history), /storageKey|fileUrl|downloadUrl|localhost/);
  assert.deepEqual({ ...f.data().task, deliverableRevision: 0 }, taskBefore);
  await assert.rejects(f.service.file('task', first.files[0].id, user), { status: 404 });
});

test('stale revision and failed upload preserve the visible set and leave only new objects for cleanup', async () => {
  const f = fixture();
  const first = await f.service.replace('task', user, [file()], request());
  const calls = f.calls.length;
  await assert.rejects(f.service.replace('task', user, [file('Otro.pdf')], request(0)), { status: 409 });
  assert.equal(f.calls.length, calls);
  const before = structuredClone(f.data().files);
  const upload = f.storage.putS3Object;
  let attempts = 0;
  f.storage.putS3Object = async input => { if (++attempts === 2) throw new Error('storage failure'); return upload(input); };
  await assert.rejects(f.service.replace('task', user, [file('Uno.pdf'), file('Dos.pdf')], request(1)));
  assert.equal(f.data().events.length, 1); assert.equal(f.data().queue.length, 2);
  assert.ok(f.objects.has(before[0].storageKey));
  await f.service.cleanup({ now: new Date(Date.now() + 60_000) });
  assert.deepEqual([...f.objects.keys()], [before[0].storageKey]);
  assert.deepEqual(f.data().files, before); assert.equal(first.revision, 1);
});

test('a competing reorder during upload wins without exposing the stale replacement', async () => {
  const f = fixture();
  const first = await f.service.replace('task', user, [file('Uno.pdf'), file('Dos.pdf')], request());
  const upload = f.storage.putS3Object;
  const winningOrder = first.files.map(row => row.id).reverse();
  f.storage.putS3Object = async input => {
    await upload(input);
    await f.service.reorder('task', { id: 'bea', name: 'Bea' }, winningOrder, request(1));
  };
  await assert.rejects(f.service.replace('task', user, [file('Cambio.pdf')], request(1)), { status: 409 });
  const current = await f.service.get('task', user);
  assert.deepEqual(current.files.map(row => row.id), winningOrder);
  assert.equal(current.revision, 2); assert.equal(current.history.length, 2);
  assert.equal(current.history[0].action, 'REORDERED');
  await f.service.cleanup({ now: new Date(Date.now() + 60_000) });
  assert.equal(f.objects.size, 2);
});

test('request IDs return a receipt on retry without creating duplicate files or history', async () => {
  const f = fixture(), change = request();
  const first = await f.service.replace('task', user, [file()], change);
  const retried = await f.service.replace('task', user, [file()], change);
  assert.equal(retried.receipt.duplicate, true); assert.equal(retried.files[0].id, first.files[0].id);
  assert.equal(f.data().events.length, 1); assert.equal(f.calls.filter(([kind]) => kind === 'put').length, 1);
  await assert.rejects(f.service.replace('task', user, [file('Changed.pdf')], change), { status: 409 });
});

test('direct upload binds tickets to actor/task/revision and copies staging before commit', async () => {
  const f = fixture(), change = request();
  const prepared = await f.service.prepare('task', user, [{ name: 'Entrega.pdf', mimeType: 'application/pdf', size: file().size }], change);
  f.objects.set(prepared.uploads[0].key, { bytes: file().buffer, mimeType: 'application/pdf', etag: 'etag1' });
  await assert.rejects(f.service.confirm('task', { id: 'bea' }, prepared.uploads, change), { status: 403 });
  const result = await f.service.confirm('task', user, prepared.uploads, change);
  const stagedCleanup = f.data().queue.find(row => row.storageKey === prepared.uploads[0].key);
  assert.ok(stagedCleanup.nextAttemptAt.getTime() > Date.now() + 15 * 60_000, 'a still-valid PUT must not recreate an already-cleaned staging object');
  const key = f.data().files[0].storageKey;
  assert.notEqual(key, prepared.uploads[0].key);
  f.objects.set(prepared.uploads[0].key, { bytes: Buffer.from('modified later'), mimeType: 'text/plain' });
  assert.deepEqual(Buffer.from(f.objects.get(key).bytes), file().buffer);
  const retry = await f.service.confirm('task', user, prepared.uploads, change);
  assert.equal(retry.receipt.duplicate, true); assert.equal(retry.files[0].id, result.files[0].id);
});

test('order requires a complete unique set and current revision; receipt retry is idempotent', async () => {
  const f = fixture(), first = await f.service.replace('task', user, [file('Uno.pdf'), file('Dos.pdf')], request());
  await assert.rejects(f.service.reorder('task', user, [first.files[0].id], request(1)), { status: 400 });
  await assert.rejects(f.service.reorder('task', user, undefined, request(1)), { status: 400 });
  const order = first.files.map(row => row.id).reverse(), change = request(1);
  const changed = await f.service.reorder('task', user, order, change);
  assert.deepEqual(changed.files.map(row => row.id), order); assert.equal(changed.revision, 2);
  assert.equal(changed.history[0].action, 'REORDERED');
  assert.equal((await f.service.reorder('task', user, order, change)).receipt.duplicate, true);
  assert.equal(f.calls.filter(([kind]) => kind === 'put').length, 2);
});

test('cleanup retries storage errors and never deletes current objects', async () => {
  let fail = true;
  const f = fixture({ storage: { deleteFromS3: async () => { if (fail) throw Object.assign(new Error('secret/key/url'), { code: 'Timeout' }); } } });
  await f.service.replace('task', user, [file()], request());
  const currentKey = f.data().files[0].storageKey;
  f.data().queue.push({ id: 'current', storageKey: currentKey, taskId: 'task', attempts: 0, nextAttemptAt: new Date(0) });
  f.data().queue.push({ id: 'orphan', storageKey: 'task-deliverables/task/staging/orphan', taskId: 'task', attempts: 0, nextAttemptAt: new Date(0) });
  await f.service.cleanup({ now: new Date('2026-11-05T18:00:00Z') });
  assert.equal(f.data().queue.find(row => row.id === 'orphan').attempts, 1);
  assert.doesNotMatch(JSON.stringify(f.data().queue), /secret\/key\/url/);
  fail = false;
  await f.service.cleanup({ now: new Date('2026-11-06T18:00:00Z') });
  assert.equal(f.data().queue.length, 0);
  assert.equal(f.data().files[0].storageKey, currentKey);
});

test('selection limits reuse central unsafe-file validation and handle the full 2GB bound', () => {
  assert.equal(TASK_DELIVERABLE_LIMITS.maxFiles, 20);
  assert.doesNotThrow(() => validateDeliverableFiles([{ name: 'master.mov', mimeType: 'video/quicktime', size: 2 * 1024 ** 3 }], 'direct'));
  for (const files of [[], Array.from({ length: 21 }, () => file()), [file('macro.xlsm')], [{ name: 'large.bin', mimeType: 'application/octet-stream', size: 2 * 1024 ** 3 + 1 }]]) assert.throws(() => validateDeliverableFiles(files, 'direct'));
  assert.throws(() => validateDeliverableFiles([{ name: 'large.pdf', mimeType: 'application/pdf', size: 201 * 1024 ** 2 }], 'server'), { status: 413 });
  assert.throws(() => validateDeliverableFiles([null], 'direct'), { status: 400 });
});

test('recognized video bytes disguised as an image cannot replace the existing delivery', async () => {
  const f = fixture();
  const before = await f.service.replace('task', user, [file()], request());
  const bytes = Buffer.from([0, 0, 0, 24, ...Buffer.from('ftypisom'), 0, 0, 0, 0]);
  await assert.rejects(f.service.replace('task', user, [{ originalname: 'falsa.png', mimetype: 'image/png', size: bytes.length, buffer: bytes }], request(1)), { status: 400 });
  const prepared = await f.service.prepare('task', user, [{ name: 'falsa.png', mimeType: 'image/png', size: bytes.length }], request(1));
  f.objects.set(prepared.uploads[0].key, { bytes, mimeType: 'image/png', etag: 'mismatch' });
  await assert.rejects(f.service.confirm('task', user, prepared.uploads, prepared), { status: 400 });
  assert.deepEqual((await f.service.get('task', user)).files, before.files);
});

test('the private task body redactor also removes its new internal deliverables', () => {
  const visible = redactTaskBody({ id: 'task', isPrivate: true, deliverables: [{ id: 'file', name: 'Confidencial.pdf', storageKey: 'private-key' }] });
  assert.equal(visible.deliverables, undefined);
});

test('new task deliveries require dedicated configuration and retain their explicit area through signed confirmation', async () => {
  let configured = false;
  const f = fixture({ storageOptions: { storage: undefined, assertStorageConfigured: () => { if (!configured) throw Object.assign(new Error('No dedicado'), { status: 503 }); }, storageForArea: area => {
    assert.equal(area, 'PLATFORM'); return f.storage;
  } } });
  await assert.rejects(f.service.replace('task', user, [file()], request()), { status: 503 });
  await assert.rejects(f.service.prepare('task', user, [{ name: 'Entrega.pdf', mimeType: 'application/pdf', size: file().size }], request()), { status: 503 });
  assert.equal(f.calls.length, 0); assert.equal(f.data().files.length, 0);
  configured = true;
  const prepared = await f.service.prepare('task', user, [{ name: 'Entrega.pdf', mimeType: 'application/pdf', size: file().size }], request());
  f.objects.set(prepared.uploads[0].key, { bytes: file().buffer, mimeType: 'application/pdf', etag: 'v1' });
  await f.service.confirm('task', user, prepared.uploads, prepared);
  assert.equal(f.data().files[0].storageArea, 'PLATFORM');
  assert.equal(f.data().queue[0].storageArea, 'PLATFORM');
});

test('cleanup identifies objects by area and key, keeping a same-key live file in the other bucket', async () => {
  const deleted = [];
  const f = fixture({ storageOptions: { storage: undefined, storageForArea: area => ({ deleteFromS3: async key => deleted.push([area, key]) }) } });
  const key = 'task-deliverables/task/files/same-key';
  f.data().files.push({ id: 'current', taskId: 'task', storageKey: key, storageArea: 'PLATFORM' });
  f.data().queue.push({ id: 'old', taskId: 'task', storageKey: key, storageArea: 'LEGACY', attempts: 0, nextAttemptAt: new Date(0) });
  f.data().queue.push({ id: 'current-queued', taskId: 'task', storageKey: key, storageArea: 'PLATFORM', attempts: 0, nextAttemptAt: new Date(0) });
  await f.service.cleanup();
  assert.deepEqual(deleted, [['LEGACY', key]]);
  assert.equal(f.data().files.length, 1);
});

test('a pre-separation ticket cannot create a new legacy delivery, but its committed receipt remains readable', async () => {
  const f = fixture(), prepared = await f.service.prepare('task', user, [{ name: 'Entrega.pdf', mimeType: 'application/pdf', size: file().size }], request());
  const old = structuredClone(prepared), claims = jwt.decode(old.uploads[0].token);
  delete claims.storageArea;
  old.uploads[0].token = jwt.sign(claims, 'test-deliverable-secret-32-characters');
  f.objects.set(old.uploads[0].key, { bytes: file().buffer, mimeType: 'application/pdf', etag: 'v1' });
  await assert.rejects(f.service.confirm('task', user, old.uploads, old), { status: 409 });
  assert.equal(f.data().files.length, 0); assert.equal(f.calls.filter(row => row[0] === 'copy').length, 0);
  const current = await f.service.confirm('task', user, prepared.uploads, prepared);
  const replay = await f.service.confirm('task', user, old.uploads, old);
  assert.equal(replay.receipt.duplicate, true); assert.deepEqual(replay.files, current.files);
});
