// El informe del mes y el cierre del mes (punto 5 de la solicitud de Elisa; Rodny, 29 de octubre de 2026).
//
// - El informe pasa por pendiente, en elaboración, en revisión y enviado, con la fecha de cada cambio y, si se quiere,
//   el enlace al informe como soporte de entrega. Solo «enviado» cuenta como entregado.
// - El project manager confirma el cierre del mes desde tres días antes de que termine. Confirmar no borra nada: lo
//   que quedó pendiente sigue en ese mes y queda escrito en el cierre.
// La misma regla la leen la pantalla y el servidor.

export const REPORT_STATUSES = Object.freeze([
    { value: 'PENDIENTE', label: 'Pendiente' },
    { value: 'EN_ELABORACION', label: 'En elaboración' },
    { value: 'EN_REVISION', label: 'En revisión' },
    { value: 'ENVIADO', label: 'Enviado' }
]);
export const REPORT_LINK_MAX = 500;
export const CLOSE_NOTE_MAX = 300;
export const CLOSE_OPENS_DAYS_BEFORE = 3;

export const reportStatusLabel = (status) => REPORT_STATUSES.find((item) => item.value === status)?.label || 'Pendiente';
export const isReportSent = (report) => report?.status === 'ENVIADO';

/** Valida un cambio del informe. Devuelve el problema o null. */
export const reportProblem = ({ status, link, note } = {}) => {
    if (!REPORT_STATUSES.some((item) => item.value === status)) return 'Elige el estado del informe.';
    const url = String(link ?? '').trim();
    if (url) {
        if (url.length > REPORT_LINK_MAX) return `El enlace admite como máximo ${REPORT_LINK_MAX} caracteres.`;
        let parsed;
        try { parsed = new URL(url); } catch { return 'El enlace al informe tiene que empezar por https://.'; }
        if (!['https:', 'http:'].includes(parsed.protocol)) return 'El enlace al informe tiene que empezar por https://.';
    }
    if (String(note ?? '').trim().length > CLOSE_NOTE_MAX) return `La nota admite como máximo ${CLOSE_NOTE_MAX} caracteres.`;
    return null;
};

const addDays = (key, days) => new Date(Date.parse(`${key}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

/** Desde qué día se puede confirmar el cierre de un mes: tres días antes de que termine. */
export const closeOpensOn = (cycle) => addDays(cycle.end, -CLOSE_OPENS_DAYS_BEFORE);
export const canConfirmClose = (cycle, today) => Boolean(cycle?.end) && !cycle.close && today >= closeOpensOn(cycle);

/**
 * Lo que quedó al cerrar: piezas contratadas y publicadas, las que faltaron, las vencidas y en qué iba el informe.
 * Se guarda tal cual en el cierre, para que se lea igual aunque después se publique lo pendiente.
 */
export const closeSnapshot = (cycle, { monthlyReport = false } = {}) => {
    const quota = Number(cycle?.quota) || 0;
    const published = Number(cycle?.reached?.publicada) || 0;
    return {
        quota,
        published,
        missing: Math.max(quota - published, 0),
        overdue: Number(cycle?.overdueItems) || 0,
        report: monthlyReport ? (cycle?.report?.status || 'PENDIENTE') : null
    };
};

const pieces = (count) => `${count} ${count === 1 ? 'pieza' : 'piezas'}`;

/** «Quedaron 2 piezas por publicar y el informe en revisión», para la tarjeta y el historial. */
export const closeSummaryText = (snapshot) => {
    if (!snapshot) return '';
    const parts = [];
    if (snapshot.missing > 0) parts.push(`${pieces(snapshot.missing)} por publicar`);
    if (snapshot.report && snapshot.report !== 'ENVIADO') parts.push(`el informe ${reportStatusLabel(snapshot.report).toLowerCase()}`);
    if (!parts.length) return `Cerró completo: ${snapshot.published} de ${snapshot.quota} publicadas${snapshot.report === 'ENVIADO' ? ' y el informe enviado' : ''}.`;
    const plural = parts.length > 1 || snapshot.missing > 1;
    return `${plural ? 'Quedaron' : 'Quedó'} ${parts.join(' y ')}. ${plural ? 'Siguen' : 'Sigue'} en este mes.`;
};
