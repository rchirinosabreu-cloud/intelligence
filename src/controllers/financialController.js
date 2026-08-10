import prisma from '../lib/prisma.js';
import {
    buildFinancialImportPersistencePlan,
    parseFinancialImportWorkbook,
    persistFinancialImportPlan
} from '../services/financialImportService.js';
import { updateReceivable } from '../services/financialReceivableService.js';
import { createPayrollContract, updatePayrollContract } from '../services/financialPayrollContractService.js';

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

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const MONTHLY_LEDGER_FIELDS = [
    { key: 'explicitIncome', label: 'Ingresos', tone: 'income' },
    { key: 'explicitAdminCost', label: 'Costos administrativos', tone: 'expense' },
    { key: 'explicitOperatingExpense', label: 'Gastos operativos', tone: 'expense' },
    { key: 'explicitFinancing', label: 'Financiacion / inversion', tone: 'financing' },
    { key: 'explicitDebt', label: 'Cartera / morosos', tone: 'warning' },
    { key: 'netResult', label: 'Resultado del ejercicio', tone: 'net' }
];

const buildMonthlyLedgerPayload = (activeImportBatch, summaries) => {
    const summaryByMonth = new Map(summaries.map((summary) => [summary.month, summary]));

    return {
        year: activeImportBatch.year,
        importBatchId: activeImportBatch.id,
        months: MONTH_LABELS.map((label, index) => ({
            month: index + 1,
            label
        })),
        rows: MONTHLY_LEDGER_FIELDS.map((field) => ({
            ...field,
            values: Array.from({ length: 12 }, (_, index) => {
                const month = index + 1;
                const summary = summaryByMonth.get(month);
                return {
                    summaryId: summary?.id || null,
                    month,
                    amount: summary ? toNum(summary[field.key]) : 0
                };
            })
        }))
    };
};

export const getFinancialMonthlyLedger = async (req, res, dependencies = {}) => {
    const prismaClient = dependencies.prismaClient || prisma;

    try {
        const year = parseInt(req.query.year, 10) || 2026;
        const activeImportBatch = await prismaClient.financialImportBatch.findFirst({
            where: {
                year,
                status: 'IMPORTED'
            },
            orderBy: {
                createdAt: 'desc'
            },
            select: {
                id: true,
                year: true
            }
        });

        if (!activeImportBatch?.id) {
            return res.json({
                year,
                importBatchId: null,
                months: MONTH_LABELS.map((label, index) => ({ month: index + 1, label })),
                rows: MONTHLY_LEDGER_FIELDS.map((field) => ({ ...field, values: [] }))
            });
        }

        const summaries = await prismaClient.financialMonthlySummary.findMany({
            where: {
                year,
                importBatchId: activeImportBatch.id
            },
            orderBy: {
                month: 'asc'
            }
        });

        return res.json(buildMonthlyLedgerPayload(activeImportBatch, summaries));
    } catch (error) {
        console.error('[Financials API] Monthly ledger failed:', error.response?.data || error);
        return res.status(500).json({
            error: 'FINANCIAL_MONTHLY_LEDGER_FAILED',
            message: 'No fue posible cargar el editor financiero mensual.'
        });
    }
};

export const updateFinancialMonthlySummary = async (req, res, dependencies = {}) => {
    return res.status(409).json({
        error: 'FINANCIAL_SUMMARY_READ_ONLY',
        message: 'Los resúmenes son referencias de conciliación. Registra o corrige los movimientos financieros para actualizar los resultados.'
    });
};

const serializeReceivable = (receivable) => {
    const amount = toNum(receivable.amount);
    const payments = (receivable.payments || []).map((payment) => ({
        id: payment.id,
        amount: toNum(payment.amount),
        paidAt: payment.paidAt instanceof Date ? payment.paidAt.toISOString() : payment.paidAt,
        reference: payment.reference,
        notes: payment.notes,
        account: payment.account || null
    }));
    const paidAmount = roundFloat(payments.reduce((sum, payment) => sum + payment.amount, 0));

    return {
        id: receivable.id,
        clientName: receivable.client?.name || receivable.sourceLabel || 'Cliente sin nombre',
        clientSlug: receivable.client?.slug || null,
        amount,
        paidAmount,
        outstanding: roundFloat(Math.max(amount - paidAmount, 0)),
        period: receivable.period instanceof Date ? receivable.period.toISOString() : receivable.period,
        month: receivable.month,
        year: receivable.year,
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
    totals.outstandingTotal = roundFloat(totals.outstandingTotal + toNum(item.outstanding));
    totals.total = totals.outstandingTotal;
    return totals;
}, {
    DEBE: 0,
    PAGADO: 0,
    PROMESADO: 0,
    originalTotal: 0,
    paidTotal: 0,
    outstandingTotal: 0,
    total: 0
});

const serializeClientTarget = (client) => ({
    id: client.id,
    name: client.name,
    slug: client.slug
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
        if (receivable.status === 'DEBE') {
            row.receivable = roundFloat(row.receivable + toNum(receivable.amount));
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
        const activeImportBatch = await prismaClient.financialImportBatch.findFirst({
            where: {
                year,
                status: 'IMPORTED'
            },
            orderBy: {
                createdAt: 'desc'
            },
            select: {
                id: true,
                year: true
            }
        });

        const importBatchFilter = activeImportBatch?.id ? { importBatchId: activeImportBatch.id } : {};
        const [records, receivables, targets] = await Promise.all([
            prismaClient.financialRecord.findMany({
                where: {
                    year,
                    ...importBatchFilter
                },
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
                where: {
                    year,
                    ...importBatchFilter
                },
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
            prismaClient.client.findMany({
                where: {
                    isArchived: false
                },
                select: {
                    id: true,
                    name: true,
                    slug: true
                },
                orderBy: {
                    name: 'asc'
                }
            })
        ]);

        return res.json({
            year,
            importBatchId: activeImportBatch?.id || null,
            clients: buildClientReconciliationRows(records, receivables),
            targets: targets.map(serializeClientTarget)
        });
    } catch (error) {
        console.error('[Financials API] Client reconciliation failed:', error.response?.data || error);
        return res.status(500).json({
            error: 'FINANCIAL_CLIENT_RECONCILIATION_FAILED',
            message: 'No fue posible cargar la conciliacion de clientes financieros.'
        });
    }
};

export const linkFinancialClient = async (req, res, dependencies = {}) => {
    const prismaClient = dependencies.prismaClient || prisma;

    try {
        const { sourceClientId } = req.params;
        const { targetClientId } = req.body || {};
        const isSourceLabel = sourceClientId?.startsWith(SOURCE_LABEL_PREFIX);
        const sourceLabel = isSourceLabel
            ? decodeURIComponent(sourceClientId.slice(SOURCE_LABEL_PREFIX.length))
            : null;

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

            const trace = {
                reconciledFromClientId: sourceClientId,
                reconciledToClientId: targetClientId,
                reconciledBy: req.user?.id || null,
                reconciledAt: new Date().toISOString()
            };
            const sourceWhere = isSourceLabel
                ? { clientId: null, sourceLabel, type: 'INCOME' }
                : { clientId: sourceClientId };
            const [financialRecords, receivables] = await Promise.all([
                tx.financialRecord.updateMany({
                    where: sourceWhere,
                    data: {
                        clientId: targetClientId,
                        metadata: trace
                    }
                }),
                tx.accountsReceivable.updateMany({
                    where: isSourceLabel ? { id: '__never__' } : { clientId: sourceClientId },
                    data: {
                        clientId: targetClientId,
                        metadata: trace
                    }
                })
            ]);

            return {
                clients,
                moved: {
                    financialRecords: financialRecords.count,
                    receivables: receivables.count
                }
            };
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
        const activeImportBatch = await prismaClient.financialImportBatch.findFirst({
            where: {
                year,
                status: 'IMPORTED'
            },
            orderBy: {
                createdAt: 'desc'
            },
            select: {
                id: true,
                year: true
            }
        });

        const where = activeImportBatch?.id
            ? { year, OR: [{ importBatchId: activeImportBatch.id }, { importBatchId: null, origin: 'MANUAL' }] }
            : { year };
        const receivables = await prismaClient.accountsReceivable.findMany({
            where,
            include: {
                client: {
                    select: {
                        name: true,
                        slug: true
                    }
                },
                payments: {
                    include: {
                        account: { select: { id: true, name: true } }
                    },
                    orderBy: { paidAt: 'desc' }
                }
            },
            orderBy: [
                { status: 'asc' },
                { period: 'desc' }
            ]
        });
        const items = receivables.map(serializeReceivable);

        return res.json({
            year,
            importBatchId: activeImportBatch?.id || null,
            totals: buildReceivableTotals(items),
            items
        });
    } catch (error) {
        console.error('[Financials API] Receivables ledger failed:', error.response?.data || error);
        return res.status(500).json({
            error: 'FINANCIAL_RECEIVABLES_LEDGER_FAILED',
            message: 'No fue posible cargar la cartera financiera.'
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
    financialRecordId: transaction.financialRecordId || null
});

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
        const activeImportBatch = await prismaClient.financialImportBatch.findFirst({
            where: {
                year,
                status: 'IMPORTED'
            },
            orderBy: {
                createdAt: 'desc'
            },
            select: {
                id: true,
                year: true
            }
        });

        const contracts = await prismaClient.payrollContract.findMany({
            where: activeImportBatch?.id
                ? { OR: [{ importBatchId: activeImportBatch.id }, { importBatchId: null }] }
                : { importBatchId: null },
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
                    orderBy: { month: 'desc' }
                }
            },
            orderBy: {
                sourceRow: 'asc'
            }
        });

        return res.json({
            year,
            importBatchId: activeImportBatch?.id || null,
            items: contracts.map(serializePayrollContract)
        });
    } catch (error) {
        console.error('[Financials API] Payroll ledger failed:', error.response?.data || error);
        return res.status(500).json({
            error: 'FINANCIAL_PAYROLL_LEDGER_FAILED',
            message: 'No fue posible cargar la nomina financiera.'
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

        const dateStart = new Date(Date.UTC(year, startMonth, 1));
        const dateEnd = new Date(Date.UTC(year, endMonth, 1));
        const monthStart = startMonth + 1;
        const monthEnd = endMonth;

        console.log(`[Financials API] Query bounds: ${dateStart.toISOString()} to ${dateEnd.toISOString()}`);

        const activeImportBatch = await prismaClient.financialImportBatch.findFirst({
            where: {
                year,
                status: 'IMPORTED'
            },
            orderBy: {
                createdAt: 'desc'
            },
            select: {
                id: true,
                summary: true
            }
        });
        const importedBatchFilter = activeImportBatch?.id
            ? { OR: [{ importBatchId: activeImportBatch.id }, { importBatchId: null, origin: 'MANUAL' }] }
            : {};

        // --- SECTION 1: CASH FLOW & CATEGORIES DISTRIBUTION ---
        const financialRecordWhere = {
            year,
            month: {
                gte: monthStart,
                lte: monthEnd
            },
            scenario,
            status: 'POSTED',
            ...(activeImportBatch?.id
                ? { OR: [{ importBatchId: activeImportBatch.id }, { importBatchId: null }] }
                : {
                    date: {
                        gte: dateStart,
                        lt: dateEnd
                    }
                })
        };

        const financialRecords = await prismaClient.financialRecord.findMany({
            where: financialRecordWhere,
            include: {
                client: { select: { name: true, slug: true } }
            }
        });

        // Group cash flow by month
        const monthlyGroups = {};
        const categoriesDistribution = {
            INCOME: {},
            EXPENSE: {}
        };

        // Initialize categories with 0 values
        const allCategories = ['MEMBRESIA', 'PAUTA', 'NOMINA', 'LOGISTICA', 'ADMINISTRATIVO', 'TAX', 'FINANCIAL', 'OPERATIVO'];
        allCategories.forEach(cat => {
            categoriesDistribution.INCOME[cat] = 0;
            categoriesDistribution.EXPENSE[cat] = 0;
        });

        for (const record of financialRecords) {
            const amount = toNum(record.amount);
            const type = record.type; // INCOME or EXPENSE
            const category = record.category;
            const rDate = new Date(record.date);
            const rMonth = rDate.getUTCMonth() + 1; // 1-12
            const rYear = rDate.getUTCFullYear();

            // Accumulate in global categories distribution
            if (categoriesDistribution[type][category] !== undefined) {
                categoriesDistribution[type][category] = roundFloat(categoriesDistribution[type][category] + amount);
            } else {
                categoriesDistribution[type][category] = amount;
            }

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
        // Fetch all receivables that are strictly unpaid ('DEBE')
        const receivables = await prismaClient.accountsReceivable.findMany({
            where: {
                status: 'DEBE',
                year,
                ...importedBatchFilter
            },
            include: {
                client: {
                    select: {
                        name: true,
                        slug: true
                    }
                },
                payments: { select: { amount: true } }
            },
            orderBy: {
                period: 'desc'
            }
        });

        // Group outstanding debts by client
        const clientReceivableMap = {};

        for (const rec of receivables) {
            const clientId = rec.clientId;
            const clientName = rec.client?.name || 'Cliente Desconocido';
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
        const explicitImportTotals = activeImportBatch?.summary?.totals?.explicit || {};
        const calculatedImportTotals = activeImportBatch?.summary?.totals?.calculated || {};
        const recordTotals = cashFlow.reduce((totals, month) => ({
            income: roundFloat(totals.income + month.income),
            expense: roundFloat(totals.expense + month.expense),
            netFlow: roundFloat(totals.netFlow + month.netFlow)
        }), { income: 0, expense: 0, netFlow: 0 });
        const receivableTotal = accountsReceivable.reduce(
            (sum, item) => roundFloat(sum + item.totalOutstanding),
            0
        );
        const importedExpense = toNum(explicitImportTotals.totalCostAndExpense) || (
            toNum(explicitImportTotals.expense) +
            toNum(explicitImportTotals.operatingExpense) +
            toNum(explicitImportTotals.financing)
        );
        const sourceSummary = {
            importBatchId: activeImportBatch?.id || null,
            scenario,
            totals: {
                income: recordTotals.income,
                expense: recordTotals.expense,
                netFlow: recordTotals.netFlow,
                receivable: receivableTotal,
                calculatedReceivable: toNum(calculatedImportTotals.debt)
            },
            importedTotals: {
                income: toNum(explicitImportTotals.income),
                expense: importedExpense,
                netFlow: toNum(explicitImportTotals.netResult),
                receivable: toNum(explicitImportTotals.debt)
            }
        };


        // --- SECTION 3: DYNAMIC PAYROLL CONSOLIDATION ---
        // Filter transactions for the requested year & month bounds
        const payrollTransactions = await prismaClient.payrollTransaction.findMany({
            where: {
                year: year,
                month: {
                    gte: monthStart,
                    lte: monthEnd
                }
            },
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

        let collaborators = Object.values(collaboratorPayrollMap);

        if (collaborators.length === 0 && activeImportBatch?.id) {
            const importedPayrollContracts = await prismaClient.payrollContract.findMany({
                where: {
                    importBatchId: activeImportBatch.id
                },
                include: {
                    user: {
                        select: {
                            name: true,
                            email: true
                        }
                    },
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
                },
                orderBy: {
                    sourceRow: 'asc'
                }
            });

            collaborators = importedPayrollContracts.map((contract) => {
                const baseSalary = toNum(contract.baseSalary);
                const socialSecurity = toNum(contract.socialSecurity);
                const officialMonthlyTotal = Number.isFinite(Number(contract.metadata?.monthlyTotal))
                    ? Number(contract.metadata.monthlyTotal)
                    : null;
                const totalPaid = officialMonthlyTotal !== null
                    ? officialMonthlyTotal
                    : roundFloat(baseSalary + socialSecurity);
                return {
                    userId: contract.userId,
                    collaboratorId: contract.collaboratorId,
                    contractId: contract.id,
                    name: contract.collaborator?.displayName || contract.user?.name || contract.sourceLabel || 'Colaborador',
                    email: contract.user?.email || '',
                    position: contract.position?.title || '',
                    baseSalary,
                    socialSecurity,
                    adjustmentsTotal: 0,
                    totalPaid,
                    adjustments: []
                };
            });
            totalPayrollCost = collaborators.reduce((sum, collaborator) => roundFloat(sum + collaborator.totalPaid), 0);
        }


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
        console.error("[Financials API] Dashboard analytical aggregation failed:", error);
        res.status(500).json({ error: "Failed to compile financial intelligence data dashboard" });
    }
};

export const previewFinancialImport = async (req, res) => {
    try {
        if (!req.file?.buffer) {
            return res.status(400).json({
                error: 'FINANCIAL_IMPORT_FILE_REQUIRED',
                message: 'Debes subir un archivo CSV o Excel para auditar la informacion financiera.'
            });
        }

        const year = parseInt(req.body?.year, 10) || 2026;
        const actualThroughMonth = parseInt(req.body?.actualThroughMonth, 10);
        const importOptions = {
            filename: req.file.originalname,
            year
        };
        if (Number.isInteger(actualThroughMonth)) importOptions.actualThroughMonth = actualThroughMonth;
        const preview = parseFinancialImportWorkbook(req.file.buffer, importOptions);

        return res.json(preview);
    } catch (error) {
        console.error('[Financials API] Import preview failed:', error);
        return res.status(500).json({
            error: 'FINANCIAL_IMPORT_PREVIEW_FAILED',
            message: 'No fue posible leer el archivo financiero. Revisa el formato e intenta nuevamente.'
        });
    }
};

export const commitFinancialImport = async (req, res, dependencies = {}) => {
    const buildPlan = dependencies.buildPlan || buildFinancialImportPersistencePlan;
    const persistPlan = dependencies.persistPlan || persistFinancialImportPlan;
    const prismaClient = dependencies.prismaClient || prisma;

    try {
        if (!req.file?.buffer) {
            return res.status(400).json({
                error: 'FINANCIAL_IMPORT_FILE_REQUIRED',
                message: 'Debes subir un archivo CSV o Excel para importar la informacion financiera.'
            });
        }

        const year = parseInt(req.body?.year, 10) || 2026;
        const actualThroughMonth = parseInt(req.body?.actualThroughMonth, 10);
        const importOptions = {
            filename: req.file.originalname,
            year,
            importedById: req.user?.id || null
        };
        if (Number.isInteger(actualThroughMonth)) importOptions.actualThroughMonth = actualThroughMonth;
        const plan = buildPlan(req.file.buffer, importOptions);
        const result = await persistPlan(prismaClient, plan);

        return res.status(201).json({
            message: 'Informacion financiera importada correctamente.',
            importBatchId: result.importBatchId,
            counts: result.counts,
            warnings: plan.preview?.warnings || []
        });
    } catch (error) {
        console.error('[Financials API] Import commit failed:', error.response?.data || error);
        return res.status(500).json({
            error: 'FINANCIAL_IMPORT_COMMIT_FAILED',
            message: 'No fue posible guardar la importacion financiera en la base de datos.',
            details: error.message
        });
    }
};
