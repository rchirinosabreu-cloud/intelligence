import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { clientCollectionAlerts, overdueReceivables } from '../src/lib/receivableCollections.js';
import { suspensionCandidate } from '../src/lib/clientSuspension.js';
import { isOpenDebt, summarizeAging } from '../src/lib/debtAging.js';
import { collectionArchiveProblem, isCollectionArchived } from '../src/lib/receivableArchive.js';
import { setReceivableCollectionArchive } from '../src/services/financialReceivableService.js';

// Elisa y Rodny, 11 de noviembre de 2026: «esas deudas que se vienen arrastrando de periodos anteriores no
// eliminarlas, sino que no aparezcan en las notificaciones … que dé una opción de archivarlas». Una cuenta
// archivada sigue en Cartera con su saldo y su historia; deja de avisarse, de suspender y de contar como vencida.

const settings = { enabled: true, paymentTermDays: 15, monthlyAlertCount: 2, oneOffFirstAlertDays: 15, repeatDays: 7 };
const archived = { collectionArchive: { archivedAt: '2026-11-11T14:00:00.000Z', reason: 'Deuda de 2024 en revisión' } };
const enero = { id: 'enero', kind: 'CLIENTE', status: 'DEBE', amount: 300000, period: '2026-01-01T00:00:00Z', payments: [] };
const febrero = { ...enero, id: 'febrero', period: '2026-02-01T00:00:00Z' };

test('una cuenta archivada no vence, no avisa y no cuenta para suspender', () => {
    const today = '2026-11-11';
    assert.equal(overdueReceivables([enero], today, settings).length, 1);
    assert.equal(overdueReceivables([{ ...enero, metadata: archived }], today, settings).length, 0);
    assert.equal(clientCollectionAlerts({ clientId: 'c', receivables: [{ ...enero, metadata: archived }], today, settings }).length, 0);
    assert.equal(clientCollectionAlerts({ clientId: 'c', receivables: [enero], today, settings }).length, 1, 'sin archivar sí avisa');
    assert.ok(suspensionCandidate({ receivables: [enero, febrero], today, settings }));
    assert.equal(suspensionCandidate({ receivables: [enero, febrero].map(item => ({ ...item, metadata: archived })), today, settings }), null);
});

test('la antigüedad de lo vencido no la cuenta, aunque siga en Cartera con su saldo', () => {
    const open = { status: 'DEBE', outstanding: 300000, period: '2026-01-01', clientId: 'c' };
    assert.equal(isOpenDebt(open), true);
    assert.equal(isOpenDebt({ ...open, ...archived }), false);
    assert.equal(summarizeAging([open, { ...open, ...archived }], { today: '2026-11-11' }).total, 300000);
    assert.equal(isCollectionArchived({ metadata: archived }), true);
    assert.equal(isCollectionArchived(archived), true, 'también la respuesta ya serializada');
    assert.match(collectionArchiveProblem({ reason: ' ' }), /motivo|por qué/i);
});

const fakeDb = (row) => {
    const calls = [];
    const tx = {
        accountsReceivable: { findUnique: async () => row, update: async ({ data }) => { calls.push(['update', data]); Object.assign(row, data); return row; } },
        user: { findUnique: async () => ({ name: 'Elisa Mestra' }) },
        financialAuditEvent: { create: async ({ data }) => { calls.push(['audit', data]); return {}; } }
    };
    return { calls, db: { $transaction: async (work) => work(tx) } };
};

test('archivar pide motivo, guarda quién y por qué, y desarchivar conserva la historia', async () => {
    const row = { id: 'r1', status: 'DEBE', amount: 300000, metadata: { createdBy: 'x' } };
    const { calls, db } = fakeDb(row);
    await assert.rejects(setReceivableCollectionArchive(db, 'r1', { archived: true, reason: '' }, { id: 'u' }), { code: 'RECEIVABLE_ARCHIVE_REASON_REQUIRED' });
    await setReceivableCollectionArchive(db, 'r1', { archived: true, reason: 'Deuda de 2024 en revisión' }, { id: 'u' });
    assert.equal(row.metadata.createdBy, 'x', 'no pisa el resto de la metadata');
    assert.equal(row.metadata.collectionArchive.reason, 'Deuda de 2024 en revisión');
    assert.equal(row.metadata.collectionArchive.archivedByName, 'Elisa Mestra');
    assert.equal(row.amount, 300000, 'no cambia el valor ni el saldo');
    assert.equal(calls.find(([name]) => name === 'audit')[1].after.operation, 'COLLECTION_ARCHIVED');

    const before = calls.length;
    await setReceivableCollectionArchive(db, 'r1', { archived: true, reason: 'otra vez' }, { id: 'u' });
    assert.equal(calls.length, before, 'archivar lo ya archivado no escribe nada');

    await setReceivableCollectionArchive(db, 'r1', { archived: false }, { id: 'u' });
    assert.equal(row.metadata.collectionArchive, undefined);
    assert.equal(row.metadata.collectionArchiveHistory.length, 1);
    assert.equal(row.metadata.collectionArchiveHistory[0].reason, 'Deuda de 2024 en revisión');
    assert.equal(calls.at(-1)[1].after.operation, 'COLLECTION_UNARCHIVED');
});

test('una cuenta pagada no se archiva', async () => {
    const { db } = fakeDb({ id: 'r2', status: 'PAGADO', amount: 1, metadata: null });
    await assert.rejects(setReceivableCollectionArchive(db, 'r2', { archived: true, reason: 'x' }, { id: 'u' }), { code: 'RECEIVABLE_ARCHIVE_CLOSED' });
});

test('Cartera ofrece «Archivar del cobro», muestra la marca y la ruta está descrita para Bria', () => {
    const dashboard = fs.readFileSync(new URL('../src/components/modules/FinancialDashboard.jsx', import.meta.url), 'utf8');
    assert.match(dashboard, /data-receivable-archive\b/);
    assert.match(dashboard, /data-receivable-archived/);
    assert.match(dashboard, /data-receivable-unarchive/);
    assert.match(dashboard, /\/api\/financials\/receivables\/\$\{debt\.id\}\/collection-archive/);
    assert.match(fs.readFileSync(new URL('../src/routes/api/financials.js', import.meta.url), 'utf8'), /router\.post\('\/receivables\/:id\/collection-archive', requireFinancialWrite, archiveFinancialReceivable\)/);
    assert.match(fs.readFileSync(new URL('../src/lib/platformCatalog.js', import.meta.url), 'utf8'), /'POST \/financials\/receivables\/:id\/collection-archive'/);
});
