import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { recordExternalReceivableDocument, correctReceivableDocument, issueReceivableDocument } from '../src/services/receivableDocumentService.js';
import { externalDocumentProblem, isExternalReceivableDocument } from '../src/lib/receivableDocument.js';
import { buildClientStatementModel } from '../src/services/clientStatementPdfService.js';
import { openReceivablePdf } from '../src/services/receivablePdfService.js';
import { updateReceivable } from '../src/services/financialReceivableService.js';

// «Ya la emití en Word» (Elisa, 13 de noviembre de 2026, con Haad): las deudas que vinieron del Excel ya tienen su
// cuenta de cobro mandada desde Word. Se anotan número y fecha para que el estado de cuenta la nombre; no hay PDF,
// no se congelan conceptos y el valor se sigue corrigiendo con el lápiz.

const receivable = (over = {}) => ({
    id: 'debt-1', clientId: 'client-1', kind: 'CLIENTE', amount: 1507519, status: 'DEBE', number: null, issuedAt: null, currency: 'COP',
    period: new Date('2026-07-01T12:00:00Z'), year: 2026, month: 7, payments: [], metadata: {}, client: { id: 'client-1', name: 'Haad Aesthetic Center' }, ...over
});
const buildTx = ({ row, taken = null }) => {
    const calls = [];
    const tx = {
        accountsReceivable: {
            findUnique: async () => row,
            findFirst: async (args) => { calls.push(['findFirst', args]); return taken; },
            update: async (args) => { calls.push(['update', args]); return { ...row, ...args.data }; }
        },
        financialPeriod: { findUnique: async () => ({ status: 'OPEN' }) },
        financialAuditEvent: { create: async (args) => { calls.push(['audit', args]); return { id: 'a' }; } }
    };
    return { calls, tx, prismaClient: { $transaction: async (work) => work(tx) } };
};

test('la regla: número entero positivo y fecha; lo demás se dice en palabras', () => {
    assert.equal(externalDocumentProblem({ number: '380', issuedAt: '2026-07-31' }), null);
    assert.match(externalDocumentProblem({ number: '', issuedAt: '2026-07-31' }), /Escribe el número/);
    assert.match(externalDocumentProblem({ number: '0380.5', issuedAt: '2026-07-31' }), /Escribe el número/);
    assert.match(externalDocumentProblem({ number: '380', issuedAt: '' }), /fecha/);
    assert.ok(isExternalReceivableDocument({ metadata: { externalDocument: { recordedAt: 'x' } } }));
    assert.ok(isExternalReceivableDocument({ externalDocument: true }), 'la pantalla recibe la marca ya resuelta');
    assert.equal(isExternalReceivableDocument({ metadata: {} }), false);
});

test('anotar guarda número, fecha y la marca; sin conceptos, sin PDF y con auditoría', async () => {
    const { calls, prismaClient } = buildTx({ row: receivable() });
    const result = await recordExternalReceivableDocument(prismaClient, 'debt-1', { number: '380', issuedAt: '2026-07-31', servicePeriod: '1 al 31 de julio' }, { id: 'u-elisa' });
    assert.equal(result.document.formattedNumber, 'No. 0380');
    assert.equal(result.document.external, true);
    const update = calls.find(([name]) => name === 'update')[1].data;
    assert.equal(update.number, 380);
    assert.equal(update.issuedById, 'u-elisa');
    assert.equal(update.servicePeriod, '1 al 31 de julio');
    assert.equal(update.metadata.externalDocument.recordedById, 'u-elisa');
    assert.equal(update.amount, undefined, 'el valor de la obligación no se toca');
    assert.equal(update.concept, undefined);
    assert.ok(!calls.some(([name]) => /items/.test(name)));
    const audit = calls.find(([name]) => name === 'audit')[1].data;
    assert.equal(audit.action, 'UPDATE');
    assert.equal(audit.after.operation, 'EXTERNAL_DOCUMENT');
});

test('un número que ya es de otra obligación se rechaza diciendo de quién; el mismo número se conserva al cambiar la fecha', async () => {
    const busy = buildTx({ row: receivable(), taken: { id: 'debt-9', client: { name: 'Bonsai' } } });
    await assert.rejects(recordExternalReceivableDocument(busy.prismaClient, 'debt-1', { number: 401, issuedAt: '2026-07-31' }, { id: 'u' }),
        (error) => error.code === 'RECEIVABLE_NUMBER_TAKEN' && /Bonsai/.test(error.message));
    const own = buildTx({ row: receivable({ number: 380, issuedAt: new Date('2026-07-31T12:00:00Z'), issuedById: 'u-elisa', metadata: { externalDocument: { recordedById: 'u-elisa', recordedAt: '2026-11-13T00:00:00.000Z' } } }) });
    await recordExternalReceivableDocument(own.prismaClient, 'debt-1', { number: 380, issuedAt: '2026-08-02' }, { id: 'u-rodny' });
    assert.ok(!own.calls.some(([name]) => name === 'findFirst'), 'el mismo número no se busca contra sí mismo');
    const update = own.calls.find(([name]) => name === 'update')[1].data;
    assert.equal(update.metadata.externalDocument.recordedById, 'u-elisa', 'quien la anotó no cambia');
    assert.equal(update.metadata.externalDocument.changedById, 'u-rodny');
    assert.equal(update.metadata.externalDocument.previousNumber, 380);
    assert.equal(update.issuedById, 'u-elisa');
});

test('una cuenta emitida por la plataforma no cambia de número por aquí; un préstamo no lleva cuenta de cobro', async () => {
    const issued = buildTx({ row: receivable({ number: 400, issuedAt: new Date(), issuedById: 'u' }) });
    await assert.rejects(recordExternalReceivableDocument(issued.prismaClient, 'debt-1', { number: 380, issuedAt: '2026-07-31' }, { id: 'u' }),
        (error) => error.code === 'RECEIVABLE_ALREADY_ISSUED' && /Corregir/.test(error.message));
    const loan = buildTx({ row: receivable({ kind: 'PRESTAMO' }) });
    await assert.rejects(recordExternalReceivableDocument(loan.prismaClient, 'debt-1', { number: 380, issuedAt: '2026-07-31' }, { id: 'u' }), (error) => error.code === 'RECEIVABLE_LOAN_NO_DOCUMENT');
    await assert.rejects(recordExternalReceivableDocument({}, 'debt-1', { number: 'abc', issuedAt: '2026-07-31' }, { id: 'u' }), (error) => error.code === 'RECEIVABLE_EXTERNAL_DOCUMENT_INVALID');
});

const external = () => receivable({ number: 380, issuedAt: new Date('2026-07-31T12:00:00Z'), metadata: { externalDocument: { recordedById: 'u', recordedAt: 'x' } } });

test('con una hecha en Word no hay PDF ni «Corregir», y emitir dice que ya tiene número', async () => {
    const storage = { get: async () => { throw new Error('no debería leerse'); } };
    await assert.rejects(openReceivablePdf({ accountsReceivable: { findUnique: async () => external() } }, storage, 'debt-1'),
        (error) => error.code === 'RECEIVABLE_DOCUMENT_EXTERNAL' && /No\. 0380/.test(error.message));
    const { prismaClient } = buildTx({ row: { ...external(), items: [] } });
    await assert.rejects(correctReceivableDocument(prismaClient, 'debt-1', { concept: 'X', servicePeriod: 'julio', items: [{ description: 'Fee', amount: 100 }] }, { id: 'u' }),
        (error) => error.code === 'RECEIVABLE_DOCUMENT_EXTERNAL' && /Cambiar número/.test(error.message));
    await assert.rejects(issueReceivableDocument(prismaClient, 'debt-1', { concept: 'X', servicePeriod: 'julio', items: [{ description: 'Fee', amount: 100 }], issuedAt: '2026-07-31' }, { id: 'u' }),
        (error) => error.code === 'RECEIVABLE_ALREADY_ISSUED' && /fuera de la plataforma/.test(error.message));
});

test('el valor de una hecha en Word se corrige con el lápiz, como una sin emitir', async () => {
    const row = external();
    const calls = [];
    const tx = {
        accountsReceivable: { findUnique: async () => row, update: async (args) => { calls.push(args); return { ...row, ...args.data }; } },
        financialPeriod: { findUnique: async () => ({ status: 'OPEN' }) },
        financialAuditEvent: { create: async () => ({ id: 'a' }) }
    };
    await updateReceivable({ $transaction: async (work) => work(tx) }, 'debt-1', { amount: 1200000 }, { id: 'u' });
    assert.equal(Number(calls[0].data.amount), 1200000);
    const issuedHere = { ...row, metadata: {} };
    tx.accountsReceivable.findUnique = async () => issuedHere;
    await assert.rejects(updateReceivable({ $transaction: async (work) => work(tx) }, 'debt-1', { amount: 1300000 }, { id: 'u' }), (error) => error.code === 'RECEIVABLE_ISSUED_IMMUTABLE');
});

test('el estado de cuenta la nombra por su número y la fecha de Word', () => {
    const model = buildClientStatementModel({ name: 'Haad Aesthetic Center' }, [
        external(),
        receivable({ id: 'debt-2', amount: 840000, period: new Date('2026-08-01T12:00:00Z') })
    ], { cutoff: '2026-11-13' });
    assert.deepEqual(model.rows.map((row) => [row.number, row.issued]), [['No. 0380', '31 de julio de 2026'], ['Sin emitir', '1 de agosto de 2026']]);
});

test('la pantalla ofrece «Ya la emití en Word» junto a emitir, y en una anotada «Cambiar número» en vez del PDF', () => {
    const dashboard = readFileSync('src/components/modules/FinancialDashboard.jsx', 'utf8');
    const dialog = readFileSync('src/components/modules/financial/ReceivableExternalDocumentDialog.jsx', 'utf8');
    assert.match(dashboard, /data-receivable-external-record[\s\S]*?>\s*Ya la emití en Word/);
    assert.match(dashboard, /debt\.formattedNumber && debt\.externalDocument \? \(<>[\s\S]*?hecha en Word[\s\S]*?data-receivable-external-change/);
    const externalBranch = dashboard.slice(dashboard.indexOf('data-receivable-external-document'), dashboard.indexOf(': debt.formattedNumber ? (<>'));
    assert.doesNotMatch(externalBranch, /openReceivableDocument|openCorrectDialog/, 'sin PDF ni «Corregir» para una hecha en Word');
    assert.match(dashboard, /debt\.formattedNumber && !debt\.externalDocument && debt\.currency !== 'USD'/, 'el lápiz edita el valor, no abre la corrección del documento');
    assert.match(dialog, /BrainDatePicker/);
    assert.doesNotMatch(dialog, /type="number"|type="date"/);
    assert.match(dialog, /externalDocumentProblem\(form\)/, 'la pantalla frena antes de enviar con la misma regla del servidor');
    const catalog = readFileSync('src/lib/platformCatalog.js', 'utf8');
    assert.match(catalog, /POST \/financials\/receivables\/:id\/external-document/);
});
