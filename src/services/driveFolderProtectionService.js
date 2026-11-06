import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import prisma from '../lib/prisma.js';

const scrypt = promisify(scryptCallback);
const fail = (status, code, message, extra = {}) => Object.assign(new Error(message), { status, code, ...extra });
const automatic = id => id === 'bria-minutes' || id === 'deliverables' || String(id || '').startsWith('deliverables:');
const sessionId = req => createHash('sha256').update(req.headers.authorization || '').digest('hex');
const derive = (password, salt) => scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
const validPassword = value => typeof value === 'string' && value.length >= 12 && value.length <= 128;
const hashPassword = async password => {
  if (!validPassword(password)) throw fail(400, 'DRIVE_PASSWORD_LENGTH', 'Usa una contraseña de entre 12 y 128 caracteres.');
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${(await derive(password, salt)).toString('hex')}`;
};
const matches = async (password, hash) => {
  if (typeof password !== 'string' || password.length > 128) return false;
  const [salt, key] = hash.split(':');
  const candidate = await derive(password, salt);
  const expected = Buffer.from(key, 'hex');
  return expected.length === candidate.length && timingSafeEqual(expected, candidate);
};
const protection = async (db, id) => (await db.$queryRaw`SELECT * FROM "DriveFolderProtection" WHERE "folderId" = ${id}`)[0];
const chain = async (db, id) => {
  const result = [], seen = new Set();
  while (id && !automatic(id)) {
    if (seen.has(id) || seen.size >= 128) throw fail(409, 'DRIVE_FOLDER_CYCLE', 'La estructura de carpetas no es válida.');
    seen.add(id);
    const folder = await db.driveFolder.findUnique({ where: { id } });
    if (!folder) throw fail(404, 'DRIVE_FOLDER_NOT_FOUND', 'La carpeta no está disponible.');
    result.unshift(folder);
    id = folder.parentId;
  }
  return result;
};
const hasGrant = async (db, req, row) => (await db.$queryRaw`
  SELECT 1 FROM "DriveFolderUnlock" WHERE "folderId" = ${row.folderId} AND "userId" = ${req.user.userId}
  AND "sessionHash" = ${sessionId(req)} AND "revision" = ${row.revision} AND "expiresAt" > CURRENT_TIMESTAMP`).length > 0;

async function assertAccess(db, req, id, { skipSelf = false, allowDeleted = false } = {}) {
  for (const folder of await chain(db, id)) {
    if (folder.deletedAt && !allowDeleted) throw fail(404, 'DRIVE_FOLDER_NOT_FOUND', 'La carpeta no está disponible.');
    if (skipSelf && folder.id === id) continue;
    const row = await protection(db, folder.id);
    if (row && !await hasGrant(db, req, row)) throw fail(423, 'DRIVE_FOLDER_LOCKED', 'Introduce la contraseña para abrir esta carpeta.', { folderId: folder.id });
  }
}

async function beforeOperation(db, req) {
  const route = req.route.path;
  const id = req.params.id;
  const folderRoute = route.startsWith('/folders/:id');
  const credentialRoute = /\/(password|unlock|lock)$/.test(route);
  if (credentialRoute && automatic(id)) throw fail(400, 'DRIVE_SYSTEM_FOLDER_READ_ONLY', 'Esta carpeta automática se administra desde su origen.');
  if (folderRoute) {
    await assertAccess(db, req, id, { skipSelf: credentialRoute, allowDeleted: credentialRoute || route.endsWith('/restore') });
    if (req.body?.parentId !== undefined) {
      if (automatic(req.body.parentId)) throw fail(400, 'DRIVE_SYSTEM_FOLDER_READ_ONLY', 'No puedes mover una carpeta a una ubicación automática.');
      const target = await chain(db, req.body.parentId);
      if (target.some(row => row.id === id)) throw fail(400, 'DRIVE_FOLDER_CYCLE', 'Una carpeta no puede moverse dentro de sí misma.');
      await assertAccess(db, req, req.body.parentId);
    }
  } else if (route.startsWith('/files/:id') || route.startsWith('/managed-files/:id')) {
    const file = await db.driveFile.findUnique({ where: { id } });
    if (!file) throw fail(404, 'DRIVE_FILE_NOT_FOUND', 'El archivo no está disponible.');
    await assertAccess(db, req, file.folderId, { allowDeleted: route.endsWith('/restore') });
    if (req.body?.folderId !== undefined) {
      if (automatic(req.body.folderId)) throw fail(400, 'DRIVE_SYSTEM_FOLDER_READ_ONLY', 'No puedes mover un archivo a una ubicación automática.');
      await assertAccess(db, req, req.body.folderId);
    }
  } else if (route === '/contents') {
    await assertAccess(db, req, req.query.folderId);
  } else if (route === '/folders') {
    await assertAccess(db, req, req.body?.parentId);
  } else if (route === '/upload') {
    await assertAccess(db, req, req.body?.folderId);
  }
}

async function describeFolder(db, req, folder) {
  if (folder.system || automatic(folder.id)) return folder;
  const row = await protection(db, folder.id);
  const locked = Boolean(row && !await hasGrant(db, req, row));
  const source = await db.driveFolder.findUnique({ where: { id: folder.id }, select: { createdById: true } });
  return { ...folder, ...(locked ? { subtitle: null } : {}), passwordProtected: Boolean(row), locked,
    canManagePassword: source?.createdById === req.user.userId };
}

// Every manual Drive entry point shares this boundary. Tree/protection mutations and reads
// are serialized against each other, so a concurrent move cannot bypass an ancestor lock.
export async function runProtectedDriveRequest(req, operation, { db = prisma } = {}) {
  return db.$transaction(async tx => {
    if (req.method === 'GET') await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(20261106, 1)`;
    else await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261106, 1)`;
    await beforeOperation(tx, req);
    const result = await operation(tx);
    if (req.route.path === '/contents' && result?.folders) {
      const folders = [];
      for (const folder of result.folders) {
        try {
          await assertAccess(tx, req, folder.parentId, { allowDeleted: req.query.trash === 'true' });
          folders.push(await describeFolder(tx, req, folder));
        } catch (error) { if (![423, 404].includes(error.status)) throw error; }
      }
      result.folders = folders;
      const files = [];
      for (const file of result.files) {
        try { await assertAccess(tx, req, file.folderId); files.push(file); }
        catch (error) { if (![423, 404].includes(error.status)) throw error; }
      }
      result.files = files;
      if (req.query.folderId && !automatic(req.query.folderId)) {
        result.breadcrumbs = await Promise.all((await chain(tx, req.query.folderId)).map(row => describeFolder(tx, req, {
          id: row.id, name: row.name, parentId: row.parentId,
        })));
        result.currentFolder = result.breadcrumbs.at(-1);
        const expirations = [];
        for (const folder of result.breadcrumbs) {
          const grants = await tx.$queryRaw`SELECT "expiresAt" FROM "DriveFolderUnlock" WHERE "folderId" = ${folder.id}
            AND "userId" = ${req.user.userId} AND "sessionHash" = ${sessionId(req)}`;
          if (grants[0]) expirations.push(new Date(grants[0].expiresAt).getTime());
        }
        result.unlockExpiresAt = expirations.length ? new Date(Math.min(...expirations)).toISOString() : null;
      }
    }
    return result;
  }, { timeout: 30_000, maxWait: 10_000 });
}

export async function changeDriveFolderPassword(db, req, folderId = req.params.id) {
  const folder = await db.driveFolder.findUnique({ where: { id: folderId } });
  if (folder?.createdById !== req.user.userId) throw fail(403, 'DRIVE_PASSWORD_OWNER', 'Solo quien creó la carpeta puede administrar su contraseña.');
  const old = await protection(db, folderId);
  if (old && !await matches(req.body?.currentPassword, old.passwordHash)) throw fail(422, 'DRIVE_PASSWORD_INVALID', 'La contraseña actual no es correcta.');
  const password = req.body?.password;
  if (password === null) {
    await db.$executeRaw`DELETE FROM "DriveFolderProtection" WHERE "folderId" = ${folderId}`;
  } else {
    const passwordHash = await hashPassword(password), revision = randomUUID();
    await db.$executeRaw`INSERT INTO "DriveFolderProtection" ("folderId", "passwordHash", "revision") VALUES (${folderId}, ${passwordHash}, ${revision})
      ON CONFLICT ("folderId") DO UPDATE SET "passwordHash" = EXCLUDED."passwordHash", "revision" = EXCLUDED."revision"`;
  }
  await db.$executeRaw`DELETE FROM "DriveFolderUnlock" WHERE "folderId" = ${folderId}`;
  return { success: true, passwordProtected: password !== null };
}

export async function unlockDriveFolder(db, req) {
  const row = await protection(db, req.params.id);
  if (!row || !await matches(req.body?.password, row.passwordHash)) throw fail(422, 'DRIVE_PASSWORD_INVALID', 'La contraseña no es correcta.');
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  await db.$executeRaw`DELETE FROM "DriveFolderUnlock" WHERE "expiresAt" <= CURRENT_TIMESTAMP`;
  await db.$executeRaw`INSERT INTO "DriveFolderUnlock" ("folderId", "userId", "sessionHash", "revision", "expiresAt")
    VALUES (${row.folderId}, ${req.user.userId}, ${sessionId(req)}, ${row.revision}, ${expiresAt})
    ON CONFLICT ("folderId", "userId", "sessionHash") DO UPDATE SET "revision" = EXCLUDED."revision", "expiresAt" = EXCLUDED."expiresAt"`;
  return { success: true, expiresAt };
}

export async function lockDriveFolder(db, req) {
  await db.$executeRaw`DELETE FROM "DriveFolderUnlock" WHERE "userId" = ${req.user.userId} AND "sessionHash" = ${sessionId(req)}`;
  return { success: true };
}
