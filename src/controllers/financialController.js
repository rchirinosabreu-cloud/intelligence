import prisma from '../lib/prisma.js';
import { withFinancialSearch, financialMonthFilter, ACTIVE_RECEIVABLE_PAYMENT, LIVE_PAYROLL_CONTRACT } from '../services/financialQueryFilters.js';
import { updateReceivable } from '../services/financialReceivableService.js';
import { createPayrollContract, updatePayrollContract } from '../services/financialPayrollContractService.js';
import { FINANCIAL_CATEGORIES } from '../services/financialRecordService.js';
import { formatReceivableNumber } from '../services/receivableDocumentService.js';
import { isCashPayment, isReceivableClosed, isRetentionPayment } from '../lib/receivableSettlement.js';
import { accumulateCategoryDistribution } from '../services/financialRecordAllocationService.js';

// Helper to convert Decimal fields safely
const toNum = (val) => {
    if (val === undefined || val === null) return 0;
    if (typeof val === 'number') return val;
    if (typeof val.toNumber === 'function') return val.toNumber();
    return parseFloat(val) || 0;
};

// Formats number to 2 decimal places to prevent float rounding anomalies
const roundFloat = (val) => {
    return Math.round((val + Number.EPSILON) * 100) / 100;
};

const serializeReceivable = (receivable) => {
    const amount = toNum(receivable.amount);
    // Los abonos revertidos viajan al cliente para que la cartera explique qué pasó,
    // pero solo los vigentes cuentan como dinero aplicado.
    const payments = (receivable.payments || []).map((payment) => ({
        id: payment.id,
        amount: toNum(payment.amount),
        paidAt: payment.paidAt instanceof Date ? payment.paidAt.toISOString() : payment.paidAt,
        reference: payment.reference,
        notes: payment.notes,
        account: payment.account || null,
        reversedAt: payment.reversedAt instanceof Date ? payment.reversedAt.toISOString() : (payment.reversedAt || null),
        reversalReason: payment.reversalReason || null,
        // PAGO, o la forma en que se saldó sin dinero (acuerdo, canje, compensación,
        // condonación) con quién lo autorizó y qué entró (20 de octubre de 2026).
        kind: payment.kind || 'PAGO',
        detail: payment.detail && typeof payment.detail === 'object' ? payment.detail : null,
        // El ingreso del abono y sus comprobantes, para verlos y subirlos desde Cartera (Elisa,
        // 5 de octubre de 2026). Un abono revertido ya no tiene ingreso.
        financialRecordId: payment.financialRecordId || null,
        documents: (payment.financialRecord?.documents || []).map((document) => ({
            id: document.id,
            name: document.name,
            mimeType: document.mimeType,
            size: document.size
        })),
        // El soporte de un ajuste sin dinero: el certificado de una retención (22 de octubre de 2026).
        supportDocuments: (payment.documents || []).map((document) => ({
            id: document.id,
            name: document.name,
            mimeType: document.mimeType,
            size: document.size
        }))
    }));
    // Lo que entró en dinero, lo que retuvo el cliente y lo que se saldó de otra forma se dicen por
    // separado: en Salsipuedes entraron 2.000.000 y se acordaron 1.500.000, y eso no es «pagó
    // 3.500.000»; en Grit lo retenido lo pagó el cliente a la DIAN, no es un descuento.
    const paidAmount = roundFloat(payments.reduce((sum, payment) => sum + (payment.reversedAt || !isCashPayment(payment) ? 0 : payment.amount), 0));
    const retainedAmount = roundFloat(payments.reduce((sum, payment) => sum + (payment.reversedAt || !isRetentionPayment(payment) ? 0 : payment.amount), 0));
    const settledAmount = roundFloat(payments.reduce((sum, payment) => sum + (payment.reversedAt || isCashPayment(payment) || isRetentionPayment(payment) ? 0 : payment.amount), 0));
    const balanceReviewRequired = isReceivableClosed(receivable.status) && roundFloat(amount - paidAmount - settledAmount - retainedAmount) > 0;

    return {
        id: receivable.id,
        clientId: receivable.clientId || receivable.client?.id || null,
        clientName: receivable.client?.name || receivable.counterpartyName || receivable.sourceLabel || 'Cliente sin nombre',
        clientSlug: receivable.client?.slug || null,
        // CLIENTE o PRESTAMO (20 de octubre de 2026): un préstamo dice a quién se le prestó y de
        // qué egreso salió; la pantalla no le ofrece cuenta de cobro y su pago es reintegro.
        kind: receivable.kind || 'CLIENTE',
        counterpartyType: receivable.counterpartyType || null,
        counterpartyName: receivable.counterpartyName || null,
        loanRecordId: receivable.loanRecordId || null,
        // Lo que va impreso como deudor. Vive en la ficha del cliente y se escribe una
        // sola vez; viaja aquí para que el diálogo de emitir sepa si ya lo tiene.
        clientLegalName: receivable.client?.legalName || null,
        clientDocumentType: receivable.client?.documentType || null,
        clientDocumentNumber: receivable.client?.documentNumber || null,
        amount,
        paidAmount,
        settledAmount,
        retainedAmount,
        outstanding: balanceReviewRequired ? null : roundFloat(Math.max(amount - paidAmount - settledAmount - retainedAmount, 0)),
        ...(balanceReviewRequired ? { balanceReviewRequired: true } : {}),
        period: receivable.period instanceof Date ? receivable.period.toISOString() : receivable.period,
        month: receivable.month,
        year: receivable.year,
        // Documento: una obligación sin emitir no lo tiene, y la pantalla lo usa para
        // saber si ofrece «Emitir cuenta de cobro» o muestra su número.
        number: receivable.number ?? null,
        formattedNumber: formatReceivableNumber(receivable.number),
        issuedAt: receivable.issuedAt instanceof Date ? receivable.issuedAt.toISOString() : (receivable.issuedAt || null),
        concept: receivable.concept || null,
        servicePeriod: receivable.servicePeriod || null,
        items: (receivable.items || []).map((item) => ({ id: item.id, description: item.description, amount: toNum(item.amount) })),
        // Moneda del documento. `amount` sigue en pesos: en una cuenta en dólares es su
        // valor en cartera, y los conceptos y `documentTotal` van en dólares.
        currency: receivable.currency || 'COP',
        exchangeRate: receivable.exchangeRate === null || receivable.exchangeRate === undefined ? null : toNum(receivable.exchangeRate),
        exchangeRateSource: receivable.exchangeRateSource || null,
        exchangeRateDate: receivable.exchangeRateDate || null,
        // Emitida: la suma de sus conceptos. Sin emitir, en dólares: el valor en dólares con
        // que se registró (30 de septiembre de 2026).
        documentTotal: (receivable.items || []).length
            ? roundFloat(receivable.items.reduce((sum, item) => sum + toNum(item.amount), 0))
            : roundFloat(toNum(receivable.foreignAmount)),
        foreignAmount: receivable.foreignAmount === null || receivable.foreignAmount === undefined ? null : toNum(receivable.foreignAmount),
        // En dólares, las veces que la cartera en pesos se ajustó a lo que de verdad entró
        // (20 de octubre de 2026): la tarjeta lo dice en vez de dejar un valor que no cuadra.
        exchangeAdjustments: (Array.isArray(receivable.metadata?.exchangeAdjustments) ? receivable.metadata.exchangeAdjustments : [])
            .map((adjustment) => ({ at: adjustment.at, from: (Number(adjustment.fromCents) || 0) / 100, to: (Number(adjustment.toCents) || 0) / 100 })),
        dueDate: receivable.dueDate instanceof Date ? receivable.dueDate.toISOString() : receivable.dueDate,
        status: receivable.status,
        notes: receivable.notes,
        comments: receivable.comments,
        sourceLabel: receivable.sourceLabel,
        payments
    };
};

const buildReceivableTotals = (items) => items.reduce((totals, item) => {
    const status = item.status || 'DEBE';
    totals[status] = roundFloat((totals[status] || 0) + toNum(item.outstanding));
    totals.originalTotal = roundFloat(totals.originalTotal + toNum(item.amount));
    totals.paidTotal = roundFloat(totals.paidTotal + toNum(item.paidAmount));
    totals.settledTotal = roundFloat(totals.settledTotal + toNum(item.settledAmount));
    totals.retainedTotal = roundFloat((totals.retainedTotal || 0) + toNum(item.retainedAmount));
    if (item.balanceReviewRequired) totals.reviewCount += 1;
    totals.outstandingTotal = roundFloat(totals.outstandingTotal + toNum(item.outstanding));
    totals.total = totals.outstandingTotal;
    return totals;
}, {
    DEBE: 0,
    PAGADO: 0,
    PROMESADO: 0,
    SALDADO: 0,
    originalTotal: 0,
    paidTotal: 0,
    settledTotal: 0,
    reviewCount: 0,
    outstandingTotal: 0,
    total: 0
});

const serializeClientTarget = (client) => ({
    id: client.id,
    name: client.name,
    slug: client.slug,
    isArchived: Boolean(client.isArchived)
});

const SOURCE_LABEL_PREFIX = 'source-label:';

const buildClientReconciliationRows = (records, receivables) => {
    const grouped = new Map();

    const ensureRow = (sourceId, clientId, client, fallbackName = 'Cliente sin nombre') => {
        if (!grouped.has(sourceId)) {
            grouped.set(sourceId, {
                sourceId,
                clientId,
                client: {
                    id: client?.id || clientId,
                    name: client?.name || fallbackName,
                    slug: client?.slug || null
                },
                income: 0,
                expense: 0,
                receivable: 0,
                recordCount: 0,
                receivableCount: 0
            });
        }
        return grouped.get(sourceId);
    };

    records.forEach((record) => {
        if (record.type !== 'INCOME') return;
        const sourceLabel = record.sourceLabel || record.description || record.id;
        const sourceId = record.clientId || `${SOURCE_LABEL_PREFIX}${sourceLabel}`;
        const row = ensureRow(sourceId, record.clientId || null, record.client, sourceLabel);
        const amount = toNum(record.amount);
        row.income = roundFloat(row.income + amount);
        row.recordCount += 1;
    });

    receivables.forEach((receivable) => {
        if (!receivable.clientId) return;
        const row = ensureRow(receivable.clientId, receivable.clientId, receivable.client);
        if (['DEBE', 'PROMESADO'].includes(receivable.status)) {
            row.receivable = roundFloat(row.receivable + serializeReceivable(receivable).outstanding);
        }
        row.receivableCount += 1;
    });

    return Array.from(grouped.values()).sort((a, b) => (
        (b.income + b.receivable + b.expense) - (a.income + a.receivable + a.expense)
    ));
};

export const getFinancialClientReconciliation = async (req, res, dependencies = {}) => {
    const prismaClient = dependencies.prismaClient || prisma;

    try {
        const year = parseInt(req.query.year, 10) || 2026;
        const [records, receivables, targets] = await Promise.all([
            prismaClient.financialRecord.findMany({
                where: withFinancialSearch({
                    year,
                    status: 'POSTED',
                    scenario: ['ACTUAL', 'FORECAST', 'BUDGET'].includes(req.query.scenario) ? req.query.scenario : 'ACTUAL',
                    ...financialMonthFilter(req.query),
                    ...(['INCOME', 'EXPENSE'].includes(req.query.type) ? { type: req.query.type } : {})
                }, req.query.q),
                include: {
                    client: {
                        select: {
                            id: true,
                            name: true,
                            slug: true
                        }
                    }
                }
            }),
            prismaClient.accountsReceivable.findMany({
                where: withFinancialSearch({
                    year,
                    ...financialMonthFilter(req.query)
                }, req.query.q, 'receivable'),
                include: {
                    payments: { where: ACTIVE_RECEIVABLE_PAYMENT, select: { amount: true } },
                    client: {
                        select: {
                            id: true,
                            name: true,
                            slug: true
                        }
                    }
                }
            }),
            prismaClient.client.findMany({
                // Incluye archivados: una cuenta por cobrar o un vínculo pueden
                // apuntar a un cliente que ya no está activo y sigue debiendo.
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    isArchived: true
                },
                orderBy: {
                    name: 'asc'
                }
            })
        ]);

        return res.json({
            year,
            clients: buildClientReconciliationRows(records, receivables),
            targets: targets.map(serializeClientTarget)
        });
    } catch (error) {
        console.error('[Financials API] Client reconciliation failed:', error.response?.data || error);
        return res.status(error.statusCode || 500).json({
            error: error.code || 'FINANCIAL_CLIENT_RECONCILIATION_FAILED',
            message: error.statusCode ? error.message : 'No fue posible cargar la conciliacion de clientes financieros.'
        });
    }
};

export const linkFinancialClient = async (req, res, dependencies = {}) => {
    const prismaClient = dependencies.prismaClient || prisma;

    try {
        const { sourceClientId } = req.params;
        const { targetClientId } = req.body || {};
        const isSourceLabel = sourceClientId?.startsWith(SOURCE_LABEL_PREFIX);
        // Express already decoded the path parameter; decoding it again broke labels with «%».
        const sourceLabel = isSourceLabel ? sourceClientId.slice(SOURCE_LABEL_PREFIX.length) : null;

        if (!sourceClientId || !targetClientId || sourceClientId === targetClientId) {
            return res.status(400).json({
                error: 'FINANCIAL_CLIENT_LINK_INVALID',
                message: 'Selecciona dos clientes distintos para conciliar.'
            });
        }

        const result = await prismaClient.$transaction(async (tx) => {
            const clients = await tx.client.findMany({
                where: {
                    id: {
                        in: isSourceLabel ? [targetClientId] : [sourceClientId, targetClientId]
                    }
                },
                select: {
                    id: true,
                    name: true
                }
            });

            if (clients.length !== (isSourceLabel ? 1 : 2)) {
                return null;
            }

            const actorId = req.user?.id || req.user?.userId || null;
            const trace = {
                reconciledFromClientId: sourceClientId,
                reconciledToClientId: targetClientId,
                reconciledBy: actorId,
                reconciledAt: new Date().toISOString()
            };
            const sourceWhere = isSourceLabel
                ? { clientId: null, sourceLabel, type: 'INCOME' }
                : { clientId: sourceClientId };
            // Row by row, merging the trace into whatever each row already carried (monthName, createdBy,
            // editedBy...): a blanket updateMany replaced the whole metadata and erased that history.
            const mergedMetadata = (row) => ({ ...(row.metadata && typeof row.metadata === 'object' ? row.metadata : {}), ...trace });
            const records = await tx.financialRecord.findMany({ where: sourceWhere, select: { id: true, metadata: true } });
            for (const row of records) {
                await tx.financialRecord.update({ where: { id: row.id }, data: { clientId: targetClientId, metadata: mergedMetadata(row) } });
            }
            // A bare Excel label has no debts of its own: those always hang from a client id.
            const debts = isSourceLabel ? [] : await tx.accountsReceivable.findMany({ where: { clientId: sourceClientId }, select: { id: true, metadata: true } });
            for (const row of debts) {
                await tx.accountsReceivable.update({ where: { id: row.id }, data: { clientId: targetClientId, metadata: mergedMetadata(row) } });
            }
            const moved = { financialRecords: records.length, receivables: debts.length };
            await tx.financialAuditEvent.create({
                data: {
                    entityType: 'Client',
                    entityId: targetClientId,
                    action: 'UPDATE',
                    before: { sourceClientId, sourceLabel, clients },
                    after: { targetClientId, moved, recordIds: records.map((row) => row.id), receivableIds: debts.map((row) => row.id) },
                    actorId
                }
            });

            return { clients, moved };
        });

        if (!result) {
            return res.status(404).json({
                error: 'FINANCIAL_CLIENT_LINK_NOT_FOUND',
                message: 'No encontramos uno de los clientes para conciliar.'
            });
        }

        return res.json({
            message: 'Cliente financiero conciliado correctamente.',
            ...result
        });
    } catch (error) {
        console.error('[Financials API] Client link failed:', error.response?.data || error);
        return res.status(500).json({
            error: 'FINANCIAL_CLIENT_LINK_FAILED',
            message: 'No fue posible conciliar el cliente financiero.'
        });
    }
};

export const getFinancialReceivablesLedger = async (req, res, dependencies = {}) => {
    const prismaClient = dependencies.prismaClient || prisma;

    try {
        const year = parseInt(req.query.year, 10) || 2026;
        const where = withFinancialSearch({ year, ...financialMonthFilter(req.query) }, req.query.q, 'receivable');
        const receivables = await prismaClient.accountsReceivable.findMany({
            where,
            include: {
                client: {
                    select: {
                        name: true,
                        slug: true,
                        // La identidad del tercero viaja con la obligación para que la
                        // pantalla sepa si puede emitir sin preguntarle al servidor, y
                        // pueda ofrecer completarla sin salir de Cartera.
                        legalName: true,
                        documentType: true,
                        documentNumber: true
                    }
                },
                payments: {
                    include: {
                        account: { select: { id: true, name: true } },
                        financialRecord: {
                            select: {
                                id: true,
                                documents: { where: { voidedAt: null }, orderBy: { uploadedAt: 'asc' }, select: { id: true, name: true, mimeType: true, size: true } }
                            }
                        },
                        documents: { where: { voidedAt: null }, orderBy: { uploadedAt: 'asc' }, select: { id: true, name: true, mimeType: true, size: true } }
                    },
                    orderBy: { paidAt: 'desc' }
                },
                items: { orderBy: { sortOrder: 'asc' } }
            },
            orderBy: [
                { status: 'asc' },
                { period: 'desc' }
            ]
        });
        const items = receivables.map(serializeReceivable);

        return res.json({
            year,
            totals: buildReceivableTotals(items),
            items
        });
    } catch (error) {
        console.error('[Financials API] Receivables ledger failed:', error.response?.data || error);
        return res.status(error.statusCode || 500).json({
            error: error.code || 'FINANCIAL_RECEIVABLES_LEDGER_FAILED',
            message: error.statusCode ? error.message : 'No fue posible cargar la cartera financiera.'
        });
    }
};

export const updateFinancialReceivable = async (req, res, dependencies = {}) => {
    const prismaClient = dependencies.prismaClient || prisma;
    const updateReceivableService = dependencies.updateReceivableService || updateReceivable;

    try {
        const { id } = req.params;
        const receivable = await updateReceivableService(prismaClient, id, req.body || {}, req.user);

        return res.json({
            message: 'Cartera actualizada correctamente.',
            receivable: serializeReceivable(receivable)
        });
    } catch (error) {
        console.error('[Financials API] Receivable update failed:', error.response?.data || error);
        const statusCode = Number(error?.statusCode) || 500;
        return res.status(statusCode).json({
            error: error?.code || 'FINANCIAL_RECEIVABLE_UPDATE_FAILED',
            message: statusCode >= 500 ? 'No fue posible guardar el cambio de cartera.' : error.message
        });
    }
};

const serializePayrollTransaction = (transaction) => ({
    id: transaction.id,
    month: transaction.month,
    year: transaction.year,
    status: transaction.status,
    baseSalary: toNum(transaction.baseSalary),
    socialSecurity: toNum(transaction.socialSecurity),
    grossAmount: toNum(transaction.grossAmount),
    deductions: toNum(transaction.deductions),
    netAmount: toNum(transaction.netAmount),
    approvedAt: transaction.approvedAt || null,
    paidAt: transaction.paidAt || null,
    financialRecordId: transaction.financialRecordId || null,
    ...serializePayrollPayments(transaction)
});

// Los pagos de una liquidación (30 de septiembre de 2026): cada uno con su cuenta, su
// referencia y los comprobantes vigentes de su egreso. Los revertidos viajan marcados y no suman.
const serializePayrollPayments = (transaction) => {
    const payments = (transaction.payments || []).map((payment) => ({
        id: payment.id,
        amount: toNum(payment.amount),
        paidAt: payment.paidAt instanceof Date ? payment.paidAt.toISOString() : (payment.paidAt || null),
        accountId: payment.accountId || null,
        accountName: payment.account?.name || null,
        reference: payment.reference || null,
        notes: payment.notes || null,
        financialRecordId: payment.financialRecordId || null,
        // Solo se parte lo que creó la plataforma; un adelanto registrado a mano se revierte.
        canSplit: !payment.reversedAt && payment.financialRecord?.origin === 'SYSTEM',
        reversedAt: payment.reversedAt || null,
        reversalReason: payment.reversalReason || null,
        documents: (payment.financialRecord?.documents || []).map((document) => ({
            id: document.id,
            name: document.name,
            mimeType: document.mimeType,
            size: document.size
        }))
    }));
    const paidAmount = roundFloat(payments.filter((payment) => !payment.reversedAt).reduce((sum, payment) => sum + payment.amount, 0));
    return {
        payments,
        paidAmount,
        outstanding: roundFloat(Math.max(toNum(transaction.netAmount) - paidAmount, 0))
    };
};

const serializePayrollContract = (contract) => ({
    id: contract.id,
    collaboratorId: contract.collaboratorId,
    userId: contract.userId,
    name: contract.collaborator?.displayName || contract.user?.name || contract.sourceLabel || 'Colaborador',
    position: contract.position?.title || '',
    baseSalary: toNum(contract.baseSalary),
    socialSecurity: toNum(contract.socialSecurity),
    startDate: contract.startDate || null,
    endDate: contract.endDate || null,
    monthlyTotal: Number.isFinite(Number(contract.metadata?.monthlyTotal))
        ? Number(contract.metadata.monthlyTotal)
        : roundFloat(toNum(contract.baseSalary) + toNum(contract.socialSecurity)),
    transactions: (contract.transactions || []).map(serializePayrollTransaction)
});

export const getFinancialPayrollLedger = async (req, res, dependencies = {}) => {
    const prismaClient = dependencies.prismaClient || prisma;

    try {
        const year = parseInt(req.query.year, 10) || 2026;
        const contracts = await prismaClient.payrollContract.findMany({
            where: withFinancialSearch({ ...LIVE_PAYROLL_CONTRACT }, req.query.q, 'contract'),
            include: {
                collaborator: {
                    select: {
                        displayName: true
                    }
                },
                user: {
                    select: {
                        name: true
                    }
                },
                position: {
                    select: {
                        title: true
                    }
                },
                transactions: {
                    where: { year },
                    orderBy: { month: 'desc' },
                    include: {
                        payments: {
                            orderBy: [{ paidAt: 'asc' }, { createdAt: 'asc' }],
                            include: {
                                account: { select: { id: true, name: true } },
                                financialRecord: {
                                    select: {
                                        id: true,
                                        origin: true,
                                        documents: { where: { voidedAt: null }, orderBy: { uploadedAt: 'asc' }, select: { id: true, name: true, mimeType: true, size: true } }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            orderBy: {
                sourceRow: 'asc'
            }
        });

        return res.json({
            year,
            items: contracts.map(serializePayrollContract)
        });
    } catch (error) {
        console.error('[Financials API] Payroll ledger failed:', error.response?.data || error);
        return res.status(error.statusCode || 500).json({
            error: error.code || 'FINANCIAL_PAYROLL_LEDGER_FAILED',
            message: error.statusCode ? error.message : 'No fue posible cargar la nomina financiera.'
        });
    }
};

export const updateFinancialPayrollContract = async (req, res, dependencies = {}) => {
    const prismaClient = dependencies.prismaClient || prisma;
    const updatePayrollContractService = dependencies.updatePayrollContractService || updatePayrollContract;

    try {
        const { id } = req.params;
        const contract = await updatePayrollContractService(prismaClient, id, req.body || {}, req.user);

        return res.json({
            message: 'Nomina actualizada correctamente.',
            contract: serializePayrollContract(contract)
        });
    } catch (error) {
        console.error('[Financials API] Payroll contract update failed:', error.response?.data || error);
        const statusCode = Number(error?.statusCode) || 500;
        return res.status(statusCode).json({
            error: error?.code || 'FINANCIAL_PAYROLL_UPDATE_FAILED',
            message: statusCode >= 500 ? 'No fue posible guardar el cambio de nomina.' : error.message
        });
    }
};

export const createFinancialPayrollContract = async (req, res, dependencies = {}) => {
    const prismaClient = dependencies.prismaClient || prisma;
    const createPayrollContractService = dependencies.createPayrollContractService || createPayrollContract;
    try {
        const contract = await createPayrollContractService(prismaClient, req.body || {}, req.user);
        return res.status(201).json({
            message: 'Contrato de nómina creado.',
            contract
        });
    } catch (error) {
        console.error('[Financials API] Payroll contract create failed:', error.response?.data || error);
        const statusCode = Number(error?.statusCode) || 500;
        return res.status(statusCode).json({
            error: error?.code || 'FINANCIAL_PAYROLL_CREATE_FAILED',
            message: statusCode >= 500 ? 'No fue posible crear el contrato de nómina.' : error.message
        });
    }
};

export const getFinancialDashboard = async (req, res, dependencies = {}) => {
    const prismaClient = dependencies.prismaClient || prisma;

    try {
        const year = parseInt(req.query.year) || 2026;
        const quarter = parseInt(req.query.quarter);
        const requestedScenario = String(req.query.scenario || 'ACTUAL').toUpperCase();
        const scenario = ['ACTUAL', 'FORECAST', 'BUDGET'].includes(requestedScenario)
            ? requestedScenario
            : 'ACTUAL';

        // 1. Determine Date Boundaries
        let startMonth = 0; // 0-indexed (January)
        let endMonth = 12;  // 12 is exclusive boundary (January of next year)

        if (quarter >= 1 && quarter <= 4) {
            startMonth = (quarter - 1) * 3;
            endMonth = startMonth + 3;
        }

        const selectedMonth = Number(req.query.month);
        if (Number.isInteger(selectedMonth) && selectedMonth >= 1 && selectedMonth <= 12) {
            startMonth = selectedMonth - 1;
            endMonth = selectedMonth;
        }
        const monthStart = startMonth + 1;
        const monthEnd = endMonth;

        // --- SECTION 1: CASH FLOW & CATEGORIES DISTRIBUTION ---
        const financialRecordWhere = {
            year,
            month: {
                gte: monthStart,
                lte: monthEnd
            },
            scenario,
            status: 'POSTED'
        };

        // La categoría llega de la barra de filtros. Se comprueba contra el catálogo:
        // un valor inventado no puede vaciar el tablero como si no hubiera movimientos.
        const requestedCategory = String(req.query.category || '').trim().toUpperCase();
        const categoryFilter = FINANCIAL_CATEGORIES.has(requestedCategory) ? { category: requestedCategory } : {};
        const financialRecords = await prismaClient.financialRecord.findMany({
            where: withFinancialSearch({
                ...financialRecordWhere,
                ...categoryFilter,
                ...(['INCOME', 'EXPENSE'].includes(req.query.type) ? { type: req.query.type } : {})
            }, req.query.q),
            include: {
                client: { select: { name: true, slug: true } },
                allocations: { select: { amount: true, category: true } }
            }
        });

        // Group cash flow by month
        const monthlyGroups = {};

        // Categories start at 0 so unused ones still appear. A movement with an internal breakdown
        // contributes its lines to the distribution; the cash flow below still uses the movement itself.
        const allCategories = ['MEMBRESIA', 'SERVICIO', 'PAUTA', 'NOMINA', 'LOGISTICA', 'ADMINISTRATIVO', 'TAX', 'FINANCIAL', 'OPERATIVO', 'DONACION', 'SIEMBRA', 'PRESTAMO'];
        const categoriesDistribution = accumulateCategoryDistribution(financialRecords, allCategories);

        for (const record of financialRecords) {
            const amount = toNum(record.amount);
            const type = record.type; // INCOME or EXPENSE
            const rDate = new Date(record.date);
            const rMonth = rDate.getUTCMonth() + 1; // 1-12
            const rYear = rDate.getUTCFullYear();

            // Accumulate in monthly cash flow
            const key = `${rYear}-${String(rMonth).padStart(2, '0')}`;
            if (!monthlyGroups[key]) {
                monthlyGroups[key] = {
                    year: rYear,
                    month: rMonth,
                    income: 0,
                    expense: 0,
                    netFlow: 0
                };
            }

            if (type === 'INCOME') {
                monthlyGroups[key].income = roundFloat(monthlyGroups[key].income + amount);
            } else {
                monthlyGroups[key].expense = roundFloat(monthlyGroups[key].expense + amount);
            }
            monthlyGroups[key].netFlow = roundFloat(monthlyGroups[key].income - monthlyGroups[key].expense);
        }

        // Convert monthlyGroups to sorted array
        const cashFlowFromRecords = Object.values(monthlyGroups).sort((a, b) => {
            if (a.year !== b.year) return a.year - b.year;
            return a.month - b.month;
        });
        const cashFlow = cashFlowFromRecords;


        // --- SECTION 2: ACCOUNTS RECEIVABLE (CARTERA MOROSA) ---
        // Promising a payment does not settle the debt.
        const receivables = await prismaClient.accountsReceivable.findMany({
            where: withFinancialSearch({
                status: { in: ['DEBE', 'PROMESADO'] },
                year,
                ...financialMonthFilter(req.query)
            }, req.query.q, 'receivable'),
            include: {
                client: {
                    select: {
                        name: true,
                        slug: true
                    }
                },
                payments: { where: ACTIVE_RECEIVABLE_PAYMENT, select: { amount: true } }
            },
            orderBy: {
                period: 'desc'
            }
        });

        // Group outstanding debts by client
        const clientReceivableMap = {};

        for (const rec of receivables) {
            // Un préstamo a un colaborador no tiene cliente: se agrupa por el nombre del tercero.
            const clientId = rec.clientId || `loan:${rec.counterpartyName || rec.sourceLabel || rec.id}`;
            const clientName = rec.client?.name || rec.counterpartyName || 'Cliente Desconocido';
            const clientSlug = rec.client?.slug || 'cliente-desconocido';
            const paidAmount = (rec.payments || []).reduce((sum, payment) => sum + toNum(payment.amount), 0);
            const amount = roundFloat(Math.max(toNum(rec.amount) - paidAmount, 0));

            if (!clientReceivableMap[clientId]) {
                clientReceivableMap[clientId] = {
                    clientId,
                    client: {
                        name: clientName,
                        slug: clientSlug
                    },
                    totalOutstanding: 0,
                    debts: []
                };
            }

            clientReceivableMap[clientId].totalOutstanding = roundFloat(clientReceivableMap[clientId].totalOutstanding + amount);
            clientReceivableMap[clientId].debts.push({
                id: rec.id,
                period: rec.period,
                amount,
                dueDate: rec.dueDate,
                status: rec.status,
                notes: rec.notes
            });
        }

        // Convert receivables to array sorted by totalOutstanding descending
        const accountsReceivable = Object.values(clientReceivableMap).sort((a, b) => b.totalOutstanding - a.totalOutstanding);
        const recordTotals = cashFlow.reduce((totals, month) => ({
            income: roundFloat(totals.income + month.income),
            expense: roundFloat(totals.expense + month.expense),
            netFlow: roundFloat(totals.netFlow + month.netFlow)
        }), { income: 0, expense: 0, netFlow: 0 });
        const receivableTotal = accountsReceivable.reduce(
            (sum, item) => roundFloat(sum + item.totalOutstanding),
            0
        );
        // Lo que entró como reintegro de préstamos no es venta (Rodny, 20 de octubre de 2026):
        // va dentro de los ingresos registrados, pero el tablero lo dice aparte.
        const loanRepayments = roundFloat(financialRecords
            .filter((record) => record.type === 'INCOME' && record.category === 'PRESTAMO')
            .reduce((sum, record) => sum + toNum(record.amount), 0));
        const loansGranted = roundFloat(financialRecords
            .filter((record) => record.type === 'EXPENSE' && record.category === 'PRESTAMO')
            .reduce((sum, record) => sum + toNum(record.amount), 0));
        const sourceSummary = {
            scenario,
            totals: {
                income: recordTotals.income,
                expense: recordTotals.expense,
                netFlow: recordTotals.netFlow,
                receivable: receivableTotal,
                loanRepayments,
                loansGranted
            }
        };


        // --- SECTION 3: DYNAMIC PAYROLL CONSOLIDATION ---
        // Filter transactions for the requested year & month bounds
        const payrollTransactions = await prismaClient.payrollTransaction.findMany({
            where: withFinancialSearch({
                year: year,
                month: {
                    gte: monthStart,
                    lte: monthEnd
                }
            }, req.query.q, 'payroll'),
            include: {
                user: {
                    select: {
                        name: true,
                        email: true
                    }
                },
                contract: {
                    include: {
                        collaborator: {
                            select: {
                                displayName: true
                            }
                        },
                        position: {
                            select: {
                                title: true
                            }
                        }
                    }
                },
                adjustments: true
            }
        });

        const collaboratorPayrollMap = {};
        let totalPayrollCost = 0;

        for (const tx of payrollTransactions) {
            const collaboratorKey = tx.contract?.collaboratorId || tx.userId || tx.contractId;
            const userId = tx.userId || null;
            const userName = tx.contract?.collaborator?.displayName || tx.user?.name || tx.contract?.sourceLabel || 'Colaborador';
            const userEmail = tx.user?.email || '';

            const baseSalary = toNum(tx.baseSalary) || toNum(tx.contract?.baseSalary);
            const socialSecurity = toNum(tx.socialSecurity) || toNum(tx.contract?.socialSecurity);

            // Compute algebraic adjustments total
            let adjustmentsTotal = 0;
            const adjustmentsList = [];

            for (const adj of tx.adjustments) {
                const adjAmount = toNum(adj.amount);
                const adjType = adj.type; // BONUS, COMMISSION, DEDUCTION, NOVELTY
                let algebraicValue = 0;

                if (adjType === 'BONUS' || adjType === 'COMMISSION') {
                    algebraicValue = adjAmount;
                } else if (adjType === 'DEDUCTION') {
                    algebraicValue = -adjAmount;
                } else if (adjType === 'NOVELTY') {
                    // Novelty adds if positive, subtracts if negative
                    algebraicValue = adjAmount;
                }

                adjustmentsTotal = roundFloat(adjustmentsTotal + algebraicValue);
                adjustmentsList.push({
                    id: adj.id,
                    type: adjType,
                    amount: adjAmount,
                    description: adj.description
                });
            }

            const totalPaid = toNum(tx.netAmount) || roundFloat(baseSalary + socialSecurity + adjustmentsTotal);

            if (!collaboratorPayrollMap[collaboratorKey]) {
                collaboratorPayrollMap[collaboratorKey] = {
                    userId,
                    collaboratorId: tx.contract?.collaboratorId || null,
                    contractId: tx.contractId,
                    name: userName,
                    email: userEmail,
                    position: tx.contract?.position?.title || '',
                    baseSalary: 0,
                    socialSecurity: 0,
                    adjustmentsTotal: 0,
                    totalPaid: 0,
                    adjustments: []
                };
            }

            collaboratorPayrollMap[collaboratorKey].baseSalary = roundFloat(collaboratorPayrollMap[collaboratorKey].baseSalary + baseSalary);
            collaboratorPayrollMap[collaboratorKey].socialSecurity = roundFloat(collaboratorPayrollMap[collaboratorKey].socialSecurity + socialSecurity);
            collaboratorPayrollMap[collaboratorKey].adjustmentsTotal = roundFloat(collaboratorPayrollMap[collaboratorKey].adjustmentsTotal + adjustmentsTotal);
            collaboratorPayrollMap[collaboratorKey].totalPaid = roundFloat(collaboratorPayrollMap[collaboratorKey].totalPaid + totalPaid);
            collaboratorPayrollMap[collaboratorKey].adjustments.push(...adjustmentsList);

            totalPayrollCost = roundFloat(totalPayrollCost + totalPaid);
        }

        const collaborators = Object.values(collaboratorPayrollMap);

        // --- SECTION 4: UNIFIED JSON CONTRACT ---
        res.json({
            cashFlow,
            categoriesDistribution,
            accountsReceivable,
            sourceSummary,
            payroll: {
                totalPayrollCost,
                collaborators
            }
        });

    } catch (error) {
        console.error('[Financials API] Dashboard analytical aggregation failed:', error.response?.data || error);
        res.status(error.statusCode || 500).json({ error: error.code || 'FINANCIAL_DASHBOARD_FAILED', message: error.statusCode ? error.message : 'No fue posible cargar los indicadores financieros.' });
    }
};
