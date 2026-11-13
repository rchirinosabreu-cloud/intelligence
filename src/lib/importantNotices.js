// Avisos importantes (Rodny, 26 de octubre de 2026): el segundo nivel de notificaciones. No van a la campana sino a una
// banda abajo, de borde a borde, que se queda hasta que la persona decide. «Si hay otra notificación, aparecerá cinco
// minutos después de haber tomado una decisión con la anterior, no saldrán al tiempo.» El seguimiento va en verde y el
// salmón se reserva para lo más importante.
//
// Lógica pura: la usan el servidor, la banda y las pruebas.
import { bogotaDateKey } from './crmRules.js';
import { proposalReference } from './crmFollowUpAlerts.js';
export { clientOperationalNotices } from './clientOperationalNotices.js';

export const NOTICE_LEVELS = Object.freeze({
    IMPORTANTE: Object.freeze({ rank: 0, color: 'coral' }),
    SEGUIMIENTO: Object.freeze({ rank: 1, color: 'green' })
});

export const DECISION_GAP_MS = 5 * 60 * 1000;

// «En 7 días» (Elisa, 13 de noviembre de 2026): sin esa opción, pulsaba «mañana» todos los días sobre la misma
// deuda —14 veces en diez días— y el aviso volvía cada mañana. Es el mismo plazo con el que la cartera se repite.
export const SNOOZE_OPTIONS = Object.freeze([
    Object.freeze({ value: '10m', label: 'En 10 minutos' }),
    Object.freeze({ value: '1h', label: 'En 1 hora' }),
    Object.freeze({ value: 'tomorrow', label: 'Mañana a las 8:00' }),
    Object.freeze({ value: '7d', label: 'En 7 días' })
]);

// Cada opción es una gestión con el cliente del CRM (`CRM_ACTIVITY_TYPES` con `contact: true`): registrarla reinicia la
// cuenta de días sin respuesta.
export const FOLLOW_UP_CHANNELS = Object.freeze([
    Object.freeze({ value: 'WHATSAPP', label: 'WhatsApp' }),
    Object.freeze({ value: 'LLAMADA', label: 'Llamada' }),
    Object.freeze({ value: 'CORREO', label: 'Correo' }),
    Object.freeze({ value: 'REUNION', label: 'Reunión' }),
    Object.freeze({ value: 'RESPUESTA_CLIENTE', label: 'El cliente respondió' })
]);

export const isFollowUpChannel = (value) => FOLLOW_UP_CHANNELS.some((channel) => channel.value === value);

// «No sigue», en la revisión: las dos etapas de cierre del CRM. Perdida, el cliente no la tomó; descartada, no sigue por
// decisión nuestra (Rodny, 26 de octubre de 2026). Reunión del 4 de noviembre de 2026: con Andy «sí se hizo» —la
// propuesta terminó en trabajo— y faltaba poder decirlo.
export const REVIEW_OUTCOMES = Object.freeze([
    Object.freeze({ value: 'PERDIDO', label: 'Cliente no aprobó', stage: 'Cliente no aprobó', done: 'Se registró que el cliente no aprobó' }),
    Object.freeze({ value: 'DESCARTADO', label: 'Descartada', stage: 'Descartado', done: 'La oportunidad pasó a Descartado' }),
    Object.freeze({ value: 'GANADO', label: 'Ya es cliente', stage: 'Ganado', done: 'La oportunidad pasó a Ganado' })
]);

export const isReviewOutcome = (value) => REVIEW_OUTCOMES.some((outcome) => outcome.value === value);

// «Archivar» va a la vista en todo aviso del CRM, no dentro de «No sigue» (Rodny, 4 de noviembre de 2026): es guardar lo
// que ya no contesta, conservando sus datos, y vale también en los recordatorios de antes de la revisión.
export const NOTICE_ARCHIVE_OUTCOME = 'ARCHIVAR';

/** A dónde lleva el título del aviso: solo una dirección interna de la plataforma. */
export const noticeTitleHref = (notice) => {
    const url = notice?.url;
    return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') ? url : null;
};

const toDate = (value) => {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

/** Hasta cuándo se pospone, o null si la opción no existe. «Mañana» y «en 7 días» son días de Bogotá, a las 8:00. */
export const snoozeUntil = (option, now = new Date()) => {
    if (option === '10m') return new Date(now.getTime() + 10 * 60 * 1000);
    if (option === '1h') return new Date(now.getTime() + 60 * 60 * 1000);
    const days = option === 'tomorrow' ? 1 : option === '7d' ? 7 : null;
    if (days === null) return null;
    const today = new Date(`${bogotaDateKey(now)}T12:00:00Z`);
    const target = new Date(today.getTime() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return new Date(`${target}T08:00:00-05:00`);
};

const isOpen = (notice, now) => !notice.resolvedAt && (!toDate(notice.snoozedUntil) || toDate(notice.snoozedUntil) <= now);

const byUrgency = (a, b) => (NOTICE_LEVELS[a.level]?.rank ?? 9) - (NOTICE_LEVELS[b.level]?.rank ?? 9)
    || toDate(a.createdAt) - toDate(b.createdAt);

/**
 * El aviso que toca mostrar ahora y cuándo volver a mirar. Uno solo: primero lo importante y, a igual nivel, el más
 * antiguo. Después de una decisión (seguimiento, posponer, cerrar) el siguiente espera `DECISION_GAP_MS`.
 */
export const pickCurrentNotice = (notices = [], lastDecisionAt = null, now = new Date()) => {
    const pending = notices.filter((notice) => !notice.resolvedAt);
    const wakeUps = pending.map((notice) => toDate(notice.snoozedUntil)).filter((date) => date && date > now);
    const gapEnds = toDate(lastDecisionAt) ? new Date(toDate(lastDecisionAt).getTime() + DECISION_GAP_MS) : null;
    const open = pending.filter((notice) => isOpen(notice, now)).sort(byUrgency);
    if (open.length && gapEnds && gapEnds > now) return { notice: null, nextAt: gapEnds };
    const nextAt = wakeUps.length ? new Date(Math.min(...wakeUps.map((date) => date.getTime()))) : null;
    return { notice: open[0] || null, nextAt };
};

/** Lo que dice la banda de una alerta comercial: quién, cuántos días y qué propuesta, sin la orden del final. */
export const followUpNoticeText = (lead, alert, quotationCode = null) => {
    const who = lead.company || lead.contactName || 'La oportunidad';
    const what = proposalReference(lead, quotationCode);
    return alert.kind === 'REVIEW'
        ? { kind: 'CRM_REVIEW', level: 'IMPORTANTE', label: `Revisión · ${alert.step ?? alert.days} días`, message: `${who} lleva ${alert.days} días sin responder ${what}: ¿sigue o no?` }
        : { kind: 'CRM_FOLLOW_UP', level: 'SEGUIMIENTO', label: 'Seguimiento comercial', message: `${who} lleva ${alert.days} días sin responder ${what}` };
};
