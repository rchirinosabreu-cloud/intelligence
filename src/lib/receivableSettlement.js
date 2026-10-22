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
    },
    // La retención que practica el cliente (Elisa, 22 de octubre de 2026, con Fundación Grit: «no
    // pagan el valor de la cuenta completo porque aplican retención en la fuente … que quede cerrado
    // y no me suba el valor de la cartera, pero que no cuente como ingreso»). No es dinero perdido
    // como un acuerdo: el cliente lo paga a la DIAN a nombre de quien emitió, que lo descuenta en su
    // declaración. Por eso cierra la cuenta como pagada, no como saldada, y no pide autorización.
    {
        value: 'RETENCION',
        label: 'Retención aplicada por el cliente',
        help: 'El cliente retuvo parte del pago y lo paga a la DIAN a nombre de quien emitió la cuenta. No es un descuento: se descuenta en la declaración de renta. No pide autorización; el certificado se adjunta cuando llegue.'
    }
]);

// Las retenciones que practica un cliente en Colombia sobre una cuenta de cobro o factura.
export const RETENTION_TYPES = Object.freeze([
    { value: 'RETEFUENTE', label: 'Retención en la fuente', short: 'Fuente' },
    { value: 'RETEICA', label: 'Retención de ICA', short: 'ICA' },
    { value: 'RETEIVA', label: 'Retención de IVA', short: 'IVA' }
]);

export const RETENTION_KIND = 'RETENCION';
export const SETTLEMENT_REASON_MAX = 300;
export const SETTLEMENT_AUTHORIZED_BY_MAX = 120;
export const SETTLEMENT_DETAIL_MAX = 500;
export const RETENTION_CERTIFICATE_MAX = 80;

const CLOSED_STATUSES = new Set(['PAGADO', 'SALDADO']);

export const isRetentionType = (value) => RETENTION_TYPES.some((item) => item.value === value);
export const retentionTypeLabel = (value) => RETENTION_TYPES.find((item) => item.value === value)?.label || 'Retención';

export const settlementKindLabel = (kind) => {
    if (!kind || kind === CASH_KIND) return 'Pago';
    return SETTLEMENT_KINDS.find((item) => item.value === kind)?.label || kind;
};

// El nombre de una fila de abono para leerla: una retención dice de qué tipo es.
export const paymentKindLabel = (payment) => {
    if (payment?.kind === RETENTION_KIND) return retentionTypeLabel(payment?.detail?.retentionType);
    return settlementKindLabel(payment?.kind);
};

export const isSettlementKind = (kind) => SETTLEMENT_KINDS.some((item) => item.value === kind);

// Los abonos anteriores a esta regla no tienen `kind`: son pagos.
export const isCashPayment = (payment) => !payment?.kind || payment.kind === CASH_KIND;
export const isRetentionPayment = (payment) => payment?.kind === RETENTION_KIND;
// Lo que baja la deuda sin dinero y sin que el cliente la haya pagado: acuerdo, canje, compensación, condonación.
export const isNonCashSettlement = (payment) => !isCashPayment(payment) && !isRetentionPayment(payment);

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
    let retainedCents = 0;
    let hasSettlement = false;
    for (const payment of payments) {
        if (!payment || payment.reversedAt) continue;
        const cents = centsOf(payment.amount);
        if (isCashPayment(payment)) paidCents += cents;
        else if (isRetentionPayment(payment)) retainedCents += cents;
        else { settledCents += cents; hasSettlement = true; }
    }
    return { paidCents, settledCents, retainedCents, hasSettlement };
};

// El estado de la obligación después de aplicar o revertir algo. Es la única regla: la llaman
// registrar un pago, saldar, revertir, editar la cuenta y emitir o corregir su documento. Una
// retención cuenta como pagada: el cliente pagó todo, una parte a la DIAN a nombre nuestro.
export const receivableStatusAfter = ({ outstandingCents, payments = [], currentStatus, requestedStatus }) => {
    if (outstandingCents === 0) {
        return payments.some((payment) => payment && !payment.reversedAt && isNonCashSettlement(payment)) ? 'SALDADO' : 'PAGADO';
    }
    return (requestedStatus ?? currentStatus) === 'PROMESADO' ? 'PROMESADO' : 'DEBE';
};

const text = (value) => String(value ?? '').trim();

// Qué le falta a un cierre para poder registrarse, dicho en palabras; `null` si está completo.
// `outstanding` es opcional: la pantalla lo conoce y frena antes; el servidor lo vuelve a comprobar.
export const settlementProblem = ({ kind, amount, outstanding, reason, authorizedBy, goods, destination, offsetAgainst, retentionType, certificateNumber } = {}) => {
    if (!isSettlementKind(kind)) return 'Elige la forma de saldar la deuda.';
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return 'Escribe el valor que se da por saldado.';
    if (outstanding !== undefined && outstanding !== null && Number.isFinite(Number(outstanding)) && value > Number(outstanding) + 0.005) {
        return 'El valor no puede superar el saldo pendiente de la cuenta.';
    }
    // Una retención no es una decisión nuestra: no pide quién autorizó ni motivo, solo de qué tipo es.
    if (kind === RETENTION_KIND) {
        if (!isRetentionType(retentionType)) return 'Elige qué retención aplicó el cliente.';
        if (text(certificateNumber).length > RETENTION_CERTIFICATE_MAX) return `El número del certificado admite como máximo ${RETENTION_CERTIFICATE_MAX} caracteres.`;
        if (text(reason).length > SETTLEMENT_REASON_MAX) return `La nota admite como máximo ${SETTLEMENT_REASON_MAX} caracteres.`;
        return null;
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
export const settlementDetail = ({ kind, authorizedBy, goods, destination, offsetAgainst, retentionType, certificateNumber } = {}) => {
    if (kind === RETENTION_KIND) {
        const detail = { retentionType };
        if (text(certificateNumber)) detail.certificateNumber = text(certificateNumber);
        if (text(authorizedBy)) detail.authorizedBy = text(authorizedBy);
        return detail;
    }
    const detail = { authorizedBy: text(authorizedBy) };
    if (kind === 'CANJE') {
        detail.goods = text(goods);
        if (text(destination)) detail.destination = text(destination);
    }
    if (kind === 'COMPENSACION') detail.offsetAgainst = text(offsetAgainst);
    return detail;
};

// Las retenciones que vienen con un pago: una por tipo, cada una positiva. `null` si están bien.
// `cash` y `outstanding` son opcionales: la pantalla los conoce y frena antes; el servidor vuelve a mirar.
export const normalizeRetentions = (retentions = []) => (Array.isArray(retentions) ? retentions : [])
    .map((item) => ({ type: item?.type, amount: Number(item?.amount) }))
    .filter((item) => Number.isFinite(item.amount) && item.amount > 0);

export const retentionsProblem = (retentions = [], { cash, outstanding } = {}) => {
    const list = normalizeRetentions(retentions);
    const seen = new Set();
    for (const item of list) {
        if (!isRetentionType(item.type)) return 'Elige qué retención aplicó el cliente.';
        if (seen.has(item.type)) return `${retentionTypeLabel(item.type)} está dos veces: escríbela una sola vez.`;
        seen.add(item.type);
    }
    const retained = list.reduce((sum, item) => sum + item.amount, 0);
    if (outstanding !== undefined && outstanding !== null && Number.isFinite(Number(outstanding))) {
        if (retained > Number(outstanding) + 0.005) return 'Las retenciones no pueden superar el saldo pendiente de la cuenta.';
        if (Number.isFinite(Number(cash)) && Number(cash) + retained > Number(outstanding) + 0.005) {
            return 'El pago más las retenciones supera el saldo pendiente de la cuenta.';
        }
    }
    return null;
};
