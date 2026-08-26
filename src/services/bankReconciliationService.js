import { createHash } from 'node:crypto';
import { PDFParse } from 'pdf-parse';

export class BankReconciliationError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

const money = (value) => Number(String(value || '0').replace(/,/g, ''));
const isoDate = (year, month, day) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
const amountPattern = /-?(?:\d{1,3}(?:,\d{3})*|\d+)?\.\d{2}/g;

const extractSummary = (text) => {
  const direct = (label) => text.match(new RegExp(`${label}\\s*\\$?\\s*([\\d,]+\\.\\d{2})`, 'i'))?.[1];
  const block = text.match(/RESUMEN([\s\S]*?)(?:SALDO PROMEDIO|FECHA DESCRIPCI[ÓO]N)/i)?.[1] || '';
  const values = block.match(/[\d,]+\.\d{2}/g) || [];
  return {
    openingBalance: money(direct('SALDO ANTERIOR') || values[0]),
    closingBalance: money(direct('SALDO ACTUAL') || values[3])
  };
};

export const parseBancolombiaStatementText = (text, { year } = {}) => {
  const normalizedText = String(text || '').replace(/\r/g, '');
  const period = normalizedText.match(/DESDE:\s*(\d{4})\/(\d{2})\/(\d{2})\s+HASTA:\s*(\d{4})\/(\d{2})\/(\d{2})/i);
  const inferredYear = Number(year || period?.[4] || new Date().getUTCFullYear());
  const periodStart = period ? isoDate(period[1], period[2], period[3]) : null;
  const periodEnd = period ? isoDate(period[4], period[5], period[6]) : null;
  const table = normalizedText.split(/FECHA DESCRIPCI[ÓO]N[^\n]*\n/i)[1]?.split(/FIN ESTADO DE CUENTA/i)[0] || '';
  const groups = table.split(/(?=^\d{1,4}\/\d{1,2}(?:\/\d{1,2})?\s)/m).map((part) => part.trim()).filter(Boolean);
  const transactions = [];

  groups.forEach((group) => {
    const dateMatch = group.match(/^(\d{1,4})\/(\d{1,2})(?:\/(\d{1,2}))?\s+/);
    if (!dateMatch) return;
    const modern = dateMatch[3] !== undefined;
    const postedAt = modern
      ? isoDate(dateMatch[1], dateMatch[2], dateMatch[3])
      : isoDate(inferredYear, dateMatch[2], dateMatch[1]);
    const values = group.match(amountPattern) || [];
    if (!values.length) return;
    const amount = money(modern ? values.at(-1) : values.at(-2) || values.at(-1));
    const balance = modern || values.length < 2 ? null : money(values.at(-1));
    let description = group.slice(dateMatch[0].length);
    values.forEach((value) => { description = description.replace(value, ' '); });
    description = description.replace(/\s+/g, ' ').trim();
    transactions.push({ postedAt, description, amount, balance, sourceRow: transactions.length + 1 });
  });

  const summary = extractSummary(normalizedText);
  if (!periodStart || !periodEnd || !Number.isFinite(summary.openingBalance) || !Number.isFinite(summary.closingBalance)) {
    throw new BankReconciliationError('BANK_STATEMENT_INVALID', 'El extracto no contiene un periodo y saldos reconocibles.');
  }
  return { periodStart, periodEnd, ...summary, transactions };
};

export const parseBancolombiaStatementPages = (pages, options = {}) => {
  const pageTexts = pages.map((page) => typeof page === 'string' ? page : page?.text || '');
  const period = pageTexts[0]?.match(/HASTA:\s*(\d{4})\/(\d{2})\/(\d{2})/i);
  const periodEndYear = Number(options.year || period?.[1] || new Date().getUTCFullYear());
  const periodEndMonth = Number(period?.[2] || 12);
  const columnTransactions = [];
  pageTexts.forEach((pageText) => {
    const body = pageText.split(/FECHA DESCRIPCI[ÓO]N[^\n]*\n/i)[1] || '';
    const lines = body.split('\n').map((line) => line.trim()).filter(Boolean);
    const dates = [];
    while (lines[dates.length] && /^\d{1,2}\/\d{1,2}$/.test(lines[dates.length])) dates.push(lines[dates.length]);
    if (!dates.length) {
      const table = body.split(/FIN ESTADO DE CUENTA/i)[0];
      const summary = pageTexts[0].split(/FECHA DESCRIPCI[ÓO]N[^\n]*\n/i)[0];
      try {
        const rowParsed = parseBancolombiaStatementText(`${summary}\nFECHA DESCRIPCIÓN VALOR SALDO\n${table}\nFIN ESTADO DE CUENTA`, options);
        rowParsed.transactions.forEach((transaction) => columnTransactions.push({
          ...transaction, sourceRow: columnTransactions.length + 1
        }));
      } catch {
        // Una página sin movimientos válidos no invalida el resto del extracto.
      }
      return;
    }
    const descriptions = lines.slice(dates.length, dates.length * 2);
    const numericBlock = lines.slice(dates.length * 2).join(' ')
      .replace(/([\d,])\s+([.]\d{2})(?=\s|$)/g, '$1$2');
    const values = numericBlock.match(amountPattern) || [];
    if (descriptions.length !== dates.length || values.length < dates.length * 2) return;
    dates.forEach((date, index) => {
      const [day, month] = date.split('/').map(Number);
      const transactionYear = month > periodEndMonth ? periodEndYear - 1 : periodEndYear;
      columnTransactions.push({
        postedAt: isoDate(transactionYear, month, day),
        description: descriptions[index].replace(/\s+/g, ' ').trim(),
        amount: money(values[index]),
        balance: money(values[index + dates.length]),
        sourceRow: columnTransactions.length + 1
      });
    });
  });
  const tables = pageTexts.map((pageText) => (
    pageText.split(/FECHA DESCRIPCI[ÓO]N[^\n]*\n/i)[1]?.split(/FIN ESTADO DE CUENTA/i)[0] || ''
  ));
  const summary = pageTexts[0].split(/FECHA DESCRIPCI[ÓO]N[^\n]*\n/i)[0];
  const combined = `${summary}\nFECHA DESCRIPCIÓN VALOR SALDO\n${tables.join('\n')}\nFIN ESTADO DE CUENTA`;
  const parsed = parseBancolombiaStatementText(combined, options);
  return columnTransactions.length ? { ...parsed, transactions: columnTransactions } : parsed;
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
    const bankDate = new Date(transaction.postedAt);
    const expectedType = numeric(transaction.amount) >= 0 ? 'INCOME' : 'EXPENSE';
    const record = financialRecords.find((candidate) => !used.has(candidate.id)
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

export const persistBankStatementImport = async (prismaClient, input, parsed, actorId) => {
  const existing = await prismaClient.bankStatementImport.findUnique({
    where: { accountId_sourceHash: { accountId: input.accountId, sourceHash: input.sourceHash } }
  });
  if (existing) throw new BankReconciliationError('BANK_STATEMENT_DUPLICATE', 'Este extracto ya fue importado para la cuenta seleccionada.', 409);

  return prismaClient.$transaction(async (tx) => {
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

export const approveBankMatch = async (prismaClient, matchId, actor) => prismaClient.$transaction(async (tx) => {
  const match = await tx.bankReconciliationMatch.findUnique({
    where: { id: matchId }, include: { bankTransaction: true, financialRecord: true }
  });
  if (!match || match.status !== 'PROPOSED') throw new BankReconciliationError('BANK_MATCH_NOT_AVAILABLE', 'La propuesta ya no está disponible.', 409);
  const bankAmount = Math.abs(numeric(match.bankTransaction.amount));
  if (Math.abs(bankAmount - numeric(match.amount)) > 0.01 || Math.abs(numeric(match.financialRecord.amount) - numeric(match.amount)) > 0.01) {
    throw new BankReconciliationError('BANK_MATCH_REQUIRES_SPLIT', 'La coincidencia parcial requiere una distribución explícita.', 409);
  }
  await tx.financialRecord.update({ where: { id: match.financialRecordId }, data: { accountId: match.bankTransaction.accountId } });
  await tx.bankTransaction.update({ where: { id: match.bankTransactionId }, data: { status: 'MATCHED' } });
  await tx.bankReconciliationMatch.update({ where: { id: match.id }, data: { status: 'APPROVED', approvedById: actor?.id || actor?.userId || null, approvedAt: new Date() } });
  await tx.financialAuditEvent.create({ data: {
    entityType: 'BankReconciliationMatch', entityId: match.id, action: 'UPDATE', actorId: actor?.id || actor?.userId || null,
    before: { status: 'PROPOSED' }, after: { status: 'APPROVED', accountId: match.bankTransaction.accountId }
  } });
  return match;
});

export const listBankReconciliation = async (prismaClient, year) => {
  const imports = await prismaClient.bankStatementImport.findMany({
    where: { periodEnd: { gte: new Date(`${year}-01-01T00:00:00Z`), lt: new Date(`${year + 1}-01-01T00:00:00Z`) } },
    include: { account: { select: { id: true, name: true, lastFour: true } } }, orderBy: { periodStart: 'desc' }
  });
  const transactions = await prismaClient.bankTransaction.findMany({
    where: { postedAt: { gte: new Date(`${year}-01-01T00:00:00Z`), lt: new Date(`${year + 1}-01-01T00:00:00Z`) } },
    include: { account: { select: { id: true, name: true, lastFour: true } }, matches: { include: { financialRecord: { select: { id: true, description: true, amount: true, type: true, date: true } } } } },
    orderBy: [{ postedAt: 'desc' }, { sourceRow: 'desc' }]
  });
  return {
    imports,
    transactions,
    internalTransferCandidates: detectInternalTransferCandidates(transactions),
    continuityGaps: detectStatementContinuityGaps(imports)
  };
};

export const sourceHashFor = (buffer) => createHash('sha256').update(buffer).digest('hex');
