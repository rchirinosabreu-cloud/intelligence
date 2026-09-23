import { financialCents, financialAmountFromCents } from '../utils/financialMoney.js';
import { hasPartyIdentity, normalizePartyIdentity } from '../lib/partyIdentity.js';
import {
    RECEIVABLE_ITEM_MAX, RECEIVABLE_CONCEPT_MAX, RECEIVABLE_ITEM_DESCRIPTION_MAX,
    RECEIVABLE_SERVICE_PERIOD_MAX, formatReceivableNumber
} from '../lib/receivableDocument.js';
import { ACTIVE_RECEIVABLE_PAYMENT } from './financialQueryFilters.js';
import {
    assertOpenFinancialPeriod,
    FinancialDomainError,
    parseFinancialDateInput
} from './financialRecordService.js';
import { financialEvidenceStorage } from './financialRecordDocumentService.js';
import { storeReceivablePdf } from './receivablePdfService.js';

// Los límites, el concepto por defecto y el formato del número viven en `src/lib` para
// que el formulario pueda leerlos sin arrastrar código de servidor. Se reexportan aquí
// porque el servicio sigue siendo el punto de entrada del dominio.
export {
    RECEIVABLE_ITEM_MAX,
    RECEIVABLE_CONCEPT_MAX,
    RECEIVABLE_ITEM_DESCRIPTION_MAX,
    RECEIVABLE_SERVICE_PERIOD_MAX,
    RECEIVABLE_CONCEPT_DEFAULT,
    formatReceivableNumber
} from '../lib/receivableDocument.js';
// Aquí no se calcula IVA. El único sitio donde aparece en la reunión del 21 de
// septiembre de 2026 es la pantalla de Siigo, el programa contable de Elisa, y
// colgando del caso «factura electrónica»; la cuenta de cobro es el otro camino.
// Si alguna vez hiciera falta, lo pide una persona, no se deduce de un campo visto
// de reojo en otro software.

const cloneForAudit = (value) => JSON.parse(JSON.stringify(value));
const text = (value, max, code, message) => {
    const normalized = String(value ?? '').trim();
    if (!normalized) throw new FinancialDomainError(code, message);
    if (normalized.length > max) throw new FinancialDomainError(`${code}_TOO_LONG`, `${message} Admite como máximo ${max} caracteres.`);
    return normalized;
};

/**
 * Las líneas suman exactamente el total. Todo en centavos: una cuenta de cobro que no
 * cuadra al céntimo con lo que se le manda al cliente no sirve para cobrar.
 */
export const calculateReceivableDocument = (items) => {
    if (!Array.isArray(items) || items.length === 0) {
        throw new FinancialDomainError('RECEIVABLE_ITEMS_REQUIRED', 'La cuenta de cobro necesita al menos un concepto.');
    }
    if (items.length > RECEIVABLE_ITEM_MAX) {
        throw new FinancialDomainError('RECEIVABLE_ITEMS_TOO_MANY', `Una cuenta de cobro admite como máximo ${RECEIVABLE_ITEM_MAX} conceptos.`);
    }

    let totalCents = 0;
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
        if (!Number.isSafeInteger(totalCents + cents)) {
            throw new FinancialDomainError('RECEIVABLE_ITEMS_OUT_OF_RANGE', 'La suma de los conceptos supera el rango de precisión financiera.');
        }
        totalCents += cents;
        return { description, amount: financialAmountFromCents(cents), sortOrder: index };
    });

    return { lines, totalCents, total: financialAmountFromCents(totalCents) };
};

// La última cuenta de cobro que Elisa hizo en Word es la 392 (Rodny, 22 de septiembre
// de 2026), así que la primera que emita la plataforma es la 393. Se configura con
// RECEIVABLE_NUMBER_START y solo manda mientras no haya ninguna emitida aquí.
export const RECEIVABLE_NUMBER_START_DEFAULT = 393;

/**
 * El siguiente número libre. La numeración es de Elisa y viene de fuera de la
 * plataforma, así que no se usa una secuencia de la base: se parte del número más
 * alto ya emitido, y si todavía no hay ninguno, del piso configurado.
 * Nunca retrocede ni reutiliza un hueco: un número repetido rompe su consecutivo.
 */
export const nextReceivableNumber = (highestIssued, configuredStart) => {
    const start = Number(configuredStart);
    const floor = Number.isInteger(start) && start > 0 ? start : 1;
    const highest = Number(highestIssued);
    return Number.isInteger(highest) && highest >= floor ? highest + 1 : floor;
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
    const servicePeriod = text(input.servicePeriod, RECEIVABLE_SERVICE_PERIOD_MAX, 'RECEIVABLE_SERVICE_PERIOD_REQUIRED', 'Escribe el periodo del servicio, como «20 de agosto al 19 de septiembre».');
    const document = calculateReceivableDocument(input.items);
    const { date: issuedAt } = parseFinancialDateInput(input.issuedAt);
    const actorId = actor?.id || actor?.userId || null;
    const configuredStart = options.startNumber ?? process.env.RECEIVABLE_NUMBER_START ?? RECEIVABLE_NUMBER_START_DEFAULT;
    const requestedNumber = input.number === undefined || input.number === null || input.number === ''
        ? null
        : Number(input.number);
    if (requestedNumber !== null && (!Number.isInteger(requestedNumber) || requestedNumber <= 0)) {
        throw new FinancialDomainError('RECEIVABLE_NUMBER_INVALID', 'El número de la cuenta de cobro debe ser un entero positivo.');
    }

    try {
        const result = await prismaClient.$transaction(async (tx) => {
            const receivable = await tx.accountsReceivable.findUnique({
                where: { id: receivableId },
                include: {
                    payments: { where: ACTIVE_RECEIVABLE_PAYMENT, select: { amount: true } },
                    client: { select: { id: true, name: true, legalName: true, documentType: true, documentNumber: true } }
                }
            });
            if (!receivable) {
                throw new FinancialDomainError('RECEIVABLE_NOT_FOUND', 'La cuenta por cobrar no existe.', 404);
            }
            // El documento lleva el nombre legal y la cédula o NIT del cliente. Si su
            // ficha todavía no los tiene se pueden escribir al emitir, y **quedan
            // guardados en la ficha**: el dato se sigue escribiendo una sola vez, pero
            // no obliga a abandonar el documento a medio hacer para ir a buscarlo.
            // Si la ficha ya los tiene, no se tocan: una cuenta de cobro no reescribe
            // la identidad de un tercero por el camino.
            if (!hasPartyIdentity(receivable.client)) {
                if (!input.client) {
                    throw new FinancialDomainError(
                        'RECEIVABLE_CLIENT_IDENTITY_MISSING',
                        `La cuenta de cobro lleva el nombre completo y el documento del cliente, y la ficha de «${receivable.client?.name || 'este cliente'}» todavía no los tiene. Escríbelos en este mismo formulario, o complétalos en Clientes → «⋯» → Editar Cliente.`,
                        409
                    );
                }
                const identity = normalizePartyIdentity(input.client);
                if (!identity.valid) {
                    throw new FinancialDomainError('RECEIVABLE_CLIENT_IDENTITY_INVALID', Object.values(identity.errors)[0], 422);
                }
                await tx.client.update({ where: { id: receivable.clientId }, data: identity.identity });
                await tx.financialAuditEvent.create({
                    data: {
                        entityType: 'Client',
                        entityId: receivable.clientId,
                        action: 'UPDATE',
                        before: cloneForAudit({
                            legalName: receivable.client?.legalName ?? null,
                            documentType: receivable.client?.documentType ?? null,
                            documentNumber: receivable.client?.documentNumber ?? null
                        }),
                        after: cloneForAudit(identity.identity),
                        actorId
                    }
                });
                receivable.client = { ...receivable.client, ...identity.identity };
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
                    servicePeriod,
                    amount: document.total,
                    status: paidCents === document.totalCents ? 'PAGADO' : receivable.status
                },
                include: {
                    items: { orderBy: { sortOrder: 'asc' } },
                    client: { select: { id: true, name: true, legalName: true, documentType: true, documentNumber: true } }
                }
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

        // El PDF se genera al emitir y se guarda: así el documento queda congelado tal
        // como se mandó, aunque después cambie la plantilla o la ficha del cliente.
        // Va fuera de la transacción a propósito —subir al bucket es una llamada de red
        // y no se tiene un candado abierto esperándola— y nunca tumba la emisión: si
        // falla, la cuenta de cobro ya tiene su número y la descarga lo reintenta.
        const storePdf = options.storePdf || storeReceivablePdf;
        const storage = options.storage || financialEvidenceStorage();
        result.receivable.pdfStorageKey = await storePdf(prismaClient, storage, result.receivable, options.env || process.env);

        return result;
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
