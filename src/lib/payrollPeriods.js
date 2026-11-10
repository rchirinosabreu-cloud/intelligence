import { financialCents, financialAmountFromCents } from '../utils/financialMoney.js';

const invalid = message => Object.assign(new Error(message), { code: 'PAYROLL_PERIOD_INVALID', statusCode: 400 });
export function payrollDay(value) {
  const day = value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw invalid('Indica una fecha completa válida.');
  const date = new Date(`${day}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day) throw invalid('La fecha no existe.');
  return day;
}
export function calculatePayrollPeriod(input) {
  const start = payrollDay(input.start), end = payrollDay(input.end);
  const days = (new Date(`${end}T12:00:00Z`) - new Date(`${start}T12:00:00Z`)) / 86400000 + 1;
  if (days < 1 || days > 366) throw invalid('El período debe durar entre 1 y 366 días.');
  if (!['AGREED', 'DAILY'].includes(input.mode)) throw invalid('Selecciona importe acordado o tarifa por día.');
  const base = financialCents(input.baseSalary), security = financialCents(input.socialSecurity ?? 0);
  if (base === null || security === null || base < 0 || security < 0 || base + security <= 0) throw invalid('Indica importes válidos con un máximo de dos decimales.');
  const multiplier = input.mode === 'DAILY' ? days : 1;
  if (!Number.isSafeInteger((base + security) * multiplier)) throw invalid('El importe excede el rango permitido.');
  return { start, end, days, mode: input.mode, baseSalary: financialAmountFromCents(base * multiplier), socialSecurity: financialAmountFromCents(security * multiplier), grossAmount: financialAmountFromCents((base + security) * multiplier) };
}
export const payrollPeriodsOverlap = (start, end, otherStart, otherEnd) => payrollDay(start) <= payrollDay(otherEnd) && payrollDay(otherStart) <= payrollDay(end);
export function payrollMonthRange(year, month) {
  return { start: new Date(Date.UTC(year, month - 1, 1, 12)).toISOString().slice(0, 10), end: new Date(Date.UTC(year, month, 0, 12)).toISOString().slice(0, 10) };
}
// A contract for exactly one monthly cycle has an unambiguous full monthly amount,
// including a cycle crossing calendar months. Shorter tranches still need review.
export function payrollGenerationRange(contract,year,month) {
  const calendar=payrollMonthRange(year,month);
  const start=String(contract.startDate instanceof Date?contract.startDate.toISOString():contract.startDate).slice(0,10);
  const end=contract.endDate?String(contract.endDate instanceof Date?contract.endDate.toISOString():contract.endDate).slice(0,10):null;
  if(start<=calendar.start&&(!end||end>=calendar.end))return calendar;
  if(!end||end.slice(0,7)!==calendar.start.slice(0,7))return null;
  const date=new Date(`${start}T12:00:00Z`),day=date.getUTCDate();
  const last=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+2,0)).getUTCDate();
  const next=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,Math.min(day,last),12));next.setUTCDate(next.getUTCDate()-1);
  return next.toISOString().slice(0,10)===end?{start,end}:null;
}
export function payrollUnknownMayOverlap(row,start,end,contractId) {
  if(payrollServiceRange(row)||row.voidedAt)return false;
  if(row.contractId===contractId||!row.contract?.startDate)return true;
  const first=String(row.contract.startDate instanceof Date?row.contract.startDate.toISOString():row.contract.startDate).slice(0,10);
  const last=row.contract.endDate?String(row.contract.endDate instanceof Date?row.contract.endDate.toISOString():row.contract.endDate).slice(0,10):null;
  return !(first>end || (last&&last<start));
}
// A projection of the original monthly generation, never a backfill of service dates.
// The current contract cannot establish the scope of a historical payroll.
export function recordedMonthlyBasis(row, events) {
  if (row.serviceStart || row.serviceEnd || row.periodKey !== 'MONTHLY') return null;
  const ordered = [...events].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const generation = ordered.find(e => e.entityType === 'PayrollPeriod' && e.entityId === `${row.year}-${String(row.month).padStart(2, '0')}` && e.after?.transactionIds?.includes(row.id));
  if (!generation) return null;
  const history = ordered.filter(e => e.entityType === 'PayrollContract' && e.entityId === row.contractId && new Date(e.createdAt) <= new Date(generation.createdAt));
  const contract = history.at(-1)?.after;
  if (!contract?.startDate) return null;
  const range = payrollMonthRange(row.year, row.month);
  const date = value => payrollDay(String(value).slice(0, 10));
  try {
    if (date(contract.startDate) > range.start || (contract.endDate && date(contract.endDate) < range.end)) return null;
    const base = financialCents(contract.baseSalary), security = financialCents(contract.socialSecurity ?? 0);
    if (base === null || security === null || base < 0 || security < 0 || base !== financialCents(row.baseSalary) || security !== financialCents(row.socialSecurity ?? 0)) return null;
  } catch { return null; }
  return { ...range, source: 'MONTHLY_GENERATION', eventId: generation.id };
}
export function payrollServiceRange(row) {
  if (row.serviceStart && row.serviceEnd) return { start: String(row.serviceStart instanceof Date ? row.serviceStart.toISOString() : row.serviceStart).slice(0, 10), end: String(row.serviceEnd instanceof Date ? row.serviceEnd.toISOString() : row.serviceEnd).slice(0, 10) };
  return row.monthlyBasis || null;
}
export function payrollDraftNeedsContract(row, contract) {
  if (!row || row.voidedAt || row.status !== 'DRAFT' || row.financialRecordId || Number(row.deductions) || (row.payments || []).some(p => !p.reversedAt) || (row.adjustments || row.loanDeductions || []).some(a => !a.reversedAt)) return false;
  const range = payrollServiceRange(row), month = payrollMonthRange(row.year, row.month);
  if (!range || range.start !== month.start || range.end !== month.end || !contract.startDate) return false;
  const start = String(contract.startDate instanceof Date ? contract.startDate.toISOString() : contract.startDate).slice(0, 10);
  const end = contract.endDate ? String(contract.endDate instanceof Date ? contract.endDate.toISOString() : contract.endDate).slice(0, 10) : null;
  return start <= month.start && (!end || end >= month.end) && (Number(row.baseSalary) !== Number(contract.baseSalary) || Number(row.socialSecurity) !== Number(contract.socialSecurity));
}
// Read-only diagnosis shared by the form and server. Never infer service dates.
export function unknownPayrollPeriods(rows = []) {
  return rows.filter(row => !row.voidedAt && !payrollServiceRange(row)).map(row => ({
    id: row.id, year: row.year, month: row.month, status: row.status, netAmount: Number(row.netAmount),
    canReverse: !row.financialRecordId && !(row.payments || []).some(p => !p.reversedAt) && !(row.adjustments || []).some(a => !a.reversedAt),
  }));
}
