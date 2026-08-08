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

const parseMoney = (value) => {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) return 0;
        return value > 0 && value < 1000 ? value * 1000 : value;
    }

    const raw = String(value).trim();
    if (!raw) return 0;

    const isNegative = raw.includes('-') || raw.includes('(');
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

const readWorkbookRows = (buffer) => {
    const workbook = XLSX.read(buffer, { type: 'buffer', raw: false });
    const [firstSheetName] = workbook.SheetNames;
    if (!firstSheetName) return [];

    return XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], {
        header: 1,
        blankrows: false,
        defval: ''
    });
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
    const rows = readWorkbookRows(buffer);
    const layout = detectLayout(rows);

    const entries = [];
    const debts = [];
    const warnings = [];
    const totals = {
        explicit: {
            income: 0,
            expense: 0,
            utility: 0,
            financing: 0
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
        layout: layout.type,
        months: MONTHS,
        entries,
        debts,
        payrollContinuityFlags,
        warnings,
        totals
    };
};
