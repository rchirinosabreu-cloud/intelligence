// Avisos de cartera (punto 7 de la solicitud de Elisa; Rodny, 28 de octubre de 2026). Un reloj en horario hábil mira la
// cartera de cada cliente y avisa cuando toca:
// - Administrativa y contable (Elisa) recibe la banda, con las cifras y sus decisiones, y la campana.
// - Dirección se entera por la campana de los clientes de fee mensual atrasados.
// - El project manager de la cuenta, también por la campana y sin cifras: solo lo que necesita para decidir la ejecución.
// La campana también llega al celular, por eso nunca lleva cifras. Lo ya avisado queda en `CollectionAlert`, una fila
// por asunto, ciclo y paso: nada se repite aunque el reloj corra dos veces.
import prisma from '../lib/prisma.js';
import { createNotification } from './notificationService.js';
import { isWorkingTime } from '../lib/briaNudges.js';
import { collectionBellText, collectionNoticeText, monthlyCollectionAlert, oneOffCollectionAlerts } from '../lib/receivableCollections.js';
import { NOTICE_TRACE_EVENTS, noticeTraceDescription } from '../lib/importantNoticeTrace.js';
import { queueImportantNotice } from './importantNoticeService.js';
import { recordOperationalTrace } from './operationalTraceService.js';
import { activeAreaUserIds } from './teamAreaService.js';
import { OPEN_CLIENT_RECEIVABLES, RECEIVABLE_FIELDS, bogotaToday, isMonthlyClient, readCollectionSettings } from './collectionState.js';

export const COLLECTION_ALERT_TYPE = 'CARTERA_VENCIDA';
export const COLLECTION_RISK_TYPE = 'CARTERA_RIESGO';
export const COLLECTION_URL = '/financiero?tab=cartera';
const CHECK_MS = 30 * 60 * 1000;
// Más de tres avisos de campana del mismo tipo para la misma persona en un pase salen en uno solo.
const DIGEST_THRESHOLD = 3;

const isUniqueViolation = (error) => error?.code === 'P2002';

const digestText = (type, count) => (type === COLLECTION_RISK_TYPE
    ? `${count} clientes tienen pagos atrasados: puede pausarse su producción de contenidos.`
    : `${count} avisos de cartera vencida: revisa Cuentas por cobrar.`);

/** Lo que le llegó a cada persona queda en la trazabilidad de Salud operativa y en los registros de Railway. */
const reportPass = async (db, delivered, sent, now, { log, info }) => {
    if (!sent) return;
    info(`[Cartera] Cartera: ${sent} ${sent === 1 ? 'aviso' : 'avisos'} en este pase.`);
    let names = new Map();
    try {
        const users = await db.user.findMany({ where: { id: { in: [...delivered.keys()] } }, select: { id: true, name: true } });
        names = new Map(users.map((user) => [user.id, user.name]));
    } catch (error) {
        log('[Cartera] Nombres de los avisos no leídos:', error?.message || error);
    }
    for (const [userId, metadata] of delivered) {
        info(`[Cartera] ${noticeTraceDescription(NOTICE_TRACE_EVENTS.COLLECTION_ALERTS_SENT, metadata, { subject: names.get(userId) || 'un miembro del equipo' })}`);
        if (typeof db.operationalTraceEvent?.create !== 'function') continue;
        await recordOperationalTrace({ eventType: NOTICE_TRACE_EVENTS.COLLECTION_ALERTS_SENT, subjectUserId: userId, metadata, occurredAt: now, db })
            .catch((error) => log('[Cartera] Traza de avisos no guardada:', error?.message || error));
    }
};

/**
 * Una pasada del reloj. Primero se anota el paso (la fila única es la cerradura) y después se avisa; un aviso que no
 * sale se registra y no frena a los demás.
 */
export const runCollectionAlerts = async (db = prisma, { now = new Date(), notify = createNotification, queueNotice = queueImportantNotice, log = console.error, info = console.log } = {}) => {
    const settings = await readCollectionSettings(db);
    if (!settings.enabled) return { checked: 0, sent: 0, enabled: false };
    const today = bogotaToday(now);
    const clients = await db.client.findMany({
        where: { accountsReceivables: { some: OPEN_CLIENT_RECEIVABLES } },
        select: {
            id: true, name: true, slug: true,
            contracts: { select: { serviceType: true, startDate: true } },
            projectManager: { select: { userId: true } },
            accountsReceivables: { where: OPEN_CLIENT_RECEIVABLES, select: RECEIVABLE_FIELDS }
        }
    });
    const administrative = await activeAreaUserIds(db, 'ADMINISTRATIVA');
    const direction = (await activeAreaUserIds(db, 'DIRECCION')).filter((id) => !administrative.includes(id));
    if (!administrative.length) log('[Cartera] Nadie del equipo está en el área Administrativa y contable: los avisos de cartera de este pase no tienen a quién llegar en la banda.');

    // Lo que le toca a cada persona en este pase, por tipo de campana: se reparte al final para poder resumir.
    const outbox = new Map();
    const queue = (userId, type, item) => {
        if (!outbox.has(userId)) outbox.set(userId, { [COLLECTION_ALERT_TYPE]: [], [COLLECTION_RISK_TYPE]: [] });
        outbox.get(userId)[type].push(item);
    };
    let sent = 0;
    for (const client of clients) {
        const monthly = isMonthlyClient(client.contracts);
        const alerts = monthly
            ? [monthlyCollectionAlert({ clientId: client.id, receivables: client.accountsReceivables, today, settings })].filter(Boolean)
            : oneOffCollectionAlerts({ receivables: client.accountsReceivables, today, settings });
        for (const alert of alerts) {
            try {
                await db.collectionAlert.create({ data: { subjectId: alert.subjectId, kind: alert.kind, cycle: alert.cycle, step: alert.step, sentAt: now } });
            } catch (error) {
                if (isUniqueViolation(error)) continue;
                throw error;
            }
            sent += 1;
            const notice = collectionNoticeText(alert, client.name);
            for (const userId of administrative) {
                queue(userId, COLLECTION_ALERT_TYPE, { subjectId: alert.subjectId, who: client.name, message: collectionBellText(alert, client.name, 'ADMINISTRATIVA'), url: COLLECTION_URL, notice });
            }
            if (!monthly) continue;
            for (const userId of direction) {
                queue(userId, COLLECTION_ALERT_TYPE, { subjectId: alert.subjectId, who: client.name, message: collectionBellText(alert, client.name, 'DIRECCION'), url: COLLECTION_URL });
            }
            const pm = client.projectManager?.userId;
            if (pm && !administrative.includes(pm) && !direction.includes(pm)) {
                queue(pm, COLLECTION_RISK_TYPE, { subjectId: alert.subjectId, who: client.name, message: collectionBellText(alert, client.name, 'PM'), url: client.slug ? `/clientes/operacion/${client.slug}` : '/clientes' });
            }
        }
    }

    const deliver = async (data) => {
        try {
            return await notify(data);
        } catch (error) {
            log('[Cartera] Aviso de campana no entregado:', error?.message || error);
            return null;
        }
    };
    const toBand = async (userId, item, notificationId) => {
        if (!item.notice || typeof db.importantNotice?.create !== 'function') return false;
        try {
            await queueNotice(db, { userId, subjectId: item.subjectId, url: COLLECTION_URL, notificationId, ...item.notice }, now);
            return true;
        } catch (error) {
            log('[Cartera] Aviso importante no guardado:', error?.message || error);
            return false;
        }
    };
    const delivered = new Map();
    for (const [userId, byType] of outbox) {
        const all = [...byType[COLLECTION_ALERT_TYPE], ...byType[COLLECTION_RISK_TYPE]];
        const tally = { alerts: all.length, bell: 0, band: 0 };
        if (all.length === 1) tally.subject = all[0].who;
        for (const type of [COLLECTION_ALERT_TYPE, COLLECTION_RISK_TYPE]) {
            const items = byType[type];
            if (items.length > DIGEST_THRESHOLD) {
                if (await deliver({ userId, type, url: type === COLLECTION_RISK_TYPE ? '/clientes' : COLLECTION_URL, message: digestText(type, items.length) })) tally.bell += 1;
                // La campana los resume; la banda los muestra de a uno, porque cada cliente pide su decisión.
                for (const item of items) if (await toBand(userId, item, null)) tally.band += 1;
                continue;
            }
            for (const item of items) {
                const created = await deliver({ userId, type, relatedId: item.subjectId, url: item.url, message: item.message });
                if (created) tally.bell += 1;
                if (await toBand(userId, item, created?.id || null)) tally.band += 1;
            }
        }
        delivered.set(userId, tally);
    }
    await reportPass(db, delivered, sent, now, { log, info });
    return { checked: clients.length, sent };
};

/** El reloj: cada media hora, solo en horario hábil de Bogotá. */
export const initCollectionAlertScheduler = ({ db = prisma, interval = CHECK_MS } = {}) => {
    const run = () => {
        const now = new Date();
        if (!isWorkingTime(now)) return;
        runCollectionAlerts(db, { now }).catch((error) => console.error('[Cartera] Avisos de cartera:', error?.message || error));
    };
    const startup = setTimeout(run, 40_000);
    startup.unref?.();
    const timer = setInterval(run, interval);
    timer.unref?.();
    console.log('[Cartera] Avisos de cartera activos (cada 30 minutos, horario hábil).');
    return timer;
};
