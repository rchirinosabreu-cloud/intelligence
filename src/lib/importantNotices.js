// Avisos importantes (Rodny, 26 de octubre de 2026): el segundo nivel de notificaciones. No van a la campana sino a una
// banda abajo, de borde a borde, que se queda hasta que la persona decide. «Si hay otra notificación, aparecerá cinco
// minutos después de haber tomado una decisión con la anterior, no saldrán al tiempo.» El seguimiento va en verde y el
// salmón se reserva para lo más importante.
//
// Lógica pura: la usan el servidor, la banda y las pruebas.
import { bogotaDateKey } from './crmRules.js';

export const NOTICE_LEVELS = Object.freeze({
    IMPORTANTE: Object.freeze({ rank: 0, color: 'coral' }),
    SEGUIMIENTO: Object.freeze({ rank: 1, color: 'green' })
});

export const DECISION_GAP_MS = 5 * 60 * 1000;

export const SNOOZE_OPTIONS = Object.freeze([
    Object.freeze({ value: '10m', label: 'En 10 minutos' }),
    Object.freeze({ value: '1h', label: 'En 1 hora' }),
    Object.freeze({ value: 'tomorrow', label: 'Mañana a las 8:00' })
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

const toDate = (value) => {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

/** Hasta cuándo se pospone, o null si la opción no existe. «Mañana» es el día siguiente en Bogotá, a las 8:00. */
export const snoozeUntil = (option, now = new Date()) => {
    if (option === '10m') return new Date(now.getTime() + 10 * 60 * 1000);
    if (option === '1h') return new Date(now.getTime() + 60 * 60 * 1000);
    if (option !== 'tomorrow') return null;
    const today = new Date(`${bogotaDateKey(now)}T12:00:00Z`);
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return new Date(`${tomorrow}T08:00:00-05:00`);
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

/** Lo que dice la banda de una alerta comercial: quién, cuántos días y qué cotización, sin la orden del final. */
export const followUpNoticeText = (lead, alert, quotationCode = null) => {
    const who = lead.company || lead.contactName || 'La oportunidad';
    const what = quotationCode ? `la ${quotationCode}` : 'la propuesta';
    return alert.kind === 'REVIEW'
        ? { kind: 'CRM_REVIEW', level: 'IMPORTANTE', label: `Revisión · ${alert.step ?? alert.days} días`, message: `${who} lleva ${alert.days} días sin responder: ¿sigue o se cierra?` }
        : { kind: 'CRM_FOLLOW_UP', level: 'SEGUIMIENTO', label: 'Seguimiento comercial', message: `${who} lleva ${alert.days} días sin responder ${what}` };
};
