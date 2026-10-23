import { oldestAgingBucket } from '../lib/receivableAging.js';

const round = value => Math.round((Number(value) || 0) * 100) / 100;
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
const civilDate = value => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};
export function financialDebtStatus(debt, asOf = today()) {
  if (debt.balanceReviewRequired) return 'Saldo por verificar';
  if (Number(debt.outstanding) <= 0.005) return 'Sin saldo pendiente';
  const due = civilDate(debt.dueDate);
  return !due ? 'Sin vencimiento' : due < asOf ? 'Vencida' : 'Por vencer';
}
export function formatFinancialPeriod(value) {
  const date = civilDate(value);
  return date ? new Date(`${date}T12:00:00Z`).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', timeZone: 'UTC' }) : 'Sin periodo';
}
// Un préstamo es otra clase de cuenta por cobrar (Elisa, 23 de octubre de 2026: «se desprenden las cuentas
// por cobrar ya sea a clientes, a empleados por concepto de préstamos u otro tipo de tercero»): va en su
// propio grupo aunque el tercero también sea cliente, para que lo prestado no se sume a lo facturado.
export function groupFinancialReceivables(items = [], asOf = today()) {
  const groups = new Map();
  for (const item of items) {
    const isLoan = item.kind === 'PRESTAMO';
    const base = item.clientId || `unlinked:${item.sourceLabel || item.clientName || item.id}`;
    const id = isLoan ? `loan:${base}` : base;
    if (!groups.has(id)) groups.set(id, { clientId: id, kind: isLoan ? 'PRESTAMO' : 'CLIENTE', counterpartyType: isLoan ? item.counterpartyType || null : null, client: { name: item.clientName || 'Cliente sin nombre', slug: item.clientSlug }, totalOutstanding: 0, overdue: 0, unknownDue: 0, reviewCount: 0, oldestBucket: null, debts: [] });
    const row = groups.get(id), remaining = Math.max(round(item.outstanding), 0);
    if (item.balanceReviewRequired) {
      row.reviewCount += 1;
      row.debts.push(item);
      continue;
    }
    row.totalOutstanding = round(row.totalOutstanding + remaining);
    const status = financialDebtStatus(item, asOf);
    if (status === 'Vencida') row.overdue = round(row.overdue + remaining);
    if (status === 'Sin vencimiento') row.unknownDue = round(row.unknownDue + remaining);
    row.debts.push(item);
  }
  for (const row of groups.values()) row.oldestBucket = oldestAgingBucket(row.debts, asOf);
  return [...groups.values()].sort((a, b) => b.totalOutstanding - a.totalOutstanding);
}
