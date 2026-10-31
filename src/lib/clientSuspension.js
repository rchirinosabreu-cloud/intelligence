// Suspender un cliente por cartera (punto 7 de la solicitud de Elisa; su respuesta del 30 de octubre de 2026).
//
// «Las suspensiones se generan a partir de si tienes dos meses y quince días vencidos. Se supone que la parrilla del mes
// siguiente se hace los días 15 del mes anterior … entonces ese mismo 15 se decide que, si no ha pagado, se termina el
// mes que va en curso, pero ya no se trabaja en la parrilla del mes siguiente, no importa incluso si llega a estar
// realizada: no se puede hacer parrilla ni producción.»
//
// Cuatro reglas salen de ahí y no se negocian:
// - **El mes en curso se termina.** La suspensión nunca toca la parrilla que el equipo está ejecutando hoy: empieza en la
//   siguiente. Lo ya publicado no se desarma.
// - **El mes siguiente se congela entero**, aunque su parrilla esté hecha y despachada (Rodny, 30 de octubre de 2026).
// - **No la decide la plataforma.** Desde el día 15 propone a quien lleva la cartera; suspender es de Administración o
//   Dirección y exige decir **quién lo autorizó** —la regla de la empresa es que lo autoriza Francisco— y por qué.
// - **Se levanta sola cuando el cliente se pone al día** (Rodny, 30 de octubre de 2026): si la deuda deja de cumplir la
//   condición, el equipo vuelve a trabajar sin que nadie tenga que acordarse. También se levanta a mano, con motivo,
//   para un acuerdo de pago.
//
// Lógica pura: la usan la pantalla, el servidor, el reloj que propone y las pruebas. Los días son días civiles de Bogotá
// («AAAA-MM-DD») y los ciclos son el mes de la parrilla («AAAA-MM»), que es como los identifica `ContentPlan`.
import { DEFAULT_COLLECTION_SETTINGS, overdueReceivables } from './receivableCollections.js';

export const SUSPENSION_MONTHS = 2;
export const SUSPENSION_EXTRA_DAYS = 15;
/** El día del mes en que se decide, porque es el día en que se empieza la parrilla del mes siguiente. */
export const SUSPENSION_DECISION_DAY = 15;
export const SUSPENSION_REASON_MAX = 300;
export const SUSPENSION_AUTHORIZED_BY_MAX = 120;

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const CYCLE = /^\d{4}-\d{2}$/;

const dayParts = (key) => String(key || '').split('-').map(Number);

/**
 * El último día de vencimiento que todavía cuenta como suspendible: dos meses y quince días antes de hoy. Se restan
 * meses de calendario, no 75 días fijos, porque la deuda son mensualidades; un 31 que no existe en el mes de destino
 * cae en su último día, como haría cualquiera contando a mano.
 */
export const suspensionThresholdDay = (today) => {
    if (!DAY.test(String(today || ''))) return null;
    const [year, month, day] = dayParts(today);
    const shifted = month - SUSPENSION_MONTHS;
    const targetYear = shifted > 0 ? year : year - 1;
    const targetMonth = shifted > 0 ? shifted : shifted + 12;
    const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
    const base = Date.UTC(targetYear, targetMonth - 1, Math.min(day, lastDay));
    return new Date(base - SUSPENSION_EXTRA_DAYS * 86400000).toISOString().slice(0, 10);
};

const daysBetween = (from, to) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);

/**
 * Si el cliente cumple hoy la condición para suspenderlo, lo que la sustenta; si no, null. Lee las mismas cuentas
 * vencidas que los avisos de cartera, así que un ajuste, una retención o un abono revertido cuentan igual en los dos
 * sitios. Una cuenta sin fecha de vencimiento no está vencida y no cuenta: no se llama mora a una deuda sin plazo.
 */
export const suspensionCandidate = ({ receivables = [], today, settings = DEFAULT_COLLECTION_SETTINGS } = {}) => {
    const limit = suspensionThresholdDay(today);
    if (!limit) return null;
    const overdue = overdueReceivables(receivables, today, settings);
    if (!overdue.length || overdue[0].dueDate > limit) return null;
    return {
        since: overdue[0].dueDate,
        days: daysBetween(overdue[0].dueDate, today),
        count: overdue.length,
        balanceCents: overdue.reduce((sum, item) => sum + item.balanceCents, 0),
        oldestPeriod: overdue[0].period,
        receivableIds: overdue.map((item) => item.id)
    };
};

export const cycleKey = (year, month) => `${year}-${String(month).padStart(2, '0')}`;

/** El primer mes congelado: el siguiente al que corre hoy, porque el que va en curso se termina. */
export const firstSuspendedCycle = ({ year, month } = {}) => {
    if (!Number.isInteger(year) || !Number.isInteger(month)) return null;
    return month === 12 ? cycleKey(year + 1, 1) : cycleKey(year, month + 1);
};

/** ¿La parrilla de ese mes está congelada por esta suspensión? */
export const isCycleSuspended = (suspension, { year, month } = {}) => {
    const from = String(suspension?.fromCycle || '');
    if (!CYCLE.test(from) || !Number.isInteger(year) || !Number.isInteger(month)) return false;
    return cycleKey(year, month) >= from;
};

const cycleLabel = (cycle) => {
    if (!CYCLE.test(String(cycle || ''))) return '';
    const [year, month] = dayParts(cycle);
    return `${MONTHS[month - 1]} de ${year}`;
};

const shortDay = (key) => {
    if (!DAY.test(String(key || ''))) return '';
    const [, month, day] = dayParts(key);
    return `${day} de ${MONTHS[month - 1]}`;
};

/**
 * Por qué no se puede trabajar en esa parrilla, en una frase, o null si sí se puede. Es lo que ve quien lo intenta: el
 * servidor la devuelve con el 409 y la pantalla la muestra antes de dejar pulsar.
 */
export const suspensionBlockReason = (suspension, { year, month } = {}, clientName = null) => {
    if (!isCycleSuspended(suspension, { year, month })) return null;
    const who = clientName || 'Este cliente';
    const authorized = String(suspension.authorizedBy || '').trim();
    return `${who} está suspendido por cartera desde el ${shortDay(suspension.suspendedOn)}`
        + `${authorized ? `, autorizado por ${authorized}` : ''}`
        + `: no se trabaja la parrilla de ${cycleLabel(cycleKey(year, month))} ni su producción hasta que se ponga al día.`;
};

/** Lo mismo para un pendiente de Gestión, que no es una parrilla sino el trabajo que salió de ella. */
export const suspendedTaskReason = (suspension, { year, month } = {}, clientName = null) => {
    if (!isCycleSuspended(suspension, { year, month })) return null;
    const who = clientName || 'Este cliente';
    return `${who} está suspendido por cartera: este pendiente es de la parrilla de ${cycleLabel(cycleKey(year, month))}, que quedó congelada.`;
};

/** Valida lo que hace falta para suspender: quién lo autorizó y por qué. Devuelve el problema en palabras o null. */
export const suspensionProblem = ({ authorizedBy, reason } = {}) => {
    const who = String(authorizedBy ?? '').trim();
    if (!who) return 'Escribe quién autorizó la suspensión.';
    if (who.length > SUSPENSION_AUTHORIZED_BY_MAX) return `El nombre de quien autoriza admite como máximo ${SUSPENSION_AUTHORIZED_BY_MAX} caracteres.`;
    const why = String(reason ?? '').trim();
    if (!why) return 'Escribe por qué se suspende.';
    if (why.length > SUSPENSION_REASON_MAX) return `El motivo admite como máximo ${SUSPENSION_REASON_MAX} caracteres.`;
    return null;
};

/** Valida el levantamiento a mano: solo pide el motivo. El que se levanta solo no pasa por aquí. */
export const liftProblem = ({ reason } = {}) => {
    const why = String(reason ?? '').trim();
    if (!why) return 'Escribe por qué se levanta la suspensión.';
    if (why.length > SUSPENSION_REASON_MAX) return `El motivo admite como máximo ${SUSPENSION_REASON_MAX} caracteres.`;
    return null;
};

const money = (cents) => `$${String(Math.round(cents / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

/**
 * La banda de quien lleva la cartera, desde el día 15: el cliente cumple la condición y hay que decidirlo con Francisco.
 * Es una propuesta, nunca una suspensión: la plataforma no suspende sola.
 */
export const suspensionCandidateNoticeText = (candidate, clientName, nextCycle) => ({
    kind: 'CARTERA_SUSPENSION',
    level: 'IMPORTANTE',
    label: 'Suspensión por cartera',
    message: `${clientName || 'Un cliente'} lleva ${plural(candidate.days, 'día', 'días')} vencido`
        + `${candidate.oldestPeriod ? ` desde ${cycleLabel(candidate.oldestPeriod)}` : ''}`
        + ` (${money(candidate.balanceCents)}): toca decidir si se hace la parrilla de ${cycleLabel(nextCycle)}`
});

/** La campana nunca lleva cifras: también llega al celular. */
export const suspensionCandidateBellText = (clientName, audience) => (audience === 'PM'
    ? `${clientName || 'Un cliente'} puede quedar suspendido por cartera: no empieces la parrilla del mes siguiente sin confirmar.`
    : `${clientName || 'Un cliente'} cumple la condición para suspenderlo por cartera. Revísalo con Francisco.`);

/** Lo que se le avisa al equipo cuando la suspensión ya se decidió. Sin cifras. */
export const suspensionStartedText = (clientName, suspension) => (
    `${clientName || 'Un cliente'} quedó suspendido por cartera: no se trabaja la parrilla de ${cycleLabel(suspension.fromCycle)} ni su producción.`
);

export const suspensionLiftedText = (clientName, suspension) => (
    `${clientName || 'Un cliente'} ya no está suspendido${suspension?.liftKind === 'PAGO' ? ': se puso al día' : ''}. Se puede retomar su parrilla.`
);

/** ¿Hoy toca proponer la suspensión? Desde el día 15, que es cuando se empieza la parrilla del mes siguiente. */
export const isDecisionDay = (today) => DAY.test(String(today || '')) && dayParts(today)[2] >= SUSPENSION_DECISION_DAY;
