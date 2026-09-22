// Keep matching in PostgreSQL, before pagination and aggregation.
const SEARCH_PATHS = {
    record: ['description', 'counterparty', 'sourceLabel', 'reference', 'notes', 'subcategory', 'client.name', 'user.name', 'account.name', 'payrollTransaction.contract.sourceLabel', 'payrollTransaction.contract.collaborator.displayName', 'payrollTransaction.contract.user.name'],
    receivable: ['sourceLabel', 'notes', 'comments', 'client.name'],
    contract: ['sourceLabel', 'collaborator.displayName', 'user.name'],
    payroll: ['user.name', 'contract.sourceLabel', 'contract.collaborator.displayName', 'contract.user.name']
};

const containsAt = (path, term) => path.split('.').reverse().reduce((query, field, index) => (
    { [field]: index ? { is: query } : { contains: term.replace(/[\\%_]/g, '\\$&'), mode: 'insensitive' } }
), null);

export const withFinancialSearch = (where, query, kind = 'record') => {
    if (query === undefined || query === null || query === '') return where;
    if (typeof query !== 'string' || query.length > 200) {
        throw Object.assign(new Error('La búsqueda financiera debe contener como máximo 200 caracteres.'), { statusCode: 400, code: 'FINANCIAL_SEARCH_INVALID' });
    }
    const terms = [...new Set(query.trim().split(/\s+/).filter(Boolean))];
    if (!terms.length) return where;
    return { ...where, AND: [
        ...(where.AND ? (Array.isArray(where.AND) ? where.AND : [where.AND]) : []),
        ...terms.map(term => ({ OR: SEARCH_PATHS[kind].map(path => containsAt(path, term)) }))
    ] };
};

export const financialMonthFilter = ({ month, quarter } = {}) => {
    const parsedMonth = Number(month), parsedQuarter = Number(quarter);
    if (Number.isInteger(parsedMonth) && parsedMonth >= 1 && parsedMonth <= 12) return { month: parsedMonth };
    if (Number.isInteger(parsedQuarter) && parsedQuarter >= 1 && parsedQuarter <= 4) return { month: { gte: (parsedQuarter - 1) * 3 + 1, lte: parsedQuarter * 3 } };
    return {};
};

export const activeFinancialSource = batchId => batchId ? { OR: [{ importBatchId: batchId }, { importBatchId: null }] } : {};

// Un abono revertido se conserva como evidencia pero ya no representa dinero aplicado:
// cualquier consulta que sume abonos o calcule saldo debe filtrarlo con esto.
export const ACTIVE_RECEIVABLE_PAYMENT = Object.freeze({ reversedAt: null });
