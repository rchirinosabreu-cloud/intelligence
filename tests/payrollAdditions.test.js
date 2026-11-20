import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readPayrollAdditions, createPayrollAddition, reversePayrollAddition } from '../src/services/payrollAdditionService.js';
import { isPayrollAddition, listedAdditionsTotal } from '../src/lib/payrollAdditions.js';

// Adicionales de nómina (Rodny, 19 de noviembre de 2026): el bono de Melissa y el adicional de Sara se cargan a
// la liquidación, no sueltos en Movimientos. Los agrega quien escribe en Financiero y caben también en una
// liquidación ya pagada.

function fakeDb({ status = 'APPROVED', paid = 0, net = 509200, role = 'EDITOR', closed = false } = {}) {
  const users = { editor: { id: 'editor', name: 'Elisa', role: 'MEMBER', isActive: true, modulePermissions: { financiero: true }, financialRole: role } };
  const tx = {
    id: 'sara-nov', contractId: 'c', year: 2026, month: 11, status, voidedAt: null, financialRecordId: null,
    baseSalary: 500000, socialSecurity: 9200, grossAmount: net, deductions: 0, netAmount: net, paidAt: paid ? new Date('2026-11-15') : null,
    contract: { collaborator: { id: 'col' } }, adjustments: [],
    payments: paid ? [{ id: 'p1', amount: paid, paidAt: new Date('2026-11-15'), reversedAt: null, financialRecordId: 'r1' }] : []
  };
  const audits = [];
  const client = {
    user: { findUnique: async ({ where }) => users[where.id] || null },
    financialPeriod: { findUnique: async () => (closed ? { status: 'CLOSED' } : null) },
    financialAuditEvent: { create: async ({ data }) => { audits.push(data); return data; } },
    payrollTransaction: {
      findUnique: async () => structuredClone(tx),
      update: async ({ data }) => { Object.assign(tx, data); return structuredClone(tx); }
    },
    payrollAdjustment: {
      findUnique: async ({ where }) => structuredClone(tx.adjustments.find(a => (where.id && a.id === where.id) || (where.requestId && a.requestId === where.requestId)) || null),
      create: async ({ data }) => { const row = { id: randomUUID(), reversedAt: null, receivablePaymentId: null, ...data }; tx.adjustments.push(row); return structuredClone(row); },
      update: async ({ where, data }) => { const row = tx.adjustments.find(a => a.id === where.id); Object.assign(row, data); return structuredClone(row); }
    }
  };
  return { db: { $transaction: fn => fn(client) }, tx, audits };
}
const actor = { id: 'editor' };
const add = async (f, patch = {}) => createPayrollAddition(f.db, 'sara-nov', { type: 'BONUS', amount: 9200, reason: 'Adicional de octubre y noviembre', requestId: randomUUID(), expectedRevision: (await readPayrollAdditions(f.db, 'sara-nov', actor)).revision, ...patch }, actor);

test('un bono sube el bruto y el neto, queda con su motivo y no mueve dinero', async () => {
  const f = fakeDb();
  const result = await add(f);
  assert.equal(Number(f.tx.netAmount), 518400);
  assert.equal(Number(f.tx.grossAmount), 518400);
  assert.equal(f.tx.status, 'APPROVED');
  assert.equal(Number(result.outstanding), 518400);
  assert.equal(f.tx.payments.length, 0, 'agregar no registra ningún pago');
  assert.equal(f.tx.adjustments.length, 1);
  assert.ok(isPayrollAddition(f.tx.adjustments[0]));
  assert.equal(f.tx.adjustments[0].description, 'Adicional de octubre y noviembre');
  assert.equal(f.audits.at(-1).after.operation, 'PAYROLL_ADDITION');
});

test('lo agrega quien escribe en Financiero; quien solo ve no puede', async () => {
  await assert.rejects(add(fakeDb({ role: 'VIEWER' })), { code: 'FINANCIAL_ACCESS_DENIED' });
  await add(fakeDb({ role: 'EDITOR' }));
});

test('en una liquidación pagada la deja aprobada con lo que falta, sin tocar el pago', async () => {
  const f = fakeDb({ status: 'PAID', paid: 509200 });
  const result = await add(f, { amount: 150000 });
  assert.equal(f.tx.status, 'APPROVED');
  assert.equal(f.tx.paidAt, null);
  assert.equal(Number(result.outstanding), 150000);
  assert.equal(f.tx.payments.length, 1);
});

test('un borrador sigue en borrador', async () => {
  const f = fakeDb({ status: 'DRAFT' });
  await add(f);
  assert.equal(f.tx.status, 'DRAFT');
});

test('reintentar la misma solicitud no duplica; una revisión vieja se rechaza', async () => {
  const f = fakeDb();
  const revision = (await readPayrollAdditions(f.db, 'sara-nov', actor)).revision;
  const input = { type: 'BONUS', amount: 9200, reason: 'Bono', requestId: 'r-1', expectedRevision: revision };
  await createPayrollAddition(f.db, 'sara-nov', input, actor);
  const again = await createPayrollAddition(f.db, 'sara-nov', input, actor);
  assert.equal(again.replayed, true);
  assert.equal(f.tx.adjustments.length, 1);
  assert.equal(Number(f.tx.netAmount), 518400);
  await assert.rejects(createPayrollAddition(f.db, 'sara-nov', { ...input, requestId: 'r-2' }, actor), { code: 'PAYROLL_REVIEW_CHANGED' });
});

test('valores, tipo y período cerrado se dicen antes de guardar', async () => {
  await assert.rejects(add(fakeDb(), { amount: 0 }), { code: 'PAYROLL_ADDITION_INVALID' });
  await assert.rejects(add(fakeDb(), { amount: '0.001' }), { code: 'PAYROLL_ADDITION_INVALID' });
  await assert.rejects(add(fakeDb(), { type: 'DEDUCTION' }), { code: 'PAYROLL_ADDITION_INVALID' });
  await assert.rejects(add(fakeDb({ closed: true })), { code: 'FINANCIAL_PERIOD_CLOSED' });
});

test('revertir un adicional sin pagar baja el neto y lo conserva en el historial', async () => {
  const f = fakeDb();
  const { adjustment } = await add(f);
  const revision = (await readPayrollAdditions(f.db, 'sara-nov', actor)).revision;
  await reversePayrollAddition(f.db, adjustment.id, { reason: 'Se registró por error', requestId: randomUUID(), expectedRevision: revision }, actor);
  assert.equal(Number(f.tx.netAmount), 509200);
  assert.equal(Number(f.tx.grossAmount), 509200);
  assert.ok(f.tx.adjustments[0].reversedAt);
  assert.equal(f.tx.adjustments.length, 1, 'nada se borra');
});

test('un adicional ya pagado no se revierte hasta revertir el pago', async () => {
  const f = fakeDb({ status: 'PAID', paid: 509200 });
  const { adjustment } = await add(f, { amount: 150000 });
  f.tx.payments.push({ id: 'p2', amount: 150000, paidAt: new Date('2026-11-30'), reversedAt: null, financialRecordId: 'r2' });
  f.tx.status = 'PAID';
  const revision = (await readPayrollAdditions(f.db, 'sara-nov', actor)).revision;
  await assert.rejects(reversePayrollAddition(f.db, adjustment.id, { reason: 'Error', requestId: randomUUID(), expectedRevision: revision }, actor), { code: 'PAYROLL_ADDITION_ALREADY_PAID' });
  assert.equal(Number(f.tx.netAmount), 659200);
});

test('revertir lo que faltaba por pagar deja la liquidación pagada otra vez', async () => {
  const f = fakeDb({ status: 'PAID', paid: 509200 });
  const { adjustment } = await add(f, { amount: 150000 });
  const revision = (await readPayrollAdditions(f.db, 'sara-nov', actor)).revision;
  await reversePayrollAddition(f.db, adjustment.id, { reason: 'Se pagará el otro mes', requestId: randomUUID(), expectedRevision: revision }, actor);
  assert.equal(f.tx.status, 'PAID');
  assert.ok(f.tx.paidAt);
});

test('los descuentos de préstamo y los ajustes viejos sin marca no son adicionales', () => {
  assert.equal(isPayrollAddition({ type: 'DEDUCTION', detail: { kind: 'ADDITION' } }), false);
  assert.equal(isPayrollAddition({ type: 'BONUS', receivablePaymentId: 'x', detail: { kind: 'ADDITION' } }), false);
  assert.equal(isPayrollAddition({ type: 'NOVELTY', amount: 0, description: 'Anotación histórica' }), false);
  assert.equal(listedAdditionsTotal([{ amount: 9200 }, { amount: 1000, reversedAt: new Date() }, { amount: 150000.5 }]), 159200.5);
});
