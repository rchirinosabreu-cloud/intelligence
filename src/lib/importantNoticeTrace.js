// Lo que pasa con las alertas comerciales y la banda de avisos importantes, dicho en frases para la trazabilidad de
// Salud operativa y para los registros de Railway (Rodny, 27 de octubre de 2026: «quiero que los logs guarden todos
// esos eventos»). Una sola fuente de las frases: la usan el servidor al registrar y el panel al leer.
//
// Lógica pura.

export const NOTICE_TRACE_EVENTS = Object.freeze({
    ALERTS_SENT: 'CRM_FOLLOW_UP_ALERTS_SENT',
    // Avisos de cartera (punto 7 de la solicitud de Elisa, 28 de octubre de 2026).
    COLLECTION_ALERTS_SENT: 'COLLECTION_ALERTS_SENT',
    SHOWN: 'IMPORTANT_NOTICE_SHOWN',
    FOLLOWED_UP: 'IMPORTANT_NOTICE_FOLLOWED_UP',
    SNOOZED: 'IMPORTANT_NOTICE_SNOOZED',
    CLOSED: 'IMPORTANT_NOTICE_CLOSED',
    CLEARED: 'IMPORTANT_NOTICE_CLEARED'
});

export const NOTICE_TRACE_TYPES = Object.freeze(Object.values(NOTICE_TRACE_EVENTS));

// Los que no tienen autor: los hace la plataforma y se leen por la persona a la que le pasaron.
export const NOTICE_SYSTEM_TRACE_TYPES = Object.freeze([
    NOTICE_TRACE_EVENTS.ALERTS_SENT, NOTICE_TRACE_EVENTS.COLLECTION_ALERTS_SENT, NOTICE_TRACE_EVENTS.SHOWN, NOTICE_TRACE_EVENTS.CLEARED
]);

export const NOTICE_TRACE_LABELS = Object.freeze({
    [NOTICE_TRACE_EVENTS.ALERTS_SENT]: 'Alertas comerciales',
    [NOTICE_TRACE_EVENTS.COLLECTION_ALERTS_SENT]: 'Avisos de cartera',
    [NOTICE_TRACE_EVENTS.SHOWN]: 'Aviso en la banda',
    [NOTICE_TRACE_EVENTS.FOLLOWED_UP]: 'Ya hice seguimiento',
    [NOTICE_TRACE_EVENTS.SNOOZED]: 'Recordarme',
    [NOTICE_TRACE_EVENTS.CLOSED]: 'No sigue',
    [NOTICE_TRACE_EVENTS.CLEARED]: 'Aviso atendido'
});

const CHANNEL_PHRASES = { WHATSAPP: 'por WhatsApp', LLAMADA: 'por llamada', CORREO: 'por correo', REUNION: 'en una reunión' };
const SNOOZE_PHRASES = { '10m': 'por 10 minutos', '1h': 'por 1 hora', tomorrow: 'hasta mañana a las 8:00' };
const OUTCOME_PHRASES = { PERDIDO: 'perdida', DESCARTADO: 'descartada' };
const CLEARED_REASONS = {
    GESTION: 'ya se registró una gestión con el cliente en el CRM',
    ETAPA: 'la oportunidad ya no espera respuesta del cliente',
    INACTIVA: 'la oportunidad ya no está activa en el CRM',
    // Rodny, 28 de octubre de 2026: las alertas del CRM son solo del equipo comercial.
    REASIGNADO: 'el seguimiento le corresponde al equipo comercial',
    AL_DIA: 'el cliente se puso al día con lo que tenía vencido'
};

const isCollectionNotice = (meta) => String(meta?.kind || '').startsWith('CARTERA_');

const collectionAlertsSent = (metadata, subject) => {
    const total = count(metadata.alerts);
    const delivery = joinAnd([
        count(metadata.bell) && plural(count(metadata.bell), 'aviso en la campana', 'avisos en la campana'),
        count(metadata.band) && `${count(metadata.band)} en la banda`
    ]) || 'no se pudieron entregar';
    if (total === 1 && metadata.subject) return `Le llegó a ${subject} el aviso de cartera de ${metadata.subject}: ${delivery}.`;
    return `Le ${total === 1 ? 'llegó' : 'llegaron'} a ${subject} ${plural(total, 'aviso de cartera', 'avisos de cartera')}: ${delivery}.`;
};

const count = (value) => Math.max(0, Number(value) || 0);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const joinAnd = (parts) => parts.filter(Boolean).join(' y ');

const alertsSent = (metadata, subject) => {
    const reviews = count(metadata.reviews);
    const reminders = count(metadata.reminders);
    const delivery = joinAnd([
        count(metadata.bell) && plural(count(metadata.bell), 'aviso en la campana', 'avisos en la campana'),
        count(metadata.band) && `${count(metadata.band)} en la banda`
    ]) || 'no se pudieron entregar';
    if (reviews + reminders === 1 && metadata.subject) {
        return `Le llegó a ${subject} la alerta comercial de ${metadata.subject} (${reviews ? 'revisión' : 'recordatorio'}): ${delivery}.`;
    }
    const detail = joinAnd([
        reviews && plural(reviews, 'revisión', 'revisiones'),
        reminders && plural(reminders, 'recordatorio', 'recordatorios')
    ]);
    const total = reviews + reminders;
    const head = total === 1 ? `Le llegó a ${subject} 1 alerta comercial` : `Le llegaron a ${subject} ${total} alertas comerciales`;
    return `${head} (${detail}): ${delivery}.`;
};

/** La frase de un evento de las alertas o de la banda. `actor` decide; `subject` es la persona a la que le pasó. */
export const noticeTraceDescription = (eventType, metadata = {}, { actor = 'Alguien', subject = 'un miembro del equipo' } = {}) => {
    const meta = metadata || {};
    const who = meta.subject || 'la oportunidad';
    switch (eventType) {
        case NOTICE_TRACE_EVENTS.ALERTS_SENT: return alertsSent(meta, subject);
        case NOTICE_TRACE_EVENTS.COLLECTION_ALERTS_SENT: return collectionAlertsSent(meta, subject);
        case NOTICE_TRACE_EVENTS.SHOWN: return `Se le mostró a ${subject} en la banda: «${meta.message || who}».`;
        case NOTICE_TRACE_EVENTS.FOLLOWED_UP:
            if (isCollectionNotice(meta)) {
                const client = meta.subject || 'el cliente';
                return meta.channel === 'RESPUESTA_CLIENTE'
                    ? `${actor} anotó desde el aviso de cartera que ${client} respondió.`
                    : `${actor} registró una gestión de cobro${CHANNEL_PHRASES[meta.channel] ? ` ${CHANNEL_PHRASES[meta.channel]}` : ''} con ${client}.`;
            }
            return meta.channel === 'RESPUESTA_CLIENTE'
                ? `${actor} anotó desde el aviso que ${who} respondió.`
                : `${actor} registró un seguimiento${CHANNEL_PHRASES[meta.channel] ? ` ${CHANNEL_PHRASES[meta.channel]}` : ''} desde el aviso de ${who}.`;
        case NOTICE_TRACE_EVENTS.SNOOZED: return `${actor} pospuso el aviso de ${who} ${SNOOZE_PHRASES[meta.option] || 'para más tarde'}.`;
        case NOTICE_TRACE_EVENTS.CLOSED: return `${actor} marcó ${who} como ${OUTCOME_PHRASES[meta.outcome] || 'cerrada'} desde el aviso de revisión.`;
        case NOTICE_TRACE_EVENTS.CLEARED: {
            const reason = isCollectionNotice(meta) && meta.reason === 'GESTION' ? 'ya se registró una gestión de cobro con el cliente' : CLEARED_REASONS[meta.reason];
            return `Salió de la banda de ${subject} el aviso de ${who}: ${reason || 'ya no hacía falta'}.`;
        }
        default: return 'Actividad registrada.';
    }
};

/** El enlace del evento: a una oportunidad del CRM o a Cuentas por cobrar. */
export const noticeTraceLink = (metadata) => {
    const url = metadata?.url;
    if (typeof url !== 'string') return null;
    if (url.startsWith('/crm/')) return { url, label: metadata.subject || 'Abrir en el CRM' };
    if (url.startsWith('/financiero')) return { url, label: metadata.subject || 'Abrir Cuentas por cobrar' };
    return null;
};

/** Lo que se guarda de un aviso en la traza: nunca más que esto. */
export const noticeTraceMetadata = (notice, subject, extra = {}) => ({
    noticeId: notice.id, kind: notice.kind, subject: subject || null, url: notice.url || null, message: notice.message || null, ...extra
});
