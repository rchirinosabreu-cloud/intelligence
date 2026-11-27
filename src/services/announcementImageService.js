import { createHmac, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';
import { getJwtSecret } from '../config/security.js';
import { sniffMediaType } from '../lib/fileSignature.js';
import { deleteFromS3, getFromS3Stream, putS3Object } from './s3Service.js';

// Imágenes en los anuncios (Rodny, 27 de noviembre de 2026: «que en los anuncios de la plataforma también se puedan
// añadir imágenes … deben cargarse en un bucket donde haya borrado programado»).
//
// - Viven en el bucket compartido (`AWS_S3_BUCKET_NAME`, `chat-evidence`), bajo `announcements/`, que ya tiene sus
//   barridos; este archivo añade el de los anuncios.
// - Se suben antes de publicar (mientras se escribe el anuncio) y quedan sueltas hasta que el anuncio las toma. Una
//   imagen suelta más de un día se borra; una imagen de un anuncio se borra a los 30 días de subida
//   (`ANNOUNCEMENT_IMAGE_RETENTION_DAYS`). La fila se queda con `purgedAt` para que el anuncio diga que ya no está.
// - Se leen con un pase en la dirección (una `<img>` no manda la cabecera de sesión) que solo abre esa imagen, para esa
//   persona, y que nunca vale como sesión. Se firma por ventanas de tres horas: el dashboard se refresca cada minuto
//   y, con la misma dirección, el navegador no vuelve a bajar la imagen.

export const ANNOUNCEMENT_IMAGE_PREFIX = 'announcements/';
export const MAX_ANNOUNCEMENT_IMAGES = 6;
export const MAX_ANNOUNCEMENT_IMAGE_BYTES = 10 * 1024 * 1024;
export const DEFAULT_ANNOUNCEMENT_IMAGE_RETENTION_DAYS = 30;
export const ORPHAN_IMAGE_HOURS = 24;
const TICKET_AUDIENCE = 'announcement-image';
const TICKET_WINDOW_SECONDS = 3 * 60 * 60;
const EXTENSIONS = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
const SCOPES = ['GLOBAL', 'MEMBER'];
const MANAGER_ROLES = ['ADMIN', 'PROJECT_MANAGER'];
const DAY_MS = 24 * 60 * 60 * 1000;

const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });

export const announcementImageRetentionDays = (env = process.env) => {
  const raw = Number(env.ANNOUNCEMENT_IMAGE_RETENTION_DAYS);
  return Number.isFinite(raw) && raw >= 1 ? raw : DEFAULT_ANNOUNCEMENT_IMAGE_RETENTION_DAYS;
};

const ticketSecret = (secret = getJwtSecret()) => createHmac('sha256', secret).update('brain-announcement-image-v1').digest();

/** El pase de una imagen para una persona. Igual durante toda su ventana, para que el navegador la reutilice. */
export const signAnnouncementImageTicket = ({ imageId, userId }, { now = Date.now(), secret } = {}) => {
  const window = Math.floor(now / 1000 / TICKET_WINDOW_SECONDS);
  // Vale hasta el final de la ventana siguiente: nunca menos de tres horas desde que se entregó.
  const exp = (window + 2) * TICKET_WINDOW_SECONDS;
  return jwt.sign({ imageId, userId, exp }, ticketSecret(secret), { audience: TICKET_AUDIENCE, algorithm: 'HS256', noTimestamp: true });
};

export const verifyAnnouncementImageTicket = (ticket, { secret } = {}) =>
  jwt.verify(String(ticket || ''), ticketSecret(secret), { audience: TICKET_AUDIENCE, algorithms: ['HS256'] });

export const announcementImageUrl = (imageId, userId, options) =>
  `/api/announcement-images/${encodeURIComponent(imageId)}?access_token=${encodeURIComponent(signAnnouncementImageTicket({ imageId, userId }, options))}`;

const publicImage = (row, userId, options) => ({
  id: row.id,
  name: row.name,
  mimeType: row.mimeType,
  size: row.size,
  removed: Boolean(row.purgedAt),
  url: row.purgedAt ? null : announcementImageUrl(row.id, userId, options)
});

/** Sube una imagen suelta para el anuncio que se está escribiendo. Solo quien puede publicar anuncios. */
export const uploadAnnouncementImage = async ({ file, requester }, { db = prisma, storage = { put: putS3Object, remove: deleteFromS3 }, now = new Date() } = {}) => {
  if (!MANAGER_ROLES.includes(requester?.role)) throw fail(403, 'Solo administradores o project managers pueden añadir imágenes a un anuncio.');
  if (!file?.buffer?.length) throw fail(400, 'Elige una imagen.');
  if (file.buffer.length > MAX_ANNOUNCEMENT_IMAGE_BYTES) throw fail(413, 'La imagen pesa más de 10 MB. Expórtala más liviana y vuelve a subirla.');
  // El tipo lo dicen los bytes, no el nombre.
  const mimeType = sniffMediaType(file.buffer);
  if (mimeType === 'image/heic') throw fail(415, 'Las fotos HEIC del iPhone no se ven en todos los navegadores. Expórtala como JPG o PNG.');
  if (!EXTENSIONS[mimeType]) throw fail(415, 'Solo se pueden añadir imágenes JPG, PNG, GIF o WebP.');
  const id = randomUUID();
  const storageKey = `${ANNOUNCEMENT_IMAGE_PREFIX}${id}.${EXTENSIONS[mimeType]}`;
  const name = String(file.originalname || `imagen.${EXTENSIONS[mimeType]}`).slice(0, 200);
  // Primero la fila: así ningún archivo queda en el bucket sin que el barrido sepa de él.
  const row = await db.announcementImage.create({ data: {
    id, storageKey, name, mimeType, size: file.buffer.length, uploadedById: requester.userId || null, createdAt: now
  } });
  try {
    await storage.put({ key: storageKey, body: file.buffer, contentType: mimeType });
  } catch (error) {
    await db.announcementImage.delete({ where: { id } }).catch(() => {});
    console.error('[AnnouncementImages] No se pudo guardar la imagen:', error.message);
    throw fail(502, 'No se pudo guardar la imagen. Inténtalo de nuevo.');
  }
  return publicImage(row, requester.userId);
};

const normalizeIds = (imageIds) => {
  if (imageIds === undefined) return undefined;
  if (!Array.isArray(imageIds) || imageIds.some(id => typeof id !== 'string' || !id)) throw fail(400, 'La lista de imágenes no es válida.');
  const unique = [...new Set(imageIds)];
  if (unique.length > MAX_ANNOUNCEMENT_IMAGES) throw fail(400, `Un anuncio lleva hasta ${MAX_ANNOUNCEMENT_IMAGES} imágenes.`);
  return unique;
};

/** Antes de publicar: que cada imagen exista, siga guardada y esté suelta o ya sea de este anuncio. */
export const assertAnnouncementImagesAttachable = async (db, { imageIds, scope, announcementId = null }) => {
  const ids = normalizeIds(imageIds);
  if (!ids?.length) return ids;
  if (!SCOPES.includes(scope)) throw fail(400, 'Alcance de anuncio no soportado.');
  const rows = await db.announcementImage.findMany({ where: { id: { in: ids } } });
  const byId = new Map(rows.map(row => [row.id, row]));
  for (const id of ids) {
    const row = byId.get(id);
    if (!row || row.purgedAt) throw fail(409, 'Una de las imágenes ya no está disponible. Quítala y vuelve a subirla.');
    const free = !row.announcementId;
    const ours = announcementId && row.announcementId === announcementId && row.scope === scope;
    if (!free && !ours) throw fail(409, 'Una de las imágenes pertenece a otro anuncio. Vuelve a subirla.');
  }
  return ids;
};

/**
 * Deja al anuncio con exactamente estas imágenes y en este orden. `undefined` no toca nada (clientes viejos);
 * las que se quitan quedan sueltas y el barrido las borra al día siguiente.
 */
export const setAnnouncementImages = async (db, { imageIds, scope, announcementId, now = new Date() }) => {
  const ids = await assertAnnouncementImagesAttachable(db, { imageIds, scope, announcementId });
  if (ids === undefined) return undefined;
  await db.announcementImage.updateMany({
    where: { scope, announcementId, ...(ids.length ? { id: { notIn: ids } } : {}) },
    data: { scope: null, announcementId: null, attachedAt: null, position: 0 }
  });
  for (const [position, id] of ids.entries()) {
    await db.announcementImage.update({ where: { id }, data: { scope, announcementId, position, attachedAt: now } });
  }
  return ids;
};

/** Un anuncio personal eliminado suelta sus imágenes: el barrido las borra. Los generales archivados las conservan. */
export const releaseAnnouncementImages = (db, { scope, announcementId }) => db.announcementImage.updateMany({
  where: { scope, announcementId },
  data: { scope: null, announcementId: null, attachedAt: null, position: 0 }
});

/** Las imágenes de varios anuncios, con su pase para quien las va a ver. */
export const imagesForAnnouncements = async (db, announcements, userId, options) => {
  if (!announcements.length || !db?.announcementImage) return new Map();
  const rows = await db.announcementImage.findMany({
    where: { OR: SCOPES.map(scope => ({ scope, announcementId: { in: announcements.filter(row => row.scope === scope).map(row => row.id) } })) },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }]
  });
  const grouped = new Map();
  for (const row of rows) {
    const key = `${row.scope}:${row.announcementId}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(publicImage(row, userId, options));
  }
  return grouped;
};

export const withAnnouncementImages = async (db, announcements, userId, options) => {
  try {
    const images = await imagesForAnnouncements(db, announcements, userId, options);
    return announcements.map(row => ({ ...row, images: images.get(`${row.scope}:${row.id}`) || [] }));
  } catch (error) {
    // Sin imágenes el anuncio se sigue leyendo: nunca tumbar el dashboard por esto.
    console.error('[AnnouncementImages] No se pudieron leer las imágenes:', error.message);
    return announcements.map(row => ({ ...row, images: [] }));
  }
};

/** Qué hacer con una imagen en el barrido, y por qué. Ante la duda se conserva. */
export const announcementImagePurgeDecision = (row, { now = new Date(), retentionDays = DEFAULT_ANNOUNCEMENT_IMAGE_RETENTION_DAYS } = {}) => {
  const keep = reason => ({ action: 'keep', reason, id: row?.id });
  if (!row?.id || !row.storageKey) return keep('missing-row');
  if (!String(row.storageKey).startsWith(ANNOUNCEMENT_IMAGE_PREFIX)) return keep('not-ours');
  if (row.purgedAt) return keep('already-purged');
  const created = new Date(row.createdAt).getTime();
  if (!Number.isFinite(created)) return keep('missing-date');
  const age = new Date(now).getTime() - created;
  if (!row.announcementId) return age > ORPHAN_IMAGE_HOURS * 60 * 60 * 1000 ? { action: 'delete', reason: 'orphan', id: row.id } : keep('draft');
  return age > retentionDays * DAY_MS ? { action: 'purge', reason: 'expired', id: row.id } : keep('inside-window');
};

export const sweepAnnouncementImages = async ({ db = prisma, storage = { remove: deleteFromS3 }, now = new Date(), retentionDays = announcementImageRetentionDays(), dryRun = false } = {}) => {
  const orphanCutoff = new Date(new Date(now).getTime() - ORPHAN_IMAGE_HOURS * 60 * 60 * 1000);
  const rows = await db.announcementImage.findMany({ where: { purgedAt: null, createdAt: { lt: orphanCutoff } }, take: 2000 });
  const result = { deleted: 0, purged: 0, kept: 0, failed: 0, dryRun };
  for (const row of rows) {
    const decision = announcementImagePurgeDecision(row, { now, retentionDays });
    if (decision.action === 'keep') { result.kept += 1; continue; }
    if (dryRun) { result[decision.action === 'delete' ? 'deleted' : 'purged'] += 1; continue; }
    try {
      // Primero el archivo: si el bucket no responde, la fila sigue y vuelve en el próximo barrido.
      await storage.remove(row.storageKey);
      if (decision.action === 'delete') await db.announcementImage.delete({ where: { id: row.id } });
      else await db.announcementImage.update({ where: { id: row.id }, data: { purgedAt: now } });
      result[decision.action === 'delete' ? 'deleted' : 'purged'] += 1;
    } catch (error) {
      console.error(`[AnnouncementImages] No se pudo borrar ${row.storageKey}:`, error.message);
      result.failed += 1;
    }
  }
  return result;
};

/** Un barrido al día. `ANNOUNCEMENT_IMAGE_SWEEP=off` lo apaga. */
export const startAnnouncementImageSweep = ({ env = process.env, intervalMs = DAY_MS } = {}) => {
  if (String(env.ANNOUNCEMENT_IMAGE_SWEEP || '').trim().toLowerCase() === 'off') return null;
  const run = () => sweepAnnouncementImages({ retentionDays: announcementImageRetentionDays(env) })
    .then(r => console.log(`[AnnouncementImages] Barrido: ${r.deleted} sueltas y ${r.purged} vencidas borradas, ${r.kept} conservadas, ${r.failed} fallidas.`))
    .catch(error => console.error('[AnnouncementImages] Falló el barrido:', error.message));
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  setTimeout(run, 60_000).unref?.();
  return timer;
};

/** Entrega una imagen con su pase. Solo lectura, solo esa imagen y solo con una cuenta activa. */
export const serveAnnouncementImage = async (req, res, { db = prisma, storage = { get: getFromS3Stream } } = {}) => {
  res.set('X-Content-Type-Options', 'nosniff');
  let ticket;
  try {
    ticket = verifyAnnouncementImageTicket(req.query.access_token);
  } catch {
    return res.status(401).json({ error: 'El acceso a la imagen venció. Recarga la página.' });
  }
  if (ticket.imageId !== req.params.id) return res.status(403).json({ error: 'Imagen no autorizada.' });
  const [user, row] = await Promise.all([
    db.user.findUnique({ where: { id: ticket.userId }, select: { isActive: true } }),
    db.announcementImage.findUnique({ where: { id: req.params.id } })
  ]);
  if (!user?.isActive) return res.status(401).json({ error: 'Tu sesión ya no está activa.' });
  if (!row || row.purgedAt) return res.status(404).json({ error: 'Esta imagen ya se borró.' });
  const object = await storage.get(row.storageKey);
  const download = req.query.download === '1';
  const maxAge = Math.max(0, ticket.exp - Math.floor(Date.now() / 1000));
  res.set({
    'Content-Type': download ? 'application/octet-stream' : row.mimeType,
    'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(row.name)}`,
    'Cache-Control': `private, max-age=${maxAge}`
  });
  if (object.ContentLength) res.set('Content-Length', String(object.ContentLength));
  object.Body.on?.('error', error => { console.error('[AnnouncementImages] Lectura interrumpida:', error.message); res.destroy(error); });
  object.Body.pipe(res);
};
