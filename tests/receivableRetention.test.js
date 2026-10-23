import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    RETENTION_KIND, RETENTION_TYPES, SETTLEMENT_KINDS, isNonCashSettlement, isRetentionPayment, normalizeRetentions,
    paymentKindLabel, receivableStatusAfter, retentionsProblem, settlementDetail, settlementProblem, splitAppliedCents
} from '../src/lib/receivableSettlement.js';
import { summarizeAdjustments } from '../src/lib/receivableAdjustments.js';
import { createReceivablePayment } from '../src/services/receivablePaymentService.js';
import { settleReceivable } from '../src/services/receivableSettlementService.js';
import { attachReceivablePaymentDocument } from '../src/services/receivablePaymentDocumentService.js';
import { isExcludedOperation, PLATFORM_OPERATIONS } from '../src/lib/platformCatalog.js';

// Elisa, 22 de octubre de 2026, con Fundación Grit: «no pagan el valor de la cuenta completo porque
// aplican retención en la fuente, entonces cuando registro el valor que realmente ingresa a la
// cuenta les queda un saldo pendiente … que quede cerrado y no me suba el valor de la cartera, pero
// que no cuente como ingreso». Una retención no es un descuento: el cliente la paga a la DIAN a
// nombre de quien emitió, que la descuenta en su declaración. Por eso cierra la cuenta como pagada.
// Caso real: la cuenta de 3.150.000 de Grit entró con 2.997.036, y la 0396 de 4.000.000 con 3.805.760.

const read = (relative) => fs.readFileSync(new URL(relative, import.meta.url), 'utf8');

test('la retención es una forma de cierre propia, con su tipo, y no pide autorización ni motivo', () => {
    assert.ok(SETTLEMENT_KINDS.some((kind) => kind.value === RETENTION_KIND));
    assert.deepEqual(RETENTION_TYPES.map((type) => type.value), ['RETEFUENTE', 'RETEICA', 'RETEIVA']);
    assert.equal(settlementProblem({ kind: 'RETENCION', amount: 126000, retentionType: 'RETEFUENTE' }), null, 'sin quién autorizó y sin motivo');
    assert.match(settlementProblem({ kind: 'RETENCION', amount: 126000 }), /qué retención/i);
    assert.match(settlementProblem({ kind: 'RETENCION', amount: 126000, retentionType: 'X' }), /qué retención/i);
    assert.match(settlementProblem({ kind: 'RETENCION', amount: 200000, outstanding: 152964, retentionType: 'RETEFUENTE' }), /supera/i);
    assert.match(settlementProblem({ kind: 'ACUERDO', amount: 1, reason: 'x' }), /autoriz/i, 'los demás cierres siguen pidiendo autorización');
    assert.deepEqual(settlementDetail({ kind: 'RETENCION', retentionType: 'RETEICA', certificateNumber: ' CR-2026-14 ', authorizedBy: '' }), { retentionType: 'RETEICA', certificateNumber: 'CR-2026-14' });
    assert.equal(paymentKindLabel({ kind: 'RETENCION', detail: { retentionType: 'RETEICA' } }), 'Retención de ICA');
    assert.equal(paymentKindLabel({ kind: 'ACUERDO' }), 'Acuerdo por menor valor');
    assert.equal(paymentKindLabel({ kind: 'PAGO' }), 'Pago');
    assert.equal(isRetentionPayment({ kind: 'RETENCION' }), true);
    assert.equal(isNonCashSettlement({ kind: 'RETENCION' }), false, 'una retención no es un descuento');
    assert.equal(isNonCashSettlement({ kind: 'CANJE' }), true);
});

test('una cuenta cubierta con pago y retención queda PAGADA; con un acuerdo, SALDADA', () => {
    assert.equal(receivableStatusAfter({ outstandingCents: 0, payments: [{ kind: 'PAGO' }, { kind: 'RETENCION' }] }), 'PAGADO');
    assert.equal(receivableStatusAfter({ outstandingCents: 0, payments: [{ kind: 'PAGO' }, { kind: 'RETENCION' }, { kind: 'ACUERDO' }] }), 'SALDADO');
    assert.equal(receivableStatusAfter({ outstandingCents: 0, payments: [{ kind: 'PAGO' }, { kind: 'ACUERDO', reversedAt: new Date() }] }), 'PAGADO', 'un acuerdo revertido no cuenta');
    assert.deepEqual(splitAppliedCents([{ kind: 'PAGO', amount: 100 }, { kind: 'RETENCION', amount: 5 }, { kind: 'ACUERDO', amount: 10 }, { kind: 'RETENCION', amount: 7, reversedAt: new Date() }]),
        { paidCents: 100, settledCents: 10, retainedCents: 5, hasSettlement: true });
});

test('las retenciones de un pago: una por tipo, positivas, y nunca más que el saldo', () => {
    assert.deepEqual(normalizeRetentions([{ type: 'RETEFUENTE', amount: '126000' }, { type: 'RETEICA', amount: 0 }, { type: 'RETEICA', amount: '' }]), [{ type: 'RETEFUENTE', amount: 126000 }]);
    assert.equal(retentionsProblem([{ type: 'RETEFUENTE', amount: 126000 }, { type: 'RETEICA', amount: 26964 }], { cash: 2997036, outstanding: 3150000 }), null);
    assert.match(retentionsProblem([{ type: 'RETEFUENTE', amount: 1 }, { type: 'RETEFUENTE', amount: 2 }]), /dos veces/i);
    assert.match(retentionsProblem([{ type: 'NOPE', amount: 1 }]), /qué retención/i);
    assert.match(retentionsProblem([{ type: 'RETEFUENTE', amount: 200000 }], { cash: 3000000, outstanding: 3150000 }), /supera/i);
    assert.equal(retentionsProblem([]), null);
});

test('el resumen de ajustes suma lo retenido aparte y por tipo, sin mezclarlo con lo saldado sin dinero', () => {
    const summary = summarizeAdjustments({ settlements: [
        { kind: 'RETENCION', retentionType: 'RETEFUENTE', amount: 126000 },
        { kind: 'RETENCION', retentionType: 'RETEICA', amount: 26964 },
        { kind: 'ACUERDO', amount: 1500000 }
    ] });
    assert.equal(summary.retention.total, 152964);
    assert.equal(summary.retention.count, 2);
    assert.equal(summary.retention.byType.RETEFUENTE.total, 126000);
    assert.equal(summary.retention.byType.RETEICA.total, 26964);
    assert.equal(summary.settledTotal, 1500000, 'lo retenido no es saldado sin dinero');
});

const buildTx = ({ receivable }) => {
    const calls = [];
    let counter = 0;
    const tx = {
        financialPeriod: { findUnique: async () => ({ status: 'OPEN' }) },
        financialAccount: { findUnique: async () => ({ id: 'acc-1', isActive: true, currency: 'COP' }) },
        client: { findUnique: async () => ({ id: 'grit' }) },
        accountsReceivable: {
            findUnique: async () => receivable,
            update: async (args) => { calls.push(['receivable.update', args]); return { ...receivable, ...args.data }; }
        },
        financialRecord: { create: async (args) => { calls.push(['record.create', args]); return { id: 'rec-1', ...args.data }; } },
        receivablePayment: {
            findUnique: async () => null,
            create: async (args) => { calls.push(['payment.create', args]); return { id: `pay-${++counter}`, ...args.data }; }
        },
        financialAuditEvent: { create: async (args) => { calls.push(['audit.create', args]); return { id: 'a' }; } }
    };
    return { calls, prisma: { $transaction: async (cb) => cb(tx) } };
};

const grit = () => ({ id: 'grit-ago', kind: 'CLIENTE', clientId: 'grit', amount: 3150000, currency: 'COP', status: 'DEBE', sourceLabel: 'Fundación Grit', payments: [] });

test('registrar el pago de Grit con sus retenciones: un solo ingreso por lo que entró, la retención aparte y la cuenta pagada', async () => {
    const { calls, prisma } = buildTx({ receivable: grit() });
    const result = await createReceivablePayment(prisma, 'grit-ago', {
        amount: 2997036, paidAt: '2026-10-02', accountId: 'acc-1', category: 'MEMBRESIA',
        retentions: [{ type: 'RETEFUENTE', amount: 126000 }, { type: 'RETEICA', amount: 26964 }]
    }, { id: 'u' });
    const records = calls.filter(([name]) => name === 'record.create');
    assert.equal(records.length, 1, 'solo lo que entró es ingreso');
    assert.equal(records[0][1].data.amount, 2997036);
    const rows = calls.filter(([name]) => name === 'payment.create').map(([, args]) => args.data);
    assert.deepEqual(rows.map((row) => [row.kind || 'PAGO', row.amount]), [['PAGO', 2997036], ['RETENCION', 126000], ['RETENCION', 26964]]);
    assert.deepEqual(rows.slice(1).map((row) => row.detail.retentionType), ['RETEFUENTE', 'RETEICA']);
    assert.equal(rows[1].accountId, undefined, 'una retención no tiene cuenta');
    assert.equal(rows[1].financialRecordId, undefined, 'una retención no tiene ingreso');
    assert.equal(calls.find(([name]) => name === 'receivable.update')[1].data.status, 'PAGADO');
    assert.equal(result.outstanding, 0);
    assert.equal(result.retentionPayments.length, 2);
    const audit = calls.find(([name, args]) => name === 'audit.create' && args.data.action === 'PAYMENT')[1].data.after;
    assert.deepEqual(audit.retentions.map((item) => item.type), ['RETEFUENTE', 'RETEICA']);
});

test('pago y retenciones no pueden pasarse del saldo, y un préstamo no lleva retenciones', async () => {
    const over = buildTx({ receivable: grit() });
    await assert.rejects(createReceivablePayment(over.prisma, 'grit-ago', { amount: 3100000, paidAt: '2026-10-02', accountId: 'acc-1', category: 'MEMBRESIA', retentions: [{ type: 'RETEFUENTE', amount: 126000 }] }, { id: 'u' }),
        (error) => error.code === 'RECEIVABLE_OVERPAYMENT');
    const tooMuch = buildTx({ receivable: grit() });
    await assert.rejects(createReceivablePayment(tooMuch.prisma, 'grit-ago', { amount: 1, paidAt: '2026-10-02', accountId: 'acc-1', category: 'MEMBRESIA', retentions: [{ type: 'RETEFUENTE', amount: 3200000 }] }, { id: 'u' }),
        (error) => error.code === 'RECEIVABLE_RETENTION_EXCEEDS_BALANCE');
    const duplicated = buildTx({ receivable: grit() });
    await assert.rejects(createReceivablePayment(duplicated.prisma, 'grit-ago', { amount: 1, paidAt: '2026-10-02', accountId: 'acc-1', category: 'MEMBRESIA', retentions: [{ type: 'RETEICA', amount: 1 }, { type: 'RETEICA', amount: 2 }] }, { id: 'u' }),
        (error) => error.code === 'RECEIVABLE_RETENTION_INVALID');
    const loan = buildTx({ receivable: { ...grit(), kind: 'PRESTAMO', clientId: null } });
    await assert.rejects(createReceivablePayment(loan.prisma, 'grit-ago', { amount: 1, paidAt: '2026-10-02', accountId: 'acc-1', retentions: [{ type: 'RETEFUENTE', amount: 1 }] }, { id: 'u' }),
        (error) => error.code === 'RECEIVABLE_RETENTION_INVALID');
});

test('la cuenta de Grit que ya quedó con saldo se cierra con «Saldar de otra forma» → retención, y queda pagada', async () => {
    const calls = [];
    const receivable = { ...grit(), amount: 4000000, payments: [{ amount: 3805760, kind: 'PAGO', reversedAt: null }] };
    const tx = {
        financialPeriod: { findUnique: async () => ({ status: 'OPEN' }) },
        accountsReceivable: { findUnique: async () => receivable, update: async (args) => { calls.push(['receivable.update', args]); return { ...receivable, ...args.data }; } },
        receivablePayment: { create: async (args) => { calls.push(['payment.create', args]); return { id: 'ret-1', ...args.data }; } },
        financialAuditEvent: { create: async () => ({ id: 'a' }) }
    };
    const result = await settleReceivable({ $transaction: async (cb) => cb(tx) }, 'grit-0396', { kind: 'RETENCION', amount: 194240, settledAt: '2026-10-21', retentionType: 'RETEFUENTE' }, { id: 'u' });
    const row = calls.find(([name]) => name === 'payment.create')[1].data;
    assert.equal(row.kind, 'RETENCION');
    assert.deepEqual(row.detail, { retentionType: 'RETEFUENTE' });
    assert.equal(row.notes, null, 'sin nota no se inventa un motivo');
    assert.equal(calls.find(([name]) => name === 'receivable.update')[1].data.status, 'PAGADO');
    assert.equal(result.outstanding, 0);
});

test('el certificado se adjunta a la retención, nunca a un pago en dinero', async () => {
    const prisma = { receivablePayment: { findUnique: async () => ({ id: 'pay-1', kind: 'PAGO', reversedAt: null }) } };
    await assert.rejects(attachReceivablePaymentDocument(prisma, {}, 'pay-1', {}, { id: 'u' }), (error) => error.code === 'RECEIVABLE_PAYMENT_DOCUMENT_ON_INCOME');
    const reversed = { receivablePayment: { findUnique: async () => ({ id: 'ret-1', kind: 'RETENCION', reversedAt: new Date() }) } };
    await assert.rejects(attachReceivablePaymentDocument(reversed, {}, 'ret-1', {}, { id: 'u' }), (error) => error.code === 'RECEIVABLE_PAYMENT_REVERSED');
});

test('el esquema, el arranque, las rutas, el catálogo y la pantalla conocen las retenciones', () => {
    assert.match(read('../prisma/schema.prisma'), /^model ReceivablePaymentDocument \{/m);
    assert.match(read('../scripts/ensure-receivable-retention-schema.js'), /CREATE TABLE IF NOT EXISTS "ReceivablePaymentDocument"/);
    assert.match(JSON.parse(read('../package.json')).scripts.start, /ensure-receivable-retention-schema\.js/);
    const routes = read('../src/routes/api/financials.js');
    assert.ok(routes.includes("'/receivable-payments/:paymentId/documents', requireFinancialWrite, receiveFinancialDocument"));
    // Desde el 22 de octubre de 2026 Bria adjunta el certificado que llegó al chat; bajarlo sigue fuera.
    assert.ok(PLATFORM_OPERATIONS['POST /financials/receivable-payments/:paymentId/documents'].archivo);
    assert.ok(isExcludedOperation('GET /financials/receivable-payments/:paymentId/documents/:documentId/file'));
    assert.match(PLATFORM_OPERATIONS['POST /financials/receivables/:id/payments'].campos, /retentions/);
    const controller = read('../src/controllers/financialController.js');
    assert.match(controller, /retainedAmount/);
    assert.match(controller, /supportDocuments/);
    const dialog = read('../src/components/modules/financial/ReceivablePaymentDialog.jsx');
    assert.match(dialog, /data-receivable-payment-retentions/);
    assert.match(dialog, /retentionsProblem\(/);
    assert.match(dialog, /MoneyInput/);
    const settlement = read('../src/components/modules/financial/ReceivableSettlementDialog.jsx');
    assert.match(settlement, /RETENTION_TYPES/);
    assert.match(settlement, /Registrar retención/);
    const dashboard = read('../src/components/modules/FinancialDashboard.jsx');
    assert.match(dashboard, /data-receivable-retained/);
    assert.match(dashboard, /retentionCertificateApi/);
    assert.match(dashboard, /retentions\.length \? \{ retentions \}/);
    assert.match(read('../src/components/modules/financial/ReceivableAdjustmentsSummary.jsx'), /data-adjustment-retention/);
    assert.match(read('../src/services/clientStatementPdfService.js'), /paymentKindLabel\(payment\)/, 'el estado de cuenta dice «Retención en la fuente», no «ajuste»');
});
