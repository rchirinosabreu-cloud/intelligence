// Reglas de pantalla de los pagos de nómina (Rodny, 30 de septiembre de 2026): una liquidación
// se paga por partes, un pago se parte y cada parte lleva su comprobante. El servidor vuelve a
// comprobar todo; esto solo evita ofrecer un botón que va a ser rechazado.

export const PAYROLL_DOCUMENT_MAX_BYTES = 25 * 1024 * 1024;
const DOCUMENT_EXTENSIONS = /\.(pdf|jpe?g|png)$/i;

const toCents = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(number * 100) : NaN;
};

/** El estado que se ve en la fila. Una aprobada con pagos es un pago parcial. */
export const payrollStatus = (transaction) => {
    if (!transaction) return { key: 'NONE', label: 'Sin generar' };
    if (transaction.status === 'DRAFT') return { key: 'DRAFT', label: 'Borrador' };
    if (transaction.status === 'PAID') return { key: 'PAID', label: 'Pagada' };
    if (transaction.status === 'APPROVED' && Number(transaction.paidAmount) > 0) return { key: 'PARTIAL', label: 'Pago parcial' };
    return { key: 'APPROVED', label: 'Aprobada' };
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
export const payrollDocumentProblem = (file) => {
    if (!file) return null;
    if (!DOCUMENT_EXTENSIONS.test(file.name || '')) return `${file.name}: solo se admiten PDF, JPG o PNG.`;
    if (file.size === 0) return `${file.name}: el archivo está vacío.`;
    if (file.size > PAYROLL_DOCUMENT_MAX_BYTES) return `${file.name}: supera el máximo de 25 MB.`;
    return null;
};
