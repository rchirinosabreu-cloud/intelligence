import {
  FinancialDomainError,
  parseFinancialDateInput
} from './financialRecordService.js';

const ACCOUNT_TYPES = new Set(['BANK', 'CASH', 'OTHER']);

const toNumber = (value) => {
  if (value && typeof value.toNumber === 'function') return value.toNumber();
  return Number(value) || 0;
};

const actorIdFrom = (actor) => actor?.id || actor?.userId || null;

const normalizeAccountInput = (input = {}) => {
  const name = String(input.name || '').trim();
  if (!name) {
    throw new FinancialDomainError('FINANCIAL_ACCOUNT_NAME_REQUIRED', 'El nombre de la cuenta es obligatorio.');
  }

  const type = String(input.type || '').trim().toUpperCase();
  if (!ACCOUNT_TYPES.has(type)) {
    throw new FinancialDomainError('FINANCIAL_ACCOUNT_TYPE_INVALID', 'El tipo de cuenta no es valido.');
  }

  const openingBalance = Number(input.openingBalance || 0);
  if (!Number.isFinite(openingBalance)) {
    throw new FinancialDomainError('FINANCIAL_ACCOUNT_BALANCE_INVALID', 'El saldo inicial no es valido.');
  }

  const { date: openingBalanceDate } = parseFinancialDateInput(input.openingBalanceDate);
  return {
    name,
    type,
    currency: String(input.currency || 'COP').trim().toUpperCase(),
    openingBalance,
    openingBalanceDate,
    isActive: input.isActive !== false
  };
};

export const createFinancialAccount = async (prismaClient, input, actor) => {
  const data = normalizeAccountInput(input);
  const actorId = actorIdFrom(actor);

  return prismaClient.$transaction(async (tx) => {
    const account = await tx.financialAccount.create({ data });
    await tx.financialAuditEvent.create({
      data: {
        entityType: 'FinancialAccount',
        entityId: account.id,
        action: 'CREATE',
        after: JSON.parse(JSON.stringify(account)),
        actorId
      }
    });
    return account;
  });
};

export const listFinancialAccounts = async (prismaClient, { includeInactive = false } = {}) => {
  const accounts = await prismaClient.financialAccount.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    include: {
      records: {
        where: {
          status: 'POSTED',
          scenario: 'ACTUAL'
        },
        select: { type: true, amount: true }
      }
    }
  });

  return accounts.map(({ records, ...account }) => {
    const movementBalance = records.reduce((sum, record) => {
      const signedAmount = record.type === 'INCOME' ? toNumber(record.amount) : -toNumber(record.amount);
      return sum + signedAmount;
    }, 0);

    return {
      ...account,
      balance: toNumber(account.openingBalance) + movementBalance
    };
  });
};
