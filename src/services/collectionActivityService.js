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
    try {
        return await db.collectionActivity.create({
            data: {
                clientId, receivableId, channel, source, noticeId,
                authorId: actor.userId || actor.id || null, authorName: actor.name || null, occurredAt: now
            }
        });
    } catch (error) {
        if (noticeId && error?.code === 'P2002') return null;
        throw error;
    }
};

/** Las gestiones más recientes, para Cuentas por cobrar. */
export const listCollectionActivities = async (db = prisma) => {
    const rows = await db.collectionActivity.findMany({ orderBy: { occurredAt: 'desc' }, take: LIST_LIMIT });
    return {
        items: rows.map((row) => ({
            id: row.id, clientId: row.clientId, receivableId: row.receivableId || null, channel: row.channel,
            channelLabel: collectionChannelLabel(row.channel), source: row.source, authorName: row.authorName || null,
            occurredAt: row.occurredAt instanceof Date ? row.occurredAt.toISOString() : row.occurredAt
        }))
    };
};

/** ¿Hubo una gestión de cobro con este cliente después de ese momento? */
export const hasCollectionActivitySince = async (db, clientId, since) => {
    if (!clientId || typeof db.collectionActivity?.findFirst !== 'function') return false;
    return Boolean(await db.collectionActivity.findFirst({ where: { clientId, occurredAt: { gt: new Date(since) } }, select: { id: true } }));
};
