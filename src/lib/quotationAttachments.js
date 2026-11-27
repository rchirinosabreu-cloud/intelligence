// Adjuntos de la propuesta (Rodny, 27 de noviembre de 2026: «¿hay un lugar para adjuntar archivos y poder enviar eso
// cuando envío la cotización? … que sean como adjuntos en el correo»). Lógica pura: la usan el servidor (correo) y la
// pantalla (el aviso), así los dos deciden igual qué archivo va adjunto y cuál va como enlace de descarga.
//
// El tope del correo: Rodny pidió que lo que pase de ese tope vaya como enlace, con un aviso sencillo (no una
// confirmación). El correo sale por el SMTP de Gmail, que rechaza mensajes de más de 25 MB contando la codificación de
// los adjuntos (un tercio más). Por eso el tope real de archivos es 15 MB, con el PDF de la propuesta incluido.

export const MAX_QUOTATION_FILES = 10;
export const MAX_QUOTATION_FILE_BYTES = 50 * 1024 * 1024;
export const QUOTATION_EMAIL_ATTACHMENTS_MAX_BYTES = 15 * 1024 * 1024;
// Lo que se reserva para el PDF de la propuesta, que viaja siempre adjunto.
export const QUOTATION_PDF_RESERVE_BYTES = 1024 * 1024;

const MB = 1024 * 1024;
export const formatFileSize = (bytes) => {
    const value = Number(bytes) || 0;
    if (value >= MB) return `${(value / MB).toLocaleString('es-CO', { maximumFractionDigits: 1 })} MB`;
    return `${Math.max(1, Math.round(value / 1024)).toLocaleString('es-CO')} KB`;
};

export const QUOTATION_EMAIL_LIMIT_LABEL = formatFileSize(QUOTATION_EMAIL_ATTACHMENTS_MAX_BYTES);

/**
 * Qué archivos caben adjuntos en el correo y cuáles van como enlace. En el orden de la propuesta: cada archivo entra
 * adjunto si con él el correo sigue dentro del tope; si no, va como enlace y se prueba con el siguiente.
 */
export const splitEmailAttachments = (files = [], { pdfBytes = QUOTATION_PDF_RESERVE_BYTES, limit = QUOTATION_EMAIL_ATTACHMENTS_MAX_BYTES } = {}) => {
    const attached = [];
    const linked = [];
    let used = Math.max(0, Number(pdfBytes) || 0);
    for (const file of files) {
        const size = Number(file?.size) || 0;
        if (used + size <= limit) { attached.push(file); used += size; } else linked.push(file);
    }
    return { attached, linked };
};
