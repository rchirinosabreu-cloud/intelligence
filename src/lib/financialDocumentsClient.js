import axios from 'axios';
import { getApiBaseUrl } from './apiBaseUrl.js';

// Comprobantes de un movimiento desde cualquier pantalla de Financiero (5 de octubre de 2026):
// Nómina, Cartera y Movimientos suben y abren los soportes por aquí. El servidor los acepta en
// cualquier movimiento, aunque esté bloqueado: son evidencia, no cambian el dinero.

export const FINANCIAL_DOCUMENT_MAX_BYTES = 25 * 1024 * 1024;
const DOCUMENT_EXTENSIONS = /\.(pdf|jpe?g|png)$/i;
export const FINANCIAL_DOCUMENT_ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';

const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('authToken')}` });
const recordUrl = (recordId, path = '') => `${getApiBaseUrl()}/api/financials/records/${recordId}/documents${path}`;

/**
 * El movimiento al que pertenece un documento. Manda el del propio documento: un movimiento
 * recién creado todavía no está en el formulario (Elisa, 6 de octubre de 2026: la pantalla se
 * caía al añadir un movimiento con fotos, porque se leía `editingRecord.id` con el formulario
 * aún en modo «nuevo»). Sin número no se pide nada.
 */
export const documentRecordId = (document, editingRecord) => document?.recordId || editingRecord?.id || null;

/** El aviso que se da antes de subir un comprobante que el servidor va a rechazar. */
export const financialDocumentProblem = (file) => {
    if (!file) return null;
    if (!DOCUMENT_EXTENSIONS.test(file.name || '')) return `${file.name}: solo se admiten PDF, JPG o PNG.`;
    if (file.size === 0) return `${file.name}: el archivo está vacío.`;
    if (file.size > FINANCIAL_DOCUMENT_MAX_BYTES) return `${file.name}: supera el máximo de 25 MB.`;
    return null;
};

export const uploadRecordDocument = async (recordId, file) => {
    const body = new FormData();
    body.append('file', file, file.name);
    const { data } = await axios.post(recordUrl(recordId), body, { headers: authHeaders() });
    return data?.document;
};

export const fetchRecordDocumentBlob = async (recordId, document) => {
    const response = await axios.get(recordUrl(recordId, `/${document.id}/file`), { headers: authHeaders(), responseType: 'blob' });
    return response.data instanceof Blob ? response.data : new Blob([response.data], { type: document.mimeType });
};
