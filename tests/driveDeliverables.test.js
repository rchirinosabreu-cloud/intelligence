import test from 'node:test';
import assert from 'node:assert/strict';
import { listDriveDeliverables, deliveryFolderId } from '../src/services/driveDeliverableService.js';
import { listDriveContents, uploadDriveFile, createDriveFolder, updateDriveFile } from '../src/services/driveService.js';

const actor = { id: 'ana', role: 'EDITOR', modulePermissions: { drive: true, gestion: true, parrillas: true } };
const file = (id, name = 'original.pdf') => ({ id, name, mimeType: 'application/pdf', size: 20n, position: 0, createdAt: new Date('2026-12-10T12:00:00Z'), storageKey: 'SECRET_KEY', storageArea: 'DELIVERABLES' });
const task = { id: 'task', title: 'Informe / cierre', clientId: 'client', client: { id: 'client', name: 'Cliente Faro' }, isPrivate: true,
  assignee: { userId: 'ana' }, creatorId: 'creator', collaborators: [], viewers: [], deliverables: [file('t-file')] };
const item = { id: 'piece', objective: 'Campaña', deletedAt: null, planId: 'plan', plan: { id: 'plan', deletedAt: null, year: 2025, month: 10, clientId: 'client', client: { id: 'client', name: 'Cliente Faro' } }, finalAssets: [file('p-file', 'foto.png')] };
function fixture() {
  const calls = [];
  const db = {
    task: { findMany: async args => { calls.push(['tasks', args]); return [task, { ...task, id: 'secret', title: 'Título reservado', clientId: 'hidden', client: { id: 'hidden', name: 'Cliente secreto' }, assignee: { userId: 'other' } }]; } },
    taskDeliverableEvent: { groupBy: async args => { calls.push(['events', args]); return [{ taskId: 'task', _min: { createdAt: new Date('2026-11-01T03:00:00Z') } }]; } },
    contentItem: { findMany: async args => { calls.push(['pieces', args]); return [item, { ...item, id: 'deleted', deletedAt: new Date() }]; } },
    driveFolder: { findMany: async () => [] }, driveFile: { findMany: async () => [] }
  };
  return { db, calls, list: options => listDriveDeliverables({ db, actor, ...options }) };
}

test('Drive virtual groups by authorized client, year, month and source, without copying files', async () => {
  const f = fixture();
  const root = await f.list({ folderId: 'deliverables' });
  assert.deepEqual(root.folders.map(row => row.name), ['Cliente Faro']);
  assert.equal(root.folders[0].itemCount, 2);
  let result = await f.list({ folderId: root.folders[0].id });
  assert.deepEqual(result.folders.map(row => row.name), ['2026', '2025']);
  result = await f.list({ folderId: result.folders[0].id });
  assert.equal(result.folders[0].name, 'Octubre');
  result = await f.list({ folderId: result.folders[0].id });
  assert.deepEqual(result.folders.map(row => row.name), ['Tareas']);
  result = await f.list({ folderId: result.folders[0].id });
  assert.equal(result.folders[0].name, task.title);
  result = await f.list({ folderId: result.folders[0].id });
  assert.equal(result.files.length, 1);
  const row = result.files[0];
  assert.equal(row.kind, 'TASK_DELIVERABLE'); assert.equal(row.originalName, 'original.pdf');
  assert.equal(row.name, 'Cliente_Faro_2026-10_Informe_cierre_01.pdf');
  assert.equal(row.name, row.downloadName); assert.equal(row.periodSource, 'FIRST_DELIVERY');
  assert.equal(row.source.href, '/gestion?taskId=task'); assert.equal(row.canOpenSource, true);
  assert.equal(row.fileUrl, '/api/tasks/task/deliverables/t-file/file');
  assert.equal(result.breadcrumbs.length, 6); assert.equal(result.currentFolder.readOnly, true);
  assert.doesNotMatch(JSON.stringify(result), /SECRET_KEY|storageKey|storageArea/);
  assert.deepEqual(f.calls.find(([kind]) => kind === 'events')[1].where.taskId.in, ['task']);
});

test('permissions filter names, counts, searches and guessed virtual paths; admin does not open private tasks', async () => {
  const f = fixture();
  const tasksOnly = { ...actor, modulePermissions: { drive: true, gestion: true, parrillas: false } };
  const result = await f.list({ actor: tasksOnly, query: 'original', folderId: 'deliverables' });
  assert.equal(result.files.length, 1); assert.equal(f.calls.some(([kind]) => kind === 'pieces'), false);
  assert.deepEqual((await f.list({ query: 'reservado', folderId: 'deliverables' })).files, []);
  await assert.rejects(f.list({ folderId: deliveryFolderId(['hidden']) }), { status: 404 });
  const boss = await f.list({ actor: { id: 'boss', role: 'ADMIN' }, query: 'Informe', folderId: 'deliverables' });
  assert.deepEqual(boss.files, []);
  const none = fixture();
  assert.deepEqual((await none.list({ actor: { ...actor, modulePermissions: { drive: true, gestion: false, parrillas: false } }, folderId: 'deliverables' })).files, []);
  assert.equal(none.calls.length, 0);
});

test('piece files use their plan month and preserve external Drive identity without exposing native storage', async () => {
  const f = fixture();
  const result = await f.list({ query: 'Campaña', folderId: 'deliverables' });
  assert.equal(result.files.length, 1);
  assert.equal(result.files[0].name, 'Cliente_Faro_2025-10_Campana_01.png');
  assert.deepEqual(result.files[0].source, { clientId: 'client', clientName: 'Cliente Faro', title: 'Campaña', itemId: 'piece', planId: 'plan', href: '/parrillas/plan?item=piece' });
  assert.equal(result.files[0].fileUrl, '/api/content/items/piece/final-assets/p-file');
});

test('external Drive files expose their provider identity and source format, without offering unavailable native bytes', async () => {
  const f = fixture();
  f.db.contentItem.findMany = async () => [{ ...item, format: 'Reel', finalAssets: [{ ...file('drive-file', 'reel.mp4'), mimeType: 'video/mp4', externalProvider: 'GOOGLE_DRIVE', externalFileId: 'provider-file' }] }];
  const result = await f.list({ query: 'reel', folderId: 'deliverables' });
  assert.equal(result.files[0].fileUrl, null); assert.equal(result.files[0].downloadUrl, null);
  assert.equal(result.files[0].source.format, 'Reel');
  assert.equal(result.files[0].externalFileId, 'provider-file');
});

test('Drive root integrates virtual search and keeps its ordinary file storage independent', async () => {
  const f = fixture();
  const root = await listDriveContents({ db: f.db, actor });
  assert.ok(root.folders.some(folder => folder.id === 'deliverables' && folder.system));
  const result = await listDriveContents({ db: f.db, actor, query: 'Campaña' });
  assert.equal(result.files[0].kind, 'CONTENT_DELIVERABLE');
  const trash = await listDriveContents({ db: { ...f.db, meetingMinute: { findMany: async () => [] } }, actor, includeTrash: true });
  assert.equal(trash.folders.some(folder => folder.id === 'deliverables'), false);
});

test('virtual folders and files reject ordinary Drive writes before touching storage or database', async () => {
  const db = new Proxy({}, { get: () => { throw new Error('Unexpected database write'); } });
  const folder = deliveryFolderId(['client', 2026, 10, 'TASK', 'task']);
  await assert.rejects(createDriveFolder({ db, name: 'Subcarpeta', parentId: folder }), { code: 'DRIVE_SYSTEM_FOLDER_READ_ONLY' });
  await assert.rejects(uploadDriveFile({ db, folderId: folder, file: { originalname: 'ok.pdf', mimetype: 'application/pdf', size: 3, buffer: Buffer.from('pdf') } }), { code: 'DRIVE_SYSTEM_FOLDER_READ_ONLY' });
  await assert.rejects(updateDriveFile({ db, id: 'deliverable:TASK:task:file', name: 'Otro nombre' }), { code: 'DRIVE_SYSTEM_FOLDER_READ_ONLY' });
});
