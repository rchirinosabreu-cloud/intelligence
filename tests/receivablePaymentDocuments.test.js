import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getFinancialReceivablesLedger } from '../src/controllers/financialController.js';
import { financialDocumentProblem } from '../src/lib/financialDocumentsClient.js';

// Elisa, 5 de octubre de 2026: «hoy registré un ingreso de SunPartners desde cartera pero no se
// puede adjuntar el comprobante». El abono crea un ingreso bloqueado (lo generó Cartera) y no
// había ningún sitio donde subirle el soporte: ni al registrarlo, ni en Cartera, ni en Movimientos.

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const makeResponse = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.payload = body; return this; } });

test('cada abono de la cartera trae su ingreso y sus comprobantes vigentes', async () => {
    let includeArgs;
    const prismaClient = {
        financialImportBatch: { findFirst: async () => null },
        accountsReceivable: {
            findMany: async (args) => {
                includeArgs = args.include;
                return [{
                    id: 'debt-1', amount: 5000000, period: new Date(Date.UTC(2026, 9, 1)), year: 2026, month: 10,
                    dueDate: null, status: 'DEBE', notes: null, comments: null, sourceLabel: 'SunPartners', items: [],
                    client: { name: 'SunPartners', slug: 'sunpartners' },
                    payments: [{
                        id: 'payment-1', amount: 2500000, paidAt: new Date(Date.UTC(2026, 9, 5)), reference: 'TRX-55', notes: null,
                        account: { id: 'acc-1', name: 'Bancolombia' }, reversedAt: null, reversalReason: null,
                        financialRecordId: 'rec-1',
                        financialRecord: { id: 'rec-1', documents: [{ id: 'doc-1', name: 'soporte-sunpartners.pdf', mimeType: 'application/pdf', size: 2048 }] }
                    }]
                }];
            }
        }
    };
    const res = makeResponse();
    await getFinancialReceivablesLedger({ query: { year: 2026 } }, res, { prismaClient });

    const [payment] = res.payload.items[0].payments;
    assert.equal(payment.financialRecordId, 'rec-1');
    assert.deepEqual(payment.documents, [{ id: 'doc-1', name: 'soporte-sunpartners.pdf', mimeType: 'application/pdf', size: 2048 }]);
    // Solo los vigentes: un comprobante anulado no se ofrece.
    assert.deepEqual(includeArgs.payments.include.financialRecord.select.documents.where, { voidedAt: null });
});

test('el comprobante se revisa antes de subirlo, igual en todas partes', () => {
    assert.equal(financialDocumentProblem({ name: 'soporte.pdf', size: 1000 }), null);
    assert.match(financialDocumentProblem({ name: 'hoja.xlsx', size: 1000 }), /PDF, JPG o PNG/);
    assert.match(financialDocumentProblem({ name: 'grande.png', size: 26 * 1024 * 1024 }), /25 MB/);
});

test('el comprobante de un abono se sube al registrarlo, desde Cartera y desde Movimientos', () => {
    const dialog = read('../src/components/modules/financial/ReceivablePaymentDialog.jsx');
    assert.match(dialog, /Comprobante/);
    assert.match(dialog, /type="file"/);

    const dashboard = read('../src/components/modules/FinancialDashboard.jsx');
    assert.match(dashboard, /<RecordDocumentsInline/, 'cada abono de Cartera muestra y recibe comprobantes');
    // El comprobante se sube después de que el servidor confirme el abono, al ingreso que devolvió.
    assert.match(dashboard, /uploadRecordDocument\(result\?\.financialRecord\?\.id/);

    const ledger = read('../src/components/modules/financial/FinancialLedger.jsx');
    assert.match(ledger, /<ReceivablePaymentPanel/, 'el lápiz del ingreso de un abono abre sus comprobantes');

    const shared = read('../src/components/modules/financial/RecordDocumentsInline.jsx');
    assert.match(shared, /Subir comprobante/);
    assert.match(shared, /ChatFilePreview/);
    const payroll = read('../src/components/modules/financial/PayrollPayments.jsx');
    assert.match(payroll, /<RecordDocumentsInline/, 'Nómina usa la misma pieza');
});
