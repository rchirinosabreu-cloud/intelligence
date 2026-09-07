import test from 'node:test';
import assert from 'node:assert/strict';
import { createReceivablePayment } from '../src/services/receivablePaymentService.js';

const actor = { id: 'user-1' };
const requestId = '6df9f11f-6584-44e0-81ba-921936072d65';
const input = (extra = {}) => ({ amount: 300, paidAt: '2026-09-07', accountId: 'account-1', category: 'SERVICIO', ...extra });
const existingIncome = (extra = {}) => ({
  id: 'record-existing', amount: 300, date: new Date('2026-09-07T00:00:00Z'), year: 2026, month: 9,
  clientId: 'client-1', accountId: 'account-1', type: 'INCOME', scenario: 'ACTUAL', status: 'POSTED',
  category: 'SERVICIO', origin: 'MANUAL', receivablePayment: null, payrollTransaction: null,
  bankMatches: [], ...extra
});

const fixture = ({ receivable = {}, account, client, record, closed = false } = {}) => {
  const state = {
    receivable: { id: 'debt-1', clientId: 'client-1', amount: 1000, status: 'DEBE', payments: [], ...receivable },
    records: new Map(record ? [[record.id, record]] : []), payments: new Map(), audits: new Map(),
    writes: [], isolationLevels: [], closed
  };
  const currentDebt = () => ({ ...state.receivable, payments: [...state.receivable.payments, ...state.payments.values()] });
  const tx = {
    financialAccount: { findUnique: async () => account === undefined ? { id: 'account-1', isActive: true, currency: 'COP' } : account },
    client: { findUnique: async () => client === undefined ? { id: 'client-1', isArchived: false } : client },
    financialPeriod: { findUnique: async () => ({ status: state.closed ? 'CLOSED' : 'OPEN' }) },
    accountsReceivable: {
      findUnique: async () => currentDebt(),
      update: async ({ data }) => { state.writes.push('receivable'); Object.assign(state.receivable, data); return currentDebt(); }
    },
    financialRecord: {
      findUnique: async ({ where }) => {
        const found = state.records.get(where.id);
        return found ? { ...found, receivablePayment: [...state.payments.values()].find((payment) => payment.financialRecordId === where.id) || found.receivablePayment } : null;
      },
      create: async ({ data }) => {
        state.writes.push('income');
        const created = { id: `record-${state.records.size + 1}`, ...data };
        state.records.set(created.id, created); return created;
      }
    },
    receivablePayment: {
      findUnique: async ({ where }) => {
        const found = where.id ? state.payments.get(where.id) : [...state.payments.values()].find((payment) => payment.financialRecordId === where.financialRecordId);
        return found ? { ...found, financialRecord: state.records.get(found.financialRecordId), receivable: currentDebt() } : null;
      },
      create: async ({ data }) => {
        state.writes.push('payment');
        const created = { id: `payment-${state.payments.size + 1}`, ...data };
        state.payments.set(created.id, created); return created;
      }
    },
    financialAuditEvent: {
      findUnique: async ({ where }) => state.audits.get(where.id) || null,
      create: async ({ data }) => {
        state.writes.push('audit');
        const created = { id: `audit-${state.audits.size + 1}`, ...data };
        state.audits.set(created.id, created); return created;
      }
    }
  };
  return {
    state,
    client: { $transaction: async (callback, options) => { state.isolationLevels.push(options?.isolationLevel); return callback(tx); } }
  };
};

test('a new payment requires an explicit economic category, not an inferred membership', async () => {
  for (const category of [undefined, '', 'NOMINA', 'FINANCIAL']) {
    const db = fixture();
    await assert.rejects(createReceivablePayment(db.client, 'debt-1', input({ category }), actor),
      (error) => error.code === 'RECEIVABLE_PAYMENT_CATEGORY_INVALID');
    assert.equal(db.state.writes.length, 0);
  }
});

test('new payments persist the selected fee, service or advertising category', async () => {
  for (const category of ['MEMBRESIA', 'SERVICIO', 'PAUTA']) {
    const db = fixture();
    const result = await createReceivablePayment(db.client, 'debt-1', input({ category }), actor);
    assert.equal(result.financialRecord.category, category);
    assert.equal(db.state.records.size, 1);
    assert.equal(db.state.isolationLevels[0], 'Serializable');
  }
});

test('a partial payment preserves a collection promise until the full debt is paid', async () => {
  const db = fixture({ receivable: { status: 'PROMESADO' } });
  const result = await createReceivablePayment(db.client, 'debt-1', input(), actor);
  assert.equal(result.receivable.status, 'PROMESADO');
  assert.equal(result.outstanding, 700);
  const paid = await createReceivablePayment(db.client, 'debt-1', input({ amount: 700 }), actor);
  assert.equal(paid.receivable.status, 'PAGADO');
});

for (const [label, options, code] of [
  ['missing account', { account: null }, 'RECEIVABLE_PAYMENT_ACCOUNT_UNAVAILABLE'],
  ['inactive account', { account: { id: 'account-1', isActive: false, currency: 'COP' } }, 'RECEIVABLE_PAYMENT_ACCOUNT_UNAVAILABLE'],
  ['non-COP account', { account: { id: 'account-1', isActive: true, currency: 'USD' } }, 'RECEIVABLE_PAYMENT_CURRENCY_UNSUPPORTED'],
  ['unknown client', { client: null }, 'RECEIVABLE_CLIENT_NOT_FOUND'],
  ['non-COP debt', { receivable: { metadata: { currency: 'USD' } } }, 'RECEIVABLE_PAYMENT_CURRENCY_UNSUPPORTED'],
  ['closed month', { closed: true }, 'FINANCIAL_PERIOD_CLOSED']
]) {
  test(`payment rejects ${label} without changing debt or ledger`, async () => {
    const db = fixture(options);
    await assert.rejects(createReceivablePayment(db.client, 'debt-1', input(), actor), (error) => error.code === code);
    assert.equal(db.state.writes.length, 0);
  });
}

test('a known archived client can still pay historical debt', async () => {
  const db = fixture({ client: { id: 'client-1', isArchived: true } });
  const result = await createReceivablePayment(db.client, 'debt-1', input(), actor);
  assert.equal(result.outstanding, 700);
});

test('an existing bank-matched income is applied once without creating or changing the income', async () => {
  const record = existingIncome({ bankMatches: [{ id: 'match-1', status: 'APPROVED' }] });
  const db = fixture({ record });
  const result = await createReceivablePayment(db.client, 'debt-1', input({ financialRecordId: record.id }), actor);
  assert.equal(result.financialRecord.id, record.id);
  assert.equal(result.payment.financialRecordId, record.id);
  assert.equal(result.outstanding, 700);
  assert.equal(db.state.records.size, 1);
  assert.equal(db.state.writes.includes('income'), false);
  assert.deepEqual(db.state.records.get(record.id), record);
  assert.equal([...db.state.audits.values()].some((event) => event.entityType === 'FinancialRecord' && event.action === 'CREATE'), false);
});

for (const [label, overrides] of [
  ['voided', { status: 'VOIDED' }], ['draft', { status: 'DRAFT' }], ['forecast', { scenario: 'FORECAST' }], ['legacy projection', { isProjection: true }],
  ['expense', { type: 'EXPENSE' }], ['system-generated', { origin: 'SYSTEM' }],
  ['another client', { clientId: 'client-2' }], ['no client', { clientId: null }],
  ['another account', { accountId: 'account-2' }], ['different accounting day', { date: new Date('2026-09-06T12:00:00Z') }],
  ['inconsistent accounting year', { year: 2025 }], ['inconsistent accounting month', { month: 8 }],
  ['missing accounting period', { year: null, month: null }],
  ['different amount', { amount: 500 }], ['linked payroll', { payrollTransaction: { id: 'payroll-1' } }],
  ['linked receivable', { receivablePayment: { id: 'payment-1' } }], ['noncollection category', { category: 'FINANCIAL' }]
]) {
  test(`an existing ${label} movement cannot be applied as the selected receivable payment`, async () => {
    const db = fixture({ record: existingIncome(overrides) });
    await assert.rejects(createReceivablePayment(db.client, 'debt-1', input({ financialRecordId: 'record-existing' }), actor),
      (error) => error.code === 'RECEIVABLE_PAYMENT_RECORD_INCOMPATIBLE' && error.statusCode === 409);
    assert.equal(db.state.writes.length, 0);
  });
}

test('applying an existing income cannot silently reclassify its category', async () => {
  const db = fixture({ record: existingIncome() });
  await assert.rejects(createReceivablePayment(db.client, 'debt-1', input({ financialRecordId: 'record-existing', category: 'MEMBRESIA' }), actor),
    (error) => error.code === 'RECEIVABLE_PAYMENT_RECORD_INCOMPATIBLE');
  assert.equal(db.state.writes.length, 0);
});

test('an already applied income cannot be applied again without an idempotency replay', async () => {
  const db = fixture({ record: existingIncome() });
  await createReceivablePayment(db.client, 'debt-1', input({ financialRecordId: 'record-existing' }), actor);
  const before = db.state.writes.length;
  await assert.rejects(createReceivablePayment(db.client, 'debt-1', input({ financialRecordId: 'record-existing' }), actor),
    (error) => error.code === 'RECEIVABLE_PAYMENT_RECORD_INCOMPATIBLE');
  assert.equal(db.state.writes.length, before);
});

for (const mode of ['new', 'existing']) {
  test(`${mode} payment replay returns the original payment and current debt without another income or audit`, async () => {
    const db = fixture({ record: mode === 'existing' ? existingIncome() : undefined });
    const payload = input({ requestId, ...(mode === 'existing' ? { financialRecordId: 'record-existing' } : {}) });
    const first = await createReceivablePayment(db.client, 'debt-1', payload, actor);
    const writes = db.state.writes.length;
    db.state.closed = true;
    const replay = await createReceivablePayment(db.client, 'debt-1', payload, actor);
    assert.equal(replay.payment.id, first.payment.id);
    assert.equal(replay.financialRecord.id, first.financialRecord.id);
    assert.equal(replay.outstanding, 700);
    assert.equal(replay.replayed, true);
    assert.equal(db.state.writes.length, writes);
    assert.equal(db.state.records.size, 1);
  });
}

test('idempotency replay reflects another completed collection, not a stale outstanding amount', async () => {
  const db = fixture();
  await createReceivablePayment(db.client, 'debt-1', input({ requestId }), actor);
  await createReceivablePayment(db.client, 'debt-1', input({ amount: 200 }), actor);
  const replay = await createReceivablePayment(db.client, 'debt-1', input({ requestId }), actor);
  assert.equal(replay.outstanding, 500);
  assert.equal(db.state.records.size, 2);
});

for (const change of [{ amount: 200 }, { category: 'MEMBRESIA' }, { reference: 'Changed' }, { notes: 'Changed' }, { paidAt: '2026-09-08' }]) {
  test(`reusing requestId with changed ${Object.keys(change)[0]} fails without another write`, async () => {
    const db = fixture();
    await createReceivablePayment(db.client, 'debt-1', input({ requestId }), actor);
    const before = db.state.writes.length;
    await assert.rejects(createReceivablePayment(db.client, 'debt-1', input({ requestId, ...change }), actor),
      (error) => error.code === 'RECEIVABLE_PAYMENT_IDEMPOTENCY_CONFLICT' && error.statusCode === 409);
    assert.equal(db.state.writes.length, before);
  });
}

test('requestId cannot be reused by another actor', async () => {
  const db = fixture();
  await createReceivablePayment(db.client, 'debt-1', input({ requestId }), actor);
  await assert.rejects(createReceivablePayment(db.client, 'debt-1', input({ requestId }), { id: 'other-user' }),
    (error) => error.code === 'RECEIVABLE_PAYMENT_IDEMPOTENCY_CONFLICT');
  assert.equal(db.state.records.size, 1);
});

test('invalid requestId is rejected before any write', async () => {
  const db = fixture();
  await assert.rejects(createReceivablePayment(db.client, 'debt-1', input({ requestId: 'invalid' }), actor),
    (error) => error.code === 'RECEIVABLE_PAYMENT_REQUEST_ID_INVALID');
  assert.equal(db.state.writes.length, 0);
});

test('idempotency compares normalized accounting dates, not surrounding whitespace', async () => {
  const db = fixture();
  const first = await createReceivablePayment(db.client, 'debt-1', input({ requestId }), actor);
  const replay = await createReceivablePayment(db.client, 'debt-1', input({ requestId, paidAt: ' 2026-09-07 ' }), actor);
  assert.equal(replay.payment.id, first.payment.id);
  assert.equal(replay.replayed, true);
});

test('a missing source in an old idempotent payment blocks replay without replacing its income', async () => {
  const db = fixture();
  const first = await createReceivablePayment(db.client, 'debt-1', input({ requestId }), actor);
  db.state.records.delete(first.financialRecord.id);
  const before = db.state.writes.length;
  await assert.rejects(createReceivablePayment(db.client, 'debt-1', input({ requestId }), actor),
    (error) => error.code === 'RECEIVABLE_PAYMENT_REPLAY_UNAVAILABLE');
  assert.equal(db.state.writes.length, before);
});

test('a debt already marked paid without traceable applications requires review, not another collection', async () => {
  const db = fixture({ receivable: { status: 'PAGADO', payments: [] } });
  await assert.rejects(createReceivablePayment(db.client, 'debt-1', input(), actor),
    (error) => error.code === 'RECEIVABLE_ALREADY_PAID' && error.statusCode === 409);
  assert.equal(db.state.writes.length, 0);
});

test('a new collection rejects fractional cents and unsafe financial amounts without writes', async () => {
  for (const amount of [1.001, 1.005, 0.009, Number.MAX_SAFE_INTEGER]) {
    const db = fixture({ receivable: { amount: Number.MAX_SAFE_INTEGER } });
    await assert.rejects(createReceivablePayment(db.client, 'debt-1', input({ amount }), actor),
      (error) => error.code === 'RECEIVABLE_PAYMENT_AMOUNT_INVALID');
    assert.equal(db.state.writes.length, 0);
  }
});

test('fractional collections compute remaining balances in exact cents', async () => {
  const db = fixture({ receivable: { amount: 0.3 } });
  const result = await createReceivablePayment(db.client, 'debt-1', input({ amount: 0.1 }), actor);
  assert.equal(result.outstanding, 0.2);
  assert.equal(result.payment.amount, 0.1);
  const final = await createReceivablePayment(db.client, 'debt-1', input({ amount: 0.2 }), actor);
  assert.equal(final.outstanding, 0);
  assert.equal(final.receivable.status, 'PAGADO');
});

for (const code of ['P2034', 'P2002']) {
  test(`${code} reports a payment conflict, allowing retry with the same requestId`, async () => {
    const db = { $transaction: async () => { throw Object.assign(new Error('Conflict'), { code }); } };
    await assert.rejects(createReceivablePayment(db, 'debt-1', input({ requestId }), actor),
      (error) => error.code === 'RECEIVABLE_PAYMENT_CONFLICT' && error.statusCode === 409);
  });
}
