import test from 'node:test';
import assert from 'node:assert/strict';
import { readPaymentCorrection, correctExpensePayment } from '../src/services/financialPaymentCorrectionService.js';

const actor = { id: 'admin', role: 'ADMIN' };
function fixture(kind = 'payroll') {
  const tables = {
    user: [{ id: 'admin', role: 'ADMIN', isActive: true }],
    financialAccount: [{ id: 'brain', name: 'Brainstudio', isActive: true, currency: 'COP' }, { id: 'personal', name: 'Cuenta personal', isActive: true, currency: 'COP' }],
    financialRecord: [{ id: 'record', accountId: 'brain', amount: 750000, date: new Date('2026-10-31T12:00:00Z'), year: 2026, month: 10, type: 'EXPENSE', status: 'POSTED', scenario: 'ACTUAL', origin: 'SYSTEM', isProjection: false, reference: 'Original', notes: null, allocations: [] }],
    payrollTransaction: [{ id: 'parent', netAmount: 750000, status: 'PAID', year: 2026, month: 10, contract: { collaborator: { displayName: 'Persona de prueba' } } }],
    accountsPayable: [{ id: 'parent', amount: 1000000, status: 'PARCIAL', concept: 'Arriendo', currency: 'COP', thirdParty: { name: 'Proveedor de prueba' } }],
    payrollPayment: [], payablePayment: [], financialPeriod: [], financialAuditEvent: []
  };
  const model = kind === 'payroll' ? 'payrollPayment' : 'payablePayment';
  tables[model].push({ id: 'payment', [kind === 'payroll' ? 'transactionId' : 'payableId']: 'parent', financialRecordId: 'record', amount: 750000, paidAt: new Date('2026-10-31T12:00:00Z'), accountId: 'brain', reference: 'Original', notes: null, reversedAt: null });
  const matches = (row, where = {}) => Object.entries(where).every(([key, value]) => {
    if (key === 'year_month') return row.year === value.year && row.month === value.month;
    if (key === 'after') return row.after?.[value.path[0]] === value.equals;
    return (row[key] ?? null) === (value ?? null);
  });
  const db = Object.fromEntries(Object.keys(tables).map(name => [name, {
    findUnique: async ({ where }) => structuredClone(tables[name].find(row => matches(row, where)) || null),
    findFirst: async ({ where }) => structuredClone(tables[name].find(row => matches(row, where)) || null),
    findMany: async ({ where } = {}) => structuredClone(tables[name].filter(row => matches(row, where))),
    update: async ({ where, data }) => { const row = tables[name].find(row => matches(row, where)); Object.assign(row, data); return structuredClone(row); },
    create: async ({ data }) => { const row = { id: `${name}-${tables[name].length}`, createdAt: new Date(), ...data }; tables[name].push(row); return structuredClone(row); }
  }]));
  db.$transaction = async work => { const before = structuredClone(tables); try { return await work(db); } catch (error) { for (const key of Object.keys(tables)) tables[key] = before[key]; throw error; } };
  return { db, tables, model, kind };
}
const body = context => ({ expectedRevision: context.revision, requestId: 'correction-1', amount: '700000', paidAt: '2026-11-01', accountId: 'personal', reference: 'Corregida', notes: '', reason: 'Se eligió una cuenta equivocada.' });

for (const kind of ['payroll', 'payable']) {
  test(`${kind}: corrige el mismo pago y movimiento, recalcula el pendiente y conserva autor e historia`, async () => {
    const { db, tables, model } = fixture(kind);
    const context = await readPaymentCorrection(db, kind, 'payment', actor);
    const input = body(context);
    const result = await correctExpensePayment(db, kind, 'payment', input, actor);
    assert.equal(tables[model].length, 1); assert.equal(tables.financialRecord.length, 1);
    assert.equal(tables[model][0].accountId, 'personal'); assert.equal(Number(tables.financialRecord[0].amount), 700000);
    assert.equal(tables.financialRecord[0].month, 11);
    assert.equal(result.outstanding, kind === 'payroll' ? 50000 : 300000);
    assert.equal(tables.financialAuditEvent.at(-1).actorId, 'admin');
    assert.equal(tables.financialAuditEvent.at(-1).before.payment.accountId, 'brain');
    assert.equal(tables.financialAuditEvent.at(-1).after.reason, input.reason);
    const count = tables.financialAuditEvent.length;
    assert.equal((await correctExpensePayment(db, kind, 'payment', input, actor)).replayed, true);
    assert.equal(tables.financialAuditEvent.length, count);
    await assert.rejects(correctExpensePayment(db, kind, 'payment', { ...input, amount: '710000' }, actor), { statusCode: 409 });
  });
  test(`${kind}: pantalla obsoleta, deuda excedida, cuenta inactiva y falta de motivo no escriben`, async () => {
    for (const change of [{ expectedRevision: 'old' }, { amount: '2000000' }, { accountId: 'missing' }, { reason: '' }, { amount: '0' }]) {
      const { db, tables } = fixture(kind); const context = await readPaymentCorrection(db, kind, 'payment', actor);
      await assert.rejects(correctExpensePayment(db, kind, 'payment', { ...body(context), ...change }, actor));
      assert.equal(tables.financialAuditEvent.length, 0); assert.equal(tables.financialRecord[0].accountId, 'brain');
    }
  });
  test(`${kind}: no altera un mes cerrado ni un movimiento preexistente aplicado`, async () => {
    for (const mode of ['old-period', 'new-period', 'external', 'voided', 'mismatch', 'reversed', 'bank-matched']) {
      const { db, tables, model } = fixture(kind);
      if (mode.endsWith('period')) tables.financialPeriod.push({ year: 2026, month: mode === 'old-period' ? 10 : 11, status: 'CLOSED' });
      if (mode === 'bank-matched') tables.financialRecord[0].bankMatches = [{ id: 'match' }];
      if (mode === 'external') tables.financialRecord[0].origin = 'MANUAL';
      if (mode === 'voided') tables.financialRecord[0].status = 'VOIDED';
      if (mode === 'mismatch') tables.financialRecord[0].amount = 100;
      if (mode === 'reversed') tables[model][0].reversedAt = new Date();
      const context = await readPaymentCorrection(db, kind, 'payment', actor);
      await assert.rejects(correctExpensePayment(db, kind, 'payment', body(context), actor));
      assert.equal(tables.financialAuditEvent.length, 0);
    }
  });
  test(`${kind}: un error al guardar el historial revierte todos los efectos`, async () => {
    const { db, tables } = fixture(kind); const context = await readPaymentCorrection(db, kind, 'payment', actor);
    db.financialAuditEvent.create = async () => { throw new Error('historial no disponible'); };
    await assert.rejects(correctExpensePayment(db, kind, 'payment', body(context), actor), /historial no disponible/);
    assert.equal(tables.financialRecord[0].accountId, 'brain');
  });
}
test('relee los permisos y no entrega el historial de auditoría a un lector financiero', async () => {
  const { db, tables } = fixture();
  tables.user[0] = { id: 'admin', role: 'MEMBER', isActive: true, modulePermissions: { financiero: true }, financialRole: 'VIEWER' };
  const context = await readPaymentCorrection(db, 'payroll', 'payment', actor);
  assert.deepEqual(context.history, []); assert.equal(context.canCorrect, false);
  await assert.rejects(correctExpensePayment(db, 'payroll', 'payment', body(context), actor), { statusCode: 403 });
  tables.user[0].modulePermissions.financiero = false;
  await assert.rejects(readPaymentCorrection(db, 'payroll', 'payment', actor), { statusCode: 403 });
});

test('conserva el último centavo también en el límite de precisión permitido', async () => {
  const { db, tables } = fixture();
  const amount = '90071992547409.91';
  tables.payrollTransaction[0].netAmount = amount;
  tables.payrollPayment[0].amount = amount;
  tables.financialRecord[0].amount = amount;
  const context = await readPaymentCorrection(db, 'payroll', 'payment', actor);
  await correctExpensePayment(db, 'payroll', 'payment', { ...body(context), amount }, actor);
  assert.equal(String(tables.payrollPayment[0].amount), amount);
  assert.equal(String(tables.financialRecord[0].amount), amount);
});
