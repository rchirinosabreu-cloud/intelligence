// Alertas comerciales (punto 2 de la solicitud de Elisa, 20 de octubre de 2026: «generar recordatorios a los 5, 10, 15
// y 20 días sin respuesta y una revisión a los 30 días. Los tiempos serán configurables y las alertas se actualizarán
// según las gestiones registradas»). Rodny, 26 de octubre de 2026: cualquier gestión registrada reinicia la cuenta, los
// días los cambia un administrador y la revisión de los 30 también les llega a los administradores.
//
// Lógica pura: la usan el reloj que avisa, la lista del CRM y las pruebas.
import { CRM_ACTIVITY_TYPES, daysBetween } from './crmRules.js';
import { inferAreasFromCargo } from './teamAreas.js';

export const DEFAULT_FOLLOW_UP_ALERT_DAYS = Object.freeze({ reminders: Object.freeze([5, 10, 15, 20]), review: 30 });

// Las etapas en que se está esperando al cliente después de una propuesta.
export const FOLLOW_UP_ALERT_STAGES = Object.freeze(['PROPUESTA_ENVIADA', 'NEGOCIACION', 'ESPERANDO_CLIENTE', 'SIN_RESPUESTA']);

export const FOLLOW_UP_DAY_MIN = 1;
export const FOLLOW_UP_DAY_MAX = 90;
export const FOLLOW_UP_REMINDERS_MAX = 6;

// Una gestión con el cliente es lo que el CRM ya cuenta como contacto: llamada, correo, WhatsApp, LinkedIn, reunión,
// propuesta enviada o una respuesta suya. Una nota o un cambio de etapa no lo son.
const CONTACT_TYPES = new Set(CRM_ACTIVITY_TYPES.filter((type) => type.contact).map((type) => type.value));

const toDate = (value) => {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * Desde cuándo y cuántos días lleva la oportunidad sin una gestión con el cliente, o null si no se está esperando nada:
 * sin propuesta enviada, archivada o fuera de las etapas de espera.
 */
export const followUpSilence = (lead, activities = [], now = new Date()) => {
    if (!lead || lead.archivedAt || !FOLLOW_UP_ALERT_STAGES.includes(lead.stage)) return null;
    let since = toDate(lead.proposalSentAt);
    if (!since) return null;
    for (const activity of activities) {
        if (!CONTACT_TYPES.has(activity.type)) continue;
        const at = toDate(activity.occurredAt);
        if (at && at > since) since = at;
    }
    const days = daysBetween(since, now);
    return days === null ? null : { since, days: Math.max(0, days) };
};

/** Los días válidos de un administrador, o el motivo en palabras. */
export const normalizeFollowUpAlertDays = (input = {}) => {
    const numbers = (Array.isArray(input.reminders) ? input.reminders : []).map((value) => Number(value));
    const review = Number(input.review);
    if (!numbers.length) return { value: null, problem: 'Deja al menos un recordatorio.' };
    if ([...numbers, review].some((value) => !Number.isInteger(value) || value < FOLLOW_UP_DAY_MIN || value > FOLLOW_UP_DAY_MAX)) {
        return { value: null, problem: `Los días van entre ${FOLLOW_UP_DAY_MIN} y ${FOLLOW_UP_DAY_MAX}, en números enteros.` };
    }
    const reminders = [...new Set(numbers)].sort((a, b) => a - b);
    if (reminders.length > FOLLOW_UP_REMINDERS_MAX) return { value: null, problem: 'Como máximo seis recordatorios.' };
    if (review <= reminders.at(-1)) return { value: null, problem: 'La revisión va después del último recordatorio.' };
    return { value: { reminders, review }, problem: null };
};

const sameCycle = (sent, since) => Boolean(sent?.since) && toDate(sent.since)?.getTime() === since.getTime();

/**
 * El aviso que toca ahora, o null. Sale el último alcanzado y una sola vez por ciclo; si el reloj se saltó días, no se
 * mandan en tanda los atrasados. `followUpAlerts` de la oportunidad guarda el ciclo ({ since, steps }).
 */
export const dueFollowUpAlert = (lead, activities = [], now = new Date(), settings = DEFAULT_FOLLOW_UP_ALERT_DAYS) => {
    const silence = followUpSilence(lead, activities, now);
    if (!silence) return null;
    const sent = sameCycle(lead.followUpAlerts, silence.since) ? lead.followUpAlerts.steps || [] : [];
    const steps = [...settings.reminders, settings.review];
    const reached = steps.filter((step) => step <= silence.days);
    const step = reached.at(-1);
    if (step === undefined || sent.includes(step)) return null;
    return { kind: step === settings.review ? 'REVIEW' : 'REMINDER', step, days: silence.days, since: silence.since, steps: reached };
};

/** Lo que se guarda en la oportunidad después de avisar: el ciclo y los pasos ya cubiertos. */
export const markFollowUpAlertSent = (previous, alert) => {
    const kept = sameCycle(previous, alert.since) ? previous.steps || [] : [];
    return { since: alert.since.toISOString(), steps: [...new Set([...kept, ...alert.steps])].sort((a, b) => a - b) };
};

// A quién le llegan (Rodny, 28 de octubre de 2026: «la alerta del CRM solo debe aparecerle a Francys o a quien tenga rol
// textual de Comercial, Relaciones Públicas o Comercial y Relaciones Públicas»). Manda el área de Equipo
// (`memberHasArea(member, 'COMERCIAL')`, `src/lib/teamAreas.js`), no el rol de la cuenta: ni la dirección ni los
// project managers reciben alertas comerciales. Sin área elegida, se deduce del cargo escrito.

/** ¿El cargo escrito es comercial? Comercial o Relaciones Públicas, con o sin tilde. */
export const isCommercialRole = (role) => inferAreasFromCargo(role).includes('COMERCIAL');

/** El responsable si es comercial; si no lo es, o no hay, todo el equipo comercial. Sin equipo comercial, nadie. */
export const followUpRecipients = (ownerUserId, commercialUserIds = []) => (
    ownerUserId && commercialUserIds.includes(ownerUserId) ? [ownerUserId] : [...commercialUserIds]
);

// Más de tres avisos del mismo tipo para la misma persona en un pase salen en uno solo que los resume (al estrenarse,
// el 26 de octubre de 2026, el primer pase habría mandado 62 avisos de golpe).
export const FOLLOW_UP_DIGEST_THRESHOLD = 3;

/** El aviso que resume varios: cuántas oportunidades y qué hacer, con el CRM filtrado en ellas. */
export const followUpDigest = (kind, count, settings = DEFAULT_FOLLOW_UP_ALERT_DAYS) => (kind === 'REVIEW'
    ? { message: `${count} oportunidades llevan ${settings.review} días o más sin respuesta: revisa cuáles siguen y cuáles se cierran.`, url: '/crm?tab=oportunidades&silence=REVISION' }
    : { message: `${count} oportunidades piden seguimiento: llevan ${settings.reminders[0]} días o más sin respuesta.`, url: '/crm?tab=oportunidades&silence=SIN_RESPUESTA' });

/** La línea del aviso: quién, cuántos días y qué cotización. */
export const followUpAlertMessage = (lead, alert, quotationCode = null) => {
    const who = lead.company || lead.contactName || 'La oportunidad';
    const what = quotationCode ? `la ${quotationCode}` : 'la propuesta';
    return alert.kind === 'REVIEW'
        ? `${who} lleva ${alert.days} días sin responder ${what}: revisa si sigue o se cierra.`
        : `${who} lleva ${alert.days} días sin responder ${what}. Haz seguimiento.`;
};
