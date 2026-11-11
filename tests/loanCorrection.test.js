import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { correctLoan } from '../src/services/receivableLoanService.js';
import { updateReceivable } from '../src/services/financialReceivableService.js';
import { financialRecordLockReason } from '../src/services/financialRecordService.js';

// Elisa, reunión de noviembre de 2026: «en todo lo que haga un movimiento, los valores se tienen
// que poder modificar; siempre me puedo equivocar». Un préstamo con reintegros solo se podía
// eliminar después de revertirlos todos. Ahora se corrige: valor, fecha y cuenta cambian en el
// préstamo y en su egreso a la vez, con motivo, y los reintegros se conservan.

const read = (relative) => fs.readFileSync(new URL(relative, import.meta.url), 'utf8');

const buildDb = ({ loan, closed = [], account = { id: 'acc-2', isActive: true, currency: 'COP' } } = {}) => {
    const calls = [];
    const tx = {
        financialPeriod: { findUnique: async ({ where }) => (closed.includes(`${where.year_month.year}-${where.year_month.month}`) ? { status: 'CLOSED' } : { status: 'OPEN' }) },
        financialAccount: { findUnique: async ({ where }) => (where.id === account?.id ? account : null) },
        accountsReceivable: {
            findUnique: async () => loan,
            update: async (args) => { calls.push(['receivable.update', args.data]); return { ...loan, ...args.data }; }
        },
        financialRecord: { update: async (args) => { calls.push(['record.update', args.data]); return { ...loan.loanRecord, ...args.data }; } },
        financialAuditEvent: { create: async (args) => { calls.push(['audit', args.data]); return { id: 'event' }; } }
    };
    return { calls, db: { $transaction: async (work) => work(tx) } };
};

const loanWith = (overrides = {}) => ({
    id: 'loan-1', kind: 'PRESTAMO', amount: 18008150, period: new Date('2026-03-10T12:00:00Z'), year: 2026, month: 3, status: 'DEBE',
    updatedAt: new Date('2026-11-10T20:00:00Z'),
    payments: [{ id: 'p1', amount: 1150000, kind: 'PAGO', reversedAt: null }, { id: 'p2', amount: 50000, kind: 'PAGO', reversedAt: new Date() }],
    loanRecord: { id: 'rec-1', status: 'POSTED', origin: 'SYSTEM', amount: 18008150, date: new Date('2026-03-10T12:00:00Z'), year: 2026, month: 3, accountId: 'acc-1', allocations: [] },
    ...overrides
});

const input = { amount: 18800150, lentAt: '2026-03-12', accountId: 'acc-2', reason: 'El valor se digitó mal.', expectedUpdatedAt: '2026-11-10T20:00:00.000Z' };

test('corrige valor, fecha y cuenta en el préstamo y en su egreso, con motivo en los dos registros', async () => {
    const { calls, db } = buildDb({ loan: loanWith() });
    const result = await correctLoan(db, 'loan-1', input, { id: 'elisa' });

    const record = calls.find(([name]) => name === 'record.update')[1];
    assert.equal(record.amount, 18800150);
    assert.equal(record.accountId, 'acc-2');
    assert.equal(record.month, 3);
    assert.equal(record.date.toISOString().slice(0, 10), '2026-03-12');

    const receivable = calls.find(([name]) => name === 'receivable.update')[1];
    assert.equal(receivable.amount, 18800150);
    assert.equal(receivable.period.toISOString().slice(0, 10), '2026-03-12');
    assert.equal(receivable.status, 'DEBE', 'sigue debiendo: los reintegros vigentes se conservan');

    const audits = calls.filter(([name]) => name === 'audit').map(([, data]) => data);
    assert.deepEqual(audits.map((audit) => audit.entityType).sort(), ['AccountsReceivable', 'FinancialRecord']);
    for (const audit of audits) {
        assert.equal(audit.after.operation, 'LOAN_CORRECTED');
        assert.equal(audit.after.reason, 'El valor se digitó mal.');
        assert.equal(audit.actorId, 'elisa');
        assert.ok(audit.before, 'guarda cómo estaba');
    }
    assert.ok(result.financialRecord);
});

test('el valor no puede quedar por debajo de lo ya reintegrado; lo revertido no cuenta', async () => {
    const { db } = buildDb({ loan: loanWith() });
    await assert.rejects(correctLoan(db, 'loan-1', { ...input, amount: 1000000 }), { code: 'LOAN_AMOUNT_BELOW_REPAYMENTS' });
    const ok = buildDb({ loan: loanWith() });
    await correctLoan(ok.db, 'loan-1', { ...input, amount: 1150000 }, { id: 'u' });
    assert.equal(ok.calls.find(([name]) => name === 'receivable.update')[1].status, 'PAGADO', 'con el valor igual a lo reintegrado queda pagado');
});

test('pide motivo, rechaza una pantalla desactualizada y no corrige lo que no cambió', async () => {
    const { db } = buildDb({ loan: loanWith() });
    await assert.rejects(correctLoan(db, 'loan-1', { ...input, reason: ' ' }), { code: 'LOAN_CORRECTION_REASON_REQUIRED' });
    await assert.rejects(correctLoan(db, 'loan-1', { ...input, expectedUpdatedAt: '2026-11-01T00:00:00.000Z' }), { code: 'LOAN_CHANGED' });
    await assert.rejects(correctLoan(db, 'loan-1', { amount: 18008150, lentAt: '2026-03-10', accountId: 'acc-1', reason: 'nada' }), { code: 'LOAN_CORRECTION_EMPTY' });
});

test('respeta los períodos cerrados, la cuenta activa y el desglose del egreso', async () => {
    await assert.rejects(correctLoan(buildDb({ loan: loanWith(), closed: ['2026-3'] }).db, 'loan-1', input), { code: 'FINANCIAL_PERIOD_CLOSED' });
    await assert.rejects(correctLoan(buildDb({ loan: loanWith(), account: null }).db, 'loan-1', input), { code: 'LOAN_ACCOUNT_UNAVAILABLE' });
    const split = loanWith({ loanRecord: { ...loanWith().loanRecord, allocations: [{ id: 'a1' }] } });
    await assert.rejects(correctLoan(buildDb({ loan: split }).db, 'loan-1', input), { code: 'LOAN_RECORD_SPLIT' });
    await assert.rejects(correctLoan(buildDb({ loan: { ...loanWith(), kind: 'CLIENTE' } }).db, 'loan-1', input), { code: 'LOAN_NOT_FOUND' });
});

test('un préstamo sin egreso ligado (los del Excel) se corrige solo en la cartera', async () => {
    const { calls, db } = buildDb({ loan: loanWith({ loanRecord: null, payments: [] }) });
    const result = await correctLoan(db, 'loan-1', { amount: 5525000, lentAt: '2026-04-01', reason: 'Valor acordado con Melissa.' }, { id: 'u' });
    assert.equal(calls.some(([name]) => name === 'record.update'), false);
    assert.equal(calls.find(([name]) => name === 'receivable.update')[1].amount, 5525000);
    assert.equal(result.financialRecord, null);
});

test('el lápiz suelto de cartera ya no cambia el valor de un préstamo con egreso: lo descuadraría', async () => {
    const loan = { ...loanWith(), loanRecordId: 'rec-1' };
    const db = { $transaction: async (work) => work({ accountsReceivable: { findUnique: async () => loan }, financialPeriod: { findUnique: async () => null } }) };
    await assert.rejects(updateReceivable(db, 'loan-1', { amount: 20000000 }, { id: 'u' }), { code: 'LOAN_CORRECTION_REQUIRED' });
});

test('Movimientos dice dónde se corrige, en vez de «elimina y registra de nuevo» o «no se edita»', () => {
    const loan = financialRecordLockReason({ origin: 'SYSTEM', loanReceivable: { status: 'DEBE', payments: [{ amount: 1, reversedAt: null }] } });
    assert.match(loan, /Corregir préstamo/);
    assert.doesNotMatch(loan, /regístralo de nuevo/);
    assert.match(financialRecordLockReason({ payrollPayment: { id: 'x' } }), /Corregir pago/);
    assert.doesNotMatch(financialRecordLockReason({ payrollPayment: { id: 'x' } }), /no se edita/);
    assert.match(financialRecordLockReason({ payablePayment: { id: 'x' } }), /Corregir pago/);
});

test('la pantalla abre «Corregir préstamo» desde el lápiz del valor y la ruta está descrita para Bria', () => {
    const dashboard = read('../src/components/modules/FinancialDashboard.jsx');
    assert.match(dashboard, /if \(isLoanReceivable\(debt\)\) \{ setNoticeError\(''\); setLoanToCorrect\(debt\); return; \}/);
    assert.match(dashboard, /<LoanCorrectionDialog/);
    const dialog = read('../src/components/modules/financial/LoanCorrectionDialog.jsx');
    assert.match(dialog, /\/api\/financials\/loans\/\$\{debt\.id\}\/correction/);
    assert.match(dialog, /BrainDatePicker/);
    assert.match(dialog, /MoneyInput/);
    assert.match(read('../src/routes/api/financials.js'), /router\.post\('\/loans\/:receivableId\/correction', requireFinancialWrite, correctLoanHandler\)/);
    assert.match(read('../src/lib/platformCatalog.js'), /'POST \/financials\/loans\/:receivableId\/correction'/);
});
