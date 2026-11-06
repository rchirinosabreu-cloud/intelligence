import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTaskPieceFixture, finalPiecePng } from './support/taskPieceFixture.js';
import { runSharedCommand, sharedTaskRoot } from './support/sharedTaskSandbox.js';
import path from 'node:path';

let f;
before(async () => {
  await runSharedCommand(process.execPath, [path.join(sharedTaskRoot, 'scripts/ensure-drive-schema.js')]);
  f = await createTaskPieceFixture({ port: 8097 });
});
after(async () => { await f?.close(); });
const password = 'Clave local de carpeta 2026';
const folder = async (name, parentId) => (await f.request('manager', '/drive/folders', {
  method: 'POST', expected: 201, body: { name, parentId },
})).data.folder;
const protect = (id, body, expected = 200) => f.request('manager', `/drive/folders/${id}/password`, { method: 'PUT', body, expected });

test('una carpeta protegida exige clave en enlaces, descendientes y mutaciones, incluso a dirección', async () => {
  const root = await folder('Privado ficticio');
  const child = await folder('Interior ficticio', root.id);
  const form = new FormData();
  form.append('folderId', child.id);
  form.append('file', new Blob([finalPiecePng], { type: 'image/png' }), 'reservado.png');
  const upload = await f.raw('manager', '/drive/upload', { method: 'POST', body: form });
  assert.equal(upload.status, 201);
  const { file } = await upload.json();
  await protect(root.id, { password });
  const listing = (await f.request('manager', '/drive/contents')).data;
  assert.equal(listing.folders.find(row => row.id === root.id).locked, true);
  for (const key of ['manager', 'ana']) {
    await f.request(key, `/drive/contents?folderId=${root.id}`, { expected: 423 });
    await f.request(key, `/drive/contents?folderId=${child.id}&query=reservado`, { expected: 423 });
    await f.request(key, `/drive/managed-files/${file.id}/content?download=true`, { expected: 423 });
    await f.request(key, `/drive/files/${file.id}`, { method: 'PATCH', body: { folderId: null }, expected: 423 });
    await f.request(key, `/drive/folders/${child.id}`, { method: 'DELETE', expected: 423 });
  }
  await f.request('manager', `/drive/folders/${root.id}/unlock`, { method: 'POST', body: { password: 'incorrecta' }, expected: 422 });
  await f.request('manager', `/drive/folders/${root.id}/unlock`, { method: 'POST', body: { password } });
  const unlocked = (await f.request('manager', `/drive/contents?folderId=${child.id}`)).data;
  assert.equal(unlocked.files.some(row => row.id === file.id), true);
  const downloaded = await f.raw('manager', `/drive/managed-files/${file.id}/content?download=true`);
  assert.equal(downloaded.status, 200);
  assert.equal(downloaded.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), finalPiecePng);
  await f.request('ana', `/drive/contents?folderId=${child.id}`, { expected: 423 });
  await f.request('manager', `/drive/folders/${root.id}/lock`, { method: 'POST' });
  await f.request('manager', `/drive/contents?folderId=${child.id}`, { expected: 423 });
});

test('caducidad, otro inicio de sesión y un destino protegido exigen su propio acceso', async () => {
  // Cada caso usa otra persona para mantener el límite real de intentos por usuario.
  const root = (await f.request('ana', '/drive/folders', { method: 'POST', expected: 201, body: { name: 'Sesiones ficticias' } })).data.folder;
  await f.request('ana', `/drive/folders/${root.id}/password`, { method: 'PUT', body: { password } });
  await f.request('ana', `/drive/folders/${root.id}/unlock`, { method: 'POST', body: { password } });
  const otherLogin = (await f.request('ana', '/login', { method: 'POST', body: { email: f.actors.ana.email, password: f.actors.ana.password } })).data;
  const alternate = await fetch(`${f.api.origin}/api/drive/contents?folderId=${root.id}`, { headers: { Authorization: `Bearer ${otherLogin.token}` } });
  assert.equal(alternate.status, 423);
  await f.db.$executeRaw`UPDATE "DriveFolderUnlock" SET "expiresAt" = CURRENT_TIMESTAMP - INTERVAL '1 minute' WHERE "folderId" = ${root.id}`;
  await f.request('ana', `/drive/contents?folderId=${root.id}`, { expected: 423 });
  const publicFolder = await folder('Carpeta pública ficticia');
  await f.request('manager', `/drive/folders/${publicFolder.id}`, { method: 'PATCH', body: { parentId: root.id }, expected: 423 });
  await f.request('carlos', `/drive/contents?folderId=${root.id}`, { expected: 403 });
  const stored = await f.db.$queryRaw`SELECT "passwordHash" FROM "DriveFolderProtection" WHERE "folderId" = ${root.id}`;
  assert.ok(!stored[0].passwordHash.includes(password));
});

test('cambiar o quitar la clave exige la anterior y revoca accesos; las carpetas automáticas no admiten clave', async () => {
  const root = await folder('Cambio de clave ficticio');
  await protect(root.id, { password });
  await protect(root.id, { password: 'Otra clave suficientemente larga' }, 422);
  await f.request('ana', `/drive/folders/${root.id}/unlock`, { method: 'POST', body: { password } });
  await protect(root.id, { password: 'Otra clave suficientemente larga', currentPassword: password });
  await f.request('ana', `/drive/contents?folderId=${root.id}`, { expected: 423 });
  await protect(root.id, { password: null, currentPassword: password }, 422);
  await protect(root.id, { password: null, currentPassword: 'Otra clave suficientemente larga' });
  await f.request('ana', `/drive/contents?folderId=${root.id}`);
  await protect('deliverables', { password }, 400);
  await protect('bria-minutes', { password }, 400);
});

test('las claves anidadas son independientes y no se saltan con carga, papelera, ciclos o un id en el cuerpo', async () => {
  await f.db.user.update({ where: { id: f.actors.bea.id }, data: { modulePermissions: { drive: true } } });
  const root = (await f.request('bea', '/drive/folders', { method: 'POST', expected: 201, body: { name: 'Anidada ficticia' } })).data.folder;
  const child = (await f.request('bea', '/drive/folders', { method: 'POST', expected: 201, body: { name: 'Interior confidencial', parentId: root.id } })).data.folder;
  const set = (id, body, expected = 200) => f.request('bea', `/drive/folders/${id}/password`, { method: 'PUT', body, expected });
  const unlock = id => f.request('bea', `/drive/folders/${id}/unlock`, { method: 'POST', body: { password } });
  await set(root.id, { password }); await unlock(root.id); await set(child.id, { password });
  await f.request('bea', `/drive/contents?folderId=${child.id}`, { expected: 423 });
  const form = new FormData(); form.append('folderId', child.id);
  form.append('file', new Blob([finalPiecePng], { type: 'image/png' }), 'rechazado.png');
  const before = await f.db.driveFile.count({ where: { folderId: child.id } });
  assert.equal((await f.raw('bea', '/drive/upload', { method: 'POST', body: form })).status, 423);
  assert.equal(await f.db.driveFile.count({ where: { folderId: child.id } }), before);
  await f.request('bea', `/drive/folders/${root.id}`, { method: 'PATCH', body: { id: child.id, name: 'Nombre público corregido', createdById: f.actors.ana.id } });
  const untouched = await f.db.driveFolder.findUnique({ where: { id: child.id } });
  assert.equal(untouched.name, 'Interior confidencial'); assert.equal(untouched.createdById, f.actors.bea.id);
  await unlock(child.id);
  await f.request('bea', `/drive/folders/${root.id}`, { method: 'PATCH', body: { parentId: child.id }, expected: 400 });
  await f.request('bea', `/drive/folders/${child.id}`, { method: 'DELETE' });
  await f.request('bea', `/drive/contents?folderId=${child.id}`, { expected: 404 });
  await f.request('bea', `/drive/folders/${root.id}/lock`, { method: 'POST' });
  await f.request('bea', `/drive/folders/${child.id}/restore`, { method: 'PATCH', expected: 423 });
  await unlock(root.id);
  const listing = (await f.request('bea', `/drive/contents?folderId=${root.id}&trash=true`)).data;
  assert.equal(listing.folders.find(row => row.id === child.id).locked, true);
  await unlock(child.id); // Una carpeta en papelera se desbloquea para poder restaurarla.
  await f.request('bea', `/drive/folders/${child.id}/restore`, { method: 'PATCH' });
  await f.request('bea', `/drive/contents?folderId=${child.id}`);
});

test('los intentos de clave tienen límite y el módulo sigue siendo obligatorio', async () => {
  const root = await folder('Límite ficticio');
  const response = await f.raw('carlos', `/drive/folders/${root.id}/unlock`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
  assert.equal(response.status, 403);
  let status;
  for (let i = 0; i < 11; i++) {
    const attempt = await f.raw('manager', `/drive/folders/${root.id}/unlock`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'incorrecta' }) });
    status = attempt.status;
    if (status === 429) break;
    assert.equal(status, 422);
  }
  assert.equal(status, 429);
});
