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
    return {
        rows,
        client: { findUnique: async ({ where }) => ({ 'c-nuva': { id: 'c-nuva', name: 'Muebles Nuva' }, 'c-grit': { id: 'c-grit', name: 'Fundación Grit' } })[where.id] || null },
        accountsReceivable: { findUnique: async ({ where }) => (where.id === 'g-1' ? { clientId: 'c-grit', client: { name: 'Fundación Grit' } } : null) },
        collectionActivity: {
            create: async ({ data }) => {
                if (data.noticeId && rows.some((row) => row.noticeId === data.noticeId)) throw Object.assign(new Error('dup'), { code: 'P2002' });
                const row = { id: `a${rows.length + 1}`, ...data };
                rows.push(row);
                return row;
            },
            findMany: async ({ take }) => [...rows].sort((a, b) => b.occurredAt - a.occurredAt).slice(0, take),
            findFirst: async ({ where }) => rows.find((row) => row.clientId === where.clientId && row.occurredAt > where.occurredAt.gt) || null
        }
    };
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
    await followUpNotice(db, 'aviso-1', { channel: 'WHATSAPP' }, elisa, { now: NOW, log: () => {} });
    assert.deepEqual(db.rows.map((row) => [row.clientId, row.receivableId, row.channel, row.source, row.noticeId]), [['c-nuva', null, 'WHATSAPP', 'AVISO', 'aviso-1']]);

    const oneOff = { id: 'aviso-2', userId: 'u-elisa', kind: 'CARTERA_UNICO', subjectId: 'g-1', createdAt: NOW, resolvedAt: null };
    const other = bandDb(oneOff);
    await followUpNotice(other, 'aviso-2', { channel: 'CORREO' }, elisa, { now: NOW, log: () => {} });
    assert.deepEqual(other.rows.map((row) => [row.clientId, row.receivableId]), [['c-grit', 'g-1']]);
});

test('una gestión registrada a mano después del aviso lo saca de la banda, como en el CRM', async () => {
    const notice = { id: 'aviso-3', userId: 'u-elisa', kind: 'CARTERA_MENSUAL', subjectId: 'c-nuva', createdAt: new Date('2026-10-27T15:00:00Z'), resolvedAt: null };
    const db = bandDb(notice);
    db.client.findUnique = async () => ({ id: 'c-nuva', name: 'Muebles Nuva', accountsReceivables: [
        { id: 'a', kind: 'CLIENTE', status: 'DEBE', amount: 100, period: '2026-08-01', payments: [] },
        { id: 'b', kind: 'CLIENTE', status: 'DEBE', amount: 100, period: '2026-09-01', payments: [] }
    ] });
    assert.equal((await currentImportantNotice(db, 'u-elisa', NOW)).notice?.id, 'aviso-3');
    await recordCollectionActivity(db, { clientId: 'c-nuva', channel: 'LLAMADA' }, elisa, { now: NOW });
    assert.equal((await currentImportantNotice(db, 'u-elisa', NOW, { log: () => {} })).notice, null);
    assert.equal(notice.resolution, 'YA_ATENDIDO');
});
