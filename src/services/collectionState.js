// Lo que los avisos de cartera necesitan leer de la base: los plazos vigentes, las cuentas abiertas de cada cliente y si
// un aviso sigue haciendo falta. Aparte del reloj que avisa para que la banda lo pueda consultar sin depender de él.
import prisma from '../lib/prisma.js';
import {
    DEFAULT_COLLECTION_SETTINGS, clientCollectionAlerts, collectionNoticeText, normalizeCollectionSettings, openBalanceCents
} from '../lib/receivableCollections.js';
import { suspensionCandidate } from '../lib/clientSuspension.js';
import { hasCollectionActivitySince } from './collectionActivityService.js';

const SETTINGS_ID = 'global';
const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });

export const bogotaToday = (now = new Date()) => now.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });

/** Los plazos vigentes: los acordados con Rodny hasta que un administrador los cambie. */
export const readCollectionSettings = async (db = prisma) => {
    if (typeof db.collectionSetting?.findUnique !== 'function') return { ...DEFAULT_COLLECTION_SETTINGS };
    const row = await db.collectionSetting.findUnique({ where: { id: SETTINGS_ID } });
    return (row && normalizeCollectionSettings(row).value) || { ...DEFAULT_COLLECTION_SETTINGS };
};

/** Cambiar los plazos es de administradores; un valor que no sirve se explica en palabras. */
export const saveCollectionSettings = async (db, input, actor) => {
    if (actor?.role !== 'ADMIN') throw httpError(403, 'Solo un administrador cambia los plazos de los avisos de cartera.');
    const { value, problem } = normalizeCollectionSettings(input || {});
    if (problem) throw httpError(400, problem);
    const data = { ...value, updatedById: actor.id || actor.userId || null };
    await db.collectionSetting.upsert({ where: { id: SETTINGS_ID }, create: { id: SETTINGS_ID, ...data }, update: data });
    return value;
};

// Solo cartera de clientes que no esté cerrada: un préstamo no es una mensualidad.
export const OPEN_CLIENT_RECEIVABLES = Object.freeze({ kind: 'CLIENTE', status: { notIn: ['PAGADO', 'SALDADO'] } });
export const RECEIVABLE_FIELDS = Object.freeze({
    id: true, kind: true, status: true, amount: true, period: true, issuedAt: true, dueDate: true, number: true, metadata: true,
    payments: { select: { amount: true, reversedAt: true, kind: true } }
});

/** Cadencia heredada del cliente. No acredita la modalidad de cada cuenta ni de las cuotas de una propuesta. */
export const isMonthlyClient = (contracts = []) => {
    const latest = [...contracts].sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)))[0];
    return latest?.serviceType === 'PARRILLA';
};

/** Las obligaciones actuales de un aviso agregado; el seguimiento no alcanza las otras deudas del cliente. */
export const collectionNoticeReceivableIds = async (db, notice, now = new Date()) => {
    if (notice.kind === 'CARTERA_UNICO') return [notice.subjectId];
    if (!['CARTERA_MENSUAL', 'CARTERA_SUSPENSION'].includes(notice.kind)) return [];
    const client = await db.client.findUnique({ where: { id: notice.subjectId }, select: {
        contracts: { select: { serviceType: true, startDate: true } },
        accountsReceivables: { where: OPEN_CLIENT_RECEIVABLES, select: RECEIVABLE_FIELDS }
    } });
    if (!client) return [];
    const settings = await readCollectionSettings(db);
    if (notice.kind === 'CARTERA_SUSPENSION') {
        return suspensionCandidate({ receivables: client.accountsReceivables, today: bogotaToday(now), settings })?.receivableIds || [];
    }
    const alerts = clientCollectionAlerts({ clientId: notice.subjectId, monthly: isMonthlyClient(client.contracts),
        receivables: client.accountsReceivables, today: bogotaToday(now), settings });
    return alerts.find((alert) => alert.kind === 'MENSUAL')?.receivableIds || [];
};

/**
 * ¿Sigue haciendo falta el aviso? `receivableIds` conserva el alcance de la misma lectura que produjo el texto;
 * `refresh` corrige solo su texto y nivel sin
 * reemplazarlo ni perder la pausa; `reason` lo retira. La banda usa exactamente el mismo cálculo que el reloj.
 */
export const collectionStillDue = async (db, notice, now = new Date()) => {
    const settings = await readCollectionSettings(db);
    // Como en el CRM (28 de octubre de 2026): una gestión de cobro registrada después del aviso lo saca de la banda.
    const handled = async (clientId, subject, ids = []) => (await hasCollectionActivitySince(db, clientId, notice.createdAt, ids) ? { reason: 'GESTION', subject } : null);
    const currentText = (alert, subject) => {
        const { message, label, level } = collectionNoticeText(alert, subject);
        return { receivableIds: alert.receivableIds,
            ...(notice.message === message && notice.label === label && notice.level === level ? {} : { refresh: { message, label, level } }) };
    };
    // La propuesta de suspender sale sola de la banda si ya se decidió —el cliente quedó suspendido— o si se puso al
    // día. Es una propuesta: que nadie la atienda no la convierte en suspensión.
    if (notice.kind === 'CARTERA_SUSPENSION') {
        const client = await db.client.findUnique({
            where: { id: notice.subjectId },
            select: {
                name: true,
                suspensions: { where: { liftedAt: null }, select: { id: true }, take: 1 },
                accountsReceivables: { where: OPEN_CLIENT_RECEIVABLES, select: RECEIVABLE_FIELDS }
            }
        });
        if (!client) return { reason: 'AL_DIA', subject: null };
        if (client.suspensions?.length) return { reason: 'YA_ATENDIDO', subject: client.name };
        const still = suspensionCandidate({ receivables: client.accountsReceivables, today: bogotaToday(now), settings });
        return still ? handled(notice.subjectId, client.name, still.receivableIds) : { reason: 'AL_DIA', subject: client.name };
    }
    if (notice.kind === 'CARTERA_MENSUAL') {
        const client = await db.client.findUnique({
            where: { id: notice.subjectId },
            select: { name: true, contracts: { select: { serviceType: true, startDate: true } }, accountsReceivables: { where: OPEN_CLIENT_RECEIVABLES, select: RECEIVABLE_FIELDS } }
        });
        const still = client && clientCollectionAlerts({ clientId: notice.subjectId, monthly: isMonthlyClient(client.contracts),
            receivables: client.accountsReceivables, today: bogotaToday(now), settings }).find((alert) => alert.kind === 'MENSUAL');
        if (!still) return { reason: 'RECALCULADO', subject: client?.name || null };
        return (await handled(notice.subjectId, client.name, still.receivableIds)) || currentText(still, client.name);
    }
    const receivable = await db.accountsReceivable.findUnique({
        where: { id: notice.subjectId }, select: { ...RECEIVABLE_FIELDS, clientId: true, client: { select: { name: true } } }
    });
    const subject = receivable?.client?.name || null;
    if (!receivable || openBalanceCents(receivable) <= 0) return { reason: 'AL_DIA', subject };
    const still = clientCollectionAlerts({ receivables: [receivable], today: bogotaToday(now), settings })[0];
    if (!still || still.kind !== 'UNICO') return { reason: 'RECALCULADO', subject };
    return (await handled(receivable.clientId, subject, still.receivableIds)) || currentText(still, subject);
};
