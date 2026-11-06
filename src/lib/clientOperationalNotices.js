import { cycleForDate, previousCycle } from './clientOperations.js';
import { selectedContract, orderedContracts } from './clientContractSelection.js';
import { dayLabel } from './contractCycleAlerts.js';
import { bogotaDate } from './colombiaBusinessDays.js';

const days = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
export const operationalDayAfter = (day, count) => new Date(Date.parse(`${day}T12:00:00Z`) + count * 86400000).toISOString().slice(0, 10);
export const isOperationalNotice = n => String(n?.kind || '').startsWith('OPERACION_');
export const operationalNoticeAcknowledges = n => ['OPERACION_SUSPENSION', 'OPERACION_REACTIVACION'].includes(n?.kind);
export const operationalCycleSubject = notice => {
    if (notice?.kind !== 'OPERACION_CICLO') return null;
    const parts = String(notice.subjectId).split(':');
    return parts.length === 6 && /^\d{4}-\d{2}-\d{2}$/.test(parts[4]) ? `${parts[1]}:${parts[4].slice(0, 7)}` : null;
};

// Proyección del trabajo existente. No crea tareas, revisiones ni otro registro de cumplimiento.
export function clientOperationalNotices(client, today, { isPm = false, projects = [], riskOn = null, suspension = null } = {}) {
    if (!client || client.isArchived) return [];
    const rows = [];
    const contracts = orderedContracts(client.contracts || []);
    const contract = selectedContract(contracts, today);
    const url = `/clientes/operacion/${encodeURIComponent(client.slug)}`;
    const add = (kind, key, label, message, important = false, extra = {}) => rows.push({
        kind: `OPERACION_${kind}`, subjectId: `OP:${client.id}:${kind}:${key}`,
        clientId: client.id, label: `${label} · ${client.name}`, message, url,
        level: important ? 'IMPORTANTE' : 'SEGUIMIENTO', ...extra,
    });
    if (isPm) for (const project of projects) {
        if (project.status === 'HABILITADO' && project.operation?.reviewStatus !== 'REVISADO') {
            add('INICIO', project.id, 'Proyecto habilitado', 'Revisa el alcance aprobado y organiza el inicio desde la ficha del proyecto.', false, { sourceId: project.id });
        }
    }
    if (suspension && !suspension.liftedAt) {
        add('SUSPENSION', suspension.id, 'Suspensión confirmada', suspension.fromCycle > today.slice(0, 7)
            ? `La suspensión aplica a las parrillas desde ${suspension.fromCycle}. El mes actual se termina; no prepares los períodos suspendidos.`
            : `Las parrillas desde ${suspension.fromCycle} están suspendidas. Revisa la planificación vigente antes de continuar.`, true, { acknowledge: true });
    } else {
        const liftedDays = suspension?.liftedAt ? days(bogotaDate(new Date(suspension.liftedAt)), today) : null;
        if (liftedDays !== null && liftedDays >= 0 && liftedDays <= 7) {
            add('REACTIVACION', suspension.id, 'Operación reactivada', 'La suspensión se levantó. Revisa la planificación vigente antes de retomar el trabajo.', false, { acknowledge: true });
        }
        if (isPm && contract?.status === 'ACTIVO' && contract.startDate <= today && riskOn && riskOn <= operationalDayAfter(today, 15)) {
            add('CONTINUIDAD', contract?.id || 'cuenta', 'Continuidad por confirmar', riskOn > today
                ? `Un riesgo administrativo podría afectar el próximo período desde el ${dayLabel(riskOn)}. La operación no está suspendida; este aviso no cambia la vigencia del contrato. Confirma la continuidad con Administración.`
                : 'Hay un riesgo administrativo para el próximo período. La operación no está suspendida; este aviso no cambia la vigencia del contrato. Confirma la continuidad con Administración.', true);
        }
    }
    if (!contract || contract.status !== 'ACTIVO') return rows;
    if (isPm && contract.endDate && days(today, contract.endDate) <= 30) {
        const covered = contracts.some(c => c.id !== contract.id && c.status === 'ACTIVO'
            && c.startDate > contract.startDate && c.startDate <= operationalDayAfter(contract.endDate, 1)
            && (!c.endDate || c.endDate > contract.endDate));
        if (!covered) add('RENOVACION', contract.id, 'Renovación del servicio', contract.endDate < today
            ? `El contrato terminó el ${dayLabel(contract.endDate)} de ${contract.endDate.slice(0, 4)}. Confirma el alcance o la autorización antes de continuar.`
            : `El contrato termina el ${dayLabel(contract.endDate)} de ${contract.endDate.slice(0, 4)}. Revisa qué necesita el cliente y prepara con Comercial y Administración la propuesta de continuidad.`, days(today, contract.endDate) <= 15);
    }
    const current = cycleForDate(today, contract.cutDay || 1);
    for (const cycle of [previousCycle(current, contract.cutDay || 1), current]) {
        if (cycle.end < contract.startDate || (contract.endDate && cycle.start > contract.endDate)) continue;
        const end = contract.endDate && contract.endDate < cycle.end ? contract.endDate : cycle.end;
        if (today > operationalDayAfter(end, 3) || today < contract.startDate) continue;
        if ((client.monthlyCloses || []).some(c => c.year === cycle.year && c.month === cycle.month)) continue;
        const start = cycle.start < contract.startDate ? contract.startDate : cycle.start;
        const middle = operationalDayAfter(start, Math.floor(days(start, end) / 2));
        if (today < middle) continue;
        const closing = today >= operationalDayAfter(end, -4);
        const report = (client.monthlyReports || []).find(r => r.year === cycle.year && r.month === cycle.month);
        const reportDue = isPm && contract.monthlyReport && report?.status !== 'ENVIADO' && today >= operationalDayAfter(end, -2);
        add('CICLO', `${contract.id}:${cycle.start}:${closing ? 'CIERRE' : 'MITAD'}`,
            closing ? `Cierre del ${dayLabel(end)}` : 'Revisión de mitad de ciclo',
            `${closing ? 'Revisa contenidos, jornadas y servicios contratados antes del cierre.' : 'Revisa el avance y la planificación de este período: contenidos, jornadas y servicios contratados.'}${reportDue ? '\nEl informe sigue pendiente de envío.' : ''}`,
            closing, { cycle: { year: cycle.year, month: cycle.month }, actionLabel: 'Revisar operación' });
    }
    return rows;
}
