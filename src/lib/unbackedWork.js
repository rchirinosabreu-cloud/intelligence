// Trabajo en curso sin propuesta aprobada (punto 5 de la solicitud de Elisa; Rodny, 29 de octubre de 2026: «sí,
// constrúyelo así»). Un cliente con tareas abiertas o parrilla del mes, pero sin un contrato que lo respalde —no tiene
// contrato cargado, el suyo ya venció o está terminado—, se está trabajando sin una propuesta aprobada. Antes eso salía
// en gris («sin medir») o como un motivo más entre otros; ahora es un motivo propio del semáforo y Dirección recibe un
// aviso. Dirección o Administración pueden autorizar seguir trabajando hasta una fecha, con motivo: mientras esa
// autorización esté vigente no se avisa y el semáforo lo dice.
//
// Un contrato en stand by no cuenta: es una pausa decidida. La salida normal es renovar el contrato en la ficha
// operativa o aprobar una cotización nueva, que abre la formalización.

export const AUTHORIZATION_REASON_MAX = 300;
export const AUTHORIZATION_MAX_DAYS = 120;

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const short = (key) => {
    const [, month, day] = String(key || '').split('-').map(Number);
    return month && day ? `${day} ${MONTHS[month - 1]}` : '';
};
const addDays = (key, days) => new Date(Date.parse(`${key}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

/** Por qué el contrato no respalda el trabajo de hoy, o null si lo respalda (o está en stand by). */
export const contractGap = (contract, today) => {
    if (!contract) return 'SIN_CONTRATO';
    if (contract.status === 'STAND_BY') return null;
    if (contract.status === 'TERMINADO') return 'TERMINADO';
    if (contract.endDate && contract.endDate < today) return 'VENCIDO';
    return null;
};

/** Una autorización sigue vigente hasta su fecha, inclusive. */
export const authorizationActive = (authorization, today) => Boolean(authorization?.until && authorization.until >= today);

const tasksText = (count) => (count === 1 ? '1 tarea abierta' : `${count} tareas abiertas`);
const workText = ({ openTasks = 0, plans = [] }) => [
    openTasks > 0 ? tasksText(openTasks) : null,
    plans.length ? `parrilla de ${plans.join(' y ')}` : null
].filter(Boolean).join(' y ');

/**
 * El trabajo sin respaldo de un cliente, o null. `work` es `{ openTasks, plans }`: las tareas abiertas y los meses
 * (en palabras) de las parrillas del mes en curso o del siguiente que tienen piezas.
 */
export const unbackedWork = ({ contract, work = {}, authorization = null }, today) => {
    const gap = contractGap(contract, today);
    if (!gap) return null;
    const busy = (work.openTasks || 0) > 0 || (work.plans || []).length > 0;
    if (!busy) return null;
    const what = workText(work);
    const why = gap === 'SIN_CONTRATO'
        ? 'sin contrato cargado'
        : gap === 'TERMINADO' ? 'con el contrato terminado' : `con el contrato vencido desde el ${short(contract.endDate)}`;
    if (authorizationActive(authorization, today)) {
        return {
            gap, authorized: true, what,
            text: `${authorization.byName || 'Dirección'} autorizó seguir trabajando sin propuesta aprobada hasta el ${short(authorization.until)}: ${String(authorization.reason || '').trim().replace(/[.\s]+$/, '')}.`
        };
    }
    return { gap, authorized: false, what, text: `Se está trabajando ${why}: ${what}.` };
};

/** El aviso a Dirección. Sin cifras de dinero: la campana también llega al celular. */
export const unbackedWorkNoticeText = (clientName, finding) => (
    `${clientName || 'Un cliente'} tiene trabajo en curso sin propuesta aprobada (${finding.what}): renueva el contrato o autoriza seguir.`
);

/** Valida la autorización: motivo obligatorio y una fecha entre hoy y cuatro meses. Devuelve el problema o null. */
export const authorizationProblem = ({ until, reason } = {}, today) => {
    const why = String(reason ?? '').trim();
    if (!why) return 'Escribe por qué se sigue trabajando sin propuesta aprobada.';
    if (why.length > AUTHORIZATION_REASON_MAX) return `El motivo admite como máximo ${AUTHORIZATION_REASON_MAX} caracteres.`;
    const day = String(until ?? '').trim();
    if (!DAY.test(day) || Number.isNaN(Date.parse(`${day}T12:00:00Z`))) return 'Elige hasta qué fecha se autoriza.';
    if (today && day < today) return 'La fecha no puede estar en el pasado.';
    if (today && day > addDays(today, AUTHORIZATION_MAX_DAYS)) return `Se autoriza como máximo por ${AUTHORIZATION_MAX_DAYS} días; después se vuelve a revisar.`;
    return null;
};
