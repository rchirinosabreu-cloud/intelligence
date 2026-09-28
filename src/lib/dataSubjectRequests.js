import { addBusinessDays, businessDaysUntil } from './colombiaBusinessDays.js';

// Consultas y reclamos de titulares de datos (Ley 1581 de 2012, arts. 14 y 15),
// 27 de septiembre de 2026. Reglas puras: las usan el servidor y la pantalla.

export const DATA_REQUEST_TYPES = Object.freeze({
    CONSULTA: { label: 'Consulta', days: 10, extension: 5 },
    RECLAMO: { label: 'Reclamo', days: 15, extension: 8 }
});

export const DATA_REQUEST_REASONS = Object.freeze({
    CONSULTA: [['CONOCER', 'Conocer qué datos tenemos'], ['PRUEBA_AUTORIZACION', 'Prueba de la autorización'], ['USO', 'Uso que se ha dado a sus datos']],
    RECLAMO: [['ACTUALIZAR', 'Actualizar datos'], ['RECTIFICAR', 'Rectificar datos'], ['SUPRIMIR', 'Suprimir datos'], ['REVOCAR', 'Revocar la autorización'], ['INCUMPLIMIENTO', 'Presunto incumplimiento']]
});

export const DATA_REQUEST_CHANNELS = Object.freeze([['EMAIL', 'Correo'], ['TELEFONO', 'Teléfono'], ['PRESENCIAL', 'Presencial / escrito'], ['OTRO', 'Otro']]);

export const DATA_REQUEST_STATUSES = Object.freeze([
    ['RECIBIDA', 'Recibida'], ['EN_TRAMITE', 'En trámite'], ['INCOMPLETA', 'Incompleta (esperando al titular)'],
    ['RESPONDIDA', 'Respondida'], ['DESISTIDA', 'Desistida']
]);

const CLOSED = new Set(['RESPONDIDA', 'DESISTIDA']);
const TEXT_FIELDS = { requesterName: 180, requesterDocument: 40, contactEmail: 180, contactPhone: 40, description: 4000, extensionReason: 1000, responseSummary: 4000, responseEvidence: 1000, notes: 4000 };
const DATE_FIELDS = ['receivedOn', 'extendedOn', 'incompleteRequestedOn', 'completedOn', 'legendAddedOn', 'respondedOn'];
const ALLOWED = new Set(['type', 'reason', 'channel', 'status', ...Object.keys(TEXT_FIELDS), ...DATE_FIELDS]);

export const displayDay = (day) => (day ? day.split('-').reverse().join('/') : '');

export const dataRequestError =(message, status = 400, code = 'DATA_REQUEST_INVALID') => Object.assign(new Error(message), { status, code });

const validDay = (value) => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const addMonths = (day, months) => {
    const [y, m, d] = day.split('-').map(Number);
    const target = new Date(Date.UTC(y, m - 1 + months, 1));
    const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(d, last));
    return target.toISOString().slice(0, 10);
};

// Vencimiento sin prórroga; el reclamo completado cuenta desde que se completó.
const baseDue = (request) => {
    const type = DATA_REQUEST_TYPES[request.type];
    const start = request.type === 'RECLAMO' && request.completedOn ? request.completedOn : request.receivedOn;
    return addBusinessDays(start, type.days);
};

export function validateDataRequest(input, { today }) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw dataRequestError('Datos no válidos.');
    for (const key of Object.keys(input)) if (!ALLOWED.has(key)) throw dataRequestError(`Campo no permitido: ${key}.`);

    const request = {};
    if (!Object.hasOwn(DATA_REQUEST_TYPES, input.type)) throw dataRequestError('Elige si es una consulta o un reclamo.');
    request.type = input.type;
    if (!DATA_REQUEST_REASONS[input.type].some(([id]) => id === input.reason)) throw dataRequestError('El motivo no corresponde al tipo de solicitud.');
    request.reason = input.reason;
    if (!DATA_REQUEST_CHANNELS.some(([id]) => id === input.channel)) throw dataRequestError('Indica por qué canal llegó la solicitud.');
    request.channel = input.channel;
    const status = input.status || 'RECIBIDA';
    if (!DATA_REQUEST_STATUSES.some(([id]) => id === status)) throw dataRequestError('Estado no válido.');
    request.status = status;

    for (const [key, max] of Object.entries(TEXT_FIELDS)) {
        const value = input[key];
        if (value == null || value === '') { request[key] = null; continue; }
        if (typeof value !== 'string' || value.trim().length > max) throw dataRequestError(`Revisa el campo ${key}: texto demasiado largo o inválido.`);
        request[key] = value.trim();
    }
    for (const key of DATE_FIELDS) {
        const value = input[key];
        if (value == null || value === '') { request[key] = null; continue; }
        if (!validDay(value)) throw dataRequestError(`Fecha no válida: ${key}.`);
        if (value > today) throw dataRequestError('No registres una fecha futura.');
        request[key] = value;
    }

    if (!request.requesterName) throw dataRequestError('Indica el nombre del titular o de quien actúa por él.');
    if (!request.contactEmail && !request.contactPhone) throw dataRequestError('Indica al menos un dato de contacto para responder.');
    if (request.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(request.contactEmail)) throw dataRequestError('Correo de contacto no válido.');
    if (!request.description) throw dataRequestError('Describe qué pide el titular.');
    if (!request.receivedOn) throw dataRequestError('Indica la fecha en que se recibió la solicitud.');
    for (const key of DATE_FIELDS.filter((k) => k !== 'receivedOn')) {
        if (request[key] && request[key] < request.receivedOn) throw dataRequestError('Ninguna fecha puede ser anterior al recibo de la solicitud.');
    }

    const isClaim = request.type === 'RECLAMO';
    if (!isClaim && (request.status === 'INCOMPLETA' || request.status === 'DESISTIDA' || request.incompleteRequestedOn || request.completedOn)) {
        throw dataRequestError('Solo un reclamo puede quedar incompleto o desistido.');
    }
    if (request.status === 'INCOMPLETA' && !request.incompleteRequestedOn) throw dataRequestError('Indica cuándo se pidió al titular completar el reclamo.');
    if (request.completedOn && !request.incompleteRequestedOn) throw dataRequestError('Solo se completa un reclamo al que se le pidió información.');
    if (request.extendedOn) {
        if (!request.extensionReason) throw dataRequestError('Indica el motivo de la prórroga: la ley exige informarlo al titular.');
        if (request.extendedOn > baseDue(request)) throw dataRequestError('La prórroga se informa antes del vencimiento del plazo.');
    }
    if (request.status === 'RESPONDIDA' && (!request.respondedOn || !request.responseSummary || !request.responseEvidence)) {
        throw dataRequestError('Para cerrar como respondida registra la fecha, la respuesta y la evidencia del envío.');
    }
    if (request.status === 'DESISTIDA' && (!request.incompleteRequestedOn || addMonths(request.incompleteRequestedOn, 2) > today)) {
        throw dataRequestError('Un reclamo se entiende desistido solo después de dos meses sin que el titular lo complete.');
    }
    return request;
}

export function computeDeadlines(request, today) {
    const type = DATA_REQUEST_TYPES[request.type];
    const isClaim = request.type === 'RECLAMO';
    const open = !CLOSED.has(request.status);
    const paused = request.status === 'INCOMPLETA' && !request.completedOn;
    const base = baseDue(request);
    const dueOn = paused ? null : (request.extendedOn ? addBusinessDays(base, type.extension) : base);
    const daysLeft = open && dueOn ? businessDaysUntil(dueOn, today) : null;
    const legendDueOn = isClaim ? addBusinessDays(request.receivedOn, 2) : null;
    const alerts = [];

    if (open && isClaim && !request.legendAddedOn) {
        alerts.push(`Marca el dato con la leyenda «reclamo en trámite» (plazo: ${displayDay(legendDueOn)}).`);
    }
    // El vencimiento ya se muestra aparte; aquí solo lo que pide una acción distinta.
    if (open && daysLeft !== null && daysLeft >= 0 && daysLeft <= 2 && !request.extendedOn) {
        alerts.push(daysLeft === 0 ? 'Vence hoy: responde o informa hoy mismo la prórroga.' : `Vence en ${daysLeft} día(s) hábil(es): responde o informa la prórroga.`);
    }
    const desistOn = request.incompleteRequestedOn ? addMonths(request.incompleteRequestedOn, 2) : null;
    if (paused && desistOn && desistOn <= today) alerts.push('Pasaron dos meses sin respuesta: puede cerrarse como desistido.');

    return {
        open,
        dueOn,
        daysLeft,
        overdue: open && daysLeft !== null && daysLeft < 0,
        answeredLate: request.status === 'RESPONDIDA' && Boolean(dueOn) && request.respondedOn > dueOn,
        legendDueOn,
        incompleteRequestDueOn: isClaim ? addBusinessDays(request.receivedOn, 5) : null,
        desistOn,
        alerts
    };
}
