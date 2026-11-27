import { createHmac, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';
import { getJwtSecret } from '../config/security.js';
import { sniffMediaType } from '../lib/fileSignature.js';
import { deleteFromS3, getFromS3Stream, putS3Object } from './s3Service.js';

// Archivos en los anuncios (Rodny, 27 de noviembre de 2026: «que en los anuncios de la plataforma también se puedan
// añadir imágenes … deben cargarse en un bucket donde haya borrado programado», y luego: «que no sea solo imagen sino
// archivos como ya se puede por ejemplo en las tareas»).
//
// - Viven en el bucket compartido (`AWS_S3_BUCKET_NAME`, `chat-evidence`), bajo `announcements/`, que ya tiene sus
//   barridos; este archivo añade el de los anuncios.
// - Se suben antes de publicar (mientras se escribe el anuncio) y quedan sueltos hasta que el anuncio los toma. Uno
//   suelto más de un día se borra; uno de un anuncio se borra a los 30 días de subido
//   (`ANNOUNCEMENT_FILE_RETENTION_DAYS`). La fila se queda con `purgedAt` para que el anuncio diga que ya no está.
// - Se leen con un pase en la dirección (una `<img>` no manda la cabecera de sesión) que solo abre ese archivo, para
//   esa persona, y que nunca vale como sesión. Se firma por ventanas de tres horas: el dashboard se refresca cada
//   minuto y, con la misma dirección, el navegador no vuelve a bajar las imágenes.
// - Solo se muestran dentro de la plataforma las imágenes, los PDF y el texto plano, con su tipo comprobado. Todo lo
//   demás (Word, Excel, ZIP, video…) se entrega siempre como descarga: un HTML o un SVG subido nunca corre en
//   nuestro dominio.

export const ANNOUNCEMENT_FILE_PREFIX = 'announcements/';
export const MAX_ANNOUNCEMENT_FILES = 10;
export const MAX_ANNOUNCEMENT_FILE_BYTES = 25 * 1024 * 1024;
export const DEFAULT_ANNOUNCEMENT_FILE_RETENTION_DAYS = 30;
export const ORPHAN_FILE_HOURS = 24;
const TICKET_AUDIENCE = 'announcement-file';
const TICKET_WINDOW_SECONDS = 3 * 60 * 60;
const IMAGE_EXTENSIONS = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
const TEXT_NAME = /\.(txt|md|csv|tsv|json|log|xml|yaml|yml)$/i;
const INLINE_TYPES = new Set([...Object.keys(IMAGE_EXTENSIONS), 'application/pdf', 'text/plain']);
const SCOPES = ['GLOBAL', 'MEMBER'];
const MANAGER_ROLES = ['ADMIN', 'PROJECT_MANAGER'];
const DAY_MS = 24 * 60 * 60 * 1000;

const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });

export const announcementFileRetentionDays = (env = process.env) => {
  const raw = Number(env.ANNOUNCEMENT_FILE_RETENTION_DAYS);
  return Number.isFinite(raw) && raw >= 1 ? raw : DEFAULT_ANNOUNCEMENT_FILE_RETENTION_DAYS;
};

const ticketSecret = (secret = getJwtSecret()) => createHmac('sha256', secret).update('brain-announcement-file-v1').digest();

/** El pase de un archivo para una persona. Igual durante toda su ventana, para que el navegador lo reutilice. */
export const signAnnouncementFileTicket = ({ fileId, userId }, { now = Date.now(), secret } = {}) => {
  const window = Math.floor(now / 1000 / TICKET_WINDOW_SECONDS);
  // Vale hasta el final de la ventana siguiente: nunca menos de tres horas desde que se entregó.
  const exp = (window + 2) * TICKET_WINDOW_SECONDS;
  return jwt.sign({ fileId, userId, exp }, ticketSecret(secret), { audience: TICKET_AUDIENCE, algorithm: 'HS256', noTimestamp: true });
};

export const verifyAnnouncementFileTicket = (ticket, { secret } = {}) =>
  jwt.verify(String(ticket || ''), ticketSecret(secret), { audience: TICKET_AUDIENCE, algorithms: ['HS256'] });

const announcementFileUrl = (fileId, userId, options) =>
  `/api/announcement-files/${encodeURIComponent(fileId)}?access_token=${encodeURIComponent(signAnnouncementFileTicket({ fileId, userId }, options))}`;

const publicFile = (row, userId, options) => ({
  id: row.id,
  name: row.name,
  mimeType: row.mimeType,
  size: row.size,
  removed: Boolean(row.purgedAt),
  url: row.purgedAt ? null : announcementFileUrl(row.id, userId, options)
});

const isPdf = (buffer) => buffer.length >= 5 && buffer.subarray(0, 5).toString('latin1') === '%PDF-';
const extensionOf = (name) => (/\.([a-z0-9]{1,8})$/i.exec(name || '')?.[1] || 'bin').toLowerCase();

/**
 * Qué se guarda de un archivo: su tipo real (por los bytes cuando se puede) y la extensión de la llave. Una imagen
 * que dice serlo pero no lo es, o una foto HEIC, se rechaza con el motivo.
 */
export const classifyAnnouncementFile = ({ buffer, originalname, mimetype }) => {
  const name = String(originalname || 'archivo').slice(0, 200);
  const sniffed = sniffMediaType(buffer);
  if (sniffed === 'image/heic') throw fail(415, `«${name}» es una foto HEIC del iPhone, que no se ve en todos los navegadores. Expórtala como JPG o PNG.`);
  if (IMAGE_EXTENSIONS[sniffed]) return { name, mimeType: sniffed, extension: IMAGE_EXTENSIONS[sniffed] };
  const declared = String(mimetype || '').toLowerCase();
  if (declared.startsWith('image/') && declared !== 'image/svg+xml') throw fail(415, `«${name}» dice ser una imagen, pero su contenido no lo es. Vuelve a exportarla.`);
  if (isPdf(buffer)) return { name, mimeType: 'application/pdf', extension: 'pdf' };
  if (TEXT_NAME.test(name)) return { name, mimeType: 'text/plain', extension: extensionOf(name) };
  // El resto se guarda con lo que declara, solo para su icono y su etiqueta: se entrega siempre como descarga.
  const safeDeclared = /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(declared) ? declared : 'application/octet-stream';
  return { name, mimeType: sniffed || safeDeclared, extension: extensionOf(name) };
};

/** Sube un archivo suelto para el anuncio que se está escribiendo. Solo quien puede publicar anuncios. */
export const uploadAnnouncementFile = async ({ file, requester }, { db = prisma, storage = { put: putS3Object }, now = new Date() } = {}) => {
  if (!MANAGER_ROLES.includes(requester?.role)) throw fail(403, 'Solo administradores o project managers pueden añadir archivos a un anuncio.');
  if (!file?.buffer?.length) throw fail(400, 'Elige un archivo que no esté vacío.');
  if (file.buffer.length > MAX_ANNOUNCEMENT_FILE_BYTES) throw fail(413, 'El archivo pesa más de 25 MB. Compártelo por Drive y pon el enlace en el anuncio.');
  const { name, mimeType, extension } = classifyAnnouncementFile(file);
  const id = randomUUID();
  const storageKey = `${ANNOUNCEMENT_FILE_PREFIX}${id}.${extension}`;
  // Primero la fila: así ningún archivo queda en el bucket sin que el barrido sepa de él.
  const row = await db.announcementFile.create({ data: {
    id, storageKey, name, mimeType, size: file.buffer.length, uploadedById: requester.userId || null, createdAt: now
  } });
  try {
    await storage.put({ key: storageKey, body: file.buffer, contentType: INLINE_TYPES.has(mimeType) ? mimeType : 'application/octet-stream' });
  } catch (error) {
    await db.announcementFile.delete({ where: { id } }).catch(() => {});
    console.error('[AnnouncementFiles] No se pudo guardar el archivo:', error.message);
    throw fail(502, 'No se pudo guardar el archivo. Inténtalo de nuevo.');
  }
  return publicFile(row, requester.userId);
};

const normalizeIds = (fileIds) => {
  if (fileIds === undefined) return undefined;
  if (!Array.isArray(fileIds) || fileIds.some(id => typeof id !== 'string' || !id)) throw fail(400, 'La lista de archivos no es válida.');
  const unique = [...new Set(fileIds)];
  if (unique.length > MAX_ANNOUNCEMENT_FILES) throw fail(400, `Un anuncio lleva hasta ${MAX_ANNOUNCEMENT_FILES} archivos.`);
  return unique;
};

/** Antes de publicar: que cada archivo exista, siga guardado y esté suelto o ya sea de este anuncio. */
export const assertAnnouncementFilesAttachable = async (db, { fileIds, scope, announcementId = null }) => {
  const ids = normalizeIds(fileIds);
  if (!ids?.length) return ids;
  if (!SCOPES.includes(scope)) throw fail(400, 'Alcance de anuncio no soportado.');
  const rows = await db.announcementFile.findMany({ where: { id: { in: ids } } });
  const byId = new Map(rows.map(row => [row.id, row]));
  for (const id of ids) {
    const row = byId.get(id);
    if (!row || row.purgedAt) throw fail(409, 'Uno de los archivos ya no está disponible. Quítalo y vuelve a subirlo.');
    const free = !row.announcementId;
    const ours = announcementId && row.announcementId === announcementId && row.scope === scope;
    if (!free && !ours) throw fail(409, 'Uno de los archivos pertenece a otro anuncio. Vuelve a subirlo.');
  }
  return ids;
};

/**
 * Deja al anuncio con exactamente estos archivos y en este orden. `undefined` no toca nada (clientes viejos);
 * los que se quitan quedan sueltos y el barrido los borra al día siguiente.
 */
export const setAnnouncementFiles = async (db, { fileIds, scope, announcementId, now = new Date() }) => {
  const ids = await assertAnnouncementFilesAttachable(db, { fileIds, scope, announcementId });
  if (ids === undefined) return undefined;
  await db.announcementFile.updateMany({
    where: { scope, announcementId, ...(ids.length ? { id: { notIn: ids } } : {}) },
    data: { scope: null, announcementId: null, attachedAt: null, position: 0 }
  });
  for (const [position, id] of ids.entries()) {
    await db.announcementFile.update({ where: { id }, data: { scope, announcementId, position, attachedAt: now } });
  }
  return ids;
};

/** Un anuncio personal eliminado suelta sus archivos: el barrido los borra. Los generales archivados los conservan. */
export const releaseAnnouncementFiles = (db, { scope, announcementId }) => db.announcementFile.updateMany({
  where: { scope, announcementId },
  data: { scope: null, announcementId: null, attachedAt: null, position: 0 }
});

/** Los archivos de varios anuncios, con su pase para quien los va a ver. */
const filesForAnnouncements = async (db, announcements, userId, options) => {
  if (!announcements.length || !db?.announcementFile) return new Map();
  const rows = await db.announcementFile.findMany({
    where: { OR: SCOPES.map(scope => ({ scope, announcementId: { in: announcements.filter(row => row.scope === scope).map(row => row.id) } })) },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }]
  });
  const grouped = new Map();
  for (const row of rows) {
    const key = `${row.scope}:${row.announcementId}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(publicFile(row, userId, options));
  }
  return grouped;
};

export const withAnnouncementFiles = async (db, announcements, userId, options) => {
  try {
    const files = await filesForAnnouncements(db, announcements, userId, options);
    return announcements.map(row => ({ ...row, attachments: files.get(`${row.scope}:${row.id}`) || [] }));
  } catch (error) {
    // Sin archivos el anuncio se sigue leyendo: nunca tumbar el dashboard por esto.
    console.error('[AnnouncementFiles] No se pudieron leer los archivos:', error.message);
    return announcements.map(row => ({ ...row, attachments: [] }));
  }
};

/** Qué hacer con un archivo en el barrido, y por qué. Ante la duda se conserva. */
export const announcementFilePurgeDecision = (row, { now = new Date(), retentionDays = DEFAULT_ANNOUNCEMENT_FILE_RETENTION_DAYS } = {}) => {
  const keep = reason => ({ action: 'keep', reason, id: row?.id });
  if (!row?.id || !row.storageKey) return keep('missing-row');
  if (!String(row.storageKey).startsWith(ANNOUNCEMENT_FILE_PREFIX)) return keep('not-ours');
  if (row.purgedAt) return keep('already-purged');
  const created = new Date(row.createdAt).getTime();
  if (!Number.isFinite(created)) return keep('missing-date');
  const age = new Date(now).getTime() - created;
  if (!row.announcementId) return age > ORPHAN_FILE_HOURS * 60 * 60 * 1000 ? { action: 'delete', reason: 'orphan', id: row.id } : keep('draft');
  return age > retentionDays * DAY_MS ? { action: 'purge', reason: 'expired', id: row.id } : keep('inside-window');
};

export const sweepAnnouncementFiles = async ({ db = prisma, storage = { remove: deleteFromS3 }, now = new Date(), retentionDays = announcementFileRetentionDays(), dryRun = false } = {}) => {
  const orphanCutoff = new Date(new Date(now).getTime() - ORPHAN_FILE_HOURS * 60 * 60 * 1000);
  const rows = await db.announcementFile.findMany({ where: { purgedAt: null, createdAt: { lt: orphanCutoff } }, take: 2000 });
  const result = { deleted: 0, purged: 0, kept: 0, failed: 0, dryRun };
  for (const row of rows) {
    const decision = announcementFilePurgeDecision(row, { now, retentionDays });
    if (decision.action === 'keep') { result.kept += 1; continue; }
    if (dryRun) { result[decision.action === 'delete' ? 'deleted' : 'purged'] += 1; continue; }
    try {
      // Primero el archivo: si el bucket no responde, la fila sigue y vuelve en el próximo barrido.
      await storage.remove(row.storageKey);
      if (decision.action === 'delete') await db.announcementFile.delete({ where: { id: row.id } });
      else await db.announcementFile.update({ where: { id: row.id }, data: { purgedAt: now } });
      result[decision.action === 'delete' ? 'deleted' : 'purged'] += 1;
    } catch (error) {
      console.error(`[AnnouncementFiles] No se pudo borrar ${row.storageKey}:`, error.message);
      result.failed += 1;
    }
  }
  return result;
};

/** Un barrido al día. `ANNOUNCEMENT_FILE_SWEEP=off` lo apaga. */
export const startAnnouncementFileSweep = ({ env = process.env, intervalMs = DAY_MS } = {}) => {
  if (String(env.ANNOUNCEMENT_FILE_SWEEP || '').trim().toLowerCase() === 'off') return null;
  const run = () => sweepAnnouncementFiles({ retentionDays: announcementFileRetentionDays(env) })
    .then(r => console.log(`[AnnouncementFiles] Barrido: ${r.deleted} sueltos y ${r.purged} vencidos borrados, ${r.kept} conservados, ${r.failed} fallidos.`))
    .catch(error => console.error('[AnnouncementFiles] Falló el barrido:', error.message));
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  setTimeout(run, 60_000).unref?.();
  return timer;
};

/** Entrega un archivo con su pase. Solo lectura, solo ese archivo y solo con una cuenta activa. */
export const serveAnnouncementFile = async (req, res, { db = prisma, storage = { get: getFromS3Stream } } = {}) => {
  res.set('X-Content-Type-Options', 'nosniff');
  let ticket;
  try {
    ticket = verifyAnnouncementFileTicket(req.query.access_token);
  } catch {
    return res.status(401).json({ error: 'El acceso al archivo venció. Recarga la página.' });
  }
  if (ticket.fileId !== req.params.id) return res.status(403).json({ error: 'Archivo no autorizado.' });
  const [user, row] = await Promise.all([
    db.user.findUnique({ where: { id: ticket.userId }, select: { isActive: true } }),
    db.announcementFile.findUnique({ where: { id: req.params.id } })
  ]);
  if (!user?.isActive) return res.status(401).json({ error: 'Tu sesión ya no está activa.' });
  if (!row || row.purgedAt) return res.status(404).json({ error: 'Este archivo ya se borró.' });
  const object = await storage.get(row.storageKey);
  // Solo lo que la plataforma muestra va «inline» y con su tipo; todo lo demás, como descarga.
  const download = req.query.download === '1' || !INLINE_TYPES.has(row.mimeType);
  const maxAge = Math.max(0, ticket.exp - Math.floor(Date.now() / 1000));
  res.set({
    'Content-Type': download ? 'application/octet-stream' : row.mimeType === 'text/plain' ? 'text/plain; charset=utf-8' : row.mimeType,
    'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(row.name)}`,
    'Cache-Control': `private, max-age=${maxAge}`
  });
  if (object.ContentLength) res.set('Content-Length', String(object.ContentLength));
  object.Body.on?.('error', error => { console.error('[AnnouncementFiles] Lectura interrumpida:', error.message); res.destroy(error); });
  object.Body.pipe(res);
};
