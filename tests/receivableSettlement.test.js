import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    SETTLEMENT_KINDS,
    isCashPayment,
    isReceivableClosed,
    receivableStatusAfter,
    settlementKindLabel,
    settlementProblem,
    splitAppliedCents
} from '../src/lib/receivableSettlement.js';
import { settleReceivable } from '../src/services/receivableSettlementService.js';
import { createReceivablePayment, reverseReceivablePayment } from '../src/services/receivablePaymentService.js';

// Rodny, 20 de octubre de 2026: «Salsipuedes decía como 3.500.000 pero su negocio cerró y por
// mutuo acuerdo quedamos en 2.000.000 … la plataforma no me permite cerrar eso». «Nuva debía
// como 3 y pico, pero Francisco hizo el cambio con ellos por unos muebles». La deuda se cierra
// por acuerdo, canje, compensación o condonación: se conserva el valor original, el dinero que
// entró sigue siendo el único ingreso, y el ajuste queda registrado aparte, autorizado y con
// motivo. Nunca un ingreso ficticio.

const read = (relative) => fs.readFileSync(new URL(relative, import.meta.url), 'utf8');

test('las formas de saldar una deuda sin dinero son cuatro, más la retención del cliente, y cada una dice qué es', () => {
    assert.deepEqual(SETTLEMENT_KINDS.map((kind) => kind.value), ['ACUERDO', 'CANJE', 'COMPENSACION', 'CONDONACION', 'RETENCION']);
    for (const kind of SETTLEMENT_KINDS) {
        assert.ok(kind.label.length > 5 && kind.help.length > 20, `${kind.value} necesita etiqueta y explicación`);
        assert.doesNotMatch(kind.help, /vosotros|podéis|tenéis/);
    }
    assert.equal(settlementKindLabel('CANJE'), 'Canje de bienes o servicios');
    assert.equal(settlementKindLabel('PAGO'), 'Pago');
    assert.equal(settlementKindLabel(undefined), 'Pago', 'los abonos anteriores a esta regla no tienen kind y son pagos');
});

test('un abono sin kind o con kind PAGO es dinero; el resto es ajuste', () => {
    assert.equal(isCashPayment({ amount: 1 }), true);
    assert.equal(isCashPayment({ kind: 'PAGO' }), true);
    assert.equal(isCashPayment({ kind: 'ACUERDO' }), false);
    assert.deepEqual(
        splitAppliedCents([{ amount: 200000000, kind: 'PAGO' }, { amount: 150000000, kind: 'ACUERDO' }, { amount: 999, kind: 'CANJE', reversedAt: '2026-10-01' }]),
        { paidCents: 200000000, settledCents: 150000000, retainedCents: 0, hasSettlement: true }
    );
    assert.deepEqual(splitAppliedCents([]), { paidCents: 0, settledCents: 0, retainedCents: 0, hasSettlement: false });
});

test('el estado después de aplicar: PAGADO si todo fue dinero, SALDADO si hubo un ajuste', () => {
    const cash = [{ kind: 'PAGO' }];
    assert.equal(receivableStatusAfter({ outstandingCents: 0, payments: cash }), 'PAGADO');
    assert.equal(receivableStatusAfter({ outstandingCents: 0, payments: [{ kind: 'PAGO' }, { kind: 'ACUERDO' }] }), 'SALDADO');
    assert.equal(receivableStatusAfter({ outstandingCents: 0, payments: [{ kind: 'CONDONACION', reversedAt: '2026-10-01' }, { kind: 'PAGO' }] }), 'PAGADO', 'un ajuste revertido ya no cuenta');
    assert.equal(receivableStatusAfter({ outstandingCents: 100, payments: cash, currentStatus: 'PROMESADO' }), 'PROMESADO');
    assert.equal(receivableStatusAfter({ outstandingCents: 100, payments: cash, currentStatus: 'PROMESADO', requestedStatus: 'DEBE' }), 'DEBE');
    assert.equal(receivableStatusAfter({ outstandingCents: 100, payments: [], currentStatus: 'SALDADO' }), 'DEBE', 'reabrir un ajuste devuelve la deuda');
    assert.equal(isReceivableClosed('PAGADO'), true);
    assert.equal(isReceivableClosed('SALDADO'), true);
    assert.equal(isReceivableClosed('PROMESADO'), false);
});

test('settlementProblem dice en palabras qué falta, y acepta lo completo', () => {
    const base = { kind: 'ACUERDO', amount: 1500000, outstanding: 1500000, reason: 'El negocio cerró; por mutuo acuerdo se cierra con 2.000.000.', authorizedBy: 'Francisco Villa' };
    assert.equal(settlementProblem(base), null);
    assert.match(settlementProblem({ ...base, kind: 'REGALO' }), /forma de saldar/i);
    assert.match(settlementProblem({ ...base, amount: 0 }), /valor/i);
    assert.match(settlementProblem({ ...base, amount: 1500001 }), /saldo pendiente/i);
    assert.match(settlementProblem({ ...base, reason: '  ' }), /motivo/i);
    assert.match(settlementProblem({ ...base, reason: 'x'.repeat(301) }), /300/);
    assert.match(settlementProblem({ ...base, authorizedBy: '' }), /autoriz/i);
    assert.match(settlementProblem({ ...base, kind: 'CANJE' }), /qué se recibió/i, 'un canje dice qué bienes o servicios entraron');
    assert.equal(settlementProblem({ ...base, kind: 'CANJE', goods: 'Muebles de oficina: 2 escritorios y 4 sillas', destination: 'Uso personal de Francisco Villa' }), null);
    assert.match(settlementProblem({ ...base, kind: 'COMPENSACION' }), /contra qué/i, 'una compensación dice contra qué obligación se cruza');
    assert.equal(settlementProblem({ ...base, kind: 'COMPENSACION', offsetAgainst: 'Factura de alquiler del estudio, octubre' }), null);
    assert.equal(settlementProblem({ ...base, outstanding: undefined }), null, 'sin saldo conocido se valida la forma; el servidor comprueba el saldo');
});

const buildTx = ({ receivable, period = { status: 'OPEN' } }) => {
    const calls = [];
    return {
        calls,
        tx: {
            accountsReceivable: {
                findUnique: async () => receivable,
                update: async (args) => { calls.push(['receivable.update', args]); return { ...receivable, status: args.data.status }; }
            },
            financialPeriod: { findUnique: async () => period },
            receivablePayment: {
                create: async (args) => { calls.push(['payment.create', args]); return { id: 'settlement-1', ...args.data }; }
            },
            financialRecord: {
                create: async (args) => { calls.push(['record.create', args]); return { id: 'record-x', ...args.data }; }
            },
            financialAuditEvent: {
                create: async (args) => { calls.push(['audit.create', args]); return { id: 'audit-1' }; }
            }
        }
    };
};

test('Salsipuedes: 3.500.000 de deuda, 2.000.000 pagados, 1.500.000 por acuerdo → SALDADO sin ingreso', async () => {
    const receivable = { id: 'debt-salsi', clientId: 'client-1', amount: 3500000, status: 'DEBE', payments: [{ amount: 2000000, kind: 'PAGO', reversedAt: null }] };
    const { calls, tx } = buildTx({ receivable });
    const prismaClient = { $transaction: async (callback) => callback(tx) };

    const result = await settleReceivable(prismaClient, 'debt-salsi', {
        kind: 'ACUERDO', amount: 1500000, settledAt: '2026-10-20',
        reason: 'El negocio cerró. Por mutuo acuerdo se cierra con 2.000.000 para recuperar al menos una parte.',
        authorizedBy: 'Francisco Villa'
    }, { id: 'user-elisa' });

    assert.equal(result.outstanding, 0);
    assert.equal(result.receivable.status, 'SALDADO');
    assert.equal(calls.some(([name]) => name === 'record.create'), false, 'un acuerdo nunca crea un ingreso');
    const created = calls.find(([name]) => name === 'payment.create')[1].data;
    assert.equal(created.kind, 'ACUERDO');
    assert.equal(created.amount, 1500000);
    assert.equal(created.financialRecordId, undefined);
    assert.equal(created.accountId, undefined);
    assert.equal(created.createdById, 'user-elisa');
    assert.equal(created.detail.authorizedBy, 'Francisco Villa');
    assert.match(created.notes, /mutuo acuerdo/);
    const audit = calls.find(([name]) => name === 'audit.create')[1].data;
    assert.equal(audit.entityType, 'AccountsReceivable');
    assert.equal(audit.action, 'UPDATE');
    assert.equal(audit.after.operation, 'SETTLEMENT');
    assert.equal(audit.after.kind, 'ACUERDO');
    assert.equal(audit.before.outstanding, 1500000);
    assert.equal(audit.after.outstanding, 0);
});

test('Nuva: la deuda se cierra con muebles y queda escrito qué entró y a dónde fue', async () => {
    const receivable = { id: 'debt-nuva', clientId: 'client-2', amount: 3200000, status: 'DEBE', payments: [] };
    const { calls, tx } = buildTx({ receivable });
    const prismaClient = { $transaction: async (callback) => callback(tx) };

    const result = await settleReceivable(prismaClient, 'debt-nuva', {
        kind: 'CANJE', amount: 3200000, settledAt: '2026-10-15',
        reason: 'Francisco acordó con Nuva recibir muebles por el valor de la deuda.',
        authorizedBy: 'Francisco Villa', goods: 'Muebles de oficina (2 escritorios, 4 sillas, 1 biblioteca)', destination: 'Uso personal de Francisco Villa; pendiente definir si es anticipo a socio'
    }, { id: 'user-elisa' });

    assert.equal(result.receivable.status, 'SALDADO');
    const created = calls.find(([name]) => name === 'payment.create')[1].data;
    assert.deepEqual(created.detail, { authorizedBy: 'Francisco Villa', goods: 'Muebles de oficina (2 escritorios, 4 sillas, 1 biblioteca)', destination: 'Uso personal de Francisco Villa; pendiente definir si es anticipo a socio' });
});

test('un ajuste parcial deja la deuda abierta y nunca supera el saldo', async () => {
    const receivable = { id: 'debt-1', clientId: 'client-1', amount: 1000000, status: 'PROMESADO', payments: [{ amount: 300000, kind: 'PAGO', reversedAt: null }] };
    const { tx } = buildTx({ receivable });
    const prismaClient = { $transaction: async (callback) => callback(tx) };
    const input = { kind: 'CONDONACION', settledAt: '2026-10-20', reason: 'Se condona parte por el retraso nuestro en la entrega.', authorizedBy: 'Francisco Villa' };

    const partial = await settleReceivable(prismaClient, 'debt-1', { ...input, amount: 200000 }, { id: 'user-1' });
    assert.equal(partial.outstanding, 500000);
    assert.equal(partial.receivable.status, 'PROMESADO');

    await assert.rejects(settleReceivable(prismaClient, 'debt-1', { ...input, amount: 700001 }, { id: 'user-1' }), (error) => error.code === 'RECEIVABLE_SETTLEMENT_EXCEEDS_BALANCE' && error.statusCode === 409);
});

test('lo que falta se dice antes de tocar la base, y una deuda cerrada no se vuelve a saldar', async () => {
    await assert.rejects(settleReceivable({}, 'debt-1', { kind: 'ACUERDO', amount: 100, settledAt: '2026-10-20', authorizedBy: 'Francisco' }, { id: 'u' }),
        (error) => error.code === 'RECEIVABLE_SETTLEMENT_INVALID' && /motivo/i.test(error.message));
    const { tx } = buildTx({ receivable: { id: 'debt-1', clientId: 'c', amount: 100, status: 'SALDADO', payments: [{ amount: 100, kind: 'ACUERDO', reversedAt: null }] } });
    await assert.rejects(settleReceivable({ $transaction: async (cb) => cb(tx) }, 'debt-1', { kind: 'ACUERDO', amount: 1, settledAt: '2026-10-20', reason: 'x', authorizedBy: 'y' }, { id: 'u' }),
        (error) => error.code === 'RECEIVABLE_ALREADY_CLOSED');
    const closedPeriod = buildTx({ receivable: { id: 'debt-1', clientId: 'c', amount: 100, status: 'DEBE', payments: [] }, period: { status: 'CLOSED' } });
    await assert.rejects(settleReceivable({ $transaction: async (cb) => cb(closedPeriod.tx) }, 'debt-1', { kind: 'ACUERDO', amount: 1, settledAt: '2026-10-20', reason: 'x', authorizedBy: 'y' }, { id: 'u' }),
        (error) => /PERIOD/.test(error.code));
});

test('un pago en dinero sobre una deuda ya saldada por acuerdo se rechaza como la pagada', async () => {
    const tx = {
        accountsReceivable: { findUnique: async () => ({ id: 'debt-1', clientId: 'client-1', amount: 100, status: 'SALDADO', payments: [{ amount: 100, kind: 'ACUERDO' }] }) }
    };
    await assert.rejects(createReceivablePayment({ $transaction: async (cb) => cb(tx) }, 'debt-1', { amount: 50, category: 'SERVICIO', paidAt: '2026-10-20', accountId: 'acc' }, { id: 'u' }),
        (error) => error.code === 'RECEIVABLE_ALREADY_PAID');
});

test('revertir el ajuste reabre la deuda y no toca ningún ingreso', async () => {
    const calls = [];
    const settlement = { id: 'settlement-1', receivableId: 'debt-1', kind: 'ACUERDO', amount: 1500000, paidAt: new Date('2026-10-20T12:00:00Z'), reversedAt: null, financialRecordId: null, financialRecord: null };
    const receivable = { id: 'debt-1', clientId: 'c', amount: 3500000, status: 'SALDADO', payments: [{ id: 'pay-1', amount: 2000000, kind: 'PAGO', reversedAt: null }, { id: 'settlement-1', amount: 1500000, kind: 'ACUERDO', reversedAt: null }] };
    const tx = {
        receivablePayment: {
            findUnique: async () => ({ ...settlement, receivable }),
            update: async (args) => { calls.push(['payment.update', args]); return { ...settlement, ...args.data }; }
        },
        financialPeriod: { findUnique: async () => ({ status: 'OPEN' }) },
        financialRecord: { update: async (args) => { calls.push(['record.update', args]); return args.data; } },
        accountsReceivable: { update: async (args) => { calls.push(['receivable.update', args]); return { ...receivable, status: args.data.status }; } },
        financialAuditEvent: { create: async (args) => { calls.push(['audit.create', args]); return { id: 'a' }; } }
    };
    const result = await reverseReceivablePayment({ $transaction: async (cb) => cb(tx) }, 'settlement-1', { reason: 'El cliente pagó al final el resto' }, { id: 'u' });
    assert.equal(result.outstanding, 1500000);
    assert.equal(result.receivable.status, 'DEBE');
    assert.equal(calls.some(([name]) => name === 'record.update'), false);
});

test('el esquema, el arranque y el catálogo de Bria conocen el cierre de deuda', () => {
    const schema = read('../prisma/schema.prisma');
    assert.match(schema, /enum ReceivableStatus \{[^}]*SALDADO/);
    assert.match(schema, /model ReceivablePayment \{[\s\S]*kind\s+String\s+@default\("PAGO"\)/);
    assert.match(schema, /model ReceivablePayment \{[\s\S]*detail\s+Json\?/);
    const ensure = read('../scripts/ensure-receivable-settlement-schema.js');
    assert.match(ensure, /ALTER TYPE "ReceivableStatus" ADD VALUE IF NOT EXISTS 'SALDADO'/);
    assert.match(ensure, /ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'PAGO'/);
    assert.match(ensure, /ADD COLUMN IF NOT EXISTS "detail" JSONB/);
    const start = JSON.parse(read('../package.json')).scripts.start;
    assert.match(start, /ensure-receivable-settlement-schema\.js/);
    assert.match(read('../scripts/pre-push-enum.js'), /'DEBE', 'PAGADO', 'PROMESADO', 'SALDADO'/);
    assert.match(read('../src/lib/platformCatalog.js'), /'POST \/financials\/receivables\/:id\/settlements'/);
    assert.match(read('../src/routes/api/financials.js'), /receivables\/:id\/settlements', requireFinancialWrite/);
});

test('la pantalla ofrece saldar de otra forma con el calendario compartido y explica cada abono', () => {
    const dashboard = read('../src/components/modules/FinancialDashboard.jsx');
    const dialog = read('../src/components/modules/financial/ReceivableSettlementDialog.jsx');
    assert.match(dashboard, /ReceivableSettlementDialog/);
    assert.match(dashboard, /Saldar de otra forma/);
    assert.match(dashboard, /isReceivableClosed\(debt\.status\)/, 'cerrada es PAGADO o SALDADO, nunca solo PAGADO');
    assert.match(dashboard, /settlementKindLabel/);
    assert.match(dialog, /BrainDatePicker/);
    assert.doesNotMatch(dialog, /from 'react-datepicker'/);
    assert.match(dialog, /SETTLEMENT_KINDS/);
    assert.match(dialog, /settlementProblem\(/, 'la pantalla frena con la misma regla que el servidor');
    assert.match(dialog, /role="alert"/);
    assert.match(dialog, /ingreso/i, 'dice que no se registra dinero');
});
