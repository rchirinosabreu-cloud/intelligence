import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { financialCorrectionDatabase } from './support/financialCorrectionDatabase.js';
import { briaTestDatabaseUrl } from './support/briaTestDatabase.js';
import { readPaymentCorrection, correctExpensePayment } from '../src/services/financialPaymentCorrectionService.js';
import { listAccountStatement } from '../src/services/financialAccountStatementService.js';

test('correcciones financieras sobre PostgreSQL local aislado', { skip: !briaTestDatabaseUrl(), timeout: 90000 }, async t => {
  const fixture = await financialCorrectionDatabase(); t.after(fixture.close);
  const { db, actor, first, second, createPayment } = fixture;
  const prepare = async (kind, id) => ({ amount: '500000', accountId: second.id, paidAt: '2026-09-16', reference: 'CORREGIDO', notes: 'Conservar comprobante', reason: 'Se registró otra cuenta y valor por error', requestId: randomUUID(), expectedRevision: (await readPaymentCorrection(db, kind, id, actor)).revision });
  for (const kind of ['payroll', 'payable']) await t.test(`${kind}: un solo pago, movimiento y comprobante; saldos y auditoría coherentes`, async () => {
    const { payment, record, document } = await createPayment(kind);
    const before = await listAccountStatement(db, first.id);
    const input = await prepare(kind, payment.id);
    assert.equal((await correctExpensePayment(db, kind, payment.id, input, actor)).outstanding, 500000);
    const current = await readPaymentCorrection(db, kind, payment.id, actor);
    assert.equal(current.payment.amount, 500000); assert.equal(current.payment.id, payment.id);
    assert.equal(current.history.length, 1); assert.equal(current.history[0].before.amount, 600000); assert.equal(current.history[0].after.amount, 500000);
    assert.equal((await db.financialRecordDocument.findUnique({ where: { id: document.id } })).recordId, record.id);
    assert.equal((await listAccountStatement(db, first.id)).summary.balance, before.summary.balance + 600000);
    assert.equal((await db.financialRecord.findUnique({ where: { id: record.id } })).accountId, second.id);
    assert.equal((await correctExpensePayment(db, kind, payment.id, input, actor)).replayed, true);
    assert.equal(await db.financialAuditEvent.count({ where: { entityId: payment.id } }), 1);
    await assert.rejects(correctExpensePayment(db, kind, payment.id, { ...input, amount: '400000' }, actor), { statusCode: 409 });
  });
  await t.test('dos personas editando: una confirma y la otra recibe conflicto sin duplicar', async () => {
    const { payment } = await createPayment('payroll');
    const input = await prepare('payroll', payment.id);
    const results = await Promise.allSettled([input, { ...input, amount: '400000', requestId: randomUUID() }].map(body => correctExpensePayment(db, 'payroll', payment.id, body, actor)));
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.find(result => result.status === 'rejected').reason.statusCode, 409);
    assert.equal(await db.financialAuditEvent.count({ where: { entityId: payment.id } }), 1);
  });
  await t.test('si falla el historial, se revierten pago, movimiento y saldo juntos', async () => {
    const { payment, record } = await createPayment('payable');
    const input = await prepare('payable', payment.id);
    const failing = { $transaction: (work, options) => db.$transaction(tx => work(new Proxy(tx, { get(target, key) { return key === 'financialAuditEvent' ? { ...target[key], create: async () => { throw new Error('fallo de historial inducido'); } } : target[key]; } })), options) };
    await assert.rejects(correctExpensePayment(failing, 'payable', payment.id, input, actor), /fallo de historial/);
    assert.equal(Number((await db.payablePayment.findUnique({ where: { id: payment.id } })).amount), 600000);
    assert.equal((await db.financialRecord.findUnique({ where: { id: record.id } })).accountId, first.id);
    assert.equal(await db.financialAuditEvent.count({ where: { entityId: payment.id } }), 0);
  });
  await t.test('mes cerrado y acceso revocado se releen al guardar', async () => {
    const { payment } = await createPayment('payroll'); const input = await prepare('payroll', payment.id);
    const period = await db.financialPeriod.create({ data: { year: 2026, month: 9, status: 'CLOSED' } });
    await assert.rejects(correctExpensePayment(db, 'payroll', payment.id, input, actor), { statusCode: 409 });
    await db.financialPeriod.delete({ where: { id: period.id } });
    await db.user.update({ where: { id: actor.id }, data: { isActive: false } });
    await assert.rejects(correctExpensePayment(db, 'payroll', payment.id, input, actor), { statusCode: 403 });
    assert.equal(await db.financialAuditEvent.count({ where: { entityId: payment.id } }), 0);
  });
});
