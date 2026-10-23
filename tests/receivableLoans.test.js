import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    LOAN_COUNTERPARTY_TYPES,
    LOAN_KIND,
    isLoanReceivable,
    isLoanUntouched,
    loanCounterpartyLabel,
    loanCounterpartyNameFromRecord,
    loanFromRecord,
    loanProblem
} from '../src/lib/receivableLoans.js';
import { createLoan } from '../src/services/receivableLoanService.js';
import { createReceivablePayment } from '../src/services/receivablePaymentService.js';
import { createFinancialRecord, financialRecordLockReason, updateFinancialRecord, voidFinancialRecord } from '../src/services/financialRecordService.js';

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

// Rodny, 20 de octubre de 2026, al ver «Préstamo Melissa» y «Prestamos Fancisco» en Movimientos sin
// nada en Cartera: «la idea es que si tiene esa categoría de préstamo vaya a cuenta por cobrar en
// seguida». Un egreso de categoría Préstamo registrado en Movimientos es un préstamo: la cuenta por
// cobrar nace sola, y mientras nadie lo haya reintegrado sigue al movimiento (se corrige o se anula
// desde Movimientos y la cartera cambia con él). Con reintegros, el egreso queda bloqueado como antes.

test('loanFromRecord: un egreso de categoría Préstamo es un préstamo, y a quién se le prestó sale de la contraparte o de la descripción', () => {
    const base = { type: 'EXPENSE', category: 'PRESTAMO', status: 'POSTED', scenario: 'ACTUAL', isProjection: false, description: 'Préstamo Melissa', counterparty: 'Melissa' };
    assert.deepEqual(loanFromRecord(base), { counterpartyType: null, clientId: null, counterpartyName: 'Melissa' });
    assert.equal(loanFromRecord({ ...base, counterparty: null }).counterpartyName, 'Melissa', 'sin contraparte, la descripción sin la palabra «préstamo»');
    assert.equal(loanCounterpartyNameFromRecord({ description: 'Prestamos Fancisco' }), 'Fancisco');
    assert.equal(loanCounterpartyNameFromRecord({ description: 'Préstamo a Camila Ruiz' }), 'Camila Ruiz');
    assert.equal(loanCounterpartyNameFromRecord({ description: 'Prestamos' }), 'Sin nombre', 'un préstamo sin nombre no se inventa uno');
    assert.deepEqual(loanFromRecord({ ...base, clientId: 'client-1', client: { name: 'La Sazón de Iris' } }), { counterpartyType: 'CLIENTE', clientId: 'client-1', counterpartyName: 'La Sazón de Iris' }, 'con ficha de cliente manda el nombre de la ficha');
    assert.equal(loanFromRecord({ ...base, clientId: 'client-1' }).counterpartyName, 'Melissa', 'sin la ficha a la mano, lo que diga el movimiento');
    assert.equal(loanFromRecord({ ...base, type: 'INCOME' }), null, 'un ingreso de categoría Préstamo es un reintegro, no un préstamo');
    assert.equal(loanFromRecord({ ...base, category: 'OPERATIVO' }), null);
    assert.equal(loanFromRecord({ ...base, status: 'VOIDED' }), null);
    assert.equal(loanFromRecord({ ...base, scenario: 'FORECAST', isProjection: true }), null, 'una proyección no saca dinero');
    assert.equal(loanFromRecord({ ...base, payrollPayment: { id: 'p' } }), null, 'un movimiento que ya es de otra operación no se liga');
    assert.equal(isLoanUntouched({ status: 'DEBE', payments: [] }), true);
    assert.equal(isLoanUntouched({ status: 'DEBE', payments: [{ id: 'p', reversedAt: new Date() }] }), true, 'un reintegro revertido no cuenta');
    assert.equal(isLoanUntouched({ status: 'DEBE', payments: [{ id: 'p', reversedAt: null }] }), false);
    assert.equal(isLoanUntouched({ status: 'SALDADO', payments: [] }), false, 'un préstamo cerrado ya no sigue al movimiento');
});

const buildLedgerTx = ({ existing = null, members = [], loanRow = null } = {}) => {
    const calls = [];
    const tx = {
        financialPeriod: { findUnique: async () => ({ status: 'OPEN' }) },
        teamMember: { findFirst: async (args) => { calls.push(['member.findFirst', args]); return members[0] || null; } },
        financialRecord: {
            findUnique: async () => existing,
            create: async (args) => { calls.push(['record.create', args]); return { id: 'rec-new', ...args.data, loanReceivable: null }; },
            update: async (args) => { calls.push(['record.update', args]); return { ...existing, ...args.data }; }
        },
        accountsReceivable: {
            findUnique: async () => loanRow,
            create: async (args) => { calls.push(['receivable.create', args]); return { id: 'loan-auto', ...args.data }; },
            update: async (args) => { calls.push(['receivable.update', args]); return { ...loanRow, ...args.data }; },
            delete: async (args) => { calls.push(['receivable.delete', args]); return loanRow; }
        },
        financialAuditEvent: { create: async (args) => { calls.push(['audit.create', args]); return { id: 'a' }; } }
    };
    return { calls, tx, prisma: { $transaction: async (cb) => cb(tx) } };
};

test('registrar en Movimientos un egreso de categoría Préstamo crea el préstamo en Cartera en la misma transacción', async () => {
    const { calls, prisma } = buildLedgerTx({ members: [{ id: 'tm-1', name: 'Melisa Castaño' }] });
    await createFinancialRecord(prisma, {
        amount: 5525000, type: 'EXPENSE', category: 'PRESTAMO', date: '2026-09-28', accountId: 'acc-1', description: 'Préstamo Melissa', counterparty: 'Melissa'
    }, { id: 'user-elisa' });
    const receivable = calls.find(([name]) => name === 'receivable.create')[1].data;
    assert.equal(receivable.kind, 'PRESTAMO');
    assert.equal(receivable.loanRecordId, 'rec-new');
    assert.equal(receivable.counterpartyName, 'Melissa');
    assert.equal(receivable.counterpartyType, 'COLABORADOR', 'si el nombre es de alguien del equipo, es un colaborador');
    assert.equal(receivable.amount, 5525000);
    assert.equal(receivable.year, 2026);
    assert.equal(receivable.month, 9);
    assert.equal(receivable.status, 'DEBE');
    assert.equal(receivable.metadata.autoLinked, true);
    const audits = calls.filter(([name]) => name === 'audit.create').map(([, args]) => `${args.data.entityType}:${args.data.action}`).sort();
    assert.deepEqual(audits, ['AccountsReceivable:CREATE', 'FinancialRecord:CREATE']);

    const other = buildLedgerTx({ members: [] });
    await createFinancialRecord(other.prisma, { amount: 200000, type: 'EXPENSE', category: 'PRESTAMO', date: '2026-09-28', accountId: 'acc-1', description: 'Prestamos Fancisco', counterparty: 'Francisco' }, { id: 'u' });
    assert.equal(other.calls.find(([name]) => name === 'receivable.create')[1].data.counterpartyType, 'OTRO', 'si no es del equipo, queda como otro tercero');

    const expense = buildLedgerTx();
    await createFinancialRecord(expense.prisma, { amount: 90000, type: 'EXPENSE', category: 'OPERATIVO', date: '2026-09-28', accountId: 'acc-1', description: 'Papelería' }, { id: 'u' });
    assert.equal(expense.calls.some(([name]) => name === 'receivable.create'), false, 'un gasto normal no crea nada en Cartera');
});

test('mientras nadie lo haya reintegrado, el préstamo sigue al movimiento: corregirlo lo actualiza y anularlo lo quita de Cartera', async () => {
    const loan = { id: 'loan-1', status: 'DEBE', payments: [] };
    const loanRow = { id: 'loan-1', kind: 'PRESTAMO', amount: 200000, status: 'DEBE', counterpartyName: 'Fancisco', loanRecordId: 'rec-1' };
    const existing = { id: 'rec-1', type: 'EXPENSE', category: 'PRESTAMO', status: 'POSTED', scenario: 'ACTUAL', isProjection: false, origin: 'MANUAL', amount: 200000, date: new Date('2026-09-28T12:00:00Z'), year: 2026, month: 9, accountId: 'acc-1', description: 'Prestamos Fancisco', counterparty: 'Fancisco', loanReceivable: loan, receivablePayment: null, payrollTransaction: null, payrollPayment: null };

    const edit = buildLedgerTx({ existing, loanRow });
    await updateFinancialRecord(edit.prisma, 'rec-1', { amount: 250000, counterparty: 'Francisco Villa' }, { id: 'u' });
    const updated = edit.calls.find(([name]) => name === 'receivable.update')[1];
    assert.equal(updated.where.id, 'loan-1');
    assert.equal(updated.data.amount, 250000);
    assert.equal(updated.data.counterpartyName, 'Francisco Villa');

    const recategorized = buildLedgerTx({ existing, loanRow });
    await updateFinancialRecord(recategorized.prisma, 'rec-1', { category: 'OPERATIVO' }, { id: 'u' });
    assert.equal(recategorized.calls.find(([name]) => name === 'receivable.delete')[1].where.id, 'loan-1', 'si deja de ser préstamo, deja de estar en Cartera');
    assert.ok(recategorized.calls.some(([name, args]) => name === 'audit.create' && args.data.entityType === 'AccountsReceivable' && args.data.action === 'DELETE'));

    const voided = buildLedgerTx({ existing, loanRow });
    await voidFinancialRecord(voided.prisma, 'rec-1', 'Se registró dos veces', { id: 'u' });
    assert.equal(voided.calls.find(([name]) => name === 'receivable.delete')[1].where.id, 'loan-1');

    const repaid = buildLedgerTx({ existing: { ...existing, loanReceivable: { ...loan, payments: [{ id: 'p', reversedAt: null }] } }, loanRow });
    await assert.rejects(updateFinancialRecord(repaid.prisma, 'rec-1', { amount: 1 }, { id: 'u' }), (error) => error.code === 'FINANCIAL_RECORD_LINKED' && /reintegro/i.test(error.message));
    await assert.rejects(voidFinancialRecord(repaid.prisma, 'rec-1', 'x', { id: 'u' }), (error) => error.code === 'FINANCIAL_RECORD_LINKED');
});

test('el egreso de un préstamo con reintegros no se edita ni se anula desde Movimientos: se dice a dónde ir', () => {
    const reason = financialRecordLockReason({ origin: 'MANUAL', loanReceivable: { id: 'loan-1', status: 'DEBE', payments: [{ id: 'p', reversedAt: null }] } });
    assert.match(reason, /préstamo/i);
    assert.match(reason, /Cuentas por cobrar/);
    assert.match(reason, /reintegro/i);
    assert.equal(financialRecordLockReason({ origin: 'MANUAL', loanReceivable: { id: 'loan-1', status: 'DEBE', payments: [] } }), null, 'sin reintegros, el movimiento se corrige en Movimientos y la cartera lo sigue');
    assert.match(financialRecordLockReason({ origin: 'SYSTEM', loanReceivable: { id: 'loan-1', status: 'DEBE', payments: [] } }), /Eliminar/, 'el egreso que creó «Registrar préstamo» se deshace desde Cartera');
    const ledger = read('../src/components/modules/financial/FinancialLedger.jsx');
    assert.match(ledger, /loanReceivable/, 'la pantalla sabe antes que un préstamo con reintegros no se toca aquí');
});

test('los préstamos que ya estaban en Movimientos se llevan a Cartera con un script que simula por defecto', () => {
    const script = read('../scripts/link-loan-records.js');
    assert.match(script, /syncLoanWithRecord/);
    assert.match(script, /--confirmar LIGAR/);
    assert.match(script, /loanReceivable: \{ is: null \}/);
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
