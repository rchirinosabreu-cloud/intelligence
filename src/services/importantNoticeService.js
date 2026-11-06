// Avisos importantes (Rodny, 26 de octubre de 2026): lo que sale en la banda de abajo, uno a la vez. Cada aviso es de una
// persona y se queda hasta que decide: «Ya hice seguimiento» registra la gestión en el CRM (y con eso se reinicia la
// cuenta de días), «Recordarme» lo pospone y, en la revisión de los 30 días, «No sigue» la cierra como perdida o descartada.
// Lo que se atendió por otro lado —una gestión registrada en el CRM, una oportunidad que ya no espera al cliente— sale
// solo de la banda, sin contar como decisión.
//
// Todo eso queda en la trazabilidad de Salud operativa y en los registros de Railway (Rodny, 27 de octubre de 2026): que
// la banda se le mostró a alguien, lo que decidió y lo que salió solo. Una traza que no se guarda nunca deshace la decisión.
import { createHash } from 'node:crypto';
import prisma from '../lib/prisma.js';
import * as crmService from './crmService.js';
import { recordOperationalTrace } from './operationalTraceService.js';
import { hasModulePermission } from '../config/security.js';
import { CRM_ACTIVITY_TYPES } from '../lib/crmRules.js';
import { FOLLOW_UP_ALERT_STAGES, followUpRecipients } from '../lib/crmFollowUpAlerts.js';
import { userHasArea, userCanReceiveFinancialNotices } from './teamAreaService.js';
import { collectionStillDue, collectionNoticeReceivableIds } from './collectionState.js';
import { hasCollectionActivitySince, recordCollectionActivity } from './collectionActivityService.js';
import { NOTICE_ARCHIVE_OUTCOME, isFollowUpChannel, isReviewOutcome, pickCurrentNotice, snoozeUntil } from '../lib/importantNotices.js';
import { isPlanNotice, parsePlanSubject } from '../lib/planCloseNotices.js';
import { NOTICE_TRACE_EVENTS, noticeTraceDescription, noticeTraceMetadata } from '../lib/importantNoticeTrace.js';
import { readOperationalNotices, syncOperationalNotices } from './operationalNoticeService.js';
import { isOperationalNotice, operationalNoticeAcknowledges, operationalCycleSubject } from '../lib/clientOperationalNotices.js';
export { readOperationalNotices };

const CONTACT_TYPES = CRM_ACTIVITY_TYPES.filter((type) => type.contact).map((type) => type.value);
const LOST_REASON = 'Sin respuesta del cliente.';
const DISCARD_NOTE = 'Descartada desde el aviso de revisión: sin respuesta del cliente.';
// Cuántos avisos ya atendidos se descartan en una sola lectura antes de rendirse (una cola enorme no puede colgar la página).
const MAX_STALE_PER_READ = 25;

const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });

const serialize = (notice, receivableIds) => ({
    id: notice.id, kind: notice.kind, level: notice.level, label: notice.label, message: notice.message, url: notice.url || null,
    ...(receivableIds ? { receivableIds } : {}),
    ...(isOperationalNotice(notice) ? { operational: true, acknowledge: operationalNoticeAcknowledges(notice), actionLabel: 'Revisar operación' } : {})
});

const leadName = (lead) => lead?.company || lead?.contactName || null;
// Los avisos de cartera (28 de octubre de 2026) son de un cliente de fee mensual o de una cuenta de un servicio puntual.
const isCollectionNotice = (notice) => String(notice.kind || '').startsWith('CARTERA_');
// De esos, los que hablan del cliente entero; el resto, de una cuenta suelta de un servicio puntual.
const CLIENT_COLLECTION_KINDS = new Set(['CARTERA_MENSUAL', 'CARTERA_SUSPENSION']);
const isClientCollectionNotice = (notice) => CLIENT_COLLECTION_KINDS.has(notice.kind);
// De quién es el aviso, para nombrarlo en la traza: la oportunidad o el cliente.
const readSubjectName = async (db, notice) => {
    try {
        if (isOperationalNotice(notice)) return notice.label?.split(' · ').slice(1).join(' · ') || null;
        if (isClientCollectionNotice(notice)) return (await db.client.findUnique({ where: { id: notice.subjectId }, select: { name: true } }))?.name || null;
        if (isCollectionNotice(notice)) return (await db.accountsReceivable.findUnique({ where: { id: notice.subjectId }, select: { client: { select: { name: true } } } }))?.client?.name || null;
        return leadName(await db.crmLead.findUnique({ where: { id: notice.subjectId }, select: { company: true, contactName: true } }));
    } catch {
        return null;
    }
};

/**
 * Deja el evento en la traza y una línea en los registros. `id` fijo hace que un hecho repetido quede una sola vez: en
 * ese caso devuelve false y no escribe la línea. Sin tabla de traza (pruebas, muestras locales) no hace nada.
 */
const traceNotice = async (db, eventType, { notice, subject, actor = null, subjectName = null, extra = {}, id = null, now, log = console.log }) => {
    if (typeof db.operationalTraceEvent?.create !== 'function') return false;
    const metadata = noticeTraceMetadata(notice, subject, extra);
    try {
        await recordOperationalTrace({
            id, eventType, actorId: actor ? (actor.userId || actor.id) : null, subjectUserId: notice.userId, metadata, occurredAt: now, db
        });
    } catch (error) {
        if (id && error?.code === 'P2002') return false;
        console.error('[Avisos importantes] Traza no guardada:', error?.message || error);
        return false;
    }
    log(`[Avisos importantes] ${noticeTraceDescription(eventType, metadata, { actor: actor?.name || 'Alguien', subject: subjectName || actor?.name || 'un miembro del equipo' })}`);
    return true;
};

/** Un aviso nuevo de la misma oportunidad reemplaza al que esa persona tenía abierto: la banda dice siempre lo último. */
export const queueImportantNotice = async (db, data, now = new Date()) => db.$transaction(async (tx) => {
    // Un recordatorio de cartera actualiza el mismo asunto abierto. Recrearlo borraba «Recordarme», la antigüedad y
    // la decisión de la persona cada vez que cambiaba el saldo o tocaba otro paso del reloj. Una escalada de tipo
    // (por ejemplo, proponer suspensión) mantiene el recorrido explícito de reemplazo.
    if (isCollectionNotice(data)) {
        const existing = await tx.importantNotice.findFirst({
            where: { userId: data.userId, subjectId: data.subjectId, kind: data.kind, resolvedAt: null }
        });
        const clientId = existing && (isClientCollectionNotice(existing) ? existing.subjectId
            : (await tx.accountsReceivable.findUnique({ where: { id: existing.subjectId }, select: { clientId: true } }))?.clientId);
        const handled = existing && typeof tx.collectionActivity?.findFirst === 'function' && (
            await hasCollectionActivitySince(tx, clientId, existing.createdAt)
            || await hasCollectionActivitySince(tx, clientId, existing.createdAt, await collectionNoticeReceivableIds(tx, existing, now))
        );
        if (existing && !handled) return tx.importantNotice.update({
            where: { id: existing.id },
            data: { level: data.level, label: data.label, message: data.message, url: data.url || null,
                notificationId: data.notificationId || existing.notificationId || null }
        });
    }
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

/**
 * Los avisos de parrilla (30 de octubre de 2026) se caen solos en cuanto las piezas quedan publicadas: por eso el
 * community manager y el project manager reciben el mismo aviso y ninguno tiene que avisarle al otro. Se relee con las
 * mismas reglas de Operación —incluidas las hojas de MIO—, así que el aviso y el semáforo nunca dicen cosas distintas.
 * El resumen de varias cuentas lo cierra el reloj, no la banda: comprobarlo aquí serían diez consultas por sondeo.
 */
const readOverduePlans = async (args) => (await import('./clientOperationsService.js')).clientOperationsService.listOverduePlans(args);
const planStillPending = async (db, notice, overduePlans) => {
    const subject = parsePlanSubject(notice.subjectId);
    if (!subject) return null;
    let rows;
    try {
        rows = await overduePlans({ clientId: subject.clientId });
    } catch (error) {
        console.error('[Avisos importantes] Parrilla no releída:', error?.message || error);
        return null;
    }
    if (rows.some((row) => row.cycle?.year === subject.year && row.cycle?.month === subject.month)) return null;
    const name = typeof db.client?.findUnique === 'function'
        ? (await db.client.findUnique({ where: { id: subject.clientId }, select: { name: true } }).catch(() => null))?.name
        : null;
    return { reason: 'PUBLICADAS', subject: name || null };
};

// ¿La oportunidad sigue esperando al cliente y nadie registró una gestión desde que salió el aviso? Si no, por qué.
// En cartera: ¿el cliente sigue con lo vencido? En parrillas: ¿quedan piezas sin publicar?
const whyNotNeeded = async (db, notice, now, { overduePlans = readOverduePlans } = {}) => {
    if (isOperationalNotice(notice)) return null; // Revalidado por la proyección autorizada antes de seleccionar.
    if (isPlanNotice(notice)) return planStillPending(db, notice, overduePlans);
    if (isCollectionNotice(notice)) return collectionStillDue(db, notice, now);
    const lead = await db.crmLead.findUnique({
        where: { id: notice.subjectId },
        select: {
            company: true, contactName: true, stage: true, archivedAt: true,
            activities: { where: { type: { in: CONTACT_TYPES }, occurredAt: { gt: notice.createdAt } }, select: { id: true }, take: 1 }
        }
    });
    const subject = leadName(lead);
    if (!lead || lead.archivedAt) return { reason: 'INACTIVA', subject };
    if (!FOLLOW_UP_ALERT_STAGES.includes(lead.stage)) return { reason: 'ETAPA', subject };
    if ((lead.activities || []).length) return { reason: 'GESTION', subject };
    return null;
};

// Los avisos del CRM son del equipo comercial (Rodny, 28 de octubre de 2026). A quien no lo es la banda no se los
// muestra; el reloj de alertas se los pasa a los comerciales en su siguiente pase.
// Los de cartera, del área Administrativa y contable (Rodny, 28 de octubre de 2026: «esas bandas y decisiones las toma Elisa»).
const isCrmNotice = (notice) => String(notice.kind || '').startsWith('CRM_');
const seesCrmNotices = (db, userId) => userHasArea(db, userId, 'COMERCIAL');
const seesCollectionNotices = async (db, userId) => await userHasArea(db, userId, 'ADMINISTRATIVA') && await userCanReceiveFinancialNotices(db, userId);

/** El aviso que le toca ver a esa persona ahora y cuándo volver a preguntar. `who` nombra a la persona en la traza. */
export const currentImportantNotice = async (db = prisma, userId, now = new Date(), { who = null, log, overduePlans = readOverduePlans, operationalSource = readOperationalNotices } = {}) => {
    let operational = new Map();
    if (db.user?.findUnique && db.client?.findMany && db.importantNotice?.findUnique) {
        try { operational = await syncOperationalNotices(db, userId, now, operationalSource); }
        catch (error) { console.error('[Avisos operativos] No se pudo actualizar la fuente:', error?.code || error?.name); }
    }
    const [pending, lastDecision, commercial, administrative] = await Promise.all([
        db.importantNotice.findMany({ where: { userId, resolvedAt: null } }),
        db.importantNotice.findFirst({ where: { userId, decidedAt: { not: null } }, orderBy: { decidedAt: 'desc' }, select: { decidedAt: true } }),
        seesCrmNotices(db, userId),
        seesCollectionNotices(db, userId)
    ]);
    const coveredCycles = new Set([...operational.values()].map(operationalCycleSubject).filter(Boolean));
    // La revisión de ciclo ya abre las mismas piezas. No pedir dos veces la revisión del mismo período.
    if (coveredCycles.size && pending.some(n => n.kind === 'PARRILLA_RESUMEN')) {
        try {
            const rows = (await overduePlans()).filter(row => [row.projectManager, row.communityManager].some(person => person?.userId === userId));
            const remaining = rows.filter(row => !coveredCycles.has(`${row.clientId}:${row.cycle.year}-${String(row.cycle.month).padStart(2, '0')}`));
            for (const notice of pending.filter(n => n.kind === 'PARRILLA_RESUMEN')) {
                if (!remaining.length) notice.coveredByOperation = true;
                else {
                    notice.label = 'Parrillas · Otros períodos pendientes';
                    notice.message = `${remaining.length === 1 ? '1 período adicional tiene' : `${remaining.length} períodos adicionales tienen`} piezas que pasaron su fecha y siguen sin publicar.`;
                }
            }
        } catch { /* No se infiere ausencia de pendientes de una lectura fallida. */ }
    }
    let candidates = pending
        .filter(notice => !notice.coveredByOperation && !(notice.kind === 'PARRILLA_SIN_PUBLICAR' && coveredCycles.has(notice.subjectId)))
        .filter(notice => !isOperationalNotice(notice) || operational.has(notice.subjectId))
        .filter((notice) => commercial || !isCrmNotice(notice))
        .filter((notice) => administrative || !isCollectionNotice(notice));
    for (let discarded = 0; discarded <= MAX_STALE_PER_READ; discarded += 1) {
        const { notice, nextAt } = pickCurrentNotice(candidates, lastDecision?.decidedAt || null, now);
        if (!notice) return { notice: null, nextAt };
        const cleared = await whyNotNeeded(db, notice, now, { overduePlans });
        if (!cleared) return { notice: serialize(notice), nextAt };
        if (cleared.refresh) {
            const refreshed = await db.importantNotice.update({ where: { id: notice.id }, data: cleared.refresh });
            return { notice: serialize(refreshed, cleared.receivableIds), nextAt };
        }
        if (cleared.receivableIds) return { notice: serialize(notice, cleared.receivableIds), nextAt };
        await db.importantNotice.update({ where: { id: notice.id }, data: { resolvedAt: now, resolution: 'YA_ATENDIDO' } });
        await traceNotice(db, NOTICE_TRACE_EVENTS.CLEARED, { notice, subject: cleared.subject, subjectName: who, extra: { reason: cleared.reason }, now, log });
        candidates = candidates.filter((row) => row.id !== notice.id);
    }
    return { notice: null, nextAt: null };
};

const ownOpenNotice = async (db, id, actor, now = new Date()) => {
    const userId = actor?.userId || actor?.id;
    const notice = await db.importantNotice.findFirst({ where: { id, userId } });
    if (!notice) throw httpError(404, 'Ese aviso ya no está.');
    if (isCollectionNotice(notice) && !await seesCollectionNotices(db, userId)) throw httpError(403, 'Este aviso requiere acceso financiero y responsabilidad administrativa.');
    if (isOperationalNotice(notice)) {
        const wanted = await readOperationalNotices(db, userId, now);
        if (!wanted.some(item => item.subjectId === notice.subjectId)) throw httpError(409, 'Este aviso cambió. Actualiza para revisar la operación actual.');
    }
    if (notice.resolvedAt) throw httpError(409, 'Ese aviso ya se resolvió.');
    return notice;
};

const requireCrm = (actor) => {
    if (!hasModulePermission(actor, 'crm')) throw httpError(403, 'Para registrar la gestión necesitas acceso al CRM.');
};
const requireFinancial = (actor) => {
    if (!hasModulePermission(actor, 'financiero')) throw httpError(403, 'Para registrar la gestión de cobro necesitas acceso a Financiero.');
};

// Decidir cierra el aviso y deja leída su notificación de la campana: es el mismo asunto.
const resolve = async (db, notice, resolution, now) => {
    await db.importantNotice.update({ where: { id: notice.id }, data: { resolvedAt: now, decidedAt: now, resolution } });
    if (notice.notificationId) {
        await db.notification.updateMany({ where: { id: notice.notificationId, userId: notice.userId, isRead: false }, data: { isRead: true, readAt: now } })
            .catch((error) => console.error('[Avisos importantes] Notificación sin marcar:', error?.message || error));
    }
};

/**
 * Lo que una persona que no es comercial tenía abierto del CRM pasa al equipo comercial: al responsable si lo es o, si
 * no, a todos los comerciales, con el mismo texto, la misma antigüedad y la misma pausa. A quien ya tenía abierto el
 * aviso de esa oportunidad no se le repite. El original se cierra como `REASIGNADO`, sin contar como decisión, y deja
 * su traza. Sin nadie comercial no se mueve nada: el aviso no se pierde. Devuelve cuántos se movieron.
 */
export const reassignCrmNotices = async (db = prisma, { commercialIds = [], now = new Date(), log } = {}) => {
    if (!commercialIds.length) return 0;
    const stray = (await db.importantNotice.findMany({ where: { resolvedAt: null } }))
        .filter((notice) => isCrmNotice(notice) && !commercialIds.includes(notice.userId));
    let moved = 0;
    for (const notice of stray) {
        const lead = await db.crmLead.findUnique({ where: { id: notice.subjectId }, select: { company: true, contactName: true, owner: { select: { userId: true } } } });
        for (const userId of followUpRecipients(lead?.owner?.userId || null, commercialIds)) {
            const already = await db.importantNotice.findFirst({ where: { userId, subjectId: notice.subjectId, resolvedAt: null } });
            if (already) continue;
            await db.importantNotice.create({
                data: {
                    userId, kind: notice.kind, level: notice.level, subjectId: notice.subjectId, label: notice.label, message: notice.message,
                    url: notice.url || null, notificationId: null, createdAt: notice.createdAt, snoozedUntil: notice.snoozedUntil || null
                }
            });
        }
        await db.importantNotice.update({ where: { id: notice.id }, data: { resolvedAt: now, resolution: 'REASIGNADO' } });
        const holder = typeof db.user?.findUnique === 'function'
            ? await db.user.findUnique({ where: { id: notice.userId }, select: { name: true } }).catch(() => null)
            : null;
        await traceNotice(db, NOTICE_TRACE_EVENTS.CLEARED, { notice, subject: leadName(lead), subjectName: holder?.name, extra: { reason: 'REASIGNADO' }, now, log });
        moved += 1;
    }
    return moved;
};

/**
 * La banda dice que el aviso está a la vista. Una vez por aparición: la primera y cada vuelta después de posponerlo. Que
 * se mostró no prueba que se leyó; lo que la persona hizo queda aparte, con su decisión.
 */
export const markNoticeShown = async (db = prisma, id, actor, { now = new Date(), log } = {}) => {
    const notice = await ownOpenNotice(db, id, actor, now);
    const snoozed = notice.snoozedUntil ? new Date(notice.snoozedUntil) : null;
    if (snoozed && snoozed > now) throw httpError(409, 'Ese aviso está pospuesto.');
    const appearance = snoozed ? snoozed.toISOString() : 'inicial';
    const traceId = createHash('sha256').update(`${notice.id}:SHOWN:${appearance}`).digest('hex');
    const subject = await readSubjectName(db, notice);
    const recorded = await traceNotice(db, NOTICE_TRACE_EVENTS.SHOWN, { notice, subject, subjectName: actor?.name, id: traceId, now, log });
    return { ok: true, recorded };
};

/** «Ya hice seguimiento»: la gestión queda en el CRM a nombre de quien la hizo, con la hora de ahora. */
export const followUpNotice = async (db = prisma, id, body = {}, actor, { crm = crmService, now = new Date(), log } = {}) => {
    const notice = await ownOpenNotice(db, id, actor, now);
    if (isOperationalNotice(notice)) throw httpError(400, 'Revisa este aviso desde la operación del cliente.');
    if (!isFollowUpChannel(body.channel)) throw httpError(400, 'Elige cómo hiciste el seguimiento.');
    // En cartera queda como gestión de cobro del cliente (28 de octubre de 2026: «debe haber un registro»), que se ve en
    // Cuentas por cobrar; en el CRM, como gestión de la oportunidad. Las dos, además, en la trazabilidad.
    if (isCollectionNotice(notice)) {
        requireFinancial(actor);
        if (typeof db.collectionActivity?.create === 'function') {
            const oneOff = !isClientCollectionNotice(notice);
            const clientId = oneOff
                ? (await db.accountsReceivable.findUnique({ where: { id: notice.subjectId }, select: { clientId: true } }))?.clientId
                : notice.subjectId;
            if (notice.kind === 'CARTERA_MENSUAL') {
                // El aviso agrupado cobra estas obligaciones, no todas las deudas presentes o futuras del cliente.
                const ids = body.receivableIds;
                if (!Array.isArray(ids) || !ids.length || ids.some((value) => typeof value !== 'string' || !value.trim()) || new Set(ids).size !== ids.length) {
                    throw httpError(409, 'Actualiza el aviso para revisar las obligaciones de esta gestión.');
                }
                await db.$transaction(async (tx) => {
                    const currentIds = new Set(await collectionNoticeReceivableIds(tx, notice, now));
                    if (ids.some((receivableId) => !currentIds.has(receivableId))) throw httpError(409, 'La cartera de este aviso cambió. Actualiza para revisar las obligaciones vigentes.');
                    for (const receivableId of ids) {
                        await recordCollectionActivity(tx, { clientId, receivableId, channel: body.channel,
                            noticeId: `${notice.id}:${receivableId}`, source: 'AVISO' }, actor, { now });
                    }
                }, { isolationLevel: 'Serializable' });
            } else {
                await recordCollectionActivity(db, { clientId, receivableId: oneOff ? notice.subjectId : null, channel: body.channel, noticeId: notice.id, source: 'AVISO' }, actor, { now });
            }
        }
    } else {
        requireCrm(actor);
        await crm.addActivity(db, notice.subjectId, { type: body.channel, note: 'Registrado desde el aviso de seguimiento.', requestId: `aviso-${notice.id}` }, actor, now);
    }
    await resolve(db, notice, 'SEGUIMIENTO', now);
    const subject = await readSubjectName(db, notice);
    await traceNotice(db, NOTICE_TRACE_EVENTS.FOLLOWED_UP, { notice, subject, actor, extra: { channel: body.channel }, now, log });
    return { ok: true };
};

/** Acuse de un cambio de estado, nunca declaración de cumplimiento ni autorización de trabajo. */
export const acknowledgeOperationalNotice = async (db, id, actor, { now = new Date(), log } = {}) => {
    const notice = await ownOpenNotice(db, id, actor, now);
    if (!operationalNoticeAcknowledges(notice)) throw httpError(400, 'Este aviso se atiende en su registro de origen.');
    await resolve(db, notice, 'RECIBIDO', now);
    await traceNotice(db, NOTICE_TRACE_EVENTS.CLOSED, { notice, actor, subject: await readSubjectName(db, notice), extra: { outcome: 'RECIBIDO' }, now, log });
    return { ok: true };
};

/** «Recordarme»: no se cierra, vuelve a la hora elegida. */
export const snoozeNotice = async (db = prisma, id, body = {}, actor, { now = new Date(), log } = {}) => {
    const notice = await ownOpenNotice(db, id, actor, now);
    const until = snoozeUntil(body.option, now);
    if (!until) throw httpError(400, 'Elige cuándo te lo recuerdo.');
    await db.importantNotice.update({ where: { id: notice.id }, data: { snoozedUntil: until, decidedAt: now } });
    const subject = await readSubjectName(db, notice);
    await traceNotice(db, NOTICE_TRACE_EVENTS.SNOOZED, { notice, subject, actor, extra: { option: body.option, until: until.toISOString() }, now, log });
    return { ok: true, snoozedUntil: until };
};

// Cómo queda la oportunidad en el CRM según lo que se eligió en «No sigue». Archivar no es una etapa: la oportunidad
// sale de listas, métricas y avisos con sus datos intactos (reunión del 4 de noviembre de 2026).
const WON_NOTE = 'Ya es cliente: marcada como ganada desde el aviso de revisión.';
const CLOSE_STAGES = {
    PERDIDO: { payload: { stage: 'PERDIDO', lostReason: LOST_REASON }, resolution: 'PERDIDA' },
    DESCARTADO: { payload: { stage: 'DESCARTADO', note: DISCARD_NOTE }, resolution: 'DESCARTADA' },
    GANADO: { payload: { stage: 'GANADO', note: WON_NOTE }, resolution: 'GANADA' },
    ARCHIVAR: { archive: true, resolution: 'ARCHIVADA' }
};

/**
 * «No sigue», solo en la revisión: la oportunidad pasa a Perdido (el cliente no la tomó), a Descartado (no sigue por
 * decisión nuestra) o a Ganado (ya es cliente), por el mismo camino del CRM (Rodny, 26 de octubre de 2026). «Archivar»
 * vale en cualquier aviso de una oportunidad, también en los recordatorios (4 de noviembre de 2026).
 */
export const closeReviewNotice = async (db = prisma, id, body = {}, actor, { crm = crmService, now = new Date(), log } = {}) => {
    const notice = await ownOpenNotice(db, id, actor, now);
    if (body.outcome === NOTICE_ARCHIVE_OUTCOME) {
        if (!isCrmNotice(notice)) throw httpError(409, 'Solo una oportunidad del CRM se archiva desde el aviso.');
    } else {
        if (notice.kind !== 'CRM_REVIEW') throw httpError(409, 'Solo la revisión de una oportunidad se cierra desde el aviso.');
        if (!isReviewOutcome(body.outcome)) throw httpError(400, 'Elige qué pasa con la oportunidad: perdida, descartada o ya es cliente.');
    }
    requireCrm(actor);
    const { payload, archive, resolution } = CLOSE_STAGES[body.outcome];
    if (archive) await crm.archiveLead(db, notice.subjectId, actor, now);
    else await crm.changeStage(db, notice.subjectId, payload, actor, now);
    await resolve(db, notice, resolution, now);
    const subject = await readSubjectName(db, notice);
    await traceNotice(db, NOTICE_TRACE_EVENTS.CLOSED, { notice, subject, actor, extra: { outcome: body.outcome }, now, log });
    return { ok: true };
};
