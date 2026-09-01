import prisma from '../lib/prisma.js';
import { randomUUID } from 'node:crypto';
import { documentStorage } from './documentStorageService.js';
import { validateUploadFile } from '../config/security.js';

const FILE_KINDS = {
  minute: {
    kind: 'MINUTE',
    keyField: 'minuteStorageKey',
    prefix: 'Minuta'
  },
  transcript: {
    kind: 'TRANSCRIPT',
    keyField: 'transcriptStorageKey',
    prefix: 'Transcripción'
  }
};

const createDriveError = (code, message) => Object.assign(new Error(message), { code });

const cleanName = (value, label = 'Nombre') => {
  const name = String(value || '').trim().replace(/[\u0000-\u001f]/g, '').slice(0, 180);
  if (!name) throw createDriveError('DRIVE_NAME_REQUIRED', `${label} requerido.`);
  return name;
};

const sanitizeStorageName = (value) => cleanName(value, 'Nombre de archivo')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9._-]/g, '_')
  .slice(0, 120);

const publicManagedFile = (file) => ({
  id: file.id,
  kind: 'UPLOAD',
  name: file.name,
  subtitle: file.subtitle,
  mimeType: file.mimeType,
  sizeBytes: file.sizeBytes,
  source: file.source,
  category: file.category,
  folderId: file.folderId,
  createdAt: file.createdAt,
  updatedAt: file.updatedAt
});

export const BRIA_MINUTES_FOLDER = {
  id: 'bria-minutes',
  name: 'Minutas de Bria',
  subtitle: 'Resúmenes, análisis y transcripciones generados automáticamente',
  system: true,
  itemCount: null
};

const projectFile = (meeting, kindName) => {
  const definition = FILE_KINDS[kindName];
  return {
    id: `${meeting.id}:${kindName}`,
    meetingId: meeting.id,
    kind: definition.kind,
    name: `${definition.prefix} · ${meeting.title}.json`,
    title: meeting.title,
    mimeType: 'application/json',
    meetingAt: meeting.meetingAt,
    processedAt: meeting.processedAt,
    organizerEmail: meeting.organizerEmail
  };
};

export const listDriveFiles = async ({ db = prisma, query = '', kind, limit = 100 } = {}) => {
  const normalizedQuery = String(query || '').trim().slice(0, 120);
  const normalizedKind = String(kind || '').toLowerCase();
  const take = Math.min(Math.max(Number(limit) || 100, 1), 100);
  const meetings = await db.meetingMinute.findMany({
    where: {
      status: 'READY',
      ...(normalizedQuery ? { title: { contains: normalizedQuery, mode: 'insensitive' } } : {})
    },
    orderBy: { meetingAt: 'desc' },
    take,
    select: {
      id: true,
      title: true,
      meetingAt: true,
      processedAt: true,
      organizerEmail: true,
      minuteStorageKey: true,
      transcriptStorageKey: true
    }
  });

  return meetings.flatMap(meeting => {
    const files = [];
    if (meeting.minuteStorageKey && (!normalizedKind || normalizedKind === 'minute')) {
      files.push(projectFile(meeting, 'minute'));
    }
    if (meeting.transcriptStorageKey && (!normalizedKind || normalizedKind === 'transcript')) {
      files.push(projectFile(meeting, 'transcript'));
    }
    return files;
  });
};

export const readDriveFile = async ({ meetingId, kind, db = prisma, storage = documentStorage }) => {
  const normalizedKind = String(kind || '').toLowerCase();
  const definition = FILE_KINDS[normalizedKind];
  if (!definition) throw createDriveError('DRIVE_FILE_KIND_INVALID', 'Tipo de archivo no válido.');

  const meeting = await db.meetingMinute.findUnique({
    where: { id: meetingId },
    select: {
      id: true,
      title: true,
      meetingAt: true,
      processedAt: true,
      organizerEmail: true,
      status: true,
      minuteStorageKey: true,
      transcriptStorageKey: true
    }
  });
  if (!meeting) throw createDriveError('DRIVE_FILE_NOT_FOUND', 'El archivo solicitado no existe.');
  if (meeting.status !== 'READY' || !meeting[definition.keyField]) {
    throw createDriveError('DRIVE_FILE_UNAVAILABLE', 'El archivo todavía no está disponible.');
  }

  const content = await storage.downloadJson({ key: meeting[definition.keyField] });
  return {
    ...projectFile(meeting, normalizedKind),
    content
  };
};

export const listDriveContents = async ({ db = prisma, folderId = null, query = '', includeTrash = false } = {}) => {
  if (folderId === BRIA_MINUTES_FOLDER.id) {
    const files = await listDriveFiles({ db, query });
    return { currentFolder: BRIA_MINUTES_FOLDER, breadcrumbs: [BRIA_MINUTES_FOLDER], folders: [], files };
  }

  const normalizedQuery = String(query || '').trim().slice(0, 120);
  const deletedAt = includeTrash ? { not: null } : null;
  const nameFilter = normalizedQuery ? { contains: normalizedQuery, mode: 'insensitive' } : undefined;
  const [folders, files] = await Promise.all([
    db.driveFolder.findMany({
      where: { parentId: folderId || null, deletedAt, ...(nameFilter ? { name: nameFilter } : {}) },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, parentId: true, createdAt: true, updatedAt: true, deletedAt: true }
    }),
    db.driveFile.findMany({
      where: { folderId: folderId || null, deletedAt, ...(nameFilter ? { name: nameFilter } : {}) },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true, name: true, subtitle: true, mimeType: true, sizeBytes: true, source: true,
        category: true, folderId: true, createdAt: true, updatedAt: true, deletedAt: true
      }
    })
  ]);

  return {
    currentFolder: folderId ? folders.find(folder => folder.id === folderId) || { id: folderId } : null,
    breadcrumbs: [],
    folders: folderId || includeTrash ? folders : [BRIA_MINUTES_FOLDER, ...folders],
    files: files.map(publicManagedFile)
  };
};

export const createDriveFolder = async ({ name, parentId = null, actorId, db = prisma }) => {
  if (parentId === BRIA_MINUTES_FOLDER.id) {
    throw createDriveError('DRIVE_SYSTEM_FOLDER_READ_ONLY', 'La carpeta automática de Bria es de solo lectura.');
  }
  return db.driveFolder.create({
    data: { name: cleanName(name, 'Nombre de carpeta'), parentId: parentId || null, createdById: actorId || null },
    select: { id: true, name: true, parentId: true, createdAt: true, updatedAt: true }
  });
};

export const uploadDriveFile = async ({ file, folderId = null, subtitle = null, actorId, db = prisma, storage = documentStorage }) => {
  validateUploadFile(file, { maxBytes: 25 * 1024 * 1024 });
  if (folderId === BRIA_MINUTES_FOLDER.id) {
    throw createDriveError('DRIVE_SYSTEM_FOLDER_READ_ONLY', 'La carpeta automática de Bria es de solo lectura.');
  }
  const now = new Date();
  const key = `drive/uploads/${now.getUTCFullYear()}/${randomUUID()}-${sanitizeStorageName(file.originalname)}`;
  const artifact = await storage.uploadBuffer({ key, body: file.buffer, mimeType: file.mimetype });
  return db.driveFile.create({
    data: {
      name: cleanName(file.originalname, 'Nombre de archivo'),
      subtitle: subtitle ? String(subtitle).trim().slice(0, 240) : null,
      mimeType: file.mimetype || artifact.mimeType,
      sizeBytes: Number(file.size || artifact.size || file.buffer.length),
      storageProvider: 'RAILWAY',
      storageKey: artifact.key,
      source: 'UPLOAD',
      category: 'GENERAL',
      folderId: folderId || null,
      uploadedById: actorId || null
    },
    select: {
      id: true, name: true, subtitle: true, mimeType: true, sizeBytes: true, source: true,
      category: true, folderId: true, createdAt: true, updatedAt: true
    }
  });
};

export const updateDriveFile = async ({ id, name, folderId, subtitle, db = prisma }) => {
  const data = {};
  if (name !== undefined) data.name = cleanName(name, 'Nombre de archivo');
  if (folderId !== undefined) data.folderId = folderId || null;
  if (subtitle !== undefined) data.subtitle = subtitle ? String(subtitle).trim().slice(0, 240) : null;
  return db.driveFile.update({ where: { id }, data });
};

export const updateDriveFolder = async ({ id, name, parentId, db = prisma }) => {
  const data = {};
  if (name !== undefined) data.name = cleanName(name, 'Nombre de carpeta');
  if (parentId !== undefined) {
    if (parentId === id) throw createDriveError('DRIVE_FOLDER_CYCLE', 'Una carpeta no puede contenerse a sí misma.');
    data.parentId = parentId || null;
  }
  return db.driveFolder.update({ where: { id }, data });
};

export const trashDriveFile = async ({ id, db = prisma }) => db.driveFile.update({
  where: { id },
  data: { deletedAt: new Date() }
});

export const trashDriveFolder = async ({ id, db = prisma }) => db.driveFolder.update({
  where: { id },
  data: { deletedAt: new Date() }
});

export const restoreDriveFile = async ({ id, db = prisma }) => db.driveFile.update({
  where: { id },
  data: { deletedAt: null }
});

export const restoreDriveFolder = async ({ id, db = prisma }) => db.driveFolder.update({
  where: { id },
  data: { deletedAt: null }
});

export const readManagedDriveFile = async ({ id, db = prisma, storage = documentStorage }) => {
  const file = await db.driveFile.findFirst({ where: { id, deletedAt: null } });
  if (!file) throw createDriveError('DRIVE_FILE_NOT_FOUND', 'El archivo solicitado no existe.');
  const artifact = await storage.downloadBuffer({ key: file.storageKey });
  return { file: publicManagedFile(file), ...artifact };
};
