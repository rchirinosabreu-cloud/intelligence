// La cerradura de una suspensión por cartera, aparte del servicio que la crea (30 de octubre de 2026).
//
// Vive en su propio archivo por dos razones: está en el camino de **cada** edición de pieza y de cada cambio de
// pendiente, así que no puede arrastrar consigo los avisos ni las notificaciones; y así parrillas y Gestión no importan
// el servicio que, a su vez, importa medio sistema de avisos.
//
// Es una sola lectura indexada de la suspensión abierta: no toca la cartera. Quién se pone al día lo revisa el reloj.
import prisma from '../lib/prisma.js';
import { suspendedTaskReason, suspensionBlockReason } from '../lib/clientSuspension.js';

export const SUSPENSION_FIELDS = Object.freeze({
    id: true, clientId: true, fromCycle: true, suspendedOn: true, authorizedBy: true, reason: true,
    createdAt: true, createdByName: true
});

/** La suspensión abierta de un cliente, o null. Una fila como máximo: lo garantiza el índice único parcial. */
export const openSuspension = async (db = prisma, clientId) => {
    if (!clientId || typeof db.clientSuspension?.findFirst !== 'function') return null;
    return db.clientSuspension.findFirst({ where: { clientId: String(clientId), liftedAt: null }, select: SUSPENSION_FIELDS });
};

/**
 * Por qué no se puede trabajar la parrilla de ese mes, o null. Lo usan parrillas, piezas, despacho, programación en
 * redes y la puerta de Gestión, para que la frase sea siempre la misma la pida quien la pida.
 */
export const suspensionBlock = async (db = prisma, { clientId, year, month, clientName = null, forTask = false } = {}) => {
    const suspension = await openSuspension(db, clientId);
    if (!suspension) return null;
    const reason = forTask
        ? suspendedTaskReason(suspension, { year, month }, clientName)
        : suspensionBlockReason(suspension, { year, month }, clientName);
    return reason ? { suspension, reason } : null;
};

/** Lo mismo, lanzando el 409 que ya saben traducir las rutas y la pantalla. */
export const assertNotSuspended = async (db = prisma, context = {}) => {
    const block = await suspensionBlock(db, context);
    if (block) throw Object.assign(new Error(block.reason), { status: 409, code: 'CLIENT_SUSPENDED' });
};
