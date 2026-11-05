import test from 'node:test';
import assert from 'node:assert/strict';
import { createReceivable, updateReceivable } from '../src/services/financialReceivableService.js';
import { clientCollectionAlerts, collectionNoticeText, DEFAULT_COLLECTION_SETTINGS } from '../src/lib/receivableCollections.js';
import { hasCollectionActivitySince, recordCollectionActivity } from '../src/services/collectionActivityService.js';
import { collectionStillDue, collectionNoticeReceivableIds } from '../src/services/collectionState.js';

const actor = { id: 'u1', name: 'Administración' };
const input = { clientId: 'c1', amount: 1000, period: '2026-08-01', collectionMode: 'MENSUAL' };
const rec = (id, mode, period = '2026-08-01') => ({ id, clientId: 'c1', kind: 'CLIENTE', status: 'DEBE', amount: 1000, period, dueDate: period, metadata: mode ? { collectionMode: mode } : {}, payments: [] });
const dbFor = (existing) => {
    const writes = [];
    const tx = {
        financialPeriod: { findUnique: async () => null },
        client: { findUnique: async () => ({ id: 'c1', name: 'Cliente de prueba' }) },
        collectionActivity: { create: async ({ data }) => ({ id: 'activity', ...data }) },
        accountsReceivable: {
            findUnique: async () => existing,
            create: async ({ data }) => { writes.push(data); return { id: 'r1', ...data }; },
            update: async ({ data }) => { writes.push(data); return { ...existing, ...data }; }
        },
        financialAuditEvent: { create: async ({ data }) => { writes.push(data); } }
    };
    return { ...tx, writes, $transaction: async (fn) => fn(tx) };
};

test('la modalidad elegida queda en la obligación y su auditoría, sin deducir el legado', async () => {
    const db = dbFor();
    const created = await createReceivable(db, input, actor);
    assert.equal(created.metadata.collectionMode, 'MENSUAL');
    assert.equal(db.writes[1].after.metadata.collectionMode, 'MENSUAL');
    const legacy = await createReceivable(dbFor(), { ...input, collectionMode: undefined }, actor);
    assert.equal(legacy.metadata.collectionMode ?? null, null);
});

test('clasificar una cuenta conserva los demás metadatos y registra antes/después', async () => {
    const existing = { ...rec('r1'), metadata: { importedFrom: 'historico' } };
    const db = dbFor(existing);
    const result = await updateReceivable(db, 'r1', { collectionMode: 'PUNTUAL' }, actor);
    assert.equal(result.metadata.collectionMode, 'PUNTUAL');
    assert.equal(result.metadata.importedFrom, 'historico');
    assert.equal(db.writes[1].before.metadata.collectionMode, undefined);
    assert.equal(db.writes[1].after.metadata.collectionMode, 'PUNTUAL');
});

test('solo admite modalidades conocidas y no convierte una cuota de formalización en mensualidad', async () => {
    await assert.rejects(createReceivable(dbFor(), { ...input, collectionMode: 'OTRA' }, actor), { code: 'RECEIVABLE_COLLECTION_MODE_INVALID' });
    const existing = { ...rec('r1'), metadata: { origin: 'FORMALIZACION', quotationId: 'q1', installmentId: 'i1' } };
    await assert.rejects(updateReceivable(dbFor(existing), 'r1', { collectionMode: 'MENSUAL' }, actor), { code: 'RECEIVABLE_COLLECTION_MODE_LOCKED' });
});

test('las modalidades de cada deuda prevalecen sobre el contrato general y no se mezclan', () => {
    const args = { clientId: 'c1', monthly: false, today: '2026-10-20', settings: DEFAULT_COLLECTION_SETTINGS };
    const receivables = [rec('m1', 'MENSUAL'), rec('m2', 'MENSUAL', '2026-09-01'), rec('p1', 'PUNTUAL'), rec('q1', 'CUOTA')];
    const alerts = clientCollectionAlerts({ ...args, receivables });
    assert.deepEqual(alerts.map((a) => [a.kind, a.receivableIds]), [['MENSUAL', ['m1', 'm2']], ['UNICO', ['p1']], ['UNICO', ['q1']]]);
    assert.match(collectionNoticeText(alerts[0], 'Cliente').message, /2 mensualidades/);
    assert.equal(collectionNoticeText(alerts[2], 'Cliente').label, 'Cartera · cuota');
    assert.deepEqual(clientCollectionAlerts({ ...args, monthly: true, receivables: [rec('p1', 'PUNTUAL'), rec('q1', 'CUOTA')] }).map((a) => a.kind), ['UNICO', 'UNICO']);
});

test('una cuenta sin clasificar conserva la cadencia heredada y el texto neutral', () => {
    const alerts = clientCollectionAlerts({ clientId: 'c1', monthly: true, today: '2026-10-20', receivables: [rec('m1', 'MENSUAL'), rec('old', null, '2026-09-01')] });
    assert.equal(alerts[0].unclassified, true);
    assert.match(collectionNoticeText(alerts[0], 'Cliente').message, /cuentas vencidas/);
});

test('registrar una gestión específica exige que la obligación exista y sea del cliente', async () => {
    await assert.rejects(recordCollectionActivity(dbFor({ id: 'x', clientId: 'otro' }), { clientId: 'c1', receivableId: 'x', channel: 'WHATSAPP' }, actor), { statusCode: 409 });
    await assert.rejects(recordCollectionActivity(dbFor(null), { clientId: 'c1', receivableId: 'x', channel: 'WHATSAPP' }, actor), { statusCode: 404 });
});

const activityDb = (rows) => ({ collectionActivity: {
    findFirst: async ({ where }) => rows.find((row) => row.clientId === where.clientId && row.occurredAt > where.occurredAt.gt && (where.receivableId === undefined || row.receivableId === where.receivableId)) || null
} });
const since = new Date('2026-11-01T00:00:00Z');
const activity = (receivableId) => ({ clientId: 'c1', receivableId, occurredAt: new Date('2026-11-02T00:00:00Z') });

test('cobrar una cuota no atiende otra ni un aviso que contiene más deudas', async () => {
    const db = activityDb([activity('r1')]);
    assert.equal(await hasCollectionActivitySince(db, 'c1', since, ['r1']), true);
    assert.equal(await hasCollectionActivitySince(db, 'c1', since, ['r2']), false);
    assert.equal(await hasCollectionActivitySince(db, 'c1', since, ['r1', 'r2']), false);
    assert.equal(await hasCollectionActivitySince(db, 'c1', since), false, 'sin ids solo una gestión general cubre el cliente');
    assert.equal(await hasCollectionActivitySince(activityDb([activity('r1'), activity('r2')]), 'c1', since, ['r1', 'r2']), true);
    assert.equal(await hasCollectionActivitySince(activityDb([activity(null)]), 'c1', since, ['r2']), true);
});

test('la banda de una obligación solo se retira por una gestión que la incluya', async () => {
    const db = { ...activityDb([activity('r1')]), accountsReceivable: { findUnique: async () => ({ ...rec('r2', 'CUOTA'), client: { name: 'Cliente' } }) } };
    const notice = { kind: 'CARTERA_UNICO', subjectId: 'r2', createdAt: since };
    const result = await collectionStillDue(db, notice, new Date('2026-11-04T15:00:00Z'));
    assert.notEqual(result?.reason, 'GESTION');
    db.accountsReceivable.findUnique = async () => ({ ...rec('r1', 'CUOTA'), client: { name: 'Cliente' } });
    assert.equal((await collectionStillDue(db, { ...notice, subjectId: 'r1' }, new Date('2026-11-04T15:00:00Z')))?.reason, 'GESTION');
});

test('reclasificar una deuda a mensual retira su aviso individual aunque el umbral sea una mensualidad', async () => {
    const db = { accountsReceivable: { findUnique: async () => ({ ...rec('m1', 'MENSUAL'), client: { name: 'Cliente' } }) },
        collectionSetting: { findUnique: async () => ({ ...DEFAULT_COLLECTION_SETTINGS, monthlyAlertCount: 1 }) } };
    const result = await collectionStillDue(db, { kind: 'CARTERA_UNICO', subjectId: 'm1', createdAt: since }, new Date('2026-11-04T15:00:00Z'));
    assert.equal(result?.reason, 'RECALCULADO');
});

test('la propuesta de suspensión reconoce cobertura completa y conserva la banda ante gestión parcial o ajena', async () => {
    const now = new Date('2026-11-04T15:00:00Z');
    const notice = { kind: 'CARTERA_SUSPENSION', subjectId: 'c1', createdAt: since };
    for (const [ids, expectedReason] of [[['r1', 'r2'], 'GESTION'], [['r1'], null], [['otra-cuota'], null]]) {
        const db = { ...activityDb(ids.map(activity)), client: { findUnique: async () => ({ name: 'Cliente', suspensions: [],
            accountsReceivables: [rec('r1', 'MENSUAL'), rec('r2', 'CUOTA', '2026-09-01'), rec('futura', 'CUOTA', '2026-12-01')] }) } };
        const result = await collectionStillDue(db, notice, now);
        assert.equal(result?.reason ?? null, expectedReason, `gestiones: ${ids.join(', ')}`);
    }
});

test('el nuevo recordatorio de suspensión evalúa exactamente las obligaciones de su candidato vigente', async () => {
    const db = { client: { findUnique: async () => ({ accountsReceivables: [
        rec('r1', 'MENSUAL'), rec('r2', 'CUOTA', '2026-09-01'), rec('futura', 'CUOTA', '2026-12-01')
    ] }) } };
    assert.deepEqual(await collectionNoticeReceivableIds(db, { kind: 'CARTERA_SUSPENSION', subjectId: 'c1' }, new Date('2026-11-04T15:00:00Z')), ['r1', 'r2']);
});
