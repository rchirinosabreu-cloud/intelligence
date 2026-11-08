import DOMPurify from 'isomorphic-dompurify';
import { activeTeamUserWhere } from './teamRosterService.js';
import { assertNoticeResponsePolicy } from '../lib/alertResponsePolicy.js';

const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });
export const announcementSubject = id => `announcement:${id}`;
const managerRoles = ['ADMIN', 'PROJECT_MANAGER'];
const transact = async (db, work) => {
  for (let attempt = 0; ; attempt++) {
    try { return await db.$transaction(work, { isolationLevel: 'Serializable' }); }
    catch (error) {
      if (['P2034', 'P2002'].includes(error.code) && attempt < 2) continue;
      if (error.code === 'P2034') throw fail(409, 'El anuncio cambió. Actualiza y vuelve a intentarlo.');
      throw error;
    }
  }
};
const actorNow = async (db, actor, manage = false) => {
  const user = await db.user.findFirst({ where: { id: actor?.userId || actor?.id || '', ...activeTeamUserWhere() },
    select: { id: true, name: true, role: true } });
  if (!user || (manage && !managerRoles.includes(user.role))) throw fail(403, 'No tienes acceso vigente para esta acción.');
  return user;
};
const sanitizeContent = content => DOMPurify.sanitize(content.trim(), { ALLOWED_TAGS: ['p', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'br', 'span', 'mark', 'a'],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'data-type', 'data-id', 'data-label', 'data-mention-id'] }).trim();
export const cleanAnnouncement = content => {
  if (typeof content !== 'string' || content.length > 30000) throw fail(400, 'Escribe un anuncio de hasta 30.000 caracteres.');
  const clean = sanitizeContent(content);
  if (!DOMPurify.sanitize(clean, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }).replace(/&nbsp;/gi, ' ').trim()) throw fail(400, 'El anuncio no puede estar vacío.');
  return clean;
};
export const announcementExcerpt = content => {
  const text = DOMPurify.sanitize(content.replace(/<\/(?:p|h[1-6]|li)>|<br\s*\/?\s*>/gi, ' '), { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
  return text.length <= 160 ? text : `${text.slice(0, 157).replace(/\s+\S*$/, '')}…`;
};
const event = (db, announcement, user, action, content, now) => db.announcementEvent.create({ data: {
  announcementId: announcement.id, actorId: user.id, action, revision: announcement.revision, content, createdAt: now
} });
const source = async (db, id) => {
  const row = await db.globalAnnouncement.findUnique({ where: { id } });
  if (!row) throw fail(404, 'El anuncio no existe.');
  return row;
};
const checkRevision = (row, expected) => {
  if (!Number.isInteger(expected) || expected !== row.revision) throw fail(409, 'El anuncio cambió. Actualiza antes de continuar.');
  if (row.archivedAt) throw fail(409, 'Este anuncio fue archivado. Sigue disponible en el historial.');
};

export const publishAnnouncement = (db, body, actor, { now = new Date() } = {}) => transact(db, async tx => {
  const user = await actorNow(tx, actor, true);
  const content = cleanAnnouncement(body.content);
  if (typeof body.requestId !== 'string' || !/^[\w-]{8,100}$/.test(body.requestId)) throw fail(400, 'Falta la identificación de este envío.');
  const existing = await tx.globalAnnouncement.findUnique({ where: { requestId: body.requestId } });
  if (existing) {
    const created = await tx.announcementEvent.findFirst({ where: { announcementId: existing.id, action: 'PUBLISHED' } });
    if (existing.authorId !== user.id || created?.content !== content) throw fail(409, 'Ese envío corresponde a otro anuncio.');
    return existing;
  }
  const row = await tx.globalAnnouncement.create({ data: { content, type: 'DASHBOARD', authorId: user.id, requestId: body.requestId, createdAt: now } });
  const recipients = await tx.user.findMany({ where: { ...activeTeamUserWhere(), id: { not: user.id } }, select: { id: true } });
  assertNoticeResponsePolicy({ kind: 'ANUNCIO_GENERAL' });
  for (const recipient of recipients) {
    await tx.announcementDelivery.create({ data: { announcementId: row.id, userId: recipient.id, createdAt: now } });
    await tx.importantNotice.create({ data: { userId: recipient.id, kind: 'ANUNCIO_GENERAL', level: 'IMPORTANTE',
      subjectId: announcementSubject(row.id), label: `Nuevo anuncio general · ${user.name}`, message: announcementExcerpt(content), createdAt: now } });
  }
  await event(tx, row, user, 'PUBLISHED', content, now);
  return row;
});

export const previewAnnouncement = async (db, id, actor) => {
  await actorNow(db, actor);
  const row = await db.globalAnnouncement.findUnique({ where: { id }, include: { author: { select: { name: true } } } });
  if (!row) throw fail(404, 'El anuncio no existe.');
  return { id: row.id, content: sanitizeContent(row.content), author: row.author?.name || 'Equipo Brainstudio', createdAt: row.createdAt, revision: row.revision, archivedAt: row.archivedAt };
};

export const respondAnnouncement = (db, id, body, actor, { now = new Date() } = {}) => transact(db, async tx => {
  const user = await actorNow(tx, actor);
  if (!['open', 'dismiss'].includes(body.action)) throw fail(400, 'Elige abrir el anuncio o cerrar su aviso.');
  const row = await source(tx, id);
  checkRevision(row, body.expectedRevision);
  let delivery = await tx.announcementDelivery.findUnique({ where: { announcementId_userId: { announcementId: id, userId: user.id } } });
  // Los legados o nuevos miembros pueden abrir desde el historial sin recibir avisos retroactivos.
  if (!delivery && body.action === 'dismiss') throw fail(404, 'No tienes un aviso pendiente de este anuncio.');
  if (!delivery) delivery = await tx.announcementDelivery.create({ data: { announcementId: id, userId: user.id, createdAt: now } });
  const changed = body.action === 'open' ? delivery.openedRevision !== row.revision : !delivery.dismissedAt;
  if (changed) {
    delivery = await tx.announcementDelivery.update({ where: { id: delivery.id }, data: body.action === 'open'
      ? { openedAt: now, openedRevision: row.revision } : { dismissedAt: now } });
    await event(tx, row, user, body.action === 'open' ? 'OPENED' : 'DISMISSED', null, now);
  }
  await tx.importantNotice.updateMany({ where: { userId: user.id, subjectId: announcementSubject(id), kind: 'ANUNCIO_GENERAL', resolvedAt: null },
    data: { resolvedAt: now, decidedAt: now, resolution: body.action === 'open' ? 'ANUNCIO_ABIERTO' : 'ANUNCIO_CERRADO' } });
  // No se fabrican nuevas campanas. Las antiguas conservan su estado de lectura.
  return { ok: true, openedAt: delivery.openedAt, dismissedAt: delivery.dismissedAt };
});

export const changeAnnouncement = (db, id, body, actor, { now = new Date() } = {}) => transact(db, async tx => {
  const user = await actorNow(tx, actor, true), row = await source(tx, id);
  checkRevision(row, body.expectedRevision);
  const content = cleanAnnouncement(body.content);
  if (row.content === content) return row;
  await event(tx, row, user, 'EDITED', row.content, now);
  const updated = await tx.globalAnnouncement.update({ where: { id }, data: { content, revision: { increment: 1 } } });
  await tx.importantNotice.updateMany({ where: { subjectId: announcementSubject(id), kind: 'ANUNCIO_GENERAL', resolvedAt: null }, data: { message: announcementExcerpt(content) } });
  return updated;
});

export const archiveAnnouncement = (db, id, body, actor, { now = new Date() } = {}) => transact(db, async tx => {
  const user = await actorNow(tx, actor, true), row = await source(tx, id);
  if (row.archivedAt && body.expectedRevision === row.revision - 1) return row;
  checkRevision(row, body.expectedRevision);
  await event(tx, row, user, 'ARCHIVED', row.content, now);
  const updated = await tx.globalAnnouncement.update({ where: { id }, data: { archivedAt: now, revision: { increment: 1 } } });
  await tx.importantNotice.updateMany({ where: { subjectId: announcementSubject(id), kind: 'ANUNCIO_GENERAL', resolvedAt: null }, data: { resolvedAt: now, resolution: 'ANUNCIO_ARCHIVADO' } });
  return updated;
});

export const announcementHistory = async (db, id, actor) => {
  await actorNow(db, actor, true);
  const row = await source(db, id);
  const deliveries = await db.announcementDelivery.findMany({ where: { announcementId: id }, include: { user: { select: { name: true } } }, orderBy: { createdAt: 'asc' } });
  // El registro de auditoría completo conserva su lectura exclusiva para administradores.
  const user = await actorNow(db, actor);
  const events = user.role === 'ADMIN' ? await db.announcementEvent.findMany({ where: { announcementId: id }, orderBy: { createdAt: 'asc' }, include: { actor: { select: { name: true } } } }) : [];
  return { announcement: row, deliveries, events };
};

export const announcementNoticeState = async (db, notice) => {
  await actorNow(db, { userId: notice.userId });
  const id = notice.subjectId.replace(/^announcement:/, '');
  const row = await db.globalAnnouncement.findUnique({ where: { id } });
  const delivery = await db.announcementDelivery.findUnique({ where: { announcementId_userId: { announcementId: id, userId: notice.userId } } });
  if (!row || row.archivedAt || !delivery || delivery.openedAt || delivery.dismissedAt) return { reason: 'ANUNCIO_ATENDIDO' };
  return { announcement: { id, revision: row.revision }, refresh: { message: announcementExcerpt(row.content) } };
};
