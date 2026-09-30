import DOMPurify from 'isomorphic-dompurify';
import { financialCents, financialAmountFromCents } from '../utils/financialMoney.js';
import { hasPartyIdentity, normalizePartialPartyIdentity } from '../lib/partyIdentity.js';
import {
    RECEIVABLE_ITEM_MAX, RECEIVABLE_CONCEPT_MAX, RECEIVABLE_ITEM_DESCRIPTION_MAX,
    RECEIVABLE_SERVICE_PERIOD_MAX, formatReceivableNumber, isReceivableConceptHtml
} from '../lib/receivableDocument.js';
import { normalizeReceivableCurrency, pesosFromRate, DEFAULT_RECEIVABLE_CURRENCY } from '../lib/receivableCurrency.js';
import { ACTIVE_RECEIVABLE_PAYMENT } from './financialQueryFilters.js';
import {
    assertOpenFinancialPeriod,
    FinancialDomainError,
    parseFinancialDateInput
} from './financialRecordService.js';
import { financialEvidenceStorage } from './financialRecordDocumentService.js';
import { storeReceivablePdf, receivablePdfRevisionKey } from './receivablePdfService.js';

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

// Lo que la barra de formato del concepto puede producir y el PDF sabe dibujar. Sin
// enlaces, sin resaltado y sin atributos: es un documento de cobro, no una página.
const CONCEPT_TAGS = ['p', 'h1', 'h2', 'h3', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'br'];
const CONCEPT_HTML_MAX = 20000;

/**
 * El concepto tal como se guarda. El HTML del editor se limpia en el servidor —lo que
 * mande el navegador no es de fiar— y el tope se mide sobre el texto que se lee, no
 * sobre las etiquetas. El texto plano de las cuentas anteriores sigue valiendo tal cual.
 */
export const normalizeReceivableConcept = (value) => {
    if (!isReceivableConceptHtml(value)) {
        return text(value, RECEIVABLE_CONCEPT_MAX, 'RECEIVABLE_CONCEPT_REQUIRED', 'La cuenta de cobro necesita un concepto.');
    }
    if (value.length > CONCEPT_HTML_MAX) {
        throw new FinancialDomainError('RECEIVABLE_CONCEPT_REQUIRED_TOO_LONG', 'El concepto es demasiado largo para una cuenta de cobro.');
    }
    const fragment = DOMPurify.sanitize(value, { ALLOWED_TAGS: CONCEPT_TAGS, ALLOWED_ATTR: [], RETURN_DOM: true });
    text(fragment.textContent, RECEIVABLE_CONCEPT_MAX, 'RECEIVABLE_CONCEPT_REQUIRED', 'La cuenta de cobro necesita un concepto.');
    return fragment.innerHTML;
};

const EXCHANGE_RATE_SOURCES = new Set(['SUPERFINANCIERA_TRM', 'MANUAL']);
const EXCHANGE_RATE_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * La moneda del documento y lo que la obligación vale en cartera (Rodny, 30 de
 * septiembre de 2026). En pesos, el documento y la cartera son la misma cifra. En
 * dólares los conceptos van en dólares, pero «en el financiero siempre registramos todo
 * en pesos»: la cartera guarda el total por la TRM —la oficial, o una escrita a mano— o
 * el valor en pesos que la persona escriba, porque lo que entra «en limpio» manda.
 * `currency` vacío conserva la moneda que la obligación ya tenía.
 */
export const resolveDocumentMoney = (input, document, fallbackCurrency = DEFAULT_RECEIVABLE_CURRENCY) => {
    const currency = input.currency === undefined ? normalizeReceivableCurrency(fallbackCurrency) : normalizeReceivableCurrency(input.currency);
    if (!currency) {
        throw new FinancialDomainError('RECEIVABLE_CURRENCY_INVALID', 'La cuenta de cobro se emite en pesos (COP) o en dólares (USD).');
    }
    if (currency === DEFAULT_RECEIVABLE_CURRENCY) {
        return { currency, exchangeRate: null, exchangeRateSource: null, exchangeRateDate: null, amountCents: document.totalCents };
    }

    const exchangeRate = Number(input.exchangeRate);
    if (input.exchangeRate === '' || input.exchangeRate === null || !Number.isFinite(exchangeRate) || exchangeRate <= 0) {
        throw new FinancialDomainError(
            'RECEIVABLE_EXCHANGE_RATE_REQUIRED',
            'Una cuenta en dólares necesita la TRM con la que se pasa a pesos: la cartera se lleva en pesos. Usa la oficial o escribe la que corresponda.'
        );
    }
    let amountCents;
    if (input.amountCop === undefined || input.amountCop === null || input.amountCop === '') {
        amountCents = pesosFromRate(document.total, exchangeRate) * 100;
    } else {
        amountCents = financialCents(input.amountCop);
        if (amountCents === null || amountCents <= 0) {
            throw new FinancialDomainError('RECEIVABLE_AMOUNT_COP_INVALID', 'El valor en pesos debe ser positivo y tener como máximo dos decimales.');
        }
    }
    const exchangeRateDate = EXCHANGE_RATE_DATE.test(String(input.exchangeRateDate || '')) ? String(input.exchangeRateDate) : null;
    return {
        currency,
        exchangeRate,
        exchangeRateSource: EXCHANGE_RATE_SOURCES.has(input.exchangeRateSource) ? input.exchangeRateSource : 'MANUAL',
        exchangeRateDate,
        amountCents
    };
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
 * Emite la cuenta de cobro de una obligación: le pone número, fecha y conceptos, y
 * ajusta su importe al total del documento. Lo que se le manda al cliente y lo que
 * queda en cartera tienen que ser la misma cifra.
 *
 * Emitir no se repite sobre la misma obligación: para arreglar una ya emitida está
 * `correctReceivableDocument`, y lo que el cliente pida después va en otra aparte.
 */
export const issueReceivableDocument = async (prismaClient, receivableId, input = {}, actor, options = {}) => {
    const concept = normalizeReceivableConcept(input.concept);
    const servicePeriod = text(input.servicePeriod, RECEIVABLE_SERVICE_PERIOD_MAX, 'RECEIVABLE_SERVICE_PERIOD_REQUIRED', 'Escribe el periodo del servicio, como «20 de agosto al 19 de septiembre».');
    const document = calculateReceivableDocument(input.items);
    // Con moneda elegida se valida antes de abrir la transacción; sin ella se conserva la
    // que ya tenía la obligación, que solo se sabe dentro.
    const chosenMoney = input.currency === undefined ? null : resolveDocumentMoney(input, document);
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
            // Ya no es una puerta (Rodny, 30 de septiembre de 2026: «no me deja emitir
            // cuenta de cobro si el cliente no tiene NIT o EIN o nro de documento … necesito
            // levantar esa restricción»). Sin documento, el PDF lleva el nombre de la ficha
            // y se salta la línea del documento. Lo que se escriba aquí se valida y rellena
            // solo lo que le falta a la ficha: lo que ya tenía no se reescribe.
            if (!hasPartyIdentity(receivable.client) && input.client) {
                const written = normalizePartialPartyIdentity(input.client);
                if (!written.valid) {
                    throw new FinancialDomainError('RECEIVABLE_CLIENT_IDENTITY_INVALID', Object.values(written.errors)[0], 422);
                }
                const current = receivable.client || {};
                const missing = {};
                if (written.identity.legalName && !String(current.legalName || '').trim()) missing.legalName = written.identity.legalName;
                if (written.identity.documentNumber && !(current.documentType && String(current.documentNumber || '').trim())) {
                    missing.documentType = written.identity.documentType;
                    missing.documentNumber = written.identity.documentNumber;
                }
                if (Object.keys(missing).length) {
                    await tx.client.update({ where: { id: receivable.clientId }, data: missing });
                    await tx.financialAuditEvent.create({
                        data: {
                            entityType: 'Client',
                            entityId: receivable.clientId,
                            action: 'UPDATE',
                            before: cloneForAudit({
                                legalName: current.legalName ?? null,
                                documentType: current.documentType ?? null,
                                documentNumber: current.documentNumber ?? null
                            }),
                            after: cloneForAudit(missing),
                            actorId
                        }
                    });
                    receivable.client = { ...current, ...missing };
                }
            }
            if (receivable.number) {
                throw new FinancialDomainError(
                    'RECEIVABLE_ALREADY_ISSUED',
                    `Esta obligación ya tiene la cuenta de cobro ${formatReceivableNumber(receivable.number)}. Para cambiar sus conceptos o su valor, usa «Corregir». Si el cliente pidió algo más, emite una cuenta de cobro aparte por ese concepto.`,
                    409
                );
            }

            const money = chosenMoney || resolveDocumentMoney({ exchangeRate: receivable.exchangeRate, exchangeRateSource: receivable.exchangeRateSource, exchangeRateDate: receivable.exchangeRateDate, ...input }, document, receivable.currency);

            // Cambiar el importe de una obligación que ya recibió plata dejaría el
            // saldo mintiendo: primero hay que resolver esos abonos. Los abonos son pesos,
            // así que se comparan con lo que la obligación vale en cartera.
            const paidCents = (receivable.payments || []).reduce((sum, payment) => sum + (financialCents(payment.amount) ?? 0), 0);
            if (paidCents > 0 && paidCents !== money.amountCents) {
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
                    amount: financialAmountFromCents(money.amountCents),
                    currency: money.currency,
                    exchangeRate: money.exchangeRate,
                    exchangeRateSource: money.exchangeRateSource,
                    exchangeRateDate: money.exchangeRateDate,
                    status: paidCents === money.amountCents ? 'PAGADO' : receivable.status
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

export const RECEIVABLE_CORRECTION_REASON_MAX = 300;

/**
 * Corrige una cuenta de cobro ya emitida (Rodny, 30 de septiembre de 2026: «no permite
 * editar las ctas de cobro una vez emitidas»). El caso real fue un valor tecleado de
 * menos —120.000 donde eran 1.200.000— en una cuenta que ya tenía número.
 *
 * Conserva el número: es el mismo documento, arreglado, y el consecutivo de Elisa no
 * puede saltar por un error de digitación. Cambia concepto, periodo, conceptos y, si
 * se pide, la fecha; el importe de la obligación vuelve a ser el total del documento.
 * Lo anterior no se pierde: la auditoría guarda conceptos, valor y la clave del PDF
 * que se había mandado, y el PDF nuevo va a una clave propia, así que el viejo sigue
 * en el bucket. Corregir sin cambiar nada también rehace el PDF con la plantilla
 * vigente, que es como una cuenta vieja recoge un arreglo del texto (el «de» de los
 * millones redondos).
 */
export const correctReceivableDocument = async (prismaClient, receivableId, input = {}, actor, options = {}) => {
    const reason = String(input.reason ?? '').trim();
    if (reason.length > RECEIVABLE_CORRECTION_REASON_MAX) {
        throw new FinancialDomainError('RECEIVABLE_CORRECTION_REASON_TOO_LONG', `El motivo de la corrección admite como máximo ${RECEIVABLE_CORRECTION_REASON_MAX} caracteres.`);
    }
    const concept = normalizeReceivableConcept(input.concept);
    const servicePeriod = text(input.servicePeriod, RECEIVABLE_SERVICE_PERIOD_MAX, 'RECEIVABLE_SERVICE_PERIOD_REQUIRED', 'Escribe el periodo del servicio, como «20 de agosto al 19 de septiembre».');
    const document = calculateReceivableDocument(input.items);
    const chosenMoney = input.currency === undefined ? null : resolveDocumentMoney(input, document);
    const issuedAt = input.issuedAt ? parseFinancialDateInput(input.issuedAt).date : undefined;
    const actorId = actor?.id || actor?.userId || null;

    try {
        const result = await prismaClient.$transaction(async (tx) => {
            const receivable = await tx.accountsReceivable.findUnique({
                where: { id: receivableId },
                include: {
                    items: { orderBy: { sortOrder: 'asc' } },
                    payments: { where: ACTIVE_RECEIVABLE_PAYMENT, select: { amount: true } },
                    client: { select: { id: true, name: true, legalName: true, documentType: true, documentNumber: true } }
                }
            });
            if (!receivable) {
                throw new FinancialDomainError('RECEIVABLE_NOT_FOUND', 'La cuenta por cobrar no existe.', 404);
            }
            if (!receivable.number) {
                throw new FinancialDomainError(
                    'RECEIVABLE_NOT_ISSUED',
                    'Esta obligación todavía no tiene cuenta de cobro, así que no hay nada que corregir. Usa «Emitir cuenta de cobro».',
                    409
                );
            }

            const periodDate = new Date(receivable.period);
            await assertOpenFinancialPeriod(
                tx,
                receivable.year || periodDate.getUTCFullYear(),
                receivable.month || periodDate.getUTCMonth() + 1
            );

            const money = chosenMoney || resolveDocumentMoney({ exchangeRate: receivable.exchangeRate, exchangeRateSource: receivable.exchangeRateSource, exchangeRateDate: receivable.exchangeRateDate, ...input }, document, receivable.currency);

            // Los abonos vigentes son pesos que ya entraron: la obligación no puede valer menos.
            const paidCents = (receivable.payments || []).reduce((sum, payment) => sum + (financialCents(payment.amount) ?? 0), 0);
            if (paidCents > money.amountCents) {
                throw new FinancialDomainError(
                    'RECEIVABLE_AMOUNT_BELOW_PAYMENTS',
                    'Esta obligación ya tiene abonos por más de lo que valdría el documento corregido. Revierte el abono que sobra antes de corregir.',
                    409
                );
            }
            const status = paidCents === money.amountCents
                ? 'PAGADO'
                : (receivable.status === 'PROMESADO' ? 'PROMESADO' : 'DEBE');

            await tx.receivableItem.deleteMany({ where: { receivableId } });
            await tx.receivableItem.createMany({
                data: document.lines.map((line) => ({ ...line, receivableId }))
            });
            // Se suelta la clave del PDF anterior: si el guardado del nuevo fallara, «Ver
            // PDF» lo regenera con los datos corregidos en vez de servir el viejo. La
            // clave vieja queda en el `before` de la auditoría y el archivo, en el bucket.
            const data = {
                concept,
                servicePeriod,
                amount: financialAmountFromCents(money.amountCents),
                currency: money.currency,
                exchangeRate: money.exchangeRate,
                exchangeRateSource: money.exchangeRateSource,
                exchangeRateDate: money.exchangeRateDate,
                status,
                pdfStorageKey: null
            };
            if (issuedAt) data.issuedAt = issuedAt;
            const corrected = await tx.accountsReceivable.update({
                where: { id: receivableId },
                data,
                include: {
                    items: { orderBy: { sortOrder: 'asc' } },
                    client: { select: { id: true, name: true, legalName: true, documentType: true, documentNumber: true } }
                }
            });

            await tx.financialAuditEvent.create({
                data: {
                    entityType: 'AccountsReceivable',
                    entityId: receivableId,
                    action: 'UPDATE',
                    before: cloneForAudit({ ...receivable, payments: undefined }),
                    after: cloneForAudit({ ...corrected, items: document.lines, correction: true, reason: reason || null }),
                    actorId
                }
            });

            return {
                receivable: corrected,
                document: { ...document, number: receivable.number, formattedNumber: formatReceivableNumber(receivable.number) }
            };
        }, { isolationLevel: 'Serializable' });

        // Igual que al emitir: fuera de la transacción y sin tumbar la corrección si el
        // bucket falla. La clave es nueva para no pisar el PDF que ya se había mandado.
        const storePdf = options.storePdf || storeReceivablePdf;
        const storage = options.storage || financialEvidenceStorage();
        const key = receivablePdfRevisionKey(result.receivable, options.now || new Date());
        result.receivable.pdfStorageKey = await storePdf(prismaClient, storage, result.receivable, options.env || process.env, null, key);

        return result;
    } catch (error) {
        if (error?.code === 'P2034') {
            throw new FinancialDomainError(
                'RECEIVABLE_CONFLICT',
                'La cuenta por cobrar cambió mientras se corregía. Actualiza sus datos y vuelve a intentarlo.',
                409
            );
        }
        throw error;
    }
};
