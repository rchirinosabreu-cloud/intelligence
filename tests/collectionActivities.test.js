import test from 'node:test';
import assert from 'node:assert/strict';
import { collectionActivityLine, isCollectionChannel, COLLECTION_CHANNELS } from '../src/lib/collectionActivities.js';
import { listCollectionActivities, recordCollectionActivity } from '../src/services/collectionActivityService.js';
import { followUpNotice, currentImportantNotice } from '../src/services/importantNoticeService.js';

// Rodny, 28 de octubre de 2026: «eso debe quedar guardado en algún lugar, esas elecciones de gestión. Debe haber un
// registro». La gestión de cobro queda en la cuenta del cliente, se ve en Cuentas por cobrar y, como en el CRM, una
// gestión registrada saca de la banda el aviso de ese cliente.

const NOW = new Date('2026-10-28T15:00:00Z');
const memoryDb = () => {
    const rows = [];
    const db = {
        rows,
        client: { findUnique: async ({ where }) => ({ 'c-nuva': { id: 'c-nuva', name: 'Muebles Nuva', contracts: [], accountsReceivables: [
            { id: 'm1', status: 'DEBE', amount: 100, period: '2026-08-01', metadata: { collectionMode: 'MENSUAL' } },
            { id: 'm2', status: 'DEBE', amount: 100, period: '2026-09-01', metadata: { collectionMode: 'MENSUAL' } },
            { id: 'p1', status: 'DEBE', amount: 100, period: '2026-09-01', metadata: { collectionMode: 'PUNTUAL' } }
        ] }, 'c-grit': { id: 'c-grit', name: 'Fundación Grit' } })[where.id] || null },
        accountsReceivable: { findUnique: async ({ where }) => (where.id === 'g-1' ? { clientId: 'c-grit', client: { name: 'Fundación Grit' } } : ['m1', 'm2', 'p1'].includes(where.id) ? { clientId: 'c-nuva' } : null) },
        collectionActivity: {
            upsert: async ({ where, create }) => {
                const previous = rows.find((row) => row.noticeId === where.noticeId);
                if (previous) return previous;
                const row = { id: `a${rows.length + 1}`, ...create };
                rows.push(row);
                return row;
            },
            create: async ({ data }) => {
                if (data.noticeId && rows.some((row) => row.noticeId === data.noticeId)) throw Object.assign(new Error('dup'), { code: 'P2002' });
                const row = { id: `a${rows.length + 1}`, ...data };
                rows.push(row);
                return row;
            },
            findMany: async ({ take }) => [...rows].sort((a, b) => b.occurredAt - a.occurredAt).slice(0, take),
            findFirst: async ({ where }) => rows.find((row) => row.clientId === where.clientId && row.receivableId === where.receivableId && row.occurredAt > where.occurredAt.gt) || null
        }
    };
    db.$transaction = async (fn) => fn(db);
    return db;
};

test('los canales son los de la banda y la línea se lee en palabras', () => {
    assert.deepEqual(COLLECTION_CHANNELS.map((channel) => channel.value), ['WHATSAPP', 'LLAMADA', 'CORREO', 'REUNION', 'RESPUESTA_CLIENTE']);
    assert.equal(isCollectionChannel('WHATSAPP'), true);
    assert.equal(isCollectionChannel('FAX'), false);
    assert.equal(collectionActivityLine({ channel: 'WHATSAPP', authorName: 'Elisa Mestra', occurredAt: '2026-10-28T15:00:00Z' }), 'WhatsApp · 28 oct 2026 · Elisa Mestra');
    assert.equal(collectionActivityLine({ channel: 'RESPUESTA_CLIENTE', authorName: null, occurredAt: '2026-10-28T03:00:00Z' }), 'El cliente respondió · 27 oct 2026');
});

test('registrar a mano: cliente real, canal de la lista, a nombre de quien lo hace', async () => {
    const db = memoryDb();
    const actor = { userId: 'u-elisa', name: 'Elisa Mestra' };
    await assert.rejects(recordCollectionActivity(db, { clientId: 'c-nuva', channel: 'FAX' }, actor, { now: NOW }), { statusCode: 400 });
    await assert.rejects(recordCollectionActivity(db, { clientId: 'no-existe', channel: 'WHATSAPP' }, actor, { now: NOW }), { statusCode: 404 });
    const row = await recordCollectionActivity(db, { clientId: 'c-nuva', channel: 'LLAMADA' }, actor, { now: NOW });
    assert.deepEqual([row.clientId, row.channel, row.authorId, row.authorName, row.source], ['c-nuva', 'LLAMADA', 'u-elisa', 'Elisa Mestra', 'MANUAL']);
    const { items } = await listCollectionActivities(db);
    assert.equal(items[0].channelLabel, 'Llamada');
});

test('reintentar una gestión del mismo aviso conserva su autor, momento e identidad', async () => {
    const db = memoryDb();
    const input = { clientId: 'c-grit', receivableId: 'g-1', channel: 'CORREO', noticeId: 'aviso-fijo', source: 'AVISO' };
    const first = await recordCollectionActivity(db, input, { id: 'a', name: 'Persona A' }, { now: NOW });
    const second = await recordCollectionActivity(db, input, { id: 'b', name: 'Persona B' }, { now: new Date(NOW.getTime() + 1000) });
    assert.equal(second?.id, first.id);
    assert.equal(second.authorId, 'a');
    assert.equal(second.occurredAt, NOW);
    assert.equal(db.rows.length, 1);
});

test('la lista declara cuando solo contiene las gestiones más recientes', async () => {
    const data = Array.from({ length: 501 }, (_, index) => ({ id: `a${index}`, clientId: 'c1', channel: 'LLAMADA', occurredAt: NOW }));
    const result = await listCollectionActivities({ collectionActivity: { findMany: async ({ take }) => data.slice(0, take) } });
    assert.equal(result.items.length, 500);
    assert.equal(result.hasMore, true);
    assert.equal(result.limit, 500);
});

// La banda: «Ya le escribí» deja la gestión en la cuenta del cliente (la de la cuenta puntual, en su cliente).
const bandDb = (notice) => {
    const db = memoryDb();
    Object.assign(db, {
        importantNotice: {
            findMany: async () => (notice.resolvedAt ? [] : [notice]),
            findFirst: async ({ where }) => (where.id === notice.id ? notice : null),
            update: async ({ data }) => Object.assign(notice, data)
        },
        notification: { updateMany: async () => ({ count: 0 }) },
        teamMember: { findFirst: async () => ({ role: 'Coordinadora Administrativa y Contable', areas: [] }) },
        collectionSetting: { findUnique: async () => null }
    });
    return db;
};
const elisa = { userId: 'u-elisa', role: 'ADMIN', name: 'Elisa Mestra' };

test('«Ya le escribí» queda guardado en la cuenta del cliente, una sola vez', async () => {
    const monthly = { id: 'aviso-1', userId: 'u-elisa', kind: 'CARTERA_MENSUAL', subjectId: 'c-nuva', createdAt: NOW, resolvedAt: null };
    const db = bandDb(monthly);
    await followUpNotice(db, 'aviso-1', { channel: 'WHATSAPP', receivableIds: ['m1', 'm2'] }, elisa, { now: NOW, log: () => {} });
    assert.deepEqual(db.rows.map((row) => [row.clientId, row.receivableId, row.channel, row.source, row.noticeId]), [
        ['c-nuva', 'm1', 'WHATSAPP', 'AVISO', 'aviso-1:m1'], ['c-nuva', 'm2', 'WHATSAPP', 'AVISO', 'aviso-1:m2']
    ], 'el aviso mensual deja el servicio puntual fuera de la gestión');

    const oneOff = { id: 'aviso-2', userId: 'u-elisa', kind: 'CARTERA_UNICO', subjectId: 'g-1', createdAt: NOW, resolvedAt: null };
    const other = bandDb(oneOff);
    await followUpNotice(other, 'aviso-2', { channel: 'CORREO' }, elisa, { now: NOW, log: () => {} });
    assert.deepEqual(other.rows.map((row) => [row.clientId, row.receivableId]), [['c-grit', 'g-1']]);
});

test('la gestión mensual conserva las obligaciones que se mostraron y no incluye una deuda posterior', async () => {
    const notice = { id: 'aviso-alcance', userId: 'u-elisa', kind: 'CARTERA_MENSUAL', subjectId: 'c-nuva', createdAt: NOW, resolvedAt: null };
    const db = bandDb(notice);
    const shown = (await currentImportantNotice(db, 'u-elisa', NOW, { log: () => {} })).notice;
    assert.deepEqual(shown?.receivableIds, ['m1', 'm2']);
    const findClient = db.client.findUnique;
    db.client.findUnique = async (args) => {
        const client = await findClient(args);
        return client ? { ...client, accountsReceivables: [...(client.accountsReceivables || []), { id: 'm3', status: 'DEBE', amount: 100, period: '2026-10-01', metadata: { collectionMode: 'MENSUAL' } }] } : null;
    };
    await followUpNotice(db, notice.id, { channel: 'LLAMADA', receivableIds: shown.receivableIds }, elisa, { now: NOW, log: () => {} });
    assert.deepEqual(db.rows.map((row) => row.receivableId), ['m1', 'm2']);
});

test('un aviso mensual sin selección o con una obligación fuera del alcance exige releer, sin registrar nada', async () => {
    for (const receivableIds of [undefined, [], ['p1']]) {
        const notice = { id: 'aviso-alcance', userId: 'u-elisa', kind: 'CARTERA_MENSUAL', subjectId: 'c-nuva', createdAt: NOW, resolvedAt: null };
        const db = bandDb(notice);
        await assert.rejects(followUpNotice(db, notice.id, { channel: 'LLAMADA', receivableIds }, elisa, { now: NOW, log: () => {} }), { statusCode: 409 });
        assert.equal(db.rows.length, 0);
        assert.equal(notice.resolvedAt, null);
    }
});

test('una gestión registrada a mano después del aviso lo saca de la banda, como en el CRM', async () => {
    const notice = { id: 'aviso-3', userId: 'u-elisa', kind: 'CARTERA_MENSUAL', subjectId: 'c-nuva', createdAt: new Date('2026-10-27T15:00:00Z'), resolvedAt: null };
    const db = bandDb(notice);
    db.client.findUnique = async () => ({ id: 'c-nuva', name: 'Muebles Nuva', contracts: [{ serviceType: 'PARRILLA', startDate: '2026-01-01' }], accountsReceivables: [
        { id: 'a', kind: 'CLIENTE', status: 'DEBE', amount: 100, period: '2026-08-01', payments: [] },
        { id: 'b', kind: 'CLIENTE', status: 'DEBE', amount: 100, period: '2026-09-01', payments: [] }
    ] });
    assert.equal((await currentImportantNotice(db, 'u-elisa', NOW)).notice?.id, 'aviso-3');
    await recordCollectionActivity(db, { clientId: 'c-nuva', channel: 'LLAMADA' }, elisa, { now: NOW });
    assert.equal((await currentImportantNotice(db, 'u-elisa', NOW, { log: () => {} })).notice, null);
    assert.equal(notice.resolution, 'YA_ATENDIDO');
});
