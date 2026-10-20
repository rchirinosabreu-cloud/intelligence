// Cerrar una deuda sin que entre (todo) el dinero (Rodny, 20 de octubre de 2026: «Salsipuedes
// decía como 3.500.000 pero su negocio cerró y por mutuo acuerdo quedamos en 2.000.000 … la
// plataforma no me permite cerrar eso»; «Nuva debía como 3 y pico, pero Francisco hizo el cambio
// con ellos por unos muebles»).
//
// Un cierre es una fila más de abono (`ReceivablePayment`) con `kind` distinto de PAGO: no lleva
// cuenta ni ingreso, porque no entró dinero, y por eso nunca infla las ventas. Se conserva el
// valor original de la obligación; lo que entró en dinero sigue siendo lo único que se cuenta
// como ingreso, y el ajuste queda aparte, con quién lo autorizó y por qué.
//
// Esta regla la leen la pantalla (para frenar antes de enviar) y el servidor (la cerradura).

export const CASH_KIND = 'PAGO';

export const SETTLEMENT_KINDS = Object.freeze([
    {
        value: 'ACUERDO',
        label: 'Acuerdo por menor valor',
        help: 'Se acordó cerrar la deuda por menos de lo que valía. Lo que falta queda como ajuste autorizado, no como dinero recibido.'
    },
    {
        value: 'CANJE',
        label: 'Canje de bienes o servicios',
        help: 'El cliente entregó bienes o servicios en lugar de dinero. Queda escrito qué entró y a dónde fue.'
    },
    {
        value: 'COMPENSACION',
        label: 'Compensación de obligaciones',
        help: 'Se cruzó con algo que nosotros le debíamos al cliente. Queda escrito contra qué se compensó.'
    },
    {
        value: 'CONDONACION',
        label: 'Condonación o baja autorizada',
        help: 'Se renuncia a cobrar lo que queda. Solo con autorización de Dirección.'
    }
]);

export const SETTLEMENT_REASON_MAX = 300;
export const SETTLEMENT_AUTHORIZED_BY_MAX = 120;
export const SETTLEMENT_DETAIL_MAX = 500;

const CLOSED_STATUSES = new Set(['PAGADO', 'SALDADO']);

export const settlementKindLabel = (kind) => {
    if (!kind || kind === CASH_KIND) return 'Pago';
    return SETTLEMENT_KINDS.find((item) => item.value === kind)?.label || kind;
};

export const isSettlementKind = (kind) => SETTLEMENT_KINDS.some((item) => item.value === kind);

// Los abonos anteriores a esta regla no tienen `kind`: son pagos.
export const isCashPayment = (payment) => !payment?.kind || payment.kind === CASH_KIND;

export const isReceivableClosed = (status) => CLOSED_STATUSES.has(status);

const centsOf = (value) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.round(number);
};

// Suma, en centavos, lo que entró como dinero y lo que se saldó de otra forma. Recibe los
// abonos con `amount` ya en centavos (el servidor) o lo convierte quien llama (la pantalla).
export const splitAppliedCents = (payments = []) => {
    let paidCents = 0;
    let settledCents = 0;
    let hasSettlement = false;
    for (const payment of payments) {
        if (!payment || payment.reversedAt) continue;
        const cents = centsOf(payment.amount);
        if (isCashPayment(payment)) paidCents += cents;
        else { settledCents += cents; hasSettlement = true; }
    }
    return { paidCents, settledCents, hasSettlement };
};

// El estado de la obligación después de aplicar o revertir algo. Es la única regla: la llaman
// registrar un pago, saldar, revertir, editar la cuenta y emitir o corregir su documento.
export const receivableStatusAfter = ({ outstandingCents, payments = [], currentStatus, requestedStatus }) => {
    if (outstandingCents === 0) {
        return payments.some((payment) => payment && !payment.reversedAt && !isCashPayment(payment)) ? 'SALDADO' : 'PAGADO';
    }
    return (requestedStatus ?? currentStatus) === 'PROMESADO' ? 'PROMESADO' : 'DEBE';
};

const text = (value) => String(value ?? '').trim();

// Qué le falta a un cierre para poder registrarse, dicho en palabras; `null` si está completo.
// `outstanding` es opcional: la pantalla lo conoce y frena antes; el servidor lo vuelve a comprobar.
export const settlementProblem = ({ kind, amount, outstanding, reason, authorizedBy, goods, destination, offsetAgainst } = {}) => {
    if (!isSettlementKind(kind)) return 'Elige la forma de saldar la deuda.';
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return 'Escribe el valor que se da por saldado.';
    if (outstanding !== undefined && outstanding !== null && Number.isFinite(Number(outstanding)) && value > Number(outstanding) + 0.005) {
        return 'El valor no puede superar el saldo pendiente de la cuenta.';
    }
    if (!text(reason)) return 'Explica el motivo: es lo que queda en la bitácora.';
    if (text(reason).length > SETTLEMENT_REASON_MAX) return `El motivo admite como máximo ${SETTLEMENT_REASON_MAX} caracteres.`;
    if (!text(authorizedBy)) return 'Escribe quién autorizó el cierre.';
    if (text(authorizedBy).length > SETTLEMENT_AUTHORIZED_BY_MAX) return `Quien autoriza admite como máximo ${SETTLEMENT_AUTHORIZED_BY_MAX} caracteres.`;
    if (kind === 'CANJE' && !text(goods)) return 'Describe qué se recibió a cambio.';
    if (kind === 'COMPENSACION' && !text(offsetAgainst)) return 'Escribe contra qué obligación se compensa.';
    for (const [label, value] of [['Lo recibido', goods], ['El destino', destination], ['La compensación', offsetAgainst]]) {
        if (text(value).length > SETTLEMENT_DETAIL_MAX) return `${label} admite como máximo ${SETTLEMENT_DETAIL_MAX} caracteres.`;
    }
    return null;
};

// Lo que se guarda en `detail`: solo lo que aplica a esa forma de cierre, ya recortado.
export const settlementDetail = ({ kind, authorizedBy, goods, destination, offsetAgainst } = {}) => {
    const detail = { authorizedBy: text(authorizedBy) };
    if (kind === 'CANJE') {
        detail.goods = text(goods);
        if (text(destination)) detail.destination = text(destination);
    }
    if (kind === 'COMPENSACION') detail.offsetAgainst = text(offsetAgainst);
    return detail;
};
