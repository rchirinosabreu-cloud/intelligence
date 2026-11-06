import { Prisma } from '@prisma/client';
import { hasModulePermission } from '../config/security.js';
import { selectedContract } from '../lib/clientContractSelection.js';
import { bogotaDate } from '../lib/colombiaBusinessDays.js';

const fail = (status, message) => Object.assign(new Error(message), { status });
export const canDecideContractContinuity = (actor, client) => Boolean(actor?.isActive && actor.teamMember?.isActive
    && hasModulePermission(actor, 'clientes') && (actor.role === 'ADMIN'
        || (actor.role === 'PROJECT_MANAGER' && client?.projectManager?.userId === actor.id && client.projectManager.isActive)));
export const continuityActorSelect = { id: true, name: true, role: true, isActive: true, modulePermissions: true, teamMember: { select: { isActive: true } } };

// Una decisión del contrato, compartida por todos los avisos. Nunca termina la cuenta, cancela trabajo ni cambia cartera.
export async function setContractContinuity(db, clientId, input, actorUserId, { now = new Date() } = {}) {
    if (input?.confirmed !== true || !['NO_RENOVAR', 'PENDIENTE'].includes(input?.decision)) throw fail(400, 'Confirma la decisión que quieres registrar.');
    const note = String(input.note || '').trim();
    if (note.length > 1000 || (input.decision === 'PENDIENTE' && !note)) throw fail(400, 'Para corregir la decisión indica el motivo (máximo 1000 caracteres).');
    try {
        return await db.$transaction(async tx => {
            const actor = await tx.user.findUnique({ where: { id: actorUserId }, select: continuityActorSelect });
            const client = await tx.client.findUnique({ where: { id: clientId }, select: {
                id: true, slug: true, isArchived: true, projectManager: { select: { userId: true, isActive: true } }, contracts: true,
            } });
            if (!canDecideContractContinuity(actor, client)) throw fail(403, 'Esta decisión corresponde al project manager asignado o a Dirección con acceso a Clientes.');
            if (!client || client.isArchived) throw fail(404, 'No encontramos una cuenta activa.');
            const contract = selectedContract(client.contracts, bogotaDate(now));
            if (!contract || contract.id !== input.contractId || contract.endDate !== input.endDate
                || contract.updatedAt.toISOString() !== input.expectedUpdatedAt) throw fail(409, 'El contrato cambió. Revisa la ficha actual antes de confirmar.');
            if (!contract.endDate || contract.status !== 'ACTIVO') throw fail(409, 'Registra primero la fecha de finalización en un contrato activo.');
            if (input.decision === contract.renewalDecision) throw fail(409, 'Esta decisión ya está registrada. Actualiza la ficha.');
            if (input.decision === 'NO_RENOVAR' && client.contracts.some(c => c.id !== contract.id && c.status === 'ACTIVO' && c.startDate > contract.startDate)) {
                throw fail(409, 'Ya hay otro contrato posterior registrado. Revisa esa renovación antes de confirmar que no continuará.');
            }
            const changed = await tx.clientContract.updateMany({ where: { id: contract.id, updatedAt: contract.updatedAt }, data: {
                renewalDecision: input.decision, renewalDecisionAt: now, renewalDecisionById: actor.id, renewalDecisionByName: actor.name,
                renewalDecisionNote: note || null, updatedById: actor.id,
            } });
            if (changed.count !== 1) throw fail(409, 'El contrato cambió. Revisa la ficha actual antes de confirmar.');
            await tx.clientContractDecision.create({ data: { clientId, contractId: contract.id, decision: input.decision,
                previousDecision: contract.renewalDecision, endDate: contract.endDate, actorId: actor.id, actorName: actor.name, note: note || null, createdAt: now } });
            if (input.decision === 'NO_RENOVAR') {
                const subjectIds = ['RENOVACION', 'CONTINUIDAD'].map(kind => `OP:${clientId}:${kind}:${contract.id}`);
                await tx.importantNotice.updateMany({ where: { subjectId: { in: subjectIds }, kind: { in: ['OPERACION_RENOVACION', 'OPERACION_CONTINUIDAD'] }, resolvedAt: null },
                    data: { resolvedAt: now, decidedAt: now, resolution: 'NO_RENOVAR' } });
                // El histórico permanece. Solo el recordatorio ya resuelto de esta cuenta deja de contar como pendiente.
                await tx.notification.updateMany({ where: { relatedId: clientId, OR: [
                    { type: 'RENOVACION_CONTRATO' },
                    { type: 'CARTERA_RIESGO', url: { startsWith: '/clientes/operacion/' } },
                ], isRead: false, createdAt: { lte: now } },
                    data: { isRead: true, readAt: now } });
            } else {
                // Reabrir requiere otra decisión expresa. Al leer se comprueba si el aviso vuelve a corresponder hoy.
                await tx.importantNotice.updateMany({ where: { subjectId: { in: ['RENOVACION', 'CONTINUIDAD'].map(kind => `OP:${clientId}:${kind}:${contract.id}`) }, resolution: 'NO_RENOVAR' },
                    data: { resolution: 'YA_ATENDIDO' } });
            }
            return { ok: true, slug: client.slug, decision: input.decision };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
        if (error.code === 'P2034') throw fail(409, 'Alguien cambió esta cuenta. Actualiza la ficha antes de confirmar.');
        throw error;
    }
}
