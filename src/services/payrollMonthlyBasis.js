import { recordedMonthlyBasis } from '../lib/payrollPeriods.js';

export async function withPayrollMonthlyBasis(db, rows) {
  const candidates = rows.filter(row => !row.serviceStart && !row.serviceEnd && row.periodKey === 'MONTHLY');
  if (!candidates.length) return rows;
  const events = await db.financialAuditEvent.findMany({ where: { OR: [
    { entityType: 'PayrollContract', entityId: { in: [...new Set(candidates.map(row => row.contractId))] }, action: { in: ['CREATE', 'UPDATE'] } },
    { entityType: 'PayrollPeriod', entityId: { in: [...new Set(candidates.map(row => `${row.year}-${String(row.month).padStart(2, '0')}`))] }, action: 'CREATE' },
  ] }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  return rows.map(row => ({ ...row, monthlyBasis: recordedMonthlyBasis(row, events) }));
}
