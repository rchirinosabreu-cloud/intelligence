// Suspender un cliente por cartera (punto 7 de la solicitud de Elisa; su respuesta del 30 de octubre de 2026).
//
// La plataforma **propone** desde el día 15 —que es cuando se empieza la parrilla del mes siguiente— y **nadie queda
// suspendido sin que una persona lo decida**: suspender es de Administración o Dirección, con quién lo autorizó y por
// qué. Lo que sí hace sola es **levantarla en cuanto el cliente se pone al día** (Rodny, 30 de octubre de 2026), para
// que nadie tenga que acordarse: al registrar un pago y, como red, en cada pase del reloj.
//
// El bloqueo lo consultan parrillas y Gestión con `suspensionBlock`, que vive aparte en `clientSuspensionGate.js`:
// está en el camino de cada edición de pieza y no puede arrastrar consigo todo el sistema de avisos.
import { randomUUID } from 'node:crypto';
import prisma from '../lib/prisma.js';
import { cycleForDate } from '../lib/clientOperations.js';
import {
    firstSuspendedCycle, isDecisionDay, liftProblem, suspensionCandidate,
    suspensionCandidateBellText, suspensionCandidateNoticeText, suspensionLiftedText, suspensionProblem, suspensionStartedText
} from '../lib/clientSuspension.js';
import { SUSPENSION_FIELDS, openSuspension } from './clientSuspensionGate.js';
import { OPEN_CLIENT_RECEIVABLES, RECEIVABLE_FIELDS, bogotaToday, readCollectionSettings } from './collectionState.js';
import { createNotification } from './notificationService.js';
import { queueImportantNotice } from './importantNoticeService.js';
import { activeAreaUserIds, userHasArea } from './teamAreaService.js';

export const SUSPENSION_PROPOSED_TYPE = 'CARTERA_SUSPENSION_PROPUESTA';
export const SUSPENSION_STARTED_TYPE = 'CLIENTE_SUSPENDIDO';
export const SUSPENSION_LIFTED_TYPE = 'CLIENTE_REACTIVADO';
const CHECK_MS = 30 * 60 * 1000;

const httpError = (status, message, extra = {}) => Object.assign(new Error(message), { status, ...extra });
const isUniqueViolation = (error) => error?.code === 'P2002';
const clientUrl = (client) => (client?.slug ? `/clientes/operacion/${client.slug}` : '/clientes?tab=operacion');

const clientForSuspension = async (db, clientId) => {
    const client = await db.client.findFirst({
        where: { id: String(clientId || '') },
        select: {
            id: true, name: true, slug: true,
            contracts: { orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }], take: 1, select: { cutDay: true } },
            projectManager: { select: { userId: true } },
            responsible: { select: { userId: true } },
            accountsReceivables: { where: OPEN_CLIENT_RECEIVABLES, select: RECEIVABLE_FIELDS }
        }
    });
    if (!client) throw httpError(404, 'No encontramos ese cliente.');
    return client;
};

// Suspender es de Administración o Dirección, como autorizar trabajo sin propuesta aprobada (29 de octubre de 2026).
// Quién lo autorizó se escribe aparte: la regla de la empresa es que lo autoriza Francisco.
const canSuspend = async (db, userId) => {
    if (!userId) return false;
    for (const area of ['ADMINISTRATIVA', 'DIRECCION']) if (await userHasArea(db, userId, area)) return true;
    return false;
};

export const createClientSuspensionService = ({
    db = prisma, notify = createNotification, queueNotice = queueImportantNotice, log = console.error, info = console.log
} = {}) => {
    const actorName = async (userId) => (userId
        ? (await db.user.findUnique({ where: { id: userId }, select: { name: true } }).catch(() => null))?.name || null
        : null);

    /** A quién le importa que este cliente quede (o deje de estar) suspendido: su PM, su CM y Administración. */
    const audience = async (client) => {
        const ids = new Set([client.projectManager?.userId, client.responsible?.userId].filter(Boolean));
        for (const userId of await activeAreaUserIds(db, 'ADMINISTRATIVA')) ids.add(userId);
        return [...ids];
    };

    const tell = async (userIds, { type, message, client }) => {
        for (const userId of userIds) {
            await notify({ userId, type, message, relatedId: client.id, resourceId: client.id, url: clientUrl(client) })
                .catch((error) => log('[Suspensión] Aviso no entregado:', error?.message || error));
        }
    };

    /**
     * Suspende al cliente desde el mes siguiente al que corre hoy: el que va en curso se termina. Exige quién lo
     * autorizó y por qué, y guarda la cartera que lo sustenta, para que después se sepa con qué se decidió.
     */
    const suspendClient = async ({ clientId, authorizedBy, reason, actorUserId, now = new Date() }) => {
        if (!(await canSuspend(db, actorUserId))) throw httpError(403, 'Suspender un cliente por cartera es de Administración o Dirección.');
        const problem = suspensionProblem({ authorizedBy, reason });
        if (problem) throw httpError(422, problem);
        const client = await clientForSuspension(db, clientId);
        if (await openSuspension(db, client.id)) throw httpError(409, `${client.name} ya está suspendido.`);

        const today = bogotaToday(now);
        const settings = await readCollectionSettings(db);
        const candidate = suspensionCandidate({ receivables: client.accountsReceivables, today, settings });
        const fromCycle = firstSuspendedCycle(cycleForDate(today, client.contracts[0]?.cutDay || 1));
        const data = {
            id: randomUUID(), clientId: client.id, fromCycle, suspendedOn: today,
            authorizedBy: String(authorizedBy).trim(), reason: String(reason).trim(),
            // Lo que había en cartera al decidirlo. Sin candidato se guarda vacío: se puede suspender por un acuerdo
            // que no llega al umbral, y el motivo escrito es lo que lo explica.
            evidence: candidate || {},
            createdById: actorUserId || null, createdByName: await actorName(actorUserId)
        };
        let suspension;
        try {
            suspension = await db.clientSuspension.create({ data, select: SUSPENSION_FIELDS });
        } catch (error) {
            if (isUniqueViolation(error)) throw httpError(409, `${client.name} ya está suspendido.`);
            throw error;
        }
        info(`[Suspensión] ${client.name} suspendido desde ${fromCycle}, autorizado por ${data.authorizedBy}.`);
        await tell(await audience(client), { type: SUSPENSION_STARTED_TYPE, message: suspensionStartedText(client.name, suspension), client });
        return suspension;
    };

    const closeSuspension = async (suspension, client, { kind, reason, actorUserId = null, now = new Date() }) => {
        await db.clientSuspension.update({
            where: { id: suspension.id },
            data: {
                liftedAt: now, liftKind: kind, liftReason: reason,
                liftedById: actorUserId, liftedByName: await actorName(actorUserId)
            }
        });
        const lifted = { ...suspension, liftKind: kind };
        info(`[Suspensión] ${client.name} ya no está suspendido (${kind}).`);
        await tell(await audience(client), { type: SUSPENSION_LIFTED_TYPE, message: suspensionLiftedText(client.name, lifted), client });
        return lifted;
    };

    /** Levantarla a mano: para un acuerdo de pago. Pide el motivo y queda quién la levantó. */
    const liftSuspension = async ({ clientId, reason, actorUserId, now = new Date() }) => {
        if (!(await canSuspend(db, actorUserId))) throw httpError(403, 'Levantar una suspensión es de Administración o Dirección.');
        const problem = liftProblem({ reason });
        if (problem) throw httpError(422, problem);
        const client = await clientForSuspension(db, clientId);
        const suspension = await openSuspension(db, client.id);
        if (!suspension) throw httpError(409, `${client.name} no está suspendido.`);
        return closeSuspension(suspension, client, { kind: 'MANUAL', reason: String(reason).trim(), actorUserId, now });
    };

    /**
     * ¿Este cliente dejó de cumplir la condición? Entonces la suspensión se levanta sola. Se llama al registrar un pago
     * y en cada pase del reloj; nunca lanza hacia fuera, porque no puede tumbar el pago que la provocó.
     */
    const liftIfPaid = async (clientId, { now = new Date() } = {}) => {
        try {
            const suspension = await openSuspension(db, clientId);
            if (!suspension) return null;
            const client = await clientForSuspension(db, clientId);
            const settings = await readCollectionSettings(db);
            if (suspensionCandidate({ receivables: client.accountsReceivables, today: bogotaToday(now), settings })) return null;
            return await closeSuspension(suspension, client, { kind: 'PAGO', reason: 'El cliente se puso al día.', now });
        } catch (error) {
            log('[Suspensión] No se pudo revisar si ya se puede levantar:', error?.message || error);
            return null;
        }
    };

    /**
     * Una pasada del reloj: levanta las que ya no hacen falta y, desde el día 15, propone las que tocan. La propuesta
     * se anota primero (la fila única de `CollectionAlert` es la cerradura) y después se avisa, como en cartera.
     */
    const runClientSuspensions = async ({ now = new Date() } = {}) => {
        const today = bogotaToday(now);
        const result = { lifted: 0, proposed: 0 };
        for (const open of await db.clientSuspension.findMany({ where: { liftedAt: null }, select: { clientId: true } })) {
            if (await liftIfPaid(open.clientId, { now })) result.lifted += 1;
        }
        if (!isDecisionDay(today)) return result;

        const settings = await readCollectionSettings(db);
        if (!settings.enabled) return result;
        const administrative = await activeAreaUserIds(db, 'ADMINISTRATIVA');
        const clients = await db.client.findMany({
            where: { accountsReceivables: { some: OPEN_CLIENT_RECEIVABLES }, suspensions: { none: { liftedAt: null } } },
            select: {
                id: true, name: true, slug: true,
                contracts: { orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }], take: 1, select: { cutDay: true } },
                projectManager: { select: { userId: true } },
                accountsReceivables: { where: OPEN_CLIENT_RECEIVABLES, select: RECEIVABLE_FIELDS }
            }
        });
        for (const client of clients) {
            const candidate = suspensionCandidate({ receivables: client.accountsReceivables, today, settings });
            if (!candidate) continue;
            const fromCycle = firstSuspendedCycle(cycleForDate(today, client.contracts[0]?.cutDay || 1));
            try {
                // Una propuesta por cliente y mes congelado: si nadie decide, no se repite todos los días.
                await db.collectionAlert.create({ data: { subjectId: client.id, kind: 'SUSPENSION', cycle: `S:${fromCycle}`, step: 0, sentAt: now } });
            } catch (error) {
                if (isUniqueViolation(error)) continue;
                throw error;
            }
            result.proposed += 1;
            const notice = suspensionCandidateNoticeText(candidate, client.name, fromCycle);
            for (const userId of administrative) {
                const notification = await notify({
                    userId, type: SUSPENSION_PROPOSED_TYPE, message: suspensionCandidateBellText(client.name, 'ADMINISTRATIVA'),
                    relatedId: client.id, resourceId: client.id, url: clientUrl(client)
                }).catch((error) => { log('[Suspensión] Aviso de campana no entregado:', error?.message || error); return null; });
                await queueNotice(db, { userId, subjectId: client.id, url: clientUrl(client), notificationId: notification?.id || null, ...notice }, now)
                    .catch((error) => log('[Suspensión] Aviso importante no guardado:', error?.message || error));
            }
            const pm = client.projectManager?.userId;
            if (pm && !administrative.includes(pm)) {
                await tell([pm], { type: SUSPENSION_PROPOSED_TYPE, message: suspensionCandidateBellText(client.name, 'PM'), client });
            }
        }
        if (result.proposed || result.lifted) info(`[Suspensión] ${result.proposed} propuestas, ${result.lifted} levantadas en este pase.`);
        return result;
    };

    return { canSuspend: (userId) => canSuspend(db, userId), suspendClient, liftSuspension, liftIfPaid, runClientSuspensions };
};

export const clientSuspensionService = createClientSuspensionService();

export const initClientSuspensionScheduler = ({ db = prisma, interval = CHECK_MS } = {}) => {
    const service = db === prisma ? clientSuspensionService : createClientSuspensionService({ db });
    const run = () => service.runClientSuspensions({ now: new Date() })
        .catch((error) => console.error('[Suspensión] Revisión de suspensiones:', error?.message || error));
    const startup = setTimeout(run, 50_000);
    startup.unref?.();
    const timer = setInterval(run, interval);
    timer.unref?.();
    console.log('[Suspensión] Revisión de suspensiones por cartera activa (cada 30 minutos).');
    return timer;
};
