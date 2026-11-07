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
