import { briaTestDatabaseUrl } from './support/briaTestDatabase.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { financialCorrectionDatabase } from './support/financialCorrectionDatabase.js';
import { barterContext, createBarter, reverseBarter, assignBarterDestination } from '../src/services/financialBarterService.js';
import { createReceivablePayment, reverseReceivablePayment } from '../src/services/receivablePaymentService.js';
import { deleteReceivable, updateReceivable } from '../src/services/financialReceivableService.js';
import { offsetOptions, createOffset, readOffset, reverseOffset } from '../src/services/financialOffsetService.js';
import { groupFinancialReceivables } from '../src/utils/financialReceivables.js';
import { settleReceivable } from '../src/services/receivableSettlementService.js';

test('canje: obligación nativa, reintento, cobro y reversión conservan ambos historiales', { skip: !briaTestDatabaseUrl(), timeout: 90000 }, async () => {
  const f = await financialCorrectionDatabase({ additionalTables: ['Client', 'AccountsReceivable', 'ReceivablePayment', 'ReceivablePaymentDocument', 'ReceivableItem', 'PayrollAdjustment'] });
  const { db, actor } = f;
  try {
    const client = await db.client.create({ data: { name: 'Cliente ficticio', slug: randomUUID() } });
    const party = await db.thirdParty.create({ data: { name: 'Beneficiario ficticio', kind: 'SOCIO' } });
    const ar = await db.accountsReceivable.create({ data: { clientId: client.id, amount: 1000000, period: new Date('2026-11-01'), year: 2026, month: 11 } });
    const ctx = await barterContext(db, { receivableId: ar.id }, actor);
    const input = { amount: 600000, settledAt: '2026-11-07', goods: 'Mobiliario de muestra', destinationMode: 'BENEFICIARIO', beneficiaryThirdPartyId: party.id, authorizedBy: 'Autorizante ficticio', reason: 'Entrega personal con cobro autorizado', expectedRevision: ctx.revision, requestId: randomUUID() };
    const saved = await createBarter(db, ar.id, input, actor);
    assert.equal(saved.receivable.outstanding, 400000);
    assert.equal(saved.beneficiary.outstanding, 600000);
    await assert.rejects(settleReceivable(db, saved.beneficiary.id, { kind: 'RETENCION', amount: 100, settledAt: '2026-11-07', retentionType: 'RETEFUENTE' }, actor), e => e.code === 'BARTER_ADJUSTMENT_INVALID');
    assert.equal(await db.financialRecord.count(), 0);
    assert.equal((await createBarter(db, ar.id, input, actor)).payment.id, saved.payment.id);
    assert.equal(await db.accountsReceivable.count(), 2);
    await assert.rejects(reverseReceivablePayment(db, saved.payment.id, { reason: 'No unilateral' }, actor), /canje/i);
    const paid = await createReceivablePayment(db, saved.beneficiary.id, { amount: 100000, paidAt: '2026-11-07', accountId: f.first.id, requestId: randomUUID() }, actor);
    assert.equal(paid.financialRecord.section, 'FINANCING');
    assert.equal(paid.financialRecord.category, 'FINANCIAL');
    const current = await barterContext(db, { paymentId: saved.payment.id }, actor);
    assert.equal(current.canReverse, false);
    await assert.rejects(reverseBarter(db, saved.payment.id, { reason: 'Entrega cancelada', requestId: randomUUID(), expectedRevision: current.revision }, actor), /aplicaciones|cobros/i);
    await reverseReceivablePayment(db, paid.payment.id, { reason: 'Cobro registrado por error' }, actor);
    const ready = await barterContext(db, { paymentId: saved.payment.id }, actor);
    const reverse = { reason: 'Bienes devueltos al cliente', requestId: randomUUID(), expectedRevision: ready.revision };
    const undone = await reverseBarter(db, saved.payment.id, reverse, actor);
    assert.equal(undone.receivable.outstanding, 1000000);
    assert.equal(undone.beneficiary.outstanding, 0);
    assert.ok(undone.payment.reversedAt);
    assert.equal((await reverseBarter(db, saved.payment.id, reverse, actor)).replayed, true);
    assert.equal(await db.receivablePayment.count(), 3);
    assert.equal(await db.accountsReceivable.count(), 2);
    assert.equal(await db.financialRecord.count(), 1);
    assert.ok(await db.financialAuditEvent.count() >= 6);
  } finally { await f.close(); }
});

test('protecciones de canjes: precisión, concurrencia, permisos, períodos, atomicidad y cruce del beneficiario', { skip: !briaTestDatabaseUrl(), timeout: 90000 }, async t => {
  const f = await financialCorrectionDatabase({ additionalTables: ['Client', 'AccountsReceivable', 'ReceivablePayment', 'ReceivablePaymentDocument', 'ReceivableItem', 'PayrollAdjustment'] });
  const { db, actor } = f;
  try {
    const client = await db.client.create({ data: { name: 'Cliente de pruebas', slug: randomUUID() } });
    const party = await db.thirdParty.create({ data: { name: 'Homónimo', kind: 'SOCIO' } });
    const other = await db.thirdParty.create({ data: { name: 'Homónimo', kind: 'SOCIO' } });
    async function setup() {
      const ar = await db.accountsReceivable.create({ data: { clientId: client.id, amount: 1000.01, period: new Date('2026-11-01'), year: 2026, month: 11 } });
      const ctx = await barterContext(db, { receivableId: ar.id }, actor);
      return { ar, input: { amount: 500.01, settledAt: '2026-11-07', goods: 'Bienes ficticios', destinationMode: 'BENEFICIARIO', beneficiaryThirdPartyId: party.id, authorizedBy: 'Dirección', reason: 'Prueba autorizada', expectedRevision: ctx.revision, requestId: randomUUID() } };
    }
    await t.test('datos incompletos, exceso, moneda, tercero inactivo y revisión obsoleta no aplican', { skip: !briaTestDatabaseUrl(), timeout: 90000 }, async () => {
      const { ar, input } = await setup();
      for (const patch of [{ amount: 1.001 }, { amount: 1000.02 }, { amount: 0 }, { destinationMode: null }, { authorizedBy: '' }, { beneficiaryThirdPartyId: 'ausente' }, { expectedRevision: 'anterior' }, { reason: '' }]) await assert.rejects(createBarter(db, ar.id, { ...input, ...patch }, actor));
      await db.thirdParty.update({ where: { id: party.id }, data: { isActive: false } });
      await assert.rejects(createBarter(db, ar.id, input, actor));
      await db.thirdParty.update({ where: { id: party.id }, data: { isActive: true } });
      await db.accountsReceivable.update({ where: { id: ar.id }, data: { currency: 'USD' } });
      await assert.rejects(createBarter(db, ar.id, input, actor));
      assert.equal(await db.receivablePayment.count({ where: { receivableId: ar.id } }), 0);
    });
    await t.test('período cerrado bloquea creación sin efectos', { skip: !briaTestDatabaseUrl(), timeout: 90000 }, async () => {
      const { ar, input } = await setup();
      const period = await db.financialPeriod.create({ data: { year: 2026, month: 11, status: 'CLOSED' } });
      await assert.rejects(createBarter(db, ar.id, input, actor), /cerrado/i);
      await db.financialPeriod.delete({ where: { id: period.id } });
      assert.equal(await db.receivablePayment.count({ where: { receivableId: ar.id } }), 0);
    });
    await t.test('fallo al guardar auditoría revierte ambas obligaciones', { skip: !briaTestDatabaseUrl(), timeout: 90000 }, async () => {
      const { ar, input } = await setup();
      const broken = { $transaction: (work, options) => db.$transaction(tx => work(new Proxy(tx, { get: (target, key) => key === 'financialAuditEvent' ? { ...target.financialAuditEvent, create: async () => { throw new Error('fallo simulado'); } } : target[key] })), options) };
      const count = await db.accountsReceivable.count();
      await assert.rejects(createBarter(broken, ar.id, input, actor), /fallo simulado/);
      assert.equal(await db.accountsReceivable.count(), count);
      assert.equal(await db.receivablePayment.count({ where: { receivableId: ar.id } }), 0);
    });
    await t.test('dos solicitudes concurrentes solo aplican una vez y guardan centavos', { skip: !briaTestDatabaseUrl(), timeout: 90000 }, async () => {
      const { ar, input } = await setup();
      const results = await Promise.allSettled([createBarter(db, ar.id, input, actor), createBarter(db, ar.id, { ...input, requestId: randomUUID() }, actor)]);
      assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
      assert.equal(await db.receivablePayment.count({ where: { receivableId: ar.id } }), 1);
      const saved = results.find(r => r.status === 'fulfilled').value;
      assert.equal(saved.receivable.outstanding, 500);
      assert.equal(saved.beneficiary.outstanding, 500.01);
      await assert.rejects(deleteReceivable(db, saved.beneficiary.id, 'No borrar', actor));
      await assert.rejects(deleteReceivable(db, ar.id, 'No borrar', actor));
      await assert.rejects(updateReceivable(db, saved.beneficiary.id, { amount: 400 }, actor));
    });
    await t.test('reversión conserva abonos posteriores del cliente y soportes del canje', { skip: !briaTestDatabaseUrl(), timeout: 90000 }, async () => {
      const { ar, input } = await setup();
      const saved = await createBarter(db, ar.id, input, actor);
      await db.receivablePaymentDocument.create({ data: { paymentId: saved.payment.id, name: 'Acta ficticia.pdf', storageKey: 'local/acta.pdf', mimeType: 'application/pdf', size: 100, sha256: 'test' } });
      const paid = await createReceivablePayment(db, ar.id, { amount: 100, category: 'SERVICIO', paidAt: '2026-11-07', accountId: f.first.id }, actor);
      const ctx = await barterContext(db, { paymentId: saved.payment.id }, actor);
      const undone = await reverseBarter(db, saved.payment.id, { reason: 'Reversión de prueba', expectedRevision: ctx.revision, requestId: randomUUID() }, actor);
      assert.equal(undone.receivable.outstanding, 900.01);
      assert.equal(undone.payment.documents.length, 1);
      assert.equal((await db.receivablePayment.findUnique({ where: { id: paid.payment.id } })).reversedAt, null);
      await assert.rejects(reverseReceivablePayment(db, (await db.receivablePayment.findFirst({ where: { receivableId: saved.beneficiary.id, kind: 'REVERSO_CANJE' } })).id, { reason: 'No unilateral' }, actor));
      await assert.rejects(deleteReceivable(db, saved.beneficiary.id, 'No borrar histórico', actor));
    });
    await t.test('compensación por identidad nativa, sin confundir homónimos; reversión encadenada', { skip: !briaTestDatabaseUrl(), timeout: 90000 }, async () => {
      const { ar, input } = await setup();
      const saved = await createBarter(db, ar.id, input, actor);
      for (const thirdPartyId of [party.id, other.id]) await db.accountsPayable.create({ data: { thirdPartyId, concept: 'Obligación ficticia', category: 'OPERATIVO', amount: 2000, receivedAt: new Date('2026-11-01'), year: 2026, month: 11 } });
      const options = await offsetOptions(db, saved.beneficiary.id, actor);
      assert.equal(options.options.length, 1);
      const option = options.options[0];
      const offset = await createOffset(db, saved.beneficiary.id, { payableId: option.id, amount: 200, settledAt: '2026-11-07', reason: 'Cruce con la misma persona', authorizedBy: 'Dirección', requestId: randomUUID(), expectedRevision: option.revision }, actor);
      const blocked = await barterContext(db, { paymentId: saved.payment.id }, actor);
      assert.equal(blocked.canReverse, false);
      const offsetCtx = await readOffset(db, offset.payment.id, actor);
      await reverseOffset(db, offset.payment.id, { reason: 'Corregir primero el cruce', requestId: randomUUID(), expectedRevision: offsetCtx.revision }, actor);
      const ready = await barterContext(db, { paymentId: saved.payment.id }, actor);
      await reverseBarter(db, saved.payment.id, { reason: 'Revertir canje', requestId: randomUUID(), expectedRevision: ready.revision }, actor);
      assert.equal((await db.payablePayment.findUnique({ where: { id: offset.payablePayment.id } })).reversalReason, 'Corregir primero el cruce');
    });
    await t.test('los homónimos permanecen separados en Cartera', () => {
      assert.equal(groupFinancialReceivables([{ id: 'a', kind: 'BENEFICIARIO', beneficiaryThirdPartyId: party.id, clientName: 'Homónimo', outstanding: 100 }, { id: 'b', kind: 'BENEFICIARIO', beneficiaryThirdPartyId: other.id, clientName: 'Homónimo', outstanding: 200 }]).length, 2);
    });
    await t.test('reversión y reintentos releen permisos, período y solicitud; lectores no ven auditoría', { skip: !briaTestDatabaseUrl(), timeout: 90000 }, async () => {
      const { ar, input } = await setup();
      const saved = await createBarter(db, ar.id, { ...input, destinationMode: 'OTRO_AUTORIZADO', destination: 'Destino autorizado de muestra sin cobro' }, actor);
      assert.equal(saved.beneficiary, null);
      await assert.rejects(createBarter(db, ar.id, { ...input, reason: 'Otra intención con la misma solicitud' }, actor));
      const ctx = await barterContext(db, { paymentId: saved.payment.id }, actor);
      const reverse = { reason: 'Rectificar disposición', requestId: randomUUID(), expectedRevision: ctx.revision };
      const period = await db.financialPeriod.create({ data: { year: 2026, month: 11, status: 'CLOSED' } });
      await assert.rejects(reverseBarter(db, saved.payment.id, reverse, actor), /cerrado/i);
      await db.financialPeriod.delete({ where: { id: period.id } });
      await db.user.update({ where: { id: actor.id }, data: { role: 'VIEWER', financialRole: 'VIEWER', modulePermissions: { financiero: true } } });
      assert.equal((await barterContext(db, { paymentId: saved.payment.id }, actor)).history.length, 0);
      await assert.rejects(reverseBarter(db, saved.payment.id, reverse, actor), /acceso/i);
      await db.user.update({ where: { id: actor.id }, data: { role: 'ADMIN' } });
      await assert.rejects(reverseBarter(db, saved.payment.id, { ...reverse, expectedRevision: 'old' }, actor));
      await reverseBarter(db, saved.payment.id, reverse, actor);
      assert.equal(await db.accountsReceivable.count({ where: { barterPaymentId: saved.payment.id } }), 0);
    });
  } finally { await f.close(); }
});

test('canje anterior: completar destino no reaplica el saldo; revisión y permiso vigentes', { skip: !briaTestDatabaseUrl(), timeout: 90000 }, async () => {
  const f = await financialCorrectionDatabase({ additionalTables: ['Client', 'AccountsReceivable', 'ReceivablePayment', 'ReceivablePaymentDocument'] });
  const { db, actor } = f;
  try {
    const client = await db.client.create({ data: { name: 'Cliente anterior', slug: randomUUID() } });
    const ar = await db.accountsReceivable.create({ data: { clientId: client.id, amount: 500000, status: 'SALDADO', period: new Date('2026-11-01'), year: 2026, month: 11 } });
    const payment = await db.receivablePayment.create({ data: { receivableId: ar.id, kind: 'CANJE', amount: 500000, paidAt: new Date('2026-11-03'), detail: { goods: 'Muebles', destination: 'Texto anterior', authorizedBy: 'Persona anterior' } } });
    const before = await barterContext(db, { paymentId: payment.id }, actor);
    const input = { destinationMode: 'AGENCIA', destination: 'Uso en oficina', authorizedBy: 'Dirección ficticia', reason: 'Confirmación del destino anterior', requestId: randomUUID(), expectedRevision: before.revision };
    const saved = await assignBarterDestination(db, payment.id, input, actor);
    assert.equal(saved.receivable.outstanding, 0);
    assert.equal(await db.receivablePayment.count(), 1);
    assert.equal(saved.payment.detail.goods, 'Muebles');
    assert.equal(saved.payment.detail.legacyDestination, 'Texto anterior');
    await assert.rejects(assignBarterDestination(db, payment.id, { ...input, requestId: randomUUID() }, actor));
    await db.user.update({ where: { id: actor.id }, data: { isActive: false } });
    await assert.rejects(barterContext(db, { paymentId: payment.id }, actor), /acceso/i);
    assert.equal(await db.financialRecord.count(), 0);
  } finally { await f.close(); }
});
