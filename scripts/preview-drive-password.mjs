import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';
import { createTaskPieceFixture, finalPiecePng } from '../tests/support/taskPieceFixture.js';
import { runSharedCommand, sharedTaskRoot } from '../tests/support/sharedTaskSandbox.js';

export async function createDrivePasswordPreview({ port = 3184, apiPort = 8098 } = {}) {
  const output = path.resolve('output/drive-password');
  await mkdir(path.join(output, 'empty-env'), { recursive: true });
  await runSharedCommand(process.execPath, [path.join(sharedTaskRoot, 'scripts/ensure-drive-schema.js')]);
  const fixture = await createTaskPieceFixture({ port: apiPort });
  let web;
  try {
    const folder = (await fixture.request('manager', '/drive/folders', { method: 'POST', expected: 201,
      body: { name: 'Documentos privados · Prueba local', subtitle: 'Archivos ficticios para comprobar la protección' } })).data.folder;
    const form = new FormData(); form.append('folderId', folder.id);
    form.append('file', new Blob([finalPiecePng], { type: 'image/png' }), 'pieza-de-prueba.png');
    const uploaded = await fixture.raw('manager', '/drive/upload', { method: 'POST', body: form });
    if (uploaded.status !== 201) throw new Error('No se pudo preparar el archivo ficticio.');
    const password = 'Clave local de Drive 2026';
    await fixture.request('manager', `/drive/folders/${folder.id}/password`, { method: 'PUT', body: { password } });
    process.env.VITE_API_URL = '';
    web = await createServer({ envDir: path.join(output, 'empty-env'), server: {
      host: '127.0.0.1', port, strictPort: true, proxy: { '/api': { target: fixture.api.origin, changeOrigin: true } }
    } });
    await web.listen();
    const origin = `http://127.0.0.1:${web.httpServer.address().port}`;
    const access = { origin, folderId: folder.id, password, users: Object.fromEntries(Object.entries(fixture.actors).map(([key, actor]) => [key, { email: actor.email, password: actor.password }])) };
    await writeFile(path.join(output, 'access.json'), JSON.stringify(access, null, 2));
    return { origin, access, fixture, close: async () => { await web.close(); await fixture.close(); } };
  } catch (error) { await web?.close(); await fixture.close(); throw error; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const preview = await createDrivePasswordPreview();
  console.log(`DRIVE_PASSWORD_PREVIEW_READY ${preview.origin}/drive`);
  const close = async () => { await preview.close(); process.exit(0); };
  process.once('SIGINT', close); process.once('SIGTERM', close);
}
