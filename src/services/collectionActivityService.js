// Gestiones de cobro (Rodny, 28 de octubre de 2026): lo que se hizo para cobrarle a un cliente, desde el aviso de la
// banda («Ya le escribí») o a mano desde Cuentas por cobrar. Es dato de trabajo, como las gestiones del CRM: nada se
// edita desde la pantalla. Una gestión después de un aviso de cartera lo saca de la banda (`collectionStillDue`).
import prisma from '../lib/prisma.js';
import { collectionChannelLabel, isCollectionChannel } from '../lib/collectionActivities.js';

const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const LIST_LIMIT = 500;

/** Registra una gestión. `noticeId` hace que el mismo aviso deje una sola, aunque se reintente. */
export const recordCollectionActivity = async (db = prisma, { clientId, receivableId = null, channel, noticeId = null, source = 'MANUAL' } = {}, actor = {}, { now = new Date() } = {}) => {
    if (!isCollectionChannel(channel)) throw httpError(400, 'Elige cómo fue la gestión de cobro.');
    const client = clientId ? await db.client.findUnique({ where: { id: clientId }, select: { id: true } }) : null;
    if (!client) throw httpError(404, 'Ese cliente ya no está.');
    if (receivableId !== null) {
        if (typeof receivableId !== 'string' || !receivableId.trim()) throw httpError(400, 'Elige una obligación válida para esta gestión.');
        const receivable = await db.accountsReceivable.findUnique({ where: { id: receivableId }, select: { clientId: true, kind: true } });
        if (!receivable) throw httpError(404, 'Esa obligación ya no está.');
        if (receivable.clientId !== clientId || receivable.kind === 'PRESTAMO') throw httpError(409, 'La obligación no corresponde a la cartera de este cliente.');
    }
    const data = { clientId, receivableId, channel, source, noticeId,
        authorId: actor.userId || actor.id || null, authorName: actor.name || null, occurredAt: now };
    // El reintento conserva el evento original. Una violación de unicidad atrapada dentro de la transacción de
    // varias obligaciones dejaría PostgreSQL abortado; el upsert no produce esa excepción ni reescribe el evento.
    if (noticeId) return db.collectionActivity.upsert({ where: { noticeId }, create: data, update: {} });
    return db.collectionActivity.create({ data });
};

/** Las gestiones más recientes, para Cuentas por cobrar. */
export const listCollectionActivities = async (db = prisma) => {
    const rows = await db.collectionActivity.findMany({ orderBy: { occurredAt: 'desc' }, take: LIST_LIMIT + 1 });
    return {
        hasMore: rows.length > LIST_LIMIT,
        limit: LIST_LIMIT,
        items: rows.slice(0, LIST_LIMIT).map((row) => ({
            id: row.id, clientId: row.clientId, receivableId: row.receivableId || null, channel: row.channel,
            channelLabel: collectionChannelLabel(row.channel), source: row.source, authorName: row.authorName || null,
            occurredAt: row.occurredAt instanceof Date ? row.occurredAt.toISOString() : row.occurredAt
        }))
    };
};

/** Una gestión general cubre el cliente; una específica solo las obligaciones que identifica. */
export const hasCollectionActivitySince = async (db, clientId, since, receivableIds = []) => {
    if (!clientId || typeof db.collectionActivity?.findFirst !== 'function') return false;
    const where = { clientId, occurredAt: { gt: new Date(since) } };
    if (await db.collectionActivity.findFirst({ where: { ...where, receivableId: null }, select: { id: true } })) return true;
    const ids = [...new Set(receivableIds.filter(Boolean))];
    if (!ids.length) return false;
    for (const id of ids) {
        if (!await db.collectionActivity.findFirst({ where: { ...where, receivableId: id }, select: { id: true } })) return false;
    }
    return true;
};
