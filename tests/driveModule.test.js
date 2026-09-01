import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createDocumentStorage } from '../src/services/documentStorageService.js';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8').catch(() => '');

test('private document storage can read a JSON artifact by key', async () => {
  const commands = [];
  const storage = createDocumentStorage({
    bucketName: 'private-files',
    client: {
      send: async (command) => {
        commands.push(command);
        return { Body: { transformToString: async () => '{"title":"Minuta ejecutiva"}' } };
      }
    }
  });

  assert.equal(typeof storage.downloadJson, 'function');
  const content = await storage.downloadJson({ key: 'bria/minutes/2026/m-1/minute.json' });

  assert.deepEqual(content, { title: 'Minuta ejecutiva' });
  assert.equal(commands.length, 1);
  assert.equal(commands[0].input.Bucket, 'private-files');
  assert.equal(commands[0].input.Key, 'bria/minutes/2026/m-1/minute.json');
});

test('private document storage can permanently delete a bounded set of object keys', async () => {
  const commands = [];
  const storage = createDocumentStorage({
    bucketName: 'private-files',
    client: { send: async (command) => { commands.push(command); return {}; } }
  });

  await storage.deleteMany({ keys: ['private/transcript.json', '', 'private/minute.json'] });

  assert.equal(commands.length, 1);
  assert.equal(commands[0].input.Bucket, 'private-files');
  assert.deepEqual(commands[0].input.Delete.Objects, [
    { Key: 'private/transcript.json' },
    { Key: 'private/minute.json' }
  ]);
});

test('Drive projects each ready meeting as a minute and transcript without leaking storage keys', async () => {
  const driveService = await import('../src/services/driveService.js').catch(() => ({}));
  assert.equal(typeof driveService.listDriveFiles, 'function');

  const files = await driveService.listDriveFiles({
    query: 'campaña',
    db: {
      meetingMinute: {
        findMany: async (args) => {
          assert.equal(args.where.status, 'READY');
          assert.equal(args.where.deletedAt, null);
          return [{
          id: 'm-1',
          title: 'Reunión de campaña',
          meetingAt: new Date('2026-08-31T15:00:00Z'),
          processedAt: new Date('2026-08-31T16:00:00Z'),
          organizerEmail: 'social@brainstudio.com',
          transcriptStorageKey: 'private/transcript.json',
          minuteStorageKey: 'private/minute.json'
          }];
        }
      }
    }
  });

  assert.equal(files.length, 2);
  assert.deepEqual(files.map(file => file.kind), ['MINUTE', 'TRANSCRIPT']);
  assert.ok(files.every(file => file.meetingId === 'm-1'));
  assert.ok(files.every(file => file.storageKey === undefined));
});

test('Drive trash projects Bria minute artifacts so they can be restored or deleted permanently', async () => {
  const driveService = await import('../src/services/driveService.js').catch(() => ({}));
  const deletedAt = new Date('2026-08-31T18:00:00Z');
  const files = await driveService.listDriveFiles({
    includeTrash: true,
    db: {
      meetingMinute: {
        findMany: async (args) => {
          assert.equal(args.where.status, 'READY');
          assert.deepEqual(args.where.deletedAt, { not: null });
          return [{
            id: 'm-trash',
            title: 'Devocional Alabanza',
            meetingAt: new Date('2026-03-06T19:05:00Z'),
            processedAt: new Date('2026-03-06T20:00:00Z'),
            organizerEmail: 'social@brainstudio.com',
            deletedAt,
            transcriptStorageKey: 'private/transcript.json',
            minuteStorageKey: 'private/minute.json'
          }];
        }
      }
    }
  });

  assert.equal(files.length, 2);
  assert.ok(files.every(file => file.meetingId === 'm-trash'));
  assert.ok(files.every(file => file.deletedAt === deletedAt));
});

test('Drive reads only a known artifact kind through private storage', async () => {
  const driveService = await import('../src/services/driveService.js').catch(() => ({}));
  assert.equal(typeof driveService.readDriveFile, 'function');
  const downloads = [];
  const db = {
    meetingMinute: {
      findUnique: async () => ({
        id: 'm-1',
        title: 'Reunión de campaña',
        meetingAt: new Date('2026-08-31T15:00:00Z'),
        status: 'READY',
        deletedAt: null,
        transcriptStorageKey: 'private/transcript.json',
        minuteStorageKey: 'private/minute.json'
      })
    }
  };
  const storage = {
    downloadJson: async ({ key }) => {
      downloads.push(key);
      return { executiveSummary: 'Se aprobó la campaña.' };
    }
  };

  const file = await driveService.readDriveFile({ meetingId: 'm-1', kind: 'minute', db, storage });

  assert.equal(file.name, 'Minuta · Reunión de campaña.json');
  assert.equal(file.kind, 'MINUTE');
  assert.equal(file.content.executiveSummary, 'Se aprobó la campaña.');
  assert.deepEqual(downloads, ['private/minute.json']);
  await assert.rejects(
    () => driveService.readDriveFile({ meetingId: 'm-1', kind: 'secret', db, storage }),
    error => error.code === 'DRIVE_FILE_KIND_INVALID'
  );
});

test('Drive supports folders, uploads, rename, move and recoverable trash', async () => {
  const driveService = await import('../src/services/driveService.js');
  assert.equal(typeof driveService.listDriveContents, 'function');
  assert.equal(typeof driveService.createDriveFolder, 'function');
  assert.equal(typeof driveService.uploadDriveFile, 'function');
  assert.equal(typeof driveService.updateDriveFile, 'function');
  assert.equal(typeof driveService.trashDriveFile, 'function');
  assert.equal(typeof driveService.restoreDriveFile, 'function');
  assert.equal(typeof driveService.restoreDriveFolder, 'function');

  const writes = [];
  const db = {
    driveFolder: {
      create: async ({ data }) => ({ id: 'folder-1', ...data }),
      findMany: async () => []
    },
    driveFile: {
      create: async ({ data }) => { writes.push(data); return { id: 'file-1', ...data }; },
      findMany: async () => [],
      update: async ({ where, data }) => ({ id: where.id, ...data })
    }
  };
  const storage = {
    uploadBuffer: async ({ key, body, mimeType }) => ({ key, size: body.length, mimeType })
  };

  const root = await driveService.listDriveContents({ db });
  assert.equal(root.folders[0].id, 'bria-minutes');
  assert.equal(root.folders[0].name, 'Minutas de Bria');

  const folder = await driveService.createDriveFolder({ name: '  Clientes  ', actorId: 'u-1', db });
  assert.equal(folder.name, 'Clientes');

  const uploaded = await driveService.uploadDriveFile({
    file: { originalname: 'brief.pdf', mimetype: 'application/pdf', size: 4, buffer: Buffer.from('test') },
    folderId: 'folder-1',
    actorId: 'u-1',
    db,
    storage
  });
  assert.equal(uploaded.name, 'brief.pdf');
  assert.equal(writes[0].folderId, 'folder-1');
  assert.match(writes[0].storageKey, /^drive\/uploads\/\d{4}\//);

  const moved = await driveService.updateDriveFile({ id: 'file-1', name: 'Brief final.pdf', folderId: null, db });
  assert.equal(moved.name, 'Brief final.pdf');
  assert.equal(moved.folderId, null);

  const trashed = await driveService.trashDriveFile({ id: 'file-1', db });
  assert.ok(trashed.deletedAt instanceof Date);
  const restored = await driveService.restoreDriveFile({ id: 'file-1', db });
  assert.equal(restored.deletedAt, null);
});

test('Drive schema and startup bootstrap are additive and preserve recoverable files', async () => {
  const [schema, bootstrap, packageJson] = await Promise.all([
    read('prisma/schema.prisma'),
    read('scripts/ensure-drive-schema.js'),
    read('package.json')
  ]);

  assert.match(schema, /model DriveFolder \{/);
  assert.match(schema, /model DriveFile \{/);
  assert.match(schema, /deletedAt\s+DateTime\?/);
  assert.match(bootstrap, /CREATE TABLE IF NOT EXISTS "DriveFolder"/);
  assert.match(bootstrap, /CREATE TABLE IF NOT EXISTS "DriveFile"/);
  assert.doesNotMatch(bootstrap, /DROP\s+(TABLE|COLUMN)/i);
  assert.match(packageJson, /ensure-drive-schema\.js/);
});

test('Bria asks for editorial titles and brief subtitles for summary and analysis', async () => {
  const automation = await read('src/services/minuteAutomationService.js');
  assert.match(automation, /summaryTitle/);
  assert.match(automation, /summarySubtitle/);
  assert.match(automation, /analysisTitle/);
  assert.match(automation, /analysisSubtitle/);
  assert.match(automation, /basados en el contenido/i);
});

test('Drive is wired as a protected platform module with search, filters and file viewer', async () => {
  const [app, sidebar, routes, apiRoutes, service, drive] = await Promise.all([
    read('src/App.jsx'),
    read('src/components/layout/Sidebar.jsx'),
    read('src/routes/index.js'),
    read('src/routes/api/drive.js'),
    read('src/services/frontendApiService.js'),
    read('src/components/modules/Drive/DriveLayout.jsx')
  ]);

  assert.match(app, /path="\/drive"/);
  assert.match(app, /<DriveLayout\s*\/>/);
  assert.match(sidebar, /label: 'Drive'/);
  assert.match(routes, /router\.use\('\/drive',\s*requireModulePermission\('minutas'\),\s*driveRouter\)/);
  assert.match(apiRoutes, /router\.get\('\/files'/);
  assert.match(apiRoutes, /router\.get\('\/files\/:meetingId\/:kind'/);
  assert.match(apiRoutes, /router\.get\('\/contents'/);
  assert.match(apiRoutes, /router\.post\('\/folders'/);
  assert.match(apiRoutes, /router\.post\('\/upload'/);
  assert.match(apiRoutes, /router\.patch\('\/files\/:id'/);
  assert.match(apiRoutes, /router\.delete\('\/files\/:id'/);
  assert.match(service, /getDriveFiles/);
  assert.match(service, /getDriveFile/);
  assert.match(service, /trashAutomatedMinute/);
  assert.match(service, /restoreAutomatedMinute/);
  assert.match(service, /permanentlyDeleteAutomatedMinute/);
  assert.match(drive, /Brainstudio Drive/);
  assert.match(drive, /<PageHeader/);
  assert.doesNotMatch(drive, /Biblioteca documental/);
  assert.match(drive, /Buscar archivos/);
  assert.match(drive, /Minutas de Bria/);
  assert.match(drive, /Transcripciones/);
  assert.match(drive, /Descargar/);
  assert.match(drive, /Nueva carpeta/);
  assert.match(drive, /Subir archivos/);
  assert.match(drive, /Papelera/);
  assert.match(drive, /useConfirmDialog/);
  assert.match(drive, /trashAutomatedMinute\(item\.meetingId\)/);
  assert.match(drive, /restoreAutomatedMinute\(item\.meetingId\)/);
  assert.match(drive, /permanentlyDeleteAutomatedMinute\(item\.meetingId\)/);
  assert.match(drive, /Enviar reunión .* a papelera/);
  assert.match(drive, /Eliminar reunión .* permanentemente/);
  assert.match(drive, /role="dialog"/);
});
