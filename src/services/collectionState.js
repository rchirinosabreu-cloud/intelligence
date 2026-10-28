// Lo que los avisos de cartera necesitan leer de la base: los plazos vigentes, las cuentas abiertas de cada cliente y si
// un aviso sigue haciendo falta. Aparte del reloj que avisa para que la banda lo pueda consultar sin depender de él.
import prisma from '../lib/prisma.js';
import {
    DEFAULT_COLLECTION_SETTINGS, monthlyCollectionAlert, normalizeCollectionSettings, openBalanceCents
} from '../lib/receivableCollections.js';
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
    id: true, kind: true, status: true, amount: true, period: true, issuedAt: true, dueDate: true, number: true,
    payments: { select: { amount: true, reversedAt: true, kind: true } }
});

/** ¿Fee mensual? Si el contrato más reciente del cliente es de parrilla. Sin contrato, o de servicios, es puntual. */
export const isMonthlyClient = (contracts = []) => {
    const latest = [...contracts].sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)))[0];
    return latest?.serviceType === 'PARRILLA';
};

/**
 * ¿Sigue haciendo falta el aviso de cartera? null si sí; si no, por qué. Una mensualidad que se pagó y deja al cliente
 * por debajo del umbral, o la cuenta puntual que ya no debe nada, salen solas de la banda.
 */
export const collectionStillDue = async (db, notice, now = new Date()) => {
    const settings = await readCollectionSettings(db);
    // Como en el CRM (28 de octubre de 2026): una gestión de cobro registrada después del aviso lo saca de la banda.
    const handled = async (clientId, subject) => (await hasCollectionActivitySince(db, clientId, notice.createdAt) ? { reason: 'GESTION', subject } : null);
    if (notice.kind === 'CARTERA_MENSUAL') {
        const client = await db.client.findUnique({
            where: { id: notice.subjectId },
            select: { name: true, accountsReceivables: { where: OPEN_CLIENT_RECEIVABLES, select: RECEIVABLE_FIELDS } }
        });
        const still = client && monthlyCollectionAlert({ clientId: notice.subjectId, receivables: client.accountsReceivables, today: bogotaToday(now), settings });
        return still ? handled(notice.subjectId, client.name) : { reason: 'AL_DIA', subject: client?.name || null };
    }
    const receivable = await db.accountsReceivable.findUnique({
        where: { id: notice.subjectId }, select: { ...RECEIVABLE_FIELDS, clientId: true, client: { select: { name: true } } }
    });
    return receivable && openBalanceCents(receivable) > 0
        ? handled(receivable.clientId, receivable.client?.name || null)
        : { reason: 'AL_DIA', subject: receivable?.client?.name || null };
};
