// Reglas de pantalla de los pagos de nómina (Rodny, 30 de septiembre de 2026): una liquidación
// se paga por partes, un pago se parte y cada parte lleva su comprobante. El servidor vuelve a
// comprobar todo; esto solo evita ofrecer un botón que va a ser rechazado.

import { FINANCIAL_DOCUMENT_MAX_BYTES, financialDocumentProblem } from './financialDocumentsClient.js';

export const PAYROLL_DOCUMENT_MAX_BYTES = FINANCIAL_DOCUMENT_MAX_BYTES;

const toCents = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(number * 100) : NaN;
};

/** El estado que se ve en la fila. Una aprobada con pagos es un pago parcial. */
export const payrollStatus = (transaction) => {
    if (!transaction) return { key: 'NONE', label: 'Sin generar' };
    if (transaction.voidedAt) return { key: 'VOID', label: 'Revertida' };
    if (transaction.status === 'DRAFT') return { key: 'DRAFT', label: 'Borrador' };
    if (transaction.status === 'PAID') return { key: 'PAID', label: transaction.loanDeductions?.some(item => !item.reversedAt) ? 'Liquidada con descuento' : 'Pagada' };
    if (transaction.status === 'APPROVED' && Number(transaction.paidAmount) > 0) return { key: 'PARTIAL', label: 'Pago parcial' };
    return { key: 'APPROVED', label: 'Aprobada' };
};

// El resumen del mes de una persona, para su fila cerrada en Nómina (Rodny, 10 de noviembre de 2026:
// las columnas quedaban vacías hasta abrirla). Las liquidaciones revertidas no suman.
const SUMMARY_WORDS = { DRAFT: ['borrador', 'borradores'], APPROVED: ['aprobada', 'aprobadas'], PARTIAL: ['con pago parcial', 'con pago parcial'], PAID: ['pagada', 'pagadas'] };
export const payrollPersonSummary = (transactions = []) => {
    const live = transactions.filter((transaction) => transaction && !transaction.voidedAt);
    const sum = (pick) => Math.round(live.reduce((total, transaction) => total + (Number(pick(transaction)) || 0), 0) * 100) / 100;
    const outstanding = sum((transaction) => (transaction.status === 'PAID' ? 0 : Number(transaction.netAmount) - (Number(transaction.paidAmount) || 0)));
    const statuses = live.map(payrollStatus);
    const keys = [...new Set(statuses.map((status) => status.key))];
    let status;
    if (!live.length) status = { key: 'NONE', label: 'Sin generar' };
    else if (keys.length === 1) status = live.length === 1 ? statuses[0] : { key: keys[0], label: `${live.length} ${SUMMARY_WORDS[keys[0]]?.[1] || statuses[0].label.toLowerCase()}` };
    else status = { key: 'MIXED', label: keys.map((key) => { const count = statuses.filter((item) => item.key === key).length; return `${count} ${SUMMARY_WORDS[key]?.[count === 1 ? 0 : 1] || key.toLowerCase()}`; }).join(' · ') };
    return { count: live.length, base: sum((t) => t.baseSalary), socialSecurity: sum((t) => t.socialSecurity), net: sum((t) => t.netAmount), outstanding, status };
};

export const activePayrollPayments = (transaction) => (transaction?.payments || []).filter((payment) => !payment.reversedAt);
export const reversedPayrollPayments = (transaction) => (transaction?.payments || []).filter((payment) => payment.reversedAt);

const dateOnly = (value) => (value ? String(value).slice(0, 10) : '');

/** Arranca con el pago entero en la primera parte y una segunda vacía para repartir. */
export const initialSplitParts = (payment, today) => [
    { amount: String(payment?.amount ?? ''), paidAt: dateOnly(payment?.paidAt) || today, accountId: payment?.accountId || '', reference: payment?.reference || '' },
    { amount: '', paidAt: today, accountId: payment?.accountId || '', reference: '' }
];

/** Cuánto suman las partes frente al pago, en centavos, y si ya se puede guardar. */
export const splitBalance = (parts = [], paymentAmount) => {
    const totalCents = toCents(paymentAmount);
    const partsCents = parts.reduce((sum, part) => sum + (toCents(part.amount) || 0), 0);
    const complete = parts.length >= 2 && parts.every((part) => toCents(part.amount) > 0 && part.paidAt && part.accountId);
    const diffCents = totalCents - partsCents;
    return { partsCents, diffCents, ready: complete && diffCents === 0 };
};

/**
 * El pago de nómina de un movimiento, para actuar sobre él desde Movimientos (Rodny, 1 de
 * octubre de 2026: «no debería entonces mejor poder desglosar desde movimiento mismo?»).
 * Nómina abre en el mes actual y el pago suele ser del mes anterior, así que mandar a la
 * persona allá era mandarla a buscar. Null si el movimiento no es un pago de nómina vigente.
 */
export const payrollPaymentFromRecord = (record) => {
    if (!record?.payrollPayment?.id || record.status === 'VOIDED') return null;
    return {
        id: record.payrollPayment.id,
        amount: Number(record.amount),
        paidAt: record.date,
        accountId: record.accountId || null,
        accountName: record.account?.name || null,
        reference: record.reference || null,
        notes: record.notes || null,
        financialRecordId: record.id,
        // Solo se desglosa lo que creó la plataforma; un adelanto registrado a mano se revierte.
        canSplit: record.origin === 'SYSTEM',
        reversedAt: null,
        documents: (record.documents || []).filter((document) => !document.voidedAt)
    };
};

/** El aviso que se da antes de subir un comprobante que el servidor va a rechazar. */
// La misma regla que en Cartera y Movimientos (5 de octubre de 2026): una sola, no una copia.
export const payrollDocumentProblem = financialDocumentProblem;
