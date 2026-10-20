// Préstamos a terceros en Cartera (Rodny, 20 de octubre de 2026: «cuando registro un préstamo
// no se me va a cuentas por cobrar … que me aparezca en cartera. Y que cuando lo paguen, se
// reintegre, es decir, no es un ingreso como tal, es un reintegro»).
//
// Un préstamo es una cuenta por cobrar de otra clase (`AccountsReceivable.kind = PRESTAMO`): a
// quién se le prestó puede ser un colaborador, un socio, un cliente (con su ficha), un proveedor
// u otro tercero. Nace con el egreso que sacó el dinero (categoría PRESTAMO, sección FINANCING)
// y su devolución entra como reintegro con esa misma categoría y sección, nunca como venta.
// Esta regla la leen la pantalla (para frenar antes de enviar) y el servidor (la cerradura).

export const LOAN_KIND = 'PRESTAMO';
export const CLIENT_RECEIVABLE_KIND = 'CLIENTE';

export const LOAN_COUNTERPARTY_TYPES = Object.freeze([
    { value: 'COLABORADOR', label: 'Colaborador del equipo' },
    { value: 'SOCIO', label: 'Socio' },
    { value: 'CLIENTE', label: 'Cliente' },
    { value: 'PROVEEDOR', label: 'Proveedor' },
    { value: 'OTRO', label: 'Otro tercero' }
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
