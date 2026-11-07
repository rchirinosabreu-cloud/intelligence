import { financialCents, financialAmountFromCents } from '../utils/financialMoney.js';
import { FinancialDomainError } from './financialRecordService.js';

const invalid = () => new FinancialDomainError('ACCOUNT_BALANCE_REVIEW', 'El saldo de esta cuenta requiere revisión: hay fechas o valores que no se pueden interpretar.', 409);
const cents = value => { const result = financialCents(value); if (result === null) throw invalid(); return result; };
const signedCents = value => { const negative = String(value).trim().startsWith('-'); return negative ? -cents(typeof value === 'number' ? -value : String(value).trim().slice(1)) : cents(value); };
const amount = value => { const absolute = financialAmountFromCents(Math.abs(value)); return value < 0 ? typeof absolute === 'string' ? `-${absolute}` : -absolute : absolute; };
const add = (a, b) => { const result = a + b; if (!Number.isSafeInteger(result)) throw invalid(); return result; };
const dayOf = value => { const date = new Date(value); if (!value || Number.isNaN(date.getTime())) throw invalid(); return date.toISOString().slice(0, 10); };
const included = (record, openingDay) => record.status === 'POSTED' && record.scenario === 'ACTUAL' && !record.isProjection && dayOf(record.date) >= openingDay;

/** Mismo alcance para la tarjeta y su detalle: desde el día contable de apertura, todos los años. */
export function accountBalanceBreakdown(account, records) {
  const openingDay = dayOf(account.openingBalanceDate);
  const opening = signedCents(account.openingBalance);
  let income = 0, expense = 0, count = 0;
  for (const record of records) {
    if (!included(record, openingDay)) continue;
    const value = cents(record.amount);
    if (value < 0 || !['INCOME', 'EXPENSE'].includes(record.type)) throw invalid();
    if (record.type === 'INCOME') income = add(income, value); else expense = add(expense, value);
    count++;
  }
  return { openingBalance: amount(opening), openingDay, income: amount(income), expense: amount(expense), balance: amount(add(add(opening, income), -expense)), count };
}

export async function listAccountStatement(db, accountId, query = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const pageSize = 50;
  return db.$transaction(async tx => {
    const account = await tx.financialAccount.findUnique({ where: { id: accountId }, select: { id: true, name: true, openingBalance: true, openingBalanceDate: true, currency: true } });
    if (!account) throw new FinancialDomainError('FINANCIAL_ACCOUNT_NOT_FOUND', 'No encontramos esa cuenta.', 404);
    const openingDay = dayOf(account.openingBalanceDate);
    // Proyección mínima, como el cálculo de las tarjetas. Solo se devuelve la página solicitada.
    const rows = await tx.financialRecord.findMany({ where: { accountId, status: 'POSTED', scenario: 'ACTUAL', isProjection: false, date: { gte: new Date(`${openingDay}T00:00:00Z`) } },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, amount: true, date: true, type: true, status: true, scenario: true, isProjection: true, description: true, reference: true, category: true, origin: true } });
    const summary = accountBalanceBreakdown(account, rows);
    let running = signedCents(account.openingBalance);
    const items = rows.filter(row => included(row, openingDay)).map(row => {
      running = add(running, (row.type === 'INCOME' ? 1 : -1) * cents(row.amount));
      return { ...row, amount: amount(cents(row.amount)), runningBalance: amount(running) };
    }).slice((page - 1) * pageSize, page * pageSize);
    return { account: { id: account.id, name: account.name, currency: account.currency || 'COP' }, summary, items, page, pageSize, total: summary.count, hasMore: page * pageSize < summary.count };
  }, { isolationLevel: 'RepeatableRead' });
}
