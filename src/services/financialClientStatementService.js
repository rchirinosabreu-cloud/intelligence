import { financialCents, financialAmountFromCents } from '../utils/financialMoney.js';
import { FinancialDomainError } from './financialRecordService.js';

const invalid = () => new FinancialDomainError('FINANCIAL_STATEMENT_FILTER_INVALID', 'Revisa el cliente, año o página del estado de cuenta.');
const accountSelect = { select: { id: true, name: true, currency: true } };
const incomeFields = { id: true, date: true, amount: true, category: true, description: true, reference: true, account: accountSelect, attachmentUrl: true, attachmentName: true };
const debtFields = {
  id: true, clientId: true, period: true, dueDate: true, amount: true, status: true, notes: true, comments: true, metadata: true,
  payments: { orderBy: [{ paidAt: 'asc' }, { id: 'asc' }], select: {
    id: true, amount: true, paidAt: true, reference: true, account: accountSelect,
    financialRecord: { select: { ...incomeFields, clientId: true, type: true, status: true, scenario: true, isProjection: true } }
  } }
};
function presentDebt(row) {
  const { metadata, ...debt } = row;
  const currency = metadata?.currency || 'COP';
  const amount = financialCents(row.amount);
  let paid = 0, invalidPaid = false, review = amount === null || amount <= 0;
  for (const payment of row.payments) {
    const cents = financialCents(payment.amount), record = payment.financialRecord;
    if (cents === null || cents <= 0 || !Number.isSafeInteger(paid + cents)) { review = true; invalidPaid = true; }
    else paid += cents;
    if (!record || record.status !== 'POSTED' || record.scenario !== 'ACTUAL' || record.isProjection || record.type !== 'INCOME' || record.clientId !== row.clientId || financialCents(record.amount) !== cents || !payment.account?.id || record.account?.id !== payment.account.id || record.account?.currency !== currency || payment.account.currency !== currency) review = true;
  }
  if (paid > amount || (row.status === 'PAGADO' && paid !== amount)) review = true;
  return { ...debt, currency, paidAmount: invalidPaid ? null : financialAmountFromCents(paid),
    outstanding: review ? null : financialAmountFromCents(amount - paid), balanceReviewRequired: review };
}

// Read-only pages: annual obligations with their current applications are not a
// historic balance at Dec 31. Income is a separate view, never another deduction.
export async function getClientFinancialStatement(prismaClient, clientId, query = {}) {
  const year = Number(query.year), section = query.section || 'debts';
  if (typeof clientId !== 'string' || !clientId.trim() || clientId.length > 128 || !/^\d{4}$/.test(String(query.year)) || year < 1900 || year > 2200 || !['debts', 'income'].includes(section)) throw invalid();
  let cursor;
  if (query.cursor) {
    try {
      if (typeof query.cursor !== 'string' || query.cursor.length > 2048) throw invalid();
      cursor = JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8'));
      if (cursor.clientId !== clientId || cursor.year !== year || cursor.section !== section || typeof cursor.id !== 'string' || !cursor.id || cursor.id.length > 256 || typeof cursor.at !== 'string' || Number.isNaN(new Date(cursor.at).getTime())) throw invalid();
    } catch { throw invalid(); }
  }
  return prismaClient.$transaction(async tx => {
    const client = await tx.client.findUnique({ where: { id: clientId }, select: { id: true, name: true, slug: true } });
    if (!client) throw new FinancialDomainError('FINANCIAL_CLIENT_NOT_FOUND', 'El cliente no existe.', 404);
    const batch = await tx.financialImportBatch.findFirst({ where: { year, status: 'IMPORTED' }, orderBy: { createdAt: 'desc' }, select: { id: true } });
    const batchId = batch?.id || null;
    if (cursor && cursor.batchId !== batchId) throw new FinancialDomainError('FINANCIAL_STATEMENT_CHANGED', 'La importación cambió. Vuelve a la primera página del estado de cuenta.', 409);
    const dateField = section === 'debts' ? 'period' : 'date';
    const AND = [{ clientId, year }, batchId ? { OR: [{ importBatchId: batchId }, { importBatchId: null }] } : {}];
    if (section === 'income') AND.push({ type: 'INCOME', status: 'POSTED', scenario: 'ACTUAL', isProjection: false });
    if (cursor) AND.push({ OR: [{ [dateField]: { lt: new Date(cursor.at) } }, { [dateField]: new Date(cursor.at), id: { lt: cursor.id } }] });
    const rows = await tx[section === 'debts' ? 'accountsReceivable' : 'financialRecord'].findMany({
      where: { AND }, orderBy: [{ [dateField]: 'desc' }, { id: 'desc' }], take: 26,
      select: section === 'debts' ? debtFields : { ...incomeFields, receivablePayment: { select: { id: true, receivableId: true } } }
    });
    const page = rows.slice(0, 25), last = page.at(-1);
    return {
      client, scope: { year, section, importBatchId: batchId, kind: section === 'debts' ? 'ANNUAL_OBLIGATIONS_CURRENT_BALANCE' : 'ANNUAL_REGISTERED_INCOME' },
      items: section === 'debts' ? page.map(presentDebt) : page,
      nextCursor: rows.length > 25 ? Buffer.from(JSON.stringify({ clientId, year, section, batchId, at: new Date(last[dateField]).toISOString(), id: last.id })).toString('base64url') : null
    };
  }, { isolationLevel: 'RepeatableRead', timeout: 10000 });
}
