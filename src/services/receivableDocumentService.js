import { financialCents, financialAmountFromCents } from '../utils/financialMoney.js';
import { ACTIVE_RECEIVABLE_PAYMENT } from './financialQueryFilters.js';
import {
    assertOpenFinancialPeriod,
    FinancialDomainError,
    parseFinancialDateInput
} from './financialRecordService.js';

export const RECEIVABLE_ITEM_MAX = 40;
export const RECEIVABLE_CONCEPT_MAX = 300;
export const RECEIVABLE_ITEM_DESCRIPTION_MAX = 300;
// Elisa decide por documento si lleva IVA: «si se le está cobrando IVA o no a esa
// persona». No es una propiedad del cliente, así que se pregunta cada vez.
export const RECEIVABLE_TAX_RATES = Object.freeze([0, 19]);

const cloneForAudit = (value) => JSON.parse(JSON.stringify(value));
const text = (value, max, code, message) => {
    const normalized = String(value ?? '').trim();
    if (!normalized) throw new FinancialDomainError(code, message);
    if (normalized.length > max) throw new FinancialDomainError(`${code}_TOO_LONG`, `${message} Admite como máximo ${max} caracteres.`);
    return normalized;
};

/**
 * Las líneas suman exactamente el subtotal, el IVA se calcula sobre ese subtotal y el
 * total es la suma de ambos. Todo en centavos: una cuenta de cobro que no cuadra al
 * céntimo con lo que se le manda al cliente no sirve para cobrar.
 */
export const calculateReceivableDocument = (items, taxRate) => {
    if (!Array.isArray(items) || items.length === 0) {
        throw new FinancialDomainError('RECEIVABLE_ITEMS_REQUIRED', 'La cuenta de cobro necesita al menos un concepto.');
    }
    if (items.length > RECEIVABLE_ITEM_MAX) {
        throw new FinancialDomainError('RECEIVABLE_ITEMS_TOO_MANY', `Una cuenta de cobro admite como máximo ${RECEIVABLE_ITEM_MAX} conceptos.`);
    }
    // No elegir no puede convertirse en «sin IVA»: `Number(null)` es 0 y 0 es una
    // tarifa válida, así que una cuenta de cobro saldría sin IVA sin que nadie lo
    // decidiera. Elisa tiene que decirlo cada vez.
    if (taxRate === null || taxRate === undefined || taxRate === '') {
        throw new FinancialDomainError('RECEIVABLE_TAX_RATE_INVALID', 'Indica si la cuenta de cobro lleva IVA o no.');
    }
    const rate = Number(taxRate);
    if (!RECEIVABLE_TAX_RATES.includes(rate)) {
        throw new FinancialDomainError('RECEIVABLE_TAX_RATE_INVALID', 'Indica si la cuenta de cobro lleva IVA o no.');
    }

    let subtotalCents = 0;
    const lines = items.map((item, index) => {
        const description = text(
            item?.description,
            RECEIVABLE_ITEM_DESCRIPTION_MAX,
            'RECEIVABLE_ITEM_DESCRIPTION_REQUIRED',
            `El concepto ${index + 1} necesita una descripción.`
        );
        const cents = financialCents(item?.amount);
        if (cents === null || cents <= 0) {
            throw new FinancialDomainError('RECEIVABLE_ITEM_AMOUNT_INVALID', `El valor del concepto «${description}» debe ser positivo y tener como máximo dos decimales.`);
        }
        if (!Number.isSafeInteger(subtotalCents + cents)) {
            throw new FinancialDomainError('RECEIVABLE_ITEMS_OUT_OF_RANGE', 'La suma de los conceptos supera el rango de precisión financiera.');
        }
        subtotalCents += cents;
        return { description, amount: financialAmountFromCents(cents), sortOrder: index };
    });

    // El IVA se redondea al céntimo más cercano, una sola vez y sobre el subtotal
    // completo: repartirlo por línea haría que el total no cuadre con la suma.
    const taxCents = Math.round((subtotalCents * rate) / 100);
    const totalCents = subtotalCents + taxCents;
    if (!Number.isSafeInteger(totalCents)) {
        throw new FinancialDomainError('RECEIVABLE_ITEMS_OUT_OF_RANGE', 'El total con IVA supera el rango de precisión financiera.');
    }

    return {
        lines,
        subtotalCents,
        taxCents,
        totalCents,
        subtotal: financialAmountFromCents(subtotalCents),
        taxRate: rate,
        taxAmount: financialAmountFromCents(taxCents),
        total: financialAmountFromCents(totalCents)
    };
};

/**
 * El siguiente número libre. La numeración es de Elisa y viene de fuera de la
 * plataforma, así que no se usa una secuencia de la base: se parte del número más
 * alto ya emitido, y si todavía no hay ninguno, del piso que ella configure.
 * Nunca retrocede ni reutiliza un hueco: un número repetido rompe su consecutivo.
 */
export const nextReceivableNumber = (highestIssued, configuredStart) => {
    const start = Number(configuredStart);
    const floor = Number.isInteger(start) && start > 0 ? start : 1;
    const highest = Number(highestIssued);
    return Number.isInteger(highest) && highest >= floor ? highest + 1 : floor;
};

export const formatReceivableNumber = (number) => {
    // `Number(null)` es 0 y `Number.isInteger(0)` es true: sin este guardia una
    // obligación sin emitir se presentaría como «CC-null».
    if (number === null || number === undefined || number === '') return null;
    const value = Number(number);
    return Number.isInteger(value) && value > 0 ? `CC-${String(value).padStart(4, '0')}` : null;
};

/**
 * Emite la cuenta de cobro de una obligación: le pone número, fecha, conceptos e IVA,
 * y ajusta su importe al total del documento. Lo que se le manda al cliente y lo que
 * queda en cartera tienen que ser la misma cifra.
 *
 * Una cuenta ya emitida no se reedita: si el cliente pide algo después, Elisa manda
 * otra cuenta de cobro aparte, que es como trabaja hoy.
 */
export const issueReceivableDocument = async (prismaClient, receivableId, input = {}, actor, options = {}) => {
    const concept = text(input.concept, RECEIVABLE_CONCEPT_MAX, 'RECEIVABLE_CONCEPT_REQUIRED', 'La cuenta de cobro necesita un concepto.');
    const document = calculateReceivableDocument(input.items, input.taxRate);
    const { date: issuedAt } = parseFinancialDateInput(input.issuedAt);
    const actorId = actor?.id || actor?.userId || null;
    const configuredStart = options.startNumber ?? process.env.RECEIVABLE_NUMBER_START;
    const requestedNumber = input.number === undefined || input.number === null || input.number === ''
        ? null
        : Number(input.number);
    if (requestedNumber !== null && (!Number.isInteger(requestedNumber) || requestedNumber <= 0)) {
        throw new FinancialDomainError('RECEIVABLE_NUMBER_INVALID', 'El número de la cuenta de cobro debe ser un entero positivo.');
    }

    try {
        return await prismaClient.$transaction(async (tx) => {
            const receivable = await tx.accountsReceivable.findUnique({
                where: { id: receivableId },
                include: { payments: { where: ACTIVE_RECEIVABLE_PAYMENT, select: { amount: true } } }
            });
            if (!receivable) {
                throw new FinancialDomainError('RECEIVABLE_NOT_FOUND', 'La cuenta por cobrar no existe.', 404);
            }
            if (receivable.number) {
                throw new FinancialDomainError(
                    'RECEIVABLE_ALREADY_ISSUED',
                    `Esta obligación ya tiene la cuenta de cobro ${formatReceivableNumber(receivable.number)}. Si el cliente pidió algo más, emite una cuenta de cobro aparte por ese concepto.`,
                    409
                );
            }

            // Cambiar el importe de una obligación que ya recibió plata dejaría el
            // saldo mintiendo: primero hay que resolver esos abonos.
            const paidCents = (receivable.payments || []).reduce((sum, payment) => sum + (financialCents(payment.amount) ?? 0), 0);
            if (paidCents > 0 && paidCents !== document.totalCents) {
                throw new FinancialDomainError(
                    'RECEIVABLE_ALREADY_PAID_PARTIALLY',
                    'Esta obligación ya tiene abonos aplicados y el total de la cuenta de cobro no coincide con ellos. Revisa los abonos antes de emitirla.',
                    409
                );
            }

            const periodDate = new Date(receivable.period);
            await assertOpenFinancialPeriod(
                tx,
                receivable.year || periodDate.getUTCFullYear(),
                receivable.month || periodDate.getUTCMonth() + 1
            );

            const highest = await tx.accountsReceivable.aggregate({ _max: { number: true } });
            const number = requestedNumber ?? nextReceivableNumber(highest?._max?.number, configuredStart);

            await tx.receivableItem.deleteMany({ where: { receivableId } });
            await tx.receivableItem.createMany({
                data: document.lines.map((line) => ({ ...line, receivableId }))
            });
            const issued = await tx.accountsReceivable.update({
                where: { id: receivableId },
                data: {
                    number,
                    issuedAt,
                    issuedById: actorId,
                    concept,
                    subtotal: document.subtotal,
                    taxRate: document.taxRate,
                    taxAmount: document.taxAmount,
                    amount: document.total,
                    status: paidCents === document.totalCents ? 'PAGADO' : receivable.status
                },
                include: { items: { orderBy: { sortOrder: 'asc' } }, client: { select: { id: true, name: true } } }
            });

            await tx.financialAuditEvent.create({
                data: {
                    entityType: 'AccountsReceivable',
                    entityId: receivableId,
                    action: 'POST',
                    before: cloneForAudit({ ...receivable, payments: undefined }),
                    after: cloneForAudit({ ...issued, items: undefined }),
                    actorId
                }
            });

            return { receivable: issued, document: { ...document, number, formattedNumber: formatReceivableNumber(number) } };
        }, { isolationLevel: 'Serializable' });
    } catch (error) {
        if (error?.code === 'P2002') {
            throw new FinancialDomainError(
                'RECEIVABLE_NUMBER_TAKEN',
                'Ese número de cuenta de cobro ya está usado. Actualiza los datos y vuelve a intentarlo.',
                409
            );
        }
        if (error?.code === 'P2034') {
            throw new FinancialDomainError(
                'RECEIVABLE_ISSUE_CONFLICT',
                'Otra cuenta de cobro se emitió al mismo tiempo. Vuelve a intentarlo para tomar el siguiente número.',
                409
            );
        }
        throw error;
    }
};
