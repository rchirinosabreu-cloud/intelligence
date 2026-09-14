import { createHash } from 'node:crypto';
import { PDFParse } from 'pdf-parse';
import { assertOpenFinancialPeriod } from './financialRecordService.js';

export class BankReconciliationError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

const money = (value) => value == null || value === '' ? Number.NaN : Number(String(value).replace(/,/g, ''));
const isoDate = (year, month, day) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
const amountPattern = /-?(?:\d{1,3}(?:,\d{3})*|\d+)?\.\d{2}/g;

const extractSummary = (text) => {
  const direct = (label) => text.match(new RegExp(`${label}\\s*\\$?\\s*(-?[\\d,]+\\.\\d{2})`, 'i'))?.[1];
  const block = text.match(/RESUMEN([\s\S]*?)(?:SALDO PROMEDIO|FECHA\s+DESCRIPCI[ÓO]N)/i)?.[1] || '';
  // Some PDFs list all four labels before all four values. Never infer a missing label.
  const columnSummary = /SALDO ANTERIOR\s+TOTAL ABONOS\s+TOTAL CARGOS\s+SALDO ACTUAL\s/i.test(block);
  const values = columnSummary ? block.match(/-?[\d,]+\.\d{2}/g) || [] : [];
  return {
    openingBalance: money(columnSummary ? values[0] : direct('SALDO ANTERIOR')),
    closingBalance: money(columnSummary ? values[3] : direct('SALDO ACTUAL')),
    totalCredits: money(columnSummary ? values[1] : direct('TOTAL ABONOS')),
    totalDebits: money(columnSummary ? values[2] : direct('TOTAL CARGOS'))
  };
};

const invalidStatement = () => new BankReconciliationError('BANK_STATEMENT_INVALID', 'El extracto no contiene un periodo, fechas y saldos reconocibles.');
const incompleteStatement = () => new BankReconciliationError(
  'BANK_STATEMENT_INCOMPLETE', 'No se pudo leer el extracto completo o sus movimientos no explican los saldos. Revisa el archivo antes de importarlo.'
);
const validIsoDate = (date) => /^\d{4}-\d{2}-\d{2}$/.test(date)
  && Number.isFinite(new Date(date + 'T12:00:00Z').getTime())
  && new Date(date + 'T12:00:00Z').toISOString().slice(0, 10) === date;
const statementHeader = (text) => {
  const period = text.match(/DESDE:\s*(\d{4})\/(\d{2})\/(\d{2})\s+HASTA:\s*(\d{4})\/(\d{2})\/(\d{2})/i);
  const periodStart = period ? isoDate(period[1], period[2], period[3]) : '';
  const periodEnd = period ? isoDate(period[4], period[5], period[6]) : '';
  const summary = extractSummary(text);
  if (!validIsoDate(periodStart) || !validIsoDate(periodEnd) || periodStart > periodEnd
    || !Number.isFinite(summary.openingBalance) || !Number.isFinite(summary.closingBalance)) throw invalidStatement();
  return { periodStart, periodEnd, ...summary };
};
const datedTransaction = (header, transaction) => {
  if (!validIsoDate(transaction.postedAt) || transaction.postedAt < header.periodStart || transaction.postedAt > header.periodEnd) throw invalidStatement();
  return transaction;
};
const completeStatement = (header, transactions) => {
  let balance = Math.round(header.openingBalance * 100);
  let credits = 0;
  let debits = 0;
  for (const transaction of transactions) {
    const amount = Math.round(transaction.amount * 100);
    balance += amount;
    if (amount > 0) credits += amount;
    else debits -= amount;
    if (!Number.isSafeInteger(balance) || (transaction.balance != null && balance !== Math.round(transaction.balance * 100))) throw incompleteStatement();
  }
  if (balance !== Math.round(header.closingBalance * 100)) throw incompleteStatement();
  if ((Number.isFinite(header.totalCredits) && credits !== Math.round(header.totalCredits * 100))
    || (Number.isFinite(header.totalDebits) && debits !== Math.round(header.totalDebits * 100))) throw incompleteStatement();
  const { totalCredits, totalDebits, ...summary } = header;
  return { ...summary, transactions };
};
const tableHeading = /FECHA\s+DESCRIPCI[ÓO]N[^\n]*\n/i;
const statementTable = (text) => {
  const heading = tableHeading.exec(text);
  if (!heading) return null;
  const afterHeading = text.slice(heading.index + heading[0].length).split(/FIN ESTADO DE CUENTA/i)[0];
  const firstRow = afterHeading.search(/^[ \t]*\d{1,4}\/\d{1,2}(?:\/\d{1,2})?(?=\s|$)/m);
  // PDF extraction can wrap column labels across lines. Read those labels before
  // the first dated row; the date format must never determine which column is money.
  const labels = heading[0] + (firstRow < 0 ? afterHeading : afterHeading.slice(0, firstRow));
  if (!/\bVALOR\b/i.test(labels)) throw incompleteStatement();
  return { body: firstRow < 0 ? afterHeading : afterHeading.slice(firstRow), hasBalance: /\bSALDO\b/i.test(labels) };
};
const parseStatementRows = (table, header, hasBalance) => {
  const inferredYear = Number(header.periodEnd.slice(0, 4));
  const endMonth = Number(header.periodEnd.slice(5, 7));
  const groups = table.replace(/^[ \t]+/gm, '').split(/(?=^\d{1,4}\/\d{1,2}(?:\/\d{1,2})?\s)/m).map((part) => part.trim()).filter(Boolean);
  const transactions = [];
  groups.forEach((group) => {
    const dateMatch = group.match(/^(\d{1,4})\/(\d{1,2})(?:\/(\d{1,2}))?\s+/);
    if (!dateMatch) return;
    const modern = dateMatch[3] !== undefined;
    const postedAt = modern
      ? isoDate(dateMatch[1], dateMatch[2], dateMatch[3])
      : isoDate(Number(dateMatch[2]) > endMonth ? inferredYear - 1 : inferredYear, dateMatch[2], dateMatch[1]);
    const values = group.match(amountPattern) || [];
    if (values.length < (hasBalance ? 2 : 1)) throw incompleteStatement();
    const amount = money(hasBalance ? values.at(-2) : values.at(-1));
    const balance = hasBalance ? money(values.at(-1)) : null;
    let description = group.slice(dateMatch[0].length);
    values.forEach((value) => { description = description.replace(value, ' '); });
    description = description.replace(/\s+/g, ' ').trim();
    transactions.push(datedTransaction(header, { postedAt, description, amount, balance, sourceRow: transactions.length + 1 }));
  });
  return transactions;
};

export const parseBancolombiaStatementText = (text) => {
  const normalizedText = String(text || '').replace(/\r/g, '');
  const header = statementHeader(normalizedText);
  const table = statementTable(normalizedText);
  if (!table) throw incompleteStatement();
  return completeStatement(header, parseStatementRows(table.body, header, table.hasBalance));
};

export const parseBancolombiaStatementPages = (pages) => {
  const pageTexts = (pages || []).map((page) => String(typeof page === 'string' ? page : page?.text || '').replace(/\r/g, ''));
  const header = statementHeader(pageTexts[0] || '');
  if (!pageTexts.some((text) => tableHeading.test(text))) throw incompleteStatement();
  const periodEndYear = Number(header.periodEnd.slice(0, 4));
  const periodEndMonth = Number(header.periodEnd.slice(5, 7));
  const transactions = [];
  pageTexts.forEach((pageText) => {
    const table = statementTable(pageText);
    const body = table?.body || '';
    if (!body && /^\d{1,4}\/\d{1,2}(?:\/\d{1,2})?\s/m.test(pageText)) throw incompleteStatement();
    if (!table) return;
    const lines = body.split('\n').map((line) => line.trim()).filter(Boolean);
    const dates = [];
    while (lines[dates.length] && /^\d{1,4}\/\d{1,2}(?:\/\d{1,2})?$/.test(lines[dates.length])) dates.push(lines[dates.length]);
    if (!dates.length) {
      parseStatementRows(body, header, table.hasBalance).forEach((transaction) => transactions.push({
        ...transaction, sourceRow: transactions.length + 1
      }));
      return;
    }
    const descriptions = lines.slice(dates.length, dates.length * 2);
    const numericBlock = lines.slice(dates.length * 2).join(' ')
      .replace(/([\d,])\s+([.]\d{2})(?=\s|$)/g, '$1$2');
    const values = numericBlock.match(amountPattern) || [];
    if (descriptions.length !== dates.length || values.length !== dates.length * (table.hasBalance ? 2 : 1)) throw incompleteStatement();
    dates.forEach((date, index) => {
      const parts = date.split('/').map(Number);
      const modern = parts.length === 3;
      const month = parts[1];
      const day = modern ? parts[2] : parts[0];
      const transactionYear = modern ? parts[0] : (month > periodEndMonth ? periodEndYear - 1 : periodEndYear);
      transactions.push(datedTransaction(header, {
        postedAt: isoDate(transactionYear, month, day),
        description: descriptions[index].replace(/\s+/g, ' ').trim(),
        amount: money(values[index]),
        balance: table.hasBalance ? money(values[index + dates.length]) : null,
        sourceRow: transactions.length + 1
      }));
    });
  });
  return completeStatement(header, transactions);
};

export const parseBankStatementPdf = async (buffer, options = {}) => {
  const parser = new PDFParse({ data: buffer });
  try {
    const parsedPdf = await parser.getText();
    return parseBancolombiaStatementPages(parsedPdf.pages, options);
  } finally {
    await parser.destroy();
  }
};

const numeric = (value) => value && typeof value.toNumber === 'function' ? value.toNumber() : Number(value);
const normalizedWords = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const strongAliases = [
  [['colegio pablo'], ['pablo hoff']],
  [['sun partners'], ['sunpartners', 'sunparnerts']],
  [['tesoreria dptal'], ['gobernacion de bolivar', 'desarrollo economico']],
  [['impto gobierno 4x1000'], ['4 1000']]
];

export const scoreBankMatch = (transaction, record) => {
  const bankText = normalizedWords(transaction.description);
  const recordText = normalizedWords(`${record.description || ''} ${record.counterparty || ''} ${record.client?.name || ''}`);
  const bankTokens = new Set(bankText.split(' ').filter((word) => word.length >= 4));
  const shared = recordText.split(' ').filter((word) => word.length >= 4 && bankTokens.has(word));
  const aliasMatch = strongAliases.some(([bankAliases, recordAliases]) => (
    bankAliases.some((alias) => bankText.includes(alias)) && recordAliases.some((alias) => recordText.includes(alias))
  ));
  if (shared.length || aliasMatch) return {
    level: 'HIGH', confidence: 0.98,
    reason: 'Coincidencia de valor y mes con evidencia coincidente en la descripción bancaria.'
  };
  return {
    level: 'REVIEW', confidence: 0.55,
    reason: 'Coinciden valor, tipo y mes, pero la descripción bancaria no identifica claramente la contraparte. Requiere verificación.'
  };
};

export const detectInternalTransferCandidates = (transactions, maxDayDifference = 2) => {
  const used = new Set();
  const candidates = [];
  const ordered = [...transactions].sort((left, right) => new Date(left.postedAt) - new Date(right.postedAt));
  for (const debit of ordered) {
    if (used.has(debit.id) || numeric(debit.amount) >= 0) continue;
    const credit = ordered.find((candidate) => !used.has(candidate.id)
      && candidate.id !== debit.id
      && candidate.accountId !== debit.accountId
      && numeric(candidate.amount) > 0
      && Math.abs(numeric(candidate.amount) + numeric(debit.amount)) < 0.01
      && Math.abs(new Date(candidate.postedAt) - new Date(debit.postedAt)) / 86400000 <= maxDayDifference);
    if (!credit) continue;
    used.add(debit.id);
    used.add(credit.id);
    candidates.push({
      debitTransactionId: debit.id,
      creditTransactionId: credit.id,
      amount: Math.abs(numeric(debit.amount)),
      dayDifference: Math.round(Math.abs(new Date(credit.postedAt) - new Date(debit.postedAt)) / 86400000)
    });
  }
  return candidates;
};

export const detectStatementContinuityGaps = (imports) => {
  const grouped = new Map();
  imports.forEach((statement) => grouped.set(statement.accountId, [...(grouped.get(statement.accountId) || []), statement]));
  const gaps = [];
  for (const statements of grouped.values()) {
    const ordered = [...statements].sort((left, right) => new Date(left.periodStart) - new Date(right.periodStart));
    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1];
      const current = ordered[index];
      const difference = numeric(current.openingBalance) - numeric(previous.closingBalance);
      const previousEnd = new Date(previous.periodEnd);
      const currentStart = new Date(current.periodStart);
      const monthDistance = (currentStart.getUTCFullYear() - previousEnd.getUTCFullYear()) * 12
        + currentStart.getUTCMonth() - previousEnd.getUTCMonth();
      if (Math.abs(difference) < 0.01 && monthDistance <= 1) continue;
      gaps.push({
        accountId: current.accountId,
        previousImportId: previous.id,
        currentImportId: current.id,
        difference,
        hasMissingPeriods: monthDistance > 1
      });
    }
  }
  return gaps;
};

export const proposeBankMatches = (bankTransactions, financialRecords) => {
  const used = new Set();
  const proposals = [];
  for (const transaction of bankTransactions) {
    if (transaction.status && !['UNMATCHED', 'PROPOSED'].includes(transaction.status)) continue;
    const bankDate = new Date(transaction.postedAt);
    const expectedType = numeric(transaction.amount) >= 0 ? 'INCOME' : 'EXPENSE';
    const record = financialRecords.find((candidate) => !used.has(candidate.id)
      && (!candidate.accountId || candidate.accountId === transaction.accountId)
      && candidate.type === expectedType
      && Number(candidate.year) === bankDate.getUTCFullYear()
      && Number(candidate.month) === bankDate.getUTCMonth() + 1
      && Math.abs(numeric(candidate.amount) - Math.abs(numeric(transaction.amount))) < 0.01);
    if (!record) continue;
    used.add(record.id);
    const score = scoreBankMatch(transaction, record);
    proposals.push({
      bankTransactionId: transaction.id,
      financialRecordId: record.id,
      amount: Math.abs(numeric(transaction.amount)),
      confidence: score.confidence,
      reason: score.reason
    });
  }
  return proposals;
};

export const filterMatchedOnlyTransactions = (transactions, proposals) => {
  const matchedIds = new Set(proposals.map((proposal) => proposal.bankTransactionId));
  return transactions.filter((transaction) => matchedIds.has(transaction.id));
};

const fingerprintFor = (accountId, transaction) => createHash('sha256').update([
  accountId, transaction.postedAt, transaction.amount, transaction.balance ?? '', transaction.description
].join('|')).digest('hex');

const runBankTransaction = async (prismaClient, callback) => {
  try {
    return await prismaClient.$transaction(callback, { isolationLevel: 'Serializable' });
  } catch (error) {
    if (error.code === 'P2034') {
      throw new BankReconciliationError('BANK_RECONCILIATION_CONFLICT', 'La conciliación cambió mientras trabajabas. Actualiza y vuelve a intentarlo.', 409);
    }
    throw error;
  }
};

export const persistBankStatementImport = async (prismaClient, input, parsed, actorId) => {
  const existing = await prismaClient.bankStatementImport.findUnique({
    where: { accountId_sourceHash: { accountId: input.accountId, sourceHash: input.sourceHash } }
  });
  if (existing) throw new BankReconciliationError('BANK_STATEMENT_DUPLICATE', 'Este extracto ya fue importado para la cuenta seleccionada.', 409);

  return runBankTransaction(prismaClient, async (tx) => {
    const statement = await tx.bankStatementImport.create({ data: {
      accountId: input.accountId,
      sourceFilename: input.sourceFilename,
      sourceHash: input.sourceHash,
      periodStart: new Date(`${parsed.periodStart}T12:00:00Z`),
      periodEnd: new Date(`${parsed.periodEnd}T12:00:00Z`),
      openingBalance: parsed.openingBalance,
      closingBalance: parsed.closingBalance,
      importedById: actorId
    } });
    const fingerprints = parsed.transactions.map((transaction) => fingerprintFor(input.accountId, transaction));
    await tx.bankTransaction.createMany({ data: parsed.transactions.map((transaction, index) => ({
      importId: statement.id, accountId: input.accountId, postedAt: new Date(`${transaction.postedAt}T12:00:00Z`),
      description: transaction.description, amount: transaction.amount, balance: transaction.balance,
      sourceRow: transaction.sourceRow, fingerprint: fingerprints[index]
    })), skipDuplicates: true });
    const created = await tx.bankTransaction.findMany({ where: {
      accountId: input.accountId, fingerprint: { in: fingerprints }
    } });
    const records = await tx.financialRecord.findMany({ where: {
      year: { gte: new Date(parsed.periodStart).getUTCFullYear(), lte: new Date(parsed.periodEnd).getUTCFullYear() },
      status: 'POSTED', scenario: 'ACTUAL',
      bankMatches: { none: { status: { in: ['PROPOSED', 'APPROVED'] } } }
    } });
    const proposals = proposeBankMatches(created, records);
    const retained = input.matchedOnly ? filterMatchedOnlyTransactions(created, proposals) : created;
    if (input.matchedOnly) {
      await tx.bankTransaction.deleteMany({ where: {
        importId: statement.id,
        id: { notIn: retained.map((transaction) => transaction.id) }
      } });
    }
    if (proposals.length) {
      await tx.bankReconciliationMatch.createMany({ data: proposals, skipDuplicates: true });
      await tx.bankTransaction.updateMany({ where: { id: { in: proposals.map((item) => item.bankTransactionId) } }, data: { status: 'PROPOSED' } });
    }
    return { statementId: statement.id, transactionCount: retained.length, proposalCount: proposals.length };
  });
};

export const rebuildBankMatchProposals = async (prismaClient, year) => runBankTransaction(prismaClient, async (tx) => {
  const start = new Date(`${year}-01-01T00:00:00Z`);
  const end = new Date(`${year + 1}-01-01T00:00:00Z`);
  const transactions = await tx.bankTransaction.findMany({
    where: { postedAt: { gte: start, lt: end }, status: { in: ['UNMATCHED', 'PROPOSED'] } },
    orderBy: [{ postedAt: 'asc' }, { sourceRow: 'asc' }]
  });
  const transactionIds = transactions.map((transaction) => transaction.id);
  if (!transactionIds.length) return { transactionCount: 0, proposalCount: 0, unmatchedCount: 0 };

  await tx.bankReconciliationMatch.deleteMany({ where: {
    bankTransactionId: { in: transactionIds }, status: 'PROPOSED'
  } });
  await tx.bankTransaction.updateMany({
    where: { id: { in: transactionIds }, status: 'PROPOSED' }, data: { status: 'UNMATCHED' }
  });
  const records = await tx.financialRecord.findMany({ where: {
    year, status: 'POSTED', scenario: 'ACTUAL',
    bankMatches: { none: { status: { in: ['APPROVED', 'REJECTED'] } } }
  } });
  const proposals = proposeBankMatches(transactions, records);
  if (proposals.length) {
    await tx.bankReconciliationMatch.createMany({ data: proposals, skipDuplicates: true });
    await tx.bankTransaction.updateMany({
      where: { id: { in: proposals.map((proposal) => proposal.bankTransactionId) } }, data: { status: 'PROPOSED' }
    });
  }
  return {
    transactionCount: transactions.length,
    proposalCount: proposals.length,
    unmatchedCount: transactions.length - proposals.length
  };
});

export const approveBankMatch = async (prismaClient, matchId, actor) => {
  const unavailable = () => new BankReconciliationError(
    'BANK_MATCH_NOT_AVAILABLE', 'La propuesta cambió o ya fue conciliada. Actualiza la conciliación y vuelve a revisar.', 409
  );
  try {
    return await prismaClient.$transaction(async (tx) => {
      const match = await tx.bankReconciliationMatch.findUnique({
        where: { id: matchId }, include: {
          bankTransaction: { include: { account: true } },
          financialRecord: { include: { account: true, receivablePayment: true, payrollTransaction: true } }
        }
      });
      if (!match || match.status !== 'PROPOSED' || match.bankTransaction?.status !== 'PROPOSED') throw unavailable();
      const bank = match.bankTransaction;
      const record = match.financialRecord;
      if (!record || record.status !== 'POSTED' || record.scenario !== 'ACTUAL' || record.isProjection) {
        throw new BankReconciliationError('BANK_MATCH_RECORD_INVALID', 'Solo se pueden conciliar movimientos ejecutados y contabilizados.', 409);
      }
      const cents = [bank.amount, record.amount, match.amount].map((amount) => Math.round(numeric(amount) * 100));
      if (cents.some((amount) => !Number.isSafeInteger(amount)) || cents[1] <= 0 || cents[2] <= 0
        || Math.abs(cents[0]) !== cents[1] || cents[1] !== cents[2]) {
        throw new BankReconciliationError('BANK_MATCH_REQUIRES_SPLIT', 'Los importes cambiaron o requieren una distribución explícita.', 409);
      }
      if (record.type !== (cents[0] > 0 ? 'INCOME' : 'EXPENSE')) {
        throw new BankReconciliationError('BANK_MATCH_TYPE_MISMATCH', 'El ingreso o egreso no coincide con el sentido del movimiento bancario.', 409);
      }
      if (!bank.account?.isActive || bank.account.id !== bank.accountId) {
        throw new BankReconciliationError('BANK_MATCH_ACCOUNT_INVALID', 'La cuenta bancaria ya no está disponible para conciliar.', 409);
      }
      if (record.accountId && record.accountId !== bank.accountId) {
        throw new BankReconciliationError('BANK_MATCH_ACCOUNT_CONFLICT', 'El movimiento pertenece a otra cuenta. Revisa su registro antes de conciliar.', 409);
      }
      if (!record.accountId && (record.receivablePayment || record.payrollTransaction || !['MANUAL', 'IMPORT'].includes(record.origin))) {
        throw new BankReconciliationError('BANK_MATCH_LINKED_RECORD', 'Revisa la cuenta del pago vinculado antes de conciliar; no se modificará desde esta propuesta.', 409);
      }
      // Unassigned legacy records are denominated in COP. There is no record-level FX amount/rate yet.
      const recordCurrency = record.account?.currency || (!record.accountId ? 'COP' : null);
      if (!recordCurrency || recordCurrency !== bank.account.currency) {
        throw new BankReconciliationError('BANK_MATCH_CURRENCY_MISMATCH', 'Las monedas no coinciden o falta una conversión explícita.', 409);
      }
      const recordDate = new Date(record.date);
      const bankDate = new Date(bank.postedAt);
      const year = recordDate.getUTCFullYear();
      const month = recordDate.getUTCMonth() + 1;
      if (!Number.isFinite(recordDate.getTime()) || !Number.isFinite(bankDate.getTime())
        || (record.year != null && record.year !== year) || (record.month != null && record.month !== month)
        || year !== bankDate.getUTCFullYear() || month !== bankDate.getUTCMonth() + 1) {
        throw new BankReconciliationError('BANK_MATCH_PERIOD_MISMATCH', 'El periodo del movimiento cambió. Revisa la propuesta antes de aprobarla.', 409);
      }
      await assertOpenFinancialPeriod(tx, year, month);
      const alreadyMatched = await tx.bankReconciliationMatch.findFirst({ where: {
        id: { not: match.id }, status: 'APPROVED',
        OR: [{ financialRecordId: match.financialRecordId }, { bankTransactionId: match.bankTransactionId }]
      }, select: { id: true } });
      if (alreadyMatched) throw unavailable();

      // Claim every resource against the snapshot. Serializable also prevents two distinct
      // proposals from concurrently approving the same record via a phantom match read.
      const recordClaim = await tx.financialRecord.updateMany({ where: {
        id: record.id, status: 'POSTED', scenario: 'ACTUAL', isProjection: false,
        updatedAt: record.updatedAt, amount: record.amount, type: record.type,
        date: record.date, accountId: record.accountId
      }, data: { accountId: bank.accountId } });
      if (recordClaim.count !== 1) throw unavailable();
      const bankClaim = await tx.bankTransaction.updateMany({ where: {
        id: bank.id, status: 'PROPOSED', updatedAt: bank.updatedAt,
        amount: bank.amount, accountId: bank.accountId, postedAt: bank.postedAt
      }, data: { status: 'MATCHED' } });
      if (bankClaim.count !== 1) throw unavailable();
      const approved = { status: 'APPROVED', approvedById: actor?.id || actor?.userId || null, approvedAt: new Date() };
      const matchClaim = await tx.bankReconciliationMatch.updateMany({ where: {
        id: match.id, status: 'PROPOSED', updatedAt: match.updatedAt,
        bankTransactionId: bank.id, financialRecordId: record.id, amount: match.amount
      }, data: approved });
      if (matchClaim.count !== 1) throw unavailable();
      await tx.financialAuditEvent.create({ data: {
        entityType: 'BankReconciliationMatch', entityId: match.id, action: 'UPDATE', actorId: approved.approvedById,
        before: { status: match.status, accountId: record.accountId },
        after: { ...approved, accountId: bank.accountId }
      } });
      return { ...match, ...approved, bankTransaction: { ...bank, status: 'MATCHED' },
        financialRecord: { ...record, accountId: bank.accountId, account: bank.account } };
    }, { isolationLevel: 'Serializable' });
  } catch (error) {
    if (error.code === 'P2034') throw unavailable();
    throw error;
  }
};

export const listBankReconciliation = async (prismaClient, year, filters = {}) => {
  const imports = await prismaClient.bankStatementImport.findMany({
    where: { periodEnd: { gte: new Date(`${year}-01-01T00:00:00Z`), lt: new Date(`${year + 1}-01-01T00:00:00Z`) } },
    include: { account: { select: { id: true, name: true, lastFour: true } } }, orderBy: { periodStart: 'desc' }
  });
  const transactions = await prismaClient.bankTransaction.findMany({
    where: { postedAt: { gte: new Date(`${year}-01-01T00:00:00Z`), lt: new Date(`${year + 1}-01-01T00:00:00Z`) } },
    include: { account: { select: { id: true, name: true, lastFour: true } }, matches: { include: { financialRecord: { select: { id: true, description: true, amount: true, type: true, date: true, counterparty: true, sourceLabel: true, client: { select: { name: true } }, user: { select: { name: true } } } } } } },
    orderBy: [{ postedAt: 'desc' }, { sourceRow: 'desc' }]
  });
  const terms = String(filters.q || '').trim().toLocaleLowerCase('es').split(/\s+/).filter(Boolean);
  const filteredTransactions = transactions.filter(transaction => {
    const date = new Date(transaction.postedAt);
    if (filters.month && date.getUTCMonth() + 1 !== Number(filters.month)) return false;
    if (filters.type === 'INCOME' && Number(transaction.amount) < 0) return false;
    if (filters.type === 'EXPENSE' && Number(transaction.amount) >= 0) return false;
    const text = [transaction.description, transaction.account?.name,
      ...(transaction.matches || []).flatMap(match => [match.financialRecord?.description, match.financialRecord?.counterparty, match.financialRecord?.sourceLabel, match.financialRecord?.client?.name, match.financialRecord?.user?.name])
    ].filter(Boolean).join(' ').toLocaleLowerCase('es');
    return terms.every(term => text.includes(term));
  });
  return {
    imports,
    transactions: filteredTransactions,
    internalTransferCandidates: detectInternalTransferCandidates(transactions),
    continuityGaps: detectStatementContinuityGaps(imports)
  };
};

export const sourceHashFor = (buffer) => createHash('sha256').update(buffer).digest('hex');
