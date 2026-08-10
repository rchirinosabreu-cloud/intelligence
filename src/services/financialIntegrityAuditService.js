const toNumber = (value) => {
    if (value && typeof value.toNumber === 'function') return value.toNumber();
    return Number(value) || 0;
};

const issue = (code, severity, count, message) => ({ code, severity, count, message });

export const auditFinancialIntegrity = async (prismaClient, { year: rawYear } = {}) => {
    const year = Number.parseInt(rawYear, 10) || new Date().getUTCFullYear();
    const dateStart = new Date(Date.UTC(year, 0, 1));
    const dateEnd = new Date(Date.UTC(year + 1, 0, 1));
    const [missingPeriod, actualWithoutAccount, draftRecords, unlinkedIncome, receivables, contracts, pendingPayroll, accountCount, closedPeriodCount] = await Promise.all([
        prismaClient.financialRecord.count({ where: { date: { gte: dateStart, lt: dateEnd }, OR: [{ year: null }, { month: null }] } }),
        prismaClient.financialRecord.count({ where: { year, scenario: 'ACTUAL', status: 'POSTED', accountId: null } }),
        prismaClient.financialRecord.count({ where: { year, status: 'DRAFT' } }),
        prismaClient.financialRecord.count({ where: { year, type: 'INCOME', clientId: null } }),
        prismaClient.accountsReceivable.findMany({ where: { year }, select: { id: true, amount: true, status: true, payments: { select: { amount: true } } } }),
        prismaClient.payrollContract.findMany({
            where: { startDate: { lt: dateEnd }, OR: [{ endDate: null }, { endDate: { gte: dateStart } }] },
            select: { id: true, collaboratorId: true, sourceLabel: true, startDate: true, endDate: true }
        }),
        prismaClient.payrollTransaction.count({ where: { year, status: { in: ['DRAFT', 'APPROVED'] } } }),
        prismaClient.financialAccount.count({ where: { isActive: true } }),
        prismaClient.financialPeriod.count({ where: { year, status: 'CLOSED' } })
    ]);

    const receivableMismatch = receivables.filter((receivable) => {
        const paid = (receivable.payments || []).reduce((sum, payment) => sum + toNumber(payment.amount), 0);
        const isPaid = toNumber(receivable.amount) - paid <= 0.005;
        return (isPaid && receivable.status !== 'PAGADO') || (!isPaid && receivable.status === 'PAGADO') || paid - toNumber(receivable.amount) > 0.005;
    }).length;
    const sharedContracts = contracts.filter((contract) => /\s[/&]\s|\s+y\s+/i.test(String(contract.sourceLabel || ''))).length;
    const contractsWithoutCollaborator = contracts.filter((contract) => !contract.collaboratorId).length;

    const issues = [
        missingPeriod && issue('RECORD_PERIOD_MISSING', 'ERROR', missingPeriod, 'Hay movimientos sin año o mes contable.'),
        actualWithoutAccount && issue('ACTUAL_WITHOUT_ACCOUNT', 'ERROR', actualWithoutAccount, 'Hay movimientos ejecutados sin cuenta de caja o banco.'),
        draftRecords && issue('DRAFT_RECORDS', 'WARNING', draftRecords, 'Hay movimientos en borrador pendientes de contabilizar o anular.'),
        unlinkedIncome && issue('INCOME_WITHOUT_CLIENT', 'WARNING', unlinkedIncome, 'Hay ingresos sin cliente relacionado.'),
        receivableMismatch && issue('RECEIVABLE_STATUS_MISMATCH', 'ERROR', receivableMismatch, 'Hay saldos de cartera que no coinciden con sus pagos.'),
        sharedContracts && issue('SHARED_PAYROLL_CONTRACT', 'ERROR', sharedContracts, 'Hay contratos de nómina compartidos por más de una persona.'),
        contractsWithoutCollaborator && issue('PAYROLL_WITHOUT_COLLABORATOR', 'ERROR', contractsWithoutCollaborator, 'Hay contratos sin colaborador financiero.'),
        pendingPayroll && issue('PAYROLL_PENDING', 'WARNING', pendingPayroll, 'Hay liquidaciones de nómina pendientes de aprobación o pago.'),
        !accountCount && issue('NO_FINANCIAL_ACCOUNTS', 'ERROR', 1, 'No hay cuentas de caja o banco configuradas.'),
        !closedPeriodCount && issue('NO_CLOSED_PERIODS', 'WARNING', 1, 'Todavía no se ha cerrado ningún mes del año.')
    ].filter(Boolean);

    return {
        year,
        ready: !issues.some((item) => item.severity === 'ERROR'),
        checkedAt: new Date().toISOString(),
        summary: {
            recordsWithoutAccount: actualWithoutAccount,
            receivableMismatches: receivableMismatch,
            sharedPayrollContracts: sharedContracts,
            pendingPayroll,
            activeAccounts: accountCount,
            closedPeriods: closedPeriodCount
        },
        issues
    };
};
