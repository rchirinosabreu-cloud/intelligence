import { FINANCIAL_CATEGORY_OPTIONS } from './financialCategories.js';

// Terceros y cuentas por pagar (Rodny, 20 de octubre de 2026: «arranca con las cuentas por pagar
// y los terceros»). Un tercero es a quien Brain Studio le debe o le paga: proveedores, el equipo
// (sus cuentas de cobro a Brain Studio), el arrendador, un socio u otro. Una cuenta por pagar es
// un documento recibido de un tercero —factura, cuenta de cobro, recibo— con su valor, su fecha y
// su vencimiento; pagarla crea el egreso en Movimientos ligado a ella, igual que un abono de
// cartera crea el ingreso. Nómina sigue aparte. Esta regla la leen la pantalla y el servidor.

// Las clases que pide la solicitud de Elisa (punto 1): proveedor, contratista (presta un servicio por contrato,
// como un fotógrafo o un editor por proyecto), outsourcing (una empresa a la que se le delega una función que no
// se hace en casa, como la contabilidad), el equipo, el arrendador, un socio u otro. `role` es como se nombra en
// Terceros, donde la fila ya dice que es de un tercero.
export const THIRD_PARTY_KINDS = Object.freeze([
    { value: 'PROVEEDOR', label: 'Proveedor' },
    { value: 'CONTRATISTA', label: 'Contratista' },
    { value: 'OUTSOURCING', label: 'Outsourcing' },
    { value: 'COLABORADOR', label: 'Colaborador del equipo', role: 'Colaborador' },
    { value: 'ARRENDADOR', label: 'Arrendador' },
    { value: 'SOCIO', label: 'Socio' },
    { value: 'OTRO', label: 'Otro tercero' }
]);
// A quienes se les paga un servicio: cuentan juntos en las cifras de Terceros.
export const SERVICE_PROVIDER_KINDS = Object.freeze(['PROVEEDOR', 'CONTRATISTA', 'OUTSOURCING']);

export const PAYABLE_STATUSES = Object.freeze([
    { value: 'POR_PAGAR', label: 'Por pagar' },
    { value: 'PARCIAL', label: 'Pago parcial' },
    { value: 'PAGADA', label: 'Pagada' },
    { value: 'ANULADA', label: 'Anulada' }
]);

// Lo que se le debe a un tercero nunca es un préstamo: eso vive en Cartera como cuenta por cobrar.
export const PAYABLE_CATEGORY_OPTIONS = Object.freeze(FINANCIAL_CATEGORY_OPTIONS.filter(([value]) => value !== 'PRESTAMO'));

export const THIRD_PARTY_NAME_MAX = 120;
export const PAYABLE_CONCEPT_MAX = 300;
export const PAYABLE_NOTES_MAX = 500;
export const PAYABLE_REASON_MAX = 300;

const text = (value) => String(value ?? '').trim();

export const isThirdPartyKind = (value) => THIRD_PARTY_KINDS.some((item) => item.value === value);
export const thirdPartyKindLabel = (value) => THIRD_PARTY_KINDS.find((item) => item.value === value)?.label || 'Tercero';
export const payableStatusLabel = (value) => PAYABLE_STATUSES.find((item) => item.value === value)?.label || value;
export const isPayableCategory = (value) => PAYABLE_CATEGORY_OPTIONS.some(([category]) => category === value);
export const isPayableClosed = (status) => status === 'PAGADA' || status === 'ANULADA';

// Qué le falta a un tercero para guardarse, en palabras; `null` si está completo.
export const thirdPartyProblem = ({ kind, name, documentType, documentNumber, email } = {}) => {
    if (!isThirdPartyKind(kind)) return 'Elige qué clase de tercero es.';
    if (!text(name)) return 'Escribe el nombre del tercero.';
    if (text(name).length > THIRD_PARTY_NAME_MAX) return `El nombre admite como máximo ${THIRD_PARTY_NAME_MAX} caracteres.`;
    if (Boolean(text(documentType)) !== Boolean(text(documentNumber))) return 'El documento va entero: tipo y número, o ninguno de los dos.';
    if (text(email) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(email))) return 'El correo no tiene una forma válida.';
    return null;
};

// Qué le falta a una cuenta por pagar para registrarse.
export const payableProblem = ({ thirdPartyId, concept, category, amount, receivedAt, dueDate, notes } = {}) => {
    if (!text(thirdPartyId)) return 'Elige el tercero al que se le debe.';
    if (!text(concept)) return 'Escribe el concepto: qué se está pagando.';
    if (text(concept).length > PAYABLE_CONCEPT_MAX) return `El concepto admite como máximo ${PAYABLE_CONCEPT_MAX} caracteres.`;
    if (!isPayableCategory(category)) return 'Elige la categoría del gasto.';
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return 'Escribe el valor de la cuenta.';
    if (!text(receivedAt)) return 'Escribe la fecha en que llegó el documento.';
    if (text(dueDate) && text(dueDate) < text(receivedAt)) return 'El vencimiento no puede ser anterior a la fecha en que llegó.';
    if (text(notes).length > PAYABLE_NOTES_MAX) return `Las notas admiten como máximo ${PAYABLE_NOTES_MAX} caracteres.`;
    return null;
};

// Qué le falta a un pago de una cuenta por pagar.
export const payablePaymentProblem = ({ amount, paidAt, accountId, outstanding } = {}) => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return 'Escribe el valor pagado.';
    if (outstanding !== undefined && outstanding !== null && Number.isFinite(Number(outstanding)) && value > Number(outstanding) + 0.005) {
        return 'El pago no puede superar el saldo pendiente de la cuenta.';
    }
    if (!text(paidAt)) return 'Escribe la fecha del pago.';
    if (!text(accountId)) return 'Elige la cuenta de la que salió el dinero.';
    return null;
};

// El estado sale de los números, nunca se escribe a mano.
export const payableStatusAfter = ({ amountCents, paidCents, voided = false }) => {
    if (voided) return 'ANULADA';
    if (paidCents <= 0) return 'POR_PAGAR';
    return paidCents >= amountCents ? 'PAGADA' : 'PARCIAL';
};

// Vencida, por vencer o sin vencimiento, con los días, para la tarjeta y los totales.
export const payableDueState = (payable, today = new Date()) => {
    if (isPayableClosed(payable?.status)) return { key: 'CERRADA', label: payableStatusLabel(payable.status), days: 0 };
    if (!payable?.dueDate) return { key: 'SIN_VENCIMIENTO', label: 'Sin vencimiento', days: 0 };
    const due = new Date(payable.dueDate);
    const dayMs = 24 * 60 * 60 * 1000;
    const diff = Math.floor((Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) - Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate())) / dayMs);
    if (diff > 0) return { key: 'VENCIDA', label: `Vencida hace ${diff} día${diff === 1 ? '' : 's'}`, days: diff };
    if (diff === 0) return { key: 'VENCE_HOY', label: 'Vence hoy', days: 0 };
    return { key: 'POR_VENCER', label: `Vence en ${-diff} día${diff === -1 ? '' : 's'}`, days: diff };
};
