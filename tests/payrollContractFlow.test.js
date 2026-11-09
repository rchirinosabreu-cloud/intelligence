import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePayrollPeriod } from '../src/services/financialPayrollService.js';
import * as periods from '../src/lib/payrollPeriods.js';

test('generar noviembre conserva el pago de octubre contabilizado en noviembre y crea el servicio nuevo una sola vez', async () => {
  const contract = { id: 'jesu', startDate: new Date('2026-11-01'), endDate: new Date('2026-12-31'), baseSalary: 1500000, socialSecurity: 0 };
  const paid = { id: 'octubre', contractId: 'jesu', month: 11, year: 2026, periodKey: 'custom', status: 'PAID', serviceStart: new Date('2026-10-16'), serviceEnd: new Date('2026-10-31'), netAmount: 750000 };
  const rows = [paid], audits = [];
  const tx = {
    financialPeriod: { findUnique: async () => null }, payrollContract: { findMany: async () => [contract] },
    payrollTransaction: { findMany: async () => [...rows], upsert: async ({ create }) => { const row = { id: 'noviembre', ...create }; rows.push(row); return row; } },
    financialAuditEvent: { findMany: async () => [], create: async ({ data }) => audits.push(data) }
  };
  const db = { $transaction: fn => fn(tx) };
  const result = await generatePayrollPeriod(db, { year: 2026, month: 11 }, { id: 'admin' });
  assert.equal(rows.length, 2);
  assert.equal(result.createdCount, 1);
  assert.equal(rows[1].netAmount, 1500000);
  assert.equal(rows[1].serviceStart.toISOString().slice(0, 10), '2026-11-01');
  const again = await generatePayrollPeriod(db, { year: 2026, month: 11 }, { id: 'admin' });
  assert.equal(again.createdCount, 0);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], paid);
});

test('la evidencia mensual no depende del contrato actual ni inventa fechas de un legado sin respaldo', () => {
  assert.equal(typeof periods.recordedMonthlyBasis, 'function');
  const row = { id: 'old', contractId: 'contract', periodKey: 'MONTHLY', year: 2026, month: 9, baseSalary: 1000000, socialSecurity: 0 };
  const events = [
    { id: 'contract-created', entityType: 'PayrollContract', entityId: 'contract', createdAt: '2026-09-01T12:00:00Z', after: { startDate: '2026-03-01', endDate: '2026-12-31', baseSalary: '1000000', socialSecurity: '0' } },
    { id: 'generated', entityType: 'PayrollPeriod', entityId: '2026-09', createdAt: '2026-09-02T12:00:00Z', after: { transactionIds: ['old'] } },
    { id: 'renewed', entityType: 'PayrollContract', entityId: 'contract', createdAt: '2026-11-01T12:00:00Z', after: { startDate: '2026-11-01', endDate: '2026-12-31', baseSalary: 1500000 } },
  ];
  assert.deepEqual(periods.recordedMonthlyBasis(row, events), { start: '2026-09-01', end: '2026-09-30', source: 'MONTHLY_GENERATION', eventId: 'generated' });
  assert.equal(periods.recordedMonthlyBasis(row, events.slice(1)), null);
  assert.equal(periods.recordedMonthlyBasis({ ...row, baseSalary: 500000 }, events), null);
  assert.equal(periods.recordedMonthlyBasis({ ...row, serviceStart: '2026-08-16', serviceEnd: '2026-09-15' }, events), null);
  assert.equal(periods.recordedMonthlyBasis(row, events.map(e => e.id === 'contract-created' ? { ...e, after: { ...e.after, startDate: '2026-09-15' } } : e)), null);
  assert.equal(periods.recordedMonthlyBasis({ ...row, baseSalary: 'inválido' }, events.map(e => e.id === 'contract-created' ? { ...e, after: { ...e.after, baseSalary: 'inválido' } } : e)), null);
});
