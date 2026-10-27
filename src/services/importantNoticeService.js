// Avisos importantes (Rodny, 26 de octubre de 2026): lo que sale en la banda de abajo, uno a la vez. Cada aviso es de una
// persona y se queda hasta que decide: «Ya hice seguimiento» registra la gestión en el CRM (y con eso se reinicia la
// cuenta de días), «Recordarme» lo pospone y, en la revisión de los 30 días, «Descartar» la pasa a Descartado.
// Lo que se atendió por otro lado —una gestión registrada en el CRM, una oportunidad que ya no espera al cliente— sale
// solo de la banda, sin contar como decisión.
import prisma from '../lib/prisma.js';
import * as crmService from './crmService.js';
import { hasModulePermission } from '../config/security.js';
import { CRM_ACTIVITY_TYPES } from '../lib/crmRules.js';
import { FOLLOW_UP_ALERT_STAGES } from '../lib/crmFollowUpAlerts.js';
import { isFollowUpChannel, pickCurrentNotice, snoozeUntil } from '../lib/importantNotices.js';

const CONTACT_TYPES = CRM_ACTIVITY_TYPES.filter((type) => type.contact).map((type) => type.value);
const DISCARD_NOTE = 'Descartada desde el aviso de revisión: sin respuesta del cliente.';
// Cuántos avisos ya atendidos se descartan en una sola lectura antes de rendirse (una cola enorme no puede colgar la página).
const MAX_STALE_PER_READ = 25;

const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });

const serialize = (notice) => ({
    id: notice.id, kind: notice.kind, level: notice.level, label: notice.label, message: notice.message, url: notice.url || null
});

/** Un aviso nuevo de la misma oportunidad reemplaza al que esa persona tenía abierto: la banda dice siempre lo último. */
export const queueImportantNotice = async (db, data, now = new Date()) => db.$transaction(async (tx) => {
    await tx.importantNotice.updateMany({
        where: { userId: data.userId, subjectId: data.subjectId, resolvedAt: null },
        data: { resolvedAt: now, resolution: 'REEMPLAZADO' }
    });
    return tx.importantNotice.create({
        data: {
            userId: data.userId, kind: data.kind, level: data.level, subjectId: data.subjectId, label: data.label,
            message: data.message, url: data.url || null, notificationId: data.notificationId || null, createdAt: now
        }
    });
});

// ¿La oportunidad sigue esperando al cliente y nadie registró una gestión desde que salió el aviso?
const stillNeeded = async (db, notice) => {
    const lead = await db.crmLead.findUnique({
        where: { id: notice.subjectId },
        select: {
            stage: true, archivedAt: true,
            activities: { where: { type: { in: CONTACT_TYPES }, occurredAt: { gt: notice.createdAt } }, select: { id: true }, take: 1 }
        }
    });
    return Boolean(lead) && !lead.archivedAt && FOLLOW_UP_ALERT_STAGES.includes(lead.stage) && !(lead.activities || []).length;
};

/** El aviso que le toca ver a esa persona ahora y cuándo volver a preguntar. */
export const currentImportantNotice = async (db = prisma, userId, now = new Date()) => {
    const [pending, lastDecision] = await Promise.all([
        db.importantNotice.findMany({ where: { userId, resolvedAt: null } }),
        db.importantNotice.findFirst({ where: { userId, decidedAt: { not: null } }, orderBy: { decidedAt: 'desc' }, select: { decidedAt: true } })
    ]);
    let candidates = pending;
    for (let discarded = 0; discarded <= MAX_STALE_PER_READ; discarded += 1) {
        const { notice, nextAt } = pickCurrentNotice(candidates, lastDecision?.decidedAt || null, now);
        if (!notice) return { notice: null, nextAt };
        if (await stillNeeded(db, notice)) return { notice: serialize(notice), nextAt };
        await db.importantNotice.update({ where: { id: notice.id }, data: { resolvedAt: now, resolution: 'YA_ATENDIDO' } });
        candidates = candidates.filter((row) => row.id !== notice.id);
    }
    return { notice: null, nextAt: null };
};

const ownOpenNotice = async (db, id, actor) => {
    const userId = actor?.userId || actor?.id;
    const notice = await db.importantNotice.findFirst({ where: { id, userId } });
    if (!notice) throw httpError(404, 'Ese aviso ya no está.');
    if (notice.resolvedAt) throw httpError(409, 'Ese aviso ya se resolvió.');
    return notice;
};

const requireCrm = (actor) => {
    if (!hasModulePermission(actor, 'crm')) throw httpError(403, 'Para registrar la gestión necesitas acceso al CRM.');
};

// Decidir cierra el aviso y deja leída su notificación de la campana: es el mismo asunto.
const resolve = async (db, notice, resolution, now) => {
    await db.importantNotice.update({ where: { id: notice.id }, data: { resolvedAt: now, decidedAt: now, resolution } });
    if (notice.notificationId) {
        await db.notification.updateMany({ where: { id: notice.notificationId, userId: notice.userId, isRead: false }, data: { isRead: true, readAt: now } })
            .catch((error) => console.error('[Avisos importantes] Notificación sin marcar:', error?.message || error));
    }
};

/** «Ya hice seguimiento»: la gestión queda en el CRM a nombre de quien la hizo, con la hora de ahora. */
export const followUpNotice = async (db = prisma, id, body = {}, actor, { crm = crmService, now = new Date() } = {}) => {
    const notice = await ownOpenNotice(db, id, actor);
    if (!isFollowUpChannel(body.channel)) throw httpError(400, 'Elige cómo hiciste el seguimiento.');
    requireCrm(actor);
    await crm.addActivity(db, notice.subjectId, { type: body.channel, note: 'Registrado desde el aviso de seguimiento.', requestId: `aviso-${notice.id}` }, actor, now);
    await resolve(db, notice, 'SEGUIMIENTO', now);
    return { ok: true };
};

/** «Recordarme»: no se cierra, vuelve a la hora elegida. */
export const snoozeNotice = async (db = prisma, id, body = {}, actor, { now = new Date() } = {}) => {
    const notice = await ownOpenNotice(db, id, actor);
    const until = snoozeUntil(body.option, now);
    if (!until) throw httpError(400, 'Elige cuándo te lo recuerdo.');
    await db.importantNotice.update({ where: { id: notice.id }, data: { snoozedUntil: until, decidedAt: now } });
    return { ok: true, snoozedUntil: until };
};

/**
 * «Descartar», solo en la revisión: la oportunidad pasa a Descartado por el mismo camino del CRM, con la nota de por qué.
 * Descartado y no Perdido: lo decidimos nosotros al no tener respuesta (Rodny, 26 de octubre de 2026).
 */
export const discardNotice = async (db = prisma, id, actor, { crm = crmService, now = new Date() } = {}) => {
    const notice = await ownOpenNotice(db, id, actor);
    if (notice.kind !== 'CRM_REVIEW') throw httpError(409, 'Solo la revisión de una oportunidad se descarta desde el aviso.');
    requireCrm(actor);
    await crm.changeStage(db, notice.subjectId, { stage: 'DESCARTADO', note: DISCARD_NOTE }, actor, now);
    await resolve(db, notice, 'DESCARTADA', now);
    return { ok: true };
};
