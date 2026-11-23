import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContentDeliveryService } from '../src/services/contentDeliveryService.js';

const actor = { userId: 'author' };
const png = Buffer.from('89504e470d0a1a0a00000000', 'hex');
const file = (name = 'igual.png') => ({ originalname: name, mimetype: 'image/png', size: png.length, buffer: png });

function fixture({ status = 'APROBADO', failPut = false, failCopy = false, failDelete = false, failHistory = false, clock } = {}) {
  let state = { item: { id: 'piece', finalAssetsRevision: 0, status, revisionRequestedAt: null, deletedAt: null, plan: { deletedAt: null } }, files: [{ id: 'old', contentItemId: 'piece', name: 'igual.png', storageKey: 'old-object', storageArea: 'LEGACY', size: 9, mimeType: 'image/png', position: 0 }], uploads: [], changes: [], deletions: [] };
  let seq = 0;
  const logs = [];
  const matches = (row, where = {}) => Object.entries(where).every(([key, val]) => key === 'storageArea_storageKey' ? matches(row, val) : val && typeof val === 'object' && !(val instanceof Date) ? ('in' in val ? val.in.includes(row[key]) : 'lte' in val ? row[key] <= val.lte : 'gt' in val ? row[key] > val.gt : true) : row[key] === val);
  const update = (row, data) => { for (const [key, value] of Object.entries(data)) row[key] = value && typeof value === 'object' && 'increment' in value ? row[key] + value.increment : value; return structuredClone(row); };
  const table = key => ({
    findMany: async ({ where = {}, take } = {}) => structuredClone(state[key].filter(row => matches(row, where)).slice(0, take)),
    findUnique: async ({ where }) => structuredClone(state[key].find(row => matches(row, where)) || null),
    findFirst: async ({ where }) => structuredClone(state[key].find(row => matches(row, where)) || null),
    create: async ({ data }) => { if (key === 'changes' && failHistory) throw new Error('history unavailable'); const row = { id: `id-${++seq}`, createdAt: new Date(), ...structuredClone(data) }; state[key].push(row); return structuredClone(row); },
    update: async ({ where, data }) => update(state[key].find(row => matches(row, where)), data),
    updateMany: async ({ where, data }) => { const rows = state[key].filter(row => matches(row, where)); rows.forEach(row => update(row, data)); return { count: rows.length }; },
    deleteMany: async ({ where }) => { state[key] = state[key].filter(row => !matches(row, where)); },
    delete: async ({ where }) => { const row = state[key].find(row => matches(row, where)); state[key] = state[key].filter(row => row !== state[key].find(r => matches(r, where))); return row; },
    upsert: async ({ where, create, update: data }) => { const row = state[key].find(row => matches(row, where)); if (row) return update(row, data); const next = { id: `id-${++seq}`, attempts: 0, ...create }; state[key].push(next); return next; }
  });
  const db = {
    contentItem: { findUnique: async ({ where }) => where.id === 'piece' ? structuredClone(state.item) : null, update: async ({ data }) => update(state.item, data) },
    contentItemFinalAsset: table('files'), contentItemDeliveryUpload: table('uploads'), contentItemDeliveryChange: table('changes'), contentAssetDeletion: table('deletions'),
    user: { findUnique: async () => ({ name: 'Autora real' }) },
    $queryRaw: async () => { logs.push('lock'); return [{ id: 'piece' }]; },
    $transaction: async fn => { const before = structuredClone(state); try { return await fn(db); } catch (error) { state = before; throw error; } }
  };
  const objects = new Map([['old-object', { body: png, mimeType: 'image/png', etag: 'old-etag' }]]);
  const storage = {
    put: async ({ key, body, contentType }) => { if (failPut) throw new Error('storage unavailable'); objects.set(key, { body, mimeType: contentType, etag: `etag-${key}` }); },
    sign: async ({ key }) => ({ url: `http://storage.invalid/${key}`, key }),
    head: async key => { const o = objects.get(key); return o ? { size: o.body.length, mimeType: o.mimeType, etag: o.etag } : null; },
    prefix: async key => objects.get(key).body,
    copy: async (key, target, opts) => { if (failCopy) throw new Error('copy failed'); assert.equal(opts.etag, objects.get(key).etag); objects.set(target, structuredClone(objects.get(key))); },
    delete: async key => { logs.push(`delete:${key}`); if (failDelete) throw new Error('delete unavailable'); objects.delete(key); }
  };
  const service = createContentDeliveryService({ db, storage, ...(clock ? { clock } : {}) });
  return { service, db, storage, objects, logs, state: () => state };
}

test('replacement keeps one ordered new set despite identical names, records metadata and requests review without task writes', async () => {
  const f = fixture();
  const result = await f.service.replace('piece', [file(), file()], { actor, expectedRevision: 0, requestId: 'request-1' });
  assert.equal(result.revision, 1);
  assert.equal(result.files.length, 2);
  assert.deepEqual(result.files.map(row => row.position), [0, 1]);
  assert.ok(result.files.every(row => row.id !== 'old'));
  assert.ok(f.state().item.revisionRequestedAt);
  assert.equal(f.state().item.status, 'APROBADO');
  assert.equal(result.history[0].action, 'REPLACED');
  assert.equal(result.history[0].actorName, 'Autora real');
  assert.equal(result.history[0].previousFiles[0].name, 'igual.png');
  assert.doesNotMatch(JSON.stringify(result.history), /storageKey|externalUrl|old-object|http/);
  // Papelera: lo retirado sigue guardado y se ofrece para restaurar, sin exponer su llave.
  assert.equal(f.objects.has('old-object'), true);
  assert.deepEqual(result.trash.map(row => [row.id, row.name]), [['old', 'igual.png']]);
  assert.doesNotMatch(JSON.stringify(result.trash), /storageKey|old-object|http/);
});

test('a failed upload or failed atomic history write preserves the old delivery and revision', async () => {
  for (const option of ['failPut', 'failHistory', 'failCopy']) {
    const f = fixture({ [option]: true });
    await assert.rejects(f.service.replace('piece', [file()], { actor, expectedRevision: 0, requestId: 'request-1' }));
    assert.deepEqual(f.state().files.map(row => row.id), ['old']);
    assert.equal(f.state().item.finalAssetsRevision, 0);
    assert.equal(f.state().item.revisionRequestedAt, null);
    assert.equal(f.state().changes.length, 0);
    assert.equal(f.state().uploads[0].state, 'PENDING');
    assert.ok(f.objects.has('old-object'));
  }
});

test('direct upload cannot confirm a partial set, another actor, or a stale delivery', async () => {
  const f = fixture();
  const prepared = await f.service.prepare('piece', [file(), file()].map(row => ({ name: row.originalname, size: row.size, mimeType: row.mimetype })), { actor, expectedRevision: 0, requestId: 'direct-1' });
  await assert.rejects(f.service.confirm('piece', { uploadId: prepared.uploadId, expectedRevision: 0, actor: { userId: 'someone-else' } }), error => error.status === 403);
  await f.storage.put({ key: prepared.tickets[0].key, body: png, contentType: 'image/png' });
  await assert.rejects(f.service.confirm('piece', { uploadId: prepared.uploadId, expectedRevision: 0, actor }), error => error.status === 409);
  assert.deepEqual(f.state().files.map(row => row.id), ['old']);
  await f.storage.put({ key: prepared.tickets[1].key, body: png, contentType: 'image/png' });
  await f.service.mutate('piece', { actor, action: 'REORDERED', material: false }, async () => {});
  await assert.rejects(f.service.confirm('piece', { uploadId: prepared.uploadId, expectedRevision: 0, actor }), error => error.status === 409);
  assert.equal(f.state().item.finalAssetsRevision, 1);
  assert.deepEqual(f.state().files.map(row => row.id), ['old']);
});

test('confirmed direct upload copies into private final keys and retry is idempotent', async () => {
  const f = fixture();
  const prepared = await f.service.prepare('piece', [{ name: 'one.png', size: png.length, mimeType: 'image/png' }], { actor, expectedRevision: 0, requestId: 'direct-1' });
  await f.storage.put({ key: prepared.tickets[0].key, body: png, contentType: 'image/png' });
  const first = await f.service.confirm('piece', { uploadId: prepared.uploadId, expectedRevision: 0, actor });
  assert.notEqual(first.files[0].storageKey, prepared.tickets[0].key);
  const again = await f.service.confirm('piece', { uploadId: prepared.uploadId, expectedRevision: 0, actor });
  assert.equal(again.revision, 1);
  assert.equal(f.state().changes.length, 1);
  assert.deepEqual(again.files, first.files);
});

test('physical deletion failure remains durable and does not undo a committed delivery', async () => {
  const f = fixture({ failDelete: true });
  const result = await f.service.replace('piece', [file()], { actor, expectedRevision: 0, requestId: 'request-1' });
  assert.equal(result.revision, 1);
  assert.ok(f.state().deletions.some(row => row.storageKey === 'old-object'));
  assert.ok(f.objects.has('old-object'));
  assert.equal(f.state().files.some(row => row.id === 'old'), false);
});

test('replacement validates the entire selection before storage and published status stays published', async () => {
  const f = fixture({ status: 'PUBLICADO' });
  await assert.rejects(f.service.replace('piece', Array.from({ length: 21 }, () => file()), { actor, expectedRevision: 0, requestId: 'too-many' }), error => error.status === 400);
  await assert.rejects(f.service.replace('piece', [file()], { actor, expectedRevision: -1, requestId: 'bad-revision' }), error => error.status === 400);
  assert.equal(f.objects.size, 1);
  await f.service.replace('piece', [file()], { actor, expectedRevision: 0, requestId: 'published' });
  assert.equal(f.state().item.status, 'PUBLICADO');
  assert.equal(f.state().item.revisionRequestedAt, null);
});

test('legacy writers share the same transaction boundary and routes supply authenticated authors', () => {
  const source = readFileSync('src/services/contentService.js', 'utf8');
  for (const name of ['uploadContentItemFinalAssets', 'confirmContentItemFinalAssets', 'addContentItemDriveAsset', 'deleteContentItemFinalAssetById']) {
    const body = source.slice(source.indexOf(`export const ${name}`)).split(/\nexport const /)[0];
    assert.match(body, /mutateContentDelivery\(/, name);
  }
  const routes = readFileSync('src/routes/api/content.js', 'utf8');
  assert.match(routes, /replaceContentDelivery\(req\.params\.id, req\.files, \{[^}]*actor: req\.user/s);
  assert.match(routes, /reorderContentItemFinalAssets\(req\.params\.id, req\.body\?\.order, \{[^}]*actor: req\.user/s);
});

test('retrying direct tickets near expiration keeps staging until the renewed PUT has expired', async () => {
  let now = new Date('2026-11-05T12:00:00Z');
  const f = fixture({ clock: () => now });
  const files = [{ name: 'one.png', size: png.length, mimeType: 'image/png' }];
  const options = { actor, expectedRevision: 0, requestId: 'renewed' };
  const first = await f.service.prepare('piece', files, options);
  now = new Date('2026-11-05T12:59:00Z');
  const renewed = await f.service.prepare('piece', files, options);
  assert.equal(renewed.uploadId, first.uploadId);
  assert.ok(f.state().uploads[0].expiresAt >= new Date(now.getTime() + 900_000));
});

test('new set may contain 20 files and removes Drive references without remote Drive deletion', async () => {
  const f = fixture();
  f.state().files.push({ id: 'drive', contentItemId: 'piece', name: 'externo', storageKey: null, externalUrl: 'https://drive.google.com/file/d/test/view', externalFileId: 'test', position: 1 });
  const result = await f.service.replace('piece', Array.from({ length: 20 }, (_, index) => file(`foto-${index}.png`)), { actor, expectedRevision: 0, requestId: 'twenty' });
  assert.equal(result.files.length, 20);
  assert.equal(result.history[0].previousFiles.length, 2);
  assert.ok(f.logs.every(value => !value.includes('drive.google')));
});

test('abandoned and committed staging is swept after ticket expiry while current objects remain', async () => {
  let now = new Date('2026-11-05T12:00:00Z');
  const f = fixture({ clock: () => now });
  const result = await f.service.replace('piece', [file()], { actor, expectedRevision: 0, requestId: 'complete' });
  const finalKey = result.files[0].storageKey;
  const staging = f.state().uploads[0].manifest[0].key;
  const abandoned = await f.service.prepare('piece', [{ name: 'abandoned.png', size: png.length, mimeType: 'image/png' }], { actor, expectedRevision: 1, requestId: 'abandoned' });
  await f.storage.put({ key: abandoned.tickets[0].key, body: png, contentType: 'image/png' });
  assert.ok(f.objects.has(staging));
  now = new Date('2026-11-05T13:01:00Z');
  await f.service.cleanup();
  assert.equal(f.objects.has(staging), false);
  assert.equal(f.objects.has(abandoned.tickets[0].key), false);
  assert.ok(f.objects.has(finalKey));
  assert.equal(f.state().uploads.find(row => row.id === abandoned.uploadId).state, 'EXPIRED');
});

test('malformed manifests and a missing upload identifier are rejected before choosing any session', async () => {
  const f = fixture();
  await assert.rejects(f.service.prepare('piece', [null], { actor, expectedRevision: 0, requestId: 'invalid' }), error => error.status === 400);
  await assert.rejects(f.service.confirm('piece', { actor, expectedRevision: 0 }), error => error.status === 400);
  assert.deepEqual(f.state().files.map(row => row.id), ['old']);
});

test('piece tickets accept the last Int byte and reject 2 GiB before allocating a staging session', async () => {
  const f = fixture();
  const options = { actor, expectedRevision: 0, requestId: 'int-boundary' };
  const ok = await f.service.prepare('piece', [{ name: 'large.mp4', size: 2_147_483_647, mimeType: 'video/mp4' }], options);
  assert.equal(ok.tickets.length, 1);
  await assert.rejects(f.service.prepare('piece', [{ name: 'too-large.mp4', size: 2_147_483_648, mimeType: 'video/mp4' }], { ...options, requestId: 'out-of-range' }), error => error.status === 400);
  assert.equal(f.state().uploads.length, 1, 'the rejected file never gets a ticket or staging allocation');
});

test('a copy finishing after its expired session was swept is enqueued again and never replaces current files', async () => {
  let now = new Date('2026-11-05T12:00:00Z');
  const f = fixture({ clock: () => now });
  const prepared = await f.service.prepare('piece', [{ name: 'one.png', size: png.length, mimeType: 'image/png' }], { actor, expectedRevision: 0, requestId: 'late-copy' });
  await f.storage.put({ key: prepared.tickets[0].key, body: png, contentType: 'image/png' });
  let copiedKey;
  f.storage.copy = async (key, finalKey) => {
    const object = structuredClone(f.objects.get(key));
    now = new Date('2026-11-05T13:01:00Z');
    await f.service.cleanup();
    f.objects.set(finalKey, object);
    copiedKey = finalKey;
  };
  await assert.rejects(f.service.confirm('piece', { actor, uploadId: prepared.uploadId, expectedRevision: 0 }), error => error.status === 409);
  await f.service.cleanup();
  assert.equal(f.objects.has(copiedKey), false, 'late completion must not leave a permanent orphan');
  assert.deepEqual(f.state().files.map(row => row.id), ['old']);
  assert.equal(f.state().item.finalAssetsRevision, 0);
  assert.equal(f.state().changes.length, 0);
  assert.equal(f.state().uploads[0].state, 'EXPIRED');
});

test('expiry after the transaction claims a verified session cannot sweep its soon-current objects', async () => {
  let now = new Date('2026-11-05T12:00:00Z');
  const f = fixture({ clock: () => now });
  const prepared = await f.service.prepare('piece', [{ name: 'one.png', size: png.length, mimeType: 'image/png' }], { actor, expectedRevision: 0, requestId: 'commit-versus-sweep' });
  await f.storage.put({ key: prepared.tickets[0].key, body: png, contentType: 'image/png' });
  const removeCurrentRows = f.db.contentItemFinalAsset.deleteMany;
  f.db.contentItemFinalAsset.deleteMany = async args => {
    // The final objects exist, but no replacement rows have been inserted yet.
    now = new Date('2026-11-05T13:01:00Z');
    await f.service.cleanup();
    return removeCurrentRows(args);
  };
  const result = await f.service.confirm('piece', { actor, uploadId: prepared.uploadId, expectedRevision: 0 });
  assert.equal(result.revision, 1);
  assert.equal(f.state().uploads[0].state, 'COMMITTED');
  assert.equal(f.state().changes.length, 1);
  assert.ok(f.objects.has(result.files[0].storageKey), 'a committed delivery must retain its verified final bytes');
  assert.equal(f.state().deletions.some(row => row.storageKey === result.files[0].storageKey), false);
});

test('expiry during verification rejects the whole delivery even before a cleanup worker runs', async () => {
  let now = new Date('2026-11-05T12:00:00Z');
  const f = fixture({ clock: () => now });
  const prepared = await f.service.prepare('piece', [{ name: 'one.png', size: png.length, mimeType: 'image/png' }], { actor, expectedRevision: 0, requestId: 'expired-verification' });
  await f.storage.put({ key: prepared.tickets[0].key, body: png, contentType: 'image/png' });
  const prefix = f.storage.prefix;
  f.storage.prefix = async (...args) => {
    now = new Date('2026-11-05T13:01:00Z');
    return prefix(...args);
  };
  await assert.rejects(f.service.confirm('piece', { actor, uploadId: prepared.uploadId, expectedRevision: 0 }), error => error.status === 409);
  assert.deepEqual(f.state().files.map(row => row.id), ['old']);
  assert.equal(f.state().item.finalAssetsRevision, 0);
  assert.equal(f.state().item.revisionRequestedAt, null);
  assert.equal(f.state().changes.length, 0);
  assert.equal(f.state().uploads[0].state, 'PENDING');
  await f.service.cleanup();
  assert.equal(f.state().uploads[0].state, 'EXPIRED');
  assert.deepEqual([...f.objects.keys()], ['old-object']);
});

test('discarding a failed legacy confirmation cannot delete an object still used by the current delivery', async () => {
  const f = fixture();
  await f.service.discard(['old-object']);
  assert.ok(f.objects.has('old-object'));
  assert.equal(f.state().deletions.length, 0);
});

test('new pieces bind files and staging to PLATFORM while retired old files retain their LEGACY cleanup area', async () => {
  const f = fixture({ failDelete: true });
  const saved = await f.service.replace('piece', [file()], { actor, expectedRevision: 0, requestId: 'areas' });
  assert.ok(saved.files.every(row => row.storageArea === 'PLATFORM'));
  assert.equal(f.state().uploads[0].storageArea, 'PLATFORM');
  assert.equal(f.state().deletions.find(row => row.storageKey === 'old-object').storageArea, 'LEGACY');
  assert.equal(f.state().deletions.find(row => row.storageKey.startsWith('content-delivery-staging/')).storageArea, 'PLATFORM');
});

test('cleanup identities include the area so a live same-key file in the other bucket is not deleted or mistaken as protection', async () => {
  const f = fixture();
  f.state().deletions.push({ id: 'retired-dedicated', storageArea: 'PLATFORM', storageKey: 'old-object', availableAt: new Date(0), attempts: 0 });
  const deleted = [];
  const service = createContentDeliveryService({ db: f.db, storageFor: area => ({ deleteFromS3: async key => deleted.push([area, key]) }) });
  await service.cleanup();
  assert.deepEqual(deleted, [['PLATFORM', 'old-object']]);
  assert.ok(f.objects.has('old-object'), 'the old LEGACY object and its current row are untouched');
});

test('a committed receipt can be recovered without starting a new upload while dedicated storage is unavailable', async () => {
  const f = fixture();
  const files = [{ name: 'one.png', size: png.length, mimeType: 'image/png' }];
  const options = { actor, expectedRevision: 0, requestId: 'receipt' };
  const prepared = await f.service.prepare('piece', files, options);
  await f.storage.put({ key: prepared.tickets[0].key, body: png, contentType: 'image/png' });
  await f.service.confirm('piece', { actor, uploadId: prepared.uploadId, expectedRevision: 0 });
  const service = createContentDeliveryService({ db: f.db, storageFor: () => ({ assertConfigured() { throw Object.assign(new Error('not configured'), { status: 503 }); } }) });
  const replay = await service.prepare('piece', files, options);
  assert.equal(replay.committed, true);
  assert.equal(replay.delivery.revision, 1);
  assert.equal(f.state().changes.length, 1);
});

const DAY = 24 * 60 * 60 * 1000;

test('a retired file waits 30 days in the trash before its object and derivatives are deleted', async () => {
  let now = new Date('2026-11-23T15:00:00Z');
  const f = fixture({ clock: () => now });
  await f.service.replace('piece', [file('nuevo.png')], { actor, expectedRevision: 0, requestId: 'trash-1' });
  now = new Date(now.getTime() + 29 * DAY);
  await f.service.cleanup();
  assert.equal(f.objects.has('old-object'), true);
  assert.equal((await f.service.get('piece')).trash.length, 1);
  now = new Date(now.getTime() + 2 * DAY);
  assert.equal((await f.service.get('piece')).trash.length, 0);
  await f.service.cleanup();
  assert.equal(f.objects.has('old-object'), false);
  assert.ok(f.logs.includes('delete:derived/old-instagram.jpg'));
  assert.equal(f.state().deletions.some(row => row.assetId === 'old'), false);
});

test('restoring a retired file returns it to the end of the piece with its identity and clears its trash rows', async () => {
  let now = new Date('2026-11-23T15:00:00Z');
  const f = fixture({ status: 'BORRADOR', clock: () => now });
  const replaced = await f.service.replace('piece', [file('nuevo.png')], { actor, expectedRevision: 0, requestId: 'trash-2' });
  const restored = await f.service.restore('piece', { actor, expectedRevision: replaced.revision, assetId: 'old' });
  assert.equal(restored.revision, 2);
  assert.deepEqual(restored.files.map(row => [row.name, row.position]), [['nuevo.png', 0], ['igual.png', 1]]);
  assert.equal(restored.files[1].id, 'old');
  assert.equal(restored.history.find(entry => entry.revision === 2).action, 'RESTORED');
  assert.deepEqual(restored.trash, []);
  assert.equal(f.state().deletions.some(row => row.assetId === 'old' || row.storageKey === 'old-object'), false);
  now = new Date(now.getTime() + 40 * DAY);
  await f.service.cleanup();
  assert.equal(f.objects.has('old-object'), true);
  // Retirarlo otra vez lo devuelve a la papelera con un plazo nuevo.
  await f.service.mutate('piece', { actor, expectedRevision: 2, action: 'REMOVED' }, async tx => { await tx.contentItemFinalAsset.delete({ where: { id: 'old' } }); });
  const again = await f.service.get('piece');
  assert.deepEqual(again.trash.map(row => row.id), ['old']);
  assert.equal(new Date(again.trash[0].expiresAt).getTime(), now.getTime() + 30 * DAY);
});

test('a file cannot be restored after its 30 days, without its object, with a stale revision or without a session', async () => {
  let now = new Date('2026-11-23T15:00:00Z');
  const f = fixture({ clock: () => now });
  await f.service.replace('piece', [file('nuevo.png')], { actor, expectedRevision: 0, requestId: 'trash-3' });
  await assert.rejects(f.service.restore('piece', { expectedRevision: 1, assetId: 'old' }), { status: 401 });
  await assert.rejects(f.service.restore('piece', { actor, expectedRevision: 0, assetId: 'old' }), { status: 409 });
  await assert.rejects(f.service.restore('piece', { actor, expectedRevision: 1, assetId: 'otro' }), { status: 410 });
  await assert.rejects(f.service.restore('piece', { actor, expectedRevision: 1 }), { status: 400 });
  assert.equal(f.state().files.length, 1);
  f.objects.delete('old-object');
  await assert.rejects(f.service.restore('piece', { actor, expectedRevision: 1, assetId: 'old' }), { status: 410 });
  f.objects.set('old-object', { body: png, mimeType: 'image/png', etag: 'old-etag' });
  now = new Date(now.getTime() + 30 * DAY);
  await assert.rejects(f.service.restore('piece', { actor, expectedRevision: 1, assetId: 'old' }), { status: 410 });
  assert.equal(f.state().item.finalAssetsRevision, 1);
});

test('the schema script keeps retired files 30 days and the route restores with the authenticated author', () => {
  const schema = readFileSync(new URL('../scripts/ensure-content-delivery-schema.js', import.meta.url), 'utf8');
  assert.match(schema, /CURRENT_TIMESTAMP \+ INTERVAL '30 days'/);
  for (const column of ['contentItemId', 'assetId', 'name', 'mimeType', 'size']) assert.match(schema, new RegExp(`"ContentAssetDeletion" ADD COLUMN IF NOT EXISTS "${column}"`));
  const routes = readFileSync(new URL('../src/routes/api/content.js', import.meta.url), 'utf8');
  assert.match(routes, /delivery\/restore[\s\S]{0,200}restoreContentDeliveryFile\(req\.params\.id, \{ actor: req\.user/);
});

test('the piece trash is mounted where files are retired, with touch-sized restore buttons and no storage keys', () => {
  const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
  const trash = read('../src/components/modules/ContentPlan/PieceTrash.jsx');
  assert.match(trash, /delivery\/restore/);
  assert.match(trash, /min-h-11[^"]*"[\s\S]{0,200}Restaurar/);
  assert.doesNotMatch(trash, /storageKey/);
  assert.match(read('../src/components/modules/ContentPlanDetail.jsx'), /<PieceTrash itemId=\{item\.id\} count=\{item\.retiredFiles \|\| 0\} \/>/);
  assert.match(read('../src/components/modules/Clients/operations/PiecePeekDialog.jsx'), /<PieceTrash itemId=\{item\.id\}/);
  assert.match(read('../src/services/contentService.js'), /withRetiredFiles\(items\)/);
});
