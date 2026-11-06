import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { hasModulePermission, isManagerRole } from '../config/security.js';
import { bogotaDate } from '../lib/colombiaBusinessDays.js';
import { clientOperationalNotices, operationalDayAfter } from '../lib/clientOperationalNotices.js';
import { suspensionCandidate } from '../lib/clientSuspension.js';
import { OPEN_CLIENT_RECEIVABLES, RECEIVABLE_FIELDS, readCollectionSettings } from './collectionState.js';

export async function readOperationalNotices(db, userId, now) {
    const actor = await db.user.findUnique({ where: { id: userId }, select: {
        id: true, role: true, modulePermissions: true, isActive: true, teamMember: { select: { isActive: true } }
    } });
    if (!actor?.isActive || !actor.teamMember?.isActive || !isManagerRole(actor.role) || !hasModulePermission(actor, 'clientes')) return [];
    const today = bogotaDate(now);
    const clients = await db.client.findMany({
        where: { isArchived: false, projectManager: { is: { userId, isActive: true } } },
        select: {
            id: true, name: true, slug: true, isArchived: true,
            projectManager: { select: { userId: true, isActive: true } },
            contracts: { select: { id: true, status: true, startDate: true, endDate: true, cutDay: true, monthlyReport: true, createdAt: true } },
            monthlyReports: { where: { year: { gte: Number(today.slice(0, 4)) - 1 } }, select: { year: true, month: true, status: true } },
            monthlyCloses: { where: { year: { gte: Number(today.slice(0, 4)) - 1 } }, select: { year: true, month: true } },
            suspensions: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, fromCycle: true, liftedAt: true } },
            accountsReceivables: { where: OPEN_CLIENT_RECEIVABLES, select: RECEIVABLE_FIELDS },
        }
    });
    if (!clients.length) return [];
    const projects = await db.projectFormalization.findMany({ where: { clientId: { in: clients.map(c => c.id) }, status: 'HABILITADO' },
        select: { id: true, clientId: true, status: true, operation: { select: { reviewStatus: true } } } });
    const settings = await readCollectionSettings(db);
    return clients.flatMap(client => {
        // Las cifras solo participan en la evaluación del servidor. Jamás se copian al aviso.
        let riskOn = null;
        if (settings.enabled && !client.suspensions?.some(s => !s.liftedAt)) {
            for (let offset = 0; offset <= 15; offset++) {
                const date = operationalDayAfter(today, offset);
                if (suspensionCandidate({ receivables: client.accountsReceivables, today: date, settings })) { riskOn = date; break; }
            }
        }
        return clientOperationalNotices(client, today, { isPm: true, riskOn,
            projects: projects.filter(p => p.clientId === client.id), suspension: client.suspensions?.[0] || null });
    });
}

const bellTypes = {
    OPERACION_INICIO: ['PROYECTO_HABILITADO'], OPERACION_CICLO: ['CIERRE_MENSUAL'],
    OPERACION_RENOVACION: ['RENOVACION_CONTRATO', 'TRABAJO_SIN_PROPUESTA'],
    OPERACION_CONTINUIDAD: ['CARTERA_RIESGO', 'CARTERA_SUSPENSION_PROPUESTA'],
    OPERACION_SUSPENSION: ['CLIENTE_SUSPENDIDO'], OPERACION_REACTIVACION: ['CLIENTE_REACTIVADO'],
};

// La misma tabla de banda, sin notificaciones nuevas de campana ni un seguimiento paralelo.
export async function syncOperationalNotices(db, userId, now, read = readOperationalNotices) {
    return db.$transaction(async tx => {
        if (typeof tx.$executeRaw === 'function') await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`operational-notices:${userId}`}))`);
        const wanted = await read(tx, userId, now);
        const activeIds = [];
        for (const item of wanted) {
            const id = `op-${createHash('sha256').update(`${userId}:${item.subjectId}`).digest('hex')}`;
            activeIds.push(id);
            const old = await tx.importantNotice.findUnique({ where: { id } });
            const notification = await tx.notification.findFirst({ where: { userId,
                relatedId: item.sourceId || item.clientId, type: { in: bellTypes[item.kind] || [] } }, orderBy: { createdAt: 'desc' }, select: { id: true } });
            const fields = { kind: item.kind, subjectId: item.subjectId, label: item.label, message: item.message, url: item.url, level: item.level,
                notificationId: notification?.id || null };
            if (!old) await tx.importantNotice.create({ data: { id, userId, createdAt: now, ...fields } });
            else await tx.importantNotice.update({ where: { id }, data: { ...fields,
                ...(old.resolution === 'YA_ATENDIDO' ? { resolvedAt: null, resolution: null } : {}) } });
        }
        await tx.importantNotice.updateMany({ where: { userId, kind: { startsWith: 'OPERACION_' }, resolvedAt: null, id: { notIn: activeIds } },
            data: { resolvedAt: now, resolution: 'YA_ATENDIDO' } });
        return new Map(wanted.map(item => [item.subjectId, item]));
    }, { timeout: 15000 });
}
