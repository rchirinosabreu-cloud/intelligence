import crypto from 'node:crypto';
import XLSX from 'xlsx';

const MONTHS = [
    'Enero',
    'Febrero',
    'Marzo',
    'Abril',
    'Mayo',
    'Junio',
    'Julio',
    'Agosto',
    'Septiembre',
    'Octubre',
    'Noviembre',
    'Diciembre'
];

const TOTAL_LABELS = {
    'total ingresos': 'income',
    'total egresos': 'expense',
    'total costos administrativos': 'expense',
    'total gastos operativos': 'operatingExpense',
    'total costos y gastos': 'totalCostAndExpense',
    'total utilidad': 'utility',
    'total financiamiento': 'financing',
    'resultado del ejercicio': 'netResult'
};

const normalizeText = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const isActualLedgerSheet = (sheetName) => normalizeText(sheetName).startsWith('finanzas brain studio');
const isMembershipProjectionSheet = (sheetName) => normalizeText(sheetName).includes('flujo mensual membresias');

const parseMoney = (value) => {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) return 0;
        return value;
    }

    const raw = String(value).trim();
    if (!raw) return 0;

    const isNegative = raw.includes('-') || raw.includes('(');
    const decimalMatch = /^\(?-?\$?\s*(\d+)[.,](\d{1,2})\)?$/.exec(raw);
    if (decimalMatch) {
        const decimalValue = Number(`${decimalMatch[1]}.${decimalMatch[2]}`);
        return isNegative ? -decimalValue : decimalValue;
    }
    const cleaned = raw
        .replace(/\$/g, '')
        .replace(/\s/g, '')
        .replace(/\./g, '')
        .replace(/,/g, '.')
        .replace(/[^\d.]/g, '');

    const parsed = Number.parseFloat(cleaned);
    if (!Number.isFinite(parsed)) return 0;
    const inferredValue = parsed > 0 && parsed < 1000 && /^\(?-?\d+([.,]\d+)?\)?$/.test(raw)
        ? parsed * 1000
        : parsed;
    return isNegative ? -inferredValue : inferredValue;
};

const classifyExpenseCategory = (label) => {
    const clean = normalizeText(label);

    if (
        clean.includes('nomina') ||
        clean.includes('sueldo') ||
        clean.includes('seguridad social') ||
        clean.includes('arl') ||
        clean.includes('gabriel') ||
        clean.includes('kamila') ||
        clean.includes('elisa') ||
        clean.includes('helen') ||
        clean.includes('rodny')
    ) {
        return 'NOMINA';
    }

    if (clean.includes('pauta') || clean.includes('facebook') || clean.includes('meta')) return 'PAUTA';
    if (clean.includes('impuesto') || clean.includes('rete') || clean.includes('iva') || clean.includes('dian')) return 'TAX';
    if (clean.includes('banco') || clean.includes('interes') || clean.includes('cuota')) return 'FINANCIAL';
    if (clean.includes('legal') || clean.includes('contab') || clean.includes('camara') || clean.includes('administr')) return 'ADMINISTRATIVO';
    if (clean.includes('logistica') || clean.includes('transporte') || clean.includes('envio')) return 'LOGISTICA';

    return 'OPERATIVO';
};

const classifyEntry = (label, section) => {
    if (section === 'INCOME') {
        return {
            type: 'INCOME',
            category: normalizeText(label).includes('interes') ? 'FINANCIAL' : 'MEMBRESIA'
        };
    }

    return {
        type: 'EXPENSE',
        category: classifyExpenseCategory(label)
    };
};

const toFinancialSection = (section) => {
    const sectionMap = {
        INCOME: 'REVENUE',
        EXPENSE: 'ADMIN_COST',
        OPERATING_EXPENSE: 'OPERATING_EXPENSE',
        INVESTMENT: 'INVESTMENT',
        FINANCING: 'FINANCING',
        DEBT: 'RECEIVABLE'
    };

    return sectionMap[section] || 'OTHER';
};

const normalizeReceivableStatus = (status) => {
    const clean = normalizeText(status);
    if (clean.includes('pag')) return 'PAGADO';
    if (clean.includes('prom')) return 'PROMESADO';
    return 'DEBE';
};

const dateFromYearMonth = (year, month) => new Date(Date.UTC(year, month - 1, 1));

const parsePayrollStartDate = (value, fallbackYear) => {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
    }
    const raw = String(value || '').trim();
    if (!raw) return dateFromYearMonth(fallbackYear, 1);

    const dayFirst = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2}|\d{4})$/.exec(raw);
    if (dayFirst) {
        const year = Number(dayFirst[3]) < 100 ? 2000 + Number(dayFirst[3]) : Number(dayFirst[3]);
        return new Date(Date.UTC(year, Number(dayFirst[2]) - 1, Number(dayFirst[1])));
    }

    const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw);
    if (iso) return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));

    const serial = Number(raw);
    if (Number.isFinite(serial) && serial > 1) {
        const parsed = XLSX.SSF.parse_date_code(serial);
        if (parsed?.y && parsed?.m && parsed?.d) return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
    }
    return dateFromYearMonth(fallbackYear, 1);
};

const slugify = (value) => normalizeText(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'registro-financiero';

const compactName = (value) => normalizeText(value).replace(/[^a-z0-9]/g, '');

const findPayrollUser = (users, employeeName) => {
    const normalizedEmployee = normalizeText(employeeName);
    const compactEmployee = compactName(employeeName);
    if (!normalizedEmployee) return null;

    const exactMatch = users.find((user) => normalizeText(user.name) === normalizedEmployee);
    if (exactMatch) return exactMatch;

    if (compactEmployee.length < 4) return null;

    return users.find((user) => {
        const normalizedUser = normalizeText(user.name);
        const compactUser = compactName(user.name);
        return normalizedUser.includes(normalizedEmployee) ||
            normalizedEmployee.includes(normalizedUser) ||
            compactUser.includes(compactEmployee) ||
            compactEmployee.includes(compactUser);
    }) || null;
};

const uniqueBy = (items, getKey) => {
    const seen = new Set();
    return items.filter((item) => {
        const key = getKey(item);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};

const buildMonthlySummaries = (preview) => {
    const explicit = preview.totals?.monthly?.explicit || {};
    const calculated = preview.totals?.monthly?.calculated || {};

    const sourceIsActualLedger = isActualLedgerSheet(preview.sourceSheet);
    const sourceIsMembershipProjection = isMembershipProjectionSheet(preview.sourceSheet);

    return MONTHS.map((_monthName, monthIndex) => {
        const explicitIncome = explicit.income?.[monthIndex] || 0;
        const calculatedIncome = calculated.income?.[monthIndex] || 0;
        const explicitAdminCost = explicit.expense?.[monthIndex] || 0;
        const calculatedAdminCost = calculated.expense?.[monthIndex] || 0;
        const explicitOperatingExpense = explicit.operatingExpense?.[monthIndex] || 0;
        const calculatedOperatingExpense = calculated.operatingExpense?.[monthIndex] || 0;
        const explicitFinancing = explicit.financing?.[monthIndex] || 0;
        const calculatedFinancing = calculated.financing?.[monthIndex] || 0;
        const explicitDebt = explicit.debt?.[monthIndex] || 0;
        const calculatedDebt = calculated.debt?.[monthIndex] || 0;
        const explicitNet = explicit.netResult?.[monthIndex];
        const calculatedNet = calculatedIncome - calculatedAdminCost - calculatedOperatingExpense - calculatedFinancing;

        return {
            year: preview.year,
            month: monthIndex + 1,
            scenario: sourceIsActualLedger
                ? 'ACTUAL'
                : sourceIsMembershipProjection
                    ? 'FORECAST'
                    : preview.actualThroughMonth >= monthIndex + 1 ? 'ACTUAL' : 'FORECAST',
            explicitIncome,
            calculatedIncome,
            explicitAdminCost,
            calculatedAdminCost,
            explicitOperatingExpense,
            calculatedOperatingExpense,
            explicitFinancing,
            calculatedFinancing,
            explicitDebt,
            calculatedDebt,
            netResult: explicitNet || calculatedNet,
            metadata: {
                monthName: MONTHS[monthIndex]
            }
        };
    });
};

const rowsFromSheet = (sheet, rawValues = true) => XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: rawValues,
    blankrows: false,
    defval: ''
});

const readWorkbookContext = (buffer, options = {}) => {
    const workbook = XLSX.read(buffer, { type: 'buffer', raw: false });
    const rawValues = !String(options.filename || '').toLowerCase().endsWith('.csv');
    const sheetNames = workbook.SheetNames;
    const normalizedSheetNames = new Map(sheetNames.map((name) => [normalizeText(name), name]));
    const actualLedgerSheet = sheetNames.find(isActualLedgerSheet);
    const sourceSheet = options.sheetName
        || actualLedgerSheet
        || normalizedSheetNames.get('flujo mensual membresias')
        || sheetNames[0];

    return {
        sheetNames,
        sourceSheet,
        rows: sourceSheet ? rowsFromSheet(workbook.Sheets[sourceSheet], rawValues) : [],
        payrollRows: normalizedSheetNames.get('nomina 2026')
            ? rowsFromSheet(workbook.Sheets[normalizedSheetNames.get('nomina 2026')], rawValues)
            : [],
        debtRows: normalizedSheetNames.get('morosos')
            ? rowsFromSheet(workbook.Sheets[normalizedSheetNames.get('morosos')], rawValues)
            : []
    };
};

const detectLayout = (rows) => {
    const headerIndex = rows.findIndex((row) => {
        const first = normalizeText(row[0]);
        const second = normalizeText(row[1]);
        return first.includes('categor') && second === 'detalle';
    });

    if (headerIndex >= 0) {
        return {
            type: 'CATEGORIZED_MONTHLY',
            headerIndex,
            labelIndex: 1,
            categoryIndex: 0,
            monthStartIndex: 2
        };
    }

    return {
        type: 'LEGACY_HORIZONTAL',
        headerIndex: -1,
        labelIndex: 0,
        categoryIndex: null,
        monthStartIndex: 1
    };
};

const findTotalValue = (row) => {
    const explicitTotal = parseMoney(row[13]);
    if (explicitTotal !== 0) return explicitTotal;

    for (let index = row.length - 1; index >= 1; index -= 1) {
        const value = parseMoney(row[index]);
        if (value !== 0) return value;
    }

    return 0;
};

const emptyMonthlyBuckets = () => ({
    income: Array(12).fill(0),
    expense: Array(12).fill(0),
    operatingExpense: Array(12).fill(0),
    investment: Array(12).fill(0),
    financing: Array(12).fill(0),
    totalCostAndExpense: Array(12).fill(0),
    netResult: Array(12).fill(0),
    debt: Array(12).fill(0)
});

const getMonthlyValues = (row, monthStartIndex) => MONTHS.map((_month, monthIndex) => (
    parseMoney(row[monthStartIndex + monthIndex])
));

const parsePayrollRoster = (rows) => {
    const headerIndex = rows.findIndex((row) => normalizeText(row[0]).includes('nombre del empleado'));
    if (headerIndex < 0) return [];

    return rows.slice(headerIndex + 1)
        .map((row, offset) => ({
            rowNumber: headerIndex + offset + 2,
            name: String(row[0] || '').trim(),
            role: String(row[1] || '').trim(),
            startDate: String(row[2] || '').trim(),
            baseSalary: parseMoney(row[4]),
            socialSecurity: parseMoney(row[8]),
            bonusOrCommission: parseMoney(row[9]),
            monthlyTotal: parseMoney(row[10]),
            annualTotal: parseMoney(row[11]),
            fortnightPayment: parseMoney(row[12])
        }))
        .filter((person) => person.name && normalizeText(person.name) !== 'total');
};

const parseDebtsSheet = (rows, year) => {
    const headerIndex = rows.findIndex((row) => normalizeText(row[0]) === 'morosos');
    if (headerIndex < 0) return { debts: [], totals: { debt: 0, debtComments: 0 } };

    const header = rows[headerIndex].map(normalizeText);
    const statusIndex = header.findIndex((value) => value === 'estado');
    const commentsIndex = header.findIndex((value) => value === 'comentarios');
    const monthLimit = statusIndex > 0 ? statusIndex : 9;
    const totalRow = rows.find((row) => normalizeText(row[0]) === 'total') || [];

    const debts = rows.slice(headerIndex + 1).flatMap((row, offset) => {
        const client = String(row[0] || '').trim();
        if (!client || normalizeText(client) === 'total') return [];
        const status = statusIndex >= 0 ? String(row[statusIndex] || '').trim() : '';
        const comments = commentsIndex >= 0 ? String(row[commentsIndex] || '').trim() : '';

        return MONTHS.slice(0, Math.max(0, monthLimit - 1)).map((monthName, monthIndex) => {
            const amount = parseMoney(row[monthIndex + 1]);
            if (!amount) return null;
            return {
                rowNumber: headerIndex + offset + 2,
                sourceLabel: client,
                year,
                month: monthIndex + 1,
                monthName,
                amount,
                status: status || 'DEBE',
                comments
            };
        }).filter(Boolean);
    });

    return {
        debts,
        totals: {
            debt: statusIndex >= 0 ? parseMoney(totalRow[statusIndex]) : 0,
            debtComments: commentsIndex >= 0 ? parseMoney(totalRow[commentsIndex]) : 0
        }
    };
};

const collectMonthEntries = ({ row, rowNumber, label, section, year }) => {
    const identity = classifyEntry(label, section);

    return MONTHS
        .map((monthName, index) => ({
            month: index + 1,
            amount: parseMoney(row[index + collectMonthEntries.monthStartIndex]),
            monthName
        }))
        .filter((monthValue) => monthValue.amount !== 0)
        .map((monthValue) => ({
            rowNumber,
            sourceLabel: label,
            sourceSection: section,
            year,
            month: monthValue.month,
            monthName: monthValue.monthName,
            date: `${year}-${String(monthValue.month).padStart(2, '0')}-01`,
            amount: monthValue.amount,
            type: identity.type,
            category: identity.category
        }));
};

collectMonthEntries.monthStartIndex = 1;

export const parseFinancialImportWorkbook = (buffer, options = {}) => {
    const year = Number.parseInt(options.year, 10) || 2026;
    const requestedCutoff = Number.parseInt(options.actualThroughMonth, 10);
    const now = new Date();
    const inferredCutoff = year < now.getUTCFullYear()
        ? 12
        : year > now.getUTCFullYear()
            ? 0
            : now.getUTCMonth() + 1;
    const actualThroughMonth = Number.isInteger(requestedCutoff)
        ? Math.min(Math.max(requestedCutoff, 0), 12)
        : inferredCutoff;
    const context = readWorkbookContext(buffer, options);
    const rows = context.rows;
    const layout = detectLayout(rows);

    const entries = [];
    const debtSheet = parseDebtsSheet(context.debtRows, year);
    const debts = debtSheet.debts;
    const payrollRoster = parsePayrollRoster(context.payrollRows);
    const warnings = [];
    const totals = {
        explicit: {
            income: 0,
            expense: 0,
            utility: 0,
            financing: 0,
            debt: debtSheet.totals.debt,
            debtComments: debtSheet.totals.debtComments
        },
        calculated: {
            income: 0,
            expense: 0,
            operatingExpense: 0,
            investment: 0,
            financing: 0,
            debt: 0
        },
        monthly: {
            explicit: emptyMonthlyBuckets(),
            calculated: emptyMonthlyBuckets()
        }
    };

    let section = 'INCOME';

    rows.forEach((row, index) => {
        if (layout.type === 'CATEGORIZED_MONTHLY' && index <= layout.headerIndex) return;

        const rowNumber = index + 1;
        const categoryText = layout.categoryIndex === null ? '' : String(row[layout.categoryIndex] || '').trim();
        const detailText = String(row[layout.labelIndex] || '').trim();
        const label = layout.type === 'CATEGORIZED_MONTHLY' ? (detailText || categoryText) : String(row[0] || '').trim();
        const categoryClean = normalizeText(categoryText);
        const clean = normalizeText(label);
        if (!label && !categoryText) return;

        if (clean === 'clientes') {
            section = 'INCOME';
            return;
        }

        if (categoryClean === 'ingresos mensuales') {
            section = 'INCOME';
            if (!detailText || normalizeText(detailText).includes('clientes fee')) return;
        }

        if (clean === 'egresos' || categoryClean === 'costos administrativos') {
            section = 'EXPENSE';
            if (!detailText || clean === 'nomina' || clean === 'pagos financieros') return;
            return;
        }

        if (clean.includes('egresos utilidad')) {
            section = 'INVESTMENT';
            return;
        }

        if (categoryClean === 'gastos operativos') {
            section = 'OPERATING_EXPENSE';
            if (!detailText || clean.includes('herramientas digitales') || clean.includes('jornadas de produccion')) return;
        }

        if (clean.startsWith('pauta sunpartners') || clean === 'financiamiento') {
            section = 'FINANCING';
            return;
        }

        if (clean === 'deudas grandes') {
            section = 'DEBT';
            return;
        }

        if (TOTAL_LABELS[clean]) {
            const totalKey = TOTAL_LABELS[clean];
            const monthlyValues = getMonthlyValues(row, layout.monthStartIndex);
            totals.monthly.explicit[totalKey] = monthlyValues;
            totals.explicit[totalKey] = monthlyValues.reduce((sum, value) => sum + value, 0) || findTotalValue(row);
            return;
        }

        if (clean === 'total') return;

        if (section === 'DEBT') {
            const amount = findTotalValue(row);
            if (amount !== 0) {
                debts.push({
                    rowNumber,
                    sourceLabel: label,
                    year,
                    amount
                });
                totals.calculated.debt += amount;
            }
            return;
        }

        collectMonthEntries.monthStartIndex = layout.monthStartIndex;
        const rowEntries = collectMonthEntries({ row, rowNumber, label, section, year });
        entries.push(...rowEntries);
    });

    for (const entry of entries) {
        if (entry.type === 'INCOME') totals.calculated.income += entry.amount;
        if (entry.sourceSection === 'EXPENSE') totals.calculated.expense += entry.amount;
        if (entry.sourceSection === 'OPERATING_EXPENSE') totals.calculated.operatingExpense += entry.amount;
        if (entry.sourceSection === 'INVESTMENT') totals.calculated.investment += entry.amount;
        if (entry.sourceSection === 'FINANCING') totals.calculated.financing += entry.amount;
        const monthlyIndex = entry.month - 1;
        if (entry.type === 'INCOME') totals.monthly.calculated.income[monthlyIndex] += entry.amount;
        if (entry.sourceSection === 'EXPENSE') totals.monthly.calculated.expense[monthlyIndex] += entry.amount;
        if (entry.sourceSection === 'OPERATING_EXPENSE') totals.monthly.calculated.operatingExpense[monthlyIndex] += entry.amount;
        if (entry.sourceSection === 'INVESTMENT') totals.monthly.calculated.investment[monthlyIndex] += entry.amount;
        if (entry.sourceSection === 'FINANCING') totals.monthly.calculated.financing[monthlyIndex] += entry.amount;
    }

    totals.calculated.debt = debts.reduce((sum, debt) => sum + debt.amount, 0);

    const payrollContinuityFlags = Object.values(entries.reduce((acc, entry) => {
        const clean = normalizeText(entry.sourceLabel);
        const hasSharedName = /\/| y | - /.test(clean) && (
            entry.category === 'NOMINA' ||
            clean.includes('nomina') ||
            clean.includes('kamila') ||
            clean.includes('gabriel')
        );
        if (!hasSharedName) return acc;

        if (!acc[entry.sourceLabel]) {
            acc[entry.sourceLabel] = {
                rowNumber: entry.rowNumber,
                label: entry.sourceLabel,
                months: [],
                reason: 'Fila compartida de nomina: debe separarse por colaborador y vigencia antes de consolidar nomina.'
            };
        }

        acc[entry.sourceLabel].months.push(entry.month);
        return acc;
    }, {}));

    for (const flag of payrollContinuityFlags) {
        warnings.push({
            type: 'PAYROLL_CONTINUITY_SPLIT_REQUIRED',
            ...flag
        });
    }

    for (const [key, explicitValue] of Object.entries(totals.explicit)) {
        if (key !== 'income' && key !== 'expense') continue;
        const calculatedValue = totals.calculated[key];
        if (explicitValue && Math.abs(explicitValue - calculatedValue) > 1) {
            warnings.push({
                type: 'TOTAL_MISMATCH',
                total: key,
                explicitValue,
                calculatedValue,
                difference: explicitValue - calculatedValue
            });
        }
    }

    return {
        filename: options.filename || null,
        year,
        actualThroughMonth,
        workbook: {
            sheetNames: context.sheetNames
        },
        sourceSheet: context.sourceSheet,
        layout: layout.type,
        months: MONTHS,
        entries,
        debts,
        payrollRoster,
        payrollContinuityFlags,
        warnings,
        totals
    };
};

export const buildFinancialImportPersistencePlan = (buffer, options = {}) => {
    const preview = parseFinancialImportWorkbook(buffer, options);
    const sourceHash = crypto
        .createHash('sha256')
        .update(buffer)
        .digest('hex');

    const sourceIsActualLedger = isActualLedgerSheet(preview.sourceSheet);
    const sourceIsMembershipProjection = isMembershipProjectionSheet(preview.sourceSheet);
    const records = preview.entries.map((entry) => ({
        amount: entry.amount,
        category: entry.category,
        type: entry.type,
        section: toFinancialSection(entry.sourceSection),
        date: dateFromYearMonth(entry.year, entry.month),
        year: entry.year,
        month: entry.month,
        description: entry.sourceLabel,
        sourceSheet: preview.sourceSheet,
        sourceRow: entry.rowNumber,
        sourceLabel: entry.sourceLabel,
        scenario: sourceIsActualLedger
            ? 'ACTUAL'
            : sourceIsMembershipProjection
                ? 'FORECAST'
                : entry.month <= preview.actualThroughMonth ? 'ACTUAL' : 'FORECAST',
        status: 'POSTED',
        origin: 'IMPORT',
        isProjection: sourceIsActualLedger
            ? false
            : sourceIsMembershipProjection || entry.month > preview.actualThroughMonth,
        postedAt: dateFromYearMonth(entry.year, entry.month),
        metadata: {
            monthName: entry.monthName,
            sourceSection: entry.sourceSection
        }
    }));

    const receivables = preview.debts.map((debt) => ({
        amount: debt.amount,
        period: dateFromYearMonth(debt.year || preview.year, debt.month || 1),
        year: debt.year || preview.year,
        month: debt.month || null,
        status: normalizeReceivableStatus(debt.status),
        origin: 'IMPORT',
        notes: debt.sourceLabel,
        comments: debt.comments || null,
        sourceSheet: 'MOROSOS',
        sourceRow: debt.rowNumber,
        sourceLabel: debt.sourceLabel,
        metadata: {
            monthName: debt.monthName || null
        }
    }));

    const payrollPositions = preview.payrollRoster
        .filter((person) => person.role)
        .map((person) => ({
            title: person.role,
            description: null
        }));

    const payrollContracts = preview.payrollRoster.map((person) => ({
        employeeName: person.name,
        positionTitle: person.role || null,
        baseSalary: person.baseSalary,
        socialSecurity: person.socialSecurity,
        startDateRaw: person.startDate,
        startDate: parsePayrollStartDate(person.startDate, preview.year),
        endDate: null,
        sourceSheet: 'NOMINA 2026',
        sourceRow: person.rowNumber,
        sourceLabel: person.name,
        metadata: {
            role: person.role,
            monthlyTotal: person.monthlyTotal,
            annualTotal: person.annualTotal,
            fortnightPayment: person.fortnightPayment,
            bonusOrCommission: person.bonusOrCommission,
            startDateRaw: person.startDate
        }
    }));

    return {
        preview,
        batch: {
            year: preview.year,
            sourceFilename: preview.filename || options.filename || 'archivo-financiero',
            sourceHash,
            sourceSheets: preview.workbook?.sheetNames || [],
            status: 'IMPORTED',
            summary: {
                layout: preview.layout,
                sourceSheet: preview.sourceSheet,
                actualThroughMonth: preview.actualThroughMonth,
                totals: preview.totals,
                warnings: preview.warnings,
                entries: preview.entries.length,
                receivables: preview.debts.length,
                payrollRoster: preview.payrollRoster.length
            },
            importedById: options.importedById || null,
            importedAt: new Date()
        },
        records,
        monthlySummaries: buildMonthlySummaries(preview),
        receivables,
        payrollPositions,
        payrollContracts
    };
};

export const persistFinancialImportPlan = async (prismaClient, plan, options = {}) => {
    const replaceExisting = options.replaceExisting !== false;
    const year = plan.batch.year;

    return prismaClient.$transaction(async (tx) => {
        const priorClientLinks = replaceExisting
            ? await tx.financialRecord.findMany({
                where: {
                    year,
                    importBatchId: { not: null },
                    clientId: { not: null },
                    sourceLabel: { not: null }
                },
                select: {
                    sourceLabel: true,
                    clientId: true
                }
            })
            : [];
        const priorReceivableClientLinks = replaceExisting
            ? await tx.accountsReceivable.findMany({
                where: {
                    year,
                    importBatchId: { not: null },
                    sourceLabel: { not: null }
                },
                select: {
                    sourceLabel: true,
                    clientId: true
                }
            })
            : [];
        const clientIdsBySourceLabel = new Map();
        const ambiguousSourceLabels = new Set();
        for (const link of [...priorClientLinks, ...priorReceivableClientLinks]) {
            if (!link.sourceLabel || !link.clientId) continue;
            const normalizedLabel = normalizeText(link.sourceLabel);
            const currentClientId = clientIdsBySourceLabel.get(normalizedLabel);
            if (currentClientId && currentClientId !== link.clientId) {
                ambiguousSourceLabels.add(normalizedLabel);
                clientIdsBySourceLabel.delete(normalizedLabel);
                continue;
            }
            if (!ambiguousSourceLabels.has(normalizedLabel)) {
                clientIdsBySourceLabel.set(normalizedLabel, link.clientId);
            }
        }

        if (replaceExisting) {
            await tx.financialRecord.deleteMany({
                where: { year, importBatchId: { not: null } }
            });
            await tx.accountsReceivable.deleteMany({
                where: { year, importBatchId: { not: null } }
            });
            await tx.financialMonthlySummary.deleteMany({
                where: { year }
            });
            await tx.financialImportBatch.updateMany({
                where: { year, status: 'IMPORTED' },
                data: { status: 'REPLACED' }
            });
        }

        const batch = await tx.financialImportBatch.create({
            data: plan.batch
        });

        if (plan.records.length > 0) {
            await tx.financialRecord.createMany({
                data: plan.records.map((record) => ({
                    ...record,
                    clientId: record.clientId
                        || clientIdsBySourceLabel.get(normalizeText(record.sourceLabel))
                        || null,
                    importBatchId: batch.id
                }))
            });
        }

        if (plan.monthlySummaries.length > 0) {
            await tx.financialMonthlySummary.createMany({
                data: plan.monthlySummaries.map((summary) => ({
                    ...summary,
                    importBatchId: batch.id
                }))
            });
        }

        const clientIdByLabel = new Map();
        for (const receivable of plan.receivables) {
            const label = receivable.sourceLabel || receivable.notes || 'Cartera sin cliente';
            if (!clientIdByLabel.has(label)) {
                const preservedClientId = clientIdsBySourceLabel.get(normalizeText(label));
                if (preservedClientId) {
                    clientIdByLabel.set(label, preservedClientId);
                } else {
                    const slug = slugify(label);
                    const client = await tx.client.upsert({
                        where: { slug },
                        update: {},
                        create: {
                            name: label,
                            slug
                        }
                    });
                    clientIdByLabel.set(label, client.id);
                }
            }

            await tx.accountsReceivable.create({
                data: {
                    ...receivable,
                    clientId: clientIdByLabel.get(label),
                    importBatchId: batch.id
                }
            });
        }

        const positionIdByTitle = new Map();
        for (const position of uniqueBy(plan.payrollPositions, (item) => item.title)) {
            const savedPosition = await tx.payrollPosition.upsert({
                where: { title: position.title },
                update: {
                    description: position.description
                },
                create: position
            });
            positionIdByTitle.set(position.title, savedPosition.id);
        }

        let payrollContractsCreated = 0;
        const users = await tx.user.findMany({
            select: {
                id: true,
                name: true,
                email: true
            }
        });

        for (const contract of plan.payrollContracts) {
            const normalizedLabel = slugify(contract.employeeName);
            const alias = await tx.financialImportAlias.findUnique({
                where: {
                    sourceType_normalizedLabel: {
                        sourceType: 'PAYROLL',
                        normalizedLabel
                    }
                },
                include: {
                    collaborator: true
                }
            });
            const matchedUser = findPayrollUser(users, contract.employeeName);
            const collaboratorName = alias?.collaborator?.displayName || matchedUser?.name || contract.employeeName;
            const collaboratorUpdate = {
                displayName: collaboratorName,
                metadata: {
                    lastPayrollImportBatchId: batch.id,
                    lastPayrollSourceLabel: contract.employeeName
                }
            };

            if (matchedUser?.id) {
                collaboratorUpdate.userId = matchedUser.id;
            }

            const collaborator = await tx.financialCollaborator.upsert({
                where: {
                    normalizedName: alias?.collaborator?.normalizedName || normalizedLabel
                },
                update: collaboratorUpdate,
                create: {
                    displayName: collaboratorName,
                    normalizedName: normalizedLabel,
                    userId: matchedUser?.id || null,
                    metadata: {
                        firstPayrollImportBatchId: batch.id,
                        lastPayrollImportBatchId: batch.id,
                        lastPayrollSourceLabel: contract.employeeName
                    }
                }
            });

            await tx.financialImportAlias.upsert({
                where: {
                    sourceType_normalizedLabel: {
                        sourceType: 'PAYROLL',
                        normalizedLabel
                    }
                },
                update: {
                    sourceLabel: contract.employeeName,
                    collaboratorId: collaborator.id
                },
                create: {
                    sourceType: 'PAYROLL',
                    sourceLabel: contract.employeeName,
                    normalizedLabel,
                    collaboratorId: collaborator.id
                }
            });

            await tx.payrollContract.create({
                data: {
                    userId: matchedUser?.id || alias?.collaborator?.userId || null,
                    collaboratorId: collaborator.id,
                    positionId: contract.positionTitle ? positionIdByTitle.get(contract.positionTitle) || null : null,
                    importBatchId: batch.id,
                    baseSalary: contract.baseSalary,
                    socialSecurity: contract.socialSecurity,
                    startDate: contract.startDate,
                    endDate: contract.endDate,
                    sourceSheet: contract.sourceSheet,
                    sourceRow: contract.sourceRow,
                    sourceLabel: contract.sourceLabel,
                    metadata: contract.metadata
                }
            });
            payrollContractsCreated += 1;
        }

        return {
            importBatchId: batch.id,
            counts: {
                records: plan.records.length,
                monthlySummaries: plan.monthlySummaries.length,
                receivables: plan.receivables.length,
                payrollContracts: payrollContractsCreated
            }
        };
    }, {
        maxWait: 10000,
        timeout: 60000
    });
};
