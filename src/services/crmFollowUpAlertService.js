// Alertas comerciales (punto 2 de la solicitud de Elisa; Rodny, 26 de octubre de 2026). Un reloj en horario hábil mira
// cada oportunidad que espera respuesta y avisa al responsable en los días que toca; la revisión del final les llega
// también a los administradores. Lo que ya se avisó queda en `CrmFollowUpAlert`, una fila por oportunidad, ciclo y día:
// nada se repite aunque el reloj corra dos veces, y queda el historial de lo avisado.
import prisma from '../lib/prisma.js';
import { createNotification } from './notificationService.js';
import { CRM_ACTIVITY_TYPES } from '../lib/crmRules.js';
import { isWorkingTime } from '../lib/briaNudges.js';
import {
    DEFAULT_FOLLOW_UP_ALERT_DAYS, FOLLOW_UP_ALERT_STAGES, FOLLOW_UP_DIGEST_THRESHOLD, dueFollowUpAlert, followUpAlertMessage,
    followUpDigest, normalizeFollowUpAlertDays
} from '../lib/crmFollowUpAlerts.js';
import { followUpNoticeText } from '../lib/importantNotices.js';
import { queueImportantNotice } from './importantNoticeService.js';

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

const activeAdminIds = async (db) => (await db.user.findMany({
    where: { role: 'ADMIN', isActive: true, teamMember: { is: { isActive: true } } },
    select: { id: true }
})).map((user) => user.id);

// Lo ya avisado del ciclo más reciente, en la forma que lee la regla.
const sentInLatestCycle = (log = []) => {
    if (!log.length) return null;
    const latest = new Date(Math.max(...log.map((row) => new Date(row.cycleStart).getTime())));
    return { since: latest.toISOString(), steps: log.filter((row) => new Date(row.cycleStart).getTime() === latest.getTime()).map((row) => row.step) };
};

const isUniqueViolation = (error) => error?.code === 'P2002';

/**
 * Una pasada del reloj: avisa lo que toca y lo anota. Primero se anota el paso (la fila única es la cerradura) y después
 * se avisa; un aviso que no sale se registra y no frena a los demás.
 */
export const runFollowUpAlerts = async (db = prisma, { now = new Date(), notify = createNotification, queueNotice = queueImportantNotice, log = console.error } = {}) => {
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
    let admins = null;
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
        const ownerId = lead.owner?.userId || null;
        const needsAdmins = alert.kind === 'REVIEW' || !ownerId;
        if (needsAdmins && admins === null) admins = await activeAdminIds(db);
        const recipients = [...new Set([ownerId, ...(needsAdmins ? admins : [])].filter(Boolean))];
        const code = lead.quotations?.[0] ? `COT-${String(lead.quotations[0].consecutive).padStart(4, '0')}` : null;
        const message = followUpAlertMessage(lead, alert, code);
        const notice = followUpNoticeText(lead, alert, code);
        // La banda es de quien hace el seguimiento: el responsable, o los administradores si no hay responsable. A los
        // administradores la revisión de una oportunidad ajena les llega solo a la campana.
        const bandUserIds = new Set(ownerId ? [ownerId] : admins);
        for (const userId of recipients) queue(userId, alert.kind, { leadId: lead.id, message, notice: bandUserIds.has(userId) ? notice : null });
    }
    const deliver = async (data) => {
        try {
            return await notify(data);
        } catch (error) {
            log('[CRM] Alerta comercial no entregada:', error?.message || error);
            return null;
        }
    };
    const toBand = async (userId, item, notificationId) => {
        if (!item.notice || typeof db.importantNotice?.create !== 'function') return;
        try {
            await queueNotice(db, { userId, subjectId: item.leadId, url: `/crm/oportunidades/${item.leadId}`, notificationId, ...item.notice }, now);
        } catch (error) {
            log('[CRM] Aviso importante no guardado:', error?.message || error);
        }
    };
    for (const [userId, byKind] of outbox) {
        for (const kind of ['REVIEW', 'REMINDER']) {
            const items = byKind[kind];
            const type = kind === 'REVIEW' ? FOLLOW_UP_REVIEW_TYPE : FOLLOW_UP_REMINDER_TYPE;
            if (items.length > FOLLOW_UP_DIGEST_THRESHOLD) {
                const digest = followUpDigest(kind, items.length, settings);
                await deliver({ userId, type, url: digest.url, message: digest.message });
                // La campana los resume, pero la banda los muestra de a uno: cada oportunidad pide su decisión.
                for (const item of items) await toBand(userId, item, null);
                continue;
            }
            for (const item of items) {
                const created = await deliver({ userId, type, relatedId: item.leadId, url: `/crm/oportunidades/${item.leadId}`, message: item.message });
                await toBand(userId, item, created?.id || null);
            }
        }
    }
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
