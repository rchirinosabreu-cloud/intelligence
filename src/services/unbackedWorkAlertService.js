// Aviso a Dirección por trabajo en curso sin propuesta aprobada (punto 5 de la solicitud de Elisa; Rodny, 29 de octubre
// de 2026). Un reloj en horario hábil mira cada cliente: si tiene tareas abiertas o parrilla del mes en curso o del
// siguiente, y no tiene un contrato vigente (sin contrato, vencido o terminado) ni una autorización vigente para seguir,
// avisa por la campana al área de Dirección. Una vez por cliente y mes (`UnbackedWorkAlert`), nunca cada día.
import prisma from '../lib/prisma.js';
import { createNotification } from './notificationService.js';
import { activeAreaUserIds } from './teamAreaService.js';
import { isWorkingTime } from '../lib/briaNudges.js';
import { MONTH_NAMES } from '../lib/clientOperations.js';
import { unbackedWork, unbackedWorkNoticeText } from '../lib/unbackedWork.js';

export const UNBACKED_WORK_TYPE = 'TRABAJO_SIN_PROPUESTA';
const OPEN_TASK_STATUSES = ['PENDIENTE', 'EN_CURSO', 'DEVUELTA'];
const CHECK_MS = 30 * 60 * 1000;
const DIGEST_THRESHOLD = 3;

const bogotaToday = (now) => new Date(now.getTime() - 5 * 3600 * 1000).toISOString().slice(0, 10);

/** Lo que se está trabajando con cada cliente, en la misma forma que lo lee el semáforo de Operación. */
export const clientWork = (client, today) => {
    const [year, month] = today.split('-').map(Number);
    const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
    const plans = (client.contentPlans || [])
        .filter((plan) => (plan._count?.contentItems || 0) > 0)
        .filter((plan) => (plan.year === year && plan.month === month) || (plan.year === next.year && plan.month === next.month))
        .sort((a, b) => a.year - b.year || a.month - b.month)
        .map((plan) => MONTH_NAMES[plan.month - 1].toLowerCase());
    return { openTasks: client._count?.nativeTasks || 0, plans: [...new Set(plans)] };
};

export const runUnbackedWorkAlerts = async (db = prisma, { now = new Date(), notify = createNotification, log = console.error, info = console.log } = {}) => {
    const today = bogotaToday(now);
    const [year, month] = today.split('-').map(Number);
    const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
    const clients = await db.client.findMany({
        where: { isArchived: false },
        select: {
            id: true, name: true, slug: true,
            contracts: { orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }], take: 1, select: { status: true, startDate: true, endDate: true } },
            workAuthorizations: { orderBy: { createdAt: 'desc' }, take: 1, select: { until: true, reason: true, authorizedByName: true } },
            contentPlans: {
                where: { deletedAt: null, OR: [{ year, month }, { year: next.year, month: next.month }] },
                select: { year: true, month: true, _count: { select: { contentItems: { where: { deletedAt: null } } } } }
            },
            _count: { select: { nativeTasks: { where: { status: { in: OPEN_TASK_STATUSES } } } } }
        }
    });
    const direction = await activeAreaUserIds(db, 'DIRECCION');
    if (!direction.length) log('[Trabajo sin propuesta] Nadie del equipo está en el área Dirección: el aviso no tiene a quién llegar.');

    const found = [];
    const monthKey = today.slice(0, 7);
    for (const client of clients) {
        const authorization = client.workAuthorizations?.[0];
        const finding = unbackedWork({
            contract: client.contracts?.[0] || null,
            work: clientWork(client, today),
            authorization: authorization ? { until: authorization.until, reason: authorization.reason, byName: authorization.authorizedByName } : null
        }, today);
        if (!finding || finding.authorized) continue;
        try {
            await db.unbackedWorkAlert.create({ data: { clientId: client.id, monthKey, sentAt: now } });
        } catch (error) {
            if (error?.code === 'P2002') continue;
            throw error;
        }
        found.push({ client, finding });
    }

    const deliver = async (data) => {
        try {
            return await notify(data);
        } catch (error) {
            log('[Trabajo sin propuesta] Aviso no entregado:', error?.message || error);
            return null;
        }
    };
    for (const userId of direction) {
        if (found.length > DIGEST_THRESHOLD) {
            await deliver({ userId, type: UNBACKED_WORK_TYPE, url: '/clientes', message: `${found.length} clientes tienen trabajo en curso sin propuesta aprobada: revisa sus contratos en Operación.` });
            continue;
        }
        for (const { client, finding } of found) {
            await deliver({
                userId, type: UNBACKED_WORK_TYPE, relatedId: client.id,
                url: client.slug ? `/clientes/operacion/${client.slug}` : '/clientes',
                message: unbackedWorkNoticeText(client.name, finding)
            });
        }
    }
    if (found.length) info(`[Trabajo sin propuesta] ${found.length} ${found.length === 1 ? 'cliente' : 'clientes'} con trabajo sin propuesta aprobada: ${found.map(({ client }) => client.name).join(', ')}.`);
    return { found: found.length };
};

/** El reloj: cada media hora, solo en horario hábil de Bogotá. */
export const initUnbackedWorkAlertScheduler = ({ db = prisma, interval = CHECK_MS } = {}) => {
    const run = () => {
        const now = new Date();
        if (!isWorkingTime(now)) return;
        runUnbackedWorkAlerts(db, { now }).catch((error) => console.error('[Trabajo sin propuesta] Avisos:', error?.message || error));
    };
    const startup = setTimeout(run, 70_000);
    startup.unref?.();
    const timer = setInterval(run, interval);
    timer.unref?.();
    console.log('[Trabajo sin propuesta] Avisos a Dirección activos (cada 30 minutos, horario hábil).');
    return timer;
};
