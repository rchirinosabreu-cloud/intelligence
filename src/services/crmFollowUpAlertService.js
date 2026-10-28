// Alertas comerciales (punto 2 de la solicitud de Elisa; Rodny, 26 de octubre de 2026). Un reloj en horario hábil mira
// cada oportunidad que espera respuesta y avisa en los días que toca, solo al equipo comercial (Rodny, 28 de octubre de
// 2026): el responsable si es comercial y, si no, todos los comerciales; nunca la dirección ni los project managers.
// Lo que ya se avisó queda en `CrmFollowUpAlert`, una fila por oportunidad, ciclo y día:
// nada se repite aunque el reloj corra dos veces, y queda el historial de lo avisado.
import prisma from '../lib/prisma.js';
import { createNotification } from './notificationService.js';
import { CRM_ACTIVITY_TYPES } from '../lib/crmRules.js';
import { isWorkingTime } from '../lib/briaNudges.js';
import {
    DEFAULT_FOLLOW_UP_ALERT_DAYS, FOLLOW_UP_ALERT_STAGES, FOLLOW_UP_DIGEST_THRESHOLD, dueFollowUpAlert, followUpAlertMessage,
    followUpDigest, followUpRecipients, normalizeFollowUpAlertDays
} from '../lib/crmFollowUpAlerts.js';
import { activeAreaUserIds } from './teamAreaService.js';
import { followUpNoticeText } from '../lib/importantNotices.js';
import { NOTICE_TRACE_EVENTS, noticeTraceDescription } from '../lib/importantNoticeTrace.js';
import { queueImportantNotice, reassignCrmNotices } from './importantNoticeService.js';
import { recordOperationalTrace } from './operationalTraceService.js';

export const FOLLOW_UP_REMINDER_TYPE = 'CRM_FOLLOW_UP_REMINDER';
export const FOLLOW_UP_REVIEW_TYPE = 'CRM_FOLLOW_UP_REVIEW';
const SETTINGS_ID = 'global';
const CHECK_MS = 30 * 60 * 1000;
const CONTACT_TYPES = CRM_ACTIVITY_TYPES.filter((type) => type.contact).map((type) => type.value);

const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });

/** Los días vigentes: los del documento hasta que un administrador los cambie. */
export const readFollowUpAlertDays = async (db = prisma) => {
    if (typeof db.crmSetting?.findUnique !== 'function') return { ...DEFAULT_FOLLOW_UP_ALERT_DAYS, reminders: [...DEFAULT_FOLLOW_UP_ALERT_DAYS.reminders] };
    const row = await db.crmSetting.findUnique({ where: { id: SETTINGS_ID } });
    const saved = row ? normalizeFollowUpAlertDays({ reminders: row.followUpReminderDays, review: row.followUpReviewDay }).value : null;
    return saved || { ...DEFAULT_FOLLOW_UP_ALERT_DAYS, reminders: [...DEFAULT_FOLLOW_UP_ALERT_DAYS.reminders] };
};

/** Cambiar los días es de administradores; el motivo de un valor que no sirve se dice en palabras. */
export const saveFollowUpAlertDays = async (db, input, actor) => {
    if (actor?.role !== 'ADMIN') throw httpError(403, 'Solo un administrador cambia los días de las alertas comerciales.');
    const { value, problem } = normalizeFollowUpAlertDays(input || {});
    if (problem) throw httpError(400, problem);
    const data = { followUpReminderDays: value.reminders, followUpReviewDay: value.review, updatedById: actor.id || actor.userId || null };
    await db.crmSetting.upsert({ where: { id: SETTINGS_ID }, create: { id: SETTINGS_ID, ...data }, update: data });
    return value;
};

// Las cuentas activas del área comercial de Equipo: las únicas que reciben alertas comerciales.
const activeCommercialIds = (db) => activeAreaUserIds(db, 'COMERCIAL');

// Lo ya avisado del ciclo más reciente, en la forma que lee la regla.
const sentInLatestCycle = (log = []) => {
    if (!log.length) return null;
    const latest = new Date(Math.max(...log.map((row) => new Date(row.cycleStart).getTime())));
    return { since: latest.toISOString(), steps: log.filter((row) => new Date(row.cycleStart).getTime() === latest.getTime()).map((row) => row.step) };
};

const isUniqueViolation = (error) => error?.code === 'P2002';

// Lo que le llegó a cada persona en el pase queda en la trazabilidad de Salud operativa y en los registros de Railway
// (Rodny, 27 de octubre de 2026). Ninguna de las dos cosas puede frenar las alertas.
const reportPass = async (db, delivered, sent, now, { log, info }) => {
    if (!sent) return;
    info(`[CRM] Alertas comerciales: ${sent} ${sent === 1 ? 'oportunidad avisada' : 'oportunidades avisadas'}.`);
    let names = new Map();
    try {
        const users = await db.user.findMany({ where: { id: { in: [...delivered.keys()] } }, select: { id: true, name: true } });
        names = new Map(users.map((user) => [user.id, user.name]));
    } catch (error) {
        log('[CRM] Nombres de las alertas no leídos:', error?.message || error);
    }
    for (const [userId, metadata] of delivered) {
        info(`[CRM] ${noticeTraceDescription(NOTICE_TRACE_EVENTS.ALERTS_SENT, metadata, { subject: names.get(userId) || 'un miembro del equipo' })}`);
        if (typeof db.operationalTraceEvent?.create !== 'function') continue;
        await recordOperationalTrace({ eventType: NOTICE_TRACE_EVENTS.ALERTS_SENT, subjectUserId: userId, metadata, occurredAt: now, db })
            .catch((error) => log('[CRM] Traza de alertas no guardada:', error?.message || error));
    }
};

/**
 * Una pasada del reloj: avisa lo que toca y lo anota. Primero se anota el paso (la fila única es la cerradura) y después
 * se avisa; un aviso que no sale se registra y no frena a los demás.
 */
export const runFollowUpAlerts = async (db = prisma, { now = new Date(), notify = createNotification, queueNotice = queueImportantNotice, log = console.error, info = console.log } = {}) => {
    const settings = await readFollowUpAlertDays(db);
    const leads = await db.crmLead.findMany({
        where: { archivedAt: null, stage: { in: FOLLOW_UP_ALERT_STAGES }, proposalSentAt: { not: null } },
        select: {
            id: true, company: true, contactName: true, stage: true, proposalSentAt: true, archivedAt: true,
            owner: { select: { userId: true } },
            activities: { where: { type: { in: CONTACT_TYPES } }, select: { type: true, occurredAt: true } },
            quotations: { where: { status: 'ACTIVA' }, orderBy: { created_at: 'desc' }, take: 1, select: { consecutive: true } },
            followUpAlertLog: { select: { cycleStart: true, step: true } }
        }
    });
    const commercial = await activeCommercialIds(db);
    // Lo que la dirección tenía abierto en la banda de antes de esta regla pasa al equipo comercial.
    if (typeof db.importantNotice?.findMany === 'function') {
        await reassignCrmNotices(db, { commercialIds: commercial, now, log: info })
            .catch((error) => log('[CRM] Avisos de la banda no reasignados:', error?.message || error));
    }
    let missingCommercial = false;
    let sent = 0;
    // Lo que le toca a cada persona en este pase, por tipo: se reparte al final para poder resumir.
    const outbox = new Map();
    const queue = (userId, kind, item) => {
        if (!outbox.has(userId)) outbox.set(userId, { REVIEW: [], REMINDER: [] });
        outbox.get(userId)[kind].push(item);
    };
    for (const lead of leads) {
        const alert = dueFollowUpAlert({ ...lead, followUpAlerts: sentInLatestCycle(lead.followUpAlertLog) }, lead.activities, now, settings);
        if (!alert) continue;
        try {
            await db.crmFollowUpAlert.create({ data: { leadId: lead.id, cycleStart: alert.since, step: alert.step, kind: alert.kind, sentAt: now } });
        } catch (error) {
            if (isUniqueViolation(error)) continue;
            throw error;
        }
        const skipped = alert.steps.filter((step) => step !== alert.step);
        if (skipped.length) {
            await db.crmFollowUpAlert.createMany({
                data: skipped.map((step) => ({ leadId: lead.id, cycleStart: alert.since, step, kind: 'SKIPPED', sentAt: now })),
                skipDuplicates: true
            });
        }
        sent += 1;
        // Solo el equipo comercial: el responsable si lo es; si no, todos los comerciales. Campana y banda, igual.
        const recipients = followUpRecipients(lead.owner?.userId || null, commercial);
        if (!recipients.length) { missingCommercial = true; continue; }
        const code = lead.quotations?.[0] ? `COT-${String(lead.quotations[0].consecutive).padStart(4, '0')}` : null;
        const message = followUpAlertMessage(lead, alert, code);
        const notice = followUpNoticeText(lead, alert, code);
        const who = lead.company || lead.contactName || null;
        for (const userId of recipients) queue(userId, alert.kind, { leadId: lead.id, who, message, notice });
    }
    if (missingCommercial) log('[CRM] Nadie del equipo tiene rol comercial: las alertas comerciales de este pase quedaron anotadas sin enviarse.');
    const deliver = async (data) => {
        try {
            return await notify(data);
        } catch (error) {
            log('[CRM] Alerta comercial no entregada:', error?.message || error);
            return null;
        }
    };
    const toBand = async (userId, item, notificationId) => {
        if (!item.notice || typeof db.importantNotice?.create !== 'function') return false;
        try {
            await queueNotice(db, { userId, subjectId: item.leadId, url: `/crm/oportunidades/${item.leadId}`, notificationId, ...item.notice }, now);
            return true;
        } catch (error) {
            log('[CRM] Aviso importante no guardado:', error?.message || error);
            return false;
        }
    };
    // Por persona: cuántas revisiones y recordatorios, cuántos avisos salieron en la campana y cuántos en la banda.
    const delivered = new Map();
    for (const [userId, byKind] of outbox) {
        const tally = { reviews: byKind.REVIEW.length, reminders: byKind.REMINDER.length, bell: 0, band: 0 };
        const only = [...byKind.REVIEW, ...byKind.REMINDER];
        if (only.length === 1) Object.assign(tally, { subject: only[0].who, url: `/crm/oportunidades/${only[0].leadId}` });
        for (const kind of ['REVIEW', 'REMINDER']) {
            const items = byKind[kind];
            const type = kind === 'REVIEW' ? FOLLOW_UP_REVIEW_TYPE : FOLLOW_UP_REMINDER_TYPE;
            if (items.length > FOLLOW_UP_DIGEST_THRESHOLD) {
                const digest = followUpDigest(kind, items.length, settings);
                if (await deliver({ userId, type, url: digest.url, message: digest.message })) tally.bell += 1;
                // La campana los resume, pero la banda los muestra de a uno: cada oportunidad pide su decisión.
                for (const item of items) if (await toBand(userId, item, null)) tally.band += 1;
                continue;
            }
            for (const item of items) {
                const created = await deliver({ userId, type, relatedId: item.leadId, url: `/crm/oportunidades/${item.leadId}`, message: item.message });
                if (created) tally.bell += 1;
                if (await toBand(userId, item, created?.id || null)) tally.band += 1;
            }
        }
        delivered.set(userId, tally);
    }
    await reportPass(db, delivered, sent, now, { log, info });
    return { checked: leads.length, sent };
};

/** El reloj: cada media hora, solo en horario hábil de Bogotá; un aviso del sábado sale el lunes. */
export const initCrmFollowUpAlertScheduler = ({ db = prisma, interval = CHECK_MS } = {}) => {
    const run = () => {
        const now = new Date();
        if (!isWorkingTime(now)) return;
        runFollowUpAlerts(db, { now }).catch((error) => console.error('[CRM] Alertas comerciales:', error?.message || error));
    };
    const startup = setTimeout(run, 20_000);
    startup.unref?.();
    const timer = setInterval(run, interval);
    timer.unref?.();
    console.log('[CRM] Alertas comerciales activas (cada 30 minutos, horario hábil).');
    return timer;
};
