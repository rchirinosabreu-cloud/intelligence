import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    LOAN_COUNTERPARTY_TYPES,
    LOAN_KIND,
    isLoanReceivable,
    loanCounterpartyLabel,
    loanProblem
} from '../src/lib/receivableLoans.js';
import { createLoan } from '../src/services/receivableLoanService.js';
import { createReceivablePayment } from '../src/services/receivablePaymentService.js';
import { financialRecordLockReason } from '../src/services/financialRecordService.js';

// Rodny, 20 de octubre de 2026: «Cuando registro un préstamo no se me va a cuentas por cobrar.
// No necesariamente que haga un documento de cobro sino que me aparezca en cartera. Y que cuando
// lo paguen, se reintegre, es decir, no es un ingreso como tal, es un reintegro». Un préstamo a
// un tercero —colaborador, socio, cliente, proveedor— es una cuenta por cobrar de otra clase:
// nace con el egreso que sacó el dinero, vive en Cartera junto a lo de los clientes y su
// devolución entra como reintegro (categoría PRESTAMO, sección FINANCING), nunca como venta.

const read = (relative) => fs.readFileSync(new URL(relative, import.meta.url), 'utf8');

test('a quién se le presta: colaborador, socio, cliente, proveedor u otro, cada uno con su nombre', () => {
    assert.deepEqual(LOAN_COUNTERPARTY_TYPES.map((item) => item.value), ['COLABORADOR', 'SOCIO', 'CLIENTE', 'PROVEEDOR', 'OTRO']);
    assert.equal(loanCounterpartyLabel('SOCIO'), 'Socio');
    assert.equal(loanCounterpartyLabel('NADA'), 'Tercero');
    assert.equal(LOAN_KIND, 'PRESTAMO');
    assert.equal(isLoanReceivable({ kind: 'PRESTAMO' }), true);
    assert.equal(isLoanReceivable({ kind: 'CLIENTE' }), false);
    assert.equal(isLoanReceivable({}), false, 'las cuentas anteriores no tienen kind y son de clientes');
});

test('loanProblem dice qué falta en palabras', () => {
    const base = { counterpartyType: 'COLABORADOR', counterpartyName: 'Melissa Ruiz', amount: 500000, lentAt: '2026-10-20', accountId: 'acc-1' };
    assert.equal(loanProblem(base), null);
    assert.match(loanProblem({ ...base, counterpartyType: 'X' }), /a quién/i);
    assert.match(loanProblem({ ...base, counterpartyName: ' ' }), /nombre/i);
    assert.match(loanProblem({ ...base, counterpartyType: 'CLIENTE', counterpartyName: '', clientId: '' }), /cliente/i, 'un préstamo a cliente elige la ficha');
    assert.equal(loanProblem({ ...base, counterpartyType: 'CLIENTE', counterpartyName: '', clientId: 'client-1' }), null);
    assert.match(loanProblem({ ...base, amount: 0 }), /valor/i);
    assert.match(loanProblem({ ...base, accountId: '', financialRecordId: '' }), /cuenta/i, 'de qué cuenta salió el dinero, salvo que el egreso ya exista');
    assert.equal(loanProblem({ ...base, accountId: '', financialRecordId: 'rec-1' }), null);
    assert.match(loanProblem({ ...base, counterpartyName: 'x'.repeat(121) }), /120/);
});

const buildTx = ({ record = null, period = { status: 'OPEN' }, client = { id: 'client-1', name: 'Pablo Hoff' } } = {}) => {
    const calls = [];
    return {
        calls,
        tx: {
            financialPeriod: { findUnique: async () => period },
            financialAccount: { findUnique: async () => ({ id: 'acc-1', isActive: true, currency: 'COP' }) },
            client: { findUnique: async () => client },
            financialRecord: {
                findUnique: async () => record,
                create: async (args) => { calls.push(['record.create', args]); return { id: 'record-loan', ...args.data }; }
            },
            accountsReceivable: {
                create: async (args) => { calls.push(['receivable.create', args]); return { id: 'loan-1', ...args.data }; }
            },
            financialAuditEvent: { create: async (args) => { calls.push(['audit.create', args]); return { id: 'a' }; } }
        }
    };
};

test('registrar un préstamo crea el egreso y la cuenta por cobrar en una sola transacción', async () => {
    const { calls, tx } = buildTx();
    const result = await createLoan({ $transaction: async (cb) => cb(tx) }, {
        counterpartyType: 'COLABORADOR', counterpartyName: 'Melissa Ruiz', amount: 500000, lentAt: '2026-10-20', accountId: 'acc-1', dueDate: '2026-12-15', notes: 'Adelanto para el viaje; se descuenta en dos quincenas.'
    }, { id: 'user-elisa' });

    const record = calls.find(([name]) => name === 'record.create')[1].data;
    assert.equal(record.type, 'EXPENSE');
    assert.equal(record.category, 'PRESTAMO');
    assert.equal(record.section, 'FINANCING', 'un préstamo no es un gasto operativo');
    assert.equal(record.origin, 'SYSTEM');
    assert.equal(record.accountId, 'acc-1');
    assert.equal(record.amount, 500000);
    assert.match(record.description, /Préstamo a Melissa Ruiz/);
    assert.equal(record.clientId, null);

    const receivable = calls.find(([name]) => name === 'receivable.create')[1].data;
    assert.equal(receivable.kind, 'PRESTAMO');
    assert.equal(receivable.counterpartyType, 'COLABORADOR');
    assert.equal(receivable.counterpartyName, 'Melissa Ruiz');
    assert.equal(receivable.clientId, null);
    assert.equal(receivable.loanRecordId, 'record-loan');
    assert.equal(receivable.sourceLabel, 'Melissa Ruiz');
    assert.equal(receivable.amount, 500000);
    assert.equal(receivable.status, 'DEBE');
    assert.equal(receivable.year, 2026);
    assert.equal(receivable.month, 10);
    assert.ok(receivable.dueDate instanceof Date);
    assert.equal(result.receivable.id, 'loan-1');
    assert.equal(result.financialRecord.id, 'record-loan');
    const audits = calls.filter(([name]) => name === 'audit.create').map(([, args]) => args.data);
    assert.deepEqual(audits.map((audit) => `${audit.entityType}:${audit.action}`).sort(), ['AccountsReceivable:CREATE', 'FinancialRecord:CREATE']);
});

test('un préstamo a un cliente queda ligado a su ficha y lleva su nombre', async () => {
    const { calls, tx } = buildTx();
    await createLoan({ $transaction: async (cb) => cb(tx) }, {
        counterpartyType: 'CLIENTE', clientId: 'client-1', amount: 1000000, lentAt: '2026-10-20', accountId: 'acc-1'
    }, { id: 'u' });
    const receivable = calls.find(([name]) => name === 'receivable.create')[1].data;
    assert.equal(receivable.clientId, 'client-1');
    assert.equal(receivable.counterpartyName, 'Pablo Hoff');
    const record = calls.find(([name]) => name === 'record.create')[1].data;
    assert.equal(record.clientId, 'client-1');
});

test('«el egreso ya está en Movimientos»: se liga sin crear otro, y solo si es un egreso de préstamo libre', async () => {
    const existing = { id: 'rec-7', type: 'EXPENSE', category: 'PRESTAMO', status: 'POSTED', scenario: 'ACTUAL', isProjection: false, origin: 'MANUAL', amount: 500000, date: new Date('2026-10-18T12:00:00Z'), year: 2026, month: 10, accountId: 'acc-1', clientId: null, loanReceivable: null, receivablePayment: null, payrollPayment: null, payrollTransaction: null };
    const { calls, tx } = buildTx({ record: existing });
    const result = await createLoan({ $transaction: async (cb) => cb(tx) }, {
        counterpartyType: 'SOCIO', counterpartyName: 'Francisco Villa', amount: 500000, lentAt: '2026-10-18', financialRecordId: 'rec-7'
    }, { id: 'u' });
    assert.equal(calls.some(([name]) => name === 'record.create'), false, 'no se crea un segundo egreso');
    assert.equal(calls.find(([name]) => name === 'receivable.create')[1].data.loanRecordId, 'rec-7');
    assert.equal(result.financialRecord.id, 'rec-7');

    const taken = buildTx({ record: { ...existing, loanReceivable: { id: 'other-loan' } } });
    await assert.rejects(createLoan({ $transaction: async (cb) => cb(taken.tx) }, { counterpartyType: 'SOCIO', counterpartyName: 'F', amount: 500000, lentAt: '2026-10-18', financialRecordId: 'rec-7' }, { id: 'u' }),
        (error) => error.code === 'LOAN_RECORD_INCOMPATIBLE');
    const wrongCategory = buildTx({ record: { ...existing, category: 'OPERATIVO' } });
    await assert.rejects(createLoan({ $transaction: async (cb) => cb(wrongCategory.tx) }, { counterpartyType: 'SOCIO', counterpartyName: 'F', amount: 500000, lentAt: '2026-10-18', financialRecordId: 'rec-7' }, { id: 'u' }),
        (error) => error.code === 'LOAN_RECORD_INCOMPATIBLE');
    const wrongAmount = buildTx({ record: existing });
    await assert.rejects(createLoan({ $transaction: async (cb) => cb(wrongAmount.tx) }, { counterpartyType: 'SOCIO', counterpartyName: 'F', amount: 400000, lentAt: '2026-10-18', financialRecordId: 'rec-7' }, { id: 'u' }),
        (error) => error.code === 'LOAN_RECORD_INCOMPATIBLE');
});

test('lo que falta se dice antes de tocar la base y un periodo cerrado frena', async () => {
    await assert.rejects(createLoan({}, { counterpartyType: 'SOCIO', amount: 1, lentAt: '2026-10-20', accountId: 'a' }, { id: 'u' }),
        (error) => error.code === 'LOAN_INVALID' && /nombre/i.test(error.message));
    const closed = buildTx({ period: { status: 'CLOSED' } });
    await assert.rejects(createLoan({ $transaction: async (cb) => cb(closed.tx) }, { counterpartyType: 'SOCIO', counterpartyName: 'F', amount: 1, lentAt: '2026-10-20', accountId: 'acc-1' }, { id: 'u' }),
        (error) => /PERIOD/.test(error.code));
});

test('la devolución de un préstamo entra como reintegro, no como venta', async () => {
    const calls = [];
    const loan = { id: 'loan-1', kind: 'PRESTAMO', clientId: null, counterpartyName: 'Melissa Ruiz', amount: 500000, status: 'DEBE', payments: [] };
    const tx = {
        financialAccount: { findUnique: async () => ({ id: 'acc-1', isActive: true, currency: 'COP' }) },
        accountsReceivable: {
            findUnique: async () => loan,
            update: async (args) => { calls.push(['receivable.update', args]); return { ...loan, status: args.data.status }; }
        },
        financialPeriod: { findUnique: async () => ({ status: 'OPEN' }) },
        financialRecord: { create: async (args) => { calls.push(['record.create', args]); return { id: 'record-1', ...args.data }; } },
        receivablePayment: { create: async (args) => { calls.push(['payment.create', args]); return { id: 'payment-1', ...args.data }; } },
        financialAuditEvent: { create: async () => ({ id: 'a' }) }
    };
    const result = await createReceivablePayment({ $transaction: async (cb) => cb(tx) }, 'loan-1', { amount: 250000, paidAt: '2026-11-15', accountId: 'acc-1' }, { id: 'u' });
    const record = calls.find(([name]) => name === 'record.create')[1].data;
    assert.equal(record.type, 'INCOME');
    assert.equal(record.category, 'PRESTAMO', 'sin pedir concepto: un reintegro siempre es PRESTAMO');
    assert.equal(record.section, 'FINANCING', 'no es ingreso por ventas');
    assert.match(record.description, /Reintegro de préstamo: Melissa Ruiz/);
    assert.equal(record.clientId, null, 'un préstamo a un colaborador no exige cliente');
    assert.equal(result.outstanding, 250000);
    assert.equal(result.receivable.status, 'DEBE');
});

test('el egreso del préstamo no se edita ni se anula desde Movimientos: se dice a dónde ir', () => {
    const reason = financialRecordLockReason({ origin: 'SYSTEM', loanReceivable: { id: 'loan-1' } });
    assert.match(reason, /préstamo/i);
    assert.match(reason, /Cartera/);
    assert.match(reason, /Eliminar/);
});

test('el esquema, el arranque, el catálogo de Bria y la ruta conocen los préstamos', () => {
    const schema = read('../prisma/schema.prisma');
    assert.match(schema, /model AccountsReceivable \{[\s\S]*clientId\s+String\?/, 'un préstamo a un colaborador no tiene cliente');
    assert.match(schema, /model AccountsReceivable \{[\s\S]*kind\s+String\s+@default\("CLIENTE"\)/);
    assert.match(schema, /model AccountsReceivable \{[\s\S]*counterpartyType\s+String\?/);
    assert.match(schema, /model AccountsReceivable \{[\s\S]*counterpartyName\s+String\?/);
    assert.match(schema, /model AccountsReceivable \{[\s\S]*loanRecordId\s+String\?\s+@unique/);
    assert.match(schema, /model FinancialRecord \{[\s\S]*loanReceivable\s+AccountsReceivable\?/);
    const ensure = read('../scripts/ensure-receivable-loans-schema.js');
    assert.match(ensure, /ALTER COLUMN "clientId" DROP NOT NULL/);
    assert.match(ensure, /ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'CLIENTE'/);
    assert.match(ensure, /ADD COLUMN IF NOT EXISTS "loanRecordId" TEXT/);
    assert.match(ensure, /CREATE UNIQUE INDEX IF NOT EXISTS "AccountsReceivable_loanRecordId_key"/);
    assert.match(JSON.parse(read('../package.json')).scripts.start, /ensure-receivable-loans-schema\.js/);
    assert.match(read('../src/lib/platformCatalog.js'), /'POST \/financials\/loans'/);
    assert.match(read('../src/routes/api/financials.js'), /'\/loans', requireFinancialWrite/);
});

test('la pantalla registra préstamos y rotula los reintegros', () => {
    const dashboard = read('../src/components/modules/FinancialDashboard.jsx');
    const dialog = read('../src/components/modules/financial/ReceivableLoanDialog.jsx');
    const payment = read('../src/components/modules/financial/ReceivablePaymentDialog.jsx');
    assert.match(dashboard, /ReceivableLoanDialog/);
    assert.match(dashboard, /Registrar préstamo/);
    assert.match(dashboard, /isLoanReceivable\(debt\)/, 'un préstamo no emite cuenta de cobro');
    assert.match(dialog, /BrainDatePicker/);
    assert.doesNotMatch(dialog, /from 'react-datepicker'/);
    assert.match(dialog, /LOAN_COUNTERPARTY_TYPES/);
    assert.match(dialog, /loanProblem\(/);
    assert.match(dialog, /MoneyInput/);
    assert.match(payment, /isLoanReceivable\(debt\)/, 'el pago de un préstamo no pide concepto: es reintegro');
    assert.match(payment, /reintegro/i);
});
