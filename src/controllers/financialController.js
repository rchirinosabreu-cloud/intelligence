import prisma from '../lib/prisma.js';
import {
    buildFinancialImportPersistencePlan,
    parseFinancialImportWorkbook,
    persistFinancialImportPlan
} from '../services/financialImportService.js';

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

const buildCashFlowFromSummaries = (summaries) => summaries.map((summary) => {
    const income = toNum(summary.explicitIncome) || toNum(summary.calculatedIncome);
    const expense = roundFloat(
        (toNum(summary.explicitAdminCost) || toNum(summary.calculatedAdminCost)) +
        (toNum(summary.explicitOperatingExpense) || toNum(summary.calculatedOperatingExpense)) +
        (toNum(summary.explicitFinancing) || toNum(summary.calculatedFinancing))
    );
    const explicitNet = toNum(summary.netResult);

    return {
        year: summary.year,
        month: summary.month,
        income,
        expense,
        netFlow: explicitNet || roundFloat(income - expense)
    };
});

export const getFinancialDashboard = async (req, res, dependencies = {}) => {
    const prismaClient = dependencies.prismaClient || prisma;

    try {
        const year = parseInt(req.query.year) || 2026;
        const quarter = parseInt(req.query.quarter);

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
        const importedBatchFilter = activeImportBatch?.id ? { importBatchId: activeImportBatch.id } : {};

        // --- SECTION 1: CASH FLOW & CATEGORIES DISTRIBUTION ---
        const financialRecordWhere = activeImportBatch?.id
            ? {
                year,
                month: {
                    gte: monthStart,
                    lte: monthEnd
                },
                importBatchId: activeImportBatch.id
            }
            : {
                date: {
                    gte: dateStart,
                    lt: dateEnd
                }
            };

        const financialRecords = await prismaClient.financialRecord.findMany({
            where: financialRecordWhere,
            include: {
                client: { select: { name: true, slug: true } }
            }
        });

        const monthlySummaries = activeImportBatch?.id
            ? await prismaClient.financialMonthlySummary.findMany({
                where: {
                    year,
                    month: {
                        gte: monthStart,
                        lte: monthEnd
                    },
                    importBatchId: activeImportBatch.id
                },
                orderBy: {
                    month: 'asc'
                }
            })
            : [];

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
            const rMonth = rDate.getMonth() + 1; // 1-12
            const rYear = rDate.getFullYear();

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
        const cashFlow = monthlySummaries.length > 0
            ? buildCashFlowFromSummaries(monthlySummaries)
            : cashFlowFromRecords;


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
                }
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
            const amount = toNum(rec.amount);

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
        const sourceSummary = activeImportBatch?.id ? {
            importBatchId: activeImportBatch.id,
            totals: {
                income: toNum(explicitImportTotals.income),
                expense: toNum(explicitImportTotals.totalCostAndExpense) || (
                    toNum(explicitImportTotals.expense) +
                    toNum(explicitImportTotals.operatingExpense) +
                    toNum(explicitImportTotals.financing)
                ),
                netFlow: toNum(explicitImportTotals.netResult),
                receivable: toNum(explicitImportTotals.debt),
                calculatedReceivable: toNum(calculatedImportTotals.debt)
            }
        } : null;


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
                contract: true,
                adjustments: true
            }
        });

        const collaboratorPayrollMap = {};
        let totalPayrollCost = 0;

        for (const tx of payrollTransactions) {
            const userId = tx.userId;
            const userName = tx.user?.name || 'Colaborador';
            const userEmail = tx.user?.email || '';

            const baseSalary = toNum(tx.contract?.baseSalary);
            const socialSecurity = toNum(tx.contract?.socialSecurity);

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

            const totalPaid = roundFloat(baseSalary + socialSecurity + adjustmentsTotal);

            if (!collaboratorPayrollMap[userId]) {
                collaboratorPayrollMap[userId] = {
                    userId,
                    name: userName,
                    email: userEmail,
                    baseSalary: 0,
                    socialSecurity: 0,
                    adjustmentsTotal: 0,
                    totalPaid: 0,
                    adjustments: []
                };
            }

            collaboratorPayrollMap[userId].baseSalary = roundFloat(collaboratorPayrollMap[userId].baseSalary + baseSalary);
            collaboratorPayrollMap[userId].socialSecurity = roundFloat(collaboratorPayrollMap[userId].socialSecurity + socialSecurity);
            collaboratorPayrollMap[userId].adjustmentsTotal = roundFloat(collaboratorPayrollMap[userId].adjustmentsTotal + adjustmentsTotal);
            collaboratorPayrollMap[userId].totalPaid = roundFloat(collaboratorPayrollMap[userId].totalPaid + totalPaid);
            collaboratorPayrollMap[userId].adjustments.push(...adjustmentsList);

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
                return {
                    userId: contract.userId,
                    name: contract.user?.name || contract.sourceLabel || 'Colaborador',
                    email: contract.user?.email || '',
                    position: contract.position?.title || '',
                    baseSalary,
                    socialSecurity,
                    adjustmentsTotal: 0,
                    totalPaid: roundFloat(baseSalary + socialSecurity),
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
        const preview = parseFinancialImportWorkbook(req.file.buffer, {
            filename: req.file.originalname,
            year
        });

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
        const plan = buildPlan(req.file.buffer, {
            filename: req.file.originalname,
            year,
            importedById: req.user?.id || null
        });
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
