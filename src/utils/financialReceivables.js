import { oldestAgingBucket } from '../lib/debtAging.js';

const round = value => Math.round((Number(value) || 0) * 100) / 100;
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
const civilDate = value => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};
export function financialDebtStatus(debt, asOf = today()) {
  if (debt.payments?.some(p => p.kind === 'REVERSO_CANJE' && !p.reversedAt)) return 'Anulada por reversión del canje';
  if (debt.balanceReviewRequired) return 'Saldo por verificar';
  if (Number(debt.outstanding) <= 0.005) return 'Sin saldo pendiente';
  const due = civilDate(debt.dueDate);
  return !due ? 'Sin vencimiento' : due < asOf ? 'Vencida' : 'Por vencer';
}
export function formatFinancialPeriod(value) {
  const date = civilDate(value);
  return date ? new Date(`${date}T12:00:00Z`).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', timeZone: 'UTC' }) : 'Sin periodo';
}
// Una ficha por identidad explícita. El tipo pertenece a cada obligación; agrupar saldos
// no convierte préstamos o canjes en facturación ni altera sus aplicaciones.
export function groupFinancialReceivables(items = [], asOf = today()) {
  const groups = new Map();
  for (const item of items) {
    const isLoan = item.kind === 'PRESTAMO';
    const base = item.clientId || `unlinked:${item.sourceLabel || item.clientName || item.id}`;
    const id = item.partyId ? `party:${item.partyId}` : item.clientId ? item.clientId : item.kind === 'BENEFICIARIO' ? `beneficiary:${item.beneficiaryThirdPartyId || item.id}` : isLoan ? `loan:${base}` : base;
    if (!groups.has(id)) groups.set(id, { clientId: id, customerId: item.clientId || null, partyId: item.partyId, kinds: [], kind: item.kind || 'CLIENTE', counterpartyType: isLoan ? item.counterpartyType || null : null, client: { name: item.partyName || item.clientName || 'Tercero sin nombre', slug: item.clientSlug }, totalOutstanding: 0, overdue: 0, unknownDue: 0, reviewCount: 0, oldestBucket: null, debts: [] });
    const row = groups.get(id), remaining = Math.max(round(item.outstanding), 0);
    if (item.clientId && !row.customerId) row.customerId = item.clientId;
    if (!row.kinds.includes(item.kind || 'CLIENTE')) row.kinds.push(item.kind || 'CLIENTE');
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
