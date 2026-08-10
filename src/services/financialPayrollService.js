import {
  assertOpenFinancialPeriod,
  FinancialDomainError,
  parseFinancialDateInput
} from './financialRecordService.js';

const toNumber = (value) => {
  if (value && typeof value.toNumber === 'function') return value.toNumber();
  return Number(value) || 0;
};

const normalizePeriod = (input = {}) => {
  const year = Number.parseInt(input.year, 10);
  const month = Number.parseInt(input.month, 10);
  if (!Number.isInteger(year) || year < 2000 || year > 2200 || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new FinancialDomainError('PAYROLL_PERIOD_INVALID', 'El periodo de nomina no es valido.');
  }
  return { year, month };
};

const actorIdFrom = (actor) => actor?.id || actor?.userId || null;

export const generatePayrollPeriod = async (prismaClient, input, actor) => {
  const { year, month } = normalizePeriod(input);
  const periodStart = new Date(Date.UTC(year, month - 1, 1, 12));
  const periodEnd = new Date(Date.UTC(year, month, 0, 12));
  const actorId = actorIdFrom(actor);

  return prismaClient.$transaction(async (tx) => {
    await assertOpenFinancialPeriod(tx, year, month);
    const contracts = await tx.payrollContract.findMany({
      where: {
        startDate: { lte: periodEnd },
        OR: [{ endDate: null }, { endDate: { gte: periodStart } }]
      },
      include: { collaborator: { select: { displayName: true } } }
    });

    const transactions = [];
    for (const contract of contracts) {
      const baseSalary = toNumber(contract.baseSalary);
      const socialSecurity = toNumber(contract.socialSecurity);
      const grossAmount = baseSalary + socialSecurity;
      const transaction = await tx.payrollTransaction.upsert({
        where: { contractId_month_year: { contractId: contract.id, month, year } },
        update: {},
        create: {
          userId: contract.userId || null,
          contractId: contract.id,
          month,
          year,
          baseSalary,
          socialSecurity,
          grossAmount,
          deductions: 0,
          netAmount: grossAmount,
          status: 'DRAFT'
        }
      });
      transactions.push(transaction);
    }

    await tx.financialAuditEvent.create({
      data: {
        entityType: 'PayrollPeriod',
        entityId: `${year}-${String(month).padStart(2, '0')}`,
        action: 'CREATE',
        after: { transactionIds: transactions.map((transaction) => transaction.id) },
        actorId
      }
    });
    return { year, month, transactions };
  });
};

export const approvePayrollTransaction = async (prismaClient, transactionId, actor) => {
  const actorId = actorIdFrom(actor);
  return prismaClient.$transaction(async (tx) => {
    const existing = await tx.payrollTransaction.findUnique({ where: { id: transactionId } });
    if (!existing) throw new FinancialDomainError('PAYROLL_TRANSACTION_NOT_FOUND', 'La liquidacion no existe.', 404);
    if (existing.status === 'PAID') throw new FinancialDomainError('PAYROLL_ALREADY_PAID', 'La liquidacion ya fue pagada.', 409);
    await assertOpenFinancialPeriod(tx, existing.year, existing.month);
    const transaction = await tx.payrollTransaction.update({
      where: { id: transactionId },
      data: { status: 'APPROVED', approvedAt: new Date() }
    });
    await tx.financialAuditEvent.create({
      data: { entityType: 'PayrollTransaction', entityId: transactionId, action: 'POST', before: existing, after: transaction, actorId }
    });
    return transaction;
  });
};

export const payPayrollTransaction = async (prismaClient, transactionId, input, actor) => {
  const accountId = String(input?.accountId || '').trim();
  if (!accountId) throw new FinancialDomainError('PAYROLL_ACCOUNT_REQUIRED', 'Selecciona la cuenta desde la cual se pago la nomina.');
  const { date: paidAt, year, month } = parseFinancialDateInput(input?.paidAt);
  const actorId = actorIdFrom(actor);

  return prismaClient.$transaction(async (tx) => {
    const existing = await tx.payrollTransaction.findUnique({
      where: { id: transactionId },
      include: { contract: { include: { collaborator: { select: { displayName: true } } } } }
    });
    if (!existing) throw new FinancialDomainError('PAYROLL_TRANSACTION_NOT_FOUND', 'La liquidacion no existe.', 404);
    if (existing.status !== 'APPROVED') throw new FinancialDomainError('PAYROLL_NOT_APPROVED', 'La liquidacion debe aprobarse antes de pagarla.', 409);
    await assertOpenFinancialPeriod(tx, year, month);

    const collaboratorName = existing.contract?.collaborator?.displayName || existing.contract?.sourceLabel || 'Colaborador';
    const financialRecord = await tx.financialRecord.create({
      data: {
        amount: toNumber(existing.netAmount),
        category: 'NOMINA',
        type: 'EXPENSE',
        section: 'ADMIN_COST',
        date: paidAt,
        year,
        month,
        userId: existing.userId || null,
        createdById: actorId,
        accountId,
        description: `Pago de nomina: ${collaboratorName}`,
        scenario: 'ACTUAL',
        status: 'POSTED',
        origin: 'SYSTEM',
        isProjection: false,
        reference: String(input.reference || '').trim() || null,
        postedAt: new Date(),
        metadata: { payrollTransactionId: transactionId }
      }
    });
    const transaction = await tx.payrollTransaction.update({
      where: { id: transactionId },
      data: { status: 'PAID', paidAt, financialRecordId: financialRecord.id }
    });
    await tx.financialAuditEvent.create({
      data: { entityType: 'PayrollTransaction', entityId: transactionId, action: 'PAYMENT', before: existing, after: transaction, actorId }
    });
    return { transaction, financialRecord };
  });
};
