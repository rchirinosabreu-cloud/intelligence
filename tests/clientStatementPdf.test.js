import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    buildClientStatementModel,
    clientStatementFilename,
    generateClientStatementPdfBuffer,
    openClientStatementPdf
} from '../src/services/clientStatementPdfService.js';
import { DOCUMENT_LOGO } from '../src/services/receivablePdfService.js';

// El documento de seguimiento que Rodny le manda a cada cliente (20 de octubre de 2026:
// «necesito poder tener mi documento de seguimiento y también el poder generarlo»),
// comprobado contra el estado de cuenta real de Salsipuedes con corte al 28 de agosto de
// 2026: dos cuentas de cobro pendientes (0331 y 0345, 2.500.000 cada una), un abono de
// 1.000.000 el 15 de julio y un saldo a pagar de 4.000.000.

const read = (relative) => fs.readFileSync(new URL(relative, import.meta.url), 'utf8');

const salsipuedes = { id: 'c1', name: 'Salsipuedes', legalName: 'SALSIPUEDES S.A.S.', documentType: 'NIT', documentNumber: '900111222' };
const receivables = [
    { id: 'r-0331', number: 331, issuedAt: new Date('2026-04-28T12:00:00Z'), period: new Date('2026-04-01T00:00:00Z'), servicePeriod: '01 de abril al 30 de abril', amount: 2500000, currency: 'COP', status: 'DEBE', kind: 'CLIENTE',
        payments: [{ id: 'p1', kind: 'PAGO', amount: 1000000, paidAt: new Date('2026-07-15T12:00:00Z'), reversedAt: null }] },
    { id: 'r-0345', number: 345, issuedAt: new Date('2026-06-09T12:00:00Z'), period: new Date('2026-05-01T00:00:00Z'), servicePeriod: '01 de mayo al 31 de mayo', amount: 2500000, currency: 'COP', status: 'DEBE', kind: 'CLIENTE', payments: [] },
    // Pagada del todo: no sale en el estado de cuenta.
    { id: 'r-0320', number: 320, issuedAt: new Date('2026-03-28T12:00:00Z'), period: new Date('2026-03-01T00:00:00Z'), servicePeriod: '01 de marzo al 31 de marzo', amount: 2500000, currency: 'COP', status: 'PAGADO', kind: 'CLIENTE',
        payments: [{ id: 'p0', kind: 'PAGO', amount: 2500000, paidAt: new Date('2026-04-10T12:00:00Z'), reversedAt: null }] },
    // Emitida después del corte: tampoco.
    { id: 'r-0360', number: 360, issuedAt: new Date('2026-09-20T12:00:00Z'), period: new Date('2026-08-01T00:00:00Z'), servicePeriod: '01 de agosto al 31 de agosto', amount: 2500000, currency: 'COP', status: 'DEBE', kind: 'CLIENTE', payments: [] }
];

test('el estado de cuenta dice lo mismo que el documento real de Salsipuedes', () => {
    const model = buildClientStatementModel(salsipuedes, receivables, { cutoff: '2026-08-28' });
    assert.equal(model.title, 'ESTADO DE CUENTA');
    assert.equal(model.clientLine, 'Cliente: Salsipuedes');
    assert.equal(model.cutoffLine, 'Fecha de corte: 28 de agosto de 2026');
    assert.deepEqual(model.rows.map((row) => [row.number, row.issued, row.concept, row.formattedAmount]), [
        ['No. 0331', '28 de abril de 2026', 'Del 01 de abril al 30 de abril', '$ 2.500.000'],
        ['No. 0345', '9 de junio de 2026', 'Del 01 de mayo al 31 de mayo', '$ 2.500.000']
    ]);
    assert.equal(model.sum, 5000000);
    assert.equal(model.formattedSum, '$ 5.000.000');
    assert.deepEqual(model.deductions.map((row) => [row.label, row.date, row.formattedAmount]), [['Abono', '15 de julio de 2026', '$ 1.000.000']]);
    assert.equal(model.balance, 4000000);
    assert.equal(model.formattedBalance, '$ 4.000.000');
    assert.match(model.bankLine, /Bancolombia/);
});

test('el corte manda: abonos posteriores no se descuentan y una cuenta pagada después del corte sigue apareciendo', () => {
    const paidLater = receivables.map((row) => (row.id === 'r-0345'
        ? { ...row, status: 'PAGADO', payments: [{ id: 'p9', kind: 'PAGO', amount: 2500000, paidAt: new Date('2026-09-05T12:00:00Z'), reversedAt: null }] }
        : row));
    const model = buildClientStatementModel(salsipuedes, paidLater, { cutoff: '2026-08-28' });
    assert.deepEqual(model.rows.map((row) => row.number), ['No. 0331', 'No. 0345']);
    assert.equal(model.deductions.length, 1);
    assert.equal(model.balance, 4000000);
    const today = buildClientStatementModel(salsipuedes, paidLater, { cutoff: '2026-10-20' });
    assert.deepEqual(today.rows.map((row) => row.number), ['No. 0331', 'No. 0360']);
    assert.equal(today.balance, 4000000);
});

test('un abono revertido no descuenta, un ajuste sin dinero se dice por su nombre y una cuenta sin emitir se rotula', () => {
    const rows = [
        { id: 'r-a', number: null, issuedAt: null, period: new Date('2026-09-01T00:00:00Z'), servicePeriod: null, amount: 1000000, currency: 'COP', status: 'DEBE', kind: 'CLIENTE',
            payments: [
                { id: 'p1', kind: 'PAGO', amount: 300000, paidAt: new Date('2026-09-10T12:00:00Z'), reversedAt: new Date('2026-09-11T12:00:00Z') },
                { id: 'p2', kind: 'ACUERDO', amount: 200000, paidAt: new Date('2026-09-12T12:00:00Z'), reversedAt: null }
            ] }
    ];
    const model = buildClientStatementModel(salsipuedes, rows, { cutoff: '2026-10-20' });
    assert.equal(model.rows[0].number, 'Sin emitir');
    assert.equal(model.rows[0].concept, 'Septiembre de 2026');
    assert.equal(model.rows[0].issued, '1 de septiembre de 2026');
    assert.deepEqual(model.deductions.map((row) => row.label), ['Acuerdo por menor valor']);
    assert.equal(model.balance, 800000);
});

test('sin nada pendiente el documento lo dice, y el nombre del archivo lleva cliente y corte', () => {
    const model = buildClientStatementModel(salsipuedes, [], { cutoff: '2026-08-28' });
    assert.equal(model.rows.length, 0);
    assert.equal(model.balance, 0);
    assert.equal(model.emptyLine, 'Sin cuentas de cobro pendientes a la fecha de corte.');
    assert.equal(clientStatementFilename(salsipuedes, '2026-08-28'), 'Estado de cuenta - Salsipuedes - 28 de agosto de 2026.pdf');
});

test('el PDF se genera con las fuentes de la casa y es un PDF de verdad', () => {
    const buffer = generateClientStatementPdfBuffer(buildClientStatementModel(salsipuedes, receivables, { cutoff: '2026-08-28' }));
    assert.ok(Buffer.isBuffer(buffer));
    assert.equal(buffer.subarray(0, 5).toString(), '%PDF-');
    assert.ok(buffer.length > 5000);
});

test('openClientStatementPdf lee la ficha y las obligaciones vivas del cliente, nunca las de otro', async () => {
    const calls = [];
    const prismaClient = {
        client: { findUnique: async (args) => { calls.push(['client', args]); return salsipuedes; } },
        accountsReceivable: { findMany: async (args) => { calls.push(['receivables', args]); return receivables; } }
    };
    const result = await openClientStatementPdf(prismaClient, 'c1', { cutoff: '2026-08-28' });
    assert.equal(calls.find(([name]) => name === 'receivables')[1].where.clientId, 'c1');
    assert.equal(result.filename, 'Estado de cuenta - Salsipuedes - 28 de agosto de 2026.pdf');
    assert.equal(result.buffer.subarray(0, 5).toString(), '%PDF-');
    await assert.rejects(openClientStatementPdf({ client: { findUnique: async () => null }, accountsReceivable: { findMany: async () => [] } }, 'nope', {}), (error) => error.code === 'FINANCIAL_CLIENT_NOT_FOUND');
    await assert.rejects(openClientStatementPdf(prismaClient, 'c1', { cutoff: 'ayer' }), (error) => error.code === 'STATEMENT_CUTOFF_INVALID');
});

// El logo de los papeles es el horizontal con el nombre (Rodny, 20 de octubre de 2026: «este es el
// logo de los documentos, estás poniendo un logo que no es»); el cuadrado es el icono de la aplicación.
test('la cuenta de cobro y el estado de cuenta llevan el logo horizontal de los documentos, con su proporción', () => {
    assert.equal(DOCUMENT_LOGO.file, '../../public/brainstudio-logo-horizontal.png');
    assert.ok(fs.existsSync(new URL('../public/brainstudio-logo-horizontal.png', import.meta.url)));
    assert.ok(Math.abs(DOCUMENT_LOGO.width / DOCUMENT_LOGO.height - 426 / 153) < 0.01, 'el ancho y el alto guardan la proporción del archivo');
    const statement = read('../src/services/clientStatementPdfService.js');
    const receivable = read('../src/services/receivablePdfService.js');
    assert.match(statement, /drawDocumentLogo\(doc\)/);
    assert.match(receivable, /drawDocumentLogo\(doc\)/);
    assert.doesNotMatch(statement, /brainstudio-logo\.png|'BRAIN STUDIO'/, 'ni el icono cuadrado ni el rótulo escrito a mano');
    assert.doesNotMatch(receivable, /brainstudio-logo\.png|'BRAIN STUDIO'/, 'ni el icono cuadrado ni el rótulo escrito a mano');
});

test('la ruta, el catálogo y la pantalla conocen el estado de cuenta en PDF', () => {
    assert.match(read('../src/routes/api/financials.js'), /'\/clients\/:clientId\/statement\/document', requireFinancialAccess/);
    assert.match(read('../src/lib/platformCatalog.js'), /statement\\\/document/);
    const dialog = read('../src/components/modules/financial/ClientFinancialStatementDialog.jsx');
    assert.match(dialog, /BrainDatePicker/);
    assert.match(dialog, /Fecha de corte/);
    assert.match(dialog, /onOpenDocument/);
    const dashboard = read('../src/components/modules/FinancialDashboard.jsx');
    assert.match(dashboard, /openClientStatementDocument/);
    assert.match(dashboard, /data-receivable-statement/, 'desde Cartera se abre el estado de cuenta del cliente');
});
