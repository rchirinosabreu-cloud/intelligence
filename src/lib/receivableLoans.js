// Préstamos a terceros en Cartera (Rodny, 20 de octubre de 2026: «cuando registro un préstamo
// no se me va a cuentas por cobrar … que me aparezca en cartera. Y que cuando lo paguen, se
// reintegre, es decir, no es un ingreso como tal, es un reintegro»).
//
// Un préstamo es una cuenta por cobrar de otra clase (`AccountsReceivable.kind = PRESTAMO`): a
// quién se le prestó puede ser un colaborador, un socio, un cliente (con su ficha), un proveedor
// o un particular. Nace con el egreso que sacó el dinero (categoría PRESTAMO, sección FINANCING)
// y su devolución entra como reintegro con esa misma categoría y sección, nunca como venta.
// Esta regla la leen la pantalla (para frenar antes de enviar) y el servidor (la cerradura).

export const LOAN_KIND = 'PRESTAMO';
export const CLIENT_RECEIVABLE_KIND = 'CLIENTE';

export const LOAN_COUNTERPARTY_TYPES = Object.freeze([
    { value: 'COLABORADOR', label: 'Colaborador del equipo' },
    { value: 'SOCIO', label: 'Socio' },
    { value: 'CLIENTE', label: 'Cliente' },
    { value: 'PROVEEDOR', label: 'Proveedor' },
    // «Particular» (Rodny, 26 de octubre de 2026): una persona o empresa sin otra relación con Brain Studio. Antes
    // «Otro tercero», que no decía nada; el valor guardado sigue siendo OTRO, así que lo ya registrado no cambia.
    { value: 'OTRO', label: 'Particular' }
]);

export const LOAN_NAME_MAX = 120;
export const LOAN_NOTES_MAX = 500;

export const isLoanCounterpartyType = (value) => LOAN_COUNTERPARTY_TYPES.some((item) => item.value === value);

export const loanCounterpartyLabel = (value) => {
    const found = LOAN_COUNTERPARTY_TYPES.find((item) => item.value === value);
    if (!found) return 'Tercero';
    return found.value === 'COLABORADOR' ? 'Colaborador' : found.label;
};

// Las cuentas anteriores a esta regla no tienen `kind`: son de clientes.
export const isLoanReceivable = (receivable) => receivable?.kind === LOAN_KIND;

const text = (value) => String(value ?? '').trim();

// Un egreso de categoría Préstamo registrado en Movimientos es un préstamo (Rodny, 20 de octubre
// de 2026: «si tiene esa categoría de préstamo vaya a cuenta por cobrar en seguida»). Lo que sigue
// decide si un movimiento es el desembolso de un préstamo y a quién se le prestó, sin tocar la base.

// A quién se le prestó, leído del movimiento: la contraparte si la escribieron; si no, la descripción
// sin la palabra «préstamo» («Prestamos Fancisco» → «Fancisco»). Nunca se inventa un nombre.
export const loanCounterpartyNameFromRecord = (record) => {
    const explicit = text(record?.counterparty);
    if (explicit) return explicit.slice(0, LOAN_NAME_MAX);
    const fromDescription = text(record?.description).replace(/^pr[ée]stamos?\b\s*(?:a|para|de)?\s*:?\s*/i, '').trim();
    return (fromDescription || 'Sin nombre').slice(0, LOAN_NAME_MAX);
};

// Es el desembolso de un préstamo: un egreso real (ni proyección ni anulado) de categoría PRESTAMO.
export const recordIsLoanDisbursement = (record) => Boolean(record)
    && record.type === 'EXPENSE' && record.category === LOAN_KIND
    && (record.status || 'POSTED') === 'POSTED' && (record.scenario || 'ACTUAL') === 'ACTUAL' && record.isProjection !== true;

// Qué préstamo le corresponde a un movimiento, o `null` si no es un préstamo o ya es de otra
// operación (un pago de nómina o un abono de cartera nunca se convierten en préstamo).
export const loanFromRecord = (record) => {
    if (!recordIsLoanDisbursement(record)) return null;
    if (record.receivablePayment || record.payrollTransaction || record.payrollPayment) return null;
    const clientId = text(record.clientId) || null;
    // Con ficha de cliente, el préstamo lleva el nombre de la ficha, como en «Registrar préstamo».
    const counterpartyName = (clientId && text(record.client?.name)) || loanCounterpartyNameFromRecord(record);
    return { counterpartyType: clientId ? 'CLIENTE' : null, clientId, counterpartyName };
};

// Mientras nadie haya reintegrado nada y el préstamo siga abierto, la cuenta por cobrar sigue a su
// movimiento: corregirlo o anularlo en Movimientos la corrige o la quita. Con un reintegro vigente
// o cerrado, el egreso queda bloqueado y se gestiona desde Cartera.
export const isLoanUntouched = (loan) => Boolean(loan)
    && (loan.status || 'DEBE') === 'DEBE'
    && !(loan.payments || []).some((payment) => !payment.reversedAt);

// Qué le falta a un préstamo para poder registrarse, en palabras; `null` si está completo.
export const loanProblem = ({ counterpartyType, counterpartyName, clientId, amount, lentAt, accountId, financialRecordId, notes } = {}) => {
    if (!isLoanCounterpartyType(counterpartyType)) return 'Elige a quién se le presta.';
    if (counterpartyType === 'CLIENTE') {
        if (!text(clientId)) return 'Elige la ficha del cliente al que se le presta.';
    } else if (!text(counterpartyName)) {
        return 'Escribe el nombre de la persona o empresa a la que se le presta.';
    }
    if (text(counterpartyName).length > LOAN_NAME_MAX) return `El nombre admite como máximo ${LOAN_NAME_MAX} caracteres.`;
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return 'Escribe el valor prestado.';
    if (!text(lentAt)) return 'Escribe la fecha en que salió el dinero.';
    if (!text(financialRecordId) && !text(accountId)) return 'Elige la cuenta de la que salió el dinero, o el egreso ya registrado.';
    if (text(notes).length > LOAN_NOTES_MAX) return `Las notas admiten como máximo ${LOAN_NOTES_MAX} caracteres.`;
    return null;
};
