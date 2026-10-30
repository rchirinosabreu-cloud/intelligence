// Cierre mensual y renovaciones (punto 5 de la solicitud de Elisa; Rodny, 29 de octubre de 2026). El mes de cada cliente
// va de su día de corte al día anterior del mes siguiente (`cycleForDate`, el mismo de Operación de clientes), y la
// plataforma avisa antes de cerrarlo y antes de que termine el contrato:
//
// - 3 días antes del cierre, al project manager: revisar contenidos, jornadas y pendientes.
// - 2 días antes, al project manager, si el contrato lleva informe: preparar el informe del mes.
// - 2 días antes, a Administrativa y contable: revisar la facturación (el cobro del mes siguiente sale al cerrar).
// - El día del cierre, al project manager: consolidar entregables e informes.
// - 30 días antes de que termine el contrato, al project manager y a Administrativa: activar la renovación.
// - 15 días antes, a Administrativa: la renovación sigue pendiente.
//
// Un aviso que cae en fin de semana sale el siguiente día hábil, dentro de su ventana: los de antes del cierre hasta el
// cierre, el del cierre hasta tres días después. Lo vencido no se avisa: un contrato que ya terminó lo dice el semáforo.
// La regla es pura; quién recibe y qué ya se avisó lo decide `contractCycleAlertService`.
import { MONTH_NAMES, cycleForDate, previousCycle } from './clientOperations.js';

// Cerrar bien el mes es de las dos personas a cargo de la cuenta (Rodny, 30 de octubre de 2026: «debería aparecerle al
// PM y al CM, las mismas porque, en tal caso, las dos son responsables»). El informe sigue siendo del project manager y
// la facturación, de Administrativa.
export const CYCLE_STEPS = Object.freeze({
    REVISION: { before: 3, audience: ['PM', 'CM'] },
    INFORME: { before: 2, audience: ['PM'], needsReport: true },
    FACTURACION: { before: 2, audience: ['ADMINISTRATIVA'] },
    CIERRE: { before: 0, audience: ['PM', 'CM'], late: 3 }
});
export const RENEWAL_STEPS = Object.freeze({
    RENOVACION_30: { days: 30, audience: ['PM', 'ADMINISTRATIVA'] },
    RENOVACION_15: { days: 15, audience: ['ADMINISTRATIVA'] }
});

const DAY = 86400000;
const toTime = (key) => Date.parse(`${key}T12:00:00Z`);
export const addDays = (key, days) => new Date(toTime(key) + days * DAY).toISOString().slice(0, 10);
const daysBetween = (from, to) => Math.round((toTime(to) - toTime(from)) / DAY);
const isKey = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));

/** «14 de noviembre», para los avisos. */
export const dayLabel = (key) => {
    const [, month, day] = key.split('-').map(Number);
    return `${day} de ${MONTH_NAMES[month - 1].toLowerCase()}`;
};

/** El cierre de un mes del contrato: el último día del ciclo, o antes si el contrato termina a mitad de mes. */
const cycleClose = (cycle, contract) => (contract.endDate && contract.endDate < cycle.end ? contract.endDate : cycle.end);

/**
 * Los avisos que le tocan hoy a un contrato. Solo contratos activos que ya empezaron. Devuelve
 * `[{ step, cycleKey, audience, close?, endDate?, cycle? }]`; quién ya lo recibió lo filtra el servicio.
 */
export const contractCycleAlerts = (contract, today) => {
    if (!contract || contract.status !== 'ACTIVO' || !isKey(contract.startDate) || !isKey(today)) return [];
    if (contract.startDate > today) return [];
    const alerts = [];
    const current = cycleForDate(today, contract.cutDay || 1);
    for (const cycle of [previousCycle(current, contract.cutDay || 1), current]) {
        if (cycle.end < contract.startDate) continue;
        if (contract.endDate && cycle.start > contract.endDate) continue;
        const close = cycleClose(cycle, contract);
        for (const [step, rule] of Object.entries(CYCLE_STEPS)) {
            if (rule.needsReport && !contract.monthlyReport) continue;
            const due = addDays(close, -rule.before);
            const until = rule.late ? addDays(close, rule.late) : close;
            if (today < due || today > until) continue;
            alerts.push({ step, cycleKey: cycle.start, audience: rule.audience, close, cycle });
        }
    }
    if (isKey(contract.endDate) && contract.endDate >= today) {
        const left = daysBetween(today, contract.endDate);
        const step = left <= RENEWAL_STEPS.RENOVACION_15.days ? 'RENOVACION_15' : left <= RENEWAL_STEPS.RENOVACION_30.days ? 'RENOVACION_30' : null;
        if (step) alerts.push({ step, cycleKey: `R:${contract.endDate}`, audience: RENEWAL_STEPS[step].audience, endDate: contract.endDate });
    }
    return alerts;
};

/** El texto de cada aviso. Sin cifras: la campana también llega al celular. */
export const cycleAlertText = (alert, clientName) => {
    const name = clientName || 'un cliente';
    switch (alert.step) {
        case 'REVISION': return `El mes de ${name} cierra el ${dayLabel(alert.close)}: revisa contenidos, jornadas y pendientes.`;
        case 'INFORME': return `El mes de ${name} cierra el ${dayLabel(alert.close)}: prepara el informe del mes.`;
        case 'FACTURACION': return `El mes de ${name} cierra el ${dayLabel(alert.close)}: revisa su facturación.`;
        case 'CIERRE': return `El mes de ${name} cerró el ${dayLabel(alert.close)}: consolida entregables e informes.`;
        case 'RENOVACION_30': return `El contrato de ${name} termina el ${dayLabel(alert.endDate)}: activa la gestión de renovación.`;
        case 'RENOVACION_15': return `El contrato de ${name} termina el ${dayLabel(alert.endDate)} y la renovación sigue pendiente.`;
        default: return `Aviso sobre ${name}.`;
    }
};

/** Más de tres avisos del mismo paso para una persona salen en uno solo. */
export const cycleDigestText = (step, count) => {
    switch (step) {
        case 'REVISION': return `${count} cuentas cierran el mes en tres días: revisa contenidos, jornadas y pendientes.`;
        case 'INFORME': return `${count} cuentas cierran el mes en dos días: prepara sus informes.`;
        case 'FACTURACION': return `${count} cuentas cierran el mes en dos días: revisa su facturación.`;
        case 'CIERRE': return `${count} cuentas cerraron el mes: consolida entregables e informes.`;
        case 'RENOVACION_30': return `${count} contratos terminan en menos de 30 días: activa su renovación.`;
        case 'RENOVACION_15': return `${count} contratos terminan en menos de 15 días y su renovación sigue pendiente.`;
        default: return `${count} avisos de cuentas.`;
    }
};
